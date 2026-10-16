// Стреляет из каждого оружия и использует каждый активный имплант в комнате с врагами — ловит ошибки выполнения.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e).slice(0, 300)));
await page.goto(url);
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const ids = await page.evaluate(async () => {
  const items = window.__items;
  return [...items.ITEMS.values()].filter((i) => i.kind === 'weapon' || i.active).map((i) => i.id);
});
for (const id of ids) {
  await page.evaluate(async (id) => {
    const items = window.__items;
    const g = window.__game.scene.game;
    window.__game.scene.overlay = null;
    g.player.invuln = 999;
    if (!g.enemies.length) {
      const normal = g.plan.rooms.find((r) => r.type === 'normal' && !r.cleared) ?? g.plan.rooms.find((r) => r.type === 'normal');
      normal.cleared = false; normal.visited = false;
      g.enterRoom(normal, null);
    }
    g.acquire(items.item(id), g.player.x, g.player.y);
    g.player.holdT = 0;
  }, id);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(150);
}
const st = await page.evaluate(() => ({ eb: window.__game.scene.game.ebullets.length, pb: window.__game.scene.game.pbullets.length }));
console.log('tested', ids.length, JSON.stringify(st));
console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
await browser.close();
