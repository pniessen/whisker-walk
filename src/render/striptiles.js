import * as THREE from 'three';
import { hash01 } from '../world/builder.js';
import { withLocalUuids } from '../world/localuuids.js';
import { bothSidesLit } from '../world/dressing.js';
import { createStreamer, tileSeed, LAYERS } from '../world/strips.js';
import { mergeStaticProps } from './mergeprops.js';
import { assignShadowCastersFor, trimShadowCasters } from './rig.js';
import { findOccluders } from '../fightcam.js';
import { itemOwners, tileOf } from './tilesplit.js';
import { createRuns } from './runs.js';
import { standInOf, proxiesOf, createStandIns } from './standins.js';

// =============================================================================
// Strip tiles, drawn (bigger areas; the arithmetic is world/strips.js).
//
// One of these per walk, for an area that has strips (areaData.strips). It
// builds each tile's two layers when the cat comes near and frees them when
// it has gone. Step 2 ("the 65 m approach", world/streamcore.js) adds the
// area's frozen CORE as one more stream, `prebuilt`: its things are already in
// the scene, so a core tile's layer is shown and hidden rather than built and
// freed (its merged small scatter cut per tile first, render/tilesplit.js),
// and every tree past the trees layer's range, core or strip, is drawn as a
// far stand-in (render/standins.js), one mesh for the whole area.
//
// A strip's two layers:
//
//   small   ONE mesh a tile: its reeds, tussocks, cattails, marigolds and
//           stones, written straight into typed arrays (no Three geometry per
//           blade), vertex-coloured, on one material every tile shares. It
//           casts nothing, as the core's reeds and dressing cast nothing.
//   trees   each tree is the Group the core's own trees are (the strip hands
//           in its builder), merged to one mesh per material by mergeprops,
//           given its shadow by the caster rule, its sway by the wind, its
//           fade by the tree fade, its ground decal by the contact shadows and
//           its shape to the fight camera: the same six things a core tree has.
//
// Building is spread over frames (strips.js's budgets): a tree is one step,
// the small layer is cut into chunks of at most CHUNK triangles, a core tile's
// layer is one step costing its triangles. Everything is made under a uuid
// stream named for its tile, so no Math.random draw moves. A tile's small
// things rise out of the ground over RISE seconds rather than popping (at
// once with reduced motion); its trees take their stand-ins' place in the
// frame the last of them is ready (a strip tile's trees are built hidden),
// so a tree never grows where a stand-in stood.
//
// In the steady state update() allocates nothing: the streamer's slots and
// queue, the scratch arrays and the rise list are made once; arrays and
// objects are made only on the frames a tile is built.
// =============================================================================

export const CHUNK = 800; // triangles of small things written in one step
export const RISE = 0.7; // seconds a new tile's things take to grow in

// What one tree costs in triangles, for the frame budget (measured: a willow
// is 356, builder.tree 172 to 220 by canopy kind).
export const TREE_COST = Object.freeze({ willow: 356, alder: 220 });

// --- the small things -------------------------------------------------------------
// Each kind: how many triangles one item is, and how to write it. `w` is the
// writer below; colours are linear.
const _c = new THREE.Color();
const lin = (hex) => { _c.setHex(hex); return [_c.r, _c.g, _c.b]; };
const REED = lin(0x8aa05a);
const T_ROOT = lin(0x6f7f3e);
const T_TIP = lin(0xb8b070);
const C_STEM = lin(0x6a7d3a);
const C_HEAD = lin(0x5a3a22);
const M_LEAF = lin(0x4f7a34);
const M_BLOOM = lin(0xf2c832);
const STONE = lin(0x8f8a80);

