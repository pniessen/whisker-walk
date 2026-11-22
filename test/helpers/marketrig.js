// The Market's live rig (step 2, Tasks 11-14): the real square built headless,
// its stallholders' life (src/marketlive.js) on top, and a stand-in cat, player
// and session shaped like the walk's, on a clock the test drives.
//
//   const r = marketRig({ seed: 7, clock: 1e9 });
//   r.place(x, z);            // stand her there, still (speed 0, no stick)
//   r.walk(dx, dz, speed);    // from now on she walks that way at `speed` m/s
//   r.step(1 / 30, 90);       // 90 frames: move her, clock += dt, live.update
//   r.stall('fish');          // that stall's StallLive (live.stalls)
//   r.setClock(c);            // the time of day the rhythm reads (now())
//   r.setPhase('fish', 'away', 0.2); // the clock put 0.2 s into that stall's 'away'
//   r.local('fish', lx, lz);  // a stall's plan-local spot in the world { x, z }
//   r.grab();                 // the action button: actionFor, then act (null: no prompt)
//   const ben = r.addRemote('ben', x, z, { y, pose }); // a partner's cat
//   r.walkRemote(ben, dx, dz, speed); r.placeRemote(ben, x, z); r.removeRemote(ben);
//
// What it is made of:
//   live     createMarketLive(scene, area, { seed, now: () => clock, reducedMotion,
//            isFree, figure, onEvent: (e) => events.push(e) })
//   area     src/world/market.js's build record (keepers, treatMeshes, anchors, ...)
//   scene    a THREE.Scene holding the built square and whatever live added
//   cat      a THREE.Group at the spawn, with userData.parts.head (a Group 0.3 m
//            up, so carryables.js placeInMouth has a head to hang a treat on)
//   player   { speed, stalking, perchY: 0, inputActive }, what player.js keeps
//   session  { cat, carry: { mouth: createMouth() }, remotes: { list: [] }, playerId: 'me',
//            perched: null, net: { sendEvent: vi.fn() }, landTime: 0, sniffTime: 0 }
//            (`cat` as the walk's session holds it, for actionFor(s) and act).
//            A partner's cat is a remotecats.js-shaped entry ({ playerId, group,
//            speed, pose }) on session.remotes.list: addRemote makes one (its
//            group in the scene at (x, y, z)), walkRemote walks it as the cat
//            walks (the same isWalkableAt stop, its `speed` 0 on a blocked
//            frame), removeRemote takes it off the list (a partner who left).
//   dropHeld a vi.fn the grab hands act: puts down what the mouth holds (carry.js drop)
//   events   every onEvent the life sent, in order
//
// The cat's walk: each frame of a walk moves her by speed * dt along (dx, dz)
// (normalised) and turns her to face it, the way player.js faces her; a step
// into anything solid (isWalkableAt on the area) is not taken and her speed
// that frame is 0, so a walk into a counter stops at it. `t` (the walk's time,
// update's second argument) starts at 0 and counts frames; `clock` is the time
// of day and only moves with step() and setClock().
//
// opts (all optional): seed (7), clock (1e9), reducedMotion (false),
// isFree (default isWalkableAt on the area: the hop's check, Task 12),
// figure (marketlive's default marketFigure), lodNear (the people's near
// distance, the walk's lodNearFor(rung); marketlive's default without it),
// scene/area (a square already
// built, to share one build across rigs), onEvent (also handed each event,
// after `events` has it: the walk's handleMarketEvent, Task 13).
import * as THREE from 'three';
import { vi } from 'vitest';

// The same headless canvas stub every world test uses (test/market.test.js):
// the ground's and the lamp posts' tiles paint on a canvas. Stubbed when this
// helper loads, before any build runs (loading market.js paints nothing).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build } = await import('../../src/world/market.js');
const { createMarketLive } = await import('../../src/marketlive.js');
const { createPeopleKit } = await import('../../src/people/index.js');
const { createMouth, drop } = await import('../../src/carry.js');
const { stallOffsets, periodOf, STALL_TIMES, MARKET } = await import('../../src/marketrules.js');
const { stallById, fromStall } = await import('../../src/world/marketplan.js');
const { isWalkableAt } = await import('../../src/player.js');

// The real square, built into a fresh scene: { scene, area }.
export function buildSquare() {
  const scene = new THREE.Scene();
  const area = build(scene);
  scene.updateMatrixWorld(true);
  return { scene, area };
}

