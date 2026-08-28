import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  surfaceTexture,
  setTextureTier,
  getTextureTier,
  clampToFloor,
  textureTileMetres,
  isTextureName,
  FLOOR_LUM,
  SURFACE_NAMES,
  __BUDGET,
  __resetSurfaceTextures,
} from '../src/render/textures.js';

// textures.js runs in a plain node test environment (no jsdom), so its
// `document` guard normally makes it a no-op here — which is itself one of the
// things worth asserting. Everything else needs a stand-in canvas, and this
// file has two of them, because they answer different questions:
//
//   recordingCtx — logs draw ops. Cheap. Proves DETERMINISM (same ops every
//                  boot) and painter discipline (no stroke exceeds its cap).
//   rasterCtx    — actually composites pixels, including getImageData /
//                  putImageData so the clamp really runs. Proves the property
//                  that matters: no texel below the floor.
//
// The second exists because the first cannot answer the second's question.
// Per-draw-call alpha and resulting pixel value are different invariants:
// overlapping source-over strokes composite multiplicatively, so a painter
// can satisfy "every alpha <= 0.14" and still stack three of them into 0.33.
// That is exactly how a near-black cobble grid passed a fully green suite.

// --- recording fake --------------------------------------------------------
function recordingCtx() {
  // A gradient is recorded as a stable id string rather than as the object
  // itself: a real CanvasGradient is opaque, and comparing two fresh fake
  // objects would compare their (always distinct) closures instead of the
  // paint they describe.
  const grad = (kind, a) => ({
    id: `${kind}(${a.join(',')})`,
    addColorStop: (...s) => ctx.ops.push(['stop', ...s]),
  });
  const style = () => (ctx.fillStyle && ctx.fillStyle.id ? ctx.fillStyle.id : ctx.fillStyle);
  const ctx = {
    ops: [],
    fillStyle: '',
    fillRect: (...a) => ctx.ops.push(['fillRect', style(), ...a]),
    beginPath: () => ctx.ops.push(['beginPath']),
    roundRect: (...a) => ctx.ops.push(['roundRect', ...a]),
    rect: (...a) => ctx.ops.push(['rect', ...a]),
    fill: () => ctx.ops.push(['fill', style()]),
    createLinearGradient: (...a) => {
      ctx.ops.push(['linearGradient', ...a]);
      return grad('lg', a);
    },
    createRadialGradient: (...a) => {
      ctx.ops.push(['radialGradient', ...a]);
      return grad('rg', a);
    },
  };
  return ctx;
}

