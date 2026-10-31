import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  ZOOM_STEPS, DEFAULT_ZOOM_STEP, MAX_ZOOM_STEP, DEN_MAX_ZOOM_STEP, MIN_CAMERA_Y,
  clampZoomStep, maxZoomStep, zoomView, easeZoomLevel,
  keyZoomDir, zoomActionDir, createWheelStepper, createPinchTracker, createZoomControl,
  cameraPullScale,
} from '../src/camzoom.js';
import { cameraOffset } from '../src/catcam.js';
import { createPlayer } from '../src/player.js';
import { createSettings } from '../src/settings.js';

// createPlayer registers its key/pointer-lock listeners on `document`.
vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

describe('zoom steps', () => {
  it('has four steps from close to far, and the default is today\'s camera (4.5 back, 2.2 up)', () => {
    expect(ZOOM_STEPS).toHaveLength(4);
    expect(ZOOM_STEPS[DEFAULT_ZOOM_STEP]).toEqual({ dist: 4.5, height: 2.2 });
    expect(ZOOM_STEPS[0].dist).toBeCloseTo(3, 5);
    expect(ZOOM_STEPS[MAX_ZOOM_STEP].dist).toBeGreaterThanOrEqual(10);
    expect(ZOOM_STEPS[MAX_ZOOM_STEP].dist).toBeLessThanOrEqual(12);
  });

  it('distance and height both rise every step, height faster, so the far view tilts down', () => {
    for (let i = 1; i < ZOOM_STEPS.length; i++) {
      expect(ZOOM_STEPS[i].dist).toBeGreaterThan(ZOOM_STEPS[i - 1].dist);
      expect(ZOOM_STEPS[i].height).toBeGreaterThan(ZOOM_STEPS[i - 1].height);
    }
    const tilt = (s) => s.height / s.dist;
    expect(tilt(ZOOM_STEPS[MAX_ZOOM_STEP])).toBeGreaterThan(tilt(ZOOM_STEPS[DEFAULT_ZOOM_STEP]));
  });

  it('zoomView returns each step exactly, interpolates between, and clamps both ends', () => {
    for (let i = 0; i < ZOOM_STEPS.length; i++) expect(zoomView(i)).toEqual({ ...ZOOM_STEPS[i] });
    const half = zoomView(1.5);
    expect(half.dist).toBeCloseTo((ZOOM_STEPS[1].dist + ZOOM_STEPS[2].dist) / 2);
    expect(half.height).toBeCloseTo((ZOOM_STEPS[1].height + ZOOM_STEPS[2].height) / 2);
    expect(zoomView(-3)).toEqual({ ...ZOOM_STEPS[0] });
    expect(zoomView(42)).toEqual({ ...ZOOM_STEPS[MAX_ZOOM_STEP] });
    expect(zoomView(NaN)).toEqual({ ...ZOOM_STEPS[DEFAULT_ZOOM_STEP] });
  });

  it('clampZoomStep keeps steps whole and in range; junk becomes the default', () => {
    expect(clampZoomStep(-1)).toBe(0);
    expect(clampZoomStep(9)).toBe(MAX_ZOOM_STEP);
    expect(clampZoomStep(2.4)).toBe(2);
    for (const junk of [undefined, null, 'far', NaN, Infinity, {}]) expect(clampZoomStep(junk)).toBe(DEFAULT_ZOOM_STEP);
  });

  it('the den caps zoom at the default step; outdoor areas allow the far step', () => {
    expect(DEN_MAX_ZOOM_STEP).toBe(DEFAULT_ZOOM_STEP);
    expect(maxZoomStep(true)).toBe(DEFAULT_ZOOM_STEP);
    expect(maxZoomStep(false)).toBe(MAX_ZOOM_STEP);
    expect(clampZoomStep(MAX_ZOOM_STEP, maxZoomStep(true))).toBe(DEFAULT_ZOOM_STEP);
    expect(clampZoomStep(0, maxZoomStep(true))).toBe(0); // closer is fine indoors
  });
});

describe('easeZoomLevel', () => {
  it('gets most of the way in about a quarter second and lands exactly', () => {
    let l = 1;
    for (let t = 0; t < 0.25; t += 1 / 60) l = easeZoomLevel(l, 3, 1 / 60);
    expect(l).toBeGreaterThan(2.9);
    for (let i = 0; i < 60; i++) l = easeZoomLevel(l, 3, 1 / 60);
    expect(l).toBe(3);
  });

  it('is instant under reduced motion', () => {
    expect(easeZoomLevel(1, 3, 1 / 60, true)).toBe(3);
    expect(easeZoomLevel(3, 0, 0, true)).toBe(0);
  });
});

