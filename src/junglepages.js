// The Jungle lodge's journal pages that are live (milestone J3: the six discoveries): ids, emoji and names, the same in both word sets (no series word is in any). Start-up code
// (journal.js imports it), so it holds nothing of the place's world; a page's hint is in the lazy src/world/junglefindwords.js and reads empty until the place's chunk has been
// loaded. The ids are N0's reserved ones (src/progression.js: jl1..jl9 and jw1..jw8), so no older build drops one; the other eleven stay hidden placeholders until their milestones.
// [journal id, emoji, short id, name]
export const JUNGLE_PAGES = Object.freeze([
  ['jl1', '🛖', 'lodge', 'The Stilt Lodge'], ['jl2', '🌊', 'river', 'The Slow River'], ['jl3', '🦥', 'sloth', 'The Sleepy Sloth'],
  ['jl4', '🦜', 'canopy', 'The Canopy Walk'], ['jl5', '🌈', 'rainbow', 'The Rainbow Spot'], ['jl6', '🌺', 'orchid', 'The Hidden Orchid'],
].map((p) => Object.freeze(p)));
// Milestone J4: three of the life pages (jw1 the macaws, jw2 the rain frogs, jw5 the toucan), counted like a farm animal (world/junglecritters.js spots them; the hints are in the lazy
// src/world/junglecritterwords.js). The capybara family (jw3) and the butterflies (jw4) take their ids later; the other five jw ids stay hidden placeholders until their milestones.
export const JUNGLE_LIFE_PAGES = Object.freeze([['jw1', '🦜', 'macaw', 'The Bright Macaws'], ['jw2', '🐸', 'frog', 'The Rain Frogs'], ['jw5', '🐦', 'toucan', 'The Big-Beaked Toucan']].map((p) => Object.freeze(p)));
export const JUNGLE_LIVE_PAGES = Object.freeze([...JUNGLE_PAGES, ...JUNGLE_LIFE_PAGES]);
export const JUNGLE_PAGE_IDS = Object.freeze(JUNGLE_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the place's lazy file (world/junglefindwords.js) when its chunk arrives.
export const JUNGLE_HINTS = {};
