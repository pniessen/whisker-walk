// The Moon, milestone 0: the seams. The flag, the one `moon` movement row and its single reading site, the `moon`
// save key (sanitised and merged), the reserved journal and award ids, the area pack behind ?moon=1, the words.
// Nothing here may move any other place: the identity cases are the point.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import * as THREE from 'three';
import { PLACE_PHYSICS, physicsFor, placeArc, placeBudget, placePace } from '../src/placephysics.js';
import { BASE_POUNCE_ARC, FLAT_POUNCE_ARC, hopOffset } from '../src/player.js';
import { BASE_CLIMB_BUDGET, climbBudget, canReach } from '../src/climbing.js';
import { moonOn, setMoon } from '../src/moonflag.js';
import { createProgression, sanitizeSave, JOURNAL_TYPES, freshStateKeys, CATALOG, SAVE_KEY } from '../src/progression.js';
import { mergeSaves, MERGE_RULES, trimBase, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { AWARDS } from '../src/discoveries.js';
import { COOP_READY } from '../src/coop/table.js';
import { AREA_LOADERS, AREA_ENTRY_MODULES } from '../src/world/areas.js';
import { phrase, hasPhrase, PHRASE_IDS, LATER_PHRASE_IDS } from '../src/clanphrases.js';
import { MOON_PAGES, MOON_JOURNAL_TYPES, MOON_PAGE_WORDS } from '../src/moonpages.js';
import { LINES, HINTS } from '../src/world/moonwords.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { createInteractions } from '../src/game/interactions.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { memoryStorage } from './helpers/storage.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const fresh = (over = {}) => sanitizeSave({ version: 4, ...over });
const read = (f) => readFileSync(f, 'utf8');

describe('the flag', () => {
  afterEach(() => setMoon(null));
  it('is off with no address and follows a forced value; null goes back to the address bar', () => {
    expect(moonOn()).toBe(false);
    setMoon(true); expect(moonOn()).toBe(true);
    setMoon(false); expect(moonOn()).toBe(false);
    setMoon(null); expect(moonOn()).toBe(false);
  });
  it('reads ?moon=1 from the address at call time', () => {
    const was = globalThis.location;
    try {
      globalThis.location = { search: '?moon=1' };
      expect(moonOn()).toBe(true);
      globalThis.location = { search: '?moon=0' };
      expect(moonOn()).toBe(false);
    } finally {
      if (was === undefined) delete globalThis.location; else globalThis.location = was;
    }
  });
});

describe('the movement table', () => {
  it('has exactly the Moon\'s row, with the spec\'s numbers', () => {
    expect(Object.keys(PLACE_PHYSICS)).toEqual(['moon']);
    expect(PLACE_PHYSICS.moon).toEqual({ medium: 'vacuum', pace: 0.9, hopHeightMul: 4, hopTimeMul: 3.6, climbMul: 2, reachMul: 1.5, skip: 0.1 });
    expect(Object.isFrozen(PLACE_PHYSICS)).toBe(true);
    expect(Object.isFrozen(PLACE_PHYSICS.moon)).toBe(true);
  });
  it('a place with no row (every other place, or nonsense) is null and every helper hands its input back by identity', () => {
    for (const place of ['neighborhood', 'park', 'seaside', 'docks', 'roofs', 'lighthouse', 'greenhouse', 'den', undefined, null, 7, '__proto__', 'constructor', 'toString']) {
      expect(physicsFor(place), String(place)).toBe(null);
      expect(placeArc(BASE_POUNCE_ARC, place)).toBe(BASE_POUNCE_ARC);
      expect(placeBudget({}, place)).toBe(BASE_CLIMB_BUDGET);
      expect(placePace(3.2, place)).toBe(3.2);
    }
    expect(placeBudget({ skills: ['spring-paws'] }, 'park')).toEqual(climbBudget({ skills: ['spring-paws'] }));
  });
  it('on the Moon a hop is 1.4 m high and hangs 1.08 s (Spring Paws 3.6 m), the climb is doubled and the reaches grow by half', () => {
    const arc = placeArc(BASE_POUNCE_ARC, 'moon');
    expect(arc.height).toBeCloseTo(1.4, 6);
    expect(arc.time).toBeCloseTo(1.08, 6);
    expect(hopOffset(arc.time / 2, arc)).toBeCloseTo(1.4, 6); // the top of the arc
    expect(hopOffset(arc.time, arc)).toBe(0); // lands exactly at the pose window's end
    const flat = placeArc(FLAT_POUNCE_ARC, 'moon');
    expect(flat.height).toBe(0); // reduced motion stays flat, on the same clock
    expect(flat.time).toBeCloseTo(1.08, 6);
    const b = placeBudget({}, 'moon');
    expect(b.climb).toBeCloseTo(3.2, 6);
    expect(b.reachHigh).toBeCloseTo(3.9, 6);
    expect(b.reachLow).toBeCloseTo(1.8, 6);
    expect(placeBudget({ skills: ['spring-paws'] }, 'moon').climb).toBeCloseTo(4.4, 6);
    expect(placePace(3.5, 'moon')).toBeCloseTo(3.15, 6);
  });
  it('a 3.0 m ledge is in reach on the Moon\'s budget and out of reach on Earth\'s', () => {
    const ledge = { x: 0, z: 0, y: 3.0, label: 'ledge', vantage: true };
    const cat = { x: 0, z: 0 };
    expect(canReach(ledge, cat, 0, BASE_CLIMB_BUDGET)).toBe(false);
    expect(canReach(ledge, cat, 0, placeBudget({}, 'moon'))).toBe(true);
  });
  it('nothing but placephysics.js reads the table (one reading site)', () => {
    const files = globSync('src/**/*.js').map((f) => f.split('\\').join('/')).filter((f) => f !== 'src/placephysics.js');
    for (const f of files) expect(read(f), f).not.toMatch(/\bPLACE_PHYSICS\b/);
    for (const f of files) expect(read(f), f).not.toMatch(/\bphysicsFor\b/);
  });
});

describe('the pounce, as the game presses it', () => {
  function pounceHarness(areaId) {
    const progression = { state: { skills: [], feats: {} }, recordFeat() {}, addPoints() {} };
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const session = { areaId, areaData: { perches: [] }, cat: { position: new THREE.Vector3() }, perched: null, pounceCooldown: 0, pounceTime: 0, fx: { burst() {} } };
    let arc = null;
    const player = { perchY: 0, halt() {}, pounce(a) { arc = a; } };
    const { doPounceOrClimb } = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null, getSession: () => session, getIsTouch: () => false,
      player, progression, log, hud: { toast() {} }, audio: { trill() {}, pounceWhoosh() {} },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    return { session, doPounceOrClimb, arc: () => arc };
  }
  it('every other place keeps the 0.3 s pose window and the 0.35 m arc, exactly', () => {
    for (const area of ['neighborhood', 'park', 'roofs', undefined]) {
      const h = pounceHarness(area);
      h.doPounceOrClimb();
      expect(h.session.pounceTime, String(area)).toBe(0.3);
      expect(h.arc()).toBe(BASE_POUNCE_ARC);
    }
  });
  it('on the Moon the pose window, the landing thump and the arc share one 1.08 s clock', () => {
    const h = pounceHarness('moon');
    h.doPounceOrClimb();
    expect(h.session.pounceTime).toBeCloseTo(1.08, 6);
    expect(h.arc().time).toBe(h.session.pounceTime);
    expect(h.arc().height).toBeCloseTo(1.4, 6);
  });
});

describe('the save key', () => {
  it('a fresh save has the default and the walk counter; the key is in the key list', () => {
    expect(fresh().moon).toEqual({ step: 0, cells: 0, stamp: -1, scope: 0, jump: {} });
    expect(fresh().walks.moon).toBe(0);
    expect(freshStateKeys()).toContain('moon');
    expect(fresh().version).toBe(4);
  });
  it('a good value round trips', () => {
    const moon = { step: 7, cells: 5, stamp: 2, scope: 21, jump: { tabby: 312, mine1: 40 } };
    expect(fresh({ moon }).moon).toEqual(moon);
  });
  it('a hostile value is cut back, never trusted', () => {
    const bad = {
      step: 99, cells: 255, stamp: 5, scope: 9999,
      jump: { tabby: 99999, '__proto__': 5, 'a b': 3, UPPER: 4, x: 1, c1: -4, c2: 'far', c3: 7, c4: 8, c5: 9, c6: 10, c7: 11 },
    };
    const m = fresh({ moon: bad }).moon;
    expect(m.step).toBe(9);
    expect(m.cells).toBe(7);
    expect(m.stamp).toBe(-1);
    expect(m.scope).toBe(31);
    expect(Object.keys(m.jump).length).toBeLessThanOrEqual(6);
    for (const [id, cm] of Object.entries(m.jump)) { expect(id).toMatch(/^[a-z][a-z0-9]{1,15}$/); expect(cm).toBeGreaterThanOrEqual(0); expect(cm).toBeLessThanOrEqual(2000); }
    expect(m.jump.tabby).toBe(2000);
    expect(Object.getPrototypeOf(m.jump)).toBe(Object.prototype);
    expect(({}).polluted).toBeUndefined();
    for (const junk of [null, 5, 'moon', [], [1, 2], { step: 'x', cells: NaN, stamp: '1', scope: Infinity, jump: [3] }]) {
      expect(fresh({ moon: junk }).moon, JSON.stringify(junk)).toEqual({ step: 0, cells: 0, stamp: -1, scope: 0, jump: {} });
    }
  });
  it('the key goes through the real save and load, and a v3 payload gets the default', () => {
    const storage = memoryStorage();
    const p = createProgression(storage);
    p.replaceFromPayload({ version: 4, moon: { step: 4, cells: 2, stamp: 1, scope: 3, jump: { tabby: 250 } } });
    expect(p.state.moon).toEqual({ step: 4, cells: 2, stamp: 1, scope: 3, jump: { tabby: 250 } });
    const stored = JSON.parse(storage.getItem(SAVE_KEY));
    expect(stored.moon.step).toBe(4);
    expect(stored.version).toBe(4);
    expect(createProgression(storage).state.moon).toEqual(p.state.moon);
    p.replaceFromPayload({ version: 3 });
    expect(p.state.moon).toEqual({ step: 0, cells: 0, stamp: -1, scope: 0, jump: {} });
  });
});

describe('merging two devices', () => {
  const m = (moon) => ({ moon });
  const merge = (local, cloud, extra = {}) => mergeSaves({ local: fresh(local), cloud: fresh(cloud), ...extra }).save.moon;
  it('has a rule, and the base keeps the key', () => {
    expect(Object.hasOwn(MERGE_RULES, 'moon')).toBe(true);
    expect(trimBase(fresh({ moon: { step: 3 } })).moon.step).toBe(3);
  });
  it('the story only moves on: step is the larger, cells and star pictures are unions of bits', () => {
    expect(merge(m({ step: 3, cells: 1, scope: 5 }), m({ step: 5, cells: 2, scope: 10 }))).toMatchObject({ step: 5, cells: 3, scope: 15 });
    expect(merge(m({ step: 5 }), m({ step: 3 }))).toMatchObject({ step: 5 });
  });
  it('each cat\'s best jump is the longer one, and a cat on one side only is kept', () => {
    const r = merge(m({ jump: { tabby: 300, mine1: 80 } }), m({ jump: { tabby: 410, siamese: 50 } }));
    expect(r.jump).toEqual({ tabby: 410, mine1: 80, siamese: 50 });
  });
  it('a stamp that is set beats none, either way round', () => {
    expect(merge(m({ stamp: 1 }), m({}))).toMatchObject({ stamp: 1 });
    expect(merge(m({}), m({ stamp: 2 }))).toMatchObject({ stamp: 2 });
    expect(merge(m({ stamp: 1 }), m({ stamp: 1 }))).toMatchObject({ stamp: 1 });
  });
  it('two different stamps go to the side saved later, or the side that changed it when there is a base', () => {
    expect(merge(m({ stamp: 0 }), m({ stamp: 2 }), { localAt: 5, cloudAt: 9 }).stamp).toBe(2);
    expect(merge(m({ stamp: 0 }), m({ stamp: 2 }), { localAt: 9, cloudAt: 5 }).stamp).toBe(0);
    // the cloud still has the stamp both agreed on (0): this device changed it to 1, so 1 wins even though the cloud was saved later
    expect(merge(m({ stamp: 1 }), m({ stamp: 0 }), { base: { moon: { stamp: 0 } }, localAt: 1, cloudAt: 99 }).stamp).toBe(1);
  });
  it('a hostile cloud payload cannot lift the step past 9 or a jump past 2000 cm, nor add a seventh cat', () => {
    const hostile = { version: 4, moon: { step: 400, cells: 1e9, scope: -1, stamp: 'x', jump: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`cat${i}`, 1e6])) } };
    const r = mergeSaves({ local: fresh(m({ step: 2, jump: { tabby: 100 } })), cloud: hostile }).save.moon;
    expect(r.step).toBe(9);
    expect(r.cells).toBeLessThanOrEqual(7);
    expect(r.scope).toBeLessThanOrEqual(31);
    expect(Object.keys(r.jump).length).toBeLessThanOrEqual(6);
    for (const cm of Object.values(r.jump)) expect(cm).toBeLessThanOrEqual(2000);
  });
  it('merging a save with itself changes nothing and the merge is stable', () => {
    const a = fresh(m({ step: 6, cells: 3, stamp: 1, scope: 7, jump: { tabby: 120 } }));
    const r = mergeSaves({ local: a, cloud: a });
    expect(r.save.moon).toEqual(a.moon);
    expect(r.changed).toEqual({ local: false, cloud: false });
    const again = mergeSaves({ local: r.save, cloud: a });
    expect(again.save.moon).toEqual(r.save.moon);
  });
});

