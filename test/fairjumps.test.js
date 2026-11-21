import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The jump onto the Fairground's rides (fair-jumps, 2026-11-20). The owner's
// playtest: "the jump onto carousel and roller coaster is a bit awkward
// (doesn't always work)". What was measured before the fix, and is pinned
// here as sweeps over places, approach angles and ride times:
//
//  - a jump pressed with the stick still held (running at the ride) put her
//    on and the very next frame took her straight back off: 0 of 640 stayed
//    on the merry-go-round (game/avatar.js: any push leaves a perch);
//  - from the ground the merry-go-round's platform was reached only from the
//    last half metre before the plinth stops her: 41% of a band 1.2 m wide;
//  - with the train standing in the station, one press got her into a car
//    only from the platform itself: 0% from the steps, the step or along the
//    deck (three presses, each with the stick let go);
//  - the paw's badge was redrawn a quarter second before a press, and the
//    press then missed the seat it promised: 11% of the time at the
//    merry-go-round, 15% at the teacups, 6% at the big wheel's deck;
//  - on the coaster's platform and the merry-go-round's, the badge said 'down'
//    while the press boarded, and while the train was away it said 'down'
//    while the press did nothing.
// Boarding has no flight to miss: she is seated on the press, in the same
// frame, so no seat outruns her.

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build } = await import('../src/world/fair.js');
const { createFairSim, RIDE } = await import('../src/fairsim.js');
const { createFairLive } = await import('../src/fairlive.js');
const { propsFor, frameColliders } = await import('../src/propsets.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { stickTakesOff } = await import('../src/climbing.js');
const { climbBadge } = await import('../src/game/tips.js');
const { NO_TRAVERSAL } = await import('../src/traversallive.js');

const scene = new THREE.Scene();
const area = build(scene);
for (const f of propsFor('fair').flaps) for (const c of frameColliders(f)) area.colliders.push({ ...c });
scene.updateMatrixWorld(true);
const sim = createFairSim(area);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const TIMES = Array.from({ length: 60 }, (_, i) => 3000.37 + i * 1.613); // spread over every ride's period
const DT = 1 / 30;

// One walk at the Fairground, in main.js's order: the rides, then the avatar
// (a pushed stick takes her off a perch: climbing.js stickTakesOff, as
// game/avatar.js asks it), then the rides' late().
const clock = { T: 0 };
const live = createFairLive(scene, area, { now: () => clock.T });
function walkAt(at, T) {
  live.dispose();
  clock.T = T;
  const cat = new THREE.Group();
  cat.position.set(at.x, at.y ?? 0, at.z);
  const push = new THREE.Vector3();
  const player = {
    perchY: at.y ?? 0, inputActive: false, halt() {}, setViewYaw() {},
    inputDirection() { return push.clone(); },
  };
  const session = { perched: at.perch ?? null, cat, areaData: area, ground: area.ground, traversal: NO_TRAVERSAL, fair: live };
  const ctx = { cat, player, session };
  function frame() {
    clock.T += DT;
    live.update(DT, clock.T, ctx);
    if (stickTakesOff(session, player.inputActive)) { session.perched = null; player.perchY = 0; }
    live.late(DT, clock.T, ctx);
  }
  const stick = (x, z) => { push.set(x, 0, z); player.inputActive = x !== 0 || z !== 0; };
  return { cat, player, session, ctx, frame, stick };
}
const ground = (x, z) => ({ x, y: 0, z });
const rate = (ok, n) => (n ? ok / n : 0);

describe('a pushed stick and the perch she has just jumped onto', () => {
  it('holds her on it while the stick stays held from the jump, and lets her off with the next push', () => {
    const perch = { x: 0, y: 1, z: 0 };
    const s = { perched: perch, perchHold: perch };
    expect(stickTakesOff(s, true)).toBe(false); // still held from the jump
    expect(stickTakesOff(s, false)).toBe(false); // let go
    expect(s.perchHold).toBeNull();
    expect(stickTakesOff(s, true)).toBe(true); // pushed again: off
    // a perch she did not jump onto with the stick held: any push, as before
    expect(stickTakesOff({ perched: perch, perchHold: null }, true)).toBe(true);
    expect(stickTakesOff({ perched: { ...perch }, perchHold: perch }, true)).toBe(true);
    expect(stickTakesOff({ perched: null, perchHold: null }, true)).toBe(false);
  });
});

describe('the merry-go-round from the ground', () => {
  it('gets her on from anywhere within 1.2 m of where the plinth stops her, at every moment, every way round', () => {
    let ok = 0;
    let n = 0;
    for (const T of TIMES) {
      sim.setTime(T);
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        for (const gap of [0, 0.3, 0.6, 0.9, 1.2]) {
          const r = sim.mgr.baseR + CAT_RADIUS + 0.01 + gap;
          const cat = ground(sim.mgr.cx + Math.cos(a) * r, sim.mgr.cz + Math.sin(a) * r);
          if (!isWalkableAt(area, cat.x, cat.z)) continue;
          n++;
          const t = sim.jumpTarget(cat, null);
          if (t?.type !== 'board' || t.seat.seatKind !== 'deck') continue;
          // the standing place nearest her
          for (const d of sim.mgr.deck) expect(flat(d, cat)).toBeGreaterThanOrEqual(flat(t.seat, cat) - 1e-9);
          ok++;
        }
      }
    }
    expect(n).toBeGreaterThan(10000);
    expect(rate(ok, n)).toBe(1); // it was 0.41
  });

  it('still reaches nothing from two metres back, even with the jump’s slack', () => {
    for (const T of TIMES) {
      sim.setTime(T);
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const r = sim.mgr.baseR + CAT_RADIUS + 2.0;
        expect(sim.jumpTarget(ground(Math.cos(a) * r, Math.sin(a) * r), null, null, RIDE.JUMP_SLACK)).toBeNull();
      }
    }
  });

  it('keeps her on when she runs at it and presses jump with the stick still held, and up onto a horse the same way', () => {
    let on = 0;
    let horse = 0;
    let n = 0;
    for (const T of TIMES.slice(0, 30)) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + 0.1;
        const r = sim.mgr.baseR + CAT_RADIUS + 0.4;
        const at = ground(Math.cos(a) * r, Math.sin(a) * r);
        if (!isWalkableAt(area, at.x, at.z)) continue;
        const w = walkAt(at, T);
        w.frame();
        w.stick(-Math.cos(a), -Math.sin(a)); // running in at the ride
        n++;
        expect(live.jump(w.ctx)).toBe(true);
        for (let i = 0; i < 10; i++) w.frame();
        if (live.riding?.seatKind === 'deck' && w.session.perched === live.riding) on++;
        // and again, the stick still held: up onto a horse, and she stays
        live.jump(w.ctx);
        for (let i = 0; i < 10; i++) w.frame();
        if (live.riding?.seatKind === 'horse' && w.session.perched === live.riding) horse++;
        // let go, push again: off, in a short hop down
        w.stick(0, 0);
        w.frame();
        w.stick(Math.cos(a), Math.sin(a));
        w.frame();
        expect(live.riding).toBeNull();
        expect(live.hopping).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(400);
    expect(rate(on, n)).toBe(1); // it was 0
    expect(rate(horse, n)).toBe(1);
  });
});

