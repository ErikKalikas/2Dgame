import { beforeAll, describe, expect, it } from 'vitest';
import { registerContent } from '../src/content';
import { BOSSES } from '../src/content/bosses';
import { ENEMIES } from '../src/content/enemies';
import { MINIBOSSES } from '../src/content/minibosses';
import { ITEMS, SYNERGIES, type ItemDef } from '../src/game/items';
import { PATCHES } from '../src/game/patches';
import { baseStats } from '../src/game/stats';

// Этап 15: уникальность контента. Тест работает всегда: новый предмет с чужим названием, иконкой
// или тем же набором характеристик его роняет. Известные спорные пары (ждут решения Эрика) — в
// списках KNOWN_* ниже и в отчёте UNIQUENESS.md; решили пару — убрать её из списка.

beforeAll(() => registerContent());

const items = () => [...ITEMS.values()];

/** Повторы по ключу: ключ → id */
function dupes<T extends { id: string }>(list: T[], key: (x: T) => string | null): string[] {
  const m = new Map<string, string[]>();
  for (const x of list) {
    const k = key(x);
    if (k) m.set(k, [...(m.get(k) ?? []), x.id]);
  }
  return [...m.values()].filter((ids) => ids.length > 1).map((ids) => ids.join(' + '));
}

/** Слова-категории: одинаковый корень у них — не повтор («пистолет», «протокол», «мутация»…) */
const GENERIC = new Set([
  'пистол', 'дробов', 'гранат', 'винтов', 'ракетн', 'мутаци', 'проток', 'прошив', 'скелет', 'рабочи',
  'подошв', 'кираса', 'корпус', 'сканер', 'контур', 'ускори', 'импуль', 'привод', 'осколк', 'перехв',
  'магнит', 'разряд',
]);

/** Корни названий, общие у нескольких предметов, — кандидаты в повторы (корень: id через запятую) */
function nameRoots(): string[] {
  const roots = new Map<string, Set<string>>();
  for (const it of items()) {
    for (const w of it.name.ru.toLowerCase().match(/[а-яё]{6,}/g) ?? []) {
      const r = w.slice(0, 6);
      if (GENERIC.has(r)) continue;
      if (!roots.has(r)) roots.set(r, new Set());
      roots.get(r)!.add(it.id);
    }
  }
  return [...roots].filter(([, ids]) => ids.size > 1).map(([r, ids]) => `${r}: ${[...ids].sort().join(',')}`).sort();
}

/** Спорные пары названий — ждут решения Эрика (UNIQUENESS.md, раздел «Похожие названия») */
const KNOWN_ROOTS = [
  'возвра: iReturnServo,pBoomerangFrame,wBoomerangDisc',
  'гарпун: lhHarpoon,wHarpoon',
  'дугово: pArcConductor,wArcThrower',
  'зеркал: iMirrorField,pMirrorPrism',
  'клинки: iMantisBlades,wMantis',
  'катушк: iArcCoil,pHelixCoil',
  'конден: iCapacitorArm,wChargeShotgun',
  'костян: pMutBoneSpurs,wHedgehog',
  'нанито: iNaniteVeil,wNanoSwarm',
  'оптика: iFalconOptics,pSeekerOptics',
  'осколо: iFragCasing,pFragWarheads',
  'орбита: iOrbitalGuard,pOrbitalShards',
  'плазме: iPlasmaInjector,wPlasmaMortar',
  'поводк: iDaemonUplink,iSnapLeash',
  'призма: pMirrorPrism,wPrism',
  'рельсо: pRailAccelerator,railgun',
  'свароч: lhWeldWall,wWeldingTorch',
  'сервоп: iServoAnkles,servoLegs',
  'сингул: pSingularityCore,wSingularity',
  'спирал: iHelixRifling,pHelixCoil,wHelix',
  'турель: iSentryPod,wDervish',
  'фазовы: iPhaseRounds,pPhaseShift',
];

/** Название предмета совпадает с названием фазы босса — ждёт решения (UNIQUENESS.md) */
const KNOWN_PHASE_NAMES = ['iMantisBlades', 'railgun'];

