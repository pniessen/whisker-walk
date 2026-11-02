import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

// Gorge part 1: every system that stands on the ground reads ground.y(x, z).
// Proven on the test-only height fixture (test/fixtures/heightfield.js); the
// shipped maps are flat and test/flattrace.test.js proves they don't move.
//
// Task 3: her cat stands on the ground, stops at rims and climbs a little
// slower. The headless player is the flat trace's recipe.

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

const { buildHeightFixture } = await import('./fixtures/heightfield.js');
const { createGround, FLAT_GROUND } = await import('../src/ground.js');
const { createPlayer } = await import('../src/player.js');
const { buildCat } = await import('../src/cat/model.js');
const { applyWaterLook } = await import('../src/cat/waterlook.js');
const { avatarBaseY } = await import('../src/game/avatar.js');
const { findLanding, chaseOutcome } = await import('../src/rivalcats.js');
const { rivalFor } = await import('../src/rivalclans.js');

const DT = 1 / 60;
const PACE = 3.5;

function rig(x, z) {
  const area = buildHeightFixture(new THREE.Scene());
  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, { addEventListener() {} });
  const cat = buildCat('tabby');
  cat.position.set(x, area.ground.y(x, z), z);
  player.setAvatar(cat, PACE);
  player.setGround(area.ground);
  player.enable();
  const step = (dt = DT) => player.update(dt, area.colliders, area.bounds, area.waters);
  return { area, ground: area.ground, player, cat, camera, step };
}

// Turns the view so viewForward points at +z (yaw = PI); with that yaw a
// touch of {x: 0, z: -1} walks +z, the way the flat trace's "forward" does.
const faceZ = (player) => player.addOrbit(-Math.PI / 0.0045, 0);

