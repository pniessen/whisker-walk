import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

// The Fairground's Viking boat (docs/superpowers/specs/2026-11-28-viking-boat-design.md):
// the swing as numbers (src/fairsim.js), drawn on the model world/fair.js built
// (src/fairlive.js), the two seats shared by two riders, and its one line a walk.

stubCanvasDocument();

const { build, BOAT_AT } = await import('../src/world/fair.js');
const { BOAT } = await import('../src/world/fairrides.js');
const { createFairSim, RIDE } = await import('../src/fairsim.js');
const { createFairLive, poseRides } = await import('../src/fairlive.js');
const { waterClearance } = await import('../src/world/builder.js');
const { propsFor, frameColliders } = await import('../src/propsets.js');
const { RIDE_TOASTS } = await import('../src/fairwords.js');
const { handleFairEvent } = await import('../src/game/fairplay.js');
const { createRides } = await import('../src/coop/rides.js');
const { noteBoatLap, BOAT_PAY_CAP } = await import('../src/game/fairplay.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');

const scene = new THREE.Scene();
const area = build(scene);
for (const f of propsFor('fair').flaps) for (const c of frameColliders(f)) area.colliders.push({ ...c });
scene.updateMatrixWorld(true);
const sim = createFairSim(area);
const small = createFairSim(area, { reducedMotion: true });
const env = { colliders: area.colliders, bounds: area.bounds, wet: (x, z, m) => waterClearance(area.waters, x, z) < m };
const LAP = RIDE.BOAT_WAIT + RIDE.BOAT_UP + RIDE.BOAT_HOLD + RIDE.BOAT_DOWN;
const lap = (f) => { for (let t = 0; t < LAP * 3; t += 0.05) f(t, 1000 + t); };
const [A, B] = sim.boat.list;
const gate = { x: BOAT_AT.x - 3.4, y: 0, z: BOAT_AT.z };

describe('the Viking boat: the swing', () => {
  it('stands still for the wait, builds, holds and settles, then stands again', () => {
    sim.setTime(0);
    const top = [];
    for (let t = 0; t < LAP; t += 0.02) { sim.setTime(t); top.push([t, Math.abs(sim.angles.boat), sim.boat.env]); }
    for (const [t, th] of top) if (t < RIDE.BOAT_WAIT) expect(th).toBe(0);
    const peak = Math.max(...top.map((r) => r[1]));
    expect(peak).toBeGreaterThan(RIDE.BOAT_AMP * 0.97);
    expect(peak).toBeLessThanOrEqual(RIDE.BOAT_AMP + 1e-9);
    expect(RIDE.BOAT_AMP).toBeLessThanOrEqual(0.55); // gentle: about 30 degrees
    sim.setTime(LAP + 1);
    expect(sim.angles.boat).toBe(0);
    // it never jumps: the angle moves by a small step between near moments
    let last = null;
    for (let t = 0; t < LAP; t += 0.01) { sim.setTime(t); if (last !== null) expect(Math.abs(sim.angles.boat - last)).toBeLessThan(0.02); last = sim.angles.boat; }
  });

  it('is a pure function of the clock, the same on a second sim', () => {
    const other = createFairSim(area);
    for (const t of [3.3, 11.7, 19.2, 25.01, 1000.5]) {
      sim.setTime(t); other.setTime(t);
      expect(other.angles.boat).toBe(sim.angles.boat);
      expect(other.boat.list[0].y).toBe(sim.boat.list[0].y);
    }
  });

  it('keeps every seat on its arc about the beam, off the ground and level with the hull', () => {
    const r0 = Math.hypot(A.ly, A.lz);
    lap((t) => {
      sim.setTime(t);
      for (const s of sim.boat.list) {
        expect(Math.hypot(s.y - BOAT.pivotY, s.z - sim.boat.cz)).toBeCloseTo(Math.hypot(s.ly, s.lz), 6);
        expect(s.y).toBeGreaterThan(0.5);
        expect(s.x).toBe(BOAT_AT.x);
      }
    });
    expect(r0).toBeGreaterThan(3.5);
  });

  it('swings the model with the numbers: the swing group turns about the beam', () => {
    for (const t of [9, 12.5, 14.3, 20]) {
      sim.setTime(t);
      poseRides(area.rides, sim);
      expect(area.rides.boat.swing.rotation.x).toBe(sim.angles.boat);
    }
    sim.setTime(0);
    poseRides(area.rides, sim);
    expect(area.rides.boat.swing.rotation.x).toBe(0);
  });

  it('swings less with reduced motion, and never lays an ear back', () => {
    let big = 0, little = 0, ears = 0, earsSmall = 0;
    lap((t) => {
      sim.setTime(t); small.setTime(t);
      big = Math.max(big, Math.abs(sim.angles.boat)); little = Math.max(little, Math.abs(small.angles.boat));
      if (sim.boat.list[0].ears) ears++;
      if (small.boat.list[0].ears) earsSmall++;
    });
    expect(little).toBeLessThan(big * 0.5);
    expect(little).toBeGreaterThan(0.1);
    expect(earsSmall).toBe(0);
    expect(ears).toBeGreaterThan(10); // at the top of a swing, on a ride that is going
    sim.setTime(2); // standing still: ears up
    expect(A.ears).toBe(false);
  });
});

