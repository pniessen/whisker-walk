// The Colony tab's pure HTML renderer. No DOM, no THREE: it takes plain data
// and returns a string, so it is unit-tested (test/colonypanel.test.js).
// homebase.js reaches for document at module scope and so cannot be imported
// by the suite — the same reason hometabs.js owns the Skills renderer.
//
// The binding rule from the playtests: ONE progress bar per cat. A head start
// from earlier greets is a differently shaded segment INSIDE that bar, never a
// second track. Who fed what is shown in words ("you fed 3 · Robin fed 1"),
// never as points: nothing in this tab is a score.
//
// Every interpolated value goes through escapeHtml. The partner's pet name and
// the colony's cats ultimately come from a cloud payload; colony.js sanitizes
// them, and this renderer escapes them again rather than trusting that.
import { tamingProgress, COLONY_MAX } from '../colony.js';
import { strayBreed } from '../straynames.js';

// Duplicated from hometabs.js rather than imported (a copy beats a shared
// helper module for six lines).
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const own = (obj, key) => !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);

// The header line for each sync mode. 'unpaired' and 'needs-name' still work
// locally, so they read like 'local' until Task 9's pairing area says more.
function modeLine(mode, partnerName) {
  switch (mode) {
    case 'paired': return `Shared with ${partnerName} 🐾`;
    case 'not-set-up': return "Colony sharing isn't switched on yet";
    case 'offline': return "Can't reach the colony right now — your cats are safe on this device";
    default: return 'Just you for now';
  }
}

function dressSelect(cat, owned, catalog) {
  const accessories = catalog && catalog.accessories;
  const ids = [];
  for (const id of Array.isArray(owned) ? owned : []) {
    if (typeof id === 'string' && own(accessories, id) && !ids.includes(id)) ids.push(id);
  }
  // A cat can be wearing something no longer in the list; keep it selectable
  // so the select never silently shows "nothing" for a dressed cat.
  if (typeof cat.wear === 'string' && own(accessories, cat.wear) && !ids.includes(cat.wear)) ids.push(cat.wear);
  const opts = ids.map((id) =>
    `<option value="${escapeHtml(id)}"${cat.wear === id ? ' selected' : ''}>${escapeHtml(accessories[id].name)}</option>`);
  return `<label class="colony-dress">Dress ${escapeHtml(cat.name)}
      <select data-colony-dress="${escapeHtml(cat.name)}" aria-label="Dress ${escapeHtml(cat.name)}">
        <option value=""${cat.wear ? '' : ' selected'}>nothing</option>${opts.join('')}
      </select></label>`;
}

// Who already knew this cat? The head start is the largest `head` on any feed
// for it, so name whoever's feeds carry that value: me, the partner, or both.
function knewLine(catName, p, { me, partner, partnerName, feeds }) {
  let mine = false;
  let theirs = false;
  for (const f of feeds) {
    if (f.cat !== catName || f.head !== p.headStart) continue;
    if (f.by === me) mine = true;
    else if (partner && f.by === partner.playerId) theirs = true;
  }
  if (mine && theirs) return `You both already knew ${catName} ♥`;
  if (theirs) return `${partnerName} already knew ${catName} ♥`;
  return `You already knew ${catName} ♥`;
}

