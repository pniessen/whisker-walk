// Stage "treehousebranches" of the Treehouse village (see treehousestages.js): the rope bridge to the Bookshop, the Bell Tower and the firefly supper. T3 puts the six discoveries here
// (the finds, their collectibles), T4 the friendly life and the sound (critters); T5 the wing itself: the drawing of the baskets, the Bookshop's sign, the bell rope and the supper table
// (draw), the second and third letters with their houses and the places the meow's ring goes to (story), the colliders, and the wing's live code (the bell, the strings of lights and the firefly
// supper). T7 adds Nutmeg's post round of the day (treehousejob.js, treehousejoblive.js, treehousejobwords.js). A slot nobody has filled answers null (read by treehouse.js).
import { ST } from './treehousestages.js';
import { treehouseCollectibles, createTreehouseFindsLife } from './treehousefinds.js';
import { createTreehouseCritters } from './treehousecritters.js';
import { wingColliders, wingPerches, wingStory } from './treehousewingplan.js';
import { drawWing } from './treehousewingparts.js';
import { createWing } from './treehousewinglive.js';
import { createTreeErrandLive } from './treehousejoblive.js';
import { drawCatPlaces } from './treehousecatparts.js';

// treehousecats.js reaches the walk's cat model, so it stays a file of its own, asked for when the life starts (the stage chunk itself never imports it).
function createCatsLazy(ctx) {
  let inner = null;
  let gone = false;
  const ready = import('./treehousecats.js').then((m) => { if (!gone) inner = m.createTreehouseCats(ctx); }).catch(() => {}); // decoration: a place that cannot make them simply has none
  return { ready, get cats() { return inner?.cats ?? []; }, update: (dt, t, p) => inner?.update(dt, t, p), dispose() { gone = true; inner?.dispose(); } };
}

Object.assign(ST, {
  branches: Object.freeze({
    finds: Object.freeze({ collectibles: treehouseCollectibles, life: createTreehouseFindsLife }),
    critters: createTreehouseCritters,
    colliders: wingColliders,
    perches: wingPerches,
    story: wingStory(),
    draw: (kit, M) => { drawWing(kit, M); drawCatPlaces(kit, M); }, // the wing, then the tree cats' cushion, limb and hollow (same merged buckets)
    cats: createCatsLazy, // four friendly cats of the tree (treehousecats.js, its own lazy file)
    wing: createWing,
    errand: createTreeErrandLive, // Nutmeg's post round of the day and its stamp album (milestone T7)
  }),
});
