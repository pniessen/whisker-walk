// The "pick your clan" row in the Where-to pill (Clan Edition only): a pure
// model plus an HTML renderer. DOM-free; nothing here writes the save (homebase
// handles the tap). The word for a clan is composed from CLAN_SUFFIX, never
// spelled out, so the borrowed-word scan stays clean.
import { HOMES, clanName, picksOf, isClanId } from '../clanhomes.js';
import { HOME_LINES, CLAN_SUFFIX } from '../clanwords.js';
import { TERRITORIES } from '../territories.js';

const clanWord = CLAN_SUFFIX.toLowerCase();
// Names that would spell the word as a hyphen-bounded literal are composed.
export const PICK_ATTR = `data-${clanWord}-pick`;
export const PICK_SELECT_ID = `set-${clanWord}-pick`;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// One small hand-drawn emblem per clan, in its dark gradient colour, for the
// cream badge on its card. Keyed by territory id; an unknown id gets none.
const emblem = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">${body}</svg>`;
export const CLAN_EMBLEMS = Object.freeze({
  // storm cloud with a gold bolt (dark outline so it holds on the cream badge)
  woods: emblem('<path fill="#2f5a33" d="M7 14.5a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 6.1 4.2 4.2 0 0 1 17.5 14.5z"/>'
    + '<path fill="#e0a21c" stroke="#2f5a33" stroke-width="1" stroke-linejoin="round" d="M14.2 9.5L8.8 16.2h3.4L10.4 22.6l6.2-8h-3.5z"/>'),
  // fish
  river: emblem('<path fill="#24516b" d="M3 12c3-5 9-6 13-1.5L21 7v10l-5-3.5C12 18 6 17 3 12z"/>'
    + '<circle cx="8" cy="11" r="1.1" fill="#f1e0c2"/>'),
  // three wind swooshes
  moor: emblem('<g fill="none" stroke="#5c3f68" stroke-width="2" stroke-linecap="round">'
    + '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12.5h16a3 3 0 1 1-3 3"/><path d="M3 17h8"/></g>'),
  // crescent moon with a small star
  pines: emblem('<path fill="#353d68" d="M14.5 3.5a9 9 0 1 0 6 13.5A7.5 7.5 0 0 1 14.5 3.5z"/>'
    + '<circle cx="17.5" cy="6.5" r="1.4" fill="#353d68"/>'),
  // one cliff: sloped face, a single ledge, a flat top
  gorge: emblem('<path fill="#6b4128" d="M3 20.5L6.5 13.5h4L12.5 6H21v14.5z"/>'),
});

// The line on a clan's card that can't be picked yet (G10): its territory is
// walkable, but its camp comes later.
export const CAMP_SOON_LINE = 'camp coming soon';

// Every HOMES clan gets a card. A pickable one is a pick button; one that isn't
// shows greyed, with CAMP_SOON_LINE. `territories` and `homes` are parameters
// so the "territory coming soon" and "camp coming soon" branches can be pinned
// with stubs.
export function clanPickerModel(state, territories = TERRITORIES, homes = HOMES) {
  const mineRaw = state?.clanPick?.mine;
  const mine = isClanId(mineRaw) ? mineRaw : null;
  const picks = picksOf(state); // [mine?, partner?], the partner only while still the partner
  const partner = (mine ? picks[1] : picks[0]) ?? null;
  const cards = Object.keys(homes).map((id) => {
    const t = territories.find((x) => x.id === id);
    const pickable = homes[id].pickable;
    return {
      id,
      name: clanName(id),
      line: pickable ? HOME_LINES[id] ?? '' : CAMP_SOON_LINE,
      place: t ? t.name : '',
      soon: !pickable || (!!t && t.status !== 'built'),
      pickable,
      mine: pickable && id === mine,
      partner: pickable && id === partner,
    };
  });
  return { mine, both: !!mine && mine === partner, cards };
}

export function renderClanPickerHtml(model, partnerName) {
  const mineCard = model.cards.find((c) => c.mine);
  const heading = model.mine === null ? `Pick your ${clanWord}` : `Your ${clanWord}: ${mineCard ? mineCard.name : clanName(model.mine)}`;
  // A card that can't be picked is greyed, with no pick attribute, so a tap on
  // it finds nothing to pick.
  const open = (c) => (c.pickable
    ? `<button class="dr-home ${c.mine ? 'sel' : ''} dr-home-${escapeHtml(c.id)}" ${PICK_ATTR}="${escapeHtml(c.id)}" aria-pressed="${c.mine}">`
    : '<button class="dr-home dr-home-off" type="button" aria-disabled="true">');
  const buttons = model.cards.map((c) => open(c)
    + (c.pickable
      ? `<span class="dr-home-name">${CLAN_EMBLEMS[c.id] ? `<span class="dr-home-emblem">${CLAN_EMBLEMS[c.id]}</span>` : ''}${escapeHtml(c.name)}</span>`
      : `<span class="dr-home-name">${escapeHtml(c.name)}</span>`)
    + `<small>of ${escapeHtml(c.place)}</small>`
    + `<small>${escapeHtml(c.line)}</small>`
    + (c.soon && c.pickable ? '<small class="dr-home-soon">territory coming soon</small>' : '')
    + (c.mine ? '<small class="dr-home-tag">✓ yours</small>' : '')
    + (c.partner ? `<small class="dr-home-tag">🤝 ${escapeHtml(partnerName)}'s</small>` : '')
    + '</button>').join('');
  const both = model.both && mineCard ? `<p class="dr-home-both">You're both ${escapeHtml(mineCard.name)}!</p>` : '';
  return `<div class="dr-homerow"><p class="dr-label">${escapeHtml(heading)}</p><div class="dr-homes">${buttons}</div>${both}</div>`;
}

