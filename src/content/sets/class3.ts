import { TAU, angleTo, dist2 } from '../../core/math';
import { C } from '../../gfx/palette';
import type { PBullet } from '../../game/bullets';
import { moveBody } from '../../game/collision';
import { damageEnemy, explode, fan, fireMelee, spawnShot } from '../../game/combat';
import type { Enemy } from '../../game/enemy';
import type { Game } from '../../game/game';
import type { ItemDef } from '../../game/items';
import { nearestFoe, shotDmg, shotFrom } from '../../game/minions';
import { addObj, objsOf } from '../../game/objects';
import {
  STACK_COLOR, addStack, bossLike, crippleDrive, isFoe, isNormal, nearestOther, stackCount, takeStacks, tossEnemy, transferStacks,
} from '../../game/status';
import type { Stats } from '../../game/stats';
import { addZone, isFire, isSmallBullet } from '../../game/zones';
import { T } from '../../world/tiles';
import { SYN, childShot, eraseBullets, hasSyn, ignite, knockTo, ringShots, st, stun } from './common';

// Предметы наборов врагов III класса (редкость 3, нестабильные): Резчик, Кочегар,
// Тяжёлый штурмовик (киборги), Прыгун «Блоха» (робот). Числа — заметка «Наборы врагов — этап 12».

STACK_COLOR.set('notch', C.red);
STACK_COLOR.set('flea', C.amber);

// ---------------------------------------------------------------- Резчик

const CUT_LEN = 130;
const CUT_T = 0.16;

interface Cut {
  phase: 'wind' | 'cut';
  t: number;
  a: number;
  x0: number;
  y0: number;
  hit: Set<Enemy>;
  recharged: boolean;
}

/** Срыв насечек: +per урона за каждую */
export function ripNotches(g: Game, e: Enemy, per: number): number {
  const n = takeStacks(e, 'notch');
  if (!n || e.dead) return n;
  damageEnemy(g, e, per * n, e.x, e.y - 1, { silent: true, source: 'melee', tag: 'rip' });
  g.fx.burst(e.x, e.y, C.red, 4 + n, 60, 0.25, 1, true);
  return n;
}

/** Насечка от укола «Шила» (с «Жатвой» враг в замахе получает 2) */
function notch(g: Game, e: Enemy) {
  addStack(e, 'notch', hasSyn(g, SYN.cutter2) && e.windup > 0 ? 2 : 1, 5, 4);
}

/** Рез «Росчерка» по врагу: ×4, срыв насечек, «Цепной росчерк» и «Жатва» */
function cutHit(g: Game, c: Cut, e: Enemy) {
  const p = g.player;
  const wind = e.windup > 0;
  const harvest = hasSyn(g, SYN.cutter2) && stackCount(e, 'notch') >= 5;
  damageEnemy(g, e, shotDmg(g) * 4, p.x, p.y, { source: 'melee', tag: 'cut', knockback: 80 });
  // «Жатва»: вскрытие — +8 за насечку и мгновенная перезарядка E
  ripNotches(g, e, harvest ? 8 : 4);
  if (harvest) p.shoveCd = 0;
  // «Цепной росчерк»: рез сквозь врага в замахе или убийство резом — сразу перезарядка (до 3 подряд)
  if (hasSyn(g, SYN.cutter1) && (wind || e.dead) && (g.mem.cutChain ?? 0) < 3) {
    g.mem.cutChain = (g.mem.cutChain ?? 0) + 1;
    c.recharged = true;
    p.shoveCd = 0;
  }
}

function sickleTick(g: Game, dt: number) {
  const c = g.mem.cut as Cut | null;
  if (!c) return;
  const p = g.player;
  c.t -= dt;
  if (c.phase === 'wind') {
    if (Math.random() < dt * 30) g.fx.add({ kind: 'spark', x: p.x + (Math.random() - 0.5) * 8, y: p.y - 6, vx: 0, vy: -30, color: C.bone, life: 0.15, glow: true });
    if (c.t > 0) return;
    c.phase = 'cut';
    c.t = CUT_T;
    c.a = p.aimAngle;
    c.x0 = p.x;
    c.y0 = p.y;
  }
  // рез-бросок: в броске неуязвим, враги на пути — ×4
  const sp = CUT_LEN / CUT_T;
  const body = { x: p.x, y: p.y, r: p.bodyR };
  moveBody(g.room, body, Math.cos(c.a) * sp * dt, Math.sin(c.a) * sp * dt, (t, tx, ty) => g.playerSolid(t, tx, ty, true));
  p.x = body.x;
  p.y = body.y;
  p.invuln = Math.max(p.invuln, 0.1);
  g.fx.add({ kind: 'slash', x: p.x, y: p.y - 3, angle: c.a, arc: 1.2, size: 14, color: C.bone, life: 0.1, glow: true });
  for (const e of g.enemies) {
    if (!isFoe(e) || c.hit.has(e) || dist2(p.x, p.y, e.x, e.y) > (e.r + 8) ** 2) continue;
    c.hit.add(e);
    cutHit(g, c, e);
  }
  if (c.t > 0) return;
  g.mem.cut = null;
  if (!c.recharged) g.mem.cutChain = 0;
  if (p.has('iCutterTrail')) shavings(g, c.x0, c.y0, p.x, p.y);
}

/** «Стружка»: ряд висящих лезвий вдоль пути; через 0,45 с срываются поперёк пути */
export function shavings(g: Game, x0: number, y0: number, x1: number, y1: number) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 8 || g.pbullets.length > 460) return;
  const a = Math.atan2(y1 - y0, x1 - x0);
  const n = Math.max(2, Math.floor(len / 12));
  const chain = hasSyn(g, SYN.cutter1), harvest = hasSyn(g, SYN.cutter2);
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - 3;
    const side = i % 2 ? 1 : -1;
    childShot(g, x, y, a + (side * Math.PI) / 2, {
      speed: 0, dmg: shotDmg(g), pierce: 1, r: 2, life: 1.1, maxLife: 1.1, style: 'needle', color: C.bone, tag: 'shaving',
      step(g, b) {
        if (b.t < 0.45 || b.data?.out) return;
        (b.data ??= {}).out = true;
        b.speed = 240;
        // «Цепной росчерк»: лезвия доворачивают к врагам
        if (chain) b.homing = 3;
      },
      onHitEnemy: harvest ? (g, _b, e) => notch(g, e) : undefined,
    });
  }
}

