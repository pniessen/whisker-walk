import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/skylife.test.js);
// litMaterial may reach for a canvas.
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

const { SHADE_FLOOR, shadeFor, composeIntensity, createGorgeLife, DARK_FLOOR, GLOW_MAX, darkFor, ENV_DARK_FLOOR } = await import('../src/gorgelife.js');
const { GORGE_CAVES, gorgeGround } = await import('../src/world/gorgeshape.js');
const { CAVE_SHOW_R, CAVE_SHOW_DY } = await import('../src/gorgelife.js');
const { floodGorge } = await import('./helpers/gorgeflood.js');

// A ground whose height is the cat's x: the tests walk her up by moving x.
const RAMP = { flat: false, y: (x) => x };

function make({ reducedMotion = false, sunIntensity = 3, fillIntensity = 1 } = {}) {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, sunIntensity);
  const fill = new THREE.HemisphereLight(0xffffff, 0x5f5d52, fillIntensity);
  const audio = { setAmbientMix: vi.fn() };
  const life = createGorgeLife({ scene, sun, fill, ground: RAMP, reducedMotion, audio });
  return { scene, sun, fill, audio, life };
}

const at = (y) => new THREE.Vector3(y, y, 0);
const birdMeshes = (scene) => scene.children.filter((c) => c.isInstancedMesh);

function birdPositions(scene) {
  const mesh = birdMeshes(scene)[0];
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    out.push(p.setFromMatrixPosition(m).toArray());
  }
  return out;
}

describe('gorge life: shade by height', () => {
  it('shade is 0.6 on the floor, 1 on the clifftop, eased', () => {
    expect(SHADE_FLOOR).toBe(0.6);
    expect(shadeFor(0)).toBe(0.6);
    expect(shadeFor(2)).toBe(0.6);
    expect(shadeFor(6)).toBeCloseTo(0.8, 10);
    expect(shadeFor(10)).toBe(1);
    expect(shadeFor(12)).toBe(1);

    const { sun, fill, life } = make();
    // The walk starts where she stands: no fade-in on the first frame.
    life.update(1 / 60, 0, at(0));
    expect(life.shade).toBeCloseTo(0.6, 10);
    expect(sun.intensity).toBeCloseTo(3 * 0.6, 10);
    expect(fill.intensity).toBeCloseTo(0.85 + 0.15 * 0.6, 10);
    // Up on the clifftop it eases at 1.5 a second, not in one jump.
    life.update(0.1, 0.1, at(12));
    expect(life.shade).toBeCloseTo(0.75, 10);
    for (let i = 0; i < 20; i++) life.update(0.05, 0.2 + i * 0.05, at(12));
    expect(life.shade).toBe(1);
    expect(sun.intensity).toBeCloseTo(3, 10);
    expect(fill.intensity).toBeCloseTo(1, 10);
  });

  it('composeIntensity keeps an outside write as the new base', () => {
    const light = { intensity: 3 };
    const state = { base: 3, written: 3 };
    composeIntensity(state, light, 0.6);
    expect(light.intensity).toBeCloseTo(1.8, 10);
    expect(state.written).toBe(light.intensity);
    // the same factor again changes nothing: our own write is not a new base
    composeIntensity(state, light, 0.6);
    expect(light.intensity).toBeCloseTo(1.8, 10);
    // the rainbow writes the sun
    light.intensity = 2.2;
    composeIntensity(state, light, 0.6);
    expect(state.base).toBe(2.2);
    expect(light.intensity).toBeCloseTo(1.32, 10);
  });

  it('the life never leaves the sun dimmed after dispose', () => {
    const { sun, fill, life } = make();
    life.update(1 / 60, 0, at(0));
    expect(sun.intensity).toBeCloseTo(1.8, 10);
    life.dispose();
    expect(sun.intensity).toBe(3);
    expect(fill.intensity).toBe(1);

    // a weather write since the last frame is kept, not undone
    const b = make();
    b.life.update(1 / 60, 0, at(0));
    b.sun.intensity = 2.2;
    b.life.dispose();
    expect(b.sun.intensity).toBe(2.2);
  });

  it('dusk and weather values set before the walk are the base it shades', () => {
    const { sun, life } = make({ sunIntensity: 0.7 });
    life.update(1 / 60, 0, at(0));
    expect(sun.intensity).toBeCloseTo(0.7 * 0.6, 10);
  });

  it('mixes the ambience by height, at most 4 times a second', () => {
    const { audio, life } = make();
    for (let i = 0; i < 60; i++) life.update(1 / 60, i / 60, at(0));
    expect(audio.setAmbientMix.mock.calls.length).toBeGreaterThan(0);
    expect(audio.setAmbientMix.mock.calls.length).toBeLessThanOrEqual(4);
    expect(audio.setAmbientMix).toHaveBeenLastCalledWith({ high: 0, cave: 0 });
    for (let i = 0; i < 60; i++) life.update(1 / 60, 1 + i / 60, at(12));
    expect(audio.setAmbientMix).toHaveBeenLastCalledWith({ high: 1, cave: 0 });
    for (let i = 0; i < 60; i++) life.update(1 / 60, 2 + i / 60, at(6));
    expect(audio.setAmbientMix).toHaveBeenLastCalledWith({ high: 0.5, cave: 0 });
  });
});

