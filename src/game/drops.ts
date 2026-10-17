import { nearestWalkable } from '../world/level';
import type { Enemy, EnemyDef } from './enemy';
import type { Game } from './game';
import { ITEMS, SYSTEM_SLOTS, type Slot } from './items';
import { qualityColor } from './render';
import { dropLoot, makePickup } from './spawn';

// Дроп с врагов (этап 12). У каждого обычного врага — набор предметов: киборг роняет модули
// и оружие, робот — прошивки. Каждый предмет набора выпадает за забег не больше одного раза;
// если набор уже собран, вместо предмета падает горсть энергоячеек.

/** Базовый шанс по классу ценности I–IV */
export const DROP_BASE = [0, 0.15, 0.1, 0.07, 0.05];
/** Размер набора по классу */
export const SET_SIZE = [0, 3, 4, 5, 6];
/** Защита от невезения: каждое убийство без дропа добавляет такую долю базового шанса */
export const PITY_STEP = 0.25;
export const SCANNER = 'iScrapScanner';
export const SCANNER_MULT = 1.2;

/**
 * Предметы набора, которые ещё могут выпасть: есть в игре, ещё не встречались в забеге,
 * а модули систем тела (нервная, кровеносная, щупальца, реактор) — только после открытия системы
 */
export function remainingDrops(def: EnemyDef, seen: Set<string>, systems?: Set<Slot>): string[] {
  return (def.drops ?? []).filter((id) => {
    const it = ITEMS.get(id);
    if (!it || seen.has(id)) return false;
    return !(systems && it.slot && SYSTEM_SLOTS.includes(it.slot) && !systems.has(it.slot));
  });
}

export type DropResult = string | 'cells' | null;

/** Счётчики невезения по видам врагов — на один забег */
export class DropState {
  misses = new Map<string, number>();

  chance(def: EnemyDef, luck: number, scanner: boolean, mult = 1): number {
    if (!def.value) return 0;
    const base = DROP_BASE[def.value];
    const pity = (this.misses.get(def.id) ?? 0) * PITY_STEP * base;
    return Math.min(1, base * (1 + 0.1 * luck) * (scanner ? SCANNER_MULT : 1) * mult + pity);
  }

  /** Исход убийства: id предмета, горсть ячеек или ничего. rnd — равномерное [0, 1) */
  roll(def: EnemyDef, remaining: string[], luck: number, scanner: boolean, rnd: () => number, elite = false, mult = 1): DropResult {
    if (!def.value || !def.drops?.length || def.boss) return null;
    const guaranteed = elite && remaining.length > 0;
    if (!guaranteed && rnd() >= this.chance(def, luck, scanner, mult)) {
      if (remaining.length) this.misses.set(def.id, (this.misses.get(def.id) ?? 0) + 1);
      return null;
    }
    this.misses.set(def.id, 0);
    if (!remaining.length) return 'cells';
    return remaining[Math.min(remaining.length - 1, Math.floor(rnd() * remaining.length))];
  }
}

/** Убит враг (с наградой): бросок дропа и выкладка предмета или ячеек */
export function enemyDrop(g: Game, e: Enemy) {
  const def = e.def;
  if (def.boss || !def.value) return;
  const p = g.player;
  const rem = remainingDrops(def, g.seenItems, p.systems);
  const res = g.drops.roll(def, rem, p.stats.luck, p.has(SCANNER), () => g.rng.next(), e.elite, g.dropMult);
  if (!res) return;
  if (res === 'cells') {
    dropLoot(g, 'coin', e.x, e.y, 2 + def.value);
    return;
  }
  g.seenItems.add(res);
  const pos = nearestWalkable(g.room, e.x, e.y);
  g.pickups.push(makePickup('item', pos.x, pos.y, { itemId: res }));
  g.fx.ring(pos.x, pos.y, qualityColor(ITEMS.get(res)!.quality), 16, 0.45);
  g.lightFlash(pos.x, pos.y, 30);
}

/** Есть ли у врага несобранный набор (для метки над ним) */
export function hasOpenSet(g: Game, def: EnemyDef): boolean {
  return !def.boss && !!def.value && remainingDrops(def, g.seenItems, g.player.systems).length > 0;
}
