// =============================================================================
// THE FAIRGROUND'S RIDES, AS NUMBERS (docs/superpowers/specs/2026-11-18-fairground-design.md,
// step 2). Where every ride is at a given time, which seat a jump reaches, and
// where a cat that gets off comes down. No THREE, no Math.random, no clock of
// its own: src/fairlive.js hands it the time and draws what it says.
//
// THE CLOCK. Every ride is a pure function of one number, T, in seconds:
// setTime(T) puts every seat where it is at T, and the same T gives the same
// fair on any device. (fairlive.js feeds it the time of day, so two devices
// agree with no messages.) Nothing accumulates from frame to frame.
//
// A SEAT is a perch record (src/climbing.js's shape: x, z, y, kind) that this
// file moves. While the walk's session.perched is one, fairlive.js carries
// the cat on it, as src/farmanimals.js carries her on a cow's back. Seats are
// NOT in the area's `perches`: which seat a jump reaches is jumpTarget's rule
// here, because a ride's rules are its own (a horse only from the platform, a
// coaster car only while the train is slow).
//
// NOTHING HERE CAN HOLD HER. Every seat has a way off at every moment
// (dismountSpot: free ground inside the bounds, clear of colliders, water and
// everything a ride sweeps over), except the helter-skelter's slide, which is
// over in a few seconds and ends on its mat.
// =============================================================================

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// player.js's CAT_RADIUS (not imported: player.js loads THREE).
export const CAT_RADIUS = 0.35;

export const RIDE_IDS = Object.freeze(['mgr']);

export const RIDE = Object.freeze({
  // ---- the merry-go-round ----
  MGR_TURN: 13,        // seconds for one turn of the platform
  MGR_BOB: 3.25,       // seconds for a horse to rise and fall (a quarter of a turn)
  MGR_DRUM: 4,         // seconds for one turn of the music box's drum
  MGR_DECK_R: 4.1,     // where the cat stands on the platform: outside the outer horses, inside the rim
  MGR_DECK_SPOTS: 16,  // close enough together that one is always in reach of a cat beside the ride
  // A jump's reach, in metres. From the ground she reaches the platform; a
  // horse is reached from the platform or from another horse.
  REACH_DECK: 1.6,
  REACH_HORSE: 2.75,
  // A hop to a seat ahead (the way the ride turns) is preferred by this much,
  // so hopping again and again works round the ride instead of to and fro.
  AHEAD: 0.6,
  // ---- getting off ----
  LAND_MARGIN: 0.1,    // clear of every collider by the cat's radius and this
  BOUNDS_MARGIN: 0.5,
  WATER_MARGIN: 0.4,
});

// A seat is a perch record: x, z, y are where the cat's paws are; `ride` is
// what game/avatar.js reads to let her nap on it; `fair` marks it ours.
function makeSeat(id, rideId, seatKind, index, more) {
  return { id, rideId, seatKind, index, x: 0, y: 0, z: 0, yaw: 0, kind: 'prop', ride: 'fair', fair: true, ...more };
}

// The angles of the search for a landing spot: straight on first, then
// alternately either side, round to straight back.
const FAN = (() => {
  const out = [0];
  for (let k = 1; k <= 8; k++) { out.push((k * TAU) / 16); if (k < 8) out.push((-k * TAU) / 16); }
  return Object.freeze(out);
})();

