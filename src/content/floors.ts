import type { L } from '../core/i18n';

/** Ярус мегаполиса-улья. От него зависят графика, механики окружения и пул врагов */
export type Tier = 'sump' | 'foundry' | 'hab' | 'transit' | 'spire';

export interface FloorTheme {
  tier: Tier;
  /** Название яруса */
  tierName: L;
  /** Название конкретного уровня (подбиом) */
  name: L;
  /** Босс в конце уровня (id из bosses.ts или minibosses.ts — этап 14а) */
  boss: string;
  /** Босс яруса (true) или мини-босс (false) */
  tierBoss: boolean;
  floorA: string;
  floorB: string;
  line: string;
  wall: string;
  wallTop: string;
  accent: string;
  /** Цвет ламп (r,g,b) */
  lamp: string;
  /** Плотность темноты 0..1 */
  dark: number;
  // --- визуальные поля художника окружения (src/gfx/env) ---
  /** Светлый оттенок пола (всё ещё тёмный) */
  floorHi: string;
  /** Фасад стены и его тень */
  face: string;
  faceD: string;
  /** Цвет глубины ямы */
  pitC: string;
  /** Оттенок темноты (r,g,b) */
  shade: string;
  /** Цвет светящихся элементов яруса (r,g,b): шлам, печи, окна, сигналы, светодиоды */
  glow: string;
  /** Вариант уровня внутри яруса (0 — первый, 1 — второй) */
  variant: number;
  /** Доля мерцающих ламп 0..1 */
  flicker: number;
  /** Потолочных пятен света на клетку комнаты */
  pools: number;
}

const SUMP: L = { ru: 'Отстойник', en: 'The Sump' };
const FOUNDRY: L = { ru: 'Цеха', en: 'Foundry' };
const HAB: L = { ru: 'Жилые соты', en: 'Hab Cells' };
const TRANSIT: L = { ru: 'Магистрали', en: 'Transit' };
const SPIRE: L = { ru: 'Шпиль', en: 'The Spire' };

