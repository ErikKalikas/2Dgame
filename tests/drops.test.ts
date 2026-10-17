import { beforeAll, describe, expect, it } from 'vitest';
import { registerContent } from '../src/content';
import { ENEMIES } from '../src/content/enemies';
import { DROP_BASE, DropState, PITY_STEP, SCANNER, SCANNER_MULT, SET_SIZE, remainingDrops } from '../src/game/drops';
import { DISABLE_TABLE, rollDisable, unstableLevel, unstablePoints } from '../src/game/instability';
import { ITEMS, SYNERGIES } from '../src/game/items';
import { Player } from '../src/game/player';
import type { EnemyDef } from '../src/game/enemy';

beforeAll(() => registerContent());

const fake = (value: 1 | 2 | 3 | 4, drops = ['a', 'b', 'c']): EnemyDef =>
  ({ id: 'fake' + value, value, drops, kind: 'robot' } as unknown as EnemyDef);

/** Последовательность «случайных» чисел для детерминированных проверок */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('наборы врагов (этап 12)', () => {
  it('у каждого обычного врага есть тип, класс и набор 3/4/5/6 по классу', () => {
    const regular = ENEMIES.filter((e) => !e.boss);
    expect(regular.length).toBeGreaterThanOrEqual(16);
    for (const e of regular) {
      expect(['cyborg', 'robot'], e.id).toContain(e.kind);
      expect([1, 2, 3, 4], e.id).toContain(e.value);
      expect(e.drops?.length, e.id).toBe(SET_SIZE[e.value!]);
    }
  });

  it('предметы наборов не повторяются ни внутри набора, ни между врагами', () => {
    const all = ENEMIES.flatMap((e) => e.drops ?? []);
    expect(new Set(all).size).toBe(all.length);
  });

  it('у роботов — прошивки (p…), у киборгов — модули и оружие (i…/w…)', () => {
    for (const e of ENEMIES) for (const id of e.drops ?? []) {
      if (e.kind === 'robot') expect(id.startsWith('p'), `${e.id}: ${id}`).toBe(true);
      else expect(/^[iw]/.test(id), `${e.id}: ${id}`).toBe(true);
    }
  });

  it('уже существующие предметы наборов помечены своим врагом', () => {
    for (const e of ENEMIES) for (const id of e.drops ?? []) {
      const it = ITEMS.get(id);
      if (it) expect(it.fromEnemy, id).toBe(e.id);
    }
  });

  // классы, предметы которых уже в игре (12б.2 — I–II; расширяется по мере частей 12б)
  const DONE = [1, 2, 3];
  const done = () => ENEMIES.filter((e) => !e.boss && DONE.includes(e.value!));

  it('все id из drops готовых классов существуют, редкость = класс врага', () => {
    for (const e of done()) for (const id of e.drops!) {
      const it = ITEMS.get(id);
      expect(it, `${e.id}: ${id}`).toBeTruthy();
      expect(it!.quality, id).toBe(e.value);
    }
  });

  it('у предметов наборов III–IV есть очки нестабильности, у I–II — нет', () => {
    for (const it of ITEMS.values()) {
      if (!it.fromEnemy) continue;
      if (it.quality >= 3) expect([1, 2], it.id).toContain(it.unstable);
      else expect(it.unstable, it.id).toBeUndefined();
    }
  });

  it('у каждого набора 2 синергии (у I класса — 1): ядро — ровно три первых id, полная — весь набор', () => {
    for (const e of done()) {
      const list = SYNERGIES.filter((s) => s.set === e.id);
      expect(list.length, e.id).toBe(e.value === 1 ? 1 : 2);
      for (const s of list) {
        const need = s.tier === 1 ? e.drops!.slice(0, 3) : e.drops!;
        expect(s.requires((id) => need.includes(id), () => 0), s.id).toBe(true);
        for (const miss of need) expect(s.requires((id) => need.includes(id) && id !== miss, () => 0), `${s.id} без ${miss}`).toBe(false);
      }
    }
  });

  it('иконка предмета набора — своя пара «форма + цвета»', () => {
    const key = (i: { icon: { shape: string; color: string; accent?: string } }) => `${i.icon.shape}|${i.icon.color}|${i.icon.accent ?? ''}`;
    const all = new Map<string, string[]>();
    for (const it of ITEMS.values()) all.set(key(it), [...(all.get(key(it)) ?? []), it.id]);
    for (const it of ITEMS.values()) if (it.fromEnemy) expect(all.get(key(it)), it.id).toEqual([it.id]);
  });

  it('«Сканер утильщика» — модуль головы редкости 2', () => {
    const it = ITEMS.get(SCANNER)!;
    expect(it.slot).toBe('head');
    expect(it.quality).toBe(2);
  });
});

