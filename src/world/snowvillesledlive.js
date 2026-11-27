// =============================================================================
// THE SLED RUN ON A WALK (Snowville, round two). A friendly wooden sled waits at the top of the sled hill. Stand beside it: "Take the sled down the hill". She sits on it (the walk's own sit pose:
// no new cat triangles) and it runs down the packed-snow track by world/pathride.js (the sled spec on an open run: 2.4 to 5.6 m/s, 1.5 m either side of the line). The stick only nudges its speed and
// steers her side to side inside the track; there is no way off it and no way to be stuck: the run always ends at the landing (the slowest speed still finishes it in under ten seconds) and sets her
// down on the nearest free spot, with a cheer; the sled then slides itself back up to the top. The action button again, anywhere on the run, is "Hop off": onto the nearest of the precomputed free
// spots (a test floods each). A walk that ends while she rides sets her down on a free spot. A few pale speed lines stream past her while she rides (held still in reduced motion; the sled still moves).
//
// HOW IT HOOKS IN (the Moon's sled's way, moonsledlive.js): on its first frame the live swaps the walk's `session.fair` for a copy with its own update, late, jump, pawKind, canBoard and groundSpot, which hand
// over to whatever fair was there while she is not on the sled; puts `session.perched` on the seat record, sets the player's perchY and carries the camera (pulled a little out and up). At the end of the walk the
// walk's own fair is put back. CO-WALK: `session.fair.riding = { id: 'snow-sled' }` (a partner sees her seated, her height from the seat); one seat; nothing is saved. Draws no random number and reads no clock of
// its own (a walk second).
// =============================================================================
import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { createPathRide, stepPath, hopOffSpot } from './pathride.js';
import * as P from './snowvilleplan.js';
import * as S from './snowvillesledplan.js';
import { buildSled, buildSpeedLines, lineSpot } from './snowvillesledparts.js';
import { snowvilleMaterials } from './snowvilleparts.js';
import { isLowTier } from './snowvillelight.js';
import './snowvillesledwords.js';

export const SEAT_FRAME = Object.freeze({ camOut: 0.4, camUp: 0.45, camEase: 2.4, lead: 1.5 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: true });

