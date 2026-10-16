import type { L } from '../core/i18n';
import type { RNG } from '../core/rng';
import type { EBullet, PBullet } from './bullets';
import type { Enemy } from './enemy';
import type { Game } from './game';
import type { Stats } from './stats';

/**
 * weapon — ручное оружие; implant — модуль тела (ставится в операционной, до этого лежит в рюкзаке);
 * passive — прошивка (сразу, без слота); skeleton — скелет (класс 1–4); backpack — рюкзак побольше
 */
export type ItemKind = 'weapon' | 'implant' | 'passive' | 'skeleton' | 'backpack';

/** Слоты тела: 6 открыты сразу, 4 системы открываются боссами */
export type Slot = 'head' | 'armL' | 'armR' | 'torso' | 'legs' | 'back' | 'blood' | 'tentacles' | 'nervous' | 'reactor';
export const BODY_SLOTS: Slot[] = ['head', 'armL', 'armR', 'torso', 'legs', 'back'];
export const SYSTEM_SLOTS: Slot[] = ['blood', 'tentacles', 'nervous', 'reactor'];
export const ALL_SLOTS: Slot[] = [...BODY_SLOTS, ...SYSTEM_SLOTS];

export const SLOT_NAME: Record<Slot, L> = {
  head: { ru: 'Голова', en: 'Head' },
  armL: { ru: 'Левая рука', en: 'Left arm' },
  armR: { ru: 'Правая рука', en: 'Right arm' },
  torso: { ru: 'Корпус', en: 'Torso' },
  legs: { ru: 'Ноги', en: 'Legs' },
  back: { ru: 'Спина', en: 'Back' },
  blood: { ru: 'Кровеносная', en: 'Circulatory' },
  tentacles: { ru: 'Щупальца', en: 'Tentacles' },
  nervous: { ru: 'Нервная', en: 'Nervous' },
  reactor: { ru: 'Реактор', en: 'Reactor' },
};

/** Модуль левой руки: вторая атака на E */
export interface LeftHandSpec {
  cooldown: number;
  /** Нажатие E (angle — направление прицела) */
  use(g: Game, angle: number): void;
  /** Пока E зажата (для щита) */
  hold?(g: Game, angle: number, dt: number): void;
}

/** Теги нужны для синергий: набрав несколько предметов одного тега, игрок получает бонус */
export type Tag =
  | 'electric' | 'fire' | 'smart' | 'blade' | 'heavy' | 'mutation'
  | 'nano' | 'optic' | 'neural' | 'kinetic' | 'explosive' | 'stealth';

export type DamageSource = 'bullet' | 'beam' | 'melee' | 'explosion' | 'ally' | 'other';

export interface HitInfo {
  x: number;
  y: number;
  dmg: number;
  source: DamageSource;
  crit?: boolean;
  /** Снаряд, который попал (если попал снаряд) */
  bullet?: PBullet;
  /** Метка эффекта предмета (например, 'ram', 'cut', 'spinner') */
  tag?: string;
  /** Попадание сбоку или со спины */
  flank?: boolean;
}

/** Что летит в игрока: пуля (с владельцем), касание врага, электропол */
export interface IncomingHit {
  kind: 'bullet' | 'contact' | 'floor';
  bullet?: EBullet;
  enemy?: Enemy;
}

/** Индикатор предмета: у героя (полоска, огоньки, таймер-кольцо) или значок в HUD */
export interface Gauge {
  kind: 'bar' | 'pips' | 'ring' | 'hud';
  color: string;
  /** Доля 0..1 (полоска, кольцо, перезарядка значка) */
  k?: number;
  /** Огоньки или число на значке */
  n?: number;
  max?: number;
  /** Значок в HUD */
  icon?: IconSpec;
}

