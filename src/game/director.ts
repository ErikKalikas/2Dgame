import { TILE, VIEW_H, VIEW_W } from '../config';
import type { L } from '../core/i18n';
import { dist2 } from '../core/math';
import { ENEMIES, ENEMY_BY_ID } from '../content/enemies';
import { C } from '../gfx/palette';
import type { Role } from '../world/roles';
import { walkable } from '../world/tiles';
import { Enemy, type EnemyDef } from './enemy';
import type { Game } from './game';
import { wantedLevel } from './wanted';
import { MINIBOSS_BY_FLOOR, bossDef } from '../content/minibosses';
import { spawnBoss } from './spawn';

// Диспетчер-режиссёр (этап 14а, решение Эрика 16): по ступени розыска присылает к Т-417 волны
// подкреплений через коридоры: 0–1 патруль → 2 усиленный отряд → 3 тяжёлая охрана и турель →
// 4–5 дроны-охотники (на 5 ещё Чистильщик — этап 14б брата, wanted.shouldSpawnCleaner).
// Волна приходит раз в 40–60 с и только после передышки: 20 с без боя. В укрытиях не приходит.

/** Интервал между волнами по ступени розыска (с) */
export const WAVE_EVERY = [60, 55, 50, 45, 40, 40];
/** Передышка после боя, прежде чем придёт волна (с) */
export const WAVE_CALM = 20;
/** Первые секунды уровня — без волн */
const FLOOR_GRACE = 30;
/** Больше стольких живых врагов из волн — новая не приходит */
const WAVE_CAP = 8;
/** Откуда идёт волна: путь до игрока в тайлах и расстояние по прямой (px) */
const PATH_MIN = 14, PATH_MAX = 26;
const DIST_MIN = 180, DIST_MAX = 380;
/** Комнаты, где волн нет */
const SAFE: ReadonlySet<Role> = new Set<Role>(['surgery', 'jammer', 'exit']);
/** Шанс мини-босса вместо волны охотников (раз за уровень) и где он может появиться */
export const MINIBOSS_WAVE_CHANCE = 0.3;
const MINIBOSS_ROOMS: ReadonlySet<Role> = new Set<Role>(['combat', 'ambush', 'elite']);
/** Дрон-охотник: прочнее обычного дрона и идёт по следу через коридоры */
export const HUNTER_HP = 1.6;

export type WaveKind = 'patrol' | 'squad' | 'heavy' | 'hunters';

export class DirectorState {
  waveT = WAVE_EVERY[0];
  /** Сколько секунд без боя */
  calm = 0;
  /** Сколько волн пришло на уровне */
  waves = 0;
  /** Мини-босс в волне уже приходил на этом уровне (14а.4) */
  minibossSent = false;
}

export function directorFloorStart(g: Game) {
  const d = g.director;
  d.waveT = WAVE_EVERY[wantedLevel(g)];
  d.calm = 0;
  d.waves = 0;
  d.minibossSent = false;
}

export function waveKind(lvl: number): WaveKind {
  return lvl <= 1 ? 'patrol' : lvl === 2 ? 'squad' : lvl === 3 ? 'heavy' : 'hunters';
}

/** Игрок в укрытии (операционная, глушилка, арена босса) или в запертой комнате — волн нет */
function sheltered(g: Game): boolean {
  return (!!g.zone && SAFE.has(g.zone.role)) || g.locked;
}

export function updateDirector(g: Game, dt: number) {
  const d = g.director;
  if (g.state !== 'play') return;
  if (g.inCombat()) d.calm = 0;
  else d.calm += dt;
  if ((g.levelTimes[g.floorNum - 1] ?? 0) < FLOOR_GRACE || sheltered(g) || d.calm === 0) return;
  d.waveT -= dt;
  if (d.waveT > 0 || d.calm < WAVE_CALM) return;
  const lvl = wantedLevel(g);
  d.waveT = WAVE_EVERY[lvl];
  if (g.enemies.filter((e) => e.wave && !e.dead).length >= WAVE_CAP) return;
  sendWave(g, waveKind(lvl));
}

