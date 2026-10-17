import type { L } from '../core/i18n';
import type { EnemyDef } from '../game/enemy';
import { BOSSES } from './bosses';

// Мини-боссы (этап 14а, Боссы#Перебалансировка старых боссов в мини-боссов): старые боссы первой версии
// с новыми именами под мир Улья. HP ×0,5, две фазы из трёх (утверждены Эриком), плотность пуль ×0,8
// и перерывы между атаками ×1,25 (MINIBOSS_DENSITY / MINIBOSS_PAUSE в game/status.ts — для e.miniboss).
// Спрайты и узоры атак — те же, что у боссов.

/** Доля HP мини-босса от босса */
export const MINIBOSS_HP = 0.5;

/** Мини-босс из босса: id, новое имя и какие фазы оставить (индексы фаз босса) */
function mini(base: string, id: string, name: L, keep: number[]): EnemyDef {
  const b = BOSSES.find((x) => x.id === base)!;
  const src = b.phases!;
  const phases = keep.map((i, k) => ({
    ...src[i],
    // у близнецов свои пороги (фаз и так две), у остальных смена на половине HP
    until: keep.length === src.length ? src[i].until : k === keep.length - 1 ? 0 : 0.5,
  }));
  return {
    ...b,
    id,
    name,
    hp: Math.round(b.hp * MINIBOSS_HP),
    xp: Math.round(b.xp * 0.6),
    coins: Math.round(b.coins * 0.6),
    miniboss: true,
    phases,
  };
}

export const MINIBOSSES: EnemyDef[] = [
  mini('sentinel', 'mbSentinel', { ru: 'Сторожевой мех «Страж»', en: 'Sentry Mech "WARDEN"' }, [1, 2]),
  mini('arachna', 'mbArachna', { ru: 'Паук-чистильщик труб «Арахна»', en: 'Pipe-Cleaner Spider "ARACHNE"' }, [0, 2]),
  mini('gunship', 'mbGunship', { ru: 'Шахтный дрон-кран «Гриф»', en: 'Shaft Crane Drone "VULTURE"' }, [0, 2]),
  mini('twins', 'mbTwins', { ru: 'Патрульные «Кастор» и «Поллукс»', en: 'Patrol Units "CASTOR" & "POLLUX"' }, [0, 1]),
  mini('goliath', 'mbGoliath', { ru: 'Погрузчик-тяжеловоз «Голиаф»', en: 'Heavy Loader "GOLIATH"' }, [0, 2]),
  mini('hive', 'mbHive', { ru: 'Сборочный улей', en: 'Assembly Hive' }, [1, 2]),
  mini('executioner', 'mbExecutioner', { ru: 'Коллектор-вышибала «Палач»', en: 'Debt Collector "EXECUTIONER"' }, [1, 2]),
];

export const MINIBOSS_BY_ID = new Map(MINIBOSSES.map((m) => [m.id, m]));

/** Кто охраняет комнаты мини-боссов на уровне (Боссы#Кто где); те же — в волне розыска 4 */
export const MINIBOSS_BY_FLOOR: Record<number, string[]> = {
  1: ['mbSentinel'],
  2: ['mbArachna', 'mbSentinel'],
  3: ['mbGoliath'],
  4: ['mbHive', 'mbGoliath'],
  5: ['mbExecutioner'],
  6: ['mbTwins', 'mbExecutioner'],
  7: ['mbSentinel'],
  8: ['mbGunship'],
};

/** Босс или мини-босс по id (конец уровня — FloorTheme.boss) */
export function bossDef(id: string): EnemyDef {
  return BOSSES.find((b) => b.id === id) ?? MINIBOSS_BY_ID.get(id) ?? BOSSES[0];
}

/** Пара близнецов (босс или мини-босс): появляются вдвоём */
export function isTwins(def: EnemyDef): boolean {
  return def.id === 'twins' || def.id === 'mbTwins';
}
