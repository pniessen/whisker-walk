// Holiday decor in five places (H6; docs/superpowers/specs/2026-11-27-holiday-merch-design.md D17 to D19, D21).
// A LAZY chunk: walk.js imports it only while a holiday window is open and the Settings choice is not Off, so outside the
// season nothing here is loaded or built. Look-and-find only: no colliders, no prompts, no text, no perches.
//
// Per place, everything is merged: ONE solid mesh (wreaths, stockings, trees, menorah bodies, dreidels, the stall) and ONE glow
// mesh (the steady light bulbs, the candle flames, the tree lights; a basic material, so it reads lit by day and by dusk). So a
// place pays two draws (the Old House four: its parlour's pair, and the menorah on the sill, which rides the sinking wall).
// Positions are hand-placed data (holidayspots.js); only colours and the tiny bow tilt come from the decor's own seeded stream
// (never walkRng, never Math.random), so no other draw moves and two co-walkers see the same place.
//
// Equal care for both holidays (D1, D18): Christmas gives the wreaths, trees and stockings; Hanukkah the menorahs (nine lights,
// the shamash set higher, one more candle lit each night by nightOf, left to right) and the dreidel-and-gelt stall; Winter
// Lights the steady strings of lights that show whenever any of them is on. No Star of David, no cross, no figure, no text.
// Reduced motion freezes the glow; a slow pulse under 1 Hz otherwise; the low rungs draw fewer bulbs and no pulse.
// The few three.js classes this drawing needs are handed in by the walk (bind, below) and never imported here: a chunk that
// imports `three` itself makes the bundler split three.core out of the start-up bundle, which costs a kilobyte of start-up for a
// chunk the walk fetches only in a season. (Handing in the whole namespace would defeat tree-shaking: 35 kB. Only these.)
let THREE = null;
export const NEEDS = Object.freeze(['BufferGeometry', 'BufferAttribute', 'BoxGeometry', 'ConeGeometry', 'CylinderGeometry', 'OctahedronGeometry', 'TorusGeometry', 'Mesh', 'MeshStandardMaterial', 'MeshBasicMaterial', 'Group']);
// `classes` are those, in NEEDS order (an array: the names are not repeated in the start-up bundle)
export function bind(classes) { THREE = Object.fromEntries(NEEDS.map((k, i) => [k, classes[i]])); }
import { activeHolidays, nightOf } from '../holidays.js';
import { NEIGHBORHOOD, PARK, FARM, MARKET, MARKET_STALLS, HOUSE, SNOWVILLE } from './holidayspots.js';

// The places that dress (Snowville too since H8: a lit tree in the square, wreaths on the cabin windows, a menorah on a cabin sill).
export const DECOR_PLACES = Object.freeze(['neighborhood', 'house', 'market', 'farm', 'park', 'snowville']);

// Which holidays the decor shows now: { christmas, hanukkah, night } or null (nothing in a window, or Off). `pick` is the
// Settings choice; a chosen holiday that is not in its window falls back to Automatic, as the home flair does.
export function decorSet(pick = 'auto', now = new Date(), opts = {}) {
  if (pick === 'off') return null;
  const on = activeHolidays(now, opts);
  if (!on.length) return null;
  let christmas = on.includes('christmas');
  let hanukkah = on.includes('hanukkah');
  if (pick === 'christmas' && christmas) hanukkah = false;
  else if (pick === 'hanukkah' && hanukkah) christmas = false;
  return { christmas, hanukkah, night: hanukkah ? nightOf(now, opts) : 0 };
}

// Merge non-indexed parts that carry position, normal and color: plain concatenation (no BufferGeometryUtils, so this chunk
// shares nothing with the start-up bundle but three and the leaf modules).
function mergeGeometries(parts) {
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const out = { position: new Float32Array(n * 3), normal: new Float32Array(n * 3), color: new Float32Array(n * 3) };
  let at = 0;
  for (const g of parts) {
    for (const k of ['position', 'normal', 'color']) out[k].set(g.attributes[k].array, at * 3);
    at += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) geo.setAttribute(k, new THREE.BufferAttribute(out[k], 3));
  return geo;
}

