import { TAU, angleDiff } from '../core/math';
import { C } from '../gfx/palette';
import type { PBullet } from '../game/bullets';
import { raycast } from '../game/collision';
import { fan, spawnShot } from '../game/combat';
import type { Game } from '../game/game';
import type { ItemDef } from '../game/items';
import { finalDamage, type ShotStyle, type Stats } from '../game/stats';

// --- помощники для нестандартных рисунков выстрела ---

/** Случайное отклонение в пределах ±j */
const jit = (j: number) => (Math.random() - 0.5) * 2 * j;

/** Основные направления с учётом выстрела назад и по бокам */
function dirsOf(angle: number, s: Stats): number[] {
  const d = [angle];
  if (s.backShot) d.push(angle + Math.PI);
  if (s.sideShots) d.push(angle + Math.PI / 2, angle - Math.PI / 2);
  return d;
}

/** Углы веера из s.count снарядов вокруг base (spread + jitter) */
function fanAngles(base: number, s: Stats): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.count; i++) out.push(base + (i - (s.count - 1) / 2) * s.spread + jit(s.jitter));
  return out;
}

/** Степень заряда 0..1 для оружия режима charge (по множителю урона, который передаёт fireWeapon) */
function chargeK(g: Game, s: Stats): number {
  const base = g.player.stats.damage;
  if (!base) return 1;
  return Math.max(0, Math.min(1, (s.damage / base - 0.35) / 2.4));
}

