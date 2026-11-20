import * as THREE from 'three';
import { itemOwners } from './tilesplit.js';
import { createRuns } from './runs.js';

// =============================================================================
// Far stand-ins for streamed trees (bigger areas, step 2; the seam is
// described in world/streamcore.js).
//
// With the switch on, a tree is drawn in full only within the trees layer's
// range of the cat (world/strips.js LAYERS). Past it the tree is not simply
// gone: a STAND-IN takes its place, a few dozen triangles shaped from the
// tree's own built meshes, out to the fog.
//
// The shape. For each mesh of the tree (trunk, crown, a willow's curtain):
// its vertices in world space, cut into three height bands. Each band gives a
// ring of SIDES points, each pushed out as far as the mesh reaches in that
// direction in that band (a six-way convex outline: a two-lobed crown stays
// two-lobed, a pine stays a cone), coloured the band's mean colour (the
// material's colour times the vertex colours, so a crown's baked dark
// underside carries over). A point under the lowest ring and one over the
// highest close it. A trunk (a mesh much taller than it is wide) is a
// three-sided prism, and a curtain of thin strands (a willow's) is a flat
// blade a strand. About 40 to 70 triangles a tree, against 170 to 360.
//
// All stand-ins of an area are ONE mesh, one draw. Each tile's stand-ins are
// one run of its index; show(key, on) marks which runs are drawn and update()
// writes the drawn runs into the index buffer, front to back, once in a frame
// when something changed. No allocation after it is made.
//
// Small scatter has stand-ins too (proxiesOf): each reed clump, tussock,
// cattail or osier past the small layer's range is one three-sided spike,
// its own height, coloured its own lower and upper colour, as wide as its
// parts would look from afar (a quarter of their area, the mean shadow of a
// thin thing seen from any side). Three triangles for a reed clump's forty.
// Flat things (lily pads) have none: past the range they are a few pixels of
// water.
//
// They cast no shadow (shadows follow the cat to 20 m; a stand-in is past 60),
// sway in no wind and fade in no tree fade: none of that can be seen at the
// range they are drawn.
// =============================================================================

export const SIDES = 6;
// The three bands of a crown (fractions of its height) and where each ring
// sits in its band.
const BANDS = Object.freeze([[0, 0.3, 0.12], [0.3, 0.7, 0.5], [0.7, 1, 0.85]]);

const _v = new THREE.Vector3();
const _c = new THREE.Color();

// Every vertex of a mesh in world space, with its colour (linear).
function meshVertices(mesh) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const col = g.attributes.color;
  const mat = [].concat(mesh.material)[0];
  const useVc = !!(mat?.vertexColors && col);
  const base = mat?.color ?? _c.setRGB(1, 1, 1);
  const out = [];
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    const r = useVc ? col.getX(i) : 1, gg = useVc ? col.getY(i) : 1, b = useVc ? col.getZ(i) : 1;
    out.push({ x: _v.x, y: _v.y, z: _v.z, r: base.r * r, g: base.g * gg, b: base.b * b });
  }
  return out;
}

// One part's ring points and colours, written into `p` (a part builder).
function addLathe(p, verts, { sides, bands, caps }) {
  let minY = Infinity, maxY = -Infinity, cx = 0, cz = 0;
  for (const v of verts) { minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); cx += v.x; cz += v.z; }
  cx /= verts.length; cz /= verts.length;
  const h = maxY - minY;
  if (!(h > 1e-3)) return;
  const dirs = [];
  for (let k = 0; k < sides; k++) { const a = (k / sides) * Math.PI * 2; dirs.push([Math.cos(a), Math.sin(a)]); }
  const rings = [];
  for (const [lo, hi, at] of bands) {
    const reach = new Array(sides).fill(0);
    let r = 0, g = 0, b = 0, n = 0;
    for (const v of verts) {
      const f = (v.y - minY) / h;
      if (f < lo || f > hi) continue;
      const dx = v.x - cx, dz = v.z - cz;
      for (let k = 0; k < sides; k++) reach[k] = Math.max(reach[k], dx * dirs[k][0] + dz * dirs[k][1]);
      r += v.r; g += v.g; b += v.b; n++;
    }
    if (!n) continue;
    rings.push({ y: minY + h * at, reach, col: [r / n, g / n, b / n] });
  }
  if (!rings.length) return;
  const first = p.count;
  for (const ring of rings) {
    for (let k = 0; k < sides; k++) p.vertex(cx + dirs[k][0] * ring.reach[k], ring.y, cz + dirs[k][1] * ring.reach[k], ring.col);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      const a = first + i * sides + k, b = first + i * sides + k2;
      const c = first + (i + 1) * sides + k, d = first + (i + 1) * sides + k2;
      p.tri(a, c, b); p.tri(b, c, d);
    }
  }
  if (caps) {
    const bottom = p.vertex(cx, minY, cz, rings[0].col);
    const top = p.vertex(cx, maxY, cz, rings[rings.length - 1].col);
    const last = first + (rings.length - 1) * sides;
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      p.tri(bottom, first + k, first + k2);
      p.tri(top, last + k2, last + k);
    }
  }
}

