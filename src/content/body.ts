import { angleDiff, dist2 } from '../core/math';
import { C } from '../gfx/palette';
import { distToSegment, raycast } from '../game/collision';
import { damageEnemy, spawnShot } from '../game/combat';
import type { Game } from '../game/game';
import type { ItemDef, LeftHandSpec } from '../game/items';
import { baseStats, finalDamage } from '../game/stats';

// Тело Т-417: скелеты, рюкзаки и модули левой руки (вторая атака на E).

/** Враги в секторе перед игроком */
function inArc(g: Game, angle: number, reach: number, arc: number) {
  const p = g.player;
  return g.enemies.filter((e) =>
    !e.dead && e.spawn <= 0 &&
    dist2(p.x, p.y, e.x, e.y) <= (reach + e.r) ** 2 &&
    Math.abs(angleDiff(angle, Math.atan2(e.y - p.y, e.x - p.x))) <= arc / 2 + 0.2);
}

/** Вражеские пули в секторе перед игроком */
function bulletsInArc(g: Game, angle: number, reach: number, arc: number) {
  const p = g.player;
  return g.ebullets.filter((b) =>
    !b.dead && dist2(p.x, p.y, b.x, b.y) <= reach * reach &&
    Math.abs(angleDiff(angle, Math.atan2(b.y - p.y, b.x - p.x))) <= arc / 2);
}

export const SHOCK_PALM: LeftHandSpec = {
  cooldown: 0.9,
  use(g, a) {
    const p = g.player;
    const x = p.x + Math.cos(a) * 12, y = p.y - 3 + Math.sin(a) * 12;
    g.fx.add({ kind: 'flash', x, y, color: C.yellow, size: 22, life: 0.15, glow: true });
    for (let i = 0; i < 6; i++) g.fx.add({ kind: 'spark', x, y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, color: C.yellow, life: 0.2, glow: true });
    for (const e of g.enemies) {
      if (e.dead || dist2(e.x, e.y, x, y) > (28 + e.r) ** 2) continue;
      damageEnemy(g, e, finalDamage(p.stats), x, y, { source: 'melee' });
      if (!e.def.boss) e.shockT = 1;
    }
  },
};

