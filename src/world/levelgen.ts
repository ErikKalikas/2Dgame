import { FLOOR_THEMES, type Tier } from '../content/floors';
import { RNG } from '../core/rng';
import { ROLES, TIER_GEN, specialRoles, type Role } from './roles';
import { T } from './tiles';

/**
 * Генерация уровня (этап 13): граф → роли → размещение → коридоры.
 * Весь уровень — одна сетка тайлов: комнаты-прямоугольники со стенами, между ними коридоры шириной 3.
 * Петли — коридоры с гермодверью; её открывает терминал в другой (более глубокой) комнате петли.
 */

export type Dir = 'n' | 's' | 'w' | 'e';
export const DIRS: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { n: 's', s: 'n', w: 'e', e: 'w' };
const ALL_DIRS: Dir[] = ['n', 's', 'w', 'e'];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Комната уровня. x, y, w, h — в тайлах, вместе со стенами */
export interface LevelRoom extends Rect {
  id: number;
  role: Role;
  /** Расстояние (в комнатах) от старта по дереву, без петель */
  depth: number;
  /** Лежит на главной линии старт → выход */
  main: boolean;
  /** Индексы дверей в LevelPlan.doors */
  doors: number[];
  visited: boolean;
  seen: boolean;
  cleared: boolean;
}

/** Проём в стене комнаты шириной DOOR_W тайлов, (tx, ty) — центральный тайл проёма */
export interface LevelDoor {
  id: number;
  room: number;
  dir: Dir;
  tx: number;
  ty: number;
  corridor: number;
  /** Гермодверь петли: закрыта, пока не открыт терминал */
  gate: boolean;
  locked: boolean;
}

export interface Corridor {
  id: number;
  a: number;
  b: number;
  doorA: number;
  doorB: number;
  loop: boolean;
  /** Осевая линия коридора (индексы тайлов), от двери a к двери b */
  path: number[];
}

export interface Loop {
  corridor: number;
  /** Дверь-гермодверь (у комнаты ближе к старту) */
  gateDoor: number;
  /** Комната с терминалом (дальняя от старта) */
  terminalRoom: number;
}

export interface LevelPlan {
  floor: number;
  tier: Tier;
  tw: number;
  th: number;
  tiles: Uint8Array;
  rooms: LevelRoom[];
  doors: LevelDoor[];
  corridors: Corridor[];
  loops: Loop[];
  startId: number;
  exitId: number;
}

/** Ширина проёма двери и коридора (тайлы) */
export const DOOR_W = 3;
/** Наименьший зазор между стенами соседних комнат (место под коридор) */
const ROOM_GAP = 5;
/** Отступ от края карты */
const PAD = 8;
const MAX_W = 280;
const MAX_H = 240;
/** Петля — короткий путь: осевая линия её коридора не длиннее (тайлы) */
const LOOP_MAX = 40;
/** Двери на одной стене — не ближе (по центрам) */
const DOOR_SPACING = 6;

/** Тайлы проёма двери */
export function doorTiles(d: { dir: Dir; tx: number; ty: number }): [number, number][] {
  const out: [number, number][] = [];
  for (let k = -1; k <= 1; k++) out.push(d.dir === 'n' || d.dir === 's' ? [d.tx + k, d.ty] : [d.tx, d.ty + k]);
  return out;
}

/** Комната, в прямоугольник которой попадает тайл (вместе со стенами), или -1 */
export function roomAt(plan: LevelPlan, tx: number, ty: number): number {
  for (const r of plan.rooms) if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) return r.id;
  return -1;
}

export function generateLevel(floor: number, rng: RNG, tier: Tier = FLOOR_THEMES[floor - 1].tier): LevelPlan {
  for (let attempt = 0; attempt < 80; attempt++) {
    const plan = tryGenerate(floor, tier, rng);
    if (plan) return plan;
  }
  throw new Error('level generation failed');
}

// ---------------------------------------------------------------------------- граф

interface Node {
  role: Role;
  parent: number;
  children: number[];
  main: boolean;
  depth: number;
}

