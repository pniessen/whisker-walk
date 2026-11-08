import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';

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

const {
  build, GORGE_FOG, GORGE_SKY, GORGE_MOUTH_ARCHES, mouthArchesFor, caveClear, campSpots, campDenLining,
  caveRoomFor, caveTunnelFor, DEN_LOW_H, DEN_SEAT_CLEAR, mouthTintsFor,
} = await import('../src/world/gorge.js');
const { ROCK_FRAGMENT, ROCK_SHADE } = await import('../src/world/rockshade.js');
const {
  caveMouth, MOUTH_LOW_H, MOUTH_LOW_IN, MOUTH_CAM_H, MOUTH_CAM_HALF,
} = await import('../src/world/caveroom.js');
const { GORGE_CAVES, CORRIDOR_HEADROOM, CAMP_DEN, CAMP_DEN_HEADROOM, gorgeGround } = await import('../src/world/gorgeshape.js');
const { LINER_IN } = await import('../src/world/caveroom.js');
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
    // polish-gorgewall: calm out to walk distance (was 1.5 / 4)
    expect(ROCK_SHADE.nearLo).toBe(2);
    expect(ROCK_SHADE.nearHi).toBe(9);
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
    // (polish-gorge6 added the five small dens: denW1 .. denTop)
    expect(Object.keys(arches).sort()).toEqual(['campDen', 'campDenLining', 'denE', 'denLookout', 'denTop', 'denW1', 'denW2', 'echo', 'glitter', 'snug']);
    for (const n of Object.values(arches)) expect(n).toBeGreaterThan(0);
    const total = Object.values(arches).reduce((s, n) => s + n, 0);
    expect(['echo', 'snug', 'glitter', 'campDen'].reduce((s, k) => s + arches[k], 0)).toBeLessThanOrEqual(1100);
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
    const spots = campSpots();
    expect(spots.length).toBeGreaterThanOrEqual(12); // seats, kill pile, nests, the leader's rock
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

// --- review fixes on Task 2: the as-built arches against the real shell ---------
// An independent cast: three's Raycaster on a mesh of the rockFaces SHELL only
// (userData.shellTris), double-sided.
function shellCaster(rockFaces) {
  const n = rockFaces.parent.userData.shellTris.rockFaces;
  const pos = rockFaces.geometry.getAttribute('position').array.slice(0, n * 9);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  return (origin, dir) => { ray.set(origin, dir); ray.far = 20; return ray.intersectObject(mesh, false); };
}

