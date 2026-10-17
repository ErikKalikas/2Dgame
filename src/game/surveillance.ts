import { TILE, VIEW_H, VIEW_W } from '../config';
import { tr, type L } from '../core/i18n';
import { input } from '../core/input';
import { TAU, angleDiff, angleTo, dist2 } from '../core/math';
import { RNG } from '../core/rng';
import { domeCameraArt, jammerArt, wallCameraArt, type CamDir } from '../gfx/art/surveillance';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import type { LevelRoom } from '../world/levelgen';
import { T } from '../world/tiles';
import { lineOfSight } from './collision';
import type { Game } from './game';
import { hackMult } from './patches';
import { addHeat, noise } from './wanted';

// Камеры и глушилки (этап 14а, Механики#Розыск). Камера на стене комнаты (качается) или купол
// под потолком коридора (крутится): видит Т-417 в конусе ~1 с — тревога и розыск. Камеру можно
// сбить выстрелом или взрывом (шумно) или отключить взломом R (тихо, розыск падает).
// Глушилка — комната-укрытие: розыск не растёт и понемногу снижается. Во время сбоя камеры не видят.

export interface Camera {
  x: number;
  y: number;
  kind: 'wall' | 'dome';
  /** Направление покоя и размах качания (у купола — скорость вращения) */
  base: number;
  sweep: number;
  /** Текущее направление взгляда */
  a: number;
  ph: number;
  /** Сколько уже видит игрока (0..1 — тревога) */
  spot: number;
  /** После тревоги камера «передаёт координаты» и не видит заново (с) */
  cd: number;
  state: 'on' | 'off' | 'broken';
}

/** Сколько смотреть, чтобы поднять тревогу (с) */
export const CAMERA_SPOT = 1;
/** Перерыв после тревоги (с) */
const CAMERA_CD = 10;
/** Дальность и половина угла обзора */
const RANGE = { wall: 150, dome: 110 } as const;
const HALF = 0.42;
/** Под самой камерой — слепая зона (px) */
const BLIND = 16;
/** Взлом камеры: сколько держать R (с), насколько падает розыск */
export const CAMERA_HACK = 1;
export const CAMERA_HACK_HEAT = -0.3;
const HACK_R = 22;
/** Глушилка: розыск падает на 1 ступень за 40 с */
export const JAMMER_RATE = 1 / 40;

/** Где объектив на спрайте стенной камеры (по положению корпуса) */
const WALL_LENS: Record<CamDir, [number, number]> = { l: [1, 7], ld: [1, 7], d: [4, 8], rd: [7, 7], r: [7, 7] };

/** Сколько камер на уровне: в комнатах и в коридорах */
function cameraCount(floor: number): { rooms: number; corridors: number } {
  return { rooms: 1 + Math.ceil(floor / 2), corridors: 1 + Math.floor(floor / 3) };
}

export class SurveillanceState {
  cameras: Camera[] = [];
  /** Взлом камеры: какая рядом и сколько держим R */
  hackTarget: Camera | null = null;
  hackT = 0;
  /** Игрок уже получил строку о глушилке в этой комнате */
  jamLogged = -1;
}

/** Расставить камеры на новом уровне (свой поток случайных чисел — не сдвигает остальную генерацию) */
export function placeCameras(g: Game) {
  const s = g.surv;
  s.cameras = [];
  s.hackTarget = null;
  s.hackT = 0;
  s.jamLogged = -1;
  const rng = new RNG(g.seed + ':cams:' + g.floorNum);
  const n = cameraCount(g.floorNum);
  const rooms = rng.shuffle(g.plan.rooms.filter((r) => r.role === 'combat' || r.role === 'ambush' || r.role === 'elite'));
  for (const r of rooms.slice(0, n.rooms)) {
    const c = wallCamera(g, r, rng);
    if (c) s.cameras.push(c);
  }
  const corridors = rng.shuffle(g.plan.corridors.filter((c) => c.path.length >= 8));
  for (const c of corridors.slice(0, n.corridors)) {
    const t = c.path[Math.floor(c.path.length / 2)];
    const x = (t % g.plan.tw + 0.5) * TILE, y = (Math.floor(t / g.plan.tw) + 0.5) * TILE;
    s.cameras.push({ x, y, kind: 'dome', base: rng.float(0, TAU), sweep: rng.chance(0.5) ? 0.5 : -0.5, a: 0, ph: 0, spot: 0, cd: 0, state: 'on' });
  }
}

/** Камера на верхней стене комнаты, не у проёма двери; смотрит вниз и качается */
function wallCamera(g: Game, r: LevelRoom, rng: RNG): Camera | null {
  const north = r.doors.map((i) => g.plan.doors[i]).filter((d) => d.dir === 'n');
  for (let k = 0; k < 8; k++) {
    const tx = rng.int(r.x + 3, r.x + r.w - 4);
    if (north.some((d) => Math.abs(d.tx - tx) < 4)) continue;
    if (g.room.get(tx, r.y + 1) !== T.Floor) continue;
    return { x: (tx + 0.5) * TILE, y: (r.y + 1) * TILE + 2, kind: 'wall', base: Math.PI / 2, sweep: 0.9, a: Math.PI / 2, ph: rng.float(0, TAU), spot: 0, cd: 0, state: 'on' };
  }
  return null;
}

