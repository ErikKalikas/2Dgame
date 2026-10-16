import { dist2 } from '../core/math';
import { C } from '../gfx/palette';
import { damageEnemy } from './combat';
import { Enemy, type EnemyDef } from './enemy';
import type { Game } from './game';
import { decoyFor, nearestFoe, shotDmg } from './minions';
import { bossLike } from './status';

// Свой-чужой (этап 12б). Союзник — враг с team = 'ally': вызванный предметом («Полевой ремонт»)
// или «сорванный с поводка» (Сорванный). Союзник бьёт врагов своими атаками (его пули — g.abullets),
// враги бьют его; игрок союзника не ранит. Враги целятся в приманку, в союзника рядом или в игрока.

/** Урон пули союзника по врагу — доля урона выстрела игрока (растёт вместе со сборкой) */
export const ALLY_SHOT_K = 0.6;
/** Урон касания союзника по врагу (раз в BRAWL_CD) — доля урона выстрела игрока */
export const ALLY_TOUCH_K = 1;
/** Урон вражеской пули и касания по союзнику; × множитель здоровья уровня */
export const FOE_BULLET_DMG = 4;
export const FOE_TOUCH_DMG = 6;
const BRAWL_CD = 0.5;
/** Враг отвлекается на союзника, если тот ближе игрока и не дальше этого */
const ALLY_TAUNT_R = 160;
/** Враг целится в приманку, если она не дальше этого */
const DECOY_R = 260;

export const allyDamage = (g: Game) => Math.max(1.5, shotDmg(g) * ALLY_SHOT_K);

/**
 * Цель актёра e (для ИИ врага): g.aimX/aimY, g.aimPlayer (цель — игрок: можно идти по полю путей),
 * g.aimNone (цели нет: не стрелять). Боссы всегда целятся в игрока
 */
export function setAim(g: Game, e: Enemy | null) {
  const p = g.player;
  g.actor = e;
  g.aimNone = false;
  const at = (x: number, y: number, player: boolean) => {
    g.aimX = x;
    g.aimY = y;
    g.aimPlayer = player;
  };
  if (!e || e.def.boss) return at(p.x, p.y, true);
  if (e.team === 'ally') {
    const t = nearestFoe(g, e.x, e.y, 320, (o) => o === e);
    if (t) return at(t.x, t.y, false);
    // врагов нет — держится рядом с игроком и не стреляет
    g.aimNone = true;
    return at(p.x, p.y, true);
  }
  const d = decoyFor(g, e.x, e.y, DECOY_R);
  if (d) return at(d.x, d.y, false);
  let best: Enemy | null = null;
  let bd = Math.min(ALLY_TAUNT_R ** 2, dist2(e.x, e.y, p.x, p.y));
  for (const a of g.enemies) {
    if (a.team !== 'ally' || a.dead || a.spawn > 0 || a.toss) continue;
    const d2 = dist2(e.x, e.y, a.x, a.y);
    if (d2 < bd) {
      bd = d2;
      best = a;
    }
  }
  if (best) return at(best.x, best.y, false);
  at(p.x, p.y, true);
}

/** Выполнить fn от имени врага (его пули, его цель), потом вернуть прицел на игрока */
export function asActor(g: Game, e: Enemy, fn: () => void) {
  const prev = g.actor;
  setAim(g, e);
  try {
    fn();
  } finally {
    setAim(g, prev);
  }
}

/** Сорвать врага с поводка на dur секунд: он бьёт врагов, враги — его. Боссов — нельзя */
export function snapEnemy(g: Game, e: Enemy, dur: number): boolean {
  if (e.dead || bossLike(e) || e.summon) return false;
  if (e.team !== 'ally') g.fx.ring(e.x, e.y, C.violet, e.r + 8, 0.3);
  e.team = 'ally';
  e.allyT = Math.max(e.allyT, dur);
  return true;
}

