import { TAU, dist2 } from '../core/math';
import { C } from '../gfx/palette';
import type { EBullet } from './bullets';
import { distToSegment } from './collision';
import { damageEnemy } from './combat';
import type { Enemy } from './enemy';
import type { Game } from './game';
import { addObj, type WorldObj } from './objects';
import { isNormal } from './status';

// Зоны на полу (этап 12б): горючее (вспыхивает от снарядов и огня), огонь и угли, паутина,
// гильзы (враги скользят), огненная полоса «Заградогня». Все — объекты игрока (objects.ts).

export type ZoneKind = 'fuel' | 'fire' | 'web' | 'shells' | 'strip';

export interface ZoneOpts {
  /** Поджог в секунду (огонь, вспыхнувшее горючее) или урон в секунду (полоса) */
  dps?: number;
  /** Замедление врагов 0..1 */
  slow?: number;
  /** Сколько держится замедление после выхода (с) */
  slowFor?: number;
  /** Замедление вражеских пуль 0..1 (паутина) */
  bulletSlow?: number;
  /** Сжигает мелкие вражеские пули */
  burnBullets?: boolean;
  /** Полоса: второй конец и ширина */
  x2?: number;
  y2?: number;
  width?: number;
  /** Не больше стольких зон этого вида (старые гаснут) */
  max?: number;
  /** Метка предмета (например, след подошв, угли кочерги) */
  tag?: string;
}

/** Мелкая вражеская пуля: не крупная и не пуля босса */
export function isSmallBullet(b: EBullet): boolean {
  return b.r <= 3 && !b.owner?.def.boss && !b.beam;
}

/** Ваш огонь на полу: огонь, угли, след, вспыхнувшее горючее */
export function isFire(o: WorldObj): boolean {
  return !o.dead && o.kind === 'zone' && o.data.zone === 'fire';
}

function inside(o: WorldObj, x: number, y: number, pad = 0): boolean {
  if (o.data.zone === 'strip') return distToSegment(x, y, o.x, o.y, o.data.x2, o.data.y2) <= o.data.width / 2 + pad;
  return dist2(x, y, o.x, o.y) <= (o.r + pad) ** 2;
}

/** Враги внутри зоны */
function foesIn(g: Game, o: WorldObj, fn: (e: Enemy) => void) {
  for (const e of g.enemies) {
    if (e.dead || e.spawn > 0 || e.team !== 'foe' || e.toss) continue;
    if (inside(o, e.x, e.y, e.r * 0.5)) fn(e);
  }
}

function ignite(g: Game, o: WorldObj) {
  o.data.zone = 'fire';
  o.data.dps = o.data.igniteDps;
  o.data.burnBullets = true;
  o.light = o.r * 1.6;
  g.fx.flash(o.x, o.y, C.amber, o.r, 0.15);
}

export function addZone(g: Game, zone: ZoneKind, x: number, y: number, r: number, life: number, o: ZoneOpts = {}): WorldObj {
  const z = addObj(g, {
    kind: 'zone', x, y, r, life, layer: 'floor',
    light: zone === 'fire' || zone === 'strip' ? r * 1.6 : undefined,
    data: {
      zone, tag: o.tag, dps: o.dps ?? 0, slow: o.slow ?? 0, slowFor: o.slowFor ?? 0.2, bulletSlow: o.bulletSlow ?? 0,
      burnBullets: !!o.burnBullets, igniteDps: o.dps ?? 6, x2: o.x2 ?? x, y2: o.y2 ?? y, width: o.width ?? 12, cd: 0,
    },
    update: updateZone,
    draw: drawZone,
  });
  // предел по метке: старые зоны того же предмета гаснут
  if (o.max && o.tag) {
    const same = g.objs.filter((k) => !k.dead && k.kind === 'zone' && k.data.tag === o.tag);
    for (let i = 0; i < same.length - o.max; i++) same[i].dead = true;
  }
  return z;
}

function updateZone(g: Game, o: WorldObj, dt: number) {
  const d = o.data;
  switch (d.zone) {
    case 'fuel': {
      // вспыхивает от ваших снарядов, вашего огня и горящих врагов
      let lit = false;
      for (const b of g.pbullets) if (!b.dead && !b.arc && inside(o, b.x, b.y)) { lit = true; break; }
      if (!lit) for (const f of g.objs) if (f !== o && isFire(f) && dist2(f.x, f.y, o.x, o.y) < (f.r + o.r) ** 2) { lit = true; break; }
      if (!lit) foesIn(g, o, (e) => { if (e.burnT > 0) lit = true; });
      if (lit) ignite(g, o);
      break;
    }
    case 'fire':
      foesIn(g, o, (e) => {
        e.burnT = Math.max(e.burnT, 0.6);
        e.burnDps = Math.max(e.burnDps, d.dps);
      });
      if (d.burnBullets) burnBullets(g, o);
      break;
    case 'web':
      foesIn(g, o, (e) => slowFoe(e, d.slow, d.slowFor));
      if (d.bulletSlow) for (const b of g.ebullets) if (inside(o, b.x, b.y)) b.slow = Math.max(b.slow ?? 0, d.bulletSlow);
      break;
    case 'shells':
      foesIn(g, o, (e) => slowFoe(e, d.slow, d.slowFor));
      break;
    case 'strip': {
      // огненная полоса: урон в секунду; обычные враги её обходят (выталкиваются), боссы проходят
      d.cd -= dt;
      const tick = d.cd <= 0;
      if (tick) d.cd = 0.25;
      foesIn(g, o, (e) => {
        if (tick) damageEnemy(g, e, d.dps * 0.25, o.x, o.y, { source: 'other', silent: true, tag: d.tag });
        if (isNormal(e)) pushOut(o, e, dt);
      });
      break;
    }
  }
}

