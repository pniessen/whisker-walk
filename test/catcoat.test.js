import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { tabbyMix } from '../src/cat/coat.js';
import { PRESETS, samples, nearest, legacyDir, colourDistance, lum } from './helpers/catfingerprint.js';

// Task 4: the coats are painted into the torso's vertex colours. Every check
// reads the built geometry's colour attribute, not the STYLE table.

const where = (s, pred) => s.filter(({ u }) => pred(...u)).map(({ c }) => lum(c));

describe('painted coats', () => {
  it('a black cat is exactly its base colour everywhere', () => {
    const want = new THREE.Color(0x2a2a30);
    for (const { c } of samples('black')) expect(colourDistance(c, want)).toBeLessThan(1e-6);
  });

  it('tabbyMix: dark spine, clean belly', () => {
    expect(tabbyMix(0, 1, 0)).toBeGreaterThanOrEqual(0.8);
    expect(tabbyMix(0, -1, 0)).toBe(0);
  });

  for (const opts of [{}, { simple: true }]) {
    const tag = opts.simple ? ' (simple)' : '';
    it(`a tabby${tag} shows at least 5 bands along its flank`, () => {
      // The brief's counter walked the flank samples sorted by z alone, so the
      // order of the 2-4 samples sharing a ring (float noise in z) decided the
      // count: it read 4 (full) and 3 (simple) on a coat with five clear bands.
      // Here each ring of the flank window is one reading (its mean luminance),
      // and a band is a ring at least 0.05 darker than the base fur, counted
      // once per return to near-base fur (within 0.025) in between.
      const flank = samples('tabby', opts).filter(({ u: [x, y] }) => x > 0.6 && y > 0.3 && y < 0.7);
      const rings = new Map();
      for (const { u, c } of flank) {
        const k = Math.round(u[2] * 1000);
        if (!rings.has(k)) rings.set(k, []);
        rings.get(k).push(lum(c));
      }
      const profile = [...rings.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l.reduce((p, q) => p + q, 0) / l.length);
      const fur = lum(new THREE.Color(0x9c7a4f));
      let bands = 0;
      let light = true;
      for (const l of profile) {
        if (light && l < fur - 0.05) { bands++; light = false; } else if (!light && l > fur - 0.025) light = true;
      }
      expect(profile.length).toBeGreaterThanOrEqual(14); // a real profile, not a few samples
      expect(bands).toBeGreaterThanOrEqual(5);
    });

    it(`robbie${tag}: white bib and flanks, black saddle`, () => {
      const s = samples('robbie', opts);
      const sets = [
        where(s, (x, y, z) => z < -0.9 && Math.abs(x) < 0.15),
        where(s, (x, y, z) => x < -0.85 && y < 0 && Math.abs(z) < 0.3),
        where(s, (x, y, z) => x > 0.85 && y < 0 && Math.abs(z) < 0.3),
      ];
      for (const set of sets) { expect(set.length).toBeGreaterThan(0); expect(Math.min(...set)).toBeGreaterThan(0.8); }
      expect(Math.max(...where(s, (x, y) => y > 0.9))).toBeLessThan(0.2);
    });

    it(`calico${tag}: orange on one flank, grey on the other`, () => {
      const s = samples('calico', opts);
      expect(colourDistance(nearest(s, legacyDir([0.12, 0.54, -0.08])).c, new THREE.Color(0xd88030))).toBeLessThan(0.02);
      expect(colourDistance(nearest(s, legacyDir([-0.12, 0.54, 0.14])).c, new THREE.Color(0x333333))).toBeLessThan(0.02);
    });
  }

  it("d2's white shoulder band is painted over his stripes", () => {
    const s = samples('d2');
    expect(colourDistance(nearest(s, legacyDir([0, 0.58, -0.30])).c, new THREE.Color(0xf5f5f2))).toBeLessThan(0.02);
    expect(lum(nearest(s, legacyDir([0, 0.58, 0.11])).c)).toBeLessThan(0.2); // dark tabby back behind the band
  });

  it('no breed carries a marking mesh on its body any more', () => {
    for (const b of PRESETS) {
      const { body, underside } = buildCat(b).userData.parts;
      expect(body.children).toEqual([underside]); // the underside (Task 6), not a marking
    }
  });

  it('head marks are still meshes: the M, the blaze, the head patch, the chin', () => {
    const skullKids = (b) => buildCat(b).userData.parts.head.children[0].children.length;
    expect(skullKids('d2')).toBe(1);
    expect(skullKids('robbie')).toBe(1);
    expect(skullKids('calico')).toBe(1);
    expect(buildCat('digit').userData.parts.head.children[1].children).toHaveLength(1);
  });
});

describe('coatFromStyle: the second patch (patch2)', () => {
  it('without patch2 the calico keeps its dark second patch', async () => {
    const { coatFromStyle } = await import('../src/cat/coat.js');
    const coat = coatFromStyle({ base: 0xffffff, belly: 0xffffff, accent: 0xd2803a, patches: true });
    expect(coat.patches.map((p) => p.colour)).toEqual([0xd2803a, 0x333333]);
  });

  it('with patch2 the second patch takes it', async () => {
    const { coatFromStyle } = await import('../src/cat/coat.js');
    const coat = coatFromStyle({ base: 0x2e2622, belly: 0x4a3a30, accent: 0x9c5a2c, patches: true, patch2: 0x1a1410 });
    expect(coat.patches.map((p) => p.colour)).toEqual([0x9c5a2c, 0x1a1410]);
  });
});
