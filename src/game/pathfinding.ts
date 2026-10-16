import { TILE } from '../config';
import type { RoomMap } from '../world/room';
import { walkable } from '../world/tiles';

/**
 * Поле расстояний до игрока (BFS по тайлам). Наземные враги идут "вниз по склону",
 * поэтому обходят препятствия и ямы. Пересчитывается, только когда игрок сменил тайл.
 */
export class FlowField {
  dist: Int16Array;
  private ptx = -1;
  private pty = -1;
  private queue: Int32Array;

  constructor(private room: RoomMap) {
    this.dist = new Int16Array(room.tw * room.th);
    this.queue = new Int32Array(room.tw * room.th);
  }

  update(px: number, py: number) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx === this.ptx && ty === this.pty) return;
    this.ptx = tx;
    this.pty = ty;
    const { tw, th, tiles } = this.room;
    const dist = this.dist;
    dist.fill(-1);
    if (tx < 0 || ty < 0 || tx >= tw || ty >= th) return;
    let head = 0, tail = 0;
    dist[ty * tw + tx] = 0;
    this.queue[tail++] = ty * tw + tx;
    while (head < tail) {
      const i = this.queue[head++];
      const x = i % tw, y = (i / tw) | 0;
      const d = dist[i] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
        const ni = ny * tw + nx;
        if (dist[ni] >= 0 || !walkable(tiles[ni])) continue;
        dist[ni] = d;
        this.queue[tail++] = ni;
      }
    }
  }

  /** Направление (единичный вектор) к игроку из точки, либо null если путь не найден */
  direction(x: number, y: number): [number, number] | null {
    const { tw, th } = this.room;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= tw || ty >= th) return null;
    const here = this.dist[ty * tw + tx];
    if (here < 0) return null;
    if (here === 0) return null;
    let best = here, bx = 0, by = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
        const d = this.dist[ny * tw + nx];
        if (d < 0) continue;
        // по диагонали только если оба соседних тайла свободны (не срезаем углы)
        if (dx && dy && (this.dist[ty * tw + nx] < 0 || this.dist[ny * tw + tx] < 0)) continue;
        if (d < best) {
          best = d;
          bx = dx;
          by = dy;
        }
      }
    }
    if (!bx && !by) return null;
    // целимся в центр следующего тайла
    const cx = (tx + bx + 0.5) * TILE - x, cy = (ty + by + 0.5) * TILE - y;
    const len = Math.hypot(cx, cy) || 1;
    return [cx / len, cy / len];
  }
}
