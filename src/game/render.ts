import { TILE, VIEW_H, VIEW_W } from '../config';
import { TAU } from '../core/math';
import { icon } from '../gfx/icons';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import { canvas, ctx2d, flipH, silhouette, softCircle, type Sprite } from '../gfx/sprite';
import { SPR, flashOf } from '../gfx/sprites';
import { cutOf, envLayout, glowOf, lightLevel, lightValid, renderAmbient, signalPhase, transitSweep, vignetteOf, type Light } from '../gfx/env';
import type { FloorTheme } from '../content/floors';
import type { LevelMap } from '../world/level';
import type { LevelDoor } from '../world/levelgen';
import type { Role } from '../world/roles';
import { T } from '../world/tiles';
import { renderEBullets, renderPBullets } from './bullets';
import { raycast } from './collision';
import type { Enemy } from './enemy';
import type { Game } from './game';
import { item, type Gauge } from './items';
import { renderObjs } from './objects';
import { STACK_COLOR, STACK_LIT, tossHeight } from './status';

const QUALITY_COLOR = ['', C.grey, C.amber, C.red, C.violet];
export const qualityColor = (q: number) => QUALITY_COLOR[q];

/** Цвет метки роли комнаты: рамка двери и метка на мини-карте */
export const ROLE_MARK: Partial<Record<Role, string>> = {
  exit: C.red, miniboss: C.redD, cache: C.yellow, market: C.amber, surgery: C.violet, shaft: C.steelL,
};

let lightCanvas: HTMLCanvasElement | null = null;
let lightSprite: Sprite | null = null;
const glowCache = new Map<string, Sprite>();
function glowSprite(rgb: string): Sprite {
  let s = glowCache.get(rgb);
  if (!s) {
    s = softCircle(64, rgb);
    glowCache.set(rgb, s);
  }
  return s;
}
const flipped = new WeakMap<Sprite, Sprite>();

function flipOf(s: Sprite): Sprite {
  let f = flipped.get(s);
  if (!f) {
    f = flipH(s);
    flipped.set(s, f);
  }
  return f;
}

/**
 * Источники света комнаты: лампы на стенах (ровно там, где их рисует roomrender), потолочные пятна
 * и светящиеся элементы яруса. Раскладка общая — src/gfx/env/layout.ts, кэшируется по комнате.
 */
function lamps(room: LevelMap, theme: FloorTheme): Light[] {
  return envLayout(room, theme).lights;
}

