// Stage "treehouselift" of the Treehouse village (see treehousestages.js): the optional basket lift is not built; the slot carries the beauty round's drawing (milestone T8,
// treehousebeauty.js: the ground's tones and track, flowers, mushrooms, stumps, logs, pennants, vines, autumn leaves and the shafts of light). Read by treehouse.js through ST.lift.
import { ST } from './treehousestages.js';
import { drawBeauty } from './treehousebeauty.js';
import { drawNature } from './treehousenature.js';
import { drawGrass } from './treehousegrass.js';
import { drawTrim } from './treehousetrim.js';
import { skyPatch } from './treehouseglow.js';
import { drawTales } from './treehousetales.js';

// Round two (2026-11-27): realistic trees, shrubs, the leaf canopy and the houses' dressing (treehousenature.js), then grass (treehousegrass.js); treehouse.js leaves its plain rim, ferns and canopy out when this is in.
function draw(kit, M) { skyPatch(M); drawBeauty(kit, M); drawNature(kit, M); drawGrass(kit, M); drawTrim(kit, M); drawTales(kit, M); }
Object.assign(ST, { lift: Object.freeze({ draw }) });