// This stream (the same two functions as src/rng.js, copied: a chunk that imports a start-up module the bundler also shares
// with other chunks gets that module split out of the start-up bundle) and the local uuid swap of world/localuuids.js.
function seedFromCode(code) {
  let h = 0x811c9dc5;
  for (const ch of code.toUpperCase()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function withLocalUuids(key, fn) {
  const real = Math.random;
  Math.random = mulberry32(seedFromCode(key));
  try { return fn(); } finally { Math.random = real; }
}

// ---- the colours ----
const GREEN = [0x2f7a4a, 0x3a8a58, 0x2a6a40];
const RED = 0xc23a3a, GOLD = 0xe0b040, WHITE = 0xf4efe4, SILVER = 0xb9c6d8, BLUE = 0x2f5fa8, WIRE = 0x30463a;
const MENORAH_BLUE = 0x4f72ac; // a deep blue-silver: reads against a pale window and the lawn alike
const BULBS_CHRISTMAS = [0xff5a4a, 0xffc84a, 0x7be07b, 0xffe9a8];
const BULBS_HANUKKAH = [0x6aa8ff, 0xf4f8ff, 0xb9d4ff, 0x4f86e0];
const BULBS_WINTER = [0xffe9a8, 0xffc84a, 0xb9d4ff, 0xf4f8ff];
const FLAME = 0xffc247;

// sRGB 0xRRGGBB -> linear floats, as THREE.Color.setHex does under colour management
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const cr = lin((hex >> 16) & 255), cg = lin((hex >> 8) & 255), cb = lin(hex & 255);
  for (let i = 0; i < n; i++) { col[i * 3] = cr; col[i * 3 + 1] = cg; col[i * 3 + 2] = cb; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// The decor of one place: two part lists (solid, glow), and the record of every object put down (for the tests and the finds).
function makeKit() {
  const solid = [];
  const glow = [];
  const items = [];
  // A frame: local (lx, ly, lz) at world (x, y, z) turned by yaw, scaled by s.
  const at = (x, y, z, yaw = 0, s = 1) => {
    const put = (list, geo, hex, lx, ly, lz, tilt) => {
      if (tilt) geo.rotateZ(tilt);
      geo.scale(s, s, s);
      geo.translate(lx * s, ly * s, lz * s);
      if (yaw) geo.rotateY(yaw);
      geo.translate(x, y, z);
      list.push(paint(geo, hex));
    };
    const F = {
      box: (w, h, d, lx, ly, lz, hex, o = {}) => put(o.glow ? glow : solid, new THREE.BoxGeometry(w, h, d), hex, lx, ly, lz, o.tilt),
      cyl: (rt, rb, h, seg, lx, ly, lz, hex, o = {}) => put(o.glow ? glow : solid, new THREE.CylinderGeometry(rt, rb, h, seg), hex, lx, ly, lz, o.tilt),
      cone: (r, h, seg, lx, ly, lz, hex, o = {}) => {
        const g = new THREE.ConeGeometry(r, h, seg);
        if (o.down) g.rotateX(Math.PI);
        put(o.glow ? glow : solid, g, hex, lx, ly, lz);
      },
      bead: (r, lx, ly, lz, hex) => put(glow, new THREE.OctahedronGeometry(r, 0), hex, lx, ly, lz),
      ring: (r, tube, rs, ts, lx, ly, lz, hex) => put(solid, new THREE.TorusGeometry(r, tube, rs, ts), hex, lx, ly, lz),
    };
    return F;
  };
  return { solid, glow, items, at };
}

// ---- the pieces (each built in its own frame, facing local +z) ----

function wreath(kit, x, y, z, yaw, r = 0.27, sparse = false) {
  const F = kit.at(x, y, z, yaw);
  F.ring(r, r * 0.3, sparse ? 4 : 5, sparse ? 7 : 9, 0, 0, 0, GREEN[0]);
  F.box(r * 0.55, r * 0.2, r * 0.14, -r * 0.3, -r * 0.95, r * 0.25, RED, { tilt: 0.5 });
  F.box(r * 0.55, r * 0.2, r * 0.14, r * 0.3, -r * 0.95, r * 0.25, RED, { tilt: -0.5 });
  F.box(r * 0.2, r * 0.2, r * 0.18, 0, -r * 0.95, r * 0.28, RED);
  kit.items.push({ kind: 'wreath', x, y, z });
}

// A tree about 1.9 high at scale 1: trunk, three skirts, a star and a scatter of steady lights.
function tree(kit, x, y, z, yaw, s, rng, sparse, colors) {
  const F = kit.at(x, y, z, yaw, s);
  F.cyl(0.08, 0.1, 0.3, 5, 0, 0.15, 0, 0x6b4a2a);
  const skirts = [[0.62, 0.75, 0.62], [0.48, 0.7, 1.05], [0.34, 0.65, 1.45]];
  skirts.forEach(([r, h, cy], i) => F.cone(r, h, 7, 0, cy, 0, GREEN[i % 3]));
  const n = sparse ? 5 : 11;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const ang = i * 2.4 + rng() * 0.5;
    const cy = 0.45 + t * 1.15;
    const rad = 0.62 * (1 - (cy - 0.3) / 1.6) + 0.04;
    F.bead(0.05, Math.sin(ang) * rad, cy, Math.cos(ang) * rad, colors[i % colors.length]);
  }
  F.bead(0.1, 0, 1.86, 0, GOLD);
  kit.items.push({ kind: 'tree', x, y, z });
}

// Nine lights: the eight in a row with the shamash in the middle and higher. Lit from the left, one more each night; the
// shamash is lit from the first night. ~0.9 wide, ~0.55 high at scale 1.
export const MENORAH_SLOTS = Object.freeze([-4, -3, -2, -1, 0, 1, 2, 3, 4]); // 0 is the shamash
function menorah(kit, x, y, z, yaw, s, night) {
  const F = kit.at(x, y, z, yaw, s);
  F.box(0.6, 0.05, 0.22, 0, 0.025, 0, MENORAH_BLUE);
  F.box(0.08, 0.2, 0.08, 0, 0.15, 0, MENORAH_BLUE);
  F.box(0.92, 0.04, 0.06, 0, 0.26, 0, MENORAH_BLUE);
  F.box(0.06, 0.18, 0.06, 0, 0.35, 0, MENORAH_BLUE); // the shamash's pillar
  let lit = 0;
  MENORAH_SLOTS.forEach((slot) => {
    const cx = slot * 0.1;
    const top = slot === 0 ? 0.44 : 0.28;
    F.box(0.04, 0.13, 0.04, cx, top + 0.065, 0, WHITE);
    const on = slot === 0 ? night >= 1 : false;
    if (on) F.cone(0.03, 0.09, 4, cx, top + 0.175, 0, FLAME, { glow: true });
  });
  // the eight, left to right: the first `night` slots (never the middle one) carry a flame
  const eight = MENORAH_SLOTS.filter((q) => q !== 0);
  eight.forEach((slot, k) => {
    if (k < night) { lit++; F.cone(0.03, 0.09, 4, slot * 0.1, 0.28 + 0.175, 0, FLAME, { glow: true }); }
  });
  kit.items.push({ kind: 'menorah', x, y, z, night, lit, lights: MENORAH_SLOTS.length });
}

function stocking(kit, x, y, z, yaw, hex) {
  const F = kit.at(x, y, z, yaw);
  F.box(0.12, 0.26, 0.07, 0, -0.17, 0, hex);
  F.box(0.19, 0.09, 0.07, 0.035, -0.32, 0, hex);
  F.box(0.15, 0.07, 0.09, 0, -0.035, 0, WHITE);
  kit.items.push({ kind: 'stocking', x, y, z });
}

function dreidel(kit, x, y, z, yaw, s, hex) {
  const F = kit.at(x, y, z, yaw, s);
  F.box(0.1, 0.1, 0.1, 0, 0.15, 0, hex);
  F.cone(0.0707, 0.1, 4, 0, 0.05, 0, SILVER, { down: true });
  F.cyl(0.012, 0.012, 0.09, 4, 0, 0.245, 0, SILVER);
  kit.items.push({ kind: 'dreidel', x, y, z });
}
function gelt(kit, x, y, z, n, s = 1) {
  const F = kit.at(x, y, z, 0, s);
  for (let i = 0; i < n; i++) F.cyl(0.04, 0.04, 0.012, 6, (i % 2) * 0.012, 0.006 + i * 0.013, 0, GOLD);
  kit.items.push({ kind: 'gelt', x, y, z });
}

// A bauble about 0.22 high at scale 1: two cones base to base, a gold cap and a loop.
function ornament(kit, x, y, z, yaw, s, hex) {
  const F = kit.at(x, y, z, yaw, s);
  F.cone(0.11, 0.1, 8, 0, 0.05, 0, hex);
  F.cone(0.11, 0.1, 8, 0, -0.05, 0, hex, { down: true });
  F.cyl(0.035, 0.035, 0.05, 6, 0, 0.125, 0, GOLD);
  F.box(0.015, 0.05, 0.015, 0, 0.17, 0, GOLD);
  kit.items.push({ kind: 'ornament', x, y, z });
}

// A string of steady bulbs along a line from a to b, sagging by `sag` in the middle; n bulbs. The wire is a thin box per gap.
function string(kit, a, b, n, sag, rng, colors, sparse) {
  const bulbs = sparse ? Math.max(2, Math.ceil(n / 2)) : n;
  const F = kit.at(0, 0, 0);
  let prev = null;
  for (let i = 0; i <= bulbs; i++) {
    const t = i / bulbs;
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * Math.sin(Math.PI * t), a[2] + (b[2] - a[2]) * t];
    if (prev) {
      const dx = p[0] - prev[0], dy = p[1] - prev[1], dz = p[2] - prev[2];
      const len = Math.hypot(dx, dy, dz);
      const g = new THREE.BoxGeometry(len, 0.022, 0.022);
      g.rotateZ(Math.atan2(dy, Math.hypot(dx, dz)));
      g.rotateY(-Math.atan2(dz, dx));
      g.translate((p[0] + prev[0]) / 2, (p[1] + prev[1]) / 2, (p[2] + prev[2]) / 2);
      kit.solid.push(paint(g, WIRE));
    }
    if (i > 0 && i < bulbs) F.bead(0.1, p[0], p[1] - 0.06, p[2], colors[Math.floor(rng() * colors.length)]);
    prev = p;
  }
  kit.items.push({ kind: 'string', x: a[0], y: a[1], z: a[2] });
}

// ---- the places ----

const hash = (id) => mulberry32(seedFromCode(`holiday-decor-${id}`));
const bulbColors = (set) => [
  ...(set.christmas ? BULBS_CHRISTMAS : []),
  ...(set.hanukkah ? BULBS_HANUKKAH : []),
  ...(!set.christmas && !set.hanukkah ? BULBS_WINTER : []),
];

function neighborhood(kit, set, { rng, sparse }) {
  const colors = bulbColors(set);
  if (set.christmas) for (const [x, z] of NEIGHBORHOOD.doors) wreath(kit, x, NEIGHBORHOOD.doorY, z + 2.14, 0, 0.27, sparse);
  // steady lights along both rakes of two front gables (the bargeboards at z 2.27)
  for (const [x, z] of NEIGHBORHOOD.strings) {
    for (const sx of [-1, 1]) string(kit, [x + sx * 2.78, 2.74, z + 2.36], [x, 4.98, z + 2.36], 8, 0.12, rng, colors, sparse);
  }
  if (set.christmas) {
    const w = NEIGHBORHOOD.treeWindow;
    tree(kit, w.x + w.lx, 1.36, w.z + 2.12, 0, 0.45, rng, sparse, BULBS_CHRISTMAS);
  }
  if (set.hanukkah) {
    const w = NEIGHBORHOOD.menorahWindow;
    menorah(kit, w.x + w.lx, 1.36, w.z + 2.12, 0, 0.75, set.night);
  }
}

function park(kit, set, { rng, sparse }) {
  const colors = bulbColors(set);
  const R = PARK.ring;
  const n = sparse ? R.bulbs / 2 : R.bulbs;
  const F = kit.at(0, 0, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    F.bead(0.075, R.x + Math.cos(a) * R.r, R.y, R.z + Math.sin(a) * R.r, colors[i % colors.length]);
  }
  // a thin wire round the rim, eight short bars
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const g = new THREE.BoxGeometry(R.r * 0.78, 0.014, 0.014);
    g.rotateY(-(a + Math.PI / 2));
    g.translate(R.x + Math.cos(a) * R.r * 0.97, R.y - 0.03, R.z + Math.sin(a) * R.r * 0.97);
    kit.solid.push(paint(g, WIRE));
  }
  kit.items.push({ kind: 'ring', x: R.x, y: R.y, z: R.z, r: R.r });
  if (set.christmas) tree(kit, PARK.tree.x, 0, PARK.tree.z, 0, PARK.tree.s, rng, sparse, BULBS_CHRISTMAS);
  if (set.hanukkah) {
    const m = PARK.menorah;
    const F2 = kit.at(m.x, 0, m.z, m.yaw, m.s);
    F2.box(1.05, 0.12, 0.34, 0, 0.06, 0, 0x8a8a92); // a low stone plinth
    menorah(kit, m.x, 0.12 * m.s, m.z, m.yaw, m.s, set.night);
  }
}

