import { TAU, angleDiff, angleTo, dist2 } from '../../core/math';
import { C } from '../../gfx/palette';
import type { PBullet } from '../../game/bullets';
import { moveBody } from '../../game/collision';
import { damageEnemy, explode, spawnShot } from '../../game/combat';
import type { Enemy } from '../../game/enemy';
import type { Game } from '../../game/game';
import type { ItemDef } from '../../game/items';
import { nearestFoe, shotDmg, shotFrom } from '../../game/minions';
import { addObj } from '../../game/objects';
import { ring } from '../../game/patterns';
import { STACK_COLOR, STACK_LIT, STACK_SEEK, addStack, bossLike, isFoe, isNormal, stackCount } from '../../game/status';
import type { Stats } from '../../game/stats';
import { asActor, snapEnemy } from '../../game/team';
import { addZone } from '../../game/zones';
import { SYN, hasSyn, ringShots, stun } from './common';

// Предметы наборов врагов IV класса (редкость 4, нестабильные): Сорванный (киборг), Механоид (робот),
// и два предмета общего пула редкости 4. Числа — заметка «Наборы врагов — этап 12».

STACK_COLOR.set('bearing', C.yellow);
STACK_LIT.add('bearing');
STACK_SEEK.add('bearing');

// ---------------------------------------------------------------- Сорванный

/** Фаза «Петли срыва» по времени цикла: гон 0–1,5 с, вихрь 1,5–3,5 с, выплеск в 3,5 с, затишье до 5 с */
function loopPhase(t: number): 'rush' | 'vortex' | 'calm' {
  if (t < 1.5) return 'rush';
  if (t < 3.5) return 'vortex';
  return 'calm';
}

function loopTick(g: Game, dt: number) {
  const p = g.player;
  if (!g.inCombat()) {
    g.mem.loopT = 0;
    p.setBuff('loopRush', false, loopRush);
    return;
  }
  const before = g.mem.loopT ?? 0;
  const t = (before + dt) % 5;
  g.mem.loopT = t;
  p.setBuff('loopRush', loopPhase(t) === 'rush', loopRush);
  if (before < 3.5 && (t >= 3.5 || t < before)) surge(g);
}

const loopRush = (s: Stats) => {
  s.speed *= 1.35;
  s.damageMult *= 1.25;
};

/** Выплеск: кольцо из 20 снарядов (70%); «Полный срыв» — сорванные бьют кольцом; «Без поводка» — бросок цепи */
function surge(g: Game) {
  const p = g.player;
  ringShots(g, p.x, p.y - 3, 20, { dmg: shotDmg(g) * 0.7, r: 2.2, life: 0.8, maxLife: 0.8, speed: 260, tag: 'surge', color: C.red });
  g.fx.ring(p.x, p.y, C.red, 30, 0.3);
  if (hasSyn(g, SYN.snap1)) {
    for (const a of g.enemies) {
      if (a.dead || a.team !== 'ally' || a.summon) continue;
      asActor(g, a, () => ring(g, a.x, a.y, 12, 110, Math.random(), { skin: 'small' }));
    }
  }
  if (hasSyn(g, SYN.snap2)) {
    const t = nearestFoe(g, p.x, p.y, 260);
    if (t) throwChain(g, angleTo(p.x, p.y, t.x, t.y), 30 * p.stats.damageMult);
  }
}

/** Бросок цепи «Обрыв»: 170 по прицелу, пробивает всех; в конце волна 30 (50%, отброс) */
function throwChain(g: Game, a: number, dmg: number) {
  const p = g.player;
  const speed = 420, life = 170 / speed;
  spawnShot(g, a, p.stats, {
    x: p.x, y: p.y - 3, bx: p.x, by: p.y - 3, speed, life, maxLife: life, dmg, pierce: 999, r: 4,
    style: 'disc', color: C.steelL, tag: 'chain', split: 0, explode: 0, homing: 0, wave: 0, orbitR: 0, boomerang: false, bounce: 0,
    onEnd(g, b) {
      g.fx.ring(b.x, b.y, C.steelL, 30, 0.3);
      for (const e of g.enemies) {
        if (!isFoe(e) || dist2(e.x, e.y, b.x, b.y) > (30 + e.r) ** 2) continue;
        damageEnemy(g, e, dmg * 0.5, b.x, b.y, { source: 'other', tag: 'chain', knockback: 160, silent: true });
      }
    },
  });
}

