import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createAvatarUpdater } from '../src/game/avatar.js';
import { buildCat } from '../src/cat/model.js';
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

function harness() {
  const cat = buildCat('tabby');
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
