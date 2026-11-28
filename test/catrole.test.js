// Choose your cat's role, milestone 1: the pure rules, the save field, the merge, the words, the own tag.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ROLE_RULES, PICK_ROLES, SAY_ROLES, SAY_COUNT, DEFAULT_ROLE, sanitizeCatRole, isDefaultRole, totalWalks, catWalks, earnedRank,
  walksToGo, pickableRoles, effectiveRole, roleScale, shownName, sayId, goalId,
} from '../src/catrole.js';
import { RANK_KEYS, rankWord } from '../src/wordset.js';
import { phrase, hasPhrase } from '../src/clanphrases.js';
import { ROLE_LINES, roleSay, roleGoalLine } from '../src/rolelines.js';
import { sanitizeCustomCats, activeCat, ownRole } from '../src/customcats.js';
import { createProgression, sanitizeSave, freshStateKeys, CATALOG } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { attachOwnTag, OWN_TAG_SCALE } from '../src/game/owntag.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, offWords } from './helpers/offwords.js';
import * as on from '../src/clanwords.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });

const LOOK = { coat: 'ginger', marks: 'chocolate', pattern: 'stripes', fur: 'short', eyes: 'green', size: 1 };
const cat = (extra = {}) => ({ id: 'mine1', name: 'Pickles', personality: 'keenNose', look: LOOK, ...extra });

describe('earned steps and the one table', () => {
  it('thresholds are the owner\'s (about half the spec): 3 and 10, picks 20 to 30', () => {
    expect([ROLE_RULES.apprenticeAt, ROLE_RULES.warriorAt]).toEqual([3, 10]);
    expect(PICK_ROLES.map((r) => ROLE_RULES.picks[r].walks)).toEqual([20, 20, 25, 30, 30]);
  });
  it('earnedRank steps at the boundaries and is total over junk', () => {
    const at = (n) => earnedRank(n);
    expect([0, 2, 3, 9, 10, 1e9].map(at)).toEqual(['kit', 'kit', 'apprentice', 'apprentice', 'warrior', 'warrior']);
    for (const bad of [NaN, -5, undefined, null, 'x', {}, Infinity * 0]) expect(at(bad)).toBe('kit');
  });
  it('no role changes walk speed, and only kit and apprentice change size', () => {
    expect(Object.keys(ROLE_RULES)).not.toContain('speed');
    const scales = Object.values(RANK_KEYS).map((r) => [r, roleScale(r)]);
    expect(Object.fromEntries(scales)).toEqual({ kit: 0.8, apprentice: 0.92, warrior: 1, elder: 1, queen: 1, medicine: 1, deputy: 1, leader: 1 });
    expect(roleScale('__proto__')).toBe(1);
    expect(roleScale(undefined)).toBe(1);
  });
  it('totalWalks sums finite counts and ignores junk', () => {
    expect(totalWalks({ a: 2, b: 3.7, c: -4, d: NaN, e: 'x' })).toBe(5);
    expect(totalWalks(null)).toBe(0);
    expect(totalWalks([1, 2])).toBe(0);
  });
  it('a cat\'s own walks start from when she was made', () => {
    expect(catWalks(12, { born: 12 })).toBe(0);
    expect(catWalks(12, { born: 5 })).toBe(7);
    expect(catWalks(3, { born: 50 })).toBe(0);
    expect(catWalks(12, undefined)).toBe(12);
  });
  it('walksToGo counts down and is 0 for a non-pick', () => {
    expect(walksToGo(RANK_KEYS.medicine, 15)).toBe(5);
    expect(walksToGo(RANK_KEYS.medicine, 99)).toBe(0);
    expect(walksToGo('warrior', 0)).toBe(0);
  });
});

