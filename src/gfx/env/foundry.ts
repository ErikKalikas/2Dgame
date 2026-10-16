// Цеха: стальные рифлёные плиты, жёлто-чёрная разметка, клёпаные панели, печи, кабели, масло.
import { C } from '../palette';
import { blob, blockShape, capEdges, crack, dropShadow, pitBase, type TierPainter } from './common';
import { FX, SIDE } from './layout';
import { D, R, hazard, hash, isPit, nb, ph, pr, speckle, stain, vgrad, vnoise, type P } from './util';

function floor(p: P) {
  const th = p.th;
  const alt = ((p.tx >> 1) + (p.ty >> 1)) & 1;
  R(p, 0, 0, 16, 16, alt ? th.floorA : th.floorB);
  R(p, 0, 0, 16, 1, th.line);
  R(p, 0, 0, 1, 16, th.line);
  R(p, 1, 1, 15, 1, th.floorHi, 0.7);
  R(p, 1, 1, 1, 15, th.floorHi, 0.4);
  if (p.v === 0) {
    // рифление «ромб»
    for (let j = 0, y = 3; y < 15; y += 3, j++) {
      for (let i = 0, x = 2 + (j & 1) * 2; x < 15; x += 4, i++) {
        if ((i + j) & 1) {
          D(p, x, y, th.floorHi);
          D(p, x + 1, y - 1, th.floorHi);
        } else {
          D(p, x, y - 1, th.floorHi);
          D(p, x + 1, y, th.floorHi);
        }
      }
    }
    if ((p.tx & 1) === 0 && (p.ty & 1) === 0) D(p, 2, 2, C.metal);
    // разметка проходов в 2 тайлах от стен
    const { tw, th: rh } = p.room;
    const lane = (y: number, horiz: boolean) => {
      for (let k = 0; k < 16; k++) {
        if (((horiz ? p.px : p.py) + k) & 4) continue;
        if (horiz) D(p, k, y, C.amber, 0.28);
        else D(p, y, k, C.amber, 0.28);
      }
    };
    if (p.ty === 2 || p.ty === rh - 3) lane(8, true);
    if (p.tx === 2 || p.tx === tw - 3) lane(8, false);
  } else {
    // литейная: литые плиты с решёткой рёбер, окалина и копоть
    for (let k = 4; k < 16; k += 4) {
      R(p, k, 2, 1, 13, th.floorHi, 0.5);
      R(p, 2, k, 13, 1, th.floorHi, 0.5);
    }
    stain(p, 18, 0.55, C.void, 0.35, 30);
    stain(p, 10, 0.78, C.redD, 0.18, 36);
    speckle(p, 5, C.blood, 0.8, 31);
    if (pr(p, 32) < 0.1) {
      // остывший шлак
      const x = 3 + (ph(p, 33) % 9), y = 3 + (ph(p, 34) % 9);
      blob(p, x, y, 2, 2, C.black, 0.8);
      D(p, x, y - 1, C.redD, 0.8);
    }
  }
  // масляные разводы крупными пятнами
  stain(p, 15, 0.68, C.void, 0.32, 35);
  // предупреждающая полоса у края провала
  if (isPit(nb(p, 0, -1))) hazard(p, 0, 0, 16, 3, 0.6);
  if (isPit(nb(p, 0, 1))) hazard(p, 0, 13, 16, 3, 0.6);
  if (isPit(nb(p, -1, 0))) hazard(p, 0, 0, 3, 16, 0.6);
  if (isPit(nb(p, 1, 0))) hazard(p, 13, 0, 3, 16, 0.6);
}

function decal(p: P) {
  const th = p.th;
  switch (p.decor) {
    case 1: // решётка; в литейной под ней тлеет жар
      R(p, 3, 3, 10, 10, C.black);
      if (p.v === 1) {
        R(p, 4, 4, 8, 8, C.blood);
        R(p, 5, 6, 6, 4, C.redD);
      }
      for (let i = 4; i < 13; i += 2) R(p, i, 3, 1, 10, th.floorHi);
      R(p, 3, 3, 10, 1, C.metal);
      break;
    case 2:
      crack(p, C.void, 40);
      if (p.v === 1) {
        crack(p, C.redD, 40);
        D(p, 7 + (ph(p, 43) % 3), 6 + (ph(p, 44) % 4), C.red, 0.8);
      }
      break;
    case 3: // масляное пятно
      blob(p, 8, 8, 5, 4, C.void, 0.45);
      D(p, 6, 6, C.steel, 0.35);
      D(p, 7, 6, C.steel, 0.2);
      break;
    case 4: // люк на болтах
      R(p, 3, 3, 10, 10, C.black);
      R(p, 4, 4, 8, 8, th.floorHi);
      R(p, 4, 4, 8, 1, C.metal, 0.6);
      for (const [x, y] of [[5, 5], [10, 5], [5, 10], [10, 10]]) D(p, x, y, C.steel);
      break;
    case 5: { // пучок кабелей
      const y = 5 + (ph(p, 42) % 6);
      R(p, 0, y, 16, 2, C.black);
      R(p, 0, y + 2, 16, 1, C.black, 0.7);
      R(p, 0, y, 16, 1, C.dark);
      R(p, 6, y - 1, 2, 5, C.metal);
      break;
    }
    case 6:
      hazard(p, 2, 6, 12, 4, 0.3);
      break;
    case 7:
      blob(p, 8, 9, 6, 4, C.void, 0.55);
      R(p, 5, 7, 4, 1, C.steel, 0.3);
      break;
  }
}

