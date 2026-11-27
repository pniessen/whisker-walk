import * as THREE from 'three';
import { hash01 } from './warehouselook.js';

// =============================================================================
// THE ROOFTOPS BEAUTY ROUND (ROF-2): what grows and settles on a flat roof.
// Moss and lichen creeping in from the edges, grit and leaf drifts in the
// corners, pigeon splashes, a few weed tufts at the parapets and, on the roofs
// she can climb to, clumps of pot plants in terracotta, grey and blue pots.
// All of it is small, flat or low, put into the alley kit noCast paint
// bucket: no new mesh, no caster, no draw. Placed by hash01 only (never
// Math.random) and only where the one roof is the ground (clear).
// roofs.js hands in its own helpers, so this file imports nothing from it.
// =============================================================================

const MOSS = Object.freeze([0x4f6b3a, 0x5d7a41, 0x6b8447, 0x44603a, 0x8c9150]); // green, and one ochre lichen
const GRIT = Object.freeze([0x6a645a, 0x7a6f5c, 0x5e5a52]);
const LEAF = Object.freeze([0x8a6a38, 0x9a7a3c, 0x6e5530, 0x7d4a2c]);
const SPLASH = 0xd9d6cc;
const POTS = Object.freeze([0xb4623c, 0xa5573a, 0x8c8e92, 0x4f6d93, 0xc27a4c]);
const GREENS = Object.freeze([0x3f6b35, 0x4e7d3c, 0x5c8c43, 0x35603a]);
const BLOOMS = Object.freeze([0xd04a4a, 0xe8c63c, 0xf0ece0, 0xd980a8, 0x9a6ac8]);

// how many of each a roof gets, by its id or the prefix of it
const POT_ROOFS = Object.freeze({ flatHouse: 2, roofTerrace: 2, cornerShop: 3, warehouse: 4, garages: 2, ext: 0, dormer: 1 });
const keyOf = (r) => (r.id in POT_ROOFS ? r.id : r.id.split('-')[0]);

// A point on the roof margin: s along its perimeter (0..1), `in` metres inside.
function onMargin(r, s, inside) {
  const [W, D] = [r.x1 - r.x0, r.z1 - r.z0];
  const t = s * 2 * (W + D);
  if (t < W) return [r.x0 + t, r.z0 + inside, 0, 1];
  if (t < W + D) return [r.x1 - inside, r.z0 + (t - W), -1, 0];
  if (t < 2 * W + D) return [r.x1 - (t - W - D), r.z1 - inside, 0, -1];
  return [r.x0 + inside, r.z1 - (t - 2 * W - D), 1, 0];
}

function blob(x, y, z, n, rx, rz, turn, seed) {
  const pos = [];
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.6 * (hash01(seed, k, 131) - 0.5)) / n) * 2 * Math.PI;
    const [u, v] = [rx * Math.cos(a) * (0.8 + 0.4 * hash01(seed, k, 133)), rz * Math.sin(a)];
    pts.push([x + u * Math.cos(turn) - v * Math.sin(turn), y, z + u * Math.sin(turn) + v * Math.cos(turn)]);
  }
  for (let k = 1; k + 1 < n; k++) pos.push(...pts[0], ...pts[k + 1], ...pts[k]); // faces up
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function leafCone(x, y, z, h, w, lean, yaw, seed) {
  const g = new THREE.ConeGeometry(w, h, 3, 1, true);
  g.translate(0, h / 2, 0);
  g.rotateZ(lean);
  g.rotateY(yaw + hash01(seed, 1, 137));
  g.translate(x, y, z);
  return g;
}

