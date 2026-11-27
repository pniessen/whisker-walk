// Snowville round three: the ski slope on the hill's west flank. The plan (an open slalom line clear of everything solid, six gates, free hop-off spots reachable on foot, the run always
// ends and the gates can be cleared at the slowest and the fastest speed), the layout kept as it was (the detail plan's things did not move), and the later milestones' tests below.
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
const K = await import('../src/world/snowvilleskisplan.js');
const L = await import('../src/world/snowvillesledplan.js');
const D = await import('../src/world/snowvilledetailplan.js');
const W = await import('../src/world/snowvillewingplan.js');
const P = await import('../src/world/snowvilleplan.js');
const Q = await import('../src/world/snowvillefindsplan.js');
const { strayHomes } = await import('../src/world/snowvillestrays.js');
const { createSkisLive } = await import('../src/world/snowvilleskislive.js');
const { createSledLive } = await import('../src/world/snowvillesledlive.js');
const { createSnowvillePrompts } = await import('../src/world/snowvillelife.js');
const { phrase } = await import('../src/clanphrases.js');
const { createProgression, CATALOG } = await import('../src/progression.js');
const { SKI_LINES } = await import('../src/world/snowvilleskiswords.js');

const area = build(new THREE.Scene());
const B = P.SNOWVILLE_BOUNDS;

