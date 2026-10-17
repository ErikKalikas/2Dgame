import { input } from '../core/input';
import { playerLook } from './look';
import type { Sprite } from '../gfx/sprite';
import { T, walkable } from '../world/tiles';
import { moveBody, overlaps } from './collision';
import type { Game } from './game';
import { ITEMS, SYNERGIES, item, type Hooks, type ItemDef, type Slot, type SynergyDef, type Tag } from './items';
import { baseStats, finalFireDelay, type Stats } from './stats';
import { C } from '../gfx/palette';
import type { Disable } from './instability';

/** Временный бафф: меняет характеристики, пока идёт таймер (или пока условие держит его включённым) */
export interface Buff {
  t: number;
  stats: (s: Stats) => void;
}

/** Окно для второго рывка подряд (с), иначе начинается перезарядка */
const DASH_CHAIN = 0.5;

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
  /** Заряд сбоя 0..1 (полный в начале уровня) */
  glitch = 1;
  /** Сколько ещё длится сбой (Т-417 вне системы) */
  glitchT = 0;
  /** Аварийное окно: попадание уже случилось, но F ещё может его отменить */
  pendingHit = 0;
  /** Перезарядка толчка левой рукой и время его анимации */
  shoveCd = 0;
  shoveT = 0;
  coins = 0;
  xp = 0;
  level = 1;
  kills = 0;

  invuln = 0;
  dashT = 0;
  dashCd = 0;
  dashDx = 0;
  dashDy = 0;
  /** Множитель длины текущего рывка (хуки onDash могут менять: «Отскок», «Перескок») */
  dashK = 1;
  /** Сколько рывков подряд ещё доступно и сколько ждать следующего в серии */
  dashLeft = 1;
  dashChainT = 0;
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
  /** Последняя точка на твёрдом полу (если рывок закончился над ямой) */
  safeX = 0;
  safeY = 0;
  droneT = 0;
  /** Анимация подбора предмета (как в Isaac — предмет поднимается над головой) */
  holdItem: ItemDef | null = null;
  holdT = 0;

  /** Оружие в правой руке: ручное или модуль руки-оружия (тогда он же стоит в слоте armR) */
  weapon: ItemDef;
  /** Модули тела по слотам (id) */
  slots: Partial<Record<Slot, string>> = {};
  /** Установленный скелет */
  skeleton = 'skWorker';
  /** Рюкзак: подобранные, но ещё не установленные модули и скелеты */
  backpack: string[] = [];
  backpackSize = 3;
  /** Открытые системы тела (кровеносная, щупальца, нервная, реактор) */
  systems = new Set<Slot>();
  /** Прошивки и их стаки */
  passives = new Map<string, number>();
  /** Щит левой руки поднят (для отрисовки) */
  shieldUp = 0;
  /** Отключённые нестабильные предметы (этап 12): id → как долго */
  disabled = new Map<string, Disable>();

  stats: Stats = baseStats();
  /** Поправка к максимуму жизней от сложности */
  lifeOffset = 0;
  hooks: Hooks[] = [];
  synergies: SynergyDef[] = [];
  /** Временные баффы по id */
  buffs = new Map<string, Buff>();

  constructor(startWeapon: string) {
    this.weapon = item(startWeapon);
    this.recalc();
  }

  /** Установленные модули (без скелета) */
  get installed(): string[] {
    return Object.values(this.slots).filter((id): id is string => !!id);
  }

  /** Активный модуль (Q): первый установленный с активной способностью */
  get activeId(): string | null {
    for (const id of this.installed) if (item(id).active && !this.disabled.has(id)) return id;
    return null;
  }

  /** Модуль левой руки, если стоит и не отключён */
  get leftModule(): ItemDef | null {
    const id = this.slots.armL;
    return id && !this.disabled.has(id) ? item(id) : null;
  }

  /** Чем стреляет правая рука: отключённое нестабильное оружие заменяет клепальный пистолет */
  get gun(): ItemDef {
    return this.disabled.has(this.weapon.id) ? item('pistol') : this.weapon;
  }

  get skeletonClass(): number {
    return item(this.skeleton).skeletonClass ?? 1;
  }

  has(id: string): boolean {
    if (this.disabled.has(id)) return false;
    return this.weapon.id === id || this.installed.includes(id) || this.passives.has(id) || this.skeleton === id;
  }

  tagCount(tag: Tag): number {
    let n = 0;
    const all = new Set([this.weapon.id, ...this.installed, ...this.passives.keys(), this.skeleton]);
    for (const id of all) if (ITEMS.get(id)?.tags.includes(tag)) n++;
    return n;
  }

  /** Пересчёт характеристик: база → оружие → импланты → модификации → синергии */
  recalc() {
    const s = baseStats();
    s.maxLives += this.lifeOffset;
    const hooks: Hooks[] = [];
    const gun = this.gun;
    gun.weapon?.stats(s);
    // рука-оружие сильнее ручного, но меняется только в операционной
    if (gun.slot === 'armR') s.damageMult *= 1.25;
    if (gun.hooks) hooks.push(gun.hooks);
    const apply = (it: ItemDef, stacks: number) => {
      it.stats?.(s, stacks);
      if (it.hooks) hooks.push(it.hooks);
    };
    apply(item(this.skeleton), 1);
    for (const id of this.installed) if (id !== this.weapon.id && !this.disabled.has(id)) apply(item(id), 1);
    for (const [id, n] of this.passives) if (!this.disabled.has(id)) apply(item(id), n);
    this.synergies = SYNERGIES.filter((sy) => sy.requires((id) => this.has(id), (t) => this.tagCount(t)));
    for (const sy of this.synergies) {
      sy.stats?.(s);
      if (sy.hooks) hooks.push(sy.hooks);
    }
    for (const b of this.buffs.values()) b.stats(s);
    s.maxLives = Math.min(10, Math.max(1, Math.round(s.maxLives)));
    s.count = Math.max(1, Math.round(s.count));
    this.stats = s;
    this.hooks = hooks;
    this.lives = Math.min(this.lives, s.maxLives);
  }

  /** Бафф на t секунд (повтор — обновляет таймер); Infinity — пока не снят setBuff(id, false) */
  addBuff(id: string, t: number, stats: (s: Stats) => void) {
    const b = this.buffs.get(id);
    if (b) {
      b.t = Math.max(b.t, t);
      return;
    }
    this.buffs.set(id, { t, stats });
    this.recalc();
  }

  /** Включить/выключить бафф по условию (пересчёт — только при смене состояния) */
  setBuff(id: string, on: boolean, stats: (s: Stats) => void) {
    if (on === this.buffs.has(id)) return;
    if (on) this.buffs.set(id, { t: Infinity, stats });
    else this.buffs.delete(id);
    this.recalc();
  }

  /** Бафф с меняющейся силой: stats — новые характеристики (null — снять); всегда пересчёт */
  putBuff(id: string, stats: ((s: Stats) => void) | null) {
    if (stats) this.buffs.set(id, { t: Infinity, stats });
    else if (!this.buffs.delete(id)) return;
    this.recalc();
  }

  hasBuff(id: string): boolean {
    return this.buffs.has(id);
  }

  private updateBuffs(dt: number) {
    if (!this.buffs.size) return;
    let changed = false;
    for (const [id, b] of this.buffs) {
      b.t -= dt;
      if (b.t <= 0) {
        this.buffs.delete(id);
        changed = true;
      }
    }
    if (changed) this.recalc();
  }

  emit<K extends keyof Hooks>(name: K, ...args: Parameters<NonNullable<Hooks[K]>>) {
    for (const h of this.hooks) {
      const fn = h[name] as ((...a: unknown[]) => void) | undefined;
      fn?.(...args);
    }
  }

  /** Двуручное оружие занимает и левую руку */
  get twoHanded(): boolean {
    return this.gun.weapon?.hands === 2;
  }

  /** Куда смотрит Т-417: направление стрельбы, иначе — взгляда */
  get aimAngle(): number {
    if (this.shooting) return this.shootAngle;
    return this.facing === 'left' ? Math.PI : this.facing === 'right' ? 0 : this.facing === 'up' ? -Math.PI / 2 : Math.PI / 2;
  }

  /** Текущий кадр с деталями установленных модулей */
  get sprite(): Sprite {
    if (this.holdItem) return playerLook(this, 'down', 0);
    if (!this.moving) return playerLook(this, this.facing, 0);
    return playerLook(this, this.facing, 1 + (Math.floor(this.anim * 8) % 2));
  }

  update(g: Game, dt: number) {
    this.updateBuffs(dt);
    const s = this.stats;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    // серия рывков: окно на следующий истекло — перезарядка
    if (this.dashChainT > 0) {
      this.dashChainT -= dt;
      if (this.dashChainT <= 0) {
        this.dashLeft = s.dashCharges;
        this.dashCd = s.dashCd;
      }
    }
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

    if (input.pressed('dash') && this.dashCd <= 0 && this.dashT <= 0) this.startDash(g, mx, my, len);

    let vx: number, vy: number;
    if (this.dashT > 0) {
      this.dashT -= dt;
      const sp = (s.dashDist * this.dashK) / 0.14;
      vx = this.dashDx * sp;
      vy = this.dashDy * sp;
      if (Math.random() < 0.7) g.fx.add({ kind: 'ghost', x: this.x, y: this.y - this.dashHeight, sprite: this.sprite, life: 0.25 });
      if (this.dashT <= 0) this.endDash = true;
    } else {
      const sp = this.focus ? s.focusSpeed : s.speed;
      vx = mx * sp;
      vy = my * sp;
    }
    const body = { x: this.x, y: this.y, r: this.bodyR };
    moveBody(g.room, body, vx * dt, vy * dt, (t, tx, ty) => g.playerSolid(t, tx, ty, this.dashT > 0));
    this.x = body.x;
    this.y = body.y;
    if (this.dashT <= 0) {
      const solid = (t: number, tx: number, ty: number) => g.playerSolid(t, tx, ty, false);
      if (overlaps(g.room, body, solid)) {
        // рывок закончился над ямой — возвращаемся на край
        this.x = this.safeX;
        this.y = this.safeY;
        g.fx.burst(this.x, this.y, '#595968', 6, 40, 0.3);
      } else {
        this.safeX = this.x;
        this.safeY = this.y;
      }
    }
    if (this.moving) this.anim += dt;
    // конец рывка — после движения (позиция приземления уже известна)
    if (this.endDash) {
      this.endDash = false;
      if (s.dashJump) g.fx.ring(this.x, this.y, C.bone, 12, 0.25);
      this.emit('onDashEnd', g);
    }

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
    const w = this.gun.weapon!;
    if (w.mode === 'charge') {
      const full = (w.chargeTime ?? 1) / s.fireRateMult;
      if (this.shooting) {
        this.charge = Math.min(full, this.charge + dt);
      } else if (this.charge > 0) {
        const k = this.charge / full;
        if (k > 0.15) g.fireWeapon(this.shootAngle, k);
        this.charge = 0;
      }
    } else if (this.shooting && this.fireCd <= 0 && !w.manual) {
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

    // левая рука (E): модуль руки или толчок манипулятором; двуручное оружие держит обе руки
    this.shoveCd = Math.max(0, this.shoveCd - dt);
    this.shoveT = Math.max(0, this.shoveT - dt);
    this.shieldUp = Math.max(0, this.shieldUp - dt);
    const lh = this.leftModule?.leftHand;
    if (!this.twoHanded) {
      if (lh?.hold && input.isDown('leftHand')) lh.hold(g, this.aimAngle, dt);
      if (input.pressed('leftHand') && this.shoveCd <= 0) {
        if (lh) lh.use(g, this.aimAngle);
        else g.shove(this.aimAngle);
        this.shoveCd = lh ? lh.cooldown : 0.7;
        this.shoveT = 0.15;
      }
    }

    // сбой (F): по полному заряду или в аварийное окно после попадания
    this.glitchT = Math.max(0, this.glitchT - dt);
    if (input.pressed('glitch')) {
      if (this.pendingHit > 0) g.glitch(true);
      else if (this.glitch >= 1 && this.glitchT <= 0) g.glitch(false);
    }
    if (this.pendingHit > 0) {
      this.pendingHit -= dt;
      if (this.pendingHit <= 0) g.loseLife();
    }
    if (input.pressed('active') && this.activeId && this.activeCd <= 0) {
      const it = item(this.activeId);
      it.active!.use(g);
      this.activeCd = it.active!.cooldown;
    }
  }

  /** Рывок закончился в этом шаге */
  private endDash = false;

  /**
   * Рывок: в сторону движения (стоя — по взгляду). Серия из stats.dashCharges рывков подряд
   * («Перескок»): перезарядка — после последнего или когда истекло окно DASH_CHAIN
   */
  startDash(g: Game, mx: number, my: number, len: number) {
    const s = this.stats;
    let dx = mx, dy = my;
    if (!len) {
      dx = this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0;
      dy = this.facing === 'up' ? -1 : this.facing === 'down' ? 1 : 0;
    }
    if (this.dashLeft <= 0 || this.dashLeft > s.dashCharges) this.dashLeft = s.dashCharges;
    this.dashLeft--;
    this.dashT = 0.14;
    this.dashDx = dx;
    this.dashDy = dy;
    this.dashK = 1;
    if (this.dashLeft > 0) {
      this.dashChainT = DASH_CHAIN;
    } else {
      this.dashChainT = 0;
      this.dashLeft = s.dashCharges;
      this.dashCd = s.dashCd;
    }
    this.invuln = Math.max(this.invuln, 0.2);
    this.emit('onDash', g);
  }

  /** Высота рывка-прыжка над полом (для отрисовки) */
  get dashHeight(): number {
    if (!this.stats.dashJump || this.dashT <= 0) return 0;
    return Math.sin((1 - this.dashT / 0.14) * Math.PI) * 10;
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
