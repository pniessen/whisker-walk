import * as THREE from 'three';
import { yardArea } from '../../src/world/traversalyard.js';
import { createPlayer } from '../../src/player.js';
import { createTraversalLive } from '../../src/traversallive.js';
import { BASE_ABILITIES, behindYaw, facingYaw, stickToWorld } from '../../src/traversal.js';

// The real player and the traversal runtime on the test yard, frame by frame
// in main.js's order: the runtime BEFORE player.update (so the player keeps a
// held cat still and places the camera for this frame's spot), then
// game/avatar.js's part (a stand-in here: speedFactor back to 1, the cat
// upright), then the runtime's late().
//
// The importing test file must stub `document` first (test/flattrace.test.js's
// stub) and load this with `await import(...)`: createPlayer listens on it.
export function yardWalk({ at, face, viewYaw, abilities = () => BASE_ABILITIES, reducedMotion = false, cat = new THREE.Group(), area = yardArea(), colliders = [] } = {}) {
  const [x, z] = at;
  cat.position.set(x, area.ground.y(x, z), z);
  if (face) cat.rotation.y = facingYaw(face[0], face[1]);
  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, { addEventListener() {} });
  player.setAvatar(cat, 3.5);
  player.setGround(area.ground);
  player.setReducedMotion(reducedMotion);
  player.setViewYaw(viewYaw ?? (face ? behindYaw(face[0], face[1]) : 0));
  player.enable();
  const events = [];
  const live = createTraversalLive(area.traversal, { ground: area.ground, reducedMotion, abilities, onEvent: (e) => events.push(e) });
  const session = { perched: null, fight: null, chasing: false, idleTime: 0 };
  const ctx = { cat, player, session };
  const trace = [];
  const stick = { x: 0, z: 0 };
  let t = 0;

  function frame(dt = 1 / 60) {
    t += dt;
    live.update(dt, t, ctx);
    player.update(dt, colliders, area.bounds, []);
    player.speedFactor = 1; // game/avatar.js writes it after player.update
    cat.rotation.x = 0;
    cat.rotation.z = 0;
    live.late(dt, t, ctx);
    trace.push([cat.position.x, cat.position.y, cat.position.z, cat.rotation.y].toString());
  }

  return {
    area,
    camera,
    player,
    cat,
    live,
    session,
    ctx,
    events,
    trace,
    frame,
    run(seconds, dt = 1 / 60) {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) frame(dt);
    },
    // A WORLD direction, turned into a stick once with the yaw of the moment
    // and then held, as a child's thumb would be.
    push(wx, wz) {
      stickToWorld(wx, wz, -player.viewYaw(), stick);
      player.setTouchMove({ x: stick.x, z: stick.z, mag: Math.hypot(wx, wz) });
    },
    release() {
      player.setTouchMove(null);
    },
    jump() {
      return live.jump(ctx);
    },
  };
}