// --- rasterizing fake ------------------------------------------------------
// A minimal source-over compositor over non-premultiplied RGBA, starting from
// transparent black exactly as a real canvas does — which is what lets this
// catch a painter that forgets its white ground.
//
// Two deliberate approximations, both conservative for what is being measured
// (the DARKEST texel):
//   * roundRect is filled as its bounding rect. That makes a cobble stone
//     slightly larger, i.e. slightly less grout — it cannot invent a dark
//     texel, and the grout minimum is set by the channels between cells,
//     which are unaffected.
//   * no antialiasing. Real canvas AA blends edge texels toward their
//     lighter neighbour, so real minima are equal to or lighter than these.
function parseColor(s) {
  if (s === '#ffffff') return [255, 255, 255, 1];
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.eE+-]+)\)$/.exec(s);
  if (!m) throw new Error(`rasterCtx: unsupported fill style ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function rasterCtx(S) {
  const data = new Float64Array(S * S * 4); // r,g,b,a — all zero: transparent black
  let path = null;

  const blend = (x, y, cr, cg, cb, ca) => {
    if (ca <= 0 || x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const ad = data[i + 3];
    const ao = ca + ad * (1 - ca);
    if (ao <= 0) return;
    data[i] = (cr * ca + data[i] * ad * (1 - ca)) / ao;
    data[i + 1] = (cg * ca + data[i + 1] * ad * (1 - ca)) / ao;
    data[i + 2] = (cb * ca + data[i + 2] * ad * (1 - ca)) / ao;
    data[i + 3] = ao;
  };

  // A gradient resolves to a per-texel alpha; both kinds here interpolate
  // between two stops of the same ink colour, so only alpha varies.
  const sample = (style, x, y) => {
    if (typeof style === 'string') return parseColor(style);
    return style.at(x, y);
  };

  const paintRect = (style, x0, y0, w, h) => {
    const xs = Math.max(0, Math.floor(x0));
    const ys = Math.max(0, Math.floor(y0));
    const xe = Math.min(S, Math.ceil(x0 + w));
    const ye = Math.min(S, Math.ceil(y0 + h));
    for (let y = ys; y < ye; y++) {
      for (let x = xs; x < xe; x++) {
        const [r, g, b, a] = sample(style, x + 0.5, y + 0.5);
        blend(x, y, r, g, b, a);
      }
    }
  };

  const ctx = {
    fillStyle: '#ffffff',
    fillRect: (x, y, w, h) => paintRect(ctx.fillStyle, x, y, w, h),
    beginPath: () => {
      path = null;
    },
    rect: (x, y, w, h) => {
      path = [x, y, w, h];
    },
    roundRect: (x, y, w, h) => {
      path = [x, y, w, h];
    },
    fill: () => {
      if (path) paintRect(ctx.fillStyle, path[0], path[1], path[2], path[3]);
    },
    createLinearGradient: (x0, y0, x1, y1) => {
      const stops = [];
      return {
        addColorStop: (p, c) => stops.push([p, parseColor(c)]),
        at: (px, py) => {
          const dx = x1 - x0;
          const dy = y1 - y0;
          const len2 = dx * dx + dy * dy || 1;
          let t = ((px - x0) * dx + (py - y0) * dy) / len2;
          t = Math.min(1, Math.max(0, t));
          return lerpStops(stops, t);
        },
      };
    },
    createRadialGradient: (x0, y0, r0, x1, y1, r1) => {
      const stops = [];
      return {
        addColorStop: (p, c) => stops.push([p, parseColor(c)]),
        at: (px, py) => {
          const d = Math.hypot(px - x1, py - y1);
          const t = Math.min(1, Math.max(0, (d - r0) / (r1 - r0 || 1)));
          return lerpStops(stops, t);
        },
      };
    },
    // The internal buffer keeps alpha as 0..1 (it is what source-over wants),
    // but ImageData is 0..255 on all four channels. Scaling only three of
    // them makes every texel read back as ~0.4% opaque, which quietly turns
    // the clamp's flatten step into "lerp everything to white" — a fake that
    // would have reported a perfectly compliant, perfectly blank tile.
    getImageData: (x, y, w, h) => {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h * 4; i += 4) {
        out[i] = Math.round(data[i]);
        out[i + 1] = Math.round(data[i + 1]);
        out[i + 2] = Math.round(data[i + 2]);
        out[i + 3] = Math.round(data[i + 3] * 255);
      }
      return { data: out, width: w, height: h };
    },
    putImageData: (img) => {
      for (let i = 0; i < img.data.length; i += 4) {
        data[i] = img.data[i];
        data[i + 1] = img.data[i + 1];
        data[i + 2] = img.data[i + 2];
        data[i + 3] = img.data[i + 3] / 255;
      }
    },
    // Test-side readout of the finished surface.
    __pixels: () => data,
  };
  return ctx;
}

function lerpStops(stops, t) {
  if (!stops.length) return [0, 0, 0, 0];
  if (stops.length === 1) return stops[0][1];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const k = (t - lo[0]) / span;
  return [0, 1, 2, 3].map((c) => lo[1][c] + (hi[1][c] - lo[1][c]) * k);
}

const luminance = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// The last context handed out, so a test can inspect what was painted.
let lastCtx = null;

function installFakeDocument(make = recordingCtx) {
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          lastCtx = make(this.width || 256);
          return lastCtx;
        },
      };
    },
  };
}

beforeEach(() => {
  __resetSurfaceTextures();
  lastCtx = null;
});

afterEach(() => {
  delete globalThis.document;
  __resetSurfaceTextures();
});

describe('headless safety', () => {
  it('returns null instead of throwing when there is no document', () => {
    expect(typeof document).toBe('undefined');
    for (const name of SURFACE_NAMES) {
      expect(surfaceTexture(name)).toBeNull();
    }
  });

  it('still answers the pure queries with no document', () => {
    expect(textureTileMetres('brick')).toBeGreaterThan(0);
    expect(isTextureName('brick')).toBe(true);
  });
});

describe('quality tier gate', () => {
  it('defaults to high so a caller that never opts in still gets textures', () => {
    expect(getTextureTier()).toBe('high');
  });

  it('builds nothing at all on the low tier', () => {
    installFakeDocument();
    setTextureTier({ name: 'low' });
    for (const name of SURFACE_NAMES) expect(surfaceTexture(name)).toBeNull();
    // Nothing was painted: the low tier must cost zero canvas work and zero
    // texture memory, not merely hide the result.
    expect(lastCtx).toBeNull();
  });

  it('accepts a bare tier name as well as a resolveQuality tier object', () => {
    expect(setTextureTier('low')).toBe('low');
    expect(setTextureTier({ name: 'high' })).toBe('high');
  });

  it('ignores an unrecognised tier rather than silently disabling textures', () => {
    setTextureTier('high');
    setTextureTier('ultra');
    expect(getTextureTier()).toBe('high');
  });
});

describe('memoisation', () => {
  it('returns the same instance for the same surface, for the app lifetime', () => {
    installFakeDocument();
    for (const name of SURFACE_NAMES) {
      const a = surfaceTexture(name);
      const b = surfaceTexture(name);
      expect(a).toBeInstanceOf(THREE.CanvasTexture);
      expect(b).toBe(a);
    }
  });

  it('paints each surface exactly once', () => {
    installFakeDocument();
    const first = surfaceTexture('cobble');
    const painted = lastCtx;
    lastCtx = null;
    surfaceTexture('cobble');
    surfaceTexture('cobble');
    expect(lastCtx).toBeNull(); // no second canvas was ever asked for
    expect(painted.ops.length).toBeGreaterThan(0);
    expect(first).toBe(surfaceTexture('cobble'));
  });

  it('shares one instance per distinct repeat, and one Source across all of them', () => {
    installFakeDocument();
    const base = surfaceTexture('brick');
    const wide = surfaceTexture('brick', { repeat: [6, 4] });
    const wideAgain = surfaceTexture('brick', { repeat: [6, 4] });
    expect(wide).not.toBe(base);
    expect(wideAgain).toBe(wide);
    // The whole reason variants are affordable: three keys its GPU upload on
    // the Source, and repeat is a uniform rather than a sampler parameter, so
    // every variant is one texture in VRAM.
    expect(wide.source).toBe(base.source);
    expect(wide.repeat.x).toBe(6);
    expect(wide.repeat.y).toBe(4);
    expect(base.repeat.x).not.toBe(6);
  });

  it('hands back the base texture when the requested repeat is the default', () => {
    installFakeDocument();
    const base = surfaceTexture('sand');
    const same = surfaceTexture('sand', { repeat: [base.repeat.x, base.repeat.y] });
    expect(same).toBe(base);
  });

  it('returns null for an unknown surface name', () => {
    installFakeDocument();
    expect(surfaceTexture('marble')).toBeNull();
  });
});

describe('texture setup', () => {
  it('tiles and uses sRGB, as every colour map in this repo must', () => {
    installFakeDocument();
    for (const name of SURFACE_NAMES) {
      const tex = surfaceTexture(name);
      expect(tex.wrapS).toBe(THREE.RepeatWrapping);
      expect(tex.wrapT).toBe(THREE.RepeatWrapping);
      expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(tex.repeat.x).toBeGreaterThan(0);
      expect(tex.repeat.y).toBeGreaterThan(0);
      expect(tex.name).toBe(`surface:${name}`);
    }
  });

  it('keeps mipmaps on — the distance blur is what makes the grain subtle', () => {
    installFakeDocument();
    expect(surfaceTexture('brick').generateMipmaps).toBe(true);
  });

  it('paints a power-of-two tile', () => {
    let created = null;
    globalThis.document = {
      createElement() {
        created = { width: 0, height: 0, getContext: () => (lastCtx = recordingCtx()) };
        return created;
      },
    };
    surfaceTexture('grass');
    expect(created.width).toBe(created.height);
    expect(Math.log2(created.width) % 1).toBe(0);
  });
});

describe('determinism', () => {
  it('paints byte-identical ops on every boot (seeded, never Math.random)', () => {
    for (const name of SURFACE_NAMES) {
      __resetSurfaceTextures();
      installFakeDocument();
      surfaceTexture(name);
      const first = lastCtx.ops;
      __resetSurfaceTextures();
      surfaceTexture(name);
      const second = lastCtx.ops;
      expect(second).toEqual(first);
      expect(first.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// The invariant that actually matters
// ---------------------------------------------------------------------------
describe('the subtlety budget — composited pixels', () => {
  // This is the real assertion. It rasterizes each painter, lets clampToFloor
  // run for real, and measures the finished texels — the same thing the GPU
  // will sample. Everything else in this file is a proxy for it.
  //
  // Tolerance: the clamp targets FLOOR_LUM exactly, then rounds through a
  // Uint8ClampedArray, so a texel can land up to about 1/255 low. The assert
  // uses the brief's 0.865 rather than the module's 0.87 to absorb that,
  // which still leaves the in-tile range under 14%.
  const FLOOR_ASSERT = 0.865;

  function measure(name) {
    __resetSurfaceTextures();
    installFakeDocument(rasterCtx);
    const tex = surfaceTexture(name);
    expect(tex, name).not.toBeNull();
    const d = lastCtx.__pixels();
    let min = 1;
    let max = 0;
    let minAlpha = 1;
    for (let i = 0; i < d.length; i += 4) {
      const L = luminance(d[i], d[i + 1], d[i + 2]);
      if (L < min) min = L;
      if (L > max) max = L;
      if (d[i + 3] < minAlpha) minAlpha = d[i + 3]; // buffer alpha is 0..1
    }
    return { min, max, range: max - min, minAlpha };
  }

  it('leaves no texel below the floor, in any surface', () => {
    for (const name of SURFACE_NAMES) {
      const m = measure(name);
      expect(m.min, `${name} darkest texel ${(m.min * 255).toFixed(0)}/255`).toBeGreaterThanOrEqual(
        FLOOR_ASSERT
      );
    }
  });

  it('keeps the total in-tile value range under 14%', () => {
    for (const name of SURFACE_NAMES) {
      const m = measure(name);
      expect(m.range, `${name} range ${(m.range * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.14);
    }
  });

  it('leaves every surface fully opaque', () => {
    // A material map is sampled for RGB with its alpha ignored, so a texel
    // left translucent is a texel whose raw RGB reaches the shader unblended.
    // That is how the first cut of cobble rendered a near-black grid; the
    // clamp's flatten step is what makes it impossible now.
    for (const name of SURFACE_NAMES) {
      expect(measure(name).minAlpha, name).toBe(1);
    }
  });

  it('still has visible structure — the point is subtle, not absent', () => {
    // The mirror image of the cap. A painter (or an over-eager clamp) that
    // flattened a surface to plain white would pass every assertion above,
    // and would also make this whole module pointless.
    for (const name of SURFACE_NAMES) {
      expect(measure(name).range, name).toBeGreaterThan(0.01);
    }
  });
});

