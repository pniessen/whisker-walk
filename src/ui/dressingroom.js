// The dressing room's pure model + HTML renderer (v21 Stream 5). DOM-free so
// it is unit-tested; the controller (a later task) mounts the HTML, the 3D
// stage goes in #dr-stage, and CSS grid places each region. Every control
// renders exactly once. Nothing here writes state: ownership and
// affordability mirror progression.isUnlocked/canBuy, purely from the save.
import { tvState, padHtml } from '../tvseam.js';
import { phrase } from '../clanphrases.js';
import { asFiniteNonNeg } from '../progression.js';
import { areaShown, isClanEdition, placeName, effectiveArea, accessoryName } from '../edition.js';
import { opensAfterLine, lower, goHereLine } from '../territories.js';
import { worldMapModel } from '../worldmap.js';
import { renderWorldMapHtml } from './territorymap.js';
import { placeCardFor, renderPlaceCardHtml } from './placecard.js';
import { clanPickerModel, emblemOf } from './clanpicker.js';
import { clanName, isClanId } from '../clanhomes.js';
import { SKILLS, hasSkill } from '../skills.js';
import { prizeVisit } from '../visits.js';
import { CAT_BLURBS } from './catblurbs.js';
import { sanitizeCustomCats, presetFor, lookKey, COATS, CUSTOM_MAX, CUSTOM_BASE, MORE_SLOTS_PRICE } from '../customcats.js';
import { PAW } from './pawicon.js';
import { sanitizeOutfits, wornNow, sameWear, canSaveOutfit, OUTFIT_SLOTS, OUTFIT_MAX } from '../outfits.js';
import { escapeHtml } from '../escapehtml.js';
import { areaOffer } from '../areaoffer.js';
import { spotsIn } from '../foundwear/spots/index.js';
import { shelfShows, holidayPrizeLine } from '../foundwear/holidaywear.js';

// Launch A (2026-11-05): home holds the cat, the place and Start; every other
// screen is a sheet behind one of three doors. `menu` and `places` are the
// doors; the rest open from the Menu: the kid tiles (My den, not a sheet, is
// the sixth), then Sound & controls as a slim row, then one quiet For grown-ups
// door (menu review #6 and #14, 2026-11-20). Sound & controls is the children's
// half of the old Settings (volume, the touch controls); For grown-ups opens
// the GROWNUP_SHEETS: Game settings keeps the grown-ups' half (edition,
// quality, Start over), then Gift code (Cloud save is the My cat tile). Friends folded into
// Play together (the friends list and the friend code) and the Journal (the
// stray cats), so one sheet holds every code.
export const MENU_TILES = ['together', 'colony', 'journal', 'album', 'skills', 'sync'];
export const GROWNUP_SHEETS = ['settings', 'code'];
export const HOME_SHEETS = ['menu', 'places', ...MENU_TILES, 'controls', 'grownups', ...GROWNUP_SHEETS];
export const SHEET_ICON = {
  menu: '☰', places: '🗺️', together: '👫', skills: '⭐', colony: '🐈', journal: '📖',
  album: '📸', sync: '☁️', settings: '⚙️', code: '🎁', controls: '🔊', grownups: '⚙️',
};
export const SHEET_NAME = {
  menu: 'Menu', places: 'Change place', together: 'Play together', skills: 'Skills',
  // read when asked, so the word set in use decides it (My clan / My cats)
  get colony() { return phrase('menu.myCats'); },
  get sync() { return phrase('menu.myCat'); }, // the cat login sheet: a Menu tile now
  journal: 'Journal', album: 'Album', settings: 'Game settings', code: 'Gift code',
  controls: 'Sound & controls', grownups: 'For grown-ups',
};
export const SHEET_LABEL = Object.defineProperties({}, Object.fromEntries(HOME_SHEETS.map((id) => [id, { enumerable: true, get: () => `${SHEET_ICON[id]} ${SHEET_NAME[id]}` }])));
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

