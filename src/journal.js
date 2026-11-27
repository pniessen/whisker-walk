// v15 Collector's Journal — static catalog + Album-tab renderer for the 12
// JOURNAL_TYPES ids tracked in progression.js's state.journal.
import { phrase } from './clanphrases.js';
import { PAGE_WORDS } from './farmwords.js';
import { ROOFS_PAGE_WORDS } from './roofspages.js';
import { MARKET_PAGE_WORDS, MARKET_ERRAND_PAGES, MARKET_ERRAND_PAGE_WORDS } from './marketpages.js';
import { LIGHTHOUSE_PAGE_WORDS } from './lighthousepages.js';
import { MOON_PAGES, MOON_LIFE_PAGES, MOON_WING_PAGES, MOON_PAGE_WORDS, wingPageShown as moonWingShown } from './moonpages.js';
import { moonOn } from './moonflag.js';
import { REEF_PAGES, REEF_LIFE_PAGES, REEF_WING_PAGES, REEF_PAGE_WORDS, wingPageShown } from './reefpages.js';
import { reefOn } from './reefflag.js';
import { CRYSTAL_PAGES, CAVE_LIFE_PAGES, CRYSTAL_WING_PAGES, CRYSTAL_DEEP_PAGES, CRYSTAL_PAGE_WORDS, wingPageShown as crystalWingShown } from './crystalpages.js';
import { crystalOn } from './crystalflag.js';
import { SNOWVILLE_LIVE_PAGES, SNOWVILLE_HINTS } from './snowvillepages.js';
import { snowvilleOn } from './snowvilleflag.js';
import { TREEHOUSE_LIVE_PAGES, TREEHOUSE_HINTS } from './treehousepages.js';
import { treehouseOn } from './treehouseflag.js';
import { JUNGLE_LIVE_PAGES, JUNGLE_HINTS } from './junglepages.js';
import { jungleOn } from './jungleflag.js';
import { GREENHOUSE_PAGES, GREENHOUSE_PAGE_WORDS } from './greenhousepages.js';
import { greenhouseOn } from './greenhouseflag.js';
import { RIDE_PAGE_WORDS, FAIR_PAGE_WORDS } from './fairwords.js';

// All content here is a fixed, static catalog (ids/emoji/names/hints are
// never user- or network-supplied), so none of it needs HTML-escaping.
// The neighbour as a dressed Twoleg, drawn after the box-and-ball villager
// the game had before the lifelike people (trouser legs, shoes, a coat
// flaring at the hips, a scarf, a round head, a bobble hat, one arm waving).
// Static, no ids/text/links; the silhouette filter darkens it like an emoji.
const TWOLEG_ART = '<svg viewBox="0 0 24 32" width="0.9em" height="1.2em" aria-hidden="true">'
  + '<rect x="7.5" y="24" width="3.6" height="6" fill="#4a5468"/>'
  + '<rect x="12.9" y="24" width="3.6" height="6" fill="#4a5468"/>'
  + '<ellipse cx="8.4" cy="30.2" rx="3" ry="1.5" fill="#3a3330"/>'
  + '<ellipse cx="15.6" cy="30.2" rx="3" ry="1.5" fill="#3a3330"/>'
  + '<polygon points="8,14.5 16,14.5 18,25.5 6,25.5" fill="#6a8ac0"/>'
  + '<polygon points="8.2,15 5.2,16 4.4,23 6.6,23.4 7.6,18" fill="#6a8ac0"/>'
  + '<polygon points="15.8,15 17.6,16.4 20.6,8.2 18.4,7.2 16.4,13" fill="#6a8ac0"/>'
  + '<circle cx="19.6" cy="6.4" r="1.7" fill="#e8c8a8"/>'
  + '<rect x="8" y="13.2" width="8" height="2.4" rx="1.1" fill="#d8a640"/>'
  + '<rect x="9.2" y="14.6" width="2.2" height="5" rx="0.8" fill="#d8a640"/>'
  + '<circle cx="12" cy="9.6" r="3.7" fill="#e8c8a8"/>'
  + '<path d="M7.9 8.8 Q8.2 3.8 12 3.8 Q15.8 3.8 16.1 8.8 Z" fill="#d8503a"/>'
  + '<rect x="7.4" y="7.8" width="9.2" height="1.6" rx="0.8" fill="#d8503a"/>'
  + '<circle cx="12" cy="2.9" r="1.7" fill="#f4f0e8"/>'
  + '</svg>';

