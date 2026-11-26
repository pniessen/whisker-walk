import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const L = await import('../src/world/greenhouselife.js');
const P = await import('../src/world/greenhouseplan.js');
const { build } = await import('../src/world/greenhouse.js');
const { createTippables } = await import('../src/tippables.js');
const { planFind, roomFindRoster, findsAgreed } = await import('../src/foundwear/rules.js');
const { FIND_KEY } = await import('../src/foundwear/spots/index.js');
const { COOP_READY } = await import('../src/coop/table.js');
const { mulberry32 } = await import('../src/rng.js');

// Two screens in the Greenhouse (G4): the gate itself refuses a room (test/teleport.test.js) and couch play stays out while its COOP_READY
// row is false, so this is the data a later room walk will rely on, checked now: both devices derive the same seed packets and the same
// thirsty pots from the room's seed, a knocked can goes over on both by its id (tipById), and the hat's find is the same spot only when
// the whole room carries the same finds key.

const make = (o = {}) => {
  const scene = new THREE.Scene();
  const area = build(scene);
  const life = area.life({ reducedMotion: false, ...o });
  return { scene, area, life };
};

describe('the same room seed, the same packets and the same pots', () => {
  it('two devices with one room seed lie the same five packets and droop the same four pots', () => {
    for (const roomSeed of [1, 8123, 424242, 0xdeadbeef]) {
      const a = make({ roomSeed, visits: 0 }); // her device
      const b = make({ roomSeed, visits: 17 }); // her partner's, a different walk count: a room's seed ignores it
      expect(a.life.state.set).toEqual(b.life.state.set);
      expect(a.life.state.thirsty).toEqual(b.life.state.thirsty);
      expect(L.seedSetIndex(roomSeed, 0)).toBe(L.seedSetIndex(roomSeed, 17));
      expect(a.life.state.thirsty).toEqual(L.thirstyPots(roomSeed, 0));
    }
  });
  it('the seed sets and pot sets the stage-A build offers are the three and the eight it always had (stage B only appends new sets)', () => {
    expect(P.SEED_SPOT_SETS).toHaveLength(3);
    expect(P.WATER_POT_SPOTS).toHaveLength(8);
    const seen = new Set();
    for (let s = 1; s < 400; s++) seen.add(L.seedSetIndex(s, 0));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });
});

describe('a knocked can goes over on both screens, by id', () => {
  it('the tippables are numbered by their place in the list, so a tip event reaches the same can on the partner\'s screen', () => {
    const a = make();
    const b = make();
    const sa = new THREE.Scene();
    const sb = new THREE.Scene();
    const ta = createTippables(sa, a.area.tippables);
    const tb = createTippables(sb, b.area.tippables);
    const cans = a.area.tippables.map((t, i) => [t, i]).filter(([t]) => t.kind === 'can');
    expect(cans.length).toBe(2);
    for (const [spot, i] of cans) {
      const e = ta.list?.[i] ?? ta.nearest(new THREE.Vector3(spot.x, 0, spot.z), 0.5);
      expect(e.id).toBe(`tip-${i}`);
      expect(ta.tip(e)).toBe(true); // her paw knocks it over
      expect(tb.tipById(e.id)).toBe(true); // the event arrives: the same can goes over on his screen
      expect(tb.tipById(e.id)).toBe(false); // and only once
      expect(tb.nearest(new THREE.Vector3(spot.x, 0, spot.z), 0.5)).toBeNull(); // nothing left standing there
    }
    // a can is not a pot: the other four are still standing on both
    expect(tb.nearest(new THREE.Vector3(12.5, 0, 17.6), 0.5)).not.toBeNull();
  });
});

describe('the gardener\'s hat is found on both screens or on none', () => {
  const seed = 987654321;
  it('a room that carries one finds key gets one spot, the same for both; a partner on another key gets none', () => {
    const mine = planFind({ areaId: 'greenhouse', seed, roster: roomFindRoster([{ playerId: 'ben', finds: FIND_KEY }], 'me') });
    const his = planFind({ areaId: 'greenhouse', seed, roster: roomFindRoster([{ playerId: 'me', finds: FIND_KEY }], 'ben') });
    expect(mine).not.toBeNull();
    expect(mine.areaId).toBe('greenhouse');
    expect(his).toEqual(mine);
    expect(mine.spot.id).toMatch(/^fw-greenhouse-\d+$/);
    expect(planFind({ areaId: 'greenhouse', seed, roster: roomFindRoster([{ playerId: 'ben', finds: FIND_KEY ^ 1 }], 'me') })).toBeNull();
    expect(findsAgreed(roomFindRoster([{ playerId: 'ben', finds: FIND_KEY ^ 1 }], 'me'))).toBe(false);
    expect(findsAgreed(roomFindRoster([{ playerId: 'ben', finds: FIND_KEY }], 'me'))).toBe(true);
  });
  it('every seed picks one of the twelve spots, and across seeds all twelve are used', () => {
    const rnd = mulberry32(7);
    const used = new Set();
    for (let i = 0; i < 600; i++) used.add(planFind({ areaId: 'greenhouse', seed: Math.floor(rnd() * 2 ** 32) }).spot.id);
    expect(used.size).toBe(12);
  });
  it('couch play and rooms stay out until the Greenhouse is ready for two (the table says so)', () => {
    expect(COOP_READY.greenhouse).toBe(false);
  });
});
