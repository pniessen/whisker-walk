import * as THREE from 'three';
import { houseArea, houseFloorGround, secretColliders, HOUSE_LEDGES } from '../../src/world/houseplan.js';
import { houseMovesArea } from '../../src/world/housemoves.js';
import { createPlayer, DEFAULT_PITCH } from '../../src/player.js';
import { createTraversalLive, NO_TRAVERSAL } from '../../src/traversallive.js';
import { createWallSink, createCellarLid, lidInLine, makeView, blockers as blockersOf } from '../../src/housewalls.js';
import { CAT_LOOK_Y } from '../../src/cat/model.js';
import { stickToWorld } from '../../src/traversal.js';
import { createLedgeGuards } from '../../src/world/houseguards.js';

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
// moves (step 2, Task 3): the area is houseMovesArea(), with the traversal runtime
// (traversallive.js) on its moves, run as main.js runs it: traversal.update BEFORE
// player.update (on the plank or in a hop it places her and holds the player), then
// game/avatar.js's part (a stand-in: speedFactor 0 while perched, else 1), the walls,
// then the runtime's late(). placeOnLedge puts her on a ledge's top (and says so if
// the spot is not on it), placeOnPerch on a knock-over perch as the jump button does
// (game/interactions.js: perchY the perch's height, session.perched the perch), and
// jump() presses the traversal's jump button (a tour's pilot is handed `traversal` and
// `ctx` to press it itself). Without moves nothing changes.
//
// The camera keeps out of the house's floors (houseFloorGround), not the furniture
// tops, as the built house hands the walk (house.js areaData.cameraGround).
//
// guards (rough edges 1 and 2, on by default): the ledges' guards (houseguards.js) as house
// life keeps them in the walk's live colliders, set for her spot as she is placed and after
// every frame's player.update. The live list (`live`) is the area's colliders plus the set
// standing; area.colliders stays the plan's, for the tests' floods and spot checks.
// secretOpen may name the side it opened to: true and 'library' (from the stair, step 2's
// row) or 'stair' (from the library, rough edge 3).
//
// The importing test file must stub `document` first (test/flattrace.test.js's
// stub) and load this with `await import(...)`: createPlayer listens on it.
export function createHouseWalk({ reducedMotion = true, pace = 3.5, secretOpen = false, moves = false, guards: guarded = true } = {}) {
  const area = moves ? houseMovesArea() : houseArea();
  if (secretOpen) area.colliders = [...area.colliders.filter((c) => !c.secret), ...secretColliders(true, secretOpen === 'stair' ? 'stair' : 'library')];
  // the camera keeps out of the floors, not the furniture tops, as the game's house hands it (house.js cameraGround)
  const cameraGround = houseFloorGround();
  const live = [...area.colliders];
  const guards = guarded ? createLedgeGuards(live, cameraGround) : null;
  const cat = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, { addEventListener() {} });
  player.setReducedMotion(reducedMotion);
  let lid = createCellarLid(area.lid, area.sections);
  let sink = createWallSink(area.sections, { reducedMotion, covers: lid.covers });
  const viewOut = {};
  const stick = { x: 0, z: 0 };
  const session = { perched: null, fight: null, chasing: false, idleTime: 0 };
  const ctx = { cat, player, session };
  let traversal = NO_TRAVERSAL;
  const freshTraversal = () => {
    traversal.dispose();
    traversal = moves ? createTraversalLive(area.traversal, { ground: area.ground, reducedMotion }) : NO_TRAVERSAL;
  };
  freshTraversal();
  let t = 0;

  function view() {
    return makeView(cat.position, camera.position, CAT_LOOK_Y, viewOut);
  }
  function frame(dt = 1 / 60) {
    t += dt;
    if (moves) traversal.update(dt, t, ctx);
    player.update(dt, live, area.bounds, []);
    guards?.update(cat.position); // house life's part
    if (moves) {
      player.speedFactor = session.perched ? 0 : 1; // game/avatar.js, after player.update
      cat.rotation.x = 0;
      cat.rotation.z = 0;
    }
    const v = view();
    lid.look(v);
    sink.update(dt, v);
    lid.update(dt, sink);
    if (moves) traversal.late(dt, t, ctx);
  }
  // A fresh start at the cat's spot: the player on her with this view, a fresh sink and lid
  // settled on its first picture, as a walk's start does (see above).
  function start(yaw, zoom, pitch, perchY) {
    cat.rotation.set(0, 0, 0);
    player.setAvatar(cat, pace);
    player.setGround(area.ground);
    player.setCameraGround(cameraGround);
    player.setViewYaw(yaw);
    player.setCameraZoom(zoom, { instant: true });
    player.addOrbit(0, (pitch - DEFAULT_PITCH) / 0.004);
    player.enable();
    player.perchY = perchY;
    player.speedFactor = perchY ? 0 : 1;
    freshTraversal();
    lid = createCellarLid(area.lid, area.sections);
    sink = createWallSink(area.sections, { reducedMotion, covers: lid.covers });
    guards?.dispose(); // a fresh walk's house life has none standing yet
    guards?.update(cat.position);
    player.update(1 / 60, live, area.bounds, []);
    guards?.update(cat.position);
    const v = view();
    lid.look(v);
    sink.settle(v);
    lid.settle(sink);
  }

  return {
    area,
    player,
    cat,
    camera,
    get sink() { return sink; },
    get lid() { return lid; },
    get traversal() { return traversal; },
    guards,
    live,
    session,
    ctx, // the traversal's context, for a pilot's jump (housetour.js createHousePilot)
    place(x, z, yaw, zoom, pitch = DEFAULT_PITCH) {
      cat.position.set(x, area.ground.y(x, z), z);
      session.perched = null;
      start(yaw, zoom, pitch, 0);
    },
    placeOnLedge(id, x, z, yaw, zoom, pitch = DEFAULT_PITCH) {
      const l = HOUSE_LEDGES.find((q) => q.id === id);
      if (!l) throw new Error(`no ledge ${id}`);
      if (x < l.minX - 1e-9 || x > l.maxX + 1e-9 || z < l.minZ - 1e-9 || z > l.maxZ + 1e-9 || Math.abs(area.ground.y(x, z) - l.y) > 1e-6) {
        throw new Error(`${x},${z} is not on ${id}`);
      }
      cat.position.set(x, l.y, z);
      session.perched = null;
      start(yaw, zoom, pitch, 0);
    },
    placeOnPerch(perch, yaw, zoom, pitch = DEFAULT_PITCH) {
      cat.position.set(perch.x, area.ground.y(perch.x, perch.z) + perch.y, perch.z);
      session.perched = perch;
      start(yaw, zoom, pitch, perch.y);
    },
    // The traversal's jump button (game/interactions.js asks it first); true when it took the press.
    jump() {
      return traversal.jump(ctx);
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
