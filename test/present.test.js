// The birthday present (2026-11-21): a wrapped box on the home screen while
// the birthday is on and not yet opened; one tap opens it and gives the
// birthday kitten (Ribbonkit), once per save. The kitten is a real cat she
// can play as, named through the word tables in both word sets.
import { describe, it, expect } from 'vitest';
import { createProgression, CATALOG } from '../src/progression.js';
import { BIRTHDAY_EVENT, BIRTHDAY_KITTEN } from '../src/giftevents.js';
import { presentDue } from '../src/ui/party.js';
import { buildDressingModel } from '../src/ui/dressingroom.js';
import { buildCat } from '../src/cat/model.js';
import { PERSONALITIES } from '../src/cat/brain.js';
import { voiceFor } from '../src/catvoice.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import * as THREE from 'three';
import { animateCat } from '../src/cat/animator.js';
import { redressCat } from '../src/cat/redress.js';
import { fingerprintCat } from './helpers/catfingerprint.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const DAY = new Date(2026, 10, 21, 15, 0);
const H = 'ab'.repeat(32);

describe('the present shows', () => {
  it('only while the birthday is on and the present is not opened', () => {
    const p = createProgression(mem());
    expect(presentDue(p, DAY)).toBe(false); // no birthday in the save
    p.redeemCode(H, { events: [BIRTHDAY_EVENT] });
    expect(presentDue(p, DAY)).toBe(true);
    expect(presentDue(p, new Date(2026, 10, 22, 23, 0))).toBe(true);
    expect(presentDue(p, new Date(2026, 10, 23, 0, 0))).toBe(false); // the window has shut
    expect(p.openPresent(BIRTHDAY_EVENT)).toBe(BIRTHDAY_KITTEN);
    expect(presentDue(p, DAY)).toBe(false); // opened: the box is gone
    expect(presentDue(null, DAY)).toBe(false);
  });
  it('a save that opened the code before the present existed gets it', () => {
    const p = createProgression(mem());
    const before = { ...p.state, events: [BIRTHDAY_EVENT] };
    const q = createProgression(mem({ 'whisker-walk-save': JSON.stringify(before) }));
    expect(presentDue(q, DAY)).toBe(true);
  });
});

describe('opening it', () => {
  it('gives the kitten once, owned and saved; she stays on the cat she was playing', () => {
    const storage = mem();
    const p = createProgression(storage);
    expect(p.openPresent(BIRTHDAY_EVENT)).toBe(null); // no birthday: nothing
    p.redeemCode(H, { events: [BIRTHDAY_EVENT] });
    expect(p.equipCat('siamese')).toBe(true);
    const before = { ...p.state.equipped };
    expect(p.openPresent(BIRTHDAY_EVENT)).toBe(BIRTHDAY_KITTEN);
    expect(p.isUnlocked('cats', BIRTHDAY_KITTEN)).toBe(true);
    expect(p.state.equipped).toEqual(before);
    expect(p.equipCat(BIRTHDAY_KITTEN)).toBe(true); // and she can play as it
    expect(p.openPresent(BIRTHDAY_EVENT)).toBe(null); // once per save
    expect(p.openPresent('nope')).toBe(null);
    const again = createProgression(storage);
    expect(again.isUnlocked('cats', BIRTHDAY_KITTEN)).toBe(true);
    expect(again.state.equipped.cat).toBe(BIRTHDAY_KITTEN);  // the choice she made after
  });
  it('never for sale, and a code gives it only as the present does', () => {
    const p = createProgression(mem());
    p.state.points = 9999;
    expect(CATALOG.cats[BIRTHDAY_KITTEN]).toMatchObject({ price: 0, prize: true, code: true });
    expect(p.canBuy('cats', BIRTHDAY_KITTEN)).toBe(false);
  });
});

describe('the birthday kitten', () => {
  it('is named in both word sets: Ribbonkit, and Ribbon in plain words', () => {
    expect(CATALOG.cats[BIRTHDAY_KITTEN].name).toBe('Ribbonkit');
    const plain = withOffWords(() => CATALOG.cats[BIRTHDAY_KITTEN].name);
    expect(plain).toBe('Ribbon');
    expect(bannedIn(plain)).toBe(null);
  });
  it('is playable: a body, a personality and a voice; small, with her bow off under a hat', () => {
    const kit = buildCat(BIRTHDAY_KITTEN);
    expect(kit.userData.breed).toBe(BIRTHDAY_KITTEN);
    expect(kit.scale.x).toBeLessThan(buildCat('calico').scale.x);
    expect(kit.getObjectByName('kitBow')).toBeTruthy();
    expect(buildCat(BIRTHDAY_KITTEN, { head: 'birthdayhat' }).getObjectByName('kitBow')).toBeFalsy();
    expect(PERSONALITIES[BIRTHDAY_KITTEN]).toBeTruthy();
    expect(voiceFor(BIRTHDAY_KITTEN).pitch).toBeGreaterThan(voiceFor('calico').pitch); // a kitten's mew
  });
  it('wears every outfit and nothing of her goes into the ground, standing, sitting or napping', () => {
    const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
    const looks = [BARE, { ...BARE, head: 'birthdayhat', neck: 'bdayrosette', back: 'bdayballoon' }, { ...BARE, collar: 'cakecharm', head: 'partyhat', feet: 'sneakers', body: 'sweater' }];
    for (const acc of looks) for (const st of ['follow', 'perch', 'requestPet', 'nap']) {
      const cat = buildCat(BIRTHDAY_KITTEN, acc); animateCat(cat, st, 1.3, 0, false); cat.updateMatrixWorld(true);
      expect(new THREE.Box3().setFromObject(cat, true).min.y, st).toBeGreaterThanOrEqual(-0.01);
    }
    const acc = { ...BARE, head: 'birthdayhat' };
    expect(fingerprintCat(redressCat(buildCat(BIRTHDAY_KITTEN, BARE), BIRTHDAY_KITTEN, acc))).toEqual(fingerprintCat(buildCat(BIRTHDAY_KITTEN, acc)));
  });
  it('is in her cat picker once hers, and hidden (not "locked") before', () => {
    const p = createProgression(mem());
    const ids = () => buildDressingModel(p.state, CATALOG).cats.map((c) => c.id);
    expect(ids()).not.toContain(BIRTHDAY_KITTEN);
    p.redeemCode(H, { events: [BIRTHDAY_EVENT] });
    p.openPresent(BIRTHDAY_EVENT);
    const m = buildDressingModel(p.state, CATALOG);
    expect(m.cats.find((c) => c.id === BIRTHDAY_KITTEN)).toMatchObject({ owned: true, selected: false });
    expect(m.hero.name).toBe('Tabby'); // still her own cat
    p.equipCat(BIRTHDAY_KITTEN);
    expect(buildDressingModel(p.state, CATALOG).hero.name).toBe('Ribbonkit');
  });
});
