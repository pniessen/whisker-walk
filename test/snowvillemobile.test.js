// Snowville round four: the snowmobile. The plan (a closed ring of lanes on the south-east lawn clear of everything solid, the garage and bench, two seat records, free hop-off spots reachable
// on foot, the ride always ends), the layout kept as it was, and the later milestones' tests below.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { floodFrom } from './helpers/flood.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';

stubCanvasDocument();
const { isWalkableAt } = await import('../src/player.js');
const { createPathRide, stepPath } = await import('../src/world/pathride.js');
const { loadSnowvilleStages } = await import('../src/world/snowvillestages.js');
await loadSnowvilleStages();
const { build } = await import('../src/world/snowville.js');
const M = await import('../src/world/snowvillemobileplan.js');
const L = await import('../src/world/snowvillesledplan.js');
const K = await import('../src/world/snowvilleskisplan.js');
const D = await import('../src/world/snowvilledetailplan.js');
const W = await import('../src/world/snowvillewingplan.js');
const P = await import('../src/world/snowvilleplan.js');
const Q = await import('../src/world/snowvillefindsplan.js');
const { strayHomes } = await import('../src/world/snowvillestrays.js');
const { createMobileLive } = await import('../src/world/snowvillemobilelive.js');
const { createSkisLive } = await import('../src/world/snowvilleskislive.js');
const { createSledLive } = await import('../src/world/snowvillesledlive.js');
const { createSnowvillePrompts } = await import('../src/world/snowvillelife.js');
const { phrase } = await import('../src/clanphrases.js');
const { createProgression, CATALOG } = await import('../src/progression.js');
const { MOBILE_LINES } = await import('../src/world/snowvillemobilewords.js');
const { measureWithLife, } = await import('./helpers/lifebudget.js');

const area = build(new THREE.Scene());
const B = P.SNOWVILLE_BOUNDS;
const inB = (x, z) => x > B.minX + 2 && x < B.maxX - 2 && z > B.minZ + 2 && z < B.maxZ - 2;

describe('the plan', () => {
  it('a closed ring on the south-east lawn, inside the bounds, away from the sled run and the ski slope', () => {
    expect(M.MOBILE_SPEC.loop).toBe(true);
    expect(M.MOBILE_SPEC.vMax).toBeLessThanOrEqual(6.5 + 1e-9);
    expect(M.MOBILE_LEN).toBeGreaterThan(30);
    expect(M.LAPS).toBe(2);
    for (const p of M.MOBILE_PATH) expect(inB(p.x, p.z)).toBe(true);
    for (const a of M.MOBILE_PATH) for (const b of [...L.RUN_PATH, ...K.SKI_PATH]) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(5);
  });
  it('the whole ride ends in under forty seconds even at the slowest speed', () => {
    expect(M.RIDE_LEN / M.MOBILE_SPEC.vMin).toBeLessThan(40);
  });
  it('the ring and its lane are clear of every solid, the finds, the mice and the friendly strays\' ground', () => {
    const solids = [...area.colliders];
    for (let s = 0; s < M.MOBILE_LEN; s += 0.5) {
      const p = M.mobilePos(s);
      for (const c of solids) expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `s ${s} vs ${JSON.stringify(c)}`).toBeGreaterThan(M.MOBILE_SPEC.laneHalf + 0.3);
      for (const z of Object.values(Q.SNOWVILLE_FIND_ZONES).flat()) expect(Math.hypot(p.x - z.x, p.z - z.z)).toBeGreaterThan(z.r + 1.0);
      for (const m of [...Q.SNOWVILLE_GOLD, ...Q.SNOWVILLE_COLLECTIBLES]) expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeGreaterThan(1.8);
      for (const h of strayHomes()) expect(Math.hypot(p.x - h.x, p.z - h.z), `${h.id} at s ${s}`).toBeGreaterThan(h.roam + M.MOBILE_SPEC.laneHalf);
    }
  });
  it('the garage and the bench stand clear of the lane and of the solids, in bounds,', () => {
    for (const t of [M.GARAGE, M.BENCH]) {
      let near = Infinity;
      for (let s = 0; s < M.MOBILE_LEN; s += 0.25) { const p = M.mobilePos(s); near = Math.min(near, Math.hypot(t.x - p.x, t.z - p.z)); }
      expect(near, JSON.stringify(t)).toBeGreaterThan(M.MOBILE_SPEC.laneHalf + 0.9);
      for (const c of [...P.snowvilleColliders(), ...W.wingColliders(), ...D.detailColliders(), ...K.skiColliders()]) expect(Math.hypot(t.x - c.x, t.z - c.z) - c.r - t.r).toBeGreaterThan(0.8);
      expect(inB(t.x, t.z)).toBe(true);
    }
    expect(Math.hypot(M.GARAGE.x - M.START.x, M.GARAGE.z - M.START.z)).toBeLessThan(M.REACH + 1.5);
  });
  it('every hop-off spot is free and in bounds, and reachable on foot from the spawn; a free spot is near every point of the ring and by the garage', () => {
    expect(M.MOBILE_HOPS.length).toBeGreaterThanOrEqual(12);
    const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
    for (const h of M.MOBILE_HOPS) {
      expect(inB(h.x, h.z)).toBe(true);
      for (const c of area.colliders) expect(Math.hypot(h.x - c.x, h.z - c.z) - c.r, JSON.stringify(h)).toBeGreaterThan(1.0);
      expect(flood.reachesWithin(h.x, h.z, 1.0), JSON.stringify(h)).toBe(true);
    }
    expect(Math.min(...M.MOBILE_HOPS.map((h) => Math.hypot(h.x - M.START.x, h.z - M.START.z)))).toBeLessThan(4);
    for (let s = 0; s < M.MOBILE_LEN; s += 1) { const p = M.mobilePos(s); expect(Math.min(...M.MOBILE_HOPS.map((h) => Math.hypot(h.x - p.x, h.z - p.z))), `s ${s}`).toBeLessThan(6); }
  });
  it('the detail plan\'s things are where they were (the lane\'s keep-out moved none): the counts of birches, stumps, snowmen and the well', () => {
    expect([D.birches().length, D.stumps().length, D.snowmen().length, D.detailColliders().length]).toEqual([10, 8, 3, 22]);
  });
});

