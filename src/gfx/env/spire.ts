// Шпиль (Ядро Диспетчера): стерильные светло-серые серверные залы, точные линии панелей,
// стойки со светодиодами, холодный свет и красный акцент ИИ.
import { C } from '../palette';
import { blockShape, capEdges, dropShadow, pitBase, type TierPainter } from './common';
import { FX, SIDE } from './layout';
import { D, R, isPit, nb, pr, vnoise, type P } from './util';

function floor(p: P) {
  const th = p.th;
  R(p, 0, 0, 16, 16, ((p.tx + p.ty) & 1) ? th.floorA : th.floorB);
  // фальшпол: фаска каждой плиты
  R(p, 0, 0, 16, 1, th.floorHi);
  R(p, 0, 0, 1, 16, th.floorHi);
  R(p, 0, 15, 16, 1, th.line);
  R(p, 15, 0, 1, 16, th.line);
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) D(p, x, y, C.metal, 0.7);
  // перфорированные плиты
  if (pr(p, 1) < 0.1) {
    for (let y = 4; y < 12; y += 2) for (let x = 4; x < 12; x += 2) D(p, x, y, C.black, 0.8);
  }
  // кабельные каналы под полом: утопленный жёлоб с редкими красными индикаторами
  const row = p.ty % 9 === 4, col = p.tx % 10 === 5;
  if (row) {
    R(p, 0, 7, 16, 3, C.black, 0.7);
    R(p, 0, 7, 16, 1, th.line);
    R(p, 0, 10, 16, 1, th.floorHi, 0.6);
  }
  if (col) {
    R(p, 7, 0, 3, 16, C.black, 0.7);
    R(p, 7, 0, 1, 16, th.line);
    R(p, 10, 0, 1, 16, th.floorHi, 0.6);
  }
  if ((row && p.tx % 3 === 0) || (col && p.ty % 3 === 0)) D(p, 8, 8, C.redD);
  if (row && col) {
    R(p, 6, 6, 5, 5, C.black);
    R(p, 7, 7, 3, 3, C.redD);
    D(p, 8, 8, C.red);
  }
  // холодный отблеск полировки
  if (vnoise(p.tx / 3, p.ty / 3, p.s + 2) > 0.7) {
    for (let k = 0; k < 6; k++) D(p, 4 + k, 10 - k, th.floorHi, 0.5);
  }
}

function decal(p: P) {
  const th = p.th;
  switch (p.decor) {
    case 1:
      for (let y = 3; y < 13; y += 2) for (let x = 3; x < 13; x += 2) D(p, x, y, C.black, 0.8);
      break;
    case 2:
      R(p, 1, 8, 14, 1, th.line);
      break;
    case 3:
      for (let k = 0; k < 8; k++) D(p, 3 + k, 12 - k, th.floorHi, 0.7);
      for (let k = 0; k < 5; k++) D(p, 6 + k, 12 - k, th.floorHi, 0.4);
      break;
    case 4: // люк доступа
      R(p, 3, 3, 10, 1, th.line);
      R(p, 3, 12, 10, 1, th.line);
      R(p, 3, 3, 1, 10, th.line);
      R(p, 12, 3, 1, 10, th.line);
      for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) D(p, x, y, C.steel, 0.6);
      break;
    case 5:
      R(p, 6, 6, 4, 4, C.black);
      R(p, 7, 7, 2, 2, C.redD);
      break;
    case 6: // уголки разметки
      for (const [x, y, dx, dy] of [[2, 2, 1, 1], [13, 2, -1, 1], [2, 13, 1, -1], [13, 13, -1, -1]]) {
        D(p, x, y, C.steel, 0.5);
        D(p, x + dx, y, C.steel, 0.5);
        D(p, x, y + dy, C.steel, 0.5);
      }
      break;
    case 7:
      R(p, 0, 6, 16, 3, C.metal);
      R(p, 0, 6, 16, 1, C.steel, 0.5);
      break;
  }
}

function cap(p: P, side: number) {
  const th = p.th;
  R(p, 0, 0, 16, 16, th.wallTop);
  R(p, 0, 0, 16, 1, th.wall);
  R(p, 0, 0, 1, 16, th.wall);
  R(p, 4, 4, 8, 8, th.wall, 0.35);
  capEdges(p, side, C.steelL, 0.5);
  // тонкая красная линия ИИ вдоль кромки
  if (side === SIDE.Left) R(p, 11, 0, 1, 16, C.redD);
  else if (side === SIDE.Right) R(p, 4, 0, 1, 16, C.redD);
  else if (side === SIDE.Bottom) R(p, 0, 3, 16, 1, C.redD);
}

