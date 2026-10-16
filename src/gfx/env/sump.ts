// Отстойник: ржавчина, шлам, кучи лома, капающие трубы, решётки, лужи, тусклые янтарные лампы.
import { C } from '../palette';
import { blob, blockShape, capEdges, crack, dropShadow, pitBase, type TierPainter } from './common';
import { FX, SIDE } from './layout';
import { D, R, hash, nb, ph, pr, rnd, speckle, stain, vnoise, type P } from './util';

function floor(p: P) {
  const th = p.th;
  const n = vnoise(p.tx / 3.3, p.ty / 3.3, p.s + 11);
  R(p, 0, 0, 16, 16, n > 0.5 ? th.floorB : th.floorA);
  if (p.v === 0) {
    // Свалка: ржавые листы металла (со смещением рядов) поверх утоптанной грязи
    const gy = p.ty >> 1, gx = (p.tx + (gy & 1)) >> 1;
    if (rnd(gx, gy, p.s + 1) < 0.5) {
      const lx = (p.tx + (gy & 1)) & 1, ly = p.ty & 1;
      const x0 = lx === 0 ? 1 : 0, y0 = ly === 0 ? 1 : 0, x1 = lx === 1 ? 15 : 16, y1 = ly === 1 ? 15 : 16;
      const tone = rnd(gx, gy, p.s + 2);
      R(p, x0, y0, x1 - x0, y1 - y0, tone < 0.5 ? th.floorHi : th.floorB);
      if (lx === 0) R(p, 0, 0, 1, 16, th.line);
      if (lx === 1) R(p, 15, 0, 1, 16, th.line);
      if (ly === 0) {
        R(p, 0, 0, 16, 1, th.line);
        R(p, x0, 1, x1 - x0, 1, C.metal, 0.25);
      }
      if (ly === 1) R(p, 0, 15, 16, 1, th.line);
      D(p, lx === 0 ? 3 : 12, ly === 0 ? 3 : 12, C.metal, 0.8);
      if (tone > 0.8) for (let k = 2; k < 14; k += 3) R(p, k, 0, 1, 16, th.line, 0.5); // рифлёный лист
    } else {
      speckle(p, 12, th.line, 0.9, 3);
      speckle(p, 3, C.metal, 0.3, 4);
    }
    // ржавчина и грязь органичными пятнами поверх всего
    stain(p, 14, 0.64, C.amberD, 0.2, 12);
    stain(p, 20, 0.66, C.void, 0.3, 14);
    speckle(p, 3, C.amberD, 0.5, 13);
  } else {
    // Коллектор: мокрые бетонные плиты, швы, сырость и потёки
    if ((p.ty & 1) === 0) R(p, 0, 0, 16, 1, th.line);
    if (((p.tx + (p.ty >> 1)) & 1) === 0) R(p, 0, 0, 1, 16, th.line);
    R(p, 1, 1, 14, 1, th.floorHi, 0.5);
    speckle(p, 6, th.line, 0.7, 5);
    // сырость и налёт органичными пятнами
    stain(p, 18, 0.55, C.void, 0.3, 21);
    stain(p, 11, 0.72, C.amberD, 0.14, 23);
    if (vnoise(p.tx / 2.5, p.ty / 2.5, p.s + 21) > 0.6) speckle(p, 2, C.steel, 0.3, 22, 1, 1, 14, 14);
    // сточный жёлоб вдоль пола: мелкий, утоплен на пару пикселей, местами под решёткой
    if (p.ty % 9 === 4) {
      R(p, 0, 5, 16, 1, th.floorHi, 0.6);
      R(p, 0, 6, 16, 4, C.black);
      R(p, 0, 7, 16, 3, th.pitC);
      speckle(p, 2, C.steel, 0.35, 25, 0, 7, 16, 2);
      R(p, 0, 10, 16, 1, C.void, 0.5);
      if (p.tx % 4 === 0) for (let x = 1; x < 16; x += 3) R(p, x, 6, 1, 4, C.metal);
    }
  }
}

