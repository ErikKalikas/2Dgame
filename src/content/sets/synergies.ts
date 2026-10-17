import type { L } from '../../core/i18n';
import { angleTo, dist2 } from '../../core/math';
import { C } from '../../gfx/palette';
import type { Hooks, SynergyDef } from '../../game/items';
import { collectScraps, isTethered, nearestFoe, shotDmg, shotFrom, spawnDecoy } from '../../game/minions';
import { bossLike } from '../../game/status';
import { summonAlly } from '../../game/team';
import { ENEMY_BY_ID } from '../enemies';
import { heavyJunk, sparkRing } from './class1';
import { flickering, fireFiveFrom, spawnCross } from './class2';
import { CLOSE, SYN, hasSyn } from './common';

// Синергии наборов врагов (этап 12б). Ступень 1 — «ядро набора»: ровно три первых предмета из drops
// врага; ступень 2 — весь набор (у врагов I класса набор из 3 предметов, синергия одна).
// Большая часть синергий меняет поведение самих предметов (проверка hasSyn в их хуках),
// здесь — только то, что не принадлежит одному предмету.

/** Предметы, нужные для ступени синергии набора */
export function setItems(enemy: string, tier: 1 | 2): string[] {
  const d = ENEMY_BY_ID.get(enemy)?.drops ?? [];
  return tier === 1 ? d.slice(0, 3) : d;
}

function setSyn(enemy: string, tier: 1 | 2, id: string, name: L, desc: L, hooks?: Hooks): SynergyDef {
  return { id, name, desc, set: enemy, tier, requires: (has) => setItems(enemy, tier).every(has), hooks };
}

