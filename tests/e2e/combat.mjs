// Проверка боя: переходим в обычную комнату, стреляем, смотрим на врагов и пули
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
// пропустить заставку
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
// переходим в обычную боевую комнату (в особых врагов нет)
await page.evaluate(() => {
  const g = window.__game.scene.game;
  g.enterRoom(g.plan.rooms.find((r) => r.role === 'combat'));
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/04-room.png` });
const fire = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown']) await fire(k, 500);
await page.screenshot({ path: `${out}/05-fight.png` });
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/06-focus.png` });
await page.keyboard.up('ArrowUp');
await page.keyboard.up('ShiftLeft');
const info = await page.evaluate(() => {
  const g = window.__game.scene.game;
  return { type: g.zone?.role ?? 'corridor', enemies: g.enemies.length, eb: g.ebullets.length, lives: g.player.lives, kills: g.player.kills, xp: g.player.xp };
});
console.log('state', JSON.stringify(info));
console.log('errors', JSON.stringify(errors));
await browser.close();
