// Раскладка окружения комнаты: где на стенах висят лампы и прочая арматура, где светящиеся
// элементы и источники анимированных деталей. Одна и та же раскладка используется и при
// рисовании статичного слоя (roomrender), и в освещении (render.ts), поэтому они всегда совпадают.
import { CELL_H, CELL_W, TILE } from '../../config';
import type { FloorTheme, Tier } from '../../content/floors';
import type { RoomMap } from '../../world/room';
import { T } from '../../world/tiles';
import { hash, rnd } from './util';

/** Арматура на стене */
export const FX = {
  None: 0,
  Lamp: 1,
  /** Светящийся элемент яруса: сток (sump), печь (foundry), окно (hab), светофор (transit), стойка (spire) */
  Emit: 2,
  DetA: 3,
  DetB: 4,
  /** Редкая фиолетовая вывеска (hab) */
  Sign: 5,
} as const;

/** Сторона стены, обращённая в комнату */
export const SIDE = { None: 0, Face: 1, Left: 2, Right: 3, Bottom: 4 } as const;

export interface Light {
  x: number;
  y: number;
  r: number;
  a: number;
  rgb: string;
  /** Второй цвет (светофор переключается между двумя) */
  rgb2?: string;
  /** 0 — ровный свет; иначе зерно мерцания */
  flick: number;
  /** 0 — не мигает; иначе зерно медленного включения/выключения */
  blink: number;
  kind: 'lamp' | 'pool' | 'emit' | 'pit' | 'sign' | 'signal' | 'heat';
  /** Индекс тайла, тип которого должен сохраниться (ящик-стойка может быть разрушен), или -1 */
  tile: number;
  tt: number;
}

export interface Emitter {
  x: number;
  y: number;
  seed: number;
  /** Вариант: для огней — цвет (0 красный, 1 янтарь, 2 фиолетовый), для капель — длина падения */
  k: number;
}

export interface EnvLayout {
  /** FX.* для каждого тайла стены */
  fix: Uint8Array;
  /** SIDE.* для каждого тайла стены */
  side: Uint8Array;
  lights: Light[];
  electro: number[];
  drips: Emitter[];
  steam: Emitter[];
  sparks: Emitter[];
  /** Мигающие огоньки: окна, светофоры, светодиоды */
  blinks: Emitter[];
  /** Светодиоды на разрушаемых стойках (проверяются по тайлу) */
  rackLeds: Emitter[];
  /** Рельсы магистралей: строки (горизонтальные пути) или столбцы (вертикальные) */
  trackRows: number[];
  trackCols: number[];
}

interface TierCfg {
  face: number;
  side: number;
  bottom: number;
  lampR: number;
  emit: number;
  det: number;
}

const CFG: Record<Tier, TierCfg> = {
  sump: { face: 8, side: 7, bottom: 9, lampR: 62, emit: 0.16, det: 0.5 },
  foundry: { face: 6, side: 6, bottom: 8, lampR: 66, emit: 0.22, det: 0.55 },
  hab: { face: 6, side: 6, bottom: 8, lampR: 58, emit: 0.42, det: 0.4 },
  transit: { face: 7, side: 6, bottom: 9, lampR: 66, emit: 0.24, det: 0.5 },
  spire: { face: 5, side: 5, bottom: 6, lampR: 70, emit: 0.32, det: 0.45 },
};

const cache = new WeakMap<RoomMap, EnvLayout>();

/** Путь (рельсы) проходит через эту строку/столбец? Возвращает 0 — нет, 1 — первая колея, 2 — вторая */
export function trackAt(th: FloorTheme, tx: number, ty: number): number {
  if (th.tier !== 'transit') return 0;
  if (th.variant === 0) {
    const m = ty % CELL_H;
    return m === 4 || m === 12 ? 1 : m === 5 || m === 13 ? 2 : 0;
  }
  const m = tx % CELL_W;
  return m === 6 || m === 22 ? 1 : m === 7 || m === 23 ? 2 : 0;
}

