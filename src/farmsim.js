// =============================================================================
// Appletree Farm's animals: the pure half (design:
// docs/superpowers/specs/2026-11-18-farm-design.md, step 2).
//
// Cows, goats, hens and chicks, a sheepdog and ducklings, as plain numbers:
// where each one is, which way it faces and what it is doing. No THREE, no
// DOM, no sound: src/farmanimals.js draws them and src/farmmodels.js is what
// they look like. Everything here can be run in a test for an hour of game
// time in a blink.
//
// THE RULES (the design's anti-goals, and test/farmsim.test.js holds each):
//   * Nothing is ever caught, hurt or eaten. None of these animals is in
//     critters.js at all, so no chase prompt, stalk or pounce can aim at one.
//   * Nothing frightens or chases the cat. The goat and the sheepdog come up
//     to her slower than she walks, and give up the moment she leaves.
//   * Nothing is frightened for longer than a flutter: a hen is back to
//     pecking within HEN.FLUTTER_TIME of being run past, a chick within
//     CHICK.SCATTER_TIME.
//   * A cow never startles, never leaves the pasture on her own and never
//     steps closer to anything solid than COW.CLEAR, so a cat on her back is
//     never carried into a wall or out of bounds.
//
// PER DEVICE. Like every critter (critters.js), these animals are simulated
// on each device and nothing about them is sent to a co-walker. Their dice
// are their own seeded stream, never the walk's.
//
// Headings: `yaw` turns a model whose nose is at +z, so a step forward is
// (sin yaw, cos yaw).
// =============================================================================
import { mulberry32, seedFromCode } from './rng.js';

// The journal ids of the Farm's animals (progression.js JOURNAL_TYPES). The
// goat and the dog are 'farmgoat' and 'sheepdog': 'goat' and 'dog' are the
// Gorge's mountain goat and the yard dog, which are other animals.
export const FARM_ANIMAL_TYPES = Object.freeze(['cow', 'farmgoat', 'hen', 'chick', 'sheepdog', 'duckling']);

// The slowest any cat trots (critters.js: "a trot at 3.2-4.4"). Nothing at the
// Farm comes toward the cat faster than this.
export const CAT_WALK = 3.2;
// The cat's own half-width, as player.js pushes it out of colliders.
const CAT_RADIUS = 0.35;

export const COW = Object.freeze({
  AMBLE: 0.55,        // m/s
  TURN: 0.8,          // rad/s
  SIZE: 1.1,          // how big the model is drawn (farmmodels.js builds her 1.36 m to the back)
  BACK_Y: 1.5,        // the top of a grown cow's back: where the cat sits (one hop: climbing.js allows 1.6)
  HALF_WIDTH: 0.46,
  HALF_LENGTH: 1.05,
  CLEAR: 1.05,        // a cow's middle stays this far from every solid thing
  APART: 2.3,         // and cows keep this far from each other's spots
  MOO_RANGE: 10,
  LOOK_TIME: 2.6,
  FOLLOW_SPEED: 1.15, // the job cow ambling after the cat
  FOLLOW_SEE: 10,     // she follows a cat this near
  FOLLOW_GAP: 1.7,    // and stops this far behind her
  CALF: 0.62,         // a calf's size
});

export const GOAT = Object.freeze({
  WALK: 1.5,
  TROT: 2.3,          // coming over to say hello: slower than the cat walks
  HOP_TIME: 0.55,
  GREET_RANGE: 6,
  GREET_LOST: 9,
  BUTT_REACH: 1.25,
  BUTT_TIME: 0.8,
  NUDGE: 0.22,        // metres: all a head-butt ever moves the cat
  GREET_REST: 14,     // seconds before the next hello
  COPY_RANGE: 7,
  COPY_DELAY: 0.25,
  COPY_HEIGHT: 0.5,
});

export const HEN = Object.freeze({
  STROLL: 0.6,
  HOME_R: 3,
  NOTICE: 2.2,        // a RUNNING cat this close sends her fluttering
  FLUTTER_TIME: 0.45, // and this is how long it lasts
  FLUTTER_MIN: 1.0,
  FLUTTER_MAX: 2.0,
  FLUTTER_HOP: 0.35,
});

export const CHICK = Object.freeze({
  SPEED: 4.6,         // little legs: they keep up with a trot
  TODDLE: 1.2,
  HOME_R: 0.8,
  NOTICE: 2.5,        // a calm cat this close is followed
  LOSE: 9,
  LEASH: 16,          // how far from their hen they will go
  TIRED: 6,
  FIRST: 0.7,         // the line: the first chick this far behind the cat
  GAP: 0.5,           // and each next one this far behind the last
  SCATTER_RANGE: 3,
  SCATTER_DIST: 1.2,
  SCATTER_TIME: 0.4,
  COOP_R: 1.6,
});

export const DOG = Object.freeze({
  TROT: 2.4,          // slower than the cat walks
  HEEL_MAX: 4.4,
  HEEL_RANGE: 2.5,    // beside her: within this he keeps her pace
  NOTICE: 7,
  WAG: 9,
  SIDE: 1.0,          // he walks this far to her side, never in front
  WALK_TIME: 20,
  LOST: 9,
  LEASH: 24,          // metres from the kennel
  REST: 22,
});
// Every state the sheepdog has. There is no chasing and no barking in it.
export const DOG_MODES = Object.freeze(['lie', 'come', 'beside', 'home']);

export const DUCKLING = Object.freeze({ SPEED: 1.3, FIRST: 0.55, GAP: 0.45, NOTICE: 5 });

