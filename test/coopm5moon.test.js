import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5d: the shared place checks (test/helpers/couchplace.js) on the real Moon.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { placeSuite } = await import('./helpers/couchplace.js');
await (await import('../src/world/moonstages.js')).loadMoonStages();
const { build } = await import('../src/world/moon.js');

// The walk lip near (-35, -37) is fixed in moonplan.js (hillAdd: the top disc stops where the ramp band begins), so no known lip is passed.
const on = (await import('../src/coop/table.js')).COOP_READY.moon;
if (on) placeSuite({ id: 'moon', build, ready: true });
else (await import('vitest')).it('waits for the Moon row to flip', () => {});
