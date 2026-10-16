import { C, PAL } from './palette';
import { canvas, ctx2d, fromRows, silhouette, type Sprite } from './sprite';
import { playerArt, type DirFrames } from './art/player';
import { surgeryArt } from './art/surgery';

// Игрок — рисованный вручную, см. art/player.ts
export type { DirFrames };
const playerFrames = playerArt;

// ---------------------------------------------------------------------------
// Процедурные роботы и киборги для врагов

type Px = (c: string, x: number, y: number, w?: number, h?: number) => void;

function painter(w: number, h: number): [HTMLCanvasElement, Px] {
  const c = canvas(w, h);
  const x = ctx2d(c);
  return [c, (col, px, py, pw = 1, ph = 1) => {
    x.fillStyle = col;
    x.fillRect(px, py, pw, ph);
  }];
}

/** Симметричная отрисовка: рисуем левую половину, правая отражается */
function mirrorPainter(w: number, h: number): [HTMLCanvasElement, Px] {
  const [c, p] = painter(w, h);
  return [c, (col, px, py, pw = 1, ph = 1) => {
    p(col, px, py, pw, ph);
    p(col, w - px - pw, py, pw, ph);
  }];
}

export interface HumanoidOpts {
  body: string;
  dark: string;
  light: string;
  visor: string;
  head: 'helmet' | 'hood' | 'mohawk' | 'skull' | 'visor' | 'dome';
  arms?: 'normal' | 'blades' | 'heavy' | 'gun';
  wide?: boolean;
  cape?: boolean;
}

/** Киборг-гуманоид 14×18, 3 кадра ходьбы */
export function humanoid(o: HumanoidOpts): Sprite[] {
  const frames: Sprite[] = [];
  for (let f = 0; f < 3; f++) {
    const [c, m] = mirrorPainter(14, 18);
    const [, p] = painter(14, 18);
    void c;
    const k = C.void;
    // голова
    m(k, 4, 0, 3, 1);
    m(k, 3, 1, 1, 5);
    m(o.dark, 4, 1, 3, 5);
    m(o.body, 5, 1, 2, 2);
    switch (o.head) {
      case 'helmet':
        m(o.light, 4, 1, 3, 1);
        m(o.visor, 4, 3, 3, 1);
        break;
      case 'hood':
        m(o.dark, 3, 0, 4, 2);
        m(k, 2, 1, 1, 5);
        m(o.visor, 5, 3, 1, 1);
        break;
      case 'mohawk':
        p(o.visor, 6, 0, 2, 1);
        p(o.light, 6, 1, 2, 1);
        m(o.visor, 4, 3, 1, 1);
        break;
      case 'skull':
        m(PAL[7], 4, 1, 3, 3);
        m(k, 4, 3, 1, 1);
        m(o.visor, 5, 3, 1, 1);
        break;
      case 'visor':
        m(o.visor, 4, 2, 3, 2);
        m(PAL[7], 4, 2, 1, 1);
        break;
      case 'dome':
        m(o.light, 4, 0, 3, 2);
        m(o.visor, 4, 3, 3, 1);
        break;
    }
    m(o.dark, 5, 5, 2, 1);
    // корпус
    const sh = o.wide ? 1 : 2;
    m(k, sh, 6, 7 - sh, 1);
    m(k, sh - 1, 7, 1, 5);
    m(o.body, sh, 7, 7 - sh, 5);
    m(o.light, sh, 7, 7 - sh, 1);
    m(o.dark, 5, 8, 2, 3);
    m(o.visor, 6, 9, 1, 1);
    // руки
    const arms = o.arms ?? 'normal';
    if (arms === 'blades') {
      m(PAL[6], sh - 1, 11, 1, 5);
      m(PAL[7], sh - 1, 12, 1, 2);
    } else if (arms === 'heavy') {
      m(PAL[5], sh - 1, 7, 2, 6);
      m(PAL[4], sh - 1, 11, 2, 2);
    } else if (arms === 'gun') {
      p(PAL[4], 12, 9, 2, 4);
      p(PAL[2], 12, 12, 2, 2);
      p(PAL[5], 0, 8, 1, 4);
    } else {
      m(PAL[5], sh - 1, 8, 1, 4);
    }
    if (o.cape) m(o.dark, sh - 1, 12, 2, 3);
    // пояс
    m(o.dark, 4, 12, 3, 1);
    // ноги с анимацией
    const lift = [0, 1, -1][f];
    const leg = (side: number, dy: number) => {
      const lx = side < 0 ? 4 : 8;
      p(k, lx, 13, 2, 5 - Math.max(0, dy));
      p(o.dark, lx, 13, 2, 4 - Math.max(0, dy));
      p(PAL[4], lx, 16 - Math.max(0, dy), 2, 1);
    };
    leg(-1, lift);
    leg(1, -lift);
    frames.push(c);
  }
  return frames;
}

