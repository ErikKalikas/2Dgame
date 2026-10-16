import type { Scene } from '../app';
import { VIEW_H, VIEW_W } from '../config';
import { S, tr } from '../core/i18n';
import { input } from '../core/input';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import { SYNERGIES, itemsOfKind, type ItemKind } from '../game/items';
import { ItemBrowser } from './item-browser';
import { bg } from './shared';

/** Кодекс: все предметы игры (по ТЗ все открыты сразу) */
export class CodexScene implements Scene {
  private browser: ItemBrowser;

  constructor(private onBack: () => void) {
    const byQuality = (...kinds: ItemKind[]) =>
      kinds.flatMap((kind) => itemsOfKind(kind))
        .sort((a, b) => a.quality - b.quality)
        .map((item) => ({ item }));
    this.browser = new ItemBrowser([
      { label: S.weapon, entries: byQuality('weapon') },
      { label: S.implants, entries: byQuality('implant') },
      { label: S.body, entries: byQuality('skeleton', 'backpack') },
      { label: S.passives, entries: byQuality('passive') },
      { label: S.synergies, entries: SYNERGIES.map((synergy) => ({ synergy })) },
    ]);
  }

  update(dt: number) {
    bg.update(dt);
    if (input.pressed('back')) return this.onBack();
    this.browser.update();
  }

  render(r: Renderer) {
    r.beginFrame();
    bg.render(r.ctx);
    r.present();
    r.rect(0, 0, VIEW_W, VIEW_H, C.void, 0.5);
    this.browser.render(r, tr(S.codex));
  }
}
