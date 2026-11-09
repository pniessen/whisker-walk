import * as THREE from 'three';
import { mulberry32, seedFromCode } from '../rng.js';
import { createNightSky } from './nightsky.js';

// ---------------------------------------------------------------------------
// CLOUDS — a few soft low-poly clouds drifting across the outdoor skies
// (Stream 4 round four, docs/VISUAL-PASS.md "Stream 4 round four — clouds").
//
// THE BUDGET. Every puff of every cloud is one instance of ONE InstancedMesh
// with ONE material: +1 draw call in the main pass, 0 in the shadow pass
// (castShadow false, and rig.js's caster sweep and mergeprops.js both skip
// `userData.clouds`). Triangles are the cheap resource (VISUAL-PASS.md
// section 0), so the puffs are a subdivided icosahedron rather than a bare one.
//
// THE CLOUDS FOLLOW THE CAMERA. Real clouds are kilometres away and show no
// parallax when you walk; ours are centred on the camera's xz every frame, so
// they behave the same and, just as importantly, their distance from the
// camera is bounded by construction. That is what keeps them inside the game
// camera's 300m far plane (main.js) wherever the cat walks, and lets them sit
// as far out — and so as low in the sky — as that plane allows. The default
// game view only shows the sky up to ~7 degrees above level (render/sky.js's
// header does that arithmetic), so a cloud has to be far out to be seen at all.
//
// THE DRIFT. Each cloud runs along the lawn's wind direction (grass.js's
// WIND_DIR, so the world agrees with itself) on a chord of a disc of radius
// SKY_RADIUS around the camera, and wraps from the downwind end of its chord
// back to the upwind end. A cloud shrinks to nothing over the last FADE_LEN
// metres of its chord and grows back from nothing at the start, so the wrap is
// a slow dissolve far out at the horizon, never a pop. Positions are a pure
// function of absolute time (cloudPlace), so there is no running state to
// drift and reduced motion is simply "always t = 0".
//
// DETERMINISM. Layout comes from a fixed per-area seed (a hash of the area
// id) on its own mulberry32 stream. It never touches walkRng, so the shared
// co-walk randomness is untouched, and it sends nothing over the wire: every
// client lays out the same sky for the same area anyway.
//
// COLOUR. The vertex colours carry SHADING, not colour: red = a baked
// per-face facet light (the flat low-poly look without lighting the material),
// green = how far up the puff the face sits (0 on the flat underside). The
// shader turns those into mix(under, top, green) * red from two uniforms, and
// cloudPalette() picks those from the live fog colour each frame. That fog
// colour is the sky's own horizon stop (world/builder.js applySky), the dusk
// horizon (walk.js), or the rain/sunset horizon (weather.js), so the clouds
// re-tint by themselves when a shower clears and the sky comes back.
//
// NIGHT SKY. On a dusk walk the rig also owns the stars and moon
// (render/nightsky.js), even on a tier with clouds off: they cost two cheap
// draws and dusk is where the magic is. `night` on the rig is null by day.
//
// THE DAY'S CHANGES. A cloud never repeats itself. Each time it wraps from its
// downwind end back to its upwind end (a "lap", lapOf) it comes back as a new
// shape: puffs re-rolled from a small integer hash of (cloud, puff, lap), no
// RNG stream, so every client and every replay sees the same sky at the same
// time. Between laps each puff also billows, its radius breathing by up to
// BILLOW over 60-110 s. Every factor is <= 1, so the laid-out shape is the
// biggest the cloud ever is and cloudReach still bounds it. Lap 0 at t = 0
// is exactly the layout (sin(0) = 0), so the walk-start sky and the reduced-
// motion sky (always t = 0) are unchanged.
//
// FOG. The material has fog off: scene fog runs out at 110-130m and every
// cloud is further than that, so fogged clouds would vanish into the haze. A
// gentler manual haze (HAZE_NEAR..HAZE_FAR, at most HAZE_MAX) pulls the far
// ones toward the horizon colour instead, the way distance softens real ones.
// ---------------------------------------------------------------------------

