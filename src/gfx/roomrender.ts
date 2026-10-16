import { TILE } from '../config';
import type { FloorTheme } from '../content/floors';
import type { RoomMap } from '../world/room';
import { T } from '../world/tiles';
import { C } from './palette';
import { canvas, ctx2d } from './sprite';

/** Рисует статичный слой комнаты (пол, стены, препятствия) в отдельный холст */
export function renderRoomCanvas(room: RoomMap, theme: FloorTheme, cache?: HTMLCanvasElement): HTMLCanvasElement {
  const c = cache ?? canvas(room.pxW, room.pxH);
  const x = ctx2d(c);
  for (let ty = 0; ty < room.th; ty++) {
    for (let tx = 0; tx < room.tw; tx++) drawTile(x, room, theme, tx, ty);
  }
  room.dirty = false;
  return c;
}

/** Перерисовать один тайл (например, после разрушения ящика) */
export function redrawTile(c: HTMLCanvasElement, room: RoomMap, theme: FloorTheme, tx: number, ty: number) {
  drawTile(ctx2d(c), room, theme, tx, ty);
}

function drawTile(x: CanvasRenderingContext2D, room: RoomMap, th: FloorTheme, tx: number, ty: number) {
  const t = room.get(tx, ty);
  const px = tx * TILE, py = ty * TILE;
  const decor = room.decor[ty * room.tw + tx];

  const floor = () => {
    x.fillStyle = ((tx >> 1) + (ty >> 1)) % 2 ? th.floorA : th.floorB;
    x.fillRect(px, py, TILE, TILE);
    x.fillStyle = th.line;
    if (tx % 2 === 0) x.fillRect(px, py, 1, TILE);
    if (ty % 2 === 0) x.fillRect(px, py, TILE, 1);
    switch (decor) {
      case 1: // решётка
        x.fillStyle = th.line;
        for (let i = 3; i < 14; i += 3) x.fillRect(px + 3, py + i, 10, 1);
        break;
      case 2: // трещина
        x.fillStyle = th.line;
        x.fillRect(px + 4, py + 6, 3, 1);
        x.fillRect(px + 7, py + 7, 2, 1);
        x.fillRect(px + 9, py + 8, 3, 1);
        break;
      case 3: // пятно
        x.fillStyle = C.blood;
        x.globalAlpha = 0.5;
        x.fillRect(px + 5, py + 5, 5, 4);
        x.fillRect(px + 4, py + 6, 7, 2);
        x.globalAlpha = 1;
        break;
      case 4: // болты
        x.fillStyle = C.metal;
        x.fillRect(px + 2, py + 2, 1, 1);
        x.fillRect(px + 13, py + 2, 1, 1);
        x.fillRect(px + 2, py + 13, 1, 1);
        x.fillRect(px + 13, py + 13, 1, 1);
        break;
      case 5: // кабель
        x.fillStyle = C.black;
        x.fillRect(px, py + 9, 6, 1);
        x.fillRect(px + 6, py + 10, 5, 1);
        x.fillRect(px + 11, py + 9, 5, 1);
        break;
      case 6: // разметка
        x.fillStyle = th.accent;
        x.globalAlpha = 0.25;
        x.fillRect(px + 1, py + 7, 14, 2);
        x.globalAlpha = 1;
        break;
      case 7: // лужа
        x.fillStyle = '#0a0a10';
        x.fillRect(px + 3, py + 4, 9, 6);
        x.fillRect(px + 5, py + 3, 5, 8);
        x.fillStyle = C.metal;
        x.fillRect(px + 5, py + 5, 2, 1);
        break;
    }
  };

  switch (t) {
    case T.Floor:
    case T.Door:
      floor();
      if (t === T.Door) {
        x.fillStyle = C.void;
        x.fillRect(px, py, TILE, TILE);
      }
      break;
    case T.Wall: {
      x.fillStyle = th.wall;
      x.fillRect(px, py, TILE, TILE);
      x.fillStyle = th.line;
      x.fillRect(px, py + (tx % 3 === 0 ? 7 : 11), TILE, 1);
      // внутренняя кромка стены, обращённая к полу
      const inner = (dx: number, dy: number) => {
        const n = room.get(tx + dx, ty + dy);
        return n !== T.Wall && room.inside(tx + dx, ty + dy);
      };
      x.fillStyle = th.wallTop;
      if (inner(0, 1)) x.fillRect(px, py + TILE - 4, TILE, 4);
      if (inner(0, -1)) x.fillRect(px, py, TILE, 2);
      if (inner(1, 0)) x.fillRect(px + TILE - 2, py, 2, TILE);
      if (inner(-1, 0)) x.fillRect(px, py, 2, TILE);
      if (inner(0, 1) && tx % 7 === 3) {
        // лампа на стене
        x.fillStyle = th.accent;
        x.fillRect(px + 6, py + TILE - 6, 4, 2);
      }
      break;
    }
    case T.Pit:
    case T.Bridge: {
      x.fillStyle = C.void;
      x.fillRect(px, py, TILE, TILE);
      const above = room.get(tx, ty - 1);
      if (above !== T.Pit && above !== T.Bridge) {
        x.fillStyle = th.line;
        x.fillRect(px, py, TILE, 3);
        x.fillStyle = '#08080b';
        x.fillRect(px, py + 3, TILE, 3);
      }
      if (t === T.Bridge) {
        x.fillStyle = C.metal;
        x.fillRect(px + 1, py, TILE - 2, TILE);
        x.fillStyle = C.dark;
        for (let i = 1; i < TILE; i += 3) x.fillRect(px + 1, py + i, TILE - 2, 1);
        x.fillStyle = th.accent;
        x.fillRect(px + 1, py, 1, TILE);
        x.fillRect(px + TILE - 2, py, 1, TILE);
      }
      break;
    }
    case T.Block:
      floor();
      x.fillStyle = C.black;
      x.fillRect(px + 1, py + 3, 14, 13);
      x.fillStyle = C.steel;
      x.fillRect(px + 1, py + 1, 14, 11);
      x.fillStyle = C.steelL;
      x.fillRect(px + 1, py + 1, 14, 2);
      x.fillStyle = C.metal;
      x.fillRect(px + 1, py + 9, 14, 3);
      x.fillStyle = C.dark;
      x.fillRect(px + 3, py + 5, 2, 2);
      x.fillRect(px + 11, py + 5, 2, 2);
      break;
    case T.Crate: {
      floor();
      const rack = (tx * 7 + ty * 3) % 2 === 0;
      x.fillStyle = C.void;
      x.fillRect(px + 1, py + 3, 14, 13);
      if (rack) {
        // серверная стойка
        x.fillStyle = C.dark;
        x.fillRect(px + 2, py + 1, 12, 13);
        x.fillStyle = C.metal;
        x.fillRect(px + 2, py + 1, 12, 1);
        for (let i = 3; i < 13; i += 3) {
          x.fillStyle = C.black;
          x.fillRect(px + 3, py + i, 10, 2);
          x.fillStyle = (tx + ty + i) % 4 === 0 ? C.red : C.amberD;
          x.fillRect(px + 11, py + i, 1, 1);
        }
      } else {
        // ящик
        x.fillStyle = C.amberD;
        x.fillRect(px + 2, py + 2, 12, 12);
        x.fillStyle = '#6b4510';
        x.fillRect(px + 2, py + 2, 12, 2);
        x.fillStyle = C.black;
        x.fillRect(px + 2, py + 7, 12, 1);
        x.fillRect(px + 7, py + 2, 1, 12);
      }
      break;
    }
    case T.Electro:
      floor();
      x.fillStyle = C.dark;
      x.fillRect(px + 1, py + 1, 14, 14);
      x.fillStyle = C.black;
      for (let i = 3; i < 14; i += 4) x.fillRect(px + 2, py + i, 12, 1);
      // жёлто-чёрная окантовка
      for (let i = 0; i < 16; i += 4) {
        x.fillStyle = C.amberD;
        x.fillRect(px + i, py, 2, 1);
        x.fillRect(px + i, py + 15, 2, 1);
      }
      break;
  }
}