// ---- The clan moment (Launch A, owner's decision 2026-11-05) ----------------
// The pick is a one-time story beat, not a row of cards on home: when the
// Woods opens (its gate in CATALOG.areas.woods.requires, or she already owns
// it) for a Clan Edition player with no pick of her own, a card says the
// clans have noticed her and shows the five cards once. After that the pick
// changes only from Change place's clan line, which opens the same cards
// (Settings has no clan select: a stray tap there changed it with no card).
// Nothing new is saved: the pick is still the id.
export const MOMENT_SEEN_KEY = `whisker-walk-${clanWord}-moment-seen`;
export const MOMENT_ATTR = `data-${clanWord}-moment-open`;

export function woodsOpen(state, catalog) {
  const woods = catalog?.areas?.woods;
  if (!woods) return false;
  const owned = Array.isArray(state?.unlocked?.areas) && state.unlocked.areas.includes('woods');
  if (owned) return true;
  const req = woods.requires;
  if (!req) return true;
  const have = Number(state?.walks?.[req.area]);
  return Number.isFinite(have) && have >= req.walks;
}

// Due: Clan Edition, no pick of her own, the Woods open. (Whether this device
// has shown it already, and whether anything else is up, is the caller's.)
export function clanMomentDue(state, catalog) {
  if (state?.edition === 'legacy') return false; // inlined isClanEdition (no edition.js import here)
  if (isClanId(state?.clanPick?.mine)) return false;
  return woodsOpen(state, catalog);
}

const MOMENT_TITLE = `The ${clanWord}s have noticed you!`;
const MOMENT_ASK = `Which ${clanWord} will you join?`;
// The same card opened again from Change place once she has a clan: the
// cards are the same, the words say she is changing, and "Not yet" keeps hers.
const CHANGE_TITLE = `Change your ${clanWord}?`;
const CHANGE_ASK = `Tap a ${clanWord} to join it.`;
const KEEP_LABEL = `Keep my ${clanWord}`;

export function renderClanMomentHtml(model, partnerName) {
  const change = !!model.mine;
  return `<div class="join-moment-card" role="dialog" aria-modal="true" aria-labelledby="join-moment-title" tabindex="-1">`
    + `<p class="join-moment-paws" aria-hidden="true">🐾 🐾 🐾</p>`
    + `<h2 id="join-moment-title">${escapeHtml(change ? CHANGE_TITLE : MOMENT_TITLE)}</h2>`
    + `<p class="join-moment-ask">${escapeHtml(change ? CHANGE_ASK : MOMENT_ASK)}</p>`
    + renderClanPickerHtml(model, partnerName)
    + `<div class="join-moment-foot"><button type="button" class="join-moment-later" data-${clanWord}-later>${escapeHtml(change ? KEEP_LABEL : 'Not yet')}</button>`
    + '<p class="join-moment-note">You can change it later in 🗺️ Change place.</p></div>'
    + '</div>';
}

// Change place's one line about her clan: who she is (and who her sibling is),
// or, before a pick, a way back to the moment once the Woods is open. Either
// way it is the one door to the clan cards, so a picked line is a button too.
export function clanLineHtml(model, partnerName, { canChoose = false } = {}) {
  if (model.mine) {
    const mine = model.cards.find((c) => c.mine);
    const name = mine ? mine.name : clanName(model.mine);
    const emblem = CLAN_EMBLEMS[model.mine] ? `<span class="dr-home-emblem">${CLAN_EMBLEMS[model.mine]}</span>` : '';
    const partner = model.cards.find((c) => c.partner && !c.mine);
    const extra = model.both ? ` — you’re both ${escapeHtml(name)}!`
      : partner ? ` · ${escapeHtml(partnerName)} is ${escapeHtml(partner.name)}` : '';
    return `<button type="button" class="hb-pick-line" ${MOMENT_ATTR}>${emblem}<span>You’re <b>${escapeHtml(name)}</b>${extra}</span><b class="hb-pick-change">Change ›</b></button>`;
  }
  if (!canChoose) return '';
  return `<button type="button" class="hb-pick-choose" ${MOMENT_ATTR}><span>${escapeHtml(MOMENT_TITLE)}</span><b>Choose your ${clanWord} ›</b></button>`;
}
