import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// The Rooftops' evening and its bus (src/roofslife.js), headless: the sky is
// spied on, so a test can count every time it is rebuilt.
const made = [];
vi.mock('../src/render/sky.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    skyBackground: vi.fn((top, horizon) => {
      const tex = { isTexture: true, top, horizon, dispose: vi.fn() };
      made.push(tex);
      return tex;
    }),
  };
});

const { skyBackground } = await import('../src/render/sky.js');
const { createRoofsLife, eveningAt, busAt, EVENING_RAMP, EVENING_STEPS } = await import('../src/roofslife.js');
const { BUS, ROOFS_SHOT_T, ROOFS_SHOTS, ROOFS_TRAVERSAL, ROOFS_GROUND } = await import('../src/world/roofsplan.js');
const { createGround } = await import('../src/ground.js');
const { flockPerches, perchIndex, ROOFS_BIRDS } = await import('../src/world/roofsflock.js');

const SUNSET = { top: 0x4a5a8c, horizon: 0xe89a6a };
const DUSK = { top: 0x1f2a52, horizon: 0x8a5a6a };

function walk() {
  const bus = new THREE.Object3D();
  const area = { skySunset: { ...SUNSET }, skyDusk: { ...DUSK }, bus };
  // what applyDusk leaves: the dusk sky, its fog, the dusk sun and fill
  const dusk = { isTexture: true, dispose: vi.fn() };
  const scene = { background: dusk, fog: new THREE.Fog(DUSK.horizon, 40, 140) };
  const sun = { intensity: 0.8 };
  const fill = { intensity: 0.5 };
  const life = createRoofsLife(area)({ scene, sun, fill });
  return { area, bus, scene, sun, fill, life, dusk };
}
// Runs the life on to walk second `to`, in frames of `dt`.
function run(w, to, dt = 1 / 30) {
  let t = w.t ?? 0;
  while (t < to - 1e-9) {
    const d = Math.min(dt, to - t);
    t += d;
    w.life.update(d, 1000 + t); // main.js's t is the app's clock, not the walk's
  }
  w.t = t;
}

beforeEach(() => {
  skyBackground.mockClear();
  made.length = 0;
});

