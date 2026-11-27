// =============================================================================
// THE REEF, THE TWO MOUNTS ON A WALK (milestone R12). The Sea Scooter and the yellow Diving Saucer wait on their racks beside the Sunken Boat. Walk up and press
// the action button: "Hop on". She sits on the mount (the walk's sit pose, swimming: no new cat triangles) and the stick steers it with world/reefride.js (R11,
// the pure sim); the kick button rises (let go and it settles to its own cruising height); the action button again, anywhere, is "Hop off", onto free ground
// beside it. Nothing here reads or writes the save but one journal count (the first ride of a walk on each mount, as a seal's page counts a sighting).
//
// HOW IT HOOKS IN (the Moon's way, moonroverlive.js): the walk gives an area life no player and no stick, so on its first frame the life swaps the walk's
// `session.fair` (NO_FAIR in the Reef) for a copy with its own update (after the player), late (after the cat is posed), jump, pawKind and groundSpot, puts the
// walk's `session.perched` on the seat record (pose 'requestPet', speedFactor 0 by the perch, `perchHold` every frame so a pushed stick does not take her off,
// `swim: true` so game/avatar.js draws the swim pose), sets the player's perchY to the seat's height (which also turns the Reef's float off: player.js), and
// carries the camera in the late step. The air gauge is paused while she rides (reefair.stepAir's `paused`, through setPaused): the bubbles do not drain.
//
// NEVER STUCK: the sim cannot leave a mount in a collider, a keepOut rectangle (the Sealab's footprint, the galleon's) or out of the bounds, and "Hop off" is one
// press, anywhere, onto free ground (dismountSpot). A walk that ends while she rides sets her down the same way (dispose, and groundSpot for the saved walk).
// Parked, each mount is a small collider in the live list (a cat walks round it); while she rides it, it is none.
// CO-WALK: the seat field of the walk's state carries `session.fair.riding = { id: 'reef-scooter' | 'reef-saucer' }` (src/remotecats.js liftForState): a partner
// sees her lifted to the mount's height and moving as a swimmer does; the Reef has no seatById, so the mount is not drawn on the partner's side (later).
// Reduced motion: the propeller, the bob and the bubble trail are still. The lower rungs draw no bubble trail. Draws no random number and reads no clock.
// =============================================================================

import { phrase } from '../clanphrases.js';
import { RIDES, RIDE, createRide, stepRide, dismountSpot } from './reefride.js';
import { RACKS, RACK_IDS, REST, rideKeepOut } from './reefrideplan.js';
import './reefridewords.js';

export const SEAT_FRAME = Object.freeze({ camOut: 0.4, camUp: 0.45, camEase: 2.4, lead: 1.2 });
export const TRAIL = Object.freeze({ max: 16, low: 8, every: 0.1, ttl: 1.2, size: 0.16 });
const LOOK_Y = 0.54;

