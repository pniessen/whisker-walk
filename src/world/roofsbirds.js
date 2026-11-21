// =============================================================================
// THE ROOFTOPS' FLOCK, DRAWN (Rooftops step 3). The fourteen birds of
// roofsflock.js's roster, on the place's perches (area.birdPerches), made per
// walk by the area's life (roofslife.js).
//
// TWO DRAWS (S12). Every bird is one instance of `roofsFlock` (body, head,
// beak and tail in one low-poly, vertex-coloured geometry) and two of
// `roofsFlockWings` (one wing, mirrored for the right): two InstancedMeshes,
// coloured per kind by instanceColor (BIRD_LOOK), scaled by the kind's
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
// moves, never toward her), or flutters where it is (FLUTTER). A flight runs
// at its plan's time, s clamped so it lands exactly on its perch, whatever
// the frame's length; flushed again on the way it keeps its flight. On
// landing the critter's `fleeing` is cleared, its `cooldown` zeroed and its
// anchors put on the perch, so critters.js's own bird flight (up into the
// sky) never runs. Without critters (the picture pages) no bird is flushed.
//
// IN FLIGHT the wings beat (WINGBEAT: 8 Hz, 0.9 rad either way; 3 Hz, 0.4
// under reduced motion), and the bird glides over a flight's last 30%.
//
// THE GUIDE (roofsflock.js GUIDE, the owner's answer of 2026-11-21): until
// she has once walked plank-3 from end to end (GUIDE_CROSSING), the guide
// pigeon waits in the alley on every walk (at GUIDE.start, guideStep 0) and,
// each time she flushes it, flies on to its route's next stop; after the last
// it is a pigeon like the others (guideStep -1). On its route it keeps
// GUIDE_FLUSH from her even when the bell lets her nearer the other birds:
// nearer, no flight on would keep the cat rules, and it would not lead. The
// walk after she has crossed, it starts at its home, retired. That is
// remembered per device, not in the save, in `guideStore`: { get() -> the
// stored string or null, set(v) }, either of which may throw where there is
// no storage. The default
// (deviceGuideStore) keeps it in window.localStorage, as main.js reads it,
// under GUIDE_KEY. Where the store cannot be read, the spec's rule holds: the
// guide waits in the alley only on her first walk there (visits 0). In the
// walk she crosses in, nothing changes for the guide.
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
import { BIRD_KINDS, ROOFS_BIRDS, GUIDE, LOFT_REST, OUT_OF_SIGHT, perchIndex, flightGraph, flightPlan, flightPoint, chooseFlight } from './roofsflock.js';
import { ROOFS_TRAVERSAL } from './roofsplan.js';

// Each kind's body and wing colours (the instances' colours).
export const BIRD_LOOK = Object.freeze({
  pigeon: Object.freeze({ body: 0x8d93a0, wing: 0x7a8090 }),
  sparrow: Object.freeze({ body: 0x8a6040, wing: 0x6e4a30 }),
  gull: Object.freeze({ body: 0xeceae4, wing: 0xb8bcc2 }),
});

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
// The guide, on its route, is off when she comes within this (m, as a bird
// without the bell: critters.js's 2.5), bell or no bell: it cannot fly on
// from nearer her (the cat rules), so it would only flutter where it is.
export const GUIDE_FLUSH = 2.5;
const CRITTER_FLUSH_COOLDOWN = 18; // s, as critters.js sets on a flushed bird

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

const SALT = Object.freeze({ rest: 41, look: 43, lookAt: 47, peck: 53, wing: 59 });

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
  const guideWaits = memory.readable ? !memory.crossed : visits === 0;
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
      wing: hash01(i, 2, SALT.wing) * Math.PI * 2, flight: null, from: null, dest: null, s: 0, flutterT: 0, restT: 0,
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
  const graph = critters ? flightGraph(area.birdPerches, ROOFS_TRAVERSAL) : null;

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
      f.setColorAt(i, c.setHex(BIRD_LOOK[b.kind].body));
      w.setColorAt(2 * i, c.setHex(BIRD_LOOK[b.kind].wing));
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
    at.set(b.pos.x, b.pos.y, b.pos.z);
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

  // Flushed: off on the flight chooseFlight gives it, or a flutter.
  function flush(i, cat) {
    const b = birds[i];
    const s = idle[i];
    const from = index.get(b.at);
    const f = cat ? chooseFlight(graph, index, { index: i, kind: b.kind, at: b.at, flights: b.flights, guideStep: b.guideStep }, cat, takenBy(i)) : null;
    s.from = from;
    s.restT = 0;
    b.flying = true;
    if (f) {
      s.dest = index.get(f.to);
      s.flight = flightPlan(from, s.dest, f.shape);
      s.s = 0;
      b.to = f.to;
      if (s.flight.d > 0.05) s.yaw = Math.atan2(s.dest.x - from.x, s.dest.z - from.z);
    } else {
      s.dest = from;
      s.flight = null;
      s.flutterT = 0;
      b.to = b.at;
    }
    s.pitch = 0;
  }

  // On its perch: the critter told so, its anchors there.
  function land(i) {
    const b = birds[i];
    const s = idle[i];
    const p = s.dest;
    if (s.flight) {
      b.at = b.to;
      b.flights++;
      if (b.guideStep >= 0) b.guideStep = b.guideStep + 1 < GUIDE.route.length ? b.guideStep + 1 : -1;
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
    if (takenBy(i).has(home.id) || home.aliases.some((a) => taken.has(a))) return;
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
      try { guideStore?.set(GUIDE_CROSSED); } catch { /* no storage: the visits rule */ }
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
  }

  for (let i = 0; i < birds.length; i++) draw(i);
  flock.instanceMatrix.needsUpdate = true;
  wings.instanceMatrix.needsUpdate = true;

  return {
    birds,
    meshes,
    update(dt, catPos = null, camera = null) {
      walk += dt;
      if (catPos) track(catPos);
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        const c = proxies[i];
        if (c && !b.flying && !c.fleeing && b.guideStep >= 0 && catPos && dist3(catPos, b.pos) < GUIDE_FLUSH) {
          c.fleeing = true; // the guide keeps its distance: flushed, as critters.js flushes a bird
          c.cooldown = CRITTER_FLUSH_COOLDOWN;
        }
        if (!b.flying && c?.fleeing) flush(i, catPos);
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