describe('шанс дропа', () => {
  it('база 15/10/7/5% по классам, удача +10% за единицу, сканер +20%', () => {
    const st = new DropState();
    expect(st.chance(fake(1), 0, false)).toBeCloseTo(0.15);
    expect(st.chance(fake(2), 0, false)).toBeCloseTo(0.1);
    expect(st.chance(fake(3), 0, false)).toBeCloseTo(0.07);
    expect(st.chance(fake(4), 0, false)).toBeCloseTo(0.05);
    expect(st.chance(fake(1), 2, false)).toBeCloseTo(0.15 * 1.2);
    expect(st.chance(fake(4), 0, true)).toBeCloseTo(0.05 * SCANNER_MULT);
  });

  it('защита от невезения: +¼ базы за каждое убийство без дропа, сброс после дропа', () => {
    const st = new DropState();
    const def = fake(4);
    for (let i = 0; i < 3; i++) expect(st.roll(def, ['a'], 0, false, () => 0.99)).toBeNull();
    expect(st.chance(def, 0, false)).toBeCloseTo(DROP_BASE[4] * (1 + 3 * PITY_STEP));
    expect(st.roll(def, ['a'], 0, false, () => 0)).toBe('a');
    expect(st.chance(def, 0, false)).toBeCloseTo(DROP_BASE[4]);
  });

  it('предмет выбирается из ещё не выпавших; собран весь набор — горсть ячеек', () => {
    const st = new DropState();
    const def = fake(1);
    expect(st.roll(def, ['b', 'c'], 0, false, seq(0, 0.6))).toBe('c');
    expect(st.roll(def, [], 0, false, () => 0)).toBe('cells');
  });

  it('элита гарантированно роняет предмет набора', () => {
    const st = new DropState();
    expect(st.roll(fake(3), ['a'], 0, false, () => 0.999, true)).toBe('a');
  });

  it('у боссов дропа нет', () => {
    const st = new DropState();
    const boss = { ...fake(1), boss: true } as EnemyDef;
    expect(st.roll(boss, ['a'], 0, false, () => 0)).toBeNull();
  });

  it('remainingDrops пропускает несуществующие и уже встреченные предметы', () => {
    const def = fake(1, [SCANNER, 'notExistingYet', 'pistol']);
    expect(remainingDrops(def, new Set(['pistol']))).toEqual([SCANNER]);
  });
});

describe('нестабильность', () => {
  it('уровень по сумме очков: 1–2 → 1, 3–4 → 2, 5–6 → 3, 7+ → 4', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 12].map(unstableLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('в таблице вероятности каждого уровня дают 100%', () => {
    for (const rows of Object.values(DISABLE_TABLE)) {
      expect(rows.reduce((s, r) => s + r.p, 0)).toBeCloseTo(1);
    }
  });

  it('бросок по таблице: уровень 4 — 50% на 10–20 с, 30% до конца боя, 20% до конца уровня', () => {
    expect(rollDisable(4, seq(0.1, 0.5))).toEqual({ mode: 'timed', t: 15 });
    expect(rollDisable(4, () => 0.6).mode).toBe('combat');
    expect(rollDisable(4, () => 0.95).mode).toBe('level');
    expect(rollDisable(1, () => 0.99)).toEqual({ mode: 'timed', t: 5 });
  });

  it('отключённый предмет не действует: не даёт характеристик и синергий', () => {
    const p = new Player('pistol');
    p.passives.set('heavyRounds', 1);
    p.recalc();
    const on = p.stats.damageMult;
    p.disabled.set('heavyRounds', { mode: 'timed', t: 5 });
    p.recalc();
    expect(p.has('heavyRounds')).toBe(false);
    expect(p.stats.damageMult).not.toBe(on);
  });

  it('очки считаются по надетым предметам с полем unstable', () => {
    const p = new Player('pistol');
    expect(unstablePoints(p)).toBe(0);
    const it = ITEMS.get('heavyRounds')!;
    const was = it.unstable;
    it.unstable = 2;
    p.passives.set('heavyRounds', 1);
    expect(unstablePoints(p)).toBe(2);
    it.unstable = was;
  });
});
