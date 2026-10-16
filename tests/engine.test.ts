import { beforeAll, describe, expect, it } from 'vitest';
import { registerContent } from '../src/content';
import { ENEMY_BY_ID } from '../src/content/enemies';
import { TILE } from '../src/config';
import { makeEBullet } from '../src/game/bullets';
import { damageEnemy, spawnShot } from '../src/game/combat';
import { Enemy, type EnemyDef } from '../src/game/enemy';
import { Game } from '../src/game/game';
import type { Hooks } from '../src/game/items';
import { spawnBot, spawnDecoy, spawnInterceptor, spawnScrap, spawnSpider, spawnSpinner, collectScraps, tether, isTethered } from '../src/game/minions';
import { addObj, objsOf, updateObjs } from '../src/game/objects';
import { angleToPlayer } from '../src/game/ai';
import { shoot } from '../src/game/patterns';
import {
  addStack, crippleDrive, isFlank, isNormal, stackCount, takeStacks, tickStacks, tossEnemy, transferStacks,
} from '../src/game/status';
import { setAim, snapEnemy, summonAlly } from '../src/game/team';
import { addZone } from '../src/game/zones';
import { T } from '../src/world/tiles';

// Этап 12б.1: доработки движка для предметов наборов. Игра создаётся без отрисовки (кадры врагов пустые).

beforeAll(() => registerContent());

/** Вид врага без спрайтов (в Node нет холста) */
const def = (id: string, over: Partial<EnemyDef> = {}): EnemyDef => ({ ...ENEMY_BY_ID.get(id)!, frames: () => [], ...over });

function game(): Game {
  const g = new Game('engine-test', 'normal');
  g.player.invuln = 0;
  return g;
}

/** Враг рядом с игроком (dx, dy от него), сразу активный */
function foe(g: Game, id: string, dx: number, dy = 0, over: Partial<EnemyDef> = {}): Enemy {
  const e = new Enemy(def(id, over), g.player.x + dx, g.player.y + dy, 1);
  e.spawn = 0;
  e.home = g.zone?.id ?? -2;
  g.enemies.push(e);
  return e;
}

const step = (g: Game, sec: number) => {
  for (let t = 0; t < sec; t += 1 / 60) g.update(1 / 60);
};

describe('стаки на враге', () => {
  it('копятся до предела, таймер обновляется, снимаются и истекают', () => {
    const g = game();
    const e = foe(g, 'guard', 40);
    expect(addStack(e, 'notch', 3, 5, 4)).toBe(3);
    expect(addStack(e, 'notch', 4, 5, 4)).toBe(5);
    expect(takeStacks(e, 'notch', 2)).toBe(2);
    expect(stackCount(e, 'notch')).toBe(3);
    tickStacks(e, 3.9);
    expect(stackCount(e, 'notch')).toBe(3);
    tickStacks(e, 0.2);
    expect(stackCount(e, 'notch')).toBe(0);
  });

  it('переносятся на ближайшего врага в радиусе (доля и предел)', () => {
    const g = game();
    const a = foe(g, 'guard', 40);
    const near = foe(g, 'guard', 80);
    foe(g, 'guard', 200);
    addStack(a, 'flea', 3, 3, 10);
    expect(transferStacks(g, a, 'flea', 60, 3, 10)).toBe(near);
    expect(stackCount(near, 'flea')).toBe(3);
    addStack(a, 'drive', 3, 3, 10);
    transferStacks(g, a, 'drive', 60, 3, 10, 0.5);
    expect(stackCount(near, 'drive')).toBe(1);
    expect(transferStacks(g, a, 'flea', 10, 3, 10)).toBeNull();
  });
});

