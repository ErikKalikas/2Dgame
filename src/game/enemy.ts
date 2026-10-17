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
  /** Киборг роняет модули и оружие, робот — прошивки (этап 12) */
  kind?: 'cyborg' | 'robot';
  /** Класс ценности I–IV: шанс дропа и размер набора (3/4/5/6 предметов) */
  value?: 1 | 2 | 3 | 4;
  /** Набор врага: id предметов; первые три — «ядро набора» (первая ступень синергии) */
  drops?: string[];
  /** Лобовой щит: какую долю урона спереди (±FRONT_ARC от взгляда) он гасит */
  frontShield?: number;
  /** Модификатор входящего урона (например, щит спереди) */
  damageTaken?(e: Enemy, g: Game, dmg: number, fromX: number, fromY: number): number;
  onDeath?(e: Enemy, g: Game): void;
  /**
   * Своя отрисовка из нескольких частей (вместо одного кадра). x, y — левый верхний угол
   * кадра frames[0] на экране; fx — преобразование спрайта (вспышка попадания).
   */
  draw?(e: Enemy, g: Game, ctx: CanvasRenderingContext2D, x: number, y: number, fx: (s: Sprite) => Sprite): void;
}

let NEXT_ID = 1;

/** Сторона: foe — враг игрока, ally — союзник (вызванный предметом или «сорванный с поводка») */
export type Team = 'foe' | 'ally';

/** Стак эффекта предмета на враге (насечки, блохи, укусы, пеленг, отметки): число и таймер */
export interface Stack {
  n: number;
  t: number;
}

/** Подброс («Катапульта»): пока враг в воздухе, урон копится и наносится при падении */
export interface Toss {
  t: number;
  dur: number;
  h: number;
  /** Урон, набранный в воздухе */
  acc: number;
  onLand?: (e: Enemy, acc: number) => void;
}

/** Чем добит враг: для предметов («убийство вплотную», «вашим взрывом», «убийство резом») */
export interface LastHit {
  source: string;
  tag?: string;
  by: 'player' | 'ally' | 'foe';
}

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
  /** Комната уровня, к которой привязан враг (-1 — ещё не определена, -2 — коридор) */
  home = -1;
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
  /** Элита (этап 13): гарантированный дроп одного предмета набора */
  elite = false;
  /** Агрессивен к игроку (этап 13 — преследование); пока считаем, что все живые враги в бою */
  aggro = true;
  /** Мини-босс (этап 14а): контроль действует на него слабее, как на босса */
  miniboss = false;
  /** Свой-чужой: союзник бьёт врагов, враги — его; игрок союзника не ранит */
  team: Team = 'foe';
  /** Сколько ещё длится союз (с). Сорванный враг потом возвращается к врагам, вызванный союзник гибнет */
  allyT = 0;
  /** Союзник, вызванный игроком (не враг комнаты: не держит двери, без награды за смерть) */
  summon = false;
  /** Вызванный союзник живёт до конца этой комнаты (зачистка или уход игрока) */
  allyRoom = -1;
  /** Стаки эффектов предметов по ключу */
  stacks = new Map<string, Stack>();
  /** Подброшен в воздух */
  toss: Toss | null = null;
  /** Лобовой щит опущен (с) */
  shieldOff = 0;
  /** Открыт со всех сторон (с): любое попадание засчитывается как сбоку */
  exposedT = 0;
  /** Привод повреждён: доля потери скорости движения и поворота (0..1) и сколько ещё (с) */
  driveK = 0;
  driveT = 0;
  /** Последнее попадание (для предметов, реагирующих на способ убийства) */
  lastHit: LastHit | null = null;
  /** Перезарядка касания союзника/врага в драке между ними */
  brawlCd = 0;
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
    if (this.driveT > 0) m *= 1 - this.driveK;
    return m;
  }

  /** Может ли сейчас действовать (не появляется, не оглушён и не в воздухе после подброса) */
  get active(): boolean {
    return this.spawn <= 0 && this.shockT <= 0 && !this.toss;
  }

  /** Союзник игрока */
  get ally(): boolean {
    return this.team === 'ally';
  }

  /** Направление взгляда (рад); ведёт Game.updateEnemies, поворот с конечной скоростью */
  get face(): number {
    return this.mem.face ?? 0;
  }
}
