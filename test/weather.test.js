import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Headless canvas stub, same one test/builder.test.js and test/sky.test.js
// use — createWeather now routes its background swaps through
// render/sky.js's skyBackground(), which needs a `document` to paint a real
// gradient onto. Stubbed once, for the whole file: the rollWeather/
// createRainSchedule tests below never touch it.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'createLinearGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { rollWeather, createRainSchedule, createWeather, rainDropCount, RAIN_LOOK } = await import('../src/weather.js');
const { mulberry32 } = await import('../src/rng.js');
const { skyBackground } = await import('../src/render/sky.js');

describe('rollWeather', () => {
  it('maps rng ranges to conditions 50/30/20', () => {
    expect(rollWeather(() => 0.1)).toBe('clear');
    expect(rollWeather(() => 0.49)).toBe('clear');
    expect(rollWeather(() => 0.55)).toBe('rain');
    expect(rollWeather(() => 0.79)).toBe('rain');
    expect(rollWeather(() => 0.85)).toBe('sunset');
  });
});

describe('createRainSchedule', () => {
  it('spans 60-120s of rain then a 30s rainbow window', () => {
    const early = createRainSchedule(() => 0);
    expect(early.stopAt).toBe(60);
    expect(early.rainbowUntil).toBe(90);
    const late = createRainSchedule(() => 1);
    expect(late.stopAt).toBe(120);
    expect(late.rainbowUntil).toBe(150);
  });

  it('phases correctly over time', () => {
    const s = createRainSchedule(() => 0);
    expect(s.phase(10)).toBe('rain');
    expect(s.phase(61)).toBe('rainbow');
    expect(s.phase(95)).toBe('after');
  });
});

// createWeather's rain path saves scene.background before overwriting it and
// restores it once the rainbow phase starts (line ~110 of weather.js). Since
// applySky/skyBackground now hand back a CanvasTexture instead of a flat
// THREE.Color, the save/restore has to get BOTH representations right — see
// the big comment in weather.js immediately above `const prevBackground =`
// for why a Texture and a Color cannot use the same save strategy.
describe('createWeather — rain background save/restore', () => {
  function fakeScene(background) {
    return {
      background,
      fog: new THREE.Fog(0x123456, 40, 130),
      add: () => {},
    };
  }
  // The real argument is always the walk's THREE.DirectionalLight, so the
  // stub carries a `position` too: the rainbow phase derives its anti-solar
  // placement from it (see weather.js), and these tests run past stopAt into
  // that phase to trigger the background restore they are actually about.
  // The value is walk.js's own SUN_POSITION, so a stub that drifts from the
  // shipped sun is at least drifting from something real.
  function fakeSun() {
    return {
      color: new THREE.Color(),
      intensity: 2.2,
      position: new THREE.Vector3(-36, 15, -24),
    };
  }
  // rng: () => 0 gives createRainSchedule a stopAt of exactly 60s, so one
  // update() call past that lands squarely in the 'rainbow' phase and fires
  // the restore on its very first invocation.
  const rng = () => 0;
  const cam = () => new THREE.Vector3(0, 0, 0);

  it('round-trips a flat Color background byte for byte', () => {
    const original = new THREE.Color(0x445566);
    const scene = fakeScene(original);
    const weather = createWeather(scene, fakeSun(), 'rain', rng, /* reducedMotion */ true);
    // Swapped to rain's own grey for the duration of the rain phase.
    expect(scene.background).not.toBe(original);
    weather.update(61, cam());
    expect(scene.background).not.toBe(original); // clone, not the same instance...
    expect(scene.background.isColor).toBe(true);
    expect(scene.background.getHex()).toBe(original.getHex()); // ...but the same value
  });

  it('round-trips a gradient sky Texture by reference, without cloning it', () => {
    const original = skyBackground(0x9fd4e8, 0xcfe8f0); // a real CanvasTexture here
    expect(original.isTexture).toBe(true);
    const scene = fakeScene(original);
    const weather = createWeather(scene, fakeSun(), 'rain', rng, true);
    expect(scene.background).not.toBe(original); // swapped to rain's own gradient
    weather.update(61, cam());
    // Restored to the EXACT SAME texture object — not a clone. A clone would
    // still be correct-looking (Texture.copy carries mapping/colorSpace over)
    // but would silently allocate a second GPU upload of the same canvas
    // every single rain cycle, which is the leak the fix in weather.js is
    // about. Reference equality is what proves that didn't happen.
    expect(scene.background).toBe(original);
    expect(scene.background.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(scene.background.colorSpace).toBe(THREE.SRGBColorSpace);
  });
});

describe('createWeather — grass tint and fill guard', () => {
  const mk = () => { const s = new THREE.Scene(); s.background = new THREE.Color(0x445566); s.fog = new THREE.Fog(0x123456, 40, 130); return s; };
  const sun = () => ({ color: new THREE.Color(), intensity: 2.2, position: new THREE.Vector3(-36, 15, -24) });
  const cam = () => new THREE.Vector3();
  it('darkens a grass material in place in the rain and restores it exactly at the rainbow', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6cb058 });
    const hex = mat.color.getHex();
    const r = mat.color.r;
    const w = createWeather(mk(), sun(), 'rain', () => 0, false);
    const same = mat;
    w.tintWet(mat);
    expect(mat).toBe(same);
    expect(mat.color.r).toBeLessThan(r * 0.8);
    expect(mat.color.b / mat.color.r).toBeGreaterThan(0.1);
    w.update(61, cam());
    expect(mat.color.getHex()).toBe(hex);
    expect(mat.color.r).toBe(r);
  });
  it('restores the grass on dispose mid-rain', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6cb058 });
    const r = mat.color.r;
    const w = createWeather(mk(), sun(), 'rain', () => 0.5, false);
    w.tintWet(mat);
    w.dispose();
    expect(mat.color.r).toBe(r);
  });
  it('leaves the fill alone after the rainbow restored it', () => {
    const fill = new THREE.HemisphereLight(0xffffff, 0, 0.7);
    const w = createWeather(mk(), sun(), 'rain', () => 0, false, undefined, { fill });
    w.update(61, cam());
    fill.intensity = 0.3; // someone else's later write
    w.dispose();
    expect(fill.intensity).toBe(0.3);
  });
});

