// The Moon, milestone 7b on a walk: the bound through the real Moon life, in the walk's own frame order (traversal.update before the player, then the player, the life's
// update, the avatar taking dt off the pounce window, then traversal.late). The player is a stand-in with the real one's relevant behaviour (the lunge a press gives it, the
// lerp to the stick, the collider push, halt() and speedFactor), so what is tested is what the hook does to a walk, not what the stand-in does.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as B from '../src/world/moonbound.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { NO_TRAVERSAL } from '../src/traversallive.js';
import { bestPerch } from '../src/climbing.js';
import { placeArc, placeBudget } from '../src/placephysics.js';
import { pounceArc } from '../src/player.js';
import { mem } from './helpers/lighthouselife.js';
import { fakePage } from './helpers/moonpage.js';

const DT = 1 / 60;
const PACE = 3.15; // the Moon's walk (a mid breed at 0.9)

function rig({ moon = null, equipped = null, reducedMotion = false, skills = null, at = { x: 0, z: 45 } } = {}) {
  const progression = createProgression(mem());
  if (moon) progression.state.moon = { ...progression.state.moon, ...moon };
  if (equipped) progression.state.equipped = { ...progression.state.equipped, ...equipped };
  if (skills) progression.state.skills = skills;
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const page = fakePage();
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion, tier: { name: 'high' }, doc: page.doc, win: page.win });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 3, 50);
  const cat = new THREE.Object3D();
  cat.position.set(at.x, area.ground.y(at.x, at.z), at.z);
  const session = { goals: null, pounceTime: 0, pounceCooldown: 0, perched: null, perchHold: null, fx: { burst: vi.fn() }, cat, idleTime: 0, traversal: NO_TRAVERSAL, areaData: area, areaId: 'moon', ground: area.ground };
  // the player stand-in
  const stick = { x: 0, z: 0 };
  const pl = {
    inputActive: false, stalking: false, swimming: false, perchY: 0, speedFactor: 1, halts: 0, vx: 0, vz: 0,
    get speed() { return Math.hypot(pl.vx, pl.vz); },
    inputDirection() { return new THREE.Vector3(stick.x, 0, stick.z); },
    halt() { pl.halts++; pl.vx = 0; pl.vz = 0; },
    pounce() { const m = Math.hypot(pl.vx, pl.vz); const d = m > 0.5 ? { x: pl.vx / m, z: pl.vz / m } : { x: 0, z: -1 }; pl.vx = d.x * 9; pl.vz = d.z * 9; },
    update(dt) {
      const target = pl.inputActive ? 1 : 0;
      const k = 1 - Math.pow(0.001, dt);
      const m = Math.hypot(stick.x, stick.z) || 1;
      pl.vx += ((stick.x / m) * PACE * target * pl.speedFactor - pl.vx) * k;
      pl.vz += ((stick.z / m) * PACE * target * pl.speedFactor - pl.vz) * k;
      cat.position.x += pl.vx * dt;
      cat.position.z += pl.vz * dt;
      if (pl.perchY === 0) for (const c of area.colliders) { const dx = cat.position.x - c.x; const dz = cat.position.z - c.z; const d = Math.hypot(dx, dz); const min = c.r + 0.35; if (d < min && d > 1e-4) { cat.position.x = c.x + (dx / d) * min; cat.position.z = c.z + (dz / d) * min; } }
      cat.position.y = area.ground.y(cat.position.x, cat.position.z) + pl.perchY;
    },
  };
  const ctx = { cat, player: pl, session };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const trace = [];
  let t = 0;
  const landed = [];
  const frame = () => {
    t += DT;
    session.traversal.update(DT, t, ctx);
    pl.update(DT);
    life.update(DT, t, cat.position, camera, session);
    // game/avatar.js: the window, the landing
    const was = session.pounceTime > 0;
    if (session.pounceTime > 0) session.pounceTime -= DT;
    if (was && session.pounceTime <= 0) landed.push({ x: cat.position.x, z: cat.position.z });
    session.traversal.late(DT, t, ctx);
    trace.push({ x: cat.position.x, z: cat.position.z, lift: session.hopLift, busy: session.traversal.busy, cy: camera.position.y });
  };
  // game/interactions.js's doPounceOrClimb, as far as the Moon's walk goes
  const press = () => {
    if (!session.traversal.busy && session.fair?.jump?.(ctx)) return 'fair';
    if (session.traversal.jump(ctx)) return 'swallowed';
    const budget = placeBudget(progression.state, 'moon');
    const next = bestPerch(area.perches, cat.position, pl.perchY, session.perched, budget, { state: progression.state, ground: area.ground });
    if (next) { session.perched = next; session.perchHold = next; pl.perchY = next.y; pl.halt(); cat.position.set(next.x, area.ground.y(next.x, next.z) + next.y, next.z); return 'perch'; }
    if (session.perched) { session.perched = null; pl.perchY = 0; return 'down'; }
    const arc = placeArc(pounceArc(progression.state, { reducedMotion }), 'moon');
    pl.pounce(arc);
    session.pounceTime = arc.time;
    session.pounceCooldown = 1.2;
    return 'pounce';
  };
  frame(); // the first frame hangs the hook on the walk (a stand-in for the walk's first frame before any press)
  const run = (secs) => { for (let i = 0; i < Math.round(secs * 60); i++) frame(); };
  // run toward (dx, dz) from where she stands until she is at full pace, then press
  const runAndPress = (dx, dz, secs = 1.2) => {
    const m = Math.hypot(dx, dz);
    stick.x = dx / m; stick.z = dz / m; pl.inputActive = true;
    run(secs);
    const from = { x: cat.position.x, z: cat.position.z };
    const how = press();
    return { from, how };
  };
  // she is running east at the walk's pace at (x, z) and the press comes (the frame's late has sampled her speed before it)
  const dash = (x, z, speed = 3.15, dx = 1, dz = 0) => {
    cat.position.set(x, area.ground.y(x, z), z);
    pl.inputActive = false; pl.vx = 0; pl.vz = 0;
    frame(); // (one frame there, so the life has seen where she took off from)
    stick.x = dx; stick.z = dz; pl.inputActive = true; pl.vx = speed * dx; pl.vz = speed * dz;
    session.traversal.late(DT, 0, ctx);
    session.pounceCooldown = 0;
    return press();
  };
  const place = (x, z) => { cat.position.set(x, area.ground.y(x, z), z); pl.vx = 0; pl.vz = 0; };
  const notes = (key) => events.filter((e) => e.type === 'greenhousenote' && e.key === key).length;
  return { scene, area, life, progression, camera, cat, session, pl, stick, events, trace, landed, frame, run, press, runAndPress, place, notes, ctx, dash, bound: life.bound, jump: life.jump, dispose() { off(); life.dispose(); } };
}
const stop = (r) => { r.pl.inputActive = false; r.stick.x = 0; r.stick.z = 0; };

