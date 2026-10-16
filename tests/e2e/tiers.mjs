// Скриншоты всех 9 уровней (обычная комната + комната босса) для проверки графики ярусов.
// Использование: node tests/e2e/tiers.mjs <url> <outdir> [levels, напр. 1,3,9]
// Сохраняет <outdir>/tier-L<n>-room.png и tier-L<n>-boss.png (кадр мира 384×216, увеличенный ×3)
// и, если передан флаг --full, весь статичный слой комнаты: tier-L<n>-static.png.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? '.';
const levels = (process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : '1,2,3,4,5,6,7,8,9')
  .split(',').map(Number);
const full = process.argv.includes('--full');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
// пропустить заставку
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);

const save = (name, dataUrl) => writeFileSync(`${out}/${name}`, Buffer.from(dataUrl.split(',')[1], 'base64'));

// кадр мира (без HUD), увеличенный ×3 без сглаживания
const grabWorld = () => page.evaluate(() => {
  const w = window.__game.r.world;
  const c = document.createElement('canvas');
  c.width = w.width * 3;
  c.height = w.height * 3;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(w, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
});

for (const n of levels) {
  for (const kind of ['room', 'boss']) {
    const info = await page.evaluate(({ n, kind }) => {
      const g = window.__game.scene.game;
      g.startFloor(n);
      let r;
      const kindsIn = (q) => {
        const s = new Set();
        for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) s.add(g.room.get(x, y));
        return s;
      };
      if (kind === 'boss') r = g.plan.rooms[g.plan.exitId];
      else {
        // боевая комната с самым разнообразным набором тайлов
        let best = -1;
        for (const ri of g.plan.rooms.filter((q) => q.role === 'combat')) {
          const score = kindsIn(ri).size * 10 + ri.w * ri.h / 100;
          if (score > best) { best = score; r = ri; }
        }
      }
      g.enterRoom(r);
      g.player.invuln = 999;
      // обычная комната — у верхней стены (видны фасад, лампы и препятствия), босс — в центре
      const c = kind === 'boss' ? g.room.roomCenter(r) : { x: (r.x + Math.min(r.w / 2, 15)) * 16, y: (r.y + 5) * 16 };
      // ближайшая проходимая точка у центра
      const tx0 = Math.floor(c.x / 16), ty0 = Math.floor(c.y / 16);
      outer: for (let rad = 0; rad < 12; rad++) {
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          const t = g.room.get(tx0 + dx, ty0 + dy);
          if (t === 0 || t === 7) { c.x = (tx0 + dx + 0.5) * 16; c.y = (ty0 + dy + 0.5) * 16; break outer; }
        }
      }
      g.player.x = c.x;
      g.player.y = c.y;
      g.snapCamera();
      return { floor: n, room: r.role, size: `${r.w}x${r.h}`, tiles: [...kindsIn(r)].sort().join('') };
    }, { n, kind });
    await page.waitForTimeout(kind === 'boss' ? 2200 : 1500);
    await page.evaluate(() => { const g = window.__game.scene.game; g.player.invuln = 999; });
    save(`tier-L${n}-${kind}.png`, await grabWorld());
    if (kind === 'room' && info.tiles.includes('5')) {
      // кадр с активным электрополом
      await page.evaluate(() => { const g = window.__game.scene.game; g.electroT = 2.5; });
      await page.waitForTimeout(50);
      save(`tier-L${n}-zap.png`, await grabWorld());
    }
    if (full && kind === 'room') {
      save(`tier-L${n}-static.png`, await page.evaluate(() => {
        // статичный слой текущей комнаты, ×2
        const g = window.__game.scene.game;
        const r = g.zone;
        const c = document.createElement('canvas');
        c.width = r.w * 32;
        c.height = r.h * 32;
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = false;
        x.scale(2, 2);
        g.gfx.draw(x, r.x * 16, r.y * 16, r.w * 16, r.h * 16);
        return c.toDataURL('image/png');
      }));
    }
    console.log(JSON.stringify(info));
  }
}
// замер: среднее время кадра рендера на последнем уровне
const perf = await page.evaluate(async () => {
  const t0 = performance.now();
  let frames = 0;
  await new Promise((res) => {
    const f = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(); };
    requestAnimationFrame(f);
  });
  return Math.round((frames / (performance.now() - t0)) * 1000);
});
console.log('fps', perf);
console.log('errors', JSON.stringify(errors));
await browser.close();
