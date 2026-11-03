import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createAvatarUpdater } from '../src/game/avatar.js';
import { buildCat } from '../src/cat/model.js';
import { wirePose } from '../src/fightactions.js';
import { createProgression } from '../src/progression.js';
import { createWaterState, stepWaterState } from '../src/waterstate.js';

// Swimming (Task 6): the local cat's look and sounds in the water, driven
// through the real updateAvatar with a stand-in session (the
// test/interactions.test.js restHarness pattern) and a real tabby.

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// A pond at the origin: deep in the middle, wadeable from r 3.8 to 5.
const POND = [{ id: 'p', kind: 'circle', x: 0, z: 0, r: 5, shallow: 1.2 }];
const WADE_X = 4.5;

// A stand-in for player.js: only what updateAvatar reads, with the water step
// player.update makes (no water under a perched cat).
function standInPlayer(cat) {
  const waterState = createWaterState();
  const player = {
    perchY: 0, hopY: 0, speed: 0, speedFactor: 1, inputActive: false, stalking: false,
    swimming: false, wading: false, inWater: false, shaking: false, waterState,
    forward: () => new THREE.Vector3(0, 0, -1),
    update(dt) {
      const st = stepWaterState(waterState, player.perchY === 0 ? POND : null, cat.position.x, cat.position.z, dt);
      player.swimming = st.mode === 'swim';
      player.wading = st.mode === 'wade';
      player.inWater = player.swimming || player.wading;
      player.shaking = st.shake > 0;
      cat.position.y = player.perchY + player.hopY;
    },
  };
  return player;
}

function harness(breed = 'tabby') {
  const cat = buildCat(breed);
  const player = standInPlayer(cat);
  const sounds = [];
  const audio = {
    landThump() {}, bell() {}, fanfare() {}, purr() {},
    step: () => sounds.push('step'),
    waterSplash: (kind) => sounds.push(kind),
  };
  const progression = createProgression(fakeStorage());
  const log = { awardOnce: () => 0, award: () => 0 };
  const { updateAvatar } = createAvatarUpdater({
    player, progression, settings: { get: () => false }, log,
    hud: { toast() {} }, audio, petNameFor: () => 'x', completeTag() {}, noteBat() {},
  });
  const s = {
    cat, perched: null, net: null, chasing: null, rest: null,
    freezeTime: 0, pounceTime: 0, pounceCooldown: 0, landTime: 0, idleTime: 0,
    stepPhase: 0, stretchTime: 0, sniffTime: 0, boxTime: 0, pose: 'follow',
    balkedPuddles: new Set(), toy: { active: false }, toyGhost: { visible: false },
    groomTimers: new Map(), remotes: { list: [] }, fx: { burst() {} },
    areaData: { puddles: [], boxes: [] },
    critters: { setFleeModifier() {}, markStalked() {}, catchAt: () => null, pounceCatch: () => null },
  };
  let t = 0;
  const tick = (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) {
      t += dt;
      player.update(dt);
      updateAvatar(s, dt, t);
    }
  };
  const at = (x, z = 0) => cat.position.set(x, cat.position.y, z);
  return { cat, player, s, sounds, tick, at };
}

describe('my cat in the water', () => {
  it('no nap in the shallows', () => {
    const h = harness();
    h.at(WADE_X);
    h.tick(20 * 60);
    expect(h.player.wading).toBe(true);
    expect(h.s.idleTime).toBe(0);
    expect(h.s.pose).toBe('follow');
  });

  it('the land pose is what goes on the wire', () => {
    const h = harness();
    h.at(WADE_X);
    h.tick(60);
    expect(h.player.wading).toBe(true);
    expect(h.s.pose).toBe('follow');
    // ...while the drawn body is lowered into the water
    expect(h.cat.position.y).toBeLessThan(-0.05);
    expect(h.cat.position.y).toBeCloseTo(-h.player.waterState.sink, 6);
  });

  it('the shake sound plays once per climb-out', () => {
    const h = harness();
    h.at(0); // deep, past SHAKE_AFTER_SWIM (1 s)
    h.tick(90);
    expect(h.player.swimming).toBe(true);
    h.at(6); // out onto the bank
    h.tick(120);
    expect(h.player.inWater).toBe(false);
    expect(h.sounds.filter((k) => k === 'shake')).toHaveLength(1);
    // and back in and out again: one more
    h.at(0);
    h.tick(90);
    h.at(6);
    h.tick(120);
    expect(h.sounds.filter((k) => k === 'shake')).toHaveLength(2);
  });

  it('wading strides splash instead of tick', () => {
    const h = harness();
    h.at(WADE_X);
    h.player.speed = 1.0; // a wading pace, under the land gate of 1.5
    h.tick(180);
    expect(h.sounds.filter((k) => k === 'wade').length).toBeGreaterThan(2);
    expect(h.sounds).not.toContain('step');
    expect(h.sounds).not.toContain('paddle');
    // swimming paddles
    h.at(0);
    h.tick(180);
    expect(h.sounds.filter((k) => k === 'paddle').length).toBeGreaterThan(2);
    expect(h.sounds).not.toContain('step');
  });

  it('on land the footsteps are as before', () => {
    const h = harness();
    h.at(10);
    h.player.speed = 1.0;
    h.tick(180);
    expect(h.sounds).toHaveLength(0); // under 1.5: silent, as today
    h.player.speed = 3;
    h.tick(60);
    expect(h.sounds.length).toBeGreaterThan(0);
    expect(h.sounds.every((k) => k === 'step')).toBe(true);
  });

  it('perched straight from the water: no shake sound', () => {
    const h = harness();
    h.at(0);
    h.tick(120);
    expect(h.player.swimming).toBe(true);
    h.player.perchY = 0.6;
    h.s.perched = { x: 0, y: 0.6, z: 0 };
    h.tick(120);
    expect(h.player.inWater).toBe(false);
    expect(h.sounds).not.toContain('shake');
    // and the cat sits on the perch, not sunk below it
    expect(h.cat.position.y).toBeCloseTo(0.6, 3);
  });
});

