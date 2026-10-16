import type { SynergyDef } from '../game/items';

// Синергии включаются автоматически, когда у игрока есть нужная комбинация предметов или тегов.

export const SYNERGIES_LIST: SynergyDef[] = [
  {
    id: 'smartRicochet',
    name: { ru: 'Умный рикошет', en: 'Smart Ricochet' },
    desc: { ru: 'Смарт-линк + рикошет: отскочившие снаряды наводятся сильнее, +1 отскок.', en: 'Smartlink + Ricochet: bounced shots home harder, +1 bounce.' },
    requires: (has) => has('smartlink') && has('ricochet'),
    stats: (s) => {
      s.bounce += 1;
      s.homing += 1.5;
    },
  },
  {
    id: 'pyromaniac',
    name: { ru: 'Пироман', en: 'Pyromaniac' },
    desc: { ru: '2 предмета с огнём: поджог вдвое сильнее.', en: '2 fire items: burn is twice as strong.' },
    requires: (_h, tags) => tags('fire') >= 2,
    stats: (s) => {
      s.burn *= 2;
    },
  },
  {
    id: 'abomination',
    name: { ru: 'Мерзость', en: 'Abomination' },
    desc: { ru: '2 мутации: +1 жизнь, снаряды крупнее.', en: '2 mutations: +1 life, bigger shots.' },
    requires: (_h, tags) => tags('mutation') >= 2,
    stats: (s) => {
      s.maxLives += 1;
      s.size *= 1.25;
    },
  },
];
