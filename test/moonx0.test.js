// The Moon, wave 2, milestone X0 (the seams) (docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md): the save key `relay`, the five reserved journal ids, the relay tower's gold stub that
// the beauty scatter must not see, the signal tag prize, the prompt arbiter's source order, the `relay-` partner events, the rock clears hook and the empty station stage.
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

const { sanitizeSave, JOURNAL_TYPES, CATALOG, moonRelay } = await import('../src/progression.js');
const { mergeSaves, useSaveTools } = await import('../src/catmerge.js');
const { mergeColony } = await import('../src/colony.js');
const { mergeUsage } = await import('../src/usage.js');
const { sanitizeMarks, MARK_AREAS } = await import('../src/marks.js');
const { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } = await import('../src/customcats.js');
const { OUTFIT_IDS, sameWear } = await import('../src/outfits.js');
useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const { phrase } = await import('../src/clanphrases.js');
const { MOON_WING_PAGES, MOON_PAGE_WORDS, MOON_HINTS, WING_LIVE, wingPageShown } = await import('../src/moonpages.js');
const { GOLD_MICE, KNOWN_GOLD, goldForEdition } = await import('../src/goldmice.js');
const P = await import('../src/world/moonplan.js');
const B = await import('../src/world/moonbeautyplan.js');
const MP = await import('../src/world/moonparts.js');
const { ST } = await import('../src/world/moonstages.js');
const { build } = await import('../src/world/moon.js');

const fresh = (o = {}) => sanitizeSave({ version: 4, ...o });
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

describe('the save key', () => {
  it('relay is in the default and round trips; the other moon keys are as they were', () => {
    expect(fresh().moon).toEqual({ step: 0, cells: 0, stamp: -1, scope: 0, jump: {}, relay: 0 });
    expect(fresh({ moon: { step: 9, cells: 7, stamp: 1, scope: 5, jump: {}, relay: 5 } }).moon).toEqual({ step: 9, cells: 7, stamp: 1, scope: 5, jump: {}, relay: 5 });
  });
  it('moonRelay: bit 4 implies 31, bit 3 implies 15, bits 0-2 stay', () => {
    expect([0, 1, 5, 7, 8, 9, 15, 16, 17, 31].map(moonRelay)).toEqual([0, 1, 5, 7, 15, 15, 15, 31, 31, 31]);
    expect(fresh({ moon: { relay: 8 } }).moon.relay).toBe(15);
    expect(fresh({ moon: { relay: 16 } }).moon.relay).toBe(31);
    expect(fresh({ moon: { relay: 2 } }).moon.relay).toBe(2);
  });
  it('hostile values are cut to 0..31 integers', () => {
    for (const junk of [1e12, -5, NaN, 'x', null, Infinity, [9], {}, undefined, 2.5]) {
      const r = fresh({ moon: { relay: junk } }).moon.relay;
      expect(Number.isInteger(r) && r >= 0 && r <= 31, String(junk)).toBe(true);
      expect(r, String(junk)).toBe(moonRelay(r));
    }
    expect(fresh({ moon: [9, 9] }).moon).toEqual({ step: 0, cells: 0, stamp: -1, scope: 0, jump: {}, relay: 0 });
  });
  it('a hostile merge keeps the keys, ORs the bits, and fills what a bit implies', () => {
    const a = fresh({ moon: { step: 3, relay: 1 } });
    expect(mergeSaves({ local: a, cloud: { version: 4, moon: { relay: 8 } } }).save.moon.relay).toBe(15);
    expect(mergeSaves({ local: a, cloud: { version: 4, moon: { relay: 6 } } }).save.moon.relay).toBe(7);
    expect(mergeSaves({ local: a, cloud: { version: 4, moon: { relay: 16 } } }).save.moon.relay).toBe(31);
    for (const hostile of [{ version: 4, moon: { relay: 1e9 } }, { version: 4, moon: { relay: -1 } }, { version: 4, moon: [9, 9] }, { version: 4, moon: { relay: Infinity } }, { version: 4, moon: { relay: 'x' } }]) {
      const r = mergeSaves({ local: a, cloud: hostile }).save.moon;
      expect(r.relay).toBeLessThanOrEqual(31);
      expect(r.relay & 1).toBe(1); // the local bit is never lost
      expect(Object.keys(r).sort()).toEqual(['cells', 'jump', 'relay', 'scope', 'stamp', 'step']);
    }
  });
});

