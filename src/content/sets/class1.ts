import { TAU, angleDiff, angleTo, dist2 } from '../../core/math';
import { C } from '../../gfx/palette';
import type { PBullet } from '../../game/bullets';
import { moveBody } from '../../game/collision';
import { explode, fan, fireMelee } from '../../game/combat';
import type { Enemy } from '../../game/enemy';
import type { Game } from '../../game/game';
import type { ItemDef } from '../../game/items';
import { nearestFoe, shotDmg, shotFrom, spawnBot, spawnInterceptor, spawnScrap, spawnSpider, type BotOpts } from '../../game/minions';
import { addObj, objsOf } from '../../game/objects';
import { isFoe } from '../../game/status';
import { addZone } from '../../game/zones';
import { CLOSE, SYN, blink, childShot, coneTarget, hasSyn, ringShots, shotK, st, stun } from './common';

// Предметы наборов врагов I класса (редкость 1): Падальщик, Трубач (киборги — оружие и модули),
// Дрон-наблюдатель, Паук-мина, Рой-бот (роботы — прошивки). Числа — заметка «Наборы врагов — этап 12».

// ---------------------------------------------------------------- Падальщик

const HOOK_REACH = 28;
/** Подскок «Падали»: к цели не дальше досягаемости + столько */
const HOOK_HOP = 44;
const CRATE_MAX = 6;

/** Обломок для короба: лежит 5 с, подобранный — заряд короба */
export function dropJunk(g: Game, x: number, y: number) {
  if (!g.player.has('iScavCrate')) return;
  spawnScrap(g, 'junk', x, y, 5, C.amberD, (g) => {
    g.mem.crate = Math.min(CRATE_MAX, (g.mem.crate ?? 0) + 1);
  });
}

/** Тяжёлый обломок из короба: ×1,5 урона, пробивает +1 */
export function heavyJunk(g: Game, angle: number): PBullet {
  const p = g.player;
  return shotFrom(g, p.x, p.y - 3, angle, {
    dmg: shotDmg(g) * 1.5, pierce: p.stats.pierce + 1, r: 3.5, style: 'pellet', color: C.amberD, tag: 'junk', split: 0, explode: 0,
  });
}

// ---------------------------------------------------------------- Трубач

/** «В точку»: попадание с этой дистанции (px) */
const POINT_MIN = 70, POINT_MAX = 150;

/** Дробина «Трубы»: на дистанции 70–150 урон ×1,4 и оглушение 0,3 с; с «Личным пространством» — рикошет */
function pipePellet(): Partial<PBullet> {
  return {
    tag: 'pipe',
    step(_g, b) {
      const d = (b.data ??= {});
      if (d.sx === undefined) {
        d.sx = b.bx;
        d.sy = b.by;
      }
      const dist = Math.hypot(b.bx - d.sx, b.by - d.sy);
      d.point = dist >= POINT_MIN && dist <= POINT_MAX;
      shotK(b, 'point', d.point ? 1.4 : 1);
    },
    onHitEnemy(g, b, e) {
      if (!b.data?.point) return;
      stun(e, 0.3);
      g.fx.add({ kind: 'spark', x: e.x, y: e.y - 4, vx: 0, vy: -40, color: C.yellow, life: 0.25, glow: true });
      // «Личное пространство»: попадание «в точку» рикошетит в соседнего врага
      if (hasSyn(g, SYN.punk)) {
        const t = nearestFoe(g, e.x, e.y, 120, (o) => o === e);
        if (t) childShot(g, e.x, e.y, angleTo(e.x, e.y, t.x, t.y), { dmg: b.dmg, r: b.r, style: 'pellet', color: C.yellow, hit: new Set([e]), tag: 'ricochet' });
      }
    },
  };
}

// ---------------------------------------------------------------- Рой-бот

const POCKET_BOTS = 4;
const QUEEN_BOTS = 8;

