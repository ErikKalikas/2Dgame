import { RNG } from '../core/rng';

export type RoomType = 'start' | 'normal' | 'treasure' | 'shop' | 'boss';
export type Dir = 'n' | 's' | 'w' | 'e';

export const DIRS: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { n: 's', s: 'n', w: 'e', e: 'w' };

export interface DoorInfo {
  dir: Dir;
  /** Клетка этой комнаты, в стене которой находится дверь (координаты сетки этажа) */
  cx: number;
  cy: number;
  to: number;
  locked: boolean;
}

export interface RoomInfo {
  id: number;
  type: RoomType;
  /** Левый верхний угол и размер в клетках */
  x: number;
  y: number;
  w: number;
  h: number;
  doors: DoorInfo[];
  /** Расстояние (в комнатах) от стартовой */
  depth: number;
  visited: boolean;
  cleared: boolean;
  /** Видна ли на мини-карте (соседи посещённых) */
  seen: boolean;
}

export interface FloorPlan {
  gw: number;
  gh: number;
  grid: Int16Array; // id комнаты или -1
  rooms: RoomInfo[];
  startId: number;
  bossId: number;
}

export const GRID_W = 13;
export const GRID_H = 11;

/** Количество клеток на этаже — формула как в The Binding of Isaac */
export function roomTarget(floorNum: number, rng: RNG): number {
  return Math.min(20, rng.int(0, 1) + 5 + Math.floor((floorNum * 10) / 3));
}

/**
 * Генерация плана этажа.
 * 1) "Растим" клетки от центра, не допуская клеток с 2+ соседями (как в Isaac) — получаются ветви и тупики.
 * 2) Тупики отдаются под босса (самый дальний), сокровищницу и магазин.
 * 3) Часть обычных клеток объединяется в большие комнаты 2×1, 1×2, 2×2.
 */
export function generateFloor(floorNum: number, rng: RNG): FloorPlan {
  for (let attempt = 0; attempt < 500; attempt++) {
    const plan = tryGenerate(floorNum, rng);
    if (plan) return plan;
  }
  throw new Error('floor generation failed');
}

function tryGenerate(floorNum: number, rng: RNG): FloorPlan | null {
  const target = roomTarget(floorNum, rng);
  const occ = new Uint8Array(GRID_W * GRID_H);
  const idx = (x: number, y: number) => y * GRID_W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
  const neighbors = (x: number, y: number) => {
    let n = 0;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (inside(nx, ny) && occ[idx(nx, ny)]) n++;
    }
    return n;
  };

  const sx = Math.floor(GRID_W / 2), sy = Math.floor(GRID_H / 2);
  occ[idx(sx, sy)] = 1;
  const cells: [number, number][] = [[sx, sy]];
  const queue: [number, number][] = [[sx, sy]];
  let guard = 0;
  while (queue.length && cells.length < target) {
    if (++guard > 3000) return null;
    const [x, y] = queue.shift()!;
    let grew = false;
    for (const d of rng.shuffle(Object.keys(DIRS) as Dir[])) {
      if (cells.length >= target) break;
      const [dx, dy] = DIRS[d];
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny) || occ[idx(nx, ny)]) continue;
      if (neighbors(nx, ny) > 1) continue;
      if (rng.chance(0.5) && !(x === sx && y === sy)) continue;
      occ[idx(nx, ny)] = 1;
      cells.push([nx, ny]);
      queue.push([nx, ny]);
      grew = true;
    }
    // если очередь опустела раньше времени — продолжаем расти от случайной клетки
    if (!queue.length && cells.length < target && !grew) queue.push(rng.pick(cells));
  }
  if (cells.length < target) return null;

  // расстояния от старта (BFS по клеткам)
  const depth = new Int16Array(GRID_W * GRID_H).fill(-1);
  depth[idx(sx, sy)] = 0;
  const bfs: [number, number][] = [[sx, sy]];
  while (bfs.length) {
    const [x, y] = bfs.shift()!;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (inside(nx, ny) && occ[idx(nx, ny)] && depth[idx(nx, ny)] < 0) {
        depth[idx(nx, ny)] = depth[idx(x, y)] + 1;
        bfs.push([nx, ny]);
      }
    }
  }

  const deadEnds = cells.filter(([x, y]) => !(x === sx && y === sy) && neighbors(x, y) === 1);
  if (deadEnds.length < 3) return null;
  deadEnds.sort((a, b) => depth[idx(b[0], b[1])] - depth[idx(a[0], a[1])]);
  const bossCell = deadEnds[0];
  // босс должен быть не рядом со стартом
  if (depth[idx(bossCell[0], bossCell[1])] < 2) return null;
  const rest = rng.shuffle(deadEnds.slice(1));
  const treasureCell = rest[0];
  const shopCell = rest[1];

  const special = new Map<number, RoomType>();
  special.set(idx(sx, sy), 'start');
  special.set(idx(bossCell[0], bossCell[1]), 'boss');
  special.set(idx(treasureCell[0], treasureCell[1]), 'treasure');
  special.set(idx(shopCell[0], shopCell[1]), 'shop');

  // объединение обычных клеток в большие комнаты
  const grid = new Int16Array(GRID_W * GRID_H).fill(-1);
  const rooms: RoomInfo[] = [];
  const isFreeNormal = (x: number, y: number) =>
    inside(x, y) && occ[idx(x, y)] && grid[idx(x, y)] < 0 && !special.has(idx(x, y));
  const shapes: [number, number][] = [[2, 2], [2, 1], [1, 2]];

  for (const [x, y] of rng.shuffle(cells.slice())) {
    if (grid[idx(x, y)] >= 0) continue;
    const type = special.get(idx(x, y)) ?? 'normal';
    let w = 1, h = 1;
    if (type === 'normal' && rng.chance(0.35)) {
      for (const [sw, sh] of rng.shuffle(shapes.slice())) {
        let ok = true;
        for (let yy = 0; yy < sh && ok; yy++)
          for (let xx = 0; xx < sw && ok; xx++) if (!isFreeNormal(x + xx, y + yy)) ok = false;
        if (ok) {
          w = sw;
          h = sh;
          break;
        }
      }
    }
    const id = rooms.length;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) grid[idx(x + xx, y + yy)] = id;
    rooms.push({
      id, type, x, y, w, h, doors: [],
      depth: depth[idx(x, y)], visited: false, cleared: type !== 'normal' && type !== 'boss', seen: false,
    });
  }

  // двери между соседними клетками разных комнат
  for (const room of rooms) {
    for (let yy = 0; yy < room.h; yy++) {
      for (let xx = 0; xx < room.w; xx++) {
        const cx = room.x + xx, cy = room.y + yy;
        for (const d of Object.keys(DIRS) as Dir[]) {
          const [dx, dy] = DIRS[d];
          const nx = cx + dx, ny = cy + dy;
          if (!inside(nx, ny)) continue;
          const other = grid[idx(nx, ny)];
          if (other < 0 || other === room.id) continue;
          const otherType = rooms[other].type;
          // сокровищница заперта начиная со 2-го этажа (нужен ключ)
          const locked = floorNum >= 2 && (otherType === 'treasure' || room.type === 'treasure');
          room.doors.push({ dir: d, cx, cy, to: other, locked });
        }
      }
    }
  }

  const startId = grid[idx(sx, sy)];
  const bossId = grid[idx(bossCell[0], bossCell[1])];
  return { gw: GRID_W, gh: GRID_H, grid, rooms, startId, bossId };
}