/** Предметы с одинаковым эффектом «только характеристики» — ждут решения (UNIQUENESS.md) */
const KNOWN_STAT_TWINS = ['iShoulderMounts + pMirrorPrism'];

/** id, занятый и предметом, и врагом (оружие «Огнемёт» и враг Кочегар) — ждёт решения (UNIQUENESS.md) */
const KNOWN_SHARED_IDS = ['flamer'];

/** «Отпечаток» предмета, который меняет только характеристики: что и на сколько меняется */
function statPrint(it: ItemDef): string | null {
  if (it.hooks || it.active || it.leftHand || it.weapon || !it.stats) return null;
  if (it.kind === 'skeleton' || it.kind === 'backpack') return null;
  const base = baseStats() as unknown as Record<string, unknown>;
  const s = baseStats();
  it.stats(s, 1);
  const r = s as unknown as Record<string, unknown>;
  const diff = Object.keys(r)
    .filter((k) => JSON.stringify(r[k]) !== JSON.stringify(base[k]))
    .sort()
    .map((k) => `${k}=${typeof r[k] === 'number' ? (r[k] as number).toFixed(3) : JSON.stringify(r[k])}`);
  return diff.length ? diff.join(',') : null;
}

describe('уникальность контента (этап 15)', () => {
  it('id не повторяются: предметы и синергии, враги и боссы; между ними — только известные', () => {
    const rep = (list: string[]) => list.filter((id, i) => list.indexOf(id) !== i);
    const things = [...items().map((x) => x.id), ...SYNERGIES.map((x) => x.id)];
    const foes = [...ENEMIES.map((x) => x.id), ...BOSSES.map((x) => x.id), ...MINIBOSSES.map((x) => x.id)];
    expect(rep(things)).toEqual([]);
    expect(rep(foes)).toEqual([]);
    expect(things.filter((id) => foes.includes(id))).toEqual(KNOWN_SHARED_IDS);
  });

  it('названия (ru и en) и описания предметов не повторяются', () => {
    expect(dupes(items(), (x) => x.name.ru.toLowerCase())).toEqual([]);
    expect(dupes(items(), (x) => x.name.en.toLowerCase())).toEqual([]);
    expect(dupes(items(), (x) => x.desc.ru)).toEqual([]);
    expect(dupes(items(), (x) => x.desc.en)).toEqual([]);
  });

  it('названия синергий не повторяются', () => {
    expect(dupes(SYNERGIES, (x) => x.name.ru.toLowerCase())).toEqual([]);
    expect(dupes(SYNERGIES, (x) => x.name.en.toLowerCase())).toEqual([]);
  });

  it('у каждого предмета своя иконка (форма + цвета)', () => {
    expect(dupes(items(), (x) => `${x.icon.shape}|${x.icon.color}|${x.icon.accent ?? ''}`)).toEqual([]);
  });

  it('нет двух предметов «только характеристики» с одинаковым эффектом', () => {
    expect(dupes(items(), statPrint)).toEqual(KNOWN_STAT_TWINS);
  });

  it('похожие названия — только известные спорные пары', () => {
    const now = nameRoots();
    // новая пара: развести названия или добавить её в отчёт и сюда
    expect(now.filter((r) => !KNOWN_ROOTS.includes(r))).toEqual([]);
    // пару решили и развели — убрать из списка
    expect(KNOWN_ROOTS.filter((r) => !now.includes(r))).toEqual([]);
  });

  it('названия предметов не совпадают с фазами боссов и патчами Диспетчера', () => {
    const taken = new Set<string>();
    for (const b of [...BOSSES, ...MINIBOSSES]) for (const p of b.phases ?? []) taken.add(p.name.ru.toLowerCase());
    for (const p of PATCHES) taken.add(p.name.ru.toLowerCase());
    const clash = items().filter((x) => taken.has(x.name.ru.toLowerCase())).map((x) => x.id);
    expect(clash.sort()).toEqual(KNOWN_PHASE_NAMES);
  });
});
