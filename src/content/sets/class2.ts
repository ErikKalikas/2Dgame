import { angleDiff, angleTo, dist2 } from '../../core/math';
import { C } from '../../gfx/palette';
import type { PBullet } from '../../game/bullets';
import { distToSegment, raycast } from '../../game/collision';
import { damageEnemy, fan, spawnShot } from '../../game/combat';
import type { Enemy } from '../../game/enemy';
import type { Game } from '../../game/game';
import type { ItemDef } from '../../game/items';
import { nearestFoe, shotDmg, shotFrom, spawnFollower, spawnScrap, spawnSpinner, tether, isTethered } from '../../game/minions';
import { addObj, objsOf, type WorldObj } from '../../game/objects';
import { STACK_COLOR, STACK_LIT, STACK_VULN, addStack, isFoe, stackCount, takeStacks } from '../../game/status';
import { finalDamage, type Stats } from '../../game/stats';
import { isSmallBullet } from '../../game/zones';
import { nearestWalkable } from '../../world/level';
import { summonAlly } from '../../game/team';
import { ENEMY_BY_ID } from '../enemies';
import { SYN, blink, coneTarget, eraseBullets, hasSyn, ignite, shotK, st, stun, visible } from './common';

// Предметы наборов врагов II класса (редкость 2): Вахтёр, Мигун, Снайпер (киборги),
// Автотурель, Ремонтный дрон, Дрон-гончая (роботы). Числа — заметка «Наборы врагов — этап 12».

STACK_COLOR.set('turnstile', C.bone);
STACK_COLOR.set('spot', C.redL);
STACK_LIT.add('spot');
STACK_VULN.set('spot', 0.35);

// ---------------------------------------------------------------- Дрон-гончая (14а)

/** Скорость врагов для «Упреждения»: по смещению за кадр, сглаженно */
function trackFoes(g: Game, dt: number) {
  if (dt <= 0) return;
  const tr = st(g, 'huntLead', () => ({ v: new WeakMap<Enemy, { x: number; y: number; vx: number; vy: number }>() }));
  for (const e of g.enemies) {
    if (!isFoe(e)) continue;
    const o = tr.v.get(e);
    if (!o) {
      tr.v.set(e, { x: e.x, y: e.y, vx: 0, vy: 0 });
      continue;
    }
    const k = Math.min(1, dt * 8);
    o.vx += ((e.x - o.x) / dt - o.vx) * k;
    o.vy += ((e.y - o.y) / dt - o.vy) * k;
    o.x = e.x;
    o.y = e.y;
  }
}

// ---------------------------------------------------------------- Вахтёр

const CROSS_R = 18;

/** Крестовина «Поста охраны»: вращается вокруг героя, гасит пули, толкает врагов; болт сквозь лопасть раздваивается */
export function spawnCross(g: Game, dur: number): WorldObj {
  const ex = objsOf(g, 'cross')[0];
  if (ex) {
    ex.life = Math.max(ex.life, ex.t + dur);
    return ex;
  }
  const p = g.player;
  return addObj(g, {
    kind: 'cross', x: p.x, y: p.y - 3, r: CROSS_R, life: dur, layer: 'air', data: { a: 0 },
    update(g, o, dt) {
      const p = g.player;
      o.x = p.x;
      o.y = p.y - 3;
      o.data.a += dt * 6;
      let erased = false;
      for (let k = 0; k < 4; k++) {
        const a = o.data.a + (k * Math.PI) / 2;
        const x2 = o.x + Math.cos(a) * CROSS_R, y2 = o.y + Math.sin(a) * CROSS_R;
        for (const b of g.ebullets) {
          if (b.dead || distToSegment(b.x, b.y, o.x, o.y, x2, y2) > b.r + 1.5) continue;
          b.dead = erased = true;
          g.fx.add({ kind: 'dot', x: b.x, y: b.y, color: C.yellow, life: 0.2, glow: true });
        }
        for (const e of g.enemies) {
          if (!isFoe(e) || e.def.heavy || e.def.boss || distToSegment(e.x, e.y, o.x, o.y, x2, y2) > e.r + 2) continue;
          const ea = angleTo(o.x, o.y, e.x, e.y);
          e.kx = Math.cos(ea) * 120;
          e.ky = Math.sin(ea) * 120;
        }
        // болт «Турникета» сквозь лопасть раздваивается (один раз)
        for (const b of g.pbullets) {
          if (b.tag !== 'turnstile' || b.data?.split || distToSegment(b.x, b.y, o.x, o.y, x2, y2) > 3) continue;
          (b.data ??= {}).split = true;
          spawnShot(g, 0, p.stats, { ...b, angle: b.angle + 0.25, hit: new Set(b.hit), data: { split: true }, isChild: true });
          b.angle -= 0.25;
        }
      }
      if (erased) g.ebullets = g.ebullets.filter((b) => !b.dead);
    },
    draw(g, o, ctx, x, y) {
      ctx.strokeStyle = Math.floor(g.time * 12) % 2 ? C.yellow : C.bone;
      ctx.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const a = o.data.a + (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
        ctx.lineTo(x + Math.cos(a) * CROSS_R, y + Math.sin(a) * CROSS_R);
        ctx.stroke();
      }
    },
  });
}

/** Отметка болта «Турникета»: 3 отметки за 2 с — оглушение 0,8 с и щит опущен на 2 с */
function turnstileMark(g: Game, e: Enemy) {
  if (addStack(e, 'turnstile', 1, 3, 2) < 3) return;
  takeStacks(e, 'turnstile');
  stun(e, 0.8);
  e.shieldOff = Math.max(e.shieldOff, 2);
  g.fx.ring(e.x, e.y, C.bone, e.r + 6, 0.3);
  // «Пропуск аннулирован»: оглушённый досмотрен — бьётся как сбоку и сквозь щит
  if (hasSyn(g, SYN.guard2)) {
    e.exposedT = Math.max(e.exposedT, 0.8);
    e.mem.inspected = g.time + 0.8;
  }
}

