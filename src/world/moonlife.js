// =============================================================================
// THE MOON: ITS LIFE ON A WALK (milestone 1). What the Moon does each frame, all of it drawing and none of it a rule:
//   * the sky dress (world/moonsky.js: stars, Earth, the drifting cloud disc) hung on the camera, and a black sky;
//   * the camera's EASE: a Moon hop is 1.4 m high (3.6 m with Spring Paws), so the camera follows only 60 percent of
//     it (CAMERA_FOLLOW); the rest of the rise shows as the cat leaving the middle of the picture;
//   * the SKIP: a small 0.1 m bounce each stride while she walks, through session.hopLift (game/avatar.js adds it to
//     the drawn height, as the Market's shoo hop does), none in reduced motion;
//   * the LANDING DUST: ten slow puffs that hang about 1.2 s, on the very frame the pounce window ends (the frame
//     game/avatar.js plays the thump on), five on the lite rung, none in reduced motion (fx.burst's own rule).
//   * (milestone 4) the DRAW BUDGET: the walk's own pebbles and golden mice (about 17 draws if all are in view on this wide plain) are
//     hidden beyond DRAW_NEAR metres of her (a 0.2 m thing at 50 m is a dot), so a frame stays under the 120-draw gate; nothing reads a
//     mesh's `visible` to decide anything (the walk uses the collectible Map and the mice's own list);
//   * (milestone 5) the base's small parts far from her are not drawn (cullParts: the draw budget);
//   * (milestone 5) STAR HILL: the telescope and its star pictures, the Old Dish's turn to Earth, the wing's stand-in (world/moonstarlive.js);
//   * (milestone 6) the LAUNCH COMPLEX: the Message Desk's stamps, the postcard, the rocket and its launch, the reply on Earth's night side, the binocular stand, the
//     Moon Badge (world/moonlaunchlive.js); a launch tilts the camera up with the rocket (applied before the sky is placed);
//   * (milestone 7a) the COURSE LAMPS on the three ring-free courses and the HOP BOARD (world/moonjumplive.js);
//   * (milestone 7b) the BOUND and the RING GATES (world/moonboundlive.js, behind world/moonswitch.js): a pounce at a run carries her along an arc of its own; while it does, her height
//     is the bound's (session.hopLift) and the camera follows 60 percent of it as it does a plain hop's;
//   * (milestone 8) the LAVA TUBE and the DEEP CELL (world/moondeeplive.js): the cave's zone, the outside left undrawn once she is deep inside, the Star Garden's bloom and Earth's finale;
//   * (milestone 9) PIP'S POSTCARD OF THE DAY: one small errand a walk once the story is told, and the album of twelve (world/moonjoblive.js);
//   * (milestone 3) DOT the rover: hop in at the depot, steer, hop out (world/moonroverlive.js); she hangs her hooks on the walk's session.fair.
//   * (guide cues) the WRITTEN GUIDE: the goal line, the edge arrow and the words beside Pip's picture (world/moonguidelive.js), and the light column over the goal that is always up (the base's own ring and column; world/moonguide.js has the words);
//   * (story flow) the CONNECTIVE tissue: what comes next and why after each step, the call-to-action pill by the rocket slot and the big red button (world/moonflowlive.js; the table is world/moonflow.js);
//   * (idle ring) the gold ring and light column show BY THEMSELVES after about 30 s without progress (world/moonidle.js is the schedule; the ring is the base's, no new draw);
//   * (milestone 2) the BASE: Pip, the two power cells, the Core, the dome, the door, the board, the finds, the gold ring and the
//     switching-off of the daily goals and the air's sounds (world/moonbaselive.js); this life hands the walk its promptAt, interact
//     and credit.
// The base's own saves go through its life (state.moon); nothing else here is saved, sent or drawn from a random number or a clock of
// its own. The numbers below are the spec's section 5.2.
// =============================================================================

