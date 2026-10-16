import { TILE } from '../config';
import type { FloorTheme, Tier } from '../content/floors';
import type { RoomMap } from '../world/room';
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

/** Рисует статичный слой комнаты (пол, стены, препятствия) в отдельный холст */
export function renderRoomCanvas(room: RoomMap, theme: FloorTheme, cache?: HTMLCanvasElement): HTMLCanvasElement {
  const c = cache ?? canvas(room.pxW, room.pxH);
  const x = ctx2d(c);
  x.globalAlpha = 1;
  x.clearRect(0, 0, c.width, c.height);
  for (let ty = 0; ty < room.th; ty++) {
    for (let tx = 0; tx < room.tw; tx++) drawTile(x, room, theme, tx, ty);
  }
  room.dirty = false;
  return c;
}

/**
 * Перерисовать тайл (например, после разрушения ящика). Каждый тайл рисуется только в своих
 * границах, но учитывает соседей (тени, кромки), поэтому обновляем и окрестность 3×3.
 */
export function redrawTile(c: HTMLCanvasElement, room: RoomMap, theme: FloorTheme, tx: number, ty: number) {
  const x = ctx2d(c);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (room.inside(tx + dx, ty + dy)) drawTile(x, room, theme, tx + dx, ty + dy);
    }
  }
}

function drawTile(x: CanvasRenderingContext2D, room: RoomMap, th: FloorTheme, tx: number, ty: number) {
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
      // проём двери: сама дверь рисуется динамически
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
function bridgeHorizontal(room: RoomMap, tx: number, ty: number): boolean {
  const run = (dx: number, dy: number) => {
    let k = 0;
    while (k < 40 && room.get(tx + dx * (k + 1), ty + dy * (k + 1)) === T.Bridge) k++;
    return k;
  };
  const h = run(1, 0) + run(-1, 0), v = run(0, 1) + run(0, -1);
  if (h !== v) return h > v;
  return room.get(tx, ty - 1) === T.Pit || room.get(tx, ty + 1) === T.Pit;
}
