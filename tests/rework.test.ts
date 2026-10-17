import { beforeAll, describe, expect, it } from 'vitest';
import { registerContent } from '../src/content';
import { ENEMIES, ENEMY_BY_ID } from '../src/content/enemies';
import { BOSSES } from '../src/content/bosses';
import { MINIBOSSES } from '../src/content/minibosses';
import { damageEnemy } from '../src/game/combat';
import { Enemy } from '../src/game/enemy';
import { Game } from '../src/game/game';

// Этап 15: переделанные повторы (решение Эрика — «по советам из отчёта»).

beforeAll(() => {
  registerContent();
  for (const d of [...ENEMIES, ...BOSSES, ...MINIBOSSES]) d.frames = () => [];
});

function game(...ids: string[]): Game {
  const g = new Game('rework-test', 'normal');
  g.player.invuln = 9999;
  g.surv.cameras = [];
  g.enemies = [];
  for (const id of ids) g.player.passives.set(id, 1);
  g.player.recalc();
  return g;
}

function foe(g: Game, dx: number, dy = 0): Enemy {
  const e = new Enemy(ENEMY_BY_ID.get('heavy')!, g.player.x + dx, g.player.y + dy, 30);
  e.spawn = 0;
  e.home = -2;
  g.enemies.push(e);
  return e;
}

describe('переделки повторов (этап 15)', () => {
  it('«Зеркальная призма»: каждый 4-й залп — ещё 2 снаряда веером, без выстрелов в стороны', () => {
    const g = game('pMirrorPrism');
    expect(g.player.stats.sideShots).toBeFalsy();
    const counts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const n = g.pbullets.length;
      g.fireWeapon(0, 0);
      counts.push(g.pbullets.length - n);
    }
    expect(counts[3]).toBe(counts[0] + 2);
  });

  it('«Индукционная катушка»: снаряд бьёт током врага рядом с траекторией, не по дуге', () => {
    const g = game('pHelixCoil');
    expect(g.player.stats.spiral).toBe(0);
    const e = foe(g, 60, 14);
    const hp = e.hp;
    g.fireWeapon(0, 0);
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    expect(e.hp).toBeLessThan(hp);
  });

  it('«Фазовый сдвиг»: снаряд один раз скачет вперёд на 36, стены уже не пропускает', () => {
    const g = game('pPhaseShift');
    expect(g.player.stats.spectral).toBeFalsy();
    g.fireWeapon(0, 0);
    const b = g.pbullets.at(-1)!;
    const x0 = b.bx;
    const v = b.speed;
    for (let i = 0; i < 9; i++) g.update(1 / 60);
    expect(b.bx - x0).toBeGreaterThan(36 + v * 0.1);
  });

  it('«Отрывной шаг»: после рывка 1 с скорость выше', () => {
    const g = game('servoLegs');
    const sp = g.player.stats.speed;
    g.player.emit('onDashEnd', g);
    expect(g.player.stats.speed).toBeCloseTo(sp * 1.3);
  });

  it('«Возвратная рама»: диск на возврате режет сильнее', () => {
    const g = game('pBoomerangFrame');
    const e = foe(g, 40);
    g.fireWeapon(0, 0);
    const b = g.pbullets.at(-1)!;
    const hp = e.hp;
    damageEnemy(g, e, 10, g.player.x, g.player.y, { bullet: b, source: 'bullet' });
    const out = hp - e.hp;
    b.returning = true;
    const hp2 = e.hp;
    damageEnemy(g, e, 10, g.player.x, g.player.y, { bullet: b, source: 'bullet' });
    expect(hp2 - e.hp).toBeGreaterThan(out * 1.5);
  });
});
