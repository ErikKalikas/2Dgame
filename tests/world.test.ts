import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { TILE } from '../src/config';
import { generateLevel } from '../src/world/levelgen';
import { buildLevel } from '../src/world/level';
import { BATTLE } from '../src/world/roles';
import { T, walkable } from '../src/world/tiles';

describe('карта уровня и начинка комнат', () => {
  it('одинаковый seed даёт одинаковую карту с препятствиями', () => {
    const a = buildLevel(generateLevel(3, new RNG('SEED-1:floor:3')), 'SEED-1');
    const b = buildLevel(generateLevel(3, new RNG('SEED-1:floor:3')), 'SEED-1');
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(Array.from(a.decor)).toEqual(Array.from(b.decor));
  });

  it('в каждой комнате все двери и центр достижимы, закрыта только гермодверь петли', () => {
    for (let s = 0; s < 30; s++) {
      const floor = 1 + (s % 9);
      const plan = generateLevel(floor, new RNG('map' + s));
      const map = buildLevel(plan, 'map' + s);
      // двери: открытые — пол, гермодверь — закрыта
      for (const d of plan.doors) expect(map.get(d.tx, d.ty)).toBe(d.gate ? T.Door : T.Floor);
      for (const r of plan.rooms) {
        // заливка внутри комнаты от первой двери (ящики можно сломать)
        const seen = new Set<number>();
        const p0 = map.doorInside(plan.doors[r.doors[0]]);
        const start = Math.floor(p0.y / TILE) * map.tw + Math.floor(p0.x / TILE);
        const stack = [start];
        seen.add(start);
        while (stack.length) {
          const i = stack.pop()!;
          const x = i % map.tw, y = (i / map.tw) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy, ni = ny * map.tw + nx;
            if (nx <= r.x || ny <= r.y || nx >= r.x + r.w - 1 || ny >= r.y + r.h - 1) continue;
            const t = map.tiles[ni];
            if (seen.has(ni) || !(walkable(t) || t === T.Crate)) continue;
            seen.add(ni);
            stack.push(ni);
          }
        }
        for (const di of r.doors) {
          const p = map.doorInside(plan.doors[di]);
          expect(seen.has(Math.floor(p.y / TILE) * map.tw + Math.floor(p.x / TILE))).toBe(true);
        }
        // препятствия — только в боевых комнатах и на арене босса
        if (!BATTLE.has(r.role) && r.role !== 'exit') {
          for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
            if (map.get(x, y) !== T.Floor) throw new Error(`препятствие в комнате ${r.role}`);
          }
        }
      }
    }
  });

  it('точка внутри комнаты определяется по прямоугольнику без стен', () => {
    const plan = generateLevel(1, new RNG('zone'));
    const map = buildLevel(plan, 'zone');
    for (const r of plan.rooms) {
      const c = map.roomCenter(r);
      expect(map.roomOfPoint(c.x, c.y)?.id).toBe(r.id);
      // на стене — уже не внутри
      expect(map.roomOfPoint(r.x * TILE + 8, c.y)).toBeNull();
      // случайная точка «рядом с центром» остаётся в этой же комнате
      const p = map.randomFloorPoint(new RNG('p' + r.id), c.x, c.y, 0);
      expect(map.roomOfPoint(p.x, p.y)?.id).toBe(r.id);
    }
  });
});