const LEFT: Record<string, LeftHandSpec> = {
  // щит: пока E зажата, спереди гасит пули
  lhShield: {
    cooldown: 0,
    use() {},
    hold(g, a) {
      const p = g.player;
      p.shieldUp = 0.1;
      for (const b of bulletsInArc(g, a, 20, 2.2)) {
        b.dead = true;
        g.fx.add({ kind: 'dot', x: b.x, y: b.y, color: C.amber, life: 0.2, glow: true });
      }
    },
  },
  // гарпун: притягивает врага, а если попал в стену — подтягивает игрока
  lhHarpoon: {
    cooldown: 1.4,
    use(g, a) {
      const p = g.player;
      const max = 150;
      const wall = raycast(g.room, p.x, p.y, a, max);
      const x2 = p.x + Math.cos(a) * wall, y2 = p.y + Math.sin(a) * wall;
      let hit = null as null | (typeof g.enemies)[number], best = Infinity;
      for (const e of g.enemies) {
        if (e.dead || e.spawn > 0) continue;
        if (distToSegment(e.x, e.y, p.x, p.y, x2, y2) > e.r + 4) continue;
        const d = dist2(p.x, p.y, e.x, e.y);
        if (d < best) {
          best = d;
          hit = e;
        }
      }
      if (hit) {
        g.fx.add({ kind: 'beam', x: p.x, y: p.y - 3, x2: hit.x, y2: hit.y, color: C.steelL, size: 1.5, life: 0.2 });
        damageEnemy(g, hit, finalDamage(p.stats) * 1.2, p.x, p.y, { source: 'melee' });
        if (!hit.def.boss && !hit.def.heavy) {
          const d = Math.sqrt(best) || 1;
          hit.kx -= ((hit.x - p.x) / d) * 380;
          hit.ky -= ((hit.y - p.y) / d) * 380;
        }
      } else if (wall < max) {
        // подтянуться к стене: короткий рывок с неуязвимостью
        g.fx.add({ kind: 'beam', x: p.x, y: p.y - 3, x2, y2, color: C.steelL, size: 1.5, life: 0.25 });
        p.dashT = Math.min(0.3, Math.max(0.05, (wall - 10) / (p.stats.dashDist / 0.14)));
        p.dashDx = Math.cos(a);
        p.dashDy = Math.sin(a);
        p.invuln = Math.max(p.invuln, p.dashT + 0.1);
      } else g.fx.add({ kind: 'beam', x: p.x, y: p.y - 3, x2, y2, color: C.steel, size: 1, life: 0.15 });
    },
  },
  // клинок: широкий рез по дуге, режет пули
  lhBlade: {
    cooldown: 0.55,
    use(g, a) {
      const p = g.player;
      g.fx.add({ kind: 'slash', x: p.x, y: p.y - 3, angle: a, arc: 2.6, size: 30, color: C.bone, life: 0.15, glow: true });
      for (const e of inArc(g, a, 30, 2.6)) damageEnemy(g, e, finalDamage(p.stats) * 1.3, p.x, p.y, { knockback: 60, source: 'melee' });
      for (const b of bulletsInArc(g, a, 30, 2.6)) b.dead = true;
      g.hitTile(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, finalDamage(p.stats));
    },
  },
  // второй пистолет: очередь из трёх пуль
  lhPistol: {
    cooldown: 0.5,
    use(g, a) {
      const p = g.player;
      const s = baseStats();
      s.damage = finalDamage(p.stats) * 0.6;
      s.shotColor = C.amber;
      for (let i = 0; i < 3; i++) spawnShot(g, a + (i - 1) * 0.06, s, { speed: 260 + i * 20 });
    },
  },
  // магнитный захват: ловит пули спереди и выбрасывает их обратно
  lhMagnet: {
    cooldown: 1.5,
    use(g, a) {
      const p = g.player;
      const caught = bulletsInArc(g, a, 56, 1.8);
      g.fx.add({ kind: 'slash', x: p.x, y: p.y - 3, angle: a, arc: 1.8, size: 56, color: C.violet, life: 0.2, glow: true });
      const s = baseStats();
      s.damage = finalDamage(p.stats) * 0.8;
      s.shotColor = C.violet;
      caught.forEach((b, i) => {
        b.dead = true;
        if (i < 24) spawnShot(g, a + (Math.random() - 0.5) * 0.5, s, { x: b.x, y: b.y, bx: b.x, by: b.y, speed: 230 });
      });
    },
  },
  // сварочная стенка: короткий барьер поперёк прицела на 3 с
  lhWeldWall: {
    cooldown: 6,
    use(g, a) {
      const p = g.player;
      const cx = p.x + Math.cos(a) * 22, cy = p.y - 3 + Math.sin(a) * 22;
      const nx = -Math.sin(a) * 20, ny = Math.cos(a) * 20;
      g.barriers.push({ x1: cx - nx, y1: cy - ny, x2: cx + nx, y2: cy + ny, t: 3 });
      g.fx.add({ kind: 'flash', x: cx, y: cy, color: C.amber, size: 18, life: 0.2, glow: true });
    },
  },
  // клещи: хватают лёгкого врага и швыряют вперёд; если врага нет — ломают ящик в осколки
  lhClamp: {
    cooldown: 1.2,
    use(g, a) {
      const p = g.player;
      const e = inArc(g, a, 26, 1.6).find((o) => !o.def.boss && !o.def.heavy);
      g.fx.add({ kind: 'slash', x: p.x, y: p.y - 3, angle: a, arc: 1.2, size: 20, color: C.steelL, life: 0.12, glow: true });
      if (e) {
        damageEnemy(g, e, finalDamage(p.stats) * 2, p.x, p.y, { source: 'melee' });
        e.kx += Math.cos(a) * 520;
        e.ky += Math.sin(a) * 520;
        e.shockT = Math.max(e.shockT, 0.6);
        return;
      }
      const tx = p.x + Math.cos(a) * 16, ty = p.y + Math.sin(a) * 16;
      if (g.hitTile(tx, ty, 999)) {
        const s = baseStats();
        s.damage = finalDamage(p.stats);
        s.shotColor = C.steelL;
        for (let i = 0; i < 4; i++) spawnShot(g, a + (i - 1.5) * 0.18, s, { x: tx, y: ty, bx: tx, by: ty, speed: 220, style: 'shard' });
      }
    },
  },
};