const SNUG_RIM_BURIED = 16; // rim samples of the Snug Cave mouth buried in its notch walls
describe('polish-gorge5 task 2 review: the as-built arches', () => {
  it('seats every rim on the shell, finds every face and keeps the rules', () => {
    const { rock, rockFaces } = gorgeBuilt();
    const arches = mouthArchesFor(rockFaces);
    const cast = shellCaster(rockFaces);
    const ground = gorgeGround();
    // what was appended is what mouthArchesFor gives
    const all = rockFaces.geometry.getAttribute('position').array;
    expect(Array.from(all.slice(all.length - arches.pos.length))).toEqual(Array.from(arches.pos));
    let seated = 0, buried = 0, worstDenLow = 0;
    const buriedAt = new Set();
    for (const a of GORGE_MOUTH_ARCHES) {
      expect(arches.misses[a.id], `${a.id} surface() misses`).toBe(0);
      const n = new THREE.Vector3(a.nx, 0, a.nz);
      const toLocal = (x, y, z) => { const dx = x - a.x, dz = z - a.z; return { u: dx * -a.nz + dz * a.nx, h: y - a.y, w: dx * a.nx + dz * a.nz }; };
      // the rim: 0.02-0.06 behind the outermost shell face within [-1, 0.3]
      // of the mouth plane along -n (sampled no lower than 0.02 over the
      // floor); where the shell offers none the rim must be buried in rock:
      // the walk's ground record stands over it just out of the plane
      for (const [x, y, z] of arches.rims[a.id]) {
        const { u, h, w } = toLocal(x, y, z);
        const hs = Math.max(0.02, h);
        const o = new THREE.Vector3(a.x - a.nz * u + a.nx * 2, a.y + hs, a.z + a.nx * u + a.nz * 2);
        const hits = cast(o, n.clone().negate()).map((q) => toLocal(q.point.x, q.point.y, q.point.z).w).filter((hw) => hw >= -1 && hw <= 0.3);
        if (hits.length) {
          const face = Math.max(...hits);
          expect(face - w, `${a.id} rim at u ${u.toFixed(2)} h ${h.toFixed(2)}`).toBeGreaterThanOrEqual(0.02 - 1e-4);
          expect(face - w, `${a.id} rim at u ${u.toFixed(2)} h ${h.toFixed(2)}`).toBeLessThanOrEqual(0.06 + 1e-4);
          seated++;
        } else {
          const top = ground.y(a.x - a.nz * u + a.nx * 0.05, a.z + a.nx * u + a.nz * 0.05);
          expect(top, `${a.id} rim at u ${u.toFixed(2)} h ${h.toFixed(2)}: no face, not buried`).toBeGreaterThan(a.y + hs + 0.05);
          buried++;
          buriedAt.add(a.id);
        }
      }
      // the as-built triangles: the low walk, the camera line, and nothing
      // behind the mouth plane but the rim's outer ring (on the face) and the
      // threshold stones (set into it)
      const rim = new Set(arches.rims[a.id].map((q) => q.map(Math.fround).join(',')));
      const { from, to, stones } = arches.ranges[a.id];
      for (let i = from * 3; i < (to - stones) * 3; i++) {
        const x = arches.pos[i * 3], y = arches.pos[i * 3 + 1], z = arches.pos[i * 3 + 2];
        const { u, h, w } = toLocal(x, y, z);
        if (h < MOUTH_LOW_H && Math.abs(u) < a.half && w <= 0.6) {
          expect(a.half - Math.abs(u)).toBeLessThanOrEqual(MOUTH_LOW_IN + 1e-6);
          if (a.id === 'campDen') worstDenLow = Math.max(worstDenLow, a.half - Math.abs(u));
        }
        if (Math.abs(u) < MOUTH_CAM_HALF && h > MOUTH_LOW_H) expect(h).toBeGreaterThanOrEqual(MOUTH_CAM_H - 1e-6);
        if (!rim.has([x, y, z].join(','))) expect(w, `${a.id} vertex at u ${u.toFixed(2)} h ${h.toFixed(2)}`).toBeGreaterThanOrEqual(-0.05);
      }
    }
    expect(worstDenLow, 'camp den arch worst low intrusion').toBeLessThanOrEqual(0.08);
    expect(seated).toBeGreaterThan(60);
    // only the Snug Cave's mouth, in its notch, has a rim buried in rock
    // (surface() also counts the Snug stones' tries there, all buried too)
    expect([...buriedAt]).toEqual(['snug']);
    for (const id of ['echo', 'glitter', 'campDen']) {
      expect(arches.rimBuried[id], `${id} rim buried`).toBe(0);
      expect(arches.buried[id], `${id} buried`).toBe(0);
    }
    expect(arches.rimBuried.snug).toBe(SNUG_RIM_BURIED);
    expect(buried).toBe(arches.rimBuried.snug);
    expect(arches.buried.snug).toBeGreaterThanOrEqual(arches.rimBuried.snug);
    expect(rock.userData.mouthArches.echo).toBe(arches.byId.echo);
  }, 120_000);
});

describe('polish-gorge5 review: cached arches', () => {
  it('gives equal arrays per build and shares nothing mutable', () => {
    const { rockFaces } = gorgeBuilt();
    const one = mouthArchesFor(rockFaces);
    const two = mouthArchesFor(rockFaces);
    expect(two.pos).toEqual(one.pos);
    expect(two.col).toEqual(one.col);
    expect(two.byId).toEqual(one.byId);
    expect(mouthTintsFor(rockFaces)).toEqual(mouthTintsFor(rockFaces));
    one.pos[0] += 1; one.col[0] += 1; one.byId.echo += 1;
    expect(mouthArchesFor(rockFaces).pos[0]).toBe(two.pos[0]);
    expect(mouthArchesFor(rockFaces).byId.echo).toBe(two.byId.echo);
    // a second build: equal appended data, and mutating the first build's attribute leaves it be
    const scene2 = new THREE.Scene();
    build(scene2);
    const rf2 = scene2.getObjectByName('rockFaces');
    const p1 = rockFaces.geometry.getAttribute('position'), p2 = rf2.geometry.getAttribute('position');
    expect(p2.array.length).toBe(p1.array.length);
    expect(p2.array).not.toBe(p1.array);
    const tail = (a) => Array.from(a.slice(a.length - two.pos.length));
    const before = tail(p2.array);
    expect(before).toEqual(Array.from(two.pos));
    p1.array[p1.array.length - 1] += 5;
    expect(tail(rf2.geometry.getAttribute('position').array)).toEqual(before);
    p1.array[p1.array.length - 1] -= 5;
  }, 120_000);
});

