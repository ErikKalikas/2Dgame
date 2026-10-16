// Жилые соты: тесный бетон, стёртая плитка, двери капсул, вентиляция, кабели, метки-каракули,
// маленькие красные окна и изредка фиолетовая вывеска.
import { C } from '../palette';
import { blob, blockShape, capEdges, crack, dropShadow, pitBase, type TierPainter } from './common';
import { FX, SIDE } from './layout';
import { D, R, hash, isPit, nb, ph, pr, rnd, speckle, stain, vnoise, type P } from './util';

function floor(p: P) {
  const th = p.th;
  if (p.v === 0) {
    // стёртая плитка 8×8
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const sx = p.tx * 2 + i, sy = p.ty * 2 + j;
        const r = rnd(sx, sy, p.s + 1);
        const x = i * 8, y = j * 8;
        if (r < 0.03) {
          // выбитая плитка
          R(p, x, y, 8, 8, C.black);
          R(p, x + 1, y + 1, 6, 6, th.line);
          D(p, x + 2 + (hash(sx, sy, 2) % 4), y + 3, th.floorA);
          continue;
        }
        R(p, x, y, 8, 8, r < 0.45 ? th.floorA : r < 0.9 ? th.floorB : th.floorHi);
        R(p, x, y, 8, 1, th.line);
        R(p, x, y, 1, 8, th.line);
        R(p, x + 1, y + 1, 6, 1, th.floorHi, 0.5);
        if (r > 0.96) for (let k = 0; k < 5; k++) D(p, x + 1 + k, y + 1 + k, th.line);
      }
    }
    stain(p, 16, 0.58, C.void, 0.3, 3);
  } else {
    // рынок: бетон, коврики-брезент, мусор
    const n = vnoise(p.tx / 3, p.ty / 3, p.s + 4);
    R(p, 0, 0, 16, 16, n > 0.5 ? th.floorB : th.floorA);
    speckle(p, 8, th.line, 0.8, 5);
    if ((p.ty % 3) === 0) R(p, 0, 0, 16, 1, th.line);
    stain(p, 14, 0.6, C.void, 0.28, 3);
    mat(p);
    if (pr(p, 7) < 0.3) speckle(p, 3, pr(p, 8) < 0.5 ? C.steel : C.amberD, 0.5, 9);
  }
}

/** Брезентовые подстилки торговцев: прямоугольники по зонам 7×5 тайлов */
function mat(p: P) {
  const zx = Math.floor(p.tx / 7), zy = Math.floor(p.ty / 5);
  if (rnd(zx, zy, p.s + 70) > 0.45) return;
  const h = hash(zx, zy, p.s + 71);
  const mx = zx * 7 + 1 + (h % 2), my = zy * 5 + 1 + ((h >>> 3) % 2);
  const mw = 3 + ((h >>> 6) % 3), mh = 2 + ((h >>> 9) % 2);
  if (p.tx < mx || p.ty < my || p.tx >= mx + mw || p.ty >= my + mh) return;
  const red = (h >>> 12) % 3 !== 0;
  const base = red ? C.blood : C.metal, edge = red ? C.redD : C.steel;
  R(p, 0, 0, 16, 16, base, red ? 0.32 : 0.3);
  for (let y = 1; y < 16; y += 3) R(p, 0, y, 16, 1, edge, 0.1);
  if (p.ty === my) R(p, 0, 0, 16, 1, edge, 0.35);
  if (p.ty === my + mh - 1) {
    R(p, 0, 15, 16, 1, C.void, 0.5);
    for (let x = 1; x < 16; x += 3) D(p, x, 15, edge, 0.5); // бахрома
  }
  if (p.tx === mx) R(p, 0, 0, 1, 16, edge, 0.3);
  if (p.tx === mx + mw - 1) R(p, 15, 0, 1, 16, C.void, 0.4);
}

