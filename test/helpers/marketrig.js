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
//
// What it is made of:
//   live     createMarketLive(scene, area, { seed, now: () => clock, reducedMotion,
//            isFree, figure, onEvent: (e) => events.push(e) })
//   area     src/world/market.js's build record (keepers, treatMeshes, anchors, ...)
//   scene    a THREE.Scene holding the built square and whatever live added
//   cat      a THREE.Group at the spawn, with userData.parts.head (a Group 0.3 m
//            up, so carryables.js placeInMouth has a head to hang a treat on)
//   player   { speed, stalking, perchY: 0, inputActive }, what player.js keeps
//   session  { carry: { mouth: createMouth() }, remotes: { list: [] }, playerId: 'me',
//            perched: null, net: { sendEvent: vi.fn() }, landTime: 0, sniffTime: 0 }
//            A test adds partner cats by pushing remotecats.js-shaped entries
//            ({ playerId, group, speed, pose }) onto session.remotes.list.
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
// figure (marketlive's default twolegKeeper), scene/area (a square already
// built, to share one build across rigs).
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
const { createMouth } = await import('../../src/carry.js');
const { isWalkableAt } = await import('../../src/player.js');

// The real square, built into a fresh scene: { scene, area }.
export function buildSquare() {
  const scene = new THREE.Scene();
  const area = build(scene);
  scene.updateMatrixWorld(true);
  return { scene, area };
}

export function marketRig({
  seed = 7, clock = 1e9, reducedMotion = false, isFree, figure, scene: givenScene, area: givenArea,
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
    seed,
    now: () => now,
    reducedMotion,
    isFree: free,
    onEvent: (e) => events.push(e),
    ...(figure ? { figure } : {}),
  });

  // her walk: a unit direction and a speed, or none
  const going = { x: 0, z: 0, speed: 0 };

  function moveCat(dt) {
    if (!(going.speed > 0)) { player.speed = 0; return; }
    const nx = cat.position.x + going.x * going.speed * dt;
    const nz = cat.position.z + going.z * going.speed * dt;
    if (isWalkableAt(area, nx, nz)) {
      cat.position.x = nx;
      cat.position.z = nz;
      player.speed = going.speed;
    } else player.speed = 0;
  }

  const rig = {
    live, area, scene, cat, player, session, events,
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
      const len = Math.hypot(dx, dz);
      going.x = len > 0 ? dx / len : 0;
      going.z = len > 0 ? dz / len : 0;
      going.speed = len > 0 ? speed : 0;
      player.inputActive = going.speed > 0;
      // player.js faces her along her motion: forward is -z of her group
      if (len > 0) cat.rotation.y = Math.atan2(-going.x, -going.z);
      return rig;
    },
    stall(id) {
      return live.stalls.find((s) => s.id === id) ?? null;
    },
  };
  return rig;
}
