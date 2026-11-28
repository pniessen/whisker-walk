// Stage "treehousestory" of the Treehouse village (see treehousestages.js): the walk's life side, made once a walk. T4's friendly life and sound (treehousecritters.js: the songbirds, owl, fireflies,
// leaves, creak and chime) and the tree's four low-poly cats (treehousecats.js). They moved out of the branches stage with no change of behaviour: treehouse.js calls them through ST.story inside its life,
// which runs after the area loader has awaited every stage with the base chunk.
import { ST } from './treehousestages.js';
import { createTreehouseCritters } from './treehousecritters.js';
import { createTreehouseCats } from './treehousecats.js';

Object.assign(ST, { story: Object.freeze({ critters: createTreehouseCritters, cats: createTreehouseCats }) });