// A new area's live pages over the placeholders: a page of `pages` takes its emoji and name and a hint read when shown (the area's lazy file fills `hints`), flagged `flag` so it hides with the area.
const livePages = (pages, hints, flag, at) => (c) => { const p = pages.find((q) => q[0] === c.id); return p ? { id: c.id, emoji: p[1], [flag]: true, name: p[at], get hint() { return hints[c.id] ?? ''; } } : c; };

export const CRITTER_INFO = [
  { id: 'bird', emoji: '🐦', name: 'Chirpy Bird', hint: 'Move slowly and stay downwind to get close.' },
  { id: 'squirrel', emoji: '🐿️', name: 'Bushy Squirrel', hint: 'Chase it toward a tree trunk!' },
  { id: 'butterfly', emoji: '🦋', name: 'Fluttering Butterfly', hint: 'Time a mid-air pounce to catch one.' },
  { id: 'duck', emoji: '🦆', name: 'Paddling Duck', hint: 'Look for it near ponds and puddles.' },
  { id: 'seagull', emoji: '🕊️', name: 'Squawking Seagull', hint: 'Follow the shoreline at the seaside.' },
  { id: 'crab', emoji: '🦀', name: 'Sideways Crab', hint: 'Check the sand near the tide line.' },
  { id: 'dog', emoji: '🐕', name: 'Friendly Dog', hint: 'Spot it from outside its lawn — it chases cats off the grass!' },
  { id: 'villager', emoji: '🧑', name: 'Neighborhood Villager', hint: 'Wave hello as you walk past.', art: TWOLEG_ART },
  { id: 'firefly', emoji: '✨', name: 'Glowing Firefly', hint: 'Comes out after dusk — watch for the twinkle.' },
  { id: 'mouse', emoji: '🐭', name: 'Quick Mouse', hint: 'Stalk quietly, then pounce!' },
  // v18 Task 2.6 — the eleventh page, and The Old Docks' own critter. Hint
  // style matches the ten above: one short sentence naming WHERE to look,
  // never a mechanic the player hasn't met yet.
  { id: 'rat', emoji: '🐀', name: 'Dockside Rat', hint: 'Nose around the crates down at the old docks.' },
  { id: 'rabbit', emoji: '🐇', name: 'Moor Rabbit', hint: 'Watch it bolt for its burrow!' },
  { id: 'frog', emoji: '🐸', name: 'Bog Frog', hint: 'Creep up softly, or it plops into the bog!' },
  { id: 'goat', emoji: '🐐', name: 'Mountain Goat', hint: 'It never lets you close — watch it leap along the rim!' },
  // Appletree Farm's animals (src/farmsim.js). None can be chased or caught:
  // each page is filled the first time the cat walks up and looks at one.
  { id: 'cow', emoji: '🐄', name: 'Gentle Cow', hint: 'Look in the big field at the farm.' },
  { id: 'farmgoat', emoji: '🐐', name: 'Cheeky Goat', hint: 'It plays on the rocks at the farm.' },
  { id: 'hen', emoji: '🐔', name: 'Pecking Hen', hint: 'Look around the farmyard.' },
  { id: 'chick', emoji: '🐤', name: 'Fluffy Chick', hint: 'Walk slowly up to a hen.' },
  { id: 'sheepdog', emoji: '🐶', name: 'Farm Sheepdog', hint: 'He waits by his kennel at the farm.' },
  { id: 'duckling', emoji: '🐥', name: 'Little Duckling', hint: 'Wade into the pond at the farm.' },
  // The Farm's four jobs and six finds (src/farmjobs.js). Their words are in
  // the phrase table (src/farmwords.js) and are read when a page is drawn.
  ...[['jobchicks', '🐣'], ['jobcow', '🥛'], ['jobgoat', '👒'], ['jobmice', '🌽'],
    ['findloftcats', '🐈'], ['findeggs', '🥚'], ['findowl', '🦉'], ['findscarecrow', '🌾'], ['findapples', '🍎'], ['findducklings', '🌊']]
    .map(([id, emoji]) => ({ id, emoji, get name() { return PAGE_WORDS[id].name(); }, get hint() { return PAGE_WORDS[id].hint(); } })),
  // The Fairground's five rides (src/fairsim.js): a page each, filled the
  // first time she rides it. Words in the phrase table (src/fairwords.js).
  ...[['ridemgr', '🎠'], ['ridewheel', '🎡'], ['ridecups', '☕'], ['rideslide', '🌀'], ['ridecoaster', '🎢']]
    .map(([id, emoji]) => ({ id, emoji, get name() { return RIDE_PAGE_WORDS[id].name(); }, get hint() { return RIDE_PAGE_WORDS[id].hint(); } })),
  // The Fairground's three games and six finds (src/fairgames.js): a game's
  // page counts its wins, a find's the walks it was found on.
  ...[['gamecans', '🥫'], ['gameducks', '🦆'], ['gamebell', '🔔'],
    ['fairfortune', '🔮'], ['fairmusicbox', '🎶'], ['faircandyfloss', '🍭'], ['fairjuggler', '🤹'], ['fairballoon', '🎈'], ['fairlookout', '🔭']]
    .map(([id, emoji]) => ({ id, emoji, get name() { return FAIR_PAGE_WORDS[id].name(); }, get hint() { return FAIR_PAGE_WORDS[id].hint(); } })),
  // The Rooftops' six finds (src/roofspages.js): the walks each was found on.
  ...[['roofgarden', '🍅'], ['roofloft', '🕊️'], ['roofvane', '🧭'], ['roofskylight', '📖'], ['rooftelescope', '🌕'], ['roofchimney', '💨']]
    .map(([id, emoji]) => ({ id, emoji, get name() { return ROOFS_PAGE_WORDS[id].name(); }, get hint() { return ROOFS_PAGE_WORDS[id].hint(); } })),
  // The Market Square's six finds (src/marketpages.js): the walks each was found on.
  ...[['marketfountain', '💧'], ['marketpigeons', '🕊️'], ['marketsacks', '🌾'], ['marketmusician', '🎻'], ['marketbasket', '🚲'], ['marketapples', '🍎']]
    .map(([id, emoji]) => ({ id, emoji, get name() { return MARKET_PAGE_WORDS[id].name(); }, get hint() { return MARKET_PAGE_WORDS[id].hint(); } })),
  // The Market's six missions (src/marketpages.js): the walks each was finished on.
  ...MARKET_ERRAND_PAGES.map(([id, emoji]) => ({ id, emoji, get name() { return MARKET_ERRAND_PAGE_WORDS[id].name(); }, get hint() { return MARKET_ERRAND_PAGE_WORDS[id].hint(); } })),
  // Lighthouse Point's six finds and two jobs (src/lighthousepages.js): the walks each was found or finished on.
  // Always drawn, like every other place's (the place is in the game since its milestone 4; `lighthouse` only marks them).
  ...[['lhlamproom', '💡'], ['lhpool', '🦀'], ['lhgull', '🐦'], ['lhecho', '🎶'], ['lhbell', '🔔'], ['lhwindow', '🏮'], ['lhjobkitten', '🐱'], ['lhjoblamp', '🔦']]
    .map(([id, emoji]) => ({ id, emoji, lighthouse: true, get name() { return LIGHTHOUSE_PAGE_WORDS[id].name(); }, get hint() { return LIGHTHOUSE_PAGE_WORDS[id].hint(); } })),
  // The Moon's twelve pages (src/moonpages.js): drawn only behind ?moon=1 until the gate hand-off.
  ...[...MOON_PAGES, ...MOON_LIFE_PAGES, ...MOON_WING_PAGES].map(([id, emoji]) => ({ id, emoji, moon: true, get name() { return MOON_PAGE_WORDS[id].name(); }, get hint() { return MOON_PAGE_WORDS[id].hint(); } })),
  // The Reef's twelve pages (src/reefpages.js): drawn only behind ?reef=1 until the gate hand-off.
  ...[...REEF_PAGES, ...REEF_LIFE_PAGES, ...REEF_WING_PAGES].map(([id, emoji]) => ({ id, emoji, reef: true, get name() { return REEF_PAGE_WORDS[id].name(); }, get hint() { return REEF_PAGE_WORDS[id].hint(); } })),
  // The Crystal Cave's twelve pages (src/crystalpages.js): drawn only behind ?crystal=1 until the gate hand-off.
  ...[...CRYSTAL_PAGES, ...CAVE_LIFE_PAGES, ...CRYSTAL_WING_PAGES, ...CRYSTAL_DEEP_PAGES].map(([id, emoji]) => ({ id, emoji, crystal: true, get name() { return CRYSTAL_PAGE_WORDS[id].name(); }, get hint() { return CRYSTAL_PAGE_WORDS[id].hint(); } })),
  // The Greenhouse's eight pages (src/greenhousepages.js): drawn only behind ?greenhouse=1 until the place is in the game.
  ...GREENHOUSE_PAGES.map(([id, emoji]) => ({ id, emoji, greenhouse: true, get name() { return GREENHOUSE_PAGE_WORDS[id].name(); }, get hint() { return GREENHOUSE_PAGE_WORDS[id].hint(); } })),
  // N0 (Snowville, Treehouse, Jungle): 17 placeholder pages each, never drawn (later: true) until their area's milestones give them words.
  ...[['sv', 'sw', '❄️', 'Snowville'], ['th', 'tl', '🌳', 'Treehouse'], ['jl', 'jw', '🌴', 'Jungle']].flatMap(([a, b, emoji, place]) => [...Array(17)].map((_, i) => ({ id: (i < 9 ? a + (i + 1) : b + (i - 8)), emoji, name: place + ' page', hint: 'Not found yet.', later: true }))).map(livePages(SNOWVILLE_LIVE_PAGES, SNOWVILLE_HINTS, 'snowville', 3)).map(livePages(TREEHOUSE_LIVE_PAGES, TREEHOUSE_HINTS, 'treehouse', 2)).map(livePages(JUNGLE_LIVE_PAGES, JUNGLE_HINTS, 'jungle', 3)), // T3/T4: the Treehouse's six discoveries and three life pages are live (only behind ?treehouse=1), as V3 did Snowville's (behind ?snowville=0 they hide)
];