describe('взгляд врага, фланг и лобовой щит', () => {
  it('враг поворачивается к цели с конечной скоростью', () => {
    const g = game();
    const e = foe(g, 'guard', 60);
    step(g, 0.1);
    expect(Math.abs(Math.abs(e.face) - Math.PI)).toBeLessThan(0.05);
    // игрок «перескочил» за спину — взгляд догоняет не мгновенно
    g.player.x += 120;
    g.update(1 / 60);
    expect(Math.abs(e.face)).toBeGreaterThan(2);
  });

  it('попадание сбоку или со спины — фланг; открытый враг — всегда фланг', () => {
    const g = game();
    const e = foe(g, 'guard', 0);
    e.mem.face = 0;
    expect(isFlank(e, e.x + 20, e.y)).toBe(false);
    expect(isFlank(e, e.x, e.y + 20)).toBe(true);
    expect(isFlank(e, e.x - 20, e.y)).toBe(true);
    e.exposedT = 1;
    expect(isFlank(e, e.x + 20, e.y)).toBe(true);
  });

  it('щит Вахтёра гасит 65% спереди; «Щель» — ×flankMult сбоку и половина щита', () => {
    const g = game();
    const e = foe(g, 'guard', 0);
    e.mem.face = 0;
    const hp = e.hp;
    damageEnemy(g, e, 10, e.x + 20, e.y, { silent: true });
    expect(hp - e.hp).toBeCloseTo(3.5);
    g.player.stats.flankMult = 1.5;
    g.player.stats.shieldPierce = 0.5;
    const h2 = e.hp;
    damageEnemy(g, e, 10, e.x - 20, e.y, { silent: true });
    expect(h2 - e.hp).toBeCloseTo(15);
    const h3 = e.hp;
    damageEnemy(g, e, 10, e.x + 20, e.y, { silent: true });
    expect(h3 - e.hp).toBeCloseTo(10 * (1 - 0.65 * 0.5));
    e.shieldOff = 2;
    const h4 = e.hp;
    damageEnemy(g, e, 4, e.x + 20, e.y, { silent: true });
    expect(h4 - e.hp).toBeCloseTo(4);
  });
});

describe('подброс и привод', () => {
  it('подброшенный враг не действует, урон копится и приходит при падении', () => {
    const g = game();
    const e = foe(g, 'punk', 60);
    let landed = -1;
    tossEnemy(g, e, 0.7, (_e, acc) => {
      landed = acc;
    });
    expect(e.active).toBe(false);
    const hp = e.hp;
    damageEnemy(g, e, 3, g.player.x, g.player.y, { silent: true });
    expect(e.hp).toBe(hp);
    step(g, 0.8);
    expect(e.toss).toBeNull();
    expect(landed).toBeCloseTo(3);
  });

  it('повреждённый привод: скорость ниже, предел держится', () => {
    const g = game();
    const e = foe(g, 'punk', 60);
    for (let i = 0; i < 5; i++) crippleDrive(e, 0.15, 3, 0.45);
    expect(e.driveK).toBeCloseTo(0.45);
    expect(e.speedMult).toBeCloseTo(0.55);
  });

  it('обычный враг — не босс, не тяжёлый, не элита, класс I–II', () => {
    const g = game();
    expect(isNormal(foe(g, 'punk', 60))).toBe(true);
    expect(isNormal(foe(g, 'heavy', 60))).toBe(false);
    expect(isNormal(foe(g, 'mantis', 60))).toBe(false);
    const el = foe(g, 'guard', 60);
    el.elite = true;
    expect(isNormal(el)).toBe(false);
  });
});

describe('свой-чужой', () => {
  it('игрок не ранит союзника; союзник не держит комнату и не даёт награды', () => {
    const g = game();
    const a = summonAlly(g, def('punk'), g.player.x + 30, g.player.y, 0.3, 6);
    a.spawn = 0;
    const hp = a.hp;
    damageEnemy(g, a, 50, g.player.x, g.player.y);
    expect(a.hp).toBe(hp);
    expect(a.hp).toBe(Math.round(a.maxHp * 0.3));
    expect(g.nearestEnemy(g.player.x, g.player.y, 200)).toBeNull();
  });

  it('союзник целится в ближайшего врага, враг — в союзника рядом или в приманку, босс — в игрока', () => {
    const g = game();
    const f = foe(g, 'punk', 100);
    const a = summonAlly(g, def('punk'), g.player.x + 70, g.player.y, 1, 6);
    a.spawn = 0;
    setAim(g, a);
    expect([g.aimX, g.aimY]).toEqual([f.x, f.y]);
    setAim(g, f);
    expect([g.aimX, g.aimY]).toEqual([a.x, a.y]);
    const d = spawnDecoy(g, g.player.x + 100, g.player.y + 40, { life: 1.2 });
    setAim(g, f);
    expect([g.aimX, g.aimY]).toEqual([d.x, d.y]);
    const boss = foe(g, 'punk', 50, 0, { boss: true });
    setAim(g, boss);
    expect([g.aimX, g.aimY]).toEqual([g.player.x, g.player.y]);
    setAim(g, null);
  });

  it('сорванный враг стреляет пулями союзника по врагам и потом возвращается', () => {
    const g = game();
    const victim = foe(g, 'scav', 60, 0, { update() {} });
    // стреляет один раз в свою цель
    const s = foe(g, 'punk', 95, 0, {
      update(e, g) {
        if (e.mem.shot) return;
        e.mem.shot = 1;
        shoot(g, e.x, e.y, angleToPlayer(e, g), 200);
      },
    });
    expect(snapEnemy(g, s, 1)).toBe(true);
    const hp = victim.hp;
    step(g, 0.9);
    expect(g.ebullets.some((b) => b.owner === s)).toBe(false);
    expect(victim.hp).toBeLessThan(hp);
    step(g, 0.3);
    expect(s.team).toBe('foe');
  });

  it('боссов сорвать нельзя; вражеская пуля ранит союзника', () => {
    const g = game();
    expect(snapEnemy(g, foe(g, 'punk', 60, 0, { boss: true }), 3)).toBe(false);
    const a = summonAlly(g, def('punk', { update() {} }), g.player.x + 80, g.player.y, 1, 6);
    a.spawn = 0;
    const hp = a.hp;
    g.ebullets.push(makeEBullet(a.x, a.y, 0, 0));
    g.update(1 / 60);
    expect(a.hp).toBeLessThan(hp);
  });
});

