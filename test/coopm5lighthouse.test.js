import { it, expect } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5d: Lighthouse Point. The shared place checks (test/helpers/couchplace.js) on the real place with its real
// traversal runtime, plus the stair round the tower: it is cat one alone (a traversal), cat two waits at its foot and is
// hopped onto the friend own ledge when she stands up on the gallery, never left in the stair or put on the plateau under it.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { placeSuite } = await import('./helpers/couchplace.js');
const { set, pad } = await import('./helpers/couchrig.js');
const { build } = await import('../src/world/lighthouse.js');
const { LANDINGS } = await import('../src/world/lighthouseplan.js');
const { createTraversalLive } = await import('../src/traversallive.js');
const { BASE_ABILITIES } = await import('../src/traversal.js');
const { isWalkableAt } = await import('../src/player.js');

const P = placeSuite({
  id: 'lighthouse', build, ready: true,
  wire: (s, record) => { s.traversal = createTraversalLive(record.traversal, { ground: record.ground, abilities: () => BASE_ABILITIES }); },
});

it('the stair: cat one on the gallery, cat two at the foot: cat two ends on the gallery level, on clear floor, never in the stair', () => {
  const foot = LANDINGS[0], top = LANDINGS[3];
  const { r, s } = P.start(foot);
  s.cat.position.set(top.x, top.y ?? P.ground.y(top.x, top.z), top.z);
  set(r, pad(0), pad(1));
  r.tick(60 * 40);
  const one = s.cat.position, two = r.two().group.position;
  expect(Math.abs(one.y - two.y), `one ${one.y} two ${two.y}`).toBeLessThan(1);
  expect(isWalkableAt(s.areaData, two.x, two.z)).toBe(true);
  expect(Math.hypot(one.x - two.x, one.z - two.z)).toBeLessThan(8);
});
