// =============================================================================
// THE ROOFTOPS' FLOCK, DRAWN (Rooftops step 3). The fourteen birds of
// roofsflock.js's roster, on the place's perches (area.birdPerches), made per
// walk by the area's life (roofslife.js).
//
// TWO DRAWS (S12). Every bird is one instance of `roofsFlock` (body, head,
// beak and tail in one low-poly, vertex-coloured geometry) and two of
// `roofsFlockWings` (one wing, mirrored for the right): two InstancedMeshes,
// coloured per kind by instanceColor (BIRD_LOOK; the guide white, GUIDE_LOOK), scaled by the kind's
// BIRD_KINDS scale, casting nothing, never culled. Made inside
// withLocalUuids, so making them draws nothing on Math.random.
//
// PERCHED. A bird stands with its feet on its perch's spot. A pigeon or a
// sparrow on a `roof` perch (a peck spot on a flat roof) pecks: its nose dips
// 0.35 rad for 0.25 s, every 1.5 to 3 s ("Pigeons and sparrows ... peck on
// flat roofs"). Any other bird sits and looks about: every 2 to
// 5 s it turns its head (the bird turns as one: it is one instance) to a new
// look within LOOK.reach of its rest heading. Within 6 m of her it stops
// and faces her. Its wings lie folded along its sides. All of it is hash01
// of the bird and a counter, and the flock's own walk seconds (the sum of the
// dt it is given): no randomness, no clock.
//
// THE LIVE STATE, `birds`: { id, kind, at, flying, to, pos, flights,
// guideStep } per bird. `at` is the perch it is on (the one it left, while it
// flies), `to` the one it is flying to (its own perch in a flutter; null
// perched), `pos` the spot it is drawn at. update() allocates nothing while
// no bird is flushed and adds nothing to the scene; dispose() takes both
// meshes away.
//
// THE CRITTERS (S5). In a walk each bird is also one of the walk's critters
// (the record's critterSpawns: type 'bird' or 'seagull', `roofBird` its id),
// so tag, stalking, the bell, a meow, spotting and the journal are
// critters.js's own rules. The flock adopts them: it hides their own meshes
// (their groups stay visible, so their contact shadows follow them) and is
// the only thing that moves them. Every frame, after critters.update, it
// writes each one's group.position to its bird's spot. A perched bird whose
// critter critters.js has flagged `fleeing` (she came near, a meow, a pounce)
// takes the flight chooseFlight gives it (roofsflock.js: short, along her
// moves, never toward her), or flutters where it is (FLUTTER). A flutter
// leaves it owed a flight: perched again, it tries chooseFlight every frame
// and is off the moment she gives it room (she steps back after a pounce, or
// with the bell on), until she is more than FLIGHT.landFromCat from it,
// when it is calm again. The cat rules hold for that flight too. A flight runs
// at its plan's time, s clamped so it lands exactly on its perch, whatever
// the frame's length; flushed again on the way it keeps its flight. On
// landing the critter's `fleeing` is cleared, its `cooldown` zeroed and its
// anchors put on the perch, so critters.js's own bird flight (up into the
// sky) never runs. Without critters (the picture pages) no bird is flushed.
//
// IN FLIGHT the wings beat (WINGBEAT: 8 Hz, 0.9 rad either way; 3 Hz, 0.4
// under reduced motion), and the bird glides over a flight's last 30%.
//
// THE GUIDE (roofsflock.js GUIDE, the owner's answer of 2026-11-21): a white
// pigeon (GUIDE_LOOK, its instance's colour, for the whole walk), so a child
// spots it at phone size; while it waits on its route it bobs (GUIDE_BOB: a
// small step in place, its nose nodding, every 2 s; not under reduced
// motion), drawn only (its spot, `pos`, stays on its perch). Until
// she has once walked plank-3 from end to end (GUIDE_CROSSING), the guide
// pigeon waits in the alley on every walk (at GUIDE.start, guideStep 0) and,
// each time she flushes it, flies on to its route's next stop; after the last
// it is a pigeon like the others (guideStep -1). Where the next stop will not
// do, it skips to a later one, or takes the ordinary choice and leads on from
// there (roofsflock.js chooseFlight; the flight says its guideStep on
// landing). On its route it keeps GUIDE_FLUSH from her even when the bell
// lets her nearer the other birds: nearer, few flights on keep the cat rules,
// and it would not lead. The walk after she has crossed, it starts at its
// home, retired. That is remembered per device, not in the save, in
// `guideStore`: { get() -> the stored string or null, set(v) }, either of
// which may throw where there is no storage. The default (deviceGuideStore)
// keeps it in window.localStorage, as main.js reads it, under GUIDE_KEY. Where the store cannot be read, the spec's rule holds: the
// guide waits in the alley only on her first walk there (visits 0). Where it
// can be read but not written (old Safari's private mode), her crossing is
// kept for the page's life instead (module-level, per page load), so her
// later walks in that session start it retired. In the walk she crosses in,
// nothing changes for the guide.
//
// THE FOLLOWER (Rooftops step 5, ruling R5): follow(catPos), on her first
// loft find of a walk (roofsmoments.js), picks the perched pigeon on a loft
// perch nearest her (never the guide on its route; null if there is none, or
// no critters to fly with) and it comes along with her (`following`, its id).
// Settled, and while she is more than FOLLOW.far from it, it takes the flight
// roofsflock.js chooseFollow gives it: landing near FOLLOW.sit from her, never
// nearer than FOLLOW.near, and only where that gains on her; else it waits.
// Perched, it is off (flushed, as the guide is at GUIDE_FLUSH) whenever she
// comes within FOLLOW.near, so it is never sat at her heels, and a flush is
// any bird's (chooseFlight: away from her); landed, it follows on. It stops,
// an ordinary pigeon again, after FOLLOW.time walk seconds from the find,
// FOLLOW.flights flights of any kind since, or once she is more than
// FOLLOW.lost from it, whichever comes first. Per device, nothing saved.
//
// THE LOFT (S8): a pigeon on a loft perch rests there. After LOFT_REST s it
// is back on its home perch, but only while she is more than OUT_OF_SIGHT
// from both and, with a camera, neither is in its view: no bird vanishes or
// appears where she can see.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withLocalUuids } from './localuuids.js';
import { hash01 } from './warehouselook.js';
import { BIRD_KINDS, ROOFS_BIRDS, GUIDE, FLIGHT, FOLLOW, LOFT_REST, OUT_OF_SIGHT, perchIndex, flightGraph, flightPlan, flightPoint, chooseFlight, chooseFollow } from './roofsflock.js';
import { ROOFS_TRAVERSAL } from './roofsplan.js';

