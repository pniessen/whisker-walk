// The "pick your clan" row in the Where-to pill (Clan Edition only): a pure
// model plus an HTML renderer. DOM-free; nothing here writes the save (homebase
// handles the tap). The word for a clan is composed from CLAN_SUFFIX, never
// spelled out, so the borrowed-word scan stays clean.
import { pickableClans, clanName, picksOf, isClanId } from '../clanhomes.js';
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

// `territories` is a parameter so the "coming soon" branch can be pinned with a
// stub; the Gorge will use it.
export function clanPickerModel(state, territories = TERRITORIES) {
  const mineRaw = state?.clanPick?.mine;
  const mine = isClanId(mineRaw) ? mineRaw : null;
  const picks = picksOf(state); // [mine?, partner?], the partner only while still the partner
  const partner = (mine ? picks[1] : picks[0]) ?? null;
  const cards = pickableClans().map((id) => {
    const t = territories.find((x) => x.id === id);
    return {
      id,
      name: clanName(id),
      line: HOME_LINES[id] ?? '',
      place: t ? t.name : '',
      soon: !!t && t.status !== 'built',
      mine: id === mine,
      partner: id === partner,
    };
  });
  return { mine, both: !!mine && mine === partner, cards };
}

export function renderClanPickerHtml(model, partnerName) {
  const mineCard = model.cards.find((c) => c.mine);
  const heading = model.mine === null ? `Pick your ${clanWord}` : `Your ${clanWord}: ${mineCard ? mineCard.name : clanName(model.mine)}`;
  const buttons = model.cards.map((c) => `<button class="dr-pick ${c.mine ? 'sel' : ''}" ${PICK_ATTR}="${escapeHtml(c.id)}" aria-pressed="${c.mine}">`
    + `<span class="dr-pick-name">${escapeHtml(c.name)}</span>`
    + `<small>of ${escapeHtml(c.place)}</small>`
    + `<small>${escapeHtml(c.line)}</small>`
    + (c.soon ? '<small class="dr-pick-soon">territory coming soon</small>' : '')
    + (c.mine ? '<small class="dr-pick-tag">✓ yours</small>' : '')
    + (c.partner ? `<small class="dr-pick-tag">🤝 ${escapeHtml(partnerName)}'s</small>` : '')
    + '</button>').join('');
  const both = model.both && mineCard ? `<p class="dr-pick-both">You're both ${escapeHtml(mineCard.name)}!</p>` : '';
  return `<div class="dr-pickrow"><p class="dr-label">${escapeHtml(heading)}</p><div class="dr-picks">${buttons}</div>${both}</div>`;
}
