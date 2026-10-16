import type { Sprite } from '../sprite';
import { Grid, Mask, hash } from './pix';
import {
  DARK, FRAMES, GREY, METAL, R_METAL, R_RED, R_STEEL, STEEL, boss, px, rivet, type Ctx, type Mat,
} from './bosses';

// ДИСПЕТЧЕР — финальный босс. Огромный робот-торс, подвешенный на пилонах над серверным залом:
// голова-сенсор с тремя объективами, плечи — серверные стойки, на груди экран с картой маршрутов,
// ниже пояса вместо ног пучок кабелей-поводков. Руки — отдельные спрайты (плечо и предплечье
// с клешнёй), заранее нарисованные под 64 угла: так они поворачиваются без размытия пикселей.
// Два настроения: спокойный (стерильно-белый) и злой (больше красного, для поздних фаз).

export const DW = 112;
export const DH = 104;
/** Плечевые шарниры в координатах спрайта корпуса (левый; правый — зеркально) */
export const SHOULDER_X = 14;
export const SHOULDER_Y = 42;
/** Длина плеча и расстояние от локтя до центра ладони */
export const ARM_UPPER = 24;
export const ARM_FORE = 23;
/** Число углов, под которые нарисованы руки */
export const ARM_STEPS = 64;

const PLATE: Mat = [6, 7, 5, 1];
const PLATE_A: Mat = [5, 6, 4, 1];

/** Отражение x для ширины корпуса */
const mxw = (x: number, w = 1) => DW - x - w;

/** Наплечник-стойка (side 0 — левый, 1 — правый) */
function pauldron({ g, M, F }: Ctx, side: number, A: boolean) {
  const fl = (m: Mask) => (side ? m.flip() : m);
  const X = (x: number, w = 1) => (side ? mxw(x, w) : x);
  const P = A ? PLATE_A : PLATE;
  // нижний слой брони и верхняя крышка
  const body = fl(M().poly([7, 27, 37, 26, 41, 31, 41, 46, 34, 52, 14, 52, 4, 46, 4, 32]));
  F(body, P);
  g.tint(fl(M().rect(0, 44, 48, 9)), A ? { 5: 4, 4: 3 } : { 6: 5, 5: 4 });
  const cap = fl(M().poly([9, 21, 33, 19, 40, 24, 40, 30, 34, 33, 10, 33, 5, 29, 5, 25]));
  F(cap, P);
  g.rect(X(10, 23), 22, 23, 1, A ? 6 : 7);
  g.rect(X(8, 30), 33, 30, 1, 3);
  // серверные прорези
  for (let y = 36; y <= 42; y += 3) g.rect(X(9, 13), y, 13, 1, 3);
  g.rect(X(25), 35, 1, 10, 5);
  g.rect(X(26), 35, 1, 10, 3);
  // полоса «опасность» по низу
  g.stripes(fl(M().rect(9, 46, 25, 4)), A ? 10 : 4, 1, 2, side ? -1 : 1, false);
  // красная метка Диспетчера и заклёпки
  g.rect(X(29, 9), 37, 9, 1, 10);
  g.rect(X(29, 9), 39, 9, 1, A ? 10 : 9);
  for (const [x, y] of [[8, 25], [36, 24], [37, 43], [18, 49], [31, 49], [20, 30]]) rivet(g, X(x), y, A ? 6 : 7, 4);
  // гнездо плечевого шарнира
  g.rect(X(SHOULDER_X - 3, 7), SHOULDER_Y + 4, 7, 2, 2);
}

/** Огоньки наплечника (после обводки) */
function pauldronLights(g: Grid, side: number, f: number, A: boolean) {
  for (let y = 36; y <= 42; y += 3)
    for (let k = 0; k < 3; k++) {
      const lx = side ? mxw(10 + k) : 10 + k;
      const on = hash(lx, y, f + (A ? 50 : 0)) < (A ? 0.6 : 0.4);
      g.set(lx, y, on ? (A || hash(lx, y, 99) < 0.2 ? 11 : 14) : 9);
    }
}

