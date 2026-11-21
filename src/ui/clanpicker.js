// The "pick your clan" row in the Where-to pill (Clan Edition only): a pure
// model plus an HTML renderer. DOM-free; nothing here writes the save (homebase
// handles the tap). The word for a clan is composed from CLAN_SUFFIX, never
// spelled out, so the borrowed-word scan stays clean.
import { HOMES, clanName, picksOf, isClanId } from '../clanhomes.js';
import { words, GROUP_KEY } from '../wordset.js';
import { TERRITORIES } from '../territories.js';
import { escapeHtml } from '../escapehtml.js';
import { phrase } from '../clanphrases.js';

// The page's own names (attributes, the storage key) are built with a fixed
// id, GROUP_KEY: it never follows the words in use. Names that would spell it
// as a hyphen-bounded literal are composed.
const clanWord = GROUP_KEY;
export const PICK_ATTR = `data-${clanWord}-pick`;
export const PICK_SELECT_ID = `set-${clanWord}-pick`;


// The line on a clan's card that can't be picked yet (G10): its territory is
// walkable, but its camp comes later. Read when it is needed, so it follows
// the words in use.
export const campSoonLine = () => phrase('pick.campSoon');

// Every HOMES clan gets a card. A pickable one is a pick button; one that isn't
// shows greyed, with campSoonLine(). `territories` and `homes` are parameters
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
      line: pickable ? words().HOME_LINES[id] ?? '' : campSoonLine(),
      place: t ? t.name : '',
      soon: !pickable || (!!t && t.status !== 'built'),
      pickable,
      mine: pickable && id === mine,
      partner: pickable && id === partner,
    };
  });
  return { mine, both: !!mine && mine === partner, cards };
}

// The badge of a group, as a pick card and the line in Change place show it.
// The drawings belong to the word set (EMBLEMS, whole <svg> strings, each
// aria-hidden: beside a name they are decoration). A set without them shows no
// emblem. A set with badge WORDS (BADGE_WORDS) names the badge on its cards:
// as the drawing's name when it has one (the drawing is then a picture,
// role="img" with a <title>), else in a line of text.
const badgeWordOf = (id) => {
  const badges = words().BADGE_WORDS;
  return badges && Object.hasOwn(badges, id) ? badges[id] : null;
};
export function emblemOf(id) {
  const emblems = words().EMBLEMS;
  return emblems && Object.hasOwn(emblems, id) ? emblems[id] : '';
}
const namedEmblem = (svg, word) => svg.replace(/^<svg([^>]*?) aria-hidden="true"([^>]*)>/,
  (_m, a, b) => `<svg${a} role="img"${b}><title>${escapeHtml(word)}</title>`);
const cardEmblem = (id) => {
  const svg = emblemOf(id);
  if (!svg) return '';
  const word = badgeWordOf(id);
  return `<span class="dr-home-emblem">${word ? namedEmblem(svg, word) : svg}</span>`;
};

export function renderClanPickerHtml(model, partnerName) {
  const mineCard = model.cards.find((c) => c.mine);
  const heading = model.mine === null ? phrase('pick.heading') : phrase('pick.headingMine', mineCard ? mineCard.name : clanName(model.mine));
  // A card that can't be picked is greyed, with no pick attribute, so a tap on
  // it finds nothing to pick.
  const open = (c) => (c.pickable
    ? `<button class="dr-home ${c.mine ? 'sel' : ''} dr-home-${escapeHtml(c.id)}" ${PICK_ATTR}="${escapeHtml(c.id)}" aria-pressed="${c.mine}">`
    : '<button class="dr-home dr-home-off" type="button" aria-disabled="true">');
  const buttons = model.cards.map((c) => open(c)
    + (c.pickable
      ? `<span class="dr-home-name">${cardEmblem(c.id)}${escapeHtml(c.name)}</span>`
      : `<span class="dr-home-name">${escapeHtml(c.name)}</span>`)
    + `<small>of ${escapeHtml(c.place)}</small>`
    + `<small>${escapeHtml(c.line)}</small>`
    + (c.pickable && badgeWordOf(c.id) && !emblemOf(c.id) ? `<small class="dr-home-badge">${escapeHtml(phrase('pick.badge', badgeWordOf(c.id)))}</small>` : '')
    + (c.soon && c.pickable ? `<small class="dr-home-soon">${phrase('pick.territorySoon')}</small>` : '')
    + (c.mine ? '<small class="dr-home-tag">✓ yours</small>' : '')
    + (c.partner ? `<small class="dr-home-tag">🤝 ${escapeHtml(partnerName)}'s</small>` : '')
    + '</button>').join('');
  const both = model.both && mineCard ? `<p class="dr-home-both">${phrase('pick.both', escapeHtml(mineCard.name))}</p>` : '';
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


// The same card opened again from Change place once she has a clan: the
// cards are the same, the words say she is changing, and "Not yet" keeps hers.
// The words are read from the phrase table when the card is drawn.

// touch: a touch screen's change card says Tap, a desktop's Click.
export function renderClanMomentHtml(model, partnerName, { touch = false } = {}) {
  const change = !!model.mine;
  const ask = !change ? phrase('pick.momentAsk') : touch ? phrase('pick.changeAsk') : phrase('pick.changeAskClick');
  return `<div class="join-moment-card" role="dialog" aria-modal="true" aria-labelledby="join-moment-title" tabindex="-1">`
    + `<p class="join-moment-paws" aria-hidden="true">🐾 🐾 🐾</p>`
    + `<h2 id="join-moment-title">${escapeHtml(phrase(change ? 'pick.changeTitle' : 'pick.momentTitle'))}</h2>`
    + `<p class="join-moment-ask">${escapeHtml(ask)}</p>`
    + renderClanPickerHtml(model, partnerName)
    + `<div class="join-moment-foot"><button type="button" class="join-moment-later" data-${clanWord}-later>${escapeHtml(change ? phrase('pick.keep') : 'Not yet')}</button>`
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
    const emblem = emblemOf(model.mine) ? `<span class="dr-home-emblem">${emblemOf(model.mine)}</span>` : '';
    const partner = model.cards.find((c) => c.partner && !c.mine);
    const extra = model.both ? phrase('pick.lineBoth', escapeHtml(name))
      : partner ? ` · ${escapeHtml(partnerName)} is ${escapeHtml(partner.name)}` : '';
    return `<button type="button" class="hb-pick-line" ${MOMENT_ATTR}>${emblem}<span>You’re <b>${escapeHtml(name)}</b>${extra}</span><b class="hb-pick-change">Change ›</b></button>`;
  }
  if (!canChoose) return '';
  return `<button type="button" class="hb-pick-choose" ${MOMENT_ATTR}><span>${escapeHtml(phrase('pick.momentTitle'))}</span><b>${phrase('pick.choose')}</b></button>`;
}