// Outdoor areas only: the den is a room and its window does not show sky
// far enough out to matter.
export const CLOUD_AREAS = Object.freeze(['neighborhood', 'park', 'seaside', 'docks', 'woods', 'river', 'moor', 'pines', 'gorge']);

// One wind direction for the whole world: grass.js's WIND_DIR (0.8, 0.6).
export const WIND_DIR = Object.freeze([0.8, 0.6]);
// Across-wind unit vector (WIND_DIR turned 90 degrees in xz).
const ACROSS = Object.freeze([-0.6, 0.8]);

// The disc around the camera the cloud centres live in (metres). With the
// largest cloud's reach and top that is still ~30m inside the 300m far plane.
export const SKY_RADIUS = 220;
// No chord passes closer than this to the camera: a cloud straight overhead is
// out of view at every pitch the camera allows, so it would waste a cloud.
const MIN_ACROSS = 0.25;
const MAX_ACROSS = 0.85;
// The dissolve at each end of a chord.
export const FADE_LEN = 45;
// m/s. ~0.4 degrees a second for a cloud 150m out: you can see it move if
// you watch, but it never pulls the eye.
const SPEED_MIN = 0.6;
const SPEED_MAX = 1.1;

// Altitude of a cloud's flat base. The floor is the default; createClouds
// raises it per area if the horizon band is tall enough that a cloud at the
// edge of the disc would sit behind its crest (the Docks' skyline is).
export const BASE_MIN = 30;
export const BASE_SPREAD = 16;
// From the area centre, at cat height, a cloud's base clears the horizon
// band's highest point by at least this much elevation.
export const BAND_CLEARANCE_DEG = 1.5;
const EYE_Y = 2;

// Puff shape. A unit icosahedron with every vertex below FLAT_Y pulled up to
// it: the flat underside is the classic low-poly cloud, and it is where the
// darker sky-tinted colour lives.
const FLAT_Y = -0.35;
// Puffs are squashed to this fraction of their width.
export const SQUASH = 0.6;
const PUFF_MIN = 7;
const PUFF_MAX = 13;

// Haze, by distance from the camera (metres) and its strength at the far end.
const HAZE_NEAR = 120;
const HAZE_FAR = 280;
const HAZE_MAX = 0.5;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in test/clouds.test.js)
// ---------------------------------------------------------------------------

// The fixed per-area seed: FNV-1a of the area id (rng.js's seedFromCode)
// with a salt so it never shares a stream with anything else keyed on a name.
export function areaSeed(areaId) {
  return (seedFromCode(`clouds:${areaId}`) ^ 0x5c10d5) >>> 0;
}

// layoutClouds(areaId, count, baseMin) — `count` clouds, each
//   { v, u0, speed, base, yaw, scale, puffs: [{ x, z, r, yaw }] }
// in its own frame (puff x along the cloud's long axis). Deterministic: the
// same area and count always give the same sky.
export function layoutClouds(areaId, count, baseMin = BASE_MIN) {
  const rng = mulberry32(areaSeed(areaId));
  const clouds = [];
  for (let i = 0; i < count; i++) {
    // Start bearings are stratified round the compass (one slot per cloud,
    // jittered within it), so the first look at the sky in any direction finds
    // a cloud or two rather than a lucky clump on one side and a bare
    // quarter on the other. The start point is then read back as a chord:
    // how far across the wind (v, kept off the overhead band and off the
    // disc's rim) and how far along it (u0).
    const bearing = ((i + 0.15 + rng() * 0.7) / count) * Math.PI * 2;
    const dist = SKY_RADIUS * (0.45 + 0.45 * rng());
    const sx = Math.cos(bearing) * dist;
    const sz = Math.sin(bearing) * dist;
    let v = sx * ACROSS[0] + sz * ACROSS[1];
    const lim = Math.min(Math.max(Math.abs(v), SKY_RADIUS * MIN_ACROSS), SKY_RADIUS * MAX_ACROSS);
    v = v < 0 ? -lim : lim;
    const half = Math.sqrt(SKY_RADIUS * SKY_RADIUS - v * v);
    const u0 = Math.min(Math.max(sx * WIND_DIR[0] + sz * WIND_DIR[1], -half), half);
    const n = 3 + Math.floor(rng() * 4); // 3-6 puffs
    const span = 4 + n * 3.5;
    const puffs = [];
    for (let j = 0; j < n; j++) {
      // Spread along the long axis, biggest in the middle so the cloud domes.
      const x = n === 1 ? 0 : -span + (2 * span * j) / (n - 1) + (rng() - 0.5) * 3;
      const edge = Math.abs(x) / span;
      puffs.push({
        x,
        z: (rng() - 0.5) * 8,
        r: (PUFF_MIN + rng() * (PUFF_MAX - PUFF_MIN)) * (1 - 0.4 * edge),
        yaw: rng() * Math.PI * 2,
      });
    }
    clouds.push({
      v,
      u0,
      speed: SPEED_MIN + rng() * (SPEED_MAX - SPEED_MIN),
      base: baseMin + rng() * BASE_SPREAD,
      // A small twist off broadside; see update() for why broadside.
      yaw: (rng() - 0.5) * 0.8,
      scale: 0.8 + rng() * 0.5,
      puffs,
    });
  }
  return clouds;
}

