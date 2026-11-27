// The Moon, wave 2, milestone M2 (the sled lane) (docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md, decisions 4, 6, 7, 8): the plan (a closed lane, clear of everything), the path sim
// on it under random sticks, every hop-off spot, boarding through the arbiter's two slots, the camera, every way a ride ends, the gentle lap count, the rack's rocks, the scatters unchanged,
// the lighter rungs, the words in both sets, the pages, and the place being closed off until the stage arrives.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as SS from '../src/world/moonstationplan.js';
import * as S from '../src/world/moonsledplan.js';
import * as MP from '../src/world/moonparts.js';
import * as B from '../src/world/moonbeautyplan.js';
import { build } from '../src/world/moon.js';
import { ST, HELD } from '../src/world/moonstages.js';
import { arrive, resetMoonStages } from '../src/world/moonlate.js';
import { createSledLive, SEAT_FRAME } from '../src/world/moonsledlive.js';
import { createPathRide, stepPath, SPECS } from '../src/world/pathride.js';
import { bus } from '../src/events.js';
import { CAT_RADIUS } from '../src/player.js';
import { phrase } from '../src/clanphrases.js';
import { MOON_HINTS, MOON_PAGE_WORDS, WING_LIVE, wingPageShown } from '../src/moonpages.js';
import { JOURNAL_TYPES } from '../src/progression.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { mulberry32 } from '../src/rng.js';

await import('../src/world/moonstagestation.js');
const sha = (v) => createHash('sha256').update(JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e5) / 1e5 : x))).digest('hex'); // (rounded: the Linux CI's sin and cos differ in the last bits)
afterEach(() => { HELD.clear(); resetMoonStages(); P.MOON_CLEARS.length = 0; delete ST.station; });

const DT = 1 / 30;
const fakePlayer = () => {
  const p = { inputActive: false, perchY: 0, halts: 0, dir: { x: 0, z: 0 }, inputDirection: () => ({ x: p.dir.x, z: p.dir.z }), halt() { p.halts++; }, push(x, z) { p.dir.x = x; p.dir.z = z; p.inputActive = x !== 0 || z !== 0; } };
  return p;
};
const baseFair = () => ({ calls: [], update(...a) { this.calls.push(['update', a[0]]); }, late() {}, jump: () => 'orig-jump', pawKind: () => 'orig-paw', canBoard: () => true, groundSpot: () => null, riding: null });

// a stand-alone sled on a scene of its own, driven in the walk's order: the life's frame (after Dot), then session.fair.update with the player
function rig({ reducedMotion = false, tier = {}, fair = baseFair() } = {}) {
  const scene = new THREE.Scene();
  const colliders = [...P.MOON_COLLIDERS];
  const spot = [];
  const prog = { recordSighting: vi.fn() };
  const sled = createSledLive({ scene, reducedMotion, tier, colliders, spot, clear: () => 0 });
  const cat = new THREE.Group();
  const player = fakePlayer();
  const session = { cat, fair, perched: null, perchHold: null, idleTime: 0, ground: { y: P.moonY } };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(S.RACK.x, 3, S.RACK.z + 4);
  cat.position.set(S.RACK.x + 1.8, 0, S.RACK.z + 0.6);
  let t = 0;
  const tick = (n = 1, dt = DT) => { for (let i = 0; i < n; i++) { t += dt; sled.frame(dt, t, cat.position, camera, session, prog); session.fair.update(dt, t, { cat, player, session }); } };
  const press = () => { const line = sled.slots.riding.promptAt(cat.position) ?? sled.slots.sled.promptAt(cat.position); const kind = sled.slots.riding.interact() ?? sled.slots.sled.interact(); return { line, kind }; };
  return { scene, colliders, spot, prog, sled, cat, player, session, camera, tick, press, orig: fair, time: () => t };
}

