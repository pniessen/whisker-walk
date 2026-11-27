// Stage "treehousebranches" of the Treehouse village (see treehousestages.js): the rope bridge to the Bookshop, the Bell Tower and the firefly supper. T3 puts the six discoveries here
// (the finds, their collectibles); the bridge, bell tower and supper come with T5, which keeps `finds` in this slot. A slot nobody has filled answers null (read by treehouse.js).
import { ST } from './treehousestages.js';
import { treehouseCollectibles, createTreehouseFindsLife } from './treehousefinds.js';

Object.assign(ST, { branches: Object.freeze({ finds: Object.freeze({ collectibles: treehouseCollectibles, life: createTreehouseFindsLife }) }) });
