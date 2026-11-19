import { describe, it, expect } from 'vitest';
import { createProgression } from '../src/progression.js';

// Found outfits (step 1): `foundWear` is the durable record of every outfit
// she has found. It rebuilds them into her wardrobe on every load, so a found
// outfit is never lost, and a Load from cloud keeps what either side found.

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

describe('found outfits: the record in the save', () => {
  it('a new save and an old save start with none', () => {
    expect(createProgression(fakeStorage()).state.foundWear).toEqual([]);
    const old = fakeStorage(); old.setItem('whisker-walk-save', JSON.stringify({ version: 4, points: 3 }));
    expect(createProgression(old).state.foundWear).toEqual([]);
  });
  it('recordFoundWear owns it once, does not put it on, and says whether it was new', () => {
    const p = createProgression(fakeStorage());
    expect(p.recordFoundWear('acorncap')).toBe(true);
    expect(p.recordFoundWear('acorncap')).toBe(false);
    expect(p.state.foundWear).toEqual(['acorncap']);
    expect(p.state.unlocked.accessories.filter((id) => id === 'acorncap')).toHaveLength(1);
    expect(p.state.equipped.head).toBe(null);
    for (const bad of ['bell', 'partycrown', 'nope', '__proto__', null, 7]) expect(p.recordFoundWear(bad)).toBe(false);
    expect(p.state.foundWear).toEqual(['acorncap']);
  });
  it('a found outfit survives a reload with unlocked.accessories wiped, and stays worn', () => {
    const s = fakeStorage(); const p = createProgression(s);
    p.recordFoundWear('acorncap'); p.equipAccessory('acorncap');
    const raw = JSON.parse(s.getItem('whisker-walk-save'));
    raw.unlocked.accessories = ['bell'];
    s.setItem('whisker-walk-save', JSON.stringify(raw));
    const q = createProgression(s);
    expect(q.state.unlocked.accessories).toContain('acorncap');
    expect(q.state.equipped.head).toBe('acorncap');
  });
  it('junk in foundWear is dropped: unknown ids, shop ids, repeats, non-strings, and past the cap', () => {
    const s = fakeStorage();
    s.setItem('whisker-walk-save', JSON.stringify({ version: 4, foundWear: ['acorncap', 'acorncap', 'bell', 'x', 3, null, ...Array(200).fill('acorncap')] }));
    expect(createProgression(s).state.foundWear).toEqual(['acorncap']);
  });
  it('Load from cloud keeps every outfit either side found', () => {
    const p = createProgression(fakeStorage()); p.recordFoundWear('acorncap');
    p.replaceFromPayload({ version: 4, points: 1 });             // an older build's payload: no foundWear
    expect(p.state.foundWear).toEqual(['acorncap']);
    expect(p.state.unlocked.accessories).toContain('acorncap');
    const q = createProgression(fakeStorage());
    q.replaceFromPayload({ version: 4, foundWear: ['acorncap'] }); // the cloud has one this device lacks
    expect(q.state.foundWear).toEqual(['acorncap']);
  });
});