describe('zoom inputs step the right way (-1 in/closer, +1 out/farther)', () => {
  it('keys: + and = zoom in, − zooms out, numpad too, everything else nothing', () => {
    expect(keyZoomDir('Equal')).toBe(-1);
    expect(keyZoomDir('NumpadAdd')).toBe(-1);
    expect(keyZoomDir('Minus')).toBe(1);
    expect(keyZoomDir('NumpadSubtract')).toBe(1);
    for (const c of ['KeyE', 'KeyC', 'Digit1', 'Space', 'ArrowUp', '', undefined]) expect(keyZoomDir(c)).toBe(0);
  });

  it('touch buttons: zoomIn and zoomOut', () => {
    expect(zoomActionDir('zoomIn')).toBe(-1);
    expect(zoomActionDir('zoomOut')).toBe(1);
    expect(zoomActionDir('pounce')).toBe(0);
  });

  it('wheel: one mouse notch is one step; up zooms in, down zooms out', () => {
    const w = createWheelStepper();
    expect(w(-100, 0, 0)).toBe(-1);
    expect(w(100, 0, 1000)).toBe(1);
    expect(w(3, 1, 2000)).toBe(1); // Firefox line mode: 3 lines down
  });

  it('wheel: a trackpad\'s small deltas add up to one step, and momentum cannot fire a second', () => {
    const w = createWheelStepper();
    const fired = [];
    // 40 deltas of 10px over 400ms: one 100px notch's worth, then cooldown/
    // momentum. Without the cooldown this would be four steps.
    for (let i = 0; i < 40; i++) {
      const d = w(10, 0, i * 10);
      if (d) fired.push(d);
    }
    expect(fired.length).toBeLessThanOrEqual(2);
    expect(fired[0]).toBe(1);
    expect(w(5, 0, 2000)).toBe(0); // a tiny nudge after a pause does nothing
  });

  it('pinch: fingers apart zooms in, together zooms out, one step per 30% change', () => {
    const p = createPinchTracker();
    p.start(100);
    expect(p.move(110)).toBe(0);
    expect(p.move(135)).toBe(-1);
    expect(p.move(140)).toBe(0); // baseline moved to 135
    expect(p.move(180)).toBe(-1);
    expect(p.move(130)).toBe(1);
    p.start(0);
    expect(p.move(500)).toBe(0); // no baseline, no step
  });
});

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe('createZoomControl', () => {
  function setup(den = false) {
    const settings = createSettings(fakeStorage());
    const player = { setCameraZoom: vi.fn() };
    const onCapped = vi.fn();
    const ctl = createZoomControl({ settings, player, isDen: () => den, onCapped });
    return { settings, player, onCapped, ctl };
  }

  it('steps out and in, saves the step in settings, and hands it to the player', () => {
    const { settings, player, ctl } = setup();
    expect(ctl.step(1)).toBe(2);
    expect(ctl.step(1)).toBe(3);
    expect(ctl.step(1)).toBe(3); // already farthest
    expect(settings.get('cameraZoom')).toBe(3);
    expect(player.setCameraZoom).toHaveBeenLastCalledWith(3);
    expect(player.setCameraZoom).toHaveBeenCalledTimes(2);
    ctl.step(-1); ctl.step(-1); ctl.step(-1); ctl.step(-1);
    expect(settings.get('cameraZoom')).toBe(0);
  });

  it('in the den, zooming out past the default does nothing but say why', () => {
    const { settings, player, onCapped, ctl } = setup(true);
    expect(ctl.step(1)).toBe(DEFAULT_ZOOM_STEP);
    expect(onCapped).toHaveBeenCalledTimes(1);
    expect(player.setCameraZoom).not.toHaveBeenCalled();
    expect(ctl.step(-1)).toBe(0);
    expect(settings.get('cameraZoom')).toBe(0);
  });

  it('ignores anything that is not a single step', () => {
    const { ctl, player } = setup();
    expect(ctl.step(0)).toBe(null);
    expect(ctl.step(2)).toBe(null);
    expect(player.setCameraZoom).not.toHaveBeenCalled();
  });
});

