// The dressing room's pure model + HTML renderer (v21 Stream 5). DOM-free so
// it is unit-tested; the controller (a later task) mounts the HTML, the 3D
// stage goes in #dr-stage, and CSS grid places each region. Every control
// renders exactly once. Nothing here writes state: ownership and
// affordability mirror progression.isUnlocked/canBuy, purely from the save.
import { asFiniteNonNeg } from '../progression.js';
import { SKILLS, hasSkill } from '../skills.js';
import { prizeVisit } from '../visits.js';
import { CAT_BLURBS } from './catblurbs.js';

export const HOME_SHEETS = ['together', 'skills', 'colony', 'social', 'journal', 'album', 'sync', 'settings', 'code'];
export const SHEET_LABEL = {
  together: '👫 Play together',
  skills: '🐾 Skills', colony: '🐈 Colony', social: '👥 Social', journal: '📖 Journal',
  album: '📸 Album', sync: '☁️ Sync', settings: '⚙️ Settings', code: '🎁 Secret code',
};
// The den shop is not a home sheet: it lives inside the den (ui/denshopview.js).
export function resolveSheet(id) {
  return HOME_SHEETS.includes(id) ? id : null;
}

export const PLACE_PICTURE = (id) => `${import.meta.env.BASE_URL}places/${id}.jpg`;

// Display order of the slots (independent of catalog insertion order).
const SLOT_ORDER = ['collar', 'head', 'face', 'neck', 'body', 'back', 'feet'];
const SLOT_LABEL = { collar: 'Collar', head: 'Head', face: 'Face', neck: 'Neck', body: 'Body', back: 'Back', feet: 'Feet' };
const PILLS = [['wearing', 'Wearing'], ['where', 'Where to'], ['more', 'More']];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
const num = (v) => Math.floor(asFiniteNonNeg(v, 0));
const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function ownedList(state, kind) {
  const list = plain(state?.unlocked)[kind];
  return Array.isArray(list) ? list : [];
}
function walksIn(state, area) {
  return num(plain(state?.walks)[area]);
}
// The slots this catalog actually has, in display order (unknown slots last).
function slotsOf(catalog) {
  const present = new Set(Object.values(catalog.accessories).map((a) => a.slot));
  return [...SLOT_ORDER.filter((s) => present.has(s)), ...[...present].filter((s) => !SLOT_ORDER.includes(s))];
}
const labelOf = (slot) => SLOT_LABEL[slot] ?? String(slot);

// tryOn = { slot, id } is honoured only when id really is an accessory of that slot.
function validTry(catalog, tryOn) {
  if (!tryOn || typeof tryOn !== 'object') return null;
  const a = typeof tryOn.id === 'string' && has(catalog.accessories, tryOn.id) ? catalog.accessories[tryOn.id] : null;
  return a && a.slot === tryOn.slot ? { slot: tryOn.slot, id: tryOn.id } : null;
}
function equippedId(state, catalog, slot) {
  const id = plain(state?.equipped)[slot];
  return typeof id === 'string' && has(catalog.accessories, id) && catalog.accessories[id].slot === slot ? id : null;
}