function buildGraph(floor: number, tier: Tier, rng: RNG): Node[] {
  const gen = TIER_GEN[tier];
  const total = rng.int(gen.rooms[0], gen.rooms[1]);
  const specials = specialRoles(floor, total, rng);
  const fillRoles = Object.keys(gen.fill) as Role[];
  const fillCount = Math.max(gen.minFill, total - 2 - specials.length);
  const pool: Role[] = [];
  for (let i = 0; i < fillCount; i++) pool.push(rng.weighted(fillRoles, (r) => gen.fill[r] ?? 0));
  // не-тупиковые особые комнаты (элита) встают в общий ряд с обычными
  for (const r of specials) if (!ROLES[r].leaf) pool.push(r);
  rng.shuffle(pool);
  const leaves = rng.shuffle(specials.filter((r) => ROLES[r].leaf));

  const nodes: Node[] = [];
  const add = (role: Role, parent: number, main: boolean) => {
    nodes.push({ role, parent, children: [], main, depth: parent < 0 ? 0 : nodes[parent].depth + 1 });
    if (parent >= 0) nodes[parent].children.push(nodes.length - 1);
    return nodes.length - 1;
  };

  // главная линия: старт → ~55% обычных комнат → выход
  const mainCount = Math.min(pool.length, Math.max(2, Math.round(pool.length * 0.55)));
  let last = add('start', -1, true);
  for (let i = 0; i < mainCount; i++) last = add(pool.shift()!, last, true);
  add('exit', last, true);

  // не больше 3 детей у комнаты (+ родитель = 4 двери, + петля)
  const attachable = (i: number) => nodes[i].role !== 'exit' && !ROLES[nodes[i].role].leaf && nodes[i].children.length < 3;
  const pickParent = (mainOnly: boolean) => {
    const c = nodes.map((_, i) => i).filter((i) => attachable(i) && (!mainOnly || nodes[i].main));
    return c.length ? rng.pick(c) : -1;
  };

  // тупики с особыми комнатами: от главной линии, иногда через одну обычную комнату
  for (const leaf of leaves) {
    let parent = pickParent(true);
    if (parent < 0) parent = pickParent(false);
    if (parent < 0) return [];
    if (pool.length && rng.chance(0.4)) parent = add(pool.shift()!, parent, false);
    add(leaf, parent, false);
  }
  // оставшиеся обычные комнаты — боковые ветки
  while (pool.length) {
    const parent = pickParent(false);
    if (parent < 0) return [];
    add(pool.shift()!, parent, false);
  }
  return nodes;
}

// ---------------------------------------------------------------------------- размещение

/** Прямоугольники ближе m тайлов друг к другу (или пересекаются) */
function near(a: Rect, b: Rect, m: number): boolean {
  return a.x <= b.x + b.w - 1 + m && b.x <= a.x + a.w - 1 + m && a.y <= b.y + b.h - 1 + m && b.y <= a.y + a.h - 1 + m;
}

function roomSize(role: Role, rng: RNG): [number, number] {
  const d = ROLES[role];
  let w = rng.int(d.w[0], d.w[1]), h = rng.int(d.h[0], d.h[1]);
  // сервисная шахта бывает и вертикальной
  if (role === 'shaft' && rng.chance(0.5)) [w, h] = [h, w];
  return [w, h];
}

/** Растущее дерево: каждая комната ставится рядом с родителем, не ближе ROOM_GAP к остальным */
function place(nodes: Node[], rng: RNG): { rects: Rect[]; dirs: Dir[] } | null {
  const rects: Rect[] = new Array(nodes.length);
  const dirs: Dir[] = new Array(nodes.length);
  const [w0, h0] = roomSize(nodes[0].role, rng);
  rects[0] = { x: 0, y: 0, w: w0, h: h0 };
  const order = [0];
  for (let k = 0; k < order.length; k++) {
    const pi = order[k];
    const P = rects[pi];
    for (const ci of nodes[pi].children) {
      const [w, h] = roomSize(nodes[ci].role, rng);
      let ok = false;
      for (let attempt = 0; attempt < 40 && !ok; attempt++) {
        const dir = rng.pick(ALL_DIRS);
        const gap = rng.int(ROOM_GAP, ROOM_GAP + 6);
        let x: number, y: number;
        // проекции на стену пересекаются хотя бы на 7 тайлов — хватит места для дверей
        if (dir === 'e' || dir === 'w') {
          x = dir === 'e' ? P.x + P.w - 1 + gap : P.x - gap - w + 1;
          y = rng.int(P.y - h + 7, P.y + P.h - 7);
        } else {
          y = dir === 's' ? P.y + P.h - 1 + gap : P.y - gap - h + 1;
          x = rng.int(P.x - w + 7, P.x + P.w - 7);
        }
        const C = { x, y, w, h };
        if (rects.some((R, i) => R && i !== ci && near(C, R, ROOM_GAP - 1))) continue;
        rects[ci] = C;
        dirs[ci] = dir;
        ok = true;
      }
      if (!ok) return null;
      order.push(ci);
    }
  }
  return { rects, dirs };
}