describe('createWeather — the rainbow is anti-solar', () => {
  // A rainbow's centre is the ANTI-SOLAR point: directly opposite the sun from
  // the viewer. That is why you always have the sun behind you when you see
  // one, and it is a hard geometric fact, not a look.
  //
  // This test exists because the placement was a hardcoded `cameraPos.z - 70`
  // that was never derived from the sun at all. It was 56 degrees off under
  // the original sun and nobody noticed; when the azimuth pass moved the sun
  // to its antipode the arc ended up on the SAME side of the sky as the sun,
  // which cannot happen in nature. A fixed number that happens to look fine is
  // indistinguishable from a correct one until something moves — so what is
  // pinned here is the RELATIONSHIP, for an arbitrary sun, not a coordinate.
  const rng = () => 0; // stopAt exactly 60s, so update(61) lands in 'rainbow'

  function placeWith(sunPos) {
    const scene = { background: new THREE.Color(0x445566), fog: new THREE.Fog(0x123456, 40, 130), add: () => {} };
    const sun = { color: new THREE.Color(), intensity: 2.2, position: sunPos };
    const weather = createWeather(scene, sun, 'rain', rng, true);
    weather.update(61, new THREE.Vector3(0, 0, 0));
    return weather;
  }

  // Horizontal bearing, degrees clockwise from +z.
  const bearing = (x, z) => ((Math.atan2(x, z) * 180) / Math.PI + 360) % 360;
  // Shortest angular separation between two bearings, in [0, 180]. Antipodal
  // is 180 — the whole property under test.
  const separation = (a, b) => 180 - Math.abs(Math.abs(a - b) - 180);

  for (const [label, pos] of [
    ['the shipped sun', new THREE.Vector3(-36, 15, -24)],
    ['the pre-azimuth sun', new THREE.Vector3(36, 15, 24)],
    ['a due-north sun', new THREE.Vector3(0, 15, 43.27)],
    ['a due-east sun', new THREE.Vector3(43.27, 15, 0)],
  ]) {
    it(`sits 180 degrees from ${label}`, () => {
      const w = placeWith(pos);
      expect(w.rainbowVisible).toBe(true);
      const sunAz = bearing(pos.x, pos.z);
      const bowAz = bearing(w.rainbowPos.x, w.rainbowPos.z);
      expect(separation(bowAz, sunAz)).toBeCloseTo(180, 4);
    });
  }

  it('reduces to the historical due-north placement for a sun at bearing 0', () => {
    // Not nostalgia: it proves the new derivation is a strict generalisation of
    // the old constant rather than a different behaviour that merely also
    // looks plausible.
    const w = placeWith(new THREE.Vector3(0, 15, 43.27));
    expect(w.rainbowPos.x).toBeCloseTo(0, 4);
    expect(w.rainbowPos.z).toBeCloseTo(-70, 4);
  });
});

