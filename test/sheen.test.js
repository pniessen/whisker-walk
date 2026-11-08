import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// polish-docks: the harbour dressing (src/world/docksdressing.js). Clusters of
// crates, barrels, nets, rope and lobster pots along the map edges and tucked
// against the buildings — scenery only. These cases hold the three things it
// must never do: move a Math.random draw (every THREE object draws four for its
// uuid, and the flat trace seeds Math.random per area), add a record the game
// reads, or stand on anything a cat needs to reach or walk along.

// Same headless stub every world test uses (see test/docks.test.js).
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

// polish-sheen (Pass 9, 9-4): matte Docks cobbles, lit skyline panes at dusk,
// deeper mottled lawns, a darker dusk beach.
const docks = await import('../src/world/docks.js');
const park = await import('../src/world/park.js');
const neighborhood = await import('../src/world/neighborhood.js');
const seaside = await import('../src/world/seaside.js');
const dressing = await import('../src/world/docksdressing.js');
const { duskLawnColor, tintDuskLawn } = await import('../src/render/dusk.js');

describe('polish-sheen', () => {
  it('the Docks ground is matte, so the low sun does not glare off it', () => {
    const scene = new THREE.Scene();
    docks.build(scene);
    const ground = scene.children.find((c) => c.userData?.ground && c.userData.warmStone);
    expect(ground).toBeTruthy();
    expect(ground.material.roughness).toBe(dressing.WARM_STONE_FINISH.roughness);
    expect(ground.material.roughness).toBeGreaterThanOrEqual(0.85);
    expect(ground.material.envMapIntensity).toBeLessThan(1);
  }, 120_000);

  it('the skyline carries one hidden lit-pane child for dusk, in front of its windows', () => {
    const scene = new THREE.Scene();
    docks.build(scene);
    const sky = scene.getObjectByName('docksSkyline');
    expect(sky.children).toHaveLength(1);
    const lights = sky.children[0];
    expect(lights.name).toBe('docksSkylineLights');
    expect(lights.visible).toBe(false);
    expect(lights.userData).toMatchObject({ duskWindow: true, noCast: true, noMerge: true });
    expect(lights.material.isMeshBasicMaterial).toBe(true);
    expect(lights.material.fog).toBe(false);
    expect(lights.material.toneMapped).toBe(false);
    const tris = lights.geometry.attributes.position.count / 3;
    expect(tris).toBeGreaterThan(60);
    expect(tris).toBeLessThanOrEqual(2000);
    // every lit pane stands outside the walkable bounds, up a wall
    const pos = lights.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      expect(Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getZ(i)))).toBeGreaterThan(40);
      expect(pos.getY(i)).toBeGreaterThan(1);
    }
    // deterministic: the same panes every build
    expect(dressing.skylineLitPanes().reduce((s, g) => s + g.attributes.position.count, 0)).toBe(pos.count);
  }, 120_000);

  it('the lawns are the deeper greens, and their mottle is gentle and repeatable', () => {
    expect(park.build(new THREE.Scene()).groundBounce).toBe(park.PARK_LAWN);
    expect(neighborhood.build(new THREE.Scene()).groundBounce).toBe(neighborhood.NEIGHBORHOOD_LAWN);
    let lo = 9, hi = 0;
    for (const fn of [park.parkLawnTint, neighborhood.neighborhoodLawnTint]) {
      for (let x = -55; x <= 55; x += 5) for (let z = -55; z <= 55; z += 5) {
        const m = fn(x, z);
        expect(fn(x, z)).toEqual(m);
        for (const v of m) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0.85);
    expect(hi).toBeLessThanOrEqual(1.08);
    expect(hi - lo).toBeGreaterThan(0.1); // it does vary
  });

  it('the beach sand darkens a quarter more than a lawn at dusk', () => {
    const scene = new THREE.Scene();
    seaside.build(scene);
    // the dry beach (the 140 m ground plane), the wet band and the paint
    const sandy = scene.children.filter((c) => c.userData?.ground && c.userData.duskLawnTint === seaside.SAND_DUSK_TINT);
    expect(sandy).toHaveLength(3); // + beachPaint, the paint lying on it
    expect(sandy.some((c) => c.geometry.parameters?.width === 140)).toBe(true);
    const look = { lawnTint: { desat: 0.25, dark: 0.72, cool: [0.96, 1, 1.08] } };
    const sand = new THREE.Color(seaside.BEACH);
    const lawnLike = duskLawnColor(sand, look);
    const beach = duskLawnColor(sand, { lawnTint: { ...look.lawnTint, ...seaside.SAND_DUSK_TINT } });
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(lum(beach) / lum(lawnLike)).toBeLessThan(0.8);
    expect(beach.b / beach.r).toBeGreaterThan(lawnLike.b / lawnLike.r); // cooler
    expect(typeof tintDuskLawn).toBe('function');
  }, 120_000);
});
