// Этап 14а: розыск (шкала в HUD, шум, лог). Дополняется в следующих частях 14а.
// Использование: node tests/e2e/wanted.mjs <url> <папка для скриншотов>
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? '.';
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
await ev(() => { window.__game.scene.game.player.invuln = 9999; });

// --- 14а.1 розыск
const w0 = await ev(() => window.__game.scene.game.wanted.heat);
await page.keyboard.down('ArrowRight'); // стрельба вправо
await page.waitForTimeout(1500);
await page.keyboard.up('ArrowRight');
const w1 = await ev(() => window.__game.scene.game.wanted.heat);
check('стрельба поднимает розыск быстрее времени', w1 - w0 > 1.5 * (1 / 120), JSON.stringify({ w0, w1 }));

const lvl = await ev(async () => {
  const g = window.__game.scene.game;
  const W = await import('/src/game/wanted.ts');
  W.addHeat(g, 2.4);
  return { lvl: W.wantedLevel(g), log: g.logLines.at(-1)?.text.ru };
});
check('ступень 2 и строка в логе', lvl.lvl === 2 && lvl.log?.startsWith('Розыск 2'), JSON.stringify(lvl));
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/wanted-hud.png` });

// --- 14а.2 камеры и глушилка
const cam = await ev(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  g.wanted.heat = 2.5;
  // камера на стене прямо над игроком: R рядом — взлом
  const c = { x: p.x, y: p.y - 12, kind: 'wall', base: Math.PI / 2, sweep: 0.9, a: Math.PI / 2, ph: 0, spot: 0, cd: 0, state: 'on' };
  g.surv.cameras.push(c);
  return g.surv.cameras.length;
});
await page.waitForTimeout(100);
await page.keyboard.down('KeyR');
await page.waitForTimeout(1400);
await page.keyboard.up('KeyR');
const hacked = await ev(() => {
  const g = window.__game.scene.game;
  return { state: g.surv.cameras.at(-1).state, heat: g.wanted.heat, log: g.logLines.map((l) => l.text.ru) };
});
check('камера отключается взломом R, розыск падает', hacked.state === 'off' && hacked.heat < 2.5 - 0.2, JSON.stringify(hacked));

await ev(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  g.surv.cameras.push({ x: p.x + 70, y: p.y - 30, kind: 'dome', base: Math.atan2(30, -70), sweep: 0, a: 0, ph: 0, spot: 0.6, cd: 0, state: 'on' });
});
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/wanted-camera.png` });

const jam = await ev(() => {
  const g = window.__game.scene.game;
  for (let n = 1; n <= 8; n++) {
    if (n !== g.floorNum) g.startFloor(n);
    const r = g.plan.rooms.find((x) => x.role === 'jammer');
    if (r) {
      g.surv.cameras = [];
      g.enterRoom(r);
      g.wanted.heat = 3.2;
      return true;
    }
  }
  return false;
});
await page.waitForTimeout(2000);
const jam2 = await ev(() => {
  const g = window.__game.scene.game;
  return { jammed: g.wanted.jammed, heat: g.wanted.heat };
});
check('комната-глушилка: розыск снижается', jam && jam2.jammed && jam2.heat < 3.2, JSON.stringify(jam2));
await page.screenshot({ path: `${out}/wanted-jammer.png` });

// --- 14а.3 волны Диспетчера
const wave = await ev(async () => {
  const g = window.__game.scene.game;
  g.startFloor(2);
  const r = g.plan.rooms.find((x) => x.role === 'combat');
  r.visited = r.cleared = true;
  g.enterRoom(r);
  g.enemies = [];
  g.surv.cameras = [];
  g.wanted.heat = 4.2;
  g.levelTimes[1] = 40;
  g.director.waveT = 0.01;
  g.director.calm = 30;
  // мини-босс вместо волны — отдельная проверка ниже
  g.director.minibossSent = true;
  return true;
});
await page.waitForTimeout(400);
const wv1 = await ev(() => {
  const g = window.__game.scene.game;
  const w = g.enemies.filter((e) => e.wave);
  return { n: w.length, hunters: w.filter((e) => e.hunter).length, log: g.logLines.map((l) => l.text.ru) };
});
check('волна охотников на розыске 4', wave && wv1.n > 0 && wv1.hunters >= 2 && wv1.log.some((l) => l.includes('дроны-охотники')), JSON.stringify(wv1));
await page.waitForTimeout(4000);
const wv2 = await ev(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  const w = g.enemies.filter((e) => e.wave);
  return { near: w.filter((e) => Math.hypot(e.x - p.x, e.y - p.y) < 200).length, n: w.length };
});
check('волна дошла до игрока', wv2.near > 0, JSON.stringify(wv2));
await page.screenshot({ path: `${out}/wanted-wave.png` });

