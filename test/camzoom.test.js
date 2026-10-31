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
  it('keys: + and = zoom in, - zooms out, by character first, key position second', () => {
    expect(keyZoomDir('=', 'Equal')).toBe(-1);
    expect(keyZoomDir('+', 'Equal')).toBe(-1);
    expect(keyZoomDir('-', 'Minus')).toBe(1);
    // German layout: + and - live on BracketRight and Slash
    expect(keyZoomDir('+', 'BracketRight')).toBe(-1);
    expect(keyZoomDir('-', 'Slash')).toBe(1);
    // numpad and a dead key fall back to the position
    expect(keyZoomDir('+', 'NumpadAdd')).toBe(-1);
    expect(keyZoomDir(undefined, 'NumpadSubtract')).toBe(1);
    expect(keyZoomDir('Dead', 'Equal')).toBe(-1);
    for (const [k, c] of [['e', 'KeyE'], ['c', 'KeyC'], ['1', 'Digit1'], [' ', 'Space'], ['ArrowUp', 'ArrowUp'], ['', ''], [undefined, undefined]]) {
      expect(keyZoomDir(k, c)).toBe(0);
    }
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

  it('wheel: a whole trackpad flick with its momentum tail is exactly one step', () => {
    const w = createWheelStepper();
    let steps = 0;
    // 2 s of events every 16 ms: a fast start decaying to a 1 px tail.
    for (let i = 0; i < 125; i++) {
      const d = Math.max(1, Math.round(60 * Math.exp(-i / 25)));
      if (w(d, 0, i * 16)) steps++;
    }
    expect(steps).toBe(1);
    // Small finger twitches never step.
    const v = createWheelStepper();
    expect(v(2, 0, 0) || v(-2, 0, 500) || v(3, 0, 1000)).toBe(0);
  });

  it('wheel: slow notches under 100 px, far apart, step once each', () => {
    const w = createWheelStepper();
    const got = [0, 400, 800, 1200].map((t) => w(-50, 0, t));
    expect(got).toEqual([-1, -1, -1, -1]);
    // ...and a direction change on the next notch works too
    expect(w(50, 0, 1600)).toBe(1);
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

  it('a held pinch-out in the den shows the toast once, not on every step', () => {
    let t = 0;
    const settings = createSettings(fakeStorage());
    const onCapped = vi.fn();
    const ctl = createZoomControl({ settings, player: { setCameraZoom() {} }, isDen: () => true, onCapped, now: () => t });
    for (let i = 0; i < 10; i++) { ctl.step(1); t += 100; }
    expect(onCapped).toHaveBeenCalledTimes(1);
    t += 3000;
    ctl.step(1);
    expect(onCapped).toHaveBeenCalledTimes(2);
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
    expect(cameraPullScale(cat, off, 4.5, wall, { minX: -1, maxX: 1, minZ: -1, maxZ: 1 })).toBe(1);
    expect(cameraPullScale(cat, off, 3, wall, null)).toBe(1);
  });

  it('keeps a far camera no farther past the map edge than the default camera could go', () => {
    const off = { x: 0, y: 8, z: 11 };
    const bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 2 };
    const s = cameraPullScale(cat, off, far.dist, [], bounds);
    expect(cat.z + off.z * s).toBeCloseTo(2 + 4.5);
  });

  it('pulls a far camera out of a house footprint, but not closer than the default', () => {
    const off = { x: 0, y: 8, z: 11 };
    const house = { x: 0, z: 10, r: 3.4 }; // camera point (0, 11) is inside it
    const s = cameraPullScale(cat, off, far.dist, [house], null);
    const z = off.z * s;
    expect(z).toBeLessThan(10 - 3.4);
    expect(z).toBeGreaterThanOrEqual(4.5 - 1e-9);
    // a big footprint starting right behind the cat still leaves the default distance
    const near = cameraPullScale(cat, off, far.dist, [{ x: 0, z: 8, r: 6 }], null);
    expect(off.z * near).toBeCloseTo(4.5);
  });

  it('pulls in for a house wholly BETWEEN the cat and the camera, not only one the camera is inside', () => {
    const off = { x: 0, y: 8, z: 11 };
    const house = { x: 0, z: 6, r: 3.4 }; // spans z 2.6..9.4; camera point (11) is clear of it
    const s = cameraPullScale(cat, off, far.dist, [house], null);
    // The entry point (2.6 m) is closer than the default distance, and the
    // pull never goes inside the default, so the camera comes in to 4.5 m.
    expect(off.z * s).toBeCloseTo(4.5);
    // With the house farther out the camera stops just short of its wall.
    const s2 = cameraPullScale(cat, off, far.dist, [{ x: 0, z: 9.5, r: 2 }], null);
    expect(off.z * s2).toBeCloseTo(7.5 - 0.4);
    // a house beside the line (well clear of it) does nothing
    expect(cameraPullScale(cat, off, far.dist, [{ x: 8, z: 6, r: 3.4 }], null)).toBe(1);
  });

  it('the limit is continuous as the line sweeps onto a footprint (no jump at the tangent)', () => {
    const off = { x: 0, y: 8, z: 11 };
    // Slide the house sideways across the line. A real jump would stay the
    // same size however fine the slide; a continuous limit shrinks with it.
    const maxJump = (step) => {
      let prev = null;
      let m = 0;
      for (let x = 8; x >= -8; x -= step) {
        const s = cameraPullScale(cat, off, far.dist, [{ x, z: 8, r: 2 }], null);
        if (prev !== null) m = Math.max(m, Math.abs(s - prev) * off.z);
        prev = s;
      }
      return m;
    };
    expect(maxJump(0.001)).toBeLessThan(0.08);
    expect(maxJump(0.0001)).toBeLessThan(0.025);
  });

  it('ignores small props (cars, crates) and a building the cat is perched on', () => {
    const off = { x: 0, y: 8, z: 11 };
    expect(cameraPullScale(cat, off, far.dist, [{ x: 0, z: 11, r: 1.8 }], null)).toBe(1);
    expect(cameraPullScale(cat, off, far.dist, [{ x: 0, z: 2, r: 9.5 }], null)).toBe(1);
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

  it('walking past a house at the far step, the camera never jumps', () => {
    const { camera, player, cat } = harness();
    player.setCameraZoom(MAX_ZOOM_STEP, { instant: true });
    const house = [{ x: 0, z: 6, r: 3.4 }];
    cat.position.set(-12, 0, 0);
    player.update(1 / 60, house);
    let prevDist = Math.hypot(camera.position.x - cat.position.x, camera.position.z - cat.position.z);
    let maxJump = 0;
    let minDist = Infinity;
    // The cat walks 24 m along x at 3.5 m/s; the camera stays at yaw 0 (+z).
    for (let i = 0; i < 412; i++) {
      cat.position.x += 3.5 / 60;
      player.update(1 / 60, house);
      const d = Math.hypot(camera.position.x - cat.position.x, camera.position.z - cat.position.z);
      maxJump = Math.max(maxJump, Math.abs(d - prevDist));
      minDist = Math.min(minDist, d);
      prevDist = d;
    }
    expect(minDist).toBeLessThan(6); // it did pull in while the house was in the way
    expect(maxJump).toBeLessThan(0.25); // ...without ever jumping
  });

  function far() { return ZOOM_STEPS[MAX_ZOOM_STEP]; }
});