describe('the two seats', () => {
  it('a seat record for the front and the back, a pure function of the machine, a little apart along its heading, at the seat height', () => {
    const r = createPathRide(M.MOBILE_PATH, M.MOBILE_SPEC, 5);
    const a = M.seatRecord(r, 0); const b = M.seatRecord(r, 1);
    expect(a.y).toBe(M.MOBILE.seatY);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.5);
    expect(M.seatRecord(r, 0)).toEqual(a);
    const ahead = (a.x - b.x) * Math.sin(r.heading) + (a.z - b.z) * Math.cos(r.heading);
    expect(ahead).toBeGreaterThan(0);
    expect(Math.abs(a.yaw - (r.heading + Math.PI))).toBeLessThan(1e-9);
  });
});

describe('the ride', () => {
  const ride = (steer) => {
    let r = createPathRide(M.MOBILE_PATH, M.MOBILE_SPEC, 0);
    let t = 0; let dist = 0;
    while (dist < M.RIDE_LEN - M.FINISH && t < 60) {
      const prev = r.s;
      r = stepPath(r, steer(r, t), 1 / 30, M.MOBILE_SPEC, M.MOBILE_PATH);
      dist += (((r.s - prev) % M.MOBILE_LEN) + M.MOBILE_LEN) % M.MOBILE_LEN;
      t += 1 / 30;
    }
    return { t, dist, r };
  };
  it('every stick, even a broken one, finishes the whole ride in under forty seconds, inside the lane', () => {
    for (const stick of [() => null, () => ({ fwd: -1, side: 0 }), () => ({ fwd: 1, side: 1 }), () => ({ fwd: NaN, side: Infinity }), (r, t) => ({ fwd: Math.sin(t * 5.3), side: Math.cos(t * 3.1) })]) {
      const run = ride(stick);
      expect(run.t).toBeLessThan(40);
      expect(run.dist).toBeGreaterThanOrEqual(M.RIDE_LEN - M.FINISH);
      expect(Math.abs(run.r.lat)).toBeLessThanOrEqual(M.MOBILE_SPEC.laneHalf + 1e-9);
    }
  });
});

