// =============================================================================
// SNOWVILLE: THE FRIENDLY LIFE AND THE SOUND (milestone V4). Skating otters on the pond, a shy hare that peeks out of its burrow in the fir wood, a robin that hops between two lamp
// posts by the gate, a fox kit asleep beside the brazier, smoke from the cottage chimneys; and the two sounds, soft bells now and then and the crunch of her paws in the snow.
// Decoration that moves: none of it is a rule, a find or a danger, none comes at her, blocks her or needs her. The otters, the robin and the fox kit are also journal subjects (`spottable`,
// the walk's own farm-animal rule in src/game/interactions.js: near and looking: pages sw1..sw3). Every pose is a pure function of the walk's time and a hashed phase (no random number,
// no clock); reduced motion draws everything once at time zero (the hare peeking, the robin perched, the smoke a still wisp); the lower rungs keep fewer otters and puffs. No light is
// added. Nothing is made per frame (scratch values only). The sounds ask for no audio context while muted. Stage chunk code (snowvillestageb.js); start-up never imports it.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import * as P from './snowvilleplan.js';
import { paint, dotTexture } from './snowvilleparts.js';
import { isLowTier, gustAt } from './snowvillelight.js';
import { smokeLean, SHARED } from './snowvillealive.js';
import './snowvillecritterwords.js';