describe('a run and a pounce is a bound', () => {
  it('carries her about 5 m from a walk in the pounce window, on the hop\'s own arc: held player, her height in session.hopLift, the camera rising 60 percent of it, the landing on the window\'s last frame', () => {
    const r = rig({ at: { x: 30, z: 20 } });
    r.place(30, 24);
    const { from, how } = r.runAndPress(1, 0);
    expect(how).toBe('pounce');
    const n0 = r.trace.length;
    const halts0 = r.pl.halts;
    r.run(1.2);
    const flight = r.trace.slice(n0).filter((f) => f.busy);
    expect(flight.length).toBeGreaterThanOrEqual(Math.round(1.08 * 60) - 1);
    expect(flight.length).toBeLessThanOrEqual(Math.round(1.08 * 60) + 2);
    expect(r.pl.halts - halts0).toBeGreaterThanOrEqual(flight.length - 1); // held on every flight frame
    const dist = Math.hypot(r.landed[0].x - from.x, r.landed[0].z - from.z);
    expect(dist).toBeGreaterThan(4.2);
    expect(dist).toBeLessThan(6.2);
    const peak = Math.max(...flight.map((f) => f.lift));
    expect(peak).toBeGreaterThan(1.3);
    expect(peak).toBeLessThanOrEqual(1.4 + 1e-6);
    // the camera rose with her (the camera starts at 3.0; each frame's own add is 60 percent of the lift the life saw)
    const cyMax = Math.max(...flight.map((f) => f.cy));
    expect(cyMax).toBeGreaterThan(3 + 0.6 * 1.2);
    expect(r.session.hopLift).toBe(0); // landed
    expect(r.bound.flying).toBe(false);
    expect(r.session.traversal.busy).toBe(false);
    r.dispose();
  });
  it('a sprint (her zoomies pace) bounds about 9 m', () => {
    const r = rig();
    r.place(30, 24);
    r.pl.vx = 4.9; // as the zoomies run: the press reads the speed of the frame before
    r.stick.x = 1; r.stick.z = 0; r.pl.inputActive = true;
    r.session.traversal.late(DT, 0, r.ctx); // (the frame's late sampled it)
    const from = { x: r.cat.position.x, z: r.cat.position.z };
    r.press();
    r.run(1.4);
    expect(Math.hypot(r.landed[0].x - from.x, r.landed[0].z - from.z)).toBeGreaterThan(7.2);
    r.dispose();
  });
  it('the player\'s own lunge (the 9 m/s the press gives it) is not what the bound takes off at: it reads her speed from before the press', () => {
    const r = rig();
    r.place(30, 24);
    const { from } = r.runAndPress(1, 0, 1.0);
    expect(r.pl.speed).toBeGreaterThan(8); // the press set the lunge...
    r.run(1.3);
    expect(Math.hypot(r.landed[0].x - from.x, r.landed[0].z - from.z)).toBeLessThan(6.2); // ...and the bound still went her walk's 1.5
    r.dispose();
  });
  it('steers at 60 percent while she is in the air, and the stick let go keeps the course', () => {
    const r = rig();
    r.place(30, 24);
    const { from } = r.runAndPress(1, 0);
    r.frame(); // (the bound has begun)
    r.stick.x = 0; r.stick.z = 1;
    r.run(0.15); // a short push across
    stop(r);
    r.run(1.2); // the stick let go: the bent course holds
    const l = r.landed[0];
    expect(l.z - from.z).toBeGreaterThan(0.5);
    expect(l.x - from.x).toBeGreaterThan(3.5);
    expect(Math.hypot(l.x - from.x, l.z - from.z)).toBeLessThan(6.2);
    r.dispose();
  });
  it('a plain hop stays plain: standing still, stalking, a stroll, or a perch in reach (the walk\'s own pick) never starts a bound', () => {
    const r = rig();
    r.place(30, 24);
    expect(r.press()).toBe('pounce'); // standing still: no stick
    r.run(0.1);
    expect(r.bound.flying).toBe(false);
    r.run(1.2);
    r.session.pounceCooldown = 0;
    r.pl.stalking = true; r.pl.inputActive = true; r.stick.x = 1; r.stick.z = 0; r.pl.vx = 3.1;
    r.session.traversal.late(DT, 0, r.ctx);
    r.press(); r.run(0.1);
    expect(r.bound.flying).toBe(false);
    r.run(1.2);
    r.pl.stalking = false; r.pl.vx = 1.2; r.pl.vz = 0; // a stroll
    r.session.traversal.late(DT, 0, r.ctx);
    r.press();  r.run(0.1);
    expect(r.bound.flying).toBe(false);
    r.dispose();
    // a perch in reach: the press takes it, as in Tier 1 (never a bound over it)
    const q = rig();
    const b = P.BEAMS[5]; // (Ridge clarity: the Beam Hops moved east; the fifth beam, 2.4 m, is the highest stone in reach from its west side)
    q.place(b.x - 3.5, b.z);
    q.stick.x = 1; q.stick.z = 0; q.pl.inputActive = true; q.pl.vx = 3.1;
    q.session.traversal.late(DT, 0, q.ctx);
    expect(q.press()).toBe('perch');
    q.run(0.2);
    expect(q.bound.flying).toBe(false);
    expect(q.session.perched).toMatchObject({ x: b.x, z: b.z });
    q.dispose();
  });
  it('a press in the air is swallowed (it can never take a perch from mid-bound), and she is busy only while she flies', () => {
    const r = rig();
    r.place(P.BEAMS[2].x - 7, P.BEAMS[2].z); // (the third beam: the first lies by the pit crater's rim since the Beam Hops moved east)
    r.runAndPress(1, 0, 0.8);
    r.run(0.3);
    expect(r.bound.flying).toBe(true);
    expect(r.session.traversal.busy).toBe(true);
    expect(r.session.traversal.speed).toBe(0);
    expect(r.press()).toBe('swallowed');
    expect(r.session.perched).toBeNull();
    r.run(1.2);
    expect(r.session.traversal.busy).toBe(false);
    expect(r.session.traversal.speed).toBeNull();
    r.dispose();
  });
  it('ends early and gently at a collider: never inside one, the window shortened to the ease, then a plain stand', () => {
    const r = rig();
    const b = P.BEAMS[7]; // (Ridge clarity: the wave's north-western end has an open run-up from the west)
    r.place(b.x - 5.0, b.z);
    r.runAndPress(1, 0, 0.8);
    r.run(1.6);
    const l = r.landed[0];
    expect(Math.hypot(l.x - b.x, l.z - b.z)).toBeGreaterThanOrEqual(b.r + 0.05 + 0.35 - 1e-6);
    expect(r.session.perched).toBeNull();
    // never inside any collider on any frame
    for (const f of r.trace) for (const c of r.area.colliders) if (!c.rift) expect(Math.hypot(f.x - c.x, f.z - c.z)).toBeGreaterThanOrEqual(c.r + 0.35 - 1e-6);
    r.dispose();
  });
  it('lands beside a rift\'s lip (the 5 m one from a stride back falls short), and the player\'s own collider push does not move her afterwards (no pop)', () => {
    const r = rig();
    const f = P.RIFTS[1]; // x -20, z -35..-25, 5 m
    r.place(f.x0 - f.w / 2 - 0.4 - 2.5, -30);
    r.runAndPress(1, 0, 0.5);
    r.run(1.5);
    const end = { x: r.cat.position.x, z: r.cat.position.z };
    expect(B.riftAt(end.x, end.z, P.RIFTS)).toBeNull();
    expect(end.x).toBeLessThan(f.x0 - f.w / 2 + 0.01); // the near lip: she did not cross
    r.stick.x = 0; r.stick.z = 0; r.pl.inputActive = false;
    r.run(0.3);
    expect(Math.hypot(r.cat.position.x - end.x, r.cat.position.z - end.z)).toBeLessThan(0.02);
    // from the lip itself the 5 m rift is crossed, by a bound only (the walk's plain hop is stopped by the lip's colliders)
    const q = rig();
    q.place(f.x0 - f.w / 2 - 0.4, -30);
    q.runAndPress(1, 0, 0.3);
    q.run(1.5);
    expect(q.cat.position.x).toBeGreaterThan(f.x0 + f.w / 2);
    expect(B.riftAt(q.cat.position.x, q.cat.position.z, P.RIFTS)).toBeNull();
    r.dispose(); q.dispose();
  });
});

