import { TAU, angleDiff, angleTo, dist2 } from '../../core/math';
import { C } from '../../gfx/palette';
import type { PBullet } from '../../game/bullets';
import { lineOfSight, moveBody } from '../../game/collision';
import type { Enemy } from '../../game/enemy';
import type { Game } from '../../game/game';
import { shotFrom } from '../../game/minions';
import { bossLike, isFoe } from '../../game/status';

// Общее для предметов наборов врагов (этап 12б).

/** «Вплотную»: убийство и удар ближе этого (px) */
export const CLOSE = 40;

/** Синергия активна */
export function hasSyn(g: Game, id: string): boolean {
  return g.player.synergies.some((s) => s.id === id);
}

/** Состояние предмета на забег (g.mem), создаётся при первом обращении */
export function st<T extends object>(g: Game, key: string, init: () => T): T {
  return (g.mem[key] ??= init()) as T;
}

/** Оглушение (боссы и мини-боссы не оглушаются) */
export function stun(e: Enemy, t: number) {
  if (bossLike(e) || e.dead) return;
  e.shockT = Math.max(e.shockT, t);
}

/**
 * Множитель урона снаряда по ключу (несколько предметов меняют урон в полёте — «в точку»,
 * дальномер, стая): урон = исходный × произведение всех множителей
 */
export function shotK(b: PBullet, key: string, k: number) {
  const d = (b.data ??= {});
  if (d.base === undefined) d.base = b.dmg;
  const ks = (d.ks ??= {}) as Record<string, number>;
  if (ks[key] === k) return;
  ks[key] = k;
  let m = 1;
  for (const v of Object.values(ks)) m *= v;
  b.dmg = d.base * m;
}

/** Снаряд из системы игрока (не «основной» выстрел): короткая жизнь, без деления и взрыва */
export function childShot(g: Game, x: number, y: number, a: number, over: Partial<PBullet> = {}): PBullet {
  return shotFrom(g, x, y, a, { isChild: true, split: 0, explode: 0, homing: 0, ...over });
}

/** Кольцо из n снарядов */
export function ringShots(g: Game, x: number, y: number, n: number, over: Partial<PBullet> = {}) {
  if (g.pbullets.length > 460) return;
  const off = Math.random() * TAU;
  for (let i = 0; i < n; i++) childShot(g, x, y, off + (i / n) * TAU, over);
}

/** Отбросить врага так, чтобы он отлетел примерно на dist (px) от точки */
export function knockTo(e: Enemy, fromX: number, fromY: number, dist: number) {
  if (e.def.heavy || bossLike(e)) return;
  const a = angleTo(fromX, fromY, e.x, e.y);
  const need = Math.max(0, dist - Math.sqrt(dist2(fromX, fromY, e.x, e.y)));
  // отброс гаснет за ~0,1 с и проходит ≈ 0,6 от начальной скорости
  e.kx = Math.cos(a) * need / 0.6;
  e.ky = Math.sin(a) * need / 0.6;
}

/** Мгновенный скачок героя (стены останавливают; конец над ямой — возврат на край, как у рывка) */
export function blink(g: Game, angle: number, d: number) {
  const p = g.player;
  g.fx.add({ kind: 'ghost', x: p.x, y: p.y, sprite: p.sprite, life: 0.3 });
  const body = { x: p.x, y: p.y, r: p.bodyR };
  moveBody(g.room, body, Math.cos(angle) * d, Math.sin(angle) * d, (t, tx, ty) => g.playerSolid(t, tx, ty, true));
  p.x = body.x;
  p.y = body.y;
}

/** Враги в конусе от героя (±arc от угла) не дальше range, ближайший к линии прицела */
export function coneTarget(g: Game, angle: number, arc: number, range: number, los = true): Enemy | null {
  const p = g.player;
  let best: Enemy | null = null, bd = Infinity;
  for (const e of g.enemies) {
    if (!isFoe(e) || e.toss) continue;
    const d2 = dist2(p.x, p.y, e.x, e.y);
    if (d2 > range * range) continue;
    const da = Math.abs(angleDiff(angle, angleTo(p.x, p.y, e.x, e.y)));
    if (da > arc) continue;
    if (los && !lineOfSight(g.room, p.x, p.y - 3, e.x, e.y)) continue;
    const score = da * 100 + Math.sqrt(d2) * 0.1;
    if (score < bd) {
      bd = score;
      best = e;
    }
  }
  return best;
}

/** Враг виден герою: на экране и в прямой видимости */
export function visible(g: Game, e: Enemy): boolean {
  const x = e.x - g.camX, y = e.y - g.camY;
  if (x < 0 || y < 0 || x > 384 || y > 216) return false;
  return lineOfSight(g.room, g.player.x, g.player.y - 3, e.x, e.y);
}

/** Вражеские пули в радиусе гаснут (возвращает число) */
export function eraseBullets(g: Game, x: number, y: number, r: number, color: string = C.bone, filter?: (b: (typeof g.ebullets)[number]) => boolean): number {
  let n = 0;
  for (const b of g.ebullets) {
    if (b.dead || dist2(x, y, b.x, b.y) > r * r || (filter && !filter(b))) continue;
    b.dead = true;
    n++;
    if (n % 2) g.fx.add({ kind: 'dot', x: b.x, y: b.y, vy: -20, color, life: 0.3, glow: true });
  }
  if (n) g.ebullets = g.ebullets.filter((b) => !b.dead);
  return n;
}

/** Поджечь врага (статус поджога) */
export function ignite(e: Enemy, dps: number, t = 2.5) {
  e.burnT = Math.max(e.burnT, t);
  e.burnDps = Math.max(e.burnDps, dps);
}

/** id синергий наборов: ступень 1 — ядро (три первых предмета), 2 — весь набор */
export const SYN = {
  scav: 'setScav', punk: 'setPunk', drone: 'setDrone', spider: 'setSpider', swarm: 'setSwarm',
  guard1: 'setGuard1', guard2: 'setGuard2', blink1: 'setBlink1', blink2: 'setBlink2',
  sniper1: 'setSniper1', sniper2: 'setSniper2', turret1: 'setTurret1', turret2: 'setTurret2',
  repair1: 'setRepair1', repair2: 'setRepair2',
  cutter1: 'setCutter1', cutter2: 'setCutter2', stoker1: 'setStoker1', stoker2: 'setStoker2',
  heavy1: 'setHeavy1', heavy2: 'setHeavy2', flea1: 'setFlea1', flea2: 'setFlea2',
  snap1: 'setSnap1', snap2: 'setSnap2', mech1: 'setMech1', mech2: 'setMech2',
} as const;
