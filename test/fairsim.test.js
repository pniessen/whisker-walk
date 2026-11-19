import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The Fairground, step 2: the rides move and carry the cat
// (docs/superpowers/specs/2026-11-18-fairground-design.md, "The rides").
// src/fairsim.js is the rides as numbers; src/fairlive.js draws them on the
// models world/fair.js built and carries the cat. Both are checked here
// against the built Fairground, with the game's own rules for where a cat can
// stand (player.js isWalkableAt).

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
const { createFairSim, RIDE, RIDE_IDS, CAT_RADIUS: SIM_CAT_RADIUS } = await import('../src/fairsim.js');
const { createFairLive, poseRides, NO_FAIR, TUNE, hopDownTime, wallClock } = await import('../src/fairlive.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { waterClearance } = await import('../src/world/builder.js');
const { clearSpot } = await import('../src/world/spots.js');
const { propsFor, frameColliders } = await import('../src/propsets.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { RIDE_PAGE, RIDE_TOASTS, RIDE_PAGE_WORDS } = await import('../src/fairwords.js');
const { noteRide, handleFairEvent, rideKey } = await import('../src/game/fairplay.js');
const { JOURNAL_TYPES, createProgression } = await import('../src/progression.js');
const { CRITTER_INFO } = await import('../src/journal.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { containsBanned } = await import('../src/blocklist.js').catch(() => ({ containsBanned: null }));

// One built Fairground, as the walk has it: the props' own colliders are in
// the list too (walk.js adds the rests' and the flaps' frames).
function builtFair() {
  const scene = new THREE.Scene();
  const area = build(scene);
  for (const f of propsFor('fair').flaps) for (const c of frameColliders(f)) area.colliders.push({ ...c });
  scene.updateMatrixWorld(true);
  return { scene, area };
}
const { scene, area } = builtFair();
const sim = createFairSim(area);
const env = { colliders: area.colliders, bounds: area.bounds, wet: (x, z, m) => waterClearance(area.waters, x, z) < m };

const SAMPLES = Array.from({ length: 97 }, (_, i) => 1000.37 + i * 2.713); // spread over every ride's period
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const snapshot = () => sim.seats.map((s) => [s.id, s.x, s.y, s.z, s.yaw]);
// Where the model has a seat: the seat's own point, through the model's matrices.
const v = new THREE.Vector3();
function modelSeat(group) {
  const s = group.userData.seat;
  return group.localToWorld(v.set(s.x, s.y, s.z)).clone();
}
function posed(T) {
  sim.setTime(T);
  poseRides(area.rides, sim);
  scene.updateMatrixWorld(true);
}
const seatsOf = (ride, kind) => sim.seats.filter((s) => s.rideId === ride && (!kind || s.seatKind === kind));

describe('the rides’ clock', () => {
  it('is a pure function of the time: the same time gives the same fair, in any order', () => {
    sim.setTime(1234.5);
    const a = snapshot();
    sim.setTime(77.25);
    sim.setTime(1234.5);
    expect(snapshot()).toEqual(a);
    const other = createFairSim(builtFair().area);
    other.setTime(1234.5);
    expect(other.seats.map((s) => [s.id, s.x, s.y, s.z, s.yaw])).toEqual(a);
  });

  it('keeps every seat a finite place inside the fair at every sampled time', () => {
    for (const T of SAMPLES) {
      sim.setTime(T);
      for (const s of sim.seats) {
        for (const k of ['x', 'y', 'z', 'yaw']) expect(Number.isFinite(s[k]), `${s.id}.${k} at ${T}`).toBe(true);
        expect(s.x).toBeGreaterThan(area.bounds.minX);
        expect(s.x).toBeLessThan(area.bounds.maxX);
        expect(s.z).toBeGreaterThan(area.bounds.minZ);
        expect(s.z).toBeLessThan(area.bounds.maxZ);
        expect(s.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('takes a time that is not a number as zero, and a time of day as it is', () => {
    sim.setTime(NaN);
    const zero = snapshot();
    sim.setTime(0);
    expect(snapshot()).toEqual(zero);
    // seconds since 1970: nothing loses its place at that size
    sim.setTime(1795051577.123);
    const a = snapshot();
    sim.setTime(1795051577.123 + RIDE.MGR_TURN);
    const b = snapshot();
    for (let i = 0; i < a.length; i++) {
      if (!a[i][0].startsWith('mgr-')) continue;
      for (let k = 1; k < 5; k++) expect(Math.abs(Math.sin(a[i][k]) - Math.sin(b[i][k]))).toBeLessThan(1e-3);
    }
    expect(Number.isFinite(wallClock())).toBe(true);
    expect(wallClock()).toBeGreaterThan(1.7e9);
  });

  it('lists its seats once each, every one a perch record of a known ride', () => {
    expect(new Set(sim.seats.map((s) => s.id)).size).toBe(sim.seats.length);
    for (const s of sim.seats) {
      expect(RIDE_IDS).toContain(s.rideId);
      expect(s.fair).toBe(true);
      expect(['perch', 'follow']).toContain(s.pose); // sitting up or standing: game/avatar.js draws what the seat says
      expect(s.kind).toBe('prop');
    }
    // and none of them is among the area's own perches (fair.js's promise)
    for (const s of sim.seats) expect(area.perches.includes(s)).toBe(false);
  });
});

describe('the merry-go-round', () => {
  const horses = seatsOf('mgr', 'horse');
  const deck = seatsOf('mgr', 'deck');

  it('turns once in 12 to 14 seconds, and comes back exactly', () => {
    expect(RIDE.MGR_TURN).toBeGreaterThanOrEqual(12);
    expect(RIDE.MGR_TURN).toBeLessThanOrEqual(14);
    sim.setTime(40);
    const a = snapshot().filter((r) => r[0].startsWith('mgr-'));
    sim.setTime(40 + RIDE.MGR_TURN);
    const b = snapshot().filter((r) => r[0].startsWith('mgr-'));
    for (let i = 0; i < a.length; i++) for (let k = 1; k < 4; k++) expect(b[i][k]).toBeCloseTo(a[i][k], 9);
    // a quarter of a turn on, a horse is a quarter of the way round
    sim.setTime(40 + RIDE.MGR_TURN / 4);
    const h = horses[0];
    const now = Math.atan2(h.z - sim.mgr.cz, h.x - sim.mgr.cx);
    const then = Math.atan2(a[0][3] - sim.mgr.cz, a[0][1] - sim.mgr.cx);
    expect(Math.abs(Math.atan2(Math.sin(now - then), Math.cos(now - then)))).toBeCloseTo(Math.PI / 2, 6);
  });

  it('has twelve horses and sixteen places to stand round the platform’s edge', () => {
    expect(horses).toHaveLength(12);
    expect(deck).toHaveLength(RIDE.MGR_DECK_SPOTS);
    for (const d of deck) expect(d.pose).toBe('follow'); // she stands there
    for (const h of horses) expect(h.pose).toBe('perch'); // she sits on a horse, and does not nod off
  });

  it('puts every horse’s seat where the model’s seat is, as the horse rises and falls', () => {
    const m = area.rides.merryGoRound;
    let lo = Infinity;
    let hi = -Infinity;
    for (const T of SAMPLES) {
      posed(T);
      for (const h of horses) {
        const at = modelSeat(m.horses[h.index]);
        expect(dist3(h, at), `${h.id} at ${T}`).toBeLessThan(1e-6);
        lo = Math.min(lo, h.y - h.baseY);
        hi = Math.max(hi, h.y - h.baseY);
        // she faces the way the horse faces: its nose is local +z, hers local -z
        const nose = m.horses[h.index].localToWorld(v.set(0, 0, 1)).sub(m.horses[h.index].getWorldPosition(new THREE.Vector3()));
        expect(-Math.sin(h.yaw)).toBeCloseTo(nose.x, 6);
        expect(-Math.cos(h.yaw)).toBeCloseTo(nose.z, 6);
      }
    }
    // up and down by the model's own allowance, and no further (the poles' ends never show)
    expect(hi).toBeGreaterThan(m.bob * 0.9);
    expect(lo).toBeLessThan(-m.bob * 0.9);
    expect(hi).toBeLessThanOrEqual(m.bob + 1e-9);
    expect(lo).toBeGreaterThanOrEqual(-m.bob - 1e-9);
  });

  it('carries the platform’s standing places round with the platform, on its boards and clear of the horses', () => {
    const m = area.rides.merryGoRound;
    for (const T of SAMPLES.slice(0, 20)) {
      posed(T);
      for (const d of deck) {
        const at = m.turn.localToWorld(v.set(Math.cos(d.a) * d.r, sim.mgr.deckY, Math.sin(d.a) * d.r)).clone();
        expect(dist3(d, at), `${d.id} at ${T}`).toBeLessThan(1e-6);
        expect(Math.hypot(d.x - sim.mgr.cx, d.z - sim.mgr.cz) + CAT_RADIUS).toBeLessThan(4.5); // on the deck (MGR.r)
        for (const h of horses) expect(flat(d, h), `${d.id} vs ${h.id}`).toBeGreaterThan(0.6); // beside a horse, never in it
      }
    }
  });

  it('turns the horses the way they face, and the music box’s drum too', () => {
    posed(10);
    const a0 = sim.angles.mgr;
    const h0 = { x: horses[0].x, z: horses[0].z, yaw: horses[0].yaw };
    const drum0 = area.rides.merryGoRound.musicBoxDrum.rotation.x;
    posed(10.2);
    expect(sim.angles.mgr).not.toBe(a0);
    // she moved the way she faces (forward is -sin, -cos of her yaw)
    const dx = horses[0].x - h0.x;
    const dz = horses[0].z - h0.z;
    expect(dx * -Math.sin(h0.yaw) + dz * -Math.cos(h0.yaw)).toBeGreaterThan(0.2);
    expect(area.rides.merryGoRound.musicBoxDrum.rotation.x).not.toBe(drum0);
    expect(area.rides.merryGoRound.turn.rotation.y).toBe(sim.angles.mgr);
  });

  it('is slow: a horse on the outside goes about as fast as a cat trots', () => {
    const speed = (2 * Math.PI * 3.45) / RIDE.MGR_TURN;
    expect(speed).toBeLessThan(2.2);
    expect((2 * Math.PI * area.rides.merryGoRound.bob) / RIDE.MGR_BOB).toBeLessThan(0.5); // the bob, at its quickest
  });
});

describe('the big wheel', () => {
  const gondolas = seatsOf('wheel', 'gondola');
  const lookout = seatsOf('wheel', 'lookout')[0];
  const W = area.rides.wheel;

  it('turns once in 50 to 60 seconds, and comes back exactly', () => {
    expect(RIDE.WHEEL_TURN).toBeGreaterThanOrEqual(50);
    expect(RIDE.WHEEL_TURN).toBeLessThanOrEqual(60);
    sim.setTime(33.3);
    const a = gondolas.map((g) => [g.x, g.y, g.z]);
    sim.setTime(33.3 + RIDE.WHEEL_TURN);
    gondolas.forEach((g, i) => { expect(g.x).toBeCloseTo(a[i][0], 9); expect(g.y).toBeCloseTo(a[i][1], 9); });
    // an eighth of a turn on, each gondola is where the next one was
    sim.setTime(33.3 + RIDE.WHEEL_TURN / 8);
    gondolas.forEach((g, i) => { const n = a[(i + 1) % 8]; expect(g.x).toBeCloseTo(n[0], 6); expect(g.y).toBeCloseTo(n[1], 6); });
    // a gondola on the rim goes at a slow walk
    expect((2 * Math.PI * W.radius) / RIDE.WHEEL_TURN).toBeLessThan(0.8);
  });

  it('puts every gondola’s seat where the model’s is, all the way round', () => {
    expect(W.group.rotation.y).toBe(0); // the wheel stands in the plane fairsim.js takes it to
    expect(gondolas).toHaveLength(8);
    for (const T of SAMPLES) {
      posed(T);
      for (const g of gondolas) expect(dist3(g, modelSeat(W.gondolas[g.index])), `${g.id} at ${T}`).toBeLessThan(1e-6);
    }
  });

  it('keeps every gondola upright: its floor is level whatever the wheel’s angle', () => {
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3();
    for (const T of SAMPLES) {
      posed(T);
      for (const gg of W.gondolas) {
        gg.getWorldQuaternion(q);
        up.set(0, 1, 0).applyQuaternion(q);
        expect(up.y, `${gg.name} at ${T}`).toBeGreaterThan(1 - 1e-9);
      }
      expect(W.turn.rotation.z).toBe(sim.angles.wheel);
    }
    // and the wheel really does turn under them
    posed(10); const a = W.turn.rotation.z; posed(17); expect(W.turn.rotation.z).not.toBe(a);
  });

  it('has a lookout that does not move, level with the floor of the gondola at the top', () => {
    const A = area.anchors.wheelTopPlatform;
    for (const T of [0, 13, 29.5]) { sim.setTime(T); expect([lookout.x, lookout.y, lookout.z]).toEqual([A.x, A.y, A.z]); }
    const top = W.hubY + W.radius - gondolas[0].drop;
    expect(Math.abs(lookout.y - top)).toBeLessThan(0.1);
    expect(sim.wheel.step).toBe(area.perches.find((p) => p.x === area.anchors.wheelStep.x && p.z === area.anchors.wheelStep.z));
    expect(sim.wheel.step).toBeTruthy();
  });

  it('is boarded from the boarding deck only as a gondola passes the bottom, and she waits there otherwise', () => {
    const step = sim.wheel.step;
    let on = 0;
    const N = 560;
    for (let i = 0; i < N; i++) {
      sim.setTime(700 + (i * RIDE.WHEEL_TURN) / N);
      const t = sim.jumpTarget(step, step);
      if (t.type === 'board') {
        on++;
        expect(t.seat.seatKind).toBe('gondola');
        expect(dist3(t.seat, step)).toBeLessThan(RIDE.REACH_GONDOLA);
        expect(t.seat.y).toBeLessThan(1.0); // it is the one at the bottom
        expect(Math.abs(t.seat.x - sim.wheel.cx)).toBeLessThan(1.7);
      } else {
        expect(t.type).toBe('stay'); // not a hop down off the deck: she waits for the next one
        for (const g of gondolas) expect(dist3(g, step)).toBeGreaterThanOrEqual(RIDE.REACH_GONDOLA);
      }
    }
    // in reach for most of the time between one gondola and the next, and not all of it
    expect(on / N).toBeGreaterThan(0.5);
    expect(on / N).toBeLessThan(0.85);
  });

  it('is not boarded from the path in front, nor by a gondola that has gone up', () => {
    for (let i = 0; i < 80; i++) {
      sim.setTime(900 + i * 0.7);
      expect(sim.jumpTarget({ x: 0, y: 0, z: -26.8 }, null)).toBeNull();
      expect(sim.jumpTarget({ x: 6, y: 0, z: -28 }, null)).toBeNull();
      // right under a gondola two metres up: it has gone by
      const high = gondolas.find((g) => g.y > 1.8 && g.y < 2.6);
      if (high) expect(sim.jumpTarget({ x: high.x, y: 0, z: high.z + 1.7 }, null)?.seat ?? null).not.toBe(high);
    }
  });

  it('lets her across to the lookout only from the gondola at the top, out onto the deck only at the bottom, and off anywhere', () => {
    const seen = { hop: 0, static: 0, off: 0 };
    for (let i = 0; i < 560; i++) {
      sim.setTime(1200 + (i * RIDE.WHEEL_TURN) / 560);
      for (const g of gondolas) {
        const t = sim.jumpTarget(g, g);
        seen[t.type]++;
        if (t.type === 'hop') {
          expect(t.seat).toBe(lookout);
          expect(g.y).toBeGreaterThan(lookout.y - 0.5);
          expect(dist3(g, lookout)).toBeLessThan(RIDE.REACH_LOOKOUT);
        } else if (t.type === 'static') {
          expect(t.perch).toBe(sim.wheel.step);
          expect(g.y).toBeLessThan(1.0);
        } else {
          expect(t.type).toBe('off');
        }
      }
    }
    expect(seen.hop).toBeGreaterThan(0);
    expect(seen.static).toBeGreaterThan(0);
    expect(seen.off).toBeGreaterThan(seen.hop + seen.static); // most of the way round it is simply "off"
  });

  it('takes her off the lookout into the next gondola, and has her wait there when none is near', () => {
    let hops = 0;
    const N = 560;
    for (let i = 0; i < N; i++) {
      sim.setTime(50 + (i * RIDE.WHEEL_TURN) / N);
      const t = sim.jumpTarget(lookout, lookout);
      if (t.type === 'hop') { hops++; expect(t.seat.seatKind).toBe('gondola'); expect(dist3(t.seat, lookout)).toBeLessThan(RIDE.REACH_LOOKOUT); }
      else expect(t.type).toBe('stay'); // never a leap off a thirteen-metre platform by the jump button
    }
    expect(hops / N).toBeGreaterThan(0.6);
  });

  it('counts the whole strip under the wheel as swept: nobody lands under a gondola', () => {
    for (let x = -8; x <= 8; x += 0.5) {
      expect(sim.swept(sim.wheel.cx + x, sim.wheel.cz)).toBe(Math.abs(x) < W.radius + 0.9 + CAT_RADIUS);
    }
    expect(sim.swept(sim.wheel.cx, sim.wheel.cz + 2)).toBe(false);
    for (const T of SAMPLES.slice(0, 30)) {
      sim.setTime(T);
      for (const g of gondolas) expect(sim.swept(g.x, g.z)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// GETTING ON
// ---------------------------------------------------------------------------
describe('getting on: only what is within reach', () => {
  const ground = (x, z) => ({ x, y: 0, z });

  it('says nothing at all away from the rides, so the ordinary jump runs', () => {
    for (const T of SAMPLES.slice(0, 12)) {
      sim.setTime(T);
      for (const p of [area.spawn, { x: 0, z: 30 }, { x: -15, z: -22 }, { x: 12, z: 31 }, { x: 0, z: 9 }]) {
        expect(sim.jumpTarget(ground(p.x, p.z), null), `${p.x},${p.z} at ${T}`).toBeNull();
      }
    }
  });

  it('reaches the merry-go-round’s platform from the ground beside it, and never a horse', () => {
    let boarded = 0;
    let tried = 0;
    for (const T of SAMPLES) {
      sim.setTime(T);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const r = sim.mgr.baseR + CAT_RADIUS + 0.05; // as close as the collider lets her stand
        const cat = ground(sim.mgr.cx + Math.cos(a) * r, sim.mgr.cz + Math.sin(a) * r);
        expect(isWalkableAt(area, cat.x, cat.z)).toBe(true);
        const t = sim.jumpTarget(cat, null);
        tried++;
        if (!t) continue;
        boarded++;
        expect(t.type).toBe('board');
        expect(t.seat.seatKind).toBe('deck');
        expect(flat(t.seat, cat)).toBeLessThan(RIDE.REACH_DECK);
        // and it is the nearest of those in reach
        for (const d of seatsOf('mgr', 'deck')) expect(flat(d, cat)).toBeGreaterThanOrEqual(flat(t.seat, cat) - 1e-9);
      }
    }
    // a place to stand is always in reach of a cat right beside the ride: no waiting, no missed jump
    expect(boarded).toBe(tried);
  });

  it('reaches nothing from two metres back', () => {
    for (const T of SAMPLES.slice(0, 30)) {
      sim.setTime(T);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const r = sim.mgr.baseR + 2.3;
        expect(sim.jumpTarget(ground(sim.mgr.cx + Math.cos(a) * r, sim.mgr.cz + Math.sin(a) * r), null)).toBeNull();
      }
    }
  });

  it('hops from the platform up onto a horse, and from horse to horse all the way round', () => {
    for (const T of SAMPLES.slice(0, 10)) {
      sim.setTime(T);
      for (const d of seatsOf('mgr', 'deck')) {
        const t = sim.jumpTarget(d, d, null);
        expect(t.type).toBe('hop');
        expect(t.seat.seatKind).toBe('horse');
        expect(flat(t.seat, d)).toBeLessThan(RIDE.REACH_HORSE);
      }
    }
    // hop after hop, never straight back: she visits horse after horse and gets right round
    sim.setTime(500);
    let from = seatsOf('mgr', 'deck')[0];
    let last = null;
    const seen = new Set();
    let turned = 0;
    for (let i = 0; i < 40; i++) {
      const t = sim.jumpTarget(from, from, last);
      expect(t.type).toBe('hop');
      expect(t.seat).not.toBe(from);
      expect(t.seat).not.toBe(last);
      expect(flat(t.seat, from)).toBeLessThan(RIDE.REACH_HORSE);
      if (from.seatKind === 'horse') turned += Math.atan2(Math.sin(t.seat.a - from.a), Math.cos(t.seat.a - from.a));
      seen.add(t.seat.id);
      last = from;
      from = t.seat;
    }
    expect(seen.size).toBe(12);
    expect(turned).toBeGreaterThan(Math.PI * 2);
  });
});

// ---------------------------------------------------------------------------
// GETTING OFF
// ---------------------------------------------------------------------------
describe('getting off: at any moment, from any seat, onto free ground', () => {
  const PUSHES = [null, { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }, { x: 0.7, z: -0.7 }];

  it('finds free ground beside the ride from every seat at every sampled time, whichever way she pushes', () => {
    // (plain checks gathered into one list: this runs a hundred thousand landings)
    const wrong = [];
    let n = 0;
    const b = area.bounds;
    for (const T of SAMPLES) {
      sim.setTime(T);
      for (const s of sim.seats) {
        for (const push of PUSHES) {
          const to = sim.dismountSpot(s, push, env);
          n++;
          let why = null;
          if (!to.ok) why = 'nothing free';
          // the game's own test: inside the bounds, out of every collider, dry
          else if (!isWalkableAt(area, to.x, to.z)) why = 'not walkable';
          // with room to spare
          else if (area.colliders.some((c) => Math.hypot(to.x - c.x, to.z - c.z) < c.r + CAT_RADIUS + RIDE.LAND_MARGIN - 1e-9)) why = 'too near a collider';
          else if (to.x < b.minX + RIDE.BOUNDS_MARGIN || to.x > b.maxX - RIDE.BOUNDS_MARGIN || to.z < b.minZ + RIDE.BOUNDS_MARGIN || to.z > b.maxZ - RIDE.BOUNDS_MARGIN) why = 'at the edge';
          else if (waterClearance(area.waters, to.x, to.z) < RIDE.WATER_MARGIN) why = 'wet';
          // and not under anything a ride moves through
          else if (sim.swept(to.x, to.z)) why = 'under a ride';
          // beside the ride: a few steps from where the seat is over the ground
          else if (flat(to, s) > 9) why = 'far away';
          if (why) wrong.push(`${s.id} at ${T} pushed ${push ? `${push.x},${push.z}` : 'nowhere'} -> ${to.x.toFixed(2)},${to.z.toFixed(2)}: ${why}`);
        }
      }
    }
    expect(wrong.slice(0, 20)).toEqual([]);
    expect(n).toBe(SAMPLES.length * sim.seats.length * PUSHES.length);
  });

  it('lands her the way she pushed when that way is free, and beside the ride, not across the fair', () => {
    sim.setTime(300);
    for (const s of seatsOf('mgr')) {
      const out = { x: s.x - sim.mgr.cx, z: s.z - sim.mgr.cz };
      const to = sim.dismountSpot(s, null, env);
      // straight out from the middle when she pushed nothing
      const a = Math.atan2(to.x - s.x, to.z - s.z) - Math.atan2(out.x, out.z);
      expect(Math.abs(Math.atan2(Math.sin(a), Math.cos(a)))).toBeLessThan(0.5);
      expect(flat(to, s)).toBeLessThan(sim.mgr.baseR + 1.5);
      // a step clear of the platform's edge, no more
      expect(Math.hypot(to.x - sim.mgr.cx, to.z - sim.mgr.cz)).toBeLessThan(sim.mgr.baseR + 1.2);
    }
  });

  it('never lands her on the platform, under it or inside its plinth', () => {
    for (let x = -6; x <= 6; x += 0.5) for (let z = -6; z <= 6; z += 0.5) {
      if (Math.hypot(x, z) < sim.mgr.baseR + CAT_RADIUS) expect(sim.free(x, z, env)).toBe(false);
    }
    expect(sim.mgr.baseR).toBe(4.75);
    expect(SIM_CAT_RADIUS).toBe(CAT_RADIUS);
  });

  it('gives every seat a way off or a way on to another seat: no jump is ever refused on a ride', () => {
    for (const T of SAMPLES) {
      sim.setTime(T);
      for (const s of sim.seats) {
        const t = sim.jumpTarget(s, s, null);
        expect(t, `${s.id} at ${T}`).not.toBeNull();
        expect(['hop', 'off', 'static', 'stay', 'slide']).toContain(t.type);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// THE WALK: fairlive.js with a stand-in for the game's cat, player and session
// ---------------------------------------------------------------------------
// (One built fair for every walk here: a ride's models are wholly set by the
// clock each frame, so one walk leaves nothing behind for the next.)
const walkFair = builtFair();
function walk({ at = { x: 0, z: 8 }, clock = { T: 2000 }, reducedMotion = false } = {}) {
  const made = walkFair;
  const events = [];
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 300);
  const live = createFairLive(made.scene, made.area, { camera, reducedMotion, now: () => clock.T, onEvent: (e) => events.push({ ...e }) });
  const cat = new THREE.Group();
  cat.position.set(at.x, 0, at.z);
  const push = new THREE.Vector3();
  const player = {
    perchY: 0, inputActive: false, yaw: 0, halts: 0,
    halt() { this.halts++; },
    setViewYaw(y) { this.yaw = y; },
    inputDirection() { return push.clone(); },
  };
  const session = { perched: null, cat };
  const ctx = { cat, player, session };
  const DT = 1 / 30;
  // One frame, in main.js's order: the player's own camera, the rides, the
  // avatar (a pushed stick takes her off a perch), the rides again.
  function frame() {
    clock.T += DT;
    if (!session.perched && player.perchY === 0 && player.inputActive) { cat.position.x += push.x * 3.8 * DT; cat.position.z += push.z * 3.8 * DT; }
    cat.position.y = player.perchY;
    camera.position.set(cat.position.x + Math.sin(player.yaw) * 5, cat.position.y + 3, cat.position.z + Math.cos(player.yaw) * 5);
    camera.lookAt(cat.position.x, cat.position.y + 0.5, cat.position.z);
    live.update(DT, clock.T, ctx);
    if (session.perched && player.inputActive) { session.perched = null; player.perchY = 0; }
    cat.position.y = player.perchY;
    cat.rotation.z = 0;
    live.late(DT, clock.T, ctx);
  }
  const run = (seconds) => { for (let i = 0; i < Math.round(seconds * 30); i++) frame(); };
  const pushStick = (x, z) => { push.set(x, 0, z); player.inputActive = x !== 0 || z !== 0; };
  // press jump until a ride takes it (a seat has to come round)
  function jumpWhenInReach(maxSeconds = 20) {
    for (let i = 0; i < maxSeconds * 30; i++) {
      if (live.jump(ctx)) return true;
      frame();
    }
    return false;
  }
  return { ...made, live, cat, player, session, ctx, camera, events, clock, frame, run, pushStick, jumpWhenInReach, DT };
}
const grounded = (w) => !w.session.perched && w.player.perchY === 0 && w.cat.position.y === 0 && isWalkableAt(w.area, w.cat.position.x, w.cat.position.z);

describe('the walk: a cat on the merry-go-round', () => {
  it('is a no-op anywhere but the Fairground', () => {
    expect(NO_FAIR.jump()).toBe(false);
    expect(NO_FAIR.canBoard()).toBe(false);
    expect(() => { NO_FAIR.update(); NO_FAIR.late(); NO_FAIR.dispose(); }).not.toThrow();
    expect(NO_FAIR.riding).toBeNull();
  });

  it('turns the ride whether or not she is on it, and adds nothing to the scene', () => {
    const w = walk({ at: { x: 0, z: 40 } });
    const count = () => { let n = 0; w.scene.traverse(() => n++); return n; };
    const before = count();
    const a0 = w.area.rides.merryGoRound.turn.rotation.y;
    w.run(1);
    expect(w.area.rides.merryGoRound.turn.rotation.y).not.toBe(a0);
    expect(count()).toBe(before);
    expect(w.live.riding).toBeNull();
    // far from every ride the jump is not the rides’ business
    expect(w.live.jump(w.ctx)).toBe(false);
    expect(w.live.canBoard(w.cat, w.player, w.session)).toBe(false);
  });

  it('gets her onto the platform with the jump button, carries her round, and up onto a horse with another', () => {
    const w = walk({ at: { x: 0, z: 5.15 } });
    expect(w.jumpWhenInReach()).toBe(true);
    const deck = w.session.perched;
    expect(deck.seatKind).toBe('deck');
    expect(w.live.riding).toBe(deck);
    expect(w.player.perchY).toBe(deck.y);
    expect(w.cat.position.y).toBe(deck.y);
    w.frame();
    const start = { x: w.cat.position.x, z: w.cat.position.z };
    w.run(1.7);
    // carried: she is on the seat, and it has moved
    expect(w.cat.position.x).toBe(deck.x);
    expect(w.cat.position.z).toBe(deck.z);
    expect(Math.hypot(w.cat.position.x - start.x, w.cat.position.z - start.z)).toBeGreaterThan(2);
    expect(w.cat.rotation.y).toBe(deck.yaw);
    expect(w.events.filter((e) => e.type === 'ride')).toEqual([{ type: 'ride', ride: 'mgr' }]);
    // up onto a horse
    expect(w.live.jump(w.ctx)).toBe(true);
    const horse = w.session.perched;
    expect(horse.seatKind).toBe('horse');
    const ys = [];
    for (let i = 0; i < 120; i++) { w.frame(); ys.push(w.cat.position.y); expect(w.cat.position.y).toBe(horse.y); expect(w.player.perchY).toBe(horse.y); }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.3); // she rises and falls with it
    // and on to the next, never back
    expect(w.live.jump(w.ctx)).toBe(true);
    expect(w.session.perched.seatKind).toBe('horse');
    expect(w.session.perched).not.toBe(horse);
    const third = w.session.perched;
    expect(w.live.jump(w.ctx)).toBe(true);
    expect(w.session.perched).not.toBe(horse);
    expect(w.session.perched).not.toBe(third);
    // still one ride: its line is said once
    expect(w.events.filter((e) => e.type === 'ride')).toHaveLength(1);
  });

  it('lets her off at any moment by pushing the stick: a short hop down to free ground, never a frame on the ground under the ride', () => {
    for (const wait of [0.1, 1.7, 3.3, 6.1, 9.9]) {
      const w = walk({ at: { x: 5.15, z: 0 }, clock: { T: 3000 + wait * 7 } });
      expect(w.jumpWhenInReach()).toBe(true);
      expect(w.live.jump(w.ctx)).toBe(true); // onto a horse
      w.run(wait);
      const horse = w.session.perched;
      w.pushStick(0, 1);
      w.frame();
      // the very frame the stick is pushed: off the seat, in the air at the seat's height
      expect(w.session.perched).toBeNull();
      expect(w.live.riding).toBeNull();
      expect(w.live.hopping).toBe(true);
      expect(w.player.perchY).toBeCloseTo(horse.y, 6);
      expect(w.cat.position.y).toBeCloseTo(horse.y, 6);
      let lastY = w.cat.position.y;
      let frames = 0;
      while (w.live.hopping) {
        w.frame();
        expect(w.cat.position.y).toBeLessThanOrEqual(lastY + 1e-9); // down, never up
        lastY = w.cat.position.y;
        expect(++frames).toBeLessThan(30);
      }
      w.pushStick(0, 0);
      expect(grounded(w), `after ${wait}s`).toBe(true);
      expect(Math.hypot(w.cat.position.x, w.cat.position.z)).toBeGreaterThan(sim.mgr.baseR + CAT_RADIUS);
      expect(w.events.at(-1)).toEqual({ type: 'dismount' });
      w.run(0.5);
      expect(grounded(w)).toBe(true);
    }
  });

  it('lets her off the platform with the jump button too when nothing is left to hop to, and ignores the button in mid-hop', () => {
    const w = walk({ at: { x: -5.15, z: 0 } });
    expect(w.jumpWhenInReach()).toBe(true);
    // (on the merry-go-round a horse is always in reach, so jump hops on; the stick is the way off)
    w.run(0.8);
    const fromX = w.cat.position.x;
    w.pushStick(-1, 0);
    w.frame();
    expect(w.live.hopping).toBe(true);
    expect(w.live.jump(w.ctx)).toBe(true); // taken, and nothing happens
    expect(w.session.perched).toBeNull();
    w.pushStick(0, 0);
    w.run(1);
    expect(grounded(w)).toBe(true);
    // she pushed west and came down to the west of where she stood
    expect(w.cat.position.x).toBeLessThan(fromX - 0.5);
  });

  it('keeps the camera outside the ride and on her side of it, and moves it gently', () => {
    const w = walk({ at: { x: 0, z: 5.15 } });
    expect(w.jumpWhenInReach()).toBe(true);
    w.live.jump(w.ctx);
    w.run(3); // the ride's camera has taken over
    expect(w.live.cameraWeight).toBeGreaterThan(0.99);
    const prev = new THREE.Vector3();
    const dir = new THREE.Vector3();
    let maxStep = 0;
    for (let i = 0; i < 30 * RIDE.MGR_TURN; i++) {
      prev.copy(w.camera.position);
      w.frame();
      maxStep = Math.max(maxStep, prev.distanceTo(w.camera.position));
      const r = Math.hypot(w.camera.position.x, w.camera.position.z);
      expect(r).toBeGreaterThan(5.0 + 1); // outside the canopy (MGR.canopyR)
      expect(w.camera.position.y).toBeGreaterThan(1.5);
      expect(w.camera.position.y).toBeLessThan(3.4); // low enough that she is seen under the canopy's rim (it lifts to look over the music box)
      // on her side: the cat is between the camera and the middle
      expect(w.camera.position.x * w.cat.position.x + w.camera.position.z * w.cat.position.z).toBeGreaterThan(0);
      // looking at her
      w.camera.getWorldDirection(dir);
      const to = new THREE.Vector3(w.cat.position.x, w.cat.position.y + 0.3, w.cat.position.z).sub(w.camera.position).normalize();
      expect(dir.dot(to)).toBeGreaterThan(0.99);
      expect(Math.abs(to.set(1, 0, 0).applyQuaternion(w.camera.quaternion).y)).toBeLessThan(1e-6); // no roll: its right-hand side is level
    }
    expect(maxStep).toBeLessThan(0.25); // metres a frame at 30 fps: it goes round as slowly as she does
    // and lets go gently when she gets off: no jump in the picture
    w.pushStick(0, 1);
    for (let i = 0; i < 90; i++) { prev.copy(w.camera.position); w.frame(); expect(prev.distanceTo(w.camera.position)).toBeLessThan(0.6); }
    expect(w.live.cameraWeight).toBe(0);
  });

  it('plays the music box’s tune near the ride, more quietly further off, and not at all far away', () => {
    const heard = (at) => { const w = walk({ at }); w.run(TUNE.NOTE * TUNE.notes.length); return w.events.filter((e) => e.type === 'note'); };
    const near = heard({ x: 0, z: 6 });
    const far = heard({ x: 0, z: 14 });
    const away = heard({ x: 0, z: 40 });
    // once through the tune (and the note the first frame lands on)
    const sounding = TUNE.notes.filter((f) => f > 0).length;
    expect(near.length).toBeGreaterThanOrEqual(sounding);
    expect(near.length).toBeLessThanOrEqual(sounding + 1);
    expect(far.length).toBe(near.length);
    expect(away).toHaveLength(0);
    for (const e of near) { expect(TUNE.notes).toContain(e.freq); expect(e.volume).toBeGreaterThan(0.5); expect(e.volume).toBeLessThanOrEqual(1); }
    expect(Math.max(...far.map((e) => e.volume))).toBeLessThan(Math.min(...near.map((e) => e.volume)));
    // it loops on the same clock as the ride: the same time, the same note
    const a = walk({ at: { x: 0, z: 6 }, clock: { T: 5000 } });
    const b = walk({ at: { x: 3, z: 6 }, clock: { T: 5000 } });
    a.run(2); b.run(2);
    expect(a.events.filter((e) => e.type === 'note').map((e) => e.freq)).toEqual(b.events.filter((e) => e.type === 'note').map((e) => e.freq));
  });

  it('leaves her on the ground when the walk ends, or is picked up again, while she is riding', () => {
    for (const T of [100, 104.4, 109.1]) {
      const w = walk({ at: { x: 0, z: 5.15 }, clock: { T } });
      expect(w.jumpWhenInReach()).toBe(true);
      w.live.jump(w.ctx);
      w.run(1.3);
      const seat = w.session.perched;
      // leaving the place: nothing throws, nothing is left riding
      expect(() => w.live.dispose()).not.toThrow();
      expect(w.live.riding).toBeNull();
      expect(w.live.hopping).toBe(false);
      // picked up again (game/walk.js): the note holds where she was; the walk
      // stands her on clear ground from there, and player.js keeps her out of colliders
      const spot = clearSpot({ x: seat.x, z: seat.z }, w.area.colliders, w.area.bounds, w.area.waters, 0.6);
      expect(isWalkableAt(w.area, spot.x, spot.z)).toBe(true);
      const again = walk({ at: spot, clock: { T: T + 500 } });
      again.run(0.5);
      expect(grounded(again)).toBe(true);
      expect(again.live.riding).toBeNull();
    }
  });
});

describe('the walk: a cat on the big wheel', () => {
  // Stand her on the boarding deck, as the ordinary jump does (it is one of the area's own perches).
  function onTheDeck(clock) {
    const w = walk({ at: { x: 0, z: -27 }, clock });
    const step = w.live.sim.wheel.step;
    w.session.perched = step;
    w.player.perchY = step.y;
    w.cat.position.set(step.x, step.y, step.z);
    return { ...w, step };
  }
  const noRoll = (camera) => Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).y);

  it('takes her from the deck into a gondola, up and over, across to the lookout, into the next gondola and back out onto the deck', () => {
    const w = onTheDeck({ T: 7000 });
    expect(w.live.canBoard(w.cat, w.player, w.session) || w.live.sim.jumpTarget(w.step, w.step).type === 'stay').toBe(true);
    expect(w.jumpWhenInReach()).toBe(true);
    // (the button may have been taken as "wait": press until she is aboard)
    for (let i = 0; i < 300 && !w.live.riding; i++) { w.frame(); w.live.jump(w.ctx); }
    const first = w.session.perched;
    expect(first.seatKind).toBe('gondola');
    w.frame();
    expect(w.events.filter((e) => e.type === 'ride').at(-1)).toEqual({ type: 'ride', ride: 'wheel' });
    // carried up: higher every second for half a turn, always on the seat
    const prev = new THREE.Vector3();
    let maxCam = 0;
    let topY = 0;
    for (let i = 0; i < 30 * (RIDE.WHEEL_TURN / 2 - 3); i++) {
      prev.copy(w.camera.position);
      w.frame();
      expect(w.cat.position.y).toBe(first.y);
      expect(w.cat.position.x).toBe(first.x);
      if (i > 60) maxCam = Math.max(maxCam, prev.distanceTo(w.camera.position));
      expect(noRoll(w.camera)).toBeLessThan(1e-6);
      topY = Math.max(topY, w.cat.position.y);
    }
    expect(topY).toBeGreaterThan(12);
    expect(maxCam).toBeLessThan(0.06); // the camera goes up as gently as she does
    // behind her and above: she looks out over the fair, and so does the picture
    expect(w.camera.position.z).toBeLessThan(w.cat.position.z - 4);
    expect(w.camera.position.y).toBeGreaterThan(w.cat.position.y + 1.5);
    // across to the lookout as she comes over the top
    for (let i = 0; i < 400 && w.session.perched === first; i++) { if (w.live.sim.jumpTarget(first, first).type === 'hop') w.live.jump(w.ctx); else w.frame(); }
    expect(w.session.perched.seatKind).toBe('lookout');
    expect(w.events.some((e) => e.type === 'lookout')).toBe(true);
    const lookoutY = w.cat.position.y;
    w.run(2);
    expect(w.cat.position.y).toBe(lookoutY); // it does not move
    expect(w.live.riding.seatKind).toBe('lookout');
    // the jump button waits for a gondola, then takes the next one
    for (let i = 0; i < 400 && w.session.perched.seatKind === 'lookout'; i++) { expect(w.live.jump(w.ctx)).toBe(true); w.frame(); }
    const second = w.session.perched;
    expect(second.seatKind).toBe('gondola');
    // down the other side, and out onto the deck at the bottom
    for (let i = 0; i < 30 * RIDE.WHEEL_TURN && w.session.perched === second; i++) {
      if (w.live.sim.jumpTarget(second, second).type === 'static') w.live.jump(w.ctx); else w.frame();
    }
    expect(w.session.perched).toBe(w.step);
    expect(w.live.riding).toBeNull();
    expect(w.player.perchY).toBe(w.step.y);
    expect([w.cat.position.x, w.cat.position.y, w.cat.position.z]).toEqual([w.step.x, w.step.y, w.step.z]);
    w.run(1);
    expect(w.session.perched).toBe(w.step); // and the rides leave her be
    expect(w.live.hopping).toBe(false);
    // one go on the wheel: its line once, however many seats she used
    expect(w.events.filter((e) => e.type === 'ride' && e.ride === 'wheel')).toHaveLength(1);
  });

  it('lets her off at any height with the stick: a hop down of under a second onto free ground clear of the wheel', () => {
    for (const ride of [2, 9, 17, 27, 38, 49]) {
      const w = onTheDeck({ T: 8000 + ride });
      for (let i = 0; i < 400 && !w.live.riding; i++) { w.live.jump(w.ctx); w.frame(); }
      const seat = w.session.perched;
      w.run(ride);
      const h = seat.y;
      w.pushStick(0, 1);
      w.frame();
      expect(w.live.hopping).toBe(true);
      expect(w.cat.position.y).toBeCloseTo(seat.y, 6); // not one frame on the ground under the wheel
      const prev = new THREE.Vector3();
      let frames = 0;
      let lastY = w.cat.position.y;
      while (w.live.hopping) {
        prev.copy(w.camera.position);
        w.frame();
        expect(w.cat.position.y).toBeLessThanOrEqual(lastY + 1e-9);
        lastY = w.cat.position.y;
        expect(prev.distanceTo(w.camera.position)).toBeLessThan(1.6); // the picture comes down with her, it does not jump
        expect(++frames).toBeLessThanOrEqual(28);
      }
      w.pushStick(0, 0);
      expect(grounded(w), `after ${ride}s at ${h.toFixed(1)}m`).toBe(true);
      expect(w.live.sim.swept(w.cat.position.x, w.cat.position.z)).toBe(false);
      expect(w.cat.position.z).toBeGreaterThan(-30); // she pushed south and is south of the wheel
    }
  });

  it('lets her off the lookout with the stick too, down to the ground behind the wheel', () => {
    const w = walk({ at: { x: 0, z: -34 } });
    const lookout = w.live.sim.wheel.lookout;
    w.session.perched = lookout;
    w.player.perchY = lookout.y;
    w.frame();
    expect(w.live.riding).toBe(lookout);
    w.pushStick(0, -1);
    w.frame();
    expect(w.live.hopping).toBe(true);
    w.pushStick(0, 0);
    w.run(1.2);
    expect(grounded(w)).toBe(true);
    expect(w.live.sim.swept(w.cat.position.x, w.cat.position.z)).toBe(false);
  });
});

describe('the first ride: one friendly line and a journal page', () => {
  function fakeStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)) }; }

  it('has a page and a line for every ride, in words a nine-year-old can read', () => {
    for (const ride of RIDE_IDS) {
      const page = RIDE_PAGE[ride];
      expect(JOURNAL_TYPES).toContain(page);
      const info = CRITTER_INFO.find((c) => c.id === page);
      expect(info.emoji).toBeTruthy();
      for (const text of [RIDE_TOASTS[ride](), RIDE_PAGE_WORDS[page].name(), RIDE_PAGE_WORDS[page].hint(), info.name, info.hint]) {
        expect(text.length).toBeGreaterThan(5);
        expect(text.length).toBeLessThan(80);
        expect(text).not.toMatch(/clan|warrior|kit\b|twoleg|territor|prey|apprentice/i);
        for (const word of text.replace(/[^A-Za-z' -]/g, '').split(/[\s-]+/)) expect(word.length, word).toBeLessThanOrEqual(12);
      }
    }
    expect(Object.keys(RIDE_PAGE)).toEqual(['mgr', 'wheel', 'cups', 'slide', 'coaster']);
    expect(JOURNAL_TYPES.slice(-5)).toEqual(Object.values(RIDE_PAGE));
  });

  it('shows the line the first time ever, fills the page once a walk, and pays nothing', () => {
    const progression = createProgression(fakeStorage());
    const log = createDiscoveryLog(progression);
    const toasts = [];
    const hud = { toast: (t) => toasts.push(t) };
    log.startWalk();
    const points = progression.state.points;
    expect(noteRide('mgr', { log, progression, hud })).toEqual({ fresh: true, first: true });
    expect(toasts).toEqual([RIDE_TOASTS.mgr()]);
    expect(progression.state.journal.ridemgr).toBe(1);
    // again on the same walk: nothing
    expect(noteRide('mgr', { log, progression, hud })).toEqual({ fresh: false, first: false });
    expect(toasts).toHaveLength(1);
    expect(progression.state.journal.ridemgr).toBe(1);
    // a walk picked up again does not count it twice
    const paid = log.entries();
    log.startWalk();
    log.restore(paid);
    expect(noteRide('mgr', { log, progression, hud }).fresh).toBe(false);
    // the next walk: the page counts it, the line is not said again
    log.startWalk();
    expect(noteRide('mgr', { log, progression, hud })).toEqual({ fresh: true, first: false });
    expect(progression.state.journal.ridemgr).toBe(2);
    expect(toasts).toHaveLength(1);
    expect(progression.state.points).toBe(points); // free, and it pays nothing
    expect(log.count(rideKey('mgr'))).toBe(1);
    // a ride that does not exist is nothing
    expect(noteRide('ghosttrain', { log, progression, hud })).toEqual({ fresh: false, first: false });
  });

  it('hands the tune to the audio and a puff of dust to the landing', () => {
    const notes = [];
    const bursts = [];
    const ctx = {
      audio: { musicBoxNote: (f, vol) => notes.push([f, vol]) }, hud: { toast() {} },
      session: { cat: { position: { x: 1, y: 0, z: 2 } }, fx: { burst: (...a) => bursts.push(a) } },
    };
    handleFairEvent({ type: 'note', freq: 1047, volume: 0.5 }, ctx);
    handleFairEvent({ type: 'dismount' }, ctx);
    handleFairEvent({ type: 'hop', ride: 'mgr' }, ctx);
    handleFairEvent({ type: 'something-else' }, ctx);
    expect(notes).toEqual([[1047, 0.5]]);
    expect(bursts).toHaveLength(1);
  });
});

describe('what moving costs', () => {
  it('draws exactly what the standing fair drew: the same meshes, the same triangles, merged or not', () => {
    const count = (s) => { let meshes = 0; let tris = 0; s.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return { meshes, tris }; };
    const a = builtFair();
    const before = count(a.scene);
    const live = createFairLive(a.scene, a.area, { now: () => 4321 });
    const cat = new THREE.Group();
    live.update(1 / 30, 0, { cat, player: { perchY: 0 }, session: { perched: null } });
    expect(count(a.scene)).toEqual(before);
    // merged as the walk merges it, the rides still turn (their Groups are kept apart)
    const b = builtFair();
    mergeStaticProps(b.scene);
    const merged = count(b.scene);
    const liveB = createFairLive(b.scene, b.area, { now: () => 4321 });
    liveB.update(1 / 30, 0, { cat, player: { perchY: 0 }, session: { perched: null } });
    expect(count(b.scene)).toEqual(merged);
    expect(b.area.rides.merryGoRound.turn.parent).toBe(b.area.rides.merryGoRound.group);
    expect(b.area.rides.merryGoRound.turn.rotation.y).toBe(liveB.sim.angles.mgr);
    expect(hopDownTime(0.4)).toBeLessThan(0.35);
    expect(hopDownTime(13)).toBeLessThanOrEqual(0.9);
  });
});
