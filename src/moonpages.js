// The Moon's twelve journal pages (six discoveries, six activity pages): ids, emoji and names, the same in both word sets
// (no series word is in any). Start-up code (journal.js imports it), so it holds nothing of the place's world; a page's
// hint is in the lazy src/world/moonwords.js and reads empty until the Moon's chunk has been loaded (no card is drawn
// before ?moon=1 until the gate hand-off).
export const MOON_PAGES = Object.freeze([
  ['mnflag', '🚩', 'flag', 'The First Flag'], ['mnecho', '🌑', 'echo', 'Echo Crater'], ['mndust', '🐾', 'dust', 'Quiet Dust'],
  ['mncheese', '🧀', 'cheese', 'The Moon Cheese'], ['mndish', '📡', 'dish', 'The Old Dish'], ['mngarden', '🪴', 'garden', 'The Star Garden'],
  ['mnstory', '🌍', 'story', 'Hello, Earth!'], ['mnrover', '🚙', 'rover', 'Dot the Rover'], ['mnlaunch', '🚀', 'launch', 'Rocket Launch'],
  ['mnscope', '🔭', 'scope', 'Star Pictures'], ['mnjump', '🦘', 'jump', 'Long Jump'], ['mnjob', '💌', 'job', 'Pip’s Postcards'],
].map((p) => Object.freeze(p)));
export const MOON_JOURNAL_TYPES = Object.freeze(MOON_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the Moon's lazy file (world/moonwords.js) when its chunk arrives.
export const MOON_HINTS = {};

// The journal's pages, by journal id.
export const MOON_PAGE_WORDS = Object.freeze(Object.fromEntries(MOON_PAGES.map(([id, , , name]) => [id, Object.freeze({
  name: () => name,
  hint: () => MOON_HINTS[id] ?? '',
})])));
