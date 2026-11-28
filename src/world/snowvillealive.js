// =============================================================================
// SNOWVILLE: THE VILLAGE REACTS TO HER (beauty pass 3). Net zero triangles: no mesh at all, ONE Points ("snowville:trail", one draw) with a size of its own for every point, holding
//   * FOOTPRINTS: a ring buffer of paw dots pressed into the snow behind her (left and right of her line), darkest when new and filling back to the snow's own colour over TRAIL.life seconds;
//   * PUFFS: snow kicked up by her paws when she trots or runs, snow shaken off a fir's boughs when she brushes by (and a soft whump), and her breath in the cold air;
//   * a SHOOTING STAR now and then, a streak with a short tail across the high sky in front of her.
// Beside it, small pure helpers the light and the smoke use: the snowfall's waxing and waning (waveAt), the twinkle that chases along the strings of lights (chase), the window glow that wakes as she
// nears (glowNear), the wind's lean on the chimney smoke, and the places she brushes past (firs, doors) for the jingle. A pure function of the walk's time and her path: no Math.random, no clock.
// Reduced motion: nothing here is made (no points, no streak); the lite rungs keep half the dots and no breath or star. Muted: the sounds ask for no audio context. Never touches colliders or perches.
// =============================================================================

import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import { dotTexture } from './snowvilleparts.js';
import { toDoors } from './snowvillebeauty.js';
import { sleighBells, snowWhump } from './snowvillesound.js';

