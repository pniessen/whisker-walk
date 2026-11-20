// What a place costs and what it waits for, for this save.
//
// World map step 1 (docs/superpowers/specs/2026-11-19-world-map-design.md,
// decision 5) moved the Seaside behind the Docks: after 2 Docks explores, for
// 200. A save that could already buy the Seaside (2 Park explores done, not
// bought) would find it locked again, which takes away something she had. So
// such a save keeps the old offer whole, after the Park for 100: a kept offer.
// The save marks it in state.keptOffers once, on the first load by a build
// that knows about it; a new save never gets one. An old cached build drops
// the mark on its next save, and the next load works it out again from the
// walks, so the worst case is the old offer coming back. That is generous,
// never a loss, and kept that way on purpose.
//
// Pure: the catalog is a parameter, so this module imports nothing.

export const KEPT_OFFERS = Object.freeze({
  seaside: Object.freeze({ requires: Object.freeze({ area: 'park', walks: 2 }), price: 100 }),
});

const wholeNonNeg = (n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);

// The offer for area `id` on this save: { requires, price }, or null for an id
// the catalog does not have. Reads only state.keptOffers.
export function areaOffer(state, catalog, id) {
  const areas = catalog?.areas;
  if (typeof id !== 'string' || !areas || !Object.hasOwn(areas, id)) return null;
  const kept = Array.isArray(state?.keptOffers) && state.keptOffers.includes(id) && Object.hasOwn(KEPT_OFFERS, id);
  if (kept) {
    const k = KEPT_OFFERS[id];
    return { requires: { area: k.requires.area, walks: k.requires.walks }, price: k.price };
  }
  const item = areas[id];
  const r = item.requires;
  return {
    requires: r ? { area: r.area, walks: r.walks } : null,
    price: wholeNonNeg(item.price),
  };
}

// state.keptOffers as loaded. An array is cleaned: kept ids only, once each,
// none she owns. Anything else is a save from before the field (or from an old
// cached build that dropped it): it keeps each old offer whose old gate it
// meets and whose place it does not own.
export function keptOffersOnLoad(raw, { walks, owned }) {
  const has = (id) => Array.isArray(owned) && owned.includes(id);
  if (Array.isArray(raw)) {
    const out = [];
    for (const id of raw) {
      if (typeof id === 'string' && Object.hasOwn(KEPT_OFFERS, id) && !has(id) && !out.includes(id)) out.push(id);
    }
    return out;
  }
  return Object.keys(KEPT_OFFERS).filter((id) => {
    const { area, walks: need } = KEPT_OFFERS[id].requires;
    return !has(id) && wholeNonNeg(walks?.[area]) >= need;
  });
}