function face(p: P, fix: number) {
  const th = p.th;
  R(p, 0, 4, 16, 12, th.face);
  R(p, 0, 4, 16, 1, C.steel, 0.5);
  R(p, 0, 4, 1, 12, th.faceD);
  R(p, 1, 4, 1, 12, th.wallTop, 0.5);
  R(p, 0, 10, 16, 1, th.faceD);
  // плинтус с красной полосой
  R(p, 0, 13, 16, 3, C.dark);
  R(p, 0, 13, 16, 1, C.redD);
  R(p, 0, 15, 16, 1, C.void, 0.5);
  switch (fix) {
    case FX.Lamp: // световая полоса
      R(p, 2, 6, 12, 3, C.black);
      R(p, 3, 7, 10, 1, C.bone);
      R(p, 3, 6, 10, 1, C.grey);
      break;
    case FX.Emit: // встроенная стойка, светодиоды мигают в ambient
      R(p, 2, 4, 12, 9, C.black);
      for (let y = 5; y < 12; y += 2) R(p, 3, y, 10, 1, C.dark);
      for (const [x, y] of [[4, 6], [11, 6], [4, 10], [11, 10]]) D(p, x, y, C.redD);
      R(p, 2, 4, 12, 1, C.metal);
      break;
    case FX.DetA: // «глаз» Диспетчера
      R(p, 4, 5, 8, 8, C.black);
      R(p, 5, 6, 6, 6, C.metal);
      R(p, 6, 7, 4, 4, C.redD);
      R(p, 7, 8, 2, 2, C.red);
      D(p, 7, 8, C.redL);
      break;
    case FX.DetB:
      for (let y = 6; y < 12; y += 2) R(p, 3, y, 10, 1, C.black);
      break;
  }
}

function pit(p: P) {
  const th = p.th;
  pitBase(p, [th.wallTop, th.face, th.faceD, C.dark, C.black, C.black], C.redD, th.floorHi);
  const top = isPit(nb(p, 0, -1)) ? 0 : 6;
  for (let y = top + 3; y < 15; y += 4) R(p, 1, y, 14, 1, C.dark, 0.5);
  if (!isPit(nb(p, 0, 1))) R(p, 0, 14, 16, 1, C.redD);
}

function bridge(p: P) {
  R(p, 1, 0, 14, 16, C.black);
  R(p, 2, 0, 12, 16, p.th.floorHi);
  R(p, 2, (16 - (p.py % 32)) % 16, 12, 1, p.th.line);
  R(p, 2, 0, 1, 16, C.metal);
  R(p, 13, 0, 1, 16, C.metal);
  for (let y = 2; y < 16; y += 4) {
    D(p, 2, y, C.red);
    D(p, 13, y, C.red);
  }
}

function block(p: P) {
  const g = blockShape(p, C.steel, C.steelL, C.metal, C.dark);
  // точные линии и красный паз
  R(p, g.x0 + 2, g.y0 + 2, g.x1 - g.x0 - 4, 1, C.metal, 0.6);
  if (!g.nS) {
    const cx = g.nW && !g.nE ? g.x0 + 4 : g.nE && !g.nW ? g.x1 - 5 : 7;
    R(p, cx, g.yf + 1, 2, 3, C.redD);
    D(p, cx, g.yf + 2, C.red);
  }
}

function crate(p: P) {
  dropShadow(p);
  // серверная стойка (светодиоды в ambient)
  R(p, 2, 0, 12, 15, C.black);
  R(p, 3, 1, 10, 13, C.dark);
  R(p, 3, 1, 10, 1, C.steel);
  for (let y = 3; y < 13; y += 3) {
    R(p, 4, y, 8, 2, C.black);
    R(p, 4, y, 5, 1, C.metal, 0.6);
  }
  for (let k = 0; k < 3; k++) D(p, 11, 4 + k * 3, C.redD);
  R(p, 3, 13, 10, 1, C.amberD);
}

export const SPIRE: TierPainter = { floor, decal, cap, face, pit, bridge, block, crate, lampCols: [C.metal, C.grey, C.bone] };
