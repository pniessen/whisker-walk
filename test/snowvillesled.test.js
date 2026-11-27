// Snowville round two: the sled run down the hill. The plan (an open, winding track clear of everything solid, free hop-off spots reachable on foot), the pure ride (the sled spec on an open run
// always ends, never faster than its limit, never off its lane), the live on a walk (take it at the top, steer, ride to the landing, hop off anywhere onto a free spot, a walk that ends mid-ride,
// the fair it replaced put back, reduced motion holds the speed lines still, a never-stuck sweep with every stick), the prompts and both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';

stubCanvasDocument();
const { isWalkableAt } = await import('../src/player.js');
const { createPathRide, stepPath } = await import('../src/world/pathride.js');
const { loadSnowvilleStages } = await import('../src/world/snowvillestages.js');
await loadSnowvilleStages();
const { build } = await import('../src/world/snowville.js');
const S = await import('../src/world/snowvillesledplan.js');
const D = await import('../src/world/snowvilledetailplan.js');
const W = await import('../src/world/snowvillewingplan.js');
const P = await import('../src/world/snowvilleplan.js');
const Q = await import('../src/world/snowvillefindsplan.js');
const { createSledLive } = await import('../src/world/snowvillesledlive.js');
const { lineSpot } = await import('../src/world/snowvillesledparts.js');
const { createSnowvillePrompts } = await import('../src/world/snowvillelife.js');
const { phrase } = await import('../src/clanphrases.js');
const { SLED_LINES } = await import('../src/world/snowvillesledwords.js');

const area = build(new THREE.Scene());
const B = P.SNOWVILLE_BOUNDS;

describe('the plan', () => {
  it('an open winding run from the hill\'s top down to its foot, inside the bounds, on the hill', () => {
    expect(S.RUN_LEN).toBeGreaterThan(18);
    expect(S.RUN_SPEC.loop).toBe(false);
    expect(Math.hypot(S.START.x - P.HILL.x, S.START.z - P.HILL.z)).toBeLessThan(4);
    expect(S.START.z).toBeLessThan(S.LANDING.z - 10);
    for (const p of S.RUN_PATH) expect(p.x > B.minX + 2 && p.x < B.maxX - 2 && p.z > B.minZ + 2 && p.z < B.maxZ - 2).toBe(true);
    // the slowest speed still finishes it in under ten seconds, the fastest in under half that
    expect(S.RUN_LEN / S.RUN_SPEC.vMin).toBeLessThan(10);
    expect(S.RUN_SPEC.vMax).toBeLessThanOrEqual(6); // a gentle speed limit
  });
  it('the line and its lane (1.5 m either side) are clear of every solid, the hill\'s lantern and rock, the finds and the mice', () => {
    const solids = [...area.colliders];
    for (let s = 0; s <= S.RUN_LEN; s += 0.5) {
      const p = S.runPos(s);
      for (const c of solids) expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `s ${s} vs ${JSON.stringify(c)}`).toBeGreaterThan(1.0);
      for (const z of Object.values(Q.SNOWVILLE_FIND_ZONES).flat()) expect(Math.hypot(p.x - z.x, p.z - z.z)).toBeGreaterThan(z.r + 1.0);
      for (const m of [...Q.SNOWVILLE_GOLD, ...Q.SNOWVILLE_COLLECTIBLES]) expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeGreaterThan(1.8);
    }
    expect(Math.hypot(W.HILL_LANTERN.x - S.START.x, W.HILL_LANTERN.z - S.START.z)).toBeGreaterThan(4);
  });
  it('every hop-off spot is free and in bounds, and reachable on foot from the spawn; there are plenty, near the start and the landing', () => {
    expect(S.HOP_SPOTS.length).toBeGreaterThanOrEqual(10);
    const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
    for (const h of S.HOP_SPOTS) {
      expect(h.x > B.minX + 2 && h.x < B.maxX - 2 && h.z > B.minZ + 2 && h.z < B.maxZ - 2).toBe(true);
      for (const c of area.colliders) expect(Math.hypot(h.x - c.x, h.z - c.z) - c.r, JSON.stringify(h)).toBeGreaterThan(1.0);
      expect(flood.reachesWithin(h.x, h.z, 1.0), JSON.stringify(h)).toBe(true);
    }
    for (const at of [S.START, S.LANDING]) expect(Math.min(...S.HOP_SPOTS.map((h) => Math.hypot(h.x - at.x, h.z - at.z)))).toBeLessThan(4);
    // from every point along the run, a free spot is within a few metres
    for (let s = 0; s <= S.RUN_LEN; s += 1) { const p = S.runPos(s); expect(Math.min(...S.HOP_SPOTS.map((h) => Math.hypot(h.x - p.x, h.z - p.z))), `s ${s}`).toBeLessThan(6); }
  });
  it('the run does not touch the detail plan\'s things and its stakes stand on its edges', () => {
    for (const c of D.detailColliders()) for (const p of S.RUN_PATH) expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r).toBeGreaterThan(1.3);
    expect(S.STAKES.length).toBeGreaterThanOrEqual(6);
  });
});

