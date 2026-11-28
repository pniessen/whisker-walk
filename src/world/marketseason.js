// =============================================================================
// THE SQUARE'S SEASON AND ITS SURPRISE (Market beauty pass 4). The date picks a gentle season (the
// northern one: spring March-May, summer June-August, autumn September-November, winter
// December-February) and its tint (applySeason: the weights the cobbles', the paint's and the
// awnings' shaders read, marketreact.js and marketparts.js), and one pooled Points (createDrift)
// carries the season's air: blossom petals in spring, a few drifting seeds in summer, falling
// leaves in autumn, a light flurry in winter (winter also warms the lanterns' colour).
//
// THE SURPRISE. Now and then (about every three minutes of walking, on a seeded schedule, only when
// she is within earshot of the fountain) the fountain throws a burst of the season's petals, leaves
// or sparkles up and out in a soft arc, and a hummed little tune with three bright chimes goes with
// it (marketsound.js sparkle). Rare enough to be a moment.
//
// No mesh, no triangle, no light: one Points of POOL points (the ambient air and the burst's
// share of it). No Math.random, no clock: walk seconds and hash01. Reduced motion lays the ambient
// petals and leaves down on the cobbles and never bursts; the lite rung draws no drift at all.
// =============================================================================
import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { withLocalUuids } from './localuuids.js';
import { FOUNTAIN, MARKET_BOUNDS } from './marketplan.js';

export const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
// the weights the shaders read: x autumn, y winter, z spring, w summer
const WEIGHTS = Object.freeze({ autumn: [1, 0, 0, 0], winter: [0, 1, 0, 0], spring: [0, 0, 1, 0], summer: [0, 0, 0, 1] });

