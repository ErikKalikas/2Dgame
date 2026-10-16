import { TAU } from '../core/math';
import type { Sprite } from '../gfx/sprite';

export type FxKind = 'dot' | 'spark' | 'ring' | 'flash' | 'slash' | 'beam' | 'smoke' | 'ghost' | 'bolt';

export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  drag: number;
  /** Рисовать поверх затемнения (светящиеся эффекты) */
  glow: boolean;
  // дополнительные параметры для отдельных видов
  x2?: number;
  y2?: number;
  angle?: number;
  arc?: number;
  sprite?: Sprite;
  points?: number[];
}

/** Система частиц и визуальных эффектов. Без тряски экрана (по ТЗ). */
export class FxSystem {
  list: Fx[] = [];

  add(f: Partial<Fx> & { kind: FxKind; x: number; y: number }): Fx {
    const fx: Fx = {
      vx: 0, vy: 0, life: 0.4, max: 0, color: '#fff', size: 1, drag: 0, glow: false, ...f,
    } as Fx;
    fx.max = fx.life;
    this.list.push(fx);
    return fx;
  }

  burst(x: number, y: number, color: string, n: number, speed = 80, life = 0.4, size = 1, glow = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.add({
        kind: Math.random() < 0.5 ? 'spark' : 'dot', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + Math.random() * 0.8),
        color, size, drag: 4, glow,
      });
    }
  }

  ring(x: number, y: number, color: string, radius: number, life = 0.3) {
    this.add({ kind: 'ring', x, y, color, size: radius, life, glow: true });
  }

  flash(x: number, y: number, color: string, radius: number, life = 0.12) {
    this.add({ kind: 'flash', x, y, color, size: radius, life, glow: true });
  }

  /** Взрыв: вспышка, кольцо, искры и дым */
  explosion(x: number, y: number, radius: number, color = '#ffcc33') {
    this.flash(x, y, color, radius * 0.9, 0.15);
    this.ring(x, y, color, radius, 0.3);
    this.burst(x, y, color, Math.min(30, 8 + radius / 3), radius * 3, 0.45, 1, true);
    for (let i = 0; i < 5; i++) {
      this.add({
        kind: 'smoke', x: x + (Math.random() - 0.5) * radius * 0.6, y: y + (Math.random() - 0.5) * radius * 0.6,
        vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 15, life: 0.8 + Math.random() * 0.5,
        color: '#1a1a20', size: radius * 0.35, drag: 1,
      });
    }
  }

  update(dt: number) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const f = L[i];
      f.life -= dt;
      if (f.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        continue;
      }
      if (f.drag) {
        const k = Math.max(0, 1 - f.drag * dt);
        f.vx *= k;
        f.vy *= k;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number, glowLayer: boolean) {
    for (const f of this.list) {
      if (f.glow !== glowLayer) continue;
      const t = f.life / f.max; // 1 → 0
      const x = f.x - camX, y = f.y - camY;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      switch (f.kind) {
        case 'dot':
          ctx.fillStyle = f.color;
          ctx.fillRect(Math.round(x), Math.round(y), f.size, f.size);
          break;
        case 'spark':
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.size;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - f.vx * 0.03, y - f.vy * 0.03);
          ctx.stroke();
          break;
        case 'ring':
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 1 + t * 2;
          ctx.beginPath();
          ctx.arc(x, y, f.size * (1 - t * 0.7), 0, TAU);
          ctx.stroke();
          break;
        case 'flash':
          ctx.fillStyle = f.color;
          ctx.globalAlpha = t * 0.7;
          ctx.beginPath();
          ctx.arc(x, y, f.size * (0.6 + 0.4 * t), 0, TAU);
          ctx.fill();
          break;
        case 'smoke':
          ctx.fillStyle = f.color;
          ctx.globalAlpha = t * 0.6;
          ctx.beginPath();
          ctx.arc(x, y, f.size * (1.6 - t * 0.6), 0, TAU);
          ctx.fill();
          break;
        case 'slash': {
          const a = f.angle ?? 0, arc = f.arc ?? 1.5;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 1 + t * 4;
          ctx.beginPath();
          ctx.arc(x, y, f.size, a - arc / 2, a + arc / 2);
          ctx.stroke();
          ctx.strokeStyle = '#fff6dc';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, f.size - 2, a - arc / 2 + 0.2, a + arc / 2 - 0.2);
          ctx.stroke();
          break;
        }
        case 'beam': {
          const x2 = (f.x2 ?? f.x) - camX, y2 = (f.y2 ?? f.y) - camY;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.size * (0.4 + t);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.strokeStyle = '#fff6dc';
          ctx.lineWidth = Math.max(1, f.size * 0.35 * t);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          break;
        }
        case 'bolt': {
          // ломаная молния по точкам
          const p = f.points ?? [];
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 1 + t;
          ctx.beginPath();
          for (let i = 0; i < p.length; i += 2) {
            if (i === 0) ctx.moveTo(p[i] - camX, p[i + 1] - camY);
            else ctx.lineTo(p[i] - camX, p[i + 1] - camY);
          }
          ctx.stroke();
          break;
        }
        case 'ghost':
          if (f.sprite) {
            ctx.globalAlpha = t * 0.45;
            ctx.drawImage(f.sprite, Math.round(x - f.sprite.width / 2), Math.round(y - f.sprite.height + 4));
          }
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** Точки зигзага молнии между двумя точками */
export function boltPoints(x1: number, y1: number, x2: number, y2: number, jag = 6): number[] {
  const pts = [x1, y1];
  const n = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 10));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push(x1 + (x2 - x1) * t + (Math.random() - 0.5) * jag * 2, y1 + (y2 - y1) * t + (Math.random() - 0.5) * jag * 2);
  }
  pts.push(x2, y2);
  return pts;
}
