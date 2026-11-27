// Snowville's journal pages that are live (milestone V3: the six discoveries): ids, emoji and names, the same in both word sets (no series word is in any). Start-up code
// (journal.js imports it), so it holds nothing of the place's world; a page's hint is in the lazy src/world/snowvillefindwords.js and reads empty until the place's chunk has
// been loaded. The ids are N0's reserved ones (src/progression.js: sv1..sv9 and sw1..sw8), so no older build drops one; the other eleven stay hidden placeholders until their
// milestones. [journal id, emoji, short id, name]
export const SNOWVILLE_PAGES = Object.freeze([
  ['sv1', '🏮', 'lantern', 'The Hill Lantern'], ['sv2', '⛸️', 'pond', 'The Skating Pond'], ['sv3', '🐇', 'hare', 'The Shy Hare'],
  ['sv4', '🌲', 'fir', 'The Great Fir'], ['sv5', '⛄', 'snowman', 'The Snowman'], ['sv6', '🔥', 'hearth', 'The Warm Hearth'],
].map((p) => Object.freeze(p)));
// Milestone V4: three of the life pages (sw1..sw3: the otters, the robin, the little fox), counted like a farm animal (world/snowvillecritters.js spots them; the hints are in the lazy
// src/world/snowvillecritterwords.js). The other five sw ids stay hidden placeholders until their milestones.
export const SNOWVILLE_LIFE_PAGES = Object.freeze([['sw1', '🦦', 'otter', 'The Skating Otters'], ['sw2', '🐦', 'robin', 'The Lamp Robin'], ['sw3', '🦊', 'fox', 'The Sleepy Little Fox']].map((p) => Object.freeze(p)));
// Milestone V5: the two story pages (sv7: all three candles lit; sv8: Lantern Night seen; the hints are in the lazy src/world/snowvillewingwords.js). sv9 (the sled) stays a placeholder.
export const SNOWVILLE_STORY_PAGES = Object.freeze([['sv7', '🕯️', 'candles', 'The Three Candles'], ['sv8', '🎇', 'night', 'Lantern Night']].map((p) => Object.freeze(p)));
// Milestone V7: two activity pages (sw4: Tilly's errand done; sw5: a new snow-globe postcard; hints in the lazy src/world/snowvillejobwords.js). sv9 (the sled) and sw6..sw8 stay placeholders.
export const SNOWVILLE_JOB_PAGES = Object.freeze([['sw4', '🌰', 'errand', 'Tilly’s Errand'], ['sw5', '🔮', 'postcards', 'Snow-Globe Postcards']].map((p) => Object.freeze(p)));
export const SNOWVILLE_LIVE_PAGES = Object.freeze([...SNOWVILLE_PAGES, ...SNOWVILLE_LIFE_PAGES, ...SNOWVILLE_STORY_PAGES, ...SNOWVILLE_JOB_PAGES]);
export const SNOWVILLE_PAGE_IDS = Object.freeze(SNOWVILLE_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the place's lazy file (world/snowvillefindwords.js) when its chunk arrives.
export const SNOWVILLE_HINTS = {};
