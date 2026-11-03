import * as THREE from 'three';
import { skyBackground } from './sky.js';
import { litMaterial } from './materials.js';
import { DEFAULT_GROUND_BOUNCE } from './rig.js';

// =============================================================================
// DUSK — one look for every map. A dusk walk used to be the day lighting with
// a darker sky and a dimmer sun; this gives it a warm low sun, a cool sky
// fill, a dimmer ground bounce and image light, and a glow at the cat's
// collar. Areas may override any key with `areaData.duskLight`.
//
// RAIN SEAM: weather is only rolled when !duskActive (walk.js), so dusk and
// rain never meet today. Dusk is the base: if weather ever runs on a dusk
// walk it must write on top of these values (weather.js is not touched here).
//
// Nothing here mutates a module-level constant: the sun, fill and scene are
// created fresh per walk, and the cat's collar light goes with the cat.
// =============================================================================

export const DUSK = Object.freeze({
  sunColor: 0xffb27a,
  sunIntensity: 0.8,
  hemiSky: 0x7d8cc4,
  hemiIntensity: 0.5,
  groundDim: 0.55,
  envScale: 0.45,
  fogNear: 30,
  fogFar: 110,
  collarColor: 0x7ef2c0,
  collarIntensity: 1.6,
  collarDistance: 4,
  collarDecay: 2,
  collarLift: 0.45,
  // Lawns read greener at dusk than by day because the warm low sun and the
  // dimmed fill leave the saturated albedo to carry the colour. Pull the
  // green toward grey, darken it, and push it a little blue. Picked side by
  // side on the Woods at dusk: more grey than this read as a fog wash, and
  // darker-but-still-green reads as evening rather than a dull lawn.
  lawnTint: Object.freeze({ desat: 0.25, dark: 0.72, cool: Object.freeze([0.96, 1.0, 1.08]) }),
});

// Street lamps at dusk (world/builder.js's lampPost): the globe swaps to a
// bright emissive (bloom-friendly on the high tier) and the ground under each
// lamp gets a soft warm pool from createLampPools — painted, not lit: no real
// light per lamp, one additive draw for every pool on the map.
export const LAMP_LOOK = Object.freeze({
  globe: 0xfff0c8,
  emissive: 0xffc870,
  emissiveIntensity: 2.4,
  poolColor: 0xffb860,
  poolRadius: 3.4,
  poolStrength: 0.55,
  poolSegments: 20,
  poolLift: 0.035,
});

export function duskLook(areaData) {
  const over = areaData?.duskLight ?? {};
  // lawnTint merges one level deep: an area that only sets { dark } keeps the
  // default desat and cool instead of leaving them undefined (NaN colours).
  const lawnTint = Object.freeze({ ...DUSK.lawnTint, ...(over.lawnTint ?? {}) });
  return Object.freeze({ ...DUSK, ...over, lawnTint });
}

export function applyDusk({ scene, sun, fill, areaData }) {
  const look = duskLook(areaData);
  const { top, horizon } = areaData.skyDusk;
  scene.background = skyBackground(top, horizon);
  scene.fog = new THREE.Fog(horizon, look.fogNear, look.fogFar);
  sun.color.set(look.sunColor);
  sun.intensity = look.sunIntensity;
  fill.color.set(look.hemiSky);
  const bounce = new THREE.Color(areaData.groundBounce ?? DEFAULT_GROUND_BOUNCE);
  fill.groundColor.setRGB(
    bounce.r * look.groundDim,
    bounce.g * look.groundDim,
    bounce.b * look.groundDim,
  );
  fill.intensity = look.hemiIntensity;
  // dusk: house windows glow warm (bloom-friendly on the high tier; endWalk's
  // scene traversal disposes the swapped material like any other)
  scene.traverse((o) => {
    if (o.userData?.window) {
      const old = o.material;
      o.material = litMaterial(0xffe0a0, { emissive: 0x8a6a20 });
      old.dispose();
    } else if (o.userData?.lampGlobe) {
      // ...and so do the street lamps' globes (same swap, same disposal)
      const old = o.material;
      o.material = litMaterial(LAMP_LOOK.globe, {
        emissive: LAMP_LOOK.emissive, emissiveIntensity: LAMP_LOOK.emissiveIntensity,
      });
      old.dispose();
    }
  });
  return look;
}

