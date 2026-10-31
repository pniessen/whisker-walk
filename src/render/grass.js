import * as THREE from 'three';
import { fitCentre } from './shadowfit.js';
import { GUST_DEPTH, GUST_FREQUENCY, MAX_INTENSITY } from './wind.js';
import { waterClearance } from '../world/builder.js';

// ---------------------------------------------------------------------------
// GRASS — low swaying tufts on the lawn near the camera (Stream 4 round two,
// docs/VISUAL-PASS.md "Stream 4 round two — grass").
//
// THE BUDGET. One InstancedMesh, one material: ONE draw call in the main pass
// and NONE in the shadow pass (castShadow false, and rig.js's caster sweep
// skips `userData.grass`). Triangles are the cheap resource here
// (VISUAL-PASS.md section 0), so the tufts spend triangles freely and never a
// second mesh.
//
// THE PATCH FOLLOWS THE VIEW, ON A WORLD GRID. Tufts sit on a fixed world
// lattice (`spacing` metres) and every per-tuft property — jitter, height,
// turn, tint, whether it exists at all — is a hash of its WORLD lattice cell.
// So a given spot of lawn always grows the same tuft, and moving never makes
// grass swim. The CPU only re-lays the instance buffer when the view centre
// crosses into a new CHUNK (a few lattice cells), the same "only move on a
// whole grid step" idea as shadowfit.js's texel snap. Between re-lays the
// edge fade is done on the GPU against the live centre, so the visible circle
// glides smoothly while the tufts stay put.
//
// WHERE GRASS DOES NOT GROW is decided once per walk by a CPU-side mask
// (buildGrassMask): outside bounds, in water, on paths/sidewalks/puddles, and
// inside colliders and box spots. A masked tuft is never written to the
// instance buffer at all — it costs nothing, not even a degenerate vertex.
//
// VERTEX SWAY, unlike wind.js. wind.js sways rigid objects by rotation because
// colliders and perches read prop positions. Grass has no collider and
// nothing reads where a blade is, so bending tips in the vertex shader is
// safe here.
// ---------------------------------------------------------------------------

// Areas with a lawn. The Docks has no grass and the den's garden is only seen
// through a window. Seaside grows DUNE grass instead (GRASS_STYLES below).
export const GRASS_AREAS = Object.freeze(['park', 'neighborhood']);

// Mask resolution. Half a metre: finer than any path (1.2m sidewalks are the
// narrowest strip) and coarse enough that the park's 90x102m bounds is a 37k
// byte array built in a few milliseconds at walk start.
export const MASK_CELL = 0.5;

// How far tufts keep clear of each thing they must not grow on. Measured
// against the CELL CENTRE, so each margin is roughly the tuft's own reach
// (~8cm blade lean, scaled) plus a little air — a blade overhanging a gravel
// edge reads as grass growing on the path.
const PATH_MARGIN = 0.15;
const COLLIDER_MARGIN = 0.15;
const WATER_MARGIN = 0.35; // the pond's edge has a shoreline lip
const BOX_RADIUS = 0.6; // a cardboard box is ~0.5m on a side, plus air
const BOUNDS_INSET = 0.25;

// Tuft shape. The cat is ~0.4m tall, so 6-15cm tufts never hide it.
export const TUFT_MIN_H = 0.06;
export const TUFT_MAX_H = 0.15;
const BLADES = 5; // a few blades per tuft: low-poly, not photoreal
// Fraction of lattice cells that grow a tuft at all. Not 1: a perfectly full
// lattice reads as a carpet pattern; ~12% bare cells break the grid.
const PRESENCE = 0.88;
// Patchiness: a slow value noise on this lattice (metres) pulls whole
// patches of lawn taller or shorter, so the height isn't white noise.
const PATCH_SIZE = 3.5;

// Lattice cells per chunk. ~2m: a cat at full trot crosses one about once a
// second, so the re-lay (a few thousand matrices) runs ~1/s, not every frame.
const CHUNK_METRES = 2.1;

// Where the patch centres: this far in front of the camera, flat on y=0.
// The game camera sits ~4.5m behind the cat (catcam.js), so radius*0.6 puts
// the centre just past the cat, which is where the eye is.
const LEAD_FRACTION = 0.6;
// The fade starts at this fraction of the radius and reaches zero at the
// radius, shrinking tufts into the lawn so there is no visible boundary.
const FADE_START = 0.55;

