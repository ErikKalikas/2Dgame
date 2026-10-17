import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { FLOOR_THEMES } from '../src/content/floors';
import { doorTiles, floodFrom, generateLevel, reachAll, type LevelPlan } from '../src/world/levelgen';
import { ROLES, TIER_GEN } from '../src/world/roles';
import { T } from '../src/world/tiles';

const SEEDS = 60;

const count = (p: LevelPlan, role: string) => p.rooms.filter((r) => r.role === role).length;

describe('генерация уровня (граф → роли → размещение → коридоры)', () => {
  it('одинаковый seed даёт одинаковый уровень', () => {
    const a = generateLevel(4, new RNG('SEED-1'));
    const b = generateLevel(4, new RNG('SEED-1'));
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.rooms.map((r) => [r.role, r.x, r.y, r.w, r.h])).toEqual(b.rooms.map((r) => [r.role, r.x, r.y, r.w, r.h]));
  });

  for (let floor = 1; floor <= 9; floor++) {
    it(`уровень ${floor}: роли, размещение, двери и связность (${SEEDS} seed)`, () => {
      const gen = TIER_GEN[FLOOR_THEMES[floor - 1].tier];
      let time = 0;
      for (let s = 0; s < SEEDS; s++) {
        const t0 = performance.now();
        const p = generateLevel(floor, new RNG(`lv${floor}-${s}`));
        time += performance.now() - t0;
        const { tw, tiles } = p;

        // роли по решениям Эрика
        expect(p.rooms[p.startId].role).toBe('start');
        expect(p.rooms[p.exitId].role).toBe('exit');
        expect(count(p, 'start')).toBe(1);
        expect(count(p, 'exit')).toBe(1);
        expect(count(p, 'surgery')).toBe(1);
        expect(count(p, 'cache')).toBeGreaterThanOrEqual(1);
        expect(count(p, 'cache')).toBeLessThanOrEqual(3);
        expect(count(p, 'elite')).toBe(floor >= 5 ? 1 : floor === 1 ? 0 : count(p, 'elite'));
        expect(count(p, 'elite')).toBeLessThanOrEqual(1);
        expect(count(p, 'market')).toBe(floor >= 2 ? 1 : 0);
        expect(count(p, 'shaft')).toBeLessThanOrEqual(1);
        expect(count(p, 'miniboss')).toBeLessThanOrEqual(floor <= 8 ? 1 : 0);
        expect(count(p, 'jammer')).toBeLessThanOrEqual(floor <= 8 ? 1 : 0);
        expect(p.rooms.length).toBeGreaterThanOrEqual(gen.rooms[0]);
        expect(count(p, 'combat') + count(p, 'ambush') + count(p, 'elite')).toBeGreaterThanOrEqual(gen.minFill);

        // комнаты не пересекаются: между стенами не меньше 5 тайлов
        for (const a of p.rooms) {
          for (const b of p.rooms) {
            if (a.id >= b.id) continue;
            const gap = Math.max(b.x - (a.x + a.w - 1), a.x - (b.x + b.w - 1), b.y - (a.y + a.h - 1), a.y - (b.y + b.h - 1));
            expect(gap).toBeGreaterThanOrEqual(5);
          }
        }

        // тупики (выход, операционная, схрон, шахта, барахолка, мини-босс) — с одной дверью
        for (const r of p.rooms) if (ROLES[r.role].leaf) expect(r.doors).toHaveLength(1);

        // двери стоят в стенах своих комнат, стены комнат целы везде, кроме проёмов
        const doorSet = new Set<number>();
        for (const d of p.doors) {
          const r = p.rooms[d.room];
          if (d.dir === 'n') expect(d.ty).toBe(r.y);
          if (d.dir === 's') expect(d.ty).toBe(r.y + r.h - 1);
          if (d.dir === 'w') expect(d.tx).toBe(r.x);
          if (d.dir === 'e') expect(d.tx).toBe(r.x + r.w - 1);
          for (const [x, y] of doorTiles(d)) {
            expect(tiles[y * tw + x]).toBe(T.Door);
            doorSet.add(y * tw + x);
          }
        }
        let bad = 0;
        for (const r of p.rooms) {
          for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.w; x++) {
              const border = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
              const t = tiles[y * tw + x];
              if (t !== (!border ? T.Floor : doorSet.has(y * tw + x) ? T.Door : T.Wall)) bad++;
            }
          }
        }
        // по краю карты пола нет
        for (let x = 0; x < tw; x++) {
          if (tiles[x] !== T.Void && tiles[x] !== T.Wall) bad++;
          if (tiles[(p.th - 1) * tw + x] !== T.Void && tiles[(p.th - 1) * tw + x] !== T.Wall) bad++;
        }
        expect(bad).toBe(0);

        // петли: 1–2, гермодверь у комнаты ближе к старту, терминал дальше
        expect(p.loops.length).toBeGreaterThanOrEqual(gen.loops[0]);
        expect(p.loops.length).toBeLessThanOrEqual(gen.loops[1]);
        for (const l of p.loops) {
          const gate = p.doors[l.gateDoor];
          expect(gate.gate && gate.locked).toBe(true);
          expect(p.rooms[gate.room].depth).toBeLessThanOrEqual(p.rooms[l.terminalRoom].depth);
          expect(p.rooms[l.terminalRoom].role).not.toBe('exit');
        }

        // всё достижимо от старта при закрытых гермодверях (терминал в том числе)
        expect(reachAll(p, false)).toBe(true);
        const seen = floodFrom(p, false);
        for (const l of p.loops) {
          const r = p.rooms[l.terminalRoom];
          expect(seen[(r.y + 1) * tw + r.x + 1]).toBe(1);
        }
      }
      // генерация быстрая (средняя по seed)
      expect(time / SEEDS).toBeLessThan(40);
    });
  }
});
