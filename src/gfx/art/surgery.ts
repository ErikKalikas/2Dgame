import type { Sprite } from '../sprite';
import { DARK, GREY, METAL, R_METAL, STEEL, boss, rivet } from './bosses';

// Операционная: кресло подпольного хирурга и над ним робот-хирург на потолочной штанге
// с пучком щупалец-инструментов (сварка, захват, игла, резак). Два кадра — щупальца покачиваются.

export const SURGERY_W = 40;
export const SURGERY_H = 44;

export function surgeryArt(): Sprite[] {
  return [0, 1].map((f) =>
    boss(SURGERY_W, SURGERY_H, ({ g, M, F, S }) => {
      const sw = f ? 1 : -1;
      // штанга к потолку и корпус робота
      F(M().rect(18, 0, 4, 6), DARK);
      F(M().rect(12, 5, 16, 7), STEEL);
      g.rect(13, 6, 14, 1, 5);
      S(M().ellipse(20, 12, 4, 3), R_METAL);
      // щупальца с инструментами
      const arms: [number, number, number, number][] = [
        [14, 11, 6 + sw, 22], [18, 12, 15 - sw, 25], [22, 12, 25 + sw, 25], [26, 11, 34 - sw, 22],
      ];
      for (const [x0, y0, x1, y1] of arms) F(M().bez(x0, y0, (x0 + x1) / 2 + sw * 2, y0 + 10, x1, y1, 1.8, 8), METAL);
      // кресло: подголовник, спинка, сиденье, подлокотники, опора
      F(M().rect(16, 21, 8, 4), GREY);
      F(M().rect(13, 24, 14, 10), [3, 4, 2, 1]);
      g.rect(15, 26, 10, 1, 9);
      g.rect(15, 29, 10, 1, 9);
      F(M().rect(10, 32, 20, 4), STEEL);
      F(M().rect(9, 29, 3, 6), DARK);
      F(M().rect(28, 29, 3, 6), DARK);
      F(M().rect(18, 36, 4, 5), DARK);
      F(M().rect(13, 40, 14, 3), METAL);
      rivet(g, 11, 33, 6, 3);
      rivet(g, 28, 33, 6, 3);
    }, ({ g }) => {
      // наконечники инструментов: искра сварки, игла, захват, резак
      const sw = f ? 1 : -1;
      g.light(6 + sw, 23, 14, 13);
      g.set(15 - sw, 26, 7);
      g.set(25 + sw, 26, 6);
      g.set(34 - sw, 23, 10);
      // глаз-камера робота
      g.set(20, 12, f ? 11 : 10);
    }),
  );
}
