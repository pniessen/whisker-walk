import { describe, it, expect } from 'vitest';
import { SCAR_SITES, SCAR_WALKS, SCARS_MAX, SCARRED_INTRUDERS_MAX, stageFor, scarSide, addScar, fadeScars,
  sanitizeScarList, isCastId, sanitizeScarredIntruders, renderScars, wireScars } from '../src/scars.js';

describe('scar constants and stages', () => {
  it('has the five sites and the caps', () => {
    expect(SCAR_SITES).toEqual(['face', 'shoulder', 'back', 'side', 'hind']);
    expect([SCAR_WALKS, SCARS_MAX, SCARRED_INTRUDERS_MAX]).toEqual([5, 2, 24]);
  });
  it('stage table for left 5..0', () => {
    expect([5, 4, 3, 2, 1, 0].map(stageFor)).toEqual(['full', 'full', 'full', 'half', 'half', 'faint']);
  });
  it('scarSide is stable and one of l/r', () => {
    expect(scarSide('woods-4')).toBe(scarSide('woods-4'));
    const sides = new Set(['tabby', 'mine1', 'woods-1', 'moor-2', 'river-3', 'pines-4'].map(scarSide));
    for (const s of sides) expect(['l', 'r']).toContain(s);
    expect(scarSide(undefined)).toMatch(/^[lr]$/);
  });
});

describe('addScar and fadeScars', () => {
  it('appends, resets the same site, never mutates', () => {
    const a = addScar([], 'face');
    expect(a).toEqual([{ site: 'face', left: 5 }]);
    const b = fadeScars(fadeScars(a));
    const c = addScar(b, 'face');
    expect(b).toEqual([{ site: 'face', left: 3 }]);
    expect(c).toEqual([{ site: 'face', left: 5 }]);
    expect(addScar(a, 'back')).toEqual([{ site: 'face', left: 5 }, { site: 'back', left: 5 }]);
  });
  it('a third scar replaces the faintest, ties the earlier', () => {
    const l = [{ site: 'face', left: 3 }, { site: 'back', left: 1 }];
    expect(addScar(l, 'hind')).toEqual([{ site: 'face', left: 3 }, { site: 'hind', left: 5 }]);
    const t = [{ site: 'face', left: 2 }, { site: 'back', left: 2 }];
    expect(addScar(t, 'side')).toEqual([{ site: 'back', left: 2 }, { site: 'side', left: 5 }]);
  });
  it('fades over six walks: full x3, half x2, faint, gone', () => {
    let l = addScar([], 'face');
    const seen = [stageFor(l[0].left)];
    for (let i = 0; i < 5; i++) { l = fadeScars(l); seen.push(l.length ? stageFor(l[0].left) : 'gone'); }
    l = fadeScars(l);
    seen.push(l.length ? stageFor(l[0].left) : 'gone');
    expect(seen).toEqual(['full', 'full', 'full', 'half', 'half', 'faint', 'gone']);
  });
});

describe('sanitising', () => {
  it('sanitizeScarList repairs hostile lists', () => {
    expect(sanitizeScarList('x')).toEqual([]);
    expect(sanitizeScarList([null, 3, { site: 'nose', left: 2 }, { site: 'face', left: NaN }, { site: 'face', left: 1e9 },
      { site: 'face', left: 2 }, { site: 'back', left: -1 }, { site: 'hind', left: 4 }]))
      .toEqual([{ site: 'face', left: 5 }, { site: 'back', left: 0 }]);
    expect(sanitizeScarList([{ site: 'side', left: 2.7 }])).toEqual([{ site: 'side', left: 2 }]);
  });
  it('isCastId', () => {
    expect(isCastId('woods-4')).toBe(true);
    expect(isCastId('moor-15')).toBe(true);
    expect(isCastId('gorge-1')).toBe(true);
    for (const bad of ['woods-99', '__proto__', 'constructor-1', 'woods', '-1', '', null, 7, 'gorge-99', 'island-1', 'woods-04']) expect(isCastId(bad)).toBe(false);
  });
  it('sanitizeScarredIntruders dedupes keeping the last, caps and drops empties', () => {
    const e = (id, site = 'face', left = 3) => ({ id, scars: [{ site, left }] });
    expect(sanitizeScarredIntruders(null)).toEqual([]);
    const out = sanitizeScarredIntruders([e('woods-1'), e('moor-2'), e('woods-1', 'back'), e('nope-1'), { id: 'river-1', scars: [] }, 5]);
    expect(out).toEqual([{ id: 'moor-2', scars: [{ site: 'face', left: 3 }] }, { id: 'woods-1', scars: [{ site: 'back', left: 3 }] }]);
    const many = [];
    for (const c of ['woods', 'moor', 'river', 'pines']) for (let i = 0; i < 16; i++) many.push(e(`${c}-${i}`));
    for (let i = 0; i < 1000; i++) many.push(e('woods-1'));
    const capped = sanitizeScarredIntruders(many);
    expect(capped.length).toBe(24);
  });
});

describe('render and wire', () => {
  it('renderScars adds stage and the id\'s side', () => {
    const r = renderScars([{ site: 'face', left: 5 }, { site: 'back', left: 1 }], 'woods-4');
    expect(r.map((x) => x.stage)).toEqual(['full', 'half']);
    expect(r[0].side).toBe(scarSide('woods-4'));
    expect(renderScars([], 'x')).toEqual([]);
  });
  it('wireScars rejects the third, unknown sites, bad stage, duplicates and non-arrays', () => {
    const e = (site, stage = 'full', side = 'l') => ({ site, stage, side });
    expect(wireScars({ scars: [e('face'), e('back'), e('hind')] })).toEqual([e('face'), e('back')]);
    expect(wireScars({ scars: [e('nose'), e('face', 'huge'), e('back', 'full', 'x'), e('hind')] })).toEqual([e('hind')]);
    expect(wireScars({ scars: [e('face'), e('face', 'half', 'r')] })).toEqual([e('face')]);
    for (const bad of [{ scars: 'x' }, { scars: {} }, {}, null, undefined, 4, []]) expect(wireScars(bad)).toEqual([]);
  });
});
