import type { Tier } from '../content/floors';
import type { RNG } from '../core/rng';

/**
 * Роли комнат уровня (этап 13). Всё, что зависит от роли при генерации, задаётся данными здесь,
 * чтобы новые комнаты и активности добавлялись без переделки генератора.
 */
export type Role =
  | 'start' // вход на уровень
  | 'exit' // арена босса / мини-босса в конце уровня
  | 'surgery' // операционная — обязательна на каждом уровне
  | 'combat' // отряд врагов
  | 'ambush' // засада: враги появляются, когда игрок внутри; двери запираются
  | 'elite' // усиленный отряд, двери запираются, гарантированный предмет набора
  | 'cache' // схрон: взлом удержанием R, выбор 1 из 2 модулей
  | 'shaft' // сервисная шахта: испытание на уклонение
  | 'market' // барахолка сбойных
  | 'miniboss' // мини-босс на локации (кто — content/minibosses.ts, этап 14а)
  | 'jammer'; // комната-укрытие с глушилкой: розыск не растёт и снижается (этап 14а)

export interface RoleDef {
  id: Role;
  /** Размер комнаты в тайлах вместе со стенами: [мин, макс] */
  w: [number, number];
  h: [number, number];
  /** Ставится в тупик ветки */
  leaf: boolean;
  /** Двери запираются, пока в комнате живы враги */
  locks: boolean;
}

// Размер экрана — 24×13,5 тайла. Арена босса 30×18 — как комната версии 1, под неё сделаны боссы.
export const ROLES: Record<Role, RoleDef> = {
  start: { id: 'start', w: [16, 20], h: [12, 14], leaf: false, locks: false },
  exit: { id: 'exit', w: [30, 30], h: [18, 18], leaf: true, locks: true },
  surgery: { id: 'surgery', w: [14, 16], h: [10, 12], leaf: true, locks: false },
  combat: { id: 'combat', w: [18, 34], h: [12, 22], leaf: false, locks: false },
  ambush: { id: 'ambush', w: [16, 26], h: [12, 18], leaf: false, locks: true },
  elite: { id: 'elite', w: [22, 30], h: [14, 20], leaf: false, locks: true },
  cache: { id: 'cache', w: [12, 16], h: [10, 12], leaf: true, locks: false },
  shaft: { id: 'shaft', w: [34, 44], h: [9, 11], leaf: true, locks: false },
  market: { id: 'market', w: [16, 20], h: [11, 14], leaf: true, locks: false },
  miniboss: { id: 'miniboss', w: [30, 30], h: [18, 18], leaf: true, locks: true },
  jammer: { id: 'jammer', w: [14, 18], h: [10, 12], leaf: true, locks: false },
};

/** Боевые роли: в них отряды и препятствия */
export const BATTLE: ReadonlySet<Role> = new Set<Role>(['combat', 'ambush', 'elite', 'miniboss']);

/**
 * Параметры уровня по ярусу. Цель — забег 1–2 часа (решение Эрика). Оценка по генератору: при этих числах
 * ~85 боевых комнат за забег (~65 клеток площади версии 1), бои ~45–55 мин + боссы, особые комнаты и коридоры;
 * Чистильщики (14б) добавят ещё. Уточняется плейтестом: время уровней видно в паузе
 */
export interface TierGen {
  /** Сколько комнат на уровне (всего, вместе с особыми) */
  rooms: [number, number];
  /** Минимум обычных боевых комнат (бой + засада) */
  minFill: number;
  /** Веса обычных комнат */
  fill: Partial<Record<Role, number>>;
  /** Сколько петель с гермодверью */
  loops: [number, number];
}

export const TIER_GEN: Record<Tier, TierGen> = {
  sump: { rooms: [10, 12], minFill: 4, fill: { combat: 4, ambush: 1 }, loops: [1, 1] },
  foundry: { rooms: [13, 16], minFill: 6, fill: { combat: 4, ambush: 1 }, loops: [1, 2] },
  hab: { rooms: [16, 19], minFill: 8, fill: { combat: 3, ambush: 2 }, loops: [1, 2] },
  transit: { rooms: [19, 23], minFill: 10, fill: { combat: 4, ambush: 1.5 }, loops: [1, 2] },
  spire: { rooms: [9, 11], minFill: 4, fill: { combat: 4, ambush: 1 }, loops: [1, 1] },
};

/** Шанс мини-босса на локации (уровни 1–8, с 14а и на 1-м — Страж). Эрик: «по весам» — подстраивается здесь */
export const MINIBOSS_CHANCE = 0.35;

/** Шанс комнаты-укрытия с глушилкой (уровни 1–8) */
export const JAMMER_CHANCE = 0.8;

/**
 * Особые комнаты уровня (кроме старта и выхода) по решениям Эрика:
 * операционная — всегда; схронов 1–2 (на больших уровнях до 3); элита со 2-го уровня 50%, с 5-го — всегда;
 * сервисная шахта 60%; барахолка — на каждом уровне со 2-го; мини-босс на локации — по шансу.
 */
export function specialRoles(floor: number, rooms: number, rng: RNG): Role[] {
  const out: Role[] = ['surgery'];
  const caches = rooms >= 14 ? rng.int(1, 3) : rng.int(1, 2);
  for (let i = 0; i < caches; i++) out.push('cache');
  if (floor >= 5 || (floor >= 2 && rng.chance(0.5))) out.push('elite');
  if (rng.chance(0.6)) out.push('shaft');
  if (floor >= 2) out.push('market');
  if (floor <= 8 && rng.chance(MINIBOSS_CHANCE)) out.push('miniboss');
  // глушилка (14а, Эрик): ~1 на уровень, кроме Шпиля
  if (floor <= 8 && rng.chance(JAMMER_CHANCE)) out.push('jammer');
  return out;
}
