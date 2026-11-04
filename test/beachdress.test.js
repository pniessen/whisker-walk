// polish-beach Task 1: the sand tint, the wet band that matches it, the sky top.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Same headless document stub as test/seaside-visuals.test.js.
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
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { sandTint } = await import('../src/world/beachdress.js');
const { build, SKY_TOP, wetness } = await import('../src/world/seaside.js');

const grid = [];
for (let x = -48; x <= 24; x += 2) for (let z = -34; z <= 48; z += 2) grid.push([x, z]);

describe('sandTint', () => {
  it('is warm and a touch darker on average', () => {
    const mean = [0, 0, 0];
    for (const [x, z] of grid) sandTint(x, z).forEach((v, c) => { mean[c] += v / grid.length; });
    expect(mean[0]).toBeGreaterThan(0.93); expect(mean[0]).toBeLessThan(0.99);
    expect(mean[1]).toBeGreaterThan(0.90); expect(mean[1]).toBeLessThan(0.97);
    expect(mean[2]).toBeGreaterThan(0.84); expect(mean[2]).toBeLessThan(0.93);
    expect(mean[0]).toBeGreaterThan(mean[1]);
    expect(mean[1]).toBeGreaterThan(mean[2]);
  });

  it('varies across the beach', () => {
    const gs = grid.map(([x, z]) => sandTint(x, z)[1]);
    const spread = Math.max(...gs) - Math.min(...gs);
    expect(spread).toBeGreaterThanOrEqual(0.07);
    expect(spread).toBeLessThanOrEqual(0.2);
  });

  it('is smooth', () => {
    for (const [x, z] of grid) {
      expect(Math.abs(sandTint(x, z)[1] - sandTint(x + 1, z)[1])).toBeLessThan(0.02);
    }
  });
});

