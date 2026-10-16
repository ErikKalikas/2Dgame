import { TAU } from '../core/math';
import { C } from '../gfx/palette';
import { humanoid, mech, spider } from '../gfx/sprites';
import { canvas, ctx2d, type Sprite } from '../gfx/sprite';
import { angleToPlayer, every, move } from '../game/ai';
import { Enemy, type EnemyDef } from '../game/enemy';
import type { Game } from '../game/game';
import { aim, flower, n, ring, shoot, spread, stream } from '../game/patterns';
import { ENEMY_BY_ID } from './enemies';

// Боссы — по одному на этаж. У каждого несколько фаз (как спелл-карты в Touhou):
// при переходе фазы экран очищается от пуль, и босс меняет рисунок атаки.

/** Плавное перемещение босса между случайными точками верхней части комнаты */
function drift(e: Enemy, g: Game, dt: number, speed = 40, area = 0.55) {
  const room = g.room;
  if (!e.mem.goal || e.mem.goalT <= 0 || Math.hypot(e.mem.goal.x - e.x, e.mem.goal.y - e.y) < 6) {
    e.mem.goal = {
      x: 64 + Math.random() * (room.pxW - 128),
      y: 56 + Math.random() * (room.pxH * area - 56),
    };
    e.mem.goalT = 2.5;
  }
  e.mem.goalT -= dt;
  const a = Math.atan2(e.mem.goal.y - e.y, e.mem.goal.x - e.x);
  move(e, g, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt);
  e.anim += dt * 2;
}

function upscale(frames: Sprite[], k: number): Sprite[] {
  return frames.map((f) => {
    const c = canvas(f.width * k, f.height * k);
    const x = ctx2d(c);
    x.drawImage(f, 0, 0, c.width, c.height);
    return c;
  });
}

/** Рывок к игроку со следом из пуль. Возвращает true, когда рывок закончен */
function dashAttack(e: Enemy, g: Game, dt: number, speed: number, trail: boolean): boolean {
  const m = e.mem;
  if (m.dash === undefined) {
    m.dash = 'tell';
    m.dashT = 0.5;
    m.dashA = angleToPlayer(e, g);
  }
  if (m.dash === 'tell') {
    m.dashT -= dt;
    e.flash = Math.sin(m.dashT * 40) > 0 ? 0.04 : 0;
    m.dashA = angleToPlayer(e, g);
    if (m.dashT <= 0) {
      m.dash = 'go';
      m.dashT = 0.55;
    }
    return false;
  }
  m.dashT -= dt;
  const r = move(e, g, Math.cos(m.dashA) * speed * dt, Math.sin(m.dashA) * speed * dt);
  if (trail && every(e, g, 'trail', 0.05, dt, 0)) {
    for (const s of [1, -1])
      shoot(g, e.x, e.y, m.dashA + (s * Math.PI) / 2, 0, { skin: 'rice', color: 'amber', delay: 0.5, accel: 80, maxSpeed: 85 });
  }
  if (m.dashT <= 0 || r.hx || r.hy) {
    m.dash = undefined;
    return true;
  }
  return false;
}

const BOSS_BASE = { boss: true, heavy: true, minFloor: 99, weight: 0, cost: 0, xp: 30, coins: 8 } as const;

