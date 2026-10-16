import { app, type Scene } from '../app';
import { VIEW_H, VIEW_W } from '../config';
import { S, tr } from '../core/i18n';
import { input } from '../core/input';
import { randomSeedString } from '../core/rng';
import { settings } from '../core/storage';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import { icon } from '../gfx/icons';
import { Game } from '../game/game';
import { INTRO } from '../game/log';
import { kindLabel, renderHud } from '../game/hud';
import { SYNERGIES, item, type ItemDef } from '../game/items';
import { qualityColor, renderGame as renderGameWorld } from '../game/render';
import { finalDamage, finalFireDelay } from '../game/stats';
import { EndScene } from './end';
import { ItemBrowser } from './item-browser';
import { MainMenu } from './main-menu';
import { Menu } from './menu-widget';
import { SettingsScene } from './settings';

/** Сцена забега: игра + наложенные окна (пауза, выбор модификации, снаряжение) */
export class GameScene implements Scene {
  game: Game;
  overlay: Scene | null = null;

  constructor(seed: string = randomSeedString()) {
    this.game = new Game(seed, settings.difficulty);
    this.overlay = new IntroOverlay(this);
  }

  update(dt: number) {
    const g = this.game;
    if (this.overlay) {
      this.overlay.update(dt);
      return;
    }
    // P — новый забег в новом мире (по ТЗ)
    if (input.pressed('restart')) {
      app.setScene(new GameScene());
      return;
    }
    if (input.pressed('pause') && g.state === 'play') {
      this.overlay = new PauseOverlay(this);
      return;
    }
    g.update(dt);
    if (g.state === 'play' && g.pendingLevelUps > 0 && g.fade >= 1) {
      const choices = g.rollPassives();
      if (choices.length) this.overlay = new LevelUpOverlay(this, choices);
      else g.pendingLevelUps = 0;
    }
    if (g.state === 'dead') app.setScene(new EndScene(g, false));
    if (g.state === 'won' && g.stateT > 2.5) app.setScene(new EndScene(g, true));
  }

  renderBase(r: Renderer) {
    r.beginFrame();
    renderGameWorld(this.game, r);
    r.present();
    renderHud(this.game, r);
  }

  render(r: Renderer) {
    this.renderBase(r);
    this.overlay?.render(r);
  }
}

// ---------------------------------------------------------------------------

/** Заставка в начале забега: строки терминала печатаются по буквам, любая клавиша — пропуск */
class IntroOverlay implements Scene {
  private t = 0;

  constructor(private gs: GameScene) {}

  update(dt: number) {
    this.t += dt;
    if (this.t > 0.3 && input.anyPressed()) this.gs.overlay = null;
  }

  render(r: Renderer) {
    r.rect(0, 0, VIEW_W, VIEW_H, C.void, 1);
    const lines = INTRO.map((l) => tr(l));
    let left = Math.floor(this.t * 40);
    const x = 24, y0 = 52;
    lines.forEach((l, i) => {
      if (left <= 0) return;
      const shown = l.slice(0, left);
      left -= l.length + 12;
      const last = i === lines.length - 1 || i === 4;
      const ly = y0 + i * 18;
      r.wrap(shown, VIEW_W - 2 * x, 6).forEach((w, j) => r.text(w, x, ly + j * 8, { size: 6, color: last ? C.red : C.bone }));
    });
    if (left > 0 && Math.floor(this.t * 2) % 2 === 0)
      r.text(tr({ ru: 'любая клавиша', en: 'press any key' }), VIEW_W - 12, VIEW_H - 14, { size: 5, color: C.steel, align: 'right' });
  }
}

class PauseOverlay implements Scene {
  private menu: Menu;
  private sub: Scene | null = null;

  constructor(private gs: GameScene) {
    const base = { render: (r: Renderer) => gs.renderBase(r), update: () => {} };
    this.menu = new Menu([
      { label: () => tr(S.resume), onSelect: () => (gs.overlay = null) },
      { label: () => tr(S.loadout), onSelect: () => (this.sub = new LoadoutOverlay(gs, () => (this.sub = null))) },
      { label: () => tr(S.settings), onSelect: () => (this.sub = new SettingsScene(() => (this.sub = null), base, false)) },
      { label: () => tr(S.restart), onSelect: () => app.setScene(new GameScene()) },
      { label: () => tr(S.mainMenu), onSelect: () => app.setScene(new MainMenu()) },
    ]);
  }

  update(dt: number) {
    if (this.sub) return this.sub.update(dt);
    if (input.pressed('pause')) {
      this.gs.overlay = null;
      return;
    }
    this.menu.update();
  }