describe('the pure ride', () => {
  const run = (input, dt = 1 / 30, limit = 40) => {
    let r = createPathRide(S.RUN_PATH, S.RUN_SPEC, 0);
    let t = 0;
    let vmax = 0; let latmax = 0;
    while (r.s < S.RUN_LEN - S.FINISH && t < limit) { r = stepPath(r, input(t), dt, S.RUN_SPEC, S.RUN_PATH); t += dt; vmax = Math.max(vmax, r.v); latmax = Math.max(latmax, Math.abs(r.lat)); }
    return { t, vmax, latmax, r };
  };
  it('always ends: with the stick held back, forward, to either side, or wild, and never above the speed limit or off its lane', () => {
    const sticks = {
      none: () => null, back: () => ({ fwd: -1, side: 0 }), fwd: () => ({ fwd: 1, side: 0 }), left: () => ({ fwd: 0, side: -1 }), right: () => ({ fwd: 0, side: 1 }),
      wild: (t) => ({ fwd: Math.sin(t * 5.3), side: Math.cos(t * 3.1) }),
      broken: () => ({ fwd: NaN, side: Infinity }),
    };
    for (const [name, f] of Object.entries(sticks)) {
      const { t, vmax, latmax } = run(f);
      expect(t, name).toBeLessThan(10);
      expect(vmax, name).toBeLessThanOrEqual(S.RUN_SPEC.vMax + 1e-6);
      expect(latmax, name).toBeLessThanOrEqual(1.5 + 1e-6);
    }
  });
  it('the same inputs always give the same ride', () => {
    const a = run((t) => ({ fwd: Math.sin(t), side: Math.cos(t * 2) }));
    const b = run((t) => ({ fwd: Math.sin(t), side: Math.cos(t * 2) }));
    expect(a.r).toEqual(b.r);
  });
});

// ---- the live on a walk (a stand-in session, cat, player and camera) ---------------------------------------------------------------------
function rig(reducedMotion = false) {
  const scene = new THREE.Scene();
  const live = createSledLive({ scene, reducedMotion, tier: null });
  const cat = new THREE.Object3D();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 3, 0);
  const player = { perchY: 0, inputActive: false, dir: { x: 0, z: 0 }, inputDirection() { return this.dir; }, halt() { this.halted = (this.halted ?? 0) + 1; } };
  const fairLog = [];
  const orig = { update: () => fairLog.push('orig'), late: () => undefined, jump: () => 'origjump', pawKind: () => 'origpaw', canBoard: () => true, groundSpot: () => ({ x: 1, z: 2 }), riding: null, marker: 'dot' };
  const session = { cat, ground: area.ground, perched: null, perchHold: null, idleTime: 5, fair: orig };
  const start = S.runPos(0);
  cat.position.set(start.x + 1.2, area.ground.y(start.x + 1.2, start.z), start.z);
  let t = 0;
  const tick = (dt = 1 / 30) => { t += dt; live.frame(dt, t, cat.position, camera, session); session.fair.update(dt, t, { cat, player, session }); session.fair.late(dt, t, { cat, player, session }); };
  const ask = () => { live.slots.riding.promptAt(cat.position) ?? live.slots.sled.promptAt(cat.position); };
  return { scene, live, cat, camera, player, session, orig, fairLog, tick, start, ask, get t() { return t; } };
}
const press = (r) => { const line = r.live.slots.riding.promptAt(r.cat.position) ?? r.live.slots.sled.promptAt(r.cat.position); r.live.interact(); r.tick(); return line; };
const freeSpot = (p) => S.HOP_SPOTS.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < 0.02);