function potClump(put, x, y, z, seed) {
  const pot = POTS[Math.floor(hash01(seed, 2, 139) * POTS.length)];
  const [h, rt, rb] = [0.2 + 0.1 * hash01(seed, 3, 141), 0.13 + 0.04 * hash01(seed, 4, 143), 0.09];
  const body = new THREE.CylinderGeometry(rt, rb, h, 6, 1, true);
  body.translate(x, y + h / 2, z);
  put(body, pot);
  const green = GREENS[Math.floor(hash01(seed, 5, 147) * GREENS.length)];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + hash01(seed, k, 149);
    const lean = 0.35 + 0.5 * hash01(seed, k, 151);
    put(leafCone(x + Math.cos(a) * 0.03, y + h, z + Math.sin(a) * 0.03, 0.22 + 0.16 * hash01(seed, k, 153), 0.035, lean, a, seed + k), green);
  }
  if (hash01(seed, 6, 155) < 0.7) {
    const bloom = BLOOMS[Math.floor(hash01(seed, 7, 157) * BLOOMS.length)];
    for (let k = 0; k < 2; k++) {
      const a = hash01(seed, k, 159) * Math.PI * 2;
      const d = 0.03 + 0.07 * hash01(seed, k, 161);
      const b = new THREE.TetrahedronGeometry(0.04, 0);
      b.translate(x + Math.cos(a) * d, y + h + 0.3 + 0.1 * hash01(seed, k, 163), z + Math.sin(a) * d);
      put(b, bloom);
    }
  }
}

function weedTuft(put, x, y, z, seed) {
  for (let k = 0; k < 3; k++) {
    const a = ((k - 1) * 0.8) + hash01(seed, k, 165);
    put(leafCone(x, y, z, 0.16 + 0.12 * hash01(seed, k, 167), 0.02, 0.3 + 0.2 * hash01(seed, k, 169), a, seed + k), GREENS[Math.abs(seed + k) % GREENS.length]);
  }
}

