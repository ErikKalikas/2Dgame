import { tr, type L } from '../core/i18n';
import type { Enemy } from './enemy';
import type { DamageOpts } from './combat';
import type { Game } from './game';

// Патчи Диспетчера (этап 14а, Механики#Патчи Диспетчера; список утверждён Эриком). После босса яруса
// Диспетчер выпускает «обновление протокола» против самого частого стиля игрока за ярус: мягко,
// −30–35%, не иммунитет. Действуют на обычных врагов и мини-боссов, не на боссов ярусов. Патчи
// не повторяются; за забег их 4. Список действующих — в паузе.

export type Style = 'fire' | 'explosion' | 'melee' | 'dash' | 'ally' | 'flank' | 'glitch' | 'shot';

export interface PatchDef {
  style: Style;
  name: L;
  desc: L;
  /** Кратко — для строки лога (полностью — в паузе) */
  short: L;
}

/** Порядок — номер патча в версии протокола (N.M: M = индекс + 1) */
export const PATCHES: PatchDef[] = [
  { style: 'fire', name: { ru: 'Огнеупорная обшивка', en: 'Fireproof Plating' }, desc: { ru: 'урон огнём −35%, поджог короче', en: 'fire damage −35%, shorter burns' }, short: { ru: 'огонь −35%', en: 'fire −35%' } },
  { style: 'explosion', name: { ru: 'Разнесение строя', en: 'Spread Formation' }, desc: { ru: 'урон взрывами −35%', en: 'explosion damage −35%' }, short: { ru: 'взрывы −35%', en: 'explosions −35%' } },
  { style: 'melee', name: { ru: 'Шоковая броня', en: 'Shock Armor' }, desc: { ru: 'урон вплотную −35%', en: 'close-range damage −35%' }, short: { ru: 'вплотную −35%', en: 'close range −35%' } },
  { style: 'dash', name: { ru: 'Ловушки на траекториях', en: 'Trajectory Traps' }, desc: { ru: 'после рывка охрана стреляет на 35% точнее, с упреждением', en: 'after a dash guards aim 35% better, leading the target' }, short: { ru: 'точнее после рывка', en: 'sharper aim after dashes' } },
  { style: 'ally', name: { ru: 'Свой-чужой 2.0', en: 'Friend-or-Foe 2.0' }, desc: { ru: 'урон союзников и объектов −35%', en: 'ally and object damage −35%' }, short: { ru: 'союзники и объекты −35%', en: 'allies and objects −35%' } },
  { style: 'flank', name: { ru: 'Круговой обзор', en: 'All-Round View' }, desc: { ru: 'бонус с фланга −35%, охрана быстрее поворачивается', en: 'flank bonus −35%, guards turn faster' }, short: { ru: 'фланг −35%', en: 'flank −35%' } },
  { style: 'glitch', name: { ru: 'Экранирование', en: 'Shielding' }, desc: { ru: 'сбой стирает пули в радиусе −30%, взлом медленнее', en: 'glitch erases bullets in a 30% smaller radius, slower hacking' }, short: { ru: 'сбой и взлом слабее', en: 'weaker glitch and hacking' } },
  { style: 'shot', name: { ru: 'Баллистические пластины', en: 'Ballistic Plates' }, desc: { ru: 'урон пулями −30%', en: 'bullet damage −30%' }, short: { ru: 'пули −30%', en: 'bullets −30%' } },
];

export const PATCH_BY_STYLE = new Map(PATCHES.map((p) => [p.style, p]));

/** Множители патчей */
export const PATCH_K = 0.65;
export const PATCH_SHOT_K = 0.7;
export const PATCH_GLITCH_R = 0.7;
export const PATCH_HACK_K = 0.7;
export const PATCH_TURN_K = 1.35;
/** «Ловушки на траекториях»: сколько после рывка охрана целится точнее (с) и упреждение (с) */
const DASH_WINDOW = 1;
const DASH_LEAD = 0.2;

/** Порог «выделяется»: доля урона стиля или частота действий, при которой оценка = 1 */
const SHARE = { fire: 0.25, explosion: 0.25, melee: 0.3, ally: 0.25, flank: 0.35 } as const;
/** Рывков в минуту и сбоев (взлом — за полсбоя) за ярус */
const DASH_PER_MIN = 12;
const GLITCH_PER_TIER = 8;

