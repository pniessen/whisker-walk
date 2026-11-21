// Found outfits in the Journal: "Things to wear", one group per place, in
// CATALOG.areas' order. A found one is a card with its emoji and its name; one
// not found yet is its emoji as a dark shape and where it is found. No count
// ("1 of 4"): it is not a list to tick off.
//
// Legacy Edition: a place her edition hides shows only what she found there,
// and is left out when she found nothing there. What she owns always shows.
//
// It reads catalog.accessories[id].find, so a stand-in catalog drives the
// tests. Nothing here writes state.
import { placeName, areaInEdition, accessoryName } from '../edition.js';
import { lower } from '../bordercross.js';
import { escapeHtml } from '../escapehtml.js';
import { phrase } from '../clanphrases.js';
import { spotsIn } from './spots/index.js';

function ownedAccessories(state) {
  const list = state?.unlocked?.accessories;
  return Array.isArray(list) ? list : [];
}

// renderThingsToWearHtml(state, catalog) -> the Journal's section, or '' when
// no found outfit is listed.
export function renderThingsToWearHtml(state, catalog) {
  const edition = state?.edition;
  const owned = ownedAccessories(state);
  const areas = catalog?.areas ?? {};
  const accessories = Object.entries(catalog?.accessories ?? {}).filter(([, a]) => a && typeof a.find === 'string');
  const groups = Object.keys(areas).map((areaId) => {
    const shown = areaInEdition(areas[areaId], edition);
    const cards = accessories.filter(([, a]) => a.find === areaId).map(([id, a]) => {
      const emoji = escapeHtml(a.emoji ?? '');
      if (owned.includes(id)) {
        return `<div class="journal-card spotted"><span class="journal-emoji">${emoji}</span>`
          + `<span class="journal-name">${escapeHtml(accessoryName(a, edition))}</span></div>`;
      }
      if (!shown) return '';
      // Nothing is hidden in a place with no find spots: no silhouette to hunt for.
      if (spotsIn(areaId).length === 0) return '';
      const where = phrase('wear.foundIn', lower(placeName(areaId, edition, catalog)));
      return `<div class="journal-card unspotted" role="group" aria-label="${escapeHtml(phrase('wear.notYet'))}">`
        + `<span class="journal-emoji silhouette" aria-hidden="true">${emoji}</span>`
        + `<span class="journal-hint">${escapeHtml(where)}</span></div>`;
    }).join('');
    return cards ? `<div class="wear-area"><h4>${escapeHtml(placeName(areaId, edition, catalog))}</h4><div class="journal-grid">${cards}</div></div>` : '';
  }).join('');
  return groups ? `<section class="wear-section"><h3>${escapeHtml(phrase('wear.journal.title'))} 👒</h3>${groups}</section>` : '';
}