/** Точка, откуда придёт волна: за краем экрана, по пути 14–26 тайлов, лучше в коридоре */
export function waveOrigin(g: Game): { x: number; y: number } | null {
  const { tw, th } = g.room;
  const dist = g.flow.dist;
  const p = g.player;
  const corridor: number[] = [], rooms: number[] = [];
  for (let i = 0; i < tw * th; i++) {
    const d = dist[i];
    if (d < PATH_MIN || d > PATH_MAX || !walkable(g.room.tiles[i])) continue;
    const x = (i % tw + 0.5) * TILE, y = (Math.floor(i / tw) + 0.5) * TILE;
    const d2 = dist2(x, y, p.x, p.y);
    if (d2 < DIST_MIN * DIST_MIN || d2 > DIST_MAX * DIST_MAX) continue;
    // за краем экрана (с запасом), чтобы враги не возникали на глазах
    if (x > g.camX - 16 && x < g.camX + VIEW_W + 16 && y > g.camY - 16 && y < g.camY + VIEW_H + 16) continue;
    const ri = g.room.roomIdx[i];
    if (ri < 0) corridor.push(i);
    else if (!SAFE.has(g.plan.rooms[ri].role) && g.plan.rooms[ri].role !== 'start') rooms.push(i);
  }
  const list = corridor.length ? corridor : rooms;
  if (!list.length) return null;
  const i = g.rng.pick(list);
  return { x: (i % tw + 0.5) * TILE, y: (Math.floor(i / tw) + 0.5) * TILE };
}

/** Состав волны по бюджету (стоимость врагов) из тех, кто уже «дошёл» до этого уровня */
function roster(g: Game, budget: number, weight: (d: EnemyDef) => number): EnemyDef[] {
  const pool = ENEMIES.filter((e) => e.minFloor <= g.floorNum && e.speed > 0 && weight(e) > 0);
  const out: EnemyDef[] = [];
  let guard = 0;
  while (budget > 0 && guard++ < 40 && out.length < 7) {
    const def = g.rng.weighted(pool, (e) => e.weight * weight(e));
    if (def.cost > budget + 1) continue;
    out.push(def);
    budget -= def.cost;
  }
  return out;
}

const heavyish = (d: EnemyDef) => !!d.heavy || (d.value ?? 1) >= 3 || d.id === 'guard';

/** Прислать волну к игроку. Возвращает врагов волны (пусто — не нашлось места) */
export function sendWave(g: Game, kind: WaveKind): Enemy[] {
  // розыск 4–5: раз за уровень вместо волны может прийти мини-босс (в комнату игрока)
  if (kind === 'hunters' && !g.director.minibossSent && g.rng.chance(MINIBOSS_WAVE_CHANCE)) {
    const m = sendMiniboss(g);
    if (m.length) return m;
  }
  const at = waveOrigin(g);
  if (!at) return [];
  const f = g.floorNum, lvl = wantedLevel(g);
  let defs: EnemyDef[];
  const hunters: EnemyDef[] = [];
  switch (kind) {
    case 'patrol':
      defs = roster(g, 2 + f * 0.5 + lvl, (d) => (d.cost <= 2 ? 1 : 0));
      break;
    case 'squad':
      defs = roster(g, 3.5 + f * 0.9, () => 1);
      break;
    case 'heavy':
      defs = roster(g, 4.5 + f, (d) => (heavyish(d) ? 3 : 1));
      break;
    case 'hunters': {
      const drone = ENEMY_BY_ID.get('drone')!;
      const n = lvl >= 5 ? g.rng.int(3, 4) : g.rng.int(2, 3);
      for (let i = 0; i < n; i++) hunters.push(drone);
      defs = roster(g, (3 + f * 0.8) * (lvl >= 5 ? 1.3 : 1), () => 1);
      break;
    }
  }
  const out: Enemy[] = [];
  const add = (def: EnemyDef, hp: number) => {
    const e = new Enemy(def, at.x + g.rng.float(-14, 14), at.y + g.rng.float(-14, 14), g.hpMult * hp);
    e.wave = true;
    e.home = -2;
    e.spawn = 0.8 + out.length * 0.08;
    out.push(e);
    return e;
  };
  for (const d of defs) add(d, 1);
  for (const d of hunters) add(d, HUNTER_HP).hunter = true;
  const turret = kind === 'heavy' ? dropTurret(g) : null;
  if (turret) out.push(turret);
  g.enemies.push(...out);
  g.director.waves++;
  g.log(kind === 'heavy' && !turret ? WAVE_LOG.heavyNoTurret : WAVE_LOG[kind]);
  return out;
}

