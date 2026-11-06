import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The headless canvas stub every world test uses (see test/park.test.js for
// why getImageData and the gradients need real answers): the camp's materials
// ask render/textures.js for surface tiles.
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

const { campLayout, campDressing, addCamp, CAMP_TURN, campDiscs, LEDGE_CAMPS, CLUMP_R, RING_CLUMP_TRIS, caneTris, HIGHROCK_TRIS, HIGHROCK_BOULDER_TRIS } = await import('../src/world/camp.js');
const { CAMP_DEN, WIDE_LEDGE_RECT, gorgeGround } = await import('../src/world/gorgeshape.js');
const { castFor, roamHomes } = await import('../src/clancast.js');
const { DISCS } = await import('../src/rivalclans.js');
const { PRINT_Y } = await import('../src/render/pawprints.js');
const { TRAIL_RENDER_ORDER } = await import('../src/world/pathribbon.js');

const CAMPS = ['woods', 'river', 'moor', 'pines'];
const groundSeats = (L) => [L.seats.deputy, ...L.seats.elders, ...L.seats.kits];

describe('campLayout', () => {
  it('is null where there is no clan cast', () => {
    for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', 'island', '__proto__', 42, undefined]) {
      expect(castFor(a)).toHaveLength(0);
      expect(campLayout(a), String(a)).toBeNull();
    }
  });

  it('every camp has a hand-probed turn', () => {
    for (const a of CAMPS) {
      expect(castFor(a).length, a).toBeGreaterThan(0);
      expect(Number.isFinite(CAMP_TURN[a]), a).toBe(true);
      expect(Object.isFrozen(CAMP_TURN)).toBe(true);
    }
  });

  it('sits in the camp disc, every piece 1.5m or more inside its edge', () => {
    for (const a of CAMPS) {
      const L = campLayout(a);
      const { cx, cz, r } = DISCS[a];
      expect(L.cx).toBe(cx);
      expect(L.cz).toBe(cz);
      expect(L.den.r).toBe(1.1);
      expect(L.den.h).toBe(0.9);
      expect(L.rock.r).toBe(0.6);
      expect(L.rock.h).toBe(0.8);
      for (const p of [L.den, L.rock]) {
        expect(Math.hypot(p.x - cx, p.z - cz) + p.r, a).toBeLessThanOrEqual(r - 1.5);
      }
    }
  });

  it('puts the leader on the rock and every ground seat clear of the den and the rock', () => {
    for (const a of CAMPS) {
      const L = campLayout(a);
      expect(L.seats.leader).toEqual({ x: L.rock.x, z: L.rock.z, y: L.rock.h });
      expect(L.seats.elders).toHaveLength(2);
      expect(L.seats.kits).toHaveLength(4);
      const seats = groundSeats(L);
      for (const s of seats) {
        for (const p of [L.den, L.rock]) {
          expect(Math.hypot(s.x - p.x, s.z - p.z) - p.r, `${a} ${s.x},${s.z}`).toBeGreaterThanOrEqual(0.6 - 1e-9);
        }
      }
      for (let i = 0; i < seats.length; i++) {
        for (let j = i + 1; j < seats.length; j++) {
          expect(Math.hypot(seats[i].x - seats[j].x, seats[i].z - seats[j].z), `${a} ${i}/${j}`).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
  });

  it('the deputy stands between the rock and the camp centre', () => {
    for (const a of CAMPS) {
      const L = campLayout(a);
      const toRock = Math.hypot(L.rock.x - L.cx, L.rock.z - L.cz);
      const d = L.seats.deputy;
      expect(Math.hypot(d.x - L.cx, d.z - L.cz)).toBeLessThan(toRock);
    }
  });

  it('is the same every call, and a fresh object each time', () => {
    for (const a of CAMPS) {
      const one = campLayout(a);
      const two = campLayout(a);
      expect(one).toEqual(two);
      expect(one).not.toBe(two);
    }
  });
});

describe('addCamp', () => {
  // Every vertex of a mesh, in world space.
  const worldVerts = (mesh) => {
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.attributes.position;
    const v = new THREE.Vector3();
    const out = [];
    for (let i = 0; i < pos.count; i++) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).clone());
    return out;
  };

  it('adds the camp, its bramble ring and its clearing, and the same two colliders', () => {
    for (const a of CAMPS) {
      const scene = new THREE.Scene();
      const area = { colliders: [] };
      addCamp(scene, area, a);
      expect(scene.children.map((o) => o.name).sort(), a).toEqual(['campClearing', 'campRing', 'clanCamp']);
      const group = scene.getObjectByName('clanCamp');
      expect(group.isGroup).toBe(true);
      const L = campLayout(a);
      expect(area.colliders).toEqual([
        { x: L.den.x, z: L.den.z, r: L.den.r },
        { x: L.rock.x, z: L.rock.z, r: L.rock.r },
      ]);
      // the ring and the clearing are low and wide: out of the shadow pass,
      // but they take the trees' shadows
      for (const name of ['campRing', 'campClearing']) {
        const m = scene.getObjectByName(name);
        expect(m.isMesh, name).toBe(true);
        expect(m.userData.noCast, `${a} ${name}`).toBe(true);
        expect(m.receiveShadow, `${a} ${name}`).toBe(true);
      }
      // the flat doorway, the nests and the fresh-kill pile stay out of it too
      for (const name of ['campDoor', 'campNests', 'campKill']) {
        expect(group.getObjectByName(name)?.userData.noCast, `${a} ${name}`).toBe(true);
      }
      expect(group.getObjectByName('campDen').userData.noCast).toBeFalsy();
      expect(group.getObjectByName('campRock').userData.noCast).toBeFalsy();
    }
  });

  it('keeps the den inside its footprint', () => {
    for (const a of CAMPS) {
      const scene = new THREE.Scene();
      addCamp(scene, { colliders: [] }, a);
      scene.updateMatrixWorld(true);
      const L = campLayout(a);
      const group = scene.getObjectByName('clanCamp');
      for (const name of ['campDen', 'campDoor']) {
        for (const v of worldVerts(group.getObjectByName(name))) {
          expect(Math.hypot(v.x - L.den.x, v.z - L.den.z), `${a} ${name}`).toBeLessThanOrEqual(1.25);
          expect(v.y, `${a} ${name}`).toBeLessThan(1.0);
        }
      }
    }
  });

  // The Highrock in all five camps (the Gorge's seated on its ledge): every
  // vertex relative to the rock's spot and the ground under it.
  const ROCK_CAMPS = [...CAMPS, 'gorge'];
  const buildRock = (a) => {
    const scene = new THREE.Scene();
    const ground = a === 'gorge' ? gorgeGround() : null;
    addCamp(scene, ground ? { colliders: [], ground } : { colliders: [] }, a);
    scene.updateMatrixWorld(true);
    const L = campLayout(a);
    const base = ground ? ground.y(L.rock.x, L.rock.z) : 0;
    const rock = scene.getObjectByName('campRock');
    const verts = worldVerts(rock).map((v) => ({ x: v.x - L.rock.x, y: v.y - base, z: v.z - L.rock.z }));
    return { scene, L, rock, verts, base };
  };

  it('the Highrock is a boulder outcrop: within 0.8 m of its spot, 1.0 to 1.2 m tall, within its triangle budget', () => {
    expect(HIGHROCK_TRIS).toBeLessThanOrEqual(116 + 450);
    expect(HIGHROCK_BOULDER_TRIS).toBeLessThan(HIGHROCK_TRIS);
    for (const a of ROCK_CAMPS) {
      const { rock, verts } = buildRock(a);
      let top = -Infinity;
      for (const v of verts) {
        expect(Math.hypot(v.x, v.z), `${a} rock`).toBeLessThanOrEqual(0.8);
        expect(v.y, `${a} rock`).toBeGreaterThanOrEqual(-0.01);
        top = Math.max(top, v.y);
      }
      // a low, round back stone she leans on, not a tall slab behind her
      expect(top, a).toBeGreaterThanOrEqual(1.0);
      expect(top, a).toBeLessThanOrEqual(1.2);
      const g = rock.geometry;
      expect(g.index, a).toBeNull();
      expect(g.attributes.position.count / 3, a).toBe(HIGHROCK_TRIS);
    }
  });

  // polish-camps5: a layered rock, its colour a per-face multiplier on the
  // material's look.rock. The moss faces are the clan's nest moss: their
  // multiplier is look.nest.moss / look.rock channel-wise (linear), times a
  // scalar, so they are found by their channel ratios.
  it('the Highrock is shaded per face in the clan\'s rock colour: dark at its foot and under its ledges, moss on its tops', async () => {
    const { campLook } = await import('../src/world/camp.js');
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    for (const a of ROCK_CAMPS) {
      const { rock, verts } = buildRock(a);
      const look = campLook(a);
      const col = rock.geometry.attributes.color;
      const nrm = rock.geometry.attributes.normal;
      expect(col, a).toBeDefined();
      expect(nrm, a).toBeDefined();
      expect(rock.material.vertexColors, a).toBe(true);
      expect(rock.material.color.getHex(), a).toBe(look.rock);
      const m = new THREE.Color(look.nest.moss);
      const r = new THREE.Color(look.rock);
      const moss = [m.r / r.r, m.g / r.g, m.b / r.b];
      const isMoss = (c) => Math.abs(c[1] / c[0] - moss[1] / moss[0]) < 1e-3 * (moss[1] / moss[0])
        && Math.abs(c[2] / c[0] - moss[2] / moss[0]) < 1e-3 * (moss[2] / moss[0]);
      // green as drawn: the multiplier times look.rock (a pale lichen's
      // multiplier over the Gorge's sandstone is greenish, its colour is not)
      const shown = (c) => [c[0] * r.r, c[1] * r.g, c[2] * r.b];
      const greenMoss = (m.g / m.r) > 1.15;
      const faces = [];
      for (let t = 0; t < col.count; t += 3) {
        // one colour a face: all three corners the same
        for (const k of [1, 2]) {
          expect(col.getX(t + k), `${a} face ${t / 3}`).toBeCloseTo(col.getX(t), 6);
          expect(col.getY(t + k), `${a} face ${t / 3}`).toBeCloseTo(col.getY(t), 6);
          expect(col.getZ(t + k), `${a} face ${t / 3}`).toBeCloseTo(col.getZ(t), 6);
        }
        const c = [col.getX(t), col.getY(t), col.getZ(t)];
        for (const ch of c) expect(ch, `${a} face ${t / 3}`).toBeGreaterThan(0);
        faces.push({
          c, l: lum(c), ny: nrm.getY(t),
          y: (verts[t].y + verts[t + 1].y + verts[t + 2].y) / 3,
          moss: isMoss(c),
          grey: Math.abs(c[0] - c[1]) < 1e-6 && Math.abs(c[0] - c[2]) < 1e-6,
        });
      }
      // dark at the foot, light at the top (the plain grey faces)
      const mean = (fs) => fs.reduce((s, f) => s + f.l, 0) / fs.length;
      const low = faces.filter((f) => f.grey && f.y < 0.25);
      const high = faces.filter((f) => f.grey && f.y > 0.7);
      expect(low.length, a).toBeGreaterThan(0);
      expect(high.length, a).toBeGreaterThan(0);
      expect(mean(low), a).toBeLessThan(mean(high));
      // moss on up-facing faces, and only there
      const mossy = faces.filter((f) => f.moss);
      expect(mossy.filter((f) => f.ny > 0.55).length, a).toBeGreaterThan(4);
      for (const f of mossy) expect(f.ny, `${a} moss`).toBeGreaterThan(0.5);
      if (greenMoss) {
        // (the River's blue-grey rock is itself a little green: greener than it)
        const bar = Math.max(1.15, 1.15 * r.g / r.r);
        const green = (f) => { const s = shown(f.c); return s[1] / s[0] > bar; };
        expect(faces.some((f) => f.ny > 0.55 && green(f)), a).toBe(true);
        for (const f of faces) if (green(f)) expect(f.ny, `${a} green`).toBeGreaterThan(0.5);
      }
      // dark joints under the ledges
      const ls = faces.map((f) => f.l).sort((p, q) => p - q);
      const median = ls[ls.length >> 1];
      expect(faces.some((f) => f.ny < -0.2 && f.l < median), a).toBe(true);
    }
  });

  it('gives the Highrock a flat top at rock.h the leader stands on, nothing to clip into', () => {
    for (const a of ROCK_CAMPS) {
      const { L, verts } = buildRock(a);
      expect(L.seats.leader.y).toBe(0.8);
      let flat = 0;
      for (const v of verts) {
        if (Math.hypot(v.x, v.z) > 0.42) continue;
        const at = `${a} ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
        expect(v.y, at).toBeLessThanOrEqual(0.82);
        if (v.y >= 0.78 && v.y <= 0.82) flat++;
      }
      expect(flat, a).toBeGreaterThanOrEqual(6);
    }
  });

  it("the Highrock's stones keep clear of the fresh-kill pile and the deputy's seat", () => {
    for (const a of ROCK_CAMPS) {
      const { scene, L, verts } = buildRock(a);
      const kill = worldVerts(scene.getObjectByName('campKill')).map((v) => ({ x: v.x - L.rock.x, z: v.z - L.rock.z }));
      expect(kill.length, a).toBeGreaterThan(0);
      const dep = { x: L.seats.deputy.x - L.rock.x, z: L.seats.deputy.z - L.rock.z };
      // the main boulder's HIGHROCK_BOULDER_TRIS triangles come first, then
      // the back stone and the two steps: the stones keep 0.25 m off the
      // pile (the boulder is the collider's size, and the pile 0.3 m off its
      // edge)
      expect(verts.length, a).toBe(3 * HIGHROCK_TRIS);
      for (const [i, v] of verts.entries()) {
        const at = `${a} ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
        if (i >= 3 * HIGHROCK_BOULDER_TRIS) for (const k of kill) expect(Math.hypot(v.x - k.x, v.z - k.z), at).toBeGreaterThanOrEqual(0.25);
        expect(Math.hypot(v.x - dep.x, v.z - dep.z), at).toBeGreaterThanOrEqual(0.45);
      }
    }
  });

  it('the ring is taller and arched, out of the shadow pass, no more than 6,200 triangles', () => {
    for (const a of CAMPS) {
      const scene = new THREE.Scene();
      addCamp(scene, { colliders: [] }, a);
      scene.updateMatrixWorld(true);
      const ring = scene.getObjectByName('campRing');
      let top = -Infinity;
      for (const v of worldVerts(ring)) top = Math.max(top, v.y);
      expect(top, a).toBeGreaterThanOrEqual(0.7);
      expect(top, a).toBeLessThanOrEqual(1.0);
      expect(ring.userData.noCast, a).toBe(true);
      expect(ring.castShadow, a).toBe(false);
      const g = ring.geometry;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      expect(tris, a).toBeLessThanOrEqual(6200);
      expect(g.attributes.color, a).toBeDefined();
    }
  });

  it("keeps the camp group under the contact-shadow scan's MAX_SPAN, so den and rock keep their decal", async () => {
    const { MAX_SPAN } = await import('../src/render/contactshadows.js');
    for (const a of CAMPS) {
      const scene = new THREE.Scene();
      addCamp(scene, { colliders: [] }, a);
      const box = new THREE.Box3().setFromObject(scene.getObjectByName('clanCamp'));
      expect(box.max.x - box.min.x, a).toBeLessThan(MAX_SPAN);
      expect(box.max.z - box.min.z, a).toBeLessThan(MAX_SPAN);
    }
  });

  it('costs 8 main-pass meshes or fewer once the props are merged', async () => {
    const { mergeStaticProps } = await import('../src/render/mergeprops.js');
    for (const a of CAMPS) {
      const scene = new THREE.Scene();
      addCamp(scene, { colliders: [] }, a);
      mergeStaticProps(scene);
      let meshes = 0;
      scene.traverse((o) => { if (o.isMesh && o.visible) meshes++; });
      expect(meshes, a).toBeLessThanOrEqual(8);
      // a merge would drop noCast: the flat pieces come through it whole
      for (const name of ['campDoor', 'campNests', 'campKill', 'campRing', 'campClearing']) {
        expect(scene.getObjectByName(name)?.userData.noCast, `${a} ${name}`).toBe(true);
      }
    }
  });

  it('draws the ring and the clearing as the dressing lays them out', async () => {
    const { campDressing } = await import('../src/world/camp.js');
    for (const a of CAMPS) {
      const scene = new THREE.Scene();
      addCamp(scene, { colliders: [] }, a);
      scene.updateMatrixWorld(true);
      const D = campDressing(a);
      const { cx, cz } = DISCS[a];
      // polish-brambles: the clumps come first in the merged ring,
      // RING_CLUMP_TRIS triangles apiece (core 20, three crowns 24, six leaf
      // cards, three berries 9), every one of their
      // vertices inside its clump's footprint and under its h; then the
      // canes, a 3-sided tube along each, 6 triangles a segment, and a thorn
      // (a 3-sided spike, 3 triangles) at every odd interior point. Every ring
      // vertex is within 0.6 m (xz) of a kept clump, between the ground and
      // 1 m (ruling R3).
      const verts = worldVerts(scene.getObjectByName('campRing'));
      const cs = D.ring.clumps;
      const clumpVerts = 3 * RING_CLUMP_TRIS * cs.length;
      let caneOnly = 0;
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i];
        const at = `${a} ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
        expect(v.y, at).toBeGreaterThanOrEqual(0);
        expect(v.y, at).toBeLessThanOrEqual(1.0);
        expect(cs.some((c) => Math.hypot(v.x - c.x, v.z - c.z) <= 0.6), at).toBe(true);
        const inClump = cs.some((c) => Math.hypot(v.x - c.x, v.z - c.z) <= CLUMP_R * c.s + 1e-6 && v.y <= c.h + 1e-6);
        if (i < clumpVerts) expect(inClump, `${at} lump`).toBe(true);
        else if (!inClump) caneOnly++;
      }
      // the canes are there, and show between and over the lumps
      expect(caneOnly, a).toBeGreaterThan(0);
      const segs = D.ring.canes.reduce((n, cane) => n + cane.length - 1, 0);
      expect(segs, a).toBeGreaterThan(0);
      const g = scene.getObjectByName('campRing').geometry;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      expect(tris, a).toBe(RING_CLUMP_TRIS * cs.length + D.ring.canes.reduce((n, cane) => n + caneTris(cane), 0));
      expect(tris, a).toBeLessThanOrEqual(6200);
      // every cane carries thorns: what is left over past the clumps and the
      // tubes is 3 triangles a thorn, one at each odd interior point
      const thornTris = tris - RING_CLUMP_TRIS * cs.length - 6 * segs;
      const thorns = D.ring.canes.reduce((n, cane) => n + Math.floor((cane.length - 1) / 2), 0);
      expect(thornTris, a).toBeGreaterThan(0);
      expect(thornTris, a).toBe(3 * thorns);
      for (const cane of D.ring.canes) expect(caneTris(cane), a).toBe(6 * (cane.length - 1) + 3 * Math.floor((cane.length - 1) / 2));
      // the whole camp is no dearer than before (River and Moor are at their
      // caps); polish-camps5 gives each camp up to +700 over its 8,177 most
      // (the Moor), the layered Highrock 294 of them
      let camp = 0;
      for (const o of scene.children) o.traverse((m) => { if (m.isMesh) camp += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
      expect(camp, a).toBeLessThanOrEqual(8900);
      // ...and every clump is drawn
      for (const c of cs) expect(verts.some((v) => Math.hypot(v.x - c.x, v.z - c.z) <= CLUMP_R * c.s)).toBe(true);
      // the clearing lies flat just over the ground, within its radius
      const clearing = scene.getObjectByName('campClearing');
      for (const v of worldVerts(clearing)) {
        expect(v.y).toBeCloseTo(0.011, 6);
        // over the path strips (0.01), under the paw prints and the
        // contact-shadow decals (contactshadows.js DECAL_Y 0.015, not exported)
        expect(v.y).toBeGreaterThan(0.01);
        expect(v.y).toBeLessThan(PRINT_Y);
        expect(v.y).toBeLessThan(0.015);
        expect(Math.hypot(v.x - cx, v.z - cz)).toBeLessThanOrEqual(D.clearing.r + 1e-6);
      }
      for (const m of [clearing.material].flat()) expect(m.polygonOffset).toBe(true);
    }
  });

  it('fades the clearing into the ground: a two-ring disc with a transparent outer edge', async () => {
    const { flatFootprints } = await import('../src/render/grass.js');
    for (const a of CAMPS) {
      const scene = new THREE.Scene();
      addCamp(scene, { colliders: [] }, a);
      scene.updateMatrixWorld(true);
      const D = campDressing(a);
      const { cx, cz } = DISCS[a];
      const r = D.clearing.r;
      const clearing = scene.getObjectByName('campClearing');
      const g = clearing.geometry;
      // still a CircleGeometry whose radius is the inner ring's (before the
      // wobble), so grass.js keeps tufts off the solid floor only
      expect(g.type, a).toBe('CircleGeometry');
      expect(g.parameters.radius, a).toBeCloseTo(r - 0.4, 6);
      expect(g.index.count / 3, a).toBe(84);
      const col = g.attributes.color;
      expect(col.itemSize, a).toBe(4);
      expect(col.count, a).toBe(g.attributes.position.count);
      expect(g.attributes.uv.count, a).toBe(col.count);
      // centre + 28 inner + 28 outer: alpha 1, 1, 0
      expect(col.count, a).toBe(57);
      expect(col.getW(0), a).toBe(1);
      for (let i = 1; i <= 28; i++) expect(col.getW(i), a).toBe(1);
      for (let i = 29; i <= 56; i++) expect(col.getW(i), a).toBe(0);
      // the wobble is low-frequency, factor in [0.9, 1], the same for both rings
      const pos = g.attributes.position;
      for (let i = 1; i <= 28; i++) {
        const ri = Math.hypot(pos.getX(i), pos.getY(i));
        const ro = Math.hypot(pos.getX(i + 28), pos.getY(i + 28));
        expect(ro, a).toBeLessThanOrEqual(r + 1e-6);
        expect(ro, a).toBeGreaterThanOrEqual(0.9 * r - 1e-6);
        expect(ri / (r - 0.4), a).toBeCloseTo(ro / r, 6);
      }
      // ...and it really wobbles
      const radii = [];
      for (let i = 29; i <= 56; i++) radii.push(Math.hypot(pos.getX(i), pos.getY(i)));
      expect(Math.max(...radii) - Math.min(...radii), a).toBeGreaterThan(0.05);
      // the surface texture tiles as the old disc's did: uv spans 0..1 over the full radius
      const uv = g.attributes.uv;
      expect(uv.getX(0)).toBeCloseTo(0.5, 6);
      expect(uv.getY(0)).toBeCloseTo(0.5, 6);
      for (let i = 1; i < col.count; i++) {
        expect(uv.getX(i)).toBeCloseTo((pos.getX(i) / r + 1) / 2, 6);
        expect(uv.getY(i)).toBeCloseTo((pos.getY(i) / r + 1) / 2, 6);
      }
      // faces point up
      for (let t = 0; t < g.index.count; t += 3) {
        const [p, q, s] = [0, 1, 2].map((k) => g.index.getX(t + k));
        const cross = (pos.getX(q) - pos.getX(p)) * (pos.getY(s) - pos.getY(p)) - (pos.getY(q) - pos.getY(p)) * (pos.getX(s) - pos.getX(p));
        expect(cross, a).toBeGreaterThan(0);
      }
      // the solid middle (centre fan) is opaque and depth-written, as the old
      // floor was, so a see-through path under it stays hidden; only the rim
      // band is see-through
      expect(Array.isArray(clearing.material), a).toBe(true);
      const [solid, rim] = clearing.material;
      expect(g.groups, a).toEqual([
        { start: 0, count: 84, materialIndex: 0 },
        { start: 84, count: 168, materialIndex: 1 },
      ]);
      for (let t = 0; t < 84; t++) expect(g.index.getX(t) <= 28, a).toBe(true);
      expect(solid.transparent).toBe(false);
      expect(solid.depthWrite).toBe(true);
      expect(rim.vertexColors).toBe(true);
      expect(rim.transparent).toBe(true);
      expect(rim.depthWrite).toBe(false);
      for (const m of [solid, rim]) expect(m.polygonOffset).toBe(true);
      // the rim writes no depth, so its order alone places it: after the path
      // trails (pathribbon.js TRAIL_RENDER_ORDER, -4), so a trail runs in
      // under the fading edge, and before the water band (-3, waterdress.js),
      // the paw prints (-2, pawprints.js) and the contact-shadow decals (-1,
      // contactshadows.js), which stay on top of it
      expect(clearing.renderOrder).toBeGreaterThan(TRAIL_RENDER_ORDER);
      expect(clearing.renderOrder).toBeLessThan(-3);
      // grass.js still reads it as a no-grass disc at the camp centre
      const disc = flatFootprints(scene).find((f) => f.kind === 'disc');
      expect(disc, a).toBeTruthy();
      expect(disc.x).toBeCloseTo(cx, 6);
      expect(disc.z).toBeCloseTo(cz, 6);
      expect(disc.r).toBeCloseTo(r - 0.4, 6);
    }
  });

  it('takes exactly the 44 Math.random draws (THREE uuids) a flat camp took before polish-camps', () => {
    // flattrace.test.js seeds Math.random per build, and the critters, gold
    // mice and ghosts draw after it: one more object here moves them all
    const real = Math.random;
    for (const a of CAMPS) {
      let draws = 0;
      Math.random = () => { draws++; return real(); };
      try {
        addCamp(new THREE.Scene(), { colliders: [] }, a);
      } finally {
        Math.random = real;
      }
      expect(draws, a).toBe(44);
    }
    expect(Math.random).toBe(real);
  });

  it('adds nothing where there is no camp', () => {
    for (const a of ['park', 'island', 'den']) {
      const scene = new THREE.Scene();
      const area = { colliders: [] };
      addCamp(scene, area, a);
      expect(scene.children).toHaveLength(0);
      expect(area.colliders).toHaveLength(0);
    }
  });
});

describe('roamHomes (pure)', () => {
  const open = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };
  const always = () => true;

  it('gives eight homes on open ground, deterministically', () => {
    for (const a of CAMPS) {
      const one = roamHomes(a, open, always);
      expect(one).toHaveLength(8);
      expect(roamHomes(a, open, always)).toEqual(one);
      const { cx, cz, r } = DISCS[a];
      for (const h of one) {
        expect(Math.abs(h.x)).toBeLessThanOrEqual(35);
        expect(Math.abs(h.z)).toBeLessThanOrEqual(35);
        expect(Math.hypot(h.x - cx, h.z - cz)).toBeGreaterThanOrEqual(r + 3);
      }
    }
  });

  it('is empty where there is no cast, and where nothing is walkable', () => {
    expect(roamHomes('park', open, always)).toEqual([]);
    expect(roamHomes('island', open, always)).toEqual([]);
    expect(roamHomes('woods', open, () => false)).toEqual([]);
  });

  it('asks the walkability of each home and its 2m circle', () => {
    const asked = [];
    roamHomes('woods', open, (x, z) => { asked.push([x, z]); return true; });
    expect(asked.length).toBeGreaterThanOrEqual(8 * 9);
  });
});

describe('campDiscs', () => {
  it('is the den and the rock addCamp pushes as colliders, or [] with no camp', () => {
    for (const id of Object.keys(CAMP_TURN)) {
      const area = { colliders: [] };
      addCamp(new THREE.Scene(), area, id);
      expect(campDiscs(id), id).toEqual(area.colliders);
    }
    expect(campDiscs('park')).toEqual([]);
    expect(campDiscs('den')).toEqual([]);
  });
});

describe('the ledge camp in the Gorge', () => {
  const inRect = (r, p, m = 0) => p.x >= r.minX + m && p.x <= r.maxX - m && p.z >= r.minZ + m && p.z <= r.maxZ - m;
  const lowest = (mesh) => {
    mesh.updateWorldMatrix(true, false);
    return new THREE.Box3().setFromObject(mesh);
  };

  it("is the authored layout on the disc's centre", () => {
    expect(Object.isFrozen(LEDGE_CAMPS)).toBe(true);
    expect(Object.isFrozen(LEDGE_CAMPS.gorge.seats.kits[0])).toBe(true);
    const one = campLayout('gorge');
    expect(one).toEqual({ cx: 12, cz: 41.5, ...LEDGE_CAMPS.gorge });
    expect(one.cx).toBe(DISCS.gorge.cx);
    expect(one.cz).toBe(DISCS.gorge.cz);
    const two = campLayout('gorge');
    expect(two).toEqual(one);
    expect(two).not.toBe(one);
    expect(two.seats).not.toBe(one.seats);
    expect(two.seats.kits[0]).not.toBe(one.seats.kits[0]);
    expect(one.seats.kits[0]).not.toBe(LEDGE_CAMPS.gorge.seats.kits[0]);
    one.seats.kits[0].x = 99; // a caller's change never reaches the next call
    expect(campLayout('gorge').seats.kits[0].x).toBe(21.6);
    expect(one.den).toEqual({ x: 23, z: 40, r: 0, h: 0, cave: true });
    expect(one.rock).toEqual({ x: 8.3, z: 41.5, r: 0.6, h: 0.8 });
  });

  it('the leader looks out from the rock; every ground seat is clear of the rock and of each other', () => {
    const L = campLayout('gorge');
    expect(L.seats.leader).toEqual({ x: L.rock.x, z: L.rock.z, y: L.rock.h, face: Math.PI / 2 });
    expect(L.seats.elders).toHaveLength(2);
    expect(L.seats.kits).toHaveLength(4);
    const seats = groundSeats(L);
    for (const s of seats) {
      expect(Math.hypot(s.x - L.rock.x, s.z - L.rock.z) - L.rock.r, `${s.x},${s.z}`).toBeGreaterThanOrEqual(0.6 - 1e-9);
    }
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        expect(Math.hypot(seats[i].x - seats[j].x, seats[i].z - seats[j].z), `${i}/${j}`).toBeGreaterThanOrEqual(0.5);
      }
    }
    // the deputy stands between the rock and the camp's centre
    expect(Math.hypot(L.seats.deputy.x - L.cx, L.seats.deputy.z - L.cz)).toBeLessThan(Math.hypot(L.rock.x - L.cx, L.rock.z - L.cz));
  });

  it('the nursery and the elders are in the den, the deputy and the rock on the ledge', () => {
    const L = campLayout('gorge');
    for (const s of [...L.seats.elders, ...L.seats.kits]) expect(inRect(CAMP_DEN, s, 1.2), `${s.x},${s.z}`).toBe(true);
    const { cx, cz, r } = DISCS.gorge;
    for (const s of [L.seats.deputy, L.rock]) {
      expect(inRect(WIDE_LEDGE_RECT, s), `${s.x},${s.z}`).toBe(true);
      expect(Math.hypot(s.x - cx, s.z - cz), `${s.x},${s.z}`).toBeLessThanOrEqual(r);
    }
    expect(inRect(CAMP_DEN, L.den)).toBe(true);
  });

  it('addCamp draws the rock, the moss nests and the pile on the ledge, with one collider', () => {
    const scene = new THREE.Scene();
    const ground = gorgeGround();
    const area = { colliders: [], ground };
    addCamp(scene, area, 'gorge');
    expect(scene.children.map((o) => o.name).sort()).toEqual(['campBedding', 'campKill', 'campRock']);
    const rock = scene.getObjectByName('campRock');
    const bedding = scene.getObjectByName('campBedding');
    expect(bedding.userData.noCast).toBe(true);
    expect(rock.userData.noCast).toBeFalsy();
    scene.updateMatrixWorld(true);
    const rb = lowest(rock);
    expect(Math.abs(rb.min.y - 8)).toBeLessThanOrEqual(0.01);
    // the Highrock: its top at rock.h, its back stone to 1.0-1.2 m
    expect(rb.max.y - 8).toBeGreaterThanOrEqual(1.0);
    expect(rb.max.y - 8).toBeLessThanOrEqual(1.2);
    expect(Math.abs((rb.min.x + rb.max.x) / 2 - 8.3)).toBeLessThanOrEqual(0.2);
    expect(Math.abs((rb.min.z + rb.max.z) / 2 - 41.5)).toBeLessThanOrEqual(0.2);
    const bb = lowest(bedding);
    expect(bb.min.y - 8).toBeGreaterThanOrEqual(-0.05); // the nests rest within 5 cm of the ground
    expect(bb.min.y - 8).toBeLessThanOrEqual(0.05);
    expect(bb.max.y - bb.min.y).toBeLessThan(0.1); // low: no decal of its own
    expect(bb.max.y).toBeLessThan(8.25);
    // six nests, one under each elder and kit seat, all in the den
    const L = campLayout('gorge');
    expect(inRect(CAMP_DEN, { x: bb.min.x, z: bb.min.z })).toBe(true);
    expect(inRect(CAMP_DEN, { x: bb.max.x, z: bb.max.z })).toBe(true);
    const pos = bedding.geometry.attributes.position;
    for (const s of [...L.seats.elders, ...L.seats.kits]) {
      let near = 0;
      for (let i = 0; i < pos.count; i++) if (Math.hypot(pos.getX(i) - s.x, pos.getZ(i) - s.z) <= 0.45 + 1e-6) near++;
      expect(near, `${s.x},${s.z}`).toBeGreaterThan(0);
    }
    expect(area.colliders).toEqual([{ x: 8.3, z: 41.5, r: 0.6 }]);
  });

  it('the pile is one noCast mesh on the ledge, every vertex within 0.25 m above the ground under it', () => {
    const scene = new THREE.Scene();
    const ground = gorgeGround();
    addCamp(scene, { colliders: [], ground }, 'gorge');
    scene.updateMatrixWorld(true);
    const kill = scene.getObjectByName('campKill');
    expect(kill.isMesh).toBe(true);
    expect(kill.userData.noCast).toBe(true);
    expect(kill.userData.noMerge).toBe(true);
    const K = campDressing('gorge').kill;
    const pos = kill.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      expect(Math.hypot(x - K.x, z - K.z)).toBeLessThanOrEqual(0.4);
      const dy = pos.getY(i) - ground.y(x, z);
      expect(dy).toBeGreaterThanOrEqual(-0.03);
      expect(dy).toBeLessThanOrEqual(0.25);
    }
  });

  it('takes only the rock\'s Math.random draws (THREE uuids): the nests and the pile are built off it', () => {
    // No seeded test pins the Gorge build's draws (flattrace does not build the
    // Gorge), so the six old bedding discs' 24 uuid draws are simply gone.
    const real = Math.random;
    for (const withGround of [true, false]) {
      let draws = 0;
      Math.random = () => { draws++; return real(); };
      try {
        addCamp(new THREE.Scene(), withGround ? { colliders: [], ground: gorgeGround() } : { colliders: [] }, 'gorge');
      } finally {
        Math.random = real;
      }
      expect(draws, String(withGround)).toBe(28);
    }
  });

  it('the rock keeps its own decal: the bedding, 17 m off, makes none and the pile only its own small one', async () => {
    const { scanFootprints } = await import('../src/render/contactshadows.js');
    const scene = new THREE.Scene();
    const ground = gorgeGround();
    addCamp(scene, { colliders: [], ground }, 'gorge');
    scene.updateMatrixWorld(true);
    const fps = scanFootprints(scene, ground);
    // the rock's, and the pile's own (1.5 m off, 0.6 m across); none for the nests
    expect(fps).toHaveLength(2);
    const rockFp = fps.filter((f) => Math.hypot(f.x - 8.3, f.z - 41.5) < 0.3);
    expect(rockFp).toHaveLength(1);
    const K = campDressing('gorge').kill;
    expect(fps.filter((f) => Math.hypot(f.x - K.x, f.z - K.z) < 0.3)).toHaveLength(1);
    expect(fps.every((f) => f.x < 12)).toBe(true); // nothing in the den
  });

  it('on flat ground (no ground given) the rock and the bedding stand at y 0', () => {
    const scene = new THREE.Scene();
    addCamp(scene, { colliders: [] }, 'gorge');
    scene.updateMatrixWorld(true);
    expect(Math.abs(lowest(scene.getObjectByName('campRock')).min.y)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(lowest(scene.getObjectByName('campBedding')).min.y)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(lowest(scene.getObjectByName('campKill')).min.y)).toBeLessThanOrEqual(0.03);
  });

  it('campDiscs is the rock alone', () => {
    expect(campDiscs('gorge')).toEqual([{ x: 8.3, z: 41.5, r: 0.6 }]);
  });
});