// ---- M2: the drawing ---------------------------------------------------------------------------------------------------------------------
const { buildMobile, buildMobileGeometry } = await import('../src/world/snowvillemobileparts.js');
const { snowvilleMaterials } = await import('../src/world/snowvilleparts.js');

describe('the drawing', () => {
  it('the garage and the bench are solid in the place (stage c fills its slot), and the ring adds no mesh and no caster to the build', () => {
    for (const t of [M.GARAGE, M.BENCH]) expect(area.colliders.some((c) => c.x === t.x && c.z === t.z)).toBe(true);
    const scene = new THREE.Scene();
    build(scene);
    expect(scene.children.filter((o) => o.isMesh).length).toBe(6);
  });
  it('the machine is one vertex-coloured mesh, not a caster, a chunky size, standing on the ground facing +z, and small enough to fit the row', () => {
    const m = buildMobile(snowvilleMaterials());
    expect(m.isMesh).toBe(true);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    const tris = m.geometry.attributes.position.count / 3;
    expect(tris).toBeGreaterThan(500);
    expect(tris).toBeLessThan(1200);
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    expect(bb.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(bb.min.y).toBeLessThan(0.1);
    expect(bb.max.z).toBeGreaterThan(1); // the skis curl out in front
    expect(bb.max.z - bb.min.z).toBeGreaterThan(M.MOBILE.len - 0.4);
    expect(bb.max.x - bb.min.x).toBeLessThan(1.1);
    for (const n of ['position', 'normal', 'uv', 'color']) expect(buildMobileGeometry().attributes[n]).toBeTruthy();
  });
});

// ---- the live on a walk (a stand-in session, cat, player and camera) ---------------------------------------------------------------------
function rig(reducedMotion = false, extra = {}) {
  const scene = new THREE.Scene();
  const ticks = [];
  const added = [];
  const audio = { tick: () => ticks.push(1), fanfare: () => ticks.push('fanfare') };
  const progression = { addPoints: (n) => added.push(n), ...(extra.progression ?? {}) };
  const live = createMobileLive({ scene, reducedMotion, tier: null, audio, progression });
  const cat = new THREE.Object3D();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 3, 0);
  const player = { perchY: 0, inputActive: false, dir: { x: 0, z: 0 }, inputDirection() { return this.dir; }, halt() { this.halted = (this.halted ?? 0) + 1; } };
  const fairLog = [];
  const orig = { update: () => fairLog.push('orig'), late: () => undefined, jump: () => 'origjump', pawKind: () => 'origpaw', canBoard: () => true, groundSpot: () => ({ x: 1, z: 2 }), riding: null, marker: 'dot' };
  const session = { cat, ground: area.ground, perched: null, perchHold: null, idleTime: 5, fair: orig, remotes: { list: [] }, fx: { burst() {} } };
  const home = () => cat.position.set(M.START.x + 1.2, area.ground.y(M.START.x + 1.2, M.START.z), M.START.z + 0.5);
  home();
  let t = 0;
  const tick = (dt = 1 / 30) => { t += dt; live.frame(dt, t, cat.position, camera, session); session.fair.update(dt, t, { cat, player, session }); session.fair.late(dt, t, { cat, player, session }); };
  return { scene, live, cat, camera, player, session, orig, fairLog, tick, ticks, added, home };
}
const press = (r) => { const line = r.live.slots.riding.promptAt(r.cat.position) ?? r.live.slots.mobile.promptAt(r.cat.position); r.live.interact(); r.tick(); return line; };
const freeSpot = (p) => M.MOBILE_HOPS.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < 0.02);
const drive = (r, stick, limit = 1500) => { let n = 0; while (r.live.mode === 'riding' && n++ < limit) { r.player.inputActive = !!stick; r.player.dir = stick ? stick(r, n / 30) : { x: 0, z: 0 }; r.tick(); } return n; };

