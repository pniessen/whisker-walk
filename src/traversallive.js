// =============================================================================
// TRAVERSAL IN THE WALK (Rooftops step 1, part 2). The runtime for an area
// that returns `traversal` (src/traversal.js): the balance walk along its
// crossings, the camera that eases round behind her on one, and the hops at
// the placed spots (a leap across a gap, a climb-up, a drop), with the look
// across a gap she cannot leap yet.
//
// THE FRAME ORDER. main.js calls update() right BEFORE player.update. While
// she is on a crossing, update() places her itself (on the rail, with
// player.perchY = rail height minus the ground under her), then holds the
// player: halt() and speedFactor = 0. So player.update, which runs next,
// leaves her where she was put (velocity 0: no slide, no zoomies charge, no
// turn from velocity) and places the camera for this frame's spot with this
// frame's yaw. game/avatar.js writes speedFactor after player.update, and
// update() overrides it again before the next one. late() runs after the cat
// has been posed (a no-op until her balancing look is added).
//
// A HELD STICK keeps its world direction from the moment it is pushed until
// it is let go: on the crossing (step 1 below) and after she steps off it, so
// the camera having swung round behind her can never turn her back. Off the
// crossing the hold is the player's input yaw (player.setInputYaw), and while
// it lasts she cannot get straight back on the end she stepped off; a fresh
// push after letting go can. The camera's turn stops at the step-off.
//
// NO_TRAVERSAL is what every walk in an area without traversal has, so main.js,
// game/avatar.js and the rest can call it without asking first (the NO_FAIR
// pattern of src/fairlive.js).
//
// THE JUMP BUTTON at a spot (jump()) starts a hop: a crouch that glides her to
// the take-off, the arc, the landing. Every frame of it is hopAt(plan, time):
// where she is follows from the plan and the time alone, never from where she
// was, so whatever else moves her mid-air she is back on the arc next frame,
// and whatever the frame times she ends exactly on the landing. "It always
// lands." A spot she cannot use yet (a gap needing Long Leap, a climb above
// her budget) is a look: she stops and faces the far side for LOOK_TIME, until
// a fresh push of the stick (a stick still held at the press does not count).
//
// DETERMINISTIC: every motion is a function of the data, the stick and dt.
// ALLOCATION: update(), jump() and late() allocate nothing; the scratch
// objects and the events (one frozen pair per crossing, one frozen set per
// hop) are made here, once.
// =============================================================================
import {
  BASE_ABILITIES, ALONG_DEAD, SNAP_EASE, TURN_RATE, CAM_FOLLOW_RATE, CAM_TURN_MAX, LOOK_TIME,
  crossingPoint, crossingToMount, balanceStep, spotFor, planHop, hopAt,
  stickToWorld, facingYaw, behindYaw, easeYawToward,
} from './traversal.js';

const EPS = 1e-9;
const LAND_DUST = 0xcbb8a0;
const LAND_EVENT = Object.freeze({ water: false });

// What a traversal event does in the game: the whoosh as she springs, and at
// touchdown the dust, the thump and the 'pounce:land' that src/haptics.js taps
// for. fx and audio may be missing (a stand-in, a headless walk).
export function traversalEventEffects(e, { audio, fx, cat, bus } = {}) {
  switch (e?.type) {
    case 'leap':
    case 'climb':
    case 'drop':
      audio?.pounceWhoosh?.();
      break;
    case 'land':
      fx?.burst?.(cat.position, LAND_DUST, 8);
      audio?.landThump?.();
      bus?.emit('pounce:land', LAND_EVENT);
      break;
    default:
      break;
  }
}

export const NO_TRAVERSAL = Object.freeze({
  busy: false,
  crossing: null,
  hop: null,
  looking: null,
  phase: null,
  progress: 0,
  pose: null,
  speed: null,
  groundSpot() { return null; },
  update() {},
  jump() { return false; },
  late() {},
  dispose() {},
});

