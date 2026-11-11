// The dressing room's pure model + HTML renderer (v21 Stream 5). DOM-free so
// it is unit-tested; the controller (a later task) mounts the HTML, the 3D
// stage goes in #dr-stage, and CSS grid places each region. Every control
// renders exactly once. Nothing here writes state: ownership and
// affordability mirror progression.isUnlocked/canBuy, purely from the save.
import { asFiniteNonNeg } from '../progression.js';
import { areaInEdition, isClanEdition, placeName, effectiveArea, accessoryName } from '../edition.js';
import { TERRITORIES, territoryMapModel, opensAfterLine } from '../territories.js';
import { renderTerritoryMapHtml } from './territorymap.js';
import { clanPickerModel, CLAN_EMBLEMS } from './clanpicker.js';
import { clanName, isClanId } from '../clanhomes.js';
import { SKILLS, hasSkill } from '../skills.js';
import { prizeVisit } from '../visits.js';
import { CAT_BLURBS } from './catblurbs.js';
import { sanitizeCustomCats, presetFor, lookKey, COATS, CUSTOM_MAX } from '../customcats.js';
import { PAW } from './pawicon.js';
import { sanitizeOutfits, wornNow, sameWear, canSaveOutfit, OUTFIT_SLOTS, OUTFIT_MAX } from '../outfits.js';

// Launch A (2026-11-05): home holds the cat, the place and Start; every other
// screen is a sheet behind one of three doors. `menu` and `places` are the
// doors; the rest open from the Menu (the kid tiles, then the grown-ups row).
// Sound & controls is the children's half of the old Settings (volume, the
// touch controls); Game settings keeps the grown-ups' half (edition, quality,
// Start over). Friends folded into Play together (the friends list and the
// friend code) and the Journal (the stray cats), so one sheet holds every code.
export const MENU_TILES = ['together', 'colony', 'journal', 'album', 'skills', 'controls'];
export const GROWNUP_SHEETS = ['settings', 'sync', 'code'];
export const HOME_SHEETS = ['menu', 'places', ...MENU_TILES, ...GROWNUP_SHEETS];
export const SHEET_ICON = {
  menu: '☰', places: '🗺️', together: '👫', skills: '⭐', colony: '🐈', journal: '📖',
  album: '📸', sync: '☁️', settings: '⚙️', code: '🎁', controls: '🔊',
};
export const SHEET_NAME = {
  menu: 'Menu', places: 'Change place', together: 'Play together', skills: 'Skills', colony: 'Colony',
  journal: 'Journal', album: 'Album', sync: 'Cloud save', settings: 'Game settings', code: 'Secret code',
  controls: 'Sound & controls',
};
export const SHEET_LABEL = Object.fromEntries(HOME_SHEETS.map((id) => [id, `${SHEET_ICON[id]} ${SHEET_NAME[id]}`]));
// The den shop is not a home sheet: it lives inside the den (ui/denshopview.js).
// The old Friends sheet ('social') opens Play together, where its friends
// list and friend code went, so anything still asking for it lands there.
const SHEET_ALIAS = { social: 'together' };
export function resolveSheet(id) {
  if (typeof id !== 'string') return null;
  const want = Object.hasOwn(SHEET_ALIAS, id) ? SHEET_ALIAS[id] : id;
  return HOME_SHEETS.includes(want) ? want : null;
}

export const PLACE_PICTURE = (id) => `${import.meta.env.BASE_URL}places/${id}.jpg`;

