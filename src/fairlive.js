// =============================================================================
// The Fairground's rides in the walk: the simulation (src/fairsim.js) drawn
// on the models world/fair.js built, and the cat's ride on them.
//
// game/walk.js builds one for a Fairground walk (session.fair; every other
// place has NO_FAIR). main.js calls update() once a frame after the player
// has moved, and late() after the cat has been posed. game/interactions.js
// asks jump() first whenever the jump button is pressed.
//
// THE CLOCK is the time of day (seconds; `now`, which a test or a picture
// replaces). The rides are a pure function of it (fairsim.js), so they run
// whether anyone is on them or not, they are where they should be after a
// pause, and two devices in the same walk see the same horse at the same
// place with nothing sent between them. Nothing here uses the network.
//
// THE RIDE. A seat is a perch record that fairsim.js moves. Getting on is
// jump() (the jump key, or the paw button on touch): it puts the session's
// `perched` on the seat, exactly as game/interactions.js does for a roof.
// From then on update() carries her. Getting off is what it is for any
// perch: jump again, or push the stick (game/avatar.js clears `perched`);
// late() sees that the same frame and brings her down to free ground beside
// the ride (fairsim.js dismountSpot) in a short hop, never a drop.
//
// THE COST. Moving a ride is setting the rotation of Groups that step 1 built
// to turn; nothing is added to the scene, no draw call, and update() and
// late() allocate nothing. The bulbs' chase and the bunting's flutter are
// five shared shader numbers (world/fairkit.js setFairClock), set here.
// =============================================================================
import * as THREE from 'three';
import { createFairSim, RIDE } from './fairsim.js';
import { waterClearance } from './world/builder.js';
import { CAT_LOOK_Y } from './cat/model.js';
import { FLAT_GROUND } from './ground.js';
import { setFairClock } from './world/fairkit.js';

export { NO_FAIR } from './fairnone.js';

// The time of day in seconds, to the sub-millisecond (Date.now() alone steps
// in whole milliseconds, which shows as a shimmer on a fast ride).
export function wallClock() {
  const p = globalThis.performance;
  return p && Number.isFinite(p.timeOrigin) ? (p.timeOrigin + p.now()) / 1000 : Date.now() / 1000;
}

// poseRides(rides, sim): the models, where the simulation says they are.
// Only ever sets the position or rotation of the Groups step 1 built to move.
export function poseRides(rides, sim) {
  const A = sim.angles;
  const m = rides.merryGoRound;
  m.turn.rotation.y = A.mgr;
  for (let i = 0; i < m.horses.length; i++) m.horses[i].position.y = sim.mgr.deckY + A.mgrBob[i];
  m.musicBoxDrum.rotation.x = A.mgrDrum;
  // the wheel turns about its hub; each gondola turns back by as much, and so hangs upright
  const w = rides.wheel;
  w.turn.rotation.z = A.wheel;
  for (let i = 0; i < w.gondolas.length; i++) w.gondolas[i].rotation.z = -A.wheel;
  // the teacups' floor turns one way, each cup on it the other
  const c = rides.teacups;
  c.turn.rotation.y = A.cups;
  for (let i = 0; i < c.cups.length; i++) c.cups[i].rotation.y = sim.cups.list[i].spin0 + A.cupSpin;
  // the caterpillar: each car on the rails where the train is, nose along the track
  const t = rides.coaster;
  for (let i = 0; i < t.cars.length; i++) {
    const s = sim.coaster.cars[i];
    t.cars[i].position.set(s.px, s.py, s.pz);
    t.cars[i].rotation.set(-s.pitch, Math.atan2(s.tx, s.tz), 0, 'YXZ');
  }
}

// How long the hop down from a seat `h` metres up takes: quick from a horse,
// under a second from the top of the big wheel.
export const hopDownTime = (h) => Math.min(0.9, 0.28 + 0.05 * Math.max(0, h));

