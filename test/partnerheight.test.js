import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// A co-walker at her real height (partner-height, 2026-11-20). Until then the
// 8 Hz state carried only [x, z], and the partner's screen drew her on the
// ground under her perch, roof or ride seat: inside the merry-go-round's
// platform, under the coaster's track. Now the state carries `h` (metres up)
// and, on a ride, `seat` (src/remotecats.js liftForState); the partner's
// screen draws her on that seat where its own rides have it (the rides are a
// pure function of the time), so she moves with the horse every frame.
// Old builds: net.js reads only the fields it knows, so an older device takes
// the new message and draws her on the ground, and a message from an older
// device has neither field and is drawn on the ground here.

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build } = await import('../src/world/fair.js');
const { RIDE } = await import('../src/fairsim.js');
const { createFairLive, NO_FAIR } = await import('../src/fairlive.js');
const { propsFor, frameColliders } = await import('../src/propsets.js');
const { CAT_RADIUS } = await import('../src/player.js');
const { stickTakesOff } = await import('../src/climbing.js');
const { createRemoteCats, liftForState, MAX_LIFT } = await import('../src/remotecats.js');
const { createNet, createFakeHub } = await import('../src/net.js');
const { FLAT_GROUND } = await import('../src/ground.js');

const scene = new THREE.Scene();
const area = build(scene);
for (const f of propsFor('fair').flaps) for (const c of frameColliders(f)) area.colliders.push({ ...c });
scene.updateMatrixWorld(true);
const DT = 1 / 30;
const PROFILE = { playerId: 'her', petName: 'Mittens', breed: 'tabby', accessories: {} };
const OLD_FIELDS = ['v', 'id', 'pos', 'yaw', 'pose', 'speed', 'toy'];

// Two devices at the Fairground on one clock (the time of day). Hers rides;
// the partner's draws her from the states she sends, 8 a second, as main.js
// sends them. `send(state)` is the wire: the default keeps every field (a new
// partner), and a test can strip the new ones (an old sender).
function pair({ T = 5000, at, wire = (s) => s } = {}) {
  const clock = { T };
  const hers = createFairLive(scene, area, { now: () => clock.T });
  const theirs = createFairLive(scene, area, { now: () => clock.T });
  const cat = new THREE.Group();
  cat.position.set(at.x, at.y ?? 0, at.z);
  const player = { perchY: at.y ?? 0, inputActive: false, speed: 0, halt() {}, setViewYaw() {}, inputDirection: () => new THREE.Vector3() };
  const session = { perched: at.perch ?? null, cat };
  const ctx = { cat, player, session };
  const remotes = createRemoteCats(new THREE.Scene());
  remotes.upsert(PROFILE, 0);
  let now = 0;
  let sendAt = 0;
  const sent = [];
  function frame() {
    clock.T += DT;
    now += DT;
    hers.update(DT, clock.T, ctx);
    if (stickTakesOff(session, player.inputActive)) { session.perched = null; player.perchY = 0; }
    hers.late(DT, clock.T, ctx);
    if (now >= sendAt) {
      sendAt = now + 0.125;
      const state = { v: 1, id: 'her', pos: [cat.position.x, cat.position.z], yaw: cat.rotation.y, pose: session.perched ? 'perch' : 'follow', speed: 0, toy: null, ...liftForState(player.perchY, hers.riding) };
      sent.push(state);
      remotes.applyState(wire(state), now);
    }
    theirs.update(DT, clock.T, { cat: new THREE.Group(), player: { perchY: 0 }, session: { perched: null } });
    remotes.update(DT, now, null, theirs);
  }
  const drawn = () => remotes.list[0].group;
  const run = (s) => { for (let i = 0; i < Math.round(s / DT); i++) frame(); };
  function jumpWhenInReach(max = 60) {
    for (let i = 0; i < max / DT; i++) { if (hers.jump(ctx) && hers.riding) return true; frame(); }
    return false;
  }
  return { hers, theirs, cat, player, session, ctx, remotes, frame, run, drawn, sent, jumpWhenInReach, clock };
}

