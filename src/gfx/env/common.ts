// Общие кисти для всех ярусов: запечённая тень (AO), края стен, база ямы, электропол, форма колонны.
import { TILE } from '../../config';
import { T } from '../../world/tiles';
import { C } from '../palette';
import { SIDE } from './layout';
import { D, R, hazard, isObstacle, isPit, isWall, nb, ph, shadeBand, vgrad, type P } from './util';

export interface TierPainter {
  /** Пол целиком (база + крупные узоры) */
  floor(p: P): void;
  /** Мелкие детали пола по room.decor (1..7) */
  decal(p: P): void;
  /** Верх стены (весь тайл), side — SIDE.* */
  cap(p: P, side: number): void;
  /** Фасад стены (строки 3..15), fix — FX.* */
  face(p: P, fix: number): void;
  pit(p: P): void;
  bridge(p: P): void;
  block(p: P): void;
  crate(p: P): void;
  /** Цвета бокового светильника: корпус, плафон, яркая точка */
  lampCols: [string, string, string];
}

/** Запечённая тень у стен и препятствий: даёт глубину */
export function ao(p: P) {
  const n = nb(p, 0, -1), s = nb(p, 0, 1), w = nb(p, -1, 0), e = nb(p, 1, 0);
  if (isWall(n)) shadeBand(p, 'n', [0.62, 0.45, 0.3, 0.18, 0.09, 0.04]);
  else if (isObstacle(n)) shadeBand(p, 'n', [0.55, 0.34, 0.16, 0.06]);
  if (isWall(w)) shadeBand(p, 'w', [0.5, 0.25, 0.1]);
  else if (isObstacle(w)) shadeBand(p, 'w', [0.25, 0.08]);
  if (isWall(e)) shadeBand(p, 'e', [0.5, 0.25, 0.1]);
  else if (isObstacle(e)) shadeBand(p, 'e', [0.25, 0.08]);
  if (isWall(s)) shadeBand(p, 's', [0.35, 0.12]);
  // угловые тени от препятствий по диагонали
  if (!isObstacle(n) && !isWall(n) && isObstacle(nb(p, -1, -1))) R(p, 0, 0, 3, 2, C.void, 0.25);
}

/** Края верха стены, обращённые в комнату: светлая кромка и тёмная граница */
export function capEdges(p: P, side: number, hi: string, a = 0.45) {
  if (side === SIDE.Left) {
    R(p, 13, 0, 1, TILE, hi, a);
    R(p, 14, 0, 2, TILE, C.black, 0.7);
  } else if (side === SIDE.Right) {
    R(p, 2, 0, 1, TILE, hi, a);
    R(p, 0, 0, 2, TILE, C.black, 0.7);
  } else if (side === SIDE.Bottom) {
    R(p, 0, 0, TILE, 1, C.black, 0.8);
    R(p, 0, 1, TILE, 1, hi, a);
  } else if (side === SIDE.Face) {
    R(p, 0, 2, TILE, 1, hi, a);
    R(p, 0, 3, TILE, 1, C.black, 0.85);
  }
  // внешние углы: если сосед по стене сам граничит с полом — продолжаем кромку
}

/** Небольшой настенный светильник на боковой/нижней стене */
export function sideLamp(p: P, side: number, body: string, bulb: string, core: string) {
  if (side === SIDE.Left) {
    R(p, 11, 6, 3, 5, C.black);
    R(p, 12, 7, 2, 3, bulb);
    D(p, 13, 8, core);
    R(p, 9, 7, 2, 3, body);
  } else if (side === SIDE.Right) {
    R(p, 2, 6, 3, 5, C.black);
    R(p, 2, 7, 2, 3, bulb);
    D(p, 2, 8, core);
    R(p, 5, 7, 2, 3, body);
  } else if (side === SIDE.Bottom) {
    R(p, 5, 0, 6, 3, C.black);
    R(p, 6, 0, 4, 2, bulb);
    R(p, 7, 0, 2, 1, core);
    R(p, 6, 3, 4, 1, body);
  }
}

/** База ямы: пустота, дальняя стенка (видна внутри провала), боковые кромки и ближний край */
export function pitBase(p: P, back: string[], rim: string, lip: string) {
  R(p, 0, 0, TILE, TILE, C.void);
  if (!isPit(nb(p, 0, -1))) vgrad(p, 0, 0, TILE, back);
  if (!isPit(nb(p, -1, 0))) {
    R(p, 0, 0, 1, TILE, rim);
    R(p, 1, 0, 1, TILE, C.void, 0.5);
  }
  if (!isPit(nb(p, 1, 0))) R(p, 15, 0, 1, TILE, rim);
  if (!isPit(nb(p, 0, 1))) {
    R(p, 0, 14, TILE, 1, C.void);
    R(p, 0, 15, TILE, 1, lip);
  }
}

