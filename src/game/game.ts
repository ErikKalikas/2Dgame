import { FLOORS, TILE, VIEW_H, VIEW_W } from '../config';
import { FLOOR_THEMES, type FloorTheme } from '../content/floors';
import { clamp, dist2 } from '../core/math';
import { RNG } from '../core/rng';
import type { Difficulty } from '../core/storage';
import { C } from '../gfx/palette';
import { redrawTile, renderRoomCanvas } from '../gfx/roomrender';
import { input } from '../core/input';
import { DIRS, generateFloor, OPPOSITE, type FloorPlan, type RoomInfo } from '../world/floorgen';
import { buildRoom, nearestWalkable, type DoorPlace, type RoomMap } from '../world/room';
import { T, walkable } from '../world/tiles';
import { updateEBullets, updatePBullets, type EBullet, type PBullet } from './bullets';
import { collidePlayerShots, damageEnemy, explode, fireWeapon } from './combat';
import type { Enemy } from './enemy';
import { FxSystem } from './fx';
import { item, itemsOfKind, type ItemDef } from './items';
import { moveBody } from './collision';
import { FlowField } from './pathfinding';
import { Player } from './player';
import { bossReward, dropLoot, furnishRoom, makePickup, populateRoom, roomClearReward, type Pickup } from './spawn';

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

/** Опыт до следующего уровня */
export function xpNeed(level: number): number {
  return Math.round(10 + level * 7 + level * level * 0.6);
}

