import { FLOORS, TILE, VIEW_H, VIEW_W } from '../config';
import { FLOOR_THEMES, type FloorTheme } from '../content/floors';
import { angleDiff, angleTo, clamp, dist2, turnTowards } from '../core/math';
import { RNG } from '../core/rng';
import type { Difficulty } from '../core/storage';
import { C } from '../gfx/palette';
import { LevelCanvas } from '../gfx/roomrender';
import { input } from '../core/input';
import { generateLevel, type LevelPlan, type LevelRoom } from '../world/levelgen';
import { buildLevel, nearestWalkable, type LevelMap } from '../world/level';
import { BATTLE, ROLES } from '../world/roles';
import { T, walkable } from '../world/tiles';
import { updateEBullets, updatePBullets, type EBullet, type PBullet } from './bullets';
import { collidePlayerShots, damageEnemy, explode, fireWeapon, spawnShot } from './combat';
import { baseStats, finalDamage } from './stats';
import { LOG, LOG_MAX, LOG_TIME, type LogLine } from './log';
import type { L } from '../core/i18n';
import type { Enemy } from './enemy';
import { FxSystem } from './fx';
import { SLOT_NAME, item, itemsOfKind, type IncomingHit, type ItemDef, type Slot } from './items';
import { distToSegment, moveBody } from './collision';
import { FlowField } from './pathfinding';
import { Player } from './player';
import { bossReward, dropLoot, furnishRoom, makePickup, populateRoom, roomClearReward, type Pickup } from './spawn';
import { DropState, enemyDrop } from './drops';
import { UnstableState, onFloorStart, onLifeLost, updateInstability } from './instability';
import { updateObjs, type WorldObj } from './objects';
import { FACE_TURN, tickStacks, updateToss } from './status';
import { asActor, setAim, updateTeams } from './team';

export interface DiffParams {
  speed: number;
  density: number;
  aim: number;
  cooldown: number;
}

const DIFFS: Record<Difficulty, DiffParams> = {
  // средняя: враги "тупее" — медленнее и реже стреляют, меньше пуль, хуже целятся
  normal: { speed: 0.82, density: 0.72, aim: 0.2, cooldown: 1.3 },
  hard: { speed: 1, density: 1, aim: 0.03, cooldown: 1 },
};

export type GameState = 'play' | 'dying' | 'dead' | 'won' | 'floorFade';

/** Сколько держать R у терминала, чтобы открыть гермодверь петли (с) */
export const TERMINAL_TIME = 1.5;
/** Дальше этого (px) от игрока обычные враги не действуют */
const SLEEP_R = 420;

/** Какой босс (номер уровня) открывает систему тела */
const SYSTEM_BY_FLOOR: Record<number, Slot> = { 2: 'blood', 4: 'tentacles', 6: 'nervous', 8: 'reactor' };

/** Пролёт пули ближе этого (px от края хитбокса) заряжает сбой */
const GRAZE = 14;
/** Аварийное окно сбоя после попадания (с) */
const EMERGENCY = 0.15;

/** Опыт до следующего уровня */
export function xpNeed(level: number): number {
  return Math.round(10 + level * 7 + level * level * 0.6);
}

/** Один забег: 9 уровней Улья, генерируемых из seed */
export class Game {
  readonly rng: RNG;
  readonly diff: DiffParams;
  readonly hard: boolean;
  floorNum = 1;
  plan!: LevelPlan;
  theme!: FloorTheme;
  /** Карта всего уровня. Имя осталось с тех пор, как уровень был набором комнат: им пользуются ИИ, пули, оружие */
  room!: LevelMap;
  /** Статичный слой уровня (куски холста) */
  gfx!: LevelCanvas;
  /** Комната, в которой стоит игрок; null — коридор */
  zone: LevelRoom | null = null;
  /** Комната, двери которой закрыты на время боя (засада, элита, мини-босс, босс) */
  lockedRoom: LevelRoom | null = null;
  /** Сколько схронов открыто на уровне (первый на 1-м уровне — со скелетом класса 2) */
  cachesOpened = 0;
  flow!: FlowField;
  player: Player;
  enemies: Enemy[] = [];
  ebullets: EBullet[] = [];
  /** Пули союзников (свой-чужой): летят по врагам, игрока не ранят */
  abullets: EBullet[] = [];
  pbullets: PBullet[] = [];
  /** Объекты игрока в мире: вертушки, лужи, миньоны, приманка, сцепка (objects.ts) */
  objs: WorldObj[] = [];
  /** Кто сейчас действует (ИИ врага) и куда он целится: игрок, приманка, союзник или враг союзника */
  actor: Enemy | null = null;
  aimX = 0;
  aimY = 0;
  /** Цель — игрок (наземным можно идти по полю путей) */
  aimPlayer = true;
  /** Цели нет (союзник без врагов рядом): не стрелять */
  aimNone = false;
  /** Состояние предметов на забег (счётчики, таймеры): вместо переменных модулей контента */
  mem: Record<string, any> = {};
  /** Идёт залп оружия (fireWeapon): создаваемые снаряды — «основные» */
  inVolley = false;
  pickups: Pickup[] = [];
  fx = new FxSystem();
  camX = 0;
  camY = 0;
  time = 0;
  state: GameState = 'play';
  stateT = 0;
  /** Затемнение при переходе между уровнями */
  fade = 1;
  pendingLevelUps = 0;
  seenItems = new Set<string>();
  /** Взлом терминала петли: какой терминал рядом и сколько уже держим R */
  hackTarget: Pickup | null = null;
  hackT = 0;
  bossIntro = 0;
  electroT = 0;
  /** Вспышки света от взрывов */
  lightFlashes: { x: number; y: number; r: number; t: number }[] = [];
  /** Текст подсказки о предмете рядом с игроком */
  nearPickup: Pickup | null = null;
  playTime = 0;
  /** Время на каждом уровне (с), индекс — номер уровня − 1. Для плейтеста: видно в паузе */
  levelTimes: number[] = [];
  /** Замедление времени (хроно-ускоритель): враги и их пули двигаются медленнее */
  slowmo = 0;
  /** Лог Диспетчера (левый нижний угол) */
  logLines: LogLine[] = [];
  /** Игрок попросил операционную (R у кресла) — сцена откроет окно операции */
  surgeryRequest = false;
  /** Подобранный модуль не влез в рюкзак — сцена откроет окно выбора */
  backpackFull: Pickup | null = null;
  /** Барьеры сварочной стенки: гасят вражеские пули */
  barriers: { x1: number; y1: number; x2: number; y2: number; t: number }[] = [];
  /** Имя последнего побеждённого босса (для лога) */
  lastBoss: L | null = null;
  /** Дроп с врагов: счётчики невезения (этап 12) */
  drops = new DropState();
  /** Множитель шанса дропа (маршрут лифта «Грузовой» — этап 14) */
  dropMult = 1;
  /** Помехи и бонусы нестабильности */
  unstable = new UnstableState();

