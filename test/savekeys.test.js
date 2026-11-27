// Every top-level key of a save must survive the sanitiser (and so a load and the cloud path)
// when it holds a value that is not its default. catmerge.test.js already makes every key
// have a merge rule; this makes every key have a line in the sanitiser too. A new key
// needs one entry in SENTINELS: a valid, non-default value of that key's shape.
import { describe, it, expect } from 'vitest';
import { sanitizeSave, freshStateKeys, CATALOG, JOURNAL_TYPES, isPrizeAccessory } from '../src/progression.js';
import { CUSTOM_IDS, CUSTOM_PERSONALITIES } from '../src/customcats.js';
import { OUTFIT_IDS } from '../src/outfits.js';
import { USAGE_IDS } from '../src/usage.js';
import { DEN_ITEMS } from '../src/den.js';
import { SKILL_IDS } from '../src/skills.js';
import { FIGHT_MOVE_IDS } from '../src/fightmoves.js';
import { KEPT_OFFERS } from '../src/areaoffer.js';
import { EVENT_IDS } from '../src/giftevents.js';
import { clanCast } from '../src/clancast.js';
import { RANK_KEYS } from '../src/wordset.js';

const fresh = sanitizeSave({});

const some = (o) => Object.keys(o)[0];
const DEN_ITEM = some(DEN_ITEMS);
const FIND_ACC = Object.entries(CATALOG.accessories).find(([, a]) => a.find)[0];
const PRIZE = Object.keys(CATALOG.accessories).find((id) => isPrizeAccessory(id));
const PLAYER = 'pl-abcdef1234';
const LOOK = { coat: 'ginger', marks: 'black', pattern: 'solid', fur: 'short', eyes: 'green', size: 1 };

// A valid, non-default value for each key.
// Keys that only stay when something else in the payload says they may.
const ALSO = { area: { unlocked: { cats: [], accessories: [], areas: ['neighborhood', 'park'] } } };

const SENTINELS = {
  version: null, // stamped by the sanitiser, checked in its own test below
  points: 7,
  walks: { park: 3 },
  unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood', 'park'] },
  equipped: { cat: 'siamese' },
  customCats: [{ id: CUSTOM_IDS[0], name: 'Pip', personality: Object.keys(CUSTOM_PERSONALITIES)[0], look: LOOK }],
  moreCatSlots: true,
  outfits: [{ id: OUTFIT_IDS[0], wear: { collar: 'bell' } }],
  usage: { [USAGE_IDS[0]]: { n: 2, last: 1 } },
  area: 'park',
  lifetimePoints: 9,
  bestWalk: 4,
  friends: { Pickles: { breed: 'tabby', greets: 2, lastWalk: null } },
  petName: 'Mittens',
  journal: { [JOURNAL_TYPES[0]]: 1 },
  golden: ['gm-park-1'],
  streak: { last: '2026-01-01', count: 2 },
  kitten: { stage: 1 },
  race: { date: '2026-01-01', area: 'park', bestMs: 5000 },
  moon: { step: 1 },
  reef: { step: 1 },
  crystal: { step: 1 },
  den: { owned: [DEN_ITEM], placed: {} },
  skills: [SKILL_IDS[0]],
  feats: { intruder: 2 },
  duskWalks: 2,
  fightsWon: 3,
  fightMoves: [FIGHT_MOVE_IDS[FIGHT_MOVE_IDS.length - 1]],
  scars: { tabby: [{ site: 'face', left: 2 }] },
  scarredIntruders: [{ id: clanCast('woods')[0].id, scars: [{ site: 'face', left: 2 }] }],
  gifts: [{ area: 'park', spot: 'bench' }],
  grudges: ['Pickles'],
  colony: { id: 'col-abcdef1234', cats: [{ name: 'Pickles', finder: PLAYER, area: 'park', x: 1, z: 1, wear: null, tamedBy: null, tamedWalk: null }] },
  clanRoles: { [RANK_KEYS.medicine]: 'Pickles' },
  clan: { word: 0 },
  marks: { park: [{ kind: 'dig', id: null, x: 1, z: 2, at: 5, contested: false, item: null }] },
  retired: ['rosa'],
  redeemed: ['a'.repeat(64)],
  visits: 5,
  visitPrizesSeen: 1,
  visitPrizePending: PRIZE,
  mapMode: 'turn',
  edition: 'legacy',
  clanPick: { mine: 'woods' },
  keptOffers: [Object.keys(KEPT_OFFERS)[0]],
  tutorial: { first: 'part' },
  foundWear: [FIND_ACC],
  events: [EVENT_IDS[0]],
  sleepingCats: [{ id: CUSTOM_IDS[1], name: 'Zzz', personality: Object.keys(CUSTOM_PERSONALITIES)[0], look: LOOK }],
};


describe('every save key survives the sanitiser', () => {
  const keys = freshStateKeys();
  it('every key has a sentinel, and no sentinel is for a missing key', () => {
    for (const k of keys) expect(Object.hasOwn(SENTINELS, k), `add a sentinel for "${k}" in test/savekeys.test.js`).toBe(true);
    expect(Object.keys(SENTINELS).filter((k) => !keys.includes(k))).toEqual([]);
  });
  for (const k of keys) {
    it(`${k} keeps a non-default value`, () => {
      if (SENTINELS[k] === null) { expect(sanitizeSave({ version: 4 })[k]).toBe(4); return; }
      const out = sanitizeSave({ version: 4, ...ALSO[k], [k]: SENTINELS[k] });
      expect(out[k], `"${k}" was dropped or reset by sanitizeState`).not.toEqual(fresh[k]);
    });
  }
});
