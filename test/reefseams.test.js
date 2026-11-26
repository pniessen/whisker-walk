// The Reef, milestone R0: the seams. The flag, the `reef` movement row and its neutral multipliers, the read-only floatY placeholder and its
// reader allow-list, the `reef` save key (sanitised and merged), the reserved journal and award ids, the area pack behind ?reef=1, the words.
// Nothing here may move any other place: the identity cases are the point.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import * as THREE from 'three';
import { PLACE_PHYSICS, physicsFor, placeArc, placeBudget, placePace } from '../src/placephysics.js';
import { BASE_POUNCE_ARC } from '../src/player.js';
import { BASE_CLIMB_BUDGET, climbBudget } from '../src/climbing.js';
import { reefOn, setReef } from '../src/reefflag.js';
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
import { GOLD_MICE, GOLD_TOTAL, KNOWN_GOLD } from '../src/goldmice.js';
import { phrase, hasPhrase, PHRASE_IDS, LATER_PHRASE_IDS } from '../src/clanphrases.js';
import { REEF_PAGES, REEF_JOURNAL_TYPES, REEF_PAGE_WORDS } from '../src/reefpages.js';
import { LINES, HINTS } from '../src/world/reefwords.js';
import { createPlayer } from '../src/player.js';
import { createGoals } from '../src/goals.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const fresh = (over = {}) => sanitizeSave({ version: 4, ...over });
const read = (f) => readFileSync(f, 'utf8');
const code = (f) => read(f).replace(/\/\/.*$/gm, ''); // a comment may name floatY; code may not
const files = () => globSync('src/**/*.js').map((f) => f.split('\\').join('/'));

describe('the flag', () => {
  afterEach(() => setReef(null));
  it('is off with no address and follows a forced value; null goes back to the address bar', () => {
    expect(reefOn()).toBe(false);
    setReef(true); expect(reefOn()).toBe(true);
    setReef(false); expect(reefOn()).toBe(false);
    setReef(null); expect(reefOn()).toBe(false);
  });
  it('reads ?reef=1 from the address at call time', () => {
    const was = globalThis.location;
    try {
      globalThis.location = { search: '?reef=1' };
      expect(reefOn()).toBe(true);
      globalThis.location = { search: '?reef=0' };
      expect(reefOn()).toBe(false);
    } finally {
      if (was === undefined) delete globalThis.location; else globalThis.location = was;
    }
  });
});

describe('the movement table', () => {
  it('has the Moon\'s row and the Reef\'s, with the plan\'s numbers and neutral multipliers', () => {
    expect(Object.keys(PLACE_PHYSICS)).toEqual(['moon', 'reef']);
    expect(PLACE_PHYSICS.reef).toEqual({ medium: 'water', pace: 0.7, floatMax: 2.2, rise: 1.2, sink: 0.6, hopHeightMul: 1, hopTimeMul: 1, climbMul: 1, reachMul: 1 });
    expect(Object.isFrozen(PLACE_PHYSICS.reef)).toBe(true);
  });
  it('under the sea the hop, the climb and the reaches are unchanged and only the pace is slower (no NaN)', () => {
    const arc = placeArc(BASE_POUNCE_ARC, 'reef');
    expect(arc).toEqual({ height: BASE_POUNCE_ARC.height, time: BASE_POUNCE_ARC.time });
    expect(placeBudget({}, 'reef')).toEqual(BASE_CLIMB_BUDGET);
    expect(placeBudget({ skills: ['spring-paws'] }, 'reef')).toEqual(climbBudget({ skills: ['spring-paws'] }));
    expect(placePace(3.5, 'reef')).toBeCloseTo(2.45, 6);
  });
  it('a row that leaves a multiplier out reads it as 1 (the helpers default with ??), never NaN', () => {
    const src = read('src/placephysics.js');
    for (const k of ['hopHeightMul', 'hopTimeMul', 'climbMul', 'reachMul']) expect(src, k).toMatch(new RegExp(`\\(p\\.${k} \\?\\? 1\\)`));
  });
  it('every other place still hands its input back by identity', () => {
    for (const place of ['neighborhood', 'seaside', 'greenhouse', 'den', undefined, null, '__proto__', 'constructor']) {
      expect(physicsFor(place), String(place)).toBe(null);
      expect(placeArc(BASE_POUNCE_ARC, place)).toBe(BASE_POUNCE_ARC);
      expect(placeBudget({}, place)).toBe(BASE_CLIMB_BUDGET);
      expect(placePace(3.2, place)).toBe(3.2);
    }
  });
  it('nothing but placephysics.js reads the table (one reading site)', () => {
    for (const f of files().filter((x) => x !== 'src/placephysics.js')) {
      expect(read(f), f).not.toMatch(/\bPLACE_PHYSICS\b/);
      expect(read(f), f).not.toMatch(/\bphysicsFor\b/);
    }
  });
});

