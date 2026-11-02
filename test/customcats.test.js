import { describe, it, expect } from 'vitest';
import { sanitizeLook, sanitizeCustomCats, lookToStyle, lookKey, activeCat, ownTagName, wireLook, catProfileFields, scarKey, presetFor,
  DEFAULT_LOOK, CUSTOM_PERSONALITIES, COATS, MARKS, EYES, PATTERNS, FURS, SIZE } from '../src/customcats.js';
import { PERSONALITIES } from '../src/cat/brain.js';
import { readFileSync, globSync } from 'node:fs';

const cat = (over = {}) => ({ id: 'mine1', name: 'Ember', personality: 'keenNose', look: { ...DEFAULT_LOOK }, ...over });

describe('sanitizeLook', () => {
  it('junk becomes the default look', () => {
    for (const junk of [null, 'x', 5, [], undefined]) expect(sanitizeLook(junk)).toEqual(DEFAULT_LOOK);
  });
  it('repairs each bad field on its own', () => {
    expect(sanitizeLook({ ...DEFAULT_LOOK, coat: 'plaid', eyes: 'blue' })).toEqual({ ...DEFAULT_LOOK, eyes: 'blue' });
    expect(sanitizeLook({ ...DEFAULT_LOOK, coat: 'toString', marks: '__proto__' })).toEqual(DEFAULT_LOOK);
  });
  it('clamps and snaps size', () => {
    expect(sanitizeLook({ size: 9 }).size).toBe(1.15);
    expect(sanitizeLook({ size: -1 }).size).toBe(0.85);
    expect(sanitizeLook({ size: 0.93 }).size).toBe(0.95);
    for (const s of [NaN, '1.1', Infinity, null]) expect(sanitizeLook({ size: s }).size).toBe(1);
  });
  it('ignores inherited fields', () => {
    expect(sanitizeLook(Object.create({ coat: 'black' })).coat).toBe('ginger');
  });
});

describe('sanitizeCustomCats', () => {
  it('junk becomes []', () => {
    for (const junk of [null, 'x', {}, 7]) expect(sanitizeCustomCats(junk)).toEqual([]);
    expect(sanitizeCustomCats([null, 5, 'a', []])).toEqual([]);
  });
  it('keeps at most three, in order', () => {
    const many = ['mine1', 'mine2', 'mine3'].map((id) => cat({ id }));
    expect(sanitizeCustomCats([...many, cat({ id: 'mine1', name: 'Extra' })]).map((c) => c.id)).toEqual(['mine1', 'mine2', 'mine3']);
  });
  it('drops duplicate and unknown ids, keeping the first', () => {
    const out = sanitizeCustomCats([cat(), cat({ name: 'Dupe' }), cat({ id: 'mine4' }), cat({ id: '__proto__' }), cat({ id: 'mine2' })]);
    expect(out.map((c) => [c.id, c.name])).toEqual([['mine1', 'Ember'], ['mine2', 'Ember']]);
  });
  it('repairs a bad field rather than dropping the cat', () => {
    const [c] = sanitizeCustomCats([{ id: 'mine1', name: 'A', personality: 'bird', look: { coat: 'plaid' }, extra: 1 }]);
    expect(c).toEqual({ id: 'mine1', name: 'My Cat', personality: 'keenNose', look: DEFAULT_LOOK });
    expect(sanitizeCustomCats([cat({ personality: 'zeetoo' })])[0].personality).toBe('keenNose');
    expect(sanitizeCustomCats([cat({ name: 'shitcat' })])[0].name).toBe('My Cat');
  });
  it('scans a huge array quickly and keeps three', () => {
    const huge = Array.from({ length: 100000 }, (_, i) => cat({ id: `mine${(i % 3) + 1}` }));
    expect(sanitizeCustomCats(huge)).toHaveLength(3);
  });
});

describe('lookToStyle', () => {
  it('maps every pattern and fur to the agreed flags, and never a family-cat flag', () => {
    const banned = ['cow', 'whiteLegs', 'band', 'ears', 'legLen', 'body', 'tagCollar', 'eyes'];
    for (const [pattern] of PATTERNS) for (const [fur] of FURS) {
      const s = lookToStyle({ ...DEFAULT_LOOK, pattern, fur });
      for (const k of banned) expect(Object.hasOwn(s, k), `${pattern}/${fur} ${k}`).toBe(false);
    }
    expect(lookToStyle({ ...DEFAULT_LOOK, pattern: 'patches' })).toMatchObject({ patches: true, patch2: MARKS.chocolate.hex, headPatch: MARKS.chocolate.hex });
    expect(lookToStyle({ ...DEFAULT_LOOK, pattern: 'socks' })).toMatchObject({ socks: true, chin: true, bib: true });
    expect(lookToStyle({ ...DEFAULT_LOOK, fur: 'long' })).toMatchObject({ fluffy: true, tufts: true, tailFluff: 1.3 });
  });
  it('takes coat, belly, accent, eyes and size from the tables', () => {
    const s = lookToStyle({ coat: 'bluegrey', marks: 'white', pattern: 'solid', fur: 'short', eyes: 'copper', size: 0.85 });
    expect(s).toMatchObject({ base: COATS.bluegrey.hex, belly: COATS.bluegrey.belly, accent: MARKS.white.hex, eyeColor: EYES.copper.hex, scale: 0.85 });
  });
});