/** Кадры корпуса: 0 — покой, 1..4 — цикл (кабели качаются, бегут огни, мигает экран) */
export function dispatcherBody(A: boolean): Sprite[] {
  // кабели-поводки: x у пояса, длина, материал, толщина, наконечник (0 штекер, 1 зажим, 2 оголённый, 3 ошейник)
  const cables: [x: number, len: number, mat: Mat, t: number, end: number][] = [
    [40, 11, DARK, 2, 0], [43, 15, GREY, 1.5, 3], [46, 12, METAL, 2, 2], [49, 16, DARK, 2.5, 1],
    [52, 13, PLATE, 1.5, 0], [55, 17, A ? [9, 10, 8, 1] : DARK, 2, 2], [58, 12, DARK, 2.5, 3],
    [61, 16, A ? [9, 10, 8, 1] : GREY, 1.5, 1], [64, 13, PLATE, 1.5, 2], [67, 15, DARK, 2, 0],
    [70, 12, METAL, 2, 3], [73, 14, GREY, 1.5, 1],
  ];
  return FRAMES.map((f) => {
    const p = f - 1;
    const ph = p < 0 ? 0.6 : (p * Math.PI) / 2;
    const tip = (x0: number, len: number, i: number) => {
      const spread = (x0 - 56) * 0.55;
      return { x: x0 + spread + Math.sin(ph + i * 1.3) * (1 + len / 9), y: Math.min(100, 85 + len) };
    };
    const ringPt = (k: number, n: number) => {
      const a = (k / n) * Math.PI * 2;
      return [56 + Math.cos(a) * 45.5, 15 + Math.sin(a) * 5.8];
    };
    return boss(DW, DH, (c) => {
      const { g, M, F, S } = c;
      const P = A ? PLATE_A : PLATE;
      // гало-кольцо подвеса (позади всего) и его огни
      F(M().ellipse(56, 15, 47, 7).sub(M().ellipse(56, 15, 44, 4.5)), GREY);
      for (let k = 0; k < 20; k++) {
        const [x, y] = ringPt(k, 20);
        const on = (k + (p < 0 ? 0 : p)) % 4 === 0;
        if (g.get(Math.floor(x), Math.floor(y)) >= 0) g.set(x - 0.5, y - 0.5, A ? (on ? 11 : 10) : on ? 7 : 9);
      }
      // пилоны подвеса к потолку
      for (const side of [0, 1]) {
        const fl = (m: Mask) => (side ? m.flip() : m);
        F(fl(M().line(30, 0, 35, 24, 5)), DARK);
        F(fl(M().line(25, 0, 22, 22, 2)), METAL);
        F(fl(M().rect(28, 7, 8, 3)), STEEL);
        F(fl(M().rect(29, 15, 8, 3)), STEEL);
      }
      F(M().rect(48, 0, 16, 4), STEEL);
      g.rect(50, 1, 12, 1, 6);
      F(M().line(56, 3, 56, 7, 3), DARK);
      // пучок кабелей-поводков из пояса
      cables.forEach(([x0, len, mat, t], i) => {
        const e = tip(x0, len, i);
        F(M().bez(x0, 84, (x0 * 2 + e.x) / 3, 84 + len * 0.7, e.x, e.y, t, 10), mat);
      });
      // боковые шланги и позвоночник
      for (const side of [0, 1]) {
        const fl = (m: Mask) => (side ? m.flip() : m);
        F(fl(M().bez(36, 58, 36, 74, 45, 82, 2.5)), DARK);
        F(fl(M().bez(40, 60, 42, 72, 48, 80, 1.5)), A ? [9, 10, 8, 1] : METAL);
      }
      for (let k = 0; k < 4; k++) F(M().ellipse(56, 68 + k * 4, 12 - k, 2.8), k % 2 ? METAL : STEEL);
      // таз-воронка с гнёздами кабелей
      F(M().poly([37, 78, 75, 78, 70, 87, 42, 87]), P);
      g.rect(39, 80, 34, 1, 5);
      g.stripes(M().rect(42, 82, 28, 3), A ? 10 : 13, 1, 2, 1, false);
      // торс
      const torso = M().poly([38, 27, 74, 27, 82, 33, 80, 58, 70, 68, 42, 68, 32, 58, 30, 33]);
      F(torso, P);
      g.tint(M().rect(0, 56, DW, 14), A ? { 5: 4 } : { 6: 5 });
      // швы панелей
      g.rect(55, 28, 2, 4, 5);
      g.rect(36, 61, 40, 1, 5);
      g.rect(40, 64, 32, 1, A ? 9 : 4);
      // рёбра-радиаторы по бокам
      for (const side of [0, 1])
        for (let k = 0; k < 5; k++) {
          const x = side ? mxw(33, 7) : 33, y = 36 + k * 4;
          g.rect(x, y, 7, 1, A ? 9 : 4);
          g.rect(x, y + 1, 7, 1, A ? 4 : 5);
        }
      // экран на груди
      F(M().rect(42, 32, 28, 19), STEEL);
      g.rect(44, 34, 24, 15, A ? 8 : 1);
      for (let y = 35; y < 49; y += 2) g.rect(44, y, 24, 1, A ? 9 : 2);
      // решётка под экраном
      for (const y of [53, 55, 57]) g.rect(47, y, 18, 1, A ? 9 : 3);
      for (const [x, y] of [[34, 31], [77, 31], [37, 57], [74, 57]]) rivet(g, x, y, A ? 6 : 7, 4);
      // ворот и шея
      F(M().poly([40, 24, 72, 24, 77, 29, 35, 29]), STEEL);
      for (let x = 42; x < 71; x += 4) g.set(x, 26, 6);
      F(M().rect(50, 25, 12, 5), DARK);
      g.rect(51, 26, 1, 3, 4);
      g.rect(60, 26, 1, 3, 4);
      // наплечники
      pauldron(c, 0, A);
      pauldron(c, 1, A);
      // голова
      F(M().line(43, 10, 37, 1, 1).line(68, 10, 74, 1, 1), GREY);
      F(M().rect(53, 1, 6, 6), STEEL);
      const head = M().poly([47, 5, 65, 5, 70, 10, 70, 22, 64, 28, 48, 28, 42, 22, 42, 10]);
      F(head, P);
      g.rect(44, 11, 24, 1, 5);
      F(M().rect(44, 13, 24, 6), DARK);
      for (const x of [49, 56, 63]) S(M().ellipse(x, 16, x === 56 ? 2.6 : 2, 2), R_RED.slice(0, 3), { line: 1, k: 0.6 });
      for (let y = 21; y <= 25; y += 2) g.rect(50, y, 12, 1, 3);
      for (const side of [0, 1]) {
        g.rect(side ? mxw(43, 3) : 43, 20, 3, 1, A ? 10 : 4);
        g.rect(side ? mxw(66, 2) : 66, 7, 2, 1, 5);
      }
      if (A) {
        // красные трещины-швы по белым плитам
        px(g, ['a..', '.a.', '.aa', '..a'], 36, 42);
        px(g, ['..a', '.a.', 'aa.', 'a..'], 73, 46);
        px(g, ['a.', 'aa', '.a'], 45, 7);
      }
    }, ({ g }) => {
      // объективы
      const pulse = p < 0 ? 0 : p;
      for (const x of [49, 63]) {
        if (A) g.light(x, 16, 11, 10);
        else g.set(x - 1, 15, pulse % 2 ? 11 : 10);
      }
      g.light(56, 16, 11, A ? 11 : 10);
      g.set(55, 15, 7);
      // карта маршрутов: узлы, связи, бегущий курсор (злой — тревожная развёртка)
      const nodes = [[47, 37], [52, 44], [57, 36], [62, 42], [65, 37], [56, 46], [48, 45]];
      const links = [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [5, 3], [6, 1]];
      for (const [a, b] of links) {
        const [x0, y0] = nodes[a], [x1, y1] = nodes[b];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let i = 0; i <= n; i++) g.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, A ? 10 : 9);
      }
      nodes.forEach(([x, y], i) => g.set(x, y, i === (pulse + 1) % nodes.length ? (A ? 7 : 14) : A ? 11 : 10));
      if (A) {
        const yy = 35 + ((pulse * 4) % 14);
        g.rect(44, yy, 24, 1, 10);
        g.rect(44, 34, 24, 1, pulse % 2 ? 11 : 10);
        g.rect(44, 48, 24, 1, pulse % 2 ? 10 : 11);
      } else {
        g.rect(45, 35, 6, 1, 10);
        g.rect(63, 35, 3, 1, pulse % 2 ? 11 : 9);
      }
      // решётка под экраном светится у злого
      if (A) for (const y of [53, 55, 57]) {
        g.rect(48, y, 16, 1, 10);
        g.rect(54, y, 4, 1, 11);
      }
      // огни стоек на плечах
      pauldronLights(g, 0, f, A);
      pauldronLights(g, 1, f, A);
      // наконечники кабелей
      cables.forEach(([x0, len, , , kind], i) => {
        const e = tip(x0, len, i);
        const x = Math.round(e.x), y = Math.round(e.y) + 1;
        if (kind === 0) {
          g.rect(x - 1, y - 1, 2, 2, 5);
          g.set(x - 1, y, 1);
          g.set(x, y, A ? 11 : 14);
        } else if (kind === 1) {
          g.rect(x - 1, y - 1, 3, 1, 6);
          g.set(x - 1, y, 1);
          g.set(x + 1, y, 1);
        } else if (kind === 2) {
          g.set(x - 1, y, 13);
          g.set(x, y, 14);
        } else {
          // ошейник-«поводок»: разомкнутое кольцо
          px(g, ['.666.', '6...6', '6...6', '.6.6.'], x - 2, Math.min(DH - 4, y - 1));
          g.set(x, Math.min(DH - 4, y - 1), 10);
        }
      });
      // огоньки антенн
      g.light(37, 1, f % 2 ? 11 : 9);
      g.light(74, 1, f % 2 ? 9 : 11);
    });
  });
}