describe('clampToFloor', () => {
  // Direct unit tests, because the clamp is now where the guarantee lives and
  // it must not be reachable only through a painter.
  function ctxWith(pixels) {
    const data = new Uint8ClampedArray(pixels);
    return {
      out: data,
      getImageData: () => ({ data, width: pixels.length / 4, height: 1 }),
      putImageData: () => {},
    };
  }

  it('lifts a black texel to the floor', () => {
    const ctx = ctxWith([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(clampToFloor(ctx, 1)).toBe(true);
    expect(luminance(ctx.out[0], ctx.out[1], ctx.out[2])).toBeGreaterThanOrEqual(FLOOR_LUM - 1 / 255);
  });

  it('flattens a translucent texel onto white rather than trusting its RGB', () => {
    // The cobble bug, isolated: ink at 12% alpha over nothing. Its raw RGB is
    // near-black; what it MEANS is a light warm grey.
    const ctx = ctxWith([...__BUDGET.INK, Math.round(0.12 * 255), 255, 255, 255, 255]);
    clampToFloor(ctx, 1);
    expect(ctx.out[3]).toBe(255);
    const L = luminance(ctx.out[0], ctx.out[1], ctx.out[2]);
    expect(L).toBeGreaterThan(0.85);
    expect(L).toBeLessThan(0.92);
  });

  it('preserves relative structure when it scales', () => {
    // Three greys, ordered. After the clamp they must still be ordered and
    // still distinct — the clamp quietens a tile, it does not posterise it.
    const ctx = ctxWith([0, 0, 0, 255, 80, 80, 80, 255, 200, 200, 200, 255]);
    clampToFloor(ctx, 1);
    expect(ctx.out[0]).toBeLessThan(ctx.out[4]);
    expect(ctx.out[4]).toBeLessThan(ctx.out[8]);
  });

  it('leaves an already-compliant tile untouched', () => {
    const before = [240, 240, 240, 255, 255, 255, 255, 255];
    const ctx = ctxWith(before);
    clampToFloor(ctx, 1);
    expect([...ctx.out]).toEqual(before);
  });

  it('is a safe no-op against a context with no readback', () => {
    expect(clampToFloor({ fillRect: () => {} }, 256)).toBe(false);
    expect(clampToFloor(null, 256)).toBe(false);
  });
});

describe('painter discipline (a proxy, not the guarantee)', () => {
  // These assert what each painter ASKS FOR, one draw call at a time. They do
  // NOT prove anything about the finished pixels — overlapping strokes
  // composite, so a painter can pass every assertion here and still stack its
  // way to black. The pixel-level guarantee is the composited-pixels block
  // above plus clampToFloor; this block exists because a painter that leans
  // on the clamp gets its contrast silently scaled down and just looks washed
  // out, and this is what catches that at the point it is introduced.
  const MAX_STROKE = __BUDGET.STACK_MAX;

  function alphasOf(ops) {
    const out = [];
    const read = (style) => {
      if (style === '#ffffff') return; // the ground; a no-op by construction
      if (typeof style !== 'string') return;
      if (style.startsWith('lg(') || style.startsWith('rg(')) return; // checked via its stops
      const m = /^rgba\((\d+),(\d+),(\d+),([\d.eE+-]+)\)$/.exec(style);
      expect(m, `unexpected fill style ${style}`).not.toBeNull();
      out.push(Number(m[4]));
    };
    for (const op of ops) {
      if (op[0] === 'fillRect' || op[0] === 'fill') read(op[1]);
      if (op[0] === 'stop') read(op[2]);
    }
    return out;
  }

  it('paints white plus low-alpha ink, and nothing else', () => {
    for (const name of SURFACE_NAMES) {
      __resetSurfaceTextures();
      installFakeDocument();
      surfaceTexture(name);
      const alphas = alphasOf(lastCtx.ops);
      expect(alphas.length, name).toBeGreaterThan(0);
      for (const a of alphas) {
        expect(a, `${name} laid ink at ${a}`).toBeGreaterThanOrEqual(0);
        expect(a, `${name} laid ink at ${a}`).toBeLessThanOrEqual(MAX_STROKE);
      }
    }
  });

  it('opens every painter with an opaque white ground', () => {
    // Cheap, and it is the specific mistake that shipped a black road.
    for (const name of SURFACE_NAMES) {
      __resetSurfaceTextures();
      installFakeDocument();
      surfaceTexture(name);
      expect(lastCtx.ops[0], name).toEqual(['fillRect', '#ffffff', 0, 0, 256, 256]);
    }
  });

  it('spends most of its budget well under the cap', () => {
    for (const name of SURFACE_NAMES) {
      __resetSurfaceTextures();
      installFakeDocument();
      surfaceTexture(name);
      const alphas = alphasOf(lastCtx.ops);
      const mean = alphas.reduce((s, a) => s + a, 0) / alphas.length;
      expect(mean, `${name} mean ink ${mean}`).toBeLessThan(MAX_STROKE * 0.75);
    }
  });
});

describe('the texture namespace', () => {
  // repeatFor and tileMetres deliberately do NOT live here — they take
  // surface-PRESET names and are exported from materials.js. What this file
  // exposes is the raw per-texture tile scale they are built on, and the
  // predicate that lets materials.js accept a bare texture name.
  //
  // The split exists because of a real bug: when repeatFor lived here it was
  // keyed on texture names, so a world file asking for the preset it had in
  // hand ('wetStone') fell through to a plausible [1, 1] and rendered cobbles
  // three times too large, silently. test/materials.test.js owns the
  // assertion that every preset now resolves.
  it('reports a tile scale for every painted surface', () => {
    for (const name of SURFACE_NAMES) {
      expect(textureTileMetres(name), name).toBeGreaterThan(0);
      expect(isTextureName(name), name).toBe(true);
    }
  });

  it('answers null for a name that is not a texture', () => {
    // Including 'wetStone' and 'wood', which ARE valid surfaces — just not
    // texture names. This module is not the place to ask.
    for (const name of ['marble', 'wetStone', 'wood', 'glass']) {
      expect(textureTileMetres(name), name).toBeNull();
      expect(isTextureName(name), name).toBe(false);
    }
  });

  it('does not export a preset-vocabulary lookup at all', async () => {
    // An import of repeatFor from this module must fail loudly rather than
    // resolve to something that answers preset names wrongly.
    const mod = await import('../src/render/textures.js');
    expect(mod.repeatFor).toBeUndefined();
    expect(mod.tileMetres).toBeUndefined();
  });
});