describe('попадание по игроку: порядок защиты', () => {
  const add = (g: Game, h: Hooks) => g.player.hooks.push(h);

  it('перехват раньше щита, долг после щита и до аварийного окна', () => {
    const g = game();
    const p = g.player;
    const log: string[] = [];
    p.shieldLeft = 1;
    p.glitch = 1;
    add(g, { onIncoming: () => (log.push('in'), true), onDefend: (_g, how) => void log.push(how) });
    g.hurtPlayer({ kind: 'floor' });
    expect(log).toEqual(['in', 'intercept']);
    expect(p.shieldLeft).toBe(1);

    p.hooks = [];
    log.length = 0;
    add(g, { onLifeHit: () => (log.push('debt'), true), onDefend: (_g, how) => void log.push(how) });
    g.hurtPlayer({ kind: 'floor' });
    expect(log).toEqual(['shield']);
    p.invuln = 0;
    const lives = p.lives;
    g.hurtPlayer({ kind: 'floor' });
    expect(log).toEqual(['shield', 'debt']);
    expect(p.pendingHit).toBe(0);
    expect(p.lives).toBe(lives);
  });
});

describe('игрок: рывки, баффы, взлом', () => {
  it('серия из двух рывков: перезарядка после второго', () => {
    const g = game();
    const p = g.player;
    p.stats.dashCharges = 2;
    p.dashLeft = 2;
    p.startDash(g, 1, 0, 1);
    expect(p.dashCd).toBe(0);
    p.dashT = 0;
    p.startDash(g, 1, 0, 1);
    expect(p.dashCd).toBe(p.stats.dashCd);
  });

  it('бафф меняет характеристики и снимается по таймеру или условию', () => {
    const g = game();
    const p = g.player;
    const base = p.stats.speed;
    p.addBuff('rush', 0.5, (s) => (s.speed *= 1.35));
    expect(p.stats.speed).toBeCloseTo(base * 1.35);
    step(g, 0.6);
    expect(p.stats.speed).toBeCloseTo(base);
    p.setBuff('focus', true, (s) => (s.hitR *= 0.7));
    expect(p.hasBuff('focus')).toBe(true);
    p.setBuff('focus', false, (s) => (s.hitR *= 0.7));
    expect(p.stats.hitR).toBeCloseTo(2);
  });

  it('скорость взлома в характеристиках (по умолчанию 1)', () => {
    expect(game().player.stats.hackSpeed).toBe(1);
  });
});

