// Общие инструменты художника окружения: детерминированный шум, контекст тайла, мелкие примитивы.
import { TILE } from '../../config';
import type { FloorTheme } from '../../content/floors';
import type { RoomMap } from '../../world/room';
import { T } from '../../world/tiles';
import { C } from '../palette';

/** Целочисленный хеш (x, y, salt) → 0..2^32-1. Никакого Math.random в статичном слое. */
export function hash(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

/** Хеш → [0, 1) */
export const rnd = (x: number, y: number, s = 0) => hash(x, y, s) / 4294967296;

/** Гладкий value-noise по сетке (x, y в клетках сетки) → [0, 1) */
export function vnoise(x: number, y: number, s = 0): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = rnd(x0, y0, s), b = rnd(x0 + 1, y0, s), c = rnd(x0, y0 + 1, s), d = rnd(x0 + 1, y0 + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Всё, что нужно кисти для одного тайла */
export interface P {
  x: CanvasRenderingContext2D;
  room: RoomMap;
  th: FloorTheme;
  tx: number;
  ty: number;
  px: number;
  py: number;
  decor: number;
  /** Вариант уровня внутри яруса (0/1) */
  v: number;
  /** Соль комнаты для хешей */
  s: number;
}

export function makeP(x: CanvasRenderingContext2D, room: RoomMap, th: FloorTheme, tx: number, ty: number): P {
  return {
    x, room, th, tx, ty, px: tx * TILE, py: ty * TILE,
    decor: room.decor[ty * room.tw + tx], v: th.variant, s: room.info.id * 31 + 7,
  };
}

/** Прямоугольник в координатах тайла */
export function R(p: P, dx: number, dy: number, w: number, h: number, c: string, a = 1) {
  if (a <= 0) return;
  p.x.globalAlpha = a;
  p.x.fillStyle = c;
  p.x.fillRect(p.px + dx, p.py + dy, w, h);
  if (a !== 1) p.x.globalAlpha = 1;
}

/** Один пиксель */
export const D = (p: P, dx: number, dy: number, c: string, a = 1) => R(p, dx, dy, 1, 1, c, a);

/** Хеш, привязанный к тайлу */
export const ph = (p: P, salt: number) => hash(p.tx, p.ty, salt + p.s);
export const pr = (p: P, salt: number) => rnd(p.tx, p.ty, salt + p.s);

/** Россыпь точек внутри прямоугольника тайла */
export function speckle(p: P, n: number, c: string, a: number, salt: number, x0 = 0, y0 = 0, w = TILE, h = TILE) {
  for (let i = 0; i < n; i++) {
    const hh = hash(p.tx * 16 + i, p.ty, salt + p.s);
    D(p, x0 + (hh % w), y0 + ((hh >>> 8) % h), c, a);
  }
}

// --- соседи ---
export const isWall = (t: number) => t === T.Wall;
export const isPit = (t: number) => t === T.Pit || t === T.Bridge;
export const isSolid = (t: number) => t === T.Wall || t === T.Block || t === T.Crate;
export const isObstacle = (t: number) => t === T.Block || t === T.Crate;
export const nb = (p: P, dx: number, dy: number) => p.room.get(p.tx + dx, p.ty + dy);

/** Жёлто-чёрная диагональная штриховка в прямоугольнике тайла */
export function hazard(p: P, dx: number, dy: number, w: number, h: number, a = 1, col: string = C.amber, phase = 0) {
  R(p, dx, dy, w, h, C.black, a);
  p.x.globalAlpha = a;
  p.x.fillStyle = col;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      if (((p.px + dx + xx + p.py + dy + yy + phase) & 7) < 4) p.x.fillRect(p.px + dx + xx, p.py + dy + yy, 1, 1);
    }
  }
  p.x.globalAlpha = 1;
}

/** Вертикальный градиент из набора цветов сверху вниз (по строкам) */
export function vgrad(p: P, dx: number, dy: number, w: number, cols: string[], a = 1) {
  for (let i = 0; i < cols.length; i++) R(p, dx, dy + i, w, 1, cols[i], a);
}

/** Затемнение полосой с убывающей прозрачностью */
export function shadeBand(p: P, side: 'n' | 's' | 'e' | 'w', alphas: number[]) {
  for (let i = 0; i < alphas.length; i++) {
    const a = alphas[i];
    if (side === 'n') R(p, 0, i, TILE, 1, C.void, a);
    else if (side === 's') R(p, 0, TILE - 1 - i, TILE, 1, C.void, a);
    else if (side === 'w') R(p, i, 0, 1, TILE, C.void, a);
    else R(p, TILE - 1 - i, 0, 1, TILE, C.void, a);
  }
}

/**
 * Органичное пятно по шуму, сквозное через тайлы (ржавчина, масло, сырость, копоть).
 * scale — размер пятен в пикселях, thr — порог, amax — максимальная плотность.
 */
export function stain(p: P, scale: number, thr: number, col: string, amax: number, salt: number, step = 2) {
  // шум гладкий: если во всех опорных точках тайла далеко до порога — пятна здесь нет
  let mx = 0;
  for (let y = 0; y <= 16; y += 8) for (let x = 0; x <= 16; x += 8) mx = Math.max(mx, vnoise((p.px + x) / scale, (p.py + y) / scale, salt + p.s));
  if (mx < thr - 0.1) return;
  for (let y = 0; y < 16; y += step) {
    for (let x = 0; x < 16; x += step) {
      const n = vnoise((p.px + x) / scale, (p.py + y) / scale, salt + p.s);
      if (n > thr) {
        const k = (n - thr) / (1 - thr);
        R(p, x, y, step, step, col, k > 0.5 ? amax : k > 0.2 ? amax * 0.6 : amax * 0.3);
      }
    }
  }
}
