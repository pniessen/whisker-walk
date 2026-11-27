// =============================================================================
// THE SNOWMOBILE ON A WALK (Snowville, round four). A chunky red machine waits beside the garage lean-to on the south-east lawn. Stand by it: "Hop on". She sits on the front seat and rides a closed ring of
// lanes by world/pathride.js (the sled's spec on a ring: 3.0 to 6.5 m/s, 1.8 m either side of the line), two laps, her own seated pose (no new cat triangles). The stick up and down only nudges the speed and
// left and right weaves her inside the lane. The ride always ends back at the garage (the slowest speed still finishes it in under forty seconds) with "Brrrm! Cosy ride!" and 3 paws (once a walk); the action
// button again, anywhere on it, is "Hop off" onto the nearest of the precomputed free spots (a test floods each). A walk that ends mid-ride sets her down on a free spot. Reduced motion: no sway, no chug.
//
// HOW IT HOOKS IN (the ski slope's way, snowvilleskislive.js, which it sits beside): on its first frame the live swaps the walk's `session.fair` for a copy with its own update, late, jump, pawKind, canBoard and
// groundSpot, which hand over to whatever fair was there while she is not riding; it sets `session.perched` on a seat record (pose 'requestPet'), the player's perchY and carries the camera.
// CO-WALK: `session.fair.riding = { id: 'snow-mobile', seat: 0 }` (the back seat is id 'snow-mobile-1', seat 1: remotecats.js reads the id). Each device runs its own machine (the walk has no shared ride
// state), so a partner who rides is DRAWN on the machine here too: it is put under her where she sits (the one mesh), and a cat who hops on while a partner is aboard takes the back seat and joins the ride
// where the partner is. A partner who leaves midway changes nothing for a rider: the machine goes on and ends normally. Nothing is saved but the helmet. Draws no random number and reads no clock of its own.
// =============================================================================
import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { createPathRide, stepPath, hopOffSpot } from './pathride.js';
import * as P from './snowvilleplan.js';
import * as M from './snowvillemobileplan.js';
import { buildMobile } from './snowvillemobileparts.js';
import { snowvilleMaterials } from './snowvilleparts.js';
import './snowvillemobilewords.js';

export const MOBILE_FRAME = Object.freeze({ camOut: 0.45, camUp: 0.45, camEase: 2.4, lead: 1.4 });
const CHUG = 0.3; // seconds between the engine's soft ticks
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: true });
const wrap = (d) => ((d % M.MOBILE_LEN) + M.MOBILE_LEN) % M.MOBILE_LEN;

