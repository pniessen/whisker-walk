// =============================================================================
// THE REEF, THE SEALAB: THE DRAWING (milestone R13). Everything vertex-coloured, no texture, no canvas, no Math.random, no clock; every number is
// reeflabplan.js's. Meshes (each flagged noMerge, noCast and noContactShadow, so the walk's sweeps leave them be):
//   lab:walls    the rooms' wall faces, ONE mesh with a material per room (the life shows only her room's faces: a wall seen from the next room would
//                stand between the camera and her), faces looking in only (from behind a wall the camera sees through it)
//   lab:fixtures the floor, ceiling beams, furniture, the dome's frame, the crew's wetsuits on their hooks, the tank frames
//   lab:detail   small things (rivets, mugs, books, charts): the lower rungs leave it undrawn
//   lab:glow     lamps, portholes' soft blue glow, the panel's blinking cells, the three empty fuse sockets (unlit vertex colour)
//   lab:glass    the tanks' water-blue panes and the dome's panes and crown: the real Reef shows through
//   lab:roof     the ceiling (it casts no shadow: the roof must not darken the rooms)
//   lab:hull     the building seen from OUTSIDE (shown only while she is outside)
//   lab:hatch    the round hatch beside the Sunken Boat, with its short ladder (an outside prop, always shown)
// plus ONE PointLight (intensity 0 until she is inside: the Reef never has a second). The inside meshes are in the group 'lab:interior'.
// =============================================================================

import * as L from './reeflabplan.js';

// three and the merge are handed in by the Reef (reef.js, through register): a stage chunk that imported them itself would take three out of start-up's file
// into a chunk of its own, and one that imported them from the Reef's drawing file would split that file off the Reef's chunk (a build rule, test/lazybuild.test.js).
let THREE = null;
let mergeGeometries = null;
let _c = null;
export function useKit(kit) {
  THREE = kit.THREE;
  mergeGeometries = kit.mergeGeometries;
  _c = new THREE.Color();
}

export const COL = Object.freeze({
  cream: 0xf0e2c0, teal: 0x4fa6a0, tealDark: 0x2f6f73, brass: 0xc99a3a, navy: 0x2e4a52, deckA: 0xdccfb0, deckB: 0x9fc9c4, wood: 0x9a7348, woodDark: 0x6e5034,
  blue: 0x3b7fc4, yellow: 0xf2c53d, glass: 0x8fd4ee, paper: 0xefe9d6, ceiling: 0xe9dfc6, lamp: 0xffe2a8, porthole: 0x9fe0ff, led: 0xffd27a, ledB: 0x7ee8c8,
  socket: 0x1d3a42, hull: 0x3f8f90, hullDark: 0x2c6468, domeOut: 0xa7dcea,
});
// the wall faces' bands: wainscot, middle, top trim
const BANDS = Object.freeze([[0, 1.0, COL.teal], [1.0, 3.6, COL.cream], [3.6, 4.5, COL.tealDark]]);

// A geometry made flat-shaded and vertex-coloured (non-indexed, with normals and uv, so every part merges).
function tone(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// A box standing on y (its bottom), centred on (x, z), turned ry.
const bx = (w, h, d, x, y, z, hex, ry = 0) => tone(new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y + h / 2, z), hex);
const cy = (rt, rb, h, x, y, z, hex, seg = 8) => tone(new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(x, y + h / 2, z), hex);
// A flat disc looking `face` ('n' looks toward -z, 's' +z, 'e' +x, 'w' -x, 'u' up, 'd' down), middle at (x, y, z).
const FACE = Object.freeze({ n: [Math.PI, 0, 0], s: [0, 0, 0], e: [0, Math.PI / 2, 0], w: [0, -Math.PI / 2, 0], u: [-Math.PI / 2, 0, 0], d: [Math.PI / 2, 0, 0] });
function disc(r, x, y, z, face, hex, seg = 14) {
  const g = new THREE.CircleGeometry(r, seg);
  const [rx, ry] = FACE[face];
  g.rotateX(rx); g.rotateY(ry);
  return tone(g.translate(x, y, z), hex);
}
function plate(w, h, x, y, z, face, hex) {
  const g = new THREE.PlaneGeometry(w, h);
  const [rx, ry] = FACE[face];
  g.rotateX(rx); g.rotateY(ry);
  return tone(g.translate(x, y, z), hex);
}

