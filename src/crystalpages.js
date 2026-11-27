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
// Seven more pages, the cave's friendly life (world/cavelife.js): spotted like a farm animal (6 m, looking at one), each page counting the walks. Short names: start-up constants.
export const CAVE_LIFE_PAGES = Object.freeze([['clfish', '🐟', 'fish', 'Cave Fish'], ['clbat', '🦇', 'bat', 'Cave Bat'], ['clfirefly', '✨', 'firefly', 'Fireflies'], ['clmoth', '🦋', 'moth', 'Cave Moth'],
  ['clsalamander', '🦎', 'salamander', 'Salamander'], ['clbeetle', '🪲', 'beetle', 'Gem Beetle'], ['clcrab', '🦀', 'crab', 'Cave Crab']].map((p) => Object.freeze(p)));
// Six more pages for wing C (the river and boat, the mushroom grotto, the falls, the forge, the cart and the singing chamber; X0 reserves the ids, the wings that earn them come later).
export const CRYSTAL_WING_PAGES = Object.freeze([['ccboat', '🚣', 'boat', 'The River Boat'], ['ccgrotto', '🍄', 'grotto', 'The Mushroom Grotto'], ['ccfalls', '🌊', 'falls', 'The Falls'],
  ['ccforge', '🔥', 'forge', 'The Forge'], ['cccart', '🛤️', 'cart', 'Lumi’s Cart'], ['ccsong', '🎶', 'song', 'The Singing Chamber']].map((p) => Object.freeze(p)));
// Which wings are open: a page stays out of the journal until its wing is in the game (no silhouettes of places that are not there). A switch to true in the wing's own milestone.
export const WING_LIVE = { boat: true, grotto: false, falls: true, forge: false, cart: false, song: false };
export const WING_OF = Object.freeze({ ccboat: 'boat', ccgrotto: 'grotto', ccfalls: 'falls', ccforge: 'forge', cccart: 'cart', ccsong: 'song' });
export const wingPageShown = (id) => !WING_OF[id] || !!WING_LIVE[WING_OF[id]];
export const CRYSTAL_JOURNAL_TYPES = Object.freeze(CRYSTAL_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the cave's lazy file (world/crystalwords.js) when its chunk arrives.
export const CRYSTAL_HINTS = {};

// The journal's pages, by journal id.
export const CRYSTAL_PAGE_WORDS = Object.freeze(Object.fromEntries([...CRYSTAL_PAGES, ...CAVE_LIFE_PAGES, ...CRYSTAL_WING_PAGES].map(([id, , , name]) => [id, Object.freeze({
  name: () => name,
  hint: () => CRYSTAL_HINTS[id] ?? '',
})])));