describe('the journal ids', () => {
  const IDS = ['mnstation', 'mnsignal', 'mnrelay', 'mnsled', 'mnlap'];
  it('five ids at the very end of JOURNAL_TYPES, with names, hidden until their wing is live', () => {
    expect(MOON_WING_PAGES.map((p) => p[0])).toEqual(IDS);
    expect(JOURNAL_TYPES.slice(-5)).toEqual(IDS);
    expect(JOURNAL_TYPES.indexOf('ccsong')).toBe(JOURNAL_TYPES.length - 6); // the Crystal Cave's six come first
    expect(new Set(JOURNAL_TYPES).size).toBe(JOURNAL_TYPES.length);
    for (const id of IDS) { expect(MOON_PAGE_WORDS[id].name()).toMatch(/\S/); expect(wingPageShown(id), id).toBe(!!WING_LIVE[id]); }
    expect(wingPageShown('mnstory')).toBe(true);
  });
  it('the lazy words fill the hints in both word sets with no banned or series word', async () => {
    const { HINTS, MOON_STATION_LINES } = await import('../src/world/moonstationwords.js');
    for (const id of IDS) { expect(MOON_HINTS[id]).toBe(HINTS[id]); expect(HINTS[id]).toMatch(/\S/); expect(bannedIn(HINTS[id]), id).toBeNull(); }
    for (const [id, line] of Object.entries(MOON_STATION_LINES)) {
      expect(phrase(id)).toBe(line);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).toBe(line); });
    }
    for (const w of ['collapse', 'trapped', 'stuck', 'dark']) for (const id of IDS) expect(HINTS[id].toLowerCase()).not.toContain(w);
  });
});

describe('the gold stub and the beauty scatter', () => {
  it('gm-moon-4 is in the mice lists, equal to the plan, and not in ROCK_KEEP_OUT; the totals are 65 and 41', () => {
    expect(GOLD_MICE.moon.map((m) => m.id)).toEqual(['gm-moon-1', 'gm-moon-2', 'gm-moon-3', 'gm-moon-4']);
    expect(P.MOON_MICE.map((m) => ({ ...m }))).toEqual(GOLD_MICE.moon);
    expect(KNOWN_GOLD.has('gm-moon-4')).toBe(true);
    const m4 = P.MOON_MICE[3];
    expect(m4.y).toBe(3);
    expect(P.ROCK_KEEP_OUT.some((k) => k[0] === m4.x && k[1] === m4.z)).toBe(false);
    expect(Object.values(GOLD_MICE).flat().length).toBe(65);
    expect(goldForEdition('canon', CATALOG).size).toBe(65);
    expect(goldForEdition('legacy', CATALOG).size).toBe(41);
  });
  it('the beauty scatters and the rocks are byte-identical to main (recorded hashes)', () => {
    expect(B.SCATTER_MICE).toEqual(['gm-moon-1', 'gm-moon-2', 'gm-moon-3']);
    const out = {};
    for (const lite of [false, true]) {
      const k = lite ? 'lite' : 'full';
      Object.assign(out, { ['small' + k]: B.smallCraters(lite), ['crl' + k]: B.craterlets(lite), ['rim' + k]: B.rimDebris(lite), ['rays' + k]: B.rays(lite), ['patches' + k]: B.patches(lite), ['pebbles' + k]: B.pebbles(lite), ['chunks' + k]: B.rimChunks(lite), ['rocks' + k]: MP.scatterRocks(lite) });
    }
    out.foot = B.footprints();
    expect(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, sha(v)]))).toEqual(EXPECTED_HASHES);
  });
});

