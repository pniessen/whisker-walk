import { describe, it, expect } from 'vitest';
import { createWater, waterBox, WATER_TUNING, waterRamp } from '../src/render/water.js';
import { WOODS_WATERS } from '../src/world/woods.js';
import { MOOR_WATERS } from '../src/world/moor.js';
import { PINES_WATERS } from '../src/world/pines.js';

// Foam (and the pale shallow shelf) is painted along REAL shore only: where
// one water's footprint runs under another's (the Woods pond over the river,
// the Moor's river mouth over the lake, the Pines lake under its bay, the
// mire's corner), that stretch of its outline is open water, not a bank, and
// must not draw a pale stripe across it. createWater learns the area's other
// waters through `waters`, and measures depth to builder.js's shorePieces.

const byId = (list, id) => list.find((w) => w.id === id);

// The ramp texel over world (x, z): u runs minX..maxX, row j runs south from
// maxZ (see buildRampTextures).
function texel(handle, w, x, z) {
  const box = waterBox(w);
  const [nx, nz] = handle.rampSize;
  const i = Math.min(nx - 1, Math.floor(((x - box.minX) / (box.maxX - box.minX)) * nx));
  const j = Math.min(nz - 1, Math.floor(((box.maxZ - z) / (box.maxZ - box.minZ)) * nz));
  const d = handle.textures.color.image.data;
  const o = (j * nx + i) * 4;
  return [d[o], d[o + 1], d[o + 2]];
}
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function deepLum(color) {
  return lum(waterRamp(color).deep);
}

describe('foam only along real shore', () => {
  it('the Woods pond paints no rim where it lies over the river, and keeps its rim on the grass', () => {
    const pond = byId(WOODS_WATERS, 'pond');
    const fx = createWater(pond, { color: 0x5f98a8, waters: WOODS_WATERS });
    // The pond (-44, -6, r 6) sits over river-west (z -14..-9): its rim at
    // the pond's south point (z -12) is in the river; its north point (z 0)
    // is on the grass.
    const inRiver = lum(texel(fx, pond, -44, -11.9));
    const onGrass = lum(texel(fx, pond, -44, -0.1));
    expect(inRiver).toBeLessThan(onGrass - 20);
    expect(inRiver).toBeLessThan(deepLum(0x5f98a8) + 25);
  });

  it('the Moor river mouth paints no side stripes where it runs into the lake', () => {
    const mouth = byId(MOOR_WATERS, 'river-mouth');
    const look = { color: 0x5f98a8, shores: ['minX', 'maxX'] };
    const fx = createWater(mouth, { ...look, waters: MOOR_WATERS });
    // its west side at x -40: z 9.5 is inside the lake (z >= 8), z 2 is a bank
    expect(lum(texel(fx, mouth, -39.95, 9.6))).toBeLessThan(lum(texel(fx, mouth, -39.95, 2)) - 20);
  });

  it('the Pines lake has no foam along its z 8 edge under the bay (x 26..30), and keeps it east of the bay', () => {
    const lake = byId(PINES_WATERS, 'lake');
    const fx = createWater(lake, { color: 0x5f98a8, shores: ['minZ'], waters: PINES_WATERS });
    expect(lum(texel(fx, lake, 28, 8.05))).toBeLessThan(lum(texel(fx, lake, 50, 8.05)) - 20);
  });

  it('the mire-north reach paints no stripe across the corner where mire-west runs under it', () => {
    const north = byId(PINES_WATERS, 'mire-north');
    const fx = createWater(north, { color: 0x4a5a48, shores: ['minX', 'maxX'], waters: PINES_WATERS });
    // its west side x -32: z -8 is inside mire-west (z -11..-6); z -40 is a bank
    expect(lum(texel(fx, north, -31.95, -8.5))).toBeLessThan(lum(texel(fx, north, -31.95, -40)) - 10);
  });

  it('a water with no overlapping neighbour paints exactly what it did', () => {
    const lake = byId(WOODS_WATERS, 'lake');
    const a = createWater(lake, { color: 0x5f98a8, shores: ['maxX', 'maxZ'] });
    const b = createWater(lake, { color: 0x5f98a8, shores: ['maxX', 'maxZ'], waters: WOODS_WATERS });
    expect(Buffer.from(b.textures.color.image.data).equals(Buffer.from(a.textures.color.image.data))).toBe(true);
    expect(WATER_TUNING.FOAM_M).toBeGreaterThan(0);
  });
});
