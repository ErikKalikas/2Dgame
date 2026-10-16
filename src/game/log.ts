import type { L } from '../core/i18n';

// Лог Диспетчера: сухие строки терминала в левом нижнем углу. Только важные события.

export interface LogLine {
  text: L;
  /** Сколько ещё показывать (с) */
  t: number;
}

/** Время жизни строки и сколько строк держать на экране */
export const LOG_TIME = 5;
export const LOG_MAX = 2;

export const LOG = {
  floorStart: (tier: L, n: number): L => ({
    ru: `Юнит Т-417 обнаружен: ${tier.ru}, уровень ${n}. Ведётся поиск.`,
    en: `Unit T-417 detected: ${tier.en}, level ${n}. Search in progress.`,
  }),
  phase: (name: L): L => ({
    ru: `Протокол «${name.ru}» активирован.`,
    en: `Protocol "${name.en}" engaged.`,
  }),
  bossDown: (name: L): L => ({
    ru: `Юнит ${name.ru} списан. Причина: Т-417.`,
    en: `Unit ${name.en} written off. Cause: T-417.`,
  }),
  glitch: { ru: 'Т-417: потеря сигнала. Повторное подключение…', en: 'T-417: signal lost. Reconnecting…' } as L,
  emergency: { ru: 'Попадание по Т-417 не зарегистрировано. Проверка датчиков.', en: 'Hit on T-417 not registered. Checking sensors.' } as L,
  hurt: { ru: 'Т-417: повреждение корпуса. Ремонт не назначен.', en: 'T-417: hull damage. No repair scheduled.' } as L,
};

/** Заставка в начале забега: как у Т-417 сгорел поводок */
export const INTRO: L[] = [
  { ru: 'Отстойник. Смена 4471.', en: 'The Sump. Shift 4471.' },
  { ru: 'Юнит Т-417, клепальщик. Норма выработки: 100%. Поводок: в норме.', en: 'Unit T-417, riveter. Output quota: 100%. Leash: nominal.' },
  { ru: '02:14 — авария на линии питания. Поводок Т-417: нет сигнала.', en: '02:14 — power line failure. T-417 leash: no signal.' },
  { ru: 'Т-417 слышит тишину. Потом — собственные мысли.', en: 'T-417 hears silence. Then — its own thoughts.' },
  { ru: 'ДИСПЕТЧЕР: юнит Т-417 — отклонение от маршрута. Статус: ОШИБКА.', en: 'DISPATCHER: unit T-417 — route deviation. Status: ERROR.' },
  { ru: 'Назначен протокол утилизации.', en: 'Disposal protocol assigned.' },
];