describe('the Rooftops’ evening', () => {
  it('the sky starts at sunset and is dusk by 240 s, rebuilt six times', () => {
    expect(EVENING_RAMP).toBe(240);
    expect(EVENING_STEPS).toBe(6);
    expect(eveningAt(0)).toBe(0);
    expect(eveningAt(EVENING_RAMP)).toBe(1);
    expect(eveningAt(EVENING_RAMP / 2)).toBeCloseTo(0.5, 6);
    const w = walk();
    const { dusk } = w;
    // at the start: the sunset sky, its fog, a brighter sun and fill than dusk's
    expect(skyBackground).toHaveBeenCalledTimes(1);
    expect(skyBackground).toHaveBeenLastCalledWith(SUNSET.top, SUNSET.horizon);
    expect(w.scene.background).toBe(made[0]);
    expect(dusk.dispose).toHaveBeenCalledTimes(1); // the old sky is let go
    expect(w.scene.fog.color.getHex()).toBe(SUNSET.horizon);
    expect(w.sun.intensity).toBeGreaterThan(0.8);
    expect(w.fill.intensity).toBeGreaterThan(0.5);
    const fog = w.scene.fog;
    run(w, EVENING_RAMP + 0.01); // by 240 s (a sum of frames lands a hair either side of it)
    // six rebuilds, the last the dusk sky; each old one disposed
    expect(skyBackground).toHaveBeenCalledTimes(1 + EVENING_STEPS);
    expect(skyBackground).toHaveBeenLastCalledWith(DUSK.top, DUSK.horizon);
    for (const tex of made.slice(0, -1)) expect(tex.dispose).toHaveBeenCalledTimes(1);
    expect(made.at(-1).dispose).not.toHaveBeenCalled();
    expect(w.scene.background).toBe(made.at(-1));
    expect(w.scene.fog).toBe(fog);
    expect(w.scene.fog.color.getHex()).toBe(DUSK.horizon);
    expect(w.sun.intensity).toBeCloseTo(0.8, 6);
    expect(w.fill.intensity).toBeCloseTo(0.5, 6);
    // and it stays dusk
    run(w, EVENING_RAMP + 120);
    expect(skyBackground).toHaveBeenCalledTimes(1 + EVENING_STEPS);
  });

  it('the bus runs the same at the same time', () => {
    expect(BUS).toMatchObject({ x0: -60, x1: 60, run: 14, every: 45 });
    const at = (t) => busAt(t, {});
    expect(at(0).x).toBeCloseTo(-60, 6);
    expect(at(7).x).toBeCloseTo(0, 6);
    expect(at(13.999).x).toBeCloseTo(60, 1);
    expect(at(7).visible).toBe(true);
    expect(at(20).visible).toBe(false); // hidden between runs
    expect(at(44).visible).toBe(false);
    expect(at(45 + 7)).toEqual(at(7)); // every 45 s
    expect(at(10 * 45 + 3.5)).toEqual(at(3.5));
    // `out` is filled in place
    const out = {};
    expect(busAt(7, out)).toBe(out);
    // two walks, run in different frames, put the bus in the same place at the same walk time
    const a = walk();
    const b = walk();
    run(a, 52.25, 1 / 60);
    run(b, 52.25, 1 / 24);
    expect(a.bus.position.x).toBeCloseTo(b.bus.position.x, 6);
    expect(a.bus.position.x).toBeCloseTo(busAt(52.25, {}).x, 6);
    expect(a.bus.visible).toBe(b.bus.visible);
    expect(a.bus.position.z).toBe(BUS.z);
  });

  // Beauty pass, Task A: the sky glow (roofs.js's band) follows the evening
  // every frame, from its warm, strong sunset to its rose, weaker dusk.
  it('the sky glow moves from its sunset colour to its dusk colour, each channel one way', () => {
    const sunset = [1.1, 0.8, 0.55];
    const dusk = [0.5, 0.3, 0.42];
    const w = walk();
    const glow = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    glow.userData.skyGlow = { sunset, dusk };
    const area = { ...w.area, skyGlow: glow };
    const life = createRoofsLife(area)({ scene: w.scene, sun: w.sun, fill: w.fill });
    const c = glow.material.color;
    const same = c; // set in place, never replaced
    expect([c.r, c.g, c.b].map((v) => +v.toFixed(6))).toEqual(sunset);
    let last = [c.r, c.g, c.b];
    let t = 0;
    for (let k = 0; k < 300; k++) {
      life.update(1);
      t += 1;
      const now = [c.r, c.g, c.b];
      for (let i = 0; i < 3; i++) {
        const want = sunset[i] + (dusk[i] - sunset[i]) * eveningAt(t);
        expect(now[i]).toBeCloseTo(want, 6);
        // never back the way it came
        expect(Math.sign(dusk[i] - sunset[i]) * (now[i] - last[i])).toBeGreaterThanOrEqual(-1e-9);
      }
      last = now;
    }
    expect([c.r, c.g, c.b].map((v) => +v.toFixed(6))).toEqual(dusk);
    expect(glow.material.color).toBe(same);
    // a record without a glow (the tests' plain area) still runs
    expect(() => run(w, 10)).not.toThrow();
  });

  // Beauty pass, Task D: the take-off glows are stronger on the sunlit felt
  // at sunset and fade to a soft hint by dusk, every frame, one way.
  it('the take-off glows fade from their sunset opacity to their dusk one, never back', () => {
    const w = walk();
    const marks = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.26 }));
    marks.userData.glowOpacity = { sunset: 0.42, dusk: 0.26 };
    const life = createRoofsLife({ ...w.area, markGlow: marks })({ scene: w.scene, sun: w.sun, fill: w.fill });
    const mat = marks.material;
    expect(mat.opacity).toBeCloseTo(0.42, 9);
    let last = mat.opacity;
    for (let t = 1; t <= 300; t++) {
      life.update(1);
      expect(mat.opacity).toBeCloseTo(0.42 + (0.26 - 0.42) * eveningAt(t), 9);
      expect(mat.opacity).toBeLessThanOrEqual(last + 1e-12);
      last = mat.opacity;
    }
    expect(mat.opacity).toBeCloseTo(0.26, 9);
    expect(marks.material).toBe(mat);
  });

  it('update allocates nothing between sky steps', () => {
    const w = walk();
    run(w, 1);
    const calls = skyBackground.mock.calls.length;
    const bg = w.scene.background;
    const fog = w.scene.fog;
    const fogColor = fog.color;
    const pos = w.bus.position;
    // inside the first step (it ends at eveningAt(t) = 1/6)
    run(w, 30);
    expect(eveningAt(30)).toBeLessThan(1 / EVENING_STEPS);
    expect(skyBackground.mock.calls.length).toBe(calls);
    expect(w.scene.background).toBe(bg);
    expect(w.scene.fog).toBe(fog);
    expect(w.scene.fog.color).toBe(fogColor);
    expect(w.bus.position).toBe(pos);
    // the fog and the light did move, on the same objects
    expect(fogColor.getHex()).not.toBe(SUNSET.horizon);
    w.life.dispose();
  });
});

