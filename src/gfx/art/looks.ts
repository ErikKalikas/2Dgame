import type { Slot } from '../../game/items';
import type { PlayerDir } from './player';

// Детали модулей на спрайте Т-417 (12×16). У каждого модуля свой маленький рисунок; он ставится
// в точку крепления своего слота для каждого направления (вид спереди, сзади, сбоку).
// Символы — индексы палитры (0–f), '.' — прозрачно. Обводка добавляется после наложения.

export interface Look {
  /** Рисунок спереди (и сбоку, если side не задан) */
  p: string[];
  /** Рисунок сзади: для спины и того, что торчит над головой; null — сзади не видно */
  up?: string[] | null;
  side?: string[] | null;
  /** Сдвиг от точки крепления слота */
  dx?: number;
  dy?: number;
}

type Key = Slot | 'skeleton';

/** Точка крепления (левый верхний угол рисунка) по направлениям; null — деталь не видна */
export const ANCHOR: Record<Key, Record<PlayerDir, [number, number] | null>> = {
  head: { down: [4, 3], up: [4, 1], side: [7, 2] },
  torso: { down: [4, 6], up: null, side: [5, 6] },
  legs: { down: [3, 12], up: [3, 12], side: [5, 12] },
  back: { down: [9, 2], up: [4, 5], side: [1, 4] },
  armR: { down: [0, 6], up: [9, 6], side: [6, 7] },
  armL: { down: [9, 6], up: [0, 6], side: null },
  blood: { down: [3, 8], up: null, side: [4, 8] },
  tentacles: { down: [10, 8], up: [5, 7], side: [1, 8] },
  nervous: { down: [5, 0], up: [5, 0], side: [6, 0] },
  reactor: { down: [5, 7], up: null, side: [6, 7] },
  skeleton: { down: [3, 10], up: [3, 10], side: [4, 10] },
};