// ---- the walls: quads looking toward their room -------------------------------------------------------------------------------------------------
// One wall quad from (x0, z0) to (x1, z1), y0 to y1, its front toward (tx, tz) (a point in the room).
function wallQuad(x0, z0, x1, z1, y0, y1, tx, tz, hex, lift = 0) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  let nx = -dz / len;
  let nz = dx / len;
  if ((tx - (x0 + x1) / 2) * nx + (tz - (z0 + z1) / 2) * nz < 0) { nx = -nx; nz = -nz; }
  const g = new THREE.PlaneGeometry(len, y1 - y0);
  g.rotateY(Math.atan2(nx, nz));
  g.translate((x0 + x1) / 2 + nx * lift, (y0 + y1) / 2, (z0 + z1) / 2 + nz * lift);
  return tone(g, hex);
}
const mid = (id) => { const r = L.ROOMS[id]; return r.kind === 'circle' ? [r.x, r.z] : [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2]; };

function wallGeometry(roomId, rivets) {
  const [tx, tz] = mid(roomId);
  const parts = [];
  for (const w of L.wallLines()) {
    if (!w.rooms.includes(roomId)) continue;
    const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
    const n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i < n; i++) {
      const a = i / n;
      const b = (i + 1) / n;
      const px = (t) => w.x0 + (w.x1 - w.x0) * t;
      const pz = (t) => w.z0 + (w.z1 - w.z0) * t;
      BANDS.forEach(([y0, y1, hex], k) => {
        const shade = (i + k) % 2 ? 0.94 : 1; // the panels alternate a little
        _c.setHex(hex).multiplyScalar(shade);
        parts.push(wallQuad(px(a), pz(a), px(b), pz(b), y0, y1, tx, tz, _c.getHex()));
      });
      // brass trim along the band joins, one quad each
      for (const y of [1.0, 3.6]) parts.push(wallQuad(px(a), pz(a), px(b), pz(b), y - 0.03, y + 0.03, tx, tz, COL.brass, 0.012));
      for (const y of [1.0, 3.6]) rivets.push(rivet(px(b), y, pz(b), tx, tz));
    }
  }
  return parts;
}
// A brass rivet: a tiny four-sided cone standing off the wall toward the room's middle.
function rivet(x, y, z, tx, tz) {
  const d = Math.hypot(tx - x, tz - z) || 1;
  const nx = (tx - x) / d;
  const nz = (tz - z) / d;
  const g = new THREE.ConeGeometry(0.05, 0.06, 4).rotateX(Math.PI / 2).rotateY(Math.atan2(nx, nz)).translate(x + nx * 0.03, y, z + nz * 0.03);
  return tone(g, COL.brass);
}
// the dome's ring: a solid sill, then glass (the glass mesh)
const DOME_SILL = 0.9;
const DOME_WALL = 3.2;
const DOME_RISE = 3.7; // the crown's height over the wall's top (the ceiling is LAB_DOME_CEIL)
function ringQuads(r0, y0, y1, hex, inward, steps = 24) {
  const d = L.ROOMS.dome;
  const out = [];
  for (let k = 0; k < steps; k++) {
    const a0 = (k / steps) * Math.PI * 2;
    const a1 = ((k + 1) / steps) * Math.PI * 2;
    const x0 = d.x + Math.cos(a0) * r0;
    const z0 = d.z + Math.sin(a0) * r0;
    const x1 = d.x + Math.cos(a1) * r0;
    const z1 = d.z + Math.sin(a1) * r0;
    out.push(wallQuad(x0, z0, x1, z1, y0, y1, inward ? d.x : d.x + (x0 - d.x) * 3, inward ? d.z : d.z + (z0 - d.z) * 3, hex, 0));
  }
  return out;
}

