import { describe, it, expect } from 'vitest';
import { rollTreats, trailPoints, createScent } from '../src/scent.js';

const POIS = [{ x: 10, z: 0 }, { x: -10, z: 10 }, { x: 0, z: -20 }];
const rngQueue = (...vals) => () => (vals.length ? vals.shift() : 0.5);
const scene = { add() {}, remove() {} };
const AREA = { pois: POIS, bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };

describe('rollTreats', () => {
  it('buries the requested number near distinct pois', () => {
    const treats = rollTreats(() => 0.3, POIS, 2);
    expect(treats).toHaveLength(2);
    expect(treats[0].id).not.toBe(treats[1].id);
  });
});

describe('trailPoints', () => {
  it('produces steps points progressing from from to to', () => {
    const pts = trailPoints({ x: 0, z: 0 }, { x: 10, z: 0 }, () => 0.5, 7);
    expect(pts).toHaveLength(7);
    expect(pts[0].x).toBeLessThan(pts[6].x);
    for (const p of pts) expect(Math.abs(p.z)).toBeLessThan(2); // jitter bounded
  });
});

describe('createScent', () => {
  it('sniff finds a treat in range once, digAt unearths within 1.2', () => {
    const scent = createScent(scene, AREA, () => 0.4);
    const treat = scent.treats[0];
    const near = { x: treat.x - 5, z: treat.z };
    expect(scent.sniff(near, 18)).toBe(treat);
    expect(scent.sniff(near, 18)).toBe(null); // trail already revealed
    expect(scent.digAt({ x: treat.x + 5, z: treat.z })).toBe(null); // too far
    expect(scent.digAt({ x: treat.x + 0.5, z: treat.z })).toBe(treat);
    expect(scent.digAt({ x: treat.x + 0.5, z: treat.z })).toBe(null); // already dug
  });

  it('sniff out of range finds nothing', () => {
    const scent = createScent(scene, AREA, () => 0.4);
    expect(scent.sniff({ x: 999, z: 999 }, 18)).toBe(null);
  });

  it('digById unearths a treat by id with no proximity check, sharing digAt\'s unearth path', () => {
    const scent = createScent(scene, AREA, () => 0.4);
    const treat = scent.treats[1];
    expect(treat.mound.scale.y).toBe(0.25); // untouched mound, pre-dig
    const result = scent.digById(treat.id);
    expect(result).toBe(treat);
    expect(treat.dug).toBe(true);
    expect(treat.mound.scale.y).toBe(0.08); // same mound-open side effect as digAt
  });

  it('digById returns null for an already-dug id or an unknown id', () => {
    const scent = createScent(scene, AREA, () => 0.4);
    const treat = scent.treats[0];
    expect(scent.digById(treat.id)).toBe(treat);
    expect(scent.digById(treat.id)).toBe(null); // already dug
    expect(scent.digById('no-such-id')).toBe(null); // unknown id
  });

  it('nudges a treat that rolled onto a collider center clear of it and in bounds', () => {
    const area = {
      pois: [{ x: 0, z: 0 }],
      colliders: [{ x: 0, z: 0, r: 3 }],
      bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    };
    // constant rng => zero jitter => the treat rolls exactly onto the poi,
    // which sits dead-center on the collider.
    const scent = createScent(scene, area, () => 0.5);
    expect(scent.treats.length).toBeGreaterThan(0);
    for (const tr of scent.treats) {
      expect(Math.hypot(tr.x, tr.z)).toBeGreaterThanOrEqual(4.5);
      expect(tr.x).toBeGreaterThanOrEqual(area.bounds.minX);
      expect(tr.x).toBeLessThanOrEqual(area.bounds.maxX);
      expect(tr.z).toBeGreaterThanOrEqual(area.bounds.minZ);
      expect(tr.z).toBeLessThanOrEqual(area.bounds.maxZ);
    }
  });
});

