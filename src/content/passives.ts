import { TAU } from '../core/math';
import { C } from '../gfx/palette';
import { spawnShot } from '../game/combat';
import type { Game } from '../game/game';
import type { ItemDef } from '../game/items';
import { finalDamage } from '../game/stats';

/** Сколько раз взята модификация (для хуков, которым не передаётся число стаков) */
const stacksOf = (g: Game, id: string) => g.player.passives.get(id) ?? 1;

// Модификации — выбор 1 из 2 при повышении уровня. Многие можно брать несколько раз (maxStacks).
// Они не только меняют числа, но и траектории, размер и тип атаки.

export const PASSIVES: ItemDef[] = [
  {
    id: 'sineDrive', kind: 'passive', quality: 1, tags: ['electric'], maxStacks: 2,
    name: { ru: 'Синус-привод', en: 'Sine Drive' },
    desc: { ru: 'Снаряды летят волной. Урон +10%.', en: 'Shots travel in a wave. Damage +10%.' },
    icon: { shape: 'wave', color: C.amber, accent: C.yellow },
    stats: (s, n) => {
      s.wave += 7 * n;
      s.damageMult *= 1 + 0.1 * n;
    },
  },
  {
    id: 'heavyRounds', kind: 'passive', quality: 1, tags: ['heavy'], maxStacks: 3,
    name: { ru: 'Тяжёлые сердечники', en: 'Heavy Cores' },
    desc: { ru: 'Снаряды крупнее и сильнее, но медленнее.', en: 'Bigger and stronger shots, but slower.' },
    icon: { shape: 'orb', color: C.steel, accent: C.red },
    stats: (s, n) => {
      s.size *= 1 + 0.3 * n;
      s.damageMult *= 1 + 0.18 * n;
      s.shotSpeed *= 1 - 0.1 * n;
    },
  },
  {
    id: 'ricochet', kind: 'passive', quality: 2, tags: ['kinetic'], maxStacks: 2,
    name: { ru: 'Рикошет', en: 'Ricochet' },
    desc: { ru: 'Снаряды отскакивают от стен.', en: 'Shots bounce off walls.' },
    icon: { shape: 'disc', color: C.steelL, accent: C.amber },
    stats: (s, n) => {
      s.bounce += 2 * n;
    },
  },
  {
    id: 'tumorGrowth', kind: 'passive', quality: 2, tags: ['mutation'], maxStacks: 2,
    name: { ru: 'Мутация: опухолевый рост', en: 'Mutation: Tumor Growth' },
    desc: { ru: 'Снаряды растут в полёте. Скорострельность −10%.', en: 'Shots grow in flight. Fire rate −10%.' },
    icon: { shape: 'mutation', color: C.redD, accent: C.violet },
    stats: (s, n) => {
      s.grow += 5 * n;
      s.fireRateMult *= 1 - 0.1 * n;
    },
  },
  {
    id: 'splitter', kind: 'passive', quality: 2, tags: ['kinetic'], maxStacks: 2,
    name: { ru: 'Кассетный заряд', en: 'Cluster Payload' },
    desc: { ru: 'При попадании снаряд распадается на 3 осколка.', en: 'On hit, the shot splits into 3 shards.' },
    icon: { shape: 'core', color: C.amber, accent: C.red },
    stats: (s, n) => {
      s.split += 3 * n;
    },
  },
  {
    id: 'servoLegs', kind: 'passive', quality: 1, tags: ['kinetic'], maxStacks: 3,
    name: { ru: 'Сервоприводы ног', en: 'Leg Servos' },
    desc: { ru: 'Скорость +10%, рывок перезаряжается быстрее.', en: 'Speed +10%, dash recharges faster.' },
    icon: { shape: 'leg', color: C.steel, accent: C.yellow },
    stats: (s, n) => {
      s.speed *= 1 + 0.1 * n;
      s.dashCd *= 1 - 0.15 * n;
    },
  },

  // ---------------------------------------------------------------------------
  // Мутации: заражённые наниты, хромовый рак, разросшаяся биоткань. Сильные, но с изъяном.

  {
    id: 'pMutChromeCancer', kind: 'passive', quality: 2, tags: ['mutation', 'heavy'], maxStacks: 2,
    name: { ru: 'Мутация: хромовый рак', en: 'Mutation: Chrome Cancer' },
    desc: {
      ru: 'Снаряды — тяжёлые диски: размер +20%, урон +15%, пробивание +1. Хитбокс больше (+0.5).',
      en: 'Shots become heavy discs: size +20%, damage +15%, pierce +1. Hitbox grows (+0.5).',
    },
    icon: { shape: 'mutation', color: C.steelL, accent: C.redL },
    stats: (s, n) => {
      s.shotStyle = 'disc';
      s.size *= 1 + 0.2 * n;
      s.damageMult *= 1 + 0.15 * n;
      s.pierce += n;
      s.hitR += 0.5 * n;
    },
  },
  {
    id: 'pMutCorruptNanites', kind: 'passive', quality: 2, tags: ['mutation', 'nano'], maxStacks: 2,
    name: { ru: 'Мутация: гнилые наниты', en: 'Mutation: Corrupted Nanites' },
    desc: {
      ru: 'При попадании снаряд рассыпается на 2 осколка и взламывает цель (+12% урона по ней). Макс. жизней −1.',
      en: 'On hit, shots burst into 2 shards and hack the target (+12% damage taken). Max lives −1.',
    },
    icon: { shape: 'dna', color: C.grey, accent: C.red },
    stats: (s, n) => {
      s.split += 2 * n;
      s.hack += 0.12 * n;
      s.maxLives -= 1;
    },
  },
  {
    id: 'pMutBoneSpurs', kind: 'passive', quality: 1, tags: ['mutation', 'blade'], maxStacks: 2,
    name: { ru: 'Мутация: костяные шпоры', en: 'Mutation: Bone Spurs' },
    desc: {
      ru: 'Снаряды — костяные осколки с пробиванием +1. При ранении из тела вырываются 8 шпор. Скорость бега −6%.',
      en: 'Shots become bone shards, pierce +1. When hurt, 8 spurs burst from your body. Move speed −6%.',
    },
    icon: { shape: 'spine', color: C.bone, accent: C.redD },
    stats: (s, n) => {
      s.shotStyle = 'shard';
      s.pierce += n;
      s.speed *= 1 - 0.06 * n;
    },
    hooks: {
      onHurt(g) {
        const s = g.player.stats;
        const k = 4 + 4 * stacksOf(g, 'pMutBoneSpurs');
        for (let i = 0; i < k; i++) {
          spawnShot(g, (i / k) * TAU, s, {
            style: 'shard', color: C.bone, dmg: finalDamage(s) * 1.2, pierce: 3, speed: 260,
            life: 0.5, maxLife: 0.5, homing: 0, wave: 0, spiral: 0, orbitR: 0, boomerang: false, isChild: true,
          });
        }
      },
    },
  },
  {
    id: 'pMutCyberPsychosis', kind: 'passive', quality: 3, tags: ['mutation', 'neural'], maxStacks: 2,
    name: { ru: 'Мутация: сорванный поводок', en: 'Mutation: Snapped Leash' },
    desc: {
      ru: '+1 снаряд в веере, скорострельность +12%, снаряды дёргаются волной. Сильный разброс, урон −8%.',
      en: '+1 shot in the fan, fire rate +12%, shots twitch in a wave. Wild spread, damage −8%.',
    },
    icon: { shape: 'brain', color: C.red, accent: C.violet },
    stats: (s, n) => {
      s.count += n;
      s.fireRateMult *= 1 + 0.12 * n;
      s.wave += 3 * n;
      s.jitter += 0.1 * n;
      s.damageMult *= 1 - 0.08 * n;
    },
  },
  {
    id: 'pMutParasiticCode', kind: 'passive', quality: 2, tags: ['mutation', 'smart'], maxStacks: 2,
    name: { ru: 'Мутация: паразитный код', en: 'Mutation: Parasitic Code' },
    desc: {
      ru: 'Снаряды сами ищут жертву и взламывают её (+10% урона по ней). Скорость снарядов −12%.',
      en: 'Shots seek out prey and hack it (+10% damage taken). Shot speed −12%.',
    },
    icon: { shape: 'chip', color: C.violet, accent: C.red },
    stats: (s, n) => {
      s.homing += 2.5 * n;
      s.hack += 0.1 * n;
      s.shotSpeed *= 1 - 0.12 * n;
      s.shotColor = C.violet;
    },
  },
  {
    id: 'pMutHiveSpores', kind: 'passive', quality: 1, tags: ['mutation'], maxStacks: 2,
    name: { ru: 'Мутация: споровый улей', en: 'Mutation: Spore Hive' },
    desc: {
      ru: 'Снаряды — комки биомассы. Убитый враг выпускает 2 самонаводящиеся споры. Скорострельность −8%.',
      en: 'Shots become biomass pellets. Killed enemies release 2 homing spores. Fire rate −8%.',
    },
    icon: { shape: 'mutation', color: C.amberD, accent: C.yellow },
    stats: (s, n) => {
      s.shotStyle = 'pellet';
      s.fireRateMult *= 1 - 0.08 * n;
    },
    hooks: {
      onKill(g, e) {
        const s = g.player.stats;
        const k = 1 + stacksOf(g, 'pMutHiveSpores');
        for (let i = 0; i < k; i++) {
          spawnShot(g, Math.random() * TAU, s, {
            x: e.x, y: e.y, bx: e.x, by: e.y, style: 'orb', color: C.amber, r: 2, speed: 150,
            dmg: finalDamage(s) * 0.6, homing: 6, life: 1.3, maxLife: 1.3, pierce: 0,
            wave: 0, spiral: 0, orbitR: 0, boomerang: false, split: 0, explode: 0, isChild: true,
          });
        }
      },
    },
  },
  {
    id: 'pMutBoilingBlood', kind: 'passive', quality: 3, tags: ['mutation', 'fire'], maxStacks: 1,
    name: { ru: 'Мутация: кипящая кровь', en: 'Mutation: Boiling Blood' },
    desc: {
      ru: 'Снаряды — сгустки плазмы: взрываются (радиус 14) и поджигают (4/с). Урон +15%, макс. жизней −1.',
      en: 'Shots become plasma clots: they explode (radius 14) and burn (4/s). Damage +15%, max lives −1.',
    },
    icon: { shape: 'heart', color: C.redL, accent: C.amber },
    stats: (s) => {
      s.shotStyle = 'plasma';
      s.shotColor = C.redL;
      s.explode += 14;
      s.burn += 4;
      s.damageMult *= 1.15;
      s.maxLives -= 1;
    },
  },
  {
    id: 'pMutSpineTail', kind: 'passive', quality: 1, tags: ['mutation', 'kinetic'], maxStacks: 2,
    name: { ru: 'Мутация: хвост-позвоночник', en: 'Mutation: Spine Tail' },
    desc: {
      ru: 'Из спины растёт хвост, стреляющий назад. Урон +8%, отбрасывание сильнее. Рывок перезаряжается на 12% дольше.',
      en: 'A tail grows from your back and fires backwards. Damage +8%, more knockback. Dash recharges 12% slower.',
    },
    icon: { shape: 'whip', color: C.bone, accent: C.red },
    stats: (s, n) => {
      s.backShot = true;
      s.damageMult *= 1 + 0.08 * n;
      s.knockback += 20 * n;
      s.dashCd *= 1 + 0.12 * n;
    },
  },

  // ---------------------------------------------------------------------------
  // Киберимпланты и прошивки оружия

  {
    id: 'pOrbitalShards', kind: 'passive', quality: 2, tags: ['nano', 'kinetic'], maxStacks: 3,
    name: { ru: 'Орбитальные осколки', en: 'Orbital Shards' },
    desc: {
      ru: 'С шансом 20% выстрел выпускает осколок, который кружит вокруг вас и режет врагов. Скорострельность −5%.',
      en: '20% chance per shot to release a shard that circles you, cutting enemies. Fire rate −5%.',
    },
    icon: { shape: 'gear', color: C.steelL, accent: C.yellow },
    stats: (s, n) => {
      s.fireRateMult *= 1 - 0.05 * n;
    },
    hooks: {
      onShoot(g, angle) {
        if (Math.random() >= 0.2 * stacksOf(g, 'pOrbitalShards')) return;
        const s = g.player.stats;
        spawnShot(g, angle, s, {
          orbitR: 16, speed: 180, life: 1.5, maxLife: 1.5, style: 'shard', color: C.bone,
          dmg: finalDamage(s) * 0.6, pierce: 2 + s.pierce, homing: 0, wave: 0, spiral: 0,
          boomerang: false, bounce: 0, isChild: true,
        });
      },
    },
  },
  {
    id: 'pBoomerangFrame', kind: 'passive', quality: 2, tags: ['blade', 'kinetic'], maxStacks: 2,
    name: { ru: 'Возвратная рама', en: 'Return Frame' },
    desc: {
      ru: 'Снаряды — режущие диски, возвращаются бумерангом. Дальность +25%, пробивание +1. Скорострельность −10%.',
      en: 'Shots become cutting discs that return like a boomerang. Range +25%, pierce +1. Fire rate −10%.',
    },
    icon: { shape: 'disc', color: C.amber, accent: C.bone },
    stats: (s, n) => {
      s.boomerang = true;
      s.shotStyle = 'disc';
      s.range *= 1.25;
      s.pierce += n;
      s.fireRateMult *= 0.9;
    },
  },
  {
    id: 'pHelixCoil', kind: 'passive', quality: 1, tags: ['electric'], maxStacks: 2,
    name: { ru: 'Спиральная катушка', en: 'Helix Coil' },
    desc: {
      ru: 'Снаряды закручиваются по дуге. Шанс оглушения +8%, дальность +10%.',
      en: 'Shots curve along a spiral arc. Stun chance +8%, range +10%.',
    },
    icon: { shape: 'coil', color: C.amber, accent: C.yellow },
    stats: (s, n) => {
      s.spiral += 1.2 * n;
      s.shock += 0.08 * n;
      s.range *= 1 + 0.1 * n;
    },
  },
  {
    id: 'pRailAccelerator', kind: 'passive', quality: 1, tags: ['kinetic'], maxStacks: 2,
    name: { ru: 'Рельсовый ускоритель', en: 'Rail Accelerator' },
    desc: {
      ru: 'Снаряды стартуют на 10% медленнее, но разгоняются в полёте. Урон +8%, отбрасывание сильнее.',
      en: 'Shots start 10% slower but accelerate in flight. Damage +8%, more knockback.',
    },
    icon: { shape: 'battery', color: C.steel, accent: C.yellow },
    stats: (s, n) => {
      s.accel *= 1 + 0.7 * n;
      s.shotSpeed *= 1 - 0.1 * n;
      s.damageMult *= 1 + 0.08 * n;
      s.knockback += 15 * n;
    },
  },
  {
    id: 'pGravityBrake', kind: 'passive', quality: 1, tags: ['heavy'], maxStacks: 2,
    name: { ru: 'Гравитормоз', en: 'Gravity Brake' },
    desc: {
      ru: 'Снаряды тормозят и зависают в воздухе, как мины. Дальность +25%, размер +10%, замедляют врагов на 15%.',
      en: 'Shots decelerate and hang in the air like mines. Range +25%, size +10%, slow enemies by 15%.',
    },
    icon: { shape: 'orb', color: C.grey, accent: C.violet },
    stats: (s, n) => {
      s.accel *= Math.pow(0.6, n);
      s.range *= 1 + 0.25 * n;
      s.size *= 1 + 0.1 * n;
      s.slow += 0.15 * n;
    },
  },
  {
    id: 'pNeedleArray', kind: 'passive', quality: 1, tags: ['blade'], maxStacks: 3,
    name: { ru: 'Игольчатый ствол', en: 'Needle Barrel' },
    desc: {
      ru: 'Снаряды — тонкие иглы: скорость +15%, пробивание +1, но размер −10%.',
      en: 'Shots become thin needles: speed +15%, pierce +1, but size −10%.',
    },
    icon: { shape: 'syringe', color: C.steelL, accent: C.bone },
    stats: (s, n) => {
      s.shotStyle = 'needle';
      s.shotSpeed *= 1 + 0.15 * n;
      s.pierce += n;
      s.size *= 1 - 0.1 * n;
    },
  },
  {
    id: 'pFlakFan', kind: 'passive', quality: 1, tags: ['kinetic'], maxStacks: 3,
    name: { ru: 'Веерный затвор', en: 'Fan Breech' },
    desc: {
      ru: '+1 снаряд в веере, веер шире. Урон каждого снаряда −12%.',
      en: '+1 shot in the fan, wider spread. Damage per shot −12%.',
    },
    icon: { shape: 'shotgun', color: C.steel, accent: C.amber },
    stats: (s, n) => {
      s.count += n;
      s.spread += 0.05 * n;
      s.damageMult *= 1 - 0.12 * n;
    },
  },
  {
    id: 'pThermiteCoating', kind: 'passive', quality: 1, tags: ['fire'], maxStacks: 3,
    name: { ru: 'Термитное покрытие', en: 'Thermite Coating' },
    desc: {
      ru: 'Снаряды — раскалённая плазма, поджигают врагов (2.5/с). Дальность −8%.',
      en: 'Shots become white-hot plasma that sets enemies ablaze (2.5/s). Range −8%.',
    },
    icon: { shape: 'fire', color: C.red, accent: C.amber },
    stats: (s, n) => {
      s.shotStyle = 'plasma';
      s.shotColor = C.red;
      s.burn += 2.5 * n;
      s.range *= 1 - 0.08 * n;
    },
  },
  {
    id: 'pArcConductor', kind: 'passive', quality: 2, tags: ['electric'], maxStacks: 3,
    name: { ru: 'Дуговой проводник', en: 'Arc Conductor' },
    desc: {
      ru: 'Попадание пускает молнию ещё на 1 врага, шанс оглушения +5%. Урон −5%.',
      en: 'Hits arc lightning to 1 more enemy, stun chance +5%. Damage −5%.',
    },
    icon: { shape: 'lightning', color: C.yellow, accent: C.amber },
    stats: (s, n) => {
      s.chain += n;
      s.shock += 0.05 * n;
      s.damageMult *= 1 - 0.05 * n;
      s.shotColor = C.yellow;
    },
  },
  {
    id: 'pFragWarheads', kind: 'passive', quality: 2, tags: ['explosive'], maxStacks: 2,
    name: { ru: 'Осколочные боеголовки', en: 'Frag Warheads' },
    desc: {
      ru: 'Снаряды — мини-ракеты, взрываются при попадании и в конце полёта (радиус 10). Скорость снарядов −10%, скорострельность −8%.',
      en: 'Shots become mini-rockets that explode on hit and at max range (radius 10). Shot speed −10%, fire rate −8%.',
    },
    icon: { shape: 'bomb', color: C.amber, accent: C.red },
    stats: (s, n) => {
      s.shotStyle = 'rocket';
      s.explode += 10 * n;
      s.shotSpeed *= 1 - 0.1 * n;
      s.fireRateMult *= 1 - 0.08 * n;
    },
  },
  {
    id: 'pPhaseShift', kind: 'passive', quality: 3, tags: ['stealth', 'optic'], maxStacks: 1,
    name: { ru: 'Фазовый сдвиг', en: 'Phase Shift' },
    desc: {
      ru: 'Снаряды проходят сквозь стены и пробивают +1 врага. Урон −10%.',
      en: 'Shots pass through walls and pierce +1 enemy. Damage −10%.',
    },
    icon: { shape: 'cloak', color: C.violet, accent: C.grey },
    stats: (s) => {
      s.spectral = true;
      s.pierce += 1;
      s.damageMult *= 0.9;
      s.shotColor = C.violet;
    },
  },
  {
    id: 'pSeekerOptics', kind: 'passive', quality: 2, tags: ['optic', 'smart'], maxStacks: 3,
    name: { ru: 'Оптика наведения', en: 'Seeker Optics' },
    desc: {
      ru: 'Снаряды доворачивают к ближайшему врагу. Шанс крита +4%, скорость снарядов −5%.',
      en: 'Shots steer toward the nearest enemy. Crit chance +4%, shot speed −5%.',
    },
    icon: { shape: 'eye', color: C.red, accent: C.yellow },
    stats: (s, n) => {
      s.homing += 2 * n;
      s.crit += 0.04 * n;
      s.shotSpeed *= 1 - 0.05 * n;
    },
  },
  {
    id: 'pBreachProtocol', kind: 'passive', quality: 2, tags: ['neural'], maxStacks: 2,
    name: { ru: 'Протокол вторжения', en: 'Breach Protocol' },
    desc: {
      ru: 'Снаряды летят частым зигзагом и взламывают цель: она получает +15% урона 4 с. Урон −5%.',
      en: 'Shots fly in a tight zigzag and hack the target: +15% damage taken for 4 s. Damage −5%.',
    },
    icon: { shape: 'mask', color: C.steelL, accent: C.red },
    stats: (s, n) => {
      s.wave += 3 * n;
      s.waveFreq = Math.max(s.waveFreq, 26);
      s.hack += 0.15 * n;
      s.damageMult *= 1 - 0.05 * n;
    },
  },
  {
    id: 'pMirrorPrism', kind: 'passive', quality: 3, tags: ['optic'], maxStacks: 1,
    name: { ru: 'Зеркальная призма', en: 'Mirror Prism' },
    desc: {
      ru: 'Каждый выстрел дублируется в обе стороны под прямым углом. Урон −15%.',
      en: 'Every shot is mirrored to both sides at right angles. Damage −15%.',
    },
    icon: { shape: 'crosshair', color: C.bone, accent: C.amber },
    stats: (s) => {
      s.sideShots = true;
      s.damageMult *= 0.85;
    },
  },
  {
    id: 'pBurstFirmware', kind: 'passive', quality: 3, tags: ['smart'], maxStacks: 2,
    name: { ru: 'Прошивка очереди', en: 'Burst Firmware' },
    desc: {
      ru: 'Каждое нажатие даёт очередь на +1 выстрел. Скорострельность −12%, разброс больше.',
      en: 'Each trigger pull fires a burst of +1 shot. Fire rate −12%, more spread.',
    },
    icon: { shape: 'smg', color: C.steel, accent: C.yellow },
    stats: (s, n) => {
      s.burst += n;
      s.fireRateMult *= 1 - 0.12 * n;
      s.jitter += 0.03 * n;
    },
  },
  {
    id: 'pSingularityCore', kind: 'passive', quality: 4, tags: ['heavy', 'explosive'], maxStacks: 1,
    name: { ru: 'Ядро сингулярности', en: 'Singularity Core' },
    desc: {
      ru: 'Снаряды — тяжёлые сферы: тормозят, растут, пробивают 2 врагов и взрываются (радиус 20). Урон +30%, скорострельность −22%.',
      en: 'Shots become heavy spheres: they slow down, grow, pierce 2 enemies and explode (radius 20). Damage +30%, fire rate −22%.',
    },
    icon: { shape: 'core', color: C.violet, accent: C.redL },
    stats: (s) => {
      s.shotStyle = 'orb';
      s.shotColor = C.redL;
      s.size *= 1.3;
      s.grow += 6;
      s.accel *= 0.7;
      s.range *= 1.2;
      s.pierce += 2;
      s.explode += 20;
      s.damageMult *= 1.3;
      s.fireRateMult *= 0.78;
    },
  },
];