  constructor(readonly seed: string, readonly difficulty: Difficulty) {
    this.rng = new RNG(seed + ':run');
    this.diff = DIFFS[difficulty];
    this.hard = difficulty === 'hard';
    this.player = new Player('pistol');
    this.player.lifeOffset = this.hard ? -1 : 0;
    this.player.recalc();
    this.player.lives = this.player.stats.maxLives;
    this.seenItems.add('pistol');
    this.startFloor(1);
  }

  // ---------------------------------------------------------------- этажи

  get hpMult(): number {
    return 1 + (this.floorNum - 1) * 0.3;
  }

  get floorSpeed(): number {
    return 1 + (this.floorNum - 1) * 0.035;
  }

  get priceMult(): number {
    return 1 + (this.floorNum - 1) * 0.08;
  }

  startFloor(n: number) {
    this.floorNum = n;
    this.theme = FLOOR_THEMES[n - 1];
    this.plan = generateLevel(n, new RNG(this.seed + ':floor:' + n), this.theme.tier);
    this.room = buildLevel(this.plan, this.seed);
    this.gfx = new LevelCanvas(this.room, this.theme);
    this.flow = new FlowField(this.room);
    this.enemies = [];
    this.ebullets = [];
    this.abullets = [];
    this.pbullets = [];
    this.pickups = [];
    this.barriers = [];
    this.objs = [];
    this.fx.list = [];
    this.zone = this.lockedRoom = null;
    this.hackTarget = null;
    this.cachesOpened = 0;
    this.placeTerminals();
    this.enterRoom(this.plan.rooms[this.plan.startId]);
    // сбой полностью заряжен в начале каждого уровня
    this.player.glitch = 1;
    onFloorStart(this);
    this.log(LOG.floorStart(this.theme.tierName, n));
    this.player.emit('onFloorStart', this);
  }

  /** Строка в лог Диспетчера */
  log(text: L) {
    this.logLines.push({ text, t: LOG_TIME });
    while (this.logLines.length > LOG_MAX) this.logLines.shift();
  }

  /** Терминалы петель — в дальних комнатах петель, у верхней стены */
  private placeTerminals() {
    this.plan.loops.forEach((l, i) => {
      const r = this.plan.rooms[l.terminalRoom];
      const pos = nearestWalkable(this.room, this.room.roomCenter(r).x, (r.y + 2.5) * TILE);
      this.pickups.push(makePickup('terminal', pos.x, pos.y, { loop: i }));
    });
  }

  /** Перенести игрока в комнату (в центр, у арены босса — ниже центра). Для старта уровня и тестов */
  enterRoom(r: LevelRoom) {
    const c = this.room.roomCenter(r);
    const pos = nearestWalkable(this.room, c.x, c.y + (r.role === 'exit' ? 40 : 0));
    this.player.x = this.player.safeX = pos.x;
    this.player.y = this.player.safeY = pos.y;
    this.updateZone();
    this.flow.update(pos.x, pos.y);
    this.snapCamera();
  }