// Sway. Tip displacement as a fraction of tuft height at a gust peak of an
// ordinary breeze: ~20% bends a 10cm tuft's tip by 2cm, a gentle stir.
const SWAY_AMP = 0.2;
// ~3.3s per cycle, close to wind.js's 3.6s so grass and bushes agree.
const SWAY_FREQ = 1.9;
// One wind direction for the whole lawn (a unit vector in xz).
const WIND_DIR = Object.freeze([0.8, 0.6]);

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in test/grass.test.js)
// ---------------------------------------------------------------------------

// hashCell(ix, iz, salt) — a deterministic value in [0, 1) for an integer
// lattice cell. Integer mixing (no sin hash): exact and identical on every
// client and every run, with no float-precision drift far from the origin.
function mix32(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return h ^ (h >>> 16);
}
export function hashCell(ix, iz, salt = 0) {
  // Each input is folded in and fully mixed in turn (a single XOR of the
  // three products collides on whole diagonals of the lattice).
  let h = mix32(Math.imul(salt | 0, 0x9e3779b1) + 0x165667b1);
  h = mix32(h ^ (ix | 0));
  h = mix32((h + 0x27d4eb2d) ^ (iz | 0));
  return (h >>> 0) / 4294967296;
}

// The chunk-snapped lattice centre for a view centre (x, z): an integer cell
// index on a multiple of `chunkCells`. Holds still until (x, z) crosses into
// the next chunk, which is what stops the re-lay running every frame.
export function snapCentre(x, z, spacing, chunkCells) {
  const cx = Math.floor(x / spacing / chunkCells) * chunkCells + (chunkCells >> 1);
  const cz = Math.floor(z / spacing / chunkCells) * chunkCells + (chunkCells >> 1);
  return { cx, cz };
}

// chunkCellsFor(spacing) — lattice cells per chunk for a spacing.
export function chunkCellsFor(spacing) {
  return Math.max(1, Math.round(CHUNK_METRES / spacing));
}

// The radius (metres, from the snapped centre) the CPU lays tufts out to: the
// fade radius, plus the furthest the live centre can sit from the snapped one
// (half a chunk diagonal), plus one cell of jitter.
export function layoutRadius(radius, spacing) {
  return radius + chunkCellsFor(spacing) * spacing * Math.SQRT1_2 + spacing;
}

// Instance capacity: lattice points within layoutRadius, upper bound.
export function capacityFor(radius, spacing) {
  const n = Math.ceil(layoutRadius(radius, spacing) / spacing);
  let count = 0;
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) if (i * i + j * j <= n * n) count++;
  }
  return count;
}

// flatFootprints(scene) — every top-level, flat, horizontal plane or disc lying
// on the ground other than the ground plane itself: builder.js's path() and
// sidewalk() strips and its puddles. Read off the meshes rather than published
// as area data, the same way test/water.test.js finds paths, so a new path in
// a world file is masked with no second edit. Oriented: a diagonal park path
// masks its own strip, not its bounding box.
//
// Returns { kind: 'strip', x, z, ux, uz, halfW, halfL } (u = unit length axis)
// or { kind: 'disc', x, z, r }.
const _o = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _ay = new THREE.Vector3();
const _n = new THREE.Vector3();
export function flatFootprints(scene) {
  const out = [];
  for (const child of scene.children) {
    if (!child.isMesh || !child.geometry) continue;
    const p = child.geometry.parameters;
    const type = child.geometry.type;
    if (type !== 'PlaneGeometry' && type !== 'CircleGeometry') continue;
    child.updateMatrixWorld(true);
    const e = child.matrixWorld.elements;
    _o.setFromMatrixPosition(child.matrixWorld);
    if (_o.y > 0.1) continue; // a raised plane (a sign, a window) is not ground cover
    _ax.set(e[0], e[1], e[2]);
    _ay.set(e[4], e[5], e[6]);
    _n.crossVectors(_ax, _ay).normalize();
    if (Math.abs(_n.y) < 0.95) continue; // not lying flat
    if (type === 'PlaneGeometry') {
      const halfW = (p.width / 2) * _ax.length();
      const halfL = (p.height / 2) * _ay.length();
      // The ground plane itself (120m) — anything this big is the lawn.
      if (Math.max(halfW, halfL) > 50) continue;
      const len = Math.hypot(_ay.x, _ay.z) || 1;
      out.push({ kind: 'strip', x: _o.x, z: _o.z, ux: _ay.x / len, uz: _ay.z / len, halfW, halfL });
    } else {
      out.push({ kind: 'disc', x: _o.x, z: _o.z, r: p.radius * _ax.length() });
    }
  }
  return out;
}

