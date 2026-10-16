import { C } from '../gfx/palette';
import { spawnShot } from '../game/combat';
import type { ItemDef } from '../game/items';

// Оружие. Игрок носит одно оружие; подобранное заменяет текущее (старое остаётся на полу).
// mode: bullet — снаряды, beam — луч, melee — удар по дуге, charge — зарядка (держать стрелку и отпустить).

export const WEAPONS: ItemDef[] = [
  {
    id: 'pistol', kind: 'weapon', quality: 1, tags: ['kinetic'],
    name: { ru: 'Пистолет «Хром»', en: '"Chrome" Pistol' },
    desc: { ru: 'Надёжный табельный пистолет. Ничего лишнего.', en: 'A reliable sidearm. Nothing fancy.' },
    icon: { shape: 'pistol', color: C.steelL, accent: C.yellow },
    weapon: { mode: 'bullet', stats: () => {} },
  },
  {
    id: 'smg', kind: 'weapon', quality: 1, tags: ['kinetic'],
    name: { ru: 'ПП «Шершень»', en: '"Hornet" SMG' },
    desc: { ru: 'Очень быстрый огонь, слабые пули, большой разброс.', en: 'Very fast fire, weak rounds, wide spread.' },
    icon: { shape: 'smg', color: C.steel, accent: C.amber },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 1.9;
        s.fireDelay = 0.095;
        s.jitter = 0.13;
        s.range = 190;
        s.size = 0.8;
      },
    },
  },
  {
    id: 'shotgun', kind: 'weapon', quality: 2, tags: ['kinetic', 'heavy'],
    name: { ru: 'Дробовик «Мясник»', en: '"Butcher" Shotgun' },
    desc: { ru: 'Залп из 6 дробин на близкой дистанции.', en: 'A blast of 6 pellets at close range.' },
    icon: { shape: 'shotgun', color: C.amberD, accent: C.red },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2.6;
        s.count = 6;
        s.spread = 0.09;
        s.jitter = 0.07;
        s.fireDelay = 0.62;
        s.range = 140;
        s.shotSpeed = 300;
        s.knockback = 60;
        s.shotStyle = 'pellet';
      },
    },
  },
  {
    id: 'laser', kind: 'weapon', quality: 2, tags: ['optic', 'electric'],
    name: { ru: 'Лазер «Игла»', en: '"Needle" Laser' },
    desc: { ru: 'Непрерывный луч прожигает всех на линии до стены.', en: 'A continuous beam burns through everything up to a wall.' },
    icon: { shape: 'laser', color: C.metal, accent: C.red },
    weapon: {
      mode: 'beam',
      stats: (s) => {
        s.damage = 1.5;
        s.fireDelay = 0.07;
        s.range = 260;
        s.size = 0.8;
        s.shotColor = C.redL;
        s.knockback = 0;
      },
    },
  },
  {
    id: 'katana', kind: 'weapon', quality: 2, tags: ['blade', 'fire'],
    name: { ru: 'Термокатана', en: 'Thermal Katana' },
    desc: { ru: 'Удар по дуге поджигает врагов и разрезает вражеские пули.', en: 'Arc slash that ignites enemies and cuts enemy bullets.' },
    icon: { shape: 'blade', color: C.bone, accent: C.amber },
    weapon: {
      mode: 'melee',
      stats: (s) => {
        s.damage = 8;
        s.fireDelay = 0.34;
        s.burn = 3;
        s.shotColor = C.amber;
      },
    },
  },
  {
    id: 'railgun', kind: 'weapon', quality: 3, tags: ['electric', 'heavy'],
    name: { ru: 'Рельсотрон', en: 'Railgun' },
    desc: { ru: 'Удерживайте огонь для зарядки. Полный заряд пробивает насквозь.', en: 'Hold fire to charge. A full charge pierces through.' },
    icon: { shape: 'sniper', color: C.steel, accent: C.yellow },
    weapon: {
      mode: 'charge',
      chargeTime: 0.9,
      stats: (s) => {
        s.damage = 9;
        s.shotSpeed = 720;
        s.range = 420;
        s.pierce = 1;
        s.shotStyle = 'needle';
        s.shotColor = C.yellow;
        s.knockback = 80;
      },
    },
  },
  {
    id: 'flamer', kind: 'weapon', quality: 2, tags: ['fire'],
    name: { ru: 'Огнемёт «Пекло»', en: '"Inferno" Flamethrower' },
    desc: { ru: 'Короткая струя огня. Поджигает и проходит сквозь врагов.', en: 'A short stream of fire. Ignites and passes through enemies.' },
    icon: { shape: 'flame', color: C.redD, accent: C.yellow },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 0.9;
        s.fireDelay = 0.05;
        s.range = 95;
        s.shotSpeed = 210;
        s.jitter = 0.22;
        s.burn = 4;
        s.pierce = 2;
        s.knockback = 0;
        s.shotStyle = 'flame';
        s.size = 1.2;
      },
      fire: (g, angle, s) => {
        for (let i = 0; i < s.count; i++) {
          const a = angle + (i - (s.count - 1) / 2) * s.spread + (Math.random() - 0.5) * 2 * s.jitter;
          spawnShot(g, a, s, { speed: s.shotSpeed * (0.8 + Math.random() * 0.4) });
        }
      },
    },
  },
  {
    id: 'rpg', kind: 'weapon', quality: 3, tags: ['explosive', 'heavy'],
    name: { ru: 'Гранатомёт «Молот»', en: '"Hammer" Launcher' },
    desc: { ru: 'Медленные ракеты разгоняются и взрываются по площади.', en: 'Slow rockets accelerate and explode in an area.' },
    icon: { shape: 'rocket', color: C.metal, accent: C.red },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 11;
        s.fireDelay = 0.85;
        s.explode = 34;
        s.shotSpeed = 150;
        s.accel = 2.6;
        s.range = 320;
        s.shotStyle = 'rocket';
        s.shotColor = C.amber;
      },
    },
  },
];
