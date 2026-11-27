// =============================================================================
// THE SKI SLOPE ON A WALK (Snowville, round three). Skis and poles stand in a rack at the top of the hill's west flank. Stand by the rack or the start: "Put on the skis". The cat's feet get two thin
// skis and she glides down the marked line by world/pathride.js (the sled spec on an open run: 2.0 to 5.0 m/s, 2 m either side of the line), her own standing pose (no new cat triangles). The stick swings
// her left and right through six gates of flags laid in a gentle slalom (the stick up and down only nudges the speed); each gate she glides through is a soft chime and a puff of snow, praise only: no
// timer, no score, no fail. The run always ends at the foot (the slowest speed still finishes it in under twelve seconds) with a cheer and the skis come off; the action button again, anywhere on the
// run, is "Take the skis off" onto the nearest of the precomputed free spots (a test floods each). A walk that ends while she skis sets her down on a free spot. Reduced motion: no lean, no puffs.
//
// HOW IT HOOKS IN (the sled's way, snowvillesledlive.js, which it sits beside): on its first frame the live swaps the walk's `session.fair` for a copy with its own update, late, jump, pawKind, canBoard and
// groundSpot, which hand over to whatever fair was there (the sled's, if it came first) while she is not skiing; it sets `session.perched` on a standing record (pose 'follow'), the player's perchY and
// carries the camera. CO-WALK: `session.fair.riding = { id: 'snow-skis' }` (a partner sees her gliding, her height from the record); one skier at a time; nothing is saved. Draws no random number and reads
// no clock of its own (a walk second).
// =============================================================================
import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { createPathRide, stepPath, hopOffSpot } from './pathride.js';
import * as P from './snowvilleplan.js';
import * as K from './snowvilleskisplan.js';
import { buildSkis } from './snowvilleskisparts.js';
import { snowvilleMaterials } from './snowvilleparts.js';
import './snowvilleskiswords.js';

export const SKI_FRAME = Object.freeze({ camOut: 0.35, camUp: 0.4, camEase: 2.4, lead: 1.6 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: true });

