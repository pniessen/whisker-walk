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
    let first = true;
    let pulled = false;
    const frame = () => {
      step();
      const c = camera.position;
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
    player.setTouchMove(null);
    for (let f = 0; f < 2 * 60; f++) frame();
    expect(cat.position.z).toBeLessThan(5.1); // she drifted right up to the cliff foot
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
