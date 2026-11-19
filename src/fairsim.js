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

export const RIDE_IDS = Object.freeze(['mgr', 'wheel', 'cups', 'slide']);

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
  // ---- the big wheel ----
  WHEEL_TURN: 56,      // seconds for one turn: slow enough to hop in as a gondola comes by
  // From the boarding deck (or the ground beside it) into the gondola passing
  // the bottom, and between the gondola at the top and the lookout: straight-
  // line distances, so a gondola is in reach only while it is passing.
  REACH_GONDOLA: 2.3,
  REACH_LOOKOUT: 3.0,
  GONDOLA_STEP_UP: 1.3, // a gondola higher above her than this has gone by
  // ---- the teacups ----
  CUPS_TURN: 18,       // seconds for one turn of the floor
  CUPS_SPIN: 4.5,      // seconds for one turn of a cup ON the floor, the other way (so 6 s a turn as the world sees it)
  REACH_CUP: 2.6,      // from the ground beside the ride into a cup passing the edge
  WOBBLE_TIME: 3,      // seconds of a sway in her walk after she gets out
  // ---- the helter-skelter ----
  SLIDE_TIME: 4.6,     // seconds from the gallery to the mat
  MAT_AHEAD: 0.78,     // the mat's middle, this far beyond the end of the chute (world/fairrides.js lays it there)
  MAT_Y: 0.1,          // the mat's top
  SLIDE_SWEEP: 0.9,    // nobody lands this near the low end of the chute
  // ---- getting off ----
  LAND_MARGIN: 0.1,    // clear of every collider by the cat's radius and this
  BOUNDS_MARGIN: 0.5,
  WATER_MARGIN: 0.4,
});

// A seat is a perch record: x, z, y are where the cat's paws are; `fair`
// marks it ours; `pose` is how she is drawn on it (game/avatar.js): sitting
// up, however long she stays (on a cow's back she would curl up and nap; on a
// ride she is wide awake).
function makeSeat(id, rideId, seatKind, index, more) {
  return { id, rideId, seatKind, index, x: 0, y: 0, z: 0, yaw: 0, kind: 'prop', ride: 'fair', fair: true, pose: 'perch', ...more };
}

// The angles of the search for a landing spot: straight on first, then
// alternately either side, round to straight back.
const FAN = (() => {
  const out = [0];
  for (let k = 1; k <= 8; k++) { out.push((k * TAU) / 16); if (k < 8) out.push((-k * TAU) / 16); }
  return Object.freeze(out);
})();
const FAN_AHEAD = 7; // the first seven: straight on, and up to 67.5 degrees either side

