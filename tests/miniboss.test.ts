import { beforeAll, describe, expect, it } from 'vitest';
import { registerContent } from '../src/content';
import { BOSSES } from '../src/content/bosses';
import { ENEMIES } from '../src/content/enemies';
import { FLOOR_THEMES } from '../src/content/floors';
import { MINIBOSSES, MINIBOSS_BY_FLOOR, MINIBOSS_HP, bossDef } from '../src/content/minibosses';
import { every } from '../src/game/ai';
import { sendMiniboss } from '../src/game/director';
import { Enemy } from '../src/game/enemy';
import { Game } from '../src/game/game';
import { n } from '../src/game/patterns';
import { populateRoom } from '../src/game/spawn';
import { MINIBOSS_DENSITY, MINIBOSS_PAUSE, bossLike } from '../src/game/status';
import { setAim } from '../src/game/team';

// Этап 14а.4: старые боссы → мини-боссы.

beforeAll(() => {
  registerContent();
  for (const d of [...ENEMIES, ...BOSSES, ...MINIBOSSES]) d.frames = d.framesAlt = () => [];
});

function game(seed = 'mb-test'): Game {
  const g = new Game(seed, 'normal');
  g.player.invuln = 9999;
  g.surv.cameras = [];
  return g;
}

describe('мини-боссы', () => {
  it('7 мини-боссов: HP ×0,5, две фазы, новые имена', () => {
    expect(MINIBOSSES).toHaveLength(7);
    const bases = ['sentinel', 'arachna', 'gunship', 'twins', 'goliath', 'hive', 'executioner'];
    MINIBOSSES.forEach((m, i) => {
      const base = BOSSES.find((b) => b.id === bases[i])!;
      expect(m.hp).toBe(Math.round(base.hp * MINIBOSS_HP));
      expect(m.phases).toHaveLength(2);
      expect(m.phases![1].until).toBe(0);
      expect(m.miniboss).toBe(true);
      expect(m.boss).toBe(true);
      expect(BOSSES.some((b) => b.name.ru === m.name.ru)).toBe(false);
    });
    expect(bossDef('mbSentinel').phases!.map((p) => p.name.ru)).toEqual(['Вращающийся периметр', 'Огневой вал']);
    expect(bossDef('mbArachna').phases!.map((p) => p.name.ru)).toEqual(['Минное поле', 'Таранный рывок']);
  });

  it('концы уровней: 1/3/5/7 — мини-боссы, 2/4/6/8 — боссы ярусов', () => {
    expect(FLOOR_THEMES.map((t) => t.boss)).toEqual(['mbArachna', 'sentinel', 'mbHive', 'goliath', 'mbTwins', 'executioner', 'mbGunship', 'gunship', 'dispatcher']);
    for (const t of FLOOR_THEMES) expect(bossDef(t.boss).id).toBe(t.boss);
    for (const t of FLOOR_THEMES) expect(!!bossDef(t.boss).miniboss).toBe(!t.tierBoss);
  });

  it('пули ×0,8 и перерывы ×1,25 у мини-босса', () => {
    const g = game();
    const m = new Enemy(bossDef('mbSentinel'), g.player.x, g.player.y - 60, 1);
    const b = new Enemy(bossDef('sentinel'), g.player.x, g.player.y - 60, 1);
    expect(m.miniboss && bossLike(m)).toBe(true);
    setAim(g, b);
    const nb = n(g, 20);
    setAim(g, m);
    const nm = n(g, 20);
    setAim(g, null);
    expect(nm).toBe(Math.round(20 * g.diff.density * MINIBOSS_DENSITY));
    expect(nb).toBe(Math.round(20 * g.diff.density));
    every(m, g, 'k', 1, 0, 0);
    every(m, g, 'k', 1, 0.001);
    expect(m.mem.k).toBeCloseTo(-0.001 + 1 * g.diff.cooldown * MINIBOSS_PAUSE, 5);
  });

  it('комната мини-босса на 1-м уровне — Страж; победа даёт выбор 1 из 2', () => {
    let g: Game | null = null;
    for (let s = 0; s < 40 && !g; s++) {
      const t = game('mb-room-' + s);
      if (t.plan.rooms.some((r) => r.role === 'miniboss')) g = t;
    }
    expect(g).not.toBeNull();
    const r = g!.plan.rooms.find((x) => x.role === 'miniboss')!;
    g!.enemies = [];
    populateRoom(g!, r);
    expect(g!.enemies.map((e) => e.def.id)).toEqual(MINIBOSS_BY_FLOOR[1]);
    const m = g!.enemies[0];
    expect(m.home).toBe(r.id);
    m.spawn = 0;
    g!.killEnemy(m, true);
    const items = g!.pickups.filter((k) => k.kind === 'item');
    expect(items).toHaveLength(2);
    expect(items[0].group).toBe(items[1].group);
  });

  it('в волне розыска 4 — в зачищенную большую комнату игрока; арена — его комната', () => {
    const g = game('mb-wave');
    g.startFloor(4);
    const r = g.plan.rooms.find((x) => x.role === 'combat' && x.w >= 22 && x.h >= 14);
    expect(r).toBeTruthy();
    r!.visited = r!.cleared = true;
    g.enterRoom(r!);
    g.enemies = [];
    const out = sendMiniboss(g);
    expect(out.length).toBeGreaterThan(0);
    expect(MINIBOSS_BY_FLOOR[4]).toContain(out[0].def.id);
    expect(g.director.minibossSent).toBe(true);
    // игрок ушёл в коридор — арена мини-босса всё равно его комната
    g.zone = null;
    setAim(g, out[0]);
    expect(g.arena.x).toBe(r!.x * 16);
    setAim(g, null);
  });
});

describe('узоры боссов стреляют (ключи таймеров не совпадают с полями состояния)', () => {
  it('каждая фаза каждого босса и мини-босса выпускает пули за 6 с', () => {
    const quiet: string[] = [];
    for (const b of [...BOSSES, ...MINIBOSSES]) {
      b.phases!.forEach((ph) => {
        const g = game('phases');
        const r = g.plan.rooms[g.plan.exitId];
        g.enterRoom(r);
        g.enemies = [];
        const e = new Enemy(b, g.player.x, g.player.y - 80, 1);
        e.spawn = 0;
        e.home = r.id;
        if (b.id === 'twins' || b.id === 'mbTwins') e.mem.twin = 1;
        let shots = 0;
        for (let i = 0; i < 60 * 6; i++) {
          setAim(g, e);
          const before = g.ebullets.length;
          ph.update(e, g, 1 / 60);
          for (const x of g.ebullets.slice(before)) if (Number.isFinite(x.angle)) shots++;
          setAim(g, null);
          g.ebullets.length = 0;
        }
        // меньше 10 пуль за 6 с — фаза «молчит» (у «Минного поля» главное — мины, пуль мало)
        if (shots < 10) quiet.push(`${b.id}: ${ph.name.ru} (${shots})`);
      });
    }
    expect(quiet).toEqual([]);
  });
});
