// The clan territories: the 11-year-old's own map, as data, and the model the
// home screen's territory map draws. Pure: no DOM, no THREE, nothing written
// to the save. Coordinates are board units on a 1000 x 700 board, simplified
// from her drawing; keep them as she placed them.
//
// A 'built' territory is a walkable area (areaId names its CATALOG.areas
// entry). Every territory listed is built now; the model and the map still
// know 'soon' (drawn, not walkable yet) and 'later' (unexplored) for the next
// one drawn before it is walkable.
import { PLACE_WORDS } from './clanwords.js';
import { placeName, isClanEdition } from './edition.js';
import { castFor, CLAN_COLOURS } from './clancast.js';
import { picksOf, isClanId } from './clanhomes.js';

// Land colours, one per territory: Twolegplace's rooftops, the Woods' green,
// heather on the Moor, marsh, dark pines, grey rock for the Gorge. The home-screen
// map paints them and a border post's cloth band wears the neighbour's.
export const LAND = Object.freeze({ town: '#d9a57e', woods: '#8fbf74', moor: '#c9a9c6', river: '#a8cf9c', pines: '#6e9d78', gorge: '#b5a48d' });

export const BOARD = Object.freeze({ w: 1000, h: 700 });

const freezeAll = (list) => Object.freeze(list.map((t) => Object.freeze(t)));

// Twolegplace is the Neighborhood under its Clan Edition name; the name is
// read from clanwords.js so the borrowed word lives only there.
export const TERRITORIES = freezeAll([
  { id: 'town', areaId: 'neighborhood', name: PLACE_WORDS.town, x: 843, y: 566, r: 110, status: 'built' },
  { id: 'woods', areaId: 'woods', name: 'The Woods', x: 565, y: 500, r: 170, status: 'built' },
  { id: 'moor', areaId: 'moor', name: 'The Moor', x: 620, y: 161, r: 165, status: 'built' },
  { id: 'river', areaId: 'river', name: 'The River and Marshes', x: 232, y: 488, r: 160, status: 'built' },
  { id: 'pines', areaId: 'pines', name: 'The Pines and Swamp', x: 308, y: 199, r: 150, status: 'built' },
  { id: 'gorge', areaId: 'gorge', name: 'The Gorge', x: 815, y: 353, r: 80, status: 'built' },
]);

// Where each clan's camp is drawn on the board, inside its region, placed the
// way the camp sits on that territory's walkable map (world north is board
// north): the Woods' north glade facing the Moor, the River's meadow by the
// bank, the Moor's heath on its north edge (nudged west of the name), the
// Pines' swamp side of the south edge, west of the spawn, the Gorge's Wide
// Ledge below the cliff face (live check: under the name, which sits higher
// than the region's centre so the "mine" ring clears it).
export const CAMP_AT = Object.freeze({
  woods: Object.freeze([575, 400]),
  river: Object.freeze([244, 470]),
  moor: Object.freeze([540, 95]),
  pines: Object.freeze([236, 288]),
  gorge: Object.freeze([845, 405]),
});

const pts = (list) => Object.freeze(list.map((p) => Object.freeze(p)));

export const LAKE = pts([[397, 370], [402, 281], [405, 241], [416, 220], [431, 209], [452, 207], [472, 209], [495, 220], [507, 237], [522, 327], [517, 352], [469, 415], [450, 426], [429, 425], [400, 408]]);
// The island is walked as part of the Pines (owner's decision 1), so its star
// is the Pines' way in and takes the Pines' state.
export const ISLAND = Object.freeze({
  id: 'island', areaId: 'pines', name: 'The island', status: 'built',
  outline: pts([[437, 307], [444, 297], [456, 291], [476, 289], [485, 309], [478, 321], [464, 329], [449, 329], [440, 320]]),
});
export const STAR = Object.freeze({ x: 455, y: 314 });
export const POND = Object.freeze({ x: 380, y: 463, r: 22 });
export const RIVER = pts([[143, 376], [183, 374], [195, 394], [295, 393], [275, 451], [320, 453], [339, 437], [362, 447], [402, 462], [425, 442], [446, 442], [461, 430], [544, 424], [559, 435], [579, 434], [598, 410], [623, 406], [636, 384], [630, 374], [644, 338], [642, 304], [614, 280], [634, 226], [631, 206], [614, 199], [555, 205], [504, 178], [455, 196]]);
export const PATHS = Object.freeze({
  short: pts([[737, 551], [716, 538], [712, 512]]),
  north: pts([[717, 518], [730, 440], [721, 366], [737, 322], [747, 236], [771, 178]]),
  long: pts([[738, 554], [720, 560], [667, 624], [529, 663], [377, 639], [322, 614]]),
});
export const BRIDGE = pts([[395, 232], [444, 297]]);

