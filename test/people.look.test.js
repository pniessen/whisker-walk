import { describe, it, expect, vi } from 'vitest';
import { spotHash, spotKind, personFor, pairFor, bodyDims } from '../src/people/look.js';
import { blinkAt } from '../src/people/gaze.js';

const spots = [];
for (let i = 0; i < 200; i++) spots.push({ x: Math.round((i * 7.31) % 90 - 45), z: Math.round((i * 3.77) % 80 - 40) + i * 0.13 });

describe('people look', () => {
  it('same spot, same person', () => {
    const def = { x: 12.34, z: -5.67 };
    expect(personFor({ ...def })).toEqual(personFor({ ...def }));
  });

  it('hash is in [0, 1) and matches the critters formula on a known value', () => {
    for (const s of spots) { const h = spotHash(s.x, s.z, 3); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); }
    // literal values of critters.js twolegHash (n / 2^32, exact)
    expect(spotHash(14, 34, 20)).toBe(31749306 / 4294967296);
    expect(spotHash(-8, -22, 20)).toBe(333922356 / 4294967296);
    expect(spotHash(12.34, -5.67, 3)).toBe(1280859189 / 4294967296);
    expect(spotHash(0, 0, 0)).toBe(2328593439 / 4294967296);
  });

  it('no Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    for (const s of spots) { personFor(s); pairFor(s); }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('heights per kind', () => {
    const seen = new Set();
    for (const s of spots) {
      const l = personFor(s);
      seen.add(l.kind);
      const lim = l.kind === 'child' ? [1.16, 1.42]
        : l.kind === 'older' ? (l.sex === 'm' ? [1.66, 1.78] : [1.55, 1.67])
          : (l.sex === 'm' ? [1.72, 1.85] : [1.60, 1.73]);
      expect(l.height).toBeGreaterThanOrEqual(lim[0]);
      expect(l.height).toBeLessThanOrEqual(lim[1]);
    }
    expect(seen.size).toBe(3);
  });

  it('proportions', () => {
    for (const s of spots) {
      const l = personFor(s);
      const d = bodyDims(l);
      expect(d.stoop).toBe(l.kind === 'older' ? 1 : 0);
      expect((d.chinY - d.neckY) / d.H).toBeCloseTo(l.kind === 'child' ? 0.038 : l.sex === 'f' ? 0.030 : 0.027, 3);
      expect(d.headH / d.H).toBeCloseTo(l.kind === 'child' ? 0.154 : 0.128, 3);
    }
  });

  it('overrides win', () => {
    const l = personFor({ x: 1, z: 2, kind: 'older', sex: 'f', height: 1.6, glasses: true, hat: null });
    expect(l.kind).toBe('older'); expect(l.sex).toBe('f'); expect(l.height).toBe(1.6);
    expect(l.glasses).toBe(true); expect(l.hat).toBe(null);
    expect(l.dims.H).toBe(1.6);
  });

  it('pairs', () => {
    for (const s of spots) expect(pairFor(s) !== null).toBe(spotKind(s) === 'child');
    expect(pairFor({ x: 14, z: 34 }).adult.kind).toBe('adult');
    const p = pairFor({ x: 14, z: 34 });
    expect(p.child.kind).toBe('child');
    expect(p.adult.hair).toBe(p.child.hair);
    const street = [[-16, 12], [14, 34], [4, 27], [-8, -22], [18, 16], [32, -10], [14, 7], [-10, -8]];
    expect(street.filter(([x, z]) => pairFor({ x, z }) !== null)).toEqual([[14, 34], [-8, -22], [-10, -8]]);
  });

  // (final review, finding 5) a pair's grown-up and child have seeds of their
  // own, so they do not blink and glance in step
  it('a pair\'s grown-up and child blink at different times', () => {
    const blinks = (seed) => {
      const out = [];
      for (let i = 0, was = 0; i < 60 * 30; i++) { const b = blinkAt(seed, i / 60); if (b > 0 && was === 0) out.push(i); was = b; }
      return out;
    };
    let pairs = 0;
    for (const s of spots) {
      const p = pairFor(s);
      if (!p) continue;
      pairs++;
      expect(p.child.seed, `${s.x} ${s.z}`).not.toBe(p.adult.seed);
      expect(p.child.seed).toBe(pairFor(s).child.seed); // from the spot
      expect(blinks(p.child.seed)).not.toEqual(blinks(p.adult.seed));
    }
    expect(pairs).toBeGreaterThan(10);
  });

  it('an explicit kind decides the pair, not the spot hash', () => {
    const find = (kind) => { for (let x = 0; x < 200; x++) if (spotKind({ x, z: 4 }) === kind) return { x, z: 4 }; };
    const a = find('adult');
    const c = find('child');
    const p = pairFor({ ...a, kind: 'child' });
    expect(p.adult.kind).toBe('adult');
    expect(p.child.kind).toBe('child');
    expect(pairFor({ ...c, kind: 'adult' })).toBeNull();
    expect(pairFor({ ...c, kind: 'older' })).toBeNull();
  });
});