// createLampPools(scene) — one Mesh of soft warm pools on the ground, one per
// lamp, or null (nothing added) when the map has no lamps. Lamps are found by
// render/ambient.js's findLamps rule (any object with userData.lampGlobeY > 0);
// it is restated here rather than imported because ambient.js pulls in
// grass.js and so world/builder.js, which dusk.js (imported by weather.js) has
// no other reason to load. The pool sits at the lamp group's world y.
//
// Per lamp: a centre vertex at poolColor × poolStrength, a ring at half the
// radius at 0.45 of that, and a black rim. Additive blending, so black adds
// nothing and the pool fades to the ground's own colour; the half-radius ring
// bends the falloff from a straight cone toward a smoothstep. 3 × poolSegments
// triangles per lamp (centre fan + annulus). Created after the caster sweep,
// the contact-shadow scan and the prop merge (game/walk.js), so it is never
// merged, decaled or cast: +1 main-pass draw, 0 shadow.
export function createLampPools(scene) {
  const lamps = [];
  const p = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!(o.userData?.lampGlobeY > 0)) return;
    o.getWorldPosition(p);
    lamps.push({ x: p.x, y: p.y, z: p.z });
  });
  if (!lamps.length) return null;
  const S = LAMP_LOOK.poolSegments;
  const R = LAMP_LOOK.poolRadius;
  const per = 1 + 2 * S;
  const pos = new Float32Array(lamps.length * per * 3);
  const col = new Float32Array(lamps.length * per * 3);
  const index = [];
  const c = new THREE.Color(LAMP_LOOK.poolColor).multiplyScalar(LAMP_LOOK.poolStrength);
  const mid = c.clone().multiplyScalar(0.45);
  lamps.forEach((l, i) => {
    const base = i * per;
    const y = l.y + LAMP_LOOK.poolLift;
    const put = (v, x, z, colour) => {
      pos.set([x, y, z], (base + v) * 3);
      if (colour) col.set([colour.r, colour.g, colour.b], (base + v) * 3);
    };
    put(0, l.x, l.z, c);
    for (let s = 0; s < S; s++) {
      const a = (s / S) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      put(1 + s, l.x + cx * R * 0.5, l.z + sz * R * 0.5, mid);
      put(1 + S + s, l.x + cx * R, l.z + sz * R, null); // rim stays black
    }
    for (let s = 0; s < S; s++) {
      const n = (s + 1) % S;
      const i0 = base + 1 + s;
      const i1 = base + 1 + n;
      const o0 = base + 1 + S + s;
      const o1 = base + 1 + S + n;
      // wound to face up (+y) seen from above
      index.push(base, i1, i0);
      index.push(i0, i1, o1, i0, o1, o0);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'lampPools';
  mesh.userData = { noCast: true, dressing: true };
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  return mesh;
}

export function duskEnv(envIntensity, look) {
  return envIntensity * look.envScale;
}

export function addCollarGlow(cat, look) {
  const light = new THREE.PointLight(
    look.collarColor, look.collarIntensity, look.collarDistance, look.collarDecay,
  );
  light.name = 'collarGlow';
  light.castShadow = false;
  light.position.set(0, look.collarLift, 0);
  cat.add(light);
  return light;
}

// Lawn colour at dusk: lerp toward the colour's own luminance grey (Rec.709 on
// the linear components), then darken and cool per channel. Returns a new Color.
export function duskLawnColor(color, look) {
  const { desat, dark, cool } = look.lawnTint;
  const grey = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const f = (v, i) => (v + (grey - v) * desat) * dark * cool[i];
  return new THREE.Color(f(color.r, 0), f(color.g, 1), f(color.b, 2));
}

// Same shape as the rain tint in weather.js: ground meshes wear a tinted clone
// (the shared original is never written), the grass material is tinted in place
// because it is per-walk and patched with onBeforeCompile, so it must not be
// cloned. dispose() puts everything back exactly and is safe to call twice.
//
// Vertex-coloured meshes (the horizon bands with side tints, a near colour,
// rooftops or an edge — their material is white and the colour lives in the
// vertices): the effective colour is material × vertex, and tinting only the
// material would darken and cool it but never desaturate it, because the
// desaturation is not a per-channel multiply. So for those the FULL
// duskLawnColor is applied per vertex to (material × vertex), into a clone of
// the colour attribute, and the cloned material is set to white: the result is
// exactly duskLawnColor(effective). The mesh keeps its geometry object; only
// the 'color' attribute is swapped, and dispose() puts the original back. (A
// geometry shared by two such meshes is tinted once, for the first; ground
// meshes do not share band geometry today.)
//
// A ground mesh's descendants flagged userData.duskTint are tinted with it, by
// the same rule (world/builder.js's 'horizonEdge', the hedges and walls round
// the ground's edge, hangs off the band as a child; walk.js hands this the
// band, a top-level mesh, and the edge comes with it).
export function tintDuskLawn({ ground, grass, look }) {
  const swaps = [];
  const attrSwaps = new Map();
  const c = new THREE.Color();
  const meshes = new Set();
  for (const mesh of ground ?? []) {
    meshes.add(mesh);
    mesh.traverse?.((o) => { if (o !== mesh && o.isMesh && o.userData?.duskTint) meshes.add(o); });
  }
  for (const mesh of meshes) {
    const orig = mesh.material;
    if (Array.isArray(orig) || !orig?.color) continue;
    const tinted = orig.clone();
    const geo = mesh.geometry;
    const col = orig.vertexColors ? geo?.getAttribute?.('color') : null;
    if (col && !attrSwaps.has(geo)) {
      const tc = col.clone();
      const m = orig.color;
      for (let v = 0; v < tc.count; v++) {
        c.setRGB(m.r * col.getX(v), m.g * col.getY(v), m.b * col.getZ(v));
        const d = duskLawnColor(c, look);
        tc.setXYZ(v, d.r, d.g, d.b);
      }
      geo.setAttribute('color', tc);
      attrSwaps.set(geo, { orig: col, tinted: tc });
      tinted.color.setRGB(1, 1, 1);
    } else {
      tinted.color.copy(duskLawnColor(orig.color, look));
    }
    mesh.material = tinted;
    swaps.push({ mesh, orig, tinted });
  }
  const saved = grass?.color ? grass.color.clone() : null;
  if (saved) grass.color.copy(duskLawnColor(saved, look));
  let done = false;
  return {
    dispose() {
      if (done) return;
      done = true;
      for (const w of swaps) {
        if (w.mesh.material === w.tinted) w.mesh.material = w.orig;
        w.tinted.dispose();
      }
      swaps.length = 0;
      for (const [geo, a] of attrSwaps) {
        if (geo.getAttribute('color') !== a.tinted) continue;
        // Free the tinted attribute's GPU buffer while it is still attached
        // (the renderer frees a geometry's CURRENT attributes on dispose; the
        // next render re-uploads with the original), then put it back.
        geo.dispose();
        geo.setAttribute('color', a.orig);
      }
      attrSwaps.clear();
      if (saved) grass.color.copy(saved);
    },
  };
}