// v21 3b: falling rain loosens a carrying cat's grip, so the weather says when
// it is actually raining: only the rain phase of a rainy walk.
describe('isRaining', () => {
  const scene = () => ({ background: new THREE.Color(0x445566), fog: new THREE.Fog(0x123456, 40, 130), add: () => {} });
  const sun = () => ({ color: new THREE.Color(), intensity: 2.2, position: new THREE.Vector3(-36, 15, -24) });
  const cam = () => new THREE.Vector3(0, 0, 0);

  it('is true only in the rain phase of a rainy walk', () => {
    const w = createWeather(scene(), sun(), 'rain', () => 0, true); // stopAt 60, rainbow until 90
    expect(w.isRaining()).toBe(true);
    w.update(59, cam());
    expect(w.isRaining()).toBe(true);
    w.update(2, cam()); // 61: the rainbow
    expect(w.isRaining()).toBe(false);
    w.update(40, cam()); // 101: after
    expect(w.isRaining()).toBe(false);
  });

  it('flips exactly at stopAt: rain just before, the rainbow from stopAt on', () => {
    const before = createWeather(scene(), sun(), 'rain', () => 0, true); // stopAt is exactly 60
    before.update(59.99, cam());
    expect(before.isRaining()).toBe(true);
    const atStop = createWeather(scene(), sun(), 'rain', () => 0, true);
    atStop.update(60, cam()); // phase(t) is t < stopAt, so 60 itself is the rainbow
    expect(atStop.isRaining()).toBe(false);
  });

  it('is false on clear and sunset walks, always', () => {
    for (const condition of ['clear', 'sunset']) {
      const w = createWeather(scene(), sun(), condition, () => 0, true);
      expect(w.isRaining()).toBe(false);
      w.update(10, cam());
      expect(w.isRaining()).toBe(false);
    }
  });

  it('draws nothing from any rng', () => {
    let calls = 0;
    const rng = () => { calls++; return 0.5; };
    const w = createWeather(scene(), sun(), 'rain', rng, true);
    const after = calls; // the schedule's one draw happened at creation
    for (let i = 0; i < 200; i++) { w.isRaining(); if (i % 40 === 0) w.update(1, cam()); }
    expect(calls).toBe(after);
  });
});

