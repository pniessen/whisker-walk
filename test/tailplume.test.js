import { describe, it, expect } from 'vitest';
import { buildCat, catStyle } from '../src/cat/model.js';
import { lookToStyle, DEFAULT_LOOK } from '../src/customcats.js';
import { TAIL, tailR, tailRadius, PLUME } from '../src/cat/torso.js';

// polish-tails (2026-11-03), Task 1: long-furred cats get a plume tail. The
// Persian's and Maine Coon's tails were thin smooth tapers (rat tails); a
// plume is thicker all along, widest around 40% of its length, and tapers to
// a soft rounded tip. Other fluffy cats get half of it; short coats and D2
// (signed off from photos) keep today's tail exactly.

// Every link mesh is built in its pivot's frame, running along +z from the
// pivot, so a vertex's radius about the link's own axis is hypot(x, y). The
// tail's scale (TAIL.SCALE, then the cat's scale) is uniform, so ratios
// between cats are the same in the cat frame divided by cat.scale.
const linkGeo = (cat, i) => cat.userData.parts.tailPivots[i].children[0].geometry;
const maxRadius = (geo, keep = () => true) => {
  const p = geo.attributes.position;
  let r = 0;
  for (let k = 0; k < p.count; k++) if (keep(p.getZ(k))) r = Math.max(r, Math.hypot(p.getX(k), p.getY(k)));
  return r;
};
// the tip link's radius at its far end (the end ring and the tip ball's equator)
const endRadius = (geo) => maxRadius(geo, (z) => Math.abs(z - TAIL.LINK) < 1e-6);
const tailVerts = (cat) => cat.userData.parts.tailPivots.map((p) => Array.from(p.children[0].geometry.attributes.position.array));

const BUILDS = [{ simple: false }, { simple: true }];

describe('plume tails (polish-tails Task 1)', () => {
  it('tailRadius: no plume is today\'s tailR; a full plume follows the PLUME knots', () => {
    for (let k = 0; k <= 20; k++) {
      const u = k / 20;
      expect(tailRadius(u)).toBe(tailR(u));
      expect(tailRadius(u, 0)).toBe(tailR(u));
    }
    PLUME.forEach((r, k) => expect(tailRadius(k / (PLUME.length - 1), 1)).toBeCloseTo(r, 12));
    // widest around 40% of the length, and a soft tip narrower than the middle
    const widest = PLUME.indexOf(Math.max(...PLUME)) / (PLUME.length - 1);
    expect(widest).toBeGreaterThanOrEqual(0.3);
    expect(widest).toBeLessThanOrEqual(0.5);
    expect(PLUME[PLUME.length - 1]).toBeLessThan(0.5 * Math.max(...PLUME));
  });

  it('the Persian and Maine Coon tails are plumes: full in the middle, tapering to the tip', () => {
    for (const opts of BUILDS) {
      const tabby2 = maxRadius(linkGeo(buildCat('tabby', undefined, opts), 2));
      for (const breed of ['persian', 'mainecoon']) {
        const cat = buildCat(breed, undefined, opts);
        const r2 = maxRadius(linkGeo(cat, 2));
        expect(r2, `${breed} simple ${opts.simple}: link 2 vs tabby`).toBeGreaterThanOrEqual(1.6 * tabby2);
        expect(endRadius(linkGeo(cat, 4)), `${breed} simple ${opts.simple}: tip end vs link 2`).toBeLessThanOrEqual(0.6 * r2);
      }
    }
  }, 120_000);

  it('the builder\'s long fur is plumed like the Persian; fluffy fur gets a plume in between', () => {
    const r2 = (cat) => maxRadius(linkGeo(cat, 2));
    const long = r2(buildCat('tabby', undefined, { style: lookToStyle({ ...DEFAULT_LOOK, fur: 'long' }) }));
    const fluffy = r2(buildCat('tabby', undefined, { style: lookToStyle({ ...DEFAULT_LOOK, fur: 'fluffy' }) }));
    const short = r2(buildCat('tabby', undefined, { style: lookToStyle({ ...DEFAULT_LOOK, fur: 'short' }) }));
    expect(long).toBeCloseTo(r2(buildCat('persian')), 6);
    expect(fluffy).toBeGreaterThan(short * 1.2);
    expect(fluffy).toBeLessThan(long * 0.9);
  }, 120_000);

  it('short-haired cats and D2 keep today\'s tail, vertex for vertex', () => {
    expect(catStyle('d2').tailPlume).toBe(0);
    for (const opts of BUILDS) for (const breed of ['tabby', 'd2', 'digit', 'siamese']) {
      const plain = buildCat(breed, undefined, { ...opts, style: { ...catStyle(breed), tailPlume: 0 } });
      expect(tailVerts(buildCat(breed, undefined, opts)), `${breed} simple ${opts.simple}`).toEqual(tailVerts(plain));
    }
  }, 120_000);

  it('Hagrid ignores tailPlume (a hen has no plume)', () => {
    const verts = (cat) => {
      const out = [];
      cat.userData.parts.tail.traverse((o) => { if (o.isMesh) out.push(Array.from(o.geometry.attributes.position.array)); });
      return out;
    };
    expect(verts(buildCat('hagrid', undefined, { style: { tailPlume: 1 } }))).toEqual(verts(buildCat('hagrid')));
  });
});
