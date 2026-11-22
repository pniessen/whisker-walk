import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import { SUN_POSITION } from '../render/rig.js';

// =============================================================================
// THE ROOFTOPS' NIGHT SKY (beauty round 1). All of it is made by chunk code
// and adds no mesh and no pass: roofslife.js hands it the walk's evening
// (0 sunset .. 1 dusk) and it dresses what render/ already put in the scene.
//   * skyTexture(): the background, a 512x256 equirect canvas in place of
//     render/sky.js's 8x256 ramp. Its colours climb over 70 degrees, not
//     7 (no navy slab, no band edge), with the sun's warm lobe, a rose city-
//     light haze low down in a few patches and a milky band of denser stars (the stars' own). Its
//     horizon row is exactly the fog's colour. Rebuilt on roofslife's six
//     steps, null headless (then the life uses sky.js as before).
//   * the stars (render/nightsky.js's one Points): given a richer geometry
//     (more stars, four sizes, warm and cool tints, a few glints) and its own
//     shader, which also draws a shooting star now and then from seven of the
//     same points, and brightens the field as the evening deepens. Still one
//     draw call.
//   * the moon (its one quad): a bigger, fuller disc with a halo, a little
//     higher, drawn from a canvas made here.
//   * the clouds (their one InstancedMesh): re-lit every frame in onBeforeRender
//     (after render/clouds.js has set its palette): warm bellies lit by the
//     town, cool dim backs.
// Nothing here allocates per frame; no random stream outside its own.
// =============================================================================

const W = 512;
const H = 256;
const DEG = Math.PI / 180;

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const yOf = (el) => (H * (0.5 - el / 180)); // canvas row of an elevation (degrees)

// The sun's azimuth as an equirect column (three's equirectUv: atan(z, x) / 2pi + 0.5).
const SUN_U = Math.atan2(SUN_POSITION[2], SUN_POSITION[0]) / (2 * Math.PI) + 0.5;

// The background for a (top, horizon) pair at evening `e`; null where there is no canvas.
export function roofsSkyTexture(top, horizon, e = 1) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const t = rgb(top);
  const h = rgb(horizon);
  const zen = mix(t, [8, 10, 30], 0.35);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const stop = (el, c) => g.addColorStop(Math.min(1, Math.max(0, yOf(el) / H)), css(c));
  stop(90, zen);
  stop(62, mix(zen, t, 0.6));
  stop(40, t);
  stop(26, t);
  stop(14, mix(t, h, 0.1));
  stop(6, mix(t, h, 0.36));
  stop(2, mix(t, h, 0.8));
  stop(0, h);
  g.addColorStop(1, css(h));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // The sun's lobe and the town's haze, added onto the ramp.
  ctx.globalCompositeOperation = 'lighter';
  const warm = mix([200, 96, 40], [120, 52, 60], e);
  for (let x = 0; x < W; x += 8) {
    const u = (x + 4) / W;
    const d = Math.abs(((u - SUN_U + 1.5) % 1) - 0.5); // 0 at the sun, .5 opposite
    const lobe = Math.max(0, 1 - d / 0.3) ** 2;
    const patch = 0.5 + 0.5 * Math.sin(u * 6.283 * 4 + 0.7) * Math.sin(u * 6.283 * 7 + 2.1); // the town's lit patches
    const k = (0.2 * lobe * (1 - 0.5 * e) + 0.1 * patch * e + 0.02);
    const s = ctx.createLinearGradient(0, yOf(18), 0, yOf(-1));
    s.addColorStop(0, css(warm, 0));
    s.addColorStop(0.7, css(warm, k * 0.45));
    s.addColorStop(1, css(warm, k));
    ctx.fillStyle = s;
    ctx.fillRect(x, yOf(18), 8, yOf(-1) - yOf(18));
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.name = `roofsSky:${top}-${horizon}`;
  return tex;
}

