// Дымовой тест в браузере: запускает игру, жмёт клавиши, делает скриншоты.
// Использование: node tests/e2e/smoke.mjs <url> <outdir>
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/01-menu.png` });
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
// пропустить заставку
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/02-start.png` });
// побегать и пострелять
const hold = async (keys, ms) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
};
await hold(['KeyD', 'ArrowRight'], 700);
await hold(['KeyW', 'ArrowUp'], 700);
await page.screenshot({ path: `${out}/03-move.png` });
const info = await page.evaluate(() => {
  const g = window.__game.scene.game;
  return g ? { room: g.zone?.role ?? 'corridor', rooms: g.plan.rooms.length, x: g.player.x, y: g.player.y, lives: g.player.lives } : null;
});
console.log('state', JSON.stringify(info));
console.log('errors', JSON.stringify(errors));
await browser.close();