export const BOSSES: EnemyDef[] = [
  // 1 ---------------------------------------------------------------------
  {
    ...BOSS_BASE,
    id: 'sentinel',
    name: { ru: 'Охранный мех СТРАЖ-9', en: 'Security Mech WARDEN-9' },
    hp: 420, speed: 40, r: 14,
    frames: () => mech({ w: 32, h: 32, body: C.redD, dark: C.blood, light: C.red, eye: C.yellow, legs: 'biped', cockpit: true, guns: 2 }),
    update() {},
    phases: [
      {
        name: { ru: 'Протокол задержания', en: 'Detention Protocol' }, until: 0.66,
        update(e, g, dt) {
          drift(e, g, dt);
          if (every(e, g, 'a', 1.4, dt)) spread(g, e.x, e.y, aim(g, e.x, e.y), 5, 0.7, 105, { skin: 'rice' });
          if (every(e, g, 'b', 0.95, dt)) ring(g, e.x, e.y, 12, 70, Math.random(), { skin: 'small', color: 'amber' });
        },
      },
      {
        name: { ru: 'Вращающийся периметр', en: 'Rotating Perimeter' }, until: 0.33,
        update(e, g, dt) {
          e.mem.a = (e.mem.a ?? 0) + dt * 1.25;
          if (every(e, g, 'a', 0.085, dt)) for (let k = 0; k < 4; k++) shoot(g, e.x, e.y, e.mem.a + (k * TAU) / 4, 95, { skin: 'orb' });
          if (every(e, g, 'b', 1.8, dt)) shoot(g, e.x, e.y, aim(g, e.x, e.y), 120, { skin: 'big', color: 'amber' });
        },
      },
      {
        name: { ru: 'Огневой вал', en: 'Barrage Wall' }, until: 0,
        update(e, g, dt) {
          drift(e, g, dt, 30, 0.35);
          if (every(e, g, 'a', 1.7, dt)) {
            // ряд пуль поперёк комнаты с проходом возле игрока
            const gap = g.player.x + (Math.random() - 0.5) * 60;
            for (let x = 24; x < g.room.pxW - 24; x += g.hard ? 14 : 18) {
              if (Math.abs(x - gap) < 26) continue;
              shoot(g, x, 40, Math.PI / 2, 75, { skin: 'rice', color: 'red' });
            }
          }
          if (every(e, g, 'b', 2.3, dt)) ring(g, e.x, e.y, 18, 85, Math.random(), { skin: 'orb', color: 'amber' });
        },
      },
    ],
  },
  // 2 ---------------------------------------------------------------------
  {
    ...BOSS_BASE,
    id: 'arachna',
    name: { ru: 'Паук-танк АРАХНА', en: 'Spider Tank ARACHNE' },
    hp: 520, speed: 45, r: 15,
    frames: () => upscale(spider(C.steel, C.red, 18, 3), 2),
    update() {},
    phases: [
      {
        name: { ru: 'Минное поле', en: 'Minefield' }, until: 0.66,
        update(e, g, dt) {
          drift(e, g, dt, 35);
          const mines = g.enemies.filter((o) => o.def.id === 'spiderMine' && !o.dead).length;
          if (mines < 4 && every(e, g, 'm', 3.6, dt)) {
            for (const s of [-1, 1]) {
              const m = new Enemy(ENEMY_BY_ID.get('spiderMine')!, e.x + s * 20, e.y + 10, 1);
              m.spawn = 0.3;
              m.mem.summoned = true;
              g.enemies.push(m);
            }
          }
          if (every(e, g, 'r', 1.9, dt)) ring(g, e.x, e.y, 14, 80, Math.random());
        },
      },
      {
        name: { ru: 'Шестиногий вихрь', en: 'Six-legged Vortex' }, until: 0.33,
        update(e, g, dt) {
          e.phaseT += dt;
          const dir = Math.floor(e.phaseT / 3) % 2 ? -1 : 1;
          e.mem.a = (e.mem.a ?? 0) + dt * 1.6 * dir;
          if (every(e, g, 'a', 0.11, dt)) for (let k = 0; k < 6; k++) shoot(g, e.x, e.y, e.mem.a + (k * TAU) / 6, 85, { skin: 'rice', color: k % 2 ? 'red' : 'amber' });
        },
      },
      {
        name: { ru: 'Таранный рывок', en: 'Ramming Charge' }, until: 0,
        update(e, g, dt) {
          if (e.mem.rest > 0) {
            e.mem.rest -= dt;
            drift(e, g, dt, 25);
            return;
          }
          if (dashAttack(e, g, dt, 260, true)) {
            ring(g, e.x, e.y, 20, 90, Math.random(), { skin: 'orb' });
            e.mem.rest = 0.9 * g.diff.cooldown;
          }
        },
      },
    ],
  },
  // 3 ---------------------------------------------------------------------
  {
    ...BOSS_BASE,
    id: 'gunship',
    name: { ru: 'Ави-штурмовик ГРИФ', en: 'Gunship VULTURE' },
    hp: 560, speed: 60, r: 16, flying: true,
    frames: () => mech({ w: 40, h: 28, body: C.metal, dark: C.dark, light: C.steelL, eye: C.red, legs: 'none', cockpit: true, guns: 3 }),
    update() {},
    phases: [
      {
        name: { ru: 'Заградительный огонь', en: 'Suppressing Fire' }, until: 0.66,
        update(e, g, dt) {
          e.mem.dir = e.mem.dir ?? 1;
          const r = move(e, g, e.mem.dir * 70 * dt, (60 - e.y) * dt);
          if (r.hx || e.x < 50 || e.x > g.room.pxW - 50) e.mem.dir *= -1;
          if (every(e, g, 'a', 0.16, dt)) {
            e.mem.side = -(e.mem.side ?? 1);
            shoot(g, e.x + e.mem.side * 12, e.y + 6, aim(g, e.x, e.y, 0.1), 140, { skin: 'rice' });
          }
          if (every(e, g, 'b', 2, dt)) spread(g, e.x, e.y, Math.PI / 2, 9, 1.6, 75, { skin: 'orb', color: 'amber' });
        },
      },
      {
        name: { ru: 'Ракетный дождь', en: 'Missile Rain' }, until: 0.33,
        update(e, g, dt) {
          drift(e, g, dt, 50, 0.3);
          if (every(e, g, 'a', 1.1, dt)) {
            // отметка ракеты: кольцо пуль "зависает" и мигает, затем разлетается
            const p = g.player;
            const tx = p.x + (Math.random() - 0.5) * 120, ty = p.y + (Math.random() - 0.5) * 90;
            ring(g, tx, ty, 10, 70, Math.random(), { skin: 'orb', color: 'amber', delay: 1.0 });
            g.fx.ring(tx, ty, C.red, 18, 1.0);
          }
        },
      },
      {
        name: { ru: 'Ковровая бомбардировка', en: 'Carpet Bombing' }, until: 0,
        update(e, g, dt) {
          drift(e, g, dt, 40, 0.3);
          e.mem.a = (e.mem.a ?? 0) + dt * 0.7;
          if (every(e, g, 'a', 0.6, dt)) ring(g, e.x, e.y, 22, 75, e.mem.a, { skin: 'small' });
          if (every(e, g, 'b', 1.6, dt)) spread(g, e.x, e.y, aim(g, e.x, e.y), 3, 1.2, 60, { skin: 'shard', color: 'violet', homing: 1.1 });
        },
      },
    ],
  },
  // 4 ---------------------------------------------------------------------
  {
    ...BOSS_BASE,
    id: 'twins',
    name: { ru: 'Близнецы КАСТОР и ПОЛЛУКС', en: 'Twins CASTOR & POLLUX' },
    hp: 700, speed: 60, r: 11,
    frames: () => upscale(humanoid({ body: C.steel, dark: C.metal, light: C.bone, visor: C.red, head: 'dome', arms: 'gun', wide: true }), 2),
    update() {},
    phases: [
      {
        name: { ru: 'Зеркальный танец', en: 'Mirror Dance' }, until: 0.45,
        update(e, g, dt) {
          twinOrbit(e, g, dt);
          const rage = twinRage(e, g);
          if (e.mem.twin < 0) {
            if (every(e, g, 'a', 1.5 * rage, dt)) ring(g, e.x, e.y, 16, 80, Math.random(), { skin: 'orb' });
          } else if (every(e, g, 'a', 1.0 * rage, dt)) stream(g, e.x, e.y, aim(g, e.x, e.y), 4, 90, 18, { skin: 'rice', color: 'amber' });
        },
      },
      {
        name: { ru: 'Перекрёстный огонь', en: 'Crossfire' }, until: 0,
        update(e, g, dt) {
          twinOrbit(e, g, dt);
          const rage = twinRage(e, g);
          e.mem.a = (e.mem.a ?? 0) + dt * 1.4 * e.mem.twin;
          if (every(e, g, 'a', 0.12 * rage, dt)) for (let k = 0; k < 3; k++) shoot(g, e.x, e.y, e.mem.a + (k * TAU) / 3, 90, { skin: 'orb', color: e.mem.twin < 0 ? 'red' : 'amber' });
          if (every(e, g, 'b', 2.2 * rage, dt)) spread(g, e.x, e.y, aim(g, e.x, e.y), 5, 0.6, 120, { skin: 'rice' });
        },
      },
    ],
  },
  // 5 ---------------------------------------------------------------------
  {
    ...BOSS_BASE,
    id: 'goliath',
    name: { ru: 'Ходячий танк ГОЛИАФ', en: 'Walking Tank GOLIATH' },
    hp: 760, speed: 30, r: 18,
    frames: () => mech({ w: 44, h: 40, body: C.steel, dark: C.metal, light: C.steelL, eye: C.red, legs: 'biped', cockpit: true, guns: 3, horns: true }),
    update() {},
    phases: [
      {
        name: { ru: 'Рельсотрон', en: 'Railgun' }, until: 0.66,
        update(e, g, dt) {
          railgun(e, g, dt);
        },
      },
      {
        name: { ru: 'Ракетный залп', en: 'Rocket Salvo' }, until: 0.33,
        update(e, g, dt) {
          drift(e, g, dt, 25);
          if (every(e, g, 'a', 2.8, dt)) for (let k = 0; k < n(g, 6); k++) shoot(g, e.x, e.y, angleToPlayer(e, g) + Math.PI + (k - 2.5) * 0.45, 80, { skin: 'big', color: 'amber', homing: 1.3, life: 5 });
          if (every(e, g, 'b', 1.2, dt)) spread(g, e.x, e.y, aim(g, e.x, e.y), 7, 1.0, 100, { skin: 'small' });
        },
      },
      {
        name: { ru: 'Полный арсенал', en: 'Full Arsenal' }, until: 0,
        update(e, g, dt) {
          railgun(e, g, dt);
          if (every(e, g, 'c', 2.0, dt)) ring(g, e.x, e.y, 20, 70, Math.random(), { skin: 'orb', color: 'amber' });
        },
      },
    ],
  },
  // 6 ---------------------------------------------------------------------
  {
    ...BOSS_BASE,
    id: 'hive',
    name: { ru: 'Рой-ядро УЛЕЙ', en: 'Swarm Core HIVE' },
    hp: 680, speed: 20, r: 16, flying: true,
    frames: () => mech({ w: 34, h: 34, body: C.amberD, dark: C.dark, light: C.amber, eye: C.yellow, legs: 'six', core: C.red }),
    update() {},
    phases: [
      {
        name: { ru: 'Цветок улья', en: 'Hive Bloom' }, until: 0.66,
        update(e, g, dt) {
          drift(e, g, dt, 20);
          e.mem.a = (e.mem.a ?? 0) + dt * 0.6;
          if (every(e, g, 'a', 0.55, dt)) flower(g, e.x, e.y, 6, 3, 80, e.mem.a, { skin: 'small', color: 'amber' });
        },
      },
      {
        name: { ru: 'Рой', en: 'The Swarm' }, until: 0.33,
        update(e, g, dt) {
          drift(e, g, dt, 20);
          const bots = g.enemies.filter((o) => o.def.id === 'swarm' && !o.dead).length;
          if (bots < 10 && every(e, g, 's', 4.5, dt)) {
            for (let k = 0; k < 4; k++) {
              const m = new Enemy(ENEMY_BY_ID.get('swarm')!, e.x + (Math.random() - 0.5) * 30, e.y + 20, 1);
              m.spawn = 0.3;
              m.mem.summoned = true;
              g.enemies.push(m);
            }
          }
          e.mem.a = (e.mem.a ?? 0) - dt * 0.5;
          if (every(e, g, 'a', 0.9, dt)) flower(g, e.x, e.y, 5, 2, 70, e.mem.a, { skin: 'orb' });
        },
      },
      {
        name: { ru: 'Спираль сот', en: 'Honeycomb Spiral' }, until: 0,
        update(e, g, dt) {
          e.mem.a = (e.mem.a ?? 0) + dt * 2.1;
          if (every(e, g, 'a', 0.07, dt)) {
            shoot(g, e.x, e.y, e.mem.a, 30, { skin: 'orb', color: 'amber', accel: 60, maxSpeed: 130 });
            shoot(g, e.x, e.y, -e.mem.a + Math.PI, 30, { skin: 'orb', color: 'red', accel: 60, maxSpeed: 130 });
          }
        },
      },
    ],
  },
  // 7 ---------------------------------------------------------------------
  {
    ...BOSS_BASE,
    id: 'executioner',
    name: { ru: 'Палач', en: 'The Executioner' },
    hp: 820, speed: 50, r: 12,
    frames: () => upscale(humanoid({ body: C.black, dark: C.dark, light: C.grey, visor: C.redL, head: 'skull', arms: 'blades', wide: true }), 2),
    update() {},
    phases: [
      {
        name: { ru: 'Клинки-богомолы', en: 'Mantis Blades' }, until: 0.66,
        update(e, g, dt) {
          if (e.mem.rest > 0) {
            e.mem.rest -= dt;
            drift(e, g, dt, 30, 0.8);
            return;
          }
          if (dashAttack(e, g, dt, 300, true)) {
            spread(g, e.x, e.y, aim(g, e.x, e.y), 9, 1.2, 110, { skin: 'small', color: 'amber' });
            e.mem.rest = 0.8 * g.diff.cooldown;
          }
        },
      },
      {
        name: { ru: 'Клетка Сандевистана', en: 'Sandevistan Cage' }, until: 0.33,
        update(e, g, dt) {
          drift(e, g, dt, 35, 0.8);
          if (every(e, g, 'a', 2.6, dt)) {
            // кольцо пуль вокруг игрока, которое сжимается
            const p = g.player;
            const c = n(g, 22);
            const off = Math.random() * TAU;
            for (let i = 0; i < c; i++) {
              const a = off + (i / c) * TAU;
              shoot(g, p.x + Math.cos(a) * 95, p.y + Math.sin(a) * 95, a + Math.PI, 45, { skin: 'rice', color: 'violet', delay: 0.8, life: 4 });
            }
          }
          if (every(e, g, 'b', 1.3, dt)) stream(g, e.x, e.y, aim(g, e.x, e.y), 3, 120, 25, { skin: 'rice' });
        },
      },
      {
        name: { ru: 'Ярость', en: 'Fury' }, until: 0,
        update(e, g, dt) {
          if (dashAttack(e, g, dt, 340, true)) ring(g, e.x, e.y, 18, 95, Math.random(), { skin: 'orb' });
        },
      },
    ],
  },
  // 8 ---------------------------------------------------------------------
  {
    ...BOSS_BASE,
    id: 'blackice',
    name: { ru: 'ИСКИН «ЧЁРНЫЙ ЛЁД»', en: 'AI "BLACK ICE"' },
    hp: 1700, speed: 20, r: 20, flying: true, xp: 0,
    frames: () => mech({ w: 48, h: 44, body: C.blood, dark: C.black, light: C.violet, eye: C.redL, legs: 'six', core: C.redL, horns: true, guns: 2 }),
    update() {},
    phases: [
      {
        name: { ru: 'Дождь данных', en: 'Data Rain' }, until: 0.8,
        update(e, g, dt) {
          drift(e, g, dt, 15, 0.3);
          if (every(e, g, 'a', 0.07, dt)) {
            const x = 20 + Math.random() * (g.room.pxW - 40);
            shoot(g, x, 24, Math.PI / 2 + (Math.random() - 0.5) * 0.2, 70 + Math.random() * 40, { skin: 'rice', color: Math.random() < 0.2 ? 'violet' : 'red' });
          }
          if (every(e, g, 'b', 1.6, dt)) ring(g, e.x, e.y, 16, 80, Math.random(), { skin: 'orb', color: 'amber' });
        },
      },
      {
        name: { ru: 'Решётка', en: 'Lattice' }, until: 0.6,
        update(e, g, dt) {
          e.mem.a = (e.mem.a ?? 0) + dt * 0.9;
          if (every(e, g, 'a', 0.16, dt)) {
            for (let k = 0; k < 5; k++) {
              shoot(g, e.x, e.y, e.mem.a + (k * TAU) / 5, 70, { skin: 'orb', color: 'red' });
              shoot(g, e.x, e.y, -e.mem.a + (k * TAU) / 5, 70, { skin: 'orb', color: 'violet' });
            }
          }
        },
      },
      {
        name: { ru: 'Ледяные осколки', en: 'Ice Shards' }, until: 0.4,
        update(e, g, dt) {
          drift(e, g, dt, 20, 0.35);
          if (every(e, g, 'a', 1.5, dt)) {
            const c = n(g, 16);
            for (let i = 0; i < c; i++) {
              const a = (i / c) * TAU;
              const x = e.x + Math.cos(a) * 40, y = e.y + Math.sin(a) * 40;
              // осколки зависают, затем летят в игрока
              shoot(g, x, y, Math.atan2(g.player.y - y, g.player.x - x), 10, { skin: 'shard', color: 'violet', delay: 0.7, accel: 180, maxSpeed: 170 });
            }
          }
          if (every(e, g, 'b', 0.8, dt)) ring(g, e.x, e.y, 10, 60, Math.random(), { skin: 'small' });
        },
      },
      {
        name: { ru: 'Чистка системы', en: 'System Purge' }, until: 0.2,
        update(e, g, dt) {
          e.mem.a = (e.mem.a ?? 0) + dt * 0.5;
          if (every(e, g, 'a', 0.5, dt)) flower(g, e.x, e.y, 7, 3, 85, e.mem.a, { skin: 'small', color: 'amber' });
          if (every(e, g, 'b', 2.2, dt)) spread(g, e.x, e.y, aim(g, e.x, e.y), 4, 1.5, 55, { skin: 'big', color: 'violet', homing: 1.0, life: 5 });
          if (every(e, g, 'c', 3, dt)) {
            const gap = g.player.y + (Math.random() - 0.5) * 50;
            for (let y = 30; y < g.room.pxH - 30; y += 16) if (Math.abs(y - gap) > 26) shoot(g, 24, y, 0, 70, { skin: 'rice' });
          }
        },
      },
      {
        name: { ru: 'Последний протокол', en: 'Final Protocol' }, until: 0,
        update(e, g, dt) {
          e.mem.a = (e.mem.a ?? 0) + dt * 2.6;
          if (every(e, g, 'a', 0.06, dt)) {
            shoot(g, e.x, e.y, e.mem.a, 40, { skin: 'orb', color: 'red', accel: 70, maxSpeed: 150 });
            shoot(g, e.x, e.y, e.mem.a + Math.PI, 40, { skin: 'orb', color: 'violet', accel: 70, maxSpeed: 150 });
          }
          if (every(e, g, 'b', 1.4, dt)) ring(g, e.x, e.y, 24, 65, Math.random(), { skin: 'small', color: 'amber' });
        },
      },
    ],
  },
];

