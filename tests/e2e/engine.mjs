// Этап 12б.1: доработки движка в живой игре с отрисовкой — зоны на полу, миньоны и постройки,
// союзники (вызванный и сорванный), подброс, навес, приманка, сцепка, индикаторы, рывки, взлом.
// Использование: node tests/e2e/engine.mjs <url> <папка для скриншотов>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`);
  if (!ok) fails.push(name);
};
const ev = (fn, arg) => page.evaluate(fn, arg);

await page.goto(url);
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.keyboard.press('Enter'); // заставка
await page.waitForTimeout(300);

// боевая комната без врагов, игрок бессмертен
await ev(() => {
  const g = window.__game.scene.game;
  window.__game.scene.overlay = null;
  const room = g.plan.rooms.find((r) => r.role === 'combat');
  room.visited = true;
  room.cleared = false;
  g.enterRoom(room);
  g.enemies = [];
  g.ebullets = [];
  g.player.invuln = 9999;
});

const spawn = (id, dx, dy = 0, still = false) => ev(([id, dx, dy, still]) => {
  const g = window.__game.scene.game;
  const { Enemy, ENEMIES } = window.__enemies;
  const def = ENEMIES.find((d) => d.id === id);
  const e = new Enemy(still ? { ...def, update() {} } : def, g.player.x + dx, g.player.y + dy, 1);
  e.spawn = 0;
  g.enemies.push(e);
  return g.enemies.length - 1;
}, [id, dx, dy, still]);

// ------------------------------------------------ зоны, миньоны, постройки
await spawn('heavy', 60, -20, true);
await spawn('guard', -60, 20, true);
await spawn('punk', 50, 40, true);
const made = await ev(async () => {
  const g = window.__game.scene.game;
  const p = g.player;
  const Z = await import('/src/game/zones.ts');
  const M = await import('/src/game/minions.ts');
  Z.addZone(g, 'fuel', p.x - 30, p.y - 20, 12, 4, { dps: 6 });
  Z.addZone(g, 'fire', p.x + 30, p.y + 25, 10, 4, { dps: 5, burnBullets: true });
  Z.addZone(g, 'web', p.x - 40, p.y + 30, 18, 4, { slow: 0.4, bulletSlow: 0.5 });
  Z.addZone(g, 'shells', p.x, p.y + 40, 14, 4, { slow: 0.3, slowFor: 2 });
  Z.addZone(g, 'strip', p.x + 20, p.y - 40, 0, 4, { dps: 6, x2: p.x + 80, y2: p.y - 40, width: 10 });
  M.spawnSpinner(g, p.x - 20, p.y, { life: 3, period: 0.2, dmg: 1 });
  M.spawnSpinner(g, p.x + 20, p.y, { life: 3, period: 0.3, dmg: 1, sentry: 90 });
  M.spawnSpider(g, p.x, p.y, { life: 1.5, boomR: 14, dmg: 3 });
  for (let i = 0; i < 4; i++) M.spawnBot(g, {});
  M.spawnInterceptor(g, p.x, p.y, { life: 3, seek: 120, dmg: 2 });
  M.spawnFollower(g, 'spotter', -10, -14);
  M.spawnScrap(g, 'junk', p.x + 40, p.y, 5, '#b87a0c', () => {});
  const [a, b] = g.enemies;
  M.tether(g, a, b, { life: 3, dps: 6 });
  return g.objs.length;
});
check('объекты созданы (5 зон, 2 вертушки, паучок, 4 бота, перехватчик, дрон, обломок, сцепка)', made === 16, String(made));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/engine-objects.png` });
const objs = await ev(() => {
  const g = window.__game.scene.game;
  return { n: g.objs.length, spinnerShots: g.pbullets.filter((b) => b.tag === 'spinner').length, fire: g.objs.filter((o) => o.kind === 'zone' && o.data.zone === 'fire').length };
});
check('вертушки стреляют, объекты живут и рисуются', objs.spinnerShots > 0 && objs.n > 5, JSON.stringify(objs));

// ------------------------------------------------ союзники
const allies = await ev(async () => {
  const g = window.__game.scene.game;
  const T = await import('/src/game/team.ts');
  const { ENEMIES } = window.__enemies;
  const punk = g.enemies[2];
  const snapped = T.snapEnemy(g, punk, 3);
  const a = T.summonAlly(g, ENEMIES.find((d) => d.id === 'scav'), g.player.x - 20, g.player.y - 20, 0.3, 6);
  // неподвижная цель вплотную к союзнику (раскладка комнаты случайна — бочки не должны мешать)
  const { Enemy } = window.__enemies;
  const v = new Enemy({ ...ENEMIES.find((d) => d.id === 'heavy'), update() {} }, a.x + 8, a.y, 1);
  v.spawn = 0;
  g.enemies.push(v);
  window.__victim = v;
  return { snapped, team: punk.team, summon: a.summon };
});
check('сорванный враг и вызванный союзник', allies.snapped && allies.team === 'ally' && allies.summon, JSON.stringify(allies));
// следим, кто наносит удары: попадание союзника видно в e.lastHit.by
let byAlly = false;
for (let i = 0; i < 30 && !byAlly; i++) {
  await page.waitForTimeout(50);
  byAlly = await ev(() => window.__game.scene.game.enemies.some((e) => e.team === 'foe' && e.lastHit?.by === 'ally') || window.__victim.lastHit?.by === 'ally');
}
const fight = await ev(() => {
  const g = window.__game.scene.game;
  const v = window.__victim;
  return { allies: g.enemies.filter((e) => e.team === 'ally').length, victimHurt: v.dead || v.hp < v.maxHp };
});
fight.byAlly = byAlly;
check('союзник дерётся: враг ранен союзником (lastHit.by = ally)', fight.victimHurt && fight.byAlly, JSON.stringify(fight));
await page.screenshot({ path: `${out}/engine-allies.png` });

// ------------------------------------------------ подброс, навес, приманка
const toss = await ev(async () => {
  const g = window.__game.scene.game;
  const S = await import('/src/game/status.ts');
  const M = await import('/src/game/minions.ts');
  const { spawnShot } = await import('/src/game/combat.ts');
  const e = g.enemies.find((x) => x.team === 'foe' && !x.dead);
  window.__landed = null;
  S.tossEnemy(g, e, 0.7, (_e, acc) => { window.__landed = acc; });
  S.addStack(e, 'test', 3, 5, 3);
  S.STACK_COLOR.set('test', '#ffcc33');
  const p = g.player;
  spawnShot(g, -Math.PI / 2, p.stats, { speed: 150, life: 0.5, maxLife: 0.5, arc: 24, landR: 18, tag: 'lob' });
  M.spawnDecoy(g, p.x - 50, p.y - 10, { life: 1.2 });
  return !!e.toss;
});
check('враг подброшен', toss);
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/engine-toss.png` });
await page.waitForTimeout(700);
const landed = await ev(() => window.__landed);
check('подброшенный враг упал (урон набран в воздухе)', landed !== null, String(landed));

