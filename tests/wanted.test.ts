import { beforeAll, describe, expect, it } from 'vitest';
import { registerContent } from '../src/content';
import { ENEMY_BY_ID } from '../src/content/enemies';
import { Enemy, type EnemyDef } from '../src/game/enemy';
import { Game } from '../src/game/game';
import { setAim } from '../src/game/team';
import { shoot } from '../src/game/patterns';
import {
  AFTER_CLEANER, HEAT_TIME, addHeat, cleanerDefeated, cleanerSpawned, noise, shouldSpawnCleaner,
  wantedKill, wantedLevel,
} from '../src/game/wanted';

// Этап 14а.1: розыск 0–5.

beforeAll(() => registerContent());

const def = (id: string, over: Partial<EnemyDef> = {}): EnemyDef => ({ ...ENEMY_BY_ID.get(id)!, frames: () => [], ...over });

function game(): Game {
  const g = new Game('wanted-test', 'normal');
  g.player.invuln = 99;
  return g;
}

function foe(g: Game, id: string, dx: number, dy = 0): Enemy {
  const e = new Enemy(def(id), g.player.x + dx, g.player.y + dy, 1);
  e.spawn = 0;
  e.home = g.zone?.id ?? -2;
  g.enemies.push(e);
  return e;
}

describe('розыск', () => {
  it('растёт со временем: +1 ступень за 2 минуты тихо', () => {
    const g = game();
    expect(wantedLevel(g)).toBe(0);
    for (let i = 0; i < 60 * 121; i++) addHeat(g, HEAT_TIME / 60);
    expect(wantedLevel(g)).toBe(1);
    expect(g.logLines.some((l) => l.text.ru.startsWith('Розыск 1'))).toBe(true);
  });

  it('шум и убийства поднимают розыск; взрывы ограничены за секунду', () => {
    const g = game();
    const h0 = g.wanted.heat;
    noise(g, 'glitch');
    expect(g.wanted.heat - h0).toBeCloseTo(0.15);
    const h1 = g.wanted.heat;
    for (let i = 0; i < 20; i++) noise(g, 'explosion');
    expect(g.wanted.heat - h1).toBeLessThanOrEqual(0.0301);
    const e = foe(g, 'scav', 40);
    e.lastHit = { source: 'bullet', by: 'player' };
    e.mem.face = Math.PI; // смотрит на игрока
    const h2 = g.wanted.heat;
    wantedKill(g, e);
    expect(g.wanted.heat).toBeGreaterThan(h2);
  });

  it('тихое убийство в спину снижает розыск, пока отряд не стрелял', () => {
    const g = game();
    addHeat(g, 1.5);
    const e = foe(g, 'scav', 40);
    e.mem.face = 0; // смотрит от игрока
    e.lastHit = { source: 'bullet', by: 'player' };
    const h = g.wanted.heat;
    wantedKill(g, e);
    expect(g.wanted.heat).toBeLessThan(h);
    // отряд выстрелил — уже не тихо
    const e2 = foe(g, 'punk', 40);
    e2.mem.face = 0;
    e2.lastHit = { source: 'bullet', by: 'player' };
    setAim(g, e2);
    shoot(g, e2.x, e2.y, 0, 80);
    setAim(g, null);
    const h2 = g.wanted.heat;
    wantedKill(g, e2);
    expect(g.wanted.heat).toBeGreaterThan(h2);
    // взрыв в спину — не тихо
    const e3 = foe(g, 'scav', -40);
    e3.home = -2;
    e3.mem.face = Math.PI;
    e3.lastHit = { source: 'explosion', by: 'player' };
    const h3 = g.wanted.heat;
    wantedKill(g, e3);
    expect(g.wanted.heat).toBeGreaterThan(h3);
  });

  it('шкала 0–5, на новом уровне −2', () => {
    const g = game();
    addHeat(g, 99);
    expect(wantedLevel(g)).toBe(5);
    g.startFloor(2);
    expect(wantedLevel(g)).toBe(3);
    addHeat(g, -99);
    g.startFloor(3);
    expect(wantedLevel(g)).toBe(0);
  });

  it('Чистильщик: на розыске 5, один раз за уровень; победа — розыск 2', () => {
    const g = game();
    expect(shouldSpawnCleaner(g)).toBe(false);
    addHeat(g, 5);
    expect(shouldSpawnCleaner(g)).toBe(true);
    cleanerSpawned(g);
    expect(shouldSpawnCleaner(g)).toBe(false);
    cleanerDefeated(g);
    expect(wantedLevel(g)).toBe(AFTER_CLEANER);
    addHeat(g, 5);
    expect(shouldSpawnCleaner(g)).toBe(false);
    g.startFloor(2);
    addHeat(g, 5);
    expect(shouldSpawnCleaner(g)).toBe(true);
  });

  it('выстрелы игрока шумят, а время идёт в update', () => {
    const g = game();
    // стоит на месте без врагов: только время
    const h0 = g.wanted.heat;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    const quiet = g.wanted.heat - h0;
    expect(quiet).toBeCloseTo(HEAT_TIME, 3);
    const h1 = g.wanted.heat;
    for (let i = 0; i < 60; i++) {
      g.fireWeapon(0, 0);
      g.update(1 / 60);
    }
    expect(g.wanted.heat - h1).toBeGreaterThan(quiet * 1.4);
  });
});
