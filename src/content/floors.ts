import type { L } from '../core/i18n';

export interface FloorTheme {
  name: L;
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
}

// 8 этажей башни корпорации снизу вверх
export const FLOOR_THEMES: FloorTheme[] = [
  {
    name: { ru: 'Коллектор под башней', en: 'Undercity Sewers' },
    floorA: '#121216', floorB: '#15151a', line: '#0b0b0f', wall: '#1d1b1e', wallTop: '#2c292c',
    accent: '#4f3006', lamp: '184,122,12', dark: 0.55,
  },
  {
    name: { ru: 'Подземный гараж', en: 'Sub-level Garage' },
    floorA: '#16161b', floorB: '#191920', line: '#0e0e12', wall: '#22222a', wallTop: '#33333d',
    accent: '#b87a0c', lamp: '210,190,140', dark: 0.5,
  },
  {
    name: { ru: 'Логистический узел', en: 'Logistics Hub' },
    floorA: '#17140f', floorB: '#1b1711', line: '#0f0c08', wall: '#241f17', wallTop: '#352d21',
    accent: '#b87a0c', lamp: '255,190,90', dark: 0.5,
  },
  {
    name: { ru: 'Лаборатории имплантов', en: 'Implant Labs' },
    floorA: '#17171c', floorB: '#1b1b21', line: '#101014', wall: '#26262e', wallTop: '#3a3a46',
    accent: '#a3161f', lamp: '220,215,205', dark: 0.42,
  },
  {
    name: { ru: 'Казармы охраны', en: 'Security Barracks' },
    floorA: '#181213', floorB: '#1c1415', line: '#0f0a0b', wall: '#271a1c', wallTop: '#3a2427',
    accent: '#a3161f', lamp: '255,80,60', dark: 0.5,
  },
  {
    name: { ru: 'Этаж руководства', en: 'Executive Floor' },
    floorA: '#121114', floorB: '#151418', line: '#0a090b', wall: '#1e1c20', wallTop: '#2e2a2f',
    accent: '#ffcc33', lamp: '255,204,120', dark: 0.45,
  },
  {
    name: { ru: 'Серверные хранилища', en: 'Server Vaults' },
    floorA: '#100f15', floorB: '#13111a', line: '#09080d', wall: '#1b1824', wallTop: '#2b2538',
    accent: '#6b2d8a', lamp: '150,90,190', dark: 0.58,
  },
  {
    name: { ru: 'Ядро ИИ', en: 'AI Core' },
    floorA: '#140b0d', floorB: '#180d10', line: '#0b0506', wall: '#220f13', wallTop: '#36151b',
    accent: '#ff3a2e', lamp: '255,58,46', dark: 0.6,
  },
];
