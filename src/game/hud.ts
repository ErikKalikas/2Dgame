import { FLOORS, VIEW_H, VIEW_W } from '../config';
import { S, tr } from '../core/i18n';
import { icon } from '../gfx/icons';
import { C } from '../gfx/palette';
import type { Renderer } from '../gfx/renderer';
import { SPR } from '../gfx/sprites';
import { xpNeed, type Game } from './game';
import { item, type ItemDef } from './items';
import { qualityColor } from './render';

const KIND_LABEL = {
  weapon: { ru: 'оружие', en: 'weapon' },
  weapon2: { ru: 'двуручное оружие', en: 'two-handed weapon' },
  implant: { ru: 'имплант', en: 'implant' },
  passive: { ru: 'модификация', en: 'modification' },
};

export function kindLabel(it: ItemDef): string {
  if (it.kind === 'implant' && it.active) return tr({ ru: 'активный имплант [Q]', en: 'active implant [Q]' });
  if (it.weapon?.hands === 2) return tr(KIND_LABEL.weapon2);
  return tr(KIND_LABEL[it.kind]);
}

/** HUD сверху: жизни, сбой, кредиты, ключи, уровень и опыт */
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
  r.sprite(SPR.keyIcon, x, 5);
  r.text(String(p.keys), x + 11, 4, { size: 6, color: C.bone });
  x += 26;

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
  renderPrices(g, r);
  renderTooltip(g, r);

  if (g.state === 'play' && g.bossIntro > 0 && g.boss) {
    const a = Math.min(1, g.bossIntro * 2);
    r.text(tr(g.boss.def.name), VIEW_W / 2, VIEW_H / 2 - 30, { size: 10, color: C.red, align: 'center', alpha: a });
  }
}

function renderMinimap(g: Game, r: Renderer) {
  const plan = g.plan;
  const cw = 6, ch = 4;
  // границы известной части карты
  let minX = 99, minY = 99, maxX = -1, maxY = -1;
  for (const room of plan.rooms) {
    if (!room.seen) continue;
    minX = Math.min(minX, room.x);
    minY = Math.min(minY, room.y);
    maxX = Math.max(maxX, room.x + room.w - 1);
    maxY = Math.max(maxY, room.y + room.h - 1);
  }
  const w = (maxX - minX + 1) * cw, h = (maxY - minY + 1) * ch;
  const ox = VIEW_W - w - 5, oy = 21;
  r.rect(ox - 2, oy - 2, w + 4, h + 4, C.void, 0.6);
  for (const room of plan.rooms) {
    if (!room.seen) continue;
    const x = ox + (room.x - minX) * cw, y = oy + (room.y - minY) * ch;
    const cur = room.id === g.room.info.id;
    const col = cur ? C.bone : room.visited ? C.steel : C.metal;
    r.rect(x, y, room.w * cw - 1, room.h * ch - 1, col);
    const mark = room.type === 'boss' ? C.red : room.type === 'treasure' ? C.yellow : room.type === 'shop' ? C.amber : null;
    if (mark) r.rect(x + Math.floor((room.w * cw) / 2) - 1, y + Math.floor((room.h * ch) / 2) - 1, 2, 2, mark);
  }

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
  // левая рука [E]: толчок манипулятором; у двуручного оружия недоступна
  r.text(p.twoHanded ? 'E×' : 'E', 20, y + 11, { size: 5, color: p.twoHanded ? C.redD : p.shoveCd > 0 ? C.metal : C.steelL, align: 'right' });
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
  } else if (k.kind === 'key') {
    title = tr({ ru: 'Ключ-карта', en: 'Keycard' });
    desc = tr({ ru: 'Открывает запертую дверь', en: 'Opens a locked door' });
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
  else if (k.price !== undefined) prompt = g.player.coins >= k.price ? `${tr(S.pressRBuy)} · ${k.price}` : `${tr(S.notEnough)} · ${k.price}`;
  else prompt = tr(S.pressR);
  r.text(prompt, x + w - 6, y + h - 9, { size: 5, color: C.yellow, align: 'right' });
}

