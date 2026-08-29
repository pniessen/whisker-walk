import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  surfaceTexture,
  surfaceMaps,
  deriveNormalPixels,
  setTextureTier,
  getTextureTier,
  getNormalMapsEnabled,
  clampToFloor,
  textureTileMetres as tileMetresOf,
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
    // Wave 5.1. The normal derivation writes its packed bytes through
    // createImageData + putImageData rather than through any drawing call, so
    // a fake canvas has to offer this much for that path to run at all. Real
    // ImageData is zero-filled and opaque only where written; this matches.
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
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
    expect(tileMetresOf('brick')).toBeGreaterThan(0);
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
    let sum = 0;
    let touched = 0;
    const vals = new Float64Array(d.length / 4);
    for (let i = 0; i < d.length; i += 4) {
      const L = luminance(d[i], d[i + 1], d[i + 2]);
      if (L < min) min = L;
      if (L > max) max = L;
      if (d[i + 3] < minAlpha) minAlpha = d[i + 3]; // buffer alpha is 0..1
      if (L < 0.999) touched++;
      vals[i / 4] = L;
      sum += L;
    }
    const mean = sum / vals.length;
    let sq = 0;
    for (const v of vals) sq += (v - mean) * (v - mean);
    // Sigma in 8-bit steps: the honest answer to "will anyone see this".
    const sigma = Math.sqrt(sq / vals.length) * 255;
    return { min, max, range: max - min, minAlpha, mean, sigma, coverage: touched / vals.length, vals };
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

  it('is actually visible — every surface clears one 8-bit value step', () => {
    // THE REGRESSION TEST FOR SAND. Sand shipped at sigma 0.5/255 — under a
    // single value step — because its mean was pinned at 0.998 to avoid
    // looking "wet". A colour map multiplies, so it can only darken; asking
    // for variance with no mean shift asks for something the pipeline cannot
    // give, and the result was a ~350KB tile that rendered as nothing on
    // three separate areas. Range and floor assertions both passed
    // throughout: a cap says nothing about whether there is anything to cap.
    //
    // 1.5 is set below grass (2.4), which is the softest surface that is
    // legitimately meant to be barely-there, and far above the 0.5 that was
    // measured as invisible on the real renderer.
    for (const name of SURFACE_NAMES) {
      const m = measure(name);
      expect(m.sigma, `${name} sigma ${m.sigma.toFixed(2)}/255`).toBeGreaterThan(1.5);
    }
  });

  it('keeps every mean in one neighbourhood, so no surface is an outlier', () => {
    // The other half of the same lesson. Sand was held to a standard nothing
    // else was held to, which is how it ended up invisible while passing.
    for (const name of SURFACE_NAMES) {
      const m = measure(name);
      expect(m.mean, `${name} mean ${m.mean.toFixed(4)}`).toBeGreaterThan(0.93);
      expect(m.mean, `${name} mean ${m.mean.toFixed(4)}`).toBeLessThan(0.99);
    }
  });

  it('makes gravel coarser and higher-contrast than sand, as designed', () => {
    // Gravel exists because two areas were borrowing sand for roads and
    // inheriting the wrong SCALE. If it is not measurably coarser than the
    // tile it replaced, it has no reason to exist — and the first cut of
    // paintGravel was in fact FLATTER than sand (sigma 5.64 vs 6.15), because
    // it spent its budget on smooth octaves instead of on chips.
    const g = measure('gravel');
    const s = measure('sand');
    expect(g.sigma).toBeGreaterThan(s.sigma);
    // …and coarser in world terms, not just in texels.
    expect(tileMetresOf('gravel')).toBeGreaterThan(tileMetresOf('sand'));
  });

  it('merges overlapping gravel chips instead of stacking them', () => {
    // chipField uses max(), not source-over. With ~1200 chips at ~40%
    // coverage, overlaps are constant rather than a rare tail, and stacking
    // two 0.095 chips would blow straight through STACK_MAX. The floor
    // assertion above would catch the consequence; this pins the cause, so a
    // future edit that swaps max() for a composite is named rather than just
    // failing somewhere else.
    const m = measure('gravel');
    // The darkest texel is the full three-layer stack and no more:
    // 1 - (1-0.095)(1-0.015)(1-0.035) = 0.140 of ink over white.
    const deepest = (1 - m.min) / 0.863; // back out the composited alpha
    expect(deepest).toBeLessThanOrEqual(__BUDGET.STACK_MAX + 0.005);
  });

  it('gives sand dense grain rather than sparse dots', () => {
    // The scattered version touched ~2-4% of texels. Grain has to be dense
    // and fine to read as a granular material at cat height.
    const m = measure('sand');
    expect(m.coverage).toBeGreaterThan(0.8);
  });

  it('paints identical pixels on every boot, including the ImageData pass', () => {
    // The recording-ctx determinism test cannot see grainPass, because that
    // fake has no readback. This one can.
    const a = measure('sand').vals;
    const b = measure('sand').vals;
    expect(Array.from(a)).toEqual(Array.from(b));
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

  // sand and gravel lay no ink through the 2D context at all: every layer
  // they have is a per-texel ImageData pass (grainPass, and gravel's
  // chipField), which the recording ctx cannot see. Their budgets are
  // enforced entirely by the composited-pixels block above — which is the
  // stronger assertion anyway, and the reason it exists.
  const PIXEL_PAINTERS = ['sand', 'gravel'];
  const STROKE_PAINTERS = SURFACE_NAMES.filter((n) => !PIXEL_PAINTERS.includes(n));

  it('paints white plus low-alpha ink, and nothing else', () => {
    for (const name of STROKE_PAINTERS) {
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
    for (const name of STROKE_PAINTERS) {
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
      expect(tileMetresOf(name), name).toBeGreaterThan(0);
      expect(isTextureName(name), name).toBe(true);
    }
  });

  it('answers null for a name that is not a texture', () => {
    // Including 'wetStone' and 'wood', which ARE valid surfaces — just not
    // texture names. This module is not the place to ask.
    for (const name of ['marble', 'wetStone', 'wood', 'glass']) {
      expect(tileMetresOf(name), name).toBeNull();
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

// ===========================================================================
// Wave 5.1 — derived normal maps
// ===========================================================================
// The derivation is exported as a pure function, and almost everything worth
// asserting about it is asserted here rather than through a canvas. That is
// not laziness about integration: the one property most likely to be subtly
// wrong — the seam wrap — is invisible in the middle of a tile and invisible
// in a screenshot of one tile, and only shows up as 200 hard lines ruled
// across a 100x100-tile ground plane. A pure function can be asked directly.

// A greyscale height field as RGBA, so a test can state a shape instead of a
// texture. `f(x, y)` returns 0..1 luminance.
function heightRGBA(S, f) {
  const d = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = Math.round(Math.max(0, Math.min(1, f(x, y))) * 255);
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  return d;
}

// Torus shift: what "the tile repeats" means, expressed as an operation.
function roll(rgba, S, dx, dy) {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const src = ((((y - dy) % S + S) % S) * S + (((x - dx) % S + S) % S)) * 4;
      const dst = (y * S + x) * 4;
      for (let c = 0; c < 4; c++) out[dst + c] = rgba[src + c];
    }
  }
  return out;
}

const unpack = (d, S, x, y) => {
  const i = (y * S + x) * 4;
  return {
    x: (d[i] / 255) * 2 - 1,
    y: (d[i + 1] / 255) * 2 - 1,
    z: (d[i + 2] / 255) * 2 - 1,
    a: d[i + 3],
  };
};
const tiltOf = (n) => Math.atan2(Math.hypot(n.x, n.y), n.z);

describe('deriveNormalPixels — packing', () => {
  const S = 16;

  it('encodes a flat height field as flat normals', () => {
    const d = deriveNormalPixels(heightRGBA(S, () => 0.93), S);
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i]).toBe(128);      // 0.5 rounds up through Uint8Clamped
      expect(d[i + 1]).toBe(128);
      expect(d[i + 2]).toBe(255);
      expect(d[i + 3]).toBe(255);
    }
  });

  it('leaves every texel opaque and every normal pointing out of the surface', () => {
    // z < 0 would be a normal pointing INTO the surface, which the shader
    // will happily use and which reads as a black hole.
    const d = deriveNormalPixels(heightRGBA(S, (x, y) => 0.87 + 0.13 * ((x * 7 + y * 13) % 5) / 4), S);
    for (let x = 0; x < S; x++) {
      for (let y = 0; y < S; y++) {
        const n = unpack(d, S, x, y);
        expect(n.a).toBe(255);
        expect(n.z).toBeGreaterThan(0);
      }
    }
  });

  it('never encodes a face steeper than MAX_SLOPE, whatever it is fed', () => {
    // A full black/white checker is far outside anything a painter can lay —
    // the point is that the clamp is a guarantee and not an average.
    const d = deriveNormalPixels(heightRGBA(S, (x, y) => ((x + y) % 2 ? 0 : 1)), S);
    const limit = Math.atan(__BUDGET.MAX_SLOPE) + 1e-6;
    for (let x = 0; x < S; x++) {
      for (let y = 0; y < S; y++) {
        expect(tiltOf(unpack(d, S, x, y))).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('turns the budget’s deepest legal mark into the face the gain promises', () => {
    // NORMAL_GAIN's whole job is to make one sentence true: the deepest mark
    // STACK_MAX allows becomes a ~26-degree face at normalScale 1. A clean
    // one-texel cliff of that depth is the test of it.
    const drop = 0.863 * __BUDGET.STACK_MAX;      // ink over white, in luminance
    const d = deriveNormalPixels(heightRGBA(S, (x) => (x < S / 2 ? 1 : 1 - drop)), S);
    let steepest = 0;
    for (let x = 0; x < S; x++) steepest = Math.max(steepest, tiltOf(unpack(d, S, x, 3)));
    expect(steepest * 180 / Math.PI).toBeGreaterThan(24);
    expect(steepest * 180 / Math.PI).toBeLessThan(28);
  });

  it('points the normal away from the descending side, on both axes', () => {
    // The sign convention, stated as behaviour rather than as arithmetic.
    // Darker is lower, so a field that darkens to the RIGHT slopes down to the
    // right and its normal must lean LEFT-to-right positive in x (+red); one
    // that darkens DOWN THE CANVAS must come out negative in y (-green),
    // because a CanvasTexture's flipY makes texture v run up the canvas.
    const rightDark = deriveNormalPixels(heightRGBA(S, (x) => 1 - 0.1 * x / S), S);
    const downDark = deriveNormalPixels(heightRGBA(S, (x, y) => 1 - 0.1 * y / S), S);
    const a = unpack(rightDark, S, 8, 8);
    const b = unpack(downDark, S, 8, 8);
    expect(a.x).toBeGreaterThan(0.01);
    expect(Math.abs(a.y)).toBeLessThan(1e-2);
    expect(b.y).toBeLessThan(-0.01);
    expect(Math.abs(b.x)).toBeLessThan(1e-2);
  });
});

describe('deriveNormalPixels — the seam', () => {
  // THE property. A tile whose gradient is computed with clamped or zeroed
  // edges looks perfect on its own and rules a hard line down every tile
  // boundary once it is repeated — which on the Docks' 120m ground at 100x100
  // tiles is 200 lines across the road, worse than shipping no relief at all.
  const S = 32;
  // Deterministic pseudo-noise with real content hard against all four edges.
  const noisy = heightRGBA(S, (x, y) => 0.87 + 0.13 * (((x * 71 + y * 131) ^ (x * 17)) % 251) / 250);

  it('is translation-equivariant, which is what "seamless" means', () => {
    // derive(roll(H)) === roll(derive(H)) for every shift. Nothing about a
    // texel's position can matter if the tile is to wrap, and a shift-by-one
    // moves every texel across the seam in turn, so this single property
    // covers all four edges and both corners at once.
    const base = deriveNormalPixels(noisy, S);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [7, 13], [S - 1, S - 1]]) {
      const shifted = deriveNormalPixels(roll(noisy, S, dx, dy), S);
      expect(Array.from(shifted), `shift ${dx},${dy}`).toEqual(Array.from(roll(base, S, dx, dy)));
    }
  });

  it('reads the far edge as the near neighbour it will actually be', () => {
    // The direct statement of the same thing, and the one that fails loudly
    // for the specific bug: a lone dark column at x=0 must tilt the normals in
    // column S-1 (its left neighbour once the tile repeats) just as strongly
    // as those in column 1. Clamped edges leave column S-1 dead flat.
    const stripe = heightRGBA(S, (x) => (x === 0 ? 0.87 : 1));
    const d = deriveNormalPixels(stripe, S);
    const left = unpack(d, S, S - 1, 5);
    const right = unpack(d, S, 1, 5);
    expect(Math.abs(left.x)).toBeGreaterThan(0.05);          // not flat
    expect(left.x).toBeCloseTo(-right.x, 6);                 // and exactly mirrored
    // A row is uniform, so nothing may tilt vertically anywhere. Asserted on
    // the raw byte, because the encoded "no tilt" is 128 — which unpacks to
    // 1/255, not to 0.
    for (let x = 0; x < S; x++) expect(d[(5 * S + x) * 4 + 1], `x=${x}`).toBe(128);
  });

  it('wraps top-to-bottom as well, not only left-to-right', () => {
    // The asymmetric mistake: wrapping x (which the inner loop makes obvious)
    // and clamping y (which the row-index arithmetic makes easy to forget).
    const stripe = heightRGBA(S, (_x, y) => (y === 0 ? 0.87 : 1));
    const d = deriveNormalPixels(stripe, S);
    expect(Math.abs(unpack(d, S, 5, S - 1).y)).toBeGreaterThan(0.05);
    expect(unpack(d, S, 5, S - 1).y).toBeCloseTo(-unpack(d, S, 5, 1).y, 6);
  });
});

describe('normal maps — the texture', () => {
  // A document whose canvases really composite, so the whole chain runs:
  // paint -> clamp -> readback -> derive -> putImageData -> CanvasTexture.
  // Returns the contexts in creation order; [0] is a surface's colour tile and
  // [1] is its normal tile.
  function installRasterDocument() {
    const ctxs = [];
    globalThis.document = {
      createElement() {
        return {
          width: 0,
          height: 0,
          getContext() {
            lastCtx = rasterCtx(this.width || 256);
            ctxs.push(lastCtx);
            return lastCtx;
          },
        };
      },
    };
    return ctxs;
  }

  it('returns a matched pair, and both tile', () => {
    installRasterDocument();
    const { map, normalMap } = surfaceMaps('brick');
    expect(map).toBeInstanceOf(THREE.CanvasTexture);
    expect(normalMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(normalMap.wrapS).toBe(THREE.RepeatWrapping);
    expect(normalMap.wrapT).toBe(THREE.RepeatWrapping);
    expect(normalMap.generateMipmaps).toBe(true);
    expect(normalMap.name).toBe('surface:brick:normal');
    // The `surface:` prefix is what endWalk's teardown keys its skip on, and
    // these are app-lifetime textures like the colour tiles.
    expect(normalMap.name.startsWith('surface:')).toBe(true);
  });

  it('is NOT sRGB — a normal map is data, not colour', () => {
    // The silent one. An sRGB-tagged normal map gets de-gammaed before
    // unpacking, which pulls every channel toward zero and tilts the whole
    // surface uniformly; it reads as a lighting bias, not as a broken map.
    installRasterDocument();
    const { map, normalMap } = surfaceMaps('cobble');
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(normalMap.colorSpace).toBe(THREE.NoColorSpace);
  });

  it('cannot disagree with its colour map about repeat', () => {
    // The structural guarantee. There is no argument for the normal's repeat
    // to get wrong: it is read off the colour texture that was actually
    // resolved. Two maps at different densities do not fail, they SLIDE.
    installRasterDocument();
    for (const repeat of [undefined, [6, 4], [2, 2], [100, 100]]) {
      const { map, normalMap } = surfaceMaps('cobble', repeat ? { repeat } : undefined);
      expect(normalMap.repeat.x, String(repeat)).toBe(map.repeat.x);
      expect(normalMap.repeat.y, String(repeat)).toBe(map.repeat.y);
    }
  });

  it('memoises the master and shares one Source across every density', () => {
    installRasterDocument();
    const a = surfaceMaps('gravel');
    const b = surfaceMaps('gravel');
    expect(b.normalMap).toBe(a.normalMap);
    const wide = surfaceMaps('gravel', { repeat: [9, 5] });
    expect(wide.normalMap).not.toBe(a.normalMap);
    expect(surfaceMaps('gravel', { repeat: [9, 5] }).normalMap).toBe(wide.normalMap);
    // One texture in VRAM for every density, exactly as the colour variants.
    expect(wide.normalMap.source).toBe(a.normalMap.source);
  });

  it('derives each surface exactly once, from the finished colour tile', () => {
    const ctxs = installRasterDocument();
    surfaceMaps('plank');
    expect(ctxs.length).toBe(2);                 // one colour canvas, one normal canvas
    surfaceMaps('plank');
    surfaceMaps('plank', { repeat: [8, 8] });
    expect(ctxs.length).toBe(2);                 // and never a third
  });

  it('really derives from the tile — a flat normal map would be a silent no-op', () => {
    const ctxs = installRasterDocument();
    surfaceMaps('cobble');
    const d = ctxs[1].__pixels();
    let tilted = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 128) > 2 || Math.abs(d[i + 1] - 128) > 2) tilted++;
    expect(tilted).toBeGreaterThan(0.02 * (d.length / 4));
  });

  it('gives every derived tile back with no seam, on the real painters', () => {
    // The unit tests above prove the operator wraps. This proves the operator
    // is what the surfaces actually get, on the tile they actually ship.
    for (const name of SURFACE_NAMES) {
      __resetSurfaceTextures();
      const ctxs = installRasterDocument();
      surfaceMaps(name);
      const colour = ctxs[0].__pixels();
      const S = 256;
      const src = new Uint8ClampedArray(S * S * 4);
      for (let i = 0; i < src.length; i++) src[i] = Math.round(colour[i]);
      const direct = deriveNormalPixels(src, S);
      const shifted = deriveNormalPixels(roll(src, S, 1, 1), S);
      expect(Array.from(shifted), name).toEqual(Array.from(roll(direct, S, 1, 1)));
    }
  });

  it('builds nothing at all when the tier says no normal maps', () => {
    const ctxs = installRasterDocument();
    setTextureTier({ name: 'high', normalMaps: false });
    expect(getNormalMapsEnabled()).toBe(false);
    const { map, normalMap } = surfaceMaps('brick');
    expect(map).not.toBeNull();       // colour tiles are a separate decision
    expect(normalMap).toBeNull();
    expect(ctxs.length).toBe(1);      // the second canvas was never asked for
  });

  it('gives the low tier neither channel', () => {
    installRasterDocument();
    setTextureTier({ name: 'low', normalMaps: false });
    expect(surfaceMaps('brick')).toEqual({ map: null, normalMap: null });
  });

  it('takes normalMaps from a resolveQuality tier and defaults it from a bare name', () => {
    // A bare string carries no flag, so it must fall back to what the named
    // tier means — otherwise every harness and test that already says
    // setTextureTier('high') would silently lose the channel.
    setTextureTier('high');
    expect(getNormalMapsEnabled()).toBe(true);
    setTextureTier('low');
    expect(getNormalMapsEnabled()).toBe(false);
    setTextureTier({ name: 'high', normalMaps: false });
    expect(getNormalMapsEnabled()).toBe(false);
    setTextureTier({ name: 'high', normalMaps: true });
    expect(getNormalMapsEnabled()).toBe(true);
    // An unrecognised tier leaves both halves alone, as it always has.
    setTextureTier('ultra');
    expect(getTextureTier()).toBe('high');
    expect(getNormalMapsEnabled()).toBe(true);
  });

  it('answers the null cases the same way the colour path does', () => {
    expect(typeof document).toBe('undefined');
    expect(surfaceMaps('brick')).toEqual({ map: null, normalMap: null });
    installRasterDocument();
    expect(surfaceMaps('marble')).toEqual({ map: null, normalMap: null });
  });

  it('degrades to colour-only against a context with no readback', () => {
    // Six world test files use a blanket stub as their canvas. It answers
    // `typeof ctx.getImageData === 'function'` and then returns undefined —
    // the same trap clampToFloor guards against — so the normal path must
    // fail to null rather than throw.
    installFakeDocument();                       // the recording ctx: no readback at all
    const { map, normalMap } = surfaceMaps('brick');
    expect(map).not.toBeNull();
    expect(normalMap).toBeNull();
  });

  it('is reset by __resetSurfaceTextures, both channels and both flags', () => {
    installRasterDocument();
    const first = surfaceMaps('sand');
    setTextureTier({ name: 'high', normalMaps: false });
    __resetSurfaceTextures();
    expect(getTextureTier()).toBe('high');
    expect(getNormalMapsEnabled()).toBe(true);
    installRasterDocument();
    expect(surfaceMaps('sand').normalMap).not.toBe(first.normalMap);
  });
});