import * as THREE from 'three';
import { pounceArc, hopOffset } from '../player.js';
import { placeArc } from '../placephysics.js';
import { createMoonSky } from './moonsky.js';
import { createBaseLife } from './moonbaselive.js';
import { createDeepLive } from './moondeeplive.js';
import { MOON_SPAWN, AIRLOCK, RETURN_GATE, DOME } from './moonplan.js';
import { createCatRim } from './moonrim.js';
import { IDLE, idleStart, nextIdleRing, idlePaused, progressMark } from './moonidle.js';
import { FINALE_LENGTH } from './moondeeplive.js';
import { createGuideLive } from './moonguidelive.js';
import { createMoonIntro } from './moonintro.js';
import { createFlowLive } from './moonflowlive.js';
import { ST, loadMoonStages } from './moonstages.js'; // the staged pieces (star hill, launch, rover): loaded before the walk starts
if (import.meta.env?.VITEST) await loadMoonStages(); // tests that import this file alone get the whole Moon (a build drops this line)

export const CAMERA_FOLLOW = 0.6; // the camera rises this much of a hop's height
export const SKIP_HEIGHT = 0.1; // m, the bounce of one stride
export const SKIP_STRIDE = 1.1; // m walked per stride
export const IDLE_LOOK = 0.5; // s: the idle ring looks at the goal and what changed this often (not every frame)
export const DRAW_NEAR = 50; // m: the walk's pebbles and golden mice farther than this from her are not drawn (milestone 4's draw budget)
export const DUST = Object.freeze({ count: 10, lite: 5, ttl: 1.2, gravity: 0.35, speed: 0.9, size: 0.14, color: 0xb9b3aa });
// (milestone 5) The base's small parts are meshes of their own (they animate or change colour), and a frame on this wide plain drew every one of them
// from anywhere: the two door leaves (and their shadows), the gate ring's disc and shaft, and the dome's lamps, Core glow and board. Beyond these
// metres of their places they are a dot, so they are not drawn (about nine draws a frame on the far side, which is where Star Hill's wing is drawn).
export const PART_NEAR = Object.freeze([
  Object.freeze({ names: ['moon:doorL', 'moon:doorR'], x: AIRLOCK.x1, z: AIRLOCK.z, near: 40 }),
  Object.freeze({ names: ['moon:disc', 'moon:shaft'], x: RETURN_GATE.x, z: RETURN_GATE.z, near: 44 }), // (beauty round 1: 60 to 44 m, a faint ring a dot beyond it)
  Object.freeze({ names: ['moon:lamp', 'moon:coreglow', 'moon:board'], x: DOME.x, z: DOME.z, near: 45 }),
]);
const SKY_BLACK = 0x010208;

// The height of the hop now, from the pounce window the walk keeps (session.pounceTime counts down from arc.time): the
// same parabola player.js draws, so the camera and the cat agree. 0 when she is not hopping.
export function hopNow(arc, pounceTime) {
  if (!(pounceTime > 0)) return 0;
  return hopOffset(arc.time - pounceTime, arc);
}

// cullFar(catPos, session, near) -> how many of the walk's pebbles and golden mice are drawn now. A mesh beyond `near` metres (sideways) is
// hidden, one within it shown; the walk's collectible Map and the mice's list are not touched.
export function cullFar(catPos, session, near = DRAW_NEAR) {
  let shown = 0;
  const set = (obj) => {
    const on = Math.hypot(obj.position.x - catPos.x, obj.position.z - catPos.z) <= near;
    obj.visible = on;
    if (on) shown++;
  };
  const metres = session?.collectibleMeshes;
  if (metres && typeof metres.values === 'function') for (const m of metres.values()) set(m);
  for (const mo of session?.goldMice?.list ?? []) if (mo?.group) set(mo.group);
  return shown;
}

