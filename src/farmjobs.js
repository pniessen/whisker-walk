// =============================================================================
// Appletree Farm's jobs and discoveries: the pure half (design:
// docs/superpowers/specs/2026-11-18-farm-design.md, step 3).
//
// Four jobs and six things to find, as plain numbers on top of the animals'
// simulation (src/farmsim.js). No THREE, no DOM, no sound, no save:
// src/farmanimals.js draws what is here, src/farmrewards.js pays for it and
// game/walk.js says the lines (src/farmwords.js).
//
// THE RULES (the design's anti-goals; test/farmjobs.test.js holds each):
//   * A job is a row of states, 'offer' -> 'active' -> ... -> 'done'. Nothing
//     ever leads back from a later state to an earlier one, and NO state has
//     a clock: a job waits for the cat for as long as she likes. JOB_STATES
//     below is the whole table.
//   * Nothing is caught, hurt or eaten. The grain-store mice are not in
//     critters.js at all (no stalk, no pounce can aim at one): a cat that
//     comes near sends one home through its hole, however she arrives.
//   * Nothing chases or frightens the cat, and no animal is frightened: the
//     goat with the hat is playing. It skips ahead while the cat is near,
//     waits whenever she is not, is a little slower on every leg, and at the
//     last stop it simply lets itself be caught.
//   * The goat with the hat only ever stands on its route, which is checked
//     to be inside the bounds, clear of everything solid and out of the water.
//
// PER DEVICE, like the animals: nothing here is sent to a co-walker.
// =============================================================================
import { mulberry32, seedFromCode } from './rng.js';
import { polyline, clearance, pushOut, inRect, segClear, GOAT, CAT_WALK } from './farmsim.js';

export const FARM_JOB_IDS = Object.freeze(['chicks', 'cow', 'goat', 'mice']);
export const FARM_FIND_IDS = Object.freeze(['loftcats', 'eggs', 'owl', 'scarecrow', 'apples', 'ducklings']);
// The journal ids (progression.js JOURNAL_TYPES), one a job and one a find.
export const jobJournalId = (id) => `job${id}`;
export const findJournalId = (id) => `find${id}`;
export const FARM_JOURNAL_TYPES = Object.freeze([...FARM_JOB_IDS.map(jobJournalId), ...FARM_FIND_IDS.map(findJournalId)]);

// Every state a job has, in order. A job only ever moves to the right.
export const JOB_STATES = Object.freeze({
  chicks: Object.freeze(['offer', 'active', 'done']),
  cow: Object.freeze(['offer', 'active', 'milk', 'done']),   // milk: the saucer is out
  goat: Object.freeze(['offer', 'active', 'hat', 'done']),   // hat: the goat has dropped it
  mice: Object.freeze(['offer', 'active', 'done']),
});

// The carryable the farmer's hat is, once the goat has dropped it (carry.js).
export const FARM_HAT_ID = 'farm-job-hat';
export const FARM_HAT_KIND = 'strawhat';

