import * as THREE from 'three';
import { onAnyDeck, waterClearance } from '../world/builder.js';
import { wetness } from '../world/seaside.js';

// ---------------------------------------------------------------------------
// PAW PRINTS — the cat leaves a fading trail of little paws behind it, so
// walking feels like it touches the world (Stream 4 round four,
// docs/VISUAL-PASS.md "Stream 4 round four — paw prints").
//
// THE BUDGET. One InstancedMesh, one material: ONE draw call in the main pass
// and NONE in the shadow pass (castShadow false; rig.js and mergeprops.js skip
// `userData.pawPrints`). Prints live in a fixed ring of `capacity` slots: a new
// print overwrites the oldest, so memory never grows however long the walk.
//
// THE FADE IS ON THE GPU. Each slot carries when it was laid and its sequence
// number; the shader fades it by age (uTime) and by how close it is to being
// recycled (uHead), so the CPU writes one slot per print and nothing per
// frame except two uniforms. A print about to be overwritten has already
// faded out, so a fast cat whose trail outruns the ring never sees a print pop.
//
// THE SHAPE IS IN THE FRAGMENT SHADER: a main pad and four toe beans as a
// distance field on a 2-triangle quad, with a screen-space soft edge. No
// texture, so nothing to load and nothing to dispose, and the paw stays crisp
// at any distance.
//
// PURELY LOCAL. Nothing here sends a wire event or touches the walk's seeded
// RNG: a co-walker's game must not change because my cat left a footprint.
// The little jitter on each print comes from its own sequence number.
// ---------------------------------------------------------------------------

// Print size, metres, toe to heel. A real cat's paw is ~4cm; this cat is a
// stylised 0.4m and the camera sits 4.5m back, so 17cm is what reads as a paw
// rather than a speck (0.12 was checked in the harness and read as dots).
export const PRINT_SIZE = 0.17;
// Half the gap between the left and right track, metres. A walking cat's
// prints nearly fall on one line (the hind paw lands in the fore paw's print),
// so this is narrow: a gentle zig-zag, not two rails.
export const TRACK_HALF_WIDTH = 0.07;
// Height above y 0: over the ground, the Seaside wet sand (0.008) and the
// path strips (0.01); under the contact-shadow decals (0.015), the puddles
// (0.02), the boardwalk (0.03) and the sea (0.05). See VISUAL-PASS.md's layer
// list in the round-four entry.
export const PRINT_Y = 0.012;
// Before the contact shadows (-1): a print is the very bottom layer, and the
// cat's own soft shadow should darken the print it is standing on.
const RENDER_ORDER = -2;
// A frame that moved further than this was a teleport (a perch hop-down, a
// respawn, a chase snap), not a step: no prints across the gap.
const TELEPORT = 1.5;
// The oldest few slots in the ring fade out before they are reused.
const RING_FADE = 6;
// The pushed-up ridge round a deep print (only dry sand has one).
const RIM_COLOR = 0xf4e6c4;
// Fraction of a print's life it spends at full strength before fading.
const HOLD = 0.35;

// What each surface does with a paw. `color` is the print's own colour (an
// sRGB hex: a darker shade of the ground it is pressed into), `alpha` how
// strongly it shows, `rim` the strength of the light ridge of pushed-up sand
// round a deep print, and `life` a multiplier on the tier's fade time (damp
// stone dries faster than sand fills in).
export const SURFACES = Object.freeze({
  // Dry beach: deep, clear prints with a pale rim. Strong on purpose — the
  // beach sits high on ACES's shoulder (see seaside.js's WET_TINT note), so a
  // gentle darkening is invisible. 0x7a6440 at 0.85 measured as faint grey
  // specks in verify-places (?area=seaside&paws, the cat's-eye view): the
  // nearest pad darkened the sand by at most 47 of 209 (sRGB luma), roughly
  // the 0.5 multiplier that is only just visible. 0x4e3d2a at full alpha
  // darkens it by 92, the ~0.35 that reads clearly, and is still a warm
  // brown hollow inside its pale rim rather than a black hole.
  sand: Object.freeze({ color: 0x4e3d2a, alpha: 1, rim: 0.45, life: 1 }),
  // The wet band at the waterline: darker, crisp, no rim (wet sand holds a
  // clean edge). The band is itself ~0.37x the beach, so these need more
  // strength than their colour suggests: 0.62 darkened it by 74 of 184, 0.75
  // by 90, in line with the dry trail.
  wetSand: Object.freeze({ color: 0x3a3022, alpha: 0.75, rim: 0, life: 1 }),
  // The Docks' wet cobbles: damp prints that dry off quicker. Faint on
  // screen even at 0.6 — the setts are dark and busy (0.32 vanished).
  stone: Object.freeze({ color: 0x18181c, alpha: 0.6, rim: 0, life: 0.7 }),
  // The Docks' flagstone quays and pavements: fainter still.
  flagstone: Object.freeze({ color: 0x45423c, alpha: 0.42, rim: 0, life: 0.7 }),
  // Gravel and packed-earth paths: faint dusty prints.
  gravel: Object.freeze({ color: 0x7a6a52, alpha: 0.4, rim: 0, life: 0.85 }),
});