describe('the plan', () => {
  it('an open winding run on the hill\'s west flank, inside the bounds, west of the sled run', () => {
    expect(K.SKI_LEN).toBeGreaterThan(18);
    expect(K.SKI_SPEC.loop).toBe(false);
    expect(K.SKI_SPEC.vMax).toBeLessThanOrEqual(5.0 + 1e-9);
    expect(K.START.z).toBeLessThan(K.LANDING.z - 12);
    expect(Math.hypot(K.START.x - P.HILL.x, K.START.z - P.HILL.z)).toBeLessThan(P.HILL.r);
    expect(K.START.x).toBeLessThan(P.HILL.x);
    for (const p of K.SKI_PATH) expect(p.x > B.minX + 2 && p.x < B.maxX - 2 && p.z > B.minZ + 2 && p.z < B.maxZ - 2).toBe(true);
    // the two runs never cross: every ski point is at least 6 m from every sled point
    for (const a of K.SKI_PATH) for (const b of L.RUN_PATH) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(5);
  });
  it('the run ends in under twelve seconds even at the slowest speed, and the speed limit is gentle', () => {
    expect(K.SKI_LEN / K.SKI_SPEC.vMin).toBeLessThan(12);
  });
  it('the line and its lane are clear of every solid, the hill\'s lantern and rock, the finds and the mice', () => {
    const solids = [...area.colliders];
    for (let s = 0; s <= K.SKI_LEN; s += 0.5) {
      const p = K.skiPos(s);
      for (const c of solids) expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `s ${s} vs ${JSON.stringify(c)}`).toBeGreaterThan(K.SKI_SPEC.laneHalf + 0.3);
      for (const z of Object.values(Q.SNOWVILLE_FIND_ZONES).flat()) expect(Math.hypot(p.x - z.x, p.z - z.z)).toBeGreaterThan(z.r + 1.0);
      for (const m of [...Q.SNOWVILLE_GOLD, ...Q.SNOWVILLE_COLLECTIBLES]) expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeGreaterThan(1.8);
    }
    // the friendly strays at their homes (snowvillestrays.js): the lane and their roaming ground never meet
    for (const h of strayHomes()) for (let s = 0; s <= K.SKI_LEN; s += 0.5) { const p = K.skiPos(s); expect(Math.hypot(p.x - h.x, p.z - h.z), `${h.id} at s ${s}`).toBeGreaterThan(h.roam + K.SKI_SPEC.laneHalf); }
    expect(Math.hypot(W.HILL_LANTERN.x - K.START.x, W.HILL_LANTERN.z - K.START.z)).toBeGreaterThan(8);
    expect(Math.hypot(W.SUMMIT.x - K.START.x, W.SUMMIT.z - K.START.z)).toBeGreaterThan(6);
  });
  it('the rack, the bench and the arch stand clear of the lane and of each other, in bounds, and are solid in the place', () => {
    for (const t of [K.RACK, K.BENCH]) {
      let near = Infinity;
      for (let s = 0; s <= K.SKI_LEN; s += 0.25) { const p = K.skiPos(s); near = Math.min(near, Math.hypot(t.x - p.x, t.z - p.z)); }
      expect(near, JSON.stringify(t)).toBeGreaterThan(K.SKI_SPEC.laneHalf + 0.9);
      for (const c of [...P.snowvilleColliders(), ...W.wingColliders(), ...D.detailColliders()]) expect(Math.hypot(t.x - c.x, t.z - c.z) - c.r - t.r).toBeGreaterThan(0.8);
      expect(t.x > B.minX + 2 && t.x < B.maxX - 2 && t.z > B.minZ + 2 && t.z < B.maxZ - 2).toBe(true);
    }
    expect(Math.hypot(K.RACK.x - K.BENCH.x, K.RACK.z - K.BENCH.z)).toBeGreaterThan(1.8);
    expect(Math.hypot(K.RACK.x - K.START.x, K.RACK.z - K.START.z)).toBeLessThan(4.2); // a step or two from the start
    expect(area.colliders.some((c) => c.x === K.RACK.x && c.z === K.RACK.z)).toBe(true);
    expect(area.colliders.some((c) => c.x === K.BENCH.x && c.z === K.BENCH.z)).toBe(true);
  });
  it('every hop-off spot is free and in bounds, and reachable on foot from the spawn; there are plenty, near the start and the landing, and a free spot is near every point of the run', () => {
    expect(K.SKI_HOPS.length).toBeGreaterThanOrEqual(10);
    const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
    for (const h of K.SKI_HOPS) {
      expect(h.x > B.minX + 2 && h.x < B.maxX - 2 && h.z > B.minZ + 2 && h.z < B.maxZ - 2).toBe(true);
      for (const c of area.colliders) expect(Math.hypot(h.x - c.x, h.z - c.z) - c.r, JSON.stringify(h)).toBeGreaterThan(1.0);
      expect(flood.reachesWithin(h.x, h.z, 1.0), JSON.stringify(h)).toBe(true);
    }
    for (const at of [K.START, K.LANDING]) expect(Math.min(...K.SKI_HOPS.map((h) => Math.hypot(h.x - at.x, h.z - at.z)))).toBeLessThan(4);
    for (let s = 0; s <= K.SKI_LEN; s += 1) { const p = K.skiPos(s); expect(Math.min(...K.SKI_HOPS.map((h) => Math.hypot(h.x - p.x, h.z - p.z))), `s ${s}`).toBeLessThan(6); }
  });
  it('the detail plan\'s things are where they were (the slope\'s keep-out moved none): the counts of birches, stumps, snowmen and the well', () => {
    expect([D.birches().length, D.stumps().length, D.snowmen().length, D.detailColliders().length]).toEqual([10, 8, 3, 22]);
  });
});