describe('the reserved ids', () => {
  it('twelve journal ids, in the start-up whitelist, with a name each', () => {
    expect(MOON_JOURNAL_TYPES).toEqual(['mnflag', 'mnecho', 'mndust', 'mncheese', 'mndish', 'mngarden', 'mnstory', 'mnrover', 'mnlaunch', 'mnscope', 'mnjump', 'mnjob']);
    for (const id of MOON_JOURNAL_TYPES) { expect(JOURNAL_TYPES).toContain(id); expect(MOON_PAGE_WORDS[id].name()).toMatch(/\S/); }
    expect(new Set(JOURNAL_TYPES).size).toBe(JOURNAL_TYPES.length);
  });
  it('a journal page counts like any other (the sanitiser keeps it)', () => {
    expect(fresh({ journal: { mnstory: 2, mnnope: 4 } }).journal).toEqual({ mnstory: 2 });
  });
  it('the three awards have the owner\'s numbers', () => {
    expect([AWARDS.moonfind, AWARDS.moonjob, AWARDS.moonstory]).toEqual([12, 25, 40]);
  });
  it('couch play is not ready on the Moon', () => { expect(COOP_READY.moon).toBe(false); });
  it('the Moon is in no catalog (no card, no price, no map place) and its three golden mice are in (54 in all, 30 for the everyday edition)', async () => {
    expect(Object.hasOwn(CATALOG.areas, 'moon')).toBe(false);
    const { GOLD_TOTAL, GOLD_MICE } = await import('../src/goldmice.js');
    expect(GOLD_TOTAL).toBe(54); // milestone 4's three mice (48 before)
    expect(GOLD_MICE.moon.map((m) => m.id)).toEqual(['gm-moon-1', 'gm-moon-2', 'gm-moon-3']);
  });
});