describe('the signal tag prize', () => {
  it('is a free collar prize owned exactly when relay bit 4 is set, never in the shop', () => {
    expect(CATALOG.accessories.signaltag).toEqual({ name: 'Signal Tag', slot: 'collar', price: 0, prize: true, moon: 'relay' });
    expect(fresh().unlocked.accessories).not.toContain('signaltag');
    expect(fresh({ moon: { relay: 15 } }).unlocked.accessories).not.toContain('signaltag');
    expect(fresh({ moon: { relay: 16 } }).unlocked.accessories).toContain('signaltag');
  });
  it('the dressing room says the area-prize line for it, never "visit null"', async () => {
    const { prizeVisit } = await import('../src/visits.js');
    expect(prizeVisit('signaltag')).toBeNull();
    expect(readFileSync(new URL('../src/ui/dressingroom.js', import.meta.url), 'utf8')).toContain("phrase('wear.areaPrize')");
  });
});

describe('the prompt arbiter and the partner events', () => {
  afterEach(() => { delete ST.station; });
  const setup = () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const life = area.life({ scene, ground: area.ground, progression: { state: {} }, reducedMotion: true, tier: {} });
    return { life };
  };
  const FAR = { x: -34, z: -3, y: 0 }; // nothing of the landing's offers reaches here
  it('the source order is riding, base, job, star, launch, station relay, rover, station sled', () => {
    const code = readFileSync(new URL('../src/world/moonlife.js', import.meta.url), 'utf8');
    expect(code).toContain("createPromptArbiter([{ promptAt: (p) => (rover.riding ? rover.promptAt(p) : null), interact: () => rover.interact() }, st('riding'), base, job, star, launch, st('relay'), rover, st('sled')])");
  });
  it('an empty station changes nothing; a filled slot answers in its place, the relay before the sled, riding before both', () => {
    const { life } = setup();
    expect(life.promptAt(FAR)).toBeNull();
    const log = [];
    const src = (name, line) => ({ promptAt: () => line, interact: () => { log.push(name); return name; } });
    ST.station = { sled: src('sled', 'Hop on') };
    expect(life.promptAt(FAR)).toBe('Hop on'); expect(life.interact()).toBe('sled');
    ST.station = { sled: src('sled', 'Hop on'), relay: src('relay', 'Fix it') };
    expect(life.promptAt(FAR)).toBe('Fix it'); expect(life.interact()).toBe('relay');
    ST.station = { sled: src('sled', 'Hop on'), relay: src('relay', 'Fix it'), riding: src('riding', 'Hop off') };
    expect(life.promptAt(FAR)).toBe('Hop off'); expect(life.interact()).toBe('riding');
    expect(log).toEqual(['sled', 'relay', 'riding']);
    life.dispose();
  });
  it('relay- events go to the station, are dropped without one, and never fall to the base', () => {
    const { life } = setup();
    let seen = 0;
    life.base.credit = () => { seen++; };
    expect(life.credit({ kind: 'relay-part', n: 1 })).toBeNull();
    expect(seen).toBe(0);
    const got = [];
    ST.station = { relay: { credit: (ev) => { got.push(ev.kind); return 'ok'; } } };
    expect(life.credit({ kind: 'relay-part' })).toBe('ok');
    expect(got).toEqual(['relay-part']);
    life.credit({ kind: 'wake' });
    expect(seen).toBe(1); // other kinds still reach the base
    ST.station = {};
    expect(life.credit({ kind: 'relay-wake' })).toBeNull();
    life.dispose();
  });
});