function catCard(cat, p, ctx) {
  const { me, partner, partnerName, catalog, owned } = ctx;
  const name = escapeHtml(cat.name);
  const mine = p.byPlayer.find((b) => b.by === me)?.n ?? 0;
  const theirs = partner ? (p.byPlayer.find((b) => b.by === partner.playerId)?.n ?? 0) : 0;
  const fed = partner ? `you fed ${mine} · ${partnerName} fed ${theirs}` : `you fed ${mine}`;

  // Waiting on whoever hasn't fed it yet: usually the partner, but if only
  // the partner has fed it, it is waiting for me.
  const waitingFor = p.byPlayer.some((b) => b.by === me) ? partnerName : 'you';
  const area = own(catalog && catalog.areas, cat.area) ? catalog.areas[cat.area].name : cat.area;
  let where;
  if (p.tamed) where = 'lives in your den 🏠';
  else if (p.needsSecondFeeder) where = `shy — waiting for ${waitingFor} 🐾`;
  else where = `in ${area}`;

  const found = cat.finder === me ? 'found by you' : `found by ${partnerName}`;

  // Segments are widths of the one bar: the head start first, then the feeds.
  const need = Math.max(1, p.need);
  const headPct = Math.round((p.headStart / need) * 100);
  const fedPct = Math.round(((p.have - p.headStart) / need) * 100);
  const head = p.headStart > 0 ? `<span class="colony-head" style="width:${headPct}%"></span>` : '';

  const knew = p.headStart > 0 ? `<div class="colony-knew">${escapeHtml(knewLine(cat.name, p, ctx))}</div>` : '';
  const dress = cat.finder === me ? dressSelect(cat, owned, catalog) : '';

  return `<div class="card colony-card ${p.tamed ? 'selected' : ''}" data-cat="${name}">
    <div class="card-name">${name} <span class="colony-breed">${escapeHtml(typeof cat.name === 'string' ? strayBreed(cat.name) : '')}</span></div>
    <div class="colony-bar" role="progressbar" aria-label="${name}'s trust"
      aria-valuemin="0" aria-valuemax="${p.need}" aria-valuenow="${p.have}">${head}<span class="colony-fed" style="width:${fedPct}%"></span></div>
    <div class="colony-count">${p.have} of ${p.need} feeds${p.tamed ? ' · tamed ✅' : ''}</div>
    ${knew}
    <div class="colony-fedby">${escapeHtml(fed)}</div>
    <div class="colony-where">${escapeHtml(where)}</div>
    <div class="colony-found">${escapeHtml(found)}</div>
    ${dress}
  </div>`;
}

// renderColonyHtml({ colony, me, members, status, owned, catalog }) -> HTML
// string for the Colony panel body. Safe to call with anything; never throws.
export function renderColonyHtml({ colony, me, members = 1, status, owned, catalog } = {}) {
  const cats = Array.isArray(colony && colony.cats) ? colony.cats : [];
  const safeColony = { ...(colony || {}), cats, feeds: Array.isArray(colony && colony.feeds) ? colony.feeds : [] };
  const partner = colony && colony.partner && typeof colony.partner === 'object' ? colony.partner : null;
  // Kept RAW: every line that names the partner is escaped once, when it is
  // placed into the HTML, so nothing is ever escaped twice or not at all.
  const partnerName = partner && partner.petName ? String(partner.petName) : 'your partner';

  const ctx = { me, partner, partnerName, catalog, owned, feeds: safeColony.feeds };
  const rows = cats.map((cat) => ({ cat, p: tamingProgress(safeColony, cat.name, { members }) }));
  rows.sort((a, b) =>
    (b.p.tamed - a.p.tamed) || (b.p.have - a.p.have) || (a.cat.name < b.cat.name ? -1 : a.cat.name > b.cat.name ? 1 : 0));

  const mode = status && status.mode;
  const header = `<p class="colony-mode" data-mode="${escapeHtml(mode)}">${escapeHtml(modeLine(mode, partnerName))}</p>`;
  const list = rows.length
    ? `<div class="cards colony-cards">${rows.map((r) => catCard(r.cat, r.p, ctx)).join('')}</div>`
    : `<p class="colony-empty">No colony cats yet — touch noses with a stray, then feed it 🐟</p>`;
  const full = cats.length >= COLONY_MAX
    ? `<p class="colony-full">The colony is full — ${COLONY_MAX} cats call it home 🏠</p>` : '';

  return `${header}${list}${full}<div id="colony-pairing"></div>`;
}