describe('picks and the role in force', () => {
  const all = { walks: 99, homeGroup: true, adopted: true };
  it('the family words offer all five; the everyday words fold queen and deputy away', () => {
    expect(pickableRoles(all)).toEqual(['medicine', 'queen', 'deputy', 'elder', 'leader']);
    withOffWords(() => expect(pickableRoles(all)).toEqual(['medicine', 'elder', 'leader']));
  });
  it('walks and the group facts gate the offering', () => {
    expect(pickableRoles({ walks: 19 })).toEqual([]);
    expect(pickableRoles({ walks: 20 })).toEqual(['medicine', 'queen']);
    expect(pickableRoles({ walks: 30 })).toEqual(['medicine', 'queen', 'elder']);
    expect(pickableRoles({ walks: 30, homeGroup: true })).toEqual(['medicine', 'queen', 'deputy', 'elder']);
    expect(pickableRoles(null)).toEqual([]);
  });
  it('effectiveRole: a pick wins, else the earned step; an unshowable pick is kept but reads as the step', () => {
    expect(effectiveRole({ pick: 'elder' }, 0)).toBe('elder');
    expect(effectiveRole(undefined, 0)).toBe('kit');
    expect(effectiveRole({ pick: null }, 12)).toBe('warrior');
    withOffWords(() => {
      expect(effectiveRole({ pick: 'queen' }, 12)).toBe('warrior');
      expect(effectiveRole({ pick: 'elder' }, 12)).toBe('elder');
    });
    expect(effectiveRole({ pick: 'queen' }, 12)).toBe('queen'); // and back again, nothing lost
  });
  it('the everyday ranks are the daughter\'s', () => {
    withOffWords(() => expect(['kit', 'apprentice', 'warrior', 'elder', 'leader'].map(rankWord)).toEqual(['kitten', 'scout', 'ranger', 'wise cat', 'first cat']));
  });
});

describe('names: endings only for the closed pool', () => {
  it('no stem leaves her typed name alone, for every role', () => {
    for (const r of Object.values(RANK_KEYS)) expect(shownName('Pickles', r, null)).toBe('Pickles');
  });
  it('a stem builds prefix + ending in the family set', () => {
    const { PREFIXES, RANK_SUFFIX } = on;
    expect(shownName('x', 'kit', 3)).toBe(PREFIXES[3] + RANK_SUFFIX.kit);
    expect(shownName('x', 'apprentice', 3)).toBe(PREFIXES[3] + RANK_SUFFIX.apprentice);
    expect(shownName('x', 'leader', 3)).toBe(PREFIXES[3] + RANK_SUFFIX.leader);
    expect(on.WARRIOR_SUFFIXES).toContain(shownName('x', 'warrior', 3).slice(PREFIXES[3].length));
    expect(shownName('x', 'elder', 3)).toBe(shownName('x', 'warrior', 3));
  });
  it('the everyday words never add an ending', () => {
    withOffWords(() => expect(shownName('Pickles', 'kit', 3)).toBe('Pickles'));
  });
  it('a stem out of range or not a whole number is ignored', () => {
    for (const bad of [-1, 22, 1.5, NaN, '3', undefined]) expect(shownName('Pickles', 'kit', bad)).toBe('Pickles');
  });
});

describe('the save field', () => {
  it('sanitizeCatRole is total over junk and prototype keys', () => {
    for (const bad of [null, undefined, 5, 'x', [], [1], NaN, true]) expect(sanitizeCatRole(bad)).toEqual(DEFAULT_ROLE);
    expect(sanitizeCatRole(Object.create({ pick: 'elder', born: 9, stem: 1 }))).toEqual(DEFAULT_ROLE);
    expect(sanitizeCatRole(JSON.parse('{"__proto__":{"pick":"elder"},"pick":"warrior","stem":99,"born":-1,"seen":9}'))).toEqual({ born: 0, pick: null, stem: null, seen: 2 });
    expect(sanitizeCatRole({ pick: 'leader', stem: 21, born: 4.5, seen: 1 })).toEqual({ born: 0, pick: 'leader', stem: 21, seen: 1 });
    expect(sanitizeCatRole({ pick: 'kit' }).pick).toBeNull(); // an earned step is never a pick
  });
  it('a default role carries no field, so old saves load byte-for-byte unchanged', () => {
    const old = [cat()];
    expect(sanitizeCustomCats(old)).toEqual(old);
    expect(JSON.stringify(sanitizeCustomCats(old))).toBe(JSON.stringify(old));
    expect(sanitizeCustomCats([cat({ catRole: { born: 0, pick: null, stem: null, seen: 0 } })])).toEqual(old);
  });
  it('a role survives the round trip, and junk beside it is cleaned', () => {
    const kept = sanitizeCustomCats([cat({ catRole: { born: 7, pick: 'medicine', stem: 4, seen: 1, extra: 1 } })]);
    expect(kept[0].catRole).toEqual({ born: 7, pick: 'medicine', stem: 4, seen: 1 });
    expect(sanitizeCustomCats(kept)).toEqual(kept);
  });
  it('the save stays version 4 and has no new top-level key (the role lives on each made cat)', () => {
    expect(freshStateKeys()).not.toContain('catRole');
    expect(sanitizeSave({}).version).toBe(4);
  });
  it('a new cat is stamped with the walks so far, and a first-ever cat carries nothing', () => {
    const p = createProgression(memoryStorage());
    const id = p.createCustomCat({ name: 'Pickles', personality: 'keenNose', look: LOOK });
    expect(p.state.customCats.find((c) => c.id === id)).not.toHaveProperty('catRole');
    p.state.walks.park = 5;
    const id2 = p.createCustomCat({ name: 'Mochi', personality: 'keenNose', look: LOOK });
    expect(p.state.customCats.find((c) => c.id === id2).catRole.born).toBe(5);
    expect(sanitizeSave(JSON.parse(JSON.stringify(p.state))).customCats.find((c) => c.id === id2).catRole.born).toBe(5);
  });
  it('editing a cat keeps its role', () => {
    const p = createProgression(memoryStorage());
    p.state.walks.park = 5;
    const id = p.createCustomCat({ name: 'Pickles', personality: 'keenNose', look: LOOK });
    expect(p.updateCustomCat(id, { name: 'Pickle', personality: 'napper', look: LOOK })).toBe(true);
    expect(p.state.customCats[0].catRole.born).toBe(5);
  });
});

