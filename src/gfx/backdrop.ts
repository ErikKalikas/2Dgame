import { VIEW_H, VIEW_W } from '../config';
import { RNG } from '../core/rng';
import { C } from './palette';

interface Tower {
  x: number;
  w: number;
  h: number;
  layer: number;
  windows: { x: number; y: number; c: string; blink: number }[];
}

/** Фон меню: ночной мегаполис под дождём с башней корпорации в центре */
export class Backdrop {
  private towers: Tower[] = [];
  private rain: { x: number; y: number; s: number }[] = [];
  private t = 0;

  constructor() {
    const rng = new RNG('backdrop');
    for (let layer = 0; layer < 3; layer++) {
      let x = -10;
      while (x < VIEW_W + 10) {
        const w = rng.int(14, 34);
        const h = rng.int(40, 110) + layer * 25;
        const windows: Tower['windows'] = [];
        for (let wy = VIEW_H - h + 6; wy < VIEW_H - 4; wy += 5) {
          for (let wx = 3; wx < w - 3; wx += 4) {
            if (rng.chance(0.08 + layer * 0.03)) {
              const c = rng.chance(0.7) ? C.redD : rng.chance(0.85) ? C.amberD : C.violet;
              windows.push({ x: x + wx, y: wy, c, blink: rng.chance(0.1) ? rng.float(0.5, 3) : 0 });
            }
          }
        }
        this.towers.push({ x, w, h, layer, windows });
        x += w + rng.int(0, 6);
      }
    }
    for (let i = 0; i < 120; i++) {
      this.rain.push({ x: rng.float(0, VIEW_W), y: rng.float(0, VIEW_H), s: rng.float(180, 260) });
    }
  }

  update(dt: number) {
    this.t += dt;
    for (const d of this.rain) {
      d.y += d.s * dt;
      d.x -= d.s * 0.25 * dt;
      if (d.y > VIEW_H) {
        d.y -= VIEW_H + 10;
        d.x = Math.random() * (VIEW_W + 60);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#07060a');
    g.addColorStop(0.6, '#140a0e');
    g.addColorStop(1, '#2a0c10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const shades = [C.dark, C.black, '#09090d'];
    for (let layer = 0; layer < 3; layer++) {
      for (const t of this.towers) {
        if (t.layer !== layer) continue;
        ctx.fillStyle = shades[layer];
        ctx.fillRect(t.x, VIEW_H - t.h, t.w, t.h);
        for (const w of t.windows) {
          if (w.blink && Math.sin(this.t * w.blink + w.x) > 0.6) continue;
          ctx.fillStyle = w.c;
          ctx.fillRect(w.x, w.y, 2, 1);
        }
      }
      if (layer === 1) this.renderCorpTower(ctx);
    }

    ctx.strokeStyle = 'rgba(140,140,154,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of this.rain) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + 2, d.y - 7);
    }
    ctx.stroke();
  }

  private renderCorpTower(ctx: CanvasRenderingContext2D) {
    const cx = VIEW_W / 2;
    const top = 26;
    ctx.fillStyle = '#0b0b10';
    ctx.beginPath();
    ctx.moveTo(cx - 24, VIEW_H);
    ctx.lineTo(cx - 18, top + 20);
    ctx.lineTo(cx - 6, top);
    ctx.lineTo(cx + 6, top);
    ctx.lineTo(cx + 18, top + 20);
    ctx.lineTo(cx + 24, VIEW_H);
    ctx.fill();
    // 9 уровней-сегментов
    for (let i = 0; i < 9; i++) {
      const y = top + 30 + i * 18;
      ctx.fillStyle = i === 8 ? C.redD : C.blood;
      ctx.fillRect(cx - 16 + i * 0.4, y, 32 - i * 0.8, 1);
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2);
    ctx.fillStyle = C.red;
    ctx.globalAlpha = 0.4 + pulse * 0.6;
    ctx.fillRect(cx - 1, top - 6, 2, 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.metal;
    ctx.fillRect(cx, top - 4, 1, 4);
  }
}