// ---- the furniture and rooms ---------------------------------------------------------------------------------------------------------------------
// [x, z, face, y] of each porthole (a brass ring with a soft blue glow) on a wall, the face the way it looks into the room.
const PORTHOLES = Object.freeze([
  [7.6, -34.95, 's', 2.1], [9.4, -34.95, 's', 2.1], [-0.15, -33.6, 'e', 2.1], [-0.15, -36.5, 'e', 2.1], [2.0, -39.15, 's', 2.0], [6.4, -39.15, 's', 2.0],
  [18.15, -37.1, 'w', 2.0], [11.0, -35.05, 'n', 2.1], [12.2, -39.15, 's', 3.1], [16.0, -39.15, 's', 3.1],
]);
const LAMPS = Object.freeze([[2.4, -32.4], [6.6, -32.6], [8.8, -32.0], [11.7, -32.4], [3.4, -37.1], [6.2, -37.1], [8.1, -37.1], [11.2, -37.2], [14.0, -37.1], [17.0, -37.1]]);

function fixtures() {
  const f = [];
  const D = [];
  // floors: a 1 m checker of warm deck and sea-green tiles, 2 cm over the sand
  for (const id of ['control', 'bunk', 'aquarium', 'hall1', 'hall2']) {
    const r = L.ROOMS[id];
    for (let x = Math.floor(r.minX); x < r.maxX; x++) for (let z = Math.floor(r.minZ); z < r.maxZ; z++) {
      const x0 = Math.max(x, r.minX);
      const x1 = Math.min(x + 1, r.maxX);
      const z0 = Math.max(z, r.minZ);
      const z1 = Math.min(z + 1, r.maxZ);
      if (x1 - x0 < 0.01 || z1 - z0 < 0.01) continue;
      f.push(plate(x1 - x0, z1 - z0, (x0 + x1) / 2, 0.02, (z0 + z1) / 2, 'u', (x + z) & 1 ? COL.deckA : COL.deckB));
    }
  }
  const d = L.ROOMS.dome;
  f.push(disc(d.r, d.x, 0.02, d.z, 'u', COL.deckB, 24), disc(d.r * 0.62, d.x, 0.025, d.z, 'u', COL.deckA, 24), disc(d.r * 0.22, d.x, 0.03, d.z, 'u', COL.brass, 12));
  // ceiling beams (teal, hanging 10 cm) over the rooms
  for (let x = 2; x < 18; x += 3.2) for (const [z0, z1, mn, mx] of [[-35, -29.8, -0.2, 10.2], [-39.2, -35, -0.2, 7.4], [-39.2, -35, 8.8, 18.2]]) {
    if (x > mn && x < mx) f.push(bx(0.22, 0.12, z1 - z0, x, L.LAB_CEIL - 0.12, (z0 + z1) / 2, COL.tealDark));
  }
  // the control room: the panel wall (a console and an upright panel), the big chart table, the hatch's ladder
  f.push(bx(5.6, 0.9, 0.75, 6.9, 0, -30.18, COL.tealDark), bx(5.8, 0.08, 0.85, 6.9, 0.9, -30.15, COL.brass));
  f.push(bx(5.6, 1.7, 0.3, 6.9, 0.98, -29.95, COL.navy), bx(5.8, 0.1, 0.34, 6.9, 2.68, -29.95, COL.brass));
  for (const k of L.FUSE_SOCKETS) f.push(tone(new THREE.RingGeometry(0.11, 0.17, 10).rotateX(Math.PI).translate(k.x, k.y, k.z - 0.115), COL.brass)); // the three empty fuse sockets
  f.push(bx(2.8, 0.08, 1.3, 4.6, 0.85, -32.6, COL.woodDark), bx(2.5, 0.02, 1.0, 4.6, 0.93, -32.6, COL.paper));
  for (const [dx, dz] of [[-1.3, -0.55], [1.3, -0.55], [-1.3, 0.55], [1.3, 0.55]]) f.push(bx(0.1, 0.85, 0.1, 4.6 + dx, 0, -32.6 + dz, COL.wood));
  f.push(bx(0.7, 0.05, 0.5, 5.4, 0.95, -32.5, COL.teal, 0.3)); // a clipboard on the chart
  for (const dz of [-0.3, 0.3]) f.push(bx(0.06, 4.5, 0.06, 0.04, 0, L.HATCH.inside.ladder.z + dz, COL.brass)); // the ladder's two rails
  for (let y = 0.35; y < 4.4; y += 0.38) f.push(bx(0.05, 0.05, 0.66, 0.04, y, L.HATCH.inside.ladder.z, COL.brass));
  f.push(disc(0.7, 0.55, L.LAB_CEIL - 0.01, L.HATCH.inside.ladder.z, 'd', COL.brass, 16), disc(0.5, 0.55, L.LAB_CEIL - 0.015, L.HATCH.inside.ladder.z, 'd', COL.navy, 16));
  // the bunk room: two double bunks along the north wall, the galley counter and table, the record player's cabinet, the crew's wetsuits on hooks, the log shelf
  for (const x of [1.5, 3.4]) {
    for (const [dx, dz] of [[-0.85, -0.45], [0.85, -0.45], [-0.85, 0.45], [0.85, 0.45]]) f.push(bx(0.07, 1.7, 0.07, x + dx, 0, -38.65 + dz, COL.wood));
    for (const y of [0.35, 1.25]) f.push(bx(1.7, 0.14, 0.95, x, y, -38.65, COL.woodDark), bx(1.6, 0.14, 0.85, x, y + 0.14, -38.65, y < 1 ? COL.blue : COL.teal));
    f.push(bx(0.45, 0.1, 0.3, x - 0.55, 0.42, -38.65, COL.cream), bx(0.45, 0.1, 0.3, x - 0.55, 1.32, -38.65, COL.cream));
  }
  f.push(bx(2.6, 0.9, 0.7, 5.8, 0, -38.85, COL.wood), bx(2.7, 0.06, 0.78, 5.8, 0.9, -38.85, COL.cream), bx(0.7, 0.04, 0.45, 6.3, 0.96, -38.85, COL.navy));
  f.push(cy(0.5, 0.5, 0.06, 5.4, 0.72, -36.0, COL.woodDark, 12), cy(0.07, 0.07, 0.72, 5.4, 0, -36.0, COL.wood, 6));
  for (const sx of [-0.78, 0.78]) f.push(cy(0.2, 0.2, 0.08, 5.4 + sx, 0.4, -36.0, COL.teal, 8), cy(0.04, 0.04, 0.4, 5.4 + sx, 0, -36.0, COL.wood, 5));
  f.push(bx(0.6, 0.8, 0.6, 0.55, 0, -35.9, COL.wood), bx(0.5, 0.07, 0.5, 0.55, 0.8, -35.9, COL.cream), cy(0.2, 0.2, 0.03, 0.55, 0.87, -35.9, COL.navy, 12));
  for (const z of [-37.5, -36.85, -36.2]) { // a matching blue-and-yellow wetsuit on each hook (the crew's), hanging flat to the west wall
    f.push(bx(0.1, 0.06, 0.14, 0.0, 1.95, z, COL.brass));
    f.push(bx(0.16, 0.62, 0.42, 0.05, 1.28, z, COL.blue), bx(0.17, 0.62, 0.1, 0.05, 1.28, z, COL.yellow), bx(0.16, 0.1, 0.26, 0.05, 1.86, z, COL.yellow));
    for (const dz of [-0.12, 0.12]) f.push(bx(0.15, 0.72, 0.16, 0.05, 0.56, z + dz, COL.blue), bx(0.16, 0.72, 0.04, 0.05, 0.56, z + dz, COL.yellow));
    for (const dz of [-0.31, 0.31]) f.push(bx(0.13, 0.5, 0.12, 0.05, 1.34, z + dz, COL.blue));
  }
  f.push(bx(1.7, 1.9, 0.34, 5.9, 0, -35.18, COL.wood), bx(1.6, 0.04, 0.3, 5.9, 0.62, -35.2, COL.woodDark), bx(1.6, 0.04, 0.3, 5.9, 1.24, -35.2, COL.woodDark));
  // the aquarium hall: three big tanks along the north wall (a cabinet, a brass frame and a light bar; the panes are the glass mesh), a bench
  for (const t of L.TANKS) {
    f.push(bx(t.w + 0.1, 0.8, t.d + 0.08, t.x, 0, t.z, COL.navy));
    for (const sx of [-1, 1]) f.push(bx(0.08, 1.8, 0.08, t.x + sx * (t.w / 2), 0.8, t.z + 0.3, COL.brass));
    f.push(bx(t.w + 0.1, 0.08, t.d, t.x, 0.8, t.z, COL.brass), bx(t.w + 0.1, 0.1, t.d, t.x, 2.6, t.z, COL.brass), bx(t.w, 0.04, 0.02, t.x, 2.55, t.z + 0.31, COL.brass));
    f.push(bx(t.w - 0.2, 0.05, t.d - 0.1, t.x, 0.88, t.z, 0xe8d6a8)); // the tank's sand
  }
  f.push(bx(2.8, 0.45, 0.5, 11.4, 0, -35.3, COL.wood), bx(2.7, 0.1, 0.46, 11.4, 0.45, -35.3, COL.teal));
  // the dome: a bench curving round its south side, twelve mullions (the glass's frame) and a brass ring at the wall's top
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * (0.22 + 0.56 * (k / 8));
    f.push(bx(0.72, 0.42, 0.5, d.x + Math.cos(a) * 2.05, 0, d.z + Math.sin(a) * 2.05, COL.wood, -a + Math.PI / 2), bx(0.7, 0.1, 0.46, d.x + Math.cos(a) * 2.05, 0.42, d.z + Math.sin(a) * 2.05, COL.teal, -a + Math.PI / 2));
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    f.push(bx(0.07, DOME_WALL - DOME_SILL, 0.07, d.x + Math.cos(a) * (d.r - 0.03), DOME_SILL, d.z + Math.sin(a) * (d.r - 0.03), COL.brass));
  }
  f.push(tone(new THREE.TorusGeometry(d.r - 0.03, 0.05, 3, 24).rotateX(Math.PI / 2).translate(d.x, DOME_WALL, d.z), COL.brass));
  f.push(tone(new THREE.TorusGeometry(d.r - 0.03, 0.06, 3, 24).rotateX(Math.PI / 2).translate(d.x, DOME_SILL, d.z), COL.brass));
  // door frames: a brass post either side of every doorway
  for (const o of L.DOORS) {
    for (const s of [-1, 1]) {
      const x = o.axis === 'x' ? o.x + (s * o.w) / 2 : o.x;
      const z = o.axis === 'z' ? o.z + (s * o.w) / 2 : o.z;
      f.push(bx(0.14, 3.2, 0.14, x, 0, z, COL.brass));
    }
  }
  // the detail mesh: mugs, books, charts, a record, cells
  {
    for (const [x, y, z] of [[5.1, 0.96, -38.9], [6.0, 0.96, -38.7], [5.35, 0.78, -35.9], [5.55, 0.78, -36.1], [4.2, 0.93, -32.4]]) D.push(cy(0.05, 0.045, 0.09, x, y, z, COL.yellow, 8));
    for (let i = 0; i < 12; i++) D.push(bx(0.1, 0.24 + (i % 3) * 0.04, 0.2, 5.2 + i * 0.12, 0.64, -35.22, [COL.blue, COL.teal, COL.yellow, 0xd8503c][i % 4]));
    for (let i = 0; i < 12; i++) D.push(bx(0.1, 0.24 + (i % 4) * 0.03, 0.2, 5.2 + i * 0.12, 1.26, -35.22, [COL.yellow, 0xd8503c, COL.teal, COL.blue][i % 4]));
    D.push(bx(0.5, 0.09, 0.09, 3.6, 0.94, -32.9, COL.paper), bx(0.7, 0.01, 0.01, 4.4, 0.95, -32.1, COL.navy));
    for (const t of L.TANKS) for (const sx of [-0.8, 0, 0.8]) D.push(cy(0.15, 0.2, 0.16, t.x + sx, 0.93, t.z, 0x9a8a60, 5));
    for (const x of [2.6, 4.2, 5.8]) D.push(bx(0.5, 0.06, 0.25, x, 1.08, -29.7, COL.paper)); // charts pinned up
    f.push(cy(0.04, 0.04, 0.5, 15.6, 0, -34.2, COL.brass, 5)); // a lamp post at the dome's door
  }
  return { f, D };
}