/** Наплечники отдельно: рисуются поверх рук, чтобы рука выходила из-под стойки */
export function dispatcherCaps(A: boolean): Sprite {
  return boss(DW, DH, (c) => {
    pauldron(c, 0, A);
    pauldron(c, 1, A);
  }, ({ g }) => {
    pauldronLights(g, 0, 1, A);
    pauldronLights(g, 1, 1, A);
  });
}

// ---------------------------------------------------------------------------
// Руки: плечо (от плечевого шарнира до локтя) и предплечье с клешнёй (от локтя).
// Спрайт квадратный, шарнир — в центре.

const UPPER_S = 64;
const FORE_S = 76;

function armGrid(S: number, draw: (g: Grid, M: () => Mask, F: (m: Mask, mat: Mat) => void) => void, post?: (g: Grid) => void): Sprite {
  const g = new Grid(S, S);
  const M = () => new Mask(S, S);
  draw(g, M, (m, [b, hi, lo, line = 1]) => g.fill(m, b, hi, lo, line));
  g.outline(0);
  post?.(g);
  return g.toSprite();
}

/** Пластина-трапеция вдоль оси: от (x0, y0) полуширины w0 до (x1, y1) полуширины w1 */
function plate(M: () => Mask, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
  return M().poly([x0 + nx * w0, y0 + ny * w0, x1 + nx * w1, y1 + ny * w1, x1 - nx * w1, y1 - ny * w1, x0 - nx * w0, y0 - ny * w0]);
}

