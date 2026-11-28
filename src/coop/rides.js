// Cat two on the rides of the Fairground (couch play M5(e)). The rides belong to cat one
// (src/fairlive.js moves her onto a seat through session.perched); cat two is a
// headless walker, so this file seats her through the SAME rules: the
// jumpTarget of the rides (src/fairsim.js) says which seat a press reaches and what a
// jump from a seat does, and the seat the other cat holds is passed as `taken`
// so two cats are two riders of one ride, never one seat. She sits where the
// seat is and is drawn there (remotecats.js seat ids), is put down the way the
// rides put cat one down (dismountSpot, the same hop), and nothing here writes
// the save, the discovery log or a ride event of its own: what a ride gives is the HOUSEHOLD's, so the walk hands in a `credit` ({ ride(id), lap() }, S5b) that sends the same
// events cat one's ride sends (game/fairplay.js): the journal page and the boat's paws are keyed by the walk's discovery log, so two cats on one ride or one after the other count once,
// and a boat swing both cats are on is paid by cat one's own event, never twice.
const SLACK = 0.6; // metres a jump reaches past a ride from outside it (fairsim.js RIDE.JUMP_SLACK)
const REACH_STAIR = 2.6; // metres across, from the ground or a landing to the next landing of the helter-skelter
const STAIR_STEP = 1.3; // metres up a jump climbs there (the landings are 1.2 apart)
const EARS_BACK = 0.8; // fairlive.js EARS_BACK: an ear laid back at the coaster drop and on the slide
const WOBBLE = 3; // fairsim.js RIDE.WOBBLE_TIME: seconds of a sway after the teacups
const hopTime = (h) => Math.min(0.9, 0.28 + 0.05 * Math.max(0, h)); // fairlive.js hopDownTime

