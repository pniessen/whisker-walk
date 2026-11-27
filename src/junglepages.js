// The Jungle lodge's journal pages that are live (milestone J3: the six discoveries): ids, emoji and names, the same in both word sets (no series word is in any). Start-up code
// (journal.js imports it), so it holds nothing of the place's world; a page's hint is in the lazy src/world/junglefindwords.js and reads empty until the place's chunk has been
// loaded. The ids are N0's reserved ones (src/progression.js: jl1..jl9 and jw1..jw8), so no older build drops one; the other eleven stay hidden placeholders until their milestones.
// [journal id, emoji, short id, name]
export const JUNGLE_PAGES = Object.freeze([
  ['jl1', '🛖', 'lodge', 'The Stilt Lodge'], ['jl2', '🌊', 'river', 'The Slow River'], ['jl3', '🦥', 'sloth', 'The Sleepy Sloth'],
  ['jl4', '🦜', 'canopy', 'The Canopy Walk'], ['jl5', '🌈', 'rainbow', 'The Rainbow Spot'], ['jl6', '🌺', 'orchid', 'The Hidden Orchid'],
].map((p) => Object.freeze(p)));
export const JUNGLE_LIVE_PAGES = JUNGLE_PAGES;
export const JUNGLE_PAGE_IDS = Object.freeze(JUNGLE_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the place's lazy file (world/junglefindwords.js) when its chunk arrives.
export const JUNGLE_HINTS = {};