/** Огненные метки предметов (лужи, полосы, пламя) */
const FIRE_TAGS = new Set(['ember', 'heat', 'fuel', 'trail', 'barrage']);
/** Метки снарядов и ударов объектов игрока (вертушки, часовой, перехватчики, сцепка) */
const OBJ_TAGS = new Set(['spinner', 'sentry', 'interceptor', 'tether']);

export class PatchState {
  /** Урон по стилям за ярус */
  dmg: Record<Style, number> = { fire: 0, explosion: 0, melee: 0, dash: 0, ally: 0, flank: 0, glitch: 0, shot: 0 };
  total = 0;
  dashes = 0;
  glitches = 0;
  hacks = 0;
  /** Время яруса (с) */
  time = 0;
  /** Действующие патчи (по порядку выхода) */
  active: Style[] = [];
  /** Идёт обновление объектов игрока: их урон — стиль «союзники и объекты» */
  inObjs = false;
  /** Когда игрок последний раз рвался (g.time) и его скорость (для упреждения) */
  lastDash = -99;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
}

export function hasPatch(g: Game, s: Style): boolean {
  return g.patches.active.includes(s);
}

/** Враг под действием патчей: обычный или мини-босс, не босс яруса и не союзник */
export function patched(e: Enemy | null | undefined): boolean {
  return !!e && e.team === 'foe' && (!e.def.boss || e.miniboss);
}

/** Стиль удара по врагу */
export function damageStyle(g: Game, o: DamageOpts): Style {
  if (o.by === 'ally' || o.source === 'ally') return 'ally';
  if ((o.tag && FIRE_TAGS.has(o.tag)) || o.bullet?.style === 'flame') return 'fire';
  if (g.patches.inObjs || (o.tag && OBJ_TAGS.has(o.tag))) return 'ally';
  if (o.source === 'explosion') return 'explosion';
  if (o.source === 'melee' || o.tag === 'ram') return 'melee';
  return 'shot';
}

/**
 * Урон по врагу с учётом патчей (из combat.damageEnemy, до вычитания HP) и учёт стиля для выбора
 * следующего патча. flank — удар игрока сбоку или со спины; flankMult уже применён к dmg
 */
export function patchDamage(g: Game, e: Enemy, dmg: number, o: DamageOpts, flank: boolean, flankMult: number): number {
  const style = damageStyle(g, o);
  if (patched(e)) {
    if (hasPatch(g, style)) dmg *= style === 'shot' ? PATCH_SHOT_K : PATCH_K;
    // «Круговой обзор»: бонус с фланга на 35% меньше
    if (flank && flankMult > 1 && hasPatch(g, 'flank')) dmg *= (1 + (flankMult - 1) * PATCH_K) / flankMult;
  }
  const s = g.patches;
  if (e.team === 'foe' && dmg > 0) {
    s.dmg[style] += dmg;
    s.total += dmg;
    if (flank) s.dmg.flank += dmg;
  }
  return dmg;
}

/** Тик горения: урон с учётом «Огнеупорной обшивки» и учёт огня; возвращает, во сколько раз быстрее гаснет */
export function patchBurn(g: Game, e: Enemy, dmg: number): { dmg: number; fade: number } {
  const on = patched(e) && hasPatch(g, 'fire');
  const d = on ? dmg * PATCH_K : dmg;
  if (e.team === 'foe') {
    g.patches.dmg.fire += d;
    g.patches.total += d;
  }
  return { dmg: d, fade: on ? 1 / PATCH_K : 1 };
}

/** Скорость поворота врага («Круговой обзор») */
export function patchTurn(g: Game, e: Enemy): number {
  return patched(e) && hasPatch(g, 'flank') ? PATCH_TURN_K : 1;
}

/** Радиус стирания пуль сбоем для пули этого врага («Экранирование») */
export function patchGlitchR(g: Game, owner: Enemy | undefined): number {
  return patched(owner) && hasPatch(g, 'glitch') ? PATCH_GLITCH_R : 1;
}