// Display order of the slots (independent of catalog insertion order).
const SLOT_ORDER = ['collar', 'head', 'face', 'neck', 'body', 'back', 'feet'];
const SLOT_LABEL = { collar: 'Collar', head: 'Head', face: 'Face', neck: 'Neck', body: 'Body', back: 'Back', feet: 'Feet' };

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
  // Her own cats (the builder's): walking one means no ready-made portrait is selected.
  const customCats = sanitizeCustomCats(state?.customCats);
  const customId = plain(state?.equipped).custom;
  const myCat = customCats.find((c) => c.id === customId) ?? null;
  const previewing = typeof previewCat === 'string' && has(catalog.cats, previewCat);
  const heroId = previewing ? previewCat : selectedCat;
  const heroOwned = ownedCats.includes(heroId);
  const heroPrice = num(catalog.cats[heroId]?.price);
  const hero = myCat && !previewing
    ? {
      id: myCat.id, custom: true, name: myCat.name, blurb: CAT_BLURBS[presetFor(myCat.personality)] ?? '',
      owned: true, price: 0, canBuy: false, breed: presetFor(myCat.personality), look: myCat.look,
    }
    : {
      id: heroId, name: catalog.cats[heroId]?.name ?? '', blurb: CAT_BLURBS[heroId] ?? '',
      owned: heroOwned, price: heroPrice, canBuy: !heroOwned && points >= heroPrice, breed: heroId, look: null,
    };
  const cats = catIds.map((id) => ({
    id, name: catalog.cats[id].name, owned: ownedCats.includes(id), price: num(catalog.cats[id].price),
    selected: id === selectedCat && !myCat, previewing: previewing && id === heroId && (id !== selectedCat || !!myCat),
  }));
  // key = the portrait's cache key: the preset it walks as, and its look.
  const mine = customCats.map((c) => ({
    id: c.id, name: c.name, selected: !!myCat && c.id === myCat.id,
    key: `${presetFor(c.personality)}|${lookKey(c.look)}`,
    coatHex: `#${COATS[c.look.coat].hex.toString(16).padStart(6, '0')}`,
  }));

  const t = validTry(catalog, tryOn);
  const slotIds = slotsOf(catalog);
  const slots = slotIds.map((slot) => {
    const trying = !!t && t.slot === slot;
    const itemId = trying ? t.id : equippedId(state, catalog, slot);
    return { slot, label: labelOf(slot), itemId, itemName: itemId ? accessoryName(catalog.accessories[itemId], state?.edition) : null, trying };
  });
  const wearingCount = slotIds.filter((s) => equippedId(state, catalog, s)).length;

  const areaIds = Object.keys(catalog.areas);
  const area = typeof state?.area === 'string' && has(catalog.areas, state.area) ? state.area : areaIds[0];
  // Where the walk actually happens: a Legacy kid whose chosen place is
  // Clan-only walks the Neighborhood, so neither the dock nor the cards may
  // name the Woods; the card marked today's walk is the place she'll walk.
  const walkArea = effectiveArea({ area, edition: state?.edition }, catalog);
  const places = Object.entries(catalog.areas).filter(([, a]) => areaInEdition(a, state?.edition)).map(([id, a]) => {
    const owned = ownedAreas.includes(id);
    const price = num(a.price);
    const req = a.requires;
    const have = req ? walksIn(state, req.area) : 0;
    const gated = !owned && !!req && have < req.walks;
    let lockLine = '';
    if (gated) {
      lockLine = opensAfterLine(req, have, state?.edition, catalog);
    } else if (!owned) {
      lockLine = points >= price ? `Tap to unlock — ${price} 🐾` : `${price} 🐾 — keep walking!`;
    }
    return { id, name: placeName(id, state?.edition, catalog) || a.name, owned, selected: id === walkArea, canBuy: !owned && !gated && points >= price, price, locked: gated, lockLine };
  });

  // Clan Edition draws her territory map for the places on it; the rest
  // (the Park, Seaside, the Docks) stay picture cards under "Other places".
  const clanPlaces = isClanEdition(state) ? {
    territoryMap: territoryMapModel(state, catalog),
    clanPicker: clanPickerModel(state),
    clanPartnerName: typeof state?.colony?.partner?.petName === 'string' && state.colony.partner.petName ? state.colony.partner.petName : 'your partner',
    otherPlaces: places.filter((p) => !TERRITORIES.some((t) => t.areaId === p.id)),
  } : {};

  const shopIds = Object.keys(catalog.accessories).filter((id) => !catalog.accessories[id].prize);

  // Saved outfits (src/outfits.js): each with its items for the pictures, and
  // whether it is what she has on now (the worn look, never a try-on).
  const savedOutfits = sanitizeOutfits(state?.outfits, catalog);
  const wearNow = wornNow(plain(state?.equipped), catalog);
  const outfits = savedOutfits.map((o, i) => ({
    id: o.id, label: `Outfit ${i + 1}`, worn: sameWear(o.wear, wearNow),
    items: OUTFIT_SLOTS.filter((slot) => o.wear[slot]).map((slot) => ({
      id: o.wear[slot], name: accessoryName(catalog.accessories[o.wear[slot]], state?.edition), owned: ownedAcc.includes(o.wear[slot]),
    })),
  }));

  return {
    hero, cats, mine, canMake: mine.length < CUSTOM_MAX, slots, wearingCount, slotCount: slotIds.length, places, ...clanPlaces,
    // 'ok' | 'empty' | 'saved' | 'full': whether the look she has on can be saved.
    outfits, outfitSave: canSaveOutfit(savedOutfits, wearNow),
    currentPlace: {
      id: walkArea, name: placeName(walkArea, state?.edition, catalog),
      // Clan Edition: whose land today's walk is on ("StormClan land").
      clan: isClanEdition(state) && isClanId(walkArea) ? walkArea : null,
      line: isClanEdition(state) && isClanId(walkArea) ? `${clanName(walkArea)} land` : '',
    },
    // What she has on, for the Wearing summary (display order, prizes included).
    worn: slotIds.map((slot) => ({ slot, id: equippedId(state, catalog, slot) })).filter((w) => w.id)
      .map((w) => ({ ...w, name: accessoryName(catalog.accessories[w.id], state?.edition) })),
    lockedCount: cats.filter((c) => !c.owned).length,
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
    const name = escapeHtml(accessoryName(a, state?.edition));
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
        ? `<button class="dr-pick-buy" ${attrs('buy')}>Unlock — ${price} ${PAW}</button>`
        : `<span class="act">${price} 🐾 (can't afford)</span>`)
      + '</div>';
  }).join('');
}