// Why a place she tapped did not open, in one line: the walks it waits for, or
// the paws still to find. null when nothing is missing (she owns it, it would
// open) or it is not a place in this edition.
export function placeWhyLine(state, catalog, id) {
  const a = typeof id === 'string' && has(catalog.areas, id) ? catalog.areas[id] : null;
  if (!a || !areaShown(a, state?.edition) || ownedList(state, 'areas').includes(id)) return null;
  // The gate and price ask areaOffer, which knows a kept offer.
  const offer = areaOffer(state, catalog, id);
  const req = offer.requires;
  const have = req ? walksIn(state, req.area) : 0;
  if (req && have < req.walks) return opensAfterLine(req, have, state?.edition, catalog);
  const short = num(offer.price) - num(state?.points);
  return short > 0 ? `${short} more 🐾 to go` : null;
}

// Display order of the slots (independent of catalog insertion order).
const SLOT_ORDER = ['collar', 'head', 'face', 'neck', 'body', 'back', 'feet'];
const SLOT_LABEL = { collar: 'Collar', head: 'Head', face: 'Face', neck: 'Neck', body: 'Body', back: 'Back', feet: 'Feet' };

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

// The first visits that show the small "the town" line under the Neighborhood.
export const TOWN_NOTE_VISITS = 5;

// The line under the Neighborhood's name while the series name is new to her;
// '' for every other place, once past the first visits, and in the everyday
// words (an empty phrase). Legacy keeps the plain name, so no line there.
function withTownNote(card, state) {
  return card ? { ...card, townNote: townNoteFor(card.id, state) } : card;
}

function townNoteFor(areaId, state) {
  if (areaId !== 'neighborhood' || !isClanEdition(state)) return '';
  const v = num(state?.visits);
  return v <= TOWN_NOTE_VISITS ? phrase('place.townNote') : '';
}

