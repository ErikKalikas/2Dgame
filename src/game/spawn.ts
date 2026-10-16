import { FLOORS, TILE } from '../config';
import { ENEMIES } from '../content/enemies';
import { BOSSES } from '../content/bosses';
import { nearestWalkable } from '../world/room';
import { Enemy, type EnemyDef } from './enemy';
import type { Game } from './game';
import { itemPrice, rollItem, type ItemKind } from './items';

export type PickupKind = 'coin' | 'medkit' | 'key' | 'bomb' | 'item' | 'teleporter';

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
export function populateRoom(g: Game) {
  const info = g.room.info;
  if (info.cleared) return;
  if (info.type === 'boss') {
    const def = BOSSES.find((b) => b.id === g.theme.boss) ?? BOSSES[0];
    const c = g.room.centerPoint();
    const p = nearestWalkable(g.room, c.x, c.y - (def.id === 'dispatcher' ? 8 : 30));
    const hpMult = g.hpMult * (g.hard ? 1.15 : 1);
    if (def.id === 'twins') {
      // близнецы — два босса
      for (const s of [-1, 1]) {
        const e = new Enemy(def, p.x + s * 60, p.y, hpMult * 0.55);
        e.mem.twin = s;
        e.spawn = 1.2;
        g.enemies.push(e);
      }
    } else {
      const e = new Enemy(def, p.x, p.y, hpMult);
      e.spawn = 1.2;
      g.enemies.push(e);
    }
    g.bossIntro = 1.5;
    return;
  }
  if (info.type !== 'normal') return;

  const rng = g.rng;
  const cells = info.w * info.h;
  let budget = (3.5 + g.floorNum * 1.4) * Math.pow(cells, 0.75) * (g.hard ? 1.2 : 1);
  const pool = enemyPool(g.floorNum);
  const spawned: Enemy[] = [];
  let guard = 0;
  while (budget > 0 && guard++ < 60) {
    const def = rng.weighted(pool, (e) => e.weight * (e.minFloor >= g.floorNum - 1 ? 1.6 : 1));
    if (def.cost > budget + 1) continue;
    const [gmin, gmax] = def.group ?? [1, 1];
    const count = rng.int(gmin, gmax);
    const at = g.room.randomFloorPoint(rng, g.player.x, g.player.y, 110, def.flying);
    for (let i = 0; i < count; i++) {
      const pos = i === 0 ? at : { x: at.x + rng.float(-14, 14), y: at.y + rng.float(-14, 14) };
      const e = new Enemy(def, pos.x, pos.y, g.hpMult);
      e.spawn = 0.6 + i * 0.08 + spawned.length * 0.05;
      spawned.push(e);
    }
    budget -= def.cost * (count > 1 ? 0.6 * count : 1);
  }
  g.enemies.push(...spawned);
}

/** Награда за зачистку обычной комнаты (как в Isaac — случайная, иногда ничего) */
export function roomClearReward(g: Game) {
  const info = g.room.info;
  const p = g.player;
  const c = nearestWalkable(g.room, p.x + 20, p.y);
  if (g.keyRoom === info.id) {
    g.pickups.push(makePickup('key', c.x, c.y));
    g.keyRoom = -1;
    return;
  }
  const r = g.rng.next() - p.stats.luck * 0.05;
  if (r < 0.3) dropLoot(g, 'coin', c.x, c.y, g.rng.int(1, 3));
  else if (r < 0.42) g.pickups.push(makePickup('medkit', c.x, c.y));
  else if (r < 0.52) g.pickups.push(makePickup('bomb', c.x, c.y));
  else if (r < 0.6) g.pickups.push(makePickup('key', c.x, c.y));
}

/** Выложить предметы на пьедесталы */
export function placeItems(g: Game, kinds: ItemKind[], cx: number, cy: number, opts: { price?: boolean; choice?: boolean } = {}) {
  const group = opts.choice ? GROUP++ : undefined;
  const gap = 40;
  kinds.forEach((kind, i) => {
    const it = rollItem(g.rng, kind, g.seenItems, g.player.stats.luck);
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

/** Содержимое особых комнат при первом посещении */
export function furnishRoom(g: Game) {
  const info = g.room.info;
  const c = g.room.centerPoint();
  if (info.type === 'treasure') {
    const second: ItemKind = g.rng.chance(0.5) ? 'weapon' : 'implant';
    placeItems(g, ['implant', second], c.x, c.y, { choice: true });
  } else if (info.type === 'shop') {
    placeItems(g, ['implant', 'weapon', 'implant'], c.x, c.y - 24, { price: true });
    const row = c.y + 28;
    const goods: [ 'medkit' | 'key' | 'bomb', number][] = [['medkit', 12], ['key', 8], ['bomb', 8]];
    goods.forEach(([kind, price], i) => {
      const pos = nearestWalkable(g.room, c.x + (i - 1) * 40, row);
      g.pickups.push(makePickup(kind, pos.x, pos.y, { price: Math.round(price * g.priceMult) }));
    });
  }
}

/** После победы над боссом: выбор из двух предметов, аптечка и телепорт */
export function bossReward(g: Game) {
  const c = g.room.centerPoint();
  if (g.floorNum >= FLOORS) return;
  placeItems(g, ['implant', g.rng.chance(0.5) ? 'weapon' : 'implant'], c.x, c.y - 30, { choice: true });
  const m = nearestWalkable(g.room, c.x, c.y + 40);
  g.pickups.push(makePickup('medkit', m.x, m.y));
  const t = nearestWalkable(g.room, c.x, c.y + 4);
  g.pickups.push(makePickup('teleporter', t.x, t.y));
}

export const PICKUP_R = TILE * 0.6;