/** Игрок в конусе камеры и на виду */
export function cameraSees(g: Game, c: Camera): boolean {
  const p = g.player;
  if (c.state !== 'on' || c.cd > 0 || p.glitchT > 0) return false;
  const d2 = dist2(c.x, c.y, p.x, p.y);
  if (d2 > RANGE[c.kind] ** 2 || d2 < BLIND * BLIND) return false;
  if (Math.abs(angleDiff(c.a, angleTo(c.x, c.y, p.x, p.y))) > HALF) return false;
  return lineOfSight(g.room, c.x, c.y, p.x, p.y - 3);
}

export function updateSurveillance(g: Game, dt: number) {
  const s = g.surv, p = g.player;
  // глушилка: в комнате-укрытии розыск не растёт и падает
  const jam = g.zone?.role === 'jammer';
  g.wanted.jammed = jam;
  if (jam) {
    addHeat(g, -JAMMER_RATE * dt);
    if (s.jamLogged !== g.zone!.id) {
      s.jamLogged = g.zone!.id;
      g.log(SURV_LOG.jammer);
    }
  } else s.jamLogged = -1;

  for (const c of s.cameras) {
    if (c.state === 'broken') continue;
    c.ph += dt;
    c.a = c.kind === 'wall' ? c.base + Math.sin(c.ph * 0.9) * c.sweep : c.base + c.ph * c.sweep;
    if (c.state !== 'on') continue;
    // пули и снаряды игрока сбивают камеру
    for (const b of g.pbullets) {
      if (b.dead || b.arc || dist2(b.x, b.y, c.x, c.y) > (b.r + 4) ** 2) continue;
      b.dead = true;
      breakCamera(g, c);
      break;
    }
    if (c.state !== 'on') continue;
    if (c.cd > 0) {
      c.cd -= dt;
      continue;
    }
    if (dist2(c.x, c.y, p.x, p.y) > 300 * 300) {
      c.spot = 0;
      continue;
    }
    if (cameraSees(g, c)) {
      c.spot += dt;
      if (c.spot >= CAMERA_SPOT * p.stats.spotTime) {
        c.spot = 0;
        c.cd = CAMERA_CD;
        noise(g, 'camera');
        g.log(SURV_LOG.spotted);
        g.fx.ring(c.x, c.y, C.red, 20, 0.4);
      }
    } else c.spot = Math.max(0, c.spot - dt * 0.5);
  }
  updateCameraHack(g, dt);
}

function breakCamera(g: Game, c: Camera) {
  if (c.state === 'broken') return;
  c.state = 'broken';
  c.spot = 0;
  noise(g, 'cameraShot');
  g.fx.burst(c.x, c.y, C.amber, 8, 60, 0.3, 1, true);
}

/** Взрыв сбивает камеры в радиусе (combat.explode) */
export function blastCameras(g: Game, x: number, y: number, r: number) {
  for (const c of g.surv.cameras) if (c.state !== 'broken' && dist2(c.x, c.y, x, y) <= (r + 4) ** 2) breakCamera(g, c);
}

/** Взлом камеры удержанием R (не в бою за закрытыми дверями и не у предмета) */
function updateCameraHack(g: Game, dt: number) {
  const s = g.surv, p = g.player;
  let near: Camera | null = null;
  if (!g.nearPickup && !g.hackTarget) {
    for (const c of s.cameras) if (c.state === 'on' && dist2(p.x, p.y, c.x, c.y) < HACK_R * HACK_R) near = c;
  }
  s.hackTarget = near;
  if (!near || g.locked) {
    s.hackT = 0;
    return;
  }
  if (!input.isDown('interact')) {
    s.hackT = Math.max(0, s.hackT - dt * 2);
    return;
  }
  s.hackT += dt * p.stats.hackSpeed * hackMult(g);
  if (Math.random() < dt * 20) g.fx.add({ kind: 'spark', x: near.x + (Math.random() - 0.5) * 8, y: near.y, vx: (Math.random() - 0.5) * 50, vy: -20, color: C.yellow, life: 0.2, glow: true });
  if (s.hackT >= CAMERA_HACK) {
    s.hackT = 0;
    near.state = 'off';
    near.spot = 0;
    addHeat(g, CAMERA_HACK_HEAT);
    g.patches.hacks++;
    g.log(SURV_LOG.hacked);
    p.emit('onHack', g);
  }
}


// ---------------------------------------------------------------- отрисовка

