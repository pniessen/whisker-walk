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
  g.save();
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.clip();
  const sea = g.createRadialGradient(cx - R * 0.35, cx - R * 0.2, R * 0.1, cx, cx, R);
  sea.addColorStop(0, '#6db8ff');
  sea.addColorStop(1, '#1b4fa8');
  g.fillStyle = sea;
  g.fillRect(0, 0, S, S);
  const land = (x, y, rx, ry, rot) => {
    g.beginPath();
    g.ellipse(cx + x * R, cx + y * R, rx * R, ry * R, rot, 0, Math.PI * 2);
    g.fillStyle = '#4f9a58';
    g.fill();
    g.beginPath();
    g.ellipse(cx + x * R + rx * R * 0.2, cx + y * R + ry * R * 0.15, rx * R * 0.5, ry * R * 0.4, rot, 0, Math.PI * 2);
    g.fillStyle = 'rgba(205,190,120,.5)';
    g.fill();
  };
  land(-0.35, -0.1, 0.28, 0.5, 0.4);
  land(0.35, 0.2, 0.2, 0.34, -0.3);
  land(0.05, -0.62, 0.34, 0.12, 0.1);
  land(-0.1, 0.55, 0.12, 0.2, 0.2);
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.beginPath();
  g.ellipse(cx, cx - R * 0.9, R * 0.5, R * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  // night: the sun is on the left, so the right side falls into shade
  const shade = g.createLinearGradient(cx - R * 0.55, 0, cx + R, 0);
  shade.addColorStop(0, 'rgba(2,6,22,0)');
  shade.addColorStop(0.5, 'rgba(2,6,22,.6)');
  shade.addColorStop(1, 'rgba(2,6,22,.93)');
  g.fillStyle = shade;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffe9a8';
  for (const [x, y] of [[0.62, -0.1], [0.55, 0], [0.5, 0.12], [0.7, 0.2], [0.45, -0.25], [0.6, -0.3], [0.38, 0.05], [0.66, 0.35]]) {
    g.beginPath();
    g.arc(cx + x * R, cx + y * R, 1.4 * (S / 256), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  const rim = g.createRadialGradient(cx, cx, R * 0.94, cx, cx, R * 1.06);
  rim.addColorStop(0, 'rgba(150,200,255,0)');
  rim.addColorStop(0.5, 'rgba(150,200,255,.45)');
  rim.addColorStop(1, 'rgba(150,200,255,0)');
  g.fillStyle = rim;
  g.beginPath();
  g.arc(cx, cx, R * 1.06, 0, Math.PI * 2);
  g.fill();
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
  g.strokeStyle = 'rgba(255,255,255,.75)';
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const y = 14 + ((i * 37) % 100);
    for (const dx of [-256, 0, 256]) {
      g.lineWidth = 5 + (i % 3) * 3;
      g.beginPath();
      g.ellipse(dx + 40 + i * 25, y, 34 + (i % 4) * 9, 6 + (i % 3) * 3, 0.2 * (i % 3), 0, Math.PI * 2);
      g.stroke();
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

// createMoonSky({ scene, tier, reducedMotion }) -> { stars, earth, clouds, update(camera, t), dispose() }
export function createMoonSky({ scene, tier, reducedMotion = false }) {
  const lite = tier?.shadows === false; // the lite rung: half the stars and a still Earth
  const { pos, col } = starField(lite ? STARS.lite : STARS.full);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false });
  const stars = new THREE.Points(geo, starMat);
  stars.name = 'moon:stars';
  stars.onBeforeRender = (renderer) => { starMat.size = 2.2 * renderer.getPixelRatio(); }; // device pixels: follow the live ratio
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
    scene.add(earth);
    cloudMap = cloudTexture();
    if (cloudMap) {
      clouds = new THREE.Mesh(new THREE.CircleGeometry(EARTH.size * 0.46 * 0.96, 28), new THREE.MeshBasicMaterial({ map: cloudMap, transparent: true, opacity: 0.35, depthWrite: false, fog: false, toneMapped: false }));
      clouds.name = 'moon:clouds';
      skyFlags(clouds, 0);
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
