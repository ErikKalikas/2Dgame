import { FLOORS, TILE } from '../config';
import { ENEMIES } from '../content/enemies';
import { MINIBOSS_BY_FLOOR, bossDef, isTwins } from '../content/minibosses';
import { LOG } from './log';
import { nearestWalkable } from '../world/level';
import type { LevelRoom } from '../world/levelgen';
import { BATTLE } from '../world/roles';
import { Enemy, type EnemyDef } from './enemy';
import type { Game } from './game';
import { SYSTEM_SLOTS, item, itemPrice, rollItem, type ItemDef, type ItemKind } from './items';
import { WANTED_SQUAD, wantedLevel } from './wanted';

export type PickupKind = 'coin' | 'medkit' | 'glitch' | 'item' | 'teleporter' | 'surgery' | 'terminal';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  itemId?: string;
  price?: number;
  /** Группа "выбери один": взяв предмет, остальные из группы исчезают */
  group?: number;
  value?: number;
  dead?: boolean;
  /** Терминал: номер петли, гермодверь которой он открывает */
  loop?: number;
  /** Терминал уже взломан */
  done?: boolean;
}

let GROUP = 1;

export function makePickup(kind: PickupKind, x: number, y: number, extra: Partial<Pickup> = {}): Pickup {
  return { kind, x, y, vx: 0, vy: 0, t: Math.random() * 10, ...extra };
}

/** Монеты/расходники разлетаются из точки */
export function dropLoot(g: Game, kind: PickupKind, x: number, y: number, n = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 60;
    g.pickups.push(makePickup(kind, x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, value: 1 }));
  }
}

/** Пул врагов этажа: появляются только "дошедшие" до этого этажа, новые — чаще */
function enemyPool(floor: number): EnemyDef[] {
  return ENEMIES.filter((e) => e.minFloor <= floor);
}

/** Заполнить комнату врагами при первом входе */
export function populateRoom(g: Game, r: LevelRoom) {
  if (r.cleared) return;
  if (r.role === 'exit') {
    // в конце нечётных уровней — мини-босс, чётных — босс яруса (FloorTheme.boss, этап 14а)
    const def = bossDef(g.theme.boss);
    const c = g.room.roomCenter(r);
    spawnBoss(g, def, r, c.x, c.y - (def.id === 'dispatcher' ? 8 : 30));
    return;
  }
  if (r.role === 'miniboss') {
    // мини-босс на локации (14а): кто — по уровню (Боссы#Кто где)
    const list = MINIBOSS_BY_FLOOR[g.floorNum];
    if (list) {
      const c = g.room.roomCenter(r);
      spawnBoss(g, bossDef(g.rng.pick(list)), r, c.x, c.y - 30);
      return;
    }
  }
  if (!BATTLE.has(r.role)) return;

  // засада, элита и мини-босс на локации пока — обычный отряд (элита и мини-босс — побольше);
  // свои правила у них появятся в 13.4 и 14а
  const rng = g.rng;
  const cells = (r.w * r.h) / (30 * 18);
  const strong = r.role === 'elite' || r.role === 'miniboss' ? 1.5 : 1;
  // розыск (14а): чем выше ступень, тем больше отряд (+10% за ступень)
  let budget = (3.5 + g.floorNum * 1.4) * Math.pow(cells, 0.75) * (g.hard ? 1.2 : 1) * strong * (1 + WANTED_SQUAD * wantedLevel(g));
  const pool = enemyPool(g.floorNum);
  const spawned: Enemy[] = [];
  let guard = 0;
  while (budget > 0 && guard++ < 60) {
    const def = rng.weighted(pool, (e) => e.weight * (e.minFloor >= g.floorNum - 1 ? 1.6 : 1));
    if (def.cost > budget + 1) continue;
    const [gmin, gmax] = def.group ?? [1, 1];
    const count = rng.int(gmin, gmax);
    const at = g.room.randomFloorPoint(rng, g.player.x, g.player.y, 110, def.flying, r);
    for (let i = 0; i < count; i++) {
      const pos = i === 0 ? at : { x: at.x + rng.float(-14, 14), y: at.y + rng.float(-14, 14) };
      const e = new Enemy(def, pos.x, pos.y, g.hpMult);
      e.home = r.id;
      e.spawn = 0.6 + i * 0.08 + spawned.length * 0.05;
      spawned.push(e);
    }
    budget -= def.cost * (count > 1 ? 0.6 * count : 1);
  }
  // элита: самый ценный враг отряда гарантированно роняет предмет своего набора (этап 12); свой отряд — 13.4
  if (r.role === 'elite' && spawned.length) {
    const best = spawned.reduce((a, b) => ((b.def.value ?? 1) * b.def.cost > (a.def.value ?? 1) * a.def.cost ? b : a));
    best.elite = true;
  }
  g.enemies.push(...spawned);
}

