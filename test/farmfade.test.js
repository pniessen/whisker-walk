// The Farm's buildings and the camera's see-through rule (treefade.js).
// Owner's report, 2026-11-19: walking up to the barn's big white doors made the
// whole barn vanish. The barn's solid block is made of circles, so at the doors
// the cat's middle comes a hand's width inside the barn's box, and the rule
// "the line from the camera to the cat meets the box" then held.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { build } = await import('../src/world/farm.js');
const { createTreeFade, findFadeOccluders } = await import('../src/treefade.js');
const { CAT_RADIUS } = await import('../src/player.js');

function farm() {
  const scene = new THREE.Scene();
  const area = build(scene, {});
  const entries = findFadeOccluders(scene).filter((e) => e.box);
  return { scene, area, entries };
}
// where the collider push would hold a cat walking from (x, z0) straight toward z1
function pushedTo(area, x, z0, z1) {
  let z = z0;
  const step = z1 < z0 ? -0.05 : 0.05;
  for (let i = 0; i < 400; i++) {
    const nz = z + step;
    if (area.colliders.some((c) => Math.hypot(x - c.x, nz - c.z) < c.r + CAT_RADIUS)) break;
    z = nz;
  }
  return z;
}

describe('the Farm: a building does not vanish because the cat walks up to it', () => {
  it('the barn stays solid for a cat at its big doors, anywhere along the front', () => {
    const { area, entries } = farm();
    const barn = entries.find((e) => e.obj.name === 'barn');
    expect(barn).toBeTruthy();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
    for (let x = barn.box.minX + 0.5; x <= barn.box.maxX - 0.5; x += 0.5) {
      if (Math.abs(x - 5.5) < 1.6) continue; // the hay bales stand here
      const z = pushedTo(area, x, barn.box.maxZ + 4, barn.box.minZ);
      const fade = createTreeFade(entries);
      camera.position.set(x, 2.6, z + 4.5); // the follow camera, behind her
      fade.update(1, camera, { x, y: 0.35, z });
      expect(fade.faded().has(barn.obj), `at x ${x.toFixed(1)} the cat stops at z ${z.toFixed(2)}, box front ${barn.box.maxZ.toFixed(2)}`).toBe(false);
      fade.dispose();
    }
  });

  it('no Farm building fades for a cat walking up to any of its four sides', () => {
    const { area, entries } = farm();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
    const bad = [];
    for (const e of entries) {
      const b = e.box;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      // from each side, toward the middle, the camera behind her
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        let x = cx + dx * ((b.maxX - b.minX) / 2 + 4), z = cz + dz * ((b.maxZ - b.minZ) / 2 + 4);
        for (let i = 0; i < 400; i++) {
          const nx = x - dx * 0.05, nz = z - dz * 0.05;
          if (area.colliders.some((c) => Math.hypot(nx - c.x, nz - c.z) < c.r + CAT_RADIUS)) break;
          if (Math.abs(nx - cx) < 0.05 && Math.abs(nz - cz) < 0.05) break; // walked right in (an open shed)
          x = nx; z = nz;
        }
        const inside = x > b.minX + 0.6 && x < b.maxX - 0.6 && z > b.minZ + 0.6 && z < b.maxZ - 0.6;
        if (inside) continue; // she is properly inside an open building: fading its walls is right
        const fade = createTreeFade(entries);
        camera.position.set(x + dx * 4.5, 2.6, z + dz * 4.5);
        fade.update(1, camera, { x, y: 0.35, z });
        if (fade.faded().has(e.obj)) bad.push(`${e.obj.name} from ${dx},${dz}: cat at ${x.toFixed(2)},${z.toFixed(2)}`);
        fade.dispose();
      }
    }
    expect(bad).toEqual([]);
  });

  it('an open shed stays solid when the cat walks in and the camera looks in after her', () => {
    const { entries } = farm();
    const shed = entries.find((e) => e.obj.name === 'tractorShed');
    const b = shed.box;
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
    // the shed is open to the yard (its west side): she stands 2 m in, by the tractor's nose
    const z = (b.minZ + b.maxZ) / 2 + 2.2; // beside the tractor, not in it
    const cat = { x: b.minX + 2, y: 0.35, z };
    const fade = createTreeFade(entries);
    camera.position.set(cat.x - 4.5, 2.2, z);
    fade.update(1, camera, cat);
    expect(fade.faded().has(shed.obj)).toBe(false);
    fade.dispose();
  });

  it('the barn still fades when it really stands between the camera and the cat', () => {
    const { entries } = farm();
    const barn = entries.find((e) => e.obj.name === 'barn');
    const b = barn.box;
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
    const fade = createTreeFade(entries);
    camera.position.set(0, 2.6, b.maxZ + 3); // in the yard, looking north over the barn
    fade.update(1, camera, { x: 0, y: 0.35, z: b.minZ - 1.5 }); // the cat behind the barn
    expect(fade.faded().has(barn.obj)).toBe(true);
    fade.dispose();
  });
});

describe('the Farm: the first hay bale can be jumped onto without hunting for the spot', () => {
  it('there is at least a square metre to jump from, half a metre deep', async () => {
    const { area } = farm();
    const { BASE_CLIMB_BUDGET, canReach } = await import('../src/climbing.js');
    const [bale1] = area.anchors.baleRoute;
    const perch = area.perches.find((p) => p.x === bale1.x && p.z === bale1.z && p.y === bale1.y);
    expect(perch).toBeTruthy();
    const free = (x, z) => !area.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + CAT_RADIUS);
    let cells = 0;
    for (let x = perch.x - 1.5; x <= perch.x + 1.5; x += 0.05) {
      for (let z = perch.z - 1.5; z <= perch.z + 1.5; z += 0.05) {
        if (free(x, z) && canReach(perch, { x, z }, 0, BASE_CLIMB_BUDGET)) cells++;
      }
    }
    expect(cells * 0.0025).toBeGreaterThan(1.0);
    // straight out from the bale toward the yard (+z): a band at least 0.5 m deep
    let depth = 0;
    for (let r = 0.05; r < 1.5; r += 0.05) if (free(perch.x, perch.z + r) && canReach(perch, { x: perch.x, z: perch.z + r }, 0, BASE_CLIMB_BUDGET)) depth += 0.05;
    expect(depth).toBeGreaterThan(0.5);
  });
});