  /** В какой комнате игрок. Комната засчитывается, когда игрок зашёл внутрь хотя бы на 6 px от стен */
  private updateZone() {
    const p = this.player;
    const r = this.room.roomOfPoint(p.x, p.y, 6);
    if (r) {
      if (r !== this.zone) {
        this.zone = r;
        this.enterZone(r);
      }
    } else if (this.zone && this.room.roomAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) !== this.zone) {
      this.zone = null;
    }
  }

  private enterZone(r: LevelRoom) {
    const first = !r.visited;
    r.visited = r.seen = true;
    // соседние комнаты (через коридоры) видны на мини-карте
    for (const di of r.doors) {
      const c = this.plan.corridors[this.plan.doors[di].corridor];
      this.plan.rooms[c.a].seen = this.plan.rooms[c.b].seen = true;
    }
    if (first) {
      if (!BATTLE.has(r.role) && r.role !== 'exit') r.cleared = true;
      furnishRoom(this, r);
      populateRoom(this, r);
    }
    // щит заряжается на комнату: при первом входе или в зачищенной (выйти из боя в коридор и вернуться — не заряжает)
    if (first || r.cleared) this.player.shieldLeft = this.player.stats.shield;
    this.player.emit('onRoomEnter', this);
  }

  /** Двери комнаты закрываются, пока в ней бой (только у ролей с locks) */
  private updateLocks() {
    const z = this.zone;
    const want = z && ROLES[z.role].locks && !z.cleared && this.enemies.some((e) => e.home === z.id && !e.summon) ? z : null;
    if (want === this.lockedRoom) return;
    if (this.lockedRoom) for (const di of this.lockedRoom.doors) this.room.setDoor(this.plan.doors[di], this.plan.doors[di].locked);
    if (want) for (const di of want.doors) this.room.setDoor(this.plan.doors[di], true);
    this.lockedRoom = want;
    this.flow.reset();
  }

  /** Двери текущей комнаты закрыты на время боя */
  get locked(): boolean {
    return this.lockedRoom !== null;
  }

  /** Арена текущей комнаты (px, вместе со стенами): по ней боссы считают позиции и узоры */
  get arena(): { x: number; y: number; w: number; h: number; cx: number; cy: number } {
    const r = this.zone ?? this.plan.rooms[this.plan.exitId];
    const x = r.x * TILE, y = r.y * TILE, w = r.w * TILE, h = r.h * TILE;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }

  // ---------------------------------------------------------------- игровой цикл

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    const p = this.player;

    if (this.state === 'floorFade') {
      this.fade = Math.max(0, this.fade - dt * 2);
      if (this.fade <= 0) {
        this.startFloor(this.floorNum + 1);
        this.state = 'play';
      }
      return;
    }
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt * 6);

    if (this.state === 'dying') {
      this.fx.update(dt);
      if (this.stateT > 1.6) this.state = 'dead';
      return;
    }
    if (this.state === 'dead' || this.state === 'won') {
      this.fx.update(dt);
      return;
    }

    this.playTime += dt;
    this.levelTimes[this.floorNum - 1] = (this.levelTimes[this.floorNum - 1] ?? 0) + dt;
    this.bossIntro = Math.max(0, this.bossIntro - dt);
    this.electroT = (this.electroT + dt) % 3.2;
    p.update(this, dt);
    this.updateZone();
    p.emit('tick', this, dt);
    updateInstability(this, dt);
    this.updateDrones(dt);

    this.updateGlitch();
    this.updateBarriers(dt);
    for (const l of this.logLines) l.t -= dt;
    this.logLines = this.logLines.filter((l) => l.t > 0);

    this.slowmo = Math.max(0, this.slowmo - dt);
    const edt = this.slowmo > 0 ? dt * 0.3 : dt;
    this.flow.update(p.x, p.y);
    this.updateEnemies(edt);
    updateObjs(this, dt);
    updatePBullets(this, dt);
    collidePlayerShots(this);
    updateEBullets(this, edt);
    if (this.abullets.length) updateEBullets(this, edt, this.abullets, true);
    updateTeams(this, edt);
    this.updatePickups(dt);
    this.checkPlayerHits();
    this.updateLocks();
    this.updateHack(dt);
    this.fx.update(dt);
    for (let i = this.lightFlashes.length - 1; i >= 0; i--) {
      this.lightFlashes[i].t -= dt;
      if (this.lightFlashes[i].t <= 0) this.lightFlashes.splice(i, 1);
    }
    this.updateCamera(dt);

    // зачистка комнаты: в ней не осталось её врагов
    const z = this.zone;
    if (z && !z.cleared && !this.enemies.some((e) => e.home === z.id && !e.summon)) {
      z.cleared = true;
      if (z.role === 'exit') this.onBossDefeated();
      else roomClearReward(this);
      p.emit('onRoomClear', this);
      this.fx.ring(p.x, p.y, C.redD, 60, 0.5);
    }
  }

  /** Непроходимые для игрока тайлы. Рывок позволяет перепрыгивать ямы (но не стены). Закрытая дверь — T.Door */
  playerSolid(t: number, _tx: number, _ty: number, dashing: boolean): boolean {
    if (t === T.Pit) return !dashing;
    return !walkable(t);
  }

  /** Терминал петли открывается удержанием R рядом с ним (не во время боя) */
  private updateHack(dt: number) {
    const p = this.player;
    let near: Pickup | null = null;
    for (const k of this.pickups) if (k.kind === 'terminal' && !k.done && dist2(p.x, p.y, k.x, k.y) < 22 * 22) near = k;
    this.hackTarget = near;
    if (!near || this.locked) {
      this.hackT = 0;
      return;
    }
    if (!input.isDown('interact')) {
      this.hackT = Math.max(0, this.hackT - dt * 2);
      return;
    }
    // скорость взлома («Ключница»): прогресс копится быстрее, полоса в HUD та же
    this.hackT += dt * p.stats.hackSpeed;
    if (Math.random() < dt * 20) this.fx.add({ kind: 'spark', x: near.x + (Math.random() - 0.5) * 12, y: near.y - 8, vx: (Math.random() - 0.5) * 60, vy: -30, color: C.yellow, life: 0.25, glow: true });
    if (this.hackT >= TERMINAL_TIME) {
      this.hackT = 0;
      near.done = true;
      this.openGate(near.loop ?? 0);
      this.fx.burst(near.x, near.y - 8, C.yellow, 12, 60, 0.4, 1, true);
      p.emit('onHack', this);
    }
  }

  /** Идёт взлом: игрок держит R у терминала */
  get hacking(): boolean {
    return this.hackTarget !== null && this.hackT > 0 && !this.locked && input.isDown('interact');
  }

  /** Открыть гермодверь петли */
  openGate(loop: number) {
    const d = this.plan.doors[this.plan.loops[loop].gateDoor];
    d.locked = false;
    if (this.lockedRoom?.id !== d.room) this.room.setDoor(d, false);
    this.flow.reset();
    this.log(LOG.gateOpen);
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      // своя комната врага: для призванных — та, где появились
      if (e.home === -1) e.home = this.room.roomOfPoint(e.x, e.y)?.id ?? -2;
      const far = dist2(e.x, e.y, p.x, p.y) > SLEEP_R * SLEEP_R;
      // агрессия (для нестабильности «пока идёт бой»): враг не покидает свою комнату, поэтому он в бою,
      // пока игрок в его комнате; враг из коридора — пока рядом. Преследование — этап 13.4
      e.aggro = e.team === 'foe' && (e.home >= 0 ? e.home === this.zone?.id : !far);
      // дальние враги спят
      if (!e.def.boss && far) continue;
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.mem.invuln > 0) e.mem.invuln -= dt;
      if (e.spawn > 0) {
        e.spawn -= dt;
        continue;
      }
      // статусы
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burnDps * dt;
        if (Math.random() < dt * 12) this.fx.add({ kind: 'dot', x: e.x + (Math.random() - 0.5) * e.r * 2, y: e.y - e.r, vy: -30, color: C.amber, life: 0.3, glow: true });
        if (e.hp <= 0) {
          this.killEnemy(e, true);
          continue;
        }
      } else e.burnDps = 0;
      if (e.slowT > 0) e.slowT -= dt;
      else e.slowK = 0;
      if (e.hackT > 0) e.hackT -= dt;
      else e.hackK = 0;
      if (e.driveT > 0) e.driveT -= dt;
      else e.driveK = 0;
      if (e.shieldOff > 0) e.shieldOff -= dt;
      if (e.windup > 0) e.windup -= dt;
      if (e.exposedT > 0) e.exposedT -= dt;
      tickStacks(e, dt);
      // подброшенный враг не действует, пока не упадёт
      if (updateToss(this, e, dt)) continue;
      if (e.dead) continue;
      if (e.shockT > 0) {
        e.shockT -= dt;
        if (Math.random() < dt * 10) this.fx.add({ kind: 'spark', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, color: C.yellow, life: 0.15, glow: true });
      }
      // отбрасывание
      if (e.kx || e.ky) {
        const body = { x: e.x, y: e.y, r: Math.min(e.r, 6) };
        const solid = e.def.flying
          ? (t: number) => t === T.Wall || t === T.Block || t === T.Crate || t === T.Door
          : (t: number) => !walkable(t);
        moveBody(this.room, body, e.kx * dt * 6, e.ky * dt * 6, solid);
        e.x = body.x;
        e.y = body.y;
        e.kx *= Math.max(0, 1 - dt * 10);
        e.ky *= Math.max(0, 1 - dt * 10);
        if (Math.abs(e.kx) < 1 && Math.abs(e.ky) < 1) e.kx = e.ky = 0;
      }

      setAim(this, e);
      if (e.shockT <= 0) {
        if (e.def.boss && e.def.phases) {
          if (this.bossIntro <= 0) e.def.phases[e.phase].update(e, this, dt);
        } else e.def.update(e, this, dt);
      }
      // взгляд поворачивается к цели с конечной скоростью (повреждённый привод — медленнее)
      const want = angleTo(e.x, e.y, this.aimX, this.aimY);
      e.mem.face = e.mem.face === undefined ? want : turnTowards(e.mem.face, want, FACE_TURN * dt * (e.driveT > 0 ? 1 - e.driveK : 1));
      if (e.dead) continue;

      // электропол бьёт и врагов
      if (!e.def.flying && !e.airborne && this.electroActive && this.room.at(e.x, e.y) === T.Electro) {
        e.hp -= 10 * dt;
        if (e.hp <= 0) this.killEnemy(e, true);
      }
      // враг не покидает свою комнату (преследование по коридорам — этап 13.4)
      if (e.home >= 0) {
        const h = this.plan.rooms[e.home];
        const m = Math.min(e.r, 8);
        e.x = clamp(e.x, (h.x + 1) * TILE + m, (h.x + h.w - 1) * TILE - m);
        e.y = clamp(e.y, (h.y + 1) * TILE + m, (h.y + h.h - 1) * TILE - m);
      }
      // наземный враг оказался в яме (после прыжка) — вытаскиваем
      if (!e.def.flying && !e.airborne && !walkable(this.room.at(e.x, e.y))) {
        const s = nearestWalkable(this.room, e.x, e.y);
        e.x = s.x;
        e.y = s.y;
      }
    }

    setAim(this, null);
    // враги расталкивают друг друга
    const L = this.enemies;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.dead || a.def.boss) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.dead || b.def.boss) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const r = (a.r + b.r) * 0.8;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = ((r - d) / d) * 0.5;
          a.x -= dx * push * 0.5;
          a.y -= dy * push * 0.5;
          b.x += dx * push * 0.5;
          b.y += dy * push * 0.5;
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  /** Позиция дрона i вокруг игрока */
  dronePos(i: number): { x: number; y: number } {
    const p = this.player;
    const n = Math.max(1, Math.round(p.stats.drones));
    const a = this.time * 2 + (i / n) * Math.PI * 2;
    return { x: p.x + Math.cos(a) * 16, y: p.y - 6 + Math.sin(a) * 10 };
  }

  private updateDrones(dt: number) {
    const p = this.player;
    const n = Math.round(p.stats.drones);
    if (n <= 0) return;
    p.droneT -= dt;
    if (p.droneT > 0) return;
    p.droneT = Math.max(0.15, 0.7 / Math.sqrt(p.stats.fireRateMult));
    for (let i = 0; i < n; i++) {
      const d = this.dronePos(i);
      const t = this.nearestEnemy(d.x, d.y, 200);
      if (!t) continue;
      const a = Math.atan2(t.y - d.y, t.x - d.x);
      spawnShot(this, a, p.stats, {
        x: d.x, y: d.y, bx: d.x, by: d.y, dmg: finalDamage(p.stats) * 0.45, r: 1.8,
        split: 0, explode: 0, orbitR: 0, boomerang: false, wave: 0, style: 'bolt', color: C.amber,
      });
    }
  }

  get electroActive(): boolean {
    return this.electroT > 2.4;
  }

  get electroWarning(): boolean {
    return this.electroT > 1.9 && this.electroT <= 2.4;
  }

  private updatePickups(dt: number) {
    const p = this.player;
    this.nearPickup = null;
    let bestD = 22 * 22;
    for (const k of this.pickups) {
      if (k.dead) continue;
      k.t += dt;
      if (k.vx || k.vy) {
        const nx = k.x + k.vx * dt, ny = k.y + k.vy * dt;
        if (walkable(this.room.at(nx, k.y))) k.x = nx;
        else k.vx = -k.vx;
        if (walkable(this.room.at(k.x, ny))) k.y = ny;
        else k.vy = -k.vy;
        k.vx *= Math.max(0, 1 - dt * 4);
        k.vy *= Math.max(0, 1 - dt * 4);
        if (Math.abs(k.vx) < 2 && Math.abs(k.vy) < 2) k.vx = k.vy = 0;
      }
      if (k.kind === 'terminal') continue;
      const d2 = dist2(p.x, p.y, k.x, k.y);
      // монеты притягиваются
      if (k.kind === 'coin' && !k.price && d2 < p.stats.magnet ** 2 && !this.locked) {
        const d = Math.sqrt(d2) || 1;
        k.x += ((p.x - k.x) / d) * 160 * dt;
        k.y += ((p.y - k.y) / d) * 160 * dt;
      }
      const needsUse = k.kind === 'item' || k.kind === 'teleporter' || k.kind === 'surgery' || k.price !== undefined;
      if (needsUse) {
        if (d2 < bestD) {
          bestD = d2;
          this.nearPickup = k;
        }
      } else if (d2 < 11 * 11) {
        this.collect(k);
      }
    }
    if (this.nearPickup && (this.nearPickup.t > 0.3) && input.pressed('interact')) this.usePickup(this.nearPickup);
    this.pickups = this.pickups.filter((k) => !k.dead);
  }

  private collect(k: Pickup) {
    const p = this.player;
    switch (k.kind) {
      case 'coin':
        p.coins += Math.max(1, Math.round((k.value ?? 1) * p.stats.coinMult));
        this.fx.burst(k.x, k.y, C.yellow, 4, 40, 0.25, 1, true);
        break;
      case 'medkit':
        if (p.lives >= p.stats.maxLives) return;
        p.lives++;
        this.fx.burst(k.x, k.y, C.red, 8, 50, 0.35, 1, true);
        break;
      case 'glitch':
        if (p.glitch >= 1) return;
        p.glitch = Math.min(1, p.glitch + 0.3);
        this.fx.burst(k.x, k.y, C.violet, 8, 40, 0.3, 1, true);
        break;
    }
    k.dead = true;
  }

  usePickup(k: Pickup) {
    const p = this.player;
    if (k.kind === 'surgery') {
      this.surgeryRequest = true;
      return;
    }
    if (k.kind === 'teleporter') {
      if (this.floorNum < FLOORS) {
        this.state = 'floorFade';
        this.fade = 1;
      }
      return;
    }
    if (k.kind === 'item' && k.itemId) {
      const it = item(k.itemId);
      // с рукой-оружием ручное оружие не берётся
      if (it.kind === 'weapon' && p.weapon.slot === 'armR') {
        this.fx.ring(k.x, k.y, C.redD, 14, 0.25);
        return;
      }
      // рюкзак полон — окно выбора (что выбросить)
      if ((it.kind === 'implant' || it.kind === 'skeleton') && p.backpack.length >= p.backpackSize) {
        if (k.price === undefined || p.coins >= k.price) this.backpackFull = k;
        else this.fx.ring(k.x, k.y, C.redD, 14, 0.25);
        return;
      }
    }
    if (k.price !== undefined) {
      if (p.coins < k.price) {
        this.fx.ring(k.x, k.y, C.redD, 14, 0.25);
        return;
      }
      if (k.kind === 'medkit' && p.lives >= p.stats.maxLives) return;
      if (k.kind === 'glitch' && p.glitch >= 1) return;
      p.coins -= k.price;
      if (k.kind !== 'item') {
        k.price = undefined;
        this.collect(k);
        return;
      }
    }
    if (k.kind === 'item' && k.itemId) {
      const it = item(k.itemId);
      k.dead = true;
      if (k.group !== undefined) {
        for (const o of this.pickups) {
          if (o !== k && o.group === k.group) {
            o.dead = true;
            this.fx.burst(o.x, o.y, C.violet, 10, 50, 0.4, 1, true);
          }
        }
      }
      this.acquire(it, k.x, k.y);
    }
  }

  /**
   * Получить предмет. Оружие заменяет текущее (старое остаётся на полу); модули и скелеты
   * кладутся в рюкзак (ставятся только в операционной); рюкзак побольше и прошивки — сразу
   */
  acquire(it: ItemDef, x: number, y: number) {
    const p = this.player;
    if (it.kind === 'weapon') {
      const old = p.weapon;
      p.weapon = it;
      p.charge = 0;
      this.pickups.push(makePickup('item', x, y, { itemId: old.id, t: -0.5 }));
    } else if (it.kind === 'implant' || it.kind === 'skeleton') {
      p.backpack.push(it.id);
    } else if (it.kind === 'backpack') {
      p.backpackSize = Math.max(p.backpackSize, it.capacity ?? 3);
    } else {
      p.passives.set(it.id, (p.passives.get(it.id) ?? 0) + 1);
    }
    this.seenItems.add(it.id);
    const prevMax = p.stats.maxLives;
    p.recalc();
    if (p.stats.maxLives > prevMax) p.lives += p.stats.maxLives - prevMax;
    p.holdItem = it;
    p.holdT = 0.9;
    this.fx.ring(p.x, p.y - 10, C.yellow, 24, 0.4);
  }

  /** Варианты модификаций при повышении уровня (2 на выбор) */
  rollPassives(): ItemDef[] {
    const p = this.player;
    const pool = itemsOfKind('passive').filter((it) => (p.passives.get(it.id) ?? 0) < (it.maxStacks ?? 1));
    const out: ItemDef[] = [];
    const used = new Set<string>();
    for (let i = 0; i < 2 && pool.length; i++) {
      const cand = pool.filter((x) => !used.has(x.id));
      if (!cand.length) break;
      // прошивки из наборов врагов в общем пуле реже (как в rollItem)
      const it = this.rng.weighted(cand, (x) => [0, 10, 6, 3, 1.5][x.quality] * (x.fromEnemy ? 0.5 : 1));
      used.add(it.id);
      out.push(it);
    }
    return out;
  }

  choosePassive(it: ItemDef) {
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
    this.acquire(it, this.player.x, this.player.y);
    this.player.holdItem = null;
    this.player.invuln = Math.max(this.player.invuln, 0.6);
  }

  // ---------------------------------------------------------------- бой

  fireWeapon(angle: number, chargeK: number) {
    // доворот ствола (поворотный станок и т. п.)
    for (const h of this.player.hooks) if (h.adjustAim) angle = h.adjustAim(this, angle);
    fireWeapon(this, angle, chargeK);
    // бонус нестабильности: сдвоенный залп
    if (this.unstable.doubleT > 0) fireWeapon(this, angle + 0.1, chargeK);
  }

  /** Идёт бой: есть живой агрессивный враг (для нестабильности «до конца боя») */
  inCombat(): boolean {
    return this.enemies.some((e) => !e.dead && e.spawn <= 0 && e.aggro);
  }

  nearestEnemy(x: number, y: number, maxDist: number): Enemy | null {
    let best: Enemy | null = null, bd = maxDist * maxDist;
    for (const e of this.enemies) {
      if (e.dead || e.spawn > 0 || e.hidden || e.team !== 'foe') continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Попадание по тайлу: ящики разрушаются */
  /** Удар по тайлу: ящик теряет прочность. true — ящик разбит */
  hitTile(x: number, y: number, dmg: number): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (this.room.get(tx, ty) !== T.Crate) return false;
    const i = ty * this.room.tw + tx;
    const hp = (this.room.crateHp.get(i) ?? 10) - dmg;
    if (hp > 0) {
      this.room.crateHp.set(i, hp);
      return false;
    }
    this.room.crateHp.delete(i);
    this.room.set(tx, ty, T.Floor);
    this.gfx.redrawTile(tx, ty);
    this.fx.burst((tx + 0.5) * TILE, (ty + 0.5) * TILE, C.amberD, 10, 70, 0.4, 2);
    this.flow.reset();
    if (this.rng.chance(0.15)) dropLoot(this, 'coin', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 1);
    return true;
  }

  /** Снаряд исчез (врезался/истёк) — взрывается, если умеет; навесной — падает */
  onShotDeath(b: PBullet, wall = false) {
    if (b.explode) explode(this, b.x, b.y, b.explode, b.dmg * 0.7);
    if (b.arc && b.landR) explode(this, b.x, b.y, b.landR, b.dmg, C.amber, b.tag);
    b.onEnd?.(this, b, wall);
    this.player.emit('onShotEnd', this, b, wall);
  }

  killEnemy(e: Enemy, reward: boolean) {
    if (e.dead) return;
    e.dead = true;
    const p = this.player;
    if (e.def.kind === 'robot') this.fx.robotDeath(e.x, e.y, e.r);
    else if (e.def.kind === 'cyborg') this.fx.cyborgDeath(e.x, e.y, e.r);
    else {
      this.fx.explosion(e.x, e.y, e.r * 1.6, e.def.boss ? C.red : C.amber);
      this.fx.burst(e.x, e.y, C.steel, 6 + e.r, 70, 0.5, 2);
    }
    this.lightFlash(e.x, e.y, e.r * 5);
    // смерть союзника — его последние пули тоже союзные
    if (e.def.onDeath) asActor(this, e, () => e.def.onDeath!(e, this));
    if (!reward || e.mem.summoned || e.summon) return;
    p.kills++;
    if (p.glitchT <= 0) p.glitch = Math.min(1, p.glitch + 0.01 * p.stats.glitchGain);
    if (e.def.boss) this.lastBoss = e.def.name;
    const coins = Math.floor(e.def.coins + Math.random());
    if (coins > 0) dropLoot(this, 'coin', e.x, e.y, coins);
    enemyDrop(this, e);
    p.xp += e.def.xp * p.stats.xpMult;
    while (p.xp >= xpNeed(p.level)) {
      p.xp -= xpNeed(p.level);
      p.level++;
      this.pendingLevelUps++;
    }
    if (p.stats.lifesteal && Math.random() < p.stats.lifesteal && p.lives < p.stats.maxLives) {
      p.lives++;
      this.fx.burst(p.x, p.y, C.red, 10, 50, 0.4, 1, true);
    }
    p.emit('onKill', this, e);
  }

  checkBossPhase(e: Enemy) {
    const phases = e.def.phases;
    if (!phases) return;
    let changed = false;
    while (e.phase < phases.length - 1 && e.hp / e.maxHp <= phases[e.phase].until) {
      e.phase++;
      changed = true;
    }
    if (changed && e.hp > 0) {
      e.phaseT = 0;
      const keep = { twin: e.mem.twin };
      e.mem = { ...keep, invuln: 1.0 };
      phases[e.phase].enter?.(e, this);
      this.log(LOG.phase(phases[e.phase].name));
      this.clearBullets(true);
      this.fx.ring(e.x, e.y, C.red, 80, 0.6);
    }
  }

  private onBossDefeated() {
    this.clearBullets(true);
    if (this.lastBoss) this.log(LOG.bossDown(this.lastBoss));
    // босс открывает новую систему тела
    const sys = SYSTEM_BY_FLOOR[this.floorNum];
    if (sys && !this.player.systems.has(sys)) {
      this.player.systems.add(sys);
      this.log(LOG.system(SLOT_NAME[sys]));
    }
    if (this.floorNum >= FLOORS) {
      this.state = 'won';
      this.stateT = 0;
      return;
    }
    bossReward(this);
  }

  /** Убрать все вражеские пули (с эффектом) */
  clearBullets(withFx: boolean) {
    if (withFx) {
      let k = 0;
      for (const b of this.ebullets) {
        if (k++ % 2 === 0) this.fx.add({ kind: 'dot', x: b.x, y: b.y, vy: -20, color: C.bone, life: 0.4, glow: true });
      }
    }
    this.ebullets.length = 0;
  }

  /**
   * Сбой: Т-417 на glitchTime секунд выпадает из системы — вражеские пули проходят сквозь него,
   * а пули в радиусе переписываются и летят во врагов. emergency — аварийный сбой после попадания.
   */
  glitch(emergency: boolean) {
    const p = this.player;
    p.glitch = 0;
    p.pendingHit = 0;
    p.glitchT = p.stats.glitchTime;
    const R = p.stats.glitchRadius;
    this.fx.ring(p.x, p.y, C.violet, R, 0.45);
    this.fx.ring(p.x, p.y, C.red, R * 0.5, 0.3);
    this.fx.flash(p.x, p.y, C.violet, 30, 0.2);
    this.lightFlash(p.x, p.y, R * 2);
    this.log(emergency ? LOG.emergency : LOG.glitch);
    p.emit('onGlitch', this);
  }

  /** Пока идёт сбой — переписываем вражеские пули в радиусе в свои, наводящиеся на врагов */
  private updateGlitch() {
    const p = this.player;
    if (p.glitchT <= 0) return;
    const R2 = p.stats.glitchRadius ** 2;
    const dmg = p.stats.glitchPower * (1 + this.floorNum * 0.15);
    const base = baseStats();
    let any = false;
    for (const b of this.ebullets) {
      if (dist2(b.x, b.y, p.x, p.y) > R2) continue;
      b.dead = any = true;
      if (this.pbullets.length > 500) continue;
      let target: Enemy | null = null, best = Infinity;
      for (const e of this.enemies) {
        const d = dist2(b.x, b.y, e.x, e.y);
        if (!e.dead && e.spawn <= 0 && e.team === 'foe' && d < best) {
          best = d;
          target = e;
        }
      }
      const a = target ? Math.atan2(target.y - b.y, target.x - b.x) : b.angle + Math.PI;
      spawnShot(this, a, base, {
        x: b.x, y: b.y, bx: b.x, by: b.y, speed: 170, dmg, homing: p.stats.glitchHoming, life: 1.6, maxLife: 1.6,
        r: 2.5, color: C.violet, style: 'shard', crit: false,
      });
      if (Math.random() < 0.3) this.fx.add({ kind: 'spark', x: b.x, y: b.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, color: C.violet, life: 0.2, glow: true });
    }
    if (any) this.ebullets = this.ebullets.filter((b) => !b.dead);
  }

  private updateBarriers(dt: number) {
    if (!this.barriers.length) return;
    for (const w of this.barriers) {
      w.t -= dt;
      for (const b of this.ebullets) if (!b.dead && distToSegment(b.x, b.y, w.x1, w.y1, w.x2, w.y2) < b.r + 2) {
        b.dead = true;
        this.fx.add({ kind: 'dot', x: b.x, y: b.y, color: C.amber, life: 0.2, glow: true });
      }
    }
    this.ebullets = this.ebullets.filter((b) => !b.dead);
    this.barriers = this.barriers.filter((w) => w.t > 0);
  }

  /** Толчок рабочим манипулятором (E): слабый удар вплотную, сильно отбрасывает */
  shove(angle: number) {
    const p = this.player;
    const reach = 24, arc = 1.9;
    const dmg = Math.max(2, finalDamage(p.stats) * 0.5);
    this.fx.add({ kind: 'slash', x: p.x, y: p.y - 3, angle, arc, size: reach, color: C.bone, life: 0.12, glow: true });
    for (const e of this.enemies) {
      if (e.dead || e.spawn > 0) continue;
      if (dist2(p.x, p.y, e.x, e.y) > (reach + e.r) ** 2) continue;
      if (Math.abs(angleDiff(angle, Math.atan2(e.y - p.y, e.x - p.x))) > arc / 2 + 0.2) continue;
      damageEnemy(this, e, dmg, p.x, p.y, { knockback: 200, source: 'melee' });
      this.fx.burst(e.x, e.y, C.bone, 5, 60, 0.2, 1, true);
    }
    this.hitTile(p.x + Math.cos(angle) * reach * 0.7, p.y + Math.sin(angle) * reach * 0.7, dmg);
  }

  lightFlash(x: number, y: number, r: number) {
    if (this.lightFlashes.length < 12) this.lightFlashes.push({ x, y, r, t: 0.25 });
  }

  private checkPlayerHits() {
    const p = this.player;
    if (p.invuln > 0 || p.dashT > 0 || p.holdT > 0.7 || p.glitchT > 0 || p.pendingHit > 0) return;
    const hr = p.stats.hitR;
    const charging = p.glitch < 1;
    for (const b of this.ebullets) {
      if (b.delay > 0 || b.dead || b.phased) continue;
      const r = b.r * 0.8 + hr;
      const d2 = dist2(b.x, b.y, p.x, p.y);
      if (d2 < r * r) return this.hurtPlayer({ kind: 'bullet', bullet: b, enemy: b.owner });
      // пролёт вплотную заряжает сбой (каждая пуля — один раз; чем ближе, тем больше)
      if (charging && !b.grazed && d2 < (r + GRAZE) ** 2) {
        b.grazed = true;
        const k = 1.5 - (Math.sqrt(d2) - r) / GRAZE;
        p.glitch = Math.min(1, p.glitch + 0.02 * k * p.stats.glitchGain);
        this.fx.add({ kind: 'dot', x: (b.x + p.x) / 2, y: (b.y + p.y) / 2, color: C.violet, life: 0.2, glow: true });
      }
    }
    for (const e of this.enemies) {
      if (e.spawn > 0 || e.airborne || e.hidden || e.toss || e.team !== 'foe' || e.def.contact === false) continue;
      const r = e.r * 0.7 + hr;
      if (dist2(e.x, e.y, p.x, p.y) < r * r) return this.hurtPlayer({ kind: 'contact', enemy: e });
    }
    if (this.electroActive && p.onElectro(this)) return this.hurtPlayer({ kind: 'floor' });
  }

  /**
   * Попадание по игроку. Порядок: перехват («КАЗ», onIncoming) → уклонение → щит →
   * долг («Долг боли», onLifeHit) → аварийное окно сбоя → потеря жизни
   */
  hurtPlayer(hit: IncomingHit = { kind: 'floor' }) {
    const p = this.player;
    for (const h of p.hooks) {
      const res = h.onIncoming?.(this, hit);
      if (res === 'pass' && hit.bullet) {
        // пуля проходит сквозь героя и летит дальше (больше его не задевает)
        hit.bullet.phased = true;
        return;
      }
      if (res) {
        if (hit.bullet) hit.bullet.dead = true;
        p.invuln = Math.max(p.invuln, 0.1);
        p.emit('onDefend', this, 'intercept');
        return;
      }
    }
    if (p.stats.dodge > 0 && Math.random() < p.stats.dodge) {
      p.invuln = 0.5;
      this.fx.ring(p.x, p.y, C.bone, 16, 0.25);
      p.emit('onDefend', this, 'dodge');
      return;
    }
    if (p.shieldLeft > 0) {
      p.shieldLeft--;
      p.invuln = 1.0;
      this.fx.ring(p.x, p.y, C.amber, 22, 0.35);
      this.fx.burst(p.x, p.y, C.amber, 10, 70, 0.3, 1, true);
      p.emit('onDefend', this, 'shield');
      return;
    }
    for (const h of p.hooks) if (h.onLifeHit?.(this, hit)) return;
    // сбой заряжен — аварийное окно: F в течение 0,15 с отменяет попадание
    if (p.glitch >= 1 && p.glitchT <= 0) {
      p.pendingHit = EMERGENCY;
      return;
    }
    this.loseLife();
  }

  /** Потеря жизни (после щита, уклонения и аварийного окна) */
  loseLife() {
    const p = this.player;
    p.pendingHit = 0;
    p.lives--;
    p.invuln = 2.2;
    p.emit('onHurt', this);
    // как в Touhou: пули вокруг исчезают, бомбы восстанавливаются
    for (const b of this.ebullets) {
      if (dist2(b.x, b.y, p.x, p.y) < 110 * 110) {
        b.dead = true;
        this.fx.add({ kind: 'dot', x: b.x, y: b.y, color: C.bone, life: 0.3, glow: true });
      }
    }
    this.ebullets = this.ebullets.filter((b) => !b.dead);
    this.fx.burst(p.x, p.y, C.red, 24, 120, 0.6, 2, true);
    if (p.lives > 0) {
      this.log(LOG.hurt);
      onLifeLost(this);
    }
    this.fx.ring(p.x, p.y, C.red, 110, 0.4);
    if (p.lives <= 0) {
      this.state = 'dying';
      this.stateT = 0;
      this.fx.explosion(p.x, p.y, 30, C.red);
    }
  }

  // ---------------------------------------------------------------- камера

  private cameraTarget(): [number, number] {
    const p = this.player, r = this.room;
    return [clamp(p.x - VIEW_W / 2, 0, r.pxW - VIEW_W), clamp(p.y - VIEW_H / 2 - 8, -16, r.pxH - VIEW_H)];
  }

  private updateCamera(dt: number) {
    const [tx, ty] = this.cameraTarget();
    const k = Math.min(1, dt * 8);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
  }

  snapCamera() {
    [this.camX, this.camY] = this.cameraTarget();
  }

  /** Информация о боссе для полосы здоровья */
  get boss(): Enemy | null {
    for (const e of this.enemies) if (e.def.boss && !e.dead) return e;
    return null;
  }
}
