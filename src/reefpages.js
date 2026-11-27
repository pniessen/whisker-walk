// The Reef's twelve journal pages (six discoveries, six activity pages): ids, emoji and names, the same in both word sets
// (no series word is in any). Start-up code (journal.js imports it), so it holds nothing of the place's world; a page's
// hint is in the lazy src/world/reefwords.js and reads empty until the Reef's chunk has been loaded (no card is drawn
// before ?reef=1 until the gate hand-off). All twelve ids are reserved in milestone R0 so no older build drops one.
export const REEF_PAGES = Object.freeze([
  ['rfboat', '🚢', 'boat', 'The Sunken Boat'], ['rfoyster', '🦪', 'oyster', 'The Pearl Oyster'], ['rfseahorse', '🐴', 'seahorse', 'The Kelp Seahorse'],
  ['rfcave', '✨', 'cave', 'The Glow Cave'], ['rfchest', '🧰', 'chest', 'The Treasure Chest'], ['rfanchor', '⚓', 'anchor', 'The Old Anchor'],
  ['rfshells', '🐚', 'shells', 'Marlo’s New Shell'], ['rflanterns', '🏮', 'lanterns', 'The Lantern Corals'], ['rfparade', '🎉', 'parade', 'The Housewarming'],
  ['rfalbum', '🖼️', 'album', 'Reef Postcards'], ['rferrand', '🦀', 'errand', 'Marlo’s Errand'], ['rfrings', '🫧', 'rings', 'Bubble Rings'],
].map((p) => Object.freeze(p)));
// Three more pages, the friendly sea life (world/reefseals.js): spotted like a farm animal (6 m, looking at one; a dolphin from 12 m), each page counting the walks.
export const REEF_LIFE_PAGES = Object.freeze([['rfseal', '🦭', 'seal', 'Curious Seal'], ['rfoctopus', '🐙', 'octopus', 'Shy Octopus'], ['rfdolphin', '🐬', 'dolphin', 'Dolphin Family'],
  // seven more (world/reefmore.js): a jellyfish, a clownfish pair, a kelp seahorse, a manta, a whale, a moray eel and the squid school
  ['rfjelly', '🪼', 'jelly', 'Moon Jellyfish'], ['rfclown', '🐠', 'clown', 'Clownfish Pair'], ['rfhorse', '🐴', 'horse', 'Kelp Seahorse'], ['rfmanta', '🐟', 'manta', 'Gliding Manta'],
  ['rfwhale', '🐋', 'whale', 'Gentle Whale'], ['rfmoray', '🐍', 'moray', 'Smiling Moray'], ['rfsquid', '🦑', 'squid', 'Squid School']].map((p) => Object.freeze(p)));
export const REEF_JOURNAL_TYPES = Object.freeze(REEF_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the Reef's lazy file (world/reefwords.js) when its chunk arrives.
export const REEF_HINTS = {};

// The journal's pages, by journal id.
export const REEF_PAGE_WORDS = Object.freeze(Object.fromEntries([...REEF_PAGES, ...REEF_LIFE_PAGES].map(([id, , , name]) => [id, Object.freeze({
  name: () => name,
  hint: () => REEF_HINTS[id] ?? '',
})])));
