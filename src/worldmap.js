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
import { placeName, areaInEdition } from './edition.js';
import { words } from './wordset.js';
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
  // Lighthouse Point (milestone 4): on the headland north of the Seaside, on the coast. The design's (1295, 552)
  // r 52 put the coast's point (1315, 540) inside it, so the circle is moved 27 units west and 27 north and
  // drawn r 46 (the Rooftops' and the Old House's, the smallest tap target the map allows).
  { id: 'lighthouse', areaId: 'lighthouse', x: 1268, y: 525, r: 46 },
]);

// Land colours for the street places, as territories.js's LAND is for hers.
export const STREET_LAND = Object.freeze({ park: '#b9dc8f', fair: '#e9b7c9', farm: '#e3cf7e', docks: '#b7b9bf', seaside: '#ecdca8', lighthouse: '#cfdad2' });

// Places inside the town, drawn on top of it: the Rooftops, up the back
// alley's fire escape (draft 2's "Rooftops"), and the Market Square, on the
// town's south-east rim (Market step 4, V19; r 46 as the Rooftops', not the
// ruling's 42, so no tap target is under the island's 92 across, and moved 6
// units off the Docks), and the Old House, on its south-west rim (Old House
// step 4, docs/superpowers/plans/2026-11-21-old-house-step4-into-the-game.md,
// W4), where its front stands in the town: W4's (768, 648) moved 24 units out
// off the town, so its circle (a tap there opens it) keeps off the town's own
// words, as test/worldmap.test.js checks. Their names come from the word
// tables (PLACE_WORDS.roofs, PLACE_WORDS.market, PLACE_WORDS.house).
export const TOWN_PLACES = freezeAll([
  { id: 'roofs', areaId: 'roofs', x: 905, y: 458, r: 46 },
  { id: 'market', areaId: 'market', x: 962, y: 642, r: 46 },
  { id: 'house', areaId: 'house', x: 754, y: 667, r: 46 },
]);

// Their land colours: roof slate, warm cobble, old timber.
export const TOWN_LAND = Object.freeze({ roofs: '#8e9bb0', market: '#d8b48a', house: '#a3876a' });

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
  // The Rooftops' circle lies over the town's north rim: round the east side, in the open.
  { id: 'town-roofs', from: 'neighborhood', to: 'roofs', road: [[946, 520], [980, 508], [984, 468], [951, 455]] },
  // The Market's circle lies over the town's south-east rim: a short road in
  // the gap between the town, the Market and the Docks, clear of all three.
  { id: 'town-market', from: 'neighborhood', to: 'market', road: [[898, 661], [910, 678], [926, 688], [939, 682]] },
  // The Old House's circle lies over the town's south-west rim (W4): from the
  // town's south rim, beside it, to its east edge, in the open between the
  // town, the house and the Docks (picked from a map picture).
  // Lighthouse Point's circle lies north-north-east of the Seaside's, on the coast: a short road in the
  // gap from the Seaside's north-east rim to the Lighthouse's south-west rim.
  { id: 'seaside-lighthouse', from: 'seaside', to: 'lighthouse', road: [[1229, 598], [1233, 587], [1241, 577], [1248, 566]] },
  { id: 'town-house', from: 'neighborhood', to: 'house', road: [[834, 676], [830, 692], [810, 702], [794, 690]] },
].map((g) => Object.freeze({ ...g, road: pts(g.road) })));

// A camp the world map draws somewhere other than CAMP_AT. The Moor's: on
// the Moor's north edge its badge touched the Moor's name, and on a save
// where the Moor is locked it sat on the lock line; no spot on that edge
// clears every label (measured in a browser, every save state). In the bend
// her river makes through the Moor's south side the badge clears every label
// by about 27 units and the river, the lake and the Moor's edge by about 22;
// the gold ring (her own clan's camp) still clears them.
export const WORLD_CAMP_AT = Object.freeze({ moor: Object.freeze([565, 260]) });

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
      const at = r.camp && WORLD_CAMP_AT[r.id];
      return { ...r, kind: 'board', ...(at ? { camp: { ...r.camp, x: at[0], y: at[1] } } : {}) };
    }),
    ...STREET_PLACES.map((p) => ({
      id: p.id, areaId: p.areaId, x: p.x, y: p.y, r: p.r,
      // (a street place the catalog does not have yet is not built)
      kind: 'street', name: placeName(p.areaId, edition, catalog), status: catalog?.areas?.[p.areaId] ? 'built' : 'soon', camp: null,
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