describe('floatY, the Reef\'s read-only float height (a placeholder until milestone R1)', () => {
  // Who may name `floatY` in src/: the owner (player.js) and the six readers the plan names. Nothing else (not a collider, not the climb
  // budget, not perchY, not the save). R1 adds the readers it needs, each a line here.
  const ALLOW = new Set([
    'src/player.js', // owns it
    'src/main.js', // pawsY for checkFind (the golden-mouse window) and the found-outfit pick-up
    'src/foundwear/live.js', // found-outfit reach
    'src/game/avatar.js', // the cat's draw
    'src/catcam.js', // the camera's follow
    'src/coop/index.js', // the couch markers
    'src/remotecats.js', // the lift of a partner's cat
  ]);
  it('only the allow-listed files mention it', () => {
    const offenders = files().filter((f) => /\bfloatY\b/.test(code(f)) && !ALLOW.has(f));
    expect(offenders).toEqual([]);
  });
  it('it is never saved and never written to perchY, a collider or the climb budget', () => {
    for (const f of files()) {
      const s = code(f);
      expect(s, f).not.toMatch(/perchY\s*[-+]?=[^=].*floatY/);
      expect(s, f).not.toMatch(/floatY.*\bperchY\s*=[^=]/);
    }
    for (const f of ['src/progression.js', 'src/catmerge.js', 'src/climbing.js', 'src/placephysics.js', 'src/traversal.js', 'src/traversallive.js']) expect(read(f), f).not.toMatch(/\bfloatY\b/);
    expect(Object.keys(fresh())).not.toContain('floatY');
  });
  it('the player has it as a getter, 0 for now, and it cannot be assigned', () => {
    const player = createPlayer(new THREE.PerspectiveCamera(), null, { headless: true });
    expect(player.floatY).toBe(0);
    expect(Object.getOwnPropertyDescriptor(player, 'floatY').set).toBeUndefined();
    expect(player.perchY).toBe(0);
  });
});

describe('the save key', () => {
  it('a fresh save has the default and the walk counter; the key is in the key list; no errand is saved', () => {
    expect(fresh().reef).toEqual({ step: 0, shells: 0, album: 0 });
    expect(Object.keys(fresh().reef)).not.toContain('errand');
    expect(fresh().walks.reef).toBe(0);
    expect(freshStateKeys()).toContain('reef');
    expect(fresh().version).toBe(4);
  });
  it('a good value round trips', () => {
    const reef = { step: 7, shells: 7, album: 2730 };
    expect(fresh({ reef }).reef).toEqual(reef);
  });
  it('the shells are derived from the step: a later step never has an earlier shell missing', () => {
    expect(fresh({ reef: { step: 2, shells: 0 } }).reef.shells).toBe(1);
    expect(fresh({ reef: { step: 3, shells: 0 } }).reef.shells).toBe(3);
    expect(fresh({ reef: { step: 4, shells: 0 } }).reef.shells).toBe(7);
    expect(fresh({ reef: { step: 1, shells: 4 } }).reef.shells).toBe(4); // a shell picked up early is kept
  });
  it('a hostile value is cut back, never trusted', () => {
    expect(fresh({ reef: { step: 99, shells: 255, album: 99999 } }).reef).toEqual({ step: 7, shells: 7, album: 4095 });
    for (const junk of [null, 5, 'reef', [], [1, 2], { step: 'x', shells: NaN, album: Infinity, errand: 3 }, { step: -3, shells: -1, album: -9 }]) {
      expect(fresh({ reef: junk }).reef, JSON.stringify(junk)).toEqual({ step: 0, shells: 0, album: 0 });
    }
  });
  it('the key goes through the real save and load, and a v3 payload gets the default', () => {
    const storage = memoryStorage();
    const p = createProgression(storage);
    p.replaceFromPayload({ version: 4, reef: { step: 4, shells: 3, album: 5 } });
    expect(p.state.reef).toEqual({ step: 4, shells: 7, album: 5 });
    expect(JSON.parse(storage.getItem(SAVE_KEY)).reef.step).toBe(4);
    expect(createProgression(storage).state.reef).toEqual(p.state.reef);
    p.replaceFromPayload({ version: 3 });
    expect(p.state.reef).toEqual({ step: 0, shells: 0, album: 0 });
  });
});