function glow() {
  const g = [];
  for (const [x, z] of LAMPS) g.push(disc(0.28, x, L.LAB_CEIL - 0.03, z, 'd', COL.lamp, 12));
  g.push(disc(0.5, 15.6, DOME_WALL + DOME_RISE - 0.8, L.ROOMS.dome.z, 'd', COL.lamp, 12)); // a lamp up in the dome's top
  for (const [x, z, face, y] of PORTHOLES) { g.push(disc(0.3, x + (face === 'e' ? 0.01 : face === 'w' ? -0.01 : 0), y, z + (face === 's' ? 0.01 : face === 'n' ? -0.01 : 0), face, COL.porthole, 14)); }
  const start = g.reduce((n, q) => n + q.attributes.position.count, 0);
  for (const p of L.PANEL_LIGHTS) g.push(plate(0.2, 0.14, p.x, p.y, p.z, 'n', COL.led));
  for (const s of L.FUSE_SOCKETS) g.push(disc(0.1, s.x, s.y, s.z - 0.12, 'n', COL.socket, 10));
  for (const t of L.TANKS) g.push(bx(t.w - 0.2, 0.05, 0.12, t.x, 2.52, t.z + 0.25, COL.porthole));
  return { parts: g, led: { start, verts: 6, count: L.PANEL_LIGHTS.length } };
}
// the portholes' brass rings (in the fixtures: a torus facing the room)
function portholeRings() {
  return PORTHOLES.map(([x, z, face, y]) => {
    const g = new THREE.RingGeometry(0.29, 0.36, 12);
    const [rx, ry] = FACE[face];
    g.rotateX(rx); g.rotateY(ry);
    return tone(g.translate(x + (face === 'e' ? 0.02 : face === 'w' ? -0.02 : 0), y, z + (face === 's' ? 0.02 : face === 'n' ? -0.02 : 0)), COL.brass);
  });
}

