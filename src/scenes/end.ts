import { app, type Scene } from '../app';
import { VIEW_H, VIEW_W } from '../config';
import { S, tr } from '../core/i18n';
import { input } from '../core/input';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import type { Game } from '../game/game';
import { GameScene } from './game-scene';
import { MainMenu } from './main-menu';
import { Menu } from './menu-widget';
import { bg } from './shared';

/** Экран поражения или победы со статистикой забега */
export class EndScene implements Scene {
  private menu: Menu;
  private t = 0;

  constructor(private g: Game, private won: boolean) {
    this.menu = new Menu([
      { label: () => tr(S.restart), onSelect: () => app.setScene(new GameScene()) },
      { label: () => tr(S.mainMenu), onSelect: () => app.setScene(new MainMenu()) },
    ]);
  }

  update(dt: number) {
    this.t += dt;
    bg.update(dt);
    if (input.pressed('restart')) return app.setScene(new GameScene());
    if (this.t > 0.6) this.menu.update();
  }

  render(r: Renderer) {
    r.beginFrame();
    bg.render(r.ctx);
    r.present();
    r.rect(0, 0, VIEW_W, VIEW_H, this.won ? C.void : C.blood, this.won ? 0.55 : 0.55);
    const g = this.g, p = g.player;
    const title = this.won ? tr(S.victory) : tr(S.gameOver);
    const glitch = !this.won && Math.random() < 0.08 ? (Math.random() - 0.5) * 4 : 0;
    r.text(title, VIEW_W / 2 + glitch, 34, { size: 14, color: this.won ? C.yellow : C.red, align: 'center' });
    if (this.won) r.text(tr(S.victoryText), VIEW_W / 2, 56, { size: 6, color: C.bone, align: 'center' });

    r.panel(VIEW_W / 2 - 100, 70, 200, 70);
    const min = Math.floor(g.playTime / 60), sec = Math.floor(g.playTime % 60);
    const rows: [string, string][] = [
      [tr(S.floor), `${g.floorNum} · ${tr(g.theme.name)}`],
      [tr(S.level), String(p.level)],
      [tr(S.kills), String(p.kills)],
      [tr(S.time), `${min}:${String(sec).padStart(2, '0')}`],
      [tr(S.seed), g.seed],
      [tr(S.difficulty), tr(g.hard ? S.diffHard : S.diffNormal)],
    ];
    rows.forEach(([k, v], i) => {
      r.text(k, VIEW_W / 2 - 92, 77 + i * 10, { size: 5, color: C.steelL });
      r.text(v, VIEW_W / 2 + 92, 77 + i * 10, { size: 5, color: C.bone, align: 'right' });
    });
    this.menu.render(r, VIEW_W / 2, 152, 15, 170);
  }
}
