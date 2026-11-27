// =============================================================================
// THE CRYSTAL CAVE, WING C: THE RIVER BOAT ON A WALK (milestone C1). The little boat (a lantern on its bow) runs round the river's closed path by world/pathride.js (the
// spec boat: 0.6 to 2.0 m/s, always moving, pausing at the two docks). Stand on a dock while it waits: "Hop in the little boat". She sits in it (the walk's sit pose) and the
// stick only nudges its speed; the action button again, anywhere, is "Hop off", onto the nearest of the precomputed free spots (the docks' and the banks': a test floods each).
// A walk that ends while she rides sets her down on a DOCK. The same file draws the river, the falls, the docks and the boat, and runs the flow, the fall's streaks and the spray.
//
// HOW IT HOOKS IN (the Reef's way, reefridelive.js): the walk gives an area life no player and no stick, so on its first frame the life swaps the walk's `session.fair` for a
// copy with its own update, late, jump, pawKind and groundSpot, puts `session.perched` on the seat record (pose 'requestPet', speedFactor 0, `perchHold` every frame), sets the
// player's perchY to the seat's height and carries the camera. CO-WALK: `session.fair.riding = { id: 'crystal-boat' }` (src/remotecats.js). One seat. Nothing is saved but one
// journal count (ccboat on the first ride of a walk; ccfalls when she first stands in sight of the fall). Reduced motion freezes the flow, the fall and the bob (the boat still
// moves); LOW keeps half the spray. Draws no random number (seeded streams) and reads no clock.
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { mulberry32 } from '../rng.js';
import { createPathRide, stepPath, hopOffSpot, posAt, pathLength } from './pathride.js';
import * as R from './crystalriverplan.js';
import * as D from './crystalriverparts.js';
import './crystalriverwords.js';

export const SEAT_FRAME = Object.freeze({ camOut: 0.12, camUp: 0.2, camEase: 2.4 });
export const FALL_SIGHT = 16; // she has "seen the falls" within this many metres of the sheet
const BOARD_DWELL = 1.5; // a rider's wait at the dock after she sits down

