// The Moon, milestone 3: Dot on a walk (world/moonroverlive.js) on the real area, with the walk's own session hooks driven in main.js's order:
// the area life, then session.fair.update (with the player), then the avatar's "a pushed stick takes her off a perch" (climbing.js
// stickTakesOff), then session.fair.late. The player is a stand-in with the calls the hook uses (the stick, halt, perchY).
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { phrase } from '../src/clanphrases.js';
import { stickTakesOff } from '../src/climbing.js';
import { NO_FAIR } from '../src/fairnone.js';
import { CAT_RADIUS } from '../src/player.js';
import { mem } from './helpers/lighthouselife.js';
import { mulberry32 } from '../src/rng.js';
import { ROVER } from '../src/world/moonrover.js';
import { buildDot, DOT_SEATS } from '../src/world/moonroverparts.js';
import { SEAT_FRAME, DUST, RING } from '../src/world/moonroverlive.js';

const gy = (x, z) => P.moonY(x, z);
const DT = 1 / 30;

function fakePlayer() {
  const p = {
    inputActive: false, perchY: 0, halts: 0, dir: { x: 0, z: 0 }, yaw: 0,
    inputDirection() { return { x: p.dir.x, z: p.dir.z }; },
    halt() { p.halts++; },
    viewYaw() { return p.yaw; },
    setViewYaw(v) { p.yaw = v; },
    setInputYaw() {},
    push(x, z) { p.dir.x = x; p.dir.z = z; p.inputActive = x !== 0 || z !== 0; },
  };
  return p;
}

function rig({ save = { step: 1, cells: 0 }, tier = { name: 'high', shadows: true }, reducedMotion = false, free } = {}) {
  const progression = createProgression(mem());
  progression.state.moon = { ...progression.state.moon, ...save };
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion, tier });
  if (free !== undefined) { /* the Tour: swap the life's rover for one asked for it */ }
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 3, 50);
  const cat = new THREE.Group();
  const player = fakePlayer();
  const session = { goals: null, pounceTime: 0, perched: null, perchHold: null, idleTime: 0, fx: { burst: vi.fn() }, cat, fair: NO_FAIR };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  let t = 0;
  cat.position.set(0, 0, 45);
  const frame = (dt = DT) => {
    t += dt;
    life.update(dt, t, cat.position, camera, session);
    session.fair.update(dt, t, { cat, player, session });
    if (stickTakesOff(session, player.inputActive)) { session.perched = null; player.perchY = 0; }
    player.speedFactor = session.perched ? 0 : 1;
    session.fair.late(dt, t, { cat, player, session });
  };
  const run = (secs) => { for (let i = 0; i < Math.round(secs / DT); i++) frame(); };
  const at = (x, z) => { cat.position.set(x, gy(x, z), z); };
  const press = () => { const line = life.promptAt(cat.position); const kind = line ? life.interact() : null; frame(); frame(); return { line, kind }; };
  const hopIn = () => { at(P.DOT_PARK.x - 1.9, P.DOT_PARK.z + 0.4); frame(); return press(); };
  const dot = () => life.rover.state;
  return { scene, area, life, camera, cat, player, session, progression, events, frame, run, at, press, hopIn, dot, tour: () => life.rover, dispose() { off(); life.dispose(); } };
}
const lines = (events) => events.map((e) => e.label);
afterEach(() => vi.restoreAllMocks());

describe('the hook on the walk', () => {
  it('the life swaps the walk\'s NO_FAIR for a copy with Dot\'s calls on its first frame, keeps every other call of it, and gives it back when the walk ends', () => {
    const r = rig();
    expect(r.session.fair).toBe(NO_FAIR);
    r.frame();
    expect(r.session.fair).not.toBe(NO_FAIR);
    for (const k of Object.keys(NO_FAIR)) expect(r.session.fair, k).toHaveProperty(k);
    expect(r.session.fair.update).not.toBe(NO_FAIR.update);
    expect(r.session.fair.actionFor()).toBe(null); // the rest is NO_FAIR's own
    r.dispose();
    expect(r.session.fair).toBe(NO_FAIR);
  });
  it('a walk with no fair at all (a stand-in session) still runs, and is left as it was', () => {
    const r = rig();
    r.session.fair = undefined;
    r.life.update(DT, 1, r.cat.position, r.camera, r.session);
    expect(typeof r.session.fair.update).toBe('function');
    r.dispose();
    expect(r.session.fair).toBeUndefined();
  });
  it('while she is not riding the hooks change nothing: no perch, no jump taken, no paw kind', () => {
    const r = rig();
    r.frame();
    expect(r.session.fair.jump({ cat: r.cat, player: r.player, session: r.session })).toBe(false);
    expect(r.session.fair.pawKind()).toBe(null);
    expect(r.session.perched).toBe(null);
    r.run(2);
    expect(r.session.perched).toBe(null);
    r.dispose();
  });
  it('the Moon\'s other walks are untouched: the Fairground\'s fair and the NO_FAIR leaf are the same file as before (the Moon only reads them)', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/fairnone.js', 'utf8')).toMatch(/export const NO_FAIR = Object\.freeze/);
    for (const f of ['src/game/walk.js', 'src/main.js', 'src/fairlive.js', 'src/game/interactions.js', 'src/game/avatar.js']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/moonrover/);
  });
});