export const TAU = Math.PI * 2;
export const hash01 = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((s | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const fr = (v) => v - Math.floor(v);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export const lifeRung = (tier) => (tier && tier.shadows === false ? 'lite' : isLowTier(tier) ? 'low' : 'high');
export const COUNTS = Object.freeze({ high: Object.freeze({ otters: 3, puffs: 7 }), low: Object.freeze({ otters: 2, puffs: 4 }), lite: Object.freeze({ otters: 1, puffs: 2 }) });
export const RANGES = Object.freeze({ sw1: 12, sw2: 7, sw3: 6 }); // how near she must be (and facing it) to spot one

// ---- where things are (all over the plan's own places) --------------------------------------------------------------------------------------
export const OTTER = Object.freeze({ x: P.POND.x, z: P.POND.z, ring: 3.2, step: 1.4 }); // the pond's middle; the otters circle at 3.2, 4.6, 6.0 m (the pond is 8 m wide)
export const HARE = Object.freeze({ x: -8.9, z: -26.5, yaw: 0.5, period: 16 }); // beside the fir wood's burrow find (snowvillefindsplan.js: -8, -26)
export const ROBIN = Object.freeze({ lamps: Object.freeze([P.LAMPS[6], P.LAMPS[0]]), top: 3.22, period: 26 }); // the court's lamp post and the next one up the lane
export const FOX = Object.freeze({ x: 6.4, z: 32.4, yaw: 2.4 }); // asleep in the brazier's glow (the brazier is at 4.5, 31)
export const CHIMNEYS = Object.freeze(P.COTTAGES.map((c) => {
  const rise = Math.min(c.w, c.d) * 0.36 + 0.4; // the cottage's own chimney (snowvilleparts.js cottageParts), in its frame then turned and stood
  const lx = c.w * 0.28; const lz = -c.d * 0.2; const s = Math.sin(c.yaw); const co = Math.cos(c.yaw);
  return Object.freeze({ x: c.x + lx * co + lz * s, z: c.z - lx * s + lz * co, y: P.snowY(c.x, c.z) + c.h + rise + 1.0 });
}));

// ---- the poses (pure) ------------------------------------------------------------------------------------------------------------------------
// Otter i at time t: a slow slide round the pond, each on its own ring and way round, turned along its path, leaning into the turn.
export function otterPose(i, t, out = {}) {
  const dir = i % 2 ? -1 : 1;
  const w = (0.2 + 0.05 * hash01(i, 11)) * dir;
  const a = hash01(i, 12) * TAU + w * t;
  const R = OTTER.ring + OTTER.step * i;
  out.x = OTTER.x + Math.cos(a) * R; out.z = OTTER.z + Math.sin(a) * R;
  out.yaw = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
  out.y = P.snowY(out.x, out.z) + 0.02;
  out.lean = -0.14 * dir * (0.6 + 0.4 * Math.sin(t * 0.9 + i));
  return out;
}
// The hare: hidden, rising, looking about, sinking again; 0 is down in the burrow and 1 is up. Reduced motion holds it up (t = 0 is a peek).
export function harePeek(t) { const u = fr(t / HARE.period + 0.04); return smooth(u / 0.08) * (1 - smooth((u - 0.3) / 0.08)); }
// The robin: perched on one lamp, flitting to the other and back; `k` 0 on the first post, 1 on the second.
export function robinPose(t, out = {}) {
  const u = fr(t / ROBIN.period) * ROBIN.period; const L = ROBIN.lamps;
  const fly = (a) => smooth((u - a) / 2);
  const k = u < 11 ? 0 : u < 13 ? fly(11) : u < 23 ? 1 : u < 25 ? 1 - fly(23) : 0;
  out.x = L[0].x + (L[1].x - L[0].x) * k; out.z = L[0].z + (L[1].z - L[0].z) * k;
  out.y = P.snowY(out.x, out.z) + ROBIN.top + 1.1 * Math.sin(k * Math.PI);
  out.flying = k > 0 && k < 1;
  out.yaw = (out.flying ? Math.atan2(L[1].x - L[0].x, L[1].z - L[0].z) + (u >= 23 ? Math.PI : 0) : (k < 0.5 ? 0.6 : -2.2)) + (out.flying ? 0 : 0.4 * Math.sin(t * 0.7));
  return out;
}
// A puff of chimney smoke: its place along its rise (0 at the chimney, 1 gone), drifting a little with the lane's breeze.
export function puffAt(c, j, t, out = {}) {
  const u = fr(t * 0.14 + j / 6 + hash01(c, 21) * 0.5);
  out.u = u;
  out.x = CHIMNEYS[c].x + u * 1.1 + 0.18 * Math.sin(u * 7 + c + j);
  out.y = CHIMNEYS[c].y + u * 3.4;
  out.z = CHIMNEYS[c].z + u * 0.4;
  return out;
}

// ---- drawing: each creature is one vertex-coloured mesh -------------------------------------------------------------------------------------
const B = (r, x, y, z, sx, sy, sz, hex, seg = 7) => paint(new THREE.SphereGeometry(r, seg, seg - 2).scale(sx, sy, sz).translate(x, y, z), hex);
const COL = Object.freeze({ otter: 0x7a5a42, cream: 0xe0cba8, dark: 0x2c2a38, hare: 0xeef2f7, grey: 0xb9c2cf, pink: 0xf0b8c8, robin: 0x7d6a58, breast: 0xe2603a, beak: 0xe8b04a, fox: 0xd9803c, tip: 0xf6efe4 });

export function otterGeometry() {
  const parts = [
    B(0.17, 0, 0.16, 0, 0.8, 0.7, 2.1, COL.otter, 8), B(0.1, 0, 0.1, 0.08, 0.9, 0.5, 1.6, COL.cream), B(0.12, 0, 0.23, 0.38, 1, 0.9, 1, COL.otter, 8), B(0.06, 0, 0.2, 0.5, 1, 0.7, 1, COL.cream),
    B(0.02, 0, 0.22, 0.56, 1, 0.8, 1, COL.dark, 5), B(0.018, -0.06, 0.27, 0.46, 1, 1, 1, COL.dark, 5), B(0.018, 0.06, 0.27, 0.46, 1, 1, 1, COL.dark, 5),
    B(0.03, -0.09, 0.33, 0.33, 1, 1, 0.6, COL.otter, 5), B(0.03, 0.09, 0.33, 0.33, 1, 1, 0.6, COL.otter, 5),
    paint(new THREE.ConeGeometry(0.06, 0.5, 6).rotateX(-Math.PI / 2).translate(0, 0.12, -0.5), COL.otter),
  ];
  return mergeGeometries(parts);
}
export function hareGeometry() {
  const parts = [B(0.14, 0, 0.14, 0, 0.9, 0.95, 1.2, COL.hare, 8), B(0.1, 0, 0.3, 0.12, 1, 0.95, 1.05, COL.hare, 8), B(0.04, 0, 0.12, -0.18, 1, 1, 1, COL.hare, 5),
    B(0.02, -0.05, 0.33, 0.21, 1, 1, 1, COL.dark, 5), B(0.02, 0.05, 0.33, 0.21, 1, 1, 1, COL.dark, 5), B(0.018, 0, 0.29, 0.23, 1, 0.8, 1, COL.pink, 5)];
  for (const s of [-1, 1]) {
    parts.push(paint(new THREE.SphereGeometry(0.04, 6, 4).scale(0.7, 3.4, 0.45).rotateX(-0.2).translate(s * 0.05, 0.5, 0.1), COL.hare));
    parts.push(paint(new THREE.SphereGeometry(0.026, 5, 4).scale(0.6, 3, 0.3).rotateX(-0.2).translate(s * 0.05, 0.5, 0.125), COL.pink));
  }
  return mergeGeometries(parts);
}
export function robinGeometry() {
  return mergeGeometries([
    B(0.07, 0, 0.09, 0, 1, 1, 1.2, COL.robin, 8), B(0.056, 0, 0.085, 0.045, 1, 1, 1, COL.breast, 7), B(0.045, 0, 0.17, 0.06, 1, 1, 1, COL.robin, 7), B(0.036, 0, 0.16, 0.085, 0.9, 1, 0.9, COL.breast, 6),
    paint(new THREE.ConeGeometry(0.014, 0.05, 5).rotateX(Math.PI / 2).translate(0, 0.17, 0.12), COL.beak), B(0.01, -0.03, 0.19, 0.095, 1, 1, 1, COL.dark, 4), B(0.01, 0.03, 0.19, 0.095, 1, 1, 1, COL.dark, 4),
    paint(new THREE.BoxGeometry(0.05, 0.015, 0.12).rotateX(0.3).translate(0, 0.1, -0.12), COL.robin),
  ]);
}
export function foxGeometry() {
  return mergeGeometries([
    B(0.2, 0, 0.14, 0, 1.2, 0.7, 1, COL.fox, 8), B(0.1, 0.19, 0.12, 0.1, 1, 0.9, 1, COL.fox, 7), B(0.04, 0.24, 0.12, 0.19, 1, 0.8, 1, COL.dark, 5),
    B(0.026, 0.14, 0.22, 0.06, 0.8, 1.3, 0.8, COL.fox, 5), B(0.026, 0.25, 0.22, 0.1, 0.8, 1.3, 0.8, COL.fox, 5),
    B(0.1, -0.1, 0.1, 0.17, 1.6, 0.8, 0.9, COL.fox, 7), B(0.07, 0.04, 0.1, 0.24, 1.3, 0.8, 0.9, COL.tip, 6), // the tail curls round her; its tip is white
  ]);
}

const mark = (o) => { o.castShadow = false; o.receiveShadow = false; Object.assign(o.userData, { noMerge: true, noCast: true, noContactShadow: true }); return o; };

// ---- the sounds (silent when muted: no audio context is asked for) ------------------------------------------------------------------------
const BELL_NOTES = Object.freeze([523.3, 587.3, 659.3, 784, 880]);
export const BELL_GAP = Object.freeze({ first: 14, min: 26, span: 22 }); // seconds before the first bell, and between two (the walk's own time)
export const STEP_METRES = 0.85; // one crunch for each stride's worth of walking
const noiseOf = new WeakMap();
function soundCtx(audio) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.()) return null;
  return audio.getContext() ?? null;
}
// A soft bell: a sine and its bright partial, quick to start and a long, quiet fade.
export function bellNote(audio, k = 0) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const f = BELL_NOTES[Math.floor(hash01(k, 31) * BELL_NOTES.length)];
  const now = ac.currentTime;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.022, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
  g.connect(audio.getMaster?.() ?? ac.destination);
  for (const [m, v] of [[1, 1], [2.76, 0.25]]) {
    const o = ac.createOscillator(); const og = ac.createGain();
    o.type = 'sine'; o.frequency.value = f * m; og.gain.value = v;
    o.connect(og); og.connect(g); o.start(now); o.stop(now + 2.7);
  }
  return true;
}
// The crunch of a paw: a hushed burst of filtered noise, a touch higher on every other step.
export function crunchNote(audio, k = 0) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  let buf = noiseOf.get(ac);
  if (!buf) {
    buf = ac.createBuffer(1, Math.max(8, Math.floor(ac.sampleRate * 0.1)), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (hash01(i, 41) * 2 - 1) * (1 - i / d.length) ** 2;
    noiseOf.set(ac, buf);
  }
  const now = ac.currentTime;
  const src = ac.createBufferSource(); const flt = ac.createBiquadFilter(); const g = ac.createGain();
  src.buffer = buf; flt.type = 'bandpass'; flt.frequency.value = k % 2 ? 2700 : 2200; flt.Q.value = 0.9;
  g.gain.setValueAtTime(0.014, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  src.connect(flt); flt.connect(g); g.connect(audio.getMaster?.() ?? ac.destination);
  src.start(now);
  return true;
}

// createSnowvilleCritters(ctx) -> { spottable, update(dt, t, catPos), dispose(), counts }; ctx is walk.js's life context (scene, reducedMotion, tier, audio).
export function createSnowvilleCritters({ scene, reducedMotion = false, tier = null, audio = null }) {
  const rung = lifeRung(tier);
  const N = COUNTS[rung];
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const geos = { otter: otterGeometry(), hare: hareGeometry(), robin: robinGeometry(), fox: foxGeometry() };
  const make = (name, geo) => { const m = mark(new THREE.Mesh(geo, lit)); m.name = `snowville:${name}`; scene.add(m); return m; };
  const otters = Array.from({ length: N.otters }, (_, i) => make(`otter${i}`, geos.otter));
  const hare = make('hare', geos.hare);
  const robin = make('robin', geos.robin);
  const fox = make('fox', geos.fox);

  // the smoke: one Points of soft grey dots, fading to the haze as they climb
  const nPuffs = CHIMNEYS.length * N.puffs;
  const sPos = new Float32Array(nPuffs * 3); const sCol = new Float32Array(nPuffs * 3);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const smoke = mark(new THREE.Points(sGeo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, size: 1.9, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, fog: true })));
  smoke.name = 'snowville:smoke';
  smoke.frustumCulled = false;
  scene.add(smoke);

  // the journal subjects, one entry for each kind (the walk awards once a kind a walk)
  const spottable = [
    { type: 'sw1', label: phrase('snowville.life.otter'), pos: new THREE.Vector3(), range: RANGES.sw1 },
    { type: 'sw2', label: phrase('snowville.life.robin'), pos: new THREE.Vector3(), range: RANGES.sw2 },
    { type: 'sw3', label: phrase('snowville.life.fox'), pos: new THREE.Vector3(FOX.x, P.snowY(FOX.x, FOX.z) + 0.2, FOX.z), range: RANGES.sw3 },
  ];
  const pose = {}; const spuff = {};
  const cA = new THREE.Color(0xd8c6bc); const cB = new THREE.Color(P.SNOW_LOOK.horizon); const cTmp = new THREE.Color(); const cBlue = new THREE.Color(0xa8b8e8); // (beauty pass 2: the smoke starts a warm grey, the hearth's glow in it, and thins into the haze)

  fox.position.set(FOX.x, P.snowY(FOX.x, FOX.z) - 0.02, FOX.z); fox.rotation.y = FOX.yaw;
  hare.position.set(HARE.x, P.snowY(HARE.x, HARE.z), HARE.z); hare.rotation.y = HARE.yaw;

  function draw(t) {
    for (let i = 0; i < otters.length; i++) {
      otterPose(i, t, pose);
      otters[i].position.set(pose.x, pose.y, pose.z); otters[i].rotation.set(0, pose.yaw, pose.lean);
    }
    spottable[0].pos.set(otters[0].position.x, otters[0].position.y + 0.2, otters[0].position.z);
    const up = reducedMotion ? 1 : harePeek(t);
    hare.visible = up > 0.02;
    hare.position.y = P.snowY(HARE.x, HARE.z) - 0.5 * (1 - up);
    hare.rotation.x = reducedMotion ? 0 : 0.12 * Math.sin(t * 2.1) * up;
    robinPose(t, pose);
    robin.position.set(pose.x, pose.y, pose.z); robin.rotation.y = pose.yaw;
    robin.rotation.x = pose.flying ? -0.3 : 0;
    spottable[1].pos.set(pose.x, pose.y, pose.z);
    fox.scale.y = 1 + (reducedMotion ? 0 : 0.04 * Math.sin(t * 1.4)); // she breathes
    let n = 0;
    for (let c = 0; c < CHIMNEYS.length; c++) {
      for (let j = 0; j < N.puffs; j++) {
        puffAt(c, j, t, spuff);
        { const lean = smokeLean(spuff.u, gustAt(t)); spuff.x += lean; spuff.z += lean * SHARED.wz / SHARED.wx; } // beauty pass 3: the smoke leans with the wind (pass 5: the flakes' own direction)
        sPos[n * 3] = spuff.x; sPos[n * 3 + 1] = spuff.y; sPos[n * 3 + 2] = spuff.z;
        cTmp.copy(cA).lerp(cB, Math.min(1, spuff.u * 1.15)).lerp(cBlue, 0.45 * (1 - SHARED.hour)); // (pass 5: bluer in the blue hour)
        sCol[n * 3] = cTmp.r; sCol[n * 3 + 1] = cTmp.g; sCol[n * 3 + 2] = cTmp.b;
        n++;
      }
    }
    sGeo.attributes.position.needsUpdate = true; sGeo.attributes.color.needsUpdate = true;
  }
  draw(0);

  let nextBell = BELL_GAP.first; let bells = 0; let steps = 0; let walked = 0; let lx = 0; let lz = 0; let have = false;
  return {
    rung,
    spottable,
    counts: { rung, ...N, meshes: otters.length + 4 },
    update(dt, t, catPos) {
      const d = dt > 0 ? Math.min(dt, 1) : 0;
      if (!reducedMotion) draw(t);
      if (t >= nextBell) { bellNote(audio, bells); bells++; nextBell = t + BELL_GAP.min + BELL_GAP.span * hash01(bells, 32); } // (the schedule runs on while muted: no catching up)
      if (catPos && d > 0) {
        const moved = have ? Math.hypot(catPos.x - lx, catPos.z - lz) : 0;
        lx = catPos.x; lz = catPos.z; have = true;
        if (moved < 3) { // a jump of more than a few metres is a hop through a door, not a stride
          walked += moved;
          if (walked >= STEP_METRES) { walked -= STEP_METRES; crunchNote(audio, steps++); }
        } else walked = 0;
      }
    },
    dispose() {
      scene.remove(...otters, hare, robin, fox, smoke);
      for (const g of Object.values(geos)) g.dispose();
      lit.dispose(); sGeo.dispose(); smoke.material.dispose();
    },
  };
}