describe('her cat stands on the ground', () => {
  it('her cat walks up the ramp and stands on the plateau', () => {
    const { ground, player, cat, step } = rig(-7, 0);
    player.setTouchMove({ x: 1, z: 0, mag: 1 });
    for (let f = 0; f < 6 * 60; f++) {
      step();
      expect(Math.abs(cat.position.y - ground.y(cat.position.x, cat.position.z))).toBeLessThan(1e-9);
    }
    expect(cat.position.x).toBeGreaterThan(3);
    expect(cat.position.y).toBe(3);
  });

  it('a rim stops her from both sides', () => {
    {
      const { player, cat, step } = rig(8, 3);
      faceZ(player);
      player.setTouchMove({ x: 0, z: -1, mag: 1 });
      for (let f = 0; f < 3 * 60; f++) step();
      expect(cat.position.z).toBeGreaterThan(4); // it did walk
      expect(cat.position.z).toBeLessThanOrEqual(5);
      expect(cat.position.y).toBe(3);
    }
    {
      const { player, cat, step } = rig(8, 7);
      player.setTouchMove({ x: 0, z: -1, mag: 1 });
      for (let f = 0; f < 3 * 60; f++) step();
      expect(cat.position.z).toBeLessThan(6); // it did walk
      expect(cat.position.z).toBeGreaterThanOrEqual(5);
      expect(cat.position.y).toBe(0);
    }
  });

  it('a pounce at a rim lands short even on a 0.1 s frame', () => {
    const { player, cat, step } = rig(8, 4.5);
    faceZ(player);
    player.setTouchMove({ x: 0, z: -1, mag: 1 });
    player.pounce();
    let lifted = false;
    for (let f = 0; f < 5; f++) {
      step(0.1);
      if (player.hopY > 0) lifted = true;
      expect(cat.position.y).toBe(3 + player.hopY);
      expect(cat.position.z).toBeLessThanOrEqual(5);
    }
    expect(lifted).toBe(true);
  });

  it('zoomies along the ledge stay on it', () => {
    const { ground, player, cat, step } = rig(13, 0.5);
    faceZ(player);
    player.setTouchMove({ x: -0.15, z: -1, mag: 1 }); // +z with a slight +x drift
    let zoomed = false;
    for (let f = 0; f < 4 * 60; f++) {
      step();
      if (player.zooming) zoomed = true;
      expect(ground.y(cat.position.x, cat.position.z)).toBe(3);
    }
    expect(zoomed).toBe(true);
    expect(cat.position.z).toBeGreaterThan(8);
  });

  it('uphill is a little slower, downhill is not', () => {
    {
      const { player, cat, step } = rig(-5, 0); // on the ramp, going up
      player.setTouchMove({ x: 1, z: 0, mag: 1 });
      for (let f = 0; f < 60; f++) step();
      expect(cat.position.x).toBeLessThan(3); // still on the ramp
      expect(Math.abs(player.speed / (PACE * 0.85) - 1)).toBeLessThan(0.02);
    }
    {
      const { player, cat, step } = rig(4, 0); // on the plateau, going down
      player.setTouchMove({ x: -1, z: 0, mag: 1 });
      for (let f = 0; f < 60; f++) step();
      expect(cat.position.x).toBeLessThan(3); // on the ramp
      expect(cat.position.x).toBeGreaterThan(-6);
      expect(Math.abs(player.speed / PACE - 1)).toBeLessThan(0.01);
    }
    {
      const { player, cat, step } = rig(-10, 8); // on the floor
      player.setTouchMove({ x: 1, z: 0, mag: 1 });
      for (let f = 0; f < 60; f++) step();
      expect(cat.position.y).toBe(0);
      expect(Math.abs(player.speed / PACE - 1)).toBeLessThan(0.01);
    }
  });

  it('setAvatar puts the player back on flat ground', () => {
    const { player, cat, step } = rig(8, 0);
    step();
    expect(cat.position.y).toBe(3);
    player.setAvatar(cat, PACE);
    player.enable();
    step();
    expect(cat.position.y).toBe(0);
  });

  it('a spawn on raised ground starts the camera at the cat', () => {
    const walkSrc = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(walkSrc).toMatch(/const ground = groundOf\(areaData\)/);
    expect(walkSrc).toMatch(/player\.setGround\(ground\)/);
    expect(walkSrc).toMatch(
      /cat\.position\.set\(areaData\.spawn\.x, ground\.y\(areaData\.spawn\.x, areaData\.spawn\.z\), areaData\.spawn\.z\)/,
    );
    expect(walkSrc).toMatch(/camera\.lookAt\(cat\.position\.x, cat\.position\.y \+ CAT_LOOK_Y, cat\.position\.z\)/);
    expect(walkSrc).not.toMatch(/camera\.lookAt\(cat\.position\.x, CAT_LOOK_Y, cat\.position\.z\)/);
    // the session literal carries the ground for every later system
    expect(walkSrc).toMatch(/const session = \{\n\s+scene, areaData, ground,/);
    // the spawn rule itself, on the fixture's plateau
    const g = buildHeightFixture(new THREE.Scene()).ground;
    const cat = new THREE.Group();
    cat.position.set(8, g.y(8, 0), 0);
    expect(cat.position.y).toBe(3);
  });

  it('her drawn cat stands on the plateau, not on 0', () => {
    const { ground, player, cat, step } = rig(8, 0);
    const s = { ground, fight: null };
    step();
    applyWaterLook(cat, player.waterState, 0, DT, false, avatarBaseY(ground, cat, player, s));
    expect(cat.position.y).toBe(3);
    // mid-pounce
    player.pounce();
    step();
    step();
    expect(player.hopY).toBeGreaterThan(0);
    applyWaterLook(cat, player.waterState, 0, DT, false, avatarBaseY(ground, cat, player, s));
    expect(cat.position.y).toBe(3 + player.hopY);
    // flat ground: exactly today's sum
    expect(avatarBaseY(FLAT_GROUND, cat, player, { fight: { }, fightLift: 0.25 }))
      .toBe(player.perchY + player.hopY + 0.25);
  });

  it('a rival chase never lands her across a rim', () => {
    const areaId = 'neighborhood';
    const rival = rivalFor(areaId);
    expect(rival).toBeTruthy();
    let checked = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      // a trespasser just inside the border, and its natural landing
      const from = { x: rival.cx + Math.cos(a) * (rival.r - 0.5), z: rival.cz + Math.sin(a) * (rival.r - 0.5) };
      const out = chaseOutcome(areaId, from, from); // the patrol is right beside her
      if (!out.chased) continue;
      // A plateau sits over the natural landing, so the first choices are 3 m up.
      const ground = createGround({ discs: [{ x: out.to.x, z: out.to.z, r: 1.5, y: 3 }] });
      const flatPick = findLanding(areaId, out.to, () => true);
      expect(ground.canStep(from.x, from.z, flatPick.x, flatPick.z)).toBe(false); // the old pick crosses a rim
      const spot = findLanding(areaId, out.to, () => true, { ground, from });
      expect(spot).not.toBeNull();
      expect(ground.canStep(from.x, from.z, spot.x, spot.z)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    // and on the fixture itself: from the floor at (8, 7), never onto the plateau
    const fx = buildHeightFixture(new THREE.Scene()).ground;
    const from = { x: 8, z: 7 };
    const spot = findLanding(areaId, { x: rival.cx + rival.r + 1.5, z: rival.cz }, () => true, { ground: fx, from });
    if (spot) expect(fx.canStep(from.x, from.z, spot.x, spot.z)).toBe(true);
  });
});