describe('merging two devices', () => {
  const m = (reef) => ({ reef });
  const merge = (local, cloud) => mergeSaves({ local: fresh(local), cloud: fresh(cloud) }).save.reef;
  it('has a rule, and the base keeps the key', () => {
    expect(Object.hasOwn(MERGE_RULES, 'reef')).toBe(true);
    expect(trimBase(fresh({ reef: { step: 3 } })).reef.step).toBe(3);
  });
  it('the story only moves on: step is the larger, shells and the album are unions of bits', () => {
    expect(merge(m({ step: 3, shells: 1, album: 5 }), m({ step: 5, shells: 2, album: 10 }))).toMatchObject({ step: 5, shells: 7, album: 15 });
    expect(merge(m({ step: 5 }), m({ step: 3 }))).toMatchObject({ step: 5 });
    expect(merge(m({ step: 1, shells: 4 }), m({ step: 1, shells: 1 }))).toMatchObject({ step: 1, shells: 5 });
  });
  it('a hostile cloud payload cannot lift the step past 7, the shells past 3 bits or the album past 12', () => {
    for (const hostile of [{ version: 4, reef: { step: 400, shells: 1e9, album: -1 } }, { version: 4, reef: { step: 'x', shells: 255, album: 1e12 } }, { version: 4, reef: [9, 9, 9] }]) {
      const r = mergeSaves({ local: fresh(m({ step: 2, album: 3 })), cloud: hostile }).save.reef;
      expect(r.step).toBeLessThanOrEqual(7);
      expect(r.shells).toBeLessThanOrEqual(7);
      expect(r.album).toBeLessThanOrEqual(4095);
      expect(Object.keys(r).sort()).toEqual(['album', 'shells', 'step']);
    }
  });
  it('merging a save with itself changes nothing and the merge is stable', () => {
    const a = fresh(m({ step: 6, shells: 7, album: 99 }));
    const r = mergeSaves({ local: a, cloud: a });
    expect(r.save.reef).toEqual(a.reef);
    expect(r.changed).toEqual({ local: false, cloud: false });
    expect(mergeSaves({ local: r.save, cloud: a }).save.reef).toEqual(r.save.reef);
  });
});

describe('the reserved ids', () => {
  it('twelve journal ids, in the start-up whitelist, with a name each', () => {
    expect(REEF_JOURNAL_TYPES).toEqual(['rfboat', 'rfoyster', 'rfseahorse', 'rfcave', 'rfchest', 'rfanchor', 'rfshells', 'rflanterns', 'rfparade', 'rfalbum', 'rferrand', 'rfrings']);
    for (const id of REEF_JOURNAL_TYPES) { expect(JOURNAL_TYPES).toContain(id); expect(REEF_PAGE_WORDS[id].name()).toMatch(/\S/); }
    expect(new Set(JOURNAL_TYPES).size).toBe(JOURNAL_TYPES.length);
    expect(JOURNAL_TYPES.slice(-12)).toEqual(REEF_JOURNAL_TYPES);
  });
  it('a journal page counts like any other (the sanitiser keeps it)', () => {
    expect(fresh({ journal: { rfparade: 2, rfnope: 4 } }).journal).toEqual({ rfparade: 2 });
  });
  it('the three awards have the owner\'s numbers', () => {
    expect([AWARDS.reeffind, AWARDS.reefstory, AWARDS.reefjob]).toEqual([12, 40, 25]);
  });
  it('couch play is not ready under the sea', () => { expect(COOP_READY.reef).toBe(false); });
  it('the Reef is in no catalog (no card, no price, no map place, no gate)', () => {
    expect(Object.hasOwn(CATALOG.areas, 'reef')).toBe(false);
  });
});

describe('the golden mice', () => {
  it('three stub mice, two at float height, and the totals are 57 and 33', () => {
    expect(GOLD_MICE.reef.map((x) => x.id)).toEqual(['gm-reef-1', 'gm-reef-2', 'gm-reef-3']);
    expect(GOLD_MICE.reef.filter((x) => x.y >= 1.9).length).toBe(2);
    expect(GOLD_TOTAL).toBe(57);
    for (const mouse of GOLD_MICE.reef) expect(KNOWN_GOLD.has(mouse.id)).toBe(true);
  });
});

