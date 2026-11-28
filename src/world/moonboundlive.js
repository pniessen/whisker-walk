// =============================================================================
// THE MOON'S BOUND ON A WALK (milestone 7b, Tier 2). Made once a walk by world/moonlife.js; update(dt, t, catPos, camera, session) every frame after the player.
//   * THE HOOK. The walk gives an area life no hand on the player before it moves, and the moves (src/traversallive.js) are the one place that has: main.js calls
//     session.traversal.update BEFORE player.update. The Moon passes no traversal data, so on its first frame this life hangs a copy of the walk's `session.traversal`
//     (NO_TRAVERSAL) with an update, a jump and a late of its own, exactly as world/moonroverlive.js hangs session.fair; dispose gives the walk's own back. A ground pounce
//     (the walk's, untouched: it sets the pounce window and the cooldown) at a run, with the stick held and no perch to take, is caught on the next frame's update and
//     becomes a BOUND (world/moonbound.js): the player is held (halt, speedFactor 0, as a crossing holds her), the cat is carried along the arc, her height is
//     the walk's `session.hopLift` (game/avatar.js adds it to the drawn height) and the camera follows 60 percent of it. A press while she is in the air is swallowed
//     (the hook's jump answers true), so a mid-air press can never take a perch. The landing frame is the frame the pounce window ends: the walk's own landing thump,
//     dust and haptic play on it.
//   * THE RING GATES: five hoops (one InstancedMesh, one draw call, drawn within 60 m); one lights when her bound flies through it (her height over the ground at the
//     hoop, from world/moonbound.js: read by nothing but this and the hop board). All five light gold, a chime and "Every ring is lit!" once. Nothing is saved; the first
//     lit ring counts the journal's "Long Jump" page for the walk (once, with the board's).
//   * REDUCED MOTION: the arc is simulated (rings and the board read it) and not drawn: no lift, no camera ease.
// Where the switch (world/moonswitch.js) is off this is an inert stand-in: nothing is built, nothing is hung on the walk.
// No random number, no clock of its own: every number is a constant or a walk second.
// =============================================================================

import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { pounceArc } from '../player.js';
import { placeArc, placeBudget } from '../placephysics.js';
import * as P from './moonplan.js';
import { BOUND, boundSpeed, boundWanted, startBound, stepBound, boundY, landingPerch, throughRing } from './moonbound.js';
import { makeRings, BOUND_COL } from './moonboundparts.js';
import { createMoonSound } from './moonsound.js';

export const RINGS_NEAR = 42; // m from the row's middle: farther than this the hoops' one draw call is skipped (a hoop 1.2 m wide at 42 m is a speck; the draw budget is tight at the dome)
export const HINT_NEAR = 9; // m from the first ring: the hint shows once a walk
const SAY = { 'moon.ring.hint': () => phrase('moon.ring.hint'), 'moon.ring.all': () => phrase('moon.ring.all') };
const say = (key) => bus.emit('discovery', { type: 'greenhousenote', key, label: SAY[key](), points: 0, repeat: false });
const ROW = Object.freeze({ x: 0, z: -17 });
const FRESH = 0.06; // s: a pounce window this close to its full length is a press made since the last frame