/** Лезвия «Ножен»: 2 лезвия на орбите 22 px, оборот 0,8 с — пока атака на E перезаряжается */
function sheathTick(g: Game) {
  const p = g.player;
  const on = p.shoveCd > 0 && !p.twoHanded;
  const o = objsOf(g, 'sheath')[0];
  if (!on) {
    if (o) o.dead = true;
    return;
  }
  if (o) return;
  addObj(g, {
    kind: 'sheath', x: p.x, y: p.y, r: 22, layer: 'air', data: { a: 0, hitT: new Map<Enemy, number>(), cut: [-9, -9] },
    update(g, s, dt) {
      const p = g.player;
      s.x = p.x;
      s.y = p.y - 3;
      s.data.a += (TAU / 0.8) * dt;
      const harvest = hasSyn(g, SYN.cutter2);
      let erased = false;
      for (let k = 0; k < 2; k++) {
        const bx = s.x + Math.cos(s.data.a + k * Math.PI) * 22, by = s.y + Math.sin(s.data.a + k * Math.PI) * 22;
        for (const e of g.enemies) {
          if (!isFoe(e) || dist2(bx, by, e.x, e.y) > (e.r + 3) ** 2) continue;
          const last = s.data.hitT.get(e) ?? -9;
          if (g.time - last < 0.25) continue;
          s.data.hitT.set(e, g.time);
          damageEnemy(g, e, shotDmg(g) * 0.6, bx, by, { source: 'other', tag: 'sheath', knockback: 30 });
          // «Жатва»: касание срывает 1 насечку
          if (harvest && stackCount(e, 'notch') > 0) {
            takeStacks(e, 'notch', 1);
            damageEnemy(g, e, 4, bx, by, { silent: true, tag: 'rip' });
          }
        }
        // гасит обычную пулю: каждое лезвие — не больше 1 в 0,5 с
        if (g.time - s.data.cut[k] < 0.5) continue;
        for (const b of g.ebullets) {
          if (b.dead || !isSmallBullet(b) || dist2(bx, by, b.x, b.y) > (b.r + 3) ** 2) continue;
          b.dead = erased = true;
          s.data.cut[k] = g.time;
          g.fx.add({ kind: 'dot', x: b.x, y: b.y, color: C.bone, life: 0.2, glow: true });
          break;
        }
      }
      if (erased) g.ebullets = g.ebullets.filter((b) => !b.dead);
    },
    draw(g, s, ctx, x, y) {
      for (let k = 0; k < 2; k++) {
        const a = s.data.a + k * Math.PI;
        const bx = x + Math.cos(a) * 22, by = y + Math.sin(a) * 22;
        ctx.strokeStyle = C.bone;
        ctx.beginPath();
        ctx.moveTo(bx - Math.sin(a) * 3, by + Math.cos(a) * 3);
        ctx.lineTo(bx + Math.sin(a) * 3, by - Math.cos(a) * 3);
        ctx.stroke();
      }
    },
  });
}

// ---------------------------------------------------------------- Кочегар

const TANK = 2;

/** Игрок стоит в своём огне */
function inOwnFire(g: Game): boolean {
  const p = g.player;
  return g.objs.some((o) => isFire(o) && dist2(o.x, o.y, p.x, p.y) <= o.r * o.r);
}

/** Угли кочерги: тлеют 5 с, до 12 на комнату */
function ember(g: Game, x: number, y: number) {
  const z = addZone(g, 'fire', x, y, 5, 5, { dps: 3, tag: 'ember', max: 12 });
  if (g.zone) z.room = g.zone.id;
  z.roomWasCleared = true;
}

/** Снаряд «жар» Топки */
function heat(g: Game, a: number, boosted: boolean) {
  const p = g.player;
  shotFrom(g, p.x, p.y - 3, a, {
    dmg: 6 * p.stats.damageMult * (boosted ? 2 : 1), burn: 3, homing: 3, speed: 220, r: boosted ? 3.5 : 2.5,
    style: 'flame', color: C.amber, tag: 'heat', split: 0, pierce: 0,
    explode: boosted ? 18 : 0,
  });
}

function furnace(g: Game) {
  const p = g.player;
  // «Доменная печь»: огонь со всей комнаты, угли и лужи — усиленный жар
  const full = hasSyn(g, SYN.stoker2);
  const R = full ? 420 : 140;
  const src: boolean[] = [];
  for (const o of g.objs) {
    if (!isFire(o) || dist2(o.x, o.y, p.x, p.y) > R * R) continue;
    o.dead = true;
    src.push(full && (o.data.tag === 'ember' || o.data.tag === 'fuel'));
    g.fx.add({ kind: 'dot', x: o.x, y: o.y, vy: -30, color: C.amber, life: 0.3, glow: true });
  }
  for (const e of g.enemies) {
    if (!isFoe(e) || e.burnT <= 0 || dist2(e.x, e.y, p.x, p.y) > R * R) continue;
    e.burnT = 0;
    e.burnDps = 0;
    src.push(false);
  }
  const list = src.slice(0, 24);
  const n = list.length || 6;
  const off = Math.random() * TAU;
  for (let i = 0; i < n; i++) heat(g, off + (i / n) * TAU, list[i] ?? false);
  g.mem.furnaceCut = 0;
  g.fx.ring(p.x, p.y, C.amber, Math.min(R, 140), 0.4);
}

// ---------------------------------------------------------------- Тяжёлый штурмовик

const WALL_AT = 130;