describe('what the rover leaves alone', () => {
  it('the cat is not modified: Dot\'s files import nothing of the cat\'s model or animator (she sits in the walk\'s own "requestPet" pose on a perch record), so the cat-triangle caps cannot move', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['moonrover', 'moonroverlive', 'moonroverparts']) {
      const src = readFileSync(`src/world/${f}.js`, 'utf8');
      for (const m of src.matchAll(/^import .*?from '(.+?)';/gm)) expect(m[1], `${f} imports ${m[1]}`).not.toMatch(/cat\//);
    }
    const r = rig();
    r.hopIn();
    expect(r.session.perched.pose).toBe('requestPet');
    r.dispose();
  });
  it('an older build (or a stray event) that does not know the rover kinds ignores them: the mission machine\'s credit changes nothing, and the rover ignores the mission\'s kinds', async () => {
    const M = await import('../src/world/moonmission.js');
    for (const ev of [{ kind: 'rover-in', seat: 0 }, { kind: 'rover-out', seat: 1 }, { kind: 'rover-pose', x: 1, z: 2, yaw: 0 }]) {
      const r = M.credit({ step: 1, cells: 0 }, ev);
      expect(r.changed).toBe(false);
    }
    const r = rig();
    expect(r.life.rover.credit({ kind: 'wake' })).toBe(null);
    expect(r.life.rover.credit({ kind: 'plug', cell: 0 })).toBe(null);
    r.dispose();
  });
  it('the mission is as it was: both cells in either order still wake the base, and carrying a cell never blocks hopping in', () => {
    const r = rig({ save: { step: 1, cells: 1 } });
    r.life.base.pip.setAwake();
    r.at(P.ROVER_CELL.x - 1, P.ROVER_CELL.z + 0.5);
    r.frame();
    r.life.promptAt(r.cat.position); r.life.interact();
    expect(r.life.base.state.carrying).toBe(1);
    r.at(P.CORE.x + 1.6, P.CORE.z);
    r.frame();
    expect(r.life.promptAt(r.cat.position)).toBe(phrase('moon.core.prompt'));
    r.life.interact();
    r.run(5);
    expect(r.progression.state.moon.step).toBe(4);
    r.dispose();
  });
});

describe('Dot parked at the depot', () => {
  it('is on her pad, facing the track, and a small collider in the live list (a cat walks round her): one, and only one', () => {
    const r = rig();
    expect(r.dot()).toMatchObject({ x: P.DOT_PARK.x, z: P.DOT_PARK.z, riding: false, parked: true });
    expect(r.area.colliders.filter((c) => c.dot)).toHaveLength(1);
    expect(r.life.rover.group.position.x).toBeCloseTo(P.DOT_PARK.x, 6);
    r.dispose();
    expect(r.area.colliders.filter((c) => c.dot)).toHaveLength(0);
  });
  it('offers "Hop in" within reach and not beyond it, and never on a level the cat is not on', () => {
    const r = rig();
    r.frame();
    r.at(P.DOT_PARK.x - 1.9, P.DOT_PARK.z + 0.4);
    expect(r.life.promptAt(r.cat.position)).toBe(phrase('moon.rover.prompt'));
    r.at(P.DOT_PARK.x - 4.5, P.DOT_PARK.z + 2);
    expect(r.life.promptAt(r.cat.position)).toBe(null);
    r.at(P.DOT_PARK.x - 1.9, P.DOT_PARK.z + 0.4);
    r.cat.position.y = 4;
    expect(r.life.promptAt(r.cat.position)).toBe(null);
    r.dispose();
  });
  it('the cat can stand in reach: the parked collider leaves ground to stand on all round her', () => {
    const r = rig();
    let n = 0;
    for (let a = 0; a < 24; a++) {
      const x = P.DOT_PARK.x + Math.cos((a / 24) * 6.28) * 2.2;
      const z = P.DOT_PARK.z + Math.sin((a / 24) * 6.28) * 2.2;
      if (r.area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT_RADIUS)) n++;
    }
    expect(n).toBe(24);
    r.dispose();
  });
  it('shows a hint ring while she waits: faint far off (inside 14 m), bright and pulsing when a press would hop her in, gone when she is far or riding', () => {
    const r = rig();
    r.at(0, 45);
    r.frame();
    expect(r.life.rover.ring.visible).toBe(false); // 30 m away
    r.at(P.DOT_PARK.x - 10, P.DOT_PARK.z);
    r.frame();
    expect(r.life.rover.ring.visible).toBe(true);
    const far = r.life.rover.ring.material.opacity;
    r.at(P.DOT_PARK.x - 1.9, P.DOT_PARK.z + 0.4);
    r.frame();
    expect(r.life.rover.ring.material.opacity).toBeGreaterThan(far);
    expect(r.life.rover.ring.material.opacity).toBeGreaterThan(0.3);
    r.press();
    expect(r.dot().riding).toBe(true);
    expect(r.life.rover.ring.visible).toBe(false);
    expect(RING.near).toBeGreaterThan(P.DOT_REACH);
    r.dispose();
  });
  it('says what she is for the first time she comes near (the depot hint, both sets alike), once', () => {
    const r = rig();
    r.at(P.DEPOT.x - 6, P.DEPOT.z + 3);
    r.run(1);
    expect(lines(r.events)).toContain(phrase('moon.rover.hint'));
    r.events.length = 0;
    r.run(2);
    expect(lines(r.events)).not.toContain(phrase('moon.rover.hint'));
    r.dispose();
  });
});