const REED_BLADES = 5;
export const SMALL_KINDS = Object.freeze({
  // A reed clump: five thin three-sided blades, the core's heights and leans
  // (builder.reedBed: 0.6-1.0 m, leaning up to 0.15 rad, within 0.25 m).
  reed: {
    triangles: REED_BLADES * 6,
    write(w, sp, i, seed) {
      const tone = 0.9 + 0.2 * hash01(sp.x, sp.z, seed + 9);
      for (let k = 0; k < REED_BLADES; k++) {
        const h = 0.6 + 0.4 * hash01(sp.x + k, sp.z + i, seed + 1);
        const bx = sp.x + (hash01(k, i, seed + 4) - 0.5) * 0.5;
        const bz = sp.z + (hash01(i, k, seed + 5) - 0.5) * 0.5;
        const lx = Math.tan((hash01(sp.x + k, sp.z, seed + 3) - 0.5) * 0.3) * h;
        const lz = Math.tan((hash01(sp.x, sp.z + k, seed + 2) - 0.5) * 0.3) * h;
        const a0 = hash01(sp.x + k, sp.z + k, seed + 6) * 2.1;
        const r = 0.027;
        for (let s = 0; s < 3; s++) {
          const a = a0 + s * 2.0944, a2 = a0 + (s + 1) * 2.0944, am = a0 + (s + 0.5) * 2.0944;
          const x1 = bx + Math.cos(a) * r, z1 = bz + Math.sin(a) * r;
          const x2 = bx + Math.cos(a2) * r, z2 = bz + Math.sin(a2) * r;
          w.normal(Math.cos(am), 0.08, Math.sin(am));
          w.colour(REED[0] * tone * 0.82, REED[1] * tone * 0.82, REED[2] * tone * 0.82);
          w.vertex(x1, 0, z1); w.vertex(x2, 0, z2);
          w.colour(REED[0] * tone, REED[1] * tone, REED[2] * tone);
          w.vertex(x2 + lx, h, z2 + lz);
          w.vertex(x2 + lx, h, z2 + lz); w.vertex(x1 + lx, h, z1 + lz);
          w.colour(REED[0] * tone * 0.82, REED[1] * tone * 0.82, REED[2] * tone * 0.82);
          w.vertex(x1, 0, z1);
        }
      }
    },
  },
  // A tussock: six tapered blades, each one triangle (riverdress.js's).
  tussock: {
    triangles: 6,
    write(w, t) {
      const tone = 0.82 + 0.22 * hash01(t.x, t.z, 479);
      for (let k = 0; k < 6; k++) {
        const a = ((k + hash01(t.x + k, t.z, 493) * 0.7) / 6) * Math.PI * 2;
        const dx = Math.cos(a), dz = Math.sin(a);
        const bx = t.x + dx * 0.04 * t.s, bz = t.z + dz * 0.04 * t.s;
        const wd = 0.055 * t.s;
        const lean = (0.14 + 0.16 * hash01(t.z, t.x + k, 507)) * t.s;
        const h = t.h * (0.72 + 0.28 * hash01(t.x, t.z + k, 521));
        const curl = (hash01(t.x + k, t.z + k, 535) - 0.5) * 0.08;
        w.normal(dx * 0.5, 1, dz * 0.5);
        w.colour(T_ROOT[0] * tone, T_ROOT[1] * tone, T_ROOT[2] * tone);
        w.vertex(bx - dz * wd, 0, bz + dx * wd);
        w.vertex(bx + dz * wd, 0, bz - dx * wd);
        w.colour(T_TIP[0] * tone, T_TIP[1] * tone, T_TIP[2] * tone);
        w.vertex(t.x + dx * lean - dz * curl, h, t.z + dz * lean + dx * curl);
      }
    },
  },
  // A cattail: two crossed thin quads and a four-sided brown head.
  cattail: {
    triangles: 12,
    write(w, c) {
      const lx = (hash01(c.x, c.z, 549) - 0.5) * 0.16;
      const lz = (hash01(c.z, c.x, 563) - 0.5) * 0.16;
      const quad = (x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3) => {
        const at = (x, y, z) => w.vertex(c.x + x + (lx * y) / c.h, y, c.z + z + (lz * y) / c.h);
        at(x0, y0, z0); at(x1, y1, z1); at(x3, y3, z3);
        at(x0, y0, z0); at(x3, y3, z3); at(x2, y2, z2);
      };
      const s = 0.0125;
      w.colour(C_STEM[0], C_STEM[1], C_STEM[2]);
      w.normal(0, 0.6, 1);
      quad(-s, 0, 0, s, 0, 0, -s, c.h, 0, s, c.h, 0);
      w.normal(1, 0.6, 0);
      quad(0, 0, -s, 0, 0, s, 0, c.h, -s, 0, c.h, s);
      const hw = 0.025, y0 = c.h - 0.27, y1 = c.h - 0.05;
      w.colour(C_HEAD[0], C_HEAD[1], C_HEAD[2]);
      w.normal(0, 0.3, -1); quad(-hw, y0, -hw, hw, y0, -hw, -hw, y1, -hw, hw, y1, -hw);
      w.normal(1, 0.3, 0); quad(hw, y0, -hw, hw, y0, hw, hw, y1, -hw, hw, y1, hw);
      w.normal(0, 0.3, 1); quad(hw, y0, hw, -hw, y0, hw, hw, y1, hw, -hw, y1, hw);
      w.normal(-1, 0.3, 0); quad(-hw, y0, hw, -hw, y0, -hw, -hw, y1, hw, -hw, y1, -hw);
    },
  },
  // A marsh marigold: four low round leaves and three yellow blooms.
  marigold: {
    triangles: 10,
    write(w, f) {
      const s = f.s;
      for (let k = 0; k < 4; k++) {
        const a = ((k + hash01(f.x + k, f.z, 1401) * 0.6) / 4) * Math.PI * 2;
        const dx = Math.cos(a), dz = Math.sin(a);
        const tone = 0.85 + 0.25 * hash01(f.x, f.z + k, 1415);
        w.normal(dx * 0.3, 1, dz * 0.3);
        w.colour(M_LEAF[0] * tone, M_LEAF[1] * tone, M_LEAF[2] * tone);
        w.vertex(f.x, 0.02, f.z);
        w.vertex(f.x + (dx * 0.2 - dz * 0.11) * s, 0.09 * s, f.z + (dz * 0.2 + dx * 0.11) * s);
        w.vertex(f.x + (dx * 0.2 + dz * 0.11) * s, 0.09 * s, f.z + (dz * 0.2 - dx * 0.11) * s);
      }
      for (let k = 0; k < 3; k++) {
        const a = hash01(f.x + k, f.z + k, 1429) * Math.PI * 2;
        const d = (0.05 + 0.1 * hash01(f.z + k, f.x, 1443)) * s;
        const bx = f.x + Math.cos(a) * d, bz = f.z + Math.sin(a) * d;
        const y = (0.16 + 0.1 * hash01(f.x, f.z + k, 1457)) * s;
        const r = 0.045 * s;
        w.normal(0, 1, 0);
        w.colour(M_BLOOM[0], M_BLOOM[1], M_BLOOM[2]);
        w.vertex(bx - r, y, bz); w.vertex(bx, y, bz + r); w.vertex(bx + r, y, bz);
        w.vertex(bx - r, y, bz); w.vertex(bx + r, y, bz); w.vertex(bx, y, bz - r);
      }
    },
  },
  // A stone: a squashed, half-sunk eight-faced pebble.
  stone: {
    triangles: 8,
    write(w, st) {
      const r = st.r, ry = r * 0.62, cy = ry * 0.45;
      const yaw = hash01(st.x, st.z, 1471) * Math.PI;
      const tone = 0.82 + 0.3 * hash01(st.z, st.x, 1485);
      const px = [], pz = [];
      for (let k = 0; k < 4; k++) {
        const a = yaw + (k * Math.PI) / 2;
        const rr = r * (0.85 + 0.3 * hash01(st.x + k, st.z, 1499));
        px[k] = st.x + Math.cos(a) * rr; pz[k] = st.z + Math.sin(a) * rr;
      }
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        const a = yaw + ((k + 0.5) * Math.PI) / 2;
        const shade = tone * (0.9 + 0.14 * hash01(st.x, st.z + k, 1513));
        w.colour(STONE[0] * shade, STONE[1] * shade, STONE[2] * shade);
        w.normal(Math.cos(a), 0.9, Math.sin(a));
        w.vertex(px[k], cy, pz[k]); w.vertex(st.x, cy + ry, st.z); w.vertex(px[k2], cy, pz[k2]);
        w.colour(STONE[0] * shade * 0.7, STONE[1] * shade * 0.7, STONE[2] * shade * 0.7);
        w.normal(Math.cos(a), -0.9, Math.sin(a));
        w.vertex(px[k], cy, pz[k]); w.vertex(px[k2], cy, pz[k2]); w.vertex(st.x, cy - ry, st.z);
      }
    },
  },
});
const KIND_ORDER = Object.freeze(Object.keys(SMALL_KINDS));

