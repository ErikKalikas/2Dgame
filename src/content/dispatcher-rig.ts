import {
  ARM_FORE, ARM_UPPER, DH, DW, FORE_HALF, SHOULDER_X, SHOULDER_Y, UPPER_HALF,
  armAngle, armIndex, dispatcherBody, dispatcherCaps, foreArmSprite, upperArmSprite,
} from '../gfx/art/dispatcher';
import type { Sprite } from '../gfx/sprite';
import type { Enemy } from '../game/enemy';
import type { Game } from '../game/game';

// Руки Диспетчера: каждая рука тянется ладонью к точке, которую задаёт фаза боя
// (двухзвенная обратная кинематика, локоть всегда наружу). Пули фаз вылетают из ладоней.
// Состояние хранится вне e.mem: при смене фазы mem очищается, а руки должны двигаться плавно.

interface Arm {
  /** Ладонь относительно плечевого шарнира (сглаженная) */
  x: number;
  y: number;
  /** Куда тянуться в этом шаге (относительно шарнира) */
  wx: number;
  wy: number;
  open: boolean;
  /** Индексы углов плеча и предплечья */
  ui: number;
  fi: number;
  /** Ладонь в мировых координатах (для пуль) */
  hx: number;
  hy: number;
}

interface Rig {
  arms: [Arm, Arm];
}

const RIGS = new WeakMap<Enemy, Rig>();

/** Сторона руки: 0 — левая, 1 — правая */
const SIDE = [-1, 1] as const;
/** Смещение шарниров от центра корпуса (как в drawDispatcher) */
const SX = [SHOULDER_X - DW / 2, DW - 1 - SHOULDER_X - DW / 2];
const SY = SHOULDER_Y - DH / 2;
/** Летающие боссы висят на 3 px выше своей точки */
const HOVER = 3;

const idle = (side: number, t: number) => ({ x: SIDE[side] * 26, y: 34 + Math.sin(t * 1.7 + side * 2) * 3 });

function rig(e: Enemy): Rig {
  let r = RIGS.get(e);
  if (!r) {
    const mk = (side: number): Arm => {
      const p = idle(side, 0);
      return { x: p.x, y: p.y, wx: p.x, wy: p.y, open: false, ui: 0, fi: 0, hx: e.x, hy: e.y };
    };
    r = { arms: [mk(0), mk(1)] };
    RIGS.set(e, r);
    solve(e, r.arms[0], 0);
    solve(e, r.arms[1], 1);
  }
  return r;
}

/** Шарнир руки в мире */
function shoulder(e: Enemy, side: number) {
  return { x: e.x + SX[side], y: e.y + SY - HOVER };
}

/** Задать на этот шаг цель ладони в мировых координатах */
export function reach(e: Enemy, side: number, wx: number, wy: number, open = true) {
  const a = rig(e).arms[side];
  const s = shoulder(e, side);
  a.wx = wx - s.x;
  a.wy = wy - s.y;
  a.open = open;
}

/** Направить руку на точку (ладонь на вытянутой руке в её сторону) */
export function point(e: Enemy, side: number, wx: number, wy: number, open = true, ext = 0.92) {
  const s = shoulder(e, side);
  const a = Math.atan2(wy - s.y, wx - s.x);
  const L = (ARM_UPPER + ARM_FORE) * ext;
  reach(e, side, s.x + Math.cos(a) * L, s.y + Math.sin(a) * L, open);
}

/** Ладонь в мире (откуда стрелять) */
export function hand(e: Enemy, side: number) {
  const a = rig(e).arms[side];
  return { x: a.hx, y: a.hy };
}

/** Сдвинуть руки к целям и вернуть цели в покой на следующий шаг */
export function stepArms(e: Enemy, g: Game, dt: number) {
  const r = rig(e);
  r.arms.forEach((a, side) => {
    const k = Math.min(1, dt * 9);
    a.x += (a.wx - a.x) * k;
    a.y += (a.wy - a.y) * k;
    solve(e, a, side);
    const p = idle(side, g.time);
    a.wx = p.x;
    a.wy = p.y;
    a.open = false;
  });
}

/** Двухзвенная обратная кинематика с квантованием углов под нарисованные спрайты */
function solve(e: Enemy, a: Arm, side: number) {
  const L1 = ARM_UPPER, L2 = ARM_FORE;
  let d = Math.hypot(a.x, a.y);
  const base = Math.atan2(a.y, a.x);
  d = Math.max(10, Math.min(L1 + L2 - 0.5, d));
  const cos = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const off = Math.acos(Math.max(-1, Math.min(1, cos)));
  // из двух решений берём то, где локоть дальше от корпуса
  let best = base + off;
  if (SIDE[side] * Math.cos(base - off) > SIDE[side] * Math.cos(base + off)) best = base - off;
  a.ui = armIndex(best);
  const ua = armAngle(a.ui);
  const ex = Math.cos(ua) * L1, ey = Math.sin(ua) * L1;
  const tx = Math.cos(base) * d, ty = Math.sin(base) * d;
  a.fi = armIndex(Math.atan2(ty - ey, tx - ex));
  const fa = armAngle(a.fi);
  const s = shoulder(e, side);
  a.hx = s.x + ex + Math.cos(fa) * L2;
  a.hy = s.y + ey + Math.sin(fa) * L2;
}

let BODY: Sprite[][] | null = null;
let CAPS: Sprite[] | null = null;

/** Злой вид: последние фазы; при входе в первую злую фазу — мерцание между видами */
function angry(e: Enemy, g: Game) {
  if (e.phase < 3) return false;
  if (e.phase === 3 && (e.mem.invuln ?? 0) > 0) return Math.floor(g.time * 14) % 2 === 0;
  return true;
}

/**
 * Отрисовка корпуса, рук и наплечников. x, y — левый верхний угол корпуса на экране.
 * fx — преобразование спрайта (вспышка попадания).
 */
export function drawDispatcher(e: Enemy, g: Game, ctx: CanvasRenderingContext2D, x: number, y: number, fx: (s: Sprite) => Sprite) {
  BODY ??= [dispatcherBody(false), dispatcherBody(true)];
  CAPS ??= [dispatcherCaps(false), dispatcherCaps(true)];
  const A = angry(e, g);
  const m = A ? 1 : 0;
  const frames = BODY[m];
  const fi = 1 + (Math.floor(g.time * 8 + e.id) % (frames.length - 1));
  ctx.drawImage(fx(frames[fi]), x, y);
  const r = rig(e);
  r.arms.forEach((a, side) => {
    const sx = x + DW / 2 + SX[side];
    const sy = y + SHOULDER_Y;
    const ua = armAngle(a.ui);
    const ex = Math.round(sx + Math.cos(ua) * ARM_UPPER), ey = Math.round(sy + Math.sin(ua) * ARM_UPPER);
    ctx.drawImage(fx(upperArmSprite(a.ui, A)), sx - UPPER_HALF, sy - UPPER_HALF);
    ctx.drawImage(fx(foreArmSprite(a.fi, a.open, A)), ex - FORE_HALF, ey - FORE_HALF);
  });
  ctx.drawImage(fx(CAPS[m]), x, y);
}