/** Пуля «Вала»: веер сходится в стену на ~130; «Живая стена» — замирает там и гасит пули */
function rampartPellet(g: Game, angle: number, off: number, burst: number, volley: number): Partial<PBullet> {
  const p = g.player;
  const tx = p.x + Math.cos(angle) * WALL_AT - Math.sin(angle) * off * 7;
  const ty = p.y - 3 + Math.sin(angle) * WALL_AT + Math.cos(angle) * off * 7;
  return {
    tag: 'rampart', life: 1.6, maxLife: 1.6,
    data: { burst, volley, sx: p.x, sy: p.y - 3, tx, ty, dir: angle },
    step(g, b, dt) {
      const d = b.data!;
      if (d.hold !== undefined) {
        // стена: стоит и гасит вражеские пули
        d.hold -= dt;
        for (const eb of g.ebullets) if (!eb.dead && dist2(eb.x, eb.y, b.x, b.y) < (eb.r + b.r + 1) ** 2) {
          eb.dead = true;
          g.fx.add({ kind: 'dot', x: eb.x, y: eb.y, color: C.amber, life: 0.2, glow: true });
        }
        if (d.hold <= 0) {
          b.speed = d.speed;
          b.pierce = d.pierce;
          d.hold = undefined;
          d.done = true;
        }
        return;
      }
      if (d.done) return;
      const went = Math.hypot(b.bx - d.sx, b.by - d.sy);
      if (went < WALL_AT - 6) {
        const want = angleTo(b.bx, b.by, d.tx, d.ty);
        let diff = want - b.angle;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        b.angle += Math.max(-8 * dt, Math.min(8 * dt, diff));
        return;
      }
      b.angle = d.dir;
      d.done = true;
      if (hasSyn(g, SYN.heavy1)) {
        d.hold = (g.mem.beltLvl ?? 0) >= 3 ? 1.6 : 0.8;
        d.speed = b.speed;
        d.pierce = b.pierce;
        b.speed = 0;
        b.pierce = 99;
        b.life += d.hold;
        b.maxLife += d.hold;
        // done снимется, когда стена отстоит
        d.done = false;
      }
    },
    onHitEnemy(g, b, e) {
      const hits = ((e.mem.rampart ??= {}) as Record<number, Set<number>>)[b.data!.burst] ??= new Set();
      hits.add(b.data!.volley);
      if (hits.size < 3) return;
      delete (e.mem.rampart as Record<number, Set<number>>)[b.data!.burst];
      // все три залпа в одного врага: сбит с ног; босс — +30% урона на 2 с
      if (bossLike(e)) {
        e.hackK = Math.max(e.hackK, 0.3);
        e.hackT = Math.max(e.hackT, 2);
      } else stun(e, 0.6);
      g.fx.ring(e.x, e.y, C.amber, e.r + 6, 0.3);
    },
  };
}

/** Граната «Заряжающего»: взрыв 28, урон 10, гасит обычные пули в радиусе */
function grenadeBoom(g: Game, b: PBullet) {
  if (b.data?.boomed) return;
  (b.data ??= {}).boomed = true;
  explode(g, b.x, b.y, 28, 10 * g.player.stats.damageMult, C.amber, 'grenade');
  eraseBullets(g, b.x, b.y, 28, C.amber, (eb) => isSmallBullet(eb));
}

function grenade(g: Game, a: number) {
  const p = g.player;
  shotFrom(g, p.x, p.y - 3, a, {
    speed: 220, dmg: 0.01, r: 3, life: 0.6, maxLife: 0.6, style: 'orb', color: C.amber, tag: 'grenade', split: 0, explode: 0, pierce: 0, homing: 0,
    onHitEnemy: (g, b) => grenadeBoom(g, b),
    onEnd: (g, b) => grenadeBoom(g, b),
  });
}

/** Болванка: медленная, урон 15, крупная; до стены пробивает всех, ломает ящики, снимает щиты, отбрасывает */
export function slug(g: Game, a: number) {
  const p = g.player;
  shotFrom(g, p.x, p.y - 3, a, {
    speed: 140, dmg: 15 * p.stats.damageMult, r: 6, pierce: 999, life: 3, maxLife: 3, style: 'orb', color: C.steelL, tag: 'slug', split: 0, explode: 0, homing: 0, bounce: 0,
    step(g, b, dt) {
      // ящики и укрытия впереди — разбиваются, болванка летит дальше
      const nx = b.bx + Math.cos(b.angle) * (b.speed * dt + b.r), ny = b.by + Math.sin(b.angle) * (b.speed * dt + b.r);
      if (g.room.at(nx, ny) === T.Crate) g.hitTile(nx, ny, 999);
    },
    onHitEnemy(g, b, e) {
      e.shieldOff = Math.max(e.shieldOff, 3);
      if (!bossLike(e)) {
        const k = Math.atan2(e.y - b.y, e.x - b.x);
        e.kx = (Math.cos(k) * 60) / 0.6;
        e.ky = (Math.sin(k) * 60) / 0.6;
      }
      // «Огневой вал»: болванка подхватывает заряды — взрыв при каждом пробитии
      if (hasSyn(g, SYN.heavy2) && (g.mem.loads ?? 0) > 0) {
        g.mem.loads--;
        grenadeBoom(g, { ...b, data: {} } as PBullet);
      }
    },
  });
}

// ---------------------------------------------------------------- «Блоха»

/** Подброс «Катапульты»: падение — ×2 + набранный урон и кольцо из 8 снарядов (60%) */
export function catapult(g: Game, e: Enemy) {
  e.mem.catT = g.time;
  tossEnemy(g, e, 0.7, (e, acc) => {
    damageEnemy(g, e, shotDmg(g) * 2 + acc, e.x, e.y - 1, { silent: true, tag: 'catapult' });
    ringShots(g, e.x, e.y, 8, { dmg: shotDmg(g) * 0.6, r: 2, life: 0.5, maxLife: 0.5, tag: 'catapult' });
    // «Блошиный цирк»: упавший рассыпает по блохе на врагов в радиусе 60
    if (hasSyn(g, SYN.flea2)) for (const o of g.enemies) if (o !== e && isFoe(o) && dist2(o.x, o.y, e.x, e.y) <= 60 * 60) addFlea(g, o);
  });
}

/** Блоха на врага (до 3 на врага, 12 на всех) */
export function addFlea(g: Game, e: Enemy) {
  if (e.dead) return;
  let total = 0;
  for (const o of g.enemies) if (!o.dead) total += stackCount(o, 'flea');
  if (total >= 12) return;
  addStack(e, 'flea', 1, 3, 9999);
}

/** Укус в привод: −15% скорости и поворота на 3 с (до −45%); боссы — вдвое меньше (до −20%) */
function driveBite(e: Enemy) {
  const boss = bossLike(e);
  crippleDrive(e, boss ? 0.075 : 0.15, 3, boss ? 0.2 : 0.45);
}

/** Навесной снаряд (bounce — номер отскока: 0 — первое падение ×1,5, затем ×1 и ×0,6) */
function lobify(b: PBullet) {
  b.arc = 22;
  b.landR = 18;
  const d = (b.data ??= {});
  d.lob = 0;
  d.base0 = b.dmg;
  b.dmg *= 1.5;
}