export function envLayout(room: RoomMap, th: FloorTheme): EnvLayout {
  let L = cache.get(room);
  if (L) return L;
  const { tw, th: rh } = room;
  const cfg = CFG[th.tier];
  const salt = room.info.id * 131 + th.variant * 7;
  L = {
    fix: new Uint8Array(tw * rh), side: new Uint8Array(tw * rh), lights: [], electro: [],
    drips: [], steam: [], sparks: [], blinks: [], rackLeds: [], trackRows: [], trackCols: [],
  };
  const lampRgb = th.lamp;
  const inner = (x: number, y: number) => room.inside(x, y) && room.get(x, y) !== T.Wall;
  const nearDoor = (x: number, y: number) => {
    for (let d = -1; d <= 1; d++) {
      if (room.get(x + d, y) === T.Door || room.get(x, y + d) === T.Door) return true;
    }
    return false;
  };
  const lamp = (x: number, y: number, tx: number, ty: number, r = cfg.lampR, a = 0.85) => {
    const flick = rnd(tx, ty, salt + 5) < th.flicker ? 1 + (hash(tx, ty, salt + 6) % 997) : 0;
    L!.lights.push({ x, y, r, a, rgb: lampRgb, flick, blink: 0, kind: 'lamp', tile: -1, tt: 0 });
  };

  let signDone = false;
  const wantSign = th.tier === 'hab' && (th.variant === 1 || rnd(room.info.id, 3, 77) < 0.35);

  for (let ty = 0; ty < rh; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const i = ty * tw + tx;
      const t = room.tiles[i];
      if (t === T.Electro) L.electro.push(i);
      if (t === T.Pit) pitLights(L, th, tx, ty, salt);
      if (t === T.Crate && th.tier === 'spire') {
        for (let k = 0; k < 3; k++) {
          L.rackLeds.push({ x: tx * TILE + 11, y: ty * TILE + 4 + k * 3, seed: hash(tx, ty, k + salt) % 1000, k: hash(tx, ty, k) % 3 === 0 ? 0 : 1 });
        }
      }
      if (t === T.Floor && room.decor[i] === 1 && (th.tier === 'sump' || th.tier === 'foundry')) {
        if (rnd(tx, ty, salt + 9) < 0.6) L.steam.push({ x: tx * TILE + 8, y: ty * TILE + 8, seed: hash(tx, ty, salt) % 1000, k: 0 });
      }
      if (t !== T.Wall || nearDoor(tx, ty)) continue;
      const px = tx * TILE, py = ty * TILE;
      if (inner(tx, ty + 1)) {
        // фасад стены, обращённый к камере
        L.side[i] = SIDE.Face;
        const slot = (tx + 3) % cfg.face === 0;
        let f: number = FX.None;
        if (slot) f = FX.Lamp;
        else {
          const r = rnd(tx, ty, salt + 1);
          if (r < cfg.emit) f = FX.Emit;
          else if (r < cfg.emit + cfg.det) f = rnd(tx, ty, salt + 2) < 0.5 ? FX.DetA : FX.DetB;
          if (wantSign && !signDone && f !== FX.Emit && (tx + 3) % cfg.face === Math.floor(cfg.face / 2) && tx > 4) {
            f = FX.Sign;
            signDone = true;
          }
        }
        L.fix[i] = f;
        faceExtras(L, th, f, tx, ty, px, py, salt);
        if (f === FX.Lamp) lamp(px + 8, py + 15, tx, ty);
      } else if (inner(tx + 1, ty) || inner(tx - 1, ty)) {
        const left = inner(tx + 1, ty);
        L.side[i] = left ? SIDE.Left : SIDE.Right;
        if ((ty + 2) % cfg.side === 0 && ty > 1 && ty < rh - 2) {
          L.fix[i] = FX.Lamp;
          lamp(left ? px + 18 : px - 2, py + 8, tx, ty, cfg.lampR - 6, 0.7);
        }
      } else if (inner(tx, ty - 1)) {
        L.side[i] = SIDE.Bottom;
        if ((tx + 6) % cfg.bottom === 0) {
          L.fix[i] = FX.Lamp;
          lamp(px + 8, py - 1, tx, ty, cfg.lampR - 8, 0.65);
        }
      }
    }
  }

  // «потолочные» пятна света: источник над камерой, видно только световое пятно на полу
  for (let cy = 0; cy < room.info.h; cy++) {
    for (let cx = 0; cx < room.info.w; cx++) {
      for (let k = 0; k < th.pools; k++) {
        const h = hash(cx, cy, salt + 40 + k);
        const tx = cx * CELL_W + 4 + (h % (CELL_W - 8));
        const ty = cy * CELL_H + 4 + ((h >>> 10) % (CELL_H - 8));
        const flick = rnd(tx, ty, salt + 41) < th.flicker ? 1 + (h % 991) : 0;
        L.lights.push({ x: tx * TILE + 8, y: ty * TILE + 8, r: 74, a: 0.45, rgb: lampRgb, flick, blink: 0, kind: 'pool', tile: -1, tt: 0 });
      }
    }
  }

  if (th.tier === 'transit') {
    if (th.variant === 0) {
      for (let ty = 0; ty < rh; ty++) if (trackAt(th, 0, ty) === 1) L.trackRows.push(ty);
    } else {
      for (let tx = 0; tx < tw; tx++) if (trackAt(th, tx, 0) === 1) L.trackCols.push(tx);
    }
  }
  cache.set(room, L);
  return L;
}