/**
 * Мини-босс уровня в комнату игрока: только в зачищенную боевую комнату не меньше 22×14 тайлов
 * (узоры мини-боссов рассчитаны на арену). Комната остаётся зачищенной — двери не запираются
 */
export function sendMiniboss(g: Game): Enemy[] {
  const z = g.zone, list = MINIBOSS_BY_FLOOR[g.floorNum];
  if (!z || !list || g.locked || !z.cleared || !MINIBOSS_ROOMS.has(z.role) || z.w < 22 || z.h < 14) return [];
  const c = g.room.roomCenter(z);
  const out = spawnBoss(g, bossDef(g.rng.pick(list)), z, c.x, g.player.y < c.y ? c.y + 40 : c.y - 40);
  for (const e of out) e.wave = true;
  g.director.minibossSent = true;
  g.director.waves++;
  g.log(WAVE_LOG.miniboss(out[0].def.name));
  return out;
}

/** Ступень 3: турель сбрасывают прямо в комнату игрока (с телеграфом), не ближе 90 px */
function dropTurret(g: Game): Enemy | null {
  const z = g.zone;
  if (!z || SAFE.has(z.role)) return null;
  const p = g.player;
  const pos = g.room.randomFloorPoint(g.rng, p.x, p.y, 90, false, z);
  if (dist2(pos.x, pos.y, p.x, p.y) < 80 * 80) return null;
  const e = new Enemy(ENEMY_BY_ID.get('turret')!, pos.x, pos.y, g.hpMult);
  e.wave = true;
  e.home = z.id;
  e.spawn = 1.2;
  g.fx.ring(pos.x, pos.y, C.red, 16, 1.2);
  return e;
}

/** Отметка дронов-охотников: красный огонёк над корпусом */
export function renderDirector(g: Game, ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  for (const e of g.enemies) {
    if (!e.hunter || e.dead || e.spawn > 0) continue;
    const x = Math.round(e.x - cx), y = Math.round(e.y - cy - e.r - 4);
    if (x < -8 || y < -8 || x > VIEW_W + 8 || y > VIEW_H + 8) continue;
    ctx.fillStyle = Math.floor(g.time * 6 + e.id) % 2 ? C.redL : C.red;
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
  }
}

export const WAVE_LOG = {
  patrol: { ru: 'Диспетчер: патруль направлен к Т-417.', en: 'Dispatcher: patrol sent to T-417.' },
  squad: { ru: 'Диспетчер: усиленный отряд направлен к Т-417.', en: 'Dispatcher: reinforced squad sent to T-417.' },
  heavy: { ru: 'Диспетчер: тяжёлая охрана выдвигается. Турель сброшена.', en: 'Dispatcher: heavy guard moving out. Turret dropped.' },
  heavyNoTurret: { ru: 'Диспетчер: тяжёлая охрана выдвигается.', en: 'Dispatcher: heavy guard moving out.' },
  hunters: { ru: 'Диспетчер: дроны-охотники идут по следу.', en: 'Dispatcher: hunter drones on your trail.' },
  miniboss: (name: L): L => ({ ru: `Диспетчер: в зону Т-417 направлен ${name.ru}.`, en: `Dispatcher: ${name.en} sent to T-417's zone.` }),
};
