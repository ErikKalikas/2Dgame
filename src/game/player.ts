import { input } from '../core/input';
import { SPR } from '../gfx/sprites';
import type { Sprite } from '../gfx/sprite';
import { T, walkable } from '../world/tiles';
import { moveBody } from './collision';
import type { Game } from './game';
import { ITEMS, SYNERGIES, item, type Hooks, type ItemDef, type SynergyDef, type Tag } from './items';
import { baseStats, finalFireDelay, type Stats } from './stats';

export type Facing = 'down' | 'up' | 'left' | 'right';

/** Киборг под управлением игрока. Управление и здоровье — как в Touhou. */
export class Player {
  x = 0;
  y = 0;
  /** Радиус тела для столкновения со стенами (хитбокс для пуль — stats.hitR) */
  readonly bodyR = 4;
  facing: Facing = 'down';
  anim = 0;
  moving = false;
  focus = false;

  lives = 4;
  bombs = 2;
  coins = 0;
  keys = 0;
  xp = 0;
  level = 1;
  kills = 0;

  invuln = 0;
  dashT = 0;
  dashCd = 0;
  dashDx = 0;
  dashDy = 0;
  fireCd = 0;
  charge = 0;
  burstLeft = 0;
  burstT = 0;
  burstAngle = 0;
  shootAngle = Math.PI / 2;
  shooting = false;
  activeCd = 0;
  /** Оставшиеся заряды щита в текущей комнате */
  shieldLeft = 0;
  droneT = 0;
  /** Анимация подбора предмета (как в Isaac — предмет поднимается над головой) */
  holdItem: ItemDef | null = null;
  holdT = 0;

  weapon: ItemDef;
  implants: string[] = [];
  passives = new Map<string, number>();
  activeId: string | null = null;

  stats: Stats = baseStats();
  /** Поправка к максимуму жизней от сложности */
  lifeOffset = 0;
  hooks: Hooks[] = [];
  synergies: SynergyDef[] = [];

  constructor(startWeapon: string) {
    this.weapon = item(startWeapon);
    this.recalc();
  }

  has(id: string): boolean {
    return this.weapon.id === id || this.implants.includes(id) || this.passives.has(id) || this.activeId === id;
  }

  tagCount(tag: Tag): number {
    let n = 0;
    const all = [this.weapon.id, ...this.implants, ...this.passives.keys()];
    if (this.activeId) all.push(this.activeId);
    for (const id of all) if (ITEMS.get(id)?.tags.includes(tag)) n++;
    return n;
  }

  /** Пересчёт характеристик: база → оружие → импланты → модификации → синергии */
  recalc() {
    const s = baseStats();
    s.maxLives += this.lifeOffset;
    const hooks: Hooks[] = [];
    this.weapon.weapon?.stats(s);
    if (this.weapon.hooks) hooks.push(this.weapon.hooks);
    const apply = (it: ItemDef, stacks: number) => {
      it.stats?.(s, stacks);
      if (it.hooks) hooks.push(it.hooks);
    };
    for (const id of this.implants) apply(item(id), 1);
    if (this.activeId) apply(item(this.activeId), 1);
    for (const [id, n] of this.passives) apply(item(id), n);
    this.synergies = SYNERGIES.filter((sy) => sy.requires((id) => this.has(id), (t) => this.tagCount(t)));
    for (const sy of this.synergies) {
      sy.stats?.(s);
      if (sy.hooks) hooks.push(sy.hooks);
    }
    s.maxLives = Math.min(10, Math.max(1, Math.round(s.maxLives)));
    s.count = Math.max(1, Math.round(s.count));
    this.stats = s;
    this.hooks = hooks;
    this.lives = Math.min(this.lives, s.maxLives);
  }

  emit<K extends keyof Hooks>(name: K, ...args: Parameters<NonNullable<Hooks[K]>>) {
    for (const h of this.hooks) {
      const fn = h[name] as ((...a: unknown[]) => void) | undefined;
      fn?.(...args);
    }
  }

  get sprite(): Sprite {
    const frames = SPR.player[this.facing];
    if (this.holdItem) return SPR.player.down[0];
    if (!this.moving) return frames[0];
    return frames[1 + (Math.floor(this.anim * 8) % 2)];
  }

