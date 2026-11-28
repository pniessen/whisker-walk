// Split screen (S2): the pure maths of centring the camera-following systems on two views.
// No three.js, no DOM, nothing to import: unit-tested headless (test/splitcentre.test.js).

/** The point halfway between two ground points {x, z}. */
export const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });

/** A ground offset (dx, dz) in light space: the two lateral components of the shadow map's own grid. */
export const lightOffset = (basis, dx, dz) => ({
  x: dx * basis.x.x + dz * basis.x.z,
  y: dx * basis.y.x + dz * basis.y.z,
});

/** How far the shadow box may grow, as a multiple of the one-view radius (2.5: 50 m on the high tier). */
export const SHADOW_MAX_MUL = 2.5;

/**
 * One shadow map for two views. `a` and `b` are the ground points each view's own fit would be centred on
 * ({x, z}); `basis` is the light's {x, y} lateral axes; `base` is the one-view half-extent (quality's shadowFitRadius).
 * The map is centred on the midpoint and grows by half the cats' separation IN LIGHT SPACE (which is shorter than
 * the world separation along the sun's axis, so cats a long way apart along the sun still fit), so each view keeps
 * its own one-view radius around its own fit point. Past SHADOW_MAX_MUL the box stops growing (`covered` false):
 * the two views then lose the shadows at the edge of the box nearest the other cat, not at the cats themselves.
 */
export function shadowSplitFit(a, b, basis, base, maxMul = SHADOW_MAX_MUL) {
  const c = midpoint(a, b);
  const o = lightOffset(basis, a.x - b.x, a.z - b.z);
  const half = Math.max(Math.abs(o.x), Math.abs(o.y)) / 2;
  const want = base + half;
  const radius = Math.min(want, base * maxMul);
  return { x: c.x, z: c.z, radius, covered: want <= base * maxMul + 1e-9 };
}

/**
 * What changes with the radius: the texel (world metres per map texel), and the two numbers the rig tied to the
 * texel (normalBias: 0.7 texels, PCF radius: softness / texel), as multiples of their one-view values.
 */
export function shadowScale(radius, base) {
  const k = radius / base;
  return { texelK: k, normalBiasK: k, pcfRadiusK: 1 / k };
}

/** The offset that slides cloud and sky meshes (laid round the main camera) onto another camera. */
export const skyShift = (cam, main) => ({ x: cam.x - main.x, z: cam.z - main.z });

