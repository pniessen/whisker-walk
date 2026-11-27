import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5d: the shared place checks (test/helpers/couchplace.js) on the real crystal.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { placeSuite } = await import('./helpers/couchplace.js');
await (await import('../src/world/crystalstages.js')).loadCrystalStages();
const { build } = await import('../src/world/crystal.js');

placeSuite({ id: 'crystal', build, ready: true });
