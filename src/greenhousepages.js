// The Greenhouse's eight journal pages (six finds, two jobs): ids, emoji and names, the same in both word sets (no series word
// is in any). Start-up code (a few bytes of ids and plain strings, the Moon's way: src/moonpages.js); the hints are in the lazy
// src/world/greenhousewords.js and read empty until the Greenhouse's chunk has been loaded. All six find ids and both job ids
// are reserved now (milestone G2), the Orchid, Cactus and Butterfly rooms' too, so no older build drops an id it does not know.
export const GREENHOUSE_PAGES = Object.freeze([
  ['ghpalm', '🌴', 'palm', 'Under the Palms'], ['ghkoi', '🐟', 'koi', 'Pond Watcher'], ['ghcatnip', '🌿', 'catnip', 'The Catnip Bed'],
  ['ghorchid', '🌸', 'orchid', 'The Orchid Bench'], ['ghcactus', '🌵', 'cactus', 'The Cactus Flower'], ['ghbutterfly', '🦋', 'butterfly', 'Butterfly on Your Nose'],
  ['ghjobseeds', '🌱', 'jobseeds', 'The Lost Seeds'], ['ghjobwater', '💧', 'jobwater', 'Thirsty Plants'],
].map((p) => Object.freeze(p)));
export const GREENHOUSE_JOURNAL_TYPES = Object.freeze(GREENHOUSE_PAGES.map((p) => p[0]));
export const GREENHOUSE_FIND_IDS = Object.freeze(['palm', 'koi', 'catnip', 'orchid', 'cactus', 'butterfly']);
export const GREENHOUSE_JOB_IDS = Object.freeze(['jobseeds', 'jobwater']);

// The hints by journal id: empty here, filled by the lazy file (world/greenhousewords.js) when the chunk arrives.
export const GREENHOUSE_HINTS = {};

export const GREENHOUSE_PAGE_WORDS = Object.freeze(Object.fromEntries(GREENHOUSE_PAGES.map(([id, , , name]) => [id, Object.freeze({
  name: () => name,
  hint: () => GREENHOUSE_HINTS[id] ?? '',
})])));
