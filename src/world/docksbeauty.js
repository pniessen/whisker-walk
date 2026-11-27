import { hash01 } from './docksdressing.js';

// The Old Docks beauty round (docs/beauty-backlog.md DCK-1 and DCK-2). Nothing
// here is a mesh of its own: docksBeautyParts hands back flat painted
// triangles ({ pos, col }) that glintMesh in docksdressing.js folds into the
// existing docksGlints mesh (flat, noCast, faint emissive), so the docks gain
// no mesh and no draw. It draws nothing from Math.random (hash01 only).
//   * DCK-1: pale sun glints on the canal, thin slivers lying along the
//     water, and a warm reflection streak under each quayside lamp;
//   * DCK-2: a worn, warmed ring of stone under every lamp, where the lantern
//     pool falls at dusk (render/dusk.js adds the light itself, additively).
// The slivers are static, so they hold still under reduced motion by
// construction.

// The canal runs east-west, |z| < 3.5 (docks.js CANAL_HALF); the plane is at
// y 0.04, so water glints ride at 0.056, still under the 0.05 thickness cap
// the glint test measures from the lowest wet patch.
const WATER_Y = 0.056, RING_Y = 0.022;
const CANAL_HALF = 3.5;
const LAMPS_NEAR_CANAL = [-28, -12, 4, 22];
const GLINT_HEX = [0xdbe8f2, 0xc4d8e8, 0xeaf2f6];
const LAMP_REFLECT_HEX = [0xf0d49a, 0xe4c288];
const RING_HEX = [0x4e463a, 0x453e34];
const OIL_HEX = [0x2a2a30];

function tri(out, a, b, c, y, hex) {
  const col = hexRgb(hex);
  for (const [x, z] of [a, b, c]) {
    out.pos.push(x, y, z);
    out.col.push(col[0], col[1], col[2]);
  }
}
function hexRgb(hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }

// A thin quad-sliver (two triangles) lying along the x axis (or a slight
// heading), tapered at both ends.
function sliver(out, cx, cz, half, w, yaw, y, hex) {
  const ux = Math.cos(yaw), uz = Math.sin(yaw);
  const tipA = [cx + ux * half, cz + uz * half], tipB = [cx - ux * half, cz - uz * half];
  const sA = [cx - uz * w, cz + ux * w], sB = [cx + uz * w, cz - ux * w];
  tri(out, tipA, sB, tipB, y, hex);
  tri(out, tipA, tipB, sA, y, hex);
}

function canalGlints(out) {
  // a loose grid of slivers, kept off the two quay edges and the bridges
  for (let x = -42; x < 42; x += 3.1) {
    for (let k = 0; k < 3; k++) {
      const h = (s) => hash01(x, k, s);
      if (h(900) < 0.4) continue;
      const cx = x + (h(901) - 0.5) * 2.4;
      const cz = (k - 1) * 2.0 + (h(902) - 0.5) * 0.8;
      if (Math.abs(cz) > CANAL_HALF - 0.6) continue;
      const half = 0.3 + 0.4 * h(903);
      const hex = GLINT_HEX[Math.floor(h(904) * GLINT_HEX.length) % GLINT_HEX.length];
      sliver(out, cx, cz, half, 0.028 + 0.02 * h(905), (h(906) - 0.5) * 0.22, WATER_Y, hex);
      // a short companion off to one side, the way ripples catch light in pairs
      if (h(907) > 0.55) sliver(out, cx + half * 0.6, cz + 0.16, half * 0.45, 0.016, 0.05, WATER_Y, hex);
    }
  }
}

// A broken warm column on the water below a lamp: it runs from the near bank
// toward mid-canal, in short dashes that thin out, the way a lamp breaks up on
// a rippled surface. Lamps stand at z +-8, so the north lamp reflects on the
// north half.
function lampReflections(out) {
  for (const lx of LAMPS_NEAR_CANAL) {
    for (const side of [-1, 1]) {
      for (let d = 0; d < 5; d++) {
        const h = (s) => hash01(lx + side, d, s);
        const z = side * (CANAL_HALF - 0.7 - d * 0.5);
        const x = lx + (h(910) - 0.5) * 0.5;
        const half = 0.4 - d * 0.05 + 0.06 * h(911);
        sliver(out, x, z, half, 0.045 - d * 0.005, (h(912) - 0.5) * 0.2, WATER_Y + 0.001,
          LAMP_REFLECT_HEX[d % LAMP_REFLECT_HEX.length]);
      }
    }
  }
}

// Eight lamp posts stand on the cobbles (the quayside ones at z +-8, the
// alley and map-edge ones). A worn 8-gon ring, warmer and paler than the
// cobble, and a small dark oil stain at the foot of the post.
function lampRings(out, lamps) {
  for (const [x, z] of lamps) {
    const rim = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = 0.6 + 0.2 * hash01(x, z, 920 + i);
      rim.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
    }
    for (let i = 0; i < 8; i++) {
      tri(out, [x, z], rim[(i + 1) % 8], rim[i], RING_Y, RING_HEX[i % RING_HEX.length]);
    }
    const oil = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const rr = 0.2 + 0.1 * hash01(x, z, 940 + i);
      oil.push([x + 0.1 + Math.cos(a) * rr, z + 0.08 + Math.sin(a) * rr]);
    }
    for (let i = 0; i < 5; i++) tri(out, [x + 0.1, z + 0.08], oil[(i + 1) % 5], oil[i], RING_Y + 0.002, OIL_HEX[0]);
  }
}

export function docksBeautyParts(lamps) {
  const out = { pos: [], col: [] };
  canalGlints(out);
  lampReflections(out);
  lampRings(out, lamps);
  return out;
}
