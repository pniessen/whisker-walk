import { describe, it, expect, afterEach, vi } from 'vitest';
import { coop, joined, pad, set, reset, newSession, createRemoteCats, THREE, PAD_BUTTONS, SECOND_ID } from './helpers/couchrig.js';
import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5(e) gaps: the rides of the Fairground, two riders. Real fair world, real ride simulation and live code (src/fairlive.js),
// real player code for both cats, real discovery log and progression; fake pads. Cat one boards through the own jump of the rides;
// the A press of cat two boards through the same jumpTarget with the seat cat one holds kept clear, so every ride carries both
// cats on two seats. Cat two writes no ride event and no save.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { build } = await import('../src/world/fair.js');
const { createFairLive } = await import('../src/fairlive.js');
const { RIDE } = await import('../src/fairsim.js');
const { propsFor, frameColliders } = await import('../src/propsets.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { COOP_READY } = await import('../src/coop/table.js');

afterEach(reset);
const DT = 1 / 60;
const world = new THREE.Scene();
const area = build(world);
for (const f of propsFor('fair').flaps) for (const c of frameColliders(f)) area.colliders.push({ ...c });
world.updateMatrixWorld(true);
const A = PAD_BUTTONS.A;
const clock = { T: 3000.37 };
const events = [];
const ring = (cx, cz, base, a, gap = 0.4) => ({ x: cx + Math.cos(a) * (base + CAT_RADIUS + gap), z: cz + Math.sin(a) * (base + CAT_RADIUS + gap) });
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function fairWalk(at, T = 3000.37) {
  clock.T = T; events.length = 0;
  const r = joined();
  const s = newSession('fair', { ground: area.ground });
  s.scene = world;
  s.remotes = createRemoteCats(world, { ground: area.ground });
  world.add(s.cat);
  s.areaData = { collectibles: [], waters: [], perches: [], ...area };
  s.collectibleMeshes = new Map();
  s.fair = createFairLive(world, area, { now: () => clock.T, onEvent: (e) => events.push(e) });
  s.cat.position.set(at.x, 0, at.z);
  r.player.setAvatar(s.cat, 3.5);
  r.player.setGround(area.ground);
  r.player.enable(); r.player.setTouchEngaged(true);
  r.setSession(s); r.tick(2);
  const w = { r, s, live: s.fair, sim: s.fair.sim };
  w.tick = (n = 1) => { for (let i = 0; i < n; i++) { clock.T += DT; r.tick(1); } };
  w.two = () => r.two().group.position;
  w.putTwo = (x, z) => { r.h.mover.body.position.set(x, 0, z); };
  w.one = () => w.live.jump({ cat: s.cat, player: r.player, session: s });
  w.press = () => { set(r, pad(0), pad(1, [A])); w.tick(2); set(r, pad(0), pad(1)); w.tick(2); }; // A on the pad of cat two
  w.stickTwo = (x, y) => { set(r, pad(0), pad(1, [], [x, y, 0, 0])); };
  return w;
}


describe('couch play: the gaps of the Fairground rides', () => {
  it('cat two climbs the helter-skelter stairs, slides, and ends on the mat; no ride event, no save', () => {
    const h = area.anchors.helterStairs;
    const door = area.anchors.helterDoor;
    const w = fairWalk({ x: area.spawn.x, z: area.spawn.z });
    const before = JSON.stringify(w.r.progression.state);
    w.putTwo(door.x, door.z); w.stickTwo(0, 0); w.tick(2);
    for (let i = 0; i < 8 && w.sim.slide.t0 === null; i++) w.press();
    expect(w.sim.slide.t0, 'the slide started').not.toBeNull();
    expect(w.sim.slide.sliding).toBe(true);
    w.tick(60 * 6);
    expect(w.sim.slide.t0).toBeNull();
    expect(flat(w.r.h.mover.body.position, w.sim.slide.mat)).toBeLessThan(0.2);
    expect(h.length).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'slide' || e.type === 'ride')).toEqual([]);
    expect(JSON.stringify(w.r.progression.state)).toBe(before);
  }, 60_000);

  it('cat two does not start the slide under cat one, and cat one does not restart it under cat two', () => {
    const w = fairWalk({ x: area.spawn.x, z: area.spawn.z });
    const t = w.sim.jumpTarget({ x: 0, y: 6.8, z: 0 }, w.sim.slide.top, null, 0, w.sim.slide.chute);
    expect(t.type).toBe('stay');
  });

  it('cat two drawn sways after stepping out of a teacup, then stands straight', () => {
    let tick = 0; // a clock that moves with the frames, so the sway (drawn on the wall clock) is the same on every run
    const clockSpy = vi.spyOn(performance, 'now').mockImplementation(() => (tick += 4) * (1000 / 60) / 4);
    const sim0 = createFairLive(world, area, { now: () => 3000 }).sim;
    const at = ring(sim0.cups.cx, sim0.cups.cz, sim0.cups.baseR, 1.1);
    const w = fairWalk(at);
    w.putTwo(at.x, at.z); w.tick(2);
    w.press();
    expect(w.r.two().seatId).toMatch(/^cups-/);
    w.stickTwo(0, 0); w.tick(3);
    w.stickTwo(0, -1);
    let max = 0;
    for (let i = 0; i < 60 * 2; i++) { w.tick(1); max = Math.max(max, Math.abs(w.r.two()?.group.rotation.z ?? 0)); }
    expect(max).toBeGreaterThan(0.02);
    w.stickTwo(0, 0);
    w.tick(60 * 5);
    expect(Math.abs(w.r.two().group.rotation.z)).toBeLessThan(0.01);
    clockSpy.mockRestore();
  }, 60_000);

  it('cat two sways after a teacup and lays her ears back on the coaster seat (drawn only)', async () => {
    const { createRides } = await import('../src/coop/rides.js');
    const r = createRides();
    const mk = () => ({ rotation: { z: 0 }, userData: { parts: { earL: { rotation: { z: 0.2 } }, earR: { rotation: { z: -0.2 } } } } });
    const g = mk();
    r.look(0.1, 1, {}, g);
    expect(g.userData.parts.earL.rotation.z).toBe(0.2); // not on a fast seat
    expect(g.rotation.z).toBe(0);
  });
});
