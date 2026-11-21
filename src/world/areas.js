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
// `roofs` is here so a walk can build it, and nowhere a child picks from:
// every list a child sees comes from CATALOG.areas, which has no Rooftops row
// until step 4. `market` is the same (?market=1 only, no row until its step 4). `den` is not in the catalog either; it is built from home.
//
// An AreaPack is { id, world, life }: world is the builder module, life the
// area's live-animal factories ({} when it has none). This file imports
// nothing statically and touches no browser global, so a build script can
// read AREA_ENTRY_MODULES in plain Node.

const own = (id, world) => ({ id, world, life: {} });

export const AREA_LOADERS = Object.freeze({
  neighborhood: () => import('./neighborhood.js').then((w) => own('neighborhood', w)),
  park: () => import('./park.js').then((w) => own('park', w)),
  seaside: () => import('./seaside.js').then((w) => own('seaside', w)),
  den: () => import('./den.js').then((w) => own('den', w)),
  docks: () => import('./docks.js').then((w) => own('docks', w)),
  woods: () => import('./woods.js').then((w) => own('woods', w)),
  river: () => import('./river.js').then((w) => own('river', w)),
  moor: () => import('./moor.js').then((w) => own('moor', w)),
  pines: () => import('./pines.js').then((w) => own('pines', w)),
  gorge: () => import('./gorge.js').then((w) => own('gorge', w)),
  farm: () => Promise.all([import('./farm.js'), import('../farmanimals.js')])
    .then(([world, a]) => ({ id: 'farm', world, life: { createFarmAnimals: a.createFarmAnimals } })),
  fair: () => Promise.all([import('./fair.js'), import('../fairlive.js'), import('../fairshow.js')])
    .then(([world, live, show]) => ({ id: 'fair', world, life: { createFairLive: live.createFairLive, createFairShow: show.createFairShow } })),
  roofs: () => import('./roofs.js').then((w) => own('roofs', w)),
  market: () => Promise.all([import('./market.js'), import('../marketlive.js')])
    .then(([world, live]) => ({ id: 'market', world, life: { createMarketLive: live.createMarketLive } })),
});

export const AREA_ENTRY_MODULES = Object.freeze({
  neighborhood: Object.freeze(['src/world/neighborhood.js']),
  park: Object.freeze(['src/world/park.js']),
  seaside: Object.freeze(['src/world/seaside.js']),
  den: Object.freeze(['src/world/den.js']),
  docks: Object.freeze(['src/world/docks.js']),
  woods: Object.freeze(['src/world/woods.js']),
  river: Object.freeze(['src/world/river.js']),
  moor: Object.freeze(['src/world/moor.js']),
  pines: Object.freeze(['src/world/pines.js']),
  gorge: Object.freeze(['src/world/gorge.js']),
  farm: Object.freeze(['src/world/farm.js', 'src/farmanimals.js']),
  fair: Object.freeze(['src/world/fair.js', 'src/fairlive.js', 'src/fairshow.js']),
  roofs: Object.freeze(['src/world/roofs.js']),
  market: Object.freeze(['src/world/market.js', 'src/marketlive.js']),
});