// ---------------------------------------------------------------- Мигун

/** Осколок «Пятерни»: 0,25 с летит прямо, замирает и бросается к ближайшему врагу */
function fiveShard(): Partial<PBullet> {
  return {
    tag: 'five', life: 1.4, maxLife: 1.4,
    step(g, b) {
      const d = (b.data ??= {});
      if (b.t < 0.25 || d.lunged) return;
      if (b.t < 0.37) {
        d.speed ??= b.speed;
        b.speed = 0;
        return;
      }
      d.lunged = true;
      const t = nearestFoe(g, b.bx, b.by, 320);
      if (t) b.angle = angleTo(b.bx, b.by, t.x, t.y);
      b.speed = Math.max(380, d.speed ?? 380);
    },
  };
}

/** Веер «Пятерни» из точки (копия «Ложного следа»): 5 осколков по 2 урона */
export function fireFiveFrom(g: Game, x: number, y: number, angle: number) {
  const s = g.player.stats;
  for (let i = 0; i < 5; i++) {
    spawnShot(g, angle + (i - 2) * 0.22, s, {
      ...fiveShard(), x, y, bx: x, by: y, dmg: 2 * s.damageMult, speed: 260, r: 2.5, style: 'shard', color: C.violet,
      orbitR: 0, boomerang: false, wave: 0, split: 0, explode: 0,
    });
  }
}

/** Мерцание корпуса: раз в 3 с на 0,35 с */
export function flickering(g: Game): boolean {
  return (g.mem.flickOn ?? 0) > 0;
}

// ---------------------------------------------------------------- Снайпер

interface PlumbState {
  t: Enemy | null;
  k: number;
  lock: Enemy | null;
}

/** «Отвес»: лазер ведёт цель, 0,6 с на одном враге — выстрел (через g.fireWeapon) */
function plumbTick(g: Game, dt: number) {
  const p = g.player;
  const s = st<PlumbState>(g, 'plumb', () => ({ t: null, k: 0, lock: null }));
  if (s.lock && !isFoe(s.lock)) s.lock = null;
  if (!p.shooting) {
    s.t = s.lock = null;
    s.k = 0;
    return;
  }
  const t = s.lock ?? coneTarget(g, p.shootAngle, 0.3, p.stats.range);
  if (t !== s.t) {
    s.t = t;
    s.k = 0;
  }
  if (!t) return;
  let rate = 1;
  if (p.focus && p.has('iSniperTripod')) rate *= 2;
  if (stackCount(t, 'spot') > 0) rate *= 2;
  s.k += (dt * rate) / 0.6;
  const x1 = p.x, y1 = p.y - 3;
  g.fx.add({ kind: 'beam', x: x1, y: y1, x2: t.x, y2: t.y, color: s.k > 0.75 ? C.redL : C.red, size: 1, life: 0.02, glow: true });
  // «Холодный ствол»: в фокусе лазер сжигает пересекающие его вражеские пули
  if (p.focus && hasSyn(g, SYN.sniper1)) {
    let any = false;
    for (const b of g.ebullets) {
      if (b.dead || distToSegment(b.x, b.y, x1, y1, t.x, t.y) > b.r + 1) continue;
      b.dead = any = true;
      g.fx.add({ kind: 'dot', x: b.x, y: b.y, color: C.redL, life: 0.2, glow: true });
    }
    if (any) g.ebullets = g.ebullets.filter((b) => !b.dead);
  }
  if (s.k >= 1) {
    s.k = 0;
    g.mem.plumbTarget = t;
    g.fireWeapon(angleTo(x1, y1, t.x, t.y), 1);
  }
}

/** Выстрел «Отвеса»: мгновенный, всегда крит, пробивает всех на линии до стены */
function plumbShot(g: Game, angle: number, s: Stats) {
  const p = g.player;
  const x1 = p.x, y1 = p.y - 3;
  const len = raycast(g.room, x1, y1, angle, s.range);
  const x2 = x1 + Math.cos(angle) * len, y2 = y1 + Math.sin(angle) * len;
  g.fx.add({ kind: 'beam', x: x1, y: y1, x2, y2, color: C.bone, size: 2.5, life: 0.12, glow: true });
  const dmg = finalDamage(s);
  const hit = g.enemies.filter((e) => isFoe(e) && distToSegment(e.x, e.y, x1, y1, x2, y2) <= e.r + 2);
  for (const e of hit) damageEnemy(g, e, dmg, x1, y1, { crit: true, source: 'bullet', tag: 'plumb', knockback: 40 });
  g.hitTile(x2 + Math.cos(angle) * 2, y2 + Math.sin(angle) * 2, dmg);
  const t = g.mem.plumbTarget as Enemy | null;
  g.mem.plumbTarget = null;
  // «Позиция»: выстрел по отмеченной цели рикошетит в следующую отмеченную
  if (t && hasSyn(g, SYN.sniper2) && stackCount(t, 'spot') > 0) {
    const next = nearestFoe(g, t.x, t.y, 400, (o) => o === t || stackCount(o, 'spot') === 0);
    if (next) {
      g.fx.add({ kind: 'beam', x: t.x, y: t.y, x2: next.x, y2: next.y, color: C.redL, size: 2, life: 0.12, glow: true });
      damageEnemy(g, next, dmg, t.x, t.y, { crit: true, source: 'bullet', tag: 'plumb' });
    }
  }
  // «Холодный ствол»: убийство перебрасывает прицел на ближайшего врага
  const dead = hit.find((e) => e.dead);
  if (dead && hasSyn(g, SYN.sniper1)) {
    const ps = st<PlumbState>(g, 'plumb', () => ({ t: null, k: 0, lock: null }));
    ps.lock = nearestFoe(g, dead.x, dead.y, 400);
  }
}

// ---------------------------------------------------------------- Автотурель

interface Thermo {
  fire: number;
  idle: number;
  phase: 'spin' | 'hot' | 'spent';
  hot: number;
}

