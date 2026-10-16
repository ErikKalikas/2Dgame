import { TAU, angleTo } from '../core/math';
import { makeEBullet, type EBulletOpts } from './bullets';
import type { Game } from './game';

// Узоры вражеских пуль. Сложность влияет на скорость, плотность и точность прицеливания.

/** Пуля врага. Стреляет текущий актёр (g.actor): у союзника пуля летит по врагам (g.abullets) */
export function shoot(g: Game, x: number, y: number, angle: number, speed: number, o?: EBulletOpts) {
  const ally = g.actor?.team === 'ally';
  const list = ally ? g.abullets : g.ebullets;
  if (list.length > 2200) return;
  const b = makeEBullet(x, y, angle, speed * g.diff.speed * g.floorSpeed, o);
  if (o?.maxSpeed) b.maxSpeed = o.maxSpeed * g.diff.speed;
  if (g.actor) b.owner = g.actor;
  list.push(b);
  return b;
}

/** Угол на цель (обычно игрок; приманка или союзник — см. Game.setAim) с погрешностью по сложности */
export function aim(g: Game, x: number, y: number, extraError = 0): number {
  const err = g.diff.aim + extraError;
  return angleTo(x, y, g.aimX, g.aimY) + (Math.random() - 0.5) * 2 * err;
}

/** Количество пуль с поправкой на сложность */
export function n(g: Game, count: number): number {
  return Math.max(1, Math.round(count * g.diff.density));
}

export function ring(g: Game, x: number, y: number, count: number, speed: number, offset = 0, o?: EBulletOpts) {
  const c = n(g, count);
  for (let i = 0; i < c; i++) shoot(g, x, y, offset + (i / c) * TAU, speed, o);
}

export function spread(g: Game, x: number, y: number, angle: number, count: number, arc: number, speed: number, o?: EBulletOpts) {
  const c = count <= 3 ? count : n(g, count);
  if (c === 1) return void shoot(g, x, y, angle, speed, o);
  for (let i = 0; i < c; i++) shoot(g, x, y, angle - arc / 2 + (arc * i) / (c - 1), speed, o);
}

/** Прицельная очередь из нескольких пуль с разной скоростью ("струя") */
export function stream(g: Game, x: number, y: number, angle: number, count: number, speed: number, step: number, o?: EBulletOpts) {
  for (let i = 0; i < count; i++) shoot(g, x, y, angle, speed + i * step, o);
}

/** Цветок: несколько лучей пуль, повёрнутых на offset */
export function flower(g: Game, x: number, y: number, petals: number, perPetal: number, speed: number, offset: number, o?: EBulletOpts) {
  for (let p = 0; p < petals; p++) {
    const a = offset + (p / petals) * TAU;
    for (let i = 0; i < perPetal; i++) shoot(g, x, y, a + (i - (perPetal - 1) / 2) * 0.08, speed * (1 - i * 0.04), o);
  }
}
