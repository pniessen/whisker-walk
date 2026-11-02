import { seedFromCode, mulberry32 } from '../rng.js';

// Runs fn with Math.random swapped for a local stream seeded by `key`, so the
// uuids Three hands to every Object3D, geometry and material made inside it
// (4 Math.random draws each) are the same on every device and do not move the
// real Math.random draw count the area builds are pinned to. A uuid is only a
// name: nothing in the WebGL renderer keys a mesh, geometry or opaque material
// by it. The caller chooses the seed string (camp: `camp-uuids-${areaId}`).
export function withLocalUuids(key, fn) {
  const real = Math.random;
  Math.random = mulberry32(seedFromCode(key));
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}
