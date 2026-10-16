import { FLOORS, TILE, VIEW_H, VIEW_W } from '../config';
import { S, tr } from '../core/i18n';
import { icon } from '../gfx/icons';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import { SPR } from '../gfx/sprites';
import { xpNeed, type Game } from './game';
import { TERMINAL_TIME } from './game';
import { SLOT_NAME, item, type ItemDef } from './items';
import { ROLE_MARK, qualityColor } from './render';
import { settings } from '../core/storage';
import { SCANNER, hasOpenSet } from './drops';
import { playerUnstableLevel } from './instability';

export function kindLabel(it: ItemDef): string {
  switch (it.kind) {
    case 'weapon':
      return tr(it.weapon?.hands === 2 ? { ru: 'двуручное оружие', en: 'two-handed weapon' } : { ru: 'оружие', en: 'weapon' });
    case 'passive':
      return tr({ ru: 'прошивка', en: 'firmware' });
    case 'skeleton':
      return tr({ ru: `скелет · класс ${it.skeletonClass}`, en: `frame · class ${it.skeletonClass}` });
    case 'backpack':
      return tr({ ru: 'рюкзак', en: 'backpack' });
    default: {
      const slot = it.slot ? tr(SLOT_NAME[it.slot]).toLowerCase() : '';
      if (it.weapon) return tr({ ru: `рука-оружие · ${slot}`, en: `arm weapon · ${slot}` });
      const key = it.active ? ' [Q]' : it.leftHand ? ' [E]' : '';
      return tr({ ru: `модуль · ${slot}`, en: `module · ${slot}` }) + key;
    }
  }
}

/** HUD сверху: жизни, сбой, энергоячейки, рюкзак, уровень и опыт */
export function renderHud(g: Game, r: Renderer) {
  const p = g.player;
  r.rect(0, 0, VIEW_W, 17, C.void, 0.75);
  r.rect(0, 17, VIEW_W, 1, C.blood, 0.8);

  // жизни
  for (let i = 0; i < p.stats.maxLives; i++) r.sprite(i < p.lives ? SPR.heart : SPR.heartEmpty, 4 + i * 8, 3);
  let x = 6 + p.stats.maxLives * 8;
  // шкала сбоя [F]
  {
    const bw = 26;
    const full = p.glitch >= 1 && p.glitchT <= 0;
    const blink = Math.floor(g.time * 4) % 2 === 0;
    r.text('F', x, 4, { size: 6, color: p.pendingHit > 0 ? C.redL : full ? C.violet : C.steel });
    const gx = x + 8;
    r.rect(gx, 5, bw, 5, C.black);
    r.frame(gx - 1, 4, bw + 2, 7, p.pendingHit > 0 ? C.redL : full && blink ? C.violet : C.metal);
    const k = p.glitchT > 0 ? p.glitchT / p.stats.glitchTime : p.glitch;
    r.rect(gx, 5, Math.round(bw * k), 5, p.glitchT > 0 ? C.bone : C.violet);
    if (!full && p.glitchT <= 0) r.rect(gx, 5, Math.round(bw * k), 1, C.grey);
    x = gx + bw + 8;
  }
  r.sprite(SPR.coinIcon, x, 4);
  r.text(String(p.coins), x + 7, 4, { size: 6, color: C.yellow });
  x += 30;
  // рюкзак: занято / мест
  r.sprite(SPR.packIcon, x, 4);
  r.text(`${p.backpack.length}/${p.backpackSize}`, x + 9, 4, { size: 6, color: p.backpack.length >= p.backpackSize ? C.red : C.bone });
  x += 34;

  // уровень и опыт
  r.text(`${tr(S.level)} ${p.level}`, x, 4, { size: 6, color: C.red });
  const bx = x + 34, bw = 60;
  r.rect(bx, 5, bw, 5, C.black);
  r.frame(bx - 1, 4, bw + 2, 7, C.metal);
  r.rect(bx, 5, Math.round((bw * p.xp) / xpNeed(p.level)), 5, C.redD);
  r.rect(bx, 5, Math.round((bw * p.xp) / xpNeed(p.level)), 1, C.red);

  r.text(`${tr(g.theme.tierName)} · ${tr(g.theme.name)} · ${g.floorNum}/${FLOORS}`, VIEW_W - 5, 6, { size: 5, color: C.steelL, align: 'right' });
  renderMinimap(g, r);
  renderLoadout(g, r);
  renderBossBar(g, r);
  renderLog(g, r);
  renderHack(g, r);
  renderPrices(g, r);
  renderEnemyMarks(g, r);
  renderUnstable(g, r);
  renderTooltip(g, r);
  renderHudGlitch(g, r);

  if (g.state === 'play' && g.bossIntro > 0 && g.boss) {
    const a = Math.min(1, g.bossIntro * 2);
    r.text(tr(g.boss.def.name), VIEW_W / 2, VIEW_H / 2 - 30, { size: 10, color: C.red, align: 'center', alpha: a });
  }
}

