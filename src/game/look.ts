import { ANCHOR, LOOKS } from '../gfx/art/looks';
import { Grid } from '../gfx/art/pix';
import { playerRows, type PlayerDir } from '../gfx/art/player';
import { flipH, type Sprite } from '../gfx/sprite';
import type { Facing, Player } from './player';
import { item, type Slot } from './items';

// Спрайт Т-417 с деталями установленных модулей. Собирается из строк базового кадра,
// поверх кладутся рисунки модулей в точки крепления, затем общая обводка. Кэш по набору модулей.

const cache = new Map<string, Sprite>();

function compose(dir: PlayerDir, frame: number, mods: [Slot | 'skeleton', string][]): Sprite {
  const g = Grid.of(playerRows(dir, frame));
  for (const [slot, id] of mods) {
    const look = LOOKS[id];
    const at = ANCHOR[slot][dir];
    if (!look || !at) continue;
    const rows = dir === 'up' ? look.up === undefined ? look.p : look.up : dir === 'side' ? look.side === undefined ? look.p : look.side : look.p;
    if (!rows || !rows.length) continue;
    const x = at[0] + (look.dx ?? 0), y = at[1] + (look.dy ?? 0);
    g.rows(rows, x, y);
    // ноги: та же деталь на второй ноге (вид спереди и сзади)
    if (slot === 'legs' && dir !== 'side') g.rows(rows, x + 4, y);
  }
  g.outline(0);
  return g.toSprite();
}

/** Кадр игрока с модулями. facing — как у Player, frame — 0 (стоит) или 1–2 (шаг) */
export function playerLook(p: Player, facing: Facing, frame: number): Sprite {
  const mods: [Slot | 'skeleton', string][] = Object.entries(p.slots).filter(([, id]) => !!id) as [Slot, string][];
  if (p.skeleton !== 'skWorker') mods.push(['skeleton', p.skeleton]);
  const dir: PlayerDir = facing === 'down' ? 'down' : facing === 'up' ? 'up' : 'side';
  const key = `${facing}:${frame}:${mods.map(([s, id]) => s + '=' + id).sort().join(',')}`;
  let s = cache.get(key);
  if (!s) {
    s = compose(dir, frame, mods);
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