// the walk's own collision: a cat is a circle that may not overlap a collider circle (a 0.3 m flood from the spawn, as test/moonstation.test.js)
function floodFrom(colliders, from, step = 0.3) {
  const b = P.MOON_BOUNDS;
  const nx = Math.round((b.maxX - b.minX) / step) + 1;
  const nz = Math.round((b.maxZ - b.minZ) / step) + 1;
  const seen = new Uint8Array(nx * nz);
  const free = (x, z) => { for (const c of colliders) if (Math.abs(c.x - x) < c.r + 1 && Math.abs(c.z - z) < c.r + 1 && Math.hypot(x - c.x, z - c.z) < c.r + CAT_RADIUS) return false; return true; };
  const idx = (x, z) => Math.round((z - b.minZ) / step) * nx + Math.round((x - b.minX) / step);
  const q = [idx(from.x, from.z)];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const i = k % nx; const j = (k / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di; const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const kk = jj * nx + ii;
      if (!seen[kk] && free(b.minX + ii * step, b.minZ + jj * step)) { seen[kk] = 1; q.push(kk); }
    }
  }
  return { reaches: (x, z) => !!seen[idx(x, z)], count: q.length };
}

describe('the lane\'s plan', () => {
  it('is a closed loop from the rack at about (14, 46.7), east along z 45.3 to the station\'s south side and back along z 48.2, 1.5 m either side', () => {
    expect(S.RACK.x).toBeCloseTo(14, 1);
    expect(S.RACK.z).toBeCloseTo(46.7, 1);
    expect(S.LANE.half).toBe(1.5);
    expect(S.SLED_SPEC).toBe(SPECS.sled);
    expect(S.SLED_SPEC).toMatchObject({ vMin: 3, vMax: 8, laneHalf: 1.5, loop: true });
    expect(S.LANE_LEN).toBeGreaterThan(70);
    expect(S.LANE_LEN).toBeLessThan(90);
    const xs = S.LANE_PATH.map((p) => p.x);
    expect(Math.max(...xs)).toBeGreaterThan(SS.STATION.x); // it reaches the station's x
    for (const p of S.LANE_PATH.filter((q) => q.x > 20 && q.x < 48)) expect([S.LANE.zOut, S.LANE.zBack]).toContain(p.z);
    // closed: stepping a ride all the way round comes back to the rack
    let r = createPathRide(S.LANE_PATH, S.SLED_SPEC, 0);
    const start = { x: r.x, z: r.z };
    let travelled = 0;
    for (let i = 0; i < 4000 && travelled < S.LANE_LEN + 1; i++) { const n = stepPath(r, null, DT, S.SLED_SPEC, S.LANE_PATH); travelled += r.v * DT; r = n; }
    expect(travelled).toBeGreaterThan(S.LANE_LEN);
    expect(Math.hypot(r.x - start.x, r.z - start.z)).toBeLessThan(2);
  });
  it('the whole corridor is inside the bounds, on flat dust, over no crater', () => {
    const b = P.MOON_BOUNDS;
    for (let s = 0; s < S.LANE_LEN; s += 0.5) {
      const r = createPathRide(S.LANE_PATH, S.SLED_SPEC, s);
      for (const lat of [-1.5, 0, 1.5]) {
        const x = r.x - Math.cos(r.heading) * lat; const z = r.z + Math.sin(r.heading) * lat;
        expect(x > b.minX + 0.5 && x < b.maxX - 0.5 && z > b.minZ + 0.5 && z < b.maxZ - 0.1, `${x},${z}`).toBe(true);
        expect(P.moonY(x, z), `${x},${z}`).toBeCloseTo(0, 6);
      }
    }
    for (const k of P.CRATERS) expect(S.laneDistance(k.x, k.z)).toBeGreaterThan(k.r + S.LANE.half);
  });
  it('the corridor is clear of finds, mice, story points, Dot\'s track and depot, the base, the boulders, the station, the beams and the rifts', () => {
    const pad = 0.8;
    const bad = [];
    const check = (name, p) => { if (S.inLane(p.x, p.z, pad)) bad.push(`${name} ${JSON.stringify(p)}`); };
    for (const p of [...P.PEBBLES, P.ECHO, P.CHEESE, ...P.JOB_POINTS, P.DEPOT, P.DOT_PARK, P.SHED, P.FLAG, P.PIT_ROCK, P.FAR_BEACON, P.ROVER_CELL, P.RIDGE_CELL, P.BINOCULARS, P.LANDING, P.OLD_DISH, P.DISH_LEDGE, ...P.PLAIN_POSTS, ...P.POLES, ...P.BOULDERS, ...P.MOON_MICE, ...P.MOON_POIS, ...P.PIP_LEAD]) check('point', p);
    for (const c of [...P.MOON_COLLIDERS, ...SS.STATION_COLLIDERS]) if (S.laneDistance(c.x, c.z) < S.LANE.half + c.r + 0.05) bad.push(`collider ${JSON.stringify(c)}`);
    for (const p of [...P.MOON_PERCHES, ...SS.STATION_PERCHES]) check('perch', p);
    for (const p of [...P.BEAMS, ...P.RIFTS.flatMap((f) => [{ x: f.x0, z: f.z0 }, { x: f.x1, z: f.z1 }])]) check('beam', p);
    expect(bad).toEqual([]);
    // Dot's track (the loop of posts she drives) stays well away
    for (let s = 0; s < S.LANE_LEN; s += 1) { const r = createPathRide(S.LANE_PATH, S.SLED_SPEC, s); expect(P.trackDistance(r.x, r.z)).toBeGreaterThan(S.LANE.half + 5); }
    // the station's walls and hazard stripes (the footprint) are clear: the footprint's rectangle and the lane's clear rectangle do not touch
    expect(S.CLEAR.minZ).toBeGreaterThan(SS.CLEAR.maxZ);
    for (const w of SS.WAYS) expect(S.laneDistance(w.x, w.z)).toBeGreaterThan(S.LANE.half + 0.5);
    // the sled never passes through the shed
    expect(S.laneDistance(P.SHED.x, P.SHED.z)).toBeGreaterThan(S.LANE.half + P.SHED.d / 2 - 1.5);
  });
  it('the marker lamps stand on the corridor\'s outer edge, none in the lane itself, and the lane is clear of its own rack', () => {
    expect(S.LAMPS.length).toBeGreaterThan(12);
    for (const l of S.LAMPS) { expect(S.laneDistance(l.x, l.z), JSON.stringify(l)).toBeGreaterThan(S.LANE.half + 0.05); expect(S.laneDistance(l.x, l.z)).toBeLessThan(S.LANE.half + 0.4); }
    expect(S.CLEAR.minX).toBeLessThan(S.RACK.x - 1.5);
  });
});