describe('on a walk: a solo ride', () => {
  it('the machine waits at the garage: near it she is offered "Hop on", far away nothing', () => {
    const r = rig();
    r.tick();
    expect(r.live.mode).toBe('parked');
    expect(r.live.slots.mobile.promptAt(r.cat.position)).toBe('Hop on');
    expect(r.live.slots.mobile.promptAt(new THREE.Vector3(0, 0, 25))).toBeNull();
    expect(r.live.slots.riding.promptAt(r.cat.position)).toBeNull();
    expect(r.live.mobile.visible).toBe(true);
    expect(Math.hypot(r.live.mobile.position.x - M.START.x, r.live.mobile.position.z - M.START.z)).toBeLessThan(0.01);
    r.live.dispose();
  });
  it('she hops on: the fair marked riding on the front seat, her pose seated, the camera carried; two laps, then home at the garage on a free spot with a cheer', () => {
    const r = rig();
    r.tick();
    press(r);
    expect(r.live.mode).toBe('riding');
    expect(r.session.perched.pose).toBe('requestPet');
    expect(r.session.fair.riding).toEqual({ id: 'snow-mobile', seat: 0 });
    expect(r.player.perchY).toBe(M.MOBILE.seatY);
    expect(r.session.fair.jump()).toBe(false);
    expect(r.session.fair.pawKind()).toBe('none');
    const s0 = M.seatRecord(r.live.ride, 0);
    expect(Math.hypot(r.cat.position.x - s0.x, r.cat.position.z - s0.z)).toBeLessThan(0.05);
    expect(Math.hypot(r.live.mobile.position.x - r.live.ride.x, r.live.mobile.position.z - r.live.ride.z)).toBeLessThan(0.05);
    let last = 0; let vmax = 0; let n = 0;
    while (r.live.mode === 'riding' && n++ < 1300) { r.tick(); if (r.live.mode === 'riding') { expect(r.live.state.travelled).toBeGreaterThanOrEqual(last - 1e-9); last = r.live.state.travelled; vmax = Math.max(vmax, r.live.state.v); } }
    expect(n).toBeLessThan(40 * 30 + 30);
    expect(r.live.mode).toBe('parked');
    expect(last).toBeGreaterThan(M.MOBILE_LEN); // more than one lap
    expect(r.session.perched).toBeNull();
    expect(r.session.fair.riding).toBeNull();
    expect(r.player.perchY).toBe(0);
    expect(freeSpot(r.cat.position)).toBe(true);
    expect(Math.hypot(r.cat.position.x - M.START.x, r.cat.position.z - M.START.z)).toBeLessThan(4.5); // home at the garage
    expect(vmax).toBeLessThanOrEqual(M.MOBILE_SPEC.vMax + 1e-6);
    expect(r.live.rides).toBe(1);
    expect(Math.hypot(r.live.mobile.position.x - M.START.x, r.live.mobile.position.z - M.START.z)).toBeLessThan(0.01);
    r.live.dispose();
  });
  it('"Hop off" anywhere on the ride: onto the nearest free spot, every time along it', () => {
    for (const stop of [1, 20, 90, 200, 500, 900]) {
      const r = rig();
      r.tick(); press(r);
      for (let i = 0; i < stop && r.live.mode === 'riding'; i++) r.tick();
      if (r.live.mode !== 'riding') { r.live.dispose(); continue; }
      expect(r.live.slots.riding.promptAt(r.cat.position)).toBe('Hop off');
      expect(r.live.slots.mobile.promptAt(r.cat.position)).toBeNull();
      const ride = { ...r.live.ride };
      expect(press(r)).toBe('Hop off');
      expect(r.live.mode).toBe('parked');
      expect(freeSpot(r.cat.position)).toBe(true);
      const best = Math.min(...M.MOBILE_HOPS.map((h) => Math.hypot(h.x - ride.x, h.z - ride.z)));
      expect(Math.hypot(r.cat.position.x - ride.x, r.cat.position.z - ride.z)).toBeLessThanOrEqual(best + 0.5);
      expect(r.session.perched).toBeNull();
      r.live.dispose();
    }
  });
  it('a sweep of sticks: never off the lane, never stuck, always set down on a free spot, the ride over in under forty seconds', () => {
    const sticks = [null, () => ({ x: 0, z: 0 }), (r, t) => ({ x: Math.sin(t * 4), z: Math.cos(t * 3) }), () => ({ x: 1, z: 0 }), () => ({ x: -1, z: 0 }), () => ({ x: 0, z: 1 }), () => ({ x: 0, z: -1 }), () => ({ x: NaN, z: 0 })];
    for (const st of sticks) {
      const r = rig();
      r.tick(); press(r);
      let n = 0;
      while (r.live.mode === 'riding' && n++ < 1400) {
        r.player.inputActive = !!st; r.player.dir = st ? st(r, n / 30) : { x: 0, z: 0 };
        r.tick();
        expect(Math.abs(r.live.state.lat)).toBeLessThanOrEqual(M.MOBILE_SPEC.laneHalf + 1e-6);
      }
      expect(r.live.mode, String(st)).toBe('parked');
      expect(n, String(st)).toBeLessThan(40 * 30 + 30);
      expect(freeSpot(r.cat.position)).toBe(true);
      r.live.dispose();
    }
  });
  it('3 paws once a walk and no more; a quiet chug while she rides', () => {
    const r = rig();
    const ends = [];
    r.live.onRideEnd = (e) => ends.push(e);
    r.tick(); press(r);
    drive(r, null);
    expect(ends).toEqual([{ rides: 1, seat: 0 }]);
    expect(r.added).toEqual([3]);
    expect(r.ticks.length).toBeGreaterThan(20);
    r.home(); r.tick(); press(r);
    drive(r, null);
    expect(ends.length).toBe(2);
    expect(r.added).toEqual([3]);
    r.live.dispose();
  });
  it('a walk that ends while she rides sets her down on a free spot and puts the fair back', () => {
    const r = rig();
    r.tick(); press(r);
    for (let i = 0; i < 30; i++) r.tick();
    expect(r.session.fair.update).not.toBe(r.orig.update);
    const gs = r.session.fair.groundSpot();
    expect(M.MOBILE_HOPS.some((h) => h.x === gs.x && h.z === gs.z)).toBe(true);
    r.live.dispose();
    expect(freeSpot(r.cat.position)).toBe(true);
    expect(r.session.perched).toBeNull();
    expect(r.session.fair).toBe(r.orig);
    expect(r.scene.children.length).toBe(0);
  });
  it('the fair it replaced still runs while she is off the machine, and is handed back its calls', () => {
    const r = rig();
    r.tick();
    expect(r.fairLog.length).toBeGreaterThan(0);
    expect(r.session.fair.jump()).toBe('origjump');
    expect(r.session.fair.pawKind()).toBe('origpaw');
    expect(r.session.fair.groundSpot()).toEqual({ x: 1, z: 2 });
    r.live.dispose();
  });
  it('reduced motion: she still rides, the machine does not sway and nothing chugs', () => {
    const r = rig(true);
    r.tick(); press(r);
    for (let i = 0; i < 40; i++) r.tick();
    expect(r.live.mobile.rotation.z).toBe(0);
    expect(r.live.state.travelled).toBeGreaterThan(2);
    drive(r, null);
    expect(r.ticks.length).toBe(0);
    r.live.dispose();
  });
  it('beside the sled and the skis: the three fairs chain, one at a time, and the walk ends with the fair as it was', () => {
    const r = rig();
    const sled = createSledLive({ scene: r.scene, reducedMotion: false, tier: null });
    const skis = createSkisLive({ scene: r.scene, reducedMotion: false, tier: null, audio: null, progression: null });
    sled.frame(1 / 30, 0.03, r.cat.position, r.camera, r.session);
    skis.frame(1 / 30, 0.03, r.cat.position, r.camera, r.session);
    r.tick();
    const prompts = createSnowvillePrompts({ promptAt: () => null, interact: () => null }, null, null, sled, skis, r.live);
    expect(prompts.promptAt(r.cat.position)).toBe('Hop on');
    prompts.interact(); r.tick();
    expect(r.live.mode).toBe('riding');
    expect(sled.mode).toBe('parked');
    expect(skis.mode).toBe('parked');
    expect(prompts.promptAt(r.cat.position)).toBe('Hop off');
    prompts.interact(); r.tick();
    expect(r.live.mode).toBe('parked');
    r.live.dispose(); skis.dispose(); sled.dispose();
    expect(r.session.fair).toBe(r.orig);
  });
});