/** createSkisLive({ scene, reducedMotion, tier, audio, progression }) -> { skis, promptAt, interact, frame, hooks, install, riding, state, slots, dispose }. */
export function createSkisLive(ctx) {
  const { scene, reducedMotion = false, audio = null, progression = null } = ctx;
  const M = snowvilleMaterials();
  const skis = new THREE.Mesh(buildSkis(), M.paint);
  skis.name = 'snowville:skis';
  skis.castShadow = false;
  skis.visible = false;
  Object.assign(skis.userData, { noContactShadow: true, noMerge: true, noCast: true });
  scene.add(skis);

  let ground = null;
  const gy = (x, z) => (ground ? ground.y(x, z) : P.snowY(x, z));
  let ride = createPathRide(K.SKI_PATH, K.SKI_SPEC, 0);
  let mode = 'parked'; // 'parked' (the skis hang in the rack) or 'riding' (she is gliding)
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
  let runs = 0;
  let lastPlayer = null;
  let lastSession = null;
  let cleared = new Set();
  let paid = false;
  const seatRec = { x: 0, z: 0, y: K.SKIS.lift, yaw: 0, pose: 'follow', ride: false };
  const before = new THREE.Vector3();

  function place() {
    skis.visible = mode === 'riding';
    if (!skis.visible) return;
    skis.position.set(ride.x, gy(ride.x, ride.z) + 0.01, ride.z);
    skis.rotation.set(0, ride.heading, 0);
    // a gentle lean into a turn: none in reduced motion
    skis.rotation.z = reducedMotion ? 0 : -0.07 * Math.sin(clock * 2.7) * Math.min(1, ride.v / 3);
  }

  // The Ski Goggles (a found outfit, src/foundwear/face.js): owned for good through the save's own found-outfit path. true when she did not have them yet.
  const GOGGLES = 'skigoggles';
  const hasGoggles = () => !!progression?.state?.unlocked?.accessories?.includes(GOGGLES);
  const giveGoggles = () => !!progression?.recordFoundWear?.(GOGGLES);

  // ---- the walk's hooks (session.fair) ---------------------------------------------------------------------------------------
  function standCat(cat, player, session) {
    seatRec.x = ride.x;
    seatRec.z = ride.z;
    seatRec.y = K.SKIS.lift;
    seatRec.yaw = ride.heading + Math.PI;
    session.perched = seatRec;
    session.perchHold = seatRec;
    player.perchY = seatRec.y;
    cat.position.set(ride.x, gy(ride.x, ride.z) + seatRec.y, ride.z);
    cat.rotation.set(0, ride.heading + Math.PI, 0);
    session.idleTime = 0;
  }

  const blocked = (session) => !!session?.perched;

  function board(cat, player, session) {
    mode = 'riding';
    cleared = new Set();
    ride = createPathRide(K.SKI_PATH, K.SKI_SPEC, 0);
    player.halt?.();
    session.perched = seatRec;
    if (session.fair) session.fair.riding = { id: 'snow-skis' };
    standCat(cat, player, session);
  }

  function getOut(cat, player, session, spots = K.SKI_HOPS, cheer = false) {
    const to = hopOffSpot(ride, spots);
    mode = 'parked';
    session.perched = null;
    session.perchHold = null;
    if (session.fair) session.fair.riding = null;
    player.perchY = 0;
    cat.position.set(to.x, gy(to.x, to.z), to.z);
    cat.rotation.set(0, ride.heading + Math.PI, 0);
    player.halt?.();
    runs++;
    const all = cleared.size >= K.GATE_COUNT;
    if (cheer) {
      say('snowville-skis-land', all ? phrase('snowville.skis.all') : phrase('snowville.skis.land'));
      if (!paid && progression?.addPoints) { paid = true; progression.addPoints(3); say('snowville-skis-paws', phrase('snowville.skis.paws')); }
      if (all && giveGoggles()) { audio?.fanfare?.(); say('snowville-skis-goggles', phrase('snowville.skis.goggles')); } // every gate on one run: the Ski Goggles, once ever
      api.onRunEnd?.({ cleared: cleared.size, all, runs });
    }
    ride = createPathRide(K.SKI_PATH, K.SKI_SPEC, 0);
  }

  // one step while she glides: her stick, then the gates she passed (a chime and a puff each)
  function advance(dt, input, cat, player, session) {
    if (mode !== 'riding') return;
    const prev = ride.s;
    ride = stepPath(ride, input, dt, K.SKI_SPEC, K.SKI_PATH);
    for (const i of K.gatesCleared(prev, ride)) {
      if (cleared.has(i)) continue;
      cleared.add(i);
      audio?.chime?.();
      if (!reducedMotion) (session ?? lastSession)?.fx?.burst?.(new THREE.Vector3(ride.x, gy(ride.x, ride.z) + 0.3, ride.z), 0xffffff, 8);
    }
    if (ride.s >= K.SKI_LEN - K.FINISH && cat) getOut(cat, player, session, K.SKI_HOPS, true); // the run's end: set down at the foot, with a cheer
  }

  function step(dt, cat, player, session) {
    let input = null;
    if (mode === 'riding' && player?.inputActive) {
      const d = player.inputDirection();
      const h = ride.heading;
      input = { fwd: d.x * Math.sin(h) + d.z * Math.cos(h), side: d.x * -Math.cos(h) + d.z * Math.sin(h) };
    }
    advance(dt, input, cat, player, session);
    if (mode === 'riding') {
      before.copy(cat.position);
      standCat(cat, player, session);
      if (camera) {
        camera.position.add(before.negate().add(cat.position));
        camW += (1 - camW) * Math.min(1, dt * SKI_FRAME.camEase);
        const c = cat.position;
        const out = 1 + SKI_FRAME.camOut * camW;
        const vx = camera.position.x - c.x, vy = camera.position.y - c.y, vz = camera.position.z - c.z;
        camera.position.set(c.x + vx * out, c.y + vy * out + SKI_FRAME.camUp * camW, c.z + vz * out);
        const floor = gy(camera.position.x, camera.position.z) + 0.7;
        if (camera.position.y < floor) camera.position.y = floor;
        const lead = SKI_FRAME.lead * camW * Math.min(1, ride.v / K.SKI_SPEC.vMax);
        camera.lookAt(c.x + Math.sin(ride.heading) * lead, c.y + 0.5, c.z + Math.cos(ride.heading) * lead);
      }
    }
  }

  const prev = () => hookOrig ?? {};
  const hooks = {
    update(dt, t, args) {
      prev().update?.(dt, t, args);
      if (!installed) return;
      const { cat, player, session } = args;
      lastPlayer = player;
      lastSession = session;
      ticked = true;
      if (wantOn && mode === 'parked') { wantOn = false; if (!blocked(session)) board(cat, player, session); }
      if (wantOff && mode === 'riding') { wantOff = false; getOut(cat, player, session); }
      wantOn = false;
      wantOff = false;
      step(dt, cat, player, session);
      place();
      if (mode !== 'riding' && camW > 0) { camW = Math.max(0, camW - dt * SKI_FRAME.camEase * (camW + 0.3)); if (camW < 0.004) camW = 0; }
    },
    late(dt, t, args) {
      if (mode !== 'riding') return prev().late?.(dt, t, args);
      const { session } = args;
      if (session.perched !== seatRec) session.perched = seatRec;
      session.perchHold = seatRec;
      return undefined;
    },
    jump(...a) { return mode === 'riding' ? false : (prev().jump?.(...a) ?? false); },
    pawKind(...a) { return mode === 'riding' ? 'none' : (prev().pawKind?.(...a) ?? null); },
    canBoard(...a) { return mode === 'riding' ? false : (prev().canBoard?.(...a) ?? false); },
    groundSpot(...a) {
      if (mode !== 'riding') return prev().groundSpot?.(...a) ?? null;
      const to = hopOffSpot(ride, K.SKI_HOPS); // a walk that ends on the slope is saved on a free spot
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
    if (mode === 'riding') return { kind: 'off', line: phrase('snowville.skis.off') };
    if (blocked(hookSession)) return null;
    const near = (a) => dist(catPos, a) <= K.REACH && Math.abs((catPos.y ?? 0) - gy(a.x, a.z)) < 1.2;
    // the bench's goggles lie out once she has skied a few runs and has not got them (so nobody is shut out of them)
    if (runs >= K.GOGGLE_RUNS && progression && !hasGoggles() && dist(catPos, K.BENCH) <= K.REACH - 1.0 && Math.abs((catPos.y ?? 0) - gy(K.BENCH.x, K.BENCH.z)) < 1.2) return { kind: 'goggles', line: phrase('snowville.skis.bench') };
    return near(K.RACK) || near(K.START) ? { kind: 'on', line: phrase('snowville.skis.on') } : null;
  }

  const api = {
    skis,
    get riding() { return mode === 'riding'; },
    get mode() { return mode; },
    get ride() { return ride; },
    get runs() { return runs; },
    get cleared() { return cleared.size; },
    hooks,
    install,
    onRunEnd: null,
    get state() { return { mode, riding: mode === 'riding', camW, x: ride.x, z: ride.z, s: ride.s, v: ride.v, lat: ride.lat, runs, cleared: cleared.size }; },
    promptAt(catPos) {
      want = decide(catPos);
      return want ? want.line : null;
    },
    interact() {
      const w = want;
      want = null;
      if (!w) return null;
      if (w.kind === 'goggles') { if (giveGoggles()) { audio?.fanfare?.(); say('snowville-skis-bench', phrase('snowville.skis.bench.got')); } return w.kind; }
      if (w.kind === 'on') wantOn = true; else wantOff = true;
      return w.kind;
    },
    /** The area life's own frame: the walk's session and ground, the camera. */
    frame(dt, t, catPos, cam, session) {
      const d = dt > 0 ? dt : 0;
      clock += d;
      camera = cam ?? camera;
      if (session?.ground && !ground) ground = session.ground;
      if (session) { install(session); lastSession = session; }
      if (!ticked && mode === 'riding') advance(d, null, session?.cat ?? null, lastPlayer, session); // (the walk's hook did not run this frame: she still glides)
      ticked = false;
      place();
    },
    dispose() {
      // a walk that ends while she skis: set her down on a free spot, the fair she found put back (only if it is still ours)
      const s = hookSession;
      if (mode === 'riding' && s?.cat && lastPlayer) getOut(s.cat, lastPlayer, s);
      if (s && installed) {
        if (s.perched === seatRec) { s.perched = null; s.perchHold = null; }
        if (s.fair && s.fair.update === hooks.update) s.fair = hookOrig;
      }
      installed = false;
      scene.remove(skis);
      skis.geometry.dispose();
      for (const m of Object.values(M)) m.dispose?.();
    },
  };
  api.slots = {
    riding: { promptAt: (p) => (mode === 'riding' ? api.promptAt(p) : null), interact: () => api.interact() },
    skis: { promptAt: (p) => (mode === 'riding' ? null : api.promptAt(p)), interact: () => api.interact() },
  };
  place();
  return api;
}
