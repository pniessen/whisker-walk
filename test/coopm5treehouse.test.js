import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5d: the shared place checks (test/helpers/couchplace.js) on the real treehouse.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { placeSuite } = await import('./helpers/couchplace.js');
await (await import('../src/world/treehousestages.js')).loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');

placeSuite({ id: 'treehouse', build, ready: true });