describe('the second seat (co-walk)', () => {
  const partnerAt = (s, seatId = 'snow-mobile') => {
    const group = new THREE.Object3D();
    const p = M.mobilePos(s);
    const rec = M.seatRecord({ x: p.x, z: p.z, heading: p.heading }, seatId === 'snow-mobile' ? 0 : 1);
    group.position.set(rec.x, 0, rec.z);
    group.rotation.y = rec.yaw;
    return { seatId, group };
  };
  it('a partner who rides on her own device is drawn on the machine here: it is put under her seat, and goes back to the garage when she gets off', () => {
    const r = rig();
    const p = partnerAt(12);
    r.session.remotes.list.push(p);
    r.tick();
    const mp = M.mobilePos(12);
    expect(Math.hypot(r.live.mobile.position.x - mp.x, r.live.mobile.position.z - mp.z)).toBeLessThan(0.02);
    expect(Math.abs(r.live.mobile.rotation.y - mp.heading)).toBeLessThan(1e-6);
    p.seatId = null;
    r.tick();
    expect(Math.hypot(r.live.mobile.position.x - M.START.x, r.live.mobile.position.z - M.START.z)).toBeLessThan(0.01);
    r.live.dispose();
  });
  it('a back-seat partner is drawn on the machine too (her seat is a little behind the front one)', () => {
    const r = rig();
    r.session.remotes.list.push(partnerAt(20, 'snow-mobile-1'));
    r.tick();
    const mp = M.mobilePos(20);
    expect(Math.hypot(r.live.mobile.position.x - mp.x, r.live.mobile.position.z - mp.z)).toBeLessThan(0.02);
    r.live.dispose();
  });
  it('two riders: she who hops on while a partner is aboard is offered the back seat, sits on it (id snow-mobile-1, seat 1), and joins the ride where the partner is for one lap', () => {
    const r = rig();
    const p = partnerAt(14);
    r.session.remotes.list.push(p);
    const at = M.mobilePos(14);
    r.cat.position.set(at.x + 1.0, area.ground.y(at.x, at.z), at.z);
    r.tick();
    expect(r.live.slots.mobile.promptAt(r.cat.position)).toBe('Hop on the back seat');
    press(r);
    expect(r.live.mode).toBe('riding');
    expect(r.live.seat).toBe(1);
    expect(r.session.fair.riding).toEqual({ id: 'snow-mobile-1', seat: 1 });
    expect(Math.abs(r.live.state.s - 14)).toBeLessThan(0.8);
    const s1 = M.seatRecord(r.live.ride, 1);
    expect(Math.hypot(r.cat.position.x - s1.x, r.cat.position.z - s1.z)).toBeLessThan(0.05);
    expect(r.live.state.length).toBe(M.MOBILE_LEN);
    r.session.remotes.list.length = 0; // (the partner's own machine is hers: she leaves midway)
    let n = 0;
    while (r.live.mode === 'riding' && n++ < 1300) r.tick();
    expect(r.live.mode).toBe('parked');
    expect(n).toBeLessThan(20 * 30);
    expect(freeSpot(r.cat.position)).toBe(true);
    expect(r.session.fair.riding).toBeNull();
    r.live.dispose();
  });
  it('a partner who leaves midway changes nothing for a rider: the machine goes on and ends normally (and the partner appearing midway changes nothing either)', () => {
    const r = rig();
    r.tick(); press(r);
    expect(r.live.seat).toBe(0);
    const p = partnerAt(5, 'snow-mobile-1');
    for (let i = 0; i < 60; i++) { r.tick(); if (i === 20) r.session.remotes.list.push(p); if (i === 40) r.session.remotes.list.length = 0; }
    expect(r.live.mode).toBe('riding');
    expect(r.session.fair.riding).toEqual({ id: 'snow-mobile', seat: 0 });
    expect(Math.hypot(r.live.mobile.position.x - r.live.ride.x, r.live.mobile.position.z - r.live.ride.z)).toBeLessThan(0.05);
    drive(r, null);
    expect(r.live.mode).toBe('parked');
    expect(r.live.rides).toBe(1);
    expect(r.added).toEqual([3]);
    r.live.dispose();
  });
  it('the seat ids pass the remote cats\' check (letters, dashes and at most two digits, 24 characters)', () => {
    for (const id of M.SEAT_IDS) { expect(id.length).toBeLessThanOrEqual(24); expect(/^[a-z]+(-[a-z]+)*(-\d{1,2})?$/.test(id)).toBe(true); }
  });
});

