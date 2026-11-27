import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createAvatarUpdater } from '../src/game/avatar.js';
import { buildCat } from '../src/cat/model.js';
import { createProgression } from '../src/progression.js';
import { createWaterState } from '../src/waterstate.js';
import { newSwim, swimStep, swimPitch } from '../src/cat/reefswim.js';
import { memoryStorage as fakeStorage } from './helpers/storage.js';

// The Reef's swim pose: driven through the real updateAvatar with a stand-in player whose floatY the test sets.
async function harness({ canFloat = true, rm = false } = {}) {
  const cat = buildCat('tabby');
  const player = {
    perchY: 0, hopY: 0, speed: 0, speedFactor: 1, inputActive: false, stalking: false, swimming: false, wading: false, inWater: false,
    shaking: false, waterState: createWaterState(), canFloat, floatY: 0, clearFloat() { this.floatY = 0; },
  };
  const { updateAvatar } = createAvatarUpdater({
    player, progression: createProgression(fakeStorage()), settings: { get: () => rm }, log: { awardOnce: () => 0, award: () => 0 },
    hud: { toast() {} }, audio: { landThump() {}, bell() {}, fanfare() {}, purr() {}, step() {}, waterSplash() {} }, petNameFor: () => 'x', completeTag() {}, noteBat() {},
  });
  const s = {
    cat, perched: null, net: null, chasing: null, rest: null, freezeTime: 0, pounceTime: 0, pounceCooldown: 0, landTime: 0, idleTime: 0,
    stepPhase: 0, stretchTime: 0, sniffTime: 0, boxTime: 0, pose: 'follow', balkedPuddles: new Set(), toy: { active: false }, toyGhost: { visible: false },
    groomTimers: new Map(), remotes: { list: [] }, fx: { burst() {} }, areaData: { puddles: [], boxes: [] },
    critters: { setFleeModifier() {}, markStalked() {}, catchAt: () => null, pounceCatch: () => null },
  };
  let t = 0;
  const tick = (n, y, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) { t += dt; player.floatY = typeof y === 'function' ? y(t) : y; updateAvatar(s, dt, t); } };
  if (canFloat) { tick(1, 0); await new Promise((r) => setTimeout(r, 20)); } // the swim module loads on the first float place
  return { cat, s, tick };
}
const legs = (cat) => cat.userData.parts.legs.map((l) => l.rotation.x);

describe('swim pose parameters', () => {
  it('blends in over about a quarter second and out again', () => {
    const st = newSwim();
    for (let i = 0; i < 7; i++) swimStep(st, true, 1.5, 1 / 60, false);
    expect(st.k).toBeGreaterThan(0.4); expect(st.k).toBeLessThan(0.6);
    for (let i = 0; i < 20; i++) swimStep(st, true, 1.5, 1 / 60, false);
    expect(st.k).toBe(1);
    for (let i = 0; i < 20; i++) swimStep(st, false, 0, 1 / 60, false);
    expect(st.k).toBe(0);
  });
  it('nose up while rising, down while sinking, level at rest, none in reduced motion', () => {
    const rise = newSwim(), sink = newSwim(), rest = newSwim(), still = newSwim();
    let y = 0.5;
    for (let i = 0; i < 60; i++) { y += 1.2 / 60; swimStep(rise, true, y, 1 / 60, false); swimStep(still, true, y, 1 / 60, true); }
    y = 2; for (let i = 0; i < 60; i++) { y -= 0.6 / 60; swimStep(sink, true, y, 1 / 60, false); }
    for (let i = 0; i < 90; i++) swimStep(rest, true, 1.5, 1 / 60, false);
    expect(swimPitch(rise)).toBeLessThan(-0.2);
    expect(swimPitch(sink)).toBeGreaterThan(0.05);
    expect(Math.abs(swimPitch(rest))).toBeLessThan(0.01);
    expect(swimPitch(still)).toBe(0);
    expect(rise.kick).toBeGreaterThan(0.5);
    expect(still.kick).toBe(0);
  });
});

describe('the swim pose on her cat', () => {
  it('floatY 0 and 0.5 m: the walking pose at 0 (no swim), the swim at 0.5 and 1.5', async () => {
    const h = await harness();
    h.tick(60, 0);
    expect(h.s.swim.k).toBe(0);
        const walk = legs(h.cat);
    h.tick(60, 0.5);
    expect(h.s.swim.k).toBe(1);
    const a = legs(h.cat);
    h.tick(60, 1.5);
    const b = legs(h.cat);
    // front legs reach forward, back legs trail: opposite signs on average over a paddle cycle
    expect(a).not.toEqual(walk);
    let fsum = 0, bsum = 0;
    for (let i = 0; i < 120; i++) { h.tick(1, 1.5); const l = legs(h.cat); fsum += l[0] + l[1]; bsum += l[2] + l[3]; }
    expect(fsum).toBeLessThan(0); expect(bsum).toBeGreaterThan(0);
    expect(b.every(Number.isFinite)).toBe(true);
  });
  it('pitches with the climb and puts the bubbles faster while kicking', async () => {
    const h = await harness();
    h.tick(30, 0.4);
    h.tick(40, (t) => 0.4 + (t % 100) * 0); // hold
    const rest = h.cat.rotation.x;
    let y = 0.4; h.tick(40, () => (y += 0.02));
    expect(h.cat.rotation.x).toBeLessThan(rest - 0.1);
    expect(h.cat.userData.swimKick).toBeGreaterThan(0.3);
    h.tick(60, y);
    expect(h.cat.userData.swimKick).toBeLessThan(0.05);
  });
  it('reduced motion: a still pose, no bob, no bubbles', async () => {
    const h = await harness({ rm: true });
    h.tick(30, 1.5);
    const a = legs(h.cat), y0 = h.cat.position.y, r0 = h.cat.rotation.x;
    h.tick(37, 1.5);
    legs(h.cat).forEach((v, i) => expect(v).toBeCloseTo(a[i], 9));
    expect(h.cat.position.y).toBe(y0);
    expect(h.cat.rotation.x).toBe(r0);
    expect(h.cat.userData.swimKick).toBe(0);
  });
  it('no float in the place: nothing is touched', async () => {
    const h = await harness({ canFloat: false });
    h.tick(60, 1.5);
    expect(h.s.swim).toBeUndefined();
    expect(h.cat.userData.swimDo ?? null).toBeNull();
    expect(h.cat.rotation.x).toBe(0);
  });
});
