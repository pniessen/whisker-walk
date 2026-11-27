import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5d: the shared place checks (test/helpers/couchplace.js) on the real jungle.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { placeSuite } = await import('./helpers/couchplace.js');
await (await import('../src/world/junglestages.js')).loadJungleStages();
const { build } = await import('../src/world/jungle.js');

placeSuite({ id: 'jungle', build, ready: true });
