// v21 Stream 5 Task 6: the walk-side half of placing furniture in the running
// den (game/denlive.js). den.build's furniture.place swaps the piece and its
// colliders/perches/box; this module does what walk.js did to every prop at
// startWalk — merge its leaves, set its shadow casting, give it a contact
// decal — and frees what was taken out.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { DEN_SPOTS } from '../src/den.js';

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
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { mergeStaticProps, MERGED_FLAG } = await import('../src/render/mergeprops.js');
const { assignShadowCasters } = await import('../src/render/rig.js');
const { applyDenSpot } = await import('../src/game/denlive.js');

// The startWalk order for a den: build, decals, merge, then (later) casters.
function denSession(placed = {}) {
  const scene = new THREE.Scene();
  const areaData = build(scene, { placed });
  const decals = createContactShadows(scene);
  mergeStaticProps(scene);
  assignShadowCasters(scene);
  const cat = new THREE.Group();
  scene.add(cat);
  return { scene, areaData, decals, cat, perched: null };
}
const fakePlayer = () => ({ perchY: 0, halt: vi.fn() });
const meshCount = (obj) => {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh) n++; });
  return n;
};

describe('applyDenSpot', () => {
  it('a placed piece is merged, casts like a build-time prop, and gets its decal', () => {
    const spot = DEN_SPOTS[1];
    const live = denSession();
    const fresh = denSession({ [spot.id]: 'dresser' });
    const decalsBefore = live.decals.staticCount;
    expect(applyDenSpot(live, spot.id, 'dresser', { player: fakePlayer() })).toBe(true);
    expect(live.decals.staticCount).toBe(fresh.decals.staticCount);
    expect(live.decals.staticCount).toBe(decalsBefore + 1);
    const piece = live.scene.children.find((c) =>
      Math.abs(c.position.x - spot.x) < 1e-6 && Math.abs(c.position.z - spot.z) < 1e-6 && c !== live.cat);
    expect(piece).toBeTruthy();
    // the same draw-call count the build-time merge would have produced
    const freshPiece = fresh.scene.children.find((c) =>
      Math.abs(c.position.x - spot.x) < 1e-6 && Math.abs(c.position.z - spot.z) < 1e-6);
    expect(meshCount(piece)).toBe(meshCount(freshPiece));
    let merged = 0;
    piece.traverse((o) => { if (o.userData[MERGED_FLAG]) merged++; });
    expect(merged).toBeGreaterThan(0);
    // shadows exactly as the sweep set them on the build-time twin
    const flags = (o) => { const out = []; o.traverse((m) => { if (m.isMesh) out.push([m.castShadow, m.receiveShadow]); }); return out; };
    expect(flags(piece)).toEqual(flags(freshPiece));
  });

  it('clearing a piece drops its decal and frees its GPU resources', () => {
    const spot = DEN_SPOTS[1];
    const live = denSession({ [spot.id]: 'dresser' });
    const empty = denSession();
    const piece = live.scene.children.find((c) =>
      Math.abs(c.position.x - spot.x) < 1e-6 && Math.abs(c.position.z - spot.z) < 1e-6);
    let freed = 0;
    piece.traverse((o) => { if (o.geometry) o.geometry.addEventListener('dispose', () => { freed++; }); });
    expect(applyDenSpot(live, spot.id, null, { player: fakePlayer() })).toBe(true);
    expect(piece.parent).toBe(null);
    expect(freed).toBeGreaterThan(0);
    expect(live.decals.staticCount).toBe(empty.decals.staticCount);
  });

  it('a cat sitting on the piece that goes is set down on the floor', () => {
    const spot = DEN_SPOTS[1];
    const live = denSession({ [spot.id]: 'cattree' });
    const perch = live.areaData.perches.find((p) => p.label === 'top of the cat tree');
    live.perched = perch;
    live.cat.position.set(perch.x, perch.y, perch.z);
    const player = fakePlayer();
    player.perchY = perch.y;
    applyDenSpot(live, spot.id, null, { player });
    expect(live.perched).toBe(null);
    expect(player.perchY).toBe(0);
    expect(live.cat.position.y).toBe(0);
    expect(player.halt).toHaveBeenCalled();
  });

  it('a cat perched somewhere else stays put', () => {
    const spot = DEN_SPOTS[1];
    const live = denSession({ [spot.id]: 'cattree' });
    const sill = live.areaData.perches.find((p) => p.label === 'sunny windowsill');
    live.perched = sill;
    live.cat.position.set(sill.x, sill.y, sill.z);
    const player = fakePlayer();
    player.perchY = sill.y;
    applyDenSpot(live, spot.id, null, { player });
    expect(live.perched).toBe(sill);
    expect(player.perchY).toBe(sill.y);
  });

  it('not a den walk, or nothing changed: false and no throw', () => {
    expect(applyDenSpot(null, 'center', 'rug')).toBe(false);
    expect(applyDenSpot({ areaData: {} }, 'center', 'rug')).toBe(false);
    const live = denSession({ [DEN_SPOTS[0].id]: 'bed' });
    expect(applyDenSpot(live, DEN_SPOTS[0].id, 'bed')).toBe(false);
    expect(applyDenSpot(live, 'nowhere', 'bed')).toBe(false);
  });
});
