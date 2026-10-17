import { beforeAll, describe, expect, it } from 'vitest';
import { registerContent } from '../src/content';
import { ENEMIES } from '../src/content/enemies';
import { HUNTER_HP, WAVE_CALM, sendWave, updateDirector, waveKind } from '../src/game/director';
import { Game } from '../src/game/game';
import { addHeat } from '../src/game/wanted';

// Этап 14а.3: Диспетчер-режиссёр — волны подкреплений по розыску.

beforeAll(() => {
  registerContent();
  // в Node нет холста: кадры врагов пустые
  for (const d of ENEMIES) d.frames = () => [];
});

function game(seed = 'director-test'): Game {
  const g = new Game(seed, 'normal');
  g.player.invuln = 9999;
  g.surv.cameras = [];
  return g;
}

/** Поставить игрока в обычную боевую комнату (без врагов) */
function inCombatRoom(g: Game) {
  const r = g.plan.rooms.find((x) => x.role === 'combat')!;
  r.visited = true;
  r.cleared = true;
  g.enterRoom(r);
  g.enemies = [];
  return r;
}

describe('волны Диспетчера', () => {
  it('ступени: 0–1 патруль, 2 отряд, 3 тяжёлые, 4–5 охотники', () => {
    expect([0, 1, 2, 3, 4, 5].map(waveKind)).toEqual(['patrol', 'patrol', 'squad', 'heavy', 'hunters', 'hunters']);
  });

  it('волна приходит после передышки и не в первые 30 с уровня', () => {
    const g = game();
    inCombatRoom(g);
    g.director.waveT = 0.01;
    g.director.calm = WAVE_CALM + 1;
    g.levelTimes[0] = 10;
    updateDirector(g, 0.1);
    expect(g.enemies.some((e) => e.wave)).toBe(false);
    g.levelTimes[0] = 40;
    updateDirector(g, 0.1);
    expect(g.enemies.some((e) => e.wave)).toBe(true);
    expect(g.logLines.some((l) => l.text.ru.startsWith('Диспетчер: патруль'))).toBe(true);
    // без передышки — ждёт
    const n = g.enemies.length;
    g.director.waveT = 0.01;
    g.director.calm = 5;
    updateDirector(g, 0.1);
    expect(g.enemies.length).toBe(n);
  });

  it('в укрытии (операционная) волн нет', () => {
    const g = game();
    g.enterRoom(g.plan.rooms.find((x) => x.role === 'surgery')!);
    g.director.waveT = 0.01;
    g.director.calm = WAVE_CALM + 1;
    g.levelTimes[0] = 40;
    updateDirector(g, 0.1);
    expect(g.enemies.some((e) => e.wave)).toBe(false);
  });

  it('охотники: дроны прочнее; тяжёлая волна сбрасывает турель в комнату игрока', () => {
    const g = game();
    const r = inCombatRoom(g);
    addHeat(g, 4);
    const w = sendWave(g, 'hunters');
    const hunters = w.filter((e) => e.hunter);
    expect(hunters.length).toBeGreaterThanOrEqual(2);
    expect(hunters[0].maxHp).toBe(Math.round(hunters[0].def.hp * g.hpMult * HUNTER_HP));
    const h = sendWave(g, 'heavy');
    expect(h.some((e) => e.def.id === 'turret' && e.home === r.id)).toBe(true);
  });

  it('враги волны идут к игроку через коридоры', () => {
    let moved = 0, total = 0;
    for (let s = 0; s < 4; s++) {
      const g = game('wave-walk-' + s);
      inCombatRoom(g);
      const w = sendWave(g, 'squad');
      if (!w.length) continue;
      const d0 = w.map((e) => Math.hypot(e.x - g.player.x, e.y - g.player.y));
      for (let i = 0; i < 60 * 6; i++) g.update(1 / 60);
      w.forEach((e, i) => {
        total++;
        if (e.dead || Math.hypot(e.x - g.player.x, e.y - g.player.y) < d0[i] - 40) moved++;
      });
    }
    expect(total).toBeGreaterThan(0);
    expect(moved / total).toBeGreaterThan(0.6);
  });
});