// ---- Far banks (polish-hedgesky) -------------------------------------------
// The clouds above sit 8 degrees and more over the horizon, out of the walk
// camera's view (it sees ~7 degrees up), so a walk's sky was an empty
// gradient. BANKS are the far, long, flat clouds that lie along the hills:
// BANK_DIST out from the camera (they follow it like the rest), each in a
// fixed bearing apart from a slow BANK_SWING sway and its puffs' billow. A
// bank is BANK_BASE long low puffs stretched BANK_STRETCH along it and
// squashed to BANK_SQUASH, with BANK_CROWN smaller rounder puffs lifted onto
// its back over the joins, so its top is lumpy like a far cumulus bank
// rather than a thin lens.
// Each bank's base clears the horizon band's crest IN ITS OWN BEARING (the
// band's elevation profile, measured from the area centre at cat height) by
// BANK_CLEARANCE_DEG, and the band's top by BANK_ABOVE_TOP metres, so where
// the hills are low a bank sits just over them, in view.
export const BANK_DIST = 185;
export const BANK_STRETCH = 1.8;
export const BANK_SQUASH = 0.42;
const BANK_BASE = 3;
const BANK_CROWN = 2;
export const BANK_CLEARANCE_DEG = 0.5;
export const BANK_ABOVE_TOP = 4;
const BANK_SWING = 0.026; // radians, ~1.5 degrees
const BANK_SWING_PERIOD = 900; // seconds
// Per area, on the high rungs: high clouds (instead of the tier's count) and
// banks. The Moor and the Seaside are big open skies; the Gorge is a canyon,
// its walls hide the low sky, so it has fewer clouds and no banks.
export const AREA_SKY = Object.freeze({
  moor: Object.freeze({ clouds: 12, banks: 5 }),
  seaside: Object.freeze({ clouds: 12, banks: 5 }),
  river: Object.freeze({ clouds: 10, banks: 5 }),
  park: Object.freeze({ clouds: 10, banks: 4 }),
  neighborhood: Object.freeze({ clouds: 10, banks: 4 }),
  woods: Object.freeze({ clouds: 10, banks: 4 }),
  pines: Object.freeze({ clouds: 10, banks: 4 }),
  docks: Object.freeze({ clouds: 10, banks: 4 }),
  gorge: Object.freeze({ clouds: 7, banks: 0 }),
});
// The tier's cloudCount (10 on the high rungs, 6 on the low) scales an area's
// own counts.
export function skyCounts(areaId, cloudCount) {
  const a = AREA_SKY[areaId] ?? { clouds: 10, banks: 0 };
  const k = cloudCount / 10;
  return { clouds: Math.max(1, Math.round(a.clouds * k)), banks: Math.round(a.banks * k) };
}

export function bankSeed(areaId) {
  return (seedFromCode(`cloudbanks:${areaId}`) ^ 0xba7c5) >>> 0;
}

