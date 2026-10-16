import { TAU, angleTo, dist, dist2 } from '../core/math';
import { C } from '../gfx/palette';
import { walkable } from '../world/tiles';
import type { EBullet, PBullet } from './bullets';
import { distToSegment, moveBody } from './collision';
import { damageEnemy, explode, spawnShot } from './combat';
import type { Enemy } from './enemy';
import type { Game } from './game';
import { addObj, objsOf, type WorldObj } from './objects';
import { isFoe } from './status';
import { finalDamage } from './stats';

// Миньоны и постройки игрока (этап 12б): паучки, карманный рой, перехватчики, дрон рядом с героем,
// вертушки, приманка-копия, сцепной луч, подбираемые обломки и запчасти. Числа задают предметы.

/** Текущий урон выстрела игрока */
export const shotDmg = (g: Game) => finalDamage(g.player.stats);

/** Снаряд игрока из точки, без орбиты, бумеранга и волны */
export function shotFrom(g: Game, x: number, y: number, angle: number, over: Partial<PBullet> = {}): PBullet {
  return spawnShot(g, angle, g.player.stats, { x, y, bx: x, by: y, orbitR: 0, boomerang: false, wave: 0, ...over });
}

/** Ближайший враг (не союзник) к точке */
export function nearestFoe(g: Game, x: number, y: number, r: number, skip?: (e: Enemy) => boolean): Enemy | null {
  let best: Enemy | null = null, bd = r * r;
  for (const e of g.enemies) {
    if (!isFoe(e) || e.toss || (skip && skip(e))) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** Ближайшая вражеская пуля к точке */
export function nearestBullet(g: Game, x: number, y: number, r: number): EBullet | null {
  let best: EBullet | null = null, bd = r * r;
  for (const b of g.ebullets) {
    if (b.dead || b.delay > 0) continue;
    const d = dist2(x, y, b.x, b.y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Погасить вражескую пулю с искрой */
export function killBullet(g: Game, b: EBullet, color: string = C.bone) {
  b.dead = true;
  g.fx.add({ kind: 'dot', x: b.x, y: b.y, vy: -20, color, life: 0.25, glow: true });
}

/** Шаг к точке с учётом стен (наземный миньон) */
function walk(g: Game, o: WorldObj, tx: number, ty: number, speed: number, dt: number, flying: boolean) {
  const a = angleTo(o.x, o.y, tx, ty);
  const s = Math.min(speed * dt, dist(o.x, o.y, tx, ty));
  if (flying) {
    o.x += Math.cos(a) * s;
    o.y += Math.sin(a) * s;
    return;
  }
  const body = { x: o.x, y: o.y, r: 2 };
  moveBody(g.room, body, Math.cos(a) * s, Math.sin(a) * s, (t) => !walkable(t));
  o.x = body.x;
  o.y = body.y;
}

// ---------------------------------------------------------------- паучки

export interface SpiderOpts {
  life: number;
  boomR: number;
  dmg: number;
  speed?: number;
  /** Взрыв паучка (кроме урона): кольцо снарядов, паутина */
  onBoom?(g: Game, x: number, y: number): void;
}

/** Паучок: бежит к ближайшему врагу и взрывается рядом с ним (или когда выйдет время) */
export function spawnSpider(g: Game, x: number, y: number, o: SpiderOpts): WorldObj {
  return addObj(g, {
    kind: 'spider', x, y, r: 3, life: o.life, layer: 'body', data: { o },
    update(g, s, dt) {
      const t = nearestFoe(g, s.x, s.y, 200);
      if (!t) return;
      walk(g, s, t.x, t.y, o.speed ?? 110, dt, false);
      if (dist2(s.x, s.y, t.x, t.y) < (t.r + 4) ** 2) spiderBoom(g, s);
    },
    onExpire: (g, s) => spiderBoom(g, s),
    draw(g, s, ctx, x, y) {
      const leg = Math.floor(g.time * 16 + s.x) % 2;
      ctx.fillStyle = C.void;
      ctx.fillRect(Math.round(x) - 3, Math.round(y) - 2, 7, 4);
      ctx.fillStyle = C.steelL;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 3);
      ctx.fillStyle = Math.floor(g.time * 8) % 2 ? C.red : C.amber;
      ctx.fillRect(Math.round(x), Math.round(y) - 2, 1, 1);
      ctx.fillStyle = C.metal;
      ctx.fillRect(Math.round(x) - 4, Math.round(y) - 1 + leg, 1, 1);
      ctx.fillRect(Math.round(x) + 4, Math.round(y) - leg, 1, 1);
    },
  });
}

function spiderBoom(g: Game, s: WorldObj) {
  if (s.data.boomed) return;
  s.data.boomed = true;
  s.dead = true;
  const o = s.data.o as SpiderOpts;
  explode(g, s.x, s.y, o.boomR, o.dmg);
  o.onBoom?.(g, s.x, s.y);
}

// ---------------------------------------------------------------- карманный рой

export interface BotOpts {
  /** Пуля задела бота: он гасит её и гибнет */
  onBlock?(g: Game, bot: WorldObj, b: EBullet): void;
}

/** Микробот роя: кружит у героя; вражеская пуля, задевшая бота, гаснет вместе с ним */
export function spawnBot(g: Game, o: BotOpts = {}): WorldObj {
  const p = g.player;
  return addObj(g, {
    kind: 'bot', x: p.x, y: p.y, r: 3, layer: 'body', data: { o, ph: Math.random() * TAU },
    update(g, s, dt) {
      const bots = objsOf(g, 'bot');
      const i = bots.indexOf(s), n = Math.max(1, bots.length);
      const a = g.time * 2.6 + (i / n) * TAU;
      const tx = g.player.x + Math.cos(a) * 15, ty = g.player.y - 4 + Math.sin(a) * 10;
      s.x += (tx - s.x) * Math.min(1, dt * 12);
      s.y += (ty - s.y) * Math.min(1, dt * 12);
      for (const b of g.ebullets) {
        if (b.dead || b.delay > 0 || dist2(b.x, b.y, s.x, s.y) > (b.r + s.r) ** 2) continue;
        killBullet(g, b, C.amber);
        s.dead = true;
        g.fx.burst(s.x, s.y, C.amber, 5, 50, 0.25, 1, true);
        o.onBlock?.(g, s, b);
        break;
      }
    },
    draw(g, s, ctx, x, y) {
      ctx.fillStyle = C.void;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 3);
      ctx.fillStyle = C.grey;
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      ctx.fillStyle = Math.floor(g.time * 12 + s.data.ph) % 2 ? C.amber : C.yellow;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    },
  });
}

// ---------------------------------------------------------------- перехватчики

export interface InterceptorOpts {
  life: number;
  /** Радиус поиска вражеских пуль */
  seek: number;
  /** Урон по врагу, если пуль нет */
  dmg: number;
  speed?: number;
  /** Погасил пулю */
  onErase?(g: Game, x: number, y: number): void;
}

/** Перехватчик: летит к ближайшей вражеской пуле и гасит её; пуль нет — бьёт ближайшего врага */
export function spawnInterceptor(g: Game, x: number, y: number, o: InterceptorOpts): WorldObj {
  return addObj(g, {
    kind: 'interceptor', x, y, r: 2, life: o.life, layer: 'air', data: { o, a: g.player.aimAngle },
    update(g, s, dt) {
      const sp = o.speed ?? 240;
      const b = nearestBullet(g, s.x, s.y, o.seek);
      if (b) {
        s.data.a = angleTo(s.x, s.y, b.x, b.y);
        s.x += Math.cos(s.data.a) * sp * dt;
        s.y += Math.sin(s.data.a) * sp * dt;
        if (dist2(s.x, s.y, b.x, b.y) < (b.r + 3) ** 2) {
          killBullet(g, b, C.yellow);
          s.dead = true;
          o.onErase?.(g, s.x, s.y);
        }
        return;
      }
      const e = nearestFoe(g, s.x, s.y, 220);
      if (!e) {
        // ждёт у героя
        walk(g, s, g.player.x, g.player.y - 8, sp * 0.5, dt, true);
        return;
      }
      s.data.a = angleTo(s.x, s.y, e.x, e.y);
      s.x += Math.cos(s.data.a) * sp * dt;
      s.y += Math.sin(s.data.a) * sp * dt;
      if (dist2(s.x, s.y, e.x, e.y) < (e.r + 2) ** 2) {
        damageEnemy(g, e, o.dmg, s.x, s.y, { source: 'other', silent: true, tag: 'interceptor' });
        g.fx.burst(s.x, s.y, C.yellow, 4, 50, 0.2, 1, true);
        s.dead = true;
      }
    },
    draw(g, s, ctx, x, y) {
      ctx.strokeStyle = C.yellow;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(s.data.a) * 3, y - Math.sin(s.data.a) * 3);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = C.bone;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    },
  });
}

// ---------------------------------------------------------------- спутник героя (дрон-корректировщик)

/** Дрон, держащийся у плеча героя; поведение (отметки) задаёт предмет */
export function spawnFollower(g: Game, kind: string, dx: number, dy: number, color: string = C.yellow): WorldObj {
  const p = g.player;
  return addObj(g, {
    kind, x: p.x + dx, y: p.y + dy, r: 3, layer: 'air', data: { dx, dy, color },
    update(g, s, dt) {
      const k = Math.min(1, dt * 6);
      s.x += (g.player.x + s.data.dx - s.x) * k;
      s.y += (g.player.y + s.data.dy + Math.sin(g.time * 3) * 2 - s.y) * k;
    },
    draw(g, s, ctx, x, y) {
      ctx.fillStyle = C.void;
      ctx.fillRect(Math.round(x) - 3, Math.round(y) - 2, 7, 4);
      ctx.fillStyle = C.steel;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 5, 2);
      ctx.fillStyle = Math.floor(g.time * 4) % 2 ? s.data.color : C.amberD;
      ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 1);
      ctx.fillStyle = C.steelL;
      const w = Math.floor(g.time * 30) % 2 ? 3 : 2;
      ctx.fillRect(Math.round(x) - w - 1, Math.round(y) - 3, w, 1);
      ctx.fillRect(Math.round(x) + 2, Math.round(y) - 3, w, 1);
    },
  });
}