// cullParts(parts, catPos) -> how many of the base's small parts are drawn now (each hidden beyond its `near` metres of its place, shown within it).
export function cullParts(parts, catPos, table = PART_NEAR) {
  let shown = 0;
  for (const row of table) {
    const on = Math.hypot(catPos.x - row.x, catPos.z - row.z) <= row.near;
    for (const name of row.names) {
      const m = parts.get(name);
      if (!m) continue;
      m.visible = on;
      if (on) shown++;
    }
  }
  return shown;
}

// createMoonLife(ctx) -> { update(dt, t, catPos, camera, session), dispose() }; ctx is walk.js's life context.
export function createMoonLife({ scene, reducedMotion = false, tier, progression, ground, colliders, perches, log, audio, doc = globalThis.document, win = globalThis.window, clock, pads, roomSeed, visits, boundOn }) {
  // (arrival fix) walk.js's life context carries no page: the guide must find the real one itself, or it never mounts (the star, launch and jump lives already fell back this way)
  scene.background = new THREE.Color(SKY_BLACK); // no horizon haze under the stars: the Moon has no air
  const sky = createMoonSky({ scene, tier, reducedMotion });
  const catRim = createCatRim({ scene });
  let job = null; // (milestone 9) made below: the base's ring and board ask what today's errand is
  let launch = null; // (milestone 6) made below: the base's gold ring asks whether a postcard is in her mouth
  let deepLive = null; // (guide cues) made below: the beacon rests while the launch flies or Earth's finale plays
  const base = createBaseLife({ scene, reducedMotion, ground, colliders, progression, log, audio, cardCarried: () => (launch?.carryingCard ?? -1) >= 0, jobGoal: () => job?.goal() ?? null,
    beaconHold: () => { const fin = deepLive?.state.finale; return !!launch?.state.flight || (fin !== null && fin !== undefined && fin < FINALE_LENGTH); } });
  // (milestone 3) Dot: hop in at the depot, steer by the stick, hop out; she hooks the walk's session.fair on the first frame (moonroverlive.js)
  // (milestone 5) Star Hill: the telescope, the star pictures, the Old Dish's turn (moonstarlive.js); the rover's walk hook hands it the player each frame
  const star = ST.createStarLive({ scene, reducedMotion, ground, tier, audio, progression, doc, win });
  // (milestone 6) the Launch Complex: the postcard, the rocket, the reply (moonlaunchlive.js); the rover's walk hook hands it the player each frame as well
  launch = ST.createLaunchLive({ scene, reducedMotion, ground, tier, audio, progression, log, doc, win, clock, pads, pip: base.pip, sky });
  // (milestone 7a) the course lamps and the hop board (moonjumplive.js)
  let bound = null; // (milestone 7b) made below: the board reads her height in the air from it
  const jump = ST.createJumpLive({ scene, reducedMotion, ground, audio, progression, doc, air: () => bound?.boundY ?? 0, onHop: (h) => job?.onHop(h) });
  // (milestone 7b) the bound and the ring gates (moonboundlive.js; an inert stand-in when world/moonswitch.js is off); a lit ring counts the journal's Long Jump page with the board's
  bound = ST.createBoundLive({ scene, reducedMotion, ground, colliders, perches, audio, progression, count: () => jump.count() });
  // (milestone 8) the Lava Tube's zone and the Deep Cell's bloom and finale (moondeeplive.js); the cell itself is the base's (moonbaselive.js)
  const deep = createDeepLive({ scene, reducedMotion, ground, audio, progression, sky, launch, pip: base.pip });
  deepLive = deep;
  const rover = ST.createRoverLive({ scene, reducedMotion, ground, colliders, perches, tier, audio, progression, onDismount: () => base.pip.rejoin(), onFrame: (dt, t, ctx) => { star.frame(dt, t, ctx); launch.frame(dt, t, ctx); } });
  // (milestone 9) Pip's postcard of the day and the album (moonjoblive.js): after the rover, whose position it reads, and the star hill and the launch it asks things of
  job = ST.createJobLive({ scene, reducedMotion, ground, progression, log, audio, roomSeed, visits, boundOn, base, star, launch, rover });
  // (guide cues) the written guide: the goal line, the edge arrow and the words beside Pip's picture (moonguidelive.js); its own DOM, one goal (base.goal()) shared with the gold ring and light column
  const guide = createGuideLive({ doc, win, base, job, launch, star, deep, rover, progression, reducedMotion });
  // (story flow) the connective tissue: what comes next and why, the call-to-action pill by the rocket and the big red button (moonflowlive.js)
  const intro = createMoonIntro({ doc, win, progression }); // the arrival card (step 0 only)
  const flow = createFlowLive({ ground, doc, win, audio, base, launch, star, job, deep, progression, reducedMotion });
  // placed for the Ready card, before the first frame of the walk moves the camera (it looks north from behind the spawn)
  const first = new THREE.PerspectiveCamera();
  first.position.set(MOON_SPAWN.x, 2.9, MOON_SPAWN.z + 4.4);
  sky.update(first, 0);
  const lite = tier?.shadows === false;
  let lastX = null;
  let lastZ = 0;
  let phase = 0;
  let wasUp = false;
  let held = null;
  let owner = null; // whose offer the action button is showing: 'base' | 'star' | 'rover' | null
  // (idle ring) what moved her on since the last look (a mark that changes), the schedule's state, and the half-second the goal is looked at
  let idle = idleStart();
  let idleMark = null;
  let idleAcc = 0;
  function idleStep(dt, catPos, session) {
    idleAcc += dt;
    if (idleAcc < IDLE_LOOK) return;
    const span = Math.min(idleAcc, 1); // a stalled frame (a hidden tab) is not half a minute of idling
    idleAcc = 0;
    const b = base.state;
    const rec = b.record;
    const lf = launch.state;
    const gp = base.goalNow();
    const mark = progressMark({ step: rec.step, cells: rec.cells, scope: progression?.state?.moon?.scope ?? 0, stamp: progression?.state?.moon?.stamp ?? -1, carrying: b.carrying ?? -1, pip: b.pip, riding: rover.riding,
      card: lf.carryingCard, flight: !!lf.flight, reply: lf.reply, job: JSON.stringify([job.state.taken, job.state.next, job.state.glove, job.state.done]), finds: base.finds + (session?.collectibleMeshes?.size ?? 0), calls: base.calls, hops: JSON.stringify(jump.last ?? null) });
    const reached = !!catPos && Math.hypot(catPos.x - gp.x, catPos.z - gp.z) < IDLE.reach;
    const progress = (idleMark !== null && mark !== idleMark) || reached;
    idleMark = mark;
    const fin = deep.state.finale;
    const paused = idlePaused({ open: star.state.open || lf.open, flight: !!lf.flight, beat: b.beat, finale: fin !== null && fin < FINALE_LENGTH, riding: rover.riding, goal: gp.g });
    const r = nextIdleRing(idle, span, { progress, paused, target: gp.g.kind !== 'done' });
    idle = r.state;
    if (r.ring) base.autoCall(r.first);
  }
  const parts = new Map(PART_NEAR.flatMap((r) => r.names).map((n) => [n, scene.getObjectByName(n)]).filter(([, m]) => m));

  return {
    sky,
    base,
    rover,
    star,
    launch,
    jump,
    bound,
    deep,
    job,
    guide,
    flow,
    // the action button: Dot's "Hop in" / "Hop out" first (riding), else the base's own offers, else "Hop in" when nothing else is asked
    promptAt(catPos) {
      const b = base.promptAt(catPos);
      const s = star.promptAt(catPos);
      const l = launch.promptAt(catPos);
      const r = rover.promptAt(catPos);
      const j = job.promptAt(catPos);
      owner = rover.riding ? 'rover' : b ? 'base' : j ? 'job' : s ? 'star' : l ? 'launch' : r ? 'rover' : null;
      return owner === 'rover' ? r : owner === 'base' ? b : owner === 'job' ? j : owner === 'star' ? s : owner === 'launch' ? l : null;
    },
    interact() { return owner === 'rover' ? rover.interact() : owner === 'job' ? job.interact() : owner === 'star' ? star.interact() : owner === 'launch' ? launch.interact() : base.interact(); },
    credit: (ev) => (typeof ev?.kind === 'string' && ev.kind.startsWith('rover-') ? rover.credit(ev) : ev?.kind === 'launch' ? launch.credit(ev) : ev?.kind === 'job' ? job.credit(ev) : base.credit(ev)),
    update(dt, t, catPos, camera, session) {
      held = session;
      const tilt = launch.tilt(); // a rocket climbing: the view tips up with it (none in reduced motion), before the sky is placed on the camera
      if (tilt) camera.rotateX(tilt);
      sky.update(camera, t);
      const arc = placeArc(pounceArc(progression.state, { reducedMotion }), 'moon');
      const left = session.pounceTime ?? 0;
      // the camera ease: the hop's height she is at, less what the camera follows
      const lift = hopNow(arc, left);
      if (bound.active) camera.position.y += bound.lift * CAMERA_FOLLOW; // (milestone 7b) a bound: the player is held and does not lift the camera, so it rises 60 percent of her height itself
      else if (lift > 0) camera.position.y -= lift * (1 - CAMERA_FOLLOW);
      // the landing dust, on the frame the window ends (game/avatar.js takes dt off pounceTime later in this same frame)
      if (left > 0) wasUp = true;
      if (wasUp && left > 0 && left - dt <= 0) {
        wasUp = false;
        session.fx?.burst(catPos, DUST.color, lite ? DUST.lite : DUST.count, { ttl: DUST.ttl, gravity: DUST.gravity, speed: DUST.speed, size: DUST.size });
      }
      // the skip: a bounce each stride while she walks on the ground, none in the air, on a perch or in reduced motion
      let skip = 0;
      if (lastX !== null && dt > 0) {
        const d = Math.hypot(catPos.x - lastX, catPos.z - lastZ);
        const speed = d / dt;
        if (!reducedMotion && left <= 0 && !session.perched && speed > 0.5 && speed < 12) {
          phase += (d / SKIP_STRIDE) * Math.PI;
          skip = SKIP_HEIGHT * Math.abs(Math.sin(phase)) * Math.min(1, speed / 2);
        }
      }
      lastX = catPos.x;
      lastZ = catPos.z;
      session.hopLift = skip + bound.lift;
      rover.update(dt, t, catPos, camera, session);
      base.update(dt, t, catPos, camera, session);
      star.update(dt, t, catPos, camera, session);
      launch.update(dt, t, catPos, camera, session);
      jump.update(dt, t, catPos, camera, session);
      bound.update(dt, t, catPos, camera, session);
      deep.update(dt, t, catPos, camera, session);
      job.update(dt, t, catPos, camera, session);
      guide.update(dt, t, catPos, camera, session);
      intro.update(dt);
      flow.update(dt, t, catPos, camera, session);
      catRim.update(dt, camera, session.cat); // (beauty round 3) the suit's rim and the fill swell while she is backlit
      cullFar(catPos, session, deep.inside ? 0 : DRAW_NEAR); // deep in the tube nothing outside is drawn: the walk's pebbles and mice too
      cullParts(parts, catPos);
      idleStep(dt, catPos, session);
    },
    dispose() {
      flow.dispose();
      guide.dispose();
      intro.dispose();
      job.dispose();
      deep.dispose();
      bound.dispose();
      jump.dispose();
      launch.dispose();
      star.dispose();
      rover.dispose();
      base.dispose();
      sky.dispose();
      catRim.dispose();
      for (const m of parts.values()) m.visible = true;
      if (held) held.hopLift = 0;
      for (const m of held?.collectibleMeshes?.values?.() ?? []) m.visible = true;
      for (const mo of held?.goldMice?.list ?? []) if (mo?.group) mo.group.visible = true;
    },
  };
}
