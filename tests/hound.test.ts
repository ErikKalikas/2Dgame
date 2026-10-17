import { beforeAll, describe, expect, it } from 'vitest';
import { registerContent } from '../src/content';
import { BOSSES } from '../src/content/bosses';
import { ENEMIES, ENEMY_BY_ID, HOUND_TELL } from '../src/content/enemies';
import { MINIBOSSES } from '../src/content/minibosses';
import { damageEnemy } from '../src/game/combat';
import { sendWave } from '../src/game/director';
import { Enemy } from '../src/game/enemy';
import { Game } from '../src/game/game';
import { setAim } from '../src/game/team';
import { addHeat } from '../src/game/wanted';

// 14а: дрон-гончая — свой вид врага волн розыска 4–5 и её набор (утверждено Эриком 18.10.26).

beforeAll(() => {
  registerContent();
  for (const d of [...ENEMIES, ...BOSSES, ...MINIBOSSES]) d.frames = d.framesAlt = () => [];
});

function game(...ids: string[]): Game {
  const g = new Game('hound-test', 'normal');
  g.player.invuln = 9999;
  g.surv.cameras = [];
  g.enemies = [];
  for (const id of ids) g.player.passives.set(id, 1);
  g.player.recalc();
  return g;
}

function hound(g: Game, dx: number, dy = 0): Enemy {
  const e = new Enemy(ENEMY_BY_ID.get('hunter')!, g.player.x + dx, g.player.y + dy, 1);
  e.spawn = 0;
  e.home = -2;
  g.enemies.push(e);
  return e;
}

/** Обновить ИИ одного врага dt секунд (без всей игры) */
function think(g: Game, e: Enemy, sec: number) {
  for (let t = 0; t < sec; t += 1 / 60) {
    setAim(g, e);
    e.def.update(e, g, 1 / 60);
    setAim(g, null);
  }
}

describe('дрон-гончая', () => {
  it('робот II класса с набором из 4 прошивок; в комнатах не встречается, приходит в волнах', () => {
    const d = ENEMY_BY_ID.get('hunter')!;
    expect([d.kind, d.value, d.drops!.length, d.flying]).toEqual(['robot', 2, 4, true]);
    expect(d.minFloor).toBeGreaterThan(9);
    const g = game();
    const r = g.plan.rooms.find((x) => x.role === 'combat')!;
    r.visited = r.cleared = true;
    g.enterRoom(r);
    g.enemies = [];
    addHeat(g, 4);
    g.director.minibossSent = true;
    const w = sendWave(g, 'hunters');
    expect(w.filter((e) => e.def.id === 'hunter').length).toBeGreaterThanOrEqual(2);
  });

  it('«Пеленг»: телеграф, затем очередь из 3 пуль', () => {
    const g = game();
    const e = hound(g, 90);
    e.mem.diveT = 99; // без пике
    e.mem.fire = 0.01;
    think(g, e, 0.05);
    expect(e.mem.tell).toBeGreaterThan(0);
    expect(g.ebullets.length).toBe(0);
    think(g, e, HOUND_TELL + 0.05);
    expect(g.ebullets.length).toBe(3);
  });

  it('попадание во время телеграфа срывает залп: гончая теряет цель на 1 с', () => {
    const g = game();
    const e = hound(g, 90);
    e.mem.diveT = 99;
    e.mem.fire = 0.01;
    think(g, e, 0.05);
    damageEnemy(g, e, 1, g.player.x, g.player.y);
    expect(e.mem.tell).toBeUndefined();
    expect(e.mem.lost).toBeGreaterThan(0.9);
    think(g, e, 0.6);
    expect(g.ebullets.length).toBe(0);
  });

  it('«Пике»: бросок к цели, в конце — кольцо из 8', () => {
    const g = game();
    const e = hound(g, 100);
    e.mem.fire = 99;
    e.mem.diveT = 0.01;
    const d0 = Math.hypot(e.x - g.player.x, e.y - g.player.y);
    think(g, e, 1);
    expect(Math.hypot(e.x - g.player.x, e.y - g.player.y)).toBeLessThan(d0 - 30);
    expect(g.ebullets.length).toBeGreaterThanOrEqual(8);
  });
});

describe('набор гончей', () => {
  it('«Тихий сигнал»: розыск растёт на 20% медленнее; «Охота»: 2 с после убийства не растёт', () => {
    const g = game('pHuntQuiet');
    addHeat(g, 1);
    expect(g.wanted.heat).toBeCloseTo(0.8);
    const g2 = game('pHuntLead', 'pHuntChase', 'pHuntQuiet');
    expect(g2.player.synergies.some((s) => s.id === 'setHunter1')).toBe(true);
    const e = hound(g2, 40);
    e.hp = 0;
    g2.killEnemy(e, true);
    const h = g2.wanted.heat;
    addHeat(g2, 1);
    expect(g2.wanted.heat).toBe(h);
  });

  it('«Гон»: после убийства скорость +20% и следующий залп ×1,5', () => {
    const g = game('pHuntChase');
    const sp = g.player.stats.speed;
    g.fireWeapon(0, 0);
    const base = g.pbullets.at(-1)!.dmg;
    const e = hound(g, 40);
    e.hp = 0;
    g.killEnemy(e, true);
    expect(g.player.stats.speed).toBeCloseTo(sp * 1.2);
    g.fireWeapon(0, 0);
    expect(g.pbullets.at(-1)!.dmg).toBeCloseTo(base * 1.5);
    g.fireWeapon(0, 0);
    expect(g.pbullets.at(-1)!.dmg).toBeCloseTo(base);
  });

  it('«Стая»: в бою прилетает гончая-союзник на 6 с', () => {
    const g = game('pHuntPack');
    const foe = new Enemy(ENEMY_BY_ID.get('heavy')!, g.player.x + 60, g.player.y, 50);
    foe.spawn = 0;
    foe.home = -2;
    foe.def = { ...foe.def, update() {} };
    g.enemies.push(foe);
    for (let i = 0; i < 60 * 4.5; i++) g.update(1 / 60);
    const ally = g.enemies.find((e) => e.def.id === 'hunter' && e.team === 'ally');
    expect(ally).toBeTruthy();
    expect(ally!.summon).toBe(true);
  });

  it('«Упреждение»: выстрел доворачивает в точку упреждения движущегося врага', () => {
    const g = game('pHuntLead');
    const e = hound(g, 100);
    e.def = { ...e.def, update() {} };
    // враг летит вниз: несколько кадров движения для оценки скорости
    for (let i = 0; i < 20; i++) {
      e.y += 1;
      g.player.emit('tick', g, 1 / 60);
    }
    let a = 0;
    for (const h of g.player.hooks) if (h.adjustAim) a = h.adjustAim(g, 0);
    const direct = Math.atan2(e.y - (g.player.y - 3), e.x - g.player.x);
    expect(a).toBeGreaterThan(direct + 0.05);
  });
});