describe('gorge life: wheeling birds', () => {
  it('birds wheel above every rim and are time-driven', () => {
    const a = make();
    const b = make();
    const meshes = birdMeshes(a.scene);
    expect(meshes).toHaveLength(1);
    expect(meshes[0].count).toBe(3);
    expect(meshes[0].userData.noCast).toBe(true);
    expect(meshes[0].castShadow).toBe(false);
    const seen = new Set();
    for (let t = 0; t <= 60; t += 0.25) {
      a.life.update(0.25, t, at(0));
      // b runs at a different frame rate and from a different spot: only t counts
      b.life.update(0.1, t, at(t % 12));
      const pa = birdPositions(a.scene);
      expect(birdPositions(b.scene)).toEqual(pa);
      for (const [x, y, z] of pa) {
        expect(y).toBeGreaterThanOrEqual(32);
        expect(y).toBeLessThanOrEqual(36);
        seen.add(`${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
    expect(seen.size).toBeGreaterThan(100); // they move
  });

  it('with reducedMotion there are none', () => {
    const { scene, life } = make({ reducedMotion: true });
    for (let t = 0; t < 10; t += 0.5) life.update(0.5, t, at(0));
    expect(birdMeshes(scene)).toHaveLength(0);
    expect(() => life.dispose()).not.toThrow();
  });

  it('dispose takes the birds out and frees them', () => {
    const { scene, life } = make();
    const mesh = birdMeshes(scene)[0];
    const spies = [vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(mesh.material, 'dispose'), vi.spyOn(mesh, 'dispose')];
    life.dispose();
    expect(birdMeshes(scene)).toHaveLength(0);
    for (const s of spies) expect(s).toHaveBeenCalled();
  });
});

// --- Gorge part 3: the caves (C2, C3, C6, C7) ---------------------------------
// The real Gorge ground and caves; the sun and fill are plain { intensity }.
const GROUND = gorgeGround();
const ECHO = GORGE_CAVES.find((c) => c.id === 'echo');
const OUTSIDE = [-10, 23.5]; // on the gorge floor, in front of the Echo Cave's mouth
const CHAMBER = ECHO.path[ECHO.path.length - 1]; // the far end: depth 1

function makeCave({ sunIntensity = 3, fillIntensity = 1, weather = { setSheltered: vi.fn() }, envIntensity = 0.45 } = {}) {
  const scene = new THREE.Scene();
  scene.environmentIntensity = envIntensity; // walk.js's HIGH tier
  const sun = { intensity: sunIntensity };
  const fill = { intensity: fillIntensity };
  const audio = { setAmbientMix: vi.fn() };
  const life = createGorgeLife({ scene, sun, fill, ground: GROUND, reducedMotion: true, audio, caves: GORGE_CAVES, weather });
  return { scene, sun, fill, audio, weather, life, base: sunIntensity };
}
const glowOf = (scene) => scene.children.find((c) => c.isPointLight);
const catAt = (x, z) => new THREE.Vector3(x, GROUND.y(x, z), z);
// The sun's light factor: what it holds over what it would hold outside at the same shade.
const factorOf = (k) => k.sun.intensity / (k.base * k.life.shade);

// Points every `step` metres along a polyline, first point first.
function walkLine(points, step) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

function settle(k, [x, z], seconds, t0 = 0) {
  let t = t0;
  for (let i = 0; i < seconds * 60; i++) { t += 1 / 60; k.life.update(1 / 60, t, catAt(x, z)); }
  return t;
}

describe('gorge life: the caves', () => {
  it('the constants', () => {
    expect(DARK_FLOOR).toBe(0.3);
    expect(GLOW_MAX).toBe(1.0); // ruling C-F9: a cosy pool, not a hotspot
    expect(ENV_DARK_FLOOR).toBe(0.55); // tuned live: Echo chamber 51% of the floor, day and dusk
    expect(darkFor(0)).toBe(1);
    expect(darkFor(1)).toBeCloseTo(0.3, 12);
    expect(darkFor(0.5)).toBeCloseTo(0.65, 12);
  });

  it('deeper is darker, never below the floor', () => {
    const k = makeCave();
    let last = Infinity;
    let t = 0;
    // in from the floor at a slow walk, then a rest in the chamber
    for (const [x, z] of walkLine([OUTSIDE, ...ECHO.path], 1.5 / 60)) {
      t += 1 / 60;
      k.life.update(1 / 60, t, catAt(x, z));
      const f = factorOf(k);
      expect(f).toBeLessThanOrEqual(last + 1e-12);
      expect(f).toBeGreaterThanOrEqual(DARK_FLOOR - 1e-12);
      last = f;
    }
    settle(k, CHAMBER, 2, t);
    expect(Math.abs(factorOf(k) - DARK_FLOOR)).toBeLessThanOrEqual(0.02);
    expect(factorOf(k)).toBeGreaterThanOrEqual(DARK_FLOOR - 1e-12);
    // the fill: (0.85 + 0.15 shade) x dark
    expect(k.fill.intensity).toBeCloseTo((0.85 + 0.15 * k.life.shade) * darkFor(1), 10);
  });

  it('the glow comes on as she goes in and sits on her cat', () => {
    const k = makeCave();
    const glow = glowOf(k.scene);
    // there from the start, so the shaders compile with it; never a shadow
    expect(glow).toBeDefined();
    expect(glow.castShadow).toBe(false);
    expect(glow.color.getHex()).toBe(0xffd9a8);
    expect(glow.distance).toBe(5);
    expect(glow.decay).toBe(2);
    expect(glow.intensity).toBe(0);
    settle(k, OUTSIDE, 1);
    expect(glow.intensity).toBe(0);
    let t = 1;
    for (const [x, z] of walkLine([OUTSIDE, ...ECHO.path], 3 / 60)) {
      t += 1 / 60;
      const cat = catAt(x, z);
      k.life.update(1 / 60, t, cat);
      expect(glow.position.x).toBe(cat.x);
      expect(glow.position.y).toBeCloseTo(cat.y + 1.3, 12);
      expect(glow.position.z).toBe(cat.z);
      expect(glow.intensity).toBeGreaterThanOrEqual(0);
      expect(glow.intensity).toBeLessThanOrEqual(GLOW_MAX);
    }
    settle(k, CHAMBER, 2, t);
    expect(glow.intensity).toBeGreaterThanOrEqual(GLOW_MAX - 0.05);
    expect(glow.castShadow).toBe(false);
  });

  it('the light comes back at a linear rate', () => {
    const k = makeCave();
    settle(k, CHAMBER, 3);
    expect(factorOf(k)).toBeCloseTo(0.3, 12);
    // out onto the floor (the same shade as the chamber's floor)
    const dt = 0.05;
    for (let i = 1; i <= 10; i++) {
      k.life.update(dt, 3 + i * dt, catAt(...OUTSIDE));
      expect(factorOf(k)).toBeCloseTo(Math.min(1, 0.3 + 2.0 * i * dt), 9);
    }
  });

  it('a bend\'s inner diagonal never jumps the light', () => {
    // part 3 Task 2: depth jumps ~0.15 across a bend's inner corner; the
    // linear rate smooths it to at most rate x dt a frame.
    for (const cave of GORGE_CAVES) {
      const k = makeCave();
      const [, corner, , end] = cave.path;
      const [mx, mz] = cave.path[0];
      // in along the path to just short of the bend, then across the inner corner on a diagonal
      const before = [corner[0] + Math.sign(mx - corner[0]) * 2, corner[1] + Math.sign(mz - corner[1]) * 0];
      const after = [corner[0] + Math.sign(end[0] - corner[0]) * 0, corner[1] + Math.sign(end[1] - corner[1]) * 2];
      let t = 0;
      let last = null;
      for (const [x, z] of walkLine([cave.path[0], before, after, before, cave.path[0]], 6 / 60)) {
        t += 1 / 60;
        k.life.update(1 / 60, t, catAt(x, z));
        const f = factorOf(k);
        if (last !== null) expect(Math.abs(f - last)).toBeLessThanOrEqual(2.0 / 60 + 1e-12);
        last = f;
      }
    }
  });

  it('leaving a cave brings the light and the camera back', () => {
    // Review Focus 1: from the chamber, out at a zoomies pace (8 m/s, over
    // the fastest the cat runs), and 1 s after the mouth it is all back.
    const k = makeCave();
    let t = settle(k, CHAMBER, 3);
    const glow = glowOf(k.scene);
    expect(glow.intensity).toBe(GLOW_MAX);
    for (const [x, z] of walkLine([...ECHO.path].reverse(), 8 / 60)) {
      t += 1 / 60;
      k.life.update(1 / 60, t, catAt(x, z));
    }
    // a second out on the floor, still running
    for (const [x, z] of walkLine([ECHO.path[0], [ECHO.path[0][0] + 8, ECHO.path[0][1]]], 8 / 60).slice(1, 61)) {
      t += 1 / 60;
      k.life.update(1 / 60, t, catAt(x, z));
    }
    expect(factorOf(k)).toBeGreaterThanOrEqual(0.98);
    expect(glow.intensity).toBeLessThanOrEqual(0.05);
    expect(k.life.depth).toBeLessThanOrEqual(0.03);
  });

  it('a weather write in a cave becomes the new base and stays dimmed', () => {
    // Review Focus 3: the rainbow writes the sun while she is in the chamber.
    const k = makeCave();
    const t = settle(k, CHAMBER, 3);
    k.sun.intensity = 2.2;
    k.life.update(1 / 60, t + 1 / 60, catAt(...CHAMBER));
    expect(Math.abs(k.sun.intensity - 2.2 * k.life.shade * darkFor(k.life.depth))).toBeLessThanOrEqual(1e-6);
    expect(k.sun.intensity).toBeLessThan(2.2 * 0.6 * 0.31);
  });

  it('dispose removes the glow and restores both lights', () => {
    // Review Focus 2: a walk that ends in a cave hands the next walk full light.
    const k = makeCave();
    settle(k, CHAMBER, 3);
    const glow = glowOf(k.scene);
    const spy = vi.spyOn(glow, 'dispose');
    expect(k.sun.intensity).toBeLessThan(3);
    k.life.dispose();
    expect(k.scene.children).not.toContain(glow);
    expect(glowOf(k.scene)).toBeUndefined();
    expect(spy).toHaveBeenCalled();
    expect(k.sun.intensity).toBe(3);
    expect(k.fill.intensity).toBe(1);
  });

  it('a dusk walk\'s chamber is never darker than the floor rule', () => {
    // Review Focus 4, by numbers: dusk's sun 0.7, the floor's shade, the chamber.
    const k = makeCave({ sunIntensity: 0.7 });
    let t = 0;
    for (const [x, z] of walkLine([OUTSIDE, ...ECHO.path], 3 / 60)) {
      t += 1 / 60;
      k.life.update(1 / 60, t, catAt(x, z));
      expect(k.sun.intensity).toBeGreaterThanOrEqual(0.7 * 0.6 * 0.3 - 1e-12);
    }
    settle(k, CHAMBER, 3, t);
    expect(k.sun.intensity).toBeGreaterThanOrEqual(0.7 * 0.6 * 0.3 - 1e-12);
    expect(glowOf(k.scene).intensity).toBe(GLOW_MAX);
  });

  it('the environment light dims with depth, never below ENV_DARK_FLOOR; a Night Eyes write is the new base; dispose restores it', () => {
    // Ruling C-F9: in a roofed chamber the image-based light is the biggest
    // term, so it dims with the same eased depth as the sun and fill.
    const k = makeCave({ envIntensity: 0.45 });
    const env = () => k.scene.environmentIntensity;
    settle(k, OUTSIDE, 1);
    expect(env()).toBe(0.45);
    let t = 1;
    let last = Infinity;
    for (const [x, z] of walkLine([OUTSIDE, ...ECHO.path], 1.5 / 60)) {
      t += 1 / 60;
      k.life.update(1 / 60, t, catAt(x, z));
      expect(env()).toBeLessThanOrEqual(last + 1e-12);
      expect(env()).toBeGreaterThanOrEqual(0.45 * ENV_DARK_FLOOR - 1e-12);
      expect(env()).toBeCloseTo(0.45 * (1 - (1 - ENV_DARK_FLOOR) * k.life.depth), 10);
      last = env();
    }
    t = settle(k, CHAMBER, 2, t);
    expect(env()).toBeCloseTo(0.45 * ENV_DARK_FLOOR, 10);
    // Night Eyes (composer.js applyLighting) writes it while she is deep in:
    // that value is the new base, still dimmed
    k.scene.environmentIntensity = 0.7;
    k.life.update(1 / 60, t + 1 / 60, catAt(...CHAMBER));
    expect(env()).toBeCloseTo(0.7 * ENV_DARK_FLOOR, 10);
    // the walk ends in the chamber: the next walk gets it back whole
    k.life.dispose();
    expect(env()).toBe(0.7);
  });

  it('rain is hidden under a ceiling', () => {
    const k = makeCave();
    const cam = { position: new THREE.Vector3() };
    let t = 0;
    const frame = (camX, camY, camZ, catXZ = OUTSIDE) => {
      cam.position.set(camX, camY, camZ);
      t += 1 / 60;
      k.life.update(1 / 60, t, catAt(...catXZ), cam);
    };
    for (let i = 0; i < 30; i++) frame(-10, 2, 23.5);
    expect(k.weather.setSheltered).not.toHaveBeenCalled();
    // into the Echo Cave's corridor, along the 1 mm strip by its wall too
    for (let i = 0; i < 30; i++) frame(-22, 1, 23.5, [-21, 23.5]);
    for (let i = 0; i < 30; i++) frame(-25 + i * 0.1, 1, 22.0005, [-21, 23.5]);
    expect(k.weather.setSheltered.mock.calls).toEqual([[true]]);
    // back out on the floor
    for (let i = 0; i < 30; i++) frame(-10, 2, 23.5);
    expect(k.weather.setSheltered.mock.calls).toEqual([[true], [false]]);
    // dispose hands the rain back only if it had hidden it
    k.life.dispose();
    expect(k.weather.setSheltered.mock.calls).toEqual([[true], [false]]);
  });

  it('the ambience hears the cave by depth', () => {
    const k = makeCave();
    settle(k, CHAMBER, 3);
    const last = k.audio.setAmbientMix.mock.calls.at(-1)[0];
    expect(last.cave).toBeCloseTo(1, 10);
    expect(last.high).toBe(0);
  });

  it('on any other area none of this exists', async () => {
    // Only the Gorge hands walk.js a `life`, so no other area gets a light.
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = new URL('../src/world/', import.meta.url);
    const withLife = readdirSync(dir).filter((f) => f.endsWith('.js') && /\blife\s*:/.test(readFileSync(new URL(f, dir), 'utf8')));
    expect(withLife).toEqual(['gorge.js']);
    const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(walk).toMatch(/areaData\.life\?\.\(\{[^}]*\bweather\b[^}]*\}\) \?\? NO_AREA_LIFE/);
    expect(walk).toMatch(/const NO_AREA_LIFE = \{ update\(\) \{\}, dispose\(\) \{\} \};/);
    // and a life handed no caves never dims for one
    const { scene, sun, life } = make();
    scene.environmentIntensity = 0.45;
    for (let i = 0; i < 60; i++) life.update(1 / 60, i / 60, at(0));
    expect(sun.intensity).toBeCloseTo(3 * 0.6, 10);
    expect(scene.environmentIntensity).toBe(0.45); // and never the image-based light
    life.dispose();
    expect(scene.environmentIntensity).toBe(0.45);
  });
});

describe('gorge life: the caves\' insides (C5)', () => {
  const ground = gorgeGround();
  const groups = () => GORGE_CAVES.map((c) => {
    const g = new THREE.Group();
    g.userData.caveId = c.id;
    g.visible = false;
    return g;
  });
  const make = (interiors) => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    const fill = new THREE.HemisphereLight(0xffffff, 0x5f5d52, 1);
    return createGorgeLife({ scene, sun, fill, ground, caves: GORGE_CAVES, interiors, reducedMotion: true });
  };
  const cat = (x, z) => new THREE.Vector3(x, ground.y(x, z), z);
  const rectDist = (r, x, z) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

  it('an interior shows only near its cave and on its level', () => {
    expect([CAVE_SHOW_R, CAVE_SHOW_DY]).toEqual([12, 3]);
    const interiors = groups();
    const [echo, snug, glitter] = interiors;
    const life = make(interiors);
    // outside the Echo Cave's mouth, on the floor: shown from the first frame
    life.update(1 / 60, 0, cat(-16, 23.5));
    expect(interiors.map((g) => g.visible)).toEqual([true, false, false]);
    // across the gorge: hidden
    life.update(1 / 60, 0.1, cat(-3, 2));
    expect(echo.visible).toBe(false);
    // On leg A, 10 m from the Snug Cave's nearest rectangle but about 7 m
    // below it: only the level rule hides it.
    const snugCave = GORGE_CAVES[1];
    expect(Math.min(...snugCave.rects.map((r) => rectDist(r, 5, 20)))).toBeCloseTo(10, 6);
    expect(snugCave.y - ground.y(5, 20)).toBeGreaterThan(CAVE_SHOW_DY);
    life.update(1 / 60, 0.2, cat(5, 20));
    expect(snug.visible).toBe(false);
    // at the Snug Cave's mouth, and in the Glitter Cave's chamber
    life.update(1 / 60, 0.3, cat(14, 20.2));
    expect(interiors.map((g) => g.visible)).toEqual([false, true, false]);
    life.update(1 / 60, 0.4, cat(41.5, -39.5));
    expect(glitter.visible).toBe(true);
    expect(snug.visible).toBe(false);
    life.dispose();
  });

  it('starts hidden at the spawn: no pop at the walk\'s start', () => {
    const interiors = groups();
    const life = make(interiors);
    life.update(1 / 60, 0, cat(-44, -11));
    expect(interiors.some((g) => g.visible)).toBe(false);
    life.dispose();
  });

  it('at most one interior is visible at any reached cell of the flood', () => {
    const interiors = groups();
    const life = make(interiors);
    let worst = 0;
    let seen = 0;
    floodGorge().forEachReached((x, z) => {
      life.update(1 / 60, 0, cat(x, z));
      const n = interiors.filter((g) => g.visible).length;
      if (n > 0) seen++;
      worst = Math.max(worst, n);
    });
    expect(worst).toBe(1);
    expect(seen).toBeGreaterThan(0);
    life.dispose();
  });
});