// Gorge part 3, C6: rain stays outside. gorgeLife hides the rain column while
// the camera is under a ceiling; the rain sound is unchanged.
describe('setSheltered', () => {
  const scene = () => {
    const children = [];
    return { children, background: new THREE.Color(0x445566), fog: new THREE.Fog(0x123456, 40, 130), add: (o) => children.push(o) };
  };
  const sun = () => ({ color: new THREE.Color(), intensity: 2.2, position: new THREE.Vector3(-36, 15, -24) });
  const cam = () => new THREE.Vector3(0, 0, 0);

  it('a sheltered camera sees no rain, and the rain comes back outside', () => {
    const s = scene();
    const w = createWeather(s, sun(), 'rain', () => 0, false);
    const rain = s.children.find((c) => c.name === 'rain-drops');
    expect(rain.visible).toBe(true);
    w.setSheltered(true);
    expect(rain.visible).toBe(false);
    w.update(1, cam());
    expect(rain.visible).toBe(false); // the rain phase's update keeps it hidden
    expect(w.isRaining()).toBe(true); // still raining: only the column is hidden
    w.setSheltered(false);
    expect(rain.visible).toBe(true);
    w.update(1, cam());
    expect(rain.visible).toBe(true);
    // after the rain, coming out never brings the column back
    w.setSheltered(true);
    w.update(60, cam()); // the rainbow
    w.setSheltered(false);
    expect(rain.visible).toBe(false);
  });

  it('every weather shape has setSheltered', async () => {
    for (const condition of ['clear', 'sunset', 'rain']) {
      for (const reducedMotion of [false, true]) {
        const w = createWeather(scene(), sun(), condition, () => 0, reducedMotion);
        expect(typeof w.setSheltered, `${condition} ${reducedMotion}`).toBe('function');
        expect(() => { w.setSheltered(true); w.update(1, cam()); w.setSheltered(false); }).not.toThrow();
      }
    }
    // the dusk (and den) walk's no-op weather, built in walk.js
    const { readFileSync } = await import('node:fs');
    const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    const still = walk.match(/let weather = (\{[^\n]*\});/);
    expect(still).not.toBeNull();
    expect(still[1]).toMatch(/setSheltered\(\) \{\}/);
  });
});


