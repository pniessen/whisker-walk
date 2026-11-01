// The clan territories: the 11-year-old's own map, as data, and the model the
// home screen's territory map draws. Pure: no DOM, no THREE, nothing written
// to the save. Coordinates are board units on a 1000 x 700 board, simplified
// from her drawing; keep them as she placed them.
//
// A 'built' territory is a walkable area (areaId names its CATALOG.areas
// entry); 'soon' ones are drawn but not walkable yet; 'later' is unexplored.
import { PLACE_WORDS } from './clanwords.js';
import { placeName } from './edition.js';

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
  { id: 'gorge', areaId: null, name: 'The Gorge', x: 815, y: 353, r: 80, status: 'later' },
]);

const pts = (list) => Object.freeze(list.map((p) => Object.freeze(p)));

export const LAKE = pts([[397, 370], [402, 281], [405, 241], [416, 220], [431, 209], [452, 207], [472, 209], [495, 220], [507, 237], [522, 327], [517, 352], [469, 415], [450, 426], [429, 425], [400, 408]]);
export const ISLAND = Object.freeze({
  name: 'The island', status: 'soon',
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

  const regions = TERRITORIES.map((t) => {
    const base = { id: t.id, name: t.name, areaId: t.areaId, x: t.x, y: t.y, r: t.r, status: t.status };
    if (t.status !== 'built' || !has(areas, t.areaId)) {
      return { ...base, owned: false, selected: false, locked: false, canOpen: false, line: SOON_LINE[t.status] ?? SOON_LINE.soon };
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
    return { ...base, name: placeName(t.areaId, edition, catalog) || t.name, owned, selected, locked, canOpen, line };
  });

  return { regions, island: ISLAND, star: STAR, lake: LAKE, pond: POND, river: RIVER, paths: PATHS, bridge: BRIDGE };
}
