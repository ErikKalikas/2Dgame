import { TILE, VIEW_H, VIEW_W } from '../config';
import { TAU } from '../core/math';
import { icon } from '../gfx/icons';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import { canvas, ctx2d, flipH, softCircle, type Sprite } from '../gfx/sprite';
import { SPR, flashOf } from '../gfx/sprites';
import type { RoomMap } from '../world/room';
import { T } from '../world/tiles';
import { renderEBullets, renderPBullets } from './bullets';
import { raycast } from './collision';
import type { Enemy } from './enemy';
import type { Game } from './game';
import { item } from './items';

const QUALITY_COLOR = ['', C.grey, C.amber, C.red, C.violet];
export const qualityColor = (q: number) => QUALITY_COLOR[q];

let lightCanvas: HTMLCanvasElement | null = null;
let lightSprite: Sprite | null = null;
const flipped = new WeakMap<Sprite, Sprite>();
const lampCache = new WeakMap<RoomMap, { x: number; y: number }[]>();

function flipOf(s: Sprite): Sprite {
  let f = flipped.get(s);
  if (!f) {
    f = flipH(s);
    flipped.set(s, f);
  }
  return f;
}

/** Лампы на стенах — там, где рисуется светильник (см. roomrender) */
function lamps(room: RoomMap): { x: number; y: number }[] {
  let l = lampCache.get(room);
  if (l) return l;
  l = [];
  for (let ty = 0; ty < room.th; ty++) {
    for (let tx = 0; tx < room.tw; tx++) {
      if (room.get(tx, ty) === T.Wall && tx % 7 === 3 && room.inside(tx, ty + 1) && room.get(tx, ty + 1) !== T.Wall) {
        l.push({ x: tx * TILE + 8, y: ty * TILE + 14 });
      }
    }
  }
  lampCache.set(room, l);
  return l;
}

