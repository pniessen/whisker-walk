// =============================================================================
// THE REEF: SEVEN MORE FRIENDLY SEA CREATURES, THE DRAWING. The same vertex-coloured "soup" as the seals (world/reefsealsparts.js: tubes, ellipsoids and paddles
// written into one BufferGeometry a frame), in four meshes: the jellyfish (additive and see-through: dim vertex colours added to the water, no real lights), the
// swimmers (mantas, whale, squid), the creatures that hold or hide (clownfish, seahorses, eels) and the eels' rocks (written once). Nothing here knows the time or
// the cat: reefmorelive.js hands in the poses that reefmore.js worked out. Draws no random number.
// =============================================================================

import * as THREE from 'three';
import { Soup, tube, ellipsoid, paddle, bodyMatrix, frameMatrix, drawRocks } from './reefsealsparts.js';
import { eelSpine, JELLY_TONES, EEL_DENS } from './reefmore.js';
import { smooth, TAU } from './reefseals.js';

export { Soup, drawRocks, EEL_DENS };
const DARK = [24, 18, 16]; const WHITE = [255, 255, 255];
const flat = (c) => ({ top: c, bot: c });
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const prof = (tbl, s) => {
  for (let i = 1; i < tbl.length; i++) if (s <= tbl[i][0]) { const a = tbl[i - 1]; return a[1] + (tbl[i][1] - a[1]) * ((s - a[0]) / (tbl[i][0] - a[0] || 1)); }
  return tbl[tbl.length - 1][1];
};

// A soup to a mesh. `glow` is the jellyfish's: see-through, added to what is behind, written to no depth, drawn both sides.
export function moreMesh(soup, name, glow = false) {
  const g = new THREE.BufferGeometry();
  const set = (key, arr) => { const a = new THREE.BufferAttribute(arr, 3); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(key, a); return a; };
  const att = { position: set('position', soup.p), normal: set('normal', soup.n), color: set('color', soup.c) };
  g.setDrawRange(0, soup.k);
  const mat = glow
    ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = name; mesh.frustumCulled = false;
  if (glow) mesh.renderOrder = 4;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return { mesh, att, geo: g, mat };
}

// ---- the jellyfish ----------------------------------------------------------------------------------------------------------
export function drawJelly(soup, j, pose) {
  const [bell, rim, ten] = JELLY_TONES[j.tone];
  const m = bodyMatrix(pose.x, pose.y, pose.z, pose.yaw, 0, 0, j.size);
  const sq = pose.pulse; // +1 squeezing in, -1 relaxed
  const R = 0.5 * (1 - 0.14 * sq); const H = 0.34 * (1 + 0.2 * sq);
  tube(soup, (s, o) => { o.x = 0; o.y = H * (1 - s); o.z = 0; },
    (s) => { const r = R * Math.sqrt(Math.max(0, 1 - (1 - s) ** 2)) * (1 + 0.1 * smooth((s - 0.8) / 0.2)); return [r, r]; }, 7, 9, m,
    { ring: (s) => flat(mix(bell, rim, smooth((s - 0.55) / 0.4))) });
  ellipsoid(soup, m, 0, H * 0.45, 0, 0.17, 0.05, 0.17, flat(rim), 3, 6); // the bright ring inside
  const sp = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 8; i++) { // tentacles at the rim (the first three, longer and thicker, are the oral arms)
    const a = (i / 8) * TAU + 0.4; const arm = i % 3 === 0;
    const len = (arm ? 0.55 : 0.95) * (1 - 0.12 * sq); const rr = arm ? 0.028 : 0.012;
    const bx = Math.cos(a) * R * (arm ? 0.3 : 0.88); const bz = Math.sin(a) * R * (arm ? 0.3 : 0.88);
    tube(soup, (s, o) => {
      const lag = 0.14 * s * s * Math.sin(pose.phase - 2.4 * s + a);
      sp.x = bx * (1 - 0.35 * s) + lag * Math.cos(a + 1); sp.z = bz * (1 - 0.35 * s) + lag * Math.sin(a + 1);
      o.x = sp.x; o.y = -len * s; o.z = sp.z;
    }, (s) => { const r = rr * (1 - 0.7 * s) + 0.003; return [r, r]; }, 5, 3, m, { ring: (s) => flat(mix(arm ? rim : ten, [0, 0, 0], 0.75 * s)) });
  }
}

