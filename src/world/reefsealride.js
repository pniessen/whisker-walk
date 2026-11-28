// =============================================================================
// THE REEF, THE SEAL RIDE ON A WALK. A free ride, no mission: swim up beside one of the two swimming seals and the action button offers "Ride the seal". She sits
// on its back (the walk's sit pose, swimming: no new cat triangles, no new seal triangles: the seals are the ones world/reefsealslive.js already draws) and the
// seal keeps to its own gentle circle through open water (its plan keeps it out of the coral, the rocks and the Sealab: world/reefseals.js settle()). The stick
// nudges the circle's middle (a few metres at most); the action button again is "Hop off", and a ride that lasts about 40 s ends by itself with a soft "Wheee!".
// ONE CAT PER SEAL: a seal with a rider is taken for the other cat too (a partner's 'seal-in' / 'seal-out' events through credit(); a claim from a partner that
// goes quiet lapses after a minute), and she can take the other seal. The first ride ever is a journal line (log.awardOnce) and a sighting of the seal's page.
//
// HOW IT HOOKS IN: the Moon rover's and the Reef mounts' way (reefridelive.js): this wraps the walk's `session.fair` (the mounts' copy, installed first), puts
// `session.perched` on the seat record (pose 'requestPet', `swim: true`) and carries the camera. It is never exclusive of anything: a mount's rider is already
// perched, so the offer is simply not made then. NEVER STUCK: one press anywhere hops off (onto the seabed under the seal, in the water that is just a float),
// the timer ends it, and a walk that ends or a place that changes (dispose) sets her down the same way; something else taking her off the seat ends it too.
// Reduced motion: the ridden seal still moves (it is the ride); the camera follow is the same. Draws no random number and reads no clock.
// =============================================================================
import { phrase } from '../clanphrases.js';
import './reefsealridewords.js';

export const SEAL_RIDE = Object.freeze({ reach: 3.6, seconds: 40, seatUp: 0.3, camOut: 0.35, camUp: 0.4, camEase: 2.4, friendLapse: 60, journalKey: 'reef-seal-ride', journalPage: 'rfseal' });
const SEAT_ID = 'reef-seal';

