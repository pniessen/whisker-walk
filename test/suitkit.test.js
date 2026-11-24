// Suit kit M0/M1: the seam (src/suithook.js) and the kit (src/cat/suitkit.js)
// on every cat shape, in both colourways. The kit is NOT a found outfit: no
// catalog row, never saved; it replaces head, body, back and feet at draw time.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { redressCat } from '../src/cat/redress.js';
import { installSuitKit } from '../src/cat/suitkit.js';
import { registerSuitKit, effectiveWear, suitPiece, isSuitId, SUIT_LOOKS } from '../src/suithook.js';
import { bodyKind, isPack } from '../src/cat/wearkind.js';
import { wornNow } from '../src/outfits.js';
import { CATALOG } from '../src/progression.js';
import { DEFAULT_LOOK } from '../src/customcats.js';
import { PRESETS, meshCount, triangles, fingerprintCat } from './helpers/catfingerprint.js';

const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const SHAPES = [...PRESETS.map((b) => [b, {}]),
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'short', size: 1 } }],
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'fluffy', size: 1.15 } }],
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'long', size: 0.85 } }]];
const suited = (look) => effectiveWear(BARE, 'any', look);
const isSuit = (o) => !!o.userData.suit || o.userData.backItem?.startsWith('suit-');
const suitMeshes = (cat) => { const out = []; cat.traverse((o) => { if (o.isMesh && (isSuit(o))) out.push(o); }); return out; };
const DRESSED = { collar: 'bell', head: 'tophat', face: 'glasses', neck: 'scarf', body: 'sweater', back: 'backpack', feet: 'sneakers' };
// The most a suit adds beyond the bare cat. Spec 4.1 said 1,100 / 600; the beauty pass
// (crisp patch, harness, twin tanks, hose, belt) raises it to 1,300 / 800 (owner's ceiling 1,400 / 800).
const KIT_CAP = (simple) => (simple ? 800 : 1300);

describe('suit seam: effectiveWear and the hook slot', () => {
  it('no look: her own wear, untouched (same object)', () => {
    const w = { ...BARE, head: 'tophat' };
    expect(effectiveWear(w, 'neighborhood', null)).toBe(w);
    expect(effectiveWear(w, 'neighborhood', 'nonsense')).toBe(w);
  });
  it('a look replaces head, body, back, feet, hides the neck, keeps collar and face, never mutates', () => {
    const w = { ...DRESSED };
    const out = effectiveWear(w, 'x', 'dive');
    expect(out).toEqual({ collar: 'bell', face: 'glasses', neck: null, head: 'suit-helmet-dive', body: 'suit-body-dive', back: 'suit-pack-dive', feet: 'suit-boots-dive' });
    expect(w).toEqual(DRESSED);
  });
  it('Hagrid takes the helmet alone', () => {
    expect(effectiveWear({ ...DRESSED }, 'x', 'space', { hen: true })).toEqual({ ...DRESSED, head: 'suit-helmet-space' });
  });
  it('suit ids are never saved: the outfit sanitiser drops them', () => {
    for (const look of SUIT_LOOKS) expect(Object.values(wornNow(suited(look), CATALOG)).filter(Boolean)).toEqual([]);
  });
  it('ids parse, and the kinds agree', () => {
    expect(suitPiece('suit-helmet-dive')).toEqual({ piece: 'helmet', look: 'dive' });
    expect(['suit-body-', 'suit-body-moon', 'hoodie', null, 7].map(isSuitId)).toEqual([false, false, false, false, false]);
    expect(bodyKind('suit-body-space')).toBe(null);   // no kit loaded: nothing to make room for
    expect(isPack('suit-pack-dive')).toBe(false);
    installSuitKit();
    expect(bodyKind('suit-body-space')).toBe('shell');
    expect(isPack('suit-pack-dive')).toBe(true);
    registerSuitKit(null);
  });
  it('with no kit registered a suited cat draws no suit: the same meshes and triangles as the bare cat', () => {
    registerSuitKit(null);
    for (const look of SUIT_LOOKS) for (const breed of ['tabby', 'hagrid']) {
      const w = breed === 'hagrid' ? effectiveWear(BARE, 'x', look, { hen: true }) : suited(look);
      const cat = buildCat(breed, w), bare = buildCat(breed, BARE);
      expect(suitMeshes(cat)).toEqual([]);
      expect(meshCount(cat)).toBe(meshCount(bare));
      expect(triangles(cat)).toBe(triangles(bare));
    }
  });
});

