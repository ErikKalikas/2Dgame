// Этап 12а: дроп с врагов (набор, защита от невезения, ячейки за собранный набор), метки и «Сканер»,
// нестабильность (отключение по таблице, бой, конец уровня, оружие), помехи и бонусы, новые имена, смерти.
// Использование: node tests/e2e/drops.mjs <url> <папка для скриншотов>
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

// тестовые предметы: один предмет набора Падальщика и нестабильные прошивки
await ev(() => {
  const I = window.__items;
  const cores = I.item('heavyRounds');
  I.registerItems([
    ...[1, 2, 3, 4].map((n) => ({ ...cores, id: 'pTestUnstable' + n, unstable: 2, name: { ru: 'Тест: нестаб ' + n, en: 'Test unstable ' + n } })),
  ]);
  const g = window.__game.scene.game;
  g.player.invuln = 9999;
});

const names = await ev(() => Object.fromEntries(window.__enemies.ENEMIES.filter((e) => ['punk', 'guard', 'netrunner', 'flamer', 'gekko'].includes(e.id)).map((e) => [e.id, e.name.ru])));
check('враги переименованы', names.punk === 'Трубач' && names.guard === 'Вахтёр' && names.netrunner === 'Мигун' && names.flamer === 'Кочегар' && names.gekko === 'Прыгун «Блоха»', JSON.stringify(names));

// дроп: защита от невезения доводит шанс до 100% → выпадает единственный существующий предмет набора
const spawn = (id, dx = 40) => ev(([id, dx]) => {
  const g = window.__game.scene.game;
  const { Enemy, ENEMIES } = window.__enemies;
  const e = new Enemy(ENEMIES.find((d) => d.id === id), g.player.x + dx, g.player.y, 1);
  e.spawn = 0;
  g.enemies.push(e);
  return g.enemies.length - 1;
}, [id, dx]);

await spawn('scav');
await page.waitForTimeout(100);
const marks = await ev(async () => {
  const g = window.__game.scene.game;
  const D = await import('/src/game/drops.ts');
  return { open: D.hasOpenSet(g, g.enemies.at(-1).def), chance: g.drops.chance(g.enemies.at(-1).def, 0, false) };
});
check('над Падальщиком есть метка набора, шанс 15%', marks.open && Math.abs(marks.chance - 0.15) < 1e-9, JSON.stringify(marks));

// «Сканер утильщика» в голове: шанс +20% и подпись над врагом
await ev(() => {
  const p = window.__game.scene.game.player;
  p.slots.head = 'iScrapScanner';
  p.recalc();
});
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/drops-scanner.png` });

const drop = await ev(() => {
  const g = window.__game.scene.game;
  g.drops.misses.set('scav', 1000);
  const e = g.enemies.at(-1);
  e.hp = 0;
  g.killEnemy(e, true);
  const set = ['wScavHook', 'iScavLegs', 'iScavCrate'];
  const it = g.pickups.find((k) => k.kind === 'item' && set.includes(k.itemId));
  return { dropped: !!it, seen: !!it && g.seenItems.has(it.itemId), misses: g.drops.misses.get('scav') };
});
check('с врага выпал предмет его набора, счётчик невезения сброшен', drop.dropped && drop.seen && drop.misses === 0, JSON.stringify(drop));

await spawn('scav');
const cells = await ev(() => {
  const g = window.__game.scene.game;
  const before = g.pickups.filter((k) => k.kind === 'coin').length;
  const e = g.enemies.at(-1);
  for (const id of ['wScavHook', 'iScavLegs', 'iScavCrate']) g.seenItems.add(id);
  // набор собран: дроп всегда «успешен» при 100%, но выпадает горсть ячеек
  const D = g.drops;
  const orig = D.chance.bind(D);
  D.chance = () => 1;
  e.hp = 0;
  g.killEnemy(e, true);
  D.chance = orig;
  return g.pickups.filter((k) => k.kind === 'coin').length - before;
});
check('собранный набор даёт горсть энергоячеек', cells >= 3, `ячеек: ${cells}`);

// смерти робота и киборга не ломают игру
await spawn('drone');
await spawn('punk', -40);
await ev(() => {
  const g = window.__game.scene.game;
  for (const e of g.enemies.slice(-2)) {
    e.hp = 0;
    g.killEnemy(e, true);
  }
});
await page.waitForTimeout(60);
await page.screenshot({ path: `${out}/drops-deaths.png` });

// нестабильность: 2 прошивки × 2 очка = уровень 2 → при потере жизни отключается одна
const unst = await ev(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.passives.set('pTestUnstable1', 1);
  p.passives.set('pTestUnstable2', 1);
  p.recalc();
  p.lives = 4;
  g.loseLife();
  const [id, d] = [...p.disabled.entries()][0] ?? [];
  return { size: p.disabled.size, id, mode: d?.mode, t: d?.t, has: id ? p.has(id) : null, log: g.logLines.at(-1)?.text.ru };
});
check('потеря жизни отключает нестабильный предмет (уровень 2)', unst.size === 1 && unst.has === false && ['timed', 'combat'].includes(unst.mode), JSON.stringify(unst));
check('в логе Диспетчера строка об отключении', /Несовместимость/.test(unst.log ?? ''), unst.log);
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/drops-unstable.png` });

const timed = await ev(async () => {
  const g = window.__game.scene.game;
  const p = g.player;
  g.enemies.length = 0;
  for (const d of p.disabled.values()) d.t = 0.05;
  await new Promise((r) => setTimeout(r, 300));
  return p.disabled.size;
});
check('отключение заканчивается (таймер и «до конца боя» без врагов)', timed === 0, `осталось: ${timed}`);

const level = await ev(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.disabled.set('pTestUnstable1', { mode: 'level', t: 5 });
  p.recalc();
  const before = p.disabled.size;
  g.startFloor(2);
  return { before, after: p.disabled.size };
});
check('отключение «до конца уровня» снимается на новом уровне', level.before === 1 && level.after === 0, JSON.stringify(level));

const gun = await ev(() => {
  const p = window.__game.scene.game.player;
  p.weapon = window.__items.item('shotgun');
  p.disabled.set(p.weapon.id, { mode: 'timed', t: 3 });
  p.recalc();
  const res = { gun: p.gun.id, weapon: p.weapon.id };
  p.disabled.delete(p.weapon.id);
  p.recalc();
  return res;
});
check('отключённое оружие заменяет клепальный пистолет', gun.gun === 'pistol' && gun.weapon !== 'pistol', JSON.stringify(gun));

// уровень 4 (8 очков): бонусы в бою и помехи интерфейса
await spawn('turret', 70);
const fx = await ev(async () => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.passives.set('pTestUnstable3', 1);
  p.passives.set('pTestUnstable4', 1);
  p.recalc();
  g.unstable.bonusT = 0;
  g.unstable.hudNext = 0;
  p.glitch = 0;
  await new Promise((r) => setTimeout(r, 120));
  return { bonus: g.unstable.doubleT > 0 || p.glitch > 0, hud: g.unstable.hudGlitch > 0 || g.unstable.hudNext > 2 };
});
check('уровень 4: случайный бонус в бою и помеха интерфейса', fx.bonus && fx.hud, JSON.stringify(fx));
await page.screenshot({ path: `${out}/drops-level4.png` });

await page.keyboard.down('ArrowRight');
await page.waitForTimeout(400);
await page.keyboard.up('ArrowRight');
check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
if (fails.length) {
  console.log(`\nПровалено: ${fails.length}`);
  process.exit(1);
}
console.log('\nВсе проверки этапа 12а пройдены');