describe('hopping in: one press, a clear way', () => {
  it('Interact once puts her on the driver\'s seat: the walk\'s sit pose on a perch record, the player held, no collider for Dot, "Hop out" offered', () => {
    const r = rig();
    const { line, kind } = r.hopIn();
    expect(line).toBe(phrase('moon.rover.prompt'));
    expect(kind).toBe('in');
    expect(r.dot()).toMatchObject({ riding: true, seat: 0, parked: false });
    expect(r.session.perched).toMatchObject({ pose: 'requestPet', moonRover: true });
    expect(r.session.perchHold).toBe(r.session.perched);
    expect(r.player.perchY).toBeCloseTo(DOT_SEATS[0].y, 6);
    expect(r.area.colliders.filter((c) => c.dot)).toHaveLength(0);
    expect(r.life.promptAt(r.cat.position)).toBe(phrase('moon.rover.out'));
    // she is on the seat: its place in Dot's frame, at its height over the ground
    const s = r.dot();
    const c = Math.cos(s.yaw); const n = Math.sin(s.yaw);
    expect(r.cat.position.x).toBeCloseTo(s.x + DOT_SEATS[0].x * c + DOT_SEATS[0].z * n, 5);
    expect(r.cat.position.z).toBeCloseTo(s.z - DOT_SEATS[0].x * n + DOT_SEATS[0].z * c, 5);
    expect(r.cat.position.y).toBeCloseTo(gy(s.x, s.z) + DOT_SEATS[0].y, 5);
    r.dispose();
  });
  it('the journal\'s rover page counts one ride a walk, however many hops', () => {
    const r = rig();
    const spy = vi.spyOn(r.progression, 'recordSighting');
    r.hopIn();
    r.press();
    r.hopIn();
    expect(spy.mock.calls.filter((c) => c[0] === 'mnrover')).toHaveLength(1);
    r.dispose();
  });
  it('says how to steer once, on the first hop', () => {
    const r = rig();
    r.hopIn();
    expect(lines(r.events)).toContain(phrase('moon.rover.drive'));
    r.dispose();
  });
  it('the base\'s own offers still win when they are the ones in reach (a cell on the plinth is picked up, not Dot hopped into)', () => {
    const r = rig();
    r.at(P.ROVER_CELL.x - 1, P.ROVER_CELL.z + 0.5);
    r.frame();
    expect(r.life.promptAt(r.cat.position)).toBe(phrase('moon.cell.prompt'));
    r.dispose();
  });
});

