import { TAU } from '../core/math';
import { C } from '../gfx/palette';
import {
  flamerArt, gekkoArt, guardArt, heavyArt, mantisArt, mechanoidArt, netrunnerArt, psychoArt,
  punkArt, repairArt, scavArt, sniperArt, spiderMineArt, swarmArt, turretArt, watcherArt,
} from '../gfx/art/enemies';
import { angleToPlayer, chase, distToPlayer, every, inRange, keepRange, move, wander } from '../game/ai';
import type { EnemyDef } from '../game/enemy';
import { aim, flower, ring, shoot, spread, stream } from '../game/patterns';
import { lineOfSight } from '../game/collision';

// 16 типов врагов. Вдохновлены уличными бандами, корпоративной охраной и боевыми роботами.
// Этап 12: тип (киборг/робот), класс ценности I–IV и набор предметов — см. заметку «Наборы врагов».
// Первые три id набора — «ядро» (первая ступень синергии). Предметы наборов появятся в 12б;
// пока их нет в ITEMS, удачный дроп даёт горсть энергоячеек.

export const ENEMIES: EnemyDef[] = [
  {
    id: 'scav',
    name: { ru: 'Падальщик', en: 'Scavenger' },
    kind: 'cyborg', value: 1,
    drops: ['wScavHook', 'iScavLegs', 'iScavCrate'],
    hp: 10, speed: 72, r: 6, xp: 2, coins: 0.6, minFloor: 1, weight: 10, cost: 1, group: [1, 3],
    frames: () => scavArt(),
    update(e, g, dt) {
      chase(e, g, dt);
    },
  },
  {
    id: 'punk',
    name: { ru: 'Трубач', en: 'Pipe Gunner' },
    kind: 'cyborg', value: 1,
    drops: ['wPunkPipe', 'iPunkSoles', 'iPunkBandolier'],
    hp: 12, speed: 48, r: 6, xp: 3, coins: 0.8, minFloor: 1, weight: 10, cost: 2,
    frames: () => punkArt(),
    update(e, g, dt) {
      keepRange(e, g, dt, 80, 150);
      if (inRange(e, g) && every(e, g, 'fire', 1.7, dt)) {
        spread(g, e.x, e.y, aim(g, e.x, e.y), g.hard ? 3 : 1, 0.25, 110);
      }
    },
  },
  {
    id: 'drone',
    name: { ru: 'Дрон-наблюдатель', en: 'Watcher Drone' },
    kind: 'robot', value: 1,
    drops: ['pDroneRing', 'pDroneRange', 'pDroneScan'],
    hp: 8, speed: 58, r: 6, flying: true, xp: 2, coins: 0.5, minFloor: 1, weight: 8, cost: 2,
    frames: () => watcherArt(),
    contact: false,
    update(e, g, dt) {
      keepRange(e, g, dt, 60, 120);
      if (inRange(e, g) && every(e, g, 'fire', 2.3, dt)) ring(g, e.x, e.y, 8, 70, Math.random(), { skin: 'small' });
    },
  },
  {
    id: 'spiderMine',
    name: { ru: 'Паук-мина', en: 'Spider Mine' },
    kind: 'robot', value: 1,
    drops: ['pSpiderSticky', 'pSpiderCrawlers', 'pSpiderWeb'],
    hp: 6, speed: 105, r: 5, xp: 2, coins: 0.3, minFloor: 2, weight: 6, cost: 1, group: [2, 3],
    frames: () => spiderMineArt(),
    update(e, g, dt) {
      if (e.mem.arm !== undefined) {
        e.mem.arm -= dt;
        e.flash = Math.sin(e.mem.arm * 40) > 0 ? 0.05 : 0;
        if (e.mem.arm <= 0) {
          ring(g, e.x, e.y, 12, 85, Math.random(), { skin: 'orb', color: 'amber' });
          g.fx.explosion(e.x, e.y, 18, C.amber);
          e.hp = 0;
          g.killEnemy(e, false);
        }
        return;
      }
      chase(e, g, dt);
      if (distToPlayer(e, g) < 30) e.mem.arm = 0.55;
    },
  },
  {
    id: 'turret',
    name: { ru: 'Автотурель', en: 'Auto-turret' },
    kind: 'robot', value: 2,
    drops: ['pTurretSwivel', 'pTurretThermo', 'pTurretSpinners', 'pTurretSentry'],
    hp: 26, speed: 0, r: 7, xp: 3, coins: 0.8, minFloor: 2, weight: 5, cost: 2, heavy: true,
    frames: () => turretArt(),
    update(e, g, dt) {
      e.mem.a = (e.mem.a ?? Math.random() * TAU) + dt * 1.6;
      e.mem.cycle = (e.mem.cycle ?? Math.random() * 4) + dt;
      if (e.mem.cycle % 4 < 2.2 && inRange(e, g) && every(e, g, 'fire', 0.13, dt)) {
        shoot(g, e.x, e.y, e.mem.a, 90, { skin: 'small' });
        shoot(g, e.x, e.y, e.mem.a + Math.PI, 90, { skin: 'small' });
      }
    },
  },
  {
    id: 'guard',
    name: { ru: 'Вахтёр', en: 'Gatekeeper' },
    kind: 'cyborg', value: 2,
    drops: ['iGuardPlate', 'iGuardVisor', 'wGuardTurnstile', 'iGuardKeys'],
    hp: 30, speed: 40, r: 7, xp: 4, coins: 1.2, minFloor: 3, weight: 8, cost: 3,
    frames: () => guardArt(),
    update(e, g, dt) {
      keepRange(e, g, dt, 60, 130);
      e.mem.face = angleToPlayer(e, g);
      if (inRange(e, g) && every(e, g, 'fire', 1.8, dt)) {
        spread(g, e.x, e.y, aim(g, e.x, e.y), 3, 0.35, 105, { skin: 'rice' });
        if (g.hard) spread(g, e.x, e.y, aim(g, e.x, e.y), 3, 0.35, 80, { skin: 'rice', delay: 0.15 });
      }
    },
    // щит спереди: урон по фронту снижен
    damageTaken(e, _g, dmg, fx, fy) {
      const a = Math.atan2(fy - e.y, fx - e.x);
      let d = Math.abs(a - (e.mem.face ?? 0)) % TAU;
      if (d > Math.PI) d = TAU - d;
      return d < 0.9 ? dmg * 0.35 : dmg;
    },
  },
  {
    id: 'netrunner',
    name: { ru: 'Мигун', en: 'Blinker' },
    kind: 'cyborg', value: 2,
    drops: ['wBlinkFive', 'iBlinkAntenna', 'iBlinkTorso', 'iBlinkLegs'],
    hp: 18, speed: 30, r: 6, xp: 4, coins: 1, minFloor: 3, weight: 6, cost: 3,
    frames: () => netrunnerArt(),
    contact: false,
    update(e, g, dt) {
      e.mem.tp = (e.mem.tp ?? 1.5 + Math.random() * 2) - dt;
      if (e.mem.tp < 0.4) e.hidden = Math.sin(e.mem.tp * 50) > 0;
      if (e.mem.tp <= 0) {
        const p = g.room.randomFloorPoint(g.rng, g.player.x, g.player.y, 80);
        g.fx.burst(e.x, e.y, C.violet, 8, 60, 0.3, 1, true);
        e.x = p.x;
        e.y = p.y;
        e.hidden = false;
        e.mem.tp = 3 * g.diff.cooldown;
        e.mem.cast = 0.5;
      }
      if (e.mem.cast !== undefined) {
        e.mem.cast -= dt;
        if (e.mem.cast <= 0) {
          e.mem.cast = undefined;
          spread(g, e.x, e.y, aim(g, e.x, e.y), 5, 1.4, 65, { skin: 'shard', color: 'violet', homing: g.hard ? 1.3 : 0.8 });
        }
      }
      wander(e, g, dt);
    },
  },
  {
    id: 'heavy',
    name: { ru: 'Тяжёлый штурмовик', en: 'Heavy Trooper' },
    kind: 'cyborg', value: 3,
    drops: ['wHeavyRampart', 'iHeavyBelt', 'iHeavyPlates', 'iHeavyBraces', 'iHeavyLoader'],
    hp: 60, speed: 30, r: 8, xp: 6, coins: 1.6, minFloor: 4, weight: 6, cost: 4, heavy: true,
    frames: () => heavyArt(),
    update(e, g, dt) {
      keepRange(e, g, dt, 50, 120);
      if (inRange(e, g) && every(e, g, 'fire', 2.4, dt)) e.mem.burst = 3;
      if (e.mem.burst > 0 && every(e, g, 'burstT', 0.22, dt, 0)) {
        e.mem.burst--;
        spread(g, e.x, e.y, aim(g, e.x, e.y), 7, 0.9, 95 + e.mem.burst * 15, { skin: 'small', color: 'amber' });
      }
    },
  },
  {
    id: 'mantis',
    name: { ru: 'Резчик', en: 'Cutter' },
    kind: 'cyborg', value: 3,
    drops: ['iCutterSickle', 'iCutterTrail', 'iCutterSensor', 'iCutterSheath', 'wCutterAwl'],
    hp: 25, speed: 60, r: 6, xp: 5, coins: 1.2, minFloor: 4, weight: 6, cost: 3,
    frames: () => mantisArt(),
    update(e, g, dt) {
      const st = e.mem.st ?? 'walk';
      if (st === 'walk') {
        keepRange(e, g, dt, 60, 110);
        if (inRange(e, g, 180) && every(e, g, 'dash', 2.6, dt)) {
          e.mem.st = 'tell';
          e.mem.tt = 0.45;
          e.mem.da = angleToPlayer(e, g);
        }
      } else if (st === 'tell') {
        e.mem.tt -= dt;
        e.flash = Math.sin(e.mem.tt * 40) > 0 ? 0.04 : 0;
        if (e.mem.tt <= 0) {
          e.mem.st = 'dash';
          e.mem.tt = 0.35;
        }
      } else {
        e.mem.tt -= dt;
        const r = move(e, g, Math.cos(e.mem.da) * 310 * dt, Math.sin(e.mem.da) * 310 * dt);
        if (every(e, g, 'trail', 0.04, dt, 0)) {
          shoot(g, e.x, e.y, e.mem.da + Math.PI / 2, 0, { skin: 'rice', color: 'amber', delay: 0.45, accel: 90, maxSpeed: 90 });
          shoot(g, e.x, e.y, e.mem.da - Math.PI / 2, 0, { skin: 'rice', color: 'amber', delay: 0.45, accel: 90, maxSpeed: 90 });
        }
        if (e.mem.tt <= 0 || r.hx || r.hy) e.mem.st = 'walk';
      }
    },
  },
  {
    id: 'gekko',
    name: { ru: 'Прыгун «Блоха»', en: '“Flea” Hopper' },
    kind: 'robot', value: 3,
    drops: ['pFleaHop', 'pFleaLob', 'pFleaCatapult', 'pFleaItch', 'pFleaBite'],
    hp: 45, speed: 40, r: 8, xp: 6, coins: 1.4, minFloor: 5, weight: 5, cost: 4,
    frames: () => gekkoArt(),
    update(e, g, dt) {
      const st = e.mem.st ?? 'walk';
      if (st === 'walk') {
        wander(e, g, dt, 30);
        if (inRange(e, g) && every(e, g, 'jump', 3, dt)) {
          e.mem.st = 'jump';
          e.mem.tt = 0;
          e.mem.sx = e.x;
          e.mem.sy = e.y;
          const p = g.player;
          const t = g.room.randomFloorPoint(g.rng, p.x, p.y, 0);
          // приземлиться рядом с игроком, но не вплотную
          const a = Math.random() * TAU;
          e.mem.tx = Math.abs(t.x - p.x) < 300 ? p.x + Math.cos(a) * 50 : t.x;
          e.mem.ty = Math.abs(t.y - p.y) < 300 ? p.y + Math.sin(a) * 50 : t.y;
          e.airborne = true;
        }
      } else {
        e.mem.tt += dt / 0.9;
        const k = Math.min(1, e.mem.tt);
        const nx = e.mem.sx + (e.mem.tx - e.mem.sx) * k;
        const ny = e.mem.sy + (e.mem.ty - e.mem.sy) * k;
        move(e, g, nx - e.x, ny - e.y);
        e.mem.h = Math.sin(k * Math.PI) * 30;
        if (k >= 1) {
          e.airborne = false;
          e.mem.h = 0;
          e.mem.st = 'walk';
          // если приземлился в яму — сдвигаем на ближайший пол
          ring(g, e.x, e.y, 16, 80, Math.random(), { skin: 'orb' });
          ring(g, e.x, e.y, 16, 55, Math.random(), { skin: 'small', color: 'amber' });
          g.fx.ring(e.x, e.y, C.red, 30);
        }
      }
    },
  },
  {
    id: 'sniper',
    name: { ru: 'Снайпер', en: 'Sniper' },
    kind: 'cyborg', value: 2,
    drops: ['wSniperPlumb', 'iSniperRange', 'iSniperTripod', 'iSniperSpotter'],
    hp: 20, speed: 40, r: 6, xp: 5, coins: 1.2, minFloor: 3, weight: 5, cost: 3,
    frames: () => sniperArt(),
    update(e, g, dt) {
      const st = e.mem.st ?? 'move';
      if (st === 'move') {
        keepRange(e, g, dt, 150, 230);
        if (every(e, g, 'aim', 3, dt) && lineOfSight(g.room, e.x, e.y, g.player.x, g.player.y)) {
          e.mem.st = 'aim';
          e.mem.tt = 1.1;
        }
      } else {
        e.mem.tt -= dt;
        // прицел следит за игроком, но фиксируется за 0.3 с до выстрела
        if (e.mem.tt > 0.3) e.mem.laser = aim(g, e.x, e.y, 0);
        if (e.mem.tt <= 0) {
          shoot(g, e.x, e.y, e.mem.laser, 400, { skin: 'rice', color: 'bone' });
          if (g.hard) {
            shoot(g, e.x, e.y, e.mem.laser + 0.12, 360, { skin: 'rice', color: 'bone' });
            shoot(g, e.x, e.y, e.mem.laser - 0.12, 360, { skin: 'rice', color: 'bone' });
          }
          e.mem.st = 'move';
          e.mem.laser = undefined;
        }
      }
    },
  },
  {
    id: 'flamer',
    name: { ru: 'Кочегар', en: 'Stoker' },
    kind: 'cyborg', value: 3,
    drops: ['iStokerSprayer', 'iStokerSoles', 'iStokerTank', 'iStokerPoker', 'iStokerFurnace'],
    hp: 40, speed: 46, r: 7, xp: 5, coins: 1.3, minFloor: 4, weight: 5, cost: 3,
    frames: () => flamerArt(),
    update(e, g, dt) {
      const d = distToPlayer(e, g);
      if (d > 75) chase(e, g, dt);
      e.mem.cycle = (e.mem.cycle ?? 0) + dt;
      if (d < 120 && e.mem.cycle % 3 < 1.4 && every(e, g, 'fire', 0.05, dt)) {
        shoot(g, e.x, e.y, aim(g, e.x, e.y, 0.35), 120 + Math.random() * 40, {
          skin: 'small', color: Math.random() < 0.5 ? 'amber' : 'red', life: 0.75,
        });
      }
    },
  },
  {
    id: 'psycho',
    name: { ru: 'Сорванный', en: 'Unleashed' },
    kind: 'cyborg', value: 4,
    drops: ['iSnapLoop', 'iSnapRam', 'iSnapSocket', 'iSnapDebt', 'iSnapLeash', 'wSnapChain'],
    hp: 85, speed: 55, r: 8, xp: 10, coins: 2.5, minFloor: 6, weight: 4, cost: 6, heavy: true,
    frames: () => psychoArt(),
    update(e, g, dt) {
      e.mem.cycle = (e.mem.cycle ?? 0) + dt;
      const c = e.mem.cycle % 5;
      if (c < 1.4) {
        chase(e, g, dt, 150);
      } else if (c < 3.4) {
        e.mem.a = (e.mem.a ?? 0) + dt * 3.2;
        if (every(e, g, 'fire', 0.09, dt)) {
          shoot(g, e.x, e.y, e.mem.a, 95, { skin: 'orb' });
          shoot(g, e.x, e.y, -e.mem.a, 95, { skin: 'orb', color: 'amber' });
        }
      } else if (c < 3.5 && every(e, g, 'burst', 5, dt, 0)) {
        ring(g, e.x, e.y, 20, 110, 0, { skin: 'rice' });
      }
    },
  },
  {
    id: 'mechanoid',
    name: { ru: 'Механоид', en: 'Mechanoid' },
    kind: 'robot', value: 4,
    drops: ['pMechFork', 'pMechColumn', 'pMechBearing', 'pMechAps', 'pMechBarrage', 'pMechAmmo'],
    hp: 95, speed: 24, r: 10, xp: 10, coins: 2.5, minFloor: 6, weight: 4, cost: 6, heavy: true,
    frames: () => mechanoidArt(),
    update(e, g, dt) {
      keepRange(e, g, dt, 70, 150);
      if (inRange(e, g) && every(e, g, 'missile', 3.2, dt)) {
        for (const s of [-1, 1]) {
          shoot(g, e.x + s * 8, e.y, angleToPlayer(e, g) + s * 1.2, 70, { skin: 'big', color: 'amber', homing: 1.4, life: 4.5 });
        }
      }
      if (inRange(e, g) && every(e, g, 'fire', 1.6, dt)) stream(g, e.x, e.y, aim(g, e.x, e.y), 4, 90, 20, { skin: 'rice' });
    },
  },
  {
    id: 'swarm',
    name: { ru: 'Рой-бот', en: 'Swarm Bot' },
    kind: 'robot', value: 1,
    drops: ['pSwarmFlock', 'pSwarmPocket', 'pSwarmInterceptors'],
    hp: 4, speed: 92, r: 4, flying: true, xp: 1, coins: 0.2, minFloor: 5, weight: 5, cost: 2, group: [4, 6],
    frames: () => swarmArt(),
    update(e, g, dt) {
      e.mem.ph = (e.mem.ph ?? Math.random() * TAU) + dt * 5;
      const a = angleToPlayer(e, g) + Math.sin(e.mem.ph) * 0.9;
      const s = e.def.speed * e.speedMult * dt;
      move(e, g, Math.cos(a) * s, Math.sin(a) * s);
    },
    onDeath(e, g) {
      ring(g, e.x, e.y, 3, 60, Math.random(), { skin: 'small' });
    },
  },
  {
    id: 'repair',
    name: { ru: 'Ремонтный дрон', en: 'Repair Drone' },
    kind: 'robot', value: 2,
    drops: ['pRepairPatch', 'pRepairDaisy', 'pRepairTether', 'pRepairSalvage'],
    hp: 14, speed: 45, r: 6, flying: true, xp: 4, coins: 1, minFloor: 5, weight: 4, cost: 3, contact: false,
    frames: () => repairArt(),
    update(e, g, dt) {
      // лечит раненого союзника, а в одиночку стреляет цветком
      let target = null as null | (typeof g.enemies)[number];
      for (const o of g.enemies) {
        if (o !== e && !o.dead && o.def.id !== 'repair' && o.hp < o.maxHp && (!target || o.hp / o.maxHp < target.hp / target.maxHp)) target = o;
      }
      e.mem.healTarget = target;
      if (target) {
        const d = Math.hypot(target.x - e.x, target.y - e.y);
        if (d > 50) {
          const a = Math.atan2(target.y - e.y, target.x - e.x);
          move(e, g, Math.cos(a) * e.def.speed * dt, Math.sin(a) * e.def.speed * dt);
        } else {
          target.hp = Math.min(target.maxHp, target.hp + 5 * dt);
        }
      } else {
        keepRange(e, g, dt, 80, 140);
      }
      e.mem.a = (e.mem.a ?? 0) + dt;
      if (inRange(e, g) && every(e, g, 'fire', target ? 3.2 : 1.8, dt)) flower(g, e.x, e.y, 5, 2, 70, e.mem.a, { skin: 'small', color: 'amber' });
    },
  },
];

export const ENEMY_BY_ID = new Map(ENEMIES.map((e) => [e.id, e]));