function portraitHtml(c, thumbs) {
  const title = `${c.name}${c.owned ? '' : ` — ${c.price} 🐾`}`;
  return `<button class="dr-portrait ${c.selected || c.previewing ? 'sel' : ''} ${c.owned ? '' : 'locked'}" data-dr-cat="${escapeHtml(c.id)}" aria-pressed="${c.selected || c.previewing}" title="${escapeHtml(title)}">${img(thumbs?.cats?.[c.id], c.name)}</button>`;
}

// One of her own cats: its snapped portrait, or a coat-coloured dot with
// the first letter of its name when the portrait could not be drawn.
function mineHtml(c, thumbs) {
  const pic = thumbs?.mine?.[c.key];
  const face = pic ? img(pic, c.name)
    : `<span class="dr-mine-dot" style="--sw:${escapeHtml(c.coatHex)}">${escapeHtml(c.name.charAt(0))}</span>`;
  return `<button class="dr-portrait dr-mine ${c.selected ? 'sel' : ''}" data-dr-mine="${escapeHtml(c.id)}" aria-pressed="${c.selected}" title="${escapeHtml(c.name)}">${face}</button>`;
}
function makeHtml(canMake) {
  return canMake ? '<button class="dr-portrait dr-make" data-dr-make aria-label="Make a cat">＋ Make<span class="dr-make-more" aria-hidden="true"> a cat</span></button>'
    : '<div class="dr-portrait dr-make full" aria-disabled="true">3 of 3 — change one of yours for a new look</div>';
}

function slotHtml(s, openSlot, picker, thumbs) {
  const open = openSlot === s.slot;
  return `<button class="dr-slot ${s.itemId ? '' : 'empty'} ${open ? 'open' : ''} ${s.trying ? 'trying' : ''}" data-dr-slot="${escapeHtml(s.slot)}" aria-expanded="${open}">`
    + `${s.itemId ? img(thumbs?.wearing?.[s.slot] ?? thumbs?.accessories?.[s.itemId], '') : ''}`
    + `<span><small>${escapeHtml(s.label)}</small>${s.itemId ? escapeHtml(s.itemName) : '＋ add'}${s.trying ? ' (trying)' : ''}</span></button>`
    + (open ? `<div class="dr-picker">${picker ?? ''}</div>` : '');
}