/**
 * Мини-карта уровня: видимые комнаты (посещённые и соседние с ними), коридоры у посещённых комнат,
 * закрытые гермодвери, метки ролей и точка игрока. Масштаб подбирается под разведанную часть.
 */
function renderMinimap(g: Game, r: Renderer) {
  const plan = g.plan, tw = plan.tw;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const room of plan.rooms) {
    if (!room.seen) continue;
    minX = Math.min(minX, room.x);
    minY = Math.min(minY, room.y);
    maxX = Math.max(maxX, room.x + room.w);
    maxY = Math.max(maxY, room.y + room.h);
  }
  if (minX === Infinity) return;
  const k = Math.min(0.5, 84 / (maxX - minX), 54 / (maxY - minY));
  const w = Math.ceil((maxX - minX) * k), h = Math.ceil((maxY - minY) * k);
  const ox = VIEW_W - w - 5, oy = 21;
  const mx = (tx: number) => ox + Math.floor((tx - minX) * k);
  const my = (ty: number) => oy + Math.floor((ty - minY) * k);
  r.rect(ox - 2, oy - 2, w + 4, h + 4, C.void, 0.6);
  for (const c of plan.corridors) {
    if (!plan.rooms[c.a].visited && !plan.rooms[c.b].visited) continue;
    for (let i = 0; i < c.path.length; i += 2) {
      const t = c.path[i], x = t % tw, y = (t / tw) | 0;
      if (x < minX || y < minY || x > maxX || y > maxY) continue;
      r.rect(mx(x), my(y), 1, 1, C.metal);
    }
  }
  for (const room of plan.rooms) {
    if (!room.seen) continue;
    const x = mx(room.x), y = my(room.y);
    const rw = Math.max(2, Math.floor(room.w * k)), rh = Math.max(2, Math.floor(room.h * k));
    const col = room === g.zone ? C.bone : room.visited ? C.steel : C.metal;
    r.rect(x, y, rw, rh, col);
    const mark = ROLE_MARK[room.role];
    if (mark) r.rect(x + Math.floor(rw / 2) - 1, y + Math.floor(rh / 2) - 1, 2, 2, mark);
  }
  for (const d of plan.doors) {
    if (!d.locked || !plan.rooms[d.room].visited) continue;
    r.rect(mx(d.tx) - 1, my(d.ty) - 1, 2, 2, C.yellow);
  }
  if (Math.floor(g.time * 3) % 2) r.rect(mx(g.player.x / TILE) - 1, my(g.player.y / TILE) - 1, 2, 2, C.red);
}

function renderLoadout(g: Game, r: Renderer) {
  const p = g.player;
  const y = VIEW_H - 20;
  r.rect(3, y - 1, 18, 18, C.void, 0.7);
  r.frame(3, y - 1, 18, 18, qualityColor(p.weapon.quality));
  r.sprite(icon(p.weapon.icon), 6, y + 2);
  if (p.activeId) {
    const it = item(p.activeId);
    r.rect(23, y - 1, 18, 18, C.void, 0.7);
    r.frame(23, y - 1, 18, 18, p.activeCd > 0 ? C.metal : C.yellow);
    r.sprite(icon(it.icon), 26, y + 2, 1, p.activeCd > 0 ? 0.4 : 1);
    if (p.activeCd > 0) {
      const k = p.activeCd / it.active!.cooldown;
      r.rect(24, y, 16, Math.round(16 * k), C.void, 0.55);
    }
    r.text('Q', 39, y + 11, { size: 5, color: C.steelL, align: 'right' });
  }
  // левая рука [E]: модуль руки или толчок манипулятором; у двуручного оружия недоступна
  const lm = p.leftModule;
  if (lm) {
    const lx = p.activeId ? 43 : 23;
    r.rect(lx, y - 1, 18, 18, C.void, 0.7);
    r.frame(lx, y - 1, 18, 18, p.twoHanded ? C.redD : p.shoveCd > 0 ? C.metal : C.steelL);
    r.sprite(icon(lm.icon), lx + 3, y + 2, 1, p.twoHanded || p.shoveCd > 0 ? 0.4 : 1);
    r.text(p.twoHanded ? 'E×' : 'E', lx + 16, y + 11, { size: 5, color: p.twoHanded ? C.redD : C.steelL, align: 'right' });
  } else r.text(p.twoHanded ? 'E×' : 'E', 20, y + 11, { size: 5, color: p.twoHanded ? C.redD : p.shoveCd > 0 ? C.metal : C.steelL, align: 'right' });
}

