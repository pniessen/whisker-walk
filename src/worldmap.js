// The world map: every place in one picture, as data, and the model Change
// place draws. Pure: no DOM, no THREE, nothing written to the save.
//
// The world is 1840 x 920 board units, one continent with the sea along its
// east and south-east, the Moon up in the sky above it and the Reef out at
// sea (docs/superpowers/specs/2026-11-28-map-rework-design.md). Her territory
// board's river, lake, island, paths and bridge (src/territories.js) are read
// from there as she drew them; her six places keep to her order and stand
// about where she drew them, at the same size as every other place.
//
// GATEWAYS are the roads between places draft 2 joins. Step 2 draws them as
// small marks only; they are ready for step 3, which gives them gates and
// states.
//
// Not on the map: the den (home, a Menu tile), and today's border posts.
// The Rooftops is on it, inside the town (TOWN_PLACES), a place like the
// others since its catalog row went in; so is the Market Square, on the
// town's south-east rim (Market step 4), and the Old House, on its south-west
// rim (Old House step 4, W4). Those of Clan Edition only are not in a Legacy
// save's model (W2).
//
// One thing moves on the world map only: the Moor's camp (WORLD_CAMP_AT).
// The world map's bigger words leave no room for it on the Moor's north edge
// beside the name, so it sits in the bend of her river instead. Her board's
// CAMP_AT is kept.
import { placeName, areaInEdition, areaShown } from './edition.js';
import { words } from './wordset.js';
import { STAR, territoryMapModel, placeState } from './territories.js';

export const WORLD = Object.freeze({ w: 1840, h: 920 });

const freezeAll = (list) => Object.freeze(list.map((t) => Object.freeze(t)));
const pts = (list) => Object.freeze(list.map((p) => Object.freeze(p)));

// Every place on the map has the same footprint (map rework, 2026-11-28): one radius, so the old Clan areas are no bigger
// than the street places. The land between them is one continent (ui/territorymap.js draws each place as its own patch of it).
export const PLACE_R = 84;

// Where each place stands: [x, y]. Her board's six keep her order and about her places; the rest are laid out on a grid with
// room for each name (the map is one continent, the Moon is up in the sky and the Reef out at sea).
export const LAYOUT = Object.freeze({
  pines: [290, 170], moor: [600, 110], snowville: [870, 110], treehouse: [1130, 95], greenhouse: [1430, 110], jungle: [1700, 170],
  roofs: [600, 330], gorge: [870, 330], fair: [1130, 310], farm: [1430, 330],
  river: [260, 500], woods: [570, 520], town: [860, 540], park: [1130, 530], lighthouse: [1450, 550],
  crystal: [300, 760], house: [590, 740], docks: [860, 780], market: [1130, 770], seaside: [1430, 770],
  reef: [1710, 740], moon: [1280, -135],
});
const at = (id) => ({ x: LAYOUT[id][0], y: LAYOUT[id][1], r: PLACE_R });

// The town's street neighbours, each a walkable area (id = its CATALOG.areas id).
export const STREET_PLACES = freezeAll([
  { id: 'park', areaId: 'park', ...at('park') },
  { id: 'fair', areaId: 'fair', ...at('fair') },
  { id: 'farm', areaId: 'farm', ...at('farm') },
  { id: 'docks', areaId: 'docks', ...at('docks') },
  { id: 'seaside', areaId: 'seaside', ...at('seaside') },
  { id: 'lighthouse', areaId: 'lighthouse', ...at('lighthouse') },
  // The Greenhouse: shown only while the gates switch is on (the row's `gate: 'tele'`).
  { id: 'greenhouse', areaId: 'greenhouse', ...at('greenhouse') },
  // The Treehouse village: shown only while its switch is on (the row's `flag: 'treehouse'`).
  { id: 'treehouse', areaId: 'treehouse', ...at('treehouse') },
]);

// Land colours for the street places, as territories.js's LAND is for hers.
export const STREET_LAND = Object.freeze({ park: '#b9dc8f', fair: '#e9b7c9', farm: '#e3cf7e', treehouse: '#a6cf86', docks: '#b7b9bf', seaside: '#ecdca8', lighthouse: '#cfdad2', greenhouse: '#bfe3b5' });

