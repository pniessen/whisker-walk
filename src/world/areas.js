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
// so has `house` (the Old House, its step 4, Clan Edition only).
// `den` is not in the catalog; it is built from home.
//
// An AreaPack is { id, world, life }: world is the builder module, life the
// area's live-animal factories ({} when it has none). This file imports
// nothing statically and touches no browser global, so a build script can
// read AREA_ENTRY_MODULES in plain Node.

// The five places with people carry the figure (src/people/) in their own
// download, never in start-up.
const withPeople = (id, world) => Promise.all([world, import('../people/index.js')])
  .then(([w, p]) => ({ id, world: w, life: { createPeopleKit: p.createPeopleKit, lodNearFor: p.lodNearFor } }));

const own = (id, world) => ({ id, world, life: {} });

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
  pines: () => Promise.all([import('./pines.js'), import('./birthdaygathering.js')])
    .then(([world, g]) => ({ id: 'pines', world, life: { planGathering: g.planGathering, gatheringCast: g.gatheringCast, createBirthdayGathering: g.createBirthdayGathering } })),
  gorge: () => import('./gorge.js').then((w) => own('gorge', w)),
  farm: () => Promise.all([import('./farm.js'), import('../farmanimals.js')])
    .then(([world, a]) => ({ id: 'farm', world, life: { createFarmAnimals: a.createFarmAnimals } })),
  fair: () => Promise.all([import('./fair.js'), import('../fairlive.js'), import('../fairshow.js'), import('../people/index.js')])
    .then(([world, live, show, p]) => ({ id: 'fair', world, life: { createFairLive: live.createFairLive, createFairShow: show.createFairShow, createPeopleKit: p.createPeopleKit, lodNearFor: p.lodNearFor } })),
  roofs: () => import('./roofs.js').then((w) => own('roofs', w)),
  market: () => Promise.all([import('./market.js'), import('../marketlive.js'), import('../people/index.js')])
    .then(([world, live, p]) => ({ id: 'market', world, life: { createMarketLive: live.createMarketLive, createPeopleKit: p.createPeopleKit, lodNearFor: p.lodNearFor } })),
  house: () => import('./house.js').then((w) => own('house', w)),
};

// The private family edition (vite --mode family) registers its one place here; in every other build
// the flag is a literal false, the branch is dropped and no family file is bundled. In plain Node
// (build scripts) the flag does not exist, so it reads as false.
if (typeof __PRIVATE_FAMILY__ !== 'undefined' && __PRIVATE_FAMILY__) {
  loaders.family = () => import('../family/index.js').then((w) => own('family', w));
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
  fair: Object.freeze(['src/world/fair.js', 'src/fairlive.js', 'src/fairshow.js', 'src/people/index.js']),
  roofs: Object.freeze(['src/world/roofs.js']),
  market: Object.freeze(['src/world/market.js', 'src/marketlive.js', 'src/people/index.js']),
  house: Object.freeze(['src/world/house.js']),
};
if (typeof __PRIVATE_FAMILY__ !== 'undefined' && __PRIVATE_FAMILY__) {
  entryModules.family = Object.freeze(['src/family/index.js']);
}
export const AREA_ENTRY_MODULES = Object.freeze(entryModules);