// createRideLive(ctx) -> { promptAt, interact, update, hooks, install, state, dispose }
// ctx: { THREE, scene, reefY, ground, colliders (the walk's live list), keepOut (extra rectangles), player, reducedMotion, tier, say, setPaused, progression, busy (true while a warm bubble lifts her), bounds }
export function createRideLive(ctx) {
  const { THREE, scene, reefY, reducedMotion = false, player: ctxPlayer = null } = ctx;
  const ground = ctx.ground;
  const colliders = ctx.colliders ?? [];
  const lowTier = !!ctx.tier && (ctx.tier.name === 'low' || (ctx.tier.rung ?? 0) >= 3);
  const lite = ctx.tier?.shadows === false;
  const trailMax = reducedMotion || lite ? 0 : lowTier ? TRAIL.low : TRAIL.max;
  const env = { colliders, keepOut: rideKeepOut(ctx.keepOut ?? []), bounds: ctx.bounds, ground, groundY: reefY };
  const get = (n) => scene.getObjectByName(n) ?? null;
  const bodies = {};
  const prop = get('ride:scooter:prop');
  const legs = get('ride:saucer:legs'); // the saucer's landing gear: telescoped up into the hull while she rides, down when it is parked
  let gear = 1; // 1 down, 0 folded: a short smooth motion (about a third of a second each way), kept under reduced motion too (it is a change of state, not a decoration)
  const sims = {};
  const parkCol = {};
  for (const id of RACK_IDS) {
    const r = RACKS[id];
    bodies[id] = get(`ride:${id}`);
    sims[id] = createRide(id, r.x, r.z, r.yaw, reefY(r.x, r.z));
    sims[id].y = reefY(r.x, r.z) + REST[id];
    parkCol[id] = { x: r.x, z: r.z, r: r.park, ride: id };
  }
  const setParked = (id, on) => {
    const i = colliders.indexOf(parkCol[id]);
    if (on) {
      parkCol[id].x = sims[id].x;
      parkCol[id].z = sims[id].z;
      if (i < 0 && Object.isExtensible(colliders)) colliders.push(parkCol[id]);
    } else if (i >= 0) colliders.splice(i, 1);
  };
  for (const id of RACK_IDS) setParked(id, true);

  // the bubble trail: a few tiny pale blobs (small meshes sharing one geometry and one material; none on the lite rung or under reduced motion)
  const pool = [];
  if (trailMax > 0) {
    const geo = new THREE.SphereGeometry(0.5, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfefff });
    for (let i = 0; i < trailMax; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.name = 'ride:bubble';
      m.visible = false;
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.userData.noMerge = true;
      m.userData.noCast = true;
      m.userData.noContactShadow = true;
      scene.add(m);
      pool.push({ age: TRAIL.ttl, mesh: m });
    }
  }
  let puffClock = 0;
  let puffNext = 0;

  let riding = null; // { id } while she is on a mount
  let hookSession = null;
  let hookOrig = null;
  let installed = false;
  let want = null; // what the action button would do now: { kind: 'on' | 'off', id }
  let wantOn = null;
  let wantOff = false;
  let camera = null;
  let camW = 0;
  let clock = 0;
  const told = {}; // the soft first line and the journal count, once a walk per mount
  const seatRec = { x: 0, z: 0, y: 0.9, yaw: 0, pose: 'requestPet', swim: true, reefRide: true, ride: false };
  const stickZero = { x: 0, z: 0, lift: 0 };
  const stick = { x: 0, z: 0, lift: 0 };
  const before = { x: 0, y: 0, z: 0 };
  const pos = { x: 0, z: 0 };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const gy = (x, z) => reefY(x, z);
  function seatWorld(sim, out) {
    const s = RIDES[sim.kind].seatsAt[0];
    const c = Math.cos(sim.yaw);
    const n = Math.sin(sim.yaw);
    out.x = sim.x + s.x * c + s.z * n;
    out.z = sim.z - s.x * n + s.z * c;
    return out;
  }

  function placeMounts(dt, t) {
    for (const id of RACK_IDS) {
      const sim = sims[id];
      const g = bodies[id];
      if (!riding || riding.id !== id) {
        // parked: eases down to its resting height over the seabed there
        const want = gy(sim.x, sim.z) + REST[id];
        const k = reducedMotion ? 1 : Math.min(1, dt * 3);
        sim.y += (want - sim.y) * k;
        sim.speed = 0;
      }
      if (!g) continue;
      const bob = !reducedMotion && riding?.id === id ? 0.04 * Math.sin(t * 2.2) : 0;
      g.position.set(sim.x, sim.y + bob, sim.z);
      g.rotation.y = sim.yaw;
    }
    gear += ((riding?.id === 'saucer' ? 0 : 1) - gear) * Math.min(1, Math.max(0, dt) * 5);
    if (Math.abs(gear - (riding?.id === 'saucer' ? 0 : 1)) < 0.002) gear = riding?.id === 'saucer' ? 0 : 1;
    if (legs) legs.scale.y = 0.02 + 0.98 * gear * gear * (3 - 2 * gear);
    if (prop && !reducedMotion) prop.rotation.z += (riding?.id === 'scooter' ? 9 + sims.scooter.speed * 3 : 0.6) * dt;
  }

  // ---- the walk's hooks (session.fair) ---------------------------------------------------------------------------------------
  function seatCat(cat, player, session) {
    const sim = sims[riding.id];
    const seat = RIDES[riding.id].seatsAt[0];
    seatWorld(sim, pos);
    const y = sim.y + seat.y;
    seatRec.x = pos.x;
    seatRec.z = pos.z;
    seatRec.y = Math.max(0.05, y - gy(pos.x, pos.z)); // never 0: perchY 0 would turn the float and the collider push back on
    seatRec.yaw = sim.yaw + Math.PI;
    session.perched = seatRec;
    session.perchHold = seatRec;
    player.perchY = seatRec.y;
    cat.position.set(pos.x, gy(pos.x, pos.z) + seatRec.y, pos.z);
    cat.rotation.y = sim.yaw + Math.PI;
    session.idleTime = 0;
  }

  function blocked(session) {
    if (session?.perched) return true;
    if (ctx.busy?.()) return true; // a warm bubble is carrying her (it ends by itself)
    if ((ctxPlayer?.floatY ?? 0) > 1.6) return true; // she climbs on from the sand, not from high over it
    return false;
  }

  function board(id, cat, player, session) {
    const sim = sims[id];
    riding = { id };
    setParked(id, false);
    sim.speed = 0;
    sim.hold = RIDES[id].seatY;
    player.halt?.();
    player.clearFloat?.();
    session.perched = seatRec;
    if (session.fair) session.fair.riding = { id: RACKS[id].seatId, rideId: 'reef' };
    ctx.setPaused?.(true); // the gauge stands still while she rides
    seatCat(cat, player, session);
    if (!told[id]) {
      told[id] = true;
      try { ctx.progression?.recordSighting?.(RACKS[id].page); } catch { /* a stand-in save */ }
      ctx.say?.(id === 'saucer' ? phrase('reef.ride.tip.saucer') : phrase('reef.ride.tip.scooter'));
    }
  }

  function getOut(cat, player, session) {
    const id = riding.id;
    const sim = sims[id];
    const to = dismountSpot(sim, env, null);
    riding = null;
    sim.speed = 0;
    session.perched = null;
    session.perchHold = null;
    if (session.fair) session.fair.riding = null;
    player.perchY = 0;
    cat.position.set(to.x, gy(to.x, to.z), to.z);
    cat.rotation.set(0, sim.yaw + Math.PI, 0);
    player.halt?.();
    player.clearFloat?.();
    ctx.setPaused?.(false);
    setParked(id, true);
  }

  function drive(dt, cat, player, session) {
    const id = riding.id;
    const sim = sims[id];
    before.x = cat.position.x; before.y = cat.position.y; before.z = cat.position.z;
    const active = !!player.inputActive;
    let ix = 0;
    let iz = 0;
    if (active) { const d = player.inputDirection(); ix = d.x; iz = d.z; }
    stick.x = ix;
    stick.z = iz;
    // kick rises; let go and it settles to its own cruising height (the sim never takes it lower than the seabed's clearance)
    stick.lift = player.kickHeld ? 1 : sim.hold > RIDES[id].seatY + 0.05 ? -0.7 : 0;
    stepRide(sim, active || stick.lift ? stick : stickZero, dt, env);
    seatCat(cat, player, session);
    if (camera) {
      camera.position.set(camera.position.x + cat.position.x - before.x, camera.position.y + cat.position.y - before.y, camera.position.z + cat.position.z - before.z);
      camW += (1 - camW) * Math.min(1, dt * SEAT_FRAME.camEase);
      applyCamera(cat.position, sim);
    }
  }

  function applyCamera(c, sim) {
    if (!camera || !c) return;
    const vx = camera.position.x - c.x;
    const vy = camera.position.y - c.y;
    const vz = camera.position.z - c.z;
    const out = 1 + SEAT_FRAME.camOut * camW;
    camera.position.set(c.x + vx * out, c.y + vy * out + SEAT_FRAME.camUp * camW, c.z + vz * out);
    const floor = gy(camera.position.x, camera.position.z) + 0.7;
    if (camera.position.y < floor) camera.position.y = floor;
    const lead = SEAT_FRAME.lead * camW * Math.min(1, sim.speed / RIDES[sim.kind].maxSpeed);
    camera.lookAt(c.x + Math.sin(sim.yaw) * lead, c.y + LOOK_Y, c.z + Math.cos(sim.yaw) * lead);
  }

  const hooks = {
    update(dt, t, { cat, player, session }) {
      if (!installed) return;
      if (wantOn && !riding) { const id = wantOn; wantOn = null; if (!blocked(session)) board(id, cat, player, session); }
      if (wantOff && riding) { wantOff = false; getOut(cat, player, session); }
      wantOn = null;
      wantOff = false;
      if (riding) drive(dt, cat, player, session);
      else if (camW > 0) {
        camW = Math.max(0, camW - dt * SEAT_FRAME.camEase * (camW + 0.3));
        if (camW < 0.004) camW = 0;
      }
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
      const to = dismountSpot(sims[riding.id], env, null);
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

  function trail(dt) {
    if (!pool.length) return;
    puffClock += dt;
    const sim = riding ? sims[riding.id] : null;
    if (sim && sim.speed > 1.2 && puffClock >= puffNext) {
      puffNext = puffClock + TRAIL.every;
      const slot = pool.reduce((best, p, i) => (p.age > pool[best].age ? i : best), 0);
      const p = pool[slot];
      const back = riding.id === 'saucer' ? 1.5 : 1.0;
      p.age = 0;
      p.mesh.position.set(sim.x - Math.sin(sim.yaw) * back, sim.y - 0.1, sim.z - Math.cos(sim.yaw) * back);
    }
    for (const p of pool) {
      p.age += dt;
      const u = p.age / TRAIL.ttl;
      p.mesh.visible = u < 1;
      if (u < 1) {
        p.mesh.position.y += 0.5 * dt;
        p.mesh.scale.setScalar(TRAIL.size * (1 - u * 0.6) * (0.4 + 0.6 * Math.min(1, u * 6)));
      }
    }
  }

  function decide(catPos) {
    if (!catPos) return null;
    if (riding) return { kind: 'off', line: phrase('reef.ride.off') };
    if (blocked(hookSession)) return null;
    let best = null;
    let bestD = Infinity;
    for (const id of RACK_IDS) {
      const d = dist(catPos, sims[id]);
      if (d < RACKS[id].reach && d < bestD) { best = id; bestD = d; }
    }
    return best ? { kind: 'on', id: best, line: best === 'saucer' ? phrase('reef.ride.saucer') : phrase('reef.ride.scooter') } : null;
  }

  const api = {
    sims,
    get riding() { return !!riding; },
    get ridingId() { return riding ? riding.id : null; },
    get state() { return { riding: riding ? riding.id : null, camW, x: riding ? sims[riding.id].x : 0, z: riding ? sims[riding.id].z : 0, speed: riding ? sims[riding.id].speed : 0 }; },
    hooks,
    install,
    promptAt(catPos) {
      want = decide(catPos);
      return want ? want.line : null;
    },
    interact() {
      const w = want;
      want = null;
      if (!w) return null;
      if (w.kind === 'on') wantOn = w.id;
      else wantOff = true;
      return w.kind;
    },
    update(dt, t, catPos, cam, session) {
      const step = dt > 0 ? dt : 0;
      clock += step;
      camera = cam ?? camera;
      if (session) install(session);
      placeMounts(step, clock);
      trail(step);
    },
    dispose() {
      // a walk that ends while she rides: set her down on free ground, the gauge running again, the walk's own fair back
      const s = hookSession;
      if (riding && s?.cat && ctxPlayer) getOut(s.cat, ctxPlayer, s);
      for (const id of RACK_IDS) setParked(id, false);
      if (s && installed) {
        if (s.perched === seatRec) { s.perched = null; s.perchHold = null; }
        if (s.fair && s.fair !== hookOrig) s.fair = hookOrig;
      }
      installed = false;
      for (const p of pool) scene.remove(p.mesh);
      if (pool.length) { pool[0].mesh.geometry.dispose(); pool[0].mesh.material.dispose(); }
    },
  };
  return api;
}
