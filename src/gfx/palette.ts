// Ограниченная палитра из 16 цветов: тёмная, с акцентами красного и жёлтого и редким фиолетовым.
export const PAL = [
  '#050508', // 0 пустота
  '#0e0e14', // 1 почти чёрный
  '#191922', // 2 тёмный металл
  '#262632', // 3 металл
  '#3a3a48', // 4 сталь
  '#595968', // 5 светлая сталь
  '#8c8c9a', // 6 серый
  '#d4d0c4', // 7 кость
  '#2e080c', // 8 запёкшаяся кровь
  '#5e0f16', // 9 тёмно-красный
  '#a3161f', // 10 красный
  '#ff3a2e', // 11 алый (редко)
  '#4f3006', // 12 тёмный янтарь
  '#b87a0c', // 13 янтарь
  '#ffcc33', // 14 жёлтый
  '#6b2d8a', // 15 фиолетовый (редко)
] as const;

export const C = {
  void: PAL[0],
  black: PAL[1],
  dark: PAL[2],
  metal: PAL[3],
  steel: PAL[4],
  steelL: PAL[5],
  grey: PAL[6],
  bone: PAL[7],
  blood: PAL[8],
  redD: PAL[9],
  red: PAL[10],
  redL: PAL[11],
  amberD: PAL[12],
  amber: PAL[13],
  yellow: PAL[14],
  violet: PAL[15],
};

/** Символы для рисования спрайтов строками: '.' = прозрачный, 0-9 и a-f = индекс палитры */
export function palChar(ch: string): string | null {
  if (ch === '.' || ch === ' ') return null;
  const i = parseInt(ch, 16);
  return Number.isNaN(i) ? null : PAL[i];
}