describe('the ring gates', () => {
  const through = (r, g, from = 2.4) => {
    r.place(g.x - from, g.z);
    r.session.pounceCooldown = 0;
    r.runAndPress(1, 0, 0.0);
  };
  it('a bound through a hoop lights it (and counts the journal once); the highest needs her height near the top of the arc; five lit are gold with one line, once', () => {
    const r = rig();
    const before = r.progression.state.journal.mnjump ?? 0;
    for (const [i, g] of P.RING_GATES.entries()) {
      r.dash(g.x - 2.4, g.z);
      r.run(1.4);
      expect(r.bound.lit.has(i), `ring ${i}`).toBe(true);
      if (i < 4) expect(r.notes('moon.ring.all')).toBe(0);
    }
    expect(r.bound.lit.size).toBe(5);
    expect(r.notes('moon.ring.all')).toBe(1);
    expect(r.progression.state.journal.mnjump).toBe(before + 1);
    // a sixth pass changes nothing and says nothing more
    r.dash(P.RING_GATES[0].x - 2.4, P.RING_GATES[0].z); r.run(1.4);
    expect(r.notes('moon.ring.all')).toBe(1);
    r.dispose();
  });
  it('a bound that misses (a hoop\'s width off to the side) or a plain hop under it lights nothing', () => {
    const r = rig();
    const g = P.RING_GATES[2];
    r.dash(g.x - 2.4, g.z + 3.2);
    r.run(1.4);
    expect(r.bound.lit.size).toBe(0);
    const q = rig();
    q.place(g.x - 2.4, g.z);
    q.press(); q.run(1.4); // standing: the plain hop
    expect(q.bound.lit.size).toBe(0);
    r.dispose(); q.dispose();
  });
  it('the hint shows once, near the first ring; the hoops are drawn (one draw call) within 60 m and not beyond', () => {
    const r = rig();
    r.place(P.RING_GATES[0].x - 6, P.RING_GATES[0].z);
    r.run(0.1);
    r.place(P.RING_GATES[0].x + 3, P.RING_GATES[0].z + 3); r.run(0.1);
    r.place(P.RING_GATES[0].x - 6, P.RING_GATES[0].z); r.run(0.1);
    expect(r.notes('moon.ring.hint')).toBe(1);
    expect(r.bound.rings.mesh.visible).toBe(true);
    expect(r.bound.rings.mesh.count).toBe(5);
    r.place(0, 46); r.run(0.1);
    expect(r.bound.rings.mesh.visible).toBe(false);
    r.dispose();
  });
  it('reduced motion simulates the arc (the rings light) and draws none of it: no lift, no camera rise', () => {
    const r = rig({ reducedMotion: true });
    const g = P.RING_GATES[1];
    r.dash(g.x - 2.4, g.z);
    r.run(1.4);
    expect(r.bound.lit.has(1)).toBe(true);
    expect(Math.max(...r.trace.map((f) => f.lift))).toBe(0);
    expect(Math.max(...r.trace.map((f) => f.cy))).toBeLessThan(3.001);
    r.dispose();
  });
});

