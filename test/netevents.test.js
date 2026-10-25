import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createNetEvents } from '../src/game/netevents.js';
import { createProgression } from '../src/progression.js';
import { CAT_NAMES } from '../src/straynames.js';

// v21 Stream 2, Task 12 — the receiving side of the live 'colony-feed' event
// (game/interactions.js's feedStray sends it). netevents.js imports THREE but
// no DOM and no renderer, and applyRemoteEvent already takes the live session
// as an argument, so the branch can be driven for real here.

const ME = 'me-player-0001';
const PARTNER = 'robin-player-02';
const STRANGER = 'someone-else-03';
const [PICKLES, OTHER] = CAT_NAMES;

function fakeStorage() {
  const map = new Map();
  let writes = 0;
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { writes += 1; map.set(k, String(v)); },
    writes: () => writes,
  };
}

function harness({ colonyWalk = true, partner = { playerId: PARTNER, petName: 'Robin', wardrobe: [] } } = {}) {
  const storage = fakeStorage();
  const progression = createProgression(storage);
  if (partner) progression.setColonyLink({ id: '0123456789abcdef', partner });
  const toasts = [];
  const bursts = [];
  const { applyRemoteEvent } = createNetEvents({
    MP: 1, getCloud: () => null, getPsecret: () => null,
    log: { awardOnce: () => { throw new Error('a colony feed must never award points'); } },
    hud: { toast: (text) => toasts.push(text) },
    audio: {}, samples: { has: () => false }, catVoice() {}, applyGoalResult() {},
    getPartner: () => progression.state.colony.partner,
  });
  const strayAt = (name, x, z) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    return { name, group };
  };
  const s = {
    playerId: ME,
    colonyWalk,
    strayCats: { strays: [strayAt(OTHER, 9, 9), strayAt(PICKLES, 3, -4)] },
    fx: { burst: (pos, color, n) => bursts.push({ x: pos.x, z: pos.z, color, n }) },
    remotes: { list: [] },
    cat: { position: new THREE.Vector3() },
  };
  const before = JSON.stringify(progression.state);
  const writesBefore = storage.writes();
  return {
    s, toasts, bursts, applyRemoteEvent,
    saveUntouched: () => JSON.stringify(progression.state) === before && storage.writes() === writesBefore,
  };
}

const feed = (o = {}) => ({ v: 1, id: PARTNER, type: 'colony-feed', cat: PICKLES, ...o });

describe('applyRemoteEvent: colony-feed', () => {
  let h;
  beforeEach(() => { h = harness(); });

  it('colony-feed from the partner toasts and never writes the save', () => {
    h.applyRemoteEvent(h.s, feed());
    expect(h.toasts).toEqual([`Robin fed ${PICKLES} 🐟`]);
    expect(h.saveUntouched()).toBe(true);
  });

  it('bursts at that stray when it is in this walk, and only toasts when it is not', () => {
    h.applyRemoteEvent(h.s, feed());
    expect(h.bursts).toHaveLength(1);
    expect(h.bursts[0]).toMatchObject({ x: 3, z: -4 });

    const away = harness();
    away.s.strayCats.strays = [];
    away.applyRemoteEvent(away.s, feed());
    expect(away.toasts).toEqual([`Robin fed ${PICKLES} 🐟`]);
    expect(away.bursts).toEqual([]);
  });

  it('colony-feed from anyone else, or with a non-stray name, does nothing', () => {
    h.applyRemoteEvent(h.s, feed({ id: STRANGER }));
    h.applyRemoteEvent(h.s, feed({ id: ME }));
    h.applyRemoteEvent(h.s, feed({ cat: 'Zeetoo' }));
    h.applyRemoteEvent(h.s, feed({ cat: '<img src=x onerror=alert(1)>' }));
    h.applyRemoteEvent(h.s, feed({ cat: undefined }));
    h.applyRemoteEvent(h.s, feed({ cat: { toString: () => PICKLES } }));
    expect(h.toasts).toEqual([]);
    expect(h.bursts).toEqual([]);
    expect(h.saveUntouched()).toBe(true);
  });

  it('does nothing off a colony walk (a room with someone who is not my partner)', () => {
    const off = harness({ colonyWalk: false });
    off.applyRemoteEvent(off.s, feed());
    expect(off.toasts).toEqual([]);
    expect(off.bursts).toEqual([]);
  });

  it('does nothing while unpaired', () => {
    const solo = harness({ partner: null });
    solo.applyRemoteEvent(solo.s, feed());
    solo.applyRemoteEvent(solo.s, feed({ id: undefined }));
    expect(solo.toasts).toEqual([]);
  });

  it('names a partner with no pet name plainly', () => {
    const noName = harness();
    const { applyRemoteEvent } = createNetEvents({
      MP: 1, getCloud: () => null, getPsecret: () => null, log: {},
      hud: { toast: (t) => noName.toasts.push(t) }, audio: {}, samples: { has: () => false },
      catVoice() {}, applyGoalResult() {},
      getPartner: () => ({ playerId: PARTNER, petName: null, wardrobe: [] }),
    });
    applyRemoteEvent(noName.s, feed());
    expect(noName.toasts).toEqual([`Your partner fed ${PICKLES} 🐟`]);
  });

  it('works without a getPartner dep (older wiring): nothing happens', () => {
    const { applyRemoteEvent } = createNetEvents({
      MP: 1, getCloud: () => null, getPsecret: () => null, log: {},
      hud: { toast: () => { throw new Error('no toast without a partner'); } },
      audio: {}, samples: { has: () => false }, catVoice() {}, applyGoalResult() {},
    });
    expect(() => applyRemoteEvent(h.s, feed())).not.toThrow();
  });
});