export const BODY_ITEMS: ItemDef[] = [
  // ---------------------------------------------------------------- дроп с врагов (этап 12)
  {
    id: 'iScrapScanner', kind: 'implant', slot: 'head', quality: 2, tags: ['optic'],
    name: { ru: 'Сканер утильщика', en: "Scrapper's Scanner" },
    desc: { ru: 'Шанс выпадения предметов с врагов +20%. Над врагами виден шанс.', en: 'Enemy item drop chance +20%. Shows the chance above enemies.' },
    icon: { shape: 'eye', color: C.yellow, accent: C.amber },
  },
  // ---------------------------------------------------------------- скелеты
  {
    id: 'skWorker', kind: 'skeleton', skeletonClass: 1, quality: 1, tags: ['kinetic'],
    name: { ru: 'Рабочий скелет', en: 'Worker Frame' },
    desc: { ru: 'Скелет класса 1: только модули обычной редкости.', en: 'Class 1 frame: common modules only.' },
    icon: { shape: 'spine', color: C.steel, accent: C.amber },
  },
  {
    id: 'skWorkerPlus', kind: 'skeleton', skeletonClass: 2, quality: 2, tags: ['heavy'],
    name: { ru: 'Усиленный рабочий скелет', en: 'Reinforced Worker Frame' },
    desc: { ru: 'Скелет класса 2. +1 к максимуму жизней.', en: 'Class 2 frame. +1 max life.' },
    icon: { shape: 'spine', color: C.steelL, accent: C.yellow },
    stats: (s) => {
      s.maxLives += 1;
    },
  },
  {
    id: 'skGuard', kind: 'skeleton', skeletonClass: 2, quality: 2, tags: ['kinetic'],
    name: { ru: 'Охранный скелет', en: 'Guard Frame' },
    desc: { ru: 'Скелет класса 2. Перезарядка рывка −20%.', en: 'Class 2 frame. Dash cooldown −20%.' },
    icon: { shape: 'spine', color: C.redD, accent: C.bone },
    stats: (s) => {
      s.dashCd *= 0.8;
    },
  },
  {
    id: 'skLoader', kind: 'skeleton', skeletonClass: 3, quality: 3, tags: ['heavy'],
    name: { ru: 'Погрузочный скелет', en: 'Loader Frame' },
    desc: { ru: 'Скелет класса 3. Урон +15%, скорость −5%.', en: 'Class 3 frame. Damage +15%, speed −5%.' },
    icon: { shape: 'spine', color: C.amber, accent: C.metal },
    stats: (s) => {
      s.damageMult *= 1.15;
      s.speed *= 0.95;
    },
  },
  {
    id: 'skPrototype', kind: 'skeleton', skeletonClass: 4, quality: 4, tags: ['neural'],
    name: { ru: 'Скелет-прототип', en: 'Prototype Frame' },
    desc: { ru: 'Скелет класса 4. Скорость и скорострельность +10%.', en: 'Class 4 frame. Speed and fire rate +10%.' },
    icon: { shape: 'spine', color: C.bone, accent: C.red },
    stats: (s) => {
      s.speed *= 1.1;
      s.fireRateMult *= 1.1;
    },
  },
  // ---------------------------------------------------------------- рюкзаки
  {
    id: 'bpSatchel', kind: 'backpack', capacity: 5, quality: 2, tags: ['kinetic'],
    name: { ru: 'Сумка', en: 'Satchel' },
    desc: { ru: 'Рюкзак на 5 мест. Работает сразу.', en: 'A 5-slot backpack. Works at once.' },
    icon: { shape: 'core', color: C.amberD, accent: C.amber },
  },
  {
    id: 'bpDuffel', kind: 'backpack', capacity: 7, quality: 3, tags: ['heavy'],
    name: { ru: 'Баул', en: 'Duffel' },
    desc: { ru: 'Рюкзак на 7 мест. Работает сразу.', en: 'A 7-slot backpack. Works at once.' },
    icon: { shape: 'core', color: C.metal, accent: C.yellow },
  },
  // ---------------------------------------------------------------- левая рука
  {
    id: 'lhShield', kind: 'implant', slot: 'armL', quality: 2, tags: ['heavy'],
    name: { ru: 'Ростовой щиток', en: 'Arm Shield' },
    desc: { ru: '[E, держать] Щит спереди гасит вражеские пули.', en: '[E, hold] A front shield blocks enemy bullets.' },
    icon: { shape: 'shield', color: C.steelL, accent: C.amber },
    leftHand: LEFT.lhShield,
  },
  {
    id: 'lhHarpoon', kind: 'implant', slot: 'armL', quality: 2, tags: ['kinetic'],
    name: { ru: 'Ручной гарпун', en: 'Arm Harpoon' },
    desc: { ru: '[E] Трос притягивает врага; попав в стену, подтягивает вас к ней.', en: '[E] The cable pulls an enemy in; hitting a wall pulls you to it.' },
    icon: { shape: 'whip', color: C.steelL, accent: C.red },
    leftHand: LEFT.lhHarpoon,
  },
  {
    id: 'lhBlade', kind: 'implant', slot: 'armL', quality: 1, tags: ['blade'],
    name: { ru: 'Клинок предплечья', en: 'Forearm Blade' },
    desc: { ru: '[E] Широкий рез по дуге: урон ×1.3, режет пули.', en: '[E] A wide arc cut: ×1.3 damage, cuts bullets.' },
    icon: { shape: 'blade', color: C.bone, accent: C.redD },
    leftHand: LEFT.lhBlade,
  },
  {
    id: 'lhPistol', kind: 'implant', slot: 'armL', quality: 1, tags: ['kinetic'],
    name: { ru: 'Второй пистолет', en: 'Off-hand Pistol' },
    desc: { ru: '[E] Очередь из трёх пуль (урон 60%).', en: '[E] A three-round burst (60% damage).' },
    icon: { shape: 'pistol', color: C.metal, accent: C.amber },
    leftHand: LEFT.lhPistol,
  },
  {
    id: 'lhMagnet', kind: 'implant', slot: 'armL', quality: 3, tags: ['electric'],
    name: { ru: 'Магнитный захват', en: 'Magnetic Grip' },
    desc: { ru: '[E] Ловит вражеские пули перед собой и выбрасывает их обратно.', en: '[E] Catches enemy bullets in front and throws them back.' },
    icon: { shape: 'coil', color: C.violet, accent: C.bone },
    leftHand: LEFT.lhMagnet,
  },
  {
    id: 'lhWeldWall', kind: 'implant', slot: 'armL', quality: 3, tags: ['fire'],
    name: { ru: 'Сварочная стенка', en: 'Weld Wall' },
    desc: { ru: '[E] Наваривает перед собой барьер на 3 с, он держит пули.', en: '[E] Welds a barrier in front for 3 s that stops bullets.' },
    icon: { shape: 'fire', color: C.amber, accent: C.steelL },
    leftHand: LEFT.lhWeldWall,
  },
  {
    id: 'lhClamp', kind: 'implant', slot: 'armL', quality: 2, tags: ['heavy'],
    name: { ru: 'Клещи', en: 'Clamp' },
    desc: { ru: '[E] Хватают лёгкого врага и швыряют (урон ×2); без врага — ломают ящик в осколки.', en: '[E] Grab a light enemy and hurl it (×2 damage); otherwise smash a crate into shards.' },
    icon: { shape: 'claw', color: C.steel, accent: C.yellow },
    leftHand: LEFT.lhClamp,
  },
];
