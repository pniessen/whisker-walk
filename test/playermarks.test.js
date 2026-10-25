import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPlayerMarks } from '../src/render/playermarks.js';
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
      // the lowest point of the mesh sits on the slot's own height
      const box = new THREE.Box3().setFromObject(e.mesh);
      expect(box.min.y).toBeCloseTo(SLOTS[i].y, 5);
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

  it('ignores non-den marks in the den, and builds nothing outdoors yet', () => {
    const scene = new THREE.Scene();
    const mixed = [
      { kind: 'scratch', id: 'neighborhood-post-1', x: 1, z: 1, at: 5, contested: false, item: null },
      { kind: 'den', id: 'neighborhood-sock-1', x: 0, z: 0, at: 6, contested: false, item: 'sock' },
    ];
    const pm = createPlayerMarks(scene, 'den', mixed, { keepSlots: SLOTS });
    expect(pm.list).toHaveLength(1);
    const outdoor = new THREE.Scene();
    const out = createPlayerMarks(outdoor, 'park', mixed, { keepSlots: SLOTS });
    expect(out.list).toEqual([]);
    expect(outdoor.children).toHaveLength(0);
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
