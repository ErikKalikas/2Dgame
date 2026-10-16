import { input } from '../core/input';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';

export interface MenuItem {
  label: () => string;
  /** Значение справа (для настроек) */
  value?: () => string;
  onSelect?: () => void;
  /** Изменение значения стрелками влево/вправо */
  onChange?: (dir: number) => void;
  hidden?: () => boolean;
}

/** Вертикальное меню с навигацией стрелками */
export class Menu {
  index = 0;
  constructor(public items: MenuItem[]) {}

  private visible(): MenuItem[] {
    return this.items.filter((i) => !i.hidden?.());
  }

  update() {
    const items = this.visible();
    if (input.repeat('menuUp')) this.index = (this.index - 1 + items.length) % items.length;
    if (input.repeat('menuDown')) this.index = (this.index + 1) % items.length;
    const cur = items[this.index];
    if (!cur) return;
    if (cur.onChange) {
      if (input.repeat('menuLeft')) cur.onChange(-1);
      if (input.repeat('menuRight')) cur.onChange(1);
    }
    if (input.pressed('confirm')) {
      if (cur.onSelect) cur.onSelect();
      else cur.onChange?.(1);
    }
  }

  render(r: Renderer, cx: number, y: number, gap = 14, width = 200) {
    const items = this.visible();
    items.forEach((it, i) => {
      const sel = i === this.index;
      const yy = y + i * gap;
      if (sel) {
        r.rect(cx - width / 2, yy - 3, width, 13, C.redD, 0.45);
        r.rect(cx - width / 2, yy - 3, 2, 13, C.red);
      }
      const col = sel ? C.yellow : C.grey;
      if (it.value) {
        r.text(it.label(), cx - width / 2 + 8, yy, { color: col });
        r.text((sel ? '< ' : '') + it.value() + (sel ? ' >' : ''), cx + width / 2 - 8, yy, {
          color: sel ? C.bone : C.steelL,
          align: 'right',
        });
      } else {
        r.text(it.label(), cx, yy, { color: col, align: 'center' });
      }
    });
  }
}