function glass() {
  const g = [];
  for (const t of L.TANKS) g.push(bx(t.w - 0.1, 1.7, t.d - 0.1, t.x, 0.85, t.z, 0x6ec9e8));
  const d = L.ROOMS.dome;
  g.push(...ringQuads(d.r - 0.02, DOME_SILL, DOME_WALL, COL.glass, true));
  const crown = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(d.r - 0.03, DOME_RISE, d.r - 0.03).translate(d.x, DOME_WALL, d.z);
  g.push(tone(crown, COL.glass));
  return g;
}

function roof() {
  const g = [];
  for (const id of ['control', 'bunk', 'aquarium', 'hall1', 'hall2']) {
    const r = L.ROOMS[id];
    g.push(plate(r.maxX - r.minX, r.maxZ - r.minZ, (r.minX + r.maxX) / 2, L.LAB_CEIL, (r.minZ + r.maxZ) / 2, 'd', COL.ceiling));
  }
  return g;
}

// ---- the building from outside --------------------------------------------------------------------------------------------------------------------
function hull() {
  const b = L.LAB_BUILD;
  const w = b.maxX - b.minX;
  const dp = b.maxZ - b.minZ;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const g = [bx(w, 4.4, dp, cx, -0.6, cz, COL.hull), bx(w + 0.06, 1.1, dp + 0.06, cx, -0.6, cz, COL.hullDark), bx(w + 0.1, 0.12, dp + 0.1, cx, 3.74, cz, COL.brass), bx(w - 0.8, 0.8, dp - 0.8, cx, 3.8, cz, COL.cream)];
  // portholes in rows along the north and south faces and the west end, a door-sized brass hatch plate and some rivets
  for (let x = 1.5; x < 18; x += 2.4) { g.push(disc(0.28, x, 2.3, b.minZ - 0.01, 'n', COL.porthole), tone(new THREE.RingGeometry(0.27, 0.35, 12).rotateX(Math.PI).translate(x, 2.3, b.minZ - 0.02), COL.brass)); }
  for (let x = 1.5; x < 11; x += 2.4) { g.push(disc(0.28, x, 2.3, b.maxZ + 0.01, 's', COL.porthole), tone(new THREE.RingGeometry(0.27, 0.35, 12).translate(x, 2.3, b.maxZ + 0.02), COL.brass)); }
  for (const z of [-37.5, -34.5, -31.5]) { g.push(disc(0.28, b.minX - 0.01, 2.3, z, 'w', COL.porthole), tone(new THREE.RingGeometry(0.27, 0.35, 12).rotateY(-Math.PI / 2).translate(b.minX - 0.02, 2.3, z), COL.brass)); }
  const d = L.ROOMS.dome;
  g.push(tone(new THREE.CylinderGeometry(d.r + 0.1, d.r + 0.1, 0.3, 24).translate(d.x, 4.4, d.z), COL.brass));
  g.push(tone(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(d.r, DOME_RISE + 0.1, d.r).translate(d.x, DOME_WALL + 0.9, d.z), COL.domeOut));
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.push(bx(0.07, 2.4, 0.07, d.x + Math.cos(a) * (d.r - 0.02), 3.3, d.z + Math.sin(a) * (d.r - 0.02), COL.brass)); }
  g.push(cy(0.05, 0.07, 2.4, 3.0, 4.5, -37.0, COL.navy, 6), cy(0.12, 0.12, 0.2, 3.0, 6.9, -37.0, COL.lamp, 8)); // a little mast with a lamp
  g.push(cy(0.35, 0.35, 0.6, 7.0, 4.5, -35.0, COL.navy, 8), cy(0.38, 0.38, 0.08, 7.0, 5.1, -35.0, COL.brass, 8));
  return g;
}

