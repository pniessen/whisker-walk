// =============================================================================
// THE TREEHOUSE VILLAGE: THE FRIENDLY LIFE AND THE SOUND (milestone T4). Songbirds that hop along the deck railings, a sleepy owl on a ledge by the bell, fireflies that drift and blink
// among the leaves, golden leaves that come down slowly from the canopy; and the two sounds, a wooden creak under her paws on a deck or the bridge and a soft wind chime now and then.
// Decoration that moves: none of it is a rule, a find or a danger, none comes at her, blocks her or needs her. The birds, the owl and the fireflies are also journal subjects (`spottable`,
// the walk's own farm-animal rule in src/game/interactions.js: near and looking: pages tl1..tl3). Every pose is a pure function of the walk's time and a hashed phase (no random number,
// no clock); reduced motion draws everything once at time zero (the birds perched, the fireflies glowing, a few leaves hanging) and holds still; the lower rungs keep fewer birds,
// fireflies and leaves. No light is added. Nothing is made per frame (scratch values only). The sounds ask for no audio context while muted. Stage chunk code (treehousestagebranches.js);
// start-up never imports it. Modelled on Snowville's snowvillecritters.js.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import * as P from './treehouseplan.js';
import { paint } from './treehouseparts.js';
import { isLowTier } from './treehouselight.js';
import './treehousecritterwords.js';

