import { FLOORS, TILE, VIEW_H, VIEW_W } from '../config';
import { FLOOR_THEMES, type FloorTheme } from '../content/floors';
import { angleDiff, clamp, dist2 } from '../core/math';
import { RNG } from '../core/rng';
import type { Difficulty } from '../core/storage';
import { C } from '../gfx/palette';
import { redrawTile, renderRoomCanvas } from '../gfx/roomrender';
import { input } from '../core/input';
import { DIRS, generateFloor, OPPOSITE, type FloorPlan, type RoomInfo } from '../world/floorgen';
import { buildRoom, nearestWalkable, type DoorPlace, type RoomMap } from '../world/room';
import { T, walkable } from '../world/tiles';
import { updateEBullets, updatePBullets, type EBullet, type PBullet } from './bullets';
import { collidePlayerShots, damageEnemy, explode, fireWeapon, spawnShot } from './combat';
import { baseStats, finalDamage } from './stats';
import { LOG, LOG_MAX, LOG_TIME, type LogLine } from './log';
import type { L } from '../core/i18n';
import type { Enemy } from './enemy';
import { FxSystem } from './fx';
import { SLOT_NAME, item, itemsOfKind, type ItemDef, type Slot } from './items';
import { distToSegment, moveBody } from './collision';
import { FlowField } from './pathfinding';
import { Player } from './player';
import { bossReward, dropLoot, furnishRoom, makePickup, populateRoom, roomClearReward, type Pickup } from './spawn';
import { DropState, enemyDrop } from './drops';
import { UnstableState, onFloorStart, onLifeLost, updateInstability } from './instability';

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

export type GameState = 'play' | 'transition' | 'dying' | 'dead' | 'won' | 'floorFade';