describe('the hop board reads the bound', () => {
  const L = P.JUMP_LANE;
  it('measures a bound from behind the line to where she lands, saves the record per cat, says "New record!" once, and counts the journal once with the rings', () => {
    const r = rig();
    const before = r.progression.state.journal.mnjump ?? 0;
    r.dash(L.x0 - 0.4, L.z);
    r.run(1.4);
    expect(r.jump.last).toBeGreaterThan(380);
    expect(r.jump.last).toBeLessThan(560);
    expect(r.progression.state.moon.jump.tabby).toBe(r.jump.last);
    expect(r.notes('moon.jump.record')).toBe(1);
    expect(r.progression.state.journal.mnjump).toBe(before + 1);
    // a longer one (a sprint) is a new record
    r.dash(L.x0 - 0.2, L.z, 5);
    r.run(1.4);
    expect(r.jump.last).toBeGreaterThan(780);
    expect(r.notes('moon.jump.record')).toBe(2);
    expect(r.progression.state.journal.mnjump).toBe(before + 1);
    r.dispose();
  });
  it('a hostile saved record is read through the save\'s limits; a bound is never measured while she is still in the air', () => {
    const r = rig({ moon: { jump: { tabby: 1e9 } } });
    r.dash(L.x0 - 0.4, L.z);
    r.run(0.5);
    expect(r.bound.boundY).toBeGreaterThan(0.3);
    expect(r.jump.last).toBe(0);
    r.run(1.2);
    expect(r.jump.last).toBeGreaterThan(300);
    expect(r.notes('moon.jump.record')).toBe(0); // 2000 cm is the best she holds
    r.dispose();
  });
});