describe('the Snowmobile Helmet: the first ride home, or the garage bench, once', () => {
  const real = () => createProgression(memoryStorage());
  it('a ride that comes home gives it (a fanfare and a line), once; a ride she hops off early gives nothing', () => {
    const pr = real();
    const r = rig(false, { progression: pr });
    r.tick(); press(r);
    for (let i = 0; i < 60; i++) r.tick();
    press(r); // hop off early
    expect(pr.state.unlocked.accessories).not.toContain('snowhelmet');
    expect(r.ticks.filter((x) => x === 'fanfare').length).toBe(0);
    r.home(); r.tick(); press(r);
    drive(r, null);
    expect(r.live.rides).toBe(2);
    expect(pr.state.unlocked.accessories).toContain('snowhelmet');
    expect(pr.state.foundWear).toContain('snowhelmet');
    expect(r.ticks.filter((x) => x === 'fanfare').length).toBe(1);
    r.home(); r.tick(); press(r);
    drive(r, null);
    expect(r.ticks.filter((x) => x === 'fanfare').length).toBe(1);
    r.live.dispose();
  });
  it('the bench: no helmet on it until she has ridden three times, then "Take the helmet from the bench" once; an owned helmet is not offered again', () => {
    const pr = real();
    const r = rig(false, { progression: pr });
    const atBench = () => r.cat.position.set(M.BENCH.x + 1.0 * Math.cos(M.BENCH.yaw), area.ground.y(M.BENCH.x, M.BENCH.z), M.BENCH.z - 1.0 * Math.sin(M.BENCH.yaw));
    atBench(); r.tick();
    expect(r.live.slots.mobile.promptAt(r.cat.position)).not.toBe('Take the helmet from the bench');
    for (let i = 0; i < M.HELMET_RIDES; i++) { r.home(); r.tick(); press(r); for (let k = 0; k < 20; k++) r.tick(); press(r); } // three early hop-offs
    expect(r.live.rides).toBe(M.HELMET_RIDES);
    expect(pr.state.unlocked.accessories).not.toContain('snowhelmet');
    atBench(); r.tick();
    expect(r.live.slots.mobile.promptAt(r.cat.position)).toBe('Take the helmet from the bench');
    r.live.interact(); r.tick();
    expect(pr.state.unlocked.accessories).toContain('snowhelmet');
    expect(r.live.slots.mobile.promptAt(r.cat.position)).not.toBe('Take the helmet from the bench');
    r.live.dispose();
  });
  it('it is a free found outfit in the catalog (a head piece for Snowville) and a hat the cat can wear', () => {
    expect(CATALOG.accessories.snowhelmet).toMatchObject({ slot: 'head', price: 0, prize: true, find: 'snowville' });
  });
});

