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

const { campLayout, addCamp, CAMP_TURN, campDiscs, LEDGE_CAMPS } = await import('../src/world/camp.js');
const { CAMP_DEN, WIDE_LEDGE_RECT, gorgeGround } = await import('../src/world/gorgeshape.js');
const { castFor, roamHomes } = await import('../src/clancast.js');
const { DISCS } = await import('../src/rivalclans.js');

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
  it('adds one group of three meshes and two colliders in a camp area', () => {
    for (const a of CAMPS) {
      const scene = new THREE.Scene();
      const area = { colliders: [] };
      addCamp(scene, area, a);
      expect(scene.children).toHaveLength(1);
      const group = scene.children[0];
      expect(group.isGroup).toBe(true);
      const meshes = [];
      group.traverse((o) => { if (o.isMesh) meshes.push(o); });
      expect(meshes).toHaveLength(3);
      expect(group.children).toHaveLength(3);
      const L = campLayout(a);
      expect(area.colliders).toEqual([
        { x: L.den.x, z: L.den.z, r: L.den.r },
        { x: L.rock.x, z: L.rock.z, r: L.rock.r },
      ]);
      // the doorway is a flat disc: out of the shadow pass
      const door = group.children.find((m) => m.name === 'campDoor');
      expect(door.userData.noCast).toBe(true);
    }
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

  it('addCamp draws the rock and the bedding on the ledge, with one collider', () => {
    const scene = new THREE.Scene();
    const ground = gorgeGround();
    const area = { colliders: [], ground };
    addCamp(scene, area, 'gorge');
    expect(scene.children).toHaveLength(1);
    const group = scene.children[0];
    expect(group.name).toBe('clanCamp');
    const meshes = [];
    group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.map((m) => m.name).sort()).toEqual(['campBedding', 'campRock']);
    const rock = group.getObjectByName('campRock');
    const bedding = group.getObjectByName('campBedding');
    expect(bedding.userData.noCast).toBe(true);
    expect(rock.userData.noCast).toBeFalsy();
    scene.updateMatrixWorld(true);
    const rb = lowest(rock);
    expect(Math.abs(rb.min.y - 8)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(rb.max.y - 8.8)).toBeLessThanOrEqual(0.01);
    expect((rb.min.x + rb.max.x) / 2).toBeCloseTo(8.3, 1);
    const bb = lowest(bedding);
    expect(Math.abs(bb.min.y - 8)).toBeLessThanOrEqual(0.01);
    expect(bb.max.y).toBeLessThan(8.1);
    // six discs, one under each elder and kit seat, all in the den
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

  it('on flat ground (no ground given) the rock and the bedding stand at y 0', () => {
    const scene = new THREE.Scene();
    addCamp(scene, { colliders: [] }, 'gorge');
    scene.updateMatrixWorld(true);
    expect(Math.abs(lowest(scene.getObjectByName('campRock')).min.y)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(lowest(scene.getObjectByName('campBedding')).min.y)).toBeLessThanOrEqual(0.01);
  });

  it('campDiscs is the rock alone', () => {
    expect(campDiscs('gorge')).toEqual([{ x: 8.3, z: 41.5, r: 0.6 }]);
  });
});