// ---- small geometry ---------------------------------------------------------
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function turnToward(yaw, want, maxStep) {
  const d = wrap(want - yaw);
  return Math.abs(d) <= maxStep ? wrap(want) : wrap(yaw + Math.sign(d) * maxStep);
}
export const inRect = (r, x, z, inset = 0) => x >= r.minX + inset && x <= r.maxX - inset && z >= r.minZ + inset && z <= r.maxZ - inset;
// How far (x, z) is clear of the nearest collider's edge (negative: inside one).
export function clearance(colliders, x, z) {
  let best = Infinity;
  for (const c of colliders) best = Math.min(best, Math.hypot(x - c.x, z - c.z) - c.r);
  return best;
}
// Moves p out to `margin` from every collider it is too near. Mutates p.
export function pushOut(p, colliders, margin) {
  for (const c of colliders) {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    const need = c.r + margin;
    if (d >= need) continue;
    if (d < 1e-6) { p.x = c.x + need; continue; }
    p.x = c.x + (dx / d) * need;
    p.z = c.z + (dz / d) * need;
  }
  return p;
}
function segClear(colliders, ax, az, bx, bz, margin) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4));
  for (let i = 0; i <= n; i++) {
    if (clearance(colliders, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n) < margin) return false;
  }
  return true;
}
function inWater(waters, x, z, margin = 0) {
  for (const w of waters ?? []) {
    if (w.kind === 'circle' && Math.hypot(x - w.x, z - w.z) < w.r + margin) {
      if ((w.decks ?? []).some((d) => inRect(d, x, z))) continue;
      return true;
    }
  }
  return false;
}
// One step from p toward (tx, tz), at most `step` long. Returns what is left.
function stepToward(p, tx, tz, step) {
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d <= step || d < 1e-9) { p.x = tx; p.z = tz; return 0; }
  p.x += (dx / d) * step;
  p.z += (dz / d) * step;
  return d - step;
}
const heading = (dx, dz) => Math.atan2(dx, dz);

// ---- a trail: where a leader has been, for a line of followers --------------------------
export function createTrail(spacing = 0.2, max = 80) {
  const pts = []; // newest first
  return {
    pts,
    push(x, z) {
      if (!pts.length || Math.hypot(x - pts[0].x, z - pts[0].z) >= spacing) {
        pts.unshift({ x, z });
        if (pts.length > max) pts.pop();
      }
    },
    reset(x, z) { pts.length = 0; pts.push({ x, z }); },
    // The spot `d` metres back along the trail from (hx, hz), the leader now.
    behind(hx, hz, d) {
      let px = hx;
      let pz = hz;
      let left = d;
      for (const p of pts) {
        const seg = Math.hypot(p.x - px, p.z - pz);
        if (seg >= left && seg > 1e-9) return { x: px + ((p.x - px) * left) / seg, z: pz + ((p.z - pz) * left) / seg };
        left -= seg;
        px = p.x;
        pz = p.z;
      }
      return { x: px, z: pz };
    },
  };
}

// ---- a polyline, for the job cow's walk to the milking shed ------------------------------
export function polyline(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i], points[i - 1]));
  const length = cum[cum.length - 1];
  return {
    points,
    length,
    at(s) {
      const t = clamp(s, 0, length);
      let i = 1;
      while (i < points.length - 1 && cum[i] < t) i++;
      const a = points[i - 1];
      const b = points[i];
      const seg = cum[i] - cum[i - 1] || 1;
      const k = (t - cum[i - 1]) / seg;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: heading(b.x - a.x, b.z - a.z) };
    },
    // How far along the line the nearest point to (x, z) is.
    project(x, z) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len2 = dx * dx + dz * dz || 1;
        const k = clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
        const d = Math.hypot(x - a.x - dx * k, z - a.z - dz * k);
        if (d < bestD) { bestD = d; best = cum[i - 1] + k * (cum[i] - cum[i - 1]); }
      }
      return best;
    },
  };
}

// =============================================================================
// THE RIDE. A cow's back is a perch that moves (climbing.js's perch record,
// with `ride` naming the cow). The cat gets onto it with the same jump as any
// other perch, on keys and on touch, and is carried by ridePose every frame.
// =============================================================================

// Where a rider is: over the cow's middle, at the height of her back.
export function ridePose(cow) {
  return { x: cow.x, z: cow.z, y: cow.perch.y, yaw: cow.yaw };
}

// Where a cat that gets off lands: beside the cow, on free ground inside the
// bounds, never in water. `toward` (a direction, may be null) picks the side.
export function dismountSpot(cow, toward, { colliders = [], bounds = null, waters = [] } = {}) {
  const fx = Math.sin(cow.yaw);
  const fz = Math.cos(cow.yaw);
  const rx = fz;   // the cow's right
  const rz = -fx;
  const side = COW.HALF_WIDTH * cow.scale + 0.6;
  const end = COW.HALF_LENGTH * cow.scale + 0.6;
  const first = toward && toward.x * rx + toward.z * rz < 0 ? -1 : 1;
  const tries = [
    [rx * side * first, rz * side * first], [-rx * side * first, -rz * side * first],
    [-fx * end, -fz * end], [fx * end, fz * end],
  ];
  for (let r = 1.5; r <= 4; r += 0.5) {
    for (let k = 0; k < 12; k++) tries.push([Math.sin((k * Math.PI) / 6) * r, Math.cos((k * Math.PI) / 6) * r]);
  }
  const ok = (x, z) => (!bounds || inRect(bounds, x, z, 0.4))
    && clearance(colliders, x, z) >= CAT_RADIUS + 0.1 && !inWater(waters, x, z, 0.4);
  for (const [ox, oz] of tries) {
    if (ok(cow.x + ox, cow.z + oz)) return { x: cow.x + ox, z: cow.z + oz };
  }
  return { x: cow.x, z: cow.z }; // a cow only ever stands on free ground herself
}