/** createMobileLive({ scene, reducedMotion, tier, audio, progression }) -> { mobile, promptAt, interact, frame, hooks, install, riding, state, slots, dispose }. */
export function createMobileLive(ctx) {
  const { scene, reducedMotion = false, audio = null, progression = null } = ctx;
  const Mat = snowvilleMaterials();
  const mobile = buildMobile(Mat);
  scene.add(mobile);

  let ground = null;
  const gy = (x, z) => (ground ? ground.y(x, z) : P.snowY(x, z));
  const fresh = (s = 0) => createPathRide(M.MOBILE_PATH, M.MOBILE_SPEC, s);
  let ride = fresh();
  let mode = 'parked'; // 'parked' (at the garage, or under a partner who rides) or 'riding' (she is on it)
  let seat = 0;
  let travelled = 0;
  let length = M.RIDE_LEN; // the metres this ride lasts (one lap when she joins a ride in progress)
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
  let chug = 0;
  let rides = 0;
  let lastPlayer = null;
  let lastSession = null;
  let paid = false;
  let partner = null; // { group, seat } of a partner riding on her own device, drawn here
  const seatRec = { x: 0, z: 0, y: M.MOBILE.seatY, yaw: 0, pose: 'requestPet', ride: false };
  const before = new THREE.Vector3();

  function place() {
    if (mode === 'riding') {
      mobile.visible = true;
      mobile.position.set(ride.x, gy(ride.x, ride.z) + M.MOBILE.lift, ride.z);
      mobile.rotation.set(0, ride.heading, 0);
      mobile.rotation.z = reducedMotion ? 0 : -0.03 * Math.sin(clock * 3.3) * Math.min(1, ride.v / 4);
    } else if (partner) {
      // under a partner who rides on her own device: her seat is the machine's seat, so the machine is put back along its heading
      const h = partner.group.rotation.y - Math.PI;
      const off = partner.seat ? M.MOBILE.seat1 : M.MOBILE.seat0;
      const x = partner.group.position.x - Math.sin(h) * off; const z = partner.group.position.z - Math.cos(h) * off;
      mobile.visible = true;
      mobile.position.set(x, gy(x, z) + M.MOBILE.lift, z);
      mobile.rotation.set(0, h, 0);
    } else {
      mobile.visible = true;
      mobile.position.set(M.START.x, gy(M.START.x, M.START.z) + M.MOBILE.lift, M.START.z);
      mobile.rotation.set(0, M.START.heading, 0);
    }
  }

  // The Snowmobile Helmet (a found outfit, src/foundwear/head.js): owned for good through the save's own found-outfit path. true when she did not have it yet.
  const HELMET = 'snowhelmet';
  const hasHelmet = () => !!progression?.state?.unlocked?.accessories?.includes(HELMET);
  const giveHelmet = () => !!progression?.recordFoundWear?.(HELMET);

  // ---- the walk's hooks (session.fair) ---------------------------------------------------------------------------------------
  function seatCat(cat, player, session) {
    const s = M.seatRecord(ride, seat);
    seatRec.x = s.x;
    seatRec.z = s.z;
    seatRec.y = s.y;
    seatRec.yaw = s.yaw;
    session.perched = seatRec;
    session.perchHold = seatRec;
    player.perchY = seatRec.y;
    cat.position.set(s.x, gy(s.x, s.z) + seatRec.y, s.z);
    cat.rotation.set(0, s.yaw, 0);
    session.idleTime = 0;
  }

  function findPartner(session) {
    partner = null;
    const list = session?.remotes?.list;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const k = M.SEAT_IDS.indexOf(r?.seatId);
      if (k >= 0 && r.group && r.group.visible !== false) { partner = { group: r.group, seat: k }; return; }
    }
  }

  const blocked = (session) => !!session?.perched;

  function board(cat, player, session) {
    mode = 'riding';
    travelled = 0;
    length = M.RIDE_LEN;
    seat = 0;
    ride = fresh();
    if (partner) { // a partner is aboard: the back seat, and the ride from where she is (the rest of one lap)
      seat = partner.seat === 0 ? 1 : 0;
      ride = fresh(M.nearestS(partner.group.position.x, partner.group.position.z));
      length = M.MOBILE_LEN;
    }
    player.halt?.();
    session.perched = seatRec;
    if (session.fair) session.fair.riding = { id: M.SEAT_IDS[seat], seat };
    seatCat(cat, player, session);
  }

  function getOut(cat, player, session, spots = M.MOBILE_HOPS, cheer = false) {
    const to = hopOffSpot(ride, spots);
    mode = 'parked';
    session.perched = null;
    session.perchHold = null;
    if (session.fair) session.fair.riding = null;
    player.perchY = 0;
    cat.position.set(to.x, gy(to.x, to.z), to.z);
    cat.rotation.set(0, ride.heading + Math.PI, 0);
    player.halt?.();
    rides++;
    if (cheer) {
      say('snowville-mobile-land', phrase('snowville.mobile.land'));
      if (!paid && progression?.addPoints) { paid = true; progression.addPoints(3); say('snowville-mobile-paws', phrase('snowville.mobile.paws')); }
      if (giveHelmet()) { audio?.fanfare?.(); say('snowville-mobile-helmet', phrase('snowville.mobile.helmet')); } // the first ride that comes home: the helmet waiting on the seat
      api.onRideEnd?.({ rides, seat });
    }
    ride = fresh();
    travelled = 0;
    seat = 0;
  }

  function advance(dt, input, cat, player, session) {
    if (mode !== 'riding') return;
    const prev = ride.s;
    ride = stepPath(ride, input, dt, M.MOBILE_SPEC, M.MOBILE_PATH);
    travelled += wrap(ride.s - prev);
    if (!reducedMotion) { chug += dt; if (chug >= CHUG) { chug -= CHUG; audio?.tick?.(0.18); } }
    if (travelled >= length - M.FINISH && cat) getOut(cat, player, session, M.MOBILE_HOPS, true); // home: set down at the garage, with a cheer
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
      seatCat(cat, player, session);
      if (camera) {
        camera.position.add(before.negate().add(cat.position));
        camW += (1 - camW) * Math.min(1, dt * MOBILE_FRAME.camEase);
        const c = cat.position;
        const out = 1 + MOBILE_FRAME.camOut * camW;
        const vx = camera.position.x - c.x, vy = camera.position.y - c.y, vz = camera.position.z - c.z;
        camera.position.set(c.x + vx * out, c.y + vy * out + MOBILE_FRAME.camUp * camW, c.z + vz * out);
        const floor = gy(camera.position.x, camera.position.z) + 0.7;
        if (camera.position.y < floor) camera.position.y = floor;
        const lead = MOBILE_FRAME.lead * camW * Math.min(1, ride.v / M.MOBILE_SPEC.vMax);
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
      if (mode !== 'riding' && camW > 0) { camW = Math.max(0, camW - dt * MOBILE_FRAME.camEase * (camW + 0.3)); if (camW < 0.004) camW = 0; }
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
      const to = hopOffSpot(ride, M.MOBILE_HOPS); // a walk that ends on the lane is saved on a free spot
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
    if (mode === 'riding') return { kind: 'off', line: phrase('snowville.mobile.off') };
    if (blocked(hookSession)) return null;
    const near = (a) => dist(catPos, a) <= M.REACH && Math.abs((catPos.y ?? 0) - gy(a.x, a.z)) < 1.2;
    // the bench's helmet lies out once she has ridden a few times and has not got it (so nobody is shut out of it)
    if (rides >= M.HELMET_RIDES && progression && !hasHelmet() && dist(catPos, M.BENCH) <= M.REACH - 1.0 && Math.abs((catPos.y ?? 0) - gy(M.BENCH.x, M.BENCH.z)) < 1.2) return { kind: 'helmet', line: phrase('snowville.mobile.bench') };
    if (partner) { const p = partner.group.position; return near({ x: p.x, z: p.z }) ? { kind: 'on', line: phrase('snowville.mobile.back') } : null; }
    return near(M.START) || near(M.GARAGE) ? { kind: 'on', line: phrase('snowville.mobile.on') } : null;
  }

  const api = {
    mobile,
    get riding() { return mode === 'riding'; },
    get mode() { return mode; },
    get seat() { return seat; },
    get ride() { return ride; },
    get rides() { return rides; },
    get partner() { return partner; },
    hooks,
    install,
    onRideEnd: null,
    get state() { return { mode, riding: mode === 'riding', camW, x: ride.x, z: ride.z, s: ride.s, v: ride.v, lat: ride.lat, travelled, length, rides, seat }; },
    promptAt(catPos) {
      want = decide(catPos);
      return want ? want.line : null;
    },
    interact() {
      const w = want;
      want = null;
      if (!w) return null;
      if (w.kind === 'helmet') { if (giveHelmet()) { audio?.fanfare?.(); say('snowville-mobile-bench', phrase('snowville.mobile.bench.got')); } return w.kind; }
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
      if (!ticked && mode === 'riding') advance(d, null, session?.cat ?? null, lastPlayer, session); // (the walk's hook did not run this frame: she still rides)
      ticked = false;
      findPartner(session);
      place();
    },
    dispose() {
      // a walk that ends while she rides: set her down on a free spot, the fair she found put back (only if it is still ours)
      const s = hookSession;
      if (mode === 'riding' && s?.cat && lastPlayer) getOut(s.cat, lastPlayer, s);
      if (s && installed) {
        if (s.perched === seatRec) { s.perched = null; s.perchHold = null; }
        if (s.fair && s.fair.update === hooks.update) s.fair = hookOrig;
      }
      installed = false;
      scene.remove(mobile);
      mobile.geometry.dispose();
      for (const m of Object.values(Mat)) m.dispose?.();
    },
  };
  api.slots = {
    riding: { promptAt: (p) => (mode === 'riding' ? api.promptAt(p) : null), interact: () => api.interact() },
    mobile: { promptAt: (p) => (mode === 'riding' ? null : api.promptAt(p)), interact: () => api.interact() },
  };
  place();
  return api;
}
