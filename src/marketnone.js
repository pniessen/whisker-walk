// The Market's ids and its stand-in for every other walk (step 2). In the main
// graph, so the walk, the prompts and the net events can name a treat without
// loading the Market's chunk: no imports at all.
//
// A treat's item id is what the existing `carry-pick` event carries when a cat
// grabs it (M7): 'market-treat-<stall>', one per guarded stall and the café.
// treatStallOf reads one back, and knows only those five: anything else (a
// sock's id, the flower stall, '__proto__') is null, so an id off the wire
// can never reach past them.

export const TREAT_ITEM_PREFIX = 'market-treat-';

// The fewest seconds between two shoo (or laugh) lines on her screen
// (game/marketplay.js). Here, in the main graph, so the walk's handler needs
// nothing of the Market's chunk; marketrules.js's MARKET carries the same one.
export const SHOO_TOAST_GAP = 6;

// the stalls with a treat (marketplan.js TREAT_STALLS, and the café)
const TREAT_STALL_IDS = Object.freeze(['fish', 'baker', 'cheese', 'milk', 'toys', 'plants', 'bric', 'butcher', 'cafe']);

export const treatItemId = (stallId) => `${TREAT_ITEM_PREFIX}${stallId}`;

export function treatStallOf(itemId) {
  if (typeof itemId !== 'string' || !itemId.startsWith(TREAT_ITEM_PREFIX)) return null;
  const id = itemId.slice(TREAT_ITEM_PREFIX.length);
  return TREAT_STALL_IDS.includes(id) ? id : null;
}

// What every walk that is not the Market holds where the Market's life goes:
// no stalls, no people (no contact shadows to follow), no tally (null, so the
// summary shows no treats tile), no prompt, and nothing a pick from the wire
// can change. Its shape is a superset of what callers read of the live one.
export const NO_MARKET = Object.freeze({
  stalls: Object.freeze([]),
  keepers: Object.freeze({}),
  groups: Object.freeze([]),
  treats: null,
  actionFor: () => null,
  act: () => false,
  update() {},
  remotePick: () => false,
  restore() {},
  dispose() {},
});
