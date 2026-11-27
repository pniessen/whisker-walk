// =============================================================================
// THE CRYSTAL CAVE, WING C: LUMI'S CART ON A WALK (milestone C4). The little wooden cart (a lantern on its hook) rolls along the old track by world/pathride.js (the spec cart:
// 1.0 to 3.0 m/s). It halts on the platform at each end for a few seconds, then rolls to the rubber bumper and back the way it came. Stand near it while it waits: "Hop on Lumi's
// cart". She sits in it (the walk's sit pose) and the stick only nudges its speed; the action button again, anywhere, is "Hop off", onto the nearest of the precomputed free spots
// (the platforms' and the line's east side: a test floods each). A walk that ends while she rides sets her down on a PLATFORM.
//
// HOW IT HOOKS IN (the river boat's way, crystalriverlive.js): on its first frame the live swaps the walk's `session.fair` for a copy with its own update, late, jump, pawKind and
// groundSpot, which hand over to whatever fair was there (the boat's) while she is not on the cart; puts `session.perched` on the seat record, sets the player's perchY and
// carries the camera. CO-WALK: `session.fair.riding = { id: 'crystal-cart' }`. One seat. Nothing is saved but one journal count (cccart on the first ride of a walk). Reduced motion
// adds nothing: the cart still moves, and its lantern halo holds still. Draws no random number and reads no clock.
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { createPathRide, stepPath, hopOffSpot } from './pathride.js';
import * as C from './crystalcartplan.js';
import * as D from './crystalcartparts.js';
import { crystalY } from './crystalplan.js';
import './crystalcartwords.js';

export const SEAT_FRAME = Object.freeze({ camOut: 0.12, camUp: 0.2, camEase: 2.4 });
const BOARD_DWELL = 1.5; // a rider's wait on the platform after she sits down
const START_DWELL = 3; // the cart waits this long at the north platform when the cave opens

