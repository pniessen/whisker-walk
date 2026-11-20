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
const { stickToWorld, createTraversal } = await import('../src/traversal.js');
const { createGround } = await import('../src/ground.js');

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

const { traversalEventEffects } = await import('../src/traversallive.js');
const { BASE_ABILITIES, LOOK_TIME, arcPoint } = await import('../src/traversal.js');
const T = await import('../src/traversal.js');

const hopById = (w, id) => w.area.traversal.hops.find((h) => h.id === id);

// Steers her (a fresh push each frame, toward the target) until she is within `near` of it, then lets
// go and lets her come to rest.
function walkTo(w, x, z, near = 0.3) {
  for (let i = 0; i < 1200; i++) {
    const dx = x - w.cat.position.x;
    const dz = z - w.cat.position.z;
    const d = Math.hypot(dx, dz);
    if (d < near) break;
    w.push(dx / d, dz / d);
    w.frame();
  }
  w.release();
  w.run(0.5);
}

// Frames until the hop is over; returns the phases seen, checking she is never under the ground.
function ride(w, dt = 1 / 60) {
  const phases = [];
  for (let i = 0; i < 1000 && w.live.busy; i++) {
    w.frame(dt);
    phases.push(w.live.phase);
    expect(w.cat.position.y).toBeGreaterThanOrEqual(w.area.ground.y(w.cat.position.x, w.cat.position.z) - 1e-9);
  }
  expect(w.live.busy).toBe(false);
  return phases;
}

