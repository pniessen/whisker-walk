// =============================================================================
// THE JUNGLE LODGE: LIFE AND SOUND (milestone J4). Bright macaws and a toucan that rest in the tall trees' crowns and fly between them now and then, little frogs on the river banks that
// sit and hop and, when the rain comes, puff their throats and sing; and the sounds: the soft patter of the shower (from junglelight.js's own rain schedule, passed in as `rain`; there
// is no second schedule), a frog's two-note croak while it rains, and a bird's gentle call when it does not. Decoration that moves: none of it is a rule, a find or a danger, none comes
// at her, blocks her or needs her. The macaws, the frogs and the toucan are also journal subjects (`spottable`, the walk's farm-animal rule in src/game/interactions.js: near and
// looking: pages jw1, jw2, jw5). Every pose is a pure function of the walk's time and a hashed phase (no random number, no clock); reduced motion draws everything once at time zero
// (birds perched, frogs sitting) and holds still; the lower rungs keep fewer birds and frogs. No light is added. Nothing is made per frame (scratch values only). The sounds ask for no
// audio context while muted. Stage chunk code (junglestageb.js); start-up never imports it. Modelled on Snowville's snowvillecritters.js and the Treehouse's treehousecritters.js.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import * as P from './jungleplan.js';
import { paint } from './jungleparts.js';
import { isLowTier } from './junglelight.js';
import './junglecritterwords.js';