function pitLights(L: EnvLayout, th: FloorTheme, tx: number, ty: number, salt: number) {
  const h = hash(tx, ty, salt + 20);
  const x = tx * TILE + 8, y = ty * TILE + 9;
  if (th.tier === 'sump' && h % 3 === 0) {
    L.lights.push({ x, y, r: 30, a: 0.32, rgb: th.glow, flick: 0, blink: 0, kind: 'pit', tile: -1, tt: 0 });
  } else if (th.tier === 'foundry' && (th.variant === 1 ? h % 2 === 0 : h % 5 === 0)) {
    L.lights.push({ x, y, r: th.variant === 1 ? 40 : 26, a: th.variant === 1 ? 0.6 : 0.3, rgb: th.glow, flick: 1 + (h % 500), blink: 0, kind: 'heat', tile: -1, tt: 0 });
  } else if (th.tier === 'spire' && h % 6 === 0) {
    L.lights.push({ x, y, r: 20, a: 0.22, rgb: th.glow, flick: 0, blink: 0, kind: 'pit', tile: -1, tt: 0 });
  }
}

/** Свет и анимированные детали, которые даёт арматура фасада */
function faceExtras(L: EnvLayout, th: FloorTheme, f: number, tx: number, ty: number, px: number, py: number, salt: number) {
  const seed = hash(tx, ty, salt + 3) % 1000;
  switch (th.tier) {
    case 'sump':
      if (f === FX.Emit) {
        L.lights.push({ x: px + 8, y: py + 14, r: 30, a: 0.4, rgb: th.glow, flick: 0, blink: 0, kind: 'emit', tile: -1, tt: 0 });
        L.drips.push({ x: px + 8, y: py + 12, seed, k: 10 });
      } else if (f !== FX.Lamp && hash(tx, ty, salt + 8) % (th.variant === 1 ? 2 : 3) === 0) {
        // капли с трубы, что тянется вдоль фасада
        L.drips.push({ x: px + 3 + (seed % 10), y: py + 9, seed, k: 12 + (seed % 6) });
      }
      break;
    case 'foundry':
      if (f === FX.Emit) {
        L.lights.push({ x: px + 8, y: py + 15, r: 72, a: 0.9, rgb: th.glow, flick: 1 + seed, blink: 0, kind: 'heat', tile: -1, tt: 0 });
        L.sparks.push({ x: px + 8, y: py + 12, seed, k: 0 });
      } else if (f === FX.DetB && seed % 2 === 0) {
        L.sparks.push({ x: px + 4 + (seed % 8), y: py + 6, seed, k: 1 });
      }
      break;
    case 'hab':
      if (f === FX.Emit) {
        L.lights.push({ x: px + 8, y: py + 13, r: 26, a: 0.5, rgb: th.glow, flick: 0, blink: 1 + seed, kind: 'emit', tile: -1, tt: 0 });
        L.blinks.push({ x: px + 6, y: py + 6, seed, k: 2 });
      } else if (f === FX.Sign) {
        L.lights.push({ x: px + 8, y: py + 12, r: 46, a: 0.55, rgb: '150,70,200', flick: 1 + seed, blink: 0, kind: 'sign', tile: -1, tt: 0 });
      } else if (f === FX.DetA) {
        // капсульная дверь: огонёк статуса
        L.blinks.push({ x: px + 12, y: py + 7, seed, k: seed % 4 === 0 ? 1 : 0 });
      }
      break;
    case 'transit':
      if (f === FX.Emit) {
        L.lights.push({ x: px + 8, y: py + 13, r: 40, a: 0.75, rgb: '255,58,46', rgb2: '255,190,60', flick: 0, blink: 1 + seed, kind: 'signal', tile: -1, tt: 0 });
        L.blinks.push({ x: px + 7, y: py + 6, seed, k: 3 });
      }
      break;
    case 'spire':
      if (f === FX.Emit) {
        L.lights.push({ x: px + 8, y: py + 14, r: 26, a: 0.35, rgb: th.glow, flick: 0, blink: 0, kind: 'emit', tile: -1, tt: 0 });
        for (let k = 0; k < 4; k++) L.blinks.push({ x: px + 4 + (k & 1) * 7, y: py + 6 + (k >> 1) * 4, seed: (seed + k * 137) % 1000, k: k === 0 ? 0 : 1 });
      } else if (f === FX.DetA) {
        L.lights.push({ x: px + 8, y: py + 14, r: 22, a: 0.4, rgb: '255,58,46', flick: 0, blink: 0, kind: 'emit', tile: -1, tt: 0 });
      }
      break;
  }
}
