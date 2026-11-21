import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (test/flattrace.test.js).
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
const { roofsArea } = await import('../src/world/roofsplan.js');
const { createRemoteCats, liftForState } = await import('../src/remotecats.js');
const { CATALOG, createProgression } = await import('../src/progression.js');
const { decideWalkOnHave, walkOnMove, pickOnCrossing } = await import('../src/gatecross.js');

// =============================================================================
// Two players on the Rooftops (Rooftops step 4, Task 6). A partner on a plank
// or mid-leap is drawn on the other device at her real height, not on the back
// yard below; and a room walks on through the town's gate only together.
// =============================================================================

const PROFILE = { playerId: 'aaa', petName: 'Hagrid', breed: 'tabby', accessories: {} };
const fakeScene = () => ({ add() {}, remove() {} });

// What the other device draws: a remote fed the 8 Hz state this device would send.
function drawnAt(area, x, z, perchY) {
  const remotes = createRemoteCats(fakeScene(), { ground: area.ground });
  remotes.upsert(PROFILE, 0);
  remotes.applyState({ v: 1, id: 'aaa', pos: [x, z], yaw: 0, pose: 'follow', speed: 0, ...liftForState(perchY, null) }, 0);
  let now = 0;
  for (let i = 0; i < 30; i++) { now += 1 / 60; remotes.update(1 / 60, now); } // well past the 150 ms window
  return remotes.list[0].group.position;
}

describe('a partner on the Rooftops is drawn at her real height', () => {
  it('on a plank over a back yard, at the plank\'s rail height', () => {
    const area = roofsArea();
    const w = yardWalk({ area, at: [-24, 29.4], face: [0, -1] });
    w.push(0, -1);
    for (let i = 0; i < 60 && !w.live.busy; i++) w.frame();
    expect(w.live.crossing?.id).toBe('plank-1');
    // to the middle of the plank, over the yard
    for (let i = 0; i < 900 && w.cat.position.z > 24.2; i++) w.frame();
    expect(w.live.busy).toBe(true);
    const { x, y, z } = w.cat.position;
    expect(z).toBeLessThan(24.5);
    expect(z).toBeGreaterThan(23.5);
    const under = area.ground.y(x, z);
    expect(y - under).toBeGreaterThan(2); // she is well above the yard under her
    expect(w.player.perchY).toBeCloseTo(y - under, 9);
    const sent = liftForState(w.player.perchY, null);
    expect(sent.h).toBeCloseTo(y - under, 2);
    const drawn = drawnAt(area, x, z, w.player.perchY);
    expect(drawn.y).toBeCloseTo(y, 1);
    expect(Math.abs(drawn.y - y)).toBeLessThan(0.02);
    expect(Math.abs(drawn.y - (area.ground.y(x, z) + sent.h))).toBeLessThan(0.02);
    w.live.dispose();
  }, 60000);

  it('mid-leap the same', () => {
    const area = roofsArea();
    // return-1-east: a level leap over a side return at z 18, from ext-1's east end
    const hop = area.traversal.hops.find((h) => h.id === 'return-1-east');
    expect(hop).toBeTruthy();
    const w = yardWalk({ area, at: [hop.x0, hop.z0], face: [1, 0] });
    let peak = 0;
    let checked = 0;
    w.frame();
    expect(w.jump()).toBeTruthy();
    for (let i = 0; i < 600; i++) {
      w.frame();
      const { x, y, z } = w.cat.position;
      const above = y - area.ground.y(x, z);
      if (w.player.perchY > 0.3) {
        checked++;
        peak = Math.max(peak, w.player.perchY);
        expect(w.player.perchY).toBeCloseTo(above, 9);
        if (checked % 7 === 0) {
          const drawn = drawnAt(area, x, z, w.player.perchY);
          expect(Math.abs(drawn.y - y)).toBeLessThan(0.02);
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(peak).toBeGreaterThan(0.5);
  }, 60000);
});

describe('a room walks on through the town\'s gate together', () => {
  const have = (id, ok = true) => ({ v: 1, id, type: 'walk-on-have', via: 'town-roofs', ok });
  const ctx = { areaId: 'neighborhood', via: 'town-roofs', selfId: 'a', remoteIds: ['b', 'c'], catalog: CATALOG, ready: true };
  const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

  it('only when every device has the Rooftops', () => {
    expect(decideWalkOnHave([have('b')], ctx)).toEqual({ kind: 'wait', waiting: ['c'] }); // one not ready: all stay in the Neighborhood
    expect(decideWalkOnHave([have('b'), have('c', false)], ctx)).toEqual({ kind: 'no', id: 'c' });
    expect(decideWalkOnHave([have('b'), have('c')], { ...ctx, ready: false })).toEqual({ kind: 'wait', waiting: [] });
    expect(decideWalkOnHave([have('b'), have('c')], ctx)).toEqual({ kind: 'go' });
  });

  it('a guest who does not own the Rooftops walks it as an override, and a crossing never buys it', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, points: 500, walks: { neighborhood: 4, fair: 3 }, unlocked: { areas: ['neighborhood', 'fair'] } });
    expect(walkOnMove(p.state, CATALOG, 'roofs', { guest: true })).toBe('override');
    expect(walkOnMove(p.state, CATALOG, 'roofs')).toBe('override');
    expect(pickOnCrossing(p, CATALOG, 'roofs')).toBe(false);
    expect(pickOnCrossing(p, CATALOG, 'roofs', { guest: true })).toBe(false);
    expect(p.state.points).toBe(500);
    expect(p.state.unlocked.areas).not.toContain('roofs');
    expect(p.state.area).not.toBe('roofs');
  });
});