export const hash01 = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((s | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const fr = (v) => v - Math.floor(v);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export const lifeRung = (tier) => (tier && tier.shadows === false ? 'lite' : isLowTier(tier) ? 'low' : 'high');
export const COUNTS = Object.freeze({ high: Object.freeze({ macaws: 3, frogs: 6 }), low: Object.freeze({ macaws: 2, frogs: 4 }), lite: Object.freeze({ macaws: 1, frogs: 2 }) }); // (the toucan stays on every rung)
export const RANGES = Object.freeze({ jw1: 10, jw2: 7, jw5: 10 }); // how near she must be (and facing it) to spot one
export const RAIN_SINGS = 0.25; // the shower's strength over which the frogs sing

// ---- where things are --------------------------------------------------------------------------------------------------------------------
// The crowns: the broad trees inside the walk nearest the lodge (the birds' places). A tree's crown tops out 7.5 scales up (jungleparts.js treeParts); the feet stand a hand into the leaves.
const HOME = Object.freeze({ x: -4, z: 8 });
let crownList = null;
export function crowns() {
  crownList ??= P.scatterTrees().filter((k) => !k.rim && k.kind === 'broad').sort((a, b) => Math.hypot(a.x - HOME.x, a.z - HOME.z) - Math.hypot(b.x - HOME.x, b.z - HOME.z)).slice(0, 8)
    .map((k) => Object.freeze({ x: k.x, z: k.z, y: P.jungleY(k.x, k.z) + (k.top ?? 7.4 * k.s) - 0.1 }));
  return crownList;
}
// A bird's two perches: bird i (the toucan is index 3) goes between two of the near crowns, each pair different.
const PAIRS = Object.freeze([[0, 3], [1, 4], [2, 5], [6, 7]]);
export const birdPosts = (i) => { const c = crowns(); const [a, b] = PAIRS[i % PAIRS.length]; return [c[a % c.length], c[b % c.length]]; };
export const TOUCAN = 3;
// The frogs: on the river's banks (north side, then south), a metre from the water's edge, off the log bridge and the stepping stones.
export const FROG_XS = Object.freeze([-38, -28, -19, 1, 19, 32]);
export function riverZ(x) {
  const R = P.RIVER_PATH;
  for (let i = 0; i + 1 < R.length; i++) if (x <= R[i + 1][0]) { const u = (x - R[i][0]) / (R[i + 1][0] - R[i][0]); return R[i][1] + (R[i + 1][1] - R[i][1]) * u; }
  return R[R.length - 1][1];
}
export const frogSpot = (i, out = {}) => {
  const x = FROG_XS[i % FROG_XS.length];
  const z = riverZ(x) + (i % 2 ? -1 : 1) * (P.RIVER_W + 0.55);
  out.x = x; out.z = z; out.y = P.jungleY(x, z) + 0.02; return out;
};

// ---- the poses (pure) --------------------------------------------------------------------------------------------------------------------
// Bird i at time t: rests in one crown, a flight across the gap to the other, a long rest, and back. `k` 0 on the first crown, 1 on the second. `still` holds it perched.
export function birdPose(i, t, out = {}, still = false) {
  const [a, b] = birdPosts(i);
  const T = 34 + 7 * (i % 4);
  const u = still ? 0 : fr(t / T + hash01(i, 51));
  const k = u < 0.4 ? 0 : u < 0.48 ? smooth((u - 0.4) / 0.08) : u < 0.9 ? 1 : 1 - smooth((u - 0.9) / 0.08);
  out.k = k;
  out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k;
  out.y = a.y + (b.y - a.y) * k + 1.6 * Math.sin(k * Math.PI);
  out.flying = k > 0 && k < 1;
  const toB = u < 0.5;
  out.yaw = out.flying ? Math.atan2(b.x - a.x, b.z - a.z) + (toB ? 0 : Math.PI) : (k < 0.5 ? 0.9 : -0.9) + (still ? 0 : 0.3 * Math.sin(t * 0.7 + i));
  out.flap = out.flying ? 0.5 * Math.sin(t * 14 + i) : 0; // a little wing-beat roll
  out.bob = out.flying || still ? 0 : 0.04 * Math.max(0, Math.sin(t * 2.2 + i * 2));
  return out;
}
// Frog i at time t with the shower's strength `rain` 0..1: sits; hops in place now and then (a small arc); while it rains, throat puffing ({ x, y, z, yaw, puff 0..1 }). `still` holds it sitting.
export function frogPose(i, t, rain = 0, out = {}, still = false) {
  frogSpot(i, out);
  const T = 14 + 6 * hash01(i, 81);
  const u = still ? 0.5 : fr(t / T + hash01(i, 82));
  const hop = u < 0.06 ? Math.sin((u / 0.06) * Math.PI) : 0;
  out.y += 0.14 * hop;
  out.yaw = (i % 2 ? 0 : Math.PI) + 0.5 * Math.sin(i * 1.9) + (still ? 0 : 0.1 * Math.sin(t * 0.3 + i));
  out.puff = still || rain < RAIN_SINGS ? 0 : Math.max(0, Math.sin(t * 5.5 + i * 1.9)) * Math.min(1, (rain - RAIN_SINGS) * 3);
  return out;
}

// ---- drawing: each creature is one vertex-coloured mesh ----------------------------------------------------------------------------------
const B = (r, x, y, z, sx, sy, sz, hex, seg = 7) => paint(new THREE.SphereGeometry(r, seg, seg - 2).scale(sx, sy, sz).translate(x, y, z), hex);
const COL = Object.freeze({ red: 0xd8402e, blue: 0x3a6fd0, yellow: 0xf0c038, beak: 0xefe6d0, black: 0x26242e, orange: 0xf2902a, toucanBreast: 0xf6e07a, frog: 0x58b04a, frogBelly: 0xd9e8a0, eye: 0x2a2a30, wingGreen: 0x3a9a4a });

export function macawGeometry() {
  return mergeGeometries([
    B(0.11, 0, 0.14, 0, 1, 1.15, 1.5, COL.red, 8), B(0.075, 0, 0.27, 0.1, 1, 1, 1, COL.red, 7), // body and head
    paint(new THREE.ConeGeometry(0.03, 0.09, 5).rotateX(Math.PI / 2 + 0.5).translate(0, 0.25, 0.2), COL.beak),
    paint(new THREE.BoxGeometry(0.05, 0.02, 0.38).rotateX(-0.3).translate(0, 0.07, -0.34), COL.blue), // the long tail
    paint(new THREE.BoxGeometry(0.26, 0.02, 0.2).translate(0, 0.17, -0.02), COL.blue), // the folded wings
    paint(new THREE.BoxGeometry(0.2, 0.02, 0.08).translate(0, 0.185, 0.03), COL.yellow),
    B(0.012, -0.06, 0.29, 0.14, 1, 1, 1, COL.eye, 4), B(0.012, 0.06, 0.29, 0.14, 1, 1, 1, COL.eye, 4),
  ]);
}
export function toucanGeometry() {
  return mergeGeometries([
    B(0.1, 0, 0.13, 0, 1, 1.15, 1.4, COL.black, 8), B(0.07, 0, 0.12, 0.08, 1, 1, 0.8, COL.toucanBreast, 7), B(0.075, 0, 0.26, 0.09, 1, 1, 1, COL.black, 7),
    paint(new THREE.ConeGeometry(0.05, 0.28, 6).rotateX(Math.PI / 2 + 0.15).translate(0, 0.25, 0.25), COL.orange), // the huge beak
    paint(new THREE.BoxGeometry(0.06, 0.02, 0.3).rotateX(-0.25).translate(0, 0.07, -0.3), COL.black),
    B(0.012, -0.06, 0.29, 0.13, 1, 1, 1, COL.eye, 4), B(0.012, 0.06, 0.29, 0.13, 1, 1, 1, COL.eye, 4),
  ]);
}
export function frogGeometry() {
  return mergeGeometries([
    B(0.09, 0, 0.07, 0, 1.1, 0.8, 1.2, COL.frog, 8), B(0.06, 0, 0.05, 0.07, 1, 0.7, 0.8, COL.frogBelly, 7), // body and the throat
    B(0.022, -0.05, 0.14, 0.07, 1, 1, 1, COL.frog, 5), B(0.022, 0.05, 0.14, 0.07, 1, 1, 1, COL.frog, 5),
    B(0.012, -0.05, 0.155, 0.085, 1, 1, 1, COL.eye, 4), B(0.012, 0.05, 0.155, 0.085, 1, 1, 1, COL.eye, 4),
    paint(new THREE.BoxGeometry(0.16, 0.02, 0.08).translate(0, 0.02, -0.09), COL.wingGreen), // the folded back legs
  ]);
}

const mark = (o) => { o.castShadow = false; o.receiveShadow = false; Object.assign(o.userData, { noMerge: true, noCast: true, noContactShadow: true }); return o; };

// ---- the sounds (silent when muted: no audio context is asked for) --------------------------------------------------------------------------
export const PATTER_GAP = 0.45; // seconds between two puffs of rain-hush while it showers (the walk's own time)
export const CROAK_GAP = Object.freeze({ min: 1.6, span: 2.6 }); // seconds between two frogs' croaks while it rains
export const CALL_GAP = Object.freeze({ first: 9, min: 16, span: 18 }); // seconds before the first bird call, and between two (never in the rain)
function soundCtx(audio) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.()) return null;
  return audio.getContext() ?? null;
}
const noiseOf = new WeakMap(); // one short seeded hiss for each audio context, made the first time rain is heard
function hiss(ac) {
  let b = noiseOf.get(ac);
  if (!b) {
    const n = Math.floor((ac.sampleRate || 44100) * 0.8);
    b = ac.createBuffer(1, n, ac.sampleRate || 44100);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = hash01(i, 91) * 2 - 1;
    noiseOf.set(ac, b);
  }
  return b;
}
// The patter: a soft band of hiss that swells and fades, louder with the shower and a little lower and warmer under the roof or a leaf.
export function patterNote(audio, strength = 1, cover = 0) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime;
  const src = ac.createBufferSource(); const flt = ac.createBiquadFilter(); const g = ac.createGain();
  src.buffer = hiss(ac);
  flt.type = 'bandpass'; flt.frequency.value = 3400 - 1500 * cover; flt.Q.value = 0.7;
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.02 * strength * (1 + 0.3 * cover)), now + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
  src.connect(flt); flt.connect(g); g.connect(audio.getMaster?.() ?? ac.destination);
  src.start(now); src.stop(now + 0.8);
  return true;
}
// A frog's croak: two quick low notes ("rib-bit"), a triangle wave through a lowpass, the second a little higher.
export function croakNote(audio, k = 0) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime;
  const base = 250 + 120 * hash01(k, 41);
  for (let n = 0; n < 2; n++) {
    const at = now + n * 0.16;
    const o = ac.createOscillator(); const flt = ac.createBiquadFilter(); const g = ac.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(base * (1 + 0.25 * n), at); o.frequency.exponentialRampToValueAtTime(base * (0.8 + 0.2 * n), at + 0.12);
    flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = 3;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.012, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    o.connect(flt); flt.connect(g); g.connect(audio.getMaster?.() ?? ac.destination);
    o.start(at); o.stop(at + 0.16);
  }
  return true;
}
// A bird's call: two soft rising sine notes.
export function callNote(audio, k = 0) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime;
  const f = 900 + 500 * hash01(k, 42);
  for (let n = 0; n < 2; n++) {
    const at = now + n * 0.2;
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * (1 + 0.3 * n), at); o.frequency.exponentialRampToValueAtTime(f * (1.25 + 0.3 * n), at + 0.15);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.01, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    o.connect(g); g.connect(audio.getMaster?.() ?? ac.destination);
    o.start(at); o.stop(at + 0.22);
  }
  return true;
}

