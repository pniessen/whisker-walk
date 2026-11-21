import * as THREE from 'three';
import { houseArea } from '../../src/world/houseplan.js';
import { createPlayer, DEFAULT_PITCH } from '../../src/player.js';
import { createWallSink, makeView, blockers as blockersOf } from '../../src/housewalls.js';
import { CAT_LOOK_Y } from '../../src/cat/model.js';
import { stickToWorld } from '../../src/traversal.js';

// The real player in the Old House (the plan's headless houseArea()), frame by
// frame in main.js's order: player.update, then the walls' sink on this frame's
// camera (house life's job in the game). test/helpers/traversalwalk.js's
// yardWalk, without the traversal runtime (the house has no crossings).
//
// place() puts her at a spot with a view yaw, zoom step and pitch, and starts a
// FRESH sink (every wall standing), so each spot is judged from a standing
// house and never helped by walls a previous spot left down; then one frame.
//
// The importing test file must stub `document` first (test/flattrace.test.js's
// stub) and load this with `await import(...)`: createPlayer listens on it.
export function createHouseWalk({ reducedMotion = true, pace = 3.5 } = {}) {
  const area = houseArea();
  const cat = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, { addEventListener() {} });
  player.setReducedMotion(reducedMotion);
  let sink = createWallSink(area.sections, { reducedMotion });
  const viewOut = {};
  const stick = { x: 0, z: 0 };

  function view() {
    return makeView(cat.position, camera.position, CAT_LOOK_Y, viewOut);
  }
  function frame(dt = 1 / 60) {
    player.update(dt, area.colliders, area.bounds, []);
    sink.update(dt, view());
  }

  return {
    area,
    player,
    cat,
    camera,
    get sink() { return sink; },
    place(x, z, yaw, zoom, pitch = DEFAULT_PITCH) {
      cat.position.set(x, area.ground.y(x, z), z);
      cat.rotation.set(0, 0, 0);
      player.setAvatar(cat, pace);
      player.setGround(area.ground);
      player.setViewYaw(yaw);
      player.setCameraZoom(zoom, { instant: true });
      player.addOrbit(0, (pitch - DEFAULT_PITCH) / 0.004);
      player.enable();
      sink = createWallSink(area.sections, { reducedMotion });
      frame();
    },
    frame,
    run(seconds, dt = 1 / 60) {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) frame(dt);
    },
    view,
    blockers() {
      return blockersOf(area.sections, sink, view());
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
  };
}