// ------------------------------------------------ индикаторы у героя и в HUD
await ev(async () => {
  const g = window.__game.scene.game;
  const I = window.__items;
  const icon = I.item('pistol').icon;
  g.player.hooks.push({
    gauge: () => [
      { kind: 'bar', color: '#ffcc33', k: 0.6 },
      { kind: 'pips', color: '#ff3a2e', n: 2, max: 3 },
      { kind: 'ring', color: '#a3161f', k: 0.4 },
      { kind: 'hud', color: '#ffcc33', icon, k: 0.5 },
      { kind: 'hud', color: '#b87a0c', icon, n: 7 },
    ],
  });
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/engine-gauges.png` });

// ------------------------------------------------ двойной рывок и прыжок
const dash = await ev(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.addBuff('testDash', 30, (s) => { s.dashCharges = 2; s.dashJump = true; });
  p.dashCd = 0;
  p.dashLeft = 2;
  window.__dashEnds = 0;
  p.hooks.push({ onDashEnd: () => { window.__dashEnds++; } });
  return p.stats.dashCharges;
});
await page.keyboard.press('Space');
await page.waitForTimeout(200);
const mid = await ev(() => window.__game.scene.game.player.dashCd);
await page.keyboard.press('Space');
await page.waitForTimeout(200);
const after = await ev(() => ({ cd: window.__game.scene.game.player.dashCd, ends: window.__dashEnds }));
check('серия из двух рывков: перезарядка только после второго, onDashEnd', dash === 2 && mid === 0 && after.cd > 0 && after.ends === 2, JSON.stringify({ mid, ...after }));

// ------------------------------------------------ взлом быстрее (hackSpeed) и onHack
const hackSetup = await ev(() => {
  const g = window.__game.scene.game;
  const term = g.pickups.find((k) => k.kind === 'terminal' && !k.done);
  if (!term) return false;
  g.enemies = [];
  g.ebullets = [];
  g.abullets = [];
  const r = g.room.roomOfPoint(term.x, term.y);
  if (r) {
    r.visited = r.seen = true;
    r.cleared = true;
  }
  g.player.x = term.x;
  g.player.y = term.y + 6;
  g.player.addBuff('testHack', 30, (s) => { s.hackSpeed = 3; });
  window.__hacked = 0;
  g.player.hooks.push({ onHack: () => { window.__hacked++; } });
  window.__term = term;
  return true;
});
if (hackSetup) {
  await page.waitForTimeout(100);
  await page.keyboard.down('KeyR');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyR');
  const hack = await ev(() => ({ done: window.__term.done, hooks: window.__hacked }));
  check('взлом ×3 за 0,8 с вместо 1,5 с, хук onHack', hack.done && hack.hooks === 1, JSON.stringify(hack));
} else check('терминал на уровне есть (для проверки взлома)', true, 'нет петли на этом seed — пропуск');

// ------------------------------------------------ смена уровня чистит объекты
const cleared = await ev(() => {
  const g = window.__game.scene.game;
  g.startFloor(2);
  return { objs: g.objs.length, ab: g.abullets.length };
});
check('при смене уровня объекты игрока и пули союзников убраны', cleared.objs === 0 && cleared.ab === 0, JSON.stringify(cleared));

check('без ошибок на странице', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
if (fails.length) {
  console.log('FAILED:', fails.join('; '));
  process.exit(1);
}
console.log('ALL OK');