// ---------------------------------------------------------------- вертушки

export interface SpinnerOpts {
  life: number;
  /** Пауза между струями (с) */
  period: number;
  /** Урон снаряда струи */
  dmg: number;
  /** Струи смотрят в сторону прицела героя («Огневая точка») */
  aimed?: boolean;
  /** Режим часового: бьёт врагов в этом радиусе */
  sentry?: number;
  room?: number;
}

/** Вертушка: стоит на полу и крутит две встречные струи ваших снарядов */
export function spawnSpinner(g: Game, x: number, y: number, o: SpinnerOpts): WorldObj {
  return addObj(g, {
    kind: 'spinner', x, y, r: 5, life: o.life, layer: 'body', room: o.room, data: { o, a: Math.random() * TAU, cd: 0 },
    update(g, s, dt) {
      const d = s.data;
      d.a += dt * 4;
      d.cd -= dt;
      if (d.cd > 0) return;
      d.cd = d.o.period;
      const over = { dmg: d.o.dmg, r: 1.8, split: 0, explode: 0, homing: 0, tag: 'spinner' };
      if (d.o.sentry) {
        const t = nearestFoe(g, s.x, s.y, d.o.sentry);
        if (!t) return;
        const a = angleTo(s.x, s.y, t.x, t.y);
        shotFrom(g, s.x, s.y - 3, a, over);
        return;
      }
      if (d.o.aimed) {
        const a = g.player.aimAngle;
        shotFrom(g, s.x, s.y - 3, a + Math.sin(d.a) * 0.3, over);
        shotFrom(g, s.x, s.y - 3, a - Math.sin(d.a) * 0.3, over);
        return;
      }
      // две струи крутятся в разные стороны
      shotFrom(g, s.x, s.y - 3, d.a, over);
      shotFrom(g, s.x, s.y - 3, -d.a + Math.PI, over);
    },
    draw(g, s, ctx, x, y) {
      const a = s.data.a;
      ctx.fillStyle = C.void;
      ctx.fillRect(Math.round(x) - 3, Math.round(y) - 1, 7, 3);
      ctx.fillStyle = C.steel;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 4, 5, 4);
      ctx.strokeStyle = s.data.o.sentry ? C.red : C.amber;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * 5, y - 3 - Math.sin(a) * 2);
      ctx.lineTo(x + Math.cos(a) * 5, y - 3 + Math.sin(a) * 2);
      ctx.stroke();
      if (s.life !== Infinity && s.life - s.t < 0.5 && Math.floor(g.time * 16) % 2) {
        ctx.fillStyle = C.redL;
        ctx.fillRect(Math.round(x), Math.round(y) - 5, 1, 1);
      }
    },
  });
}