// The music box's tune: a little waltz, one note every NOTE seconds, 0 a rest.
// Frequencies in Hz (C major, up an octave: a music box is small and bright).
export const TUNE = Object.freeze({
  NOTE: 0.26,
  HEAR: 17, // metres from the merry-go-round at which it can no longer be heard
  notes: Object.freeze([
    1047, 0, 1319, 1568, 0, 1319, 1175, 0, 1397, 1760, 0, 1397,
    1319, 0, 1568, 2093, 0, 1568, 1760, 1568, 1397, 1319, 1175, 0,
    1047, 0, 1319, 1568, 0, 1319, 1175, 0, 1397, 1760, 0, 1397,
    1568, 1760, 1568, 1397, 1319, 1175, 1047, 0, 1568, 1047, 0, 0,
  ]),
});

// The big wheel's camera (cameraFor below). In front of the wheel while her
// gondola is below LOW, behind and above it over HIGH, and round the outside
// of the wheel in between (ROUND metres further out at the middle of the way).
export const WHEEL_CAM = Object.freeze({
  LOW: 0.75, HIGH: 10.0,
  FRONT_X: 2.2, FRONT_UP: 2.0, FRONT_Z: 3.8,
  BACK_X: 2.6, BACK_UP: 2.5, BACK_Z: -6.2,
  ROUND: 1.8,
  SIDE_FROM: 0.4, SIDE_OVER: 5.6, // west of the hub by this much and more, the camera is on the west side
});
const smooth01 = (v) => { const k = Math.min(1, Math.max(0, v)); return k * k * (3 - 2 * k); };

// The camera while she rides, by ride: how it is placed is cameraFor below.
const EARS_BACK = 0.8; // radians: an ear laid back (the animator's upright ear is 0.22)
const CAM_EASE = 2.6; // 1/seconds: how fast the ride's camera takes over, and lets go

