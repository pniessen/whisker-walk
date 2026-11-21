import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSession, walkDusk } from '../src/game/session.js';
import { snapshotWalk, settleAbandoned } from '../src/game/walkresume.js';
import { createProgression, CATALOG } from '../src/progression.js';
import { roofsOn, setRoofs, resumableAreaIds } from '../src/roofsflag.js';
import { readResume, RESUME_KEY } from '../src/game/walkresume.js';
import { createStrayCats } from '../src/straycats.js';
import { decideLobbyEvent, MEMBER_GATHER_MS } from '../src/game/lobby.js';
import { createRooms } from '../src/game/rooms.js';
import { createFakeHub, createNet } from '../src/net.js';
import { words } from '../src/wordset.js';
import * as onWords from '../src/clanwords.js';
import * as offWords from '../src/offclanwords.js';
import { ROOFS_COLLECTIBLES, ROOFS_SCENICS, ROOFS_PERCHES, ROOFS_REGISTRATION } from '../src/world/roofsplan.js';
import { seriesFilter } from './helpers/serieswords.js';
import { withStandInWords } from './helpers/standinwords.js';

// =============================================================================
// The Rooftops in the game (Rooftops step 2). Task 8: the evening look, and a
// Rooftops walk counting as a dusk walk only with the Glow Collar (Review
// Focus item 5). Tasks 9, 11 and 12 add to this file. What walk.js itself
// does with the place (the evening look, no weather, the ?roofs=1 start, no
// strays, no ghosts) is tested on real walks in test/roofswalk.test.js.
// =============================================================================

const ROOFS = { evening: true };
const WOODS = {};

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// A solo walk as startWalk makes it: the Day or Dusk choice, her collar, the place.
function start({ duskMode, collar, area }) {
  const d = walkDusk({ duskMode, room: false, collar, evening: area.evening });
  const session = createSession({
    areaData: { collectibles: [], ...area }, duskMode, duskActive: d.duskActive, countsDusk: d.countsDusk,
    soloSeed: 7, walkStamp: 'walk-1', resumeTries: 0,
  });
  Object.assign(session, {
    areaId: area === ROOFS ? 'roofs' : 'woods', net: null,
    cat: { position: { x: 4, y: 0, z: 41 } }, collectibleMeshes: new Map(),
    walk: { carried: 0, carryCap: 2 }, scenicsVisited: new Set(), startPoints: 0,
  });
  return { ...d, session };
}

// endWalk's tally (walk.js: progression.completeWalk(session.areaId, { dusk: session.countsDusk })).
function duskWalksAfter(session) {
  const p = createProgression(memStorage());
  p.completeWalk(session.areaId, { dusk: session.countsDusk });
  return p.state.duskWalks;
}

describe('the Rooftops’ evening in the walk', () => {
  it('counts as a dusk walk only with the Glow Collar', () => {
    // the Day choice and the Glow Collar on the Rooftops: an evening look, and it counts
    const glow = start({ duskMode: false, collar: 'glow', area: ROOFS });
    expect([glow.duskActive, glow.eveningLook, glow.countsDusk]).toEqual([false, true, true]);
    expect(glow.session.countsDusk).toBe(true);
    expect(duskWalksAfter(glow.session)).toBe(1);
    // ...and the walk's resume note keeps that, so an abandoned walk counts too
    const note = snapshotWalk(glow.session, { yaw: 0, now: 1 });
    expect(note.duskActive).toBe(true);
    const p = createProgression(memStorage());
    settleAbandoned(p, note);
    expect(p.state.duskWalks).toBe(1);
    // the same walk with no collar (or another one): the same look, and it does not count
    for (const collar of [null, 'bell']) {
      const plain = start({ duskMode: false, collar, area: ROOFS });
      expect([plain.duskActive, plain.eveningLook, plain.countsDusk]).toEqual([false, true, false]);
      expect(duskWalksAfter(plain.session)).toBe(0);
      expect(snapshotWalk(plain.session, { yaw: 0, now: 1 }).duskActive).toBe(false);
    }
    // the Dusk choice without the collar is no dusk walk there either
    expect(start({ duskMode: true, collar: null, area: ROOFS }).countsDusk).toBe(false);
    // everywhere else, nothing changes: dusk is the Dusk choice and the Glow Collar
    expect(walkDusk({ duskMode: false, room: false, collar: 'glow', evening: undefined })).toEqual({ duskActive: false, eveningLook: false, countsDusk: false });
    expect(walkDusk({ duskMode: true, room: false, collar: 'glow', evening: undefined })).toEqual({ duskActive: true, eveningLook: true, countsDusk: true });
    expect(walkDusk({ duskMode: true, room: false, collar: null, evening: undefined })).toEqual({ duskActive: false, eveningLook: false, countsDusk: false });
    // a room trusts the host's choice, as before
    expect(walkDusk({ duskMode: true, room: true, collar: null, evening: undefined })).toEqual({ duskActive: true, eveningLook: true, countsDusk: true });
    expect(start({ duskMode: false, collar: 'glow', area: WOODS }).countsDusk).toBe(false);
  });
});