// layoutBanks(areaId, count, baseAt) — `count` banks
//   { bank: true, bearing, dist, base, scale, swing, phase, yaw: 0, puffs }
// stratified round the compass. baseAt(bearing, halfAngle, farDist) gives a
// bank's base (default: the BASE_MIN floor, for tests of the shapes alone).
export function layoutBanks(areaId, count, baseAt = () => BASE_MIN) {
  const rng = mulberry32(bankSeed(areaId));
  const banks = [];
  for (let i = 0; i < count; i++) {
    const bearing = ((i + 0.2 + rng() * 0.6) / count) * Math.PI * 2;
    const scale = 0.75 + rng() * 0.4;
    const puffs = [];
    const gap = 22 + rng() * 6;
    // The long low puffs; `st`/`sq` a puff's own stretch and squash, `lift`
    // how far its flat base sits over the bank's (never below it).
    for (let j = 0; j < BANK_BASE; j++) {
      const x = (j - (BANK_BASE - 1) / 2) * gap + (rng() - 0.5) * 6;
      puffs.push({
        x,
        z: (rng() - 0.5) * 8,
        r: (12 + rng() * 5) * (j === 1 ? 1 : 0.85),
        // a small twist off the bank's own line (radians)
        yaw: (rng() - 0.5) * 0.3,
        st: BANK_STRETCH, sq: BANK_SQUASH, lift: 0,
      });
    }
    // The crown: rounder puffs on its back, over the joins.
    for (let j = 0; j < BANK_CROWN; j++) {
      const r = 8 + rng() * 4;
      puffs.push({
        x: (j - (BANK_CROWN - 1) / 2) * gap + (rng() - 0.5) * 8,
        z: (rng() - 0.5) * 6,
        r,
        yaw: (rng() - 0.5) * 0.6,
        st: 1.15, sq: 0.62, lift: 2 + rng() * 3,
      });
    }
    const bank = {
      bank: true, bearing, dist: BANK_DIST, base: BASE_MIN, scale,
      swing: BANK_SWING * (0.5 + rng() * 0.5) * (rng() < 0.5 ? -1 : 1),
      phase: rng() * Math.PI * 2, yaw: 0, puffs,
    };
    const { horizontal } = cloudReach(bank);
    const half = Math.atan2(horizontal, BANK_DIST) + Math.abs(bank.swing);
    bank.base = baseAt(bearing, half, Math.hypot(BANK_DIST + 20 * scale, horizontal));
    banks.push(bank);
  }
  return banks;
}

// bankPlace(bank, t, out) — a bank's centre relative to the camera's xz and
// its bearing at time t: { x, z, a }.
export function bankPlace(bank, t, out = null) {
  const a = bank.bearing + bank.swing * Math.sin((TWO_PI * t) / BANK_SWING_PERIOD + bank.phase);
  const o = out ?? {};
  o.x = Math.cos(a) * bank.dist;
  o.z = Math.sin(a) * bank.dist;
  o.a = a;
  return o;
}

// bandProfile(scene, centre, bins) — the band's steepest elevation (degrees)
// in each of `bins` equal bearing sectors, seen from (centre, EYE_Y), and
// the band's top (world y). null when the scene has no band.
export function bandProfile(scene, centre = { x: 0, z: 0 }, bins = 72) {
  const band = scene.getObjectByName('horizonBand');
  const pos = band?.geometry?.attributes?.position;
  if (!pos) return null;
  band.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  const deg = new Array(bins).fill(0);
  let top = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(band.matrixWorld);
    top = Math.max(top, v.y);
    const dx = v.x - centre.x;
    const dz = v.z - centre.z;
    const el = (Math.atan2(v.y - EYE_Y, Math.hypot(dx, dz)) * 180) / Math.PI;
    const b = Math.floor(((Math.atan2(dz, dx) / TWO_PI + 1) % 1) * bins) % bins;
    if (el > deg[b]) deg[b] = el;
  }
  return { deg, top, bins };
}

