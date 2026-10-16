import { TAU, dist2 } from '../core/math';
import { C } from '../gfx/palette';
import { SHOCK_PALM } from './body';
import { chainLightning, damageEnemy, explode, fan, spawnShot } from '../game/combat';
import type { PBullet } from '../game/bullets';
import { boltPoints } from '../game/fx';
import type { Game } from '../game/game';
import type { ItemDef } from '../game/items';
import { finalDamage } from '../game/stats';

// Импланты — постоянные улучшения из сокровищниц, магазинов и с боссов.
// Активные импланты (есть поле active) используются клавишей Q; можно носить только один.

// ---------------------------------------------------------------- вспомогательное

/** Текущий урон выстрела игрока */
const dmgOf = (g: Game) => finalDamage(g.player.stats);

/** Снаряд, летящий прямо из точки (без орбиты/бумеранга/волны) */
function plainShot(g: Game, x: number, y: number, angle: number, over: Partial<PBullet> = {}) {
  return spawnShot(g, angle, g.player.stats, {
    x, y, bx: x, by: y, orbitR: 0, boomerang: false, wave: 0, ...over,
  });
}

/** Кольцо из n снарядов вокруг точки */
function ringShots(g: Game, x: number, y: number, n: number, over: Partial<PBullet> = {}) {
  const off = Math.random() * TAU;
  for (let i = 0; i < n; i++) plainShot(g, x, y, off + (i / n) * TAU, over);
}

/** Стереть вражеские пули в радиусе; max — сколько максимум. Возвращает число стёртых */
function eraseBullets(g: Game, x: number, y: number, r: number, max = Infinity): number {
  let n = 0;
  for (const b of g.ebullets) {
    if (b.dead || dist2(x, y, b.x, b.y) > r * r) continue;
    b.dead = true;
    g.fx.add({ kind: 'dot', x: b.x, y: b.y, vy: -20, color: C.bone, life: 0.3, glow: true });
    if (++n >= max) break;
  }
  return n;
}

/** Живые и уже появившиеся враги */
function* liveEnemies(g: Game) {
  for (const e of g.enemies) if (!e.dead && e.spawn <= 0) yield e;
}

// ---------------------------------------------------------------- состояние активных/таймерных эффектов

let overclockT = 0;
let capacitorN = 0;
let missileT = 0;
let bladeT = 0;
let swarmT = 0;
let arcT = 0;
let veilT = 0;
let mirrorT = 0;
let mines: { x: number; y: number; t: number }[] = [];
let turret: { x: number; y: number; t: number; cd: number } | null = null;