export const SET_SYNERGIES: SynergyDef[] = [
  // ---------------------------------------------------------------- I класс
  setSyn('scav', 1, SYN.scav,
    { ru: 'Жор', en: 'Gorge' },
    {
      ru: 'Убийство врага вплотную восстанавливает рывок (не чаще раза в 1,5 с); рывок собирает обломки в радиусе 80, при полном коробе — выстреливает весь запас веером.',
      en: 'A point-blank kill restores your dash (at most once per 1.5 s); a dash collects scrap within 80, and with a full crate fires the whole load in a fan.',
    },
    {
      onKill(g, e) {
        const p = g.player;
        if (dist2(p.x, p.y, e.x, e.y) > CLOSE * CLOSE || g.time - (g.mem.gorgeT ?? -9) < 1.5) return;
        g.mem.gorgeT = g.time;
        p.dashCd = 0;
        p.dashLeft = p.stats.dashCharges;
        sparkRing(g, p.x, p.y - 4, C.amber, 6);
      },
      onDash(g) {
        const p = g.player;
        collectScraps(g, 'junk', p.x, p.y, 80);
        if ((g.mem.crate ?? 0) < 6) return;
        for (let i = 0; i < 6; i++) heavyJunk(g, p.aimAngle + (i - 2.5) * 0.18);
        g.mem.crate = 0;
      },
    }),
  setSyn('punk', 1, SYN.punk,
    { ru: 'Личное пространство', en: 'Personal Space' },
    {
      ru: 'Залп «Трубы» отшвыривает обычных врагов ближе 60 на дистанцию 90 (раз в 0,8 с; не тяжёлых и не боссов); попадание «в точку» рикошетит в соседнего врага.',
      en: 'A Pipe volley flings normal enemies within 60 out to 90 (once per 0.8 s; not heavies or bosses); a sweet-spot hit ricochets into a neighbouring enemy.',
    }),
  setSyn('drone', 1, SYN.drone,
    { ru: 'Полный надзор', en: 'Total Surveillance' },
    {
      ru: 'Конус сканера становится кругом; пока враги дальше 120, каждые 2,3 с — кольцо из 8 снарядов (70% урона), каждый рассыпается кольцевым сбросом.',
      en: 'The scanner cone becomes a full circle; while enemies stay beyond 120, every 2.3 s fires a ring of 8 shots (70% damage), each bursting into a ring drop.',
    },
    {
      tick(g, dt) {
        const p = g.player;
        g.mem.watchT = (g.mem.watchT ?? 0) + dt;
        if (g.mem.watchT < 2.3) return;
        if (!g.inCombat() || nearestFoe(g, p.x, p.y, 120)) return;
        g.mem.watchT = 0;
        for (let i = 0; i < 8; i++) {
          shotFrom(g, p.x, p.y - 3, (i / 8) * Math.PI * 2, { dmg: shotDmg(g) * 0.7, tag: 'watch', split: 0, homing: 0 });
        }
        g.fx.ring(p.x, p.y, C.amber, 20, 0.25);
      },
    }),
  setSyn('spiderMine', 1, SYN.spider,
    { ru: 'Паучий выводок', en: 'Spider Brood' },
    {
      ru: 'Паучки живут, пока не найдут цель, взрываются кольцом из 12 ваших снарядов (50% урона) и оставляют паутину. До 6.',
      en: 'Spiderlings live until they find a target, explode into a ring of 12 of your shots (50% damage) and leave a web. Up to 6.',
    }),
  setSyn('swarm', 1, SYN.swarm,
    { ru: 'Матка роя', en: 'Swarm Queen' },
    {
      ru: 'Погашенная перехватчиком пуля становится новым ботом роя (до 8).',
      en: 'A bullet cancelled by an interceptor becomes a new swarm bot (up to 8).',
    }),

  // ---------------------------------------------------------------- II класс
  setSyn('guard', 1, SYN.guard1,
    { ru: 'Пост охраны', en: 'Guard Post' },
    {
      ru: 'Каждые 3 пули, погашенные пластиной, — вращающаяся крестовина вокруг вас на 2 с (гасит пули, толкает врагов); болт «Турникета» сквозь лопасть раздваивается.',
      en: 'Every 3 bullets stopped by the plate spawn a spinning cross around you for 2 s (cancels bullets, pushes enemies); a Turnstile bolt through a blade splits in two.',
    }),
  setSyn('guard', 2, SYN.guard2,
    { ru: 'Пропуск аннулирован', en: 'Pass Revoked' },
    {
      ru: 'Оглушённый «Турникетом» враг досмотрен: пока оглушён, все попадания по нему — как сбоку (×1,5 «Щели») и сквозь щиты; его убийство сразу даёт крестовину «Поста охраны». Во время взлома (R) крестовина крутится вокруг вас постоянно.',
      en: 'An enemy stunned by the Turnstile is searched: while stunned, every hit counts as a flank hit (×1.5 Slit) and ignores shields; killing it instantly grants a Guard Post cross. While hacking (R), the cross spins around you constantly.',
    },
    {
      onKill(g, e) {
        if ((e.mem.inspected ?? -1) >= g.time) spawnCross(g, 2);
      },
      tick(g) {
        if (g.hacking) spawnCross(g, 0.25);
      },
    }),
  setSyn('netrunner', 1, SYN.blink1,
    { ru: 'Ложный след', en: 'False Trail' },
    {
      ru: 'Рывок во время мерцания оставляет на старом месте копию на 1,2 с: враги целятся в неё, в конце она выпускает веер «Пятерни».',
      en: 'Dashing while flickering leaves a copy behind for 1.2 s: enemies aim at it, and at the end it fires a Five Fingers fan.',
    },
    {
      onDash(g) {
        // «Короткое замыкание»: копия на каждом рывке, пуля в копию заряжает сбой как пролёт вплотную
        const full = hasSyn(g, SYN.blink2);
        if (!full && !flickering(g)) return;
        const p = g.player;
        spawnDecoy(g, p.x, p.y, {
          life: 1.2,
          onEnd(g, x, y) {
            const t = nearestFoe(g, x, y, 320);
            fireFiveFrom(g, x, y - 3, t ? angleTo(x, y, t.x, t.y) : g.player.aimAngle);
          },
          onBullet: full
            ? (g) => {
                const p = g.player;
                if (p.glitchT <= 0) p.glitch = Math.min(1, p.glitch + 0.03 * p.stats.glitchGain);
              }
            : undefined,
        });
      },
    }),
  setSyn('netrunner', 2, SYN.blink2,
    { ru: 'Короткое замыкание', en: 'Short Circuit' },
    {
      ru: 'Копия «Ложного следа» остаётся на каждом рывке (не только при мерцании); вражеская пуля, попавшая в копию, заряжает сбой как пролёт вплотную.',
      en: 'The False Trail copy appears on every dash (not only while flickering); an enemy bullet that hits the copy charges the glitch like a close graze.',
    }),
  setSyn('sniper', 1, SYN.sniper1,
    { ru: 'Холодный ствол', en: 'Cold Barrel' },
    {
      ru: 'В фокусе лазер «Отвеса» сжигает пересекающие его вражеские пули; убийство из «Отвеса» перебрасывает прицел на ближайшего врага.',
      en: 'In focus, the Plumb Line laser burns enemy bullets crossing it; a Plumb Line kill snaps the lock to the nearest enemy.',
    }),
  setSyn('sniper', 2, SYN.sniper2,
    { ru: 'Позиция', en: 'Position' },
    {
      ru: 'В фокусе на «Треноге» дрон ставит отметку каждую секунду (до 3 отметок); выстрел «Отвеса» по отмеченной цели рикошетит в следующую отмеченную.',
      en: 'In focus on the Tripod, the drone marks every second (up to 3 marks); a Plumb Line shot at a marked target ricochets to the next marked one.',
    }),
  setSyn('turret', 1, SYN.turret1,
    { ru: 'Огневая точка', en: 'Firing Nest' },
    {
      ru: 'Вертушки поворачивают струи к вашему прицелу, стреляют вдвое чаще, живут 4 с (до 4); пока стоит вертушка, термоцикл не перегревается.',
      en: 'Spinners turn their jets toward your aim, fire twice as often and last 4 s (up to 4); while a spinner stands, the thermal cycle does not overheat.',
    }),
  setSyn('turret', 2, SYN.turret2,
    { ru: 'Укрепрайон', en: 'Fortified Zone' },
    {
      ru: 'Вертушки стоят до конца комнаты (до 3) в режиме часового — сами бьют врагов в радиусе 90; при перегреве термоцикла пар сбрасывает и каждая вертушка.',
      en: 'Spinners stay until the room is over (up to 3) in sentry mode, hitting enemies within 90 by themselves; when the thermal cycle overheats, every spinner vents steam too.',
    }),
  setSyn('repair', 1, SYN.repair1,
    { ru: 'Полевой ремонт', en: 'Field Repair' },
    {
      ru: 'Враг, убитый в сцепке, встаёт вашим союзником на 6 с (30% здоровья, стреляет по врагам).',
      en: 'An enemy killed while tethered rises as your ally for 6 s (30% health, fires at enemies).',
    },
    {
      onKill(g, e) {
        if (!isTethered(g, e) || bossLike(e) || e.summon) return;
        // «Мастерская»: союзник живёт до конца комнаты, не больше двух
        const workshop = hasSyn(g, SYN.repair2);
        if (workshop && g.enemies.filter((o) => !o.dead && o.summon).length >= 2) return;
        const a = summonAlly(g, e.def, e.x, e.y, 0.3, workshop ? Infinity : 6);
        if (workshop && g.zone) a.allyRoom = g.zone.id;
      },
    }),
  setSyn('repair', 2, SYN.repair2,
    { ru: 'Мастерская', en: 'Workshop' },
    {
      ru: 'Союзник «Полевого ремонта» живёт до конца комнаты (до 2) и сам подбирает запчасти; сцепной луч можно натянуть между врагом и союзником.',
      en: 'The Field Repair ally lasts until the room is over (up to 2) and picks up spare parts itself; the tether beam can link an enemy and an ally.',
    },
    {
      tick(g) {
        for (const a of g.enemies) if (!a.dead && a.summon && a.spawn <= 0) collectScraps(g, 'part', a.x, a.y, 12, a);
      },
    }),
];

