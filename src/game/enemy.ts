import type { L } from '../core/i18n';
import type { Sprite } from '../gfx/sprite';
import type { Game } from './game';

export interface BossPhase {
  name: L;
  /** Доля HP, при которой фаза заканчивается (1 → 0) */
  until: number;
  update(e: Enemy, g: Game, dt: number): void;
  enter?(e: Enemy, g: Game): void;
}

export interface EnemyDef {
  id: string;
  name: L;
  hp: number;
  speed: number;
  /** Радиус тела (столкновения и попадания) */
  r: number;
  flying?: boolean;
  xp: number;
  /** Сколько монет выпадает в среднем */
  coins: number;
  /** С какого этажа появляется (1..8) и вес в пуле */
  minFloor: number;
  weight: number;
  /** Стоимость в "бюджете" комнаты */
  cost: number;
  /** Сколько штук появляется за раз */
  group?: [number, number];
  frames: () => Sprite[];
  update(e: Enemy, g: Game, dt: number): void;
  /** Урон при касании (по умолчанию да) */
  contact?: boolean;
  /** Не двигается от отдачи */
  heavy?: boolean;
  boss?: boolean;
  phases?: BossPhase[];
  /** Модификатор входящего урона (например, щит спереди) */
  damageTaken?(e: Enemy, g: Game, dmg: number, fromX: number, fromY: number): number;
  onDeath?(e: Enemy, g: Game): void;
}

let NEXT_ID = 1;

export class Enemy {
  id = NEXT_ID++;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  r: number;
  hp: number;
  maxHp: number;
  t = 0;
  /** Память конкретного ИИ (таймеры, состояние) */
  mem: Record<string, any> = {};
  facing = 1;
  flash = 0;
  /** Анимация появления: пока > 0 враг неуязвим и безвреден */
  spawn = 0.6;
  dead = false;
  anim = 0;
  /** Над землёй (прыжок) — не сталкивается и не получает урон */
  airborne = false;
  hidden = false;
  phase = 0;
  phaseT = 0;
  // статусы
  burnT = 0;
  burnDps = 0;
  slowT = 0;
  slowK = 0;
  shockT = 0;
  hackT = 0;
  hackK = 0;
  kx = 0;
  ky = 0;
  frames: Sprite[];

  constructor(public def: EnemyDef, x: number, y: number, hpMult: number) {
    this.x = x;
    this.y = y;
    this.r = def.r;
    this.hp = this.maxHp = Math.round(def.hp * hpMult);
    this.frames = def.frames();
  }

  get speedMult(): number {
    let m = 1;
    if (this.slowT > 0) m *= 1 - this.slowK;
    if (this.shockT > 0) m *= 0.1;
    return m;
  }

  /** Может ли сейчас действовать (не появляется и не оглушён) */
  get active(): boolean {
    return this.spawn <= 0 && this.shockT <= 0;
  }
}