describe('the rock clears hook', () => {
  it('starts empty and takes rocks, pebbles and rim chunks away after the scatter, keeping the boulders', () => {
    expect(P.MOON_CLEARS).toEqual([]);
    const a = MP.rockLists(false);
    expect(a.small.length).toBeGreaterThan(0);
    P.MOON_CLEARS.push({ minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 });
    try {
      const b = MP.rockLists(false);
      expect([b.small, b.medium, b.large, b.rim]).toEqual([[], [], [], []]);
      expect(b.boulder).toEqual(a.boulder);
    } finally { P.MOON_CLEARS.length = 0; }
    expect(sha(MP.rockLists(false))).toBe(sha(a));
  });
});

describe('the station stage', () => {
  it('is reserved, empty but valid, and fetched by the late loader after the three landing stages', async () => {
    const L = await import('../src/world/moonlate.js');
    const order = [];
    const imports = { hill: async () => { order.push('hill'); }, launch: async () => { order.push('launch'); }, rover: async () => { order.push('rover'); }, station: async () => { order.push('station'); } };
    const { HELD } = await import('../src/world/moonstages.js');
    for (const id of ['hill', 'launch', 'rover']) HELD.add(id);
    try { await L.startMoonStages({ imports }); } finally { L.resetMoonStages(); }
    expect(order.at(-1)).toBe('station');
    expect(order).toHaveLength(4);
    await import('../src/world/moonstagestation.js');
    expect(ST.station).toEqual({});
    expect(Object.isFrozen(ST.station)).toBe(true);
    const { STAGE_ORDER } = await import('../src/world/moonstages.js');
    expect(STAGE_ORDER).toEqual(['rover', 'hill', 'launch']); // the station has no ring, no stand-in and no region
  });
});

// sha256 of JSON.stringify of each, taken on main before X0 (the relay tower's mouse must not move one byte)
const EXPECTED_HASHES = {
  "smallfull": "51a1b6eafcd8e9b1b32368b2a3c89e092ad21d0338a4aab841b5620c7c690b76",
  "crlfull": "ad77d56d61a14937f3da8061e83cbf65dd80332e3fce2f7d1b7c11839a964eb2",
  "rimfull": "4db6455c04aa85b4dad66dd2d49ad2cc1ece775f190354082018fe771ec3eb2d",
  "raysfull": "f2c6162ee6c3e30e28b5064f953c6428d2322b90944c9a1af2689dbf6634fed5",
  "patchesfull": "6dbbf65ef4e8f8f97107893133479a20e94d8db04b134d819f944fe9c9a90e72",
  "pebblesfull": "af0f27fce095fa297b93129a6abede361e0f8a8f4e06f3c84c7930111a5f6ccf",
  "chunksfull": "a41e91202607307020eaa770fdad58c55abd64d306be4f44439524ef19b5931b",
  "rocksfull": "65f5e9c24bc154d053f03ce0031b18868c414921ea2349aaa87eeb670703572a",
  "smalllite": "f81f16fd982c635b3fc89f9b129e05c6ec4fed89f26bf0581d3c895692726054",
  "crllite": "2ac9d66a62368f611c9700665aa72dc544b3ab54acf4e310c894dd38154805ea",
  "rimlite": "bda20fabccb07901e8646e5a9a17f203b23243b54df1840574ee13903dbfc064",
  "rayslite": "2b93a54a962f49ddf9ebc7f866cf1bef8fac255067b5a78e7aea6db95371e0b6",
  "patcheslite": "f7395bbeb8fc9ec1d0f41cec9b356268e1684922e99755551e416f0a964575f7",
  "pebbleslite": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "chunkslite": "3c12ceadb6c0f344166edda8d75e6cd68a88428f362f9f0f2ed96b6b30a39713",
  "rockslite": "f3595cc8f7f08efadcf5f2df1edb10fb81fd3a3ab66ee6477b33260f3bdd9b9d",
  "foot": "63e1a23a3fc4c0b6a6a765e9fa90f73b06acc6dc8b13825815295a3080296d7d"
};;
