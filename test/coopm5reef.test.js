import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5d: the shared place checks (test/helpers/couchplace.js) on the real Reef, with all three lazy stages in.
// The Reef's own checks (the float, the kick, cat two drawn up in the water, the camera, the story) are in test/coopreef.test.js.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { placeSuite } = await import('./helpers/couchplace.js');
await (await import('../src/world/reefstages.js')).loadReefStages();
const { build } = await import('../src/world/reef.js');

placeSuite({ id: 'reef', build, ready: true });
