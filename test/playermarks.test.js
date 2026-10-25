import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createPlayerMarks, scratchFacing, CONTESTED_COLOR } from '../src/render/playermarks.js';
import { propsFor } from '../src/propsets.js';
import { markKey, markOpacity } from '../src/marks.js';
import { buildCarryMesh } from '../src/carryables.js';

const SLOTS = propsFor('den').keepSlots;

// den marks, oldest first (as progression.marksIn returns them).
function denMarks(items) {
  return items.map((item, i) => ({
    kind: 'den', id: `neighborhood-${item}-1`, x: 0, z: 0, at: 1000 + i, contested: false, item,
  }));
}

function meshesIn(scene) {
  const out = [];
  scene.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

function materialsOf(root) {
  const out = [];
  root.traverse((o) => { if (o.material) out.push(o.material); });
  return out;
}

describe('createPlayerMarks in the den', () => {
  it('shows each kept item, newest in the first slot, resting on the floor', () => {
    const scene = new THREE.Scene();
    const marks = denMarks(['sock', 'stick', 'acorn']);
    const pm = createPlayerMarks(scene, 'den', marks, { keepSlots: SLOTS });
    expect(pm.list).toHaveLength(3);
    // newest first
    expect(pm.list[0].key).toBe(markKey(marks[2]));
    expect(pm.list[1].key).toBe(markKey(marks[1]));
    expect(pm.list[2].key).toBe(markKey(marks[0]));
    pm.list.forEach((e, i) => {
      expect(e.kind).toBe('den');
      expect(e.mesh.parent).toBe(scene);
      expect(e.mesh.position.x).toBe(SLOTS[i].x);
      expect(e.mesh.position.z).toBe(SLOTS[i].z);
      expect(e.contested).toBe(false);
      // the lowest point of the mesh sits on the slot's own height, 2 mm up
      // so a flat thing never z-fights the boards
      const box = new THREE.Box3().setFromObject(e.mesh);
      expect(box.min.y).toBeCloseTo(SLOTS[i].y + 0.002, 5);
    });
  });

  it('the seventh and eighth kept items are fainter, and only they are transparent', () => {
    const scene = new THREE.Scene();
    const marks = denMarks(['sock', 'stick', 'acorn', 'leaf', 'shell', 'cap', 'rope', 'glove']);
    const pm = createPlayerMarks(scene, 'den', marks, { keepSlots: SLOTS });
    expect(pm.list).toHaveLength(8);
    pm.list.forEach((e, rank) => {
      for (const m of materialsOf(e.mesh)) {
        expect(m.opacity).toBeCloseTo(markOpacity(rank), 5);
        expect(m.transparent).toBe(markOpacity(rank) < 1);
      }
    });
    expect(markOpacity(6)).toBeLessThan(1);
    expect(markOpacity(7)).toBeLessThan(markOpacity(6));
  });

  it('never shares a material between two meshes, so fading one never fades another', () => {
    const scene = new THREE.Scene();
    const pm = createPlayerMarks(scene, 'den', denMarks(['sock', 'sock', 'sock']), { keepSlots: SLOTS });
    const seen = new Set();
    for (const m of meshesIn(scene)) {
      expect(seen.has(m.material)).toBe(false);
      seen.add(m.material);
    }
    pm.dispose();
  });

  it('an unknown item kind still renders (fallback mesh) and an empty den renders nothing', () => {
    const scene = new THREE.Scene();
    const empty = createPlayerMarks(scene, 'den', [], { keepSlots: SLOTS });
    expect(empty.list).toEqual([]);
    expect(meshesIn(scene)).toHaveLength(0);

    const odd = createPlayerMarks(scene, 'den', denMarks(['spaceship']), { keepSlots: SLOTS });
    expect(odd.list).toHaveLength(1);
    expect(meshesIn(scene).length).toBeGreaterThan(0);
    // and a den with no slots at all shows nothing rather than throwing
    const noSlots = createPlayerMarks(new THREE.Scene(), 'den', denMarks(['sock']));
    expect(noSlots.list).toEqual([]);
  });

  it('ignores non-den marks in the den, and lays no den keepsake outdoors', () => {
    const scene = new THREE.Scene();
    const mixed = [
      { kind: 'scratch', id: 'neighborhood-post-1', x: 1, z: 1, at: 5, contested: false, item: null },
      { kind: 'den', id: 'neighborhood-sock-1', x: 0, z: 0, at: 6, contested: false, item: 'sock' },
    ];
    const pm = createPlayerMarks(scene, 'den', mixed, { keepSlots: SLOTS });
    expect(pm.list).toHaveLength(1);
    const out = createPlayerMarks(new THREE.Scene(), 'park', mixed, { keepSlots: SLOTS });
    expect(out.list.map((e) => e.kind)).toEqual(['scratch']);
  });

  it('sync adds a new item and drops the evicted ninth-oldest one', () => {
    const scene = new THREE.Scene();
    const eight = denMarks(['sock', 'stick', 'acorn', 'leaf', 'shell', 'cap', 'rope', 'glove']);
    const pm = createPlayerMarks(scene, 'den', eight, { keepSlots: SLOTS });
    const keptMeshes = new Map(pm.list.map((e) => [e.key, e.mesh]));
    const oldest = pm.list[7];
    const evictedMesh = oldest.mesh;

    const newest = { kind: 'den', id: 'park-pinecone-1', x: 0, z: 0, at: 5000, contested: false, item: 'pinecone' };
    // the save's cap: the oldest falls off, the new one arrives
    pm.sync([...eight.slice(1), newest]);

    expect(pm.list).toHaveLength(8);
    expect(pm.list[0].key).toBe(markKey(newest));
    expect(pm.list.some((e) => e.key === oldest.key)).toBe(false);
    expect(evictedMesh.parent).toBeNull();
    // survivors keep their mesh (not rebuilt) but move down a slot
    for (const e of pm.list.slice(1)) expect(e.mesh).toBe(keptMeshes.get(e.key));
    pm.list.forEach((e, i) => {
      expect(e.mesh.position.x).toBe(SLOTS[i].x);
      expect(e.mesh.position.z).toBe(SLOTS[i].z);
    });
    // and the opacities follow the new ranks
    pm.list.forEach((e, rank) => {
      for (const m of materialsOf(e.mesh)) expect(m.opacity).toBeCloseTo(markOpacity(rank), 5);
    });
  });

  it('sync with the same marks changes nothing', () => {
    const scene = new THREE.Scene();
    const marks = denMarks(['sock', 'stick']);
    const pm = createPlayerMarks(scene, 'den', marks, { keepSlots: SLOTS });
    const before = pm.list.map((e) => e.mesh);
    pm.sync(marks.map((m) => ({ ...m })));
    expect(pm.list.map((e) => e.mesh)).toEqual(before);
  });

  it('setContested flags the entry and tolerates an unknown key', () => {
    const scene = new THREE.Scene();
    const pm = createPlayerMarks(scene, 'den', denMarks(['sock']), { keepSlots: SLOTS });
    pm.setContested('nope');
    expect(pm.list[0].contested).toBe(false);
    pm.setContested(pm.list[0].key);
    expect(pm.list[0].contested).toBe(true);
    expect(() => pm.update(1)).not.toThrow();
  });

  it('dispose removes every mesh and disposes every geometry and material once', () => {
    const scene = new THREE.Scene();
    const eight = denMarks(['sock', 'stick', 'acorn', 'leaf', 'shell', 'cap', 'rope', 'glove']);
    const pm = createPlayerMarks(scene, 'den', eight, { keepSlots: SLOTS });
    const things = new Set();
    for (const m of meshesIn(scene)) {
      things.add(m.geometry);
      things.add(m.material);
    }
    const counts = new Map();
    for (const o of things) {
      counts.set(o, 0);
      o.addEventListener('dispose', () => counts.set(o, counts.get(o) + 1));
    }
    expect(counts.size).toBeGreaterThan(8);
    pm.dispose();
    pm.dispose(); // idempotent
    expect(meshesIn(scene)).toHaveLength(0);
    expect(scene.children).toHaveLength(0);
    for (const [o, n] of counts) expect(n, o.type).toBe(1);
    expect(pm.list).toEqual([]);
  });

  it('an evicted item has its own geometry and materials disposed exactly once', () => {
    const scene = new THREE.Scene();
    const marks = denMarks(['sock', 'stick']);
    const pm = createPlayerMarks(scene, 'den', marks, { keepSlots: SLOTS });
    const gone = pm.list[1].mesh; // the older one: the sock
    const counts = [];
    gone.traverse((o) => {
      for (const x of [o.geometry, o.material]) {
        if (!x) continue;
        const c = { n: 0 };
        x.addEventListener('dispose', () => { c.n += 1; });
        counts.push(c);
      }
    });
    pm.sync([marks[1]]);
    expect(counts.length).toBeGreaterThan(0);
    for (const c of counts) expect(c.n).toBe(1);
  });
});

describe('buildCarryMesh fallback, which the den relies on', () => {
  it('returns a group with a mesh for an unknown kind', () => {
    expect(buildCarryMesh('???').children.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The outdoor half (Task 11): every kind where it was left, faded by its rank
// among ALL of the area's marks.
// ---------------------------------------------------------------------------

// A mark as the save holds it.
const mark = (kind, fields) => ({ kind, id: null, x: 0, z: 0, at: 1, contested: false, item: null, ...fields });

// The rank fade alone: each material's opacity over its own resting opacity.
function fadesOf(root) {
  return materialsOf(root).map((m) => m.opacity / (m.userData.baseOpacity ?? 1));
}

function lowestY(root) {
  return new THREE.Box3().setFromObject(root).min.y;
}

describe('createPlayerMarks outdoors', () => {
  const TREE = propsFor('park').markables.find((m) => m.id === 'park-tree-1');
  // park-tree-1 sits on the west oak's east face; this is the oak's collider.
  const OAK = { x: -26, z: -14, r: 0.7 };

  // Eight marks in the park, oldest first: the save's order.
  function parkEight() {
    return [
      mark('dig', { x: 3, z: 4, at: 100 }),                                      // rank 7, oldest
      mark('drop', { id: 'park-stick-1', x: 5, z: 6, at: 110, item: 'stick' }),  // rank 6
      mark('border', { id: 'park-border-3', x: -30, z: 28, at: 120 }),           // rank 5
      mark('scratch', { id: TREE.id, x: TREE.x, z: TREE.z, at: 130 }),           // rank 4
      mark('dig', { x: -3, z: 9, at: 140 }),
      mark('dig', { x: -6, z: 9, at: 150 }),
      mark('drop', { id: 'park-acorn-1', x: 12, z: -2, at: 160, item: 'acorn' }),
      mark('dig', { x: 9, z: 9, at: 170 }),                                      // rank 0, newest
    ];
  }

  it('each kind renders where it should, and the oldest two are fainter', () => {
    const scene = new THREE.Scene();
    const marks = parkEight();
    const pm = createPlayerMarks(scene, 'park', marks, { colliders: [OAK] });
    expect(pm.list).toHaveLength(8);
    // newest first, every kind ranked together
    expect(pm.list.map((e) => e.key)).toEqual([...marks].reverse().map(markKey));
    const byKey = new Map(pm.list.map((e) => [e.key, e]));
    for (const e of pm.list) expect(e.mesh.parent).toBe(scene);

    // dig: a flat dark disc on the ground at its spot, lifted clear of it
    const dig = byKey.get(markKey(marks[0]));
    expect(dig.kind).toBe('dig');
    expect(dig.mesh.position.x).toBe(3);
    expect(dig.mesh.position.z).toBe(4);
    expect(dig.mesh.position.y).toBeCloseTo(0.022, 5);
    const disc = dig.mesh.children[0];
    expect(disc.geometry.type).toBe('CircleGeometry');
    expect(disc.geometry.parameters.radius).toBe(0.28);
    expect(disc.material.type).toBe('MeshBasicMaterial');

    // drop: the thing itself, lying on the ground at x, z
    const drop = byKey.get(markKey(marks[1]));
    expect(drop.mesh.position.x).toBe(5);
    expect(drop.mesh.position.z).toBe(6);
    expect(lowestY(drop.mesh)).toBeCloseTo(0.002, 5);

    // border: a small paw (pad + four toes) flat on the border point, above
    // the rival's own decals (y 0.025)
    const paw = byKey.get(markKey(marks[2]));
    expect(paw.mesh.position.x).toBe(-30);
    expect(paw.mesh.position.z).toBe(28);
    expect(paw.mesh.position.y).toBeGreaterThan(0.025);
    expect(paw.mesh.children).toHaveLength(5);
    for (const c of paw.mesh.children) expect(c.geometry.type).toBe('CircleGeometry');

    // scratch: upright at the foot of the trunk, on the face the cat comes at
    // it from (east, away from the trunk's centre), and facing that way
    const scratch = byKey.get(markKey(marks[3]));
    expect(scratch.mesh.position.x).toBeGreaterThan(TREE.x);
    expect(scratch.mesh.position.x).toBeLessThan(TREE.x + 0.05);
    expect(scratch.mesh.position.z).toBeCloseTo(TREE.z, 5);
    const facing = new THREE.Vector3(0, 0, 1).applyEuler(scratch.mesh.rotation);
    expect(facing.x).toBeCloseTo(1, 5);
    expect(facing.z).toBeCloseTo(0, 5);
    // a patch and three claw stripes, off the ground and below cat height
    expect(scratch.mesh.children).toHaveLength(4);
    const box = new THREE.Box3().setFromObject(scratch.mesh);
    expect(box.min.y).toBeGreaterThan(0.05);
    expect(box.max.y).toBeLessThan(0.5);

    // the two oldest in the area are the faint ones, whatever their kind
    pm.list.forEach((e, rank) => {
      for (const f of fadesOf(e.mesh)) expect(f).toBeCloseTo(markOpacity(rank), 5);
    });
    expect(fadesOf(drop.mesh)[0]).toBeCloseTo(markOpacity(6), 5);
    expect(fadesOf(dig.mesh)[0]).toBeCloseTo(markOpacity(7), 5);
    expect(markOpacity(7)).toBeLessThan(markOpacity(6));
    expect(markOpacity(6)).toBeLessThan(1);
  });

  it('a scratch faces the side the cat comes from', () => {
    // inside a trunk's collider: outward from its centre
    const f1 = scratchFacing({ x: 0, z: -0.4 }, { colliders: [{ x: 0, z: 0, r: 0.6 }] });
    expect(f1.x).toBeCloseTo(0, 5);
    expect(f1.z).toBeCloseTo(-1, 5);
    // a quayside bollard: toward the open ground (here only +x is walkable)
    const f2 = scratchFacing({ x: 0, z: 0 }, { isWalkable: (x) => x > 0.2, spawn: { x: -50, z: 0 } });
    expect(f2.x).toBeCloseTo(1, 5);
    expect(f2.z).toBeCloseTo(0, 5);
    // open all round: back toward the spawn
    const f3 = scratchFacing({ x: 0, z: 0 }, { isWalkable: () => true, spawn: { x: 0, z: -10 } });
    expect(f3.z).toBeCloseTo(-1, 5);
    // nothing to go on: still a unit vector
    const f4 = scratchFacing({ x: 0, z: 0 });
    expect(Math.hypot(f4.x, f4.z)).toBeCloseTo(1, 5);
  });

  it('a mark for a prop that no longer exists renders at its stored spot', () => {
    const scene = new THREE.Scene();
    const gone = mark('scratch', { id: 'park-post-9', x: 10, z: 12, at: 5 });
    const pm = createPlayerMarks(scene, 'park', [gone]);
    expect(pm.list).toHaveLength(1);
    const p = pm.list[0].mesh.position;
    expect(Math.hypot(p.x - 10, p.z - 12)).toBeLessThan(0.15);
    // and a drop of a carryable since retired still lies where it was put
    const drop = createPlayerMarks(scene, 'park', [mark('drop', { id: 'park-stick-9', x: -4, z: 2, at: 6, item: 'stick' })]);
    expect(drop.list[0].mesh.position.x).toBe(-4);
    expect(drop.list[0].mesh.position.z).toBe(2);
  });

  it('a mark with no usable position is skipped, not thrown on', () => {
    const scene = new THREE.Scene();
    const bad = [
      null, 7, 'scratch', [],
      mark('scratch', { id: 'park-post-9', x: NaN, z: 1, at: 1 }), // a retired prop, and no spot
      mark('dig', { x: undefined, z: 2, at: 2 }),
      mark('drop', { id: 'park-stick-1', x: 1, z: Infinity, at: 3, item: 'stick' }),
      mark('border', { id: 'park-border-1', x: '1', z: 2, at: 4 }),
      mark('teleport', { x: 1, z: 1, at: 5 }),
      mark('den', { id: 'park-stick-1', x: 1, z: 1, at: 6, item: 'stick' }), // a keepsake belongs in the den
    ];
    let pm;
    expect(() => { pm = createPlayerMarks(scene, 'park', bad); }).not.toThrow();
    expect(pm.list).toEqual([]);
    // a scratch on a CURRENT markable needs no stored spot: the prop has one
    const onTree = mark('scratch', { id: TREE.id, x: NaN, z: NaN, at: 9 });
    expect(() => pm.sync([...bad, onTree])).not.toThrow();
    expect(pm.list.map((e) => e.key)).toEqual([markKey(onTree)]);
    expect(() => pm.sync(undefined)).not.toThrow();
    expect(pm.list).toEqual([]);
  });

  it('setContested swaps to the contested look and sync keeps it', () => {
    const scene = new THREE.Scene();
    const marks = [
      mark('dig', { x: 3, z: 4, at: 1 }),
      mark('scratch', { id: TREE.id, x: TREE.x, z: TREE.z, at: 2 }),
    ];
    const pm = createPlayerMarks(scene, 'park', marks, { colliders: [OAK] });
    const scratch = pm.list.find((e) => e.kind === 'scratch');
    const dig = pm.list.find((e) => e.kind === 'dig');
    const [patch, ...claws] = scratch.mesh.children;
    const clawColor = claws[0].material.color.getHex();
    const patchColor = patch.material.color.getHex();
    const before = fadesOf(scratch.mesh);
    expect(clawColor).not.toBe(CONTESTED_COLOR);

    pm.setContested(scratch.key);
    expect(scratch.contested).toBe(true);
    for (const c of claws) expect(c.material.color.getHex()).toBe(CONTESTED_COLOR);
    expect(patch.material.color.getHex()).toBe(patchColor); // the scuff stays; the claw marks go pale
    expect(fadesOf(scratch.mesh)).toEqual(before);           // at its own opacity
    expect(dig.contested).toBe(false);                       // only that one
    expect(dig.mesh.children[0].material.color.getHex()).not.toBe(CONTESTED_COLOR);
    pm.setContested('scratch:nope'); // tolerated

    // the save says contested: sync keeps the look, on the same mesh
    const mesh = scratch.mesh;
    pm.sync([marks[0], { ...marks[1], contested: true }]);
    const again = pm.list.find((e) => e.kind === 'scratch');
    expect(again.mesh).toBe(mesh);
    expect(again.contested).toBe(true);
    for (const c of claws) expect(c.material.color.getHex()).toBe(CONTESTED_COLOR);

    // re-marked (contested cleared in the save): sync takes the look off
    pm.sync([marks[0], { ...marks[1], at: 3 }]);
    expect(pm.list.find((e) => e.kind === 'scratch').contested).toBe(false);
    for (const c of claws) expect(c.material.color.getHex()).toBe(clawColor);

    // and a contested mark from a fresh load is pale from the start
    const fresh = createPlayerMarks(new THREE.Scene(), 'park', [{ ...marks[0], contested: true }]);
    expect(fresh.list[0].mesh.children[0].material.color.getHex()).toBe(CONTESTED_COLOR);
  });

  it('puts up a post where a markable has nothing standing, and only there', () => {
    for (const area of ['neighborhood', 'park', 'seaside', 'docks']) {
      const scene = new THREE.Scene();
      const pm = createPlayerMarks(scene, area, []);
      const want = propsFor(area).markables.filter((m) => m.mesh === true);
      expect(pm.posts.map((p) => p.id)).toEqual(want.map((m) => m.id));
      pm.posts.forEach((p, i) => {
        expect(p.mesh.parent).toBe(scene);
        expect(p.mesh.position.x).toBe(want[i].x);
        expect(p.mesh.position.z).toBe(want[i].z);
        expect(lowestY(p.mesh)).toBeCloseTo(0, 5);
      });
      expect(pm.list).toEqual([]);
    }
    // the den has no markables and no posts
    expect(createPlayerMarks(new THREE.Scene(), 'den', [], { keepSlots: SLOTS }).posts).toEqual([]);
  });

  it('sync adds and evicts by key; dispose frees every geometry and material once', () => {
    const scene = new THREE.Scene();
    const eight = parkEight();
    const pm = createPlayerMarks(scene, 'park', eight, { colliders: [OAK] });
    const oldest = pm.list[7];
    const survivors = new Map(pm.list.slice(0, 7).map((e) => [e.key, e.mesh]));
    const ninth = mark('dig', { x: 0, z: -9, at: 999 });
    pm.sync([...eight.slice(1), ninth]);
    expect(pm.list).toHaveLength(8);
    expect(pm.list[0].key).toBe(markKey(ninth));
    expect(oldest.mesh.parent).toBeNull();
    for (const e of pm.list.slice(1)) expect(e.mesh).toBe(survivors.get(e.key));
    // ranks moved down one, and the fades with them
    pm.list.forEach((e, rank) => {
      for (const f of fadesOf(e.mesh)) expect(f).toBeCloseTo(markOpacity(rank), 5);
    });

    const things = new Set();
    for (const m of meshesIn(scene)) {
      things.add(m.geometry);
      things.add(m.material);
    }
    expect(pm.posts.length).toBe(1);
    const counts = new Map();
    for (const o of things) {
      counts.set(o, 0);
      o.addEventListener('dispose', () => counts.set(o, counts.get(o) + 1));
    }
    pm.dispose();
    pm.dispose(); // idempotent
    pm.sync(eight); // and inert after
    expect(scene.children).toHaveLength(0);
    for (const [o, n] of counts) expect(n, o.type).toBe(1);
    expect(pm.list).toEqual([]);
    expect(pm.posts).toEqual([]);
  });

  it('never shares a material between two meshes outdoors either', () => {
    const scene = new THREE.Scene();
    createPlayerMarks(scene, 'park', parkEight(), { colliders: [OAK] });
    const seen = new Set();
    for (const m of meshesIn(scene)) {
      expect(seen.has(m.material)).toBe(false);
      seen.add(m.material);
    }
  });

  it('update(t) takes the clock and changes nothing', () => {
    const pm = createPlayerMarks(new THREE.Scene(), 'park', parkEight(), { colliders: [OAK] });
    const snap = () => pm.list.map((e) => [e.mesh.position.toArray(), fadesOf(e.mesh)]);
    const before = snap();
    pm.update(12.5);
    expect(snap()).toEqual(before);
  });
});

// Against the REAL built areas: every markable's claw marks face ground a cat
// can stand on, within the mark prompt's reach. Same headless canvas stub as
// test/propsets.test.js (the only DOM the builders touch).
describe('scratch facings in the real areas', () => {
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

  it.each(['neighborhood', 'park', 'seaside', 'docks'])('%s', async (area) => {
    const { build } = await import(`../src/world/${area}.js`);
    const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
    const data = build(new THREE.Scene());
    const isWalkable = (x, z) => isWalkableAt(data, x, z);
    for (const m of propsFor(area).markables) {
      const f = scratchFacing(m, { colliders: data.colliders, isWalkable, spawn: data.spawn });
      // where the cat stands: just clear of a trunk it is scratching, or a
      // step out from a post, on the side the marks face
      const held = data.colliders.find((c) => Math.hypot(m.x - c.x, m.z - c.z) < c.r);
      const out = held ? held.r + CAT_RADIUS + 0.31 - Math.hypot(m.x - held.x, m.z - held.z) : 0.6;
      const stand = { x: m.x + f.x * out, z: m.z + f.z * out };
      expect(isWalkable(stand.x, stand.z), `${m.id} faces ${f.x.toFixed(2)},${f.z.toFixed(2)}`).toBe(true);
      expect(Math.hypot(stand.x - m.x, stand.z - m.z), m.id).toBeLessThanOrEqual(1.2);
    }
  });
});
