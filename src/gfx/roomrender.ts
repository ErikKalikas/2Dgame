import { TILE } from '../config';
import type { FloorTheme, Tier } from '../content/floors';
import type { LevelMap } from '../world/level';
import { T } from '../world/tiles';
import { ao, electro, sideLamp, type TierPainter } from './env/common';
import { FOUNDRY } from './env/foundry';
import { HAB } from './env/hab';
import { FX, SIDE, envLayout } from './env/layout';
import { SPIRE } from './env/spire';
import { SUMP } from './env/sump';
import { TRANSIT } from './env/transit';
import { makeP } from './env/util';
import { C } from './palette';
import { canvas, ctx2d } from './sprite';

const PAINTERS: Record<Tier, TierPainter> = { sump: SUMP, foundry: FOUNDRY, hab: HAB, transit: TRANSIT, spire: SPIRE };

/** Сторона куска статичного слоя (тайлы) */
const CHUNK = 32;
const CHUNK_PX = CHUNK * TILE;

/**
 * Статичный слой уровня (пол, стены, препятствия), нарезанный на куски 32×32 тайла.
 * Куски строятся лениво при первом показе и заранее в свободное время кадра (prerender),
 * пустые куски (только пустота) не создаются. Один холст на весь уровень Магистралей весил бы ~60 МБ.
 */
export class LevelCanvas {
  readonly cols: number;
  readonly rows: number;
  private chunks: (HTMLCanvasElement | null)[];
  /** Кусок без единого тайла, кроме пустоты */
  private empty: Uint8Array;
  private next = 0;

  constructor(private map: LevelMap, private theme: FloorTheme) {
    this.cols = Math.ceil(map.tw / CHUNK);
    this.rows = Math.ceil(map.th / CHUNK);
    this.chunks = new Array(this.cols * this.rows).fill(null);
    this.empty = new Uint8Array(this.cols * this.rows).fill(1);
    for (let ty = 0; ty < map.th; ty++) {
      for (let tx = 0; tx < map.tw; tx++) {
        if (map.tiles[ty * map.tw + tx] !== T.Void) this.empty[Math.floor(ty / CHUNK) * this.cols + Math.floor(tx / CHUNK)] = 0;
      }
    }
  }

  private chunk(i: number): HTMLCanvasElement {
    let c = this.chunks[i];
    if (c) return c;
    c = canvas(CHUNK_PX, CHUNK_PX);
    const x = ctx2d(c);
    const ox = (i % this.cols) * CHUNK, oy = Math.floor(i / this.cols) * CHUNK;
    x.translate(-ox * TILE, -oy * TILE);
    const { map, theme } = this;
    for (let ty = oy; ty < Math.min(map.th, oy + CHUNK); ty++) {
      for (let tx = ox; tx < Math.min(map.tw, ox + CHUNK); tx++) drawTile(x, map, theme, tx, ty);
    }
    this.chunks[i] = c;
    return c;
  }

  /** Нарисовать видимую часть уровня; (cx, cy) — камера */
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
    const c0 = Math.max(0, Math.floor(cx / CHUNK_PX)), c1 = Math.min(this.cols - 1, Math.floor((cx + w) / CHUNK_PX));
    const r0 = Math.max(0, Math.floor(cy / CHUNK_PX)), r1 = Math.min(this.rows - 1, Math.floor((cy + h) / CHUNK_PX));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * this.cols + c;
        if (!this.empty[i]) ctx.drawImage(this.chunk(i), c * CHUNK_PX - cx, r * CHUNK_PX - cy);
      }
    }
  }

  /** Построить заранее несколько кусков, пока не истечёт budget мс (вызывается каждый кадр) */
  prerender(budget: number) {
    const t0 = performance.now();
    while (this.next < this.chunks.length && performance.now() - t0 < budget) {
      const i = this.next++;
      if (!this.empty[i]) this.chunk(i);
    }
  }

  /**
   * Перерисовать тайл (например, после разрушения ящика). Каждый тайл рисуется только в своих
   * границах, но учитывает соседей (тени, кромки), поэтому обновляем и окрестность 3×3.
   */
  redrawTile(tx: number, ty: number) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, y = ty + dy;
        if (!this.map.inside(x, y)) continue;
        const i = Math.floor(y / CHUNK) * this.cols + Math.floor(x / CHUNK);
        const c = this.chunks[i];
        if (!c) continue;
        const ctx = ctx2d(c);
        ctx.save();
        ctx.translate(-(i % this.cols) * CHUNK_PX, -Math.floor(i / this.cols) * CHUNK_PX);
        drawTile(ctx, this.map, this.theme, x, y);
        ctx.restore();
      }
    }
  }
}

function drawTile(x: CanvasRenderingContext2D, room: LevelMap, th: FloorTheme, tx: number, ty: number) {
  const t = room.get(tx, ty);
  const pt = PAINTERS[th.tier];
  const p = makeP(x, room, th, tx, ty);
  x.globalAlpha = 1;
  const floor = () => {
    pt.floor(p);
    if (p.decor) pt.decal(p);
    ao(p);
  };

  switch (t) {
    case T.Floor:
      floor();
      break;
    case T.Door:
      // проём двери — пол; закрытые створки рисуются динамически (render.ts)
      floor();
      break;
    case T.Void:
      x.fillStyle = C.void;
      x.fillRect(p.px, p.py, TILE, TILE);
      break;
    case T.Wall: {
      const L = envLayout(room, th);
      const i = ty * room.tw + tx;
      const side = L.side[i], fix = L.fix[i];
      pt.cap(p, side);
      if (side === SIDE.Face) pt.face(p, fix);
      else if (fix === FX.Lamp) sideLamp(p, side, ...pt.lampCols);
      break;
    }
    case T.Pit:
      pt.pit(p);
      break;
    case T.Bridge: {
      pt.pit(p);
      // мостик идёт вдоль соседних мостиков/пола; поперечный — поворачиваем на 90°
      const horiz = bridgeHorizontal(room, tx, ty);
      if (horiz) {
        x.save();
        x.translate(p.px + TILE / 2, p.py + TILE / 2);
        x.rotate(Math.PI / 2);
        x.translate(-p.px - TILE / 2, -p.py - TILE / 2);
      }
      pt.bridge(p);
      if (horiz) x.restore();
      break;
    }
    case T.Block:
      floor();
      pt.block(p);
      break;
    case T.Crate:
      floor();
      pt.crate(p);
      break;
    case T.Electro:
      pt.floor(p);
      electro(p, th.tier === 'spire' ? C.metal : C.dark);
      break;
  }
  x.globalAlpha = 1;
}

/** Мостик поперечный, если его горизонтальный пролёт длиннее вертикального */
function bridgeHorizontal(room: LevelMap, tx: number, ty: number): boolean {
  const run = (dx: number, dy: number) => {
    let k = 0;
    while (k < 40 && room.get(tx + dx * (k + 1), ty + dy * (k + 1)) === T.Bridge) k++;
    return k;
  };
  const h = run(1, 0) + run(-1, 0), v = run(0, 1) + run(0, -1);
  if (h !== v) return h > v;
  return room.get(tx, ty - 1) === T.Pit || room.get(tx, ty + 1) === T.Pit;
}