function inFootprint(f, x, z, margin) {
  const dx = x - f.x;
  const dz = z - f.z;
  if (f.kind === 'disc') return dx * dx + dz * dz < (f.r + margin) ** 2;
  const along = dx * f.ux + dz * f.uz;
  const across = -dx * f.uz + dz * f.ux;
  return Math.abs(along) < f.halfL + margin && Math.abs(across) < f.halfW + margin;
}

// grassAllowed(area, footprints, x, z, slack) — may a tuft grow at (x, z)?
// `area` is the areaData shape ({ bounds, colliders, waters, boxes }).
// `slack` widens (positive) or narrows (negative) every keep-out by that many
// metres; buildGrassMask uses it to classify whole cells at once.
export function grassAllowed(area, footprints, x, z, slack = 0) {
  const b = area.bounds;
  const inset = BOUNDS_INSET + slack;
  if (b && (x < b.minX + inset || x > b.maxX - inset
    || z < b.minZ + inset || z > b.maxZ - inset)) return false;
  for (const c of area.colliders ?? []) {
    const r = c.r + COLLIDER_MARGIN + slack;
    if (r > 0 && (x - c.x) ** 2 + (z - c.z) ** 2 < r * r) return false;
  }
  const br = BOX_RADIUS + slack;
  for (const bx of area.boxes ?? []) {
    if (br > 0 && (x - bx.x) ** 2 + (z - bx.z) ** 2 < br * br) return false;
  }
  for (const f of footprints) if (inFootprint(f, x, z, PATH_MARGIN + slack)) return false;
  // Signed distance to the nearest water edge (decks count as dry).
  if (area.waters?.length && waterClearance(area.waters, x, z) < WATER_MARGIN + slack) return false;
  return true;
}

// buildGrassMask(area, footprints) — the per-walk coverage grid over the
// area's bounds at MASK_CELL. Each cell is classified once: 2 = clear however
// far into the cell you go, 0 = blocked however far, 1 = an edge runs through
// it. `at(x, z)` answers 1/0 (0 anywhere outside the grid); only edge cells
// pay for the exact per-point test, so a tuft beside a path is judged at its
// own position, not its cell's centre.
export function buildGrassMask(area, footprints = [], cell = MASK_CELL) {
  const b = area.bounds;
  const w = Math.ceil((b.maxX - b.minX) / cell);
  const h = Math.ceil((b.maxZ - b.minZ) / cell);
  const half = cell * Math.SQRT1_2; // centre to corner
  const data = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const z = b.minZ + (j + 0.5) * cell;
    for (let i = 0; i < w; i++) {
      const x = b.minX + (i + 0.5) * cell;
      data[j * w + i] = grassAllowed(area, footprints, x, z, half) ? 2
        : grassAllowed(area, footprints, x, z, -half) ? 1 : 0;
    }
  }
  return {
    minX: b.minX, minZ: b.minZ, cell, w, h, data,
    at(x, z) {
      const i = Math.floor((x - b.minX) / cell);
      const j = Math.floor((z - b.minZ) / cell);
      if (i < 0 || j < 0 || i >= w || j >= h) return 0;
      const v = data[j * w + i];
      if (v !== 1) return v >> 1;
      return grassAllowed(area, footprints, x, z) ? 1 : 0;
    },
  };
}

// Bilinear value noise on a `size`-metre lattice, in [0, 1].
function patchNoise(x, z, size = PATCH_SIZE, salt = 7) {
  const gx = x / size;
  const gz = z / size;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hashCell(ix, iz, salt);
  const b = hashCell(ix + 1, iz, salt);
  const c = hashCell(ix, iz + 1, salt);
  const d = hashCell(ix + 1, iz + 1, salt);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
}