// createRiverLive(ctx) -> { promptAt, interact, update, hooks, install, state, credit, dispose }
// ctx: { scene, ground, colliders, player, reducedMotion, tier, progression }
export function createRiverLive(ctx) {
  const { scene, reducedMotion = false, player: ctxPlayer = null } = ctx;
  const ground = ctx.ground;
  const gy = (x, z) => (ground ? ground.y(x, z) : 0);
  const low = !!ctx.tier && (ctx.tier.name === 'low' || ctx.tier.shadows === false || (ctx.tier.rung ?? 0) >= 3);
  const objs = [];
  const add = (o) => { scene.add(o); objs.push(o); return o; };

  add(D.drawWater());
  add(D.drawCliff());
  add(D.drawSheet());
  add(D.drawDocks());
  add(D.drawDockLamps());
  const boat = D.drawBoat();
  add(boat.group);
  const flow = D.dashes(D.DASHES, 0.14, 0.5, 0xe6fcff, 0.7, 'cr:flow', true);
  add(flow.mesh);
  const streaks = D.dashes(D.STREAKS, 0.1, 1.5, 0xffffff, 0.8, 'cr:streaks', false);
  add(streaks.mesh);
  const sprayN = low ? D.SPRAY.low : D.SPRAY.high;
  const spray = add(D.drawSpray(sprayN));
  const sprayPos = spray.geometry.attributes.position;

  // seeded phases (never Math.random)
  const rng = mulberry32(0x72697672);
  const dashPh = Array.from({ length: D.DASHES }, (_, i) => ({ s: (i / D.DASHES) * pathLength(R.CENTRE.map((p) => ({ x: p.x, z: p.z }))), off: (rng() - 0.5) * 1.6 }));
  const streakPh = Array.from({ length: D.STREAKS }, (_, i) => ({ z: (i + 0.5) / D.STREAKS - 0.5 + (rng() - 0.5) * 0.06, ph: rng() }));
  const sprayPh = Array.from({ length: sprayN }, () => ({ z: rng() - 0.5, ph: rng(), dx: rng() * 1.2 }));
  const centreLen = pathLength(R.CENTRE);
  const F = R.FALLS;
  const y0 = gy(36, F.z);

  let ride = createPathRide(R.BOAT_PATH, R.BOAT_SPEC, R.STOPS[0].s - 6);
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
  let sawFalls = false;
  const seatRec = { x: 0, z: 0, y: R.BOAT.seatY, yaw: 0, pose: 'requestPet', ride: false };
  const before = { x: 0, y: 0, z: 0 };
  const pos = { x: 0, z: 0 };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  const seatWorld = (out) => {
    // the back bench: 0.3 m behind the boat's middle
    out.x = ride.x - Math.sin(ride.heading) * 0.3;
    out.z = ride.z - Math.cos(ride.heading) * 0.3;
    return out;
  };

  function place(t) {
    const bob = reducedMotion ? 0 : 0.02 * Math.sin(t * 1.7);
    boat.group.position.set(ride.x, gy(ride.x, ride.z) + R.WATER_LIFT + bob, ride.z);
    boat.group.rotation.y = ride.heading;
    boat.halo.material.opacity = reducedMotion ? 0.5 : 0.45 + 0.1 * Math.sin(t * 2.3);
  }

  function animate(t) {
    // the flow's dashes ride the centreline at 0.9 m/s (still under reduced motion)
    for (let i = 0; i < D.DASHES; i++) {
      const ph = dashPh[i];
      const s = reducedMotion ? ph.s : (ph.s + t * 0.9) % centreLen;
      const p = posAt(R.CENTRE, s, ph.off * 0.5);
      flow.put(i, p.x, gy(p.x, p.z) + R.WATER_LIFT + 0.015, p.z, p.heading);
    }
    for (let i = 0; i < D.STREAKS; i++) {
      const k = streakPh[i];
      const u = reducedMotion ? k.ph : (k.ph + t * 0.55) % 1;
      streaks.put(i, F.x - 0.04, y0 + F.top * (1 - u) + 0.3, F.z + k.z * F.w * 0.9);
    }
    for (let i = 0; i < sprayN; i++) {
      const k = sprayPh[i];
      const u = reducedMotion ? 0.35 + k.ph * 0.3 : (k.ph + t * 0.4) % 1;
      sprayPos.setXYZ(i, F.x - 0.5 - k.dx * 1.1 * u, y0 + 0.25 + Math.sin(u * Math.PI) * 1.3, F.z + k.z * F.w * 1.3);
    }
    sprayPos.needsUpdate = true;
  }

  // ---- the walk's hooks (session.fair) ---------------------------------------------------------------------------------------
  function seatCat(cat, player, session) {
    seatWorld(pos);
    seatRec.x = pos.x;
    seatRec.z = pos.z;
    seatRec.y = Math.max(0.05, R.BOAT.seatY + R.WATER_LIFT);
    seatRec.yaw = ride.heading + Math.PI;
    session.perched = seatRec;
    session.perchHold = seatRec;
    player.perchY = seatRec.y;
    cat.position.set(pos.x, gy(pos.x, pos.z) + seatRec.y, pos.z);
    cat.rotation.y = ride.heading + Math.PI;
    session.idleTime = 0;
  }

  const blocked = (session) => !!session?.perched;

  function board(cat, player, session) {
    riding = true;
    player.halt?.();
    session.perched = seatRec;
    if (session.fair) session.fair.riding = { id: 'crystal-boat' };
    if (ride.dwell > BOARD_DWELL) ride = { ...ride, dwell: BOARD_DWELL };
    seatCat(cat, player, session);
    if (!rode) { rode = true; try { ctx.progression?.recordSighting?.('ccboat'); } catch { /* a stand-in save */ } }
  }

  function getOut(cat, player, session, spots = R.HOP_SPOTS) {
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
    ride = stepPath(ride, input, dt, R.BOAT_SPEC, R.BOAT_PATH);
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

  const hooks = {
    update(dt, t, { cat, player, session }) {
      if (!installed) return;
      ticked = true;
      if (wantOn && !riding) { wantOn = false; if (!blocked(session)) board(cat, player, session); }
      if (wantOff && riding) { wantOff = false; getOut(cat, player, session); }
      wantOn = false;
      wantOff = false;
      step(dt, t, cat, player, session);
      if (!riding && camW > 0) { camW = Math.max(0, camW - dt * SEAT_FRAME.camEase * (camW + 0.3)); if (camW < 0.004) camW = 0; }
    },
    late(dt, t, { session }) {
      if (!riding) return;
      if (session.perched !== seatRec) session.perched = seatRec;
      session.perchHold = seatRec;
    },
    jump() { return false; },
    pawKind() { return riding ? 'none' : null; },
    canBoard() { return false; },
    groundSpot() {
      if (!riding) return null;
      const to = hopOffSpot(ride, R.DOCK_SPOTS); // a walk that ends on the water is saved on a dock
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
    if (riding) return { kind: 'off', line: phrase('crystal.wc.boat.off') };
    if (blocked(hookSession) || ride.dwell <= 0.05) return null; // only while it waits at a dock
    return dist(catPos, ride) <= R.BOAT.reach ? { kind: 'on', line: phrase('crystal.wc.boat.board') } : null;
  }

  const api = {
    get riding() { return riding; },
    get ride() { return ride; },
    hooks,
    install,
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
    credit() { return null; }, // wing C's partner events are the forge's and the pads' (later milestones)
    update(dt, t, catPos, cam, session) {
      const d = dt > 0 ? dt : 0;
      clock += d;
      camera = cam ?? camera;
      if (session) install(session);
      if (!ticked) ride = stepPath(ride, null, d, R.BOAT_SPEC, R.BOAT_PATH); // (the walk's hook did not run this frame: the boat still moves)
      ticked = false;
      place(clock);
      animate(clock);
      if (!sawFalls && catPos && Math.hypot(catPos.x - F.x, catPos.z - F.z) <= FALL_SIGHT) {
        sawFalls = true;
        try { ctx.progression?.recordSighting?.('ccfalls'); } catch { /* a stand-in save */ }
      }
    },
    dispose() {
      // a walk that ends while she rides: set her down on a dock, the walk's own fair back
      const s = hookSession;
      if (riding && s?.cat && ctxPlayer) getOut(s.cat, ctxPlayer, s, R.DOCK_SPOTS);
      if (s && installed) {
        if (s.perched === seatRec) { s.perched = null; s.perchHold = null; }
        if (s.fair && s.fair !== hookOrig) s.fair = hookOrig;
      }
      installed = false;
      for (const o of objs) {
        scene.remove(o);
        o.traverse?.((n) => { n.geometry?.dispose?.(); const m = n.material; if (m && m.map !== undefined) { /* the shared dot texture stays */ } m?.dispose?.(); });
      }
    },
  };
  return api;
}
