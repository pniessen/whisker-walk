import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync, statSync } from 'node:fs';

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

// Task 7: things on the ground. Prints, contact shadows, marks, race rings,
// the yarn ball and every prop placed per walk sit on ground.y; decals lie on
// the slope. On flat ground every matrix is today's (the flat trace pins it).
const { createPawPrints, PRINT_Y } = await import('../src/render/pawprints.js');
const { createContactShadows, scanFootprints } = await import('../src/render/contactshadows.js');
const { seatOnGround } = await import('../src/ground.js');
const { createRace, RING_Y } = await import('../src/race.js');
const { createToy, TOY_RADIUS } = await import('../src/toy.js');
const { createPlayerMarks } = await import('../src/render/playermarks.js');
const { createBorderMarks } = await import('../src/render/bordermarks.js');
const { addBorderDressing } = await import('../src/world/borderpost.js');
const { createGifts } = await import('../src/gifts.js');
const { createRests } = await import('../src/rests.js');
const { createTippables } = await import('../src/tippables.js');
const { createCarryables } = await import('../src/carryables.js');
const { createScent } = await import('../src/scent.js');
const { createSecrets } = await import('../src/secrets.js');
const { createPushThroughs } = await import('../src/pushthrough.js');
const { propsFor } = await import('../src/propsets.js');

const RAMP_UP = new THREE.Vector3(-1 / 3, 1, 0).normalize();
const _mt = new THREE.Matrix4();
const _pt = new THREE.Vector3();
const _qt = new THREE.Quaternion();
const _st = new THREE.Vector3();
function instanceAt(mesh, i) {
  mesh.getMatrixAt(i, _mt);
  _mt.decompose(_pt, _qt, _st);
  return { p: _pt.clone(), up: new THREE.Vector3(0, 1, 0).applyQuaternion(_qt), s: _st.clone() };
}
// Every scene child's y on `ground` minus the same child's y on flat ground.
function lifts(build, ground) {
  const flat = new THREE.Scene();
  const up = new THREE.Scene();
  build(flat, FLAT_GROUND);
  build(up, ground);
  expect(up.children.length).toBe(flat.children.length);
  expect(up.children.length).toBeGreaterThan(0);
  return up.children.map((o, i) => o.position.y - flat.children[i].position.y);
}
const BASE2 = createGround({ base: 2 });

