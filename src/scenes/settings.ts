import { applyFullscreen, type Scene } from '../app';
import { VIEW_W } from '../config';
import { S, tr } from '../core/i18n';
import { input } from '../core/input';
import { saveSettings, settings } from '../core/storage';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import { Menu } from './menu-widget';
import { bg } from './shared';

/** Экран настроек. Может открываться из главного меню и из паузы (тогда под ним рисуется игра). */
export class SettingsScene implements Scene {
  private menu: Menu;

  constructor(
    private onBack: () => void,
    private under?: Scene,
    private allowDifficulty = true,
  ) {
    this.menu = new Menu([
      {
        label: () => tr(S.language),
        value: () => (settings.lang === 'ru' ? 'Русский' : 'English'),
        onChange: () => {
          settings.lang = settings.lang === 'ru' ? 'en' : 'ru';
          saveSettings();
        },
      },
      {
        label: () => tr(S.difficulty),
        value: () => tr(settings.difficulty === 'normal' ? S.diffNormal : S.diffHard),
        onChange: () => {
          settings.difficulty = settings.difficulty === 'normal' ? 'hard' : 'normal';
          saveSettings();
        },
        hidden: () => !this.allowDifficulty,
      },
      {
        label: () => tr(S.fullscreen),
        value: () => tr(settings.fullscreen ? S.on : S.off),
        onChange: () => {
          settings.fullscreen = !settings.fullscreen;
          applyFullscreen(settings.fullscreen);
          saveSettings();
        },
      },
      {
        label: () => tr(S.setMarkers),
        value: () => tr(settings.setMarkers ? S.on : S.off),
        onChange: () => {
          settings.setMarkers = !settings.setMarkers;
          saveSettings();
        },
      },
      {
        label: () => tr(S.instabilityFx),
        value: () => tr(settings.instabilityFx ? S.on : S.off),
        onChange: () => {
          settings.instabilityFx = !settings.instabilityFx;
          saveSettings();
        },
      },
      { label: () => tr(S.back), onSelect: () => this.onBack() },
    ]);
  }

  update(dt: number) {
    if (input.pressed('back')) {
      this.onBack();
      return;
    }
    this.menu.update();
    if (!this.under) bg.update(dt);
  }

  render(r: Renderer) {
    if (this.under) this.under.render(r);
    else {
      bg.render(r.ctx);
      r.present();
    }
    r.rect(0, 0, VIEW_W, 216, C.void, 0.6);
    r.panel(VIEW_W / 2 - 120, 36, 240, 150);
    r.text(tr(S.settings), VIEW_W / 2, 46, { align: 'center', color: C.red, size: 10 });
    this.menu.render(r, VIEW_W / 2, 70, 16, 220);
    r.text(tr(S.menuHint), VIEW_W / 2, 196, { align: 'center', color: C.steelL, size: 5 });
  }
}
