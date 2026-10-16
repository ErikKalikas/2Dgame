// Характеристики игрока и его выстрелов. Пересчитываются при каждом изменении снаряжения:
// база → оружие → импланты → модификации (пассивки) → синергии.

export type ShotStyle = 'bolt' | 'orb' | 'needle' | 'pellet' | 'flame' | 'rocket' | 'disc' | 'shard' | 'wave' | 'plasma';

export interface Stats {
  // передвижение и защита
  speed: number;
  focusSpeed: number;
  hitR: number;
  dashCd: number;
  dashDist: number;
  maxLives: number;
  /** Сбой: длительность выпадения из системы (с), радиус переписывания пуль, скорость заряда, урон переписанных пуль */
  glitchTime: number;
  glitchRadius: number;
  glitchGain: number;
  glitchPower: number;
  /** Энергощит: сколько попаданий поглощается в каждой комнате */
  shield: number;
  /** Шанс полностью избежать попадания */
  dodge: number;
  /** Боевые дроны вокруг игрока, сами стреляют по ближайшему врагу */
  drones: number;

  // выстрел
  damage: number;
  damageMult: number;
  fireDelay: number;
  fireRateMult: number;
  shotSpeed: number;
  range: number; // дальность в пикселях
  size: number; // множитель размера снаряда
  count: number; // снарядов за выстрел
  spread: number; // угол между снарядами (рад)
  jitter: number; // случайный разброс (рад)
  burst: number; // выстрелов очередью

  // траектории и поведение снарядов
  pierce: number;
  bounce: number;
  homing: number; // скорость доворота (рад/с)
  wave: number; // амплитуда синусоиды (px)
  waveFreq: number;
  spiral: number; // закручивание траектории (рад/с)
  orbit: number; // снаряды кружат вокруг игрока (радиус)
  boomerang: boolean;
  spectral: boolean; // сквозь препятствия
  accel: number; // ускорение снаряда (множитель в секунду, 1 = нет)
  grow: number; // рост размера в секунду
  backShot: boolean;
  sideShots: boolean;

  // эффекты попадания
  split: number; // при попадании распадается на N осколков
  explode: number; // радиус взрыва
  chain: number; // молния перескакивает на N целей
  burn: number; // урон поджога в секунду
  shock: number; // шанс оглушения
  slow: number; // замедление 0..1
  hack: number; // уязвимость: цель получает +X урона
  knockback: number;
  crit: number; // шанс крита
  critMult: number;
  lifesteal: number; // шанс вернуть жизнь при убийстве (очень малый)

  // экономика
  magnet: number;
  coinMult: number;
  xpMult: number;
  luck: number;

  shotStyle: ShotStyle;
  shotColor: string;
}

export function baseStats(): Stats {
  return {
    speed: 150,
    focusSpeed: 62,
    hitR: 2,
    dashCd: 0.9,
    dashDist: 56,
    maxLives: 4,
    glitchTime: 2,
    glitchRadius: 70,
    glitchGain: 1,
    glitchPower: 6,
    shield: 0,
    dodge: 0,
    drones: 0,

    damage: 3.5,
    damageMult: 1,
    fireDelay: 0.28,
    fireRateMult: 1,
    shotSpeed: 330,
    range: 230,
    size: 1,
    count: 1,
    spread: 0.14,
    jitter: 0.03,
    burst: 1,

    pierce: 0,
    bounce: 0,
    homing: 0,
    wave: 0,
    waveFreq: 14,
    spiral: 0,
    orbit: 0,
    boomerang: false,
    spectral: false,
    accel: 1,
    grow: 0,
    backShot: false,
    sideShots: false,

    split: 0,
    explode: 0,
    chain: 0,
    burn: 0,
    shock: 0,
    slow: 0,
    hack: 0,
    knockback: 30,
    crit: 0.04,
    critMult: 2,
    lifesteal: 0,

    magnet: 40,
    coinMult: 1,
    xpMult: 1,
    luck: 0,

    shotStyle: 'bolt',
    shotColor: '#ffcc33',
  };
}

/** Окончательные значения с учётом множителей и ограничений */
export function finalDamage(s: Stats): number {
  return Math.max(0.5, s.damage * s.damageMult);
}

export function finalFireDelay(s: Stats): number {
  return Math.max(0.035, s.fireDelay / Math.max(0.1, s.fireRateMult));
}