describe('things on the ground sit on the ground', () => {
  it('paw prints and contact shadows lie on the slope', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const paws = createPawPrints(new THREE.Scene(), { areaId: 'seaside', areaData: area, tier: { pawPrints: 64, pawFade: 10 } });
    let checked = 0;
    for (let f = 0; f < 90; f++) {
      const x = -3 + f * 0.04;
      const pr = paws.update(DT, { x, z: 0, grounded: true });
      if (!pr) continue;
      const { p, up } = instanceAt(paws.mesh, (paws.laid - 1) % paws.capacity);
      expect(p.y).toBeCloseTo(area.ground.y(pr.x, pr.z) + PRINT_Y, 5);
      expect(up.angleTo(RAMP_UP)).toBeLessThan(Math.PI / 180);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
    // at (-1.5, 0) the ramp is 1.5 m up
    expect(area.ground.y(-1.5, 0) + PRINT_Y).toBeCloseTo(1.5 + PRINT_Y, 12);

    // her cat's contact shadow on the plateau: at 3 + DECAL_Y, not shrunk
    const DECAL_Y = 0.015;
    const flatCat = new THREE.Group();
    const flatScene = new THREE.Scene();
    flatScene.add(flatCat);
    flatCat.position.set(8, 0, 0);
    const flatDecals = createContactShadows(flatScene);
    flatDecals.follow(flatCat, 0.4);
    flatDecals.update();
    const upCat = new THREE.Group();
    const upScene = new THREE.Scene();
    upScene.add(upCat);
    upCat.position.set(8, 3, 0);
    const upDecals = createContactShadows(upScene, { ground: area.ground });
    upDecals.follow(upCat, 0.4);
    upDecals.update();
    const a = instanceAt(flatDecals.moverMesh, 0);
    const b = instanceAt(upDecals.moverMesh, 0);
    expect(b.p.y).toBeCloseTo(3 + DECAL_Y, 5);
    expect(b.s.x).toBeCloseTo(a.s.x, 5);
    expect(b.s.x).toBeGreaterThan(0.5);
    // on the ramp the mover decal lies on the slope
    upCat.position.set(-1.5, 1.5, 0);
    upDecals.update();
    const c = instanceAt(upDecals.moverMesh, 0);
    expect(c.p.y).toBeCloseTo(1.5 + DECAL_Y, 5);
    expect(c.up.angleTo(RAMP_UP)).toBeLessThan(Math.PI / 180);
    expect(c.s.x).toBeCloseTo(a.s.x, 5);
  });

  it('a prop on the plateau still gets a contact shadow', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const root = new THREE.Scene();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5));
    box.position.set(8, 0.25, 0);
    root.add(seatOnGround(box, area.ground));
    expect(box.position.y).toBe(3.25);
    expect(scanFootprints(root)).toHaveLength(0); // measured from 0 it floats
    expect(scanFootprints(root, area.ground)).toHaveLength(1);
    const decals = createContactShadows(root, { ground: area.ground });
    expect(decals.staticCount).toBe(1);
    expect(instanceAt(decals.staticMesh, 0).p.y).toBeCloseTo(3.015, 5);
  });

  it('race rings float over the ground', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const race = createRace(new THREE.Scene(), [{ x: 8, z: 0 }, { x: -10, z: 0 }], { x: 6, z: 1 }, { ground: area.ground });
    const rings = race.group.children.filter((m) => m.geometry.type === 'TorusGeometry');
    expect(rings[0].position.y).toBe(3 + RING_Y);
    expect(rings[1].position.y).toBe(RING_Y);
    const pad = race.group.children.find((m) => m.geometry.type === 'RingGeometry');
    expect(pad.position.y).toBe(3 + 0.02);
  });

  it('the yarn ball never rolls off a rim', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const toy = createToy(new THREE.Scene(), { ground: area.ground });
    toy.throwFrom(new THREE.Vector3(8, 3.3, 4), new THREE.Vector3(0, 0, 1), 5);
    for (let f = 0; f < 4 * 60; f++) {
      toy.update(DT, area.bounds);
      const p = toy.mesh.position;
      expect(Math.hypot(p.x - 8, p.z)).toBeLessThanOrEqual(5);
      expect(p.y).toBeGreaterThanOrEqual(3 + TOY_RADIUS - 1e-9);
    }
    expect(toy.mesh.position.y).toBeCloseTo(3 + TOY_RADIUS, 9);
    // a set-down ball rests on the ground under it, not at 0
    toy.setPosition(new THREE.Vector3(8, 0, 0));
    expect(toy.mesh.position.y).toBeCloseTo(3 + TOY_RADIUS, 9);
  });

  it('marks, gifts, rests, tippables and posts sit on the ground', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const g = area.ground;
    const all3 = (ys) => ys.forEach((y) => expect(y).toBeCloseTo(3, 9));
    const all2 = (ys) => ys.forEach((y) => expect(y).toBeCloseTo(2, 9));

    // my marks: a dig and a paw on the plateau, and the park's scratch posts
    all3(lifts((s, ground) => createPlayerMarks(s, 'woods', [
      { kind: 'dig', id: null, x: 8, z: 0, at: 2 },
      { kind: 'border', id: 'b1', x: 9, z: 1, at: 1 },
    ], { ground }), g));
    all2(lifts((s, ground) => createPlayerMarks(s, 'park', [], { ground }), BASE2));
    // rival border marks and the Clan Edition's waymark posts
    all2(lifts((s, ground) => createBorderMarks(s, 'park', { ground }), BASE2));
    all2(lifts((s, ground) => addBorderDressing(s, 'neighborhood', { ground }), BASE2));
    // a gift on a plateau scenic
    all3(lifts((s, ground) => createGifts(s, [{ id: 'sc', x: 8, z: 0 }], [{ area: 'fixture', spot: 'sc' }], { ground }), g));
    // rests, carryables and push-throughs
    all3(lifts((s, ground) => createRests(s, [{ id: 'r', kind: 'drink', x: 8, z: 0, mesh: true }], { ground }), g));
    all3(lifts((s, ground) => createCarryables(s, [{ id: 'c', kind: 'sock', x: 8, z: 0 }], { ground }), g));
    all2(lifts((s, ground) => createPushThroughs(s, propsFor('neighborhood').flaps, { ground }), BASE2));
    // the gnome and the unicorn, the scent mounds
    const secretsUp = new THREE.Scene();
    const sec = createSecrets(secretsUp, area, { unicorn: true, ufo: false }, () => 0.5);
    expect(sec.list.map((e) => e.group.position.y)).toEqual([3, 3]);
    sec.update(DT, 1, new THREE.Vector3(-19, 0, -19), 0);
    expect(sec.list[1].group.position.y).toBe(3);
    const scentUp = new THREE.Scene();
    const scent = createScent(scentUp, area, () => 0.5);
    for (const tr of scent.treats) expect(tr.mound.position.y).toBeCloseTo(g.y(tr.x, tr.z) + 0.02, 9);
    expect(scent.treats.some((tr) => g.y(tr.x, tr.z) === 3)).toBe(true);
    // a carryable put down on the plateau lands on it
    const carry = createCarryables(new THREE.Scene(), [{ id: 'c', kind: 'sock', x: 0, z: 10 }], { ground: g });
    const lift = carry.list[0].mesh.position.y;
    carry.placeAt('c', 8, 1);
    expect(carry.list[0].mesh.position.y).toBeCloseTo(3 + lift, 9);

    // a tippable's little hop is measured from the ground, not from 0
    const tips = createTippables(new THREE.Scene(), [{ kind: 'pot', x: 8, z: 0 }], { ground: g });
    const e = tips.list[0];
    expect(e.group.position.y).toBe(3);
    tips.tip(e);
    tips.update(0.25);
    const k = 1 - Math.max(0, e.anim) / 0.5;
    expect(e.group.position.y).toBeCloseTo(3 + Math.sin(k * Math.PI) * 0.12, 9);
  });
});

