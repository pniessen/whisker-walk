import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5d: the shared place checks (test/helpers/couchplace.js) on the real snowville.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { placeSuite } = await import('./helpers/couchplace.js');
await (await import('../src/world/snowvillestages.js')).loadSnowvilleStages();
const { build } = await import('../src/world/snowville.js');

placeSuite({ id: 'snowville', build, ready: true });