describe('the hook on the walk, and the switch', () => {
  it('hangs a copy of the walk\'s traversal on the first frame (the original methods still run) and gives the original back on dispose', () => {
    const r = rig();
    expect(r.session.traversal).not.toBe(NO_TRAVERSAL); // (the rig ran the walk's first frame)
    expect(Object.getPrototypeOf(r.session.traversal)).toBe(NO_TRAVERSAL);
    expect(r.session.traversal.busy).toBe(false);
    expect(r.session.traversal.groundSpot()).toBeNull();
    expect(r.session.traversal.pressKind()).toBeNull();
    r.dispose();
    expect(r.session.traversal).toBe(NO_TRAVERSAL);
  });
  it('a walk where something else ends the pounce (a perch taken, a chase) lets her go where she is, no bound left', () => {
    const r = rig();
    r.place(30, 24);
    r.runAndPress(1, 0, 1.0);
    r.run(0.3);
    expect(r.bound.flying).toBe(true);
    r.session.pounceTime = 0; // a scare, a teleport...
    r.run(0.1);
    expect(r.bound.flying).toBe(false);
    r.dispose();
  });
  it('off: nothing is hung on the walk, no ring is drawn, and a run and a pounce is the plain hop of milestone 7a', async () => {
    vi.resetModules();
    vi.doMock('../src/world/moonswitch.js', () => ({ MOON_BOUND_ON: false }));
    try {
      const { build: buildOff } = await import('../src/world/moon.js');
      const { createProgression: cp } = await import('../src/progression.js');
      const { NO_TRAVERSAL: NT } = await import('../src/traversallive.js');
      const scene = new THREE.Scene();
      const area = buildOff(scene);
      const progression = cp(mem());
      const page = fakePage();
      const life = area.life({ scene, ground: area.ground, audio: null, log: createDiscoveryLog(progression), progression, reducedMotion: false, tier: { name: 'high' }, doc: page.doc, win: page.win });
      const session = { goals: null, pounceTime: 0, perched: null, fx: { burst() {} }, cat: new THREE.Object3D(), idleTime: 0, traversal: NT };
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 3, 50);
      for (let i = 0; i < 10; i++) life.update(DT, i * DT, { x: 0, y: 0, z: 45 }, camera, session);
      expect(session.traversal).toBe(NT);
      expect(life.bound.active).toBe(false);
      expect(life.bound.lift).toBe(0);
      expect(scene.getObjectByName('moon:rings')).toBeUndefined();
      // a plain hop: the camera ease and the hop's own lift as in 7a (the camera is lowered by 40 percent of the hop's height, session.hopLift is the skip)
      session.pounceTime = 1.08 * 0.5;
      const y0 = camera.position.y;
      life.update(DT, 1, { x: 0, y: 0, z: 45 }, camera, session);
      expect(camera.position.y).toBeLessThan(y0);
      expect(session.hopLift).toBe(0);
      life.dispose();
    } finally {
      vi.doUnmock('../src/world/moonswitch.js');
      vi.resetModules();
    }
  });
});