/**
 * standInOf(object) -> { pos, nor, col, index } (plain arrays, world space)
 *
 * The stand-in of one built tree (a Group, merged or not), from its meshes.
 */
export function standInOf(object) {
  object.updateMatrixWorld(true);
  const pos = [], col = [], index = [];
  const p = {
    get count() { return pos.length / 3; },
    vertex(x, y, z, c) { pos.push(x, y, z); col.push(c[0], c[1], c[2]); return pos.length / 3 - 1; },
    tri(a, b, c) { index.push(a, b, c); },
  };
  const blades = builder();
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position || o.userData.contactDecal) return;
    // a curtain of strands: a blade a strand, not a solid skirt
    const tris = trianglesOf(o);
    const parts = partsOf(tris).map((q) => ({ q, m: measure(q) }));
    const thin = parts.filter((x) => x.m.thin);
    if (parts.length >= 4 && thin.length >= 0.8 * parts.length) {
      thin.forEach((x, i) => addBlade(blades, x.q, x.m, turnOf(x.m.minX + i, x.m.minZ)));
      return;
    }
    const verts = meshVertices(o);
    if (!verts.length) return;
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const v of verts) {
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
    }
    const wide = Math.max(maxX - minX, maxZ - minZ);
    const trunk = maxY - minY > 3 * wide;
    if (trunk) addLathe(p, verts, { sides: 3, bands: [[0, 0.2, 0], [0.8, 1, 1]], caps: false });
    else addLathe(p, verts, { sides: SIDES, bands: BANDS, caps: true });
  });
  // smooth normals, one per vertex, from the faces round it
  const nor = new Array(pos.length).fill(0);
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { nor[i * 3] += nx; nor[i * 3 + 1] += ny; nor[i * 3 + 2] += nz; }
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
  }
  const v0 = pos.length / 3;
  const b = blades.out;
  pos.push(...b.pos); nor.push(...b.nor); col.push(...b.col);
  for (const i of b.index) index.push(i + v0);
  return { pos, nor, col, index };
}

const FLAT = 0.12; // metres: anything lower than this has no far proxy

