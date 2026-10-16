import type { SynergyDef } from '../game/items';

// Синергии включаются автоматически, когда у игрока есть нужная комбинация предметов или тегов.
// Видны в паузе → «Снаряжение» → «Синергии» и в кодексе.

export const SYNERGIES_LIST: SynergyDef[] = [
  // ------------------------------------------------------------------ по тегам
  {
    id: 'synElectric',
    name: { ru: 'Перегрузка сети', en: 'Grid Overload' },
    desc: { ru: '3 электро-предмета: молния перескакивает на +2 цели, шанс оглушения +10%.', en: '3 electric items: lightning jumps to +2 targets, +10% stun chance.' },
    requires: (_h, tags) => tags('electric') >= 3,
    stats: (s) => {
      s.chain += 2;
      s.shock += 0.1;
    },
  },
  {
    id: 'pyromaniac',
    name: { ru: 'Пироман', en: 'Pyromaniac' },
    desc: { ru: '2 огненных предмета: поджог вдвое сильнее.', en: '2 fire items: burn is twice as strong.' },
    requires: (_h, tags) => tags('fire') >= 2,
    stats: (s) => {
      s.burn *= 2;
    },
  },
  {
    id: 'synInferno',
    name: { ru: 'Пекло', en: 'Inferno' },
    desc: { ru: '4 огненных предмета: снаряды взрываются огненным облаком (радиус +10).', en: '4 fire items: shots burst into a fiery cloud (radius +10).' },
    requires: (_h, tags) => tags('fire') >= 4,
    stats: (s) => {
      s.explode += 10;
      s.burn += 2;
    },
  },
  {
    id: 'synSmart',
    name: { ru: 'Боевой ИИ', en: 'Combat AI' },
    desc: { ru: '3 смарт-предмета: сильное самонаведение и +1 боевой дрон.', en: '3 smart items: strong homing and +1 combat drone.' },
    requires: (_h, tags) => tags('smart') >= 3,
    stats: (s) => {
      s.homing += 2;
      s.drones += 1;
    },
  },
  {
    id: 'synBlade',
    name: { ru: 'Мясорубка', en: 'Meat Grinder' },
    desc: { ru: '3 клинка: снаряды — острые осколки, пробивание +2, шанс крита +10%.', en: '3 blades: shots become sharp shards, pierce +2, crit chance +10%.' },
    requires: (_h, tags) => tags('blade') >= 3,
    stats: (s) => {
      s.pierce += 2;
      s.crit += 0.1;
      if (s.shotStyle === 'bolt' || s.shotStyle === 'pellet') s.shotStyle = 'shard';
    },
  },
  {
    id: 'synHeavy',
    name: { ru: 'Ходячий танк', en: 'Walking Tank' },
    desc: { ru: '3 тяжёлых предмета: +1 жизнь, снаряды крупнее, отбрасывание сильнее.', en: '3 heavy items: +1 life, bigger shots, stronger knockback.' },
    requires: (_h, tags) => tags('heavy') >= 3,
    stats: (s) => {
      s.maxLives += 1;
      s.size *= 1.2;
      s.knockback += 40;
    },
  },
  {
    id: 'abomination',
    name: { ru: 'Мерзость', en: 'Abomination' },
    desc: { ru: '2 мутации: +1 жизнь, снаряды крупнее.', en: '2 mutations: +1 life, bigger shots.' },
    requires: (_h, tags) => tags('mutation') >= 2,
    stats: (s) => {
      s.maxLives += 1;
      s.size *= 1.25;
    },
  },
  {
    id: 'synChimera',
    name: { ru: 'Химера', en: 'Chimera' },
    desc: { ru: '4 мутации: +1 снаряд за выстрел, снаряды растут в полёте.', en: '4 mutations: +1 projectile per shot, shots grow in flight.' },
    requires: (_h, tags) => tags('mutation') >= 4,
    stats: (s) => {
      s.count += 1;
      s.grow += 3;
    },
  },
  {
    id: 'synNano',
    name: { ru: 'Нанорой', en: 'Nanoswarm' },
    desc: { ru: '3 нано-предмета: снаряды распадаются на +2 осколка и взламывают цель.', en: '3 nano items: shots split into +2 shards and hack the target.' },
    requires: (_h, tags) => tags('nano') >= 3,
    stats: (s) => {
      s.split += 2;
      s.hack += 0.15;
    },
  },
  {
    id: 'synOptic',
    name: { ru: 'Всевидящее око', en: 'All-seeing Eye' },
    desc: { ru: '3 оптических импланта: дальность +30%, крит +10%, урон крита +50%.', en: '3 optics: range +30%, crit +10%, crit damage +50%.' },
    requires: (_h, tags) => tags('optic') >= 3,
    stats: (s) => {
      s.range *= 1.3;
      s.crit += 0.1;
      s.critMult += 0.5;
    },
  },
  {
    id: 'synNeural',
    name: { ru: 'Нейросинхрон', en: 'Neural Sync' },
    desc: { ru: '3 нейро-предмета: скорострельность +20%, шанс уклонения +8%.', en: '3 neural items: fire rate +20%, dodge chance +8%.' },
    requires: (_h, tags) => tags('neural') >= 3,
    stats: (s) => {
      s.fireRateMult *= 1.2;
      s.dodge += 0.08;
    },
  },
  {
    id: 'synKinetic',
    name: { ru: 'Кинетический шторм', en: 'Kinetic Storm' },
    desc: { ru: '4 кинетических предмета: очередь +1 выстрел, +1 рикошет, снаряды быстрее.', en: '4 kinetic items: +1 burst shot, +1 ricochet, faster shots.' },
    requires: (_h, tags) => tags('kinetic') >= 4,
    stats: (s) => {
      s.burst += 1;
      s.bounce += 1;
      s.shotSpeed *= 1.2;
    },
  },
  {
    id: 'synExplosive',
    name: { ru: 'Подрывник', en: 'Demolitionist' },
    desc: { ru: '3 взрывных предмета: взрывы больше, сбой шире на 30% и копится на 25% быстрее.', en: '3 explosive items: bigger explosions, glitch radius +30%, glitch charges 25% faster.' },
    requires: (_h, tags) => tags('explosive') >= 3,
    stats: (s) => {
      s.explode += 12;
      s.glitchRadius *= 1.3;
      s.glitchGain *= 1.25;
    },
  },
  {
    id: 'synStealth',
    name: { ru: 'Призрак', en: 'Ghost' },
    desc: { ru: '3 предмета скрытности: снаряды проходят сквозь стены, уклонение +10%.', en: '3 stealth items: shots pass through walls, dodge +10%.' },
    requires: (_h, tags) => tags('stealth') >= 3,
    stats: (s) => {
      s.spectral = true;
      s.dodge += 0.1;
    },
  },

  // ------------------------------------------------------------------ по предметам
  {
    id: 'smartRicochet',
    name: { ru: 'Умный рикошет', en: 'Smart Ricochet' },
    desc: { ru: 'Прицельный контур + Рикошет: отскочившие снаряды наводятся сильнее, +1 отскок.', en: 'Targeting Loop + Ricochet: bounced shots home harder, +1 bounce.' },
    requires: (has) => has('smartlink') && has('ricochet'),
    stats: (s) => {
      s.bounce += 1;
      s.homing += 1.5;
    },
  },
  {
    id: 'synAllRound',
    name: { ru: 'Круговая оборона', en: 'All-round Defense' },
    desc: { ru: 'Затылочная камера + Зеркальная призма: залпы во все стороны наводятся на врагов.', en: 'Rear Camera + Mirror Prism: volleys in every direction home in on enemies.' },
    requires: (has) => has('iRearCam') && has('pMirrorPrism'),
    stats: (s) => {
      s.homing += 2;
    },
  },
  {
    id: 'synSamurai',
    name: { ru: 'Уличный самурай', en: 'Street Samurai' },
    desc: { ru: 'Термокатана + Выкидные клинки: урон +25%, удар шире, поджог сильнее.', en: 'Thermal Katana + Switch Blades: damage +25%, wider slash, stronger burn.' },
    requires: (has) => has('katana') && has('iMantisBlades'),
    stats: (s) => {
      s.damageMult *= 1.25;
      s.size *= 1.2;
      s.burn += 2;
    },
  },
  {
    id: 'synPrismBeam',
    name: { ru: 'Призменный луч', en: 'Prism Beam' },
    desc: { ru: 'Лазер «Игла» + Зеркальная призма: луч расщепляется на +2 луча.', en: '"Needle" Laser + Mirror Prism: the beam splits into +2 beams.' },
    requires: (has) => has('laser') && has('pMirrorPrism'),
    stats: (s) => {
      s.count += 2;
      s.spread = Math.max(s.spread, 0.18);
    },
  },
  {
    id: 'synGauss',
    name: { ru: 'Гаусс-пушка', en: 'Gauss Cannon' },
    desc: { ru: 'Рельсотрон + Конденсаторная рука: пробивание +3, урон +30%.', en: 'Railgun + Capacitor Arm: pierce +3, damage +30%.' },
    requires: (has) => has('railgun') && has('iCapacitorArm'),
    stats: (s) => {
      s.pierce += 3;
      s.damageMult *= 1.3;
    },
  },
  {
    id: 'synCarpet',
    name: { ru: 'Ковровая бомбардировка', en: 'Carpet Bombing' },
    desc: { ru: 'Гранатомёт «Молот» + Осколочные боеголовки: взрыв разбрасывает 4 осколка.', en: '"Hammer" Launcher + Frag Warheads: explosions scatter 4 fragments.' },
    requires: (has) => has('rpg') && has('pFragWarheads'),
    stats: (s) => {
      s.split += 4;
    },
  },
  {
    id: 'synBlackHole',
    name: { ru: 'Чёрная дыра', en: 'Black Hole' },
    desc: { ru: 'Опухолевый рост + Ядро сингулярности: снаряды растут быстрее и взрываются сильнее.', en: 'Tumor Growth + Singularity Core: shots grow faster and explode harder.' },
    requires: (has) => has('tumorGrowth') && has('pSingularityCore'),
    stats: (s) => {
      s.grow += 4;
      s.explode += 10;
    },
  },
  {
    id: 'synDroneSwarm',
    name: { ru: 'Рой дронов', en: 'Drone Swarm' },
    desc: { ru: 'Дрон-напарник + Улей-линк: +1 боевой дрон.', en: 'Wingman Drone + Hive Link: +1 combat drone.' },
    requires: (has) => has('iWingmanDrone') && has('iHiveLink'),
    stats: (s) => {
      s.drones += 1;
    },
  },
  {
    id: 'synGhostDance',
    name: { ru: 'Призрачный танец', en: 'Ghost Dance' },
    desc: { ru: 'Хроно-ускоритель + Остаточный образ: рывок дальше и перезаряжается на 40% быстрее.', en: 'Chrono Accelerator + Afterimage: longer dash that recharges 40% faster.' },
    requires: (has) => has('sandevistan') && has('iAfterimage'),
    stats: (s) => {
      s.dashCd *= 0.6;
      s.dashDist *= 1.3;
    },
  },
  {
    id: 'synDeathRing',
    name: { ru: 'Кольцо смерти', en: 'Ring of Death' },
    desc: { ru: 'Орбитальный контур + Орбитальные осколки: орбиты поджигают и оглушают.', en: 'Orbital Guard + Orbital Shards: orbits ignite and stun.' },
    requires: (has) => has('iOrbitalGuard') && has('pOrbitalShards'),
    stats: (s) => {
      s.burn += 3;
      s.shock += 0.15;
    },
  },
  {
    id: 'synNapalm',
    name: { ru: 'Напалм', en: 'Napalm' },
    desc: { ru: 'Огнемёт «Пекло» + Термитное покрытие: поджог вдвое сильнее, струя на 30% длиннее.', en: '"Inferno" Flamethrower + Thermite Coating: burn ×2, stream 30% longer.' },
    requires: (has) => has('flamer') && has('pThermiteCoating'),
    stats: (s) => {
      s.burn *= 2;
      s.range *= 1.3;
    },
  },
  {
    id: 'synReturnLoop',
    name: { ru: 'Возвратный цикл', en: 'Return Loop' },
    desc: { ru: 'Возвратная рама + Возвратный магнит: бумеранги крупнее, сильнее и пробивают +2.', en: 'Return Frame + Return Servo: boomerangs are bigger, stronger and pierce +2.' },
    requires: (has) => has('pBoomerangFrame') && has('iReturnServo'),
    stats: (s) => {
      s.pierce += 2;
      s.size *= 1.2;
      s.damageMult *= 1.2;
    },
  },
  {
    id: 'synDoubleHelix',
    name: { ru: 'Двойная спираль', en: 'Double Helix' },
    desc: { ru: 'Синус-привод + Спиральная катушка: +1 снаряд, волна шире.', en: 'Sine Drive + Helix Coil: +1 projectile, wider wave.' },
    requires: (has) => has('sineDrive') && has('pHelixCoil'),
    stats: (s) => {
      s.count += 1;
      s.wave += 4;
    },
  },
  {
    id: 'synFortress',
    name: { ru: 'Хромированная крепость', en: 'Chrome Fortress' },
    desc: { ru: 'Субдермальная броня + Кевларовое плетение: щит поглощает ещё 1 попадание.', en: 'Subdermal Armor + Dermal Weave: the shield absorbs 1 more hit.' },
    requires: (has) => has('subdermal') && has('iDermalWeave'),
    stats: (s) => {
      s.shield += 1;
    },
  },
  {
    id: 'synExecutioner',
    name: { ru: 'Палач', en: 'Executioner' },
    desc: { ru: 'Кора палача + Выкидные клинки: крит +15%, урон крита +100%.', en: 'Execution Cortex + Switch Blades: crit +15%, crit damage +100%.' },
    requires: (has) => has('iExecutionCortex') && has('iMantisBlades'),
    stats: (s) => {
      s.crit += 0.15;
      s.critMult += 1;
    },
  },
  {
    id: 'synPlasmaBlood',
    name: { ru: 'Плазменная кровь', en: 'Plasma Blood' },
    desc: { ru: 'Кипящая кровь + Плазменный инжектор: взрывы больше, поджог сильнее.', en: 'Boiling Blood + Plasma Injector: bigger explosions, stronger burn.' },
    requires: (has) => has('pMutBoilingBlood') && has('iPlasmaInjector'),
    stats: (s) => {
      s.explode += 10;
      s.burn += 3;
    },
  },

  // ------------------------------------------------------------------ с оружием
  {
    id: 'synSawmill',
    name: { ru: 'Пилорама', en: 'Sawmill' },
    desc: { ru: 'Пилы-спутники «Хоровод» + Орбитальный контур: урон +30%, пилы поджигают.', en: '"Round Dance" Saws + Orbital Guard: damage +30%, saws ignite.' },
    requires: (has) => has('wOrbitSaws') && has('iOrbitalGuard'),
    stats: (s) => {
      s.damageMult *= 1.3;
      s.burn += 3;
    },
  },
  {
    id: 'synWaspNest',
    name: { ru: 'Ракетный улей', en: 'Missile Hive' },
    desc: { ru: 'Ракетный рой «Осиное гнездо» + Микроракеты в предплечье: +1 ракета, взрывы больше.', en: '"Wasp Nest" + Forearm Micro-Missiles: +1 missile, bigger explosions.' },
    requires: (has) => has('wMicroMissiles') && has('iMicroMissiles'),
    stats: (s) => {
      s.count += 1;
      s.explode += 6;
    },
  },
  {
    id: 'synCyberNinja',
    name: { ru: 'Кибер-ниндзя', en: 'Cyber Ninja' },
    desc: { ru: 'Мономолекулярная нить + Выкидные клинки: досягаемость +25%, крит +10%.', en: 'Monowire + Switch Blades: reach +25%, crit +10%.' },
    requires: (has) => has('wMonowire') && has('iMantisBlades'),
    stats: (s) => {
      s.size *= 1.25;
      s.crit += 0.1;
    },
  },
  {
    id: 'synTeslaStorm',
    name: { ru: 'Тесла-буря', en: 'Tesla Storm' },
    desc: { ru: 'Тесла-проектор + Дуговой проводник: молния перескакивает на +2 цели.', en: 'Tesla Projector + Arc Conductor: lightning jumps to +2 targets.' },
    requires: (has) => has('wTeslaBeam') && has('pArcConductor'),
    stats: (s) => {
      s.chain += 2;
    },
  },
  {
    id: 'synViralStrain',
    name: { ru: 'Вирусный штамм', en: 'Viral Strain' },
    desc: { ru: 'Вирус «Помеха» + Паразитный код: снаряды сильнее наводятся и взламывают цель на +20%.', en: '"Static" Virus + Parasitic Code: stronger homing, targets take +20% damage.' },
    requires: (has) => has('wBlackIce') && has('pMutParasiticCode'),
    stats: (s) => {
      s.homing += 2;
      s.hack += 0.2;
    },
  },
  {
    id: 'synMinefield',
    name: { ru: 'Минное поле', en: 'Minefield' },
    desc: { ru: 'Минный ранец «Капкан» + Напалмовый сброс: мины взрываются шире и поджигают.', en: '"Snare" Mine Pack + Napalm Dropper: mines blast wider and ignite.' },
    requires: (has) => has('wMineLayer') && has('iNapalmDropper'),
    stats: (s) => {
      s.explode += 8;
      s.burn += 3;
    },
  },
  {
    id: 'synSmartGun',
    name: { ru: 'Умный ствол', en: 'Smart Barrel' },
    desc: { ru: 'Умный пистолет «Ищейка» + Прицельный контур: самонаведение +2, крит +8%.', en: '"Bloodhound" Smart Pistol + Targeting Loop: homing +2, crit +8%.' },
    requires: (has) => has('wSmartPistol') && has('smartlink'),
    stats: (s) => {
      s.homing += 2;
      s.crit += 0.08;
    },
  },
];
