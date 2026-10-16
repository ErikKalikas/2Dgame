import type { Sprite } from '../sprite';
import { Grid, Mask } from './pix';

// Боссы: собираются из масок с фаской (свет сверху-слева), каждая деталь обведена
// чёрной линией, в конце — общая обводка. Два кадра анимации у каждого.

type Mat = [base: number, hi: number, lo: number, line?: number];
const STEEL: Mat = [4, 5, 3, 1];
const METAL: Mat = [3, 4, 2, 1];
const DARK: Mat = [2, 3, 1, 1];
const CHROME: Mat = [6, 7, 4, 1];
const BONE: Mat = [7, 7, 6, 1];
const RED: Mat = [9, 10, 8, 1];
const AMBER: Mat = [12, 13, 8, 1];

interface Ctx {
  g: Grid;
  W: number;
  H: number;
  M: () => Mask;
  /** Залить маску материалом */
  F: (m: Mask, mat: Mat, line?: number) => void;
}

function boss(W: number, H: number, draw: (c: Ctx) => void, post?: (c: Ctx) => void): Sprite {
  const g = new Grid(W, H);
  const c: Ctx = {
    g, W, H,
    M: () => new Mask(W, H),
    F: (m, [b, hi, lo, line = 1], l = line) => g.fill(m, b, hi, lo, l),
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

// ---------------------------------------------------------------------------
// 1. WARDEN-9 — двуногий охранный мех с пушками-руками
export function wardenArt(): Sprite[] {
  return [0, 1].map((f) =>
    boss(36, 36, ({ g, W, M, F }) => {
      const leg = (lift: number) => {
        const m = M();
        m.line(12, 21, 6.5, 26 - lift, 4);
        return m;
      };
      const shin = (lift: number) => M().line(6.5, 26 - lift, 7.5, 31 - lift, 3);
      const foot = (lift: number) => M().rect(3, 31 - lift, 9, 3).rect(2, 32 - lift, 1, 2).rect(12, 32 - lift, 1, 2);
      for (const side of [0, 1]) {
        const lift = (f === 0) === (side === 0) ? 2 : 0;
        const fl = (m: Mask) => (side ? m.flip() : m);
        F(fl(leg(lift)), METAL);
        F(fl(shin(lift)), STEEL);
        F(fl(foot(lift)), METAL);
        const hx = side ? mx(W, 11, 3) : 11;
        F(M().ellipse(hx + 1.5, 21.5, 2.5, 2.5), DARK);
      }
      // руки-пушки
      const gun = M().rect(1, 10, 8, 10);
      const arm = M().rect(7, 13, 4, 4);
      F(arm.sym(), DARK);
      F(gun.sym(), STEEL);
      for (const x of [2, 5, mx(W, 2, 2), mx(W, 5, 2)]) {
        g.rect(x, 20, 2, 4, 2);
        g.rect(x, 23, 2, 1, 1);
        g.rect(x, 20, 1, 3, 3);
      }
      for (const x of [2, mx(W, 2, 6)]) {
        g.rect(x, 12, 6, 1, 3);
        g.rect(x, 15, 6, 1, 3);
        g.rect(x, 18, 6, 1, 3);
      }
      g.rect(3, 11, 2, 1, 13);
      g.rect(mx(W, 3, 2), 11, 2, 1, 13);
      // корпус
      const body = M().poly([10, 5, 26, 5, 28, 8, 28, 19, 25, 23, 11, 23, 8, 19, 8, 8]);
      F(body, STEEL);
      // лицевая плита
      F(M().poly([12, 14, 24, 14, 23, 21, 13, 21]), DARK);
      for (let y = 16; y <= 19; y += 2) g.rect(14, y, 8, 1, 1);
      // визор
      g.rect(11, 9, 14, 3, 1);
      g.rect(12, 10, 12, 1, 13);
      g.rect(15, 10, 6, 1, 14);
      // красная маркировка
      px(g, ['a9', '9.'], 11, 6);
      px(g, ['9a', '.9'], 23, 6);
      g.rect(17, 6, 2, 2, 5);
      g.rect(16, 22, 4, 1, f ? 10 : 9);
    }),
  );
}

// ---------------------------------------------------------------------------
// 2. ARACHNE — восьминогий паук-танк (вид сверху)
export function arachneArt(): Sprite[] {
  return [0, 1].map((f) =>
    boss(44, 38, ({ g, W, M, F }) => {
      const angs = [-148, -172, 166, 142];
      for (let i = 0; i < 4; i++) {
        for (const side of [0, 1]) {
          const up = (i + side + f) % 2 ? 2 : 0;
          const a = (angs[i] * Math.PI) / 180;
          const hx = 18, hy = 12 + i * 4.5;
          const kx = hx + Math.cos(a) * 9, ky = hy + Math.sin(a) * 9 - 4 - up;
          const fx = hx + Math.cos(a) * 17, fy = hy + Math.sin(a) * 15 + 2 - up * 0.5;
          const s1 = M().line(hx, hy, kx, ky, 3);
          const s2 = M().line(kx, ky, fx, fy, 2);
          F(side ? s1.flip() : s1, METAL);
          F(side ? s2.flip() : s2, STEEL);
          if (i === 0 || i === 3) g.set(side ? mx(W, Math.floor(kx)) : Math.floor(kx), Math.floor(ky), 10);
        }
      }
      // брюшко
      F(M().ellipse(22, 13, 9.5, 8.5), METAL);
      // красные песочные часы и бронепластины
      px(g, ['aaaa', '.aa.', '.aa.', 'aaaa'], 20, 9);
      for (const y of [7, 18]) g.rect(17, y, 10, 1, 2);
      // головогрудь
      F(M().ellipse(22, 25, 7.5, 6.5), STEEL);
      // глаза
      px(g, ['1111..1111', '1bb1..1bb1', '1ba1..1ba1', '1111..1111'], 17, 24);
      px(g, ['a..a'], 20, 22);
      // пушки
      for (const x of [18, 24]) {
        g.rect(x, 30, 2, 5, 2);
        g.rect(x, 30, 1, 4, 4);
        g.rect(x, 34, 2, 1, 1);
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// 3. VULTURE — штурмовой вертолёт (вид сверху, нос вправо)
export function vultureArt(): Sprite[] {
  return [0, 1].map((f) =>
    boss(
      48,
      36,
      ({ g, M, F }) => {
        // хвост и стабилизатор
        F(M().rect(3, 16, 14, 4), METAL);
        F(M().rect(2, 12, 5, 12), DARK);
        // крылья-пилоны с ракетами
        F(M().poly([21, 7, 28, 7, 30, 29, 19, 29]), METAL);
        for (const y of [4, 28]) {
          F(M().rect(18, y, 12, 4), DARK);
          for (let x = 26; x < 30; x += 2) g.set(x + 1, y + 1, 10);
          for (let x = 26; x < 30; x += 2) g.set(x + 1, y + 2, 9);
        }
        // фюзеляж
        F(M().ellipse(27, 18, 13, 6.5).ellipse(38, 18, 6, 5), STEEL);
        // кабина
        F(M().ellipse(38.5, 16.5, 4, 2.5), AMBER);
        g.set(37, 15, 14);
        g.set(38, 15, 13);
        // двигатели и обшивка
        g.rect(19, 15, 8, 1, 3);
        g.rect(19, 21, 8, 1, 3);
        g.rect(16, 17, 2, 2, 2);
        // огни
        g.set(4, 17, f ? 11 : 9);
        g.set(44, 19, 10);
        // втулка ротора
        F(M().ellipse(27, 18, 2.5, 2.5), DARK);
      },
      ({ g }) => {
        // лопасти без обводки — размытые движением
        const cx = 27, cy = 18;
        const a0 = f ? Math.PI / 4 : 0;
        for (let k = 0; k < 4; k++) {
          const a = a0 + (k * Math.PI) / 2;
          for (let r = 3; r <= 18; r++) {
            const x = Math.round(cx - 0.5 + Math.cos(a) * r), y = Math.round(cy - 0.5 + Math.sin(a) * r * 0.95);
            g.set(x, y, r > 14 ? 7 : r > 8 ? 6 : 5);
          }
        }
        g.set(26, 17, 13);
        // хвостовой винт
        const tr = f ? ['.6.', '6.6', '.6.'] : ['6.6', '.6.', '6.6'];
        px(g, tr, 3, 9);
      },
    ),
  );
}

// ---------------------------------------------------------------------------
// 4. CASTOR & POLLUX — высокие андроиды в костяной броне с ручной пушкой
export function twinsArt(): Sprite[] {
  return [0, 1].map((f) =>
    boss(26, 36, ({ g, M, F }) => {
      // ноги
      for (const side of [0, 1]) {
        const step = (f === 0) === (side === 0) ? 2 : 0;
        const x0 = side ? 14 : 9;
        F(M().rect(x0, 23, 3, 6 - step), BONE);
        F(M().rect(x0, 29 - step, 3, 1), DARK);
        F(M().rect(x0, 30 - step, 3, 4), BONE);
        F(M().rect(x0 - (side ? 0 : 1), 34 - step, 4, 2), METAL);
      }
      // таз
      F(M().rect(9, 21, 8, 2), METAL);
      // левая рука
      F(M().line(5, 13, 4, 21, 3), BONE);
      F(M().rect(3, 21, 3, 2), DARK);
      // корпус
      F(M().poly([7, 11, 19, 11, 17, 20, 9, 20]), BONE);
      g.rect(12, 13, 2, 2, 10);
      g.set(12, 13, 11);
      g.rect(10, 17, 6, 1, 6);
      g.rect(9, 11, 1, 6, 5);
      // плечи
      F(M().ellipse(6.5, 12, 3, 2.5), BONE);
      F(M().ellipse(19.5, 12, 3, 2.5), BONE);
      // правая рука — пушка
      F(M().rect(19, 14, 3, 5), DARK);
      F(M().rect(18, 18, 5, 10), METAL);
      g.rect(19, 27, 3, 1, f ? 11 : 10);
      g.rect(19, 20, 1, 6, 5);
      // шея и голова
      F(M().rect(12, 9, 2, 2), DARK);
      F(M().ellipse(13, 5.5, 3.5, 4.5), BONE);
      g.rect(10, 5, 6, 2, 1);
      g.rect(11, 5, 4, 1, 10);
      g.set(14, 5, 11);
      g.rect(12, 0, 2, 1, 6);
    }),
  );
}

// ---------------------------------------------------------------------------
// 5. GOLIATH — огромный двуногий танк с рельсотроном (смотрит вправо)
export function goliathArt(): Sprite[] {
  return [0, 1].map((f) =>
    boss(50, 46, ({ g, M, F }) => {
      const legAt = (dx: number, lift: number, mat: Mat, shin: Mat) => {
        const hip = [22 + dx, 26], knee = [13 + dx, 33 - lift], ankle = [20 + dx, 40 - lift];
        F(M().line(hip[0], hip[1], knee[0], knee[1], 6), mat);
        F(M().line(knee[0], knee[1], ankle[0], ankle[1], 4), shin);
        F(M().ellipse(knee[0], knee[1], 3, 3), DARK);
        F(M().poly([ankle[0] - 7, 45 - lift, ankle[0] - 5, 40 - lift, ankle[0] + 5, 40 - lift, ankle[0] + 8, 45 - lift]), mat);
        g.set(ankle[0] + 7, 44 - lift, 5);
      };
      // дальняя нога темнее
      legAt(8, f ? 0 : 2, DARK, METAL);
      // ракетный блок на спине
      F(M().rect(4, 12, 9, 10), METAL);
      for (let y = 14; y < 21; y += 3) for (let x = 5; x < 12; x += 3) {
        g.set(x, y, 10);
        g.set(x + 1, y, 1);
      }
      // корпус
      F(M().poly([9, 13, 33, 10, 40, 15, 37, 27, 14, 30, 8, 23]), STEEL);
      // бронепластины
      g.rect(12, 18, 22, 1, 3);
      g.rect(13, 24, 20, 1, 3);
      px(g, ['a9a9a9'], 16, 26);
      // кабина-голова
      F(M().poly([32, 15, 45, 17, 45, 23, 34, 25]), DARK);
      g.rect(37, 19, 7, 2, 1);
      g.rect(38, 19, 5, 1, f ? 11 : 10);
      g.set(43, 19, 11);
      // рельсотрон
      F(M().rect(20, 7, 8, 6), METAL);
      F(M().rect(13, 4, 36, 4), STEEL);
      for (let x = 17; x < 44; x += 5) {
        g.rect(x, 4, 1, 4, 13);
        g.set(x, 4, 14);
      }
      g.rect(46, 5, 3, 2, 1);
      // ближняя нога
      legAt(0, f ? 2 : 0, STEEL, STEEL);
    }),
  );
}

// ---------------------------------------------------------------------------
// 6. HIVE — ядро роя: красное ядро, шестигранные пластины, шесть лап
export function hiveArt(): Sprite[] {
  return [0, 1].map((f) =>
    boss(40, 40, ({ g, M, F }) => {
      const cx = 20, cy = 20;
      // лапы
      for (let k = 0; k < 6; k++) {
        const a = ((k + 0.5) * Math.PI) / 3 + (f ? 0.08 : -0.08) * (k % 2 ? 1 : -1);
        const x1 = cx + Math.cos(a) * 11, y1 = cy + Math.sin(a) * 11;
        const x2 = cx + Math.cos(a + 0.25) * 17, y2 = cy + Math.sin(a + 0.25) * 17;
        const x3 = cx + Math.cos(a + 0.05) * 19.5, y3 = cy + Math.sin(a + 0.05) * 19.5;
        F(M().line(x1, y1, x2, y2, 3), METAL);
        F(M().line(x2, y2, x3, y3, 2), STEEL);
      }
      // шестигранные пластины
      const pr = f ? 11 : 10;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        const hx = cx + Math.cos(a) * pr, hy = cy + Math.sin(a) * pr;
        const pts: number[] = [];
        for (let j = 0; j < 6; j++) {
          const b = (j * Math.PI) / 3;
          pts.push(hx + Math.cos(b) * 5.5, hy + Math.sin(b) * 5);
        }
        F(M().poly(pts), AMBER);
        g.set(Math.floor(hx), Math.floor(hy), 14);
      }
      // ядро
      F(M().ellipse(cx, cy, 6.5, 6.5), RED);
      F(M().ellipse(cx, cy, 3.5, 3.5), [f ? 11 : 10, 11, 9, 8]);
      g.rect(cx - 1, cy - 1, 2, 2, 14);
      g.set(cx - 1, cy - 1, 7);
    }),
  );
}

// ---------------------------------------------------------------------------
// 7. EXECUTIONER — огромный хромированный киборг с клинками
export function executionerArt(): Sprite[] {
  return [0, 1].map((f) =>
    boss(40, 40, ({ g, W, M, F }) => {
      // плащ сзади
      const cape = M().poly([13, 10, 27, 10, 31, 34, 27, 32, 24, 36, 20, 33, 16, 36, 13, 32, 9, 34]);
      F(cape, DARK);
      // ноги
      for (const side of [0, 1]) {
        const lift = (f === 0) === (side === 0) ? 1 : 0;
        const fl = (m: Mask) => (side ? m.flip() : m);
        F(fl(M().line(17, 24, 16, 33 - lift, 4)), STEEL);
        g.rect(side ? mx(W, 15, 2) : 15, 28 - lift, 2, 1, 5);
        F(fl(M().rect(13, 33 - lift, 6, 3)), METAL);
      }
      // руки и клинки
      for (const side of [0, 1]) {
        const fl = (m: Mask) => (side ? m.flip() : m);
        F(fl(M().line(11, 13, 9, 20, 3.5)), CHROME);
        const blade = f
          ? M().poly([7, 19, 11, 21, 5, 10, 1, 3, 2, 11])
          : M().poly([7, 20, 11, 22, 5, 31, 0, 38, 1, 29]);
        F(fl(blade), [6, 7, 5, 1]);
        F(fl(M().rect(7, 19, 4, 3)), DARK);
      }
      // корпус
      F(M().poly([13, 10, 27, 10, 25, 23, 15, 23]), DARK);
      for (let y = 13; y < 22; y += 3) {
        g.rect(16, y, 3, 1, 6);
        g.rect(mx(W, 16, 3), y, 3, 1, 4);
      }
      g.rect(19, 12, 2, 10, 1);
      g.rect(19, 15, 2, 2, f ? 11 : 10);
      // наплечники с шипами
      for (const side of [0, 1]) {
        const m = M().ellipse(11.5, 11, 4.5, 3.5).poly([8, 10, 9, 3, 11, 9]);
        F(side ? m.flip() : m, CHROME);
      }
      // голова-череп
      F(M().ellipse(20, 6, 3.5, 4.5), BONE);
      g.rect(17, 6, 2, 2, 1);
      g.rect(21, 6, 2, 2, 1);
      g.set(21, 6, 11);
      g.set(18, 7, 9);
      g.rect(18, 9, 4, 1, 6);
      g.set(19, 9, 1);
      g.set(21, 9, 1);
    }),
  );
}

// ---------------------------------------------------------------------------
// 8. BLACK ICE — машинное ядро ИИ: чёрный монолит, красный глаз, кабели
export function blackIceArt(): Sprite[] {
  return [0, 1].map((f) =>
    boss(54, 56, ({ g, M, F }) => {
      const cx = 27, cy = 27;
      // кабели
      const sway = f ? 1.5 : -1.5;
      const cables: [number, number, number, number][] = [
        [16, 39, 6, 54], [21, 42, 16, 55], [27, 43, 27, 55], [33, 42, 38, 55], [38, 39, 48, 54], [10, 33, 1, 46], [44, 33, 53, 46],
      ];
      cables.forEach(([x0, y0, x1, y1], i) => {
        const s = i % 2 ? sway : -sway;
        const m = M();
        const mxp = (x0 + x1) / 2 + s * 1.5, myp = (y0 + y1) / 2 + 2;
        let px0 = x0, py0 = y0;
        for (let t = 1; t <= 8; t++) {
          const k = t / 8;
          const qx = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * mxp + k * k * (x1 + s);
          const qy = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * myp + k * k * y1;
          m.line(px0, py0, qx, qy, 2.4);
          px0 = qx;
          py0 = qy;
        }
        F(m, DARK);
        g.rect(Math.round(x1 + s) - 1, y1 - 1, 2, 1, i % 3 === 1 ? 15 : 10);
      });
      // боковые клешни-крюки
      for (const side of [0, 1]) {
        const m = M().poly([10, 14, 4, 18, 1, 28, 3, 38, 7, 42, 6, 34, 9, 26, 13, 20]);
        F(side ? m.flip() : m, METAL);
        const tx = side ? 47 : 6;
        g.set(tx, 41, 10);
      }
      // корона шипов
      const crown = M();
      for (const [x, h] of [[13, 8], [20, 11], [27, 13], [34, 11], [41, 8]] as const) crown.poly([x - 3, 13, x + 0.5, 13 - h, x + 4, 13]);
      F(crown, METAL);
      // монолит
      F(M().poly([15, 10, 39, 10, 46, 18, 46, 36, 39, 44, 15, 44, 8, 36, 8, 18]), DARK);
      g.rect(16, 12, 22, 1, 3);
      // трещины с красным светом
      px(g, ['9...', '.9..', '..a.'], 12, 17);
      px(g, ['...9', '..9.', '.a..'], 38, 17);
      px(g, ['..a.', '.9..', '9...'], 12, 35);
      px(g, ['.a..', '..9.', '...9'], 38, 35);
      g.rect(10, 27, 4, 1, 9);
      g.rect(40, 27, 4, 1, 9);
      g.rect(26, 11, 2, 3, f ? 15 : 9);
      g.rect(20, 40, 14, 1, 1);
      g.rect(22, 41, 10, 1, 8);
      // глаз
      F(M().ellipse(cx, cy, 11, 11), [1, 2, 0, 0]);
      F(M().ellipse(cx, cy, 8.5, 8.5), RED);
      F(M().ellipse(cx, cy, 6, 6), [10, 11, 9, 9]);
      F(M().ellipse(cx, cy, f ? 3.5 : 4, f ? 3.5 : 4), [11, 11, 10, 10]);
      g.rect(cx - 1, cy - (f ? 4 : 5), 2, f ? 8 : 10, 1);
      g.rect(cx - 4, cy - 5, 2, 1, 7);
      g.set(cx - 5, cy - 4, 7);
    }),
  );
}
