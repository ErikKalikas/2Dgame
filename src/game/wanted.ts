import type { L } from '../core/i18n';
import { C } from '../gfx/palette';
import type { Enemy } from './enemy';
import type { Game } from './game';
import { isFlank } from './status';

// Розыск 0–5 (этап 14а, Механики#Розыск). Растёт со временем на уровне, от шума и убийств;
// падает в глушилке, от взлома камер и тихих убийств в спину. От уровня зависит, кого присылает
// Диспетчер (director.ts) и насколько сильнее отряды в новых комнатах (spawn.ts).

export const WANTED_MAX = 5;
/** Тихо, только время: +1 ступень за 2 мин */
export const HEAT_TIME = 1 / 120;
/** Стрельба: за секунду, пока игрок стреляет (не ближний бой) */
export const HEAT_SHOOT = 0.006;
/** Сколько секунд после выстрела считается «стреляет» */
const SHOOT_WINDOW = 0.3;
/** Убийство: база + за класс ценности врага */
export const HEAT_KILL = 0.012;
export const HEAT_KILL_VALUE = 0.006;
/** Тихое убийство в спину: не шумит и снижает розыск */
export const HEAT_QUIET_KILL = -0.05;
/** Разовый шум по видам */
export const NOISE = {
  explosion: 0.025,
  glitch: 0.15,
  crate: 0.015,
  /** Шумный взлом (схрон с тревогой — этап 13.5 брата) */
  hack: 0.2,
  /** Камера заметила игрока */
  camera: 0.5,
  /** Камеру сбили выстрелом */
  cameraShot: 0.15,
} as const;
export type NoiseKind = keyof typeof NOISE;
/** Взрывы шумят не больше этого в секунду (взрывные сборки иначе сразу дают 5) */
const EXPLOSION_CAP = 0.03;
/** На новом уровне розыск падает на столько ступеней */
export const FLOOR_DROP = 2;
/** Отряд в новой комнате больше на эту долю за ступень (spawn.ts; состав отрядов — этап 13 брата) */
export const WANTED_SQUAD = 0.1;
/** После победы над Чистильщиком */
export const AFTER_CLEANER = 2;

export class WantedState {
  /** Шкала: целая часть — ступень 0–5, дробная — прогресс до следующей */
  heat = 0;
  /** Ступень, о которой уже сообщили (для лога и мигания) */
  shown = 0;
  /** Мигание шкалы после роста (с) */
  blink = 0;
  /** Игрок стрелял недавно (с) */
  shootT = 0;
  /** Шум от взрывов за текущую секунду */
  explosionBudget = EXPLOSION_CAP;
  explosionT = 0;
  /** Чистильщик уровня: вызван / побеждён (этап 14б брата — через shouldSpawnCleaner) */
  cleanerOut = false;
  cleanerDone = false;
  /** Комнаты, отряд которых уже поднял тревогу (стрелял); враги коридора — по одному */
  alertRooms = new Set<number>();
  alertFoes = new WeakSet<Enemy>();
  /** Комнаты-укрытия с глушилкой: ступень снижается, рост остановлен (cameras.ts) */
  jammed = false;
}

/** Ступень розыска 0–5 */
export function wantedLevel(g: Game): number {
  return Math.min(WANTED_MAX, Math.floor(g.wanted.heat));
}

/** Изменить шкалу (не ниже 0, не выше 5) и сообщить о смене ступени */
export function addHeat(g: Game, amount: number) {
  const w = g.wanted;
  if (amount > 0) {
    // глушилка и «Охота» (синергия гончей: 2 с после убийства) — рост остановлен
    if (w.jammed || g.time < (g.mem.huntQuiet ?? -1)) return;
    amount *= g.player.stats.heatMult;
  }
  w.heat = Math.max(0, Math.min(WANTED_MAX, w.heat + amount));
  syncLevel(g);
}

/** Шум разового события (взрыв, сбой, ящик, камера, шумный взлом) */
export function noise(g: Game, kind: NoiseKind) {
  const w = g.wanted;
  let a: number = NOISE[kind];
  if (kind === 'explosion') {
    a = Math.min(a, w.explosionBudget);
    w.explosionBudget -= a;
    if (a <= 0) return;
  }
  addHeat(g, a);
}

/** Игрок выстрелил (не ближний бой): шум, пока длится стрельба */
export function noteShot(g: Game) {
  g.wanted.shootT = SHOOT_WINDOW;
}

/** Враг начал стрелять: его отряд (комната) поднял тревогу — убийства в нём уже не тихие */
export function markAlert(g: Game, e: Enemy) {
  const w = g.wanted;
  if (e.home >= 0) w.alertRooms.add(e.home);
  else w.alertFoes.add(e);
}