describe('the pack', () => {
  it('is registered with a loader and an entry module', () => {
    expect(typeof AREA_LOADERS.reef).toBe('function');
    expect(AREA_ENTRY_MODULES.reef).toEqual(['src/world/reef.js']);
  });
  it('builds the water world (R1): 96 x 84, a clear spawn inside the bounds, no water, no strays, no weather, only goals she can finish (the world itself is test/reefworld.test.js)', async () => {
    const { build, REEF_BOUNDS, REEF_SPAWN } = await import('../src/world/reef.js');
    const scene = new THREE.Scene();
    const area = build(scene);
    expect(area.bounds).toEqual(REEF_BOUNDS);
    expect(REEF_BOUNDS.maxX - REEF_BOUNDS.minX).toBe(96);
    expect(REEF_BOUNDS.maxZ - REEF_BOUNDS.minZ).toBe(84);
    expect(REEF_SPAWN.x).toBeGreaterThan(REEF_BOUNDS.minX); expect(REEF_SPAWN.x).toBeLessThan(REEF_BOUNDS.maxX);
    expect(REEF_SPAWN.z).toBeGreaterThan(REEF_BOUNDS.minZ); expect(REEF_SPAWN.z).toBeLessThan(REEF_BOUNDS.maxZ);
    expect(area.spawn).toEqual(REEF_SPAWN);
    expect(area.waters).toEqual([]);
    for (const c of area.colliders) expect(Math.hypot(c.x - REEF_SPAWN.x, c.z - REEF_SPAWN.z)).toBeGreaterThan(c.r + 1.5);
    expect(area.evening).toBe(true); // the walk's switch for "no weather"
    expect(area.strays).toBe(false); // ...and for no strays, ghosts, wanderer, rival or clan cats
    expect(area.collectibles).toHaveLength(8); // milestone R3 (test/reeffinds.test.js)
    expect(area.scenics).toHaveLength(3);
    for (const key of ['perches', 'tippables', 'boxes', 'critterSpawns', 'moments', 'puddles']) expect(area[key], key).toEqual([]);
    let meshes = 0; scene.traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes).toBeLessThanOrEqual(7); // R1's five, plus R3's finds marker mesh and bubble-column mesh (two merged meshes)
    const goals = createGoals(() => 0.5, area).goals;
    expect(goals).toHaveLength(3);
    for (const g of goals) expect(area.goalTypes).toContain(g.type);
  });
  it('the Reef\'s files import no other place (the chunk stays small); the dive suit is the shared lazy kit', () => {
    const src = read('src/world/reef.js');
    const imports = [...src.matchAll(/^import .*?from '(.+?)';/gm)].map((x) => x[1]);
    expect(imports.sort()).toEqual(['../cat/suitkit.js', './builder.js', './localuuids.js', './reefparts.js', './reefplan.js', './reeflife.js', './reeffinds.js', './reeffindparts.js', './reeffindsplan.js'].sort());
    expect(src).toMatch(/import '\.\/reefwords\.js'/);
    for (const f of globSync('src/world/reef*.js')) {
      for (const [, spec] of read(f).matchAll(/^import .*?from '(.+?)';/gm)) expect(spec, `${f} imports ${spec}`).not.toMatch(/(moon|greenhouse|seaside|park|docks)/);
    }
  });
});

describe('the words', () => {
  const IDS = Object.keys(LINES);
  it('every lazy line is in the table once the file is loaded, none is in the start-up tables, and none is empty', () => {
    expect(IDS.length).toBeGreaterThan(0);
    for (const id of IDS) {
      expect(hasPhrase(id), id).toBe(true);
      expect(PHRASE_IDS.includes(id) || LATER_PHRASE_IDS.includes(id), `${id} is in the start-up download`).toBe(false);
      expect(phrase(id), id).toMatch(/\S/);
    }
  });
  it('the twelve page names are start-up strings and the twelve hints are lazy lines', () => {
    expect(REEF_PAGES).toHaveLength(12);
    expect(Object.keys(HINTS)).toEqual(REEF_JOURNAL_TYPES);
    for (const id of REEF_JOURNAL_TYPES) expect(REEF_PAGE_WORDS[id].hint()).toBe(HINTS[id]);
  });
  it('the everyday set never shows a series word, and no line scolds or scares; every line is short', () => {
    withOffWords(() => {
      for (const id of IDS) expect(bannedIn(phrase(id)), id).toBeNull();
      for (const [, , k, name] of REEF_PAGES) expect(bannedIn(name), k).toBeNull();
      for (const h of Object.values(HINTS)) expect(bannedIn(h)).toBeNull();
    });
    const scary = /\b(drown\w*|die|dies|dead|hurt|panic\w*|gasp\w*|choke\w*|scared|scary|afraid|danger\w*)\b/i;
    for (const id of IDS) {
      expect(phrase(id).length, id).toBeLessThanOrEqual(90);
      expect(phrase(id), id).not.toMatch(scary);
    }
    for (const h of Object.values(HINTS)) { expect(h.length).toBeLessThanOrEqual(90); expect(h).not.toMatch(scary); }
    for (const [, , , name] of REEF_PAGES) expect(name).not.toMatch(scary);
  });
});