describe('steering', () => {
  it('a pushed stick drives Dot (and the cat with her); it never takes the cat off the seat, over twenty seconds of pushing every way', () => {
    const r = rig();
    r.hopIn();
    const rng = mulberry32(5);
    let a = 0;
    for (let i = 0; i < 600; i++) {
      if (i % 45 === 0) a = rng() * 6.28;
      r.player.push(Math.sin(a), Math.cos(a));
      r.frame();
      expect(r.session.perched?.moonRover, `frame ${i}`).toBe(true);
      expect(r.dot().riding).toBe(true);
    }
    expect(r.session.perched.moonRover).toBe(true);
    r.dispose();
  });
  it('drives forward at the plan\'s speed and the cat rides the seat the whole way: her position is the seat\'s, every frame', () => {
    const r = rig();
    r.hopIn();
    r.player.push(0.7, 0.7);
    let top = 0;
    for (let i = 0; i < 150; i++) {
      r.frame();
      top = Math.max(top, r.dot().speed);
      const s = r.dot();
      const c = Math.cos(s.yaw); const n = Math.sin(s.yaw);
      expect(r.cat.position.x).toBeCloseTo(s.x + DOT_SEATS[0].x * c + DOT_SEATS[0].z * n, 4);
      expect(r.cat.position.z).toBeCloseTo(s.z - DOT_SEATS[0].x * n + DOT_SEATS[0].z * c, 4);
      expect(r.cat.rotation.y).toBeCloseTo(s.yaw + Math.PI, 4);
    }
    expect(top).toBeGreaterThan(6);
    expect(top).toBeLessThanOrEqual(ROVER.maxSpeed + 1e-6);
    r.dispose();
  });
  it('lets the stick go and Dot brakes to a stop (a stopped rover stays a stopped rover)', () => {
    const r = rig();
    r.hopIn();
    r.player.push(0, 1);
    r.run(3);
    r.player.push(0, 0);
    r.run(2);
    expect(r.dot().speed).toBe(0);
    const p = { x: r.dot().x, z: r.dot().z };
    r.run(2);
    expect(r.dot().x).toBe(p.x);
    expect(r.dot().z).toBe(p.z);
    r.dispose();
  });
  it('the cat on the seat never clips a collider: over a long drive into every wall there is, her paws are never inside one', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = rig();
      r.hopIn();
      const rng = mulberry32(seed * 313);
      let a = rng() * 6.28;
      let worst = Infinity;
      for (let i = 0; i < 1800; i++) {
        if (rng() < 0.025) a = rng() * 6.28;
        r.player.push(Math.sin(a), Math.cos(a));
        r.frame(DT * (0.6 + rng() * 0.8));
        for (const c of r.area.colliders) worst = Math.min(worst, Math.hypot(r.cat.position.x - c.x, r.cat.position.z - c.z) - c.r - CAT_RADIUS);
      }
      expect(worst, `seed ${seed}`).toBeGreaterThan(0);
      r.dispose();
    }
  });
  it('the cat leans with Dot on a slope after the avatar has posed her (late), and is put back upright on the ground', () => {
    const r = rig();
    r.hopIn();
    r.run(1);
    // drive onto the Great Crater's rim
    r.life.rover.sim.x = -20; r.life.rover.sim.z = 6; r.life.rover.sim.yaw = Math.PI; // facing -z, into the bowl
    r.player.push(0, -1);
    let lean = 0;
    for (let i = 0; i < 60; i++) { r.frame(); lean = Math.max(lean, Math.abs(r.cat.rotation.x) + Math.abs(r.cat.rotation.z)); }
    expect(lean).toBeGreaterThan(0.001);
    expect(lean).toBeLessThan(0.7);
    r.dispose();
  });
  it('the camera is carried with her and eased out a little while she drives; it lets go when she gets out; never under the ground', () => {
    const r = rig();
    r.hopIn();
    r.cat.position.toArray();
    r.camera.position.set(r.cat.position.x, r.cat.position.y + 3, r.cat.position.z + 6);
    r.player.push(0, -1);
    const d0 = r.camera.position.distanceTo(r.cat.position);
    r.run(4);
    expect(r.life.rover.state.camW).toBeGreaterThan(0.9);
    const d1 = new THREE.Vector3().copy(r.camera.position).sub(r.cat.position).length();
    expect(d1).toBeGreaterThan(d0 * 0.9);
    expect(r.camera.position.y).toBeGreaterThan(gy(r.camera.position.x, r.camera.position.z));
    r.player.push(0, 0);
    r.press();
    r.run(3);
    expect(r.life.rover.state.camW).toBe(0);
    expect(SEAT_FRAME.camEase).toBeGreaterThan(0);
    r.dispose();
  });
});

