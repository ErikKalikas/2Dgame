// Настройки игрока в localStorage. Прогресс забега не сохраняется (по ТЗ).

export type Lang = 'ru' | 'en';
export type Difficulty = 'normal' | 'hard';

export interface Settings {
  lang: Lang;
  difficulty: Difficulty;
  fullscreen: boolean;
  /** Метка над врагом с несобранным набором (этап 12) */
  setMarkers: boolean;
  /** Помехи интерфейса при высокой нестабильности */
  instabilityFx: boolean;
}

const KEY = 'black-ice-settings-v1';

const DEFAULTS: Settings = { lang: 'ru', difficulty: 'normal', fullscreen: false, setMarkers: true, instabilityFx: true };

export const settings: Settings = load();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* localStorage недоступен — используем значения по умолчанию */
  }
  return { ...DEFAULTS };
}

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* игнорируем */
  }
}
