import { TILE } from '../config';
import { RNG } from '../core/rng';
import { DIRS, doorTiles, type LevelDoor, type LevelPlan, type LevelRoom, type Rect } from './levelgen';
import { BATTLE } from './roles';
import { T, walkable } from './tiles';

/**
 * Карта тайлов всего уровня (этап 13). Строится один раз при старте уровня: ящики и подобранное
 * сохраняются, пока игрок на уровне. Комнаты и коридоры — на одной сетке, без переходов.
 */
export class LevelMap {
  readonly tw: number;
  readonly th: number;
  readonly pxW: number;
  readonly pxH: number;
  readonly tiles: Uint8Array;
  readonly decor: Uint8Array;
  readonly crateHp = new Map<number, number>();
  /** Комната, в прямоугольник которой (со стенами) попадает тайл, или -1 */
  readonly roomIdx: Int16Array;
  /** Дверь, которой принадлежит тайл проёма, или -1 */
  readonly doorIdx: Int16Array;
  readonly doors: LevelDoor[];
  readonly rooms: LevelRoom[];
  /** Соль уровня для детерминированных узоров отрисовки */
  readonly salt: number;

  constructor(readonly plan: LevelPlan, salt = plan.floor) {
    this.tw = plan.tw;
    this.th = plan.th;
    this.pxW = this.tw * TILE;
    this.pxH = this.th * TILE;
    this.tiles = plan.tiles.slice();
    this.decor = new Uint8Array(this.tw * this.th);
    this.doors = plan.doors;
    this.rooms = plan.rooms;
    this.salt = salt;
    this.roomIdx = new Int16Array(this.tw * this.th).fill(-1);
    for (const r of plan.rooms) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.roomIdx[y * this.tw + x] = r.id;
    }
    this.doorIdx = new Int16Array(this.tw * this.th).fill(-1);
    for (const d of plan.doors) for (const [x, y] of doorTiles(d)) this.doorIdx[y * this.tw + x] = d.id;
  }

  inside(tx: number, ty: number) {
    return tx >= 0 && ty >= 0 && tx < this.tw && ty < this.th;
  }

  get(tx: number, ty: number): number {
    if (!this.inside(tx, ty)) return T.Void;
    return this.tiles[ty * this.tw + tx];
  }

  set(tx: number, ty: number, t: number) {
    if (this.inside(tx, ty)) this.tiles[ty * this.tw + tx] = t;
  }

  /** Тайл по пиксельным координатам */
  at(px: number, py: number): number {
    return this.get(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** Комната, в прямоугольник которой попадает тайл (со стенами) */
  roomAt(tx: number, ty: number): LevelRoom | null {
    if (!this.inside(tx, ty)) return null;
    const i = this.roomIdx[ty * this.tw + tx];
    return i < 0 ? null : this.rooms[i];
  }

  /** Комната, внутри которой точка (px), не ближе m px к стенам; null — коридор */
  roomOfPoint(px: number, py: number, m = 0): LevelRoom | null {
    const r = this.roomAt(Math.floor(px / TILE), Math.floor(py / TILE));
    if (!r) return null;
    const x0 = (r.x + 1) * TILE + m, x1 = (r.x + r.w - 1) * TILE - m;
    const y0 = (r.y + 1) * TILE + m, y1 = (r.y + r.h - 1) * TILE - m;
    return px >= x0 && px < x1 && py >= y0 && py < y1 ? r : null;
  }

  /** Закрыть (тайлы T.Door) или открыть (пол) проём двери. Состояние дверей живёт прямо в тайлах */
  setDoor(d: LevelDoor, closed: boolean) {
    for (const [x, y] of doorTiles(d)) this.set(x, y, closed ? T.Door : T.Floor);
  }

  doorAt(tx: number, ty: number): LevelDoor | null {
    if (!this.inside(tx, ty)) return null;
    const i = this.doorIdx[ty * this.tw + tx];
    return i < 0 ? null : this.doors[i];
  }

  /** Центр комнаты (px) */
  roomCenter(r: LevelRoom): { x: number; y: number } {
    return { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE };
  }

  /** Точка пола внутри комнаты перед дверью (px) */
  doorInside(d: LevelDoor): { x: number; y: number } {
    const [dx, dy] = DIRS[d.dir];
    return { x: (d.tx - dx * 2 + 0.5) * TILE, y: (d.ty - dy * 2 + 0.5) * TILE };
  }

  /**
   * Случайная свободная точка пола (px) не ближе minDist к (ax, ay) — в той же комнате, что и (ax, ay),
   * или, если это коридор, в окне размером с экран вокруг неё. area задаёт область явно (тайлы).
   */
  randomFloorPoint(rng: RNG, ax: number, ay: number, minDist: number, flying = false, area?: Rect): { x: number; y: number } {
    let a = area;
    if (!a) {
      const r = this.roomOfPoint(ax, ay);
      a = r ?? { x: Math.floor(ax / TILE) - 12, y: Math.floor(ay / TILE) - 7, w: 24, h: 14 };
    }
    for (let i = 0; i < 300; i++) {
      const tx = rng.int(a.x + 2, a.x + a.w - 3);
      const ty = rng.int(a.y + 2, a.y + a.h - 3);
      const t = this.get(tx, ty);
      if (!(walkable(t) || (flying && t === T.Pit))) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if ((x - ax) ** 2 + (y - ay) ** 2 < minDist * minDist) continue;
      return { x, y };
    }
    return nearestWalkable(this, (a.x + a.w / 2) * TILE, (a.y + a.h / 2) * TILE);
  }
}

/** Ближайшая к точке проходимая клетка (для размещения предметов, телепорта, врагов) */
export function nearestWalkable(map: LevelMap, px: number, py: number): { x: number; y: number } {
  const tx0 = Math.floor(px / TILE), ty0 = Math.floor(py / TILE);
  for (let r = 0; r < 20; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = map.get(tx0 + dx, ty0 + dy);
        if (t === T.Floor || t === T.Bridge) return { x: (tx0 + dx + 0.5) * TILE, y: (ty0 + dy + 0.5) * TILE };
      }
    }
  }
  return { x: px, y: py };
}

