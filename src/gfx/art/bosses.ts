import type { Sprite } from '../sprite';
import { Grid, Mask, hash, type ShadeOpts } from './pix';

// Боссы «Нижнего яруса»: семь мини-боссов ярусов улья и финальный — Диспетчер.
// Каждый собирается из масок: плоские детали — с фаской (свет сверху-слева), круглые —
// объёмной заливкой по рампе с дизерингом. В конце общая чёрная обводка, затем
// «светящиеся» детали без обводки (лампы, блики, лопасти).
//
// Кадры: [0] — покой, [1..4] — цикл движения (рендер крутит их по e.anim).

type Mat = [base: number, hi: number, lo: number, line?: number];
const STEEL: Mat = [4, 5, 3, 1];
const METAL: Mat = [3, 4, 2, 1];
const DARK: Mat = [2, 3, 1, 1];
const CHROME: Mat = [6, 7, 4, 1];
const RED: Mat = [9, 10, 8, 1];
const AMBER: Mat = [12, 13, 8, 1];
const PAINT: Mat = [13, 14, 12, 1];
const CONC: Mat = [5, 6, 4, 1];
const WHITE: Mat = [6, 7, 5, 1];
const GREY: Mat = [5, 6, 3, 1];

// рампы для объёмной заливки (тёмный → светлый)
const R_STEEL = [1, 2, 3, 4, 5];
const R_METAL = [1, 2, 3, 4];
const R_CHROME = [3, 4, 5, 6, 7];
const R_CONC = [3, 4, 5, 6];
const R_BONE = [5, 6, 7];
const R_TARP = [1, 2, 3];
const R_RED = [8, 9, 10, 11];
const R_HOT = [9, 10, 11, 14];
const R_AMBER = [12, 13, 14];

/** Покой + четыре кадра цикла */
const FRAMES = [0, 1, 2, 3, 4];

interface Ctx {
  g: Grid;
  W: number;
  H: number;
  M: () => Mask;
  /** Залить маску материалом с фаской */
  F: (m: Mask, mat: Mat, line?: number) => void;
  /** Объёмная заливка по рампе (с контуром 1) */
  S: (m: Mask, ramp: number[], o?: ShadeOpts) => void;
}

function boss(W: number, H: number, draw: (c: Ctx) => void, post?: (c: Ctx) => void): Sprite {
  const g = new Grid(W, H);
  const c: Ctx = {
    g, W, H,
    M: () => new Mask(W, H),
    F: (m, [b, hi, lo, line = 1], l = line) => g.fill(m, b, hi, lo, l),
    S: (m, ramp, o = {}) => g.shade(m, ramp, { line: 1, ...o }),
  };
  draw(c);
  g.outline(0);
  post?.(c);
  return g.toSprite();
}

/** Пиксели строками поверх (детали), x/y — левый верхний угол */
function px(g: Grid, rows: string[], x: number, y: number) {
  g.rows(rows, x, y);
}

/** Отражённая координата x для прямоугольника ширины w */
const mx = (W: number, x: number, w = 1) => W - x - w;

/** Звенья цепи вдоль отрезка: чередование светлых и тёмных пикселей */
function chain(g: Grid, x0: number, y0: number, x1: number, y1: number, a = 6, b = 4, phase = 0) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    g.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, (i + phase) % 3 === 2 ? 1 : (i + phase) % 3 ? b : a);
  }
}

/** Заклёпка: светлая точка с тенью снизу-справа */
function rivet(g: Grid, x: number, y: number, c = 5, sh = 2) {
  g.set(x, y, c);
  g.set(x + 1, y + 1, sh);
}

// ---------------------------------------------------------------------------
// 1. СТРАЖ — охранный мех складов и сортировочных: двуногий, бронированный,
//    прожектор вместо глаза, полосы «опасность», ржавчина и царапины.
export function sentinelArt(): Sprite[] {
  return FRAMES.map((f) =>
    boss(38, 38, ({ g, W, M, F, S }) => {
      const p = f - 1;
      const lift = [p === 0 ? 3 : p === 1 ? 1 : 0, p === 2 ? 3 : p === 3 ? 1 : 0];
      const by = p === 1 || p === 3 ? 1 : 0;
      const Y = (pts: number[]) => pts.map((v, i) => (i % 2 ? v + by : v));
      // ноги
      for (const side of [0, 1]) {
        const l = lift[side];
        const fl = (m: Mask) => (side ? m.flip() : m);
        const hip = [14.5, 22 + by], knee = [9, 27.5 + by - l * 0.6], ank = [10.5, 32.5 - l];
        F(fl(M().line(hip[0], hip[1], knee[0], knee[1], 5)), METAL);
        F(fl(M().line(knee[0], knee[1], ank[0], ank[1], 4)), STEEL);
        g.fill(fl(M().line(12.5, 23 + by, 11.5, 27 + by - l * 0.5, 1)), 5, 5, 5, -1);
        S(fl(M().ellipse(knee[0], knee[1], 2.6, 2.6)), R_STEEL);
        F(fl(M().poly([4, 37 - l, 5, 33 - l, 16, 33 - l, 18, 37 - l])), METAL);
        g.stripes(fl(M().rect(7, 34 - l, 8, 2)), 13, 1, 2, 1, false);
        const kx = side ? mx(W, Math.round(knee[0]) - 1) : Math.round(knee[0]) - 1;
        g.set(kx, Math.round(knee[1]) - 1, 6);
      }
      // таз и юбка с полосами
      F(M().rect(13, 18 + by, 12, 5), DARK);
      const skirt = M().poly(Y([15.5, 21, 22.5, 21, 21.5, 26, 16.5, 26]));
      F(skirt, AMBER);
      g.stripes(skirt, 13, 1, 2, 1);
      // пулемётные гондолы на плечах
      for (const side of [0, 1]) {
        const fl = (m: Mask) => (side ? m.flip() : m);
        F(fl(M().rect(7, 11 + by, 5, 5)), DARK);
        for (const bx of [2, 6]) {
          F(fl(M().rect(bx, 18 + by, 2, 5)), DARK);
          g.rect(side ? mx(W, bx, 2) : bx, 22 + by, 2, 1, 1);
        }
        const pod = fl(M().rect(1, 7 + by, 9, 12));
        F(pod, STEEL);
        g.stripes(fl(M().rect(2, 8 + by, 7, 3)), 13, 1, 2, side ? -1 : 1, false);
        const x0 = side ? mx(W, 2, 7) : 2;
        for (let y = 13; y <= 16; y += 2) g.rect(x0, y + by, 7, 1, 3);
        g.speckle(fl(M().rect(1, 12 + by, 9, 7)), [12, 9], 0.1, 11 + side);
        rivet(g, side ? mx(W, 3) : 2, 17 + by, 5, 3);
      }
      // корпус
      const hull = M().poly(Y([11, 5, 27, 5, 30, 8, 30, 18, 27, 21, 11, 21, 8, 18, 8, 8]));
      F(hull, STEEL);
      g.speckle(M().rect(9, 16 + by, 21, 5).and(hull), [12, 9, 3], 0.12, 5);
      g.rect(12, 8 + by, 1, 11, 3);
      g.rect(26, 8 + by, 1, 11, 3);
      g.rect(13, 8 + by, 1, 11, 5);
      for (const [x, y] of [[10, 9], [10, 17], [28, 9], [28, 17]]) rivet(g, x, y + by, 5, 2);
      // царапины
      px(g, ['6.', '.6', '.5'], 9, 12 + by);
      px(g, ['.6', '6.'], 27, 14 + by);
      // козырёк-бровь с полосами
      F(M().poly(Y([10, 3, 28, 3, 31, 7, 7, 7])), METAL);
      g.stripes(M().rect(11, 4 + by, 17, 2), 13, 2, 2, 1, false);
      // антенна
      F(M().line(12, 3 + by, 11, 0.5 + by, 1), STEEL);
      // прожектор
      const cx = 19, cy = 12.5 + by;
      S(M().ellipse(cx, cy, 6, 6), R_STEEL, { k: 0.7 });
      F(M().ellipse(cx, cy, 4.5, 4.5), [12, 13, 8, 1]);
      S(M().ellipse(cx, cy, 3.6, 3.6), [...R_AMBER, 14], { line: -1, k: 0.7, amb: 0.4 });
      for (const [dx, dy] of [[-1, -6], [-1, 5], [-6, -1], [5, -1]]) g.set(cx + dx, cy + dy, 5);
      // решётка под прожектором
      g.rect(15, 18 + by, 9, 2, 1);
      g.rect(16, 19 + by, 7, 1, 3);
    }, ({ g }) => {
      const p = f - 1;
      const by = p === 1 || p === 3 ? 1 : 0;
      // блик прожектора «сканирует» стороны
      const o = [0, -1, 0, 1, 0][f];
      g.rect(17 + o, 10 + by, 2, 1, 7);
      g.set(17 + o, 11 + by, 7);
      // огни
      g.light(11, 0 + by, p % 2 === 0 ? 11 : 9, -1);
      g.light(28, 9 + by, f % 2 ? 10 : 11, -1);
    }),
  );
}

