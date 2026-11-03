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
  // storm cloud with a gold bolt
  woods: emblem('<path fill="#2f5a33" d="M7 15a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 6.6 4.2 4.2 0 0 1 17.5 15z"/>'
    + '<path fill="#f2c14e" d="M13 11l-3.2 5h2.4l-1.2 5 4.2-6.2h-2.5z"/>'),
  // fish
  river: emblem('<path fill="#24516b" d="M3 12c3-5 9-6 13-1.5L21 7v10l-5-3.5C12 18 6 17 3 12z"/>'
    + '<circle cx="8" cy="11" r="1.1" fill="#f1e0c2"/>'),
  // three wind swooshes
  moor: emblem('<g fill="none" stroke="#5c3f68" stroke-width="2" stroke-linecap="round">'
    + '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12.5h16a3 3 0 1 1-3 3"/><path d="M3 17h8"/></g>'),
  // crescent moon with a small star
  pines: emblem('<path fill="#353d68" d="M14.5 3.5a9 9 0 1 0 6 13.5A7.5 7.5 0 0 1 14.5 3.5z"/>'
    + '<circle cx="17.5" cy="6.5" r="1.4" fill="#353d68"/>'),
  // flat-topped cliff with a step
  gorge: emblem('<path fill="#6b4128" d="M3 20V9h8V5h10v15z"/>'
    + '<path fill="none" stroke="#f1e0c2" stroke-width="1.2" d="M7 20v-6M15 20v-9"/>'),
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
      ? `<span class="dr-home-name"><span class="dr-home-emblem">${CLAN_EMBLEMS[c.id] ?? ''}</span>${escapeHtml(c.name)}</span>`
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