// The connected parts of a list of triangles (each [v0, v1, v2], a vertex
// { x, y, z, r, g, b } in world space): triangles that share a corner, to a
// tenth of a millimetre, are one part. A reed clump is five blades; a willow's
// curtain, its strands.
function partsOf(tris) {
  const parent = tris.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const seen = new Map();
  tris.forEach((t, i) => {
    for (const v of t) {
      const k = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
      const j = seen.get(k);
      if (j === undefined) seen.set(k, i);
      else { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
    }
  });
  const groups = new Map();
  tris.forEach((t, i) => { const r = find(i); let g = groups.get(r); if (!g) groups.set(r, (g = [])); g.push(t); });
  return [...groups.values()];
}

// A part's measures: extent, area, colour, and whether it is a thin upright
// thing (a blade, a stem, a strand).
function measure(part) {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let area = 0, r = 0, g = 0, b = 0;
  for (const [a, c, d] of part) {
    for (const v of [a, c, d]) {
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
    }
    _a.set(c.x - a.x, c.y - a.y, c.z - a.z);
    _b.set(d.x - a.x, d.y - a.y, d.z - a.z);
    const ar = _a.cross(_b).length() / 2;
    area += ar;
    r += ((a.r + c.r + d.r) / 3) * ar; g += ((a.g + c.g + d.g) / 3) * ar; b += ((a.b + c.b + d.b) / 3) * ar;
  }
  const h = maxY - minY, wide = Math.max(maxX - minX, maxZ - minZ);
  return {
    minY, maxY, minX, maxX, minZ, maxZ, area, h, wide, thin: h > 2.5 * wide,
    col: area > 0 ? [r / area, g / area, b / area] : part.length ? [part[0][0].r, part[0][0].g, part[0][0].b] : [1, 1, 1],
  };
}

// One flat triangle in place of a thin upright part, as much of it seen from
// afar as the part (its area over four, the mean shadow of a thin closed
// thing seen from any side; a flat triangle's is a quarter of base x height),
// its base at the top unless the foot is plainly wider (a reed's tops are
// what shows over the grass; a strand hangs from its top).
function addBlade(out, part, m, turn) {
  const lo = [], hi = [];
  for (const t of part) for (const v of t) {
    if (v.y <= m.minY + 0.25 * m.h) lo.push(v);
    if (v.y >= m.maxY - 0.25 * m.h) hi.push(v);
  }
  const spread = (vs) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const v of vs) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
    return Math.max(x1 - x0, z1 - z0);
  };
  const mid = (vs) => { let x = 0, z = 0; for (const v of vs) { x += v.x; z += v.z; } return [x / vs.length, z / vs.length]; };
  // the top unless the foot is plainly the wider: grass hides a reed's foot,
  // and a strand hangs from its top
  const baseLow = spread(lo) > 1.5 * spread(hi);
  const [bx, bz] = mid(baseLow ? lo : hi), [tx, tz] = mid(baseLow ? hi : lo);
  const by = baseLow ? m.minY : m.maxY, ty = baseLow ? m.maxY : m.minY;
  const half = Math.min(m.h, (m.area / 4) * 4 / m.h) / 2;
  const dx = Math.cos(turn), dz = Math.sin(turn);
  // Lit as an upright blade is, from the side: the normal is the blade's own
  // face normal, level (one tipped to the sky lights it as bright as the
  // ground), and the winding agrees with it, so the side the camera sees is
  // lit as that side.
  const n = unit3(-dz, 0, dx);
  const up = ty > by;
  const v0 = out.vertex(bx - dx * half, by, bz - dz * half, n, m.col);
  const v1 = out.vertex(bx + dx * half, by, bz + dz * half, n, m.col);
  const v2 = out.vertex(tx, ty, tz, n, m.col);
  if (up) out.tri(v0, v1, v2); else out.tri(v1, v0, v2);
}

// A spike: three triangles from a three-cornered foot to a point at the top,
// for a squat thing (a tussock, an osier).
function addSpike(out, m, lo, hi, turn) {
  const radius = Math.min(m.wide / 2, Math.max(0.03, (m.area / 4) / (0.75 * m.h)));
  const cx = (m.minX + m.maxX) / 2, cz = (m.minZ + m.maxZ) / 2;
  const top = out.vertex(cx, m.maxY, cz, [0, 1, 0], hi);
  const ring = [];
  for (let k = 0; k < 3; k++) {
    const a = turn + (k * Math.PI * 2) / 3;
    const dx = Math.cos(a), dz = Math.sin(a);
    ring.push(out.vertex(cx + dx * radius, m.minY, cz + dz * radius, unit3(dx * 0.6, 0.8, dz * 0.6), lo));
  }
  // wound outward, as the normals point
  for (let k = 0; k < 3; k++) out.tri(ring[(k + 1) % 3], ring[k], top);
}

const turnOf = (x, z) => ((((x * 12.9898 + z * 78.233) % 1) + 1) % 1) * Math.PI * 2;

// A thing's far proxy, written into `out`: a blade for each thin part when it
// is made of thin parts (fewer triangles than it has), else a spike; nothing
// for a flat thing.
function addProxy(out, tris) {
  if (!tris.length) return;
  const m = measure(tris);
  if (m.h < FLAT || !(m.area > 0)) return;
  const parts = partsOf(tris).map((p) => ({ p, m: measure(p) }));
  const thin = parts.filter((q) => q.m.thin && q.m.h > FLAT);
  if (thin.length >= 2 && thin.length >= 0.6 * parts.length && thin.length < tris.length) {
    thin.forEach((q, i) => addBlade(out, q.p, q.m, turnOf(q.m.minX + i, q.m.minZ)));
    return;
  }
  // the lower and the upper half's colours, for a spike
  const half = m.minY + m.h / 2;
  const lo = measure(tris.filter((t) => (t[0].y + t[1].y + t[2].y) / 3 < half));
  const hi = measure(tris.filter((t) => (t[0].y + t[1].y + t[2].y) / 3 >= half));
  addSpike(out, m, lo.area > 0 ? lo.col : m.col, hi.area > 0 ? hi.col : m.col, turnOf(m.minX, m.minZ));
}