// renderJournalHtml(journal, goldenFound, goldenTotal) → HTML string.
// `journal` may be an untrusted/hostile object (e.g. loaded from a cloud
// payload before progression's sanitizeJournal runs, or passed straight
// through in a context that skips it) — every count is coerced through
// Number.isFinite so a non-numeric or malicious value (e.g. '<script>')
// simply falls back to 0 (unspotted) rather than reaching the DOM.
// chasedOff (Clan Life Part 2): the lifetime intruders-chased-off tally
// (state.feats.intruder). The line shows only when it is passed (homebase does
// so in Clan Edition); anything but a finite non-negative number reads 0.
export function renderJournalHtml(journal, goldenFound, goldenTotal, { chasedOff } = {}) {
  const j = journal && typeof journal === 'object' ? journal : {};
  const found = Number.isFinite(goldenFound) ? goldenFound : 0;
  const total = Number.isFinite(goldenTotal) ? goldenTotal : 0;
  const cards = CRITTER_INFO.filter((c) => !c.later && (!c.moon || (moonOn() && moonWingShown(c.id))) && (!c.greenhouse || greenhouseOn()) && (!c.reef || (reefOn() && wingPageShown(c.id, j))) && (!c.crystal || (crystalOn() && crystalWingShown(c.id))) && (!c.snowville || snowvilleOn()) && (!c.treehouse || treehouseOn()) && (!c.jungle || jungleOn())).map((c) => {
    const raw = j[c.id];
    const count = Number.isFinite(raw) ? raw : 0;
    if (count > 0) {
      return `<div class="journal-card spotted">
        <span class="journal-emoji">${c.art || c.emoji}</span>
        <span class="journal-name">${c.name}</span>
        <span class="journal-count">×${count}</span>
      </div>`;
    }
    // Not found yet: the critter's own emoji drawn as a dark shape (CSS
    // .silhouette), its name kept back. The shape is decorative; the card's
    // label says what it means.
    return `<div class="journal-card unspotted" role="group" aria-label="Not found yet">
      <span class="journal-emoji silhouette" aria-hidden="true">${c.art || c.emoji}</span>
      <span class="journal-hint">${c.hint}</span>
    </div>`;
  }).join('');
  const chased = chasedOff === undefined ? ''
    : `<div class="journal-footer">🛡️ ${phrase('journal.chasedOff')}: ${Number.isFinite(chasedOff) && chasedOff > 0 ? Math.floor(chasedOff) : 0}</div>`;
  return `<div class="journal-grid">${cards}</div>
    <div class="journal-footer">🥇 Golden mice: ${found}/${total}</div>${chased}`;
}
