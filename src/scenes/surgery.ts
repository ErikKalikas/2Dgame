import type { Scene } from '../app';
import { VIEW_H, VIEW_W } from '../config';
import { tr, type L } from '../core/i18n';
import { input } from '../core/input';
import { icon } from '../gfx/icons';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import { kindLabel } from '../game/hud';
import { BODY_SLOTS, SLOT_NAME, SYSTEM_SLOTS, item, type ItemDef, type Slot } from '../game/items';
import type { Pickup } from '../game/spawn';
import { qualityColor } from '../game/render';
import { dropFromBackpack, install, installBlock, remove } from '../game/surgery';
import { playerLook } from '../game/look';
import type { GameScene } from './game-scene';

// Окно операционной: схема тела слева, рюкзак справа, описание внизу.
// Каждая операция проигрывает короткую анимацию (кресло, щупальца робота-хирурга, искры).

type BodyKey = Slot | 'skeleton';
const BODY_ORDER: BodyKey[] = [...BODY_SLOTS, 'skeleton', ...SYSTEM_SLOTS];

/** Где на схеме рисуется ячейка слота (центр фигуры — x 96, y 90) */
const CELL: Record<BodyKey, [number, number]> = {
  head: [86, 30], armL: [44, 66], armR: [128, 66], torso: [44, 96], back: [128, 96], legs: [86, 132],
  skeleton: [12, 132], blood: [20, 168], tentacles: [58, 168], nervous: [96, 168], reactor: [134, 168],
};
/** Точка на теле, куда тянется линия от ячейки (и где искрит при операции) */
const BODY_PT: Record<BodyKey, [number, number]> = {
  head: [96, 62], armL: [86, 84], armR: [106, 84], torso: [96, 84], back: [100, 78], legs: [96, 104],
  skeleton: [96, 92], blood: [92, 86], tentacles: [100, 76], nervous: [96, 66], reactor: [96, 88],
};

const SKELETON_NAME: L = { ru: 'Скелет', en: 'Frame' };
/** Короткие подписи под ячейками схемы */
const SHORT: Partial<Record<Slot, L>> = {
  armL: { ru: 'Левая', en: 'Left' },
  armR: { ru: 'Правая', en: 'Right' },
  blood: { ru: 'Кровь', en: 'Blood' },
  tentacles: { ru: 'Щупальца', en: 'Tentacle' },
  nervous: { ru: 'Нервы', en: 'Nerves' },
};

export class SurgeryOverlay implements Scene {
  /** 0 — тело, 1 — рюкзак */
  private col = 0;
  private bi = 0;
  private pi = 0;
  private msg: { text: L; t: number } | null = null;
  /** Анимация операции: куда (точка на теле) и сколько прошло */
  private anim: { key: BodyKey; t: number } | null = null;

  constructor(private gs: GameScene) {
    if (gs.game.player.backpack.length) this.col = 1;
  }

  private get p() {
    return this.gs.game.player;
  }

  update(dt: number) {
    if (this.msg) {
      this.msg.t -= dt;
      if (this.msg.t <= 0) this.msg = null;
    }
    if (this.anim) {
      this.anim.t += dt;
      if (this.anim.t >= ANIM_TIME || (this.anim.t > 0.15 && input.anyPressed())) this.anim = null;
      return;
    }
    const p = this.p;
    if (input.pressed('back')) {
      this.gs.overlay = null;
      return;
    }
    if (input.repeat('menuLeft')) this.col = 0;
    if (input.repeat('menuRight') && p.backpack.length) this.col = 1;
    const n = this.col ? p.backpack.length : BODY_ORDER.length;
    if (input.repeat('menuUp')) this.move(-1, n);
    if (input.repeat('menuDown')) this.move(1, n);
    if (this.col === 1 && !p.backpack.length) this.col = 0;
    this.pi = Math.min(this.pi, Math.max(0, p.backpack.length - 1));

    if (input.pressed('confirm')) {
      if (this.col === 1) {
        const id = p.backpack[this.pi];
        if (!id) return;
        const it = item(id);
        const why = installBlock(this.gs.game, it);
        if (why) return void (this.msg = { text: why, t: 2 });
        const key: BodyKey = it.kind === 'skeleton' ? 'skeleton' : it.slot!;
        install(this.gs.game, this.pi);
        this.anim = { key, t: 0 };
        this.col = 0;
        this.bi = BODY_ORDER.indexOf(key);
      } else {
        const key = BODY_ORDER[this.bi];
        if (key === 'skeleton') return void (this.msg = { text: { ru: 'Скелет меняется на другой из рюкзака', en: 'A frame can only be swapped for another' }, t: 2 });
        if (!p.slots[key]) return;
        remove(this.gs.game, key);
        this.anim = { key, t: 0 };
      }
    }
    if (input.codePressed('KeyX') && this.col === 1 && p.backpack[this.pi]) {
      dropFromBackpack(this.gs.game, this.pi);
      this.msg = { text: { ru: 'Выброшено на пол', en: 'Dropped on the floor' }, t: 1.5 };
    }
  }

