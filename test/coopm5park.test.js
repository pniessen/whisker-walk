import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5d: the shared place checks (test/helpers/couchplace.js) on the real park.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { placeSuite } = await import('./helpers/couchplace.js');

const { build } = await import('../src/world/park.js');

placeSuite({ id: 'park', build, ready: true });
