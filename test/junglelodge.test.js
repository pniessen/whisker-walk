// The Jungle lodge, round two: the lodge's roof CONNECTS to its walls (one shared height, the roof's base on the wall top, the roof overhanging every wall), the roof's thatch rows each
// have a tone, and the house detail (ridge beam, rafters, plank seams, corner posts, shutters, veranda balusters, treads, lanterns, pots) stands where it should.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/jungleplan.js';
import { lodgeWallGeos, lodgeRoofGeos } from '../src/world/jungleparts.js';
import { houseParts } from '../src/world/junglehouse.js';

const bbox = (items) => items.reduce((b, [g]) => { g.computeBoundingBox(); return b.union(g.boundingBox); }, new THREE.Box3());
const EPS = 1e-6;

describe('the lodge: roof and walls connect', () => {
  it('the roof base is the wall top, in the plan', () => {
    expect(P.LODGE_ROOF.base).toBe(P.LODGE_WALL.top);
    expect(P.LODGE_WALL.top).toBeGreaterThan(P.LODGE.deck + 2);
    expect(P.LODGE_WALL.base).toBeGreaterThanOrEqual(P.LODGE.deck);
  });
  it('the roof spans the walls and overhangs every side (and the veranda in front)', () => {
    const W = P.LODGE_WALL; const R = P.LODGE_ROOF;
    expect(R.x0).toBeLessThanOrEqual(W.x0 - 0.5);
    expect(R.x1).toBeGreaterThanOrEqual(W.x1 + 0.5);
    expect(R.z0).toBeLessThanOrEqual(W.z0 - 0.5);
    expect(R.z1).toBeGreaterThanOrEqual(P.LODGE.z1);
  });
  it('the drawn walls top out exactly at the wall top, the drawn roof starts exactly there, and the roof box contains the wall box', () => {
    const walls = bbox(lodgeWallGeos());
    const roofItems = lodgeRoofGeos();
    const roof = bbox(roofItems);
    expect(walls.max.y).toBeCloseTo(P.LODGE_WALL.top, 5);
    expect(roof.min.y).toBeGreaterThan(P.LODGE_ROOF.base - 0.05 - EPS); // the thatch slabs dip a hair under the soffit's top at the eaves, never below the wall top
    const soffit = roofItems[0][0]; soffit.computeBoundingBox();
    expect(soffit.boundingBox.min.y).toBeCloseTo(P.LODGE_ROOF.base, 5); // the underside touches the wall tops
    expect(roof.min.x).toBeLessThan(walls.min.x); expect(roof.max.x).toBeGreaterThan(walls.max.x);
    expect(roof.min.z).toBeLessThan(walls.min.z); expect(roof.max.z).toBeGreaterThan(walls.max.z);
    expect(roof.max.y).toBeGreaterThan(P.LODGE_ROOF.base + P.LODGE_ROOF.rise - 0.05);
  });
  it('the soffit closes the whole roof footprint (nothing looks up into the sky) and the walls are solid up to it', () => {
    const [soffit] = lodgeRoofGeos()[0];
    soffit.computeBoundingBox();
    expect(soffit.boundingBox.max.x - soffit.boundingBox.min.x).toBeCloseTo(P.LODGE_ROOF.x1 - P.LODGE_ROOF.x0, 5);
    expect(soffit.boundingBox.max.z - soffit.boundingBox.min.z).toBeCloseTo(P.LODGE_ROOF.z1 - P.LODGE_ROOF.z0, 5);
    const [body] = lodgeWallGeos()[0]; body.computeBoundingBox();
    expect(body.boundingBox.max.y).toBeCloseTo(P.LODGE_ROOF.base, 5);
    expect(body.boundingBox.min.x).toBeCloseTo(P.LODGE.x0, 5);
  });
  it('the veranda posts reach the same height', () => {
    expect(P.LODGE_POSTS.length).toBe(6);
    for (const p of P.LODGE_POSTS) expect(p.z).toBeGreaterThan(P.LODGE_WALL.z1);
  });
  it('the thatch is laid in rows on both slopes, each row its own tone', () => {
    const slabs = lodgeRoofGeos().slice(2);
    expect(slabs.length).toBe(P.LODGE_ROOF.rows * 2);
    const tones = new Set(slabs.map(([, hex]) => hex));
    expect(tones.size).toBeGreaterThanOrEqual(5);
    for (let r = 0; r + 1 < P.LODGE_ROOF.rows; r++) expect(slabs[r * 2][1]).not.toBe(slabs[(r + 1) * 2][1]); // neighbouring rows differ
  });
});

