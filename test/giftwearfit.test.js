// Gift outfits (src/foundwear/gifts.js; the birthday's four): the same gate
// the found outfits pass (test/foundwearfit.test.js), over GIFT_WEAR, so a
// new gift record joins every check here: its id and name in both word sets,
// its cost on every cat shape (full and simple), nothing of it in the ground,
// Hagrid's four slots, no glow and none of the yarn ball's or the treasures'
// colours, redressCat. Then the catalog: code-only, never sold, and drawn in
// the menu only once owned.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { redressCat } from '../src/cat/redress.js';
import { bodyKind, isPack } from '../src/cat/wearkind.js';
import { GIFT_WEAR } from '../src/foundwear/gifts.js';
import { HEN_SLOTS } from '../src/foundwear/rules.js';
import { isPieceOf } from '../src/foundwear/display.js';
import { CATALOG } from '../src/progression.js';
import { thumbnailIds, missingFoundThumbs } from '../src/thumbnails.js';
import { DEFAULT_LOOK } from '../src/customcats.js';
import { PRESETS, meshCount, triangles, fingerprintCat } from './helpers/catfingerprint.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const SHAPES = [...PRESETS.map((b) => [b, {}]),
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'short', size: 1 } }],
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'fluffy', size: 1.15 } }],
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'long', size: 0.85 } }]];
const IDS = GIFT_WEAR.map((r) => [r.id, r.slot]);
const pieces = (cat, id) => { const out = []; cat.traverse((o) => { if (isPieceOf(o, id)) out.push(o); }); return out; };
const cap = (id, slot, simple) => (slot === 'back' && isPack(id) ? (simple ? 600 : 1200) : simple ? 450 : 900);

describe('gift outfits: the gate every outfit passes', () => {
  it('the birthday\'s five: two hats, a neck piece, a balloon and a collar', () => {
    expect(IDS).toEqual([['partyhat', 'head'], ['bdayrosette', 'neck'], ['bdayballoon', 'back'], ['cakecharm', 'collar'], ['birthdayhat', 'head']]);
  });
  it.each(IDS)('%s (%s): an id the colony server takes, a name clean in both word sets', (id) => {
    expect(id).toMatch(/^[a-z]{3,16}$/);
    const r = GIFT_WEAR.find((x) => x.id === id);
    expect(r.name().length).toBeGreaterThan(0);
    expect(bannedIn(r.name())).toBe(null);
    expect(withOffWords(() => r.name())).toBe(r.name());
    expect(CATALOG.accessories[id].name).toBe(r.name());
  });
  it.each(IDS)('%s (%s): on every shape it builds, shows, and costs at most 4 meshes and its triangles', (id, slot) => {
    for (const [breed, opts] of SHAPES) for (const simple of [false, true]) {
      const bare = buildCat(breed, BARE, { ...opts, simple }), worn = buildCat(breed, { ...BARE, [slot]: id }, { ...opts, simple });
      expect(pieces(worn, id).length, `${breed} ${simple}`).toBeGreaterThan(0);
      expect(meshCount(worn) - meshCount(bare), `${breed} ${simple}`).toBeLessThanOrEqual(4);
      expect(triangles(worn) - triangles(bare), `${breed} ${simple}`).toBeLessThanOrEqual(cap(id, slot, simple));
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
  it.each(IDS)('%s (%s): redressCat gives the fresh build', (id, slot) => {
    for (const breed of ['tabby', 'digit', 'hagrid']) {
      const acc = { ...BARE, [slot]: id };
      expect(fingerprintCat(redressCat(buildCat(breed, BARE), breed, acc))).toEqual(fingerprintCat(buildCat(breed, acc)));
    }
  });
  it('none of them is a coat, a cape or a pack', () => {
    for (const [id] of IDS) { expect(bodyKind(id)).toBe(null); expect(isPack(id)).toBe(false); }
  });
});

describe('gift outfits: the catalog', () => {
  it('each is a code-only prize, never hidden on a walk', () => {
    for (const [id, slot] of IDS) {
      const a = CATALOG.accessories[id];
      expect(a).toMatchObject({ slot, price: 0, prize: true, code: true });
      expect(a.find).toBeUndefined();
    }
  });
  it('the menu draws them only once owned, as it does the found outfits', () => {
    const ids = thumbnailIds(CATALOG);
    for (const [id] of IDS) expect(ids).not.toContain(id);
    expect(missingFoundThumbs({ accessories: {} }, ['partyhat', 'bell', 'birthdayhat'], CATALOG)).toEqual(['partyhat', 'birthdayhat']);
  });
});

describe('the Birthday Hat stands straight (the owner, 2026-11-21)', () => {
  // The cone's axis, head-local: from the middle of its foot (its lowest
  // vertices) to the middle of the pom-pom (its highest). The head's up is +y,
  // its front -z, so a sideways lean shows in x and a rake in z.
  const axisOf = (cat) => {
    const hat = cat.userData.parts.head.children.find((o) => o.userData?.hat === 'birthdayhat');
    const p = hat.geometry.attributes.position, V = [];
    for (let i = 0; i < p.count; i++) V.push(new THREE.Vector3().fromBufferAttribute(p, i));
    V.sort((a, b) => a.y - b.y);
    const mid = (list) => list.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(list.length);
    const minY = V[0].y, maxY = V[V.length - 1].y;
    const foot = mid(V.filter((v) => v.y < minY + 0.012)), top = mid(V.filter((v) => v.y > maxY - 0.03));
    return top.sub(foot).normalize();
  };
  it.each([...PRESETS, 'hagrid'])('%s: its axis is the head\'s up, no sideways lean, at most a slight rake back', (breed) => {
    for (const simple of [false, true]) {
      const a = axisOf(buildCat(breed, { ...BARE, head: 'birthdayhat' }, { simple }));
      const side = Math.asin(Math.abs(a.x)) * 180 / Math.PI, rake = Math.asin(a.z) * 180 / Math.PI;
      expect(side, `${breed} ${simple} sideways`).toBeLessThan(1.5);
      expect(rake, `${breed} ${simple} rake`).toBeGreaterThan(-1.5);
      expect(rake, `${breed} ${simple} rake`).toBeLessThan(6);
      expect(a.y, `${breed} ${simple}`).toBeGreaterThan(Math.cos(6 * Math.PI / 180));
    }
  });
});