describe('the words', () => {
  it('every snowmobile line, in both word sets, plain, with no banned word', () => {
    for (const id of Object.keys(MOBILE_LINES)) {
      const on = phrase(id);
      expect(on, id).toBe(MOBILE_LINES[id]);
      const off = withOffWords(() => phrase(id));
      expect(off, id).toBe(MOBILE_LINES[id]);
      expect(withOffWords(() => bannedIn(off)), id).toBeNull();
      expect(/dark|lost forever|trapped|stuck|collapse|scary/i.test(MOBILE_LINES[id])).toBe(false);
    }
    for (const word of ['Snowmobile Helmet']) expect(withOffWords(() => bannedIn(word))).toBeNull();
  });
});

describe('the row', () => {
  it('the machine is the one new mesh of the walk\'s life: build 6 meshes / 2 casters, whole frame 37 / 3, under the ring\'s bound', () => {
    const r = measureWithLife(build);
    expect(r.build.meshes).toBe(6);
    expect(r.build.casters).toBe(2);
    expect(r.life.meshes).toBe(31);
    expect(r.whole.meshes).toBe(37);
    expect(r.whole.casters).toBe(3);
    expect(r.whole.triangles).toBeLessThanOrEqual(50231);
    expect(r.build.triangles).toBeLessThanOrEqual(47400);
  });
});
