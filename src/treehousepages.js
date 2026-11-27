// The Treehouse village's journal pages that are live (milestone T3: the six discoveries): ids, emoji and names, the same in both word sets (no series word is in any). Start-up code
// (journal.js imports it), so it holds nothing of the place's world; a page's hint is in the lazy src/world/treehousefindwords.js and reads empty until the place's chunk has been
// loaded. The ids are N0's reserved ones (src/progression.js: th1..th9 and tl1..tl8), so no older build drops one; the other eleven stay hidden placeholders until their milestones.
// [journal id, emoji, name] (the short ids the finds go by are in the lazy src/world/treehousefindsplan.js)
export const TREEHOUSE_PAGES = Object.freeze([
  ['th1', '🥐', 'The Cosy Bakery'], ['th2', '📚', 'The Little Bookshop'], ['th3', '🔔', 'The Bell Tower'],
  ['th4', '🌉', 'The Rope Bridge'], ['th5', '🔭', 'The Lookout'], ['th6', '🌰', 'The Giant Acorn'],
]);
// Milestone T4: three of the life pages (tl1..tl3: the rail songbirds, the sleepy owl, the firefly dance), counted like a farm animal (world/treehousecritters.js spots them; the hints
// are in the lazy src/world/treehousecritterwords.js). The squirrel crew and the bat take the next ids later; the other five tl ids stay hidden placeholders until their milestones.
export const TREEHOUSE_LIFE_PAGES = Object.freeze([['tl1', '🐦', 'The Rail Songbirds'], ['tl2', '🦉', 'The Sleepy Owl'], ['tl3', '✨', 'The Firefly Dance']].map((p) => Object.freeze(p)));
export const TREEHOUSE_LIVE_PAGES = Object.freeze([...TREEHOUSE_PAGES, ...TREEHOUSE_LIFE_PAGES]);
export const TREEHOUSE_PAGE_IDS = Object.freeze(TREEHOUSE_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the place's lazy file (world/treehousefindwords.js) when its chunk arrives.
export const TREEHOUSE_HINTS = {};