/** Бот роя гасит пулю и гибнет, выпуская 3 ваших снаряда туда, откуда пришла пуля */
const botOpts: BotOpts = {
  onBlock(g, bot, b) {
    const a = b.angle + Math.PI;
    for (let i = -1; i <= 1; i++) childShot(g, bot.x, bot.y, a + i * 0.25, { dmg: shotDmg(g), r: 1.8, tag: 'botBurst' });
  },
};

export function topUpBots(g: Game, n: number) {
  for (let k = objsOf(g, 'bot').length; k < n; k++) spawnBot(g, botOpts);
}

// ---------------------------------------------------------------- Паук-мина

/** Липкий заряд на враге: мигает 0,55 с и взрывается */
function attachSticky(g: Game, e: Enemy, dmg: number) {
  const ox = (Math.random() - 0.5) * e.r, oy = (Math.random() - 0.5) * e.r;
  addObj(g, {
    kind: 'sticky', x: e.x + ox, y: e.y + oy, r: 2, life: 0.55, layer: 'air', data: { e, ox, oy },
    update(_g, o) {
      if (!e.dead) {
        o.x = e.x + ox;
        o.y = e.y + oy;
      }
    },
    onExpire(g, o) {
      g.fx.flash(o.x, o.y, C.amber, 12, 0.1);
      explodeAt(g, o.x, o.y, 20, dmg, 'sticky');
    },
    draw(g, o, ctx, x, y) {
      ctx.fillStyle = Math.floor(g.time * 18) % 2 ? C.redL : C.yellow;
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    },
  });
}

const explodeAt = (g: Game, x: number, y: number, r: number, dmg: number, tag: string) => explode(g, x, y, r, dmg, C.amber, tag);

/** Паутина (2 с): враги −40% скорости, вражеские пули −50% */
export function webAt(g: Game, x: number, y: number, r: number) {
  addZone(g, 'web', x, y, Math.max(16, r), 2, { slow: 0.4, bulletSlow: 0.5, tag: 'web', max: 10 });
}

// ---------------------------------------------------------------- предметы