// How many triangles a tile's small layer is.
export function smallTriangles(small) {
  let n = 0;
  for (const kind of KIND_ORDER) n += (small[kind]?.length ?? 0) * SMALL_KINDS[kind].triangles;
  return n;
}

// The writer: three flat arrays and a cursor. normal() and colour() set what
// the following vertices carry.
function createWriter(maxTriangles) {
  const cap = Math.max(1, maxTriangles) * 9;
  const pos = new Float32Array(cap), nor = new Float32Array(cap), col = new Float32Array(cap);
  let n = 0;
  let nx = 0, ny = 1, nz = 0, r = 1, g = 1, b = 1;
  return {
    pos, nor, col,
    get count() { return n / 3; },
    reset() { n = 0; },
    normal(x, y, z) { const l = Math.hypot(x, y, z) || 1; nx = x / l; ny = y / l; nz = z / l; },
    colour(cr, cg, cb) { r = cr; g = cg; b = cb; },
    vertex(x, y, z) {
      pos[n] = x; pos[n + 1] = y; pos[n + 2] = z;
      nor[n] = nx; nor[n + 1] = ny; nor[n + 2] = nz;
      col[n] = r; col[n + 1] = g; col[n + 2] = b;
      n += 3;
    },
  };
}

// The geometry of a whole small layer at once (tests, the budget, pictures).
export function smallGeometry(small, seed) {
  const w = createWriter(smallTriangles(small));
  for (const kind of KIND_ORDER) (small[kind] ?? []).forEach((it, i) => SMALL_KINDS[kind].write(w, it, i, seed));
  return writerGeometry(w);
}
function writerGeometry(w) {
  const n = w.count * 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(w.pos.slice(0, n), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(w.nor.slice(0, n), 3));
  g.setAttribute('color', new THREE.BufferAttribute(w.col.slice(0, n), 3));
  return g;
}

