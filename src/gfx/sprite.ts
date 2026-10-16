import { palChar } from './palette';

export type Sprite = HTMLCanvasElement;

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  return x;
}

/**
 * Спрайт из строк. Каждый символ — пиксель: '.' прозрачный, 0-f — индекс палитры.
 * Пример: ['.33.', '3773', '.33.']
 */
export function fromRows(rows: string[]): Sprite {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = canvas(w, h);
  const x = ctx2d(c);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let i = 0; i < row.length; i++) {
      const col = palChar(row[i]);
      if (col) {
        x.fillStyle = col;
        x.fillRect(i, y, 1, 1);
      }
    }
  }
  return c;
}

/** Зеркальное отражение по горизонтали */
export function flipH(src: Sprite): Sprite {
  const c = canvas(src.width, src.height);
  const x = ctx2d(c);
  x.translate(src.width, 0);
  x.scale(-1, 1);
  x.drawImage(src, 0, 0);
  return c;
}

/** Силуэт спрайта одним цветом (для вспышки при попадании) */
export function silhouette(src: Sprite, color: string): Sprite {
  const c = canvas(src.width, src.height);
  const x = ctx2d(c);
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Обводка спрайта в 1 пиксель */
export function outlined(src: Sprite, color: string): Sprite {
  const c = canvas(src.width + 2, src.height + 2);
  const x = ctx2d(c);
  const sil = silhouette(src, color);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) x.drawImage(sil, dx, dy);
  x.drawImage(src, 1, 1);
  return c;
}

/** Мягкое круглое пятно света (белое с градиентом прозрачности) */
export function softCircle(size: number, color = '255,255,255'): Sprite {
  const c = canvas(size, size);
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.4, `rgba(${color},0.55)`);
  g.addColorStop(1, `rgba(${color},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

export function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