const has = (obj, k) => !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, k);
const count = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

// The one wording for a place that opens after walks somewhere else. The
// dressing room's place card uses it too, so the map and the card agree.
export function opensAfterLine(req, have, edition, catalog) {
  return `opens after ${req.walks} walks in ${placeName(req.area, edition, catalog) || req.area} · ${have}/${req.walks} so far`;
}

const SOON_LINE = { soon: 'coming soon', later: 'unexplored' };

// What the map shows for this save. Ownership and gates mirror
// progression.isUnlocked/canBuy, read from the save only.
export function territoryMapModel(state, catalog) {
  const edition = state?.edition;
  const areas = catalog.areas;
  const unlocked = state?.unlocked && typeof state.unlocked === 'object' ? state.unlocked : {};
  const ownedAreas = Array.isArray(unlocked.areas) ? unlocked.areas : [];
  const walks = state?.walks && typeof state.walks === 'object' ? state.walks : {};
  const area = typeof state?.area === 'string' && has(areas, state.area) ? state.area : Object.keys(areas)[0];
  const points = count(state?.points);

  // owned, selected, locked, canOpen and line for one place, from its areaId.
  // The island asks through its areaId, so it carries the Pines' state.
  const stateOf = (t) => {
    if (t.status !== 'built' || !has(areas, t.areaId)) {
      return { owned: false, selected: false, locked: false, canOpen: false, line: SOON_LINE[t.status] ?? SOON_LINE.soon };
    }
    const a = areas[t.areaId];
    const owned = ownedAreas.includes(t.areaId);
    const selected = area === t.areaId;
    const req = a.requires;
    const have = req ? count(walks[req.area]) : 0;
    const locked = !owned && !!req && have < req.walks;
    const canOpen = !owned && !locked && points >= count(a.price);
    let line;
    if (selected) line = 'today’s walk';
    else if (owned) line = 'tap to walk here';
    else if (locked) line = opensAfterLine(req, have, edition, catalog);
    else line = 'Tap to explore'; // every built territory costs 0 paws, so open means free to take
    return { owned, selected, locked, canOpen, line };
  };

  // The camp mark, Clan Edition only, for a region whose territory has a clan.
  const picks = picksOf(state);
  // picksOf drops a missing own pick, so a partner-only save reads [partner]:
  // take "mine" from the pick itself, then the sibling's is the other one.
  const mine = isClanEdition(state) && isClanId(state?.clanPick?.mine) ? state.clanPick.mine : null;
  const sibling = isClanEdition(state) ? picks.find((p) => p !== mine) ?? null : null;
  const campOf = (t) => {
    if (!isClanEdition(state) || !has(CAMP_AT, t.id) || !castFor(t.id).length) return null;
    const [x, y] = CAMP_AT[t.id];
    return { x, y, color: CLAN_COLOURS[t.id], mine: mine === t.id, ally: sibling === t.id && mine !== t.id };
  };

  const regions = TERRITORIES.map((t) => {
    const base = { id: t.id, name: t.name, areaId: t.areaId, x: t.x, y: t.y, r: t.r, status: t.status };
    const st = stateOf(t);
    const builtHere = t.status === 'built' && has(areas, t.areaId);
    return { ...base, camp: campOf(t), ...(builtHere ? { name: placeName(t.areaId, edition, catalog) || t.name } : {}), ...st };
  });

  return { regions, island: { ...ISLAND, ...stateOf(ISLAND) }, star: STAR, lake: LAKE, pond: POND, river: RIVER, paths: PATHS, bridge: BRIDGE };
}