describe('activeCat', () => {
  const base = { petName: 'Willow', equipped: { cat: 'siamese', custom: null }, customCats: [cat({ personality: 'fearless' })] };
  it('a ready-made cat walks with the pet name and no look', () => {
    expect(activeCat(base)).toEqual({ breed: 'siamese', look: null, name: 'Willow', custom: null });
  });
  it('a custom cat walks as its preset, with its look and name', () => {
    expect(activeCat({ ...base, equipped: { cat: 'siamese', custom: 'mine1' } }))
      .toEqual({ breed: 'black', look: DEFAULT_LOOK, name: 'Ember', custom: 'mine1' });
  });
  it('a dangling custom id falls back to the preset', () => {
    expect(activeCat({ ...base, equipped: { cat: 'siamese', custom: 'mine3' } }).custom).toBe(null);
  });
  it('every personality plays exactly as its preset row', () => {
    for (const [p, breed] of Object.entries(CUSTOM_PERSONALITIES)) {
      const a = activeCat({ ...base, equipped: { cat: 'tabby', custom: 'mine1' }, customCats: [cat({ personality: p })] });
      expect(PERSONALITIES[a.breed]).toBe(PERSONALITIES[breed]);
      expect(presetFor(p)).toBe(breed);
    }
  });
});

describe('the wire', () => {
  it('wireLook: missing or non-object means the plain preset; an object is repaired', () => {
    expect(wireLook({})).toBe(null);
    expect(wireLook({ look: 'x' })).toBe(null);
    expect(wireLook({ look: [] })).toBe(null);
    expect(wireLook(null)).toBe(null);
    expect(wireLook({ look: { coat: 'newcolour', eyes: 'gold' } })).toEqual({ ...DEFAULT_LOOK, eyes: 'gold' });
  });
  it('catProfileFields sends look only for a custom cat, and keeps it small', () => {
    const st = { equipped: { cat: 'tabby', collar: 'bell', head: null, face: null, neck: null, body: null, back: null, feet: null, custom: 'mine1' },
      customCats: [cat({ personality: 'chaser', look: { coat: 'bluegrey', marks: 'chocolate', pattern: 'patches', fur: 'fluffy', eyes: 'copper', size: 1.15 } })] };
    const f = catProfileFields(st);
    expect(f.breed).toBe('siamese');
    expect(f.accessories.collar).toBe('bell');
    expect(JSON.stringify(f.accessories.look).length).toBeLessThanOrEqual(120);
    expect(Object.hasOwn(catProfileFields({ ...st, equipped: { ...st.equipped, custom: null } }).accessories, 'look')).toBe(false);
  });
  it('scarKey is the custom id, else the preset, never Hagrid', () => {
    const eq = { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null, custom: null };
    expect(scarKey({ equipped: eq, customCats: [] })).toBe('tabby');
    expect(scarKey({ equipped: { ...eq, cat: 'siamese' } })).toBe('siamese');
    expect(scarKey({ equipped: { ...eq, cat: 'hagrid' } })).toBe(null);
    expect(scarKey({ equipped: { ...eq, cat: 'hagrid', custom: 'mine1' }, customCats: [cat()] })).toBe('mine1');
    expect(scarKey({ equipped: { ...eq, custom: 'mine1' }, customCats: [] })).toBe('tabby');
    expect(scarKey(null)).toBe('tabby');
  });
  it('catProfileFields adds accessories.scars only when there are scars', () => {
    const st = { equipped: { cat: 'tabby', collar: 'bell', head: null, face: null, neck: null, body: null, back: null, feet: null, custom: null }, customCats: [] };
    const plain = JSON.stringify(catProfileFields(st));
    expect(JSON.stringify(catProfileFields(st, []))).toBe(plain);
    expect(plain).not.toContain('scars');
    const sc = [{ site: 'face', stage: 'full', side: 'l' }];
    expect(catProfileFields(st, sc).accessories.scars).toEqual(sc);
  });
  it('lookKey is stable over field order', () => {
    expect(lookKey({ size: 1, eyes: 'green', fur: 'short', pattern: 'stripes', marks: 'chocolate', coat: 'ginger' })).toBe(lookKey(DEFAULT_LOOK));
  });
});

it('nothing outside progression, customcats and the dressing room reads equipped.cat', () => {
  const allowed = new Set(['src/progression.js', 'src/customcats.js', 'src/ui/dressingroom.js']);
  const hits = globSync('src/**/*.js').filter((f) => !allowed.has(f))
    .filter((f) => /equipped(\?)?\.cat\b/.test(readFileSync(f, 'utf8')));
  expect(hits).toEqual([]);
});

it('ownTagName: only a custom cat gets a tag, its name re-checked and clamped', () => {
  const st = (name, custom = 'mine1') => ({ petName: 'Willow', equipped: { cat: 'tabby', custom }, customCats: [{ id: 'mine1', name, personality: 'chaser', look: DEFAULT_LOOK }] });
  expect(ownTagName(st('Ember', null))).toBe(null);
  expect(ownTagName(st('Ember'))).toBe('Ember');
  expect(ownTagName(st('Warrior Star'))).toBe('Warrior Star');      // a kid may type a borrowed word; it is data, not a literal
  expect(ownTagName(st('<img src=x>'))).toBe('My Cat');
  expect(ownTagName(st('x'.repeat(40)))).toBe('My Cat');
  for (const n of ['Ember', 'Abcdefghijklmnop']) expect(ownTagName(st(n)).length).toBeLessThanOrEqual(16);
});
