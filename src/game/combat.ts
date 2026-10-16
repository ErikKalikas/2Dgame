import { TAU, angleDiff, dist2 } from '../core/math';
import { C } from '../gfx/palette';
import { T } from '../world/tiles';
import type { PBullet } from './bullets';
import { distToSegment, raycast } from './collision';
import type { Enemy } from './enemy';
import { boltPoints } from './fx';
import type { Game } from './game';
import type { DamageSource } from './items';
import { isFlank } from './status';
import { finalDamage, finalFireDelay, type Stats } from './stats';

export interface DamageOpts {
  burn?: number;
  shock?: number;
  slow?: number;
  hack?: number;
  knockback?: number;
  crit?: boolean;
  source?: DamageSource;
  /** Не вызывать onHit (чтобы эффекты не зацикливались) */
  silent?: boolean;
  /** Метка эффекта предмета (видна в onHit и e.lastHit) */
  tag?: string;
  /** Кто бьёт: игрок (по умолчанию) или союзник */
  by?: 'player' | 'ally';
  /** Снаряд, который попал */
  bullet?: PBullet;
}

/** Нанести урон врагу с учётом статусов, щитов и событий предметов */
export function damageEnemy(g: Game, e: Enemy, dmg: number, fromX: number, fromY: number, o: DamageOpts = {}) {
  if (e.dead || e.spawn > 0 || e.airborne) return;
  // союзника игрок не ранит (его бьют только враги — team.ts)
  if (e.team === 'ally') return;
  if (e.mem.invuln > 0) return;
  const s = g.player.stats;
  if (e.def.damageTaken) dmg = e.def.damageTaken(e, g, dmg, fromX, fromY);
  // взгляд врага: лобовой щит гасит урон спереди, попадание сбоку или со спины — множитель «Щели»
  const flank = isFlank(e, fromX, fromY);
  if (e.def.frontShield && !flank && e.shieldOff <= 0) dmg *= 1 - e.def.frontShield * (1 - s.shieldPierce);
  if (flank && o.by !== 'ally') dmg *= s.flankMult;
  if (e.hackT > 0) dmg *= 1 + e.hackK;
  if (o.crit) dmg *= s.critMult;
  e.lastHit = { source: o.source ?? 'other', tag: o.tag, by: o.by ?? 'player' };
  // подброшенный враг копит урон до падения
  if (e.toss) {
    e.toss.acc += dmg;
    e.flash = 0.06;
    if (!o.silent) g.player.emit('onHit', g, e, { x: e.x, y: e.y, dmg, source: o.source ?? 'other', crit: o.crit, bullet: o.bullet, tag: o.tag, flank });
    return;
  }
  e.hp -= dmg;
  e.flash = 0.06;
  if (o.burn) {
    e.burnT = 2.5;
    e.burnDps = Math.max(e.burnDps, o.burn);
  }
  if (o.slow) {
    e.slowT = 2;
    e.slowK = Math.min(0.7, Math.max(e.slowK, o.slow));
  }
  if (o.shock && Math.random() < o.shock && !e.def.boss) e.shockT = 0.6;
  if (o.hack) {
    e.hackT = 4;
    e.hackK = Math.max(e.hackK, o.hack);
  }
  if (o.knockback && !e.def.heavy && !e.def.boss) {
    const a = Math.atan2(e.y - fromY, e.x - fromX);
    e.kx += Math.cos(a) * o.knockback;
    e.ky += Math.sin(a) * o.knockback;
  }
  if (!o.silent) g.player.emit('onHit', g, e, { x: e.x, y: e.y, dmg, source: o.source ?? 'other', crit: o.crit, bullet: o.bullet, tag: o.tag, flank });
  if (e.def.boss) g.checkBossPhase(e);
  if (e.hp <= 0) g.killEnemy(e, true);
}

