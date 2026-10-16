// Магистрали: рельсы и шпалы, края платформ с предупреждающими полосами, светофоры,
// тёмные тоннельные стены с рёбрами. Вариант 1 (Лифтовые шахты): решётчатый настил и направляющие.
import { C } from '../palette';
import { blob, blockShape, capEdges, crack, dropShadow, pitBase, type TierPainter } from './common';
import { FX, SIDE, trackAt } from './layout';
import { D, R, hazard, isPit, nb, ph, pr, speckle, vnoise, type P } from './util';

/** Рисует путь (шпалы + рельс) на тайле; part 1/2 — первая/вторая колея */
function track(p: P, part: number, vertical: boolean) {
  const th = p.th;
  const rect = (a: number, b: number, w: number, h: number, c: string, al = 1) =>
    vertical ? R(p, b, a, h, w, c, al) : R(p, a, b, w, h, c, al);
  // балласт
  const b0 = part === 1 ? 3 : 0, b1 = part === 1 ? 16 : 13;
  rect(0, b0, 16, b1 - b0, th.line);
  for (let i = 0; i < 10; i++) {
    const h = ph(p, 80 + i);
    rect(h % 16, b0 + ((h >>> 5) % (b1 - b0)), 1, 1, i % 3 ? th.floorHi : C.dark, 0.8);
  }
  // шпалы
  const base = vertical ? p.py : p.px;
  for (let k = 0; k < 16; k++) {
    if ((base + k) % 6 < 3) rect(k, b0 + 1, 1, b1 - b0 - 1, (base + k) % 6 === 0 ? th.wallTop : th.wall);
  }
  // рельс
  const r = part === 1 ? 7 : 8;
  rect(0, r + 1, 16, 1, C.black);
  rect(0, r - 1, 16, 2, C.steel);
  rect(0, r - 1, 16, 1, C.grey, 0.45);
}

function floor(p: P) {
  const th = p.th;
  const vertical = p.v === 1;
  const n = vnoise(p.tx / 3, p.ty / 3, p.s + 3);
  R(p, 0, 0, 16, 16, n > 0.5 ? th.floorB : th.floorA);
  if (p.v === 0) {
    // бетонные плиты платформы
    if ((p.tx & 1) === 0) R(p, 0, 0, 1, 16, th.line);
    if ((p.ty & 1) === 0) R(p, 0, 0, 16, 1, th.line);
    R(p, 1, 1, 15, 1, th.floorHi, 0.4);
    speckle(p, 6, th.line, 0.8, 4);
  } else {
    // решётчатый настил шахт
    R(p, 0, 0, 16, 1, th.line);
    R(p, 0, 0, 1, 16, th.line);
    for (let y = 2; y < 15; y += 4) for (let x = 2; x < 15; x += 4) R(p, x, y, 2, 2, C.black, 0.85);
    R(p, 1, 1, 15, 1, th.floorHi, 0.6);
  }
  const part = trackAt(p.room, th, p.tx, p.ty);
  if (part) {
    track(p, part, vertical);
    return;
  }
  // край платформы у пути
  if (!vertical) {
    if (trackAt(p.room, th, p.tx, p.ty + 1) === 1) {
      hazard(p, 0, 12, 16, 3, 0.55);
      R(p, 0, 15, 16, 1, C.black);
    }
    if (trackAt(p.room, th, p.tx, p.ty - 1) === 2) {
      R(p, 0, 0, 16, 1, C.black);
      hazard(p, 0, 1, 16, 3, 0.55);
    }
  } else {
    // направляющие шахт: стальной бортик с тонкой жёлтой линией
    if (trackAt(p.room, th, p.tx + 1, p.ty) === 1) {
      R(p, 13, 0, 2, 16, C.metal);
      R(p, 12, 0, 1, 16, C.amber, 0.35);
      R(p, 15, 0, 1, 16, C.black);
    }
    if (trackAt(p.room, th, p.tx - 1, p.ty) === 2) {
      R(p, 0, 0, 1, 16, C.black);
      R(p, 1, 0, 2, 16, C.metal);
      R(p, 3, 0, 1, 16, C.amber, 0.35);
    }
  }
  // края провалов (шахты) — тоже под полосой
  if (isPit(nb(p, 0, 1))) hazard(p, 0, 13, 16, 3, 0.4);
  if (isPit(nb(p, 0, -1))) hazard(p, 0, 0, 16, 3, 0.4);
}

