import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createWater, waterRig, waterRamp, waterBox, shoreDepth, rippleHeight, WATER_TUNING,
} from '../src/render/water.js';

// The same headless stub every world test uses. It is here for ONE reason:
// the "keeps test/water.test.js green" block at the bottom builds the three
// real areas, and their builders reach for document.createElement('canvas')
// for billboard textures. render/water.js itself needs none of it — see the
// "does not need a DOM at all" case.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    // A blanket no-op Proxy is enough for the billboard's canvas, but not for
    // render/textures.js's surface tiles, which the world builders now ask
    // for. Two of their calls need a real answer rather than undefined:
    //   * createLinear/RadialGradient — the painters add colour stops to
    //     whatever comes back;
    //   * getImageData — every tile ends with a getImageData/putImageData
    //     readback (clampToFloor, the pass that GUARANTEES no texel falls
    //     below the luminance floor). clampToFloor does guard the headless
    //     path, but it guards it by asking whether getImageData is a
    //     function, which a blanket Proxy always answers yes to.
    // A zeroed buffer is the truthful answer here: nothing was ever actually
    // rasterised into this canvas.
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const POND = { id: 'pond', kind: 'circle', x: -14, z: 2, r: 7 };
const CANAL = { id: 'canal', kind: 'rect', minX: -45, maxX: 45, minZ: -3.5, maxZ: 3.5 };
const SEA = { id: 'sea', kind: 'rect', minX: 25, maxX: 105, minZ: -70, maxZ: 70 };

// Read one texel of a DataTexture back as [r, g, b, a].
function texel(tex, i, j) {
  const { width, data } = tex.image;
  const o = (j * width + i) * 4;
  return [data[o], data[o + 1], data[o + 2], data[o + 3]];
}
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Where in the ramp map does world (x, z) land? Mirrors the texel->world
// mapping in buildRampTextures, from the other direction: u runs west->east,
// v runs north->south (maxZ -> minZ), and DataTexture row 0 is v = 0.
function texelAt(handle, footprint, x, z) {
  const box = waterBox(footprint);
  const [nx, nz] = handle.rampSize;
  const i = Math.min(nx - 1, Math.max(0, Math.floor(((x - box.minX) / (box.maxX - box.minX)) * nx)));
  const j = Math.min(nz - 1, Math.max(0, Math.floor(((box.maxZ - z) / (box.maxZ - box.minZ)) * nz)));
  return texel(handle.textures.color, i, j);
}