// ---------------------------------------------------------------- приманка-копия

export interface DecoyOpts {
  life: number;
  /** Вражеская пуля попала в копию (пуля гаснет) */
  onBullet?(g: Game, b: EBullet): void;
  onEnd?(g: Game, x: number, y: number): void;
}

/** Копия героя: враги целятся в неё (Game.setAim), пули о неё гаснут */
export function spawnDecoy(g: Game, x: number, y: number, o: DecoyOpts): WorldObj {
  return addObj(g, {
    kind: 'decoy', x, y, r: 4, life: o.life, layer: 'body', data: { o },
    update(g, s) {
      for (const b of g.ebullets) {
        if (b.dead || b.delay > 0 || dist2(b.x, b.y, s.x, s.y) > (b.r + s.r) ** 2) continue;
        killBullet(g, b, C.violet);
        o.onBullet?.(g, b);
      }
    },
    onExpire(g, s) {
      g.fx.burst(s.x, s.y, C.violet, 8, 50, 0.3, 1, true);
      o.onEnd?.(g, s.x, s.y);
    },
    draw(g, s, ctx, x, y) {
      // вид героя в момент появления копии (берётся при первой отрисовке)
      const spr = (s.data.sprite ??= g.player.sprite) as HTMLCanvasElement;
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(g.time * 20);
      ctx.drawImage(spr, Math.round(x - spr.width / 2) + (Math.floor(g.time * 20) % 3 === 0 ? 1 : 0), Math.round(y + 3 - spr.height));
      ctx.globalAlpha = 1;
    },
  });
}