// Each kind's body and wing colours (the instances' colours).
export const BIRD_LOOK = Object.freeze({
  pigeon: Object.freeze({ body: 0x8d93a0, wing: 0x7a8090 }),
  sparrow: Object.freeze({ body: 0x8a6040, wing: 0x6e4a30 }),
  gull: Object.freeze({ body: 0xeceae4, wing: 0xb8bcc2 }),
});

// The guide pigeon (GUIDE.bird) is white, for the whole walk, retired or
// not: the one a child learns to look for (the owner's tweak, 2026-11-21).
// Its wings a touch greyer, so the folded wings still read.
export const GUIDE_LOOK = Object.freeze({ body: 0xf1eee6, wing: 0xd9d6ce });
// While it waits on its route (guideStep >= 0, perched) it bobs: a step in
// place every `every` s (phased per bird), `time` s long, its body up to `up`
// m off its perch and its nose nodding up to `nod` rad at `hz`. None under
// reduced motion.
export const GUIDE_BOB = Object.freeze({ up: 0.025, nod: 0.14, hz: 1.8, time: 0.55, every: 2 }); // one step in a bob (hz x time ~ 1)

export const PECK = Object.freeze({ pitch: 0.35, time: 0.25, every: Object.freeze([1.5, 3]), kinds: Object.freeze(['pigeon', 'sparrow']) });
// how far a sitting bird looks round from its rest heading (rad), how often
// (s), how fast it turns (rad/s); and how near her it faces her (m)
export const LOOK = Object.freeze({ reach: 0.8, every: Object.freeze([2, 5]), turn: 5, near: 6 });