// createCartLive(ctx) -> { promptAt, interact, update, hooks, install, state, credit, spottable, dispose }
// ctx: { scene, ground, player, reducedMotion, tier, progression }
export function createCartLive(ctx) {
  const { scene, reducedMotion = false, player: ctxPlayer = null } = ctx;
  const ground = ctx.ground;
  const gy = (x, z) => (ground ? ground.y(x, z) : crystalY(x, z));
  const objs = [];
  const add = (o) => { scene.add(o); objs.push(o); return o; };

  add(D.drawTrack());
  add(D.drawPlatformLamps());
  const cart = D.drawCart();
  add(cart.group);

  let ride = createPathRide(C.TRACK_PATH, C.CART_SPEC, 0);
  ride = { ...ride, dwell: START_DWELL, stop: 'north', lastStop: 0 };
  let riding = false;
  let hookSession = null;
  let hookOrig = null;
  let installed = false;
  let ticked = false;
  let want = null;
  let wantOn = false;
  let wantOff = false;
  let camera = null;
  let camW = 0;
  let clock = 0;
  let rode = false;
  const seatRec = { x: 0, z: 0, y: C.CART.seatY, yaw: 0, pose: 'requestPet', ride: false };
  const before = { x: 0, y: 0, z: 0 };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const spot = { type: C.SPOT.type, label: phrase('crystal.wc.cart.name'), pos: new THREE.Vector3(ride.x, gy(ride.x, ride.z) + C.SPOT.up, ride.z), range: C.SPOT.range };
  const tangent = () => (ride.dir < 0 ? ride.heading + Math.PI : ride.heading); // the cart never turns round: it rolls back the way it came

  function place(t) {
    const h = tangent();
    const fx = Math.sin(h) * 0.6, fz = Math.cos(h) * 0.6;
    const ya = gy(ride.x - fx, ride.z - fz), yb = gy(ride.x + fx, ride.z + fz);
    cart.group.position.set(ride.x, gy(ride.x, ride.z) + C.CART.lift, ride.z);
    cart.group.rotation.set(-Math.atan2(yb - ya, 1.2), h, 0);
    cart.halo.material.opacity = reducedMotion ? 0.5 : 0.45 + 0.1 * Math.sin(t * 2.3);
    spot.pos.set(ride.x, cart.group.position.y + C.SPOT.up, ride.z);
  }

  // ---- the walk's hooks (session.fair) ---------------------------------------------------------------------------------------
  function seatCat(cat, player, session) {
    seatRec.x = ride.x;
    seatRec.z = ride.z;
    seatRec.y = Math.max(0.05, C.CART.seatY + C.CART.lift);
    seatRec.yaw = ride.heading + Math.PI;
    session.perched = seatRec;
    session.perchHold = seatRec;
    player.perchY = seatRec.y;
    cat.position.set(ride.x, gy(ride.x, ride.z) + seatRec.y, ride.z);
    cat.rotation.y = ride.heading + Math.PI;
    session.idleTime = 0;
  }

  const blocked = (session) => !!session?.perched;

  function board(cat, player, session) {
    riding = true;
    player.halt?.();
    session.perched = seatRec;
    if (session.fair) session.fair.riding = { id: 'crystal-cart' };
    if (ride.dwell > BOARD_DWELL) ride = { ...ride, dwell: BOARD_DWELL };
    seatCat(cat, player, session);
    if (!rode) { rode = true; try { ctx.progression?.recordSighting?.('cccart'); } catch { /* a stand-in save */ } }
  }

  function getOut(cat, player, session, spots = C.HOP_SPOTS) {
    const to = hopOffSpot(ride, spots);
    riding = false;
    session.perched = null;
    session.perchHold = null;
    if (session.fair) session.fair.riding = null;
    player.perchY = 0;
    cat.position.set(to.x, gy(to.x, to.z), to.z);
    cat.rotation.set(0, ride.heading + Math.PI, 0);
    player.halt?.();
  }

  function step(dt, t, cat, player, session) {
    let input = null;
    if (riding && player?.inputActive) {
      const d = player.inputDirection();
      input = { fwd: d.x * Math.sin(ride.heading) + d.z * Math.cos(ride.heading), side: 0 };
    }
    ride = stepPath(ride, input, dt, C.CART_SPEC, C.TRACK_PATH);
    if (riding) {
      before.x = cat.position.x; before.y = cat.position.y; before.z = cat.position.z;
      seatCat(cat, player, session);
      if (camera) {
        camera.position.set(camera.position.x + cat.position.x - before.x, camera.position.y + cat.position.y - before.y, camera.position.z + cat.position.z - before.z);
        camW += (1 - camW) * Math.min(1, dt * SEAT_FRAME.camEase);
        const c = cat.position;
        const out = 1 + SEAT_FRAME.camOut * camW;
        const vx = camera.position.x - c.x, vy = camera.position.y - c.y, vz = camera.position.z - c.z;
        camera.position.set(c.x + vx * out, c.y + vy * out + SEAT_FRAME.camUp * camW, c.z + vz * out);
        camera.lookAt(c.x, c.y + 0.54, c.z);
      }
    }
  }

  const prev = () => hookOrig ?? {};
  const hooks = {
    update(dt, t, args) {
      prev().update?.(dt, t, args);
      if (!installed) return;
      const { cat, player, session } = args;
      ticked = true;
      if (wantOn && !riding) { wantOn = false; if (!blocked(session)) board(cat, player, session); }
      if (wantOff && riding) { wantOff = false; getOut(cat, player, session); }
      wantOn = false;
      wantOff = false;
      step(dt, t, cat, player, session);
      if (!riding && camW > 0) { camW = Math.max(0, camW - dt * SEAT_FRAME.camEase * (camW + 0.3)); if (camW < 0.004) camW = 0; }
    },
    late(dt, t, args) {
      if (!riding) return prev().late?.(dt, t, args);
      const { session } = args;
      if (session.perched !== seatRec) session.perched = seatRec;
      session.perchHold = seatRec;
      return undefined;
    },
    jump(...a) { return riding ? false : (prev().jump?.(...a) ?? false); },
    pawKind(...a) { return riding ? 'none' : (prev().pawKind?.(...a) ?? null); },
    canBoard(...a) { return riding ? false : (prev().canBoard?.(...a) ?? false); },
    groundSpot(...a) {
      if (!riding) return prev().groundSpot?.(...a) ?? null;
      const to = hopOffSpot(ride, C.PLATFORM_SPOTS); // a walk that ends on the cart is saved on a platform
      return { x: to.x, z: to.z };
    },
    dispose() {},
  };

  function install(session) {
    if (installed || !session) return;
    hookSession = session;
    hookOrig = session.fair;
    session.fair = { ...(hookOrig ?? {}), ...hooks, riding: null };
    installed = true;
  }

  function decide(catPos) {
    if (!catPos) return null;
    if (riding) return { kind: 'off', line: phrase('crystal.wc.cart.off') };
    if (blocked(hookSession) || ride.dwell <= 0.05) return null; // only while it waits on a platform
    return dist(catPos, ride) <= C.CART.reach ? { kind: 'on', line: phrase('crystal.wc.cart.board') } : null;
  }

  const api = {
    get riding() { return riding; },
    get ride() { return ride; },
    hooks,
    install,
    spottable: [spot],
    get state() { return { riding, camW, x: ride.x, z: ride.z, s: ride.s, v: ride.v, stop: ride.stop, dwell: ride.dwell }; },
    promptAt(catPos) {
      want = decide(catPos);
      return want ? want.line : null;
    },
    interact() {
      const w = want;
      want = null;
      if (!w) return null;
      if (w.kind === 'on') wantOn = true; else wantOff = true;
      return w.kind;
    },
    credit() { return null; },
    update(dt, t, catPos, cam, session) {
      const d = dt > 0 ? dt : 0;
      clock += d;
      camera = cam ?? camera;
      if (session) install(session);
      if (!ticked) ride = stepPath(ride, null, d, C.CART_SPEC, C.TRACK_PATH); // (the walk's hook did not run this frame: the cart still moves)
      ticked = false;
      place(clock);
    },
    dispose() {
      // a walk that ends while she rides: set her down on a platform, the fair she found put back
      const s = hookSession;
      if (riding && s?.cat && ctxPlayer) getOut(s.cat, ctxPlayer, s, C.PLATFORM_SPOTS);
      if (s && installed) {
        if (s.perched === seatRec) { s.perched = null; s.perchHold = null; }
        if (s.fair && s.fair !== hookOrig) s.fair = hookOrig;
      }
      installed = false;
      for (const o of objs) {
        scene.remove(o);
        o.traverse?.((n) => { n.geometry?.dispose?.(); n.material?.dispose?.(); });
      }
    },
  };
  return api;
}