export const TAU = Math.PI * 2;
export const hash01 = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((s | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const fr = (v) => v - Math.floor(v);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export const lifeRung = (tier) => (tier && tier.shadows === false ? 'lite' : isLowTier(tier) ? 'low' : 'high');
export const COUNTS = Object.freeze({ high: Object.freeze({ birds: 3, flies: 18, leaves: 30, motes: 14 }), low: Object.freeze({ birds: 2, flies: 12, leaves: 16, motes: 6 }), lite: Object.freeze({ birds: 1, flies: 6, leaves: 6, motes: 0 }) }); // motes: pollen in the sun (beauty pass 2), more falling leaves (their gust drift is leafAt's)
export const BURST = Object.freeze({ high: 10, low: 6, lite: 0, life: 2.6, up: 2.2 }); // leaves a landing shakes loose (beauty pass 3: they are the last slots of the one falling-leaves Points), seconds they fall, metres above her they start
export const STILL_LEAVES = 6; // reduced motion hangs a few leaves, no more
export const RANGES = Object.freeze({ tl1: 9, tl2: 7, tl3: 8 }); // how near she must be (and facing it) to spot one

// ---- where things are (all over the plan's own places) --------------------------------------------------------------------------------------
// The birds: bird i keeps to one deck's back (north) railing and hops between its two ends (the corner lanterns are at the very corners, so the ends are a metre in).
export const BIRD_DECKS = Object.freeze(['bakery', 'books', 'crown']);
export const BIRD_REST = 0.04; // a bird's feet stand this far over the rail's top
export const birdPosts = (i) => { const k = P.deckOf(BIRD_DECKS[i % BIRD_DECKS.length]); const y = k.y + P.RAIL_H + BIRD_REST; return [{ x: k.x - k.w / 2 + 1.0, y, z: k.z - k.d / 2 }, { x: k.x + k.w / 2 - 1.0, y, z: k.z - k.d / 2 }]; };
// The owl: on a little ledge on the Bell Tower's front, to one side of the lit window and the bell.
export const OWL = Object.freeze((() => { const k = P.deckOf('crown'); const h = k.hut; const y = k.y + h.h * 0.74; return { x: h.x + 1.05, y, z: h.z + h.r * 0.95 + 0.17, yaw: 0.35, ledgeY: y - 0.04 }; })());
// The firefly places: where the evening gathers (each at its own level: the roots, the Bakery deck, the Bookshop deck, the Crown, the brook-side, the east edge).
export const FIREFLY_PLACES = Object.freeze([[0, 17, 0.3], [-9, 8, 1.7], [9, 0, 3.1], [0, -12, 5.9], [-20, -9, 0.3], [18, 12, 0.3]].map(([x, z, y]) => Object.freeze({ x, z, y })));
export const GUST_PUSH = 2.4; // metres a gust pushes a leaf that has just let go (the canopy sways on the same slow beat, treehouseglow.js)
export const LEAF_FALL = Object.freeze({ top: 11, life: 40, spread: 56 }); // metres up where a leaf lets go, seconds a fall takes, metres across the village

// ---- the poses (pure) ------------------------------------------------------------------------------------------------------------------------
// Bird i at time t: perched on one end of its rail, a quick little flight to the other end, a rest, and back. `k` 0 on the first post, 1 on the second. `still` holds it perched.
export function birdPose(i, t, out = {}, still = false) {
  const [a, b] = birdPosts(i);
  const T = 13 + 3 * (i % 3);
  const u = still ? 0 : fr(t / T + hash01(i, 51));
  const k = u < 0.4 ? 0 : u < 0.46 ? smooth((u - 0.4) / 0.06) : u < 0.9 ? 1 : 1 - smooth((u - 0.9) / 0.06);
  out.k = k;
  out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k;
  out.y = a.y + 0.55 * Math.sin(k * Math.PI);
  out.flying = k > 0 && k < 1;
  const toB = u < 0.5;
  out.yaw = out.flying ? Math.atan2(b.x - a.x, b.z - a.z) + (toB ? 0 : Math.PI) : (k < 0.5 ? 0.9 : -0.9) + (still ? 0 : 0.35 * Math.sin(t * 0.8 + i)); // looking out over the village
  out.bob = out.flying || still ? 0 : 0.05 * Math.max(0, Math.sin(t * 2.6 + i * 2)); // a quick peck now and then
  return out;
}
// Firefly i at time t: a slow wander round its place, its glow swelling and fading ({ x, y, z, glow 0..1 }).
export function fireflyAt(i, t, out = {}) {
  const c = FIREFLY_PLACES[i % FIREFLY_PLACES.length];
  const a = hash01(i, 61) * TAU + t * (0.22 + 0.1 * hash01(i, 62)) * (i % 2 ? -1 : 1);
  const r = 1.2 + 1.6 * hash01(i, 63);
  out.x = c.x + Math.cos(a) * r; out.z = c.z + Math.sin(a * 0.8) * r;
  out.y = c.y + 0.9 + 0.5 * Math.sin(t * 0.4 + i * 1.7);
  const s = Math.sin(t * (0.7 + 0.35 * hash01(i, 64)) + hash01(i, 65) * TAU);
  out.glow = s <= 0 ? 0 : Math.min(1, s * 1.5);
  return out;
}
// Leaf i at time t: let go at the canopy, a long sway down; `u` runs 0 (up in the leaves) to 1 (on the floor).
export function leafAt(i, t, out = {}) {
  const life = LEAF_FALL.life * (0.8 + 0.4 * hash01(i, 71));
  const u = fr(t / life + hash01(i, 72));
  out.u = u;
  out.x = (hash01(i, 73) - 0.5) * LEAF_FALL.spread + u * 3 + 1.4 * Math.sin(u * 9 + i) + GUST_PUSH * (0.5 + 0.5 * Math.sin(t * 0.31 + hash01(i, 75) * 2)) * (1 - u); // a gust leans the leaves still high up
  out.z = (hash01(i, 74) - 0.5) * LEAF_FALL.spread + 1.2 * Math.cos(u * 7 + i * 1.3);
  out.y = 0.1 + (LEAF_FALL.top - 0.1) * (1 - u);
  return out;
}

// Pollen mote i at time t: a dim speck drifting slowly up through the sun among the firefly places ({ x, y, z, glow }); k counts from the first mote.
export function moteAt(k, t, out = {}) {
  const c = FIREFLY_PLACES[k % FIREFLY_PLACES.length];
  out.x = c.x + (hash01(k, 81) - 0.5) * 9 + 1.2 * Math.sin(t * 0.17 + k * 1.3);
  out.z = c.z + (hash01(k, 82) - 0.5) * 9 + 1.2 * Math.cos(t * 0.13 + k * 0.9);
  out.y = 1.2 + 7 * fr(t / 70 + hash01(k, 83));
  out.glow = 0.3 + 0.12 * Math.sin(t * 0.9 + k * 2.1);
  return out;
}

// ---- drawing: each creature is one vertex-coloured mesh -------------------------------------------------------------------------------------
const B = (r, x, y, z, sx, sy, sz, hex, seg = 7) => paint(new THREE.SphereGeometry(r, seg, seg - 2).scale(sx, sy, sz).translate(x, y, z), hex);
const COL = Object.freeze({ bird: 0x6d8fb8, wing: 0x4f6f98, breast: 0xf0c27a, beak: 0xe8a23a, dark: 0x2c2a38, owl: 0x8a6a4a, owlLight: 0xd9c49a, tuft: 0x6e5238, ledge: 0x8a6240, leaf: 0xd8b25a, leaf2: 0x7cbc54, leaf3: 0xc9803a, fly: 0xf4f0a0 });

export function birdGeometry() {
  return mergeGeometries([
    B(0.065, 0, 0.085, 0, 1, 1, 1.25, COL.bird, 8), B(0.052, 0, 0.075, 0.04, 1, 1, 1, COL.breast, 7), B(0.044, 0, 0.16, 0.055, 1, 1, 1, COL.bird, 7),
    paint(new THREE.ConeGeometry(0.013, 0.05, 5).rotateX(Math.PI / 2).translate(0, 0.16, 0.11), COL.beak), B(0.009, -0.028, 0.18, 0.085, 1, 1, 1, COL.dark, 4), B(0.009, 0.028, 0.18, 0.085, 1, 1, 1, COL.dark, 4),
    paint(new THREE.BoxGeometry(0.05, 0.014, 0.12).rotateX(0.3).translate(0, 0.095, -0.12), COL.wing),
    paint(new THREE.BoxGeometry(0.15, 0.01, 0.07).translate(0, 0.11, -0.01), COL.wing), // the folded wings, a little proud of her back
  ]);
}
export function owlGeometry() {
  const parts = [
    B(0.17, 0, 0.19, 0, 1, 1.15, 0.9, COL.owl, 9), B(0.11, 0, 0.17, 0.1, 0.9, 1.1, 0.5, COL.owlLight, 8), // the body and its pale front
    B(0.13, 0, 0.42, 0.01, 1.15, 0.95, 0.95, COL.owl, 9), B(0.09, 0, 0.41, 0.09, 1.1, 0.95, 0.4, COL.owlLight, 8), // the head and the pale face
    paint(new THREE.ConeGeometry(0.018, 0.06, 5).rotateX(Math.PI / 2 + 0.4).translate(0, 0.39, 0.15), COL.beak),
    paint(new THREE.ConeGeometry(0.035, 0.1, 5).translate(-0.1, 0.55, 0), COL.tuft), paint(new THREE.ConeGeometry(0.035, 0.1, 5).translate(0.1, 0.55, 0), COL.tuft), // the ear tufts
  ];
  for (const s of [-1, 1]) {
    parts.push(paint(new THREE.BoxGeometry(0.07, 0.012, 0.012).translate(s * 0.05, 0.43, 0.145), COL.dark)); // an eye, shut
    parts.push(paint(new THREE.SphereGeometry(0.1, 7, 5).scale(0.4, 1.3, 0.8).translate(s * 0.15, 0.2, -0.02), COL.tuft)); // a folded wing
  }
  return mergeGeometries(parts);
}
const dotTexture = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const n = 32;
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const k = (y * n + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = Math.round(255 * (r >= 1 ? 0 : (1 - r) ** 1.4));
    }
    tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  };
})();