// --- the moon ------------------------------------------------------------------
function moonTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const c = 128;
  const r = 0.22 * 256; // the disc: 0.22 of the quad
  const halo = ctx.createRadialGradient(c, c, r * 0.9, c, c, c);
  for (let k = 0; k <= 10; k++) {
    const f = k / 10;
    halo.addColorStop(f, `rgba(255,236,200,${(0.3 * (1 - f) ** 2.4).toFixed(4)})`);
  }
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 256, 256);
  // the unlit side: a faint earthshine
  ctx.fillStyle = 'rgba(120,130,170,0.16)';
  ctx.beginPath();
  ctx.arc(c, c, r, 0, 6.2832);
  ctx.fill();
  // the lit crescent: the disc less a bite toward the upper left, warm at the limb
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, 6.2832);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(0, 0, 256, 256);
  ctx.arc(c - r * 0.55, c - r * 0.3, r * 0.92, 0, 6.2832);
  ctx.clip('evenodd');
  const face = ctx.createRadialGradient(c + r * 0.5, c + r * 0.3, r * 0.1, c + r * 0.3, c + r * 0.2, r * 1.2);
  face.addColorStop(0, '#fff8e2');
  face.addColorStop(0.8, '#f4e3b8');
  face.addColorStop(1, '#dcc58f');
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, 256, 256);
  const blot = (x, y, rr, a) => {
    const b = ctx.createRadialGradient(x, y, 0, x, y, rr);
    b.addColorStop(0, `rgba(160,140,110,${a})`);
    b.addColorStop(1, 'rgba(160,140,110,0)');
    ctx.fillStyle = b;
    ctx.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
  };
  blot(c + 22, c + 8, 14, 0.5);
  blot(c + 12, c + 30, 11, 0.45);
  blot(c + 32, c - 8, 8, 0.4);
  blot(c + 28, c + 32, 7, 0.4);
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- the stars -----------------------------------------------------------------
export const STAR_N = 1100;
const TAIL = 7; // the shooting star's points
const STAR_R = 285;
const SHOOT_EVERY = 42; // walk seconds between shooting stars (the first at SHOOT_EVERY / 2)
const SHOOT_LEN = 1.1; // s