describe('the lodge: house and roof detail', () => {
  const parts = houseParts();
  const by = (f) => parts.filter(([, g, hex]) => f(g, hex));
  it('a ridge beam rides the ridge and is longer than the roof', () => {
    const ridgeY = P.LODGE_ROOF.base + P.LODGE_ROOF.rise;
    const beam = parts.find(([k, g]) => { g.computeBoundingBox(); const b = g.boundingBox; return k === 'paint' && b.min.y >= ridgeY && b.max.x - b.min.x > P.LODGE_ROOF.x1 - P.LODGE_ROOF.x0; });
    expect(beam).toBeTruthy();
  });
  it('rafters show under the eaves: beams hanging below the soffit, spanning the roof front to back', () => {
    const rafters = by((g) => { g.computeBoundingBox(); const b = g.boundingBox; return b.min.y < P.LODGE_ROOF.base - 0.05 && b.max.y <= P.LODGE_ROOF.base + EPS && b.max.z - b.min.z > 8; });
    expect(rafters.length).toBeGreaterThanOrEqual(10);
    for (const [, g] of rafters) { g.computeBoundingBox(); expect(g.boundingBox.min.z).toBeLessThanOrEqual(P.LODGE_ROOF.z0 + 0.1); expect(g.boundingBox.max.z).toBeGreaterThanOrEqual(P.LODGE_ROOF.z1 - 0.1); }
  });
  it('four corner posts run the full wall height, plank seams cross the front wall, shutters flank the windows', () => {
    const h = P.LODGE_WALL.top - P.LODGE_WALL.base;
    expect(by((g) => { g.computeBoundingBox(); const b = g.boundingBox; return b.max.y - b.min.y >= h && b.max.x - b.min.x < 0.3 && b.max.z - b.min.z < 0.3; }).length).toBe(4);
    expect(by((g) => { g.computeBoundingBox(); const b = g.boundingBox; return b.max.x - b.min.x > 10 && b.max.y - b.min.y < 0.05; }).length).toBeGreaterThanOrEqual(5);
    expect(by((g, hex) => hex === 0x4f7a5a).length).toBeGreaterThanOrEqual(8);
  });
  it('the veranda has balusters with a gap left at the steps, treads on the ramp, three extra glow lanterns and four hanging pots', () => {
    const balusters = by((g) => { g.computeBoundingBox(); const b = g.boundingBox; return Math.abs(b.max.z - P.LODGE.z1 + 0.2) < 0.1 && b.max.x - b.min.x < 0.08 && b.max.y - b.min.y > 0.4; });
    expect(balusters.length).toBeGreaterThan(12);
    for (const [, g] of balusters) { g.computeBoundingBox(); const x = (g.boundingBox.min.x + g.boundingBox.max.x) / 2; expect(Math.abs(x - P.STEPS.x)).toBeGreaterThan(P.STEPS.w / 2 - 0.1); }
    expect(by((g) => { g.computeBoundingBox(); return g.boundingBox.max.z > P.LODGE.z1 + 0.5 && g.boundingBox.max.y < 0.75; }).length).toBeGreaterThanOrEqual(5);
    expect(parts.filter(([k]) => k === 'glow').length).toBe(3);
    expect(by((g, hex) => hex === 0xb4643c).length).toBe(4);
  });
  it('everything of the detail stays within a metre of the roof and the deck (nothing floats away)', () => {
    const box = bbox(parts.map(([, g]) => [g]));
    expect(box.min.x).toBeGreaterThan(P.LODGE_ROOF.x0 - 1.2); expect(box.max.x).toBeLessThan(P.LODGE_ROOF.x1 + 1.2);
    expect(box.min.z).toBeGreaterThan(P.LODGE_ROOF.z0 - 1.2); expect(box.max.z).toBeLessThan(P.LODGE.z1 + P.LODGE.skirt + 0.5);
    expect(box.min.y).toBeGreaterThan(P.jungleY(P.STEPS.x, P.LODGE.z1 + 3) - 0.2);
  });
});