  render(r: Renderer) {
    if (this.sub) return this.sub.render(r);
    r.rect(0, 0, VIEW_W, VIEW_H, C.void, 0.65);
    r.panel(VIEW_W / 2 - 90, 50, 180, 112);
    r.text(tr(S.paused), VIEW_W / 2, 60, { size: 10, color: C.red, align: 'center' });
    this.menu.render(r, VIEW_W / 2, 82, 15, 160);
    r.text(`${tr(S.seed)}: ${this.gs.game.seed}`, VIEW_W / 2, 168, { size: 5, color: C.steelL, align: 'center' });
    r.text(tr(S.controls), VIEW_W / 2, 200, { size: 4, color: C.steel, align: 'center' });
  }
}

// ---------------------------------------------------------------------------

class LevelUpOverlay implements Scene {
  private index = 0;
  private t = 0;

  constructor(private gs: GameScene, private choices: ItemDef[]) {}

  update(dt: number) {
    this.t += dt;
    if (input.repeat('menuLeft')) this.index = 0;
    if (input.repeat('menuRight')) this.index = Math.min(this.choices.length - 1, 1);
    if (input.codePressed('Digit1')) this.pick(0);
    if (input.codePressed('Digit2') && this.choices.length > 1) this.pick(1);
    if (this.t > 0.35 && input.pressed('confirm')) this.pick(this.index);
  }

  private pick(i: number) {
    this.gs.game.choosePassive(this.choices[i]);
    this.gs.overlay = null;
  }

  render(r: Renderer) {
    r.rect(0, 0, VIEW_W, VIEW_H, C.void, 0.7);
    r.text(tr(S.levelUp), VIEW_W / 2, 30, { size: 12, color: C.red, align: 'center' });
    r.text(tr(S.chooseOne), VIEW_W / 2, 48, { size: 6, color: C.grey, align: 'center' });
    const cw = 150, ch = 120, gap = 14;
    const x0 = (VIEW_W - (cw * this.choices.length + gap * (this.choices.length - 1))) / 2;
    this.choices.forEach((it, i) => {
      const x = x0 + i * (cw + gap), y = 62;
      const sel = i === this.index;
      const col = qualityColor(it.quality);
      r.panel(x, y - (sel ? 3 : 0), cw, ch, sel ? C.red : C.metal, sel ? 0.97 : 0.85);
      if (sel) r.frame(x, y - 3, cw, ch, C.redD);
      r.sprite(icon(it.icon), x + cw / 2 - 12, y + 8 - (sel ? 3 : 0), 2);
      let yy = y + 38;
      for (const line of r.wrap(tr(it.name), cw - 12, 6)) {
        r.text(line, x + cw / 2, yy, { size: 6, color: col, align: 'center' });
        yy += 9;
      }
      const stacks = this.gs.game.player.passives.get(it.id) ?? 0;
      r.text(kindLabel(it) + (it.maxStacks && it.maxStacks > 1 ? ` ${stacks + 1}/${it.maxStacks}` : ''), x + cw / 2, yy, { size: 5, color: C.steelL, align: 'center' });
      yy += 10;
      for (const line of r.wrap(tr(it.desc), cw - 14, 5)) {
        r.text(line, x + cw / 2, yy, { size: 5, color: C.grey, align: 'center' });
        yy += 8;
      }
      r.text(`[${i + 1}]`, x + cw / 2, y + ch - 12, { size: 5, color: sel ? C.yellow : C.steel, align: 'center' });
    });
  }
}

// ---------------------------------------------------------------------------

class LoadoutOverlay implements Scene {
  private browser: ItemBrowser;

  constructor(private gs: GameScene, private onBack: () => void) {
    const p = gs.game.player;
    this.browser = new ItemBrowser(
      [
        {
          label: S.implants,
          entries: [
            { item: p.weapon },
            ...(p.activeId ? [{ item: item(p.activeId) }] : []),
            ...p.implants.map((id) => ({ item: item(id) })),
          ],
        },
        { label: S.passives, entries: [...p.passives].map(([id, n]) => ({ item: item(id), count: n })) },
        { label: S.synergies, entries: p.synergies.map((s) => ({ synergy: s })) },
      ],
      (r, x, y) => {
        const s = p.stats;
        const lines = [
          `${tr({ ru: 'Урон', en: 'Damage' })} ${finalDamage(s).toFixed(1)}`,
          `${tr({ ru: 'Выстр/с', en: 'Shots/s' })} ${(1 / finalFireDelay(s)).toFixed(1)}`,
          `${tr({ ru: 'Скорость', en: 'Speed' })} ${Math.round(s.speed)}`,
          `${tr({ ru: 'Дальность', en: 'Range' })} ${Math.round(s.range)}`,
        ];
        lines.forEach((l, i) => r.text(l, x, y + i * 8, { size: 5, color: C.steelL }));
        r.text(`${tr(S.synergies)}: ${p.synergies.length}/${SYNERGIES.length}`, x, y + 36, { size: 5, color: C.violet });
      },
    );
  }

  update() {
    if (input.pressed('back')) return this.onBack();
    this.browser.update();
  }

  render(r: Renderer) {
    this.gs.renderBase(r);
    r.rect(0, 0, VIEW_W, VIEW_H, C.void, 0.7);
    this.browser.render(r, tr(S.loadout));
  }
}
