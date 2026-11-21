import * as THREE from 'three';
import { houseArea, secretColliders } from '../../src/world/houseplan.js';
import { createPlayer, DEFAULT_PITCH } from '../../src/player.js';
import { createWallSink, createCellarLid, lidInLine, makeView, blockers as blockersOf } from '../../src/housewalls.js';
import { CAT_LOOK_Y } from '../../src/cat/model.js';
import { stickToWorld } from '../../src/traversal.js';

// The real player in the Old House (the plan's headless houseArea()), frame by
// frame in main.js's order: player.update, then the walls' sink on this frame's
// camera (house life's job in the game). test/helpers/traversalwalk.js's
// yardWalk, without the traversal runtime (the house has no crossings).
//
// place() puts her at a spot with a view yaw, zoom step and pitch, and starts a
// FRESH sink, so each spot is never helped by walls a previous spot left down;
// then the player's frame puts the camera on her spot and the sink settles on
// that view at once, as a walk's start does in the game (game/walk.js calls the
// house life's settle). Settling does not depend on reduced motion: with
// easing on, the first picture is just as clear.
//
// The cellar's lid (owner's fix B) runs as house life runs it: looked at
// before the sink, updated after it. blockers() names it ('cellarLid') when it
// is shown and the line to her look or paws meets it.
//
// secretOpen (step 2): the library's secret bookcase stands open, its open
// colliders in place of its shut ones (houseplan.js secretColliders).
//
// The importing test file must stub `document` first (test/flattrace.test.js's
// stub) and load this with `await import(...)`: createPlayer listens on it.
export function createHouseWalk({ reducedMotion = true, pace = 3.5, secretOpen = false } = {}) {
  const area = houseArea();
  if (secretOpen) area.colliders = [...area.colliders.filter((c) => !c.secret), ...secretColliders(true)];
  const cat = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, { addEventListener() {} });
  player.setReducedMotion(reducedMotion);
  let lid = createCellarLid(area.lid, area.sections);
  let sink = createWallSink(area.sections, { reducedMotion, covers: lid.covers });
  const viewOut = {};
  const stick = { x: 0, z: 0 };

  function view() {
    return makeView(cat.position, camera.position, CAT_LOOK_Y, viewOut);
  }
  function frame(dt = 1 / 60) {
    player.update(dt, area.colliders, area.bounds, []);
    const v = view();
    lid.look(v);
    sink.update(dt, v);
    lid.update(dt, sink);
  }

  return {
    area,
    player,
    cat,
    camera,
    get sink() { return sink; },
    get lid() { return lid; },
    place(x, z, yaw, zoom, pitch = DEFAULT_PITCH) {
      cat.position.set(x, area.ground.y(x, z), z);
      cat.rotation.set(0, 0, 0);
      player.setAvatar(cat, pace);
      player.setGround(area.ground);
      player.setViewYaw(yaw);
      player.setCameraZoom(zoom, { instant: true });
      player.addOrbit(0, (pitch - DEFAULT_PITCH) / 0.004);
      player.enable();
      lid = createCellarLid(area.lid, area.sections);
      sink = createWallSink(area.sections, { reducedMotion, covers: lid.covers });
      player.update(1 / 60, area.colliders, area.bounds, []);
      const v = view();
      lid.look(v);
      sink.settle(v);
      lid.settle(sink);
    },
    frame,
    run(seconds, dt = 1 / 60) {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) frame(dt);
    },
    view,
    blockers() {
      const v = view();
      const out = blockersOf(area.sections, sink, v);
      if (lid.shown && lidInLine(area.lid, v)) out.push('cellarLid');
      return out;
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