/** Сколько держать R, чтобы взломать запертую дверь (с) */
export const HACK_TIME = 2;

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
  plan!: FloorPlan;
  theme!: FloorTheme;
  private maps = new Map<number, RoomMap>();
  private roomPickups = new Map<number, Pickup[]>();
  private roomCanvas = new Map<number, HTMLCanvasElement>();
  room!: RoomMap;
  flow!: FlowField;
  player: Player;
  enemies: Enemy[] = [];
  ebullets: EBullet[] = [];
  pbullets: PBullet[] = [];
  pickups: Pickup[] = [];
  fx = new FxSystem();
  camX = 0;
  camY = 0;
  time = 0;
  state: GameState = 'play';
  stateT = 0;
  /** Переход между комнатами: затемнение */
  fade = 1;
  private nextDoor: DoorPlace | null = null;
  pendingLevelUps = 0;
  seenItems = new Set<string>();
  /** Комната, за зачистку которой гарантированно выпадет ключ */
  /** Взлом запертой двери: какая дверь рядом и сколько уже держим R */
  hackDoor: DoorPlace | null = null;
  hackT = 0;
  bossIntro = 0;
  electroT = 0;
  /** Вспышки света от взрывов */
  lightFlashes: { x: number; y: number; r: number; t: number }[] = [];
  /** Текст подсказки о предмете рядом с игроком */
  nearPickup: Pickup | null = null;
  playTime = 0;
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
    const frng = new RNG(this.seed + ':floor:' + n);
    this.plan = generateFloor(n, frng);
    this.maps.clear();
    this.roomPickups.clear();
    this.roomCanvas.clear();
    const start = this.plan.rooms[this.plan.startId];
    this.enterRoom(start, null);
    const c = nearestWalkable(this.room, this.room.pxW / 2, this.room.pxH / 2);
    this.player.x = this.player.safeX = c.x;
    this.player.y = this.player.safeY = c.y;
    this.snapCamera();
    // сбой полностью заряжен в начале каждого уровня
    this.player.glitch = 1;
    onFloorStart(this);
    this.log(LOG.floorStart(this.theme.tierName, n));
  }

  /** Строка в лог Диспетчера */
  log(text: L) {
    this.logLines.push({ text, t: LOG_TIME });
    while (this.logLines.length > LOG_MAX) this.logLines.shift();
  }

  private mapFor(info: RoomInfo): RoomMap {
    let m = this.maps.get(info.id);
    if (!m) {
      m = buildRoom(info, new RNG(this.seed + ':room:' + this.floorNum + ':' + info.id));
      this.maps.set(info.id, m);
    }
    return m;
  }

  roomCanvasFor(): HTMLCanvasElement {
    let c = this.roomCanvas.get(this.room.info.id);
    if (!c || this.room.dirty) {
      c = renderRoomCanvas(this.room, this.theme, c);
      this.roomCanvas.set(this.room.info.id, c);
    }
    return c;
  }

  /** Войти в комнату через дверь (или в стартовую при door = null) */
  enterRoom(info: RoomInfo, from: DoorPlace | null) {
    if (this.room) this.roomPickups.set(this.room.info.id, this.pickups);
    const firstVisit = !info.visited;
    info.visited = true;
    info.seen = true;
    for (const d of info.doors) this.plan.rooms[d.to].seen = true;
    this.room = this.mapFor(info);
    this.flow = new FlowField(this.room);
    this.enemies = [];
    this.ebullets = [];
    this.pbullets = [];
    this.barriers = [];
    this.pickups = this.roomPickups.get(info.id) ?? [];
    this.fx.list = [];
    if (from) {
      // дверь обратно находится в соседней клетке с противоположной стороны
      const [dx, dy] = DIRS[from.dir];
      const back = this.room.doors.find((d) => d.cx === from.cx + dx && d.cy === from.cy + dy && d.dir === OPPOSITE[from.dir]);
      const p = this.room.doorEntry(back ?? this.room.doors[0]);
      this.player.x = this.player.safeX = p.x;
      this.player.y = this.player.safeY = p.y;
    }
    if (firstVisit) {
      furnishRoom(this);
      populateRoom(this);
    }
    this.player.shieldLeft = this.player.stats.shield;
    this.player.emit('onRoomEnter', this);
    this.flow.update(this.player.x, this.player.y);
  }

  // ---------------------------------------------------------------- игровой цикл

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    const p = this.player;

    if (this.state === 'transition') {
      this.fade = Math.max(0, this.fade - dt * 7);
      if (this.fade <= 0 && this.nextDoor) {
        const d = this.nextDoor;
        this.nextDoor = null;
        this.enterRoom(this.plan.rooms[d.to], d);
        this.snapCamera();
        this.state = 'play';
      }
      return;
    }
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
    this.bossIntro = Math.max(0, this.bossIntro - dt);
    this.electroT = (this.electroT + dt) % 3.2;
    p.update(this, dt);
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
    updatePBullets(this, dt);
    collidePlayerShots(this);
    updateEBullets(this, edt);
    this.updatePickups(dt);
    this.checkPlayerHits();
    this.checkDoors(dt);
    this.fx.update(dt);
    for (let i = this.lightFlashes.length - 1; i >= 0; i--) {
      this.lightFlashes[i].t -= dt;
      if (this.lightFlashes[i].t <= 0) this.lightFlashes.splice(i, 1);
    }
    this.updateCamera(dt);

    // зачистка комнаты
    if (!this.room.info.cleared && this.enemies.length === 0 && this.room.info.type !== 'start') {
      this.room.info.cleared = true;
      if (this.room.info.type === 'boss') this.onBossDefeated();
      else roomClearReward(this);
      p.emit('onRoomClear', this);
      this.fx.ring(p.x, p.y, C.redD, 60, 0.5);
    }
  }

  get locked(): boolean {
    return !this.room.info.cleared && this.enemies.length > 0;
  }

  /** Непроходимые для игрока тайлы. Рывок позволяет перепрыгивать ямы (но не стены) */
  playerSolid(t: number, tx: number, ty: number, dashing: boolean): boolean {
    if (t === T.Door) {
      const d = this.doorAt(tx, ty);
      return !d || d.locked || this.locked;
    }
    if (t === T.Pit) return !dashing;
    return !walkable(t);
  }

  doorAt(tx: number, ty: number): DoorPlace | undefined {
    return this.room.doors.find((d) =>
      d.dir === 'n' || d.dir === 's' ? ty === d.ty && (tx === d.tx || tx === d.tx + 1) : tx === d.tx && (ty === d.ty || ty === d.ty + 1),
    );
  }

  private checkDoors(dt: number) {
    const p = this.player;
    // игрок стоит в проёме двери → переход
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (this.room.get(tx, ty) === T.Door && !this.locked) {
      const d = this.doorAt(tx, ty);
      if (d && !d.locked) {
        this.nextDoor = d;
        this.state = 'transition';
        return;
      }
    }
    // запертая дверь взламывается удержанием R рядом с ней
    this.hackDoor = null;
    if (this.locked) {
      this.hackT = 0;
      return;
    }
    let near: DoorPlace | null = null;
    for (const d of this.room.doors) {
      if (!d.locked) continue;
      const cx = (d.tx + (d.dir === 'n' || d.dir === 's' ? 1 : 0.5)) * TILE;
      const cy = (d.ty + (d.dir === 'w' || d.dir === 'e' ? 1 : 0.5)) * TILE;
      if (dist2(p.x, p.y, cx, cy) < 30 * 30) near = d;
    }
    if (!near) {
      this.hackT = 0;
      return;
    }
    this.hackDoor = near;
    if (!input.isDown('interact')) {
      this.hackT = Math.max(0, this.hackT - dt * 2);
      return;
    }
    this.hackT += dt;
    const cx = (near.tx + (near.dir === 'n' || near.dir === 's' ? 1 : 0.5)) * TILE;
    const cy = (near.ty + (near.dir === 'w' || near.dir === 'e' ? 1 : 0.5)) * TILE;
    if (Math.random() < dt * 20) this.fx.add({ kind: 'spark', x: cx + (Math.random() - 0.5) * 16, y: cy + (Math.random() - 0.5) * 16, vx: (Math.random() - 0.5) * 60, vy: -30, color: C.yellow, life: 0.25, glow: true });
    if (this.hackT >= HACK_TIME) {
      this.hackT = 0;
      this.unlockDoor(near);
      this.fx.burst(cx, cy, C.yellow, 12, 60, 0.4, 1, true);
    }
  }

  private unlockDoor(d: DoorPlace) {
    d.locked = false;
    const info = this.room.info;
    for (const di of info.doors) if (di.to === d.to) di.locked = false;
    const other = this.plan.rooms[d.to];
    for (const di of other.doors) if (di.to === info.id) di.locked = false;
    const om = this.maps.get(other.id);
    if (om) for (const dp of om.doors) if (dp.to === info.id) dp.locked = false;
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (e.dead) continue;
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

      if (e.shockT <= 0) {
        if (e.def.boss && e.def.phases) {
          if (this.bossIntro <= 0) e.def.phases[e.phase].update(e, this, dt);
        } else e.def.update(e, this, dt);
      }
      if (e.dead) continue;

      // электропол бьёт и врагов
      if (!e.def.flying && !e.airborne && this.electroActive && this.room.at(e.x, e.y) === T.Electro) {
        e.hp -= 10 * dt;
        if (e.hp <= 0) this.killEnemy(e, true);
      }
      // наземный враг оказался в яме (после прыжка) — вытаскиваем
      if (!e.def.flying && !e.airborne && !walkable(this.room.at(e.x, e.y))) {
        const s = nearestWalkable(this.room, e.x, e.y);
        e.x = s.x;
        e.y = s.y;
      }
    }

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
      const it = this.rng.weighted(cand, (x) => [0, 10, 6, 3, 1.5][x.quality]);
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
      if (e.dead || e.spawn > 0 || e.hidden) continue;
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
    const c = this.roomCanvas.get(this.room.info.id);
    if (c) redrawTile(c, this.room, this.theme, tx, ty);
    this.fx.burst((tx + 0.5) * TILE, (ty + 0.5) * TILE, C.amberD, 10, 70, 0.4, 2);
    this.flow = new FlowField(this.room);
    this.flow.update(this.player.x, this.player.y);
    if (this.rng.chance(0.15)) dropLoot(this, 'coin', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 1);
    return true;
  }

  /** Снаряд исчез (врезался/истёк) — взрывается, если умеет */
  onShotDeath(b: PBullet) {
    if (b.explode) explode(this, b.x, b.y, b.explode, b.dmg * 0.7);
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
    e.def.onDeath?.(e, this);
    if (!reward || e.mem.summoned) return;
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
        if (!e.dead && e.spawn <= 0 && d < best) {
          best = d;
          target = e;
        }
      }
      const a = target ? Math.atan2(target.y - b.y, target.x - b.x) : b.angle + Math.PI;
      spawnShot(this, a, base, {
        x: b.x, y: b.y, bx: b.x, by: b.y, speed: 170, dmg, homing: 4, life: 1.6, maxLife: 1.6,
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
      if (b.delay > 0) continue;
      const r = b.r * 0.8 + hr;
      const d2 = dist2(b.x, b.y, p.x, p.y);
      if (d2 < r * r) return this.hurtPlayer();
      // пролёт вплотную заряжает сбой (каждая пуля — один раз; чем ближе, тем больше)
      if (charging && !b.grazed && d2 < (r + GRAZE) ** 2) {
        b.grazed = true;
        const k = 1.5 - (Math.sqrt(d2) - r) / GRAZE;
        p.glitch = Math.min(1, p.glitch + 0.02 * k * p.stats.glitchGain);
        this.fx.add({ kind: 'dot', x: (b.x + p.x) / 2, y: (b.y + p.y) / 2, color: C.violet, life: 0.2, glow: true });
      }
    }
    for (const e of this.enemies) {
      if (e.spawn > 0 || e.airborne || e.hidden || e.def.contact === false) continue;
      const r = e.r * 0.7 + hr;
      if (dist2(e.x, e.y, p.x, p.y) < r * r) return this.hurtPlayer();
    }
    if (this.electroActive && p.onElectro(this)) return this.hurtPlayer();
  }

  hurtPlayer() {
    const p = this.player;
    if (p.stats.dodge > 0 && Math.random() < p.stats.dodge) {
      p.invuln = 0.5;
      this.fx.ring(p.x, p.y, C.bone, 16, 0.25);
      return;
    }
    if (p.shieldLeft > 0) {
      p.shieldLeft--;
      p.invuln = 1.0;
      this.fx.ring(p.x, p.y, C.amber, 22, 0.35);
      this.fx.burst(p.x, p.y, C.amber, 10, 70, 0.3, 1, true);
      return;
    }
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
    const p = this.player;
    const r = this.room;
    const tx = r.pxW <= VIEW_W ? (r.pxW - VIEW_W) / 2 : clamp(p.x - VIEW_W / 2, 0, r.pxW - VIEW_W);
    const ty = r.pxH <= VIEW_H - 16 ? (r.pxH - VIEW_H) / 2 : clamp(p.y - VIEW_H / 2 - 8, -16, r.pxH - VIEW_H);
    return [tx, ty];
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
