// Found outfits step 2: the gate every outfit passes. Each it.each runs over
// FOUND_WEAR, so a new record joins every check here with no edit to this
// file: its id and name, its cost on every cat shape (full and simple), that
// nothing of it goes into the ground, Hagrid's four slots, no glow and none
// of the yarn ball's or the treasures' colours, and redressCat. Then the seam
// itself (src/cat/wearkind.js, src/foundwear/display.js wornPieces).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { redressCat } from '../src/cat/redress.js';
import { bodyKind, isPack, isCharmed } from '../src/cat/wearkind.js';
import { FOUND_WEAR, foundRecord } from '../src/foundwear/index.js';
import { HEN_SLOTS } from '../src/foundwear/rules.js';
import { isPieceOf, wornPieces, buildFindDisplay } from '../src/foundwear/display.js';
import { DEFAULT_LOOK } from '../src/customcats.js';
import { PRESETS, meshCount, triangles, fingerprintCat } from './helpers/catfingerprint.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

const trisIn = triangles;
const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const SHAPES = [...PRESETS.map((b) => [b, {}]),
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'short', size: 1 } }],
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'fluffy', size: 1.15 } }],
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'long', size: 0.85 } }]];
const IDS = FOUND_WEAR.map((r) => [r.id, r.slot]);
const pieces = (cat, id) => { const out = []; cat.traverse((o) => { if (isPieceOf(o, id)) out.push(o); }); return out; };
const kindCap = (id, slot, simple, breed = 'tabby', opts = {}) => {
  if (slot === 'body' && bodyKind(id) === 'shell') return triangles(buildCat('tabby', { ...BARE, body: 'sweater' }, { simple })) - triangles(buildCat('tabby', BARE, { simple }));
  // a found cape adds no more than the Hero Cape on the same shape and build
  if (slot === 'body' && bodyKind(id) === 'cape') return triangles(buildCat(breed, { ...BARE, body: 'cape' }, { ...opts, simple })) - triangles(buildCat(breed, BARE, { ...opts, simple }));
  if (slot === 'back' && isPack(id)) return simple ? 600 : 1200;
  return simple ? 450 : 900;
};

describe('found outfits: the gate every outfit passes', () => {
  it.each(IDS)('%s (%s): an id the colony server takes, a name clean in both word sets', (id) => {
    expect(id).toMatch(/^[a-z]{3,16}$/);
    const r = foundRecord(id);
    expect(bannedIn(r.name())).toBe(null);
    expect(withOffWords(() => r.name())).toBe(r.name());
  });
  it.each(IDS)('%s (%s): on every shape it builds, shows, and costs at most 4 meshes and its triangles', (id, slot) => {
    for (const [breed, opts] of SHAPES) for (const simple of [false, true]) {
      const bare = buildCat(breed, BARE, { ...opts, simple }), worn = buildCat(breed, { ...BARE, [slot]: id }, { ...opts, simple });
      expect(pieces(worn, id).length, `${breed} ${simple}`).toBeGreaterThan(0);
      expect(meshCount(worn) - meshCount(bare), `${breed} ${simple}`).toBeLessThanOrEqual(4);
      expect(triangles(worn) - triangles(bare), `${breed} ${simple}`).toBeLessThanOrEqual(kindCap(id, slot, simple, breed, opts));
    }
  });
  it.each(IDS)('%s (%s): standing, sitting and napping, nothing of it goes into the ground', (id, slot) => {
    for (const breed of PRESETS) for (const st of ['follow', 'perch', 'requestPet', 'nap']) {
      const cat = buildCat(breed, { ...BARE, [slot]: id }); animateCat(cat, st, 1.3, 0, false); cat.updateMatrixWorld(true);
      for (const m of pieces(cat, id)) expect(new THREE.Box3().setFromObject(m, true).min.y, `${breed} ${st}`).toBeGreaterThanOrEqual(-0.01);
    }
  });
  it.each(IDS)('%s (%s): Hagrid wears it only in his four slots, at most 4 meshes', (id, slot) => {
    const n = meshCount(buildCat('hagrid', BARE)), d = meshCount(buildCat('hagrid', { ...BARE, [slot]: id })) - n;
    if (HEN_SLOTS.includes(slot)) { expect(d).toBeGreaterThan(0); expect(d).toBeLessThanOrEqual(4); } else expect(d).toBe(0);
  });
  it.each(IDS)('%s (%s): no glow, never the yarn ball\'s blue or a treasure\'s pink', (id, slot) => {
    const cat = buildCat('tabby', { ...BARE, [slot]: id });
    for (const m of pieces(cat, id)) {
      expect(m.material.emissive?.getHex() ?? 0).toBe(0);
      expect([0x5b7fc7, 0xf25c8a]).not.toContain(m.material.color?.getHex());
      const c = m.geometry.attributes.color;
      if (c) for (let i = 0; i < c.count; i++) expect([0x5b7fc7, 0xf25c8a]).not.toContain(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHex());
    }
  });
  it.each(IDS)('%s (%s): redressCat gives the fresh build for every found outfit', (id, slot) => {
    for (const breed of ['tabby', 'digit', 'hagrid']) {
      const acc = { ...BARE, [slot]: id };
      expect(fingerprintCat(redressCat(buildCat(breed, BARE), breed, acc))).toEqual(fingerprintCat(buildCat(breed, acc)));
    }
  });
});

describe('found outfits: the seam (wearkind.js, display.js)', () => {
  it('unknown ids in every slot build a plain cat and tag nothing', () => {
    const junk = Object.fromEntries(Object.keys(BARE).map((k) => [k, 'nosuchthing']));
    for (const breed of ['tabby', 'hagrid']) {
      const cat = buildCat(breed, junk, { simple: true });
      expect(pieces(cat, 'nosuchthing')).toEqual([]);
    }
    const red = []; buildCat('tabby', { ...BARE, collar: 'nosuchthing' }).traverse((o) => { if (o.name === 'collarRing') red.push(o.material.color.getHex()); });
    expect(red).toEqual([0xd84040]);   // today's default ring, as an older build has always drawn it
  });
  it('the kinds, as today', () => {
    expect(['hoodie', 'raincoat', 'sweater', 'cape', 'confetticape', 'bell', null].map(bodyKind)).toEqual(['shell', 'shell', 'shell', 'cape', 'cape', null, null]);
    expect(['backpack', 'jetpack', 'wings', 'balloon', '__proto__'].map(isPack)).toEqual([true, true, true, false, false]);
    expect(['bell', 'heart', 'tag', 'sparklecollar', 'studded', 'glow', 'toString'].map(isCharmed)).toEqual([true, true, true, true, false, false, false]);
  });
  it('the dearest ground look still fits under the Woods\' ceiling', () => {
    const WOODS_STATIC = 68810; // test/woodssouth.test.js pins the Woods' build at exactly this
    const dearest = Math.max(...FOUND_WEAR.map((r) => trisIn(buildFindDisplay({ kind: 'wear', id: r.id }))));
    expect(WOODS_STATIC + dearest).toBeLessThan(70000);
  });
  it('wornPieces: a hat comes out as one group of its one mesh; an unknown id gives null', () => {
    const g = wornPieces('acorncap');
    expect(g.name).toBe('wear:acorncap');
    expect(g.children.map((m) => m.userData.hat)).toEqual(['acorncap']);
    expect(wornPieces('nosuchthing')).toBe(null);
  });
});
