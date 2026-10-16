// Этап 11: тело, рюкзак, скелет, операционная, рука-оружие, модули левой руки, системы, взлом двери.
// Использование: node tests/e2e/body.mjs <url> <папка для скриншотов>
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

const start = await ev(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.invuln = 9999;
  return { sk: p.skeleton, bp: p.backpack.length, size: p.backpackSize, surgery: g.plan.rooms.filter((r) => r.type === 'surgery').length };
});
check('старт: рабочий скелет, пустой рюкзак на 3', start.sk === 'skWorker' && start.bp === 0 && start.size === 3, JSON.stringify(start));
check('на уровне есть операционная', start.surgery === 1);

// подбор модуля кладёт его в рюкзак, а не ставит
const pick = await ev(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  g.acquire(window.__items.item('iFalconOptics'), p.x, p.y);
  return { bp: p.backpack.slice(), head: p.slots.head ?? null };
});
check('модуль попадает в рюкзак', pick.bp.includes('iFalconOptics') && !pick.head, JSON.stringify(pick));

// полный рюкзак → окно выбора
await ev(() => {
  const g = window.__game.scene.game;
  const p = g.player;
  p.backpack.push('iRearCam', 'iServoAnkles');
  const it = window.__items;
  g.pickups.push({ kind: 'item', x: p.x, y: p.y, vx: 0, vy: 0, t: 1, itemId: 'smartlink' });
});
await page.waitForTimeout(100);
await page.keyboard.press('KeyR');
await page.waitForTimeout(200);
check('полный рюкзак открывает окно выбора', await ev(() => window.__game.scene.overlay?.constructor.name === 'BackpackFullOverlay'));
await page.screenshot({ path: `${out}/backpack-full.png` });
await page.keyboard.press('Enter'); // выбросить первый
await page.waitForTimeout(200);
const bp2 = await ev(() => window.__game.scene.game.player.backpack.slice());
check('выброшен старый, взят новый', bp2.includes('smartlink') && !bp2.includes('iFalconOptics') && bp2.length === 3, JSON.stringify(bp2));

// правила установки (через модуль операций)
const rules = await ev(async () => {
  const g = window.__game.scene.game;
  const p = g.player;
  const S = await import('/src/game/surgery.ts');
  const I = window.__items;
  const res = {};
  res.q3 = S.installBlock(g, I.item('iReactiveArmor'))?.ru ?? null; // редкость 3 при скелете 1
  res.sys = S.installBlock(g, I.item('iAdrenalPump'))?.ru ?? null; // система закрыта
  p.backpack = ['skLoader'];
  S.install(g, 0);
  res.sk = p.skeleton;
  p.backpack = ['iReactiveArmor', 'iFlashEmitter', 'iMagPulse'];
  S.install(g, 0);
  S.install(g, 0);
  res.active = p.activeId;
  res.second = S.installBlock(g, I.item('iMagPulse'))?.ru ?? null; // второй активный
  return res;
});
check('редкость выше класса скелета запрещена', !!rules.q3, rules.q3);
check('закрытая система запрещена', !!rules.sys, rules.sys);
check('скелет класса 3 ставится', rules.sk === 'skLoader');
check('активный модуль из слота работает на Q', rules.active === 'iFlashEmitter');
check('второй активный модуль запрещён', !!rules.second, rules.second);

// рука-оружие
const arm = await ev(async () => {
  const g = window.__game.scene.game;
  const p = g.player;
  const S = await import('/src/game/surgery.ts');
  const dmg0 = p.stats.damageMult;
  p.backpack = ['wPowerFist'];
  const before = g.pickups.length;
  S.install(g, 0);
  const res = { weapon: p.weapon.id, dropped: g.pickups.length - before, mult: p.stats.damageMult / dmg0 };
  // ручное оружие не берётся
  const k = { kind: 'item', x: p.x, y: p.y, vx: 0, vy: 0, t: 1, itemId: 'smg' };
  g.pickups.push(k);
  g.usePickup(k);
  res.tookSmg = p.weapon.id === 'smg';
  S.remove(g, 'armR');
  res.after = p.weapon.id;
  return res;
});
check('рука-оружие заменяет оружие, ручное падает на пол', arm.weapon === 'wPowerFist' && arm.dropped === 1, JSON.stringify(arm));
check('рука-оружие: урон +25%', Math.abs(arm.mult - 1.25) < 0.01, arm.mult.toFixed(3));
check('с рукой-оружием ручное оружие не берётся', !arm.tookSmg);
check('сняли руку-оружие — снова клепальный пистолет', arm.after === 'pistol');

