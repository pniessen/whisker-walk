// The world map: every place in one picture, as data, and the model Change
// place draws. Pure: no DOM, no THREE, nothing written to the save.
//
// The world is 1500 x 880 board units. Its west part is the older
// playtester's own territory board (src/territories.js, 1000 x 700), kept
// exactly as she drew it: every coordinate, her paths, the river, the lake
// and the bridge are read from there and never moved or copied here. The
// town's street neighbours sit east of it and the sea east of them, as draft 2
// lays them out (docs/superpowers/specs/img/2026-11-19-world-map-draft-2.svg,
// its map group without the title strip).
//
// GATEWAYS are the roads between places draft 2 joins. Step 2 draws them as
// small marks only; they are ready for step 3, which gives them gates and
// states.
//
// Not on the map: the den (home, a Menu tile), the Rooftops and the House
// (not built yet), and today's border posts.
import { placeName } from './edition.js';
import { STAR, territoryMapModel, placeState } from './territories.js';

export const WORLD = Object.freeze({ w: 1500, h: 880 });

const freezeAll = (list) => Object.freeze(list.map((t) => Object.freeze(t)));
const pts = (list) => Object.freeze(list.map((p) => Object.freeze(p)));

// The town's street neighbours, each a walkable area (id = its CATALOG.areas id).
export const STREET_PLACES = freezeAll([
  { id: 'park', areaId: 'park', x: 1080, y: 470, r: 90 },
  { id: 'fair', areaId: 'fair', x: 1060, y: 230, r: 85 },
  { id: 'farm', areaId: 'farm', x: 1235, y: 320, r: 85 },
  { id: 'docks', areaId: 'docks', x: 900, y: 770, r: 80 },
  { id: 'seaside', areaId: 'seaside', x: 1185, y: 680, r: 90 },
]);

// Land colours for the street places, as territories.js's LAND is for hers.
export const STREET_LAND = Object.freeze({ park: '#b9dc8f', fair: '#e9b7c9', farm: '#e3cf7e', docks: '#b7b9bf', seaside: '#ecdca8' });

// The coast, west edge of the sea: the points of a cubic chain,
// M p0 C p1 p2 p3 C p4 p5 p6 C p7 p8 p9, closed along the world's east and
// south edges (L1500 880 L1500 0 Z).
export const COAST = pts([[1340, 0], [1320, 160], [1360, 300], [1335, 430], [1315, 540], [1350, 640], [1310, 730], [1280, 800], [1180, 860], [1000, 880]]);

// The roads between places: from and to are area ids, road is one cubic
// (M p0 C p1 p2 p3) from the edge of `from` to the edge of `to`. The Park,
// Fairground, Farm and Seaside are entered from their south side, as their
// walks are.
export const GATEWAYS = Object.freeze([
  { id: 'town-park', from: 'neighborhood', to: 'park', road: [[952, 570], [1000, 580], [1060, 590], [1080, 560]] },
  { id: 'park-fair', from: 'park', to: 'fair', road: [[1080, 380], [1080, 350], [1060, 340], [1060, 315]] },
  { id: 'park-farm', from: 'park', to: 'farm', road: [[1168, 450], [1210, 440], [1240, 430], [1235, 405]] },
  { id: 'town-docks', from: 'neighborhood', to: 'docks', road: [[860, 676], [870, 700], [885, 700], [892, 690]] },
  { id: 'docks-seaside', from: 'docks', to: 'seaside', road: [[980, 780], [1040, 790], [1110, 790], [1140, 765]] },
].map((g) => Object.freeze({ ...g, road: pts(g.road) })));

// The island's star is a tap target of its own, 92 across: the smallest on
// the map, and still at least 44 px at the map's least zoom.
export const ISLAND_HIT_R = 46;

// What the world map shows for this save: her board's regions (kind 'board',
// from territoryMapModel), then the street places (kind 'street'), each with
// its name from the word tables and its state from placeState.
export function worldMapModel(state, catalog) {
  const board = territoryMapModel(state, catalog);
  const edition = state?.edition;
  const regions = [
    ...board.regions.map((r) => ({ ...r, kind: 'board' })),
    ...STREET_PLACES.map((p) => ({
      id: p.id, areaId: p.areaId, x: p.x, y: p.y, r: p.r,
      // (a street place the catalog does not have yet is not built)
      kind: 'street', name: placeName(p.areaId, edition, catalog), status: catalog?.areas?.[p.areaId] ? 'built' : 'soon', camp: null,
      ...placeState(state, catalog, p.areaId),
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