function farm(kit, set, { rng, sparse }) {
  if (set.christmas) {
    const b = FARM.barn;
    wreath(kit, b.x, b.y, b.z, 0, b.r, sparse);
    tree(kit, FARM.tree.x, 0, FARM.tree.z, 0, FARM.tree.s, rng, sparse, BULBS_CHRISTMAS);
    const H = FARM.house;
    FARM.stockings.forEach((lx, i) => stocking(kit, H.x + 2.8, 2.3, H.z - lx, H.yaw, i % 2 ? 0x2f7a4a : RED));
  }
  if (set.hanukkah) {
    const H = FARM.house;
    menorah(kit, H.x + 2.12, 1.36, H.z - FARM.menorahLx, H.yaw, 0.75, set.night);
  }
}

// The awning's height at a stall's front middle (marketplan.js awningHeight with lx 0, lz = d/2 + front): 2.35 + 2.5 * (0.12 * -0.5 - 0.05).
const AWNING_FRONT_Y = 2.35 + 2.5 * (0.12 * -0.5 - 0.05);
function market(kit, set, { rng, sparse }) {
  if (set.christmas) {
    for (const [, sx, sz, fx, fz, , d] of MARKET_STALLS) {
      const lz = d / 2 + 0.47;
      wreath(kit, sx + fx * lz, AWNING_FRONT_Y - 0.28, sz + fz * lz, Math.atan2(fx, fz), 0.22, sparse);
    }
    tree(kit, MARKET.tree.x, 0, MARKET.tree.z, 0, MARKET.tree.s, rng, sparse, BULBS_CHRISTMAS);
  }
  if (set.hanukkah) dreidelStall(kit, set, rng, sparse);
}