  private move(d: number, n: number) {
    if (!n) return;
    if (this.col) this.pi = (this.pi + d + n) % n;
    else this.bi = (this.bi + d + n) % n;
  }

  /** Выбранный предмет (для описания) */
  private selected(): { it: ItemDef | null; key: BodyKey | null } {
    const p = this.p;
    if (this.col === 1) return { it: p.backpack[this.pi] ? item(p.backpack[this.pi]) : null, key: null };
    const key = BODY_ORDER[this.bi];
    const id = key === 'skeleton' ? p.skeleton : p.slots[key];
    return { it: id ? item(id) : null, key };
  }

  render(r: Renderer) {
    this.gs.renderBase(r);
    r.rect(0, 0, VIEW_W, VIEW_H, C.void, 1);
    if (this.anim) return this.renderAnim(r);
    const p = this.p;
    r.text(tr({ ru: 'ОПЕРАЦИОННАЯ', en: 'SURGERY' }), 8, 6, { size: 8, color: C.red });
    r.text(tr({ ru: `Скелет: класс ${p.skeletonClass}`, en: `Frame: class ${p.skeletonClass}` }), 190, 8, { size: 5, color: C.steelL, align: 'right' });

    // фигура Т-417 и линии к ячейкам
    r.sprite(playerLook(p, 'down', 0), 72, 50, 4);
    for (const key of BODY_ORDER) {
      const [cx, cy] = CELL[key];
      const [bx, by] = BODY_PT[key];
      const id = key === 'skeleton' ? p.skeleton : p.slots[key];
      if (id) this.line(r, cx + 8, cy + 8, bx, by, C.metal);
    }
    // ячейки
    BODY_ORDER.forEach((key, i) => {
      const [x, y] = CELL[key];
      const locked = SYSTEM_SLOTS.includes(key as Slot) && !p.systems.has(key as Slot);
      const id = key === 'skeleton' ? p.skeleton : p.slots[key];
      const sel = this.col === 0 && this.bi === i;
      r.rect(x, y, 17, 17, C.void, 0.8);
      r.frame(x, y, 17, 17, sel ? C.yellow : id ? qualityColor(item(id).quality) : locked ? C.blood : C.metal);
      if (id) r.sprite(icon(item(id).icon), x + 2, y + 2);
      else if (locked) r.text('×', x + 9, y + 6, { size: 6, color: C.redD, align: 'center' });
      const name = key === 'skeleton' ? SKELETON_NAME : SHORT[key] ?? SLOT_NAME[key];
      r.text(tr(name), x + 9, y + 19, { size: 4, color: sel ? C.yellow : C.steel, align: 'center' });
    });

    // рюкзак
    const rx = 200;
    r.text(`${tr({ ru: 'Рюкзак', en: 'Backpack' })} ${p.backpack.length}/${p.backpackSize}`, rx, 26, { size: 6, color: C.bone });
    for (let i = 0; i < p.backpackSize; i++) {
      const y = 38 + i * 16;
      const id = p.backpack[i];
      const sel = this.col === 1 && this.pi === i;
      r.rect(rx, y, 176, 14, C.void, 0.7);
      r.frame(rx, y, 176, 14, sel ? C.yellow : C.metal);
      if (!id) {
        r.text(tr({ ru: '— пусто —', en: '— empty —' }), rx + 88, y + 5, { size: 4, color: C.metal, align: 'center' });
        continue;
      }
      const it = item(id);
      r.sprite(icon(it.icon), rx + 1, y + 1, 1);
      const blocked = installBlock(this.gs.game, it);
      r.text(tr(it.name), rx + 16, y + 3, { size: 5, color: blocked ? C.steel : qualityColor(it.quality) });
      r.text(kindLabel(it), rx + 16, y + 9, { size: 4, color: C.steel });
    }

    // описание выбранного
    const { it, key } = this.selected();
    const dy = 166;
    r.rect(rx, dy - 4, 176, 48, C.void, 0.7);
    if (it) {
      r.text(tr(it.name), rx + 4, dy, { size: 5, color: qualityColor(it.quality) });
      r.wrap(tr(it.desc), 168, 4).slice(0, 4).forEach((l, i) => r.text(l, rx + 4, dy + 8 + i * 6, { size: 4, color: C.grey }));
      const why = this.col === 1 ? installBlock(this.gs.game, it) : null;
      if (why) r.text(tr(why), rx + 4, dy + 34, { size: 4, color: C.red });
    } else if (key) {
      const locked = SYSTEM_SLOTS.includes(key as Slot) && !p.systems.has(key as Slot);
      const name = key === 'skeleton' ? SKELETON_NAME : SLOT_NAME[key];
      r.text(tr(name), rx + 4, dy, { size: 5, color: C.steelL });
      r.text(tr(locked ? { ru: 'Система закрыта: открывается боссом яруса', en: 'System locked: a tier boss unlocks it' } : { ru: 'Слот пуст', en: 'Empty slot' }), rx + 4, dy + 10, { size: 4, color: C.grey });
    }
    if (this.msg) r.text(tr(this.msg.text), VIEW_W / 2, 196, { size: 5, color: C.red, align: 'center' });
    const hint = this.col
      ? { ru: '↑↓ выбор · R поставить · X выбросить · ← тело · Esc выход', en: '↑↓ select · R install · X drop · ← body · Esc exit' }
      : { ru: '↑↓ выбор · R снять · → рюкзак · Esc выход', en: '↑↓ select · R remove · → backpack · Esc exit' };
    r.text(tr(hint), VIEW_W / 2, 206, { size: 4, color: C.steel, align: 'center' });
  }

