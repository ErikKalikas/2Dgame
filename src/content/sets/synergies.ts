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
import { childShot, CLOSE, eraseBullets, hasSyn, ignite, SYN } from './common';
import { isFoe, stackCount } from '../../game/status';
import { snapEnemy } from '../../game/team';
import { forkPair } from './class4';
import { isSmallBullet } from '../../game/zones';

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

  // ---------------------------------------------------------------- III класс
  setSyn('mantis', 1, SYN.cutter1,
    { ru: 'Цепной росчерк', en: 'Chain Slash' },
    {
      ru: 'Рез сквозь врага в замахе или убийство резом сразу перезаряжает [E] (до 3 раз подряд); лезвия «Стружки» доворачивают к врагам.',
      en: 'A cut through a winding-up enemy or a kill with a cut instantly recharges [E] (up to 3 times in a row); Shavings blades curve toward enemies.',
    }),
  setSyn('mantis', 2, SYN.cutter2,
    { ru: 'Жатва', en: 'Harvest' },
    {
      ru: 'Лезвия «Ножен» срывают по 1 насечке при касании; «Росчерк» сквозь врага с 5 насечками — вскрытие: +8 за насечку и мгновенная перезарядка [E]; лезвия «Стружки» ставят насечки, враг в замахе получает 2 насечки за укол.',
      en: 'Scabbard blades rip 1 notch per touch; a Slash through an enemy with 5 notches opens it up: +8 per notch and an instant [E] recharge; Shavings blades leave notches, and an enemy winding up gets 2 notches per stab.',
    }),
  setSyn('flamer', 1, SYN.stoker1,
    { ru: 'Полная топка', en: 'Full Stoke' },
    {
      ru: 'Раз в 5 с огненное кольцо (100) поджигает врагов и сжигает мелкие пули в радиусе 50; стоя в своём огне, бак распылителя не расходуется.',
      en: 'Every 5 s a ring of fire (100) ignites enemies and burns small bullets within 50; while you stand in your own fire, the sprayer tank does not drain.',
    },
    {
      tick(g, dt) {
        g.mem.stokeT = (g.mem.stokeT ?? 0) + dt;
        if (g.mem.stokeT < 5 || !g.inCombat()) return;
        g.mem.stokeT = 0;
        const p = g.player;
        for (const e of g.enemies) if (isFoe(e) && dist2(e.x, e.y, p.x, p.y) <= (100 + e.r) ** 2) ignite(e, 6);
        eraseBullets(g, p.x, p.y, 50, C.amber, isSmallBullet);
        g.fx.ring(p.x, p.y, C.amber, 100, 0.45);
        g.fx.ring(p.x, p.y, C.red, 50, 0.3);
      },
    }),
  setSyn('flamer', 2, SYN.stoker2,
    { ru: 'Доменная печь', en: 'Blast Furnace' },
    {
      ru: '«Топка» берёт огонь со всей комнаты; угли и лужи дают усиленный «жар» (×2, взрыв 18); каждые 4 попавших «жара» — −1 с перезарядки, не больше 6 с за выброс.',
      en: 'The Firebox draws fire from the whole room; embers and puddles give boosted heat (×2, blast 18); every 4 heat hits cut 1 s of cooldown, at most 6 s per release.',
    }),
  setSyn('heavy', 1, SYN.heavy1,
    { ru: 'Живая стена', en: 'Living Wall' },
    {
      ru: 'Пули «Вала» в точке схождения замирают на 0,8 с и смыкаются в стену: гасит пули, ранит проходящих врагов; с полной «Лентой» — 1,6 с.',
      en: 'Rampart bullets freeze at the convergence point for 0.8 s and lock into a wall that cancels bullets and wounds enemies passing through; with a full Belt — 1.6 s.',
    }),
  setSyn('heavy', 2, SYN.heavy2,
    { ru: 'Огневой вал', en: 'Barrage Wall' },
    {
      ru: 'Болванка подхватывает спецзаряды без паузы — взрыв при каждом пробитии врага или щита; сбитая плита «Утюга» сразу выпускает болванку.',
      en: 'The slug picks up special charges without a pause — exploding at every enemy or shield it punches through; a broken Flatiron plate instantly fires a slug.',
    }),
  setSyn('gekko', 1, SYN.flea1,
    { ru: 'Жёсткая посадка', en: 'Hard Landing' },
    {
      ru: 'В прыжке каждый выстрел дублируется навесом; приземление подбрасывает всех обычных врагов в радиусе 80.',
      en: 'Mid-jump, every shot is duplicated as a lob; landing tosses every normal enemy within 80.',
    },
    {
      onVolleyShot(g, b) {
        const p = g.player;
        if (p.dashT <= 0 || !p.stats.dashJump) return;
        childShot(g, b.x, b.y, b.angle, {
          speed: b.speed, life: b.life, maxLife: b.maxLife, arc: 22, landR: 18, dmg: b.dmg * 1.5, r: b.r, color: b.color, style: b.style, tag: 'lobDup',
        });
      },
    }),
  setSyn('gekko', 2, SYN.flea2,
    { ru: 'Блошиный цирк', en: 'Flea Circus' },
    {
      ru: 'Каждый 3-й укус блохи кусает в привод; новый носитель получает половину замедления прежнего; снаряды «Навеса» при падении сажают блоху; подброшенный «Катапультой» враг при падении рассыпает по блохе на врагов в радиусе 60.',
      en: 'Every 3rd flea bite is a drive bite; a new host gets half of the previous host’s slow; Lob shells plant a flea when they land; an enemy tossed by the Catapult scatters a flea onto each enemy within 60 when it lands.',
    }),

  // ---------------------------------------------------------------- IV класс
  setSyn('psycho', 1, SYN.snap1,
    { ru: 'Полный срыв', en: 'Total Snap' },
    {
      ru: 'Убийство тараном или выплеском срывает с поводка врагов в радиусе 70 на 3 с и даёт 10% заряда сбоя; в момент выплеска каждый сорванный враг тоже бьёт кольцом — по своим.',
      en: 'A kill by ram or outburst snaps the leash of enemies within 70 for 3 s and gives 10% glitch charge; at the moment of the outburst, every snapped enemy also fires a ring — at its own side.',
    },
    {
      onKill(g, e) {
        const tag = e.lastHit?.tag;
        if (tag !== 'ram' && tag !== 'surge') return;
        for (const o of g.enemies) if (o !== e && isFoe(o) && dist2(o.x, o.y, e.x, e.y) <= 70 * 70) snapEnemy(g, o, 3);
        const p = g.player;
        if (p.glitchT <= 0) p.glitch = Math.min(1, p.glitch + 0.1);
        g.fx.ring(e.x, e.y, C.violet, 70, 0.35);
      },
    }),
  setSyn('psycho', 2, SYN.snap2,
    { ru: 'Без поводка', en: 'Off the Leash' },
    {
      ru: 'Враги, сорванные «Обрывком» или «Разъёмом», дерутся за вас — их убийства закрывают «Долг боли»; выплеск «Петли срыва» сам бросает цепь «Обрыв» в ближайшего врага с полным уроном; пока горит долг, «Таран» сносит и тяжёлых врагов.',
      en: 'Enemies snapped by the Torn Leash or the Rabid Socket fight for you — their kills pay off the Pain Debt; the Snap Loop outburst throws the Snapback chain at the nearest enemy at full damage; while a debt burns, the Ram bowls over heavy enemies too.',
    }),
  setSyn('mechanoid', 1, SYN.mech1,
    { ru: 'Огневой расчёт', en: 'Fire Crew' },
    {
      ru: 'Каждые 3 убийства целей с пеленгом — внеочередная пара ракет «Вилки».',
      en: 'Every 3 kills of targets with a bearing call an extra pair of Fork rockets.',
    },
    {
      onKill(g, e) {
        if (stackCount(e, 'bearing') === 0) return;
        g.mem.crewN = (g.mem.crewN ?? 0) + 1;
        if (g.mem.crewN % 3) return;
        const p = g.player;
        const t = g.seekEnemy(p.x, p.y, 200);
        if (t) forkPair(g, t);
      },
    }),
  setSyn('mechanoid', 2, SYN.mech2,
    { ru: 'Ответный удар', en: 'Counterstrike' },
    {
      ru: 'Пуля, сбитая «КАЗом», сразу отвечает парой ракет «Вилки» в стрелявшего и ставит на него пеленг; каждая цель с пеленгом, убитая ракетами, — −2 с перезарядки «КАЗ» (не больше −6 с за цикл).',
      en: 'A bullet shot down by the APS instantly answers with a pair of Fork rockets at the shooter and puts a bearing on it; every bearing target killed by rockets cuts the APS cooldown by 2 s (at most 6 s per cycle).',
    }),
];

