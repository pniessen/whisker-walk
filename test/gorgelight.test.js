import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// polish-gorgelight: the Gorge's own clear-day grade (rain, sunset and dusk
// keep their looks), and its colour-only leftovers: tors with lichen, warm
// lip stones and scree, tunnels from the canyon's brown into the chamber.

vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'measureText') return () => ({ width: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const gorge = await import('../src/world/gorge.js');
const { createWeather, clearDaySky } = await import('../src/weather.js');
const { applySky } = await import('../src/world/builder.js');
const { TUNNEL_LOOK, LINER_COLORS } = await import('../src/world/caveroom.js');
const { GORGE_DAY_LOOK, GORGE_SKY, GORGE_FOG } = gorge;

const hilly = { flat: false, y: () => 0 };
const sun = () => ({ color: new THREE.Color(0xfff2d8), intensity: 3, position: new THREE.Vector3(-36, 15, -24) });
// The scene as the Gorge's build leaves its sky: applySky, its own fog, its day look.
function gorgeSky() {
  const s = new THREE.Scene();
  applySky(s, GORGE_SKY.top, GORGE_SKY.horizon);
  s.fog.near = GORGE_FOG.near;
  s.fog.far = GORGE_FOG.far;
  s.userData.dayLook = GORGE_DAY_LOOK;
  s.environmentIntensity = 0.45;
  return s;
}
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('the Gorge clear day (polish-gorgelight)', () => {
  it('the build hands weather its own frozen day look', () => {
    const s = new THREE.Scene();
    gorge.build(s);
    expect(s.userData.dayLook).toBe(GORGE_DAY_LOOK);
    expect(Object.isFrozen(GORGE_DAY_LOOK)).toBe(true);
    // the authored entry state is unchanged
    expect([s.fog.color.getHex(), s.fog.near, s.fog.far]).toEqual([new THREE.Color(GORGE_SKY.horizon).getHex(), 60, 175]);
  }, 120_000);

  it('a clear Gorge walk takes the grade: farther, darker, bluer haze, less flat light', () => {
    const s = gorgeSky();
    const fill = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    const w = createWeather(s, sun(), 'clear', () => 0, true, hilly, { fill });
    const g = clearDaySky(GORGE_SKY.top, GORGE_SKY.horizon, GORGE_DAY_LOOK);
    expect(g.k).toBeGreaterThan(0.9);
    expect(s.fog.color.getHex()).toBe(new THREE.Color(g.horizon).getHex());
    expect([s.fog.near, s.fog.far]).toEqual([GORGE_DAY_LOOK.fogNear, GORGE_DAY_LOOK.fogFar]);
    expect(s.fog.near).toBeGreaterThan(GORGE_FOG.near);
    expect(s.fog.far).toBeGreaterThan(GORGE_FOG.far);
    const before = new THREE.Color(GORGE_SKY.horizon), after = new THREE.Color(g.horizon);
    expect(lum(after)).toBeLessThan(lum(before));
    expect(after.b / after.r).toBeGreaterThan(before.b / before.r);
    // still a warm haze, not the sky's blue
    expect(after.r).toBeGreaterThan(after.b);
    expect(fill.intensity).toBeCloseTo(GORGE_DAY_LOOK.hemiScale, 6);
    expect(s.environmentIntensity).toBeCloseTo(0.45 * GORGE_DAY_LOOK.envScale, 6);
    expect(w.exposureScale).toBe(GORGE_DAY_LOOK.exposure);
    expect(GORGE_DAY_LOOK.exposure).toBeGreaterThan(0.85);
    w.dispose();
    expect(fill.intensity).toBe(1);
    expect(s.environmentIntensity).toBe(0.45);
  });

  it('rain and sunset in the Gorge are exactly what they were', () => {
    for (const condition of ['rain', 'sunset']) {
      const s = gorgeSky();
      const ref = gorgeSky();
      delete ref.userData.dayLook; // the Gorge before this build
      const fa = new THREE.HemisphereLight(0xffffff, 0x444444, 1), fb = fa.clone();
      const a = createWeather(s, sun(), condition, () => 0, true, hilly, { fill: fa });
      const r = createWeather(ref, sun(), condition, () => 0, true, hilly, { fill: fb });
      expect([s.fog.color.getHex(), s.fog.near, s.fog.far]).toEqual([ref.fog.color.getHex(), ref.fog.near, ref.fog.far]);
      expect(fa.intensity).toBe(fb.intensity);
      expect(s.environmentIntensity).toBe(ref.environmentIntensity);
      expect(a.exposureScale).toBeUndefined();
      expect(r.exposureScale).toBeUndefined();
    }
  });
});

describe('the Gorge leftovers, colour only (polish-gorgelight)', () => {
  const scene = new THREE.Scene();
  gorge.build(scene);

  it('tors are grey stone with lichen spots and a darker foot', () => {
    const tors = scene.getObjectByName('tors');
    expect(tors.children.length).toBeGreaterThan(0);
    let lichen = 0, all = 0;
    const base = new THREE.Color(gorge.GORGE_TOR_COLOR), lc = new THREE.Color(gorge.TOR_LICHEN.color);
    for (const t of tors.children) {
      expect(t.material.vertexColors).toBe(true);
      const c = t.geometry.getAttribute('color');
      expect(c.count).toBe(t.geometry.getAttribute('position').count);
      for (let i = 0; i < c.count; i++) {
        all++;
        const v = new THREE.Color(c.getX(i), c.getY(i), c.getZ(i));
        if (Math.abs(v.r - lc.r) + Math.abs(v.g - lc.g) + Math.abs(v.b - lc.b) < Math.abs(v.r - base.r) + Math.abs(v.g - base.g) + Math.abs(v.b - base.b)) lichen++;
      }
    }
    // spots, not a coat
    expect(lichen / all).toBeGreaterThan(0.03);
    expect(lichen / all).toBeLessThan(0.4);
    // greyer than the old cream: low saturation
    const hsl = {};
    base.getHSL(hsl, THREE.SRGBColorSpace);
    expect(hsl.s).toBeLessThan(0.1);
  }, 120_000);

  it('warmStones warms grey and leaves warm colours nearly alone', () => {
    const geo = new THREE.BufferGeometry();
    const grey = new THREE.Color(0x857f76), warm = new THREE.Color(0xa0603a);
    geo.setAttribute('color', new THREE.Float32BufferAttribute([grey.r, grey.g, grey.b, warm.r, warm.g, warm.b], 3));
    gorge.warmStones(geo);
    const c = geo.getAttribute('color');
    expect(c.getX(0) / c.getZ(0)).toBeGreaterThan((grey.r / grey.b) * 1.15);
    expect(Math.abs(c.getX(1) - warm.r)).toBeLessThan(0.01);
    expect(gorge.warmStones(new THREE.BufferGeometry())).toBeTruthy(); // no colours: left alone
  });

  it('the tunnels start in the canyon brown and end in the chamber colour, darker between', () => {
    for (const id of ['echo', 'snug', 'glitter']) {
      const t = gorge.caveTunnelFor(id, { glow: false });
      const col = t.geometry.getAttribute('color');
      const S = t.stations[t.stations.length - 1].s;
      const mean = (pick) => {
        const m = [0, 0, 0];
        let n = 0;
        for (const st of t.stations.filter(pick)) for (const i of st.ids) { m[0] += col.getX(i); m[1] += col.getY(i); m[2] += col.getZ(i); n++; }
        return new THREE.Color(m[0] / n, m[1] / n, m[2] / n);
      };
      const mouth = mean((st) => st.s < 0.5), mid = mean((st) => Math.abs(st.s / S - TUNNEL_LOOK.deep) < 0.1), end = mean((st) => st.s > S - 0.4);
      // warm at the mouth: red over blue
      expect(mouth.r / mouth.b, id).toBeGreaterThan(1.25);
      // darker on the way in than at either end
      expect(lum(mid), id).toBeLessThan(lum(mouth));
      expect(lum(mid), id).toBeLessThan(lum(end));
      // the far end in the chamber's own hue
      const ch = new THREE.Color(LINER_COLORS[id]);
      expect(Math.abs(end.r / end.b - ch.r / ch.b), id).toBeLessThan(0.15);
    }
  }, 120_000);

  it('the Echo Cave liner is no longer blue-grey', () => {
    const c = new THREE.Color(LINER_COLORS.echo);
    expect(c.r).toBeGreaterThanOrEqual(c.b);
  });
});
