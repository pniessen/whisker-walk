import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { attachOwnTag, OWN_TAG_SCALE } from '../src/game/owntag.js';
import { DEFAULT_LOOK } from '../src/customcats.js';
import { makeNameTag } from '../src/nametag.js';

// A minimal canvas so makeNameTag builds a real sprite headless.
function withFakeDocument(fn) {
  const prev = globalThis.document;
  const ctx = new Proxy({ measureText: (s) => ({ width: String(s).length * 0.55 * 34 }) }, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try { return fn(); } finally {
    if (prev === undefined) delete globalThis.document; else globalThis.document = prev;
  }
}

const customState = (name = 'Moonwhisker-Fern') => ({
  petName: 'Mittens',
  equipped: { cat: 'tabby', custom: 'mine1' },
  customCats: [{ id: 'mine1', name, personality: 'fearless', look: DEFAULT_LOOK }],
  walks: { park: 10 }, // a warrior: full size (a kit or apprentice is drawn smaller: test/catrole.test.js)
});

describe('attachOwnTag', () => {
  it('her custom cat: marked, with one visible tag no hat can cut through', () => {
    withFakeDocument(() => {
      const cat = new THREE.Group();
      const tag = attachOwnTag(cat, customState());
      expect(cat.userData.custom).toBe('mine1');
      expect(cat.userData.customName).toBe('Moonwhisker-Fern');
      const sprites = cat.children.filter((c) => c.isSprite);
      expect(sprites).toEqual([tag]);
      expect(cat.userData.ownTag).toBe(tag); // kept upright through a fight (game/avatar.js)
      expect(tag.visible).toBe(true);
      expect(tag.material.depthTest).toBe(false);
      expect(tag.renderOrder).toBeGreaterThan(0);
      expect(tag.userData.fit).toBe(true);
      // her role is the tag's second line (catrole.js), so it is the two-line sprite, smaller than a co-walker's
      const twoLine = makeNameTag('x', { sub: 'y' });
      expect(tag.scale.x).toBeCloseTo(twoLine.scale.x * OWN_TAG_SCALE);
      expect(tag.scale.y).toBeCloseTo(twoLine.scale.y * OWN_TAG_SCALE);
      expect(OWN_TAG_SCALE).toBeLessThan(1);
    });
  });

  it('a ready-made cat gets no tag and no custom marks', () => {
    withFakeDocument(() => {
      const cat = new THREE.Group();
      const tag = attachOwnTag(cat, { petName: 'Mittens', equipped: { cat: 'calico', custom: null }, customCats: [] });
      expect(tag).toBe(null);
      expect(cat.children).toHaveLength(0);
      expect(cat.userData.custom).toBeUndefined();
      expect(cat.userData.customName).toBeUndefined();
    });
  });

  it('with no document the cat is still marked, without a tag', () => {
    const cat = new THREE.Group();
    expect(attachOwnTag(cat, customState('Ember'))).toBe(null);
    expect(cat.userData.customName).toBe('Ember');
    expect(cat.children).toHaveLength(0);
  });
});