export const JOB = Object.freeze({
  OFFER_R: 3,           // a job is offered this near its giver
  CHICKS: 4,
  COW_SEE: 18,          // the job cow comes for a cat this near (so from the gate, most of the time)
  MILK_R: 1.4,          // the saucer is lapped from this near
  DOOR_R: 2.2,          // the hat is handed in this near the farmhouse door
  // the goat with the hat
  GOAT_OFFER_R: 4.5,
  GOAT_TEASE: 4,        // at a stop it waits until the cat is this near, then skips on
  GOAT_KEEP: 10,        // on a leg it only runs while the cat is this near; else it waits for her
  GOAT_TOUCH: 1.4,      // this near, on the ground, and it is caught
  // ...but a touch only counts as a catch when it was a chase and not a tap:
  // the cat fell behind on this leg and caught up again (GOAT_GAP), or the
  // goat is on a leg slower than any cat walks and has run GOAT_GRACE of it,
  // or it stands cornered at its last stop.
  GOAT_GAP: 2.4,
  GOAT_GRACE: 4,
  GOAT_SPEEDS: Object.freeze([3.9, 3.5, 3.0, 2.6, 2.2]), // one a leg: slower every time
  GOAT_HOP: 0.45,
  GOAT_DROP: 1.1,       // the hat lands this far in front of its nose
  // the grain-store mice
  MOUSE_FLEE: 1.7,
  MOUSE_SPEED: 5.5,
  // the finds
  LOFT_R: 4,
  OWL_R: 3.4,
  OWL_HEAR: 7,
  OWL_PEEK: 2.6,        // seconds one eye stays open (a look, not a job's clock)
  EGGS_R: 1.6,
  SCARECROW_R: 1.9,
  TREE_R: 0.7,
  APPLE_R: 0.12,
  APPLE_BAT: 0.5,
  APPLE_ROLL: 2.6,
  APPLES_MAX: 2,
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pt = (x, z, more) => Object.freeze({ x, z, ...more });

// Where the four lost chicks wait: three sets, each four spots round the
// yard, on open ground a calm cat can walk to. A walk's seed picks one.
export const CHICK_SPOT_SETS = Object.freeze([
  Object.freeze([pt(-4.6, 8.9), pt(7.6, -8.4), pt(11.8, -6.2), pt(-13.4, 4.4)]),   // the well, the bales, the tractor shed, the bench
  Object.freeze([pt(-2.8, -8.2), pt(3.4, 7.6), pt(11.6, 14.6), pt(-12.4, 16.2)]),  // the barn doors, the puddle, the milking shed, the beans
  Object.freeze([pt(1.4, 16), pt(-8.6, 12.6), pt(-8.4, -11.6), pt(9.4, 3)]),       // the lane, the box, the barn's west wall, the yard
]);

// The goat's route with the hat: out of the paddock's gate, down to the barn,
// along its front, over a hay bale, across the yard to the well and back to
// the nook between the bales and the barn. `stop` marks where it waits for
// the cat; `y` is a point up on something (it hops there).
export function goatRoute(A) {
  const bale = A.baleRoute[0];
  return Object.freeze([
    pt(A.goatGate.x - 2.6, A.goatGate.z),                 // 0: just inside the gate, where it comes to when the job is taken on
    pt(A.goatGate.x + 2.4, A.goatGate.z + 0.4),
    pt(-9.6, -7.9, { stop: true }),                       // the barn's corner
    pt(1.8, -8.0, { stop: true }),                        // in front of the barn doors
    pt(bale.x, bale.z, { y: bale.y }),                    // up onto the bale
    pt(7.6, -8.3),                                        // and down the far side
    pt(9.4, -2.6, { stop: true }),                        // the yard, by the tractor shed
    pt(-4.2, 4.2, { stop: true }),                        // the well
    pt(6.4, -3.6),
    pt(7.7, -8.6, { stop: true }),                        // the nook behind the bales: cornered
  ]);
}

// Where each grain-store mouse sits, and the way it runs home: along the
// store's front (or out of the alley beside it) to the hole in the wall.
export function mouseRuns(A) {
  const hole = A.grainStoreHole;
  const front = A.grainStoreHoleFront;
  const laneX = front.x + 0.15;
  const south = hole.z + 1.5; // the alley between the grain store and the milking shed
  const home = [pt(front.x + 0.3, hole.z), pt(hole.x, hole.z)];
  return Object.freeze([
    [pt(laneX - 0.35, hole.z - 5.0), pt(laneX, hole.z - 3), ...home],          // by the sacks' far end
    [pt(hole.x - 0.45, hole.z - 3.35), pt(laneX, hole.z - 2.2), ...home],      // tucked in beside a sack
    [pt(hole.x - 0.4, hole.z - 0.95), ...home],                                // by the door
    [pt(hole.x + 2.1, south), pt(laneX, south), ...home],                      // in the alley
    [pt(hole.x + 4.9, south - 0.1), pt(laneX, south), ...home],                // deeper in the alley
  ].map((run) => Object.freeze(run)));
}

// A route with heights: like farmsim's polyline, and `y` along a hop.
function hopLine(points) {
  const line = polyline(points);
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i], points[i - 1]));
  return {
    ...line,
    cum,
    yAt(s) {
      const t = clamp(s, 0, line.length);
      let i = 1;
      while (i < points.length - 1 && cum[i] < t) i++;
      const y0 = points[i - 1].y ?? 0;
      const y1 = points[i].y ?? 0;
      if (y0 === 0 && y1 === 0) return 0;
      const k = (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return y0 + (y1 - y0) * k + 4 * JOB.GOAT_HOP * k * (1 - k);
    },
  };
}