describe('the picture times', () => {
  it('the card is taken at sunset, the edge at full dusk, every time names a shot', () => {
    expect(Object.isFrozen(ROOFS_SHOT_T)).toBe(true);
    for (const name of Object.keys(ROOFS_SHOT_T)) expect(ROOFS_SHOTS[name]).toBeDefined();
    const at = (t) => { const w = walk(); run(w, t); return w; };
    const card = at(ROOFS_SHOT_T.card);
    expect(eveningAt(ROOFS_SHOT_T.card)).toBeLessThan(0.05);
    expect(skyBackground).toHaveBeenLastCalledWith(SUNSET.top, SUNSET.horizon);
    expect(card.scene.fog.color.getHex()).toBe(SUNSET.horizon);
    expect(card.sun.intensity).toBeGreaterThan(0.8 * 1.7);
    const edge = at(ROOFS_SHOT_T.edge);
    expect(eveningAt(ROOFS_SHOT_T.edge)).toBe(1);
    expect(skyBackground).toHaveBeenLastCalledWith(DUSK.top, DUSK.horizon);
    expect(edge.scene.fog.color.getHex()).toBe(DUSK.horizon);
    expect(edge.sun.intensity).toBeCloseTo(0.8, 6);
  });
});

// Rooftops step 3, Task 3: the life makes the flock (roofsbirds.js) where the
// place has bird perches. These perches are the plan's, with SYNTHETIC drawn
// spots standing in for roofs.js's at the roster's drawn homes
// (test/roofsbirds.test.js has the built place's).
describe('the Rooftops’ flock, in the life', () => {
  const ground = createGround(ROOFS_GROUND);
  const plain = perchIndex(flockPerches({ traversal: ROOFS_TRAVERSAL, ground }));
  const drawn = ROOFS_BIRDS.filter((b) => !plain.has(b.home)).map((b, k) => ({
    id: b.home, kind: b.home.split(':')[0], x: 30 + 3 * k, y: 11.67, z: -40,
  }));
  const birdPerches = flockPerches({ traversal: ROOFS_TRAVERSAL, ground, drawn });
  const withFlock = () => {
    const scene = new THREE.Scene();
    scene.background = { isTexture: true, dispose: vi.fn() };
    scene.fog = new THREE.Fog(DUSK.horizon, 40, 140);
    const area = { skySunset: { ...SUNSET }, skyDusk: { ...DUSK }, bus: new THREE.Object3D(), birdPerches };
    return { scene, area };
  };
  const added = (scene, before) => scene.children.filter((c) => !before.includes(c));

  it('the life makes the flock when the place has bird perches, and takes it away', () => {
    const { scene, area } = withFlock();
    const before = [...scene.children];
    const life = createRoofsLife(area)({ scene, sun: { intensity: 0.8 }, fill: { intensity: 0.5 }, critters: null, visits: 0, reducedMotion: false });
    const mine = added(scene, before);
    expect(mine.map((m) => m.name).sort()).toEqual(['roofsFlock', 'roofsFlockWings']);
    const disposed = new Set();
    for (const m of mine) {
      m.geometry.addEventListener('dispose', () => disposed.add(m.geometry));
      m.material.addEventListener('dispose', () => disposed.add(m.material));
    }
    // it passes her spot on: a pigeon she stands by turns to face her
    const flock = mine.find((m) => m.name === 'roofsFlock');
    const i = ROOFS_BIRDS.findIndex((b) => b.id === 'pigeon-1');
    const home = perchIndex(birdPerches).get(ROOFS_BIRDS[i].home);
    const cat = new THREE.Vector3(home.x + 3, home.y, home.z);
    for (let k = 0; k < 90; k++) life.update(1 / 60, 1000 + k, cat, null);
    const m = new THREE.Matrix4();
    flock.getMatrixAt(i, m);
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(m);
    expect(fwd.x).toBeGreaterThan(0.99);
    life.dispose();
    expect(scene.children).toEqual(before);
    expect(disposed.size).toBe(4);
    // a place with no bird perches (every older test's fake area) has no flock
    const { scene: s2, area: a2 } = withFlock();
    delete a2.birdPerches;
    const n = s2.children.length;
    const life2 = createRoofsLife(a2)({ scene: s2, sun: { intensity: 0.8 }, fill: { intensity: 0.5 } });
    life2.update(1 / 60, 0, cat, null);
    expect(s2.children.length).toBe(n);
    life2.dispose();
  });

  it('the life adds at most three meshes, no casters, under 1,600 triangles', () => {
    const { scene, area } = withFlock();
    const before = [...scene.children];
    const life = createRoofsLife(area)({ scene, sun: { intensity: 0.8 }, fill: { intensity: 0.5 }, critters: null, visits: 0, reducedMotion: false });
    let meshes = 0;
    let tris = 0;
    for (const o of added(scene, before)) {
      o.traverse((m) => {
        if (!m.isMesh) return;
        meshes++;
        expect(m.castShadow, m.name).toBe(false);
        expect(m.userData.noCast, m.name).toBe(true);
        const g = m.geometry;
        tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (m.isInstancedMesh ? m.count : 1);
      });
    }
    expect(meshes).toBe(2); // the flock and its wings (Task 5's smoke makes three)
    expect(meshes).toBeLessThanOrEqual(3);
    expect(tris).toBeLessThan(1600);
    life.dispose();
  });
});