/** Сброс пара: кольцо 50 стирает пули и обжигает врагов */
export function steamVent(g: Game, x: number, y: number) {
  eraseBullets(g, x, y, 50, C.bone);
  for (const e of g.enemies) if (isFoe(e) && dist2(x, y, e.x, e.y) <= (50 + e.r) ** 2) ignite(e, 4);
  g.fx.ring(x, y, C.bone, 50, 0.35);
  g.fx.burst(x, y, C.grey, 14, 90, 0.4, 2);
}

function thermoTick(g: Game, dt: number) {
  const p = g.player;
  const t = st<Thermo>(g, 'thermo', () => ({ fire: 0, idle: 0, phase: 'spin', hot: 0 }));
  if (p.shooting) t.idle = 0;
  else {
    t.idle += dt;
    if (t.idle >= 1) {
      t.phase = 'spin';
      t.fire = 0;
    }
  }
  // «Огневая точка»: пока стоит вертушка, термоцикл не перегревается
  const hold = hasSyn(g, SYN.turret1) && objsOf(g, 'spinner').length > 0;
  if (t.phase === 'spin' && p.shooting) {
    t.fire += dt;
    if (t.fire >= 2.2 && !hold) {
      t.phase = 'hot';
      t.hot = 1.8;
      steamVent(g, p.x, p.y);
      // «Укрепрайон»: пар сбрасывает и каждая вертушка
      if (hasSyn(g, SYN.turret2)) for (const s of objsOf(g, 'spinner')) steamVent(g, s.x, s.y);
    }
  }
  if (t.phase === 'hot') {
    t.hot -= dt;
    if (t.hot <= 0) t.phase = 'spent';
  }
  p.setBuff('thermoSpin', t.phase === 'spin', thermoSpin);
  p.setBuff('thermoHot', t.phase === 'hot', thermoHot);
}

const thermoSpin = (s: Stats) => {
  s.fireRateMult *= 1.5;
};
const thermoHot = (s: Stats) => {
  s.burn += 3;
  s.shotColor = C.redL;
};

/** Вертушка на месте цели: обычная, «Огневая точка» (к прицелу, вдвое чаще, 4 с, до 4) или «Укрепрайон» (часовой до конца комнаты, до 3) */
function placeSpinner(g: Game, x: number, y: number) {
  const full = hasSyn(g, SYN.turret2), point = hasSyn(g, SYN.turret1);
  const max = full ? 3 : point ? 4 : 2;
  if (objsOf(g, 'spinner').length >= max) return false;
  const pos = nearestWalkable(g.room, x, y);
  spawnSpinner(g, pos.x, pos.y, {
    life: full ? Infinity : point ? 4 : 2,
    period: point ? 0.06 : 0.12,
    dmg: shotDmg(g) * 0.35,
    aimed: point && !full,
    sentry: full ? 90 : undefined,
    room: full && g.zone ? g.zone.id : undefined,
  });
  return true;
}

// ---------------------------------------------------------------- Ремонтный дрон

/** Запчасть «Перебора»: сокращает отключение нестабильного предмета на 4 с, иначе +1 энергоячейка */
function salvage(g: Game) {
  const p = g.player;
  for (const d of p.disabled.values()) {
    if (d.mode !== 'timed') continue;
    d.t = Math.max(0.01, d.t - 4);
    g.fx.ring(p.x, p.y, C.yellow, 14, 0.25);
    return;
  }
  p.coins += 1;
}

/** Лепесток «Ромашки»: облетает по дуге и возвращается; пойманный — 1% заряда сбоя */
function petal(g: Game, angle: number, side: number) {
  const p = g.player;
  shotFrom(g, p.x, p.y - 3, angle, {
    dmg: shotDmg(g) * 0.45, speed: 190, r: 2, life: 1.8, maxLife: 1.0, boomerang: true, spiral: side * 2.4,
    style: 'disc', color: C.bone, tag: 'petal', split: 0, explode: 0, homing: 0,
    step(g, b) {
      if (!b.returning || dist2(b.bx, b.by, g.player.x, g.player.y) > 12 * 12) return;
      b.dead = true;
      if (g.player.glitchT <= 0) g.player.glitch = Math.min(1, g.player.glitch + 0.01);
      g.fx.add({ kind: 'dot', x: b.x, y: b.y, color: C.violet, life: 0.25, glow: true });
    },
  });
}

// ---------------------------------------------------------------- предметы