// ---- Task 9: into the game; Rooftops step 4 opens it (ruling T1), and ------
// ?roofs=1 stays as a developer shortcut only (ruling T3)

describe('the Rooftops in the game, and ?roofs=1 a developer shortcut', () => {
  it('the catalog has the Rooftops, after the Fairground', () => {
    // Rooftops step 4, ruling T1: two-player height is on main, so the row
    // R1 held back is in. Every card, home line, Get it?, gift and room reads
    // CATALOG.areas, so the row is what opens the place to all of them.
    expect(CATALOG.areas.roofs).toEqual({ name: 'The Rooftops', price: 100, requires: { area: 'fair', walks: 2 } });
    const ids = Object.keys(CATALOG.areas);
    expect(ids[ids.indexOf('fair') + 1]).toBe('roofs');
  });

  // Explore with the flag on starts a solo Rooftops walk, never in a room:
  // test/roofswalk.test.js, on the real beginWalkFromHomebase.
  it('the flag is off by default, and a test can force it either way', () => {
    try {
      setRoofs(null);
      expect(roofsOn()).toBe(false);
      setRoofs(true);
      expect(roofsOn()).toBe(true);
      setRoofs(false);
      expect(roofsOn()).toBe(false);
    } finally { setRoofs(null); }
  });

  it('a Rooftops walk note resumes, with the flag or without', () => {
    const now = Date.UTC(2026, 10, 20, 12);
    const note = { v: 1, at: now - 60_000, tries: 0, areaId: 'roofs', seed: 7, stamp: 'walk-1', x: 4, z: 41, yaw: 0, startPoints: 0 };
    // the real game's ids: a fresh save's walks, through the helper main.js
    // hands readResume
    const walks = createProgression(memStorage()).state.walks;
    const read = (on) => {
      const storage = memStorage();
      storage.setItem(RESUME_KEY, JSON.stringify(note));
      try {
        setRoofs(on);
        return { got: readResume(storage, { now, areaIds: resumableAreaIds(walks) }), left: storage.getItem(RESUME_KEY) };
      } finally { setRoofs(null); }
    };
    // the switch gates nothing now (T3): every walk id resumes
    expect(resumableAreaIds(walks)).toEqual(Object.keys(walks));
    expect(read(false).got?.kind).toBe('resume');                     // the flag off: picked up
    expect(read(true).got?.kind).toBe('resume');                      // the flag on: the same
    // every other place's note is kept either way
    const park = memStorage();
    park.setItem(RESUME_KEY, JSON.stringify({ ...note, areaId: 'park' }));
    expect(readResume(park, { now, areaIds: resumableAreaIds(walks) })?.kind).toBe('resume');
  });

  it('an old save with no walks.roofs loads with 0, and a Rooftops walk counts', () => {
    const storage = memStorage();
    const first = createProgression(storage);
    const old = JSON.parse(JSON.stringify(first.state));
    delete old.walks.roofs;
    storage.setItem('whisker-walk-save', JSON.stringify(old));
    const p = createProgression(storage);
    expect(p.state.walks.roofs).toBe(0);
    p.completeWalk('roofs');
    expect(p.state.walks.roofs).toBe(1);
  });

  describe('a room walks the Rooftops like any place', () => {
    afterEach(() => { vi.useRealTimers(); });

    // Two players in a code room on net.js's in-memory hub (as
    // test/rooms.test.js), and a third who proposes walks by hand.
    function memberIn(hub, pid) {
      const progression = createProgression(memStorage());
      progression.setPetName(pid);
      const walks = [];
      let session = null;
      const { rooms } = createRooms({
        MP: 1, pid, supabaseUrl: 'x', supabaseAnonKey: 'y',
        progression, getCloud: () => null, getPsecret: () => null,
        getSession: () => session, startWalk: (o) => { walks.push(o); session = { o }; },
        colonySync: { status: () => ({ mode: 'unpaired' }), pull() {} },
        createTransport: () => hub.transport(),
      });
      return { rooms, walks };
    }

    it('a proposal that names the Rooftops starts the walk on both, as one naming the Park does', async () => {
      vi.useFakeTimers();
      const hub = createFakeHub();
      const a = memberIn(hub, 'aaaa-host-0001');
      const b = memberIn(hub, 'bbbb-kid-00002');
      await a.rooms.join('ABCD');
      await b.rooms.join('ABCD');
      const proposer = createNet(hub.transport());
      await proposer.join('ABCD', { playerId: '0000-first-01', petName: 'Pip' });
      proposer.sendEvent({ v: 1, id: '0000-first-01', type: 'walk-config', area: 'roofs', dusk: false, seed: 5 });
      vi.advanceTimersByTime(MEMBER_GATHER_MS * 3);
      for (const m of [a, b]) expect(m.walks).toEqual([{ duskMode: false, roomSeed: 5, areaOverride: 'roofs' }]);
    });

    it('...and the same proposal naming the Park starts the same walk there', async () => {
      vi.useFakeTimers();
      const hub = createFakeHub();
      const a = memberIn(hub, 'aaaa-host-0001');
      const b = memberIn(hub, 'bbbb-kid-00002');
      await a.rooms.join('ABCD');
      await b.rooms.join('ABCD');
      const proposer = createNet(hub.transport());
      await proposer.join('ABCD', { playerId: '0000-first-01', petName: 'Pip' });
      proposer.sendEvent({ v: 1, id: '0000-first-01', type: 'walk-config', area: 'park', dusk: false, seed: 5 });
      vi.advanceTimersByTime(MEMBER_GATHER_MS * 3);
      for (const m of [a, b]) expect(m.walks).toEqual([{ duskMode: false, roomSeed: 5, areaOverride: 'park' }]);
    });
  });

  it('the lobby\'s rule: a walk config or request naming the Rooftops is honoured as for the Park', () => {
    const ctx = { roster: [{ playerId: 'host' }, { playerId: 'kid' }], selfId: 'host', inWalk: false, knownAreas: Object.keys(CATALOG.areas), unlockedAreas: [] };
    for (const area of ['roofs', 'park']) {
      expect(decideLobbyEvent({ type: 'walk-config', id: 'kid', area, seed: 1 }, ctx), area).toEqual({ kind: 'propose', from: 'kid', area, dusk: false, seed: 1, override: true });
      expect(decideLobbyEvent({ type: 'walk-request', id: 'kid', area }, ctx), area).toEqual({ kind: 'config', area, dusk: false });
    }
  });

  it('no strays, no wanderer on the Rooftops', () => {
    // where the cats are made: an area record with strays: false gets none,
    // not the count asked for and not the wanderer (on a real walk:
    // test/roofswalk.test.js)
    const made = createStrayCats({ add() {}, remove() {} }, { strays: false, bounds: { minX: -9, maxX: 9, minZ: -9, maxZ: 9 }, colliders: [], spawn: { x: 0, z: 0 } }, 8, () => 0.5, { extras: [{ name: 'Biscuit', wanderer: true, spot: { x: 1, z: 1 }, rng: () => 0.5 }] });
    expect(made.strays).toHaveLength(0);
  });
});