/** Летающий дрон: корпус + винты, 2 кадра */
export function drone(body: string, eye: string, size = 12): Sprite[] {
  const out: Sprite[] = [];
  for (let f = 0; f < 2; f++) {
    const [c, m] = mirrorPainter(size, size);
    const h = size / 2;
    m(C.void, 1, h - 2, h - 1, 4);
    m(body, 2, h - 2, h - 2, 3);
    m(PAL[5], 2, h - 2, h - 2, 1);
    m(C.void, h - 1, h - 1, 1, 1);
    m(eye, h - 1, h - 1, 1, 1);
    // винты
    const rw = f === 0 ? 3 : 1;
    m(PAL[6], 1 + (3 - rw) / 2, 1, rw, 1);
    m(PAL[4], 2, 2, 1, h - 4);
    m(body, 0, h + 1, 2, 2);
    out.push(c);
  }
  return out;
}

/** Паук/ходунок на лапах (вид сверху), 2 кадра */
export function spider(body: string, eye: string, size = 14, legs = 3): Sprite[] {
  const out: Sprite[] = [];
  for (let f = 0; f < 2; f++) {
    const [c, m] = mirrorPainter(size, size);
    const h = size / 2;
    for (let i = 0; i < legs; i++) {
      const ly = 3 + i * ((size - 6) / Math.max(1, legs - 1));
      const off = (i + f) % 2 ? 1 : 0;
      m(PAL[4], 0, Math.round(ly) + off, h - 2, 1);
      m(PAL[2], 0, Math.round(ly) + off + 1, 1, 1);
    }
    m(C.void, h - 4, h - 4, 4, 8);
    m(body, h - 3, h - 3, 3, 6);
    m(PAL[5], h - 3, h - 3, 3, 1);
    m(eye, h - 1, h - 2, 1, 1);
    out.push(c);
  }
  return out;
}

/** Стационарная турель, 1 кадр (ствол рисуется отдельно поворотом) */
export function turret(body: string, eye: string): Sprite[] {
  const [c, m] = mirrorPainter(14, 14);
  m(C.void, 2, 2, 5, 10);
  m(PAL[3], 3, 3, 4, 8);
  m(PAL[4], 3, 3, 4, 1);
  m(body, 4, 5, 3, 4);
  m(eye, 6, 6, 1, 2);
  m(C.void, 0, 6, 2, 2);
  return [c];
}

export interface MechOpts {
  w: number;
  h: number;
  body: string;
  dark: string;
  light: string;
  eye: string;
  legs: 'biped' | 'quad' | 'tracks' | 'none' | 'six';
  cockpit?: boolean;
  guns?: number;
  horns?: boolean;
  core?: string;
}