export const CLASS1: ItemDef[] = [
  // ================================================================ Падальщик
  {
    id: 'wScavHook', kind: 'weapon', quality: 1, tags: ['blade', 'kinetic'], fromEnemy: 'scav',
    name: { ru: 'Крюк-кастет «Падаль»', en: '"Carrion" Hook Knuckle' },
    desc: {
      ru: 'Тычки крюком 3 раза в секунду (урон 5); цель дальше досягаемости — подскок к ней. Попадание сокращает перезарядку рывка на 0,1 с (не больше 0,3 с в секунду).',
      en: 'Hook jabs 3 times per second (5 damage); hops to a target beyond reach. A hit cuts dash cooldown by 0.1 s (up to 0.3 s per second).',
    },
    icon: { shape: 'hook', color: C.steel, accent: C.amber },
    weapon: {
      mode: 'melee',
      stats: (s) => {
        s.damage = 5;
        s.fireDelay = 1 / 3;
        s.shotColor = C.bone;
      },
      fire(g, angle, s) {
        const p = g.player;
        // подскок к цели в секторе прицела, если она дальше досягаемости
        const t = coneTarget(g, angle, 0.6, HOOK_REACH + HOOK_HOP + 8);
        if (t) {
          const d = Math.sqrt(dist2(p.x, p.y, t.x, t.y)) - t.r;
          if (d > HOOK_REACH) {
            const a = angleTo(p.x, p.y, t.x, t.y);
            g.fx.add({ kind: 'ghost', x: p.x, y: p.y, sprite: p.sprite, life: 0.2 });
            const body = { x: p.x, y: p.y, r: p.bodyR };
            moveBody(g.room, body, Math.cos(a) * (d - HOOK_REACH + 6), Math.sin(a) * (d - HOOK_REACH + 6), (tt, tx, ty) => g.playerSolid(tt, tx, ty, false));
            p.x = body.x;
            p.y = body.y;
            angle = a;
          }
        }
        fireMelee(g, angle, s, { reach: HOOK_REACH, arc: 1.3, tag: 'hook' });
      },
    },
    hooks: {
      onHit(g, _e, hit) {
        if (hit.tag !== 'hook') return;
        // не больше 0,3 с за секунду
        const b = st(g, 'hookBudget', () => ({ t: -9, used: 0 }));
        if (g.time - b.t >= 1) {
          b.t = g.time;
          b.used = 0;
        }
        if (b.used >= 0.3 - 1e-6) return;
        b.used += 0.1;
        g.player.dashCd = Math.max(0, g.player.dashCd - 0.1);
      },
    },
  },
  {
    id: 'iScavLegs', kind: 'implant', slot: 'legs', quality: 1, tags: ['kinetic'], fromEnemy: 'scav',
    name: { ru: 'Ходовые лапы «Шмыг»', en: '"Scurry" Walker Legs' },
    desc: {
      ru: 'Рывок сквозь врага сбивает его с ног (оглушение 0,6 с) и выбивает обломок для короба.',
      en: 'Dashing through an enemy knocks it down (0.6 s stun) and knocks loose scrap for the crate.',
    },
    icon: { shape: 'boot', color: C.steelL, accent: C.redD },
    hooks: {
      onDash(g) {
        g.mem.legsHit = new Set<Enemy>();
      },
      tick(g) {
        const p = g.player;
        if (p.dashT <= 0) return;
        const hit = (g.mem.legsHit ??= new Set<Enemy>()) as Set<Enemy>;
        for (const e of g.enemies) {
          if (!isFoe(e) || hit.has(e) || dist2(p.x, p.y, e.x, e.y) > (e.r + 6) ** 2) continue;
          hit.add(e);
          stun(e, 0.6);
          g.fx.burst(e.x, e.y, C.steelL, 5, 50, 0.25);
          dropJunk(g, e.x, e.y);
        }
      },
    },
  },
  {
    id: 'iScavCrate', kind: 'implant', slot: 'back', quality: 1, tags: ['heavy'], fromEnemy: 'scav',
    name: { ru: 'Хламовый короб', en: 'Junk Crate' },
    desc: {
      ru: 'Убитые враги роняют обломки (5 с). Подобранный обломок — заряд (до 6): следующий залп добавляет тяжёлый обломок (×1,5, пробивает +1).',
      en: 'Slain enemies drop scrap (5 s). Picked-up scrap is a charge (up to 6): your next volley adds a heavy chunk (×1.5, pierces +1).',
    },
    icon: { shape: 'crate', color: C.amberD, accent: C.steel },
    hooks: {
      onKill(g, e) {
        dropJunk(g, e.x, e.y);
      },
      onShoot(g, angle) {
        const c = g.mem.crate ?? 0;
        if (c <= 0) return;
        g.mem.crate = c - 1;
        heavyJunk(g, angle);
      },
      gauge: (g) => ({ kind: 'pips', color: C.amber, n: g.mem.crate ?? 0, max: CRATE_MAX }),
    },
  },

  // ================================================================ Трубач
  {
    id: 'wPunkPipe', kind: 'weapon', quality: 1, tags: ['kinetic'], fromEnemy: 'punk',
    name: { ru: 'Самопал «Труба»', en: '"Pipe" Zip Gun' },
    desc: {
      ru: 'Дробь из 3 пуль (урон 3). Попадание с дистанции 70–150 — «в точку»: ×1,4 и оглушение 0,3 с. Вплотную веер вдвое шире.',
      en: 'Buckshot of 3 pellets (3 damage). A hit from 70–150 range is a "sweet spot": ×1.4 and a 0.3 s stun. Point-blank, the spread doubles.',
    },
    icon: { shape: 'pipe', color: C.steel, accent: C.red },
    weapon: {
      mode: 'bullet',
      stats: (s) => {
        s.damage = 3;
        s.count = 3;
        s.spread = 0.16;
        s.fireDelay = 0.45;
        s.shotSpeed = 300;
        s.range = 210;
        s.shotStyle = 'pellet';
      },
      fire(g, angle, s) {
        const p = g.player;
        const close = coneTarget(g, angle, 0.8, CLOSE, false);
        fan(g, angle, close ? { ...s, spread: s.spread * 2 } : s, pipePellet());
        // «Личное пространство»: залп отшвыривает обычных врагов ближе 60 на 90 (раз в 0,8 с)
        if (hasSyn(g, SYN.punk) && g.time - (g.mem.punkShove ?? -9) >= 0.8) {
          let any = false;
          for (const e of g.enemies) {
            if (!isFoe(e) || e.def.heavy || e.def.boss || e.miniboss || dist2(p.x, p.y, e.x, e.y) > 60 * 60) continue;
            const a = angleTo(p.x, p.y, e.x, e.y);
            const need = 90 - Math.sqrt(dist2(p.x, p.y, e.x, e.y));
            e.kx = (Math.cos(a) * need) / 0.6;
            e.ky = (Math.sin(a) * need) / 0.6;
            any = true;
          }
          if (any) {
            g.mem.punkShove = g.time;
            g.fx.ring(p.x, p.y, C.bone, 60, 0.25);
          }
        }
      },
    },
  },
  {
    id: 'iPunkSoles', kind: 'implant', slot: 'legs', quality: 1, tags: ['kinetic'], fromEnemy: 'punk',
    name: { ru: 'Подошвы «Отскок»', en: '"Kickback" Soles' },
    desc: {
      ru: 'Рывок прочь от прицела на 25% короче, но в конце — бесплатный залп вперёд (×1,4, оглушение 0,3 с).',
      en: 'A dash away from your aim is 25% shorter but ends with a free forward volley (×1.4, 0.3 s stun).',
    },
    icon: { shape: 'boot', color: C.amber, accent: C.red },
    hooks: {
      onDash(g) {
        const p = g.player;
        const away = Math.abs(angleDiff(p.aimAngle, Math.atan2(p.dashDy, p.dashDx))) > Math.PI / 2;
        g.mem.recoil = away;
        if (away) p.dashK *= 0.75;
      },
      onDashEnd(g) {
        if (!g.mem.recoil) return;
        g.mem.recoil = false;
        const p = g.player, s = p.stats;
        fan(g, p.aimAngle, { ...s, damageMult: s.damageMult * 1.4 }, { tag: 'recoil', onHitEnemy: (_g, _b, e) => stun(e, 0.3) });
        g.fx.flash(p.x + Math.cos(p.aimAngle) * 7, p.y - 3 + Math.sin(p.aimAngle) * 7, C.yellow, 5, 0.08);
      },
    },
  },
  {
    id: 'iPunkBandolier', kind: 'implant', slot: 'torso', quality: 1, tags: ['kinetic'], fromEnemy: 'punk',
    name: { ru: 'Патронташ «Горсть»', en: '"Handful" Bandolier' },
    desc: {
      ru: 'Не стреляли 0,8 с — следующий залп летит кучно, без разброса, урон каждого снаряда ×1,4.',
      en: 'After 0.8 s without firing, your next volley flies tight with no scatter, each projectile ×1.4 damage.',
    },
    icon: { shape: 'belt', color: C.amberD, accent: C.yellow },
    hooks: {
      tick(g) {
        g.player.setBuff('handful', g.time - (g.mem.bandolierShot ?? -9) >= 0.8, handful);
      },
      onShoot(g) {
        g.mem.bandolierShot = g.time;
        g.player.setBuff('handful', false, handful);
      },
      gauge: (g) => (g.player.hasBuff('handful') ? { kind: 'pips', color: C.yellow, n: 1, max: 1 } : null),
    },
  },

  // ================================================================ Дрон-наблюдатель
  {
    id: 'pDroneRing', kind: 'passive', quality: 1, tags: ['smart'], fromEnemy: 'drone',
    name: { ru: 'Кольцевой сброс', en: 'Ring Drop' },
    desc: {
      ru: 'Снаряд, долетев до конца или до стены, рассыпается кольцом из 6 мелких пуль (30% урона). Дальность −15%.',
      en: 'A projectile that reaches its end or a wall bursts into a ring of 6 small bullets (30% damage). Range −15%.',
    },
    icon: { shape: 'burst', color: C.steelL, accent: C.amber },
    stats: (s) => {
      s.range *= 0.85;
    },
    hooks: {
      onShotEnd(g, b) {
        if (b.isChild || b.arc || b.orbitR || b.tag === 'ring') return;
        ringShots(g, b.x - Math.cos(b.angle) * 2, b.y - Math.sin(b.angle) * 2, 6, {
          dmg: b.dmg * 0.3, r: 1.5, life: 0.35, maxLife: 0.35, speed: 200, tag: 'ring', color: C.amber,
        });
      },
    },
  },
  {
    id: 'pDroneRange', kind: 'passive', quality: 1, tags: ['optic'], fromEnemy: 'drone',
    name: { ru: 'Протокол дистанции', en: 'Standoff Protocol' },
    desc: {
      ru: 'Пока ни один враг не ближе 120 — скорострельность +20%, дальность +15%. Враг ближе 50 — рефлекторный отскок на 40 (раз в 3 с).',
      en: 'While no enemy is within 120 — fire rate +20%, range +15%. An enemy within 50 triggers a reflex hop of 40 (once per 3 s).',
    },
    icon: { shape: 'crosshair', color: C.grey, accent: C.amber },
    hooks: {
      tick(g) {
        const p = g.player;
        // небольшой запас, чтобы бафф не мигал на границе
        const on = p.hasBuff('standoff') ? !nearestFoe(g, p.x, p.y, 115) : !nearestFoe(g, p.x, p.y, 120);
        p.setBuff('standoff', on, standoff);
        const close = nearestFoe(g, p.x, p.y, 50);
        if (close && g.time - (g.mem.reflexT ?? -9) >= 3) {
          g.mem.reflexT = g.time;
          blink(g, angleTo(close.x, close.y, p.x, p.y), 40);
        }
      },
    },
  },
  {
    id: 'pDroneScan', kind: 'passive', quality: 1, tags: ['optic', 'smart'], fromEnemy: 'drone',
    name: { ru: 'Сканер траекторий', en: 'Trajectory Scanner' },
    desc: {
      ru: 'Вражеские пули в конусе 60° перед вами (до 100) летят на 30% медленнее. Сбой копится на 10% быстрее.',
      en: 'Enemy bullets in a 60° cone in front of you (up to 100) fly 30% slower. Glitch charges 10% faster.',
    },
    icon: { shape: 'eye', color: C.steelL, accent: C.redL },
    stats: (s) => {
      s.glitchGain *= 1.1;
    },
    hooks: {
      tick(g) {
        const p = g.player;
        // «Полный надзор»: конус становится кругом
        const full = hasSyn(g, SYN.drone);
        for (const b of g.ebullets) {
          if (dist2(b.x, b.y, p.x, p.y) > 100 * 100) continue;
          if (!full && Math.abs(angleDiff(p.aimAngle, angleTo(p.x, p.y, b.x, b.y))) > Math.PI / 6) continue;
          b.slow = Math.max(b.slow ?? 0, 0.3);
        }
      },
    },
  },

  // ================================================================ Паук-мина
  {
    id: 'pSpiderSticky', kind: 'passive', quality: 1, tags: ['explosive'], fromEnemy: 'spiderMine',
    name: { ru: 'Липкий заряд', en: 'Sticky Charge' },
    desc: {
      ru: 'Каждый 3-й попавший снаряд прилипает к врагу, мигает 0,55 с и взрывается (радиус 20, ×2 урона).',
      en: 'Every 3rd projectile that hits sticks to the enemy, blinks for 0.55 s and explodes (radius 20, ×2 damage).',
    },
    icon: { shape: 'bomb', color: C.redD, accent: C.yellow },
    hooks: {
      onHit(g, e, hit) {
        if (hit.source !== 'bullet' || hit.bullet?.isChild) return;
        const n = (g.mem.stickyN ?? 0) + 1;
        g.mem.stickyN = n % 3;
        if (n >= 3) attachSticky(g, e, hit.dmg * 2);
      },
    },
  },
  {
    id: 'pSpiderCrawlers', kind: 'passive', quality: 1, tags: ['explosive', 'nano'], fromEnemy: 'spiderMine',
    name: { ru: 'Ползуны', en: 'Crawlers' },
    desc: {
      ru: 'Враг, убитый вплотную или вашим взрывом, оставляет паучка: 1,5 с бежит к врагу и взрывается (радиус 14, 60% урона). До 4.',
      en: 'An enemy killed point-blank or by your explosion leaves a spiderling: it runs at an enemy for 1.5 s and explodes (radius 14, 60% damage). Up to 4.',
    },
    icon: { shape: 'spider', color: C.steelL, accent: C.red },
    hooks: {
      onKill(g, e) {
        const p = g.player;
        const close = dist2(p.x, p.y, e.x, e.y) <= CLOSE * CLOSE;
        if (!close && e.lastHit?.source !== 'explosion') return;
        // «Паучий выводок»: живут, пока не найдут цель, рвутся кольцом и паутиной, до 6
        const brood = hasSyn(g, SYN.spider);
        if (objsOf(g, 'spider').length >= (brood ? 6 : 4)) return;
        const s = spawnSpider(g, e.x, e.y, {
          life: brood ? Infinity : 1.5, boomR: 14, dmg: shotDmg(g) * 0.6,
          onBoom: brood
            ? (g, x, y) => {
                ringShots(g, x, y, 12, { dmg: shotDmg(g) * 0.5, r: 1.8, life: 0.5, maxLife: 0.5, tag: 'brood' });
                webAt(g, x, y, 18);
              }
            : undefined,
        });
        // выводок без цели держится комнаты, где появился
        if (brood && g.zone) s.room = g.zone.id;
      },
    },
  },
  {
    id: 'pSpiderWeb', kind: 'passive', quality: 1, tags: ['nano'], fromEnemy: 'spiderMine',
    name: { ru: 'Паутинный заряд', en: 'Web Charge' },
    desc: {
      ru: 'Ваши взрывы оставляют на 2 с паутину: враги в ней замедлены на 40%, вражеские пули тормозят на 50%.',
      en: 'Your explosions leave a web for 2 s: enemies in it are slowed by 40%, enemy bullets by 50%.',
    },
    icon: { shape: 'web', color: C.grey, accent: C.bone },
    hooks: {
      onExplode(g, x, y, r) {
        webAt(g, x, y, r);
      },
    },
  },

  // ================================================================ Рой-бот
  {
    id: 'pSwarmFlock', kind: 'passive', quality: 1, tags: ['nano', 'smart'], fromEnemy: 'swarm',
    name: { ru: 'Стайный инстинкт', en: 'Flocking Instinct' },
    desc: {
      ru: 'Снаряды тянутся друг к другу; за каждого соседа рядом +8% урона (до +40%), одиночка −10%.',
      en: 'Projectiles pull toward each other; +8% damage per nearby neighbour (up to +40%), a loner deals −10%.',
    },
    icon: { shape: 'swarm', color: C.amber, accent: C.yellow },
    hooks: {
      tick(g, dt) {
        flock(g, dt);
      },
    },
  },
  {
    id: 'pSwarmPocket', kind: 'passive', quality: 1, tags: ['smart'], fromEnemy: 'swarm',
    name: { ru: 'Карманный рой', en: 'Pocket Swarm' },
    desc: {
      ru: '4 микробота летят за вами и повторяют каждый залп виляющей пулей (35% урона). Бот, задетый вражеской пулей, гасит её и гибнет, выпуская 3 ваших снаряда. Восстанавливается в новой комнате.',
      en: '4 microbots follow you and echo every volley with a weaving bullet (35% damage). A bot hit by an enemy bullet cancels it and dies, releasing 3 of your shots. Restored in a new room.',
    },
    icon: { shape: 'swarm', color: C.steel, accent: C.amber },
    hooks: {
      onRoomEnter(g) {
        topUpBots(g, POCKET_BOTS);
      },
      tick(g) {
        if (g.mem.pocketInit) return;
        g.mem.pocketInit = true;
        topUpBots(g, POCKET_BOTS);
      },
      onShoot(g, angle) {
        for (const bot of objsOf(g, 'bot')) {
          shotFrom(g, bot.x, bot.y, angle + (Math.random() - 0.5) * 0.1, {
            dmg: shotDmg(g) * 0.35, r: 1.6, wave: 5, waveFreq: 18, homing: 0, split: 0, explode: 0, tag: 'bot', color: C.amber,
          });
        }
      },
    },
  },
  {
    id: 'pSwarmInterceptors', kind: 'passive', quality: 1, tags: ['smart'], fromEnemy: 'swarm',
    name: { ru: 'Перехватчики', en: 'Interceptors' },
    desc: {
      ru: 'Не чаще раза в 0,8 с выстрел добавляет перехватчика: он летит к ближайшей вражеской пуле (до 120) и гасит её; пуль нет — бьёт врага (50% урона). До 3 одновременно.',
      en: 'At most once per 0.8 s a shot adds an interceptor: it flies at the nearest enemy bullet (up to 120) and cancels it; with no bullets it strikes an enemy (50% damage). Up to 3 at once.',
    },
    icon: { shape: 'drone', color: C.yellow, accent: C.bone },
    hooks: {
      onShoot(g) {
        if (g.time - (g.mem.icptT ?? -9) < 0.8 || objsOf(g, 'interceptor').length >= 3) return;
        g.mem.icptT = g.time;
        const p = g.player;
        spawnInterceptor(g, p.x, p.y - 4, {
          life: 4, seek: 120, dmg: shotDmg(g) * 0.5,
          // «Матка роя»: погашенная пуля становится новым ботом (до 8)
          onErase: (g, x, y) => {
            if (!hasSyn(g, SYN.swarm) || objsOf(g, 'bot').length >= QUEEN_BOTS) return;
            const b = spawnBot(g, botOpts);
            b.x = x;
            b.y = y;
          },
        });
      },
    },
  },
];

