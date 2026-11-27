// Snowville's journal pages that are live (milestone V3: the six discoveries): ids, emoji and names, the same in both word sets (no series word is in any). Start-up code
// (journal.js imports it), so it holds nothing of the place's world; a page's hint is in the lazy src/world/snowvillefindwords.js and reads empty until the place's chunk has
// been loaded. The ids are N0's reserved ones (src/progression.js: sv1..sv9 and sw1..sw8), so no older build drops one; the other eleven stay hidden placeholders until their
// milestones. [journal id, emoji, short id, name]
export const SNOWVILLE_PAGES = Object.freeze([
  ['sv1', '🏮', 'lantern', 'The Hill Lantern'], ['sv2', '⛸️', 'pond', 'The Skating Pond'], ['sv3', '🐇', 'hare', 'The Shy Hare'],
  ['sv4', '🌲', 'fir', 'The Great Fir'], ['sv5', '⛄', 'snowman', 'The Snowman'], ['sv6', '🔥', 'hearth', 'The Warm Hearth'],
].map((p) => Object.freeze(p)));
export const SNOWVILLE_PAGE_IDS = Object.freeze(SNOWVILLE_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the place's lazy file (world/snowvillefindwords.js) when its chunk arrives.
export const SNOWVILLE_HINTS = {};