function builder() {
  const out = { pos: [], nor: [], col: [], index: [] };
  return {
    out,
    get count() { return out.pos.length / 3; },
    vertex(x, y, z, n, c) {
      out.pos.push(x, y, z); out.nor.push(n[0], n[1], n[2]); out.col.push(c[0], c[1], c[2]);
      return out.pos.length / 3 - 1;
    },
    tri(a, b, c) { out.index.push(a, b, c); },
  };
}

// The triangles of a mesh as vertex records, world space, coloured.
function trianglesOf(mesh, which = null) {
  const g = mesh.geometry;
  const pos = g.attributes.position, colA = g.attributes.color, index = g.index;
  const mat = [].concat(mesh.material)[0];
  const vc = !!(mat?.vertexColors && colA);
  const base = mat?.color ?? new THREE.Color(1, 1, 1);
  const identity = mesh.matrixWorld.equals(IDENTITY);
  const vert = (i) => {
    _d.fromBufferAttribute(pos, i);
    if (!identity) _d.applyMatrix4(mesh.matrixWorld);
    return {
      x: _d.x, y: _d.y, z: _d.z,
      r: base.r * (vc ? colA.getX(i) : 1), g: base.g * (vc ? colA.getY(i) : 1), b: base.b * (vc ? colA.getZ(i) : 1),
    };
  };
  const n = (index ? index.count : pos.count) / 3;
  const out = [];
  for (let t = 0; t < n; t++) {
    if (which && !which(t)) continue;
    const i = (k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
    out.push([vert(i(0)), vert(i(1)), vert(i(2))]);
  }
  return out;
}
const IDENTITY = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

/**
 * proxiesOf(mesh, items, { reach, keyOf, owners }) -> Map(key -> { pos, nor, col, index })
 *
 * Far proxies for the small scatter in `mesh` (one material, no groups), one
 * per item of `items` ([{ x, z, r? }], as tilesplit.js takes them), gathered
 * by keyOf(itemIndex) (default: all under one key, null). `owners`
 * (tilesplit.itemOwners' answer) may be handed in if it is known already.
 */
export function proxiesOf(mesh, items, { reach = 1.2, keyOf = () => null, owners: known = null } = {}) {
  mesh.updateMatrixWorld(true);
  const identity = mesh.matrixWorld.equals(IDENTITY);
  const owners = known ?? itemOwners(mesh.geometry, identity ? null : mesh.matrixWorld, items, reach);
  const tris = trianglesOf(mesh);
  const per = items.map(() => []);
  for (let t = 0; t < tris.length; t++) if (owners[t] >= 0) per[owners[t]].push(tris[t]);
  const outs = new Map();
  items.forEach((_, i) => {
    if (!per[i].length) return;
    const k = keyOf(i);
    let b = outs.get(k);
    if (!b) outs.set(k, (b = builder()));
    addProxy(b, per[i]);
  });
  const result = new Map();
  for (const [k, b] of outs) result.set(k, b.out);
  return result;
}
const unit3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

/**
 * createStandIns(groups, material) -> { mesh, show(key, on), shown(key), has(key),
 *   triangles(key), update(), drawnTriangles, dispose() }
 *
 *   groups    [{ key, parts: [standInOf(...) or proxiesOf(...)] }]: one run of
 *             the index each (render/runs.js); all start hidden
 *   material  shared, not owned
 */
export function createStandIns(groups, material) {
  let verts = 0, indices = 0;
  for (const g of groups) for (const s of g.parts) { verts += s.pos.length / 3; indices += s.index.length; }
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), col = new Float32Array(verts * 3);
  const index = verts > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const triKey = new Array(indices / 3);
  let v0 = 0, i0 = 0;
  for (const g of groups) {
    for (const s of g.parts) {
      pos.set(s.pos, v0 * 3); nor.set(s.nor, v0 * 3); col.set(s.col, v0 * 3);
      for (let k = 0; k < s.index.length; k++) index[i0 + k] = s.index[k] + v0;
      for (let t = 0; t < s.index.length / 3; t++) triKey[i0 / 3 + t] = g.key;
      v0 += s.pos.length / 3; i0 += s.index.length;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'standIns';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  const runs = createRuns(mesh, (t) => triKey[t]);
  return {
    mesh,
    get drawnTriangles() { return runs.drawnTriangles; },
    show: runs.show,
    shown: runs.shown,
    has: runs.has,
    triangles: runs.triangles,
    update: runs.update,
    showAll: runs.showAll,
    keys: runs.keys,
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
    },
  };
}
