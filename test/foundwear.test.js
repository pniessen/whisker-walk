import { describe, it, expect } from 'vitest';
import { CATALOG, BASE_ACCESSORY_IDS, accessoriesWithFound, createProgression, isPrizeAccessory, isTradeableAccessory } from '../src/progression.js';
import { HEAD_WEAR } from '../src/foundwear/head.js';
import { FACE_WEAR } from '../src/foundwear/face.js';
import { NECK_WEAR } from '../src/foundwear/neck.js';
import { BODY_WEAR } from '../src/foundwear/body.js';
import { FEET_WEAR } from '../src/foundwear/feet.js';
import { validateFoundWear, foundWearIn, foundRecord, FOUND_WEAR, FOUND_WEAR_IDS } from '../src/foundwear/index.js';
import { spotsIn } from '../src/foundwear/spots/index.js';
import { withOffWords } from './helpers/offwords.js';
import { memoryStorage as fakeStorage } from './helpers/storage.js';

// Found outfits (step 1): one find-only outfit hidden on every walk. These
// are the records' own checks, the catalog entry they make, and its name.

describe('found outfits: the records', () => {
  it('the registry passes its own checks', () => {
    // the hand-written ids, not the catalog's: a found id that clashed with
    // one would have been skipped there and so never be seen as taken
    expect(validateFoundWear({ head: HEAD_WEAR, face: FACE_WEAR, neck: NECK_WEAR, body: BODY_WEAR, feet: FEET_WEAR },
      { areaIds: [...Object.keys(CATALOG.areas), 'moon'], takenIds: BASE_ACCESSORY_IDS })).toEqual([]);
  });
  it('a found record may not take a shop or prize id, and never replaces one', () => {
    const heart = Object.freeze({ id: 'heart', slot: 'collar', find: 'park', emoji: '💖', name: () => 'Heart' });
    const problems = validateFoundWear({ head: [], face: [], neck: [heart], body: [], feet: [] },
      { areaIds: [...Object.keys(CATALOG.areas), 'moon'], takenIds: BASE_ACCESSORY_IDS });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/heart/);
    // the catalog keeps the shop's Heart Charm Collar, whatever the found records say
    const shopHeart = { name: 'Heart Charm Collar', slot: 'collar', price: 25 };
    expect(CATALOG.accessories.heart).toEqual(shopHeart);
    const clash = { heart: { name: 'Heart', slot: 'collar', price: 0, prize: true, find: 'park', emoji: '💖' } };
    const merged = accessoriesWithFound({ heart: shopHeart, bell: { name: 'Bell' } }, { ...clash, mosscap: { name: 'Moss Cap' } });
    expect(Object.keys(merged)).toEqual(['heart', 'bell', 'mosscap']);
    expect(merged.heart).toBe(shopHeart);
    // every hand-written id comes first, then the found ones
    expect(Object.keys(CATALOG.accessories).slice(0, BASE_ACCESSORY_IDS.length)).toEqual([...BASE_ACCESSORY_IDS]);
  });
  it('a name that throws is reported, not a crash', () => {
    const bad = Object.freeze({ id: 'mosscap', slot: 'head', find: 'woods', emoji: '🌿', name: () => { throw new Error('no'); } });
    expect(validateFoundWear({ head: [bad], face: [], neck: [], body: [], feet: [] }, { areaIds: ['woods'], takenIds: [] })).toHaveLength(1);
  });
  it('the checks catch each kind of mistake', () => {
    const ok = { id: 'mosscap', slot: 'head', find: 'woods', emoji: '🌿', name: () => 'Moss Cap' };
    // each record frozen, as the files make them (the frozen rule has its own test)
    const run = (head) => validateFoundWear({ head: head.map((r) => Object.freeze({ ...r })), face: [], neck: [], body: [], feet: [] }, { areaIds: ['park', 'woods'], takenIds: ['bell'] });
    expect(run([ok])).toEqual([]);
    expect(run([{ ...ok, id: 'Bad-Id' }])).toHaveLength(1);
    expect(run([ok, ok])).toHaveLength(1);                           // duplicate
    expect(run([{ ...ok, id: 'bell' }])).toHaveLength(1);           // a shop id
    expect(run([{ ...ok, slot: 'neck' }])).toHaveLength(1);          // not this file's slot
    expect(run([{ ...ok, find: 'mars' }])).toHaveLength(1);
    expect(run([{ ...ok, emoji: '' }])).toHaveLength(1);
    expect(run([{ ...ok, name: () => '' }])).toHaveLength(1);
    expect(run(['a', 'b', 'c', 'd', 'e'].map((c) => ({ ...ok, id: `moss${c}aa` })))).toHaveLength(1); // five in the Woods
  });
  it('a record must be frozen, as every record file says', () => {
    const ok = { id: 'mosscap', slot: 'head', find: 'woods', emoji: '🌿', name: () => 'Moss Cap' };
    const run = (head) => validateFoundWear({ head, face: [], neck: [], body: [], feet: [] }, { areaIds: ['woods'], takenIds: [] });
    expect(run([Object.freeze({ ...ok })])).toEqual([]);
    const problems = run([{ ...ok }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/frozen/);
    // the shipped records are frozen
    for (const r of [...HEAD_WEAR, ...FACE_WEAR, ...NECK_WEAR, ...BODY_WEAR, ...FEET_WEAR]) expect(Object.isFrozen(r), r.id).toBe(true);
  });
  it('the Acorn Cap is a find-only prize from the Park', () => {
    const a = CATALOG.accessories.acorncap;
    expect([a.name, a.slot, a.price, a.prize, a.find, a.emoji]).toEqual(['Acorn Cap', 'head', 0, true, 'park', '🌰']);
    expect(isPrizeAccessory('acorncap')).toBe(true);
    expect(isTradeableAccessory('acorncap')).toBe(false);
    expect(Object.keys(CATALOG.accessories).slice(-FOUND_WEAR_IDS.length)).toEqual([...FOUND_WEAR_IDS]);
  });
  it('the name is read when asked, through the phrase table', () => {
    expect(Object.getOwnPropertyDescriptor(CATALOG.accessories.acorncap, 'name').get).toBeTypeOf('function');
    expect(withOffWords(() => CATALOG.accessories.acorncap.name)).toBe('Acorn Cap');
  });
  it('cannot be bought, even with points to spare', () => {
    const p = createProgression(fakeStorage()); p.addPoints(999);
    expect(p.canBuy('accessories', 'acorncap')).toBe(false);
    expect(p.buy('accessories', 'acorncap')).toBe(false);
  });
  it('foundWearIn lists an area\'s records in order, and nothing for junk', () => {
    expect(foundWearIn('park')[0].id).toBe('acorncap');
    for (const r of foundWearIn('park')) expect(r.find).toBe('park');
    for (const id of ['woods', 'den', '__proto__', 'toString', null]) expect(foundWearIn(id)).toEqual([]);
    expect(foundRecord('acorncap').find).toBe('park');
    expect(foundRecord('bell')).toBe(null);
  });
});