const SCRAP_STYLES: ShotStyle[] = ['pellet', 'shard', 'bolt'];
/** Состояние отдельных видов оружия (игрок один) */
let cobraSide = 1;
let spinStart = 0;
let spinLast = -9;
const wells = new WeakSet<PBullet>();

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

  // ---------------------------------------------------------------------------
  // Обычное (качество 1)

  {
    id: 'wTwinCobra', kind: 'weapon', quality: 1, tags: ['kinetic'],
    name: { ru: 'Парные «Кобры»', en: 'Twin "Cobras"' },
    desc: {
      ru: 'Два пистолета стреляют по очереди из левой и правой руки. Частый огонь, слабые пули.',
      en: 'Two pistols fire in turn from the left and right hand. Fast fire, light rounds.',
    },
    icon: { shape: 'pistol', color: C.bone, accent: C.red },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2.1;
        s.fireDelay = 0.16;
        s.jitter = 0.05;
        s.range = 210;
      },
      fire: (g, angle, s) => {
        cobraSide = -cobraSide;
        const p = g.player;
        for (const base of dirsOf(angle, s)) {
          const ox = Math.cos(base + Math.PI / 2) * 4 * cobraSide;
          const oy = Math.sin(base + Math.PI / 2) * 4 * cobraSide;
          const x = p.x + ox, y = p.y - 3 + oy;
          for (const a of fanAngles(base, s)) spawnShot(g, a, s, { x, y, bx: x, by: y });
        }
      },
    },
  },
  {
    id: 'wBackAlley', kind: 'weapon', quality: 1, tags: ['kinetic', 'heavy'],
    name: { ru: 'Обрез «Подворотня»', en: '"Back Alley" Sawn-Off' },
    desc: {
      ru: 'Широкий залп из 8 дробин в упор. Дальность совсем короткая, перезарядка долгая.',
      en: 'A wide blast of 8 pellets point-blank. Very short range, slow reload.',
    },
    icon: { shape: 'shotgun', color: C.steel, accent: C.yellow },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2.2;
        s.count = 8;
        s.spread = 0.11;
        s.jitter = 0.08;
        s.fireDelay = 0.78;
        s.range = 100;
        s.shotSpeed = 280;
        s.knockback = 70;
        s.shotStyle = 'pellet';
      },
    },
  },
  {
    id: 'wBurstCarbine', kind: 'weapon', quality: 1, tags: ['kinetic', 'optic'],
    name: { ru: 'Карабин «Тройка»', en: '"Triad" Carbine' },
    desc: {
      ru: 'Точные очереди по 3 быстрые пули на большую дальность.',
      en: 'Accurate 3-round bursts of fast bullets at long range.',
    },
    icon: { shape: 'rifle', color: C.steelL, accent: C.amber },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2.5;
        s.burst = 3;
        s.fireDelay = 0.48;
        s.jitter = 0.015;
        s.shotSpeed = 430;
        s.range = 300;
      },
    },
  },
  {
    id: 'wSmartPistol', kind: 'weapon', quality: 1, tags: ['smart'],
    name: { ru: 'Умный пистолет «Поводок»', en: '"Leash" Smart Pistol' },
    desc: {
      ru: 'Медленные пули с микродвигателями сами доворачивают к ближайшему врагу.',
      en: 'Slow micro-thruster rounds steer themselves toward the nearest enemy.',
    },
    icon: { shape: 'pistol', color: C.grey, accent: C.redL },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2.9;
        s.fireDelay = 0.27;
        s.homing = 4.5;
        s.shotSpeed = 250;
        s.range = 260;
        s.shotColor = C.redL;
      },
    },
  },
  {
    id: 'wRicochet', kind: 'weapon', quality: 1, tags: ['kinetic'],
    name: { ru: 'Силовая винтовка «Бильярд»', en: '"Billiard" Power Rifle' },
    desc: {
      ru: 'Пули рикошетят от стен до 3 раз и летят далеко.',
      en: 'Rounds ricochet off walls up to 3 times and travel far.',
    },
    icon: { shape: 'rifle', color: C.amberD, accent: C.bone },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 3.2;
        s.fireDelay = 0.3;
        s.bounce = 3;
        s.shotSpeed = 360;
        s.range = 380;
        s.shotStyle = 'shard';
        s.shotColor = C.amber;
      },
    },
  },
  {
    id: 'wRevolver', kind: 'weapon', quality: 1, tags: ['kinetic'],
    name: { ru: 'Револьвер «Вдова»', en: '"Widow" Revolver' },
    desc: {
      ru: 'Медленный, но мощный выстрел (8 урона) с шансом крита 20% и сильной отдачей.',
      en: 'Slow but heavy shots (8 damage) with a 20% crit chance and strong knockback.',
    },
    icon: { shape: 'pistol', color: C.redD, accent: C.bone },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 8;
        s.fireDelay = 0.6;
        s.crit = 0.2;
        s.knockback = 70;
        s.shotSpeed = 420;
        s.range = 280;
        s.size = 1.3;
      },
    },
  },
  {
    id: 'wFlareGun', kind: 'weapon', quality: 1, tags: ['fire', 'explosive'],
    name: { ru: 'Ракетница «Факел»', en: '"Torch" Flare Gun' },
    desc: {
      ru: 'Медленная сигнальная ракета поджигает цель и вспыхивает взрывом радиусом 16.',
      en: 'A slow flare ignites its target and bursts in a 16-radius blast.',
    },
    icon: { shape: 'fire', color: C.red, accent: C.yellow },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 3.5;
        s.fireDelay = 0.55;
        s.burn = 6;
        s.explode = 16;
        s.shotSpeed = 190;
        s.range = 210;
        s.size = 1.2;
        s.shotStyle = 'plasma';
        s.shotColor = C.amber;
      },
    },
  },
  {
    id: 'wScrapCannon', kind: 'weapon', quality: 1, tags: ['heavy', 'kinetic'],
    name: { ru: 'Пушка «Свалка»', en: '"Junkyard" Cannon' },
    desc: {
      ru: 'Швыряет 4 куска металлолома: каждый случайного размера, скорости и урона.',
      en: 'Hurls 4 chunks of scrap, each with random size, speed and damage.',
    },
    icon: { shape: 'shotgun', color: C.grey, accent: C.redD },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2.4;
        s.count = 4;
        s.spread = 0.12;
        s.jitter = 0.2;
        s.fireDelay = 0.5;
        s.range = 170;
        s.shotSpeed = 260;
        s.knockback = 45;
        s.shotStyle = 'shard';
        s.shotColor = C.grey;
      },
      fire: (g, angle, s) => {
        const dmg = finalDamage(s);
        for (const base of dirsOf(angle, s)) {
          for (const a of fanAngles(base, s)) {
            const k = 0.6 + Math.random();
            spawnShot(g, a, s, {
              r: 2.5 * s.size * k,
              dmg: dmg * k,
              speed: s.shotSpeed * (0.75 + Math.random() * 0.45),
              style: SCRAP_STYLES[Math.floor(Math.random() * SCRAP_STYLES.length)],
            });
          }
        }
      },
    },
  },
  {
    id: 'wSweeper', kind: 'weapon', quality: 1, tags: ['kinetic'],
    name: { ru: 'Пулемёт «Метла»', en: '"Broom" Machine Gun' },
    desc: {
      ru: 'Ствол сам водит из стороны в сторону: плотная струя пуль метёт широкий сектор.',
      en: 'The barrel swings side to side on its own, sweeping a wide arc with a dense stream.',
    },
    icon: { shape: 'smg', color: C.amberD, accent: C.yellow },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 1.6;
        s.fireDelay = 0.075;
        s.jitter = 0.03;
        s.range = 200;
        s.size = 0.85;
      },
      fire: (g, angle, s) => {
        const sweep = Math.sin(g.time * 9) * 0.42;
        for (const base of dirsOf(angle, s)) for (const a of fanAngles(base + sweep, s)) spawnShot(g, a, s);
      },
    },
  },
  {
    id: 'wHedgehog', kind: 'weapon', quality: 1, tags: ['mutation', 'kinetic'],
    name: { ru: 'Костяной «Ёж»', en: 'Bone "Hedgehog"' },
    desc: {
      ru: 'Выстреливает из тела кольцо из 10 костяных шипов во все стороны. Шипы пробивают одного врага.',
      en: 'Fires a ring of 10 bone spines from your body in all directions. Spines pierce one enemy.',
    },
    icon: { shape: 'spine', color: C.bone, accent: C.redD },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 3.4;
        s.fireDelay = 0.42;
        s.range = 120;
        s.shotSpeed = 260;
        s.pierce = 1;
        s.shotStyle = 'shard';
        s.shotColor = C.bone;
      },
      fire: (g, angle, s) => {
        const n = 10 + (s.count - 1) * 3;
        for (let i = 0; i < n; i++) spawnShot(g, angle + (i / n) * TAU + jit(s.jitter), s);
      },
    },
  },
  {
    id: 'wWeldingTorch', kind: 'weapon', quality: 1, tags: ['fire'],
    name: { ru: 'Сварочный резак', en: 'Welding Cutter' },
    desc: {
      ru: 'Короткий (80) толстый луч режет и поджигает всех перед вами.',
      en: 'A short (80) thick beam cuts and ignites everything in front of you.',
    },
    icon: { shape: 'flame', color: C.steel, accent: C.amber },
    weapon: {
      mode: 'beam',
      stats: (s) => {
        s.damage = 1.0;
        s.fireDelay = 0.06;
        s.range = 80;
        s.size = 1.3;
        s.burn = 3;
        s.knockback = 0;
        s.shotColor = C.amber;
      },
    },
  },
  {
    id: 'wMachete', kind: 'weapon', quality: 1, tags: ['blade'],
    name: { ru: 'Мачете «Гиена»', en: '"Hyena" Machete' },
    desc: {
      ru: 'Быстрые короткие взмахи уличным мачете. Разрезает вражеские пули.',
      en: 'Quick, short swings of a street machete. Cuts enemy bullets.',
    },
    icon: { shape: 'blade', color: C.steelL, accent: C.redD },
    weapon: {
      mode: 'melee',
      stats: (s) => {
        s.damage = 4.2;
        s.fireDelay = 0.25;
        s.size = 0.85;
        s.shotColor = C.bone;
      },
    },
  },
  {
    id: 'wShockBaton', kind: 'weapon', quality: 1, tags: ['electric'],
    name: { ru: 'Шоковая дубинка', en: 'Shock Baton' },
    desc: {
      ru: 'Удар по дуге с 45% шансом оглушить врага и отбросом.',
      en: 'An arc strike with a 45% chance to stun and knock enemies back.',
    },
    icon: { shape: 'lightning', color: C.amberD, accent: C.yellow },
    weapon: {
      mode: 'melee',
      stats: (s) => {
        s.damage = 5.5;
        s.fireDelay = 0.38;
        s.shock = 0.45;
        s.knockback = 45;
        s.size = 0.95;
        s.shotColor = C.yellow;
      },
    },
  },
  {
    id: 'wHarpoon', kind: 'weapon', quality: 1, tags: ['kinetic', 'heavy'],
    name: { ru: 'Гарпун «Китобой»', en: '"Whaler" Harpoon' },
    desc: {
      ru: 'Зарядите и метните гарпун: он пробивает (до 3 врагов при полном заряде) и возвращается, раня снова.',
      en: 'Charge and throw a harpoon: it pierces (up to 3 enemies at full charge) and flies back, hitting again.',
    },
    icon: { shape: 'rifle', color: C.bone, accent: C.steel },
    weapon: {
      mode: 'charge',
      chargeTime: 0.75,
      stats: (s) => {
        s.damage = 5;
        s.shotSpeed = 360;
        s.range = 240;
        s.boomerang = true;
        s.knockback = 110;
        s.size = 1.3;
        s.shotStyle = 'needle';
        s.shotColor = C.bone;
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Необычное (качество 2)

  {
    id: 'wArcThrower', kind: 'weapon', quality: 2, tags: ['electric'],
    name: { ru: 'Дуговой разрядник', en: 'Arc Thrower' },
    desc: {
      ru: 'Рваные разряды на средней дистанции. Молния перескакивает ещё на 2 врагов и может оглушить.',
      en: 'Jagged bolts at mid range. Lightning jumps to 2 more enemies and may stun.',
    },
    icon: { shape: 'coil', color: C.steel, accent: C.yellow },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2.2;
        s.fireDelay = 0.2;
        s.chain = 2;
        s.shock = 0.15;
        s.range = 150;
        s.shotSpeed = 420;
        s.jitter = 0.12;
        s.wave = 3;
        s.waveFreq = 40;
        s.size = 0.8;
        s.shotStyle = 'needle';
        s.shotColor = C.yellow;
      },
    },
  },
  {
    id: 'wPlasmaOrb', kind: 'weapon', quality: 2, tags: ['electric', 'heavy'],
    name: { ru: 'Плазмомёт «Солнце»', en: '"Sun" Plasma Caster' },
    desc: {
      ru: 'Медленный плазменный шар растёт в полёте и проходит сквозь 10 врагов, раня каждого.',
      en: 'A slow plasma orb grows in flight and passes through 10 enemies, hurting each.',
    },
    icon: { shape: 'orb', color: C.redD, accent: C.yellow },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 8;
        s.fireDelay = 0.8;
        s.shotSpeed = 85;
        s.grow = 5;
        s.pierce = 10;
        s.range = 200;
        s.size = 1.4;
        s.knockback = 10;
        s.shotStyle = 'plasma';
        s.shotColor = C.redL;
      },
    },
  },
  {
    id: 'wMineLayer', kind: 'weapon', quality: 2, tags: ['explosive', 'stealth'],
    name: { ru: 'Минный ранец «Капкан»', en: '"Snare" Mine Pack' },
    desc: {
      ru: 'Раскладывает мины у ваших ног. Мина лежит 7 с и взрывается (радиус 30) от касания врага или по таймеру.',
      en: 'Drops mines at your feet. A mine lasts 7 s and explodes (radius 30) on enemy contact or when it expires.',
    },
    icon: { shape: 'bomb', color: C.metal, accent: C.red },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 5;
        s.fireDelay = 0.6;
        s.explode = 30;
        s.shotSpeed = 6;
        s.range = 230;
        s.jitter = 0.4;
        s.knockback = 0;
        s.shotStyle = 'orb';
        s.shotColor = C.red;
      },
      fire: (g, angle, s) => {
        const p = g.player;
        for (const base of dirsOf(angle, s)) {
          for (const a of fanAngles(base, s)) {
            const d = 12 + Math.random() * 8;
            const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
            spawnShot(g, a, s, { x, y, bx: x, by: y, r: 3.5 * s.size, life: 7, maxLife: 7 });
          }
        }
      },
    },
  },
  {
    id: 'wSplitShell', kind: 'weapon', quality: 2, tags: ['kinetic', 'explosive'],
    name: { ru: 'Дробовик «Гроздь»', en: '"Cluster" Shotgun' },
    desc: {
      ru: 'Тяжёлая пуля при попадании разлетается на 6 осколков, задевая соседей.',
      en: 'A heavy slug bursts into 6 shards on impact, hitting nearby enemies.',
    },
    icon: { shape: 'shotgun', color: C.red, accent: C.bone },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 5;
        s.fireDelay = 0.55;
        s.split = 6;
        s.shotSpeed = 300;
        s.range = 220;
        s.size = 1.4;
        s.knockback = 50;
        s.shotStyle = 'pellet';
        s.shotColor = C.amber;
      },
    },
  },
  {
    id: 'wHelix', kind: 'weapon', quality: 2, tags: ['neural', 'electric'],
    name: { ru: 'Волновик «Спираль»', en: '"Helix" Wave Gun' },
    desc: {
      ru: 'Каждый выстрел — две переплетённые синусоидой пули. Пробивают одного врага.',
      en: 'Each shot is a pair of bullets intertwined in a sine wave. They pierce one enemy.',
    },
    icon: { shape: 'wave', color: C.steel, accent: C.violet },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2.3;
        s.fireDelay = 0.2;
        s.wave = 12;
        s.waveFreq = 11;
        s.pierce = 1;
        s.shotSpeed = 280;
        s.range = 250;
        s.shotStyle = 'orb';
        s.shotColor = C.violet;
      },
      fire: (g, angle, s) => {
        for (const base of dirsOf(angle, s)) {
          for (const a of fanAngles(base, s)) {
            spawnShot(g, a, s, { phase: 0 });
            spawnShot(g, a, s, { phase: Math.PI });
          }
        }
      },
    },
  },
  {
    id: 'wBoomerangDisc', kind: 'weapon', quality: 2, tags: ['blade'],
    name: { ru: 'Диск-резак «Возврат»', en: '"Rebound" Disc Cutter' },
    desc: {
      ru: 'Острый диск пролетает сквозь 3 врагов и возвращается в руку, раня их снова.',
      en: 'A sharp disc cuts through 3 enemies and returns to your hand, hitting them again.',
    },
    icon: { shape: 'disc', color: C.steelL, accent: C.amber },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 5;
        s.fireDelay = 0.55;
        s.boomerang = true;
        s.pierce = 3;
        s.shotSpeed = 260;
        s.range = 220;
        s.size = 1.5;
        s.knockback = 20;
        s.shotStyle = 'disc';
        s.shotColor = C.bone;
      },
    },
  },
  {
    id: 'wNeuroNeedler', kind: 'weapon', quality: 2, tags: ['neural', 'stealth'],
    name: { ru: 'Игломёт «Шёпот»', en: '"Whisper" Needler' },
    desc: {
      ru: 'Бесшумные иглы с нейротоксином: цель получает на 25% больше урона от всего.',
      en: 'Silent neurotoxin needles: the target takes 25% more damage from everything.',
    },
    icon: { shape: 'syringe', color: C.bone, accent: C.violet },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 1.5;
        s.fireDelay = 0.11;
        s.hack = 0.25;
        s.shotSpeed = 520;
        s.range = 260;
        s.jitter = 0.04;
        s.size = 0.7;
        s.knockback = 5;
        s.shotStyle = 'needle';
        s.shotColor = C.bone;
      },
    },
  },
  {
    id: 'wGrenadeBouncer', kind: 'weapon', quality: 2, tags: ['explosive'],
    name: { ru: 'Гранатомёт «Попрыгун»', en: '"Bouncer" Grenade Launcher' },
    desc: {
      ru: 'Граната отскакивает от стен (до 3 раз) и взрывается при касании врага или через ~1,3 с (радиус 28).',
      en: 'A grenade bounces off walls (up to 3 times) and explodes on enemy contact or after ~1.3 s (radius 28).',
    },
    icon: { shape: 'bomb', color: C.amberD, accent: C.yellow },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 5;
        s.fireDelay = 0.7;
        s.bounce = 3;
        s.explode = 28;
        s.shotSpeed = 230;
        s.accel = 0.45;
        s.range = 300;
        s.size = 1.5;
        s.shotStyle = 'orb';
        s.shotColor = C.amber;
      },
    },
  },
  {
    id: 'wAcidSpitter', kind: 'weapon', quality: 2, tags: ['mutation'],
    name: { ru: 'Кислотная железа', en: 'Acid Gland' },
    desc: {
      ru: 'Вживлённая железа плюётся виляющими сгустками кислоты: они разъедают (3 урона/с) и замедляют врагов на 30%.',
      en: 'An implanted gland spits wobbling acid globs that corrode (3 dmg/s) and slow enemies by 30%.',
    },
    icon: { shape: 'mutation', color: C.red, accent: C.amber },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2.4;
        s.fireDelay = 0.3;
        s.burn = 3;
        s.slow = 0.3;
        s.shotSpeed = 210;
        s.range = 190;
        s.wave = 3;
        s.waveFreq = 18;
        s.jitter = 0.08;
        s.size = 1.1;
        s.shotStyle = 'orb';
        s.shotColor = C.red;
      },
    },
  },
  {
    id: 'wTwinBeam', kind: 'weapon', quality: 2, tags: ['optic'],
    name: { ru: 'Лазер «Ножницы»', en: '"Scissors" Laser' },
    desc: {
      ru: 'Два расходящихся луча. Вблизи оба режут одну цель, вдали накрывают широкий сектор.',
      en: 'Two diverging beams. Up close both cut one target; far away they cover a wide sector.',
    },
    icon: { shape: 'laser', color: C.steelL, accent: C.redL },
    weapon: {
      mode: 'beam',
      stats: (s) => {
        s.damage = 0.9;
        s.fireDelay = 0.07;
        s.count = 2;
        s.spread = 0.2;
        s.range = 250;
        s.size = 0.7;
        s.knockback = 0;
        s.shotColor = C.redL;
      },
    },
  },
  {
    id: 'wTeslaBeam', kind: 'weapon', quality: 2, tags: ['electric'],
    name: { ru: 'Тесла-проектор', en: 'Tesla Projector' },
    desc: {
      ru: 'Короткий (140) электрический луч. Молния с каждой цели бьёт ещё 2 врагов и иногда оглушает.',
      en: 'A short (140) electric beam. Lightning from each target strikes 2 more enemies and sometimes stuns.',
    },
    icon: { shape: 'lightning', color: C.yellow, accent: C.bone },
    weapon: {
      mode: 'beam',
      stats: (s) => {
        s.damage = 1.1;
        s.fireDelay = 0.09;
        s.chain = 2;
        s.shock = 0.05;
        s.range = 140;
        s.size = 0.9;
        s.knockback = 0;
        s.shotColor = C.yellow;
      },
    },
  },
  {
    id: 'wMonowire', kind: 'weapon', quality: 2, tags: ['blade', 'stealth'],
    name: { ru: 'Мономолекулярная нить', en: 'Monowire' },
    desc: {
      ru: 'Невидимая нить хлещет узким ударом на большую дистанцию; разряд перескакивает на ещё одного врага.',
      en: 'An invisible wire lashes in a narrow strike at long reach; a spark jumps to one more enemy.',
    },
    icon: { shape: 'whip', color: C.grey, accent: C.redL },
    weapon: {
      mode: 'melee',
      stats: (s) => {
        s.damage = 6.5;
        s.fireDelay = 0.45;
        s.size = 1.9;
        s.spread = -0.9;
        s.chain = 1;
        s.knockback = 10;
        s.shotColor = C.redL;
      },
    },
  },
  {
    id: 'wPowerFist', kind: 'weapon', quality: 2, tags: ['heavy', 'kinetic'],
    name: { ru: 'Гидрокулак «Пресс»', en: '"Press" Hydraulic Fist' },
    desc: {
      ru: 'Медленный сокрушительный удар (10 урона): мощно отбрасывает и бьёт ударной волной по соседям.',
      en: 'A slow crushing punch (10 damage): huge knockback and a shockwave that hits nearby enemies.',
    },
    icon: { shape: 'arm', color: C.steel, accent: C.amber },
    weapon: {
      mode: 'melee',
      stats: (s) => {
        s.damage = 10;
        s.fireDelay = 0.62;
        s.knockback = 110;
        s.explode = 18;
        s.size = 0.9;
        s.spread = -0.5;
        s.shotColor = C.amber;
      },
    },
  },
  {
    id: 'wChargeShotgun', kind: 'weapon', quality: 2, tags: ['electric', 'kinetic'],
    name: { ru: 'Конденсатор «Вспышка»', en: '"Flash" Capacitor Gun' },
    desc: {
      ru: 'Зарядите: залп из 3–8 электрических дробин. Чем дольше заряд, тем больше дробин и сильнее каждая.',
      en: 'Charge up for a blast of 3–8 electric pellets. Longer charge means more and stronger pellets.',
    },
    icon: { shape: 'shotgun', color: C.amber, accent: C.yellow },
    weapon: {
      mode: 'charge',
      chargeTime: 0.85,
      stats: (s) => {
        s.damage = 1.9;
        s.count = 3;
        s.spread = 0.13;
        s.jitter = 0.05;
        s.shotSpeed = 340;
        s.range = 170;
        s.shock = 0.1;
        s.knockback = 40;
        s.shotStyle = 'pellet';
        s.shotColor = C.yellow;
      },
      fire: (g, angle, s) => {
        const k = chargeK(g, s);
        const dmg = finalDamage(g.player.stats) * (0.6 + 0.6 * k);
        const n = s.count + Math.round(k * 5);
        for (const base of dirsOf(angle, s)) {
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * s.spread + jit(s.jitter);
            spawnShot(g, a, s, { dmg, speed: s.shotSpeed * (0.85 + Math.random() * 0.3) });
          }
        }
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Редкое (качество 3)

  {
    id: 'wMinigun', kind: 'weapon', quality: 3, tags: ['heavy', 'kinetic'],
    name: { ru: 'Миниган «Жернова»', en: '"Millstone" Minigun' },
    desc: {
      ru: 'Раскручивается около секунды, затем поливает свинцом без остановки. Тяжёлый: вы двигаетесь медленнее.',
      en: 'Spins up for about a second, then pours out lead nonstop. Heavy: you move slower.',
    },
    icon: { shape: 'smg', color: C.metal, accent: C.red },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 1.5;
        s.fireDelay = 0.06;
        s.jitter = 0.14;
        s.shotSpeed = 380;
        s.range = 240;
        s.size = 0.8;
        s.knockback = 15;
        s.speed = 125;
      },
      fire: (g, angle, s) => {
        if (g.time - spinLast > 0.35 || g.time < spinLast) spinStart = g.time;
        spinLast = g.time;
        const k = Math.min(1, (g.time - spinStart) / 1.0);
        if (Math.random() > 0.2 + 0.8 * k) return;
        fan(g, angle, s);
      },
    },
  },
  {
    id: 'wOrbitSaws', kind: 'weapon', quality: 3, tags: ['blade', 'nano'],
    name: { ru: 'Пилы-спутники «Хоровод»', en: '"Round Dance" Satellite Saws' },
    desc: {
      ru: 'Выпускает дисковые пилы, которые 2,6 с кружат вокруг вас по расширяющейся орбите, пронзая врагов.',
      en: 'Releases saw discs that circle you on a widening orbit for 2.6 s, slicing through enemies.',
    },
    icon: { shape: 'disc', color: C.red, accent: C.bone },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 4;
        s.fireDelay = 0.4;
        s.shotSpeed = 150;
        s.range = 390;
        s.pierce = 99;
        s.size = 1.3;
        s.knockback = 25;
        s.shotStyle = 'disc';
        s.shotColor = C.bone;
      },
      fire: (g, angle, s) => {
        for (let i = 0; i < s.count; i++) {
          spawnShot(g, angle, s, { orbitR: 18 + s.orbit, orbitA: angle + (i / s.count) * TAU });
        }
      },
    },
  },
  {
    id: 'wNanoSwarm', kind: 'weapon', quality: 3, tags: ['nano', 'smart'],
    name: { ru: 'Рой нанитов', en: 'Nanite Swarm' },
    desc: {
      ru: 'Выпускает облачко из 4 самонаводящихся нанитов, которые сами находят врагов.',
      en: 'Releases a cloud of 4 homing nanites that hunt enemies down on their own.',
    },
    icon: { shape: 'drone', color: C.grey, accent: C.amber },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 1.2;
        s.count = 4;
        s.spread = 0.25;
        s.jitter = 0.5;
        s.fireDelay = 0.32;
        s.homing = 6;
        s.shotSpeed = 170;
        s.range = 260;
        s.wave = 4;
        s.waveFreq = 20;
        s.size = 0.6;
        s.knockback = 0;
        s.shotStyle = 'pellet';
        s.shotColor = C.bone;
      },
    },
  },
  {
    id: 'wDervish', kind: 'weapon', quality: 3, tags: ['kinetic', 'neural'],
    name: { ru: 'Турель-карусель «Дервиш»', en: '"Dervish" Carousel Turret' },
    desc: {
      ru: 'Стреляет прицельно и одновременно выпускает два потока пуль, вращающихся вокруг вас.',
      en: 'Fires where you aim while two streams of bullets spin around you.',
    },
    icon: { shape: 'gear', color: C.steel, accent: C.yellow },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 1.7;
        s.fireDelay = 0.11;
        s.range = 200;
        s.shotSpeed = 280;
      },
      fire: (g, angle, s) => {
        fan(g, angle, s);
        const r = g.time * 5;
        const dmg = finalDamage(s) * 0.8;
        spawnShot(g, r, s, { dmg, style: 'pellet' });
        spawnShot(g, r + Math.PI, s, { dmg, style: 'pellet' });
      },
    },
  },
  {
    id: 'wMicroMissiles', kind: 'weapon', quality: 3, tags: ['smart', 'explosive'],
    name: { ru: 'Ракетный рой «Осиное гнездо»', en: '"Wasp Nest" Micro-Missiles' },
    desc: {
      ru: 'Залп из 3 самонаводящихся микроракет: они разгоняются и взрываются (радиус 14).',
      en: 'A salvo of 3 homing micro-missiles that accelerate and explode (radius 14).',
    },
    icon: { shape: 'rocket', color: C.steelL, accent: C.yellow },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 2.4;
        s.count = 3;
        s.spread = 0.5;
        s.jitter = 0.2;
        s.fireDelay = 0.72;
        s.homing = 5;
        s.explode = 14;
        s.shotSpeed = 110;
        s.accel = 2.4;
        s.range = 320;
        s.shotStyle = 'rocket';
        s.shotColor = C.red;
      },
      fire: (g, angle, s) => {
        for (const base of dirsOf(angle, s)) {
          for (const a of fanAngles(base, s)) spawnShot(g, a, s, { speed: s.shotSpeed * (0.8 + Math.random() * 0.4) });
        }
      },
    },
  },
  {
    id: 'wHackBeam', kind: 'weapon', quality: 3, tags: ['neural', 'smart'],
    name: { ru: 'Нейролуч «Троян»', en: '"Trojan" Neural Beam' },
    desc: {
      ru: 'Слабый самонаводящийся луч взламывает цель: +35% получаемого урона и замедление на 35%.',
      en: 'A weak auto-aiming beam hacks its target: +35% damage taken and a 35% slow.',
    },
    icon: { shape: 'brain', color: C.grey, accent: C.violet },
    weapon: {
      mode: 'beam',
      stats: (s) => {
        s.damage = 0.8;
        s.fireDelay = 0.07;
        s.hack = 0.35;
        s.slow = 0.35;
        s.homing = 4;
        s.range = 230;
        s.size = 0.6;
        s.knockback = 0;
        s.shotColor = C.violet;
      },
    },
  },
  {
    id: 'wSolarLance', kind: 'weapon', quality: 3, tags: ['optic', 'fire'],
    name: { ru: 'Импульсное копьё «Зенит»', en: '"Zenith" Pulse Lance' },
    desc: {
      ru: 'Редкие толстые импульсы (6 урона) пробивают врагов, поджигают и взрываются у стены.',
      en: 'Slow, thick pulses (6 damage) pierce enemies, ignite them and explode at the wall.',
    },
    icon: { shape: 'laser', color: C.amber, accent: C.yellow },
    weapon: {
      mode: 'beam',
      stats: (s) => {
        s.damage = 6;
        s.fireDelay = 0.36;
        s.size = 2.2;
        s.burn = 4;
        s.explode = 20;
        s.pierce = 2;
        s.range = 300;
        s.knockback = 60;
        s.shotColor = C.yellow;
      },
    },
  },
  {
    id: 'wMantis', kind: 'weapon', quality: 3, tags: ['blade', 'mutation'],
    name: { ru: 'Клинки «Богомол»', en: '"Mantis" Arm Blades' },
    desc: {
      ru: 'Выдвижные клинки из предплечий: быстрые широкие взмахи, каждый бросает 2 режущие волны.',
      en: 'Forearm blades: fast, wide slashes that each throw 2 cutting waves.',
    },
    icon: { shape: 'claw', color: C.bone, accent: C.red },
    weapon: {
      mode: 'melee',
      stats: (s) => {
        s.damage = 4.5;
        s.fireDelay = 0.24;
        s.count = 2;
        s.split = 2;
        s.shotColor = C.red;
      },
    },
  },
  {
    id: 'wChainsaw', kind: 'weapon', quality: 3, tags: ['blade', 'heavy'],
    name: { ru: 'Цепная пила «Мясорубка»', en: '"Grinder" Chainsaw' },
    desc: {
      ru: 'Непрерывно грызёт всё прямо перед вами, замедляя врагов и перемалывая вражеские пули.',
      en: 'Grinds everything right in front of you nonstop, slowing enemies and shredding enemy bullets.',
    },
    icon: { shape: 'blade', color: C.amberD, accent: C.red },
    weapon: {
      mode: 'melee',
      stats: (s) => {
        s.damage = 1.5;
        s.fireDelay = 0.075;
        s.size = 0.8;
        s.spread = -0.6;
        s.slow = 0.3;
        s.knockback = 3;
        s.shotColor = C.amber;
      },
    },
  },
  {
    id: 'wPlasmaMortar', kind: 'weapon', quality: 3, tags: ['explosive', 'fire'],
    name: { ru: 'Плазменная мортира «Нова»', en: '"Nova" Plasma Mortar' },
    desc: {
      ru: 'Зарядите: сгусток плазмы тормозит в полёте и взрывается, поджигая. Радиус взрыва растёт с зарядом (до 38).',
      en: 'Charge it: a plasma glob slows in flight and explodes, igniting. Blast radius grows with charge (up to 38).',
    },
    icon: { shape: 'orb', color: C.amber, accent: C.redL },
    weapon: {
      mode: 'charge',
      chargeTime: 1.0,
      stats: (s) => {
        s.damage = 5;
        s.shotSpeed = 170;
        s.accel = 0.4;
        s.range = 240;
        s.explode = 38;
        s.burn = 3;
        s.grow = 3;
        s.size = 1.4;
        s.shotStyle = 'plasma';
        s.shotColor = C.amber;
      },
      fire: (g, angle, s) => {
        const k = chargeK(g, s);
        fan(g, angle, s, {
          explode: s.explode * (0.45 + 0.55 * k),
          r: 2.5 * s.size * (0.7 + 0.9 * k),
          pierce: s.pierce + Math.floor(k * 2),
        });
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Очень редкое (качество 4)

  {
    id: 'wBlackIce', kind: 'weapon', quality: 4, tags: ['neural', 'smart'],
    name: { ru: 'Вирус «Чёрный лёд»', en: '"Black ICE" Virus' },
    desc: {
      ru: 'Самонаводящиеся пакеты взламывают цель (+30% урона по ней). Убитый враг выбрасывает 4 самонаводящихся осколка вируса.',
      en: 'Homing packets hack the target (+30% damage taken). Slain enemies burst into 4 homing virus shards.',
    },
    icon: { shape: 'skull', color: C.bone, accent: C.violet },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 4;
        s.fireDelay = 0.38;
        s.homing = 2.5;
        s.hack = 0.3;
        s.shotSpeed = 260;
        s.range = 280;
        s.shotStyle = 'shard';
        s.shotColor = C.violet;
      },
    },
    hooks: {
      onKill: (g, e) => {
        const s = g.player.stats;
        const dmg = finalDamage(s) * 0.6;
        for (let i = 0; i < 4; i++) {
          spawnShot(g, (i / 4) * TAU + Math.random(), s, {
            x: e.x, y: e.y, bx: e.x, by: e.y, dmg, r: 1.8, speed: 200,
            life: 0.9, maxLife: 0.9, homing: 6 + s.homing, isChild: true,
            split: 0, explode: 0, orbitR: 0, boomerang: false, style: 'shard', color: C.violet,
          });
        }
      },
    },
  },
  {
    id: 'wOrbitalStrike', kind: 'weapon', quality: 4, tags: ['optic', 'explosive'],
    name: { ru: 'Целеуказатель «Небесный суд»', en: '"Heaven\'s Verdict" Target Designator' },
    desc: {
      ru: 'Наводит орбитальный удар на ближайшего врага перед вами: двойной взрыв радиусом 34 — сразу и через 0,45 с.',
      en: 'Calls an orbital strike on the nearest enemy ahead: a double blast of radius 34, now and 0.45 s later.',
    },
    icon: { shape: 'crosshair', color: C.red, accent: C.yellow },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 6;
        s.fireDelay = 0.8;
        s.explode = 34;
        s.range = 230;
        s.knockback = 0;
        s.shotStyle = 'orb';
        s.shotColor = C.redL;
      },
      fire: (g, angle, s) => {
        const p = g.player;
        const x0 = p.x, y0 = p.y - 3;
        let best: { x: number; y: number } | null = null;
        let bd = Infinity;
        for (const e of g.enemies) {
          if (e.dead || e.spawn > 0) continue;
          const dx = e.x - x0, dy = e.y - y0;
          const d = Math.hypot(dx, dy);
          if (d > s.range || d >= bd) continue;
          if (Math.abs(angleDiff(angle, Math.atan2(dy, dx))) > 0.5) continue;
          bd = d;
          best = e;
        }
        let tx: number, ty: number;
        if (best) {
          tx = best.x;
          ty = best.y;
        } else {
          const len = Math.max(0, raycast(g.room, x0, y0, angle, s.range * 0.6) - 6);
          tx = x0 + Math.cos(angle) * len;
          ty = y0 + Math.sin(angle) * len;
        }
        for (let i = 0; i < s.count; i++) {
          const x = tx + (i ? jit(18) : 0), y = ty + (i ? jit(18) : 0);
          g.fx.ring(x, y, C.red, s.explode, 0.45);
          spawnShot(g, angle, s, { x, y, bx: x, by: y, speed: 0, r: 3, life: 0.45, maxLife: 0.45, pierce: 99 });
        }
      },
    },
  },
  {
    id: 'wPrism', kind: 'weapon', quality: 4, tags: ['optic', 'stealth'],
    name: { ru: 'Фазовая «Призма»', en: 'Phase "Prism"' },
    desc: {
      ru: 'Три расходящихся фазовых луча проходят сквозь стены и укрытия.',
      en: 'Three diverging phase beams pass through walls and cover.',
    },
    icon: { shape: 'eye', color: C.amber, accent: C.bone },
    weapon: {
      mode: 'beam',
      stats: (s) => {
        s.damage = 0.75;
        s.fireDelay = 0.07;
        s.count = 3;
        s.spread = 0.28;
        s.spectral = true;
        s.range = 240;
        s.size = 0.7;
        s.knockback = 0;
        s.shotColor = C.yellow;
      },
    },
  },
  {
    id: 'wSingularity', kind: 'weapon', quality: 4, tags: ['heavy', 'nano'],
    name: { ru: 'Генератор «Сингулярность»', en: '"Singularity" Generator' },
    desc: {
      ru: 'Зарядите: медленная гравитационная сфера притягивает врагов, ранит всех на пути и в конце взрывается (радиус до 44).',
      en: 'Charge it: a slow gravity sphere pulls enemies in, hurts everything it touches and finally explodes (radius up to 44).',
    },
    icon: { shape: 'core', color: C.violet, accent: C.bone },
    weapon: {
      mode: 'charge',
      chargeTime: 1.3,
      stats: (s) => {
        s.damage = 5;
        s.shotSpeed = 70;
        s.range = 160;
        s.pierce = 99;
        s.grow = 4;
        s.explode = 44;
        s.size = 1.6;
        s.knockback = 0;
        s.shotStyle = 'plasma';
        s.shotColor = C.violet;
      },
      fire: (g, angle, s) => {
        const k = chargeK(g, s);
        for (const base of dirsOf(angle, s)) {
          for (const a of fanAngles(base, s)) {
            const b = spawnShot(g, a, s, {
              r: 2.5 * s.size * (0.7 + 0.8 * k),
              explode: s.explode * (0.6 + 0.4 * k),
            });
            wells.add(b);
          }
        }
      },
    },
    hooks: {
      tick: (g, dt) => {
        for (const b of g.pbullets) {
          if (b.dead || !wells.has(b)) continue;
          const R = 60 + b.r * 2;
          for (const e of g.enemies) {
            if (e.dead || e.spawn > 0 || e.def.boss) continue;
            const dx = b.x - e.x, dy = b.y - e.y;
            const d = Math.hypot(dx, dy);
            if (d > R || d < 3) continue;
            const f = (e.def.heavy ? 0.35 : 1) * 95 * dt * (1 - (d / R) * 0.5);
            e.kx += (dx / d) * f;
            e.ky += (dy / d) * f;
          }
        }
      },
    },
  },
];
