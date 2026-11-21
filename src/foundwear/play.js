// Found outfits: giving the walk's find (live.js reports the arrival; main.js
// calls handleFindArrival with it). Spec: "Never twice in one walk: one find
// per walk; once found, that walk has no more."
//
// WHAT IS GIVEN
//   * An outfit she does not own yet: hers for good (progression.js
//     recordFoundWear), never put on. Her own find opens the find card
//     (game/findcard.js), with Wear it and Later. A partner's arrival gives
//     each child their own outfit on their own device, with a toast instead
//     of the card (the find is one spot for the room; what it is comes from
//     each child's own wardrobe).
//   * Anything else (everything in the place already hers, or an outfit that
//     became hers mid-walk, say by a cloud load): the pouch, AWARDS.pouch 🐾
//     through the discovery log, so its sound, floater and toast are the
//     discovery event's (main.js 'discovery'; ui/hud.js says its whole line).
// Either way the walk log holds FIND_LOG_KEY from then on, which is what makes
// it once a walk and what a mid-walk resume puts back (restoreFind).
//
// Nothing here is random or reads the clock.
import { phrase } from '../clanphrases.js';
import { CATALOG } from '../progression.js';
import { escapeHtml } from '../escapehtml.js';
import { FIND_LOG_KEY } from './rules.js';
import { bus } from '../events.js';

// grantFind(find, arrival, { progression, log }) -> Grant | null.
//   find     live.js's find (or NO_FIND): its `item` and take()
//   arrival  { by: 'me' | 'partner', petName }
// Grant: { kind: 'wear', id, by, petName } | { kind: 'pouch', points, by, petName }.
// null when this walk has already given its find, or when there is nothing on
// the ground to give: NO_FIND, a find already taken, a find with no item.
export function grantFind(find, arrival, { progression, log }) {
  if (!find || find.taken || !find.item || log.count(FIND_LOG_KEY) > 0) return null;
  const by = arrival?.by === 'partner' ? 'partner' : 'me';
  const petName = by === 'partner' ? (arrival?.petName ?? undefined) : undefined;
  const item = find.item;
  if (item?.kind === 'wear' && typeof item.id === 'string' && progression.recordFoundWear(item.id)) {
    log.mark(FIND_LOG_KEY);
    find.take();
    return { kind: 'wear', id: item.id, by, petName };
  }
  const label = by === 'me' ? phrase('wear.pouch.found') : phrase('wear.pouch.partner', petName);
  const points = log.awardOnce('pouch', FIND_LOG_KEY, label);
  find.take();
  return { kind: 'pouch', points, by, petName };
}

// restoreFind(find, { log }): a walk picked up again (walkresume.js) whose
// log already holds the find has nothing left on the ground.
export function restoreFind(find, { log }) {
  if (find && log.count(FIND_LOG_KEY) > 0) find.take();
}

// findBusy(s) -> her own pick-up waits (live.js frame.busy): before the walk
// has begun, in a fight, with the crossing card or a clan fight's card up, or
// with the find card itself up. A partner's pick-up never waits.
export function findBusy(s) {
  return !s.started || !!s.fight || !!s.crossing || !!s.clanFight?.uiShowing || !!s.findCard;
}

// handleFindArrival(s, arrival, { progression, log, hud, audio, card }) ->
// the Grant, or null when there was nothing to give. The find is s.find.
export function handleFindArrival(s, arrival, { progression, log, hud, audio, card }) {
  const grant = grantFind(s.find, arrival, { progression, log });
  if (!grant) return null;
  s.fx?.burst(s.cat.position, 0xf2c14e, 14);
  // She found it herself: the hint that says "go and see" is never needed.
  if (grant.by === 'me') {
    progression.knowHint('find');
    // Take the line down now: the find card pauses the walk in this frame, so
    // the facts would not, and find-kept would be refused behind it.
    bus.emit('tip:did', { id: 'find' });
  }
  if (grant.kind === 'wear') {
    audio.fanfare?.();
    if (grant.by === 'me') card.show(s, grant.id);
    else hud.toast(phrase('wear.partner.found', grant.petName, CATALOG.accessories[grant.id].name));
  }
  return grant;
}

// findCardHtml({ title, name, portrait, emoji, canWear, catName }) -> the
// find card (game/findcard.js shows it in the pause overlay). `portrait` is
// her cat wearing it (a data URL), or null for the outfit's emoji. Without
// `canWear` (Hagrid and a slot he does not wear) there is no Wear it, and a
// line says so. Every value is escaped.
export function findCardHtml({ title, name, portrait = null, emoji = '', canWear = false, catName = '' }) {
  const pic = portrait
    ? `<img class="find-portrait" src="${escapeHtml(portrait)}" alt="">`
    : `<span class="find-emoji">${escapeHtml(emoji)}</span>`;
  const wear = canWear
    ? `<button id="btn-find-wear" class="btn primary">${escapeHtml(phrase('wear.card.wear'))}</button>`
    : `<p class="find-hen">${escapeHtml(phrase('wear.card.henNo', catName))}</p>`;
  return `<div class="pause-card find-card"><div class="screen-panel">
    <h1>${escapeHtml(title)}</h1>
    ${pic}
    <p class="find-name">${escapeHtml(name)}</p>
    <p class="find-kept">${escapeHtml(phrase('wear.card.kept'))}</p>
    <div class="screen-actions">
      ${wear}
      <button id="btn-find-later" class="btn secondary">${escapeHtml(phrase('wear.card.later'))}</button>
    </div></div></div>`;
}