// турель тяжёлой волны падает сверху и садится
const drop = await ev(async () => {
  const g = window.__game.scene.game;
  const D = await import('/src/game/director.ts');
  g.wanted.heat = 3.2;
  const w = D.sendWave(g, 'heavy');
  const t = w.find((e) => e.def.id === 'turret');
  if (!t) return { turret: false };
  const h0 = t.mem.h;
  await new Promise((r) => setTimeout(r, 1700));
  return { turret: true, h0, h1: t.mem.h, landed: !t.mem.drop };
});
check('турель падает сверху и садится', drop.turret && drop.h0 > 50 && drop.h1 === 0 && drop.landed, JSON.stringify(drop));

// --- 14а.4 мини-боссы
const mb = await ev(() => {
  const g = window.__game.scene.game;
  g.wanted.heat = 0;
  // 1-й уровень — там всегда Страж (у Голиафа и Улья часть фаз почти не стреляет из-за старой ошибки
  // ключей таймеров в bosses.ts — вопрос в DECISIONS.md); комнаты нет (шанс 0,35) — назначаем большую боевую
  for (let n = 1; n <= 1; n++) {
    g.startFloor(n);
    let r = g.plan.rooms.find((x) => x.role === 'miniboss');
    if (!r) {
      r = g.plan.rooms.filter((x) => x.role === 'combat').sort((a, b) => b.w * b.h - a.w * a.h)[0];
      r.role = 'miniboss';
    }
    g.surv.cameras = [];
    g.enterRoom(r);
    const c = g.room.roomCenter(r);
    g.player.y = c.y + 70;
    g.snapCamera();
    return { floor: n, room: r.id };
  }
  return null;
});
// первая атака у некоторых (рельсотрон Голиафа) — через несколько секунд, пули быстрые: следим в странице
const mb2 = await ev(async () => {
  const g = window.__game.scene.game;
  let shot = false;
  for (let i = 0; i < 180 && !shot; i++) {
    await new Promise((r) => setTimeout(r, 50));
    shot = g.ebullets.some((b) => b.owner?.miniboss);
  }
  const m = g.enemies.filter((e) => e.miniboss);
  return { n: m.length, id: m[0]?.def.id, locked: g.locked, bullets: shot ? 1 : 0, bar: g.boss?.def.name.ru };
});
check('комната мини-босса: мини-босс, двери заперты, стреляет', !!mb && mb2.n > 0 && mb2.locked && mb2.bullets > 0, JSON.stringify({ mb, mb2 }));
await page.screenshot({ path: `${out}/wanted-miniboss.png` });
const mb3 = await ev(async () => {
  const g = window.__game.scene.game;
  for (let i = 0; i < 30; i++) {
    for (const e of g.enemies.filter((x) => x.miniboss && !x.dead)) {
      e.mem.invuln = 0;
      e.spawn = 0;
      e.hp -= e.maxHp * 0.2;
      g.checkBossPhase(e);
      if (e.hp <= 0) g.killEnemy(e, true);
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  for (const e of g.enemies) g.killEnemy(e, true);
  await new Promise((r) => setTimeout(r, 300));
  return { items: g.pickups.filter((k) => k.kind === 'item').length, locked: g.locked, log: g.logLines.map((l) => l.text.ru) };
});
check('победа над мини-боссом: выбор из 2 предметов, двери открыты', mb3.items >= 2 && !mb3.locked, JSON.stringify(mb3));

// --- 14а.5 патчи Диспетчера
const pt = await ev(async () => {
  const g = window.__game.scene.game;
  const P = await import('/src/game/patches.ts');
  g.patches.time = 60;
  for (let i = 0; i < 20; i++) P.noteDash(g);
  const a = P.releasePatch(g);
  const b = P.releasePatch(g);
  return { a: a?.style, b: b?.style, list: P.patchList(g), log: g.logLines.at(-1)?.text.ru };
});
check('патчи: рывки, затем обычная стрельба; строка в логе', pt.a === 'dash' && pt.b === 'shot' && pt.list.length === 2 && pt.log?.startsWith('Обновление 3.8'), JSON.stringify(pt));
// окно повышения уровня (от убийств выше) закрываем
await ev(() => {
  const app = window.__game;
  app.scene.game.pendingLevelUps = 0;
  app.scene.overlay = null;
});
await page.waitForTimeout(100);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const paused = await ev(() => window.__game.scene.overlay?.constructor.name);
check('пауза открыта (там список патчей)', paused === 'PauseOverlay', paused);
await page.screenshot({ path: `${out}/wanted-pause-patches.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
if (fails.length) {
  console.log(`\nПровалено: ${fails.length}`);
  process.exit(1);
}
console.log('\nВсе проверки этапа 14а пройдены');