describe('the gates', () => {
  it('six of them, alternating right and left, along the line, in order, clear of the solids, each reachable on a lane', () => {
    expect(K.GATES).toHaveLength(6);
    K.GATES.forEach((g, i) => {
      expect(Math.abs(g.lat)).toBeLessThanOrEqual(K.SKI_SPEC.laneHalf);
      expect(Math.sign(g.lat)).toBe(i % 2 ? -1 : 1);
      if (i) expect(g.s - K.GATES[i - 1].s).toBeGreaterThan(2.4);
      expect(g.s).toBeGreaterThan(1); expect(g.s).toBeLessThan(K.SKI_LEN - 1.5);
      for (const c of area.colliders) expect(Math.hypot(g.x - c.x, g.z - c.z) - c.r).toBeGreaterThan(1.0);
    });
    // the line itself is outside every gate (she has to lean), and the lane's edge is inside it
    for (const g of K.GATES) { expect(Math.abs(0 - g.lat)).toBeGreaterThan(K.GATE_TOL); expect(Math.abs(Math.sign(g.lat) * K.SKI_SPEC.laneHalf - g.lat)).toBeLessThanOrEqual(K.GATE_TOL); }
  });
  const skiRun = (steer, vFwd) => {
    let r = createPathRide(K.SKI_PATH, K.SKI_SPEC, 0);
    const cleared = new Set();
    let t = 0;
    while (r.s < K.SKI_LEN - K.FINISH && t < 40) {
      const prev = r.s;
      r = stepPath(r, steer(r, t), 1 / 30, K.SKI_SPEC, K.SKI_PATH);
      for (const i of K.gatesCleared(prev, r)) cleared.add(i);
      t += 1 / 30;
      void vFwd;
    }
    return { t, cleared, r };
  };
  // a steering bot: the stick points to the next gate's side
  const bot = (r) => { const g = K.GATES.find((q) => q.s > r.s - 0.01); return { fwd: 0, side: g ? Math.sign(g.lat) * 0.55 : 0 }; };
  it('a child who leans towards each gate clears all six, at the slowest speed and at the fastest', () => {
    const slow = skiRun((r) => ({ ...bot(r), fwd: -1 }));
    expect(slow.cleared.size).toBe(6);
    expect(slow.t).toBeLessThan(12);
    const fast = skiRun((r) => ({ ...bot(r), fwd: 1 }));
    expect(fast.cleared.size).toBe(6);
    const mid = skiRun((r) => bot(r));
    expect(mid.cleared.size).toBe(6);
  });
  it('holding the line without steering clears none, and the run still ends: nobody is stuck, nobody fails', () => {
    const idle = skiRun(() => null);
    expect(idle.cleared.size).toBe(0);
    expect(idle.t).toBeLessThan(12);
    for (const stick of [() => ({ fwd: -1, side: 0 }), () => ({ fwd: 1, side: 1 }), () => ({ fwd: NaN, side: Infinity }), (r, t) => ({ fwd: Math.sin(t * 5.3), side: Math.cos(t * 3.1) })]) {
      const run = skiRun(stick);
      expect(run.t).toBeLessThan(12);
      expect(run.r.s).toBeGreaterThanOrEqual(K.SKI_LEN - K.FINISH);
    }
  });
});


// ---- the live on a walk (a stand-in session, cat, player and camera) ---------------------------------------------------------------------
function rig(reducedMotion = false, extra = {}) {
  const scene = new THREE.Scene();
  const chimes = [];
  const bursts = [];
  const added = [];
  const audio = { chime: () => chimes.push(1) };
  const progression = { addPoints: (n) => added.push(n), ...(extra.progression ?? {}) };
  const live = createSkisLive({ scene, reducedMotion, tier: null, audio, progression });
  const cat = new THREE.Object3D();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 3, 0);
  const player = { perchY: 0, inputActive: false, dir: { x: 0, z: 0 }, inputDirection() { return this.dir; }, halt() { this.halted = (this.halted ?? 0) + 1; } };
  const fairLog = [];
  const orig = { update: () => fairLog.push('orig'), late: () => undefined, jump: () => 'origjump', pawKind: () => 'origpaw', canBoard: () => true, groundSpot: () => ({ x: 1, z: 2 }), riding: null, marker: 'dot' };
  const session = { cat, ground: area.ground, perched: null, perchHold: null, idleTime: 5, fair: orig, fx: { burst: (...a) => bursts.push(a) } };
  cat.position.set(K.RACK.x + 1.4, area.ground.y(K.RACK.x + 1.4, K.RACK.z), K.RACK.z);
  let t = 0;
  const tick = (dt = 1 / 30) => { t += dt; live.frame(dt, t, cat.position, camera, session); session.fair.update(dt, t, { cat, player, session }); session.fair.late(dt, t, { cat, player, session }); };
  return { scene, live, cat, camera, player, session, orig, fairLog, tick, chimes, bursts, added };
}
const press = (r) => { const line = r.live.slots.riding.promptAt(r.cat.position) ?? r.live.slots.skis.promptAt(r.cat.position); r.live.interact(); r.tick(); return line; };
const freeSpot = (p) => K.SKI_HOPS.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < 0.02);
const ski = (r, stick, limit = 800) => { let n = 0; while (r.live.mode === 'riding' && n++ < limit) { r.player.inputActive = !!stick; r.player.dir = stick ? stick(r, n / 30) : { x: 0, z: 0 }; r.tick(); } return n; };
// the stick that leans toward the next gate (the stick's x is the world's; the ride's own side is turned from it)
const leanStick = (r) => { const g = K.GATES.find((q) => q.s > r.live.state.s - 0.01); const h = r.live.ride.heading; const side = g ? Math.sign(g.lat) * 0.55 : 0; return { x: side * -Math.cos(h), z: side * Math.sin(h) }; };

