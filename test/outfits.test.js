import { describe, it, expect } from 'vitest';
import { OUTFIT_MAX, sanitizeOutfits, wornNow, sameWear, canSaveOutfit, nextOutfitId } from '../src/outfits.js';
import { createProgression, CATALOG } from '../src/progression.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}
const SAVE_KEY = 'whisker-walk-save';

// A cat that owns a hat, glasses and a bow tie on top of the starters.
function dressed(storage = fakeStorage()) {
  const p = createProgression(storage);
  p.addPoints(500);
  for (const id of ['tophat', 'sunglasses', 'bowtie']) expect(p.buy('accessories', id)).toBe(true);
  return p;
}
const wear = (p, ...ids) => { for (const id of ids) p.equipAccessory(id); };
const bare = (p) => { for (const slot of ['collar', 'head', 'face', 'neck', 'body', 'back', 'feet']) p.unequip(slot); };

describe('outfit helpers', () => {
  it('wornNow is what is on, slot by slot, and nothing else', () => {
    expect(wornNow({ cat: 'tabby', custom: null, collar: 'bell', head: null, neck: 'bandana' }, CATALOG))
      .toEqual({ collar: 'bell', neck: 'bandana' });
    // an item in the wrong slot, or one that does not exist, is not worn
    expect(wornNow({ head: 'bell', face: 'monocle-of-doom' }, CATALOG)).toEqual({});
  });

  it('sameWear compares every slot', () => {
    expect(sameWear({ head: 'tophat' }, { head: 'tophat' })).toBe(true);
    expect(sameWear({ head: 'tophat' }, { head: 'tophat', neck: 'bowtie' })).toBe(false);
    expect(sameWear({}, {})).toBe(true);
  });

  it('canSaveOutfit says why not', () => {
    const one = [{ id: 'o1', wear: { head: 'tophat' } }];
    expect(canSaveOutfit(one, {})).toBe('empty');
    expect(canSaveOutfit(one, { head: 'tophat' })).toBe('saved');
    expect(canSaveOutfit(one, { neck: 'bowtie' })).toBe('ok');
    const five = Array.from({ length: OUTFIT_MAX }, (_, i) => ({ id: `o${i + 1}`, wear: { head: `hat${i}` } }));
    expect(canSaveOutfit(five, { neck: 'bowtie' })).toBe('full');
  });

  it('nextOutfitId reuses a freed id', () => {
    expect(nextOutfitId([])).toBe('o1');
    expect(nextOutfitId([{ id: 'o1' }, { id: 'o3' }])).toBe('o2');
    expect(nextOutfitId(Array.from({ length: OUTFIT_MAX }, (_, i) => ({ id: `o${i + 1}` })))).toBe(null);
  });

  it('sanitizeOutfits keeps only what can be trusted', () => {
    expect(sanitizeOutfits('lots', CATALOG)).toEqual([]);
    expect(sanitizeOutfits([
      { id: 'o1', wear: { head: 'tophat', neck: 'bowtie', tail: 'ribbon' } },
      { id: 'o1', wear: { face: 'sunglasses' } },              // the id again
      { id: 'o2', wear: { head: 'bell' } },                    // wrong slot: nothing left
      { id: 'o3', wear: { neck: 'bowtie', head: 'tophat' } },  // the same look as o1
      { id: 'zzz', wear: { face: 'sunglasses' } },
      { id: 'o4', wear: { face: 'sunglasses', __proto__: { head: 'tophat' } } },
      null, 7,
    ], CATALOG)).toEqual([
      { id: 'o1', wear: { head: 'tophat', neck: 'bowtie' } },
      { id: 'o4', wear: { face: 'sunglasses' } },
    ]);
  });

  it('never more than five', () => {
    const hats = Object.keys(CATALOG.accessories).filter((id) => CATALOG.accessories[id].slot === 'head');
    const many = [...hats, ...hats].map((id, i) => ({ id: `o${(i % 5) + 1}`, wear: { head: id } }));
    expect(sanitizeOutfits(many, CATALOG).length).toBeLessThanOrEqual(OUTFIT_MAX);
  });
});