/** Электропол: должен читаться как опасность в любом ярусе */
export function electro(p: P, plate: string) {
  const E = T.Electro;
  R(p, 0, 0, TILE, TILE, C.black);
  R(p, 1, 1, 14, 14, plate);
  // токопроводящая сетка
  for (let y = 3; y < 15; y += 4) R(p, 1, y, 14, 1, C.amberD);
  for (let x = 3; x < 15; x += 4) R(p, x, 1, 1, 14, C.black, 0.8);
  for (let y = 3; y < 15; y += 4) for (let x = 3; x < 15; x += 4) D(p, x, y, C.amber, 0.8);
  // знак молнии на части плит
  if ((p.tx + p.ty) % 2 === 0) {
    const bolt: [number, number][] = [[8, 4], [7, 5], [6, 6], [7, 7], [8, 7], [9, 8], [8, 9], [7, 10], [8, 10]];
    for (const [bx, by] of bolt) {
      D(p, bx + 1, by + 1, C.void, 0.6);
      D(p, bx, by, C.yellow, 0.75);
    }
  }
  // жёлто-чёрная окантовка по краям участка
  if (nb(p, 0, -1) !== E) hazard(p, 0, 0, TILE, 2);
  if (nb(p, 0, 1) !== E) hazard(p, 0, 14, TILE, 2);
  if (nb(p, -1, 0) !== E) hazard(p, 0, 0, 2, TILE);
  if (nb(p, 1, 0) !== E) hazard(p, 14, 0, 2, TILE);
}

/** Геометрия связанной колонны (соседние Block сливаются в один массив) */
export interface BlockGeo {
  x0: number;
  x1: number;
  y0: number;
  /** Нижняя граница верхней грани (дальше — фасад) */
  yf: number;
  /** Нижняя граница фасада */
  y1: number;
  nN: boolean;
  nS: boolean;
  nW: boolean;
  nE: boolean;
}

export function blockShape(p: P, top: string, hi: string, front: string, frontD: string): BlockGeo {
  const B = T.Block;
  const nN = nb(p, 0, -1) === B, nS = nb(p, 0, 1) === B, nW = nb(p, -1, 0) === B, nE = nb(p, 1, 0) === B;
  const x0 = nW ? 0 : 1, x1 = nE ? 16 : 15;
  const y0 = nN ? 0 : 1;
  const yf = nS ? 16 : 10, y1 = nS ? 16 : 15;
  // тень на пол
  if (!nS) R(p, x0, 13, x1 - x0, 3, C.void, 0.55);
  // контур
  R(p, x0 - (nW ? 0 : 1), y0 - (nN ? 0 : 1), x1 - x0 + (nW ? 0 : 1) + (nE ? 0 : 1), y1 - y0 + (nN ? 0 : 1), C.black);
  R(p, x0, y0, x1 - x0, yf - y0, top);
  if (!nS) {
    R(p, x0, yf, x1 - x0, y1 - yf, front);
    R(p, x0, y1 - 1, x1 - x0, 1, frontD);
    R(p, x0, yf, x1 - x0, 1, hi, 0.25);
  }
  if (!nN) R(p, x0, y0, x1 - x0, 1, hi);
  if (!nW) R(p, x0, y0, 1, yf - y0, hi, 0.4);
  if (!nE) R(p, x1 - 1, y0, 1, yf - y0, C.black, 0.35);
  return { x0, x1, y0, yf, y1, nN, nS, nW, nE };
}

/** Тень под отдельно стоящим объектом (ящик и т.п.) */
export function dropShadow(p: P) {
  R(p, 2, 13, 12, 3, C.void, 0.5);
  R(p, 1, 14, 14, 2, C.void, 0.3);
}

/** Трещина ломаной линией */
export function crack(p: P, col: string, salt: number) {
  const h = ph(p, salt);
  let x = 2 + (h % 5), y = 3 + ((h >>> 4) % 6);
  for (let i = 0; i < 9; i++) {
    D(p, x, y, col);
    const r = (h >>> (i * 2 + 8)) & 3;
    x += 1;
    if (r === 0) y -= 1;
    else if (r === 1) y += 1;
    if (x > 14 || y < 1 || y > 14) break;
    if (r === 3 && i % 3 === 0) D(p, x, y + 1, col, 0.6);
  }
}

/** Неровное органичное пятно: эллипс с «дышащим» по углу краем */
export function blob(p: P, cx: number, cy: number, rw: number, rh: number, col: string, a: number) {
  const h = ph(p, cx * 7 + cy * 13 + rw);
  const f1 = (h % 628) / 100, f2 = ((h >>> 10) % 628) / 100;
  p.x.globalAlpha = a;
  p.x.fillStyle = col;
  for (let y = -rh; y <= rh; y++) {
    for (let x = -rw; x <= rw; x++) {
      const d = (x * x) / (rw * rw) + (y * y) / (rh * rh);
      const ang = Math.atan2(y / rh, x / rw);
      const r = 1 + 0.22 * Math.sin(3 * ang + f1) + 0.12 * Math.sin(5 * ang + f2);
      const px = cx + x, py = cy + y;
      if (d <= r * r && px >= 0 && py >= 0 && px < TILE && py < TILE) p.x.fillRect(p.px + px, p.py + py, 1, 1);
    }
  }
  p.x.globalAlpha = 1;
}