function alerted(g: Game, e: Enemy): boolean {
  const w = g.wanted;
  return e.home >= 0 ? w.alertRooms.has(e.home) : w.alertFoes.has(e);
}

/**
 * Тихое убийство: игрок добил врага сбоку или со спины, пока отряд ещё не в бою (никто из него
 * не стрелял). Взрывы и союзники тихими не считаются
 */
export function isQuietKill(g: Game, e: Enemy): boolean {
  const h = e.lastHit;
  if (!h || h.by !== 'player' || h.source === 'explosion' || h.source === 'ally') return false;
  return !alerted(g, e) && isFlank(e, g.player.x, g.player.y);
}

/** Убийство врага игроком (из Game.killEnemy, с наградой) */
export function wantedKill(g: Game, e: Enemy) {
  if (isQuietKill(g, e)) {
    addHeat(g, HEAT_QUIET_KILL);
    g.fx.ring(e.x, e.y, C.steelL, 10, 0.3);
    return;
  }
  addHeat(g, HEAT_KILL + HEAT_KILL_VALUE * (e.def.value ?? 1));
}

export function updateWanted(g: Game, dt: number) {
  const w = g.wanted;
  w.blink = Math.max(0, w.blink - dt);
  w.explosionT += dt;
  if (w.explosionT >= 1) {
    w.explosionT -= 1;
    w.explosionBudget = EXPLOSION_CAP;
  }
  if (w.jammed) return;
  let rate = HEAT_TIME;
  if (w.shootT > 0) {
    w.shootT -= dt;
    rate += HEAT_SHOOT;
  }
  addHeat(g, rate * dt);
}

/** Сообщить о смене ступени: строка лога, мигание шкалы */
function syncLevel(g: Game) {
  const w = g.wanted;
  const lvl = wantedLevel(g);
  if (lvl === w.shown) return;
  if (lvl > w.shown) {
    w.blink = 2;
    g.log(WANTED_LOG.up(lvl));
  } else g.log(WANTED_LOG.down(lvl));
  w.shown = lvl;
}

/** Новый уровень: розыск −2, Чистильщик уровня снова может прийти, тревоги забыты */
export function wantedFloorStart(g: Game, first: boolean) {
  const w = g.wanted;
  w.alertRooms.clear();
  w.alertFoes = new WeakSet();
  w.cleanerOut = w.cleanerDone = false;
  w.jammed = false;
  w.shootT = 0;
  if (first) return;
  w.heat = Math.max(0, Math.floor(w.heat) - FLOOR_DROP);
  // о снижении между уровнями не пишем: строка уровня и так идёт в лог
  w.shown = wantedLevel(g);
}

// ---------------------------------------------------------------- Чистильщик (этап 14б, брат)

/** Пора вызвать Чистильщика: розыск 5, на этом уровне он ещё не приходил */
export function shouldSpawnCleaner(g: Game): boolean {
  const w = g.wanted;
  return wantedLevel(g) >= WANTED_MAX && !w.cleanerOut && !w.cleanerDone;
}

/** Чистильщик вышел на охоту (зовёт код Чистильщиков) */
export function cleanerSpawned(g: Game) {
  g.wanted.cleanerOut = true;
}

/** Чистильщик побеждён: розыск падает до 2; на этом уровне больше не придёт */
export function cleanerDefeated(g: Game) {
  const w = g.wanted;
  w.cleanerOut = false;
  w.cleanerDone = true;
  w.heat = AFTER_CLEANER;
  syncLevel(g);
}

// ---------------------------------------------------------------- строки лога

const UP: L[] = [
  { ru: '', en: '' },
  { ru: 'Розыск 1: Т-417 в розыске. Патрули оповещены.', en: 'Wanted 1: T-417 flagged. Patrols notified.' },
  { ru: 'Розыск 2: направлены усиленные отряды.', en: 'Wanted 2: reinforced squads dispatched.' },
  { ru: 'Розыск 3: тяжёлая охрана, развёртывание турелей.', en: 'Wanted 3: heavy guard, turrets deploying.' },
  { ru: 'Розыск 4: выпущены дроны-охотники.', en: 'Wanted 4: hunter drones released.' },
  { ru: 'Розыск 5: вызван Чистильщик.', en: 'Wanted 5: a Cleaner has been called.' },
];

export const WANTED_LOG = {
  up: (lvl: number): L => UP[lvl],
  down: (lvl: number): L => ({ ru: `Розыск снижен до ${lvl}. Сигнал Т-417 нестабилен.`, en: `Wanted lowered to ${lvl}. T-417 signal unstable.` }),
};