export const CLASS2: ItemDef[] = [
  // ================================================================ Вахтёр
  {
    id: 'iGuardPlate', kind: 'implant', slot: 'torso', quality: 2, tags: ['heavy'], fromEnemy: 'guard',
    name: { ru: 'Лобовая пластина «Проходная»', en: '"Checkpoint" Front Plate' },
    desc: {
      ru: 'Мелкая вражеская пуля спереди (±45°) с шансом 35% гаснет о пластину (не чаще раза в 1 с). Скорость −8%.',
      en: 'A small enemy bullet from the front (±45°) has a 35% chance to break on the plate (at most once per 1 s). Speed −8%.',
    },
    icon: { shape: 'plate', color: C.steel, accent: C.yellow },
    stats: (s) => {
      s.speed *= 0.92;
    },
    hooks: {
      onIncoming(g, hit) {
        const b = hit.bullet;
        if (!b || !isSmallBullet(b)) return false;
        const p = g.player;
        if (Math.abs(angleDiff(p.aimAngle, b.angle + Math.PI)) > Math.PI / 4) return false;
        if (g.time - (g.mem.plateT ?? -9) < 1 || Math.random() >= 0.35) return false;
        g.mem.plateT = g.time;
        g.fx.burst(b.x, b.y, C.yellow, 5, 50, 0.2, 1, true);
        // «Пост охраны»: каждые 3 погашенные пули — крестовина на 2 с
        const n = (g.mem.plateBlocks = (g.mem.plateBlocks ?? 0) + 1);
        if (n % 3 === 0 && hasSyn(g, SYN.guard1)) spawnCross(g, 2);
        return true;
      },
    },
  },
  {
    id: 'iGuardVisor', kind: 'implant', slot: 'head', quality: 2, tags: ['optic'], fromEnemy: 'guard',
    name: { ru: 'Визор «Щель»', en: '"Slit" Visor' },
    desc: {
      ru: 'Попадания сбоку или со спины ×1,5; лобовые щиты врагов гасят вдвое меньше вашего урона.',
      en: 'Hits to the side or back deal ×1.5; enemy front shields absorb half as much of your damage.',
    },
    icon: { shape: 'visor', color: C.metal, accent: C.red },
    stats: (s) => {
      s.flankMult *= 1.5;
      s.shieldPierce = Math.max(s.shieldPierce, 0.5);
    },
  },
  {
    id: 'wGuardTurnstile', kind: 'weapon', quality: 2, tags: ['kinetic'], fromEnemy: 'guard',
    name: { ru: 'Болтомёт «Турникет»', en: '"Turnstile" Bolt Thrower' },
    desc: {
      ru: 'Веер из 3 болтов: боковые сходятся с центральным на 110 и расходятся крест-накрест. Болт ставит отметку: 3 отметки за 2 с — оглушение 0,8 с и щит врага опущен на 2 с.',
      en: 'A fan of 3 bolts: the side bolts converge with the centre one at 110 and cross over. Each bolt marks: 3 marks within 2 s — a 0.8 s stun and the enemy shield drops for 2 s.',
    },
    icon: { shape: 'crossbow', color: C.steelL, accent: C.bone },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 3;
        s.fireDelay = 0.4;
        s.shotSpeed = 300;
        s.range = 250;
        s.shotStyle = 'needle';
        s.shotColor = C.bone;
      },
      fire(g, angle, s) {
        const p = g.player;
        const ox = p.x, oy = p.y - 3, L = 110, off = 9;
        const bases: number[] = [];
        for (let i = 0; i < s.count; i++) bases.push(angle + (i - (s.count - 1) / 2) * s.spread);
        if (s.backShot) bases.push(angle + Math.PI);
        for (const a of bases) {
          const cx = ox + Math.cos(a) * L, cy = oy + Math.sin(a) * L;
          for (const k of [-1, 0, 1]) {
            const x = ox + Math.cos(a + Math.PI / 2) * off * k, y = oy + Math.sin(a + Math.PI / 2) * off * k;
            const ba = k ? angleTo(x, y, cx, cy) : a;
            spawnShot(g, ba, s, { x, y, bx: x, by: y, tag: 'turnstile', onHitEnemy: (g, _b, e) => turnstileMark(g, e) });
          }
        }
      },
    },
  },
  {
    id: 'iGuardKeys', kind: 'implant', slot: 'back', quality: 2, tags: ['neural'], fromEnemy: 'guard',
    name: { ru: 'Связка «Ключница»', en: '"Keymaster" Key Ring' },
    desc: {
      ru: 'Взлом (двери, терминалы, схроны) вдвое быстрее; после взлома — щит на 1 попадание.',
      en: 'Hacking (doors, terminals, caches) is twice as fast; after a hack — a shield for 1 hit.',
    },
    icon: { shape: 'keys', color: C.yellow, accent: C.amber },
    stats: (s) => {
      s.hackSpeed *= 2;
    },
    hooks: {
      onHack(g) {
        g.player.shieldLeft += 1;
        g.fx.ring(g.player.x, g.player.y, C.amber, 22, 0.35);
      },
    },
  },

  // ================================================================ Мигун
  {
    id: 'wBlinkFive', kind: 'weapon', quality: 2, tags: ['neural'], fromEnemy: 'netrunner',
    name: { ru: 'Осколкомёт «Пятерня»', en: '"Five Fingers" Shard Gun' },
    desc: {
      ru: 'Веер из 5 осколков (урон 2): 0,25 с летят прямо, замирают и разом бросаются к ближайшему врагу.',
      en: 'A fan of 5 shards (2 damage): they fly straight for 0.25 s, freeze, and lunge together at the nearest enemy.',
    },
    icon: { shape: 'claw', color: C.violet, accent: C.bone },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2;
        s.count = 5;
        s.spread = 0.22;
        s.fireDelay = 0.5;
        s.shotSpeed = 260;
        s.shotStyle = 'shard';
        s.shotColor = C.violet;
      },
      fire(g, angle, s) {
        fan(g, angle, s, fiveShard());
      },
    },
  },
  {
    id: 'iBlinkAntenna', kind: 'implant', slot: 'head', quality: 2, tags: ['neural'], fromEnemy: 'netrunner',
    name: { ru: 'Антенна «Рожок»', en: '"Horn" Antenna' },
    desc: {
      ru: 'Сбой начинается со скачка на 110 к прицелу; переписанные сбоем пули наводятся вдвое сильнее; сбой копится на 15% быстрее.',
      en: 'A glitch starts with a 110 leap toward your aim; glitch-rewritten bullets home twice as hard; glitch charges 15% faster.',
    },
    icon: { shape: 'antenna', color: C.metal, accent: C.bone },
    stats: (s) => {
      s.glitchGain *= 1.15;
      s.glitchHoming = Math.max(s.glitchHoming, 8);
    },
    hooks: {
      onGlitch(g) {
        blink(g, g.player.aimAngle, 110);
        g.fx.ring(g.player.x, g.player.y, C.violet, 16, 0.3);
      },
    },
  },
  {
    id: 'iBlinkTorso', kind: 'implant', slot: 'torso', quality: 2, tags: ['stealth'], fromEnemy: 'netrunner',
    name: { ru: 'Мерцающий корпус', en: 'Flickering Chassis' },
    desc: {
      ru: 'Раз в 3 с на 0,35 с пули проходят сквозь вас; такая пуля заряжает сбой вдвое сильнее пролёта вплотную.',
      en: 'Every 3 s, for 0.35 s bullets pass through you; such a bullet charges the glitch twice as much as a close graze.',
    },
    icon: { shape: 'core', color: C.violet, accent: C.steelL },
    hooks: {
      tick(g, dt) {
        g.mem.flickT = (g.mem.flickT ?? 0) + dt;
        g.mem.flickOn = Math.max(0, (g.mem.flickOn ?? 0) - dt);
        if (g.mem.flickT >= 3) {
          g.mem.flickT = 0;
          g.mem.flickOn = 0.35;
        }
        if (g.mem.flickOn > 0 && Math.random() < dt * 30) {
          const p = g.player;
          g.fx.add({ kind: 'spark', x: p.x + (Math.random() - 0.5) * 10, y: p.y - 6 + (Math.random() - 0.5) * 12, vx: 0, vy: -20, color: C.violet, life: 0.15, glow: true });
        }
      },
      onIncoming(g, hit) {
        if (!flickering(g) || !hit.bullet) return false;
        const p = g.player;
        // вдвое сильнее самого близкого пролёта (0,02 × 1,5)
        if (p.glitchT <= 0) p.glitch = Math.min(1, p.glitch + 0.06 * p.stats.glitchGain);
        return 'pass';
      },
      gauge: (g) => (flickering(g) ? { kind: 'ring', color: C.violet, k: (g.mem.flickOn ?? 0) / 0.35 } : null),
    },
  },
  {
    id: 'iBlinkLegs', kind: 'implant', slot: 'legs', quality: 2, tags: ['stealth'], fromEnemy: 'netrunner',
    name: { ru: 'Ноги «Перескок»', en: '"Skip" Legs' },
    desc: {
      ru: 'Рывок двойной: два коротких рывка по 65% длины подряд, перезарядка после второго.',
      en: 'Double dash: two short dashes of 65% length in a row, cooldown after the second.',
    },
    icon: { shape: 'boot', color: C.violet, accent: C.steelL },
    stats: (s) => {
      s.dashCharges = Math.max(s.dashCharges, 2);
      s.dashDist *= 0.65;
    },
  },

  // ================================================================ Снайпер
  {
    id: 'wSniperPlumb', kind: 'weapon', quality: 2, tags: ['optic'], fromEnemy: 'sniper',
    name: { ru: 'Винтовка «Отвес»', en: '"Plumb Line" Rifle' },
    desc: {
      ru: 'Держите огонь — лазер ведёт цель; 0,6 с на одном враге — автоматический выстрел (урон 9): мгновенный, всегда крит, пробивает всех на линии.',
      en: 'Hold fire — a laser tracks the target; 0.6 s on one enemy fires automatically (9 damage): instant, always critical, pierces everyone on the line.',
    },
    icon: { shape: 'sniper', color: C.grey, accent: C.redL },
    weapon: {
      mode: 'bullet', hands: 2, manual: true,
      stats: (s) => {
        s.damage = 9;
        s.range = 420;
        s.shotColor = C.redL;
      },
      fire: plumbShot,
    },
    hooks: {
      tick: plumbTick,
      gauge: (g) => {
        const s = g.mem.plumb as PlumbState | undefined;
        return s?.t && g.player.shooting ? { kind: 'bar', color: C.redL, k: s.k } : null;
      },
    },
  },
  {
    id: 'iSniperRange', kind: 'implant', slot: 'head', quality: 2, tags: ['optic'], fromEnemy: 'sniper',
    name: { ru: 'Дальномер «Вышка»', en: '"Tower" Rangefinder' },
    desc: {
      ru: 'Снаряды набирают урон в полёте: +15% за каждые 50 пути (до +75%); на первых 40 — урон −25%. Дальность +20%.',
      en: 'Projectiles gain damage in flight: +15% per 50 travelled (up to +75%); within the first 40 — −25% damage. Range +20%.',
    },
    icon: { shape: 'eye', color: C.amberD, accent: C.redL },
    stats: (s) => {
      s.range *= 1.2;
    },
    hooks: {
      tick(g) {
        for (const b of g.pbullets) {
          if (b.dead || b.arc || b.orbitR || b.returning) continue;
          const d = (b.data ??= {});
          if (d.rx === undefined) {
            d.rx = b.bx;
            d.ry = b.by;
          }
          // −25% на первых 40, затем +15% за каждые 50 пути, до +75%
          const dist = Math.hypot(b.bx - d.rx, b.by - d.ry);
          shotK(b, 'range', dist < 40 ? 0.75 : 1 + Math.min(0.75, (0.15 * dist) / 50));
        }
      },
    },
  },
  {
    id: 'iSniperTripod', kind: 'implant', slot: 'legs', quality: 2, tags: ['heavy'], fromEnemy: 'sniper',
    name: { ru: 'Опоры «Тренога»', en: '"Tripod" Braces' },
    desc: {
      ru: 'В фокусе (Shift) хитбокс −30%, снаряды пробивают +1, лазер «Отвеса» ведёт цель вдвое быстрее; выход из фокуса рывком — 0,3 с неуязвимости.',
      en: 'In focus (Shift): hitbox −30%, projectiles pierce +1, the Plumb Line laser locks twice as fast; leaving focus with a dash grants 0.3 s of invulnerability.',
    },
    icon: { shape: 'tripod', color: C.steel, accent: C.amber },
    hooks: {
      tick(g) {
        g.player.setBuff('tripod', g.player.focus, tripod);
      },
      onDash(g) {
        if (g.player.focus) g.player.invuln = Math.max(g.player.invuln, 0.3);
      },
    },
  },
  {
    id: 'iSniperSpotter', kind: 'implant', slot: 'back', quality: 2, tags: ['smart', 'optic'], fromEnemy: 'sniper',
    name: { ru: 'Дрон-корректировщик', en: 'Spotter Drone' },
    desc: {
      ru: 'Раз в 3 с отмечает самого дальнего видимого врага: +35% урона по нему, лазер «Отвеса» ведёт его вдвое быстрее, отмеченный виден в темноте.',
      en: 'Every 3 s marks the farthest visible enemy: +35% damage to it, the Plumb Line laser locks it twice as fast, and it stays visible in the dark.',
    },
    icon: { shape: 'drone', color: C.steelL, accent: C.red },
    hooks: {
      tick(g, dt) {
        if (!objsOf(g, 'spotter').length) spawnFollower(g, 'spotter', -9, -15, C.red);
        const p = g.player;
        // «Позиция»: в фокусе на «Треноге» — отметка каждую секунду, до 3
        const full = hasSyn(g, SYN.sniper2) && p.focus;
        const s = st(g, 'spotter', () => ({ t: 0 }));
        s.t -= dt;
        if (s.t > 0) return;
        s.t = full ? 1 : 3;
        let best: Enemy | null = null, bd = -1;
        for (const e of g.enemies) {
          if (!isFoe(e) || stackCount(e, 'spot') > 0 || !visible(g, e)) continue;
          const d = dist2(p.x, p.y, e.x, e.y);
          if (d > bd) {
            bd = d;
            best = e;
          }
        }
        if (!best) return;
        const marked = g.enemies.filter((e) => !e.dead && stackCount(e, 'spot') > 0);
        if (!full) for (const e of marked) takeStacks(e, 'spot');
        else if (marked.length >= 3) {
          marked.sort((a, b) => a.stacks.get('spot')!.t - b.stacks.get('spot')!.t);
          takeStacks(marked[0], 'spot');
        }
        addStack(best, 'spot', 1, 1, full ? 3 : 3.05);
        const d = objsOf(g, 'spotter')[0];
        if (d) g.fx.add({ kind: 'beam', x: d.x, y: d.y, x2: best.x, y2: best.y, color: C.red, size: 1, life: 0.15, glow: true });
      },
    },
  },

  // ================================================================ Автотурель
  {
    id: 'pTurretSwivel', kind: 'passive', quality: 2, tags: ['smart'], fromEnemy: 'turret',
    name: { ru: 'Поворотный станок', en: 'Swivel Mount' },
    desc: {
      ru: 'Пока вы стреляете, ствол сам доворачивается к ближайшему врагу в секторе ±40° от прицела. Скорострельность +15%.',
      en: 'While you fire, the barrel turns by itself to the nearest enemy within ±40° of your aim. Fire rate +15%.',
    },
    icon: { shape: 'gear', color: C.steel, accent: C.redL },
    stats: (s) => {
      s.fireRateMult *= 1.15;
    },
    hooks: {
      adjustAim(g, angle) {
        const p = g.player;
        if (p.gun.weapon?.manual) return angle;
        let best: Enemy | null = null, bd = Infinity;
        for (const e of g.enemies) {
          if (!isFoe(e) || e.toss) continue;
          if (Math.abs(angleDiff(angle, angleTo(p.x, p.y, e.x, e.y))) > (40 * Math.PI) / 180) continue;
          const d = dist2(p.x, p.y, e.x, e.y);
          if (d < bd && d < p.stats.range * p.stats.range) {
            bd = d;
            best = e;
          }
        }
        return best ? angleTo(p.x, p.y - 3, best.x, best.y) : angle;
      },
    },
  },
  {
    id: 'pTurretThermo', kind: 'passive', quality: 2, tags: ['fire'], fromEnemy: 'turret',
    name: { ru: 'Термоцикл', en: 'Thermal Cycle' },
    desc: {
      ru: '2,2 с огня — скорострельность +50%; затем перегрев: сброс пара (кольцо 50 стирает пули и обжигает), 1,8 с снаряды раскалены (поджог +3). Пауза в огне 1 с — цикл заново.',
      en: '2.2 s of fire — fire rate +50%; then overheat: a steam vent (a 50 ring erases bullets and scalds), and for 1.8 s shots are red-hot (+3 burn). A 1 s pause in fire restarts the cycle.',
    },
    icon: { shape: 'fire', color: C.steel, accent: C.red },
    hooks: {
      tick: thermoTick,
      gauge: (g) => {
        const t = g.mem.thermo as Thermo | undefined;
        if (!t || (t.phase === 'spin' && t.fire <= 0)) return null;
        if (t.phase === 'hot') return { kind: 'bar', color: C.redL, k: t.hot / 1.8 };
        if (t.phase === 'spin') return { kind: 'bar', color: C.amber, k: t.fire / 2.2 };
        return null;
      },
    },
  },
  {
    id: 'pTurretSpinners', kind: 'passive', quality: 2, tags: ['kinetic'], fromEnemy: 'turret',
    name: { ru: 'Вертушки', en: 'Spinners' },
    desc: {
      ru: 'Каждый 6-й снаряд при попадании ставит на месте цели вертушку: 2 с крутит две встречные струи (35% урона). Не чаще раза в 2 с, до 2.',
      en: 'Every 6th projectile hit places a spinner at the target: for 2 s it spins two counter-rotating jets (35% damage). At most once per 2 s, up to 2.',
    },
    icon: { shape: 'rotor', color: C.amber, accent: C.red },
    hooks: {
      onHit(g, e, hit) {
        if (hit.source !== 'bullet' || hit.bullet?.isChild || hit.tag === 'spinner') return;
        const n = (g.mem.spinN = (g.mem.spinN ?? 0) + 1);
        if (n < 6 || g.time - (g.mem.spinT ?? -9) < 2) return;
        if (placeSpinner(g, e.x, e.y)) {
          g.mem.spinN = 0;
          g.mem.spinT = g.time;
        }
      },
    },
  },
  {
    id: 'pTurretSentry', kind: 'passive', quality: 2, tags: ['smart'], fromEnemy: 'turret',
    name: { ru: 'Прошивка «Часовой»', en: '"Sentry" Firmware' },
    desc: {
      ru: 'Если вы не стреляли 1,5 с, первый враг, вошедший в радиус 90, получает автоочередь из 5 снарядов (не чаще раза в 2 с).',
      en: 'If you have not fired for 1.5 s, the first enemy to enter a 90 radius gets an automatic burst of 5 shots (at most once per 2 s).',
    },
    icon: { shape: 'rotor', color: C.redD, accent: C.yellow },
    hooks: {
      onShoot(g) {
        g.mem.sentryShot = g.time;
      },
      tick(g, dt) {
        const p = g.player;
        const s = st(g, 'sentry', () => ({ inside: new Set<Enemy>(), cd: -9, burst: 0, bt: 0, target: null as Enemy | null }));
        if (s.burst > 0) {
          s.bt -= dt;
          if (s.bt <= 0) {
            s.bt = 0.07;
            s.burst--;
            if (s.target && isFoe(s.target)) shotFrom(g, p.x, p.y - 3, angleTo(p.x, p.y - 3, s.target.x, s.target.y), { tag: 'sentry', split: 0 });
          }
        }
        const now = new Set<Enemy>();
        for (const e of g.enemies) if (isFoe(e) && dist2(p.x, p.y, e.x, e.y) <= 90 * 90) now.add(e);
        const idle = g.time - (g.mem.sentryShot ?? -9) >= 1.5;
        if (idle && s.burst === 0 && g.time - s.cd >= 2) {
          for (const e of now) {
            if (s.inside.has(e)) continue;
            s.target = e;
            s.burst = 5;
            s.bt = 0;
            s.cd = g.time;
            g.fx.ring(p.x, p.y, C.red, 90, 0.3);
            break;
          }
        }
        s.inside = now;
      },
    },
  },

  // ================================================================ Ремонтный дрон
  {
    id: 'pRepairPatch', kind: 'passive', quality: 2, tags: ['nano'], fromEnemy: 'repair',
    name: { ru: 'Протокол латания', en: 'Patching Protocol' },
    desc: {
      ru: 'Каждые 12 убийств — +1 жизнь (не чаще раза в 2 комнаты); при полном здоровье — щит на 1 попадание в комнате.',
      en: 'Every 12 kills — +1 life (at most once per 2 rooms); at full health — a shield for 1 hit in the room.',
    },
    icon: { shape: 'wrench', color: C.amber, accent: C.red },
    hooks: {
      onRoomEnter(g) {
        const id = g.zone?.id;
        if (id === undefined) return;
        const seen = (g.mem.patchRooms ??= new Set<number>()) as Set<number>;
        if (seen.has(id)) return;
        seen.add(id);
        g.mem.patchSince = (g.mem.patchSince ?? 2) + 1;
      },
      onKill(g) {
        g.mem.patchKills = (g.mem.patchKills ?? 0) + 1;
        if (g.mem.patchKills < 12 || (g.mem.patchSince ?? 2) < 2) return;
        g.mem.patchKills -= 12;
        g.mem.patchSince = 0;
        const p = g.player;
        if (p.lives < p.stats.maxLives) p.lives++;
        else p.shieldLeft++;
        g.fx.burst(p.x, p.y, C.red, 10, 50, 0.4, 1, true);
      },
      gauge: (g) => ({ kind: 'bar', color: C.redD, k: Math.min(1, (g.mem.patchKills ?? 0) / 12) }),
    },
  },
  {
    id: 'pRepairDaisy', kind: 'passive', quality: 2, tags: ['nano'], fromEnemy: 'repair',
    name: { ru: 'Прошивка «Ромашка»', en: '"Daisy" Firmware' },
    desc: {
      ru: 'Первый снаряд после 1 с без попаданий по вам распускается 5 лепестками: они облетают по дуге и возвращаются к вам (урон 45%); пойманный лепесток — 1% заряда сбоя.',
      en: 'The first shot after 1 s without being hit blooms into 5 petals: they arc out and return to you (45% damage); a caught petal gives 1% glitch charge.',
    },
    icon: { shape: 'petal', color: C.bone, accent: C.yellow },
    hooks: {
      onDefend(g) {
        g.mem.daisyHurt = g.time;
      },
      onHurt(g) {
        g.mem.daisyHurt = g.time;
      },
      onShoot(g, angle) {
        // раз в секунду, пока по вам не попадали
        if (g.time - Math.max(g.mem.daisyHurt ?? -9, g.mem.daisyT ?? -9) < 1) return;
        g.mem.daisyT = g.time;
        for (let i = 0; i < 5; i++) petal(g, angle + (i - 2) * 0.45, i < 2 ? -1 : i > 2 ? 1 : 0);
      },
      gauge: (g) => (g.time - Math.max(g.mem.daisyHurt ?? -9, g.mem.daisyT ?? -9) >= 1 ? { kind: 'pips', color: C.bone, n: 1, max: 1 } : null),
    },
  },
  {
    id: 'pRepairTether', kind: 'passive', quality: 2, tags: ['electric'], fromEnemy: 'repair',
    name: { ru: 'Сцепной луч', en: 'Tether Beam' },
    desc: {
      ru: 'Попав по двум врагам за 1,5 с, сцепляете их сварочным лучом на 2,5 с: луч гасит вражеские пули и жжёт всех, кого пересекает.',
      en: 'Hit two enemies within 1.5 s to weld them together with a beam for 2.5 s: it cancels enemy bullets and burns everyone it crosses.',
    },
    icon: { shape: 'lightning', color: C.yellow, accent: C.steel },
    hooks: {
      onHit(g, e, hit) {
        if (hit.tag === 'tether' || e.team !== 'foe') return;
        const s = st(g, 'tether', () => ({ e: null as Enemy | null, t: -9, ally: -9 }));
        const dps = shotDmg(g) * 2;
        if (s.e && s.e !== e && !s.e.dead && g.time - s.t <= 1.5 && !isTethered(g, e) && !isTethered(g, s.e) && objsOf(g, 'tether').length < 3) {
          tether(g, s.e, e, { life: 2.5, dps });
          s.e = null;
          return;
        }
        s.e = e;
        s.t = g.time;
        // «Мастерская»: луч можно натянуть между врагом и союзником
        if (hasSyn(g, SYN.repair2) && g.time - s.ally >= 1.5 && !isTethered(g, e)) {
          const a = g.enemies.find((o) => !o.dead && o.summon && o.spawn <= 0 && !isTethered(g, o) && dist2(o.x, o.y, e.x, e.y) < 160 * 160);
          if (a) {
            tether(g, e, a, { life: 2.5, dps });
            s.ally = g.time;
          }
        }
      },
    },
  },
  {
    id: 'pRepairSalvage', kind: 'passive', quality: 2, tags: ['nano'], fromEnemy: 'repair',
    name: { ru: 'Протокол «Перебор»', en: '"Overhaul" Protocol' },
    desc: {
      ru: 'Убитые враги-роботы роняют запчасть (6 с); подобранная сокращает отключение нестабильного предмета на 4 с, а если отключённых нет — +1 энергоячейка.',
      en: 'Slain robot enemies drop a spare part (6 s); picking it up shortens an unstable item’s shutdown by 4 s, or gives +1 energy cell if nothing is shut down.',
    },
    icon: { shape: 'wrench', color: C.steelL, accent: C.yellow },
    hooks: {
      onKill(g, e) {
        if (e.def.kind !== 'robot' || e.summon) return;
        spawnScrap(g, 'part', e.x, e.y, 6, C.yellow, (g) => salvage(g));
      },
    },
  },

  // ================================================================ Дрон-гончая (14а: только волны розыска 4–5)
  {
    id: 'pHuntLead', kind: 'passive', quality: 2, tags: ['smart'], fromEnemy: 'hunter',
    name: { ru: 'Прошивка «Упреждение»', en: '"Lead" Firmware' },
    desc: {
      ru: 'Выстрел доворачивает в точку упреждения движущегося врага в секторе ±25° от прицела. Скорость снарядов +10%.',
      en: 'Shots turn toward the lead point of a moving enemy within ±25° of your aim. Shot speed +10%.',
    },
    icon: { shape: 'crosshair', color: C.redL, accent: C.steelL },
    stats: (s) => {
      s.shotSpeed *= 1.1;
    },
    hooks: {
      tick: trackFoes,
      adjustAim(g, angle) {
        const p = g.player;
        if (p.gun.weapon?.manual || p.gun.weapon?.mode === 'melee') return angle;
        // «Охота» (ядро набора): сектор вдвое шире
        const arc = ((hasSyn(g, SYN.hunter1) ? 50 : 25) * Math.PI) / 180;
        const tr = st(g, 'huntLead', () => ({ v: new WeakMap<Enemy, { x: number; y: number; vx: number; vy: number }>() }));
        let best: Enemy | null = null, bd = Infinity;
        for (const e of g.enemies) {
          if (!isFoe(e)) continue;
          const d = Math.abs(angleDiff(angle, angleTo(p.x, p.y, e.x, e.y)));
          if (d > arc || dist2(p.x, p.y, e.x, e.y) > p.stats.range ** 2) continue;
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (!best) return angle;
        const v = tr.v.get(best);
        const t = Math.sqrt(dist2(p.x, p.y, best.x, best.y)) / Math.max(60, p.stats.shotSpeed);
        return angleTo(p.x, p.y - 3, best.x + (v?.vx ?? 0) * t, best.y + (v?.vy ?? 0) * t);
      },
    },
  },
  {
    id: 'pHuntChase', kind: 'passive', quality: 2, tags: ['kinetic'], fromEnemy: 'hunter',
    name: { ru: 'Прошивка «Гон»', en: '"Chase" Firmware' },
    desc: {
      ru: 'После убийства 2 с скорость +20%, а следующий залп наносит ×1,5 урона.',
      en: 'After a kill: speed +20% for 2 s, and your next volley deals ×1.5 damage.',
    },
    icon: { shape: 'boot', color: C.redD, accent: C.yellow },
    hooks: {
      onKill(g) {
        g.player.addBuff('huntChase', 2, (s) => {
          s.speed *= 1.2;
        });
        g.mem.huntChaseShot = true;
      },
      onVolleyShot(g, b) {
        if (g.mem.huntChaseShot) shotK(b, 'chase', 1.5);
      },
      onShoot(g) {
        g.mem.huntChaseShot = false;
      },
    },
  },
  {
    id: 'pHuntQuiet', kind: 'passive', quality: 2, tags: ['stealth'], fromEnemy: 'hunter',
    name: { ru: 'Тихий сигнал', en: 'Quiet Signal' },
    desc: {
      ru: 'Розыск растёт на 20% медленнее; камерам нужно на 30% дольше, чтобы вас заметить.',
      en: 'Wanted level grows 20% slower; cameras need 30% longer to spot you.',
    },
    icon: { shape: 'antenna', color: C.redD, accent: C.steelL },
    stats: (s) => {
      s.heatMult *= 0.8;
      s.spotTime *= 1.3;
    },
  },
  {
    id: 'pHuntPack', kind: 'passive', quality: 2, tags: ['smart'], fromEnemy: 'hunter',
    name: { ru: 'Прошивка «Стая»', en: '"Pack" Firmware' },
    desc: {
      ru: 'В бою раз в 10 с прилетает дрон-гончая — ваш союзник на 6 с: очереди по врагам и пике.',
      en: 'In combat, every 10 s a hound drone arrives as your ally for 6 s: bursts at enemies and dives.',
    },
    icon: { shape: 'swarm', color: C.red, accent: C.steelL },
    hooks: {
      tick(g, dt) {
        const s = st(g, 'huntPack', () => ({ t: 4 }));
        if (!g.inCombat()) return;
        s.t -= dt;
        if (s.t > 0) return;
        // «Свора» (весь набор): вдвое чаще и с «Гоном»
        const pack = hasSyn(g, SYN.hunter2);
        s.t = pack ? 5 : 10;
        const p = g.player;
        const a = summonAlly(g, ENEMY_BY_ID.get('hunter')!, p.x + (Math.random() - 0.5) * 30, p.y - 22, 1, 6);
        a.mem.pack2 = pack;
      },
    },
  },
];

const tripod = (s: Stats) => {
  s.hitR *= 0.7;
  s.pierce += 1;
};