/** Приманка рядом с врагом (в радиусе r) — враг целится в неё */
export function decoyFor(g: Game, x: number, y: number, r: number): WorldObj | null {
  for (const o of g.objs) if (!o.dead && o.kind === 'decoy' && dist2(o.x, o.y, x, y) < r * r) return o;
  return null;
}

// ---------------------------------------------------------------- сцепной луч

export interface TetherOpts {
  life: number;
  /** Урон врагам, пересекающим луч, в секунду */
  dps: number;
  /** Длиннее этого луч рвётся */
  maxLen?: number;
}

/** Сцепить двух врагов (или врага и союзника) сварочным лучом: гасит пули и жжёт всех на пересечении */
export function tether(g: Game, a: Enemy, b: Enemy, o: TetherOpts): WorldObj {
  return addObj(g, {
    kind: 'tether', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: 2, life: o.life, layer: 'air', data: { a, b, o, cd: 0 },
    update(g, s, dt) {
      const { a, b } = s.data as { a: Enemy; b: Enemy };
      if (a.dead || b.dead || dist(a.x, a.y, b.x, b.y) > (o.maxLen ?? 240)) {
        s.dead = true;
        return;
      }
      s.x = (a.x + b.x) / 2;
      s.y = (a.y + b.y) / 2;
      s.r = dist(a.x, a.y, b.x, b.y) / 2;
      let any = false;
      for (const eb of g.ebullets) {
        if (eb.dead || distToSegment(eb.x, eb.y, a.x, a.y, b.x, b.y) > eb.r + 1.5) continue;
        killBullet(g, eb, C.yellow);
        any = true;
      }
      if (any) g.ebullets = g.ebullets.filter((x) => !x.dead);
      s.data.cd -= dt;
      if (s.data.cd > 0) return;
      s.data.cd = 0.2;
      for (const e of g.enemies) {
        if (e === a || e === b || !isFoe(e)) continue;
        if (distToSegment(e.x, e.y, a.x, a.y, b.x, b.y) > e.r + 2) continue;
        damageEnemy(g, e, o.dps * 0.2, e.x, e.y - 1, { source: 'other', silent: true, tag: 'tether' });
        g.fx.add({ kind: 'spark', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 60, vy: -40, color: C.yellow, life: 0.2, glow: true });
      }
    },
    draw(g, s, ctx) {
      const { a, b } = s.data as { a: Enemy; b: Enemy };
      const cx = g.camX, cy = g.camY;
      ctx.strokeStyle = Math.floor(g.time * 24) % 2 ? C.yellow : C.bone;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 3;
        const x = a.x + (b.x - a.x) * k - cx + j, y = a.y + (b.y - a.y) * k - cy + j;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
  });
}

/** Враг сейчас в сцепке */
export function isTethered(g: Game, e: Enemy): boolean {
  return g.objs.some((o) => !o.dead && o.kind === 'tether' && (o.data.a === e || o.data.b === e));
}

// ---------------------------------------------------------------- обломки и запчасти

/**
 * Подбираемая мелочь (обломок для короба, запчасть «Перебора»): лежит life секунд, игрок берёт
 * касанием; pick(by) — кто взял: игрок или союзник
 */
export function spawnScrap(g: Game, type: string, x: number, y: number, life: number, color: string, pick: (g: Game, by: 'player' | Enemy) => void): WorldObj {
  const a = Math.random() * TAU;
  return addObj(g, {
    kind: 'scrap', x, y, r: 3, life, layer: 'body', data: { type, color, pick, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50 },
    update(g, s, dt) {
      const d = s.data;
      if (d.vx || d.vy) {
        const body = { x: s.x, y: s.y, r: 2 };
        moveBody(g.room, body, d.vx * dt, d.vy * dt, (t) => !walkable(t));
        s.x = body.x;
        s.y = body.y;
        d.vx *= Math.max(0, 1 - dt * 5);
        d.vy *= Math.max(0, 1 - dt * 5);
        if (Math.abs(d.vx) < 2 && Math.abs(d.vy) < 2) d.vx = d.vy = 0;
      }
      if (dist2(s.x, s.y, g.player.x, g.player.y) < 11 * 11) pickScrap(g, s, 'player');
    },
    draw(g, s, ctx, x, y) {
      if (s.life - s.t < 1.2 && Math.floor(g.time * 10) % 2) return;
      ctx.fillStyle = C.void;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 5, 3);
      ctx.fillStyle = s.data.color;
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 2);
      ctx.fillStyle = C.bone;
      ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 1);
    },
  });
}

export function pickScrap(g: Game, s: WorldObj, by: 'player' | Enemy) {
  if (s.dead) return;
  s.dead = true;
  g.fx.burst(s.x, s.y, s.data.color, 4, 40, 0.25, 1, true);
  s.data.pick(g, by);
}

/** Подобрать всю мелочь типа type в радиусе r от точки (рывок «Жора», союзник «Мастерской») */
export function collectScraps(g: Game, type: string, x: number, y: number, r: number, by: 'player' | Enemy = 'player'): number {
  let n = 0;
  for (const s of g.objs) {
    if (s.dead || s.kind !== 'scrap' || s.data.type !== type || dist2(s.x, s.y, x, y) > r * r) continue;
    pickScrap(g, s, by);
    n++;
  }
  return n;
}

