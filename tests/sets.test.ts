import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerContent } from '../src/content';
import { ENEMY_BY_ID } from '../src/content/enemies';
import { SYN } from '../src/content/sets/common';
import { input } from '../src/core/input';
import { makeEBullet } from '../src/game/bullets';
import { damageEnemy, explode, spawnShot } from '../src/game/combat';
import { Enemy, type EnemyDef } from '../src/game/enemy';
import { Game } from '../src/game/game';
import { item } from '../src/game/items';
import { tether } from '../src/game/minions';
import { objsOf } from '../src/game/objects';
import { stackCount } from '../src/game/status';
import { Player } from '../src/game/player';

// Этап 12б.2: механика предметов наборов I–II класса и синергий (игра без отрисовки).

beforeAll(() => {
  registerContent();
  // в Node нет холста: призраки рывка и копии героя рисуются без спрайта
  Object.defineProperty(Player.prototype, 'sprite', { get: () => null, configurable: true });
});
afterEach(() => {
  for (const c of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ShiftLeft', 'Space', 'KeyR']) input.simulate(c, false);
  input.endFrame();
  vi.restoreAllMocks();
});

const def = (id: string, over: Partial<EnemyDef> = {}): EnemyDef => ({ ...ENEMY_BY_ID.get(id)!, frames: () => [], ...over });

function game(...ids: string[]): Game {
  const g = new Game('sets-test', 'normal');
  g.player.invuln = 0;
  for (const id of ids) equip(g, id);
  return g;
}

function equip(g: Game, id: string) {
  const p = g.player, it = item(id);
  if (it.kind === 'weapon') p.weapon = it;
  else if (it.kind === 'implant') {
    p.slots[it.slot!] = id;
    // рука-оружие становится оружием (как после операции)
    if (it.weapon) p.weapon = it;
  }
  else p.passives.set(id, 1);
  p.recalc();
}

/** Неподвижный враг рядом с игроком */
function foe(g: Game, id: string, dx: number, dy = 0, still = true): Enemy {
  const e = new Enemy(def(id, still ? { update() {} } : {}), g.player.x + dx, g.player.y + dy, 1);
  e.spawn = 0;
  e.home = g.zone?.id ?? -2;
  g.enemies.push(e);
  return e;
}

const step = (g: Game, sec: number) => {
  for (let t = 0; t < sec - 1e-9; t += 1 / 60) {
    g.update(1 / 60);
    input.endFrame();
  }
};
const kill = (g: Game, e: Enemy) => {
  e.hp = 0;
  g.killEnemy(e, true);
};

describe('Падальщик', () => {
  it('«Падаль»: подскок к цели дальше досягаемости, попадание сокращает рывок (не больше 0,3 с/с)', () => {
    const g = game('wScavHook');
    const p = g.player;
    const e = foe(g, 'heavy', 60);
    const x0 = p.x;
    p.dashCd = 2;
    input.simulate('ArrowRight', true);
    step(g, 1 / 60);
    expect(p.x).toBeGreaterThan(x0 + 15);
    expect(e.hp).toBeLessThan(e.maxHp);
    step(g, 0.9);
    // 3 удара за секунду, но не больше 0,3 с за секунду (и время само идёт)
    expect(2 - p.dashCd).toBeLessThanOrEqual(0.3 + 0.95 + 1e-6);
    expect(2 - p.dashCd).toBeGreaterThan(0.95);
  });

  it('«Шмыг»: рывок сквозь врага оглушает на 0,6 с', () => {
    const g = game('iScavLegs');
    const e = foe(g, 'punk', 20);
    input.simulate('KeyD', true);
    input.simulate('Space', true);
    step(g, 0.1);
    expect(e.shockT).toBeGreaterThan(0.4);
  });

  it('короб: обломок с убитого, заряд, тяжёлый обломок в залпе; «Жор»: убийство вплотную возвращает рывок', () => {
    const g = game('wScavHook', 'iScavLegs', 'iScavCrate');
    expect(g.player.synergies.some((s) => s.id === SYN.scav)).toBe(true);
    const p = g.player;
    const e = foe(g, 'punk', 20);
    p.dashCd = 0.8;
    kill(g, e);
    expect(p.dashCd).toBe(0);
    const junk = objsOf(g, 'scrap');
    expect(junk.length).toBe(1);
    step(g, 0.3);
    p.x = junk[0].x;
    p.y = junk[0].y;
    step(g, 2 / 60);
    expect(g.mem.crate).toBe(1);
    p.weapon = item('pistol');
    p.recalc();
    input.simulate('ArrowUp', true);
    step(g, 1 / 60);
    expect(g.pbullets.some((b) => b.tag === 'junk')).toBe(true);
    expect(g.mem.crate).toBe(0);
  });
});

describe('Трубач', () => {
  it('«Труба»: 3 дробины, «в точку» на 70–150 — ×1,4', () => {
    const g = game('wPunkPipe');
    input.simulate('ArrowUp', true);
    step(g, 1 / 60);
    const shots = g.pbullets.filter((b) => b.tag === 'pipe');
    expect(shots.length).toBe(3);
    const b = shots[0];
    const base = b.dmg;
    input.simulate('ArrowUp', false);
    step(g, 0.35);
    expect(b.data!.point).toBe(true);
    expect(b.dmg).toBeCloseTo(base * 1.4);
  });

  it('«Отскок»: рывок прочь от прицела короче и кончается залпом', () => {
    const g = game('iPunkSoles');
    const p = g.player;
    input.simulate('ArrowRight', true);
    input.simulate('KeyA', true);
    step(g, 1 / 60);
    input.simulate('Space', true);
    step(g, 1 / 60);
    expect(p.dashK).toBeCloseTo(0.75);
    step(g, 0.2);
    expect(g.pbullets.some((b) => b.tag === 'recoil')).toBe(true);
  });

  it('«Горсть»: после 0,8 с без стрельбы залп кучный и ×1,4', () => {
    const g = game('iPunkBandolier');
    const p = g.player;
    const base = p.stats.damageMult;
    step(g, 0.1);
    expect(p.stats.damageMult).toBeCloseTo(base * 1.4);
    input.simulate('ArrowRight', true);
    step(g, 1 / 60);
    expect(p.stats.damageMult).toBeCloseTo(base);
  });
});

describe('Дрон-наблюдатель', () => {
  it('кольцевой сброс: снаряд в конце рассыпается кольцом из 6', () => {
    const g = game('pDroneRing');
    const b = spawnShot(g, 0, g.player.stats, { life: 0.02, maxLife: 0.02 });
    step(g, 2 / 60);
    expect(b.dead || !g.pbullets.includes(b)).toBe(true);
    expect(g.pbullets.filter((x) => x.tag === 'ring').length).toBe(6);
  });

  it('протокол дистанции: без врагов рядом скорострельность +20%; враг ближе 50 — отскок', () => {
    const g = game('pDroneRange');
    const p = g.player;
    const r0 = g.player.stats.fireRateMult;
    step(g, 1 / 60);
    expect(p.stats.fireRateMult).toBeCloseTo(r0 * 1.2);
    const x0 = p.x;
    foe(g, 'heavy', 30);
    step(g, 1 / 60);
    expect(p.x).toBeLessThan(x0 - 20);
  });

  it('сканер: пуля спереди замедлена; «Полный надзор» — и сзади', () => {
    const g = game('pDroneScan');
    const p = g.player;
    const front = makeEBullet(p.x + 0, p.y + 60, 0, 0);
    const back = makeEBullet(p.x, p.y - 60, 0, 0);
    g.ebullets.push(front, back);
    // игрок смотрит вниз
    g.update(1 / 60);
    expect(front.slow ?? 0).toBe(0); // замедление уже применено и сброшено после движения — проверяем через тик
    const t = item('pDroneScan').hooks!.tick!;
    t(g, 1 / 60);
    expect(front.slow).toBeCloseTo(0.3);
    expect(back.slow ?? 0).toBe(0);
    for (const id of ['pDroneRing', 'pDroneRange']) equip(g, id);
    t(g, 1 / 60);
    expect(back.slow).toBeCloseTo(0.3);
  });
});

describe('Паук-мина', () => {
  it('липкий заряд на 3-м попадании; ползун после убийства взрывом; паутина от взрыва', () => {
    const g = game('pSpiderSticky', 'pSpiderCrawlers', 'pSpiderWeb');
    const e = foe(g, 'heavy', 60);
    for (let i = 0; i < 3; i++) damageEnemy(g, e, 1, g.player.x, g.player.y, { source: 'bullet' });
    expect(objsOf(g, 'sticky').length).toBe(1);
    const v = foe(g, 'scav', -60);
    explode(g, v.x, v.y, 20, 999);
    expect(v.dead).toBe(true);
    expect(objsOf(g, 'spider').length).toBe(1);
    expect(g.objs.some((o) => o.kind === 'zone' && o.data.zone === 'web')).toBe(true);
    // «Паучий выводок»: паучок живёт, пока не найдёт цель
    expect(objsOf(g, 'spider')[0].life).toBe(Infinity);
  });
});

describe('Рой-бот', () => {
  it('стайный инстинкт: соседи +8% за каждого, одиночка −10%', () => {
    const g = game('pSwarmFlock');
    const p = g.player;
    const a = spawnShot(g, 0, p.stats, { x: p.x, y: p.y, bx: p.x, by: p.y, speed: 0 });
    const b = spawnShot(g, 0, p.stats, { x: p.x + 5, y: p.y, bx: p.x + 5, by: p.y, speed: 0 });
    const lone = spawnShot(g, 0, p.stats, { x: p.x - 80, y: p.y, bx: p.x - 80, by: p.y, speed: 0 });
    const base = a.dmg;
    item('pSwarmFlock').hooks!.tick!(g, 1 / 60);
    expect(a.dmg).toBeCloseTo(base * 1.08);
    expect(b.dmg).toBeCloseTo(base * 1.08);
    expect(lone.dmg).toBeCloseTo(base * 0.9);
  });

  it('карманный рой: 4 бота повторяют залп; перехватчик раз в 0,8 с, до 3; «Матка роя» превращает пулю в бота', () => {
    const g = game('pSwarmFlock', 'pSwarmPocket', 'pSwarmInterceptors');
    step(g, 1 / 60);
    expect(objsOf(g, 'bot').length).toBe(4);
    input.simulate('ArrowRight', true);
    step(g, 1 / 60);
    expect(g.pbullets.filter((b) => b.tag === 'bot').length).toBe(4);
    expect(objsOf(g, 'interceptor').length).toBe(1);
    input.simulate('ArrowRight', false);
    g.ebullets.push(makeEBullet(g.player.x + 50, g.player.y - 40, 0, 0));
    step(g, 0.6);
    expect(objsOf(g, 'bot').length).toBe(5);
  });
});

describe('Вахтёр', () => {
  it('пластина гасит мелкую пулю спереди (шанс), скорость −8%; визор ×1,5 сбоку', () => {
    const g = game('iGuardPlate', 'iGuardVisor');
    const p = g.player;
    expect(p.stats.speed).toBeCloseTo(150 * 0.92);
    expect(p.stats.flankMult).toBeCloseTo(1.5);
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    // игрок смотрит вниз, пуля летит снизу вверх (спереди)
    const b = makeEBullet(p.x, p.y + 1, -Math.PI / 2, 0, { skin: 'small' });
    const lives = p.lives;
    g.hurtPlayer({ kind: 'bullet', bullet: b });
    expect(b.dead).toBe(true);
    expect(p.lives).toBe(lives);
    expect(p.pendingHit).toBe(0);
  });

  it('«Турникет»: 3 болта; 3 отметки — оглушение 0,8 и щит опущен на 2 с', () => {
    const g = game('wGuardTurnstile');
    const e = foe(g, 'guard', 0, 70);
    input.simulate('ArrowDown', true);
    step(g, 1 / 60);
    expect(g.pbullets.filter((b) => b.tag === 'turnstile').length).toBe(3);
    input.simulate('ArrowDown', false);
    step(g, 0.5);
    expect(e.shieldOff).toBeGreaterThan(1);
    expect(e.shockT).toBeGreaterThan(0.2);
  });

  it('«Ключница»: взлом вдвое быстрее, после взлома — щит; «Пост охраны» и крестовина', () => {
    const g = game('iGuardPlate', 'iGuardVisor', 'wGuardTurnstile', 'iGuardKeys');
    const p = g.player;
    expect(p.stats.hackSpeed).toBe(2);
    const s0 = p.shieldLeft;
    p.emit('onHack', g);
    expect(p.shieldLeft).toBe(s0 + 1);
    expect(p.synergies.map((s) => s.id)).toEqual(expect.arrayContaining([SYN.guard1, SYN.guard2]));
    // убийство досмотренного врага даёт крестовину
    const e = foe(g, 'punk', 40);
    e.mem.inspected = g.time + 1;
    kill(g, e);
    expect(objsOf(g, 'cross').length).toBe(1);
    const b = makeEBullet(p.x + 10, p.y - 3, 0, 0);
    g.ebullets.push(b);
    step(g, 0.3);
    expect(g.ebullets.includes(b)).toBe(false);
  });
});

describe('Мигун', () => {
  it('«Пятерня»: 5 осколков замирают и бросаются к врагу', () => {
    const g = game('wBlinkFive');
    foe(g, 'heavy', -70, 40);
    input.simulate('ArrowRight', true);
    step(g, 1 / 60);
    input.simulate('ArrowRight', false);
    const shards = g.pbullets.filter((b) => b.tag === 'five');
    expect(shards.length).toBe(5);
    step(g, 0.3);
    expect(shards[0].speed).toBe(0);
    step(g, 0.1);
    expect(shards[0].speed).toBeGreaterThan(300);
    expect(Math.cos(shards[0].angle)).toBeLessThan(0);
  });

  it('«Рожок»: сбой начинается со скачка на 110 к прицелу; «Перескок» — два рывка', () => {
    const g = game('iBlinkAntenna', 'iBlinkLegs');
    const p = g.player;
    expect(p.stats.dashCharges).toBe(2);
    expect(p.stats.glitchHoming).toBe(8);
    const y0 = p.y;
    g.glitch(false);
    expect(p.y - y0).toBeGreaterThan(60);
  });

  it('мерцающий корпус: пуля проходит сквозь и заряжает сбой; «Ложный след» — копия при рывке', () => {
    const g = game('wBlinkFive', 'iBlinkAntenna', 'iBlinkTorso');
    const p = g.player;
    p.glitch = 0;
    g.mem.flickT = 2.99;
    step(g, 2 / 60);
    const b = makeEBullet(p.x, p.y, 0, 0);
    g.ebullets.push(b);
    const lives = p.lives;
    g.update(1 / 60);
    expect(b.phased).toBe(true);
    expect(p.lives).toBe(lives);
    expect(p.glitch).toBeGreaterThan(0.05);
    input.simulate('Space', true);
    step(g, 1 / 60);
    expect(objsOf(g, 'decoy').length).toBe(1);
  });
});

describe('Снайпер', () => {
  it('«Отвес»: 0,6 с на враге — мгновенный выстрел с критом, пробивает всех на линии', () => {
    const g = game('wSniperPlumb');
    const a = foe(g, 'heavy', 50);
    const b = foe(g, 'heavy', 90);
    input.simulate('ArrowRight', true);
    step(g, 0.3);
    expect(a.hp).toBe(a.maxHp);
    step(g, 0.4);
    // урон 9 × крит 2
    expect(a.maxHp - a.hp).toBeCloseTo(18);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('«Вышка»: урон растёт с путём; «Тренога»: в фокусе хитбокс −30%', () => {
    const g = game('iSniperRange', 'iSniperTripod');
    const p = g.player;
    const s = spawnShot(g, Math.PI / 2, p.stats, { speed: 300 });
    const base = s.dmg;
    step(g, 1 / 60);
    expect(s.dmg).toBeCloseTo(base * 0.75);
    step(g, 0.33);
    expect(s.dmg).toBeGreaterThan(base * 1.25);
    input.simulate('ShiftLeft', true);
    step(g, 1 / 60);
    expect(p.stats.hitR).toBeCloseTo(1.4);
  });

  it('корректировщик отмечает самого дальнего видимого врага (+35% урона)', () => {
    const g = game('iSniperSpotter');
    foe(g, 'heavy', 40);
    const far = foe(g, 'heavy', 90, 30);
    step(g, 1 / 60);
    expect(stackCount(far, 'spot')).toBe(1);
    const hp = far.hp;
    damageEnemy(g, far, 10, g.player.x, g.player.y, { silent: true });
    expect(hp - far.hp).toBeCloseTo(13.5);
  });
});

describe('Автотурель', () => {
  it('поворотный станок доворачивает к врагу в ±40°', () => {
    const g = game('pTurretSwivel');
    const e = foe(g, 'heavy', 60, 30);
    const a = item('pTurretSwivel').hooks!.adjustAim!(g, 0);
    expect(a).toBeCloseTo(Math.atan2(e.y - (g.player.y - 3), e.x - g.player.x));
    expect(item('pTurretSwivel').hooks!.adjustAim!(g, Math.PI)).toBe(Math.PI);
  });

  it('термоцикл: +50% скорострельности, перегрев через 2,2 с — пар и раскалённые снаряды', () => {
    const g = game('pTurretThermo');
    const p = g.player;
    input.simulate('ArrowUp', true);
    step(g, 0.1);
    expect(p.hasBuff('thermoSpin')).toBe(true);
    step(g, 2.2);
    expect(p.hasBuff('thermoHot')).toBe(true);
    expect(p.stats.burn).toBe(3);
  });

  it('вертушка после 6 попаданий; часовой бьёт очередью вошедшего врага', () => {
    const g = game('pTurretSpinners', 'pTurretSentry');
    const e = foe(g, 'heavy', 100);
    for (let i = 0; i < 6; i++) damageEnemy(g, e, 0.1, g.player.x, g.player.y, { source: 'bullet' });
    expect(objsOf(g, 'spinner').length).toBe(1);
    step(g, 1.6);
    expect(g.pbullets.some((b) => b.tag === 'sentry')).toBe(false);
    foe(g, 'heavy', 0, 80);
    step(g, 0.2);
    expect(g.pbullets.filter((b) => b.tag === 'sentry').length).toBeGreaterThan(2);
  });

  it('«Укрепрайон»: вертушки до конца комнаты в режиме часового', () => {
    const g = game('pTurretSwivel', 'pTurretThermo', 'pTurretSpinners', 'pTurretSentry');
    const e = foe(g, 'heavy', 60);
    for (let i = 0; i < 6; i++) damageEnemy(g, e, 0.1, g.player.x, g.player.y, { source: 'bullet' });
    const s = objsOf(g, 'spinner')[0];
    expect(s.life).toBe(Infinity);
    expect(s.data.o.sentry).toBe(90);
  });
});

describe('Ремонтный дрон', () => {
  it('латание: 12 убийств — +1 жизнь', () => {
    const g = game('pRepairPatch');
    const p = g.player;
    p.lives = 2;
    for (let i = 0; i < 12; i++) kill(g, foe(g, 'scav', 40));
    expect(p.lives).toBe(3);
  });

  it('«Ромашка»: 5 лепестков после 1 с без попаданий', () => {
    const g = game('pRepairDaisy');
    input.simulate('ArrowRight', true);
    step(g, 1 / 60);
    expect(g.pbullets.filter((b) => b.tag === 'petal').length).toBe(5);
  });

  it('сцепной луч после двух попаданий; «Полевой ремонт» — союзник из убитого в сцепке; «Перебор» — запчасть', () => {
    const g = game('pRepairPatch', 'pRepairDaisy', 'pRepairTether', 'pRepairSalvage');
    const a = foe(g, 'punk', 50, -20);
    const b = foe(g, 'drone', 50, 20);
    damageEnemy(g, a, 0.1, g.player.x, g.player.y, { source: 'bullet' });
    damageEnemy(g, b, 0.1, g.player.x, g.player.y, { source: 'bullet' });
    expect(objsOf(g, 'tether').length).toBe(1);
    kill(g, b);
    expect(g.enemies.some((e) => e.summon && e.team === 'ally')).toBe(true);
    const part = objsOf(g, 'scrap').find((s) => s.data.type === 'part')!;
    expect(part).toBeTruthy();
    const coins = g.player.coins;
    step(g, 0.3);
    g.player.x = part.x;
    g.player.y = part.y;
    step(g, 2 / 60);
    expect(g.player.coins).toBeGreaterThan(coins);
  });

  it('«Мастерская»: союзник живёт до конца комнаты', () => {
    const g = game('pRepairPatch', 'pRepairDaisy', 'pRepairTether', 'pRepairSalvage');
    const a = foe(g, 'punk', 50, -20);
    const b = foe(g, 'punk', 50, 20);
    tether(g, a, b, { life: 2.5, dps: 1 });
    kill(g, b);
    const ally = g.enemies.find((e) => e.summon)!;
    expect(ally.allyT).toBe(Infinity);
    expect(ally.allyRoom).toBe(g.zone!.id);
  });
});

// ---------------------------------------------------------------- III класс (12б.3)

describe('Резчик', () => {
  it('«Росчерк»: замах 0,3 с, рез-бросок ~130, враг на пути получает ×4', () => {
    const g = game('iCutterSickle');
    const p = g.player;
    const e = foe(g, 'heavy', 60);
    // взгляд вправо
    input.simulate('ArrowRight', true);
    step(g, 1 / 60);
    input.simulate('ArrowRight', false);
    const x0 = p.x, hp = e.hp;
    input.simulate('KeyE', true);
    step(g, 0.2);
    expect(p.x).toBeCloseTo(x0, 0);
    input.simulate('KeyE', false);
    input.simulate('ArrowRight', true);
    step(g, 0.3);
    expect(p.x - x0).toBeGreaterThan(80);
    expect(hp - e.hp).toBeGreaterThanOrEqual(g.player.stats.damage * 4 - 1);
    expect(p.shoveCd).toBeGreaterThan(2);
  });

  it('сенсор «Замах»: ×1,75 по врагу в замахе, первое попадание срывает атаку (50%)', () => {
    const g = game('iCutterSensor');
    const e = foe(g, 'mantis', 60, 0, false);
    e.mem.st = 'tell';
    e.mem.tt = 0.4;
    e.windup = 0.4;
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const hp = e.hp;
    damageEnemy(g, e, 4, g.player.x, g.player.y, { source: 'bullet' });
    expect(hp - e.hp).toBeCloseTo(7);
    expect(e.windup).toBe(0);
    expect(e.mem.st).toBe('walk');
  });

  it('«Шило»: насечки до 5; удар вплотную срывает их (+4 за каждую); при убийстве переходят на соседа', () => {
    const g = game('wCutterAwl');
    const e = foe(g, 'heavy', 50);
    input.simulate('ArrowRight', true);
    step(g, 1.2);
    input.simulate('ArrowRight', false);
    expect(stackCount(e, 'notch')).toBe(5);
    const hp = e.hp;
    damageEnemy(g, e, 1, g.player.x, g.player.y, { source: 'melee' });
    expect(hp - e.hp).toBeCloseTo(1 + 20);
    expect(stackCount(e, 'notch')).toBe(0);
    const a = foe(g, 'scav', 60, 30);
    const b = foe(g, 'heavy', 60, 60);
    a.stacks.set('notch', { n: 3, t: 4 });
    kill(g, a);
    expect(stackCount(b, 'notch')).toBe(3);
  });

  it('«Ножны»: лезвия вокруг, пока E перезаряжается; «Стружка» — лезвия после рывка', () => {
    const g = game('iCutterSheath', 'iCutterTrail');
    const p = g.player;
    const e = foe(g, 'heavy', 22);
    input.simulate('KeyE', true);
    step(g, 1 / 60);
    input.simulate('KeyE', false);
    expect(objsOf(g, 'sheath').length).toBe(1);
    step(g, 0.5);
    expect(e.hp).toBeLessThan(e.maxHp);
    step(g, 0.5);
    expect(objsOf(g, 'sheath').length).toBe(0);
    input.simulate('KeyS', true);
    input.simulate('Space', true);
    step(g, 0.2);
    const sh = g.pbullets.filter((b) => b.tag === 'shaving');
    expect(sh.length).toBeGreaterThan(1);
    expect(sh[0].speed).toBe(0);
    step(g, 0.5);
    expect(sh[0].speed).toBeGreaterThan(0);
    void p;
  });
});

describe('Кочегар', () => {
  it('распылитель: лужи горючего, бак тратится; подошвы: горящий след; бак: попадание поджигает', () => {
    const g = game('iStokerSprayer', 'iStokerSoles', 'iStokerTank');
    input.simulate('KeyE', true);
    step(g, 0.5);
    input.simulate('KeyE', false);
    expect(g.objs.filter((o) => o.kind === 'zone' && o.data.tag === 'fuel').length).toBeGreaterThan(3);
    expect(g.mem.tank).toBeLessThan(1.6);
    input.simulate('KeyD', true);
    step(g, 0.4);
    input.simulate('KeyD', false);
    expect(g.objs.some((o) => o.kind === 'zone' && o.data.tag === 'trail')).toBe(true);
    const e = foe(g, 'heavy', -60);
    damageEnemy(g, e, 1, g.player.x, g.player.y, { source: 'bullet' });
    expect(e.burnDps).toBeGreaterThanOrEqual(3);
    const n = foe(g, 'heavy', -60, 30);
    step(g, 1.1);
    expect(n.burnT).toBeGreaterThan(0);
  });

  it('кочерга: удар по горящему — 3 угля; «Топка»: огонь → снаряды «жар»', () => {
    const g = game('iStokerPoker', 'iStokerFurnace');
    const p = g.player;
    const e = foe(g, 'heavy', 20);
    e.burnT = 2;
    e.burnDps = 3;
    input.simulate('ArrowRight', true);
    step(g, 1 / 60);
    input.simulate('ArrowRight', false);
    expect(g.pbullets.filter((b) => b.tag === 'ember').length).toBe(3);
    step(g, 0.5);
    expect(g.objs.some((o) => o.kind === 'zone' && o.data.tag === 'ember')).toBe(true);
    const fires = g.objs.filter((o) => o.kind === 'zone' && o.data.zone === 'fire').length;
    input.simulate('KeyQ', true);
    step(g, 1 / 60);
    input.simulate('KeyQ', false);
    // источники: угли и горящий враг
    expect(g.pbullets.filter((b) => b.tag === 'heat').length).toBe(fires + 1);
    expect(g.objs.some((o) => o.kind === 'zone' && o.data.zone === 'fire')).toBe(false);
    expect(p.activeCd).toBeGreaterThan(13);
  });
});

describe('Тяжёлый штурмовик', () => {
  it('«Вал»: три залпа по 5 сходятся; все три в одного — сбит с ног', () => {
    const g = game('wHeavyRampart');
    const e = foe(g, 'mantis', 0, 90);
    input.simulate('ArrowDown', true);
    step(g, 0.2);
    input.simulate('ArrowDown', false);
    expect(g.pbullets.filter((b) => b.tag === 'rampart').length).toBeGreaterThanOrEqual(10);
    step(g, 0.5);
    expect(e.shockT).toBeGreaterThan(0);
  });

  it('«Лента»: каждую секунду огня пробивание +1 (до 3), затем гильзы; «Болванка» каждые 3 с; «Заряжающий» — гранаты после паузы', () => {
    const g = game('iHeavyBelt', 'iHeavyBraces', 'iHeavyLoader');
    const p = g.player;
    p.systems.add('tentacles');
    p.recalc();
    input.simulate('ArrowUp', true);
    step(g, 3.2);
    expect(p.stats.pierce).toBe(3);
    expect(g.objs.some((o) => o.kind === 'zone' && o.data.zone === 'shells')).toBe(true);
    expect(g.pbullets.some((b) => b.tag === 'slug')).toBe(true);
    expect(g.mem.loads).toBe(2);
    input.simulate('ArrowUp', false);
    step(g, 0.4);
    input.simulate('ArrowUp', true);
    step(g, 1 / 60);
    expect(g.pbullets.filter((b) => b.tag === 'grenade').length).toBe(2);
  });

  it('«Утюг»: 8 с огня — плита; сбитая плита отбрасывает и стирает пули; скорость −20% при стрельбе', () => {
    const g = game('iHeavyPlates');
    const p = g.player;
    input.simulate('ArrowUp', true);
    step(g, 0.1);
    expect(p.stats.speed).toBeCloseTo(150 * 0.8);
    const s0 = p.shieldLeft;
    step(g, 8);
    expect(p.shieldLeft).toBe(s0 + 1);
    input.simulate('ArrowUp', false);
    g.ebullets.push(makeEBullet(p.x + 30, p.y, 0, 0));
    p.invuln = 0;
    g.hurtPlayer({ kind: 'floor' });
    expect(g.ebullets.length).toBe(0);
  });
});

describe('Прыгун «Блоха»', () => {
  it('«Подскок»: прыжок дальше, приземление стирает пули; «Жёсткая посадка» подбрасывает обычных', () => {
    const g = game('pFleaHop', 'pFleaLob', 'pFleaCatapult');
    const p = g.player;
    expect(p.stats.dashJump).toBe(true);
    const e = foe(g, 'punk', 30, 50);
    input.simulate('KeyS', true);
    input.simulate('Space', true);
    step(g, 0.1);
    input.simulate('Space', false);
    input.simulate('KeyS', false);
    g.ebullets.push(makeEBullet(p.x + 10, p.y, 0, 0));
    step(g, 0.1);
    expect(g.ebullets.length).toBe(0);
    expect(e.toss || e.dead).toBeTruthy();
  });

  it('«Навес»: снаряды залпа летят навесом и отскакивают дважды', () => {
    const g = game('pFleaLob');
    input.simulate('ArrowRight', true);
    step(g, 1 / 60);
    input.simulate('ArrowRight', false);
    const b = g.pbullets.find((x) => x.arc);
    expect(b).toBeTruthy();
    expect(b!.landR).toBe(18);
    // после первого падения — два отскока (lob 1 и 2)
    const seen = new Set<number>();
    for (let i = 0; i < 90; i++) {
      step(g, 1 / 60);
      for (const x of g.pbullets) if (x.tag === 'lob') seen.add(x.data!.lob);
    }
    expect([...seen].sort()).toEqual([1, 2]);
  });

  it('«Катапульта» (8%): подброс обычного врага; «Зуд»: блоха на 5-м попадании; «Укус»: привод на 4-м', () => {
    const g = game('pFleaCatapult', 'pFleaItch', 'pFleaBite');
    const e = foe(g, 'punk', 60);
    const h = foe(g, 'heavy', -60);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (let i = 0; i < 5; i++) damageEnemy(g, h, 0.01, g.player.x, g.player.y, { source: 'bullet' });
    expect(stackCount(h, 'flea')).toBe(1);
    expect(h.driveK).toBeCloseTo(0.15);
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    damageEnemy(g, e, 0.01, g.player.x, g.player.y, { source: 'bullet' });
    expect(e.toss).toBeTruthy();
    vi.restoreAllMocks();
    const hp = h.hp;
    step(g, 0.55);
    expect(hp - h.hp).toBeCloseTo(1, 1);
  });
});

// ---------------------------------------------------------------- IV класс и общий пул (12б.4)

describe('Сорванный', () => {
  it('«Петля срыва»: в бою гон (+35% скорости, +25% урона), в 3,5 с — выплеск из 20 снарядов', () => {
    const g = game('iSnapLoop');
    const p = g.player;
    p.systems.add('nervous');
    p.recalc();
    foe(g, 'heavy', 100);
    step(g, 0.2);
    expect(p.stats.speed).toBeCloseTo(150 * 1.35);
    step(g, 1.5);
    expect(p.hasBuff('loopRush')).toBe(false);
    step(g, 1.9);
    expect(g.pbullets.filter((b) => b.tag === 'surge').length).toBe(20);
  });

  it('«Таран»: касание обычного врага не ранит, враг получает ×3; «Полный срыв» — соседи сорваны', () => {
    const g = game('iSnapLoop', 'iSnapRam', 'iSnapSocket');
    const p = g.player;
    const e = foe(g, 'scav', 0, 0);
    e.hp = 1;
    const n = foe(g, 'punk', 40, 0);
    const lives = p.lives;
    g.update(1 / 60);
    expect(p.lives).toBe(lives);
    expect(p.pendingHit).toBe(0);
    expect(e.dead).toBe(true);
    expect(n.team).toBe('ally');
  });

  it('«Бешеный разъём»: сбой срывает с поводка, босса замедляет', () => {
    const g = game('iSnapSocket');
    const e = foe(g, 'punk', 30);
    const b = foe(g, 'punk', -30, 0, true);
    b.def = { ...b.def, boss: true };
    g.glitch(false);
    expect(e.team).toBe('ally');
    expect(e.allyT).toBeCloseTo(4);
    expect(b.team).toBe('foe');
    expect(b.slowK).toBeCloseTo(0.4);
  });

  it('«Долг боли»: жизнь становится долгом; 2 убийства списывают, иначе жизнь теряется', () => {
    const g = game('iSnapDebt');
    const p = g.player;
    p.systems.add('blood');
    p.recalc();
    const lives = p.lives;
    g.hurtPlayer({ kind: 'floor' });
    expect(p.lives).toBe(lives);
    expect(g.mem.debt).toBeTruthy();
    kill(g, foe(g, 'scav', 60));
    kill(g, foe(g, 'scav', 60));
    expect(g.mem.debt).toBeNull();
    // не чаще раза в 20 с: следующий удар — обычный (аварийное окно и потеря жизни)
    p.invuln = 0;
    g.hurtPlayer({ kind: 'floor' });
    expect(p.pendingHit > 0 || p.lives < lives).toBe(true);
  });

  it('«Долг боли»: не списан за 3 с — жизнь теряется', () => {
    const g = game('iSnapDebt');
    const p = g.player;
    p.systems.add('blood');
    p.recalc();
    const lives = p.lives;
    g.hurtPlayer({ kind: 'floor' });
    step(g, 3.1);
    expect(p.lives).toBe(lives - 1);
  });

  it('«Обрывок поводка»: обычный срывается на 2,5 с, тяжёлый оглушён', () => {
    const g = game('iSnapLeash');
    const a = foe(g, 'punk', 0, 40);
    const h = foe(g, 'heavy', 20, 40);
    input.simulate('KeyE', true);
    step(g, 1 / 60);
    expect(a.team).toBe('ally');
    expect(h.team).toBe('foe');
    expect(h.shockT).toBeGreaterThan(0.3);
  });

  it('цепь «Обрыв»: раскрутка бьёт касанием, бросок с полной раскруткой — 30 урона', () => {
    const g = game('wSnapChain');
    const near = foe(g, 'heavy', 36, 0);
    const far = foe(g, 'heavy', 0, 120);
    input.simulate('ArrowDown', true);
    step(g, 1.6);
    expect(near.hp).toBeLessThan(near.maxHp);
    input.simulate('ArrowDown', false);
    step(g, 0.5);
    expect(far.maxHp - far.hp).toBeGreaterThanOrEqual(29);
  });
});

describe('Механоид', () => {
  it('«Вилка»: 8-е попадание по врагу — пара ракет, взрыв на цели', () => {
    const g = game('pMechFork');
    const e = foe(g, 'heavy', 60);
    for (let i = 0; i < 8; i++) damageEnemy(g, e, 0.01, g.player.x, g.player.y, { source: 'bullet' });
    expect(g.pbullets.filter((b) => b.tag === 'fork').length).toBe(2);
    const hp = e.hp;
    step(g, 0.6);
    expect(hp - e.hp).toBeGreaterThan(g.player.stats.damage * 4);
  });

  it('«Колонна»: 4 пули по 30%, скорострельность −20%', () => {
    const g = game('pMechColumn');
    const p = g.player;
    expect(p.stats.fireRateMult).toBeCloseTo(0.8);
    input.simulate('ArrowRight', true);
    step(g, 1 / 60);
    const col = g.pbullets.filter((b) => b.data?.col);
    expect(col.length).toBe(4);
    expect(col[0].dmg).toBeCloseTo(p.stats.damage * 0.3);
  });

  it('«Пеленг»: самонаведение выбирает цель с пеленгом; «КАЗ» сбивает пулю раз в 10 с', () => {
    const g = game('pMechBearing', 'pMechAps');
    const p = g.player;
    const near = foe(g, 'heavy', 30);
    const far = foe(g, 'heavy', -90);
    damageEnemy(g, far, 0.01, p.x, p.y, { source: 'bullet' });
    expect(stackCount(far, 'bearing')).toBe(1);
    expect(g.seekEnemy(p.x, p.y, 170)).toBe(far);
    void near;
    const b = makeEBullet(p.x, p.y, 0, 0);
    const lives = p.lives;
    g.hurtPlayer({ kind: 'bullet', bullet: b });
    expect(b.dead).toBe(true);
    expect(p.lives).toBe(lives);
    p.invuln = 0;
    g.hurtPlayer({ kind: 'bullet', bullet: makeEBullet(p.x, p.y, 0, 0) });
    expect(p.pendingHit > 0 || p.lives < lives).toBe(true);
  });

  it('«Заградогонь»: полоса огня между вами и врагом; «Боекомплект»: ракеты за убийства, сбой выпускает их', () => {
    const g = game('pMechBarrage', 'pMechAmmo');
    foe(g, 'heavy', 100);
    step(g, 4.1);
    expect(g.objs.some((o) => o.kind === 'zone' && o.data.zone === 'strip')).toBe(true);
    kill(g, foe(g, 'scav', 50));
    kill(g, foe(g, 'scav', 50));
    expect(g.mem.ammo).toBe(2);
    g.glitch(false);
    expect(g.pbullets.filter((b) => b.tag === 'ammo').length).toBe(2);
  });

  it('«Ответный удар»: сбитая «КАЗом» пуля — ракеты «Вилки» в стрелявшего и пеленг на него', () => {
    const g = game('pMechFork', 'pMechColumn', 'pMechBearing', 'pMechAps', 'pMechBarrage', 'pMechAmmo');
    const shooter = foe(g, 'heavy', 80);
    const b = makeEBullet(g.player.x, g.player.y, 0, 0);
    b.owner = shooter;
    g.hurtPlayer({ kind: 'bullet', bullet: b });
    expect(stackCount(shooter, 'bearing')).toBe(1);
    expect(g.pbullets.filter((x) => x.tag === 'fork').length).toBe(2);
  });
});

describe('общий пул', () => {
  it('«Накал»: убийство рядом — заряд (+3% урона), попадание сжигает половину', () => {
    const g = game('iHeatPack');
    const p = g.player;
    for (let i = 0; i < 4; i++) kill(g, foe(g, 'scav', 30));
    expect(g.mem.heatN).toBe(4);
    expect(p.stats.damageMult).toBeCloseTo(1.12);
    p.shieldLeft = 1;
    g.hurtPlayer({ kind: 'floor' });
    expect(g.mem.heatN).toBe(2);
  });

  it('«Ковровый удар»: 40-е попадание — 6 меток, через 0,5 с — взрывы', () => {
    const g = game('pCarpetStrike');
    const e = foe(g, 'heavy', 0, 85);
    // взгляд вниз (по умолчанию)
    for (let i = 0; i < 40; i++) damageEnemy(g, e, 0.01, g.player.x, g.player.y, { source: 'bullet' });
    expect(objsOf(g, 'carpet').length).toBe(6);
    const hp = e.hp;
    step(g, 0.55);
    expect(hp - e.hp).toBeGreaterThan(10);
  });
});
