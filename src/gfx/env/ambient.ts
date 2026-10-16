// Тонкая анимация окружения поверх статичного слоя (в мировых координатах, до освещения):
// электропол, капли и пар (Отстойник), искры (Цеха), окна (Жилые соты), светофоры (Магистрали),
// светодиоды и сканирующая линия (Шпиль). Без состояния: всё — функция времени и зерна.
import { TILE, VIEW_H, VIEW_W } from '../../config';
import type { Game } from '../../game/game';
import { T } from '../../world/tiles';
import { C } from '../palette';
import { envLayout } from './layout';
import { ledOn, signalPhase, windowOn } from './light';
import { rnd } from './util';

export function renderAmbient(g: Game, ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const room = g.room, th = g.theme, t = g.time;
  const L = envLayout(room, th);
  const x0 = cx - 24, y0 = cy - 24, x1 = cx + VIEW_W + 24, y1 = cy + VIEW_H + 24;
  const vis = (x: number, y: number) => x > x0 && x < x1 && y > y0 && y < y1;
  const px = (x: number, y: number, w: number, h: number, c: string, a: number) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x - cx), Math.round(y - cy), w, h);
  };

  // --- электропол ---
  if (g.electroActive || g.electroWarning) {
    for (const i of L.electro) {
      const tx = i % room.tw, ty = (i / room.tw) | 0;
      const wx = tx * TILE, wy = ty * TILE;
      if (!vis(wx + 8, wy + 8)) continue;
      if (g.electroActive) {
        px(wx + 1, wy + 1, 14, 14, Math.random() < 0.5 ? C.yellow : C.amber, 0.3 + Math.random() * 0.25);
        // дуги разрядов
        if (Math.random() < 0.7) {
          let ax = wx + 3 + ((Math.random() * 3) | 0) * 4, ay = wy + 3;
          for (let k = 0; k < 6; k++) {
            px(ax, ay, 1, 2, k % 2 ? C.bone : C.yellow, 0.9);
            ax += ((Math.random() * 3) | 0) - 1;
            ay += 2;
          }
        }
      } else if (Math.sin(t * 30) > 0) {
        px(wx + 1, wy + 1, 14, 14, C.amberD, 0.5);
        px(wx + 2, wy + 2, 12, 1, C.amber, 0.4);
      }
    }
  }

  switch (th.tier) {
    case 'sump':
      for (const d of L.drips) {
        if (!vis(d.x, d.y)) continue;
        const period = 1.4 + (d.seed % 9) * 0.25;
        const ph = ((t + d.seed * 0.011) % period) / period;
        if (ph < 0.55) {
          // капля набухает
          px(d.x, d.y, 1, 1, C.grey, (ph / 0.55) * 0.6);
        } else if (ph < 0.75) {
          const k = (ph - 0.55) / 0.2;
          px(d.x, d.y + k * k * d.k, 1, 2, C.grey, 0.7);
        } else if (ph < 0.86) {
          const k = (ph - 0.75) / 0.11;
          const y = d.y + d.k + 1;
          px(d.x - 1 - k * 2, y - k * 2, 1, 1, C.grey, 0.5 * (1 - k));
          px(d.x + 1 + k * 2, y - k * 2, 1, 1, C.grey, 0.5 * (1 - k));
        }
      }
      steam(L.steam, 0.1);
      break;
    case 'foundry':
      for (const s of L.sparks) {
        if (!vis(s.x, s.y)) continue;
        const period = s.k === 0 ? 1.1 + (s.seed % 5) * 0.2 : 2.5 + (s.seed % 7) * 0.4;
        const cyc = Math.floor((t + s.seed * 0.01) / period);
        const ph = ((t + s.seed * 0.01) % period) / period;
        const n = s.k === 0 ? 4 : 3;
        const life = s.k === 0 ? 0.5 : 0.3;
        if (ph > life) continue;
        const tau = (ph / life) * 0.7;
        for (let i = 0; i < n; i++) {
          const vx = (rnd(cyc, i, s.seed) - 0.5) * 60;
          const vy = -10 - rnd(cyc, i + 9, s.seed) * 30;
          const x = s.x + vx * tau, y = s.y + vy * tau + 90 * tau * tau;
          px(x, y, 1, 1, tau < 0.25 ? C.yellow : tau < 0.5 ? C.amber : C.red, 1 - tau);
        }
      }
      steam(L.steam, th.variant === 1 ? 0.06 : 0.1);
      break;
    case 'hab':
      for (const b of L.blinks) {
        if (!vis(b.x, b.y)) continue;
        if (b.k === 2) {
          // окно капсулы
          if (windowOn(b.seed, t)) {
            px(b.x, b.y, 4, 3, C.red, 0.9);
            px(b.x, b.y, 4, 1, C.redL, 0.5);
            if ((b.seed & 3) === 0 && Math.sin(t * 2 + b.seed) > 0.6) px(b.x + 1, b.y + 1, 1, 2, C.black, 0.7); // силуэт за шторой
          }
        } else {
          // огонёк статуса на двери капсулы
          const on = Math.sin(t * (b.k ? 3 : 1.3) + b.seed) > 0;
          px(b.x, b.y, 1, 1, b.k ? C.amber : C.red, on ? 0.9 : 0.2);
        }
      }
      break;
    case 'transit':
      for (const b of L.blinks) {
        if (!vis(b.x, b.y)) continue;
        const ph = signalPhase(b.seed, t);
        if (ph === 0) px(b.x, b.y, 2, 2, C.redL, 1);
        else px(b.x, b.y + 4, 2, 2, C.yellow, 1);
      }
      break;
    case 'spire': {
      for (const b of L.blinks) {
        if (!vis(b.x, b.y)) continue;
        if (ledOn(b.seed, t)) px(b.x, b.y, 1, 1, b.k === 0 ? C.redL : C.amber, 0.95);
      }
      for (const b of L.rackLeds) {
        if (!vis(b.x, b.y)) continue;
        if (room.at(b.x, b.y) !== T.Crate) continue;
        if (ledOn(b.seed, t, 0.7)) px(b.x, b.y, 1, 1, b.k === 0 ? C.redL : C.amber, 0.95);
      }
      // сканирующая линия Диспетчера: раз в несколько секунд проходит сверху вниз
      const period = 7;
      const ph = (t % period) / period;
      if (ph < 0.45) {
        const y = (ph / 0.45) * room.pxH;
        if (y > y0 && y < y1) {
          px(cx, y, VIEW_W, 1, C.red, 0.22);
          px(cx, y - 3, VIEW_W, 3, C.redD, 0.08);
          px(cx, y - 10, VIEW_W, 7, C.redD, 0.035);
        }
      }
      break;
    }
  }
  ctx.globalAlpha = 1;

  function steam(list: typeof L.steam, a: number) {
    for (const s of list) {
      if (!vis(s.x, s.y)) continue;
      for (let i = 0; i < 3; i++) {
        const ph = ((t * 0.35 + s.seed * 0.007 + i / 3) % 1);
        const r = 1 + Math.floor(ph * 3);
        const x = s.x + Math.sin(t * 1.3 + s.seed + i * 2) * 3 * ph - r / 2;
        const y = s.y - ph * 22;
        px(x, y, r + 1, r, C.grey, a * Math.sin(ph * Math.PI));
      }
    }
  }
}