export const IMPLANTS: ItemDef[] = [
  // ================================================================ исходные
  {
    id: 'smartlink', kind: 'implant', slot: 'head', quality: 2, tags: ['smart', 'neural'],
    name: { ru: 'Прицельный контур', en: 'Targeting Loop' },
    desc: { ru: 'Снаряды доворачивают к ближайшему врагу.', en: 'Shots curve toward the nearest enemy.' },
    icon: { shape: 'crosshair', color: C.steel, accent: C.red },
    stats: (s) => {
      s.homing += 3.2;
    },
  },
  {
    id: 'reflexBooster', kind: 'implant', slot: 'nervous', quality: 1, tags: ['neural'],
    name: { ru: 'Рефлекс-бустер', en: 'Reflex Booster' },
    desc: { ru: 'Скорострельность +25%.', en: 'Fire rate +25%.' },
    icon: { shape: 'brain', color: C.redD, accent: C.yellow },
    stats: (s) => {
      s.fireRateMult *= 1.25;
    },
  },
  {
    id: 'subdermal', kind: 'implant', slot: 'torso', quality: 2, tags: ['heavy'],
    name: { ru: 'Субдермальная броня', en: 'Subdermal Armor' },
    desc: { ru: '+1 к максимуму жизней.', en: '+1 max life.' },
    icon: { shape: 'shield', color: C.steel, accent: C.amber },
    stats: (s) => {
      s.maxLives += 1;
    },
  },
  {
    id: 'twinBarrel', kind: 'implant', slot: 'back', quality: 2, tags: ['kinetic'],
    name: { ru: 'Сдвоенный канал', en: 'Twin Channel' },
    desc: { ru: '+1 снаряд за выстрел, урон каждого −15%.', en: '+1 projectile per shot, each deals −15% damage.' },
    icon: { shape: 'arm', color: C.steelL, accent: C.red },
    stats: (s) => {
      s.count += 1;
      s.damageMult *= 0.85;
    },
  },
  {
    id: 'sandevistan', kind: 'implant', slot: 'nervous', quality: 3, tags: ['neural', 'stealth'],
    name: { ru: 'Хроно-ускоритель', en: 'Chrono Accelerator' },
    desc: { ru: '[Q] Замедляет время вокруг на 3 секунды. Перезарядка 18 с.', en: '[Q] Slows time around you for 3 seconds. Cooldown 18 s.' },
    icon: { shape: 'spine', color: C.amber, accent: C.violet },
    active: {
      cooldown: 18,
      use: (g) => {
        g.slowmo = 3;
        g.fx.ring(g.player.x, g.player.y, C.violet, 120, 0.5);
      },
    },
  },

  // ================================================================ качество 1
  {
    id: 'iFalconOptics', kind: 'implant', slot: 'head', quality: 1, tags: ['optic'],
    name: { ru: 'Оптика «Сокол»', en: 'Falcon Optics' },
    desc: { ru: 'Дальность +35%, скорость снарядов +15%.', en: 'Range +35%, shot speed +15%.' },
    icon: { shape: 'eye', color: C.steelL, accent: C.amber },
    stats: (s) => {
      s.range *= 1.35;
      s.shotSpeed *= 1.15;
    },
  },
  {
    id: 'iHelixRifling', kind: 'passive', maxStacks: 1, quality: 1, tags: ['kinetic'],
    name: { ru: 'Спиральная нарезка', en: 'Helix Rifling' },
    desc: { ru: 'Снаряды летят по закручивающейся дуге и пробивают +1 врага.', en: 'Shots fly in a curling arc and pierce +1 enemy.' },
    icon: { shape: 'coil', color: C.steel, accent: C.yellow },
    stats: (s) => {
      s.spiral += 1.6;
      s.pierce += 1;
    },
  },
  {
    id: 'iServoAnkles', kind: 'implant', slot: 'legs', quality: 1, tags: ['kinetic'],
    name: { ru: 'Сервоприводы голеностопа', en: 'Servo Ankles' },
    desc: { ru: 'Скорость +15%, перезарядка рывка −20%.', en: 'Speed +15%, dash cooldown −20%.' },
    icon: { shape: 'leg', color: C.steel, accent: C.amber },
    stats: (s) => {
      s.speed *= 1.15;
      s.focusSpeed *= 1.15;
      s.dashCd *= 0.8;
    },
  },
  {
    id: 'iRearCam', kind: 'implant', slot: 'head', quality: 1, tags: ['optic'],
    name: { ru: 'Затылочная камера', en: 'Rear Camera' },
    desc: { ru: 'Каждый залп дублируется назад.', en: 'Every volley is also fired backwards.' },
    icon: { shape: 'eye', color: C.redD, accent: C.bone },
    stats: (s) => {
      s.backShot = true;
    },
  },
  {
    id: 'iPainEditor', kind: 'implant', slot: 'nervous', quality: 1, tags: ['neural'],
    name: { ru: 'Редактор боли', en: 'Pain Editor' },
    desc: { ru: 'Потеряв жизнь, выпускаете кольцо из 12 снарядов с уроном ×1.5.', en: 'Losing a life releases a ring of 12 shots dealing ×1.5 damage.' },
    icon: { shape: 'brain', color: C.steel, accent: C.red },
    hooks: {
      onHurt: (g) => {
        ringShots(g, g.player.x, g.player.y, 12, { dmg: dmgOf(g) * 1.5, color: C.red });
      },
    },
  },
  {
    id: 'iCreditSniffer', kind: 'implant', slot: 'tentacles', quality: 1, tags: ['smart'],
    name: { ru: 'Сниффер ячеек', en: 'Cell Sniffer' },
    desc: { ru: 'Притяжение энергоячеек +70. За каждую зачищенную комнату +2 ячейки.', en: 'Cell magnet +70. +2 cells for each cleared room.' },
    icon: { shape: 'chip', color: C.amberD, accent: C.yellow },
    stats: (s) => {
      s.magnet += 70;
    },
    hooks: {
      onRoomClear: (g) => {
        g.player.coins += 2;
        g.fx.burst(g.player.x, g.player.y - 6, C.yellow, 6, 40, 0.3, 1, true);
      },
    },
  },
  {
    id: 'iThermalOptics', kind: 'implant', slot: 'head', quality: 1, tags: ['optic', 'fire'],
    name: { ru: 'Тепловизор', en: 'Thermal Optics' },
    desc: { ru: 'Попадания поджигают врагов: 2 урона в секунду.', en: 'Hits ignite enemies for 2 damage per second.' },
    icon: { shape: 'eye', color: C.amber, accent: C.red },
    stats: (s) => {
      s.burn += 2;
    },
  },
  {
    id: 'iShockPalm', kind: 'implant', slot: 'armL', quality: 1, tags: ['electric'],
    name: { ru: 'Шокер в ладони', en: 'Shock Palm' },
    desc: { ru: '[E] Разряд из ладони: оглушает врагов вплотную на 1 с.', en: '[E] Palm discharge: stuns enemies up close for 1 s.' },
    icon: { shape: 'arm', color: C.steel, accent: C.yellow },
    leftHand: SHOCK_PALM,
  },
  {
    id: 'iDermalWeave', kind: 'implant', slot: 'torso', quality: 1, tags: ['heavy'],
    name: { ru: 'Кевларовое плетение', en: 'Dermal Weave' },
    desc: { ru: 'Щит поглощает 1 попадание в каждой комнате. Скорость −7%.', en: 'A shield absorbs 1 hit in each room. Speed −7%.' },
    icon: { shape: 'shield', color: C.metal, accent: C.bone },
    stats: (s) => {
      s.shield += 1;
      s.speed *= 0.93;
    },
  },
  {
    id: 'iAdrenalPump', kind: 'implant', slot: 'blood', quality: 1, tags: ['mutation', 'neural'],
    name: { ru: 'Адреналиновый насос', en: 'Adrenal Pump' },
    desc: { ru: 'Потеряв жизнь, замедляете время на 2.5 с и сразу восстанавливаете рывок.', en: 'Losing a life slows time for 2.5 s and instantly restores your dash.' },
    icon: { shape: 'heart', color: C.redD, accent: C.amber },
    hooks: {
      onHurt: (g) => {
        g.slowmo = Math.max(g.slowmo, 2.5);
        g.player.dashCd = 0;
      },
    },
  },
  {
    id: 'iSpinalDischarger', kind: 'implant', slot: 'back', quality: 1, tags: ['electric'],
    name: { ru: 'Спинальный разрядник', en: 'Spinal Discharger' },
    desc: { ru: 'Рывок бьёт разрядом всех врагов в радиусе 42: урон ×1.5 и оглушение.', en: 'Dashing zaps all enemies within 42 px for ×1.5 damage and stuns them.' },
    icon: { shape: 'spine', color: C.steel, accent: C.yellow },
    hooks: {
      onDash: (g) => {
        const p = g.player;
        const d = dmgOf(g) * 1.5;
        g.fx.ring(p.x, p.y, C.yellow, 42, 0.25);
        for (const e of liveEnemies(g)) {
          if (dist2(p.x, p.y, e.x, e.y) > (42 + e.r) ** 2) continue;
          g.fx.add({ kind: 'bolt', x: 0, y: 0, points: boltPoints(p.x, p.y, e.x, e.y), color: C.yellow, life: 0.12, glow: true });
          damageEnemy(g, e, d, p.x, p.y, { shock: 1, silent: true });
        }
      },
    },
  },
  {
    id: 'iBallisticCalc', kind: 'implant', slot: 'head', quality: 1, tags: ['smart', 'kinetic'],
    name: { ru: 'Баллистический вычислитель', en: 'Ballistic Calculator' },
    desc: { ru: 'Снаряды рикошетят от стен 1 раз. Дальность +15%.', en: 'Shots ricochet off walls once. Range +15%.' },
    icon: { shape: 'crosshair', color: C.steelL, accent: C.amber },
    stats: (s) => {
      s.bounce += 1;
      s.range *= 1.15;
    },
  },
  {
    id: 'iBoneLacing', kind: 'implant', slot: 'torso', quality: 1, tags: ['heavy', 'mutation'],
    name: { ru: 'Армирование костей', en: 'Bone Lacing' },
    desc: { ru: '+1 к максимуму жизней, но хитбокс больше на 25%.', en: '+1 max life, but your hitbox is 25% larger.' },
    icon: { shape: 'skull', color: C.bone, accent: C.steel },
    stats: (s) => {
      s.maxLives += 1;
      s.hitR += 0.5;
    },
  },
  {
    id: 'iFlashEmitter', kind: 'implant', slot: 'head', quality: 1, tags: ['optic', 'electric'],
    name: { ru: 'Ослепляющий излучатель', en: 'Flash Emitter' },
    desc: { ru: '[Q] Вспышка оглушает врагов в радиусе 100 на 1.2 с (боссов — замедляет). Перезарядка 12 с.', en: '[Q] A flash stuns enemies within 100 px for 1.2 s (slows bosses). Cooldown 12 s.' },
    icon: { shape: 'eye', color: C.bone, accent: C.yellow },
    active: {
      cooldown: 12,
      use: (g) => {
        const p = g.player;
        g.fx.flash(p.x, p.y, C.bone, 70, 0.2);
        g.fx.ring(p.x, p.y, C.yellow, 100, 0.35);
        g.lightFlash(p.x, p.y, 220);
        for (const e of liveEnemies(g)) {
          if (dist2(p.x, p.y, e.x, e.y) > (100 + e.r) ** 2) continue;
          if (e.def.boss) {
            e.slowT = Math.max(e.slowT, 2);
            e.slowK = Math.max(e.slowK, 0.4);
          } else e.shockT = Math.max(e.shockT, 1.2);
        }
      },
    },
  },
  {
    id: 'iMagPulse', kind: 'implant', slot: 'legs', quality: 1, tags: ['electric', 'kinetic'],
    name: { ru: 'Магнитный импульс', en: 'Mag Pulse' },
    desc: { ru: '[Q] Отбрасывает врагов в радиусе 80 и притягивает все энергоячейки комнаты. Перезарядка 10 с.', en: '[Q] Knocks back enemies within 80 px and pulls in every coin and key in the room. Cooldown 10 s.' },
    icon: { shape: 'coil', color: C.redD, accent: C.steelL },
    active: {
      cooldown: 10,
      use: (g) => {
        const p = g.player;
        g.fx.ring(p.x, p.y, C.steelL, 80, 0.3);
        for (const e of liveEnemies(g)) {
          if (e.def.heavy || e.def.boss || dist2(p.x, p.y, e.x, e.y) > (80 + e.r) ** 2) continue;
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          e.kx += Math.cos(a) * 220;
          e.ky += Math.sin(a) * 220;
        }
        for (const k of g.pickups) {
          if (k.dead || k.price !== undefined || k.kind !== 'coin') continue;
          k.x = p.x;
          k.y = p.y;
          k.vx = k.vy = 0;
        }
      },
    },
  },

  // ================================================================ качество 2
  {
    id: 'iShoulderMounts', kind: 'implant', slot: 'back', quality: 2, tags: ['kinetic', 'smart'],
    name: { ru: 'Плечевые турели', en: 'Shoulder Mounts' },
    desc: { ru: 'Каждый залп также летит в обе стороны. Урон −15%.', en: 'Every volley also fires to both sides. Damage −15%.' },
    icon: { shape: 'arm', color: C.metal, accent: C.amber },
    stats: (s) => {
      s.sideShots = true;
      s.damageMult *= 0.85;
    },
  },
  {
    id: 'iMantisBlades', kind: 'implant', slot: 'tentacles', quality: 2, tags: ['blade'],
    name: { ru: 'Выкидные клинки', en: 'Switch Blades' },
    desc: { ru: 'Выдвижные клинки 4 раза в секунду режут врагов вплотную (радиус 24) на 80% урона.', en: 'Retractable blades slash adjacent enemies (24 px) 4 times per second for 80% damage.' },
    icon: { shape: 'claw', color: C.steelL, accent: C.red },
    hooks: {
      tick: (g, dt) => {
        bladeT -= dt;
        if (bladeT > 0) return;
        bladeT = 0.25;
        const p = g.player;
        const d = dmgOf(g) * 0.8;
        for (const e of liveEnemies(g)) {
          if (dist2(p.x, p.y, e.x, e.y) > (24 + e.r) ** 2) continue;
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          g.fx.add({ kind: 'slash', x: p.x, y: p.y - 3, angle: a, arc: 1.4, size: 22, color: C.bone, life: 0.1, glow: true });
          damageEnemy(g, e, d, p.x, p.y, { source: 'melee', knockback: 20 });
        }
      },
    },
  },
  {
    id: 'iOrbitalGuard', kind: 'passive', maxStacks: 1, quality: 2, tags: ['kinetic'],
    name: { ru: 'Орбитальный контур', en: 'Orbital Guard' },
    desc: { ru: 'Снаряды кружат вокруг вас по расширяющейся орбите. Дальность +60%, пробивание +1.', en: 'Shots circle around you in a widening orbit. Range +60%, pierce +1.' },
    icon: { shape: 'disc', color: C.steel, accent: C.amber },
    stats: (s) => {
      s.orbit = Math.max(s.orbit, 16);
      s.range *= 1.6;
      s.pierce += 1;
    },
  },
  {
    id: 'iReturnServo', kind: 'passive', maxStacks: 1, quality: 2, tags: ['blade', 'kinetic'],
    name: { ru: 'Возвратный магнит', en: 'Return Servo' },
    desc: { ru: 'Снаряды возвращаются к вам, как бумеранг, и пробивают +1 врага.', en: 'Shots return to you like a boomerang and pierce +1 enemy.' },
    icon: { shape: 'gear', color: C.steelL, accent: C.red },
    stats: (s) => {
      s.boomerang = true;
      s.pierce += 1;
    },
  },
  {
    id: 'iPhaseRounds', kind: 'passive', maxStacks: 1, quality: 2, tags: ['stealth', 'optic'],
    name: { ru: 'Фазовые пули', en: 'Phase Rounds' },
    desc: { ru: 'Снаряды проходят сквозь стены и укрытия. Скорость снарядов +10%.', en: 'Shots pass through walls and cover. Shot speed +10%.' },
    icon: { shape: 'mask', color: C.grey, accent: C.violet },
    stats: (s) => {
      s.spectral = true;
      s.shotSpeed *= 1.1;
    },
  },
  {
    id: 'iWingmanDrone', kind: 'implant', slot: 'back', quality: 2, tags: ['smart'],
    name: { ru: 'Дрон-напарник', en: 'Wingman Drone' },
    desc: { ru: '+1 боевой дрон: кружит рядом и стреляет по ближайшему врагу.', en: '+1 combat drone that circles you and shoots the nearest enemy.' },
    icon: { shape: 'drone', color: C.steel, accent: C.amber },
    stats: (s) => {
      s.drones += 1;
    },
  },
  {
    id: 'iFragCasing', kind: 'implant', slot: 'torso', quality: 2, tags: ['explosive'],
    name: { ru: 'Осколочный корпус', en: 'Frag Casing' },
    desc: { ru: 'Убитые враги разлетаются 6 осколками с уроном 50%.', en: 'Killed enemies burst into 6 shards dealing 50% damage.' },
    icon: { shape: 'bomb', color: C.metal, accent: C.amber },
    hooks: {
      onKill: (g, e) => {
        ringShots(g, e.x, e.y, 6, {
          dmg: dmgOf(g) * 0.5, r: 1.8, life: 0.4, maxLife: 0.4, isChild: true, split: 0, explode: 0,
          homing: 0, spiral: 0, style: 'shard', color: C.amber, hit: new Set([e]),
        });
      },
    },
  },
  {
    id: 'iNanoSwarm', kind: 'implant', slot: 'blood', quality: 2, tags: ['nano'],
    name: { ru: 'Нанорой', en: 'Nano Swarm' },
    desc: { ru: 'Облако нанитов дважды в секунду грызёт врагов в радиусе 48 на 50% урона.', en: 'A nanite cloud chews enemies within 48 px twice per second for 50% damage.' },
    icon: { shape: 'dna', color: C.steelL, accent: C.violet },
    hooks: {
      tick: (g, dt) => {
        swarmT -= dt;
        if (swarmT > 0) return;
        swarmT = 0.5;
        const p = g.player;
        const d = dmgOf(g) * 0.5;
        for (const e of liveEnemies(g)) {
          if (dist2(p.x, p.y, e.x, e.y) > (48 + e.r) ** 2) continue;
          g.fx.burst(e.x, e.y, C.grey, 3, 30, 0.25);
          damageEnemy(g, e, d, p.x, p.y, { knockback: 0, silent: true });
        }
      },
    },
  },
  {
    id: 'iDaemonUplink', kind: 'implant', slot: 'head', quality: 2, tags: ['neural', 'smart'],
    name: { ru: 'Перехват поводка', en: 'Leash Hijack' },
    desc: { ru: 'Попадания взламывают врага: 4 с он получает +25% урона.', en: 'Hits hack the enemy: it takes +25% damage for 4 s.' },
    icon: { shape: 'chip', color: C.metal, accent: C.violet },
    stats: (s) => {
      s.hack += 0.25;
    },
  },
  {
    id: 'iKineticDampers', kind: 'implant', slot: 'torso', quality: 2, tags: ['neural', 'kinetic'],
    name: { ru: 'Кинетические демпферы', en: 'Kinetic Dampers' },
    desc: { ru: '12% шанс полностью избежать попадания. Отбрасывание врагов +30.', en: '12% chance to fully evade a hit. Enemy knockback +30.' },
    icon: { shape: 'leg', color: C.metal, accent: C.bone },
    stats: (s) => {
      s.dodge += 0.12;
      s.knockback += 30;
    },
  },
  {
    id: 'iNapalmDropper', kind: 'implant', slot: 'legs', quality: 2, tags: ['explosive', 'fire'],
    name: { ru: 'Напалмовый сброс', en: 'Napalm Dropper' },
    desc: { ru: 'Рывок оставляет мину: через 0.7 с взрыв (радиус 30, урон ×3) поджигает врагов.', en: 'Dashing drops a mine that blows up after 0.7 s (30 px, ×3 damage) and ignites enemies.' },
    icon: { shape: 'fire', color: C.redD, accent: C.amber },
    hooks: {
      onRoomEnter: () => {
        mines = [];
      },
      onDash: (g) => {
        if (mines.length < 6) mines.push({ x: g.player.x, y: g.player.y, t: 0.7 });
      },
      tick: (g, dt) => {
        if (!mines.length) return;
        for (const m of mines) {
          m.t -= dt;
          if (Math.random() < 0.4) g.fx.add({ kind: 'dot', x: m.x, y: m.y, color: m.t % 0.2 < 0.1 ? C.red : C.amber, life: 0.06, size: 2, glow: true });
          if (m.t > 0) continue;
          const d = dmgOf(g);
          explode(g, m.x, m.y, 30, d * 3, C.red);
          for (const e of liveEnemies(g)) {
            if (dist2(m.x, m.y, e.x, e.y) > (30 + e.r) ** 2) continue;
            e.burnT = 3;
            e.burnDps = Math.max(e.burnDps, d);
          }
        }
        mines = mines.filter((m) => m.t > 0);
      },
    },
  },
  {
    id: 'iAfterimage', kind: 'implant', slot: 'legs', quality: 2, tags: ['stealth', 'neural'],
    name: { ru: 'Остаточный образ', en: 'Afterimage' },
    desc: { ru: 'Рывок выпускает с места старта кольцо из 8 снарядов с уроном 80%.', en: 'Dashing fires a ring of 8 shots from your starting point for 80% damage.' },
    icon: { shape: 'cloak', color: C.steel, accent: C.violet },
    hooks: {
      onDash: (g) => {
        ringShots(g, g.player.x, g.player.y - 3, 8, { dmg: dmgOf(g) * 0.8, color: C.violet });
      },
    },
  },
  {
    id: 'iCapacitorArm', kind: 'implant', slot: 'reactor', quality: 2, tags: ['electric', 'heavy'],
    name: { ru: 'Конденсаторная рука', en: 'Capacitor Arm' },
    desc: { ru: 'Каждый 6-й выстрел добавляет крупный разряд: урон ×3, размер ×2.2, пробивает +3.', en: 'Every 6th shot adds a large charge: ×3 damage, ×2.2 size, pierces +3.' },
    icon: { shape: 'battery', color: C.steel, accent: C.yellow },
    hooks: {
      onShoot: (g, angle) => {
        if (++capacitorN < 6) return;
        capacitorN = 0;
        const s = g.player.stats;
        spawnShot(g, angle, s, {
          dmg: dmgOf(g) * 3, r: 2.5 * s.size * 2.2, pierce: s.pierce + 3, style: 'plasma', color: C.yellow,
        });
      },
    },
  },
  {
    id: 'iChainRelay', kind: 'implant', slot: 'reactor', quality: 2, tags: ['electric'],
    name: { ru: 'Цепной ретранслятор', en: 'Chain Relay' },
    desc: { ru: 'Попадание бьёт молнией ещё по 1 врагу рядом. Шанс оглушения +5%.', en: 'Hits arc lightning to 1 more nearby enemy. Stun chance +5%.' },
    icon: { shape: 'lightning', color: C.steelL, accent: C.yellow },
    stats: (s) => {
      s.chain += 1;
      s.shock += 0.05;
    },
  },
  {
    id: 'iEmpBurst', kind: 'implant', slot: 'torso', quality: 2, tags: ['electric'],
    name: { ru: 'ЭМИ-разрядник', en: 'EMP Burst' },
    desc: { ru: '[Q] Стирает вражеские пули в радиусе 110, наносит врагам там урон ×2 и оглушает их. Перезарядка 15 с.', en: '[Q] Erases enemy bullets within 110 px, deals ×2 damage to enemies there and stuns them. Cooldown 15 s.' },
    icon: { shape: 'lightning', color: C.amber, accent: C.bone },
    active: {
      cooldown: 15,
      use: (g) => {
        const p = g.player;
        g.fx.ring(p.x, p.y, C.yellow, 110, 0.4);
        g.fx.ring(p.x, p.y, C.bone, 70, 0.3);
        g.lightFlash(p.x, p.y, 200);
        eraseBullets(g, p.x, p.y, 110);
        const d = dmgOf(g) * 2;
        for (const e of liveEnemies(g)) {
          if (dist2(p.x, p.y, e.x, e.y) > (110 + e.r) ** 2) continue;
          damageEnemy(g, e, d, p.x, p.y, { shock: 1, silent: true });
        }
      },
    },
  },
  {
    id: 'iPingHack', kind: 'implant', slot: 'head', quality: 2, tags: ['neural', 'smart'],
    name: { ru: 'Сетевой пинг', en: 'Network Ping' },
    desc: { ru: '[Q] Взламывает всех врагов в комнате: 5 с они получают +50% урона и на 0.5 с оглушены. Перезарядка 15 с.', en: '[Q] Hacks every enemy in the room: +50% damage taken for 5 s and stunned for 0.5 s. Cooldown 15 s.' },
    icon: { shape: 'brain', color: C.metal, accent: C.violet },
    active: {
      cooldown: 15,
      use: (g) => {
        g.fx.ring(g.player.x, g.player.y, C.violet, 60, 0.3);
        for (const e of liveEnemies(g)) {
          e.hackT = Math.max(e.hackT, 5);
          e.hackK = Math.max(e.hackK, 0.5);
          if (!e.def.boss) e.shockT = Math.max(e.shockT, 0.5);
          g.fx.ring(e.x, e.y, C.violet, e.r + 6, 0.35);
        }
      },
    },
  },

  // ================================================================ качество 3
  {
    id: 'iThermopticCamo', kind: 'implant', slot: 'torso', quality: 3, tags: ['stealth', 'optic'],
    name: { ru: 'Маскировочная плёнка', en: 'Masking Film' },
    desc: { ru: '[Q] 2.5 с неуязвимости; пули в радиусе 50 рассеиваются. Перезарядка 24 с.', en: '[Q] 2.5 s of invulnerability; bullets within 50 px dissipate. Cooldown 24 s.' },
    icon: { shape: 'cloak', color: C.grey, accent: C.bone },
    active: {
      cooldown: 24,
      use: (g) => {
        const p = g.player;
        p.invuln = Math.max(p.invuln, 2.5);
        eraseBullets(g, p.x, p.y, 50);
        g.fx.ring(p.x, p.y, C.grey, 30, 0.4);
        g.fx.add({ kind: 'ghost', x: p.x, y: p.y, sprite: p.sprite, life: 0.5 });
      },
    },
  },
  {
    id: 'iOverclockChip', kind: 'implant', slot: 'reactor', quality: 3, tags: ['neural', 'electric'],
    name: { ru: 'Чип разгона', en: 'Overclock Chip' },
    desc: { ru: '[Q] На 5 с каждый залп выпускается дважды. Перезарядка 20 с.', en: '[Q] For 5 s every volley is fired twice. Cooldown 20 s.' },
    icon: { shape: 'chip', color: C.redD, accent: C.yellow },
    active: {
      cooldown: 20,
      use: (g) => {
        overclockT = 5;
        g.fx.ring(g.player.x, g.player.y, C.red, 40, 0.35);
      },
    },
    hooks: {
      onShoot: (g, angle) => {
        if (overclockT <= 0) return;
        fan(g, angle + (Math.random() - 0.5) * 0.12, g.player.stats, { color: C.redL });
      },
      tick: (g, dt) => {
        if (overclockT <= 0) return;
        overclockT -= dt;
        if (Math.random() < 0.3) g.fx.add({ kind: 'spark', x: g.player.x, y: g.player.y - 4, vy: -30, color: C.red, life: 0.2, glow: true });
      },
    },
  },
  {
    id: 'iSentryPod', kind: 'implant', slot: 'back', quality: 3, tags: ['smart', 'kinetic'],
    name: { ru: 'Развёртываемая турель', en: 'Sentry Pod' },
    desc: { ru: '[Q] Ставит турель на 6 с: 5 выстрелов в секунду по ближайшему врагу, урон 60%. Перезарядка 22 с.', en: '[Q] Deploys a turret for 6 s that fires 5 shots per second at the nearest enemy for 60% damage. Cooldown 22 s.' },
    icon: { shape: 'gear', color: C.steel, accent: C.amber },
    active: {
      cooldown: 22,
      use: (g) => {
        turret = { x: g.player.x, y: g.player.y, t: 6, cd: 0 };
        g.fx.ring(g.player.x, g.player.y, C.amber, 18, 0.3);
      },
    },
    hooks: {
      onRoomEnter: () => {
        turret = null;
      },
      tick: (g, dt) => {
        if (!turret) return;
        turret.t -= dt;
        turret.cd -= dt;
        g.fx.add({ kind: 'dot', x: turret.x, y: turret.y - 2, color: turret.t % 0.5 < 0.25 ? C.amber : C.red, life: 0.05, size: 3, glow: true });
        if (turret.t <= 0) {
          g.fx.burst(turret.x, turret.y, C.steel, 8, 50, 0.3);
          turret = null;
          return;
        }
        if (turret.cd > 0) return;
        const t = g.nearestEnemy(turret.x, turret.y, 220);
        if (!t) return;
        turret.cd = 0.2;
        plainShot(g, turret.x, turret.y - 3, Math.atan2(t.y - turret.y, t.x - turret.x), {
          dmg: dmgOf(g) * 0.6, r: 1.8, split: 0, explode: 0, style: 'bolt', color: C.amber,
        });
      },
    },
  },
  {
    id: 'iMicroMissiles', kind: 'implant', slot: 'back', quality: 3, tags: ['explosive', 'smart'],
    name: { ru: 'Микроракеты в ранце', en: 'Backpack Micro-Missiles' },
    desc: { ru: 'Во время стрельбы раз в секунду запускает 2 самонаводящиеся ракеты (взрыв 20, урон ×1).', en: 'While shooting, launches 2 homing missiles once per second (20 px blast, ×1 damage).' },
    icon: { shape: 'rocket', color: C.steel, accent: C.red },
    hooks: {
      onShoot: (g, angle) => {
        if (g.time - missileT < 1) return;
        missileT = g.time;
        const s = g.player.stats;
        for (const k of [-0.55, 0.55]) {
          spawnShot(g, angle + k, s, {
            dmg: dmgOf(g), r: 2, speed: s.shotSpeed * 0.75, homing: Math.max(4, s.homing), explode: 20,
            orbitR: 0, boomerang: false, wave: 0, spiral: 0, split: 0, isChild: true, style: 'rocket', color: C.red,
          });
        }
      },
    },
  },
  {
    id: 'iArcCoil', kind: 'implant', slot: 'reactor', quality: 3, tags: ['electric'],
    name: { ru: 'Дуговая катушка', en: 'Arc Coil' },
    desc: { ru: 'Каждую секунду молния бьёт до 3 ближайших врагов в радиусе 130: урон ×1.2.', en: 'Every second lightning strikes up to 3 nearest enemies within 130 px for ×1.2 damage.' },
    icon: { shape: 'coil', color: C.amber, accent: C.yellow },
    hooks: {
      tick: (g, dt) => {
        arcT -= dt;
        if (arcT > 0) return;
        arcT = 1;
        const p = g.player;
        const near = [...liveEnemies(g)]
          .filter((e) => !e.hidden && dist2(p.x, p.y, e.x, e.y) < 130 * 130)
          .sort((a, b) => dist2(p.x, p.y, a.x, a.y) - dist2(p.x, p.y, b.x, b.y))
          .slice(0, 3);
        const d = dmgOf(g) * 1.2;
        for (const e of near) {
          g.fx.add({ kind: 'bolt', x: 0, y: 0, points: boltPoints(p.x, p.y - 4, e.x, e.y), color: C.yellow, life: 0.15, glow: true });
          damageEnemy(g, e, d, p.x, p.y, { shock: 0.3, silent: true });
        }
      },
    },
  },
  {
    id: 'iGorillaFists', kind: 'passive', maxStacks: 1, quality: 3, tags: ['heavy', 'kinetic'],
    name: { ru: 'Гидравлические кулаки', en: 'Hydraulic Fists' },
    desc: { ru: 'Снаряды крупнее в 1.6 раза, урон +40%, сильное отбрасывание. Скорострельность −20%.', en: 'Shots are 1.6× larger, damage +40%, heavy knockback. Fire rate −20%.' },
    icon: { shape: 'arm', color: C.steelL, accent: C.amber },
    stats: (s) => {
      s.size *= 1.6;
      s.damageMult *= 1.4;
      s.knockback += 80;
      s.fireRateMult *= 0.8;
      s.shotSpeed *= 0.85;
    },
  },
  {
    id: 'iNaniteVeil', kind: 'implant', slot: 'blood', quality: 3, tags: ['nano', 'stealth'],
    name: { ru: 'Нанитовая завеса', en: 'Nanite Veil' },
    desc: { ru: 'Наниты каждые 0.4 с растворяют одну вражескую пулю в радиусе 28.', en: 'Nanites dissolve one enemy bullet within 28 px every 0.4 s.' },
    icon: { shape: 'mutation', color: C.grey, accent: C.violet },
    hooks: {
      tick: (g, dt) => {
        veilT -= dt;
        if (veilT > 0) return;
        if (eraseBullets(g, g.player.x, g.player.y, 28, 1)) veilT = 0.4;
      },
    },
  },
  {
    id: 'iReactiveArmor', kind: 'implant', slot: 'torso', quality: 3, tags: ['heavy', 'explosive'],
    name: { ru: 'Реактивная броня', en: 'Reactive Armor' },
    desc: { ru: 'Щит на 1 попадание в каждой комнате. Потеряв жизнь, взрываетесь (радиус 70, урон ×4).', en: 'A shield absorbs 1 hit in each room. Losing a life makes you explode (70 px, ×4 damage).' },
    icon: { shape: 'shield', color: C.redD, accent: C.amber },
    stats: (s) => {
      s.shield += 1;
    },
    hooks: {
      onHurt: (g) => {
        explode(g, g.player.x, g.player.y, 70, dmgOf(g) * 4, C.red);
      },
    },
  },
  {
    id: 'iHiveLink', kind: 'implant', slot: 'back', quality: 3, tags: ['smart', 'nano'],
    name: { ru: 'Улей-линк', en: 'Hive Link' },
    desc: { ru: '+2 боевых дрона. Урон −10%.', en: '+2 combat drones. Damage −10%.' },
    icon: { shape: 'drone', color: C.amber, accent: C.red },
    stats: (s) => {
      s.drones += 2;
      s.damageMult *= 0.9;
    },
  },
  {
    id: 'iPlasmaInjector', kind: 'passive', maxStacks: 1, quality: 3, tags: ['fire', 'electric'],
    name: { ru: 'Плазменный инжектор', en: 'Plasma Injector' },
    desc: { ru: 'Снаряды вылетают медленно, но разгоняются и раздуваются в полёте. Урон +20%.', en: 'Shots launch slowly, then accelerate and swell in flight. Damage +20%.' },
    icon: { shape: 'core', color: C.amber, accent: C.redL },
    stats: (s) => {
      s.shotSpeed *= 0.6;
      s.accel *= 2.2;
      s.grow += 5;
      s.damageMult *= 1.2;
    },
  },

  // ================================================================ качество 4
  {
    id: 'iBackupHeart', kind: 'implant', slot: 'blood', quality: 4, tags: ['mutation', 'nano'],
    name: { ru: 'Резервное сердце', en: 'Backup Heart' },
    desc: { ru: '[Q] +1 жизнь (при полном здоровье — полный заряд сбоя). Перезарядка 60 с.', en: '[Q] +1 life (a full glitch charge if at full health). Cooldown 60 s.' },
    icon: { shape: 'heart', color: C.red, accent: C.bone },
    active: {
      cooldown: 60,
      use: (g) => {
        const p = g.player;
        if (p.lives < p.stats.maxLives) p.lives++;
        else p.glitch = 1;
        g.fx.burst(p.x, p.y, C.red, 14, 60, 0.5, 1, true);
        g.fx.ring(p.x, p.y, C.red, 30, 0.4);
      },
    },
  },
  {
    id: 'iMirrorField', kind: 'implant', slot: 'tentacles', quality: 4, tags: ['nano', 'kinetic'],
    name: { ru: 'Зеркальное поле', en: 'Mirror Field' },
    desc: { ru: 'Каждые 1.2 с до 4 вражеских пуль в радиусе 40 разворачиваются в ваши снаряды с уроном ×1.5.', en: 'Every 1.2 s up to 4 enemy bullets within 40 px are turned into your shots dealing ×1.5 damage.' },
    icon: { shape: 'shield', color: C.bone, accent: C.violet },
    hooks: {
      tick: (g, dt) => {
        mirrorT -= dt;
        if (mirrorT > 0) return;
        const p = g.player;
        let n = 0;
        for (const b of g.ebullets) {
          if (b.dead || b.delay > 0 || dist2(p.x, p.y, b.x, b.y) > 40 * 40) continue;
          b.dead = true;
          const t = g.nearestEnemy(b.x, b.y, 300);
          const a = t ? Math.atan2(t.y - b.y, t.x - b.x) : b.angle + Math.PI;
          plainShot(g, b.x, b.y, a, { dmg: dmgOf(g) * 1.5, split: 0, isChild: true, color: C.violet, style: 'orb' });
          g.fx.add({ kind: 'dot', x: b.x, y: b.y, color: C.violet, life: 0.25, size: 2, glow: true });
          if (++n >= 4) break;
        }
        if (n) {
          mirrorT = 1.2;
          g.fx.ring(p.x, p.y, C.violet, 40, 0.25);
        }
      },
    },
  },
  {
    id: 'iOrbitalStrike', kind: 'implant', slot: 'back', quality: 4, tags: ['explosive', 'smart'],
    name: { ru: 'Сброс с крана', en: 'Crane Drop' },
    desc: { ru: '[Q] Кран сбрасывает груз на каждого врага в комнате (радиус 26, урон ×4). Перезарядка 30 с.', en: '[Q] A crane drops cargo on every enemy in the room (26 px, ×4 damage). Cooldown 30 s.' },
    icon: { shape: 'crosshair', color: C.red, accent: C.yellow },
    active: {
      cooldown: 30,
      use: (g) => {
        const d = dmgOf(g) * 4;
        const targets = [...liveEnemies(g)];
        for (const e of targets) {
          g.fx.add({ kind: 'beam', x: e.x, y: e.y - 200, x2: e.x, y2: e.y, color: C.red, size: 3, life: 0.15, glow: true });
          explode(g, e.x, e.y, 26, d, C.red);
        }
      },
    },
  },
  {
    id: 'iExecutionCortex', kind: 'implant', slot: 'nervous', quality: 4, tags: ['neural', 'blade'],
    name: { ru: 'Кора палача', en: 'Execution Cortex' },
    desc: { ru: 'Попадание добивает обычного врага с запасом здоровья ниже 20%. Каждое убийство бьёт молнией по 2 ближайшим врагам (урон ×0.8).', en: 'Hits execute non-boss enemies below 20% health. Every kill arcs lightning to 2 nearby enemies (×0.8 damage).' },
    icon: { shape: 'skull', color: C.redD, accent: C.yellow },
    hooks: {
      onHit: (g, e) => {
        if (e.dead || e.def.boss || e.hp <= 0 || e.hp > e.maxHp * 0.2) return;
        g.fx.add({ kind: 'slash', x: e.x, y: e.y, angle: -0.8, arc: 0.5, size: e.r + 8, color: C.bone, life: 0.15, glow: true });
        e.hp = 0;
        g.killEnemy(e, true);
      },
      onKill: (g, e) => {
        chainLightning(g, e, 2, dmgOf(g) * 0.8);
      },
    },
  },
];