// модули левой руки: каждый срабатывает на E без ошибок
const lh = ['iShockPalm', 'lhShield', 'lhHarpoon', 'lhBlade', 'lhPistol', 'lhMagnet', 'lhWeldWall', 'lhClamp'];
for (const id of lh) {
  await ev((id) => {
    const g = window.__game.scene.game;
    const p = g.player;
    p.slots.armL = id;
    p.weapon = window.__items.item('pistol');
    p.recalc();
    p.shoveCd = 0;
    p.facing = 'right';
    const M = window.__enemies;
    g.enemies.length = 0;
    const e = new M.Enemy(M.ENEMIES[0], p.x + 16, p.y, 10);
    e.spawn = 0;
    g.enemies.push(e);
    g.ebullets.push({ x: p.x + 12, y: p.y, angle: Math.PI, speed: 0, r: 2, skin: 'small', color: 'red', life: 9, t: 0, accel: 0, turn: 0, minSpeed: 0, maxSpeed: 600, delay: 0, homing: 0, bounces: 0, dead: false });
  }, id);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(120);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(80);
  const r = await ev(() => {
    const g = window.__game.scene.game;
    const p = g.player;
    const e = g.enemies[0];
    return { cd: p.shoveCd, hp: e ? e.hp < e.maxHp : true, eb: g.ebullets.length, pb: g.pbullets.length, wall: g.barriers.length, shield: p.shieldUp };
  });
  const acted = r.cd > 0 || r.shield > 0 || r.hp || r.eb === 0 || r.pb > 0 || r.wall > 0;
  check(`левая рука: ${id}`, acted, JSON.stringify(r));
}
await page.screenshot({ path: `${out}/lefthand.png` });

// системы тела открываются боссом 2-го уровня
const sys = await ev(() => {
  const g = window.__game.scene.game;
  g.enemies.length = 0;
  g.startFloor(2);
  g.player.invuln = 9999;
  const boss = g.plan.rooms[g.plan.bossId];
  g.enterRoom(boss, null);
  for (const e of g.enemies) { e.spawn = 0; g.killEnemy(e, true); }
  return null;
});
await page.waitForTimeout(400);
const sys2 = await ev(() => [...window.__game.scene.game.player.systems]);
check('босс 2-го уровня открывает кровеносную систему', sys2.includes('blood'), JSON.stringify(sys2));

// запертая сокровищница: взлом удержанием R
const hack = await ev(() => {
  const g = window.__game.scene.game;
  const room = g.plan.rooms.find((r) => r.doors.some((d) => d.locked));
  if (!room) return { skip: true };
  g.enterRoom(room, null);
  g.enemies.length = 0;
  room.cleared = true;
  const d = g.room.doors.find((d) => d.locked);
  const T = 16;
  g.player.x = (d.tx + (d.dir === 'n' || d.dir === 's' ? 1 : 0.5)) * T + (d.dir === 'w' ? 18 : d.dir === 'e' ? -18 : 0);
  g.player.y = (d.ty + (d.dir === 'w' || d.dir === 'e' ? 1 : 0.5)) * T + (d.dir === 'n' ? 18 : d.dir === 's' ? -18 : 0);
  g.snapCamera();
  return { dir: d.dir };
});
if (!hack.skip) {
  await page.keyboard.down('KeyR');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/hack.png` });
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyR');
  const opened = await ev(() => !window.__game.scene.game.room.doors.some((d) => d.locked));
  check('взлом двери удержанием R', opened);
} else console.log('SKIP взлом: нет запертой двери');

console.log('errors', JSON.stringify(errors.slice(0, 5)), errors.length);
await browser.close();
if (fails.length || errors.length) process.exit(1);