describe('hopping out: one press, anywhere, onto free ground', () => {
  it('Interact once: she is on the ground beside Dot (clear of every collider), the perch is gone, Dot is a parked collider again, and she can step away', () => {
    const r = rig();
    r.hopIn();
    r.player.push(0, 1);
    r.run(2);
    r.player.push(0, 0);
    const { line, kind } = r.press();
    expect(line).toBe(phrase('moon.rover.out'));
    expect(kind).toBe('out');
    expect(r.dot()).toMatchObject({ riding: false, parked: true, speed: 0 });
    expect(r.session.perched).toBe(null);
    expect(r.session.perchHold).toBe(null);
    expect(r.player.perchY).toBe(0);
    for (const c of r.area.colliders) expect(Math.hypot(r.cat.position.x - c.x, r.cat.position.z - c.z)).toBeGreaterThanOrEqual(c.r + CAT_RADIUS - 1e-6);
    expect(Math.hypot(r.cat.position.x - r.dot().x, r.cat.position.z - r.dot().z)).toBeGreaterThan(ROVER.radius);
    expect(r.cat.position.y).toBeCloseTo(gy(r.cat.position.x, r.cat.position.z), 6);
    expect(r.cat.rotation.x).toBe(0);
    expect(r.area.colliders.filter((c) => c.dot)).toHaveLength(1);
    // and "Hop in" is offered again, beside her
    expect(r.life.promptAt(r.cat.position)).toBe(phrase('moon.rover.prompt'));
    r.dispose();
  });
  it('wherever Dot is when she gets out (hard against walls, the dome, the shed, the beacon, the edge of the map), she is put on free ground', () => {
    const spots = [[-24.6, 20], [-12, 26], [P.SHED.x + 3, P.SHED.z], [P.FAR_BEACON.x - 3, P.FAR_BEACON.z], [52.5, 40], [-52.5, -44], [0, -46], [-34, 36], [7.5, -31.5]];
    for (const [x, z] of spots) {
      const r = rig();
      r.hopIn();
      r.run(0.2);
      r.life.rover.sim.x = x; r.life.rover.sim.z = z;
      r.run(0.2);
      r.press();
      expect(r.dot().riding, `${x},${z}`).toBe(false);
      for (const c of r.area.colliders) expect(Math.hypot(r.cat.position.x - c.x, r.cat.position.z - c.z), `${x},${z}`).toBeGreaterThanOrEqual(c.r + CAT_RADIUS - 1e-6);
      r.dispose();
    }
  });
  it('the walk ending while she rides puts the walk\'s perch back (a mid-walk save never finds her on a seat that is gone)', () => {
    const r = rig();
    r.hopIn();
    expect(r.session.perched).not.toBe(null);
    r.dispose();
    expect(r.session.perched).toBe(null);
    expect(r.session.fair).toBe(NO_FAIR);
  });
  it('groundSpot() (the mid-walk note) says where she would be put down while she rides, and nothing otherwise', () => {
    const r = rig();
    r.frame();
    expect(r.session.fair.groundSpot()).toBe(null);
    r.hopIn();
    const g = r.session.fair.groundSpot();
    expect(Number.isFinite(g.x) && Number.isFinite(g.z)).toBe(true);
    r.dispose();
  });
  it('Pip, who stood still while she rode, starts again from where she is put down (no walk back along a footprint trail 60 m long)', () => {
    const r = rig({ save: { step: 1, cells: 0 } });
    r.life.base.pip.setAwake();
    r.at(2, 44);
    r.run(2);
    r.hopIn();
    r.player.push(0, -1);
    r.run(0.1);
    r.life.rover.sim.x = 40; r.life.rover.sim.z = 0;
    r.player.push(0, 0);
    r.run(1);
    r.press();
    expect(r.life.base.pip.crumbs.length).toBeLessThanOrEqual(1);
    r.run(14);
    const pip = r.life.base.pip.position;
    expect(Math.hypot(pip.x - r.cat.position.x, pip.z - r.cat.position.z)).toBeLessThan(5);
    r.dispose();
  });
});

describe('the paw button and the horn', () => {
  it('the paw button (jump) while riding is taken by Dot: a bounce of at most 0.45 m, render only, and the paw badge says "none"', () => {
    const r = rig();
    r.hopIn();
    expect(r.session.fair.pawKind()).toBe('none');
    expect(r.session.fair.jump({ cat: r.cat, player: r.player, session: r.session })).toBe(true);
    let top = 0;
    for (let i = 0; i < 20; i++) { r.frame(); top = Math.max(top, r.cat.position.y - gy(r.cat.position.x, r.cat.position.z) - DOT_SEATS[0].y); }
    expect(top).toBeGreaterThan(0.1);
    expect(top).toBeLessThanOrEqual(0.451);
    r.run(1);
    expect(r.cat.position.y).toBeCloseTo(gy(r.cat.position.x, r.cat.position.z) + DOT_SEATS[0].y, 5);
    expect(r.session.pounceTime).toBe(0); // no Moon hop was started
    r.dispose();
  });
  it('no bounce at all in reduced motion', () => {
    const r = rig({ reducedMotion: true });
    r.hopIn();
    r.session.fair.jump({ cat: r.cat, player: r.player, session: r.session });
    for (let i = 0; i < 20; i++) { r.frame(); expect(r.cat.position.y).toBeCloseTo(gy(r.cat.position.x, r.cat.position.z) + DOT_SEATS[0].y, 5); }
    r.dispose();
  });
  it('a meow while riding honks and flashes the headlamp; a meow on foot does neither (it calls Pip, as before)', () => {
    const r = rig();
    bus.emit('tip:did', { id: 'call' });
    r.frame();
    expect(r.dot().lamp).toBe(false);
    r.hopIn();
    bus.emit('tip:did', { id: 'call' });
    r.frame();
    expect(r.dot().lamp).toBe(true);
    const lamp = r.life.rover.dot.lamp.material.color.r;
    expect(lamp).toBeGreaterThan(0.9);
    r.run(1);
    expect(r.dot().lamp).toBe(false);
    r.dispose();
  });
  it('the horn is a sound of the Moon\'s own (silent when muted), and never throws without audio', () => {
    const calls = [];
    const audio = { isMuted: () => false, getContext: () => ({ state: 'running', currentTime: 0, createOscillator: () => ({ type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() { return { connect() {} }; }, start() { calls.push('osc'); }, stop() {}, disconnect() {} }), createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return {}; }, disconnect() {} }) }), getMaster: () => ({}), stopAmbient() {}, fanfare() {} };
    const progression = createProgression(mem());
    const scene = new THREE.Scene();
    const area = build(scene);
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const life = area.life({ scene, ground: area.ground, audio, log, progression, reducedMotion: false, tier: { name: 'high' } });
    const cat = new THREE.Group();
    cat.position.set(P.DOT_PARK.x - 1.9, 0, P.DOT_PARK.z + 0.4);
    const session = { goals: null, pounceTime: 0, perched: null, perchHold: null, idleTime: 0, fx: { burst() {} }, cat, fair: NO_FAIR };
    const player = fakePlayer();
    const camera = new THREE.PerspectiveCamera();
    life.update(DT, 1, cat.position, camera, session);
    life.promptAt(cat.position); life.interact();
    life.update(DT, 1.1, cat.position, camera, session);
    session.fair.update(DT, 1.1, { cat, player, session });
    bus.emit('tip:did', { id: 'call' });
    expect(calls.length).toBeGreaterThanOrEqual(2); // the chirp of hopping in, then the horn's notes
    life.dispose();
  });
});