// ---- the clownfish ----------------------------------------------------------------------------------------------------------
const CL_BODY = [[0, 0.012], [0.1, 0.045], [0.35, 0.065], [0.6, 0.05], [0.85, 0.028], [1, 0.02]];
const ORANGE = [244, 112, 28]; const ORANGE2 = [252, 168, 78]; const BLACK = [20, 16, 16];
// Two white bands with a thin black edge each, the way a clownfish is painted: along the body by the fraction of its length.
const clownRing = (s) => {
  const band = (s > 0.25 && s < 0.37) || (s > 0.56 && s < 0.64);
  const edge = (s > 0.2 && s <= 0.25) || (s >= 0.37 && s < 0.42) || (s > 0.52 && s <= 0.56) || (s >= 0.64 && s < 0.68);
  if (band) return { top: [250, 248, 240], bot: [250, 248, 240] };
  if (edge || s > 0.97) return flat(BLACK);
  return { top: ORANGE, bot: ORANGE2 };
};
export function drawClown(soup, f, pose) {
  const m = bodyMatrix(pose.x, pose.y, pose.z, pose.yaw, 0, 0, pose.size);
  tube(soup, (s, o) => { o.x = 0; o.y = 0; o.z = 0.15 - 0.3 * s; }, (s) => { const r = prof(CL_BODY, s); return [r * 0.8, r * 1.1]; }, 12, 6, m, { ring: clownRing });
  const sw = 0.03 * Math.sin(pose.beat);
  tube(soup, (s, o) => { o.x = sw * s; o.y = 0; o.z = -0.14 - 0.12 * s; }, (s) => [0.006, 0.02 + 0.045 * s], 4, 4, m, { ring: (s) => (s > 0.85 ? flat(BLACK) : { top: ORANGE, bot: ORANGE2 }) }); // the tail
  tube(soup, (s, o) => { o.x = 0; o.y = 0.065 - 0.012 * s; o.z = 0.06 - 0.17 * s; }, (s) => [0.005, 0.03 * Math.sin(Math.PI * (0.1 + 0.8 * s)) + 0.004], 4, 4, m, flat(ORANGE)); // the back fin
  for (const sx of [-1, 1]) {
    ellipsoid(soup, m, sx * 0.045, 0.025, 0.1, 0.014, 0.014, 0.014, flat(DARK), 3, 5);
    paddle(soup, m, [sx * 0.05, -0.02, 0.04], [sx * 0.1, -0.05 + 0.015 * Math.sin(pose.beat * 0.7 + sx), -0.01], 0.03, 0.005, flat(ORANGE), 3, 4);
  }
}

// ---- the seahorses ----------------------------------------------------------------------------------------------------------
const HORSE_COL = { gold: { top: [236, 178, 56], bot: [250, 226, 150] }, orange: { top: [236, 120, 52], bot: [250, 196, 140] }, peach: { top: [240, 150, 130], bot: [252, 220, 200] } };
export function drawHorse(soup, h, pose) {
  const col = { ...HORSE_COL[h.tone], spots: 0.18, seed: h.id };
  const m = bodyMatrix(pose.x, pose.y, pose.z, pose.yaw, 0, pose.sway, 0.85);
  tube(soup, (s, o) => { o.x = 0; o.y = 0.24 - 0.34 * s; o.z = 0.07 + 0.06 * Math.sin(Math.PI * Math.min(1, s * 0.9)); }, (s) => [0.05 + 0.02 * Math.sin(Math.PI * s), 0.05 + 0.025 * Math.sin(Math.PI * s)], 8, 6, m, col); // the trunk, belly forward
  ellipsoid(soup, m, 0, 0.27, 0.13, 0.055, 0.05, 0.065, col, 4, 6); // the head
  tube(soup, (s, o) => { o.x = 0; o.y = 0.265 - 0.04 * s; o.z = 0.17 + 0.1 * s; }, (s) => [0.02 - 0.006 * s, 0.02 - 0.006 * s], 3, 5, m, col); // the snout
  ellipsoid(soup, m, 0, 0.325, 0.11, 0.018, 0.026, 0.026, col, 3, 5); // the crown
  for (const sx of [-1, 1]) ellipsoid(soup, m, sx * 0.04, 0.285, 0.145, 0.016, 0.016, 0.016, flat(DARK), 3, 5);
  paddle(soup, m, [0, 0.12, 0.03], [0.012 * Math.sin(pose.fin), 0.19, -0.03], 0.03 + 0.012 * Math.sin(pose.fin * 1.3), 0.004, flat(mix(col.top, [255, 255, 255], 0.3)), 3, 4); // the fin that flutters
  const wind = 0.4 + 0.75 * pose.hold; // the tail wraps the stalk once and a bit; it unwinds when it lets go
  tube(soup, (s, o) => {
    const a = Math.PI / 2 + s * TAU * wind; const r = 0.075 - 0.02 * s;
    o.x = r * Math.cos(a); o.z = r * Math.sin(a); o.y = -0.1 - 0.2 * s;
  }, (s) => { const r = 0.03 - 0.02 * s; return [r, r]; }, 12, 4, m, col);
}