function upperArm(a: number, A: boolean): Sprite {
  const o = UPPER_S / 2;
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const at = (k: number, off = 0) => [o + dx * ARM_UPPER * k + nx * off, o + dy * ARM_UPPER * k + ny * off] as const;
  return armGrid(UPPER_S, (g, M, F) => {
    const [ex, ey] = at(1);
    // гидроцилиндр снизу пластины (виден по краю)
    const [h0x, h0y] = at(0.1, 4.6), [h1x, h1y] = at(0.92, 4);
    F(M().line(h0x, h0y, h1x, h1y, 2.5), METAL);
    g.shade(M().ellipse(o, o, 5, 5), R_STEEL, { line: 1 });
    // броневая пластина плеча
    const [p0x, p0y] = at(0.12), [p1x, p1y] = at(0.86);
    F(plate(M, p0x, p0y, p1x, p1y, 5.5, 4.5), A ? PLATE_A : PLATE);
    // шов и бандаж
    const [m0x, m0y] = at(0.2), [m1x, m1y] = at(0.48);
    F(M().line(m0x, m0y, m1x, m1y, 1), A ? [6, 6, 6, -1] : [7, 7, 7, -1]);
    const [b0x, b0y] = at(0.62, -5), [b1x, b1y] = at(0.62, 5);
    F(M().line(b0x, b0y, b1x, b1y, 2.5), A ? [10, 11, 9, 1] : STEEL);
    g.shade(M().ellipse(ex, ey, 4.2, 4.2), R_METAL, { line: 1 });
  }, (g) => {
    const [ex, ey] = at(1);
    g.set(ex - 1, ey - 1, 5);
  });
}

