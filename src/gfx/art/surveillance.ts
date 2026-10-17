import type { Sprite } from '../sprite';
import { Grid, Mask } from './pix';

// Графика розыска (этап 14а): камеры, глушилка, дрон-охотник. Индексы палитры как в enemies.ts:
// 0 пустота, 1 чёрный, 2 тёмный металл, 3 металл, 4 сталь, 5 светлая сталь, 6 серый, 7 кость,
// 8 запёкшаяся кровь, 9 тёмно-красный, a красный, b алый, c тёмный янтарь, d янтарь, e жёлтый.

type Layer = [string[], number, number];

function frame(w: number, h: number, layers: Layer[], outline = true): Grid {
  const g = new Grid(w, h);
  for (const [r, x, y] of layers) g.rows(r, x, y);
  return outline ? g.outline(0) : g;
}

// ---------------------------------------------------------------- стенная камера

/** Состояние камеры на спрайте: on — горит, off — взломана (объектив тёмный), broken — разбита */
export type CamLook = 'on' | 'off' | 'broken';
/** Куда смотрит корпус: влево-вниз, вниз, вправо-вниз */
export type CamDir = 'l' | 'd' | 'r';

// кронштейн на стене и корпус; X — объектив (цвет по состоянию)
const CAM_D = [
  '..21112..',
  '..23432..',
  '...343...',
  '...454...',
  '.2355532.',
  '.3566653.',
  '.3566653.',
  '.2455542.',
  '..24X42..',
  '...222...',
];
const CAM_L = [
  '...21112.',
  '...23432.',
  '....343..',
  '....454..',
  '..235532.',
  '.3566653.',
  '35666532.',
  '4X55542..',
  '.2X422...',
  '..22.....',
];

const LENS: Record<CamLook, string> = { on: 'b', off: '2', broken: '1' };

function camGrid(dir: CamDir, look: CamLook): Grid {
  const rows = (dir === 'd' ? CAM_D : CAM_L).map((r) => r.replace(/X/g, LENS[look]));
  const g = frame(9, 10, [[rows, 0, 0]]);
  // взломанная: янтарная метка-перемычка на корпусе
  if (look === 'off') g.set(dir === 'd' ? 5 : 4, 5, 13);
  if (look === 'broken') {
    // трещина по корпусу, отбитый угол и провисший провод
    g.set(3, 5, 1);
    g.set(4, 6, 1);
    g.set(5, 6, 2);
    g.set(dir === 'd' ? 6 : 1, 6, 0);
    g.set(dir === 'd' ? 7 : 2, 9, 2);
  }
  return dir === 'r' ? mirrored(g) : g;
}

function mirrored(src: Grid): Grid {
  const g = new Grid(src.w, src.h);
  return g.blit(src, 0, 0, true);
}

const camCache = new Map<string, Sprite>();
/** Спрайт стенной камеры (9×10): верхний край — на стене, объектив внизу */
export function wallCameraArt(dir: CamDir, look: CamLook): Sprite {
  const k = dir + look;
  let s = camCache.get(k);
  if (!s) camCache.set(k, (s = camGrid(dir, look).toSprite()));
  return s;
}

// ---------------------------------------------------------------- купол в коридоре

let domeSprites: Record<CamLook, Sprite> | null = null;
/** Купол камеры под потолком коридора (9×9); объектив рисуется отдельно — он вращается */
export function domeCameraArt(look: CamLook): Sprite {
  if (!domeSprites) {
    const make = (l: CamLook) => {
      const g = new Grid(9, 9);
      const ring = new Mask(9, 9).ellipse(4.5, 4.5, 4.4, 4.4);
      g.fill(ring, 2, 3, 1, 0);
      const dome = new Mask(9, 9).ellipse(4.5, 4.5, 3.1, 3.1);
      g.shade(dome, l === 'broken' ? [1, 2, 3] : [2, 3, 4, 5, 6], { amb: 0.55, k: 0.8, dither: false });
      // блик стекла
      if (l !== 'broken') g.set(3, 3, 7);
      else {
        g.set(3, 3, 1);
        g.set(4, 4, 1);
        g.set(5, 4, 1);
        g.set(5, 5, 0);
      }
      // болты кольца
      g.set(4, 0, 4);
      g.set(0, 4, 4);
      g.set(8, 4, 4);
      g.set(4, 8, 4);
      return g.toSprite();
    };
    domeSprites = { on: make('on'), off: make('off'), broken: make('broken') };
  }
  return domeSprites[look];
}

// ---------------------------------------------------------------- глушилка

let jammerFrames: Sprite[] | null = null;
/**
 * Глушилка (17×26, 2 кадра): шкаф с решёткой и полосами, мачта с растяжками и тарелка-излучатель.
 * Огоньки шкафа мигают по кадрам
 */
export function jammerArt(): Sprite[] {
  if (jammerFrames) return jammerFrames;
  const dish = [
    '..2344444432..',
    '.234555555432.',
    '..2233333322..',
    '....22.22.....',
  ];
  const mast = [
    '..e..',
    '.2d2.',
    '..3..',
    '..4..',
    '.232.',
    '..3..',
    '..4..',
    '.232.',
    '..3..',
    '..4..',
    '..3..',
  ];
  const cabinet = [
    '.23333333333332.',
    '2344444444444432',
    '2311111111111132',
    '2312121212121232',
    '2311111111111132',
    '23cdcdcdcdcdcd32',
    '2333333333333332',
    '.22222222222222.',
  ];
  const lights = (f: number) => [f ? 'b.d.e' : 'a.e.d'];
  jammerFrames = [0, 1].map((f) => {
    const g = frame(17, 26, [
      [cabinet, 0, 17],
      [mast, 6, 5],
      [dish, 1, 2],
      [lights(f), 2, 19],
      [['5'], 13, 19],
    ]);
    // растяжки мачты к углам шкафа
    for (let i = 0; i < 5; i++) {
      g.set(5 - i, 11 + i, 2);
      g.set(11 + i, 11 + i, 2);
    }
    // вершина излучателя светится через кадр
    g.set(8, 0, f ? 14 : 13);
    return g.toSprite();
  });
  return jammerFrames;
}

// ---------------------------------------------------------------- дрон-охотник

/**
 * Дрон-охотник (14×12, 2 кадра винтов): бронированный «Дрон-наблюдатель» Диспетчера — угловатый
 * тёмный корпус, красная полоса тревоги, один алый сенсор и ствол снизу. Смотрит вправо
 */
export function hunterDroneArt(): Sprite[] {
  const body = [
    '..............',
    '..............',
    '..............',
    '...12333321...',
    '..1234443321..',
    '..23449bb432..',
    '..23449ab432..',
    '..12333333211.',
    '...9a9a9a9a1..',
    '....2.33.2....',
    '....1.55.1....',
    '.......5......',
  ];
  const rotA = ['.444......444.', '..3........3..', '..22......22..'];
  const rotB = ['..4........4..', '.343......343.', '..22......22..'];
  return [0, 1].map((f) => frame(14, 12, [[f ? rotB : rotA, 0, 0], [body, 0, 0]]).toSprite());
}

// ---------------------------------------------------------------- Поллукс

/**
 * Перекраска близнеца: Поллукс — вороненая (темнее на ступень) броня и красные метки и маячки;
 * Кастор остаётся светлым хромом с янтарём
 */
export const POLLUX_SWAP: Record<number, number> = { 12: 8, 13: 10, 14: 11, 7: 6, 6: 5, 5: 4 };