// createSealRide({ ride: sea.ride, reefY, player, say, log, progression, sendEvent }) -> { on, off, promptAt, interact, update, credit, hooks, install, state, dispose }
export function createSealRide(ctx) {
  const { ride, reefY, player: ctxPlayer = null } = ctx;
  const gy = (x, z) => reefY(x, z);
  let mine = -1; // the seal she rides, or -1
  let ridden = 0; // seconds on this ride
  let clock = 0;
  let want = null; // what the action button would do now: { kind: 'on', seal } | { kind: 'off' }
  let wantOn = -1;
  let wantOff = false;
  let camera = null;
  let camW = 0;
  let hookSession = null;
  let hookOrig = null;
  let installed = false;
  let told = false;
  const friends = {}; // seal index -> the clock at which a partner's claim lapses
  const seatRec = { x: 0, z: 0, y: 0.9, yaw: 0, pose: 'requestPet', swim: true, reefRide: true, ride: false };
  const before = { x: 0, y: 0, z: 0 };
  const spot = { x: 0, z: 0 };

  const lapse = () => { for (const k of Object.keys(friends)) if (clock > friends[k]) { ride.release(Number(k), 'friend'); delete friends[k]; } };
  const send = (ev) => { try { ctx.sendEvent?.(ev); } catch { /* no room */ } };

  function seatCat(cat, player, session) {
    const v = ride.pose(mine);
    const y = v.y + SEAL_RIDE.seatUp * v.size;
    seatRec.x = v.x;
    seatRec.z = v.z;
    seatRec.y = Math.max(0.05, y - gy(v.x, v.z)); // never 0: perchY 0 would turn the float and the collider push back on
    seatRec.yaw = v.yaw + Math.PI;
    session.perched = seatRec;
    session.perchHold = seatRec;
    player.perchY = seatRec.y;
    cat.position.set(v.x, y, v.z);
    cat.rotation.y = v.yaw + Math.PI;
    session.idleTime = 0;
  }

  const blocked = (session) => !!session?.perched; // a mount's rider (or anyone on a perch) is not offered a seal

  function board(i, cat, player, session) {
    if (!ride.hold(i, 'me')) return false;
    mine = i;
    ridden = 0;
    player.halt?.();
    player.clearFloat?.();
    session.perched = seatRec;
    if (session.fair) session.fair.riding = { id: SEAT_ID, rideId: 'reef' };
    seatCat(cat, player, session);
    send({ kind: 'seal-in', seal: i });
    if (!told) {
      told = true;
      try {
        ctx.log?.awardOnce?.('reeffind', SEAL_RIDE.journalKey, phrase('reef.sealride.find'));
        ctx.progression?.recordSighting?.(SEAL_RIDE.journalPage);
      } catch { /* a stand-in save */ }
    }
    ctx.say?.(phrase('reef.sealride.tip'));
    return true;
  }

  // Off the seal: the cat stays where she is (in the water a float, one metre over the seabed at least), nothing is left held.
  function getOut(cat, player, session, soft = false) {
    const i = mine;
    mine = -1;
    ridden = 0;
    ride.release(i, 'me');
    if (session) {
      if (session.perched === seatRec) session.perched = null;
      if (session.perchHold === seatRec) session.perchHold = null;
      if (session.fair?.riding?.id === SEAT_ID) session.fair.riding = null;
    }
    if (player) player.perchY = 0;
    if (cat) {
      const x = cat.position.x; const z = cat.position.z;
      cat.position.set(x, Math.max(cat.position.y, gy(x, z) + 0.05), z);
    }
    player?.halt?.();
    send({ kind: 'seal-out', seal: i });
    if (soft) ctx.say?.(phrase('reef.sealride.end'));
  }

  function drive(dt, cat, player, session) {
    before.x = cat.position.x; before.y = cat.position.y; before.z = cat.position.z;
    ridden += dt;
    if (player.inputActive) { const d = player.inputDirection(); ride.steer(mine, d.x, d.z, dt); }
    seatCat(cat, player, session);
    if (camera) {
      camera.position.set(camera.position.x + cat.position.x - before.x, camera.position.y + cat.position.y - before.y, camera.position.z + cat.position.z - before.z);
      camW += (1 - camW) * Math.min(1, dt * SEAL_RIDE.camEase);
      applyCamera(cat.position, ride.pose(mine));
    }
  }

  function applyCamera(c, v) {
    if (!camera || !c) return;
    const out = 1 + SEAL_RIDE.camOut * camW;
    camera.position.set(c.x + (camera.position.x - c.x) * out, c.y + (camera.position.y - c.y) * out + SEAL_RIDE.camUp * camW, c.z + (camera.position.z - c.z) * out);
    const floor = gy(camera.position.x, camera.position.z) + 0.7;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(c.x + Math.sin(v.yaw) * 1.0, c.y + 0.5, c.z + Math.cos(v.yaw) * 1.0);
  }

  const step = (dt, { cat, player, session }) => {
    if (!installed) return;
    if (mine >= 0 && session.perched !== seatRec) { getOut(cat, player, session); return; } // something else took her off the seat
    if (wantOn >= 0 && mine < 0) { const i = wantOn; wantOn = -1; if (!blocked(session)) board(i, cat, player, session); }
    if (wantOff && mine >= 0) { wantOff = false; getOut(cat, player, session); }
    wantOn = -1;
    wantOff = false;
    if (mine >= 0) {
      drive(dt, cat, player, session);
      if (ridden >= SEAL_RIDE.seconds) getOut(cat, player, session, true);
    } else if (camW > 0) {
      camW = Math.max(0, camW - dt * SEAL_RIDE.camEase * (camW + 0.3));
      if (camW < 0.004) camW = 0;
    }
  };
  const hooks = {
    update(dt, t, c) { hookOrig?.update?.(dt, t, c); step(dt > 0 ? Math.min(dt, 0.25) : 0, c); },
    late(dt, t, c) { hookOrig?.late?.(dt, t, c); if (mine >= 0 && c.session) c.session.perchHold = seatRec; },
    jump(c) { return mine >= 0 ? false : (hookOrig?.jump?.(c) ?? false); },
    pawKind(...a) { return mine >= 0 ? 'none' : (hookOrig?.pawKind?.(...a) ?? null); },
    groundSpot() {
      if (mine < 0) return hookOrig?.groundSpot?.() ?? null;
      const v = ride.pose(mine);
      spot.x = v.x; spot.z = v.z;
      return spot;
    },
  };

  function install(session) {
    if (installed || !session) return;
    hookSession = session;
    hookOrig = session.fair ?? null;
    session.fair = { ...(hookOrig ?? {}), ...hooks };
    installed = true;
  }

  // The two prompt sources: `off` is asked first (while she rides, nothing else may hide "Hop off"), `on` is asked last (the Sealab's hatch, a chest and Marlo win).
  const decideOn = (catPos) => {
    if (!catPos || mine >= 0 || blocked(hookSession)) return null;
    const i = ride.near(catPos, SEAL_RIDE.reach);
    return i >= 0 ? { kind: 'on', seal: i, line: phrase('reef.sealride.on') } : null;
  };
  const press = () => {
    const w = want;
    want = null;
    if (!w) return null;
    if (w.kind === 'on') wantOn = w.seal; else wantOff = true;
    return w.kind;
  };
  const offSource = { promptAt() { want = mine >= 0 ? { kind: 'off', line: phrase('reef.sealride.off') } : null; return want ? want.line : null; }, interact: press };
  const onSource = { promptAt(catPos) { want = decideOn(catPos); return want ? want.line : null; }, interact: press };

  return {
    on: onSource,
    off: offSource,
    hooks,
    install,
    get riding() { return mine >= 0; },
    get state() { return { riding: mine >= 0, seal: mine, ridden, camW }; },
    promptAt(catPos) { return offSource.promptAt() ?? onSource.promptAt(catPos); },
    interact: press,
    update(dt, t, catPos, cam, session) {
      clock += dt > 0 ? dt : 0;
      camera = cam ?? camera;
      if (session) install(session);
      lapse();
    },
    // a partner's ride: 'seal-in' takes a seal for them, 'seal-out' gives it back; a seal she holds herself stays hers
    credit(ev) {
      if (!ev || typeof ev !== 'object') return null;
      const i = ev.seal;
      if (!Number.isInteger(i) || i < 0 || i >= ride.count) return null;
      if (ev.kind === 'seal-in') {
        if (!ride.hold(i, 'friend')) return null;
        friends[i] = clock + SEAL_RIDE.friendLapse;
        return 'in';
      }
      if (ev.kind === 'seal-out') {
        if (!ride.release(i, 'friend')) return null;
        delete friends[i];
        return 'out';
      }
      return null;
    },
    dispose() {
      const s = hookSession;
      if (mine >= 0) getOut(s?.cat ?? null, ctxPlayer, s);
      for (const k of Object.keys(friends)) ride.release(Number(k), 'friend');
      if (s && installed) {
        if (s.perched === seatRec) { s.perched = null; s.perchHold = null; }
        if (s.fair?.riding?.id === SEAT_ID) s.fair.riding = null;
        if (s.fair && s.fair !== hookOrig && hookOrig) s.fair = hookOrig;
      }
      installed = false;
    },
  };
}