/** Крупный механоид (элитные враги и боссы), 2 кадра */
export function mech(o: MechOpts): Sprite[] {
  const out: Sprite[] = [];
  for (let f = 0; f < 2; f++) {
    const [c, m] = mirrorPainter(o.w, o.h);
    const W = o.w, H = o.h;
    const hw = W / 2;
    const bodyTop = Math.round(H * 0.18);
    const bodyH = Math.round(H * 0.5);
    const bx = Math.round(W * 0.2);
    // ноги
    const legY = bodyTop + bodyH - 2;
    const lift = f ? 1 : 0;
    if (o.legs === 'biped') {
      m(C.void, bx, legY, 4, H - legY);
      m(o.dark, bx + 1, legY, 2, H - legY - 1 - lift);
      m(PAL[4], bx - 1, H - 2 - lift, 5, 2);
    } else if (o.legs === 'quad' || o.legs === 'six') {
      const n = o.legs === 'quad' ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const ly = bodyTop + 2 + i * Math.round(bodyH / n) + ((i + f) % 2);
        m(PAL[4], 0, ly, bx + 1, 2);
        m(o.dark, 0, ly + 2, 2, 3);
      }
    } else if (o.legs === 'tracks') {
      m(C.void, bx - 3, bodyTop + 2, 4, bodyH + 2);
      m(PAL[3], bx - 2, bodyTop + 3, 2, bodyH);
      for (let y = bodyTop + 3 + f; y < bodyTop + bodyH + 3; y += 2) m(PAL[2], bx - 2, y, 2, 1);
    }
    // корпус
    m(C.void, bx - 1, bodyTop - 1, hw - bx + 1, bodyH + 2);
    m(o.body, bx, bodyTop, hw - bx, bodyH);
    m(o.light, bx, bodyTop, hw - bx, 2);
    m(o.dark, bx, bodyTop + bodyH - 3, hw - bx, 3);
    // броневые пластины
    for (let y = bodyTop + 4; y < bodyTop + bodyH - 4; y += 4) m(o.dark, bx + 1, y, Math.max(1, hw - bx - 3), 1);
    // орудия по бокам
    for (let i = 0; i < (o.guns ?? 1); i++) {
      const gy = bodyTop + 3 + i * 5;
      m(C.void, Math.max(0, bx - 4), gy, 4, 4);
      m(PAL[5], Math.max(0, bx - 3), gy + 1, 3, 2);
    }
    if (o.horns) {
      m(o.light, bx + 1, bodyTop - 4, 2, 4);
      m(C.void, bx + 1, bodyTop - 5, 2, 1);
    }
    // кабина / глаз
    if (o.cockpit) {
      m(C.void, hw - 4, bodyTop + 2, 4, 5);
      m(o.eye, hw - 3, bodyTop + 3, 3, 2);
      m(PAL[7], hw - 3, bodyTop + 3, 1, 1);
    } else {
      m(o.eye, hw - 2, bodyTop + 3, 2, 2);
    }
    if (o.core) {
      m(C.void, hw - 3, bodyTop + Math.round(bodyH / 2), 3, 4);
      m(o.core, hw - 2, bodyTop + Math.round(bodyH / 2) + 1, 2, 2);
    }
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Пули: пиксельные круги с тёмной обводкой, цветным кольцом и светлым ядром

function circle(r: number, ring: string, core: string, outline: string = C.void): Sprite {
  const d = r * 2 + 2;
  const [c, p] = painter(d, d);
  const cx = d / 2, cy = d / 2;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dd <= r * 0.5) p(core, x, y);
      else if (dd <= r) p(ring, x, y);
      else if (dd <= r + 1) p(outline, x, y);
    }
  }
  return c;
}

/** Вытянутая пуля ("рис") — повёрнута заранее на 16 направлений */
function rice(len: number, wid: number, ring: string, core: string): Sprite[] {
  const out: Sprite[] = [];
  const size = len * 2 + 4;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const [c, p] = painter(size, size);
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - size / 2, dy = y + 0.5 - size / 2;
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        const e = (u / len) ** 2 + (v / wid) ** 2;
        if (e <= 0.3) p(core, x, y);
        else if (e <= 1) p(ring, x, y);
        else if ((u / (len + 1)) ** 2 + (v / (wid + 1)) ** 2 <= 1) p(C.void, x, y);
      }
    }
    out.push(c);
  }
  return out;
}

export type BulletSkin = 'small' | 'orb' | 'big' | 'huge' | 'rice' | 'shard';
export const BULLET_COLORS = ['red', 'amber', 'violet', 'bone'] as const;
export type BulletColor = (typeof BULLET_COLORS)[number];

const BC: Record<BulletColor, [string, string]> = {
  red: [C.red, '#ffb0a8'],
  amber: [C.amber, '#fff0b0'],
  violet: [C.violet, '#d9a6f0'],
  bone: [C.grey, '#ffffff'],
};

export const BULLET_R: Record<BulletSkin, number> = { small: 2, orb: 3, big: 5, huge: 9, rice: 2.5, shard: 2.5 };

// ---------------------------------------------------------------------------

export const SPR = {
  player: null as unknown as DirFrames,
  bullets: {} as Record<string, Sprite | Sprite[]>,
  /** Снаряды игрока по цвету: кэшируются при первом запросе */
  shotCache: new Map<string, Sprite>(),
  coin: [] as Sprite[],
  medkit: null as unknown as Sprite,
  /** Заряд сбоя (подбираемая ячейка) */
  glitchCell: null as unknown as Sprite,
  heart: null as unknown as Sprite,
  heartEmpty: null as unknown as Sprite,
  /** Кресло операционной с роботом-хирургом (2 кадра) */
  surgery: [] as Sprite[],
  /** Рюкзак (HUD) */
  packIcon: null as unknown as Sprite,
  coinIcon: null as unknown as Sprite,
  pedestal: null as unknown as Sprite,
  teleporter: [] as Sprite[],
  shadow: null as unknown as Sprite,
};

