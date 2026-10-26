import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createNetEvents, takeHeldItemsWithRemotes } from '../src/game/netevents.js';
import { createProgression } from '../src/progression.js';
import { CAT_NAMES } from '../src/straynames.js';
import { createCarryables, MOUTH } from '../src/carryables.js';
import { createMouth, walkEndMarks } from '../src/carry.js';
import { onAnyDeck } from '../src/world/builder.js';
import { createRemoteCats } from '../src/remotecats.js';
import { createKnockables } from '../src/knockables.js';

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

// ===========================================================================
// v21 3b Task 8 — carrying in a co-walk. A partner's 'carry-pick' and
// 'carry-drop' (sent by game/interactions.js's pickUpCarryable and
// putDownCarried) move the item on my screen, and nothing else: no points, no
// feat, no mark, no save. Real carryables in a real scene, and the partner is
// a real remote cat (remotecats.js), so leaving and despawning are the shipped
// paths.
// ===========================================================================
describe('applyRemoteEvent: carry-pick and carry-drop', () => {
  const STICK = { id: 'park-stick-1', kind: 'stick', x: 5, z: 0 };
  const LEAF = { id: 'park-leaf-1', kind: 'leaf', x: -4, z: 3 };
  const BOUNDS = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
  const ROBIN = { playerId: PARTNER, petName: 'Robin', breed: 'tabby', accessories: {} };

  function carryHarness() {
    const storage = fakeStorage();
    const progression = createProgression(storage);
    const toasts = [];
    const { applyRemoteEvent } = createNetEvents({
      MP: 1, getCloud: () => null, getPsecret: () => null,
      log: { awardOnce: () => { throw new Error('a carry event must never award points'); } },
      hud: { toast: (text) => toasts.push(text) },
      audio: {}, samples: { has: () => false }, catVoice() {},
      applyGoalResult() { throw new Error('a carry event must never touch a goal'); },
      getPartner: () => null,
    });
    const scene = new THREE.Scene();
    const cat = new THREE.Group();
    const head = new THREE.Group();
    head.position.set(0, 0.3, -0.35);
    cat.add(head);
    cat.userData = { parts: { head } };
    scene.add(cat);
    const items = createCarryables(scene, [STICK, LEAF]);
    const remotes = createRemoteCats(scene);
    takeHeldItemsWithRemotes(remotes, items, cat);
    remotes.upsert(ROBIN, 0);
    remotes.applyState({ v: 1, id: PARTNER, pos: [10, 10], yaw: 0, pose: 'follow', speed: 0 }, 0);
    remotes.update(1, 1); // she is standing at (10, 10)
    const s = {
      playerId: ME,
      colonyWalk: false,
      cat,
      remotes,
      areaData: { bounds: BOUNDS },
      carry: { mouth: createMouth(), items },
      fx: { burst() { throw new Error('a carry event makes no burst'); } },
    };
    const before = JSON.stringify(progression.state);
    const writesBefore = storage.writes();
    const item = (id) => items.list.find((it) => it.id === id);
    const partnerGroup = () => remotes.list.find((r) => r.playerId === PARTNER)?.group;
    return {
      s, toasts, applyRemoteEvent, items, remotes, item, partnerGroup,
      apply: (ev) => applyRemoteEvent(s, ev),
      // main.js's frame order: the held thing follows its holder, then the remotes move
      frame: (now = 1) => { items.update(0); remotes.update(0, now); },
      saveUntouched: () => JSON.stringify(progression.state) === before && storage.writes() === writesBefore,
    };
  }

  const pickEv = (o = {}) => ({ v: 1, id: PARTNER, type: 'carry-pick', itemId: STICK.id, ...o });
  const dropEv = (o = {}) => ({ v: 1, id: PARTNER, type: 'carry-drop', itemId: STICK.id, pos: [12, -7], ...o });

  it('a partner pick takes the item off my ground and into their mouth', () => {
    const h = carryHarness();
    h.apply(pickEv());
    const stick = h.item(STICK.id);
    expect(stick.onGround).toBe(false);
    expect(stick.holder).toBe(h.partnerGroup());
    expect(stick.mesh.visible).toBe(true);
    // off the ground: I cannot pick up what she is holding
    expect(h.items.nearest(new THREE.Vector3(5, 0, 0), 1.2)).toBe(null);
    // and it rides at her mouth, not in mine
    h.frame();
    const herMouth = h.partnerGroup().userData.parts.head.localToWorld(MOUTH.clone());
    expect(stick.mesh.position.distanceTo(herMouth)).toBeLessThan(1e-6);
    expect(Math.hypot(stick.mesh.position.x - 10, stick.mesh.position.z - 10)).toBeLessThan(1);
    expect(h.s.carry.mouth.held).toBe(null);
    expect(h.item(LEAF.id).onGround).toBe(true);
  });

  it('a partner pick of a thing another cat holds moves it to her mouth', () => {
    const h = carryHarness();
    const other = new THREE.Group();
    h.s.cat.parent.add(other);
    h.items.hold(STICK.id, other);
    h.apply(pickEv());
    expect(h.item(STICK.id).holder).toBe(h.partnerGroup());
    expect(h.item(STICK.id).onGround).toBe(false);
  });

  it('a partner drop puts it down where they left it', () => {
    const h = carryHarness();
    h.apply(pickEv());
    h.frame();
    h.apply(dropEv());
    const stick = h.item(STICK.id);
    expect(stick.onGround).toBe(true);
    expect(stick.holder).toBe(null);
    expect(stick.mesh.visible).toBe(true);
    expect(stick.mesh.position.x).toBe(12);
    expect(stick.mesh.position.z).toBe(-7);
    // now it is on my ground, where she left it, for me to pick up
    expect(h.items.nearest(new THREE.Vector3(12, 0, -7), 1.2)).toBe(stick);
    // the very edge of the area is still inside it
    h.apply(pickEv());
    h.apply(dropEv({ pos: [30, -30] }));
    expect(stick.mesh.position.x).toBe(30);
    expect(stick.mesh.position.z).toBe(-30);
  });

  it.each([
    ['unknown id', { itemId: 'park-stick-99' }],
    ['non-string id', { itemId: 7 }],
    ['prototype key', { itemId: '__proto__' }],
    ['non-finite pos', { pos: [NaN, 0] }],
    ['out of bounds', { pos: [9999, 0] }],
    ['short pos', { pos: [1] }],
    ['string pos', { pos: ['5', '0'] }],
    ['3-entry pos', { pos: [1, 2, 3] }],
    ['array-like object pos', { pos: { 0: 1, 1: 2, length: 2 } }],
    ['sender not in this walk', { id: 'stranger-0000' }],
    ['non-string sender id', { id: 7 }],
    ['prototype-key sender id', { id: '__proto__' }],
  ])('%s is ignored without throwing or saving', (_name, bad) => {
    const h = carryHarness();
    const stick = h.item(STICK.id);
    expect(() => h.apply(pickEv(bad))).not.toThrow();
    if ('pos' in bad) {
      // a pick carries no pos, so these are well-formed picks and land
      expect(stick.holder).toBe(h.partnerGroup());
    } else {
      expect(stick.onGround).toBe(true);
      expect(stick.holder).toBe(null);
      h.apply(pickEv()); // now she really has it
    }
    // a drop with the bad field leaves it in her mouth
    expect(() => h.apply(dropEv(bad))).not.toThrow();
    expect(stick.onGround).toBe(false);
    expect(stick.holder).toBe(h.partnerGroup());
    for (const it of h.items.list) {
      expect(Number.isFinite(it.mesh.position.x)).toBe(true);
      expect(Math.abs(it.mesh.position.x)).toBeLessThan(31);
    }
    expect(h.toasts).toEqual([]);
    expect(h.saveUntouched()).toBe(true);
  });

  it('a pick for the item I am holding leaves mine in my mouth', () => {
    const h = carryHarness();
    h.s.carry.mouth.held = { id: STICK.id, kind: 'stick' };
    h.items.hold(STICK.id, h.s.cat);
    h.apply(pickEv());
    const stick = h.item(STICK.id);
    expect(stick.holder).toBe(h.s.cat);
    expect(stick.mesh.visible).toBe(true);
    expect(h.s.carry.mouth.held).toEqual({ id: STICK.id, kind: 'stick' });
    // and her later drop of hers does not pull mine out of my mouth either
    h.apply(dropEv());
    expect(stick.holder).toBe(h.s.cat);
    expect(stick.onGround).toBe(false);
    expect(h.s.carry.mouth.held).toEqual({ id: STICK.id, kind: 'stick' });
  });

  const LEAVES = [
    ['leaves the room', (h) => h.remotes.remove(PARTNER)],
    ['goes quiet and despawns', (h) => h.frame(60)],
    ['rejoins with a different pet', (h) => h.remotes.upsert({ ...ROBIN, petName: 'Robbie' }, 1)],
  ];
  // she picks the stick up, then vanishes in one of the three ways
  const carriedOff = (leave) => {
    const h = carryHarness();
    h.apply(pickEv());
    h.frame();
    leave(h);
    return h;
  };

  it.each(LEAVES)('a remote that %s while carrying takes the item with it', (_name, leave) => {
    const h = carriedOff(leave);
    const stick = h.item(STICK.id);
    expect(stick.holder).toBe(null);
    expect(stick.onGround).toBe(false);
    expect(stick.mesh.visible).toBe(false);
    expect(stick.gone).toBe(true);
    expect(h.items.nearest(new THREE.Vector3(5, 0, 0), 99)?.id).not.toBe(STICK.id);
    // the next frame has no removed cat to reach back into
    expect(() => h.frame(2)).not.toThrow();
    expect(stick.mesh.visible).toBe(false);
    // the leaf on the ground was never hers to take
    expect(h.item(LEAF.id).onGround).toBe(true);
    expect(h.item(LEAF.id).mesh.visible).toBe(true);
    expect(h.item(LEAF.id).gone).toBeFalsy();
  });

  it.each(LEAVES)('after she %s and comes back, her drop puts it down where she left it', (_name, leave) => {
    const h = carriedOff(leave);
    const stick = h.item(STICK.id);
    h.remotes.upsert(ROBIN, 2);
    h.apply(dropEv());
    expect(stick.onGround).toBe(true);
    expect(stick.holder).toBe(null);
    expect(stick.mesh.visible).toBe(true);
    expect(stick.gone).toBe(false);
    expect(stick.mesh.position.x).toBe(12);
    expect(stick.mesh.position.z).toBe(-7);
    expect(h.saveUntouched()).toBe(true);
  });

  it.each(LEAVES)('after she %s and comes back, her pick puts it back in her mouth', (_name, leave) => {
    const h = carriedOff(leave);
    const stick = h.item(STICK.id);
    h.remotes.upsert(ROBIN, 2);
    h.apply(pickEv());
    expect(stick.holder).toBe(h.partnerGroup());
    expect(stick.onGround).toBe(false);
    expect(stick.mesh.visible).toBe(true);
    expect(stick.gone).toBe(false);
    h.frame(2);
    expect(stick.mesh.visible).toBe(true);
  });

  it('a gone item ignores a bad drop and stays hidden', () => {
    const h = carriedOff(LEAVES[0][1]);
    const stick = h.item(STICK.id);
    h.remotes.upsert(ROBIN, 2);
    h.apply(dropEv({ pos: [9999, 0] }));
    h.apply(dropEv({ id: STRANGER }));
    expect(stick.mesh.visible).toBe(false);
    expect(stick.gone).toBe(true);
  });

  it('my own held item stays mine when a remote leaves', () => {
    const h = carryHarness();
    h.s.carry.mouth.held = { id: LEAF.id, kind: 'leaf' };
    h.items.hold(LEAF.id, h.s.cat);
    h.apply(pickEv());
    h.remotes.remove(PARTNER);
    expect(h.item(LEAF.id).holder).toBe(h.s.cat);
    expect(h.item(LEAF.id).mesh.visible).toBe(true);
  });

  it('no carry event pays points or writes the save', () => {
    const h = carryHarness();
    h.apply(pickEv());
    h.apply(dropEv());
    h.apply(pickEv({ itemId: LEAF.id }));
    h.apply(dropEv({ itemId: LEAF.id, pos: [0, 0] }));
    h.apply(pickEv());
    h.remotes.remove(PARTNER);
    expect(h.toasts).toEqual([]);
    expect(h.saveUntouched()).toBe(true);
  });

  it('a stand-in session without carry, or without bounds, ignores carry events', () => {
    const h = carryHarness();
    expect(() => h.applyRemoteEvent({ ...h.s, carry: undefined }, pickEv())).not.toThrow();
    expect(h.item(STICK.id).onGround).toBe(true);
    h.apply(pickEv());
    expect(() => h.applyRemoteEvent({ ...h.s, areaData: {} }, dropEv())).not.toThrow();
    expect(h.item(STICK.id).holder).toBe(h.partnerGroup());
  });

  // M6 — my walk-end 'drop' mark is for a thing I left somewhere. If my sister
  // then picks it up, it is hers to carry off: my pending drop is forgotten,
  // so no ghost of it is drawn at my spot on a later walk.
  it('a partner pick of a thing I set down clears my pending walk-end drop for it', () => {
    const h = carryHarness();
    const mouth = h.s.carry.mouth;
    mouth.dropped.set(STICK.id, { kind: 'stick', x: 12, z: -7, homeX: 5, homeZ: 0 });
    mouth.dropped.set(LEAF.id, { kind: 'leaf', x: 0, z: 0, homeX: -4, homeZ: 3 });
    h.apply(pickEv());
    expect(mouth.dropped.has(STICK.id)).toBe(false);
    expect(mouth.dropped.has(LEAF.id)).toBe(true); // the leaf she did not touch
    expect(walkEndMarks(mouth, 'park', 1).map((m) => m.mark.id)).toEqual([LEAF.id]);
    // her later drop of it never becomes a mark of mine
    h.apply(dropEv());
    expect(mouth.dropped.has(STICK.id)).toBe(false);
    expect(h.saveUntouched()).toBe(true);
    // an ignored pick (a stranger) forgets nothing
    h.apply(pickEv({ id: STRANGER, itemId: LEAF.id }));
    expect(mouth.dropped.has(LEAF.id)).toBe(true);
  });

  // R42 — a current build never puts a thing down on a raised deck (it would
  // land under the boards). A drop pos on one, from an older or odd client, is
  // ignored like an out-of-bounds one: the item stays in her mouth.
  describe('a partner drop onto a raised deck (R42)', () => {
    let seaside;
    beforeAll(async () => {
      vi.stubGlobal('document', {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => new Proxy({}, {
            get: (_target, key) => {
              if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
              if (key === 'createLinearGradient' || key === 'createRadialGradient') {
                return () => ({ addColorStop: () => {} });
              }
              return () => {};
            },
            set: () => true,
          }),
        }),
      });
      // Only the build needs the stub; the remote cats' name tags want no DOM.
      try {
        seaside = (await import('../src/world/seaside.js')).build(new THREE.Scene());
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('is ignored, without throwing; a drop on the sand still lands', () => {
      const h = carryHarness();
      h.s.areaData = { bounds: seaside.bounds, waters: seaside.waters };
      h.s.carry.onDeck = (x, z) => onAnyDeck(seaside.waters, x, z);
      h.apply(pickEv());
      const stick = h.item(STICK.id);
      for (const pos of [[30, -10], [23, -9], [22, -11.5]]) { // on the pier, its landward end, its corner
        expect(() => h.apply(dropEv({ pos }))).not.toThrow();
        expect(stick.onGround).toBe(false);
        expect(stick.holder).toBe(h.partnerGroup());
      }
      h.apply(dropEv({ pos: [18, -10] })); // the sand beside it
      expect(stick.onGround).toBe(true);
      expect(stick.mesh.position.x).toBe(18);
      expect(stick.mesh.position.z).toBe(-10);
      expect(h.toasts).toEqual([]);
      expect(h.saveUntouched()).toBe(true);
    });

    it('a session whose carry has no deck test (the den, a stand-in) places as before', () => {
      const h = carryHarness();
      h.s.areaData = { bounds: seaside.bounds };
      h.apply(pickEv());
      h.apply(dropEv({ pos: [30, -10] }));
      expect(h.item(STICK.id).onGround).toBe(true);
    });
  });

  it('the walk wires the take-it-with-you rule to its remote cats, outside the rival slice', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    const code = src.replace(/\/\/.*$/gm, '');
    expect(code.match(/takeHeldItemsWithRemotes\(remotes, carry\.items, cat\)/g)).toHaveLength(1);
    const call = code.indexOf('takeHeldItemsWithRemotes(remotes');
    expect(call).toBeGreaterThan(code.indexOf('const carry = {'));
    expect(call).toBeGreaterThan(code.indexOf('const remotes = createRemoteCats('));
    const rivalA = src.indexOf("The rival's border and its patrol");
    const rivalB = src.indexOf('session.rival = {', rivalA);
    const callInSrc = src.indexOf('takeHeldItemsWithRemotes(remotes');
    expect(callInSrc < rivalA || callInSrc > rivalB).toBe(true);
  });
});