// ---------------------------------------------------------------------------- поиск пути

/**
 * A* по тайлам с штрафом за повороты (коридоры получаются прямыми, с редкими изгибами).
 * Состояние — тайл + направление прихода.
 */
function astar(tw: number, th: number, blocked: Uint8Array, s: number, goal: number): number[] | null {
  if (blocked[s] || blocked[goal]) return null;
  const N = tw * th * 4;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const gx = goal % tw, gy = (goal / tw) | 0;
  const h = (i: number) => Math.abs((i % tw) - gx) + Math.abs(((i / tw) | 0) - gy);
  // двоичная куча по f
  const heapS: number[] = [], heapF: number[] = [];
  const push = (st: number, f: number) => {
    let i = heapS.length;
    heapS.push(st);
    heapF.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heapS[i] = heapS[p];
      heapF[i] = heapF[p];
      i = p;
    }
    heapS[i] = st;
    heapF[i] = f;
  };
  const pop = (): number => {
    const top = heapS[0];
    const ls = heapS.pop()!, lf = heapF.pop()!;
    if (heapS.length) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i, mf = lf;
        if (l < heapS.length && heapF[l] < mf) {
          m = l;
          mf = heapF[l];
        }
        if (r < heapS.length && heapF[r] < mf) m = r;
        if (m === i) break;
        heapS[i] = heapS[m];
        heapF[i] = heapF[m];
        i = m;
      }
      heapS[i] = ls;
      heapF[i] = lf;
    }
    return top;
  };
  const DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0];
  for (let d = 0; d < 4; d++) {
    gScore[s * 4 + d] = 0;
    push(s * 4 + d, h(s));
  }
  let expanded = 0;
  while (heapS.length) {
    const st = pop();
    if (closed[st]) continue;
    closed[st] = 1;
    if (++expanded > 300000) return null;
    const i = st >> 2, d = st & 3;
    if (i === goal) {
      const path: number[] = [];
      for (let c = st; c >= 0; c = came[c]) path.push(c >> 2);
      return path.reverse();
    }
    const x = i % tw, y = (i / tw) | 0;
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + DX[nd], ny = y + DY[nd];
      if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
      const ni = ny * tw + nx;
      if (blocked[ni]) continue;
      const ns = ni * 4 + nd;
      const g = gScore[st] + 1 + (nd !== d && came[st] >= 0 ? 4 : 0);
      if (g < gScore[ns]) {
        gScore[ns] = g;
        came[ns] = st;
        push(ns, g + h(ni));
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------- сборка уровня

function tryGenerate(floor: number, tier: Tier, rng: RNG): LevelPlan | null {
  const nodes = buildGraph(floor, tier, rng);
  if (!nodes.length) return null;
  const placed = place(nodes, rng);
  if (!placed) return null;
  const { rects, dirs } = placed;

  // сдвигаем всё в положительные координаты
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w - 1);
    maxY = Math.max(maxY, r.y + r.h - 1);
  }
  const tw = maxX - minX + 1 + PAD * 2, th = maxY - minY + 1 + PAD * 2;
  if (tw > MAX_W || th > MAX_H) return null;

  const rooms: LevelRoom[] = nodes.map((n, id) => ({
    id, role: n.role, x: rects[id].x - minX + PAD, y: rects[id].y - minY + PAD, w: rects[id].w, h: rects[id].h,
    depth: n.depth, main: n.main, doors: [], visited: false, seen: false, cleared: false,
  }));
  const idx = (x: number, y: number) => y * tw + x;

  // тайлы, где не может идти осевая линия коридора: комнаты с каймой в 1 тайл и края карты
  const blocked = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (x < 2 || y < 2 || x >= tw - 2 || y >= th - 2) blocked[idx(x, y)] = 1;
  for (const r of rooms) {
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) blocked[idx(x, y)] = 1;
  }

  const doors: LevelDoor[] = [];
  const corridors: Corridor[] = [];
  /** Пол коридоров (для проверки, что петля их не касается) */
  const corrFloor = new Uint8Array(tw * th);

  /** Подобрать место двери на стене dir комнаты r: ближе к target, не ближе DOOR_SPACING к другим дверям стены */
  const pickDoor = (r: LevelRoom, dir: Dir, target: number): LevelDoor | null => {
    const horiz = dir === 'n' || dir === 's';
    const lo = (horiz ? r.x : r.y) + 3, hi = (horiz ? r.x + r.w : r.y + r.h) - 4;
    if (lo > hi) return null;
    const t = Math.max(lo, Math.min(hi, Math.round(target)));
    for (let k = 0; k <= hi - lo; k++) {
      for (const c of k ? [t - k, t + k] : [t]) {
        if (c < lo || c > hi) continue;
        const clash = r.doors.some((di) => {
          const o = doors[di];
          return o.dir === dir && Math.abs((horiz ? o.tx : o.ty) - c) < DOOR_SPACING;
        });
        if (clash) continue;
        const tx = horiz ? c : dir === 'w' ? r.x : r.x + r.w - 1;
        const ty = horiz ? (dir === 'n' ? r.y : r.y + r.h - 1) : c;
        return { id: -1, room: r.id, dir, tx, ty, corridor: -1, gate: false, locked: false };
      }
    }
    return null;
  };

  /** Проложить коридор между комнатами a и b (двери на стенах da / db). block — запреты для осевой линии */
  const connect = (a: LevelRoom, b: LevelRoom, da: Dir, db: Dir, loop: boolean, block: Uint8Array, maxLen = Infinity): Corridor | null => {
    const horizA = da === 'n' || da === 's', horizB = db === 'n' || db === 's';
    const centerA = horizA ? a.x + a.w / 2 : a.y + a.h / 2;
    const centerB = horizB ? b.x + b.w / 2 : b.y + b.h / 2;
    // целимся в середину общей проекции стен (или в центр другой комнаты)
    const targetA = horizA ? overlapMid(a.x, a.w, b.x, b.w) ?? centerB : overlapMid(a.y, a.h, b.y, b.h) ?? centerB;
    const targetB = horizB ? overlapMid(b.x, b.w, a.x, a.w) ?? centerA : overlapMid(b.y, b.h, a.y, a.h) ?? centerA;
    const dA = pickDoor(a, da, targetA), dB = pickDoor(b, db, targetB);
    if (!dA || !dB) return null;
    const [ax, ay] = DIRS[da], [bx, by] = DIRS[db];
    const s = idx(dA.tx + ax * 2, dA.ty + ay * 2), g = idx(dB.tx + bx * 2, dB.ty + by * 2);
    const mid = astar(tw, th, block, s, g);
    if (!mid || mid.length > maxLen) return null;
    dA.id = doors.length;
    doors.push(dA);
    dB.id = doors.length;
    doors.push(dB);
    a.doors.push(dA.id);
    b.doors.push(dB.id);
    const c: Corridor = {
      id: corridors.length, a: a.id, b: b.id, doorA: dA.id, doorB: dB.id, loop,
      path: [idx(dA.tx + ax, dA.ty + ay), ...mid, idx(dB.tx + bx, dB.ty + by)],
    };
    dA.corridor = dB.corridor = c.id;
    corridors.push(c);
    // кисть 3×3 по осевой линии
    for (const i of c.path) {
      const x = i % tw, y = (i / tw) | 0;
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) corrFloor[idx(x + xx, y + yy)] = 1;
    }
    return c;
  };

  // коридоры дерева: от родителя к ребёнку, с той стороны, где ребёнок поставлен
  for (let ci = 1; ci < nodes.length; ci++) {
    const pi = nodes[ci].parent;
    if (!connect(rooms[pi], rooms[ci], dirs[ci], OPPOSITE[dirs[ci]], false, blocked)) return null;
  }

  // петли: короткий путь между комнатами, далёкими по дереву, но близкими на карте
  const gen = TIER_GEN[tier];
  const wantLoops = rng.int(gen.loops[0], gen.loops[1]);
  const treeDist = (u: number, v: number) => {
    const anc = new Map<number, number>();
    for (let a = u, d = 0; a >= 0; a = nodes[a].parent, d++) anc.set(a, d);
    for (let b = v, d = 0; b >= 0; b = nodes[b].parent, d++) if (anc.has(b)) return anc.get(b)! + d;
    return Infinity;
  };
  const loopable = (r: LevelRoom) => r.role !== 'start' && !ROLES[r.role].leaf;
  const cands: { u: number; v: number; key: number }[] = [];
  for (const u of rooms) {
    for (const v of rooms) {
      if (u.id >= v.id || !loopable(u) || !loopable(v)) continue;
      if (u.doors.length >= 5 || v.doors.length >= 5) continue;
      if (treeDist(u.id, v.id) < 3) continue;
      const gap = Math.max(v.x - (u.x + u.w), u.x - (v.x + v.w), v.y - (u.y + u.h), u.y - (v.y + v.h));
      if (gap > 30) continue;
      cands.push({ u: u.id, v: v.id, key: gap + rng.next() * 4 });
    }
  }
  cands.sort((p, q) => p.key - q.key);
  const loops: Loop[] = [];
  for (const { u, v } of cands) {
    if (loops.length >= wantLoops) break;
    // осевая линия петли не ближе 2 тайлов к полу других коридоров — иначе гермодверь можно обойти
    const block = blocked.slice();
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        if (!corrFloor[idx(x, y)]) continue;
        for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) {
          const nx = x + xx, ny = y + yy;
          if (nx >= 0 && ny >= 0 && nx < tw && ny < th) block[idx(nx, ny)] = 1;
        }
      }
    }
    const a = rooms[u], b = rooms[v];
    const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const primary: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
    const secondary: Dir = Math.abs(dx) >= Math.abs(dy) ? (dy > 0 ? 's' : 'n') : dx > 0 ? 'e' : 'w';
    let c: Corridor | null = null;
    for (const d of [primary, secondary]) {
      c = connect(a, b, d, OPPOSITE[d], true, block, LOOP_MAX);
      if (c) break;
    }
    if (!c) continue;
    const near = a.depth <= b.depth ? a : b, far = near === a ? b : a;
    const gateDoor = near === a ? c.doorA : c.doorB;
    doors[gateDoor].gate = doors[gateDoor].locked = true;
    loops.push({ corridor: c.id, gateDoor, terminalRoom: far.id });
  }
  if (loops.length < gen.loops[0]) return null;

  // тайлы: пустота → комнаты → коридоры → двери → стены вокруг пола
  const tiles = new Uint8Array(tw * th).fill(T.Void);
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        tiles[idx(x, y)] = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1 ? T.Wall : T.Floor;
      }
    }
  }
  for (let i = 0; i < tiles.length; i++) if (corrFloor[i] && tiles[i] === T.Void) tiles[i] = T.Floor;
  for (const d of doors) for (const [x, y] of doorTiles(d)) tiles[idx(x, y)] = T.Door;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      if (tiles[idx(x, y)] !== T.Void) continue;
      let wall = false;
      for (let yy = -1; yy <= 1 && !wall; yy++) for (let xx = -1; xx <= 1 && !wall; xx++) {
        const nx = x + xx, ny = y + yy;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
        const t = tiles[idx(nx, ny)];
        if (t === T.Floor || t === T.Door) wall = true;
      }
      if (wall) tiles[idx(x, y)] = T.Wall;
    }
  }

  const plan: LevelPlan = {
    floor, tier, tw, th, tiles, rooms, doors, corridors, loops,
    startId: 0, exitId: rooms.findIndex((r) => r.role === 'exit'),
  };
  return reachAll(plan, false) ? plan : null;
}