// The per-area rule. `ground` is what the bare ground plane is, `path` what a
// builder.path() strip (name 'path') is, and `strip` what any other flat strip
// lying on the ground is (sidewalks, the boardwalk). null = no prints: lawn
// grass, wood decking and concrete sidewalks take none. Areas missing here
// (the den: wooden floor) get the module's no-op stub.
export const AREA_RULES = Object.freeze({
  park: Object.freeze({ ground: null, path: 'gravel', strip: null }),
  neighborhood: Object.freeze({ ground: null, path: 'gravel', strip: null }),
  seaside: Object.freeze({ ground: 'sand', path: 'sand', strip: null, wetBand: true }),
  docks: Object.freeze({ ground: 'stone', path: 'flagstone', strip: 'flagstone' }),
});

// Where the Seaside's wet band takes over from dry sand: wetness() is 0 on
// dry beach and 1 at the waterline, and the band reads as wet from about here.
const WET_FROM = 0.3;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in test/pawprints.test.js)
// ---------------------------------------------------------------------------

// groundStrips(scene) — every top-level flat strip lying on the ground (not
// the ground plane itself), tagged by whether it is a builder.path(). The same
// read-it-off-the-scene approach as grass.js's flatFootprints, but it keeps
// the name, which is what tells a gravel path from a sidewalk or a boardwalk.
// Only PlaneGeometry: discs are puddles and ponds, which areaData already
// lists. Returns [{ path, x, z, ux, uz, halfW, halfL }].
const _o = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _ay = new THREE.Vector3();
const _n = new THREE.Vector3();
export function groundStrips(scene) {
  const out = [];
  for (const child of scene.children) {
    if (!child.isMesh || child.isInstancedMesh || child.geometry?.type !== 'PlaneGeometry') continue;
    const p = child.geometry.parameters;
    child.updateMatrixWorld(true);
    const e = child.matrixWorld.elements;
    _o.setFromMatrixPosition(child.matrixWorld);
    if (_o.y > 0.1) continue; // the pier deck (0.25), signs, windows
    _ax.set(e[0], e[1], e[2]);
    _ay.set(e[4], e[5], e[6]);
    _n.crossVectors(_ax, _ay).normalize();
    if (Math.abs(_n.y) < 0.95) continue; // not lying flat
    const halfW = (p.width / 2) * _ax.length();
    const halfL = (p.height / 2) * _ay.length();
    // The ground plane, and the Seaside's 140m wet band (handled by wetness()).
    if (Math.max(halfW, halfL) > 50) continue;
    const len = Math.hypot(_ay.x, _ay.z) || 1;
    out.push({ path: child.name === 'path', x: _o.x, z: _o.z, ux: _ay.x / len, uz: _ay.z / len, halfW, halfL });
  }
  return out;
}

function inStrip(s, x, z) {
  const dx = x - s.x;
  const dz = z - s.z;
  return Math.abs(dx * s.ux + dz * s.uz) <= s.halfL && Math.abs(-dx * s.uz + dz * s.ux) <= s.halfW;
}