// In flight: the wingbeat (Hz, rad either way of spread), held spread
// (`glideAngle`, a little up) over the flight's last `glide` share; under
// reduced motion slower and smaller.
export const WINGBEAT = Object.freeze({ hz: 8, amp: 0.9, glide: 0.3, glideAngle: 0.12, reduced: Object.freeze({ hz: 3, amp: 0.4 }) });
// A flushed bird with nowhere to go flutters where it is: up and back (m, s).
export const FLUTTER = Object.freeze({ time: 0.8, up: 0.4 });
// The guide, on its route, is off when she comes within this (m, a little
// more than a bird without the bell: critters.js's 2.5), bell or no bell:
// from nearer her its next stop is often too near her to fly to by the cat
// rules (the shed's roof is 2 m from the bin's lid, and she runs straight at
// it from the west), and it would have to skip ahead or leave its route.
export const GUIDE_FLUSH = 3.2;
const CRITTER_FLUSH_COOLDOWN = 18; // s, as critters.js sets on a flushed bird
// How the follower reads her pace: smoothed over this (s), and never taken
// as faster than this (m/s: a sprint; a hop down or a teleport is not a pace).
const FOLLOW_SMOOTH = 0.5;
// With no pigeon on the loft, the follower is the perched pigeon nearest her
// within this (m); and for its first FOLLOW_GRACE walk seconds it is not
// flushed for her being within FOLLOW.near (fix wave, M2)
export const FOLLOW_FALLBACK = 12;
export const FOLLOW_GRACE = 3;
const FOLLOW_TOP = 4;

// The guide's memory (per device, never the save): she has crossed plank-3.
export const GUIDE_KEY = 'whisker-walk-roofs-guide';
export const GUIDE_CROSSED = 'crossed';
// Walked end to end: within `lateral` m of the plank's rail (seen from
// above) and `height` m of its height all the way, from within `ends` of
// one end (as a share of its length) to within `ends` of the other.
export const GUIDE_CROSSING = Object.freeze({ id: 'plank-3', lateral: 0.45, height: 0.3, ends: 0.15 });

// The device's guide store: window.localStorage (as main.js reads it). Each
// call throws where there is none; the flock catches every one.
export function deviceGuideStore() {
  const storage = () => {
    const ls = globalThis.window?.localStorage;
    if (!ls) throw new Error('roofsbirds: no storage');
    return ls;
  };
  return {
    get: () => storage().getItem(GUIDE_KEY),
    set: (v) => storage().setItem(GUIDE_KEY, v),
  };
}

// She crossed plank-3 in this page's life where the store could not keep it.
let crossedThisPage = false;
// For the tests: a fresh page load (it forgets the crossing above).
export function resetGuidePage() {
  crossedThisPage = false;
}

// The flights between the perches, made once per built place (11-26 ms on a
// laptop, more on an iPad) and shared by its walks: keyed by its perches.
const graphs = new WeakMap();
function graphOf(perches) {
  let g = graphs.get(perches);
  if (!g) {
    g = flightGraph(perches, ROOFS_TRAVERSAL);
    graphs.set(perches, g);
  }
  return g;
}

const SALT = Object.freeze({ rest: 41, look: 43, lookAt: 47, peck: 53, wing: 59, bob: 61 });

// ---------------------------------------------------------------------------
// The shapes, a pigeon's size (the instances scale them): feet at the origin,
// facing +z, its left to +x.

// A piece's vertices in one colour (multiplied by the instance's).
function shade(g, k) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3).fill(k);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

