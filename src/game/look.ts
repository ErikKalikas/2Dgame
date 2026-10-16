import { ANCHOR, LOOKS } from '../gfx/art/looks';
import { Grid } from '../gfx/art/pix';
import { playerRows, type PlayerDir } from '../gfx/art/player';
import { flipH, type Sprite } from '../gfx/sprite';
import type { Facing, Player } from './player';
import { item, type Slot } from './items';

// Спрайт Т-417 с деталями установленных модулей. Собирается из строк базового кадра,
// поверх кладутся рисунки модулей в точки крепления, затем общая обводка. Кэш по набору модулей.

const cache = new Map<string, Sprite>();

/** Отключённая нестабильная деталь тускнеет: каждый цвет палитры — на ступень темнее */
const DIM: Record<string, string> = { 0: '0', 1: '0', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '8', 9: '8', a: '9', b: 'a', c: 'c', d: 'c', e: 'd', f: '9' };
const dimRows = (rows: string[]) => rows.map((row) => row.replace(/[0-9a-f]/g, (ch) => DIM[ch] ?? ch));

function compose(dir: PlayerDir, frame: number, mods: [Slot | 'skeleton', string][], off: Set<string> = new Set()): Sprite {
  const g = Grid.of(playerRows(dir, frame));
  for (const [slot, id] of mods) {
    const look = LOOKS[id];
    const at = ANCHOR[slot][dir];
    if (!look || !at) continue;
    const rows = dir === 'up' ? look.up === undefined ? look.p : look.up : dir === 'side' ? look.side === undefined ? look.p : look.side : look.p;
    if (!rows || !rows.length) continue;
    const x = at[0] + (look.dx ?? 0), y = at[1] + (look.dy ?? 0);
    const draw = off.has(id) ? dimRows(rows) : rows;
    g.rows(draw, x, y);
    // ноги: та же деталь на второй ноге (вид спереди и сзади)
    if (slot === 'legs' && dir !== 'side') g.rows(draw, x + 4, y);
  }
  g.outline(0);
  return g.toSprite();
}

/** Кадр игрока с модулями. facing — как у Player, frame — 0 (стоит) или 1–2 (шаг) */
export function playerLook(p: Player, facing: Facing, frame: number): Sprite {
  const mods: [Slot | 'skeleton', string][] = Object.entries(p.slots).filter(([, id]) => !!id) as [Slot, string][];
  if (p.skeleton !== 'skWorker') mods.push(['skeleton', p.skeleton]);
  const dir: PlayerDir = facing === 'down' ? 'down' : facing === 'up' ? 'up' : 'side';
  const off = [...p.disabled.keys()].sort().join(',');
  const key = `${facing}:${frame}:${mods.map(([s, id]) => s + '=' + id).sort().join(',')}:${off}`;
  let s = cache.get(key);
  if (!s) {
    s = compose(dir, frame, mods, new Set(p.disabled.keys()));
    if (facing === 'left') s = flipH(s);
    cache.set(key, s);
  }
  return s;
}

/** Для тестов и листа спрайтов: кадр с одним модулем */
export function lookWith(id: string, facing: Facing): Sprite {
  const it = item(id);
  const slot = it.kind === 'skeleton' ? 'skeleton' : it.slot!;
  const dir: PlayerDir = facing === 'down' ? 'down' : facing === 'up' ? 'up' : 'side';
  return compose(dir, 0, [[slot, id]]);
}