describe('seaside sand', () => {
  const scene = new THREE.Scene();
  build(scene);

  it('the ground plane carries the tint', () => {
    const ground = scene.children.find((c) => c.userData.ground && c.name !== 'wet-sand' && c.geometry.parameters && c.geometry.parameters.width === 140);
    expect(ground).toBeTruthy();
    const col = ground.geometry.attributes.color;
    let sum = 0;
    for (let i = 0; i < col.count; i++) sum += col.getY(i);
    expect(sum / col.count).toBeLessThan(0.975);
  });

  it('wet sand is tagged ground and matches sandTint at its dry edge', () => {
    const band = scene.children.find((c) => c.name === 'wet-sand');
    expect(band.userData.ground).toBe(true);
    const pos = band.geometry.attributes.position;
    const col = band.geometry.attributes.color;
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + band.position.x;
      // The wet edge wanders along the beach; only the dry vertices must match.
      if (wx > 21.9 || wetness(wx, pos.getZ(i)) > 0) continue;
      const t = sandTint(wx, pos.getZ(i));
      for (let c = 0; c < 3; c++) expect(col.array[i * 3 + c]).toBeCloseTo(t[c], 3);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('the sky top is deeper and the horizon is unchanged', () => {
    expect(SKY_TOP).toBe(0x88bce6);
    expect(scene.fog.color.getHex()).toBe(0xe8e0d0);
  });
});

// polish-beach Task 2: the painted beach (tide lines, ripples, towel, shade).
const { dressBeach, beachKeepOut, BEACH_SPOTS, TIDE_Y, TOWEL_Y } = await import('../src/world/beachdress.js');
const { PAINT_Y } = await import('../src/world/dressing.js');

describe('beach paint', () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  const paint = scene.children.find((c) => c.name === 'beachPaint');
  const pos = paint.geometry.attributes.position;
  const towelHalf = { w: 0.5, l: 0.95 };
  const inTowel = (x, z, pad = 0.05) => {
    const t = BEACH_SPOTS.towel;
    const dx = x - t.x; const dz = z - t.z;
    const along = dx * Math.sin(t.yaw) + dz * Math.cos(t.yaw);
    const across = dx * Math.cos(t.yaw) - dz * Math.sin(t.yaw);
    return Math.abs(along) <= towelHalf.l + pad && Math.abs(across) <= towelHalf.w + pad;
  };

  it('is one noCast mesh tagged ground', () => {
    expect(scene.children.filter((c) => c.name === 'beachPaint')).toHaveLength(1);
    expect(paint.userData.noCast).toBe(true);
    expect(paint.userData.ground).toBe(true);
    expect(paint.material.vertexColors).toBe(true);
    expect(paint.castShadow).toBe(false);
    expect(paint.receiveShadow).toBe(true);
  });

  it('does not change the area record it was given', () => {
    const s2 = new THREE.Scene();
    const a2 = build(s2);
    const before = JSON.stringify(a2, (k, v) => (v && v.isObject3D ? undefined : v));
    dressBeach(new THREE.Scene(), a2);
    expect(JSON.stringify(a2, (k, v) => (v && v.isObject3D ? undefined : v))).toBe(before);
  });

  it('stays flat and under the contact shadows', () => {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      expect(y).toBeLessThan(0.015);
      // Positions are Float32.
      if (x > 21.7) expect(y).toBe(Math.fround(TIDE_Y));
      else if (inTowel(x, z)) expect([PAINT_Y, TOWEL_Y].map(Math.fround)).toContain(y);
      else expect(y).toBe(Math.fround(PAINT_Y));
    }
    expect(TIDE_Y).toBe(0.011);
    expect(TOWEL_Y).toBeGreaterThan(PAINT_Y);
    expect(TOWEL_Y).toBeLessThan(0.015);
  });

  it('puts no paint in the sea or on the deck', () => {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const z = pos.getZ(i);
      expect(x).toBeLessThan(24.6);
      expect(x > 18.1 && x < 21.9 && Math.abs(z) < 45).toBe(false);
    }
  });

  it('faces up', () => {
    for (let t = 0; t < pos.count; t += 3) {
      const ax = pos.getX(t + 1) - pos.getX(t); const az = pos.getZ(t + 1) - pos.getZ(t);
      const bx = pos.getX(t + 2) - pos.getX(t); const bz = pos.getZ(t + 2) - pos.getZ(t);
      expect(az * bx - ax * bz).toBeGreaterThan(0);
    }
  });

  it('runs a tide line the length of the beach', () => {
    const bins = new Set();
    for (let t = 0; t < pos.count; t += 3) {
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
      const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      if (cx >= 22.2 && cx <= 23.8) bins.add(Math.floor(cz));
    }
    let n = 0; let hit = 0;
    for (let z = -44; z < 44; z++) {
      if (Math.abs(z + 0.5 + 10) < 2.5) continue;
      n++;
      if (bins.has(z)) hit++;
    }
    expect(hit / n).toBeGreaterThanOrEqual(0.45);
  });

  it('seats the towel, the shade and the castles near the spawn and clear of the keep-outs', () => {
    expect(Object.isFrozen(BEACH_SPOTS)).toBe(true);
    expect(BEACH_SPOTS.towel).toMatchObject({ x: 12.5, z: 39.5 });
    expect(BEACH_SPOTS.umbrella).toEqual({ x: 11.2, z: 40.6 });
    expect(BEACH_SPOTS.castles).toEqual([{ x: 9.5, z: 28 }, { x: 13.8, z: 4.5 }]);
    const keep = beachKeepOut(area);
    expect(keep.length).toBeGreaterThan(40);
    const spots = [
      { ...BEACH_SPOTS.towel, r: 1.1, towel: true },
      { ...BEACH_SPOTS.umbrella, r: 1.1 },
      ...BEACH_SPOTS.castles.map((c) => ({ ...c, r: 0.95 })),
    ];
    for (const s of spots) {
      for (const k of keep) {
        const d = Math.hypot(s.x - k.x, s.z - k.z);
        if (s.towel && k.x === 18 && k.z === 42) expect(d).toBeGreaterThanOrEqual(5);
        else expect(d).toBeGreaterThanOrEqual(k.r + s.r);
      }
    }
  });

  it('keeps the ripples off everything a kid might look for', () => {
    const keep = beachKeepOut(area);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const z = pos.getZ(i);
      // Ripples are the only paint on the open front beach away from the
      // towel, the shade and the castle moats.
      if (x < 5 || x > 17.5) continue;
      if (Math.hypot(x - BEACH_SPOTS.umbrella.x, z - BEACH_SPOTS.umbrella.z) < 3.2) continue;
      if (BEACH_SPOTS.castles.some((c) => Math.hypot(x - c.x, z - c.z) < 1.2)) continue;
      for (const k of keep) expect(Math.hypot(x - k.x, z - k.z)).toBeGreaterThanOrEqual(k.r);
    }
  });

  it('matches the dry sand it lies on', () => {
    // Ripple vertices on dry sand stay within ±20% of the sand under them.
    const col = paint.geometry.attributes.color;
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const z = pos.getZ(i);
      if (x < 5 || x > 17.5 || Math.hypot(x - BEACH_SPOTS.umbrella.x, z - BEACH_SPOTS.umbrella.z) < 3.2) continue;
      if (BEACH_SPOTS.castles.some((c) => Math.hypot(x - c.x, z - c.z) < 1.2)) continue;
      const t = sandTint(x, z);
      const k = col.getY(i) / (new THREE.Color(0xdcc28e).g * t[1]);
      expect(k).toBeGreaterThan(0.8); expect(k).toBeLessThan(1.1);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });

  it('stays within its triangle budget', () => {
    expect(paint.geometry.index).toBeNull();
    expect(pos.count / 3).toBeLessThanOrEqual(1100);
  });

  it('is the same on every build', () => {
    const s2 = new THREE.Scene();
    build(s2);
    const p2 = s2.children.find((c) => c.name === 'beachPaint');
    expect(Array.from(p2.geometry.attributes.position.array)).toEqual(Array.from(pos.array));
    expect(p2.uuid).toBe(paint.uuid);
  });
});

