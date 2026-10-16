import { C } from '../gfx/palette';
import type { ItemDef } from '../game/items';

// Импланты — постоянные улучшения из сокровищниц, магазинов и с боссов.
// Активные импланты (есть поле active) используются клавишей Q; можно носить только один.

export const IMPLANTS: ItemDef[] = [
  {
    id: 'smartlink', kind: 'implant', quality: 2, tags: ['smart', 'neural'],
    name: { ru: 'Смарт-линк', en: 'Smartlink' },
    desc: { ru: 'Снаряды доворачивают к ближайшему врагу.', en: 'Shots curve toward the nearest enemy.' },
    icon: { shape: 'crosshair', color: C.steel, accent: C.red },
    stats: (s) => {
      s.homing += 3.2;
    },
  },
  {
    id: 'reflexBooster', kind: 'implant', quality: 1, tags: ['neural'],
    name: { ru: 'Рефлекс-бустер', en: 'Reflex Booster' },
    desc: { ru: 'Скорострельность +25%.', en: 'Fire rate +25%.' },
    icon: { shape: 'brain', color: C.redD, accent: C.yellow },
    stats: (s) => {
      s.fireRateMult *= 1.25;
    },
  },
  {
    id: 'subdermal', kind: 'implant', quality: 2, tags: ['heavy'],
    name: { ru: 'Субдермальная броня', en: 'Subdermal Armor' },
    desc: { ru: '+1 к максимуму жизней.', en: '+1 max life.' },
    icon: { shape: 'shield', color: C.steel, accent: C.amber },
    stats: (s) => {
      s.maxLives += 1;
    },
  },
  {
    id: 'twinBarrel', kind: 'implant', quality: 2, tags: ['kinetic'],
    name: { ru: 'Сдвоенный канал', en: 'Twin Channel' },
    desc: { ru: '+1 снаряд за выстрел, урон каждого −15%.', en: '+1 projectile per shot, each deals −15% damage.' },
    icon: { shape: 'arm', color: C.steelL, accent: C.red },
    stats: (s) => {
      s.count += 1;
      s.damageMult *= 0.85;
    },
  },
  {
    id: 'sandevistan', kind: 'implant', quality: 3, tags: ['neural', 'stealth'],
    name: { ru: 'Сандевистан', en: 'Sandevistan' },
    desc: { ru: '[Q] Замедляет время вокруг на 3 секунды. Перезарядка 18 с.', en: '[Q] Slows time around you for 3 seconds. Cooldown 18 s.' },
    icon: { shape: 'spine', color: C.amber, accent: C.violet },
    active: {
      cooldown: 18,
      use: (g) => {
        g.slowmo = 3;
        g.fx.ring(g.player.x, g.player.y, C.violet, 120, 0.5);
      },
    },
  },
];
