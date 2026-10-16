import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { generateFloor, roomTarget } from '../src/world/floorgen';
import { buildRoom } from '../src/world/room';
import { T, walkable } from '../src/world/tiles';
import { TILE } from '../src/config';

describe('генерация этажа', () => {
  it('одинаковый seed даёт одинаковый этаж', () => {
    const a = generateFloor(3, new RNG('SEED-1'));
    const b = generateFloor(3, new RNG('SEED-1'));
    expect(Array.from(a.grid)).toEqual(Array.from(b.grid));
  });

  it('количество комнат растёт с этажом как в Isaac', () => {
    expect(roomTarget(1, new RNG(1))).toBeGreaterThanOrEqual(8);
    expect(roomTarget(1, new RNG(1))).toBeLessThanOrEqual(9);
    expect(roomTarget(8, new RNG(1))).toBe(20);
  });

  for (let floor = 1; floor <= 9; floor++) {
    it(`этаж ${floor}: особые комнаты на месте и всё связно (100 seed)`, () => {
      for (let s = 0; s < 100; s++) {
        const plan = generateFloor(floor, new RNG(`t${floor}-${s}`));
        const types = plan.rooms.map((r) => r.type);
        expect(types.filter((t) => t === 'start')).toHaveLength(1);
        expect(types.filter((t) => t === 'boss')).toHaveLength(1);
        expect(types.filter((t) => t === 'treasure')).toHaveLength(1);
        expect(types.filter((t) => t === 'shop')).toHaveLength(1);
        expect(types.filter((t) => t === 'surgery')).toHaveLength(1);
        // особые комнаты — тупики размером 1×1
        for (const r of plan.rooms) {
          if (r.type === 'boss' || r.type === 'treasure' || r.type === 'shop' || r.type === 'surgery') {
            expect(r.w * r.h).toBe(1);
            expect(r.doors).toHaveLength(1);
          }
        }
        // двери симметричны
        for (const r of plan.rooms) {
          for (const d of r.doors) {
            expect(plan.rooms[d.to].doors.some((o) => o.to === r.id)).toBe(true);
          }
        }
        // все комнаты достижимы от старта
        const seen = new Set([plan.startId]);
        const stack = [plan.startId];
        while (stack.length) {
          const id = stack.pop()!;
          for (const d of plan.rooms[id].doors) if (!seen.has(d.to)) {
            seen.add(d.to);
            stack.push(d.to);
          }
        }
        expect(seen.size).toBe(plan.rooms.length);
      }
    });
  }
});

describe('генерация комнаты', () => {
  it('все двери достижимы и стоят в стенах', () => {
    for (let s = 0; s < 40; s++) {
      const plan = generateFloor(1 + (s % 8), new RNG('room' + s));
      for (const info of plan.rooms) {
        const room = buildRoom(info, new RNG(`r${s}-${info.id}`));
        expect(room.doors.length).toBe(info.doors.length);
        // заливка от первой двери по проходимым тайлам (ящики можно сломать)
        const seen = new Uint8Array(room.tw * room.th);
        const p0 = room.doorEntry(room.doors[0]);
        const start = Math.floor(p0.y / TILE) * room.tw + Math.floor(p0.x / TILE);
        const stack = [start];
        seen[start] = 1;
        while (stack.length) {
          const i = stack.pop()!;
          const x = i % room.tw, y = (i / room.tw) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (!room.inside(nx, ny)) continue;
            const ni = ny * room.tw + nx;
            const t = room.tiles[ni];
            if (seen[ni] || !(walkable(t) || t === T.Crate)) continue;
            seen[ni] = 1;
            stack.push(ni);
          }
        }
        for (const d of room.doors) {
          expect(room.get(d.tx, d.ty)).toBe(T.Door);
          const p = room.doorEntry(d);
          expect(seen[Math.floor(p.y / TILE) * room.tw + Math.floor(p.x / TILE)]).toBe(1);
        }
      }
    }
  });
});