function placeHtml(p) {
  const sub = p.selected ? 'today’s walk' : p.owned ? 'tap to walk here' : p.lockLine;
  const cant = !p.owned && !p.locked && !p.canBuy;
  return `<button class="dr-place ${p.selected ? 'sel' : ''} ${p.locked ? 'locked' : ''} ${cant ? 'cant' : ''}" data-dr-place="${escapeHtml(p.id)}">`
    + `<img src="${escapeHtml(PLACE_PICTURE(p.id))}" alt="" onerror="this.style.display='none'">`
    + `<span class="cap">${escapeHtml(p.name)}<small>${escapeHtml(sub)}</small></span></button>`;
}

// The builder's 🐾 Sit toggle (beside the name, in the hero text strip the
// stage keeps clear of the cat). One fixed label with aria-pressed, styled
// like the builder's own pills: pink while her cat sits, plain while it
// stands. A tap asks for the other pose. No pose given: no toggle.
export function poseToggleHtml(pose) {
  if (pose !== 'sit' && pose !== 'stand') return '';
  const sitting = pose === 'sit';
  // The label names what a tap does: a standing cat offers Sit, a sitting one Stand.
  return sitting
    ? `<button class="dr-pose" data-dr-pose="stand">${PAW} Stand</button>`
    : `<button class="dr-pose" data-dr-pose="sit">${PAW} Sit</button>`;
}

// The strip: her cats first (ready-made ones she owns, then her own, then
// ＋ Make), then one "🔒 N more" tile that shows the locked cats (Launch A).
// A locked cat she is previewing stays in view with the tile closed.
function stripHtml(m, ui, thumbs) {
  const open = !!ui.moreCats;
  const owned = m.cats.filter((c) => c.owned);
  const locked = m.cats.filter((c) => !c.owned);
  const shownLocked = open ? locked : locked.filter((c) => c.previewing);
  const more = locked.length
    ? `<button class="dr-portrait dr-more-cats" data-dr-more-cats aria-expanded="${open}">${open ? 'Fewer' : `<span aria-hidden="true">🔒</span> ${locked.length} more`}</button>`
    : '';
  return owned.map((c) => portraitHtml(c, thumbs)).join('')
    + (m.mine ?? []).map((c) => mineHtml(c, thumbs)).join('')
    + (m.canMake === undefined ? '' : makeHtml(m.canMake))
    + shownLocked.map((c) => portraitHtml(c, thumbs)).join('')
    + more;
}

// Saved outfits, under the wardrobe's slots: one row per outfit (a tap puts
// the whole outfit on; ✕ forgets it) and the button that saves what she has
// on now. An item she no longer owns shows faded: it is left off when worn.
const OUTFIT_SAVE_LABEL = {
  ok: '＋ Save this outfit',
  saved: 'Saved ✓',
  empty: 'Put something on to save it',
  full: `${OUTFIT_MAX} outfits saved (✕ one to save another)`,
};
function outfitHtml(o, thumbs) {
  const names = o.items.map((it) => it.name).join(', ');
  // One picture of her cat in the whole outfit when there is one (the view
  // snaps it); otherwise its items' menu pictures.
  const whole = thumbs?.outfitPics?.[o.id];
  const pics = whole
    ? `<span class="dr-outfit-pic whole">${img(whole, '')}</span>`
    : o.items.map((it) => `<span class="dr-outfit-pic ${it.owned ? '' : 'gone'}">${img(thumbs?.accessories?.[it.id], '')}</span>`).join('');
  return `<div class="dr-outfit ${o.worn ? 'on' : ''}">`
    + `<button class="dr-outfit-wear" data-dr-outfit="${escapeHtml(o.id)}" aria-pressed="${o.worn}" aria-label="${escapeHtml(`Wear ${o.label}: ${names}`)}">`
    + `<span class="dr-outfit-pics">${pics}</span>`
    + `<span class="dr-outfit-words">${escapeHtml(o.label)}<small>${o.worn ? 'on now ✓' : escapeHtml(names)}</small></span></button>`
    + `<button class="dr-outfit-del" data-dr-outfit-del="${escapeHtml(o.id)}" aria-label="${escapeHtml(`Delete ${o.label}`)}">✕</button></div>`;
}
function outfitsHtml(m, thumbs) {
  const outfits = m.outfits ?? [];
  const save = m.outfitSave ?? 'empty';
  return `<div class="dr-outfits">
    <p class="dr-label">Saved outfits</p>
    ${outfits.length ? `<div class="dr-outfit-list">${outfits.map((o) => outfitHtml(o, thumbs)).join('')}</div>` : ''}
    <button class="dr-outfit-save" data-dr-outfit-save ${save === 'ok' ? '' : 'disabled'}>${escapeHtml(OUTFIT_SAVE_LABEL[save] ?? OUTFIT_SAVE_LABEL.empty)}</button>
  </div>`;
}