describe('outfits in the save', () => {
  it('a new save has none', () => {
    expect(createProgression(fakeStorage()).state.outfits).toEqual([]);
  });

  it('save an outfit, change clothes, put it back on', () => {
    const p = dressed();
    bare(p);
    wear(p, 'tophat', 'bowtie');
    expect(p.saveOutfit()).toBe('o1');
    bare(p);
    wear(p, 'sunglasses', 'bell');
    expect(p.wearOutfit('o1')).toBe(true);
    expect(p.state.equipped).toMatchObject({ head: 'tophat', neck: 'bowtie', face: null, collar: null, body: null, back: null, feet: null });
  });

  it('wearing an outfit never changes which cat she walks', () => {
    const p = dressed();
    wear(p, 'tophat');
    p.saveOutfit();
    const cat = p.state.equipped.cat;
    p.wearOutfit('o1');
    expect(p.state.equipped.cat).toBe(cat);
    expect(p.state.equipped.custom).toBe(null);
  });

  it('outfits are there in a later session', () => {
    const storage = fakeStorage();
    const p = dressed(storage);
    bare(p);
    wear(p, 'tophat', 'sunglasses');
    p.saveOutfit();
    const later = createProgression(storage);
    expect(later.state.outfits).toEqual([{ id: 'o1', wear: { head: 'tophat', face: 'sunglasses' } }]);
    bare(later);
    expect(later.wearOutfit('o1')).toBe(true);
    expect(later.state.equipped.head).toBe('tophat');
  });

  it('nothing on, the same look twice, or a sixth outfit is not saved', () => {
    const p = dressed();
    bare(p);
    expect(p.saveOutfit()).toBe(null);
    wear(p, 'tophat');
    expect(p.saveOutfit()).toBe('o1');
    expect(p.saveOutfit()).toBe(null);
    const looks = [['bell'], ['bandana'], ['sunglasses'], ['bowtie']];
    for (const look of looks) { bare(p); wear(p, ...look); expect(p.saveOutfit()).not.toBe(null); }
    expect(p.state.outfits).toHaveLength(OUTFIT_MAX);
    bare(p);
    wear(p, 'tophat', 'bell');
    expect(p.saveOutfit()).toBe(null);
  });

  it('a deleted outfit is gone and its place can be used again', () => {
    const p = dressed();
    bare(p); wear(p, 'tophat'); p.saveOutfit();
    bare(p); wear(p, 'bowtie'); p.saveOutfit();
    expect(p.deleteOutfit('o1')).toBe(true);
    expect(p.deleteOutfit('o1')).toBe(false);
    expect(p.wearOutfit('o1')).toBe(false);
    expect(p.state.outfits.map((o) => o.id)).toEqual(['o2']);
    bare(p); wear(p, 'sunglasses');
    expect(p.saveOutfit()).toBe('o1');
  });

  it('an item she no longer owns is left off, and the outfit keeps it', () => {
    const storage = fakeStorage();
    const p = dressed(storage);
    bare(p); wear(p, 'tophat', 'bowtie'); p.saveOutfit();
    const raw = JSON.parse(storage.getItem(SAVE_KEY));
    raw.unlocked.accessories = raw.unlocked.accessories.filter((id) => id !== 'tophat');
    raw.equipped.head = null;
    const later = createProgression(fakeStorage({ [SAVE_KEY]: JSON.stringify(raw) }));
    expect(later.state.outfits[0].wear).toEqual({ head: 'tophat', neck: 'bowtie' });
    bare(later);
    expect(later.wearOutfit('o1')).toBe(true);
    expect(later.state.equipped).toMatchObject({ head: null, neck: 'bowtie' });
  });

  it('a cloud save from an older build keeps this device\'s outfits; a newer one brings its own', () => {
    const p = dressed();
    bare(p); wear(p, 'tophat'); p.saveOutfit();
    const { outfits, ...older } = JSON.parse(JSON.stringify(p.state));
    p.replaceFromPayload(older);
    expect(p.state.outfits).toEqual([{ id: 'o1', wear: { head: 'tophat' } }]);
    p.replaceFromPayload({ ...older, outfits: [{ id: 'o2', wear: { neck: 'bowtie' } }] });
    expect(p.state.outfits).toEqual([{ id: 'o2', wear: { neck: 'bowtie' } }]);
  });
});

