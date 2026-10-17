// Этап 12б: каждый предмет из наборов врагов — и каждый набор целиком (с синергиями) — в бою
// с отрисовкой: стрельба, рывки, E, Q, F, фокус. Ловит ошибки выполнения.
// Использование: node tests/e2e/sets.mjs <url> <папка для скриншотов>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const ev = (fn, arg) => page.evaluate(fn, arg);

await page.goto(url);
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.keyboard.press('Enter'); // заставка
await page.waitForTimeout(300);

const sets = await ev(() => {
  const { ENEMIES } = window.__enemies;
  const I = window.__items;
  return ENEMIES.filter((e) => !e.boss && e.drops).map((e) => ({ id: e.id, items: e.drops.filter((id) => I.ITEMS.has(id)) })).filter((s) => s.items.length);
});

/** Снаряжение: только эти предметы (оружие — в руку, модули — в слоты, прошивки — сразу) */
const loadout = (ids) => ev((ids) => {
  const g = window.__game.scene.game;
  const I = window.__items;
  window.__game.scene.overlay = null;
  const p = g.player;
  for (const k of Object.keys(p.slots)) delete p.slots[k];
  p.passives.clear();
  p.buffs.clear();
  p.weapon = I.item('pistol');
  for (const s of ['blood', 'tentacles', 'nervous', 'reactor']) p.systems.add(s);
  for (const id of ids) {
    const it = I.item(id);
    if (it.kind === 'weapon') p.weapon = it;
    else if (it.kind === 'implant') {
      p.slots[it.slot] = id;
      if (it.weapon) p.weapon = it;
    } else p.passives.set(id, 1);
  }
  p.recalc();
  p.lives = p.stats.maxLives;
  p.invuln = 9999;
  p.activeCd = p.shoveCd = p.dashCd = 0;
  p.glitch = 1;
  g.pendingLevelUps = 0;
  // свежая боевая комната с врагами
  const room = g.plan.rooms.find((r) => r.role === 'combat' && r !== g.zone) ?? g.plan.rooms.find((r) => r.role === 'combat');
  room.visited = false;
  room.cleared = false;
  g.enterRoom(room);
  const { Enemy, ENEMIES } = window.__enemies;
  for (const [id, dx, dy] of [['punk', 50, -30], ['scav', 60, 30], ['drone', -50, -20], ['guard', -60, 30], ['turret', 0, -60]]) {
    const e = new Enemy(ENEMIES.find((d) => d.id === id), p.x + dx, p.y + dy, 1);
    e.spawn = 0;
    g.enemies.push(e);
  }
  return p.synergies.filter((s) => s.set).map((s) => s.id);
}, ids);

/** Бой: стрельба по кругу, рывки, левая рука, активный, сбой, фокус */
async function fight(ms) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    // окно нового уровня ставит игру на паузу — закрываем
    await ev(() => {
      const sc = window.__game.scene;
      sc.game.pendingLevelUps = 0;
      sc.overlay = null;
      sc.game.player.invuln = 9999;
    });
    const k = keys[i % 4];
    await page.keyboard.down(k);
    await page.keyboard.down(i % 2 ? 'KeyD' : 'KeyA');
    if (i % 3 === 0) await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(140);
    await page.keyboard.press('Space');
    await page.waitForTimeout(60);
    await page.keyboard.press(['KeyE', 'KeyQ', 'KeyF'][i % 3]);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up(i % 2 ? 'KeyD' : 'KeyA');
    await page.keyboard.up(k);
    i++;
  }
}

let tested = 0;
for (const s of sets) {
  for (const id of s.items) {
    await loadout([id]);
    await fight(500);
    tested++;
  }
  const syn = await loadout(s.items);
  await fight(1600);
  console.log(`${s.id}: ${s.items.length} предм., синергии: ${syn.join(', ') || '—'}`);
  await page.screenshot({ path: `${out}/set-${s.id}.png` });
}
const st = await ev(() => {
  const g = window.__game.scene.game;
  return { pb: g.pbullets.length, eb: g.ebullets.length, objs: g.objs.length, state: g.state };
});
console.log('tested', tested, 'sets', sets.length, JSON.stringify(st));
console.log('errors', errors.length, JSON.stringify(errors.slice(0, 4)));
await browser.close();
if (errors.length) process.exit(1);
