import { C } from '../gfx/palette';
import type { ItemDef } from '../game/items';

// Модификации — выбор 1 из 2 при повышении уровня. Многие можно брать несколько раз (maxStacks).
// Они не только меняют числа, но и траектории, размер и тип атаки.

export const PASSIVES: ItemDef[] = [
  {
    id: 'sineDrive', kind: 'passive', quality: 1, tags: ['electric'], maxStacks: 2,
    name: { ru: 'Синус-привод', en: 'Sine Drive' },
    desc: { ru: 'Снаряды летят волной. Урон +10%.', en: 'Shots travel in a wave. Damage +10%.' },
    icon: { shape: 'wave', color: C.amber, accent: C.yellow },
    stats: (s, n) => {
      s.wave += 7 * n;
      s.damageMult *= 1 + 0.1 * n;
    },
  },
  {
    id: 'heavyRounds', kind: 'passive', quality: 1, tags: ['heavy'], maxStacks: 3,
    name: { ru: 'Тяжёлые сердечники', en: 'Heavy Cores' },
    desc: { ru: 'Снаряды крупнее и сильнее, но медленнее.', en: 'Bigger and stronger shots, but slower.' },
    icon: { shape: 'orb', color: C.steel, accent: C.red },
    stats: (s, n) => {
      s.size *= 1 + 0.3 * n;
      s.damageMult *= 1 + 0.18 * n;
      s.shotSpeed *= 1 - 0.1 * n;
    },
  },
  {
    id: 'ricochet', kind: 'passive', quality: 2, tags: ['kinetic'], maxStacks: 2,
    name: { ru: 'Рикошет', en: 'Ricochet' },
    desc: { ru: 'Снаряды отскакивают от стен.', en: 'Shots bounce off walls.' },
    icon: { shape: 'disc', color: C.steelL, accent: C.amber },
    stats: (s, n) => {
      s.bounce += 2 * n;
    },
  },
  {
    id: 'tumorGrowth', kind: 'passive', quality: 2, tags: ['mutation'], maxStacks: 2,
    name: { ru: 'Мутация: опухолевый рост', en: 'Mutation: Tumor Growth' },
    desc: { ru: 'Снаряды растут в полёте. Скорострельность −10%.', en: 'Shots grow in flight. Fire rate −10%.' },
    icon: { shape: 'mutation', color: C.redD, accent: C.violet },
    stats: (s, n) => {
      s.grow += 5 * n;
      s.fireRateMult *= 1 - 0.1 * n;
    },
  },
  {
    id: 'splitter', kind: 'passive', quality: 2, tags: ['kinetic'], maxStacks: 2,
    name: { ru: 'Кассетный заряд', en: 'Cluster Payload' },
    desc: { ru: 'При попадании снаряд распадается на 3 осколка.', en: 'On hit, the shot splits into 3 shards.' },
    icon: { shape: 'core', color: C.amber, accent: C.red },
    stats: (s, n) => {
      s.split += 3 * n;
    },
  },
  {
    id: 'servoLegs', kind: 'passive', quality: 1, tags: ['kinetic'], maxStacks: 3,
    name: { ru: 'Сервоприводы ног', en: 'Leg Servos' },
    desc: { ru: 'Скорость +10%, рывок перезаряжается быстрее.', en: 'Speed +10%, dash recharges faster.' },
    icon: { shape: 'leg', color: C.steel, accent: C.yellow },
    stats: (s, n) => {
      s.speed *= 1 + 0.1 * n;
      s.dashCd *= 1 - 0.15 * n;
    },
  },
];