// The round hatch beside the Sunken Boat: a brass collar on the seabed, a lit disc below its rim, the lid swung back, and a short ladder to the rim. Unlit
// vertex colour (it must read from a distance in the water's fog).
function hatch(reefY) {
  const h = L.HATCH.outside;
  const y = reefY(h.x, h.z);
  const g = [];
  g.push(tone(new THREE.CylinderGeometry(h.r - 0.05, h.r + 0.05, 0.4, 16, 1, true).translate(h.x, y + 0.2, h.z), COL.brass));
  g.push(tone(new THREE.TorusGeometry(h.r, 0.08, 3, 16).rotateX(Math.PI / 2).translate(h.x, y + 0.4, h.z), COL.tealDark));
  g.push(disc(h.r - 0.08, h.x, y + 0.12, h.z, 'u', COL.lamp, 16), disc(h.r * 0.55, h.x, y + 0.13, h.z, 'u', 0xfff4d0, 12));
  const lid = new THREE.CircleGeometry(h.r + 0.05, 16).rotateX(-Math.PI / 2).rotateZ(1.25).translate(h.x - h.r - 0.35, y + 0.55, h.z);
  g.push(tone(lid, COL.tealDark));
  for (const sx of [-0.28, 0.28]) g.push(tone(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 5).translate(h.x + sx, y + 0.45, h.z + h.r - 0.18), COL.brass));
  for (const k of [0.25, 0.5, 0.75]) g.push(tone(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 5).rotateZ(Math.PI / 2).translate(h.x, y + k * 0.9, h.z + h.r - 0.18), COL.brass));
  return g;
}