// =============================================================================
// THE SIMULATION
// =============================================================================
// createFarmSim(area, { seed }) → the animals of one walk.
//   area   src/world/farm.js's record: anchors, colliders, bounds, waters.
//
// step(dt, cat, env) moves everything one frame on.
//   cat   { x, z, speed, running, inWater, perched, jumping, riding, fx, fz }
//           running   zoomies or a pounce: faster than a trot
//           inWater   wading or swimming
//           perched   on any perch (a cow's back counts)
//           riding    the id of the cow she is on, or null
//           jumping   in the air this frame (a pounce or a hop up)
//           fx, fz    the way she faces
//   env   { ducks: [{ x, z }] }   the pond's ducks (critters.js's), for the ducklings
// After a step, `events` holds what happened in it (the caller plays sounds
// and shows toasts) and `nudge` the head-butt's small push, or null.
export function createFarmSim(area, { seed = 'farm-animals' } = {}) {
  const rng = mulberry32(seedFromCode(String(seed)));
  const A = area.anchors;
  const colliders = area.colliders ?? [];
  const bounds = area.bounds;
  const waters = area.waters ?? [];
  const events = [];
  const between = (a, b) => a + rng() * (b - a);

  // ---- cows -----------------------------------------------------------------
  const pasture = A.pasture;
  function makeCow(id, x, z, yaw, look, scale = 1, mother = null) {
    const cow = {
      id, type: 'cow', look, scale, mother,
      x, z, y: 0, yaw,
      mode: 'graze', timer: between(2, 7), target: null,
      walked: 0,          // metres walked, for the legs
      moving: false,
      headDown: true,
      lookAt: null,
      ridden: false,
      mooCool: 0,
      follow: null,       // { line, s, arrived } while she is the job cow at work
      perch: { x, z, y: Math.round(COW.BACK_Y * scale * 100) / 100, kind: 'prop', ride: id },
    };
    return cow;
  }
  const cows = [
    makeCow('cow-1', pasture.minX + 6, 4, 2.2, 'patches'),           // the job cow: black and white
    makeCow('cow-2', pasture.maxX - 5, -9, -0.6, 'brown'),
  ];
  cows.push(makeCow('cow-3', pasture.maxX - 2.5, -5.4, 0.4, 'calf', COW.CALF, cows[1]));
  const cowClear = (cow) => COW.CLEAR * cow.scale;

  function pickCowTarget(cow) {
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const d = between(3, 9);
      // a calf stays near its mother
      const from = cow.mother && dist(cow, cow.mother) > 4 ? cow.mother : cow;
      const tx = clamp(from.x + Math.sin(a) * d, pasture.minX + 0.4, pasture.maxX - 0.4);
      const tz = clamp(from.z + Math.cos(a) * d, pasture.minZ + 0.4, pasture.maxZ - 0.4);
      if (Math.hypot(tx - cow.x, tz - cow.z) < 1.5) continue;
      if (!segClear(colliders, cow.x, cow.z, tx, tz, cowClear(cow) + 0.1)) continue;
      const apart = COW.APART * Math.max(0.7, cow.scale);
      if (cows.some((o) => o !== cow && (Math.hypot(o.x - tx, o.z - tz) < apart || (o.target && Math.hypot(o.target.x - tx, o.target.z - tz) < apart)))) continue;
      return { x: tx, z: tz };
    }
    return null;
  }

  function stepCow(cow, dt, cat) {
    if (cow.mooCool > 0) cow.mooCool -= dt;
    cow.moving = false;
    if (cow.follow) { stepFollow(cow, dt, cat); return; }
    if (cow.mode === 'look') {
      cow.timer -= dt;
      cow.headDown = false;
      if (cow.timer <= 0) { cow.mode = 'graze'; cow.timer = between(2, 5); cow.lookAt = null; }
      return;
    }
    if (cow.mode === 'graze') {
      cow.headDown = true;
      cow.timer -= dt;
      if (cow.timer <= 0) {
        cow.target = pickCowTarget(cow);
        if (cow.target) cow.mode = 'amble';
        else cow.timer = between(1, 3);
      }
      return;
    }
    // amble: turn to the spot, then walk to it
    cow.headDown = false;
    const t = cow.target;
    const want = heading(t.x - cow.x, t.z - cow.z);
    cow.yaw = turnToward(cow.yaw, want, COW.TURN * dt);
    const blocked = cows.some((o) => o !== cow && dist(o, cow) < 1.5 * Math.max(cow.scale, o.scale) + 0.4
      && (o.x - cow.x) * Math.sin(cow.yaw) + (o.z - cow.z) * Math.cos(cow.yaw) > 0);
    if (Math.abs(wrap(want - cow.yaw)) < 0.35 && !blocked) {
      const before = { x: cow.x, z: cow.z };
      const left = stepToward(cow, t.x, t.z, COW.AMBLE * dt);
      cow.x = clamp(cow.x, pasture.minX, pasture.maxX);
      cow.z = clamp(cow.z, pasture.minZ, pasture.maxZ);
      pushOut(cow, colliders, cowClear(cow));
      cow.walked += dist(before, cow);
      cow.moving = true;
      if (left < 0.1) { cow.mode = 'graze'; cow.timer = cow.ridden ? between(1.5, 3.5) : between(4, 11); cow.target = null; }
    } else if (blocked) {
      cow.mode = 'graze'; cow.timer = between(2, 4); cow.target = null;
    }
  }

  // The job cow follows the cat along a line, never ahead of her, and waits
  // whenever the cat stops, turns back or wanders off. Nothing times it.
  function stepFollow(cow, dt, cat) {
    const f = cow.follow;
    cow.headDown = false;
    if (f.back) {
      // released: back along the line to the pasture, then grazing again
      f.s = Math.max(0, f.s - COW.FOLLOW_SPEED * dt);
      const p = f.line.at(f.s);
      cow.walked += Math.hypot(p.x - cow.x, p.z - cow.z);
      cow.x = p.x; cow.z = p.z;
      cow.yaw = turnToward(cow.yaw, wrap(p.yaw + Math.PI), 2.2 * dt);
      cow.moving = true;
      if (f.s <= 0) { cow.follow = null; cow.mode = 'graze'; cow.timer = between(2, 5); }
      return;
    }
    if (f.arrived) return;
    const sCat = f.line.project(cat.x, cat.z);
    const want = Math.min(f.line.length, sCat - COW.FOLLOW_GAP);
    const near = dist(cat, cow) <= COW.FOLLOW_SEE && !cow.ridden;
    if (near && want > f.s + 0.02) {
      f.s = Math.min(want, f.s + COW.FOLLOW_SPEED * dt);
      const p = f.line.at(f.s);
      cow.walked += Math.hypot(p.x - cow.x, p.z - cow.z);
      cow.x = p.x; cow.z = p.z;
      cow.yaw = turnToward(cow.yaw, p.yaw, 2.2 * dt);
      cow.moving = true;
    } else if (near && dist(cat, cow) > 0.5) {
      cow.lookAt = { x: cat.x, z: cat.z }; // waiting, watching the cat
    }
    if (f.s >= f.line.length - COW.FOLLOW_GAP - 0.5) {
      f.arrived = true;
      events.push({ type: 'cow-arrived', id: cow.id });
    }
  }

  // The way from the pasture to the milking shed's yard door: in through the
  // middle of the field to the gate, out of it, along the track between the
  // grain store and the milking shed, and round to the door.
  const cowRoute = Object.freeze([
    { x: A.pastureGate.x + 4.5, z: A.pastureGate.z },
    { x: A.pastureGate.x, z: A.pastureGate.z },
    { x: A.milkingShedDoor.x, z: A.pastureGate.z },
    { x: A.milkingShedDoor.x, z: A.milkingShedDoor.z },
  ]);

  // ---- goats ---------------------------------------------------------------
  const paddock = A.goatPaddock;
  const hopSpots = [
    { name: 'stand', x: A.goatStand.x, z: A.goatStand.z, y: A.goatStand.y },
    { name: 'rock', x: A.goatRock.x, z: A.goatRock.z, y: A.goatRock.y },
  ];
  function makeGoat(id, x, z, look) {
    return {
      id, type: 'farmgoat', look,
      x, z, y: 0, yaw: rng() * Math.PI * 2,
      mode: 'idle', timer: between(1, 4), plan: [], spot: null, goal: null,
      hop: null, walked: 0, moving: false, head: 0, // head: 0 up, 1 lowered to butt
      greetT: 0, buttT: 0, butted: false, copyIn: -1,
      carry: null,   // step 3: the thing in its mouth (the farmer's hat)
      script: null,  // step 3: a function (goat, dt, cat) that takes over from stepGoat
    };
  }
  const goats = [makeGoat('goat-1', paddock.maxX - 4.5, paddock.minZ + 10.5, 'white'), makeGoat('goat-2', paddock.minX + 4, paddock.maxZ - 3.5, 'tan')];

  const startHop = (g, to, height) => {
    g.hop = { x0: g.x, y0: g.y, z0: g.z, x1: to.x, y1: to.y ?? 0, z1: to.z, t: 0, h: height ?? 0.4 + Math.max(0, (to.y ?? 0) - g.y) * 0.25 };
    if (Math.hypot(to.x - g.x, to.z - g.z) > 0.05) g.yaw = heading(to.x - g.x, to.z - g.z);
  };
  // A ground spot 1.5 m from a hop spot (or from where the goat stands), toward (tx, tz).
  function groundToward(from, tx, tz) {
    const d = Math.hypot(tx - from.x, tz - from.z) || 1;
    const p = { x: from.x + ((tx - from.x) / d) * 1.5, z: from.z + ((tz - from.z) / d) * 1.5, y: 0 };
    pushOut(p, colliders, 0.4);
    p.x = clamp(p.x, paddock.minX, paddock.maxX);
    p.z = clamp(p.z, paddock.minZ, paddock.maxZ);
    return p;
  }
  function planGoat(g, cat) {
    const options = hopSpots.filter((s) => s !== g.spot
      && !goats.some((o) => o !== g && (o.spot === s || o.goal === s))
      && !(cat.perched && Math.hypot(cat.x - s.x, cat.z - s.z) < 1.4));
    const toSpot = options.length && rng() < 0.6 ? options[Math.floor(rng() * options.length)] : null;
    g.plan = [];
    g.goal = null;
    if (toSpot) {
      g.goal = toSpot;
      const across = Math.hypot(toSpot.x - g.x, toSpot.z - g.z);
      if (across <= 2.3) { g.plan.push({ kind: 'hop', to: toSpot, spot: toSpot }); return; }
      if (g.y > 0.05) g.plan.push({ kind: 'hop', to: groundToward(g, toSpot.x, toSpot.z) });
      const stand = groundToward(toSpot, g.x, g.z);
      g.plan.push({ kind: 'walk', to: stand }, { kind: 'hop', to: toSpot, spot: toSpot });
      return;
    }
    for (let i = 0; i < 10; i++) {
      const p = { x: between(paddock.minX + 0.5, paddock.maxX - 0.5), z: between(paddock.minZ + 0.5, paddock.maxZ - 0.5), y: 0 };
      if (clearance(colliders, p.x, p.z) < 0.6 || Math.hypot(p.x - g.x, p.z - g.z) < 2) continue;
      if (g.y > 0.05) g.plan.push({ kind: 'hop', to: groundToward(g, p.x, p.z) });
      g.plan.push({ kind: 'walk', to: p });
      return;
    }
  }
  function walkGoat(g, to, speed, dt) {
    const before = { x: g.x, z: g.z };
    g.yaw = turnToward(g.yaw, heading(to.x - g.x, to.z - g.z), 6 * dt);
    const left = stepToward(g, to.x, to.z, speed * dt);
    pushOut(g, colliders, 0.4);
    // a goat stays in its paddock: it never walks through the fence
    g.x = clamp(g.x, paddock.minX, paddock.maxX);
    g.z = clamp(g.z, paddock.minZ, paddock.maxZ);
    g.walked += dist(before, g);
    g.moving = true;
    return left;
  }
  let greeter = null; // one goat at a time says hello
  let helloRest = 3;  // and the two of them share one rest between hellos
  function stepGoat(g, dt, cat) {
    g.moving = false;
    if (g.script) { g.script(g, dt, cat); return; }
    // a hop in the air finishes before anything else
    if (g.hop) {
      const h = g.hop;
      h.t += dt / GOAT.HOP_TIME;
      const u = Math.min(1, h.t);
      g.x = h.x0 + (h.x1 - h.x0) * u;
      g.z = h.z0 + (h.z1 - h.z0) * u;
      g.y = h.y0 + (h.y1 - h.y0) * u + 4 * h.h * u * (1 - u);
      if (u >= 1) { g.y = h.y1; g.hop = null; }
      return;
    }
    // she jumped: so does the goat, a moment later
    if (g.copyIn >= 0) {
      g.copyIn -= dt;
      if (g.copyIn < 0) { startHop(g, { x: g.x, y: g.y, z: g.z }, GOAT.COPY_HEIGHT); events.push({ type: 'goat-copy', id: g.id }); return; }
    } else if (cat.jumping && g.mode !== 'butt' && dist(cat, g) < GOAT.COPY_RANGE && !g.copied) {
      g.copyIn = GOAT.COPY_DELAY;
    }
    g.copied = !!cat.jumping; // one hop for each jump of hers

    const catOnGround = !cat.perched && !cat.inWater;
    if (g.mode === 'butt') {
      g.buttT += dt;
      g.head = Math.sin(Math.min(1, g.buttT / GOAT.BUTT_TIME) * Math.PI);
      g.yaw = turnToward(g.yaw, heading(cat.x - g.x, cat.z - g.z), 5 * dt);
      if (!g.butted && g.buttT >= GOAT.BUTT_TIME * 0.45) {
        g.butted = true;
        const d = dist(cat, g);
        if (catOnGround && d < GOAT.BUTT_REACH + 0.5 && d > 1e-3) {
          sim.nudge = { dx: ((cat.x - g.x) / d) * GOAT.NUDGE, dz: ((cat.z - g.z) / d) * GOAT.NUDGE };
          events.push({ type: 'goat-butt', id: g.id });
        }
      }
      if (g.buttT >= GOAT.BUTT_TIME) {
        g.mode = 'idle'; g.timer = between(1.5, 3); g.head = 0; helloRest = GOAT.GREET_REST;
        if (greeter === g) greeter = null;
        startHop(g, { x: g.x, y: g.y, z: g.z }, 0.3); // a happy skip
      }
      return;
    }
    if (g.mode === 'greet') {
      g.greetT += dt;
      const d = dist(cat, g);
      if (!catOnGround || d > GOAT.GREET_LOST || g.greetT > 9 || !inRect(paddock, cat.x, cat.z, -3)) {
        g.mode = 'idle'; g.timer = between(1, 3); helloRest = 6;
        if (greeter === g) greeter = null;
        return;
      }
      if (d <= GOAT.BUTT_REACH) { g.mode = 'butt'; g.buttT = 0; g.butted = false; return; }
      walkGoat(g, cat, GOAT.TROT, dt);
      return;
    }
    // idle or walking: a cat in the paddock gets a hello
    if (catOnGround && helloRest <= 0 && (greeter === null || greeter === g) && g.copyIn < 0
      && dist(cat, g) < GOAT.GREET_RANGE && inRect(paddock, cat.x, cat.z, -1)) {
      greeter = g;
      g.plan = [];
      g.goal = null;
      g.spot = null;
      g.mode = 'greet';
      g.greetT = 0;
      if (g.y > 0.05) startHop(g, groundToward(g, cat.x, cat.z));
      return;
    }
    if (g.mode === 'idle') {
      g.timer -= dt;
      if (g.timer <= 0) { planGoat(g, cat); g.mode = g.plan.length ? 'go' : 'idle'; g.timer = between(1, 3); g.stuck = 0; }
      return;
    }
    // 'go': work through the plan
    const leg = g.plan[0];
    if (!leg) { g.mode = 'idle'; g.timer = g.spot ? between(3, 7) : between(2, 5); g.goal = null; return; }
    if (leg.kind === 'hop') {
      // not onto a spot the cat has just taken
      if (leg.spot && cat.perched && Math.hypot(cat.x - leg.spot.x, cat.z - leg.spot.z) < 1.4) { g.plan = []; return; }
      startHop(g, leg.to);
      g.spot = leg.spot ?? null;
      g.plan.shift();
      return;
    }
    g.spot = null;
    g.stuck = (g.stuck ?? 0) + dt;
    if (walkGoat(g, leg.to, GOAT.WALK, dt) < 0.12 || g.stuck > 12) { g.plan.shift(); g.stuck = 0; }
  }

  // ---- hens and chicks ------------------------------------------------------
  function makeHen(id, x, z, zone = null) {
    return {
      id, type: 'hen', x, z, y: 0, yaw: rng() * Math.PI * 2, home: { x, z }, zone,
      mode: 'peck', timer: between(1, 5), target: null, flutter: null, walked: 0, moving: false,
    };
  }
  const run = A.henRun;
  const hens = [
    // the mother hen, on the grass outside the run's gateway
    makeHen('hen-1', A.coopDoor.x + 3.6, A.coopDoor.z - 0.6, { minX: run.maxX + 0.3, maxX: run.maxX + 5, minZ: run.minZ, maxZ: run.maxZ }),
    makeHen('hen-2', run.minX + 5, run.minZ + 1.6, run),
    makeHen('hen-3', run.maxX - 2, run.maxZ - 2, run),
    makeHen('hen-4', A.yard.x - 5.5, A.yard.z - 3.5),
    makeHen('hen-5', A.yard.x + 4.5, A.yard.z - 5.5),
  ];
  for (const h of hens) pushOut(h.home, colliders, 0.6);
  const inBounds = (p, inset = 0.5) => { p.x = clamp(p.x, bounds.minX + inset, bounds.maxX - inset); p.z = clamp(p.z, bounds.minZ + inset, bounds.maxZ - inset); return p; };

  function stepHen(h, dt, cat) {
    h.moving = false;
    if (h.mode === 'flutter') {
      const f = h.flutter;
      f.t += dt / HEN.FLUTTER_TIME;
      const u = Math.min(1, f.t);
      h.x = f.x0 + (f.x1 - f.x0) * u;
      h.z = f.z0 + (f.z1 - f.z0) * u;
      h.y = 4 * HEN.FLUTTER_HOP * u * (1 - u);
      if (u >= 1) { h.y = 0; h.flutter = null; h.mode = 'peck'; h.timer = between(1, 3); }
      return;
    }
    const d = dist(cat, h);
    if (cat.running && !cat.perched && d < HEN.NOTICE) {
      // aside: away from the cat, and out of the line she is running along
      let ax = d > 1e-3 ? (h.x - cat.x) / d : 1;
      let az = d > 1e-3 ? (h.z - cat.z) / d : 0;
      const side = (cat.fx ?? 0) * az - (cat.fz ?? 0) * ax >= 0 ? 1 : -1;
      ax += -(cat.fz ?? 0) * side * 0.9;
      az += (cat.fx ?? 0) * side * 0.9;
      const n = Math.hypot(ax, az) || 1;
      const far = between(HEN.FLUTTER_MIN, HEN.FLUTTER_MAX);
      const to = inBounds(pushOut({ x: h.x + (ax / n) * far, z: h.z + (az / n) * far }, colliders, 0.35));
      // a hen of the run stays inside its wire
      if (h.zone === run) { to.x = clamp(to.x, run.minX + 0.3, run.maxX - 0.3); to.z = clamp(to.z, run.minZ + 0.3, run.maxZ - 0.3); pushOut(to, colliders, 0.35); }
      if (inWater(waters, to.x, to.z, 0.3)) { to.x = h.x; to.z = h.z; }
      h.flutter = { x0: h.x, z0: h.z, x1: to.x, z1: to.z, t: 0 };
      h.mode = 'flutter';
      h.yaw = heading(to.x - h.x, to.z - h.z);
      events.push({ type: 'cluck', id: h.id });
      return;
    }
    if (h.mode === 'peck') {
      h.timer -= dt;
      if (h.timer > 0) return;
      for (let i = 0; i < 8; i++) {
        const a = rng() * Math.PI * 2;
        const r = between(0.6, HEN.HOME_R);
        const p = { x: h.home.x + Math.sin(a) * r, z: h.home.z + Math.cos(a) * r };
        if (h.zone && !inRect(h.zone, p.x, p.z, 0.5)) continue;
        if (clearance(colliders, p.x, p.z) < 0.5 || inWater(waters, p.x, p.z, 0.5)) continue;
        h.target = p;
        h.mode = 'stroll';
        return;
      }
      h.timer = 1;
      return;
    }
    // stroll
    const before = { x: h.x, z: h.z };
    h.yaw = turnToward(h.yaw, heading(h.target.x - h.x, h.target.z - h.z), 5 * dt);
    const left = stepToward(h, h.target.x, h.target.z, HEN.STROLL * dt);
    pushOut(h, colliders, 0.35);
    h.walked += dist(before, h);
    h.moving = true;
    h.stuck = (h.stuck ?? 0) + dt;
    if (left < 0.08 || h.stuck > 14) { h.mode = 'peck'; h.timer = between(2, 6); h.stuck = 0; }
  }

  const catTrail = createTrail();
  const coop = { x: A.coopDoor.x, z: A.coopDoor.z };
  function makeChick(i, hen) {
    const a = (i / 4) * Math.PI * 2;
    return {
      id: `chick-${i + 1}`, type: 'chick', hen,
      x: hen.x + Math.sin(a) * 0.6, z: hen.z + Math.cos(a) * 0.6, y: 0, yaw: a,
      mode: 'home', following: false, order: -1, tired: 0, waitT: 0, slot: { a, r: 0.6, t: between(2, 5) },
      placed: null,   // step 3: { x, z } where a lost chick waits to be found
      scatter: null, walked: 0, moving: false,
    };
  }
  const chicks = [0, 1, 2, 3].map((i) => makeChick(i, hens[0]));
  const lineOrder = () => chicks.filter((c) => c.following).length;
  const chickHome = (c) => c.placed ?? c.hen;

  function moveChick(c, tx, tz, speed, dt) {
    const before = { x: c.x, z: c.z };
    const left = stepToward(c, tx, tz, speed * dt);
    pushOut(c, colliders, 0.25);
    const moved = dist(before, c);
    if (moved > 1e-4) { c.yaw = turnToward(c.yaw, heading(c.x - before.x, c.z - before.z), 12 * dt); c.moving = true; c.walked += moved; }
    return left;
  }
  function stepChick(c, dt, cat) {
    c.moving = false;
    if (c.tired > 0) c.tired -= dt;
    const d = dist(cat, c);
    const calm = !cat.running && !cat.inWater && !cat.perched;
    if (c.mode === 'scatter') {
      const s = c.scatter;
      s.t += dt / CHICK.SCATTER_TIME;
      const u = Math.min(1, s.t);
      c.x = s.x0 + (s.x1 - s.x0) * u;
      c.z = s.z0 + (s.z1 - s.z0) * u;
      c.y = 4 * 0.12 * u * (1 - u);
      c.moving = true;
      if (u >= 1) { c.y = 0; c.scatter = null; c.mode = 'wait'; c.waitT = 0; }
      return;
    }
    if (cat.running && !cat.perched && d < CHICK.SCATTER_RANGE) {
      // a short dash away, then it stops and looks
      let ax = d > 1e-3 ? (c.x - cat.x) / d : Math.sin(c.yaw);
      let az = d > 1e-3 ? (c.z - cat.z) / d : Math.cos(c.yaw);
      // never driven off: a chick already a few steps from home dashes back toward it
      const mum = chickHome(c);
      const fromHome = dist(c, mum);
      if (fromHome > 3) { ax = (mum.x - c.x) / fromHome; az = (mum.z - c.z) / fromHome; }
      const to = inBounds(pushOut({ x: c.x + ax * CHICK.SCATTER_DIST, z: c.z + az * CHICK.SCATTER_DIST }, colliders, 0.25));
      if (inWater(waters, to.x, to.z, 0.2)) { to.x = c.x; to.z = c.z; }
      c.scatter = { x0: c.x, z0: c.z, x1: to.x, z1: to.z, t: 0 };
      c.mode = 'scatter';
      c.wasFollowing = c.following;
      c.following = false;
      c.yaw = heading(ax, az);
      events.push({ type: 'peep', id: c.id });
      return;
    }
    if (c.mode === 'wait') {
      // regroup: back into the line behind a calm cat, or home to the hen
      c.waitT += dt;
      if (calm && c.wasFollowing && d < CHICK.LOSE) { c.mode = 'follow'; c.order = lineOrder(); c.following = true; return; }
      if (c.waitT > 4 || !c.wasFollowing) { c.mode = 'home'; c.wasFollowing = false; }
      return;
    }
    if (c.mode === 'follow') {
      // never a runner, a swimmer or a cat up on something: it waits
      if (!calm) {
        if (cat.running) { c.following = false; c.wasFollowing = true; c.mode = 'wait'; c.waitT = 0; }
        return;
      }
      const home = chickHome(c);
      if (d > CHICK.LOSE || (!c.placed && dist(c, home.home ?? home) > CHICK.LEASH)) {
        c.following = false; c.mode = 'home'; c.tired = CHICK.TIRED;
        return;
      }
      const t = catTrail.behind(cat.x, cat.z, CHICK.FIRST + CHICK.GAP * Math.max(0, c.order));
      if (inWater(waters, t.x, t.z, 0.2)) return;
      if (Math.hypot(t.x - c.x, t.z - c.z) > 0.06) moveChick(c, t.x, t.z, CHICK.SPEED, dt);
      return;
    }
    // home: by the hen (or waiting where it was put), until a calm cat comes by
    if (calm && c.tired <= 0 && d < CHICK.NOTICE) {
      c.mode = 'follow'; c.order = lineOrder(); c.following = true;
      events.push({ type: 'chick-follow', id: c.id });
      return;
    }
    const home = chickHome(c);
    c.slot.t -= dt;
    if (c.slot.t <= 0) { c.slot = { a: rng() * Math.PI * 2, r: between(0.35, CHICK.HOME_R), t: between(2, 6) }; }
    const r = c.placed ? Math.min(0.3, c.slot.r) : c.slot.r;
    const tx = home.x + Math.sin(c.slot.a) * r;
    const tz = home.z + Math.cos(c.slot.a) * r;
    const far = Math.hypot(tx - c.x, tz - c.z);
    if (far > 0.12) moveChick(c, tx, tz, far > 2.5 ? CHICK.SPEED * 0.6 : CHICK.TODDLE, dt);
  }

  // ---- the sheepdog --------------------------------------------------------
  const dogHome = { x: A.kennelFront.x, z: A.kennelFront.z };
  const dog = {
    id: 'sheepdog', type: 'sheepdog', x: dogHome.x, z: dogHome.z, y: 0, yaw: Math.PI / 2,
    mode: 'lie', timer: 0, restT: 0, wag: false, walked: 0, moving: false, side: 1, met: false,
  };
  function stepDog(dt, cat) {
    dog.moving = false;
    const d = dist(cat, dog);
    const catOnGround = !cat.perched && !cat.inWater;
    dog.wag = d < DOG.WAG;
    if (dog.mode === 'lie') {
      if (dog.restT > 0) dog.restT -= dt;
      if (dog.restT <= 0 && catOnGround && d < DOG.NOTICE && dist(cat, dogHome) < DOG.LEASH - 4) {
        dog.mode = 'come';
        if (!dog.met) { dog.met = true; events.push({ type: 'dog-hello' }); }
      }
      return;
    }
    const goTo = (tx, tz, speed) => {
      const before = { x: dog.x, z: dog.z };
      const next = { x: dog.x, z: dog.z };
      const left = stepToward(next, tx, tz, speed * dt);
      pushOut(next, colliders, 0.4);
      // sliding round something never makes the step longer
      const made = dist(next, before);
      if (made > speed * dt) { next.x = before.x + ((next.x - before.x) * speed * dt) / made; next.z = before.z + ((next.z - before.z) * speed * dt) / made; }
      if (inWater(waters, next.x, next.z, 0.3)) return left; // he stays on the bank
      dog.x = next.x; dog.z = next.z;
      const moved = dist(before, dog);
      if (moved > 1e-4) { dog.yaw = turnToward(dog.yaw, heading(dog.x - before.x, dog.z - before.z), 7 * dt); dog.moving = true; dog.walked += moved; }
      return left;
    };
    if (dog.mode === 'home') {
      if (goTo(dogHome.x, dogHome.z, DOG.TROT) < 0.15) { dog.mode = 'lie'; dog.restT = DOG.REST; dog.yaw = Math.PI / 2; }
      return;
    }
    // come, beside: to a spot at her side, never in front of her
    const fx = cat.fx ?? 0;
    const fz = cat.fz ?? 1;
    if (dog.mode === 'come') dog.side = (dog.x - cat.x) * fz - (dog.z - cat.z) * fx >= 0 ? 1 : -1;
    const heel = { x: cat.x + fz * DOG.SIDE * dog.side - fx * 0.15, z: cat.z - fx * DOG.SIDE * dog.side - fz * 0.15 };
    const gone = !catOnGround || d > DOG.LOST || dist(cat, dogHome) > DOG.LEASH;
    if (dog.mode === 'come') {
      if (gone && (d > DOG.LOST || dist(cat, dogHome) > DOG.LEASH)) { dog.mode = 'home'; return; }
      if (!catOnGround) return; // she is up on something: he waits below
      if (goTo(heel.x, heel.z, DOG.TROT) < 0.5) { dog.mode = 'beside'; dog.timer = DOG.WALK_TIME; }
      return;
    }
    // beside her: her pace when she is near, his own trot to catch up
    dog.timer -= dt;
    if (dog.timer <= 0 || gone) { dog.mode = 'home'; dog.restT = DOG.REST; return; }
    const pace = d < DOG.HEEL_RANGE ? clamp(cat.speed ?? 0, DOG.TROT, DOG.HEEL_MAX) : DOG.TROT;
    if (dist(heel, dog) > 0.25) goTo(heel.x, heel.z, pace);
    else if ((cat.speed ?? 0) < 0.3) dog.yaw = turnToward(dog.yaw, heading(fx, fz), 3 * dt);
  }

  // ---- ducklings -----------------------------------------------------------
  const pond = A.pond;
  const decks = (waters[0]?.decks ?? []);
  const duckTrail = createTrail(0.15, 60);
  const ducklings = [0, 1, 2, 3].map((i) => ({
    id: `duckling-${i + 1}`, type: 'duckling', x: pond.x - 2 + i * 0.4, z: pond.z + 1 - i * 0.3, y: 0, yaw: 0, moving: false, walked: 0,
  }));
  let ducklingsWithCat = false;
  let paddle = 0;
  function stepDucklings(dt, cat, env) {
    const inPond = Math.hypot(cat.x - pond.x, cat.z - pond.z) < pond.r;
    const nearest = Math.min(...ducklings.map((k) => dist(cat, k)));
    const was = ducklingsWithCat;
    ducklingsWithCat = !!cat.inWater && inPond && (was || nearest < DUCKLING.NOTICE);
    if (ducklingsWithCat && !was) events.push({ type: 'ducklings-follow' });
    // the leader: the cat, or the first duck, or (no ducks) a slow circle
    let lead = env?.ducks?.[0] ?? null;
    if (!lead) { paddle += dt * 0.3; lead = { x: pond.x + Math.cos(paddle) * 2.5, z: pond.z + Math.sin(paddle) * 2.5 }; }
    duckTrail.push(lead.x, lead.z);
    const trail = ducklingsWithCat ? catTrail : duckTrail;
    const head = ducklingsWithCat ? cat : lead;
    ducklings.forEach((k, i) => {
      const t = trail.behind(head.x, head.z, DUCKLING.FIRST + DUCKLING.GAP * i);
      const before = { x: k.x, z: k.z };
      if (Math.hypot(t.x - k.x, t.z - k.z) > 0.05) stepToward(k, t.x, t.z, DUCKLING.SPEED * dt);
      // on the water, off the jetty
      const dx = k.x - pond.x;
      const dz = k.z - pond.z;
      const r = Math.hypot(dx, dz);
      const max = pond.r - 0.6;
      if (r > max) { k.x = pond.x + (dx / r) * max; k.z = pond.z + (dz / r) * max; }
      for (const dk of decks) {
        if (inRect(dk, k.x, k.z, -0.3)) k.z = k.z < (dk.minZ + dk.maxZ) / 2 ? dk.minZ - 0.3 : dk.maxZ + 0.3;
      }
      const moved = dist(before, k);
      k.moving = moved > 1e-4;
      if (k.moving) { k.yaw = turnToward(k.yaw, heading(k.x - before.x, k.z - before.z), 6 * dt); k.walked += moved; }
    });
  }

  const all = [...cows, ...goats, ...hens, ...chicks, dog, ...ducklings];
  const jobCow = cows[0];

  const sim = {
    cows, goats, hens, chicks, dog, ducklings, all, jobCow,
    events,
    nudge: null,
    cowRoute,
    get ducklingsWithCat() { return ducklingsWithCat; },

    step(dt, cat, env = {}) {
      events.length = 0;
      sim.nudge = null;
      if (!(dt > 0)) return;
      const step = Math.min(dt, 0.1); // a long frame is not a long stride
      catTrail.push(cat.x, cat.z);
      for (const cow of cows) {
        cow.ridden = cat.riding === cow.id;
        stepCow(cow, step, cat);
        cow.perch.x = cow.x;
        cow.perch.z = cow.z;
      }
      if (helloRest > 0 && greeter === null) helloRest -= step;
      for (const g of goats) stepGoat(g, step, cat);
      for (const h of hens) stepHen(h, step, cat);
      for (const c of chicks) stepChick(c, step, cat);
      stepDog(step, cat);
      stepDucklings(step, cat, env);
    },

    // A meow at `pos`: every cow in earshot lifts her head and looks, and the
    // nearest one moos. Returns that cow, or null.
    meow(pos) {
      let nearest = null;
      let best = COW.MOO_RANGE;
      for (const cow of cows) {
        const d = dist(pos, cow);
        if (d >= COW.MOO_RANGE) continue;
        if (!cow.follow) { cow.mode = 'look'; cow.timer = COW.LOOK_TIME; cow.target = null; cow.lookAt = { x: pos.x, z: pos.z }; }
        if (d < best && cow.mooCool <= 0) { best = d; nearest = cow; }
      }
      if (nearest) { nearest.mooCool = 1.5; events.push({ type: 'moo', id: nearest.id }); }
      return nearest;
    },

    // ---- step 3's hooks --------------------------------------------------------
    // The job cow follows the cat to the milking shed. She walks only while
    // the cat is ahead of her and near; `cow.follow.arrived` (and a
    // 'cow-arrived' event) say she is at the door. Nothing times it.
    startCowFollow(cow = jobCow, route = cowRoute) {
      if (cow.follow) return cow.follow;
      const points = [{ x: cow.x, z: cow.z }];
      // Across the field to the gate's approach: straight if nothing is in the
      // way (the trough, a tree), else round by a corner that is clear.
      const m = cowClear(cow);
      const clearVia = (v) => segClear(colliders, cow.x, cow.z, v.x, v.z, m) && segClear(colliders, v.x, v.z, route[0].x, route[0].z, m);
      if (!segClear(colliders, cow.x, cow.z, route[0].x, route[0].z, m)) {
        const via = [
          { x: route[0].x, z: cow.z }, { x: cow.x, z: route[0].z },
          { x: route[0].x + 4, z: cow.z }, { x: route[0].x + 8, z: cow.z }, { x: cow.x, z: route[0].z + 4 }, { x: cow.x, z: route[0].z - 4 },
        ].filter((v) => inRect(pasture, v.x, v.z)).find(clearVia);
        if (via) points.push(via);
      }
      points.push(...route);
      cow.follow = { line: polyline(points), s: 0, arrived: false, back: false };
      cow.mode = 'follow';
      cow.target = null;
      return cow.follow;
    },
    // Lets her go: she walks back the way she came and grazes again.
    stopCowFollow(cow = jobCow) {
      if (cow.follow) { cow.follow.back = true; cow.follow.arrived = false; }
    },
    // Chicks: put one somewhere to be found (it waits there and follows a calm
    // cat any distance); ask whether it has been walked to the coop; send it
    // back to its hen.
    placeChick(id, x, z) {
      const c = chicks.find((k) => k.id === id);
      if (!c) return null;
      c.placed = { x, z };
      c.x = x; c.z = z; c.mode = 'home'; c.following = false; c.wasFollowing = false; c.tired = 0;
      return c;
    },
    chickAtCoop(id) {
      const c = chicks.find((k) => k.id === id);
      return !!c && dist(c, coop) <= CHICK.COOP_R;
    },
    homeChick(id) {
      const c = chicks.find((k) => k.id === id);
      if (c) { c.placed = null; c.following = false; c.wasFollowing = false; c.mode = 'home'; c.tired = CHICK.TIRED; }
    },
    coop,
  };
  return sim;
}