export function createRides() {
  let seat = null; // a ride seat she is on
  let perch = null; // one of the perches of the area (the boarding deck of the wheel, the platform of the coaster)
  let last = null; // the seat she last hopped from
  let wob = 0; // seconds of the teacup sway left (drawn only)
  let swayed = false; // the sway has touched her picture, so it is put straight once
  let credit = null; // { ride(id), lap() } the household's own award calls (set by attach)
  let rode = null; // the ride she has been credited on this boarding
  let swung = false; // on the boat and it has swung since she got on
  let hold = false; // jumped on with the stick still held: it holds her until it is let go once
  const hop = { on: false, u: 0, dur: 0.3, x0: 0, z0: 0, x1: 0, z1: 0, h0: 0 };
  const at = { x: 0, y: 0, z: 0 };
  const push = { x: 0, z: 0 };

  const api = {
    get seat() { return seat; },
    /** Up on a ride, its deck or the hop down: the stick is not walking her. */
    get busy() { return !!seat || !!perch || hop.on; },
    /** The seat cat one's jump keeps clear (and the wheel's lookout, a seat like any other). */
    attach(s, c = null) { credit = c; s.fair?.friendSeat?.(() => seat); },
    detach(s) { s?.fair?.friendSeat?.(null); seat = null; perch = null; last = null; hop.on = false; wob = 0; credit = null; rode = null; swung = false; },

    /** The picture of cat two after the remote cats are drawn: ears back where the ride is fast, the sway after a teacup. Visual only. */
    look(dt, t, s, group) {
      if (!group || s.reducedMotion) return;
      const parts = group.userData?.parts;
      if (seat?.ears && parts?.earL && parts?.earR && group.userData.breed !== 'hagrid') { parts.earL.rotation.z = EARS_BACK; parts.earR.rotation.z = -EARS_BACK; }
      if (wob > 0) {
        wob = Math.max(0, wob - dt);
        if (!seat && !perch && !hop.on) { group.rotation.z = Math.sin(t * 7.5) * 0.2 * (wob / WOBBLE); swayed = true; return; }
      }
      if (swayed) { group.rotation.z = 0; swayed = false; }
    },

    /** Cat two's jump press: true when a ride took it. */
    jump(s, mover) {
      const sim = s.fair?.sim;
      if (!sim) return false;
      if (hop.on) return true;
      const b = mover.body, pl = mover.player;
      at.x = b.position.x; at.z = b.position.z; at.y = pl.perchY ?? 0;
      const from = seat ?? perch;
      if (!seat && helter(s, mover, at, sim)) return true;
      const t = sim.jumpTarget(at, from, last, SLACK, s.fair.riding);
      if (!t) return false;
      if (t.type === 'board' || t.type === 'hop') {
        last = t.type === 'hop' ? seat : null;
        seat = t.seat; perch = null;
        hold = pl.inputActive;
        if (seat.seatKind === 'car') sim.departNow();
        return true;
      }
      if (t.type === 'stay') return true;
      if (t.type === 'static') { perch = t.perch; seat = null; last = null; hold = pl.inputActive; return true; }
      if (t.type === 'off' && (seat || perch)) { down(s, mover); return true; }
      return false;
    },

    /** Once a frame before her own step: returns true while she is carried (her step is skipped). */
    frame(dt, s, mover) {
      const b = mover.body, pl = mover.player;
      const gy = (x, z) => (s.ground.flat ? 0 : s.ground.y(x, z));
      if (hop.on) {
        hop.u = Math.min(1, hop.u + dt / hop.dur);
        const k = hop.u * hop.u * (3 - 2 * hop.u);
        const x = hop.x0 + (hop.x1 - hop.x0) * k, z = hop.z0 + (hop.z1 - hop.z0) * k, y = hop.h0 * (1 - hop.u * hop.u);
        b.position.set(x, gy(x, z) + y, z);
        pl.perchY = y;
        if (hop.u >= 1) { hop.on = false; pl.perchY = 0; pl.halt?.(); }
        return true;
      }
      if (!seat) { rode = null; swung = false; }
      if (!seat && !perch) return false;
      if (seat && credit) {
        if (rode !== seat.rideId) { rode = seat.rideId; credit.ride(rode); }
        if (seat.rideId === 'boat') {
          if (!sim0(s).boat.calm) swung = true;
          else if (swung) { swung = false; if (s.fair.riding?.rideId !== 'boat') credit.lap(); }
        }
      }
      if (seat === sim0(s).slide.chute) { // on the slide nothing takes her off half way down; at the end she sits on the mat
        if (sim0(s).slide.done) { sim0(s).endSlide(); seat = sim0(s).slide.mat; hold = pl.inputActive; }
      } else if (!pl.inputActive) hold = false;
      else if (!hold) { down(s, mover); return true; } // a pushed stick takes her off, as it does cat one
      const on = seat ?? perch;
      pl.perchY = on.y;
      b.position.set(on.x, gy(on.x, on.z) + on.y, on.z);
      if (seat) b.rotation.y = seat.yaw;
      pl.halt?.();
      return true;
    },
  };

  const sim0 = (s) => s.fair.sim;

  // The helter-skelter on foot: a jump from the ground or a landing climbs to the highest landing in reach (the stairs inside are
  // the perches of the area, which cat two does not use), and a jump on the gallery starts the slide, if the chute is free.
  function helter(s, mover, from, sim) {
    const a = s.areaData?.anchors, top = a?.helterTop;
    if (!top || !a.helterStairs) return false;
    if (perch === top) {
      if (sim.slide.t0 !== null) return true; // the chute is in use (cat one is on it): she waits on the gallery
      sim.startSlide(); seat = sim.slide.chute; perch = null; last = null; hold = true;
      return true;
    }
    let best = null;
    for (const p of [...a.helterStairs, top]) {
      if (p === perch || p.y <= from.y + 0.05 || p.y - from.y > STAIR_STEP) continue;
      if (Math.hypot(p.x - from.x, p.z - from.z) > REACH_STAIR) continue;
      if (!best || p.y > best.y) best = p;
    }
    if (!best) return false;
    perch = best; hold = mover.player.inputActive;
    return true;
  }

  function down(s, mover) {
    const pl = mover.player, from = seat ?? perch;
    const d = pl.inputActive ? pl.inputDirection?.() ?? null : null;
    push.x = d ? d.x : 0; push.z = d ? d.z : 0;
    const to = s.fair.sim.dismountSpot(from, push, s.fair.env);
    hop.on = true; hop.u = 0; hop.x0 = from.x; hop.z0 = from.z; hop.h0 = from.y; hop.x1 = to.x; hop.z1 = to.z;
    hop.dur = hopTime(from.y);
    if (from.seatKind === 'cup') wob = WOBBLE;
    seat = null; perch = null; last = null;
  }
  return api;
}
