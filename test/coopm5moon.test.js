import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5d: the shared place checks (test/helpers/couchplace.js) on the real Moon.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { placeSuite } = await import('./helpers/couchplace.js');
await (await import('../src/world/moonstages.js')).loadMoonStages();
const { build } = await import('../src/world/moon.js');

// Known gap, not a coop fault: the walk of the Moon heightfield (moonplan.js) has a 0.16 m lip near (-35, -37), y 4.84 up to a
// flat top at 5.0, steeper than the walk rule allows per frame (0.12 + 0.5 per metre). A solo cat stops there too; cat two
// is clear of it (probed: free to the +x and -z, blocked to -x and +z by the lip alone). Fix belongs in the Moon chunk.
// Runs once the Moon row of COOP_READY is flipped (it also needs a coopbudget measure and the Moon-closed tests updated).
const on = (await import('../src/coop/table.js')).COOP_READY.moon;
if (on) placeSuite({ id: 'moon', build, ready: true, knownLip: { x: -35, z: -37, why: 'moonplan heightfield lip' } });
else (await import('vitest')).it('waits for the Moon row to flip', () => {});