describe('found outfits: the finished catalog (step 2)', () => {
  it('step 2: every street place has its four, and the places held back have none yet', () => {
    const ids = (a) => foundWearIn(a).map((r) => r.id);
    expect(ids('neighborhood')).toEqual(['paperboycap', 'gardenglovescarf', 'bottletopcollar', 'doormatcape']);
    expect(ids('park')).toEqual(['acorncap', 'daisychain', 'kitetailribbon', 'puddlewellies']);
    expect(ids('seaside')).toEqual(['buckethat', 'starfishclip', 'shellnecklace', 'beachtowelcape']);
    expect(ids('docks')).toEqual(['sailorcap', 'ropecollar', 'anchorcharm', 'fishermansjumper']);
    expect(ids('farm')).toEqual(['strawhat', 'featherplume', 'neckerchief', 'haybalepack']);
    expect(ids('fair')).toEqual(['stripedboater', 'heartglasses', 'ticketgarland', 'candyflosspuff']);
    for (const a of ['woods', 'river', 'moor', 'pines', 'gorge']) expect(ids(a)).toEqual([]);   // Legacy's retirement first
    expect(FOUND_WEAR).toHaveLength(30);   // the street places' 24, the Market's four, Lighthouse Point's keeper's cap and the Moon's cape
  });
  // Market step 4 (2026-11-21): a hat, a neck piece, a collar charm and a
  // back item, the names placeholders the owner and his daughter will rename
  it('the Market hides four outfits, one per slot group it uses', () => {
    expect(foundWearIn('market').map((r) => r.id)).toEqual(['tradercap', 'stringbagscarf', 'applecharm', 'flowerbasket']);
    expect(foundWearIn('market').map((r) => r.slot)).toEqual(['head', 'neck', 'collar', 'back']);
    expect(foundWearIn('market').map((r) => r.name())).toEqual(['Market Trader’s Cap', 'Shopping-Bag Scarf', 'Apple Charm', 'Flower Basket']);
    expect(withOffWords(() => foundWearIn('market').map((r) => r.name()))).toEqual(['Market Trader’s Cap', 'Shopping-Bag Scarf', 'Apple Charm', 'Flower Basket']);
    expect(validateFoundWear({ head: HEAD_WEAR, face: FACE_WEAR, neck: NECK_WEAR, body: BODY_WEAR, feet: FEET_WEAR },
      { areaIds: [...Object.keys(CATALOG.areas), 'moon'], takenIds: BASE_ACCESSORY_IDS })).toEqual([]);
    for (const id of ['tradercap', 'stringbagscarf', 'applecharm', 'flowerbasket']) expect(CATALOG.accessories[id]?.find, id).toBe('market');
  });
  // Lighthouse milestone 4 (2026-11-22): one outfit, a head piece, its name a placeholder
  it('Lighthouse Point hides one outfit, the keeper\'s cap, and says the same in either set', () => {
    expect(foundWearIn('lighthouse').map((r) => r.id)).toEqual(['keepercap']);
    expect(foundWearIn('lighthouse').map((r) => r.slot)).toEqual(['head']);
    expect(foundWearIn('lighthouse').map((r) => r.name())).toEqual(['Keeper’s Cap']);
    expect(withOffWords(() => foundWearIn('lighthouse').map((r) => r.name()))).toEqual(['Keeper’s Cap']);
    expect(CATALOG.accessories.keepercap?.find).toBe('lighthouse');
    expect(validateFoundWear({ head: HEAD_WEAR, face: FACE_WEAR, neck: NECK_WEAR, body: BODY_WEAR, feet: FEET_WEAR },
      { areaIds: [...Object.keys(CATALOG.areas), 'moon'], takenIds: BASE_ACCESSORY_IDS })).toEqual([]);
  });
  // Moon milestone 4 (2026-11-24): one cape, a body piece (the capes are body ones in this game), hidden on the Moon, behind ?moon=1 (no catalog place yet)
  it('the Moon hides one outfit, the Starlight Cape, a body piece with a plain name in either set; the Moon has no catalog place yet', () => {
    expect(foundWearIn('moon').map((r) => [r.id, r.slot])).toEqual([['starlightcape', 'body']]);
    expect(foundWearIn('moon').map((r) => r.name())).toEqual(['Starlight Cape']);
    expect(withOffWords(() => foundWearIn('moon').map((r) => r.name()))).toEqual(['Starlight Cape']);
    expect(CATALOG.accessories.starlightcape).toMatchObject({ slot: 'body', price: 0, prize: true, find: 'moon' });
    expect(Object.hasOwn(CATALOG.areas, 'moon')).toBe(false);
  });
  it('step 2: every street place has its find spots, and only the Woods of the territories', () => {
    for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'farm', 'fair']) {
      expect(spotsIn(a).length, a).toBeGreaterThanOrEqual(10);
      expect(spotsIn(a).length, a).toBeLessThanOrEqual(15);
    }
    for (const a of ['river', 'moor', 'pines', 'gorge']) expect(spotsIn(a), a).toEqual([]);
    expect(spotsIn('woods').length).toBeGreaterThan(0);   // spots, no records: the pouch
  });
});