function decal(p: P) {
  const th = p.th;
  if (trackAt(p.room, th, p.tx, p.ty)) return;
  switch (p.decor) {
    case 1:
      R(p, 3, 4, 10, 8, C.black);
      for (let y = 5; y < 12; y += 2) R(p, 4, y, 8, 1, th.floorHi);
      break;
    case 2:
      crack(p, C.void, 60);
      break;
    case 3:
      blob(p, 8, 8, 5, 3, C.void, 0.4);
      D(p, 6, 7, C.steel, 0.3);
      break;
    case 4:
      for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) D(p, x, y, C.metal);
      R(p, 4, 4, 8, 8, th.floorHi, 0.4);
      break;
    case 5: {
      const y = 4 + (ph(p, 61) % 8);
      R(p, 0, y, 16, 1, C.black);
      R(p, 0, y + 1, 16, 1, C.dark);
      break;
    }
    case 6: // шеврон-указатель
      for (let k = 0; k < 4; k++) {
        R(p, 4 + k, 4 + k, 2, 1, C.amber, 0.22);
        R(p, 4 + k, 11 - k, 2, 1, C.amber, 0.22);
        R(p, 8 + k, 4 + k, 2, 1, C.amber, 0.14);
        R(p, 8 + k, 11 - k, 2, 1, C.amber, 0.14);
      }
      break;
    case 7:
      blob(p, 8, 8, 6, 4, C.void, 0.5);
      R(p, 6, 6, 3, 1, C.steel, 0.3);
      break;
  }
}

function cap(p: P, side: number) {
  const th = p.th;
  R(p, 0, 0, 16, 16, th.wallTop);
  R(p, 0, 0, 1, 16, th.wall);
  speckle(p, 6, th.wall, 1, 70);
  capEdges(p, side, C.steel, 0.35);
  // жёлтая кромка безопасности
  if (side === SIDE.Left) R(p, 12, 0, 1, 16, C.amber, 0.45);
  else if (side === SIDE.Right) R(p, 3, 0, 1, 16, C.amber, 0.45);
  else if (side === SIDE.Bottom) R(p, 0, 2, 16, 1, C.amber, 0.45);
}

function face(p: P, fix: number) {
  const th = p.th;
  R(p, 0, 4, 16, 12, th.face);
  R(p, 0, 11, 16, 5, th.faceD);
  // рёбра тоннеля
  R(p, 0, 4, 3, 12, C.metal);
  R(p, 0, 4, 1, 12, C.steel, 0.5);
  R(p, 3, 4, 1, 12, C.black);
  // кабельный лоток
  R(p, 4, 6, 12, 2, C.black);
  R(p, 4, 6, 12, 1, C.dark);
  if (pr(p, 71) < 0.5) R(p, 4, 8, 12, 1, C.redD, 0.5);
  // потёки
  const x = 5 + (ph(p, 72) % 10);
  for (let y = 9; y < 15; y++) D(p, x, y, C.void, 0.35);
  R(p, 0, 15, 16, 1, C.void, 0.6);
  switch (fix) {
    case FX.Lamp: // натриевая лампа
      R(p, 5, 8, 8, 5, C.black);
      R(p, 6, 9, 6, 3, C.amber);
      R(p, 7, 10, 4, 1, C.yellow);
      R(p, 6, 12, 6, 1, C.metal);
      break;
    case FX.Emit: // светофор: огни зажигаются в ambient
      R(p, 5, 4, 6, 11, C.black);
      R(p, 6, 5, 4, 1, C.metal);
      R(p, 6, 9, 4, 1, C.metal);
      R(p, 7, 6, 2, 2, C.redD);
      R(p, 7, 10, 2, 2, C.amberD);
      R(p, 7, 15, 2, 1, C.dark);
      break;
    case FX.DetA: // предупреждающие шевроны
      R(p, 5, 8, 10, 5, C.black);
      for (let k = 0; k < 3; k++) {
        D(p, 7 + k * 3, 9, C.amber);
        D(p, 8 + k * 3, 10, C.amber);
        D(p, 7 + k * 3, 11, C.amber);
      }
      break;
    case FX.DetB: // распределительный щиток
      R(p, 6, 8, 8, 7, C.black);
      R(p, 7, 9, 6, 5, C.metal);
      R(p, 10, 9, 1, 5, C.black);
      D(p, 8, 10, C.redD);
      R(p, 7, 9, 6, 1, C.steel, 0.4);
      break;
  }
}