export function renderGame(g: Game, r: Renderer) {
  const ctx = r.ctx;
  const cx = Math.round(g.camX), cy = Math.round(g.camY);
  const room = g.room;

  // 1. статичный слой комнаты
  ctx.drawImage(g.roomCanvasFor(), -cx, -cy);

  // 2. электропол
  if (g.electroActive || g.electroWarning) {
    const x0 = Math.max(0, Math.floor(cx / TILE)), x1 = Math.min(room.tw - 1, Math.floor((cx + VIEW_W) / TILE));
    const y0 = Math.max(0, Math.floor(cy / TILE)), y1 = Math.min(room.th - 1, Math.floor((cy + VIEW_H) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (room.get(tx, ty) !== T.Electro) continue;
        if (g.electroActive) {
          ctx.fillStyle = Math.random() < 0.5 ? C.yellow : C.amber;
          ctx.globalAlpha = 0.35 + Math.random() * 0.25;
          ctx.fillRect(tx * TILE - cx + 1, ty * TILE - cy + 1, 14, 14);
        } else if (Math.sin(g.time * 30) > 0) {
          ctx.fillStyle = C.amberD;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(tx * TILE - cx + 1, ty * TILE - cy + 1, 14, 14);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // 3. двери
  for (const d of room.doors) renderDoor(g, ctx, d, cx, cy);

  // 4. предметы на полу
  renderPickups(g, ctx, cx, cy);

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
  if (p.charge > 0) {
    const w = p.weapon.weapon!;
    const k = Math.min(1, p.charge / ((w.chargeTime ?? 1) / p.stats.fireRateMult));
    ctx.fillStyle = C.void;
    ctx.fillRect(Math.round(p.x - cx - 8), Math.round(p.y - cy + 6), 16, 3);
    ctx.fillStyle = k >= 1 ? C.yellow : C.amber;
    ctx.fillRect(Math.round(p.x - cx - 7), Math.round(p.y - cy + 7), Math.round(14 * k), 1);
  }

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
    lightSprite = softCircle(128);
  }
  const lc = ctx2d(lightCanvas);
  const ls = lightSprite!;
  lc.globalCompositeOperation = 'source-over';
  lc.clearRect(0, 0, VIEW_W, VIEW_H);
  lc.fillStyle = `rgba(3,3,6,${g.theme.dark})`;
  lc.fillRect(0, 0, VIEW_W, VIEW_H);
  lc.globalCompositeOperation = 'destination-out';
  const light = (x: number, y: number, rad: number, a = 1) => {
    if (x + rad < cx || y + rad < cy || x - rad > cx + VIEW_W || y - rad > cy + VIEW_H) return;
    lc.globalAlpha = a;
    lc.drawImage(ls, x - cx - rad, y - cy - rad, rad * 2, rad * 2);
  };
  const p = g.player;
  light(p.x, p.y, 120 + Math.sin(g.time * 3) * 3);
  for (const l of lamps(g.room)) light(l.x, l.y, 64, 0.8);
  for (const f of g.lightFlashes) light(f.x, f.y, f.r, Math.min(1, f.t * 6));
  for (const k of g.pickups) if (k.kind === 'item' || k.kind === 'teleporter') light(k.x, k.y, 40, 0.7);
  for (const e of g.enemies) if (e.def.boss) light(e.x, e.y, 80, 0.6);
  lc.globalAlpha = 1;
  lc.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightCanvas, 0, 0);

  // тёплое свечение ламп
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lamps(g.room)) {
    const x = l.x - cx, y = l.y - cy;
    if (x < -40 || y < -40 || x > VIEW_W + 40 || y > VIEW_H + 40) continue;
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = `rgb(${g.theme.lamp})`;
    ctx.beginPath();
    ctx.arc(x, y + 6, 26, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function renderDoor(g: Game, ctx: CanvasRenderingContext2D, d: RoomMap['doors'][number], cx: number, cy: number) {
  const horiz = d.dir === 'n' || d.dir === 's';
  const x = d.tx * TILE - cx, y = d.ty * TILE - cy;
  const w = horiz ? TILE * 2 : TILE, h = horiz ? TILE : TILE * 2;
  const target = g.plan.rooms[d.to];
  const accent = target.type === 'boss' ? C.red : target.type === 'treasure' ? C.yellow : target.type === 'shop' ? C.amber : g.theme.wallTop;
  const closed = d.locked || g.locked;
  // рамка
  ctx.fillStyle = accent;
  if (horiz) {
    ctx.fillRect(x - 2, y, 2, h);
    ctx.fillRect(x + w, y, 2, h);
  } else {
    ctx.fillRect(x, y - 2, w, 2);
    ctx.fillRect(x, y + h, w, 2);
  }
  if (!closed) {
    ctx.fillStyle = C.void;
    ctx.fillRect(x, y, w, h);
    return;
  }
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
    // замок
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
      case 'coin': {
        ctx.drawImage(sh, x - 3, y + 1, 6, 2);
        const fr = SPR.coin[Math.floor(k.t * 8) % 4];
        ctx.drawImage(fr, x - Math.floor(fr.width / 2), y - 4 + bob);
        break;
      }
      default: {
        const s = k.kind === 'medkit' ? SPR.medkit : k.kind === 'key' ? SPR.key : SPR.bomb;
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
  if (p.invuln > 0 && p.dashT <= 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
  const s = p.sprite;
  ctx.drawImage(s, x - 6, y - 13);
  if (p.holdItem) {
    // предмет над головой (как в Isaac)
    const k = 1 - Math.max(0, p.holdT - 0.6) / 0.3;
    ctx.drawImage(icon(p.holdItem.icon), x - 6, y - 28 - Math.round(k * 3));
  }
}

function renderEnemy(g: Game, ctx: CanvasRenderingContext2D, e: Enemy, cx: number, cy: number) {
  if (e.hidden) return;
  const frames = e.frames;
  let fi = 0;
  if (frames.length > 2) fi = e.anim > 0 ? 1 + (Math.floor(e.anim) % (frames.length - 1)) : 0;
  else if (frames.length === 2) fi = Math.floor(e.anim + g.time * 2) % 2;
  let s = frames[fi];
  if (e.facing < 0) s = flipOf(s);
  const h = e.mem.h ?? 0;
  const x = Math.round(e.x - cx - s.width / 2);
  const y = Math.round(e.y - cy - s.height / 2 - h);
  ctx.drawImage(SPR.shadow, Math.round(e.x - cx) - 5, Math.round(e.y - cy + s.height / 2 - 3), 10, 4);
  if (e.spawn > 0) {
    // появление: вертикальный луч телепортации
    const k = 1 - e.spawn / 0.6;
    ctx.fillStyle = C.redD;
    ctx.globalAlpha = 0.5 * (1 - Math.max(0, k));
    ctx.fillRect(Math.round(e.x - cx) - 2, 0, 4, Math.round(e.y - cy));
    ctx.globalAlpha = Math.max(0, Math.min(1, k));
    ctx.drawImage(s, x, y);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.drawImage(e.flash > 0 ? flashOf(s) : s, x, y);
  if (e.mem.invuln > 0 && Math.floor(g.time * 20) % 2 === 0) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(flashOf(s), x, y);
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
    ctx.fillStyle = e.burnT > 0 ? C.amber : C.red;
    ctx.fillRect(bx, by, Math.max(1, Math.round((bw * e.hp) / e.maxHp)), 2);
  }
}
