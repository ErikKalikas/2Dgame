import { angleDiff, angleTo, dist2 } from '../core/math';
import type { Enemy } from './enemy';
import type { Game } from './game';

// Состояния врагов для предметов наборов (этап 12б): стаки, подброс, привод, фланг, ранги.

/** Лобовой сектор: попадание дальше этого угла от взгляда — сбоку или со спины (как щит Вахтёра) */
export const FRONT_ARC = 0.9;
/** Скорость поворота взгляда врага (рад/с) */
export const FACE_TURN = 4;

/** Мини-босс: плотность пуль (узоры через patterns.n) и перерывы между атаками (ai.every) */
export const MINIBOSS_DENSITY = 0.8;
export const MINIBOSS_PAUSE = 1.25;

/** Босс или мини-босс: контроль на них слабее или не действует */
export function bossLike(e: Enemy): boolean {
  return !!e.def.boss || e.miniboss;
}

/** Обычный враг: не босс, не мини-босс, не тяжёлый, не элита и класс I–II */
export function isNormal(e: Enemy): boolean {
  return !bossLike(e) && !e.def.heavy && !e.elite && (e.def.value ?? 1) <= 2;
}

/** Враг, по которому можно бить и целиться: живой, появился, видим, не союзник */
export function isFoe(e: Enemy): boolean {
  return !e.dead && e.spawn <= 0 && !e.hidden && e.team === 'foe';
}

/** Попадание из точки (x, y) пришлось сбоку или со спины */
export function isFlank(e: Enemy, x: number, y: number): boolean {
  if (e.exposedT > 0) return true;
  if (e.mem.face === undefined) return false;
  return Math.abs(angleDiff(e.mem.face, angleTo(e.x, e.y, x, y))) > FRONT_ARC;
}

// ---------------------------------------------------------------- стаки

/** Цвета стаков, которые видны над врагом огоньками (ключ → цвет); предметы регистрируют свои */
export const STACK_COLOR = new Map<string, string>();
/** Стаки, с которыми враг виден в темноте (отметка дрона-корректировщика) */
export const STACK_LIT = new Set<string>();
/** Стаки-приоритеты: самонаведение ищет врага с таким стаком (пеленг) */
export const STACK_SEEK = new Set<string>();
/** Стаки-уязвимости: враг с таким стаком получает больше урона (ключ → +доля) */
export const STACK_VULN = new Map<string, number>();

/** Добавить n стаков (не больше max), таймер обновляется. Возвращает новое число */
export function addStack(e: Enemy, key: string, n: number, max: number, dur: number): number {
  const s = e.stacks.get(key);
  const v = Math.min(max, (s?.n ?? 0) + n);
  e.stacks.set(key, { n: v, t: dur });
  return v;
}

export function stackCount(e: Enemy, key: string): number {
  return e.stacks.get(key)?.n ?? 0;
}

/** Снять n стаков (по умолчанию все). Возвращает, сколько снято */
export function takeStacks(e: Enemy, key: string, n = Infinity): number {
  const s = e.stacks.get(key);
  if (!s) return 0;
  const k = Math.min(s.n, n);
  s.n -= k;
  if (s.n <= 0) e.stacks.delete(key);
  return k;
}

/** Ход таймеров стаков */
export function tickStacks(e: Enemy, dt: number) {
  if (!e.stacks.size) return;
  for (const [k, s] of e.stacks) {
    s.t -= dt;
    if (s.t <= 0 || s.n <= 0) e.stacks.delete(k);
  }
}

/** Ближайший к врагу другой враг в радиусе (для переноса стаков) */
export function nearestOther(g: Game, from: Enemy, radius: number, filter?: (e: Enemy) => boolean): Enemy | null {
  let best: Enemy | null = null, bd = radius * radius;
  for (const e of g.enemies) {
    if (e === from || !isFoe(e) || (filter && !filter(e))) continue;
    const d = dist2(from.x, from.y, e.x, e.y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/**
 * Перенос стаков с погибшего (или любого) врага на ближайшего в радиусе: k — доля переносимых
 * (блохи — все, замедление «Блошиного цирка» — половина), max — предел на новом носителе
 */
export function transferStacks(g: Game, from: Enemy, key: string, radius: number, max: number, dur: number, k = 1, filter?: (e: Enemy) => boolean): Enemy | null {
  const n = Math.floor(stackCount(from, key) * k);
  if (n <= 0) return null;
  const to = nearestOther(g, from, radius, filter);
  if (!to) return null;
  addStack(to, key, n, max, dur);
  return to;
}

// ---------------------------------------------------------------- привод и подброс

/**
 * Повреждённый привод: скорость движения и поворота ниже на k (не больше предела), на dur секунд.
 * Боссы и мини-боссы получают вдвое меньше (предел передаётся отдельно)
 */
export function crippleDrive(e: Enemy, k: number, dur: number, cap: number) {
  e.driveK = Math.min(cap, (e.driveT > 0 ? e.driveK : 0) + k);
  e.driveT = dur;
}

/** Подбросить врага на dur секунд; onLand получает урон, набранный в воздухе */
export function tossEnemy(g: Game, e: Enemy, dur: number, onLand?: (e: Enemy, acc: number) => void, h = 26) {
  if (e.toss || e.dead) return;
  e.toss = { t: 0, dur, h, acc: 0, onLand };
  e.kx = e.ky = 0;
  g.fx.burst(e.x, e.y, '#8c8c9a', 6, 50, 0.3);
}

/** Высота подброшенного врага над полом (px) */
export function tossHeight(e: Enemy): number {
  if (!e.toss) return 0;
  return Math.sin(Math.min(1, e.toss.t / e.toss.dur) * Math.PI) * e.toss.h;
}

/** Ход подброса; true — враг ещё в воздухе (ИИ не действует) */
export function updateToss(g: Game, e: Enemy, dt: number): boolean {
  const t = e.toss;
  if (!t) return false;
  t.t += dt;
  if (t.t < t.dur) return true;
  e.toss = null;
  g.fx.ring(e.x, e.y, '#8c8c9a', 14, 0.25);
  t.onLand?.(e, t.acc);
  return false;
}