export const LOOKS: Record<string, Look> = {
  // ---- голова
  smartlink: { p: ['b.b'], dy: 0 },
  iFalconOptics: { p: ['5ee6'] },
  iThermalOptics: { p: ['dab'], dx: 1 },
  iBallisticCalc: { p: ['7..7', '.55.'], dy: -1 },
  iRearCam: { p: ['3..3'], up: ['.bb.'], side: ['3b'] },
  iDaemonUplink: { p: ['..f', '..f', '..3'], up: ['..f', '..f'], dy: -3 },
  iPingHack: { p: ['f.f.', '.f.f'], dy: -1 },
  iFlashEmitter: { p: ['.77.', '7ee7'], dy: -1 },
  // лупа-монокль утильщика
  iScrapScanner: { p: ['.dd', 'de.', '.d.'], up: null, dx: 2, dy: -1 },
  // наборы врагов (этап 12б)
  iGuardVisor: { p: ['3bb3'], side: ['bb'] },
  iBlinkAntenna: { p: ['...f', '..5.'], up: ['.f', '5.'], dy: -2 },
  iSniperRange: { p: ['.a33'], side: ['a3'], dx: 1 },
  // ---- корпус
  subdermal: { p: ['5665', '5445'] },
  iDermalWeave: { p: ['6.6.', '.6.6', '6.6.'] },
  iBoneLacing: { p: ['7..7', '.77.'] },
  iKineticDampers: { p: ['d..d', 'c..c'] },
  iReactiveArmor: { p: ['adda', '4444'] },
  iFragCasing: { p: ['.7.', '7a7', '.7.'] },
  iThermopticCamo: { p: ['ffff'], side: ['ff'] },
  iEmpBurst: { p: ['.e.', 'eae', '.e.'] },
  iPunkBandolier: { p: ['d...', '.d..', '..d.', '...d'], side: ['d.', '.d'], dy: -1 },
  iGuardPlate: { p: ['5555', '4664'], side: ['55', '46'] },
  iBlinkTorso: { p: ['f..f', '.ff.'], side: ['f.', '.f'] },
  // ---- ноги (рисунок ставится на обе ноги)
  iServoAnkles: { p: ['.e'], side: ['e.'] },
  iNapalmDropper: { p: ['d', 'a'] },
  iAfterimage: { p: ['f', 'f'] },
  iMagPulse: { p: ['6f'] },
  iScavLegs: { p: ['4', '45'], side: ['45'], dy: 1 },
  iPunkSoles: { p: ['9a'], side: ['a9'], dy: 2 },
  iBlinkLegs: { p: ['f', '5'], side: ['5f'] },
  iSniperTripod: { p: ['5', '4'], side: ['4.5'], dy: 1 },
  // ---- спина (сверху из-за плеча, сзади — целиком)
  twinBarrel: { p: ['3.', '3.', '3.'], up: ['3..3', '3..3', '4..4'], dy: 1 },
  iShoulderMounts: { p: ['453'], up: ['453..354'], dx: 0, dy: 2 },
  iWingmanDrone: { p: ['.5.', '5e5'], up: ['.5.', '5e5'], dy: -2 },
  iHiveLink: { p: ['e.e', '.e.'], up: ['e.e.e', '.e.e.'], dy: -2 },
  iSpinalDischarger: { p: ['e', '4'], up: ['.e.', '4e4', '.e.', '4e4'], dy: 0 },
  iMicroMissiles: { p: ['aa', '33'], up: ['a.a.', '3333', '3443'], dy: 0 },
  iSentryPod: { p: ['53', '33'], up: ['.55.', '5335', '.33.'], dy: 1 },
  iOrbitalStrike: { p: ['d.', 'd.', 'c.'], up: ['d..d', 'cddc'], dy: -2 },
  iScavCrate: { p: ['cd', 'cc'], up: ['cddc', 'c44c', 'cccc'] },
  iGuardKeys: { p: ['e.', '.e'], up: ['.e.', 'e.e', '.e.'], dy: 2 },
  iSniperSpotter: { p: ['.4.', '4a4'], up: ['4.4', '.a.', '4.4'], dy: -3 },
  // ---- правая рука: рука-оружие (вместо кисти)
  wPowerFist: { p: ['444', '454', '444', '.4.'], side: ['44', '45', '44'] },
  wMantis: { p: ['7', '7', '6', '6'], side: ['7', '7', '6'], dy: 1 },
  wAcidSpitter: { p: ['.d', 'dc', '.d'], side: ['d', 'c'] },
  wHedgehog: { p: ['7.7', '.7.', '7.7'], side: ['77'] },
  wWeldingTorch: { p: ['3', '3', 'e'], side: ['3', 'e'], dy: 1 },
  wMonowire: { p: ['5', '.', '6', '.', '7'], side: ['6', '7'] },
  wArcThrower: { p: ['3e', '3e', 'e.'], side: ['e', 'e'] },
  // ---- левая рука: модули атаки на E
  iShockPalm: { p: ['e', 'e'], dy: 2 },
  lhShield: { p: ['55', '45', '45', '44'], up: ['55', '44'] },
  lhHarpoon: { p: ['.6', '.6', '67'] },
  lhBlade: { p: ['.7', '.7', '.6', '.6'], dy: 1 },
  lhPistol: { p: ['33', '3.'], dy: 2 },
  lhMagnet: { p: ['f.f', 'fff'], dy: 2 },
  lhWeldWall: { p: ['dd', 'c.'], dy: 2 },
  lhClamp: { p: ['3.3', '3.3', '.3.'], dy: 1 },
  // ---- кровеносная система: трубки по корпусу
  iAdrenalPump: { p: ['a', 'a', '9'] },
  iNanoSwarm: { p: ['6.', '.6', '6.'] },
  iNaniteVeil: { p: ['f', '5', 'f'] },
  iBackupHeart: { p: ['ab', '9a'] },
  // ---- щупальца из спины
  iMantisBlades: { p: ['3', '3', '7'], up: ['3..3', '3..3', '7..7'] },
  iCreditSniffer: { p: ['3', '3', 'e'], up: ['.33.', '.3e.'] },
  iMirrorField: { p: ['3', '3', 'f'], up: ['3.3', '3.3', 'f.f'] },
  // ---- нервная система: контакты на затылке/темени
  reflexBooster: { p: ['.b'], up: ['bb'] },
  iPainEditor: { p: ['a.'], up: ['a.a'] },
  sandevistan: { p: ['f.f'], up: ['fff'] },
  iExecutionCortex: { p: ['bab'], up: ['bab'] },
  // ---- реактор: свечение в груди
  iChainRelay: { p: ['e'] },
  iCapacitorArm: { p: ['ee'] },
  iArcCoil: { p: ['.e', 'e.'] },
  iOverclockChip: { p: ['b'] },
  // ---- скелеты: рёбра каркаса на поясе
  skWorker: { p: [] },
  skWorkerPlus: { p: ['5....5'] },
  skGuard: { p: ['a....a'] },
  skLoader: { p: ['d....d'] },
  skPrototype: { p: ['7....7'] },
};