function inWater(waters, x, z, margin = 0) {
  for (const w of waters ?? []) {
    if (w.kind === 'circle' && Math.hypot(x - w.x, z - w.z) < w.r + margin) return true;
  }
  return false;
}

// =============================================================================
// createFarmJobs(area, sim, { seed }) → the jobs and finds of one walk.
//   area   world/farm.js's record
//   sim    farmsim.js's createFarmSim(area): the job cow, the chicks, the goat
//
// step(dt, cat) moves everything one frame on; AFTER sim.step.
//   cat   farmsim's cat, and
//           y     how high she stands (a perch's height, else 0)
//           hat   true while the farmer's hat is in her mouth
// `takeEvents()` hands over what has happened since it was last asked (in a
// step, or when E did something), oldest first:
//   { type: 'job-start' | 'job-done', job }
//   { type: 'chick-found' } { type: 'chick-home', n }
//   { type: 'cow-milk' }               the cow is at the shed and the saucer is out
//   { type: 'goat-skip', leg } { type: 'goat-drop', x, z }
//   { type: 'mouse-run', id } { type: 'mouse-out', n }
//   { type: 'find', id }               the cat is at a discovery (every visit; the caller pays once)
//   { type: 'owl-peek' } { type: 'apple-drop', n } { type: 'apple-thud' } { type: 'apple-bat' }
//   { type: 'hat-on' } { type: 'hat-off' }
// =============================================================================
export function createFarmJobs(area, sim, { seed = 'farm-jobs' } = {}) {
  const rng = mulberry32(seedFromCode(String(seed)));
  const A = area.anchors;
  const colliders = area.colliders ?? [];
  const bounds = area.bounds;
  const waters = area.waters ?? [];
  const events = [];
  const state = { chicks: 'offer', cow: 'offer', goat: 'offer', mice: 'offer' };
  const order = []; // the jobs under way, the newest last (for the HUD's one line)
  const advance = (id, to) => {
    const row = JOB_STATES[id];
    if (row.indexOf(to) <= row.indexOf(state[id])) return false; // only ever to the right
    state[id] = to;
    if (to === 'active') { order.push(id); events.push({ type: 'job-start', job: id }); }
    if (to === 'done') {
      const i = order.indexOf(id);
      if (i >= 0) order.splice(i, 1);
      events.push({ type: 'job-done', job: id });
    }
    return true;
  };

  // ---- 1. round up the chicks ------------------------------------------------
  const chickSpots = CHICK_SPOT_SETS[Math.floor(rng() * CHICK_SPOT_SETS.length)];
  const chicks = { home: 0, found: false, in: new Set() };
  function stepChicks() {
    if (state.chicks !== 'active') return;
    for (const c of sim.chicks) {
      if (chicks.in.has(c.id)) continue;
      if (c.following) {
        // found: from now on it waits wherever the cat leaves it, never back where it hid
        if (c.placed) { c.placed.x = c.x; c.placed.z = c.z; }
        if (!chicks.found) { chicks.found = true; events.push({ type: 'chick-found' }); }
        if (sim.chickAtCoop(c.id) && sim.coopChick(c.id)) {
          chicks.in.add(c.id);
          chicks.home = chicks.in.size;
          events.push({ type: 'chick-home', n: chicks.home });
        }
      }
    }
    // all four inside (the last hop finished): out they come, to their mother
    if (chicks.in.size >= JOB.CHICKS && sim.chicks.every((c) => c.hidden)) {
      for (const c of sim.chicks) sim.homeChick(c.id);
      advance('chicks', 'done');
    }
  }

  // ---- 2. bring the cow in ---------------------------------------------------
  const saucer = Object.freeze({ x: A.milkingShedDoor.x - 0.7, z: A.milkingShedDoor.z + 0.6 }); // on the grass before the shed door, clear of the churns
  function stepCow() {
    if (state.cow === 'active' && sim.jobCow.follow?.arrived && advance('cow', 'milk')) events.push({ type: 'cow-milk' });
  }

  // ---- 3. catch the goat ------------------------------------------------------
  const hatGoat = sim.goats[0];
  const routePoints = goatRoute(A);
  const route = hopLine(routePoints);
  const stops = routePoints.map((p, i) => (p.stop ? route.cum[i] : null)).filter((s) => s !== null);
  const goat = {
    s: 0,          // how far along the route it is
    leg: 0,        // how many legs it has run (its next stop is stops[leg])
    // 'play'    an ordinary paddock goat, the hat in its mouth (the job not yet taken on)
    // 'call'    asked for: finishing its hop or its head-butt
    // 'gather'  trotting to the gate
    // 'wait'    at a stop, until the cat is near
    // 'run'     along a leg
    // 'home'    the hat dropped: walking back
    // 'free'    an ordinary goat again
    mode: 'play',
    skip: 0,       // 0..1: a happy skip on the spot
    from: 0,       // where on the route this leg began
    gap: false,    // whether the cat has fallen behind on this leg
    gather: null,  // { line, s }: its way to the gate
  };
  // where the farmer's hat is: 'goat' | 'ground' | 'cat' | 'door'
  const hat = { at: 'goat', x: 0, z: 0 };
  const putGoat = (g) => {
    const p = route.at(goat.s);
    g.walked += Math.hypot(p.x - g.x, p.z - g.z);
    g.x = p.x; g.z = p.z; g.y = route.yAt(goat.s);
    return p;
  };
  function goatScript(g, dt, cat) {
    g.moving = false;
    g.head = 0;
    const d = dist(cat, g);
    const face = (x, z) => { if (Math.hypot(x - g.x, z - g.z) > 0.3) g.yaw = turn(g.yaw, Math.atan2(x - g.x, z - g.z), 6 * dt); };
    if (goat.skip > 0) {
      // a happy skip on the spot: up and down once
      goat.skip = Math.max(0, goat.skip - dt / GOAT.HOP_TIME);
      g.y = route.yAt(goat.s) + 4 * 0.3 * goat.skip * (1 - goat.skip);
    }
    if (goat.mode === 'home') {
      goat.s = Math.max(0, goat.s - GOAT.TROT * dt);
      const p = putGoat(g);
      g.yaw = turn(g.yaw, p.yaw + Math.PI, 6 * dt);
      g.moving = true;
      if (goat.s <= 0) {
        // back in the paddock: an ordinary goat again
        goat.mode = 'free';
        g.script = null; g.y = 0; g.mode = 'idle'; g.timer = 2; g.plan = []; g.spot = null; g.goal = null; g.hop = null;
      }
      return;
    }
    if (goat.mode === 'gather') {
      const w = goat.gather;
      w.s = Math.min(w.line.length, w.s + GOAT.TROT * dt);
      const p = w.line.at(w.s);
      g.walked += Math.hypot(p.x - g.x, p.z - g.z);
      g.x = p.x; g.z = p.z; g.y = 0;
      g.yaw = turn(g.yaw, p.yaw, 8 * dt);
      g.moving = true;
      if (w.s >= w.line.length) { goat.mode = 'wait'; goat.gather = null; goat.s = 0; }
      return;
    }
    // caught: touched on the ground (never in the air over the bale)
    const touch = () => {
      if (d > JOB.GOAT_TOUCH || route.yAt(goat.s) > 0.2 || cat.perched || cat.inWater) return false;
      const cornered = goat.mode === 'wait' && goat.leg >= stops.length;
      const slowLeg = JOB.GOAT_SPEEDS[Math.min(goat.leg, JOB.GOAT_SPEEDS.length - 1)] < CAT_WALK;
      const chased = goat.mode === 'run' && (goat.gap || (slowLeg && goat.s - goat.from >= JOB.GOAT_GRACE));
      if (!cornered && !chased) return false;
      // the hat falls in front of its nose: the side away from the cat, in plain sight
      const spot = pushOut({ x: g.x + Math.sin(g.yaw) * JOB.GOAT_DROP, z: g.z + Math.cos(g.yaw) * JOB.GOAT_DROP }, colliders, 0.5);
      if (!inRect(bounds, spot.x, spot.z, 1) || inWater(waters, spot.x, spot.z, 0.5)) { spot.x = g.x; spot.z = g.z; }
      hat.at = 'ground'; hat.x = spot.x; hat.z = spot.z;
      g.carry = null;
      goat.mode = 'home';
      goat.skip = 1;
      advance('goat', 'hat');
      events.push({ type: 'goat-drop', x: spot.x, z: spot.z });
      return true;
    };
    if (touch()) return;
    if (goat.mode === 'wait') {
      face(cat.x, cat.z);
      // the last stop is the corner: it stays, and lets itself be caught
      if (goat.leg < stops.length && d < JOB.GOAT_TEASE && !cat.perched) {
        goat.mode = 'run';
        goat.from = goat.s;
        goat.gap = false;
        events.push({ type: 'goat-skip', leg: goat.leg });
      }
      return;
    }
    if (d > JOB.GOAT_GAP) goat.gap = true;
    // 'run': along the leg while she is near, a little slower each leg; in the
    // air over the bale it always finishes the hop
    const target = stops[goat.leg];
    if (d > JOB.GOAT_KEEP && route.yAt(goat.s) <= 0.01) { face(cat.x, cat.z); return; }
    goat.s = Math.min(target, goat.s + JOB.GOAT_SPEEDS[Math.min(goat.leg, JOB.GOAT_SPEEDS.length - 1)] * dt);
    const p = putGoat(g);
    g.yaw = turn(g.yaw, p.yaw, 8 * dt);
    g.moving = true;
    if (goat.s >= target) { goat.leg += 1; goat.mode = 'wait'; goat.skip = 1; }
  }
  // Until the job is taken on it is an ordinary goat (farmsim.js), playing
  // with the hat in its mouth. Taken on: it is called down to the grass, trots
  // to the gate, and the route begins.
  hatGoat.carry = 'hat';
  function stepGoatCall() {
    if (state.goat !== 'active' || goat.mode !== 'call') return;
    const start = routePoints[0];
    if (!sim.callGoat(hatGoat, start)) return;
    const from = { x: hatGoat.x, z: hatGoat.z };
    const pad = A.goatPaddock;
    const clear = (a, b) => segClear(colliders, a.x, a.z, b.x, b.z, 0.45);
    const way = [from];
    if (!clear(from, start)) {
      const via = [{ x: start.x, z: from.z }, { x: from.x, z: start.z }, { x: from.x, z: pad.maxZ - 1 }, { x: pad.maxX - 1, z: from.z }, { x: from.x, z: pad.minZ + 1 }]
        .filter((v) => inRect(pad, v.x, v.z)).find((v) => clear(from, v) && clear(v, start));
      if (via) way.push(via);
    }
    way.push(start);
    goat.gather = { line: polyline(way), s: 0 };
    goat.mode = 'gather';
    hatGoat.script = goatScript;
  }

  // ---- 4. barn mouser --------------------------------------------------------
  const mice = mouseRuns(A).map((run, i) => {
    const line = polyline(run);
    return { id: `barn-mouse-${i + 1}`, type: 'barnmouse', line, s: 0, x: run[0].x, z: run[0].z, yaw: rng() * Math.PI * 2, mode: 'hidden', moving: false, walked: 0 };
  });
  let miceOut = 0;
  function stepMice(dt, cat) {
    if (state.mice !== 'active') return;
    for (const m of mice) {
      m.moving = false;
      if (m.mode === 'idle' && dist(cat, m) < JOB.MOUSE_FLEE) {
        m.mode = 'run';
        events.push({ type: 'mouse-run', id: m.id });
      }
      if (m.mode !== 'run') continue;
      m.s = Math.min(m.line.length, m.s + JOB.MOUSE_SPEED * dt);
      const p = m.line.at(m.s);
      m.walked += Math.hypot(p.x - m.x, p.z - m.z);
      m.x = p.x; m.z = p.z; m.yaw = p.yaw; m.moving = true;
      if (m.s >= m.line.length) {
        m.mode = 'gone';
        miceOut += 1;
        events.push({ type: 'mouse-out', n: miceOut });
      }
    }
    if (miceOut >= mice.length) advance('mice', 'done');
  }

  // ---- the finds ---------------------------------------------------------------
  const loftY = A.hayloft.y - 0.4;
  const at = { loftcats: false, eggs: false, owl: false, apples: null, ducklings: false };
  const owl = { peek: 0 };
  const loft = { visitor: false };
  const scarecrow = { worn: false, found: false };
  const apples = []; // { x, y, z, vy, vx, vz, down }
  const find = (id) => events.push({ type: 'find', id });
  const edge = (id, now) => { if (now && !at[id]) find(id); at[id] = now; };
  function dropApples(tree) {
    const n = rng() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.9 + rng() * 0.7;
      const spot = pushOut({ x: tree.x + Math.sin(a) * r, z: tree.z + Math.cos(a) * r }, colliders, 0.3);
      const apple = { x: spot.x, z: spot.z, y: 1.9 + rng() * 0.5, vy: -i * 1.5, vx: 0, vz: 0, down: false };
      if (apples.length >= JOB.APPLES_MAX) apples.shift(); // the oldest windfall goes: never a pile
      apples.push(apple);
    }
    events.push({ type: 'apple-drop', n });
  }
  function stepApples(dt, cat) {
    for (const a of apples) {
      if (!a.down) {
        a.vy -= 9.8 * dt;
        a.y += a.vy * dt;
        if (a.y <= JOB.APPLE_R) { a.y = JOB.APPLE_R; a.down = true; events.push({ type: 'apple-thud' }); }
        continue;
      }
      const d = dist(cat, a);
      if (!cat.perched && !cat.inWater && d < JOB.APPLE_BAT && Math.hypot(a.vx, a.vz) < 0.4) {
        const nx = d > 1e-3 ? (a.x - cat.x) / d : cat.fx ?? 0;
        const nz = d > 1e-3 ? (a.z - cat.z) / d : cat.fz ?? 1;
        a.vx = nx * JOB.APPLE_ROLL; a.vz = nz * JOB.APPLE_ROLL;
        events.push({ type: 'apple-bat' });
      }
      const v = Math.hypot(a.vx, a.vz);
      if (v < 0.02) { a.vx = 0; a.vz = 0; continue; }
      const next = { x: a.x + a.vx * dt, z: a.z + a.vz * dt };
      // it stops at anything solid, at the edge of the farm and at the water
      if (!inRect(bounds, next.x, next.z, 0.3) || clearance(colliders, next.x, next.z) < JOB.APPLE_R || inWater(waters, next.x, next.z, 0.2)) {
        a.vx = 0; a.vz = 0;
        continue;
      }
      a.x = next.x; a.z = next.z;
      a.spin = (a.spin ?? 0) + (v * dt) / JOB.APPLE_R;
      const slow = Math.max(0, v - 2.2 * dt) / v;
      a.vx *= slow; a.vz *= slow;
    }
  }
  function stepFinds(dt, cat) {
    const up = (cat.y ?? 0) >= loftY;
    loft.visitor = up && dist(cat, A.hayloftNest) < JOB.LOFT_R + 1;
    edge('loftcats', up && dist(cat, A.hayloftNest) < JOB.LOFT_R);
    const dOwl = dist(cat, A.rafters);
    const facing = dOwl > 1e-3 && (((A.rafters.x - cat.x) * (cat.fx ?? 0) + (A.rafters.z - cat.z) * (cat.fz ?? 0)) / dOwl) > 0.5;
    edge('owl', up && dOwl < JOB.OWL_R && facing);
    edge('eggs', !cat.perched && dist(cat, A.tractorNest) < JOB.EGGS_R);
    const tree = cat.perched && (cat.y ?? 0) > 1 ? A.appleTrees.find((t) => dist(cat, t) < JOB.TREE_R) ?? null : null;
    if (tree && tree !== at.apples) { dropApples(tree); find('apples'); }
    at.apples = tree;
    edge('ducklings', !!sim.ducklingsWithCat);
    if (owl.peek > 0) owl.peek = Math.max(0, owl.peek - dt);
    stepApples(dt, cat);
  }

  const onGround = (cat) => !cat.perched && !cat.inWater;
  const jobs = {
    state, events, chicks, chickSpots, saucer, goat, hat, hatGoat, route, routePoints, stops, mice, owl, loft, scarecrow, apples,
    get miceOut() { return miceOut; },

    takeEvents() { return events.splice(0, events.length); },

    step(dt, cat) {
      if (!(dt > 0)) return;
      const step = Math.min(dt, 0.1);
      // the hat follows the mouth: picked up, or put down wherever she likes
      if (state.goat === 'hat') {
        if (cat.hat) hat.at = 'cat';
        else if (hat.at === 'cat') { hat.at = 'ground'; hat.x = cat.x; hat.z = cat.z; }
      }
      stepChicks();
      stepCow();
      stepGoatCall();
      stepMice(step, cat);
      stepFinds(step, cat);
    },

    // What E would do here, or null: { kind: 'offer', job } | { kind: 'milk' } |
    // { kind: 'deliver' } | { kind: 'tryhat' } | { kind: 'hatback' }.
    actionFor(cat) {
      if (!onGround(cat)) return null;
      if (state.goat === 'hat' && cat.hat && dist(cat, A.farmhouseDoor) < JOB.DOOR_R) return { kind: 'deliver' };
      if (state.cow === 'milk' && dist(cat, saucer) < JOB.MILK_R) return { kind: 'milk' };
      if (state.chicks === 'offer' && (dist(cat, A.coopDoor) < JOB.OFFER_R || dist(cat, sim.hens[0]) < JOB.OFFER_R)) return { kind: 'offer', job: 'chicks' };
      if (state.cow === 'offer' && !cat.riding
        && (dist(cat, A.pastureGate) < JOB.OFFER_R || dist(cat, A.trough) < JOB.OFFER_R || dist(cat, sim.jobCow) < JOB.OFFER_R)) return { kind: 'offer', job: 'cow' };
      if (state.goat === 'offer' && (dist(cat, hatGoat) < JOB.GOAT_OFFER_R || dist(cat, A.farmhouseDoor) < JOB.OFFER_R)) return { kind: 'offer', job: 'goat' };
      if (state.mice === 'offer' && dist(cat, A.grainStoreDoor) < JOB.OFFER_R) return { kind: 'offer', job: 'mice' };
      if (dist(cat, A.scarecrow) < JOB.SCARECROW_R) return { kind: scarecrow.worn ? 'hatback' : 'tryhat' };
      return null;
    },

    // Does what actionFor offered. Returns whether anything happened.
    act(action, cat) {
      const now = jobs.actionFor(cat);
      if (!action || !now || now.kind !== action.kind || now.job !== action.job) return false;
      if (now.kind === 'offer') return jobs.accept(now.job);
      if (now.kind === 'milk') { sim.stopCowFollow(); return advance('cow', 'done'); }
      if (now.kind === 'deliver') { hat.at = 'door'; hat.x = A.farmhouseDoor.x; hat.z = A.farmhouseDoor.z; return advance('goat', 'done'); }
      if (now.kind === 'tryhat') { scarecrow.worn = true; events.push({ type: 'hat-on' }); find('scarecrow'); return true; }
      if (now.kind === 'hatback') { scarecrow.worn = false; events.push({ type: 'hat-off' }); return true; }
      return false;
    },

    accept(id) {
      if (state[id] !== 'offer') return false;
      if (id === 'chicks') {
        sim.chicks.forEach((c, i) => sim.placeChick(c.id, chickSpots[i].x, chickSpots[i].z));
      } else if (id === 'cow') {
        sim.startCowFollow(sim.jobCow, sim.cowRoute, { see: JOB.COW_SEE });
      } else if (id === 'goat') {
        goat.mode = 'call';
      } else if (id === 'mice') {
        for (const m of mice) m.mode = 'idle';
      }
      return advance(id, 'active');
    },

    // A walk picked up again (walkresume.js) that had already finished this
    // job: it is done, and nothing of it is left lying about.
    markDone(id) {
      if (!FARM_JOB_IDS.includes(id) || state[id] === 'done') return;
      if (id === 'goat') {
        hatGoat.carry = null; hatGoat.script = null; goat.mode = 'free';
        hat.at = 'door'; hat.x = A.farmhouseDoor.x; hat.z = A.farmhouseDoor.z;
      }
      state[id] = 'done';
      const i = order.indexOf(id);
      if (i >= 0) order.splice(i, 1);
    },

    // The one line the HUD shows: the newest job under way.
    //   { job, step, n, total, target: { x, z } | null }
    objective() {
      const id = order[order.length - 1];
      if (!id) return null;
      // (the way to the coop only once a chick is behind her: until then they are still to be found)
      if (id === 'chicks') return { job: id, step: 'active', n: chicks.home, total: JOB.CHICKS, target: sim.chicks.some((c) => c.following) ? A.coopDoor : null };
      if (id === 'cow') return { job: id, step: state.cow, n: 0, total: 0, target: state.cow === 'milk' ? saucer : A.milkingShedDoor };
      if (id === 'goat') {
        const held = hat.at === 'cat';
        return { job: id, step: state.goat === 'hat' ? (held ? 'carry' : 'pickup') : 'active', n: 0, total: 0,
          target: state.goat !== 'hat' ? hatGoat : held ? A.farmhouseDoor : hat };
      }
      return { job: id, step: 'active', n: miceOut, total: mice.length, target: null }; // they are all round the store: no one spot
    },

    // A meow: an owl that hears it opens one eye, and sleeps on.
    meow(pos, y = 0) {
      if (y < loftY || dist(pos, A.rafters) > JOB.OWL_HEAR) return false;
      owl.peek = JOB.OWL_PEEK;
      events.push({ type: 'owl-peek' });
      find('owl'); // an owl that answers has been found
      return true;
    },
  };
  return jobs;
}

function turn(yaw, want, maxStep) {
  const d = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
  return Math.abs(d) <= maxStep ? want : yaw + Math.sign(d) * maxStep;
}