// The dreidel-and-gelt stall: a counter, a striped blue-and-white awning, dreidels and stacks of gelt on the counter, a big
// dreidel for a sign, a small menorah with tonight's candles, a few steady bulbs under the awning. Decor only: nothing bought.
function dreidelStall(kit, set, rng, sparse) {
  const { x, z, yaw } = MARKET.stall;
  const F = kit.at(x, 0, z, yaw);
  F.box(2.0, 0.9, 0.7, 0, 0.45, 0, 0x3c5a8c);
  F.box(2.1, 0.05, 0.8, 0, 0.925, 0, WHITE);
  for (const sx of [-1, 1]) for (const pz of [-0.3, 0.5]) F.box(0.06, 2.2, 0.06, sx * 0.95, 1.1, pz, WHITE);
  for (let i = 0; i < 5; i++) F.box(0.44, 0.04, 1.0, -0.88 + 0.44 * i, 2.2, 0.05, i % 2 ? WHITE : BLUE, { tilt: 0 });
  kit.items.push({ kind: 'stall', x, y: 0, z });
  const spots = sparse ? [-0.6, 0.4] : [-0.7, -0.3, 0.1, 0.5];
  spots.forEach((lx, i) => dreidel(kit, ...world(x, z, yaw, lx, 0.95, 0.1), yaw, 1.3, i % 2 ? SILVER : BLUE));
  [-0.85, 0.75].forEach((lx) => gelt(kit, ...world(x, z, yaw, lx, 0.95, 0.15), 4));
  dreidel(kit, ...world(x, z, yaw, 0, 2.28, 0.05), yaw, 3, BLUE); // the sign
  menorah(kit, ...world(x, z, yaw, 0.1, 0.95, -0.12), yaw, 0.6, set.night);
  const F2 = kit.at(0, 0, 0);
  const n = sparse ? 3 : 6;
  for (let i = 0; i < n; i++) {
    const lx = -0.9 + (1.8 * (i + 0.5)) / n;
    const [wx, wy, wz] = world(x, z, yaw, lx, 2.1, 0.5);
    F2.bead(0.06, wx, wy, wz, BULBS_HANUKKAH[Math.floor(rng() * BULBS_HANUKKAH.length)]);
  }
}
// local (lx, ly, lz) of a frame at (x, z) turned by yaw -> world [x, y, z]
function world(x, z, yaw, lx, ly, lz) {
  return [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), ly, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
}

