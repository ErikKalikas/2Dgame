import { TILE } from '../config';
import type { LevelMap } from '../world/level';
import { blocksShots } from '../world/tiles';

export type SolidFn = (tile: number, tx: number, ty: number) => boolean;

export interface Body {
  x: number;
  y: number;
  /** Половина размера тела для столкновений со стенами */
  r: number;
}

/**
 * Перемещение тела (квадрат 2r×2r) с раздельным разрешением по осям.
 * Возвращает, было ли столкновение по X и по Y.
 */
export function moveBody(room: LevelMap, b: Body, dx: number, dy: number, solid: SolidFn): { hx: boolean; hy: boolean } {
  let hx = false, hy = false;
  // большие смещения дробим, чтобы не проскакивать сквозь тайлы
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE / 2)));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx) {
      b.x += sx;
      if (overlaps(room, b, solid)) {
        b.x -= sx;
        // прижимаемся вплотную к стене
        const dir = Math.sign(sx);
        for (let k = 0; k < 8 && !overlaps(room, { x: b.x + dir * 0.5, y: b.y, r: b.r }, solid); k++) b.x += dir * 0.5;
        hx = true;
      }
    }
    if (sy) {
      b.y += sy;
      if (overlaps(room, b, solid)) {
        b.y -= sy;
        const dir = Math.sign(sy);
        for (let k = 0; k < 8 && !overlaps(room, { x: b.x, y: b.y + dir * 0.5, r: b.r }, solid); k++) b.y += dir * 0.5;
        hy = true;
      }
    }
  }
  return { hx, hy };
}

export function overlaps(room: LevelMap, b: Body, solid: SolidFn): boolean {
  const x0 = Math.floor((b.x - b.r) / TILE), x1 = Math.floor((b.x + b.r - 0.001) / TILE);
  const y0 = Math.floor((b.y - b.r) / TILE), y1 = Math.floor((b.y + b.r - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (solid(room.get(tx, ty), tx, ty)) return true;
    }
  }
  return false;
}

/** Расстояние до первого препятствия для пуль вдоль луча (не больше maxDist) */
export function raycast(room: LevelMap, x: number, y: number, angle: number, maxDist: number): number {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (let d = 0; d < maxDist; d += 3) {
    if (blocksShots(room.at(x + ca * d, y + sa * d))) return d;
  }
  return maxDist;
}

/** Есть ли прямая видимость между точками */
export function lineOfSight(room: LevelMap, x1: number, y1: number, x2: number, y2: number): boolean {
  const d = Math.hypot(x2 - x1, y2 - y1);
  return raycast(room, x1, y1, Math.atan2(y2 - y1, x2 - x1), d) >= d - 1;
}

/** Расстояние от точки до отрезка (для лучей) */
export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const vx = x2 - x1, vy = y2 - y1;
  const len2 = vx * vx + vy * vy;
  let t = len2 ? ((px - x1) * vx + (py - y1) * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t));
}