// Places she reaches by a teleport gate and may then go back to by the map: drawn ONLY once she has walked the place
// (state.walks[id] >= 1), so the map never gives away a gate before she finds it. Snowville (the cold north) and the Jungle
// lodge (the warm east) are on the mainland; the Crystal Cave is on land by the Docks; the Moon is up in the sky and the Reef
// is the one place at sea (its patch of deep water is drawn under it).
export const GATE_PLACES = freezeAll([
  { id: 'reef', areaId: 'reef', ...at('reef') },
  { id: 'crystal', areaId: 'crystal', ...at('crystal') },
  { id: 'moon', areaId: 'moon', ...at('moon') },
  { id: 'jungle', areaId: 'jungle', ...at('jungle') },
  { id: 'snowville', areaId: 'snowville', ...at('snowville') },
]);
export const GATE_LAND = Object.freeze({ reef: '#7fc3cc', crystal: '#d9c4ec', moon: '#cfd3e6', jungle: '#72b86c', snowville: '#e4eef6' });
// The places not on the mainland: the Reef's patch of deep water, and the Moon's rock in the sky.
export const AFAR_IDS = Object.freeze(['reef', 'moon']);

// Places that sit inside the town on the old map are now ordinary places of their own, joined to the town by a road.
export const TOWN_PLACES = freezeAll([
  { id: 'roofs', areaId: 'roofs', ...at('roofs') },
  { id: 'market', areaId: 'market', ...at('market') },
  { id: 'house', areaId: 'house', ...at('house') },
]);

// Their land colours: roof slate, warm cobble, old timber.
export const TOWN_LAND = Object.freeze({ roofs: '#8e9bb0', market: '#d8b48a', house: '#a3876a' });

// Her board's six places on the world map: the same radius as every other place.
export const BOARD_AT = Object.freeze({ town: LAYOUT.town, woods: LAYOUT.woods, moor: LAYOUT.moor, river: LAYOUT.river, pines: LAYOUT.pines, gorge: LAYOUT.gorge });

// The coast, west edge of the sea: the points of a cubic chain,
// M p0 C p1 p2 p3 C p4 p5 p6 ..., from the top of the world down the east side and round the south-east to the
// south shore (the sea carries on west under the land along y 925).
export const COAST = pts([[1850, -60], [1850, 150], [1850, 300], [1780, 380], [1720, 440], [1600, 440], [1585, 520], [1575, 600], [1575, 680], [1565, 760], [1555, 850], [1450, 925], [1300, 925]]);

// The roads between places: from and to are area ids, road is one cubic
// (M p0 C p1 p2 p3) from the edge of `from` to the edge of `to`.
export const GATEWAYS = Object.freeze([
  { id: 'town-park', from: 'neighborhood', to: 'park', road: [[968, 560], [978, 560], [986, 560], [995, 560]] },
  { id: 'park-fair', from: 'park', to: 'fair', road: [[1130, 446], [1130, 420], [1130, 400], [1130, 394]] },
  { id: 'park-farm', from: 'park', to: 'farm', road: [[1214, 520], [1330, 510], [1430, 490], [1430, 414]] },
  { id: 'town-docks', from: 'neighborhood', to: 'docks', road: [[860, 624], [860, 660], [860, 690], [860, 696]] },
  { id: 'docks-seaside', from: 'docks', to: 'seaside', road: [[940, 810], [980, 935], [1400, 935], [1430, 854]] },
  { id: 'town-roofs', from: 'neighborhood', to: 'roofs', road: [[790, 490], [740, 430], [690, 400], [668, 380]] },
  { id: 'town-market', from: 'neighborhood', to: 'market', road: [[920, 600], [950, 640], [985, 670], [1005, 690]] },
  { id: 'seaside-lighthouse', from: 'seaside', to: 'lighthouse', road: [[1440, 686], [1445, 650], [1450, 640], [1450, 634]] },
  { id: 'town-house', from: 'neighborhood', to: 'house', road: [[800, 590], [770, 640], [740, 670], [712, 690]] },
  { id: 'farm-treehouse', from: 'farm', to: 'treehouse', road: [[1360, 290], [1300, 240], [1230, 150], [1200, 120]] },
].map((g) => Object.freeze({ ...g, road: pts(g.road) })));