describe('a pounce landing', () => {
  const land = (h, x) => {
    const bursts = [];
    h.s.fx.burst = (...a) => bursts.push(a);
    h.at(x);
    h.tick(60); // settle into the water state
    h.sounds.length = 0;
    h.s.pounceTime = 0.01;
    h.tick(2);
    return bursts;
  };

  it('in water: a wade splash, no dust poof', () => {
    const h = harness();
    const bursts = land(h, WADE_X);
    expect(h.player.inWater).toBe(true);
    expect(bursts.filter((b) => b[1] === 0xcbb8a0)).toHaveLength(0);
    expect(h.sounds).toContain('wade');
  });

  it('on land: the dust poof and thump are unchanged', () => {
    const h = harness();
    const bursts = [];
    h.s.fx.burst = (...a) => bursts.push(a);
    h.at(10);
    h.tick(60);
    h.sounds.length = 0;
    h.s.pounceTime = 0.01;
    h.tick(2);
    expect(bursts.filter((b) => b[1] === 0xcbb8a0)).toHaveLength(1);
    expect(h.sounds).not.toContain('wade');
  });
});

// Fight moves and scars (Task 8, R8): the new fight states go on the wire as
// states every build knows; the drawn pose is still the fight's own.
describe('my cat\'s fight pose on the wire', () => {
  it('s.pose carries wirePose(pose) for every fight state', async () => {
    const { WIRE_POSE } = await import('../src/fightactions.js');
    for (const [fightPose, wire] of [...Object.entries(WIRE_POSE), ['swipe', 'swipe'], ['cross', 'cross']]) {
      const h = harness();
      h.at(20);
      h.s.fight = {};
      h.s.fightPose = fightPose;
      h.tick(1);
      expect(h.s.pose).toBe(wire);
    }
  });
});

// Live check (Task 10): her custom cat's own name tag rides the group, so a
// fight's roll swung it under her and a rear-up swung it aside. It stays
// straight above her through the fight and is back where it was after.
describe('her own name tag in a fight', () => {
  it('stays upright above her while she is pitched and rolled, and goes home after', () => {
    const h = harness();
    h.at(20);
    const tag = new THREE.Object3D();
    tag.position.set(0, 1.1, 0);
    h.cat.add(tag);
    h.cat.userData.ownTag = tag;
    // from her torso centre (on the group's up axis at the body's height)
    const above = () => {
      h.cat.updateMatrixWorld(true);
      const w = new THREE.Vector3();
      tag.getWorldPosition(w);
      const c = h.cat.localToWorld(new THREE.Vector3(0, h.cat.userData.parts.body.position.y, 0));
      return { dx: w.x - c.x, dy: w.y - c.y, dz: w.z - c.z };
    };
    h.s.fight = {};
    h.s.fightPose = 'roll';
    for (const [pitch, roll] of [[0.9, 0], [0, Math.PI], [0.3, -2.2]]) {
      h.s.fightPitch = pitch;
      h.s.fightRoll = roll;
      h.tick(1);
      expect(h.cat.rotation.x).toBeCloseTo(pitch, 9);
      const a = above();
      expect(a.dx).toBeCloseTo(0, 6);
      expect(a.dz).toBeCloseTo(0, 6);
      expect(a.dy).toBeCloseTo((1.1 - h.cat.userData.parts.body.position.y) * h.cat.scale.y, 6);
    }
    h.s.fight = null;
    h.s.fightPose = null;
    h.tick(1);
    expect([tag.position.x, tag.position.y, tag.position.z]).toEqual([0, 1.1, 0]);
  });
});

// polish-hen Task 2: in a fight Hagrid is drawn in his hen states; the wire pose is unchanged.
describe('the fight pose is drawn as a hen for Hagrid only', () => {
  it('Hagrid in a fight takes the hen rig; the wire pose is the usual one', () => {
    const h = harness('hagrid');
    h.s.fight = {}; h.s.fightPose = 'rearUp';
    h.tick(2);
    expect(h.s.pose).toBe(wirePose('rearUp'));
    expect(h.cat.userData.henRig).toBeTruthy();
  });
  it('a tabby in a fight is drawn as itself', () => {
    const h = harness('tabby');
    h.s.fight = {}; h.s.fightPose = 'rearUp';
    h.tick(2);
    expect(h.s.pose).toBe(wirePose('rearUp'));
    expect(h.cat.userData.henRig).toBeUndefined();
  });
  it('Hagrid pouncing outside a fight is today\'s pounce, no hen rig', () => {
    const h = harness('hagrid');
    h.s.pounceTime = 0.3;
    h.tick(2);
    expect(h.s.pose).toBe('pounce');
    expect(h.cat.userData.henRig).toBeUndefined();
  });
});