// =============================================================================
// Task 11: the unlock, written and tested on a copy of the catalog, not live.
// =============================================================================
describe('the Rooftops unlock (in the real catalog since step 4)', async () => {
  const { areaOffer, KEPT_OFFERS } = await import('../src/areaoffer.js');
  const { nextThing } = await import('../src/ui/nextthing.js');
  const { placeState, opensAfterLine } = await import('../src/territories.js');
  const { withRoofs } = await import('./helpers/withroofs.js');
  const fresh = () => createProgression(memStorage()).state;
  const atFair = (fairWalks, extra = {}) => {
    const s = fresh();
    return { ...s, walks: { ...s.walks, fair: fairWalks }, unlocked: { ...s.unlocked, areas: [...s.unlocked.areas, 'fair'] }, area: 'fair', edition: 'legacy', ...extra };
  };

  it('the offer: after 2 Fairground walks, for 100', () => {
    const cat = withRoofs(CATALOG);
    const want = { requires: { area: 'fair', walks: 2 }, price: 100 };
    expect(areaOffer(atFair(0), cat, 'roofs')).toEqual(want);
    expect(areaOffer({ ...atFair(0), keptOffers: ['roofs'] }, cat, 'roofs')).toEqual(want);
    expect(KEPT_OFFERS.roofs).toBeUndefined();
  });

  it('withRoofs puts it after the Fairground and never changes its input', () => {
    const frozen = JSON.stringify(CATALOG.areas);
    const ids = Object.keys(withRoofs(CATALOG).areas);
    expect(ids[ids.indexOf('fair') + 1]).toBe('roofs');
    expect(JSON.stringify(CATALOG.areas)).toBe(frozen);
    // the real catalog has the row already: an equal copy, in the same order
    expect(withRoofs(CATALOG).areas).toEqual(CATALOG.areas);
    expect(ids).toEqual(Object.keys(CATALOG.areas));
    // a catalog without it gets it after the Fairground
    const { roofs: _, ...rest } = CATALOG.areas;
    const added = Object.keys(withRoofs({ ...CATALOG, areas: rest }).areas);
    expect(added[added.indexOf('fair') + 1]).toBe('roofs');
  });

  it('the Fairground’s home line names it', () => {
    const s = atFair(1);
    const line = nextThing(s, { catalog: withRoofs(CATALOG) });
    expect(line).toMatchObject({ rule: 7, id: 'home.opens' });
    expect(line.text).toBe('Explore here again to open the Rooftops!');
  });

  it('locked, then open to buy, then bought', () => {
    const cat = withRoofs(CATALOG);
    const rich = (s) => ({ ...s, points: 500 });
    const locked = placeState(rich(atFair(0)), cat, 'roofs');
    expect(locked).toMatchObject({ locked: true, canOpen: false, owned: false, price: 100 });
    const open = placeState(rich(atFair(2)), cat, 'roofs');
    expect(open).toMatchObject({ locked: false, canOpen: true, owned: false, price: 100 });
    const s = atFair(2);
    const bought = placeState({ ...s, points: 500, unlocked: { ...s.unlocked, areas: [...s.unlocked.areas, 'roofs'] } }, cat, 'roofs');
    expect(bought).toMatchObject({ owned: true, locked: false, canOpen: false });
  });

  it('the real catalog offers it as the world map orders it', () => {
    const locked = placeState(atFair(1), CATALOG, 'roofs');
    expect(locked).toMatchObject({ locked: true, canOpen: false, owned: false, price: 100 });
    expect(locked.line).toBe(opensAfterLine({ area: 'fair', walks: 2 }, 1, 'legacy', CATALOG));
    expect(placeState({ ...atFair(2), points: 100 }, CATALOG, 'roofs')).toMatchObject({ locked: false, canOpen: true, owned: false, price: 100 });
    expect(nextThing(atFair(1), { catalog: CATALOG })).toMatchObject({ rule: 7, id: 'home.opens', text: 'Explore here again to open the Rooftops!' });
  });

  // Review Focus 1: a save that walked the Rooftops through ?roofs=1 before
  // step 4 (walks.roofs 2, not owned, no points).
  it('a save that walked the Rooftops with the switch keeps nothing it did not buy', () => {
    const s = fresh();
    const old = { ...s, walks: { ...s.walks, roofs: 2, fair: 0 } };
    const st = placeState(old, CATALOG, 'roofs');
    expect(st).toMatchObject({ owned: false, locked: true, canOpen: false, price: 100 });
    expect(st.line).toBe(opensAfterLine({ area: 'fair', walks: 2 }, 0, old.edition, CATALOG));
    expect(st.line).toContain('0/2');
    // its card offers it for 100 once she has 2 Fairground walks (and the points)
    const later = { ...old, walks: { ...old.walks, fair: 2 }, points: 100 };
    expect(placeState(later, CATALOG, 'roofs')).toMatchObject({ owned: false, locked: false, canOpen: true, line: 'Open for 100 🐾' });
  });
});