describe('the pack', () => {
  it('is registered with a loader and an entry module', () => {
    expect(typeof AREA_LOADERS.moon).toBe('function');
    expect(AREA_ENTRY_MODULES.moon).toEqual(['src/world/moon.js']);
  });
  it('builds a place: bounds, a clear spawn inside them, no water, the evening look (milestone 1 draws it: test/moonplace.test.js)', async () => {
    const { build, MOON_BOUNDS, MOON_SPAWN } = await import('../src/world/moon.js');
    const scene = new THREE.Scene();
    const area = build(scene);
    expect(area.bounds).toEqual(MOON_BOUNDS);
    expect(MOON_BOUNDS.maxX - MOON_BOUNDS.minX).toBe(108);
    expect(MOON_BOUNDS.maxZ - MOON_BOUNDS.minZ).toBe(100);
    expect(MOON_SPAWN.x).toBeGreaterThan(MOON_BOUNDS.minX); expect(MOON_SPAWN.x).toBeLessThan(MOON_BOUNDS.maxX);
    expect(MOON_SPAWN.z).toBeGreaterThan(MOON_BOUNDS.minZ); expect(MOON_SPAWN.z).toBeLessThan(MOON_BOUNDS.maxZ);
    expect(area.spawn).toEqual(MOON_SPAWN);
    expect(area.waters).toEqual([]);
    expect(area.evening).toBe(true);
    for (const key of ['scenics', 'tippables', 'boxes', 'critterSpawns', 'moments', 'puddles']) expect(area[key], key).toEqual([]);
  });
  it('the Moon\'s files import no other place (the chunk stays its own); the walk reaches it only through the pack', () => {
    const src = read('src/world/moon.js');
    const imports = [...src.matchAll(/^import .*?from '(.+?)';/gm)].map((m) => m[1]);
    for (const i of imports) expect(i, i).toMatch(/^(three|\.\/(builder|localuuids|moon[a-z]*)\.js|\.\.\/cat\/suitkit\.js)$/);
    expect(src).toMatch(/import '\.\/moonwords\.js'/);
  });
});