export function renderGame(g: Game, r: Renderer) {
  const ctx = r.ctx;
  const cx = Math.round(g.camX), cy = Math.round(g.camY);
  const room = g.room;

  // 1. статичный слой уровня (видимые куски); в остаток кадра — постройка следующих кусков
  g.gfx.draw(ctx, cx, cy, VIEW_W, VIEW_H);
  g.gfx.prerender(2);

  // 2. анимированные детали окружения (электропол, капли, искры, огоньки)
  renderAmbient(g, ctx, cx, cy);

  // 3. двери
  for (const d of room.doors) renderDoor(g, ctx, d, cx, cy);

  // 3б. объекты игрока на полу (лужи, огонь, паутина)
  renderObjs(g, ctx, cx, cy, 'floor');

  // 4. предметы на полу и объекты игрока среди существ (вертушки, паучки, обломки)
  renderPickups(g, ctx, cx, cy);
  renderObjs(g, ctx, cx, cy, 'body');

  // 5. существа, отсортированные по глубине
  const actors: (Enemy | 'player')[] = [...g.enemies, 'player'];
  actors.sort((a, b) => (a === 'player' ? g.player.y : a.y) - (b === 'player' ? g.player.y : b.y));
  for (const a of actors) {
    if (a === 'player') renderPlayer(g, ctx, cx, cy);
    else renderEnemy(g, ctx, a, cx, cy);
  }

  g.fx.render(ctx, cx, cy, false);

  // 6. освещение
  renderLighting(g, ctx, cx, cy);

  // 7. то, что всегда видно поверх темноты: лучи прицела, снаряды, светящиеся эффекты
  for (const e of g.enemies) {
    if (e.mem.laser === undefined) continue;
    const len = raycast(room, e.x, e.y, e.mem.laser, 600);
    ctx.strokeStyle = C.red;
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(g.time * 30);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(e.x - cx, e.y - cy);
    ctx.lineTo(e.x - cx + Math.cos(e.mem.laser) * len, e.y - cy + Math.sin(e.mem.laser) * len);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  renderPBullets(g, ctx, cx, cy);
  // объекты поверх темноты: сцепной луч, перехватчики, дрон у плеча
  renderObjs(g, ctx, cx, cy, 'air');
  // сварочные стенки (левая рука)
  for (const w of g.barriers) {
    ctx.strokeStyle = Math.floor(g.time * 20) % 2 ? C.amber : C.yellow;
    ctx.globalAlpha = Math.min(1, w.t * 2);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w.x1 - cx, w.y1 - cy);
    ctx.lineTo(w.x2 - cx, w.y2 - cy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }
  // поднятый щит левой руки
  if (g.player.shieldUp > 0) {
    const p = g.player, a = p.aimAngle;
    ctx.strokeStyle = C.amber;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x - cx, p.y - 3 - cy, 14, a - 1.1, a + 1.1);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }
  ctx.globalCompositeOperation = 'lighter';
  g.fx.render(ctx, cx, cy, true);
  ctx.globalCompositeOperation = 'source-over';
  renderEBullets(g, ctx, cx, cy);

  // хитбокс в режиме фокуса (как в Touhou)
  const p = g.player;
  if (p.focus && g.state === 'play') {
    const px = Math.round(p.x - cx), py = Math.round(p.y - cy);
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px + 0.5, py + 0.5, 6 + Math.sin(g.time * 8), 0, TAU);
    ctx.stroke();
    ctx.fillStyle = C.void;
    ctx.fillRect(px - 2, py - 2, 5, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 1, py - 1, 3, 3);
  }

  // заряд оружия
  let barY = 6;
  if (p.charge > 0) {
    const w = p.gun.weapon!;
    const k = Math.min(1, p.charge / ((w.chargeTime ?? 1) / p.stats.fireRateMult));
    ctx.fillStyle = C.void;
    ctx.fillRect(Math.round(p.x - cx - 8), Math.round(p.y - cy + barY), 16, 3);
    ctx.fillStyle = k >= 1 ? C.yellow : C.amber;
    ctx.fillRect(Math.round(p.x - cx - 7), Math.round(p.y - cy + barY + 1), Math.round(14 * k), 1);
    barY += 3;
  }
  if (g.state === 'play') renderGauges(g, ctx, Math.round(p.x - cx), Math.round(p.y - cy), barY);

  // затемнение при переходах и смерти
  if (g.fade < 1) {
    ctx.fillStyle = C.void;
    ctx.globalAlpha = 1 - g.fade;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  }
  if (g.state === 'dying' || g.state === 'dead') {
    ctx.fillStyle = C.blood;
    ctx.globalAlpha = Math.min(0.6, g.stateT * 0.4);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  }
}

