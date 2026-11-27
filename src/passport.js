// The passport: a page of the Journal with one picture-book stamp for each place she has walked in (milestone I4).
// Everything on it is worked out from state.walks[id] >= 1 and nothing else: it keeps no counter, adds no save key and
// writes nothing. A place she has not walked in is simply not on the page (no empty slot, nothing "missing"); with no stamp
// at all one soft line says how to get the first. A lazy chunk: the Journal sheet loads it on first use.
//
// A stamp's picture is the place's map icon (ui/territorymap.js); its name (edition.js placeName) and its region's come from
// the word tables, so both word sets read right. The Journal hands the icons, the name lookup and the escaper in (`kit`), so
// this chunk imports nothing heavy and splits no start-up module apart. Hostile saves read as unvisited: only a finite count of 1 or more makes a stamp.
import { REGIONS, regionName } from './regions.js';
import { addPhrases, phrase } from './clanphrases.js';

export const PASSPORT_LINES = Object.freeze({
  'passport.title': 'Passport',
  'passport.empty': 'Every place you walk in gets a stamp here.',
});
addPhrases(PASSPORT_LINES);

// The place ids she has a stamp for, from the walks table alone.
export function stampedIds(walks) {
  const w = walks && typeof walks === 'object' ? walks : {};
  return REGIONS.flatMap((r) => r.members).filter((id) => Object.hasOwn(w, id) && Number.isFinite(w[id]) && w[id] >= 1);
}

// renderPassportHtml(state, kit) -> the Journal's passport section; kit = { icons, name(id), esc }. Reads state.walks only.
export function renderPassportHtml(state, { icons, name, esc: escapeHtml }) {
  const have = new Set(stampedIds(state?.walks));
  const groups = REGIONS.map((r) => {
    const stamps = r.members.filter((id) => have.has(id)).map((id) => `<div class="journal-card spotted passport-stamp">`
      + `<span class="journal-emoji" aria-hidden="true">${escapeHtml(icons[id === 'neighborhood' ? 'town' : id] ?? '🐾')}</span>`
      + `<span class="journal-name">${escapeHtml(name(id))}</span></div>`).join('');
    return stamps ? `<div class="passport-region"><h4>${escapeHtml(regionName(r.id))}</h4><div class="journal-grid">${stamps}</div></div>` : '';
  }).join('');
  return `<section class="passport-section"><h3>${escapeHtml(phrase('passport.title'))} 🧳</h3>${groups || `<p class="passport-empty">${escapeHtml(phrase('passport.empty'))}</p>`}</section>`;
}
