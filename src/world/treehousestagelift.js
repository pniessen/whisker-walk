// Stage "treehouselift" of the Treehouse village (see treehousestages.js): the optional basket lift is not built; the slot carries the beauty round's drawing (milestone T8,
// treehousebeauty.js: the ground's tones and track, flowers, mushrooms, stumps, logs, pennants, vines, autumn leaves and the shafts of light). Read by treehouse.js through ST.lift.
import { ST } from './treehousestages.js';
import { drawBeauty } from './treehousebeauty.js';

Object.assign(ST, { lift: Object.freeze({ draw: drawBeauty }) });
