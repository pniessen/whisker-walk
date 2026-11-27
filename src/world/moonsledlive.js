// =============================================================================
// THE MOON'S SLED ON A WALK (milestone M2). A friendly hover sled waits in its rack at about (14, 46.6). Stand beside it: "Hop on the moon sled". She sits on it (the walk's own sit pose:
// no new cat triangles) and it glides round the closed lane by world/pathride.js (the spec sled: 3 to 8 m/s, 1.5 m either side of the line, loops). The stick only nudges its speed and
// steers her side to side inside the lane; there is no way off the lane and no way to be stuck. The action button again, anywhere, is "Hop off": onto the nearest of the precomputed free
// spots (a test floods each); the sled then glides on by itself and settles back in its rack. Each full round is "Laps N", a gentle count: no timer, no best time, nothing to fail. A walk
// that ends while she rides sets her down on a free spot. The Moon's low gravity is in the player's physics; the sled glides a little over the dust with a small bob (none in reduced motion).
//
// HOW IT HOOKS IN (the Crystal river boat and cart's way, crystalcartlive.js; Dot's, moonroverlive.js): on its first frame the live swaps the walk's `session.fair` for a copy with its own update,
// late, jump, pawKind and groundSpot, which hand over to whatever fair was there (Dot's) while she is not on the sled; puts `session.perched` on the seat record, sets the player's perchY and
// carries the camera (pulled a little out and up). At the end of the walk the walk's own fair is put back (the sled is taken down before Dot is, so the chain unwinds in order).
// CO-WALK: `session.fair.riding = { id: 'moon-sled' }`; one seat, nothing is saved (journal counts only: mnsled on the first ride of a walk, mnlap on the first full round).
// Draws no random number and reads no clock of its own (a walk second). Reduced motion adds nothing: the sled still moves; no bob, the glow holds still.
// =============================================================================
import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { createPathRide, stepPath, hopOffSpot } from './pathride.js';
import { moonY, MOON_CLEARS } from './moonplan.js';
import { moonMaterials } from './moonparts.js';
import * as S from './moonsledplan.js';
import { drawRack, drawSled, drawLamps } from './moonsledparts.js';
import './moonsledwords.js';