// ---------------------------------------------------------------------------
// The one hard constraint: the mesh IS the declaration.
// ---------------------------------------------------------------------------
describe('the mesh is the footprint, verbatim', () => {
  it('draws a circle footprint at its declared radius and centre', () => {
    const w = createWater(POND, { y: 0.02 });
    expect(w.mesh.geometry.type).toBe('CircleGeometry');
    expect(w.mesh.geometry.parameters.radius).toBe(POND.r);
    expect(w.mesh.position.x).toBe(POND.x);
    expect(w.mesh.position.z).toBe(POND.z);
    expect(w.mesh.position.y).toBe(0.02);
    // face-up, like every ground plane in the game
    expect(w.mesh.rotation.x).toBeCloseTo(-Math.PI / 2, 12);
    w.dispose();
  });

  it('draws a rect footprint at its declared extent and centre', () => {
    const w = createWater(CANAL, { y: 0.04 });
    const p = w.mesh.geometry.parameters;
    expect(w.mesh.geometry.type).toBe('PlaneGeometry');
    expect(p.width).toBe(CANAL.maxX - CANAL.minX);
    expect(p.height).toBe(CANAL.maxZ - CANAL.minZ);
    expect(w.mesh.position.x).toBe((CANAL.minX + CANAL.maxX) / 2);
    expect(w.mesh.position.z).toBe((CANAL.minZ + CANAL.maxZ) / 2);
    w.dispose();
  });

  it('does not need a DOM at all — no canvas, no WebGL context', () => {
    // The module builds every texture as a DataTexture precisely so this
    // holds: the world tests' stub canvas returns undefined from
    // createImageData/createRadialGradient, so a canvas-based generator would
    // take test/water.test.js down the moment the areas are swapped over.
    const saved = globalThis.document;
    // eslint-disable-next-line no-undef
    globalThis.document = undefined;
    try {
      const w = createWater(POND, {});
      expect(w.textures.color.isDataTexture).toBe(true);
      expect(w.textures.normal.isDataTexture).toBe(true);
      w.dispose();
    } finally {
      globalThis.document = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// Depth ramp and shoreline.
// ---------------------------------------------------------------------------
describe('the depth ramp', () => {
  it('measures a circle radially and a rect from its nearest declared shore', () => {
    expect(shoreDepth(POND, POND.x, POND.z)).toBe(7);        // dead centre
    expect(shoreDepth(POND, POND.x + 7, POND.z)).toBe(0);    // the rim
    expect(shoreDepth(CANAL, 0, 0)).toBe(3.5);               // short axis wins
    expect(shoreDepth(CANAL, 0, 3)).toBeCloseTo(0.5, 12);
  });

  it('ignores an edge the caller did not call a shore', () => {
    // The seaside case: only minX is land, so the far horizon at x 105 must
    // not be measured as a beach.
    expect(shoreDepth(SEA, 30, 0, ['minX'])).toBe(5);
    expect(shoreDepth(SEA, 104, 0, ['minX'])).toBe(79);
    // ...whereas the default treats every edge as shore
    expect(shoreDepth(SEA, 104, 0)).toBe(1);
  });

  it('is darker in the middle than at the rim', () => {
    const w = createWater(POND, {});
    const middle = luma(texelAt(w, POND, POND.x, POND.z));
    const shelf = luma(texelAt(w, POND, POND.x + 5.5, POND.z)); // 1.5m in — mid-shelf
    expect(middle).toBeLessThan(shelf);
    w.dispose();
  });

  it('puts a light foam band at the water\'s edge and nowhere else', () => {
    const w = createWater(POND, {});
    const rim = luma(texelAt(w, POND, POND.x + 6.8, POND.z));   // 0.2m in
    const shelf = luma(texelAt(w, POND, POND.x + 5.5, POND.z)); // 1.5m in
    const middle = luma(texelAt(w, POND, POND.x, POND.z));
    expect(rim).toBeGreaterThan(shelf);
    expect(shelf).toBeGreaterThan(middle);
    w.dispose();
  });

  it('keeps the foam off an edge that is open horizon rather than beach', () => {
    // The seaside sea. Its own footprint runs 69m past the walkable bounds in
    // z and 69m past them in x, so foam on those edges would be a white line
    // painted across the horizon.
    const w = createWater(SEA, { shores: ['minX'] });
    const surf = luma(texelAt(w, SEA, 25.3, 0));   // just off the sand
    const deep = luma(texelAt(w, SEA, 60, 0));
    const east = luma(texelAt(w, SEA, 104.7, 0));  // the far edge
    const north = luma(texelAt(w, SEA, 60, 69.7)); // ditto
    expect(surf).toBeGreaterThan(deep);
    expect(east).toBeCloseTo(deep, 0);
    expect(north).toBeCloseTo(deep, 0);
    w.dispose();
  });

  it('orients v north-to-south, so an asymmetric ramp is not mirrored', () => {
    // A rect whose ONLY shore is maxZ: the light band must land at high z.
    const strip = { id: 's', kind: 'rect', minX: -10, maxX: 10, minZ: -20, maxZ: 20 };
    const w = createWater(strip, { shores: ['maxZ'] });
    expect(luma(texelAt(w, strip, 0, 19.7))).toBeGreaterThan(luma(texelAt(w, strip, 0, -19.7)));
    w.dispose();
  });

  it('lets a dour area dial the shoreline band down without touching the module', () => {
    // The Docks canal is 7m across, so its band is a large fraction of the
    // whole surface; foamStrength is the dial for that.
    const loud = createWater(CANAL, { color: 0x24445e });
    const quiet = createWater(CANAL, { color: 0x24445e, foamStrength: 0.2 });
    expect(luma(texelAt(quiet, CANAL, 0, 3.4)))
      .toBeLessThan(luma(texelAt(loud, CANAL, 0, 3.4)));
    loud.dispose();
    quiet.dispose();
  });

  it('takes an explicit palette override for a body that is art-directed', () => {
    const w = createWater(POND, { colors: { deep: [0, 0, 0] } });
    expect(texelAt(w, POND, POND.x, POND.z).slice(0, 3)).toEqual([0, 0, 0]);
    w.dispose();
  });

  it('derives shallow, deep and foam from the one colour a call site has', () => {
    const { shallow, deep, foam } = waterRamp(0x7ab0d8);
    expect(luma(deep)).toBeLessThan(luma(shallow));
    expect(luma(shallow)).toBeLessThan(luma(foam));
    // foam is tinted, not white — a hard white rim reads as a swimming pool
    expect(Math.max(...foam)).toBeLessThan(255);
    expect(Math.max(...foam) - Math.min(...foam)).toBeGreaterThan(4);
  });

  it('places BOTH ends of the ramp below the authored colour', () => {
    // The counter-intuitive one, and the reason the first pass looked like
    // milk: the scene's ~2.7x diffuse gain already clips anything much above
    // mid-grey, so the authored hex is the body's identity, not one end of the
    // ramp. A "shallow" lifted above it renders as white.
    for (const hex of [0x7ab0d8, 0x4a90c0, 0x24445e]) {
      const base = luma([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);
      const { shallow, deep } = waterRamp(hex);
      expect(luma(shallow), `shallow for ${hex.toString(16)}`).toBeLessThan(base);
      expect(luma(deep), `deep for ${hex.toString(16)}`).toBeLessThan(luma(shallow));
    }
  });

  it('sizes the ramp map from the footprint, so a 7m canal is not paying for 256 rows', () => {
    const canal = createWater(CANAL, {});
    const pond = createWater(POND, {});
    expect(canal.rampSize).toEqual([256, 32]); // 90m x 7m at ~0.35m/texel
    expect(pond.rampSize).toEqual([64, 64]);   // 14m square
    canal.dispose();
    pond.dispose();
  });
});

// ---------------------------------------------------------------------------
// Specular response.
// ---------------------------------------------------------------------------
describe('specular response', () => {
  it('is a dielectric: metalness stays 0 so the depth ramp survives', () => {
    const w = createWater(POND, {});
    expect(w.material.metalness).toBe(0);
    w.dispose();
  });

  it('bakes absolute roughness into the map, glossy deep and rough at the rim', () => {
    const w = createWater(POND, {});
    // roughness is the multiplier on roughnessMap.g, so it must be 1 here or
    // the baked numbers mean nothing.
    expect(w.material.roughness).toBe(1);
    const [, mid] = texel(w.textures.roughness, 32, 32); // pond centre
    const [, rim] = texel(w.textures.roughness, 62, 32); // ~6.6m out, the band
    expect(mid / 255).toBeCloseTo(WATER_TUNING.ROUGH_DEEP, 1);
    expect(rim).toBeGreaterThan(mid);
    // every channel filled: roughnessMap reads .g, and a red-only texture
    // would come back g = 0, i.e. a mirror
    const px = texel(w.textures.roughness, 32, 32);
    expect(px[0]).toBe(px[1]);
    expect(px[1]).toBe(px[2]);
    w.dispose();
  });

  it('scales the shared IBL rather than re-deciding it, and scales it DOWN', () => {
    const w = createWater(POND, {});
    // a multiplier on scene.environmentIntensity, never a replacement for it —
    // so composerRig.applyLighting's tier numbers and Night Eyes' dusk gain
    // both still carry through
    expect(w.material.envMapIntensity).toBe(WATER_TUNING.ENV_INTENSITY);
    // ...and below 1, which is the counter-intuitive half: a horizontal plane
    // seen from a 2.2m camera is almost all grazing angle, where Fresnel
    // already reflects nearly everything, so boosting the probe on top of that
    // whites the near half of the body out. See the ENV_INTENSITY note.
    expect(w.material.envMapIntensity).toBeLessThan(1);
    // the low tier can afford the full probe: with no normal map, there is no
    // ripple for the reflection to break up against
    const lo = createWater(POND, { quality: 'low' });
    expect(lo.material.envMapIntensity).toBeGreaterThan(w.material.envMapIntensity);
    w.dispose();
    lo.dispose();
  });
});

// ---------------------------------------------------------------------------
// Ripple.
// ---------------------------------------------------------------------------
describe('the ripple', () => {
  const phases = [0.3, 1.1, 2.4, 4.0, 5.2, 0.9];

  it('is exactly periodic, so any texture.repeat still wraps seamlessly', () => {
    // The reason repeat can be 10 x 17.5 on the sea without a visible seam.
    expect(rippleHeight(0.3, 0.5, phases)).toBeCloseTo(rippleHeight(1.3, 0.5, phases), 10);
    expect(rippleHeight(0.3, 0.5, phases)).toBeCloseTo(rippleHeight(0.3, 1.5, phases), 10);
    expect(rippleHeight(0.3, 0.5, phases)).toBeCloseTo(rippleHeight(-1.7, 2.5, phases), 10);
  });

  it('tiles at a fixed world size, so a canal ripple is the size of a sea ripple', () => {
    const canal = createWater(CANAL, {});
    const sea = createWater(SEA, { shores: ['minX'] });
    const perTile = (h, w) => (waterBox(w).maxX - waterBox(w).minX) / h.material.normalMap.repeat.x;
    expect(perTile(canal, CANAL)).toBeCloseTo(WATER_TUNING.RIPPLE_TILE_M, 10);
    expect(perTile(sea, SEA)).toBeCloseTo(WATER_TUNING.RIPPLE_TILE_M, 10);
    canal.dispose();
    sea.dispose();
  });

  it('scrolls and swells on update, wrapping the offset so it cannot drift', () => {
    const w = createWater(POND, {});
    expect(w.animated).toBe(true);
    expect(w.textures.normal.offset.x).toBe(0);
    w.update(1);
    expect(w.textures.normal.offset.x).toBeCloseTo(WATER_TUNING.DRIFT_U, 10);
    expect(w.textures.normal.offset.y).toBeCloseTo(WATER_TUNING.DRIFT_V, 10);
    // the swell: normalScale must have moved off its base by a quarter cycle
    const base = WATER_TUNING.NORMAL_SCALE;
    w.update(WATER_TUNING.SWELL_PERIOD / 4 - 1);
    expect(w.material.normalScale.x).toBeCloseTo(base * (1 + WATER_TUNING.SWELL_DEPTH), 6);
    expect(w.material.normalScale.x).toBe(w.material.normalScale.y);
    // ...and after an hour of walking the offset is still in [0, 1)
    for (let i = 0; i < 3600; i++) w.update(1);
    expect(w.textures.normal.offset.x).toBeGreaterThanOrEqual(0);
    expect(w.textures.normal.offset.x).toBeLessThan(1);
    w.dispose();
  });

  it('is seeded and self-contained — same id, same water, every walk', () => {
    const a = createWater(POND, {});
    const b = createWater(POND, {});
    const other = createWater({ ...POND, id: 'pond-2' }, {});
    expect(Array.from(a.textures.normal.image.data))
      .toEqual(Array.from(b.textures.normal.image.data));
    expect(Array.from(a.textures.normal.image.data))
      .not.toEqual(Array.from(other.textures.normal.image.data));
    a.dispose();
    b.dispose();
    other.dispose();
  });

  it('stays within the slope headroom it declares', () => {
    const w = createWater(POND, {});
    const data = w.textures.normal.image.data;
    let peak = 0;
    for (let o = 0; o < data.length; o += 4) {
      // the tilt of the whole texel, not of one axis — the steepest face in
      // the field is diagonal, so a per-component max would under-report it
      peak = Math.max(peak, Math.hypot(data[o] / 255 * 2 - 1, data[o + 1] / 255 * 2 - 1));
    }
    // normalised, so the steepest face is SLOPE/hypot(SLOPE, 1) — and the
    // field must actually REACH it, or the self-normalisation is broken.
    const want = WATER_TUNING.SLOPE / Math.hypot(WATER_TUNING.SLOPE, 1);
    expect(peak).toBeCloseTo(want, 2);
    w.dispose();
  });
});

// ---------------------------------------------------------------------------
// Degradation.
// ---------------------------------------------------------------------------
describe('degradation', () => {
  it('low tier keeps the ramp and drops every per-frame cost', () => {
    const w = createWater(POND, { quality: 'low' });
    expect(w.tier).toBe('low');
    expect(w.animated).toBe(false);
    expect(w.material.normalMap).toBe(null);
    expect(w.material.roughnessMap).toBe(null);
    expect(w.textures.normal).toBe(null);
    // the half that costs nothing per frame survives
    expect(w.material.map.isDataTexture).toBe(true);
    // a single flat roughness rather than a second sampler
    expect(w.material.roughness).toBe(WATER_TUNING.ROUGH_LOW);
    expect(() => w.update(0.05)).not.toThrow();
    w.dispose();
  });

  it('accepts a resolveQuality tier object as well as its name', () => {
    const w = createWater(POND, { quality: { name: 'low', postFx: false } });
    expect(w.tier).toBe('low');
    w.dispose();
  });

  it('reduced motion keeps the look and freezes the motion', () => {
    const w = createWater(POND, { quality: 'high', reducedMotion: true });
    // still the high-tier surface — reduced MOTION, not reduced detail
    expect(w.material.normalMap).not.toBe(null);
    expect(w.material.roughnessMap).not.toBe(null);
    expect(w.animated).toBe(false);
    w.update(5);
    expect(w.textures.normal.offset.x).toBe(0);
    expect(w.material.normalScale.x).toBe(WATER_TUNING.NORMAL_SCALE);
    w.dispose();
  });
});

// ---------------------------------------------------------------------------
// Disposal.
// ---------------------------------------------------------------------------
describe('disposal', () => {
  const spyAll = (w) => [w.textures.color, w.textures.roughness, w.textures.normal]
    .filter(Boolean).map((t) => vi.spyOn(t, 'dispose'));

  it('frees geometry, material and every texture it allocated', () => {
    const w = createWater(POND, {});
    const texSpies = spyAll(w);
    const geo = vi.spyOn(w.mesh.geometry, 'dispose');
    w.dispose();
    for (const s of texSpies) expect(s).toHaveBeenCalled();
    expect(geo).toHaveBeenCalled();
  });

  it('is idempotent — a double dispose is not a double free', () => {
    const w = createWater(POND, {});
    const texSpies = spyAll(w);
    w.dispose();
    w.dispose();
    for (const s of texSpies) expect(s).toHaveBeenCalledTimes(1);
  });

  it('frees its textures even if only endWalk\'s scene traversal runs', () => {
    // endWalk traverses the scene and calls material.dispose() (and m.map's),
    // but nothing reaches normalMap or roughnessMap. Three's Material fires a
    // 'dispose' event, so the module hangs its cleanup off that as a net.
    const w = createWater(POND, {});
    const [, rough, normal] = [w.textures.color, w.textures.roughness, w.textures.normal];
    const spies = [vi.spyOn(rough, 'dispose'), vi.spyOn(normal, 'dispose')];
    w.material.dispose();
    for (const s of spies) expect(s).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The rig.
// ---------------------------------------------------------------------------
describe('waterRig', () => {
  it('gives the session one update/dispose pair for a whole area', () => {
    const a = createWater(POND, {});
    const b = createWater(CANAL, {});
    const rig = waterRig([a, b]);
    rig.update(1);
    expect(a.textures.normal.offset.x).toBeCloseTo(WATER_TUNING.DRIFT_U, 10);
    expect(b.textures.normal.offset.x).toBeCloseTo(WATER_TUNING.DRIFT_U, 10);
    const spy = vi.spyOn(a.textures.color, 'dispose');
    rig.dispose();
    expect(spy).toHaveBeenCalled();
  });

  it('is a no-op for an area with no water — the neighborhood, the den', () => {
    const rig = waterRig();
    expect(() => { rig.update(0.05); rig.dispose(); }).not.toThrow();
    expect(rig.bodies).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THE INTEGRATION PIN.
//
// test/water.test.js's "draws that footprint from the declaration" case is the
// thing that stops mesh and data drifting, and the integration pass is going
// to replace the mesh it inspects with one of ours. So run its matcher against
// what this module produces, for all three REAL footprints read out of the
// shipped builders — not against literals retyped here, which is the mistake
// that case exists to catch.
// ---------------------------------------------------------------------------
describe('a swapped-in water mesh still satisfies test/water.test.js', () => {
  it('matches every declared footprint in the park, the seaside and the docks', async () => {
    const areas = {
      park: (await import('../src/world/park.js')).build,
      seaside: (await import('../src/world/seaside.js')).build,
      docks: (await import('../src/world/docks.js')).build,
    };
    for (const [name, build] of Object.entries(areas)) {
      const area = build(new THREE.Scene());
      expect(area.waters?.length, `${name} declares water`).toBeGreaterThan(0);
      for (const footprint of area.waters) {
        const handle = createWater(footprint, { y: 0.03 });
        const m = handle.mesh;
        const p = m.geometry.parameters;
        if (footprint.kind === 'circle') {
          expect(m.geometry.type).toBe('CircleGeometry');
          expect(Math.abs(p.radius - footprint.r)).toBeLessThan(1e-6);
          expect(Math.abs(m.position.x - footprint.x)).toBeLessThan(1e-6);
          expect(Math.abs(m.position.z - footprint.z)).toBeLessThan(1e-6);
        } else {
          expect(m.geometry.type).toBe('PlaneGeometry');
          const drawn = [p.width, p.height].sort((a, b) => a - b);
          const want = [footprint.maxX - footprint.minX, footprint.maxZ - footprint.minZ]
            .sort((a, b) => a - b);
          expect(Math.abs(drawn[0] - want[0])).toBeLessThan(1e-6);
          expect(Math.abs(drawn[1] - want[1])).toBeLessThan(1e-6);
          expect(Math.abs(m.position.x - (footprint.minX + footprint.maxX) / 2)).toBeLessThan(1e-6);
          expect(Math.abs(m.position.z - (footprint.minZ + footprint.maxZ) / 2)).toBeLessThan(1e-6);
        }
        handle.dispose();
      }
    }
  });
});