// --- Task 3: the camp den's lining and the tunnels' first metres -------------------
const sha = (a) => createHash('sha256').update(Buffer.from(new Float32Array(a).buffer)).digest('hex');
// Recorded from the chambers and tunnels BEFORE caveRoom took its `look` and
// caveTunnel its `mouthTint` (f8f1d5c): position, colour and index arrays.
// polish-gorgelight re-recorded the COLOUR hashes only (positions and indices
// unchanged): the Echo chamber's liner is a warm grey now, and every tunnel
// grades from the canyon's brown at the mouth to its chamber's colour.
const CHAMBER_SHA = {
  echo: ['3ab139999a6a2e968ce312c86ec2e91beddac1b33c984fb6e47cb81631dd16c9', '369a94b04c9a86922cc1bcc658e7891b89edc5c8f55a8600a4647391742e2f1b', 'f984a1d9c528237a9310881cbc8d30463de704101e4af30f14aabe49ad12281c'],
  snug: ['128084fc50c1a91a11f6fccb920801d9eb70df640b84eeb0f43eb31ec9209523', 'be3e0082ba07f3f474fee722c6c33e5798594db3aa3c4202fe7dd866d71765c4', '04953ff558d7101f902ca99e4f57baed651a04abfde61dd7c0f204e99d7d648c'],
  glitter: ['f8460f2af1fa9e7144a8a3af2fe43901833b6fe39b3cfe9591a234951a3be9f2', '8b843d111f2eaf093d455a4fc7dd766be1b0c6863afc6feca65e7aa5a8a66ecb', '2250f78693a6172d314671ee95b2d85c932f27784c4cdcd96e72d3cfb1e9fafe'],
};
const TUNNEL_SHA = {
  echo: ['763a3b0515f18251335362ccb7a8c6fbf57975d5f51f0167b80351402e9f2f75', 'd25dda8ecef9c8c8b611df14265bcb090cf13004121de496fa5c307a1ad92190'],
  snug: ['dd1fcd3c42987ed491f27aa4a3b854442304607c5c40041d1ca7648741da5d05', 'f3d3357d513826317bda7a86ddab0c766e2673fa35d01cb388c5b77392085e44'],
  glitter: ['521cd0d892f610400e6856f09cdbaf1f86221ffd05dda84d072cde66e3086b60', 'd76594a5c76040b1d020a0bb671064b01b82225d33760d11e7655f4da70fc9a6'],
};