function cap(p: P, side: number) {
  const th = p.th;
  R(p, 0, 0, 16, 16, th.wallTop);
  R(p, 0, 7, 16, 1, th.wall);
  R(p, 7, 0, 1, 16, th.wall);
  for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) D(p, x, y, C.steel, 0.5);
  capEdges(p, side, C.steelL, 0.35);
  if (side === SIDE.Left) hazard(p, 10, 0, 3, 16, p.v === 0 ? 0.7 : 0.4);
  else if (side === SIDE.Right) hazard(p, 3, 0, 3, 16, p.v === 0 ? 0.7 : 0.4);
  else if (side === SIDE.Bottom) hazard(p, 0, 2, 16, 3, p.v === 0 ? 0.7 : 0.4);
}

function face(p: P, fix: number) {
  const th = p.th;
  R(p, 0, 4, 16, 12, th.face);
  R(p, 0, 4, 1, 12, th.faceD);
  R(p, 1, 4, 1, 12, th.wallTop, 0.4);
  // двутавр сверху
  R(p, 0, 4, 16, 2, C.metal);
  R(p, 0, 4, 16, 1, C.steel, 0.6);
  R(p, 0, 6, 16, 1, C.black);
  // заклёпки
  for (let x = 2; x < 16; x += 4) D(p, x, 8, C.steel, 0.55);
  // низ: отбойник
  if (p.v === 0) hazard(p, 0, 13, 16, 2, 0.55);
  else {
    R(p, 0, 12, 16, 3, C.void, 0.35);
    speckle(p, 4, C.redD, 0.6, 50, 0, 12, 16, 3);
  }
  R(p, 0, 15, 16, 1, C.void, 0.6);
  // провисающий кабель между панелями
  if (hash(p.tx >> 1, 1, p.s + 51) % 3 === 0 && fix !== FX.Emit) {
    const off = (p.tx & 1) * 16;
    for (let k = 0; k < 16; k++) {
      const u = (k + off) / 32;
      D(p, k, 7 + Math.round(Math.sin(u * Math.PI) * 4), C.black);
    }
  }
  switch (fix) {
    case FX.Lamp:
      R(p, 7, 6, 2, 2, C.black);
      R(p, 4, 8, 8, 2, C.metal);
      R(p, 4, 8, 8, 1, C.steel, 0.6);
      R(p, 5, 10, 6, 2, C.amber);
      R(p, 6, 10, 4, 1, C.yellow);
      R(p, 5, 12, 6, 1, C.black);
      D(p, 7, 11, C.black);
      break;
    case FX.Emit: { // печь: раскалённое жерло за решёткой
      R(p, 2, 6, 12, 10, C.black);
      R(p, 3, 7, 10, 8, C.metal);
      vgrad(p, 4, 8, 8, [C.redD, C.red, C.red, C.amber, C.amber, C.yellow]);
      for (let x = 5; x < 12; x += 2) R(p, x, 8, 1, 6, C.black, 0.85);
      R(p, 3, 14, 10, 1, C.steel);
      R(p, 3, 7, 10, 1, C.steel, 0.5);
      break;
    }
    case FX.DetA:
      R(p, 2, 8, 12, 5, C.black);
      hazard(p, 3, 9, 10, 3, 0.9);
      break;
    case FX.DetB: // манометр и труба
      R(p, 10, 6, 2, 10, C.metal);
      R(p, 10, 6, 1, 10, C.steel, 0.5);
      R(p, 3, 7, 7, 7, C.black);
      R(p, 4, 8, 5, 5, C.metal);
      R(p, 5, 9, 3, 3, C.dark);
      D(p, 4, 8, C.steel);
      D(p, 6, 10, C.steel);
      D(p, 7, 9, C.red);
      R(p, 9, 10, 1, 1, C.metal);
      break;
  }
}