// Home's Wearing panel: what she has on and one Dress up door; in the
// wardrobe, the slot grid (the picker opens under a slot) and Done.
function wearingHtml(m, ui, thumbs) {
  if (ui.wardrobe) {
    const openSlot = m.slots.some((s) => s.slot === ui.openSlot) ? ui.openSlot : null;
    return `<section class="dr-wearing dr-wardrobe-open" aria-label="Dress up">
    <div class="dr-wardrobe-head"><p class="dr-label">Dress up</p><button class="dr-done" data-dr-wardrobe-done>Done ✓</button></div>
    <div class="dr-slots">${m.slots.map((s) => slotHtml(s, openSlot, ui.pickerHtml, thumbs)).join('')}</div>
    ${outfitsHtml(m, thumbs)}
  </section>`;
  }
  const n = m.worn.length;
  const worn = n
    ? m.worn.map((w) => `<span class="dr-worn-item">${img(thumbs?.wearing?.[w.slot] ?? thumbs?.accessories?.[w.id], '')}${escapeHtml(w.name)}</span>`).join('')
    : '<span class="dr-worn-none">Nothing on yet</span>';
  return `<section class="dr-wearing" aria-label="Wearing">
    <p class="dr-label">Wearing</p>
    <div class="dr-worn">${worn}</div>
    <button class="dr-dressup" data-dr-wardrobe><span class="dr-dressup-icon" aria-hidden="true">👗</span><span class="dr-dressup-words">Dress up<small>${n ? `${n} ${n === 1 ? 'thing' : 'things'} on` : 'try something on'}</small></span></button>
  </section>`;
}

// Today's walk: one picture card for the place Start goes to; the whole card
// opens the Change place sheet.
// extrasHtml (the dusk switch) sits on the card's top-left corner, beside the
// card, not inside it: a checkbox can't live inside a button.
function todayHtml(m, extrasHtml = '') {
  const p = m.currentPlace;
  const emblem = p.clan && CLAN_EMBLEMS[p.clan] ? `<span class="dr-today-emblem">${CLAN_EMBLEMS[p.clan]}</span>` : '';
  const label = `Today’s walk: ${p.name}. Change place`;
  return `<section class="dr-today">
    <p class="dr-label">Today’s walk</p>
    <div class="dr-today-frame">
    <button class="dr-today-card" data-dr-sheet="places" aria-label="${escapeHtml(label)}">
      <img src="${escapeHtml(PLACE_PICTURE(p.id))}" alt="" onerror="this.style.display='none'">
      <span class="dr-change" aria-hidden="true">Change place ›</span>
      <span class="cap"><span class="dr-today-name">${emblem}${escapeHtml(p.name)}</span>${p.line ? `<small>${escapeHtml(p.line)}</small>` : ''}<small class="dr-today-change" aria-hidden="true">change ›</small></span>
    </button>
    ${extrasHtml ? `<div class="dr-today-extras">${extrasHtml}</div>` : ''}
    </div>
  </section>`;
}