/** Камеры (конус, корпус) и глушилки — поверх темноты */
export function renderSurveillance(g: Game, ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const t = g.time;
  for (const r of g.plan.rooms) if (r.role === 'jammer' && r.visited) drawJammer(g, ctx, r, cx, cy, t);
  for (const c of g.surv.cameras) {
    const x = c.x - cx, y = c.y - cy;
    if (x < -160 || y < -160 || x > VIEW_W + 160 || y > VIEW_H + 160) continue;
    if (c.state === 'on') {
      const R = RANGE[c.kind];
      const alarm = c.cd > 0;
      ctx.globalAlpha = alarm ? 0.14 : 0.06 + 0.22 * c.spot;
      ctx.fillStyle = alarm || c.spot > 0 ? C.red : C.amber;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, R, c.a - HALF, c.a + HALF);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const ix = Math.round(x), iy = Math.round(y);
    if (c.kind === 'wall') {
      // корпус на кронштейне плавно поворачивается за взглядом: 5 положений
      const d = angleDiff(Math.PI / 2, c.a);
      const dir = d > 0.6 ? 'l' : d > 0.2 ? 'ld' : d < -0.6 ? 'r' : d < -0.2 ? 'rd' : 'd';
      ctx.drawImage(wallCameraArt(dir, c.state), ix - 4, iy - 7);
      const [lx, ly] = WALL_LENS[dir];
      if (c.state === 'on') {
        // объектив: при взломе мигает янтарём, в поиске — гаснет через такт, в тревоге горит
        const hacking = g.surv.hackTarget === c && g.surv.hackT > 0;
        const dark = !hacking && c.cd <= 0 && Math.floor(t * 2 + c.ph) % 2 === 0;
        if (hacking || dark) {
          ctx.fillStyle = hacking ? (Math.floor(t * 12) % 2 ? C.yellow : C.amber) : C.redD;
          ctx.fillRect(ix - 4 + lx, iy - 7 + ly, 1, 1);
        }
      } else if (c.state === 'broken') {
        // оборванный провод качается под корпусом
        ctx.fillStyle = C.metal;
        for (let k = 1; k <= 3; k++) ctx.fillRect(ix + Math.round(Math.sin(t * 3 + c.ph) * k * 0.7), iy + 2 + k, 1, 1);
      }
    } else {
      ctx.drawImage(domeCameraArt(c.state), ix - 4, iy - 4);
      // объектив купола вращается вместе со взглядом
      if (c.state !== 'broken') {
        const lx = Math.round(x + Math.cos(c.a) * 2), ly = Math.round(y + Math.sin(c.a) * 2);
        ctx.fillStyle = C.black;
        ctx.fillRect(Math.round(x + Math.cos(c.a)), Math.round(y + Math.sin(c.a)), 1, 1);
        ctx.fillStyle = c.state === 'on' ? (c.cd > 0 || Math.floor(t * 2 + c.ph) % 2 ? C.redL : C.red) : C.metal;
        ctx.fillRect(lx, ly, 1, 1);
      }
    }
    if (c.state === 'broken' && Math.random() < 0.02) g.fx.add({ kind: 'spark', x: c.x, y: c.y, vx: (Math.random() - 0.5) * 40, vy: 20, color: C.amber, life: 0.2, glow: true });
  }
}

/** Глушилка: мачта с тарелкой в центре комнаты-укрытия, от неё расходятся кольца помех */
function drawJammer(g: Game, ctx: CanvasRenderingContext2D, r: LevelRoom, cx: number, cy: number, t: number) {
  const c = g.room.roomCenter(r);
  // мачта чуть выше центра: игрок входит в середину комнаты и не прячется под ней
  const x = Math.round(c.x - cx), y = Math.round(c.y - cy - 28);
  if (x < -60 || y < -60 || x > VIEW_W + 60 || y > VIEW_H + 60) return;
  for (let k = 0; k < 2; k++) {
    const ph = (t * 0.5 + k * 0.5) % 1;
    ctx.globalAlpha = 0.35 * (1 - ph);
    ctx.strokeStyle = C.steelL;
    ctx.beginPath();
    ctx.arc(x, y - 15, 6 + ph * 40, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const spr = jammerArt()[Math.floor(t * 6) % 4];
  ctx.drawImage(spr, x - 8, y - 18);
}

/** Подсказка и полоса взлома камеры */
export function renderCameraHud(g: Game, r: Renderer) {
  const s = g.surv;
  if (!s.hackTarget || g.state !== 'play') return;
  const x = VIEW_W / 2, y = VIEW_H - 52;
  if (g.locked) {
    r.text(tr({ ru: 'камера недоступна в бою', en: 'camera locked during combat' }), x, y, { size: 5, color: C.redL, align: 'center' });
    return;
  }
  r.text(tr({ ru: '[R держать] отключить камеру', en: '[R hold] disable camera' }), x, y, { size: 5, color: C.yellow, align: 'center' });
  const w = 60;
  r.rect(x - w / 2, y + 8, w, 3, C.black);
  r.rect(x - w / 2, y + 8, Math.round((w * s.hackT) / CAMERA_HACK), 3, C.yellow);
}

export const SURV_LOG = {
  spotted: { ru: 'Камера: Т-417 замечен. Координаты переданы.', en: 'Camera: T-417 spotted. Coordinates sent.' } as L,
  hacked: { ru: 'Камера отключена. Сигнал не поступает.', en: 'Camera offline. No signal.' } as L,
  jammer: { ru: 'Глушилка: сигнал Т-417 потерян. Розыск снижается.', en: 'Jammer: T-417 signal lost. Wanted level dropping.' } as L,
};