function decal(p: P) {
  const th = p.th;
  switch (p.decor) {
    case 1: // вентиляционная решётка в полу
      R(p, 3, 3, 10, 10, C.black);
      for (let x = 4; x < 13; x += 2) R(p, x, 4, 1, 8, th.floorHi);
      R(p, 3, 3, 10, 1, C.metal, 0.5);
      break;
    case 2:
      crack(p, C.void, 20);
      crack(p, th.line, 21);
      break;
    case 3:
      blob(p, 8, 8, 4, 3, C.blood, 0.45);
      D(p, 12, 11, C.blood, 0.5);
      break;
    case 4: // мусор
      R(p, 3, 9, 3, 2, C.grey, 0.25);
      R(p, 9, 4, 2, 3, C.redD, 0.6);
      D(p, 12, 12, C.amberD);
      R(p, 6, 12, 2, 1, C.steel, 0.5);
      break;
    case 5: { // кабели по полу
      const y = 4 + (ph(p, 22) % 7);
      for (let k = 0; k < 16; k++) {
        D(p, k, y + ((k >> 2) & 1), C.black);
        D(p, k, y + 3 - ((k >> 3) & 1), C.dark);
      }
      break;
    }
    case 6: { // метки-каракули (не буквы)
      const col = pr(p, 23) < 0.15 ? C.violet : C.redD;
      const a = col === C.violet ? 0.45 : 0.6;
      for (let k = 0; k < 9; k++) D(p, 3 + k, 7 + (k % 3 === 1 ? -2 : k % 3 === 2 ? 1 : 0), col, a);
      for (let k = 0; k < 4; k++) D(p, 5 + k, 11, col, a);
      D(p, 4, 10, col, a);
      break;
    }
    case 7:
      blob(p, 8, 8, 6, 4, C.void, 0.5);
      R(p, 5, 6, 3, 1, C.steel, 0.3);
      break;
  }
}

function cap(p: P, side: number) {
  const th = p.th;
  R(p, 0, 0, 16, 16, th.wallTop);
  speckle(p, 8, th.wall, 1, 30);
  speckle(p, 3, C.steel, 0.3, 31);
  capEdges(p, side, C.steelL, 0.3);
  // жгут кабелей вдоль кромки
  if (side === SIDE.Left) R(p, 11, 0, 1, 16, C.black);
  else if (side === SIDE.Right) R(p, 4, 0, 1, 16, C.black);
  else if (side === SIDE.Bottom) R(p, 0, 3, 16, 1, C.black);
}

function face(p: P, fix: number) {
  const th = p.th;
  R(p, 0, 4, 16, 12, th.face);
  // бетонные блоки
  for (let r = 0; r < 3; r++) {
    const y = 4 + r * 4;
    R(p, 0, y, 16, 1, th.faceD);
    const off = ((p.tx + r) & 1) * 8;
    R(p, off, y, 1, 4, th.faceD);
    R(p, off + 1, y + 1, 7, 1, th.wallTop, 0.25);
  }
  const stain = vnoise(p.tx / 2, 0.5, p.s + 32);
  if (stain > 0.5) for (let y = 5; y < 15; y++) D(p, ph(p, 33) % 16, y, C.void, 0.3);
  R(p, 0, 14, 16, 2, C.void, 0.4);
  // каракули на стене
  if (fix === FX.None && pr(p, 34) < 0.45) {
    const col = pr(p, 35) < 0.12 ? C.violet : C.redD;
    const y = 7 + (ph(p, 36) % 4);
    for (let k = 0; k < 10; k++) D(p, 3 + k, y + ((k * 7) % 3) - 1, col, 0.55);
    if (pr(p, 37) < 0.5) for (let k = 0; k < 4; k++) D(p, 5 + k, y + 3, col, 0.45);
  }
  // кабели сверху
  if (hash(p.tx >> 1, 2, p.s + 38) % 2 === 0) {
    R(p, 0, 5, 16, 1, C.black);
    if (p.tx & 1) for (let y = 6; y < 11; y++) D(p, 13, y, C.black);
  }
  switch (fix) {
    case FX.Lamp: // трубка дневного света
      R(p, 2, 6, 12, 4, C.black);
      R(p, 3, 7, 10, 2, C.grey);
      R(p, 4, 7, 8, 1, C.bone);
      break;
    case FX.Emit: // маленькое окно (загорается в ambient)
      R(p, 4, 5, 8, 6, C.black);
      R(p, 5, 5, 6, 1, C.metal);
      R(p, 6, 6, 4, 3, C.blood);
      R(p, 8, 6, 1, 3, C.black, 0.6);
      R(p, 4, 11, 8, 1, C.metal);
      break;
    case FX.DetA: // дверь капсулы
      R(p, 1, 5, 10, 11, C.black);
      R(p, 2, 6, 8, 10, C.metal);
      R(p, 3, 7, 6, 8, C.dark);
      R(p, 3, 7, 6, 1, C.steel, 0.5);
      D(p, 2, 6, C.black);
      D(p, 9, 6, C.black);
      R(p, 8, 10, 1, 2, C.steel);
      R(p, 11, 6, 3, 3, C.black);
      break;
    case FX.DetB: // вентилятор
      R(p, 3, 6, 10, 9, C.black);
      R(p, 4, 7, 8, 7, C.dark);
      R(p, 7, 7, 2, 7, C.metal);
      R(p, 4, 10, 8, 1, C.metal);
      D(p, 7, 10, C.steel);
      break;
    case FX.Sign: // вывеска: только штрихи, без текста
      R(p, 1, 6, 14, 7, C.black);
      R(p, 2, 7, 12, 5, C.blood, 0.6);
      R(p, 3, 8, 4, 1, C.violet);
      R(p, 8, 8, 5, 1, C.violet);
      R(p, 3, 10, 7, 1, C.violet);
      R(p, 11, 10, 2, 1, C.violet, 0.7);
      R(p, 7, 4, 1, 2, C.metal);
      break;
  }
}

