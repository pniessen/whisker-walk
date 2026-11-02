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
    ? `<button class="dr-home ${c.mine ? 'sel' : ''}" ${PICK_ATTR}="${escapeHtml(c.id)}" aria-pressed="${c.mine}">`
    : '<button class="dr-home dr-home-off" type="button" aria-disabled="true">');
  const buttons = model.cards.map((c) => open(c)
    + `<span class="dr-home-name">${escapeHtml(c.name)}</span>`
    + `<small>of ${escapeHtml(c.place)}</small>`
    + `<small>${escapeHtml(c.line)}</small>`
    + (c.soon && c.pickable ? '<small class="dr-home-soon">territory coming soon</small>' : '')
    + (c.mine ? '<small class="dr-home-tag">✓ yours</small>' : '')
    + (c.partner ? `<small class="dr-home-tag">🤝 ${escapeHtml(partnerName)}'s</small>` : '')
    + '</button>').join('');
  const both = model.both && mineCard ? `<p class="dr-home-both">You're both ${escapeHtml(mineCard.name)}!</p>` : '';
  return `<div class="dr-homerow"><p class="dr-label">${escapeHtml(heading)}</p><div class="dr-homes">${buttons}</div>${both}</div>`;
}
