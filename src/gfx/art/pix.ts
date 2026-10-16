import { PAL } from '../palette';
import { canvas, ctx2d, type Sprite } from '../sprite';

// Мини-набор для пиксель-арта: сетка индексов палитры, слои, автоматическая обводка,
// а для крупных спрайтов — маски с «фаской» (свет сверху-слева, тень снизу-справа).

/** Сетка индексов палитры; -1 = прозрачный пиксель */
export class Grid {
  readonly d: Int8Array;
  constructor(readonly w: number, readonly h: number) {
    this.d = new Int8Array(w * h).fill(-1);
  }

  static of(rows: string[]): Grid {
    const g = new Grid(Math.max(...rows.map((r) => r.length)), rows.length);
    g.rows(rows, 0, 0);
    return g;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.d[y * this.w + x];
  }

  set(x: number, y: number, c: number) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  /** Строки в позицию (x, y): '.' и ' ' — пропуск, 0-f — цвет */
  rows(rows: string[], x = 0, y = 0) {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const v = parseInt(r[i], 16);
        if (!Number.isNaN(v)) this.set(x + i, y + j, v);
      }
    }
    return this;
  }

  blit(src: Grid, x = 0, y = 0, flip = false) {
    for (let j = 0; j < src.h; j++)
      for (let i = 0; i < src.w; i++) {
        const v = src.get(flip ? src.w - 1 - i : i, j);
        if (v >= 0) this.set(x + i, y + j, v);
      }
    return this;
  }

  /** Копирует левую половину на правую зеркально */
  mirror() {
    const half = Math.floor(this.w / 2);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < half; x++) this.d[y * this.w + (this.w - 1 - x)] = this.d[y * this.w + x];
    return this;
  }

  clone(): Grid {
    const g = new Grid(this.w, this.h);
    g.d.set(this.d);
    return g;
  }

  /** Обводка в 4-связности вокруг всего непрозрачного (на месте, без расширения) */
  outline(c = 0) {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) >= 0) continue;
        if (this.get(x - 1, y) >= 0 || this.get(x + 1, y) >= 0 || this.get(x, y - 1) >= 0 || this.get(x, y + 1) >= 0) add.push(x, y);
      }
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c);
    return this;
  }

  /** Меняет один цвет на другой (для перекраски) */
  swap(map: Record<number, number>) {
    for (let i = 0; i < this.d.length; i++) {
      const v = this.d[i];
      if (v in map) this.d[i] = map[v];
    }
    return this;
  }

  /** Залить маску с фаской: base, светлый край сверху-слева, тёмный снизу-справа, контур line */
  fill(m: Mask, base: number, hi = -1, lo = -1, line = -1) {
    const ins = (x: number, y: number) => m.has(x, y);
    if (line >= 0)
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++)
          if (!ins(x, y) && (ins(x - 1, y) || ins(x + 1, y) || ins(x, y - 1) || ins(x, y + 1))) this.set(x, y, line);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!ins(x, y)) continue;
        let c = base;
        if (lo >= 0 && (!ins(x + 1, y) || !ins(x, y + 1))) c = lo;
        if (hi >= 0 && (!ins(x - 1, y) || !ins(x, y - 1))) c = hi;
        this.set(x, y, c);
      }
    return this;
  }

  toSprite(): Sprite {
    const c = canvas(this.w, this.h);
    const x = ctx2d(c);
    for (let y = 0; y < this.h; y++)
      for (let i = 0; i < this.w; i++) {
        const v = this.get(i, y);
        if (v < 0) continue;
        x.fillStyle = PAL[v];
        x.fillRect(i, y, 1, 1);
      }
    return c;
  }
}

/** Набор пикселей, собранный из примитивов */
export class Mask {
  readonly d: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.d = new Uint8Array(w * h);
  }
  has(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x] === 1;
  }
  px(x: number, y: number, v = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = v;
    return this;
  }
  rect(x: number, y: number, w: number, h: number, v = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, v);
    return this;
  }
  /** Эллипс по центру (cx, cy) — допускаются полуцелые центры */
  ellipse(cx: number, cy: number, rx: number, ry: number, v = 1) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, v);
      }
    return this;
  }
  /** Выпуклый/невыпуклый многоугольник (even-odd по центрам пикселей) */
  poly(pts: number[], v = 1) {
    const n = pts.length / 2;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.px(x, y, v);
      }
    return this;
  }
  /** Толстая линия (капсула) */
  line(x0: number, y0: number, x1: number, y1: number, t = 1, v = 1) {
    const r = t / 2;
    const minx = Math.floor(Math.min(x0, x1) - r - 1), maxx = Math.ceil(Math.max(x0, x1) + r + 1);
    const miny = Math.floor(Math.min(y0, y1) - r - 1), maxy = Math.ceil(Math.max(y0, y1) + r + 1);
    const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
    for (let y = miny; y <= maxy; y++)
      for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        const k = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L));
        const ex = x0 + dx * k - px, ey = y0 + dy * k - py;
        if (ex * ex + ey * ey <= r * r + 0.01) this.px(x, y, v);
      }
    return this;
  }
  /** Новая маска, отражённая по горизонтали */
  flip(): Mask {
    const m = new Mask(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) m.d[y * this.w + (this.w - 1 - x)] = this.d[y * this.w + x];
    return m;
  }
  /** Объединение с другой маской */
  add(o: Mask) {
    for (let i = 0; i < this.d.length; i++) if (o.d[i]) this.d[i] = 1;
    return this;
  }
  /** Зеркалит маску по горизонтали (добавляет отражение) */
  sym() {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x]) this.d[y * this.w + (this.w - 1 - x)] = 1;
    return this;
  }
}

/** Спрайт из строк с автоматической обводкой цветом 0 */
export function art(rows: string[], outline = true): Sprite {
  const g = Grid.of(rows);
  if (outline) g.outline(0);
  return g.toSprite();
}

/** Собирает кадр из слоёв строк: [rows, x, y][] */
export function layered(w: number, h: number, layers: [string[], number, number][], outline = true): Sprite {
  const g = new Grid(w, h);
  for (const [r, x, y] of layers) g.rows(r, x, y);
  if (outline) g.outline(0);
  return g.toSprite();
}
