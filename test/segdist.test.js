import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';

// Polish 3: the segment-distance helper the world files each kept a copy of
// is one shared helper now (src/segdist.js), and the Pines places its pines
// once per load instead of three times a build. A pure refactor: these
// digests were taken from the code before it, over every scatter list, every
// built area's colliders, perches and critters, and keepOutPoint on a grid,
// so a single moved tree, reed or push changes them.

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { segDist } = await import('../src/segdist.js');
const pines = await import('../src/world/pines.js');
const island = await import('../src/world/island.js');
const woods = await import('../src/world/woods.js');
const river = await import('../src/world/river.js');
const moor = await import('../src/world/moor.js');
const { keepOutPoint } = await import('../src/keepout.js');

const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

function built(mod) {
  const area = mod.build(new THREE.Scene());
  const pts = [];
  for (let x = -50; x <= 50; x += 1.7) for (let z = -50; z <= 50; z += 1.7) pts.push(keepOutPoint(area, x, z));
  return { colliders: area.colliders, perches: area.perches, critters: area.critterSpawns, keepOut: pts };
}

describe('segDist (shared)', () => {
  it('is the distance to the nearest point of the segment', () => {
    expect(segDist(0, 1, -1, 0, 1, 0)).toBe(1);
    expect(segDist(3, 4, -1, 0, 0, 0)).toBe(Math.hypot(3, 4));
    expect(segDist(-4, 0, 0, 0, 2, 0)).toBe(4);
  });
});

describe('world scatter is unchanged by the refactor (Polish 3)', () => {
  it('the Pines and its island', () => {
    expect(digest([pines.pinesTrees(), pines.pinesUndergrowth(), pines.pinesReeds(), pines.pinesLilyPads(), island.islandReeds()]))
      // the moved camp pine (pines.js CAMP_PINE_TO, owner's decision 2026-11-04) changes the tree list; was '57cb6f6fa275e46c'
      .toBe('e71b0eb17b86e5ee');
    // built(pines) includes the camp's den and rock colliders, which moved when the owner
    // turned the Pines camp south and moved its east pine (CAMP_TURN.pines, decision 2026-11-04); was '1f4b3c73d9457b68'.
    expect(digest(built(pines))).toBe('869bad9ba6d02233');
  });
  it('the Woods', () => {
    expect(digest([woods.woodsTreeSpots(), woods.woodsUndergrowth()])).toBe('c359ee70220b9532');
    expect(digest(built(woods))).toBe('062c5b96c7ed3787');
  });
  it('the River', () => {
    expect(digest([river.riverTrees(), river.riverReeds(), river.riverLilyPads()])).toBe('47af40bd00a6b4d5');
    expect(digest(built(river))).toBe('6dd046e515764f9f');
  });
  it('the Moor', () => {
    // c79efe2bbc4eee62 until the trail to the Gorge (Gorge part 2, Task 12)
    // cleared one heather and one gorse off it (test/bordertrail.test.js pins which).
    expect(digest([moor.moorTrees(), moor.moorHeather(), moor.moorGorse(), moor.moorReeds()])).toBe('5c1db881dc530e87');
    expect(digest(built(moor))).toBe('3465a17d1be5b096');
  });
});

describe('the Pines places its pines once (Polish 3)', () => {
  it('pinesTrees hands back one frozen placement, however often a build asks', () => {
    const a = pines.pinesTrees();
    expect(pines.pinesTrees()).toBe(a);
    expect(Object.isFrozen(a.near) && Object.isFrozen(a.stand) && Object.isFrozen(a.near[0])).toBe(true);
    pines.build(new THREE.Scene());
    expect(pines.pinesTrees()).toBe(a);
  });
});