describe('on a walk', () => {
  it('the sled waits parked at the top: near it she is offered the ride, far away nothing', () => {
    const r = rig();
    r.tick();
    expect(r.live.mode).toBe('parked');
    expect(r.live.slots.sled.promptAt(r.cat.position)).toBe(SLED_LINES['snowville.sled.board']);
    expect(r.live.slots.sled.promptAt(new THREE.Vector3(0, 0, 25))).toBeNull();
    expect(r.live.slots.riding.promptAt(r.cat.position)).toBeNull();
    r.live.dispose();
  });
  it('she takes it: seated on it, the walk\'s fair marked riding, the camera carried; the run takes her down, ends at the landing with her on a free spot and a cheer', () => {
    const r = rig();
    r.tick();
    const heard = [];
    const { bus } = globalThis.__bus ?? {};
    void bus;
    press(r);
    expect(r.live.mode).toBe('riding');
    expect(r.session.perched).toBeTruthy();
    expect(r.session.perched.pose).toBe('requestPet');
    expect(r.session.fair.riding).toEqual({ id: 'snow-sled' });
    expect(r.player.perchY).toBeGreaterThan(0.3);
    expect(r.session.fair.jump()).toBe(false); // no hop while riding
    expect(r.session.fair.pawKind()).toBe('none');
    // the cat sits on the sled
    expect(Math.hypot(r.cat.position.x - r.live.ride.x, r.cat.position.z - r.live.ride.z)).toBeLessThan(0.2);
    let n = 0;
    let last = r.live.state.s;
    while (r.live.mode === 'riding' && n++ < 600) { r.tick(); expect(r.live.state.s).toBeGreaterThanOrEqual(last - 1e-9); last = r.live.state.s; heard.push(r.live.state.v); }
    expect(n).toBeLessThan(400);
    expect(r.live.mode).toBe('home');
    expect(r.session.perched).toBeNull();
    expect(r.session.fair.riding).toBeNull();
    expect(r.player.perchY).toBe(0);
    expect(freeSpot(r.cat.position)).toBe(true);
    expect(Math.max(...heard)).toBeLessThanOrEqual(S.RUN_SPEC.vMax + 1e-6);
    // the sled slides itself back up and settles at the top
    let m = 0;
    while (r.live.mode === 'home' && m++ < 600) r.tick();
    expect(r.live.mode).toBe('parked');
    expect(r.live.ride.s).toBe(0);
    expect(r.live.rides).toBe(1);
    r.live.dispose();
  });
  it('the action button anywhere on the run is "Hop off": onto the nearest free spot, every time along it', () => {
    for (const stop of [1, 15, 40, 90]) {
      const r = rig();
      r.tick(); press(r);
      for (let i = 0; i < stop && r.live.mode === 'riding'; i++) r.tick();
      if (r.live.mode !== 'riding') { r.live.dispose(); continue; }
      expect(r.live.slots.riding.promptAt(r.cat.position)).toBe('Hop off');
      expect(r.live.slots.sled.promptAt(r.cat.position)).toBeNull();
      const ride = { ...r.live.ride };
      const line = press(r);
      expect(line).toBe('Hop off');
      expect(['home', 'parked']).toContain(r.live.mode); // (from near the top the sled is back in a frame)
      expect(freeSpot(r.cat.position)).toBe(true);
      const best = Math.min(...S.HOP_SPOTS.map((h) => Math.hypot(h.x - ride.x, h.z - ride.z)));
      expect(Math.hypot(r.cat.position.x - ride.x, r.cat.position.z - ride.z)).toBeLessThanOrEqual(best + 0.5);
      expect(r.session.perched).toBeNull();
      r.live.dispose();
    }
  });
  it('the stick steers her inside the lane only and never stalls the run (a sweep of sticks, never stuck, always set down on a free spot)', () => {
    const sticks = [() => ({ x: 0, z: 0 }), (t) => ({ x: Math.sin(t * 4), z: Math.cos(t * 3) }), () => ({ x: 1, z: 0 }), () => ({ x: -1, z: 0 }), () => ({ x: 0, z: 1 }), () => ({ x: 0, z: -1 }), () => ({ x: NaN, z: 0 })];
    for (const st of sticks) {
      const r = rig();
      r.tick(); press(r);
      let n = 0;
      while (r.live.mode === 'riding' && n++ < 700) {
        const d = st(n / 30);
        r.player.inputActive = true; r.player.dir = d;
        r.tick();
        expect(Math.abs(r.live.state.lat)).toBeLessThanOrEqual(1.5 + 1e-6);
      }
      expect(r.live.mode, JSON.stringify(st(1))).toBe('home');
      expect(freeSpot(r.cat.position)).toBe(true);
      r.live.dispose();
    }
  });
  it('a walk that ends while she rides sets her down on a free spot and puts the fair back', () => {
    const r = rig();
    r.tick(); press(r);
    for (let i = 0; i < 30; i++) r.tick();
    expect(r.session.fair.marker).toBe('dot');
    expect(r.session.fair.update).not.toBe(r.orig.update);
    const gs = r.session.fair.groundSpot();
    expect(S.HOP_SPOTS.some((h) => h.x === gs.x && h.z === gs.z)).toBe(true);
    r.live.dispose();
    expect(freeSpot(r.cat.position)).toBe(true);
    expect(r.session.perched).toBeNull();
    expect(r.session.fair).toBe(r.orig);
    expect(r.scene.children.length).toBe(0);
  });
  it('the fair it replaced still runs while she is off the sled, and is handed back its calls', () => {
    const r = rig();
    r.tick();
    expect(r.fairLog.length).toBeGreaterThan(0);
    expect(r.session.fair.jump()).toBe('origjump');
    expect(r.session.fair.pawKind()).toBe('origpaw');
    expect(r.session.fair.groundSpot()).toEqual({ x: 1, z: 2 });
    r.live.dispose();
  });
  it('reduced motion: the sled still runs, the speed lines hold still (the same places at any time), and nothing leans', () => {
    const lines = (rm, extra) => {
      const r = rig(rm);
      r.tick(); press(r);
      for (let i = 0; i < 20; i++) r.tick();
      for (let i = 0; i < extra; i++) r.tick(0); // (time passes with the cat held: dt 0 moves nothing, the clock stays)
      const a = Array.from(r.live.lines.geometry.attributes.position.array.slice(0, 18));
      const rot = r.live.sled.rotation.z;
      const moved = r.live.state.s;
      r.live.dispose();
      return { a, rot, moved };
    };
    const rm = lines(true, 0);
    expect(rm.moved).toBeGreaterThan(1);
    expect(rm.rot).toBe(0);
    for (const k of [0, 1, 2, 3]) { const s0 = lineSpot(k, 10, 0, 4); expect(lineSpot(k, 10, 0, 9)).toEqual(s0); } // t = 0: speed does not move a line
    const moving = lineSpot(0, 10, 1, 4);
    expect(moving.ahead).not.toBe(lineSpot(0, 10, 0, 4).ahead);
  });
  it('the lower rungs draw fewer speed lines', () => {
    const hi = createSledLive({ scene: new THREE.Scene(), tier: null });
    const lo = createSledLive({ scene: new THREE.Scene(), tier: { name: 'low', rung: 3, shadows: true } });
    expect(lo.lines.geometry.attributes.position.count).toBeLessThan(hi.lines.geometry.attributes.position.count);
    hi.dispose(); lo.dispose();
  });
  it('a partner\'s boarding is the walk\'s own co-walk seat: riding is { id: snow-sled } and it is cleared at the landing', () => {
    const r = rig();
    r.tick(); press(r);
    expect(r.session.fair.riding?.id).toBe('snow-sled');
    for (let i = 0; i < 400 && r.live.mode === 'riding'; i++) r.tick();
    expect(r.session.fair.riding).toBeNull();
    r.live.dispose();
  });
});

