import { describe, it, expect } from 'vitest';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { setCatScars } from '../src/cat/scarmesh.js';
import { SCARS, DEFAULT_LOOK, COATS, PATTERNS, FURS, sanitizeLook, lookKey, lookToStyle, wireLook, catProfileFields } from '../src/customcats.js';
import { newBuilder, reduceBuilder, buildBuilderModel, renderBuilderHtml } from '../src/ui/catbuilder.js';
import { sanitizeSave } from '../src/progression.js';

const MARKS = SCARS.map((p) => p[0]).filter((id) => id !== 'none');
const tris = (m) => m.geometry.index.count / 3;

describe('builder scars: the look field', () => {
  it('five scars and a way to pick none; none is never saved', () => {
    expect(MARKS).toHaveLength(5);
    expect(SCARS[0][0]).toBe('none');
    expect(sanitizeLook({ ...DEFAULT_LOOK, scar: 'none' })).toEqual(DEFAULT_LOOK);
    expect(Object.hasOwn(sanitizeLook(DEFAULT_LOOK), 'scar')).toBe(false);
    expect(sanitizeLook({ ...DEFAULT_LOOK, scar: 'bogus' })).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook({ ...DEFAULT_LOOK, scar: 7 })).toEqual(DEFAULT_LOOK);
    for (const id of MARKS) expect(sanitizeLook({ ...DEFAULT_LOOK, scar: id }).scar).toBe(id);
  });
  it('rides the style, the look key and the wire', () => {
    expect(lookToStyle({ ...DEFAULT_LOOK, scar: 'brow' }).scarMark).toBe('brow');
    expect(lookToStyle(DEFAULT_LOOK).scarMark).toBeUndefined();
    expect(lookKey({ ...DEFAULT_LOOK, scar: 'tip' })).not.toBe(lookKey(DEFAULT_LOOK));
    const st = { equipped: { custom: 'mine1' }, customCats: [{ id: 'mine1', name: 'Pip', personality: 'keenNose', look: { ...DEFAULT_LOOK, scar: 'nick' } }] };
    expect(wireLook(catProfileFields(st).accessories).scar).toBe('nick');
  });
  it('survives the save sanitiser inside customCats', () => {
    const cats = [{ id: 'mine1', name: 'Pip', personality: 'keenNose', look: { ...DEFAULT_LOOK, scar: 'cheek' } }];
    expect(sanitizeSave({ version: 4, customCats: cats }).customCats[0].look.scar).toBe('cheek');
    cats[0].look.scar = 'zzz';
    expect(Object.hasOwn(sanitizeSave({ version: 4, customCats: cats }).customCats[0].look, 'scar')).toBe(false);
  });
});

describe('builder scars: the picker', () => {
  it('a Scar row of big pills, picking and clearing', () => {
    let b = newBuilder();
    const row = buildBuilderModel(b).rows.find((r) => r.key === 'scar');
    expect(row.options).toHaveLength(6);
    expect(row.value).toBe('none');
    expect(renderBuilderHtml(buildBuilderModel(b))).toContain('data-cb-pick="scar" data-cb-value="nose"');
    b = reduceBuilder(b, { type: 'pick', field: 'scar', value: 'nose' });
    expect(b.draft.look.scar).toBe('nose');
    expect(reduceBuilder(b, { type: 'pick', field: 'scar', value: 'nose' })).toBe(b);
    b = reduceBuilder(b, { type: 'pick', field: 'scar', value: 'none' });
    expect(Object.hasOwn(b.draft.look, 'scar')).toBe(false);
    expect(reduceBuilder(b, { type: 'pick', field: 'scar', value: 'nope' })).toBe(b);
  });
});

describe('builder scars: the drawing', () => {
  const marked = async (scar, extra = {}) => { const c = buildCat('tabby', undefined, { look: { ...DEFAULT_LOOK, ...extra, scar } }); await c.userData.markReady; return c; };
  it('no scar, no mesh; each scar one small mesh of at most 8 triangles', async () => {
    expect(buildCat('tabby', undefined, { look: DEFAULT_LOOK }).userData.parts.marks).toBeUndefined();
    for (const id of MARKS) {
      const cat = await marked(id);
      const m = cat.userData.parts.marks;
      expect(m, id).toBeTruthy();
      expect(m.name).toBe('marks');
      expect(tris(m)).toBeLessThanOrEqual(8);
      expect(m.castShadow).toBe(false);
    }
  });
  it('builds on every coat, pattern and fur, and rides the pose', async () => {
    for (const coat of Object.keys(COATS)) for (const [pattern] of PATTERNS) for (const [fur] of FURS) for (const id of MARKS.slice(0, 2)) {
      const cat = await marked(id, { coat, pattern, fur });
      expect(cat.userData.parts.marks, `${id} ${coat} ${pattern} ${fur}`).toBeTruthy();
    }
    const cat = await marked('brow');
    const m = cat.userData.parts.marks;
    const before = Array.from(m.geometry.attributes.position.array);
    animateCat(cat, 'sniff', 1.1, 0, false);
    expect(Array.from(m.geometry.attributes.position.array)).not.toEqual(before);
  });
  it('simple (remote) builds show it too, and fight scars sit beside it', async () => {
    const cat = buildCat('tabby', undefined, { simple: true, look: { ...DEFAULT_LOOK, scar: 'nose' }, scars: [{ site: 'side', stage: 'full', side: 'r' }] });
    await cat.userData.markReady;
    expect(cat.userData.parts.marks).toBeTruthy();
    expect(cat.userData.parts.scars).toBeTruthy();
    setCatScars(cat, []);
    expect(cat.userData.parts.scars).toBeUndefined();
    expect(cat.userData.parts.marks).toBeTruthy(); // the fight scar clearing never wipes it
    expect(cat.children.filter((c) => c.name === 'marks')).toHaveLength(1);
  });
});
