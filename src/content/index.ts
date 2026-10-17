import { registerItems, registerSynergies } from '../game/items';
import { BODY_ITEMS } from './body';
import { IMPLANTS } from './implants';
import { PASSIVES } from './passives';
import { SYNERGIES_LIST } from './synergies';
import { WEAPONS } from './weapons';
import { CLASS1 } from './sets/class1';
import { CLASS2 } from './sets/class2';
import { CLASS3 } from './sets/class3';
import { CLASS4 } from './sets/class4';
import { SET_SYNERGIES } from './sets/synergies';

let done = false;

/** Регистрация всего контента (вызывается один раз при запуске) */
export function registerContent() {
  if (done) return;
  done = true;
  registerItems(WEAPONS);
  registerItems(IMPLANTS);
  registerItems(PASSIVES);
  registerItems(BODY_ITEMS);
  // предметы наборов врагов (этап 12б)
  registerItems(CLASS1);
  registerItems(CLASS2);
  registerItems(CLASS3);
  registerItems(CLASS4);
  registerSynergies(SYNERGIES_LIST);
  registerSynergies(SET_SYNERGIES);
}