/** События, на которые могут реагировать предметы */
export interface Hooks {
  onShoot?(g: Game, angle: number): void;
  onHit?(g: Game, e: Enemy, hit: HitInfo): void;
  /** Убит враг (с наградой); кем добит — e.lastHit */
  onKill?(g: Game, e: Enemy): void;
  onHurt?(g: Game): void;
  onRoomClear?(g: Game): void;
  onRoomEnter?(g: Game): void;
  onFloorStart?(g: Game): void;
  onDash?(g: Game): void;
  /** Рывок закончился (приземление прыжка, залп в конце рывка) */
  onDashEnd?(g: Game): void;
  /** Сработал сбой (F или аварийный) */
  onGlitch?(g: Game): void;
  /** Попадание по игроку ещё до уклонения и щита; true — попадание перехвачено («КАЗ») */
  onIncoming?(g: Game, hit: IncomingHit): boolean;
  /** Попадание прошло щит и уклонение и отнимет жизнь (до аварийного окна); true — отменить («Долг боли») */
  onLifeHit?(g: Game, hit: IncomingHit): boolean;
  /** Попадание поглощено: уклонение, заряд щита или перехват */
  onDefend?(g: Game, how: 'dodge' | 'shield' | 'intercept'): void;
  /** Взлом завершён (терминал; позже — двери и схроны) */
  onHack?(g: Game): void;
  /** Снаряд игрока погас: врезался в стену (wall) или долетел до конца */
  onShotEnd?(g: Game, b: PBullet, wall: boolean): void;
  tick?(g: Game, dt: number): void;
  /** Индикатор у героя или в HUD (вызывается при отрисовке) */
  gauge?(g: Game): Gauge | Gauge[] | null;
}

/** Активный имплант (клавиша Q) */
export interface ActiveSpec {
  cooldown: number;
  use(g: Game): void;
}

export interface WeaponSpec {
  /** bullet — снаряды, beam — луч, melee — удар по дуге, charge — заряжаемый выстрел */
  mode: 'bullet' | 'beam' | 'melee' | 'charge';
  /** Двуручное оружие занимает и левую руку: атака на E недоступна (по умолчанию одноручное) */
  hands?: 1 | 2;
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
  /** Модуль: в какой слот ставится */
  slot?: Slot;
  /** Скелет: класс 1–4 (модули редкостью выше класса не ставятся) */
  skeletonClass?: 1 | 2 | 3 | 4;
  /** Рюкзак: сколько мест */
  capacity?: number;
  /** Модуль левой руки */
  leftHand?: LeftHandSpec;
  /** Очки нестабильности (предметы врагов III–IV, детали Чистильщиков) */
  unstable?: 1 | 2;
  /** Из набора какого врага (id врага); в общих пулах такие предметы реже */
  fromEnemy?: string;
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
/** Предметы врагов в общих пулах (сокровищница, магазин, награды) попадаются реже обычных */
const ENEMY_ITEM_WEIGHT = 0.5;

/** Редкие предметы попадаются чаще с ростом уровня: 3 — с 3-го, 4 — с 5-го (раньше — изредка) */
function floorWeight(q: number, floor: number): number {
  if (q === 3 && floor < 3) return 0.2;
  if (q === 4 && floor < 5) return 0.06;
  return 1;
}

/** Случайный предмет нужного вида, исключая уже имеющиеся/выложенные; allow — доп. фильтр */
export function rollItem(rng: RNG, kind: ItemKind, exclude: Set<string>, luck = 0, floor = 9, allow?: (it: ItemDef) => boolean): ItemDef | null {
  const pool = itemsOfKind(kind).filter((i) => !exclude.has(i.id) && (!allow || allow(i)));
  if (!pool.length) return null;
  return rng.weighted(pool, (i) => QUALITY_WEIGHT[i.quality] * floorWeight(i.quality, floor) * (i.quality >= 3 ? 1 + luck * 0.3 : 1) * (i.fromEnemy ? ENEMY_ITEM_WEIGHT : 1));
}

export function itemPrice(it: ItemDef): number {
  if (it.kind === 'skeleton') return [0, 10, 20, 32, 45][it.skeletonClass ?? 1];
  if (it.kind === 'backpack') return 14 + (it.capacity ?? 5) * 2;
  return [0, 15, 22, 30, 40][it.quality] + (it.kind === 'weapon' ? 3 : 0);
}
