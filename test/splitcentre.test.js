import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { midpoint, lightOffset, shadowSplitFit, shadowScale, skyShift, SHADOW_MAX_MUL } from '../src/coop/splitcentre.js';
import { lightBasis } from '../src/render/shadowfit.js';
import { createSplitSys } from '../src/coop/splitsys.js';

const sunDir = new THREE.Vector3(0.7, 0.35, 0.6).normalize();
const basis = lightBasis(sunDir);

describe('splitcentre maths', () => {
  it('midpoint and sky shift', () => {
    expect(midpoint({ x: 0, z: 0 }, { x: 10, z: -4 })).toEqual({ x: 5, z: -2 });
    expect(skyShift({ x: 7, z: 3 }, { x: 2, z: 5 })).toEqual({ x: 5, z: -2 });
  });
  it('two cats at one spot keep the one-view radius', () => {
    const f = shadowSplitFit({ x: 4, z: 4 }, { x: 4, z: 4 }, basis, 20);
    expect(f.radius).toBe(20);
    expect(f.covered).toBe(true);
  });
  it('the radius grows by half the light-space separation, and the box centres on the midpoint', () => {
    const f = shadowSplitFit({ x: 0, z: 0 }, { x: 20, z: 0 }, basis, 20);
    const o = lightOffset(basis, -20, 0);
    expect(f.radius).toBeCloseTo(20 + Math.max(Math.abs(o.x), Math.abs(o.y)) / 2, 6);
    expect(f.x).toBe(10);
    expect(f.z).toBe(0);
  });
  it('is symmetric in the two views and capped, with covered false past the cap', () => {
    const a = { x: -80, z: 5 }; const b = { x: 90, z: -30 };
    const ab = shadowSplitFit(a, b, basis, 20); const ba = shadowSplitFit(b, a, basis, 20);
    expect(ab).toEqual(ba);
    expect(ab.radius).toBeLessThanOrEqual(20 * SHADOW_MAX_MUL);
    expect(ab.covered).toBe(false);
    expect(shadowSplitFit({ x: 0, z: 0 }, { x: 30, z: 0 }, basis, 20).covered).toBe(true);
  });
  it('shadowScale keeps the bias at 0.7 texels and the penumbra at its world width', () => {
    const s = shadowScale(30, 20);
    expect(s.normalBiasK).toBeCloseTo(1.5);
    expect(s.pcfRadiusK * s.texelK).toBeCloseTo(1);
  });
});

function fakeRenderer() { return { shadowMap: { enabled: true, autoUpdate: true, needsUpdate: false } }; }
function fakeSun(radius = 20) {
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.position.set(70, 35, 60);
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius; c.updateProjectionMatrix();
  sun.shadow.normalBias = 0.014; sun.shadow.radius = 2;
  return sun;
}
const cam = (x, z) => { const c = new THREE.PerspectiveCamera(60, 1, 0.1, 300); c.position.set(x, 3, z); c.lookAt(x, 0, z - 10); c.updateMatrixWorld(); return c; };

describe('splitsys frame', () => {
  it('fits one bigger shadow map, draws it once, and restores everything after the last view', () => {
    const renderer = fakeRenderer();
    const scene = new THREE.Scene(); const sun = fakeSun(); scene.add(sun);
    const log = [];
    const session = {
      scene,
      grass: { view: (i, c) => log.push(['grass', i, c.position.x]) },
      clouds: { view: (c) => log.push(['clouds', c.position.x]) },
      weather: { view: (c) => log.push(['rain', c.position.x]) },
      ambient: { setSecond: (c, p) => log.push(['ambient', p.x]) },
      treeFade: { setSecond: (c, l) => log.push(['fade', l.x]) },
      stripTiles: { setSecond: (x, z) => log.push(['strips', x, z]) },
    };
    const sys = createSplitSys({ renderer });
    const cams = [cam(0, 0), cam(40, 10)];
    sys.beginFrame(session, cams, [{ x: 0, y: 0, z: -4 }, { x: 40, y: 0, z: 6 }]);
    expect(log.map((l) => l[0])).toEqual(['strips', 'ambient', 'fade']);
    expect(sun.shadow.camera.right).toBeGreaterThan(20);
    expect(renderer.shadowMap.autoUpdate).toBe(false);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    expect(sun.shadow.normalBias).toBeGreaterThan(0.014);
    sys.beforeView(0, cams[0], null, session); sys.afterView();
    expect(sun.shadow.camera.right).toBeGreaterThan(20); // still fitted for view 1
    sys.beforeView(1, cams[1], null, session); sys.afterView();
    expect(sun.shadow.camera.right).toBe(20);
    expect(sun.shadow.normalBias).toBe(0.014);
    expect(sun.shadow.radius).toBe(2);
    expect(renderer.shadowMap.autoUpdate).toBe(true);
    expect(log.filter((l) => l[0] === 'grass').map((l) => [l[1], l[2]])).toEqual([[0, 0], [1, 40], [0, 0]]);
    expect(log.filter((l) => l[0] === 'clouds').map((l) => l[1])).toEqual([0, 40, 0]);
    // the light sits over the midpoint of the two fit centres, not over cat one
    expect(Math.abs(sun.target.position.x - 20)).toBeLessThan(25);
  });

  it('leaves shadows alone when the sun casts none (the lite rung) or the pass is stopped', () => {
    const renderer = fakeRenderer();
    const scene = new THREE.Scene(); const sun = fakeSun(); sun.castShadow = false; scene.add(sun);
    const sys = createSplitSys({ renderer });
    const cams = [cam(0, 0), cam(40, 10)];
    sys.beginFrame({ scene }, cams, [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 6 }]);
    expect(renderer.shadowMap.autoUpdate).toBe(true);
    expect(sun.shadow.camera.right).toBe(20);
    sys.afterView(); sys.afterView();
  });
});
