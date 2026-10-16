import type { L } from '../core/i18n';
import type { RNG } from '../core/rng';
import type { Enemy } from './enemy';
import type { Game } from './game';
import type { Stats } from './stats';

export type ItemKind = 'weapon' | 'implant' | 'passive';

/** Теги нужны для синергий: набрав несколько предметов одного тега, игрок получает бонус */
export type Tag =
  | 'electric' | 'fire' | 'smart' | 'blade' | 'heavy' | 'mutation'
  | 'nano' | 'optic' | 'neural' | 'kinetic' | 'explosive' | 'stealth';

export interface HitInfo {
  x: number;
  y: number;
  dmg: number;
  source: 'bullet' | 'beam' | 'melee' | 'other';
}

/** События, на которые могут реагировать предметы */
export interface Hooks {
  onShoot?(g: Game, angle: number): void;
  onHit?(g: Game, e: Enemy, hit: HitInfo): void;
  onKill?(g: Game, e: Enemy): void;
  onHurt?(g: Game): void;
  onRoomClear?(g: Game): void;
  onRoomEnter?(g: Game): void;
  onDash?(g: Game): void;
  onBomb?(g: Game): void;
  tick?(g: Game, dt: number): void;
}

/** Активный имплант (клавиша Q) */
export interface ActiveSpec {
  cooldown: number;
  use(g: Game): void;
}

export interface WeaponSpec {
  /** bullet — снаряды, beam — луч, melee — удар по дуге, charge — заряжаемый выстрел */
  mode: 'bullet' | 'beam' | 'melee' | 'charge';
  /** Базовые параметры оружия (применяются сразу после базовых характеристик) */
  stats: (s: Stats) => void;
  /** Нестандартный рисунок выстрела. По умолчанию — веер из s.count снарядов */
  fire?: (g: Game, angle: number, s: Stats) => void;
  chargeTime?: number;
}

export interface IconSpec {
  shape: string;
  color: string;
  accent?: string;
}

export interface ItemDef {
  id: string;
  kind: ItemKind;
  name: L;
  desc: L;
  tags: Tag[];
  /** Редкость 1..4: влияет на шанс выпадения и цену */
  quality: 1 | 2 | 3 | 4;
  icon: IconSpec;
  stats?: (s: Stats, stacks: number) => void;
  hooks?: Hooks;
  active?: ActiveSpec;
  weapon?: WeaponSpec;
  /** Для пассивок: сколько раз можно взять */
  maxStacks?: number;
}

export interface SynergyDef {
  id: string;
  name: L;
  desc: L;
  requires: (has: (id: string) => boolean, tags: (t: Tag) => number) => boolean;
  stats?: (s: Stats) => void;
  hooks?: Hooks;
}

export const ITEMS = new Map<string, ItemDef>();
export const SYNERGIES: SynergyDef[] = [];

export function registerItems(list: ItemDef[]) {
  for (const it of list) {
    if (ITEMS.has(it.id)) throw new Error('duplicate item id ' + it.id);
    ITEMS.set(it.id, it);
  }
}

export function registerSynergies(list: SynergyDef[]) {
  SYNERGIES.push(...list);
}

export function item(id: string): ItemDef {
  const it = ITEMS.get(id);
  if (!it) throw new Error('unknown item ' + id);
  return it;
}

export function itemsOfKind(kind: ItemKind): ItemDef[] {
  return [...ITEMS.values()].filter((i) => i.kind === kind);
}

const QUALITY_WEIGHT = [0, 10, 6, 3, 1.4];

/** Случайный предмет нужного вида, исключая уже имеющиеся/выложенные */
export function rollItem(rng: RNG, kind: ItemKind, exclude: Set<string>, luck = 0): ItemDef | null {
  const pool = itemsOfKind(kind).filter((i) => !exclude.has(i.id));
  if (!pool.length) return null;
  return rng.weighted(pool, (i) => QUALITY_WEIGHT[i.quality] * (i.quality >= 3 ? 1 + luck * 0.3 : 1));
}

export function itemPrice(it: ItemDef): number {
  return [0, 15, 22, 30, 40][it.quality] + (it.kind === 'weapon' ? 3 : 0);
}
