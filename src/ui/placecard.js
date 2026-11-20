// The world map's pop-up card (Change place): a tap on a place opens it, with
// the place's picture, its name, one line and its one button. DOM-free: the
// model comes from the world map's own model, the HTML is a string the
// dressing room inserts.
//
// The button is the one thing she can do there: Go here (a place she owns,
// today's place, or a free place that is open) is the dressing room's usual
// place button; Open for N 🐾 is its usual buy button, so it goes through the
// "Get it?" card as before. A locked place, or one she cannot afford yet, has
// no button, only its line: the walks it waits for, or the paws it costs and
// how many more she needs.
// Go here is only ever for a place she can walk: a locked place (an odd old
// save whose today's place is still locked) or one not built yet gets its
// line and no button.
import { escapeHtml } from '../escapehtml.js';

// The card for the region with this areaId (the island leads to the Pines, so
// its card is the Pines'), or null when no place on the map has it.
export function placeCardFor(worldModel, areaId, points) {
  const r = worldModel?.regions?.find((x) => x.areaId === areaId);
  if (!r) return null;
  const walkable = r.status === 'built' && !r.locked;
  const open = !r.owned && !r.locked;
  let action = null;
  if (walkable && (r.owned || r.selected || (open && r.price === 0))) action = 'go';
  else if (r.canOpen) action = 'open';
  const label = action === 'go' ? 'Go here' : action === 'open' ? `Open for ${r.price} 🐾` : null;
  let line = r.line;
  if (action === 'open') line = `You have ${points} 🐾`;
  // one she cannot afford yet: the paws still to find, in main's words (the
  // map's own label stays short)
  else if (action === null && !r.locked && !r.owned && r.price > 0) {
    const have = Number.isFinite(Number(points)) ? Math.max(0, Math.floor(Number(points))) : 0;
    if (r.price > have) line = `${r.price} 🐾 · ${r.price - have} more 🐾 to go`;
  }
  return { id: r.areaId, name: r.name, line, locked: !!r.locked, action, label };
}

export function renderPlaceCardHtml(card, { picture } = {}) {
  const c = card;
  const id = escapeHtml(c.id);
  const button = c.action === 'go'
    ? `<button type="button" class="wm-card-go" data-dr-place="${id}">${escapeHtml(c.label)}</button>`
    : c.action === 'open'
      ? `<button type="button" class="wm-card-buy" data-dr-place-buy="${id}">${escapeHtml(c.label)}</button>`
      : '';
  return `<div class="wm-card" role="dialog" aria-labelledby="wm-card-name" data-wm-card="${id}">`
    + `<img class="wm-card-pic" src="${escapeHtml(picture ?? '')}" alt="" onerror="this.style.display='none'">`
    + `<h3 id="wm-card-name">${c.locked ? '🔒 ' : ''}${escapeHtml(c.name)}</h3>`
    + `<p class="wm-card-line">${escapeHtml(c.line)}</p>`
    + button
    + `<button type="button" class="wm-card-close" data-dr-map-close="${id}" aria-label="Close">✕</button>`
    + '</div>';
}