describe('the second seat (co-walk credit; solo is the tested path)', () => {
  it('a friend in the driver\'s seat puts her in the passenger\'s; "E - honk" is her button, and the horn flashes the lamp', () => {
    const r = rig();
    expect(r.life.credit({ kind: 'rover-in', seat: 0 })).toBe('in');
    expect(r.life.rover.state.occupant).toEqual(['friend', null]);
    expect(r.area.colliders.filter((c) => c.dot)).toHaveLength(0);
    r.hopIn();
    expect(r.dot()).toMatchObject({ riding: true, seat: 1 });
    expect(r.life.promptAt(r.cat.position)).toBe(phrase('moon.rover.honk'));
    expect(r.life.interact()).toBe('honk');
    expect(r.dot().lamp).toBe(true);
    // her stick does not steer: the driver does
    r.player.push(0, 1);
    r.run(2);
    expect(r.dot().speed).toBe(0);
    expect(r.dot().riding).toBe(true);
    // and the cat is on the passenger's seat
    const s = r.dot();
    const c = Math.cos(s.yaw); const n = Math.sin(s.yaw);
    expect(r.cat.position.x).toBeCloseTo(s.x + DOT_SEATS[1].x * c + DOT_SEATS[1].z * n, 5);
    r.dispose();
  });
  it('a friend\'s rover-pose moves Dot (and the passenger with her); events from nowhere sane are ignored', () => {
    const r = rig();
    r.life.credit({ kind: 'rover-in', seat: 0 });
    r.hopIn();
    expect(r.life.credit({ kind: 'rover-pose', x: P.DOT_PARK.x + 3, z: P.DOT_PARK.z - 3, yaw: 1, speed: 4 })).toBe('pose');
    r.run(0.1);
    expect(r.dot().x).toBeCloseTo(P.DOT_PARK.x + 3, 5);
    expect(Math.hypot(r.cat.position.x - r.dot().x, r.cat.position.z - r.dot().z)).toBeLessThan(0.6);
    const was = { x: r.dot().x, z: r.dot().z };
    for (const bad of [null, undefined, 3, 'x', [], {}, { kind: 5 }, { kind: 'rover-pose' }, { kind: 'rover-pose', x: NaN, z: 0, yaw: 0 }, { kind: 'rover-pose', x: 1e9, z: 0, yaw: 0 }, { kind: 'rover-pose', x: 0, z: 0, yaw: Infinity },
      { kind: 'rover-pose', x: was.x + 100, z: was.z, yaw: 0 }, { kind: '__proto__' }, { kind: 'rover-in', seat: 2 }, { kind: 'rover-in', seat: 'a' }, { kind: 'rover-out', seat: 0.5 }, { kind: 'rover-in', seat: 1 }]) {
      expect(r.life.credit(bad), JSON.stringify(bad)).toBe(null);
    }
    expect(r.dot().x).toBe(was.x);
    expect(r.dot().z).toBe(was.z);
    r.dispose();
  });
  it('a pose with no friend in the driver\'s seat is ignored, and the friend leaving parks Dot again', () => {
    const r = rig();
    expect(r.life.credit({ kind: 'rover-pose', x: 10, z: 10, yaw: 0 })).toBe(null);
    r.life.credit({ kind: 'rover-in', seat: 0 });
    expect(r.life.credit({ kind: 'rover-out', seat: 0 })).toBe('out');
    expect(r.life.rover.state.occupant).toEqual([null, null]);
    expect(r.area.colliders.filter((c) => c.dot)).toHaveLength(1);
    expect(r.life.credit({ kind: 'rover-out', seat: 0 })).toBe(null);
    r.dispose();
  });
  it('she takes the driver\'s seat when it is free, and a friend cannot take the seat she is in', () => {
    const r = rig();
    r.hopIn();
    expect(r.dot().seat).toBe(0);
    expect(r.life.credit({ kind: 'rover-in', seat: 0 })).toBe(null);
    expect(r.life.credit({ kind: 'rover-in', seat: 1 })).toBe('in');
    r.dispose();
  });
  it('the base\'s own credit (a wake, a plug) still goes to the base', () => {
    const r = rig({ save: { step: 0, cells: 0 } });
    expect(r.life.credit({ kind: 'wake' })).toBe('wake');
    expect(r.progression.state.moon.step).toBe(1);
    r.dispose();
  });
});

