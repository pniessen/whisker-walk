// The one registry of every walkable area the game can build, as "packs".
//
// An area is real once all of these are done:
//   1. its builder module, src/world/<id>.js, exporting build(scene, opts)
//      (and GRASS_HOOKS if it tints or bares the grass: the grass reads the
//      area's own hooks, it imports no area). Nothing outside the module and
//      this file imports it; facts the rest of the game needs go in a leaf
//      module;
//   2. a line in AREA_LOADERS below (a literal import(), so the bundler makes
//      the chunk) and a line in AREA_ENTRY_MODULES (the files that chunk
//      is made of, which the size budget reads);
//   3. the CATALOG.areas entry + state.walks key in progression.js, which
//      give it a home-base card, a price and an unlock gate.
// An area missing from AREA_LOADERS is a fully built world nothing can call.
// Each area is its own download: `npm run build` prints its size (ceiling
// AREA_GZIP_CEILING_KB in scripts/buildjson.mjs), and test/areas.test.js and
// test/lazybuild.test.js fail if step 1 or 2 was missed.
//
// `roofs` has its own row in CATALOG.areas (Rooftops step 4), so the place
// lists show it, and so has `market` (Market step 4, Clan Edition only), and
// so has `house` (the Old House, its step 4, Clan Edition only), and `lighthouse` (Lighthouse Point, its milestone 4, both editions).
// `den` is not in the catalog; it is built from home.
//
// An AreaPack is { id, world, life }: world is the builder module, life the
// area's live-animal factories ({} when it has none). This file imports
// nothing statically and touches no browser global, so a build script can
// read AREA_ENTRY_MODULES in plain Node.

// The five places with people carry the figure (src/people/) in their own
// download, never in start-up.
const withPeople = (id, world) => Promise.all([world, import('../people/index.js'), walkExtras()])
  .then(([w, p, walk]) => ({ id, world: w, life: { walk, createPeopleKit: p.createPeopleKit, lodNearFor: p.lodNearFor } }));

// The weather, the friends' ghosts, the yard dog, the kitten and the race (game/walkextras.js) are one
// chunk beside the place's, never in start-up. Every pack carries it as life.walk.
const walkExtras = () => Promise.all([import('../game/walkextras.js'), import('../game/walkscene.js'), import('../game/walklive.js')]).then(([a, b, c]) => ({ ...a, ...b, ...c }));
const own = (id, world) => walkExtras().then((walk) => ({ id, world, life: { walk } }));

const loaders = {
  neighborhood: () => withPeople('neighborhood', import('./neighborhood.js')),
  park: () => withPeople('park', import('./park.js')),
  seaside: () => withPeople('seaside', import('./seaside.js')),
  den: () => import('./den.js').then((w) => own('den', w)),
  docks: () => withPeople('docks', import('./docks.js')),
  woods: () => import('./woods.js').then((w) => own('woods', w)),
  river: () => import('./river.js').then((w) => own('river', w)),
  moor: () => import('./moor.js').then((w) => own('moor', w)),
  // The Pines carry her birthday Gathering on the island (birthdaygathering.js).
  pines: () => Promise.all([import('./pines.js'), import('./birthdaygathering.js'), walkExtras()])
    .then(([world, g, walk]) => ({ id: 'pines', world, life: { walk, planGathering: g.planGathering, gatheringCast: g.gatheringCast, createBirthdayGathering: g.createBirthdayGathering } })),
  gorge: () => import('./gorge.js').then((w) => own('gorge', w)),
  farm: () => Promise.all([import('./farm.js'), import('../farmanimals.js'), walkExtras()])
    .then(([world, a, walk]) => ({ id: 'farm', world, life: { walk, createFarmAnimals: a.createFarmAnimals } })),
  fair: () => Promise.all([import('./fair.js'), import('./fairstages.js').then((s) => s.loadFairStages()), import('../people/index.js'), walkExtras()])
    .then(([world, st, p, walk]) => ({ id: 'fair', world, life: { walk, createFairLive: st.live.createFairLive, createFairShow: st.show.createFairShow, createPeopleKit: p.createPeopleKit, lodNearFor: p.lodNearFor } })), // the landing plus the life's two stages (fairstages.js), in parallel
  roofs: () => import('./roofs.js').then((w) => own('roofs', w)),
  market: () => Promise.all([import('./market.js'), import('./marketstages.js').then((s) => s.loadMarketStages()), import('../people/index.js'), walkExtras()])
    .then(([world, st, p, walk]) => ({ id: 'market', world, life: { walk, createMarketLive: st.live.createMarketLive, createPeopleKit: p.createPeopleKit, lodNearFor: p.lodNearFor } })), // the landing plus the life's stages (marketstages.js), in parallel
  house: () => Promise.all([import('./house.js'), import('./housestages.js').then((s) => s.loadHouseStages())]).then(([w]) => own('house', w)), // the landing plus the wing's one stage (housestagewing.js), in parallel
  // Lighthouse Point (a catalog row and the Seaside's gate since its milestone 4; ?lighthouse=1 stays a developer shortcut).
  lighthouse: () => Promise.all([import('./lighthouse.js'), import('./lighthousestages.js').then((s) => s.loadLighthouseStages())]).then(([w]) => own('lighthouse', w)), // the landing plus the life's one stage (lighthousestagestory.js), in parallel
  // The Greenhouse (a catalog row, behind the gates switch, and the Park's archway since its milestone G4; ?greenhouse=1 stays a developer shortcut).
  greenhouse: () => import('./greenhouse.js').then((w) => own('greenhouse', w)),
  // The Moon (?moon=1 only: no catalog row, no gate; its milestone 0 is the seams and a bare plain).
  // Stage A (the landing) is all the walk waits for: the three later stages are fetched in the background right after it is built (moon.js, moonstages.js), nearest-needed first.
  moon: () => import('./moon.js').then((w) => own('moon', w)),
  // The Reef (a catalog row, behind the gates switch, and the Seaside's rock cleft since its milestone R6; ?reef=1 stays a developer shortcut).
  reef: () => Promise.all([import('./reef.js'), import('./reefstages.js').then((s) => s.loadReefStages())]).then(([w]) => own('reef', w)),
  // The Crystal Cave (?crystal=1 and a catalog row behind the gates switch; milestone C0 is the seams and a stub floor).
  crystal: () => Promise.all([import('./crystal.js'), import('./crystalstages.js').then((s) => s.loadCrystalStages())]).then(([w]) => own('crystal', w)),
  // The Treehouse village (a catalog row, an ordinary place after the Farm; milestone T1 is the tree world and two empty stage slots).
  treehouse: () => Promise.all([import('./treehouse.js'), import('./treehousestages.js').then((s) => s.loadTreehouseStages())]).then(([w]) => own('treehouse', w)),
  // Snowville (?snowville=1 and a catalog row behind the gates switch; milestone V1 is the snow world: the village square, the spawn court and its return arch).
  // The Jungle lodge (?jungle=1 and a catalog row behind the gates switch; milestone J1 is the jungle world: the lodge, the ring, the river and the rain).
  jungle: () => Promise.all([import('./jungle.js'), import('./junglestages.js').then((s) => s.loadJungleStages())]).then(([w]) => own('jungle', w)),
  snowville: () => Promise.all([import('./snowville.js'), import('./snowvillestages.js').then((s) => s.loadSnowvilleStages())]).then(([w]) => own('snowville', w)),
};