function decal(p: P) {
  const th = p.th;
  switch (p.decor) {
    case 1: // сливная решётка
      R(p, 3, 3, 10, 10, C.black);
      R(p, 3, 3, 10, 1, C.metal, 0.6);
      R(p, 3, 3, 1, 10, C.metal, 0.4);
      for (let i = 5; i < 13; i += 2) R(p, 4, i, 9, 1, th.floorHi);
      D(p, 8, 8, C.amberD, 0.8);
      break;
    case 2:
      crack(p, th.line, 30);
      crack(p, C.void, 31);
      break;
    case 3: // ржавое пятно
      blob(p, 8, 8, 5, 4, C.amberD, 0.25);
      blob(p, 7, 8, 2, 2, C.blood, 0.4);
      break;
    case 4: // гайки и болты
      for (let i = 0; i < 4; i++) {
        const h = ph(p, 40 + i);
        const x = 2 + (h % 12), y = 2 + ((h >>> 5) % 12);
        D(p, x, y + 1, C.void, 0.6);
        D(p, x, y, i % 2 ? C.steel : C.metal);
      }
      break;
    case 5: { // шланг
      const y = 6 + (ph(p, 50) % 5);
      R(p, 0, y, 5, 2, C.black);
      R(p, 5, y + 1, 6, 2, C.black);
      R(p, 11, y, 5, 2, C.black);
      R(p, 1, y, 3, 1, C.dark);
      R(p, 6, y + 1, 4, 1, C.dark);
      break;
    }
    case 6: // лужа шлама
      blob(p, 8, 9, 6, 4, C.void, 0.65);
      R(p, 3, 6, 9, 1, C.amberD, 0.3);
      D(p, 6, 8, C.amber, 0.3);
      D(p, 10, 10, C.amberD, 0.6);
      break;
    case 7: // лужа воды с отблеском
      blob(p, 8, 8, 6, 4, C.void, 0.55);
      R(p, 5, 6, 4, 1, C.steel, 0.35);
      D(p, 10, 9, C.steel, 0.25);
      break;
  }
}

function cap(p: P, side: number) {
  const th = p.th;
  R(p, 0, 0, 16, 16, th.wallTop);
  speckle(p, 10, th.wall, 1, 60);
  speckle(p, 4, C.amberD, 0.5, 61);
  if (pr(p, 62) < 0.3) R(p, 3 + (ph(p, 63) % 8), 4 + (ph(p, 64) % 8), 4, 2, C.dark);
  capEdges(p, side, C.steel, 0.4);
  if (side === SIDE.Bottom || side === SIDE.Left || side === SIDE.Right) {
    // потёки ржавчины по кромке
    if (pr(p, 65) < 0.4) R(p, side === SIDE.Left ? 12 : side === SIDE.Right ? 3 : 4 + (ph(p, 66) % 8), side === SIDE.Bottom ? 2 : 3, 1, 4, C.amberD, 0.5);
  }
}

/** Ржавая гофра с трубой вдоль фасада */
function face(p: P, fix: number) {
  const th = p.th;
  R(p, 0, 4, 16, 12, th.face);
  for (let x = (p.px % 3 === 0 ? 0 : 3 - (p.px % 3)); x < 16; x += 3) {
    R(p, x, 4, 1, 12, th.faceD);
    R(p, x + 1, 4, 1, 12, th.wallTop, 0.35);
  }
  // потёки ржавчины
  for (let i = 0; i < 3; i++) {
    const h = ph(p, 70 + i);
    if (h % 3 === 0) continue;
    const x = h % 16, len = 4 + ((h >>> 6) % 8);
    for (let j = 0; j < len; j++) D(p, x, 4 + j, C.amberD, 0.55 * (1 - j / len));
  }
  // грязь у основания
  R(p, 0, 13, 16, 1, C.void, 0.25);
  R(p, 0, 14, 16, 2, C.void, 0.45);
  // труба вдоль всей стены (на высоте 8..10), с фланцами
  if (p.v === 1 || hash(p.tx >> 2, 0, p.s + 74) % 3 !== 0) {
    const y = p.v === 1 ? 6 : 8;
    R(p, 0, y, 16, 3, C.dark);
    R(p, 0, y, 16, 1, C.metal);
    R(p, 0, y + 2, 16, 1, C.black);
    speckle(p, 3, C.amberD, 0.6, 75, 0, y, 16, 3);
    if (p.tx % 4 === 0) {
      R(p, 6, y - 1, 2, 5, C.metal);
      D(p, 6, y - 1, C.steel);
      D(p, 7, y + 3, C.black);
    }
  }
  switch (fix) {
    case FX.Lamp: // лампа в клетке
      R(p, 7, 4, 2, 3, C.black);
      R(p, 5, 7, 6, 6, C.black);
      R(p, 6, 8, 4, 4, C.amber);
      R(p, 7, 9, 2, 2, C.yellow);
      R(p, 6, 8, 1, 4, C.amberD);
      R(p, 8, 8, 1, 4, C.amberD, 0.6);
      R(p, 5, 10, 6, 1, C.dark);
      break;
    case FX.Emit: // сток: жерло трубы, сочится шлам
      R(p, 3, 6, 10, 9, C.black);
      R(p, 4, 7, 8, 7, C.metal);
      R(p, 4, 7, 8, 1, C.steel, 0.6);
      R(p, 5, 8, 6, 5, C.void);
      R(p, 5, 11, 6, 2, C.amberD);
      D(p, 7, 11, C.amber, 0.6);
      R(p, 7, 13, 2, 3, C.amberD, 0.8);
      break;
    case FX.DetA: // вентиляционная решётка
      R(p, 3, 5, 10, 8, C.black);
      for (let y = 6; y < 12; y += 2) R(p, 4, y, 8, 1, th.wallTop);
      D(p, 3, 5, C.steel, 0.6);
      D(p, 12, 5, C.steel, 0.6);
      break;
    case FX.DetB: { // свисающие цепи / кабели
      const x = 3 + (ph(p, 76) % 8);
      for (let y = 4; y < 13; y++) D(p, x + ((y >> 1) & 1), y, y % 2 ? C.metal : C.dark);
      R(p, x + 3, 4, 1, 5, C.black);
      R(p, x + 4, 9, 2, 1, C.black);
      break;
    }
  }
}