describe('the words', () => {
  const IDS = Object.keys(LINES);
  it('every lazy line is in the table once the file is loaded, none is in the start-up tables, and none is empty', () => {
    expect(IDS.length).toBe(180); // (merged with the arrival fix's next-step line and the Ridge clarity paw-button line: +2 on the scope pass's 178) the scope usability pass adds 30 (the objective line's six, the hint-star wrong-star line, the four Earth lines, hello, the buttons' words, the zoom names, the first card's four, the found card's seven, the two replay prompts); the guide cues add 36 (the goal line's 28 stage lines, the three places by the lander and the five short lists of words beside Pip's picture); the TV and pad pass adds three (the pad lines of the telescope, the stamp picker and the binoculars); the spec's 15 samples, milestone 2's 17 (Pip, the cells, the Core, the board, the first three finds), milestone 3's five, milestone 4's four (the other three finds, the pebble) and milestone 5's sixteen (the telescope, the star pictures, the Star Table) and milestone 6's eighteen (the Message Desk, the postcard, the rocket, the launch, the reply, the binoculars, the four goal lines) and milestone 7a's three (the hop board's hint, "New record!", "Every beam is lit!") and milestone 7b's two (the ring gates' hint, "Every ring is lit!") and milestone 8's five (the cave hint, the Deep Cell's pick-up line, the bloom, Earth's finale, the board's cave line) and milestone 9's twenty-four (the five new errand lines, the tray's two, the glove's three, the postcard's pay and the full album, the twelve guest star pictures)
    for (const id of IDS) {
      expect(hasPhrase(id), id).toBe(true);
      expect(PHRASE_IDS.includes(id) || LATER_PHRASE_IDS.includes(id), `${id} is in the start-up download`).toBe(false);
      expect(phrase(id), id).toMatch(/\S/);
    }
  });
  it('the twelve page names are start-up strings (no phrase ids) and the twelve hints are lazy lines', () => {
    for (const [, , k, name] of MOON_PAGES) {
      expect(name).toMatch(/\S/);
      expect(hasPhrase(`moon.page.${k}.name`)).toBe(false);
    }
    expect(Object.keys(HINTS)).toEqual(MOON_JOURNAL_TYPES);
    expect(MOON_PAGES).toHaveLength(12);
  });
  it('the spec\'s sample ids are all here, and read the same in both sets but the lines the Clan set flavours (milestone 2; the Milky Way line, milestone 5)', () => {
    const spec = ['moon.arrive', 'moon.pip.wake', 'moon.pip.goal', 'moon.core.on', 'moon.earth', 'moon.scope.milky', 'moon.scope.hmm', 'moon.stamp.ask', 'moon.count.go', 'moon.reply', 'moon.badge', 'moon.cape', 'moon.job.glove', 'moon.rover.in', 'moon.home'];
    for (const id of spec) expect(Object.hasOwn(LINES, id), id).toBe(true);
    const clan = Object.fromEntries(IDS.map((id) => [id, phrase(id)]));
    let everyday;
    withOffWords(() => { everyday = Object.fromEntries(IDS.map((id) => [id, phrase(id)])); });
    const flavoured = ['moon.arrive', 'moon.earth', 'moon.scope.milky', 'moon.guide.done']; // Silverpelt: the Clan set only
    expect(clan['moon.earth']).toMatch(/Silverpelt/);
    expect(clan['moon.scope.milky']).toMatch(/Silverpelt/);
    expect(everyday['moon.scope.milky']).not.toMatch(/Silverpelt/);
    expect(everyday['moon.earth']).not.toMatch(/Silverpelt/);
    for (const id of flavoured) delete clan[id], delete everyday[id];
    expect(everyday).toEqual(clan);
  });
  it('the everyday set never shows a series word, and no line scolds or scares; every line is short', () => {
    withOffWords(() => {
      for (const id of IDS) expect(bannedIn(phrase(id)), id).toBeNull();
      for (const [, , k, name] of MOON_PAGES) expect(bannedIn(name), k).toBeNull();
    });
    for (const id of IDS) {
      expect(phrase(id).length, id).toBeLessThanOrEqual(90);
      expect(phrase(id), id).not.toMatch(/\b(drown|die|dead|scared|scary|dark|hurt|danger|afraid|lost forever|too late|hurry)\b/i);
    }
  });
  it('a page\'s hint is the lazy line once it has arrived (and the hints are short, plain and in both sets alike)', () => {
    for (const h of Object.values(HINTS)) { expect(h.length).toBeLessThanOrEqual(90); expect(bannedIn(h)).toBeNull(); }
    for (const id of MOON_JOURNAL_TYPES) expect(MOON_PAGE_WORDS[id].hint()).toBe(HINTS[id]);
  });
});
