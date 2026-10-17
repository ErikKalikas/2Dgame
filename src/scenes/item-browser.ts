import { VIEW_W } from '../config';
import { tr, type L } from '../core/i18n';
import { input } from '../core/input';
import { icon } from '../gfx/icons';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import { kindLabel } from '../game/hud';
import type { ItemDef, SynergyDef } from '../game/items';
import { qualityColor } from '../game/render';
import { ENEMY_BY_ID } from '../content/enemies';

/** Предмет — «ядро набора» врага (три первых предмета: первая ступень синергии) */
function isCore(it: ItemDef): boolean {
  const d = it.fromEnemy ? ENEMY_BY_ID.get(it.fromEnemy)?.drops : undefined;
  return !!d && d.indexOf(it.id) >= 0 && d.indexOf(it.id) < 3;
}

/** Строка о наборе: «набор: Вахтёр · ядро набора» (для предмета) или ступень синергии */
function setLine(en: BrowserEntry): string | null {
  const enemy = en.item?.fromEnemy ?? en.synergy?.set;
  const def = enemy ? ENEMY_BY_ID.get(enemy) : undefined;
  if (!def) return null;
  const name = tr(def.name);
  if (en.item) return isCore(en.item) ? tr({ ru: `набор: ${name} · ядро набора`, en: `set: ${name} · set core` }) : tr({ ru: `набор: ${name}`, en: `set: ${name}` });
  return en.synergy!.tier === 1 ? tr({ ru: `набор: ${name} · ядро (3 предмета)`, en: `set: ${name} · core (3 items)` }) : tr({ ru: `набор: ${name} · весь набор`, en: `set: ${name} · full set` });
}

export interface BrowserEntry {
  item?: ItemDef;
  synergy?: SynergyDef;
  count?: number;
}

export interface BrowserTab {
  label: L;
  entries: BrowserEntry[];
}

const TAG_NAMES: Record<string, L> = {
  electric: { ru: 'электро', en: 'electric' },
  fire: { ru: 'огонь', en: 'fire' },
  smart: { ru: 'смарт', en: 'smart' },
  blade: { ru: 'клинок', en: 'blade' },
  heavy: { ru: 'тяжёлое', en: 'heavy' },
  mutation: { ru: 'мутация', en: 'mutation' },
  nano: { ru: 'нано', en: 'nano' },
  optic: { ru: 'оптика', en: 'optic' },
  neural: { ru: 'нейро', en: 'neural' },
  kinetic: { ru: 'кинетика', en: 'kinetic' },
  explosive: { ru: 'взрыв', en: 'explosive' },
  stealth: { ru: 'скрытность', en: 'stealth' },
};

/** Сетка предметов с вкладками и панелью описания (кодекс и экран снаряжения) */
export class ItemBrowser {
  tab = 0;
  index = 0;
  private scroll = 0;
  readonly cols = 8;
  readonly rows = 6;

  constructor(public tabs: BrowserTab[], public extra?: (r: Renderer, x: number, y: number, w: number) => void) {}

  update() {
    const tabs = this.tabs;
    if (input.codePressed('Tab') || input.codePressed('KeyQ') || input.codePressed('KeyE')) {
      const d = input.codePressed('KeyQ') ? -1 : 1;
      this.tab = (this.tab + d + tabs.length) % tabs.length;
      this.index = 0;
      this.scroll = 0;
    }
    const n = tabs[this.tab].entries.length;
    if (!n) return;
    if (input.repeat('menuLeft')) this.index = Math.max(0, this.index - 1);
    if (input.repeat('menuRight')) this.index = Math.min(n - 1, this.index + 1);
    if (input.repeat('menuUp')) this.index = Math.max(0, this.index - this.cols);
    if (input.repeat('menuDown')) this.index = Math.min(n - 1, this.index + this.cols);
    const row = Math.floor(this.index / this.cols);
    if (row < this.scroll) this.scroll = row;
    if (row >= this.scroll + this.rows) this.scroll = row - this.rows + 1;
  }

