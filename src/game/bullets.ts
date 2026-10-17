import { TAU, angleDiff, angleTo } from '../core/math';
import { C } from '../gfx/palette';
import { BULLET_R, bulletSprite, shotSprite, type BulletColor, type BulletSkin } from '../gfx/sprites';
import { blocksShots } from '../world/tiles';
import type { Enemy } from './enemy';
import type { Game } from './game';
import type { ShotStyle } from './stats';

// ---------------------------------------------------------------------------
// Вражеские пули (bullet hell). Движение задаётся углом и скоростью — так проще делать
// закручивающиеся, ускоряющиеся и самонаводящиеся узоры.

export interface EBullet {
  x: number;
  y: number;
  angle: number;
  speed: number;
  r: number;
  skin: BulletSkin;
  color: BulletColor;
  life: number;
  t: number;
  accel: number;
  turn: number;
  minSpeed: number;
  maxSpeed: number;
  /** Задержка перед стартом (пуля видна, но неподвижна и безвредна) */
  delay: number;
  homing: number;
  bounces: number;
  dead: boolean;
  /** Уже засчитан пролёт вплотную (заряд сбоя) */
  grazed?: boolean;
  /** Кто выпустил (для ответного удара «КАЗ» и пуль союзников) */
  owner?: Enemy;
  /** Замедление в этом кадре (паутина, «Сканер траекторий»): 0..1, сбрасывается после движения */
  slow?: number;
  /** Луч (не сбивается «КАЗ») */
  beam?: boolean;
  /** Прошла сквозь героя (мерцание) — больше его не задевает */
  phased?: boolean;
}

export interface EBulletOpts {
  skin?: BulletSkin;
  color?: BulletColor;
  accel?: number;
  turn?: number;
  minSpeed?: number;
  maxSpeed?: number;
  delay?: number;
  life?: number;
  homing?: number;
  bounces?: number;
}

export function makeEBullet(x: number, y: number, angle: number, speed: number, o: EBulletOpts = {}): EBullet {
  const skin = o.skin ?? 'orb';
  return {
    x, y, angle, speed,
    r: BULLET_R[skin],
    skin,
    color: o.color ?? 'red',
    life: o.life ?? 9,
    t: 0,
    accel: o.accel ?? 0,
    turn: o.turn ?? 0,
    minSpeed: o.minSpeed ?? 0,
    maxSpeed: o.maxSpeed ?? 600,
    delay: o.delay ?? 0,
    homing: o.homing ?? 0,
    bounces: o.bounces ?? 0,
    dead: false,
  };
}

/** Ход вражеских пуль; ally — пули союзников (наводятся на врагов, а не на игрока) */
export function updateEBullets(g: Game, dt: number, L = g.ebullets, ally = false) {
  const room = g.room;
  const p = g.player;
  for (let i = L.length - 1; i >= 0; i--) {
    const b = L[i];
    if (b.delay > 0) {
      b.delay -= dt;
    } else {
      b.t += dt;
      b.life -= dt;
      // замедление (паутина, сканер) — только движение, не время жизни
      const mdt = dt * (1 - (b.slow ?? 0));
      b.slow = 0;
      if (b.accel) b.speed = Math.min(b.maxSpeed, Math.max(b.minSpeed, b.speed + b.accel * mdt));
      if (b.turn) b.angle += b.turn * mdt;
      if (b.homing && b.t < 2.5) {
        const t = ally ? g.nearestEnemy(b.x, b.y, 200) : p;
        if (t) {
          const want = angleTo(b.x, b.y, t.x, t.y);
          const d = angleDiff(b.angle, want);
          b.angle += Math.max(-b.homing * mdt, Math.min(b.homing * mdt, d));
        }
      }
      const nx = b.x + Math.cos(b.angle) * b.speed * mdt;
      const ny = b.y + Math.sin(b.angle) * b.speed * mdt;
      if (blocksShots(room.at(nx, ny))) {
        if (b.bounces > 0) {
          b.bounces--;
          if (blocksShots(room.at(nx, b.y))) b.angle = Math.PI - b.angle;
          else b.angle = -b.angle;
        } else {
          b.dead = true;
          g.fx.add({ kind: 'dot', x: b.x, y: b.y, color: '#5e0f16', life: 0.2, size: 2 });
        }
      } else {
        b.x = nx;
        b.y = ny;
      }
      if (b.life <= 0) b.dead = true;
    }
    if (b.dead) {
      L[i] = L[L.length - 1];
      L.pop();
    }
  }
}