// The Moon's beam: a dotted line from the Park (where its gate is) up through the gap between the Fairground and the
// Farm, up past the Treehouse village and the Greenhouse, to the rock in the sky.
export const MOON_BEAM = pts([[1214, 500], [1290, 420], [1280, 200], [1280, -40]]);

// The camp mark is drawn by the renderer in the icon's row of its place's words (ui/territorymap.js campHtml); the model's camp
// keeps her colour and who it belongs to, and this anchor (the corner of its place).
export const WORLD_CAMP_OFF = Object.freeze([36, -72]);

// The island's star is a tap target of its own, 92 across: the smallest on
// the map, and still at least 44 px at the map's least zoom.
export const ISLAND_HIT_R = 46;

// What the world map shows for this save: her board's regions (kind 'board',
// from territoryMapModel), then the street places (kind 'street'), each with
// its name from the word tables and its state from placeState. touch: as
// placeState's (the home screen's getIsTouch).
export function worldMapModel(state, catalog, { touch = false } = {}) {
  const board = territoryMapModel(state, catalog, { touch });
  const edition = state?.edition;
  const regions = [
    ...board.regions.map((r) => {
      const [x, y] = BOARD_AT[r.id];
      return { ...r, kind: 'board', x, y, r: PLACE_R, ...(r.camp ? { camp: { ...r.camp, x: x + WORLD_CAMP_OFF[0], y: y + WORLD_CAMP_OFF[1] } } : {}) };
    }),
    ...STREET_PLACES.filter((p) => areaShown(catalog?.areas?.[p.areaId], edition)).map((p) => ({
      id: p.id, areaId: p.areaId, x: p.x, y: p.y, r: p.r,
      // (a street place the catalog does not have yet is not built)
      kind: 'street', name: placeName(p.areaId, edition, catalog), status: catalog?.areas?.[p.areaId] ? 'built' : 'soon', camp: null,
      ...placeState(state, catalog, p.areaId, { touch }),
    })),
    ...GATE_PLACES.filter((p) => areaShown(catalog?.areas?.[p.areaId], edition) && Number(state?.walks?.[p.id]) >= 1).map((p) => ({
      id: p.id, areaId: p.areaId, x: p.x, y: p.y, r: p.r,
      kind: 'gate', afar: AFAR_IDS.includes(p.id), name: placeName(p.areaId, edition, catalog), status: 'built', camp: null,
      ...placeState(state, catalog, p.areaId, { touch }),
    })),
    ...TOWN_PLACES.filter((p) => areaInEdition(catalog?.areas?.[p.areaId], edition)).map((p) => ({
      id: p.id, areaId: p.areaId, x: p.x, y: p.y, r: p.r,
      kind: 'town', name: words().PLACE_WORDS[p.id], status: catalog?.areas?.[p.areaId] ? 'built' : 'soon', camp: null,
      ...placeState(state, catalog, p.areaId, { touch }),
    })),
  ];
  return {
    world: WORLD, regions, island: board.island, star: board.star, lake: board.lake, pond: board.pond,
    river: board.river, paths: board.paths, bridge: board.bridge, coast: COAST, gateways: GATEWAYS,
  };
}

// Every circle a tap can land on, in drawing order: each region's, then the
// island's star (which leads to the Pines).
export function tapTargets(model) {
  return [
    ...model.regions.map(({ areaId, x, y, r }) => ({ areaId, x, y, r })),
    { areaId: model.island.areaId, x: STAR.x, y: STAR.y, r: ISLAND_HIT_R },
  ];
}

// Where the map centres when it opens: today's place, else the town.
export function focusOf(model) {
  const at = model.regions.find((r) => r.selected) ?? model.regions.find((r) => r.id === 'town');
  return [at.x, at.y];
}
