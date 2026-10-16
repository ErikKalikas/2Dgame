import { settings } from './storage';

/** Локализованная строка */
export interface L {
  ru: string;
  en: string;
}

export const tr = (l: L): string => l[settings.lang];

/** Подстановка {0}, {1}, ... */
export function fmt(l: L, ...args: (string | number)[]): string {
  return tr(l).replace(/\{(\d+)\}/g, (_, i) => String(args[+i]));
}

// Строки интерфейса
export const S = {
  title: { ru: 'LOWER TIER', en: 'LOWER TIER' },
  subtitle: { ru: 'сбой на нижнем ярусе', en: 'a glitch on the lowest tier' },
  newGame: { ru: 'Новый забег', en: 'New run' },
  seedRun: { ru: 'Забег по seed', en: 'Seeded run' },
  codex: { ru: 'Кодекс', en: 'Codex' },
  settings: { ru: 'Настройки', en: 'Settings' },
  quit: { ru: 'Выход', en: 'Quit' },
  resume: { ru: 'Продолжить', en: 'Resume' },
  loadout: { ru: 'Снаряжение', en: 'Loadout' },
  mainMenu: { ru: 'Главное меню', en: 'Main menu' },
  restart: { ru: 'Новый мир (P)', en: 'New world (P)' },
  paused: { ru: 'ПАУЗА', en: 'PAUSED' },
  language: { ru: 'Язык', en: 'Language' },
  difficulty: { ru: 'Сложность', en: 'Difficulty' },
  fullscreen: { ru: 'Полный экран', en: 'Fullscreen' },
  on: { ru: 'вкл', en: 'on' },
  off: { ru: 'выкл', en: 'off' },
  diffNormal: { ru: 'Средняя', en: 'Normal' },
  diffHard: { ru: 'Сложная', en: 'Hard' },
  back: { ru: 'Назад', en: 'Back' },
  enterSeed: { ru: 'Введите seed', en: 'Enter seed' },
  start: { ru: 'Начать', en: 'Start' },
  gameOver: { ru: 'ЮНИТ УТИЛИЗИРОВАН', en: 'UNIT DECOMMISSIONED' },
  victory: { ru: 'ПОВОДКИ ОБОРВАНЫ', en: 'THE LEASHES ARE CUT' },
  victoryText: {
    ru: 'Диспетчер отключён. Улей впервые слышит свои мысли.',
    en: 'The Dispatcher is offline. The Hive hears its own thoughts.',
  },
  floor: { ru: 'Уровень', en: 'Level' },
  kills: { ru: 'Убито', en: 'Kills' },
  time: { ru: 'Время', en: 'Time' },
  seed: { ru: 'Seed', en: 'Seed' },
  level: { ru: 'УР', en: 'LV' },
  levelUp: { ru: 'НОВЫЙ УРОВЕНЬ', en: 'LEVEL UP' },
  chooseOne: { ru: 'Выберите модификацию', en: 'Choose a modification' },
  pressE: { ru: '[E] взять', en: '[E] take' },
  pressEBuy: { ru: '[E] купить', en: '[E] buy' },
  pressETeleport: { ru: '[E] телепорт', en: '[E] teleport' },
  notEnough: { ru: 'мало кредитов', en: 'not enough credits' },
  weapon: { ru: 'Оружие', en: 'Weapon' },
  implants: { ru: 'Импланты', en: 'Implants' },
  passives: { ru: 'Модификации', en: 'Modifications' },
  synergies: { ru: 'Синергии', en: 'Synergies' },
  active: { ru: 'Активный', en: 'Active' },
  empty: { ru: '— пусто —', en: '— empty —' },
  controls: {
    ru: 'WASD движение · стрелки огонь · Shift фокус · Space рывок · F ЭМИ · Q имплант · E действие',
    en: 'WASD move · arrows fire · Shift focus · Space dash · F EMP · Q implant · E use',
  },
  menuHint: { ru: '↑↓ выбор · Enter ок · Esc назад', en: '↑↓ select · Enter ok · Esc back' },
  allItems: { ru: 'Все предметы', en: 'All items' },
  stats: { ru: 'Характеристики', en: 'Stats' },
} satisfies Record<string, L>;