/** Один забег: 8 этажей башни, генерируемых из seed */
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
  keyRoom = -1;
  bossIntro = 0;
  electroT = 0;
  /** Вспышки света от взрывов */
  lightFlashes: { x: number; y: number; r: number; t: number }[] = [];
  /** Текст подсказки о предмете рядом с игроком */
  nearPickup: Pickup | null = null;
  playTime = 0;
  /** Замедление времени (Сандевистан): враги и их пули двигаются медленнее */
  slowmo = 0;

  constructor(readonly seed: string, readonly difficulty: Difficulty) {
    this.rng = new RNG(seed + ':run');
    this.diff = DIFFS[difficulty];
    this.hard = difficulty === 'hard';
    this.player = new Player('pistol');
    this.player.lives = this.player.stats.maxLives = this.hard ? 3 : 4;
    this.player.recalc();
    this.player.lives = this.player.stats.maxLives;
    this.player.bombs = this.player.stats.startBombs;
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
    const normals = this.plan.rooms.filter((r) => r.type === 'normal');
    this.keyRoom = n >= 2 && normals.length ? frng.pick(normals).id : -1;
    const start = this.plan.rooms[this.plan.startId];
    this.enterRoom(start, null);
    const c = this.room.centerPoint();
    this.player.x = c.x;
    this.player.y = c.y;
    this.snapCamera();
    this.player.bombs = Math.max(this.player.bombs, this.player.stats.startBombs);
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
  private enterRoom(info: RoomInfo, from: DoorPlace | null) {
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
    this.pickups = this.roomPickups.get(info.id) ?? [];
    this.fx.list = [];
    if (from) {
      // дверь обратно находится в соседней клетке с противоположной стороны
      const [dx, dy] = DIRS[from.dir];
      const back = this.room.doors.find((d) => d.cx === from.cx + dx && d.cy === from.cy + dy && d.dir === OPPOSITE[from.dir]);
      const p = this.room.doorEntry(back ?? this.room.doors[0]);
      this.player.x = p.x;
      this.player.y = p.y;
    }
    if (firstVisit) {
      furnishRoom(this);
      populateRoom(this);
    }
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

    this.slowmo = Math.max(0, this.slowmo - dt);
    const edt = this.slowmo > 0 ? dt * 0.3 : dt;
    this.flow.update(p.x, p.y);
    this.updateEnemies(edt);
    updatePBullets(this, dt);
    collidePlayerShots(this);
    updateEBullets(this, edt);
    this.updatePickups(dt);
    this.checkPlayerHits();
    this.checkDoors();
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

  private checkDoors() {
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
    // запертые двери открываются ключом при касании
    if (this.locked) return;
    for (const d of this.room.doors) {
      if (!d.locked || p.keys <= 0) continue;
      const cx = (d.tx + (d.dir === 'n' || d.dir === 's' ? 1 : 0.5)) * TILE;
      const cy = (d.ty + (d.dir === 'w' || d.dir === 'e' ? 1 : 0.5)) * TILE;
      if (dist2(p.x, p.y, cx, cy) < 26 * 26) {
        p.keys--;
        this.unlockDoor(d);
        this.fx.burst(cx, cy, C.yellow, 12, 60, 0.4, 1, true);
      }
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
      const needsUse = k.kind === 'item' || k.kind === 'teleporter' || k.price !== undefined;
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
      case 'key':
        p.keys++;
        this.fx.burst(k.x, k.y, C.yellow, 6, 40, 0.3, 1, true);
        break;
      case 'bomb':
        if (p.bombs >= 6) return;
        p.bombs++;
        this.fx.burst(k.x, k.y, C.amber, 6, 40, 0.3, 1, true);
        break;
    }
    k.dead = true;
  }

  private usePickup(k: Pickup) {
    const p = this.player;
    if (k.kind === 'teleporter') {
      if (this.floorNum < FLOORS) {
        this.state = 'floorFade';
        this.fade = 1;
      }
      return;
    }
    if (k.price !== undefined) {
      if (p.coins < k.price) {
        this.fx.ring(k.x, k.y, C.redD, 14, 0.25);
        return;
      }
      if (k.kind === 'medkit' && p.lives >= p.stats.maxLives) return;
      if (k.kind === 'bomb' && p.bombs >= 6) return;
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

  /** Получить предмет. Оружие и активный имплант заменяют текущие (старые остаются на полу) */
  acquire(it: ItemDef, x: number, y: number) {
    const p = this.player;
    if (it.kind === 'weapon') {
      const old = p.weapon;
      p.weapon = it;
      this.pickups.push(makePickup('item', x, y, { itemId: old.id, t: -0.5 }));
    } else if (it.kind === 'implant') {
      if (it.active) {
        if (p.activeId) this.pickups.push(makePickup('item', x, y, { itemId: p.activeId, t: -0.5 }));
        p.activeId = it.id;
        p.activeCd = 0;
      } else p.implants.push(it.id);
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
  hitTile(x: number, y: number, dmg: number) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (this.room.get(tx, ty) !== T.Crate) return;
    const i = ty * this.room.tw + tx;
    const hp = (this.room.crateHp.get(i) ?? 10) - dmg;
    if (hp > 0) {
      this.room.crateHp.set(i, hp);
      return;
    }
    this.room.crateHp.delete(i);
    this.room.set(tx, ty, T.Floor);
    const c = this.roomCanvas.get(this.room.info.id);
    if (c) redrawTile(c, this.room, this.theme, tx, ty);
    this.fx.burst((tx + 0.5) * TILE, (ty + 0.5) * TILE, C.amberD, 10, 70, 0.4, 2);
    this.flow = new FlowField(this.room);
    this.flow.update(this.player.x, this.player.y);
    if (this.rng.chance(0.15)) dropLoot(this, 'coin', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 1);
  }

  /** Снаряд исчез (врезался/истёк) — взрывается, если умеет */
  onShotDeath(b: PBullet) {
    if (b.explode) explode(this, b.x, b.y, b.explode, b.dmg * 0.7);
  }

  killEnemy(e: Enemy, reward: boolean) {
    if (e.dead) return;
    e.dead = true;
    const p = this.player;
    this.fx.explosion(e.x, e.y, e.r * 1.6, e.def.boss ? C.red : C.amber);
    this.fx.burst(e.x, e.y, C.steel, 6 + e.r, 70, 0.5, 2);
    this.lightFlash(e.x, e.y, e.r * 5);
    e.def.onDeath?.(e, this);
    if (!reward || e.mem.summoned) return;
    p.kills++;
    const coins = Math.floor(e.def.coins + Math.random());
    if (coins > 0) dropLoot(this, 'coin', e.x, e.y, coins);
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
      this.clearBullets(true);
      this.fx.ring(e.x, e.y, C.red, 80, 0.6);
    }
  }

  private onBossDefeated() {
    this.clearBullets(true);
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

  useBomb() {
    const p = this.player;
    p.bombs--;
    p.invuln = Math.max(p.invuln, 1.3);
    this.clearBullets(true);
    const R = 150;
    this.fx.ring(p.x, p.y, C.yellow, R, 0.5);
    this.fx.ring(p.x, p.y, C.violet, R * 0.6, 0.4);
    this.fx.flash(p.x, p.y, C.bone, 60, 0.2);
    this.lightFlash(p.x, p.y, 300);
    for (const e of this.enemies) {
      if (dist2(p.x, p.y, e.x, e.y) < R * R) damageEnemy(this, e, p.stats.bombPower * (1 + this.floorNum * 0.15), p.x, p.y, { shock: 1, silent: true });
    }
    p.emit('onBomb', this);
  }

  lightFlash(x: number, y: number, r: number) {
    if (this.lightFlashes.length < 12) this.lightFlashes.push({ x, y, r, t: 0.25 });
  }

  private checkPlayerHits() {
    const p = this.player;
    if (p.invuln > 0 || p.dashT > 0 || p.holdT > 0.7) return;
    const hr = p.stats.hitR;
    for (const b of this.ebullets) {
      if (b.delay > 0) continue;
      const r = b.r * 0.8 + hr;
      if (dist2(b.x, b.y, p.x, p.y) < r * r) return this.hurtPlayer();
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
    p.bombs = Math.max(p.bombs, p.stats.startBombs);
    this.fx.burst(p.x, p.y, C.red, 24, 120, 0.6, 2, true);
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
