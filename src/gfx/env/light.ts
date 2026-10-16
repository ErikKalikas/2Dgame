// Свет окружения: мерцание ламп, мигание окон/сигналов, спрайты свечения, виньетка.
// Всё детерминировано по времени игры и зерну источника — без состояния.
import { TILE, VIEW_H, VIEW_W } from '../../config';
import type { Game } from '../../game/game';
import type { RoomMap } from '../../world/room';
import { canvas, type Sprite } from '../sprite';
import { envLayout, type Light } from './layout';
import { rnd } from './util';

/** Горит ли окно сейчас (окна медленно включаются и гаснут) */
export const windowOn = (seed: number, t: number) => rnd(Math.floor(t / 3.1 + seed * 0.37), seed, 5) < 0.72;

/** Фаза светофора: 0 — красный, 1 — жёлтый */
export const signalPhase = (seed: number, t: number) => Math.floor(t * 0.7 + seed * 0.013) & 1;

/** Светодиод статуса: часто мигает, иногда замирает */
export const ledOn = (seed: number, t: number, rate = 1) => rnd(Math.floor(t * (2 + (seed % 5)) * rate + seed), seed, 7) < 0.62;

/** Яркость источника света в момент t (≈0..1.1) */
export function lightLevel(l: Light, t: number): number {
  let k = 1;
  if (l.flick) {
    const s = l.flick;
    if (l.kind === 'heat') {
      k = 0.82 + 0.1 * Math.sin(t * 5.3 + s) + 0.06 * Math.sin(t * 13.1 + s * 1.7) + 0.03 * Math.sin(t * 31 + s);
    } else if (l.kind === 'sign') {
      // неисправная вывеска: изредка гаснет на пару кадров
      const w = Math.floor(t * 4 + s);
      k = rnd(w, s, 11) < 0.1 && Math.sin(t * 60) > 0 ? 0.15 : 1;
    } else {
      // лампа с плохим контактом: короткие провалы
      const w = Math.floor(t * 2.3 + s * 0.01);
      if (rnd(w, s, 9) < 0.16) k = Math.sin(t * 43 + s) > 0.1 ? 1 : 0.2;
      else k = 0.96 + 0.04 * Math.sin(t * 8 + s);
    }
  }
  if (l.blink && l.kind === 'emit') k *= windowOn(l.blink, t) ? 1 : 0;
  return k;
}

/** Действует ли источник (стойка могла быть разрушена) */
export const lightValid = (l: Light, room: RoomMap) => l.tile < 0 || room.tiles[l.tile] === l.tt;

const glowCache = new Map<string, Sprite>();
/** Цветное свечение с мягким спадом (для режима 'lighter') */
export function glowOf(rgb: string): Sprite {
  let s = glowCache.get(rgb);
  if (!s) {
    const size = 64;
    s = canvas(size, size);
    const x = s.getContext('2d')!;
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(0.18, `rgba(${rgb},0.7)`);
    g.addColorStop(0.45, `rgba(${rgb},0.28)`);
    g.addColorStop(0.75, `rgba(${rgb},0.08)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    glowCache.set(rgb, s);
  }
  return s;
}

let cutSprite: Sprite | null = null;
/** Белое пятно для вырезания света из слоя темноты: плотная середина и долгий хвост */
export function cutOf(): Sprite {
  if (!cutSprite) {
    const size = 128;
    cutSprite = canvas(size, size);
    const x = cutSprite.getContext('2d')!;
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.4)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
  }
  return cutSprite;
}

const vignCache = new Map<string, Sprite>();
/** Виньетка: края экрана темнее (рисуется в слой темноты) */
export function vignetteOf(shade: string): Sprite {
  let s = vignCache.get(shade);
  if (!s) {
    s = canvas(VIEW_W, VIEW_H);
    const x = s.getContext('2d')!;
    const g = x.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
    g.addColorStop(0, `rgba(${shade},0)`);
    g.addColorStop(1, `rgba(${shade},0.55)`);
    x.fillStyle = g;
    x.fillRect(0, 0, VIEW_W, VIEW_H);
    vignCache.set(shade, s);
  }
  return s;
}

/** Огни проходящего по путям состава (только Магистрали) */
export function transitSweep(g: Game): { x: number; y: number }[] | null {
  const th = g.theme;
  if (th.tier !== 'transit') return null;
  const L = envLayout(g.room, th);
  const out: { x: number; y: number }[] = [];
  const t = g.time, room = g.room;
  for (const row of L.trackRows) {
    const period = 9 + (row % 4);
    const ph = ((t + row * 1.7) % period) / period;
    if (ph > 0.4) continue;
    const x = -60 + (ph / 0.4) * (room.pxW + 120);
    out.push({ x, y: (row + 1) * TILE }, { x: x - 40, y: (row + 1) * TILE });
  }
  for (const col of L.trackCols) {
    const period = 8 + (col % 5);
    const ph = ((t + col * 1.3) % period) / period;
    if (ph > 0.4) continue;
    const y = -60 + (ph / 0.4) * (room.pxH + 120);
    out.push({ x: (col + 1) * TILE, y }, { x: (col + 1) * TILE, y: y - 40 });
  }
  return out.length ? out : null;
}