describe('the Viking boat: climbing aboard and getting off', () => {
  it('boards from the stage round it while it stands, and not while it swings', () => {
    let boardable = 0, swinging = 0;
    lap((t) => {
      sim.setTime(t);
      const j = sim.jumpTarget(gate, null, null, 0, null);
      if (sim.boat.calm) { expect(j?.type).toBe('board'); expect(j.seat.rideId).toBe('boat'); boardable++; }
      else { expect(j?.seat?.rideId).not.toBe('boat'); swinging++; }
    });
    expect(boardable).toBeGreaterThan(100);
    expect(swinging).toBeGreaterThan(100);
  });

  it('is calm for the whole wait, so a child has the time to climb aboard', () => {
    for (let t = 0; t < RIDE.BOAT_WAIT; t += 0.1) { sim.setTime(t); expect(sim.boat.calm).toBe(true); }
    sim.setTime(RIDE.BOAT_WAIT + RIDE.BOAT_UP / 2);
    expect(sim.boat.calm).toBe(false);
  });

  it('does not board from far off, from up on a roof, or from the far side of the coaster', () => {
    sim.setTime(1);
    expect(sim.jumpTarget({ x: BOAT_AT.x + 12, y: 0, z: BOAT_AT.z }, null, null, 0, null)?.seat?.rideId).not.toBe('boat');
    expect(sim.jumpTarget({ x: gate.x, y: 1.6, z: gate.z }, null, null, 0, null)?.seat?.rideId).not.toBe('boat');
    expect(sim.jumpTarget({ x: 21, y: 0, z: 14 }, null, null, 0, null)?.seat?.rideId).not.toBe('boat');
  });

  it('seats two: the second cat gets the other bench, never the one that is taken', () => {
    sim.setTime(1);
    const first = sim.jumpTarget({ x: gate.x, y: 0, z: BOAT_AT.z - 1 }, null, null, 0, null).seat;
    const second = sim.jumpTarget({ x: gate.x, y: 0, z: BOAT_AT.z - 1 }, null, null, 0, first).seat;
    expect(second.rideId).toBe('boat');
    expect(second).not.toBe(first);
    expect(new Set([first.id, second.id]).size).toBe(2);
    expect(first.id).toMatch(/^boat-seat-[01]$/);
  });

  it('lets her off at every moment of the lap, onto free ground in the walk, never under the swing', () => {
    lap((t) => {
      sim.setTime(t);
      for (const s of sim.boat.list) {
        expect(sim.jumpTarget(s, s, null, 0, null).type).toBe('off');
        const to = sim.dismountSpot(s, null, env);
        expect(to.ok).toBe(true);
        expect(sim.free(to.x, to.z, env)).toBe(true);
        expect(sim.swept(to.x, to.z)).toBe(false);
      }
    });
  });

  it('is clear of the track, the station, the paths and the other rides', () => {
    for (const p of area.rides.coaster.track.points) {
      expect(Math.abs(p.x - BOAT_AT.x) > 5 || Math.abs(p.z - BOAT_AT.z) > 7.5).toBe(true);
    }
    for (const c of area.colliders) {
      if (c.x === BOAT_AT.x || Math.abs(c.x - BOAT_AT.x) > 12 || Math.abs(c.z - BOAT_AT.z) > 12) continue;
      expect(Math.hypot(c.x - BOAT_AT.x, c.z - BOAT_AT.z) > 2.5 || c.r < 1).toBe(true);
    }
  });

  it('puts cat two on the other bench through the same rules, and off the same way', () => {
    const live = createFairLive(new THREE.Scene(), area, { now: () => 1 });
    live.sim.setTime(1);
    const two = createRides();
    const s = { fair: live, areaData: area, ground: { flat: true }, reducedMotion: false };
    const body = { position: new THREE.Vector3(gate.x, 0, BOAT_AT.z + 1), rotation: new THREE.Euler() };
    const mover = { body, player: { perchY: 0, inputActive: false, halt() {} } };
    two.attach(s);
    expect(two.jump(s, mover)).toBe(true);
    expect(two.seat.rideId).toBe('boat');
    two.frame(0.016, s, mover);
    expect(body.position.y).toBeCloseTo(two.seat.y, 5);
    expect(two.busy).toBe(true);
  });
});