function pit(p: P) {
  const th = p.th;
  if (p.v === 0) {
    pitBase(p, [th.wallTop, th.face, th.faceD, th.faceD, C.black, th.pitC], C.black, th.floorHi);
    // балки шахты и далёкий отсвет печей
    if ((p.ty & 1) === 0) {
      R(p, 1, 10, 14, 2, C.dark, 0.7);
      R(p, 1, 10, 14, 1, C.metal, 0.4);
    }
    R(p, 2, 13, 12, 1, C.blood, 0.4);
  } else {
    // литейная: расплав под тёмной коркой, светятся только трещины между плитами корки
    R(p, 0, 0, 16, 16, C.blood);
    const top = isPit(nb(p, 0, -1)) ? 0 : 4;
    for (let y = top; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = vnoise((p.px + x) / 6, (p.py + y) / 5, p.s + 60);
        const m = vnoise((p.px + x) / 3, (p.py + y) / 3, p.s + 61);
        const d = Math.abs(n - 0.5) + (m - 0.5) * 0.06;
        if (d < 0.018) D(p, x, y, C.amber, 0.85);
        else if (d < 0.05) D(p, x, y, C.red, 0.85);
        else if (d < 0.08) D(p, x, y, C.redD);
        else if (n > 0.5) D(p, x, y, C.black, 0.55);
      }
    }
    if (top) vgrad(p, 0, 0, 16, [th.wallTop, th.face, th.faceD, C.black]);
    if (!isPit(nb(p, -1, 0))) R(p, 0, 0, 1, 16, C.black);
    if (!isPit(nb(p, 1, 0))) R(p, 15, 0, 1, 16, C.black);
    if (!isPit(nb(p, 0, 1))) {
      R(p, 0, 14, 16, 1, C.black);
      R(p, 0, 15, 16, 1, th.floorHi);
    }
  }
}

function bridge(p: P) {
  R(p, 1, 0, 14, 16, C.black);
  for (let y = 1; y < 16; y += 3) R(p, 3, y, 10, 1, p.th.floorHi);
  for (let x = 4; x < 13; x += 3) R(p, x, 0, 1, 16, p.th.wallTop, 0.6);
  hazard(p, 1, 0, 2, 16, 0.9);
  hazard(p, 13, 0, 2, 16, 0.9);
  R(p, 0, 0, 1, 16, C.void, 0.7);
  R(p, 15, 0, 1, 16, C.void, 0.7);
}

function block(p: P) {
  const g = p.v === 0 ? blockShape(p, C.steel, C.steelL, C.metal, C.dark) : blockShape(p, C.metal, C.steel, C.dark, C.black);
  // клёпка и крестовина на верхней плите
  R(p, g.x0 + 1, g.y0 + 1, g.x1 - g.x0 - 2, g.yf - g.y0 - 2, C.metal, 0.35);
  if (!g.nN && !g.nW) D(p, g.x0 + 2, g.y0 + 2, C.steelL);
  if (!g.nN && !g.nE) D(p, g.x1 - 3, g.y0 + 2, C.steelL);
  if (!g.nS && !g.nW) D(p, g.x0 + 2, g.yf - 2, C.steelL, 0.6);
  if (!g.nS && !g.nE) D(p, g.x1 - 3, g.yf - 2, C.steelL, 0.6);
  if (!g.nS) {
    if (p.v === 0) hazard(p, g.x0, g.yf + 1, g.x1 - g.x0, 3, 0.9);
    else {
      R(p, g.x0, g.yf + 2, g.x1 - g.x0, 1, C.redD);
      speckle(p, 3, C.red, 0.6, 70, g.x0, g.yf + 2, g.x1 - g.x0, 1);
    }
  }
}

function crate(p: P) {
  dropShadow(p);
  if (p.v === 1 && pr(p, 75) < 0.5) {
    // бадья с остывающим шлаком
    R(p, 2, 4, 12, 11, C.black);
    R(p, 3, 5, 10, 9, C.dark);
    R(p, 3, 5, 10, 1, C.metal);
    R(p, 4, 6, 8, 3, C.blood);
    speckle(p, 5, C.red, 0.9, 76, 4, 6, 8, 3);
    D(p, 7, 7, C.amber);
    R(p, 3, 11, 10, 1, C.amberD);
    R(p, 1, 8, 1, 3, C.metal);
    R(p, 14, 8, 1, 3, C.metal);
    return;
  }
  // ящик в стальной обвязке
  R(p, 2, 2, 12, 13, C.black);
  R(p, 3, 3, 10, 11, C.amberD);
  R(p, 3, 3, 10, 1, C.amber, 0.6);
  for (let k = 0; k < 9; k++) D(p, 4 + k, 12 - k, C.amber, 0.45);
  R(p, 3, 3, 1, 11, C.metal);
  R(p, 12, 3, 1, 11, C.metal);
  R(p, 3, 8, 10, 1, C.black, 0.6);
  for (const [x, y] of [[3, 3], [12, 3], [3, 13], [12, 13]]) D(p, x, y, C.steelL);
  R(p, 6, 5, 4, 2, C.black, 0.5);
}

export const FOUNDRY: TierPainter = { floor, decal, cap, face, pit, bridge, block, crate, lampCols: [C.metal, C.amber, C.yellow] };