interface Debt {
  t: number;
  kills: number;
  hits: number;
}

/** Долг списан: убийства или попадания по боссу */
function payDebt(g: Game) {
  const p = g.player;
  g.mem.debt = null;
  g.fx.ring(p.x, p.y, C.yellow, 18, 0.35);
}

// ---------------------------------------------------------------- Механоид

/** Пара ракет «Вилки» с двух флангов: сходятся на цели (взрыв 26, ×4); цель погибла — взрываются на месте */
export function forkPair(g: Game, e: Enemy, dmg = shotDmg(g) * 4) {
  const p = g.player;
  const base = angleTo(p.x, p.y, e.x, e.y);
  for (const side of [-1, 1]) {
    const sa = base + (side * Math.PI) / 2;
    const x = e.x + Math.cos(sa) * 90, y = e.y + Math.sin(sa) * 90;
    shotFrom(g, x, y, sa + Math.PI, {
      speed: 230, life: 1.5, maxLife: 1.5, arc: 4, dmg, r: 2, style: 'rocket', color: C.amber, tag: 'fork', split: 0, explode: 0, homing: 0,
      data: { target: e },
      step(g, b) {
        const t = b.data!.target as Enemy;
        if (t.dead || dist2(b.x, b.y, t.x, t.y) < (t.r + 3) ** 2) {
          b.dead = true;
          forkBoom(g, b);
          return;
        }
        b.angle = angleTo(b.bx, b.by, t.x, t.y);
      },
      onEnd: (g, b) => forkBoom(g, b),
    });
  }
}

function forkBoom(g: Game, b: PBullet) {
  if (b.data?.boomed) return;
  b.data!.boomed = true;
  explode(g, b.x, b.y, 26, b.dmg, C.amber, 'fork');
}

/** Снаряд колонны: каждое следующее попадание колонны в ту же цель сильнее на 40% */
function columnHit(g: Game, b: PBullet, e: Enemy) {
  const col = b.data?.col as { hits: Map<Enemy, number> } | undefined;
  if (!col) return;
  const n = col.hits.get(e) ?? 0;
  col.hits.set(e, n + 1);
  if (n > 0 && !e.dead) damageEnemy(g, e, b.dmg * (Math.pow(1.4, n) - 1), b.x, b.y, { silent: true, tag: 'column' });
}

/** «КАЗ» готов */
function apsReady(g: Game): boolean {
  return g.time >= (g.mem.apsT ?? -99);
}

/** Самонаводящаяся ракета боекомплекта: взрыв 20, урон 12 */
function ammoRocket(g: Game, a: number) {
  const p = g.player;
  const boom = (g: Game, b: PBullet) => {
    if (b.data?.boomed) return;
    (b.data ??= {}).boomed = true;
    explode(g, b.x, b.y, 20, 12 * g.player.stats.damageMult, C.amber, 'ammo');
  };
  shotFrom(g, p.x, p.y - 3, a, {
    speed: 240, homing: 4, life: 1.6, maxLife: 1.6, dmg: 0.01, r: 2, style: 'rocket', color: C.amber, tag: 'ammo', split: 0, explode: 0,
    onHitEnemy: boom, onEnd: boom,
  });
}

// ---------------------------------------------------------------- общий пул