// ---------------------------------------------------------------------------
// 2. АРАХНА — паук-чистильщик канализационных труб (вид сверху, голова вправо):
//    длинные ржавые ноги, бак с осадком, вращающиеся щётки, сопло, капли шлама.
export function arachnaArt(): Sprite[] {
  return FRAMES.map((f) =>
    boss(50, 42, ({ g, M, F, S }) => {
      const p = f - 1;
      const cy = 21;
      // щётки на кронштейнах
      for (const ys of [-1, 1]) {
        const bx = 42.5, by2 = cy + ys * 6.5;
        F(M().line(36, cy + ys * 3, bx - 1, by2, 2), METAL);
        S(M().ellipse(bx, by2, 4.2, 4.2), [1, 2, 3, 4], { k: 0.6 });
        g.set(bx - 0.5, by2 - 0.5, 6);
      }
      // ноги: 4 пары, крепятся к груди; ходьба «тетраподом»
      const hips = [32, 29.5, 27, 24.5];
      const angs = [-50, -78, -108, -146];
      const bend = [30, 14, -14, -30];
      const swing = p < 0 ? 0 : [8, 0, -8, 0][p];
      for (let i = 0; i < 4; i++)
        for (const ys of [-1, 1]) {
          const grp = (i + (ys > 0 ? 1 : 0)) % 2 ? 1 : -1;
          const a = ((angs[i] + swing * grp) * Math.PI) / 180;
          const b = a + (bend[i] * Math.PI) / 180;
          const hx = hips[i], hy = cy + ys * 3;
          const kx = hx + Math.cos(a) * 10, ky = hy + ys * Math.abs(Math.sin(a)) * 8.6;
          const fx = kx + Math.cos(b) * 9.5, fy = ky + ys * Math.min(17.4 - Math.abs(ky - hy), Math.abs(Math.sin(b)) * 8.5);
          const fem = M().line(hx, hy, kx, ky, 2.6);
          F(fem, STEEL);
          g.speckle(fem, [12, 9], 0.3, 30 + i * 2 + (ys > 0 ? 1 : 0));
          F(M().line(kx, ky, fx, fy, 1.6), GREY);
          S(M().ellipse(kx, ky, 1.5, 1.5), [2, 4, 6], { k: 0.6 });
          g.set(fx, fy, 1);
        }
      // бак с осадком (брюшко)
      const tank = M().ellipse(13.5, cy, 10.5, 7.8);
      S(tank, [1, 2, 3, 4, 5, 6], { k: 0.75, amb: 0.45 });
      g.speckle(M().ellipse(13, cy + 3.5, 9, 4.5).and(tank), [12, 9, 8], 0.25, 3);
      // обручи бака
      for (const x of [7, 13, 19]) {
        g.tint(M().rect(x, 0, 1, 42).and(tank), { 6: 3, 5: 3, 4: 2, 3: 2, 2: 1, 12: 8, 9: 8 });
        g.tint(M().rect(x + 1, 0, 1, 42).and(tank), { 3: 4, 2: 3, 4: 5, 5: 6 });
      }
      // полоса «опасность» между обручами
      g.stripes(M().rect(15, 0, 3, 42).and(M().ellipse(13.5, cy, 9.5, 6.8)), 13, 1, 2, 1, false);
      // люк с болтами
      F(M().rect(8, cy - 5, 5, 4), DARK);
      g.rect(9, cy - 4, 3, 1, 3);
      g.set(8, cy - 5, 6);
      g.set(12, cy - 5, 6);
      // потёки шлама по борту
      for (const [x, l] of [[5, 3], [10, 4], [16, 3]] as const) {
        g.rect(x, cy + 4, 1, l, 12);
        g.set(x, cy + 4 + l, 8);
      }
      // сливной патрубок сзади
      F(M().rect(0, cy - 1.5, 4, 3), METAL);
      g.set(0, cy - 1, 12);
      // грудь
      const th = M().ellipse(28, cy, 5.8, 5.5);
      S(th, R_STEEL, { k: 0.7 });
      g.rect(23, cy, 11, 1, 2);
      // голова
      S(M().ellipse(35.5, cy, 4.5, 5.2), [2, 3, 4, 5, 6], { k: 0.75 });
      F(M().rect(37, cy - 3, 3, 6), DARK);
      // сопло
      F(M().rect(40, cy - 1, 7, 2), METAL);
      g.rect(46, cy - 1, 1, 2, 1);
    }, ({ g }) => {
      const p = f - 1;
      const cy = 21;
      // щетина щёток вращается
      for (const ys of [-1, 1]) {
        const bx = 42.5, by2 = cy + ys * 6.5;
        for (let k = 0; k < 10; k++) {
          const a = (k * Math.PI) / 5 + (p < 0 ? 0 : p * 0.31) * ys;
          const x = Math.floor(bx + Math.cos(a) * 3.3), y = Math.floor(by2 + Math.sin(a) * 3.3);
          g.set(x, y, k % 2 ? 7 : 5);
        }
      }
      // глаза-фонари
      g.light(38, cy - 2, 11, 10);
      g.light(38, cy + 1, 11, 10);
      g.set(36, cy - 4, 13);
      g.set(36, cy + 3, 13);
      // сигнальная лампа на груди
      g.light(28, cy - 3, p % 2 ? 13 : 14, -1);
      // струя из сопла и капли шлама сзади
      if (p >= 0) {
        g.set(47 + (p % 2), cy - 1 + (p >> 1), 13);
        if (p % 2) g.set(49, cy - 1 + ((p + 1) >> 1) % 2, 12);
        const d = [[1, cy + 2], [2, cy + 4], [1, cy + 6], [2, cy + 8]][p];
        g.set(d[0], d[1], 12);
        g.set(d[0], d[1] + 1, 8);
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// 3. СБОРОЧНЫЙ УЛЕЙ — штамповочный модуль литейного яруса: шестигранные плиты
//    «дышат» вокруг раскалённой печи, по краям пристыкованы дроны.
export function hiveArt(): Sprite[] {
  return FRAMES.map((f) =>
    boss(42, 42, ({ g, M, F, S }) => {
      const p = f - 1;
      const cx = 21, cy = 21;
      const gap = p === 1 || p === 2 ? 1 : 0;
      // стыковочные фермы и дроны
      for (let k = 0; k < 6; k++) {
        const a = ((30 + 60 * k) * Math.PI) / 180;
        const c = Math.cos(a), s = Math.sin(a);
        F(M().line(cx + c * 11, cy + s * 11, cx + c * 16, cy + s * 16, 3), METAL);
        F(M().line(cx + c * 15.5 - s * 2.5, cy + s * 15.5 + c * 2.5, cx + c * 15.5 + s * 2.5, cy + s * 15.5 - c * 2.5, 1.6), STEEL);
        const dx = cx + c * 18.3, dy = cy + s * 18.3;
        S(M().ellipse(dx, dy, 2.6, 2.3), [2, 3, 4, 5], { k: 0.6 });
      }
      // свечение под плитами (видно в щелях)
      const hex = (r: number, ox = 0, oy = 0) => {
        const pts: number[] = [];
        for (let j = 0; j < 6; j++) {
          const b = (j * Math.PI) / 3;
          pts.push(cx + ox + Math.cos(b) * r, cy + oy + Math.sin(b) * r * 0.96);
        }
        return pts;
      };
      F(M().poly(hex(13.6)), [10, 11, 9, 1]);
      // шесть плит, яркость по ориентации к свету
      const mats: Mat[] = [[5, 6, 4, 1], [4, 5, 3, 1], [3, 4, 2, 1], [2, 3, 1, 1]];
      for (let k = 0; k < 6; k++) {
        const a0 = (k * Math.PI) / 3, a1 = ((k + 1) * Math.PI) / 3, am = (a0 + a1) / 2;
        const ox = Math.cos(am) * gap * 0.9, oy = Math.sin(am) * gap * 0.9;
        const R = 13.4, r = 7.3;
        const pts = [
          cx + ox + Math.cos(a0) * r, cy + oy + Math.sin(a0) * r,
          cx + ox + Math.cos(a0) * R, cy + oy + Math.sin(a0) * R * 0.96,
          cx + ox + Math.cos(a1) * R, cy + oy + Math.sin(a1) * R * 0.96,
          cx + ox + Math.cos(a1) * r, cy + oy + Math.sin(a1) * r,
        ];
        const lam = -(Math.cos(am) * -0.6 + Math.sin(am) * -0.8);
        const mi = lam < -0.6 ? 0 : lam < 0.1 ? 1 : lam < 0.7 ? 2 : 3;
        const plate = M().poly(pts);
        const [pb, ph, pl] = mats[mi];
        g.fill(plate, pb, ph, pl, -1);
        if (!gap) for (const a of [a0, a1]) for (let r = 7.5; r <= 13; r += 0.5) g.set(cx - 0.5 + Math.cos(a) * r, cy - 0.5 + Math.sin(a) * r * 0.96, 1);
        // штамп-поршень и заклёпка на плите
        const sx = cx + ox + Math.cos(am) * 10.4, sy = cy + oy + Math.sin(am) * 10.2;
        if (k % 2 === 0) {
          const push = p < 0 ? 0 : (p + k / 2) % 4 < 2 ? 1 : 0;
          const pm = M().ellipse(sx - Math.cos(am) * push, sy - Math.sin(am) * push, 1.8, 1.8);
          S(pm, [2, 4, 6], { k: 0.6 });
        } else {
          g.set(sx, sy, mi >= 2 ? 4 : 6);
          g.set(sx + 1, sy + 1, 1);
          // полосы «опасность» на нижних плитах
          const st = M().poly(pts).and(M().ellipse(cx + ox, cy + oy, 12, 12)).sub(M().ellipse(cx, cy, 9.5, 9.5));
          if (k === 1) g.stripes(st, 13, 1, 2, 1);
        }
      }
      // кольцо печи
      S(M().ellipse(cx, cy, 7, 7), [1, 2, 3, 4], { k: 0.6 });
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 + Math.PI / 6;
        g.set(cx - 0.5 + Math.cos(a) * 6, cy - 0.5 + Math.sin(a) * 6, 5);
      }
      // раскалённое ядро
      const heat = p < 0 ? 0.55 : [0.45, 0.6, 0.75, 0.6][p];
      S(M().ellipse(cx, cy, 5, 5), R_HOT, { line: 0, amb: heat, k: 0.45, lx: 0, ly: 0 });
      // жерло: решётка
      g.rect(cx - 3, cy - 4, 1, 8, 8);
      g.rect(cx + 2, cy - 4, 1, 8, 8);
      g.rect(cx - 1, cy - 5, 2, 1, 9);
      g.rect(cx - 1, cy + 4, 2, 1, 9);
    }, ({ g }) => {
      const p = f - 1;
      const cx = 21, cy = 21;
      // сердцевина
      g.rect(cx - 1, cy - 1, 2, 2, 14);
      if (p === 2) g.set(cx - 1, cy - 1, 7);
      // дроны: глаз мигает по очереди, роторы
      for (let k = 0; k < 6; k++) {
        const a = ((30 + 60 * k) * Math.PI) / 180;
        const dx = cx + Math.cos(a) * 18.3, dy = cy + Math.sin(a) * 18.3;
        const on = p >= 0 ? (k + p) % 3 === 0 : k % 3 === 0;
        g.set(dx - 0.5 + Math.cos(a), dy - 0.5 + Math.sin(a), on ? 11 : 10);
        const rx = Math.floor(dx - 0.5 - Math.sin(a) * 2), ry = Math.floor(dy - 0.5 + Math.cos(a) * 2);
        g.set(rx, ry, (p + k) % 2 ? 6 : 4);
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// 4. ГОЛИАФ — тяжёлый грузчик литейного яруса (вид сбоку, вправо): массивная рама,
//    гидравлические вилы, контейнер на спине с рельсотроном, янтарная окраска.
export function goliathArt(): Sprite[] {
  return FRAMES.map((f) =>
    boss(52, 48, ({ g, M, F, S }) => {
      const p = f - 1;
      const by = p === 1 || p === 3 ? 1 : 0;
      const Y = (pts: number[]) => pts.map((v, i) => (i % 2 ? v + by : v));
      const legAt = (dx: number, lift: number, thigh: Mat, shin: Mat, foot = thigh) => {
        const hip = [26 + dx, 31 + by], knee = [18 + dx, 38 - lift * 0.5], ank = [24 + dx, 43 - lift];
        F(M().line(hip[0], hip[1], knee[0], knee[1], 7), thigh);
        F(M().line(knee[0], knee[1], ank[0], ank[1], 5), shin);
        g.fill(M().line(hip[0] - 1, hip[1] + 3, knee[0] + 3, knee[1] + 1, 1), 5, 5, 5, -1);
        S(M().ellipse(knee[0], knee[1], 3.2, 3.2), R_STEEL);
        const footM = M().poly([ank[0] - 8, 47 - lift, ank[0] - 6, 42 - lift, ank[0] + 6, 42 - lift, ank[0] + 9, 47 - lift]);
        F(footM, foot);
        for (let x = ank[0] - 7; x <= ank[0] + 7; x += 2) g.set(x, 46 - lift, 1);
        g.stripes(M().rect(ank[0] - 4, 43 - lift, 9, 2), 13, 1, 2, 1, false);
      };
      // дальняя нога
      legAt(-5, p === 2 ? 2 : 0, DARK, METAL);
      // контейнер на спине: рыжий, гофрированный, ржавый
      const box = M().rect(2, 11 + by, 16, 17);
      F(box, RED);
      for (let x = 4; x < 17; x += 2) g.rect(x, 12 + by, 1, 15, 8);
      g.speckle(box, [12, 8, 13], 0.1, 9);
      g.rect(3, 13 + by, 14, 1, 1);
      g.rect(3, 25 + by, 14, 1, 1);
      px(g, ['dd.dd', 'd.d.d'], 6, 16 + by);
      // стойки рельсотрона
      F(M().rect(7, 7 + by, 3, 5), DARK);
      F(M().rect(14, 7 + by, 3, 5), DARK);
      // рельсотрон
      F(M().rect(3, 1 + by, 11, 9), STEEL);
      F(M().rect(13, 2 + by, 36, 2), STEEL);
      F(M().rect(13, 7 + by, 36, 2), METAL);
      F(M().rect(13, 4 + by, 35, 3), DARK);
      F(M().rect(47, 1 + by, 5, 9), METAL);
      g.rect(5, 3 + by, 7, 1, 13);
      g.rect(5, 5 + by, 7, 3, 3);
      // корпус-рама
      const body = M().poly(Y([14, 12, 38, 11, 42, 14, 42, 29, 37, 33, 17, 33, 13, 27]));
      F(body, STEEL);
      // янтарные бронеплиты с потёртой краской и номером
      for (const pl of [[18, 15, 27, 14.5, 27, 27, 18, 27.5], [28, 14.5, 34, 14.2, 35, 26.5, 28, 27]]) {
        const m = M().poly(Y(pl));
        F(m, [13, 14, 12, 1]);
        g.speckle(m, [12, 4, 3], 0.1, 21 + pl[0]);
      }
      px(g, ['111.111', '1.1...1', '1.1..1.', '1.1..1.', '111..1.'], 19, 17 + by);
      g.rect(29, 18 + by, 5, 1, 12);
      g.rect(29, 21 + by, 5, 1, 12);
      for (const [x, y] of [[19, 24], [25, 24], [29, 24], [32, 24]]) rivet(g, x, y + by, 14, 12);
      // полосы по низу
      const band = M().poly(Y([15, 29, 41, 29, 37, 32, 17, 32]));
      g.stripes(band, 13, 1, 2, 1, false);
      // выхлопные трубы
      F(M().rect(29, 6 + by, 2, 6), METAL);
      F(M().rect(32, 7 + by, 2, 5), METAL);
      // кабина с решёткой
      F(M().poly(Y([35, 13, 46, 15, 47, 24, 37, 27])), DARK);
      F(M().rect(38, 16 + by, 7, 6), [1, 12, 1, 1]);
      g.rect(38, 21 + by, 7, 1, 12);
      // плечо, гидравлика и вилы
      const fy = p < 0 ? 0 : [0, 1, 0, -1][p];
      F(M().rect(42, 21 + by + fy, 4, 17), STEEL);
      g.rect(43, 22 + by + fy, 1, 15, 3);
      F(M().poly([45, 34 + by + fy, 51, 35 + by + fy, 51, 37 + by + fy, 45, 37 + by + fy]), CHROME);
      g.fill(M().line(38, 28 + by, 42, 33 + by + fy, 1.4), 6, 7, 5, 1);
      S(M().ellipse(37, 27 + by, 3.4, 3.4), R_STEEL);
      // ближняя нога
      legAt(4, p === 0 ? 2 : 0, [13, 14, 12, 1], STEEL, STEEL);
    }, ({ g }) => {
      const p = f - 1;
      const by = p === 1 || p === 3 ? 1 : 0;
      // катушки рельсотрона, заряд бежит к дулу
      for (let i = 0; i < 8; i++) {
        const x = 15 + i * 4;
        const hot = p >= 0 && i % 4 === p;
        g.rect(x, 4 + by, 2, 3, hot ? 14 : 13);
        g.set(x + 1, 6 + by, hot ? 13 : 12);
      }
      g.rect(48, 4 + by, 3, 3, 1);
      g.set(49, 5 + by, p >= 0 && p % 2 ? 11 : 10);
      // глаз в кабине
      g.rect(42, 18 + by, 2, 1, 11);
      g.set(40, 18 + by, 10);
      // решётка кабины поверх
      for (const x of [39, 41, 43]) g.rect(x, 16 + by, 1, 5, 4);
      // маячок на кабине
      g.light(44, 14 + by, f % 2 ? 14 : 13, -1);
    }),
  );
}

// ---------------------------------------------------------------------------
// 5. КАСТОР и ПОЛЛУКС — парные патрульные андроиды жилого яруса: бетонно-серая
//    броня, визор со сканером, маячки (красный и янтарный), ручная пушка.
export function twinsArt(): Sprite[] {
  return FRAMES.map((f) =>
    boss(26, 38, ({ g, M, F, S }) => {
      const p = f - 1;
      const by = p === 1 || p === 3 ? 1 : 0;
      // ноги
      for (const side of [0, 1]) {
        const step = (p === 0 && side === 0) || (p === 2 && side === 1) ? 2 : 0;
        const x0 = side ? 14 : 9;
        F(M().rect(x0, 23 + by, 3, 6 - step - by), CONC);
        S(M().ellipse(x0 + 1.5, 29.5 - step, 2.2, 1.8), R_CONC);
        F(M().rect(x0, 31 - step, 3, 3), CONC);
        F(M().rect(x0 - (side ? 0 : 1), 34 - step, 4, 3), METAL);
        g.set(x0 + (side ? 3 : -1), 36 - step, 13);
      }
      // таз и пояс
      F(M().rect(8, 20 + by, 10, 3), DARK);
      g.rect(12, 21 + by, 2, 1, 13);
      g.set(9, 21 + by, 4);
      g.set(16, 21 + by, 4);
      // дальняя рука с дубинкой
      F(M().line(5, 13 + by, 4, 21 + by, 3), [4, 5, 3, 1]);
      F(M().rect(3, 20 + by, 3, 3), DARK);
      F(M().line(4, 22 + by, 3, 29 + by, 1.5), DARK);
      // торс
      const torso = M().poly([7, 11 + by, 19, 11 + by, 18, 20 + by, 8, 20 + by]);
      S(torso, [4, 5, 6, 7], { k: 0.45, amb: 0.5, dither: false });
      g.rect(12, 12 + by, 1, 6, 4);
      g.rect(9, 16 + by, 9, 1, 4);
      F(M().rect(9, 13 + by, 3, 2), PAINT);
      px(g, ['11.1', '.1.1'], 14, 13 + by);
      g.speckle(torso, [5, 4], 0.08, 4);
      g.rect(9, 19 + by, 8, 1, 4);
      // плечи
      S(M().ellipse(6.5, 12 + by, 3, 2.6), [3, 4, 5, 6], { amb: 0.6 });
      S(M().ellipse(19.5, 12 + by, 3, 2.6), [3, 4, 5, 6], { amb: 0.6 });
      // рука-пушка
      F(M().rect(19, 14 + by, 3, 4), DARK);
      F(M().rect(18, 17 + by, 5, 11), METAL);
      g.rect(19, 19 + by, 1, 7, 5);
      g.rect(21, 18 + by, 1, 8, 2);
      g.rect(18, 22 + by, 5, 1, 1);
      // шея и шлем
      F(M().rect(12, 9 + by, 2, 2), DARK);
      S(M().ellipse(13, 5.5 + by, 4, 4.6), [3, 4, 5, 6, 7], { k: 0.65 });
      // визор
      g.rect(9, 4 + by, 8, 3, 1);
      g.rect(10, 5 + by, 7, 1, 2);
      g.rect(10, 8 + by, 6, 1, 4);
      // гребень-маячок
      F(M().rect(12, 0 + by, 2, 2), DARK);
    }, ({ g }) => {
      const p = f - 1;
      const by = p === 1 || p === 3 ? 1 : 0;
      // сканер визора
      const sx = [13, 11, 13, 15, 13][f];
      g.set(sx, 5 + by, 11);
      g.set(sx + 1, 5 + by, 10);
      g.set(sx - 1, 5 + by, 9);
      // маячки: красный и янтарный по очереди
      const red = f % 2 === 0;
      g.light(5, 10 + by, red ? 11 : 9, -1);
      g.light(20, 10 + by, red ? 12 : 14, -1);
      g.set(12, 0 + by, red ? 11 : 9);
      g.set(13, 0 + by, red ? 12 : 14);
      // дуло
      g.rect(19, 27 + by, 3, 1, p >= 0 && p % 2 ? 11 : 10);
      // шокер дубинки
      g.set(3, 29 + by, f % 2 ? 14 : 13);
    }),
  );
}

// ---------------------------------------------------------------------------
// 6. ПАЛАЧ — коллектор долгов нижнего рынка: огромный хромированный киборг, клинки,
//    цепи с замком, рваный брезентовый плащ с капюшоном, лицевая плита-череп.
export function executionerArt(): Sprite[] {
  return FRAMES.map((f) =>
    boss(42, 42, ({ g, W, M, F, S }) => {
      const p = f - 1;
      const by = p === 1 || p === 3 ? 1 : 0;
      const flap = p < 0 ? 0 : [0, 1, 2, 1][p];
      // плащ-брезент с рваным краем
      const cape = M().poly([
        12, 9 + by, 30, 9 + by, 35, 22, 37, 37,
        36, 38 - flap, 33, 40, 30, 36, 27, 41 - flap, 24, 37, 21, 40, 18, 36 + flap, 15, 40, 12, 37, 9, 41 - flap, 6, 38,
        5, 37, 7, 22,
      ]);
      S(cape, R_TARP, { k: 0.5, amb: 0.45 });
      for (const x of [10, 15, 26, 31]) {
        const fold = M().line(x + 1, 14, x - (x < 21 ? 2 : -2) + flap * (x < 21 ? -0.5 : 0.5), 37, 1).and(cape);
        g.tint(fold, { 3: 1, 2: 1 });
      }
      g.speckle(cape, [8, 9], 0.06, 17);
      // ноги
      for (const side of [0, 1]) {
        const lift = (p === 0 && side === 0) || (p === 2 && side === 1) ? 2 : 0;
        const fl = (m: Mask) => (side ? m.flip() : m);
        F(fl(M().line(17, 25 + by, 16, 34 - lift, 5)), CHROME);
        S(fl(M().ellipse(16, 30 - lift, 2.4, 2.2)), R_STEEL);
        F(fl(M().poly([12, 39 - lift, 13, 34 - lift, 19, 34 - lift, 20, 39 - lift])), DARK);
        g.set(side ? mx(W, 16) : 16, 29 - lift, 7);
      }
      // руки и клинки
      const sw = p < 0 ? 0 : [0, 1, 0, -1][p];
      for (const side of [0, 1]) {
        const fl = (m: Mask) => (side ? m.flip() : m);
        const s = side ? -sw : sw;
        S(fl(M().line(11, 13 + by, 8, 21 + by, 4.5)), R_CHROME);
        const blade = fl(M().poly([8, 21 + by, 11, 23 + by, 6 - s, 33 + by, 1 - s, 40, 2 - s, 30 + by]));
        F(blade, [5, 7, 4, 1]);
        const edge = fl(M().line(2 - s, 31 + by, 1.5 - s, 39, 1));
        g.fill(edge, 7, 7, 7, -1);
        const blood = fl(M().line(4 - s, 32 + by, 3 - s, 36, 1));
        g.fill(blood, 9, 10, 9, -1);
        F(fl(M().rect(6, 20 + by, 6, 4)), DARK);
        const bx = side ? mx(W, 7, 4) : 7;
        g.rect(bx, 21 + by, 4, 1, 13);
      }
      // торс: тёмный каркас и хромовые рёбра
      F(M().poly([13, 10 + by, 29, 10 + by, 27, 25 + by, 15, 25 + by]), DARK);
      for (let y = 13; y < 23; y += 3) {
        g.rect(15, y + by, 4, 1, 7);
        g.rect(15, y + 1 + by, 4, 1, 4);
        g.rect(mx(W, 15, 4), y + by, 4, 1, 5);
        g.rect(mx(W, 15, 4), y + 1 + by, 4, 1, 3);
      }
      g.rect(20, 12 + by, 2, 12, 1);
      // цепь через грудь
      chain(g, 12, 11 + by, 29, 24 + by, 6, 4, f);
      // наплечники с шипами
      for (const side of [0, 1]) {
        const m = M().ellipse(11.5, 11 + by, 5, 4).poly([7, 10 + by, 8, 3 + by, 10.5, 9 + by]).poly([10, 8 + by, 12, 2 + by, 14, 8 + by]);
        S(side ? m.flip() : m, R_CHROME, { k: 0.7 });
      }
      // капюшон и череп
      S(M().ellipse(21, 6 + by, 5.5, 5.8), R_TARP, { k: 0.6 });
      S(M().ellipse(21, 7 + by, 3.6, 4.2), R_BONE, { k: 0.7 });
      g.rect(18, 6 + by, 2, 2, 1);
      g.rect(22, 6 + by, 2, 2, 1);
      g.set(20.5, 8 + by, 1);
      g.rect(19, 10 + by, 5, 1, 1);
      g.set(20, 10 + by, 6);
      g.set(22, 10 + by, 6);
    }, ({ g, W }) => {
      const p = f - 1;
      const by = p === 1 || p === 3 ? 1 : 0;
      // глаза
      g.set(22, 6 + by, 11);
      g.set(19, 7 + by, p % 2 ? 10 : 9);
      // ядро-сердце
      const hot = f % 2 === 0;
      g.rect(20, 15 + by, 2, 3, hot ? 11 : 10);
      g.set(20, 15 + by, hot ? 14 : 11);
      // цепи с замком свисают с запястий, раскачиваются
      const sw = p < 0 ? 0 : [0, 1, 0, -1][p];
      chain(g, 9, 23 + by, 9 + sw, 30 + by, 6, 4, 0);
      chain(g, mx(W, 9), 23 + by, mx(W, 9) - sw, 28 + by, 6, 4, 1);
      g.rect(8 + sw, 31 + by, 3, 2, 13);
      g.set(9 + sw, 31 + by, 14);
      g.set(9 + sw, 33 + by, 12);
    }),
  );
}

// ---------------------------------------------------------------------------
// 7. ГРИФ — крановый дрон лифтовых шахт: два роторных кожуха на ферме, лебёдка,
//    тросы с грузовым захватом, сигнальные огни. Симметричный, вид спереди-сверху.
export function gunshipArt(): Sprite[] {
  return FRAMES.map((f) =>
    boss(52, 44, ({ g, W, M, F, S }) => {
      const p = f - 1;
      const sway = p < 0 ? 0 : [0, 1, 0, -1][p];
      const open = p < 0 ? 0 : p % 2;
      const cx = 26;
      // тросы
      const hx = cx + sway;
      F(M().line(cx - 3, 24, hx - 2, 33, 1), STEEL);
      F(M().line(cx + 2, 24, hx + 1, 33, 1), STEEL);
      // захват: три лапы
      for (const side of [-1, 1]) {
        const o = side * open;
        const prong = M().path([hx - 0.5 + side * 2.5, 35, hx - 0.5 + side * (6 + o), 38, hx - 0.5 + side * (5.5 + o), 41.5, hx - 0.5 + side * (3 + o), 42.5], 2);
        F(prong, [5, 6, 4, 1]);
      }
      F(M().line(hx - 0.5, 35, hx - 0.5, 41, 2), METAL);
      F(M().rect(hx - 4, 32, 8, 4), METAL);
      g.stripes(M().rect(hx - 3, 33, 6, 2), 13, 1, 2, 1, false);
      // ферма-перекладина: стальные пояса, решётка насквозь, торцы в полосах
      const chord = M().rect(3, 13, 46, 2).rect(6, 20, 40, 2);
      F(chord, STEEL);
      for (const x of [3, 43]) g.stripes(M().rect(x + 1, 13, 5, 2), 13, 1, 2, 1, false);
      const lat = M();
      for (let x = 6; x < 44; x += 8) lat.line(x + 0.5, 15, x + 4.5, 20, 1).line(x + 4.5, 20, x + 8.5, 15, 1);
      F(lat, METAL);
      // кожухи роторов
      for (const side of [0, 1]) {
        const rx = side ? 42.5 : 9.5;
        F(M().rect(rx - 2, 10, 3, 4), DARK);
        S(M().ellipse(rx, 7, 9.5, 4.6), [2, 3, 4, 5, 6], { k: 0.7 });
        F(M().ellipse(rx, 7, 7.5, 3.2), [1, 2, 0, 1], -1);
      }
      // корпус
      const hull = M().poly([20, 4, 32, 4, 35, 8, 34, 20, 30, 24, 22, 24, 18, 20, 17, 8]);
      S(hull, R_STEEL, { k: 0.6 });
      F(M().poly([20, 2, 32, 2, 33, 5, 19, 5]), METAL);
      // нижняя бронепластина с шевронами
      const chev = M().poly([20, 17, 32, 17, 30, 23, 22, 23]);
      F(chev, AMBER);
      g.stripes(chev, 13, 1, 2, 1);
      // камера
      S(M().ellipse(cx, 12, 3.4, 3.4), [1, 2, 3], { k: 0.5 });
      // вентиляционные решётки
      for (let y = 8; y <= 14; y += 2) {
        g.rect(19, y, 2, 1, 2);
        g.rect(31, y, 2, 1, 2);
      }
      // лебёдка
      S(M().rect(21, 23, 10, 3), R_METAL, { k: 0.4 });
      for (let x = 22; x < 31; x += 2) g.set(x, 24, 5);
    }, ({ g, W }) => {
      const p = f - 1;
      const sway = p < 0 ? 0 : [0, 1, 0, -1][p];
      // лопасти: покой — размытый диск, движение — вращение
      for (const side of [0, 1]) {
        const cx = side ? 42.5 : 9.5, cy = 7;
        if (p < 0) {
          for (let y = 4; y <= 9; y++)
            for (let x = Math.floor(cx - 7); x <= cx + 7; x++) {
              const dx = (x + 0.5 - cx) / 7.3, dy = (y + 0.5 - cy) / 3;
              const d = dx * dx + dy * dy;
              if (d <= 1 && d > 0.3 && (x + y) % 2 === 0) g.set(x, y, 4);
            }
        } else {
          for (let k = 0; k < 2; k++) {
            const a = (p * Math.PI) / 4 + (k * Math.PI) / 2 + (side ? Math.PI / 8 : 0);
            for (let r = -7; r <= 7; r++) {
              if (Math.abs(r) < 1) continue;
              g.set(Math.floor(cx + Math.cos(a) * r), Math.floor(cy + Math.sin(a) * r * 0.4), Math.abs(r) > 5 ? 7 : 5);
            }
          }
        }
        g.set(cx - 0.5, cy - 0.5, 6);
      }
      // огни
      g.light(9, 11, f % 2 ? 14 : 12, -1);
      g.light(mx(W, 9), 11, f % 2 ? 12 : 14, -1);
      g.light(4, 13, f % 2 ? 11 : 9, -1);
      g.light(mx(W, 4), 13, f % 2 ? 9 : 11, -1);
      g.light(22, 2, f % 2 ? 11 : 9, -1);
      g.light(29, 2, f % 2 ? 9 : 11, -1);
      // объектив
      g.rect(25, 11, 2, 2, 10);
      g.set(25, 11, 11);
      g.set(24, 10, 7);
      // фонарь захвата и зубья
      g.set(26 + sway, 32, p % 2 ? 11 : 10);
    }),
  );
}

// ---------------------------------------------------------------------------
// 8. ДИСПЕТЧЕР — подвесной узел управления над ареной: гроздь серверных стоек,
//    экраны и антенны, стерильный белый/серый с красными индикаторами; снизу
//    свисают и качаются десятки кабелей-«поводков».
export function dispatcherArt(): Sprite[] {
  // кабели-поводки: x, y, длина, материал, толщина, наконечник (0 штекер, 1 зажим, 2 оголённый, 3 ошейник)
  const cables: [x: number, y: number, len: number, mat: Mat, t: number, end: number][] = [
    [8, 41, 13, DARK, 2, 0], [11, 41, 19, GREY, 1.5, 3], [15, 41, 9, METAL, 2, 2],
    [21, 46, 15, DARK, 2, 1], [24, 47, 11, WHITE, 1.5, 0], [27, 47, 17, RED, 1.5, 2],
    [30, 47, 13, DARK, 2.5, 3], [34, 47, 16, DARK, 2.5, 1], [37, 47, 11, GREY, 1.5, 0],
    [40, 47, 17, RED, 1.5, 2], [43, 46, 14, WHITE, 1.5, 3], [49, 41, 9, METAL, 2, 0],
    [53, 41, 19, DARK, 1.5, 3], [56, 41, 12, GREY, 2, 1],
  ];
  return FRAMES.map((f) => {
    const p = f - 1;
    const ph = p < 0 ? 0.6 : (p * Math.PI) / 2;
    const tip = (x0: number, len: number, i: number) => x0 + Math.sin(ph + i * 1.3) * (1 + len / 8);
    return boss(64, 64, ({ g, M, F, S }) => {
      // гало-кольцо подвеса (за корпусом)
      const ring = M().ellipse(32, 9, 29, 6).sub(M().ellipse(32, 9, 26.5, 4));
      F(ring, GREY);
      // провисающие петли между стойками и воронкой
      F(M().bez(14, 41, 17, 54, 23, 46, 2), DARK);
      F(M().bez(50, 41, 47, 52, 41, 46, 2), METAL);
      // кабели-поводки
      cables.forEach(([x0, y0, len, mat, t], i) => {
        const x1 = tip(x0, len, i);
        F(M().bez(x0, y0, (x0 * 2 + x1) / 3, y0 + len * 0.6, x1, Math.min(62, y0 + len), t, 10), mat);
      });
      // подвес: три троса сходятся к муфте под потолком
      for (const [x0, x1] of [[24, 29], [32, 32], [40, 35]]) F(M().line(x0, 11, x1, 0, 2.6), DARK);
      F(M().rect(27, 0, 10, 4), STEEL);
      g.rect(28, 1, 8, 1, 6);
      F(M().rect(19, 7, 26, 4), STEEL);
      for (let x = 21; x < 44; x += 4) rivet(g, x, 8, 6, 3);
      // антенны
      const ant = M().line(10, 15, 2, 5, 1).line(54, 15, 62, 5, 1).line(16, 13, 14, 2, 1).line(48, 13, 50, 2, 1)
        .line(3, 9, 7, 9, 1).line(57, 9, 61, 9, 1);
      F(ant, GREY);
      // серверные стойки: по два модуля с каждой стороны, со сдвигом
      const racks: [number, number, number, number][] = [[5, 14, 13, 15], [7, 29, 11, 11], [46, 13, 13, 18], [47, 31, 10, 9]];
      for (const [x0, y0, w, h] of racks) {
        F(M().rect(x0, y0, w, h), GREY);
        for (let y = y0 + 2; y < y0 + h - 1; y += 3) {
          g.rect(x0 + 1, y, w - 2, 1, 3);
          g.rect(x0 + (x0 < 32 ? w - 6 : 2), y + 1, 4, 1, 4);
        }
        g.rect(x0 < 32 ? x0 + 1 : x0 + w - 2, y0 + 1, 1, h - 2, 4);
      }
      F(M().rect(8, 40, 9, 2), STEEL);
      F(M().rect(47, 40, 9, 2), STEEL);
      // центральный корпус — стерильно-белый
      const core = M().poly([22, 10, 42, 10, 48, 16, 48, 37, 42, 42, 22, 42, 16, 37, 16, 16]);
      F(core, WHITE);
      g.rect(17, 30, 31, 1, 5);
      g.rect(24, 38, 17, 1, 5);
      g.rect(22, 11, 21, 1, 7);
      // красная полоса-маркировка
      g.rect(17, 39 - 3, 4, 1, 10);
      g.rect(44, 39 - 3, 4, 1, 10);
      for (const [x, y] of [[19, 14], [44, 14], [19, 33], [44, 33]]) rivet(g, x, y, 7, 5);
      // вентиляция на скосах
      for (let k = 0; k < 3; k++) {
        g.set(18 + k, 22 + k * 2, 4);
        g.set(46 - k, 22 + k * 2, 4);
      }
      // главный экран: карта маршрутов
      F(M().rect(22, 14, 21, 14), [4, 5, 3, 1]);
      g.rect(23, 15, 19, 12, 1);
      for (let y = 16; y < 27; y += 2) g.rect(23, y, 19, 1, 2);
      // боковые узкие дисплеи
      F(M().rect(18, 17, 3, 11), DARK);
      F(M().rect(44, 17, 3, 11), DARK);
      // сенсорная щель с тремя объективами
      F(M().rect(23, 31, 19, 5), DARK);
      for (const x of [26, 32.5, 39]) S(M().ellipse(x, 33.5, x === 32.5 ? 2.6 : 2, 2), R_RED.slice(0, 3), { line: 0, k: 0.6 });
      // воронка снизу с портами
      F(M().poly([20, 41, 44, 41, 41, 48, 23, 48]), GREY);
      g.rect(22, 43, 20, 1, 4);
      for (let x = 22; x <= 42; x += 3) g.set(x, 47, 1);
    }, ({ g }) => {
      // огни гало-кольца: бегущая цепочка
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = 32 + Math.cos(a) * 28.3, y = 9 + Math.sin(a) * 5.2;
        const on = (k + (p < 0 ? 0 : p)) % 4 === 0;
        if (g.get(Math.floor(x), Math.floor(y)) >= 0) g.set(x - 0.5, y - 0.5, on ? 11 : 9);
      }
      // наконечники кабелей
      cables.forEach(([x0, y0, len, , , kind], i) => {
        const x = Math.round(tip(x0, len, i)), y = Math.min(62, y0 + len) + 1;
        if (kind === 0) {
          g.rect(x - 1, y - 1, 2, 2, 5);
          g.set(x - 1, y, 1);
          g.set(x, y, 11);
        } else if (kind === 1) {
          g.rect(x - 1, y - 1, 3, 1, 6);
          g.set(x - 1, y, 1);
          g.set(x + 1, y, 1);
        } else if (kind === 2) {
          g.set(x - 1, y, 13);
          g.set(x, y, 14);
        } else {
          // ошейник-«поводок»: разомкнутое кольцо
          px(g, ['.666.', '6...6', '6...6', '.6.6.'], x - 2, Math.min(60, y - 1));
          g.set(x, Math.min(60, y - 1), 10);
        }
      });
      // огоньки антенн
      g.light(2, 5, f % 2 ? 11 : 9, -1);
      g.light(62, 5, f % 2 ? 9 : 11, -1);
      g.set(14, 2, 10);
      g.set(50, 2, 10);
      // индикаторы стоек
      const racks: [number, number, number, number][] = [[5, 14, 13, 15], [7, 29, 11, 11], [46, 13, 13, 18], [47, 31, 10, 9]];
      for (const [x0, y0, w, h] of racks)
        for (let y = y0 + 3; y < y0 + h - 1; y += 3)
          for (let k = 0; k < 3; k++) {
            const lx = x0 < 32 ? x0 + 2 + k : x0 + w - 3 - k;
            const on = hash(lx, y, f) < 0.45;
            g.set(lx, y, on ? (hash(lx, y, 99) < 0.2 ? 13 : 11) : 9);
          }
      // карта маршрутов: узлы и связи, бегущий курсор
      const nodes = [[25, 18], [30, 23], [35, 17], [39, 22], [33, 25], [27, 24]];
      const links = [[0, 1], [1, 2], [2, 3], [1, 4], [4, 3], [5, 1]];
      for (const [a, b] of links) {
        const [x0, y0] = nodes[a], [x1, y1] = nodes[b];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let i = 0; i <= n; i++) g.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 9);
      }
      nodes.forEach(([x, y], i) => g.set(x, y, i === (p < 0 ? 1 : (p + 1) % 6) ? 14 : 10));
      g.rect(24, 15, 6, 1, 10);
      g.rect(38, 15, 3, 1, f % 2 ? 11 : 9);
      // столбики на узких дисплеях
      for (const [x, s] of [[19, 0], [45, 3]]) {
        const lv = [3, 6, 4, 8, 5][(f + s) % 5];
        for (let y = 0; y < lv; y++) g.set(x, 27 - y, y > 5 ? 11 : 10);
      }
      // объективы
      for (const x of [26, 39]) g.set(x - 1, 33, 11);
      g.rect(32, 33, 2, 2, 11);
      g.set(32, 32, 7);
    });
  });
}