  render(r: Renderer, title: string) {
    const x0 = 16, y0 = 14, w = VIEW_W - 32, h = 188;
    r.panel(x0, y0, w, h);
    r.text(title, x0 + 8, y0 + 7, { size: 8, color: C.red });
    // вкладки
    let tx = x0 + 8;
    this.tabs.forEach((t, i) => {
      const label = `${tr(t.label)} ${t.entries.length}`;
      const tw = r.textWidth(label, 5) + 8;
      const sel = i === this.tab;
      r.rect(tx, y0 + 20, tw, 10, sel ? C.redD : C.dark, sel ? 0.8 : 0.6);
      r.text(label, tx + 4, y0 + 22, { size: 5, color: sel ? C.yellow : C.steelL });
      tx += tw + 3;
    });
    r.text('Tab/Q/E', x0 + w - 8, y0 + 22, { size: 5, color: C.steel, align: 'right' });

    const entries = this.tabs[this.tab].entries;
    const gx = x0 + 8, gy = y0 + 36, cell = 20;
    for (let i = this.scroll * this.cols; i < Math.min(entries.length, (this.scroll + this.rows) * this.cols); i++) {
      const c = i % this.cols, row = Math.floor(i / this.cols) - this.scroll;
      const x = gx + c * cell, y = gy + row * cell;
      const en = entries[i];
      const sel = i === this.index;
      r.rect(x, y, cell - 2, cell - 2, sel ? C.redD : C.black, sel ? 0.9 : 0.8);
      r.frame(x, y, cell - 2, cell - 2, en.item ? qualityColor(en.item.quality) : C.violet);
      if (en.item) r.sprite(icon(en.item.icon), x + 3, y + 3);
      else r.text('∞', x + 9, y + 5, { size: 6, color: C.violet, align: 'center' });
      // ядро набора — фиолетовая точка в углу
      if (en.item && isCore(en.item)) r.rect(x + cell - 5, y + 1, 2, 2, C.violet);
      if (en.count && en.count > 1) r.text('x' + en.count, x + cell - 3, y + cell - 8, { size: 4, color: C.yellow, align: 'right' });
    }
    if (!entries.length) r.text('—', gx + 4, gy + 4, { color: C.steel });

    // описание
    const dx = gx + this.cols * cell + 8, dw = x0 + w - dx - 8;
    const en = entries[this.index];
    if (en) {
      const name = en.item ? tr(en.item.name) : tr(en.synergy!.name);
      const desc = en.item ? tr(en.item.desc) : tr(en.synergy!.desc);
      const col = en.item ? qualityColor(en.item.quality) : C.violet;
      let y = gy;
      for (const line of r.wrap(name, dw, 6)) {
        r.text(line, dx, y, { size: 6, color: col });
        y += 9;
      }
      const set = setLine(en);
      if (set) {
        for (const line of r.wrap(set, dw, 5)) {
          r.text(line, dx, y, { size: 5, color: C.violet });
          y += 8;
        }
      }
      if (en.item) {
        r.text(kindLabel(en.item), dx, y, { size: 5, color: C.steelL });
        y += 9;
        if (en.item.unstable) {
          r.text(tr({ ru: `нестабильный · ${en.item.unstable}`, en: `unstable · ${en.item.unstable}` }), dx, y, { size: 5, color: C.violet });
          y += 9;
        }
        const tags = en.item.tags.map((t) => tr(TAG_NAMES[t])).join(' · ');
        if (tags) {
          r.text(tags, dx, y, { size: 5, color: C.amberD });
          y += 10;
        }
      }
      for (const line of r.wrap(desc, dw, 5)) {
        r.text(line, dx, y, { size: 5, color: C.grey });
        y += 8;
      }
    }
    this.extra?.(r, dx, y0 + h - 60, dw);
  }
}
