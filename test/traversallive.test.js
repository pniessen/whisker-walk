import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Headless document stub, shared by every describe in this file (the same one test/flattrace.test.js uses).
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
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const { createPlayer } = await import('../src/player.js');
const { moveVector, moveDirection, MOVE_KEYS } = await import('../src/catcam.js');
const { stickToWorld } = await import('../src/traversal.js');

describe('the stick, read without the camera turn', () => {
  it('moveVector is moveDirection at yaw 0, into its out', () => {
    const [U, D, L, R] = [MOVE_KEYS.up[0], MOVE_KEYS.down[0], MOVE_KEYS.left[0], MOVE_KEYS.right[0]];
    const combos = [[U], [D], [L], [R], [U, L], [U, R], [D, L], [D, R]];
    for (const c of combos) {
      const keys = new Set(c);
      const want = moveDirection(keys, 0);
      const out = { x: 9, z: 9 };
      expect(moveVector(keys, out)).toBe(out);
      expect(out.x).toBeCloseTo(want.x, 12);
      expect(out.z).toBeCloseTo(want.z, 12);
    }
    const none = { x: 9, z: 9 };
    moveVector(new Set(), none);
    expect(none.x).toBe(0);
    expect(none.z).toBe(0);
  });

  it('stickInput turned by the view yaw is inputDirection', () => {
    const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
    player.setAvatar(new THREE.Group(), 3.5);
    player.setViewYaw(0.9);
    player.setTouchMove({ x: 0.6, z: -0.8, mag: 1 });
    const out = { x: 0, z: 0 };
    expect(player.stickInput(out)).toBe(out);
    const w = stickToWorld(out.x, out.z, player.viewYaw(), { x: 0, z: 0 });
    const d = player.inputDirection();
    expect(w.x).toBeCloseTo(d.x, 12);
    expect(w.z).toBeCloseTo(d.z, 12);
  });
});

const { yardWalk } = await import('./helpers/traversalwalk.js');
const { NO_TRAVERSAL } = await import('../src/traversallive.js');
const { BALANCE_SPEED, CAM_TURN_MAX, behindYaw, facingYaw } = await import('../src/traversal.js');

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Mounts plank-1 from the west roof, pushing east, and walks `seconds` along it.
function onPlank1(seconds = 0, opts = {}) {
  const w = yardWalk({ at: [-9.0, -13], face: [1, 0], ...opts });
  w.push(1, 0);
  for (let i = 0; i < 30 && !w.live.busy; i++) w.frame();
  expect(w.live.crossing?.id).toBe('plank-1');
  w.run(seconds);
  return w;
}