  /** Линия из пикселей (виртуальные координаты) */
  private line(r: Renderer, x0: number, y0: number, x1: number, y1: number, color: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i += 2) r.rect(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 1, 1, color);
  }

  /**
   * Анимация операции: Т-417 в кресле, сверху робот-хирург, щупальца тянутся к месту операции,
   * снимают деталь и ставят новую, летят искры. ~2 с, любая клавиша — пропуск.
   */
  private renderAnim(r: Renderer) {
    const a = this.anim!;
    const k = a.t / ANIM_TIME;
    const p = this.p;
    const cx = VIEW_W / 2, top = 20;
    // кресло
    r.rect(cx - 30, 150, 60, 10, C.steel);
    r.rect(cx - 22, 104, 44, 50, C.metal);
    r.rect(cx - 20, 106, 40, 2, C.redD);
    r.rect(cx - 34, 140, 8, 16, C.dark);
    r.rect(cx + 26, 140, 8, 16, C.dark);
    r.rect(cx - 4, 160, 8, 30, C.dark);
    // Т-417 сидит
    r.sprite(playerLook(p, 'down', 0), cx - 18, 96, 3);
    // робот-хирург: корпус на штанге
    r.rect(cx - 3, 0, 6, top, C.dark);
    r.rect(cx - 24, top, 48, 14, C.steel);
    r.rect(cx - 22, top + 2, 44, 2, C.steelL);
    r.rect(cx - 2, top + 8, 4, 3, Math.floor(a.t * 8) % 2 ? C.redL : C.red);
    // точка операции на теле (масштаб ×3 от схемы 4×: смещение от центра фигуры)
    const [bx, by] = BODY_PT[a.key];
    const tx = cx + ((bx - 96) / 4) * 3, ty = 96 + ((by - 50) / 4) * 3;
    // щупальца: тянутся к точке, на середине анимации отдёргиваются (сняли деталь) и возвращаются
    const reach = k < 0.45 ? k / 0.45 : k < 0.6 ? 1 - (k - 0.45) / 0.15 * 0.4 : 0.6 + ((k - 0.6) / 0.4) * 0.4;
    const roots = [-18, -6, 6, 18];
    roots.forEach((dx, i) => {
      const x0 = cx + dx, y0 = top + 14;
      const wob = Math.sin(a.t * 9 + i * 1.7) * 6;
      const ex = tx + (i - 1.5) * 6, ey = ty - 4 + Math.abs(i - 1.5) * 3;
      const x1 = x0 + (ex - x0) * reach + wob * (1 - reach), y1 = y0 + (ey - y0) * reach;
      this.tentacle(r, x0, y0, x1, y1, wob);
      r.rect(x1 - 1, y1 - 1, 3, 3, i % 2 ? C.steelL : C.amber);
    });
    // искры сварки
    if (k > 0.3 && k < 0.9) for (let i = 0; i < 6; i++) {
      const s = Math.sin(a.t * 37 + i * 11), c = Math.cos(a.t * 23 + i * 7);
      r.rect(tx + s * 10, ty + c * 8, 1, 1, i % 2 ? C.yellow : C.bone);
    }
    // старая деталь улетает в сторону, новая приезжает
    const it = (a.key === 'skeleton' ? p.skeleton : p.slots[a.key]);
    if (it && k > 0.6) r.sprite(icon(item(it).icon), tx - 6, ty - 40 + (k - 0.6) / 0.4 * 32, 1, Math.min(1, (k - 0.6) * 5));
    r.text(tr({ ru: 'ОПЕРАЦИЯ…', en: 'OPERATING…' }), cx, 196, { size: 6, color: C.red, align: 'center' });
    r.text(tr({ ru: 'любая клавиша — пропустить', en: 'any key to skip' }), cx, 206, { size: 4, color: C.steel, align: 'center' });
  }

  private tentacle(r: Renderer, x0: number, y0: number, x1: number, y1: number, bend: number) {
    const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
      r.rect(x - 1, y - 1, 2, 2, i % 4 === 0 ? C.steelL : C.metal);
    }
  }
}

