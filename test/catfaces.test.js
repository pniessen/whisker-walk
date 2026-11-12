import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat, catStyle, darkFace, DARK_FACE } from '../src/cat/model.js';
import { lookToStyle } from '../src/customcats.js';
import { meshCount, triangles } from './helpers/catfingerprint.js';

// polish-faces (2026-11-06): the tabby's forehead M, and a black cat's face.

// Relative luminance (linear, Rec.709) and the WCAG contrast ratio.
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = (h) => new THREE.Color(h);

// The head's parts, found by what they are: the skull is the head's first
// child; the muzzle the next ball; eyes are the 0.036 balls; the nose is tagged.
function face(cat) {
  const head = cat.userData.parts?.head ?? (() => { let h = null; cat.traverse((o) => { if (!h && o.children.some((c) => c.userData.nose)) h = o; }); return h; })();
  const balls = head.children.filter((c) => c.isMesh && c.geometry.type === 'SphereGeometry');
  const radius = (m) => m.geometry.parameters.radius;
  return {
    head,
    skull: head.children[0],
    muzzle: balls.find((m) => radius(m) === 0.09),
    eyes: balls.filter((m) => radius(m) === 0.036),
    shines: balls.filter((m) => radius(m) === 0.007),
    nose: head.children.find((c) => c.userData.nose),
  };
}

describe('the tabby M', () => {
  it('the tabby and zeetoo wear the M (headStripes), drawn as the letter', () => {
    expect(catStyle('tabby').headStripes).toBe('M');
    expect(catStyle('zeetoo').headStripes).toBe('M');
  });
  it("D2 and Digit keep their signed-off three bars", () => {
    expect(catStyle('d2').headStripes).toBe(true);
    expect(catStyle('digit').headStripes).toBe(true);
  });
  it('a custom striped cat gets the M too', () => {
    expect(lookToStyle({ coat: 'ginger', marks: 'chocolate', pattern: 'stripes', fur: 'short', eyes: 'green', size: 1 }).headStripes).toBe('M');
  });
  it('the M is one skull mesh in the stripe colour, and stays inside the budgets', () => {
    for (const breed of ['tabby', 'zeetoo']) {
      const { skull } = face(buildCat(breed));
      const marks = skull.children.filter((c) => c.isMesh);
      expect(marks).toHaveLength(1);
      expect(marks[0].material.color.getHex()).toBe(hex(catStyle(breed).accent).getHex());
      expect(meshCount(buildCat(breed))).toBe(31);
      expect(triangles(buildCat(breed))).toBeLessThanOrEqual(9000);
      expect(triangles(buildCat(breed, undefined, { simple: true }))).toBeLessThanOrEqual(5500);
    }
  });
  it('the M reads on the tabby coat: stripe colour against the coat at a contrast of 1.6 or more', () => {
    // 0x6f5636 on 0x9c7a4f is ~1.9; a darker coat row must not lose its M.
    for (const breed of ['tabby', 'zeetoo']) {
      const s = catStyle(breed);
      expect(contrast(hex(s.accent), hex(s.base))).toBeGreaterThanOrEqual(1.6);
    }
  });
  it('building the M does not draw on Math.random (the flat trace builds a tabby)', () => {
    const real = Math.random;
    let n = 0;
    Math.random = () => { n++; return real(); };
    try {
      const a = (() => { n = 0; buildCat('tabby'); return n; })();
      const s = { ...catStyle('tabby'), headStripes: false };
      const b = (() => { n = 0; buildCat('tabby', undefined, { style: s }); return n; })();
      expect(a).toBe(b);
    } finally {
      Math.random = real;
    }
  });
});

