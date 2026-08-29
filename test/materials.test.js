import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  litMaterial,
  surfaceMaterial,
  surfaceMaterialNoMap,
  surfaceProps,
  repeatFor,
  tileMetres,
  SURFACE_PRESETS,
  SURFACE_PRESET_NAMES,
} from '../src/render/materials.js';
import {
  setTextureTier,
  surfaceMaps,
  textureTileMetres,
  SURFACE_NAMES,
  __resetSurfaceTextures,
} from '../src/render/textures.js';

// Two materials are "the same material" if their serialised form matches once
// the per-instance uuid is dropped. That is the strongest available stand-in
// for "byte-identical", and it is what the 39 existing call sites are owed.
function shape(mat) {
  const json = mat.toJSON();
  delete json.uuid;
  return json;
}

function fakeCtx() {
  const ctx = {
    fillStyle: '',
    fillRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    roundRect: () => {},
    rect: () => {},
    fill: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  };
  return ctx;
}

function installFakeDocument() {
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }),
  };
}

beforeEach(() => {
  __resetSurfaceTextures();
});

afterEach(() => {
  delete globalThis.document;
  __resetSurfaceTextures();
});

describe('litMaterial — the unchanged path', () => {
  it('with no opts is exactly the material it has always been', () => {
    const expected = new THREE.MeshStandardMaterial({
      color: 0x8a6a48,
      roughness: 0.9,
      metalness: 0.0,
    });
    expect(shape(litMaterial(0x8a6a48))).toEqual(shape(expected));
  });

  it('passes extras through untouched, as the old Lambert call sites need', () => {
    const expected = new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      roughness: 0.9,
      metalness: 0.0,
      emissive: 0x9a7a20,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const got = litMaterial(0xf2c14e, {
      emissive: 0x9a7a20,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    expect(shape(got)).toEqual(shape(expected));
  });

  it('never carries a map when no surface is asked for', () => {
    expect(litMaterial(0x445566).map).toBeNull();
  });

  it('does not warn on the default path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    litMaterial(0x445566);
    litMaterial(0x445566, { emissive: 0x111111 });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('surface presets', () => {
  it('every preset carries the roughness and metalness it claims', () => {
    for (const name of SURFACE_PRESET_NAMES) {
      const preset = SURFACE_PRESETS[name];
      const mat = litMaterial(0xffffff, { surface: name });
      expect(mat.roughness).toBe(preset.roughness);
      expect(mat.metalness).toBe(preset.metalness);
      expect(surfaceProps(name)).toEqual({
        roughness: preset.roughness,
        metalness: preset.metalness,
      });
    }
  });

  it('matte is the shipped default, named', () => {
    expect(shape(litMaterial(0x8a6a48, { surface: 'matte' }))).toEqual(
      shape(litMaterial(0x8a6a48))
    );
  });

  it('keeps gloss to a sheen — nothing but glass and water goes below 0.3', () => {
    for (const name of SURFACE_PRESET_NAMES) {
      if (name === 'glass' || name === 'water') continue;
      expect(SURFACE_PRESETS[name].roughness).toBeGreaterThanOrEqual(0.3);
    }
    // …and nothing at all sits under the probe-resolution floor.
    for (const name of SURFACE_PRESET_NAMES) {
      expect(SURFACE_PRESETS[name].roughness).toBeGreaterThan(0.05);
    }
  });

  it('bareMetal is the only metal, and is not a pure mirror', () => {
    const metals = SURFACE_PRESET_NAMES.filter((n) => SURFACE_PRESETS[n].metalness > 0);
    expect(metals).toEqual(['bareMetal']);
    // Below 1.0 on purpose: a pure metal has no diffuse term and the colour
    // the call site chose would vanish.
    expect(SURFACE_PRESETS.bareMetal.metalness).toBeLessThan(1);
  });

  it('wet stone is glossier than the dry stone it shares a map with', () => {
    expect(SURFACE_PRESETS.wetStone.roughness).toBeLessThan(SURFACE_PRESETS.cobble.roughness);
    expect(SURFACE_PRESETS.wetStone.texture).toBe(SURFACE_PRESETS.cobble.texture);
  });

  it('lets a call site override a preset value for one prop', () => {
    const mat = litMaterial(0xb05a4a, { surface: 'brick', roughness: 0.5, emissive: 0x110000 });
    expect(mat.roughness).toBe(0.5);
    expect(mat.metalness).toBe(SURFACE_PRESETS.brick.metalness);
    expect(mat.emissive.getHex()).toBe(0x110000);
  });

  it('never leaks the surface or repeat keys into the material', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mat = litMaterial(0xb05a4a, { surface: 'brick', repeat: [3, 2] });
    expect(mat.surface).toBeUndefined();
    expect(mat.repeat).toBeUndefined();
    // THREE.Material.setValues warns about parameters it does not recognise;
    // a leak would show up here.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to the default and warns once for an unknown surface', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mat = litMaterial(0x123456, { surface: 'unobtanium', emissive: 0x010101 });
    expect(mat.roughness).toBe(0.9);
    expect(mat.metalness).toBe(0);
    expect(mat.emissive.getHex()).toBe(0x010101);
    expect(warn).toHaveBeenCalledTimes(1);
    litMaterial(0x123456, { surface: 'unobtanium' });
    expect(warn).toHaveBeenCalledTimes(1); // once per name, not once per prop
    warn.mockRestore();
  });

  it('surfaceMaterial is the reading form of the same call', () => {
    const a = surfaceMaterial('wood', 0x8a6a42, { side: THREE.DoubleSide });
    const b = litMaterial(0x8a6a42, { surface: 'wood', side: THREE.DoubleSide });
    expect(shape(a)).toEqual(shape(b));
  });
});

describe('repeatFor / tileMetres speak the PRESET vocabulary', () => {
  // The regression this block exists for: repeatFor used to live in
  // textures.js keyed on the 7 TEXTURE names, while call sites hold one of
  // the 16 PRESET names. 'wetStone' is a preset backed by the cobble texture,
  // so repeatFor('wetStone', w, h) missed the lookup and returned a
  // perfectly plausible [1, 1] — no error, no warning, just cobbles rendered
  // about three times too large. It survived every test in this suite and was
  // only caught by putting a wetStone panel next to a cobble panel.
  //
  // The first assertion below is the one that would have caught it.
  it('resolves EVERY mapped preset to its texture’s tile scale', () => {
    const mapped = SURFACE_PRESET_NAMES.filter((n) => SURFACE_PRESETS[n].texture);
    expect(mapped.length).toBeGreaterThan(0);
    for (const name of mapped) {
      const mapName = SURFACE_PRESETS[name].texture;
      expect(repeatFor(name, 3.0, 2.4), name).toEqual(repeatFor(mapName, 3.0, 2.4));
      expect(tileMetres(name), name).toBe(textureTileMetres(mapName));
      // …and specifically is not the old silent fallback.
      expect(repeatFor(name, 3.0, 2.4), name).not.toBeNull();
      expect(repeatFor(name, 12, 12), name).not.toEqual([1, 1]);
    }
  });

  it('resolves the aliasing presets to the same numbers as their base', () => {
    // The two many-to-one cases, spelled out, because they are the ones a
    // future edit is most likely to break.
    expect(repeatFor('wetStone', 3.0, 2.4)).toEqual(repeatFor('cobble', 3.0, 2.4));
    expect(repeatFor('wood', 3.0, 2.4)).toEqual(repeatFor('plank', 3.0, 2.4));
  });

  it('also accepts a bare texture name, so neither vocabulary is a trap', () => {
    for (const name of SURFACE_NAMES) {
      expect(repeatFor(name, 3.6, 2.7), name).not.toBeNull();
      expect(tileMetres(name), name).toBe(textureTileMetres(name));
    }
  });

  it('rounds to whole tiles so no unit is sliced at a face edge', () => {
    // brick tiles cover 0.9 world units.
    expect(repeatFor('brick', 3.6, 2.7)).toEqual([4, 3]);
    // Rounds rather than truncating: 4.1/0.9 = 4.56 -> 5.
    expect(repeatFor('brick', 4.1, 0.9)).toEqual([5, 1]);
    // Never below one whole tile, however small the face.
    expect(repeatFor('grass', 0.2, 0.2)).toEqual([1, 1]);
  });

  it('returns null, silently, for a map-less preset', () => {
    // A fair question with a real answer: this surface has no tiles. Not a
    // mistake, so not a warning — but null rather than [1, 1] so it cannot be
    // mistaken for a tiling decision either.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const name of ['matte', 'plaster', 'bark', 'foliage', 'glass', 'water', 'paintedMetal', 'bareMetal']) {
      expect(repeatFor(name, 4, 3), name).toBeNull();
      expect(tileMetres(name), name).toBeNull();
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns once for a name in neither vocabulary', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(repeatFor('granite', 4, 3)).toBeNull();
    expect(tileMetres('granite')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a null repeat means "surface default", not "one tile"', () => {
    // The safety net for a caller who writes the uniform thing across a file:
    //   { surface: 'glass', repeat: repeatFor('glass', w, h) }
    // must not end up different from omitting repeat entirely.
    installFakeDocument();
    setTextureTier('high');
    const a = litMaterial(0xb05a4a, { surface: 'brick', repeat: repeatFor('bark', 4, 3) });
    const b = litMaterial(0xb05a4a, { surface: 'brick' });
    expect(a.map).toBe(b.map);
  });
});

describe('surfaceMaterialNoMap', () => {
  it('keeps the preset light response and drops the map', () => {
    installFakeDocument();
    setTextureTier('high');
    const flat = surfaceMaterialNoMap('wood', 0xc8b088);
    expect(flat.map).toBeNull();
    expect(flat.roughness).toBe(SURFACE_PRESETS.wood.roughness);
    expect(flat.metalness).toBe(SURFACE_PRESETS.wood.metalness);
    // …and the mapped form of the same surface really does differ, so this
    // test cannot pass by the texture path being broken.
    expect(surfaceMaterial('wood', 0xc8b088).map).not.toBeNull();
  });

  it('matches the local helper it replaces in two world files', () => {
    const mine = surfaceMaterialNoMap('bark', 0x7a5230, { side: THREE.DoubleSide });
    const theirs = litMaterial(0x7a5230, { ...surfaceProps('bark'), side: THREE.DoubleSide });
    expect(shape(mine)).toEqual(shape(theirs));
  });

  it('is a no-op difference for a preset that has no map anyway', () => {
    expect(shape(surfaceMaterialNoMap('glass', 0xa8d8e8))).toEqual(
      shape(surfaceMaterial('glass', 0xa8d8e8))
    );
  });
});

describe('maps', () => {
  it('degrades to flat colour with no document, without throwing', () => {
    expect(typeof document).toBe('undefined');
    for (const name of SURFACE_PRESET_NAMES) {
      const mat = litMaterial(0xffffff, { surface: name, repeat: [4, 4] });
      expect(mat.map).toBeNull();
      // The light response survives even when the texture cannot.
      expect(mat.roughness).toBe(SURFACE_PRESETS[name].roughness);
    }
  });

  it('degrades to flat colour on the low quality tier', () => {
    installFakeDocument();
    setTextureTier('low');
    expect(litMaterial(0xb05a4a, { surface: 'brick' }).map).toBeNull();
  });

  it('attaches the surface map on the high tier', () => {
    installFakeDocument();
    setTextureTier('high');
    const mat = litMaterial(0xb05a4a, { surface: 'brick' });
    expect(mat.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(mat.map.name).toBe('surface:brick');
  });

  it('honours a repeat derived from the face size', () => {
    installFakeDocument();
    setTextureTier('high');
    const mat = litMaterial(0xb05a4a, { surface: 'brick', repeat: repeatFor('brick', 3.6, 2.7) });
    expect(mat.map.repeat.x).toBe(4);
    expect(mat.map.repeat.y).toBe(3);
  });

  it('shares one map instance across every prop asking for the same surface', () => {
    installFakeDocument();
    setTextureTier('high');
    const a = litMaterial(0xb05a4a, { surface: 'brick' });
    const b = litMaterial(0x9a4a3a, { surface: 'brick' });
    expect(a.map).toBe(b.map);
    expect(a).not.toBe(b);
  });

  it('gives the map-less presets no map even on the high tier', () => {
    installFakeDocument();
    setTextureTier('high');
    for (const name of ['matte', 'plaster', 'bark', 'foliage', 'glass', 'water', 'paintedMetal', 'bareMetal']) {
      expect(SURFACE_PRESETS[name].texture).toBeUndefined();
      expect(litMaterial(0xffffff, { surface: name }).map).toBeNull();
    }
  });
});

// ===========================================================================
// Wave 5.1 — normalScale
// ===========================================================================
// A rasterising fake, so the normal path can actually build. materials.js's
// fakeCtx above deliberately has no readback — that is the "degrades to colour
// only" case and it is asserted as such below.
function rasterFakeCtx(S) {
  const px = new Uint8ClampedArray(S * S * 4).fill(255);
  return {
    fillStyle: '',
    fillRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    roundRect: () => {},
    rect: () => {},
    fill: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: (x, y, w, h) => ({ data: px.slice(0, w * h * 4), width: w, height: h }),
    putImageData: () => {},
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  };
}
function installRasterDocument() {
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext() { return rasterFakeCtx(this.width || 256); } }),
  };
}

const MAPPED = SURFACE_PRESET_NAMES.filter((n) => SURFACE_PRESETS[n].texture);
const WITH_NORMAL = MAPPED.filter((n) => (SURFACE_PRESETS[n].normalScale ?? 0) > 0);

describe('normalScale — the table', () => {
  it('only mapped presets carry one, and only grass among them opts out', () => {
    // A normalScale on a preset with no texture would be a number with nothing
    // to scale — silently inert, and exactly the kind of thing that survives
    // review. Grass is the one deliberate abstainer: its height field is 26
    // soft blobs that differentiate to a fifth of a degree plus a scatter of
    // 1x2px flecks, i.e. noise and nothing else, on the largest and most
    // grazing-angle geometry in the game.
    for (const name of SURFACE_PRESET_NAMES) {
      if (SURFACE_PRESETS[name].texture) continue;
      expect(SURFACE_PRESETS[name].normalScale, name).toBeUndefined();
    }
    // Two abstainers, for two different measured reasons — see their comments
    // in the table. Spelled out as a list rather than counted, because "which
    // surfaces got none" is the reviewable decision.
    expect(MAPPED.filter((n) => !WITH_NORMAL.includes(n)).sort()).toEqual(['grass', 'sand']);
  });

  it('keeps every strength inside the hint-of-relief band', () => {
    // The mirror of the roughness-band assertion above, and the same argument:
    // a normal map strong enough to make brick look photographed is the colour
    // floor's failure arriving by a different door (VISUAL-PASS.md section 2).
    // 1.0 would mean the deepest mark the painters' budget allows rendering as
    // a full 26-degree face; nothing here is meant to come close.
    for (const name of WITH_NORMAL) {
      expect(SURFACE_PRESETS[name].normalScale, name).toBeGreaterThan(0.05);
      expect(SURFACE_PRESETS[name].normalScale, name).toBeLessThanOrEqual(0.7);
    }
  });

  it('runs every ground surface quieter than every wall surface', () => {
    // THE calibration, stated as an invariant rather than as nine literals.
    // The sun sits at 19.1 degrees (walk.js SUN_POSITION), so a ground plane's
    // N.L is sin(19.1) = 0.33 and a wall's is cos(19.1) = 0.945 — the same
    // normal map is about ten times louder on the road than on the facade.
    // Anyone re-tuning this table who leaves a road at a wall's strength has
    // missed the whole point, and this is where they find out.
    const walls = ['brick', 'siding', 'shingle'];
    const grounds = ['cobble', 'wetStone', 'gravel'];
    const maxGround = Math.max(...grounds.map((n) => SURFACE_PRESETS[n].normalScale));
    const minWall = Math.min(...walls.map((n) => SURFACE_PRESETS[n].normalScale));
    expect(maxGround).toBeLessThan(minWall);
    // 'wood' is the case that has to be argued rather than classified: fences
    // are vertical but decking and dock boards are horizontal, and a shared
    // preset has to be safe on its worst geometry. So it sits with the ground.
    expect(SURFACE_PRESETS.wood.normalScale).toBeLessThan(minWall);
  });

  it('runs wet stone quieter than the dry stone it shares a map with', () => {
    // Same tile, two strengths, one upload — which is only possible because
    // normalScale is a material uniform rather than a property of the texture.
    // Lower because a specular lobe turns through 2*theta for theta of normal
    // tilt, so at roughness 0.42 the same relief that is a hint on dry cobble
    // shatters the quay's specular sheet into crawling glints.
    expect(SURFACE_PRESETS.wetStone.normalScale).toBeLessThan(SURFACE_PRESETS.cobble.normalScale);
    expect(SURFACE_PRESETS.wetStone.texture).toBe(SURFACE_PRESETS.cobble.texture);
  });

  it('gives sand none while gravel keeps one, which is the whole distinction', () => {
    // The two granular ground surfaces split, and the axis they split on is
    // the one that decides whether a derived normal map can do anything at
    // all. A gravel chip is a coherent 4-6 texel facet with a hard edge, so
    // its normals survive the mip chain and read as tooth; a sand grain is two
    // texels of symmetric, spatially uncorrelated noise, so neighbouring
    // texels cancel and the map measured as invisible on the real renderer
    // even at two and a half times its shipped strength.
    expect(SURFACE_PRESETS.sand.normalScale).toBeUndefined();
    expect(SURFACE_PRESETS.gravel.normalScale).toBeGreaterThan(0);
    // …and both still carry their colour map, which is where sand's grain has
    // always lived.
    expect(SURFACE_PRESETS.sand.texture).toBe('sand');
  });
});

describe('normalScale — the material', () => {
  it('attaches the derived normal map at the preset’s strength', () => {
    installRasterDocument();
    setTextureTier('high');
    for (const name of WITH_NORMAL) {
      const mat = litMaterial(0xffffff, { surface: name });
      expect(mat.normalMap, name).toBeInstanceOf(THREE.CanvasTexture);
      expect(mat.normalMap.name, name).toBe(`surface:${SURFACE_PRESETS[name].texture}:normal`);
      expect(mat.normalScale.x, name).toBe(SURFACE_PRESETS[name].normalScale);
      expect(mat.normalScale.y, name).toBe(SURFACE_PRESETS[name].normalScale);
    }
  });

  it('gives the abstainers their colour map and no normal map — and never derives one', () => {
    installRasterDocument();
    setTextureTier('high');
    for (const name of ['grass', 'sand']) {
      const m = litMaterial(0xffffff, { surface: name });
      expect(m.map, name).not.toBeNull();
      expect(m.normalMap, name).toBeNull();
    }
    const mat = litMaterial(0x7cb860, { surface: 'grass' });
    // Not merely unattached: the abstention has to be free, or it is only an
    // art decision and not a VRAM one. surfaceMaps() builds what it is asked
    // for, so a preset with no normalScale must not go through it at all.
    const { normalMap } = surfaceMaps('grass');
    expect(normalMap).not.toBeNull();          // it CAN be built, on request…
    __resetSurfaceTextures();
    installRasterDocument();
    setTextureTier('high');
    litMaterial(0x7cb860, { surface: 'grass' });
    let derived = false;
    globalThis.document = { createElement: () => { derived = true; return { width: 0, height: 0, getContext: () => rasterFakeCtx(256) }; } };
    litMaterial(0x7cb860, { surface: 'grass' });
    expect(derived).toBe(false);               // …but litMaterial never asks.
  });

  it('locks the normal map’s repeat to the colour map’s, whatever the caller says', () => {
    // The failure this prevents is not a crash: two maps at different
    // densities render, and the relief SLIDES across the colour it belongs to
    // at a beat frequency set by the ratio. On a 120m ground plane that is a
    // slow crawling moire that looks like a shader bug.
    installRasterDocument();
    setTextureTier('high');
    for (const repeat of [undefined, [4, 3], [100, 100], repeatFor('cobble', 120, 120)]) {
      const mat = litMaterial(0x8a8a92, { surface: 'cobble', ...(repeat ? { repeat } : {}) });
      expect(mat.normalMap.repeat.x, String(repeat)).toBe(mat.map.repeat.x);
      expect(mat.normalMap.repeat.y, String(repeat)).toBe(mat.map.repeat.y);
    }
  });

  it('shares one normal map across every prop asking for the same surface', () => {
    installRasterDocument();
    setTextureTier('high');
    expect(litMaterial(0xb05a4a, { surface: 'brick' }).normalMap)
      .toBe(litMaterial(0x9a4a3a, { surface: 'brick' }).normalMap);
    // …and across the two presets that share the cobble tile, at their own
    // strengths.
    const dry = litMaterial(0x8a8a92, { surface: 'cobble' });
    const wet = litMaterial(0x4e4e58, { surface: 'wetStone' });
    expect(wet.normalMap).toBe(dry.normalMap);
    expect(wet.normalScale.x).not.toBe(dry.normalScale.x);
  });

  it('gives the low tier no normal map and no normalScale', () => {
    installRasterDocument();
    setTextureTier({ name: 'low', normalMaps: false });
    const mat = litMaterial(0xb05a4a, { surface: 'brick' });
    expect(mat.map).toBeNull();
    expect(mat.normalMap).toBeNull();
    expect(mat.normalScale.x).toBe(1);         // three's untouched default
  });

  it('gives a high tier with normal maps off the colour map only', () => {
    installRasterDocument();
    setTextureTier({ name: 'high', normalMaps: false });
    const mat = litMaterial(0xb05a4a, { surface: 'brick' });
    expect(mat.map).not.toBeNull();
    expect(mat.normalMap).toBeNull();
  });

  it('degrades to colour only with no document, and with no readback', () => {
    expect(typeof document).toBe('undefined');
    expect(litMaterial(0xb05a4a, { surface: 'brick' }).normalMap).toBeNull();
    installFakeDocument();                     // the readback-less fake at the top of this file
    setTextureTier('high');
    const mat = litMaterial(0xb05a4a, { surface: 'brick' });
    expect(mat.map).not.toBeNull();
    expect(mat.normalMap).toBeNull();
  });

  it('never leaks normalScale into a material that has no normal map', () => {
    // MeshStandardMaterial's own default is Vector2(1, 1). Setting a preset's
    // strength on a material with no normalMap would be inert today and would
    // become a surprise the moment one was attached elsewhere.
    installRasterDocument();
    setTextureTier({ name: 'high', normalMaps: false });
    for (const name of WITH_NORMAL) {
      expect(litMaterial(0xffffff, { surface: name }).normalScale.x, name).toBe(1);
    }
  });

  it('does not warn on any surface path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installRasterDocument();
    setTextureTier('high');
    for (const name of SURFACE_PRESET_NAMES) litMaterial(0xffffff, { surface: name, repeat: [3, 3] });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('leaves the no-surface material byte-identical, normal map or not', () => {
    installRasterDocument();
    setTextureTier('high');
    const expected = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9, metalness: 0.0 });
    expect(shape(litMaterial(0x8a6a48))).toEqual(shape(expected));
  });
});
