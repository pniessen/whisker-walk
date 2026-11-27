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
// Six more pages, the Moon's friendly robots and light (world/moonrobots.js): spotted like a farm animal (looking at one), each page counting the walks. No animals are on the Moon.
export const MOON_LIFE_PAGES = Object.freeze([['mldrone', '🛸', 'drone', 'Survey Drone'], ['mlcleaner', '🧹', 'cleaner', 'Dusty Cleaner Bot'], ['mlconvoy', '🚙', 'convoy', 'Mini-Rover Convoy'],
  ['mlmoth', '✨', 'moth', 'Lunar Moth of Light'], ['mlpixel', '👾', 'pixel', 'Pixel Visitor'], ['mlmoonling', '👽', 'moonling', 'Moonling']].map((p) => Object.freeze(p)));
// Five more pages for the Old Relay Station (wing E: the station, the beeping signal, the relay parts, the sled and its lap; X0 reserves the ids, the milestones that earn them come later).
export const MOON_WING_PAGES = Object.freeze([['mnstation', '🛰️', 'station', 'The Old Relay Station'], ['mnsignal', '📶', 'signal', 'The Far Signal'], ['mnrelay', '🔧', 'relay', 'Relay Parts'],
  ['mnsled', '🛷', 'sled', 'The Moon Sled'], ['mnlap', '🏁', 'lap', 'Sled Lap']].map((p) => Object.freeze(p)));
// Which wings are open: a page stays out of the journal until its wing is in the game. A switch to true in the wing's own milestone.
export const WING_LIVE = { mnstation: true, mnsignal: false, mnrelay: false, mnsled: false, mnlap: false };
export const wingPageShown = (id) => WING_LIVE[id] !== false;
export const MOON_JOURNAL_TYPES = Object.freeze(MOON_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the Moon's lazy file (world/moonwords.js) when its chunk arrives.
export const MOON_HINTS = {};

// The journal's pages, by journal id.
export const MOON_PAGE_WORDS = Object.freeze(Object.fromEntries([...MOON_PAGES, ...MOON_LIFE_PAGES, ...MOON_WING_PAGES].map(([id, , , name]) => [id, Object.freeze({
  name: () => name,
  hint: () => MOON_HINTS[id] ?? '',
})])));