function pit(p: P) {
  const th = p.th;
  pitBase(p, [th.floorHi, th.wallTop, th.face, th.faceD, th.faceD, C.black, C.black], th.floorHi, th.floorHi);
  if (!isPit(nb(p, 0, -1))) R(p, 0, 3, 16, 1, C.black, 0.5);
  if (!isPit(nb(p, 0, -1))) {
    // рваная кромка и торчащая арматура
    for (let x = 0; x < 16; x += 2) if (rnd(p.px + x, p.py, p.s) < 0.4) R(p, x, 0, 2, 2, th.floorB);
    if (pr(p, 40) < 0.5) {
      const x = 2 + (ph(p, 41) % 11);
      R(p, x, 1, 1, 4, C.amberD);
      D(p, x, 5, C.redD);
    }
  }
}

function bridge(p: P) {
  R(p, 1, 0, 14, 16, C.black);
  R(p, 2, 0, 12, 16, C.metal);
  for (let y = 3; y < 16; y += 5) R(p, 2, y, 12, 1, C.dark);
  speckle(p, 4, C.steel, 0.4, 45, 2, 0, 12, 16);
  R(p, 1, 0, 1, 16, C.steel);
  R(p, 14, 0, 1, 16, C.steel);
  if ((p.ty & 1) === 0) {
    R(p, 0, 6, 2, 3, C.steelL, 0.7);
    R(p, 14, 6, 2, 3, C.steelL, 0.7);
  }
}

function block(p: P) {
  const g = blockShape(p, p.th.wallTop, C.steel, p.th.face, C.black);
  speckle(p, 6, p.th.wall, 0.9, 50, g.x0, g.y0, g.x1 - g.x0, g.yf - g.y0);
  speckle(p, 3, C.steel, 0.4, 53, g.x0, g.y0, g.x1 - g.x0, g.yf - g.y0);
  // сколы бетона
  if (!g.nN && !g.nW) D(p, g.x0, g.y0, C.black);
  if (!g.nN && !g.nE) D(p, g.x1 - 1, g.y0, C.black);
  if (!g.nS) {
    // обрывки листовок на фасаде колонны
    if (pr(p, 51) < 0.5) R(p, g.x0 + 3, g.yf + 1, 4, 3, C.redD, 0.6);
    R(p, g.x0, g.yf + 1, g.x1 - g.x0, 1, C.black, 0.4);
  }
  if (pr(p, 52) < 0.3) R(p, g.x0 + 1, g.y0 + 4, g.x1 - g.x0 - 2, 1, C.black, 0.7);
}

function crate(p: P) {
  dropShadow(p);
  const r = pr(p, 55);
  if (r < 0.45) {
    // стопка коробок
    R(p, 2, 6, 12, 9, C.black);
    R(p, 3, 7, 10, 7, C.amberD);
    R(p, 3, 7, 10, 1, C.amber, 0.5);
    R(p, 7, 7, 2, 7, C.amber, 0.35);
    R(p, 4, 2, 8, 5, C.black);
    R(p, 5, 3, 6, 4, C.amberD);
    R(p, 5, 3, 6, 1, C.amber, 0.5);
    R(p, 7, 3, 2, 4, C.amber, 0.3);
  } else if (r < 0.8) {
    // пластиковый ящик с товаром
    R(p, 2, 4, 12, 11, C.black);
    R(p, 3, 5, 10, 9, C.redD);
    R(p, 3, 5, 10, 1, C.red, 0.5);
    for (let x = 4; x < 12; x += 2) R(p, x, 8, 1, 4, C.blood);
    R(p, 4, 3, 3, 2, C.amberD);
    R(p, 8, 2, 3, 3, C.steel);
  } else {
    // мешки
    R(p, 2, 6, 12, 9, C.black);
    R(p, 3, 7, 5, 7, C.amberD);
    R(p, 8, 8, 5, 6, C.amberD);
    R(p, 4, 7, 3, 1, C.amber, 0.5);
    R(p, 9, 8, 3, 1, C.amber, 0.5);
    R(p, 7, 9, 1, 5, C.black, 0.6);
  }
}

export const HAB: TierPainter = { floor, decal, cap, face, pit, bridge, block, crate, lampCols: [C.metal, C.grey, C.bone] };
