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
// Nine more pages for the second wave (R10 reserves the ids; the wings that earn them come later): the Sealab, its three fuses, the dome show,
// the spotted shark, the sunken galleon, the torn map, the Captain's Chest and the two mounts. Short names: they are start-up constants.
export const REEF_WING_PAGES = Object.freeze([['rflab', '🔬', 'lab', 'The Sealab'], ['rffuses', '🔌', 'fuses', 'Three Fuses'], ['rfshow', '🌌', 'show', 'Dome Lights'],
  ['rfshark', '🦈', 'shark', 'Spotted Shark'], ['rfgalleon', '🏴‍☠️', 'galleon', 'The Galleon'], ['rfmap', '🗺️', 'map', 'The Torn Map'],
  ['rfcaptchest', '👑', 'captchest', 'Captain’s Chest'], ['rfscooter', '🛵', 'scooter', 'Sea Scooter'], ['rfsaucer', '🛸', 'saucer', 'Diving Saucer'],
  // R18: the friendly divers, the research ship above the shimmer and the big spotted shark far out (world/reefdivers.js). Always shown (no wing switch).
  ['rfdivers', '🤿', 'divers', 'Friendly Divers'], ['rfvessel', '🛥️', 'vessel', 'Research Ship'], ['rfwhaleshark', '🦈', 'whaleshark', 'Big Spotted Shark']].map((p) => Object.freeze(p)));
// Which wings are open: a wing's pages stay out of the journal until its hatch, rack or ship is in the game (the owner's note: no silhouettes of places that are
// not there). 'lab' opened with R13 (the Sealab's hatch); the galleon (R16), the scooter and the saucer opened with R12 (their racks); the galleon (R16) follows, a switch to true in its own milestone.
export const WING_LIVE = { lab: true, wreck: true, scooter: true, saucer: true };
export const WING_OF = Object.freeze({ rflab: 'lab', rffuses: 'lab', rfshow: 'lab', rfshark: 'lab', rfgalleon: 'wreck', rfmap: 'wreck', rfcaptchest: 'wreck', rfscooter: 'scooter', rfsaucer: 'saucer' });
// A page that stays out until it has been earned: the dome's show page is not a silhouette before the show exists (R15). `journal` is the journal's counts.
export const PAGE_AFTER_SEEN = Object.freeze(['rfshow']);
export const wingPageShown = (id, journal = null) => (!WING_OF[id] || !!WING_LIVE[WING_OF[id]]) && (!PAGE_AFTER_SEEN.includes(id) || Number(journal?.[id]) > 0);
export const REEF_JOURNAL_TYPES = Object.freeze(REEF_PAGES.map((p) => p[0]));

// The hints by journal id: empty here, filled by the Reef's lazy file (world/reefwords.js) when its chunk arrives.
export const REEF_HINTS = {};

// The journal's pages, by journal id.
export const REEF_PAGE_WORDS = Object.freeze(Object.fromEntries([...REEF_PAGES, ...REEF_LIFE_PAGES, ...REEF_WING_PAGES].map(([id, , , name]) => [id, Object.freeze({
  name: () => name,
  hint: () => REEF_HINTS[id] ?? '',
})])));

// Start-up code (the words are the same in both word sets, so they are not phrase ids): keeps Reef stage A under its ceiling.
// "about 25 m to your left" for a place on the plan, from where she stands now: `cat` { x, z } and the way she faces (fx, fz: the camera's forward on the ground, -z is north).
// Four 90-degree turns (ahead, to your right, behind you, to your left) and the distance to the nearest 5 m; under 2.5 m it says 5. Pure: nothing is read but the arguments.
export function nowWords(x, z, cat, fx, fz) {
  const dx = x - cat.x; const dz = z - cat.z;
  const m = Math.round(Math.hypot(dx, dz) / 5) * 5 || 5;
  const rel = Math.atan2(dz * fx - dx * fz, dx * fx + dz * fz); // 0 ahead, positive toward her right (guidegeo.js arrowFor)
  return `about ${m} m ${['ahead', 'to your right', 'behind you', 'to your left'][(Math.round(rel / (Math.PI / 2)) + 4) % 4]}`;
}
