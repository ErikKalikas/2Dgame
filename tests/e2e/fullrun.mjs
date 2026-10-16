// Прохождение всех 9 уровней с "читами" через тестовый хук: проверяет боссов, фазы, телепорты и экран победы.
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
await page.waitForTimeout(400);
// пропустить заставку
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
for (let floor = 1; floor <= 9; floor++) {
  await page.evaluate(() => {
    const g = window.__game.scene.game;
    g.player.invuln = 9999;
    const boss = g.plan.rooms[g.plan.bossId];
    g.enterRoom(boss, null);
    const c = g.room.centerPoint();
    g.player.x = c.x; g.player.y = c.y + 60;
    g.snapCamera();
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/boss-${floor}.png` });
  // бьём босса порциями, чтобы пройти все фазы
  for (let i = 0; i < 40; i++) {
    const left = await page.evaluate(() => {
      const g = window.__game.scene.game;
      g.player.invuln = 9999;
      const bosses = g.enemies.filter((e) => e.def.boss && !e.dead);
      for (const e of bosses) {
        if (e.spawn > 0 || e.mem.invuln > 0) continue;
        e.hp -= e.maxHp * 0.12;
        g.checkBossPhase(e);
        if (e.hp <= 0) g.killEnemy(e, true);
      }
      // призванные мелкие враги тоже мешают зачистке
      if (!bosses.length) for (const e of g.enemies) g.killEnemy(e, true);
      return g.enemies.length;
    });
    if (left === 0) break;
    await page.waitForTimeout(500);
    if (i === 6) await page.screenshot({ path: `${out}/boss-${floor}-phase.png` });
  }
  await page.waitForTimeout(600);
  // выбрать модификации, если накопились уровни
  for (let k = 0; k < 10; k++) {
    const busy = await page.evaluate(() => !!window.__game.scene.overlay);
    if (!busy) break;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(450);
  }
  const st = await page.evaluate(() => {
    const g = window.__game.scene.game;
    const tp = g.pickups.find((k) => k.kind === 'teleporter');
    const items = g.pickups.filter((k) => k.kind === 'item').length;
    if (tp) g.usePickup(tp);
    return { floor: g.floorNum, state: g.state, tp: !!tp, items, enemies: g.enemies.length };
  });
  console.log('floor', floor, JSON.stringify(st));
  await page.waitForTimeout(1200);
}
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/victory.png` });
const scene = await page.evaluate(() => window.__game.scene.constructor.name);
console.log('final scene', scene);
console.log('errors', JSON.stringify(errors.slice(0, 5)), errors.length);
await browser.close();