describe('the Rover Tour (the fallback: ROVER_FREE false)', () => {
  function tourRig() {
    // a life whose Dot is asked for the Tour: the same module, the context's own switch
    const progression = createProgression(mem());
    const scene = new THREE.Scene();
    const area = build(scene);
    return { scene, area, progression };
  }
  it('Dot drives the loop of lights by herself whatever the stick does, the same every time, and she can still hop out', async () => {
    const { createRoverLive } = await import('../src/world/moonroverlive.js');
    const { tourPoint, tourNearest } = await import('../src/world/moonrover.js');
    const run = () => {
      const { scene, area } = tourRig();
      const rover = createRoverLive({ scene, ground: area.ground, colliders: area.colliders, free: false, tier: { name: 'high' } });
      const cat = new THREE.Group();
      cat.position.set(P.DOT_PARK.x - 1.9, 0, P.DOT_PARK.z + 0.4);
      const session = { perched: null, perchHold: null, idleTime: 0, cat, fair: NO_FAIR };
      const player = fakePlayer();
      const camera = new THREE.PerspectiveCamera();
      let t = 0;
      const frame = () => { t += DT; rover.update(DT, t, cat.position, camera, session); session.fair.update(DT, t, { cat, player, session }); session.fair.late(DT, t, { cat, player, session }); };
      frame();
      rover.promptAt(cat.position); rover.interact(); frame(); frame();
      player.push(-1, 0); // a stick pushing the wrong way
      const trail = [];
      for (let i = 0; i < 300; i++) { frame(); trail.push([rover.sim.x, rover.sim.z]); }
      const s0 = tourNearest(P.DOT_PARK.x, P.DOT_PARK.z);
      const p = tourPoint(s0 + 6 * (302 * DT));
      expect(Math.hypot(rover.sim.x - p.x, rover.sim.z - p.z)).toBeLessThan(0.5);
      rover.promptAt(cat.position); expect(rover.interact()).toBe('out'); frame(); frame();
      expect(rover.riding).toBe(false);
      rover.dispose();
      return trail;
    };
    expect(run()).toEqual(run());
  });
});

describe('the dust (a pooled trail: 60 puffs on a full device, 30 on LOW, none on LITE and in reduced motion)', () => {
  const puffsOf = (r) => r.scene.getObjectByName('moon:dotdust');
  const liveCount = (mesh) => { let n = 0; for (let i = 0; i < mesh.count; i++) if (mesh.instanceMatrix.array[i * 16] > 1e-6) n++; return n; }; // (the matrix's own x scale: three's decompose answers 1 for a zero-scale matrix)
  it('never more than the pool, and it does fade out when she stops', () => {
    for (const [tier, max] of [[{ name: 'high', shadows: true }, 60], [{ name: 'low', rung: 3, shadows: true }, 30]]) {
      const r = rig({ tier });
      expect(puffsOf(r).count).toBe(max);
      r.hopIn();
      r.player.push(0, 1);
      let most = 0;
      for (let i = 0; i < 240; i++) { r.frame(); most = Math.max(most, liveCount(puffsOf(r))); }
      expect(most).toBeGreaterThan(5);
      expect(most).toBeLessThanOrEqual(max);
      r.player.push(0, 0);
      r.run(4);
      expect(liveCount(puffsOf(r))).toBe(0);
      r.dispose();
    }
    expect(DUST.max).toBe(60);
    expect(DUST.low).toBe(30);
  });
  it('none at all on the lite rung (no shadows) or in reduced motion: the mesh is never made', () => {
    expect(puffsOf(rig({ tier: { name: 'low', rung: 5, shadows: false } }))).toBeUndefined();
    expect(puffsOf(rig({ reducedMotion: true }))).toBeUndefined();
  });
  it('is one draw (one InstancedMesh), opaque, casts nothing and is no merge candidate', () => {
    const r = rig();
    const m = puffsOf(r);
    expect(m.isInstancedMesh).toBe(true);
    expect(m.material.transparent).toBe(false);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noMerge).toBe(true);
    r.dispose();
  });
});