// polish-beach Task 3: the beach dressing (shells, starfish, pebbles, seaweed,
// driftwood, sandcastles, bucket and spade, umbrella, the boardwalk's edge).
const { beachAnchors, tideX } = await import('../src/world/beachdress.js');

describe('beach dressing', () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  const dressing = scene.children.find((c) => c.name === 'beachDressing');
  const pos = dressing.geometry.attributes.position;
  const anchors = beachAnchors(area);

  it('dressing is one noCast mesh', () => {
    expect(scene.children.filter((c) => c.name === 'beachDressing')).toHaveLength(1);
    expect(dressing.userData.noCast).toBe(true);
    expect(dressing.castShadow).toBe(false);
    expect(dressing.receiveShadow).toBe(true);
    expect(dressing.userData.ground).toBeFalsy();
    expect(dressing.material.vertexColors).toBe(true);
    expect(dressing.material.side).toBe(THREE.FrontSide);
  });

  it('seaside stays under its triangle ceiling with room', () => {
    let meshes = 0;
    let tris = 0;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    expect(Math.round(tris)).toBeLessThanOrEqual(29600);
    expect(meshes).toBe(70);
    expect(pos.count / 3).toBeLessThanOrEqual(1800);
  });

  it('has the props it promises', () => {
    const n = (k) => anchors.filter((a) => a.kind === k).length;
    expect(n('shell')).toBeGreaterThanOrEqual(30);
    expect(n('starfish')).toBe(3);
    expect(n('pebble')).toBeGreaterThanOrEqual(40);
    expect(n('kelp')).toBeGreaterThanOrEqual(12);
    expect(n('driftwood')).toBe(3);
    expect(n('castle')).toBe(2);
    expect(n('bucket')).toBe(1);
    expect(n('umbrella')).toBe(1);
  });

  it('anchors keep clear', () => {
    const keep = beachKeepOut(area);
    const b = area.bounds;
    for (const a of anchors) {
      for (const k of keep) {
        expect(Math.hypot(a.x - k.x, a.z - k.z), `${a.kind} at ${a.x},${a.z}`).toBeGreaterThanOrEqual(a.r + k.r);
      }
      expect(a.x).toBeLessThan(24.6);
      expect(a.x >= 18 && a.x <= 22 && Math.abs(a.z) <= 45).toBe(false);
      expect(a.x).toBeGreaterThanOrEqual(b.minX); expect(a.x).toBeLessThanOrEqual(b.maxX);
      expect(a.z).toBeGreaterThanOrEqual(b.minZ); expect(a.z).toBeLessThanOrEqual(b.maxZ);
    }
  });

  it('sits on the paint: the tide line, the moats and the shade', () => {
    for (const a of anchors.filter((q) => q.tide)) expect(Math.abs(a.x - tideX(a.z))).toBeLessThanOrEqual(0.7);
    expect(anchors.filter((a) => a.tide && a.kind === 'shell').length).toBeGreaterThanOrEqual(20);
    expect(anchors.filter((a) => a.tide && a.kind === 'kelp').length).toBeGreaterThanOrEqual(12);
    const castles = anchors.filter((a) => a.kind === 'castle');
    BEACH_SPOTS.castles.forEach((c, i) => expect(castles[i]).toMatchObject({ x: c.x, z: c.z }));
    expect(anchors.find((a) => a.kind === 'umbrella')).toMatchObject(BEACH_SPOTS.umbrella);
    const bucket = anchors.find((a) => a.kind === 'bucket');
    const big = BEACH_SPOTS.castles[0];
    const d = Math.hypot(bucket.x - big.x, bucket.z - big.z);
    expect(d).toBeGreaterThan(0.95); expect(d).toBeLessThan(1.8);
  });

  it('puts nothing raised in the sea or on the deck', () => {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const z = pos.getZ(i);
      expect(x).toBeLessThan(24.6);
      expect(x > 18.1 && x < 21.9 && Math.abs(z) < 45).toBe(false);
    }
  });

  it('heights', () => {
    dressing.geometry.computeBoundingBox();
    expect(dressing.geometry.boundingBox.max.y).toBeLessThanOrEqual(2.2);
    const u = BEACH_SPOTS.umbrella;
    for (let i = 0; i < pos.count; i++) {
      if (Math.hypot(pos.getX(i) - u.x, pos.getZ(i) - u.z) > 1.5) expect(pos.getY(i)).toBeLessThanOrEqual(0.65);
    }
  });

  it('nothing floats or sinks', () => {
    dressing.geometry.computeBoundingBox();
    expect(dressing.geometry.boundingBox.min.y).toBeGreaterThanOrEqual(-0.02);
  });

  it('boardwalk edge', () => {
    // Triangles lying wholly on each kerb line, as z-intervals.
    const runs = { west: [], east: [] };
    for (let t = 0; t < pos.count; t += 3) {
      const xs = [0, 1, 2].map((k) => pos.getX(t + k));
      const zs = [0, 1, 2].map((k) => pos.getZ(t + k));
      if (xs.every((x) => x >= 17.9 && x <= 18.05)) runs.west.push([Math.min(...zs), Math.max(...zs)]);
      if (xs.every((x) => x >= 21.95 && x <= 22.1)) runs.east.push([Math.min(...zs), Math.max(...zs)]);
    }
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const z = pos.getZ(i);
      if (x >= 21.95 && x <= 22.1) expect(z > -11.5 && z < -8.5, `east edge vertex at z ${z}`).toBe(false);
    }
    for (const [side, iv] of Object.entries(runs)) {
      for (let z = -44; z <= 44; z += 0.25) {
        if (side === 'east' && z > -11.7 && z < -8.3) continue;
        expect(iv.some(([a, b]) => a <= z && z <= b), `${side} edge at z ${z}`).toBe(true);
      }
    }
  });

  it('is the same on every build', () => {
    const s2 = new THREE.Scene();
    build(s2);
    const d2 = s2.children.find((c) => c.name === 'beachDressing');
    expect(Array.from(d2.geometry.attributes.position.array)).toEqual(Array.from(pos.array));
    expect(d2.uuid).toBe(dressing.uuid);
  });
});
