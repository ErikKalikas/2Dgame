// Механики этапа 10: заставка, сбой (заряд пролётами, F, переписывание пуль, аварийное окно),
// толчок на E, двуручное оружие, R — взаимодействие, лог Диспетчера.
// Использование: node tests/e2e/glitch.mjs <url> <папка для скриншотов>
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

await page.goto(url);
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
check('заставка показана', await page.evaluate(() => window.__game.scene.overlay?.constructor.name === 'IntroOverlay'));
await page.screenshot({ path: `${out}/intro.png` });
await page.keyboard.press('KeyX');
await page.waitForTimeout(200);
check('заставка пропущена любой клавишей', await page.evaluate(() => !window.__game.scene.overlay));

const st0 = await page.evaluate(() => {
  const g = window.__game.scene.game;
  return { glitch: g.player.glitch, log: g.logLines.length };
});
check('сбой полный в начале уровня', st0.glitch === 1);
check('лог: начало уровня', st0.log >= 1);

// заряд пролётами: пули вплотную мимо хитбокса
const graze = await page.evaluate(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.glitch = 0;
  p.invuln = 0;
  for (let i = 0; i < 10; i++) {
    g.ebullets.push({ x: p.x + 9, y: p.y, angle: Math.PI / 2, speed: 0, r: 2, skin: 'small', color: 'red', life: 9, t: 0, accel: 0, turn: 0, minSpeed: 0, maxSpeed: 600, delay: 0, homing: 0, bounces: 0, dead: false });
  }
  return null;
});
await page.waitForTimeout(150);
const charged = await page.evaluate(() => {
  const g = window.__game.scene.game;
  const v = g.player.glitch;
  g.ebullets.length = 0;
  return v;
});
check('пролёты вплотную заряжают сбой', charged > 0.1 && charged < 0.5, `заряд ${charged.toFixed(3)} за 10 пуль`);

// F при полном заряде: сбой и переписывание пуль
await page.evaluate(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.glitch = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.ebullets.push({ x: p.x + Math.cos(a) * 40, y: p.y + Math.sin(a) * 40, angle: a + Math.PI, speed: 20, r: 3, skin: 'orb', color: 'red', life: 9, t: 0, accel: 0, turn: 0, minSpeed: 0, maxSpeed: 600, delay: 0, homing: 0, bounces: 0, dead: false });
  }
});
await page.keyboard.press('KeyF');
await page.waitForTimeout(120);
const gl = await page.evaluate(() => {
  const g = window.__game.scene.game;
  return { t: g.player.glitchT, charge: g.player.glitch, eb: g.ebullets.length, pb: g.pbullets.length, lives: g.player.lives };
});
await page.screenshot({ path: `${out}/glitch.png` });
check('F запускает сбой', gl.t > 1.5 && gl.charge === 0, JSON.stringify(gl));
check('пули в радиусе переписаны', gl.eb === 0 && gl.pb >= 12, JSON.stringify(gl));
await page.waitForTimeout(2100);

// аварийный сбой: попадание при полном заряде → окно 0,15 с
const lives0 = await page.evaluate(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.glitch = 1;
  p.invuln = 0;
  g.hurtPlayer();
  return { lives: p.lives, pending: p.pendingHit };
});
check('попадание при заряде открывает аварийное окно', lives0.pending > 0, JSON.stringify(lives0));
await page.keyboard.press('KeyF');
await page.waitForTimeout(100);
const emerg = await page.evaluate(() => {
  const g = window.__game.scene.game;
  return { lives: g.player.lives, glitchT: g.player.glitchT, log: g.logLines.map((l) => l.text.ru) };
});
check('F в окне отменяет попадание', emerg.lives === lives0.lives && emerg.glitchT > 0, JSON.stringify(emerg));
await page.waitForTimeout(2100);

// без F окно истекает и жизнь теряется
const lost = await page.evaluate(async () => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.glitch = 1;
  p.invuln = 0;
  const before = p.lives;
  g.hurtPlayer();
  await new Promise((r) => setTimeout(r, 300));
  return { before, after: p.lives };
});
check('без F жизнь теряется', lost.after === lost.before - 1, JSON.stringify(lost));

// толчок на E отбрасывает врага; с двуручным оружием недоступен
const kb = await page.evaluate(async () => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.invuln = 9999;
  const mod = window.__enemies;
  const e = new mod.Enemy(mod.ENEMIES[0], p.x + 14, p.y, 10);
  e.spawn = 0;
  g.enemies.push(e);
  const x0 = e.x;
  g.shove(0);
  return { x0, kx: e.kx };
});
check('толчок отбрасывает врага', kb.kx > 50, JSON.stringify(kb));
const twoHand = await page.evaluate(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  g.enemies.length = 0;
  p.weapon = window.__items.item('wMinigun');
  p.recalc();
  p.shoveCd = 0;
  return p.twoHanded;
});
await page.keyboard.press('KeyE');
await page.waitForTimeout(100);
const cd2 = await page.evaluate(() => window.__game.scene.game.player.shoveCd);
check('двуручное оружие блокирует E', twoHand && cd2 === 0);
await page.evaluate(() => {
  const g = window.__game.scene.game;
  g.player.weapon = window.__items.item('pistol');
  g.player.recalc();
});
await page.keyboard.press('KeyE');
await page.waitForTimeout(100);
const cd1 = await page.evaluate(() => window.__game.scene.game.player.shoveCd);
check('одноручное: E работает', cd1 > 0);

await page.screenshot({ path: `${out}/hud.png` });
console.log('errors', JSON.stringify(errors.slice(0, 5)), errors.length);
await browser.close();
if (fails.length || errors.length) process.exit(1);
