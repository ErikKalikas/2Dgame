import { FONT, VIEW_H, VIEW_W } from '../config';
import { C } from './palette';
import { canvas, ctx2d, type Sprite } from './sprite';

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  shadow?: string | null;
  alpha?: number;
}

/**
 * Мир рисуется в низком разрешении (VIEW_W×VIEW_H) и масштабируется на экран.
 * Интерфейс рисуется прямо на экранном холсте в тех же виртуальных координатах,
 * но текст при этом остаётся чётким.
 */
export class Renderer {
  readonly screen: HTMLCanvasElement;
  readonly sctx: CanvasRenderingContext2D;
  readonly world: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  scale = 1;
  offX = 0;
  offY = 0;

  constructor(screen: HTMLCanvasElement) {
    this.screen = screen;
    this.sctx = screen.getContext('2d')!;
    this.world = canvas(VIEW_W, VIEW_H);
    this.ctx = ctx2d(this.world);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    this.screen.width = w;
    this.screen.height = h;
    let s = Math.min(w / VIEW_W, h / VIEW_H);
    // целочисленный масштаб, если он не слишком уменьшает картинку — так пиксели ровнее
    if (s >= 2 && Math.floor(s) / s > 0.85) s = Math.floor(s);
    this.scale = s;
    this.offX = Math.floor((w - VIEW_W * s) / 2);
    this.offY = Math.floor((h - VIEW_H * s) / 2);
    this.sctx.imageSmoothingEnabled = false;
  }

  beginFrame() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = C.void;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /** Перенос мира на экран и подготовка к рисованию интерфейса */
  present() {
    const s = this.sctx;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.fillStyle = '#000';
    s.fillRect(0, 0, this.screen.width, this.screen.height);
    s.imageSmoothingEnabled = false;
    s.drawImage(this.world, this.offX, this.offY, VIEW_W * this.scale, VIEW_H * this.scale);
    s.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
    s.globalAlpha = 1;
  }

  // ---------- интерфейс (виртуальные координаты на экранном холсте) ----------

  text(str: string, x: number, y: number, o: TextOpts = {}) {
    const s = this.sctx;
    const size = o.size ?? 8;
    s.font = `${size}px ${FONT}`;
    s.textAlign = o.align ?? 'left';
    s.textBaseline = 'top';
    s.globalAlpha = o.alpha ?? 1;
    if (o.shadow !== null) {
      s.fillStyle = o.shadow ?? C.void;
      s.fillText(str, x + size / 8, y + size / 8);
    }
    s.fillStyle = o.color ?? C.bone;
    s.fillText(str, x, y);
    s.globalAlpha = 1;
  }

  textWidth(str: string, size = 8): number {
    this.sctx.font = `${size}px ${FONT}`;
    return this.sctx.measureText(str).width;
  }

  /** Перенос строки по ширине; возвращает массив строк */
  wrap(str: string, maxW: number, size = 8): string[] {
    const out: string[] = [];
    for (const para of str.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (this.textWidth(test, size) > maxW && line) {
          out.push(line);
          line = word;
        } else line = test;
      }
      out.push(line);
    }
    return out;
  }

  rect(x: number, y: number, w: number, h: number, color: string, alpha = 1) {
    const s = this.sctx;
    s.globalAlpha = alpha;
    s.fillStyle = color;
    s.fillRect(x, y, w, h);
    s.globalAlpha = 1;
  }

  frame(x: number, y: number, w: number, h: number, color: string, lw = 1) {
    const s = this.sctx;
    s.strokeStyle = color;
    s.lineWidth = lw;
    s.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  }

  /** Панель в стиле интерфейса: тёмный фон, рамка и уголки */
  panel(x: number, y: number, w: number, h: number, accent: string = C.redD, alpha = 0.92) {
    this.rect(x, y, w, h, C.black, alpha);
    this.frame(x, y, w, h, C.metal);
    const k = 4;
    this.rect(x, y, k, 1, accent);
    this.rect(x, y, 1, k, accent);
    this.rect(x + w - k, y + h - 1, k, 1, accent);
    this.rect(x + w - 1, y + h - k, 1, k, accent);
  }

  sprite(img: Sprite, x: number, y: number, scale = 1, alpha = 1) {
    const s = this.sctx;
    s.globalAlpha = alpha;
    s.drawImage(img, Math.round(x), Math.round(y), img.width * scale, img.height * scale);
    s.globalAlpha = 1;
  }
}
