import { describe, test, expect } from 'vitest';
import { createProgression } from '../src/progression.js';
import { sanitizeColony, mergeColony, emptyColony, COLONY_MAX, SOLO_MAX, colonyCap } from '../src/colony.js';
import { CAT_NAMES } from '../src/straynames.js';

// The save holds two kids' real tamed cats. These pin the clan spec's section 8
// invariants across the edition switch: nothing un-tames, nothing is dropped,
// an old save still loads, and the colony caps have not moved.

const SAVE = 'whisker-walk-save';
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

const ME = 'aaaaaaaa-1111';
const [TAMED_NAME, OTHER_NAME, UNTAMED_NAME, FOURTH_NAME] = CAT_NAMES;
const TAMED_CAT = { name: TAMED_NAME, finder: ME, area: 'park', x: 1, z: 2, wear: null, tamedBy: ME, tamedWalk: 'walk-100' };

// A v4 save from before editions: no `edition` key.
const V4 = {
  version: 4, points: 300, walks: { neighborhood: 4, park: 5, seaside: 0, den: 0, docks: 0 },
  golden: ['gm-park-1'],
  colony: {
    ...emptyColony(),
    cats: [
      { ...TAMED_CAT, area: 'woods' },
      { ...TAMED_CAT, name: OTHER_NAME, tamedWalk: 'walk-101' },
      { name: FOURTH_NAME, finder: ME, area: 'park', x: 0, z: 0, wear: null, tamedBy: null, tamedWalk: null },
    ],
  },
  clanRoles: { medicine: TAMED_NAME, deputy: OTHER_NAME },
  clan: { name: 'MossClan', adopted: true },
  marks: {
    park: [
      { kind: 'border', id: 'park-border-1', x: 1, z: 1, at: 10, contested: false, item: null },
      { kind: 'scratch', id: 'park-post-1', x: 2, z: 2, at: 20, contested: true, item: null },
    ],
  },
};

const KEYS_AT_FB6BA0F = ['version', 'points', 'walks', 'unlocked', 'equipped', 'area', 'lifetimePoints',
  'bestWalk', 'friends', 'petName', 'journal', 'golden', 'streak', 'kitten', 'race', 'den', 'skills',
  'feats', 'duskWalks', 'gifts', 'grudges', 'colony', 'clanRoles', 'clan', 'marks', 'retired',
  'redeemed', 'visits', 'visitPrizesSeen', 'visitPrizePending', 'mapMode'];
const load = () => createProgression(fakeStorage({ [SAVE]: JSON.stringify(V4) }));
const tamed = (s) => s.colony.cats.filter((c) => c.tamedBy).map(({ name, tamedBy, tamedWalk }) => ({ name, tamedBy, tamedWalk }));
const known = { knownItems: new Set() };

describe('the edition switch and the save', () => {
  test('flipping the edition there and back leaves the save deep-equal apart from edition', () => {
    const p = load();
    const { edition: _a, ...before } = structuredClone(p.state);
    p.setEdition('legacy'); p.setEdition('canon');
    const { edition: _b, ...after } = p.state;
    expect(after).toEqual(before);
  });
  test('a clan pick survives a flip to Legacy and back', () => {
    const p = load();
    p.setClanPick('woods');
    const { edition: _a, ...before } = structuredClone(p.state);
    p.setEdition('legacy'); p.setEdition('canon');
    const { edition: _b, ...after } = p.state;
    expect(after).toEqual(before);
    expect(after.clanPick.mine).toBe('woods');
  });
  test('no cat un-tames: load, a flip and a Legacy feed keep tamedBy and tamedWalk', () => {
    const p = load();
    const first = tamed(p.state);
    expect(first).toHaveLength(2);
    p.setEdition('legacy');
    p.feedColonyCat({ name: UNTAMED_NAME, by: ME, walk: 'walk-500', area: 'park', x: 0, z: 0 });
    expect(tamed(p.state)).toEqual(first);
  });
  test('no cat is dropped: cats in territories this build cannot walk yet survive', () => {
    const cats = [{ ...TAMED_CAT, area: 'woods' }, { ...TAMED_CAT, name: OTHER_NAME, area: 'island' }];
    const c = sanitizeColony({ ...emptyColony(), cats }, known);
    expect(c.cats.map((x) => x.area)).toEqual(['woods', 'island']);
    const remote = { id: null, partner: null, cats: [], feeds: [], trades: [] };
    const merged = mergeColony({ ...emptyColony(), cats: c.cats }, remote, known);
    expect(merged.cats.map((x) => x.name).sort()).toEqual([TAMED_NAME, OTHER_NAME].sort());
  });
  test('an area outside the colony and territory lists is still refused', () => {
    for (const area of ['den', 'Woods', '__proto__', '', 'a', 'abcdefghijklmnopq']) {
      expect(sanitizeColony({ ...emptyColony(), cats: [{ ...TAMED_CAT, area }] }, known).cats).toEqual([]);
    }
  });
  test('a v4 save still loads, on Clan Edition, with everything it had', () => {
    const s = load().state;
    expect(s.edition).toBe('canon');
    expect(s.colony.cats).toHaveLength(3);
    expect(s.walks.park).toBe(5);
    expect(s.golden).toEqual(['gm-park-1']);
    expect(s.marks.park).toHaveLength(2);
    expect(s.clan).toEqual({ name: 'MossClan', adopted: true });
  });
  test('edition, clanPick, customCats, the fight keys and outfits are the only new top-level keys', () => {
    expect(Object.keys(load().state).sort()).toEqual([...KEYS_AT_FB6BA0F, 'edition', 'clanPick', 'customCats', 'fightsWon', 'fightMoves', 'scars', 'scarredIntruders', 'outfits'].sort());
  });
  test('the caps are unchanged', () => {
    expect([COLONY_MAX, SOLO_MAX, colonyCap(1), colonyCap(2)]).toEqual([24, 12, 12, 24]);
  });
});

test('the caps are still unchanged with the Woods and the River feeding', () => {
  expect([COLONY_MAX, SOLO_MAX]).toEqual([24, 12]);
});

test('the caps are still unchanged with the Moor feeding', () => {
  expect([COLONY_MAX, SOLO_MAX]).toEqual([24, 12]);
});

test('the caps are still unchanged with the Pines feeding', () => {
  expect([COLONY_MAX, SOLO_MAX]).toEqual([24, 12]);
});

describe('kittypets keep every promise', () => {
  test('feeding and taming a kittypet stores its own name, and flipping the edition changes nothing', () => {
    const p = load();
    for (let i = 0; i < 6; i++) p.feedColonyCat({ name: 'Clementine', by: ME, walk: `walk-${900 + i}`, area: 'woods', x: 3, z: 4 });
    const cat = p.state.colony.cats.find((c) => c.name === 'Clementine');
    expect(cat).toMatchObject({ name: 'Clementine', area: 'woods', tamedBy: ME });
    const { edition: _a, ...before } = structuredClone(p.state);
    p.setEdition('legacy'); p.setEdition('canon');
    const { edition: _b, ...after } = p.state;
    expect(after).toEqual(before);
  });
  test('the caps are unchanged by kittypets', () => {
    expect([COLONY_MAX, SOLO_MAX]).toEqual([24, 12]);
  });
});