// The base a bank at `bearing` (spanning ±halfAngle radians, its far edge
// farDist out) needs over a band profile.
export function bankBase(profile, bearing, halfAngle, farDist) {
  if (!profile) return BASE_MIN;
  const { deg, top, bins } = profile;
  const w = TWO_PI / bins;
  const lo = Math.floor((bearing - halfAngle) / w) - 1;
  const hi = Math.floor((bearing + halfAngle) / w) + 1;
  let el = 0;
  for (let b = lo; b <= hi; b++) el = Math.max(el, deg[((b % bins) + bins) % bins]);
  const tan = Math.tan(((el + BANK_CLEARANCE_DEG) * Math.PI) / 180);
  return Math.ceil(Math.max(top + BANK_ABOVE_TOP, EYE_Y + tan * farDist));
}

// wrap x into [-half, half).
function wrap(x, half) {
  const w = 2 * half;
  return ((((x + half) % w) + w) % w) - half;
}

// cloudPlace(cloud, t, out) — where a cloud's centre is at absolute time t,
// relative to the camera's xz, and its dissolve factor (0 at a chord end,
// 1 for most of the chord): { x, z, u, half, fade }. Writes into `out` when
// given (update() passes one scratch object, so the frame allocates nothing),
// else returns a fresh object.
export function cloudPlace(cloud, t, out = null) {
  const half = Math.sqrt(SKY_RADIUS * SKY_RADIUS - cloud.v * cloud.v);
  const u = wrap(cloud.u0 + cloud.speed * t, half);
  const d = half - Math.abs(u);
  const k = Math.min(Math.max(d / FADE_LEN, 0), 1);
  const o = out ?? {};
  o.x = u * WIND_DIR[0] + cloud.v * ACROSS[0];
  o.z = u * WIND_DIR[1] + cloud.v * ACROSS[1];
  o.u = u;
  o.half = half;
  o.fade = k * k * (3 - 2 * k);
  return o;
}

// ---- The day's changes ----------------------------------------------------
export const BILLOW = 0.12;
const TWO_PI = Math.PI * 2;

// lowbias32-style 32-bit mix of four integers -> [0, 1). Pure, no state.
function hash01(a, b, c, salt) {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b) ^ Math.imul(c + 1, 0xc2b2ae35) ^ Math.imul(salt + 1, 0x27d4eb2f);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Which lap of its chord a cloud is on at absolute time t (0 at t = 0).
export function lapOf(cloud, t) {
  const half = Math.sqrt(SKY_RADIUS * SKY_RADIUS - cloud.v * cloud.v);
  const w = 2 * half;
  return Math.floor((cloud.u0 + cloud.speed * t + half) / w) - Math.floor((cloud.u0 + half) / w);
}

// puffAt(cloud, ci, j, t, out) — puff j of cloud ci at time t: { x, z, r, yaw }.
// Writes into `out` when given, else returns a fresh object.
export function puffAt(cloud, ci, j, t, out = null) {
  const p = cloud.puffs[j];
  const o = out ?? {};
  const lap = lapOf(cloud, t);
  let x = p.x;
  let z = p.z;
  let r = p.r;
  let yaw = p.yaw;
  if (lap >= 1) {
    x *= 0.8 + 0.2 * hash01(ci, j, lap, 1);
    z *= 0.7 + 0.3 * hash01(ci, j, lap, 2);
    r *= 0.72 + 0.28 * hash01(ci, j, lap, 3);
    yaw = TWO_PI * hash01(ci, j, lap, 4);
  }
  // Billow rate is fixed per puff (not per lap) so it never jumps at a wrap.
  const omega = TWO_PI / (110 - 50 * hash01(ci, j, 0, 5));
  const s = Math.sin(omega * t);
  o.x = x;
  o.z = z;
  o.r = r * (1 - BILLOW * s * s);
  o.yaw = yaw;
  return o;
}

// The furthest any cloud vertex can reach horizontally from its cloud's
// centre, and the highest any reaches above its base (metres). For the far
// plane check: a centre is within SKY_RADIUS, so a vertex is within
// SKY_RADIUS + cloudReach of the camera's xz.
export function cloudReach(cloud) {
  let h = 0;
  let top = 0;
  // (A bank's puffs carry their own stretch, squash and lift.)
  for (const p of cloud.puffs) {
    h = Math.max(h, (Math.hypot(p.x, p.z) + p.r * (p.st ?? 1)) * cloud.scale);
    top = Math.max(top, ((1 - FLAT_Y) * p.r * (p.sq ?? SQUASH) + (p.lift ?? 0)) * cloud.scale);
  }
  return { horizontal: h, top };
}