function pit(p: P) {
  const th = p.th;
  pitBase(p, [th.wallTop, th.face, C.metal, th.faceD, th.faceD, C.black, th.pitC], C.black, th.floorHi);
  if (p.v === 1) {
    // тросы лифтовой шахты
    const top = isPit(nb(p, 0, -1)) ? 0 : 6;
    R(p, 5, top, 1, 16 - top, C.dark);
    R(p, 10, top, 1, 16 - top, C.dark);
    if (pr(p, 75) < 0.2) {
      R(p, 4, top + 4, 8, 3, C.metal, 0.6);
      R(p, 4, top + 4, 8, 1, C.steel, 0.4);
    }
  } else if (!isPit(nb(p, 0, -1))) {
    R(p, 0, 2, 16, 1, C.amber, 0.25);
  }
}

function bridge(p: P) {
  R(p, 1, 0, 14, 16, C.black);
  R(p, 2, 0, 12, 16, C.dark);
  for (let y = 0; y < 16; y += 4) {
    for (let x = 3; x < 13; x += 4) {
      D(p, x, y + 1, C.metal);
      D(p, x + 1, y + 2, C.metal);
    }
  }
  R(p, 2, 0, 1, 16, C.amber, 0.7);
  R(p, 13, 0, 1, 16, C.amber, 0.7);
  R(p, 1, 0, 1, 16, C.steel);
  R(p, 14, 0, 1, 16, C.steel);
}

function block(p: P) {
  const g = blockShape(p, C.metal, C.steel, C.dark, C.black);
  speckle(p, 6, p.th.wallTop, 0.8, 85, g.x0, g.y0, g.x1 - g.x0, g.yf - g.y0);
  R(p, g.x0 + 2, g.y0 + 2, g.x1 - g.x0 - 4, 1, C.metal, 0.5);
  if (!g.nS) {
    // шевроны на фасаде опоры
    R(p, g.x0, g.yf + 1, g.x1 - g.x0, 3, C.black);
    for (let x = g.x0; x < g.x1; x++) {
      const k = (p.px + x) % 6;
      if (k < 3) D(p, x, g.yf + 1 + (k === 1 ? 1 : k === 2 ? 2 : 0), C.amber);
      if (k === 0) D(p, x, g.yf + 3, C.amber);
    }
  }
}

function crate(p: P) {
  dropShadow(p);
  const red = pr(p, 90) < 0.45;
  const body = red ? C.redD : C.amberD, hi = red ? C.red : C.amber, dk = red ? C.blood : C.black;
  // грузовой контейнер
  R(p, 1, 3, 14, 12, C.black);
  R(p, 2, 4, 12, 10, body);
  for (let x = 3; x < 13; x += 2) R(p, x, 5, 1, 8, dk, 0.6);
  R(p, 2, 4, 12, 1, hi, 0.55);
  R(p, 2, 13, 12, 1, dk);
  for (const [x, y] of [[2, 4], [13, 4], [2, 13], [13, 13]]) D(p, x, y, C.steel);
  R(p, 6, 7, 4, 3, C.black, 0.4);
}

export const TRANSIT: TierPainter = { floor, decal, cap, face, pit, bridge, block, crate, lampCols: [C.metal, C.amber, C.yellow] };