describe('the leap and the drop', () => {
  it('leaps the level gap: crouch, air, land, and ends exactly on the far roof', () => {
    const w = yardWalk({ at: [3, -7.0], face: [0, 1] });
    expect(w.jump()).toBe(true);
    expect(w.live.busy).toBe(true);
    expect(w.live.hop?.id).toBe('gap-1');
    const phases = [];
    const poses = new Set();
    for (let i = 0; i < 1000 && w.live.busy; i++) {
      w.frame(); phases.push(w.live.phase); poses.add(w.live.pose);
      if (w.live.busy) expect(w.live.speed).toBe(0);
      expect(w.cat.position.y).toBeGreaterThanOrEqual(w.area.ground.y(w.cat.position.x, w.cat.position.z) - 1e-9);
    }
    expect([...new Set(phases)]).toEqual(['crouch', 'air', 'land', null]);
    expect([...poses]).toEqual(['stalk', 'pounce', 'land', null]);
    const hop = hopById(w, 'gap-1');
    expect(w.cat.position.x).toBe(hop.x1); expect(w.cat.position.z).toBe(hop.z1);
    expect(w.cat.position.y).toBe(3.5);
    expect(w.player.perchY).toBe(0);
    expect(w.events.map((e) => e.type)).toEqual(['leap', 'land']);
    expect(w.events[1]).toEqual({ type: 'land', kind: 'leap', id: 'gap-1' });
    expect(w.live.hop).toBeNull();
    expect(w.live.groundSpot()).toBeNull();
  });

  it('leaps down gap-2 onto the lower roof', () => {
    const w = yardWalk({ at: [7.0, 0], face: [1, 0] });
    expect(w.jump()).toBe(true);
    ride(w);
    expect(w.cat.position.x).toBe(10.4); expect(w.cat.position.z).toBe(0);
    expect(w.area.ground.y(w.cat.position.x, w.cat.position.z)).toBe(1.5);
    expect(w.cat.position.y).toBe(1.5);
    expect(w.events.map((e) => `${e.type}:${e.id}`)).toEqual(['leap:gap-2', 'land:gap-2']);
  });

  it('climbs onto the shed at climb-1, and a climb above her budget is a look', () => {
    const w = yardWalk({ at: [-12, 9.4], face: [0, -1] });
    expect(w.jump()).toBe(true);
    ride(w);
    expect(w.cat.position.x).toBe(-12); expect(w.cat.position.z).toBe(7.4);
    expect(w.cat.position.y).toBe(1.5);
    expect(w.events).toEqual([{ type: 'climb', id: 'climb-1' }, { type: 'land', kind: 'climb', id: 'climb-1' }]);

    const r = yardWalk({ at: [-12, 9.4], face: [1, 0], abilities: () => ({ ...BASE_ABILITIES, climb: 1.0 }) });
    const [x, y, z] = [r.cat.position.x, r.cat.position.y, r.cat.position.z];
    expect(r.jump()).toBe(true);
    expect(r.live.busy).toBe(false);
    expect(r.live.looking?.id).toBe('climb-1');
    expect(r.live.phase).toBe('look');
    expect(r.live.pose).toBe('follow');
    expect(r.live.speed).toBe(0);
    expect(Math.abs(angleDiff(r.cat.rotation.y, facingYaw(0, -1)))).toBeLessThan(1e-9); // she faces the shed
    r.run(LOOK_TIME - 0.1);
    expect(r.live.phase).toBe('look');
    expect([r.cat.position.x, r.cat.position.y, r.cat.position.z]).toEqual([x, y, z]);
    r.run(0.1);
    expect(r.live.phase).toBeNull();
    expect(r.live.looking).toBeNull();
    expect(r.events).toEqual([{ type: 'look', id: 'climb-1' }]);
  });

  it('the stick ends a look at once', () => {
    const w = yardWalk({ at: [14, 3.2], face: [0, 1] });
    expect(w.jump()).toBe(true);
    w.run(0.2);
    expect(w.live.phase).toBe('look');
    expect([w.cat.position.x, w.cat.position.z]).toEqual([14, 3.2]); // put
    w.push(-1, 0);
    w.frame();
    expect(w.live.phase).toBeNull();
    expect(w.live.looking).toBeNull();
    expect(w.cat.position.x).toBeLessThan(14); // and off she walks, that frame
    w.run(0.5);
    expect(w.cat.position.x).toBeLessThan(13);
  });

  it('a stick already held at the press does not end the look; only a fresh push does', () => {
    // (a) pushing toward the too-wide gap, held through the press: the look lasts its full LOOK_TIME
    const w = yardWalk({ at: [14, 3.2], face: [0, 1] });
    w.push(-1, 0); // walking along the roof's edge, and still pushing at the press
    w.frame();
    expect(w.jump()).toBe(true);
    const held = [w.cat.position.x, w.cat.position.y, w.cat.position.z];
    const yaw = facingYaw(0, 1); // she faces the far roof
    expect(w.cat.rotation.y).toBe(yaw);
    for (let i = 0; i < Math.round((LOOK_TIME - 0.1) * 60); i++) {
      w.frame();
      expect(w.live.phase).toBe('look');
      expect([w.cat.position.x, w.cat.position.y, w.cat.position.z]).toEqual(held);
      expect(w.cat.rotation.y).toBe(yaw);
    }
    expect(w.live.looking?.id).toBe('gap-3');
    w.run(0.1);
    expect(w.live.phase).toBeNull();
    w.run(0.5); // the look over, the held stick walks her on
    expect(w.cat.position.x).toBeLessThan(held[0] - 0.5);
    // (b) held at the press, let go after it, then pushed again: the look ends on that frame
    const r = yardWalk({ at: [14, 3.2], face: [0, 1] });
    r.push(0, 1);
    r.frame();
    expect(r.jump()).toBe(true);
    const put = [r.cat.position.x, r.cat.position.z];
    r.run(0.2);
    r.release();
    r.frame();
    expect(r.live.phase).toBe('look');
    expect([r.cat.position.x, r.cat.position.z]).toEqual(put); // held still before the fresh push
    r.push(-1, 0);
    r.frame();
    expect(r.live.phase).toBeNull();
    expect(r.live.looking).toBeNull();
    expect(r.cat.position.x).toBeLessThan(put[0]); // and walks after it
    r.run(0.5);
    expect(r.cat.position.x).toBeLessThan(put[0] - 0.5);
    expect(r.events).toEqual([{ type: 'look', id: 'gap-3' }]);
  });

  it('at the gap too wide for her she looks across; with Long Leap she leaps it', () => {
    const w = yardWalk({ at: [14, 3.2], face: [0, 1] });
    expect(w.jump()).toBe(true);
    expect(w.live.phase).toBe('look');
    expect(w.live.looking?.id).toBe('gap-3');
    w.run(0.5);
    expect([w.cat.position.x, w.cat.position.z]).toEqual([14, 3.2]);
    expect(w.events).toEqual([{ type: 'look', id: 'gap-3' }]);

    const l = yardWalk({ at: [14, 3.2], face: [0, 1], abilities: () => ({ ...BASE_ABILITIES, longLeap: true }) });
    expect(l.jump()).toBe(true);
    expect(l.live.hop?.id).toBe('gap-3');
    ride(l);
    expect(l.cat.position.x).toBe(14); expect(l.cat.position.z).toBe(8.0);
    expect(l.cat.position.y).toBe(1.5);
    expect(l.events.map((e) => `${e.type}:${e.id}`)).toEqual(['leap:gap-3', 'land:gap-3']);
  });

  it('drops in steps from the west roof to the shed, and from the shed to the yard', () => {
    const w = yardWalk({ at: [-12, -6.9], face: [0, 1] });
    for (const id of ['drop-1', 'drop-4']) {
      const hop = hopById(w, id);
      if (id === 'drop-4') walkTo(w, hop.x0, hop.z0);
      w.events.length = 0;
      expect(w.jump()).toBe(true);
      expect(w.live.hop?.id).toBe(id);
      let first = true;
      for (let i = 0; i < 1000 && w.live.busy; i++) {
        w.frame();
        if (first && w.live.phase === 'air') {
          first = false;
          expect(w.cat.position.y).toBeGreaterThanOrEqual(hop.y0 - 1e-9); // a hop out, not a fall
        }
        expect(w.cat.position.y).toBeGreaterThanOrEqual(w.area.ground.y(w.cat.position.x, w.cat.position.z) - 1e-9);
      }
      expect(first).toBe(false);
      expect(w.cat.position.x).toBe(hop.x1); expect(w.cat.position.z).toBe(hop.z1);
      expect(w.cat.position.y).toBe(hop.y1);
      expect(w.events.map((e) => `${e.type}:${e.id}`)).toEqual([`drop:${id}`, `land:${id}`]);
    }
    expect(w.cat.position.y).toBe(0); // in the yard
  });

  it('away from every spot the jump is not its business', () => {
    expect(yardWalk({ at: [0, 14], face: [0, -1] }).jump()).toBe(false); // the spawn
    expect(yardWalk({ at: [-12, -9.5], face: [0, 1] }).jump()).toBe(false); // the west roof, 3.1 m from drop-1
    const cases = [
      (w) => { w.session.perched = { id: 'a perch' }; w.player.perchY = 0.6; },
      (w) => { w.player.perchY = 0.6; },
      (w) => { w.session.fight = { id: 'a fight' }; },
      (w) => { w.session.chasing = true; },
    ];
    for (const set of cases) {
      const w = yardWalk({ at: [3, -7.0], face: [0, 1] });
      set(w);
      expect(w.jump()).toBe(false);
      w.frame();
      expect(w.live.busy).toBe(false);
      expect(w.events).toEqual([]);
    }
  });

  it('a jump on a crossing does nothing and says it is busy', () => {
    const w = onPlank1(1);
    const x = w.cat.position.x;
    expect(w.jump()).toBe(true);
    expect(w.live.phase).toBe('crossing');
    expect(w.live.hop).toBeNull();
    expect(w.cat.position.x).toBe(x);
    expect(w.events.map((e) => e.type)).toEqual(['mount']);
  });

  it('lands on the same spot whatever the frame times', () => {
    const land = (dts, reducedMotion = false) => {
      const w = yardWalk({ at: [3, -7.0], face: [0, 1], reducedMotion });
      w.jump();
      let i = 0;
      while (w.live.busy && i < 10000) w.frame(dts[i++ % dts.length]);
      return [w.cat.position.x, w.cat.position.z];
    };
    const a = land([1 / 60]);
    expect(land([0.05])).toEqual(a);
    expect(land([1 / 60, 0, 0, 1 / 30])).toEqual(a);
    expect(land([1 / 60], true)).toEqual(a); // reduced motion: the same landing
  });

  it('turns and glides smoothly into the spring from any approach, with or without reduced motion', () => {
    const { WALK_SPEED } = T;
    const deg = Math.PI / 180;
    const worst = { turn: 0, spring: 0, glide: 0 };
    const tryHop = (id, offset, angle, reducedMotion) => {
      const probe = yardWalk({ at: [0, 14] });
      const hop = hopById(probe, id);
      const ux = (hop.x1 - hop.x0) / hop.dist;
      const uz = (hop.z1 - hop.z0) / hop.dist;
      const at = [hop.x0 + offset[0] * ux - offset[1] * uz, hop.z0 + offset[0] * uz + offset[1] * ux];
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      const w = yardWalk({ at, face: [ux * c + uz * sn, -ux * sn + uz * c], reducedMotion });
      const hopYaw = facingYaw(ux, uz);
      expect(w.jump()).toBe(true);
      expect(w.live.hop?.id).toBe(id);
      let yaw = w.cat.rotation.y;
      let x = w.cat.position.x;
      let z = w.cat.position.z;
      let sprung = false;
      for (let i = 0; i < 1000 && w.live.busy; i++) {
        const dt = 1 / 60;
        w.frame(dt);
        const phase = w.live.phase;
        worst.turn = Math.max(worst.turn, Math.abs(angleDiff(w.cat.rotation.y, yaw)));
        if (phase === 'crouch') worst.glide = Math.max(worst.glide, Math.hypot(w.cat.position.x - x, w.cat.position.z - z) / dt);
        else if (!sprung) {
          sprung = true;
          worst.spring = Math.max(worst.spring, Math.abs(angleDiff(w.cat.rotation.y, hopYaw)));
        }
        yaw = w.cat.rotation.y;
        x = w.cat.position.x;
        z = w.cat.position.z;
      }
      expect(sprung).toBe(true);
      expect(w.live.busy).toBe(false);
      expect(w.cat.position.x).toBe(hop.x1); expect(w.cat.position.z).toBe(hop.z1); // it always lands
    };
    for (const id of ['climb-1', 'drop-1', 'gap-1']) {
      for (const reducedMotion of [false, true]) {
        for (const a of [0, 45, -45, 90, -90, 135, -135]) tryHop(id, [-0.6, 0], a * deg, reducedMotion);
        for (const side of [0.85, -0.85]) tryHop(id, [0, side], 0, reducedMotion); // the longest glide, sideways
      }
    }
    expect(worst.turn).toBeLessThanOrEqual(0.17);
    expect(worst.spring).toBeLessThan(0.06);
    expect(worst.glide).toBeLessThanOrEqual(WALK_SPEED + 1e-9);
  });

  it('reduced motion shortens the crouch and the landing, and nothing else', () => {
    const times = (reducedMotion) => {
      const w = yardWalk({ at: [3, -7.0], face: [0, 1], reducedMotion });
      w.jump();
      const n = { crouch: 0, air: 0, land: 0 };
      for (let i = 0; i < 1000 && w.live.busy; i++) { w.frame(); if (w.live.phase) n[w.live.phase]++; }
      return n;
    };
    const a = times(false);
    const r = times(true);
    expect(r.crouch).toBeLessThan(a.crouch);
    expect(r.land).toBeLessThan(a.land);
    expect(Math.abs(r.air - a.air)).toBeLessThanOrEqual(1);
  });

  it('keeps her on the arc when something else moves her mid-air', () => {
    const w = yardWalk({ at: [3, -7.0], face: [0, 1] });
    const hop = hopById(w, 'gap-1');
    w.jump();
    for (let i = 0; i < 600 && w.live.phase !== 'air'; i++) w.frame();
    w.cat.position.set(0, 0, 10);
    w.frame();
    expect(w.live.phase).toBe('air');
    const p = arcPoint(hop, hop.apex, w.live.progress, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(w.cat.position.x - p.x, w.cat.position.y - p.y, w.cat.position.z - p.z)).toBeLessThan(0.2);
    expect(w.live.groundSpot()).toEqual({ x: hop.x1, z: hop.z1 });
    ride(w);
    expect(w.cat.position.x).toBe(hop.x1); expect(w.cat.position.z).toBe(hop.z1);
  });

  it('one leap per press however the button is mashed', () => {
    const w = yardWalk({ at: [3, -7.0], face: [0, 1] });
    for (let i = 0; i < 150; i++) { w.jump(); w.frame(); }
    expect(w.live.busy).toBe(false);
    expect(w.events.filter((e) => e.type === 'leap')).toHaveLength(1);
    expect(w.events.map((e) => e.type)).toEqual(['leap', 'land']);
    const hop = hopById(w, 'gap-1');
    expect([w.cat.position.x, w.cat.position.z]).toEqual([hop.x1, hop.z1]); // on east2, no spot near
    expect(w.jump()).toBe(false);
  });

  it('is the same on two devices, and draws on no dice', () => {
    // The walks are built first: THREE draws each object's uuid with Math.random. The run itself draws nothing.
    const scriptedRun = (w) => {
      w.push(1, 0);
      for (let i = 0; i < 900 && !w.events.some((e) => e.type === 'cross'); i++) w.frame();
      w.release();
      w.frame();
      walkTo(w, 3, -6.6);
      expect(w.jump()).toBe(true);
      ride(w);
      expect(w.events.map((e) => `${e.type}:${e.id}`)).toEqual(['mount:plank-1', 'cross:plank-1', 'leap:gap-1', 'land:gap-1']);
      return w.trace;
    };
    const real = Math.random;
    const walks = [yardWalk({ at: [-9.0, -13], face: [1, 0] }), yardWalk({ at: [-9.0, -13], face: [1, 0] })];
    Math.random = () => { throw new Error('Math.random'); };
    let a;
    let b;
    try { a = scriptedRun(walks[0]); b = scriptedRun(walks[1]); } finally { Math.random = real; }
    expect(a.length).toBeGreaterThan(200);
    expect(b).toEqual(a);
  });

  it('dispose clears a hop and a look', () => {
    const w = yardWalk({ at: [3, -7.0], face: [0, 1] });
    w.jump();
    w.run(0.3);
    expect(w.live.groundSpot()).toEqual({ x: 3, z: -3.1 });
    w.live.dispose();
    expect(w.live.busy).toBe(false);
    expect(w.live.hop).toBeNull();
    expect(w.live.phase).toBeNull();
    expect(w.live.groundSpot()).toBeNull();
    const l = yardWalk({ at: [14, 3.2], face: [0, 1] });
    l.jump();
    l.live.dispose();
    expect(l.live.looking).toBeNull();
    expect(l.live.phase).toBeNull();
  });

  it('traversalEventEffects', () => {
    const calls = [];
    const cat = new THREE.Group();
    cat.position.set(3, 3.5, -3.1);
    const audio = { pounceWhoosh: () => calls.push('whoosh'), landThump: () => calls.push('thump') };
    const fx = { burst: (pos, color, n) => calls.push(['burst', pos, color, n]) };
    const bus = { emit: (name, data) => calls.push(['emit', name, data]) };
    const deps = { audio, fx, cat, bus };
    traversalEventEffects({ type: 'land', kind: 'leap', id: 'gap-1' }, deps);
    expect(calls).toEqual([['burst', cat.position, 0xcbb8a0, 8], 'thump', ['emit', 'pounce:land', { water: false }]]);
    expect(calls[0][1]).toBe(cat.position);
    for (const type of ['leap', 'drop', 'climb']) {
      calls.length = 0;
      traversalEventEffects({ type, id: 'x' }, deps);
      expect(calls).toEqual(['whoosh']);
    }
    calls.length = 0;
    for (const type of ['mount', 'cross', 'look']) traversalEventEffects({ type, id: 'x' }, deps);
    expect(calls).toEqual([]);
    // a stand-in may leave out fx and audio
    expect(() => {
      traversalEventEffects({ type: 'land', kind: 'drop', id: 'x' }, { cat, bus });
      traversalEventEffects({ type: 'leap', id: 'x' }, { cat, bus });
    }).not.toThrow();
    expect(calls).toEqual([['emit', 'pounce:land', { water: false }]]);
  });
});

