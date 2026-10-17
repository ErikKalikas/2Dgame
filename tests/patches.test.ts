import { beforeAll, describe, expect, it } from 'vitest';
import { registerContent } from '../src/content';
import { BOSSES } from '../src/content/bosses';
import { ENEMIES, ENEMY_BY_ID } from '../src/content/enemies';
import { MINIBOSSES, bossDef } from '../src/content/minibosses';
import { damageEnemy } from '../src/game/combat';
import { Enemy } from '../src/game/enemy';
import { Game } from '../src/game/game';
import {
  PATCH_GLITCH_R, PATCH_K, PATCH_SHOT_K, choosePatch, damageStyle, hackMult, noteDash, patchAim, patchGlitchR,
  patchList, releasePatch,
} from '../src/game/patches';
import { setAim } from '../src/game/team';

// Этап 14а.5: патчи Диспетчера.

beforeAll(() => {
  registerContent();
  for (const d of [...ENEMIES, ...BOSSES, ...MINIBOSSES]) d.frames = () => [];
});

function game(): Game {
  const g = new Game('patch-test', 'normal');
  g.player.invuln = 9999;
  g.surv.cameras = [];
  return g;
}

function foe(g: Game, id: string): Enemy {
  const def = ENEMY_BY_ID.get(id) ?? bossDef(id);
  const e = new Enemy(def, g.player.x + 40, g.player.y, 50);
  e.spawn = 0;
  e.mem.face = Math.PI; // лицом к игроку: без фланга
  e.home = g.zone?.id ?? -2;
  g.enemies.push(e);
  return e;
}

const hit = (g: Game, e: Enemy, o: Parameters<typeof damageEnemy>[5]) => {
  const h = e.hp;
  damageEnemy(g, e, 10, g.player.x, g.player.y, { silent: true, ...o });
  return h - e.hp;
};

describe('патчи Диспетчера', () => {
  it('стиль удара', () => {
    const g = game();
    expect(damageStyle(g, { source: 'explosion' })).toBe('explosion');
    expect(damageStyle(g, { source: 'melee' })).toBe('melee');
    expect(damageStyle(g, { source: 'bullet', tag: 'ember' })).toBe('fire');
    expect(damageStyle(g, { source: 'ally', by: 'ally' })).toBe('ally');
    expect(damageStyle(g, { source: 'other', tag: 'spinner' })).toBe('ally');
    expect(damageStyle(g, { source: 'bullet' })).toBe('shot');
  });

  it('выбор: самый частый стиль; ничего не выделяется — «Баллистические пластины»; без повторов', () => {
    const g = game();
    expect(choosePatch(g)).toBe('shot');
    const e = foe(g, 'heavy');
    for (let i = 0; i < 10; i++) hit(g, e, { source: 'explosion' });
    for (let i = 0; i < 10; i++) hit(g, e, { source: 'bullet' });
    expect(choosePatch(g)).toBe('explosion');
    const def = releasePatch(g)!;
    expect(def.style).toBe('explosion');
    expect(g.logLines.at(-1)!.text.ru).toBe('Обновление 2.2: «Разнесение строя» для охраны — взрывы −35%.');
    // статистика яруса заново, повторов нет
    for (let i = 0; i < 10; i++) hit(g, e, { source: 'explosion' });
    expect(choosePatch(g)).toBe('shot');
    g.patches.time = 60;
    for (let i = 0; i < 20; i++) noteDash(g);
    expect(choosePatch(g)).toBe('dash');
    expect(patchList(g)).toEqual(['2.2 «Разнесение строя» — урон взрывами −35%']);
  });

  it('патч ослабляет урон своего стиля по обычным врагам и мини-боссам, но не по боссу яруса', () => {
    const g = game();
    g.patches.active.push('fire', 'shot');
    const e = foe(g, 'heavy');
    expect(hit(g, e, { source: 'explosion' })).toBeCloseTo(10);
    expect(hit(g, e, { source: 'bullet', tag: 'ember' })).toBeCloseTo(10 * PATCH_K);
    expect(hit(g, e, { source: 'bullet' })).toBeCloseTo(10 * PATCH_SHOT_K);
    const m = foe(g, 'mbSentinel');
    expect(hit(g, m, { source: 'bullet' })).toBeCloseTo(10 * PATCH_SHOT_K);
    const b = foe(g, 'sentinel');
    expect(hit(g, b, { source: 'bullet' })).toBeCloseTo(10);
    // горение: урон меньше
    e.burnT = 2;
    e.burnDps = 6;
    const h = e.hp;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    expect(h - e.hp).toBeLessThan(6 * 0.5 * 0.7);
  });

  it('«Экранирование»: сбой стирает пули охраны в меньшем радиусе, взлом медленнее', () => {
    const g = game();
    const e = foe(g, 'punk');
    expect(patchGlitchR(g, e)).toBe(1);
    expect(hackMult(g)).toBe(1);
    g.patches.active.push('glitch');
    expect(patchGlitchR(g, e)).toBe(PATCH_GLITCH_R);
    expect(patchGlitchR(g, foe(g, 'goliath'))).toBe(1);
    expect(hackMult(g)).toBeLessThan(1);
  });

  it('«Ловушки на траекториях»: после рывка прицел охраны точнее', () => {
    const g = game();
    const e = foe(g, 'punk');
    g.patches.active.push('dash');
    setAim(g, e);
    expect(patchAim(g)).toBeNull();
    noteDash(g);
    expect(patchAim(g)!.err).toBe(PATCH_K);
    g.time += 2;
    expect(patchAim(g)).toBeNull();
    setAim(g, null);
  });

  it('после босса яруса (уровень 2) выходит патч, после мини-босса (уровень 1) — нет', () => {
    const g = game();
    const kill = () => {
      const exit = g.plan.rooms[g.plan.exitId];
      g.enterRoom(exit);
      for (const e of g.enemies) {
        e.spawn = 0;
        g.killEnemy(e, true);
      }
      g.update(1 / 60);
    };
    kill();
    expect(g.patches.active).toHaveLength(0);
    g.startFloor(2);
    kill();
    expect(g.patches.active).toHaveLength(1);
  });
});