// The lowest base that keeps a cloud at the disc's edge (plus its reach)
// above the band's highest elevation seen from the area centre at cat height.
// `bandDeg` is that elevation in degrees (bandElevation below).
export function baseFor(bandDeg, reach = 0) {
  const tan = Math.tan(((bandDeg + BAND_CLEARANCE_DEG) * Math.PI) / 180);
  return Math.max(BASE_MIN, Math.ceil(EYE_Y + tan * (SKY_RADIUS + reach)));
}

// bandElevation(scene, centre) — the steepest elevation (degrees) of any
// horizon-band vertex as seen from (centre.x, EYE_Y, centre.z). 0 when the
// scene has no band.
export function bandElevation(scene, centre = { x: 0, z: 0 }) {
  const band = scene.getObjectByName('horizonBand');
  const pos = band?.geometry?.attributes?.position;
  if (!pos) return 0;
  band.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  let best = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(band.matrixWorld);
    const el = Math.atan2(v.y - EYE_Y, Math.hypot(v.x - centre.x, v.z - centre.z));
    if (el > best) best = el;
  }
  return (best * 180) / Math.PI;
}

// cloudPalette(horizon, mood, out) — { top, under, haze } THREE.Colors from
// the sky's live horizon colour. `mood` is 'day' (or false), 'dusk' (or true,
// the old boolean) or 'sunset'.
// Day: near-white tops (a breath of the horizon in them) over an underside
// pulled from the horizon toward a cool slate, which is what lets the clouds
// read against the Seaside's nearly white horizon.
// Dusk: the lit side goes warm and dim (a peach mixed into the purple horizon)
// and the underside drops below the horizon, so nothing glows white against a
// dusk sky.
// Sunset (weather.js's sunset walk, whose fog is the peach 0xf8c890 horizon):
// the tops catch the low sun, a warm cream only a step brighter than the
// horizon, never the day's near-white; the undersides go a dusky mauve.
// Without this a sunset walk used the day palette and its tops read as white
// cut-outs against an orange sky.
const WHITE = new THREE.Color(0xffffff);
const SLATE = new THREE.Color(0x76869e);
const PEACH = new THREE.Color(0xf2b08c);
const SUNLIT = new THREE.Color(0xffe2c4);
const MAUVE = new THREE.Color(0x8a6a80);
export function cloudPalette(horizon, mood = false, out = null) {
  const h = horizon instanceof THREE.Color ? horizon : new THREE.Color(horizon);
  const p = out ?? { top: new THREE.Color(), under: new THREE.Color(), haze: new THREE.Color() };
  p.haze.copy(h);
  if (mood === true || mood === 'dusk') {
    p.top.copy(h).lerp(PEACH, 0.38);
    p.under.copy(h).multiplyScalar(0.72);
  } else if (mood === 'sunset') {
    p.top.copy(h).lerp(SUNLIT, 0.45);
    p.under.copy(h).lerp(MAUVE, 0.5).multiplyScalar(0.85);
  } else {
    p.top.copy(WHITE).lerp(h, 0.12);
    p.under.copy(h).lerp(SLATE, 0.42).multiplyScalar(0.88);
  }
  return p;
}