function pit(p: P) {
  const th = p.th;
  pitBase(p, [th.wallTop, th.face, th.faceD, th.faceD, th.pitC, th.pitC], C.black, th.floorHi);
  const top = nb(p, 0, -1) === 2 || nb(p, 0, -1) === 7 ? 0 : 6;
  R(p, 1, top, 14, 15 - top, th.pitC);
  if (p.v === 1) {
    // Коллектор: чёрная сточная вода с рябью
    for (let i = 0; i < 4; i++) {
      const h = ph(p, 84 + i);
      const x = 1 + (h % 10), y = top + 1 + ((h >>> 6) % Math.max(1, 13 - top));
      R(p, x, y, 3 + (h % 3), 1, C.metal, 0.35);
    }
    if (top) R(p, 1, top, 14, 1, C.steel, 0.2);
    return;
  }
  // поверхность шлама
  speckle(p, 3, C.amberD, 0.35, 80, 1, top, 14, 14 - top);
  if (pr(p, 81) < 0.35) {
    const x = 3 + (ph(p, 82) % 9), y = top + 2 + (ph(p, 83) % Math.max(1, 10 - top));
    R(p, x, y, 3, 1, C.amberD, 0.5);
    D(p, x + 1, y - 1, C.amberD, 0.35);
  }
  if (top) R(p, 1, top, 14, 1, C.amberD, 0.25);
}

function bridge(p: P) {
  R(p, 1, 0, 14, 16, C.black);
  for (let y = 0; y < 16; y += 3) {
    R(p, 2, y, 12, 2, p.th.wallTop);
    R(p, 2, y, 12, 1, C.metal, 0.5);
  }
  speckle(p, 6, C.amberD, 0.6, 85, 2, 0, 12, 16);
  R(p, 1, 0, 1, 16, C.amberD);
  R(p, 14, 0, 1, 16, C.amberD);
  R(p, 0, 0, 1, 16, C.void, 0.6);
  R(p, 15, 0, 1, 16, C.void, 0.6);
}

function block(p: P) {
  const g = blockShape(p, C.metal, C.steel, C.dark, C.black);
  // ржавчина и заклёпки на прессованном ломе
  speckle(p, 10, C.amberD, 0.55, 90, g.x0, g.y0, g.x1 - g.x0, g.yf - g.y0);
  if (pr(p, 91) < 0.5) R(p, g.x0 + 2, g.y0 + 3, 5, 3, C.dark, 0.7);
  if (!g.nN && !g.nW) D(p, g.x0 + 2, g.y0 + 2, C.steelL, 0.6);
  if (!g.nS) {
    for (let x = g.x0 + 1; x < g.x1; x += 4) R(p, x, g.yf + 1, 1, 3, C.amberD, 0.5);
  }
}

function crate(p: P) {
  dropShadow(p);
  if (pr(p, 95) < 0.5) {
    // ржавая бочка
    R(p, 3, 3, 10, 12, C.black);
    R(p, 4, 4, 8, 10, C.amberD);
    R(p, 5, 4, 2, 10, C.amber, 0.45);
    R(p, 11, 4, 1, 10, C.blood, 0.7);
    R(p, 4, 7, 8, 1, C.black, 0.7);
    R(p, 4, 11, 8, 1, C.black, 0.7);
    R(p, 4, 3, 8, 2, C.amber, 0.5);
    R(p, 5, 2, 6, 1, C.black);
    D(p, 9, 3, C.black);
    speckle(p, 5, C.blood, 0.6, 96, 4, 4, 8, 10);
  } else {
    // куча лома
    R(p, 1, 8, 14, 6, C.black);
    R(p, 2, 9, 12, 4, C.dark);
    R(p, 3, 6, 6, 4, C.black);
    R(p, 4, 6, 5, 3, C.metal);
    R(p, 8, 4, 5, 6, C.black);
    R(p, 9, 5, 3, 4, C.amberD);
    D(p, 9, 5, C.amber, 0.7);
    R(p, 5, 3, 3, 4, C.black);
    R(p, 6, 3, 2, 3, C.steel);
    R(p, 2, 10, 4, 1, C.metal, 0.8);
    R(p, 10, 11, 3, 1, C.amberD);
    D(p, 4, 6, C.grey, 0.5);
    speckle(p, 5, C.amberD, 0.6, 97, 2, 6, 12, 7);
  }
}

export const SUMP: TierPainter = { floor, decal, cap, face, pit, bridge, block, crate, lampCols: [C.dark, C.amber, C.yellow] };