// createFairSim(area) → the rides of one walk.
//   area   src/world/fair.js's record: rides, anchors, colliders, bounds, waters, perches.
// Read once, while the models stand as they were built (the horses' places,
// the gondolas' angles); nothing of the models is kept but numbers.
export function createFairSim(area) {
  const R = area.rides;
  const seats = [];
  const angles = { mgr: 0, mgrDrum: 0, mgrBob: new Float64Array(R.merryGoRound.horses.length) };

  // ---- the merry-go-round ---------------------------------------------------------
  const mgr = (() => {
    const g = R.merryGoRound;
    const cx = g.group.position.x;
    const cz = g.group.position.z;
    const deckY = g.horses[0].position.y;
    const horses = g.horses.map((h, i) => makeSeat(`mgr-horse-${i}`, 'mgr', 'horse', i, {
      a: h.userData.place.angle, r: h.userData.place.radius, phase: h.userData.place.phase, baseY: deckY + h.userData.seat.y,
    }));
    // Standing spots on the platform, all the way round its edge. She stands
    // (pose 'follow'), she does not sit.
    const deck = Array.from({ length: RIDE.MGR_DECK_SPOTS }, (_, i) => makeSeat(`mgr-deck-${i}`, 'mgr', 'deck', i, {
      a: ((i + 0.5) * TAU) / RIDE.MGR_DECK_SPOTS, r: RIDE.MGR_DECK_R, phase: 0, baseY: deckY, pose: 'follow',
    }));
    // the plinth's edge: nothing lands inside it (its collider says the same)
    const baseR = Math.max(...area.colliders.filter((c) => c.x === cx && c.z === cz).map((c) => c.r), RIDE.MGR_DECK_R + 0.4);
    return { cx, cz, deckY, bob: g.bob, horses, deck, all: [...horses, ...deck], baseR };
  })();
  seats.push(...mgr.all);

  function setMgr(T) {
    const phi = -TAU * frac(T / RIDE.MGR_TURN);
    const bobAt = TAU * frac(T / RIDE.MGR_BOB);
    angles.mgr = phi;
    angles.mgrDrum = TAU * frac(T / RIDE.MGR_DRUM);
    for (let i = 0; i < mgr.all.length; i++) {
      const s = mgr.all[i];
      const at = s.a - phi;
      s.x = mgr.cx + Math.cos(at) * s.r;
      s.z = mgr.cz + Math.sin(at) * s.r;
      // facing the way the ride turns (the cat's model faces -z: a half turn from the horse's)
      s.yaw = phi - s.a + Math.PI;
      if (s.seatKind === 'horse') {
        const up = mgr.bob * Math.sin(bobAt + s.phase);
        angles.mgrBob[s.index] = up;
        s.y = s.baseY + up;
      } else {
        s.y = s.baseY;
      }
    }
  }

  let now = 0;
  function setTime(T) {
    now = Number.isFinite(T) ? T : 0;
    setMgr(now);
  }

  // ---- what a jump reaches -------------------------------------------------------
  const hit = { type: null, seat: null, perch: null };
  const answer = (type, seat = null, perch = null) => { hit.type = type; hit.seat = seat; hit.perch = perch; return hit; };
  const flat = (s, cat) => Math.hypot(s.x - cat.x, s.z - cat.z);

  // From one of the merry-go-round's seats: the best horse to hop to, or null.
  // `last` is the seat she hopped here from, which is not hopped straight back to.
  function nextHorse(from, last) {
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < mgr.horses.length; i++) {
      const h = mgr.horses[i];
      if (h === from || h === last) continue;
      const d = Math.hypot(h.x - from.x, h.z - from.z);
      if (d >= RIDE.REACH_HORSE) continue;
      const ahead = wrap(h.a - from.a) > 1e-6;
      const score = d - (ahead ? RIDE.AHEAD : 0);
      if (score < bestScore) { best = h; bestScore = score; }
    }
    return best;
  }

  // jumpTarget(cat, from, last) → what the jump button does now, or null when
  // no ride has anything to say (the game's ordinary jump then runs).
  //   cat    { x, y, z }: where her paws are (y: metres above the ground)
  //   from   the perch she is on (a seat of ours, one of the area's, or null)
  //   last   the seat she last hopped from, or null
  // The answer is ONE reused object: { type, seat, perch }.
  //   'board'   from the ground or an ordinary perch onto `seat`
  //   'hop'     from one seat to `seat`
  //   'off'     off the ride, to the ground
  function jumpTarget(cat, from, last = null) {
    if (from && from.fair) {
      if (from.rideId === 'mgr') {
        const h = nextHorse(from, last);
        return h ? answer('hop', h) : answer('off');
      }
      return answer('off');
    }
    // not on a ride: the nearest seat that can be boarded from here
    let best = null;
    let bestD = Infinity;
    if ((cat.y ?? 0) < mgr.deckY + 0.6) {
      for (let i = 0; i < mgr.deck.length; i++) {
        const d = flat(mgr.deck[i], cat);
        if (d < RIDE.REACH_DECK && d < bestD) { best = mgr.deck[i]; bestD = d; }
      }
    }
    return best ? answer('board', best) : null;
  }

  // ---- getting off ---------------------------------------------------------------
  // Whether (x, z) is under or in something a ride moves through: the
  // platform of the merry-go-round (its collider covers the same disc).
  function swept(x, z) {
    if (Math.hypot(x - mgr.cx, z - mgr.cz) < mgr.baseR + CAT_RADIUS) return true;
    return false;
  }

  const inBounds = (b, x, z, m) => !b || (x >= b.minX + m && x <= b.maxX - m && z >= b.minZ + m && z <= b.maxZ - m);
  function clearOf(colliders, x, z, need) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (Math.hypot(x - c.x, z - c.z) < c.r + need) return false;
    }
    return true;
  }
  // free(x, z, env): may a cat that gets off a ride come down here?
  //   env   { colliders, bounds, wet(x, z, margin) }: the walk's own lists
  //         (colliders grow as props are added) and its water test.
  function free(x, z, env) {
    return inBounds(env.bounds ?? area.bounds, x, z, RIDE.BOUNDS_MARGIN)
      && clearOf(env.colliders ?? area.colliders, x, z, CAT_RADIUS + RIDE.LAND_MARGIN)
      && !(env.wet && env.wet(x, z, RIDE.WATER_MARGIN))
      && !swept(x, z);
  }

  // The way off a seat when she has pushed no way herself: outwards.
  function awayFrom(seat, out) {
    if (seat.rideId === 'mgr') { out.x = seat.x - mgr.cx; out.z = seat.z - mgr.cz; }
    else { out.x = 0; out.z = 1; }
    return out;
  }

  const spot = { x: 0, z: 0, ok: false };
  const away = { x: 0, z: 0 };
  // dismountSpot(seat, toward, env) → { x, z, ok }: the nearest free ground to
  // the seat, looking first the way she pushed (`toward`, or outwards from the
  // ride). ONE reused object. `ok` is false only if nothing within 14 m is
  // free, which no seat of this fair can produce (test/fairsim.test.js).
  function dismountSpot(seat, toward, env = {}) {
    let tx = toward ? toward.x : 0;
    let tz = toward ? toward.z : 0;
    if (Math.hypot(tx, tz) < 1e-3) { awayFrom(seat, away); tx = away.x; tz = away.z; }
    const base = Math.atan2(tx, tz);
    for (let r = 0.6; r <= 14; r += 0.3) {
      for (let k = 0; k < FAN.length; k++) {
        const a = base + FAN[k];
        const x = seat.x + Math.sin(a) * r;
        const z = seat.z + Math.cos(a) * r;
        if (free(x, z, env)) { spot.x = x; spot.z = z; spot.ok = true; return spot; }
      }
    }
    spot.x = seat.x; spot.z = seat.z; spot.ok = false;
    return spot;
  }

  setTime(0);
  return {
    seats,
    angles,
    mgr,
    get time() { return now; },
    setTime,
    jumpTarget,
    dismountSpot,
    free,
    swept,
  };
}
