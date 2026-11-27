import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

vi.stubGlobal('document', canvasStub);

const { createHouseWingFinds } = await import('../src/world/housewingfinds.js');
const { HOUSE_WING_FINDS, HOUSE_WING_SLOTS } = await import('../src/world/housewingthings.js');
const { FIND_KEY } = await import('../src/world/housefinds.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { HOUSE_LEDGES } = await import('../src/world/houseplan.js');
const { build } = await import('../src/world/house.js');
const { createHouseLife } = await import('../src/world/houselife.js');
const { phrase } = await import('../src/clanphrases.js');
const { withOffWords } = await import('./helpers/offwords.js');

// =============================================================================
// The Old House's east wing, milestone 2: the eight discoveries at run time, paid through a real
// discovery log (type housewing, 8 each, once a walk). The cat is a point moved frame by frame.
// =============================================================================

const DT = 1 / 60;
const FIND = Object.fromEntries(HOUSE_WING_FINDS.map((f) => [f.id, f]));
const ledge = (id) => HOUSE_LEDGES.find((l) => l.id === id);

function setup({ reducedMotion = false } = {}) {
  const paid = { points: 0, lines: [], types: [] };
  const base = createDiscoveryLog({ addPoints: (n) => { paid.points += n; }, recordFeat: (t) => paid.types.push(t) });
  const log = { awardOnce: (type, key, label) => { const n = base.awardOnce(type, key, label); if (n > 0) paid.lines.push([type, key, label]); return n; } };
  base.startWalk();
  const calls = { purr: [], musicBoxNote: [], chime: [] };
  const audio = Object.fromEntries(Object.keys(calls).map((k) => [k, (...a) => calls[k].push(a)]));
  const f = createHouseWingFinds({ finds: HOUSE_WING_FINDS, slots: HOUSE_WING_SLOTS, log, audio, reducedMotion });
  const cat = new THREE.Vector3();
  let t = 0;
  const step = (x, y, z) => { cat.set(x, y, z); t += DT; f.update(DT, t, cat); };
  const stay = (x, y, z, s) => { for (let i = 0; i < Math.round(s / DT); i++) step(x, y, z); };
  return { f, paid, calls, step, stay, base };
}
const keys = (paid) => paid.lines.map((l) => l[1]);

describe('the east wing\'s discoveries', () => {
  it('there are eight, paying 8 each under their own type, and each has a line in both word sets', () => {
    expect(AWARDS.housewing).toBe(8);
    expect(HOUSE_WING_FINDS.map((f) => f.id)).toEqual(['sofa', 'fishtank', 'sunslot', 'sunall', 'bathtub', 'tap', 'bunk', 'fort']);
    for (const id of HOUSE_WING_FINDS.map((f) => f.id)) {
      expect(phrase(`house.find.${id}`, 'kids').length, id).toBeGreaterThan(0);
      withOffWords(() => expect(phrase(`house.find.${id}`, 'kids').length, id).toBeGreaterThan(0));
    }
  });

  it('the sofa: still on the seat 3 s pays once; from the floor in front, or moving, it does not', () => {
    const { step, stay, paid, f } = setup();
    const s = FIND.sofa;
    stay(s.x, 0, s.z + 1, 5); // the floor in front
    expect(paid.lines).toEqual([]);
    for (let i = 0; i < 240; i++) step(s.x + (i % 2) * 0.05, 0.55, s.z); // fidgeting about 3 m/s: not still
    expect(paid.lines).toEqual([]);
    stay(s.x, 0.55, s.z, 2.9);
    expect(paid.lines).toEqual([]);
    stay(s.x, 0.55, s.z, 0.3);
    expect(keys(paid)).toEqual([FIND_KEY('sofa')]);
    expect(paid.lines[0][0]).toBe('housewing');
    expect(paid.points).toBe(8);
    stay(s.x, 0.55, s.z, 8);
    expect(paid.lines.length).toBe(1);
    expect(f.watching).toBe(1);
  });

  it('the tank and the tap pay after a 1 s stay, the fort after 1.5 s', () => {
    const { stay, paid } = setup();
    stay(FIND.fishtank.x, 0, FIND.fishtank.z, 0.9);
    expect(paid.lines).toEqual([]);
    stay(FIND.fishtank.x, 0, FIND.fishtank.z, 0.2);
    stay(FIND.tap.x, 2.4, FIND.tap.z, 1.1);
    stay(FIND.fort.x, 2.4, FIND.fort.z, 1.4);
    expect(keys(paid)).toEqual([FIND_KEY('fishtank'), FIND_KEY('tap')]);
    stay(FIND.fort.x, 2.4, FIND.fort.z, 0.2);
    expect(keys(paid)).toEqual([FIND_KEY('fishtank'), FIND_KEY('tap'), FIND_KEY('fort')]);
  });

  it('the tub\'s rim and the top bunk pay on arriving on their ledges', () => {
    const { step, paid } = setup();
    const tub = ledge('bath-tub');
    const bunk = ledge('kids-bunk-top');
    step(FIND.bathtub.x, tub.y - 0.6, FIND.bathtub.z);
    expect(paid.lines).toEqual([]);
    step(FIND.bathtub.x, tub.y, FIND.bathtub.z);
    step(FIND.bunk.x, bunk.y, FIND.bunk.z);
    expect(keys(paid)).toEqual([FIND_KEY('bathtub'), FIND_KEY('bunk')]);
  });

  it('a slot: still in it 4 s pays sunslot once and calms the room; all four in one walk pay sunall', () => {
    const { f, stay, step, paid, calls } = setup();
    const [a, b, c, d] = HOUSE_WING_SLOTS;
    stay(a.x, 0, a.z, 3.9);
    expect(paid.lines).toEqual([]);
    expect(f.calm).toBe(true); // lying still more than a second
    stay(a.x, 0, a.z, 0.2);
    expect(keys(paid)).toEqual([FIND_KEY('sunslot')]);
    step(b.x + 3, 0, b.z + 3); // stirs
    expect(f.calm).toBe(false);
    stay(b.x, 0, b.z, 4.2);
    stay(c.x, 0, c.z, 4.2);
    expect(keys(paid)).toEqual([FIND_KEY('sunslot')]);
    expect(f.slotsLain).toBe(0b0111);
    stay(d.x, 0, d.z, 4.2);
    expect(keys(paid)).toEqual([FIND_KEY('sunslot'), FIND_KEY('sunall')]);
    expect(paid.points).toBe(16);
    expect(calls.chime.length).toBe(1);
    expect(calls.purr.length).toBeGreaterThanOrEqual(4);
  });

  it('a walk picked up again pays nothing twice (the log\'s entries come back)', () => {
    const first = setup();
    first.stay(FIND.fishtank.x, 0, FIND.fishtank.z, 1.2);
    const entries = first.base.entries();
    const second = setup();
    second.base.restore(entries);
    second.stay(FIND.fishtank.x, 0, FIND.fishtank.z, 1.2);
    expect(second.paid.lines).toEqual([]);
  });

  it('a partner\'s hold pays this child too, and a slot they lie in counts', () => {
    const { f, step, paid } = setup();
    const partner = { group: { position: new THREE.Vector3(FIND.tap.x, 2.4, FIND.tap.z) }, water: { placed: true } };
    const list = [partner];
    const cat = new THREE.Vector3(0, 0, 0);
    let t = 0;
    for (let i = 0; i < 90; i++) { t += DT; f.update(DT, t, cat, list); }
    expect(keys(paid)).toEqual([FIND_KEY('tap')]);
    expect(f.watching).toBe(2);
    expect(f.watchersMade).toBe(2);
    expect(step).toBeTypeOf('function');
  });

  it('update allocates nothing per frame once watchers exist (the same list, no find made)', () => {
    const { f } = setup();
    const cat = new THREE.Vector3(0, 0, 0);
    f.update(DT, DT, cat);
    const made = f.watchersMade;
    for (let i = 0; i < 600; i++) f.update(DT, (i + 2) * DT, cat);
    expect(f.watchersMade).toBe(made);
  });

  it('under reduced motion the lit patch holds steady while she lies in it', () => {
    const calm = setup({ reducedMotion: true });
    const s = HOUSE_WING_SLOTS[0];
    calm.stay(s.x, 0, s.z, 2);
    expect(calm.f.pulse(0.3)).toBe(calm.f.pulse(1.7));
    const moving = setup();
    moving.stay(s.x, 0, s.z, 2);
    expect(moving.f.pulse(0.3)).not.toBe(moving.f.pulse(1.7));
  });
});

describe('the wing\'s finds, in the walk\'s house life', () => {
  it('house life runs them, and paints the sun gold by day and pale blue at dusk', () => {
    for (const dusk of [false, true]) {
      const scene = new THREE.Scene();
      const record = build(scene);
      expect(record.house.wingFinds).toBe(HOUSE_WING_FINDS);
      expect(record.house.sun.geometry.getIndex().count / 3).toBeLessThanOrEqual(40);
      const life = createHouseLife(scene, record.house, { colliders: record.colliders, dusk, log: null });
      const c = record.house.sun.material.color;
      expect(dusk ? c.b > c.r : c.r > c.b).toBe(true);
      life.dispose();
    }
  });
});

describe('the award, the goal and the save', () => {
  it('the toast is the find\'s own line, and the goal is the house\'s alone', async () => {
    const { discoveryText } = await import('../src/ui/hud.js');
    const { GOAL_POOL, goalFits, createGoals } = await import('../src/goals.js');
    const { HOUSE_GOAL_TYPES } = await import('../src/world/housethings.js');
    expect(discoveryText({ type: 'housewing', label: 'A cat in the tub, and no water! 🛁' })).toBe('A cat in the tub, and no water! 🛁');
    const goal = GOAL_POOL.find((g) => g.type === 'housewing');
    expect(goal).toMatchObject({ id: 'house-wing', text: 'Find 2 things in the new rooms', target: 2 });
    expect(goalFits(goal, { goalTypes: HOUSE_GOAL_TYPES })).toBe(true);
    expect(goalFits(goal, { goalTypes: ['photo'] })).toBe(false);
    expect(goalFits(goal, { tippables: [1, 2, 3] })).toBe(false); // an area with no list
    expect(goalFits(goal, undefined)).toBe(false);
    for (let seed = 1; seed < 40; seed++) {
      let n = seed;
      const rng = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
      expect(createGoals(rng, { tippables: [1, 2, 3, 4], boxes: [1] }).goals.map((g) => g.id)).not.toContain('house-wing');
    }
  });

  it('feats.housewing is a lifetime tally that round-trips, and an old save reads 0', async () => {
    const { createProgression } = await import('../src/progression.js');
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    const p = createProgression(storage);
    expect(p.state.feats.housewing ?? 0).toBe(0);
    p.recordFeat('housewing');
    p.recordFeat('housewing');
    expect(p.state.feats.housewing).toBe(2);
    p.save?.();
    const again = createProgression(storage);
    expect(again.state.feats.housewing).toBe(2);
  });
});