// Task 8 (R10, R11): a fight stands on one level, with the real intruder:
// clanfight hands the stage a relative lift and the intruder adds the ground.
const { createClanFight } = await import('../src/game/clanfight.js');
const { COUNTER } = await import('../src/fight.js');

describe('a fight stands on the ground', () => {
  it('a fight on a raised spot: the staged intruder stands at the ground plus its lift', () => {
    let k = Math.floor(1e9 / INTRUDER_PERIOD);
    while (!visitAt('woods', k * INTRUDER_PERIOD)) k++;
    const clock = { T: k * INTRUDER_PERIOD + ENTER_AT + 20 };
    const at = intruderAt('woods', clock.T);
    const ground = createGround({ discs: [{ x: at.x, z: at.z, r: 6, y: 3 }] });
    const scene = new THREE.Scene();
    const intr = createIntruders(scene, 'woods', { now: () => clock.T, hostile: () => true, ground });
    const stages = [];
    const stage = intr.stage.bind(intr);
    intr.stage = (v, st) => { stages.push(st); stage(v, st); };
    const bursts = [];
    const cf = createClanFight({
      intruders: intr,
      ui: { showChallenge() {}, showFight() {}, hide() {}, key: () => false },
      audio: { hiss() {}, pounceWhoosh() {}, landThump() {} },
      fx: { burst: (p) => bursts.push(p.y) },
      hud: { toast() {} },
      log: { awardOnce() {} },
      areaId: 'woods', walkStamp: 'w', playerId: 'me', playerSpecial: null,
      now: () => clock.T, clanHome: true, picks: ['woods'], terrain: ground,
    });
    intr.update(DT, FAR_CAT);
    const cur0 = intr.current();
    const cat = new THREE.Vector3(cur0.pos.x + 1.5, 3, cur0.pos.z);
    const s = { cat: { position: cat, rotation: { y: 0 } }, fight: null, perched: null, chasing: false, cameraMode: false };
    const mesh = () => scene.children.find((o) => o.userData?.intruder);
    intr.update(DT, cat);
    cf.update(DT, s);
    expect(cf.uiShowing).toBe('challenge');
    cf.startFight();
    expect(s.fight).not.toBeNull();
    let checked = 0;
    for (let i = 0; i < 60 * 40 && s.fight; i++) {
      clock.T += DT;
      cf.update(DT, s);
      intr.update(DT, cat);
      if (s.fight?.phase === 'clue') cf.answer(COUNTER[s.fight.move]);
      if (stages.length && s.fight) {
        const st = stages.at(-1);
        expect(mesh().position.y).toBeCloseTo(3 + st.y, 12);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
    expect(stages.some((st) => st.y > 0)).toBe(true);
    expect(bursts.length).toBeGreaterThan(0);
    for (const y of bursts) expect(y).toBeCloseTo(3.2, 12);
  });

  it('walk.js hands the fight and its camera the walk’s ground', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(src).toMatch(/createClanFight\(\{[\s\S]*?terrain: ground,[\s\S]*?\}\) : NO_CLAN_FIGHT/);
    expect(src).toMatch(/createFightCam\(\{[^}]*\bground\b[^}]*\}\)/);
  });
});

