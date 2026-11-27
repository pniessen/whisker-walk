// Cat two on the rides of the Fairground (couch play M5(e)). The rides belong to cat one
// (src/fairlive.js moves her onto a seat through session.perched); cat two is a
// headless walker, so this file seats her through the SAME rules: the
// jumpTarget of the rides (src/fairsim.js) says which seat a press reaches and what a
// jump from a seat does, and the seat the other cat holds is passed as `taken`
// so two cats are two riders of one ride, never one seat. She sits where the
// seat is and is drawn there (remotecats.js seat ids), is put down the way the
// rides put cat one down (dismountSpot, the same hop), and nothing here writes
// the save, the discovery log or a ride event: a ride is for cat one to earn.
const SLACK = 0.6; // metres a jump reaches past a ride from outside it (fairsim.js RIDE.JUMP_SLACK)
const hopTime = (h) => Math.min(0.9, 0.28 + 0.05 * Math.max(0, h)); // fairlive.js hopDownTime

export function createRides() {
  let seat = null; // a ride seat she is on
  let perch = null; // one of the perches of the area (the boarding deck of the wheel, the platform of the coaster)
  let last = null; // the seat she last hopped from
  let hold = false; // jumped on with the stick still held: it holds her until it is let go once
  const hop = { on: false, u: 0, dur: 0.3, x0: 0, z0: 0, x1: 0, z1: 0, h0: 0 };
  const at = { x: 0, y: 0, z: 0 };
  const push = { x: 0, z: 0 };

  const api = {
    get seat() { return seat; },
    /** Up on a ride, its deck or the hop down: the stick is not walking her. */
    get busy() { return !!seat || !!perch || hop.on; },
    /** The seat cat one's jump keeps clear (and the wheel's lookout, a seat like any other). */
    attach(s) { s.fair?.friendSeat?.(() => seat); },
    detach(s) { s?.fair?.friendSeat?.(null); seat = null; perch = null; last = null; hop.on = false; },

    /** Cat two's jump press: true when a ride took it. */
    jump(s, mover) {
      const sim = s.fair?.sim;
      if (!sim) return false;
      if (hop.on) return true;
      const b = mover.body, pl = mover.player;
      at.x = b.position.x; at.z = b.position.z; at.y = pl.perchY ?? 0;
      const from = seat ?? perch;
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
      const on = seat ?? perch;
      if (!on) return false;
      if (!pl.inputActive) hold = false;
      else if (!hold) { down(s, mover); return true; } // a pushed stick takes her off, as it does cat one
      pl.perchY = on.y;
      b.position.set(on.x, gy(on.x, on.z) + on.y, on.z);
      if (seat) b.rotation.y = seat.yaw;
      pl.halt?.();
      return true;
    },
  };

  function down(s, mover) {
    const pl = mover.player, from = seat ?? perch;
    const d = pl.inputActive ? pl.inputDirection?.() ?? null : null;
    push.x = d ? d.x : 0; push.z = d ? d.z : 0;
    const to = s.fair.sim.dismountSpot(from, push, s.fair.env);
    hop.on = true; hop.u = 0; hop.x0 = from.x; hop.z0 = from.z; hop.h0 = from.y; hop.x1 = to.x; hop.z1 = to.z;
    hop.dur = hopTime(from.y);
    seat = null; perch = null; last = null;
  }
  return api;
}