export function createBoundLive({ scene, reducedMotion = false, ground, colliders = P.MOON_COLLIDERS, perches = P.MOON_PERCHES, audio = null, progression = null, count = () => {}, on = P.MOON_BOUND_ON } = {}) {
  if (!on) return INERT;
  const gy = ground?.y ?? P.moonY;
  const sound = createMoonSound(audio);
  const rings = makeRings();
  scene.add(rings.mesh);
  const lit = new Set();
  let allLit = false;
  let hinted = false;
  // the walk's pounce window for the Moon (placephysics.js); the bound's own arc is the same parabola whatever the reduced-motion setting says
  const logicalArc = (breed) => placeArc(pounceArc(progression?.state, { reducedMotion: false }), 'moon', breed);
  const world = { bounds: P.MOON_BOUNDS, colliders, rifts: P.RIFTS, canStep: ground?.canStep ? (ax, az, bx, bz) => ground.canStep(ax, az, bx, bz) : null };

  let st = null; // the flight
  let flying = false;
  let flewThisFrame = false;
  let decided = false; // this pounce has been looked at
  let lastSpeed = 0; // her speed at the end of the last frame (before a press sets the player's own lunge)
  let takeoff = null;
  let hookSession = null;
  let hookOrig = null;
  let installed = false;

  function light(i) {
    if (lit.has(i)) return;
    lit.add(i);
    rings.paint(i, BOUND_COL.lit);
    sound.click();
    count();
    if (!allLit && lit.size === P.RING_GATES.length) {
      allLit = true;
      for (let k = 0; k < P.RING_GATES.length; k++) rings.paint(k, BOUND_COL.gold);
      sound.traced();
      say('moon.ring.all');
    }
  }

  function checkRings(ax, az, ay, bx, bz, by) {
    P.RING_GATES.forEach((g, i) => {
      if (lit.has(i)) return;
      const cy = gy(g.x, g.z) + g.y;
      if (throughRing(g, cy, ax, az, ay, bx, bz, by)) light(i);
    });
  }

  function finish(cat, player, session) {
    flying = false;
    flewThisFrame = true;
    const p = landingPerch(perches, takeoff, st, placeBudget(progression?.state, 'moon'), ground);
    if (p) {
      // the walk's own rule took her: she stands on it as a plain press from the take-off would have put her (never reached on the Moon's plan: the bound
      // only begins when no perch was in reach of the take-off)
      session.perched = p;
      session.perchHold = p;
      player.perchY = p.y;
      cat.position.set(p.x, gy(p.x, p.z) + p.y, p.z);
    }
  }

  function pre(dt, t, { cat, player, session }) {
    if (!cat || !player || !session) return;
    if (!flying) {
      if (!(session.pounceTime > 0)) { decided = false; return; }
      if (decided || session.perched || session.chasing || session.fight || session.freezeTime > 0) return;
      decided = true; // one look per press: the frames after it would read the speed the press's own lunge gave her
      const arc = logicalArc(session.cat?.userData?.breed);
      if (session.pounceTime < arc.time - FRESH) return; // not a press made since the last frame
      if (!boundWanted({ lastSpeed, inputHeld: player.inputActive, stalking: player.stalking, perched: session.perched, swimming: player.swimming })) return;
      const d = player.inputDirection();
      if (!(d.x || d.z)) return;
      st = startBound({ x: cat.position.x, z: cat.position.z, dx: d.x, dz: d.z, speed: boundSpeed(lastSpeed), T: session.pounceTime, H: arc.height });
      takeoff = { x: st.x, z: st.z };
      flying = true;
    } else if (!(session.pounceTime > 0) || session.perched || session.chasing || session.fight) {
      // something else ended the pounce (a scare, a chase, the walk's own teleport): let go where she is, no bound left
      flying = false;
      flewThisFrame = false;
      st = null;
      return;
    }
    const left = Math.max(0, session.pounceTime - dt);
    const ax = st.x;
    const az = st.z;
    const ay = gy(ax, az) + boundY(st);
    const wasEnded = st.ended;
    stepBound(st, dt, player.inputActive ? player.inputDirection() : null, world, left);
    if (st.ended && !wasEnded) session.pounceTime = BOUND.ease + dt; // an early end comes down in a quarter of a second (the avatar takes dt off this frame)
    flewThisFrame = true;
    cat.position.set(st.x, gy(st.x, st.z), st.z);
    if (Math.hypot(st.vx, st.vz) > 0.15) cat.rotation.y = Math.atan2(st.vx, st.vz) + Math.PI;
    player.halt();
    player.speedFactor = 0;
    session.idleTime = 0;
    checkRings(ax, az, ay, st.x, st.z, gy(st.x, st.z) + boundY(st));
    if (st.landed) finish(cat, player, session);
  }

  const hook = {
    update(dt, t, ctx) { hookOrig.update(dt, t, ctx); pre(dt, t, ctx); },
    jump(ctx) { return flying ? true : hookOrig.jump(ctx); },
    late(dt, t, ctx) {
      hookOrig.late(dt, t, ctx);
      lastSpeed = ctx?.player ? ctx.player.speed : 0;
      flewThisFrame = flying;
    },
  };
  function install(session) {
    if (installed || !session || !session.traversal) return;
    hookSession = session;
    hookOrig = session.traversal;
    const h = Object.create(hookOrig);
    Object.defineProperties(h, {
      busy: { get: () => flying || hookOrig.busy },
      speed: { get: () => (flying ? 0 : hookOrig.speed) },
      update: { value: hook.update },
      jump: { value: hook.jump },
      late: { value: hook.late },
    });
    session.traversal = h;
    installed = true;
  }

  return {
    rings,
    lit,
    // true on every frame a bound has the cat (the landing frame too): the camera and the lift are the bound's
    get active() { return flying || flewThisFrame; },
    // metres she is drawn above the ground now (none in reduced motion): the walk's session.hopLift
    get lift() { return reducedMotion || !st ? 0 : boundY(st); },
    get flying() { return flying; },
    get boundY() { return boundY(st); },
    update(dt, t, catPos, camera, session) {
      if (session) install(session);
      rings.mesh.visible = Math.hypot(catPos.x - ROW.x, catPos.z - ROW.z) <= RINGS_NEAR;
      const g = P.RING_GATES[0];
      if (!hinted && g && Math.hypot(catPos.x - g.x, catPos.z - g.z) <= HINT_NEAR) { hinted = true; say('moon.ring.hint'); }
    },
    dispose() {
      if (installed && hookSession && hookSession.traversal !== undefined) hookSession.traversal = hookOrig;
      installed = false;
      flying = false;
      scene.remove(rings.mesh);
      rings.dispose();
      sound.dispose();
    },
  };
}

// what the walk has when the switch is off
const INERT = Object.freeze({
  rings: null,
  lit: new Set(),
  active: false,
  lift: 0,
  flying: false,
  boundY: 0,
  update() {},
  dispose() {},
});
