// Типы тайлов комнаты
export const T = {
  Floor: 0,
  Wall: 1,
  Pit: 2, // яма: нельзя пройти пешком, пули пролетают
  Block: 3, // неразрушимая колонна
  Crate: 4, // разрушаемый блок (ящик / серверная стойка)
  Electro: 5, // ловушка: электропол, периодически бьёт током
  Door: 6,
  Bridge: 7, // мостик над ямой (проходимый)
  Void: 8, // пустота за стенами уровня (между комнатами и коридорами)
} as const;

export type Tile = (typeof T)[keyof typeof T];

/** Можно ли стоять на тайле (для наземных существ). Двери проверяются отдельно. */
export const walkable = (t: number) => t === T.Floor || t === T.Electro || t === T.Bridge;

/** Тайл останавливает пули */
export const blocksShots = (t: number) => t === T.Wall || t === T.Void || t === T.Block || t === T.Crate || t === T.Door;

/** Тайл непроходим для летающих */
export const blocksFlyers = (t: number) => t === T.Wall || t === T.Void || t === T.Block || t === T.Crate || t === T.Door;
