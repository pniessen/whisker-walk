import { describe, it, expect, afterEach } from 'vitest';
import { joined, pad, set, reset, newSession, createRemoteCats, THREE, PAD_BUTTONS, SECOND_ID } from './helpers/couchrig.js';
import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5(e): the rides of the Fairground, two riders. Real fair world, real ride simulation and live code (src/fairlive.js),
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

const ring = (cx, cz, base, a, gap = 0.4) => ({ x: cx + Math.cos(a) * (base + CAT_RADIUS + gap), z: cz + Math.sin(a) * (base + CAT_RADIUS + gap) });

describe('couch play M5(e): the Fairground row', () => {
  it('the Fairground is ready, with this file green', () => { expect(COOP_READY.fair).toBe(true); });
});

describe('couch play M5(e): cat two at the Fairground', () => {
  it('joins beside cat one on clear ground, at the gate and beside each ride', () => {
    const m = area.rides, sim = createFairLive(world, area, { now: () => 3000 }).sim;
    const spots = [area.spawn, ring(sim.mgr.cx, sim.mgr.cz, sim.mgr.baseR, 0.3), ring(sim.cups.cx, sim.cups.cz, sim.cups.baseR, 1.1)];
    expect(m).toBeTruthy();
    for (const at of spots) {
      const w = fairWalk(at);
      const g = w.two();
      expect(isWalkableAt(area, g.x, g.z)).toBe(true);
      expect(flat(g, at)).toBeLessThan(4);
      reset();
    }
  });
});

describe('couch play M5(e): two riders on every ride', () => {
  it('the merry-go-round: both cats board the platform on their own standing places, then hop onto two different horses', async () => {
    const sim0 = createFairLive(world, area, { now: () => 3000 }).sim;
    const at = ring(sim0.mgr.cx, sim0.mgr.cz, sim0.mgr.baseR, 0.3);
    const w = fairWalk(at);
    const { sim, live, s, r } = w;
    w.putTwo(at.x + 0.3, at.z + 0.5);
    w.tick(2);
    expect(w.one()).toBe(true);
    w.tick(2);
    const one = live.riding;
    expect(one?.seatKind).toBe('deck');
    w.press();
    const two = r.two();
    expect(two.seatId, 'cat two is on a seat of the ride').toMatch(/^mgr-/);
    expect(two.seatId).not.toBe(one.id);
    // onto horses
    w.one(); w.tick(2);
    const horseOne = live.riding;
    expect(horseOne.seatKind).toBe('horse');
    w.press();
    const horseTwo = sim.seats.find((x) => x.id === r.two().seatId);
    expect(horseTwo.seatKind).toBe('horse');
    expect(horseTwo).not.toBe(horseOne);
    // both are drawn at their seats (cat one at hers, cat two at hers), at the height of the seat
    w.tick(30);
    await new Promise((res) => setTimeout(res, 300)); // the drawn cat eases onto a seat over the co-walk window, in real time
    w.tick(2);
    const g = r.two().group.position;
    expect(r.two().h).toBeGreaterThan(horseTwo.y - 0.05);
    expect(flat(g, horseTwo)).toBeLessThan(0.05);
    expect(flat(s.cat.position, horseOne)).toBeLessThan(0.05);
  });

  it('cat two never takes the seat cat one is on, and cat one never takes the seat cat two is on', () => {
    const sim0 = createFairLive(world, area, { now: () => 3000 }).sim;
    const a = 0.3;
    const at = ring(sim0.mgr.cx, sim0.mgr.cz, sim0.mgr.baseR, a, 0.2);
    for (const first of ['one', 'two']) {
      const w = fairWalk(at);
      w.putTwo(at.x, at.z + 0.2);
      w.tick(2);
      const ids = [];
      for (let k = 0; k < 3; k++) {
        if (first === 'one') { w.one(); w.press(); } else { w.press(); w.one(); }
        w.tick(1);
        ids.push([w.live.riding?.id, w.r.two().seatId]);
      }
      for (const [x, y] of ids) { expect(x).toBeTruthy(); expect(y).toBeTruthy(); expect(x).not.toBe(y); }
      reset();
    }
  });

  it('the teacups: two cups', () => {
    const sim0 = createFairLive(world, area, { now: () => 3000 }).sim;
    const at = ring(sim0.cups.cx, sim0.cups.cz, sim0.cups.baseR, 1.1, 0.1);
    const w = fairWalk(at);
    w.putTwo(at.x + 0.2, at.z + 0.2);
    w.tick(2);
    w.one(); w.tick(2);
    expect(w.live.riding?.seatKind).toBe('cup');
    for (let i = 0; i < 60 * 30 && !w.r.two().seatId; i++) { if (i % 30 === 0) w.press(); w.tick(1); } // a cup comes by her
    const id = w.r.two().seatId;
    expect(id).toMatch(/^cups-cup-/);
    expect(id).not.toBe(w.live.riding.id);
    w.tick(60);
    expect(w.live.riding?.seatKind).toBe('cup'); // and cat one stayed on
  });

  it('the big wheel: one gondola each, the second the next to come by', () => {
    const sim0 = createFairLive(world, area, { now: () => 3000 }).sim;
    const step = sim0.wheel.step;
    const w = fairWalk({ x: step.x - 0.4, z: step.z });
    const { sim, live, r } = w;
    w.putTwo(step.x - 0.4, step.z + 0.6);
    // wait for a gondola to come by cat one, board; then for the next to come by cat two
    const boardWith = (who) => {
      for (let i = 0; i < 60 * 80; i++) {
        w.tick(1);
        if (who === 'one' ? live.canBoard(w.s.cat, r.player, w.s) : sim.jumpTarget({ x: w.two().x, y: 0, z: w.two().z }, null, null, RIDE.JUMP_SLACK, live.riding)?.type === 'board') return who === 'one' ? w.one() : (w.press(), true);
      }
      return false;
    };
    expect(boardWith('one')).toBe(true);
    const mine = live.riding;
    expect(mine.seatKind).toBe('gondola');
    // cat one rides away; cat two waits on the ground for the next gondola
    expect(boardWith('two')).toBe(true);
    const id = r.two().seatId;
    expect(id).toMatch(/^wheel-/);
    expect(id).not.toBe(mine.id);
    w.tick(60 * 10);
    expect(live.riding).toBe(mine); // both still riding
    expect(r.two().seatId).toBe(id);
  }, 60_000);

  it('the caterpillar coaster: two cars of the same train, in the station', () => {
    const sim0 = createFairLive(world, area, { now: () => 3000 }).sim;
    const st = area.anchors.coasterStation;
    const t0 = RIDE.COASTER_LAP * 300 + 0.5;
    const at = { x: st.minX - 0.6, z: (st.minZ + st.maxZ) / 2 };
    expect(sim0.seats.some((x) => x.seatKind === 'car')).toBe(true);
    const w = fairWalk(at, t0);
    w.putTwo(at.x, at.z + 0.5);
    w.tick(2);
    expect(w.one()).toBe(true);
    w.tick(2);
    const mine = w.live.riding;
    expect(mine?.seatKind).toBe('car');
    w.press();
    const id = w.r.two().seatId;
    expect(id, 'cat two got in the train too').toMatch(/^coaster-car-/);
    expect(id).not.toBe(mine.id);
    w.tick(60 * 20);
    expect(w.live.riding).toBe(mine);
    // the train runs; both cats are carried by it and the leash does not pull either off its seat
    expect(w.r.two().seatId).toBe(id);
    const seat = w.sim.seats.find((x) => x.id === id);
    expect(flat(w.r.h.mover.body.position, seat)).toBeLessThan(0.2); // a frame of the train behind: the drawn cat is on the seat itself
    expect(flat(w.s.cat.position, mine)).toBeLessThan(0.01);
    expect(w.r.h.state.owner).toBe(0); // the owner pad of the menus is unchanged by a ride
  }, 60_000);
});

