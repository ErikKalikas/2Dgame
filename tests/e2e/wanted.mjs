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

check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
if (fails.length) {
  console.log(`\nПровалено: ${fails.length}`);
  process.exit(1);
}
console.log('\nВсе проверки этапа 14а пройдены');