describe('the caterpillar coaster from the station', () => {
  const st = area.anchors.coasterStation;
  const plat = sim.coaster.platform;
  const step = area.perches.find((p) => p !== plat && Math.abs(p.z - plat.z) < 1e-6 && p.x < plat.x && p.x > st.minX - 1 && p.y < plat.y);
  // the plaza side: the foot of the steps, the steps, along the deck's rail; the step; the platform
  const spots = [];
  for (let x = st.minX - RIDE.STATION_FRONT + 0.05; x < st.minX; x += 0.25) {
    for (let z = st.minZ + 0.2; z < st.maxZ; z += 0.4) if (isWalkableAt(area, x, z)) spots.push({ cat: ground(x, z), from: null });
  }
  spots.push({ cat: step, from: step }, { cat: plat, from: plat });

  it('puts her in a car with one press from anywhere in front of it, the whole time the train stands', () => {
    expect(step).toBeTruthy();
    expect(spots.length).toBeGreaterThan(60);
    let ok = 0;
    let n = 0;
    for (let t = 0.05; t < RIDE.COASTER_WAIT; t += 0.25) {
      sim.setTime(RIDE.COASTER_LAP * 300 + t);
      expect(sim.coaster.waiting).toBe(true);
      for (const s of spots) {
        n++;
        const got = sim.jumpTarget(s.cat, s.from);
        if (got?.type !== 'board' || got.seat.seatKind !== 'car') continue;
        // the car nearest her, alongside the deck
        for (const c of sim.coaster.cars) if (c.z >= st.minZ && c.z <= st.maxZ) expect(flat(c, s.cat)).toBeGreaterThanOrEqual(flat(got.seat, s.cat) - 1e-9);
        ok++;
      }
    }
    expect(rate(ok, n)).toBe(1); // it was 0.02: the platform alone
  });

  it('boards only a train slow enough to board, and leaves the ordinary jump to the steps while it is away', () => {
    let boarded = 0;
    for (let t = 0; t < RIDE.COASTER_LAP; t += 0.2) {
      sim.setTime(RIDE.COASTER_LAP * 310 + t);
      for (const s of spots) {
        const got = sim.jumpTarget(s.cat, s.from, null, RIDE.JUMP_SLACK);
        if (got?.seat?.seatKind === 'car') {
          expect(sim.coaster.speed).toBeLessThanOrEqual(RIDE.BOARD_SPEED);
          // a car beside her, never one down the line coming in or leaving
          expect(flat(got.seat, s.cat)).toBeLessThan(RIDE.STATION_CAR + RIDE.JUMP_SLACK);
          boarded++;
        } else if (s.from === plat) {
          expect(got.type).toBe('stay');
        } else {
          expect(got).toBeNull();
        }
      }
    }
    expect(boarded).toBeGreaterThan(0);
  });

  it('keeps her in the car when she presses jump with the stick still held', () => {
    let ok = 0;
    let n = 0;
    for (const s of spots.filter((_, i) => i % 3 === 0)) {
      const w = walkAt({ ...s.cat, perch: s.from }, RIDE.COASTER_LAP * 320 + 1);
      w.frame();
      w.stick(1, 0);
      n++;
      live.jump(w.ctx);
      for (let i = 0; i < 10; i++) w.frame();
      if (live.riding?.seatKind === 'car' && w.session.perched === live.riding) ok++;
    }
    expect(rate(ok, n)).toBe(1);
  });
});