// The body (20 triangles), the head (8), the beak (3) and the tail (2).
function bodyGeometry() {
  const body = new THREE.IcosahedronGeometry(1, 0);
  body.scale(0.085, 0.075, 0.14);
  body.translate(0, 0.1, 0);
  const head = new THREE.OctahedronGeometry(0.055, 0);
  head.translate(0, 0.19, 0.11);
  const beak = new THREE.ConeGeometry(0.016, 0.05, 3, 1, true);
  beak.rotateX(Math.PI / 2); // its point forward
  beak.translate(0, 0.185, 0.185);
  const tail = quad([-0.035, 0.11, -0.1], [0.035, 0.11, -0.1], [0.05, 0.075, -0.24], [-0.05, 0.075, -0.24]);
  const g = mergeGeometries([shade(body, 1), shade(head, 0.82), shade(beak, 0.45), shade(tail, 0.75)]);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// One wing (2 triangles): its root along z at the shoulder (its leading edge
// toward +z), its span out along +x and swept back to its tip, so a beat is a
// turn about z (Task 4).
const WING = Object.freeze({ span: 0.2, root: Object.freeze([0.05, -0.06]), tip: -0.08 });
function wingGeometry() {
  const [f, b] = WING.root;
  const g = quad([0, 0, f], [0, 0, b], [WING.span, 0, WING.tip], [WING.span * 0.7, 0, f * 0.2]);
  return shade(g, 1);
}

// The folded left wing, in the bird's frame: its root at the shoulder, its
// span laid back along the body (a little in and down), its leading edge up
// and leaning in with the body's side. The right wing is its mirror.
const SHOULDER = Object.freeze({ x: 0.062, y: 0.12, z: 0.06 });
const FOLD = Object.freeze({ span: Object.freeze([-0.08, -0.05, -1]), edge: Object.freeze([-0.3, 1, 0]) });
function foldMatrices() {
  const span = new THREE.Vector3(...FOLD.span).normalize();
  const edge = new THREE.Vector3(...FOLD.edge);
  edge.addScaledVector(span, -edge.dot(span)).normalize();
  const side = new THREE.Vector3().crossVectors(edge, span);
  const left = new THREE.Matrix4().makeBasis(span, side, edge).setPosition(SHOULDER.x, SHOULDER.y, SHOULDER.z);
  const right = new THREE.Matrix4().makeScale(-1, 1, 1).multiply(left);
  return [left, right];
}

// ---------------------------------------------------------------------------

const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// The guide's memory, read: { readable, crossed }. A store that throws, or
// none, cannot be read.
function readGuide(store) {
  try {
    if (!store) return { readable: false, crossed: false };
    return { readable: true, crossed: store.get() === GUIDE_CROSSED };
  } catch {
    return { readable: false, crossed: false };
  }
}

// createRoofsBirds(area, { scene, critters, visits, reducedMotion, guideStore })
// -> { birds, meshes, update(dt, catPos, camera), dispose() }. `critters` is
// the walk's (critters.js), or null; `visits` her walks here before this one;
// `guideStore` as above (default deviceGuideStore()).
export function createRoofsBirds(area, { scene, critters = null, visits = 0, reducedMotion = false, guideStore = deviceGuideStore() } = {}) {
  const index = perchIndex(area.birdPerches);
  const memory = readGuide(guideStore);
  const guideWaits = !crossedThisPage && (memory.readable ? !memory.crossed : visits === 0);
  // the follower: its bird's index (-1: none), how long it has followed (walk
  // seconds), and its flights when it started
  let followI = -1;
  let followT = 0;
  let followFlights = 0;
  const birds = ROOFS_BIRDS.map((r) => {
    const home = index.get(r.home);
    if (!home) throw new Error(`roofsbirds: ${r.id}'s home ${r.home} is not a perch`);
    const guide = r.id === GUIDE.bird && guideWaits;
    const at = guide ? GUIDE.start : r.home;
    const p = index.get(at);
    if (!p) throw new Error(`roofsbirds: ${r.id}'s start ${at} is not a perch`);
    return { id: r.id, kind: r.kind, at, flying: false, to: null, pos: { x: p.x, y: p.y, z: p.z }, flights: 0, guideStep: guide ? 0 : -1 };
  });
  // what only this file reads: each bird's heading, look and pecks, its
  // flight or flutter, and its rest on the loft
  const idle = birds.map((b, i) => {
    const rest = hash01(i, 1, SALT.rest) * Math.PI * 2;
    return {
      scale: BIRD_KINDS[b.kind].scale, rest, yaw: rest, look: 0, lookK: 0, lookAt: lookTime(i, 0), peckK: 0, peckAt: peckTime(i, 0, 0), pitch: 0,
      wing: hash01(i, 2, SALT.wing) * Math.PI * 2, bob: hash01(i, 3, SALT.bob) * GUIDE_BOB.every, lift: 0, flight: null, from: null, dest: null, s: 0, flutterT: 0, restT: 0,
      owed: false, ask: { index: i, kind: b.kind, at: b.at, flights: 0, guideStep: -1 },
      // its flight's plan (filled again on each take-off) and its guideStep on landing
      plan: { d: 0, h: 0, time: 0, shape: 'arc', top: 0 }, nextStep: -1,
    };
  });

  // The walk's critters that are these birds, by bird.
  const byId = new Map(birds.map((b, i) => [b.id, i]));
  const proxies = birds.map(() => null);
  for (const c of critters?.list ?? []) {
    const i = byId.get(c.def?.roofBird);
    if (i === undefined) continue;
    proxies[i] = c;
    c.group.traverse((o) => { if (o !== c.group) o.visible = false; });
    settle(c, index.get(birds[i].at));
  }
  // the flights between the perches, only where a bird can be flushed
  const graph = critters ? graphOf(area.birdPerches) : null;

  const { flock, wings } = withLocalUuids('roofs-birds', () => {
    const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide });
    const make = (name, geo, count) => {
      const m = new THREE.InstancedMesh(geo, mat(), count);
      m.name = name;
      m.castShadow = false;
      m.receiveShadow = false;
      m.userData.noCast = true;
      m.frustumCulled = false; // S12: always two draws
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return m;
    };
    const f = make('roofsFlock', bodyGeometry(), birds.length);
    const w = make('roofsFlockWings', wingGeometry(), birds.length * 2);
    const c = new THREE.Color();
    birds.forEach((b, i) => {
      const look = b.id === GUIDE.bird ? GUIDE_LOOK : BIRD_LOOK[b.kind];
      f.setColorAt(i, c.setHex(look.body));
      w.setColorAt(2 * i, c.setHex(look.wing));
      w.setColorAt(2 * i + 1, c);
    });
    return { flock: f, wings: w };
  });
  const meshes = [flock, wings];
  scene.add(flock, wings);

  const [foldL, foldR] = foldMatrices();
  const openL = new THREE.Matrix4();
  const openR = new THREE.Matrix4();
  const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
  const m = new THREE.Matrix4();
  const mw = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const size = new THREE.Vector3();
  let walk = 0;

  function draw(i) {
    const b = birds[i];
    const s = idle[i];
    at.set(b.pos.x, b.pos.y + (b.flying ? 0 : s.lift), b.pos.z);
    euler.set(s.pitch, s.yaw, 0);
    rot.setFromEuler(euler);
    size.setScalar(s.scale);
    m.compose(at, rot, size);
    flock.setMatrixAt(i, m);
    if (b.flying) {
      // spread, the left wing turned about its root (z) by the beat, the
      // right its mirror
      openL.makeRotationZ(wingAngle(i)).setPosition(SPREAD.x, SPREAD.y, SPREAD.z);
      openR.multiplyMatrices(mirror, openL);
      wings.setMatrixAt(2 * i, mw.multiplyMatrices(m, openL));
      wings.setMatrixAt(2 * i + 1, mw.multiplyMatrices(m, openR));
    } else {
      wings.setMatrixAt(2 * i, mw.multiplyMatrices(m, foldL));
      wings.setMatrixAt(2 * i + 1, mw.multiplyMatrices(m, foldR));
    }
  }

  // A flying bird's wing angle (rad, up from spread): the beat, or held for
  // the glide over a flight's last share.
  function wingAngle(i) {
    const s = idle[i];
    if (s.flight && s.s > 1 - WINGBEAT.glide) return WINGBEAT.glideAngle;
    const k = reducedMotion ? WINGBEAT.reduced : WINGBEAT;
    return k.amp * Math.sin(2 * Math.PI * k.hz * walk + s.wing);
  }

  // The perches other birds are on, or flying to (bird i aside).
  const taken = new Set();
  function takenBy(i) {
    taken.clear();
    for (let j = 0; j < birds.length; j++) {
      if (j !== i) taken.add(birds[j].flying ? birds[j].to : birds[j].at);
    }
    return taken;
  }

  // Where chooseFlight sends bird i from its perch, her at `cat`, or null.
  // Allocates nothing unless it finds one.
  function choose(i, cat) {
    const b = birds[i];
    const q = idle[i].ask;
    q.at = b.at;
    q.flights = b.flights;
    q.guideStep = b.guideStep;
    return chooseFlight(graph, index, q, cat, takenBy(i));
  }

  // Where chooseFollow sends the follower i from its perch, or null.
  function chooseNext(i, cat) {
    const b = birds[i];
    const q = idle[i].ask;
    q.at = b.at;
    q.flights = b.flights;
    q.guideStep = b.guideStep;
    return chooseFollow(graph, index, q, cat, takenBy(i), herVel);
  }

  // Her velocity (m/s), smoothed over about FOLLOW_SMOOTH s of her spots and
  // at most FOLLOW_TOP: where the follower expects her when it lands.
  const herVel = { x: 0, y: 0, z: 0 };
  const herLast = { x: 0, y: 0, z: 0, set: false };
  function pace(dt, cat) {
    if (!cat || !(dt > 0)) return;
    if (herLast.set) {
      const k = Math.min(1, dt / FOLLOW_SMOOTH);
      herVel.x += ((cat.x - herLast.x) / dt - herVel.x) * k;
      herVel.y += ((cat.y - herLast.y) / dt - herVel.y) * k;
      herVel.z += ((cat.z - herLast.z) / dt - herVel.z) * k;
      const v = Math.hypot(herVel.x, herVel.y, herVel.z);
      if (v > FOLLOW_TOP) {
        herVel.x *= FOLLOW_TOP / v;
        herVel.y *= FOLLOW_TOP / v;
        herVel.z *= FOLLOW_TOP / v;
      }
    }
    herLast.x = cat.x;
    herLast.y = cat.y;
    herLast.z = cat.z;
    herLast.set = true;
  }

  // The follower gives up: time, flights, or she is out of its reach.
  function followOn(dt, cat) {
    if (followI < 0) return;
    const b = birds[followI];
    followT += dt > 0 ? dt : 0;
    if (followT >= FOLLOW.time || b.flights - followFlights >= FOLLOW.flights || (cat && dist3(cat, b.pos) > FOLLOW.lost)) followI = -1;
  }

  // Off on flight f (chooseFlight's).
  function takeOff(i, f) {
    const b = birds[i];
    const s = idle[i];
    const from = index.get(b.at);
    s.from = from;
    s.restT = 0;
    s.owed = false;
    s.pitch = 0;
    b.flying = true;
    s.dest = index.get(f.to);
    s.flight = flightPlan(from, s.dest, f.shape, s.plan);
    s.nextStep = f.guideStep ?? b.guideStep;
    s.s = 0;
    b.to = f.to;
    if (s.flight.d > 0.05) s.yaw = Math.atan2(s.dest.x - from.x, s.dest.z - from.z);
  }

  // Flushed: off on the flight chooseFlight gives it; with none, a flutter
  // where it is, and it is owed a flight (FLUSH OWED, update()).
  function flush(i, cat) {
    const f = cat ? choose(i, cat) : null;
    if (f) return takeOff(i, f);
    const b = birds[i];
    const s = idle[i];
    s.from = index.get(b.at);
    s.dest = s.from;
    s.restT = 0;
    s.pitch = 0;
    s.flight = null;
    s.flutterT = 0;
    s.owed = true;
    b.flying = true;
    b.to = b.at;
  }

  // On its perch: the critter told so, its anchors there.
  function land(i) {
    const b = birds[i];
    const s = idle[i];
    const p = s.dest;
    if (s.flight) {
      b.at = b.to;
      b.flights++;
      if (b.guideStep >= 0) b.guideStep = s.nextStep;
      s.rest = s.yaw;
    }
    b.pos.x = p.x;
    b.pos.y = p.y;
    b.pos.z = p.z;
    b.flying = false;
    b.to = null;
    s.flight = null;
    s.from = null;
    s.dest = null;
    const c = proxies[i];
    if (c) {
      c.fleeing = false;
      c.cooldown = 0;
      settle(c, p);
    }
  }

  // One frame of a flight or a flutter.
  function fly(i, dt) {
    const b = birds[i];
    const s = idle[i];
    if (s.flight) {
      s.s = Math.min(1, s.s + (dt > 0 ? dt : 0) / s.flight.time);
      if (s.s >= 1) land(i);
      else flightPoint(s.from, s.dest, s.flight, s.s, b.pos);
      return;
    }
    s.flutterT += dt > 0 ? dt : 0;
    const u = s.flutterT / FLUTTER.time;
    if (u >= 1) {
      land(i);
      return;
    }
    b.pos.x = s.from.x;
    b.pos.y = s.from.y + FLUTTER.up * Math.sin(Math.PI * u);
    b.pos.z = s.from.z;
  }

  // A pigeon resting on the loft: home, after LOFT_REST, where she cannot see.
  const frustum = new THREE.Frustum();
  const view = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), SEEN_R);
  const seen = (p) => {
    sphere.center.set(p.x, p.y, p.z);
    return frustum.intersectsSphere(sphere);
  };
  function rest(i, dt, cat, camera) {
    const b = birds[i];
    const s = idle[i];
    const here = index.get(b.at);
    if (b.kind !== 'pigeon' || here.kind !== 'loft') {
      s.restT = 0;
      return;
    }
    s.restT += dt > 0 ? dt : 0;
    if (s.restT < LOFT_REST || !cat) return;
    const home = index.get(ROOFS_BIRDS[i].home);
    if (home === here || dist3(cat, home) <= OUT_OF_SIGHT || dist3(cat, here) <= OUT_OF_SIGHT) return;
    if (takenBy(i).has(home.id)) return;
    for (let k = 0; k < home.aliases.length; k++) if (taken.has(home.aliases[k])) return;
    if (camera) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      if (seen(home) || seen(here)) return;
    }
    b.at = ROOFS_BIRDS[i].home;
    b.pos.x = home.x;
    b.pos.y = home.y;
    b.pos.z = home.z;
    s.restT = 0;
    if (proxies[i]) settle(proxies[i], home);
  }

  // Walked plank-3 end to end: the guide's memory, written once.
  const plank = railOf(ROOFS_TRAVERSAL.crossings.find((c) => c.id === GUIDE_CROSSING.id));
  const onPlank = { u: 0, lateral: 0, y: 0 };
  let plankEnd = -1; // the end she was last at, staying on the plank since; -1 off it
  let crossed = memory.crossed;
  function track(cat) {
    if (crossed) return;
    plank.nearest(cat.x, cat.z, onPlank);
    if (onPlank.lateral > GUIDE_CROSSING.lateral || Math.abs(cat.y - onPlank.y) > GUIDE_CROSSING.height) {
      plankEnd = -1;
      return;
    }
    const end = onPlank.u <= GUIDE_CROSSING.ends ? 0 : onPlank.u >= 1 - GUIDE_CROSSING.ends ? 1 : -1;
    if (end < 0) return;
    if (plankEnd >= 0 && end !== plankEnd) {
      crossed = true;
      try {
        guideStore?.set(GUIDE_CROSSED);
      } catch {
        crossedThisPage = true; // nowhere to write it: kept for this page's life
      }
    }
    plankEnd = end;
  }

  function perch(i, dt, cat) {
    const b = birds[i];
    const s = idle[i];
    const p = b.pos;
    const near = cat && Math.hypot(cat.x - p.x, cat.y - p.y, cat.z - p.z) < LOOK.near;
    // where it looks: at her, else its rest heading and its look
    while (walk >= s.lookAt) {
      s.lookK++;
      s.look = (hash01(i, s.lookK, SALT.look) * 2 - 1) * LOOK.reach;
      s.lookAt += lookTime(i, s.lookK);
    }
    const pecks = !near && PECK.kinds.includes(b.kind) && index.get(b.at)?.kind === 'roof';
    const want = near ? Math.atan2(cat.x - p.x, cat.z - p.z) : pecks ? s.rest : s.rest + s.look;
    const off = wrap(want - s.yaw);
    const step = LOOK.turn * dt;
    s.yaw = wrap(Math.abs(off) <= step ? want : s.yaw + Math.sign(off) * step);
    // its pecks, on their own clock whether it pecks now or not
    while (walk >= s.peckAt + PECK.time) {
      s.peckK++;
      s.peckAt = peckTime(i, s.peckK, s.peckAt);
    }
    const u = (walk - s.peckAt) / PECK.time;
    s.pitch = pecks && u >= 0 && u <= 1 ? PECK.pitch * Math.sin(Math.PI * u) : 0;
    s.lift = 0;
    // the guide waiting on its route: its bob, in place of a peck
    if (b.guideStep >= 0 && !reducedMotion) {
      const t = (walk + s.bob) % GUIDE_BOB.every;
      if (t < GUIDE_BOB.time) {
        const env = Math.sin((Math.PI * t) / GUIDE_BOB.time);
        const w = 2 * Math.PI * GUIDE_BOB.hz * t;
        s.lift = GUIDE_BOB.up * env * (0.5 - 0.5 * Math.cos(w));
        s.pitch = GUIDE_BOB.nod * env * Math.sin(w);
      } else s.pitch = 0;
    }
  }

  for (let i = 0; i < birds.length; i++) draw(i);
  flock.instanceMatrix.needsUpdate = true;
  wings.instanceMatrix.needsUpdate = true;

  return {
    birds,
    meshes,
    // The follower's id, or null.
    get following() {
      return followI >= 0 ? birds[followI].id : null;
    },
    // On her loft find: the perched pigeon on a loft perch nearest her comes
    // along (its id), never the guide on its route; with none on the loft
    // (she flushed them on her way up), the perched pigeon nearest her within
    // FOLLOW_FALLBACK, never the guide (fix wave, M2); null if none (or no
    // critters: nothing flies). One at a time: while one follows, its id.
    follow(catPos) {
      if (followI >= 0) return birds[followI].id;
      if (!graph || !catPos) return null;
      const nearest = (onLoft) => {
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < birds.length; i++) {
          const b = birds[i];
          if (b.kind !== 'pigeon' || b.flying || b.guideStep >= 0) continue;
          if (onLoft && index.get(b.at)?.kind !== 'loft') continue;
          const d = dist3(catPos, b.pos);
          if (!onLoft && d > FOLLOW_FALLBACK) continue;
          if (d < bestD) { best = i; bestD = d; }
        }
        return best;
      };
      let best = nearest(true);
      if (best < 0) best = nearest(false);
      if (best < 0) return null;
      followI = best;
      followT = 0;
      followFlights = birds[best].flights;
      return birds[best].id;
    },
    update(dt, catPos = null, camera = null) {
      walk += dt;
      if (catPos) track(catPos);
      followOn(dt, catPos);
      if (followI >= 0) pace(dt, catPos);
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        const c = proxies[i];
        // the follower is spared the near flush its first FOLLOW_GRACE s, so
        // the find's own moment is not a bird bolting off (fix wave, M2)
        const keep = b.guideStep >= 0 ? GUIDE_FLUSH : i === followI && followT >= FOLLOW_GRACE ? FOLLOW.near : 0;
        if (c && !b.flying && !c.fleeing && keep > 0 && catPos && dist3(catPos, b.pos) < keep) {
          c.fleeing = true; // the guide and the follower keep their distance: flushed, as critters.js flushes a bird
          c.cooldown = CRITTER_FLUSH_COOLDOWN;
        }
        if (!b.flying && c?.fleeing) flush(i, catPos);
        else if (!b.flying && idle[i].owed) {
          // FLUSH OWED: a bird that could only flutter tries again each frame
          // and is off the moment she gives it room; past landFromCat she
          // has let it be, and it is calm again
          if (!catPos || dist3(catPos, b.pos) > FLIGHT.landFromCat) idle[i].owed = false;
          else {
            const f = choose(i, catPos);
            if (f) {
              takeOff(i, f);
              if (c) {
                c.fleeing = true; // on its way, as critters.js's flushed birds are
                c.cooldown = CRITTER_FLUSH_COOLDOWN;
              }
            }
          }
        } else if (i === followI && !b.flying && catPos) {
          const f = chooseNext(i, catPos); // null while she is within FOLLOW.far: it waits
          if (f) takeOff(i, f);
        }
        if (b.flying) fly(i, dt);
        else rest(i, dt, catPos, camera);
        if (!b.flying) perch(i, dt, catPos);
        draw(i);
        c?.group.position.set(b.pos.x, b.pos.y, b.pos.z);
      }
      flock.instanceMatrix.needsUpdate = true;
      wings.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      followI = -1;
      for (const mesh of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh.dispose();
      }
    },
  };
}