const { buildCat } = await import('../src/cat/model.js');
const { WOBBLE, TAIL_OUT, WIGGLE, LEAP_PITCH, LAND_BOUNCE, EARS_UP, HEAD_UP } = await import('../src/traversallive.js');
const { HOP } = await import('../src/traversal.js');

// Every transform late() may touch: hers, and each part's rotation.
function poseSnapshot(cat) {
  const r = (o) => [o.rotation.x, o.rotation.y, o.rotation.z];
  const p = cat.userData.parts;
  return {
    position: [cat.position.x, cat.position.y, cat.position.z],
    rotation: r(cat),
    parts: [p.body, p.head, p.tail, p.earL, p.earR, ...p.tailPivots, ...p.legs].map(r),
  };
}

describe('how she looks', () => {
  it('holds her tail out and sways it on a crossing; still under reduced motion', () => {
    const sway = (reducedMotion) => {
      const w = onPlank1(0, { cat: buildCat('tabby'), reducedMotion });
      const { tail, tailPivots } = w.cat.userData.parts;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 120 && w.live.crossing; i++) {
        w.frame();
        expect(tail.rotation.x).toBe(TAIL_OUT.rootX);
        for (const p of tailPivots) { lo = Math.min(lo, p.rotation.y); hi = Math.max(hi, p.rotation.y); }
      }
      return [lo, hi];
    };
    const [lo, hi] = sway(false);
    expect(hi).toBeGreaterThan(TAIL_OUT.sway * 0.8);
    expect(lo).toBeLessThan(-TAIL_OUT.sway * 0.8);
    expect(hi).toBeLessThanOrEqual(TAIL_OUT.sway + 1e-9);
    expect(sway(true)).toEqual([0, 0]);
  });

  it('wobbles now and then, less with Tightrope Tail, never under reduced motion', () => {
    const maxRoll = (opts) => { const w = yardWalk({ ...opts, at: [-9.0, -13], face: [1, 0], cat: buildCat('tabby') }); w.push(1, 0); let m = 0; for (let i = 0; i < 300; i++) { w.frame(); if (w.live.crossing) m = Math.max(m, Math.abs(w.cat.rotation.z)); } return m; };
    expect(maxRoll({})).toBeGreaterThan(WOBBLE.amp * 0.5);
    expect(maxRoll({ abilities: () => ({ ...BASE_ABILITIES, steady: true }) })).toBeLessThanOrEqual(WOBBLE.amp * WOBBLE.steady + 1e-9);
    expect(maxRoll({ reducedMotion: true })).toBe(0);
    // now and then: still between the wobbles
    const w = onPlank1(0, { cat: buildCat('tabby') });
    const rolls = [];
    for (let i = 0; i < 240 && w.live.crossing; i++) { w.frame(); rolls.push(w.cat.rotation.z); }
    const still = rolls.filter((r) => r === 0).length;
    expect(still).toBeGreaterThan(rolls.length / 2);
  });

  it('leans nose-up walking up the leaning plank', () => {
    const w = yardWalk({ at: [-2.2, 6], face: [-1, 0], cat: buildCat('tabby') });
    w.push(-1, 0);
    for (let i = 0; i < 30 && !w.live.busy; i++) w.frame();
    expect(w.live.crossing?.id).toBe('plank-2');
    for (let i = 0; i < 900 && w.live.busy && w.live.progress < 0.5; i++) w.frame();
    expect(w.live.progress).toBeGreaterThanOrEqual(0.5);
    expect(w.cat.rotation.x).toBeGreaterThan(0.2);
    expect(w.cat.rotation.x).toBeLessThanOrEqual(0.35);
    // and level on the level plank
    const l = onPlank1(1, { cat: buildCat('tabby') });
    expect(l.cat.rotation.x).toBe(0);
  });

  it('wiggles before the leap, pitches through it, bounces on landing; none of it with reduced motion', () => {
    const look = (reducedMotion) => {
      const w = yardWalk({ at: [3, -7.0], face: [0, 1], cat: buildCat('tabby'), reducedMotion });
      const yaw = facingYaw(0, 1); // she already faces the far roof, so the crouch's own turn is none
      const crouch = reducedMotion ? HOP.leap.crouchRM : HOP.leap.crouch;
      expect(w.jump()).toBe(true);
      const seen = { early: 0, wiggle: 0, airFirst: null, airLast: null, bounce: 0, landY: [] };
      let n = 0;
      for (let i = 0; i < 1000 && w.live.busy; i++) {
        w.frame();
        n++;
        if (w.live.phase === 'crouch') {
          const d = Math.abs(angleDiff(w.cat.rotation.y, yaw));
          if ((n / 60) / crouch < WIGGLE.from - 0.02) seen.early = Math.max(seen.early, d);
          else seen.wiggle = Math.max(seen.wiggle, d);
        } else if (w.live.phase === 'air') {
          expect(w.cat.rotation.x).toBeCloseTo(reducedMotion ? 0 : LEAP_PITCH * (1 - 2 * w.live.progress), 12);
          if (seen.airFirst === null) seen.airFirst = w.cat.rotation.x;
          seen.airLast = w.cat.rotation.x;
          expect(w.cat.rotation.y).toBe(yaw);
        } else if (w.live.phase === 'land') {
          seen.bounce = Math.max(seen.bounce, w.cat.position.y - 3.5);
          seen.landY.push(w.cat.position.y);
        }
      }
      expect(w.cat.position.y).toBe(3.5); // and exactly on the roof once it is over
      return seen;
    };
    const a = look(false);
    expect(a.early).toBe(0);
    expect(a.wiggle).toBeGreaterThan(WIGGLE.yaw * 0.5);
    expect(a.wiggle).toBeLessThanOrEqual(WIGGLE.yaw + 1e-9);
    expect(a.airFirst).toBeGreaterThan(0.15); // nose up off the edge
    expect(a.airLast).toBeLessThan(-0.15); // nose down to the landing
    expect(a.bounce).toBeGreaterThan(LAND_BOUNCE * 0.5);
    expect(a.bounce).toBeLessThanOrEqual(LAND_BOUNCE + 1e-9);
    const r = look(true);
    expect(r.wiggle).toBe(0);
    expect(r.airFirst).toBe(0);
    expect(r.airLast).toBe(0);
    expect(r.bounce).toBe(0);
    expect(r.landY.every((y) => y === 3.5)).toBe(true);
  });

  it('pricks her ears looking across; Hagrid’s parts are left alone', () => {
    for (const reducedMotion of [false, true]) {
      const w = yardWalk({ at: [14, 3.2], face: [0, 1], cat: buildCat('tabby'), reducedMotion });
      expect(w.jump()).toBe(true);
      w.frame();
      expect(w.live.phase).toBe('look');
      const { earL, earR, head } = w.cat.userData.parts;
      expect(earL.rotation.z).toBe(EARS_UP);
      expect(earR.rotation.z).toBe(-EARS_UP);
      expect(head.rotation.x).toBe(-HEAD_UP);
    }
    const sentinel = (parts) => {
      for (const p of [parts.head, parts.tail, parts.earL, parts.earR, ...parts.tailPivots]) p.rotation.set(0.123, 0.456, 0.789);
    };
    const untouched = (parts) => {
      for (const p of [parts.head, parts.tail, parts.earL, parts.earR, ...parts.tailPivots]) expect([p.rotation.x, p.rotation.y, p.rotation.z]).toEqual([0.123, 0.456, 0.789]);
    };
    // Hagrid looking across, and on a crossing
    const h = yardWalk({ at: [14, 3.2], face: [0, 1], cat: buildCat('hagrid') });
    expect(h.jump()).toBe(true);
    h.frame();
    expect(h.live.phase).toBe('look');
    sentinel(h.cat.userData.parts);
    expect(() => h.live.late(1 / 60, 1, h.ctx)).not.toThrow();
    untouched(h.cat.userData.parts);
    const c = onPlank1(1, { cat: buildCat('hagrid') });
    sentinel(c.cat.userData.parts);
    c.live.late(1 / 60, 1, c.ctx);
    untouched(c.cat.userData.parts);
    // a cat missing her parts, or some of them
    const bare = new THREE.Group();
    bare.userData.parts = { tail: new THREE.Group() };
    expect(() => onPlank1(1, { cat: bare })).not.toThrow();
    expect(bare.userData.parts.tail.rotation.x).toBe(TAIL_OUT.rootX);
    const none = yardWalk({ at: [14, 3.2], face: [0, 1] });
    none.jump();
    expect(() => none.run(0.2)).not.toThrow();
  });

  it('writes nothing when she is on the ground away from every move', () => {
    const w = yardWalk({ at: [0, 14], face: [0, -1], cat: buildCat('tabby') });
    w.push(0, -1);
    w.run(0.5);
    for (const step of [() => {}, () => w.release(), () => w.run(1)]) {
      step();
      w.frame();
      expect(w.live.phase).toBeNull();
      const before = poseSnapshot(w.cat);
      w.live.late(1 / 60, 5, w.ctx);
      expect(poseSnapshot(w.cat)).toEqual(before);
    }
  });

  it('changes nothing she does: the same walk, hop and events with and without it', () => {
    const run = (withLate) => {
      const w = yardWalk({ at: [-9.0, -13], face: [1, 0], cat: buildCat('tabby') });
      if (!withLate) w.live.late = () => {};
      const out = [];
      const note = () => out.push([w.cat.position.x, w.cat.position.z, w.live.phase, w.live.progress, w.player.viewYaw()].toString());
      w.push(1, 0);
      for (let i = 0; i < 900 && !w.events.some((e) => e.type === 'cross'); i++) { w.frame(); note(); }
      w.release();
      w.frame();
      walkTo(w, 3, -6.6);
      w.jump();
      for (let i = 0; i < 1000 && w.live.busy; i++) { w.frame(); note(); }
      out.push(w.events.map((e) => `${e.type}:${e.id}`).join());
      out.push([w.cat.position.x, w.cat.position.y, w.cat.position.z, w.cat.rotation.y].toString());
      return out;
    };
    const a = run(true);
    expect(a.at(-2)).toBe('mount:plank-1,cross:plank-1,leap:gap-1,land:gap-1');
    expect(run(false)).toEqual(a);
  });
});

describe('crossings that share an end', () => {
  // ridge A then ridge B in a straight line north, meeting at (0, 0) on a roof at y 3
  function twoRidges() {
    const ground = createGround({ strips: [{ x0: 0, z0: 12, x1: 0, z1: -12, width: 6, y0: 3 }] });
    const traversal = createTraversal({ crossings: [
      { id: 'A', kind: 'ridge', points: [{ x: 0, z: 9, y: 3 }, { x: 0, z: 0, y: 3 }] },
      { id: 'B', kind: 'ridge', points: [{ x: 0, z: 0, y: 3 }, { x: 0, z: -9, y: 3 }] },
    ] }, ground);
    return { name: 'two-ridges', bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, colliders: [], waters: [], perches: [], ground, traversal };
  }
  it('holding forward across a shared end walks onto the next crossing and never back', () => {
    const w = yardWalk({ area: twoRidges(), at: [0, 9.6], face: [0, -1] });
    w.push(0, -1);
    w.run(20);
    expect(w.events.filter((e) => e.type === 'mount').map((e) => e.id)).toEqual(['A', 'B']);
  });
});