export function renderEBullets(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number) {
  // пули союзников — как снаряды игрока (светлые), чтобы не путать с вражескими
  for (const b of g.abullets) {
    const x = b.x - camX, y = b.y - camY;
    if (x < -20 || y < -20 || x > 404 || y > 236) continue;
    const s = shotSprite(Math.max(1.5, b.r * 0.8), C.bone);
    ctx.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
  }
  for (const b of g.ebullets) {
    const s = bulletSprite(b.skin, b.color, b.angle);
    const x = Math.round(b.x - camX - s.width / 2);
    const y = Math.round(b.y - camY - s.height / 2);
    if (x < -20 || y < -20 || x > 420 || y > 260) continue;
    if (b.delay > 0) ctx.globalAlpha = 0.35 + 0.3 * Math.sin(b.delay * 40);
    ctx.drawImage(s, x, y);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Снаряды игрока. Все модификаторы траекторий (волна, спираль, самонаведение, бумеранг,
// орбита) складываются, поэтому предметы комбинируются между собой.

export interface PBullet {
  x: number;
  y: number;
  /** Опорная точка без смещения волны */
  bx: number;
  by: number;
  angle: number;
  speed: number;
  r: number;
  dmg: number;
  life: number;
  maxLife: number;
  t: number;
  pierce: number;
  bounce: number;
  homing: number;
  wave: number;
  waveFreq: number;
  phase: number;
  spiral: number;
  orbitR: number;
  orbitA: number;
  boomerang: boolean;
  returning: boolean;
  spectral: boolean;
  accel: number;
  grow: number;
  split: number;
  explode: number;
  chain: number;
  burn: number;
  shock: number;
  slow: number;
  hack: number;
  knockback: number;
  crit: boolean;
  color: string;
  style: ShotStyle;
  hit: Set<Enemy>;
  isChild: boolean;
  dead: boolean;
  /** Навес: высота дуги (px). Летит над стенами, пулями и врагами, падает в конце */
  arc?: number;
  /** Радиус взрыва при падении навесного снаряда (урон — dmg) */
  landR?: number;
  /** Метка предмета, выпустившего снаряд, и его данные */
  tag?: string;
  data?: Record<string, any>;
  /** Своё поведение в полёте (до движения) */
  step?(g: Game, b: PBullet, dt: number): void;
  /** После попадания по врагу */
  onHitEnemy?(g: Game, b: PBullet, e: Enemy): void;
  /** Снаряд погас: wall — о стену */
  onEnd?(g: Game, b: PBullet, wall: boolean): void;
}

/** Высота навесного снаряда над полом */
export function lobHeight(b: PBullet): number {
  if (!b.arc) return 0;
  return Math.sin(Math.min(1, b.t / Math.max(0.01, b.maxLife)) * Math.PI) * b.arc;
}

export function updatePBullets(g: Game, dt: number) {
  const L = g.pbullets;
  const room = g.room;
  const p = g.player;
  for (let i = L.length - 1; i >= 0; i--) {
    const b = L[i];
    b.t += dt;
    b.life -= dt;
    b.step?.(g, b, dt);
    if (b.dead) {
      L[i] = L[L.length - 1];
      L.pop();
      continue;
    }
    if (b.grow) b.r = Math.min(16, b.r + b.grow * dt);
    if (b.accel !== 1) b.speed = Math.max(20, Math.min(900, b.speed * Math.pow(b.accel, dt)));
    if (b.spiral) b.angle += b.spiral * dt;

    if (b.homing) {
      const target = g.seekEnemy(b.bx, b.by, 170);
      if (target) {
        const want = angleTo(b.bx, b.by, target.x, target.y);
        const d = angleDiff(b.angle, want);
        b.angle += Math.max(-b.homing * dt, Math.min(b.homing * dt, d));
      }
    }

    if (b.boomerang && !b.returning && b.t > b.maxLife * 0.45) b.returning = true;
    if (b.returning) {
      b.angle = angleTo(b.bx, b.by, p.x, p.y);
      if ((b.bx - p.x) ** 2 + (b.by - p.y) ** 2 < 100) b.dead = true;
      b.hit.clear(); // на обратном пути может снова попасть
    }

    if (b.orbitR > 0) {
      // снаряд кружит вокруг игрока, постепенно расширяя орбиту; каждые 0.4 с может снова бить ту же цель
      if (Math.floor(b.t / 0.4) !== Math.floor((b.t - dt) / 0.4)) b.hit.clear();
      b.orbitA += (b.speed / Math.max(20, b.orbitR)) * dt;
      b.orbitR += 12 * dt;
      b.bx = p.x + Math.cos(b.orbitA) * b.orbitR;
      b.by = p.y + Math.sin(b.orbitA) * b.orbitR;
    } else {
      const nbx = b.bx + Math.cos(b.angle) * b.speed * dt;
      const nby = b.by + Math.sin(b.angle) * b.speed * dt;
      if (!b.spectral && !b.arc && blocksShots(room.at(nbx, nby))) {
        g.hitTile(nbx, nby, b.dmg);
        if (b.bounce > 0) {
          b.bounce--;
          if (blocksShots(room.at(nbx, b.by))) b.angle = Math.PI - b.angle;
          else b.angle = -b.angle;
        } else if (b.boomerang && !b.returning) {
          b.returning = true;
        } else {
          b.dead = true;
          g.onShotDeath(b, true);
        }
      } else {
        b.bx = nbx;
        b.by = nby;
      }
    }

    // волна — смещение перпендикулярно направлению
    if (b.wave) {
      const off = Math.sin(b.t * b.waveFreq + b.phase) * b.wave;
      b.x = b.bx + Math.cos(b.angle + Math.PI / 2) * off;
      b.y = b.by + Math.sin(b.angle + Math.PI / 2) * off;
    } else {
      b.x = b.bx;
      b.y = b.by;
    }

    if (b.life <= 0 && !b.dead) {
      b.dead = true;
      g.onShotDeath(b, false);
    }
    if (b.x < -50 || b.y < -50 || b.x > room.pxW + 50 || b.y > room.pxH + 50) b.dead = true;
    if (b.dead) {
      L[i] = L[L.length - 1];
      L.pop();
    }
  }
}

export function renderPBullets(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number) {
  for (const b of g.pbullets) {
    let x = b.x - camX, y = b.y - camY;
    if (x < -20 || y < -20 || x > 404 || y > 236) continue;
    if (b.arc) {
      // навес: тень на полу, снаряд над ней
      ctx.fillStyle = '#050508';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(Math.round(x - b.r), Math.round(y), Math.round(b.r * 2), 1);
      y -= lobHeight(b);
    }
    const alpha = b.life < 0.1 && !b.arc ? b.life / 0.1 : 1;
    ctx.globalAlpha = alpha;
    switch (b.style) {
      case 'needle':
      case 'shard': {
        const len = b.r * (b.style === 'needle' ? 3 : 2);
        ctx.strokeStyle = '#050508';
        ctx.lineWidth = b.r + 1;
        line(ctx, x, y, b.angle, len);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.r;
        line(ctx, x, y, b.angle, len);
        ctx.strokeStyle = '#fff6dc';
        ctx.lineWidth = 1;
        line(ctx, x, y, b.angle, len * 0.6);
        break;
      }
      case 'flame': {
        const k = b.t / (b.t + b.life);
        ctx.fillStyle = k < 0.3 ? '#fff0b0' : k < 0.6 ? '#ffcc33' : k < 0.85 ? '#a3161f' : '#2e080c';
        const s = b.r * (1 + k);
        ctx.fillRect(Math.round(x - s), Math.round(y - s), Math.round(s * 2), Math.round(s * 2));
        break;
      }
      case 'rocket': {
        ctx.strokeStyle = '#3a3a48';
        ctx.lineWidth = 3;
        line(ctx, x, y, b.angle, 6);
        ctx.fillStyle = b.color;
        ctx.fillRect(Math.round(x + Math.cos(b.angle) * 3 - 1), Math.round(y + Math.sin(b.angle) * 3 - 1), 2, 2);
        if (Math.random() < 0.6) {
          g.fx.add({
            kind: 'smoke', x: b.x - Math.cos(b.angle) * 4, y: b.y - Math.sin(b.angle) * 4,
            life: 0.35, color: '#262632', size: 2, drag: 2,
          });
        }
        break;
      }
      case 'disc': {
        ctx.fillStyle = '#050508';
        ctx.beginPath();
        ctx.arc(x, y, b.r + 1, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, b.r, b.t * 20, b.t * 20 + 4.5);
        ctx.stroke();
        break;
      }
      case 'wave': {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x - Math.cos(b.angle) * b.r, y - Math.sin(b.angle) * b.r, b.r * 1.5, b.angle - 0.9, b.angle + 0.9);
        ctx.stroke();
        break;
      }
      default: {
        const s = shotSprite(b.r, b.color);
        ctx.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
      }
    }
    ctx.globalAlpha = 1;
  }
}

function line(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, len: number) {
  const dx = Math.cos(a) * len * 0.5, dy = Math.sin(a) * len * 0.5;
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
}