// Where a flying bird's wings are spread from (its left shoulder), and how
// big a bird is to the camera's view (m).
const SPREAD = Object.freeze({ x: 0.05, y: 0.13, z: 0.03 });
const SEEN_R = 0.5;
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// A critter on perch p: there, its anchors (critters.js's, on the ground's
// plane) with it.
function settle(c, p) {
  c.group.position.set(p.x, p.y, p.z);
  c.anchor.set(p.x, 0, p.z);
  c.anchorHome.set(p.x, 0, p.z);
}

// A crossing's rail, seen from above: nearest(x, z, out) gives the share of
// its length `u` of the rail's nearest point, how far off it (x, z) is
// (`lateral`) and the rail's height there (`y`).
function railOf(crossing) {
  const pts = crossing.points;
  const lens = [];
  let total = 0;
  for (let k = 1; k < pts.length; k++) {
    lens.push(Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
    total += lens[k - 1];
  }
  return {
    nearest(x, z, out) {
      let best = Infinity;
      let along = 0;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1];
        const b = pts[k];
        const n = lens[k - 1];
        const t = n > 0 ? Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / (n * n))) : 0;
        const e = Math.hypot(x - a.x - (b.x - a.x) * t, z - a.z - (b.z - a.z) * t);
        if (e < best) {
          best = e;
          out.u = (along + n * t) / total;
          out.y = a.y + (b.y - a.y) * t;
        }
        along += n;
      }
      out.lateral = best;
      return out;
    },
  };
}

// When bird i's look k ends (s after the last), and when its peck k starts:
// the first within the first interval, then every PECK.every apart.
function lookTime(i, k) {
  return lerp(LOOK.every[0], LOOK.every[1], hash01(i, k, SALT.lookAt));
}
function peckTime(i, k, last) {
  const gap = lerp(PECK.every[0], PECK.every[1], hash01(i, k, SALT.peck));
  return k === 0 ? gap * hash01(i, 0.5, SALT.peck) : last + gap;
}