export const SEAT_FRAME = Object.freeze({ camOut: 0.4, camUp: 0.45, camEase: 2.4, lead: 1.6 });
export const GLOW = Object.freeze({ lo: 0.78, still: 0.9, period: 2.8 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** createSledLive({ scene, reducedMotion, tier, colliders, spot, clear }) -> { group, slots, promptAt, interact, frame, hooks, install, riding, state, dispose }. `clear(rect)` shrinks the rocks already drawn there. */
export function createSledLive(ctx) {
  const { scene, reducedMotion = false } = ctx;
  const lite = ctx.tier?.shadows === false;
  const colliders = ctx.colliders ?? [];
  const M = moonMaterials();
  const first = createPathRide(S.LANE_PATH, S.SLED_SPEC, 0); // the sled in its rack: the rack is drawn facing the way the lane runs there
  const rack = drawRack(M, first.heading, { lite });
  const sled = drawSled(M, { lite });
  const lamps = drawLamps(M, { lite });
  const group = new THREE.Group();
  group.name = 'moon:sledlane';
  group.add(rack, sled, lamps);
  scene.add(group);
  if (!MOON_CLEARS.includes(S.CLEAR)) MOON_CLEARS.push(S.CLEAR); // (a later build leaves these rocks out; the ones drawn already are shrunk by `clear` below)
  ctx.clear?.(S.CLEAR);

  const posts = [-1, 1].map((k) => ({ x: Math.round((S.RACK.x + Math.cos(first.heading) * S.RACK.postGap * k) * 100) / 100, z: Math.round((S.RACK.z - Math.sin(first.heading) * S.RACK.postGap * k) * 100) / 100, r: S.RACK.postR + 0.05, sledRack: true }));
  const parkCol = { x: S.RACK.x, z: S.RACK.z, r: S.RACK.park, sledPark: true };
  const setParked = (on) => {
    const i = colliders.indexOf(parkCol);
    if (on && i < 0) colliders.push(parkCol); else if (!on && i >= 0) colliders.splice(i, 1);
  };
  colliders.push(...posts);
  setParked(true);

  let ground = null;
  const gy = (x, z) => (ground ? ground.y(x, z) : moonY(x, z));
  let progression = null;
  let ride = first;
  let mode = 'parked'; // 'parked' (in the rack), 'riding' (she is on it), 'home' (gliding back to the rack on its own)
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
  let rodeOnce = false;
  let lapDist = 0;
  let laps = 0;
  let lastPlayer = null;
  const seatRec = { x: 0, z: 0, y: S.SLED.seatY + S.SLED.lift, yaw: 0, pose: 'requestPet', ride: false };
  const before = new THREE.Vector3();
  const label = phrase('moon.ws.sled.name');
  const view = { type: S.SPOT.type, label, pos: new THREE.Vector3(S.RACK.x, S.SPOT.up, S.RACK.z), range: S.SPOT.range };
  ctx.spot?.push(view);
  const bob = () => (reducedMotion ? 0 : S.SLED.bob * Math.sin(clock * 2.4));

  function place() {
    const y = gy(ride.x, ride.z) + S.SLED.lift + bob();
    sled.position.set(ride.x, y, ride.z);
    sled.rotation.set(0, ride.heading, 0);
    M.glow.color.setScalar(reducedMotion ? GLOW.still : GLOW.lo + (1 - GLOW.lo) * (0.5 + 0.5 * Math.sin((clock / GLOW.period) * Math.PI * 2)));
    view.pos.set(ride.x, y + S.SPOT.up, ride.z);
  }

  const parkNow = () => { ride = createPathRide(S.LANE_PATH, S.SLED_SPEC, 0); mode = 'parked'; setParked(true); };

  // ---- the walk's hooks (session.fair) ---------------------------------------------------------------------------------------
  function seatCat(cat, player, session) {
    seatRec.x = ride.x;
    seatRec.z = ride.z;
    seatRec.y = S.SLED.seatY + S.SLED.lift + bob();
    seatRec.yaw = ride.heading + Math.PI;
    session.perched = seatRec;
    session.perchHold = seatRec;
    player.perchY = seatRec.y;
    cat.position.set(ride.x - Math.sin(ride.heading) * 0.1, gy(ride.x, ride.z) + seatRec.y, ride.z - Math.cos(ride.heading) * 0.1);
    cat.rotation.y = ride.heading + Math.PI;
    session.idleTime = 0;
  }

  const blocked = (session) => !!session?.perched;

  function board(cat, player, session) {
    mode = 'riding';
    setParked(false);
    lapDist = 0;
    player.halt?.();
    session.perched = seatRec;
    if (session.fair) session.fair.riding = { id: 'moon-sled' };
    seatCat(cat, player, session);
    if (!rodeOnce) { rodeOnce = true; try { progression?.recordSighting?.('mnsled'); } catch { /* a stand-in save */ } }
  }

  function getOut(cat, player, session, spots = S.HOP_SPOTS) {
    const to = hopOffSpot(ride, spots);
    mode = 'home';
    session.perched = null;
    session.perchHold = null;
    if (session.fair) session.fair.riding = null;
    player.perchY = 0;
    cat.position.set(to.x, gy(to.x, to.z), to.z);
    cat.rotation.set(0, ride.heading + Math.PI, 0);
    player.halt?.();
  }

  // one step of the sled along the lane: her stick while she rides, none while it glides home; counts the rounds and settles it in the rack
  function advance(dt, input) {
    const prevS = ride.s;
    const L = S.LANE_LEN;
    ride = stepPath(ride, input, dt, S.SLED_SPEC, S.LANE_PATH);
    if (mode === 'riding') {
      const d = (((ride.s - prevS) % L) + L) % L;
      if (d < L / 2) lapDist += d;
      while (lapDist >= L) {
        lapDist -= L;
        laps++;
        bus.emit('discovery', { type: 'greenhousenote', key: 'moon-sled-lap', label: `${phrase('moon.ws.sled.laps')} ${laps}`, points: 0, repeat: false });
        if (laps === 1) { try { progression?.recordSighting?.('mnlap'); } catch { /* a stand-in save */ } }
      }
    } else if (mode === 'home' && ride.s < prevS) parkNow(); // it crossed the rack's own point: it settles there
  }

  function step(dt, cat, player, session) {
    let input = null;
    if (mode === 'riding' && player?.inputActive) {
      const d = player.inputDirection();
      const h = ride.heading;
      input = { fwd: d.x * Math.sin(h) + d.z * Math.cos(h), side: d.x * -Math.cos(h) + d.z * Math.sin(h) };
    }
    if (mode !== 'parked') advance(dt, input);
    if (mode === 'riding') {
      before.copy(cat.position);
      seatCat(cat, player, session);
      if (camera) {
        camera.position.add(before.negate().add(cat.position));
        camW += (1 - camW) * Math.min(1, dt * SEAT_FRAME.camEase);
        const c = cat.position;
        const out = 1 + SEAT_FRAME.camOut * camW;
        const vx = camera.position.x - c.x, vy = camera.position.y - c.y, vz = camera.position.z - c.z;
        camera.position.set(c.x + vx * out, c.y + vy * out + SEAT_FRAME.camUp * camW, c.z + vz * out);
        const floor = gy(camera.position.x, camera.position.z) + 0.7;
        if (camera.position.y < floor) camera.position.y = floor;
        const lead = SEAT_FRAME.lead * camW * Math.min(1, ride.v / S.SLED_SPEC.vMax);
        camera.lookAt(c.x + Math.sin(ride.heading) * lead, c.y + 0.54, c.z + Math.cos(ride.heading) * lead);
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
      ticked = true;
      if (wantOn && mode === 'parked') { wantOn = false; if (!blocked(session)) board(cat, player, session); }
      if (wantOff && mode === 'riding') { wantOff = false; getOut(cat, player, session); }
      wantOn = false;
      wantOff = false;
      step(dt, cat, player, session);
      if (mode !== 'riding' && camW > 0) { camW = Math.max(0, camW - dt * SEAT_FRAME.camEase * (camW + 0.3)); if (camW < 0.004) camW = 0; }
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
      const to = hopOffSpot(ride, S.HOP_SPOTS); // a walk that ends on the sled is saved on a free spot
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
    if (mode === 'riding') return { kind: 'off', line: phrase('moon.ws.sled.off') };
    if (mode !== 'parked' || blocked(hookSession)) return null;
    return dist(catPos, ride) <= S.RACK.reach && Math.abs((catPos.y ?? 0) - gy(ride.x, ride.z)) < 1.2 ? { kind: 'on', line: phrase('moon.ws.sled.board') } : null;
  }

  const api = {
    group,
    get riding() { return mode === 'riding'; },
    get mode() { return mode; },
    get ride() { return ride; },
    get laps() { return laps; },
    hooks,
    install,
    spotView: view,
    get state() { return { mode, riding: mode === 'riding', camW, x: ride.x, z: ride.z, s: ride.s, v: ride.v, lat: ride.lat, laps, lapDist }; },
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
    /** The area life's own frame (after Dot's): the walk's session and ground, the camera and the save. */
    frame(dt, t, catPos, cam, session, prog) {
      const d = dt > 0 ? dt : 0;
      clock += d;
      camera = cam ?? camera;
      progression = prog ?? progression;
      if (session?.ground && !ground) ground = session.ground;
      if (session) install(session);
      if (!ticked && mode !== 'parked') advance(d, null); // (the walk's hook did not run this frame: the sled still moves)
      ticked = false;
      place();
    },
    dispose() {
      // a walk that ends while she rides: set her down on a free spot, the fair she found put back (only if it is still ours: Dot's own restore comes after)
      const s = hookSession;
      if (mode === 'riding' && s?.cat && lastPlayer) getOut(s.cat, lastPlayer, s);
      setParked(false);
      for (const p of posts) { const i = colliders.indexOf(p); if (i >= 0) colliders.splice(i, 1); }
      if (s && installed) {
        if (s.perched === seatRec) { s.perched = null; s.perchHold = null; }
        if (s.fair && s.fair.update === hooks.update) s.fair = hookOrig;
      }
      installed = false;
      const i = ctx.spot?.indexOf(view) ?? -1;
      if (i >= 0) ctx.spot.splice(i, 1);
      scene.remove(group);
      group.traverse((o) => { o.geometry?.dispose?.(); });
      for (const m of Object.values(M)) m.dispose?.();
    },
  };
  api.slots = {
    riding: { promptAt: (p) => (mode === 'riding' ? api.promptAt(p) : null), interact: () => api.interact() },
    sled: { promptAt: (p) => (mode === 'riding' ? null : api.promptAt(p)), interact: () => api.interact() },
  };
  place();
  return api;
}