export function bulletSprite(skin: BulletSkin, color: BulletColor, angle = 0): Sprite {
  const s = SPR.bullets[skin + ':' + color];
  if (Array.isArray(s)) {
    const i = Math.round((angle / (Math.PI * 2)) * 16) & 15;
    return s[i];
  }
  return s;
}

/** Снаряд игрока: круг произвольного радиуса и цвета */
export function shotSprite(r: number, color: string): Sprite {
  const rr = Math.max(1, Math.min(14, Math.round(r)));
  const key = rr + color;
  let s = SPR.shotCache.get(key);
  if (!s) {
    s = circle(rr, color, '#fff6dc', C.black);
    SPR.shotCache.set(key, s);
  }
  return s;
}

export function initSprites() {
  SPR.player = playerFrames();
  for (const col of BULLET_COLORS) {
    const [ring, core] = BC[col];
    SPR.bullets['small:' + col] = circle(2, ring, core);
    SPR.bullets['orb:' + col] = circle(3, ring, core);
    SPR.bullets['big:' + col] = circle(5, ring, core);
    SPR.bullets['huge:' + col] = circle(9, ring, core);
    SPR.bullets['rice:' + col] = rice(4, 2, ring, core);
    SPR.bullets['shard:' + col] = rice(4, 1.5, core, ring);
  }
  // энергоячейка: маленький аккумулятор, заряд пробегает снизу вверх
  SPR.coin = [
    fromRows(['.11.', '1661', '1dd1', '1dd1', '1ee1', '1111']),
    fromRows(['.11.', '1661', '1dd1', '1ee1', '1dd1', '1111']),
    fromRows(['.11.', '1661', '1ee1', '1dd1', '1dd1', '1111']),
    fromRows(['.11.', '1661', '1dd1', '1dd1', '1dd1', '1111']),
  ];
  SPR.medkit = fromRows([
    '.111111111.',
    '15555555551',
    '15556a55551',
    '1556aaa5551',
    '15556a55551',
    '13333333331',
    '.111111111.',
  ]);
  SPR.glitchCell = fromRows(['.1.1.1.', '1111111', '13fff31', '1f7ff71', '13fff31', '1111111', '.1.1.1.']);
  SPR.heart = fromRows(['.11.11.', '1aa1ba1', '1aaaaa1', '.19aa1.', '..191..', '...1...']);
  SPR.heartEmpty = fromRows(['.11.11.', '1331331', '1333331', '.13331.', '..131..', '...1...']);
  SPR.surgery = surgeryArt();
  SPR.packIcon = fromRows(['..111..', '.1cdc1.', '1cdddc1', '1c1d1c1', '1cdddc1', '.11111.']);
  SPR.coinIcon = fromRows(['.11.', '1661', '1ee1', '1ed1', '1dd1', '1111']);
  SPR.pedestal = fromRows([
    '..1111111111..',
    '.144444444441.',
    '.133333333331.',
    '..1222222221..',
    '..13a3333a31..',
    '..1222222221..',
    '.111111111111.',
  ]);
  SPR.teleporter = [0, 1, 2, 3].map((f) => {
    const [c, p] = painter(24, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 24; x++) {
        const e = ((x + 0.5 - 12) / 12) ** 2 + ((y + 0.5 - 8) / 8) ** 2;
        if (e <= 1 && e > 0.75) p(C.steel, x, y);
        else if (e <= 0.75 && e > 0.55) p(C.void, x, y);
        else if (e <= 0.55) {
          const ring = Math.floor(Math.sqrt(e) * 6 + f) % 3;
          p(ring === 0 ? C.redD : ring === 1 ? C.blood : C.black, x, y);
        }
      }
    }
    return c;
  });
  const [sh, sp] = painter(10, 4);
  sp('rgba(0,0,0,0.5)', 1, 0, 8, 4);
  sp('rgba(0,0,0,0.5)', 0, 1, 10, 2);
  SPR.shadow = sh;
}

/** Белый силуэт для вспышки попадания, кэшируется */
const flashCache = new WeakMap<Sprite, Sprite>();
export function flashOf(s: Sprite): Sprite {
  let f = flashCache.get(s);
  if (!f) {
    f = silhouette(s, '#ffffff');
    flashCache.set(s, f);
  }
  return f;
}