describe('Dot\'s model: at most 1,800 triangles, 6 meshes, 2 casters, nothing transparent', () => {
  it('measures under the plan\'s numbers', () => {
    const { group } = buildDot();
    let meshes = 0; let tri = 0; let casters = 0; let transparent = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      tri += (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (o.castShadow) casters++;
      if (o.material.transparent) transparent++;
    });
    expect(meshes).toBeLessThanOrEqual(6);
    expect(tri).toBeLessThanOrEqual(1800);
    expect(casters).toBeLessThanOrEqual(2);
    expect(transparent).toBe(0);
    expect(tri).toBeGreaterThan(600);
  });
  it('turns three axles with a wheel at each end, and every mesh opts out of the sweeps (the life moves them)', () => {
    const { axles, group } = buildDot();
    expect(axles).toHaveLength(3);
    group.traverse((o) => { if (o.isMesh) expect(o.userData.noMerge).toBe(true); });
  });
  it('the seats are 0.8 m apart, inside the hull, and the cat on either clears the roll bar\'s legs', () => {
    expect(DOT_SEATS[1].x - DOT_SEATS[0].x).toBeGreaterThanOrEqual(0.75);
    for (const s of DOT_SEATS) expect(Math.abs(s.x)).toBeLessThan(0.72 - CAT_RADIUS * 0.6);
  });
  it('the real scene carries one Dot, her ring and nothing else of hers a walk can see when she is parked (no dust before she moves)', () => {
    const r = rig();
    expect(r.scene.getObjectByName('moon:dot')).toBeTruthy();
    expect(r.scene.getObjectByName('moon:dotring')).toBeTruthy();
    r.dispose();
    expect(r.scene.getObjectByName('moon:dot')).toBeFalsy();
    expect(r.scene.getObjectByName('moon:dotring')).toBeFalsy();
    expect(r.scene.getObjectByName('moon:dotdust')).toBeFalsy();
  });
});

describe('the whole of chapter 1 with Dot: the Rover cell by the rover', () => {
  it('hop in at the depot, drive to the beacon, hop out, pick up the cell, hop in again and bring it back to the dome\'s door; the cell rides with her', () => {
    const r = rig({ save: { step: 1, cells: 1 } });
    r.life.base.pip.setAwake();
    r.hopIn();
    // drive toward the beacon: a steering script (the stick toward a point)
    const go = (x, z, near = 2.5, max = 900) => { for (let i = 0; i < max; i++) { const d = r.dot(); if (Math.hypot(x - d.x, z - d.z) < near) break; r.player.push(x - d.x, z - d.z); r.frame(); } r.player.push(0, 0); };
    go(34, 29); go(42, 20); go(42.5, 2.5, 2);
    expect(Math.hypot(r.dot().x - P.ROVER_CELL.x, r.dot().z - P.ROVER_CELL.z)).toBeLessThan(6);
    r.press(); // out
    expect(r.dot().riding).toBe(false);
    // walk to the cell and take it
    r.at(P.ROVER_CELL.x - 1, P.ROVER_CELL.z + 0.5);
    r.frame();
    expect(r.life.promptAt(r.cat.position)).toBe(phrase('moon.cell.prompt'));
    expect(r.life.interact()).toBe('pick');
    expect(r.life.base.state.carrying).toBe(1);
    // she hops back in with the cell in her mouth: it comes along with her, in front of the seat
    const d = r.dot();
    r.at(d.x - 1.9 * Math.cos(d.yaw), d.z + 1.9 * Math.sin(d.yaw));
    r.frame();
    expect(r.life.promptAt(r.cat.position)).toBe(phrase('moon.rover.prompt'));
    r.life.interact();
    r.frame(); r.frame();
    expect(r.dot().riding).toBe(true);
    expect(r.life.base.state.carrying).toBe(1);
    r.player.push(0, 1);
    r.run(2);
    const cell = r.life.base.cells[1];
    expect(Math.hypot(cell.position.x - r.cat.position.x, cell.position.z - r.cat.position.z)).toBeLessThan(1);
    r.dispose();
  });
  it('the beacon\'s lamp blinks while the cell waits and rests, calm, once it is taken', () => {
    const r = rig({ save: { step: 1, cells: 0 } });
    const lamp = r.scene.getObjectByName('moon:beacon');
    expect(lamp).toBeTruthy();
    const seen = new Set();
    for (let i = 0; i < 90; i++) { r.frame(); seen.add(lamp.material.color.r.toFixed(2)); }
    expect(seen.size).toBeGreaterThan(1); // it blinks
    r.at(P.ROVER_CELL.x - 1, P.ROVER_CELL.z + 0.5);
    r.frame();
    r.life.promptAt(r.cat.position); r.life.interact();
    r.run(0.5);
    const a = lamp.material.color.getHex();
    r.run(0.4);
    expect(lamp.material.color.getHex()).toBe(a); // steady
    r.dispose();
  });
  it('the board\'s third picture is the rover (it tells her how to fetch the second cell)', async () => {
    const { BOARD_ICONS } = await import('../src/world/moonatlas.js');
    expect(BOARD_ICONS[2]).toBe('🚙');
  });
});
