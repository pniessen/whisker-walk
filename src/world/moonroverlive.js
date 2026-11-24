// =============================================================================
// DOT ON A WALK (milestone 3). Made once a walk by world/moonlife.js. Dot waits at the Rover Depot; walk up and press Interact (E, the
// yellow button, X): "Hop in". She sits in the driver's seat (the walk's own sit pose: no new cat triangles) and the stick steers; Interact
// again, anywhere: "Hop out", onto free ground beside Dot. Two seats: a second cat takes the other one (the passenger's Interact honks).
//
// HOW IT HOOKS IN WITHOUT TOUCHING START-UP CODE. The walk gives an area life no player and no stick, and the Fairground's carried-seat
// model (src/fairlive.js) is the one the spec names. So on its first frame the life swaps the walk's `session.fair` (NO_FAIR everywhere but
// the Fairground) for a copy of it with four calls of its own: update (main.js calls it every frame after the player, with the player), late
// (after the cat is posed), jump (the paw button: a bounce while she rides) and pawKind (the paw badge). It puts the walk's `session.perched`
// on the seat record (pose 'requestPet': she sits; speedFactor 0: the player does not walk; `perchHold` every frame: a pushed stick does not
// take her off), reads the stick (player.inputDirection) and steers with world/moonrover.js, then carries the cat to the seat. The Moon
// restores the walk's own session.fair when the life is disposed. Nothing is added to the walk's code.
//
// THE STICK is the walk's own, turned by the camera as it is when she walks (a push up the screen drives up the screen). The camera is the
// walk's own too (zoom steps, L1/R1 and the drag still work), carried with her and eased a little further out and up while she drives,
// looking a little ahead of Dot. It never swings by itself: a camera that turns with the heading would turn the stick's meaning under her thumb.
//
// NEVER STUCK: the sim (moonrover.js) cannot leave her in a collider or out of the bounds, and "Hop out" is one press, anywhere, onto free
// ground. A rover that is parked is a small collider in the live list (a cat walks round her); while she drives, Dot is none.
//
// ROVER_FREE = false gives the Rover Tour (the same hop in, the stick does nothing, Dot drives the loop of lights by herself).
// CO-WALK: credit(ev) is how the second seat hears about the other cat ('rover-in' / 'rover-out' with a seat, 'rover-pose' with Dot's
// place while the other cat drives): validated, the wire event itself is the room milestone's (a Moon walk is solo until then).
// Draws no random number and reads no clock: every number is a constant here or a walk second.
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as P from './moonplan.js';
import { ROVER, ROVER_FREE, createRover, stepRover, dismountSpot, tourPoint, tourNearest } from './moonrover.js';
import { buildDot, DOT_SEATS } from './moonroverparts.js';
import { createMoonSound } from './moonsound.js';

export const SEAT_FRAME = Object.freeze({ camOut: 0.45, camUp: 0.55, camEase: 2.6, lead: 1.4 });
export const DUST = Object.freeze({ max: 60, low: 30, every: 0.07, ttl: 1.1, size: 0.42, color: 0x55535a });
export const BOUNCE = Object.freeze({ height: 0.45, secs: 0.5 });
export const HONK = Object.freeze({ lamp: 0.7 });
export const RING = Object.freeze({ near: 14, inner: 1.9, outer: 2.4 });
const TAU = Math.PI * 2;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const LOOK_Y = 0.54; // the cat's look height (cat/model.js CAT_LOOK_Y, near enough: the walk's camera has already looked once)

