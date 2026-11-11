import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createNetEvents } from '../src/game/netevents.js';
import { createMetPlayers } from '../src/metplayers.js';
import { nowSec } from '../src/game/util.js';
import { CAT_NAMES } from '../src/straynames.js';

// Child-safety pass on the walk's event handling: a boop-confirm only counts as
// the answer to a boop this child asked for, and a hidden visitor's events show
// nothing (only the silent mirror of the shared world still runs).

const ME = 'me-0001';
const ROBIN = 'robin-0002';
const STRANGER = 'stranger-0003';

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

function harness({ blocked = [], partnerName = 'Robin' } = {}) {
  const toasts = [];
  const awards = [];
  const greets = [];
  const sounds = [];
  const met = createMetPlayers(memStorage());
  const { applyRemoteEvent } = createNetEvents({
    MP: 1,
    getCloud: () => ({ recordGreet: (...a) => { greets.push(a); return Promise.resolve(1); } }),
    getPsecret: () => 'secret',
    log: { awardOnce: (kind, key) => { if (awards.includes(key)) return 0; awards.push(key); return 5; } },
    hud: { toast: (t) => toasts.push(t) },
    audio: { purr: () => sounds.push('purr'), meow: () => sounds.push('meow'), cluck: () => sounds.push('cluck') },
    samples: { has: () => false, play: () => sounds.push('sample') },
    catVoice() {}, applyGoalResult() {},
    getPartner: () => ({ playerId: ROBIN, petName: partnerName, wardrobe: [] }),
    metPlayers: met,
  });
  const remote = (playerId, petName) => {
    const group = new THREE.Group();
    group.position.set(1, 0, 1);
    return { playerId, petName, group };
  };
  const collectible = new THREE.Group();
  const s = {
    playerId: ME,
    remotes: { list: [remote(ROBIN, 'Robin'), remote(STRANGER, 'Mystery Cat')] },
    cat: new THREE.Group(),
    pendingBoop: null,
    incomingBoop: null,
    net: { sendEvent: vi.fn() },
    walkStamp: 'w1',
    critters: { reactToMeow: () => sounds.push('critters') },
    scene: { remove: vi.fn() },
    collectibleMeshes: new Map([['c1', collectible]]),
    areaData: { collectibles: [{ id: 'c1', x: 0.5, z: 0.5 }] },
    colonyWalk: true,
    strayCats: { strays: [] },
    fx: { burst() {} },
    isBlocked: (id) => blocked.includes(id),
  };
  return { s, toasts, awards, greets, sounds, met, applyRemoteEvent };
}

const confirm = (from) => ({ v: 1, id: from, type: 'boop-confirm', withId: ME });

describe('boop-confirm: only the answer to a boop this child asked for', () => {
  it('a confirm out of nowhere records nothing: no boop, no greet, not met', () => {
    const h = harness();
    h.applyRemoteEvent(h.s, confirm(STRANGER));
    expect(h.awards).toEqual([]);
    expect(h.greets).toEqual([]);
    expect(h.met.has(STRANGER)).toBe(false);
  });
  it('a request then a confirm from the joiner is still nothing (her request is not my E press)', () => {
    const h = harness();
    h.applyRemoteEvent(h.s, { v: 1, id: STRANGER, type: 'boop-request', toId: ME });
    h.applyRemoteEvent(h.s, confirm(STRANGER));
    expect(h.greets).toEqual([]);
  });
  it('the answer to my own request completes the boop, records the greet and marks her met', () => {
    const h = harness();
    h.s.pendingBoop = { withId: ROBIN, until: nowSec() + 4 }; // my E press beside her
    h.applyRemoteEvent(h.s, confirm(ROBIN));
    expect(h.awards).toEqual([`boop-${ROBIN}`]);
    expect(h.greets).toEqual([[ME, 'secret', ROBIN, 'w1']]);
    expect(h.met.has(ROBIN)).toBe(true);
    expect(h.s.pendingBoop).toBe(null);
  });
  it('my request to one cat is not an answer from another', () => {
    const h = harness();
    h.s.pendingBoop = { withId: ROBIN, until: nowSec() + 4 };
    h.applyRemoteEvent(h.s, confirm(STRANGER));
    expect(h.greets).toEqual([]);
  });
  it('a long-stale request is not answered', () => {
    const h = harness();
    h.s.pendingBoop = { withId: ROBIN, until: nowSec() - 60 };
    h.applyRemoteEvent(h.s, confirm(ROBIN));
    expect(h.greets).toEqual([]);
  });
  it('a cat not in this walk cannot answer', () => {
    const h = harness();
    h.s.pendingBoop = { withId: 'gone-0009', until: nowSec() + 4 };
    h.applyRemoteEvent(h.s, confirm('gone-0009'));
    expect(h.greets).toEqual([]);
  });
  it('a boop-request from a cat not in this walk is not kept', () => {
    const h = harness();
    h.applyRemoteEvent(h.s, { v: 1, id: 'gone-0009', type: 'boop-request', toId: ME });
    expect(h.s.incomingBoop).toBe(null);
  });
});

describe('a hidden visitor', () => {
  it('her meow is not heard and her boop request is not kept', () => {
    const h = harness({ blocked: [STRANGER] });
    h.applyRemoteEvent(h.s, { v: 1, id: STRANGER, type: 'meow', breed: 'tabby', pos: [1, 1] });
    h.applyRemoteEvent(h.s, { v: 1, id: STRANGER, type: 'boop-request', toId: ME });
    expect(h.sounds).toEqual([]);
    expect(h.s.incomingBoop).toBe(null);
  });
  it('the shared world still follows what she did, without a word about her', () => {
    const h = harness({ blocked: [STRANGER] });
    h.applyRemoteEvent(h.s, { v: 1, id: STRANGER, type: 'collect', collectibleId: 'c1' });
    expect(h.s.collectibleMeshes.has('c1')).toBe(false); // same world as my sister's
    expect(h.toasts).toEqual([]);
  });
  it('someone not hidden still gets her "got there first"', () => {
    const h = harness();
    h.applyRemoteEvent(h.s, { v: 1, id: ROBIN, type: 'collect', collectibleId: 'c1' });
    expect(h.toasts).toEqual(['Robin got there first!']);
  });
});

describe('the partner feed toast', () => {
  it('a partner name that is not a good pet name is never shown', () => {
    for (const bad of ['<img src=x>', 'x'.repeat(500), 'Kitty 😺', '‮abc', 'Call 5551234567']) {
      const h = harness({ partnerName: bad });
      h.applyRemoteEvent(h.s, { v: 1, id: ROBIN, type: 'colony-feed', cat: CAT_NAMES[0] });
      expect(h.toasts).toEqual([`Your partner fed ${CAT_NAMES[0]} 🐟`]);
    }
  });
});