describe('объекты игрока', () => {
  it('чистятся при смене уровня; привязанные к комнате — при уходе из неё', () => {
    const g = game();
    addObj(g, { kind: 'x', x: 0, y: 0 });
    addObj(g, { kind: 'y', x: 0, y: 0, room: g.zone!.id });
    g.update(1 / 60);
    expect(g.objs.length).toBe(2);
    g.zone = g.plan.rooms.find((r) => r.id !== g.zone!.id)!;
    const z = g.zone;
    z.visited = z.seen = true;
    updateObjs(g, 1 / 60);
    expect(objsOf(g, 'y').length).toBe(0);
    g.startFloor(2);
    expect(g.objs.length).toBe(0);
  });

  it('паутина замедляет врагов и пули; горючее вспыхивает от снаряда; огонь жжёт', () => {
    const g = game();
    const p = g.player;
    const e = foe(g, 'punk', 50, 0, { update() {} });
    addZone(g, 'web', e.x, e.y, 20, 2, { slow: 0.4, bulletSlow: 0.5 });
    const b = makeEBullet(e.x + 5, e.y, 0, 100);
    g.ebullets.push(b);
    g.update(1 / 60);
    expect(e.slowK).toBeCloseTo(0.4);
    // пуля сдвинулась вдвое меньше обычного
    expect(b.x - (e.x + 5)).toBeCloseTo((100 / 60) * 0.5, 2);
    const fuel = addZone(g, 'fuel', p.x + 30, p.y, 12, 4, { dps: 6 });
    spawnShot(g, 0, p.stats, { x: fuel.x, y: fuel.y, bx: fuel.x, by: fuel.y, speed: 0 });
    g.update(1 / 60);
    expect(fuel.data.zone).toBe('fire');
    const f2 = foe(g, 'punk', 30, 0, { update() {} });
    g.update(1 / 60);
    expect(f2.burnDps).toBe(6);
  });
});

describe('миньоны и постройки', () => {
  it('паучок бежит к врагу и взрывается; вертушка стреляет; перехватчик гасит пулю', () => {
    const g = game();
    const e = foe(g, 'heavy', 40, 0, { update() {} });
    const hp = e.hp;
    let boom = false;
    spawnSpider(g, g.player.x, g.player.y, { life: 1.5, boomR: 14, dmg: 5, onBoom: () => (boom = true) });
    step(g, 0.8);
    expect(boom).toBe(true);
    expect(e.hp).toBeLessThan(hp);

    const n = g.pbullets.length;
    spawnSpinner(g, g.player.x, g.player.y, { life: 2, period: 0.15, dmg: 1 });
    step(g, 0.2);
    expect(g.pbullets.length).toBeGreaterThan(n);

    const b = makeEBullet(g.player.x + 60, g.player.y - 40, Math.PI / 2, 0);
    g.ebullets.push(b);
    spawnInterceptor(g, g.player.x, g.player.y, { life: 3, seek: 120, dmg: 2 });
    step(g, 0.5);
    expect(g.ebullets.includes(b)).toBe(false);
  });

  it('бот роя гасит пулю и гибнет; обломок подбирается касанием и рывком', () => {
    const g = game();
    let blocked = 0;
    const bot = spawnBot(g, { onBlock: () => blocked++ });
    g.update(1 / 60);
    g.ebullets.push(makeEBullet(bot.x, bot.y, 0, 0));
    g.update(1 / 60);
    expect(blocked).toBe(1);
    expect(objsOf(g, 'bot').length).toBe(0);
    let got = 0;
    spawnScrap(g, 'junk', g.player.x + 50, g.player.y, 5, '#fff', () => got++);
    expect(collectScraps(g, 'junk', g.player.x, g.player.y, 80)).toBe(1);
    expect(got).toBe(1);
  });

  it('сцепной луч гасит пули на линии и рвётся со смертью конца', () => {
    const g = game();
    const a = foe(g, 'punk', 40, -30, { update() {} });
    const c = foe(g, 'punk', 40, 30, { update() {} });
    tether(g, a, c, { life: 2.5, dps: 10 });
    expect(isTethered(g, a)).toBe(true);
    const b = makeEBullet(a.x, g.player.y, 0, 0);
    g.ebullets.push(b);
    g.update(1 / 60);
    expect(g.ebullets.includes(b)).toBe(false);
    a.hp = 0;
    g.killEnemy(a, true);
    g.update(1 / 60);
    expect(isTethered(g, c)).toBe(false);
  });
});

describe('навесные снаряды', () => {
  it('летят над стеной и врагами, при падении взрываются', () => {
    const g = game();
    const p = g.player;
    // стена прямо перед героем
    const tx = Math.floor((p.x + 20) / TILE), ty = Math.floor(p.y / TILE);
    g.room.set(tx, ty, T.Wall);
    const e = foe(g, 'heavy', 60, 0, { update() {} });
    const hp = e.hp;
    let ended = false;
    spawnShot(g, 0, p.stats, { speed: 200, life: 0.3, maxLife: 0.3, arc: 20, landR: 18, dmg: 5, onEnd: () => (ended = true) });
    g.update(1 / 60);
    expect(e.hp).toBe(hp);
    step(g, 0.35);
    expect(ended).toBe(true);
    expect(e.hp).toBeLessThan(hp);
  });
});