// touch: a touch screen (the home screen's getIsTouch), for "tap" or "click".
export function buildDressingModel(state, catalog, { previewCat, tryOn, mapCard, touch = false } = {}) {
  const points = num(state?.points);
  const equippedCat = plain(state?.equipped).cat;
  const ownedCats = ownedList(state, 'cats');
  const ownedAcc = ownedList(state, 'accessories');
  const ownedAreas = ownedList(state, 'areas');

  // A gift cat (`code`, the birthday kitten) is not in the picker until hers.
  const catIds = Object.keys(catalog.cats).filter((id) => !catalog.cats[id].code || ownedCats.includes(id));
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
      looking: previewing && !heroOwned, // a locked cat, shown but not walked
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
  const places = Object.entries(catalog.areas).filter(([, a]) => areaShown(a, state?.edition)).map(([id, a]) => {
    const owned = ownedAreas.includes(id);
    const offer = areaOffer(state, catalog, id); // knows a kept offer
    const price = num(offer.price);
    const req = offer.requires;
    const have = req ? walksIn(state, req.area) : 0;
    const gated = !owned && !!req && have < req.walks;
    let lockLine = '';
    if (gated) {
      lockLine = opensAfterLine(req, have, state?.edition, catalog);
    } else if (!owned) {
      lockLine = points >= price ? `Unlock — ${price} 🐾` : `${price} 🐾 — keep exploring!`;
    }
    return { id, name: placeName(id, state?.edition, catalog) || a.name, owned, selected: id === walkArea, canBuy: !owned && !gated && points >= price, price, locked: gated, lockLine, goLine: goHereLine(touch) };
  });

  // Clan Edition draws the world map, every place on it (her board and the
  // street places around it), and the pop-up card of the place she tapped
  // (mapCard, an areaId) when one is open. Legacy keeps its picture cards.
  let clanPlaces = { placeCard: null };
  if (isClanEdition(state)) {
    const worldMap = worldMapModel(state, catalog, { touch });
    clanPlaces = {
      worldMap,
      placeCard: typeof mapCard === 'string' ? withTownNote(placeCardFor(worldMap, mapCard, points), state) : null,
      clanPicker: clanPickerModel(state),
      clanPartnerName: typeof state?.colony?.partner?.petName === 'string' && state.colony.partner.petName ? state.colony.partner.petName : 'your partner',
    };
  }

  // (a seasonal item is in the count only while its shelf is open, or once she owns it)
  const shopIds = Object.keys(catalog.accessories).filter((id) => !catalog.accessories[id].prize && shelfShows(catalog.accessories[id], ownedAcc.includes(id)));

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

  // A locked cat or a try-on on show is not what Start walks: the cat (and
  // outfit) she owns is. walkingAs names that cat while either is up.
  const walkName = myCat ? myCat.name : catalog.cats[selectedCat]?.name ?? '';
  const walkingAs = hero.looking || (t && !ownedAcc.includes(t.id)) ? walkName : null;

  // Three cat slots, five once slots 4 and 5 are bought. The buy tile shows
  // only when the three are full and the pair is not hers yet.
  const bought = state?.moreCatSlots === true || mine.length > CUSTOM_BASE;
  const slotsHers = bought ? CUSTOM_MAX : CUSTOM_BASE;
  const slotBuy = !bought && mine.length >= CUSTOM_BASE ? { price: MORE_SLOTS_PRICE, canBuy: points >= MORE_SLOTS_PRICE } : null;

  return {
    removable: mine.filter((c) => !c.selected).length,
    hero, cats, mine, walkingAs, canMake: mine.length < slotsHers, slotBuy, slots, wearingCount, slotCount: slotIds.length, places, ...clanPlaces,
    // 'ok' | 'empty' | 'saved' | 'full': whether the look she has on can be saved.
    outfits, outfitSave: canSaveOutfit(savedOutfits, wearNow),
    currentPlace: {
      id: walkArea, name: placeName(walkArea, state?.edition, catalog),
      // Clan Edition: whose land today's walk is on ("StormClan land").
      clan: isClanEdition(state) && isClanId(walkArea) ? walkArea : null,
      line: isClanEdition(state) && isClanId(walkArea) ? phrase('place.groupLand', clanName(walkArea)) : '',
      townNote: townNoteFor(walkArea, state),
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
    // A seasonal item whose shelf is closed: not shown at all (an owned one always is).
    if (!shelfShows(a, owned)) return '';
    const price = num(a.price);
    const on = owned && worn === id && !(t && t.slot === slot && t.id !== id);
    const trying = !!t && t.slot === slot && t.id === id;
    const pic = img(thumbs?.accessories?.[id], '');
    const name = escapeHtml(accessoryName(a, state?.edition));
    const attrs = (act) => `data-dr-acc="${escapeHtml(id)}" data-dr-act="${act}"`;
    // A find-only outfit not found yet: its shape and where it is found. No
    // data-dr-acc (the controller ignores it), no price, no try-on. In Legacy
    // a place her edition hides keeps its outfits out of sight until found.
    if (a.find && !owned) {
      if (!catalog.areas?.[a.find] || !areaShown(catalog.areas[a.find], state?.edition)) return ''; // (a place with no catalog row yet, the Moon behind ?moon=1, shows no silhouette)
      // Nothing is hidden in a place with no find spots: no silhouette to hunt for.
      if (spotsIn(a.find).length === 0) return '';
      const where = phrase('wear.foundIn', lower(placeName(a.find, state?.edition, catalog)));
      return `<div class="dr-pick locked found-silhouette" role="group" aria-label="${escapeHtml(phrase('wear.notYet'))}">`
        + `<span class="found-shape" aria-hidden="true">${escapeHtml(a.emoji ?? '')}</span><span>${escapeHtml(where)}</span></div>`;
    }
    // A gift outfit (src/foundwear/gifts.js) not given: not shown at all, so
    // nothing hints at a surprise only a code brings.
    if (a.code && !owned) return '';
    // An unwon prize stays a surprise: no data-dr-acc (the controller ignores
    // it), no price, no try-on.
    if (a.prize && !owned) {
      // (a Fairground prize is won at one of its games, not by visiting)
      const how = a.holiday ? holidayPrizeLine(a.holiday) : a.fair ? phrase('fair.prize.locked') : prizeVisit(id) == null ? phrase('wear.areaPrize') : `A surprise at visit ${prizeVisit(id)}`;
      return `<div class="dr-pick locked prize-surprise"><span class="gift" aria-hidden="true">🎁</span><span>${escapeHtml(how)}</span></div>`;
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
  // Only the cat she will walk gets the solid ring; a locked one on show is
  // "looking" (a dashed ring).
  return `<button class="dr-portrait ${c.selected ? 'sel' : c.previewing ? 'looking' : ''} ${c.owned ? '' : 'locked'}" data-dr-cat="${escapeHtml(c.id)}" aria-pressed="${c.selected}" title="${escapeHtml(title)}">${img(thumbs?.cats?.[c.id], c.name)}</button>`;
}

// One of her own cats: its snapped portrait, or a coat-coloured dot with
// the first letter of its name when the portrait could not be drawn.
function mineHtml(c, thumbs) {
  const pic = thumbs?.mine?.[c.key];
  const face = pic ? img(pic, c.name)
    : `<span class="dr-mine-dot" style="--sw:${escapeHtml(c.coatHex)}">${escapeHtml(c.name.charAt(0))}</span>`;
  return `<button class="dr-portrait dr-mine ${c.selected ? 'sel' : ''}" data-dr-mine="${escapeHtml(c.id)}" aria-pressed="${c.selected}" title="${escapeHtml(c.name)}">${face}</button>`;
}
function makeHtml(m) {
  if (m.canMake) return '<button class="dr-portrait dr-make" data-dr-make aria-label="Make a cat">＋ Make<span class="dr-make-more" aria-hidden="true"> a cat</span></button>';
  const b = m.slotBuy;
  if (!b) return `<div class="dr-portrait dr-make full" aria-disabled="true">${escapeHtml(phrase('slots.full', m.mine.length))}</div>`;
  const words = `${escapeHtml(phrase('slots.buy', b.price))} ${PAW}`;
  return b.canBuy
    ? `<button class="dr-portrait dr-make dr-buy-slots" data-dr-buy-slots aria-label="${escapeHtml(phrase('slots.buyLabel', b.price))}">${words}</button>`
    : `<div class="dr-portrait dr-make dr-buy-slots full" aria-disabled="true">${words}<br>${escapeHtml(phrase('slots.save', b.price))} ${PAW} ${escapeHtml(phrase('slots.saveEnd'))}</div>`;
}

function slotHtml(s, openSlot, picker, thumbs) {
  const open = openSlot === s.slot;
  return `<button class="dr-slot ${s.itemId ? '' : 'empty'} ${open ? 'open' : ''} ${s.trying ? 'trying' : ''}" data-dr-slot="${escapeHtml(s.slot)}" aria-expanded="${open}">`
    + `${s.itemId ? img(thumbs?.wearing?.[s.slot] ?? thumbs?.accessories?.[s.itemId], '') : ''}`
    + `<span><small>${escapeHtml(s.label)}</small>${s.itemId ? escapeHtml(s.itemName) : '＋ add'}${s.trying ? ' (trying)' : ''}</span></button>`
    + (open ? `<div class="dr-picker">${picker ?? ''}</div>` : '');
}

function placeHtml(p) {
  // One she can buy: the picture is not a button (a tap there never spends);
  // its Unlock button asks first (dressingroomview.js).
  if (p.canBuy) {
    return `<div class="dr-place can-buy">`
      + `<img src="${escapeHtml(PLACE_PICTURE(p.id))}" alt="" onerror="this.style.display='none'">`
      + `<span class="cap">${escapeHtml(p.name)}<button type="button" class="dr-place-buy" data-dr-place-buy="${escapeHtml(p.id)}">${escapeHtml(p.lockLine)}</button></span></div>`;
  }
  const sub = p.selected ? 'you’re going here' : p.owned ? p.goLine : p.lockLine;
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
    + (m.canMake === undefined ? '' : makeHtml(m))
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
  full: `${OUTFIT_MAX} saved. Delete one to save a new one.`,
};
const OUTFIT_PICS_MAX = 3; // the fallback row's small pictures; the rest are a "+N" chip
function outfitHtml(o, thumbs, asking) {
  const names = o.items.map((it) => it.name).join(', ');
  if (asking) {
    // The question replaces just this row; both answers are thumb-sized.
    return `<div class="dr-outfit ask" role="group" aria-label="${escapeHtml(`Delete ${o.label}?`)}">`
      + `<span class="dr-outfit-q">Delete ${escapeHtml(o.label)}?</span>`
      + `<button class="dr-outfit-yes" data-dr-outfit-yes="${escapeHtml(o.id)}">Yes, delete</button>`
      + `<button class="dr-outfit-keep" data-dr-outfit-keep="${escapeHtml(o.id)}">Keep it</button></div>`;
  }
  // One picture of her cat in the whole outfit when there is one (the view
  // snaps it); otherwise a few of its items' menu pictures. With the whole
  // picture the names stay in the aria-label only; the small item pictures
  // are hard to tell apart, so the fallback row spells the names out.
  const whole = thumbs?.outfitPics?.[o.id];
  const shown = o.items.slice(0, OUTFIT_PICS_MAX);
  const extra = o.items.length - shown.length;
  const pics = whole
    ? `<span class="dr-outfit-pic whole">${img(whole, '')}</span>`
    : shown.map((it) => `<span class="dr-outfit-pic ${it.owned ? '' : 'gone'}">${img(thumbs?.accessories?.[it.id], '')}</span>`).join('')
      + (extra > 0 ? `<span class="dr-outfit-more">+${extra}</span>` : '');
  const small = o.worn ? 'on now ✓' : (whole ? '' : escapeHtml(names));
  return `<div class="dr-outfit ${o.worn ? 'on' : ''}">`
    + `<button class="dr-outfit-wear" data-dr-outfit="${escapeHtml(o.id)}" aria-pressed="${o.worn}" aria-label="${escapeHtml(`Wear ${o.label}: ${names}`)}">`
    + `<span class="dr-outfit-pics">${pics}</span>`
    + `<span class="dr-outfit-words">${escapeHtml(o.label)}${small ? `<small>${small}</small>` : ''}</span></button>`
    + `<button class="dr-outfit-del" data-dr-outfit-del="${escapeHtml(o.id)}" aria-label="${escapeHtml(`Delete ${o.label}`)}">✕</button></div>`;
}
function outfitsHtml(m, thumbs, ask = null) {
  const outfits = m.outfits ?? [];
  const save = m.outfitSave ?? 'empty';
  return `<div class="dr-outfits">
    <p class="dr-label">Saved outfits</p>
    ${outfits.length ? `<div class="dr-outfit-list">${outfits.map((o) => outfitHtml(o, thumbs, o.id === ask)).join('')}</div>` : ''}
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
    <button class="dr-remove-all" data-dr-remove-all ${m.wearingCount ? '' : 'disabled'}>${escapeHtml(phrase('wear.removeAll'))}</button>
    ${outfitsHtml(m, thumbs, ui.outfitAsk)}
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
// extrasHtml (the dusk moon, when dusk is chosen in Change place) sits on the
// card's top-left corner, beside the card, not inside it.
function todayHtml(m, extrasHtml = '') {
  const p = m.currentPlace;
  const emblem = p.clan && emblemOf(p.clan) ? `<span class="dr-today-emblem">${emblemOf(p.clan)}</span>` : '';
  const label = `Going to: ${p.name}. Change place`;
  return `<section class="dr-today">
    <p class="dr-label">Today’s place</p>
    <div class="dr-today-frame">
    <button class="dr-today-card" data-dr-sheet="places" aria-label="${escapeHtml(label)}">
      <img src="${escapeHtml(PLACE_PICTURE(p.id))}" alt="" onerror="this.style.display='none'">
      <span class="dr-change" aria-hidden="true">Change place ›</span>
      <span class="cap"><span class="dr-today-name">${emblem}${escapeHtml(p.name)}</span>${p.townNote ? `<small class="dr-town-note">${escapeHtml(p.townNote)}</small>` : ''}${p.line ? `<small>${escapeHtml(p.line)}</small>` : ''}<small class="dr-today-change" aria-hidden="true">change ›</small></span>
    </button>
    ${extrasHtml ? `<div class="dr-today-extras">${extrasHtml}</div>` : ''}
    </div>
  </section>`;
}

// headerHtml / startHtml / extrasHtml are pre-rendered, already escaped HTML
// from the owner (homebase), inserted verbatim, once each. rankTitle is plain
// text, in the page but not shown (every screen shows the cat's personality
// under its name; the rank is in the Menu).
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
  // Under a locked cat on show: that it is only a look, not her rank (which
  // read as the cat's).
  const rank = building ? ''
    : h.looking ? '<div class="dr-hero-rank dr-hero-looking">Just looking. Unlock to play as this cat.</div>'
    : rankTitle ? `<div class="dr-hero-rank">${escapeHtml(rankTitle)}</div>` : '';
  const heroHtml = `<section class="dr-hero">
    <div class="dr-stage" id="dr-stage">
      <div class="dr-spin-hint">${(tvState.input === 'pad' && padHtml('⟦look⟧ spin')) || '↔ drag to spin'}</div>
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
    ${m.removable ? `<button class="dr-remove-cats" data-dr-remove-cats>${escapeHtml(phrase('cats.removeOthers'))}</button>` : ''}
  </section>
  ${wearingHtml(m, ui, thumbs)}
  ${ui.wardrobe ? '' : todayHtml(m, extrasHtml)}
  <footer class="dr-dock">
    <div class="where"><img src="${escapeHtml(PLACE_PICTURE(m.currentPlace.id))}" alt="" onerror="this.style.display='none'">Going to <b>${escapeHtml(m.currentPlace.name)}</b></div>
    ${ui.wardrobe ? extrasHtml : ''}
    ${startHtml}
  </footer>
</div>`;
}

// The Change place sheet's body. Clan Edition: the world map only, every
// place on it, with its zoom buttons and the pop-up card of the place she
// tapped. The den is not on it: the den is home, not a place to walk, and has
// its own Menu tile, so denHtml is not drawn here. Legacy keeps the picture
// cards and the den after them, exactly as before.
// clanLineHtml (the clan in one line) and denHtml are the owner's, verbatim.
// hintHtml (the map's first-time line) shows above the map frame only.
export function renderPlacesSheetHtml(model, { clanLineHtml = '', denHtml = '', hintHtml = '' } = {}) {
  const m = model;
  if (m.worldMap) {
    const card = m.placeCard ? renderPlaceCardHtml(m.placeCard, { picture: PLACE_PICTURE(m.placeCard.id) }) : '';
    const zoom = '<div class="wm-zoom"><button type="button" class="wm-zoom-in" data-wm-zoom="in" aria-label="Zoom in">＋</button>'
      + '<button type="button" class="wm-zoom-out" data-wm-zoom="out" aria-label="Zoom out">－</button></div>';
    return `<div class="dr-where">${clanLineHtml}${hintHtml}<div class="wm-frame">${renderWorldMapHtml(m.worldMap)}${zoom}${card}</div></div>`;
  }
  const body = `<div class="dr-places">${[...m.places.filter((p) => !p.locked), ...m.places.filter((p) => p.locked)].map(placeHtml).join('')}${denHtml}</div>`;
  return `<div class="dr-where">${clanLineHtml}${body}</div>`;
}