// The unit puff: an icosahedron with a flat underside, and its per-face
// shading baked into vertex colours (see COLOUR above).
const LIGHT = new THREE.Vector3(-0.5, 1, -0.33).normalize();
export function puffGeometry(detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail); // non-indexed already
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < FLAT_Y) pos.setY(i, FLAT_Y);
  }
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f);
    b.fromBufferAttribute(pos, f + 1);
    c.fromBufferAttribute(pos, f + 2);
    n.subVectors(c, b).cross(b.clone().sub(a)).normalize();
    // Degenerate (fully flattened) faces have no normal; they lie in the
    // flat base, which faces straight down anyway.
    if (!Number.isFinite(n.x)) n.set(0, -1, 0);
    if (n.dot(a) < 0) n.negate(); // outward
    const shade = 0.84 + 0.16 * Math.max(0, n.dot(LIGHT));
    const cy = (a.y + b.y + c.y) / 3;
    const k = Math.min(Math.max((cy - FLAT_Y) / (0.5 - FLAT_Y), 0), 1);
    const up = n.y <= -0.99 ? 0 : k * k * (3 - 2 * k);
    for (let v = 0; v < 3; v++) {
      colors[(f + v) * 3] = shade;
      colors[(f + v) * 3 + 1] = up;
      colors[(f + v) * 3 + 2] = 0;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const NO_CLOUDS = Object.freeze({ mesh: null, clouds: [], night: null, update() {}, dispose() {} });

// createClouds(scene, { areaId, tier, camera, reducedMotion, dusk, sunset, centre })
// — the per-walk rig, in the session's { update, dispose } shape. Call it
// AFTER rig.js's assignShadowCasters and mergeStaticProps have scanned the
// scene (both also skip `userData.clouds`, belt and braces). A no-op stub for
// the den, an unknown area, or a tier with clouds off (unless it is dusk:
// then the night sky alone). `centre` is the area's
// middle, used once to measure the horizon band; it defaults to the origin
// every world is built around. `sunset` is a sunset-weather walk (walk.js
// passes weather.condition === 'sunset'); weather never rolls on a dusk walk,
// and a sunset lasts the whole walk, so the mood is fixed at creation while
// the colours themselves still follow the live fog.
export function createClouds(scene, {
  areaId, tier, camera, reducedMotion = false, dusk = false, sunset = false, centre,
} = {}) {
  const count = tier?.cloudCount ?? 0;
  if (!CLOUD_AREAS.includes(areaId) || !camera) return NO_CLOUDS;
  const night = dusk ? createNightSky(scene, { areaId, camera, reducedMotion }) : null;
  if (!(count > 0)) {
    if (!night) return NO_CLOUDS;
    // Clouds off, stars on.
    return { mesh: null, clouds: [], night, update: (t = 0) => night.update(t), dispose: () => night.dispose() };
  }

  // Lay out once at the floor to learn the reach, then raise the base if the
  // band needs it, and lay out again at that base (same seed, same shapes).
  const sky = skyCounts(areaId, count);
  let clouds = layoutClouds(areaId, sky.clouds);
  const reach = Math.max(...clouds.map((c) => cloudReach(c).horizontal));
  const baseMin = baseFor(bandElevation(scene, centre), reach);
  if (baseMin !== BASE_MIN) clouds = layoutClouds(areaId, sky.clouds, baseMin);
  // The far banks, each over the band in its own bearing (see BANKS above).
  const profile = sky.banks > 0 ? bandProfile(scene, centre) : null;
  const banks = layoutBanks(areaId, sky.banks, (bearing, half, far) => bankBase(profile, bearing, half, far));

  const total = [...clouds, ...banks].reduce((s, c) => s + c.puffs.length, 0);
  const mood = dusk ? 'dusk' : sunset ? 'sunset' : 'day';
  const palette = cloudPalette(scene.fog?.color ?? 0xcfe8f0, mood);
  const uniforms = {
    uTop: { value: palette.top },
    uUnder: { value: palette.under },
    uHaze: { value: palette.haze },
    uHazeRange: { value: new THREE.Vector3(HAZE_NEAR, HAZE_FAR, HAZE_MAX) },
  };
  // toneMapped false: the sky behind them is a background texture, which the
  // renderer does not tone-map, so the clouds are authored in the same display
  // colours as the sky. Tone-mapped, ACES pulls their white down to a dull
  // grey against an untouched sky. (On the composer path the output pass
  // tone-maps the whole frame, sky and clouds alike, so they still agree.)
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uHazeRange;
varying float vHaze;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vHaze = smoothstep(uHazeRange.x, uHazeRange.y, length(mvPosition.xyz)) * uHazeRange.z;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uTop;
uniform vec3 uUnder;
uniform vec3 uHaze;
varying float vHaze;`)
      // vColor is (facet shade, height up the puff, 0); see COLOUR above.
      .replace('#include <color_fragment>', `diffuseColor.rgb = mix(uUnder, uTop, vColor.g) * vColor.r;
diffuseColor.rgb = mix(diffuseColor.rgb, uHaze, vHaze);`);
  };
  material.customProgramCacheKey = () => 'whisker-clouds';

  const mesh = new THREE.InstancedMesh(puffGeometry(1), material, total);
  mesh.name = 'clouds';
  mesh.userData.clouds = true;
  // No cloud shadows: the shadow pass is the expensive one on the phone.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // The instances move every frame and follow the camera, so three's cached
  // instance bounding sphere would be stale; the clouds are around the
  // camera by construction anyway.
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const at = { x: 0, z: 0, u: 0, half: 0, fade: 0 }; // cloudPlace's scratch
  const pf = { x: 0, z: 0, r: 0, yaw: 0 }; // puffAt's scratch
  const bp = { x: 0, z: 0, a: 0 }; // bankPlace's scratch

  // update(t) — once per rendered frame, after the camera moved. `t` is
  // absolute elapsed seconds (the same t wind/grass take).
  function update(t = 0) {
    const time = reducedMotion ? 0 : t;
    const cx = camera.position.x;
    const cz = camera.position.z;
    let i = 0;
    for (let ci = 0; ci < clouds.length; ci++) {
      const cloud = clouds[ci];
      cloudPlace(cloud, time, at);
      const s = cloud.scale * at.fade;
      // Long axis across the line of sight (tangent to the circle round the
      // camera), give or take the cloud's own twist: end-on, a row of puffs
      // collapses into a stack and reads as a mushroom. Being camera-relative,
      // this turns only as fast as the cloud's bearing does, a fraction of a
      // degree a second far out, which nobody can see.
      const yaw = Math.atan2(at.z, at.x) + Math.PI / 2 + cloud.yaw;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      for (let j = 0; j < cloud.puffs.length; j++) {
        const p = puffAt(cloud, ci, j, time, pf);
        // A cloud dissolves toward its centre, keeping its flat base level.
        const ox = (p.x * cos - p.z * sin) * s;
        const oz = (p.x * sin + p.z * cos) * s;
        p3.set(cx + at.x + ox, cloud.base - FLAT_Y * p.r * SQUASH * s, cz + at.z + oz);
        q.setFromAxisAngle(up, p.yaw);
        s3.set(p.r * s, p.r * SQUASH * s, p.r * s);
        m4.compose(p3, q, s3);
        mesh.setMatrixAt(i++, m4);
      }
    }
    // The banks: fixed bearings (a slow sway), each puff laid along the bank
    // (the bank's line across the line of sight) and stretched along it.
    for (let bi = 0; bi < banks.length; bi++) {
      const bank = banks[bi];
      bankPlace(bank, time, bp);
      const s = bank.scale;
      const yaw = bp.a + Math.PI / 2;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      for (let j = 0; j < bank.puffs.length; j++) {
        const p = bank.puffs[j];
        const omega = TWO_PI / (140 - 60 * hash01(bi, j, 0, 9));
        const sn = Math.sin(omega * time);
        const r = p.r * (1 - BILLOW * sn * sn);
        const ox = (p.x * cos - p.z * sin) * s;
        const oz = (p.x * sin + p.z * cos) * s;
        p3.set(cx + bp.x + ox, bank.base + (p.lift - FLAT_Y * r * p.sq) * s, cz + bp.z + oz);
        // three's yaw turns +x toward -z, so the bank's line (cos, sin) in xz
        // is a turn of -yaw.
        q.setFromAxisAngle(up, -yaw + p.yaw);
        s3.set(r * p.st * s, r * p.sq * s, r * s);
        m4.compose(p3, q, s3);
        mesh.setMatrixAt(i++, m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    // Follow the sky: a shower that clears hands the fog its old colour back.
    if (scene.fog) cloudPalette(scene.fog.color, mood, palette);
    night?.update(t);
  }

  function dispose() {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    mesh.dispose();
    night?.dispose();
  }

  update(0); // placed before the first frame
  return { mesh, clouds, banks, palette, night, update, dispose };
}