// ---------------------------------------------------------------- предметы

/** Одна ступень «Ленты» (до 3, складываются) */
const beltStep = (s: Stats) => {
  s.spread *= 0.75;
  s.jitter *= 0.75;
  s.pierce += 1;
};

export const CLASS3: ItemDef[] = [
  // ================================================================ Резчик
  {
    id: 'iCutterSickle', kind: 'implant', slot: 'armL', quality: 3, unstable: 2, tags: ['blade'], fromEnemy: 'mantis',
    name: { ru: 'Серп-рука «Росчерк»', en: '"Slash" Sickle Arm' },
    desc: {
      ru: '[E] Замах 0,3 с, затем рез-бросок на 130 к прицелу: в броске вы неуязвимы, враги на пути получают ×4 урона. Перезарядка 3 с.',
      en: '[E] A 0.3 s wind-up, then a 130-long cutting lunge toward your aim: invulnerable during it, enemies in the path take ×4 damage. Cooldown 3 s.',
    },
    icon: { shape: 'claw', color: C.bone, accent: C.redD },
    leftHand: {
      cooldown: 3,
      use(g) {
        if (g.mem.cut) return;
        const p = g.player;
        g.mem.cut = { phase: 'wind', t: 0.3, a: p.aimAngle, x0: p.x, y0: p.y, hit: new Set(), recharged: false } satisfies Cut;
      },
    },
    hooks: { tick: sickleTick },
  },
  {
    id: 'iCutterTrail', kind: 'implant', slot: 'back', quality: 3, unstable: 1, tags: ['blade'], fromEnemy: 'mantis',
    name: { ru: 'Спинной шлейф «Стружка»', en: '"Shavings" Spine Trail' },
    desc: {
      ru: 'Рывок и рез оставляют ряд висящих лезвий; через 0,45 с они срываются поперёк пути (×1 урона, пробивают 1).',
      en: 'Dashes and cuts leave a row of hanging blades; after 0.45 s they fly off across the path (×1 damage, pierce 1).',
    },
    icon: { shape: 'spine', color: C.bone, accent: C.steelL },
    hooks: {
      onDash(g) {
        g.mem.trailX = g.player.x;
        g.mem.trailY = g.player.y;
      },
      onDashEnd(g) {
        shavings(g, g.mem.trailX ?? g.player.x, g.mem.trailY ?? g.player.y, g.player.x, g.player.y);
      },
    },
  },
  {
    id: 'iCutterSensor', kind: 'implant', slot: 'head', quality: 3, unstable: 1, tags: ['optic'], fromEnemy: 'mantis',
    name: { ru: 'Сенсор «Замах»', en: '"Wind-up" Sensor' },
    desc: {
      ru: 'Враг, готовящий атаку, получает ×1,75 урона; первое попадание в замах с шансом 50% срывает атаку.',
      en: 'An enemy winding up an attack takes ×1.75 damage; the first hit during a wind-up has a 50% chance to cancel the attack.',
    },
    icon: { shape: 'eye', color: C.bone, accent: C.redD },
    stats: (s) => {
      s.windupMult *= 1.75;
    },
    hooks: {
      onHit(g, e) {
        if (e.windup <= 0 || e.windupHit) return;
        e.windupHit = true;
        if (Math.random() >= 0.5) return;
        e.def.interrupt?.(e, g);
        e.windup = 0;
        g.fx.ring(e.x, e.y, C.bone, e.r + 6, 0.25);
      },
    },
  },
  {
    id: 'iCutterSheath', kind: 'implant', slot: 'torso', quality: 3, unstable: 1, tags: ['blade'], fromEnemy: 'mantis',
    name: { ru: 'Кираса «Ножны»', en: '"Scabbard" Cuirass' },
    desc: {
      ru: 'Пока атака на E перезаряжается (серп, любой модуль левой руки или толчок) — вокруг 2 лезвия (орбита 22, оборот 0,8 с): касание 60% урона выстрела (по одному врагу не чаще 0,25 с); гасят обычные вражеские пули — каждое лезвие не больше 1 пули в 0,5 с.',
      en: 'While your E attack recharges (sickle, any left-arm module or shove) — 2 blades orbit you (radius 22, 0.8 s per turn): a touch deals 60% shot damage (once per 0.25 s per enemy); they cancel normal enemy bullets — each blade at most 1 bullet per 0.5 s.',
    },
    icon: { shape: 'blade', color: C.steelL, accent: C.red },
    hooks: { tick: sheathTick },
  },
  {
    id: 'wCutterAwl', kind: 'weapon', quality: 3, unstable: 1, tags: ['blade'], fromEnemy: 'mantis',
    name: { ru: 'Шило «Насечка»', en: '"Notch" Awl' },
    desc: {
      ru: '6 уколов в секунду, дальность 90, урон 3; попадание ставит насечку (до 5, 4 с, обновляется). Срыв (рез «Росчерка», удар вплотную) — +4 урона за насечку; при убийстве насечки переходят на ближайшего врага в радиусе 50.',
      en: '6 stabs per second, range 90, 3 damage; a hit leaves a notch (up to 5, 4 s, refreshes). Ripping them (a Slash cut, a melee strike) deals +4 per notch; on a kill, notches jump to the nearest enemy within 50.',
    },
    icon: { shape: 'blade', color: C.bone, accent: C.red },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 3;
        s.fireDelay = 1 / 6;
        s.range = 90;
        s.shotSpeed = 360;
        s.size = 0.8;
        s.shotStyle = 'needle';
        s.shotColor = C.bone;
      },
      fire(g, angle, s) {
        fan(g, angle, s, { tag: 'awl', onHitEnemy: (g, _b, e) => notch(g, e) });
      },
    },
    hooks: {
      onHit(g, e, hit) {
        // удар вплотную срывает насечки (рез срывает сам)
        if (hit.source === 'melee' && hit.tag !== 'cut' && hit.tag !== 'rip') ripNotches(g, e, 4);
      },
      onKill(g, e) {
        transferStacks(g, e, 'notch', 50, 5, 4);
      },
    },
  },

  // ================================================================ Кочегар
  {
    id: 'iStokerSprayer', kind: 'implant', slot: 'armL', quality: 3, unstable: 2, tags: ['fire'], fromEnemy: 'flamer',
    name: { ru: 'Рукав-распылитель', en: 'Sprayer Sleeve' },
    desc: {
      ru: '[E, держать] Распыляет конус горючего (75). Лужи держатся 4 с и вспыхивают от ваших снарядов или огня: поджог 6/с, мелкие пули сгорают. Бак на 2 с, восполняется за 4 с.',
      en: '[E, hold] Sprays a cone of fuel (75). Puddles last 4 s and ignite from your shots or fire: 6/s burn, small bullets burn up. The tank holds 2 s and refills in 4 s.',
    },
    icon: { shape: 'flame', color: C.amberD, accent: C.steel },
    leftHand: {
      cooldown: 0,
      use() {},
      hold(g, angle, dt) {
        const p = g.player;
        // «Полная топка»: стоя в своём огне, бак не расходуется
        const free = hasSyn(g, SYN.stoker1) && inOwnFire(g);
        const tank = g.mem.tank ?? TANK;
        if (tank <= 0 && !free) return;
        if (!free) g.mem.tank = Math.max(0, tank - dt);
        g.mem.sprayT = g.time;
        if (Math.random() < dt * 40) g.fx.add({ kind: 'dot', x: p.x + Math.cos(angle) * 8, y: p.y - 3 + Math.sin(angle) * 8, vx: Math.cos(angle) * 120, vy: Math.sin(angle) * 120, color: C.amberD, life: 0.4, size: 2, drag: 3 });
        g.mem.sprayCd = (g.mem.sprayCd ?? 0) - dt;
        if (g.mem.sprayCd > 0) return;
        g.mem.sprayCd = 0.07;
        const a = angle + (Math.random() - 0.5) * 0.7, d = 20 + Math.random() * 55;
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        addZone(g, 'fuel', x, y, 9, 4, { dps: 6, tag: 'fuel', max: 40 });
      },
    },
    hooks: {
      tick(g, dt) {
        if (g.time - (g.mem.sprayT ?? -9) > 0.1) g.mem.tank = Math.min(TANK, (g.mem.tank ?? TANK) + (TANK / 4) * dt);
      },
      gauge: (g) => ((g.mem.tank ?? TANK) < TANK ? { kind: 'bar', color: C.amberD, k: (g.mem.tank ?? TANK) / TANK } : null),
    },
  },
  {
    id: 'iStokerSoles', kind: 'implant', slot: 'legs', quality: 3, unstable: 1, tags: ['fire'], fromEnemy: 'flamer',
    name: { ru: 'Подошвы-запальники', en: 'Igniter Soles' },
    desc: {
      ru: 'На бегу оставляете горящий след на 2 с (поджог 5/с). Скорость +10%.',
      en: 'Running leaves a burning trail for 2 s (5/s burn). Speed +10%.',
    },
    icon: { shape: 'boot', color: C.red, accent: C.amber },
    stats: (s) => {
      s.speed *= 1.1;
    },
    hooks: {
      tick(g) {
        const p = g.player;
        const lx = g.mem.solesX, ly = g.mem.solesY;
        if (lx === undefined || !p.moving) {
          g.mem.solesX = p.x;
          g.mem.solesY = p.y;
          return;
        }
        if (dist2(lx, ly, p.x, p.y) < 10 * 10) return;
        g.mem.solesX = p.x;
        g.mem.solesY = p.y;
        addZone(g, 'fire', p.x, p.y + 2, 6, 2, { dps: 5, tag: 'trail', max: 40 });
      },
    },
  },
  {
    id: 'iStokerTank', kind: 'implant', slot: 'back', quality: 3, unstable: 1, tags: ['fire'], fromEnemy: 'flamer',
    name: { ru: 'Ранцевый бак «Кочегарка»', en: '"Boiler Room" Back Tank' },
    desc: {
      ru: 'Попадания обдают врага горючим (поджог 3/с); горящий враг раз в секунду поджигает соседей (в радиусе 40).',
      en: 'Hits douse the enemy in fuel (3/s burn); a burning enemy ignites its neighbours (within 40) once per second.',
    },
    icon: { shape: 'battery', color: C.amberD, accent: C.red },
    hooks: {
      onHit(_g, e) {
        ignite(e, 3);
      },
      tick(g, dt) {
        for (const e of g.enemies) {
          if (!isFoe(e) || e.burnT <= 0) continue;
          e.mem.spreadT = (e.mem.spreadT ?? 0) + dt;
          if (e.mem.spreadT < 1) continue;
          e.mem.spreadT = 0;
          for (const o of g.enemies) if (o !== e && isFoe(o) && dist2(o.x, o.y, e.x, e.y) <= 40 * 40) ignite(o, e.burnDps);
        }
      },
    },
  },
  {
    id: 'iStokerPoker', kind: 'implant', slot: 'armR', quality: 3, unstable: 1, tags: ['fire', 'heavy'], fromEnemy: 'flamer',
    name: { ru: 'Рука-кочерга', en: 'Poker Arm' },
    desc: {
      ru: 'Удар по дуге 100°, досягаемость 34, 2,5 удара в секунду, урон 8, поджог 4/с на 3 с, отбрасывание. Удар по горящему — 3 угля веером (урон 3, поджог); упавшие угли тлеют 5 с (до 12 на комнату).',
      en: 'A 100° arc strike, reach 34, 2.5 strikes per second, 8 damage, 4/s burn for 3 s, knockback. Striking a burning enemy sprays 3 embers (3 damage, burn); fallen embers smoulder for 5 s (up to 12 per room).',
    },
    icon: { shape: 'arm', color: C.amberD, accent: C.redL },
    weapon: {
      mode: 'melee',
      stats: (s) => {
        s.damage = 8;
        s.fireDelay = 0.4;
        s.knockback = 60;
        s.shotColor = C.amber;
      },
      fire(g, angle, s) {
        const burning = new Set(g.enemies.filter((e) => e.burnT > 0));
        fireMelee(g, angle, s, {
          reach: 34, arc: (100 * Math.PI) / 180, tag: 'poker',
          onHitEnemy(g, e) {
            const was = burning.has(e);
            ignite(e, 4, 3);
            if (!was) return;
            for (let i = -1; i <= 1; i++) {
              childShot(g, e.x, e.y, angle + i * 0.45, {
                dmg: 3 * g.player.stats.damageMult, burn: 3, speed: 160, r: 1.8, life: 0.35, maxLife: 0.35, style: 'flame', color: C.amber, tag: 'ember',
                hit: new Set([e]),
                onEnd: (g, b) => ember(g, b.x, b.y),
              });
            }
          },
        });
      },
    },
  },
  {
    id: 'iStokerFurnace', kind: 'implant', slot: 'torso', quality: 3, unstable: 1, tags: ['fire'], fromEnemy: 'flamer',
    name: { ru: 'Топка', en: 'Firebox' },
    desc: {
      ru: '[Q] Гасит ваш огонь в радиусе 140 (лужи, след, угли, поджог на врагах); каждый источник — снаряд «жар» (урон 6, поджог), до 24, кольцом с доворотом к врагам; без огня — 6 снарядов. Вражеские пули не трогает. Перезарядка 14 с.',
      en: '[Q] Smothers your fire within 140 (puddles, trail, embers, burning enemies); each source becomes a "heat" shot (6 damage, burn), up to 24, in a ring that curves toward enemies; with no fire — 6 shots. Does not touch enemy bullets. Cooldown 14 s.',
    },
    icon: { shape: 'core', color: C.redD, accent: C.amber },
    active: { cooldown: 14, use: furnace },
    hooks: {
      onHit(g, _e, hit) {
        // «Доменная печь»: каждые 4 попавших «жара» — −1 с перезарядки, не больше 6 с за выброс
        if (hit.tag !== 'heat' || !hasSyn(g, SYN.stoker2)) return;
        g.mem.heatHits = (g.mem.heatHits ?? 0) + 1;
        if (g.mem.heatHits % 4 || (g.mem.furnaceCut ?? 0) >= 6) return;
        g.mem.furnaceCut = (g.mem.furnaceCut ?? 0) + 1;
        g.player.activeCd = Math.max(0, g.player.activeCd - 1);
      },
    },
  },

  // ================================================================ Тяжёлый штурмовик
  {
    id: 'wHeavyRampart', kind: 'weapon', quality: 3, unstable: 2, tags: ['heavy', 'kinetic'], fromEnemy: 'heavy',
    name: { ru: 'Залповая пушка «Вал»', en: '"Rampart" Volley Cannon' },
    desc: {
      ru: 'Очередь из 3 веерных залпов по 5 пуль (урон 3), сходятся в стену на ~130. Если все три залпа попали в одного врага — он сбит с ног на 0,6 с (босс получает +30% урона на 2 с).',
      en: 'A burst of 3 fanned volleys of 5 bullets (3 damage) that converge into a wall at ~130. If all three volleys hit one enemy, it is knocked down for 0.6 s (a boss takes +30% damage for 2 s).',
    },
    icon: { shape: 'shotgun', color: C.metal, accent: C.yellow },
    weapon: {
      mode: 'bullet', hands: 2,
      stats: (s) => {
        s.damage = 3;
        s.count = 5;
        s.burst = 3;
        s.fireDelay = 0.9;
        s.shotSpeed = 280;
        s.range = 260;
        s.shotStyle = 'pellet';
      },
      fire(g, angle, s) {
        const v = st(g, 'rampart', () => ({ burst: 0, idx: 0, t: -9 }));
        if (g.time - v.t > 0.15) {
          v.burst++;
          v.idx = 0;
        } else v.idx++;
        v.t = g.time;
        for (let i = 0; i < s.count; i++) {
          const off = i - (s.count - 1) / 2;
          spawnShot(g, angle + off * 0.22, s, rampartPellet(g, angle, off, v.burst, v.idx));
        }
      },
    },
  },
  {
    id: 'iHeavyBelt', kind: 'implant', slot: 'back', quality: 3, unstable: 1, tags: ['heavy'], fromEnemy: 'heavy',
    name: { ru: 'Короб боепитания «Лента»', en: '"Belt" Ammo Box' },
    desc: {
      ru: 'Пока держите огонь, каждую секунду разброс −25% и +1 пробивание (до 3 раз); при полной ленте — дорожка гильз: враги скользят (замедление 30%, 2 с).',
      en: 'While you hold fire, every second: spread −25% and pierce +1 (up to 3 times); with a full belt you leave a trail of casings: enemies slip (30% slow, 2 s).',
    },
    icon: { shape: 'belt', color: C.steel, accent: C.amber },
    hooks: {
      tick(g, dt) {
        const p = g.player;
        g.mem.beltT = p.shooting ? (g.mem.beltT ?? 0) + dt : 0;
        const lvl = Math.min(3, Math.floor(g.mem.beltT));
        g.mem.beltLvl = lvl;
        for (let i = 1; i <= 3; i++) p.setBuff('belt' + i, lvl >= i, beltStep);
        if (lvl < 3) return;
        g.mem.shellCd = (g.mem.shellCd ?? 0) - dt;
        if (g.mem.shellCd > 0) return;
        g.mem.shellCd = 0.2;
        addZone(g, 'shells', p.x, p.y + 2, 8, 3, { slow: 0.3, slowFor: 2, tag: 'shells', max: 30 });
      },
      gauge: (g) => ((g.mem.beltLvl ?? 0) > 0 ? { kind: 'pips', color: C.amber, n: g.mem.beltLvl, max: 3 } : null),
    },
  },
  {
    id: 'iHeavyPlates', kind: 'implant', slot: 'torso', quality: 3, unstable: 1, tags: ['heavy'], fromEnemy: 'heavy',
    name: { ru: 'Бронеплиты «Утюг»', en: '"Flatiron" Armour Plates' },
    desc: {
      ru: '8 с непрерывного огня — плита (лишний заряд щита, не больше 2 за комнату); пока стреляете, скорость −20%; сбитая плита отбрасывает врагов и стирает пули (радиус 60).',
      en: '8 s of continuous fire — a plate (an extra shield charge, at most 2 per room); while firing, speed −20%; a broken plate knocks enemies back and erases bullets (radius 60).',
    },
    icon: { shape: 'plate', color: C.steelL, accent: C.amberD },
    hooks: {
      onRoomEnter(g) {
        g.mem.ironPlates = 0;
        g.mem.ironRoom = 0;
      },
      tick(g, dt) {
        const p = g.player;
        p.setBuff('iron', p.shooting, ironSlow);
        g.mem.ironT = p.shooting ? (g.mem.ironT ?? 0) + dt : 0;
        if (g.mem.ironT < 8) return;
        g.mem.ironT = 0;
        if ((g.mem.ironRoom ?? 0) >= 2) return;
        g.mem.ironRoom = (g.mem.ironRoom ?? 0) + 1;
        g.mem.ironPlates = (g.mem.ironPlates ?? 0) + 1;
        p.shieldLeft++;
        g.fx.ring(p.x, p.y, C.steelL, 16, 0.3);
      },
      onDefend(g, how) {
        if (how !== 'shield' || (g.mem.ironPlates ?? 0) <= 0) return;
        g.mem.ironPlates--;
        const p = g.player;
        eraseBullets(g, p.x, p.y, 60, C.steelL);
        for (const e of g.enemies) if (isFoe(e) && dist2(e.x, e.y, p.x, p.y) <= (60 + e.r) ** 2) knockTo(e, p.x, p.y, 90);
        g.fx.ring(p.x, p.y, C.steelL, 60, 0.35);
        // «Огневой вал»: сбитая плита сразу выпускает болванку
        if (hasSyn(g, SYN.heavy2)) slug(g, p.aimAngle);
      },
      gauge: (g) => (g.player.shooting && (g.mem.ironRoom ?? 0) < 2 ? { kind: 'bar', color: C.steelL, k: (g.mem.ironT ?? 0) / 8 } : null),
    },
  },
  {
    id: 'iHeavyBraces', kind: 'implant', slot: 'legs', quality: 3, unstable: 1, tags: ['heavy'], fromEnemy: 'heavy',
    name: { ru: 'Упоры «Болванка»', en: '"Blank" Braces' },
    desc: {
      ru: 'Каждые 3 с непрерывного огня (полоска у героя) залп добавляет болванку: медленная, урон 15, крупная; до стены пробивает всех, разбивает ящики и укрытия, снимает вражеские щиты на 3 с, отбрасывает на 60 (боссов — нет). Пули не гасит.',
      en: 'Every 3 s of continuous fire (a bar under you), a volley adds a slug: slow, 15 damage, large; it pierces everyone up to a wall, smashes crates and cover, strips enemy shields for 3 s and knocks back by 60 (not bosses). It does not stop bullets.',
    },
    icon: { shape: 'leg', color: C.steel, accent: C.amberD },
    hooks: {
      tick(g, dt) {
        if (!g.player.shooting) {
          g.mem.slugT = 0;
          return;
        }
        g.mem.slugT = (g.mem.slugT ?? 0) + dt;
        if (g.mem.slugT < 3) return;
        g.mem.slugT -= 3;
        g.mem.slugReady = true;
      },
      onShoot(g, angle) {
        if (!g.mem.slugReady) return;
        g.mem.slugReady = false;
        slug(g, angle);
      },
      gauge: (g) => (g.player.shooting ? { kind: 'bar', color: C.steelL, k: (g.mem.slugT ?? 0) / 3 } : null),
    },
  },
  {
    id: 'iHeavyLoader', kind: 'implant', slot: 'tentacles', quality: 3, unstable: 1, tags: ['heavy', 'explosive'], fromEnemy: 'heavy',
    name: { ru: 'Щупальце «Заряжающий»', en: '"Loader" Tentacle' },
    desc: {
      ru: 'Пока держите огонь — +1 спецзаряд за 1,5 с (до 3, огоньки); после паузы в огне 0,3 с первый залп выпускает заряды разрывными гранатами (взрыв 28, урон 10, гасит обычные пули в радиусе).',
      en: 'While you hold fire — +1 special charge per 1.5 s (up to 3, shown as lights); after a 0.3 s pause in fire, your first volley launches the charges as frag grenades (blast 28, 10 damage, cancels normal bullets in the radius).',
    },
    icon: { shape: 'bomb', color: C.steel, accent: C.amber },
    hooks: {
      tick(g, dt) {
        if (!g.player.shooting) return;
        g.mem.loadT = (g.mem.loadT ?? 0) + dt;
        if (g.mem.loadT < 1.5) return;
        g.mem.loadT -= 1.5;
        g.mem.loads = Math.min(3, (g.mem.loads ?? 0) + 1);
      },
      onShoot(g, angle) {
        const gap = g.time - (g.mem.loadShot ?? -9);
        g.mem.loadShot = g.time;
        const n = g.mem.loads ?? 0;
        if (gap < 0.3 || n <= 0) return;
        g.mem.loads = 0;
        for (let i = 0; i < n; i++) grenade(g, angle + (i - (n - 1) / 2) * 0.25);
      },
      gauge: (g) => ((g.mem.loads ?? 0) > 0 ? { kind: 'pips', color: C.amber, n: g.mem.loads, max: 3 } : null),
    },
  },

  // ================================================================ Прыгун «Блоха»
  {
    id: 'pFleaHop', kind: 'passive', quality: 3, unstable: 2, tags: ['kinetic'], fromEnemy: 'gekko',
    name: { ru: 'Прошивка «Подскок»', en: '"Hop" Firmware' },
    desc: {
      ru: 'Рывок становится прыжком: на 40% дальше, над ямами, 0,3 с неуязвимости; приземление стирает пули (40) и отбрасывает врагов. Перезарядка рывка ×1,5.',
      en: 'Your dash becomes a jump: 40% farther, over pits, 0.3 s of invulnerability; landing erases bullets (40) and knocks enemies back. Dash cooldown ×1.5.',
    },
    icon: { shape: 'leg', color: C.red, accent: C.yellow },
    stats: (s) => {
      s.dashJump = true;
      s.dashDist *= 1.4;
      s.dashCd *= 1.5;
    },
    hooks: {
      onDash(g) {
        g.player.invuln = Math.max(g.player.invuln, 0.3);
      },
      onDashEnd(g) {
        const p = g.player;
        eraseBullets(g, p.x, p.y, 40, C.bone);
        for (const e of g.enemies) if (isFoe(e) && dist2(e.x, e.y, p.x, p.y) <= (40 + e.r) ** 2) knockTo(e, p.x, p.y, 70);
        // «Жёсткая посадка»: приземление подбрасывает обычных врагов в радиусе 80
        if (hasSyn(g, SYN.flea1)) for (const e of g.enemies) if (isFoe(e) && isNormal(e) && !e.toss && dist2(e.x, e.y, p.x, p.y) <= 80 * 80) catapult(g, e);
        g.fx.ring(p.x, p.y, C.bone, 40, 0.3);
      },
    },
  },
  {
    id: 'pFleaLob', kind: 'passive', quality: 3, unstable: 1, tags: ['explosive'], fromEnemy: 'gekko',
    name: { ru: 'Прошивка «Навес»', en: '"Lob" Firmware' },
    desc: {
      ru: 'Снаряды летят навесом над стенами и пулями, падают в конце (радиус 18, ×1,5 урона) и отскакивают ещё дважды (×1, ×0,6). Дальность −15%.',
      en: 'Projectiles arc over walls and bullets, land at the end (radius 18, ×1.5 damage) and bounce twice more (×1, ×0.6). Range −15%.',
    },
    icon: { shape: 'bomb', color: C.redD, accent: C.bone },
    stats: (s) => {
      s.range *= 0.85;
    },
    hooks: {
      onVolleyShot(_g, b) {
        if (!b.arc) lobify(b);
      },
      onShotEnd(g, b) {
        const d = b.data;
        if (!b.arc || d?.lob === undefined) return;
        // «Блошиный цирк»: падение сажает блоху
        if (hasSyn(g, SYN.flea2)) {
          const t = nearestFoe(g, b.x, b.y, 28);
          if (t) addFlea(g, t);
        }
        if (d.lob >= 2) return;
        const k = d.lob === 0 ? 1 : 0.6;
        const speed = Math.max(120, b.speed * 0.8);
        const life = (d.lob === 0 ? 40 : 30) / speed;
        childShot(g, b.x, b.y, b.angle, {
          speed, life, maxLife: life, arc: d.lob === 0 ? 14 : 9, landR: 18, dmg: d.base0 * k, r: b.r, color: b.color, style: b.style, tag: 'lob',
          data: { lob: d.lob + 1, base0: d.base0 },
        });
      },
    },
  },
  {
    id: 'pFleaCatapult', kind: 'passive', quality: 3, unstable: 1, tags: ['kinetic'], fromEnemy: 'gekko',
    name: { ru: 'Протокол «Катапульта»', en: '"Catapult" Protocol' },
    desc: {
      ru: 'Попадание с шансом 8% подбрасывает обычного врага (раз в 3 с на врага): 0,7 с он не стреляет, падает (×2 урона + набранный в воздухе) и выпускает кольцо из 8 снарядов (60%).',
      en: 'A hit has an 8% chance to toss a normal enemy (once per 3 s per enemy): for 0.7 s it cannot shoot, then lands (×2 damage + whatever it took in the air) and releases a ring of 8 shots (60%).',
    },
    icon: { shape: 'spider', color: C.amber, accent: C.redL },
    hooks: {
      onHit(g, e, hit) {
        if (hit.tag === 'catapult' || !isNormal(e) || e.toss || e.dead) return;
        if (g.time - (e.mem.catT ?? -9) < 3 || Math.random() >= 0.08) return;
        catapult(g, e);
      },
    },
  },
  {
    id: 'pFleaItch', kind: 'passive', quality: 3, unstable: 1, tags: ['nano'], fromEnemy: 'gekko',
    name: { ru: 'Протокол «Зуд»', en: '"Itch" Protocol' },
    desc: {
      ru: 'Каждое 5-е попадание по врагу сажает блоху (до 3 на врага, 12 на всех): укус раз в 0,5 с на 1 урон. При гибели носителя блохи переходят на ближайшего врага в радиусе 60 (с босса не переселяются).',
      en: 'Every 5th hit on an enemy plants a flea (up to 3 per enemy, 12 total): a bite every 0.5 s for 1 damage. When the host dies, fleas jump to the nearest enemy within 60 (not from a boss).',
    },
    icon: { shape: 'swarm', color: C.redD, accent: C.amber },
    hooks: {
      onHit(g, e) {
        e.mem.itchN = (e.mem.itchN ?? 0) + 1;
        if (e.mem.itchN % 5 === 0) addFlea(g, e);
      },
      tick(g, dt) {
        const circus = hasSyn(g, SYN.flea2);
        for (const e of g.enemies) {
          const n = stackCount(e, 'flea');
          if (!n || !isFoe(e)) continue;
          e.mem.biteT = (e.mem.biteT ?? 0) + dt;
          if (e.mem.biteT < 0.5) continue;
          e.mem.biteT -= 0.5;
          damageEnemy(g, e, n, e.x, e.y - 2, { silent: true, tag: 'flea' });
          // «Блошиный цирк»: каждый 3-й укус блохи кусает в привод
          const before = e.mem.bites ?? 0;
          e.mem.bites = before + n;
          if (circus && Math.floor(e.mem.bites / 3) > Math.floor(before / 3)) driveBite(e);
        }
      },
      onKill(g, e) {
        if (bossLike(e)) return;
        transferStacks(g, e, 'flea', 60, 3, 9999);
      },
    },
  },
  {
    id: 'pFleaBite', kind: 'passive', quality: 3, unstable: 1, tags: ['nano'], fromEnemy: 'gekko',
    name: { ru: 'Протокол «Укус в привод»', en: '"Drive Bite" Protocol' },
    desc: {
      ru: 'Каждое 4-е попадание по врагу — укус: скорость движения и поворота −15% на 3 с, до 3 раз (предел −45%); боссы и мини-боссы — вдвое меньше (предел −20%).',
      en: 'Every 4th hit on an enemy is a bite: −15% movement and turning speed for 3 s, stacking up to 3 times (cap −45%); bosses and mini-bosses get half (cap −20%).',
    },
    icon: { shape: 'gear', color: C.redD, accent: C.bone },
    hooks: {
      onHit(_g, e) {
        e.mem.biteN = (e.mem.biteN ?? 0) + 1;
        if (e.mem.biteN % 4 === 0) driveBite(e);
      },
      onKill(g, e) {
        // «Блошиный цирк»: новый носитель получает половину замедления прежнего
        if (!hasSyn(g, SYN.flea2) || e.driveT <= 0 || e.driveK <= 0) return;
        const to = nearestOther(g, e, 60);
        if (!to) return;
        const boss = bossLike(to);
        crippleDrive(to, e.driveK / 2, 3, boss ? 0.2 : 0.45);
      },
    },
  },
];

const ironSlow = (s: Stats) => {
  s.speed *= 0.8;
};