describe('the paw and the jump agree', () => {
  // A press a quarter of a second after the paw is drawn (main.js redraws it
  // four times a second): whenever the paw said 'up', the press boards.
  function agree(places, times) {
    let ok = 0;
    let n = 0;
    for (const T of times) {
      for (const at of places) {
        const w = walkAt(at, T);
        w.frame();
        if (live.pawKind(w.cat, w.player, w.session) !== 'up') continue;
        n++;
        clock.T += 0.25 - DT;
        w.frame();
        if (live.jump(w.ctx) && live.riding) ok++;
      }
    }
    return { ok, n };
  }
  const ring = (cx, cz, r, k) => Array.from({ length: k }, (_, i) => ground(cx + Math.cos((i / k) * Math.PI * 2) * r, cz + Math.sin((i / k) * Math.PI * 2) * r))
    .filter((p) => isWalkableAt(area, p.x, p.z));

  it('beside the merry-go-round and the teacups, at every distance the paw says up', () => {
    for (const [cx, cz, baseR] of [[sim.mgr.cx, sim.mgr.cz, sim.mgr.baseR], [sim.cups.cx, sim.cups.cz, sim.cups.baseR]]) {
      const places = [0, 0.4, 0.8, 1.2].flatMap((g) => ring(cx, cz, baseR + CAT_RADIUS + 0.01 + g, 24));
      const { ok, n } = agree(places, TIMES.slice(0, 25));
      expect(n).toBeGreaterThan(100);
      expect(rate(ok, n)).toBe(1); // it was 0.89 and 0.85
    }
  });

  it('on the big wheel’s deck and the coaster’s platform, through whole turns and laps', () => {
    for (const p of [sim.wheel.step, sim.coaster.platform]) {
      const times = Array.from({ length: 500 }, (_, i) => 9000 + i * 0.211);
      const { ok, n } = agree([{ ...p, perch: p }], times);
      expect(n).toBeGreaterThan(40);
      expect(rate(ok, n)).toBe(1); // it was 0.94 and 0.97
    }
  });

  it('shows the badge the press will honour: up onto a seat, nothing while she waits, down off one', () => {
    const state = { skills: [], feats: {} };
    const plat = sim.coaster.platform;
    // the coaster's platform: up while the train stands, nothing while it is away
    let w = walkAt({ ...plat, perch: plat }, RIDE.COASTER_LAP * 330 + 1);
    w.frame();
    expect(climbBadge(w.session, w.player, state)).toBe('up');
    w = walkAt({ ...plat, perch: plat }, RIDE.COASTER_LAP * 330 + RIDE.COASTER_WAIT + 14); // 14 s out on the track
    w.frame();
    expect(climbBadge(w.session, w.player, state)).toBeNull();
    expect(live.jump(w.ctx)).toBe(true); // the press does nothing: she waits
    expect(w.session.perched).toBe(plat);
    // the merry-go-round's platform: up (onto a horse), and on a horse up (the next one)
    w = walkAt(ground(0, sim.mgr.baseR + CAT_RADIUS + 0.3), 4000);
    w.frame();
    expect(climbBadge(w.session, w.player, state)).toBe('up');
    live.jump(w.ctx);
    w.frame();
    expect(live.riding.seatKind).toBe('deck');
    expect(climbBadge(w.session, w.player, state)).toBe('up');
    live.jump(w.ctx);
    w.frame();
    expect(live.riding.seatKind).toBe('horse');
    expect(climbBadge(w.session, w.player, state)).toBe('up');
    // in a coaster car out on the track: the press takes her off, down
    w = walkAt({ ...plat, perch: plat }, RIDE.COASTER_LAP * 340 + 1);
    w.frame();
    live.jump(w.ctx);
    for (let i = 0; i < 30 * (RIDE.COASTER_WAIT + 9); i++) w.frame(); // 10 s out on the track
    expect(live.riding.seatKind).toBe('car');
    expect(climbBadge(w.session, w.player, state)).toBe('down');
  });
});
