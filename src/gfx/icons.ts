import type { IconSpec } from '../game/items';
import { C } from './palette';
import { canvas, ctx2d, type Sprite } from './sprite';

// Иконки предметов 12×12. x — основной цвет, a — акцент, w — блик, d — тёмный контур.
const SHAPES: Record<string, string[]> = {
  pistol: [
    '', '', '..dddddddd', '.dxxxxxxwxd', '.dxxxxxxxxd', '.ddddxxdddd', '....dxad', '....dxxd', '....dddd',
  ],
  smg: [
    '', '.dddddddddd', 'dxxxxxxxwxxd', 'dxxaxxxxxxxd', 'ddddxxdxdddd', '...dxxdxd', '...dxxdxd', '...dddddd',
  ],
  shotgun: [
    '', '', 'dddddddddddd', 'dwxxxxxxxxxd', 'dxxxxxxxaaad', 'ddddddxxdddd', '.....dxxd', '.....dxxd', '.....dddd',
  ],
  rifle: [
    '', '', '.ddddddddddd', 'dxxxxxxxxxwd', 'dxxxaxxxxxxd', 'ddxddxxddddd', '.dxd.dxd', '.dxd.dad', '.ddd.ddd',
  ],
  sniper: [
    '', '...dddd', '...daad', 'dddddddddddd', 'dxxxxxxxxxwd', 'ddddxxdddddd', '...dxxd', '...dxxd', '...dddd',
  ],
  laser: [
    '', '..ddddddd', '.dxxxxxxxd', 'dxxaaaaaxxdd', 'dxxxxxxxxxwa', 'dxxaaaaaxxdd', '.dxxdddxxd', '.dxxd.dxxd', '.dddd.dddd',
  ],
  flame: [
    '.....aa', '....awa', '...aaxa', '...axxa', '..axxxa', '.dddddddd', 'dxxxxxxxxd', 'dxxxxxxxxd', '.dddxxddd', '...dxxd', '...dddd',
  ],
  rocket: [
    '', '..dddddddd', '.dxxxxxxxxdd', 'daxxxxxxxxwa', 'daxxxxxxxxwa', '.dxxxxxxxxdd', '..dddxxdddd', '....dxxd', '....dddd',
  ],
  blade: [
    '..........dw', '.........dwd', '........dwd', '.......dwd', '......dwd', '.....dwd', '..d.dwd', '..dddd', '..dad', '.dad', 'dad', 'dd',
  ],
  whip: [
    '', '...aaa', '..a...a', '.a.....a', '.a......a', '..a......a', '...dd....a', '..dxxd...a', '..dxxd..a', '..dxxd.a', '..dddd',
  ],
  orb: [
    '', '...dddddd', '..dxxxxxxd', '.dxxwwxxxxd', '.dxwaaxxxxd', '.dxxaaxxxxd', '.dxxxxxxxxd', '.dxxxxxxxxd', '..dxxxxxxd', '...dddddd',
  ],
  chip: [
    '..d.d.d.d', '.ddddddddd', 'ddxxxxxxxdd', '.dxaaaaaxd', 'ddxa...axdd', '.dxa.w.axd', 'ddxa...axdd', '.dxaaaaaxd', 'ddxxxxxxxdd', '.ddddddddd', '..d.d.d.d',
  ],
  eye: [
    '', '', '...dddddd', '.ddxxxxxxdd', 'dxxxddddxxxd', 'dxxdaawdxxxd', 'dxxdaaadxxxd', 'dxxxddddxxxd', '.ddxxxxxxdd', '...dddddd',
  ],
  arm: [
    '....dddd', '...dxxxxd', '...dxwxxd', '...dxxxxd', '...ddaadd', '...dxxxxd', '...dxxxxd', '..dxxxxxxd', '..dxdxdxxd', '..dxdxdxd', '...ddddd',
  ],
  leg: [
    '...dddd', '...dxwxd', '...dxxxd', '...daaad', '...dxxxd', '...dxxxd', '...dxxxd', '...daaad', '...dxxxdd', '...dxxxxxd', '...ddddddd',
  ],
  heart: [
    '', '.ddd..ddd', 'dxxxddxwxd', 'dxxxxxxxxd', 'dxxxxxxxxd', '.dxxxxxxd', '..dxxxxd', '...dxxd', '....dd',
  ],
  brain: [
    '', '..dddddd', '.dxxaxxxd', 'dxaxxxaxxd', 'dxxxaxxxad', 'dxaxxxaxxd', 'dxxxaxxxxd', '.dxxxxaxd', '..ddxxdd', '....daad', '....dd',
  ],
  spine: [
    '....dd', '...dwxd', '....dd', '...dxxd', '....dd', '...daad', '....dd', '...dxxd', '....dd', '...dxxd', '....dd',
  ],
  skull: [
    '', '..dddddd', '.dxxxxxxd', 'dxxxxxxwxd', 'dxddxxddxd', 'dxdaxxdaxd', 'dxxxddxxxd', '.dxxxxxxd', '..dxdxdxd', '..dddddd',
  ],
  battery: [
    '....dddd', '..dddxxddd', '..dxxxxxxd', '..dxaaaaxd', '..dxxxxxxd', '..dxaaaaxd', '..dxxxxxxd', '..dxaaaaxd', '..dxxxxxxd', '..dddddddd',
  ],
  drone: [
    '', 'ddd....ddd', '.dwd..dwd', '..dddddd', '..dxxxxd', '.dxxaaxxd', '.dxxaaxxd', '..dxxxxd', '..dddddd', '.dxd..dxd', 'ddd....ddd',
  ],
  shield: [
    '..dddddddd', '.dxxxxxxwxd', '.dxxxaaxxxd', '.dxxaaaaxxd', '.dxxxaaxxxd', '.dxxxxxxxxd', '..dxxxxxxd', '...dxxxxd', '....dxxd', '.....dd',
  ],
  syringe: [
    '.........dd', '........dwd', '.......dxd', '......daad', '.....daad', '....daad', '...dxxd', '..dxxd', '.ddd', 'dd', 'd',
  ],
  dna: [
    '.dd....dd', '..dxd.dxd', '...daad', '...daad', '..dxd.dxd', '.dd....dd', '..dxd.dxd', '...daad', '...daad', '..dxd.dxd', '.dd....dd',
  ],
  gear: [
    '....dd', '..d.dxd.d', '.dxdxxdxd', '..dxxxxd', 'ddxxaaxxdd', 'dxxxa.axxd', 'ddxxaaxxdd', '..dxxxxd', '.dxdxxdxd', '..d.dxd.d', '....dd',
  ],
  lightning: [
    '......dddd', '.....dxxd', '....dxxd', '...dxxd', '..dxxxxxdd', '..ddddxxd', '....dxxd', '...dxad', '..dad', '.dad', '.dd',
  ],
  fire: [
    '....d', '...dad', '...daxd', '..daxxd.d', '.daxxxdad', '.daxxxxaxd', 'daxxwxxaxd', 'daxwwxxxad', 'daxxwxxxad', '.daxxxxad', '..dddddd',
  ],
  crosshair: [
    '.....dd', '.....aa', '...dddddd', '..dd.aa.dd', '..d..aa..d', 'aaaaa..aaaaa', 'aaaaa..aaaaa', '..d..aa..d', '..dd.aa.dd', '...dddddd', '.....aa', '.....dd',
  ],
  core: [
    '....dddd', '..ddxxxxdd', '.dxxaaaaxxd', '.dxaawwaaxd', 'dxxawwwwaxxd', 'dxxawwwwaxxd', '.dxaawwaaxd', '.dxxaaaaxxd', '..ddxxxxdd', '....dddd',
  ],
  claw: [
    'd...d...d', 'dw..dw..dw', 'dx..dx..dx', 'dxd.dxd.dxd', '.dxddxddxd', '.dxxxxxxxd', '.dxxaaxxxd', '.dxxxxxxxd', '..dxxxxxd', '..ddddddd',
  ],
  mask: [
    '', '.dddddddddd', 'dxxxxxxxxxxd', 'dxaaaxxaaaxd', 'dxxaaxxaaxxd', 'dxxxxxxxxxxd', '.dxxxddxxxd', '.dxdxdxdxd', '..dddddddd',
  ],
  mutation: [
    '...dd..dd', '..daad.dad', '..daxxdxad', '.daxxxxxad', 'daxxwxxxxd', 'dxxxxxxaxd', '.dxxaxxxxd', '.daxxxxad', '..ddaxxdd', '...daadd', '....dd',
  ],
  wave: [
    '', '', 'da.....da', 'dxa...dxa', '.dxa.dxa.dxa', '..dxdxa...dxa', '...dda.....dd', '', '',
  ],
  disc: [
    '', '...dddddd', '..dxxxxxxd', '.dxwxxxxxxd', '.dxxxddxxxd', '.dxxdaadxxd', '.dxxxddxxxd', '.dxxxxxxxxd', '..dxxxxxxd', '...dddddd',
  ],
  bomb: [
    '.......dad', '......dd', '...dddd', '..dxxxxd', '.dxwxxxxd', '.dxxxxxxd', '.dxxaaxxd', '.dxxxxxxd', '..dxxxxd', '...dddd',
  ],
  coil: [
    '...dddddd', '..daaaaaad', '...dxxxxd', '..daaaaaad', '...dxxxxd', '..daaaaaad', '...dxxxxd', '..daaaaaad', '...dxxxxd', '....dddd',
  ],
  cloak: [
    '....dddd', '...dxxxxd', '..dxxwxxxd', '..dxaaaaxd', '.dxxxxxxxxd', '.dxxxxxxxxd', 'dxxxxxxxxxxd', 'dxdxxxxxxdxd', 'dd.dxxxxd.dd', '...dddddd',
  ],
};

const cache = new Map<string, Sprite>();

export function iconShapes(): string[] {
  return Object.keys(SHAPES);
}

export function icon(spec: IconSpec): Sprite {
  const key = spec.shape + spec.color + (spec.accent ?? '');
  let s = cache.get(key);
  if (s) return s;
  const rows = SHAPES[spec.shape] ?? SHAPES.chip;
  s = canvas(12, 12);
  const x = ctx2d(s);
  const accent = spec.accent ?? C.yellow;
  rows.forEach((row, y) => {
    for (let i = 0; i < row.length && i < 12; i++) {
      const ch = row[i];
      const col = ch === 'x' ? spec.color : ch === 'a' ? accent : ch === 'w' ? C.bone : ch === 'd' ? C.void : null;
      if (col) {
        x.fillStyle = col;
        x.fillRect(i, y, 1, 1);
      }
    }
  });
  cache.set(key, s);
  return s;
}