/** Терминал петли рядом: подсказка и полоса удержания R */
function renderHack(g: Game, r: Renderer) {
  const k = g.hackTarget;
  if (!k || g.state !== 'play') return;
  const x = VIEW_W / 2, y = VIEW_H - 52;
  if (g.locked) {
    r.text(tr({ ru: 'терминал недоступен в бою', en: 'terminal locked during combat' }), x, y, { size: 5, color: C.redL, align: 'center' });
    return;
  }
  r.text(tr({ ru: '[R держать] терминал гермодвери', en: '[R hold] blast door terminal' }), x, y, { size: 5, color: C.yellow, align: 'center' });
  const w = 60;
  r.rect(x - w / 2, y + 8, w, 3, C.black);
  r.rect(x - w / 2, y + 8, Math.round((w * g.hackT) / TERMINAL_TIME), 3, C.yellow);
}

/** Лог Диспетчера: 1–2 строки терминала над снаряжением, гаснут через несколько секунд */
function renderLog(g: Game, r: Renderer) {
  const n = g.logLines.length;
  g.logLines.forEach((l, i) => {
    const y = VIEW_H - 34 - (n - 1 - i) * 8;
    const a = Math.min(1, l.t);
    const text = '> ' + tr(l.text);
    r.rect(2, y - 2, Math.min(VIEW_W - 4, r.textWidth(text, 5) + 6), 8, C.void, 0.55 * a);
    r.text(text, 5, y, { size: 5, color: i === n - 1 ? C.bone : C.grey, alpha: a });
  });
}

function renderBossBar(g: Game, r: Renderer) {
  const boss = g.boss;
  if (!boss || boss.spawn > 0) return;
  // для близнецов — суммарное здоровье
  const all = g.enemies.filter((e) => e.def.boss && !e.dead);
  const hp = all.reduce((s, e) => s + Math.max(0, e.hp), 0);
  const max = all.reduce((s, e) => s + e.maxHp, 0) || 1;
  const x = 60, w = VIEW_W - 120, y = VIEW_H - 14;
  r.text(tr(boss.def.name), x, y - 8, { size: 5, color: C.red });
  const phase = boss.def.phases?.[boss.phase];
  if (phase) r.text(tr(phase.name), x + w, y - 8, { size: 5, color: C.yellow, align: 'right' });
  r.rect(x, y, w, 4, C.black);
  r.frame(x - 1, y - 1, w + 2, 6, C.metal);
  r.rect(x, y, Math.round((w * hp) / max), 4, C.redD);
  r.rect(x, y, Math.round((w * hp) / max), 1, C.red);
  // отметки фаз
  if (boss.def.phases) for (const ph of boss.def.phases) if (ph.until > 0) r.rect(x + Math.round(w * ph.until), y, 1, 4, C.yellow);
}

function renderPrices(g: Game, r: Renderer) {
  for (const k of g.pickups) {
    if (k.price === undefined) continue;
    const x = k.x - g.camX, y = k.y - g.camY + 8;
    if (x < -20 || y < -20 || x > VIEW_W + 20 || y > VIEW_H + 20) continue;
    r.text(String(k.price), x, y, { size: 5, color: g.player.coins >= k.price ? C.yellow : C.redD, align: 'center' });
  }
}

/** Метка над врагом с несобранным набором и шанс дропа (со «Сканером утильщика») */
function renderEnemyMarks(g: Game, r: Renderer) {
  const scanner = g.player.has(SCANNER);
  if (!settings.setMarkers && !scanner) return;
  for (const e of g.enemies) {
    if (e.dead || e.spawn > 0 || e.hidden || !hasOpenSet(g, e.def)) continue;
    const x = Math.round(e.x - g.camX), y = Math.round(e.y - g.camY - e.r - 6);
    if (x < -10 || y < 14 || x > VIEW_W + 10 || y > VIEW_H) continue;
    if (settings.setMarkers) {
      r.rect(x - 1, y, 3, 1, C.yellow, 0.75);
      r.rect(x, y - 1, 1, 3, C.yellow, 0.75);
    }
    if (scanner) {
      const pct = Math.round(g.drops.chance(e.def, g.player.stats.luck, true, g.dropMult) * 100);
      r.text(`${pct}%`, x, y - 8, { size: 4, color: C.yellow, align: 'center' });
    }
  }
}