describe('the Viking boat: one line a walk, no page, no journal', () => {
  it('says its line once a walk and writes nothing to the journal or the log', () => {
    const said = [];
    const hud = { toast: (t) => said.push(t) };
    const seen = new Set();
    const once = (k, t) => { if (!seen.has(k)) { seen.add(k); hud.toast(t); } };
    const log = { count: () => { throw new Error('the log is not touched'); }, mark: () => { throw new Error('nor marked'); } };
    const progression = { state: {}, recordSighting: () => { throw new Error('nor the journal'); } };
    for (let i = 0; i < 3; i++) handleFairEvent({ type: 'ride', ride: 'boat' }, { hud, audio: {}, log, progression, session: {}, once });
    expect(said).toEqual([RIDE_TOASTS.boat()]);
    expect(said[0].length).toBeLessThan(80);
    expect(said[0]).not.toMatch(/clan|warrior|kill|fight|crash|fall|scary/i);
  });

  it('plays a creak and a whoosh through the existing audio helpers, and is quiet without them', () => {
    const calls = [];
    const audio = { creak: (v) => calls.push(['creak', v]), pounceWhoosh: () => calls.push(['whoosh']) };
    handleFairEvent({ type: 'boat-creak', volume: 0.4 }, { hud: {}, audio, log: {}, progression: {} });
    handleFairEvent({ type: 'boat-whoosh', volume: 0.4 }, { hud: {}, audio, log: {}, progression: {} });
    expect(calls).toEqual([['creak', 0.4], ['whoosh']]);
    expect(() => handleFairEvent({ type: 'boat-creak', volume: 1 }, { hud: {}, audio: {}, log: {}, progression: {} })).not.toThrow();
  });

  it('sounds only near the boat, and only while it swings', () => {
    const events = [];
    const T0 = RIDE.BOAT_WAIT + RIDE.BOAT_UP + 1; // well into the swing
    let T = T0;
    const live = createFairLive(new THREE.Scene(), area, { now: () => T, onEvent: (e) => events.push(e) });
    const cat = new THREE.Object3D();
    const player = { perchY: 0, halt() {}, inputActive: false };
    const session = { perched: null };
    cat.position.set(gate.x, 0, gate.z);
    for (let k = 0; k < 40; k++) { T = T0 + k * 0.2; live.update(0.2, T, { cat, player, session }); }
    const heard = events.filter((e) => e.type.startsWith('boat-'));
    expect(heard.length).toBeGreaterThan(4);
    expect(heard.some((e) => e.type === 'boat-creak')).toBe(true);
    expect(heard.some((e) => e.type === 'boat-whoosh')).toBe(true);
    for (const e of heard) { expect(e.volume).toBeGreaterThan(0); expect(e.volume).toBeLessThanOrEqual(1); }
    events.length = 0;
    cat.position.set(-30, 0, 30); // far across the fair
    for (let k = 0; k < 40; k++) { T = T0 + 9 + k * 0.2; live.update(0.2, T, { cat, player, session }); }
    expect(events.filter((e) => e.type.startsWith('boat-'))).toEqual([]);
    live.dispose();
  });
});