const STAR_VERT = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uVis;
uniform vec3 uS0;
uniform vec3 uSD;
uniform float uSP;
attribute float aSize;
attribute float aBright;
attribute float aPhase;
attribute vec3 aTint;
attribute float aTail;
varying float vA;
varying float vG;
varying vec3 vTint;
void main() {
  vec3 p = position;
  float a = aBright * (0.7 + 0.3 * sin(uTime * (1.2 + aPhase * 1.4) + aPhase * 6.283));
  float sz = aSize;
  if (aTail > 0.5) {
    float k = aTail - 1.0;
    float s = uSP - k * 0.028;
    p = normalize(uS0 + uSD * s) * ${STAR_R.toFixed(1)};
    float env = smoothstep(0.0, 0.12, uSP) * (1.0 - smoothstep(0.7, 1.0, uSP));
    a = (uSP > 0.0 && uSP < 1.0 && s > 0.0) ? env * (1.0 - k / ${TAIL.toFixed(1)}) : 0.0;
    sz = 3.4 - k * 0.3;
  } else {
    a *= uVis * smoothstep(0.03, 0.2, p.y / ${STAR_R.toFixed(1)});
  }
  vA = a;
  vG = smoothstep(4.0, 7.0, sz);
  vTint = aTint;
  gl_PointSize = sz * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const STAR_FRAG = /* glsl */ `
varying float vA;
varying float vG;
varying vec3 vTint;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float core = 1.0 - smoothstep(0.08, 0.5, d);
  float glint = max(0.0, 1.0 - abs(q.x) * 9.0) * max(0.0, 1.0 - abs(q.y) * 1.2) + max(0.0, 1.0 - abs(q.y) * 9.0) * max(0.0, 1.0 - abs(q.x) * 1.2);
  gl_FragColor = vec4(vTint, vA * (core + 0.5 * glint * vG));
}`;

function starGeometry() {
  const rng = mulberry32(0x7a11a5);
  const n = STAR_N + TAIL;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const bright = new Float32Array(n);
  const phase = new Float32Array(n);
  const tint = new Float32Array(n * 3);
  const tail = new Float32Array(n);
  for (let i = 0; i < STAR_N; i++) {
    let el = 2 + 78 * rng() ** 1.35;
    let az = rng() * 6.2832;
    if (i % 3 === 0) { // a third lie along a milky band: a great circle tilted 55 degrees
      const a = rng() * 6.2832;
      const spread = (rng() + rng() + rng() - 1.5) * 0.16; // radians off the band
      const bx = Math.cos(a);
      const by = Math.sin(a) * Math.cos(0.96) - spread * Math.sin(0.96) * -1;
      const bz = Math.sin(a) * Math.sin(0.96) + spread * Math.cos(0.96) * -1;
      el = Math.max(2, Math.asin(Math.min(1, Math.max(-1, bz))) / DEG);
      az = Math.atan2(by, bx) + 1.0;
    }
    const c = Math.cos(el * DEG);
    pos[i * 3] = Math.cos(az) * c * STAR_R;
    pos[i * 3 + 1] = Math.sin(el * DEG) * STAR_R;
    pos[i * 3 + 2] = Math.sin(az) * c * STAR_R;
    const m = rng(); // magnitude: many faint, few bright
    const bigOne = m > 0.992;
    const big = m > 0.95;
    size[i] = bigOne ? 8 : big ? 4.4 + rng() : 2.3 + rng() * 1.3;
    bright[i] = bigOne ? 1 : big ? 0.95 : 0.55 + 0.4 * rng();
    phase[i] = rng();
    const w = rng(); // colour: cool white, warm, a few amber and blue
    const col = w < 0.55 ? [0.86, 0.92, 1] : w < 0.8 ? [1, 0.96, 0.86] : w < 0.92 ? [1, 0.82, 0.62] : [0.7, 0.8, 1];
    tint.set(col, i * 3);
  }
  for (let k = 0; k < TAIL; k++) {
    const i = STAR_N + k;
    tail[i] = k + 1;
    tint.set([1, 0.97, 0.9], i * 3);
    pos[i * 3 + 1] = STAR_R; // overridden in the shader
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  g.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
  return g;
}

// --- the clouds' light ---------------------------------------------------------
const CLOUD = Object.freeze({
  topA: rgb(0xb88890), topB: rgb(0x40406a), // lit back: sunset, dusk
  underA: rgb(0xf08a5a), underB: rgb(0xa8607a), // belly: sunset, lit by the town
  bankK: 0.4, // a bank's belly toward the horizon colour
});

// createRoofsSkyDress() -> { skyTexture(top, horizon, e), update(dt, walk, e, camera, scene), dispose() }
export function createRoofsSkyDress({ reducedMotion = false } = {}) {
  let stars = null;
  let starMat = null;
  let starGeo = null;
  let oldStars = null;
  let moon = null;
  let moonMap = null;
  let oldMoonMap = null;
  let clouds = null;
  let tries = 0;
  let nextShoot = SHOOT_EVERY / 2;
  let shootT = -1; // seconds into the current shooting star, -1 when none
  let evening = 0;
  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const cTop = [0, 0, 0];

  function find(scene) {
    const s = scene.getObjectByName?.('stars');
    if (!s || !s.isPoints) return;
    stars = s;
    oldStars = { geometry: s.geometry, material: s.material };
    starGeo = starGeometry();
    starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uPixelRatio: { value: 1 }, uVis: { value: 0.4 },
        uS0: { value: new THREE.Vector3() }, uSD: { value: new THREE.Vector3() }, uSP: { value: -1 },
      },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
    });
    s.geometry = starGeo;
    s.material = starMat;
    s.onBeforeRender = (renderer) => { starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio(); };
    moon = scene.getObjectByName('moon') ?? null;
    if (moon?.material?.map) {
      moonMap = moonTexture();
      if (moonMap) {
        oldMoonMap = moon.material.map;
        moon.material.map = moonMap;
        moon.material.needsUpdate = true;
        moon.scale.setScalar(0.8);
        // a little higher than render/nightsky.js puts it, set after its update
        moon.onBeforeRender = (_r, _s, camera) => {
          moon.position.y = camera.position.y + 79; // 17 degrees up at the moon's distance (nightsky: 11)
          moon.updateMatrixWorld();
        };
      }
    }
    const c = scene.getObjectByName('clouds');
    if (c?.isInstancedMesh) {
      clouds = c;
      c.onBeforeRender = (renderer, _s, _cam, _g, material) => {
        const u = renderer.properties.get(material).uniforms;
        if (!u?.uTop) return;
        const e = evening;
        for (let i = 0; i < 3; i++) cTop[i] = CLOUD.topA[i] + (CLOUD.topB[i] - CLOUD.topA[i]) * e;
        u.uTop.value.setRGB(cTop[0] / 255, cTop[1] / 255, cTop[2] / 255, THREE.SRGBColorSpace);
        for (let i = 0; i < 3; i++) cTop[i] = CLOUD.underA[i] + (CLOUD.underB[i] - CLOUD.underA[i]) * e;
        u.uUnder.value.setRGB(cTop[0] / 255, cTop[1] / 255, cTop[2] / 255, THREE.SRGBColorSpace);
        u.uBankUnder.value.copy(u.uUnder.value).lerp(u.uHaze.value, CLOUD.bankK);
      };
    }
  }

  // The shooting star starts a little up and to one side of where the camera looks.
  function launch(camera, n) {
    camera.getWorldDirection(fwd);
    fwd.y = Math.max(fwd.y, 0);
    fwd.normalize();
    up.set(0, 1, 0);
    side.crossVectors(fwd, up).normalize();
    const dir = n % 2 ? 1 : -1;
    const lift = 0.3 + 0.12 * ((n * 7) % 3);
    const u = starMat.uniforms;
    u.uS0.value.copy(fwd).multiplyScalar(1).addScaledVector(up, lift).addScaledVector(side, -dir * 0.5);
    u.uSD.value.set(0, 0, 0).addScaledVector(side, dir * 0.9).addScaledVector(up, -0.2);
    shootT = 0;
  }

  let shots = 0;
  return {
    skyTexture: roofsSkyTexture,
    update(dt, walk, e, camera, scene) {
      evening = e;
      if (!starMat) {
        // top-level children, a few times a second until the clouds' rig has put them there
        if (scene?.getObjectByName && tries++ % 12 === 0) find(scene);
        if (!starMat) return;
      }
      const u = starMat.uniforms;
      u.uTime.value = reducedMotion ? 0 : walk;
      u.uVis.value = 0.45 + 0.55 * e;
      if (reducedMotion || !camera) return;
      if (shootT < 0 && walk >= nextShoot) {
        launch(camera, shots++);
        nextShoot += SHOOT_EVERY;
      }
      if (shootT >= 0) {
        shootT += dt;
        u.uSP.value = shootT / SHOOT_LEN;
        if (shootT > SHOOT_LEN + 0.3) {
          shootT = -1;
          u.uSP.value = -1;
        }
      }
    },
    dispose() {
      if (stars && oldStars) {
        stars.geometry = oldStars.geometry;
        stars.material = oldStars.material;
      }
      starGeo?.dispose();
      starMat?.dispose();
      if (moon && oldMoonMap) {
        moon.material.map = oldMoonMap;
        moon.scale.setScalar(1);
        moon.onBeforeRender = () => {};
      }
      moonMap?.dispose();
      if (clouds) clouds.onBeforeRender = () => {};
    },
  };
}