// Snowville: a lit tree in the square, a wreath on each cabin's left front window, a menorah on the baker's right sill, and a
// string of steady lights along the notice board. Cabins stand at their own yaw; world() lands local points like the village does.
function snowville(kit, set, { rng, sparse }) {
  const colors = bulbColors(set);
  if (set.christmas) {
    for (const [, cx, cz, yaw, w, d, h, dy] of SNOWVILLE.cabins) {
      const [wx, , wz] = world(cx, cz, yaw, -w * 0.32, 0, d / 2 + 0.1);
      wreath(kit, wx, h * 0.55 + dy, wz, yaw, 0.22, sparse);
    }
    const T = SNOWVILLE.tree;
    tree(kit, T.x, 0, T.z, 0, T.s, rng, sparse, BULBS_CHRISTMAS);
  }
  if (set.hanukkah) {
    const [, cx, cz, yaw, w, d, h, dy] = SNOWVILLE.cabins.find((c) => c[0] === SNOWVILLE.menorahCabin);
    const [wx, , wz] = world(cx, cz, yaw, w * 0.32, 0, d / 2 + 0.12);
    menorah(kit, wx, h * 0.55 - 0.34 + dy, wz, yaw, 0.55, set.night);
  }
  const B = SNOWVILLE.board;
  const a = world(B.x, B.z, B.yaw, -B.half, B.y, 0.22);
  const b = world(B.x, B.z, B.yaw, B.half, B.y, 0.22);
  string(kit, a, b, 7, 0.14, rng, colors, sparse);
}