export function buildDressingModel(state, catalog, { previewCat, tryOn } = {}) {
  const points = num(state?.points);
  const equippedCat = plain(state?.equipped).cat;
  const ownedCats = ownedList(state, 'cats');
  const ownedAcc = ownedList(state, 'accessories');
  const ownedAreas = ownedList(state, 'areas');

  const catIds = Object.keys(catalog.cats);
  const selectedCat = typeof equippedCat === 'string' && has(catalog.cats, equippedCat) ? equippedCat : catIds[0];
  const heroId = typeof previewCat === 'string' && has(catalog.cats, previewCat) ? previewCat : selectedCat;
  const heroOwned = ownedCats.includes(heroId);
  const heroPrice = num(catalog.cats[heroId]?.price);
  const hero = {
    id: heroId, name: catalog.cats[heroId]?.name ?? '', blurb: CAT_BLURBS[heroId] ?? '',
    owned: heroOwned, price: heroPrice, canBuy: !heroOwned && points >= heroPrice,
  };
  const cats = catIds.map((id) => ({
    id, name: catalog.cats[id].name, owned: ownedCats.includes(id), price: num(catalog.cats[id].price),
    selected: id === selectedCat, previewing: id === heroId && id !== selectedCat,
  }));

  const t = validTry(catalog, tryOn);
  const slotIds = slotsOf(catalog);
  const slots = slotIds.map((slot) => {
    const trying = !!t && t.slot === slot;
    const itemId = trying ? t.id : equippedId(state, catalog, slot);
    return { slot, label: labelOf(slot), itemId, itemName: itemId ? catalog.accessories[itemId].name : null, trying };
  });
  const wearingCount = slotIds.filter((s) => equippedId(state, catalog, s)).length;

  const areaIds = Object.keys(catalog.areas);
  const area = typeof state?.area === 'string' && has(catalog.areas, state.area) ? state.area : areaIds[0];
  const places = Object.entries(catalog.areas).map(([id, a]) => {
    const owned = ownedAreas.includes(id);
    const price = num(a.price);
    const req = a.requires;
    const have = req ? walksIn(state, req.area) : 0;
    const gated = !owned && !!req && have < req.walks;
    let lockLine = '';
    if (gated) {
      lockLine = `opens after ${req.walks} walks in ${catalog.areas[req.area]?.name ?? req.area} · ${have}/${req.walks} so far`;
    } else if (!owned) {
      lockLine = points >= price ? `Tap to unlock — ${price} 🐾` : `${price} 🐾 — keep walking!`;
    }
    return { id, name: a.name, owned, selected: id === area, canBuy: !owned && !gated && points >= price, price, locked: gated, lockLine };
  });

  const shopIds = Object.keys(catalog.accessories).filter((id) => !catalog.accessories[id].prize);

  return {
    hero, cats, slots, wearingCount, slotCount: slotIds.length, places,
    currentPlace: { id: area, name: catalog.areas[area]?.name ?? '' },
    // Prizes are won, not collected from the shop, so they stay out of both totals.
    ownedAccessories: shopIds.filter((id) => ownedAcc.includes(id)).length,
    accessoryTotal: shopIds.length,
    abilities: { earned: SKILLS.filter((s) => hasSkill(state, s.id)).length, total: SKILLS.length },
  };
}

function img(url, alt = '') {
  return url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">` : '';
}

// The picker for one slot: every accessory of that slot, one tile each.
// owned + not worn -> Wear; worn -> On ✓ (tap = take off); not owned -> Try on,
// plus Unlock when affordable (otherwise the price, as plain text).
export function renderSlotPickerHtml(state, catalog, slot, tryOn, thumbs) {
  const points = num(state?.points);
  const ownedAcc = ownedList(state, 'accessories');
  const t = validTry(catalog, tryOn);
  const worn = equippedId(state, catalog, slot);
  return Object.entries(catalog.accessories).filter(([, a]) => a.slot === slot).map(([id, a]) => {
    const owned = ownedAcc.includes(id);
    const price = num(a.price);
    const on = owned && worn === id && !(t && t.slot === slot && t.id !== id);
    const trying = !!t && t.slot === slot && t.id === id;
    const pic = img(thumbs?.accessories?.[id], '');
    const name = escapeHtml(a.name);
    const attrs = (act) => `data-dr-acc="${escapeHtml(id)}" data-dr-act="${act}"`;
    // An unwon prize stays a surprise: no data-dr-acc (the controller ignores
    // it), no price, no try-on.
    if (a.prize && !owned) {
      return `<div class="dr-pick locked prize-surprise"><span class="gift" aria-hidden="true">🎁</span><span>A surprise at visit ${prizeVisit(id)}</span></div>`;
    }
    if (on) {
      return `<button class="dr-pick on" ${attrs('off')}>${pic}${name}<span class="act">On ✓</span><small>Take off</small></button>`;
    }
    if (owned) {
      return `<button class="dr-pick" ${attrs('wear')}>${pic}${name}<span class="act">Wear</span></button>`;
    }
    return `<div class="dr-pick locked ${trying ? 'trying' : ''}"><button class="dr-pick-try" ${attrs('try')}>${pic}${name}<span class="act">${trying ? 'Trying ✓' : 'Try on'}</span></button>`
      + (points >= price
        ? `<button class="dr-pick-buy" ${attrs('buy')}>Unlock — ${price} 🐾</button>`
        : `<span class="act">${price} 🐾 (can't afford)</span>`)
      + '</div>';
  }).join('');
}

function portraitHtml(c, thumbs) {
  const title = `${c.name}${c.owned ? '' : ` — ${c.price} 🐾`}`;
  return `<button class="dr-portrait ${c.selected || c.previewing ? 'sel' : ''} ${c.owned ? '' : 'locked'}" data-dr-cat="${escapeHtml(c.id)}" aria-pressed="${c.selected || c.previewing}" title="${escapeHtml(title)}">${img(thumbs?.cats?.[c.id], c.name)}</button>`;
}

