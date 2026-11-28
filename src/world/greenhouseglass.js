// =============================================================================
// THE GLASS-HOUSE KIT (Greenhouse milestone 0). Four cheap flat parts, no real refraction, no lights:
//   * the frame: ribs, purlins, door posts and a low plinth, ONE opaque vertex-coloured mesh;
//   * the glass: ONE transparent mesh of quads, a vertical colour gradient, FRONT FACES ONLY, SOMEWHAT FROSTED
//     (about 25 to 35 percent opaque, tinted green-white): from outside she sees a soft pane and the cat and the
//     plants inside read through it as soft shapes; from inside the pane is culled (clear views, no overdraw).
//     The glass house is NOT a fading building (the owner, 2026-11-23): it carries no userData.window, so the
//     walk camera's building fade (treefade.js) and the dusk swap (dusk.js) both leave it alone, and neither
//     the frame nor the cat inside is ever hidden when the camera stands outside and the line crosses it;
//   * mist: flat soft sheets on one shader mesh with one uTime; sun shafts: additive vertex-faded quads;
//   * the dapple: one flat floor quad with a diamond-lattice light texture, drawn in build, never at import.
// The frame and the glass share ONE top-level group (the building the camera fades). The mist, the shafts, the
// floor and the dapple are top-level siblings, so the fade never clones a shader's uniforms.
// No Math.random, no clock: every number is a function of the plan.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01 } from './warehouselook.js';

export const COL = Object.freeze({
  frame: 0xe4eee2, plinth: 0x6f8a78, floor: 0xd9c9a4, post: 0xcfdccb,
  paneLow: 0xe8f6ec, paneHigh: 0xd6eedd, shaft: 0xffe2a8, mist: 0xf4faf7,
});
// Frosted: 0.32 on the walls, 0.34 on the roof (the owner's 25 to 35 percent), a wetter edge in the lowest 0.4 m
// that stays inside the band.
export const GLASS_ALPHA = Object.freeze({ wall: 0.32, roof: 0.34, wet: 0.01 });
const ARC_SEGMENTS = 12;
const RIB_X = [-14, -12, -10, -8, -6, -4, -1.5, 1.5, 4, 6, 8, 10, 12, 14]; // 14 ribs; the middle bay is the door's

// The rib stations of any house: the Palm House's own list, or (a stage-B room) an even spacing of about 2 m either side of the
// long-wall door's 3 m bay. The door's x is the south or north door's, or the house's middle.
export function ribsOf(h, doors = []) {
  if (h.x0 === -14 && h.x1 === 14) return RIB_X;
  const d = doors.find((k) => k.side === 'south' || k.side === 'north');
  const dx = d ? d.x : (h.x0 + h.x1) / 2;
  const half = h.doorW / 2;
  const side = (a, b) => {
    const n = Math.max(1, Math.round((b - a) / 2));
    return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  };
  return [...side(h.x0, dx - half), ...side(dx + half, h.x1)];
}
const doorX = (doors, side, h) => doors.find((d) => d.side === side)?.x ?? (h.x0 + h.x1) / 2;

const _col = new THREE.Color();
const _a = new THREE.Color();
const _b = new THREE.Color();

