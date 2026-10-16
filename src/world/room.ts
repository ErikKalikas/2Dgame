import { CELL_H, CELL_W, TILE } from '../config';
import { RNG } from '../core/rng';
import type { Dir, RoomInfo } from './floorgen';
import { T, walkable } from './tiles';

export interface DoorPlace {
  dir: Dir;
  /** Левый/верхний тайл двери (дверь шириной 2 тайла) */
  tx: number;
  ty: number;
  to: number;
  locked: boolean;
  /** Клетка плана этажа, в стене которой дверь */
  cx: number;
  cy: number;
}

/**
 * Карта тайлов конкретной комнаты. Строится один раз при первом входе и хранится,
 * поэтому разрушенные ящики и подобранные предметы сохраняются при возвращении.
 */
export class RoomMap {
  readonly tw: number;
  readonly th: number;
  readonly pxW: number;
  readonly pxH: number;
  readonly tiles: Uint8Array;
  readonly decor: Uint8Array;
  readonly crateHp = new Map<number, number>();
  doors: DoorPlace[] = [];
  /** Изменился ли вид тайлов (нужно перерисовать кэш) */
  dirty = true;

  constructor(readonly info: RoomInfo) {
    this.tw = info.w * CELL_W;
    this.th = info.h * CELL_H;
    this.pxW = this.tw * TILE;
    this.pxH = this.th * TILE;
    this.tiles = new Uint8Array(this.tw * this.th);
    this.decor = new Uint8Array(this.tw * this.th);
  }

  inside(tx: number, ty: number) {
    return tx >= 0 && ty >= 0 && tx < this.tw && ty < this.th;
  }

  get(tx: number, ty: number): number {
    if (!this.inside(tx, ty)) return T.Wall;
    return this.tiles[ty * this.tw + tx];
  }

  set(tx: number, ty: number, t: number) {
    if (this.inside(tx, ty)) this.tiles[ty * this.tw + tx] = t;
  }

  /** Тайл по пиксельным координатам */
  at(px: number, py: number): number {
    return this.get(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** Точка внутри комнаты перед дверью (куда ставится игрок при входе) */
  doorEntry(d: DoorPlace): { x: number; y: number } {
    const inset = 2.2 * TILE;
    switch (d.dir) {
      case 'n': return { x: (d.tx + 1) * TILE, y: inset };
      case 's': return { x: (d.tx + 1) * TILE, y: this.pxH - inset };
      case 'w': return { x: inset, y: (d.ty + 1) * TILE };
      case 'e': return { x: this.pxW - inset, y: (d.ty + 1) * TILE };
    }
  }

  /** Случайная свободная точка пола (в пикселях) не ближе minDist к (ax, ay) */
  randomFloorPoint(rng: RNG, ax: number, ay: number, minDist: number, flying = false): { x: number; y: number } {
    for (let i = 0; i < 300; i++) {
      const tx = rng.int(2, this.tw - 3);
      const ty = rng.int(2, this.th - 3);
      const t = this.get(tx, ty);
      if (!(walkable(t) || (flying && t === T.Pit))) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if ((x - ax) ** 2 + (y - ay) ** 2 < minDist * minDist) continue;
      return { x, y };
    }
    return { x: this.pxW / 2, y: this.pxH / 2 };
  }

  centerPoint() {
    return { x: this.pxW / 2, y: this.pxH / 2 };
  }
}

// ---------------------------------------------------------------------------
// Генерация содержимого комнаты

type Put = (lx: number, ly: number, t: number) => void;
type Pattern = (put: Put, rng: RNG) => void;

// Узоры рисуются в одной четверти клетки и зеркалятся на остальные три — так комнаты выглядят "спроектированными".
// Координаты четверти: lx 2..14, ly 2..8
const PATTERNS: Record<string, Pattern> = {
  empty: () => {},
  pillars: (put, rng) => {
    const x = rng.int(4, 7), y = rng.int(3, 5);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) put(x + i, y + j, T.Block);
    if (rng.chance(0.5)) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) put(x + 5 + i, y + j, T.Block);
  },
  crates: (put, rng) => {
    const n = rng.int(3, 7);
    const cx = rng.int(4, 11), cy = rng.int(3, 7);
    for (let i = 0; i < n; i++) put(cx + rng.int(-2, 2), cy + rng.int(-1, 1), T.Crate);
  },
  pitCenter: (put, rng) => {
    const x0 = rng.int(8, 10), y0 = rng.int(5, 6);
    for (let x = x0; x <= 14; x++) for (let y = y0; y <= 8; y++) put(x, y, T.Pit);
    // мостики крест-накрест через центр
    for (let y = y0; y <= 8; y++) put(14, y, T.Bridge);
    for (let x = x0; x <= 14; x++) put(x, 8, T.Bridge);
  },
  pitCorners: (put, rng) => {
    const w = rng.int(3, 5), h = rng.int(2, 3);
    for (let x = 2; x < 2 + w; x++) for (let y = 2; y < 2 + h; y++) put(x, y, T.Pit);
  },
  electro: (put, rng) => {
    const x0 = rng.int(5, 9);
    for (let x = x0; x < x0 + 3; x++) for (let y = 3; y <= 6; y++) put(x, y, T.Electro);
  },
  cover: (put, rng) => {
    const x = rng.int(6, 11);
    for (let y = 3; y <= rng.int(5, 6); y++) put(x, y, T.Block);
    put(x - 1, 3, T.Block);
  },
  serverRows: (put, rng) => {
    const y = rng.int(3, 6);
    for (let x = rng.int(4, 6); x <= rng.int(9, 12); x++) put(x, y, T.Crate);
  },
  pitStrip: (put, rng) => {
    const y = rng.int(4, 7);
    for (let x = 3; x <= 12; x++) put(x, y, T.Pit);
    put(rng.int(5, 10), y, T.Bridge);
  },
};