function twinOrbit(e: Enemy, g: Game, dt: number) {
  const c = g.room.centerPoint();
  e.mem.orb = (e.mem.orb ?? (e.mem.twin < 0 ? Math.PI : 0)) + dt * 0.5;
  const tx = c.x + Math.cos(e.mem.orb) * 110;
  const ty = c.y - 20 + Math.sin(e.mem.orb) * 50;
  move(e, g, (tx - e.x) * Math.min(1, dt * 2), (ty - e.y) * Math.min(1, dt * 2));
  e.anim += dt * 3;
}

/** Если второй близнец погиб — оставшийся атакует вдвое чаще */
function twinRage(e: Enemy, g: Game): number {
  const other = g.enemies.find((o) => o !== e && o.def.id === 'twins' && !o.dead);
  return other ? 1 : 0.55;
}

function railgun(e: Enemy, g: Game, dt: number) {
  const m = e.mem;
  if (m.rail === undefined) {
    drift(e, g, dt, 25);
    if (every(e, g, 'rail', 2.6, dt)) {
      m.rail = 1.3;
      m.laser = angleToPlayer(e, g);
    }
    return;
  }
  m.rail -= dt;
  // прицел медленно доворачивает к игроку, затем фиксируется
  if (m.rail > 0.35) {
    const want = angleToPlayer(e, g);
    let d = want - m.laser;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    m.laser += Math.max(-1.2 * dt, Math.min(1.2 * dt, d));
  }
  if (m.rail <= 0) {
    for (let i = 0; i < 22; i++) shoot(g, e.x, e.y, m.laser, 160 + i * 16, { skin: 'rice', color: 'bone' });
    spread(g, e.x, e.y, m.laser, 2, 0.5, 120, { skin: 'big', color: 'red' });
    m.rail = undefined;
    m.laser = undefined;
  }
}