describe('the Viking boat: paws for a ride', () => {
  const mkLog = () => { const pts = { n: 0 }; return { pts, log: createDiscoveryLog({ addPoints: (p) => { pts.n += p; } }) }; };
  it('raises one boat-lap event per swing ridden to the end, and none when she gets off early or never boards', () => {
    const events = [];
    let T = 0;
    const live = createFairLive(new THREE.Scene(), area, { now: () => T, onEvent: (e) => events.push(e) });
    const cat = new THREE.Object3D();
    const player = { perchY: 0, halt() {}, inputActive: false };
    const session = { perched: null };
    cat.position.set(gate.x, 0, gate.z);
    const run = (from, to, aboard) => { for (T = from; T < to; T += 0.1) { session.perched = aboard ? live.sim.boat.list[0] : null; live.update(0.1, T, { cat, player, session }); } };
    run(0, LAP * 2, false); // never aboard
    expect(events.filter((e) => e.type === 'boat-lap')).toEqual([]);
    const start = LAP * 2 + 1; // calm, a lap's wait
    run(start, start + RIDE.BOAT_WAIT + RIDE.BOAT_UP + 3, true);
    run(start + RIDE.BOAT_WAIT + RIDE.BOAT_UP + 3, start + LAP * 1 + 1, false); // got off mid swing
    expect(events.filter((e) => e.type === 'boat-lap')).toEqual([]);
    const s2 = LAP * 4 + 1;
    run(s2, s2 + LAP - 1 + RIDE.BOAT_WAIT, true); // aboard for a whole swing
    expect(events.filter((e) => e.type === 'boat-lap').length).toBe(1);
    live.dispose();
  });

  it('pays AWARDS.boatride for the first two rides of a walk, then nothing', () => {
    const { pts, log } = mkLog();
    const paid = [];
    for (let i = 0; i < 5; i++) paid.push(noteBoatLap({ log }));
    expect(paid).toEqual([AWARDS.boatride, AWARDS.boatride, 0, 0, 0]);
    expect(pts.n).toBe(AWARDS.boatride * BOAT_PAY_CAP);
    expect(AWARDS.boatride).toBeGreaterThanOrEqual(3);
    expect(AWARDS.boatride).toBeLessThanOrEqual(8);
  });

  it('is paid through the fair event, once each swing, and a walk picked up again does not pay the same ones twice', () => {
    const { pts, log } = mkLog();
    const hud = { toast: () => {} };
    for (let i = 0; i < 3; i++) handleFairEvent({ type: 'boat-lap' }, { hud, audio: {}, log, progression: {} });
    expect(pts.n).toBe(AWARDS.boatride * 2);
    const { pts: p2, log: l2 } = mkLog();
    l2.restore(log.entries());
    handleFairEvent({ type: 'boat-lap' }, { hud, audio: {}, log: l2, progression: {} });
    expect(p2.n).toBe(0);
  });

  it('pays each rider on her own log: a partner is credited separately, never negative or NaN', () => {
    const a = mkLog(), b = mkLog();
    noteBoatLap({ log: a.log });
    expect(b.pts.n).toBe(0);
    noteBoatLap({ log: b.log }); noteBoatLap({ log: b.log });
    expect([a.pts.n, b.pts.n]).toEqual([AWARDS.boatride, AWARDS.boatride * 2]);
    for (const n of [a.pts.n, b.pts.n]) { expect(Number.isFinite(n)).toBe(true); expect(n).toBeGreaterThanOrEqual(0); }
  });
});