// `roofs`: the flat BLOCKS; `put(geo, color)`: into the paint bucket;
// `clear(roof, x, z, r, avoid)`: roofs.js feltClear; `avoid`: its keep-out list.
export function roofsBeauty({ roofs, put, clear, avoid }) {
  const made = [];
  for (const r of roofs) {
    const [W, D] = [r.x1 - r.x0, r.z1 - r.z0];
    if (W < 3 || D < 3 || r.id === 'lanternStage' || r.id === 'belfry') continue;
    const per = 2 * (W + D);
    const taken = [];
    const ok = (x, z, rad) => !taken.some((p) => Math.hypot(p[0] - x, p[1] - z) < p[2] + rad) && clear(r, x, z, rad + 0.05, avoid);
    const claim = (x, z, rad) => { taken.push([x, z, rad]); return true; };
    const seed0 = r.x0 * 1.7 + r.z0 * 2.3 + r.id.length;
    // moss and lichen creeping in from the margin
    const mossN = Math.max(2, Math.min(9, Math.round(per / 7)));
    for (let i = 0; i < mossN; i++) {
      const s = hash01(seed0, i, 171);
      const [x, z] = onMargin(r, s, 0.25 + 0.35 * hash01(seed0, i, 173));
      const rad = 0.22 + 0.3 * hash01(seed0, i, 175);
      if (!ok(x, z, rad)) continue;
      claim(x, z, rad);
      const col = MOSS[Math.floor(hash01(seed0, i, 177) * MOSS.length)];
      put(blob(x, r.y + 0.011, z, 6, rad, rad * 0.6, hash01(seed0, i, 179) * 3, seed0 + i), col);
      put(blob(x + rad * 0.2, r.y + 0.013, z, 4, rad * 0.5, rad * 0.35, hash01(seed0, i, 181) * 3, seed0 + 9 + i), MOSS[(Math.floor(hash01(seed0, i, 177) * MOSS.length) + 1) % MOSS.length]);
      made.push('moss');
    }
    // out on the open felt: moss and lichen where water stands, a drift of grit or leaves
    const openN = Math.min(36, Math.floor((W * D) / 16));
    for (let i = 0; i < openN; i++) {
      const x = r.x0 + 0.8 + (W - 1.6) * hash01(seed0, i, 213);
      const z = r.z0 + 0.8 + (D - 1.6) * hash01(seed0, i, 215);
      const rad = 0.4 + 0.55 * hash01(seed0, i, 217);
      if (!ok(x, z, rad)) continue;
      claim(x, z, rad);
      if (i % 3 === 2) {
        for (let k = 0; k < 4; k++) {
          const q = 2.4 * Math.PI * hash01(seed0, i * 7 + k, 219);
          put(blob(x + Math.cos(q) * rad * 0.6, r.y + 0.012, z + Math.sin(q) * rad * 0.6, 4, 0.09, 0.06, q, seed0 + 60 + k), LEAF[(i + k) % LEAF.length]);
        }
      } else {
        const m = Math.floor(hash01(seed0, i, 221) * MOSS.length);
        put(blob(x, r.y + 0.011, z, 7, rad, rad * 0.7, hash01(seed0, i, 223) * 3, seed0 + 80 + i), MOSS[m]);
        put(blob(x - rad * 0.25, r.y + 0.013, z + rad * 0.1, 5, rad * 0.5, rad * 0.4, hash01(seed0, i, 225) * 3, seed0 + 100 + i), MOSS[(m + 1) % MOSS.length]);
      }
      made.push('open');
    }
    // grit and leaf drifts in the corners
    for (let c = 0; c < 4; c++) {
      if (hash01(seed0, c, 183) < 0.4) continue;
      const [cx, cz] = [c % 2 ? r.x1 - 0.3 : r.x0 + 0.3, c < 2 ? r.z0 + 0.3 : r.z1 - 0.3];
      for (let k = 0; k < 3; k++) {
        const x = cx + (c % 2 ? -1 : 1) * 0.35 * hash01(seed0, c * 5 + k, 185);
        const z = cz + (c < 2 ? 1 : -1) * 0.35 * hash01(seed0, c * 5 + k, 187);
        const rad = 0.08 + 0.1 * hash01(seed0, c * 5 + k, 189);
        if (!ok(x, z, rad)) continue;
        claim(x, z, rad);
        const leaf = k > 0 || hash01(seed0, c, 191) < 0.5;
        const col = leaf ? LEAF[Math.floor(hash01(seed0, c + k, 193) * LEAF.length)] : GRIT[k % GRIT.length];
        put(blob(x, r.y + 0.012, z, leaf ? 4 : 5, rad, rad * 0.7, hash01(seed0, c * 5 + k, 195) * 3, seed0 + c * 5 + k), col);
        made.push('litter');
      }
    }
    // pigeon splashes
    const splashN = Math.max(2, Math.round(per / 14));
    for (let i = 0; i < splashN; i++) {
      const [x, z] = onMargin(r, hash01(seed0, i, 197), 0.5 + 1.2 * hash01(seed0, i, 199));
      if (!ok(x, z, 0.14)) continue;
      claim(x, z, 0.12);
      put(blob(x, r.y + 0.014, z, 5, 0.1 + 0.06 * hash01(seed0, i, 201), 0.05, hash01(seed0, i, 203) * 3, seed0 + 31 + i), SPLASH);
      made.push('splash');
    }
    // weed tufts at the parapet
    const weedN = Math.round(per / 22);
    for (let i = 0; i < weedN; i++) {
      const [x, z] = onMargin(r, hash01(seed0, i, 205), 0.12);
      if (!ok(x, z, 0.1)) continue;
      claim(x, z, 0.1);
      weedTuft(put, x, r.y, z, Math.floor(seed0 * 7) + i);
      made.push('weed');
    }
    // pot-plant clumps, on the roofs she climbs to
    const pots = POT_ROOFS[keyOf(r)] ?? 0;
    let planted = 0;
    for (let j = 0; j < 40 && planted < pots; j++) {
      const [x, z, nx, nz] = onMargin(r, hash01(seed0, j, 207), 0.45 + 0.2 * hash01(seed0, j, 209));
      if (!ok(x, z, 0.5)) continue;
      claim(x, z, 0.5);
      const n = 1 + Math.floor(hash01(seed0, j, 211) * 2);
      for (let k = 0; k < n; k++) {
        const along = (k - (n - 1) / 2) * 0.3;
        potClump(put, x - nz * along, r.y, z + nx * along, Math.floor(seed0 * 11) + j * 5 + k);
        made.push('pot');
      }
      planted++;
    }
  }
  return made;
}