// The Old House: stockings on the parlour's mantel and a small tree in its corner (one group, tagged for the level drawing so
// they show with the parlour), and a menorah on the sill of the parlour's south window, built apart (it rides the wall).
function house(kit, set, { rng, sparse }) {
  if (set.christmas) {
    const M = HOUSE.mantel;
    M.zs.forEach((zz, i) => stocking(kit, M.x, M.y, zz, M.yaw, i % 2 ? 0x2f7a4a : RED));
    tree(kit, HOUSE.tree.x, 0, HOUSE.tree.z, 0, HOUSE.tree.s, rng, sparse, BULBS_CHRISTMAS);
  }
}
function houseSill(kit, set, base) {
  const S = HOUSE.sill;
  if (set.hanukkah) menorah(kit, S.x, S.y - base, S.z, S.yaw, S.s, set.night);
}

const PLACES = { neighborhood, park, farm, market, house, snowville };

// The parts of one place, not yet meshes: { solid, glow, items } or null for a place that has no decor.
export function partsFor(areaId, set, { sparse = false, base = 0 } = {}) {
  const make = PLACES[areaId];
  if (!make || !set) return null;
  return withLocalUuids(`holiday-decor-uuids-${areaId}`, () => {
    const kit = makeKit();
    make(kit, set, { rng: hash(areaId), sparse });
    const sill = areaId === 'house' ? makeKit() : null;
    if (sill) houseSill(sill, set, base);
    return { solid: kit.solid, glow: kit.glow, items: kit.items, sill };
  });
}

