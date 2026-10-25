import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { DEN_ITEMS, DEN_SPOTS, DEN_HOMES, clearsCamera } from '../src/den.js';
import { CAT_NAMES, strayBreed } from '../src/straynames.js';
import { denMoment } from '../src/colony.js';
import { createDenCats } from '../src/dencats.js';
import { roleFor, placedKits } from '../src/clanroles.js';

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

// ---- Queens' little ones (Task 8) -------------------------------------------
// Five shipped queens tamed in name order, each at her own den home, with the
// kits placedKits gives them. They sit beside their mothers, take no slot.
describe('queens and their kits in the real den', () => {
  const QUEENS = CAT_NAMES.filter((n) => roleFor(n) === 'queen');
  const residents = QUEENS.map((name, i) => ({ cat: { name }, home: DEN_HOMES[i] }));
  const catsFor = (ymd) => QUEENS.map((name, i) => ({
    name, breed: strayBreed(name), wear: null, home: { x: DEN_HOMES[i].x, z: DEN_HOMES[i].z }, moment: denMoment(name, ymd),
  }));
  const kits = placedKits(residents, []);
  const kitCount = kits.reduce((n, p) => n + p.kits.length, 0);

  it('every kit is placed beside its mother, clear of her, each other, furniture and walls, over 20 days', () => {
    const items = Object.keys(DEN_ITEMS);
    const furnished = Object.fromEntries(DEN_SPOTS.map((s, i) => [s.id, items[(i * 5) % items.length]]));
    for (const placed of [{}, furnished]) {
      const area = build(new THREE.Scene(), { placed });
      const obstacles = obstaclesOf(area);
      for (let day = 1; day <= 20; day++) {
        const dc = createDenCats(scene, catsFor(`2026-11-${String(day).padStart(2, '0')}`), { obstacles, kits });
        expect(dc.list).toHaveLength(QUEENS.length);       // kits are not den cats
        expect(dc.littles).toHaveLength(kitCount);
        const all = [...dc.list, ...dc.littles];
        for (const k of dc.littles) {
          const p = k.group.position;
          const mother = dc.list.find((e) => e.name === k.queen).group.position;
          // Beside her, not across the room. The bare den keeps them well under
          // 2 m; a den with every spot furnished (worst case, measured 2.64)
          // pushes them a little further around the furniture.
          expect(Math.hypot(p.x - mother.x, p.z - mother.z)).toBeLessThan(3);
          expect(Math.hypot(p.x - mother.x, p.z - mother.z)).toBeGreaterThanOrEqual(0.69);
          for (const o of all) {
            if (o.group === k.group) continue;
            const q = o.group.position;
            expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(0.69);
          }
          const hit = obstacles.find((o) => Math.hypot(o.x - p.x, o.z - p.z) < 0.25 + o.r - 1e-6);
          expect(hit).toBeUndefined();
          expect(Math.abs(p.x)).toBeLessThanOrEqual(7.5);
          expect(Math.abs(p.z)).toBeLessThanOrEqual(7.5);
          expect(clearsCamera(p.x, p.z, 0.5, 0.8)).toBe(true);
        }
        dc.dispose();
      }
    }
  });

  it("a kit's coat is its own stored-name breed, never its mother's", () => {
    const dc = createDenCats(scene, catsFor('2026-11-03'), { kits });
    for (const k of dc.littles) {
      expect(k.breed).toBe(strayBreed(k.name));
      expect(k.body.userData.breed).toBe(strayBreed(k.name));
    }
    dc.dispose();
  });

  it('exposes each kit by name with a world position, and no kits means none', () => {
    const dc = createDenCats(scene, catsFor('2026-11-03'), { kits });
    expect(dc.littles.map((k) => k.name).sort()).toEqual(kits.flatMap((p) => p.kits).sort());
    for (const k of dc.littles) {
      expect(Number.isFinite(k.group.position.x)).toBe(true);
      expect(k.queen).toBeTruthy();
    }
    dc.dispose();
    expect(createDenCats(scene, catsFor('2026-11-03')).littles).toEqual([]);
  });

  it('update animates kits (reduced motion too) and disposes every geometry and material exactly once', () => {
    const counts = new Map();
    const spy = (proto) => {
      const orig = proto.dispose;
      proto.dispose = function counted(...a) {
        counts.set(this, (counts.get(this) ?? 0) + 1);
        return orig.apply(this, a);
      };
      return () => { proto.dispose = orig; };
    };
    const restore = [spy(THREE.BufferGeometry.prototype), spy(THREE.Material.prototype), spy(THREE.Texture.prototype)];
    try {
      for (const reducedMotion of [false, true]) {
        counts.clear();
        const dc = createDenCats(scene, catsFor('2026-11-03'), { kits, reducedMotion });
        dc.update(0.016, 1.5, { x: 0, z: 0 });
        dc.update(0.016, 1.6);
        dc.dispose();
        expect(counts.size).toBeGreaterThan(0);
        expect([...counts.values()].filter((n) => n !== 1)).toEqual([]);
      }
    } finally {
      restore.forEach((r) => r());
    }
  });
});