/** Множитель скорости взлома (терминалы, камеры; схроны брата — тоже через него) */
export function hackMult(g: Game): number {
  return hasPatch(g, 'glitch') ? PATCH_HACK_K : 1;
}

/**
 * «Ловушки на траекториях»: недавно после рывка игрока прицел врага точнее и с упреждением.
 * Возвращает поправку к погрешности и сдвиг цели
 */
export function patchAim(g: Game): { err: number; lx: number; ly: number } | null {
  if (!hasPatch(g, 'dash') || !g.aimPlayer || !patched(g.actor) || g.time - g.patches.lastDash > DASH_WINDOW) return null;
  const s = g.patches;
  return { err: PATCH_K, lx: s.vx * DASH_LEAD, ly: s.vy * DASH_LEAD };
}

export function noteDash(g: Game) {
  g.patches.dashes++;
  g.patches.lastDash = g.time;
}

export function updatePatches(g: Game, dt: number) {
  const s = g.patches, p = g.player;
  s.time += dt;
  if (dt > 0) {
    const k = Math.min(1, dt * 10);
    s.vx += ((p.x - s.px) / dt - s.vx) * k;
    s.vy += ((p.y - s.py) / dt - s.vy) * k;
  }
  s.px = p.x;
  s.py = p.y;
}

/** Оценки стилей за ярус: 1 — «выделяется» */
export function styleScores(g: Game): Record<Style, number> {
  const s = g.patches;
  const share = (k: keyof typeof SHARE) => (s.total > 0 ? s.dmg[k] / s.total / SHARE[k] : 0);
  return {
    fire: share('fire'),
    explosion: share('explosion'),
    melee: share('melee'),
    ally: share('ally'),
    flank: share('flank'),
    dash: s.time > 0 ? s.dashes / (s.time / 60) / DASH_PER_MIN : 0,
    glitch: (s.glitches + s.hacks * 0.5) / GLITCH_PER_TIER,
    shot: 0,
  };
}

/**
 * Выбрать патч: самый выделяющийся стиль, ещё не запатченный; если ничего не выделяется —
 * «Баллистические пластины» (обычная стрельба); если и они уже есть — самый частый из оставшихся
 */
export function choosePatch(g: Game): Style | null {
  const active = g.patches.active;
  const free = PATCHES.map((p) => p.style).filter((st) => !active.includes(st));
  if (!free.length) return null;
  const sc = styleScores(g);
  const ranked = free.filter((st) => st !== 'shot').sort((a, b) => sc[b] - sc[a]);
  const best = ranked[0];
  if (best && sc[best] >= 1) return best;
  if (free.includes('shot')) return 'shot';
  return best ?? null;
}

/** После босса яруса: выпустить патч, строка в лог, статистика яруса — заново */
export function releasePatch(g: Game): PatchDef | null {
  const st = choosePatch(g);
  const s = g.patches;
  s.dmg = { fire: 0, explosion: 0, melee: 0, dash: 0, ally: 0, flank: 0, glitch: 0, shot: 0 };
  s.total = s.dashes = s.glitches = s.hacks = s.time = 0;
  if (!st) return null;
  s.active.push(st);
  const def = PATCH_BY_STYLE.get(st)!;
  g.log(patchLine(g, def));
  return def;
}

/** «Обновление N.M: имя — эффект» (этап 15: не «Протокол» — так называются прошивки наборов и фазы боссов). N — номер версии (2-й патч забега — 3.x), M — номер стиля */
export function patchVersion(g: Game, def: PatchDef): string {
  return `${g.patches.active.indexOf(def.style) + 2}.${PATCHES.indexOf(def) + 1}`;
}

export function patchLine(g: Game, def: PatchDef): L {
  const v = patchVersion(g, def);
  return {
    ru: `Обновление ${v}: «${def.name.ru}» для охраны — ${def.short.ru}.`,
    en: `Update ${v}: "${def.name.en}" for security — ${def.short.en}.`,
  };
}

/** Строки для паузы */
export function patchList(g: Game): string[] {
  return g.patches.active.map((st) => {
    const def = PATCH_BY_STYLE.get(st)!;
    return `${patchVersion(g, def)} «${tr(def.name)}» — ${tr(def.desc)}`;
  });
}