// Task 9 (R7): every cat that walks leans fully into the slope under it, so
// its paws sit on the slope plane. Her cat's and a co-walker's lean is eased
// at TILT_RATE; the NPCs set theirs outright. Flat ground writes nothing new.
const { groundTilt, TILT_RATE } = await import('../src/ground.js');
const { animateCat } = await import('../src/cat/animator.js');
const { avatarSlopeTilt } = await import('../src/game/avatar.js');

const UPHILL = Math.atan(1 / 3); // the fixture ramp's pitch, facing +x
const FACE_PLUS_X = Math.atan2(1, 0) + Math.PI; // yaw whose nose points at +x

// One frame of her drawn cat, as updateAvatar draws it.
function drawHer(ground, cat, player, s, t, speed) {
  const tilt = avatarSlopeTilt(ground, cat, player, s, DT);
  animateCat(cat, 'follow', t, speed);
  applyWaterLook(cat, player.waterState, t, DT, false, avatarBaseY(ground, cat, player, s), 1, null, tilt);
}

function pawWorld(cat) {
  cat.updateMatrixWorld(true);
  return cat.userData.parts.legs.map((leg) => leg.userData.paw.getWorldPosition(new THREE.Vector3()));
}

describe('cats lean into slopes', () => {
  it('her cat leans into the ramp and its paws touch it', () => {
    const { ground, player, cat, step } = rig(-7, 0);
    const s = { ground, fight: null };
    player.setTouchMove({ x: 1, z: 0, mag: 1 });
    let f = 0;
    while (cat.position.x < -1.5 && f < 600) {
      step();
      drawHer(ground, cat, player, s, f * DT, 1.5);
      f++;
    }
    expect(cat.position.x).toBeGreaterThan(-1.5);
    player.setTouchMove({ x: 0, z: 0, mag: 0 });
    for (let i = 0; i < 60; i++) {
      step();
      drawHer(ground, cat, player, s, (f + i) * DT, 0);
    }
    expect(cat.rotation.order).toBe('YXZ');
    expect(cat.rotation.x).toBeCloseTo(UPHILL, 4); // nose up: +rotation.x raises it
    expect(Math.abs(cat.rotation.z)).toBeLessThan(1e-4);
    // paws on the slope plane, at speed 0 (the gait lifts paws)
    const flatCat = buildCat('tabby');
    animateCat(flatCat, 'follow', 0, 0);
    const rest = pawWorld(flatCat).map((p) => p.y); // each paw's own height over flat ground
    const paws = pawWorld(cat);
    expect(paws.length).toBe(4);
    paws.forEach((p, i) => {
      expect(Math.abs(p.y - ground.y(p.x, p.z) - rest[i])).toBeLessThan(0.03);
    });
    // ...where an upright cat would sink its front paws and float its back ones
    cat.rotation.x = 0;
    const upright = pawWorld(cat).map((p, i) => Math.abs(p.y - ground.y(p.x, p.z) - rest[i]));
    expect(Math.max(...upright)).toBeGreaterThan(0.05);
    // on flat ground: no tilt is passed, nothing new is written
    expect(avatarSlopeTilt(FLAT_GROUND, cat, player, s, DT)).toBeNull();
    expect(avatarSlopeTilt(null, cat, player, s, DT)).toBeNull();
  });

  it('every cat-shaped NPC on the ramp leans when facing up it', () => {
    const area = buildHeightFixture(new THREE.Scene());
    const g = area.ground;
    const leans = (group) => {
      const want = groundTilt(g, group.position.x, group.position.z, group.rotation.y);
      expect(group.rotation.order).toBe('YXZ');
      expect(group.rotation.x).toBe(want.pitch);
      expect(group.rotation.z).toBe(want.roll);
      expect(Math.abs(group.rotation.x)).toBeGreaterThan(0.2);
    };
    const onRamp = (group, x) => {
      group.position.set(x, g.y(x, 0), 0);
      group.rotation.y = FACE_PLUS_X;
    };
    // a stray, held in a greet
    const strays = createStrayCats(new THREE.Scene(), area, 1, mulberry32(3), { roomSeed: 3 });
    const st = strays.strays[0];
    onRamp(st.group, -2);
    st.state = 'greet';
    st.timer = 10;
    strays.update(DT, 0, FAR_CAT, {});
    leans(st.group);
    // the clan leader at its post
    const layout = {
      cx: -2, cz: 3,
      seats: { leader: { x: -2, y: 0, z: 3 }, deputy: { x: -1, z: 3 }, elders: [{ x: -3, z: 0 }], kits: [] },
    };
    const clan = createClanCats(new THREE.Scene(), area, clanCast('woods').slice(0, 3), {
      campLayout: layout, roamHomes: [], roomSeed: 4, areaId: null,
    });
    const leader = clan.list.find((c) => c.slot === 0);
    expect(leader.camp).toBe(true);
    onRamp(leader.group, -3);
    clan.update(DT, 0, FAR_CAT);
    leans(leader.group);
    // a ghost, held in a greet
    const ghosts = createGhosts(new THREE.Scene(), area, [{ playerId: 'p1', petName: 'Bo', breed: 'tabby', greets: 0 }],
      mulberry32(2), {});
    const gh = ghosts.list[0];
    onRamp(gh.group, -2.5);
    gh.state = 'greet';
    gh.timer = 10;
    ghosts.update(DT, 0);
    leans(gh.group);
    // Mochi at home, half way round her circle: walking +x up the ramp
    const mochi = createKittenEncounter(new THREE.Scene(), { kind: 'home' }, { x: -0.5, z: 0 }, { ground: g });
    mochi.update(4 * Math.PI, FAR_CAT);
    expect(mochi.group.position.x).toBeCloseTo(-3.5, 9);
    leans(mochi.group);
    // a co-walker streamed onto the ramp, facing up it
    const remotes = createRemoteCats(new THREE.Scene(), { ground: g });
    remotes.upsert({ playerId: 'p2', breed: 'tabby', petName: 'Bo', accessories: {} }, 0);
    remotes.applyState({ id: 'p2', pos: [-2, 0], yaw: FACE_PLUS_X, pose: 'follow', speed: 0 }, 0);
    for (let i = 1; i <= 60; i++) remotes.update(DT, i * DT, []);
    const rg = remotes.list[0].group;
    expect(rg.rotation.order).toBe('YXZ');
    expect(rg.rotation.x).toBeCloseTo(UPHILL, 4);
    expect(Math.abs(rg.rotation.z)).toBeLessThan(1e-4);
  });

  it('an intruder leans walking its route up a slope, and stands level when staged', () => {
    let k = Math.floor(1e9 / INTRUDER_PERIOD);
    while (!visitAt('woods', k * INTRUDER_PERIOD)) k++;
    const T = k * INTRUDER_PERIOD + ENTER_AT + 20;
    const at = intruderAt('woods', T);
    // a 1-in-3 strip rising along the route's heading where it walks
    const ground = createGround({ strips: [{
      x0: at.x - 20 * at.dx, z0: at.z - 20 * at.dz, x1: at.x + 20 * at.dx, z1: at.z + 20 * at.dz,
      width: 20, y0: 0, y1: 40 / 3,
    }] });
    const scene = new THREE.Scene();
    const clock = { T };
    const intr = createIntruders(scene, 'woods', { now: () => clock.T, hostile: () => true, ground });
    intr.update(DT, FAR_CAT);
    const mesh = scene.children.find((o) => o.userData?.intruder);
    expect(mesh.rotation.order).toBe('YXZ');
    expect(mesh.rotation.x).toBeCloseTo(UPHILL, 9);
    expect(Math.abs(mesh.rotation.z)).toBeLessThan(1e-9);
    const cur = intr.current();
    intr.hold(cur.visit, 'me', cur.pos, { local: true });
    intr.stage(cur.visit, { pose: 'cross', x: cur.pos.x, z: cur.pos.z, y: 0 });
    expect(mesh.rotation.x).toBe(0);
    expect(mesh.rotation.z).toBe(0);
    // staged with the fight's pitch and roll (fight moves and scars, R20):
    // the fight's tilt, not the slope's, and its lift above the ground there
    intr.stage(cur.visit, { pose: 'roll', x: cur.pos.x, z: cur.pos.z, y: 0.2, pitch: 0.4, roll: -1.1 });
    expect(mesh.rotation.order).toBe('YXZ');
    expect(mesh.rotation.x).toBe(0.4);
    expect(mesh.rotation.z).toBe(-1.1);
    expect(mesh.position.y).toBeCloseTo(ground.y(cur.pos.x, cur.pos.z) + 0.2, 12);
    // flat ground: exactly the fight build's look (yaw outermost, level)
    const flatScene = new THREE.Scene();
    const flatIntr = createIntruders(flatScene, 'woods', { now: () => T, hostile: () => true });
    flatIntr.update(DT, FAR_CAT);
    const fm = flatScene.children.find((o) => o.userData?.intruder);
    expect(fm.rotation.order).toBe('YXZ');
    expect(fm.rotation.x).toBe(0);
    expect(fm.rotation.z).toBe(0);
  });

  it('tilt eases in at the ramp’s foot', () => {
    const { ground, player, cat, step } = rig(-9, 0);
    const s = { ground, fight: null };
    player.setTouchMove({ x: 1, z: 0, mag: 1 });
    let px = cat.rotation.x;
    let pz = cat.rotation.z;
    let moved = 0;
    for (let f = 0; f < 3 * 60; f++) {
      step();
      drawHer(ground, cat, player, s, f * DT, 1.5);
      expect(Math.abs(cat.rotation.x - px)).toBeLessThanOrEqual(TILT_RATE * DT + 1e-9);
      expect(Math.abs(cat.rotation.z - pz)).toBeLessThanOrEqual(TILT_RATE * DT + 1e-9);
      if (cat.rotation.x !== px) moved++;
      px = cat.rotation.x;
      pz = cat.rotation.z;
    }
    expect(moved).toBeGreaterThan(5); // it eased, over several frames
    expect(cat.rotation.x).toBeGreaterThan(0.3);
    // a co-walker streamed across the foot eases the same way
    const remotes = createRemoteCats(new THREE.Scene(), { ground });
    remotes.upsert({ playerId: 'p2', breed: 'tabby', petName: 'Bo', accessories: {} }, 0);
    remotes.applyState({ id: 'p2', pos: [-6.2, 0], yaw: FACE_PLUS_X, pose: 'follow', speed: 0 }, 0);
    remotes.update(DT, DT, []);
    remotes.applyState({ id: 'p2', pos: [-4, 0], yaw: FACE_PLUS_X, pose: 'follow', speed: 3 }, DT);
    const rg = remotes.list[0].group;
    let rx = rg.rotation.x;
    for (let f = 2; f <= 60; f++) {
      remotes.update(DT, f * DT, []);
      expect(Math.abs(rg.rotation.x - rx)).toBeLessThanOrEqual(TILT_RATE * DT + 1e-9);
      rx = rg.rotation.x;
    }
    expect(rx).toBeGreaterThan(0.3);
  });

  it('on flat ground no NPC or co-walker writes a new rotation', () => {
    const area = { ...buildHeightFixture(new THREE.Scene()), ground: undefined };
    const strays = createStrayCats(new THREE.Scene(), area, 3, mulberry32(3), { roomSeed: 3 });
    const ghosts = createGhosts(new THREE.Scene(), area, [{ playerId: 'p1', petName: 'Bo', breed: 'tabby', greets: 0 }],
      mulberry32(2), {});
    const mochi = createKittenEncounter(new THREE.Scene(), { kind: 'home' }, { x: 0, z: 0 });
    const remotes = createRemoteCats(new THREE.Scene(), {});
    remotes.upsert({ playerId: 'p2', breed: 'tabby', petName: 'Bo', accessories: {} }, 0);
    remotes.applyState({ id: 'p2', pos: [1, 0], yaw: 1, pose: 'follow', speed: 0 }, 0);
    for (let f = 1; f <= 300; f++) {
      strays.update(DT, f * DT, FAR_CAT, {});
      ghosts.update(DT, f * DT);
      mochi.update(DT, FAR_CAT);
      remotes.update(DT, f * DT, []);
    }
    for (const grp of [...strays.strays.map((x) => x.group), ...ghosts.list.map((x) => x.group), mochi.group, remotes.list[0].group]) {
      expect(grp.rotation.order).toBe('XYZ');
      expect(grp.rotation.x).toBe(0);
      expect(grp.rotation.z).toBe(0);
    }
  });

  it('updateAvatar hands its eased slope tilt to applyWaterLook', () => {
    const src = readFileSync(new URL('../src/game/avatar.js', import.meta.url), 'utf8');
    // after the fight's tilt (9th argument, R7: a fight's tilt wins)
    expect(src).toMatch(/applyWaterLook\(cat, ws, t, dt, reducedMotion, avatarBaseY\(s\.ground, cat, player, s\), amount,\s*s\.fight \? fightTilt : null, avatarSlopeTilt\(s\.ground, cat, player, s, dt\)\);/);
  });
});