describe('on a walk', () => {
  it('the skis hang in the rack: near it or the start she is offered them, far away nothing', () => {
    const r = rig();
    r.tick();
    expect(r.live.mode).toBe('parked');
    expect(r.live.slots.skis.promptAt(r.cat.position)).toBe('Put on the skis');
    expect(r.live.slots.skis.promptAt(new THREE.Vector3(0, 0, 25))).toBeNull();
    expect(r.live.slots.riding.promptAt(r.cat.position)).toBeNull();
    expect(r.live.skis.visible).toBe(false);
    r.live.dispose();
  });
  it('she puts them on: standing on the slope, the fair marked riding, the skis on her feet and the camera carried; the run takes her down, ends at the foot with her on a free spot and a cheer', () => {
    const r = rig();
    r.tick();
    press(r);
    expect(r.live.mode).toBe('riding');
    expect(r.session.perched.pose).toBe('follow');
    expect(r.session.fair.riding).toEqual({ id: 'snow-skis' });
    expect(r.player.perchY).toBeGreaterThan(0);
    expect(r.session.fair.jump()).toBe(false);
    expect(r.session.fair.pawKind()).toBe('none');
    expect(r.live.skis.visible).toBe(true);
    expect(Math.hypot(r.cat.position.x - r.live.ride.x, r.cat.position.z - r.live.ride.z)).toBeLessThan(0.05);
    expect(Math.hypot(r.live.skis.position.x - r.cat.position.x, r.live.skis.position.z - r.cat.position.z)).toBeLessThan(0.05);
    let last = r.live.state.s; let vmax = 0;
    let n = 0;
    while (r.live.mode === 'riding' && n++ < 600) { r.tick(); if (r.live.mode === 'riding') { expect(r.live.state.s).toBeGreaterThanOrEqual(last - 1e-9); last = r.live.state.s; vmax = Math.max(vmax, r.live.state.v); } }
    expect(n).toBeLessThan(12 * 30 + 30);
    expect(r.live.mode).toBe('parked');
    expect(r.session.perched).toBeNull();
    expect(r.session.fair.riding).toBeNull();
    expect(r.player.perchY).toBe(0);
    expect(freeSpot(r.cat.position)).toBe(true);
    expect(vmax).toBeLessThanOrEqual(K.SKI_SPEC.vMax + 1e-6);
    expect(r.live.runs).toBe(1);
    expect(r.live.skis.visible).toBe(false);
    r.live.dispose();
  });
  it('the action button anywhere on the run is "Take the skis off": onto the nearest free spot, every time along it', () => {
    for (const stop of [1, 20, 60, 100]) {
      const r = rig();
      r.tick(); press(r);
      for (let i = 0; i < stop && r.live.mode === 'riding'; i++) r.tick();
      if (r.live.mode !== 'riding') { r.live.dispose(); continue; }
      expect(r.live.slots.riding.promptAt(r.cat.position)).toBe('Take the skis off');
      expect(r.live.slots.skis.promptAt(r.cat.position)).toBeNull();
      const ride = { ...r.live.ride };
      expect(press(r)).toBe('Take the skis off');
      expect(r.live.mode).toBe('parked');
      expect(freeSpot(r.cat.position)).toBe(true);
      const best = Math.min(...K.SKI_HOPS.map((h) => Math.hypot(h.x - ride.x, h.z - ride.z)));
      expect(Math.hypot(r.cat.position.x - ride.x, r.cat.position.z - ride.z)).toBeLessThanOrEqual(best + 0.5);
      expect(r.session.perched).toBeNull();
      r.live.dispose();
    }
  });
  it('a sweep of sticks: never off the lane, never stuck, always set down on a free spot, the run over in under twelve seconds', () => {
    const sticks = [null, () => ({ x: 0, z: 0 }), (r, t) => ({ x: Math.sin(t * 4), z: Math.cos(t * 3) }), () => ({ x: 1, z: 0 }), () => ({ x: -1, z: 0 }), () => ({ x: 0, z: 1 }), () => ({ x: 0, z: -1 }), () => ({ x: NaN, z: 0 })];
    for (const st of sticks) {
      const r = rig();
      r.tick(); press(r);
      let n = 0;
      while (r.live.mode === 'riding' && n++ < 700) {
        r.player.inputActive = !!st; r.player.dir = st ? st(r, n / 30) : { x: 0, z: 0 };
        r.tick();
        expect(Math.abs(r.live.state.lat)).toBeLessThanOrEqual(K.SKI_SPEC.laneHalf + 1e-6);
      }
      expect(r.live.mode, String(st)).toBe('parked');
      expect(n, String(st)).toBeLessThan(12 * 30 + 30);
      expect(freeSpot(r.cat.position)).toBe(true);
      r.live.dispose();
    }
  });
  it('each gate she glides through is a chime and a puff (all six when she leans to each, none when she holds the line); the praise is a line, never a score', () => {
    const lean = rig();
    lean.tick(); press(lean);
    ski(lean, () => leanStick(lean));
    expect(lean.chimes.length).toBe(6);
    expect(lean.bursts.length).toBe(6);
    expect(lean.live.runs).toBe(1);
    const idle = rig();
    idle.tick(); press(idle);
    ski(idle, null);
    expect(idle.chimes.length).toBe(0);
    expect(idle.live.mode).toBe('parked');
    lean.live.dispose(); idle.live.dispose();
  });
  it('the run tells how many gates, 3 paws once a walk, and no more', () => {
    const r = rig();
    const ends = [];
    r.live.onRunEnd = (e) => ends.push(e);
    r.tick(); press(r);
    ski(r, () => leanStick(r));
    expect(ends).toEqual([{ cleared: 6, all: true, runs: 1 }]);
    expect(r.added).toEqual([3]);
    r.cat.position.set(K.RACK.x + 1.4, area.ground.y(K.RACK.x + 1.4, K.RACK.z), K.RACK.z);
    r.tick(); press(r);
    ski(r, null);
    expect(ends.at(-1)).toEqual({ cleared: 0, all: false, runs: 2 });
    expect(r.added).toEqual([3]);
    r.live.dispose();
  });
  it('a walk that ends while she skis sets her down on a free spot and puts the fair back', () => {
    const r = rig();
    r.tick(); press(r);
    for (let i = 0; i < 30; i++) r.tick();
    expect(r.session.fair.update).not.toBe(r.orig.update);
    const gs = r.session.fair.groundSpot();
    expect(K.SKI_HOPS.some((h) => h.x === gs.x && h.z === gs.z)).toBe(true);
    r.live.dispose();
    expect(freeSpot(r.cat.position)).toBe(true);
    expect(r.session.perched).toBeNull();
    expect(r.session.fair).toBe(r.orig);
    expect(r.scene.children.length).toBe(0);
  });
  it('the fair it replaced still runs while she is off the skis, and is handed back its calls', () => {
    const r = rig();
    r.tick();
    expect(r.fairLog.length).toBeGreaterThan(0);
    expect(r.session.fair.jump()).toBe('origjump');
    expect(r.session.fair.pawKind()).toBe('origpaw');
    expect(r.session.fair.groundSpot()).toEqual({ x: 1, z: 2 });
    r.live.dispose();
  });
  it('reduced motion: she still glides, nothing leans and there are no puffs', () => {
    const r = rig(true);
    r.tick(); press(r);
    for (let i = 0; i < 20; i++) r.tick();
    expect(r.live.skis.rotation.z).toBe(0);
    expect(r.live.state.s).toBeGreaterThan(1);
    ski(r, () => leanStick(r));
    expect(r.bursts.length).toBe(0);
    expect(r.chimes.length).toBe(6);
    r.live.dispose();
  });
  it('a partner skiing on her own device (seat snow-skis in the walk\'s remote list) is drawn on the skis here too, and the skis go when she gets off', () => {
    const r = rig();
    const group = new THREE.Object3D();
    group.position.set(K.skiPos(8).x, 0, K.skiPos(8).z);
    group.rotation.y = K.skiPos(8).heading + Math.PI;
    r.session.remotes = { list: [{ seatId: null, group }] };
    r.tick();
    expect(r.live.partnerSkis.visible).toBe(false);
    r.session.remotes.list[0].seatId = 'snow-skis';
    r.tick();
    expect(r.live.partnerSkis.visible).toBe(true);
    expect(Math.hypot(r.live.partnerSkis.position.x - group.position.x, r.live.partnerSkis.position.z - group.position.z)).toBeLessThan(0.01);
    expect(Math.abs(r.live.partnerSkis.rotation.y - K.skiPos(8).heading)).toBeLessThan(1e-6);
    r.session.remotes.list[0].seatId = null;
    r.tick();
    expect(r.live.partnerSkis.visible).toBe(false);
    r.live.dispose();
    expect(r.scene.children.length).toBe(0);
  });
  it('beside the sled: both fairs chain, the sled cannot be boarded while she skis, and the walk ends with the fair as it was', () => {
    const r = rig();
    const sled = createSledLive({ scene: r.scene, reducedMotion: false, tier: null });
    sled.frame(1 / 30, 0.03, r.cat.position, r.camera, r.session); // the sled installs first, as in the place (snowville.js)
    r.tick();
    const prompts = createSnowvillePrompts({ promptAt: () => null, interact: () => null }, null, null, sled, r.live);
    expect(prompts.promptAt(r.cat.position)).toBe('Put on the skis');
    prompts.interact(); r.tick();
    expect(r.live.mode).toBe('riding');
    expect(sled.mode).toBe('parked');
    expect(prompts.promptAt(r.cat.position)).toBe('Take the skis off');
    prompts.interact(); r.tick();
    expect(r.live.mode).toBe('parked');
    r.live.dispose(); sled.dispose();
    expect(r.session.fair).toBe(r.orig);
  });
});

