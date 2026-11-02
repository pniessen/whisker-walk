import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// gm-park-2 sat on the oak branch perch's own (x, z) — the trunk's axis — at
// y 2.1: inside the trunk and the canopy, hidden from every side. It now sits
// out on a low limb on the far side from the bench (where a villager stands),
// under the canopy, and a cat on the branch perch still catches it.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, k) => (k === 'getImageData'
        ? (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
        : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {}),
      set: () => true,
    }),
  }),
});
const { build } = await import('../src/world/park.js');
const { GOLD_MICE, createGoldMice } = await import('../src/goldmice.js');

const OAK = { x: 4.5, z: 27.3, scale: 1.1 };
const BODY_R = 0.12; // goldmice.js's body sphere
const BOB = 0.05; // its update() bob

function park() {
  const scene = new THREE.Scene();
  const area = build(scene);
  scene.updateMatrixWorld(true);
  const oak = scene.children.find((o) => o.isGroup && Math.abs(o.position.x - OAK.x) < 1e-6 && Math.abs(o.position.z - OAK.z) < 1e-6);
  return { scene, area, oak };
}

describe('the park oak golden mouse (gm-park-2)', () => {
  const mouse = GOLD_MICE.park.find((m) => m.id === 'gm-park-2');

  it('is clear of the trunk', () => {
    // trunk: CylinderGeometry(0.25, 0.35, 2) scaled 1.1; at the mouse's height
    // it is no wider than its base radius 0.35 * 1.1
    const d = Math.hypot(mouse.x - OAK.x, mouse.z - OAK.z);
    expect(d - BODY_R).toBeGreaterThan(0.35 * OAK.scale + 0.05);
  });

  it('sits under the canopy, not in it', () => {
    const { oak } = park();
    const canopy = oak.children[1];
    const rc = new THREE.Raycaster(new THREE.Vector3(mouse.x, 0.3, mouse.z), new THREE.Vector3(0, 1, 0));
    const hit = rc.intersectObject(canopy)[0];
    expect(hit).toBeTruthy();
    expect(mouse.y + BODY_R + BOB).toBeLessThan(hit.point.y - 0.03);
  });

  it('rests on a limb of the oak', () => {
    const { oak } = park();
    const limb = oak.getObjectByName('oakLimb');
    expect(limb).toBeTruthy();
    const box = new THREE.Box3().setFromObject(limb);
    expect(box.containsPoint(new THREE.Vector3(mouse.x, box.min.y + 0.01, mouse.z))).toBe(true);
    // its top just under the mouse's belly, never through it
    expect(box.max.y).toBeLessThanOrEqual(mouse.y - BODY_R + 0.06);
    expect(box.max.y).toBeGreaterThan(mouse.y - BODY_R - 0.1);
  });

  it('is caught from the branch perch, and not from the bench or the grass', () => {
    const { area } = park();
    const branch = area.perches.find((p) => p.label === 'oak branch lookout');
    const bench = area.perches.find((p) => p.x === 3 && p.z === 26);
    const gm = createGoldMice({ add() {}, remove() {} }, 'park', new Set(['gm-park-1', 'gm-park-3']));
    expect(gm.checkFind({ x: branch.x, z: branch.z }, branch.y)?.id).toBe('gm-park-2');
    expect(gm.checkFind({ x: bench.x, z: bench.z }, bench.y)).toBeNull();
    expect(gm.checkFind({ x: mouse.x, z: mouse.z }, 0)).toBeNull();
  });
});

// Polish 3 asked for the limb to cast a shadow like the rest of the oak. It
// does, as built for a walk: mergeStaticProps folds it into the trunk's bark
// mesh (same material colour, same top-level Group) and the caster sweep
// makes that one mesh cast, so it costs no extra shadow-pass draw. Where the
// sun puts its shadow, it lies inside the oak's own trunk-and-canopy shadow.
describe('the park oak limb casts with the oak (Polish 3)', () => {
  it('casts after the walk build, merged into the trunk: no extra caster', async () => {
    const { mergeStaticProps } = await import('../src/render/mergeprops.js');
    const { assignShadowCasters } = await import('../src/render/rig.js');
    const { scene, oak } = park();
    const limb = oak.getObjectByName('oakLimb');
    expect(limb).toBeTruthy();
    const limbVerts = limb.geometry.attributes.position.count;
    mergeStaticProps(scene);
    assignShadowCasters(scene);
    const meshes = [];
    oak.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(oak.getObjectByName('oakLimb') ?? null).toBe(null); // folded in
    expect(meshes).toHaveLength(2); // canopy, and trunk + limb
    const bark = meshes.find((m) => m.geometry.attributes.position.count > limbVerts && m.material.color.getHex() === 0x7a5230);
    expect(bark).toBeTruthy();
    expect(bark.castShadow).toBe(true);
    for (const m of meshes) expect(m.castShadow).toBe(true);
  });

  it('a limb on its own still casts under the sweep', async () => {
    const { assignShadowCasters } = await import('../src/render/rig.js');
    const { scene, oak } = park();
    assignShadowCasters(scene);
    expect(oak.getObjectByName('oakLimb').castShadow).toBe(true);
  });
});