// A box from a to b, `w` x `h` in section, its length along the line.
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _mid = new THREE.Vector3();
function beam(ax, ay, az, bx, by, bz, w, h, hex, caps = true) {
  _p.set(ax, ay, az);
  _q.set(bx, by, bz);
  const len = _p.distanceTo(_q);
  const g = new THREE.BoxGeometry(w, h, len);
  // beauty pass 2: a rib's two ends are never seen (each sits against the next rib segment, the plinth or the ridge): no end faces
  if (!caps) g.setIndex(Array.from(g.index.array).slice(0, 24));
  const dir = _q.clone().sub(_p).normalize();
  const upv = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : _up;
  _m.lookAt(_p, _q, upv);
  _mid.copy(_p).add(_q).multiplyScalar(0.5);
  _m.setPosition(_mid);
  g.applyMatrix4(_m);
  return paint(g, hex);
}
function paint(g, hex) {
  _col.set(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([_col.r, _col.g, _col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}

// ---------------------------------------------------------------------------------------------
// The house's cross-section: a polyline in (z, y) from the north foot over the arch to the south foot.
export function profileOf(h) {
  const zc = (h.z0 + h.z1) / 2;
  const hw = (h.z1 - h.z0) / 2;
  const rise = h.ridge - h.wallH;
  const arc = [];
  const segs = h.arcSegments ?? ARC_SEGMENTS; // (a stage-B room draws a coarser arch: fewer beams)
  for (let k = 0; k <= segs; k++) {
    const th = (k * Math.PI) / segs;
    arc.push({ z: zc - hw * Math.cos(th), y: h.wallH + rise * Math.sin(th), roof: k > 0 && k < segs });
  }
  arc[0].z = h.z0; arc[segs].z = h.z1;
  return [{ z: h.z0, y: h.plinth, roof: false }, ...arc, { z: h.z1, y: h.plinth, roof: false }];
}
const topAt = (arc, z) => {
  for (let i = 0; i + 1 < arc.length; i++) {
    const a = arc[i], b = arc[i + 1];
    if (z >= a.z - 1e-9 && z <= b.z + 1e-9) return a.y + ((b.y - a.y) * (z - a.z)) / Math.max(1e-9, b.z - a.z);
  }
  return arc[arc.length - 1].y;
};

// ---------------------------------------------------------------------------------------------
// The glass: quads, wound to face OUTWARD (the material is front-sided, so the inside sees nothing).
function glassGeometry(h, doors) {
  const prof = profileOf(h);
  const zc = (h.z0 + h.z1) / 2;
  const pos = [];
  const col = [];
  const idx = [];
  const colorAt = (y) => {
    _a.set(COL.paneLow); _b.set(COL.paneHigh);
    _col.copy(_a).lerp(_b, Math.min(1, Math.max(0, (y - h.plinth) / (h.ridge - h.plinth))));
    const roofT = Math.min(1, Math.max(0, (y - h.wallH) / (h.ridge - h.wallH)));
    const wet = GLASS_ALPHA.wet * (1 - Math.min(1, Math.max(0, (y - h.plinth) / 0.4)));
    return [_col.r, _col.g, _col.b, GLASS_ALPHA.wall + (GLASS_ALPHA.roof - GLASS_ALPHA.wall) * roofT + wet];
  };
  // A quad of four points a b c d (in order round it); its winding is made to face `out`.
  const quad = (A, B, C, D, out) => {
    const base = pos.length / 3;
    // beauty round 4: each pane its own faint tone (a little greener, bluer or paler); the alpha is never touched
    const tone = 0.98 + 0.05 * hash01(Math.round(A[0] * 10), Math.round((A[1] + A[2]) * 10), 0x91a5);
    const greener = hash01(Math.round(A[0] * 10), Math.round((A[1] * 3 + A[2]) * 10), 0x91a6) < 0.22 ? 0.95 : 1;
    for (const P of [A, B, C, D]) { const c = colorAt(P[1]); pos.push(P[0], P[1], P[2]); col.push(c[0] * tone * greener, c[1] * tone, c[2] * tone * greener, c[3]); }
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const southDoor = doors.find((d) => d.side === 'south');
  const northDoor = doors.find((d) => d.side === 'north');
  const half = h.doorW / 2;
  const ribs = ribsOf(h, doors);
  // the long surface: each profile segment, bay by bay
  for (let s = 0; s + 1 < prof.length; s++) {
    const a = prof[s], b = prof[s + 1];
    const dz = b.z - a.z, dy = b.y - a.y;
    const out = [0, dz, -dy]; // the 90-degree turn of the travel in the (z, y) plane: up on the roof, -z on the north wall, +z on the south
    const northWall = s === 0, southWall = s === prof.length - 2;
    for (let i = 0; i + 1 < ribs.length; i++) {
      const xa = ribs[i], xb = ribs[i + 1];
      let A = [xa, a.y, a.z], B = [xb, a.y, a.z], C = [xb, b.y, b.z], D = [xa, b.y, b.z];
      const wallDoor = northWall ? northDoor : southWall ? southDoor : null;
      const inDoorBay = !!wallDoor && xa >= wallDoor.x - half - 1e-6 && xb <= wallDoor.x + half + 1e-6;
      if (inDoorBay) {
        // only the transom above the doorway (the wall segment runs plinth to wall top)
        const up = Math.max(a.y, b.y);
        if (up - h.doorH < 0.05) continue;
        A = [xa, h.doorH, a.z]; B = [xb, h.doorH, a.z]; C = [xb, up, b.z]; D = [xa, up, b.z];
      }
      quad(A, B, C, D, out);
    }
  }
  // the arched ends: a strip between the plinth and the arch's top, split at the arc's nodes and the door's edges
  const arc = prof.slice(1, -1);
  const zs = [...new Set([...arc.map((p) => p.z), zc - half, zc + half])].sort((p, q) => p - q);
  for (const [x, sgn, side] of [[h.x0, -1, 'west'], [h.x1, 1, 'east']]) {
    const door = doors.some((d) => d.side === side);
    for (let i = 0; i + 1 < zs.length; i++) {
      const za = zs[i], zb = zs[i + 1];
      const inDoor = door && za >= zc - half - 1e-6 && zb <= zc + half + 1e-6;
      const lo = inDoor ? h.doorH : h.plinth;
      const ta = topAt(arc, za), tb = topAt(arc, zb);
      if (Math.min(ta, tb) - lo < 0.05 && ta - lo < 0.05) continue;
      quad([x, lo, za], [x, lo, zb], [x, tb, zb], [x, ta, za], [sgn, 0, 0]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function frameGeometry(h, doors) {
  const prof = profileOf(h);
  const zc = (h.z0 + h.z1) / 2;
  const half = h.doorW / 2;
  const parts = [];
  const T = 0.12;
  // ribs: the arch at every rib x, foot to foot (the wall segments are the first and last)
  for (const x of ribsOf(h, doors)) {
    for (let s = 0; s + 1 < prof.length; s++) {
      const a = prof[s], b = prof[s + 1];
      // the ribs beside a door (x = +-1.5) stand to the ground; every other rib starts at the plinth
      parts.push(beam(x, a.y, a.z, x, b.y, b.z, T, T, COL.frame, false));
    }
  }
  // purlins: one long beam at every node of the profile (ridge, arch nodes, wall tops)
  for (const p of prof.slice(1, -1)) parts.push(beam(h.x0, p.y, p.z, h.x1, p.y, p.z, T * 0.9, T * 0.9, COL.frame));
  // door posts and lintels
  for (const d of doors) {
    if (d.side === 'south' || d.side === 'north') {
      parts.push(beam(d.x - half, h.plinth, d.z, d.x - half, h.doorH, d.z, 0.2, 0.2, COL.post));
      parts.push(beam(d.x + half, h.plinth, d.z, d.x + half, h.doorH, d.z, 0.2, 0.2, COL.post));
      parts.push(beam(d.x - half, h.doorH, d.z, d.x + half, h.doorH, d.z, 0.2, 0.16, COL.post));
    } else {
      parts.push(beam(d.x, h.plinth, zc - half, d.x, h.doorH, zc - half, 0.2, 0.2, COL.post));
      parts.push(beam(d.x, h.plinth, zc + half, d.x, h.doorH, zc + half, 0.2, 0.2, COL.post));
      parts.push(beam(d.x, h.doorH, zc - half, d.x, h.doorH, zc + half, 0.2, 0.16, COL.post));
    }
  }
  // gable mullions on the two arched ends, standing off the door's span
  const arc = prof.slice(1, -1);
  for (const x of [h.x0, h.x1]) {
    for (const p of arc) {
      if (p.y <= h.wallH + 0.01) continue;
      if (Math.abs(p.z - zc) < half + 0.05) continue;
      parts.push(beam(x, h.plinth, p.z, x, p.y, p.z, T * 0.8, T * 0.8, COL.frame));
    }
  }
  // the plinth: a low dark wall round the foot, each door left open
  const wall = (x0, z0, x1, z1) => parts.push(beam(x0, h.plinth / 2, z0, x1, h.plinth / 2, z1, 0.36, h.plinth, COL.plinth));
  // (a side with no door is one whole wall; the Palm House has all four doors)
  const nx = doorX(doors, 'north', h), sx = doorX(doors, 'south', h);
  const has = (side) => doors.some((d) => d.side === side);
  if (has('north')) { wall(h.x0, h.z0, nx - half, h.z0); wall(nx + half, h.z0, h.x1, h.z0); } else wall(h.x0, h.z0, h.x1, h.z0);
  if (has('south')) { wall(h.x0, h.z1, sx - half, h.z1); wall(sx + half, h.z1, h.x1, h.z1); } else wall(h.x0, h.z1, h.x1, h.z1);
  for (const [side, x] of [['west', h.x0], ['east', h.x1]]) {
    if (has(side)) { wall(x, h.z0, x, zc - half); wall(x, zc + half, x, h.z1); } else wall(x, h.z0, x, h.z1);
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  // beauty round 4: the white ironwork is greener and darker at the foot (damp and algae) and brightest at the ridge
  const pp = g.attributes.position, cc = g.attributes.color;
  for (let i = 0; i < pp.count; i++) {
    const u = Math.min(1, Math.max(0, (pp.getY(i) - h.plinth) / Math.max(1e-6, h.ridge - h.plinth)));
    const damp = Math.max(0, 1 - u * 3.2);
    const k = 0.97 + 0.08 * u;
    cc.setXYZ(i, cc.getX(i) * k * (1 - 0.2 * damp), cc.getY(i) * k * (1 - 0.07 * damp), cc.getZ(i) * k * (1 - 0.24 * damp));
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Condensation (beauty GRN-1): small beads and a few slow runnels on the existing glass material, in the fragment shader
// only (no mesh, no triangle). Thicker near the ground; the beads sit still, the runnels creep on ONE shared clock
// (COND_TIME, set from the walk's clock by greenhouselife; reduced motion holds it at 0, so they show still).
// Its own fixed hash seed, never the walk's stream. The low tier draws none; every other non-high tier draws beads only.
export const COND_TIME = { value: 0 };
// Beauty pass 3 (the house reacts to her): where she is (x, z), how fast she moves (0 to 1) and whether to react at all (0 under reduced
// motion or before the first frame), and whether it rains. greenhouselife.js sets them each frame; the panes fog near her, the roof
// glass runs with rain, the drip rings ripple where she steps, and (greenhouseplants.js) the leaves bend away from her.
export const CAT_NEAR = { value: new THREE.Vector4(0, 0, 0, 0) };
export const RAIN_ON = { value: 0 };
export function condensation(material, quality = 'high') {
  if (quality === 'low') return material;
  const runnels = quality === 'high';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCondTime = COND_TIME;
    shader.uniforms.uCat = CAT_NEAR;
    shader.uniforms.uRain = RAIN_ON;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCondW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCondW = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uCondTime;
uniform vec4 uCat;
uniform float uRain;
varying vec3 vCondW;
float cH(vec2 q) { return fract(sin(dot(q, vec2(91.7, 263.3)) + 17.31) * 24634.6345); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float fade = 1.0 - smoothstep(14.0, 30.0, distance(cameraPosition, vCondW));
  if (fade > 0.01) {
    vec2 q = vec2(vCondW.x + vCondW.z, vCondW.y);
    float damp = mix(0.5, 0.1, smoothstep(0.2, 3.2, vCondW.y));
    vec2 cell = floor(q / 0.2), f = fract(q / 0.2);
    float h1 = cH(cell), h2 = cH(cell + 7.0);
    float r = 0.1 + 0.12 * h2;
    vec2 c = vec2(0.3 + 0.4 * cH(cell + 3.0), 0.3 + 0.4 * cH(cell + 5.0));
    float bead = (h1 < damp ? 1.0 : 0.0) * (1.0 - smoothstep(r * 0.6, r, length(f - c)));
    float lit = bead * smoothstep(0.0, 0.05, c.y + r * 0.35 - f.y + 0.1);
    float run = 0.0;
${runnels ? `    vec2 col = vec2(floor(q.x / 0.7), 0.0);
    float k1 = cH(col + 11.0), k2 = cH(col + 13.0), k3 = cH(col + 17.0);
    if (k1 < 0.22) {
      float cx = (col.x + 0.2 + 0.6 * k2) * 0.7;
      float ph = fract(k3 + uCondTime * 0.004 * (0.6 + k2));
      float head = 3.4 * (1.0 - ph) + 0.15;
      float trail = clamp((q.y - head) / 0.9, 0.0, 1.0);
      float w = 0.012 + 0.012 * (1.0 - trail);
      run = (1.0 - smoothstep(w * 0.5, w, abs(q.x - cx))) * (1.0 - trail) * step(head, q.y) * step(q.y, head + 0.9) * 0.55;
      float hd = length(vec2((q.x - cx) * 1.0, (q.y - head) * 0.7));
      run = max(run, 1.0 - smoothstep(0.018, 0.03, hd));
    }` : ''}
    // beauty pass 3: rain runs down the panes in bright streaks; a fog gathers on the glass near her
    float streak = 0.0;
    if (uRain > 0.01) {
      float rc = floor(q.x / 0.24);
      float rk = cH(vec2(rc, 41.0));
      if (rk < 0.7 * uRain) {
        float rx = (rc + 0.2 + 0.6 * cH(vec2(rc, 43.0))) * 0.24;
        float rph = fract(cH(vec2(rc, 47.0)) + uCondTime * (0.03 + 0.05 * rk));
        float rhead = 11.0 * (1.0 - rph);
        float rt = clamp((q.y - rhead) / 1.4, 0.0, 1.0);
        streak = (1.0 - smoothstep(0.02, 0.045, abs(q.x - rx))) * (1.0 - rt) * step(rhead, q.y) * step(q.y, rhead + 1.4) + (1.0 - smoothstep(0.04, 0.07, length(vec2(q.x - rx, (q.y - rhead) * 0.8))));
      }
    }
    float fogNear = uCat.w * (1.0 - smoothstep(2.5, 9.0, distance(vCondW.xz, uCat.xy))) * (0.75 + 0.25 * sin(q.x * 2.7 + q.y * 1.9 + uCondTime * 0.35)) * (0.5 + 0.5 * smoothstep(3.6, 0.3, vCondW.y));
    float cov = clamp(max(max(bead, run), streak), 0.0, 1.0) * fade;
    // beauty pass 2: the beads twinkle (each on its own beat) and a slow diagonal sheen of sky light crosses the panes
    float tw = 0.65 + 0.35 * sin(uCondTime * 1.3 + h1 * 40.0);
    float sheen = pow(max(0.0, sin(vCondW.x * 0.55 + vCondW.y * 0.42 + vCondW.z * 0.2 - uCondTime * 0.32)), 18.0) * fade;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 1.0, 0.96), 0.55 * cov + 0.3 * lit * tw * fade);
    diffuseColor.rgb += vec3(0.5, 0.55, 0.42) * sheen * 0.35;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.97, 0.94), 0.8 * fogNear * fade);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.7, 0.72), 0.3 * uRain * fade); // rain: the panes go grey and milky
    diffuseColor.a = min(1.0, diffuseColor.a + 0.34 * cov + 0.1 * sheen + 0.55 * fogNear * fade + 0.25 * streak * fade + 0.2 * uRain * fade);
  }
}`);
  };
  material.customProgramCacheKey = () => `greenhouse-condensation-${runnels ? 'r' : 'b'}-v3`;
  return material;
}

// The whole house: frame + glass in one top-level group (the building the camera fades).
export function glassHouse(h, doors, { name = 'glassHouse', quality = 'high' } = {}) {
  const group = new THREE.Group();
  group.name = name;
  const frame = new THREE.Mesh(frameGeometry(h, doors), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }));
  frame.name = `${name}-frame`;
  frame.userData.noCast = true; // a thin lattice would cost a shadow draw for no look: the floor gets the dapple instead
  frame.userData.noMerge = true;
  frame.castShadow = false;
  const glassMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  condensation(glassMat, quality);
  const glass = new THREE.Mesh(glassGeometry(h, doors), glassMat);
  glass.name = `${name}-glass`;
  glass.userData.glassHouse = true; // (no userData.window: neither the building fade nor the dusk swap may touch it)
  glass.userData.noCast = true;
  glass.userData.noMerge = true;
  glass.castShadow = false;
  glass.renderOrder = 1;
  group.add(frame, glass);
  return { group, frame, glass };
}

// ---------------------------------------------------------------------------------------------
// The floor and the dapple. The dapple's canvas is drawn here, inside build, never at import.
// The paved floor: a grid of flagstones (about `cell` m), each with its own hashed tone, a slightly lighter middle (a worn
// bevel) and a soft darkening along the walls where the glass meets the plinth. Five vertices a cell, four triangles, one mesh.
export function pavedGeometry(w, d, hex, { cell = 1.4, seed = 1, edge = 0.9, ao = 0.3 } = {}) {
  const nx = Math.max(1, Math.round(w / cell)), nz = Math.max(1, Math.round(d / cell));
  const cw = w / nx, cd = d / nz;
  const base = new THREE.Color(hex);
  const pos = [], col = [], idx = [];
  const shade = (x, z, k) => {
    const e = Math.min(x + w / 2, w / 2 - x, z + d / 2, d / 2 - z); // m from the nearest wall
    const f = k * (1 - ao * Math.max(0, 1 - e / edge) ** 2);
    col.push(base.r * f, base.g * f, base.b * f);
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = -w / 2 + i * cw, z0 = -d / 2 + j * cd, x1 = x0 + cw, z1 = z0 + cd;
      const tone = 0.9 + 0.17 * hash01(i, j, seed) + (((i + j) & 1) ? 0.02 : -0.02);
      const b = pos.length / 3;
      for (const [x, z, k] of [[x0, z0, 0.94], [x1, z0, 0.94], [x1, z1, 0.94], [x0, z1, 0.94], [(x0 + x1) / 2, (z0 + z1) / 2, 1.03]]) {
        pos.push(x, 0, z);
        shade(x, z, tone * k);
      }
      idx.push(b, b + 4, b + 1, b + 1, b + 4, b + 2, b + 2, b + 4, b + 3, b + 3, b + 4, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function floorQuad(h, hex = COL.floor, name = 'glassFloor') {
  const g = pavedGeometry(h.x1 - h.x0 - 0.4, h.z1 - h.z0 - 0.4, hex, { seed: Math.round(h.x0 * 7 + h.z0 * 13) & 0xffff });
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  m.position.set((h.x0 + h.x1) / 2, 0.03, (h.z0 + h.z1) / 2);
  m.name = name;
  m.receiveShadow = true;
  return m;
}

export function dappleQuad(h, { size = 64, name = 'glassDapple' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  // a diamond lattice of soft light squares: the roof's ribs and purlins, thrown on the floor
  ctx.fillStyle = 'rgba(255, 238, 190, 0.34)';
  const step = size / 4;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const cx = (i + 0.5) * step, cy = (j + 0.5) * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy - step * 0.34); ctx.lineTo(cx + step * 0.34, cy); ctx.lineTo(cx, cy + step * 0.34); ctx.lineTo(cx - step * 0.34, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  // beauty round 4: soft round blobs of light between the diamonds, as light comes through leaves
  for (const [bx, by, br] of [[0.5, 0.5, 0.11], [0.0, 0.0, 0.08], [0.0, 1.0, 0.08], [1.0, 0.0, 0.08], [1.0, 1.0, 0.08]]) {
    const gr = ctx.createRadialGradient(bx * size, by * size, 0, bx * size, by * size, br * size);
    gr.addColorStop(0, 'rgba(255, 244, 205, 0.3)');
    gr.addColorStop(1, 'rgba(255, 244, 205, 0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = h.x1 - h.x0 - 0.4, d = h.z1 - h.z0 - 0.4;
  tex.repeat.set(Math.round(w / 2), Math.round(d / 2));
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -1 }));
  m.position.set((h.x0 + h.x1) / 2, 0.05, (h.z0 + h.z1) / 2);
  m.name = name;
  m.userData.noCast = true;
  m.userData.noMerge = true;
  m.castShadow = false;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Sun shafts: tall additive quads under the ridge, brighter at the top and fading to nothing at the floor.
// One mesh whose origin is the ridge, so the sway (a few degrees over 20 s) is one rotation.
export const SHAFT_SPOTS = Object.freeze([[-8, -12.5], [-2, -5.5], [5.5, -13], [10, -6]].map((p) => Object.freeze(p)));
export const SHAFT_GAIN = 0.26; // the additive light's strength at a shaft's top, centre (M0's 0.22 blew out; pass 1's 0.18 was faint at play distance)
export const MOTES = 12; // pollen and dust motes drifting in each shaft (beauty pass 2): a camera-facing quad each, two triangles
export const SHAFT_FADE = Object.freeze({ near: 2.5, far: 8 }); // m from the camera: none, then all
export function sunShafts(h, spots = SHAFT_SPOTS, name = 'sunShafts') {
  const pos = [];
  const col = [];
  const idx = [];
  const aA = []; // per vertex: kind (0 shaft, 1 mote), the corner (-1..1) and a phase
  const aS = []; // per vertex: a mote's half size
  const ridge = h.ridge - 0.6;
  _col.set(COL.shaft);
  let spotNo = 0;
  for (const [x, z] of spots) {
    // beauty round 4: each shaft its own strength and warmth (one bright and golden, one paler and thin)
    const gk = [1, 0.7, 0.88, 0.76][spotNo % 4], warmK = [1, 0.92, 1, 0.9][spotNo % 4];
    spotNo++;
    // two crossed pairs of triangles leaning a little east: the top narrow and bright in the middle, soft to nothing at
    // the sides (the edge vertices are black, and additive black is nothing), the foot wide and black
    for (const yaw of [0, Math.PI / 2]) {
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const base = pos.length / 3;
      for (const [u, y, k] of [[-0.9, 0, 0], [0, 0, 1], [0.9, 0, 0], [-2.6, -ridge, 0], [0, -ridge, 0], [2.6, -ridge, 0]]) {
        const px = x + u * cs + (y === 0 ? 0 : 1.6); // the foot leans 1.6 m east of the top
        const pz = z + u * sn;
        pos.push(px, y, pz);
        col.push(_col.r * k * SHAFT_GAIN * gk, _col.g * k * SHAFT_GAIN * gk, _col.b * k * SHAFT_GAIN * gk * warmK ** 2);
        aA.push(0, 0, 0, 0); aS.push(0);
      }
      idx.push(base, base + 1, base + 4, base, base + 4, base + 3, base + 1, base + 2, base + 5, base + 1, base + 5, base + 4);
    }
    // beauty pass 2: motes inside this shaft's column (centre in `position`, drifted and turned to the camera in the vertex shader)
    for (let m = 0; m < MOTES; m++) {
      const t = 0.1 + 0.85 * hash01(spotNo, m, 0x9f1);
      const wide = 0.7 + 1.5 * t;
      const mx = x + 1.6 * t + (hash01(spotNo, m, 0x9f2) - 0.5) * 2 * wide;
      const mz = z + (hash01(spotNo, m, 0x9f3) - 0.5) * 2 * wide;
      const base = pos.length / 3;
      const size = 0.13 + 0.1 * hash01(spotNo, m, 0x9f4);
      const ph = hash01(spotNo, m, 0x9f5) * Math.PI * 2;
      const gold = 0.55 + 0.45 * hash01(spotNo, m, 0x9f6);
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(mx, -t * ridge, mz);
        col.push(1.0 * gold, 0.86 * gold, 0.5 * gold);
        aA.push(1, cx, cy, ph); aS.push(size);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(aA, 4));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const uniforms = { uTime: { value: 0 }, uGain: { value: 1 }, uWarm: { value: 0 } }; // the walk's clock (greenhouselife.js; 0 under reduced motion: the motes hold still)
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  // The distance fade (M0's known bug: a camera among the shafts saw a screenful of stacked additive light, blown out
  // to white). A shaft's light fades to nothing within SHAFT_FADE.near of the camera and is whole beyond .far.
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aA;\nattribute float aS;\nuniform float uTime;\nvarying vec3 vShaftW;\nvarying vec4 vA;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vA = aA;
if (aA.x > 0.5) { transformed += vec3(sin(uTime * 0.23 + aA.w) * 0.4, cos(uTime * 0.17 + aA.w * 2.3) * 0.35, cos(uTime * 0.19 + aA.w * 1.7) * 0.4); }
vShaftW = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
      .replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
if (aA.x > 0.5) mvPosition.xy += aA.yz * aS;
gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGain;\nuniform float uWarm;\nvarying vec3 vShaftW;\nvarying vec4 vA;')
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= uGain * mix(vec3(1.0), vec3(1.0, 0.72, 0.42), uWarm);
diffuseColor.rgb *= smoothstep(${SHAFT_FADE.near.toFixed(1)}, ${SHAFT_FADE.far.toFixed(1)}, distance(cameraPosition, vShaftW));
if (vA.x > 0.5) {
  float disc = 1.0 - smoothstep(0.25, 1.0, length(vA.yz));
  diffuseColor.rgb *= disc * (0.6 + 0.4 * sin(uTime * 1.7 + vA.w * 13.0)) * 3.2;
} else {
  diffuseColor.rgb *= 0.86 + 0.14 * sin(uTime * 0.55 + vShaftW.x * 0.7 + vShaftW.z * 0.5);
}`);
  };
  mat.customProgramCacheKey = () => 'greenhouse-shafts-v4';
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.userData.shaft = uniforms;
  m.position.set(0, ridge, 0);
  m.userData.noCast = true;
  m.userData.noMerge = true;
  m.castShadow = false;
  m.renderOrder = 2;
  m.frustumCulled = false;
  return m;
}
// the sway: a few degrees over 20 s, a function of the walk's clock (frozen under reduced motion)
export const SHAFT_SWAY = Object.freeze({ deg: 2.5, period: 20 });
export function shaftAngle(t, reducedMotion = false) {
  if (reducedMotion) return 0;
  return (SHAFT_SWAY.deg * Math.PI / 180) * Math.sin((t / SHAFT_SWAY.period) * Math.PI * 2);
}

// ---------------------------------------------------------------------------------------------
// Mist: a few flat soft-edged sheets near the floor and the doors, ONE mesh, ONE uTime.
export const MIST_SHEETS = Object.freeze([
  { x: -7, z: -8, w: 7, d: 4.5, y: 0.35 }, { x: 5, z: -12, w: 8, d: 4, y: 0.5 },
  { x: 0, z: -1.6, w: 4.5, d: 2.2, y: 0.6 }, { x: 8.5, z: -4, w: 6, d: 3.5, y: 0.8 },
].map((s) => Object.freeze(s)));
// Beauty pass 2 rides on the same mesh and clock: DRIP RINGS (a wet patch and two rings widening from where a drip lands: a flat
// quad on the floor, drawn in the fragment shader) and LAMP HALOS (a soft warm disc turned to the camera, flickering a little).
// Both are extra quads with attribute aA = (kind, ...), the sheets stay kind 0; nothing is a new mesh or draw.
export const DRIP_RINGS = Object.freeze([[-1.7, -6.4, 1.1], [2.0, -7.7, 1.0], [0.9, -3.9, 0.9], [-4.2, -13.2, 1.0], [30.3, 19.65, 1.2]].map((p) => Object.freeze(p))); // x, z, size (m)
export const LAMP_HALOS = Object.freeze([[-5.5, 2.7, 26.5], [5.5, 2.7, 26.5]].map((p) => Object.freeze(p))); // x, y, z
export function mistSheets(sheets = MIST_SHEETS, name = 'glassMist', { rings = [], halos = [] } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  const aA = [];
  const aC = [];
  sheets.forEach((s, k) => {
    const base = k * 4;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(s.x + (u - 0.5) * s.w, s.y, s.z + (v - 0.5) * s.d);
      uv.push(u, v);
      aA.push(0, 0, 0, 0); aC.push(1, 1, 1);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });
  rings.forEach(([x, z, size], k) => {
    const base = pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(x + (u - 0.5) * size, 0.07, z + (v - 0.5) * size);
      uv.push(u, v);
      aA.push(1, x, z, hash01(k, 3, 0x9f7));
      aC.push(0.78, 0.92, 1);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });
  halos.forEach(([x, y, z], k) => {
    const base = pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(x, y, z);
      uv.push(u, v);
      aA.push(2, (u - 0.5) * 2, (v - 0.5) * 2, hash01(k, 5, 0x9f7) * 6);
      aC.push(1, 0.78, 0.36);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3); // (turned to the camera: the view's own winding)
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(aA, 4));
  g.setAttribute('aC', new THREE.Float32BufferAttribute(aC, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(COL.mist) }, uCat: CAT_NEAR, uWarm: { value: 0 }, uRain: RAIN_ON };
  const material = new THREE.MeshBasicMaterial({ color: COL.mist, transparent: true, depthWrite: false, fog: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aA;\nattribute vec3 aC;\nvarying vec3 vMistW;\nvarying vec2 vMistUv;\nvarying vec4 vMistA;\nvarying vec3 vMistC;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMistW = (modelMatrix * vec4(position, 1.0)).xyz;\nvMistUv = uv;\nvMistA = aA;\nvMistC = aC;')
      .replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
if (aA.x > 1.5) mvPosition.xy += aA.yz * 1.5;
gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uColor;
uniform vec4 uCat;
uniform float uWarm;
uniform float uRain;
varying vec3 vMistW;
varying vec2 vMistUv;
varying vec4 vMistA;
varying vec3 vMistC;
float mH(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float mN(vec2 q) { vec2 i = floor(q), f = fract(q); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mH(i), mH(i + vec2(1.0, 0.0)), u.x), mix(mH(i + vec2(0.0, 1.0)), mH(i + vec2(1.0, 1.0)), u.x), u.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float a;
  if (vMistA.x > 1.5) {
    // a lamp's halo: a warm soft disc, a little unsteady
    float r = length(vMistUv - 0.5) * 2.0;
    a = (pow(max(0.0, 1.0 - r), 2.4) * 0.85 + 0.5 * pow(max(0.0, 1.0 - r * 3.2), 2.0)) * (0.92 + 0.08 * sin(uTime * 2.3 + vMistA.w)) * (1.0 + 0.55 * uWarm);
    diffuseColor.rgb = mix(vMistC, vec3(1.0, 0.6, 0.2), uWarm * 0.6);
  } else if (vMistA.x > 0.5) {
    // a drip's wet patch and two rings widening and fading
    float r = length(vMistUv - 0.5) * 2.0;
    float p1 = fract(uTime * 0.42 + vMistA.w), p2 = fract(uTime * 0.42 + vMistA.w + 0.5);
    float r1 = exp(-pow((r - p1 * 0.95) / 0.07, 2.0)) * (1.0 - p1);
    float r2 = exp(-pow((r - p2 * 0.95) / 0.07, 2.0)) * (1.0 - p2);
    float wet = (1.0 - smoothstep(0.55, 0.8, r));
    // beauty pass 3: where she steps in the wet patch her paws send out their own widening rings
    float dc = distance(vMistW.xz, uCat.xy);
    float near = uCat.w * (1.0 - smoothstep(0.3, 1.2, distance(vMistA.yz, uCat.xy)));
    float pc = fract(uTime * 1.4);
    float step1 = exp(-pow((dc - pc * 0.6) / 0.05, 2.0)) * (1.0 - pc) * near * (0.4 + 0.6 * uCat.z);
    a = (0.2 * wet + 0.75 * max(r1, r2) + 0.2 * near + 1.1 * step1) * (1.0 - smoothstep(0.85, 1.0, r));
    diffuseColor.rgb = vMistC;
  } else {
    vec2 p = vMistW.xz;
    vec2 e = min(vMistUv, 1.0 - vMistUv);
    float edge = smoothstep(0.0, 0.4, min(e.x, e.y));
    float n = 0.6 * mN(p * 0.35 + vec2(uTime * 0.05, uTime * 0.03)) + 0.4 * mN(p * 0.9 + vec2(-uTime * 0.03, uTime * 0.06) + 17.0);
    a = smoothstep(0.3, 0.7, n) * edge * 0.8;
    diffuseColor.rgb = uColor;
  }
  a *= smoothstep(1.0, 3.0, distance(cameraPosition, vMistW));
  diffuseColor.a *= a;
  if (diffuseColor.a < 0.004) discard;
}`);
  };
  material.customProgramCacheKey = () => 'greenhouse-mist-v4';
  const m = new THREE.Mesh(g, material);
  m.name = name;
  m.userData.noCast = true;
  m.userData.noMerge = true;
  m.userData.mist = uniforms;
  m.castShadow = false;
  m.renderOrder = 2;
  return m;
}