// ---- the mantas -------------------------------------------------------------------------------------------------------------
const MANTA_COL = { top: [40, 62, 78], bot: [242, 238, 228] };
export function drawManta(soup, mt, pose) {
  const m = bodyMatrix(pose.x, pose.y, pose.z, pose.yaw, 0, pose.roll, pose.size);
  const f = pose.flap;
  ellipsoid(soup, m, 0, 0, 0.1, 0.75, 0.17, 1.15, MANTA_COL, 5, 9);
  for (const sx of [-1, 1]) {
    const y1 = 1.4 * f * sx * sx; const y2 = y1 + 1.0 * f - 0.15;
    paddle(soup, m, [sx * 0.4, 0, 0.3], [sx * 1.7, y1, -0.1], 0.7, 0.05, MANTA_COL, 4, 6);
    paddle(soup, m, [sx * 1.7, y1, -0.1], [sx * 3.0, y2, -0.55], 0.4, 0.035, MANTA_COL, 4, 6);
    paddle(soup, m, [sx * 0.22, 0, 1.0], [sx * 0.3, -0.05, 1.6], 0.07, 0.03, MANTA_COL, 3, 5); // the head fins
    ellipsoid(soup, m, sx * 0.33, 0.07, 0.9, 0.04, 0.04, 0.04, flat(DARK), 3, 5);
  }
  tube(soup, (s, o) => { o.x = 0.12 * Math.sin(1.4 * pose.flap * 4 + 3 * s) * s; o.y = 0; o.z = -1.0 - 2.4 * s; }, (s) => { const r = 0.04 * (1 - s) + 0.005; return [r, r]; }, 5, 4, m, MANTA_COL);
}

// ---- the whale ---------------------------------------------------------------------------------------------------------------
const WH_BODY = [[0, 0.02], [0.02, 0.5], [0.1, 0.88], [0.25, 1.08], [0.45, 1.05], [0.65, 0.74], [0.82, 0.4], [0.94, 0.2], [1, 0.08]];
const WH_COL = { top: [86, 116, 146], bot: [216, 226, 232] };
export function drawWhale(soup, w, pose) {
  const m = bodyMatrix(pose.x, pose.y, pose.z, pose.yaw, pose.pitch, pose.roll, pose.size);
  const beat = pose.beat;
  const flex = (s) => (s > 0.45 ? ((s - 0.45) / 0.55) ** 2 : 0);
  const spine = (s, o) => { o.x = 0; o.y = 0.35 * flex(s) * Math.sin(beat - 2.4 * s); o.z = 3.5 - 7 * s; };
  tube(soup, spine, (s) => { const r = prof(WH_BODY, s); return [r * 0.97, r]; }, 18, 10, m, WH_COL);
  const tail = {}; spine(1, tail);
  for (const sx of [-1, 1]) {
    ellipsoid(soup, m, sx * 0.96, 0.08, 2.2, 0.12, 0.14, 0.12, flat(DARK), 3, 6); // an eye, big and soft
    ellipsoid(soup, m, sx * 1.02, 0.12, 2.26, 0.04, 0.04, 0.04, flat(WHITE), 3, 4);
    tube(soup, (u, o) => { // the smile: along the head's side, its far end turned up
      const s = 0.025 + u * 0.16; const r = prof(WH_BODY, s); const y = -0.34 + 0.3 * u * u;
      o.x = sx * r * 0.97 * Math.sqrt(Math.max(0.02, 1 - (y / r) ** 2)) * 1.01; o.y = y; o.z = 3.5 - 7 * s;
    }, () => [0.03, 0.03], 7, 3, m, flat([40, 52, 66]));
    paddle(soup, m, [sx * 0.9, -0.55, 1.1], [sx * 1.9, -1.1 + 0.1 * Math.sin(beat * 0.5 + sx), 0.2], 0.28, 0.05, WH_COL, 4, 6); // a flipper
    paddle(soup, m, [0, tail.y, tail.z + 0.15], [sx * 1.15, tail.y + 0.1 * Math.sin(beat - 2.6), tail.z - 0.75], 0.5, 0.06, WH_COL, 4, 6); // a fluke
  }
}