// createRoverLive(ctx) -> { update, promptAt, interact, credit, hooks..., state, dispose }
// ctx: { scene, ground, colliders, reducedMotion, tier, audio, progression, onDismount }
export function createRoverLive(ctx) {
  const { scene, reducedMotion = false } = ctx;
  const ground = ctx.ground ?? { y: P.moonY, flat: false };
  const colliders = ctx.colliders ?? P.MOON_COLLIDERS;
  const progression = ctx.progression ?? null;
  const free = ctx.free ?? ROVER_FREE; // (a test or a picture may ask for the Rover Tour)
  const sound = createMoonSound(ctx.audio ?? null);
  const lite = ctx.tier?.shadows === false;
  const low = !!ctx.tier && (ctx.tier.name === 'low' || (ctx.tier.rung ?? 0) >= 3);
  const dustMax = reducedMotion || lite ? 0 : low ? DUST.low : DUST.max;
  const env = { colliders, bounds: P.MOON_BOUNDS, ground };
  const gy = (x, z) => ground.y(x, z);

  // ---- Dot herself -------------------------------------------------------------------------------------------------------
  const dot = buildDot();
  const body = new THREE.Group(); // the whole of her: the walk's tilt and bounce go on this; the model inside faces the way the cat does (-z)
  body.name = 'moon:dot';
  const model = dot.group;
  model.rotation.y = Math.PI;
  body.rotation.order = 'YXZ';
  body.add(model);
  scene.add(body);
  const sim = createRover(P.DOT_PARK.x, P.DOT_PARK.z, P.DOT_PARK.yaw);
  const parkCollider = { x: sim.x, z: sim.z, r: P.DOT_PARKED_R, dot: true };
  const tilt = { pitch: 0, roll: 0 };
  const tiltWant = { pitch: 0, roll: 0 };
  let wheelSpin = 0;
  let lampFlash = -10;
  let bounceAt = -10;
  let clock = 0;

  // the hint ring round Dot while she waits: bright when it is near enough to hop in
  const ringGeo = new THREE.RingGeometry(RING.inner, RING.outer, 40).rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x7ff0dd, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true }));
  ring.name = 'moon:dotring';
  ring.visible = false;
  ring.renderOrder = 2;
  ring.frustumCulled = false;
  for (const m of [ring]) { m.castShadow = false; m.receiveShadow = false; m.userData.noMerge = true; m.userData.noCast = true; }
  scene.add(ring);

  // the dust: a pool of small grey blobs (one InstancedMesh, one draw), none on the lite rung or in reduced motion
  let puffs = null;
  const pool = [];
  if (dustMax > 0) {
    puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: DUST.color }), dustMax);
    puffs.name = 'moon:dotdust';
    puffs.castShadow = false;
    puffs.receiveShadow = false;
    puffs.frustumCulled = false;
    puffs.userData.noMerge = true;
    puffs.userData.noCast = true;
    puffs.userData.noContactShadow = true;
    for (let i = 0; i < dustMax; i++) pool.push({ age: DUST.ttl, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    scene.add(puffs);
  }
  const M4 = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const V = new THREE.Vector3();
  const S = new THREE.Vector3();
  let puffClock = 0;
  let puffNext = 0;
  let puffSide = 1;

  // ---- who is where ------------------------------------------------------------------------------------------------------
  let riding = null; // { seat } while she is on Dot
  let hookSession = null;
  let hookOrig = null;
  let installed = false;
  let wantMount = false;
  let wantOut = false;
  let camera = null;
  let camW = 0;
  let tourS = 0;
  let rode = false; // counted on the journal page this walk
  let told = false;
  let target = null;
  const occupant = [null, null]; // 'me' | 'friend' | null, by seat
  const seatRec = { x: 0, z: 0, y: DOT_SEATS[0].y, yaw: 0, pose: 'requestPet', moonRover: true, ride: false };
  const stickZero = { x: 0, z: 0 };
  const before = new THREE.Vector3();
  const off = new THREE.Vector3();
  const pos = { x: 0, z: 0 };

  function setParked(on) {
    const i = colliders.indexOf(parkCollider);
    if (on) {
      parkCollider.x = sim.x;
      parkCollider.z = sim.z;
      if (i < 0 && Object.isExtensible(colliders)) colliders.push(parkCollider); // (a test's frozen list has no room for her: she is then no collider)
    } else if (i >= 0) colliders.splice(i, 1);
  }
  setParked(true);

  // the seat's place in the world (Dot's frame turned by her heading)
  function seatWorld(seat, out) {
    const s = DOT_SEATS[seat];
    const c = Math.cos(sim.yaw);
    const n = Math.sin(sim.yaw);
    out.x = sim.x + s.x * c + s.z * n;
    out.z = sim.z - s.x * n + s.z * c;
    return out;
  }

  function placeDot() {
    const y = gy(sim.x, sim.z);
    const bounce = reducedMotion ? 0 : Math.max(0, BOUNCE.height * Math.sin(Math.PI * Math.min(1, (clock - bounceAt) / BOUNCE.secs))) * (clock - bounceAt < BOUNCE.secs ? 1 : 0);
    body.position.set(sim.x, y + bounce, sim.z);
    body.rotation.set(tilt.pitch, sim.yaw + Math.PI, tilt.roll);
    return bounce;
  }

  // ---- the walk's hooks (session.fair) -----------------------------------------------------------------------------------
  function seatCat(cat, player, session) {
    const seat = riding.seat;
    seatWorld(seat, pos);
    seatRec.x = pos.x;
    seatRec.z = pos.z;
    seatRec.y = DOT_SEATS[seat].y;
    seatRec.yaw = sim.yaw + Math.PI;
    session.perched = seatRec;
    session.perchHold = seatRec;
    player.perchY = seatRec.y;
    const bounce = placeDot();
    cat.position.set(pos.x, gy(sim.x, sim.z) + seatRec.y + bounce, pos.z);
    cat.rotation.y = sim.yaw + Math.PI;
    session.idleTime = 0;
  }

  function board(cat, player, session) {
    const seat = occupant[0] === 'friend' ? 1 : 0;
    riding = { seat };
    occupant[seat] = 'me';
    setParked(false);
    if (seat === 0 && !free) tourS = tourNearest(sim.x, sim.z);
    player.halt?.();
    session.perched = seatRec;
    seatCat(cat, player, session);
    sound.chirp();
    if (!rode) {
      rode = true;
      try { progression?.recordSighting?.('mnrover'); } catch { /* a stand-in save */ }
    }
    if (!told) { told = true; say('moon-rover-drive', phrase('moon.rover.drive')); }
  }

  function getOut(cat, player, session) {
    const seat = riding.seat;
    const to = dismountSpot(sim, env, null);
    occupant[seat] = null;
    riding = null;
    session.perched = null;
    session.perchHold = null;
    player.perchY = 0;
    cat.position.set(to.x, gy(to.x, to.z), to.z);
    cat.rotation.set(0, sim.yaw + Math.PI, 0);
    player.halt?.();
    if (seat === 0 || occupant[0] !== 'friend') { sim.speed = 0; }
    if (!occupant.includes('me') && !occupant.includes('friend')) setParked(true);
    sound.click();
    ctx.onDismount?.();
  }

  function drive(dt, t, cat, player, session) {
    const seat = riding.seat;
    const driver = seat === 0; // the cat in the other seat only sits (and honks)
    before.copy(cat.position);
    if (driver) {
      const active = !!player.inputActive;
      let ix = 0;
      let iz = 0;
      if (active) { const d = player.inputDirection(); ix = d.x; iz = d.z; }
      if (free) stepRover(sim, active ? { x: ix, z: iz } : stickZero, dt, env);
      else {
        tourS += ROVER.tourSpeed * dt;
        const p = tourPoint(tourS);
        sim.x = p.x; sim.z = p.z; sim.yaw = p.yaw; sim.speed = ROVER.tourSpeed; sim.touch = false;
      }
    }
    // the ground's lean: Dot tilts to the slope, eased
    if (ground.tilt) { ground.tilt(sim.x, sim.z, sim.yaw + Math.PI, tiltWant); } else { tiltWant.pitch = 0; tiltWant.roll = 0; }
    const k = 1 - Math.exp(-8 * dt);
    tilt.pitch += (tiltWant.pitch - tilt.pitch) * k;
    tilt.roll += (tiltWant.roll - tilt.roll) * k;
    seatCat(cat, player, session);
    // the camera: carried by however far she has just been moved, then a little further out
    if (camera) {
      off.copy(cat.position).sub(before);
      camera.position.add(off);
      camW += (1 - camW) * Math.min(1, dt * SEAT_FRAME.camEase);
      applyCamera(cat.position);
    }
  }

  function applyCamera(c) {
    if (!camera || !c) return;
    V.copy(camera.position).sub(c);
    const out = 1 + SEAT_FRAME.camOut * camW;
    camera.position.set(c.x + V.x * out, c.y + V.y * out + SEAT_FRAME.camUp * camW, c.z + V.z * out);
    const floor = gy(camera.position.x, camera.position.z) + 0.7;
    if (camera.position.y < floor) camera.position.y = floor;
    const lead = SEAT_FRAME.lead * camW * Math.min(1, sim.speed / ROVER.maxSpeed); // a little ahead of Dot at speed
    camera.lookAt(c.x + Math.sin(sim.yaw) * lead, c.y + LOOK_Y, c.z + Math.cos(sim.yaw) * lead);
  }

  const hooks = {
    update(dt, t, { cat, player, session }) {
      if (!installed) return;
      if (wantMount && !riding) { wantMount = false; board(cat, player, session); }
      if (wantOut && riding) { wantOut = false; getOut(cat, player, session); }
      wantMount = false;
      wantOut = false;
      if (riding) drive(dt, t, cat, player, session);
      else if (camW > 0) {
        camW = Math.max(0, camW - dt * SEAT_FRAME.camEase * (camW + 0.3));
        if (camW < 0.004) camW = 0;
      }
    },
    late(dt, t, { cat, session }) {
      if (!riding) return;
      if (session.perched !== seatRec) { session.perched = seatRec; }
      session.perchHold = seatRec;
      // she leans with Dot (after game/avatar.js has posed her)
      cat.rotation.order = 'YXZ';
      cat.rotation.x = tilt.pitch;
      cat.rotation.z = tilt.roll;
    },
    jump() {
      if (!riding) return false;
      bounceAt = clock; // the paw button: a small bounce, render only
      return true;
    },
    pawKind() { return riding ? 'none' : null; },
    canBoard() { return false; },
    groundSpot() { if (!riding) return null; const to = dismountSpot(sim, env, null); return { x: to.x, z: to.z }; },
    dispose() {},
  };

  function install(session) {
    if (installed || !session) return;
    hookSession = session;
    hookOrig = session.fair;
    session.fair = { ...(hookOrig ?? {}), ...hooks, riding: null };
    installed = true;
  }

  const offCall = bus.on('tip:did', (e) => {
    if (!e || e.id !== 'call' || !riding) return;
    honk();
  });
  function honk() {
    lampFlash = clock;
    sound.honk();
  }

  // ---- the prompts -------------------------------------------------------------------------------------------------------
  function decide(catPos) {
    if (!catPos) return null;
    if (riding) {
      if (riding.seat === 1 && occupant[0] === 'friend') return { kind: 'honk', line: phrase('moon.rover.honk') };
      return { kind: 'out', line: phrase('moon.rover.out') };
    }
    if (occupant.includes('me')) return null;
    if (dist(catPos, sim) < P.DOT_REACH && Math.abs(catPos.y - gy(sim.x, sim.z)) < 1.2 && !hookSession?.perched) return { kind: 'in', line: phrase('moon.rover.prompt') };
    return null;
  }

  // ---- the puffs ---------------------------------------------------------------------------------------------------------
  function dust(dt) {
    if (!puffs) return;
    puffClock += dt;
    if (riding && sim.speed > 1.5 && puffClock >= puffNext) {
      puffNext = puffClock + DUST.every;
      puffSide = -puffSide;
      const slot = pool.reduce((best, p, i) => (p.age > pool[best].age ? i : best), 0);
      const p = pool[slot];
      const c = Math.cos(sim.yaw);
      const n = Math.sin(sim.yaw);
      const lx = 0.92 * puffSide;
      const lz = -1.0;
      p.age = 0;
      p.x = sim.x + lx * c + lz * n;
      p.z = sim.z - lx * n + lz * c;
      p.y = gy(p.x, p.z) + 0.15;
      p.vx = -Math.sin(sim.yaw) * sim.speed * 0.12 + puffSide * c * 0.25;
      p.vz = -Math.cos(sim.yaw) * sim.speed * 0.12 - puffSide * n * 0.25;
      p.vy = 0.35;
    }
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      p.age += dt;
      const u = p.age / DUST.ttl;
      if (u >= 1) { S.set(0, 0, 0); } else {
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.vy *= 0.96; p.vx *= 0.97; p.vz *= 0.97;
        const sz = DUST.size * (0.35 + 0.65 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5)) * (1 - smooth((u - 0.55) / 0.45));
        S.set(sz, sz * 0.7, sz);
      }
      V.set(p.x, p.y, p.z);
      M4.compose(V, Q, S);
      puffs.setMatrixAt(i, M4);
    }
    puffs.instanceMatrix.needsUpdate = true;
  }

  // ---- other cats (credit) -----------------------------------------------------------------------------------------------
  function credit(ev) {
    if (!ev || typeof ev !== 'object' || typeof ev.kind !== 'string') return null;
    const seat = ev.seat === 0 || ev.seat === 1 ? ev.seat : -1;
    if (ev.kind === 'rover-in' && seat >= 0) {
      if (occupant[seat] === 'me') return null; // she is in it: the other cat takes the other seat on its own device
      occupant[seat] = 'friend';
      setParked(false);
      return 'in';
    }
    if (ev.kind === 'rover-out' && seat >= 0) {
      if (occupant[seat] !== 'friend') return null;
      occupant[seat] = null;
      if (!occupant.includes('me') && !occupant.includes('friend')) { sim.speed = 0; setParked(true); }
      return 'out';
    }
    if (ev.kind === 'rover-pose' && occupant[0] === 'friend') {
      const B = P.MOON_BOUNDS;
      if (!fin(ev.x) || !fin(ev.z) || !fin(ev.yaw)) return null;
      if (ev.x < B.minX - 2 || ev.x > B.maxX + 2 || ev.z < B.minZ - 2 || ev.z > B.maxZ + 2) return null;
      if (Math.hypot(ev.x - sim.x, ev.z - sim.z) > 40) return null; // a jump that long is not a drive: ignored
      sim.x = ev.x; sim.z = ev.z; sim.yaw = wrap(ev.yaw);
      sim.speed = fin(ev.speed) ? Math.max(0, Math.min(ROVER.maxSpeed * 1.2, ev.speed)) : 0;
      return 'pose';
    }
    return null;
  }

  placeDot();

  return {
    group: body,
    ring,
    dot,
    sim,
    get riding() { return !!riding; },
    get seat() { return riding ? riding.seat : -1; },
    get state() { return { riding: !!riding, seat: riding ? riding.seat : -1, x: sim.x, z: sim.z, yaw: sim.yaw, speed: sim.speed, grade: sim.grade, camW, occupant: occupant.slice(), parked: colliders.includes(parkCollider), tourS, lamp: clock - lampFlash < HONK.lamp }; },
    hooks,
    install,
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target) return null;
      const t = target;
      target = null;
      if (t.kind === 'in') wantMount = true;
      else if (t.kind === 'out') wantOut = true;
      else if (t.kind === 'honk') honk();
      return t.kind;
    },
    credit,
    // the area life's own frame (before the player-aware hook runs): the walk's session, the camera, Dot's look
    update(dt, t, catPos, cam, session) {
      const step = dt > 0 ? dt : 0;
      clock += step;
      camera = cam ?? camera;
      if (session) install(session);
      // a friend driving: Dot is where they are
      if (!riding && occupant[0] === 'friend') { tilt.pitch = 0; tilt.roll = 0; }
      if (!riding) { if (sim.speed > 0 && !occupant.includes('friend')) sim.speed = 0; }
      // the wheels turn as she rolls; the lamp is dim, bright on a honk or when she is driving at dusk (it is always dusk)
      wheelSpin += (sim.speed / 0.36) * step;
      for (const a of dot.axles) a.rotation.x = wheelSpin;
      const flash = clock - lampFlash < HONK.lamp ? 1 : 0;
      const on = riding || flash || (hookSession && occupant.includes('friend')) ? 1 : 0;
      dot.lamp.material.color.setScalar(0.5 + 0.5 * on + 0.35 * flash);
      placeDot();
      // the hint ring: round her while she waits, bright and slow when a press would hop her in
      if (!riding && !occupant.includes('friend') && catPos) {
        const d = dist(catPos, sim);
        const near = Math.max(0, 1 - Math.max(0, d - P.DOT_REACH) / (RING.near - P.DOT_REACH));
        const inReach = d < P.DOT_REACH ? 1 : 0;
        ring.visible = near > 0.01;
        ring.position.set(sim.x, gy(sim.x, sim.z) + 0.1, sim.z);
        const pulse = reducedMotion ? 1 : 0.82 + 0.18 * Math.sin(t * (inReach ? 5 : 2.5));
        ring.material.opacity = (0.25 + 0.5 * inReach) * near * pulse;
        ring.scale.setScalar(reducedMotion ? 1 : 1 + (inReach ? 0.1 : 0.04) * Math.sin(t * 3));
      } else ring.visible = false;
      dust(step);
    },
    dispose() {
      offCall?.();
      sound.dispose();
      setParked(false);
      if (hookSession && hookSession.fair && installed) {
        if (hookSession.perched === seatRec) { hookSession.perched = null; hookSession.perchHold = null; }
        hookSession.fair = hookOrig;
      }
      if (hookSession?.cat?.rotation && riding) { hookSession.cat.rotation.x = 0; hookSession.cat.rotation.z = 0; }
      installed = false;
      for (const o of [body, ring, ...(puffs ? [puffs] : [])]) {
        scene.remove(o);
        o.traverse?.((m) => { m.geometry?.dispose?.(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => mm.dispose?.()); });
      }
      puffs?.dispose?.();
    },
  };
}