// Task 10: the whole-branch proof. A source sweep that every factory the walk
// builds on the ground is handed the walk's ground, and that no ground actor
// anywhere in src/ still writes a literal world height.
describe('the whole branch stands on the ground', () => {
  const SRC = new URL('../src/', import.meta.url);
  const read = (rel) => readFileSync(new URL(rel, SRC), 'utf8');

  // Every call of `name(` in src, as the balanced text from `name(` to its `)`.
  function callsOf(src, name) {
    const out = [];
    let at = src.indexOf(name + '(');
    while (at !== -1) {
      let depth = 0;
      let i = at + name.length;
      for (; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')' && --depth === 0) break;
      }
      out.push(src.slice(at, i + 1));
      at = src.indexOf(name + '(', i);
    }
    return out;
  }

  it('every system that stands on the ground was handed the ground', () => {
    const walk = read('game/walk.js');
    expect(walk).toMatch(/const ground = groundOf\(areaData\);/);
    expect(walk).toMatch(/player\.setGround\(ground\);/);
    expect(walk).toMatch(/const session = \{\s*scene, areaData, ground,/);
    // Factories that take the ground in an options object: every call in
    // walk.js names `ground` (the walk's groundOf(areaData)).
    const takesGround = [
      'createContactShadows', 'addBorderDressing', 'createCritters', 'createStrayCats',
      'createClanCats', 'createRemoteCats', 'createGifts', 'createToy', 'createTippables',
      'createCarryables', 'createKnockables', 'createPlayerMarks', 'createPushThroughs',
      'createRests', 'createGoldMice', 'createIntruders', 'createFightCam',
      'createBorderMarks', 'createRivalPatrol', 'createYardDog', 'createKittenEncounter',
      'createRace',
    ];
    for (const name of takesGround) {
      const calls = callsOf(walk, name);
      expect(calls.length, name).toBeGreaterThan(0);
      for (const call of calls) expect(call, name).toMatch(/\bground\b/);
    }
    // createBorderMarks has two option objects (low tier and the rest).
    for (const call of callsOf(walk, 'createBorderMarks')) {
      expect(call.match(/\bground\b/g)?.length, call).toBe(2);
    }
    // The fight takes it as `terrain` (its own `ground` is the clan-ground test).
    const fights = callsOf(walk, 'createClanFight');
    expect(fights.length).toBe(1);
    expect(fights[0]).toMatch(/\bterrain: ground,/);
    // Ghosts are built from the session (the late remote join).
    const ghosts = callsOf(walk, 'createGhosts');
    expect(ghosts.length).toBe(1);
    expect(ghosts[0]).toMatch(/ground: mySession\.ground/);
    // Weather has no options object: ground is its 6th positional arg.
    const weather = callsOf(walk, 'createWeather');
    expect(weather.length).toBe(1);
    expect(weather[0]).toMatch(/reducedMotion, ground\)$/);
    expect(read('weather.js')).toMatch(/export function createWeather\(scene, sun, condition, rng, reducedMotion = false, ground = FLAT_GROUND\)/);
    // The shadow fit is fed the ground under her cat every frame.
    expect(read('main.js')).toMatch(/session\.shadows\.update\(session\.ground\.y\(player\.position\.x, player\.position\.z\), dt\)/);

    // Exempt from the call pin: these read the ground off the area they are
    // given, so walk.js's areaData is enough. Pinned in their own source.
    expect(read('straycats.js')).toMatch(/ground = groundOf\(area\),/);
    expect(read('ghosts.js')).toMatch(/const ground = opts\?\.ground \?\? groundOf\(area\);/);
    expect(read('clancats.js')).toMatch(/ground = area\?\.ground \?\? null,/);
    expect(read('scent.js')).toMatch(/const ground = groundOf\(area\);/);
    expect(read('secrets.js')).toMatch(/const ground = groundOf\(area\);/);
    for (const f of ['render/pawprints.js', 'render/grass.js', 'render/ambient.js']) {
      expect(read(f), f).toMatch(/const ground = groundOf\(areaData\);/);
    }
    for (const [name, f] of [['createScent', 'scene, areaData, walkRng'], ['createSecrets', 'scene, areaData, '],
      ['createPawPrints', 'areaData'], ['createGrass', 'areaData'], ['createAmbient', 'areaData']]) {
      const calls = callsOf(walk, name);
      expect(calls.length, name).toBe(1);
      expect(calls[0], name).toContain(f);
    }
  });

  // Files that may write a literal world height, each with its reason.
  const EXEMPT = [
    [/^ground\.js$/, 'the ground engine itself'],
    [/^(den|dencats)\.js$|^game\/denlive\.js$|^world\/den\.js$/, 'the den keeps absolute heights (R14)'],
    [/^(skylife|weather)\.js$|^render\/clouds\.js$/, 'sky modules keep absolute heights (R14)'],
    [/^cat\//, 'the cat model: rig offsets and the water look, all relative to the cat'],
    [/^world\//, 'static scenery builders, built at y 0; plan 2 seats them with seatOnGround after each builder call'],
    [/^thumbnails\.js$|^ui\/catstage\.js$/, 'off-world stages (album thumbnails, the cat builder), not in a walk'],
  ];
  // Remaining literal heights in scanned files: local child offsets inside a
  // group (the group itself is placed on the ground), a measuring pose, or a
  // sky object. Per file: the receivers allowed to take a literal, and why.
  const ALLOWED = {
    'critters.js': [['ear', 'snout', 'tail', 'body', 'head', 'eye', 'leg', 'claw', 'arm'], 'mesh parts of a critter group; the group is placed on ground.y'],
    'gifts.js': [['body', 'bandA', 'bandB', 'bow'], 'gift box parts; the gift group is placed on ground.y'],
    'goldmice.js': [['nose', 'tail'], 'golden mouse parts; the mouse group sits at worldY'],
    'tippables.js': [['pot', 'plant', 'bloom', 'canBody', 'spout', 'bin', 'lid'], 'tippable parts; the group sits at gy'],
    'yarddog.js': [['head', 'tail', 'leg'], 'dog parts; the dog group is placed on ground.y'],
    'straycats.js': [['glow'], 'the legendary glow, a child decal under the stray group'],
    'render/playermarks.js': [['d'], 'flatDisc: a disc inside a mark group whose origin is placed on ground.y'],
    'knockables.js': [['group'], 'liftFor measures a pose with the group at the origin, before it joins the scene'],
    'intruders.js': [['g'], 'measure() poses the visitor at the origin to read its fight dims (catDims), then puts it back where it stood'],
    'game/walk.js': [['marker', 'questObject'], 'the quest marker is a child of the giver group; the quest object gets ground.y(t) added after its relative y'],
    'secrets.js': [['body', 'leg', 'neck', 'head', 'horn', 'tail', 'hat', 'dome', 'ufoState.group'], 'unicorn and gnome parts are local to their group (placed on ground.y); the UFO is a sky object (R14)'],
  };
  const LITERAL_SET = /position\.set\([^,()]+, *-?[0-9.]+(e-?[0-9]+)?, *[^,()]+\)/;
  const LITERAL_Y = /position\.y *= *-?[0-9.]+ *;/;

  function srcFiles(dir = SRC, rel = '') {
    const out = [];
    for (const name of readdirSync(dir)) {
      const url = new URL(name, dir);
      if (statSync(url).isDirectory()) out.push(...srcFiles(new URL(name + '/', dir), rel + name + '/'));
      else if (name.endsWith('.js')) out.push(rel + name);
    }
    return out;
  }

  it('no ground actor in src writes a literal height', () => {
    const unexpected = [];
    const used = new Set();
    for (const f of srcFiles()) {
      if (EXEMPT.some(([re]) => re.test(f))) continue;
      read(f).split('\n').forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('//')) return;
        if (!LITERAL_SET.test(t) && !LITERAL_Y.test(t)) return;
        const receiver = t.match(/^([\w.]+?)\.position\./)?.[1];
        if (receiver && ALLOWED[f]?.[0].includes(receiver)) used.add(f + ':' + receiver);
        else unexpected.push(`${f}:${i + 1}: ${t}`);
      });
    }
    expect(unexpected).toEqual([]);
    // No stale allow-list entry: every receiver still names a real hit.
    const listed = Object.entries(ALLOWED).flatMap(([f, [rs]]) => rs.map((r) => f + ':' + r));
    expect([...used].sort()).toEqual(listed.sort());
    // The exempt list is not hiding the actors: these files are scanned.
    for (const f of ['player.js', 'rivalcats.js', 'intruders.js', 'remotecats.js', 'kitten.js', 'ghosts.js', 'toy.js', 'race.js', 'critters.js', 'straycats.js']) {
      expect(EXEMPT.some(([re]) => re.test(f)), f).toBe(false);
    }
  });
});