const mark = (o) => { o.castShadow = false; o.receiveShadow = false; Object.assign(o.userData, { noMerge: true, noCast: true, noContactShadow: true }); return o; };

// ---- the sounds (silent when muted: no audio context is asked for) ------------------------------------------------------------------------
const CHIME_NOTES = Object.freeze([784, 880, 1046.5, 1174.7, 1318.5]); // a pentatonic run, like the crystals' own
export const CHIME_GAP = Object.freeze({ first: 12, min: 24, span: 22 }); // seconds before the first chime, and between two (the walk's own time)
export const STEP_METRES = 0.85; // one creak for each stride's worth of walking on the wood
export const WOOD_Y = 1; // she is on a deck or the bridge when she stands over this high
function soundCtx(audio) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.()) return null;
  return audio.getContext() ?? null;
}
// A wind chime: two soft glassy notes close together, each a sine and a bright partial, quick to start and a long, quiet fade.
export function chimeNote(audio, k = 0) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime;
  const first = Math.floor(hash01(k, 31) * (CHIME_NOTES.length - 1));
  for (let n = 0; n < 2; n++) {
    const at = now + n * 0.22;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.016, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
    g.connect(audio.getMaster?.() ?? ac.destination);
    for (const [m, v] of [[1, 1], [3.01, 0.18]]) {
      const o = ac.createOscillator(); const og = ac.createGain();
      o.type = 'sine'; o.frequency.value = CHIME_NOTES[first + n] * m; og.gain.value = v;
      o.connect(og); og.connect(g); o.start(at); o.stop(at + 2.3);
    }
  }
  return true;
}
// The creak of a plank: a low triangle wave sliding down a little through a lowpass, a touch lower on every other step.
export function creakNote(audio, k = 0) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime;
  const o = ac.createOscillator(); const flt = ac.createBiquadFilter(); const g = ac.createGain();
  const f = k % 2 ? 118 : 142;
  o.type = 'triangle'; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 0.7, now + 0.26);
  flt.type = 'lowpass'; flt.frequency.value = 520; flt.Q.value = 2.5;
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.012, now + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  o.connect(flt); flt.connect(g); g.connect(audio.getMaster?.() ?? ac.destination);
  o.start(now); o.stop(now + 0.32);
  return true;
}
// A leaf shaken loose by a landing: burst leaf k of n, `age` seconds after it let go, over the landing spot (cx, cy, cz). Pure ({ x, y, z, fade }), each leaf its own seeded scatter.
export function burstLeaf(k, age, cx, cy, cz, out = {}) {
  const a = hash01(k, 91) * TAU; const r = 0.4 + 1.6 * hash01(k, 92);
  const u = age / BURST.life;
  out.x = cx + Math.cos(a) * r * (0.4 + u) + 0.5 * Math.sin(age * 3 + k);
  out.z = cz + Math.sin(a) * r * (0.4 + u) + 0.5 * Math.cos(age * 2.6 + k * 1.3);
  out.y = cy + BURST.up * (0.6 + 0.6 * hash01(k, 93)) - 2.3 * age * (0.65 + 0.35 * hash01(k, 94)) * (0.5 + 0.5 * Math.min(1, age * 2)) + 0.3 * Math.sin(age * 5 + k);
  out.fade = u >= 1 ? 0 : Math.min(1, (1 - u) * 3);
  return out;
}
// The soft thump of a landing on the boards: a low sine dropping fast through a lowpass, with a creak after it; `strength` is 0..1.
export function thumpNote(audio, strength = 0.5) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime;
  const o = ac.createOscillator(); const flt = ac.createBiquadFilter(); const g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(110, now); o.frequency.exponentialRampToValueAtTime(48, now + 0.18);
  flt.type = 'lowpass'; flt.frequency.value = 320;
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.02 + 0.03 * strength, now + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  o.connect(flt); flt.connect(g); g.connect(audio.getMaster?.() ?? ac.destination);
  o.start(now); o.stop(now + 0.32);
  return true;
}
// The two wind chimes under the Bakery's and the Bookshop's eaves (treehousetrim.js hangs them; the same spots): she brushes past one and it answers, at most once a few seconds.
export const CHIME_SPOTS = Object.freeze([['bakery', 0.8], ['books', -0.8]].map(([id, a]) => { const k = P.deckOf(id); const R = k.hut.r + 0.45; return Object.freeze({ x: k.hut.x + Math.sin(a) * (R - 0.15), y: k.y + k.hut.h - 0.02, z: k.hut.z + Math.cos(a) * (R - 0.15) }); }));
export const CHIME_REACH = 2.6; // metres from a chime (all three ways) that sets it ringing
export const CHIME_COOL = 7; // seconds before the same walk can ring one again
export const nearChime = (x, y, z) => CHIME_SPOTS.some((c) => Math.hypot(x - c.x, y - c.y + 2.2, z - c.z) < CHIME_REACH); // (her feet are a couple of metres under the eaves)
// Is a spot over the bridge's planks (within a metre of the line), as far as the ground plan can tell? Pure, allocation-free.
export function nearBridge(x, z) {
  for (const line of P.BRIDGE_LINES) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]; const b = line[i + 1];
      const dx = b.x - a.x; const dz = b.z - a.z;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(x - (a.x + dx * u), z - (a.z + dz * u)) < 1) return true;
    }
  }
  return false;
}

