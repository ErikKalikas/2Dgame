import type { L } from '../core/i18n';
import type { Game } from './game';
import { SYSTEM_SLOTS, item, type ItemDef, type Slot } from './items';
import { makePickup } from './spawn';

// Операции над телом Т-417: только в операционной. Модуль ставится из рюкзака в свой слот,
// снятый модуль возвращается в рюкзак (или падает на пол, если места нет).

/** Почему модуль нельзя поставить (null — можно) */
export function installBlock(g: Game, it: ItemDef): L | null {
  const p = g.player;
  if (it.kind === 'skeleton') {
    const need = Math.max(1, ...p.installed.map((id) => item(id).quality));
    if ((it.skeletonClass ?? 1) < need) return { ru: `Класс скелета ниже установленных модулей (нужен ${need})`, en: `Frame class is below installed modules (need ${need})` };
    return null;
  }
  if (it.kind !== 'implant' || !it.slot) return { ru: 'Это не модуль', en: 'Not a module' };
  if (SYSTEM_SLOTS.includes(it.slot) && !p.systems.has(it.slot)) return { ru: 'Система тела ещё не открыта', en: 'Body system not unlocked yet' };
  if (it.quality > p.skeletonClass) return { ru: `Нужен скелет класса ${it.quality}`, en: `Needs a class ${it.quality} frame` };
  if (it.active) {
    const other = p.activeId;
    if (other && item(other).slot !== it.slot) return { ru: 'Активный модуль уже стоит (только один на Q)', en: 'An active module is already installed (one on Q)' };
  }
  return null;
}

function dropToFloor(g: Game, id: string) {
  const p = g.player;
  g.pickups.push(makePickup('item', p.x + (Math.random() - 0.5) * 20, p.y + 14, { itemId: id, t: -0.5 }));
}

/** Поставить предмет из рюкзака (индекс). Старый модуль слота — в рюкзак. */
export function install(g: Game, index: number): boolean {
  const p = g.player;
  const id = p.backpack[index];
  if (!id) return false;
  const it = item(id);
  if (installBlock(g, it)) return false;
  p.backpack.splice(index, 1);
  if (it.kind === 'skeleton') {
    p.backpack.push(p.skeleton);
    p.skeleton = id;
  } else {
    const slot = it.slot!;
    const old = p.slots[slot];
    if (old) p.backpack.push(old);
    p.slots[slot] = id;
    if (slot === 'armR') {
      // рука-оружие: ручное оружие из руки выпадает на пол
      if (p.weapon.slot !== 'armR') dropToFloor(g, p.weapon.id);
      p.weapon = it;
      p.charge = 0;
    }
    if (it.active) p.activeCd = 0;
  }
  afterChange(g);
  return true;
}

/** Снять модуль со слота: в рюкзак, а если он полон — на пол */
export function remove(g: Game, slot: Slot): boolean {
  const p = g.player;
  const id = p.slots[slot];
  if (!id) return false;
  delete p.slots[slot];
  if (slot === 'armR') {
    // без руки-оружия Т-417 снова держит клепальный пистолет
    p.weapon = item('pistol');
    p.charge = 0;
  }
  if (p.backpack.length < p.backpackSize) p.backpack.push(id);
  else dropToFloor(g, id);
  afterChange(g);
  return true;
}

/** Выбросить предмет из рюкзака на пол */
export function dropFromBackpack(g: Game, index: number) {
  const p = g.player;
  const id = p.backpack[index];
  if (!id) return;
  p.backpack.splice(index, 1);
  dropToFloor(g, id);
}

function afterChange(g: Game) {
  const p = g.player;
  const prevMax = p.stats.maxLives;
  p.recalc();
  if (p.stats.maxLives > prevMax) p.lives += p.stats.maxLives - prevMax;
  p.shieldLeft = p.stats.shield;
}