// ---- the squid --------------------------------------------------------------------------------------------------------------------
export function drawSquid(soup, q, pose, t) {
  const m = bodyMatrix(pose.x, pose.y, pose.z, pose.yaw, pose.pitch, 0, 1);
  const col = { top: pose.tone, bot: mix(pose.tone, WHITE, 0.45) };
  const sq = 1 - 0.22 * pose.jet;
  tube(soup, (s, o) => { o.x = 0; o.y = 0; o.z = -0.05 + 0.6 * s; }, (s) => { const r = prof([[0, 0.07], [0.35, 0.1], [0.8, 0.075], [1, 0.015]], s); return [r * sq, r * sq]; }, 8, 6, m, col);
  ellipsoid(soup, m, 0, 0, -0.12, 0.075, 0.07, 0.08, col, 3, 6);
  for (const sx of [-1, 1]) {
    ellipsoid(soup, m, sx * 0.07, 0.01, -0.1, 0.028, 0.028, 0.028, flat(DARK), 3, 5);
    paddle(soup, m, [sx * 0.04, 0, 0.42], [sx * 0.18, 0, 0.53], 0.07, 0.01, col, 3, 5); // a fin
  }
  for (let i = 0; i < 5; i++) { // arms: streaming behind in the jet, loose in the glide
    const a = ((i - 2) / 2) * 0.9; const sp = 0.4 + 0.2 * pose.jet;
    tube(soup, (s, o) => { o.x = Math.sin(a) * 0.05 * (1 + 2.2 * s * (1 - pose.jet)) + 0.02 * s * Math.sin(2.5 * t + i + 4 * s); o.y = Math.cos(a) * 0.04 - 0.02 * s * (1 - pose.jet); o.z = -0.17 - sp * s; }, (s) => { const r = 0.016 * (1 - 0.8 * s) + 0.003; return [r, r]; }, 4, 3, m, col);
  }
}

// ---- the eels ---------------------------------------------------------------------------------------------------------------------
const EEL_COL = { top: [170, 150, 70], bot: [236, 220, 160], spots: 0.25 };
export function drawEel(soup, e, pose, groundY) {
  const m = frameMatrix(e.x, groundY(e.x, e.z), e.z, e.yaw);
  const col = { ...EEL_COL, seed: e.id };
  const sp = { x: 0, y: 0, z: 0, r: 0 };
  tube(soup, (s, o) => { eelSpine(e, pose, s, sp); o.x = sp.x; o.y = sp.y; o.z = sp.z; }, (s) => { eelSpine(e, pose, s, sp); return [sp.r, sp.r * 1.05]; }, 10, 7, m, col);
  const h = eelSpine(e, pose, 1, {});
  ellipsoid(soup, m, h.x, h.y + 0.02, h.z + 0.1, 0.15, 0.13, 0.23, col, 5, 8); // the head
  const open = 1 - 0.9 * pose.blink;
  for (const sx of [-1, 1]) {
    ellipsoid(soup, m, h.x + sx * 0.1, h.y + 0.1, h.z + 0.16, 0.05, 0.05 * open, 0.05, flat(DARK), 3, 6); // a big eye
    ellipsoid(soup, m, h.x + sx * 0.108, h.y + 0.12, h.z + 0.2, 0.014, 0.014 * open, 0.014, flat(WHITE), 3, 4);
    tube(soup, (u, o) => { // the smile: along the head's side, its back end curled up
      const z = 0.3 - 0.4 * u; const y = -0.05 + (0.02 + 0.07 * pose.grin) * u * u;
      const rz = 0.23; const dz = z - 0.1; const wx = 0.15 * Math.sqrt(Math.max(0.02, 1 - (dz / rz) ** 2 - ((y - 0.02) / 0.13) ** 2));
      o.x = h.x + sx * wx * 1.04; o.y = h.y + y; o.z = h.z + z;
    }, () => [0.012, 0.012], 6, 3, m, flat([60, 36, 30]));
  }
}
