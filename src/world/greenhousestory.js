// =============================================================================
// THE GREENHOUSE'S SEASONS AND SURPRISES (beauty pass 4, 2026-11-28).
//   * seasonOf(date) and applySeason(scene, season): the garden outside the glass changes with the calendar. Spring: fresh greens, pastel
//     blooms, closed buds. Summer: the colours as built. Autumn: golds, oranges and brown seed heads. Winter: pale frosted greens, blooms
//     that have faded to white, a frost on the court (and, in greenhouselife.js, on the pane edges, and warmer lamps). It only RECOLOURS
//     vertex colours that already exist (the plants and beds under the glass keep their colours: the hall is tropical all year), so no
//     triangle, mesh or material is added; the build's own colours are kept (geometry.userData.baseColor) so doing it again is harmless.
//   * createMoments: three rare surprises, all drawn by ONE pooled THREE.Points (no mesh, no triangle; hidden when nothing is on):
//     a rainbow over the glass after rain, a sprinkler that turns on for a minute with sparkles, and (at dusk) a night-blooming flower
//     that opens with a soft glow. Each plays a soft chime if sound is on. Pure functions of the walk's clock and the hash of the
//     walk; no Math.random, no clock of its own. Reduced motion shows each still (no drift, no pulse); the low tier draws half the points.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import * as P from './greenhouseplan.js';