const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((s | 0) + 0x1b873593, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

export const TRAIL = Object.freeze({ feet: 44, puffs: 30, stride: 0.6, life: 28, kick: 2.4, run: 4.6, size: 0.65, puffSize: 0.62 });
export const STAR = Object.freeze({ first: 22, min: 38, span: 40, dur: 1.1, tail: 6 });
export const BREATH_GAP = 2.6;

// Snowfall that waxes and wanes in slow waves: how much of the flake ring is showing, 0.5 .. 1. Pure.
export const waveAt = (t) => 0.75 + 0.25 * Math.sin(t * 0.11) * Math.sin(t * 0.047 + 0.8) + 0.08 * Math.sin(t * 0.31);
// A twinkle that runs along a string of lights: bulb `i` of the list is brightened as a crest passes (1 .. 1 + amp). Pure.
export const chase = (i, t, amp = 0.9) => 1 + amp * Math.pow(Math.max(0, Math.sin(t * 2.6 - i * 0.55)), 8);
// The windows and lamps wake up as she comes near: a boost 1 .. 1 + max over the last `r` metres. Pure.
export const glowNear = (d, r = 9, max = 0.9) => 1 + max * Math.pow(Math.max(0, 1 - d / r), 1.5);
// Chimney smoke leans with the wind: an extra drift east along its rise `u` (0 .. 1) in a gust g (0 .. 1). Pure.
// The village's shared look (beauty pass 5, snowvilleliving.js writes it each frame): ONE wind (east, a little south: the flakes, the smoke and the sound lean the same way), the warm lights' breath and the hour (1 gold .. 0 blue).
export const SHARED = { wx: 0.94, wz: 0.33, breath: 1, hour: 1, hear: -99, heed: -99 }; // (pass 8: when she last meowed, and when she last settled to stand still: the creatures look up and turn)
export const smokeLean = (u, g) => u * u * (0.5 + 2.6 * g);
// A footprint's colour: a blue shadow pressed in the snow at age 0, back to the snow at age 1 (hex-free, rgb 0..1). Pure.
const FOOT_NEW = [0.2, 0.3, 0.58]; const SNOW = [0.89, 0.92, 0.96];
export function footTint(age, out = [0, 0, 0]) { const k = Math.max(0, Math.min(1, age)); const e = k * k; for (let c = 0; c < 3; c++) out[c] = FOOT_NEW[c] + (SNOW[c] - FOOT_NEW[c]) * e; return out; }

// The things she can brush past: fir trunks (with their reach) and the cottage doors (with their wreaths). Pure and cached.
let _brush = null;
export function brushSpots() {
  if (_brush) return _brush;
  const firs = P.scatterFirs().filter((k) => !k.rim).map((k) => ({ x: k.x, z: k.z, r: 1.15 * k.s + 0.7, h: 4.5 * k.s }));
  _brush = { firs, doors: toDoors() };
  return _brush;
}

// The shooting star's place at u (0 .. 1) of its run, for the camera's right/forward unit vectors on the ground: a streak well up the sky in front, ahead of the fog (it shows when she tilts the camera up or looks past the rooftops). Pure.
export function starAt(k, u, cx, cy, cz, fx, fz, out = { x: 0, y: 0, z: 0 }) {
  const side = hash(k, 91) < 0.5 ? -1 : 1; const fwd = 90; const lat = 30 * (hash(k, 92) - 0.5);
  const rx = -fz; const rz = fx; // right-hand side
  out.x = cx + fx * fwd + rx * (lat + side * (-30 + 60 * u)); out.z = cz + fz * fwd + rz * (lat + side * (-30 + 60 * u));
  out.y = cy + 20 + 14 * hash(k, 93) - 12 * u; return out; // 10 to 22 degrees up: seen when she looks up or zooms out
}

export function createAlive({ scene, tier = null, reducedMotion = false, audio = null, low = false }) {
  if (reducedMotion) return { update() {}, dispose() {}, active: false, state: null };
  const nFeet = low ? TRAIL.feet >> 1 : TRAIL.feet;
  const nPuffs = low ? TRAIL.puffs >> 1 : TRAIL.puffs;
  const nStar = low ? 0 : STAR.tail;
  const N = nFeet + nPuffs + nStar;
  const pos = new Float32Array(N * 3); const col = new Float32Array(N * 3); const scl = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aS', new THREE.BufferAttribute(scl, 1));
  const kind = new Float32Array(N); for (let i = 0; i < N; i++) kind[i] = i < nFeet ? 1 : i < nFeet + nPuffs ? 0 : 2; // 1 a paw, 0 a puff, 2 the streak
  geo.setAttribute('aK', new THREE.BufferAttribute(kind, 1));
  const mat = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.04, size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, fog: false });
  mat.onBeforeCompile = (sh) => { // a size of its own for every point (the feet small, the puffs big, the streak's tail tapering), and the feet drawn as a crisp paw (pad and four toes) instead of a soft dot
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aS;\nattribute float aK;\nvarying float vK;\nvoid main() {\nvK = aK;').replace('gl_PointSize = size;', 'gl_PointSize = size * aS;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying float vK;\nfloat blob(vec2 q, vec2 c, vec2 r) { return 1.0 - smoothstep(0.78, 1.0, length((q - c) / r)); }\nvoid main() {')
      .replace('#include <map_particle_fragment>', `#include <map_particle_fragment>
      if (vK > 0.5 && vK < 1.5) { vec2 q = gl_PointCoord - 0.5; float a = blob(q, vec2(0.0, 0.12), vec2(0.23, 0.19)); a = max(a, blob(q, vec2(-0.2, -0.1), vec2(0.075, 0.1))); a = max(a, blob(q, vec2(-0.07, -0.22), vec2(0.075, 0.1))); a = max(a, blob(q, vec2(0.07, -0.22), vec2(0.075, 0.1))); a = max(a, blob(q, vec2(0.2, -0.1), vec2(0.075, 0.1))); diffuseColor.a = opacity * a; }`);
  };
  const pts = new THREE.Points(geo, mat);
  pts.name = 'snowville:trail'; pts.frustumCulled = false; pts.renderOrder = 2;
  Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(pts);

  const feet = Array.from({ length: nFeet }, () => ({ t0: -1e9 })); let nextFoot = 0; let side = 1;
  const puffs = Array.from({ length: nPuffs }, () => ({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, a: 0, life: 1, s0: 0.5, breath: false })); let nextPuff = 0;
  const st = { feet: 0, puffs: 0, shaken: 0, jingles: 0, stars: 0, walked: 0, lx: 0, lz: 0, have: false, speed: 0, nextBreath: 2, nextStar: STAR.first, starT: -1, starK: 0, cool: new Map() };
  const tint = [0, 0, 0]; const sp = { x: 0, y: 0, z: 0 };
  const brush = brushSpots();

  const spawnPuff = (x, y, z, vx, vy, vz, life, s0, breath = false) => {
    const p = puffs[nextPuff]; nextPuff = (nextPuff + 1) % nPuffs;
    p.live = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.a = 0; p.life = life; p.s0 = s0; p.breath = breath; st.puffs++;
  };
  const ready = (key, t, gap) => { const c = st.cool.get(key) ?? -1e9; if (t - c < gap) return false; st.cool.set(key, t); return true; };

  function update(dt, t, catPos, camera, session) {
    const d = dt > 0 ? Math.min(dt, 0.1) : 0;
    if (catPos && d > 0) {
      const dx = catPos.x - st.lx; const dz = catPos.z - st.lz; const moved = st.have ? Math.hypot(dx, dz) : 0;
      st.lx = catPos.x; st.lz = catPos.z;
      if (!st.have || moved > 3) { st.have = true; st.walked = 0; st.speed = 0; } // a hop through a door is not a stride
      else {
        st.speed += (moved / d - st.speed) * Math.min(1, d * 6);
        const grounded = !session?.perched && (catPos.y - P.snowY(catPos.x, catPos.z)) < 0.6;
        if (grounded) {
          st.walked += moved;
          while (st.walked >= TRAIL.stride) { // a paw down
            st.walked -= TRAIL.stride; side = -side;
            const hx = dx / (moved || 1); const hz = dz / (moved || 1);
            const fx = catPos.x - hx * 0.25 - hz * side * 0.17; const fz = catPos.z - hz * 0.25 + hx * side * 0.17;
            const f = feet[nextFoot]; nextFoot = (nextFoot + 1) % nFeet; f.t0 = t; f.x = fx; f.z = fz; f.y = P.snowY(fx, fz) + 0.13; st.feet++;
            if (st.speed > TRAIL.kick) { // snow flicked up behind the paw
              const n = st.speed > TRAIL.run ? 2 : 1;
              for (let k = 0; k < n; k++) spawnPuff(fx, f.y + 0.05, fz, -hx * (0.6 + 0.5 * k) + 0.25 * (hash(st.feet * 3 + k, 1) - 0.5), 0.9 + 0.6 * k, -hz * (0.6 + 0.5 * k) + 0.25 * (hash(st.feet * 3 + k, 2) - 0.5), 0.7, TRAIL.puffSize * (st.speed > TRAIL.run ? 1 : 0.7));
            }
          }
        }
      }
      // brushing past a fir: the boughs let go of their snow (once a few seconds), with a soft whump
      for (let i = 0; i < brush.firs.length; i++) {
        const f = brush.firs[i]; const dd = Math.hypot(catPos.x - f.x, catPos.z - f.z);
        if (dd < f.r && st.speed > 0.8 && ready('f' + i, t, 7)) {
          st.shaken++;
          for (let k = 0; k < 7; k++) { const a = hash(i * 8 + k, 5) * 6.28; spawnPuff(f.x + Math.cos(a) * f.r * 0.6, P.snowY(f.x, f.z) + f.h * (0.35 + 0.4 * hash(i * 8 + k, 6)), f.z + Math.sin(a) * f.r * 0.6, Math.cos(a) * 0.25, -0.5 - 0.5 * hash(i * 8 + k, 7), Math.sin(a) * 0.25, 1.9, 0.9 + 0.5 * hash(i * 8 + k, 8)); }
          snowWhump(audio, st.shaken);
        }
      }
      // passing a door: the wreath's bells
      for (let i = 0; i < brush.doors.length; i++) {
        const dr = brush.doors[i];
        if (Math.hypot(catPos.x - dr.x, catPos.z - dr.z) < 1.5 && ready('d' + i, t, 14)) { st.jingles++; sleighBells(audio, 40 + i, 0.5); }
      }
      // her breath: a pale puff in front of her face now and then once she is cold or standing out in the cold
      const r = session?.cat?.rotation?.y ?? 0;
      if (!low && t >= st.nextBreath && st.speed < 1.2) {
        st.nextBreath = t + BREATH_GAP;
        spawnPuff(catPos.x - Math.sin(r) * 0.42, catPos.y + 0.5, catPos.z - Math.cos(r) * 0.42, -Math.sin(r) * 0.18, 0.2, -Math.cos(r) * 0.18, 1.5, 0.3, true);
      }
    }
    // the shooting star: a streak across the high sky in front of the camera, now and then
    if (!low && camera) {
      if (st.starT < 0 && t >= st.nextStar) { st.starT = t; st.starK = st.stars++; st.nextStar = t + STAR.min + STAR.span * hash(st.stars, 94); }
      if (st.starT >= 0 && t - st.starT > STAR.dur + 0.5) st.starT = -1;
    }
    // write the points
    const A = TRAIL;
    for (let i = 0; i < nFeet; i++) {
      const f = feet[i]; const age = (t - f.t0) / A.life; const o = i * 3;
      if (age < 0 || age >= 1) { scl[i] = 0; continue; }
      footTint(age, tint); col[o] = tint[0]; col[o + 1] = tint[1]; col[o + 2] = tint[2];
      pos[o] = f.x; pos[o + 1] = f.y; pos[o + 2] = f.z; scl[i] = A.size * (1 - 0.35 * age);
    }
    for (let j = 0; j < nPuffs; j++) {
      const p = puffs[j]; const i = nFeet + j; const o = i * 3;
      if (p.live) { p.a += d / p.life; p.x += p.vx * d; p.z += p.vz * d; p.y += p.vy * d; p.vy -= (p.breath ? -0.05 : 1.6) * d; p.vx *= 0.97; p.vz *= 0.97; if (p.a >= 1) p.live = false; }
      if (!p.live) { scl[i] = 0; continue; }
      const e = p.a; const fade = e < 0.15 ? e / 0.15 : 1 - (e - 0.15) / 0.85;
      pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
      const w = p.breath ? 0.97 : 1; col[o] = w; col[o + 1] = w; col[o + 2] = 1;
      scl[i] = p.s0 * (0.55 + 0.9 * e) * Math.max(0, fade) * (p.breath ? 0.8 : 1);
    }
    if (nStar && camera) {
      const live = st.starT >= 0 && t - st.starT <= STAR.dur;
      const fwd = camera.getWorldDirection?.(_fw) ?? _fw; const fl = Math.hypot(fwd.x, fwd.z) || 1;
      for (let k = 0; k < nStar; k++) {
        const i = nFeet + nPuffs + k; const o = i * 3;
        if (!live) { scl[i] = 0; continue; }
        const u = Math.max(0, Math.min(1, (t - st.starT) / STAR.dur - k * 0.035));
        starAt(st.starK, u, camera.position.x, camera.position.y, camera.position.z, fwd.x / fl, fwd.z / fl, sp);
        pos[o] = sp.x; pos[o + 1] = sp.y; pos[o + 2] = sp.z;
        const fade = Math.sin(Math.PI * Math.min(1, (t - st.starT) / STAR.dur));
        col[o] = 3; col[o + 1] = 2.6; col[o + 2] = 1.6; // (past 1: the tone mapping and the bloom make it a bright gold-white spark even on the pale sky)
        scl[i] = (k === 0 ? 6.5 : 4.6 * (1 - k / nStar)) * fade;
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.aS.needsUpdate = true;
  }
  const _fw = new THREE.Vector3();
  return {
    points: pts, state: st, arrays: { pos, col, scl, nFeet }, active: true, update,
    dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); },
  };
}