const SMALL_SEED = 733; // the hash salt base of the small things' own shapes

function triangleCount(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
  });
  return n;
}

/**
 * createStripTiles(scene, { strips, wind, treeFade, decals, occluders, tier, reducedMotion, now })
 *
 *   strips       areaData.strips: [{ areaId, id, tiles, content(index), buildTree(tree, { wind }) }],
 *                or a core stream ({ areaId, id, tiles, prebuilt: true }, world/streamcore.js)
 *                whose things are the scene's objects tagged userData.stream
 *   wind         the walk's wind (render/wind.js), or null
 *   treeFade     () => the walk's tree fade, or null (read when a tree is built)
 *   decals       the walk's contact shadows, or null
 *   occluders    the fight camera's tree list; a strip tree is pushed onto it
 *                and spliced out again
 *   tier         () => the quality tier now (its shadowMinPart trims a tree's
 *                small parts as the walk's own trim does)
 *   now          a millisecond clock for the per-frame time budget (optional)
 *   compile      () => compile the scene's shaders now (optional; see below)
 *
 * Returns { update(dt, x, z), settle(x, z), dispose(), stats, counts() }.
 * With no strips it is a no-op of the same shape.
 */
export function createStripTiles(scene, {
  strips = [], wind = null, treeFade = () => null, decals = null, occluders = null,
  tier = () => null, reducedMotion = false, now = null, frameTriangles, frameMs, compile = null,
} = {}) {
  if (!strips.length) return NO_STRIP_TILES;

  // One writer, sized for the fullest tile of any strip.
  let most = 1;
  for (const strip of strips) {
    if (strip.prebuilt) continue;
    for (const t of strip.tiles) most = Math.max(most, smallTriangles(strip.content(t.index).small));
  }
  const writer = createWriter(most);
  const material = withLocalUuids('strip-tiles-material', () => bothSidesLit(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })));
  const mergeRoot = { children: [], updateMatrixWorld() {} };

  // What is in the scene now, by slot key, and what is still growing in.
  const live = new Map();
  const rising = [];
  const stats = { geometries: 0, materials: 0, meshes: 0, triangles: 0, casters: 0, trees: 0, smallTiles: 0, maxStepMs: 0 };
  const key = (strip, tile, layer) => `${strip.id}|${tile.index}|${layer.id}`;
  const runKey = (strip, tile) => `${strip.id}|${tile.index}`;

  // --- the core: what is already in the scene, by slot ------------------------------
  // core[stripId] = { trees: Map(slotKey -> [Group]), runs: Map(slotKey -> [runs]),
  // meshes: [{ mesh, runs }], proxies: Map(slotKey -> [part]), triangles:
  // Map(slotKey -> n) }. A tagged merged mesh keeps its vertices and is drawn in
  // runs, one per tile (render/runs.js): one draw however many tiles are near.
  const core = new Map();
  const coreTree = (strip, tile) => `${strip.id}|${tile}|trees`;
  const layerIdsOf = (strip) => strip.layerIds ?? (strip.prebuilt ? ['fine', 'small', 'trees'] : ['small', 'trees']);
  const prebuilt = strips.filter((s) => s.prebuilt);
  for (const strip of prebuilt) core.set(strip.id, { trees: new Map(), runs: new Map(), meshes: [], proxies: new Map(), triangles: new Map() });
  // a tagged thing goes to the first core stream that has its layer
  const streamFor = (layerId) => prebuilt.find((s) => layerIdsOf(s).includes(layerId));
  const push = (map, k, o) => { let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(o); };
  for (const o of prebuilt.length ? scene.children.filter((c) => c.userData.stream === 'trees' || c.userData.stream === 'small') : []) {
    if (o.userData.stream === 'trees') {
      const strip = streamFor('trees');
      if (!strip) continue;
      const rec = core.get(strip.id);
      const k = coreTree(strip, tileOf(strip.tiles, o.position.x, o.position.z));
      o.userData.streamSlot = k;
      push(rec.trees, k, o);
      rec.triangles.set(k, (rec.triangles.get(k) ?? 0) + triangleCount(o));
      continue;
    }
    const layerId = o.userData.streamLayer ?? 'small';
    const strip = streamFor(layerId);
    if (!strip || !o.isMesh || Array.isArray(o.material) || o.geometry.groups.length > 1) continue; // drawn whole, as it was
    const rec = core.get(strip.id);
    withLocalUuids(`${strip.areaId}|${strip.id}|runs|${o.name}`, () => {
      const items = o.userData.streamItems ?? [];
      const reach = o.userData.streamReach ?? 1.2;
      o.updateMatrixWorld(true);
      const identity = o.matrixWorld.equals(IDENTITY);
      const owners = itemOwners(o.geometry, identity ? null : o.matrixWorld, items, reach);
      const itemKey = items.map((it) => `${strip.id}|${tileOf(strip.tiles, it.x, it.z)}|${layerId}`);
      // the far proxies first, from the index as it was built
      for (const [k, part] of proxiesOf(o, items, { reach, owners, keyOf: (i) => itemKey[i] })) push(rec.proxies, k, part);
      const runs = createRuns(o, (t) => (owners[t] >= 0 ? itemKey[owners[t]] : null));
      o.userData.streamRuns = true;
      rec.meshes.push({ mesh: o, runs });
      for (const k of runs.keys()) { push(rec.runs, k, runs); rec.triangles.set(k, (rec.triangles.get(k) ?? 0) + runs.triangles(k)); }
    });
  }

  // --- the stand-ins: every tree and every small thing of every stream, a run
  // per slot --------------------------------------------------------------------------
  const groups = [];
  for (const strip of strips) {
    const rec = core.get(strip.id);
    for (const tile of strip.tiles) {
      if (rec) {
        const trees = (rec.trees.get(coreTree(strip, tile.index)) ?? []).map((g) => standInOf(g));
        if (trees.length) groups.push({ key: coreTree(strip, tile.index), parts: trees });
        continue;
      }
      const trees = strip.content(tile.index).trees.map((t, n) => stripStandIn(strip, tile, t, n)).filter((p) => p.index.length);
      if (trees.length) groups.push({ key: `${runKey(strip, tile)}|trees`, parts: trees });
      const small = stripProxies(strip, tile, material);
      if (small.index.length) groups.push({ key: `${runKey(strip, tile)}|small`, parts: [small] });
    }
    if (rec) for (const [k, parts] of rec.proxies) groups.push({ key: k, parts: parts.filter((p) => p.index.length) });
  }
  // Their own material: two-sided as usual (a flat blade is lit as the side
  // the camera sees), where the strip's small things keep both sides lit alike.
  const standInMaterial = withLocalUuids('strip-tiles-standin-material', () => new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
  const standIns = withLocalUuids('strip-tiles-standins', () => createStandIns(groups.filter((g) => g.parts.length), standInMaterial));
  for (const g of groups) standIns.show(g.key, true);
  scene.add(standIns.mesh);

  // Walk start: the shared material would otherwise compile its shader on the
  // frame the first tile appears (a stutter on a phone), and so would a core
  // tree or run mesh never yet drawn. Everything streamed is shown for
  // `compile` (walk.js: renderer.compile), then hidden again; one hidden
  // triangle wears the strip material. The strip trees need no such thing:
  // their materials are the core trees' kinds.
  const coreTrees = [];
  for (const rec of core.values()) for (const list of rec.trees.values()) coreTrees.push(...list);
  const coreRuns = [];
  for (const rec of core.values()) for (const m of rec.meshes) coreRuns.push(m);
  for (const g of coreTrees) g.visible = false;
  for (const { runs } of coreRuns) runs.update();
  if (compile) {
    withLocalUuids('strip-tiles-warm', () => {
      const geo = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'color']) geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(9), 3));
      const warm = new THREE.Mesh(geo, material);
      warm.frustumCulled = false;
      scene.add(warm);
      const was = coreRuns.map(({ mesh }) => mesh.visible);
      const standWas = standIns.mesh.visible;
      for (const g of coreTrees) g.visible = true;
      for (const { mesh } of coreRuns) mesh.visible = true;
      standIns.mesh.visible = true;
      try { compile(); } finally {
        for (const g of coreTrees) g.visible = false;
        coreRuns.forEach(({ mesh }, i) => { mesh.visible = was[i]; });
        standIns.mesh.visible = standWas;
        scene.remove(warm); geo.dispose();
      }
    });
  }

  const rise = (obj, sx, sy, sz) => {
    if (reducedMotion) return;
    obj.scale.set(sx, sy * 0.02, sz);
    rising.push({ obj, t: 0, sx, sy, sz });
  };
  const stopRising = (obj) => {
    for (let i = rising.length - 1; i >= 0; i--) {
      if (rising[i].obj !== obj) continue;
      const r = rising[i];
      r.obj.scale.set(r.sx, r.sy, r.sz);
      rising.splice(i, 1);
    }
  };

  function addTree(strip, tile, tree, n) {
    return withLocalUuids(tileSeed(strip.areaId, strip.id, tile.index, `tree-${n}`), () => {
      const g = strip.buildTree(tree, { wind });
      g.userData.strip = strip.id;
      g.userData.stripTile = tile.index;
      g.userData.streamSlot = `${strip.id}|${tile.index}|trees`;
      // one mesh per material, exactly as walk.js merges the core's props
      g.updateMatrixWorld(true);
      mergeRoot.children[0] = g;
      mergeStaticProps(mergeRoot);
      mergeRoot.children.length = 0;
      // hidden until the last tree of its tile is ready (the stand-ins stand
      // in till then)
      g.visible = false;
      scene.add(g);
      g.updateMatrixWorld(true);
      const cast = assignShadowCastersFor(g);
      const minPart = tier()?.shadowMinPart ?? 0;
      if (minPart > 0) { mergeRoot.children[0] = g; trimShadowCasters(mergeRoot, minPart); mergeRoot.children.length = 0; }
      const occ = findOccluders(g);
      for (const o of occ) { treeFade()?.add(o); occluders?.push(o); }
      decals?.addStatic(g);
      let geos = 0, mats = 0, meshes = 0, casters = 0;
      g.traverse((o) => {
        if (!o.isMesh) return;
        meshes++; geos++; mats += Array.isArray(o.material) ? o.material.length : 1;
        if (o.castShadow) casters++;
      });
      const record = { g, occ, geos, mats, meshes, casters, triangles: triangleCount(g) };
      stats.geometries += geos; stats.materials += mats; stats.meshes += meshes;
      stats.casters += casters; stats.triangles += record.triangles; stats.trees++;
      return record;
    });
  }

  function removeTree(rec) {
    const { g, occ } = rec;
    stopRising(g);
    wind?.remove?.(g);
    for (const o of occ) {
      treeFade()?.remove(o.obj);
      const i = occluders ? occluders.indexOf(o) : -1;
      if (i >= 0) occluders.splice(i, 1);
    }
    g.rotation.set(0, 0, 0);
    g.updateMatrixWorld(true);
    decals?.removeStatic(g);
    scene.remove(g);
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      for (const m of [].concat(o.material)) m?.dispose?.();
    });
    stats.geometries -= rec.geos; stats.materials -= rec.mats; stats.meshes -= rec.meshes;
    stats.casters -= rec.casters; stats.triangles -= rec.triangles; stats.trees--;
  }

  function treesJob(strip, tile, layer) {
    const trees = strip.content(tile.index).trees;
    const made = [];
    let i = 0;
    return {
      cost: () => (i < trees.length ? TREE_COST[trees[i].kind] ?? 700 : 0),
      step() {
        if (i < trees.length) {
          const t0 = now ? now() : 0;
          made.push(addTree(strip, tile, trees[i], i));
          if (now) stats.maxStepMs = Math.max(stats.maxStepMs, now() - t0);
          i++;
        }
        if (i < trees.length) return false;
        for (const rec of made) rec.g.visible = true;
        standIns.show(key(strip, tile, layer), false);
        live.set(key(strip, tile, layer), { trees: made });
        return true;
      },
      cancel() { for (const rec of made) removeTree(rec); made.length = 0; },
    };
  }

  function smallJob(strip, tile, layer) {
    const small = strip.content(tile.index).small;
    let k = 0, i = 0, started = false;
    // the next chunk: whole items, up to CHUNK triangles
    const nextCost = () => {
      let kk = k, ii = i, n = 0;
      while (kk < KIND_ORDER.length) {
        const kind = KIND_ORDER[kk];
        const left = (small[kind]?.length ?? 0) - ii;
        const per = SMALL_KINDS[kind].triangles;
        const take = Math.min(left, Math.floor((CHUNK - n) / per));
        n += take * per;
        if (take < left) break;
        kk++; ii = 0;
      }
      return n;
    };
    return {
      cost: nextCost,
      step() {
        const t0 = now ? now() : 0;
        if (!started) { writer.reset(); started = true; }
        let n = 0;
        while (k < KIND_ORDER.length) {
          const kind = KIND_ORDER[k];
          const list = small[kind] ?? [];
          const K = SMALL_KINDS[kind];
          while (i < list.length && n + K.triangles <= CHUNK) { K.write(writer, list[i], i, SMALL_SEED); n += K.triangles; i++; }
          if (i < list.length) break;
          k++; i = 0;
        }
        if (k < KIND_ORDER.length) {
          if (now) stats.maxStepMs = Math.max(stats.maxStepMs, now() - t0);
          return false;
        }
        const triangles = writer.count / 3;
        if (triangles > 0) {
          const mesh = withLocalUuids(tileSeed(strip.areaId, strip.id, tile.index, 'small'), () => {
            const geo = writerGeometry(writer);
            const cx = (tile.minX + tile.maxX) / 2, cz = (tile.minZ + tile.maxZ) / 2;
            geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 0.6, cz),
              Math.hypot(tile.maxX - tile.minX, tile.maxZ - tile.minZ) / 2 + 1.5);
            const m = new THREE.Mesh(geo, material);
            m.name = 'stripSmall';
            m.castShadow = false;
            m.receiveShadow = true;
            m.userData.noCast = true;
            m.userData.strip = strip.id;
            m.userData.stripTile = tile.index;
            m.userData.streamSlot = `${strip.id}|${tile.index}|small`;
            return m;
          });
          scene.add(mesh);
          if (!standIns.has(key(strip, tile, layer))) rise(mesh, 1, 1, 1);
          live.set(key(strip, tile, layer), { mesh, triangles });
          stats.geometries++; stats.meshes++; stats.triangles += triangles; stats.smallTiles++;
        } else {
          live.set(key(strip, tile, layer), { mesh: null, triangles: 0 });
        }
        standIns.show(key(strip, tile, layer), false);
        if (now) stats.maxStepMs = Math.max(stats.maxStepMs, now() - t0);
        return true;
      },
      cancel() { /* nothing is in the scene until the last step */ },
    };
  }

  // A core tile's layer: one step, shown. Costs its triangles, so the frame
  // budget spreads the first sight of many tiles (each a buffer upload) over
  // a few frames.
  function coreJob(strip, tile, layer) {
    const rec = core.get(strip.id);
    const k = key(strip, tile, layer);
    const cost = rec.triangles.get(k) ?? 0;
    let done = false;
    return {
      cost: () => (done ? 0 : cost),
      step() {
        for (const g of rec.trees.get(k) ?? []) g.visible = true;
        for (const runs of rec.runs.get(k) ?? []) runs.show(k, true);
        standIns.show(k, false);
        done = true;
        return true;
      },
      cancel() {},
    };
  }
  function dropCore(strip, tile, layer) {
    const rec = core.get(strip.id);
    const k = key(strip, tile, layer);
    for (const g of rec.trees.get(k) ?? []) g.visible = false;
    for (const runs of rec.runs.get(k) ?? []) runs.show(k, false);
    standIns.show(k, true);
  }

  function dropSlot(strip, tile, layer) {
    const k = key(strip, tile, layer);
    const rec = live.get(k);
    if (!rec) return;
    live.delete(k);
    standIns.show(k, true);
    if (rec.trees) {
      for (const t of rec.trees) removeTree(t);
      return;
    }
    if (rec.mesh) {
      stopRising(rec.mesh);
      scene.remove(rec.mesh);
      rec.mesh.geometry.dispose();
      stats.geometries--; stats.meshes--; stats.triangles -= rec.triangles; stats.smallTiles--;
    }
  }

  const streamers = strips.map((strip) => createStreamer({
    tiles: strip.tiles,
    // each stream's own layers (a strip writes its small things itself, so it
    // has no `fine` layer)
    layers: (strip.layers ?? LAYERS).filter((l) => layerIdsOf(strip).includes(l.id)),
    begin: (tile, layer) => (strip.prebuilt ? coreJob(strip, tile, layer)
      : layer.id === 'trees' ? treesJob(strip, tile, layer) : smallJob(strip, tile, layer)),
    drop: (tile, layer) => (strip.prebuilt ? dropCore(strip, tile, layer) : dropSlot(strip, tile, layer)),
    now,
    ...(frameTriangles !== undefined ? { frameTriangles } : {}),
    ...(frameMs !== undefined ? { frameMs } : {}),
  }));

  let disposed = false;
  let started = false; // after the first update or settle: from then on, small things rise in
  return {
    streamers,
    stats,
    material,
    standIns,
    standInMaterial,
    core,
    update(dt, x, z) {
      if (disposed) return;
      for (let i = 0; i < streamers.length; i++) streamers[i].update(x, z, dt);
      started = true;
      for (let i = rising.length - 1; i >= 0; i--) {
        const r = rising[i];
        r.t += dt;
        const u = r.t >= RISE ? 1 : r.t / RISE;
        const e = 1 - (1 - u) * (1 - u);
        r.obj.scale.set(r.sx, r.sy * (0.02 + 0.98 * e), r.sz);
        if (u >= 1) { rising[i] = rising[rising.length - 1]; rising.pop(); }
      }
      for (let i = 0; i < coreRuns.length; i++) coreRuns[i].runs.update();
      standIns.update();
    },
    // Everything in range of (x, z), built at once and at full size: for the
    // start of a walk, a picture or a count, never during a walk.
    settle(x, z) {
      for (const s of streamers) s.settle(x, z);
      for (const r of rising) r.obj.scale.set(r.sx, r.sy, r.sz);
      rising.length = 0;
      started = true;
      for (const { runs } of coreRuns) runs.update();
      standIns.update();
    },
    // What the streams draw now: meshes, casters and triangles, the stand-ins
    // included (a count for the budget test and the harness; it walks the
    // scene, so not for every frame).
    counts() {
      const c = { meshes: 0, casters: 0, triangles: 0, standIns: standIns.drawnTriangles };
      const add = (o) => o.traverse((m) => {
        if (!m.isMesh || !m.visible) return;
        c.meshes++;
        if (m.castShadow) c.casters++;
        c.triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      });
      for (const g of coreTrees) if (g.visible) add(g);
      for (const { mesh, runs } of coreRuns) if (mesh.visible) { c.meshes++; c.triangles += runs.drawnTriangles; }
      for (const v of live.values()) {
        if (v.mesh) add(v.mesh);
        for (const t of v.trees ?? []) if (t.g.visible) add(t.g);
      }
      if (standIns.mesh.visible) { c.meshes++; c.triangles += standIns.drawnTriangles; }
      return c;
    },
    // Every streamed thing by slot, for a budget (test/helpers/growbudget.js).
    inventory() {
      const slots = new Map();
      const slot = (k) => { let s = slots.get(k); if (!s) slots.set(k, (s = { objects: [], runs: [] })); return s; };
      for (const rec of core.values()) {
        for (const [k, list] of rec.trees) slot(k).objects.push(...list);
        for (const { mesh, runs } of rec.meshes) for (const k of runs.keys()) slot(k).runs.push({ mesh, triangles: runs.triangles(k) });
      }
      for (const [k, v] of live) {
        if (v.mesh) slot(k).objects.push(v.mesh);
        for (const t of v.trees ?? []) slot(k).objects.push(t.g);
      }
      return { slots, runMeshes: coreRuns.map(({ mesh, runs }) => ({ mesh, always: runs.alwaysTriangles })), standIns };
    },
    dispose() {
      if (disposed) return;
      for (const s of streamers) s.dispose();
      rising.length = 0;
      // the core's things stay in the scene for the walk's own teardown
      for (const g of coreTrees) g.visible = true;
      standIns.dispose();
      standInMaterial.dispose();
      material.dispose();
      disposed = true;
    },
  };
}