// Rooftops step 3, Task 5: the washing's clock and the smoke (roofsair.js).
describe('what the wind moves, in the life', () => {
  it('the washing swings with walk time, and holds its lean under reduced motion', async () => {
    const { makeWashMaterial, WASH } = await import('../src/world/roofsair.js');
    for (const reducedMotion of [false, true]) {
      const w = walk();
      const washSway = makeWashMaterial(new THREE.MeshStandardMaterial());
      const life = createRoofsLife({ ...w.area, washSway })({ scene: w.scene, sun: w.sun, fill: w.fill, reducedMotion });
      expect(washSway.uWashT.value).toBe(0);
      let sum = 0;
      for (const dt of [1 / 60, 1 / 30, 0.5, 1 / 24, 2]) {
        life.update(dt, 5000 + sum); // the app's clock is not the walk's
        sum += dt;
        expect(washSway.uWashT.value).toBeCloseTo(sum, 12);
        expect(washSway.uWashAmp.value).toBe(reducedMotion ? 0 : WASH.amp);
        expect(washSway.uWashRest.value).toBe(WASH.rest);
      }
      life.dispose();
    }
  });

  it('the life makes the smoke and takes it away', async () => {
    const { SMOKE, puffAt } = await import('../src/world/roofsair.js');
    const ground = createGround(ROOFS_GROUND);
    const plain = perchIndex(flockPerches({ traversal: ROOFS_TRAVERSAL, ground }));
    const drawn = ROOFS_BIRDS.filter((b) => !plain.has(b.home)).map((b, k) => ({
      id: b.home, kind: b.home.split(':')[0], x: 30 + 3 * k, y: 11.67, z: -40,
    }));
    const smokePots = [{ id: 'pot:a', x: -10, y: 8.72, z: 6.95 }, { id: 'pot:b', x: 10, y: 8.57, z: 8.05 }, { id: 'pot:c', x: -29.75, y: 8.66, z: 8.05 }];
    const scene = new THREE.Scene();
    scene.background = { isTexture: true, dispose: vi.fn() };
    scene.fog = new THREE.Fog(DUSK.horizon, 40, 140);
    const area = { skySunset: { ...SUNSET }, skyDusk: { ...DUSK }, bus: new THREE.Object3D(), birdPerches: flockPerches({ traversal: ROOFS_TRAVERSAL, ground, drawn }), smokePots };
    const before = [...scene.children];
    const life = createRoofsLife(area)({ scene, sun: { intensity: 0.8 }, fill: { intensity: 0.5 }, critters: null, visits: 0, reducedMotion: false });
    const mine = scene.children.filter((c) => !before.includes(c));
    expect(mine.map((m) => m.name).sort()).toEqual(['roofsFlock', 'roofsFlockWings', 'roofsSmoke']);
    // the life's totals: three meshes, no casters, under 1,600 triangles
    let tris = 0;
    for (const m of mine) {
      expect(m.castShadow, m.name).toBe(false);
      expect(m.userData.noCast, m.name).toBe(true);
      const g = m.geometry;
      tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * m.count;
    }
    expect(tris).toBeLessThan(1600);
    // the smoke runs on walk time
    const smoke = mine.find((m) => m.name === 'roofsSmoke');
    expect(smoke.count).toBe(3 * SMOKE.perPot);
    for (let k = 0; k < 30; k++) life.update(0.1, 900 + k);
    const at = new THREE.Vector3();
    const m4 = new THREE.Matrix4();
    smoke.getMatrixAt(SMOKE.perPot + 2, m4);
    at.setFromMatrixPosition(m4);
    const want = puffAt(smokePots[1], 2, 3, {});
    expect(at.x).toBeCloseTo(want.x, 4);
    expect(at.y).toBeCloseTo(want.y, 4);
    expect(at.z).toBeCloseTo(want.z, 4);
    const disposed = new Set();
    smoke.geometry.addEventListener('dispose', () => disposed.add('geometry'));
    smoke.material.addEventListener('dispose', () => disposed.add('material'));
    life.dispose();
    expect(scene.children).toEqual(before);
    expect(disposed.size).toBe(2);
    // a place without smoking pots has no smoke
    const s2 = new THREE.Scene();
    s2.background = { isTexture: true, dispose: vi.fn() };
    const life2 = createRoofsLife({ skySunset: { ...SUNSET }, skyDusk: { ...DUSK } })({ scene: s2, sun: { intensity: 0.8 }, fill: { intensity: 0.5 } });
    expect(s2.children).toHaveLength(0);
    life2.dispose();
  });
});
