import { describe, it, expect, vi } from 'vitest';
import { createRooms } from '../src/game/rooms.js';
import { partnerOlder, unknownPlaceFrom, COOP_PROTO } from '../src/game/lobby.js';
import { createFakeHub, createNet } from '../src/net.js';
import { createProgression } from '../src/progression.js';
import { phrase } from '../src/clanphrases.js';
import '../src/coopversionwords.js';
import { bannedIn } from './helpers/offwords.js';
import { setSeriesMode, addWordSet, removeWordSet } from '../src/wordset.js';
import * as off from '../src/offclanwords.js';
import { memoryStorage } from './helpers/storage.js';

// Engineering review 3, O1: presence carries { build, proto }; messages stay v: 1.
const ME = 'bbbb-kid-00002';
const FRIEND = 'aaaa-host-0001';

describe('partnerOlder', () => {
  const r = (p) => [{ playerId: ME, proto: COOP_PROTO }, { playerId: FRIEND, ...p }];
  it('no stamp or proto 1 is older; proto 2 is not', () => {
    expect(partnerOlder(r({}), ME)?.playerId).toBe(FRIEND);
    expect(partnerOlder(r({ proto: 1, build: 'x' }), ME)?.playerId).toBe(FRIEND);
    expect(partnerOlder(r({ proto: 2, build: 'x' }), ME)).toBe(null);
    expect(partnerOlder(r({ proto: 3 }), ME)).toBe(null);
  });
  it('is total over garbage and ignores me', () => {
    expect(partnerOlder(null)).toBe(null);
    expect(partnerOlder([null, 3, { proto: 1 }, { playerId: ME }], ME)).toBe(null);
  });
});

describe('unknownPlaceFrom', () => {
  const ctx = { roster: [{ playerId: FRIEND }, { playerId: ME }], selfId: ME, inWalk: false, knownAreas: ['park'] };
  it('names the sender of a walk-config for an unknown place only', () => {
    expect(unknownPlaceFrom({ type: 'walk-config', id: FRIEND, area: 'newplace', seed: 1 }, ctx)).toBe(FRIEND);
    expect(unknownPlaceFrom({ type: 'walk-config', id: FRIEND, area: 'park', seed: 1 }, ctx)).toBe(null);
    expect(unknownPlaceFrom({ type: 'walk-config', id: 'stranger', area: 'newplace' }, ctx)).toBe(null);
    expect(unknownPlaceFrom({ type: 'walk-config', id: FRIEND, area: 'newplace' }, { ...ctx, inWalk: true })).toBe(null);
    expect(unknownPlaceFrom(null, ctx)).toBe(null);
  });
});

function me(hub) {
  const toasts = [];
  const progression = createProgression(memoryStorage());
  progression.setPetName('Robin');
  const made = createRooms({
    MP: 1, pid: ME, supabaseUrl: 'x', supabaseAnonKey: 'y', progression,
    getCloud: () => null, getPsecret: () => null, getSession: () => null, startWalk() {},
    colonySync: { status: () => ({ mode: 'unpaired' }), pull: () => new Promise(() => {}) },
    toast: (t) => toasts.push(t), createTransport: () => hub.transport(),
  });
  return { ...made, toasts };
}

async function friendAt(hub, extra) {
  const net = createNet(hub.transport());
  await net.join('ABCD', { playerId: FRIEND, petName: 'Mittens', ...extra });
  return net;
}

describe('a room with a partner on another build', () => {
  for (const [label, extra, told] of [['no stamp', {}, true], ['proto 1', { proto: 1, build: 'old' }, true], ['proto 2', { proto: 2, build: 'new' }, false]]) {
    it(`partner at ${label}: ${told ? 'one friendly line' : 'silence'}`, async () => {
      const hub = createFakeHub();
      const m = me(hub);
      await friendAt(hub, extra);
      await m.rooms.join('ABCD');
      expect(m.toasts.filter((t) => t === phrase('coop.partnerOlder'))).toHaveLength(told ? 1 : 0);
    });
  }

  it('my own profile carries build and proto', async () => {
    const hub = createFakeHub();
    const m = me(hub);
    const friend = await friendAt(hub, { proto: 2 });
    let seen;
    friend.onRoster((r) => { seen = r; });
    await m.rooms.join('ABCD');
    const mine = seen.find((p) => p.playerId === ME);
    expect(mine.proto).toBe(COOP_PROTO);
    expect(typeof mine.build).toBe('string');
  });

  it('a walk-config for an unknown place gives a toast and starts nothing', async () => {
    const hub = createFakeHub();
    const m = me(hub);
    const friend = await friendAt(hub, { proto: 2 });
    await m.rooms.join('ABCD');
    friend.sendEvent({ v: 1, id: FRIEND, type: 'walk-config', area: 'atlantis', dusk: false, seed: 5 });
    await Promise.resolve();
    expect(m.toasts).toContain(phrase('coop.partnerNoPlace'));
  });
});

describe('the wire format is unchanged', () => {
  it('a start proposal is still { v: 1, id, type, area, dusk }', async () => {
    const hub = createFakeHub();
    const events = [];
    const watcher = createNet(hub.transport());
    await watcher.join('ABCD', { playerId: 'cccc-watch-3', petName: 'W' });
    watcher.onEvent((e) => events.push(e));
    const m = me(hub);
    await m.rooms.join('ABCD');
    expect(m.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
    const sent = events.filter((e) => e.id === ME);
    expect(sent.length).toBeGreaterThan(0);
    for (const e of sent) expect(Object.keys(e).sort()).toEqual(['area', 'dusk', 'id', 'seed', 'type', 'v'].filter((k) => k in e));
    expect(sent.every((e) => e.v === 1 && e.type === 'walk-config' && !('build' in e) && !('proto' in e))).toBe(true);
    expect(COOP_PROTO).toBe(2);
  });
});

describe('both word sets say it kindly', () => {
  for (const set of ['on', 'off']) {
    it(`set ${set}`, () => {
      if (set === 'off') addWordSet('off', off);
      setSeriesMode(set);
      try {
        for (const id of ['coop.partnerOlder', 'coop.partnerNoPlace']) {
          const t = phrase(id);
          expect(t.length).toBeGreaterThan(10);
          expect(bannedIn(t)).toBe(null);
        }
        expect(phrase('coop.partnerOlder')).toBe('Your friend needs to update the game: close it and open it again.');
      } finally { setSeriesMode('on'); if (set === 'off') removeWordSet('off'); }
    });
  }
});