function slotHtml(s, openSlot, picker, thumbs) {
  const open = openSlot === s.slot;
  return `<button class="dr-slot ${s.itemId ? '' : 'empty'} ${open ? 'open' : ''} ${s.trying ? 'trying' : ''}" data-dr-slot="${escapeHtml(s.slot)}" aria-expanded="${open}">`
    + `${s.itemId ? img(thumbs?.accessories?.[s.itemId], '') : ''}`
    + `<span><small>${escapeHtml(s.label)}</small>${s.itemId ? escapeHtml(s.itemName) : 'nothing yet'}${s.trying ? ' (trying)' : ''}</span></button>`
    + (open ? `<div class="dr-picker">${picker ?? ''}</div>` : '');
}

function placeHtml(p) {
  const sub = p.selected ? 'today’s walk' : p.owned ? 'tap to walk here' : p.lockLine;
  const cant = !p.owned && !p.locked && !p.canBuy;
  return `<button class="dr-place ${p.selected ? 'sel' : ''} ${p.locked ? 'locked' : ''} ${cant ? 'cant' : ''}" data-dr-place="${escapeHtml(p.id)}">`
    + `<img src="${escapeHtml(PLACE_PICTURE(p.id))}" alt="" onerror="this.remove()">`
    + `<span class="cap">${escapeHtml(p.name)}<small>${escapeHtml(sub)}</small></span></button>`;
}

// headerHtml / statsHtml / startHtml / extrasHtml are pre-rendered, already
// escaped HTML from the owner (homebase), inserted verbatim, once each.
export function renderDressingRoomHtml({ model, headerHtml = '', statsHtml = '', startHtml = '', extrasHtml = '', sheets = HOME_SHEETS, ui = {}, thumbs } = {}) {
  const m = model;
  const pill = PILLS.some(([id]) => id === ui.pill) ? ui.pill : 'wearing';
  const openSlot = m.slots.some((s) => s.slot === ui.openSlot) ? ui.openSlot : null;
  const h = m.hero;
  const buy = h.owned ? ''
    : h.canBuy ? `<button class="dr-hero-buy" data-dr-buy-cat="${escapeHtml(h.id)}">Unlock — ${h.price} 🐾</button>`
      : `<span class="dr-hero-price">${h.price} 🐾</span>`;
  const sheetButtons = (Array.isArray(sheets) ? sheets : []).map(resolveSheet).filter(Boolean)
    .map((id) => `<button class="dr-ghost" data-dr-sheet="${id}">${escapeHtml(SHEET_LABEL[id])}</button>`).join('');
  const pillLabel = (id, label) => (id === 'wearing' ? `${label} ${m.wearingCount}` : label);

  return `<div class="dr dr-pill-${pill}" id="dr" data-pill="${pill}">
  <header class="dr-header">${headerHtml}<div class="dr-stats">${statsHtml}</div></header>
  <section class="dr-hero">
    <div class="dr-stage" id="dr-stage">
      <div class="dr-spin-hint">↔ drag to spin</div>
      <div class="dr-hero-text"><div class="dr-hero-name">${escapeHtml(h.name)}</div><div class="dr-hero-blurb">${escapeHtml(h.blurb)}</div>${buy}</div>
    </div>
    <div class="dr-strip">${m.cats.map((c) => portraitHtml(c, thumbs)).join('')}</div>
  </section>
  <div class="dr-pills">${PILLS.map(([id, label]) => `<button data-dr-pill="${id}" aria-pressed="${id === pill}">${pillLabel(id, label)}</button>`).join('')}</div>
  <section class="dr-wearing" data-panel="wearing">
    <p class="dr-label">Wearing · ${m.wearingCount} of ${m.slotCount} slots · ${m.ownedAccessories} of ${m.accessoryTotal} owned</p>
    <div class="dr-slots">${m.slots.map((s) => slotHtml(s, openSlot, ui.pickerHtml, thumbs)).join('')}</div>
  </section>
  <section class="dr-abilities"><div class="dr-chip">🐾 ${num(m.abilities?.earned)} of ${num(m.abilities?.total)} earned</div></section>
  <section class="dr-where" data-panel="where">
    <p class="dr-label">Where to?</p>
    <div class="dr-places">${m.places.map(placeHtml).join('')}</div>
  </section>
  <section class="dr-more" data-panel="more">${sheetButtons}</section>
  <section class="dr-extras">${extrasHtml}</section>
  <footer class="dr-dock">
    <div class="where"><img src="${escapeHtml(PLACE_PICTURE(m.currentPlace.id))}" alt="" onerror="this.remove()">Walking in <b>${escapeHtml(m.currentPlace.name)}</b></div>
    ${startHtml}
  </footer>
</div>`;
}