describe('polish-gorge5 task 3: the camp den lining and the tunnels\' first metres', () => {
  it('leaves the three chambers as they were', () => {
    for (const id of ['echo', 'snug', 'glitter']) {
      const g = caveRoomFor(id).geometry;
      expect([sha(g.getAttribute('position').array), sha(g.getAttribute('color').array), sha(g.index.array)], id).toEqual(CHAMBER_SHA[id]);
      const t = caveTunnelFor(id).geometry;
      expect([sha(t.getAttribute('position').array), sha(t.getAttribute('color').array)], id).toEqual(TUNNEL_SHA[id]);
    }
  }, 120_000);

  it('lines the camp den with rounded rock', () => {
    const { rock, rockFaces } = gorgeBuilt();
    const n = rock.userData.mouthArches.campDenLining;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(450);
    const spy = vi.spyOn(Math, 'random');
    const L = campDenLining();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(L.geometry).toBeNull(); // raw arrays: no BufferGeometry (no uuid draw) in the build
    expect(L.idx.length / 3).toBe(n);
    expect(campDenLining().pos).toEqual(L.pos);
    const r = CAMP_DEN, y0 = r.y0;
    const spots = campSpots();
    let westLow = 0, westHigh = 0, coved = 0;
    for (let i = 0; i < L.pos.length / 3; i++) {
      const x = L.pos[i * 3], y = L.pos[i * 3 + 1], z = L.pos[i * 3 + 2];
      const h = y - y0;
      const inward = Math.min(x - r.minX, r.maxX - x, z - r.minZ, r.maxZ - z);
      // inside the den's box, never out past its open side
      expect(inward).toBeGreaterThanOrEqual(-1e-6);
      expect(h).toBeLessThanOrEqual(CAMP_DEN_HEADROOM);
      if (h < DEN_LOW_H) {
        expect(inward, `low lining vertex at (${x.toFixed(2)}, ${h.toFixed(2)}, ${z.toFixed(2)})`).toBeLessThanOrEqual(LINER_IN + 1e-6);
        for (const s of spots) expect(Math.hypot(x - s.x, z - s.z)).toBeGreaterThanOrEqual(s.r + DEN_SEAT_CLEAR);
      }
      if (inward > 0.5) coved++;
      // its ends at the open side: on the den's side walls at x = 20, foot to roof
      if (x - r.minX < 0.03) { if (h < 0.1) westLow++; if (h > CAMP_DEN_HEADROOM - 0.05) westHigh++; }
    }
    expect(coved).toBeGreaterThan(20); // the cove curves well in under the roof
    expect(westLow).toBeGreaterThanOrEqual(2);
    expect(westHigh).toBeGreaterThanOrEqual(2);
    // appended to rockFaces after the arches, coloured from the rock (sandstone, not white)
    const col = rockFaces.geometry.getAttribute('color').array;
    const v = col.length / 3;
    for (let i = v - n * 3; i < v; i++) {
      const s = col[i * 3] + col[i * 3 + 1] + col[i * 3 + 2];
      expect(s).toBeGreaterThan(0.3);
      expect(s).toBeLessThan(2.7);
    }
  }, 120_000);

  it('keeps the arches and the lining inside the build budget', () => {
    const { rock } = gorgeBuilt();
    // gorge5's own arches and lining (polish-gorge6's small dens are held to their own budget in gorge6.test.js)
    const own = ['echo', 'snug', 'glitter', 'campDen', 'campDenLining'];
    const total = own.reduce((s, k) => s + rock.userData.mouthArches[k], 0);
    expect(total).toBeLessThanOrEqual(1500);
  }, 120_000);

  it('warms the tunnel\'s first metres', () => {
    const { rock, rockFaces } = gorgeBuilt();
    const tints = rock.userData.mouthTints;
    expect(Object.keys(tints).sort()).toEqual(['echo', 'glitter', 'snug']);
    expect(mouthTintsFor(rockFaces)).toEqual(tints);
    const tint = new THREE.Color(tints.echo);
    const warm = caveTunnelFor('echo', { mouthTint: tints.echo });
    const cold = caveTunnelFor('echo');
    const wc = warm.geometry.getAttribute('color').array, cc = cold.geometry.getAttribute('color').array;
    let near = 0, far = 0;
    for (const st of warm.stations) {
      for (const id of st.ids) {
        if (st.s < 0.3) {
          near++;
          for (let k = 0; k < 3; k++) expect(Math.abs(wc[id * 3 + k] - [tint.r, tint.g, tint.b][k])).toBeLessThanOrEqual(0.02);
        } else if (st.s > 3.5) {
          far++;
          for (let k = 0; k < 3; k++) expect(wc[id * 3 + k]).toBe(cc[id * 3 + k]);
        }
      }
    }
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
    // the mouth's end frame (the first half of the frames) starts in the tint too
    const [f0, f1] = warm.ranges.frames;
    for (let i = f0; i < f0 + (f1 - f0) / 2; i++) {
      for (let k = 0; k < 3; k++) expect(Math.abs(wc[i * 3 + k] - [tint.r, tint.g, tint.b][k])).toBeLessThanOrEqual(0.02);
    }
    // the drawn cave interior wears it: its liner at the mouth (x = -18) is the tint
    const drawn = rock.parent.getObjectByName('caveRoom:echo').geometry;
    const dp = drawn.getAttribute('position').array, dc = drawn.getAttribute('color').array;
    let atMouth = 0;
    for (let i = 0; i < dp.length / 3; i++) {
      if (Math.abs(dp[i * 3] + 18) > 1e-4 || dp[i * 3 + 1] < 0.5) continue;
      atMouth++;
      for (let k = 0; k < 3; k++) expect(Math.abs(dc[i * 3 + k] - [tint.r, tint.g, tint.b][k])).toBeLessThanOrEqual(0.02);
    }
    expect(atMouth).toBeGreaterThan(0);
  }, 120_000);
});