export function marketRig({
  seed = 7, clock = 1e9, reducedMotion = false, isFree, figure, lodNear, scene: givenScene, area: givenArea, onEvent,
} = {}) {
  const made = givenScene && givenArea ? { scene: givenScene, area: givenArea } : buildSquare();
  const { scene, area } = made;
  let now = clock;
  let t = 0;
  const events = [];

  const cat = new THREE.Group();
  cat.name = 'rig-cat';
  const head = new THREE.Group();
  head.position.set(0, 0.3, -0.2);
  cat.add(head);
  cat.userData.parts = { head };
  cat.position.set(area.spawn.x, 0, area.spawn.z);
  scene.add(cat);

  const player = { speed: 0, stalking: false, perchY: 0, inputActive: false };
  const session = {
    cat,
    carry: { mouth: createMouth() },
    remotes: { list: [] },
    playerId: 'me',
    perched: null,
    net: { sendEvent: vi.fn() },
    landTime: 0,
    sniffTime: 0,
  };

  const free = typeof isFree === 'function' ? isFree : (x, z) => isWalkableAt(area, x, z);
  const live = createMarketLive(scene, area, {
    people: createPeopleKit, // as the walk hands it over, from the market pack
    seed,
    now: () => now,
    reducedMotion,
    isFree: free,
    onEvent: (e) => { events.push(e); onEvent?.(e); },
    ...(figure ? { figure } : {}),
    ...(lodNear ? { lodNear } : {}),
  });

  // her walk: a unit direction and a speed, or none
  const going = { x: 0, z: 0, speed: 0 };
  // each partner's walk, the same way
  const remoteGoing = new Map();

  // one walking step of `obj` along `g`: the speed it really went this frame
  function stepWalk(obj, g, dt) {
    if (!(g.speed > 0)) return 0;
    const nx = obj.position.x + g.x * g.speed * dt;
    const nz = obj.position.z + g.z * g.speed * dt;
    if (!isWalkableAt(area, nx, nz)) return 0;
    obj.position.x = nx;
    obj.position.z = nz;
    return g.speed;
  }
  function moveCat(dt) {
    player.speed = stepWalk(cat, going, dt);
    for (const e of session.remotes.list) {
      const g = remoteGoing.get(e);
      if (g) e.speed = stepWalk(e.group, g, dt);
    }
  }
  const aim = (g, dx, dz, speed) => {
    const len = Math.hypot(dx, dz);
    g.x = len > 0 ? dx / len : 0;
    g.z = len > 0 ? dz / len : 0;
    g.speed = len > 0 ? speed : 0;
    return len;
  };
  const dropHeld = vi.fn(() => drop(session.carry.mouth, cat.position.x, cat.position.z));

  const rig = {
    live, area, scene, cat, player, session, events, dropHeld,
    get clock() { return now; },
    get t() { return t; },
    setClock(c) { now = c; },
    step(dt, n = 1) {
      for (let i = 0; i < n; i++) {
        moveCat(dt);
        now += dt;
        t += dt;
        live.update(dt, t, { cat, player, session });
      }
      return rig;
    },
    place(x, z) {
      cat.position.set(x, 0, z);
      going.speed = 0;
      player.speed = 0;
      player.inputActive = false;
      return rig;
    },
    walk(dx, dz, speed) {
      const len = aim(going, dx, dz, speed);
      player.inputActive = going.speed > 0;
      // player.js faces her along her motion: forward is -z of her group
      if (len > 0) cat.rotation.y = Math.atan2(-going.x, -going.z);
      return rig;
    },
    stall(id) {
      return live.stalls.find((s) => s.id === id) ?? null;
    },
    // the clock put `into` seconds into that stall's `phase` (serve, busy, turn, away, back)
    setPhase(id, phase, into = 0) {
      const t = STALL_TIMES[id];
      const starts = { serve: 0, busy: t.serve, turn: t.serve + MARKET.BUSY_S };
      starts.away = starts.turn + MARKET.TURN_S;
      starts.back = starts.away + t.away;
      const P = periodOf(id);
      const off = stallOffsets(seed)[id];
      const base = 1e9;
      const u = starts[phase] + into;
      now = base + ((((u - off - base) % P) + P) % P);
      return rig;
    },
    local(id, lx, lz) {
      return fromStall(stallById(id), lx, lz);
    },
    // the action button: the prompt's action, then act (null when there is no prompt)
    grab() {
      const action = live.actionFor(session);
      return action ? live.act(action, session, { dropHeld }) : null;
    },
    addRemote(playerId, x, z, { y = 0, pose = 'follow' } = {}) {
      const group = new THREE.Group();
      group.name = `rig-remote:${playerId}`;
      group.position.set(x, y, z);
      scene.add(group);
      const entry = { playerId, group, speed: 0, pose };
      session.remotes.list.push(entry);
      remoteGoing.set(entry, { x: 0, z: 0, speed: 0 });
      return entry;
    },
    walkRemote(entry, dx, dz, speed) {
      aim(remoteGoing.get(entry), dx, dz, speed);
      return rig;
    },
    placeRemote(entry, x, z) {
      entry.group.position.x = x;
      entry.group.position.z = z;
      aim(remoteGoing.get(entry), 0, 0, 0);
      entry.speed = 0;
      return rig;
    },
    removeRemote(entry) {
      const i = session.remotes.list.indexOf(entry);
      if (i >= 0) session.remotes.list.splice(i, 1);
      entry.group.removeFromParent();
      remoteGoing.delete(entry);
      return rig;
    },
  };
  return rig;
}
