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

check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
if (fails.length) {
  console.log(`\nПровалено: ${fails.length}`);
  process.exit(1);
}
console.log('\nВсе проверки этапа 14а пройдены');
