import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/builder.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
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

const b = await import('../src/world/builder.js');
const {
  narrowsTint, localTop, NARROWS_TINT_KEY, narrowsTuftBases, narrowsRockTris,
} = await import('../src/world/narrows.js');
const {
  ROCK_WALKS, GORGE_ROCK_KEEP, GORGE_ROCK_MOUTHS, build,
} = await import('../src/world/gorge.js');
const { MASSES, CEILINGS } = await import('../src/world/gorgeshape.js');
const { strataBand } = await import('../src/world/rockrelief.js');
const { seedFromCode } = await import('../src/rng.js');

const SEED = seedFromCode('gorge-rock');
const lum = ([r, g, bl]) => 0.2126 * r + 0.7152 * g + 0.0722 * bl;
const rgbOf = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

describe('the Narrows tint', () => {
  it('narrowsTint returns the input unchanged outside the zone and its fade', () => {
    const rgb = [0.41, 0.37, 0.33];
    expect(narrowsTint(0, 3, 0, rgb, 0)).toEqual(rgb);
    expect(narrowsTint(-30, 3, -30, rgb, 0)).toEqual(rgb);
  });

  it('the Narrows floor rock is warm, not grey', () => {
    const [r, , bl] = narrowsTint(-30, 0.5, -16, rgbOf(b.ROCK_LOW), 0);
    expect(r - bl).toBeGreaterThanOrEqual(0.08);
  });

  it('neighbouring strata differ at every band boundary', () => {
    // Walking up both walls at several x, the luminance step across each
    // band boundary (3 cm either side): every one at least 10%, the median
    // at least 15%, so neighbouring 1.1 m bands always read apart.
    const steps = [];
    const rgb = [0.55, 0.5, 0.45];
    for (let x = -22; x >= -46; x -= 4) {
      for (const z of [-16, -6]) {
        const top = localTop(x, z);
        let prev = strataBand(x, 0.2, z, SEED);
        for (let i = 21; i / 100 < top - 0.2; i++) {
          const y = i / 100;
          const band = strataBand(x, y, z, SEED);
          if (band === prev) continue;
          prev = band;
          const lo = lum(narrowsTint(x, y - 0.03, z, rgb, 0));
          const hi = lum(narrowsTint(x, y + 0.03, z, rgb, 0));
          steps.push(Math.abs(hi - lo) / Math.max(hi, lo));
        }
      }
    }
    expect(steps.length).toBeGreaterThan(50);
    steps.sort((p, q) => p - q);
    expect(steps[0]).toBeGreaterThanOrEqual(0.1);
    expect(steps[steps.length >> 1]).toBeGreaterThanOrEqual(0.15);
  });

  it('the rim is lit', () => {
    const top = localTop(-30, -16);
    expect(top).toBe(9);
    const rgb = [0.5, 0.5, 0.5];
    const rim = lum(narrowsTint(-30, top - 0.3, -16, rgb, 0));
    const below = lum(narrowsTint(-30, top - 3, -16, rgb, 0));
    expect(rim).toBeGreaterThanOrEqual(1.15 * below);
  });

  it('localTop', () => {
    expect(localTop(-30, -16)).toBe(9);
    expect(localTop(-45, -16)).toBe(20);
    expect(localTop(-10, 0)).toBe(0);
  });

  it("rockTerrain's tint changes colours only", () => {
    const args = {
      walks: ROCK_WALKS, masses: MASSES, ceilings: CEILINGS, seed: SEED, keep: GORGE_ROCK_KEEP, mouths: GORGE_ROCK_MOUTHS,
    };
    const plain = b.rockTerrain(args);
    const tinted = b.rockTerrain({ ...args, tint: narrowsTint, tintKey: NARROWS_TINT_KEY });
    const again = b.rockTerrain({ ...args, tint: narrowsTint, tintKey: NARROWS_TINT_KEY });
    const attr = (g, mesh, name) => g.getObjectByName(mesh).geometry.getAttribute(name).array;
    let differ = 0;
    for (const mesh of ['rockFaces', 'lips']) {
      expect(attr(tinted, mesh, 'position')).toEqual(attr(plain, mesh, 'position'));
      const a = attr(plain, mesh, 'color');
      const t = attr(tinted, mesh, 'color');
      expect(t.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) if (a[i] !== t[i]) differ++;
      expect(attr(again, mesh, 'color')).toEqual(t);
    }
    expect(differ).toBeGreaterThan(0);
    expect(attr(tinted, 'ledgeTops', 'position')).toEqual(attr(plain, 'ledgeTops', 'position'));
  }, 120_000);
});