// createTreehouseCritters(ctx) -> { spottable, update(dt, t, catPos), dispose(), counts }; ctx is walk.js's life context (scene, reducedMotion, tier, audio).
export function createTreehouseCritters({ scene, reducedMotion = false, tier = null, audio = null }) {
  const rung = lifeRung(tier);
  const N = { ...COUNTS[rung] };
  if (reducedMotion) N.leaves = Math.min(N.leaves, STILL_LEAVES);
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const geos = { bird: birdGeometry(), owl: owlGeometry() };
  const make = (name, geo) => { const m = mark(new THREE.Mesh(geo, lit)); m.name = `treehouse:${name}`; scene.add(m); return m; };
  const birds = Array.from({ length: N.birds }, (_, i) => make(`bird${i}`, geos.bird));
  const owl = make('owl', geos.owl);
  const ledge = make('ledge', paint(new THREE.BoxGeometry(0.7, 0.07, 0.34), COL.ledge));
  ledge.position.set(OWL.x, OWL.ledgeY, OWL.z - 0.02);

  // the fireflies (additive glow, black when dim) and the falling leaves (plain, in their own gold and green): one Points each
  const points = (n, name, mat) => {
    const pos = new Float32Array(n * 3); const col = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const o = mark(new THREE.Points(g, mat)); o.name = name; o.frustumCulled = false; scene.add(o);
    return { pos, col, g, o };
  };
  const F = points(N.flies + N.motes, 'treehouse:fireflies', new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, size: 0.34, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
  const burst = reducedMotion ? 0 : BURST[rung];
  const L = points(N.leaves + burst, 'treehouse:fallingleaves', new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, size: 0.34, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, fog: true }));

  // the journal subjects, one entry for each kind (the walk awards once a kind a walk)
  const spottable = [
    { type: 'tl1', label: phrase('treehouse.life.bird'), pos: new THREE.Vector3(), range: RANGES.tl1 },
    { type: 'tl2', label: phrase('treehouse.life.owl'), pos: new THREE.Vector3(OWL.x, OWL.y + 0.3, OWL.z), range: RANGES.tl2 },
    { type: 'tl3', label: phrase('treehouse.life.firefly'), pos: new THREE.Vector3(), range: RANGES.tl3 },
  ];
  const pose = {}; const fly = {}; const leaf = {};
  const cFly = new THREE.Color(COL.fly); const cLeaf = [new THREE.Color(COL.leaf), new THREE.Color(COL.leaf2), new THREE.Color(COL.leaf3)]; const cFloor = new THREE.Color(P.TREE_LOOK.floorLeaf); const cTmp = new THREE.Color();

  owl.position.set(OWL.x, OWL.y, OWL.z); owl.rotation.y = OWL.yaw;

  function draw(t) {
    for (let i = 0; i < birds.length; i++) {
      birdPose(i, t, pose, reducedMotion);
      birds[i].position.set(pose.x, pose.y + pose.bob, pose.z); birds[i].rotation.set(pose.flying ? -0.25 : 0, pose.yaw, 0);
    }
    spottable[0].pos.set(birds[0].position.x, birds[0].position.y, birds[0].position.z);
    owl.scale.y = 1 + (reducedMotion ? 0 : 0.035 * Math.sin(t * 1.1)); // she breathes
    owl.rotation.y = OWL.yaw + (reducedMotion ? 0 : 0.18 * Math.sin(t * 0.13));
    for (let i = 0; i < N.flies; i++) {
      fireflyAt(i, t, fly);
      F.pos[i * 3] = fly.x; F.pos[i * 3 + 1] = fly.y; F.pos[i * 3 + 2] = fly.z;
      const gl = reducedMotion ? 0.8 : fly.glow;
      F.col[i * 3] = cFly.r * gl; F.col[i * 3 + 1] = cFly.g * gl; F.col[i * 3 + 2] = cFly.b * gl;
    }
    for (let k = 0; k < N.motes; k++) {
      const i = N.flies + k;
      moteAt(k, t, fly);
      F.pos[i * 3] = fly.x; F.pos[i * 3 + 1] = fly.y; F.pos[i * 3 + 2] = fly.z;
      const gl = reducedMotion ? 0.35 : fly.glow;
      F.col[i * 3] = cFly.r * gl; F.col[i * 3 + 1] = cFly.g * gl; F.col[i * 3 + 2] = cFly.b * gl * 0.8;
    }
    spottable[2].pos.set(F.pos[0], F.pos[1], F.pos[2]);
    for (let i = 0; i < N.leaves; i++) {
      leafAt(i, t, leaf);
      L.pos[i * 3] = leaf.x; L.pos[i * 3 + 1] = leaf.y; L.pos[i * 3 + 2] = leaf.z;
      cTmp.copy(cLeaf[i % 3]).lerp(cFloor, smooth((leaf.u - 0.9) / 0.1)); // on the floor it is just litter
      L.col[i * 3] = cTmp.r; L.col[i * 3 + 1] = cTmp.g; L.col[i * 3 + 2] = cTmp.b;
    }
    for (let k = 0; k < burst; k++) { const i = N.leaves + k; L.pos[i * 3 + 1] = -200; } // the shower waits out of sight
    F.g.attributes.position.needsUpdate = true; F.g.attributes.color.needsUpdate = true; L.g.attributes.position.needsUpdate = true; L.g.attributes.color.needsUpdate = true;
  }
  draw(0);

  // the shower from a landing (its leaves are the last `burst` slots of L): sky.reaction.landedAt says when
  const sky = scene.getObjectByName('treehouse:leaves')?.material?.userData?.sky ?? null;
  let seenLand = sky ? sky.reaction.landedAt : 0; let showerAt = -99; let sx = 0; let sy = 0; let sz = 0;
  const shower = (t) => {
    const age = t - showerAt;
    for (let k = 0; k < burst; k++) {
      const i = N.leaves + k;
      if (age < 0 || age > BURST.life) { L.pos[i * 3 + 1] = -200; continue; }
      burstLeaf(k, age, sx, sy, sz, fly);
      L.pos[i * 3] = fly.x; L.pos[i * 3 + 1] = Math.max(fly.y, sy + 0.05); L.pos[i * 3 + 2] = fly.z;
      cTmp.copy(cLeaf[k % 3]).multiplyScalar(fly.fade);
      L.col[i * 3] = cTmp.r; L.col[i * 3 + 1] = cTmp.g; L.col[i * 3 + 2] = cTmp.b;
    }
    L.g.attributes.position.needsUpdate = true; L.g.attributes.color.needsUpdate = true;
  };
  let nextChime = CHIME_GAP.first; let nearUntil = 0; let wasNear = false; let chimes = 0; let steps = 0; let walked = 0; let lx = 0; let lz = 0; let have = false;
  return {
    rung,
    spottable,
    counts: { rung, ...N, meshes: birds.length + 2 },
    update(dt, t, catPos) {
      const d = dt > 0 ? Math.min(dt, 1) : 0;
      if (!reducedMotion) draw(t);
      if (sky && catPos && sky.reaction.landedAt !== seenLand) { // she has just landed: a shower of leaves from the boughs over her and a soft thump (the leaves only when motion is allowed)
        seenLand = sky.reaction.landedAt;
        if (burst) { showerAt = t; sx = catPos.x; sy = catPos.y; sz = catPos.z; }
        thumpNote(audio, sky.reaction.land);
      }
      if (burst && t - showerAt <= BURST.life + 0.1) shower(t);
      if (t >= nextChime) { chimeNote(audio, chimes); chimes++; nextChime = t + CHIME_GAP.min + CHIME_GAP.span * hash01(chimes, 32); } // (the schedule runs on while muted: no catching up)
      if (catPos && Number.isFinite(catPos.y)) { // a brush past a wind chime sets it ringing (once on coming near, then not again for a few seconds)
        const near = nearChime(catPos.x, catPos.y, catPos.z);
        if (near && !wasNear && t >= nearUntil) { chimeNote(audio, chimes + 7); chimes++; nearUntil = t + CHIME_COOL; }
        wasNear = near;
      }
      if (catPos && d > 0) {
        const moved = have ? Math.hypot(catPos.x - lx, catPos.z - lz) : 0;
        lx = catPos.x; lz = catPos.z; have = true;
        if (moved < 3) { // a jump of more than a few metres is a hop through a door, not a stride
          walked += moved;
          if (walked >= STEP_METRES) {
            walked -= STEP_METRES;
            if (Number.isFinite(catPos.y) ? catPos.y > WOOD_Y : nearBridge(catPos.x, catPos.z)) creakNote(audio, steps++); // only on the wood
          }
        } else walked = 0;
      }
    },
    dispose() {
      scene.remove(...birds, owl, ledge, F.o, L.o);
      for (const g of Object.values(geos)) g.dispose();
      ledge.geometry.dispose(); lit.dispose(); F.g.dispose(); F.o.material.dispose(); L.g.dispose(); L.o.material.dispose();
    },
  };
}