// createFairLive(scene, area, opts) → the Fairground's rides for one walk.
//   area               world/fair.js's record (rides, anchors, colliders, bounds, waters)
//   opts.camera        the game's camera (the rides place it while she is on one)
//   opts.reducedMotion no wobble after the teacups
//   opts.ground        the walk's ground (src/ground.js); the Fairground's is flat
//   opts.now()         the clock, in seconds
//   opts.onEvent(e)    { type: 'ride', ride } the first frame on a ride's seat, { type: 'hop' },
//                      { type: 'dismount' } when she is down, { type: 'note', freq, volume } the tune,
//                      { type: 'lookout' } onto the lookout at the top of the big wheel,
//                      { type: 'slide' } off down the helter-skelter, { type: 'slide-end' } onto its mat
export function createFairLive(scene, area, { camera = null, reducedMotion = false, now = wallClock, onEvent = () => {}, ground = FLAT_GROUND } = {}) {
  const sim = createFairSim(area);
  const rides = area.rides;
  const musicBox = rides.merryGoRound.musicBoxDrum.parent.position; // the music box stands behind the merry-go-round
  const env = {
    colliders: area.colliders,
    bounds: area.bounds,
    wet: (x, z, margin) => waterClearance(area.waters, x, z) < margin,
  };

  let riding = null;   // the seat she is on
  let lastSeat = null; // the seat she last hopped from
  let rodeRide = null; // the ride whose 'ride' event has been raised for this go
  // the hop down: from (x0, z0) at height h0 to (x1, z1) on the ground
  const hop = { on: false, u: 0, dur: 0.3, x0: 0, z0: 0, x1: 0, z1: 0, h0: 0 };
  let wobble = 0;
  let noteAt = -1;

  // the ride's camera: w is how much of it is in the picture (0: the game's own)
  let camW = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const look = new THREE.Vector3();
  const before = new THREE.Vector3();
  const off = new THREE.Vector3();
  const push = { x: 0, z: 0 };
  // which side of a ride the camera was on when she got on (a unit vector on the ground)
  const board = { x: 0, z: 1 };
  function noteBoardSide(cx, cz) {
    const dx = camera ? camera.position.x - cx : 0;
    const dz = camera ? camera.position.z - cz : 1;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) { board.x = dx / d; board.z = dz / d; } else { board.x = 0; board.z = 1; }
  }
  const paws = { x: 0, y: 0, z: 0 };

  // A seat's height, and the hop's, are metres above the ground under them.
  const gy = (x, z) => (ground.flat ? 0 : ground.y(x, z));
  const catAt = (cat, player) => { paws.x = cat.position.x; paws.z = cat.position.z; paws.y = player.perchY ?? 0; return paws; };

  // Where the ride's own camera would be for `seat`, into camPos / camLook.
  // Returns how much of it to use (0: the game's follow camera, carried).
  function cameraFor(seat, cat, dt) {
    if (seat.rideId === 'mgr') {
      // From outside the ride, level with the horses and in line with her: she
      // is always on the near side, under the canopy's rim, and the camera is
      // never inside the ride. It goes round with her, as slowly as she does.
      const dx = seat.x - sim.mgr.cx;
      const dz = seat.z - sim.mgr.cz;
      const d = Math.hypot(dx, dz) || 1;
      const out = sim.mgr.baseR + 3.8;
      // ...and it lifts as it passes behind the music box, to look over its pipes
      const toBox = Math.atan2(musicBox.x - sim.mgr.cx, musicBox.z - sim.mgr.cz) - Math.atan2(dx, dz);
      const near = Math.abs(Math.atan2(Math.sin(toBox), Math.cos(toBox))) / 0.7;
      const lift = near < 1 ? (1 - near * near) ** 2 : 0;
      camPos.set(sim.mgr.cx + (dx / d) * out, 2.3 + lift, sim.mgr.cz + (dz / d) * out);
      camLook.set(cat.position.x, cat.position.y + CAT_LOOK_Y, cat.position.z);
      return 1;
    }
    if (seat.rideId === 'wheel') {
      // Up in the air: behind her and above, a little to one side (clear of
      // the lookout's mast): over her shoulder, the fair falls away below.
      // Down at the bottom that spot is behind the wheel's rear frame and the
      // mast, so there the camera is in FRONT of the wheel, on the plaza
      // side, close, looking in at her over the boarding deck. Between the
      // two it goes round the OUTSIDE of the wheel (never through it), on
      // whichever side she is: up the east side, down the west.
      const up = smooth01((seat.y - WHEEL_CAM.LOW) / (WHEEL_CAM.HIGH - WHEEL_CAM.LOW));
      const side = 1 - 2 * smooth01((sim.wheel.cx - seat.x - WHEEL_CAM.SIDE_FROM) / WHEEL_CAM.SIDE_OVER);
      const out = WHEEL_CAM.FRONT_X + (WHEEL_CAM.BACK_X - WHEEL_CAM.FRONT_X) * up + WHEEL_CAM.ROUND * Math.sin(Math.PI * up);
      camPos.set(
        seat.x + side * out,
        seat.y + WHEEL_CAM.FRONT_UP + (WHEEL_CAM.BACK_UP - WHEEL_CAM.FRONT_UP) * up,
        seat.z + WHEEL_CAM.FRONT_Z + (WHEEL_CAM.BACK_Z - WHEEL_CAM.FRONT_Z) * up,
      );
      camLook.set(seat.x - 0.3 * side * up, seat.y + CAT_LOOK_Y - 0.2 * up, seat.z + 1.5 * up);
      return 1;
    }
    if (seat.rideId === 'cups') {
      // Still, outside the ride and above it, where the camera already was
      // when she hopped in: the floor turns in front of it. It looks at the
      // middle of the ride and only leans towards her cup, so the picture
      // neither spins with the cup nor swings round with the floor.
      camPos.set(sim.cups.cx + board.x * 8.8, 5.0, sim.cups.cz + board.z * 8.8);
      camLook.set(sim.cups.cx + (seat.x - sim.cups.cx) * 0.28, 0.9, sim.cups.cz + (seat.z - sim.cups.cz) * 0.28);
      return 1;
    }
    if (seat.seatKind === 'car') {
      // behind the train and above it, eased (fairsim.js chase)
      const c = sim.chase(seat, dt);
      camPos.set(c.x, c.y, c.z);
      camLook.set(c.lx, c.ly, c.lz);
      return 1;
    }
    if (seat.seatKind === 'chute') {
      // Still and well back, on the side the camera already was, coming down
      // as she comes down: she goes round the tower in the picture; the
      // picture does not go round with her.
      camPos.set(sim.slide.cx + board.x * 9, seat.y + 2.8, sim.slide.cz + board.z * 9);
      camLook.set(sim.slide.cx + (seat.x - sim.slide.cx) * 0.5, seat.y + 0.6, sim.slide.cz + (seat.z - sim.slide.cz) * 0.5);
      return 1;
    }
    return 0;
  }

  function seatCat(seat, cat, player, session) {
    session.perched = seat;
    // jumped on with the stick still held: it holds her until it is let go (climbing.js stickTakesOff)
    session.perchHold = player.inputActive ? seat : null;
    player.perchY = seat.y;
    cat.position.set(seat.x, gy(seat.x, seat.z) + seat.y, seat.z);
    cat.rotation.y = seat.yaw;
    player.halt?.();
  }

  function startHopDown(seat, cat, player) {
    // the way she pushed the stick (a one-off question, as she gets off), or
    // straight off the seat when she pressed jump
    const d = player.inputActive ? player.inputDirection?.() ?? null : null;
    push.x = d ? d.x : 0;
    push.z = d ? d.z : 0;
    const to = sim.dismountSpot(seat, push, env);
    hop.on = true;
    hop.u = 0;
    hop.x0 = seat.x; hop.z0 = seat.z; hop.h0 = seat.y;
    hop.x1 = to.x; hop.z1 = to.z;
    hop.dur = hopDownTime(seat.y);
    player.perchY = seat.y;
    cat.position.set(seat.x, gy(seat.x, seat.z) + seat.y, seat.z);
    if (seat.seatKind === 'cup') wobble = RIDE.WOBBLE_TIME; // out of a teacup: a few wobbly steps
    riding = null;
    lastSeat = null;
    rodeRide = null;
  }

  // Step 3: the games, the finds and the visitors (src/fairshow.js), attached
  // by the walk once it has made them. Run here, after the rides have moved her.
  let show = null;

  // A co-walker's seat by its id (src/remotecats.js, partner-height): every
  // seat but the helter-skelter's, which each device slides on its own clock.
  const seatIds = new Map(sim.seats.filter((s) => s.rideId !== 'slide').map((s) => [s.id, s]));

  const api = {
    sim,
    seatById(id) { return seatIds.get(id) ?? null; },
    get show() { return show; },
    get games() { return show ? show.games : null; },
    attach(s) { show = s ?? null; return api; },
    actionFor() { return show && !riding && !hop.on ? show.actionFor() : null; },
    act(action) { return show ? show.act(action) : false; },
    meow(pos) { return show ? show.meow(pos) : 0; },
    get riding() { return riding; },
    get wobble() { return wobble; },
    get hopping() { return hop.on; },
    get cameraWeight() { return camW; },

    // groundSpot() → { x, z } where she would be put down right now, or null
    // when she is on the ground already. (For the mid-walk note: game/walkresume.js.)
    groundSpot() {
      if (hop.on) return { x: hop.x1, z: hop.z1 };
      if (!riding) return null;
      const to = sim.dismountSpot(riding, null, env);
      return { x: to.x, z: to.z };
    },

    // canBoard(cat, player, session): would the jump button put her on a ride
    // now? (For the jump hint: game/tips.js.)
    canBoard(cat, player, session) {
      if (hop.on || riding) return false;
      return sim.jumpTarget(catAt(cat, player), session.perched ?? null, null)?.type === 'board';
    },

    // pawKind(cat, player, session) → what the jump button would do on a ride
    // now, for the paw's badge (game/tips.js): 'up' onto a seat (from the
    // ground, a perch or another seat), 'down' off one (or down the slide),
    // 'none' when it would do nothing (waiting on the boarding deck or the
    // coaster's platform for the next one), null when it is not the rides'
    // business. Asked with no slack: the jump reaches a little further
    // (RIDE.JUMP_SLACK), so a press always finds the seat the paw promised.
    pawKind(cat, player, session) {
      if (hop.on) return 'none';
      const t = sim.jumpTarget(catAt(cat, player), session.perched ?? null, lastSeat);
      if (!t) return null;
      if (t.type === 'board' || t.type === 'hop') return 'up';
      if (t.type === 'stay') return 'none';
      return 'down';
    },

    // jump({ cat, player, session }) → true when a ride took the jump.
    jump({ cat, player, session }) {
      if (hop.on) return true; // in the air on the way down: nothing to do
      const from = session.perched ?? null;
      const t = sim.jumpTarget(catAt(cat, player), from, lastSeat, RIDE.JUMP_SLACK);
      if (!t) return false;
      if (t.type === 'board' || t.type === 'hop') {
        lastSeat = t.type === 'hop' ? riding : null;
        if (t.seat.rideId === 'cups') noteBoardSide(sim.cups.cx, sim.cups.cz);
        riding = t.seat;
        seatCat(t.seat, cat, player, session);
        onEvent({ type: 'hop', ride: t.seat.rideId });
        // (a hook for step 3: the lookout at the top of the big wheel is discovery F)
        if (t.seat.seatKind === 'lookout') onEvent({ type: 'lookout' });
        return true;
      }
      if (t.type === 'stay') return true; // waiting where she is for the next seat to come by
      if (t.type === 'slide') {
        // off the gallery and down the helter-skelter
        sim.startSlide();
        lastSeat = null;
        noteBoardSide(sim.slide.cx, sim.slide.cz);
        riding = t.seat;
        seatCat(t.seat, cat, player, session);
        onEvent({ type: 'slide' });
        return true;
      }
      if (t.type === 'static' && riding) {
        // off a seat onto one of the area's own perches (the boarding deck)
        riding = null; lastSeat = null; rodeRide = null;
        session.perched = t.perch;
        session.perchHold = player.inputActive ? t.perch : null;
        player.perchY = t.perch.y;
        cat.position.set(t.perch.x, gy(t.perch.x, t.perch.z) + t.perch.y, t.perch.z);
        player.halt?.();
        onEvent({ type: 'hop', ride: null });
        return true;
      }
      if (t.type === 'off' && riding) {
        const seat = riding;
        session.perched = null;
        startHopDown(seat, cat, player);
        return true;
      }
      return false;
    },

    // update(dt, t, { cat, player, session }): once a frame, after player.update.
    update(dt, t, { cat, player, session }) {
      const T = now();
      sim.setTime(T);
      poseRides(rides, sim);
      // the bulbs' chase and the bunting's flutter run on the same clock (none with reduced motion)
      setFairClock(T, reducedMotion);

      // the music box: one note at a time, quieter with distance, silent far away
      const n = Math.floor(T / TUNE.NOTE);
      if (n !== noteAt) {
        noteAt = n;
        const freq = TUNE.notes[((n % TUNE.notes.length) + TUNE.notes.length) % TUNE.notes.length];
        const d = Math.hypot(cat.position.x - sim.mgr.cx, cat.position.z - sim.mgr.cz);
        if (freq > 0 && d < TUNE.HEAR) onEvent({ type: 'note', freq, volume: 1 - d / TUNE.HEAR });
      }

      before.copy(cat.position);
      // The slide does not fade from under her while she is on it (src/treefade.js).
      {
        const hold = riding === sim.slide.chute;
        const coils = rides.helterSkelter.slideMeshes;
        if (coils) for (let i = 0; i < coils.length; i++) coils[i].userData.fadeHold = hold;
      }
      // The slide: she is on it until it ends (a pushed stick does not take
      // her off half way down), and it leaves her sitting on the mat.
      if (riding === sim.slide.chute) {
        if (sim.slide.done) {
          sim.endSlide();
          riding = sim.slide.mat;
          session.perched = riding;
          onEvent({ type: 'slide-end' });
        } else if (session.perched !== riding) {
          session.perched = riding;
        }
      }
      const perch = session.perched ?? null;
      const seat = perch && perch.fair ? perch : null;
      if (seat) {
        // carried: on the seat, at its height, facing the way it faces
        riding = seat;
        if (rodeRide !== seat.rideId) { rodeRide = seat.rideId; onEvent({ type: 'ride', ride: seat.rideId }); }
        player.perchY = seat.y;
        cat.position.set(seat.x, gy(seat.x, seat.z) + seat.y, seat.z);
        cat.rotation.y = seat.yaw;
      } else if (hop.on) {
        // the hop down: across in a straight line, down in an arc
        hop.u = Math.min(1, hop.u + dt / hop.dur);
        const k = hop.u * hop.u * (3 - 2 * hop.u);
        const y = hop.h0 * (1 - hop.u * hop.u);
        const hx = hop.x0 + (hop.x1 - hop.x0) * k;
        const hz = hop.z0 + (hop.z1 - hop.z0) * k;
        cat.position.set(hx, gy(hx, hz) + y, hz);
        player.perchY = y;
        if (hop.u >= 1) {
          hop.on = false;
          player.perchY = 0;
          player.halt?.();
          onEvent({ type: 'dismount' });
        }
      }
      if (wobble > 0) wobble = Math.max(0, wobble - dt);
      // A ride is not a rest: she does not get off one and curl straight up
      // for a nap (game/avatar.js counts how long she has been still).
      if (seat || hop.on) session.idleTime = 0;

      // The camera. player.update placed it for where the cat WAS; carry it by
      // however far she has just been moved, then lean it to the ride's own.
      if (camera && (seat || hop.on || camW > 0)) {
        off.copy(cat.position).sub(before);
        camera.position.add(off);
        look.set(cat.position.x, cat.position.y + CAT_LOOK_Y, cat.position.z);
        const want = seat ? cameraFor(seat, cat, dt) : 0;
        if (!seat || seat.seatKind !== 'car') sim.resetChase();
        camW += (want - camW) * Math.min(1, dt * CAM_EASE);
        if (camW < 0.002 && want === 0) camW = 0;
        else if (camW > 0.995 && want === 1) camW = 1; // all the ride's: a still camera is exactly still
        if (camW > 0) {
          camera.position.lerp(camPos, camW);
          if (!seat) camLook.copy(look); // getting off: the ride's camera keeps looking at her
          look.lerp(camLook, camW);
          // her own view turns to match, so the picture does not swing when the ride lets go
          if (seat && camW > 0.5) player.setViewYaw?.(Math.atan2(camera.position.x - cat.position.x, camera.position.z - cat.position.z));
        }
        camera.lookAt(look);
      }
      if (show) show.update(dt, t, { cat, player, session });
    },

    // late(dt, t, { cat, player, session }): once a frame, after the cat is
    // posed (game/avatar.js), which is where a pushed stick takes her off a
    // perch. If she has just left a seat, the hop down starts here, in the
    // same frame, so she is never drawn on the ground under the ride.
    late(dt, t, { cat, player, session }) {
      if (riding === sim.slide.chute && sim.slide.sliding && session.perched !== riding) {
        // still sliding: the stick does not take her off the chute
        session.perched = riding;
        player.perchY = riding.y;
        cat.position.y = gy(riding.x, riding.z) + riding.y;
      } else if (riding && session.perched !== riding) {
        if (!session.perched) startHopDown(riding, cat, player);
        else { riding = null; lastSeat = null; rodeRide = null; } // onto an ordinary perch: it has placed her
      }
      // going fast: ears back, and nose down the slope she is on (a cat enjoying it)
      const on = session.perched === riding ? riding : null;
      if (on && on.ears && !reducedMotion) {
        const parts = cat.userData?.parts;
        if (parts?.earL && parts?.earR && cat.userData.breed !== 'hagrid') { parts.earL.rotation.z = EARS_BACK; parts.earR.rotation.z = -EARS_BACK; }
      }
      if (on && on.pitch) { cat.rotation.order = 'YXZ'; cat.rotation.x = on.pitch * 0.7; }
      // after the teacups: a sway in her walk for a few steps, and nothing else
      if (wobble > 0 && !reducedMotion && !session.perched && !hop.on) {
        const k = wobble / RIDE.WOBBLE_TIME;
        cat.rotation.z += Math.sin(t * 7.5) * 0.2 * k;
      }
    },

    dispose() {
      if (show) { show.dispose(); show = null; }
      sim.endSlide();
      sim.resetChase();
      riding = null;
      lastSeat = null;
      hop.on = false;
      camW = 0;
      wobble = 0;
    },
  };
  return api;
}