describe('the balance walk', () => {
  it('walks onto plank-1 from the west roof, along it, and off onto the east roof', () => {
    const w = yardWalk({ at: [-9.0, -13], face: [1, 0], viewYaw: behindYaw(1, 0) });
    w.push(1, 0);
    for (let i = 0; i < 30 && !w.live.busy; i++) w.frame(); // 0.6 m from the end: a few frames' walk
    expect(w.live.crossing?.id).toBe('plank-1');
    w.run(0.3);
    while (w.live.busy) { w.frame(); expect(w.cat.position.z).toBeCloseTo(-13, 6); expect(w.cat.position.y).toBeCloseTo(3.5, 9); }
    w.run(0.5);
    expect(w.area.ground.y(w.cat.position.x, w.cat.position.z)).toBe(3.5);
    expect(w.cat.position.x).toBeGreaterThan(-1.6);
    expect(w.events.map((e) => e.type)).toEqual(['mount', 'cross']);
  });

  it('never walks faster than the careful walk, and zoomies never run on a crossing', () => {
    const w = yardWalk({ at: [-15.5, -13], face: [1, 0] });
    w.push(1, 0);
    let zoomed = false;
    let mounted = false;
    let checked = 0;
    for (let i = 0; i < 600; i++) {
      const x = w.cat.position.x;
      w.frame();
      if (!mounted && w.live.busy) mounted = true;
      if (!mounted) { zoomed = zoomed || w.player.zooming; continue; }
      if (!w.live.busy) break;
      expect(w.player.zooming).toBe(false);
      expect(Math.abs(w.cat.position.x - x) * 60).toBeLessThanOrEqual(BALANCE_SPEED + 1e-9);
      checked++;
    }
    expect(zoomed).toBe(true);
    expect(checked).toBeGreaterThan(300); // the whole 6.8 m plank
  });

  it('a sideways push does nothing; letting go stops her; she turns round', () => {
    const w = onPlank1(1.5);
    w.release();
    w.run(1.5);
    expect(w.live.speed).toBeLessThan(1e-3);
    const x = w.cat.position.x;
    w.push(0, 1);
    w.run(1);
    expect(w.live.busy).toBe(true);
    // toBeCloseTo, not toBe: balanceStep's ease is exponential, so 1.5 s after letting go she still
    // creeps at about 1e-4 m/s (about 2.5e-5 m over this second); the sideways push adds nothing to it.
    expect(w.cat.position.x).toBeCloseTo(x, 4);
    expect(w.cat.position.z).toBeCloseTo(-13, 9);
    w.push(-1, 0);
    w.run(1);
    expect(w.cat.position.x).toBeLessThan(x - 0.5);
    expect(Math.abs(angleDiff(w.cat.rotation.y, facingYaw(-1, 0)))).toBeLessThan(0.05);
  });

  it('a diagonal push moves her at its share of the speed', () => {
    const w = onPlank1(0.5);
    w.push(Math.SQRT1_2, Math.SQRT1_2);
    w.run(2);
    const x = w.cat.position.x;
    w.frame();
    expect(w.live.busy).toBe(true);
    const speed = (w.cat.position.x - x) * 60;
    expect(Math.abs(speed / (Math.SQRT1_2 * BALANCE_SPEED) - 1)).toBeLessThan(0.02);
  });

  it('her height follows the washing line’s sag', () => {
    // line-1: (-2, 3.5) to (-5, 3.2) to (-8, 3.5) along z = -9, from the east roof. Checked on every frame
    // against the sag at her x, since no frame lands exactly on x = -5; the frame nearest -5 is near 3.2.
    const sag = (x) => (x >= -5 ? 3.5 + 0.1 * (2 + x) : 3.2 - 0.1 * (5 + x));
    const w = yardWalk({ at: [-1.0, -9], face: [-1, 0] });
    w.push(-1, 0);
    for (let i = 0; i < 30 && !w.live.busy; i++) w.frame();
    expect(w.live.crossing?.id).toBe('line-1');
    let nearest = Infinity;
    let lowest = Infinity;
    while (w.live.busy) {
      w.frame();
      const { x, y } = w.cat.position;
      if (x <= -2 && x >= -8) expect(Math.abs(y - sag(x))).toBeLessThan(1e-9);
      if (Math.abs(x + 5) < nearest) { nearest = Math.abs(x + 5); lowest = y; }
    }
    expect(nearest).toBeLessThan(0.02);
    expect(Math.abs(lowest - 3.2)).toBeLessThan(0.002);
    expect(w.events.map((e) => e.type)).toEqual(['mount', 'cross']);
  });

  it('the camera eases round behind her, gently, and not at all with reduced motion', () => {
    const w = yardWalk({ at: [-9.0, -13], face: [1, 0], viewYaw: 1.2 });
    w.push(1, 0);
    let prev = w.player.viewYaw();
    for (let i = 0; i < 180; i++) { w.frame(); const y = w.player.viewYaw(); expect(Math.abs(y - prev)).toBeLessThanOrEqual(CAM_TURN_MAX / 60 + 1e-9); prev = y; }
    expect(Math.abs(angleDiff(prev, behindYaw(1, 0)))).toBeLessThan(0.15);
    const r = yardWalk({ at: [-9.0, -13], face: [1, 0], viewYaw: 1.2, reducedMotion: true });
    r.push(1, 0); r.run(3); expect(r.player.viewYaw()).toBe(1.2);
  });

  it('with the stick held, the camera’s swing never turns her round', () => {
    // on the east roof facing west with the camera ahead of her (west), she walks toward it
    const w = yardWalk({ at: [-1.0, -13], face: [-1, 0], viewYaw: behindYaw(1, 0) });
    w.push(-1, 0); // pushed once and held
    let x = w.cat.position.x;
    for (let i = 0; i < 900 && !w.events.some((e) => e.type === 'cross'); i++) { w.frame(); expect(w.cat.position.x).toBeLessThanOrEqual(x + 1e-9); x = w.cat.position.x; }
    expect(w.events.map((e) => e.type)).toEqual(['mount', 'cross']);
    expect(w.area.ground.y(w.cat.position.x, w.cat.position.z)).toBe(3.5); // off on the west roof
    expect(Math.abs(angleDiff(w.player.viewYaw(), behindYaw(-1, 0)))).toBeLessThan(0.3); // and the camera came round
  });

  it('holding the stick through the whole crossing steps off once at the far end and stays off', () => {
    // the held-stick case above: pushed toward the camera, which swings round behind her on the plank
    const w = yardWalk({ at: [-1.0, -13], face: [-1, 0], viewYaw: behindYaw(1, 0) });
    w.push(-1, 0); // pushed once and held throughout
    for (let i = 0; i < 900 && !w.events.some((e) => e.type === 'cross'); i++) w.frame();
    expect(w.events.map((e) => e.type)).toEqual(['mount', 'cross']);
    const yaw = w.player.viewYaw();
    let x = w.cat.position.x;
    for (let i = 0; i < 200; i++) { // over 3 s: she keeps going the way she was, off the plank
      w.frame();
      expect(w.live.busy).toBe(false);
      expect(w.cat.position.x).toBeLessThanOrEqual(x + 1e-9);
      x = w.cat.position.x;
    }
    expect(w.events.map((e) => e.type)).toEqual(['mount', 'cross']);
    expect(w.player.viewYaw()).toBe(yaw); // the camera's turn stopped at the step-off
    expect(w.cat.position.x).toBeLessThan(-12);
    expect(w.area.ground.y(w.cat.position.x, w.cat.position.z)).toBe(3.5);
    // dispose gives the stick back to the camera
    w.live.dispose();
    const st = w.player.stickInput({ x: 0, z: 0 });
    const want = stickToWorld(st.x, st.z, w.player.viewYaw(), { x: 0, z: 0 });
    const d = w.player.inputDirection();
    expect(d.x).toBeCloseTo(want.x, 12);
    expect(d.z).toBeCloseTo(want.z, 12);
  });

  it('after stepping off, she gets back on only with a fresh push', () => {
    const w = yardWalk({ at: [-1.0, -13], face: [-1, 0], viewYaw: behindYaw(1, 0) });
    w.push(-1, 0);
    for (let i = 0; i < 900 && !w.events.some((e) => e.type === 'cross'); i++) w.frame();
    // still holding, the thumb swings round to point back onto the plank (in the held stick's frame): no remount
    const s = stickToWorld(1, 0, -behindYaw(1, 0), { x: 0, z: 0 });
    w.player.setTouchMove({ x: s.x, z: s.z, mag: 1 });
    for (let i = 0; i < 60; i++) { w.frame(); expect(w.live.busy).toBe(false); }
    // let go, push toward the plank again: on she gets
    w.release();
    w.frame();
    w.push(1, 0);
    for (let i = 0; i < 30 && !w.live.busy; i++) w.frame();
    expect(w.live.crossing?.id).toBe('plank-1');
    expect(w.events.map((e) => e.type)).toEqual(['mount', 'cross', 'mount']);
  });

  it('does not mount when perched, in a fight or chased, or from the yard under the plank', () => {
    const cases = [
      ['perched', { at: [-9.0, -13] }, (s) => { s.perched = { id: 'a perch' }; }],
      ['in a fight', { at: [-9.0, -13] }, (s) => { s.fight = { id: 'a fight' }; }],
      ['chased', { at: [-9.0, -13] }, (s) => { s.chasing = true; }],
      ['from the yard', { at: [-7.95, -13] }, () => {}], // 0.45 m from end 0, but 3.5 m below it
    ];
    for (const [, opts, set] of cases) {
      const w = yardWalk({ ...opts, face: [1, 0] });
      set(w.session);
      w.push(1, 0);
      for (let i = 0; i < 30; i++) { w.frame(); expect(w.live.busy).toBe(false); }
      expect(w.events).toEqual([]);
    }
  });

  it('the leaning plank: from the yard up onto the shed', () => {
    const w = yardWalk({ at: [-2.2, 6], face: [-1, 0] });
    w.push(-1, 0);
    for (let i = 0; i < 30 && !w.live.busy; i++) w.frame();
    expect(w.live.crossing?.id).toBe('plank-2');
    for (let i = 0; i < 900 && w.live.busy; i++) w.frame();
    expect(w.live.busy).toBe(false);
    w.run(0.5);
    expect(w.area.ground.y(w.cat.position.x, w.cat.position.z)).toBe(1.5);
    expect(w.cat.position.y).toBeCloseTo(1.5, 9);
    expect(w.events.map((e) => e.type)).toEqual(['mount', 'cross']);
  });

  it('groundSpot and dispose', () => {
    const w = onPlank1(1);
    expect(w.live.busy).toBe(true);
    expect(w.live.progress).toBeGreaterThan(0);
    expect(w.live.progress).toBeLessThan(0.5);
    expect(w.live.groundSpot()).toEqual({ x: -8.4, z: -13 });
    w.live.dispose();
    expect(w.live.busy).toBe(false);
    expect(w.live.crossing).toBeNull();
    expect(w.live.phase).toBeNull();
    expect(w.live.groundSpot()).toBeNull();
  });

  it('NO_TRAVERSAL does nothing', () => {
    expect(Object.isFrozen(NO_TRAVERSAL)).toBe(true);
    expect(NO_TRAVERSAL.jump({})).toBe(false);
    expect(NO_TRAVERSAL.busy).toBe(false);
    expect(NO_TRAVERSAL.pose).toBeNull();
    expect(NO_TRAVERSAL.speed).toBeNull();
    expect(NO_TRAVERSAL.groundSpot()).toBeNull();
    expect(() => { NO_TRAVERSAL.update(1 / 60, 0, {}); NO_TRAVERSAL.late(1 / 60, 0, {}); NO_TRAVERSAL.dispose(); }).not.toThrow();
  });
});