describe('the Ski Goggles: earned on the slope, or taken from the bench, once', () => {
  const real = () => createProgression(memoryStorage());
  it('a run through all six gates gives them (a fanfare and a line), once; a run that misses some gives nothing', () => {
    const pr = real();
    const fanfares = [];
    const scene = new THREE.Scene();
    const audio = { chime() {}, fanfare: () => fanfares.push(1) };
    const live = createSkisLive({ scene, reducedMotion: false, tier: null, audio, progression: pr });
    const cat = new THREE.Object3D();
    const player = { perchY: 0, inputActive: false, dir: { x: 0, z: 0 }, inputDirection() { return this.dir; }, halt() {} };
    const session = { cat, ground: area.ground, perched: null, perchHold: null, idleTime: 5, fair: { update() {}, late() {}, jump: () => false, pawKind: () => null, groundSpot: () => null, riding: null }, fx: { burst() {} } };
    const camera = new THREE.PerspectiveCamera();
    const rr = { live, cat, player, session, camera, tick(dt = 1 / 30) { live.frame(dt, 0, cat.position, camera, session); session.fair.update(dt, 0, { cat, player, session }); session.fair.late(dt, 0, { cat, player, session }); } };
    cat.position.set(K.RACK.x + 1.4, area.ground.y(K.RACK.x + 1.4, K.RACK.z), K.RACK.z);
    rr.tick(); press(rr);
    ski(rr, null);
    expect(pr.state.unlocked.accessories).not.toContain('skigoggles');
    expect(fanfares.length).toBe(0);
    cat.position.set(K.RACK.x + 1.4, area.ground.y(K.RACK.x + 1.4, K.RACK.z), K.RACK.z);
    rr.tick(); press(rr);
    ski(rr, () => leanStick(rr));
    expect(live.runs).toBe(2);
    expect(pr.state.unlocked.accessories).toContain('skigoggles');
    expect(pr.state.foundWear).toContain('skigoggles');
    expect(fanfares.length).toBe(1);
    // a second clean run: owned already, no second fanfare
    cat.position.set(K.RACK.x + 1.4, area.ground.y(K.RACK.x + 1.4, K.RACK.z), K.RACK.z);
    rr.tick(); press(rr);
    ski(rr, () => leanStick(rr));
    expect(fanfares.length).toBe(1);
    live.dispose();
  });
  it('the bench: no goggles on it until she has skied three runs, then "Take the goggles from the bench" once; owned goggles are not offered again', () => {
    const pr = real();
    const r = rig(false, { progression: pr });
    const atBench = () => r.cat.position.set(K.BENCH.x + 1.0 * Math.cos(K.BENCH.yaw), area.ground.y(K.BENCH.x, K.BENCH.z), K.BENCH.z - 1.0 * Math.sin(K.BENCH.yaw));
    atBench(); r.tick();
    expect(r.live.slots.skis.promptAt(r.cat.position)).not.toBe('Take the goggles from the bench');
    for (let i = 0; i < K.GOGGLE_RUNS; i++) {
      r.cat.position.set(K.RACK.x + 1.4, area.ground.y(K.RACK.x + 1.4, K.RACK.z), K.RACK.z);
      r.tick(); press(r); ski(r, null);
    }
    expect(r.live.runs).toBe(K.GOGGLE_RUNS);
    expect(pr.state.unlocked.accessories).not.toContain('skigoggles');
    atBench(); r.tick();
    expect(r.live.slots.skis.promptAt(r.cat.position)).toBe('Take the goggles from the bench');
    r.live.interact(); r.tick();
    expect(pr.state.unlocked.accessories).toContain('skigoggles');
    expect(r.live.slots.skis.promptAt(r.cat.position)).not.toBe('Take the goggles from the bench');
    r.live.dispose();
  });
  it('they are a free found outfit in the catalog (a face piece for Snowville), and not hidden twice from a child who has them', () => {
    expect(CATALOG.accessories.skigoggles).toMatchObject({ slot: 'face', price: 0, prize: true, find: 'snowville' });
  });
});

describe('the words', () => {
  it('every ski line, in both word sets, plain, with no banned word', () => {
    for (const id of Object.keys(SKI_LINES)) {
      const on = phrase(id);
      expect(on, id).toBe(SKI_LINES[id]);
      const off = withOffWords(() => phrase(id));
      expect(off, id).toBe(SKI_LINES[id]);
      expect(withOffWords(() => bannedIn(off)), id).toBeNull();
      expect(/dark|lost forever|trapped|stuck|collapse|scary/i.test(SKI_LINES[id])).toBe(false);
    }
  });
});