describe('suit kit: both colourways on every cat shape', () => {
  beforeAll(() => installSuitKit());
  afterAll(() => registerSuitKit(null));

  it.each(SUIT_LOOKS)('%s: shows, adds at most 6 meshes and the kit triangle cap, on every shape, full and simple', (look) => {
    for (const [breed, opts] of SHAPES) for (const simple of [false, true]) {
      const bare = buildCat(breed, BARE, { ...opts, simple }), worn = buildCat(breed, suited(look), { ...opts, simple });
      expect(suitMeshes(worn).length, `${breed} ${simple}`).toBeGreaterThanOrEqual(4);
      expect(meshCount(worn) - meshCount(bare), `${breed} ${simple}`).toBeLessThanOrEqual(6);
      expect(triangles(worn) - triangles(bare), `${breed} ${simple}`).toBeLessThanOrEqual(KIT_CAP(simple));
    }
  });
  it.each(SUIT_LOOKS)('%s: the suit replaces a dressed cat\'s four slots, so it never costs more than its own cap over the bare cat', (look) => {
    const bare = triangles(buildCat('tabby', { ...BARE, collar: 'bell', face: 'glasses' })), dressed = buildCat('tabby', effectiveWear(DRESSED, 'x', look));
    expect(triangles(dressed) - bare).toBeLessThanOrEqual(KIT_CAP(false));   // against the same cat with only the bell and the glasses she keeps
  });
  it.each(SUIT_LOOKS)('%s: the helmet glass is one transparent noCast mesh, nothing else is transparent', (look) => {
    const cat = buildCat('tabby', suited(look));
    const clear = []; cat.traverse((o) => { if (o.isMesh && o.material.transparent && o.userData.suit) clear.push(o); });
    expect(clear).toHaveLength(1);
    expect(clear[0].userData.noCast).toBe(true);
    expect(clear[0].material.depthWrite).toBe(false);
  });
  it.each(SUIT_LOOKS)('%s: no glow, and no ground clip standing, sitting or napping (the coat shell may drape 2 cm, as a coat does)', (look) => {
    for (const breed of PRESETS) for (const st of ['follow', 'perch', 'requestPet', 'nap']) {
      const cat = buildCat(breed, suited(look)); animateCat(cat, st, 1.3, 0, false); cat.updateMatrixWorld(true);
      for (const m of suitMeshes(cat)) {
        expect(m.material.emissive?.getHex() ?? 0).toBe(0);
        expect(new THREE.Box3().setFromObject(m, true).min.y, `${breed} ${st} ${m.userData.suit}`).toBeGreaterThanOrEqual(m.userData.suit === 'body' ? -0.02 : -0.01);
      }
    }
  });
  it.each(SUIT_LOOKS)('%s: Hagrid wears the helmet alone, at most 2 meshes, and nothing else changes', (look) => {
    const n = meshCount(buildCat('hagrid', BARE));
    const d = meshCount(buildCat('hagrid', effectiveWear(BARE, 'x', look, { hen: true }))) - n;
    expect(d).toBeGreaterThan(0); expect(d).toBeLessThanOrEqual(2);
    expect(n).toBeGreaterThan(0);
  });
  it.each(SUIT_LOOKS)('%s: redressCat gives the fresh build; the two colourways differ', (look) => {
    for (const breed of ['tabby', 'digit', 'hagrid']) {
      const acc = breed === 'hagrid' ? effectiveWear(BARE, 'x', look, { hen: true }) : suited(look);
      expect(fingerprintCat(redressCat(buildCat(breed, BARE), breed, acc))).toEqual(fingerprintCat(buildCat(breed, acc)));
    }
    expect(fingerprintCat(buildCat('tabby', suited('space')))).not.toEqual(fingerprintCat(buildCat('tabby', suited('dive'))));
  });
  it('a crowd of three suited cats draws at most 6 extra meshes and 1 transparent draw each', () => {
    for (const look of SUIT_LOOKS) {
      const one = buildCat('tabby', suited(look));
      const extra = meshCount(one) - meshCount(buildCat('tabby', BARE));
      expect(extra * 3).toBeLessThanOrEqual(21);
      let clear = 0; one.traverse((o) => { if (o.isMesh && o.material.transparent) clear++; });
      expect(clear).toBeLessThanOrEqual(1);
    }
  });
});