// The dressing: tufts on the Narrows' shelves and crests, shrubs on the
// crests, and the low Moor seen out of the corridor's west end.
describe('the Narrows dressing', () => {
  let built = null;
  const scene = () => {
    if (!built) {
      built = new THREE.Scene();
      build(built);
    }
    return built;
  };
  const dressing = () => scene().getObjectByName('narrowsDressing');

  it('the Narrows dressing is one shadowless mesh, under 1,300 triangles', () => {
    const m = dressing();
    expect(m?.isMesh).toBe(true);
    expect(scene().children.filter((o) => o.name === 'narrowsDressing')).toHaveLength(1);
    expect(m.children).toHaveLength(0);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    expect(m.userData.ground).toBeFalsy();
    expect(m.geometry.index).toBeNull();
    const tris = m.geometry.getAttribute('position').count / 3;
    expect(tris).toBeLessThanOrEqual(1300);
    expect(m.userData.counts.shelfTufts).toBeGreaterThanOrEqual(15);
    expect(m.userData.counts.crestTufts).toBeGreaterThanOrEqual(15);
    expect(m.userData.counts.shrubs).toBeGreaterThan(0);
  }, 120_000);

  it('nothing of it stands on the walk', () => {
    const p = dressing().geometry.getAttribute('position').array;
    let low = 0;
    for (let i = 0; i < p.length; i += 3) if (p[i] > -50 && p[i + 1] < 1.2) low++;
    expect(low).toBe(0);
  }, 120_000);

  it('the view out lies outside the map', () => {
    const m = dressing();
    const p = m.geometry.getAttribute('position').array;
    const n = m.userData.counts.viewTris * 9;
    expect(n).toBeGreaterThan(0);
    let inside = 0;
    for (let i = p.length - n; i < p.length; i += 3) if (p[i] > -58) inside++;
    expect(inside).toBe(0);
    // The sheet (its first 12 x 12 x 2 triangles) starts under the ground
    // plane's edge (x -60) and never dips to the horizon band's floor (-0.03),
    // so no pale strip of band shows where the Gorge's ground ends.
    let under = 0, past = 0;
    for (let i = p.length - n; i < p.length - n + 288 * 9; i += 3) {
      if (p[i + 1] < -0.02) under++;
      if (p[i] > -60) past++;
    }
    expect(under).toBe(0);
    expect(past).toBeGreaterThan(0);
  }, 120_000);

  it('every tuft sits on the rock', () => {
    const tris = narrowsRockTris(scene().getObjectByName('rockFaces'));
    const bases = narrowsTuftBases();
    const m = dressing();
    const c = m.userData.counts;
    expect(bases).toHaveLength(c.shelfTufts + c.crestTufts + c.shrubs);
    const a = new THREE.Vector3(), bb = new THREE.Vector3(), cc = new THREE.Vector3(), hit = new THREE.Vector3();
    const ray = new THREE.Ray();
    let off = 0;
    for (const t of bases) {
      // Straight down, and down toward the nearer wall (a shelf's own ray).
      const toWall = Math.abs(t.z + 16) < Math.abs(t.z + 6) ? -1 : 1;
      let best = Infinity;
      for (const dir of [[0, -1, 0], [0, -0.6, 0.8 * toWall]]) {
        ray.origin.set(t.x, t.y + 0.05, t.z);
        ray.direction.set(...dir).normalize();
        for (let i = 0; i < tris.length; i += 9) {
          a.fromArray(tris, i); bb.fromArray(tris, i + 3); cc.fromArray(tris, i + 6);
          if (ray.intersectTriangle(a, bb, cc, true, hit)) best = Math.min(best, hit.distanceTo(ray.origin));
        }
      }
      if (!(best <= 0.1)) off++;
    }
    expect(off).toBe(0);
  }, 120_000);

  it('the horizon dips at the end of the Narrows', () => {
    const p = scene().getObjectByName('horizonBand').geometry.getAttribute('position').array;
    const maxNear = (x0, z0) => {
      let m = -Infinity;
      for (let i = 0; i < p.length; i += 3) if (Math.hypot(p[i] - x0, p[i + 2] - z0) <= 6) m = Math.max(m, p[i + 1]);
      return m;
    };
    expect(maxNear(-90, -11)).toBeLessThanOrEqual(0.5);
    expect(maxNear(-90, -40)).toBeGreaterThanOrEqual(5);
  }, 120_000);

  it('two builds give the same dressing', () => {
    const again = new THREE.Scene();
    build(again);
    const p1 = dressing().geometry.getAttribute('position').array;
    const p2 = again.getObjectByName('narrowsDressing').geometry.getAttribute('position').array;
    expect(p2).not.toBe(p1); // a fresh geometry each build (walk.js disposes it)
    expect(Array.from(p2)).toEqual(Array.from(p1));
  }, 120_000);
});
