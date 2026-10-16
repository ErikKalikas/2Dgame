import { app, isElectron, type Scene } from '../app';
import { VIEW_H, VIEW_W } from '../config';
import { S, tr } from '../core/i18n';
import { input } from '../core/input';
import { normalizeSeed, randomSeedString } from '../core/rng';
import { settings } from '../core/storage';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import { CodexScene } from './codex';
import { GameScene } from './game-scene';
import { Menu } from './menu-widget';
import { SettingsScene } from './settings';
import { bg } from './shared';

export class MainMenu implements Scene {
  private menu: Menu;
  private t = 0;

  constructor() {
    this.menu = new Menu([
      { label: () => tr(S.newGame), onSelect: () => app.setScene(new GameScene()) },
      { label: () => tr(S.seedRun), onSelect: () => app.setScene(new SeedScene()) },
      { label: () => tr(S.codex), onSelect: () => app.setScene(new CodexScene(() => app.setScene(new MainMenu()))) },
      { label: () => tr(S.settings), onSelect: () => app.setScene(new SettingsScene(() => app.setScene(new MainMenu()))) },
      { label: () => tr(S.quit), onSelect: () => window.close(), hidden: () => !isElectron },
    ]);
  }

  update(dt: number) {
    this.t += dt;
    bg.update(dt);
    this.menu.update();
  }

  render(r: Renderer) {
    r.beginFrame();
    bg.render(r.ctx);
    r.present();
    // заголовок с лёгким "глитчем"
    const gl = Math.sin(this.t * 13) > 0.97 ? 2 : 0;
    if (gl) r.text(tr(S.title), VIEW_W / 2 + gl, 31, { size: 22, color: C.violet, align: 'center', shadow: null, alpha: 0.6 });
    r.text(tr(S.title), VIEW_W / 2, 30, { size: 22, color: C.red, align: 'center' });
    r.text(tr(S.subtitle), VIEW_W / 2, 58, { size: 6, color: C.amber, align: 'center' });
    r.rect(VIEW_W / 2 - 110, 92, 220, 82, C.void, 0.55);
    this.menu.render(r, VIEW_W / 2, 100, 15, 200);
    r.text(`${tr(S.difficulty)}: ${tr(settings.difficulty === 'normal' ? S.diffNormal : S.diffHard)}`, VIEW_W / 2, 182, {
      size: 5, color: C.steelL, align: 'center',
    });
    r.text(tr(S.controls), VIEW_W / 2, VIEW_H - 12, { size: 4, color: C.steel, align: 'center' });
  }
}

/** Ввод seed для повторяемого забега */
class SeedScene implements Scene {
  private text = randomSeedString();

  update(dt: number) {
    bg.update(dt);
    if (input.pressed('pause')) return app.setScene(new MainMenu());
    for (const ch of input.typed) this.text = normalizeSeed(this.text + ch);
    if (input.codeRepeat('Backspace')) this.text = this.text.slice(0, -1);
    if (input.codePressed('Enter') && this.text.length) app.setScene(new GameScene(this.text));
  }

  render(r: Renderer) {
    r.beginFrame();
    bg.render(r.ctx);
    r.present();
    r.rect(0, 0, VIEW_W, VIEW_H, C.void, 0.5);
    r.panel(VIEW_W / 2 - 100, 70, 200, 70);
    r.text(tr(S.enterSeed), VIEW_W / 2, 80, { size: 7, color: C.red, align: 'center' });
    const cursor = Math.floor(performance.now() / 400) % 2 ? '_' : ' ';
    r.text(this.text + cursor, VIEW_W / 2, 100, { size: 10, color: C.yellow, align: 'center' });
    r.text('Enter — ' + tr(S.start) + ' · Esc — ' + tr(S.back), VIEW_W / 2, 124, { size: 5, color: C.steelL, align: 'center' });
  }
}