// ---------------------------------------------------------------------------
// Начинка комнат: препятствия по узорам (до заготовок по ярусам — этап 13.2)

type Put = (lx: number, ly: number, t: number) => void;
type Pattern = (put: Put, rng: RNG) => void;

// Узоры рисуются в четверти клетки 30×18 (lx 2..14, ly 2..8) и зеркалятся на остальные три.
// В комнате другого размера узор привязан к центру подклетки, а то, что попадает к стенам, отбрасывается.
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


/** Построить карту уровня: тайлы плана + препятствия в комнатах + декор пола */
export function buildLevel(plan: LevelPlan, seed: string): LevelMap {
  const map = new LevelMap(plan);
  for (const d of plan.doors) map.setDoor(d, d.locked);
  for (const r of plan.rooms) furnishRoom(map, r, new RNG(`${seed}:room:${plan.floor}:${r.id}`));
  const drng = new RNG(`${seed}:decor:${plan.floor}`);
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] === T.Floor && drng.chance(0.12)) map.decor[i] = drng.int(1, 7);
  }
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === T.Crate) map.crateHp.set(i, 12);
  return map;
}

function furnishRoom(map: LevelMap, r: LevelRoom, rng: RNG) {
  let sets: string[][] | null = null;
  if (BATTLE.has(r.role)) sets = NORMAL_SETS;
  else if (r.role === 'exit') sets = [['empty'], ['pillars']];
  if (!sets) return;
  for (let attempt = 0; attempt < 12; attempt++) {
    clearRoom(map, r);
    if (attempt < 8) placePatterns(map, r, sets, rng);
    if (fixConnectivity(map, r)) return;
  }
  clearRoom(map, r);
}

function clearRoom(map: LevelMap, r: LevelRoom) {
  for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) map.set(x, y, T.Floor);
}

function placePatterns(map: LevelMap, r: LevelRoom, sets: string[][], rng: RNG) {
  const nx = Math.max(1, Math.round(r.w / 30)), ny = Math.max(1, Math.round(r.h / 18));
  const cw = Math.floor(r.w / nx), ch = Math.floor(r.h / ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const sx = r.x + i * cw, sy = r.y + j * ch;
      const ox = Math.floor(cw / 2) - 15, oy = Math.floor(ch / 2) - 9;
      const put: Put = (lx, ly, t) => {
        const xs = [sx + ox + lx, sx + cw - 1 - ox - lx];
        const ys = [sy + oy + ly, sy + ch - 1 - oy - ly];
        for (const x of xs) {
          for (const y of ys) {
            // у стен комнаты оставляем проход шириной в тайл
            if (x < r.x + 2 || y < r.y + 2 || x > r.x + r.w - 3 || y > r.y + r.h - 3) continue;
            map.set(x, y, t);
          }
        }
      };
      for (const p of rng.pick(sets)) PATTERNS[p](put, rng);
    }
  }
  // у дверей всегда свободно
  for (const di of r.doors) {
    const d = map.doors[di];
    const [dx, dy] = DIRS[d.dir];
    const horiz = d.dir === 'n' || d.dir === 's';
    for (let a = -3; a <= 3; a++) {
      for (let b = 1; b <= 3; b++) {
        const x = horiz ? d.tx + a : d.tx - dx * b;
        const y = horiz ? d.ty - dy * b : d.ty + a;
        if (x > r.x && y > r.y && x < r.x + r.w - 1 && y < r.y + r.h - 1) map.set(x, y, T.Floor);
      }
    }
  }
}

/**
 * Все двери комнаты достижимы друг из друга (ящики считаются проходимыми — их можно сломать).
 * Недостижимые карманы пола заливаются колоннами.
 */
function fixConnectivity(map: LevelMap, r: LevelRoom): boolean {
  const { tw } = map;
  const passable = (t: number) => walkable(t) || t === T.Crate;
  const inner = (x: number, y: number) => x > r.x && y > r.y && x < r.x + r.w - 1 && y < r.y + r.h - 1;
  const tile = (p: { x: number; y: number }) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
  const [sx, sy] = r.doors.length ? tile(map.doorInside(map.doors[r.doors[0]])) : tile(map.roomCenter(r));
  if (!passable(map.get(sx, sy))) return false;
  const seen = new Set<number>([sy * tw + sx]);
  const stack = [sy * tw + sx];
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % tw, y = (i / tw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, ni = ny * tw + nx;
      if (!inner(nx, ny) || seen.has(ni) || !passable(map.tiles[ni])) continue;
      seen.add(ni);
      stack.push(ni);
    }
  }
  for (const di of r.doors) {
    const [x, y] = tile(map.doorInside(map.doors[di]));
    if (!seen.has(y * tw + x)) return false;
  }
  // центр комнаты должен быть достижим: там ставятся кресло, пьедесталы, телепорт
  const [cx, cy] = tile(map.roomCenter(r));
  if (!seen.has(cy * tw + cx) && passable(map.get(cx, cy))) return false;
  for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      const i = y * tw + x;
      if (!seen.has(i) && passable(map.tiles[i])) map.tiles[i] = T.Block;
    }
  }
  return true;
}