/** «Ковровый удар»: метки на линии стрельбы, через 0,5 с — 6 взрывов (радиус 22, урон 14) */
function carpet(g: Game, a: number) {
  const p = g.player;
  for (let i = 0; i < 6; i++) {
    const d = 40 + i * 45;
    addObj(g, {
      kind: 'carpet', x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: 22, life: 0.5, layer: 'air',
      onExpire: (g, o) => explode(g, o.x, o.y, 22, 14 * g.player.stats.damageMult, C.red, 'carpet'),
      draw(g, o, ctx, x, y) {
        ctx.strokeStyle = Math.floor(g.time * 16) % 2 ? C.red : C.redL;
        ctx.beginPath();
        ctx.arc(x, y, o.r * (1 - o.t / o.life) + 2, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = C.redL;
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      },
    });
  }
}

/** «Накал»: +2% скорости и +3% урона за заряд */
function heatBuff(n: number) {
  return n > 0
    ? (s: Stats) => {
        s.speed *= 1 + 0.02 * n;
        s.damageMult *= 1 + 0.03 * n;
      }
    : null;
}

function setHeat(g: Game, n: number) {
  n = Math.max(0, Math.min(10, n));
  if (n === (g.mem.heatN ?? 0)) return;
  g.mem.heatN = n;
  g.player.putBuff('heatPack', heatBuff(n));
}

// ---------------------------------------------------------------- предметы

export const CLASS4: ItemDef[] = [
  // ================================================================ Сорванный
  {
    id: 'iSnapLoop', kind: 'implant', slot: 'nervous', quality: 4, unstable: 2, tags: ['neural'], fromEnemy: 'psycho',
    name: { ru: 'Петля срыва', en: 'Snap Loop' },
    desc: {
      ru: 'В бою цикл 5 с: гон 1,5 с (скорость +35%, урон +25%) → вихрь 2 с (залп закручивается двойной спиралью) → выплеск: кольцо из 20 снарядов (70% урона).',
      en: 'In combat, a 5 s cycle: a 1.5 s rush (speed +35%, damage +25%) → a 2 s vortex (your volleys twist into a double spiral) → an outburst: a ring of 20 shots (70% damage).',
    },
    icon: { shape: 'brain', color: C.violet, accent: C.redL },
    hooks: {
      tick: loopTick,
      onVolleyShot(g, b) {
        if (loopPhase(g.mem.loopT ?? 0) !== 'vortex' || !g.inCombat()) return;
        // двойная спираль: снаряды закручиваются поочерёдно в обе стороны
        g.mem.loopSide = -(g.mem.loopSide ?? 1);
        b.spiral = 3.2 * g.mem.loopSide;
      },
      gauge: (g) => (g.inCombat() ? { kind: 'ring', color: loopPhase(g.mem.loopT ?? 0) === 'rush' ? C.red : C.redD, k: (g.mem.loopT ?? 0) / 5 } : null),
    },
  },
  {
    id: 'iSnapRam', kind: 'implant', slot: 'torso', quality: 4, unstable: 2, tags: ['heavy'], fromEnemy: 'psycho',
    name: { ru: 'Кираса «Таран»', en: '"Ram" Cuirass' },
    desc: {
      ru: 'Касание обычного врага не ранит вас — вы сносите его телом (×3 урона, отброс; раз в 0,6 с на врага). Боссы и пули ранят как обычно.',
      en: 'Touching a normal enemy does not hurt you — you bowl it over (×3 damage, knockback; once per 0.6 s per enemy). Bosses and bullets hurt as usual.',
    },
    icon: { shape: 'shield', color: C.red, accent: C.steel },
    hooks: {
      onIncoming(g, hit) {
        const e = hit.enemy;
        if (hit.kind !== 'contact' || !e) return false;
        // «Без поводка»: пока горит долг, сносит и тяжёлых
        const heavyOk = hasSyn(g, SYN.snap2) && !!g.mem.debt;
        if (!(isNormal(e) || (heavyOk && !bossLike(e)))) return false;
        if (g.time - (e.mem.ramT ?? -9) >= 0.6) {
          e.mem.ramT = g.time;
          const p = g.player;
          damageEnemy(g, e, shotDmg(g) * 3, p.x, p.y, { source: 'melee', tag: 'ram', knockback: 220 });
          g.fx.burst(e.x, e.y, C.red, 6, 70, 0.25, 1, true);
        }
        return 'pass';
      },
    },
  },
  {
    id: 'iSnapSocket', kind: 'implant', slot: 'head', quality: 4, unstable: 1, tags: ['neural'], fromEnemy: 'psycho',
    name: { ru: 'Бешеный разъём', en: 'Rabid Socket' },
    desc: {
      ru: 'Враги, задетые сбоем (F), на 4 с срываются с поводка: бросаются на ближайшего врага и стреляют по нему; боссы замедляются на 40%.',
      en: 'Enemies caught by your glitch (F) slip their leash for 4 s: they lunge at the nearest enemy and shoot it; bosses are slowed by 40%.',
    },
    icon: { shape: 'chip', color: C.red, accent: C.violet },
    hooks: {
      onGlitch(g) {
        const p = g.player, R = p.stats.glitchRadius;
        for (const e of g.enemies) {
          if (e.dead || e.spawn > 0 || e.team !== 'foe' || dist2(e.x, e.y, p.x, p.y) > (R + e.r) ** 2) continue;
          if (bossLike(e)) {
            e.slowK = Math.max(e.slowT > 0 ? e.slowK : 0, 0.4);
            e.slowT = Math.max(e.slowT, 4);
          } else if (snapEnemy(g, e, 4)) e.mem.snapBy = 'socket';
        }
      },
    },
  },
  {
    id: 'iSnapDebt', kind: 'implant', slot: 'blood', quality: 4, unstable: 2, tags: ['mutation'], fromEnemy: 'psycho',
    name: { ru: '«Долг боли»', en: '"Pain Debt"' },
    desc: {
      ru: 'Попадание, отнимающее жизнь, становится долгом — красный таймер 3 с: 2 убийства (в бою с боссом — 12 попаданий по нему) списывают долг, иначе жизнь теряется. Не чаще раза в 20 с; после щита и уклонения, до аварийного окна сбоя.',
      en: 'A hit that would cost a life becomes a debt — a red 3 s timer: 2 kills (in a boss fight — 12 hits on it) pay it off, otherwise the life is lost. At most once per 20 s; after shield and dodge, before the glitch emergency window.',
    },
    icon: { shape: 'heart', color: C.blood, accent: C.redL },
    hooks: {
      onLifeHit(g) {
        if (g.mem.debt || g.time - (g.mem.debtT ?? -99) < 20) return false;
        g.mem.debtT = g.time;
        g.mem.debt = { t: 3, kills: 0, hits: 0 } satisfies Debt;
        g.player.invuln = Math.max(g.player.invuln, 1);
        g.fx.ring(g.player.x, g.player.y, C.redL, 20, 0.4);
        return true;
      },
      tick(g, dt) {
        const d = g.mem.debt as Debt | null;
        if (!d) return;
        d.t -= dt;
        if (d.t > 0) return;
        g.mem.debt = null;
        g.loseLife();
      },
      onKill(g, e) {
        const d = g.mem.debt as Debt | null;
        // убийства сорванных врагов закрывают долг только с «Без поводка»
        if (!d || (e.lastHit?.by === 'ally' && !hasSyn(g, SYN.snap2))) return;
        if (++d.kills >= 2) payDebt(g);
      },
      onHit(g, e) {
        const d = g.mem.debt as Debt | null;
        if (!d || !e.def.boss) return;
        if (++d.hits >= 12) payDebt(g);
      },
      gauge: (g) => (g.mem.debt ? { kind: 'ring', color: C.redL, k: (g.mem.debt as Debt).t / 3 } : null),
    },
  },
  {
    id: 'iSnapLeash', kind: 'implant', slot: 'armL', quality: 4, unstable: 1, tags: ['blade'], fromEnemy: 'psycho',
    name: { ru: '«Обрывок поводка»', en: '"Torn Leash"' },
    desc: {
      ru: '[E] Хлыст дугой 120°, досягаемость 70, урон 10: обычные враги срываются с поводка на 2,5 с (бьют ближайшего врага), тяжёлые и элита (III–IV) — оглушение 0,5 с, боссы — ×2 урона без срыва. Перезарядка 7 с.',
      en: '[E] A 120° whip, reach 70, 10 damage: normal enemies slip their leash for 2.5 s (attacking the nearest enemy), heavies and elites (III–IV) are stunned for 0.5 s, bosses take ×2 damage without snapping. Cooldown 7 s.',
    },
    icon: { shape: 'whip', color: C.redD, accent: C.steelL },
    leftHand: {
      cooldown: 7,
      use(g, angle) {
        const p = g.player;
        const reach = 70, arc = (120 * Math.PI) / 180;
        g.fx.add({ kind: 'slash', x: p.x, y: p.y - 3, angle, arc, size: reach, color: C.redD, life: 0.16, glow: true });
        for (const e of g.enemies) {
          if (!isFoe(e) || dist2(p.x, p.y, e.x, e.y) > (reach + e.r) ** 2) continue;
          if (Math.abs(angleDiff(angle, angleTo(p.x, p.y, e.x, e.y))) > arc / 2 + 0.15) continue;
          const boss = bossLike(e);
          damageEnemy(g, e, 10 * p.stats.damageMult * (boss ? 2 : 1), p.x, p.y, { source: 'melee', tag: 'leash' });
          if (boss || e.dead) continue;
          if (isNormal(e)) {
            if (snapEnemy(g, e, 2.5)) e.mem.snapBy = 'leash';
          } else stun(e, 0.5);
        }
      },
    },
  },
  {
    id: 'wSnapChain', kind: 'weapon', quality: 4, unstable: 2, tags: ['blade', 'heavy'], fromEnemy: 'psycho',
    name: { ru: 'Цепь «Обрыв»', en: '"Snapback" Chain' },
    desc: {
      ru: 'Держа огонь — раскрутка вокруг (радиус 36, касание 4 урона, до 1,5 с); отпустив — бросок на 170 по прицелу, урон 8–30 по раскрутке, пробивает всех; в конце — волна радиусом 30 (50%, отброс).',
      en: 'Hold fire to spin it around you (radius 36, 4 damage per touch, up to 1.5 s); release to throw it 170 toward your aim, 8–30 damage by spin, piercing everyone; at the end — a 30-radius shockwave (50%, knockback).',
    },
    icon: { shape: 'whip', color: C.metal, accent: C.yellow },
    weapon: {
      mode: 'charge', chargeTime: 1.5,
      stats: (s) => {
        s.damage = 8;
        s.shotColor = C.steelL;
      },
      fire(g, angle, s) {
        // степень раскрутки — из урона, который передаёт fireWeapon (база × (0,35 + k × 2,4))
        const base = g.player.stats.damage;
        const k = Math.max(0, Math.min(1, (s.damage / base - 0.35) / 2.4));
        throwChain(g, angle, (8 + 22 * k) * g.player.stats.damageMult);
      },
    },
    hooks: {
      tick(g) {
        const p = g.player;
        if (p.charge <= 0 || p.gun.id !== 'wSnapChain') return;
        // раскрутка: цепь кружит вокруг и бьёт касанием
        const a = g.time * 14;
        const x = p.x + Math.cos(a) * 36, y = p.y - 3 + Math.sin(a) * 36;
        g.fx.add({ kind: 'beam', x: p.x, y: p.y - 3, x2: x, y2: y, color: C.steelL, size: 1, life: 0.03, glow: false });
        for (const e of g.enemies) {
          if (!isFoe(e) || dist2(e.x, e.y, x, y) > (e.r + 5) ** 2 || g.time - (e.mem.chainT ?? -9) < 0.3) continue;
          e.mem.chainT = g.time;
          damageEnemy(g, e, 4 * p.stats.damageMult, x, y, { source: 'melee', tag: 'chain', knockback: 60 });
        }
      },
    },
  },

  // ================================================================ Механоид
  {
    id: 'pMechFork', kind: 'passive', quality: 4, unstable: 2, tags: ['explosive'], fromEnemy: 'mechanoid',
    name: { ru: 'Прошивка «Вилка»', en: '"Fork" Firmware' },
    desc: {
      ru: 'Каждое 8-е попадание по одному врагу вызывает пару ракет с двух флангов: они сходятся на нём (взрыв 26, ×4 урона); цель погибла — взрываются на месте.',
      en: 'Every 8th hit on the same enemy calls a pair of rockets from both flanks: they converge on it (blast 26, ×4 damage); if the target dies, they blow up where they are.',
    },
    icon: { shape: 'rocket', color: C.steelL, accent: C.amber },
    hooks: {
      onHit(g, e, hit) {
        if (hit.tag === 'fork') return;
        e.mem.forkN = (e.mem.forkN ?? 0) + 1;
        if (e.mem.forkN % 8 === 0) forkPair(g, e);
      },
    },
  },
  {
    id: 'pMechColumn', kind: 'passive', quality: 4, unstable: 1, tags: ['kinetic'], fromEnemy: 'mechanoid',
    name: { ru: 'Прошивка «Колонна»', en: '"Column" Firmware' },
    desc: {
      ru: 'Каждый снаряд вылетает колонной из 4 пуль (30% урона каждая); каждое следующее попадание колонны в ту же цель сильнее на 40%. Скорострельность −20%.',
      en: 'Every projectile flies as a column of 4 bullets (30% damage each); each further hit of the column on the same target is 40% stronger. Fire rate −20%.',
    },
    icon: { shape: 'rifle', color: C.steelL, accent: C.yellow },
    stats: (s) => {
      s.fireRateMult *= 0.8;
    },
    hooks: {
      onVolleyShot(g, b) {
        if (b.data?.col || b.arc) return;
        const col = { hits: new Map<Enemy, number>() };
        b.dmg *= 0.3;
        (b.data ??= {}).col = col;
        const prev = b.onHitEnemy;
        const hit = (g: Game, x: PBullet, e: Enemy) => {
          prev?.(g, x, e);
          columnHit(g, x, e);
        };
        b.onHitEnemy = hit;
        for (let i = 1; i < 4; i++) {
          const back = 7 * i;
          spawnShot(g, b.angle, g.player.stats, {
            ...b, x: b.x - Math.cos(b.angle) * back, y: b.y - Math.sin(b.angle) * back,
            bx: b.bx - Math.cos(b.angle) * back, by: b.by - Math.sin(b.angle) * back,
            hit: new Set(), data: { col }, onHitEnemy: hit,
          });
        }
      },
    },
  },
  {
    id: 'pMechBearing', kind: 'passive', quality: 4, unstable: 1, tags: ['smart'], fromEnemy: 'mechanoid',
    name: { ru: 'Прошивка «Пеленг»', en: '"Bearing" Firmware' },
    desc: {
      ru: 'Попадание ставит на врага пеленг на 3 с: самонаводящиеся снаряды, ракеты и дроны бьют только его и пробивают +1; если враг с пеленгом ближе 70 — каждый залп отталкивает вас на 18.',
      en: 'A hit puts a bearing on the enemy for 3 s: homing shots, rockets and drones go only for it and pierce +1; if an enemy with a bearing is within 70, every volley pushes you back by 18.',
    },
    icon: { shape: 'crosshair', color: C.yellow, accent: C.steel },
    hooks: {
      onHit(g, e, hit) {
        addStack(e, 'bearing', 1, 1, 3);
        const b = hit.bullet;
        if (b && b.homing > 0 && !b.data?.bearingPierce) {
          (b.data ??= {}).bearingPierce = true;
          b.pierce += 1;
        }
      },
      onShoot(g) {
        const p = g.player;
        let near: Enemy | null = null, bd = 70 * 70;
        for (const e of g.enemies) {
          if (!isFoe(e) || stackCount(e, 'bearing') === 0) continue;
          const d = dist2(e.x, e.y, p.x, p.y);
          if (d < bd) {
            bd = d;
            near = e;
          }
        }
        if (!near) return;
        const a = angleTo(near.x, near.y, p.x, p.y);
        const body = { x: p.x, y: p.y, r: p.bodyR };
        moveBody(g.room, body, Math.cos(a) * 18, Math.sin(a) * 18, (t, tx, ty) => g.playerSolid(t, tx, ty, false));
        p.x = body.x;
        p.y = body.y;
      },
    },
  },
  {
    id: 'pMechAps', kind: 'passive', quality: 4, unstable: 1, tags: ['smart', 'explosive'], fromEnemy: 'mechanoid',
    name: { ru: 'Протокол «КАЗ»', en: '"APS" Protocol' },
    desc: {
      ru: 'Раз в 10 с (значок в HUD) пуля, которая попала бы в вас, сбивается микроракетой: жизнь и сбой не тратятся; лучи не сбивает; срабатывает раньше щита.',
      en: 'Once per 10 s (an icon in the HUD) a bullet that would hit you is shot down by a micro-missile: no life or glitch is spent; beams are not stopped; triggers before your shield.',
    },
    icon: { shape: 'shield', color: C.yellow, accent: C.amber },
    hooks: {
      onIncoming(g, hit) {
        const b = hit.bullet;
        if (!b || b.beam || !apsReady(g)) return false;
        g.mem.apsT = g.time + 10;
        g.mem.apsCut = 0;
        const p = g.player;
        g.fx.add({ kind: 'beam', x: p.x, y: p.y - 6, x2: b.x, y2: b.y, color: C.yellow, size: 1, life: 0.12, glow: true });
        g.fx.flash(b.x, b.y, C.yellow, 6, 0.1);
        // «Ответный удар»: пара ракет «Вилки» в стрелявшего и пеленг на него
        const o = b.owner;
        if (o && !o.dead && o.team === 'foe' && hasSyn(g, SYN.mech2)) {
          addStack(o, 'bearing', 1, 1, 3);
          forkPair(g, o);
        }
        return true;
      },
      onKill(g, e) {
        // «Ответный удар»: цель с пеленгом, убитая ракетами, — −2 с перезарядки (не больше −6 с за цикл)
        if (!hasSyn(g, SYN.mech2) || stackCount(e, 'bearing') === 0 || e.lastHit?.tag !== 'fork') return;
        if ((g.mem.apsCut ?? 0) >= 6) return;
        g.mem.apsCut = (g.mem.apsCut ?? 0) + 2;
        g.mem.apsT = (g.mem.apsT ?? 0) - 2;
      },
      gauge: (g) => ({ kind: 'hud', color: C.yellow, icon: { shape: 'shield', color: C.yellow, accent: C.amber }, k: apsReady(g) ? 0 : ((g.mem.apsT ?? 0) - g.time) / 10 }),
    },
  },
  {
    id: 'pMechBarrage', kind: 'passive', quality: 4, unstable: 1, tags: ['fire', 'explosive'], fromEnemy: 'mechanoid',
    name: { ru: 'Протокол «Заградогонь»', en: '"Barrage" Protocol' },
    desc: {
      ru: 'Каждые 4 с ракета ложится между вами и ближайшим врагом (ближе 150) — огненная полоса 60 px на 2,5 с поперёк его пути: обычные враги её обходят, в ней — 6 урона в секунду; боссы проходят с уроном; пули не трогает.',
      en: 'Every 4 s a rocket lands between you and the nearest enemy (within 150) — a 60 px fire strip for 2.5 s across its path: normal enemies go around it, inside it deals 6 damage per second; bosses walk through taking damage; bullets are unaffected.',
    },
    icon: { shape: 'fire', color: C.amberD, accent: C.yellow },
    hooks: {
      tick(g, dt) {
        g.mem.barrageT = (g.mem.barrageT ?? 0) + dt;
        if (g.mem.barrageT < 4) return;
        const p = g.player;
        const e = nearestFoe(g, p.x, p.y, 150);
        if (!e) return;
        g.mem.barrageT = 0;
        const a = angleTo(p.x, p.y, e.x, e.y);
        const mx = (p.x + e.x) / 2, my = (p.y + e.y) / 2;
        const px = Math.cos(a + Math.PI / 2) * 30, py = Math.sin(a + Math.PI / 2) * 30;
        addZone(g, 'strip', mx - px, my - py, 0, 2.5, { dps: 6 * p.stats.damageMult, x2: mx + px, y2: my + py, width: 10, tag: 'barrage' });
        g.fx.flash(mx, my, C.amber, 14, 0.15);
      },
    },
  },
  {
    id: 'pMechAmmo', kind: 'passive', quality: 4, unstable: 1, tags: ['explosive'], fromEnemy: 'mechanoid',
    name: { ru: 'Протокол «Боекомплект»', en: '"Ammo Rack" Protocol' },
    desc: {
      ru: 'Убийство — ракета в боекомплект (до 8, видно в HUD); сбой (F) выпускает все ракеты самонаводящимися (взрыв 20, урон 12).',
      en: 'A kill loads a rocket into the rack (up to 8, shown in the HUD); a glitch (F) launches them all as homing rockets (blast 20, 12 damage).',
    },
    icon: { shape: 'rocket', color: C.redD, accent: C.yellow },
    hooks: {
      onKill(g) {
        g.mem.ammo = Math.min(8, (g.mem.ammo ?? 0) + 1);
      },
      onGlitch(g) {
        const n = g.mem.ammo ?? 0;
        g.mem.ammo = 0;
        const off = Math.random() * TAU;
        for (let i = 0; i < n; i++) ammoRocket(g, off + (i / Math.max(1, n)) * TAU);
      },
      gauge: (g) => ({ kind: 'hud', color: C.amber, icon: { shape: 'rocket', color: C.redD, accent: C.yellow }, n: g.mem.ammo ?? 0 }),
    },
  },

  // ================================================================ общий пул (не в наборе)
  {
    id: 'iHeatPack', kind: 'implant', slot: 'back', quality: 4, unstable: 1, tags: ['fire', 'heavy'],
    name: { ru: 'Ранец «Накал»', en: '"Glow" Backpack' },
    desc: {
      ru: 'Убийство в радиусе 60 — заряд (до 10): +2% скорости и +3% урона за заряд; любое попадание (даже в щит) сжигает половину; без убийств вплотную заряды гаснут по одному раз в 4 с.',
      en: 'A kill within 60 grants a charge (up to 10): +2% speed and +3% damage per charge; any hit (even on the shield) burns half; without close kills, charges fade one per 4 s.',
    },
    icon: { shape: 'battery', color: C.red, accent: C.yellow },
    hooks: {
      onKill(g, e) {
        const p = g.player;
        if (dist2(p.x, p.y, e.x, e.y) > 60 * 60) return;
        g.mem.heatT = 0;
        setHeat(g, (g.mem.heatN ?? 0) + 1);
      },
      onDefend(g) {
        setHeat(g, Math.floor((g.mem.heatN ?? 0) / 2));
      },
      onHurt(g) {
        setHeat(g, Math.floor((g.mem.heatN ?? 0) / 2));
      },
      tick(g, dt) {
        if (!(g.mem.heatN > 0)) return;
        g.mem.heatT = (g.mem.heatT ?? 0) + dt;
        if (g.mem.heatT < 4) return;
        g.mem.heatT = 0;
        setHeat(g, g.mem.heatN - 1);
      },
      gauge: (g) => ((g.mem.heatN ?? 0) > 0 ? { kind: 'pips', color: C.red, n: g.mem.heatN, max: 10 } : null),
    },
  },
  {
    id: 'pCarpetStrike', kind: 'passive', quality: 4, unstable: 2, tags: ['explosive'],
    name: { ru: 'Протокол «Ковровый удар»', en: '"Carpet Strike" Protocol' },
    desc: {
      ru: 'Каждое 40-е попадание — по линии стрельбы через комнату 6 взрывов (радиус 22, урон 14), с подсветкой за 0,5 с до удара.',
      en: 'Every 40th hit calls 6 explosions along your line of fire across the room (radius 22, 14 damage), marked 0.5 s before impact.',
    },
    icon: { shape: 'bomb', color: C.red, accent: C.bone },
    hooks: {
      onHit(g, _e, hit) {
        if (hit.tag === 'carpet') return;
        g.mem.carpetN = (g.mem.carpetN ?? 0) + 1;
        if (g.mem.carpetN % 40) return;
        carpet(g, g.player.aimAngle);
      },
    },
  },
];