const handful = (s: import('../../game/stats').Stats) => {
  s.spread *= 0.2;
  s.jitter = 0;
  s.damageMult *= 1.4;
};

const standoff = (s: import('../../game/stats').Stats) => {
  s.fireRateMult *= 1.2;
  s.range *= 1.15;
};

/** Стайный инстинкт: снаряды тянутся к соседям (24 px), урон от числа соседей */
const FLOCK_R = 24;
function flock(g: Game, dt: number) {
  const list = g.pbullets.filter((b) => !b.dead && !b.arc && !b.orbitR && !b.isChild);
  if (!list.length) return;
  const cells = new Map<number, PBullet[]>();
  const key = (cx: number, cy: number) => cx * 73856093 ^ cy * 19349663;
  for (const b of list) {
    const k = key(Math.floor(b.x / FLOCK_R), Math.floor(b.y / FLOCK_R));
    let c = cells.get(k);
    if (!c) cells.set(k, (c = []));
    c.push(b);
  }
  for (const b of list) {
    const cx = Math.floor(b.x / FLOCK_R), cy = Math.floor(b.y / FLOCK_R);
    let n = 0, sx = 0, sy = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const o of cells.get(key(cx + dx, cy + dy)) ?? []) {
          if (o === b || dist2(o.x, o.y, b.x, b.y) > FLOCK_R * FLOCK_R) continue;
          n++;
          sx += o.x;
          sy += o.y;
        }
      }
    }
    if (n > 0) {
      const want = angleTo(b.x, b.y, sx / n, sy / n);
      const d = angleDiff(b.angle, want);
      b.angle += Math.max(-1.5 * dt, Math.min(1.5 * dt, d));
    }
    shotK(b, 'flock', n > 0 ? 1 + Math.min(0.4, 0.08 * n) : 0.9);
  }
}

/** Лёгкий кружок искр (для синергий) */
export function sparkRing(g: Game, x: number, y: number, color: string, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    g.fx.add({ kind: 'spark', x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, color, life: 0.25, glow: true });
  }
}
