import { angleTo, dist } from '../core/math';
import { blocksFlyers, walkable } from '../world/tiles';
import { moveBody } from './collision';
import type { Enemy } from './enemy';
import type { Game } from './game';

// Общие кирпичики поведения врагов. «Игрок» здесь — цель врага (g.aimX/aimY): обычно игрок,
// но враг может целиться в приманку или союзника, а союзник — во врага (свой-чужой, этап 12б).

export function distToPlayer(e: Enemy, g: Game): number {
  return dist(e.x, e.y, g.aimX, g.aimY);
}

export function angleToPlayer(e: Enemy, g: Game): number {
  return angleTo(e.x, e.y, g.aimX, g.aimY);
}

/** Передвижение с учётом стен (наземные не заходят в ямы) */
export function move(e: Enemy, g: Game, dx: number, dy: number) {
  const flying = e.def.flying || e.airborne;
  const solid = flying
    ? (t: number) => blocksFlyers(t)
    : (t: number) => !walkable(t);
  const body = { x: e.x, y: e.y, r: Math.min(e.r, 6) };
  const res = moveBody(g.room, body, dx, dy, solid);
  e.x = body.x;
  e.y = body.y;
  if (Math.abs(dx) > 0.01) e.facing = dx > 0 ? 1 : -1;
  return res;
}

/** Шаг к игроку по полю путей (наземные) или напрямую (летающие) */
export function chase(e: Enemy, g: Game, dt: number, speed = e.def.speed) {
  const s = speed * e.speedMult * dt;
  let dir: [number, number] | null = null;
  // поле путей ведёт к игроку; к другой цели — напрямую
  if (!e.def.flying && g.aimPlayer) dir = g.flow.direction(e.x, e.y);
  if (!dir) {
    const a = angleToPlayer(e, g);
    dir = [Math.cos(a), Math.sin(a)];
  }
  move(e, g, dir[0] * s, dir[1] * s);
  e.anim += dt * speed * 0.08;
}

/** Держать дистанцию: подойти, если далеко, отступить, если близко, иначе кружить */
export function keepRange(e: Enemy, g: Game, dt: number, min: number, max: number, speed = e.def.speed) {
  const d = distToPlayer(e, g);
  if (d > max) return chase(e, g, dt, speed);
  const a = angleToPlayer(e, g);
  const s = speed * e.speedMult * dt;
  if (d < min) {
    move(e, g, -Math.cos(a) * s, -Math.sin(a) * s);
  } else {
    if (!e.mem.strafe || Math.random() < dt * 0.4) e.mem.strafe = Math.random() < 0.5 ? 1 : -1;
    const sa = a + (Math.PI / 2) * e.mem.strafe;
    const r = move(e, g, Math.cos(sa) * s * 0.6, Math.sin(sa) * s * 0.6);
    if (r.hx || r.hy) e.mem.strafe *= -1;
  }
  e.facing = Math.cos(a) >= 0 ? 1 : -1;
  e.anim += dt * speed * 0.08;
}

/** Случайное блуждание */
export function wander(e: Enemy, g: Game, dt: number, speed = e.def.speed * 0.5) {
  if (e.mem.wanderT === undefined || e.mem.wanderT <= 0) {
    e.mem.wanderA = Math.random() * Math.PI * 2;
    e.mem.wanderT = 0.8 + Math.random() * 1.2;
  }
  e.mem.wanderT -= dt;
  const s = speed * e.speedMult * dt;
  const r = move(e, g, Math.cos(e.mem.wanderA) * s, Math.sin(e.mem.wanderA) * s);
  if (r.hx || r.hy) e.mem.wanderT = 0;
  e.anim += dt * speed * 0.08;
}

/** Таймер: возвращает true раз в period секунд (с учётом сложности) */
export function every(e: Enemy, g: Game, key: string, period: number, dt: number, initial = Math.random()): boolean {
  if (e.mem[key] === undefined) e.mem[key] = period * initial;
  e.mem[key] -= dt;
  if (e.mem[key] <= 0) {
    e.mem[key] += period * g.diff.cooldown;
    return true;
  }
  return false;
}

/** Враг начинает замах (телеграф атаки) на t секунд */
export function startWindup(e: Enemy, t: number) {
  e.windup = t;
  e.windupHit = false;
}

/** Враги стреляют, только если игрок достаточно близко (большие комнаты) */
export function inRange(e: Enemy, g: Game, r = 250): boolean {
  return !g.aimNone && distToPlayer(e, g) < r;
}