const NORMAL_SETS: string[][] = [
  ['pillars'], ['crates'], ['pitCenter'], ['pitCorners', 'crates'], ['electro', 'pillars'],
  ['cover'], ['serverRows'], ['pitStrip'], ['pillars', 'crates'], ['cover', 'electro'],
  ['empty'], ['pitCorners', 'cover'], ['serverRows', 'pitCorners'],
];

export function buildRoom(info: RoomInfo, rng: RNG): RoomMap {
  for (let attempt = 0; attempt < 12; attempt++) {
    const room = new RoomMap(info);
    fillRoom(room, rng, attempt >= 8);
    if (fixConnectivity(room)) return room;
  }
  const room = new RoomMap(info);
  fillRoom(room, rng, true);
  fixConnectivity(room);
  return room;
}

function fillRoom(room: RoomMap, rng: RNG, plain: boolean) {
  const { tw, th, info } = room;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const border = x === 0 || y === 0 || x === tw - 1 || y === th - 1;
      room.set(x, y, border ? T.Wall : T.Floor);
      room.decor[y * tw + x] = rng.chance(0.12) ? rng.int(1, 7) : 0;
    }
  }

  // узоры препятствий по клеткам
  if (!plain) {
    for (let cy = 0; cy < info.h; cy++) {
      for (let cx = 0; cx < info.w; cx++) {
        const x0 = cx * CELL_W, y0 = cy * CELL_H;
        let set: string[];
        if (info.type === 'normal') set = rng.pick(NORMAL_SETS);
        else if (info.type === 'boss') set = rng.chance(0.5) ? ['empty'] : ['pillars'];
        else set = ['empty'];
        const put: Put = (lx, ly, t) => {
          const xs = [x0 + lx, x0 + CELL_W - 1 - lx];
          const ys = [y0 + ly, y0 + CELL_H - 1 - ly];
          for (const xx of xs) for (const yy of ys) room.set(xx, yy, t);
        };
        for (const p of set) PATTERNS[p](put, rng);
      }
    }
  }

  // двери
  room.doors = info.doors.map((d) => {
    const rx = d.cx - info.x, ry = d.cy - info.y;
    let tx = 0, ty = 0;
    if (d.dir === 'n' || d.dir === 's') {
      tx = rx * CELL_W + CELL_W / 2 - 1;
      ty = d.dir === 'n' ? 0 : th - 1;
    } else {
      ty = ry * CELL_H + CELL_H / 2 - 1;
      tx = d.dir === 'w' ? 0 : tw - 1;
    }
    return { dir: d.dir, tx, ty, to: d.to, locked: d.locked, cx: d.cx, cy: d.cy };
  });

  // зона у дверей всегда свободна
  for (const d of room.doors) {
    const horiz = d.dir === 'n' || d.dir === 's';
    for (let a = -2; a <= 3; a++) {
      for (let b = 1; b <= 3; b++) {
        let x: number, y: number;
        if (horiz) {
          x = d.tx + a;
          y = d.dir === 'n' ? b : th - 1 - b;
        } else {
          y = d.ty + a;
          x = d.dir === 'w' ? b : tw - 1 - b;
        }
        if (x > 0 && y > 0 && x < tw - 1 && y < th - 1) room.set(x, y, T.Floor);
      }
    }
    room.set(d.tx, d.ty, T.Door);
    if (horiz) room.set(d.tx + 1, d.ty, T.Door);
    else room.set(d.tx, d.ty + 1, T.Door);
  }

  // ящикам — запас прочности
  room.crateHp.clear();
  for (let i = 0; i < room.tiles.length; i++) if (room.tiles[i] === T.Crate) room.crateHp.set(i, 12);
}

/**
 * Проверяем, что все двери достижимы друг из друга (ящики считаются проходимыми — их можно сломать).
 * Недостижимые карманы пола заливаются колоннами.
 */
function fixConnectivity(room: RoomMap): boolean {
  const { tw, th } = room;
  const seen = new Uint8Array(tw * th);
  const passable = (t: number) => walkable(t) || t === T.Crate;
  const start = room.doors.length ? room.doorEntry(room.doors[0]) : room.centerPoint();
  const sx = Math.floor(start.x / TILE), sy = Math.floor(start.y / TILE);
  if (!passable(room.get(sx, sy))) return false;
  const stack = [sy * tw + sx];
  seen[sy * tw + sx] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % tw, y = (i / tw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!room.inside(nx, ny)) continue;
      const ni = ny * tw + nx;
      if (seen[ni] || !passable(room.tiles[ni])) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  for (const d of room.doors) {
    const p = room.doorEntry(d);
    if (!seen[Math.floor(p.y / TILE) * tw + Math.floor(p.x / TILE)]) return false;
  }
  for (let i = 0; i < room.tiles.length; i++) {
    if (!seen[i] && passable(room.tiles[i])) room.tiles[i] = T.Block;
  }
  return true;
}

/** Ближайшая к точке проходимая клетка (для размещения предметов/телепорта) */
export function nearestWalkable(room: RoomMap, px: number, py: number): { x: number; y: number } {
  const tx0 = Math.floor(px / TILE), ty0 = Math.floor(py / TILE);
  for (let r = 0; r < 20; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = room.get(tx0 + dx, ty0 + dy);
        if (t === T.Floor || t === T.Bridge) return { x: (tx0 + dx + 0.5) * TILE, y: (ty0 + dy + 0.5) * TILE };
      }
    }
  }
  return { x: px, y: py };
}