// ---------------------------------------------------------------------------
// STYLES. A lawn is short, even, green turf everywhere the mask allows. Dune
// grass (Seaside, Stream 4 round three) is marram: taller, khaki, in clumps
// with bare sand between, and only on the back beach — never on the wet sand
// or the front of the beach where the cat spawns. One style per area; the
// mesh, the mask and the shader are shared.
//
//   color      material colour (null: the area's groundBounce, the lawn hex)
//   hMin/hMax  tuft height range, metres. The cat is ~0.4m tall; dune grass
//              tops out at 0.3 so a cat in it is still a cat in it.
//   width      extra x/z scale on every tuft
//   warm       how far the tint may lean yellow (drier blades)
//   sway       tip sway as a fraction of height at a gust peak
//   reach      radius multiplier on the tier's grassRadius: clumps on open
//              sand are seen from further away than turf
//   density    (x, z) -> chance a lattice cell grows a tuft; null = PRESENCE
// ---------------------------------------------------------------------------
const LAWN = Object.freeze({
  color: null, hMin: TUFT_MIN_H, hMax: TUFT_MAX_H, width: 1, warm: 0.1, sway: SWAY_AMP, reach: 1, density: null,
});

const smooth01 = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Where marram grows at Seaside: the back of the beach (west of x 4, full by
// x -10) and along the cliff foot (south of z -24, full by -32), in clumps
// about 2.6m across. The boardwalk is at x 18..22 and the spawn at (18, 42),
// so the front beach and the wet sand stay bare.
export function duneDensity(x, z) {
  const zone = Math.max(smooth01(4, -10, x), smooth01(-24, -32, z));
  if (zone <= 0) return 0;
  return 0.92 * zone * smooth01(0.48, 0.76, patchNoise(x, z, 2.6, 11));
}
const DUNE = Object.freeze({
  color: 0x96a466, hMin: 0.12, hMax: 0.3, width: 0.9, warm: 0.28, sway: 0.3, reach: 1.5, density: duneDensity,
});

export const GRASS_STYLES = Object.freeze({ park: LAWN, neighborhood: LAWN, seaside: DUNE });

// tuftAt(ix, iz, spacing, style) — the tuft that lattice cell (ix, iz) always
// grows, or null for a bare cell. Pure function of the world cell.
export function tuftAt(ix, iz, spacing, style = LAWN) {
  const x = (ix + 0.5 + (hashCell(ix, iz, 2) - 0.5) * 0.8) * spacing;
  const z = (iz + 0.5 + (hashCell(ix, iz, 3) - 0.5) * 0.8) * spacing;
  const presence = style.density ? style.density(x, z) : PRESENCE;
  if (hashCell(ix, iz, 1) >= presence) return null;
  // Lawn: patchy heights. Dune: the clump's own strength, so each clump is
  // tallest in its middle.
  const field = style.density ? Math.min(1, presence / 0.92) : patchNoise(x, z);
  const tall = 0.35 * hashCell(ix, iz, 4) + 0.65 * field;
  const h = style.hMin + (style.hMax - style.hMin) * tall;
  // Width scale: taller tufts spread a bit wider.
  const s = (0.8 + 0.25 * tall + 0.15 * hashCell(ix, iz, 5)) * style.width;
  const rot = hashCell(ix, iz, 6) * Math.PI * 2;
  // Tint: brightness 0.86-1.08, and a warm (yellow) lean on some, so the
  // lawn has a few drier tufts among the lush ones.
  const v = 0.86 + 0.22 * hashCell(ix, iz, 8);
  const warm = hashCell(ix, iz, 9) * style.warm;
  return { x, z, h, s, rot, tint: [v * (1 + warm), v, v * (1 - warm)] };
}

// layoutTufts(cx, cz, opts, mask, emit) — call emit(tuft) for every tuft within
// layoutRadius of lattice cell (cx, cz) that the mask allows. Returns count.
export function layoutTufts(cx, cz, { radius, spacing }, mask, emit, style = LAWN) {
  const n = Math.ceil(layoutRadius(radius, spacing) / spacing);
  let count = 0;
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      if (i * i + j * j > n * n) continue;
      const t = tuftAt(cx + i, cz + j, spacing, style);
      if (!t || !mask.at(t.x, t.z)) continue;
      emit(t, count++);
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// The tuft geometry: BLADES single-triangle blades around a centre, unit
// height (instance scale sets the real height). Normals all point UP so a
// tuft takes the same light as the lawn under it instead of dark backsides —
// this is ground cover, not foliage. Vertex colour darkens the root.
// ---------------------------------------------------------------------------
function tuftGeometry() {
  const pos = [];
  const col = [];
  for (let k = 0; k < BLADES; k++) {
    const a = (k / BLADES) * Math.PI * 2 + (k % 2) * 0.4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const r0 = 0.025; // base offset from the tuft centre
    const lean = 0.05 + (k % 2) * 0.025; // tip leans outward
    const halfW = 0.026; // blade half-width at the root
    const bx = ca * r0;
    const bz = sa * r0;
    // Blade faces sideways to its lean direction. Written twice, once per
    // winding, and drawn FrontSide: three's DoubleSide flips the normal on a
    // back face, which would turn the up-normal down and paint every blade's
    // far side dark.
    const l = [bx - sa * halfW, 0, bz + ca * halfW];
    const r = [bx + sa * halfW, 0, bz - ca * halfW];
    const tipV = [ca * (r0 + lean), 1 - (k % 2) * 0.2, sa * (r0 + lean)];
    pos.push(...l, ...r, ...tipV, ...r, ...l, ...tipV);
    // Root a shade darker than the lawn (the base of a tuft is in its own
    // shade), tip a touch brighter and yellower (the sunlit blade end). Not
    // darker than 0.82: at a distance a tuft is mostly root, and darker
    // roots read as a lawn of dark specks.
    for (let f = 0; f < 2; f++) col.push(0.82, 0.84, 0.8, 0.82, 0.84, 0.8, 1.06, 1.1, 0.96);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}
export const TRIANGLES_PER_TUFT = BLADES * 2;

const NO_GRASS = Object.freeze({ mesh: null, count: 0, capacity: 0, update() {}, dispose() {} });

// createGrass(scene, { areaId, areaData, tier, camera, reducedMotion }) — the
// per-walk rig, in the session's { update, dispose } shape. Must be called
// AFTER rig.js's assignShadowCasters and after mergeStaticProps /
// createContactShadows have scanned the scene, so none of them ever sees it
// (rig.js also skips `userData.grass`, belt and braces). A no-op stub for an
// area without a lawn or a tier with grass off.
// `keepOut` is extra [{ x, z, r }] circles that hold no collider but must stay
// clear of tufts: the walk passes its rest spots (a 2cm doormat would have
// tufts poking through it around a napping cat) and its carryables' start and
// landing spots (an 8cm acorn would sit hidden in 6-15cm tufts).
export function createGrass(scene, { areaId, areaData, tier, camera, reducedMotion = false, keepOut = [] }) {
  const style = GRASS_STYLES[areaId];
  const radius = (tier?.grassRadius ?? 0) * (style?.reach ?? 1);
  const spacing = tier?.grassSpacing ?? 0;
  if (!style || !(radius > 0) || !(spacing > 0) || !areaData?.bounds) return NO_GRASS;

  const t0 = performance.now(); // maskMs: for a harness; ~4ms in Node
  const masked = keepOut.length
    ? { ...areaData, colliders: [...(areaData.colliders ?? []), ...keepOut] }
    : areaData;
  const mask = buildGrassMask(masked, flatFootprints(scene));
  const maskMs = performance.now() - t0;
  const chunk = chunkCellsFor(spacing);
  const capacity = capacityFor(radius, spacing);

  const material = new THREE.MeshStandardMaterial({
    color: style.color ?? areaData.groundBounce ?? 0x6cb058,
    // Matte, same as the 'grass' surface preset the lawn wears (0.95), and no
    // metalness: the tufts should read as the lawn, standing up.
    roughness: 0.95,
    metalness: 0,
    vertexColors: true,
  });
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0 },
    uFocus: { value: new THREE.Vector2() },
    uFade: { value: new THREE.Vector2(radius * FADE_START, radius) },
    uWindDir: { value: new THREE.Vector2(...WIND_DIR) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uAmp;
uniform vec2 uFocus;
uniform vec2 uFade;
uniform vec2 uWindDir;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  // Instance root in world space (the mesh itself sits at the origin).
  vec2 root = instanceMatrix[3].xz;
  // Edge fade: shrink toward the root as the tuft nears the radius.
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, distance(root, uFocus));
  transformed *= fade;
  // Sway: tips only (local y is 0 at the root, ~1 at the tip), squared so
  // the blade bends rather than shears. A travelling wave across the lawn.
  float phase = dot(root, vec2(0.61, 0.37));
  float s = sin(uTime * ${SWAY_FREQ.toFixed(2)} + phase) + 0.35 * sin(uTime * ${(SWAY_FREQ * 1.63).toFixed(3)} + phase * 1.7);
  float tip = position.y * position.y;
  // World offset, as a fraction of the tuft's height, mapped back into the
  // instance's local frame (M = R*S, so M^-1 v = M^T v / S^2).
  float sy = length(instanceMatrix[1].xyz);
  float sx = length(instanceMatrix[0].xyz);
  vec3 world = vec3(uWindDir.x, 0.0, uWindDir.y) * (uAmp * s * tip * sy * fade);
  transformed += (transpose(mat3(instanceMatrix)) * world) / vec3(sx * sx, sy * sy, sx * sx);
}`);
  };
  // A distinct program key so three never shares this patched program with a
  // plain MeshStandardMaterial.
  material.customProgramCacheKey = () => 'whisker-grass';

  const mesh = new THREE.InstancedMesh(tuftGeometry(), material, capacity);
  mesh.name = 'grass';
  mesh.userData.grass = true;
  // Ground cover never casts (0 shadow-pass draws), but it does receive: a
  // tuft under a tree's shadow must be in shadow like the lawn around it.
  // Receiving costs shader work on its own pixels, not a draw call.
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // Never culled: the instances are rewritten as the view moves, and three's
  // cached instance bounding sphere would go stale (contactshadows.js has the
  // same note). The patch is always around the camera anyway.
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  // Allocate instanceColor up front at full capacity.
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const c = new THREE.Color();
  const centre = new THREE.Vector3();
  const lead = radius * LEAD_FRACTION;
  let lastCx = NaN;
  let lastCz = NaN;

  function relay(cx, cz) {
    const n = layoutTufts(cx, cz, { radius, spacing }, mask, (t, i) => {
      q.setFromAxisAngle(up, t.rot);
      p3.set(t.x, 0, t.z);
      s3.set(t.s, t.h, t.s);
      m4.compose(p3, q, s3);
      mesh.setMatrixAt(i, m4);
      c.setRGB(t.tint[0], t.tint[1], t.tint[2]);
      mesh.setColorAt(i, c);
    }, style);
    mesh.count = n;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, n * 16);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, n * 3);
    mesh.instanceColor.needsUpdate = true;
  }

  // update(t, intensity) — once per rendered frame, after the camera moved.
  // `t` and `intensity` are exactly what wind.update takes (absolute elapsed
  // time; 1 = breeze, 1.7 in rain) and the gust envelope is wind.js's own, so
  // the lawn and the bushes breathe together.
  function update(t = 0, intensity = 1) {
    fitCentre(camera, lead, centre);
    const { cx, cz } = snapCentre(centre.x, centre.z, spacing, chunk);
    if (cx !== lastCx || cz !== lastCz) {
      relay(cx, cz);
      lastCx = cx;
      lastCz = cz;
    }
    uniforms.uFocus.value.set(centre.x, centre.z);
    uniforms.uTime.value = t;
    const k = Math.min(Math.max(intensity, 0), MAX_INTENSITY);
    // Reduced motion: no sway at all (the same rule wind.js follows).
    uniforms.uAmp.value = reducedMotion ? 0 : style.sway * (1 + GUST_DEPTH * Math.sin(t * GUST_FREQUENCY)) * k;
  }

  function dispose() {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    mesh.dispose();
  }

  update(0, 1); // lay out the first patch before the first frame
  return { mesh, mask, capacity, maskMs, get count() { return mesh.count; }, update, dispose };
}