const ANIM_TIME = 2;

/** Рюкзак полон: что выбросить, чтобы взять новый модуль (или оставить новый лежать) */
export class BackpackFullOverlay implements Scene {
  private index = 0;
  private t = 0;

  constructor(private gs: GameScene, private k: Pickup) {}

  update(dt: number) {
    this.t += dt;
    const p = this.gs.game.player;
    const n = p.backpack.length + 1;
    if (input.repeat('menuUp')) this.index = (this.index - 1 + n) % n;
    if (input.repeat('menuDown')) this.index = (this.index + 1) % n;
    if (input.pressed('back')) return void (this.gs.overlay = null);
    if (this.t > 0.2 && input.pressed('confirm')) {
      this.gs.overlay = null;
      if (this.index >= p.backpack.length) return;
      dropFromBackpack(this.gs.game, this.index);
      this.gs.game.usePickup(this.k);
    }
  }

  render(r: Renderer) {
    this.gs.renderBase(r);
    const p = this.gs.game.player;
    const w = 220, h = 40 + (p.backpack.length + 1) * 14;
    const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
    r.panel(x, y, w, h);
    const nw = item(this.k.itemId!);
    r.text(tr({ ru: 'Рюкзак полон', en: 'Backpack is full' }), x + 8, y + 6, { size: 6, color: C.red });
    r.text(`${tr({ ru: 'Новый', en: 'New' })}: ${tr(nw.name)}`, x + 8, y + 18, { size: 5, color: qualityColor(nw.quality) });
    const rows = [...p.backpack.map((id) => `${tr({ ru: 'выбросить', en: 'drop' })}: ${tr(item(id).name)}`), tr({ ru: 'оставить новый лежать', en: 'leave the new one' })];
    rows.forEach((t, i) => r.text(t, x + 12, y + 32 + i * 14, { size: 5, color: i === this.index ? C.yellow : C.grey }));
  }
}
