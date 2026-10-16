import type { L } from '../core/i18n';

/** Ярус мегаполиса-улья. От него зависят графика, механики окружения и пул врагов */
export type Tier = 'sump' | 'foundry' | 'hab' | 'transit' | 'spire';

export interface FloorTheme {
  tier: Tier;
  /** Название яруса */
  tierName: L;
  /** Название конкретного уровня (подбиом) */
  name: L;
  /** Босс в конце уровня (id из bosses.ts) */
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
    tier: 'sump', tierName: SUMP, name: { ru: 'Свалка', en: 'Scrapyard' }, boss: 'sentinel', tierBoss: false,
    floorA: '#14120f', floorB: '#171410', line: '#0b0a08', wall: '#1f1b16', wallTop: '#2e2820',
    accent: '#4f3006', lamp: '184,122,12', dark: 0.55,
  },
  {
    tier: 'sump', tierName: SUMP, name: { ru: 'Коллектор', en: 'Collector' }, boss: 'arachna', tierBoss: true,
    floorA: '#121214', floorB: '#151517', line: '#0a0a0c', wall: '#1d1b1e', wallTop: '#2c292c',
    accent: '#4f3006', lamp: '184,122,12', dark: 0.6,
  },
  {
    tier: 'foundry', tierName: FOUNDRY, name: { ru: 'Сборочная линия', en: 'Assembly Line' }, boss: 'hive', tierBoss: false,
    floorA: '#16161b', floorB: '#191920', line: '#0e0e12', wall: '#22222a', wallTop: '#33333d',
    accent: '#b87a0c', lamp: '255,170,90', dark: 0.5,
  },
  {
    tier: 'foundry', tierName: FOUNDRY, name: { ru: 'Литейная', en: 'Smeltery' }, boss: 'goliath', tierBoss: true,
    floorA: '#181312', floorB: '#1c1514', line: '#0f0a0a', wall: '#261a18', wallTop: '#3a2522',
    accent: '#a3161f', lamp: '255,110,50', dark: 0.5,
  },
  {
    tier: 'hab', tierName: HAB, name: { ru: 'Капсульные блоки', en: 'Capsule Blocks' }, boss: 'twins', tierBoss: false,
    floorA: '#151517', floorB: '#18181b', line: '#0c0c0e', wall: '#222226', wallTop: '#333338',
    accent: '#a3161f', lamp: '220,200,170', dark: 0.48,
  },
  {
    tier: 'hab', tierName: HAB, name: { ru: 'Нижний рынок', en: 'Low Market' }, boss: 'executioner', tierBoss: true,
    floorA: '#161214', floorB: '#191416', line: '#0d0a0b', wall: '#241b1f', wallTop: '#36272d',
    accent: '#6b2d8a', lamp: '255,90,70', dark: 0.52,
  },
  {
    tier: 'transit', tierName: TRANSIT, name: { ru: 'Грузовые пути', en: 'Freight Lines' }, boss: 'sentinel', tierBoss: false,
    floorA: '#121216', floorB: '#141419', line: '#09090c', wall: '#1c1c22', wallTop: '#2a2a33',
    accent: '#ffcc33', lamp: '255,204,120', dark: 0.56,
  },
  {
    tier: 'transit', tierName: TRANSIT, name: { ru: 'Лифтовые шахты', en: 'Lift Shafts' }, boss: 'gunship', tierBoss: true,
    floorA: '#111114', floorB: '#131317', line: '#08080a', wall: '#1a1a20', wallTop: '#28282f',
    accent: '#a3161f', lamp: '255,58,46', dark: 0.6,
  },
  {
    tier: 'spire', tierName: SPIRE, name: { ru: 'Ядро Диспетчера', en: "Dispatcher's Core" }, boss: 'dispatcher', tierBoss: true,
    floorA: '#1a1a1e', floorB: '#1d1d22', line: '#121216', wall: '#26262c', wallTop: '#3a3a44',
    accent: '#ff3a2e', lamp: '230,225,215', dark: 0.35,
  },
];
