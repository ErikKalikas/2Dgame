// Лист спрайтов: игрок, все враги и боссы ×4 на тёмном фоне.
// Использование: node tests/e2e/sprites.mjs <url> <out.png> [scale]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'sprites.png';
const scale = Number(process.argv[4] ?? 4);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(1000);
const dataUrl = await page.evaluate(async (S) => {
  const m = await import('/src/gfx/sprites.ts');
  const e = await import('/src/content/enemies.ts');
  const b = await import('/src/content/bosses.ts');
  m.initSprites();
  const W = 1400;
  const groups = [];
  const P = m.SPR.player;
  groups.push({ name: 'player', frames: [...P.down, ...P.up, ...P.right, ...P.left] });
  for (const d of e.ENEMIES) groups.push({ name: `${d.id} r${d.r}`, frames: d.frames(), r: d.r });
  const bossStart = groups.length;
  for (const d of b.BOSSES) groups.push({ name: `${d.id} r${d.r}`, frames: d.frames(), r: d.r });
  // раскладка «строками»
  const pad = 10;
  let x = pad, y = 30, rowH = 0;
  const place = [];
  groups.forEach((g, gi) => {
    const label = `${g.name} [${g.frames.map((f) => f.width + 'x' + f.height).join(' ')}]`;
    const gw = Math.max(g.frames.reduce((s, f) => s + f.width * S + 6, 0), label.length * 6.7) + 14;
    const gh = Math.max(...g.frames.map((f) => f.height)) * S + 18;
    if (x + gw > W || gi === bossStart || gi === 1) {
      x = pad;
      y += rowH + 8;
      rowH = 0;
    }
    place.push({ g, x, y });
    x += gw;
    rowH = Math.max(rowH, gh);
  });
  const H = y + rowH + 20 + 140;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x2 = c.getContext('2d');
  x2.imageSmoothingEnabled = false;
  x2.fillStyle = '#141418';
  x2.fillRect(0, 0, W, H);
  x2.font = '11px monospace';
  for (const { g, x, y } of place) {
    x2.fillStyle = '#8c8c9a';
    x2.fillText(`${g.name} [${g.frames.map((f) => f.width + 'x' + f.height).join(' ')}]`, x, y + 10);
    let fx = x;
    for (const f of g.frames) {
      x2.fillStyle = '#1c1415';
      x2.fillRect(fx, y + 14, f.width * S, f.height * S);
      x2.drawImage(f, fx, y + 14, f.width * S, f.height * S);
      fx += f.width * S + 6;
    }
  }
  // натуральный размер ×2 на полу (как в игре)
  let fx = pad, fy = H - 130;
  x2.fillStyle = '#121216';
  x2.fillRect(0, fy - 10, W, 140);
  for (const g of groups) {
    const f = g.frames[0];
    if (fx + f.width * 2 > W) { fx = pad; fy += 60; }
    x2.drawImage(f, fx, fy, f.width * 2, f.height * 2);
    fx += f.width * 2 + 8;
  }
  return c.toDataURL('image/png');
}, scale);
const fs = await import('node:fs');
fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('saved', out, 'errors', JSON.stringify(errors));
await browser.close();