// ---------------------------------------------------------------------------
// v18 Twitchy Nose ('twitchy-nose') — scent.trailTo. The ability reuses this
// module's trail rendering rather than shipping a second look for the same
// idea, so what is pinned here is the clipping rule, the no-op cases, and the
// fact that a relaid trail does not leak.
// ---------------------------------------------------------------------------
describe('createScent.trailTo (v18 Twitchy Nose)', () => {
  const counted = () => {
    const added = [];
    return { added, add(o) { added.push(o); }, remove(o) { added.splice(added.indexOf(o), 1); } };
  };

  it('clips the trail to maxDist instead of drawing all the way to a far target', () => {
    const scent = createScent(scene, AREA, () => 0.5);
    const end = scent.trailTo({ x: 0, z: 0 }, { x: 40, z: 0 }, { maxDist: 6 });
    expect(end.x).toBeCloseTo(6, 5);
    expect(end.z).toBeCloseTo(0, 5);
  });

  it('draws all the way to a target already inside maxDist', () => {
    const scent = createScent(scene, AREA, () => 0.5);
    const end = scent.trailTo({ x: 0, z: 0 }, { x: 0, z: 3 }, { maxDist: 6 });
    expect(end.z).toBeCloseTo(3, 5);
  });

  it('is a no-op for a null target or one the cat is standing on', () => {
    const s = counted();
    const scent = createScent(s, AREA, () => 0.5);
    const beforeMounds = s.added.length;
    expect(scent.trailTo({ x: 0, z: 0 }, null)).toBeNull();
    expect(scent.trailTo({ x: 1, z: 1 }, { x: 1.1, z: 1 })).toBeNull();
    expect(s.added.length).toBe(beforeMounds); // nothing drawn either time
  });

  it('lays `steps` decals and removes every one of them once they expire', () => {
    const s = counted();
    const scent = createScent(s, AREA, () => 0.5);
    const beforeMounds = s.added.length;
    scent.trailTo({ x: 0, z: 0 }, { x: 20, z: 0 }, { steps: 5, life: 4 });
    expect(s.added.length).toBe(beforeMounds + 5);
    scent.update(5);
    expect(s.added.length).toBe(beforeMounds);
  });

  it('relaying many trails never accumulates decals past their lifetime', () => {
    const s = counted();
    const scent = createScent(s, AREA, () => 0.5);
    const beforeMounds = s.added.length;
    for (let i = 0; i < 20; i++) {
      scent.trailTo({ x: i, z: 0 }, { x: i + 20, z: 0 }, { steps: 5, life: 4 });
      scent.update(4);
    }
    expect(s.added.length).toBe(beforeMounds);
  });

  // update() used to clamp every decal to a hardcoded 0.85. The nose relays a
  // trail every few seconds, so it needs its own fainter ceiling or the
  // prints stack into a solid yellow carpet — hence the per-decal `peak`.
  it('holds the sniff trail at its full 0.85 and the nose trail at a fainter ceiling', () => {
    const sniffScene = counted();
    const sniffScent = createScent(sniffScene, AREA, () => 0.4);
    const treat = sniffScent.treats[0];
    const moundCount = sniffScene.added.length;
    sniffScent.sniff({ x: treat.x - 5, z: treat.z }, 30);
    sniffScent.update(0.01);
    const sniffDecals = sniffScene.added.slice(moundCount);
    expect(sniffDecals.length).toBeGreaterThan(0);
    for (const d of sniffDecals) expect(d.material.opacity).toBeCloseTo(0.85, 5);

    const noseScene = counted();
    const noseScent = createScent(noseScene, AREA, () => 0.4);
    const noseMounds = noseScene.added.length;
    noseScent.trailTo({ x: 0, z: 0 }, { x: 10, z: 0 });
    noseScent.update(0.01);
    const noseDecals = noseScene.added.slice(noseMounds);
    expect(noseDecals.length).toBeGreaterThan(0);
    for (const d of noseDecals) expect(d.material.opacity).toBeLessThan(0.85);
  });
});
