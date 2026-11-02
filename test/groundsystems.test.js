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

// Task 4: perches, golden mice, knockables and finds sit on the ground under
// them. Authored heights are metres above the ground at their own x, z (R4);
// climbing compares world heights and never leaves the cat's level (R5).
const { bestPerch, climbBudget, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { GOLD_MICE, createGoldMice } = await import('../src/goldmice.js');
const { createKnockables } = await import('../src/knockables.js');
const { createInteractions } = await import('../src/game/interactions.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');

// doPounceOrClimb on the fixture, with the real headless player.
function climbRig(x, z, perchedLabel = null) {
  const r = rig(x, z);
  const perchedOn = perchedLabel ? r.area.perches.find((p) => p.label === perchedLabel) : null;
  if (perchedOn) {
    r.player.perchY = perchedOn.y;
    r.step();
  }
  const progression = { state: { skills: [], feats: {} }, recordFeat() {}, addPoints() {} };
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const session = {
    areaData: r.area, ground: r.ground, cat: r.cat,
    perched: perchedOn, pounceCooldown: 1, fx: { burst() {} },
  };
  const { doPounceOrClimb } = createInteractions({
    MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
    getSession: () => session, getIsTouch: () => false,
    player: r.player, progression, log,
    hud: { toast() {} }, audio: { trill() {}, pounceWhoosh() {} },
    catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
  });
  return { ...r, session, doPounceOrClimb };
}

describe('perches and finds sit on the ground under them', () => {
  const fx = buildHeightFixture(new THREE.Scene());
  const rimRock = fx.perches.find((p) => p.label === 'rim rock');
  const floorRock = fx.perches.find((p) => p.label === 'floor rock');
  const skilled = climbBudget({ skills: ['sure-claws', 'fence-runner'] });

  it('a drop never leaves the cat’s level', () => {
    const ground = fx.ground;
    const cat = new THREE.Vector3(8, 3.6, 4.5);
    expect(ground.y(rimRock.x, rimRock.z)).toBe(3);
    expect(ground.y(floorRock.x, floorRock.z)).toBe(0);
    expect(bestPerch(fx.perches, cat, 0.6, rimRock, BASE_CLIMB_BUDGET, { ground })).toBeNull();
    expect(bestPerch(fx.perches, cat, 0.6, rimRock, skilled, { fenceRun: true, ground })).toBeNull();
    // the same absolute numbers on flat ground do pick the floor rock: the
    // level rule is what refuses it
    expect(bestPerch(fx.perches, cat, 0.6, rimRock, BASE_CLIMB_BUDGET, { ground: FLAT_GROUND })).toBe(floorRock);
    expect(bestPerch(fx.perches, cat, 0.6, rimRock, skilled, { fenceRun: true, ground: FLAT_GROUND })).toBe(floorRock);
    // pressing climb on the rim rock hops down onto the plateau, not the floor
    const r = climbRig(8, 4.5, 'rim rock');
    expect(r.cat.position.y).toBe(3.6);
    r.doPounceOrClimb();
    expect(r.session.perched).toBeNull();
    expect(r.player.perchY).toBe(0);
    r.step();
    expect(r.cat.position.y).toBe(3);
  });

  it('a perch on raised ground is reached from beside it', () => {
    const ground = fx.ground;
    expect(bestPerch(fx.perches, { x: 8, z: 3.5 }, 0, null, BASE_CLIMB_BUDGET, { ground })).toBe(rimRock);
    expect(bestPerch(fx.perches, { x: 8, z: 6.5 }, 0, null, BASE_CLIMB_BUDGET, { ground })).toBe(floorRock);
    expect(bestPerch([rimRock], { x: 8, z: 6.5 }, 0, null, skilled, { fenceRun: true, ground })).toBeNull();
    // through the game's own climb press: she lands on the rock, 0.6 over the plateau
    const r = climbRig(8, 3.5);
    r.doPounceOrClimb();
    expect(r.session.perched?.label).toBe('rim rock');
    expect(r.player.perchY).toBe(0.6);
    expect(r.cat.position.toArray()).toEqual([8, 3.6, 4.5]);
    r.step();
    expect(r.cat.position.y).toBe(3.6);
  });

  it('with a higher perch on another level, the pick is by world height', () => {
    const ground = fx.ground;
    const cat = { x: 1, z: 0 };
    expect(ground.y(1, 0)).toBeCloseTo(7 / 3, 12);
    const near = { x: 1, z: 0.5, y: 0.6, label: 'near' }; // world 2.93
    const down = { x: 0, z: 0, y: 0.8, label: 'down' }; // world 2.8
    expect(ground.y(down.x, down.z)).toBe(2);
    expect(bestPerch([near, down], cat, 0, null, BASE_CLIMB_BUDGET, { ground })).toBe(near);
    expect(bestPerch([down, near], cat, 0, null, BASE_CLIMB_BUDGET, { ground })).toBe(near);
    // flat, the relative heights decide
    expect(bestPerch([near, down], cat, 0, null, BASE_CLIMB_BUDGET, { ground: FLAT_GROUND })).toBe(down);
  });

  it('golden mice and finds sit on the ground under them', () => {
    GOLD_MICE.fixture = [{ id: 'gm-fixture-1', x: 10, z: 0, y: 0.2 }];
    try {
      const gm = createGoldMice(new THREE.Scene(), 'fixture', new Set(), { ground: fx.ground });
      const [mo] = gm.list;
      expect(mo.worldY).toBeCloseTo(3.2, 12);
      for (const t of [0, 0.4, 1.3, 2.9]) {
        gm.update(t);
        expect(Math.abs(mo.group.position.y - 3.2)).toBeLessThanOrEqual(0.05 + 1e-12);
      }
      expect(gm.checkFind({ x: 10, z: 0 }, 3)?.id).toBe('gm-fixture-1');
      expect(gm.checkFind({ x: 10, z: 0 }, 0)).toBeNull();
      gm.dispose();
      // with no ground the mouse is where it always was
      const flat = createGoldMice(new THREE.Scene(), 'fixture', new Set());
      expect(flat.list[0].worldY).toBe(0.2);
      expect(flat.checkFind({ x: 10, z: 0 }, 0)?.id).toBe('gm-fixture-1');
      flat.dispose();
    } finally {
      delete GOLD_MICE.fixture;
    }
    // the collectible orb and the find check read the ground in the walk
    const walkSrc = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(walkSrc).toContain('m.position.set(c.x, ground.y(c.x, c.z) + (c.y ?? 0) + 0.2, c.z);');
    expect(walkSrc).toMatch(/createGoldMice\(scene, areaId, new Set\(progression\.state\.golden\), \{ ground \}\)/);
    const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(mainSrc).toMatch(/session\.goldMice\.checkFind\(session\.cat\.position, pawsY\)/);
  });

  it('a knockable on a plateau ledge is reached from a perch on the plateau', () => {
    const cup = { id: 'fixture-cup-1', kind: 'cup', x: 9, z: 2.3, y: 0.6, fallTo: { x: 9, z: 3 } };
    const k = createKnockables(new THREE.Scene(), [cup], { ground: fx.ground });
    const flat = createKnockables(new THREE.Scene(), [cup]);
    const [e] = k.list;
    expect(k.nearest({ x: 9, z: 2 }, 3.6, 1)).toBe(e);
    expect(k.nearest({ x: 9, z: 2 }, 0.6, 1)).toBeNull();
    // standing on its ledge, 3 m up
    expect(e.group.position.y).toBeCloseTo(3 + flat.list[0].group.position.y, 12);
    // it falls to the plateau under fallTo (to.y === ground.y(fallTo) + downLift)
    k.knockById(cup.id);
    flat.knockById(cup.id);
    for (let i = 0; i < 180; i++) {
      k.update(1 / 60);
      flat.update(1 / 60);
    }
    expect(e.group.position.y).toBe(3 + flat.list[0].group.position.y);
    expect(e.decal.position.y).toBeCloseTo(3 + flat.list[0].decal.position.y, 12);
    k.dispose();
    flat.dispose();    const walkSrc = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(walkSrc).toContain('createKnockables(scene, propsFor(areaId).knockables, { ground })');
  });

  it('the perched collectible and knock prompts compare world heights', () => {
    const src = readFileSync(new URL('../src/game/interactions.js', import.meta.url), 'utf8');
    expect(src).toMatch(/s\.knockables\.nearest\(catP, perchWorldY, KNOCK_REACH\)/);
    expect(src).toMatch(/Math\.abs\(perchWorldY - \(g\.flat \? \(c\.y \?\? 0\) : g\.y\(c\.x, c\.z\) \+ \(c\.y \?\? 0\)\)\) < 0\.9/);
  });
});

// Task 5 (R8, Review Focus 3): the camera keeps out of rock and under ceilings.
describe('the camera keeps out of rock', () => {
  it('the camera is never inside rock and never pumps at a cliff foot', () => {
    const { ground, player, cat, camera, step } = rig(8, 8);
    player.setCameraZoom(3, { instant: true });
    faceZ(player); // the camera sits at -z, back over the plateau
    const look = new THREE.Vector3();
    const prev = new THREE.Vector3();
    const up = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const prevUp = new THREE.Vector3();
    const prevFwd = new THREE.Vector3();
    const prevCat = new THREE.Vector3();
    let first = true;
    let pulled = false;
    const frame = (turning = false) => {
      step();
      const c = camera.position;
      // the picture never rolls or swings: up and forward turn smoothly
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      expect(up.y).toBeGreaterThan(0); // never upside down
      if (!first) {
        expect(up.angleTo(prevUp)).toBeLessThan(0.3);
        expect(fwd.angleTo(prevFwd)).toBeLessThan(0.3);
        // a cat that has stopped leaves the camera all but still (it may still
        // be easing out): no bisection jitter
        if (turning) { /* the view is being turned: covered by the angle checks */ }
        else if (cat.position.distanceTo(prevCat) < 1e-9) expect(c.distanceTo(prev)).toBeLessThan(2e-4);
        // and a drifting one moves it smoothly, by about her own step
        else expect(c.distanceTo(prev)).toBeLessThan(cat.position.distanceTo(prevCat) * 3 + 2e-3);
      }
      prevUp.copy(up);
      prevFwd.copy(fwd);
      prevCat.copy(cat.position);
      expect(c.y).toBeGreaterThanOrEqual(ground.y(c.x, c.z) + 0.35 - 1e-6);
      expect(c.y).toBeLessThanOrEqual(ground.ceil(c.x, c.z) - 0.3 + 1e-6);
      if (!first) expect(c.distanceTo(prev)).toBeLessThanOrEqual(0.6);
      first = false;
      prev.copy(c);
      look.set(cat.position.x, cat.position.y + 0.74, cat.position.z);
      if (c.distanceTo(look) < 5) pulled = true;
      expect(c.distanceTo(look)).toBeGreaterThanOrEqual(0.3 - 1e-6); // MIN_CAM_DIST
      return c.distanceTo(look);
    };
    // back toward the rim
    player.setTouchMove({ x: 0, z: 1, mag: 0.4 });
    for (let f = 0; f < 10 * 60 && cat.position.z > 5.4; f++) frame();
    expect(cat.position.z).toBeLessThanOrEqual(5.4);
    expect(cat.position.y).toBe(0);
    expect(pulled).toBe(true); // the rock really did pull it in
    // wait
    // she drifts on to the rim: the camera, held at the rim behind her, only
    // ever closes on it (no bisection jitter back and forth)
    player.setTouchMove(null);
    let camZ = camera.position.z;
    for (let f = 0; f < 2 * 60; f++) {
      frame();
      expect(camera.position.z).toBeLessThanOrEqual(camZ + 1e-3);
      camZ = camera.position.z;
    }
    expect(cat.position.z).toBeLessThan(5.1); // she drifted right up to the cliff foot
    // turning the view while backed in: the camera follows the yaw
    const before = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    for (let f = 0; f < 30; f++) {
      player.addOrbit(2, 0);
      frame(true);
    }
    const after = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(Math.atan2(after.x, after.z)).not.toBeCloseTo(Math.atan2(before.x, before.z), 2);
    for (let f = 0; f < 30; f++) {
      player.addOrbit(-2, 0);
      frame(true);
    }
    // walk away: the pull may turn from in to out once, and never pumps
    player.setTouchMove({ x: 0, z: -1, mag: 0.4 });
    let last = frame();
    let dir = 0;
    let inToOut = 0;
    for (let f = 0; f < 6 * 60; f++) {
      const d = frame();
      const s = d > last + 1e-9 ? 1 : d < last - 1e-9 ? -1 : 0;
      if (s !== 0) {
        if (dir === -1 && s === 1) inToOut++;
        dir = s;
      }
      last = d;
    }
    expect(inToOut).toBeLessThanOrEqual(1);
    // and it is all the way out again, at the step's full distance
    expect(last).toBeGreaterThan(10);
  });

  it('on flat ground the camera block runs exactly today’s lines', () => {
    const src = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
    expect(src).toMatch(
      /camera\.position\.copy\(avatar\.position\)\.add\(camOff\);\n\s+if \(camera\.position\.y < MIN_CAMERA_Y\) camera\.position\.y = MIN_CAMERA_Y;\n\s+if \(!ground\.flat\) placeCameraOnGround\(/,
    );
  });

  it('main.js fits the shadows to the ground under her cat', () => {
    const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(src).toContain('session.shadows.update(session.ground.y(player.position.x, player.position.z), dt)');
  });
});

// Task 6 (R9, R10, R13): strays, clan cats, critters, intruders, rivals, the
// yard dog, ghosts, the kitten and co-walkers stand on the ground; free
// walkers stop at rims; encounters don't reach across one.
const { createStrayCats } = await import('../src/straycats.js');
const { CAT_NAMES } = await import('../src/straynames.js');
const { mulberry32 } = await import('../src/rng.js');
const { createClanCats } = await import('../src/clancats.js');
const { clanCast } = await import('../src/clancast.js');
const { createCritters } = await import('../src/critters.js');
const { createIntruders, intruderAt, visitAt, INTRUDER_PERIOD, ENTER_AT } = await import('../src/intruders.js');
const { createRemoteCats } = await import('../src/remotecats.js');
const { createNetEvents } = await import('../src/game/netevents.js');
const { meowVolumeForDistance } = await import('../src/game/util.js');
const { createKittenEncounter, KITTEN_SPOT } = await import('../src/kitten.js');
const { createGhosts } = await import('../src/ghosts.js');
const { createRivalPatrol, patrolAt } = await import('../src/rivalcats.js');
const { createYardDog } = await import('../src/yarddog.js');

const FAR_CAT = new THREE.Vector3(-19, 0, -19);

describe('the walk’s other cats and critters stand on the ground', () => {
  it('a stray stands on the ground wherever it wanders', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const g = area.ground;
    const cats = createStrayCats(new THREE.Scene(), area, 3, mulberry32(3), { roomSeed: 3 });
    let off = 0;
    for (const s of cats.strays) expect(s.group.position.y).toBe(g.y(s.group.position.x, s.group.position.z));
    for (let f = 0; f < 3000; f++) {
      cats.update(DT, f * DT, FAR_CAT, {});
      for (const s of cats.strays) {
        const p = s.group.position;
        expect(Math.abs(p.y - g.y(p.x, p.z))).toBeLessThan(1e-9);
        if (p.y !== 0) off++;
      }
    }
    expect(off).toBeGreaterThan(0); // some of it really was up off the base
  });

  it('a stray never crosses a rim', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const g = area.ground;
    const cats = createStrayCats(new THREE.Scene(), area, 1, mulberry32(9), {
      roomSeed: 9, colonyCats: [{ name: CAT_NAMES[0], x: 8, z: 4 }],
    });
    const [s] = cats.strays;
    const p = s.group.position;
    expect([p.x, p.y, p.z]).toEqual([8, 3, 4]);
    let px = p.x;
    let pz = p.z;
    let moved = 0;
    for (let f = 0; f < 3000; f++) {
      cats.update(DT, f * DT, FAR_CAT, {});
      expect(p.y).toBe(3);
      expect(g.canStep(px, pz, p.x, p.z)).toBe(true);
      if (p.x !== px || p.z !== pz) moved++;
      px = p.x;
      pz = p.z;
    }
    expect(moved).toBeGreaterThan(100); // it did wander
    // a shy one scurrying straight at the rim stops there too
    s.personality = 'shy';
    s.state = 'idle';
    s.scurry = 0;
    p.set(8, 3, 4.6);
    const fast = new THREE.Vector3(8, 3, 2.6);
    for (let f = 0; f < 120; f++) {
      cats.update(DT, f * DT, fast, { catSpeed: 4 });
      expect(p.y).toBe(3);
      expect(g.y(p.x, p.z)).toBe(3);
    }
    // and a cross one recoiling off the rim stays on the plateau
    p.set(8, 3, 4.8);
    cats.turnHostile(s, new THREE.Vector3(8, 3, 4));
    expect(p.y).toBe(3);
    expect(g.y(p.x, p.z)).toBe(3);
  });

  it('the stray stream is not drawn any more than before', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const counting = () => { let n = 0; const f = () => { n++; return ((n * 0.6180339887) % 1); }; f.count = () => n; return f; };
    for (const count of [0, 3, 14]) {
      const r = counting();
      createStrayCats(new THREE.Scene(), area, count, r, { colonyCats: [{ name: CAT_NAMES[0], x: 8, z: 4 }] });
      expect(r.count()).toBe(47 + 5 * count);
    }
  });

  it('clan cats sit, roam and hop on the ground', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const g = area.ground;
    const layout = {
      cx: 8, cz: 0,
      seats: {
        leader: { x: 8, y: 0.8, z: -2 },
        deputy: { x: 9.5, z: -2 },
        elders: [{ x: 6, z: -1 }, { x: 6, z: 1 }],
        kits: [{ x: 7, z: 1.5 }, { x: 9, z: 1.5 }, { x: 7, z: 2.5 }, { x: 9, z: 2.5 }],
      },
    };
    const homes = [{ x: 8, z: 3.5 }, { x: 10, z: 2 }, { x: 6, z: -3 }, { x: 11, z: -2 }, { x: 5, z: 2 }];
    const cast = clanCast('woods').slice(0, 9);
    const cats = createClanCats(new THREE.Scene(), area, cast, {
      campLayout: layout, roamHomes: homes, roomSeed: 4, areaId: null,
    });
    const leader = cats.list.find((c) => c.slot === 0);
    expect(leader.group.position.y).toBeCloseTo(3.8, 12);
    for (const c of cats.list) {
      if (c === leader) continue;
      expect(c.group.position.y).toBe(3);
    }
    const kits = cats.list.filter((c) => c.kitSeat >= 0);
    const roamers = cats.list.filter((c) => !c.camp);
    expect(roamers.length).toBeGreaterThan(0);
    const prev = new Map(roamers.map((c) => [c, { x: c.group.position.x, z: c.group.position.z }]));
    let peak = 0;
    let leftHome = 0;
    for (let f = 0; f < 3000; f++) {
      cats.update(DT, f * DT, FAR_CAT);
      for (const k of kits) peak = Math.max(peak, k.group.position.y);
      for (const c of roamers) {
        const p = c.group.position;
        const q = prev.get(c);
        expect(Math.abs(p.y - g.y(p.x, p.z))).toBeLessThan(1e-9);
        expect(g.canStep(q.x, q.z, p.x, p.z)).toBe(true);
        expect(p.y).toBe(3); // homes on the plateau: never off it
        if (Math.hypot(p.x - c.home.x, p.z - c.home.z) > 1) leftHome++;
        q.x = p.x;
        q.z = p.z;
      }
    }
    expect(leftHome).toBeGreaterThan(0);
    expect(peak).toBeGreaterThan(3.1);
    expect(peak).toBeLessThanOrEqual(3 + 0.12 + 1e-12); // KIT_HOP_HEIGHT
    for (const k of kits) if (k.state === 'post') expect(k.group.position.y).toBe(3);
  });

  it('critters perch, hop and fly above the ground', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const g = area.ground;
    const crit = createCritters(new THREE.Scene(), [
      { type: 'bird', x: 8, z: 1 },
      { type: 'butterfly', x: 8, z: -1 },
      { type: 'frog', x: 9, z: 2, x2: 9.5, z2: 2 }, // a patrol on the plateau
    ], { ground: g, hides: [{ x: 10, z: 2 }] });
    const [bird, fly, frog] = crit.list;
    expect(bird.group.position.y).toBe(3);
    expect(fly.group.position.y).toBe(4);
    expect(frog.group.position.y).toBe(3);
    for (let f = 0; f < 300; f++) {
      crit.update(DT, f * DT, FAR_CAT, FAR_CAT);
      expect(bird.group.position.y).toBeGreaterThanOrEqual(3);
      expect(bird.group.position.y).toBeLessThanOrEqual(3.08 + 1e-12);
      expect(fly.group.position.y).toBeGreaterThanOrEqual(3.5 - 1e-12);
      expect(fly.group.position.y).toBeLessThanOrEqual(4.1 + 1e-12);
      expect(frog.group.position.y).toBe(3);
    }
    // the frog bolts for its cover on the plateau and hides there, at 3
    const cat = new THREE.Vector3(8.5, 3, 2);
    for (let f = 300; f < 600 && !frog.hidden; f++) {
      crit.update(DT, f * DT, cat, cat);
      expect(frog.group.position.y).toBeGreaterThanOrEqual(3);
      expect(frog.group.position.y).toBeLessThanOrEqual(3.12 + 1e-12);
    }
    expect(frog.hidden).toBe(true);
    expect(frog.group.position.y).toBe(3);
  });

  it('a fleeing critter never crosses a rim', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const g = area.ground;
    // no cover: it dashes straight away from the cat, at the rim
    {
      const crit = createCritters(new THREE.Scene(), [{ type: 'squirrel', x: 8, z: 3.5, x2: 9, z2: 3.5 }], { ground: g });
      const [sq] = crit.list;
      const cat = new THREE.Vector3(8, 3, 1.5);
      let fled = false;
      let px = sq.group.position.x;
      let pz = sq.group.position.z;
      for (let f = 0; f < 3 * 60; f++) {
        crit.update(DT, 1 + f * DT, cat, cat);
        if (sq.fleeing) fled = true;
        const p = sq.group.position;
        expect(p.y).toBe(3);
        expect(g.canStep(px, pz, p.x, p.z)).toBe(true);
        px = p.x;
        pz = p.z;
      }
      expect(fled).toBe(true);
      expect(sq.group.position.z).toBeGreaterThan(4.4); // it ran right up to the rim
    }
    // cover just below the rim is not its cover; the plateau's is, and it gets there
    {
      const crit = createCritters(new THREE.Scene(), [{ type: 'squirrel', x: 8, z: 3.5, x2: 9, z2: 3.5 }], {
        ground: g, hides: [{ x: 8, z: 6 }, { x: 11, z: 2 }],
      });
      const [sq] = crit.list;
      const cat = new THREE.Vector3(8, 3, 1.5);
      for (let f = 0; f < 3 * 60 && !sq.hidden; f++) {
        crit.update(DT, 1 + f * DT, cat, cat);
        expect(sq.group.position.y).toBe(3);
      }
      expect(sq.hidden).toBe(true);
      expect(Math.hypot(sq.group.position.x - 11, sq.group.position.z - 2)).toBeLessThanOrEqual(0.4 + 1e-9);
    }
  });

  it('a ghost and the kitten stand on the ground', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const g = area.ground;
    const ghosts = createGhosts(new THREE.Scene(), area, [{ playerId: 'p1', petName: 'Bo', breed: 'tabby', greets: 0 }],
      mulberry32(2), { gift: { x: 8, z: 4 } });
    const [gh] = ghosts.list;
    const p = gh.group.position;
    expect(p.y).toBe(3);
    let px = p.x;
    let pz = p.z;
    for (let f = 0; f < 3000; f++) {
      ghosts.update(DT, f * DT);
      expect(Math.abs(p.y - g.y(p.x, p.z))).toBeLessThan(1e-9); // the ramp down is a legal way off
      expect(g.canStep(px, pz, p.x, p.z)).toBe(true);
      px = p.x;
      pz = p.z;
    }
    // Mochi at home on the plateau, round its spawn
    const home = createKittenEncounter(new THREE.Scene(), { kind: 'home' }, { x: 8, z: 0 }, { ground: g });
    for (let f = 0; f < 600; f++) {
      home.update(DT, FAR_CAT);
      expect(home.group.position.y).toBe(3);
    }
    // the trail's paw prints lie on the ground under them
    const ground = createGround({ discs: [{ x: 0, z: 0, r: 30, y: 2 }] });
    const trail = createKittenEncounter(new THREE.Scene(), { kind: 'trail' }, { x: 0, z: 0 }, { ground });
    for (const d of trail.group.children) expect(d.position.y).toBeCloseTo(2.02, 12);
  });

  it('an intruder walks its route on the ground and is staged on it', () => {
    let k = Math.floor(1e9 / INTRUDER_PERIOD);
    while (!visitAt('woods', k * INTRUDER_PERIOD)) k++;
    const T = k * INTRUDER_PERIOD + ENTER_AT + 20;
    const at = intruderAt('woods', T);
    const ground = createGround({ discs: [{ x: at.x, z: at.z, r: 5, y: 3 }] });
    const scene = new THREE.Scene();
    const clock = { T };
    const intr = createIntruders(scene, 'woods', { now: () => clock.T, hostile: () => true, ground });
    intr.update(DT, FAR_CAT);
    const mesh = () => scene.children.find((o) => o.userData?.intruder);
    expect(mesh().position.y).toBe(3);
    clock.T += 1;
    intr.update(1, FAR_CAT);
    expect(mesh().position.y).toBe(3);
    // held and staged by my fight: the lift is relative to the ground (R11)
    const cur = intr.current();
    const pos = cur.pos;
    intr.hold(cur.visit, 'me', pos, { local: true });
    intr.stage(cur.visit, { pose: 'cross', x: pos.x + 1, z: pos.z, y: 0.2 });
    expect(mesh().position.y).toBeCloseTo(3.2, 12);
    // with no ground, exactly what it always was
    const flatScene = new THREE.Scene();
    const flatIntr = createIntruders(flatScene, 'woods', { now: () => T, hostile: () => true });
    flatIntr.update(DT, FAR_CAT);
    const fm = flatScene.children.find((o) => o.userData?.intruder);
    expect(fm.position.y).toBe(0);
    const fc = flatIntr.current();
    flatIntr.hold(fc.visit, 'me', fc.pos, { local: true });
    flatIntr.stage(fc.visit, { pose: 'cross', x: fc.pos.x, z: fc.pos.z, y: 0.2 });
    expect(fm.position.y).toBe(0.2);
  });

  it('a co-walker stands at the ground under its streamed spot', () => {
    const g = buildHeightFixture(new THREE.Scene()).ground;
    const run = (ground) => {
      const remotes = createRemoteCats(new THREE.Scene(), ground ? { ground } : {});
      remotes.upsert({ playerId: 'p2', breed: 'tabby', petName: 'Bo', accessories: {} }, 0);
      remotes.applyState({ id: 'p2', pos: [8, 0], yaw: 0, pose: 'follow', speed: 0 }, 0);
      const ys = [];
      for (let f = 1; f <= 30; f++) {
        remotes.update(DT, f * DT, []);
        ys.push(remotes.list[0].group.position.y);
      }
      return ys;
    };
    const flat = run(null);
    const raised = run(g);
    raised.forEach((y, i) => expect(y).toBe(3 + flat[i]));
    // a meow from (8, 0) is heard from (8, 3, 0), right where it came from
    const vols = [];
    const { applyRemoteEvent } = createNetEvents({
      MP: 1, getCloud: () => null, getPsecret: () => null, log: {}, hud: { toast() {} },
      audio: { meow: (v) => vols.push(v) }, samples: { has: () => false }, catVoice() {}, applyGoalResult() {},
    });
    const heard = [];
    const s = {
      playerId: 'me', ground: g, cat: { position: new THREE.Vector3(8, 3, 0) },
      critters: { reactToMeow: (pos) => heard.push(pos.clone()) },
    };
    applyRemoteEvent(s, { type: 'meow', id: 'p2', breed: 'tabby', pos: [8, 0] });
    expect(vols).toEqual([meowVolumeForDistance(0)]);
    expect(heard[0].toArray()).toEqual([8, 3, 0]);
    // the toy ghost and the handed-over yarn sit on the ground too
    const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(mainSrc).toContain('session.toyGhost.position.set(rx, session.ground.y(rx, rz) + 0.13, rz);');
  });

  it('encounters do not reach across a rim', () => {
    // an intruder on the floor does not puff up at a cat on a clifftop 1.5 m away
    let k = Math.floor(1e9 / INTRUDER_PERIOD);
    while (!visitAt('woods', k * INTRUDER_PERIOD)) k++;
    const T = k * INTRUDER_PERIOD + ENTER_AT + 20;
    const at = intruderAt('woods', T);
    const cat = new THREE.Vector3(at.x + 1.5, 3, at.z);
    const ground = createGround({ discs: [{ x: cat.x + 0.5, z: cat.z, r: 0.8, y: 3 }] });
    expect(ground.y(at.x, at.z)).toBe(0);
    const notices = [];
    const intr = createIntruders(new THREE.Scene(), 'woods', {
      now: () => T, hostile: () => true, ground, onNotice: (v) => notices.push(v),
    });
    intr.update(DT, cat);
    expect(notices).toEqual([]);
    // the same cat on the same level: noticed
    const level = createIntruders(new THREE.Scene(), 'woods', {
      now: () => T, hostile: () => true, onNotice: (v) => notices.push(v),
    });
    level.update(DT, new THREE.Vector3(cat.x, 0, cat.z));
    expect(notices).toHaveLength(1);

    // a rival patrol does not chase a trespasser on another level
    const p = patrolAt('park', 1000);
    const { cx, cz } = rivalFor('park');
    const tres = new THREE.Vector3(p.x + (cx - p.x) * 0.2, 0, p.z + (cz - p.z) * 0.2);
    const chases = [];
    const rg = createGround({ discs: [{ x: tres.x, z: tres.z, r: 0.4, y: 3 }] });
    const patrolUp = createRivalPatrol(new THREE.Scene(), 'park', { now: () => 1000, ground: rg, onChase: () => chases.push(1) });
    patrolUp.update(DT, tres.clone().setY(3));
    expect(chases).toEqual([]);
    const patrolFlat = createRivalPatrol(new THREE.Scene(), 'park', { now: () => 1000, onChase: () => chases.push(1) });
    patrolFlat.update(DT, tres.clone());
    expect(chases).toEqual([1]);

    // the kitten does not ask to be comforted from the floor below
    const kg = createGround({ discs: [{ x: KITTEN_SPOT.x, z: KITTEN_SPOT.z, r: 1, y: 3 }] });
    const meet = createKittenEncounter(new THREE.Scene(), { kind: 'meet' }, { x: 0, z: 0 }, { ground: kg });
    expect(meet.group.position.y).toBe(3);
    expect(meet.promptAt({ x: KITTEN_SPOT.x + 1.5, z: KITTEN_SPOT.z })).toBeNull();
    expect(meet.promptAt({ x: KITTEN_SPOT.x + 0.5, z: KITTEN_SPOT.z })).toBeTruthy();
  });

  it('the rival patrol and the yard dog stand on the ground', () => {
    const p = patrolAt('park', 1000);
    const rg = createGround({ discs: [{ x: p.x, z: p.z, r: 3, y: 3 }] });
    const scene = new THREE.Scene();
    const patrol = createRivalPatrol(scene, 'park', { now: () => 1000, ground: rg });
    patrol.update(DT, FAR_CAT);
    expect(scene.children[0].position.y).toBe(3);
    const yard = { x: 0, z: 0, r: 4, kennel: { x: 0, z: -3 } };
    const dg = createGround({ discs: [{ x: 0, z: 0, r: 6, y: 2 }] });
    const dogScene = new THREE.Scene();
    const dog = createYardDog(dogScene, yard, { ground: dg });
    const flatScene = new THREE.Scene();
    createYardDog(flatScene, yard);
    expect(dog.group.position.y).toBe(2);
    dogScene.children.forEach((o, i) => expect(o.position.y).toBe(2 + flatScene.children[i].position.y));
    dog.update(DT, FAR_CAT, null);
    expect(dog.group.position.y).toBe(2);
  });
});