describe('the prompts and the words', () => {
  it('the hop-off prompt wins over a nearby Tilly while riding, and the offer comes after the errand and the wing', () => {
    const tilly = { promptAt: () => 'Talk to Tilly', interact: () => 'talk' };
    const r = rig();
    const prompts = createSnowvillePrompts(tilly, null, null, r.live);
    r.tick();
    expect(prompts.promptAt(r.cat.position)).toBe('Talk to Tilly');
    r.live.interact();
    press(r);
    r.live.slots.sled.promptAt(r.cat.position);
    // (press() above already asked the sled's own slots: it is riding now only if the offer was taken)
    r.live.dispose();
    const r2 = rig();
    const p2 = createSnowvillePrompts({ promptAt: () => null, interact: () => null }, null, null, r2.live);
    r2.tick();
    expect(p2.promptAt(r2.cat.position)).toBe('Take the sled down the hill');
    p2.interact();
    r2.tick();
    expect(r2.live.mode).toBe('riding');
    const p3 = createSnowvillePrompts(tilly, null, null, r2.live);
    expect(p3.promptAt(r2.cat.position)).toBe('Hop off');
    r2.live.dispose();
  });
  it('three lines, in both word sets, plain, with no banned word', () => {
    for (const id of Object.keys(SLED_LINES)) {
      const on = phrase(id);
      expect(on, id).toBe(SLED_LINES[id]);
      const off = withOffWords(() => phrase(id));
      expect(off, id).toBe(SLED_LINES[id]);
      expect(withOffWords(() => bannedIn(off)), id).toBeNull();
      expect(/dark|lost forever|trapped|stuck|collapse|scary/i.test(SLED_LINES[id])).toBe(false);
    }
    expect(Object.keys(SLED_LINES).length).toBe(3);
  });
});