describe('the merge', () => {
  const save = (cats, walks = 0) => ({ ...sanitizeSave({}), walks: { ...sanitizeSave({}).walks, park: walks }, customCats: cats, equipped: { ...sanitizeSave({}).equipped } });
  const role = (o) => ({ born: 0, pick: null, stem: null, seen: 0, ...o });
  const merged = (l, c, extra = {}) => mergeSaves({ local: l, cloud: c, ...extra }).save.customCats;
  it('only the cloud changed her role: the cloud\'s role stands', () => {
    const base = save([cat()]);
    const m = merged(save([cat()]), save([cat({ catRole: role({ pick: 'elder' }) })]), { base: { customCats: base.customCats } });
    expect(m).toHaveLength(1);
    expect(m[0].catRole.pick).toBe('elder');
  });
  it('only this device changed it: this device\'s role stands, no duplicate cat', () => {
    const base = save([cat()]);
    const m = merged(save([cat({ catRole: role({ pick: 'medicine', stem: 2 }) })]), save([cat()]), { base: { customCats: base.customCats }, cloudAt: 5, localAt: 1 });
    expect(m).toHaveLength(1);
    expect(m[0].catRole).toEqual(role({ pick: 'medicine', stem: 2 }));
  });
  it('both changed it: the later save wins, pick and stem together', () => {
    const l = save([cat({ catRole: role({ pick: 'medicine', stem: 2 }) })]);
    const c = save([cat({ catRole: role({ pick: 'elder', stem: 9 }) })]);
    expect(merged(l, c, { cloudAt: 9, localAt: 1 })[0].catRole).toEqual(role({ pick: 'elder', stem: 9 }));
    expect(merged(l, c, { cloudAt: 1, localAt: 9 })[0].catRole).toEqual(role({ pick: 'medicine', stem: 2 }));
  });
  it('born keeps the smaller and seen the larger; nothing earned is lost', () => {
    const m = merged(save([cat({ catRole: role({ born: 8, seen: 2 }) })]), save([cat({ catRole: role({ born: 3, seen: 1 }) })]));
    expect(m[0].catRole).toEqual(role({ born: 3, seen: 2 }));
  });
  it('a cloud save from an older build (no role) never wipes this device\'s', () => {
    const m = merged(save([cat({ catRole: role({ pick: 'leader' }) })]), save([cat()]));
    expect(m[0].catRole.pick).toBe('leader');
  });
});

