// The den shop, inside the den (v21 Stream 5, Task 6). Pure: state in, HTML
// out, no DOM and no writes. The overlay that mounts it, pauses the cat and
// calls progression.buyDenItem / placeDenItem is src/ui/denshopview.js.
//
// Every string that reaches the HTML is escaped (item names come from the
// catalog today, but the save is untrusted and the renderer does not care
// where a name came from), and every number from the save goes through
// asFiniteNonNeg. Counts come from the DEN_ITEMS / DEN_SPOTS passed in.
import { asFiniteNonNeg } from '../progression.js';
import { PAW } from './pawicon.js';
import { DEN_ITEMS, DEN_SPOTS } from '../den.js';
import { denWord } from './denwords.js';
import { iconFor, cellFor, planOrderOk, PLAN_COLS, PLAN_ROWS } from './denplan.js';

// A short, friendly name for each anchor spot, keyed by its DEN_SPOTS id (the
// ids are save keys and read like code). "Left" and "right" are as seen from
// where the cat comes in, facing the window; see the room map in src/den.js.
export const SPOT_LABEL = Object.freeze({
  'rug-spot': 'Front and middle',
  'corner-a': 'Back left corner',
  'corner-b': 'Back right corner',
  window: 'Under the window',
  shelf: 'By the clock',
  center: 'The very middle',
  nook: 'Left of the window',
  alcove: 'Right of the window',
  'west-wall': 'By the bookcase',
  'east-mid': 'Right of the middle',
  'corner-c': 'By the fireplace',
  'corner-d': 'Front right corner',
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (obj, k) => isObj(obj) && typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);
const spotLabel = (id) => SPOT_LABEL[id] ?? id;

// What the save says, cleaned: owned ids the catalog knows (once each), and
// placements of owned pieces at known spots. Same "unknown data is dropped,
// never thrown on" posture as progression.js's sanitizeDen.
function readDen(state, items, spots) {
  const den = isObj(state) && isObj(state.den) ? state.den : {};
  const owned = [];
  for (const id of Array.isArray(den.owned) ? den.owned : []) {
    if (has(items, id) && !owned.includes(id)) owned.push(id);
  }
  const spotIds = new Set(spots.map((s) => s && s.id));
  const placed = {};
  if (isObj(den.placed)) {
    for (const [spotId, itemId] of Object.entries(den.placed)) {
      if (spotIds.has(spotId) && owned.includes(itemId)) placed[spotId] = itemId;
    }
  }
  return { owned, placed };
}

function itemCard(id, item, owned, points, placedHere = true) {
  const name = escapeHtml(item?.name ?? id);
  const price = asFiniteNonNeg(item?.price, 0);
  if (owned) {
    return `<div class="ds-card owned" data-den-item="${escapeHtml(id)}">
      <div class="ds-name">${name}</div><div class="ds-act"><span class="ds-tag">✓ Yours${placedHere ? '' : ' · not placed'}</span></div>
    </div>`;
  }
  if (points >= price) {
    return `<div class="ds-card" data-den-item="${escapeHtml(id)}">
      <div class="ds-name">${name}</div><div class="ds-act"><button type="button" class="ds-buy" data-den-buy="${escapeHtml(id)}" aria-label="Buy — ${price} paw points">Buy — ${price} ${PAW}</button></div>
    </div>`;
  }
  return `<div class="ds-card locked" data-den-item="${escapeHtml(id)}">
      <div class="ds-name">${name}</div><div class="ds-act"><span class="ds-tag" aria-label="${price} paw points">${price} ${PAW}</span><span class="ds-need">${escapeHtml(denWord('needMore', null, { n: Math.max(1, Math.ceil(price - points)) }))}</span></div>
    </div>`;
}

// A spot as a button: the piece standing there (its icon) or a dashed "+".
// The label always reaches a screen reader (aria-label); on the plan it shows too, small.
function spotButton(spot, placed, items, stage, mode, cell) {
  const there = placed[spot.id];
  const name = there ? (items[there]?.name ?? there) : '';
  const label = spotLabel(spot.id);
  const inHand = stage && stage.kind === 'hand';
  const cls = ['dp-spot', there ? 'filled' : 'empty'];
  if (inHand && stage.from === spot.id) cls.push('from');
  if (inHand && !there) cls.push('open');
  const aria = `${label}: ${there ? name : denWord('emptySpot')}`;
  const act = inHand ? ` data-den-hand-spot="${escapeHtml(spot.id)}"` : '';
  const pos = cell && mode === 'plan' ? ` style="grid-column:${cell.col + 1};grid-row:${cell.row + 1}"` : '';
  return `<button type="button" class="${cls.join(' ')}" data-den-plan-spot="${escapeHtml(spot.id)}"${act}${pos} aria-label="${escapeHtml(aria)}">
      <span class="dp-icon" aria-hidden="true">${there ? iconFor(there) : '+'}</span>
      <span class="dp-label">${escapeHtml(label)}</span>
    </button>`;
}

// The plan view (five columns, back wall on top), or the labelled grid when a
// spot has no cell or the layout lies about the room (ui.grid forces it too).
function planHtml(spotList, placed, items, stage, forceGrid) {
  const mode = !forceGrid && planOrderOk(spotList) ? 'plan' : 'grid';
  const buttons = spotList.map((spot) => spotButton(spot, placed, items, stage, mode, cellFor(spot.id))).join('');
  const aria = escapeHtml(denWord('planLabel'));
  if (mode === 'grid') return `<div class="dp-grid" role="group" aria-label="${aria}">${buttons}</div>`;
  return `<div class="dp-wrap"><div class="dp-edge dp-back">${escapeHtml(denWord('backWall'))}</div>
    <div class="dp-plan" role="group" aria-label="${aria}" style="--dp-cols:${PLAN_COLS};--dp-rows:${PLAN_ROWS}">${buttons}</div>
    <div class="dp-edge dp-front">${escapeHtml(denWord('openFront'))}</div></div>`;
}

// Everything she owns as chips: tap one to take it in hand (a placed one says where it stands).
function shelfHtml(owned, placed, items, stage) {
  if (!owned.length) return `<p class="ds-hint">${escapeHtml(denWord('shelfEmpty'))}</p>`;
  const where = {};
  for (const [spotId, itemId] of Object.entries(placed)) where[itemId] = spotId;
  const chips = owned.map((id) => {
    const at = where[id] ? spotLabel(where[id]) : denWord('notPlaced');
    const held = !!stage && stage.kind === 'hand' && stage.id === id;
    return `<button type="button" class="dp-chip${held ? ' held' : ''}${where[id] ? '' : ' loose'}" data-den-hand-item="${escapeHtml(id)}" aria-pressed="${held}">
      <span class="dp-icon" aria-hidden="true">${iconFor(id)}</span><span class="dp-chip-name">${escapeHtml(items[id]?.name ?? id)}</span><span class="dp-chip-at">${escapeHtml(at)}</span></button>`;
  }).join('');
  return `<h3>${escapeHtml(denWord('shelfTitle'))}</h3><div class="dp-shelf">${chips}</div>`;
}

/**
 * renderDenShopHtml(state, items = DEN_ITEMS, spots = DEN_SPOTS, ui = {}) → string
 *
 * ui.note: one short line shown under the title (e.g. after a buy).
 */
export function renderDenShopHtml(state, items = DEN_ITEMS, spots = DEN_SPOTS, ui = {}) {
  const catalog = isObj(items) ? items : {};
  const spotList = Array.isArray(spots) ? spots.filter((s) => s && typeof s.id === 'string') : [];
  const points = asFiniteNonNeg(isObj(state) ? state.points : undefined, 0);
  const { owned, placed } = readDen(state, catalog, spotList);
  const note = ui && typeof ui.note === 'string' && ui.note ? `<p class="ds-note">${escapeHtml(ui.note)}</p>` : '';
  // After a buy ("is yours": Place it now / Later) and while a piece is in hand
  // (a button per spot, in place of the dropdown rows; the plan view replaces
  // this in the next step). Both read the id from ui.stage, never from the save.
  const stage = isObj(ui?.stage) && has(catalog, ui.stage.id) && owned.includes(ui.stage.id) ? ui.stage : null;
  const stageName = stage ? escapeHtml(catalog[stage.id]?.name ?? stage.id) : '';
  const yours = stage && stage.kind === 'yours'
    ? `<div class="ds-yours" role="group" aria-label="${stageName}">
      <p class="ds-yours-line">${escapeHtml(denWord('isYours', null, { name: catalog[stage.id]?.name ?? stage.id }))}</p>
      <div class="ds-yours-btns"><button type="button" class="ds-place-now" data-den-place-now data-pad-default>${escapeHtml(denWord('placeIt'))}</button>
      <button type="button" class="ds-later" data-den-later>${escapeHtml(denWord('later'))}</button></div>
    </div>` : '';
  const hand = !!stage && stage.kind === 'hand';
  const handName = hand ? (catalog[stage.id]?.name ?? stage.id) : '';
  const fromId = hand && typeof stage.from === 'string' && placed[stage.from] === stage.id ? stage.from : null;
  const putAway = fromId ? `<button type="button" class="ds-later ds-put-away" data-den-put-away>${escapeHtml(denWord('putAway'))}</button>` : '';
  const handBar = hand
    ? `<div class="ds-hand"><span class="ds-hand-line">${escapeHtml(denWord(fromId ? 'pickedUp' : 'handPlace', null, { name: handName }))}</span>
      <button type="button" class="ds-later" data-den-later>${escapeHtml(denWord('later'))}</button>${putAway}</div>` : '';
  // Two sections: the Shop (cards) and My things (the plan and the shelf). A piece in hand always shows the plan.
  const tab = hand ? 'things' : (ui && (ui.tab === 'shop' || ui.tab === 'things') ? ui.tab : (owned.length ? 'things' : 'shop'));
  const shop = `<div class="ds-cards">
      ${Object.entries(catalog).map(([id, item]) => itemCard(id, item, owned.includes(id), points, Object.values(placed).includes(id))).join('')}
      </div>`;
  const handState = hand ? { ...stage, from: fromId } : null;
  const things = `${planHtml(spotList, placed, catalog, handState, !!(ui && ui.grid))}\n      ${shelfHtml(owned, placed, catalog, handState)}`;
  const body = tab === 'things' ? things : (owned.length ? '' : '<p class="ds-hint">Buy something you like, then pick a spot for it!</p>\n      ') + shop;
  const tabBtn = (id, word) => `<button type="button" role="tab" class="ds-tab${tab === id ? ' on' : ''}" id="ds-tab-${id}" data-den-tab="${id}" aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}">${escapeHtml(denWord(word))}</button>`;
  const tabs = `<div class="ds-tabs" role="tablist" aria-label="${escapeHtml(denWord('tablist'))}">${tabBtn('shop', 'tabShop')}${tabBtn('things', 'tabThings')}</div>`;
  // The pad's shortcut line: HTML made by the glyph module (or our own plain words), never from the save.
  const padKeys = ui && typeof ui.padKeysHtml === 'string' && ui.padKeysHtml ? `<p class="ds-padkeys">${ui.padKeysHtml}</p>` : '';
  const walkIn = ui && ui.home ? `<div class="ds-foot"><button type="button" class="ds-walkin" data-den-walk-in>${escapeHtml(denWord('walkInLabel'))}</button></div>` : '';
  return `<div class="ds-head">
      <h2>🛋️ Den shop</h2>
      <span class="ds-points" aria-label="${points} paw points">${PAW} ${points}</span>
      <button type="button" class="ds-done" data-den-done>Done</button>
    </div>
    ${tabs}
    ${note}${yours}${handBar}
    <div class="ds-body" role="tabpanel" aria-labelledby="ds-tab-${tab}">
      ${body}
    </div>
    ${walkIn}${padKeys}`;
}

/**
 * changedSpots(before, after, spots = DEN_SPOTS) → [[spotId, itemId|null], ...]
 *
 * Which spots a placeDenItem call changed. One call can change two (placing a
 * piece that stood elsewhere moves it), and the running den re-places each.
 */
export function changedSpots(before, after, spots = DEN_SPOTS) {
  if (!Array.isArray(spots)) return [];
  const a = isObj(before) ? before : {};
  const b = isObj(after) ? after : {};
  const out = [];
  for (const spot of spots) {
    const id = spot && spot.id;
    if (typeof id !== 'string') continue;
    const was = typeof a[id] === 'string' ? a[id] : null;
    const now = typeof b[id] === 'string' ? b[id] : null;
    if (was !== now) out.push([id, now]);
  }
  return out;
}
