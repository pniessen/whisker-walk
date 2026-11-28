// =============================================================================
// THE GREENHOUSE'S CREATURES (beauty pass 5, 2026-11-28): small living things, all drawn by ONE pooled THREE.Points (no mesh, no triangle,
// no caster; the pass is net zero). A snail on the potting bench's front edge, a ladybird climbing the can's hook post, a sleepy cat on the
// cat's bed that opens one eye now and then, a hummingbird at the hibiscus that zips off when she comes close and comes back, and (at the
// walk's dusk) moths round the court lamps and fireflies. THE ARRIVAL: the first time she steps under the Palm
// House's glass a puff of pollen drifts in and a bee loops in front of her; a soft chime the first time she nears the hibiscus.
// Pure functions of the walk's clock, the cat's place and the hash of the walk: no random number, no clock of its own (the hour of the day is
// handed in). Reduced motion shows every creature still (no flee, no drift); lite draws about a third fewer points.
// =============================================================================
import { voiceFree } from './greenhousebudget.js';
import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { GH_STORY_SALT } from './greenhousestory.js';
import * as P from './greenhouseplan.js';
import { LAMP_HALOS } from './greenhouseglass.js';
import { nightSlots } from './greenhousenight.js';

const SALT = GH_STORY_SALT + 40;
const B = P.POTTING;
const BLOOM = Object.freeze({ x: -4.75, y: 1.5, z: -1.35 }); // the hibiscus's biggest bloom (the bush's first branch, give or take)
export const FLEE_R = 2.8;
export const CHIME_R = 4.5;
const POST = { x: B.canHome.x - 0.6, z: B.canHome.z - 0.3 + 0.07 };
const CAT_BED = { x: B.x + 0.3, y: 0.1, z: B.z + B.d / 2 + 0.12 };

// the day by the clock (0..24 h): how warm the light is (afternoon gold), and how strong the morning mist and the noon shafts are
export function dayLook(hour = 12) {
  const h = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 12;
  const bump = (a, b, c, d) => (h <= a || h >= d ? 0 : h < b ? (h - a) / (b - a) : h <= c ? 1 : (d - h) / (d - c));
  return { morning: bump(5, 6.5, 9.5, 11.5), noon: bump(10, 11.5, 14, 16), warm: bump(15, 17.5, 19, 21) * 0.6 };
}

// a round sprite with a solid core and a soft rim, from numbers (no canvas)
function discSprite() {
  const n = 32, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = Math.min(1, Math.max(0, (1 - Math.hypot(x - 15.5, y - 15.5) / 16) / 0.55));
    d.set([255, 255, 255, Math.round(255 * k * k * (3 - 2 * k))], (y * n + x) * 4);
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter; // (pass 9: smooth when a glow is drawn big)
  t.needsUpdate = true;
  return t;
}

