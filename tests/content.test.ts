import { beforeAll, describe, expect, it } from 'vitest';
import { registerContent } from '../src/content';
import { ENEMIES } from '../src/content/enemies';
import { BOSSES } from '../src/content/bosses';
import { iconShapes } from '../src/gfx/icons';
import { ITEMS, SYNERGIES, itemsOfKind } from '../src/game/items';
import { Player } from '../src/game/player';

beforeAll(() => registerContent());

describe('контент', () => {
  it('у каждого предмета есть названия, описания и существующая иконка', () => {
    const shapes = new Set(iconShapes());
    for (const it of ITEMS.values()) {
      expect(it.name.ru && it.name.en && it.desc.ru && it.desc.en, it.id).toBeTruthy();
      expect(shapes.has(it.icon.shape), `${it.id}: иконка ${it.icon.shape}`).toBe(true);
      if (it.kind === 'weapon') expect(it.weapon, it.id).toBeTruthy();
    }
  });

  it('не меньше 50 оружий, 50 имплантов, 30 модификаций (минимум первой версии, новые можно добавлять)', () => {
    expect(itemsOfKind('weapon').length).toBeGreaterThanOrEqual(50);
    expect(itemsOfKind('implant').length).toBeGreaterThanOrEqual(50);
    expect(itemsOfKind('passive').length).toBeGreaterThanOrEqual(30);
    expect(itemsOfKind('passive').filter((p) => p.tags.includes('mutation')).length).toBeGreaterThanOrEqual(6);
  });

  it('оружие одноручное или двуручное, двуручных — заметная часть', () => {
    const w = itemsOfKind('weapon');
    for (const it of w) expect([undefined, 1, 2], it.id).toContain(it.weapon!.hands);
    const two = w.filter((it) => it.weapon!.hands === 2).length;
    expect(two).toBeGreaterThan(w.length * 0.25);
    expect(two).toBeLessThan(w.length * 0.75);
    expect(ITEMS.get('pistol')!.weapon!.hands ?? 1, 'стартовый пистолет одноручный').toBe(1);
  });

  it('названия предметов не повторяются', () => {
    for (const lang of ['ru', 'en'] as const) {
      const seen = new Map<string, string>();
      for (const it of ITEMS.values()) {
        const n = it.name[lang].toLowerCase();
        expect(seen.get(n), `${it.id}: «${n}» уже у ${seen.get(n)}`).toBeUndefined();
        seen.set(n, it.id);
      }
    }
  });

  it('не меньше 16 врагов и 8 боссов', () => {
    expect(ENEMIES.length).toBeGreaterThanOrEqual(16);
    expect(BOSSES.length).toBeGreaterThanOrEqual(8);
    for (const b of BOSSES) expect(b.phases!.length).toBeGreaterThanOrEqual(2);
  });

  it('любое оружие и любой предмет дают корректные характеристики', () => {
    for (const w of itemsOfKind('weapon')) {
      const p = new Player(w.id);
      for (const it of ITEMS.values()) {
        if (it.kind === 'implant' && !it.active) p.implants.push(it.id);
        if (it.kind === 'passive') p.passives.set(it.id, it.maxStacks ?? 1);
      }
      p.recalc();
      for (const [k, v] of Object.entries(p.stats)) {
        if (typeof v === 'number') expect(Number.isFinite(v), `${w.id}.${k}`).toBe(true);
      }
      expect(p.stats.count).toBeGreaterThanOrEqual(1);
    }
  });

  it('синергии ссылаются на существующие предметы', () => {
    for (const s of SYNERGIES) {
      const ids: string[] = [];
      s.requires((id) => (ids.push(id), false), () => 0);
      for (const id of ids) expect(ITEMS.has(id), `${s.id} → ${id}`).toBe(true);
    }
  });
});