/** Нестабильность: уровень и отключённые предметы с таймером (рядом со снаряжением) */
function renderUnstable(g: Game, r: Renderer) {
  const p = g.player;
  const lvl = playerUnstableLevel(p);
  if (!lvl && !p.disabled.size) return;
  const y = VIEW_H - 20;
  let x = 65;
  if (lvl) {
    r.text(tr({ ru: `НЕСТ ${lvl}`, en: `UNST ${lvl}` }), x, y + 5, { size: 5, color: C.violet });
    x += 34;
  }
  const blink = Math.floor(g.time * 3) % 2 === 0;
  for (const [id, d] of p.disabled) {
    const it = item(id);
    r.rect(x, y - 1, 18, 18, C.void, 0.7);
    r.frame(x, y - 1, 18, 18, blink ? C.redL : C.redD);
    r.sprite(icon(it.icon), x + 3, y + 2, 1, 0.35);
    const label = d.mode === 'timed' ? `${Math.ceil(d.t)}` : tr(d.mode === 'combat' ? { ru: 'бой', en: 'fgt' } : { ru: 'ур.', en: 'lvl' });
    r.text(label, x + 16, y + 11, { size: 4, color: C.bone, align: 'right' });
    x += 20;
  }
}

/** Помехи интерфейса при нестабильности 3–4: короткие полосы, без тряски */
function renderHudGlitch(g: Game, r: Renderer) {
  if (g.unstable.hudGlitch <= 0 || !settings.instabilityFx) return;
  const seed = Math.floor(g.time * 30);
  for (let i = 0; i < 5; i++) {
    const k = (seed * 7919 + i * 104729) % 1000;
    const y = (k * 13) % VIEW_H;
    const w = 40 + (k % 160);
    const x = (k * 31) % (VIEW_W - w);
    r.rect(x, y, w, 1 + (k % 2), i % 2 ? C.violet : C.redD, 0.45);
  }
}

function renderTooltip(g: Game, r: Renderer) {
  const k = g.nearPickup;
  if (!k || g.state !== 'play') return;
  let title = '', desc = '', color: string = C.bone, kind = '';
  if (k.kind === 'item' && k.itemId) {
    const it = item(k.itemId);
    title = tr(it.name);
    desc = tr(it.desc);
    color = qualityColor(it.quality);
    kind = kindLabel(it);
  } else if (k.kind === 'teleporter') {
    title = tr({ ru: 'Лифт-телепорт', en: 'Teleport lift' });
    desc = tr({ ru: 'Подняться на следующий этаж', en: 'Ascend to the next floor' });
  } else if (k.kind === 'medkit') {
    title = tr({ ru: 'Аптечка', en: 'Medkit' });
    desc = tr({ ru: '+1 жизнь', en: '+1 life' });
  } else if (k.kind === 'surgery') {
    title = tr({ ru: 'Операционная', en: 'Surgery' });
    desc = tr({ ru: 'Кресло и робот-хирург: поставить, снять и поменять модули из рюкзака.', en: 'A chair and a robot surgeon: install, remove and swap modules from your backpack.' });
  } else if (k.kind === 'glitch') {
    title = tr({ ru: 'Ячейка сбоя', en: 'Glitch cell' });
    desc = tr({ ru: '+30% заряда сбоя', en: '+30% glitch charge' });
  }
  const w = 220;
  const lines = r.wrap(desc, w - 12, 5);
  const h = 26 + lines.length * 8;
  const x = (VIEW_W - w) / 2, y = VIEW_H - h - 22;
  r.panel(x, y, w, h, color);
  r.text(title, x + 6, y + 5, { size: 6, color });
  if (kind) r.text(kind, x + w - 6, y + 6, { size: 5, color: C.steelL, align: 'right' });
  lines.forEach((l, i) => r.text(l, x + 6, y + 16 + i * 8, { size: 5, color: C.grey }));
  let prompt: string;
  if (k.kind === 'teleporter') prompt = tr(S.pressRTeleport);
  else if (k.kind === 'surgery') prompt = tr({ ru: '[R] операция', en: '[R] operate' });
  else if (k.kind === 'item' && k.itemId && item(k.itemId).kind === 'weapon' && g.player.weapon.slot === 'armR') prompt = tr({ ru: 'рука-оружие: не взять', en: 'arm weapon: cannot hold' });
  else if (k.price !== undefined) prompt = g.player.coins >= k.price ? `${tr(S.pressRBuy)} · ${k.price}` : `${tr(S.notEnough)} · ${k.price}`;
  else prompt = tr(S.pressR);
  r.text(prompt, x + w - 6, y + h - 9, { size: 5, color: C.yellow, align: 'right' });
}

