import type { L } from '../core/i18n';
import { settings } from '../core/storage';
import { C } from '../gfx/palette';
import type { Game } from './game';
import { ITEMS, item } from './items';
import { LOG } from './log';
import type { Player } from './player';

// Нестабильность (этап 12): предметы врагов III–IV и детали Чистильщиков несовместимы с телом.
// Сумма их очков даёт уровень 1–4. Каждый раз при потере жизни один случайный нестабильный
// предмет проверяет таблицу и отключается на время, до конца боя или до конца уровня.
// На уровнях 3–4 — помехи интерфейса (выключаются в настройках) и случайные бонусы.

export type DisableMode = 'timed' | 'combat' | 'level';

export interface Disable {
  mode: DisableMode;
  /** timed — сколько осталось (с); combat — сколько осталось после конца боя (с) */
  t: number;
}

/** После конца боя «боевое» отключение держится ещё столько секунд */
export const COMBAT_GRACE = 5;

/** Уровень по сумме очков: 1–2 → 1, 3–4 → 2, 5–6 → 3, 7+ → 4 */
export function unstableLevel(points: number): 0 | 1 | 2 | 3 | 4 {
  if (points <= 0) return 0;
  return Math.min(4, Math.ceil(points / 2)) as 1 | 2 | 3 | 4;
}

interface Row {
  p: number;
  mode: DisableMode;
  /** Длительность для timed: [от, до] */
  t?: [number, number];
}

/** Таблица срабатывания из заметки «Механики#Нестабильность» */
export const DISABLE_TABLE: Record<1 | 2 | 3 | 4, Row[]> = {
  4: [{ p: 0.5, mode: 'timed', t: [10, 20] }, { p: 0.3, mode: 'combat' }, { p: 0.2, mode: 'level' }],
  3: [{ p: 0.7, mode: 'timed', t: [15, 15] }, { p: 0.25, mode: 'combat' }, { p: 0.05, mode: 'level' }],
  2: [{ p: 0.9, mode: 'timed', t: [10, 10] }, { p: 0.1, mode: 'combat' }],
  1: [{ p: 1, mode: 'timed', t: [5, 5] }],
};

export function rollDisable(level: 1 | 2 | 3 | 4, rnd: () => number): Disable {
  let r = rnd();
  for (const row of DISABLE_TABLE[level]) {
    if (r < row.p || row === DISABLE_TABLE[level].at(-1)) {
      if (row.mode === 'timed') {
        const [a, b] = row.t!;
        return { mode: 'timed', t: a + (b - a) * rnd() };
      }
      return { mode: row.mode, t: COMBAT_GRACE };
    }
    r -= row.p;
  }
  return { mode: 'timed', t: 5 };
}

/** Надетые предметы (оружие, модули, прошивки), включая отключённые */
export function equippedIds(p: Player): string[] {
  return [...new Set([p.weapon.id, ...p.installed, ...p.passives.keys()])];
}

export function unstablePoints(p: Player): number {
  let n = 0;
  for (const id of equippedIds(p)) n += ITEMS.get(id)?.unstable ?? 0;
  return n;
}

export function playerUnstableLevel(p: Player) {
  return unstableLevel(unstablePoints(p));
}

/** Состояние помех и бонусов на один забег */
export class UnstableState {
  /** До следующего случайного бонуса (с) */
  bonusT = 30;
  /** Двойной залп ещё столько секунд */
  doubleT = 0;
  /** Помеха интерфейса: сколько ещё длится и когда следующая */
  hudGlitch = 0;
  hudNext = 8;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function howLabel(d: Disable): L {
  if (d.mode === 'timed') return { ru: `на ${Math.round(d.t)} с`, en: `for ${Math.round(d.t)} s` };
  if (d.mode === 'combat') return { ru: 'до конца боя', en: 'until the fight ends' };
  return { ru: 'до конца уровня', en: 'until the end of the level' };
}

/** Потеря жизни: проверка одного случайного нестабильного предмета */
export function onLifeLost(g: Game) {
  const p = g.player;
  const level = playerUnstableLevel(p);
  if (!level) return;
  const pool = equippedIds(p).filter((id) => ITEMS.get(id)?.unstable && !p.disabled.has(id));
  if (!pool.length) return;
  const id = pool[Math.floor(Math.random() * pool.length)];
  const d = rollDisable(level, Math.random);
  p.disabled.set(id, d);
  p.recalc();
  g.log(LOG.unstableOff(item(id).name, howLabel(d)));
  g.fx.burst(p.x, p.y - 4, C.violet, 10, 60, 0.4, 1, true);
}

/** Новый уровень: снимаются отключения «до конца уровня» */
export function onFloorStart(g: Game) {
  const p = g.player;
  let changed = false;
  for (const [id, d] of p.disabled) if (d.mode === 'level') {
    p.disabled.delete(id);
    changed = true;
  }
  if (changed) p.recalc();
}

export function updateInstability(g: Game, dt: number) {
  const p = g.player;
  const st = g.unstable;
  const fight = g.inCombat();
  let changed = false;
  for (const [id, d] of p.disabled) {
    if (d.mode === 'level') continue;
    if (d.mode === 'combat' && fight) d.t = COMBAT_GRACE;
    else d.t -= dt;
    if (d.t <= 0) {
      p.disabled.delete(id);
      changed = true;
    }
  }
  if (changed) p.recalc();
  // отключённая деталь искрит на спрайте
  if (p.disabled.size && Math.random() < dt * 5) {
    g.fx.add({ kind: 'spark', x: p.x + rand(-5, 5), y: p.y + rand(-10, 2), vx: rand(-30, 30), vy: rand(-40, -10), color: Math.random() < 0.5 ? C.violet : C.yellow, life: 0.2, glow: true });
  }
  st.doubleT = Math.max(0, st.doubleT - dt);
  st.hudGlitch = Math.max(0, st.hudGlitch - dt);
  const level = playerUnstableLevel(p);
  if (level < 3) return;
  // случайные бонусы — только в бою
  if (fight) {
    st.bonusT -= dt;
    if (st.bonusT <= 0) {
      st.bonusT = level >= 4 ? rand(18, 35) : rand(25, 45);
      if (Math.random() < 0.5) {
        st.doubleT = 4;
        g.log(LOG.unstableDouble);
      } else if (p.glitchT <= 0) {
        p.glitch = Math.min(1, p.glitch + (level >= 4 ? 1 : 0.5));
        g.log(LOG.unstableCharge);
      }
    }
  }
  // помехи интерфейса: короткие, без тряски
  if (settings.instabilityFx) {
    st.hudNext -= dt;
    if (st.hudNext <= 0) {
      st.hudNext = level >= 4 ? rand(3, 6) : rand(6, 10);
      st.hudGlitch = rand(0.12, 0.2);
    }
  }
}