const IDENTITY = new THREE.Matrix4();

// A strip tree's stand-in: the tree built once, measured and freed, under its
// own uuid stream (so no Math.random draw), and kept: a tile's content is a
// pure function of its index, so its stand-ins are the same every walk.
const STRIP_STAND_INS = new Map();
function stripStandIn(strip, tile, tree, n) {
  const k = `${tileSeed(strip.areaId, strip.id, tile.index, `tree-${n}`)}|${tree.kind}|${tree.x}|${tree.z}|${tree.scale}`;
  let s = STRIP_STAND_INS.get(k);
  if (!s) {
    s = withLocalUuids(`${k}|standin`, () => {
      const g = strip.buildTree(tree, {});
      const out = standInOf(g);
      g.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        for (const m of [].concat(o.material)) m?.dispose?.();
      });
      return out;
    });
    STRIP_STAND_INS.set(k, s);
  }
  return s;
}

// A strip tile's small proxies: its small layer written once, measured and
// freed (a pure function of the tile's content, so kept for later walks).
const STRIP_PROXIES = new Map();
function stripProxies(strip, tile, material) {
  const k = tileSeed(strip.areaId, strip.id, tile.index, 'small-proxies');
  let p = STRIP_PROXIES.get(k);
  if (!p) {
    p = withLocalUuids(`${k}|build`, () => {
      const small = strip.content(tile.index).small;
      const geo = smallGeometry(small, SMALL_SEED);
      const items = [];
      for (const kind of KIND_ORDER) {
        for (const it of small[kind] ?? []) items.push({ x: it.x, z: it.z, r: SMALL_REACH[kind](it) });
      }
      const mesh = new THREE.Mesh(geo, material);
      const out = proxiesOf(mesh, items, { reach: 0.6 }).get(null) ?? { pos: [], nor: [], col: [], index: [] };
      geo.dispose();
      return out;
    });
    STRIP_PROXIES.set(k, p);
  }
  return p;
}
// How far each small kind's parts reach from its centre.
const SMALL_REACH = Object.freeze({
  reed: () => 0.3, tussock: (t) => 0.35 * t.s, cattail: () => 0.15, marigold: (f) => 0.25 * f.s, stone: (st) => st.r,
});

export const NO_STRIP_TILES = Object.freeze({
  streamers: Object.freeze([]),
  stats: Object.freeze({ geometries: 0, materials: 0, meshes: 0, triangles: 0, casters: 0, trees: 0, smallTiles: 0, maxStepMs: 0 }),
  update() {}, settle() {}, dispose() {},
  counts: () => ({ meshes: 0, casters: 0, triangles: 0, standIns: 0 }),
});