describe('outfits in the dressing room', async () => {
  const { createDressingRoom } = await import('../src/ui/dressingroomview.js');
  const { buildDressingModel } = await import('../src/ui/dressingroom.js');
  const click = (room, dataset) => room.handleClick({ target: { closest: () => ({ dataset, ownerDocument: {} }) } });
  function setup() {
    const p = dressed();
    const calls = { profile: 0, sync: 0 };
    const room = createDressingRoom({
      progression: p, thumbs: { cats: {}, accessories: { tophat: 'data:hat', bowtie: 'data:tie' } },
      onProfileChange: () => { calls.profile += 1; }, sync: { autoSync: () => { calls.sync += 1; } },
    });
    click(room, { drWardrobe: '' });
    return { p, room, calls };
  }

  it('the model lists her outfits, marks the one she has on, and says whether this look can be saved', () => {
    const p = dressed();
    bare(p); wear(p, 'tophat', 'bowtie'); p.saveOutfit();
    let m = buildDressingModel(p.state, CATALOG, {});
    expect(m.outfits).toEqual([{
      id: 'o1', label: 'Outfit 1', worn: true,
      items: [{ id: 'tophat', name: 'Top Hat', owned: true }, { id: 'bowtie', name: 'Bow Tie', owned: true }],
    }]);
    expect(m.outfitSave).toBe('saved');
    p.unequip('head');
    m = buildDressingModel(p.state, CATALOG, {});
    expect(m.outfits[0].worn).toBe(false);
    expect(m.outfitSave).toBe('ok');
    bare(p);
    expect(buildDressingModel(p.state, CATALOG, {}).outfitSave).toBe('empty');
  });

  it('the wardrobe shows Saved outfits; home does not', () => {
    const p = dressed();
    const room = createDressingRoom({ progression: p, thumbs: { cats: {}, accessories: {} } });
    expect(room.html()).not.toContain('data-dr-outfit-save');
    click(room, { drWardrobe: '' });
    expect(room.html()).toContain('Saved outfits');
    expect(room.html()).toContain('data-dr-outfit-save');
  });

  it('Save this outfit saves the look, then reads Saved', () => {
    const { p, room, calls } = setup();
    bare(p); wear(p, 'tophat', 'bowtie');
    expect(room.html()).toMatch(/data-dr-outfit-save\s*>＋ Save this outfit/);
    click(room, { drOutfitSave: '' });
    expect(p.state.outfits).toEqual([{ id: 'o1', wear: { head: 'tophat', neck: 'bowtie' } }]);
    expect(calls.sync).toBe(1);
    const html = room.html();
    expect(html).toMatch(/data-dr-outfit-save disabled>Saved ✓/);
    expect(html).toContain('data-dr-outfit="o1" aria-pressed="true"');
    expect(html).toContain('aria-label="Wear Outfit 1: Top Hat, Bow Tie"');
    expect(html).toContain('src="data:hat"');
    expect(html).toContain('on now ✓');
  });

  it('a tap on an outfit puts it on, drops a try-on and tells her friends once', () => {
    const { p, room, calls } = setup();
    bare(p); wear(p, 'tophat', 'bowtie'); p.saveOutfit();
    bare(p); wear(p, 'sunglasses');
    click(room, { drAcc: 'glow', drAct: 'try' });
    expect(room.ui.tryOn).toEqual({ slot: 'collar', id: 'glow' });
    click(room, { drOutfit: 'o1' });
    expect(p.state.equipped).toMatchObject({ head: 'tophat', neck: 'bowtie', face: null });
    expect(room.ui.tryOn).toBe(null);
    expect(calls.profile).toBe(1);
    click(room, { drOutfit: 'o1' }); // already on: nothing changed
    expect(calls.profile).toBe(1);
    click(room, { drOutfit: 'o9' }); // no such outfit
    expect(calls.profile).toBe(1);
  });

  it('✕ forgets an outfit without undressing the cat', () => {
    const { p, room } = setup();
    bare(p); wear(p, 'tophat'); p.saveOutfit();
    click(room, { drOutfitDel: 'o1' });
    expect(p.state.outfits).toEqual([]);
    expect(p.state.equipped.head).toBe('tophat');
    expect(room.html()).not.toContain('data-dr-outfit="o1"');
  });

  it('with nothing on, or five saved, the button says why it will not save', () => {
    const { p, room } = setup();
    bare(p);
    expect(room.html()).toMatch(/data-dr-outfit-save disabled>Put something on to save it/);
    for (const id of ['tophat', 'bell', 'bandana', 'sunglasses', 'bowtie']) { bare(p); wear(p, id); p.saveOutfit(); }
    bare(p); wear(p, 'tophat', 'bell');
    expect(room.html()).toMatch(/data-dr-outfit-save disabled>5 outfits saved/);
  });
});

describe('outfit pictures', async () => {
  const { createDressingRoom } = await import('../src/ui/dressingroomview.js');
  const click = (room, dataset) => room.handleClick({ target: { closest: () => ({ dataset, ownerDocument: {} }) } });

  it('each outfit gets one picture of her cat wearing it, snapped once', () => {
    const p = dressed();
    bare(p); wear(p, 'tophat', 'bowtie'); p.saveOutfit();
    const snaps = [];
    const room = createDressingRoom({
      progression: p, thumbs: { cats: {}, accessories: {} },
      snapCustom: (entries) => { snaps.push(...entries); return Object.fromEntries(entries.map((e) => [e.key, 'data:outfit'])); },
    });
    expect(room.html()).not.toContain('data:outfit'); // home: no wardrobe, no snap
    expect(snaps).toHaveLength(0);
    click(room, { drWardrobe: '' });
    expect(room.html()).toContain('<span class="dr-outfit-pic whole"><img src="data:outfit"');
    expect(snaps.filter((e) => e.key.startsWith('outfit|'))).toEqual([
      expect.objectContaining({ breed: 'tabby', wear: { head: 'tophat', neck: 'bowtie' } }),
    ]);
    room.html();
    expect(snaps.filter((e) => e.key.startsWith('outfit|'))).toHaveLength(1);
  });

  it('without a picture the row shows its items, and names them', () => {
    const p = dressed();
    bare(p); wear(p, 'tophat', 'bowtie'); p.saveOutfit(); bare(p);
    const room = createDressingRoom({
      progression: p, thumbs: { cats: {}, accessories: { tophat: 'data:hat' } }, snapCustom: () => { throw new Error('no WebGL'); },
    });
    click(room, { drWardrobe: '' });
    const html = room.html();
    expect(html).toContain('src="data:hat"');
    expect(html).toContain('<small>Top Hat, Bow Tie</small>');
  });
});