/** Урон по площади (tag — метка предмета для e.lastHit: «убит вашим взрывом») */
export function explode(g: Game, x: number, y: number, radius: number, dmg: number, color: string = C.amber, tag?: string) {
  g.fx.explosion(x, y, radius, color);
  g.lightFlash(x, y, radius * 2.2);
  for (const e of g.enemies) {
    if (e.dead || e.team !== 'foe') continue;
    const r = radius + e.r;
    if (dist2(x, y, e.x, e.y) <= r * r) damageEnemy(g, e, dmg, x, y, { knockback: 60, source: 'explosion', silent: true, tag });
  }
  // взрыв ломает ящики
  const room = g.room;
  const t0x = Math.floor((x - radius) / 16), t1x = Math.floor((x + radius) / 16);
  const t0y = Math.floor((y - radius) / 16), t1y = Math.floor((y + radius) / 16);
  for (let ty = t0y; ty <= t1y; ty++)
    for (let tx = t0x; tx <= t1x; tx++) if (room.get(tx, ty) === T.Crate) g.hitTile(tx * 16 + 8, ty * 16 + 8, dmg * 2);
}

/** Цепная молния от точки к ближайшим врагам */
export function chainLightning(g: Game, from: Enemy, jumps: number, dmg: number) {
  const hit = new Set<Enemy>([from]);
  let cur = from;
  for (let i = 0; i < jumps; i++) {
    let best: Enemy | null = null, bd = 95 * 95;
    for (const e of g.enemies) {
      if (e.dead || hit.has(e) || e.spawn > 0 || e.team !== 'foe') continue;
      const d = dist2(cur.x, cur.y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) break;
    g.fx.add({ kind: 'bolt', x: 0, y: 0, points: boltPoints(cur.x, cur.y, best.x, best.y), color: C.yellow, life: 0.15, glow: true });
    hit.add(best);
    damageEnemy(g, best, dmg, cur.x, cur.y, { shock: 0.3, silent: true });
    cur = best;
  }
}

let spiralSign = 1;

/** Создать снаряд игрока по текущим характеристикам */
export function spawnShot(g: Game, angle: number, s: Stats, over: Partial<PBullet> = {}): PBullet {
  const p = g.player;
  const life = s.range / Math.max(60, s.shotSpeed);
  const crit = Math.random() < s.crit;
  // спираль закручивается поочерёдно в разные стороны — так легче попадать
  spiralSign = -spiralSign;
  const b: PBullet = {
    x: p.x, y: p.y - 3, bx: p.x, by: p.y - 3,
    angle, speed: s.shotSpeed, r: 2.5 * s.size, dmg: finalDamage(s),
    life, maxLife: life, t: 0,
    pierce: s.pierce, bounce: s.bounce, homing: s.homing,
    wave: s.wave, waveFreq: s.waveFreq, phase: Math.random() < 0.5 ? 0 : Math.PI,
    spiral: s.spiral * spiralSign, orbitR: s.orbit, orbitA: angle,
    boomerang: s.boomerang, returning: false, spectral: s.spectral,
    accel: s.accel, grow: s.grow,
    split: s.split, explode: s.explode, chain: s.chain,
    burn: s.burn, shock: s.shock, slow: s.slow, hack: s.hack, knockback: s.knockback,
    crit, color: crit ? C.bone : s.shotColor, style: s.shotStyle,
    hit: new Set(), isChild: false, dead: false,
    ...over,
  };
  g.pbullets.push(b);
  return b;
}

/** Стандартный веер выстрелов с учётом count/spread/jitter/дополнительных направлений */
export function fan(g: Game, angle: number, s: Stats, over: Partial<PBullet> = {}) {
  const dirs = [angle];
  if (s.backShot) dirs.push(angle + Math.PI);
  if (s.sideShots) dirs.push(angle + Math.PI / 2, angle - Math.PI / 2);
  for (const base of dirs) {
    for (let i = 0; i < s.count; i++) {
      const a = base + (i - (s.count - 1) / 2) * s.spread + (Math.random() - 0.5) * 2 * s.jitter;
      spawnShot(g, a, s, over);
    }
  }
}

/** Выстрел текущим оружием */
export function fireWeapon(g: Game, angle: number, chargeK: number) {
  const p = g.player;
  const s = p.stats;
  const w = p.gun.weapon!;
  g.fx.flash(p.x + Math.cos(angle) * 7, p.y - 3 + Math.sin(angle) * 7, s.shotColor, 3, 0.05);
  switch (w.mode) {
    case 'beam':
      fireBeam(g, angle, s);
      break;
    case 'melee':
      fireMelee(g, angle, s);
      break;
    case 'charge': {
      const over: Partial<PBullet> = {
        dmg: finalDamage(s) * (0.35 + chargeK * 2.4),
        r: 2.5 * s.size * (0.7 + chargeK * 0.8),
        pierce: s.pierce + Math.floor(chargeK * 3),
      };
      if (w.fire) w.fire(g, angle, { ...s, damage: s.damage * (0.35 + chargeK * 2.4) });
      else fan(g, angle, s, over);
      break;
    }
    default:
      if (w.fire) w.fire(g, angle, s);
      else fan(g, angle, s);
  }
  p.emit('onShoot', g, angle);
}

/** Луч: мгновенно бьёт всех врагов на линии до стены */
export function fireBeam(g: Game, angle: number, s: Stats) {
  const p = g.player;
  const width = 2.5 * s.size;
  const dirs = [angle];
  if (s.backShot) dirs.push(angle + Math.PI);
  if (s.sideShots) dirs.push(angle + Math.PI / 2, angle - Math.PI / 2);
  const all: number[] = [];
  for (const base of dirs) for (let i = 0; i < s.count; i++) all.push(base + (i - (s.count - 1) / 2) * s.spread);
  const dmg = finalDamage(s);
  for (let a of all) {
    const x1 = p.x, y1 = p.y - 3;
    // самонаведение у луча — доворот к ближайшей цели
    if (s.homing) {
      const t = g.nearestEnemy(x1, y1, s.range);
      if (t) {
        const want = Math.atan2(t.y - y1, t.x - x1);
        const d = angleDiff(a, want);
        a += Math.max(-0.35, Math.min(0.35, d * Math.min(1, s.homing / 4)));
      }
    }
    const len = s.spectral ? s.range : raycast(g.room, x1, y1, a, s.range);
    const x2 = x1 + Math.cos(a) * len, y2 = y1 + Math.sin(a) * len;
    g.fx.add({
      kind: 'beam', x: x1, y: y1, x2, y2, color: s.shotColor, size: width * 1.6,
      life: Math.min(0.12, finalFireDelay(s) * 1.3), glow: true,
    });
    let hits = 0;
    for (const e of g.enemies) {
      if (e.dead || e.spawn > 0 || e.team !== 'foe') continue;
      if (distToSegment(e.x, e.y, x1, y1, x2, y2) > e.r + width) continue;
      const crit = Math.random() < s.crit;
      damageEnemy(g, e, dmg, x1, y1, {
        burn: s.burn, shock: s.shock, slow: s.slow, hack: s.hack, knockback: s.knockback * 0.3, crit, source: 'beam',
      });
      if (s.chain) chainLightning(g, e, s.chain, dmg * 0.5);
      hits++;
      if (hits > s.pierce + 3) break;
    }
    if (s.explode) explode(g, x2, y2, s.explode * 0.7, dmg * 0.6);
    g.hitTile(x2 + Math.cos(a) * 2, y2 + Math.sin(a) * 2, dmg);
  }
}

/** Удар по дуге: бьёт врагов рядом и разрезает вражеские пули */
export function fireMelee(g: Game, angle: number, s: Stats) {
  const p = g.player;
  const reach = 30 * s.size + s.range * 0.05;
  const arc = Math.min(TAU, 1.7 + (s.count - 1) * 0.5 + s.spread);
  const dmg = finalDamage(s);
  g.fx.add({ kind: 'slash', x: p.x, y: p.y - 3, angle, arc, size: reach, color: s.shotColor, life: 0.14, glow: true });
  const dirs = [angle];
  if (s.backShot) dirs.push(angle + Math.PI);
  for (const a of dirs) {
    if (a !== angle) g.fx.add({ kind: 'slash', x: p.x, y: p.y - 3, angle: a, arc, size: reach, color: s.shotColor, life: 0.14, glow: true });
    for (const e of g.enemies) {
      if (e.dead || e.spawn > 0 || e.team !== 'foe') continue;
      const d2 = dist2(p.x, p.y, e.x, e.y);
      if (d2 > (reach + e.r) ** 2) continue;
      if (Math.abs(angleDiff(a, Math.atan2(e.y - p.y, e.x - p.x))) > arc / 2 + 0.2) continue;
      const crit = Math.random() < s.crit;
      damageEnemy(g, e, dmg, p.x, p.y, {
        burn: s.burn, shock: s.shock, slow: s.slow, hack: s.hack, knockback: s.knockback * 2, crit, source: 'melee',
      });
      if (s.chain) chainLightning(g, e, s.chain, dmg * 0.5);
      if (s.explode) explode(g, e.x, e.y, s.explode * 0.6, dmg * 0.5);
    }
    // разрезаем пули в дуге
    for (const b of g.ebullets) {
      if (dist2(p.x, p.y, b.x, b.y) > reach * reach) continue;
      if (Math.abs(angleDiff(a, Math.atan2(b.y - p.y, b.x - p.x))) > arc / 2) continue;
      b.dead = true;
      g.fx.add({ kind: 'dot', x: b.x, y: b.y, color: C.bone, life: 0.2, size: 1, glow: true });
    }
    // и ящики
    g.hitTile(p.x + Math.cos(a) * reach * 0.7, p.y + Math.sin(a) * reach * 0.7, dmg);
  }
  // волна при count/split: метательные полумесяцы
  if (s.split > 0) {
    for (let i = 0; i < s.split; i++) {
      spawnShot(g, angle + (i - (s.split - 1) / 2) * 0.3, s, { style: 'wave', r: 4 * s.size, pierce: 3 + s.pierce, dmg: dmg * 0.5 });
    }
  }
}

/** Проверка попаданий снарядов игрока по врагам */
export function collidePlayerShots(g: Game) {
  for (const b of g.pbullets) {
    // навесной снаряд летит над врагами и бьёт только при падении
    if (b.dead || b.arc) continue;
    for (const e of g.enemies) {
      if (e.dead || e.spawn > 0 || e.airborne || e.team !== 'foe' || b.hit.has(e)) continue;
      const r = e.r + b.r;
      if (dist2(b.x, b.y, e.x, e.y) > r * r) continue;
      b.hit.add(e);
      damageEnemy(g, e, b.dmg, b.x - Math.cos(b.angle) * 8, b.y - Math.sin(b.angle) * 8, {
        burn: b.burn, shock: b.shock, slow: b.slow, hack: b.hack, knockback: b.knockback, crit: b.crit, source: 'bullet', bullet: b, tag: b.tag,
      });
      b.onHitEnemy?.(g, b, e);
      g.fx.burst(b.x, b.y, b.color, 3, 50, 0.2);
      if (b.chain) chainLightning(g, e, b.chain, b.dmg * 0.5);
      if (b.explode) explode(g, b.x, b.y, b.explode, b.dmg * 0.7);
      if (b.split && !b.isChild) {
        const n = b.split;
        for (let i = 0; i < n; i++) {
          const a = b.angle + (i / n) * TAU + 0.3;
          spawnShot(g, a, g.player.stats, {
            x: b.x, y: b.y, bx: b.x, by: b.y, dmg: b.dmg * 0.4, r: Math.max(1.5, b.r * 0.6),
            life: 0.35, maxLife: 0.35, isChild: true, split: 0, explode: 0, homing: b.homing, orbitR: 0,
            boomerang: false, hit: new Set([e]),
          });
        }
      }
      if (b.pierce > 0) b.pierce--;
      else {
        b.dead = true;
        break;
      }
    }
  }
}