  update(g: Game, dt: number) {
    const s = this.stats;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.activeCd = Math.max(0, this.activeCd - dt);
    if (this.holdT > 0) {
      this.holdT -= dt;
      if (this.holdT <= 0) this.holdItem = null;
    }

    // --- движение (как в Touhou: мгновенный отклик, Shift — точный режим)
    let mx = 0, my = 0;
    if (input.isDown('left')) mx -= 1;
    if (input.isDown('right')) mx += 1;
    if (input.isDown('up')) my -= 1;
    if (input.isDown('down')) my += 1;
    this.focus = input.isDown('focus');
    const len = Math.hypot(mx, my);
    this.moving = len > 0;
    if (len) {
      mx /= len;
      my /= len;
    }

    if (input.pressed('dash') && this.dashCd <= 0 && this.dashT <= 0) {
      let dx = mx, dy = my;
      if (!len) {
        dx = this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0;
        dy = this.facing === 'up' ? -1 : this.facing === 'down' ? 1 : 0;
      }
      this.dashT = 0.14;
      this.dashDx = dx;
      this.dashDy = dy;
      this.dashCd = s.dashCd;
      this.invuln = Math.max(this.invuln, 0.2);
      this.emit('onDash', g);
    }

    let vx: number, vy: number;
    if (this.dashT > 0) {
      this.dashT -= dt;
      const sp = s.dashDist / 0.14;
      vx = this.dashDx * sp;
      vy = this.dashDy * sp;
      if (Math.random() < 0.7) g.fx.add({ kind: 'ghost', x: this.x, y: this.y, sprite: this.sprite, life: 0.25 });
    } else {
      const sp = this.focus ? s.focusSpeed : s.speed;
      vx = mx * sp;
      vy = my * sp;
    }
    const body = { x: this.x, y: this.y, r: this.bodyR };
    moveBody(g.room, body, vx * dt, vy * dt, (t, tx, ty) => g.playerSolid(t, tx, ty, this.dashT > 0));
    this.x = body.x;
    this.y = body.y;
    if (this.moving) this.anim += dt;

    // --- стрельба стрелками (как в Isaac), 8 направлений
    let ax = 0, ay = 0;
    if (input.isDown('shootLeft')) ax -= 1;
    if (input.isDown('shootRight')) ax += 1;
    if (input.isDown('shootUp')) ay -= 1;
    if (input.isDown('shootDown')) ay += 1;
    this.shooting = !!(ax || ay);
    if (this.shooting) this.shootAngle = Math.atan2(ay, ax);

    const face = this.shooting ? [ax, ay] : this.moving ? [mx, my] : null;
    if (face) {
      if (Math.abs(face[0]) > Math.abs(face[1]) + 0.01) this.facing = face[0] < 0 ? 'left' : 'right';
      else this.facing = face[1] < 0 ? 'up' : 'down';
    }

    this.fireCd -= dt;
    const w = this.weapon.weapon!;
    if (w.mode === 'charge') {
      const full = (w.chargeTime ?? 1) / s.fireRateMult;
      if (this.shooting) {
        this.charge = Math.min(full, this.charge + dt);
      } else if (this.charge > 0) {
        const k = this.charge / full;
        if (k > 0.15) g.fireWeapon(this.shootAngle, k);
        this.charge = 0;
      }
    } else if (this.shooting && this.fireCd <= 0) {
      this.fireCd = finalFireDelay(s);
      if (s.burst > 1) {
        this.burstLeft = s.burst - 1;
        this.burstT = 0.06;
        this.burstAngle = this.shootAngle;
      }
      g.fireWeapon(this.shootAngle, 1);
    }
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstLeft--;
        this.burstT = 0.06;
        g.fireWeapon(this.shooting ? this.shootAngle : this.burstAngle, 1);
      }
    }

    if (input.pressed('bomb') && this.bombs > 0) g.useBomb();
    if (input.pressed('active') && this.activeId && this.activeCd <= 0) {
      const it = item(this.activeId);
      it.active!.use(g);
      this.activeCd = it.active!.cooldown;
    }
  }

  /** Стоит ли игрок на ловушке-электрополе */
  onElectro(g: Game): boolean {
    return g.room.at(this.x, this.y + 2) === T.Electro;
  }

  /** Безопасная точка для возврата (если игрок как-то оказался в яме) */
  onSolidGround(g: Game): boolean {
    return walkable(g.room.at(this.x, this.y)) || g.room.at(this.x, this.y) === T.Door;
  }
}