function meshesOf(solid, glow, name, { reducedMotion, sparse }) {
  const out = [];
  if (solid.length) {
    const m = new THREE.Mesh(mergeGeometries(solid, false), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true }));
    m.name = `${name}Solid`;
    m.userData.noCast = true;
    m.userData.noMerge = true;
    m.userData.holidayDecor = true;
    out.push(m);
  }
  if (glow.length) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    const m = new THREE.Mesh(mergeGeometries(glow, false), mat);
    m.name = `${name}Glow`;
    m.userData.noCast = true;
    m.userData.noMerge = true;
    m.userData.holidayDecor = true;
    // steady, or a very slow swell (a 6 second period, a tenth of the brightness); nothing at all under reduced motion or on the low rungs
    if (!reducedMotion && !sparse) {
      m.onBeforeRender = () => { mat.color.setScalar(0.92 + 0.08 * Math.sin((performance.now() / 6000) * Math.PI * 2)); };
    }
    out.push(m);
  }
  for (const g of [...solid, ...glow]) g.dispose();
  return out;
}

// Dress a walk's place. Returns { meshes, items } or null. Never throws into the walk (the caller wraps it, too).
export function dress(areaId, scene, areaData, { pick = 'auto', now = new Date(), reducedMotion = false, sparse = false } = {}) {
  const set = decorSet(pick, now);
  if (!set || !PLACES[areaId]) return null;
  // every Object3D, geometry and material made here takes its uuid from a local stream, so no real Math.random draw moves
  return withLocalUuids(`holiday-decor-dress-${areaId}`, () => dressNow(areaId, scene, areaData, set, { reducedMotion, sparse }));
}

function dressNow(areaId, scene, areaData, set, { reducedMotion, sparse }) {
  const sectionId = areaId === 'house' ? HOUSE.sill.section : null;
  const wall = sectionId ? areaData?.house?.sectionMeshes?.get?.(sectionId) ?? null : null;
  const parts = partsFor(areaId, set, { sparse, base: wall ? wall.position.y : 0 });
  if (!parts) return null;
  const meshes = meshesOf(parts.solid, parts.glow, 'holiday', { reducedMotion, sparse });
  for (const m of meshes) {
    if (areaId === 'house') { // drawn with the parlour's level, never floating over another level
      m.userData.houseDetail = true;
      m.userData.houseLevel = 'ground';
      m.userData.houseRoom = 'parlour';
    }
    scene.add(m);
  }
  const items = [...parts.items];
  if (parts.sill && wall) {
    const sillMeshes = meshesOf(parts.sill.solid, parts.sill.glow, 'holidaySill', { reducedMotion, sparse });
    for (const m of sillMeshes) wall.add(m); // a child of the wall section, so it sinks and hides with its wall
    meshes.push(...sillMeshes);
    items.push(...parts.sill.items.map((i) => ({ ...i, y: i.y + wall.position.y })));
  }
  return { meshes, items, set };
}

// What the finds module (holidayfinds.js, the same chunk) draws with.
export const KIT = { makeKit, ornament, dreidel, gelt, meshesOf, withLocalUuids, mulberry32, seedFromCode, three: () => THREE, RED, GOLD, BLUE, SILVER, WHITE, GREEN };