// ---- the materials and the build -------------------------------------------------------------------------------------------------------------------
// Warm and never dark: a lit vertex-coloured material that also glows a little of its own (emissive), so a room is dim at its dimmest and never black.
export function labMaterials() {
  const lit = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, emissive: 0x4a3620, emissiveIntensity: 0.7, ...extra });
  return {
    paint: lit(),
    wall: () => lit(),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    glass: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }),
    roof: lit({ emissiveIntensity: 0.55 }),
    hull: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
    hatch: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  };
}

const FLAGS = Object.freeze({ noCast: true, noContactShadow: true, noMerge: true });
function meshOf(parts, mat, name) {
  const m = new THREE.Mesh(mergeGeometries(parts), mat);
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = false;
  m.frustumCulled = false;
  Object.assign(m.userData, FLAGS);
  return m;
}

// buildLab(scene, reefY) -> { interior, hull, hatch, light, walls, glow, led (the blinking cells' vertex range in the glow mesh), ... }: adds the meshes to the scene (the interior and the hull hidden/shown by the life).
export function buildLab(scene, reefY) {
  const M = labMaterials();
  const fx = fixtures();
  const interior = new THREE.Group();
  interior.name = 'lab:interior';
  interior.visible = false;
  interior.position.y = L.LAB_FLOOR_Y; // every height inside is over the floor
  // the walls: one geometry per room, merged with groups so each room has its own material (the life switches them)
  const rivets = [];
  const wallGeos = L.ROOM_IDS.map((id) => {
    const parts = wallGeometry(id, rivets);
    parts.push(...(id === 'dome' ? ringQuads(L.ROOMS.dome.r - 0.01, 0, DOME_SILL, COL.teal, true) : []));
    return parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
  });
  const walls = new THREE.Mesh(mergeGeometries(wallGeos.filter((g) => g.attributes.position), true), L.ROOM_IDS.filter((id, i) => wallGeos[i].attributes.position).map(() => M.wall()));
  walls.name = 'lab:walls';
  walls.frustumCulled = false;
  Object.assign(walls.userData, FLAGS, { rooms: L.ROOM_IDS.filter((id, i) => wallGeos[i].attributes.position) });
  const fixtureMesh = meshOf([...fx.f, ...portholeRings()], M.paint, 'lab:fixtures');
  const detailMesh = meshOf([...fx.D, ...rivets], M.paint, 'lab:detail');
  const gl = glow();
  const glowMesh = meshOf(gl.parts, M.glow, 'lab:glow');
  glowMesh.userData.led = gl.led;
  const glassMesh = meshOf(glass(), M.glass, 'lab:glass');
  glassMesh.renderOrder = 3;
  const roofMesh = meshOf(roof(), M.roof, 'lab:roof');
  interior.add(walls, fixtureMesh, detailMesh, glowMesh, glassMesh, roofMesh);
  const hullMesh = meshOf(hull(), M.hull, 'lab:hull');
  hullMesh.position.y = L.LAB_FLOOR_Y;
  const hatchMesh = meshOf(hatch(reefY), M.hatch, 'lab:hatch');
  scene.add(interior, hullMesh, hatchMesh);
  // ONE real light, made now at intensity 0 so the shader's light count never changes mid-walk; the life raises it while she is inside
  const light = new THREE.PointLight(0xffd9a8, 0, 13, 1.6);
  light.name = 'lab:light';
  light.castShadow = false;
  light.position.set(2.4, L.LAB_FLOOR_Y + 3.0, -32.4);
  scene.add(light);
  return { interior, walls, fixtures: fixtureMesh, detail: detailMesh, glow: glowMesh, glass: glassMesh, roof: roofMesh, hull: hullMesh, hatch: hatchMesh, light, led: gl.led };
}