describe('cameraPullScale', () => {
  const cat = { x: 0, y: 0, z: 0 };
  const far = ZOOM_STEPS[MAX_ZOOM_STEP];

  it('never touches the default or closer camera', () => {
    const off = { x: 0, y: 3, z: 4.5 };
    const wall = [{ x: 0, z: 4.5, r: 3.4 }];
    expect(cameraPullScale(cat, off, { dist: 4.5, colliders: wall, bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 } })).toBe(1);
    expect(cameraPullScale(cat, off, { dist: 3, colliders: wall })).toBe(1);
  });

  it('keeps a far camera no farther past the map edge than the default camera could go', () => {
    const off = { x: 0, y: 8, z: 11 };
    const bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 2 };
    const s = cameraPullScale(cat, off, { dist: far.dist, bounds });
    expect(cat.z + off.z * s).toBeCloseTo(2 + 4.5);
  });

  it('pulls a far camera out of a house footprint, but not closer than the default', () => {
    const off = { x: 0, y: 8, z: 11 };
    const house = { x: 0, z: 10, r: 3.4 }; // camera point (0, 11) is inside it
    const s = cameraPullScale(cat, off, { dist: far.dist, colliders: [house] });
    const z = off.z * s;
    expect(z).toBeLessThan(10 - 3.4);
    expect(z).toBeGreaterThanOrEqual(4.5 - 1e-9);
    // a big footprint starting right behind the cat still leaves the default distance
    const near = cameraPullScale(cat, off, { dist: far.dist, colliders: [{ x: 0, z: 8, r: 6 }] });
    expect(off.z * near).toBeCloseTo(4.5);
  });

  it('ignores small props (cars, crates) and a building the cat is perched on', () => {
    const off = { x: 0, y: 8, z: 11 };
    expect(cameraPullScale(cat, off, { dist: far.dist, colliders: [{ x: 0, z: 11, r: 1.8 }] })).toBe(1);
    expect(cameraPullScale(cat, off, { dist: far.dist, colliders: [{ x: 0, z: 2, r: 9.5 }] })).toBe(1);
  });
});

describe('player camera zoom', () => {
  function harness({ reducedMotion = false } = {}) {
    const camera = new THREE.PerspectiveCamera();
    const player = createPlayer(camera, { addEventListener() {} });
    const cat = new THREE.Object3D();
    player.setAvatar(cat, 3);
    player.setReducedMotion(reducedMotion);
    player.enable();
    return { camera, player, cat };
  }

  it('at the default step the camera sits exactly where it always did', () => {
    const { camera, player } = harness();
    player.setCameraZoom(DEFAULT_ZOOM_STEP, { instant: true });
    player.update(1 / 60, [{ x: 0, z: 4, r: 3.4 }], { minX: -1, maxX: 1, minZ: -1, maxZ: 1 });
    const expected = cameraOffset(0, 0.18);
    expect(camera.position.x).toBeCloseTo(expected.x, 9);
    expect(camera.position.y).toBeCloseTo(expected.y, 9);
    expect(camera.position.z).toBeCloseTo(expected.z, 9);
  });

  it('eases to a new step over about a quarter second', () => {
    const { camera, player } = harness();
    player.setCameraZoom(DEFAULT_ZOOM_STEP, { instant: true });
    player.setCameraZoom(MAX_ZOOM_STEP);
    player.update(1 / 60);
    const mid = camera.position.z;
    expect(mid).toBeGreaterThan(cameraOffset(0, 0.18).z);
    expect(mid).toBeLessThan(cameraOffset(0, 0.18, far().dist, far().height).z - 1);
    for (let i = 0; i < 30; i++) player.update(1 / 60);
    expect(player.cameraZoomLevel).toBe(MAX_ZOOM_STEP);
    expect(camera.position.z).toBeCloseTo(cameraOffset(0, 0.18, far().dist, far().height).z, 6);
  });

  it('under reduced motion a new step is instant', () => {
    const { camera, player } = harness({ reducedMotion: true });
    player.setCameraZoom(MAX_ZOOM_STEP);
    expect(player.cameraZoomLevel).toBe(MAX_ZOOM_STEP);
    player.update(1 / 60);
    expect(camera.position.z).toBeCloseTo(cameraOffset(0, 0.18, far().dist, far().height).z, 6);
  });

  it('never puts the camera under the ground', () => {
    const { camera, player } = harness({ reducedMotion: true });
    player.addOrbit(0, -10000); // pitch to its lowest
    for (let s = 0; s <= MAX_ZOOM_STEP; s++) {
      player.setCameraZoom(s);
      player.update(1 / 60);
      expect(camera.position.y).toBeGreaterThanOrEqual(MIN_CAMERA_Y);
    }
  });

  function far() { return ZOOM_STEPS[MAX_ZOOM_STEP]; }
});