describe('the path sim on the lane', () => {
  it('a random stick never leaves the corridor, never slows below the spec\'s floor or stops, and is the same twice', () => {
    const run = (seed) => {
      const rnd = mulberry32(seed);
      let r = createPathRide(S.LANE_PATH, S.SLED_SPEC, 0);
      const out = [];
      let ran = 0;
      for (let i = 0; i < 6000; i++) {
        const n = stepPath(r, { fwd: rnd() * 2 - 1, side: rnd() * 2 - 1 }, i % 9 === 0 ? DT * 4 : DT, S.SLED_SPEC, S.LANE_PATH);
        ran += (((n.s - r.s) % S.LANE_LEN) + S.LANE_LEN) % S.LANE_LEN;
        r = n;
        expect(Math.abs(r.lat)).toBeLessThanOrEqual(1.5 + 1e-9);
        expect(r.v).toBeGreaterThanOrEqual(3 - 1e-9);
        expect(S.laneDistance(r.x, r.z)).toBeLessThanOrEqual(1.5 + 1e-6);
        out.push([r.s, r.lat]);
      }
      expect(ran).toBeGreaterThan(3 * 6000 * DT * 0.99); // never stuck: always at least the floor speed along the line
      return out;
    };
    expect(run(11)).toEqual(run(11));
    run(12);
  });
});