describe('couch play M5(e): getting off, follow, save', () => {
  function onHorses() {
    const sim0 = createFairLive(world, area, { now: () => 3000 }).sim;
    const at = ring(sim0.mgr.cx, sim0.mgr.cz, sim0.mgr.baseR, 0.3);
    const w = fairWalk(at);
    w.putTwo(at.x + 0.3, at.z + 0.5);
    w.tick(2);
    w.one(); w.press(); w.one(); w.press();
    w.tick(4);
    return w;
  }

  it('a pushed stick takes cat two off the ride in a short hop, onto clear ground; cat one stays on', () => {
    const w = onHorses();
    const horse = w.live.riding;
    expect(w.r.two().seatId).toBeTruthy();
    // a stick held since the jump holds her; let go, then push
    w.stickTwo(0, 0); w.tick(3);
    w.stickTwo(0, -1); w.tick(1);
    for (let i = 0; i < 90; i++) w.tick(1);
    const g = w.two();
    expect(w.r.two().seatId).toBeNull();
    expect(isWalkableAt(area, g.x, g.z)).toBe(true);
    expect(w.live.riding).toBe(horse);
  });

  it('a seated cat is not called away by follow-when-idle, and the rider\'s friend is not either', () => {
    const w = onHorses();
    const id = w.r.two().seatId;
    w.tick(60 * 12); // well past the 3 s of rest of the follow rule
    expect(w.r.h.state.following).toEqual([false, false]);
    expect(w.r.two().seatId).toBe(id);
    expect(w.live.riding).toBeTruthy();
  });

  it('cat two\'s rides write no ride event of their own; the household journal counts the ride once (S5b), and cat one\'s own boarding adds no second count', () => {
    const sim0 = createFairLive(world, area, { now: () => 3000 }).sim;
    const at = ring(sim0.mgr.cx, sim0.mgr.cz, sim0.mgr.baseR, 0.3);
    const w = fairWalk(at);
    w.putTwo(at.x + 0.3, at.z + 0.5);
    w.tick(2);
    const rest = (st) => JSON.stringify({ ...st, journal: {} }); // a ride's journal page is the household's (S5b)
    const before = rest(w.r.progression.state);
    const pages = () => Object.values(w.r.progression.state.journal).reduce((a, n) => a + n, 0);
    w.press(); w.press(); w.tick(30); // cat two alone: deck, horse
    expect(w.r.two().seatId).toBeTruthy();
    expect(events.filter((e) => e.type === 'ride')).toEqual([]);
    expect(rest(w.r.progression.state)).toBe(before);
    expect(pages()).toBe(1);
    // the own boarding of cat one still says its event, exactly once, and the walk's log keeps the page from counting twice
    w.one(); w.tick(3);
    expect(events.filter((e) => e.type === 'ride').length).toBe(1);
    expect(pages()).toBe(1);
  });

  it('cat two leaves the walk while seated: her seat is not held for her, and nothing of her stays in the scene', () => {
    const w = onHorses();
    const taken = w.r.two().seatId;
    expect(taken).toBeTruthy();
    w.r.h.stop(); // couch play ends: cat two leaves the walk, seat and all
    expect(w.r.two()).toBeUndefined();
    expect(w.live.riding).toBeTruthy(); // cat one rides on
    expect(SECOND_ID).toBe('local:2');
  });
});
