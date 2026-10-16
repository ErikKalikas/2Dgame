import type { Game } from './game';

// Объекты игрока в мире (этап 12б): вертушки, лужи и паутина, миньоны, приманка, сцепка лучом,
// обломки и запчасти. Живут в координатах уровня (одна карта): чистятся при смене уровня
// (Game.startFloor), а привязанные к комнате — при её зачистке или уходе игрока в другую комнату.

/** floor — на полу (под существами), body — среди существ, air — поверх темноты (всегда видно) */
export type ObjLayer = 'floor' | 'body' | 'air';

export interface WorldObj {
  kind: string;
  x: number;
  y: number;
  r: number;
  /** Возраст (с) */
  t: number;
  /** Время жизни (с); Infinity — пока не уберут */
  life: number;
  dead: boolean;
  layer: ObjLayer;
  /** Привязка к комнате (id): убирается при её зачистке или когда игрок ушёл в другую комнату */
  room?: number;
  /** Комната была зачищена уже при появлении объекта (тогда убирается только при уходе) */
  roomWasCleared?: boolean;
  /** Радиус света вокруг объекта (огонь, вспышки) */
  light?: number;
  /** Данные конкретного вида */
  data: Record<string, any>;
  update?(g: Game, o: WorldObj, dt: number): void;
  /** Отрисовка: x, y — положение на экране */
  draw?(g: Game, o: WorldObj, ctx: CanvasRenderingContext2D, x: number, y: number): void;
  /** Время жизни вышло (не вызывается при смене уровня) */
  onExpire?(g: Game, o: WorldObj): void;
}

export type ObjInit = Partial<WorldObj> & { kind: string; x: number; y: number };

export function addObj(g: Game, init: ObjInit): WorldObj {
  const o: WorldObj = { r: 4, t: 0, life: Infinity, dead: false, layer: 'body', data: {}, ...init };
  if (o.room !== undefined) o.roomWasCleared = !!g.plan.rooms[o.room]?.cleared;
  g.objs.push(o);
  return o;
}

/** Живые объекты вида kind */
export function objsOf(g: Game, kind: string): WorldObj[] {
  return g.objs.filter((o) => !o.dead && o.kind === kind);
}

/** Оставить не больше max объектов вида kind (старые убираются молча) */
export function capObjs(g: Game, kind: string, max: number) {
  const list = objsOf(g, kind);
  for (let i = 0; i < list.length - max; i++) list[i].dead = true;
}

/** Убрать объект с вызовом onExpire */
export function expire(g: Game, o: WorldObj) {
  if (o.dead) return;
  o.dead = true;
  o.onExpire?.(g, o);
}

export function updateObjs(g: Game, dt: number) {
  if (!g.objs.length) return;
  // список может пополняться прямо во время обхода (паучок оставил паутину) — идём по снимку
  const list = g.objs.slice();
  for (const o of list) {
    if (o.dead) continue;
    o.t += dt;
    if (o.room !== undefined) {
      const r = g.plan.rooms[o.room];
      if (!r || (r.cleared && !o.roomWasCleared) || (g.zone && g.zone.id !== o.room)) {
        expire(g, o);
        continue;
      }
    }
    o.update?.(g, o, dt);
    if (!o.dead && o.t >= o.life) expire(g, o);
  }
  g.objs = g.objs.filter((o) => !o.dead);
}

export function renderObjs(g: Game, ctx: CanvasRenderingContext2D, cx: number, cy: number, layer: ObjLayer) {
  for (const o of g.objs) {
    if (o.dead || o.layer !== layer || !o.draw) continue;
    const x = o.x - cx, y = o.y - cy, m = 60 + o.r;
    if (x < -m || y < -m || x > 384 + m || y > 216 + m) continue;
    o.draw(g, o, ctx, x, y);
  }
}
