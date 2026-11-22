import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, key) => {
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

const { createPlayer } = await import('../src/player.js');
const P = await import('../src/world/lighthouseplan.js');
const { createWaterState, stepWaterState } = await import('../src/waterstate.js');
const { behindYaw, facingYaw } = await import('../src/traversal.js');

// Lighthouse Point, milestone 1: the real player on the real plan (a cat of the game's own pace, the
// ground's steps and slopes, the colliders, the waters), the way main.js's frame runs her.

const area = P.lighthouseArea();

function walker(at, face) {
  const camera = new THREE.PerspectiveCamera();
  const cat = new THREE.Group();
  cat.position.set(at[0], area.ground.y(at[0], at[1]), at[1]);
  cat.rotation.y = facingYaw(face[0], face[1]);
  const player = createPlayer(camera, { addEventListener() {} });
  player.setAvatar(cat, 3.5);
  player.setGround(area.ground);
  player.setViewYaw(behindYaw(face[0], face[1]));
  player.enable();
  player.setTouchMove({ x: 0, z: -1, mag: 1 });
  const step = (seconds, until = () => false) => {
    for (let i = 0; i < seconds * 60 && !until(); i++) player.update(1 / 60, area.colliders, area.bounds, area.waters);
  };
  const turn = (face2) => { player.setViewYaw(behindYaw(face2[0], face2[1])); };
  return { camera, cat, player, step, turn };
}

describe('the real player on Lighthouse Point', () => {
  it('climbs the cliff path from the cove to the plateau: along the foot, round the landing, up to the top', () => {
    const w = walker([4, 16], [-1, 0]);
    const ys = [];
    w.step(12, () => w.cat.position.x < -22.9);
    ys.push(w.cat.position.y);
    expect(w.cat.position.x).toBeLessThan(-22.9);
    expect(w.cat.position.y).toBeGreaterThan(2.7); // up the first flight to the landing's level
    expect(Math.abs(w.cat.position.z - 16)).toBeLessThan(0.95); // on the path, never off its side
    // round the landing and north
    w.cat.position.x = Math.max(w.cat.position.x, -24.4);
    w.turn([0, -1]);
    w.step(12, () => w.cat.position.z < 3);
    expect(w.cat.position.z).toBeLessThan(3);
    expect(w.cat.position.y).toBe(6);
    expect(Math.abs(w.cat.position.x + 24.4)).toBeLessThan(1.0);
    expect(ys[0]).toBeLessThan(3.2);
  });

  it('goes back down the same way, and is never stopped on the slope', () => {
    const w = walker([-24.4, 2.5], [0, 1]);
    w.step(12, () => w.cat.position.z > 14.5);
    expect(w.cat.position.z).toBeGreaterThan(14.5);
    expect(w.cat.position.y).toBeLessThan(3.2);
  });

  it('is turned back by the plateau\'s cliff: walking east off the plateau stops at its edge', () => {
    const w = walker([-12, -10], [1, 0]);
    w.step(8);
    expect(w.cat.position.x).toBeLessThanOrEqual(-6 + 1e-6);
    expect(w.cat.position.y).toBe(6);
  });

  it('cannot walk through the tower: walking at it stops at the gallery\'s wall, still on the plateau', () => {
    const w = walker([-22, -8], [0, -1]);
    w.step(8);
    const d = Math.hypot(w.cat.position.x - P.TOWER.x, w.cat.position.z - P.TOWER.z);
    expect(d).toBeGreaterThanOrEqual(P.TOWER.gallery); // the 7.5 m rim of the gallery's disc
    expect(w.cat.position.y).toBe(6);
  });

  it('cannot walk through the keeper\'s cottage, nor the garden\'s wall', () => {
    const a = walker([-20, -7], [-1, 0]);
    a.step(8);
    expect(a.cat.position.x).toBeGreaterThanOrEqual(-28.4 - 0.1); // the porch's edge, collider circles 2.2 + her 0.35 from x -30.9
    const b = walker([-35.6, 1], [0, -1]);
    b.step(5);
    expect(b.cat.position.z).toBeGreaterThanOrEqual(-2.2 + 0.4 + 0.3); // the garden's north wall
    const gate = walker([-33.4, 1], [0, -1]);
    gate.step(5);
    expect(gate.cat.position.z).toBeLessThan(-3); // and the gate's gap lets her through
  });

  it('wades a rock pool end to end without swimming, as in the spike', () => {
    const p = P.POOLS[3];
    const w = walker([p.x, p.z + p.r + 2.5], [0, -1]);
    const ws = createWaterState();
    let waded = false;
    let minZ = Infinity;
    for (let i = 0; i < 60 * 5; i++) {
      w.player.update(1 / 60, area.colliders, area.bounds, area.waters);
      stepWaterState(ws, area.waters, w.cat.position.x, w.cat.position.z, 1 / 60);
      expect(ws.mode).not.toBe('swim');
      if (ws.mode === 'wade') waded = true;
      minZ = Math.min(minZ, w.cat.position.z);
    }
    expect(waded).toBe(true);
    expect(minZ).toBeLessThan(p.z - p.r - 0.3);
  });

  it('is held at the waterline of the east sea, wading no deeper than its shallow band', () => {
    const w = walker([30, 30], [1, 0]);
    w.step(8);
    expect(w.cat.position.x).toBeGreaterThan(P.SEA_EAST.minX); // she wades in a little
    expect(w.cat.position.x).toBeLessThanOrEqual(P.SEA_EAST.minX + P.SEA_EAST.shallow + 1e-6);
  });

  it('the spawn faces the place: from the cove she walks north to the pools and up the beach without a wall', () => {
    const w = walker([P.LIGHTHOUSE_SPAWN.x, P.LIGHTHOUSE_SPAWN.z], [0, -1]);
    w.step(4);
    expect(w.cat.position.z).toBeLessThan(P.LIGHTHOUSE_SPAWN.z - 8);
    expect(w.cat.position.y).toBe(0);
  });
});
