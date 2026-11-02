// Test-only height fixture for the ground-height engine (Gorge part 1). No
// shipped map has height; this is the one place the engine meets real slopes,
// rims and a ceiling. Never imported by src/.
import { createGround } from '../../src/ground.js';

export const HEIGHT_FIXTURE = {
  base: 0,
  strips: [
    // ramp: 1 in 3, meets the plateau at (3, 0)
    { x0: -6, z0: 0, x1: 3, z1: 0, width: 2, y0: 0, y1: 3 },
    // ledge: a narrow path at 3 m with a drop on both sides
    { x0: 13, z0: 0, x1: 13, z1: 10, width: 1.5, y0: 3 },
  ],
  discs: [
    // plateau
    { x: 8, z: 0, r: 5, y: 3 },
  ],
  ceilings: [
    // tunnel
    { x0: -10, z0: -8, x1: -10, z1: -14, width: 3, y: 1.6 },
  ],
};

export function buildHeightFixture(scene) {
  void scene; // nothing is drawn: the fixture is data
  return {
    name: 'fixture',
    colliders: [{ x: -14, z: 6, r: 1 }],
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawn: { x: -10, z: 0 },
    waters: [],
    perches: [
      { x: 8, z: 4.5, y: 0.6, kind: 'rock', label: 'rim rock' },
      { x: 8, z: 5.5, y: 0.6, kind: 'rock', label: 'floor rock' },
    ],
    collectibles: [{ id: 'fx-top', x: 10, z: -2, label: 'top' }],
    scenics: [],
    pois: [
      { x: -10, z: 0 },
      { x: 8, z: 0 },
      { x: 13, z: 8 },
    ],
    critterSpawns: [],
    tippables: [],
    ground: createGround(HEIGHT_FIXTURE),
  };
}