/** createSledLive({ scene, reducedMotion, tier }) -> { sled, lines, promptAt, interact, frame, hooks, install, riding, state, slots, dispose }. */
export function createSledLive(ctx) {
  const { scene, reducedMotion = false } = ctx;
  const M = snowvilleMaterials();
  const sled = buildSled(M);
  const nLines = isLowTier(ctx.tier ?? null) ? S.SPEED_LINES.low : S.SPEED_LINES.high;
  const lines = buildSpeedLines(nLines);
  scene.add(sled, lines);

  let ground = null;
  const gy = (x, z) => (ground ? ground.y(x, z) : P.snowY(x, z));
  let ride = createPathRide(S.RUN_PATH, S.RUN_SPEC, 0);
  let mode = 'parked'; // 'parked' (at the top), 'riding' (she is on it), 'home' (sliding back up on its own)
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
  let ridden = 0;
  let lastPlayer = null;
  let backS = 0;
  const seatRec = { x: 0, z: 0, y: S.SLED.seatY + S.SLED.lift, yaw: 0, pose: 'requestPet', ride: false };
  const before = new THREE.Vector3();

  function place() {
    const y = gy(ride.x, ride.z) + S.SLED.lift * 0.5;
    sled.position.set(ride.x, y, ride.z);
    sled.rotation.set(0, ride.heading, 0);
    // a gentle lean into a turn: none in reduced motion
    sled.rotation.z = reducedMotion ? 0 : -0.05 * Math.sin(clock * 3.1) * Math.min(1, ride.v / 4);
    lines.visible = mode === 'riding';
    if (mode === 'riding') lines.material.opacity = 0.3 * Math.min(1, ride.v / S.RUN_SPEC.vMax + 0.3);
  }

  // The lines are one mesh of unit-length boxes along +z; each is laid by scale and position (a matrix per frame would be nine allocations: the mesh's own buffer is rewritten instead).
  const base = lines.geometry.attributes.position.array.slice();
  const perLine = base.length / nLines;
  function layLines() {
    if (mode !== 'riding') return;
    const a = lines.geometry.attributes.position.array;
    const sx = -Math.cos(ride.heading); const sz = Math.sin(ride.heading); // her right, in the world (pathride.js)
    const fx = Math.sin(ride.heading); const fz = Math.cos(ride.heading);
    const c = seatRec;
    const t = reducedMotion ? 0 : clock;
    for (let i = 0; i < nLines; i++) {
      const sp = lineSpot(i, nLines, t, ride.v);
      const gyc = gy(c.x, c.z);
      for (let k = 0; k < perLine; k += 3) {
        const o = i * perLine + k;
        const bx = base[o]; const by = base[o + 1]; const bz = base[o + 2]; // a unit box of 0.012 x 0.012 x 1, centred on the origin
        const along = bz * sp.len + sp.ahead;
        a[o] = c.x + sx * (sp.lat + bx) + fx * along;
        a[o + 1] = gyc + sp.y + by;
        a[o + 2] = c.z + sz * (sp.lat + bx) + fz * along;
      }
    }
    lines.geometry.attributes.position.needsUpdate = true;
  }

  const parkNow = () => { ride = createPathRide(S.RUN_PATH, S.RUN_SPEC, 0); mode = 'parked'; };

  // ---- the walk's hooks (session.fair) ---------------------------------------------------------------------------------------
  function seatCat(cat, player, session) {
    seatRec.x = ride.x;
    seatRec.z = ride.z;
    seatRec.y = S.SLED.seatY + S.SLED.lift;
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
    player.halt?.();
    session.perched = seatRec;
    if (session.fair) session.fair.riding = { id: 'snow-sled' };
    seatCat(cat, player, session);
  }

  function getOut(cat, player, session, spots = S.HOP_SPOTS, cheer = false) {
    const to = hopOffSpot(ride, spots);
    backS = ride.s;
    mode = 'home';
    session.perched = null;
    session.perchHold = null;
    if (session.fair) session.fair.riding = null;
    player.perchY = 0;
    cat.position.set(to.x, gy(to.x, to.z), to.z);
    cat.rotation.set(0, ride.heading + Math.PI, 0);
    player.halt?.();
    if (cheer) say('snowville-sled-land', phrase('snowville.sled.land'));
    ridden++;
  }

  // one step: her stick while she rides; while it slides home the sled goes back up the run by itself and settles at the top
  function advance(dt, input, cat, player, session) {
    if (mode === 'riding') {
      ride = stepPath(ride, input, dt, S.RUN_SPEC, S.RUN_PATH);
      if (ride.s >= S.RUN_LEN - S.FINISH && cat) getOut(cat, player, session, S.HOP_SPOTS, true); // the run's end: set down at the landing, with a cheer
    } else if (mode === 'home') {
      backS = Math.max(0, backS - S.RETURN_SPEED * dt);
      const p = S.runPos(backS, 0);
      ride = { ...ride, s: backS, v: 0, lat: 0, x: p.x, z: p.z, heading: p.heading + Math.PI };
      if (backS <= 0) parkNow();
    }
  }

  function step(dt, cat, player, session) {
    let input = null;
    if (mode === 'riding' && player?.inputActive) {
      const d = player.inputDirection();
      const h = ride.heading;
      input = { fwd: d.x * Math.sin(h) + d.z * Math.cos(h), side: d.x * -Math.cos(h) + d.z * Math.sin(h) };
    }
    if (mode !== 'parked') advance(dt, input, cat, player, session);
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
        const lead = SEAT_FRAME.lead * camW * Math.min(1, ride.v / S.RUN_SPEC.vMax);
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
    if (mode === 'riding') return { kind: 'off', line: phrase('snowville.sled.off') };
    if (mode !== 'parked' || blocked(hookSession)) return null;
    return dist(catPos, ride) <= S.REACH && Math.abs((catPos.y ?? 0) - gy(ride.x, ride.z)) < 1.2 ? { kind: 'on', line: phrase('snowville.sled.board') } : null;
  }

  const api = {
    sled,
    lines,
    get riding() { return mode === 'riding'; },
    get mode() { return mode; },
    get ride() { return ride; },
    get rides() { return ridden; },
    hooks,
    install,
    get state() { return { mode, riding: mode === 'riding', camW, x: ride.x, z: ride.z, s: ride.s, v: ride.v, lat: ride.lat, rides: ridden }; },
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
    /** The area life's own frame: the walk's session and ground, the camera. */
    frame(dt, t, catPos, cam, session) {
      const d = dt > 0 ? dt : 0;
      clock += d;
      camera = cam ?? camera;
      if (session?.ground && !ground) ground = session.ground;
      if (session) install(session);
      if (!ticked && mode !== 'parked') advance(d, null, session?.cat ?? null, lastPlayer, session); // (the walk's hook did not run this frame: the sled still moves)
      ticked = false;
      place();
      layLines();
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
      scene.remove(sled, lines);
      sled.geometry.dispose(); lines.geometry.dispose(); lines.material.dispose();
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