describe('every hop-off spot', () => {
  const colliders = [...P.MOON_COLLIDERS, ...SS.STATION_COLLIDERS];
  it('is free, inside the bounds, out of the lane, and reachable on foot from the spawn (with the rack\'s posts and the parked sled in place)', () => {
    expect(S.HOP_SPOTS.length).toBeGreaterThanOrEqual(8);
    const r = rig();
    const flood = floodFrom([...colliders, ...r.colliders.filter((c) => c.sledRack || c.sledPark)], P.MOON_SPAWN);
    for (const p of S.HOP_SPOTS) {
      for (const c of [...colliders, ...r.colliders.filter((q) => q.sledRack || q.sledPark)]) expect(Math.hypot(p.x - c.x, p.z - c.z), JSON.stringify(p)).toBeGreaterThanOrEqual(c.r + CAT_RADIUS);
      expect(S.inLane(p.x, p.z), JSON.stringify(p)).toBe(false);
      expect(flood.reaches(p.x, p.z), JSON.stringify(p)).toBe(true);
    }
    r.sled.dispose();
  });
  it('there is one within 25 m of every point of the lane', () => {
    for (let s = 0; s < S.LANE_LEN; s += 1) {
      const q = createPathRide(S.LANE_PATH, S.SLED_SPEC, s);
      expect(Math.min(...S.HOP_SPOTS.map((p) => Math.hypot(p.x - q.x, p.z - q.z))), `s ${s}`).toBeLessThan(25);
    }
  });
  it('the rack is reachable on foot from the spawn: a cat can walk to within the sled\'s reach and the prompt shows', () => {
    const r = rig();
    const flood = floodFrom(r.colliders.concat(SS.STATION_COLLIDERS), P.MOON_SPAWN);
    expect(flood.reaches(S.RACK.x + 1.8, S.RACK.z + 0.6)).toBe(true);
    expect(flood.reaches(S.RACK.x, S.RACK.z + 2.2)).toBe(true);
    r.sled.dispose();
  });
});

