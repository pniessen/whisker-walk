// Stage "treehousebranches" of the Treehouse village (see treehousestages.js): the rope bridge to the Bookshop, the Bell Tower and the firefly supper. T3 puts the six discoveries here
// (the finds, their collectibles), T4 the friendly life and the sound (critters); T5 the wing itself: the drawing of the baskets, the Bookshop's sign, the bell rope and the supper table
// (draw), the second and third letters with their houses and the places the meow's ring goes to (story), the colliders, and the wing's live code (the bell, the strings of lights and the firefly
// supper). T7 adds Nutmeg's post round of the day (treehousejob.js, treehousejoblive.js, treehousejobwords.js). A slot nobody has filled answers null (read by treehouse.js). The critters and the tree's cats moved to the story stage (treehousestagestory.js) with no change of behaviour.
import { ST } from './treehousestages.js';
import { treehouseCollectibles, createTreehouseFindsLife } from './treehousefinds.js';
import { wingColliders, wingPerches, wingStory } from './treehousewingplan.js';
import { drawWing } from './treehousewingparts.js';
import { createWing } from './treehousewinglive.js';
import { createTreeErrandLive } from './treehousejoblive.js';
import { drawCatPlaces } from './treehousecatparts.js';

Object.assign(ST, {
  branches: Object.freeze({
    finds: Object.freeze({ collectibles: treehouseCollectibles, life: createTreehouseFindsLife }),
    colliders: wingColliders,
    perches: wingPerches,
    story: wingStory(),
    draw: (kit, M) => { drawWing(kit, M); drawCatPlaces(kit, M); }, // the wing, then the tree cats' cushion, limb and hollow (same merged buckets)
    wing: createWing,
    errand: createTreeErrandLive, // Nutmeg's post round of the day and its stamp album (milestone T7)
  }),
});