// headerHtml / startHtml / extrasHtml are pre-rendered, already escaped HTML
// from the owner (homebase), inserted verbatim, once each. rankTitle is plain
// text (a phone shows it under the cat's name).
export function renderDressingRoomHtml({ model, headerHtml = '', startHtml = '', extrasHtml = '', rankTitle = '', ui = {}, thumbs } = {}) {
  const m = model;
  const h = m.hero;
  const building = typeof ui.builderHtml === 'string' && ui.builderHtml !== '';
  // Unlock is outlined, never pink: pink is Start's alone (Launch A).
  const buy = building ? ''
    : h.custom ? `<button class="dr-hero-edit" data-dr-edit="${escapeHtml(h.id)}">✏️ Change my cat</button>`
    : h.owned ? ''
    : h.canBuy ? `<button class="dr-hero-buy" data-dr-buy-cat="${escapeHtml(h.id)}">Unlock — ${h.price} ${PAW}</button>`
      : `<span class="dr-hero-price">${h.price} 🐾</span>`;
  const heroName = building ? (ui.heroName || 'Your cat') : h.name;
  const heroBlurb = building ? (ui.heroBlurb ?? '') : h.blurb;
  // the builder's 🐾 Sit sits beside the name (one row, not a row of its own,
  // so the strip the stage keeps clear for the text barely grows)
  const toggle = building ? poseToggleHtml(ui.pose) : '';
  const nameHtml = toggle
    ? `<div class="dr-hero-row"><div class="dr-hero-name">${escapeHtml(heroName)}</div>${toggle}</div>`
    : `<div class="dr-hero-name">${escapeHtml(heroName)}</div>`;
  const rank = !building && rankTitle ? `<div class="dr-hero-rank">${escapeHtml(rankTitle)}</div>` : '';
  const heroHtml = `<section class="dr-hero">
    <div class="dr-stage" id="dr-stage">
      <div class="dr-spin-hint">↔ drag to spin</div>
      <div class="dr-hero-text">${nameHtml}<div class="dr-hero-blurb">${escapeHtml(heroBlurb)}</div>${rank}${buy}</div>
    </div>`;

  // The builder (Task 8) keeps the top bar and the one stage; its rows replace
  // the strip, Wearing, Today's walk and the Start dock.
  if (building) {
    return `<div class="dr dr-building" id="dr">
  <header class="dr-top">${headerHtml}</header>
  ${heroHtml}
  </section>
  ${ui.builderHtml}
</div>`;
  }

  // (not "dr-home": that is a clan card's class)
  const view = ui.wardrobe ? 'wardrobe' : 'home';
  return `<div class="dr dr-view-${view}" id="dr" data-view="${view}">
  <header class="dr-top">${headerHtml}</header>
  ${heroHtml}
    <div class="dr-strip">${stripHtml(m, ui, thumbs)}</div>
  </section>
  ${wearingHtml(m, ui, thumbs)}
  ${ui.wardrobe ? '' : todayHtml(m, extrasHtml)}
  <footer class="dr-dock">
    <div class="where"><img src="${escapeHtml(PLACE_PICTURE(m.currentPlace.id))}" alt="" onerror="this.style.display='none'">Walking in <b>${escapeHtml(m.currentPlace.name)}</b></div>
    ${ui.wardrobe ? extrasHtml : ''}
    ${startHtml}
  </footer>
</div>`;
}

// The Change place sheet's body: Clan Edition draws her territory map, then the
// other places and the den under "More places"; Legacy keeps the picture cards.
// clanLineHtml (the clan in one line) and denHtml are the owner's, verbatim.
export function renderPlacesSheetHtml(model, { clanLineHtml = '', denHtml = '' } = {}) {
  const m = model;
  const body = m.territoryMap
    ? `${renderTerritoryMapHtml(m.territoryMap)}
    <p class="dr-label">More places</p>
    <div class="dr-places">${m.otherPlaces.map(placeHtml).join('')}${denHtml}</div>`
    : `<div class="dr-places">${m.places.map(placeHtml).join('')}${denHtml}</div>`;
  return `<div class="dr-where">${clanLineHtml}${body}</div>`;
}