// surfaceAt(areaId, areaData, strips, x, z) — the SURFACES key a paw at
// (x, z) presses into, or null for none. Water, decks over water (the pier,
// the Docks' bridges) and puddles always take none.
export function surfaceAt(areaId, areaData, strips, x, z) {
  const rule = AREA_RULES[areaId];
  if (!rule) return null;
  const waters = areaData?.waters;
  if (waters?.length) {
    if (onAnyDeck(waters, x, z)) return null;
    if (waterClearance(waters, x, z) < 0) return null;
  }
  for (const p of areaData?.puddles ?? []) {
    if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) return null;
  }
  // A non-path strip (a sidewalk, the boardwalk) sits ON TOP of any path it
  // crosses, so it wins; among paths any one will do.
  let onPath = false;
  for (const s of strips) {
    if (!inStrip(s, x, z)) continue;
    if (!s.path) return rule.strip;
    onPath = true;
  }
  if (onPath) return rule.path;
  if (rule.wetBand && rule.ground && wetness(x, z) >= WET_FROM) return 'wetSand';
  return rule.ground;
}

// strideFor(speed) — metres of travel between one print and the next. A
// trotting cat reaches further per step, and a longer stride also keeps a
// sprinting cat from burning through the ring in a second or two.
export function strideFor(speed) {
  return Math.min(0.6, Math.max(0.24, 0.22 + 0.06 * (speed || 0)));
}

// printAlpha(age, life, behind, capacity) — the strength multiplier the
// shader applies (mirrored here so it can be tested): full for the first
// HOLD of its life, then a smooth fade to 0 at `life` seconds; also faded out
// over the last RING_FADE slots before the ring reuses it. `behind` is how
// many prints have been laid since this one.
export function printAlpha(age, life, behind = 0, capacity = Infinity) {
  if (age < 0 || !(life > 0)) return 0;
  const u = Math.min(1, Math.max(0, (age - HOLD * life) / ((1 - HOLD) * life)));
  const ageFade = 1 - u * u * (3 - 2 * u);
  const ringFade = Math.min(1, Math.max(0, (capacity - 1 - behind) / RING_FADE));
  return ageFade * ringFade;
}

// A small deterministic 0..1 hash of an integer, for per-print jitter (never
// the walk's seeded RNG — see the header).
function jitter(n, salt) {
  let h = Math.imul((n | 0) ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// createTrail({ stride }) — the gait, separate from the mesh so it can be
// tested without one. step(x, z, grounded, dt, out) returns a print to lay
// this frame ({ x, z, yaw, side, seq }) or null; with `out` it fills and
// returns that object instead of allocating one (createPawPrints passes a
// scratch, so laying a print allocates nothing). Prints alternate left/right of the
// line the cat walks, one per stride of actual travel: a cat standing still,
// walking into a wall, in the air or swimming lays nothing.
export function createTrail() {
  let lastX = NaN;
  let lastZ = NaN;
  let travelled = 0;
  let anchorX = NaN; // where the previous print's step was taken
  let anchorZ = NaN;
  let speed = 0;
  let seq = 0;

  function reset(x, z) {
    lastX = x; lastZ = z;
    anchorX = NaN; anchorZ = NaN;
    travelled = 0;
  }

  function step(x, z, grounded, dt = 1 / 60, out = null) {
    if (!Number.isFinite(lastX)) { reset(x, z); return null; }
    const dx = x - lastX;
    const dz = z - lastZ;
    const d = Math.hypot(dx, dz);
    if (d > TELEPORT || !grounded) { reset(x, z); speed = 0; return null; }
    lastX = x; lastZ = z;
    if (dt > 0) speed += (d / dt - speed) * Math.min(1, dt * 6); // eased m/s
    travelled += d;
    if (travelled < strideFor(speed) || d < 1e-5) return null;
    travelled = 0;
    // Heading: along the last stride when there is one (steadier than one
    // frame's delta), else this frame's movement.
    let fx = dx;
    let fz = dz;
    if (Number.isFinite(anchorX)) { fx = x - anchorX; fz = z - anchorZ; }
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    anchorX = x; anchorZ = z;
    const side = seq % 2 === 0 ? -1 : 1; // -1 left, +1 right
    // The cat's right, walking along (fx, fz) with y up, is (-fz, fx).
    const off = side * TRACK_HALF_WIDTH * (0.85 + 0.3 * jitter(seq, 1));
    const px = x - fz * off;
    const pz = z + fx * off;
    // Toes splay a touch outward, plus a small per-print wobble.
    const yaw = Math.atan2(fx, fz) - side * 0.14 + (jitter(seq, 2) - 0.5) * 0.16;
    const o = out ?? {};
    o.x = px;
    o.z = pz;
    o.yaw = yaw;
    o.side = side;
    o.seq = seq++;
    return o;
  }

  return { step, reset, get speed() { return speed; } };
}

// ---------------------------------------------------------------------------
// The quad: unit size, lying flat in XZ, toes toward local +Z (instance yaw
// turns +Z to the heading). uv (0..1) is the paw's own frame.
// ---------------------------------------------------------------------------
function printGeometry() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2); // +Y (toes in uv) -> -Z
  g.rotateY(Math.PI); // toes -> +Z
  return g;
}

