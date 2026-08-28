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