/**
 * Босс или мини-босс в комнате r (его арена): близнецы — вдвоём. Возвращает появившихся;
 * пока они появляются, имя показывается крупно (bossIntro)
 */
export function spawnBoss(g: Game, def: EnemyDef, r: LevelRoom, x: number, y: number): Enemy[] {
  const p = nearestWalkable(g.room, x, y);
  const hpMult = g.hpMult * (g.hard ? 1.15 : 1);
  const out: Enemy[] = [];
  if (isTwins(def)) {
    // близнецы — двое
    for (const s of [-1, 1]) {
      const e = new Enemy(def, p.x + s * 60, p.y, hpMult * 0.55);
      e.mem.twin = s;
      // второй близнец (Поллукс) — в своей раскраске
      if (s > 0 && def.framesAlt) e.frames = def.framesAlt();
      out.push(e);
    }
  } else out.push(new Enemy(def, p.x, p.y, hpMult));
  for (const e of out) {
    e.home = r.id;
    e.spawn = 1.2;
  }
  g.enemies.push(...out);
  g.bossIntro = 1.5;
  return out;
}

/**
 * Мини-босс убит (не в конце уровня — там своя награда): когда пара близнецов повержена целиком —
 * строка лога и выбор 1 из 2 предметов на месте боя
 */
export function minibossKilled(g: Game, e: Enemy) {
  if (e.home === g.plan.exitId) return;
  if (g.enemies.some((o) => o !== e && !o.dead && o.def === e.def && o.home === e.home)) return;
  g.log(LOG.bossDown(e.def.name));
  const c = e.home >= 0 ? g.room.roomCenter(g.plan.rooms[e.home]) : { x: e.x, y: e.y };
  placeItems(g, ['implant', g.rng.chance(0.5) ? 'weapon' : 'implant'], c.x, c.y, { choice: true });
}

/** Награда за зачистку обычной комнаты (как в Isaac — случайная, иногда ничего) */
export function roomClearReward(g: Game) {
  const p = g.player;
  const c = nearestWalkable(g.room, p.x + 20, p.y);
  const r = g.rng.next() - p.stats.luck * 0.05;
  if (r < 0.3) dropLoot(g, 'coin', c.x, c.y, g.rng.int(1, 3));
  else if (r < 0.42) g.pickups.push(makePickup('medkit', c.x, c.y));
  else if (r < 0.52) g.pickups.push(makePickup('glitch', c.x, c.y));
}

/** Что выложить: вид предмета (случайный из пула) или конкретный id */
type Slotted = ItemKind | { id: string };

/** Можно ли предмету выпасть: модули систем тела — только после открытия системы */
function allowFor(g: Game) {
  return (it: ItemDef) => !(it.slot && SYSTEM_SLOTS.includes(it.slot) && !g.player.systems.has(it.slot));
}

