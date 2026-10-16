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
// телепортируемся в проём первой двери
await page.evaluate(() => {
  const g = window.__game.scene.game;
  const d = g.room.doors[0];
  g.player.x = (d.tx + 0.5) * 16 + (d.dir === 'n' || d.dir === 's' ? 8 : 0);
  g.player.y = (d.ty + 0.5) * 16 + (d.dir === 'w' || d.dir === 'e' ? 8 : 0);
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
  return { type: g.room.info.type, enemies: g.enemies.length, eb: g.ebullets.length, lives: g.player.lives, kills: g.player.kills, xp: g.player.xp };
});
console.log('state', JSON.stringify(info));
console.log('errors', JSON.stringify(errors));
await browser.close();