function foreArm(a: number, open: boolean, A: boolean): Sprite {
  const o = FORE_S / 2;
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const at = (dist: number, off = 0) => [o + dx * dist + nx * off, o + dy * dist + ny * off] as const;
  const wrist = ARM_FORE - 4;
  const fingers = open ? [-0.85, 0, 0.85] : [-0.35, 0, 0.35];
  return armGrid(FORE_S, (g, M, F) => {
    const [wx, wy] = at(wrist);
    // пальцы клешни (под ладонью)
    const [px0, py0] = at(ARM_FORE);
    for (const rel of fingers) {
      const a1 = a + rel;
      const bx = px0 + Math.cos(a1) * 2, by = py0 + Math.sin(a1) * 2;
      const kx = bx + Math.cos(a1) * 6, ky = by + Math.sin(a1) * 6;
      const a2 = open ? a1 + rel * 0.45 : a1 - Math.sign(rel) * 0.75;
      const tx = kx + Math.cos(a2) * 5, ty = ky + Math.sin(a2) * 5;
      F(M().line(bx, by, kx, ky, 3).line(kx, ky, tx, ty, 2.2), METAL);
    }
    // шланг вдоль предплечья
    const [h0x, h0y] = at(2, -4.2), [h1x, h1y] = at(wrist - 1, -3.6);
    F(M().line(h0x, h0y, h1x, h1y, 2), A ? [9, 10, 8, 1] : DARK);
    // броня предплечья
    const [p0x, p0y] = at(3);
    F(plate(M, p0x, p0y, wx, wy, 4.8, 4), A ? PLATE_A : PLATE);
    const [s0x, s0y] = at(wrist * 0.5, -4.5), [s1x, s1y] = at(wrist * 0.5, 4.5);
    F(M().line(s0x, s0y, s1x, s1y, 2), A ? [10, 11, 9, 1] : STEEL);
    // запястье
    const [r0x, r0y] = at(wrist, -5), [r1x, r1y] = at(wrist, 5);
    F(M().line(r0x, r0y, r1x, r1y, 3), DARK);
    // ладонь с излучателем
    g.shade(M().ellipse(px0, py0, 4.6, 4.6), R_STEEL, { line: 1 });
  }, (g) => {
    const [px0, py0] = at(ARM_FORE);
    g.light(px0, py0, open ? 11 : A ? 10 : 9, open ? 10 : -1);
    for (const rel of fingers) {
      const a1 = a + rel;
      g.set(px0 + Math.cos(a1) * 8, py0 + Math.sin(a1) * 8, 6);
    }
  });
}

/** Ленивый кэш спрайтов рук: [настроение][угол] */
const upperCache: Sprite[][] = [[], []];
const foreCache: Sprite[][][] = [[[], []], [[], []]];

export const armIndex = (a: number) => ((Math.round((a / (Math.PI * 2)) * ARM_STEPS) % ARM_STEPS) + ARM_STEPS) % ARM_STEPS;
export const armAngle = (i: number) => (i / ARM_STEPS) * Math.PI * 2;

export function upperArmSprite(i: number, A: boolean): Sprite {
  const m = A ? 1 : 0;
  return (upperCache[m][i] ??= upperArm(armAngle(i), A));
}

export function foreArmSprite(i: number, open: boolean, A: boolean): Sprite {
  const m = A ? 1 : 0, k = open ? 1 : 0;
  return (foreCache[m][k][i] ??= foreArm(armAngle(i), open, A));
}

export const UPPER_HALF = UPPER_S / 2;
export const FORE_HALF = FORE_S / 2;