/** Союзник из погибшего врага: того же вида, hpK — доля здоровья, на dur секунд (Infinity — до конца комнаты) */
export function summonAlly(g: Game, def: EnemyDef, x: number, y: number, hpK: number, dur: number): Enemy {
  const e = new Enemy(def, x, y, g.hpMult);
  e.hp = Math.max(1, Math.round(e.maxHp * hpK));
  e.team = 'ally';
  e.summon = true;
  e.allyT = dur;
  e.spawn = 0.25;
  e.aggro = false;
  g.enemies.push(e);
  g.fx.ring(x, y, C.amber, 14, 0.35);
  return e;
}

/** Союзники (живые) */
export function allies(g: Game): Enemy[] {
  return g.enemies.filter((e) => !e.dead && e.team === 'ally');
}

/** Ранить союзника (пулей или касанием врага) */
export function hurtAlly(g: Game, a: Enemy, dmg: number) {
  if (a.dead || a.spawn > 0) return;
  a.hp -= dmg;
  a.flash = 0.06;
  if (a.hp <= 0) {
    a.lastHit = { source: 'other', by: 'foe' };
    // вызванный союзник гибнет без награды, сорванный враг — с наградой (это ваш враг)
    g.killEnemy(a, !a.summon);
  }
}

/** Пули союзников по врагам, вражеские — по союзникам, драка вплотную, конец союза */
export function updateTeams(g: Game, dt: number) {
  // пули союзников
  if (g.abullets.length) {
    const dmg = allyDamage(g);
    for (const b of g.abullets) {
      if (b.dead || b.delay > 0) continue;
      for (const e of g.enemies) {
        if (e.dead || e.spawn > 0 || e.team !== 'foe' || e.airborne || e.hidden) continue;
        if (dist2(b.x, b.y, e.x, e.y) > (e.r + b.r) ** 2) continue;
        b.dead = true;
        damageEnemy(g, e, dmg, b.x - Math.cos(b.angle) * 8, b.y - Math.sin(b.angle) * 8, { source: 'ally', silent: true, by: 'ally', knockback: 20 });
        g.fx.add({ kind: 'dot', x: b.x, y: b.y, color: C.bone, life: 0.2, glow: true });
        break;
      }
    }
    g.abullets = g.abullets.filter((b) => !b.dead);
  }
  const al = allies(g);
  if (!al.length) return;
  // вражеские пули по союзникам
  let any = false;
  for (const a of al) {
    if (a.spawn > 0 || a.toss) continue;
    for (const b of g.ebullets) {
      if (b.dead || b.delay > 0 || b.owner === a) continue;
      if (dist2(b.x, b.y, a.x, a.y) > (a.r * 0.8 + b.r) ** 2) continue;
      b.dead = any = true;
      hurtAlly(g, a, FOE_BULLET_DMG * g.hpMult);
      if (a.dead) break;
    }
  }
  if (any) g.ebullets = g.ebullets.filter((b) => !b.dead);
  // драка вплотную и конец союза
  for (const a of al) {
    if (a.dead) continue;
    a.allyT -= dt;
    if (a.allyT <= 0) {
      endAlly(g, a);
      continue;
    }
    a.brawlCd -= dt;
    if (a.brawlCd > 0 || a.spawn > 0 || a.toss) continue;
    for (const f of g.enemies) {
      if (f.dead || f.spawn > 0 || f.team !== 'foe' || f.toss || f.airborne) continue;
      const r = (a.r + f.r) * 0.9;
      if (dist2(a.x, a.y, f.x, f.y) > r * r) continue;
      a.brawlCd = BRAWL_CD;
      damageEnemy(g, f, Math.max(1.5, shotDmg(g) * ALLY_TOUCH_K), a.x, a.y, { source: 'ally', silent: true, by: 'ally', knockback: 60 });
      if (f.def.contact !== false) hurtAlly(g, a, FOE_TOUCH_DMG * g.hpMult);
      break;
    }
  }
}

/** Союз кончился: вызванный союзник рассыпается, сорванный враг возвращается к врагам */
function endAlly(g: Game, a: Enemy) {
  if (a.summon) {
    a.hp = 0;
    g.killEnemy(a, false);
    return;
  }
  a.team = 'foe';
  a.allyT = 0;
  g.fx.ring(a.x, a.y, C.red, a.r + 6, 0.25);
}