export function seasonOf(now = new Date()) {
  const m = (now instanceof Date ? now : new Date(now)).getMonth(); // 0 January
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

// the season's weights into the react record's uMkSea (neutral for an unknown name)
export function applySeason(react, season) {
  const w = WEIGHTS[season] ?? [0, 0, 0, 0];
  react?.uMkSea?.value.set(w[0], w[1], w[2], w[3]);
  return season;
}

export const DRIFT = Object.freeze({
  ambient: Object.freeze({ spring: 34, summer: 10, autumn: 38, winter: 26 }),
  burst: 44,
  top: 6.2, // m: where they start to fall from
  fall: Object.freeze({ spring: 0.32, summer: -0.08, autumn: 0.5, winter: 0.62 }), // m/s (summer's seeds rise a little)
  sway: Object.freeze({ spring: 0.7, summer: 0.5, autumn: 1.1, winter: 0.4 }),
  size: Object.freeze({ spring: 0.3, summer: 0.15, autumn: 0.38, winter: 0.17 }),
  colours: Object.freeze({
    spring: [0xf8c8d8, 0xfde6ee, 0xf3a8c2, 0xffffff],
    summer: [0xfffbe8, 0xffffff, 0xf8f0c8],
    autumn: [0xd9531c, 0xe8a02a, 0xb8321e, 0xf0c040, 0x9a5a1e],
    winter: [0xffffff, 0xe6f0fa, 0xf4f8ff],
  }),
  burstColours: Object.freeze({
    spring: [0xf06fa0, 0xffffff, 0xf3d54a, 0xb48ad8],
    summer: [0xf3d54a, 0xe8613f, 0x6fb8f0, 0xe58fb0],
    autumn: [0xe8a02a, 0xd9531c, 0xf0c040, 0xb8321e],
    winter: [0xffffff, 0xcfe6ff, 0xfff4c8, 0xdff0ff],
  }),
  every: Object.freeze([150, 240]), // s between bursts
  first: 40, // s: the earliest the first one can come
  life: 3.4, // s a burst lasts
  ear: 16, // m: she must be this near the fountain
  y0: 2.5, // m: the fountain's top, where it leaves
});

const HIDDEN = -50;
const rungLite = (tier) => !!tier && (tier.shadows === false || tier.name === 'low' || (tier.rung ?? 0) >= 3);

function dotTexture() {
  const n = 16;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
      const j = (y * n + x) * 4;
      data[j] = data[j + 1] = data[j + 2] = 255;
      data[j + 3] = Math.round(255 * Math.min(1, Math.max(0, (1 - d) * 5)));
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

// The burst schedule: the k-th burst's walk second (seeded, increasing).
export function burstTime(k) {
  let t = DRIFT.first * (0.6 + 0.8 * hash01(0, 0, 211));
  for (let i = 0; i < k; i++) t += DRIFT.every[0] + (DRIFT.every[1] - DRIFT.every[0]) * hash01(i + 1, 3, 211);
  return t;
}

// createDrift(scene, { season, reducedMotion, tier, ground }) -> { update(t, catPos, sound), burst(t), points, dispose() } | null (the lite rung)
export function createDrift(scene, { season = 'autumn', reducedMotion = false, tier = null } = {}) {
  if (rungLite(tier) || !scene) return null;
  const nA = Math.round(DRIFT.ambient[season] ?? 0);
  const nB = DRIFT.burst;
  const N = nA + nB;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const c = new THREE.Color();
  const palette = DRIFT.colours[season] ?? DRIFT.colours.autumn;
  const bpalette = DRIFT.burstColours[season] ?? DRIFT.burstColours.autumn;
  const B = MARKET_BOUNDS;
  const home = Array.from({ length: nA }, (_, i) => ({
    x: B.minX + (B.maxX - B.minX) * hash01(i, 1, 223),
    z: B.minZ + (B.maxZ - B.minZ) * hash01(i, 2, 223),
    ph: hash01(i, 3, 223),
    sw: 0.6 + 0.8 * hash01(i, 4, 223),
  }));
  for (let i = 0; i < nA; i++) {
    c.setHex(palette[Math.floor(hash01(i, 5, 223) * palette.length) % palette.length]);
    col.set([c.r, c.g, c.b], i * 3);
  }
  for (let j = 0; j < nB; j++) {
    c.setHex(bpalette[Math.floor(hash01(j, 6, 223) * bpalette.length) % bpalette.length]);
    col.set([c.r, c.g, c.b], (nA + j) * 3);
    pos[(nA + j) * 3 + 1] = HIDDEN;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const size = DRIFT.size[season] ?? 0.16;
  const { points, mat, tex } = withLocalUuids('market-drift', () => {
    const tex = dotTexture();
    const mat = new THREE.PointsMaterial({ map: tex, alphaTest: 0.2, size, sizeAttenuation: true, vertexColors: true, transparent: false, depthWrite: true, fog: true });
    return { tex, mat, points: new THREE.Points(geo, mat) };
  });
  points.name = 'marketDrift';
  points.frustumCulled = false;
  Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(points);

  const fall = DRIFT.fall[season] ?? 0.4;
  const sway = DRIFT.sway[season] ?? 0.6;
  const span = DRIFT.top + 0.5;
  let burstAt = -1e9;
  let burstN = 0; // the k-th scheduled burst not yet played
  let nextAt = burstTime(0);

  function ambient(t) {
    for (let i = 0; i < nA; i++) {
      const h = home[i];
      let x; let y; let z;
      if (reducedMotion) { // lying where they would have landed
        x = h.x; z = h.z; y = 0.03 + 0.004 * (i % 3);
      } else {
        const q = (h.ph + t * Math.abs(fall) / span) % 1;
        y = fall >= 0 ? DRIFT.top - q * span : 0.5 + q * (DRIFT.top - 1.5);
        x = h.x + Math.sin(t * 0.6 * h.sw + h.ph * 40) * sway * 1.4 + Math.sin(y * 0.8 + h.ph * 9) * 0.6;
        z = h.z + Math.cos(t * 0.5 * h.sw + h.ph * 31) * sway;
        if (y < 0.03) y = 0.03;
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
  }
  ambient(0);
  // beauty pass 6 (legibility): a leaf or petal right at the lens is a big hard-edged disc over the picture, so none within 5.5 m of the camera
  function keepClear(camera) {
    const c = camera?.position;
    if (!c) return;
    for (let i = 0; i < nA; i++) if ((pos[i * 3] - c.x) ** 2 + (pos[i * 3 + 1] - c.y) ** 2 + (pos[i * 3 + 2] - c.z) ** 2 < 30) pos[i * 3 + 1] = HIDDEN;
  }

  function paintBurst(t) {
    const age = t - burstAt;
    for (let j = 0; j < nB; j++) {
      const k = (nA + j) * 3;
      if (age < 0 || age > DRIFT.life) { pos[k + 1] = HIDDEN; continue; }
      const a = hash01(j, 7, 229) * Math.PI * 2;
      const sp = 0.7 + 1.5 * hash01(j, 8, 229);
      const vy = 2.4 + 1.3 * hash01(j, 9, 229);
      const g = 3.4;
      const y = DRIFT.y0 + vy * age - 0.5 * g * age * age;
      if (y < 0.05) { pos[k + 1] = HIDDEN; continue; }
      const drag = 1 - Math.exp(-age * 1.4);
      pos[k] = FOUNTAIN.x + Math.cos(a) * sp * drag * 1.6 + Math.sin(age * 3 + j) * 0.05;
      pos[k + 1] = y;
      pos[k + 2] = FOUNTAIN.z + Math.sin(a) * sp * drag * 1.6;
    }
  }

  return {
    points,
    DOTS: N,
    // start a burst at walk second t
    burst(t) { burstAt = t; paintBurst(t); geo.attributes.position.needsUpdate = true; },
    get bursting() { return burstAt > -1e8; },
    update(t, catPos = null, sound = null, camera = null) {
      if (!reducedMotion) {
        ambient(t);
        keepClear(camera);
        if (t >= nextAt) {
          const near = catPos && Math.hypot(catPos.x - FOUNTAIN.x, catPos.z - FOUNTAIN.z) < DRIFT.ear;
          while (nextAt <= t) { burstN++; nextAt = burstTime(burstN); } // a long frame skips the ones it passed
          if (near) {
            burstAt = t;
            sound?.sparkle?.(Math.max(0.2, 1 - Math.hypot(catPos.x - FOUNTAIN.x, catPos.z - FOUNTAIN.z) / DRIFT.ear));
          }
        }
        paintBurst(t);
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