export const GH_STORY_SALT = 0x6e5f0;
export const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
// the northern year: March to May, June to August, September to November, December to February
export function seasonOf(date = new Date()) {
  const m = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getMonth() : 5;
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

const OUTSIDE = ['ghFoliage', 'ghTrees', 'ghStreet', 'ghGround', 'ghKitchenBed', 'ghShed', 'ghBench', 'ghPot-0', 'ghPot-1', 'ghPot-2', 'ghPot-3', 'ghPot-4', 'ghPot-5', 'ghPot-6', 'ghPot-7'];
const AUTUMN = [[0.86, 0.62, 0.14], [0.8, 0.38, 0.1], [0.62, 0.6, 0.18], [0.9, 0.7, 0.2]];
const lerp = (a, b, t) => a + (b - a) * t;

// one vertex's season colour: c = [r, g, b] (changed in place); cell: a hash of the 1.4 m cell it is in (a whole tree blob, or a whole bloom, goes together)
function seasonColour(season, c, cell, cell2) {
  const [r, g, b] = c;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx > 1e-4 ? (mx - mn) / mx : 0;
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  const green = g >= r * 1.02 && g >= b * 1.15 && sat > 0.18;
  const flower = !green && sat > 0.45 && mx > 0.55;
  const stone = sat < 0.2 && lum > 0.45;
  const toward = (t, w, k = 1) => { c[0] = lerp(r, Math.min(1.2, t[0] * k), w); c[1] = lerp(g, Math.min(1.2, t[1] * k), w); c[2] = lerp(b, Math.min(1.2, t[2] * k), w); };
  const k = Math.min(1.4, Math.max(0.55, lum / 0.42));
  if (season === 'autumn') {
    if (green) toward(AUTUMN[Math.floor(cell * AUTUMN.length) % AUTUMN.length], 0.62, k);
    else if (flower) { if (cell2 < 0.4) toward([0.45, 0.3, 0.16], 0.85, Math.min(1, lum / 0.5 + 0.4)); else toward([0.85, 0.45, 0.15], 0.28, 1); }
  } else if (season === 'spring') {
    if (green) toward([0.55, 0.86, 0.3], 0.3, k);
    else if (flower) { if (cell2 < 0.25) toward([0.8, 0.92, 0.7], 0.6, 1); else toward([1, 0.96, 0.98], 0.4, 1); }
  } else if (season === 'winter') {
    if (green) toward([0.58, 0.7, 0.68], 0.52, k);
    else if (flower && cell2 > 0.2) toward([0.9, 0.94, 1], 0.55, 1);
    else if (stone) toward([0.92, 0.96, 1], 0.28, 1);
  }
}

// Recolour what is outside the glass for the season. Idempotent (always from the build's own colours). Returns how many vertices changed.
export function applySeason(scene, season) {
  let changed = 0;
  const lawn = scene.children.find((o) => o.isMesh && o.userData?.ground);
  if (lawn?.material?.color) {
    lawn.userData.baseLawn ??= lawn.material.color.clone();
    const t = { autumn: [1.35, 0.9, 0.42], winter: [0.78, 0.96, 1.15], spring: [0.92, 1.12, 0.75] }[season] ?? [1, 1, 1];
    const lc = lawn.material.color.copy(lawn.userData.baseLawn);
    lc.r *= t[0]; lc.g *= t[1]; lc.b *= t[2];
  }
  const c = [0, 0, 0];
  for (const name of OUTSIDE) {
    const mesh = scene.getObjectByName(name);
    const geo = mesh?.geometry;
    const col = geo?.attributes?.color, pos = geo?.attributes?.position;
    if (!col || !pos) continue;
    geo.userData.baseColor ??= Float32Array.from(col.array);
    const base = geo.userData.baseColor;
    const ox = mesh.position.x, oz = mesh.position.z;
    for (let i = 0; i < col.count; i++) {
      c[0] = base[i * 3]; c[1] = base[i * 3 + 1]; c[2] = base[i * 3 + 2];
      if (season !== 'summer') {
        const x = pos.getX(i) + ox, z = pos.getZ(i) + oz;
        if (!P.underGlass(x, 0.5, z)) {
          seasonColour(season, c, hash01(Math.floor(x / 1.4), Math.floor(z / 1.4), GH_STORY_SALT), hash01(Math.floor(x / 0.45), Math.floor(z / 0.45), GH_STORY_SALT + 1));
          changed++;
        }
      }
      col.setXYZ(i, c[0], c[1], c[2]);
    }
    col.needsUpdate = true;
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------------------------------------
export const MOMENT = Object.freeze({
  rainbow: { secs: 80, fade: 8, chime: true },
  sprinkler: { secs: 60, fade: 4, chime: true },
  moonbloom: { secs: 60, fade: 6, chime: true },
});
export const MOMENT_CHANCE = Object.freeze({ rainbow: 0.5, walk: 0.3 }); // a rain's end shows a rainbow half the time; a walk has a sprinkler or night flower 3 times in 10
export const SPRINKLER = Object.freeze({ heads: [[-2.9, 22.6], [2.9, 22.6]], range: 2.8, peak: 1.5 });
export const RAINBOW = Object.freeze({ x: 0, z: P.PALM_HOUSE.z0 - 22, r: 24, bands: 7 }); // a big, far arc beyond the north wall: its legs rise either side of the view from the hall, and it clears the roof from the court
const BAND = [0xff3b30, 0xff9a1f, 0xffe23a, 0x4fd04f, 0x3fa8ff, 0x4a4ff0, 0xa04bd8].map((h) => new THREE.Color(h));
const CAP = 400;

export function moonbloomSpot(visits = 0) {
  const spots = [...P.CATNIP_BEDS.map((b) => ({ x: b.x, z: b.z })), { x: P.KITCHEN_BED.x, z: P.KITCHEN_BED.z + 0.2 }];
  return spots[Math.floor(hash01(visits, 7, GH_STORY_SALT + 2) * spots.length) % spots.length];
}

// the soft round sprite (a 32 px radial falloff on a small canvas)
function softSprite() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gr;
  c.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cv);
}

export function createMoments({ scene, audio = null, reducedMotion = false, lite = false, visits = 0 } = {}) {
  const pos = new Float32Array(CAP * 3), col = new Float32Array(CAP * 3), size = new Float32Array(CAP);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setDrawRange(0, 0);
  const sprite = softSprite();
  const mat = new THREE.PointsMaterial({ size: 1, map: sprite, vertexColors: true, transparent: true, depthWrite: false, opacity: 0, fog: false, sizeAttenuation: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
  };
  mat.customProgramCacheKey = () => 'greenhouse-moments-v1';
  const points = new THREE.Points(geo, mat);
  points.name = 'greenhouse:moments';
  points.visible = false;
  points.frustumCulled = false;
  Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  points.castShadow = false;
  scene?.add(points);

  let kind = null, at = 0, n = 0, spot = null;
  let disposed = false;
  const half = lite ? 0.5 : 1;
  const colour = (i, c, k = 1) => { col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; };
  const white = new THREE.Color(0x4aa6ff), gold = new THREE.Color(0xfff0a0), glow = new THREE.Color(0xb8c8ff);

  function chime() {
    try { if (audio && audio.isMuted?.() === false) audio.chime?.(); } catch { /* sound is optional */ }
  }
  function start(which, nowT = 0, at2 = null) {
    if (disposed || kind || !MOMENT[which]) return false;
    kind = which; at = nowT; n = 0;
    if (which === 'rainbow') {
      const per = Math.round(50 * half);
      for (let b = 0; b < RAINBOW.bands; b++) for (let j = 0; j < per; j++) {
        const a = Math.PI * (0.04 + 0.92 * (j / (per - 1))), rr = RAINBOW.r + (b - 3) * 1.1;
        pos.set([RAINBOW.x + Math.cos(a) * rr, 0.4 + Math.sin(a) * rr, RAINBOW.z], n * 3);
        colour(n, BAND[b], 0.9); size[n] = 5; n++;
      }
    } else if (which === 'sprinkler') {
      n = Math.round(SPRINKLER.heads.length * 40 * half);
    } else {
      spot = at2 ?? moonbloomSpot(visits);
      n = Math.round(30 * half);
    }
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.aSize.needsUpdate = true;
    points.visible = true;
    mat.opacity = 0;
    chime();
    return true;
  }
  function stop() { kind = null; n = 0; points.visible = false; mat.opacity = 0; geo.setDrawRange(0, 0); }

  return {
    points,
    get kind() { return kind; },
    get active() { return !!kind; },
    get spot() { return spot; },
    start,
    update(t) {
      if (disposed || !kind) return;
      const M = MOMENT[kind], s = t - at;
      if (s > M.secs) { stop(); return; }
      const env = Math.min(1, s / M.fade, (M.secs - s) / M.fade);
      mat.opacity = Math.max(0, env) * (kind === 'rainbow' ? 0.85 : 0.95);
      const tt = reducedMotion ? 0 : s;
      if (kind === 'sprinkler') {
        const per = n / SPRINKLER.heads.length;
        for (let h = 0; h < SPRINKLER.heads.length; h++) {
          const [hx, hz] = SPRINKLER.heads[h], dir = hx < 0 ? 1 : -1;
          const sweep = reducedMotion ? 0 : Math.sin(tt * 0.7 + h * 2) * 0.9;
          for (let j = 0; j < per; j++) {
            const i = h * per + j;
            const u = reducedMotion ? j / per : ((tt * 0.9 + j / per) % 1);
            const jit = hash01(j, h, GH_STORY_SALT + 3) - 0.5;
            const a = 0.25 + 0.7 * hash01(j, h + 4, GH_STORY_SALT + 3);
            pos[i * 3] = hx + dir * SPRINKLER.range * u * a * 1.1;
            pos[i * 3 + 1] = 0.25 + SPRINKLER.peak * 4 * u * (1 - u) * (0.6 + 0.4 * a);
            pos[i * 3 + 2] = hz + Math.sin(sweep + jit * 0.9) * SPRINKLER.range * u * 0.7 + jit * 0.5 * u;
            const tw = reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(tt * 9 + j * 3.1);
            colour(i, j % 5 === 0 ? gold : white, tw);
            size[i] = (j % 5 === 0 ? 0.8 : 0.45) * (0.8 + 0.6 * u);
          }
        }
      } else if (kind === 'moonbloom') {
        const open = reducedMotion ? 1 : Math.min(1, s / 7);
        const pulse = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(tt * 1.6);
        pos.set([spot.x, 0.55, spot.z], 0); colour(0, glow, 0.9 * open * pulse); size[0] = 3.6 * open * pulse;
        pos.set([spot.x, 0.5, spot.z], 3); colour(1, new THREE.Color(0xffffff), open); size[1] = 1.1 * open;
        for (let j = 2; j < n; j++) {
          const u = reducedMotion ? hash01(j, 1, GH_STORY_SALT + 4) : ((tt * 0.12 + hash01(j, 1, GH_STORY_SALT + 4)) % 1);
          const a = hash01(j, 2, GH_STORY_SALT + 4) * Math.PI * 2, rr = 0.2 + 0.7 * hash01(j, 3, GH_STORY_SALT + 4);
          pos.set([spot.x + Math.cos(a + (reducedMotion ? 0 : tt * 0.3)) * rr * (0.5 + u), 0.4 + u * 1.5, spot.z + Math.sin(a + (reducedMotion ? 0 : tt * 0.3)) * rr * (0.5 + u)], j * 3);
          colour(j, j % 3 ? glow : gold, open * (1 - u * 0.6));
          size[j] = (0.3 + 0.35 * hash01(j, 5, GH_STORY_SALT + 4)) * open;
        }
      }
      geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.aSize.needsUpdate = true;
    },
    dispose() {
      disposed = true;
      scene?.remove(points);
      geo.dispose(); mat.dispose(); sprite.dispose();
    },
  };
}