function slowFoe(e: Enemy, k: number, dur: number) {
  e.slowK = Math.max(e.slowT > 0 ? e.slowK : 0, k);
  e.slowT = Math.max(e.slowT, dur);
}

function burnBullets(g: Game, o: WorldObj) {
  let any = false;
  for (const b of g.ebullets) {
    if (b.dead || !isSmallBullet(b) || !inside(o, b.x, b.y)) continue;
    b.dead = any = true;
    if (Math.random() < 0.5) g.fx.add({ kind: 'dot', x: b.x, y: b.y, vy: -25, color: C.amber, life: 0.25, glow: true });
  }
  if (any) g.ebullets = g.ebullets.filter((b) => !b.dead);
}

/** Вытолкнуть врага из полосы поперёк её оси */
function pushOut(o: WorldObj, e: Enemy, dt: number) {
  const dx = o.data.x2 - o.x, dy = o.data.y2 - o.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const side = (e.x - o.x) * nx + (e.y - o.y) * ny >= 0 ? 1 : -1;
  e.kx += nx * side * 400 * dt;
  e.ky += ny * side * 400 * dt;
}

function drawZone(g: Game, o: WorldObj, ctx: CanvasRenderingContext2D, x: number, y: number) {
  const d = o.data;
  const fade = Math.min(1, (o.life - o.t) * 2, o.t * 8);
  ctx.globalAlpha = 0.85 * fade;
  switch (d.zone) {
    case 'fuel':
      ctx.fillStyle = C.amberD;
      blob(ctx, x, y, o.r, o.x * 7 + o.y);
      ctx.fillStyle = C.metal;
      blob(ctx, x - 1, y - 1, o.r * 0.5, o.x + o.y * 3);
      break;
    case 'fire': {
      ctx.fillStyle = C.redD;
      blob(ctx, x, y, o.r, o.x * 7 + o.y);
      const n = Math.max(2, Math.round(o.r / 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + g.time * 2;
        const rr = o.r * (0.3 + 0.5 * ((i * 37) % 10) / 10);
        const h = 2 + Math.round(Math.abs(Math.sin(g.time * 9 + i * 1.7)) * 3);
        ctx.fillStyle = (i + Math.floor(g.time * 10)) % 3 === 0 ? C.yellow : C.amber;
        ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.6 - h), 1, h);
      }
      break;
    }
    case 'web': {
      ctx.strokeStyle = C.grey;
      ctx.globalAlpha = 0.45 * fade;
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * o.r, y + Math.sin(a) * o.r);
        ctx.stroke();
      }
      for (const k of [0.4, 0.75, 1]) {
        ctx.beginPath();
        ctx.arc(x, y, o.r * k, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'shells':
      ctx.fillStyle = C.amber;
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4 + o.x;
        const rr = o.r * (((i * 53) % 10) / 10);
        ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr), 2, 1);
      }
      break;
    case 'strip': {
      const x2 = d.x2 - o.x + x, y2 = d.y2 - o.y + y;
      ctx.strokeStyle = C.redD;
      ctx.lineWidth = d.width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const k = i / 9;
        const h = 2 + Math.round(Math.abs(Math.sin(g.time * 8 + i * 2.1)) * 4);
        ctx.fillStyle = (i + Math.floor(g.time * 10)) % 3 === 0 ? C.yellow : C.amber;
        ctx.fillRect(Math.round(x + (x2 - x) * k + Math.sin(i * 5) * d.width * 0.3), Math.round(y + (y2 - y) * k - h), 1, h);
      }
      break;
    }
  }
  ctx.globalAlpha = 1;
}

/** Неровное пятно (детерминированное по seed) */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number) {
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * TAU;
    const k = 0.75 + 0.25 * Math.abs(Math.sin(seed * 0.37 + i * 1.9));
    const px = x + Math.cos(a) * r * k, py = y + Math.sin(a) * r * k * 0.7;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.fill();
}

/** Весь ваш огонь в радиусе (для «Топки»): зоны огня */
export function firesNear(g: Game, x: number, y: number, r: number): WorldObj[] {
  return g.objs.filter((o) => isFire(o) && (r === Infinity || dist2(o.x, o.y, x, y) <= r * r));
}