const NO_PRINTS = Object.freeze({ mesh: null, capacity: 0, count: 0, update() {}, dispose() {} });

// createPawPrints(scene, { areaId, areaData, tier }) — the per-walk rig, in
// the session's { update, dispose } shape. Call AFTER rig.js's
// assignShadowCasters and after mergeStaticProps / createContactShadows have
// scanned the scene (walk.js does, beside createGrass), so none of them sees
// the mesh. A no-op stub for an area with no printable ground (the den) or a
// tier with prints off.
export function createPawPrints(scene, { areaId, areaData, tier } = {}) {
  const capacity = Math.floor(tier?.pawPrints ?? 0);
  const life = tier?.pawFade ?? 0;
  if (!AREA_RULES[areaId] || !(capacity > 0) || !(life > 0)) return NO_PRINTS;

  const strips = groundStrips(scene);
  const trail = createTrail();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    // Matte like the ground it is pressed into; colour comes per instance.
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const uniforms = {
    uTime: { value: 0 },
    uLife: { value: life },
    uHead: { value: -1 },
    uCap: { value: capacity },
    // Pale dry sand, a step lighter than the beach: the ridge round a deep
    // print catches the sun.
    uRimColor: { value: new THREE.Color(RIM_COLOR) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aPrint; // laid-at time, sequence number, life scale, rim
attribute float aAlpha; // the surface's strength
uniform float uTime;
uniform float uLife;
uniform float uHead;
uniform float uCap;
varying vec2 vPawUv;
varying float vPawAlpha;
varying float vPawRim;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vPawUv = uv;
  float life = uLife * aPrint.z;
  float u = clamp((uTime - aPrint.x - ${HOLD.toFixed(2)} * life) / (${(1 - HOLD).toFixed(2)} * life), 0.0, 1.0);
  float ageFade = 1.0 - u * u * (3.0 - 2.0 * u);
  float ringFade = clamp((uCap - 1.0 - (uHead - aPrint.y)) / ${RING_FADE.toFixed(1)}, 0.0, 1.0);
  vPawAlpha = aAlpha * ageFade * ringFade * step(aPrint.y, uHead);
  vPawRim = aPrint.w;
  // A faded-out print collapses to a point: no pixels, no blending cost.
  transformed *= step(0.001, vPawAlpha);
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vPawUv;
varying float vPawAlpha;
varying float vPawRim;
uniform vec3 uRimColor;
float pawEllipse(vec2 p, vec2 c, vec2 r) {
  vec2 q = (p - c) / r;
  return (length(q) - 1.0) * min(r.x, r.y);
}
// Signed distance (uv units) to a paw: a broad heel pad and four toe beans.
float pawDist(vec2 p) {
  // The heel pad: a wide ellipse, its back edge flattened by a second one.
  float pad = max(pawEllipse(p, vec2(0.5, 0.36), vec2(0.21, 0.17)),
                  -pawEllipse(p, vec2(0.5, 0.10), vec2(0.10, 0.08)));
  float d = pad;
  d = min(d, pawEllipse(p, vec2(0.25, 0.60), vec2(0.075, 0.09)));
  d = min(d, pawEllipse(p, vec2(0.41, 0.73), vec2(0.075, 0.095)));
  d = min(d, pawEllipse(p, vec2(0.59, 0.73), vec2(0.075, 0.095)));
  d = min(d, pawEllipse(p, vec2(0.75, 0.60), vec2(0.075, 0.09)));
  return d;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float d = pawDist(vPawUv);
  float aa = max(fwidth(d), 0.004);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  // The pale ridge of pushed-up sand just outside a deep print.
  float rim = vPawRim * (1.0 - smoothstep(0.0, 0.05, d)) * (1.0 - inside);
  diffuseColor.rgb = mix(diffuseColor.rgb, uRimColor, rim / max(rim + inside, 1e-3));
  diffuseColor.a *= (inside + rim) * vPawAlpha;
  if (diffuseColor.a < 0.004) discard;
}`);
  };
  material.customProgramCacheKey = () => 'whisker-pawprints';

  const geometry = printGeometry();
  // Per-slot [laidAt, seq, lifeScale, rim] and the surface's strength in its
  // own attribute (three's instanceColor is RGB only). A slot never laid has
  // seq -1e9, which the shader's ring fade puts at 0.
  const printData = new Float32Array(capacity * 4);
  for (let i = 0; i < capacity; i++) printData[i * 4 + 1] = -1e9; // never laid
  const aPrint = new THREE.InstancedBufferAttribute(printData, 4);
  aPrint.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPrint', aPrint);
  const alphas = new Float32Array(capacity);
  const aAlpha = new THREE.InstancedBufferAttribute(alphas, 1);
  aAlpha.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aAlpha', aAlpha);

  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'pawPrints';
  mesh.userData.pawPrints = true;
  mesh.castShadow = false; // 0 shadow-pass draws
  // Receives, so a print in a tree's shadow is in shadow like the sand round
  // it rather than glowing. Shader work on its own few pixels, no draw call.
  mesh.receiveShadow = true;
  mesh.renderOrder = RENDER_ORDER;
  // Never culled: instances are rewritten all walk and three's cached
  // instance bounding sphere would go stale (grass.js has the same note).
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const c = new THREE.Color();
  const colors = {};
  for (const [k, s] of Object.entries(SURFACES)) colors[k] = new THREE.Color(s.color);
  let laid = 0;
  let now = 0;
  // The print laid this frame, reused: update() returns it, so it is only
  // good until the next update (the render loop ignores it; tests read it
  // straight away).
  const print = { x: 0, z: 0, yaw: 0, side: 0, seq: 0, kind: null };

  // lay(print, kind) — write one print into the next ring slot.
  function lay(pr, kind) {
    const s = SURFACES[kind];
    const slot = laid % capacity;
    q.setFromAxisAngle(up, pr.yaw);
    p3.set(pr.x, PRINT_Y, pr.z);
    // The paw is symmetric, so left and right need no mirroring (a negative
    // scale would also flip the quad's winding and cull it).
    s3.set(PRINT_SIZE * 0.9, 1, PRINT_SIZE);
    m4.compose(p3, q, s3);
    mesh.setMatrixAt(slot, m4);
    mesh.setColorAt(slot, c.copy(colors[kind]));
    printData[slot * 4] = now;
    printData[slot * 4 + 1] = laid;
    printData[slot * 4 + 2] = s.life;
    printData[slot * 4 + 3] = s.rim;
    alphas[slot] = s.alpha;
    laid++;
    mesh.count = Math.min(laid, capacity);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    aPrint.needsUpdate = true;
    aAlpha.needsUpdate = true;
    uniforms.uHead.value = laid - 1;
  }

  // update(dt, { x, z, grounded }) — once per frame with the cat's position
  // and whether its paws are on the ground (not perched, mid-hop or
  // swimming). Reads the three fields and keeps no reference to the object,
  // so the render loop passes the same one every frame. Returns the print
  // laid this frame ({ x, z, yaw, side, seq, kind }, a reused object), or
  // null (for tests).
  function update(dt = 0, { x, z, grounded = true } = {}) {
    now += Math.max(0, dt || 0);
    uniforms.uTime.value = now;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    if (!trail.step(x, z, grounded, dt, print)) return null;
    const kind = surfaceAt(areaId, areaData, strips, print.x, print.z);
    if (!kind) return null;
    print.kind = kind;
    lay(print, kind);
    return print;
  }

  function dispose() {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    mesh.dispose();
  }

  return {
    mesh, capacity, strips,
    get count() { return mesh.count; },
    get laid() { return laid; },
    update, dispose,
  };
}
