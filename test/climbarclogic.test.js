// The perch-climb jump is draw-only: game logic (cat.position, the paw button's reach, the net payload) never sees it.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { createInteractions } from '../src/game/interactions.js';
import { createComposerRig } from '../src/game/composer.js';
import { climbArcOffset } from '../src/climbarc.js';
import { CAT_RADIUS } from '../src/player.js';
import { mem } from './helpers/lighthouselife.js';

async function rig(withArc) {
  const P = await import('../src/world/moonplan.js');
  const { build } = await import('../src/world/moon.js');
  const progression = createProgression(mem());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const area = build(new THREE.Scene());
  const cat = new THREE.Vector3();
  const session = {
    areaId: 'moon', areaData: { perches: area.perches }, ground: area.ground, cat: { position: cat, rotation: { y: 0 } }, goals: null,
    perched: null, pounceCooldown: 0, pounceTime: 0, perchHold: null, fx: { burst() {} }, reducedMotion: false,
  };
  let arc = null; let el = 0;
  const player = {
    perchY: 0, inputActive: false, speedFactor: 1, halt() {}, pounce() {}, swimming: false,
    startClimb: withArc ? (a) => { arc = a; el = 0; } : undefined,
    get climbOffset() { return arc ? climbArcOffset(arc, el) : { x: 0, y: 0, z: 0 }; },
  };
  const { doPounceOrClimb } = createInteractions({
    MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null, getSession: () => session, getIsTouch: () => false,
    player, progression, log, hud: { toast() {} }, audio: { trill() {}, pounceWhoosh() {} }, catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
  });
  const advance = (dt) => { el += dt; };
  return { P, area, session, player, cat, press: doPounceOrClimb, advance, arc: () => arc };
}

const footOf = (r, p) => {
  const col = r.area.colliders.find((c) => c.x === p.x && c.z === p.z) ?? { r: 1 };
  const d = col.r + CAT_RADIUS + 0.02;
  return { x: p.x - 0.9 * d, z: p.z + 0.4 * d };
};

describe('the climb jump never reaches game logic', () => {
  it('mid-arc, cat.position is the logical perch spot and the arc is live', async () => {
    const r = await rig(true);
    const [a] = r.P.SKIP;
    const f = footOf(r, a);
    r.cat.set(f.x, r.area.ground.y(f.x, f.z), f.z);
    r.press();
    r.advance(0.1);
    expect(r.session.perched).toMatchObject({ x: a.x, z: a.z });
    expect(r.cat.x).toBe(a.x); expect(r.cat.z).toBe(a.z);
    expect(r.cat.y).toBeCloseTo(r.area.ground.y(a.x, a.z) + a.y, 9);
    expect(r.arc().dur).toBeGreaterThanOrEqual(1.08 - 1e-9);
    expect(Math.hypot(r.player.climbOffset.x, r.player.climbOffset.z)).toBeGreaterThan(0.1); // drawn behind, held apart from the logic
  });
  it('a second press at 0.2 s up the Skip Ridge chain picks exactly what it picks with no arc', async () => {
    const out = [];
    for (const withArc of [false, true]) {
      const r = await rig(withArc);
      const f = footOf(r, r.P.SKIP[0]);
      r.cat.set(f.x, r.area.ground.y(f.x, f.z), f.z);
      r.press(); r.advance(0.2); r.press();
      out.push({ p: r.session.perched && { x: r.session.perched.x, z: r.session.perched.z, y: r.session.perched.y }, cat: r.cat.toArray(), perchY: r.player.perchY });
    }
    expect(out[1]).toEqual(out[0]);
    expect(out[1].p).toMatchObject({ x: expect.any(Number) });
  });
  it('the render wrapper moves the cat for the draw only and puts it back', () => {
    const cat = { position: new THREE.Vector3(1, 2, 3) };
    let seen = null;
    const renderer = { render() { seen = cat.position.clone(); }, getSize() { return new THREE.Vector2(); }, setPixelRatio() {}, getPixelRatio: () => 1 };
    const rig2 = createComposerRig(renderer, new THREE.PerspectiveCamera());
    rig2.renderFrame({ scene: new THREE.Scene(), cat, drawOff: { x: 0.5, y: 0.25, z: -1 } });
    expect(seen.toArray()).toEqual([1.5, 2.25, 2]);
    expect(cat.position.toArray()).toEqual([1, 2, 3]);
  });
  it('nothing writes the offset into avatar.position, and the net payload reads cat.position', () => {
    const pl = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
    expect(pl).not.toMatch(/avatar\.position\.[xyz]\s*[+-]=\s*climb/);
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(main).toMatch(/cat\.position/);
    expect(main).not.toMatch(/drawOff|climbOffset/); // the wire is built from the logical position only
  });
});