// Rides along `seconds` and measures, every frame once she has settled: how
// far the drawn cat is from her seat on the partner's screen, and how much
// further she moved in one frame than the seat did (a jitter).
function ride(p, seconds) {
  let off = 0;
  let jerk = 0;
  const prev = new THREE.Vector3();
  const prevSeat = new THREE.Vector3();
  p.run(0.3);
  for (let i = 0; i < seconds / DT; i++) {
    prev.copy(p.drawn().position);
    const s0 = p.theirs.seatById(p.hers.riding.id);
    prevSeat.set(s0.x, s0.y, s0.z);
    p.frame();
    const s = p.theirs.seatById(p.hers.riding.id);
    const g = p.drawn().position;
    off = Math.max(off, Math.hypot(g.x - s.x, g.y - s.y, g.z - s.z));
    jerk = Math.max(jerk, Math.abs(prev.distanceTo(g) - prevSeat.distanceTo(new THREE.Vector3(s.x, s.y, s.z))));
  }
  return { off, jerk };
}

describe('her height on the wire', () => {
  it('sends nothing new on the ground, her height on a perch, and the seat on a ride (never the slide)', () => {
    expect(liftForState(0, null)).toEqual({});
    expect(liftForState(0.001, null)).toEqual({});
    expect(liftForState(0.854, null)).toEqual({ h: 0.85 });
    expect(liftForState(1e6, null)).toEqual({ h: MAX_LIFT });
    expect(liftForState(NaN, null)).toEqual({});
    expect(liftForState(1.38, { id: 'mgr-horse-3', rideId: 'mgr' })).toEqual({ h: 1.38, seat: 'mgr-horse-3' });
    expect(liftForState(5.2, { id: 'slide-chute', rideId: 'slide' })).toEqual({ h: 5.2 });
  });

  it('goes through the room unchanged and stays small; the fields an old build reads keep their shape', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { ...PROFILE, playerId: 'aaa' });
    await b.join('AB23', { ...PROFILE, playerId: 'bbb' });
    const seen = [];
    b.onState((s) => seen.push(s));
    const plain = { v: 1, id: 'aaa', pos: [1.5, -2.25], yaw: 0.3, pose: 'perch', speed: 0, toy: null };
    const lifted = { ...plain, ...liftForState(1.38, { id: 'coaster-car-3', rideId: 'coaster' }) };
    a.sendState(lifted);
    expect(seen).toEqual([lifted]);
    for (const k of OLD_FIELDS) expect(lifted[k]).toEqual(plain[k]);
    expect(JSON.stringify(lifted).length - JSON.stringify(plain).length).toBeLessThanOrEqual(40); // a few dozen bytes, 8 a second
  });
});

describe('the partner’s screen draws her where she is', () => {
  it('on the merry-go-round: on the platform, then on a horse, moving with it every frame', () => {
    const p = pair({ at: { x: 0, z: sim0().mgr.baseR + CAT_RADIUS + 0.2 } });
    p.frame();
    expect(p.hers.jump(p.ctx)).toBe(true);
    expect(p.hers.riding.seatKind).toBe('deck');
    let r = ride(p, 1.5);
    expect(r.off).toBeLessThan(1e-6);
    expect(p.drawn().position.y).toBeCloseTo(p.hers.riding.y, 6);
    p.hers.jump(p.ctx);
    expect(p.hers.riding.seatKind).toBe('horse');
    r = ride(p, 4);
    expect(r.off).toBeLessThan(1e-6); // on the horse, rising and falling with it
    expect(r.jerk).toBeLessThan(1e-6);
    expect(p.drawn().position.y).toBeGreaterThan(1);
  });

  it('in a coaster car, the whole way round', () => {
    const plat = sim0().coaster.platform;
    const p = pair({ T: RIDE.COASTER_LAP * 200 + 1, at: { ...plat, perch: plat } });
    p.frame();
    expect(p.hers.jump(p.ctx)).toBe(true);
    expect(p.hers.riding.seatKind).toBe('car');
    const r = ride(p, RIDE.COASTER_LAP - 3);
    expect(r.off).toBeLessThan(1e-6);
    expect(r.jerk).toBeLessThan(1e-6);
    // and over the hill she was high up on his screen too
    expect(p.sent.some((s) => s.h > 6)).toBe(true);
  });

  it('in a big wheel gondola, from the boarding deck', () => {
    const step = sim0().wheel.step;
    const p = pair({ T: 7000, at: { ...step, perch: step } });
    expect(p.jumpWhenInReach(RIDE.WHEEL_TURN)).toBe(true);
    expect(p.hers.riding.seatKind).toBe('gondola');
    const r = ride(p, 12);
    expect(r.off).toBeLessThan(1e-6);
    expect(r.jerk).toBeLessThan(1e-6);
    expect(p.drawn().position.y).toBeGreaterThan(3); // on her way up
  });

  it('on a roof perch: at the perch’s height, eased up and down, on any ground', () => {
    const roof = area.perches.find((q) => q.y > 2 && q.kind === 'roof');
    expect(roof).toBeTruthy();
    const p = pair({ at: { x: roof.x, y: roof.y, z: roof.z, perch: roof } });
    p.run(1);
    expect(p.drawn().position.y).toBeCloseTo(roof.y, 2);
    // off again: she comes down
    p.session.perched = null;
    p.player.perchY = 0;
    p.run(1.5);
    expect(p.drawn().position.y).toBeCloseTo(0, 3); // eased down as her x and z are, state by state
    // on sloping ground the height is above the ground under her
    const ground = { flat: false, y: (x, z) => 0.1 * x + 0.05 * z };
    const remotes = createRemoteCats(new THREE.Scene(), { ground });
    remotes.upsert(PROFILE, 0);
    remotes.applyState({ v: 1, id: 'her', pos: [4, 2], yaw: 0, pose: 'perch', speed: 0, h: 1.5 }, 0);
    remotes.update(DT, 1, null, NO_FAIR);
    expect(remotes.list[0].group.position.y).toBeCloseTo(ground.y(4, 2) + 1.5, 6);
  });
});