// The private family edition (vite --mode family) registers its one place here; in every other build
// the flag is a literal false, the branch is dropped and no family file is bundled. In plain Node
// (build scripts) the flag does not exist, so it reads as false.
if (typeof __PRIVATE_FAMILY__ !== 'undefined' && __PRIVATE_FAMILY__) {
  loaders.family = () => Promise.all([import('../family/index.js'), import('./housestages.js').then((s) => s.loadHouseStages())]).then(([w]) => own('family', w));
}

export const AREA_LOADERS = Object.freeze(loaders);

const entryModules = {
  neighborhood: Object.freeze(['src/world/neighborhood.js', 'src/people/index.js']),
  park: Object.freeze(['src/world/park.js', 'src/people/index.js']),
  seaside: Object.freeze(['src/world/seaside.js', 'src/people/index.js']),
  den: Object.freeze(['src/world/den.js']),
  docks: Object.freeze(['src/world/docks.js', 'src/people/index.js']),
  woods: Object.freeze(['src/world/woods.js']),
  river: Object.freeze(['src/world/river.js']),
  moor: Object.freeze(['src/world/moor.js']),
  pines: Object.freeze(['src/world/pines.js', 'src/world/birthdaygathering.js']),
  gorge: Object.freeze(['src/world/gorge.js']),
  farm: Object.freeze(['src/world/farm.js', 'src/farmanimals.js']),
  fair: Object.freeze(['src/world/fair.js', 'src/people/index.js']), // stage A; the two stages (src/fairlive.js, src/fairshow.js) are in STAGED_AREAS (scripts/buildjson.mjs), loaded with it by the loader above
  roofs: Object.freeze(['src/world/roofs.js']),
  market: Object.freeze(['src/world/market.js', 'src/people/index.js']), // stage A; the stages (src/marketlive.js, src/world/marketstagelife.js) are in STAGED_AREAS (scripts/buildjson.mjs), loaded with it by the loader above
  house: Object.freeze(['src/world/house.js']), // stage A; the one stage is in STAGED_AREAS (scripts/buildjson.mjs), loaded with it by the loader above
  lighthouse: Object.freeze(['src/world/lighthouse.js']), // stage A; the one stage is in STAGED_AREAS (scripts/buildjson.mjs), loaded with it by the loader above
  greenhouse: Object.freeze(['src/world/greenhouse.js']),
  moon: Object.freeze(['src/world/moon.js']), // stage A, the only one the loader waits for; the three later stages and the late arrivals' code are MOON_STAGE_ENTRY_MODULES (scripts/buildjson.mjs), fetched in the background after it
  reef: Object.freeze(['src/world/reef.js']), // stage A; the three stages are REEF_STAGE_ENTRY_MODULES (scripts/buildjson.mjs), loaded with it by the loader above
  treehouse: Object.freeze(['src/world/treehouse.js']), // stage A; the two stages are TREEHOUSE_STAGE_ENTRY_MODULES (scripts/buildjson.mjs), loaded with it by the loader above
  crystal: Object.freeze(['src/world/crystal.js']), // stage A; the two stages are CRYSTAL_STAGE_ENTRY_MODULES (scripts/buildjson.mjs), loaded with it by the loader above
  jungle: Object.freeze(['src/world/jungle.js']), // stage A; the two stages are JUNGLE_STAGE_ENTRY_MODULES (scripts/buildjson.mjs), loaded with it by the loader above
  snowville: Object.freeze(['src/world/snowville.js']), // stage A; the two stages are SNOWVILLE_STAGE_ENTRY_MODULES (scripts/buildjson.mjs), loaded with it by the loader above
};
if (typeof __PRIVATE_FAMILY__ !== 'undefined' && __PRIVATE_FAMILY__) {
  entryModules.family = Object.freeze(['src/family/index.js']);
}
export const AREA_ENTRY_MODULES = Object.freeze(entryModules);