// ===========================================================================
// v21 3b Task 10 — a co-walker knocked something off a ledge ('knock', sent by
// game/interactions.js). It comes down on my screen too, at the same fallTo,
// and stays down. No points, no feat, no save: points go to the player who did
// it. The same "got there first" toast a remote tip shows, when I was close.
// ===========================================================================
describe('applyRemoteEvent: knock', () => {
  const CUP = { id: 'docks-cup-1', kind: 'cup', x: 6, z: 4.3, y: 0.55, fallTo: { x: 6.6, z: 5.4 } };
  const CAN = { id: 'docks-can-1', kind: 'can', x: -19.6, z: -17, y: 1.3, fallTo: { x: -19.8, z: -18.3 } };

  function knockHarness({ catAt = [6.5, 4.5] } = {}) {
    const storage = fakeStorage();
    const progression = createProgression(storage);
    const toasts = [];
    const { applyRemoteEvent } = createNetEvents({
      MP: 1, getCloud: () => null, getPsecret: () => null,
      log: { awardOnce: () => { throw new Error('a remote knock must never award points'); } },
      hud: { toast: (text) => toasts.push(text) },
      audio: {}, samples: { has: () => false }, catVoice() {},
      applyGoalResult() { throw new Error('a remote knock must never touch a goal'); },
      getPartner: () => null,
    });
    const knockables = createKnockables(new THREE.Scene(), [CUP, CAN]);
    const s = {
      playerId: ME,
      cat: { position: new THREE.Vector3(catAt[0], 0, catAt[1]) },
      remotes: { list: [{ playerId: PARTNER, petName: 'Robin' }] },
      knockables,
    };
    const before = JSON.stringify(progression.state);
    const writesBefore = storage.writes();
    return {
      s, toasts, knockables,
      apply: (ev) => applyRemoteEvent(s, ev),
      applyTo: (session, ev) => applyRemoteEvent(session, ev),
      saveUntouched: () => JSON.stringify(progression.state) === before && storage.writes() === writesBefore,
    };
  }
  const knockEv = (o = {}) => ({ v: 1, id: PARTNER, type: 'knock', knockId: CUP.id, ...o });

  it('a remote knock knocks it down here and pays nothing', () => {
    const h = knockHarness();
    const [cup, can] = h.knockables.list;
    h.apply(knockEv());
    expect(cup.down).toBe(true);
    expect(can.down).toBe(false);
    // it falls to the same fallTo the sender's lands at, and stays
    for (let i = 0; i < 120; i++) h.knockables.update(1 / 60);
    expect(cup.group.position.x).toBeCloseTo(CUP.fallTo.x, 6);
    expect(cup.group.position.z).toBeCloseTo(CUP.fallTo.z, 6);
    // I was right there: the shipped snipe toast, once
    expect(h.toasts).toEqual(['Robin got there first!']);
    // a repeat (or an echo) changes nothing and toasts nothing
    h.apply(knockEv());
    expect(h.toasts).toHaveLength(1);
    expect(h.saveUntouched()).toBe(true);
  });

  it('far away, it still comes down, without a toast', () => {
    const h = knockHarness({ catAt: [30, 30] });
    h.apply(knockEv());
    expect(h.knockables.list[0].down).toBe(true);
    expect(h.toasts).toEqual([]);
  });

  it.each([['unknown', 'docks-cup-9'], ['number', 3], ['proto', '__proto__']])('a %s knock id is ignored', (_name, knockId) => {
    const h = knockHarness();
    expect(() => h.apply(knockEv({ knockId }))).not.toThrow();
    expect(h.knockables.list.every((e) => !e.down)).toBe(true);
    expect(h.toasts).toEqual([]);
    expect(h.saveUntouched()).toBe(true);
  });

  it.each([['missing', undefined], ['null', null], ['object', {}], ['constructor', 'constructor']])('a %s knock id is ignored too', (_name, knockId) => {
    const h = knockHarness();
    expect(() => h.apply(knockEv({ knockId }))).not.toThrow();
    expect(h.knockables.list.every((e) => !e.down)).toBe(true);
    expect(h.toasts).toEqual([]);
  });

  it('a session without knockables ignores a knock', () => {
    const h = knockHarness();
    expect(() => h.applyTo({ ...h.s, knockables: undefined }, knockEv())).not.toThrow();
    expect(h.toasts).toEqual([]);
  });
});