export function createTraversalLive(trav, { ground, reducedMotion = false, abilities = () => BASE_ABILITIES, onEvent = () => {} } = {}) {
  const mountEvents = new Map();
  const crossEvents = new Map();
  for (const c of trav.crossings) {
    mountEvents.set(c, Object.freeze({ type: 'mount', id: c.id }));
    crossEvents.set(c, Object.freeze({ type: 'cross', id: c.id }));
  }
  const springEvents = new Map();
  const landEvents = new Map();
  const lookEvents = new Map();
  for (const h of trav.hops) {
    springEvents.set(h, Object.freeze({ type: h.kind, id: h.id }));
    landEvents.set(h, Object.freeze({ type: 'land', kind: h.kind, id: h.id }));
    lookEvents.set(h, Object.freeze({ type: 'look', id: h.id }));
  }

  const stick = { x: 0, z: 0 };
  const world = { x: 0, z: 0 };
  const pt = { x: 0, y: 0, z: 0, tx: 0, tz: 0, grade: 0 };
  const found = { crossing: null, end: 0, u: 0 };
  const st = { u: 0, v: 0 };

  let crossing = null;
  let mountEnd = 0;
  let outSign = 0; // -1 at end 0, +1 at end 1: the tangent times this points off the end she got on by
  let steady = false;
  let controlYaw = null;
  let latX = 0; // her offset from the rail, glided away at SNAP_EASE
  let latZ = 0;
  // Metres she still stands short of the rail, off the end she got on by (u
  // is clamped there). Her first steps along walk it off, at the balance
  // speed like every other step on a crossing.
  let over = 0;
  let faceX = 0;
  let faceZ = 0;
  // The held stick after a step-off: its yaw, the end it left, and the player
  // it was handed to (so dispose() can take it back).
  let heldYaw = null;
  let heldCrossing = null;
  let heldEnd = 0;
  let heldPlayer = null;

  // The hop: its plan, the time into it, where hopAt puts her, the way she
  // faces for it, and whether the spring and the touchdown have been told.
  const spot = { hop: null, look: false };
  const plan = { hop: null, sx: 0, sz: 0, crouch: 0, land: 0, hang: 0, air: 0, total: 0 };
  const at = { x: 0, y: 0, z: 0, phase: null, s: 0, onGround: true, tau: 0 };
  let hop = null;
  let elapsed = 0;
  let hopYaw = 0;
  let sprung = false;
  let landed = false;
  // The look: the hop she is looking along, and for how long so far. A stick
  // already pushed at the press does not end it (she was walking up to the
  // gap); only a push after the stick has once been let go (or dropped under
  // ALONG_DEAD) does. lookArmed is that "once let go".
  let looking = null;
  let lookTime = 0;
  let lookArmed = false;

  function clearHop() {
    hop = null;
    plan.hop = null;
    elapsed = 0;
    at.phase = null;
    at.s = 0;
  }

  function clear() {
    crossing = null;
    controlYaw = null;
    st.u = 0;
    st.v = 0;
    latX = 0;
    latZ = 0;
    over = 0;
  }

  function letGo() {
    if (heldPlayer) heldPlayer.setInputYaw(null);
    heldYaw = null;
    heldCrossing = null;
    heldPlayer = null;
  }

  // Her x, z for the rail point in `pt`.
  function placeX() { return pt.x + over * outSign * pt.tx + latX; }
  function placeZ() { return pt.z + over * outSign * pt.tz + latZ; }

  function tryMount(cat, player, session) {
    if (session.perched || player.perchY !== 0 || session.fight || session.chasing || !player.inputActive) return false;
    const p = cat.position;
    const yaw = heldYaw ?? player.viewYaw();
    player.stickInput(stick);
    stickToWorld(stick.x, stick.z, yaw, world);
    if (!crossingToMount(trav, p.x, p.z, ground.y(p.x, p.z), world.x, world.z, found)) return false;
    if (heldYaw !== null && found.crossing === heldCrossing && found.end === heldEnd) return false;
    letGo();
    looking = null;
    crossing = found.crossing;
    mountEnd = found.end;
    outSign = mountEnd === 0 ? -1 : 1;
    st.u = found.u;
    st.v = 0;
    controlYaw = yaw;
    steady = !!abilities().steady;
    crossingPoint(crossing, st.u, pt);
    const dx = p.x - pt.x;
    const dz = p.z - pt.z;
    over = Math.max(0, (dx * pt.tx + dz * pt.tz) * outSign);
    latX = dx - over * outSign * pt.tx;
    latZ = dz - over * outSign * pt.tz;
    const e = crossing.ends[mountEnd];
    faceX = e.inX;
    faceZ = e.inZ;
    player.halt();
    onEvent(mountEvents.get(crossing));
    return true;
  }

  function walk(dt, cat, player, session) {
    const c = crossing;
    // 1. Hold the yaw. The stick is turned by the yaw it was first pushed
    //    under, not the live one, so a held stick keeps its world direction
    //    while the camera swings round behind her.
    const active = player.inputActive;
    if (!active) controlYaw = null;
    else if (controlYaw === null) controlYaw = player.viewYaw();
    if (active) {
      player.stickInput(stick);
      stickToWorld(stick.x, stick.z, controlYaw, world);
    } else {
      world.x = 0;
      world.z = 0;
    }
    // 2. Step along: only the push along the rail counts.
    crossingPoint(c, st.u, pt);
    const along = world.x * pt.tx + world.z * pt.tz;
    const before = st.u;
    const end = balanceStep(st, c, along, dt, steady);
    if (over > 0) {
      const inward = (st.u - before) * -outSign;
      if (inward > 0) {
        const take = Math.min(over, inward);
        over -= take;
        st.u += take * outSign;
      }
    }
    // 3. Off at an end: on that end, on the ground, still facing the way she
    //    was, the held stick still held. The tally counts only a crossing
    //    made end to end.
    if (end !== null) {
      crossingPoint(c, st.u, pt);
      cat.position.set(placeX(), pt.y, placeZ());
      player.perchY = 0;
      heldYaw = controlYaw;
      heldCrossing = c;
      heldEnd = end;
      heldPlayer = player;
      player.setInputYaw(heldYaw);
      clear();
      if (end !== mountEnd) onEvent(crossEvents.get(c));
      return;
    }
    // 4. Place her: on the rail, gliding in from wherever she got on.
    const k = Math.exp(-SNAP_EASE * dt);
    latX *= k;
    latZ *= k;
    crossingPoint(c, st.u, pt);
    const x = placeX();
    const z = placeZ();
    player.perchY = Math.max(0, pt.y - ground.y(x, z));
    cat.position.set(x, pt.y, z);
    // 5. Face the way she walks.
    if (Math.abs(st.v) > 0.05) {
      const s = st.v > 0 ? 1 : -1;
      faceX = s * pt.tx;
      faceZ = s * pt.tz;
    }
    cat.rotation.y = easeYawToward(cat.rotation.y, facingYaw(faceX, faceZ), dt, TURN_RATE, TURN_RATE);
    // 6. The camera eases round behind her, gently; never by itself under
    //    reduced motion.
    if (!reducedMotion && Math.abs(st.v) > 0.1) {
      player.setViewYaw(easeYawToward(player.viewYaw(), behindYaw(faceX, faceZ), dt, CAM_FOLLOW_RATE, CAM_TURN_MAX));
    }
    // 7. Hold the player, so player.update keeps her still this frame.
    player.halt();
    player.speedFactor = 0;
    session.idleTime = 0;
  }

  // One frame of a hop. Like a crossing, it runs before player.update and
  // holds the player, so player.update leaves her where she is put.
  function hopStep(dt, cat, player, session) {
    const h = hop;
    const d = dt > 0 ? dt : 0;
    elapsed += d;
    hopAt(plan, elapsed, at);
    // 1. Place her: on the ground in the crouch and from touchdown on, else
    //    on the arc, perchY the height above the ground under her.
    if (at.onGround) {
      player.perchY = 0;
    } else {
      player.perchY = Math.max(0, at.y - ground.y(at.x, at.z));
    }
    cat.position.set(at.x, at.y, at.z);
    // 2. Face the landing: turning to it in the crouch, exactly on it after.
    if (at.phase === 'crouch') cat.rotation.y = easeYawToward(cat.rotation.y, hopYaw, d, TURN_RATE, TURN_RATE);
    else cat.rotation.y = hopYaw;
    // 3. Tell the spring and the touchdown, once each and in order, even if
    //    one long frame went past a whole phase.
    if (!sprung && at.phase !== 'crouch') {
      sprung = true;
      onEvent(springEvents.get(h));
    }
    if (!landed && (at.phase === 'land' || at.phase === 'done')) {
      landed = true;
      onEvent(landEvents.get(h));
    }
    // 4. Hold the player.
    player.halt();
    player.speedFactor = 0;
    session.idleTime = 0;
    // 5. Done: exactly on the landing (hopAt's 'done' is the landing spot).
    if (at.phase === 'done') clearHop();
  }

  return {
    get busy() { return crossing !== null || hop !== null; },
    get crossing() { return crossing; },
    get hop() { return hop; },
    get looking() { return looking; },
    get phase() {
      if (crossing) return 'crossing';
      if (hop) return at.phase;
      return looking ? 'look' : null;
    },
    get progress() {
      if (crossing) return st.u / crossing.length;
      return hop ? at.s : 0;
    },
    get pose() {
      if (crossing) return 'stalk';
      if (hop) return at.phase === 'crouch' ? 'stalk' : at.phase === 'air' ? 'pounce' : 'land';
      return looking ? 'follow' : null;
    },
    get speed() {
      if (crossing) return Math.abs(st.v);
      return hop || looking ? 0 : null;
    },
    update(dt, t, { cat, player, session }) {
      if (!crossing && heldYaw !== null) {
        player.stickInput(stick);
        if (!player.inputActive || Math.hypot(stick.x, stick.z) < ALONG_DEAD) letGo();
      }
      if (hop) {
        hopStep(dt, cat, player, session);
        return;
      }
      // A fresh push ends a look at once; so does the timer.
      if (looking) {
        lookTime += dt > 0 ? dt : 0;
        let pushed = false;
        if (player.inputActive) {
          player.stickInput(stick);
          pushed = Math.hypot(stick.x, stick.z) >= ALONG_DEAD;
        }
        if (!pushed) lookArmed = true;
        if ((pushed && lookArmed) || lookTime >= LOOK_TIME - EPS) looking = null;
      }
      if (!crossing && !tryMount(cat, player, session)) return;
      walk(dt, cat, player, session);
    },
    // The jump button. True when it was this runtime's press (a hop, a look,
    // or anything while busy, so the button does nothing else then); false
    // when it is not its business and the game's own pounce should have it.
    jump({ cat, player, session }) {
      if (crossing || hop) return true;
      if (session.perched || player.perchY !== 0 || session.fight || session.chasing) return false;
      const p = cat.position;
      const ry = cat.rotation.y;
      if (!spotFor(trav, p.x, p.z, ground.y(p.x, p.z), -Math.sin(ry), -Math.cos(ry), abilities(), spot)) return false;
      const h = spot.hop;
      const yaw = h.dist > 0 ? facingYaw(h.x1 - h.x0, h.z1 - h.z0) : ry;
      player.halt();
      if (spot.look) {
        looking = h;
        lookTime = 0;
        lookArmed = false;
        cat.rotation.y = yaw;
        onEvent(lookEvents.get(h));
        return true;
      }
      looking = null;
      hop = h;
      hopYaw = yaw;
      planHop(h, p.x, p.z, reducedMotion, plan);
      elapsed = 0;
      sprung = false;
      landed = false;
      at.phase = 'crouch';
      at.s = 0;
      return true;
    },
    late() {},
    // Free ground to put her on if the walk stops here: the nearer end of a
    // crossing, the landing of a hop.
    groundSpot() {
      if (hop) return { x: hop.x1, z: hop.z1 };
      if (!crossing) return null;
      const e = crossing.ends[st.u < crossing.length / 2 ? 0 : 1];
      return { x: e.x, z: e.z };
    },
    dispose() {
      clear();
      clearHop();
      looking = null;
      letGo();
    },
  };
}
