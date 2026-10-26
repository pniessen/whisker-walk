// v21 Stream 5 Task 6: the den shop lives inside the den, so a piece placed or
// cleared during a den walk must appear or vanish in the running room. These
// pin den.build's live re-place API (areaData.furniture.place) against the
// build-time path: a spot placed live must leave the room exactly as a fresh
// build with that placement would.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { DEN_ITEMS, DEN_SPOTS } from '../src/den.js';

// Same headless stub test/den.test.js installs (see the long comment there).
// Must be installed before the world module imports.
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

const { build } = await import('../src/world/den.js');

const ITEM_IDS = Object.keys(DEN_ITEMS);
const key = (o) => JSON.stringify(o);
const sorted = (arr) => arr.map(key).sort();
const room = (placed = {}) => {
  const scene = new THREE.Scene();
  const data = build(scene, { placed });
  return { scene, data };
};
// Everything the walking cat and the den cats read off the room.
const plan = (data) => ({
  colliders: sorted(data.colliders),
  perches: sorted(data.perches),
  boxes: sorted(data.boxes),
});

describe('den.build furniture.place — the live re-place', () => {
  it('build returns a furniture handle that knows what stands at each spot', () => {
    const [a] = DEN_SPOTS;
    const { data } = room({ [a.id]: 'cattree' });
    expect(typeof data.furniture.place).toBe('function');
    expect(data.furniture.at(a.id)).toBe('cattree');
    expect(data.furniture.at(DEN_SPOTS[1].id)).toBe(null);
  });

  it('every piece, at every spot: placing it live equals building with it', () => {
    for (const itemId of ITEM_IDS) {
      for (const spot of DEN_SPOTS) {
        const live = room();
        const before = live.scene.children.length;
        const res = live.data.furniture.place(spot.id, itemId);
        expect(res.added).toBeTruthy();
        expect(res.removed).toBe(null);
        expect(live.scene.children.length).toBe(before + 1);
        expect(res.added.parent).toBe(live.scene);
        expect(plan(live.data)).toEqual(plan(room({ [spot.id]: itemId }).data));
      }
    }
  });

  it('clearing a spot takes the piece and everything it brought with it', () => {
    const spot = DEN_SPOTS[2];
    for (const itemId of ITEM_IDS) {
      const live = room({ [spot.id]: itemId });
      const before = live.scene.children.length;
      const res = live.data.furniture.place(spot.id, null);
      expect(res.removed).toBeTruthy();
      expect(res.removed.parent).toBe(null);
      expect(res.added).toBe(null);
      expect(live.scene.children.length).toBe(before - 1);
      expect(plan(live.data)).toEqual(plan(room().data));
      expect(live.data.furniture.at(spot.id)).toBe(null);
    }
  });

  it('swapping one piece for another, and a move between two spots', () => {
    const [a, b] = DEN_SPOTS;
    const live = room({ [a.id]: 'armchair', [b.id]: 'tunnel' });
    live.data.furniture.place(a.id, 'telly');
    expect(plan(live.data)).toEqual(plan(room({ [a.id]: 'telly', [b.id]: 'tunnel' }).data));
    // a move is two changes: the old spot cleared, the new one filled
    live.data.furniture.place(b.id, null);
    live.data.furniture.place(DEN_SPOTS[5].id, 'tunnel');
    expect(plan(live.data)).toEqual(plan(room({ [a.id]: 'telly', [DEN_SPOTS[5].id]: 'tunnel' }).data));
  });

  it('mutates the very arrays the walk holds, never replaces them', () => {
    const { data } = room();
    const { colliders, perches, boxes } = data;
    data.furniture.place(DEN_SPOTS[0].id, 'cattree');
    data.furniture.place(DEN_SPOTS[1].id, 'tunnel');
    expect(data.colliders).toBe(colliders);
    expect(data.perches).toBe(perches);
    expect(data.boxes).toBe(boxes);
  });

  it('reports the perches it took away, by identity, so a perched cat can be set down', () => {
    const spot = DEN_SPOTS[0];
    const { data } = room({ [spot.id]: 'armchair' });
    const mine = data.perches.filter((p) => Math.hypot(p.x - spot.x, p.z - spot.z) < 0.5);
    expect(mine.length).toBe(2);
    const res = data.furniture.place(spot.id, null);
    expect(res.removedPerches).toHaveLength(2);
    for (const p of res.removedPerches) expect(mine).toContain(p);
  });

  it('calls prepare with the new piece before it joins the scene', () => {
    const { scene, data } = room();
    let seen = null;
    data.furniture.place(DEN_SPOTS[3].id, 'lamp', {
      prepare: (mesh) => { seen = { mesh, inScene: mesh.parent === scene }; },
    });
    expect(seen.mesh).toBeTruthy();
    expect(seen.inScene).toBe(false);
    expect(seen.mesh.parent).toBe(scene);
  });

  it('the same piece again, an unknown spot, or nothing to clear: no change', () => {
    const spot = DEN_SPOTS[4];
    const { scene, data } = room({ [spot.id]: 'bed' });
    const n = scene.children.length;
    const snap = plan(data);
    expect(data.furniture.place(spot.id, 'bed')).toEqual({ added: null, removed: null, removedPerches: [] });
    expect(data.furniture.place('no-such-spot', 'bed')).toEqual({ added: null, removed: null, removedPerches: [] });
    expect(data.furniture.place(DEN_SPOTS[5].id, null)).toEqual({ added: null, removed: null, removedPerches: [] });
    expect(scene.children.length).toBe(n);
    expect(plan(data)).toEqual(snap);
  });

  it('an id the catalog does not know clears the spot, as build does', () => {
    const spot = DEN_SPOTS[4];
    const { data } = room({ [spot.id]: 'bed' });
    const res = data.furniture.place(spot.id, 'hover-sofa');
    expect(res.removed).toBeTruthy();
    expect(res.added).toBe(null);
    expect(plan(data)).toEqual(plan(room().data));
  });
});
