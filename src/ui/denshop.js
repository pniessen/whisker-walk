// The den shop, inside the den (v21 Stream 5, Task 6). Pure: state in, HTML
// out, no DOM and no writes. The overlay that mounts it, pauses the cat and
// calls progression.buyDenItem / placeDenItem is src/ui/denshopview.js.
//
// Every string that reaches the HTML is escaped (item names come from the
// catalog today, but the save is untrusted and the renderer does not care
// where a name came from), and every number from the save goes through
// asFiniteNonNeg. Counts come from the DEN_ITEMS / DEN_SPOTS passed in.
import { asFiniteNonNeg } from '../progression.js';
import { DEN_ITEMS, DEN_SPOTS } from '../den.js';

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

function itemCard(id, item, owned, points) {
  const name = escapeHtml(item?.name ?? id);
  const price = asFiniteNonNeg(item?.price, 0);
  if (owned) {
    return `<div class="ds-card owned" data-den-item="${escapeHtml(id)}">
      <div class="ds-name">${name}</div><div class="ds-act"><span class="ds-tag">✓ Yours</span></div>
    </div>`;
  }
  if (points >= price) {
    return `<div class="ds-card" data-den-item="${escapeHtml(id)}">
      <div class="ds-name">${name}</div><div class="ds-act"><button type="button" class="ds-buy" data-den-buy="${escapeHtml(id)}">Buy — ${price} 🐾</button></div>
    </div>`;
  }
  return `<div class="ds-card locked" data-den-item="${escapeHtml(id)}">
      <div class="ds-name">${name}</div><div class="ds-act"><span class="ds-tag">${price} 🐾</span></div>
    </div>`;
}

function spotRow(spot, owned, placed, items) {
  const current = placed[spot.id] ?? '';
  const where = {};
  for (const [spotId, itemId] of Object.entries(placed)) where[itemId] = spotId;
  const options = owned.map((id) => {
    const elsewhere = where[id] && where[id] !== spot.id ? ` (now: ${spotLabel(where[id])})` : '';
    return `<option value="${escapeHtml(id)}"${id === current ? ' selected' : ''}>${escapeHtml(items[id]?.name ?? id)}${escapeHtml(elsewhere)}</option>`;
  }).join('');
  return `<label class="ds-spot">
        <span class="ds-spot-name">${escapeHtml(spotLabel(spot.id))}</span>
        <select data-den-spot="${escapeHtml(spot.id)}">
          <option value=""${current === '' ? ' selected' : ''}>— nothing —</option>${options}
        </select>
      </label>`;
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
  const arrange = `<h3>Arrange your den</h3>
      <div class="ds-spots">
      ${spotList.map((spot) => spotRow(spot, owned, placed, catalog)).join('')}
      </div>`;
  const shop = `<h3>Shop</h3>
      <div class="ds-cards">
      ${Object.entries(catalog).map(([id, item]) => itemCard(id, item, owned.includes(id), points)).join('')}
      </div>`;
  // Nothing to arrange yet: the shop comes first, with one line saying what
  // to do. Once something is owned, arranging it is what the den is for.
  const body = owned.length
    ? `${arrange}\n      ${shop}`
    : `<p class="ds-hint">Buy something you like, then pick a spot for it!</p>\n      ${shop}\n      ${arrange}`;
  return `<div class="ds-head">
      <h2>🛋️ Den shop</h2>
      <span class="ds-points">🐾 ${points}</span>
      <button type="button" class="ds-done" data-den-done>Done</button>
    </div>
    ${note}
    <div class="ds-body">
      ${body}
    </div>`;
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