describe('createWeather — rain that reads', () => {
  const mkScene = () => {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x445566);
    s.fog = new THREE.Fog(0x123456, 40, 130);
    return s;
  };
  const mkSun = () => ({ color: new THREE.Color(), intensity: 2.2, position: new THREE.Vector3(-36, 15, -24) });
  const cam = () => new THREE.Vector3(0, 1.5, 0);
  const dropsOf = (scene) => scene.children.find((c) => c.name === 'rain-drops');
  const ringsOf = (scene) => scene.children.find((c) => c.name === 'rain-rings');
  const wetMesh = () => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshStandardMaterial({ color: 0x80a060, roughness: 0.9 }),
    );
    return m;
  };
  const TIER_HIGH = { name: 'high' };
  const TIER_LOW = { name: 'low' };

  it('draws exactly one number from rng, with and without opts', () => {
    for (const opts of [undefined, { tier: TIER_HIGH, fill: new THREE.HemisphereLight(), wet: [], puddles: [] }]) {
      let n = 0;
      createWeather(mkScene(), mkSun(), 'rain', () => { n++; return 0.5; }, false, undefined, opts);
      expect(n).toBe(1);
    }
  });

  it('never touches Math.random', () => {
    // THREE's own uuid draws (Object3D/Material constructors) are not ours: only
    // a Math.random call that does not come from generateUUID counts.
    const real = Math.random;
    const scene = mkScene();
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      if (!/generateUUID/.test(new Error().stack)) throw new Error('Math.random used');
      return real();
    });
    try {
      const w = createWeather(scene, mkSun(), 'rain', () => 0.5, false, undefined, {
        tier: TIER_HIGH, fill: new THREE.HemisphereLight(), puddles: [{ x: 1, z: 1, r: 0.8, y: 0 }],
      });
      for (let i = 0; i < 100; i++) w.update(0.016, cam());
    } finally {
      spy.mockRestore();
    }
  });

  it('is seeded: two weathers have identical drop positions', () => {
    const a = mkScene();
    const b = mkScene();
    createWeather(a, mkSun(), 'rain', () => 0.5, false, undefined, { tier: TIER_HIGH });
    createWeather(b, mkSun(), 'rain', () => 0.5, false, undefined, { tier: TIER_HIGH });
    const pa = dropsOf(a).geometry.attributes.position.array;
    const pb = dropsOf(b).geometry.attributes.position.array;
    expect(pa.length).toBeGreaterThan(0);
    expect(Buffer.from(pa.buffer).equals(Buffer.from(pb.buffer))).toBe(true);
    // and it is the named stream, not some other
    expect(mulberry32).toBeTypeOf('function');
  });

  it('counts: low < high <= 1200', () => {
    expect(rainDropCount(TIER_LOW)).toBeLessThan(rainDropCount(TIER_HIGH));
    expect(rainDropCount(TIER_HIGH)).toBeLessThanOrEqual(1200);
    expect(Object.isFrozen(RAIN_LOOK)).toBe(true);
  });

  it('drops are streak quads, not Points, with a 0.3-0.7 m vertical extent and no shadow', () => {
    const scene = mkScene();
    createWeather(scene, mkSun(), 'rain', () => 0.5, false, undefined, { tier: TIER_HIGH });
    const d = dropsOf(scene);
    expect(d.isPoints).toBeFalsy();
    expect(d.isMesh || d.isLineSegments).toBe(true);
    expect(d.castShadow).toBe(false);
    expect(d.receiveShadow).toBe(false);
    const p = d.geometry.attributes.position;
    const n = rainDropCount(TIER_HIGH);
    expect(p.count).toBeGreaterThanOrEqual(n * 2);
    const per = p.count / n;
    for (let i = 0; i < n; i += 37) {
      let lo = Infinity; let hi = -Infinity;
      for (let k = 0; k < per; k++) {
        const y = p.getY(i * per + k);
        lo = Math.min(lo, y); hi = Math.max(hi, y);
      }
      expect(hi - lo).toBeGreaterThanOrEqual(0.3);
      expect(hi - lo).toBeLessThanOrEqual(0.7);
    }
  });

  it('keeps its extent after many frames of falling', () => {
    const scene = mkScene();
    const w = createWeather(scene, mkSun(), 'rain', () => 0.99, false, undefined, { tier: TIER_HIGH });
    for (let i = 0; i < 300; i++) w.update(0.03, cam());
    const p = dropsOf(scene).geometry.attributes.position;
    const per = p.count / rainDropCount(TIER_HIGH);
    for (let i = 0; i < 50; i++) {
      const ys = [];
      for (let k = 0; k < per; k++) ys.push(p.getY(i * per + k));
      const e = Math.max(...ys) - Math.min(...ys);
      expect(e).toBeGreaterThanOrEqual(0.3);
      expect(e).toBeLessThanOrEqual(0.7);
    }
  });

  it('crowds the drops near the camera', () => {
    const scene = mkScene();
    createWeather(scene, mkSun(), 'rain', () => 0.5, false, undefined, { tier: TIER_HIGH });
    const p = dropsOf(scene).geometry.attributes.position;
    const n = rainDropCount(TIER_HIGH);
    const per = p.count / n;
    let near = 0;
    for (let i = 0; i < n; i++) {
      if (Math.hypot(p.getX(i * per), p.getZ(i * per)) < RAIN_LOOK.radius * 0.4) near++;
    }
    expect(near / n).toBeGreaterThan(0.5);
  });

  it('reduced motion adds no drops or rings but still changes the mood', () => {
    const scene = mkScene();
    const sun = mkSun();
    const before = scene.fog.near;
    const w = createWeather(scene, sun, 'rain', () => 0.5, true, undefined, { tier: TIER_HIGH, puddles: [{ x: 1, z: 1, r: 0.8, y: 0 }] });
    w.addPuddles([{ x: 1, z: 1, r: 0.8, y: 0 }]);
    expect(dropsOf(scene)).toBeUndefined();
    expect(ringsOf(scene)).toBeUndefined();
    expect(scene.fog.near).not.toBe(before);
    expect(sun.intensity).toBeLessThanOrEqual(0.95);
  });

  it('wets the ground in the rain and restores it exactly, original never mutated', () => {
    const scene = mkScene();
    const mesh = wetMesh();
    const original = mesh.material;
    const c0 = original.color.clone();
    const r0 = original.roughness;
    const w = createWeather(scene, mkSun(), 'rain', () => 0, false, undefined, { tier: TIER_HIGH, wet: [mesh] });
    expect(original.color.getHex()).toBe(c0.getHex()); // shared material untouched
    expect(original.roughness).toBe(r0);
    expect(mesh.material).not.toBe(original);
    for (const ch of ['r', 'g', 'b']) expect(mesh.material.color[ch]).toBeLessThanOrEqual(c0[ch] * 0.8);
    // colour tells wet, not gloss (a lower roughness lit the lawn with a pale sky sheen)
    expect(mesh.material.roughness).toBeLessThanOrEqual(r0);
    w.update(61, cam()); // rainbow
    expect(mesh.material).toBe(original);
    expect(original.color.getHex()).toBe(c0.getHex());
    expect(original.roughness).toBe(r0);
  });

  it('dispose() mid-rain puts the ground and the fill back', () => {
    const scene = mkScene();
    const mesh = wetMesh();
    const original = mesh.material;
    const c0 = original.color.getHex();
    const fill = new THREE.HemisphereLight(0xffffff, 0x000000, 0.7);
    const w = createWeather(scene, mkSun(), 'rain', () => 0.5, false, undefined, {
      tier: TIER_HIGH, wet: [mesh], fill, puddles: [{ x: 0, z: 0, r: 0.8, y: 0 }],
    });
    w.update(1, cam());
    expect(fill.intensity).toBeLessThanOrEqual(0.7 * 0.85);
    w.dispose();
    w.dispose(); // idempotent
    expect(mesh.material).toBe(original);
    expect(original.color.getHex()).toBe(c0);
    expect(original.roughness).toBe(0.9);
    expect(fill.intensity).toBe(0.7);
    expect(dropsOf(scene)).toBeUndefined();
    expect(ringsOf(scene)).toBeUndefined();
  });

  it('greys the fog, dims sun and fill, and restores the fill at the rainbow', () => {
    const scene = mkScene();
    const sun = mkSun();
    const fill = new THREE.HemisphereLight(0xffffff, 0x000000, 0.7);
    const w = createWeather(scene, sun, 'rain', () => 0, false, undefined, { tier: TIER_HIGH, fill });
    const hsl = {};
    scene.fog.color.getHSL(hsl);
    const ref = {};
    new THREE.Color(0x8a9aa8).getHSL(ref);
    expect(hsl.s).toBeLessThanOrEqual(ref.s);
    expect(scene.fog.near).toBeLessThanOrEqual(16);
    expect(sun.intensity).toBeLessThanOrEqual(0.95);
    expect(fill.intensity).toBeLessThanOrEqual(0.7 * 0.85);
    w.update(61, cam());
    expect(fill.intensity).toBe(0.7);
  });

  it('puddle rings: one InstancedMesh, capped, gone at the rainbow, fewer on low', () => {
    const puddles = [0, 1, 2].map((i) => ({ x: i * 3, z: 1, r: 0.8, y: 0 }));
    const scene = mkScene();
    const w = createWeather(scene, mkSun(), 'rain', () => 0, false, undefined, { tier: TIER_HIGH });
    expect(ringsOf(scene)).toBeUndefined();
    w.addPuddles(puddles);
    const rings = ringsOf(scene);
    expect(rings.isInstancedMesh).toBe(true);
    expect(rings.count).toBeLessThanOrEqual(9);
    expect(rings.castShadow).toBe(false);
    for (let i = 0; i < 40; i++) w.update(0.05, cam());
    w.update(61, cam());
    expect(rings.visible).toBe(false);

    const lowScene = mkScene();
    const lw = createWeather(lowScene, mkSun(), 'rain', () => 0.5, false, undefined, { tier: TIER_LOW, puddles });
    expect(ringsOf(lowScene).count).toBe(3);
    lw.dispose();
  });

  it('faces the drop column to the camera when a camera is passed', () => {
    const scene = mkScene();
    const w = createWeather(scene, mkSun(), 'rain', () => 0.5, false, undefined, { tier: TIER_HIGH });
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(3, 1.5, 4);
    camera.lookAt(10, 1.5, 4); // looking +x
    camera.updateMatrixWorld();
    w.update(0.016, camera.position, camera);
    // quad normal (+z rotated by yaw) points back at the viewer: -x
    const d = dropsOf(scene);
    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.rotation.y);
    expect(n.x).toBeCloseTo(-1, 3);
  });
});