// createJungleCritters(ctx) -> { rung, spottable, counts, update(dt, t, catPos, rain), dispose() }; ctx is walk.js's life context (scene, reducedMotion, tier, audio). `rain` is junglelight.js's
// `state` ({ strength, cover }); without it the sky is dry.
export function createJungleCritters({ scene, reducedMotion = false, tier = null, audio = null }) {
  const rung = lifeRung(tier);
  const N = { ...COUNTS[rung] };
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const geos = { macaw: macawGeometry(), toucan: toucanGeometry(), frog: frogGeometry() };
  const make = (name, geo) => { const m = mark(new THREE.Mesh(geo, lit)); m.name = `jungle:${name}`; scene.add(m); return m; };
  const macaws = Array.from({ length: N.macaws }, (_, i) => make(`macaw${i}`, geos.macaw));
  const toucan = make('toucan', geos.toucan);
  const frogs = Array.from({ length: N.frogs }, (_, i) => make(`frog${i}`, geos.frog));

  const spottable = [
    { type: 'jw1', label: phrase('jungle.life.macaw'), pos: new THREE.Vector3(), range: RANGES.jw1 },
    { type: 'jw2', label: phrase('jungle.life.frog'), pos: new THREE.Vector3(), range: RANGES.jw2 },
    { type: 'jw5', label: phrase('jungle.life.toucan'), pos: new THREE.Vector3(), range: RANGES.jw5 },
  ];
  const pose = {};

  function draw(t, rain) {
    for (let i = 0; i < macaws.length; i++) {
      birdPose(i, t, pose, reducedMotion);
      macaws[i].position.set(pose.x, pose.y + pose.bob, pose.z); macaws[i].rotation.set(pose.flying ? -0.2 : 0, pose.yaw, pose.flap);
    }
    birdPose(TOUCAN, t, pose, reducedMotion);
    toucan.position.set(pose.x, pose.y + pose.bob, pose.z); toucan.rotation.set(pose.flying ? -0.2 : 0, pose.yaw, pose.flap);
    for (let i = 0; i < frogs.length; i++) {
      frogPose(i, t, rain, pose, reducedMotion);
      frogs[i].position.set(pose.x, pose.y, pose.z); frogs[i].rotation.y = pose.yaw;
      frogs[i].scale.set(1 + 0.12 * pose.puff, 1 + 0.2 * pose.puff, 1 + 0.12 * pose.puff);
    }
    spottable[0].pos.copy(macaws[0].position); spottable[1].pos.copy(frogs[0].position); spottable[2].pos.copy(toucan.position);
  }
  draw(0, 0);

  let nextPatter = 0; let nextCroak = 1; let croaks = 0; let nextCall = CALL_GAP.first; let calls = 0;
  return {
    rung,
    spottable,
    counts: { rung, ...N, meshes: macaws.length + 1 + frogs.length },
    update(dt, t, catPos, rain) {
      const strength = rain?.strength ?? 0;
      if (!reducedMotion) draw(t, strength);
      // (each schedule runs on while muted: no catching up)
      if (strength > 0.05) {
        if (t >= nextPatter) { patterNote(audio, strength, rain?.cover ?? 0); nextPatter = t + PATTER_GAP; }
        if (strength >= RAIN_SINGS && t >= nextCroak) { croakNote(audio, croaks); croaks++; nextCroak = t + CROAK_GAP.min + CROAK_GAP.span * hash01(croaks, 43); }
      } else if (t >= nextCall) { callNote(audio, calls); calls++; nextCall = t + CALL_GAP.min + CALL_GAP.span * hash01(calls, 44); }
    },
    dispose() {
      scene.remove(...macaws, toucan, ...frogs);
      for (const g of Object.values(geos)) g.dispose();
      lit.dispose();
    },
  };
}