describe('the words (Task 12)', () => {
  it("the place's name is in both word sets", () => {
    expect(onWords.PLACE_WORDS.roofs).toBe('The Rooftops');
    expect(offWords.PLACE_WORDS.roofs).toBe('The Rooftops');
    expect(ROOFS_REGISTRATION.catalog.name).toBe(onWords.PLACE_WORDS.roofs);
    // The stand-in set words it too, so a place name read at start-up shows.
    withStandInWords(() => {
      expect(words().PLACE_WORDS.roofs).toMatch(/^Zzburg/);
    });
    expect(words().PLACE_WORDS.roofs).toBe('The Rooftops');
  });

  it('no Rooftops label holds a word of the series', () => {
    const { roofs, ...others } = onWords.PLACE_WORDS;
    const keep = seriesFilter([
      ...Object.values(onWords.RANK_WORDS), ...Object.values(onWords.OUTSIDE_WORDS),
      ...Object.values(others), onWords.CLAN_SUFFIX,
    ]);
    const labels = [
      ...ROOFS_COLLECTIBLES.map((c) => c.label),
      ...ROOFS_SCENICS.map((c) => c.label),
      ...ROOFS_PERCHES.map((p) => p.label).filter(Boolean),
      ROOFS_REGISTRATION.catalog.name,
      onWords.PLACE_WORDS.roofs,
      offWords.PLACE_WORDS.roofs,
    ];
    expect(labels.length).toBeGreaterThan(8);
    for (const l of labels) expect(keep(l), l).toBe(false);
  });
});