/** Середина общей части отрезков [a, a+aw) и [b, b+bw), если она есть и хватает места под дверь */
function overlapMid(a: number, aw: number, b: number, bw: number): number | null {
  const lo = Math.max(a + 3, b + 3), hi = Math.min(a + aw - 4, b + bw - 4);
  return lo <= hi ? (lo + hi) / 2 : null;
}

/**
 * Заливка от центра стартовой комнаты по полу и проёмам. gatesOpen = false — гермодвери закрыты.
 * Возвращает true, если достижим пол каждой комнаты.
 */
export function reachAll(plan: LevelPlan, gatesOpen: boolean): boolean {
  const seen = floodFrom(plan, gatesOpen);
  return plan.rooms.every((r) => seen[(r.y + 1) * plan.tw + r.x + 1] === 1);
}

/** Заливка от старта: 1 — тайл достижим */
export function floodFrom(plan: LevelPlan, gatesOpen: boolean): Uint8Array {
  const { tw, th, tiles } = plan;
  const shut = new Uint8Array(tw * th);
  if (!gatesOpen) for (const d of plan.doors) if (d.gate) for (const [x, y] of doorTiles(d)) shut[y * tw + x] = 1;
  const s = plan.rooms[plan.startId];
  const start = (s.y + 1) * tw + s.x + 1;
  const seen = new Uint8Array(tw * th);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % tw, y = (i / tw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
      const ni = ny * tw + nx;
      const t = tiles[ni];
      if (seen[ni] || shut[ni] || !(t === T.Floor || t === T.Door)) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return seen;
}