// 9 уровней Улья снизу вверх: 4 яруса по 2 уровня + Шпиль.
// Боссы временные (из первой версии), пока не сделаны боссы ярусов — см. заметки «Мир и районы».
export const FLOOR_THEMES: FloorTheme[] = [
  {
    tier: 'sump', tierName: SUMP, name: { ru: 'Свалка', en: 'Scrapyard' }, boss: 'mbArachna', tierBoss: false,
    floorA: '#14110d', floorB: '#17130e', line: '#0a0806', wall: '#1d1812', wallTop: '#2b241b',
    accent: '#4f3006', lamp: '184,122,12', dark: 0.58,
    floorHi: '#1f1a13', face: '#211b14', faceD: '#15110c', pitC: '#0b0805',
    shade: '10,7,3', glow: '150,105,25', variant: 0, flicker: 0.35, pools: 2,
  },
  {
    tier: 'sump', tierName: SUMP, name: { ru: 'Коллектор', en: 'Collector' }, boss: 'sentinel', tierBoss: true,
    floorA: '#121313', floorB: '#151616', line: '#09090a', wall: '#1b1a19', wallTop: '#292726',
    accent: '#4f3006', lamp: '170,120,40', dark: 0.62,
    floorHi: '#1c1d1c', face: '#201f1d', faceD: '#141312', pitC: '#090a09',
    shade: '4,6,6', glow: '130,110,40', variant: 1, flicker: 0.3, pools: 2,
  },
  {
    tier: 'foundry', tierName: FOUNDRY, name: { ru: 'Сборочная линия', en: 'Assembly Line' }, boss: 'mbHive', tierBoss: false,
    floorA: '#16161b', floorB: '#19191f', line: '#0c0c10', wall: '#202027', wallTop: '#30303a',
    accent: '#b87a0c', lamp: '255,170,90', dark: 0.52,
    floorHi: '#212129', face: '#26262e', faceD: '#18181e', pitC: '#0b0b0e',
    shade: '6,5,5', glow: '255,120,40', variant: 0, flicker: 0.12, pools: 1,
  },
  {
    tier: 'foundry', tierName: FOUNDRY, name: { ru: 'Литейная', en: 'Smeltery' }, boss: 'goliath', tierBoss: true,
    floorA: '#181312', floorB: '#1b1514', line: '#0e0a09', wall: '#251917', wallTop: '#382421',
    accent: '#a3161f', lamp: '255,110,50', dark: 0.52,
    floorHi: '#241a18', face: '#2c1d1a', faceD: '#1c1210', pitC: '#100605',
    shade: '9,3,2', glow: '255,80,30', variant: 1, flicker: 0.15, pools: 1,
  },
  {
    tier: 'hab', tierName: HAB, name: { ru: 'Капсульные блоки', en: 'Capsule Blocks' }, boss: 'mbTwins', tierBoss: false,
    floorA: '#161617', floorB: '#19191a', line: '#0c0c0d', wall: '#212124', wallTop: '#323236',
    accent: '#a3161f', lamp: '220,200,170', dark: 0.5,
    floorHi: '#202022', face: '#29292c', faceD: '#1a1a1c', pitC: '#0a0a0b',
    shade: '5,4,6', glow: '255,60,50', variant: 0, flicker: 0.25, pools: 1,
  },
  {
    tier: 'hab', tierName: HAB, name: { ru: 'Нижний рынок', en: 'Low Market' }, boss: 'executioner', tierBoss: true,
    floorA: '#171214', floorB: '#1a1416', line: '#0d0a0b', wall: '#241a1e', wallTop: '#36272d',
    accent: '#6b2d8a', lamp: '255,120,80', dark: 0.54,
    floorHi: '#221a1d', face: '#2b1f24', faceD: '#1b1316', pitC: '#0b0709',
    shade: '7,3,5', glow: '255,60,50', variant: 1, flicker: 0.25, pools: 1,
  },
  {
    tier: 'transit', tierName: TRANSIT, name: { ru: 'Грузовые пути', en: 'Freight Lines' }, boss: 'mbGunship', tierBoss: false,
    floorA: '#111216', floorB: '#131419', line: '#08090c', wall: '#1a1b21', wallTop: '#282a32',
    accent: '#ffcc33', lamp: '255,204,120', dark: 0.58,
    floorHi: '#1a1b21', face: '#1f2027', faceD: '#121318', pitC: '#060709',
    shade: '3,4,8', glow: '255,190,60', variant: 0, flicker: 0.12, pools: 1,
  },
  {
    tier: 'transit', tierName: TRANSIT, name: { ru: 'Лифтовые шахты', en: 'Lift Shafts' }, boss: 'gunship', tierBoss: true,
    floorA: '#101013', floorB: '#121216', line: '#07070a', wall: '#19191e', wallTop: '#27272e',
    accent: '#a3161f', lamp: '255,90,60', dark: 0.62,
    floorHi: '#18181d', face: '#1e1e24', faceD: '#111115', pitC: '#050506',
    shade: '6,2,3', glow: '255,58,46', variant: 1, flicker: 0.18, pools: 1,
  },
  {
    tier: 'spire', tierName: SPIRE, name: { ru: 'Ядро Диспетчера', en: "Dispatcher's Core" }, boss: 'dispatcher', tierBoss: true,
    floorA: '#1e1e23', floorB: '#212127', line: '#141418', wall: '#2a2a31', wallTop: '#3e3e48',
    accent: '#ff3a2e', lamp: '225,230,240', dark: 0.36,
    floorHi: '#2a2a31', face: '#34343c', faceD: '#25252b', pitC: '#08080b',
    shade: '4,5,9', glow: '255,58,46', variant: 0, flicker: 0.04, pools: 2,
  },
];
