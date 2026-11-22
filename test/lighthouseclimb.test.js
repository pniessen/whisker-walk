import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
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

const { yardWalk } = await import('./helpers/traversalwalk.js');
const { spikeArea, LANDINGS, TOWER, STAIR } = await import('../src/world/lighthousespike.js');
const { createRemoteCats, liftForState } = await import('../src/remotecats.js');
const { traversalEventEffects } = await import('../src/traversallive.js');
const { behindYaw, facingYaw, STAIR_SPEED } = await import('../src/traversal.js');

// =============================================================================
// Lighthouse milestone 0: the stair on the real player and the real runtime.
// The stick is held straight "up" (forward on the screen), as a child's thumb
// would: the camera follows the rail, so up is always up the stair.
// =============================================================================

const area = spikeArea();
const foot = LANDINGS[0];
const [f0] = area.traversal.crossings;
const tangent = { x: f0.ends[0].inX, z: f0.ends[0].inZ };

function atFoot(opts = {}) {
  return yardWalk({ area, at: [foot.x, foot.z], face: [tangent.x, tangent.z], viewYaw: behindYaw(tangent.x, tangent.z), colliders: area.colliders, ...opts });
}
const up = (w) => w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
const down = (w) => w.player.setTouchMove({ x: 0, z: 1, mag: 1 });

describe('the tower stair', () => {
  it('one held push climbs foot, two landings and top ledge, and ends on the gallery level', () => {
    const w = atFoot();
    up(w);
    const speeds = [];
    let t = 0;
    for (; t < 40 * 60 && !(w.events.filter((e) => e.type === 'mount').length === 3 && !w.live.busy); t++) {
      w.frame();
      if (w.live.crossing) speeds.push(w.live.speed);
    }
    expect(w.events.map((e) => e.type).filter((x) => x === 'mount')).toHaveLength(3);
    expect(w.events.some((e) => e.type === 'cross')).toBe(false);
    expect(t / 60).toBeLessThan(25);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(STAIR_SPEED + 1e-6);
    expect(Math.max(...speeds)).toBeGreaterThan(STAIR_SPEED - 0.05);
    const top = LANDINGS[3];
    w.run(0.2);
    expect(Math.hypot(w.cat.position.x - top.x, w.cat.position.z - top.z)).toBeLessThan(1.2);
    expect(w.cat.position.y).toBeCloseTo(13.5, 6);
    w.live.dispose();
  }, 60000);

  it('walks the normal pose: no wobble, no balance pose, no tail held out', () => {
    const w = atFoot();
    up(w);
    for (let i = 0; i < 200; i++) w.frame();
    expect(w.live.crossing?.kind).toBe('stair');
    expect(w.live.pose).toBeNull();
    const tail = { rotation: { x: 0.123 } };
    w.cat.userData.parts = { tail };
    for (let i = 0; i < 400 && w.live.crossing; i++) { w.frame(); expect(w.cat.rotation.z).toBe(0); }
    expect(tail.rotation.x).toBe(0.123);
    w.live.dispose();
  }, 60000);

  it('the stick back walks down again, from the top flight to the foot', () => {
    const top = LANDINGS[2];
    const c3 = area.traversal.crossings[2];
    const w = yardWalk({ area, at: [top.x, top.z], face: [c3.ends[0].inX, c3.ends[0].inZ], viewYaw: behindYaw(c3.ends[0].inX, c3.ends[0].inZ), colliders: area.colliders });
    up(w);
    for (let i = 0; i < 90 && !w.live.busy; i++) w.frame();
    for (let i = 0; i < 120; i++) w.frame();
    const y1 = w.cat.position.y;
    expect(y1).toBeGreaterThan(11.5);
    down(w);
    for (let i = 0; i < 60 * 40; i++) {
      w.frame();
      if (!w.live.busy && w.cat.position.y <= 6.0001) break;
    }
    expect(w.cat.position.y).toBeLessThan(y1);
    w.live.dispose();
  }, 60000);

  it('no stair flight counts as a crossing for Tightrope Tail', () => {
    const w = atFoot();
    up(w);
    for (let i = 0; i < 60 * 30; i++) w.frame();
    const tally = vi.fn();
    for (const e of w.events) traversalEventEffects(e, { tally });
    expect(tally).not.toHaveBeenCalled();
    w.live.dispose();
  }, 60000);
});

describe('a partner sees her height on the stair and the gallery', () => {
  const fakeScene = () => ({ add() {}, remove() {} });
  const drawn = (x, z, h) => {
    const remotes = createRemoteCats(fakeScene(), { ground: area.ground });
    remotes.upsert({ playerId: 'aaa', petName: 'Hagrid', breed: 'tabby', accessories: {} }, 0);
    remotes.applyState({ v: 1, id: 'aaa', pos: [x, z], yaw: 0, pose: 'follow', speed: 0, ...liftForState(h, null) }, 0);
    let now = 0;
    for (let i = 0; i < 30; i++) { now += 1 / 60; remotes.update(1 / 60, now); }
    return remotes.list[0].group.position;
  };

  it('on every flight, the height on the wire puts the partner on the rail', () => {
    const w = atFoot();
    up(w);
    let checked = 0;
    let peak = 0;
    for (let i = 0; i < 60 * 30; i++) {
      w.frame();
      if (i % 11 || !w.live.crossing) continue;
      const { x, y, z } = w.cat.position;
      expect(w.player.perchY).toBeCloseTo(y - area.ground.y(x, z), 9);
      const sent = liftForState(w.player.perchY, null);
      const d = drawn(x, z, w.player.perchY);
      expect(Math.abs(d.y - y)).toBeLessThan(0.02);
      peak = Math.max(peak, sent.h ?? 0);
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
    expect(peak).toBeGreaterThan(6); // well inside the wire's 20 m
    w.live.dispose();
  }, 60000);

  it('on the gallery she sends no height (the ground is 13.5 there) and is drawn at 13.5', () => {
    const x = TOWER.x + 4;
    const z = TOWER.z;
    expect(liftForState(0, null)).toEqual({});
    expect(drawn(x, z, 0).y).toBeCloseTo(13.5, 6);
  });
});

describe('a quick way down', () => {
  it('a drop off the first landing lands on the plateau', () => {
    const hop = area.traversal.hops.find((h) => h.id === 'drop-landing-1');
    expect(hop.y0).toBe(8.5);
    expect(hop.y1).toBe(6);
    const w = yardWalk({ area, at: [hop.x0, hop.z0], face: [hop.x1 - hop.x0, hop.z1 - hop.z0], colliders: area.colliders });
    w.frame();
    expect(w.jump()).toBeTruthy();
    for (let i = 0; i < 120 && w.live.busy; i++) w.frame();
    expect(w.events.map((e) => e.type)).toEqual(['drop', 'land']);
    expect(w.cat.position.x).toBeCloseTo(hop.x1, 6);
    expect(w.cat.position.z).toBeCloseTo(hop.z1, 6);
    expect(w.cat.position.y).toBeCloseTo(6, 6);
  });
});

void THREE; void facingYaw; void STAIR;
