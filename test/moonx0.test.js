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
// (numbers are rounded to 5 places before hashing: the Linux CI's Math.sin/cos differ from a Mac's in the last bits)
const sha = (v) => createHash('sha256').update(JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e5) / 1e5 : x))).digest('hex');

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
  "smallfull": "09fb82638ce76d1c07f0337967105668206f85959a9b9d4e07120a6408c98247",
  "crlfull": "7193065b6266d426c8b8e44e3995731c47fe2199e28716f7fe068600294ce93b",
  "rimfull": "61063f8a3e1d8f9f99bd15b72e59a4748e5ecaac8ab4e2894a5f08a23405903e",
  "raysfull": "24347af9d33a379a0164464a119db7dc3a9af4cc07d49f48044c6551f40b0c5b",
  "patchesfull": "4f7dbad90eeba34a7573f5cb88bc1655719de60ce89ad01699211a7738d3c398",
  "pebblesfull": "08f96513480f94fe30ba4a0f6ff99c90e04a2cd5448e9d39915079dc67dbdafd",
  "chunksfull": "d5633404f004389501e5b067dfdf4b772f1cb9b267d44a263c75d6c7e953af3e",
  "rocksfull": "27bbe3fea9491d291dd270ecc116400d749dcffff3eb052404447274b5020923",
  "smalllite": "2d6b5249df8be338c556313327112e7772d28fe11162a468b00f0b2e3a773a85",
  "crllite": "a7df1ab831258e6deb6f3c6c678976c2f0e62dcbc8db3ba7645b78026f5d3211",
  "rimlite": "c233929796f3976047053bdf5e05724ff717e9e8815fe28d388f06eee409c8e1",
  "rayslite": "775cbfcace558e1ff173d6e1621da3246ac210c0cfd175bcb2641f6499b97794",
  "patcheslite": "eace1facf5980c807dd039548fac30897d77ab00b7046a196f878e505d07192b",
  "pebbleslite": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "chunkslite": "4714b11b6cd5385521da6f65cf82b67d2bb400f5cdd6d815644ec03ba025a64e",
  "rockslite": "a4d56a2a4603aa061c0e6b8bd384c7a43552afcb164a5be798c12058057dbd94",
  "foot": "e6b2474fd1218b3f12011b3b654eb22151e7221704964604d2046d434e9959a9"
};;