describe("the black cat's face", () => {
  const black = () => face(buildCat('black'));
  const base = hex(catStyle('black').base);

  it('the black cat (and a custom black cat) has a dark face; Robbie and the tabby do not', () => {
    expect(darkFace(catStyle('black'))).toBe(true);
    expect(darkFace(lookToStyle({ coat: 'black', marks: 'black', pattern: 'solid', fur: 'short', eyes: 'gold', size: 1 }))).toBe(true);
    expect(darkFace(catStyle('robbie'))).toBe(false);
    expect(darkFace(catStyle('tabby'))).toBe(false);
  });

  it('its eyes stand out: contrast 6 or more against the coat, with a glow of their own', () => {
    for (const eye of black().eyes) {
      expect(contrast(eye.material.color, base)).toBeGreaterThanOrEqual(6);
      expect(eye.material.emissiveIntensity).toBeGreaterThan(0);
      expect(eye.material.emissive.getHex()).toBe(eye.material.color.getHex());
    }
  });

  it('a lit catchlight in each eye', () => {
    const { shines } = black();
    expect(shines).toHaveLength(2);
    for (const s of shines) {
      expect(s.material.emissiveIntensity).toBeGreaterThan(0.5);
      expect(s.scale.x).toBeGreaterThan(1);
    }
  });

  // "Still black": under 0.09 linear luminance (~0x50 grey), not much over half
  // the custom Blue-grey coat (0.159), the nearest coat that reads as grey.
  it('the muzzle has a sheen: 1.3 or more against the head, yet still a black cat (luminance under 0.09)', () => {
    const { muzzle, skull } = black();
    expect(contrast(muzzle.material.color, skull.material.color)).toBeGreaterThanOrEqual(1.3);
    expect(lum(muzzle.material.color)).toBeLessThan(0.09);
    expect(muzzle.material.roughness).toBeLessThan(0.9);
    expect(skull.material.color.getHex()).toBe(base.getHex()); // the head itself stays the coat
  });

  it('the nose shows: contrast 3 or more against the muzzle', () => {
    const { nose, muzzle } = black();
    expect(contrast(nose.material.color, muzzle.material.color)).toBeGreaterThanOrEqual(3);
  });

  it('the face adds no mesh (draw calls) and no triangles', () => {
    expect(meshCount(buildCat('black'))).toBe(30);
    const plain = buildCat('black', undefined, { style: { ...catStyle('black'), faceSheen: false } });
    expect(triangles(buildCat('black'))).toBe(triangles(plain));
    expect(meshCount(plain)).toBe(30);
  });

  it("Robbie's face is unchanged: matte muzzle in his belly white", () => {
    const { muzzle, eyes } = face(buildCat('robbie'));
    expect(muzzle.material.color.getHex()).toBe(hex(catStyle('robbie').belly).getHex());
    expect(muzzle.material.roughness).toBe(0.9);
    for (const e of eyes) expect(e.material.emissiveIntensity).toBe(1); // three's default, emissive black
    for (const e of eyes) expect(e.material.emissive.getHex()).toBe(0);
  });

  it('DARK_FACE keeps the black cat black: the muzzle lift stays small', () => {
    expect(DARK_FACE.MUZZLE_LIFT).toBeLessThanOrEqual(0.2);
  });
});

// cat-beauty A2 with the owner's change (2026-11-11): nose leather follows the
// coat, except that a black cat keeps the pink nose it has always had (a black
// nose on a black face fails "the nose shows" above), and the family cats keep
// the pink from their photos.
describe('nose leather by coat', () => {
  const PINK = 0xe8a0a8;
  const noseOf = (breed, opts) => face(buildCat(breed, undefined, opts)).nose.material.color.getHex();
  const look = (coat, marks, pattern) => ({ look: { coat, marks, pattern, fur: 'short', eyes: 'green', size: 1 } });

  it('the black cat keeps its pink nose, full and simple, and so does a custom black cat of any pattern', () => {
    expect(noseOf('black')).toBe(PINK);
    expect(noseOf('black', { simple: true })).toBe(PINK);
    for (const marks of ['chocolate', 'black', 'white', 'seal', 'orange', 'grey']) {
      for (const pattern of ['solid', 'stripes', 'points', 'patches', 'socks']) expect(noseOf('tabby', look('black', marks, pattern)), `${marks} ${pattern}`).toBe(PINK);
    }
  });
  it('a DuskClan black keeps the pink nose too', async () => {
    const { CLAN_COATS } = await import('../src/clancast.js');
    for (const row of CLAN_COATS.pines) expect(noseOf(row.eyes, { simple: true, style: row })).toBe(PINK);
  });
  it('the family cats keep their pink noses', () => {
    for (const b of ['zeetoo', 'robbie', 'd2', 'digit']) expect(noseOf(b), b).toBe(PINK);
  });
  it('other coats follow their genetics: brick tabby, seal-point Siamese, salmon ginger tabby, blue-grey (GaleClan grey); pale coats stay pink', async () => {
    expect(noseOf('tabby')).toBe(0xb0605a);
    expect(noseOf('siamese')).toBe(new THREE.Color(PINK).lerp(new THREE.Color(0x4a3b32), 0.7).getHex());
    expect(noseOf('tabby', look('ginger', 'chocolate', 'stripes'))).toBe(0xe2907e);
    const { CLAN_COATS } = await import('../src/clancast.js');
    expect(noseOf('tabby', { simple: true, style: CLAN_COATS.moor[0] })).toBe(0x7c6a74);
    for (const b of ['persian', 'calico', 'mainecoon']) expect(noseOf(b), b).toBe(PINK);
  });
});
