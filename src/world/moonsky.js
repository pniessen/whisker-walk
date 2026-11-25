// =============================================================================
// THE MOON: THE SKY (milestone 1). A black sky of stars (one Points: 700, 350 on the lite rung), and Earth: one big
// camera-facing quad about 8 degrees across, 21 degrees up, 12 degrees east of north, with a day and a night side (a
// few city lights on the night side), and a faint cloud disc over it that drifts slowly. The whole dress belongs to
// the Moon's own chunk (the Rooftops' way): the shared sky code only learned nothing. All of it hangs on the camera,
// so Earth stands still over the ridge as she walks. No random number (a seeded stream), no real light.
// =============================================================================

import * as THREE from 'three';
import { drawStampLights } from './moonstamps.js';
import { mulberry32 } from '../rng.js';
import { STARS, EARTH } from './moonplan.js';

const DEG = Math.PI / 180;

// A 256 px Earth: blue sea, green land, white swirls, a thin blue rim. The sun is the game's own low sun, in the
// north-west, so the lit side is the left one; the right side falls into night, with a few warm city lights.
// Earth drawn on a square canvas of any size (the sky's quad is 256 px; the binoculars draw it bigger). Returns the 2D context or null.
export function paintEarth(canvas) {
  const g = canvas.getContext?.('2d');
  if (!g) return null;
  const S = canvas.width;
  const cx = S / 2;
  const R = S * 0.46;
  const rng = mulberry32(0xea47);
  g.save();
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.clip();
  // (beauty round 2) the ocean: deep blue, a paler shallow shelf toward the sunlit limb
  const sea = g.createRadialGradient(cx - R * 0.4, cx - R * 0.25, R * 0.05, cx, cx, R * 1.05);
  sea.addColorStop(0, '#5aa8ec');
  sea.addColorStop(0.55, '#255fb4');
  sea.addColorStop(1, '#0f2f78');
  g.fillStyle = sea;
  g.fillRect(0, 0, S, S);
  // continents: a few broken blobs (circles jittered by the seeded stream), green with a tan desert, a brown spine and a pale coast
  const blob = (x, y, rx, ry, n, fill) => {
    g.fillStyle = fill;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng());
      g.beginPath();
      g.arc(cx + (x + Math.cos(a) * rx * d) * R, cx + (y + Math.sin(a) * ry * d) * R, R * (0.05 + 0.07 * rng()), 0, Math.PI * 2);
      g.fill();
    }
  };
  const continent = (x, y, rx, ry, desert) => {
    blob(x, y, rx * 1.08, ry * 1.08, 26, 'rgba(150,205,150,.55)'); // the pale coast
    blob(x, y, rx, ry, 26, '#3f8a4c');
    blob(x - rx * 0.1, y + ry * 0.1, rx * 0.7, ry * 0.65, 12, desert ? '#c8b36a' : '#5da24f');
    blob(x + rx * 0.2, y - ry * 0.2, rx * 0.35, ry * 0.4, 7, '#7a6a48');
  };
  continent(-0.36, -0.12, 0.2, 0.5, true); // an Africa and a Europe
  continent(-0.2, -0.55, 0.28, 0.1, false);
  continent(0.38, 0.18, 0.16, 0.36, false); // the Americas swing in on the night side
  continent(-0.04, 0.5, 0.1, 0.16, false);
  continent(0.26, -0.4, 0.2, 0.12, true);
  // the ice caps
  g.fillStyle = 'rgba(245,250,255,.92)';
  g.beginPath();
  g.ellipse(cx, cx - R * 0.98, R * 0.42, R * 0.17, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(cx, cx + R * 1.0, R * 0.36, R * 0.13, 0, 0, Math.PI * 2);
  g.fill();
  // clouds: soft banded swirls (a storm curl and a belt across the middle), white with a little blue at the edge
  for (let i = 0; i < 46; i++) {
    const belt = i < 18;
    const y = belt ? (rng() - 0.5) * 0.28 : (rng() - 0.5) * 1.7;
    const x = (rng() - 0.5) * 1.8;
    const w = R * (0.12 + 0.2 * rng());
    const q = g.createRadialGradient(cx + x * R, cx + y * R, 0, cx + x * R, cx + y * R, w);
    q.addColorStop(0, 'rgba(255,255,255,.62)');
    q.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.translate(cx + x * R, cx + y * R);
    g.rotate(belt ? 0.12 : (rng() - 0.5) * 1.2);
    g.scale(2.1, 0.55);
    g.translate(-(cx + x * R), -(cx + y * R));
    g.fillStyle = q;
    g.beginPath();
    g.arc(cx + x * R, cx + y * R, w, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // the sun's glint on the sea (a pale smear on the lit side)
  const glint = g.createRadialGradient(cx - R * 0.42, cx - R * 0.18, 0, cx - R * 0.42, cx - R * 0.18, R * 0.3);
  glint.addColorStop(0, 'rgba(255,255,255,.4)');
  glint.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glint;
  g.fillRect(0, 0, S, S);
  // limb darkening (a ball, not a disc) and the night: the sun is on the left, so the right side falls into a soft terminator
  const ball = g.createRadialGradient(cx - R * 0.3, cx - R * 0.15, R * 0.35, cx, cx, R);
  ball.addColorStop(0, 'rgba(0,10,40,0)');
  ball.addColorStop(1, 'rgba(0,10,40,.42)');
  g.fillStyle = ball;
  g.fillRect(0, 0, S, S);
  const shade = g.createLinearGradient(cx - R * 0.5, 0, cx + R, 0);
  shade.addColorStop(0, 'rgba(2,6,22,0)');
  shade.addColorStop(0.45, 'rgba(2,6,22,.5)');
  shade.addColorStop(0.75, 'rgba(2,6,22,.86)');
  shade.addColorStop(1, 'rgba(2,6,22,.95)');
  g.fillStyle = shade;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffe9a8';
  for (const [x, y] of [[0.62, -0.1], [0.55, 0], [0.5, 0.12], [0.7, 0.2], [0.45, -0.25], [0.6, -0.3], [0.38, 0.05], [0.66, 0.35]]) {
    g.beginPath();
    g.arc(cx + x * R, cx + y * R, 1.4 * (S / 256), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // the atmosphere: a bright thin blue rim on the lit side that thins to a faint one on the night side (two strokes, a wide faint one and a thin bright one)
  const rim = g.createLinearGradient(cx - R, 0, cx + R, 0);
  rim.addColorStop(0, 'rgba(160,215,255,1)');
  rim.addColorStop(0.55, 'rgba(120,180,255,.55)');
  rim.addColorStop(1, 'rgba(90,140,230,.18)');
  g.strokeStyle = rim;
  g.globalAlpha = 0.32;
  g.lineWidth = R * 0.12;
  g.beginPath();
  g.arc(cx, cx, R * 1.01, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 0.85;
  g.lineWidth = R * 0.035;
  g.beginPath();
  g.arc(cx, cx, R * 0.995, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  return g;
}

// The reply: her stamp drawn in lights on Earth's night side (the right side: the sun is on the left), `level` 0..1 bright. Drawn over paintEarth's picture.
export const NIGHT_AT = Object.freeze({ x: 0.52, y: -0.04, size: 0.4 }); // in Earth radii from its middle
export function paintReplyLights(canvas, stamp, level) {
  const g = canvas.getContext?.('2d');
  if (!g || !(level > 0) || !drawStampLights) return;
  const S = canvas.width;
  const R = S * 0.46;
  drawStampLights(g, stamp, S / 2 + NIGHT_AT.x * R, S / 2 + NIGHT_AT.y * R, NIGHT_AT.size * R, level);
}

function earthTexture() {
  if (typeof document === 'undefined') return null;
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  if (!paintEarth(canvas)) return null;
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.canvas = canvas;
  return t;
}

// A tileable strip of soft white swirls for the cloud disc (it scrolls sideways over Earth).
function cloudTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext?.('2d');
  if (!g) return null;
  // (beauty round 2) soft banks of cloud, not rings: radial puffs, tiled across the seam so the strip loops
  const rng = mulberry32(0xc10d);
  for (let i = 0; i < 26; i++) {
    const x = rng() * 256;
    const y = 10 + rng() * 108;
    const w = 14 + rng() * 26;
    for (const dx of [-256, 0, 256]) {
      const q = g.createRadialGradient(x + dx, y, 0, x + dx, y, w);
      q.addColorStop(0, 'rgba(255,255,255,.8)');
      q.addColorStop(1, 'rgba(255,255,255,0)');
      g.save();
      g.translate(x + dx, y);
      g.scale(2.0, 0.6);
      g.translate(-(x + dx), -y);
      g.fillStyle = q;
      g.beginPath();
      g.arc(x + dx, y, w, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Where the stars stand: unit directions crowded low (where the camera looks), a seeded stream, a few brighter ones. (Beauty round 1) A third of them
// lie along a faint Milky Way, a band tilted 55 degrees across the sky, dimmer and crowded; the rest are many dim stars and a few bright ones.
export function starField(count) {
  const rng = mulberry32(0x57a2f1);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const phi = 55 * DEG;
  for (let i = 0; i < count; i++) {
    let x; let y; let z; let band = false;
    if (i % 3 === 0) { // the Milky Way: a great circle, thickened
      const t = rng() * Math.PI * 2;
      const off = (rng() + rng() + rng() - 1.5) * 0.16;
      x = Math.cos(t);
      y = Math.sin(t) * Math.cos(phi) + off;
      z = Math.sin(t) * Math.sin(phi) + (rng() - 0.5) * 0.2;
      const n = Math.hypot(x, y, z);
      x /= n; y /= n; z /= n;
      band = y > 0.04;
    }
    if (!band) {
      const el = (3 + 78 * rng() ** 1.5) * DEG;
      const az = rng() * Math.PI * 2;
      x = Math.cos(az) * Math.cos(el); y = Math.sin(el); z = Math.sin(az) * Math.cos(el);
    }
    pos[i * 3] = x * STARS.radius;
    pos[i * 3 + 1] = y * STARS.radius;
    pos[i * 3 + 2] = z * STARS.radius;
    const b = band ? 0.22 + 0.3 * rng() : rng() < 0.05 ? 1 : 0.3 + 0.55 * rng() ** 1.6;
    const warm = !band && rng() < 0.12;
    col[i * 3] = b * (warm ? 1 : 0.88);
    col[i * 3 + 1] = b * (warm ? 0.9 : 0.93);
    col[i * 3 + 2] = b * (warm ? 0.75 : 1);
  }
  return { pos, col };
}

// Earth's direction from the camera: 21 degrees up, 12 degrees east of north (north is -z, east is +x).
export const earthDirection = new THREE.Vector3(
  Math.sin(EARTH.bearingDeg * DEG) * Math.cos(EARTH.elevDeg * DEG),
  Math.sin(EARTH.elevDeg * DEG),
  -Math.cos(EARTH.bearingDeg * DEG) * Math.cos(EARTH.elevDeg * DEG),
);

function skyFlags(o, order) {
  o.castShadow = false;
  o.receiveShadow = false;
  o.frustumCulled = false; // centred on the camera by construction
  o.renderOrder = order;
  Object.assign(o.userData, { noCast: true, noMerge: true, noContactShadow: true, clouds: true });
}

// The sun's two points: where it lies in the sky (the game's fixed sun, render/rig.js SUN_POSITION: -36, 15, -24) at the stars' distance, a hot white disc
// and a wide warm glare. aSize multiplies the star size (2.2 px): 1 for a star, ~14 for the disc, ~56 for the glare.
export const SUN_SKY = Object.freeze({ dir: Object.freeze([-36 / 45.1, 15 / 45.1, -24 / 45.1]), disc: 14, glare: 56 });
export function withSun({ pos, col }, n) {
  const p = new Float32Array((n + 2) * 3);
  const c = new Float32Array((n + 2) * 3);
  const s = new Float32Array(n + 2).fill(1);
  p.set(pos);
  c.set(col);
  const len = Math.hypot(...SUN_SKY.dir);
  for (let k = 0; k < 2; k++) for (let a = 0; a < 3; a++) p[(n + k) * 3 + a] = (SUN_SKY.dir[a] / len) * STARS.radius * 0.99;
  c.set([3, 2.9, 2.6], n * 3); // the disc: well past white, so tone mapping burns it out
  c.set([0.5, 0.42, 0.3], (n + 1) * 3);
  s[n] = SUN_SKY.disc;
  s[n + 1] = SUN_SKY.glare;
  return { pos: p, col: c, size: s };
}

// The stars' point shader: a per-point size, round points, and by size a star (a soft dot), the sun's disc (a hard edge with a short shoulder) or its glare (a wide falloff).
function pointShader(sh, uMax) {
  sh.uniforms.uMax = uMax;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aSize;\nuniform float uMax;\nvarying float vSz;')
    .replace('gl_PointSize = size;', 'gl_PointSize = min(size * aSize, uMax); vSz = aSize;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vSz;')
    .replace('#include <map_particle_fragment>', `#include <map_particle_fragment>
    float dd = length(gl_PointCoord - 0.5) * 2.0;
    float prof = vSz > 30.0 ? pow(max(1.0 - dd, 0.0), 2.6) : vSz > 5.0 ? 1.0 - smoothstep(0.5, 0.66, dd) + 0.25 * pow(max(1.0 - dd, 0.0), 2.0) : 1.0 - smoothstep(0.25, 1.0, dd);
    diffuseColor.a *= prof;`);
}

// createMoonSky({ scene, tier, reducedMotion }) -> { stars, earth, clouds, update(camera, t), dispose() }
export function createMoonSky({ scene, tier, reducedMotion = false }) {
  const lite = tier?.shadows === false; // the lite rung: half the stars and a still Earth
  const field = starField(lite ? STARS.lite : STARS.full);
  const n0 = field.pos.length / 3;
  // (beauty round 2) the sun is two more points in the same Points (no draw): a hot disc and a wide soft glare, set where the game's fixed sun lies
  const { pos, col, size } = withSun(field, n0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false, transparent: true, blending: THREE.AdditiveBlending });
  const uMax = { value: 64 };
  starMat.onBeforeCompile = (sh) => pointShader(sh, uMax);
  starMat.customProgramCacheKey = () => 'moon-stars-sun';
  const stars = new THREE.Points(geo, starMat);
  stars.name = 'moon:stars';
  let maxProbed = false;
  stars.onBeforeRender = (renderer) => { // device pixels: follow the live ratio; the point size the card allows is read once
    starMat.size = 2.2 * renderer.getPixelRatio();
    if (!maxProbed) {
      maxProbed = true;
      try { const gl = renderer.getContext(); const r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE); if (r && r[1] > 1) uMax.value = r[1]; } catch { /* keep 64 */ }
    }
  };
  skyFlags(stars, -2);
  scene.add(stars);

  const map = earthTexture();
  let earth = null;
  let clouds = null;
  let cloudMap = null;
  if (map) {
    earth = new THREE.Mesh(new THREE.PlaneGeometry(EARTH.size, EARTH.size), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    earth.name = 'moon:earth';
    skyFlags(earth, -1);
    earth.frustumCulled = true; // (beauty round 2) placed on the camera each frame, but culled by the view like the glow: Earth out of the frame is a draw saved (and the clouds with it)
    scene.add(earth);
    cloudMap = cloudTexture();
    if (cloudMap) {
      clouds = new THREE.Mesh(new THREE.CircleGeometry(EARTH.size * 0.46 * 0.96, 28), new THREE.MeshBasicMaterial({ map: cloudMap, transparent: true, opacity: 0.35, depthWrite: false, fog: false, toneMapped: false }));
      clouds.name = 'moon:clouds';
      skyFlags(clouds, 0);
      clouds.frustumCulled = true;
      scene.add(clouds);
    }
  }

  // (milestone 6) Earth's answer: her stamp in lights on the night side, drawn again over Earth's own picture when its level changes
  let replyLevel = 0;
  let replyStamp = -1;
  function setReply(stamp, level) {
    const canvas = map?.userData?.canvas;
    if (!canvas) return;
    const lv = Math.round(Math.max(0, Math.min(1, level)) * 20) / 20; // a step of 5 percent: the canvas is redrawn only when this changes
    if (lv === replyLevel && stamp === replyStamp) return;
    replyLevel = lv;
    replyStamp = stamp;
    paintEarth(canvas);
    paintReplyLights(canvas, stamp, lv);
    map.needsUpdate = true;
  }

  // (milestone 8) the Deep Cell's finale: a soft additive halo round Earth (made the first time it is asked for, so a walk that never plugs the Deep Cell has none and pays no draw)
  let halo = null;
  let haloLevel = 0;
  function setShimmer(level) {
    const lv = Math.max(0, Math.min(1, level));
    haloLevel = lv;
    if (!earth) return;
    if (!halo && lv > 0) {
      const R0 = EARTH.size * 0.46;
      const R1 = R0 * 1.9;
      const seg = 40;
      const pos = [];
      const col = [];
      const at = (a, r, f) => { pos.push(Math.cos(a) * r, Math.sin(a) * r, 0); col.push(0.55 * f, 0.85 * f, 1 * f); };
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        at(a0, R0 * 0.97, 0.9); at(a0, R1, 0); at(a1, R1, 0);
        at(a0, R0 * 0.97, 0.9); at(a1, R1, 0); at(a1, R0 * 0.97, 0.9);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      halo = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true, opacity: 0 }));
      halo.name = 'moon:earthglow';
      skyFlags(halo, -2);
      g.computeBoundingSphere();
      halo.frustumCulled = true; // unlike the stars and Earth it is not centred on the camera: drawn only when Earth is in view (a draw saved on the Moon's heaviest frames)
      scene.add(halo);
    }
    if (halo) { halo.material.opacity = lv; halo.visible = lv > 0.001; }
  }

  return {
    stars, earth, clouds, setReply, setShimmer,
    get halo() { return halo; },
    get shimmer() { return haloLevel; },
    update(camera, t = 0) {
      stars.position.copy(camera.position);
      if (earth) {
        earth.position.copy(camera.position).addScaledVector(earthDirection, EARTH.radius);
        earth.quaternion.copy(camera.quaternion);
        if (halo) {
          halo.position.copy(earth.position).addScaledVector(earthDirection, 0.5);
          halo.quaternion.copy(camera.quaternion);
        }
        if (clouds) {
          clouds.position.copy(earth.position).addScaledVector(earthDirection, -1);
          clouds.quaternion.copy(camera.quaternion);
          if (!reducedMotion && !lite) cloudMap.offset.x = (t * 0.004) % 1;
        }
      }
    },
    dispose() {
      for (const o of [stars, earth, clouds, halo]) {
        if (!o) continue;
        scene.remove(o);
        o.geometry.dispose();
        o.material.dispose();
      }
      map?.dispose();
      cloudMap?.dispose();
    },
  };
}