// createFairSim(area) → the rides of one walk.
//   area   src/world/fair.js's record: rides, anchors, colliders, bounds, waters, perches.
// Read once, while the models stand as they were built (the horses' places,
// the gondolas' angles); nothing of the models is kept but numbers.
export function createFairSim(area) {
  const R = area.rides;
  const seats = [];
  const angles = { mgr: 0, mgrDrum: 0, mgrBob: new Float64Array(R.merryGoRound.horses.length), wheel: 0, cups: 0, cupSpin: 0 };
  // One of the area's own perches, by where it is (the boarding deck, the coaster's platform).
  const areaPerch = (at) => (area.perches ?? []).find((p) => Math.abs(p.x - at.x) < 1e-6 && Math.abs(p.z - at.z) < 1e-6 && Math.abs(p.y - at.y) < 1e-6) ?? null;

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

  // ---- the big wheel ----------------------------------------------------------------
  // The wheel stands in the plane z = cz and turns about its hub. A gondola
  // hangs from the rim and stays upright, so its seat is always `drop` below
  // the rim. The LOOKOUT behind the top is a seat that does not move; the
  // boarding deck in front of the bottom is one of the area's own perches.
  const wheel = (() => {
    const g = R.wheel;
    const cx = g.group.position.x;
    const cz = g.group.position.z;
    const A = area.anchors;
    const gondolas = g.gondolas.map((gg, i) => makeSeat(`wheel-gondola-${i}`, 'wheel', 'gondola', i, {
      a: gg.userData.place.angle, drop: -gg.userData.seat.y,
    }));
    // She looks out over the fair from both: south, towards the plaza.
    for (const s of gondolas) { s.z = cz; s.yaw = Math.PI; }
    const lookout = makeSeat('wheel-lookout', 'wheel', 'lookout', 0, { still: true });
    lookout.x = A.wheelTopPlatform.x; lookout.y = A.wheelTopPlatform.y; lookout.z = A.wheelTopPlatform.z; lookout.yaw = Math.PI;
    return { cx, cz, hubY: g.hubY, radius: g.radius, gondolas, lookout, step: areaPerch(A.wheelStep), sweepX: g.radius + 0.9, sweepZ: 1.3 };
  })();
  seats.push(...wheel.gondolas, wheel.lookout);

  function setWheel(T) {
    const psi = TAU * frac(T / RIDE.WHEEL_TURN);
    angles.wheel = psi;
    for (let i = 0; i < wheel.gondolas.length; i++) {
      const s = wheel.gondolas[i];
      s.x = wheel.cx + Math.cos(s.a + psi) * wheel.radius;
      s.y = wheel.hubY + Math.sin(s.a + psi) * wheel.radius - s.drop;
    }
  }

  // ---- the teacups ------------------------------------------------------------------
  // The floor turns one way and every cup, on it, spins the other. She sits
  // in the middle of a cup, so the floor carries her round and the cup only
  // turns her on the spot.
  const cups = (() => {
    const g = R.teacups;
    const cx = g.group.position.x;
    const cz = g.group.position.z;
    const yaw0 = g.group.rotation.y;
    const list = g.cups.map((c, i) => makeSeat(`cups-cup-${i}`, 'cups', 'cup', i, {
      a: c.userData.place.angle, r: c.userData.place.radius, spin0: c.rotation.y, baseY: c.position.y + c.userData.seat.y,
    }));
    for (const s of list) s.y = s.baseY;
    const baseR = Math.max(...area.colliders.filter((c) => c.x === cx && c.z === cz).map((c) => c.r), list[0].r + 1.2);
    return { cx, cz, yaw0, list, baseR };
  })();
  seats.push(...cups.list);

  function setCups(T) {
    const alpha = TAU * frac(T / RIDE.CUPS_TURN);
    const spin = -TAU * frac(T / RIDE.CUPS_SPIN);
    angles.cups = alpha;
    angles.cupSpin = spin;
    for (let i = 0; i < cups.list.length; i++) {
      const s = cups.list[i];
      const at = s.a - cups.yaw0 - alpha;
      s.x = cups.cx + Math.cos(at) * s.r;
      s.z = cups.cz + Math.sin(at) * s.r;
      s.yaw = cups.yaw0 + alpha + s.spin0 + spin + Math.PI;
    }
  }

  // ---- the helter-skelter ------------------------------------------------------------
  // The stairs inside and the gallery at the top are the area's own perches:
  // she climbs them with the ordinary jump. A jump on the gallery starts the
  // slide (startSlide), and from then the CHUTE seat runs down the slide's
  // centre line, quick in the middle and easing onto the MAT, where it leaves
  // her sitting. The slide cannot be left half way: it is over in SLIDE_TIME.
  const slide = (() => {
    const g = R.helterSkelter;
    const pts = g.slide;
    const e = pts[pts.length - 1];
    const p = pts[pts.length - 3];
    const dl = Math.hypot(e.x - p.x, e.z - p.z) || 1;
    const dx = (e.x - p.x) / dl;
    const dz = (e.z - p.z) / dl;
    const path = [...pts, { x: e.x + dx * RIDE.MAT_AHEAD, y: RIDE.MAT_Y, z: e.z + dz * RIDE.MAT_AHEAD }];
    const len = new Float64Array(path.length);
    for (let i = 1; i < path.length; i++) {
      len[i] = len[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y, path[i].z - path[i - 1].z);
    }
    const chute = makeSeat('slide-chute', 'slide', 'chute', 0, { ears: true, pitch: 0 });
    const mat = makeSeat('slide-mat', 'slide', 'mat', 0, { still: true });
    const end = path[path.length - 1];
    mat.x = end.x; mat.y = end.y; mat.z = end.z; mat.yaw = Math.atan2(dx, dz) + Math.PI;
    const low = pts.filter((q) => q.y < 2.2);
    const A = area.anchors.helterSkelter;
    return { path, len, length: len[len.length - 1], chute, mat, low, top: areaPerch(g.top), cx: A.x, cz: A.z, t0: null, sliding: false, done: false };
  })();
  seats.push(slide.chute, slide.mat);

  // How far down the slide she is, 0 to 1, `u` of the way through its time: a
  // push off, a steady run, and a gentle stop on the mat.
  function slideProfile(u) {
    const a = 0.18;
    const d = 0.14;
    const v = 1 / (1 - a / 2 - d / 2);
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    if (u < a) return (v * u * u) / (2 * a);
    if (u > 1 - d) return 1 - (v * (1 - u) * (1 - u)) / (2 * d);
    return v * (u - a / 2);
  }

  function setSlide(T) {
    const on = slide.t0 !== null;
    const u = on ? Math.max(0, (T - slide.t0) / RIDE.SLIDE_TIME) : 0;
    slide.sliding = on && u < 1;
    slide.done = on && u >= 1;
    const at = slideProfile(u) * slide.length;
    // the stretch of the path she is on
    let lo = 0;
    let hi = slide.len.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (slide.len[mid] <= at) lo = mid; else hi = mid;
    }
    const a = slide.path[lo];
    const b = slide.path[hi];
    const span = slide.len[hi] - slide.len[lo] || 1;
    const k = Math.min(1, Math.max(0, (at - slide.len[lo]) / span));
    const s = slide.chute;
    s.x = a.x + (b.x - a.x) * k;
    s.y = a.y + (b.y - a.y) * k;
    s.z = a.z + (b.z - a.z) * k;
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const tz = b.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    s.yaw = Math.atan2(tx, tz) + Math.PI; // head first
    s.pitch = Math.asin(Math.max(-1, Math.min(1, ty / tl))); // nose down as the chute goes down
  }
  // A jump on the gallery: the slide starts now.
  function startSlide() { slide.t0 = now; setSlide(now); return slide.chute; }
  // She is on the mat (or the walk is over): the chute is back at the top.
  function endSlide() { slide.t0 = null; setSlide(now); }

  let now = 0;
  function setTime(T) {
    now = Number.isFinite(T) ? T : 0;
    setMgr(now);
    setWheel(now);
    setCups(now);
    setSlide(now);
  }

  // ---- what a jump reaches -------------------------------------------------------
  const hit = { type: null, seat: null, perch: null };
  const answer = (type, seat = null, perch = null) => { hit.type = type; hit.seat = seat; hit.perch = perch; return hit; };
  const flat = (s, cat) => Math.hypot(s.x - cat.x, s.z - cat.z);
  const apart = (s, o) => Math.hypot(s.x - o.x, s.y - (o.y ?? 0), s.z - o.z);

  // The gondola nearest `at` that is within `reach` of it, or null.
  function gondolaNear(at, reach) {
    let best = null;
    let bestD = reach;
    for (let i = 0; i < wheel.gondolas.length; i++) {
      const d = apart(wheel.gondolas[i], at);
      if (d < bestD) { best = wheel.gondolas[i]; bestD = d; }
    }
    return best;
  }

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
  //   'static'  from a seat onto `perch`, one of the area's own perches
  //   'stay'    nothing in reach just now, and she stays where she is (waiting
  //             on the boarding deck or the lookout for the next gondola)
  //   'slide'   from the helter-skelter's gallery onto `seat`, the chute: the slide starts
  //   'off'     off the ride, to the ground
  function jumpTarget(cat, from, last = null) {
    if (from && from.fair) {
      if (from.rideId === 'mgr') {
        const h = nextHorse(from, last);
        return h ? answer('hop', h) : answer('off');
      }
      if (from.seatKind === 'gondola') {
        // at the top, across to the lookout; at the bottom, out onto the boarding deck
        if (apart(from, wheel.lookout) < RIDE.REACH_LOOKOUT) return answer('hop', wheel.lookout);
        if (wheel.step && apart(from, wheel.step) < RIDE.REACH_GONDOLA) return answer('static', null, wheel.step);
        return answer('off');
      }
      // on the slide there is nothing to do but slide; on the mat, a jump is a step off it
      if (from.seatKind === 'chute') return slide.sliding ? answer('stay') : answer('off');
      if (from.seatKind === 'lookout') {
        const g = gondolaNear(from, RIDE.REACH_LOOKOUT);
        return g ? answer('hop', g) : answer('stay');
      }
      return answer('off');
    }
    // on the helter-skelter's gallery: down the slide
    if (from && slide.top && from === slide.top) return answer('slide', slide.chute);
    // not on a ride: the nearest seat that can be boarded from here
    let best = null;
    let bestD = Infinity;
    if ((cat.y ?? 0) < mgr.deckY + 0.6) {
      for (let i = 0; i < mgr.deck.length; i++) {
        const d = flat(mgr.deck[i], cat);
        if (d < RIDE.REACH_DECK && d < bestD) { best = mgr.deck[i]; bestD = d; }
      }
    }
    if ((cat.y ?? 0) < 0.6) {
      for (let i = 0; i < cups.list.length; i++) {
        const d = flat(cups.list[i], cat);
        if (d < RIDE.REACH_CUP && d < bestD) { best = cups.list[i]; bestD = d; }
      }
    }
    {
      const g = gondolaNear(cat, RIDE.REACH_GONDOLA);
      if (g && g.y - (cat.y ?? 0) <= RIDE.GONDOLA_STEP_UP) {
        const d = apart(g, cat);
        if (d < bestD) { best = g; bestD = d; }
      }
    }
    if (best) return answer('board', best);
    // On the boarding deck with no gondola in reach: she waits for the next
    // one (the stick still takes her off the deck, as off any perch).
    if (from && from === wheel.step) return answer('stay');
    return null;
  }

  // ---- getting off ---------------------------------------------------------------
  // Whether (x, z) is under or in something a ride moves through: the
  // platform of the merry-go-round (its collider covers the same disc), the
  // strip under the big wheel.
  function swept(x, z) {
    if (Math.hypot(x - mgr.cx, z - mgr.cz) < mgr.baseR + CAT_RADIUS) return true;
    // the teacups' floor (its collider covers the same disc)
    if (Math.hypot(x - cups.cx, z - cups.cz) < cups.baseR + CAT_RADIUS) return true;
    // the low end of the helter-skelter's chute, where a sliding cat comes through
    for (let i = 0; i < slide.low.length; i++) {
      if (Math.hypot(x - slide.low[i].x, z - slide.low[i].z) < RIDE.SLIDE_SWEEP + CAT_RADIUS) return true;
    }
    // the strip the big wheel and its gondolas turn over
    if (Math.abs(x - wheel.cx) < wheel.sweepX + CAT_RADIUS && Math.abs(z - wheel.cz) < wheel.sweepZ + CAT_RADIUS) return true;
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
    else if (seat.rideId === 'cups') { out.x = seat.x - cups.cx; out.z = seat.z - cups.cz; }
    else if (seat.rideId === 'slide') { out.x = seat.x - slide.cx; out.z = seat.z - slide.cz; }
    else { out.x = 0; out.z = 1; }
    return out;
  }

  const spot = { x: 0, z: 0, ok: false };
  const away = { x: 0, z: 0 };
  // dismountSpot(seat, toward, env) → { x, z, ok }: the nearest free ground to
  // the seat the way she pushed (`toward`, or outwards from the ride), or
  // failing that the nearest anywhere. ONE reused object. `ok` is false only if nothing within 14 m is
  // free, which no seat of this fair can produce (test/fairsim.test.js).
  function dismountSpot(seat, toward, env = {}) {
    let tx = toward ? toward.x : 0;
    let tz = toward ? toward.z : 0;
    if (Math.hypot(tx, tz) < 1e-3) { awayFrom(seat, away); tx = away.x; tz = away.z; }
    const base = Math.atan2(tx, tz);
    // First the way she pushed, and up to a quarter turn either side of it,
    // as far as a few steps; only then anywhere at all, nearest first.
    for (let pass = 0; pass < 2; pass++) {
      const fan = pass === 0 ? FAN_AHEAD : FAN.length;
      const far = pass === 0 ? 6 : 14;
      for (let r = 0.6; r <= far; r += 0.3) {
        for (let k = 0; k < fan; k++) {
          const a = base + FAN[k];
          const x = seat.x + Math.sin(a) * r;
          const z = seat.z + Math.cos(a) * r;
          if (free(x, z, env)) { spot.x = x; spot.z = z; spot.ok = true; return spot; }
        }
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
    wheel,
    cups,
    slide,
    startSlide,
    endSlide,
    get time() { return now; },
    setTime,
    jumpTarget,
    dismountSpot,
    free,
    swept,
  };
}