describe('old and new builds in one room', () => {
  it('a message from an old build (no h, no seat) is drawn on the ground, as before', () => {
    const p = pair({ at: { x: 0, z: sim0().mgr.baseR + CAT_RADIUS + 0.2 }, wire: (s) => Object.fromEntries(OLD_FIELDS.map((k) => [k, s[k]])) });
    p.frame();
    p.hers.jump(p.ctx);
    p.run(0.5);
    p.hers.jump(p.ctx);
    expect(p.hers.riding.seatKind).toBe('horse');
    for (let i = 0; i < 60; i++) { p.frame(); expect(p.drawn().position.y).toBe(0); }
  });

  it('an old build reads the new message as it always read one: the same position, on the ground', () => {
    // what a build from before partner-height draws: the fields it knows, the ground under them
    const old = (s) => ({ x: s.pos[0], y: FLAT_GROUND.y(s.pos[0], s.pos[1]), z: s.pos[1], yaw: s.yaw });
    const p = pair({ at: { x: 0, z: sim0().mgr.baseR + CAT_RADIUS + 0.2 } });
    p.frame();
    p.hers.jump(p.ctx);
    p.run(0.5);
    p.hers.jump(p.ctx);
    p.run(1);
    const last = p.sent[p.sent.length - 1];
    expect(last.seat).toMatch(/^mgr-horse-/);
    expect(last.h).toBeGreaterThan(1);
    const plain = Object.fromEntries(OLD_FIELDS.map((k) => [k, last[k]]));
    expect(old(last)).toEqual(old(plain));
    expect(old(last).y).toBe(0);
  });

  it('draws her at her height from the first state: a partner first seen on a roof does not rise out of the ground', () => {
    const remotes = createRemoteCats(new THREE.Scene());
    remotes.upsert(PROFILE, 0);
    remotes.applyState({ v: 1, id: 'her', pos: [3, 4], yaw: 0, pose: 'perch', speed: 0, h: 2.32 }, 0);
    remotes.update(DT, DT, null, NO_FAIR);
    expect(remotes.list[0].group.position.y).toBeCloseTo(2.32, 6);
  });

  it('ignores a bad height or seat: out of range, not a number, not a seat it knows', () => {
    const remotes = createRemoteCats(new THREE.Scene());
    remotes.upsert(PROFILE, 0);
    const fair = createFairLive(scene, area, { now: () => 5000 });
    const at = (extra) => {
      remotes.applyState({ v: 1, id: 'her', pos: [30, 30], yaw: 0, pose: 'perch', speed: 0, ...extra }, 0);
      remotes.update(DT, 1, null, fair);
      return remotes.list[0].group.position;
    };
    expect(at({ h: 1e9 }).y).toBe(MAX_LIFT);
    expect(at({ h: -4 }).y).toBe(0);
    expect(at({ h: 'up' }).y).toBe(0);
    expect(at({ h: 2, seat: 'nonsense-seat-99' }).y).toBe(2); // not a seat here: her own height and place
    expect(at({ h: 2, seat: '<b>x</b>' }).x).toBe(30);
    expect(at({ h: 2, seat: 'slide-chute' }).x).toBe(30); // each device slides on its own clock
  });
});

// The rides' numbers, for places (one sim, read only).
function sim0() { return createFairLive(scene, area, { now: () => 0 }).sim; }
