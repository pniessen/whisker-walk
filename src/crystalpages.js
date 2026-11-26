// The Crystal Cave's twelve journal pages (six discoveries, six activity pages): ids, emoji and names, the same in both word sets
// (no series word is in any). Start-up code (journal.js imports it), so it holds nothing of the place's world; a page's hint is in the
// lazy src/world/crystalwords.js and reads empty until the cave's chunk has been loaded. All twelve ids are reserved in milestone C0 so no
// older build drops one.
export const CRYSTAL_PAGES = Object.freeze([
  ['ccrose', '🌹', 'rose', 'The Rose Crystal'], ['ccecho', '🔔', 'echo', 'The Echo Wall'], ['ccpool', '💧', 'pool', 'The Glow Pool'],
  ['ccgold', '🌟', 'gold', 'The Gold Vein'], ['ccgarden', '💎', 'garden', 'The Crystal Garden'], ['ccheart', '💖', 'heart', 'The Heart Crystal'],
  ['ccstonerose', '🩷', 'stonerose', 'The Rose Spark'], ['ccstonesky', '🩵', 'stonesky', 'The Sky Spark'], ['ccstonegold', '💛', 'stonegold', 'The Gold Spark'],
  ['ccshow', '🎆', 'show', 'The Light Show'], ['ccerrand', '🐛', 'errand', 'Lumi’s Glow Errand'], ['ccrubbings', '🖼️', 'rubbings', 'Crystal Rubbings'],
].map((p) => Object.freeze(p)));
export const CRYSTAL_JOURNAL_TYPES = Object.freeze(CRYSTAL_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the cave's lazy file (world/crystalwords.js) when its chunk arrives.
export const CRYSTAL_HINTS = {};

// The journal's pages, by journal id.
export const CRYSTAL_PAGE_WORDS = Object.freeze(Object.fromEntries(CRYSTAL_PAGES.map(([id, , , name]) => [id, Object.freeze({
  name: () => name,
  hint: () => CRYSTAL_HINTS[id] ?? '',
})])));