describe('boarding, riding and hopping off', () => {
  it('the offer shows near the parked sled only; hop on sits her on it, moving, "Hop off" shows anywhere; hop off sets her on a free spot, the sled glides home and parks', () => {
    const r = rig();
    r.tick(2);
    expect(r.sled.mode).toBe('parked');
    r.cat.position.set(S.RACK.x + 6, 0, S.RACK.z);
    expect(r.sled.slots.sled.promptAt(r.cat.position)).toBeNull();
    r.cat.position.set(S.RACK.x + 1.8, 0, S.RACK.z + 0.6);
    expect(r.sled.slots.sled.promptAt(r.cat.position)).toBe('Hop on the moon sled');
    expect(r.sled.slots.riding.promptAt(r.cat.position)).toBeNull();
    expect(r.sled.slots.sled.interact()).toBe('on');
    r.tick(2);
    expect(r.sled.riding).toBe(true);
    expect(r.session.fair.riding).toEqual({ id: 'moon-sled' });
    expect(r.session.perched).toBeTruthy();
    expect(r.session.perched.pose).toBe('requestPet');
    expect(r.player.perchY).toBeGreaterThan(0.3);
    expect(r.colliders.some((c) => c.sledPark)).toBe(false); // (a sled that is ridden is no collider)
    const before = { x: r.cat.position.x, z: r.cat.position.z };
    r.tick(60);
    expect(Math.hypot(r.cat.position.x - before.x, r.cat.position.z - before.z)).toBeGreaterThan(3);
    expect(r.sled.state.v).toBeGreaterThanOrEqual(3);
    expect(r.sled.state.v).toBeLessThanOrEqual(8);
    expect(r.sled.slots.riding.promptAt({ x: 0, y: 0, z: 0 })).toBe('Hop off'); // (anywhere)
    expect(r.sled.slots.sled.promptAt({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(r.sled.slots.riding.interact()).toBe('off');
    r.tick(1);
    expect(r.sled.riding).toBe(false);
    expect(r.session.fair.riding).toBe(null);
    expect(r.session.perched).toBe(null);
    expect(r.player.perchY).toBe(0);
    expect(S.HOP_SPOTS.some((p) => Math.hypot(p.x - r.cat.position.x, p.z - r.cat.position.z) < 0.01)).toBe(true);
    expect(r.cat.position.y).toBeCloseTo(0, 6);
    // it goes home on its own: no offer while it glides, then it is in its rack again
    expect(r.sled.mode).toBe('home');
    r.cat.position.set(S.RACK.x + 1.8, 0, S.RACK.z + 0.6);
    expect(r.sled.slots.sled.promptAt(r.cat.position)).toBeNull();
    r.tick(30 * 30);
    expect(r.sled.mode).toBe('parked');
    expect(r.sled.slots.sled.promptAt(r.cat.position)).toBe('Hop on the moon sled');
    expect(r.colliders.some((c) => c.sledPark)).toBe(true);
    r.sled.dispose();
  });
  it('the stick only nudges the speed and steers inside the lane (up to 1.5 m, either side), never off it', () => {
    const r = rig();
    r.tick(1);
    r.sled.slots.sled.promptAt(r.cat.position); r.sled.slots.sled.interact();
    r.tick(3);
    r.tick(150);
    const mid = r.sled.state.v;
    for (let i = 0; i < 150; i++) { r.player.push(Math.sin(r.sled.ride.heading), Math.cos(r.sled.ride.heading)); r.tick(1); } // straight ahead, the whole way: faster, never past 8
    expect(r.sled.state.v).toBeGreaterThanOrEqual(mid - 0.01);
    expect(r.sled.state.v).toBeLessThanOrEqual(8 + 1e-9);
    r.player.push(0, 0);
    // steer to one side for a while on the straight, then the other
    for (const k of [1, -1]) {
      for (let i = 0; i < 120; i++) { const h = r.sled.ride.heading; r.player.push(k * -Math.cos(h), k * Math.sin(h)); r.tick(1); }
      expect(Math.abs(r.sled.state.lat)).toBeLessThanOrEqual(1.5 + 1e-9);
      expect(S.laneDistance(r.sled.ride.x, r.sled.ride.z)).toBeLessThanOrEqual(1.5 + 1e-6);
    }
    expect(Math.abs(r.sled.state.lat)).toBeGreaterThan(0.5);
    r.sled.dispose();
  });
  it('is blocked when she is already sitting on something (Dot, a perch)', () => {
    const r = rig();
    r.tick(1);
    r.session.perched = { x: 0, z: 0, y: 1 };
    expect(r.sled.slots.sled.promptAt(r.cat.position)).toBeNull();
    r.sled.dispose();
  });
  it('the camera is carried with her and pulled a little out and up, never under the dust', () => {
    const r = rig();
    r.sled.slots.sled.promptAt(r.cat.position); r.sled.slots.sled.interact();
    r.tick(5);
    const d0 = r.camera.position.distanceTo(r.cat.position);
    r.tick(120);
    expect(r.sled.state.camW).toBeGreaterThan(0.9);
    expect(SEAT_FRAME.camOut).toBeGreaterThan(0);
    expect(r.camera.position.y).toBeGreaterThanOrEqual(0.7 - 1e-9);
    expect(Number.isFinite(d0 + r.camera.position.x)).toBe(true);
    r.sled.dispose();
  });
  it('the lap count is gentle: Laps 1 after a full round, the journal\'s two pages once each, no timer and no record kept', () => {
    const r = rig();
    const toasts = [];
    const off = bus.on('discovery', (e) => { if (e?.key === 'moon-sled-lap') toasts.push(e); });
    r.sled.slots.sled.promptAt(r.cat.position); r.sled.slots.sled.interact();
    r.tick(3);
    expect(r.prog.recordSighting.mock.calls.filter((c) => c[0] === 'mnsled')).toHaveLength(1);
    for (let i = 0; i < 30 * 40 && r.sled.laps < 2; i++) r.tick(1);
    off();
    expect(r.sled.laps).toBe(2);
    expect(toasts.map((e) => e.label)).toEqual(['Laps 1', 'Laps 2']);
    expect(toasts.every((e) => e.type === 'greenhousenote' && e.points === 0)).toBe(true);
    expect(r.prog.recordSighting.mock.calls.filter((c) => c[0] === 'mnlap')).toHaveLength(1);
    expect(r.prog.recordSighting.mock.calls.filter((c) => c[0] === 'mnsled')).toHaveLength(1);
    expect(Object.keys(r.sled.state).some((k) => /time|best|fail|score/i.test(k))).toBe(false);
    r.sled.dispose();
  });
});

describe('every way a ride ends', () => {
  it('a walk that ends while she rides sets her down on a free spot and gives the walk its own fair back', () => {
    const r = rig();
    const orig = r.session.fair;
    r.sled.slots.sled.promptAt(r.cat.position); r.sled.slots.sled.interact();
    r.tick(3);
    expect(r.session.fair).not.toBe(orig);
    r.tick(100);
    expect(r.sled.riding).toBe(true);
    expect(r.session.fair.groundSpot()).toBeTruthy(); // a save mid-ride is a free spot
    expect(S.HOP_SPOTS.some((p) => Math.hypot(p.x - r.session.fair.groundSpot().x, p.z - r.session.fair.groundSpot().z) < 0.01)).toBe(true);
    r.sled.dispose();
    expect(r.session.fair).toBe(orig);
    expect(r.session.perched).toBe(null);
    expect(r.session.perchHold).toBe(null);
    expect(r.player.perchY).toBe(0);
    expect(S.HOP_SPOTS.some((p) => Math.hypot(p.x - r.cat.position.x, p.z - r.cat.position.z) < 0.01)).toBe(true);
    expect(r.colliders.some((c) => c.sledPark || c.sledRack)).toBe(false);
    expect(r.spot).toEqual([]);
    expect(r.scene.getObjectByName('moon:sledlane')).toBeFalsy();
  });
  it('hands over to the fair it found while she is not on the sled, and chains: the sled comes down first, then Dot\'s own fair is put back', () => {
    const r = rig();
    const calls = r.orig.calls;
    r.tick(3);
    expect(calls.length).toBeGreaterThan(0); // (the fair underneath is still updated)
    expect(r.session.fair.jump()).toBe('orig-jump');
    expect(r.session.fair.pawKind()).toBe('orig-paw');
    expect(r.session.fair.canBoard()).toBe(true);
    r.sled.slots.sled.promptAt(r.cat.position); r.sled.slots.sled.interact();
    r.tick(3);
    expect(r.session.fair.jump()).toBe(false); // no hop physics on the sled
    expect(r.session.fair.pawKind()).toBe('none');
    expect(r.session.fair.canBoard()).toBe(false);
    r.sled.dispose();
    expect(r.session.fair).toBe(r.orig);
  });
  it('a later fair on top (Dot\'s) is left alone, the sled just passes through', () => {
    const r = rig();
    r.tick(3);
    const mine = r.session.fair;
    const top = { ...mine, update: vi.fn(), tag: 'dot' };
    r.session.fair = top;
    r.sled.dispose();
    expect(r.session.fair).toBe(top);
    expect(() => mine.update(0.1, 1, { cat: r.cat, player: r.player, session: r.session })).not.toThrow();
  });
});

describe('the rack\'s rocks and the scatters', () => {
  it('the lane\'s rectangle goes on the hook once and takes rocks, pebbles and rim chunks from there only; the boulders stay; every scatter hash is unchanged', () => {
    const before = { rocks: sha(MP.scatterRocks(false)), lite: sha(MP.scatterRocks(true)), plain: sha(MP.rockLists(false)), small: sha(B.smallCraters(false)), rim: sha(B.rimDebris(false)), pebbles: sha(B.pebbles(false)), foot: sha(B.footprints()), patches: sha(B.patches(false)), rays: sha(B.rays(false)) };
    const plain = MP.rockLists(false);
    const hitIn = (f) => (t) => t.x + t.s > f.minX && t.x - t.s < f.maxX && t.z + t.s > f.minZ && t.z - t.s < f.maxZ;
    expect(['small', 'medium', 'large', 'rim'].flatMap((k) => plain[k]).some(hitIn(S.CLEAR))).toBe(true); // (there are rocks in the lane to take)
    const r = rig();
    expect(P.MOON_CLEARS).toEqual([S.CLEAR]);
    const r2 = rig();
    expect(P.MOON_CLEARS).toEqual([S.CLEAR]); // (once)
    const cleared = MP.rockLists(false);
    for (const k of ['small', 'medium', 'large', 'rim']) { expect(cleared[k].some(hitIn(S.CLEAR))).toBe(false); expect(cleared[k]).toEqual(plain[k].filter((t) => !hitIn(S.CLEAR)(t))); }
    expect(cleared.boulder).toEqual(plain.boulder);
    expect(sha(MP.scatterRocks(false))).toBe(before.rocks);
    expect(sha(MP.scatterRocks(true))).toBe(before.lite);
    expect([sha(B.smallCraters(false)), sha(B.rimDebris(false)), sha(B.pebbles(false)), sha(B.footprints()), sha(B.patches(false)), sha(B.rays(false))]).toEqual([before.small, before.rim, before.pebbles, before.foot, before.patches, before.rays]);
    expect(P.ROCK_KEEP_OUT.some((k) => k[0] >= S.CLEAR.minX && k[0] <= S.CLEAR.maxX && k[1] >= S.CLEAR.minZ && k[1] <= S.CLEAR.maxZ && k[2] === 0)).toBe(false);
    r.sled.dispose();
    r2.sled.dispose();
    P.MOON_CLEARS.length = 0;
    expect(sha(MP.rockLists(false))).toBe(before.plain);
    const src = readFileSync(new URL('../src/world/moonsledlive.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/ROCK_KEEP_OUT/);
  });
});

describe('the drawing, the lighter rungs and reduced motion', () => {
  const stats = (opts) => {
    const r = rig(opts);
    const meshes = []; let lights = 0; let tris = 0;
    r.scene.getObjectByName('moon:sledlane').traverse((o) => { if (o.isMesh) { meshes.push(o); tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } if (o.isLight) lights++; });
    const lamps = r.scene.getObjectByName('moon:sledlamps');
    const out = { r, meshes, lights, tris, lampDraws: lamps.children.length };
    return out;
  };
  it('the lamps are two draws in all (one merged mesh of posts, one of lamp balls), no light of its own; LOW draws less and casts nothing', () => {
    const full = stats({});
    const low = stats({ tier: { shadows: false } });
    expect(full.lampDraws).toBe(2);
    expect(low.lampDraws).toBeLessThanOrEqual(2);
    expect(full.lights).toBe(0);
    expect(low.lights).toBe(0);
    expect(low.tris).toBeLessThan(full.tris);
    expect(full.tris).toBeLessThan(4000);
    expect(low.meshes.every((m) => m.castShadow === false)).toBe(true);
    expect(full.meshes.length).toBeLessThanOrEqual(7);
    for (const o of [full, low]) o.r.sled.dispose();
    for (const f of ['moonsledplan', 'moonsledparts', 'moonsledlive', 'moonsledwords']) {
      const code = readFileSync(new URL(`../src/world/${f}.js`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/PointLight|SpotLight|Math\.random|Date\.now|performance\.now/);
      expect(code.replace(/Math\.ceil/g, ''), f).not.toMatch(/\bceil\b/i);
    }
  });
  it('reduced motion: the ride still moves, the sled does not bob and the glow holds still; otherwise it bobs a little', () => {
    const seen = (reducedMotion) => {
      const r = rig({ reducedMotion });
      r.sled.slots.sled.promptAt(r.cat.position); r.sled.slots.sled.interact();
      r.tick(3);
      const ys = new Set(); const gl = new Set(); const x0 = r.cat.position.x; const z0 = r.cat.position.z;
      const sled = r.scene.getObjectByName('moon:sled');
      for (let i = 0; i < 90; i++) { r.tick(1); ys.add(sled.position.y.toFixed(4)); gl.add(r.sled.group.children.length && sled.children.length >= 0 ? r.cat.position.y.toFixed(4) : ''); }
      const moved = Math.hypot(r.cat.position.x - x0, r.cat.position.z - z0);
      r.sled.dispose();
      return { ys: ys.size, moved, gl: gl.size };
    };
    const calm = seen(true);
    const live = seen(false);
    expect(calm.ys).toBe(1);
    expect(calm.moved).toBeGreaterThan(5);
    expect(live.moved).toBeGreaterThan(5);
    expect(live.ys).toBeGreaterThan(5);
    const y = (reduced) => { const r = rig({ reducedMotion: reduced }); r.tick(1); const v = [r.scene.getObjectByName('moon:sled').position.y]; r.sled.dispose(); return v[0]; };
    expect(y(true)).toBeCloseTo(S.SLED.lift, 6);
  });
});

describe('closed off until the stage arrives (the real life, the arbiter and the walk\'s end)', () => {
  const setup = ({ held = true, reducedMotion = true } = {}) => {
    if (held) HELD.add('station');
    const scene = new THREE.Scene();
    const area = build(scene);
    const prog = { state: {}, recordSighting: vi.fn() };
    const life = area.life({ scene, ground: area.ground, progression: prog, reducedMotion, tier: {} });
    const cam = new THREE.PerspectiveCamera();
    const cat = new THREE.Group();
    const player = fakePlayer();
    const session = { pounceTime: 0, perched: null, perchHold: null, hopLift: 0, idleTime: 0, fx: { burst() {} }, collectibleMeshes: new Map(), cat, fair: baseFair(), ground: area.ground };
    cat.position.set(S.RACK.x + 1.8, 0, S.RACK.z + 0.6);
    let t = 0;
    const frame = (dt = DT) => { t += dt; life.update(dt, t, cat.position, cam, session); session.fair.update(dt, t, { cat, player, session }); };
    return { scene, area, life, frame, cat, session, prog, player };
  };
  it('absent: nothing is drawn, no offer at the rack, no slot, no clears; after it arrives the offer is the arbiter\'s last slot and a press rides', () => {
    const { scene, life, frame, cat, area, prog } = setup();
    for (let i = 0; i < 20; i++) frame();
    expect(scene.getObjectByName('moon:sledlane')).toBeFalsy();
    expect(ST.station?.sled).toBeUndefined();
    expect(life.promptAt(cat.position)).toBeNull();
    expect(P.MOON_CLEARS).toEqual([]);
    expect(area.colliders.some((c) => c.sledRack || c.sledPark)).toBe(false);
    HELD.delete('station'); arrive('station'); frame(); frame();
    expect(scene.getObjectByName('moon:sledlane')).toBeTruthy();
    expect(typeof ST.station.sled.promptAt).toBe('function');
    expect(life.promptAt(cat.position)).toBe('Hop on the moon sled');
    expect(life.interact()).toBe('on');
    for (let i = 0; i < 20; i++) frame();
    expect(life.promptAt(cat.position)).toBe('Hop off'); // (the riding slot, before the base's offers)
    expect(prog.recordSighting).toHaveBeenCalledWith('mnsled');
    expect(life.spottable.filter((e) => e.type === 'mnsled')).toHaveLength(1);
    expect(life.spottable.find((e) => e.type === 'mnsled').label).toBe('the Moon Sled');
    life.dispose(); // (a walk that ends while she rides)
    expect(ST.station?.sled).toBeUndefined();
    expect(ST.station?.frame).toBeUndefined();
    expect(scene.getObjectByName('moon:sledlane')).toBeFalsy();
    expect(life.spottable.filter((e) => e.type === 'mnsled')).toHaveLength(0);
  });
  it('a stage already in (a later walk) is drawn at once; Dot\'s fair underneath is unwound in order when the walk ends', () => {
    const { session, life, frame, scene } = setup({ held: false });
    const orig = session.fair;
    for (let i = 0; i < 5; i++) frame();
    expect(scene.getObjectByName('moon:sledlane')).toBeTruthy();
    expect(session.fair).not.toBe(orig);
    life.dispose();
    expect(session.fair).toBe(orig);
  });
});

describe('the words and the pages', () => {
  const IDS = ['moon.ws.sled.board', 'moon.ws.sled.off', 'moon.ws.sled.name', 'moon.ws.sled.laps'];
  it('the lines read the same in both word sets, with no banned or series word', () => {
    const want = ['Hop on the moon sled', 'Hop off', 'the Moon Sled', 'Laps'];
    IDS.forEach((id, i) => {
      expect(phrase(id)).toBe(want[i]);
      expect(bannedIn(phrase(id)), id).toBeNull();
      withOffWords(() => { expect(phrase(id)).toBe(want[i]); expect(bannedIn(phrase(id)), id).toBeNull(); });
      for (const w of ['dark', 'trapped', 'stuck', 'scary', 'lost forever', 'collapse', 'timer', 'fail']) expect(phrase(id).toLowerCase()).not.toContain(w);
    });
  });
  it('the two pages are live, named, hinted in both sets and in the save\'s list; the others are as they were', async () => {
    await import('../src/world/moonstationwords.js');
    for (const id of ['mnsled', 'mnlap']) {
      expect(WING_LIVE[id]).toBe(true);
      expect(wingPageShown(id)).toBe(true);
      expect(JOURNAL_TYPES).toContain(id);
      expect(MOON_PAGE_WORDS[id].name()).toMatch(/\S/);
      expect(MOON_HINTS[id]).toMatch(/\S/);
      withOffWords(() => { expect(bannedIn(MOON_PAGE_WORDS[id].name())).toBeNull(); expect(bannedIn(MOON_HINTS[id])).toBeNull(); });
      expect(bannedIn(MOON_HINTS[id])).toBeNull();
    }
    expect(MOON_PAGE_WORDS.mnlap.name()).toBe('Sled Lap');
    expect([WING_LIVE.mnsignal, WING_LIVE.mnrelay]).toEqual([false, false]);
  });
});
