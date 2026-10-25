import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { DEN_ITEMS, DEN_SPOTS, DEN_HOMES, clearsCamera } from '../src/den.js';
import { CAT_NAMES, strayBreed } from '../src/straynames.js';
import { denMoment } from '../src/colony.js';
import { createDenCats } from '../src/dencats.js';

// Headless document stub, as test/den.test.js: world/den.js's textures ask for a canvas.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    // A blanket no-op Proxy is enough for the billboard's canvas, but not for
    // render/textures.js's surface tiles, which the world builders now ask
    // for. Two of their calls need a real answer rather than undefined:
    //   * createLinear/RadialGradient — the painters add colour stops to
    //     whatever comes back;
    //   * getImageData — every tile ends with a getImageData/putImageData
    //     readback (clampToFloor, the pass that GUARANTEES no texel falls
    //     below the luminance floor). clampToFloor does guard the headless
    //     path, but it guards it by asking whether getImageData is a
    //     function, which a blanket Proxy always answers yes to.
    // A zeroed buffer is the truthful answer here: nothing was ever actually
    // rasterised into this canvas.
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'measureText') return () => ({ width: 10 }); // name tags measure their label
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});


const { build } = await import('../src/world/den.js');

// The real den (its fixed props and, optionally, every spot furnished), twelve
// (or a full colony's 24) cats, twenty days: nobody may stand inside a prop, a wall or the opening shot.
const scene = { add() {}, remove() {} };
const obstaclesOf = (area) => [
  ...area.colliders.map((c) => ({ x: c.x, z: c.z, r: c.r })),
  ...area.boxes.map((b) => ({ x: b.x, z: b.z, r: 0.5 })),
];

function simulate(placed, n = 12) {
  const area = build(new THREE.Scene(), { placed });
  const obstacles = obstaclesOf(area);
  const bad = [];
  let total = 0;
  for (let day = 1; day <= 20; day++) {
    const ymd = `2026-11-${String(day).padStart(2, '0')}`;
    const cats = CAT_NAMES.slice(0, n).map((name, i) => ({
      name, breed: strayBreed(name), wear: null, home: { x: DEN_HOMES[i].x, z: DEN_HOMES[i].z }, moment: denMoment(name, ymd),
    }));
    const dc = createDenCats(scene, cats, { obstacles });
    for (const e of dc.list) {
      total++;
      const p = e.group.position;
      const r = e.moment.act === 'box' ? 0.75 : 0.45;
      const hit = obstacles.find((o) => Math.hypot(o.x - p.x, o.z - p.z) < r + o.r - 1e-6);
      if (hit || Math.abs(p.x) > 7.5 || Math.abs(p.z) > 7.5 || !clearsCamera(p.x, p.z, 0.5, 0.8)) bad.push({ day, name: e.name, act: e.moment.act, x: p.x, z: p.z, hit });
    }
    dc.dispose();
  }
  return { bad, total };
}

describe('den cats in the real den', () => {
  it('an unfurnished den: no cat inside a fixed prop, the walls or the opening shot over 20 days', () => {
    const { bad, total } = simulate({});
    expect(total).toBe(240);
    expect(bad).toEqual([]);
  });
  it('a den with every spot furnished (big pieces everywhere) stays clear too', () => {
    const items = Object.keys(DEN_ITEMS);
    const placed = Object.fromEntries(DEN_SPOTS.map((s, i) => [s.id, items[(i * 5) % items.length]]));
    const { bad } = simulate(placed);
    expect(bad).toEqual([]);
  });
  // Final review C1: a full colony is 24 cats (two siblings' solo colonies).
  it('a full colony of 24 cats: the bare den and the fully furnished one both stay clear', () => {
    const bare = simulate({}, DEN_HOMES.length);
    expect(bare.total).toBe(20 * 24);
    expect(bare.bad).toEqual([]);
    const items = Object.keys(DEN_ITEMS);
    const placed = Object.fromEntries(DEN_SPOTS.map((s, i) => [s.id, items[(i * 5) % items.length]]));
    expect(simulate(placed, DEN_HOMES.length).bad).toEqual([]);
  });
});