export function createCreatures({ scene, audio = null, reducedMotion = false, lite = false, dusk = false, seed = 0 } = {}) {
  const FF = lite ? 8 : 16, POL = lite ? 10 : 20, NB = 64 + FF + POL, NX = nightSlots(lite), N = NB + NX; // (pass 9: NX spare slots at the end are the night life's, greenhousenight.js)
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const sprite = discSprite();
  const mat = new THREE.PointsMaterial({ size: 3.5, map: sprite, vertexColors: true, transparent: true, depthWrite: false, fog: false, sizeAttenuation: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
  };
  mat.customProgramCacheKey = () => 'greenhouse-creatures-v1';
  const points = new THREE.Points(geo, mat);
  points.name = 'greenhouse:creatures';
  points.renderOrder = 3; // pass 9: after the panes, so the owl on the roof and the moth on the glass are not dimmed by them
  points.frustumCulled = false;
  Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  points.castShadow = false;
  scene?.add(points);

  // slots
  const SNAIL = 0, LADY = 2, HUM = 3, MOTH = 7, BEE = 11, CAT = 13, FIRE = 24, POLLEN = 24 + FF;
  const hide = (i) => { size[i] = 0; col[i * 4 + 3] = 0; };
  const put = (i, x, y, z, s, r, g, b, a = 1) => { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; size[i] = s; col[i * 4] = r * r; col[i * 4 + 1] = g * g; col[i * 4 + 2] = b * b; col[i * 4 + 3] = a; };
  for (let i = 0; i < N; i++) hide(i);
  let clock = 0, yawnAt = -1, disposed = false, arrivedAt = -1, chimed = false, fleeing = 0, away = 0;
  const hum = { x: BLOOM.x, y: BLOOM.y, z: BLOOM.z };
  const chime = () => { try { if (audio && audio.isMuted?.() === false && voiceFree(audio, 1.2)) audio.chime?.(); } catch { /* sound is optional */ } };
  const sm = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };

  function still(s) { // the static creatures (the snail, the ladybird, the cat), moving a little unless reduced
    const t = reducedMotion ? 0 : s;
    // the snail: along the bench's front edge and back, a shell and a pale body with two eye-stalks' worth of tip
    const sx = B.x + (reducedMotion ? 0.5 : 1.25 * Math.sin(t * 0.055 + 1));
    const dir = Math.cos(t * 0.055 + 1) >= 0 || reducedMotion ? 1 : -1;
    const ey = B.h + 0.05, ez = B.z + B.d / 2 - 0.08;
    put(SNAIL, sx, ey + 0.07, ez, 0.27, 0.72, 0.42, 0.2);
    put(SNAIL + 1, sx + dir * 0.12, ey + 0.015, ez, 0.2, 0.9, 0.8, 0.62);
    // the ladybird up the hook post (the front face), a loop of 70 s that rests at the top a while
    const up = reducedMotion ? 0.45 : sm(((t / 70) % 1) / 0.85);
    put(LADY, POST.x + 0.012 * Math.sin(t * 2.2), 0.2 + 1.2 * up, POST.z + 0.03, 0.13, 0.95, 0.12, 0.1);
    // the sleepy cat in the cat's bed: a tabby ring, a head on its paws, one eye that opens for two seconds every half minute
    const br = 1 + (reducedMotion ? 0 : 0.035 * Math.sin(t * 1.5));
    put(CAT, CAT_BED.x + 0.02, CAT_BED.y + 0.12, CAT_BED.z, 0.36 * br, 0.7, 0.5, 0.3);
    put(CAT + 1, CAT_BED.x + 0.1, CAT_BED.y + 0.13, CAT_BED.z + 0.06, 0.22 * br, 0.5, 0.34, 0.2);
    put(CAT + 2, CAT_BED.x - 0.15, CAT_BED.y + 0.11, CAT_BED.z + 0.1, 0.16, 0.92, 0.86, 0.76);
    put(CAT + 3, CAT_BED.x - 0.2, CAT_BED.y + 0.19, CAT_BED.z + 0.12, 0.1, 0.8, 0.5, 0.22); // an ear
    const yw = !reducedMotion && yawnAt >= 0 ? clock - yawnAt : 9, yo = yw < 2.4 ? Math.sin(Math.PI * yw / 2.4) : 0; // pass 8: she yawns when the walker stands still
    const awake = !reducedMotion && ((t % 30) > 26.5 && (t % 30) < 28.7 || yo > 0.3);
    if (awake) put(CAT + 4, CAT_BED.x - 0.24, CAT_BED.y + 0.14, CAT_BED.z + 0.17, 0.07, 1, 0.85, 0.25);
    else hide(CAT + 4);
    if (yo > 0) put(CAT + 5, CAT_BED.x - 0.3, CAT_BED.y + 0.1 + 0.03 * yo, CAT_BED.z + 0.15, 0.05 + 0.09 * yo, 0.95, 0.4, 0.5); // the open mouth
    else hide(CAT + 5);
  }

  function hummer(dt, catPos) {
    const d = catPos ? Math.hypot(catPos.x - BLOOM.x, catPos.z - BLOOM.z) : 99;
    if (!reducedMotion && d < FLEE_R) { fleeing = 1; away = 3.5; }
    if (reducedMotion) fleeing = 0;
    else if (fleeing && d > FLEE_R * 2.2) { away -= dt; if (away <= 0) fleeing = 0; }
    let gx = BLOOM.x, gy = BLOOM.y, gz = BLOOM.z, k = 1 - Math.exp(-dt * 6);
    if (fleeing) { // a dart up and away from her, over the panes' height, out of the view
      const dx = BLOOM.x - catPos.x, dz = BLOOM.z - catPos.z, l = Math.hypot(dx, dz) || 1;
      gx = BLOOM.x + (dx / l) * 9; gy = BLOOM.y + 2.4; gz = BLOOM.z + (dz / l) * 9; k = 1 - Math.exp(-dt * 3.2);
    } else if (hum.x !== BLOOM.x) k = 1 - Math.exp(-dt * 2.2);
    hum.x += (gx - hum.x) * k; hum.y += (gy - hum.y) * k; hum.z += (gz - hum.z) * k;
    const t = reducedMotion ? 0 : clock, hov = fleeing ? 0 : 1;
    const jx = hov * 0.03 * Math.sin(t * 19), jy = hov * 0.035 * Math.sin(t * 13 + 1);
    const hide2 = !reducedMotion && Math.hypot(hum.x - BLOOM.x, hum.z - BLOOM.z) > 12;
    if (hide2) { for (let i = 0; i < 4; i++) hide(HUM + i); return; }
    put(HUM, hum.x + jx, hum.y + jy, hum.z, 0.2, 0.25, 0.4, 0.98);
    put(HUM + 1, hum.x + jx + 0.09, hum.y + jy + 0.01, hum.z, 0.09, 0.95, 0.15, 0.25); // the bill is a dark pip, throat a red one
    const flap = reducedMotion || Math.sin(t * 70) > 0 ? 1 : 0.55;
    put(HUM + 2, hum.x + jx - 0.03, hum.y + jy + 0.1 * flap, hum.z + 0.07, 0.15 * flap, 0.95, 0.97, 1, 0.55);
    put(HUM + 3, hum.x + jx - 0.03, hum.y + jy + 0.1 * flap, hum.z - 0.07, 0.15 * flap, 0.95, 0.97, 1, 0.55);
  }

  function night(dk) { // moths at the lamps, the lanterns' glow, fireflies (the walk's dusk only)
    const t = reducedMotion ? 0 : clock;
    for (let i = 0; i < 4; i++) { // moths: round a lamp, loose loops
      const [lx, ly, lz] = LAMP_HALOS[i % 2];
      const a = t * (1.3 + 0.4 * i) + i * 1.7, r = 0.45 + 0.25 * Math.sin(t * 0.7 + i);
      put(MOTH + i, lx + Math.cos(a) * r, ly - 0.15 + 0.3 * Math.sin(a * 1.6 + i), lz + Math.sin(a) * r, 0.13, 0.96, 0.92, 0.8, (reducedMotion || Math.sin(t * 22 + i) > -0.4 ? 0.95 : 0.5) * dk);
    }
    for (let j = 0; j < FF; j++) { // fireflies, in the garden
      const bx = -26 + 52 * hash01(j, 1, SALT), bz = 7 + 27 * hash01(j, 2, SALT), ph = hash01(j, 3, SALT) * 6.3;
      const blink = reducedMotion ? 0.85 : 0.3 + 0.7 * Math.max(0, Math.sin(t * 1.1 + ph * 3)) ** 2; // pass 10: a floor so the row never goes fully dark
      put(FIRE + j, bx + 0.9 * Math.sin(t * 0.3 + ph), 0.5 + 0.5 * hash01(j, 4, SALT) + 0.25 * Math.sin(t * 0.5 + ph), bz + 0.9 * Math.cos(t * 0.27 + ph), 0.5, 0.9, 1, 0.4, blink * dk);
    }
  }

  function arrival(catPos) {
    if (arrivedAt < 0) return;
    const s = reducedMotion ? (clock - arrivedAt < 6 ? 2.2 : 9) : clock - arrivedAt, X = catPos?.x ?? 0;
    if (s > 7) { for (let i = 0; i < POL; i++) hide(POLLEN + i); hide(BEE); hide(BEE + 1); return; }
    for (let j = 0; j < POL; j++) { // a puff of pollen drifting up and inward from the door
      const u = s / 5, h1 = hash01(j, 1, SALT + 1), h2 = hash01(j, 2, SALT + 1), h3 = hash01(j, 3, SALT + 1);
      put(POLLEN + j, (h1 - 0.5) * 2.4 + 0.5 * Math.sin(s * 0.9 + j) * u + X * 0.3, 0.6 + h2 * 0.9 + u * 0.9, -0.6 - u * (1 + 2 * h3), 0.06 + 0.045 * h3, 1, 0.84, 0.28, Math.max(0, 1 - u * u) * 0.9);
    }
    // the bee salute: a loop in front of the cat, a pause hovering, then off to the hibiscus
    const loop = Math.min(1, s / 2.2), go = sm((s - 4.2) / 2.4);
    const a = loop * Math.PI * 2, bx = X + Math.sin(a) * 0.7, bz = -1.4 - Math.cos(a) * 0.5 - 0.5 * loop, by = 1.35 + 0.25 * Math.sin(a * 2) + (reducedMotion ? 0 : 0.03 * Math.sin(s * 30));
    const px = bx + (BLOOM.x - bx) * go, py = by + (BLOOM.y - by) * go, pz = bz + (BLOOM.z - bz) * go;
    put(BEE, px, py, pz, 0.17, 1, 0.78, 0.1, 1 - sm((s - 6) / 1));
    put(BEE + 1, px - 0.03, py + 0.03, pz, 0.1, 0.15, 0.1, 0.05, 1 - sm((s - 6) / 1));
  }

  return {
    points,
    pool: { count: NX, put: (k, ...a) => put(NB + k, ...a), hide: (k) => hide(NB + k) },
    get hummingbird() { return { ...hum }; },
    get arrived() { return arrivedAt >= 0; },
    yawn() { if (!reducedMotion && !disposed && (yawnAt < 0 || clock - yawnAt > 3)) yawnAt = clock; },
    update(dt, t, catPos = null, under = false) {
      if (disposed) return;
      void t;
      clock += dt > 0 ? dt : 0;
      still(clock);
      hummer(dt > 0 ? Math.min(dt, 0.1) : 0, catPos);
      if (dusk) night(1);
      if (!dusk) { for (let i = 0; i < 4; i++) hide(MOTH + i); for (let j = 0; j < FF; j++) hide(FIRE + j); }
      if (catPos) {
        if (arrivedAt < 0 && under) { arrivedAt = clock; for (let i = POLLEN; i < POLLEN + POL; i++) hide(i); }
        if (!chimed && under && Math.hypot(catPos.x - BLOOM.x, catPos.z - BLOOM.z) < CHIME_R) { chimed = true; chime(); }
      }
      arrival(catPos);
      for (const a of ['position', 'color', 'aSize']) geo.attributes[a].needsUpdate = true;
    },
    dispose() { disposed = true; scene?.remove(points); geo.dispose(); mat.dispose(); sprite.dispose(); },
  };
}
