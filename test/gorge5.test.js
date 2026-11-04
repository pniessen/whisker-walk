import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/builder.test.js).
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

const { build, GORGE_FOG, GORGE_SKY, GORGE_MOUTH_ARCHES, mouthArchesFor, caveClear } = await import('../src/world/gorge.js');
const { ROCK_FRAGMENT, ROCK_SHADE } = await import('../src/world/rockshade.js');
const {
  caveMouth, MOUTH_LOW_H, MOUTH_LOW_IN, MOUTH_CAM_H, MOUTH_CAM_HALF,
} = await import('../src/world/caveroom.js');
const { GORGE_CAVES, CORRIDOR_HEADROOM } = await import('../src/world/gorgeshape.js');
const { campLayout, campDressing } = await import('../src/world/camp.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');

describe('polish-gorge5 task 1', () => {
  it('pushes the Gorge day fog out', () => {
    const scene = new THREE.Scene();
    build(scene);
    expect(GORGE_FOG).toEqual({ near: 60, far: 175 });
    expect(scene.fog.near).toBe(60);
    expect(scene.fog.far).toBe(175);
    expect(scene.fog.color.getHex()).toBe(GORGE_SKY.horizon);
  }, 120_000);

  it('fades the flutes and stretches the grain near the camera', () => {
    expect(ROCK_FRAGMENT).toContain('cameraPosition');
    const body = ROCK_FRAGMENT;
    const calls = (body.match(/\bvnoise\s*\(/g) ?? []).length - (body.match(/float\s+vnoise\s*\(/g) ?? []).length;
    expect(calls).toBeLessThanOrEqual(3);
    expect(ROCK_SHADE.nearLo).toBe(1.5);
    expect(ROCK_SHADE.nearHi).toBe(4);
  });
});

// One Gorge build shared by the Task 2 tests that need the real rock.
let built = null;
function gorgeBuilt() {
  if (!built) {
    const scene = new THREE.Scene();
    build(scene);
    built = { scene, rock: scene.getObjectByName('gorgeRock'), rockFaces: scene.getObjectByName('rockFaces') };
  }
  return built;
}

// (u, h, w) of vertex i in an arch record's frame: u along (-nz, nx), h up
// from its floor, w out along its normal.
function local(a, pos, i) {
  const dx = pos[i * 3] - a.x, dz = pos[i * 3 + 2] - a.z;
  return { u: dx * -a.nz + dz * a.nx, h: pos[i * 3 + 1] - a.y, w: dx * a.nx + dz * a.nz };
}
const flat = () => 0;

describe('polish-gorge5 task 2: rounded rock arches', () => {
  it('lists the three cave mouths and the camp den', () => {
    const byId = Object.fromEntries(GORGE_MOUTH_ARCHES.map((a) => [a.id, a]));
    expect(Object.keys(byId)).toEqual(['echo', 'snug', 'glitter', 'campDen']);
    expect(byId.echo).toMatchObject({ x: -18, z: 23.5, y: 0, nx: 1, nz: 0, half: 1.5, headroom: 2.6 });
    expect(byId.snug).toMatchObject({ x: 15, z: 20.2, nx: -1, nz: 0, half: 1.5, headroom: 2.6 });
    expect(byId.glitter).toMatchObject({ x: 34, z: -24.5, y: 12, nx: -1, nz: 0, half: 1.5, headroom: 2.6 });
    expect(byId.campDen).toMatchObject({ x: 20, z: 40, y: 8, nx: -1, nz: 0, half: 3, headroom: 2.6 });
  });

  it('adds one rock arch per cave mouth and the camp den, inside the rock mesh', () => {
    const { rock, rockFaces } = gorgeBuilt();
    const arches = rock.userData.mouthArches;
    expect(Object.keys(arches).sort()).toEqual(['campDen', 'echo', 'glitter', 'snug']);
    for (const n of Object.values(arches)) expect(n).toBeGreaterThan(0);
    const total = Object.values(arches).reduce((s, n) => s + n, 0);
    expect(total).toBeLessThanOrEqual(1100);
    const geo = rockFaces.geometry;
    expect(geo.index).toBeNull();
    const n = geo.getAttribute('position').count;
    expect(geo.getAttribute('color').count).toBe(n);
    expect(geo.getAttribute('normal').count).toBe(n);
    // the arches are the last triangles of the mesh, unit normals, sandstone colours
    const nor = geo.getAttribute('normal').array, col = geo.getAttribute('color').array;
    for (let i = n - total * 3; i < n; i++) {
      expect(Math.abs(Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) - 1)).toBeLessThan(1e-3);
      expect(col[i * 3] + col[i * 3 + 1] + col[i * 3 + 2]).toBeGreaterThan(0.3);
    }
  }, 120_000);

  it('keeps the Gorge guard', () => {
    const { scene } = gorgeBuilt();
    let meshes = 0, casters = 0;
    const box = new THREE.Box3();
    for (const child of scene.children) {
      box.setFromObject(child);
      const eligible = castsFromBox(box);
      child.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        if (eligible && !isTransparentMat(o.material) && !o.userData.noCast) casters++;
      });
    }
    expect(meshes).toBe(61);
    expect(casters).toBe(36);
    const names = scene.getObjectByName('gorgeRock').children.filter((o) => o.isMesh).map((o) => o.name).sort();
    expect(names).toEqual(['ledgeTops', 'lips', 'rockFaces']);
  }, 120_000);

  it('keeps the low walk clear', () => {
    for (const a of GORGE_MOUTH_ARCHES) {
      const m = caveMouth({ ...a, seed: 7, surface: flat });
      for (let i = 0; i < m.pos.length / 3; i++) {
        const { u, h, w } = local(a, m.pos, i);
        if (h < MOUTH_LOW_H && Math.abs(u) < a.half && w <= 0.6) {
          expect(a.half - Math.abs(u), `${a.id} vertex ${i} low (u ${u}, h ${h}, w ${w})`).toBeLessThanOrEqual(MOUTH_LOW_IN + 1e-9);
        }
        if (Math.abs(u) < MOUTH_CAM_HALF && h > MOUTH_LOW_H) {
          expect(h, `${a.id} vertex ${i} over the camera line`).toBeGreaterThanOrEqual(MOUTH_CAM_H);
        }
      }
    }
  });

  it('never reaches inside the mouth plane', () => {
    for (const a of GORGE_MOUTH_ARCHES) {
      const m = caveMouth({ ...a, seed: 11, surface: flat });
      const [s0, s1] = m.ranges.stones;
      for (let i = 0; i < s0; i++) {
        expect(local(a, m.pos, i).w, `${a.id} vertex ${i}`).toBeGreaterThanOrEqual(-0.05);
      }
      // the threshold stones sit beside the opening (never behind it), set
      // into the face and no further out on the floor than the foot boulders
      expect(s1).toBeGreaterThan(s0);
      for (let i = s0; i < s1; i++) {
        const { u, w } = local(a, m.pos, i);
        expect(Math.abs(u)).toBeGreaterThanOrEqual(a.half);
        expect(w).toBeLessThanOrEqual(0.12 + 1e-9);
      }
      // the reveal (the arch's soffit and brow) stands at or outside the mouth plane
      const [r0, r1] = m.ranges.reveal;
      for (let i = r0; i < r1; i++) expect(local(a, m.pos, i).w).toBeGreaterThanOrEqual(-0.02 + 1e-9);
    }
  });

  it('seats the rim on the real face', () => {
    const surface = (u, h) => -0.4 + 0.1 * u;
    for (const a of GORGE_MOUTH_ARCHES) {
      const m = caveMouth({ ...a, seed: 3, surface });
      expect(m.rim.length).toBeGreaterThan(10);
      for (const i of m.rim) {
        const { u, h, w } = local(a, m.pos, i);
        expect(w).toBeGreaterThanOrEqual(surface(u, h) - 0.06 - 1e-6);
        expect(w).toBeLessThanOrEqual(surface(u, h) - 0.02 + 1e-6);
      }
    }
  });

  it('is deterministic', () => {
    const spy = vi.spyOn(Math, 'random');
    for (const a of GORGE_MOUTH_ARCHES) {
      const one = caveMouth({ ...a, seed: 5, surface: flat });
      const two = caveMouth({ ...a, seed: 5, surface: flat });
      expect(two.pos).toEqual(one.pos);
      expect(two.idx).toEqual(one.idx);
      expect(two.nor).toEqual(one.nor);
      expect(caveMouth({ ...a, seed: 6, surface: flat }).pos).not.toEqual(one.pos);
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('matches the tunnel liner profile at the cave mouths', () => {
    // the outline's height where it crosses |u| = a (1.5: where it leaves the jamb)
    const heightAt = (outline, a) => {
      let best = -Infinity;
      for (let k = 0; k + 1 < outline.length; k++) {
        const [u0, h0] = outline[k], [u1, h1] = outline[k + 1];
        const f0 = a === 0 ? u0 : Math.abs(u0) - a, f1 = a === 0 ? u1 : Math.abs(u1) - a;
        if (f0 * f1 > 0 || f0 === f1) continue;
        best = Math.max(best, h0 + (h1 - h0) * (f0 / (f0 - f1)));
      }
      return best;
    };
    for (const a of GORGE_MOUTH_ARCHES.filter((r) => r.id !== 'campDen')) {
      const m = caveMouth({ ...a, seed: 9, surface: flat, jitter: 0 });
      for (const [au, h] of [[1.49, 1.55], [1.35, 2.1], [0.9, 2.45], [0, CORRIDOR_HEADROOM - 0.02]]) {
        expect(Math.abs(heightAt(m.outline, au) - h), `${a.id} at |u| ${au}`).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('keeps the threshold stones off the walking lines and the camp', () => {
    const { rockFaces } = gorgeBuilt();
    const arches = mouthArchesFor(rockFaces);
    const L = campLayout('gorge');
    const D = campDressing('gorge');
    const spots = [L.seats.leader, L.seats.deputy, ...L.seats.elders, ...L.seats.kits, D.kill].map((p) => ({ x: p.x, z: p.z, r: 0 }));
    spots.push(...D.nests, { x: L.rock.x, z: L.rock.z, r: L.rock.r });
    let count = 0;
    for (const a of GORGE_MOUTH_ARCHES) {
      const stones = arches.stones[a.id];
      // (the Snug Cave's mouth is in a notch, its side walls flush with the corridor's)
      count += stones.length;
      const cave = GORGE_CAVES.find((c) => c.id === a.id);
      for (const s of stones) {
        const dx = s.x - a.x, dz = s.z - a.z;
        const u = dx * -a.nz + dz * a.nx;
        expect(Math.abs(u)).toBeGreaterThanOrEqual(a.half - 0.1); // never in front of the opening's middle
        if (cave) expect(caveClear(cave, s.x, s.z, s.r)).toBe(true);
        else for (const p of spots) expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThanOrEqual(s.r + p.r + 0.4);
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(13);
  }, 120_000);
});