function renderLighting(g: Game, ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  if (!lightCanvas) {
    lightCanvas = canvas(VIEW_W, VIEW_H);
    lightSprite = cutOf();
  }
  const th = g.theme, room = g.room, t = g.time;
  const lc = ctx2d(lightCanvas);
  const ls = lightSprite!;
  const list = lamps(room, th);
  const inView = (x: number, y: number, rad: number) =>
    !(x + rad < cx || y + rad < cy || x - rad > cx + VIEW_W || y - rad > cy + VIEW_H);

  // слой темноты с оттенком яруса и виньеткой
  lc.globalCompositeOperation = 'source-over';
  lc.globalAlpha = 1;
  lc.clearRect(0, 0, VIEW_W, VIEW_H);
  lc.fillStyle = `rgba(${th.shade},${th.dark})`;
  lc.fillRect(0, 0, VIEW_W, VIEW_H);
  lc.drawImage(vignetteOf(th.shade), 0, 0);
  lc.globalCompositeOperation = 'destination-out';
  const light = (x: number, y: number, rad: number, a = 1) => {
    if (a <= 0.01 || !inView(x, y, rad)) return;
    lc.globalAlpha = Math.min(1, a);
    lc.drawImage(ls, x - cx - rad, y - cy - rad, rad * 2, rad * 2);
  };
  // огонь и вспышки объектов игрока
  for (const o of g.objs) if (o.light && !o.dead) light(o.x, o.y, o.light, 0.55 + Math.sin(t * 13 + o.x) * 0.08);
  const p = g.player;
  light(p.x, p.y - 4, 118 + Math.sin(t * 3) * 3, 0.95);
  for (const l of list) {
    if (!lightValid(l, room)) continue;
    light(l.x, l.y, l.r, l.a * lightLevel(l, t));
  }
  // электропол светится, когда бьёт током
  const L = envLayout(room, th);
  const zap = g.electroActive, warn = g.electroWarning && Math.sin(t * 30) > 0;
  if (zap || warn) {
    for (const i of L.electro) {
      const x = (i % room.tw) * TILE + 8, y = ((i / room.tw) | 0) * TILE + 8;
      light(x, y, zap ? 30 : 18, zap ? 0.55 + Math.random() * 0.2 : 0.3);
    }
  }
  // Магистрали: по путям изредка проходит огонь состава
  const sweep = transitSweep(g);
  if (sweep) for (const s of sweep) light(s.x, s.y, 46, 0.5);
  for (const f of g.lightFlashes) light(f.x, f.y, f.r, Math.min(1, f.t * 6));
  for (const k of g.pickups) {
    if (k.kind === 'item' || k.kind === 'teleporter') light(k.x, k.y, 40, 0.7);
    else if (k.kind === 'terminal') light(k.x, k.y - 8, 26, 0.6);
  }
  for (const e of g.enemies) {
    if (e.def.boss) light(e.x, e.y, 80, 0.6);
    else if (e.stacks.size) for (const k of e.stacks.keys()) if (STACK_LIT.has(k)) light(e.x, e.y, 26, 0.75);
  }
  lc.globalAlpha = 1;
  lc.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightCanvas, 0, 0);

  // цветное свечение источников
  ctx.globalCompositeOperation = 'lighter';
  const pool = glowSprite(th.lamp);
  for (const l of list) {
    if (!inView(l.x, l.y, l.r) || !lightValid(l, room)) continue;
    const k = lightLevel(l, t);
    if (k <= 0.01) continue;
    const x = l.x - cx, y = l.y - cy;
    switch (l.kind) {
      case 'lamp':
        // широкое тёплое пятно, плотная середина и яркая точка у плафона
        ctx.globalAlpha = 0.07 * k;
        ctx.drawImage(glowOf(l.rgb), x - l.r, y - l.r * 0.8, l.r * 2, l.r * 1.8);
        ctx.globalAlpha = 0.16 * k;
        ctx.drawImage(glowOf(l.rgb), x - l.r * 0.5, y - l.r * 0.4, l.r, l.r);
        ctx.globalAlpha = 0.4 * k;
        ctx.drawImage(glowOf(l.rgb), x - 7, y - 10, 14, 14);
        break;
      case 'pool':
        ctx.globalAlpha = 0.05 * k;
        ctx.drawImage(pool, x - l.r * 0.7, y - l.r * 0.6, l.r * 1.4, l.r * 1.2);
        break;
      case 'signal': {
        const rgb = signalPhase(l.blink, t) === 0 ? l.rgb : l.rgb2 ?? l.rgb;
        ctx.globalAlpha = 0.22;
        ctx.drawImage(glowOf(rgb), x - l.r * 0.6, y - l.r * 0.6, l.r * 1.2, l.r * 1.2);
        break;
      }
      default: {
        const a = l.kind === 'heat' ? 0.2 : l.kind === 'sign' ? 0.2 : 0.16;
        ctx.globalAlpha = a * k;
        ctx.drawImage(glowOf(l.rgb), x - l.r * 0.6, y - l.r * 0.6, l.r * 1.2, l.r * 1.2);
      }
    }
  }
  if (zap) {
    const yel = glowOf('255,204,51');
    for (const i of L.electro) {
      const x = (i % room.tw) * TILE + 8 - cx, y = ((i / room.tw) | 0) * TILE + 8 - cy;
      if (x < -24 || y < -24 || x > VIEW_W + 24 || y > VIEW_H + 24) continue;
      ctx.globalAlpha = 0.11 + Math.random() * 0.06;
      ctx.drawImage(yel, x - 16, y - 16, 32, 32);
    }
  }
  if (sweep) {
    const gl = glowOf(th.glow);
    for (const s of sweep) {
      ctx.globalAlpha = 0.12;
      ctx.drawImage(gl, s.x - cx - 30, s.y - cy - 18, 60, 36);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Проём двери: столбы цвета комнаты; закрытая дверь — створки (с замком у гермодвери петли) */
function renderDoor(g: Game, ctx: CanvasRenderingContext2D, d: LevelDoor, cx: number, cy: number) {
  const horiz = d.dir === 'n' || d.dir === 's';
  const x = (horiz ? d.tx - 1 : d.tx) * TILE - cx, y = (horiz ? d.ty : d.ty - 1) * TILE - cy;
  const w = horiz ? TILE * 3 : TILE, h = horiz ? TILE : TILE * 3;
  if (x + w < -4 || y + h < -4 || x > VIEW_W + 4 || y > VIEW_H + 4) return;
  const accent = d.gate ? C.yellow : ROLE_MARK[g.plan.rooms[d.room].role] ?? g.theme.wallTop;
  const closed = g.room.get(d.tx, d.ty) === T.Door;
  // столбы
  ctx.fillStyle = accent;
  if (horiz) {
    ctx.fillRect(x - 2, y, 2, h);
    ctx.fillRect(x + w, y, 2, h);
  } else {
    ctx.fillRect(x, y - 2, w, 2);
    ctx.fillRect(x, y + h, w, 2);
  }
  if (!closed) return;
  // створки
  ctx.fillStyle = C.steel;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.metal;
  if (horiz) for (let i = 2; i < w; i += 4) ctx.fillRect(x + i, y + 2, 1, h - 4);
  else for (let i = 2; i < h; i += 4) ctx.fillRect(x + 2, y + i, w - 4, 1);
  ctx.fillStyle = C.void;
  if (horiz) ctx.fillRect(x + w / 2, y, 1, h);
  else ctx.fillRect(x, y + h / 2, w, 1);
  if (d.locked) {
    // гермодверь петли: жёлто-чёрные полосы и замок
    ctx.fillStyle = C.yellow;
    if (horiz) for (let i = 1; i < w; i += 6) ctx.fillRect(x + i, y + 1, 3, 2);
    else for (let i = 1; i < h; i += 6) ctx.fillRect(x + 1, y + i, 2, 3);
    const lx = x + w / 2 - 3, ly = y + h / 2 - 3;
    ctx.fillStyle = C.void;
    ctx.fillRect(lx - 1, ly - 1, 8, 8);
    ctx.fillStyle = C.yellow;
    ctx.fillRect(lx, ly + 2, 6, 4);
    ctx.fillRect(lx + 1, ly, 1, 2);
    ctx.fillRect(lx + 4, ly, 1, 2);
    ctx.fillRect(lx + 1, ly - 1, 4, 1);
  } else {
    ctx.fillStyle = Math.sin(g.time * 6) > 0 ? C.red : C.redD;
    ctx.fillRect(x + w / 2 - 1, y + h / 2 - 1, 2, 2);
  }
}

function renderPickups(g: Game, ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  for (const k of g.pickups) {
    const x = Math.round(k.x - cx), y = Math.round(k.y - cy);
    if (x < -30 || y < -30 || x > VIEW_W + 30 || y > VIEW_H + 30) continue;
    const bob = Math.round(Math.sin(k.t * 3) * 1.5);
    const sh = SPR.shadow;
    switch (k.kind) {
      case 'item': {
        const it = item(k.itemId!);
        ctx.drawImage(SPR.pedestal, x - 7, y - 2);
        // мягкое свечение по редкости
        ctx.fillStyle = qualityColor(it.quality);
        ctx.globalAlpha = 0.18 + 0.08 * Math.sin(k.t * 4);
        ctx.beginPath();
        ctx.arc(x, y - 10 + bob, 9, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.drawImage(icon(it.icon), x - 6, y - 16 + bob - 2);
        break;
      }
      case 'teleporter': {
        const fr = SPR.teleporter[Math.floor(g.time * 8) % 4];
        ctx.drawImage(fr, x - 12, y - 8);
        break;
      }
      case 'terminal': {
        // терминал петли: пульт с экраном (мигает, пока не взломан)
        ctx.drawImage(sh, x - 6, y + 2, 12, 3);
        ctx.fillStyle = C.black;
        ctx.fillRect(x - 6, y - 13, 12, 16);
        ctx.fillStyle = C.metal;
        ctx.fillRect(x - 5, y - 12, 10, 14);
        ctx.fillStyle = C.void;
        ctx.fillRect(x - 4, y - 11, 8, 6);
        ctx.fillStyle = k.done ? C.violet : Math.floor(g.time * 3) % 2 ? C.yellow : C.amber;
        ctx.fillRect(x - 3, y - 10, 6, 1);
        ctx.fillRect(x - 3, y - 8, 4, 1);
        ctx.fillStyle = C.steelL;
        for (let i = 0; i < 3; i++) ctx.fillRect(x - 4 + i * 3, y - 2, 2, 1);
        break;
      }
      case 'surgery': {
        const s = SPR.surgery[Math.floor(g.time * 3) % 2];
        ctx.drawImage(sh, x - 10, y + 14, 20, 4);
        ctx.drawImage(s, x - Math.floor(s.width / 2), y - s.height + 18);
        break;
      }
      case 'coin': {
        ctx.drawImage(sh, x - 3, y + 1, 6, 2);
        const fr = SPR.coin[Math.floor(k.t * 8) % 4];
        ctx.drawImage(fr, x - Math.floor(fr.width / 2), y - 4 + bob);
        break;
      }
      default: {
        const s = k.kind === 'medkit' ? SPR.medkit : SPR.glitchCell;
        ctx.drawImage(sh, x - 5, y + 2);
        ctx.drawImage(s, x - Math.floor(s.width / 2), y - s.height + 3 + bob);
      }
    }
  }
}

function renderPlayer(g: Game, ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const p = g.player;
  if (g.state === 'dying' || g.state === 'dead') return;
  const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
  ctx.drawImage(SPR.shadow, x - 5, y + 2);
  if (p.invuln > 0 && p.dashT <= 0 && p.glitchT <= 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
  const s = p.sprite;
  const sx = x - Math.floor(s.width / 2), sy = y + 3 - s.height - Math.round(p.dashHeight);
  if (p.glitchT > 0) renderGlitched(g, ctx, s, sx, sy, x, y);
  else ctx.drawImage(p.pendingHit > 0 && Math.floor(g.time * 40) % 2 ? flashOf(s) : s, sx, sy);
  if (p.pendingHit > 0) {
    // аварийное окно: красная вспышка вокруг — жми F
    ctx.strokeStyle = C.redL;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(x + 0.5, y - 5, 9 + (1 - p.pendingHit / 0.15) * 6, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (p.shieldLeft > 0) {
    ctx.strokeStyle = C.amber;
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(g.time * 6);
    ctx.beginPath();
    ctx.arc(x + 0.5, y - 5, 11, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < Math.round(p.stats.drones); i++) {
    const d = g.dronePos(i);
    const dx = Math.round(d.x - cx), dy = Math.round(d.y - cy);
    ctx.fillStyle = C.void;
    ctx.fillRect(dx - 2, dy - 2, 5, 4);
    ctx.fillStyle = C.steelL;
    ctx.fillRect(dx - 1, dy - 1, 3, 2);
    ctx.fillStyle = C.amber;
    ctx.fillRect(dx, dy, 1, 1);
  }
  if (p.holdItem) {
    // предмет над головой (как в Isaac)
    const k = 1 - Math.max(0, p.holdT - 0.6) / 0.3;
    ctx.drawImage(icon(p.holdItem.icon), x - 6, y - 28 - Math.round(k * 3));
  }
}

/**
 * Сбой: пиксельный «глитч» героя — полосы спрайта сдвигаются, рядом фиолетовая и красная
 * копии со смещением, вокруг тонкий контур радиуса переписывания пуль
 */
function renderGlitched(g: Game, ctx: CanvasRenderingContext2D, s: Sprite, sx: number, sy: number, x: number, y: number) {
  const p = g.player;
  const step = Math.floor(g.time * 20);
  const rnd = (k: number) => {
    const v = Math.sin(step * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  ctx.globalAlpha = 0.45;
  ctx.drawImage(tintOf(s, C.violet), sx - 2 - Math.round(rnd(1) * 2), sy);
  ctx.drawImage(tintOf(s, C.red), sx + 2 + Math.round(rnd(2) * 2), sy);
  ctx.globalAlpha = 1;
  const bands = 4, bh = Math.ceil(s.height / bands);
  for (let i = 0; i < bands; i++) {
    const off = rnd(i + 3) < 0.4 ? Math.round((rnd(i + 7) - 0.5) * 6) : 0;
    const h = Math.min(bh, s.height - i * bh);
    if (h > 0) ctx.drawImage(s, 0, i * bh, s.width, h, sx + off, sy + i * bh, s.width, h);
  }
  ctx.strokeStyle = C.violet;
  ctx.globalAlpha = 0.25 + 0.15 * rnd(9);
  ctx.beginPath();
  ctx.arc(x + 0.5, y - 3, p.stats.glitchRadius, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Силуэт спрайта цветом (кэш по цвету) */
const tintCache = new Map<string, WeakMap<Sprite, Sprite>>();
function tintOf(s: Sprite, color: string): Sprite {
  let m = tintCache.get(color);
  if (!m) tintCache.set(color, (m = new WeakMap()));
  let t = m.get(s);
  if (!t) m.set(s, (t = silhouette(s, color)));
  return t;
}

const same = (s: Sprite) => s;

function renderEnemy(g: Game, ctx: CanvasRenderingContext2D, e: Enemy, cx: number, cy: number) {
  if (e.hidden) return;
  const frames = e.frames;
  let fi = 0;
  // боссы и летающие анимируются по времени: часть их фаз двигает их напрямую, без e.anim
  if (frames.length > 2 && (e.def.boss || e.def.flying)) fi = 1 + (Math.floor(g.time * 8 + e.id) % (frames.length - 1));
  else if (frames.length > 2) fi = e.anim > 0 ? 1 + (Math.floor(e.anim) % (frames.length - 1)) : 0;
  else if (frames.length === 2) fi = Math.floor(e.anim + g.time * 2) % 2;
  let s = frames[fi];
  if (e.facing < 0) s = flipOf(s);
  const flying = !!e.def.flying;
  // летающие слегка покачиваются, тень у них ниже
  const h = (e.mem.h ?? 0) + Math.round(tossHeight(e)) + (flying ? 3 + Math.round(Math.sin(g.time * 3 + e.id) * 1) : 0);
  const x = Math.round(e.x - cx - s.width / 2);
  const y = Math.round(e.y - cy - s.height / 2 - h);
  const sw = Math.max(8, Math.round(s.width * 0.6)), shH = Math.max(3, Math.round(sw / 3));
  ctx.drawImage(SPR.shadow, Math.round(e.x - cx - sw / 2), Math.round(e.y - cy + s.height / 2 - shH + (flying ? 2 : 0)), sw, shH);
  if (e.spawn > 0) {
    // появление: вертикальный луч телепортации
    const k = 1 - e.spawn / 0.6;
    ctx.fillStyle = C.redD;
    ctx.globalAlpha = 0.5 * (1 - Math.max(0, k));
    ctx.fillRect(Math.round(e.x - cx) - 2, 0, 4, Math.round(e.y - cy));
    ctx.globalAlpha = Math.max(0, Math.min(1, k));
    if (e.def.draw) e.def.draw(e, g, ctx, x, y, same);
    else ctx.drawImage(s, x, y);
    ctx.globalAlpha = 1;
    return;
  }
  // союзник: кольцо под ногами (янтарное — вызванный, фиолетовое — сорванный с поводка)
  if (e.team === 'ally') {
    ctx.strokeStyle = e.summon ? C.amber : C.violet;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(Math.round(e.x - cx) + 0.5, Math.round(e.y - cy + s.height / 2 - 1), e.r + 2, (e.r + 2) * 0.45, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (e.def.draw) e.def.draw(e, g, ctx, x, y, e.flash > 0 ? flashOf : same);
  else ctx.drawImage(e.flash > 0 ? flashOf(s) : s, x, y);
  if (e.mem.invuln > 0 && Math.floor(g.time * 20) % 2 === 0) {
    ctx.globalAlpha = 0.5;
    if (e.def.draw) e.def.draw(e, g, ctx, x, y, flashOf);
    else ctx.drawImage(flashOf(s), x, y);
    ctx.globalAlpha = 1;
  }
  // луч лечения ремонтного дрона
  const ht = e.mem.healTarget as Enemy | undefined;
  if (ht && !ht.dead && Math.hypot(ht.x - e.x, ht.y - e.y) < 60) {
    ctx.strokeStyle = C.amber;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(e.x - cx, e.y - cy);
    ctx.lineTo(ht.x - cx, ht.y - cy);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // полоска здоровья у раненых обычных врагов
  if (!e.def.boss && e.hp < e.maxHp) {
    const bw = Math.max(8, e.r * 2);
    const bx = Math.round(e.x - cx - bw / 2), by = y - 3;
    ctx.fillStyle = C.void;
    ctx.fillRect(bx, by, bw, 2);
    ctx.fillStyle = e.team === 'ally' ? (e.summon ? C.amber : C.violet) : e.burnT > 0 ? C.amber : C.red;
    ctx.fillRect(bx, by, Math.max(1, Math.round((bw * e.hp) / e.maxHp)), 2);
  }
  // стаки предметов огоньками над врагом (насечки, блохи, отметки…)
  if (e.stacks.size) {
    let row = 0;
    for (const [k, st] of e.stacks) {
      const col = STACK_COLOR.get(k);
      if (!col || st.n <= 0) continue;
      const n = Math.min(8, st.n), py = y - 6 - row * 2;
      const px = Math.round(e.x - cx - n);
      ctx.fillStyle = C.void;
      ctx.fillRect(px - 1, py - 1, n * 2 + 1, 3);
      ctx.fillStyle = col;
      for (let i = 0; i < n; i++) ctx.fillRect(px + i * 2, py, 1, 1);
      row++;
    }
  }
}

/** Индикаторы предметов у героя: полоски под ним, огоньки над головой, таймер-кольцо */
function renderGauges(g: Game, ctx: CanvasRenderingContext2D, x: number, y: number, barY: number) {
  const list: Gauge[] = [];
  for (const h of g.player.hooks) {
    const r = h.gauge?.(g);
    if (!r) continue;
    if (Array.isArray(r)) list.push(...r);
    else list.push(r);
  }
  let pipY = y - 22;
  for (const gg of list) {
    switch (gg.kind) {
      case 'bar': {
        const k = Math.max(0, Math.min(1, gg.k ?? 0));
        ctx.fillStyle = C.void;
        ctx.fillRect(x - 8, y + barY, 16, 3);
        ctx.fillStyle = gg.color;
        ctx.fillRect(x - 7, y + barY + 1, Math.round(14 * k), 1);
        barY += 3;
        break;
      }
      case 'pips': {
        const n = gg.n ?? 0, max = gg.max ?? n;
        const px = x - max * 1.5;
        for (let i = 0; i < max; i++) {
          ctx.fillStyle = C.void;
          ctx.fillRect(Math.round(px + i * 3) - 1, pipY - 1, 3, 3);
          ctx.fillStyle = i < n ? gg.color : C.metal;
          ctx.fillRect(Math.round(px + i * 3), pipY, 1, 1);
        }
        pipY -= 3;
        break;
      }
      case 'ring': {
        const k = Math.max(0, Math.min(1, gg.k ?? 0));
        ctx.strokeStyle = gg.color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 0.5, y - 5, 13, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
        break;
      }
    }
  }
}