/** Выложить предметы на пьедесталы */
export function placeItems(g: Game, kinds: Slotted[], cx: number, cy: number, opts: { price?: boolean; choice?: boolean } = {}) {
  const group = opts.choice ? GROUP++ : undefined;
  const gap = 40;
  kinds.forEach((kind, i) => {
    const it = typeof kind === 'string'
      ? rollItem(g.rng, kind, g.seenItems, g.player.stats.luck, g.floorNum, allowFor(g))
      : item(kind.id);
    if (!it) return;
    g.seenItems.add(it.id);
    const x = cx + (i - (kinds.length - 1) / 2) * gap;
    const pos = nearestWalkable(g.room, x, cy);
    g.pickups.push(makePickup('item', pos.x, pos.y, {
      itemId: it.id,
      price: opts.price ? Math.round(itemPrice(it) * g.priceMult) : undefined,
      group,
    }));
  });
}

/** Скелет класса 2 — один из двух, ещё не виденный */
function class2(g: Game): Slotted {
  const free = ['skWorkerPlus', 'skGuard'].filter((id) => !g.seenItems.has(id));
  return free.length ? { id: g.rng.pick(free) } : 'implant';
}

/**
 * Содержимое особых комнат при первом посещении. Скелеты: класс 2 — в первом схроне 1-го уровня
 * и на барахолке 2-го, класс 3 — на барахолке 4-го, класс 4 — редкий выбор в схроне с 5-го.
 * Рюкзаки продаются на барахолке 3-го и 6-го уровней.
 * Пока (13.1б) схрон работает как бывшая сокровищница, барахолка — как бывший магазин;
 * взлом схрона, бартер и перегрузка — этап 13.5, сервисная шахта — тоже 13.5.
 */
export function furnishRoom(g: Game, r: LevelRoom) {
  const c = g.room.roomCenter(r);
  const n = g.floorNum;
  if (r.role === 'cache') {
    let second: Slotted = g.rng.chance(0.5) ? 'weapon' : 'implant';
    if (n === 1 && g.cachesOpened === 0) second = class2(g);
    else if (n >= 5 && g.rng.chance(0.2)) {
      const sk = rollItem(g.rng, 'skeleton', g.seenItems, 0, n, (it) => (it.skeletonClass ?? 1) >= 3);
      if (sk) second = { id: sk.id };
    }
    g.cachesOpened++;
    placeItems(g, ['implant', second], c.x, c.y, { choice: true });
  } else if (r.role === 'market') {
    const middle: Slotted = n === 2 ? class2(g) : n === 4 && !g.seenItems.has('skLoader') ? { id: 'skLoader' } : 'weapon';
    placeItems(g, ['implant', middle, 'implant'], c.x, c.y - 24, { price: true });
    const row = c.y + 28;
    const goods: ['medkit' | 'glitch', number][] = [['medkit', 12], ['glitch', 8]];
    const pack = n === 3 ? 'bpSatchel' : n === 6 ? 'bpDuffel' : null;
    const cols = goods.length + (pack ? 1 : 0);
    goods.forEach(([kind, price], i) => {
      const pos = nearestWalkable(g.room, c.x + (i - (cols - 1) / 2) * 40, row);
      g.pickups.push(makePickup(kind, pos.x, pos.y, { price: Math.round(price * g.priceMult) }));
    });
    if (pack) placeItems(g, [{ id: pack }], c.x + ((cols - 1) / 2) * 40, row, { price: true });
  } else if (r.role === 'surgery') {
    // кресло с роботом-хирургом в центре
    const pos = nearestWalkable(g.room, c.x, c.y - 8);
    g.pickups.push(makePickup('surgery', pos.x, pos.y));
  }
}

/** После победы над боссом: выбор из двух предметов, аптечка и телепорт */
export function bossReward(g: Game) {
  const c = g.room.roomCenter(g.plan.rooms[g.plan.exitId]);
  if (g.floorNum >= FLOORS) return;
  placeItems(g, ['implant', g.rng.chance(0.5) ? 'weapon' : 'implant'], c.x, c.y - 30, { choice: true });
  const m = nearestWalkable(g.room, c.x, c.y + 40);
  g.pickups.push(makePickup('medkit', m.x, m.y));
  const t = nearestWalkable(g.room, c.x, c.y + 4);
  g.pickups.push(makePickup('teleporter', t.x, t.y));
}

export const PICKUP_R = TILE * 0.6;