describe('the words', () => {
  it('every role but the warrior has three lines and a goal line, in both sets', () => {
    expect(SAY_ROLES).not.toContain('warrior');
    const check = () => {
      for (const r of SAY_ROLES) {
        for (let i = 0; i < SAY_COUNT; i++) {
          expect(hasPhrase(sayId(r, i))).toBe(true);
          expect(typeof phrase(sayId(r, i))).toBe('string');
          expect(phrase(sayId(r, i)).length).toBeGreaterThan(5);
        }
        expect(roleGoalLine(r)).toBe(phrase(goalId(r)));
      }
      expect(roleSay('warrior', 0)).toBeNull();
      expect(roleGoalLine('warrior')).toBeNull();
      expect(roleSay('queen', -3)).toBe(phrase(sayId('queen', 0)));
      expect(roleSay('queen', 7)).toBe(phrase(sayId('queen', 1)));
    };
    check();
    withOffWords(check);
  });
  it('the everyday lines say "plants" and use no series word', () => {
    withOffWords(() => {
      expect(roleGoalLine('medicine')).toBe('Find three plants');
      const text = Object.values(ROLE_LINES).join(' | ');
      const banned = [...Object.values(on.RANK_WORDS), on.CLAN_SUFFIX, 'camp', 'herb', 'mentor', 'kits', 'moonflow', 'great oak', 'bark', 'hiss'];
      for (const w of banned) expect(text.toLowerCase()).not.toContain(w.toLowerCase());
    });
  });
  it('the family set overrides some lines with its own words, and only with ids the table has', () => {
    expect(roleGoalLine('medicine')).toBe('Find three herbs');
    for (const id of Object.keys(on.PHRASES).filter((k) => k.startsWith('role.'))) expect(Object.hasOwn(ROLE_LINES, id)).toBe(true);
    expect(Object.keys(offWords.PHRASES).filter((k) => k.startsWith('role.'))).toEqual([]);
  });
});

describe('her own tag, read from the save', () => {
  const stateWith = (walks, catRole, over = {}) => ({
    walks: { park: walks }, petName: 'Whiskers', equipped: { cat: 'tabby', custom: 'mine1' },
    customCats: [cat(catRole ? { catRole } : {})], ...over,
  });
  it('a ready-made cat has no role', () => {
    expect(ownRole({ walks: { park: 50 }, equipped: { cat: 'tabby', custom: null }, customCats: [] })).toBeNull();
  });
  it('a made cat reads kit, apprentice, warrior from her own walks', () => {
    expect(ownRole(stateWith(0)).role).toBe('kit');
    expect(ownRole(stateWith(3)).role).toBe('apprentice');
    expect(ownRole(stateWith(10)).role).toBe('warrior');
    expect(ownRole(stateWith(12, { born: 10, pick: null, stem: null, seen: 0 })).role).toBe('kit'); // made at walk 10
    expect(ownRole(stateWith(1e6, { born: 0, pick: 'elder', stem: null, seen: 0 })).role).toBe('elder');
  });
  it('the name is her typed name unless she has a stem', () => {
    expect(ownRole(stateWith(0)).name).toBe('Pickles');
    expect(ownRole(stateWith(0, { born: 0, pick: null, stem: 5, seen: 0 })).name).toBe(shownName('Pickles', 'kit', 5));
    expect(activeCat(stateWith(0))).not.toHaveProperty('catRole');
  });
  const withDoc = (fn) => {
    const prev = globalThis.document;
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({ font: '' }, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } }) }) };
    try { return fn(); } finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
  };
  it('the tag carries the role word as its second line; a kit is drawn smaller, the tag keeps its size', () => {
    withDoc(() => {
      const tagBase = attachOwnTag(new THREE.Group(), stateWith(20)).scale.x / OWN_TAG_SCALE;
      const g = new THREE.Group();
      const tag = attachOwnTag(g, stateWith(0));
      expect(tag.userData.sub).toBe(rankWord('kit'));
      expect(g.scale.x).toBeCloseTo(0.8);
      expect(g.userData.role).toBe('kit');
      expect(tag.scale.x * g.scale.x).toBeCloseTo(OWN_TAG_SCALE * tagBase, 5);
      const w = new THREE.Group();
      attachOwnTag(w, stateWith(20));
      expect(w.scale.x).toBe(1);
    });
  });
  it('a leader\'s tag goes on top by id, and the everyday words show the neutral rank', () => {
    withDoc(() => {
      const g = new THREE.Group();
      const tag = attachOwnTag(g, stateWith(99, { born: 0, pick: 'leader', stem: null, seen: 0 }));
      expect(tag.userData.sub).toBe(rankWord('leader'));
      expect(tag.userData.top).toBe(true);
      withOffWords(() => {
        const o = new THREE.Group();
        expect(attachOwnTag(o, stateWith(0)).userData.sub).toBe('kitten');
      });
    });
  });
});
