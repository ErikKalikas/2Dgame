import { registerItems, registerSynergies } from '../game/items';
import { IMPLANTS } from './implants';
import { PASSIVES } from './passives';
import { SYNERGIES_LIST } from './synergies';
import { WEAPONS } from './weapons';

let done = false;

/** Регистрация всего контента (вызывается один раз при запуске) */
export function registerContent() {
  if (done) return;
  done = true;
  registerItems(WEAPONS);
  registerItems(IMPLANTS);
  registerItems(PASSIVES);
  registerSynergies(SYNERGIES_LIST);
}
