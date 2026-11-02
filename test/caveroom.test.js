import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/park.test.js).
vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'measureText') return () => ({ width: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const gorge = await import('../src/world/gorge.js');
const { GORGE_CAVES, CHAMBER_HEADROOM } = await import('../src/world/gorgeshape.js');
const { COVE_FROM, LINER_IN, CORNER_R, STALACTITE_MIN_Y } = await import('../src/world/caveroom.js');
const { segDist } = await import('../src/segdist.js');

const T = 120_000;
const chamberOf = (cave) => cave.rects.find((r) => r.tag.endsWith('-chamber'));
const pathDist = (cave, x, z) => Math.min(...cave.path.slice(1).map((q, i) => segDist(x, z, ...cave.path[i], ...q)));
const inside = (r, x, z) => Math.min(x - r.minX, r.maxX - x, z - r.minZ, r.maxZ - z);
const vertsOf = (geo) => {
  const p = geo.attributes.position;
  const out = [];
  for (let i = 0; i < p.count; i++) out.push({ x: p.getX(i), y: p.getY(i), z: p.getZ(i), i });
  return out;
};
const trisOf = (geo) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;

const rooms = new Map();
const roomOf = (id) => {
  if (!rooms.has(id)) rooms.set(id, gorge.caveRoomFor(id));
  return rooms.get(id);
};

describe('caveroom: the deep caves\' chambers', () => {
  it('exports its constants', () => {
    expect([COVE_FROM, LINER_IN, CORNER_R, STALACTITE_MIN_Y]).toEqual([2.0, 0.05, 1.1, 2.0]);
  });

  it('is deterministic: two builds give the same positions', () => {
    for (const cave of GORGE_CAVES) {
      const a = gorge.caveRoomFor(cave.id);
      const b = gorge.caveRoomFor(cave.id);
      expect(Array.from(b.geometry.attributes.position.array)).toEqual(Array.from(a.geometry.attributes.position.array));
      expect(Array.from(b.geometry.attributes.color.array)).toEqual(Array.from(a.geometry.attributes.color.array));
    }
  }, T);

  it('carries position, normal and colour, and counts its parts', () => {
    for (const cave of GORGE_CAVES) {
      const room = roomOf(cave.id);
      for (const k of ['position', 'normal', 'color']) expect(room.geometry.attributes[k], `${cave.id} ${k}`).toBeTruthy();
      const { liner, stalactites, moss, nest } = room.parts;
      expect(liner + stalactites + moss + nest, cave.id).toBe(trisOf(room.geometry));
      expect(liner, cave.id).toBeGreaterThan(0);
      expect(moss, cave.id).toBeGreaterThan(0);
      for (const v of room.geometry.attributes.normal.array) expect(Number.isFinite(v)).toBe(true);
    }
  }, T);

  it('stays inside its chamber, on its floor and under its roof', () => {
    for (const cave of GORGE_CAVES) {
      const r = chamberOf(cave);
      for (const v of vertsOf(roomOf(cave.id).geometry)) {
        const where = `${cave.id} (${v.x.toFixed(2)}, ${v.y.toFixed(3)}, ${v.z.toFixed(2)})`;
        expect(v.x, where).toBeGreaterThanOrEqual(r.minX - 0.01);
        expect(v.x, where).toBeLessThanOrEqual(r.maxX + 0.01);
        expect(v.z, where).toBeGreaterThanOrEqual(r.minZ - 0.01);
        expect(v.z, where).toBeLessThanOrEqual(r.maxZ + 0.01);
        expect(v.y, where).toBeGreaterThanOrEqual(cave.y - 0.03);
        expect(v.y, where).toBeLessThanOrEqual(cave.y + CHAMBER_HEADROOM);
      }
    }
  }, T);

  it('keeps everything low that stands into the room off the path and the finds (Review Focus 2)', () => {
    for (const cave of GORGE_CAVES) {
      const r = chamberOf(cave);
      const finds = gorge.caveFinds(cave);
      expect(finds.length, cave.id).toBeGreaterThanOrEqual(1);
      const others = cave.rects.filter((q) => q !== r);
      for (const v of vertsOf(roomOf(cave.id).geometry)) {
        const where = `${cave.id} (${v.x.toFixed(2)}, ${v.y.toFixed(3)}, ${v.z.toFixed(2)})`;
        // never in the bend or the corridor, but on the chamber's own edge
        for (const q of others) {
          const inQ = v.x > q.minX && v.x < q.maxX && v.z > q.minZ && v.z < q.maxZ;
          if (inQ) expect(inside(r, v.x, v.z), `${where} in ${q.tag}`).toBeLessThanOrEqual(0.01);
        }
        if (v.y >= cave.y + COVE_FROM || inside(r, v.x, v.z) <= LINER_IN) continue;
        expect(pathDist(cave, v.x, v.z), where).toBeGreaterThanOrEqual(gorge.CAVE_PATH_CLEAR);
        for (const f of finds) expect(Math.hypot(v.x - f.x, v.z - f.z), `${where} by ${f.id}`).toBeGreaterThanOrEqual(gorge.CAVE_FIND_CLEAR);
      }
      const nest = roomOf(cave.id).nest;
      if (nest) {
        expect(pathDist(cave, nest.x, nest.z)).toBeGreaterThanOrEqual(gorge.CAVE_PATH_CLEAR + nest.r);
        for (const f of finds) expect(Math.hypot(nest.x - f.x, nest.z - f.z)).toBeGreaterThanOrEqual(gorge.CAVE_FIND_CLEAR + nest.r);
        expect(inside(r, nest.x, nest.z)).toBeGreaterThanOrEqual(nest.r);
      }
    }
  }, T);

  it('hangs stalactites high, more in the Echo Cave than the Snug, and a nest only in the Snug', () => {
    for (const cave of GORGE_CAVES) {
      const room = roomOf(cave.id);
      expect(room.stalactiteTips.length, cave.id).toBeGreaterThanOrEqual(4);
      expect(room.stalactiteTips.length, cave.id).toBeLessThanOrEqual(9);
      for (const t of room.stalactiteTips) expect(t.y, cave.id).toBeGreaterThanOrEqual(cave.y + STALACTITE_MIN_Y);
      expect(room.parts.stalactites, cave.id).toBeGreaterThan(0);
      if (cave.id === 'snug') {
        expect(room.nest).toMatchObject({ r: 0.45 });
        expect(room.parts.nest).toBeGreaterThan(0);
      } else {
        expect(room.nest, cave.id).toBeNull();
        expect(room.parts.nest, cave.id).toBe(0);
      }
    }
    expect(roomOf('echo').stalactiteTips.length).toBeGreaterThan(roomOf('snug').stalactiteTips.length);
  }, T);

  it('rounds the corners where both walls are rock', () => {
    for (const cave of GORGE_CAVES) {
      const r = chamberOf(cave);
      const rockAt = gorge.chamberRockAt(cave);
      const verts = vertsOf(roomOf(cave.id).geometry).filter((v) => Math.abs(v.y - (cave.y + 2.5)) < 0.06);
      let corners = 0;
      for (const [cx, sx] of [[r.minX, 1], [r.maxX, -1]]) {
        for (const [cz, sz] of [[r.minZ, 1], [r.maxZ, -1]]) {
          // both walls rock for the corner's arc
          if (!rockAt(cx + sx * CORNER_R, cz) || !rockAt(cx, cz + sz * CORNER_R)) continue;
          corners++;
          const best = Math.max(...verts.map((v) => {
            const dx = (v.x - cx) * sx, dz = (v.z - cz) * sz;
            if (Math.abs(dx - dz) > 0.2 || dx > 1.5) return -1;
            return (dx + dz) / Math.SQRT2;
          }));
          expect(best, `${cave.id} corner (${cx}, ${cz})`).toBeGreaterThanOrEqual(0.25);
        }
      }
      // the Echo Cave's bend opens 1 m from its north-east corner, into that arc
      expect(corners, cave.id).toBe(cave.id === 'echo' ? 3 : 4);
    }
  }, T);

  it('faces its walls into the room', () => {
    for (const cave of GORGE_CAVES) {
      const r = chamberOf(cave);
      const nor = roomOf(cave.id).geometry.attributes.normal;
      let n = 0;
      for (const v of vertsOf(roomOf(cave.id).geometry)) {
        if (v.y < cave.y + 0.3 || v.y > cave.y + 1.8) continue;
        const walls = [[v.x - r.minX, 1, 0], [r.maxX - v.x, -1, 0], [v.z - r.minZ, 0, 1], [r.maxZ - v.z, 0, -1]];
        const near = walls.filter(([d]) => d < 0.15);
        if (near.length !== 1) continue;
        const [, nx, nz] = near[0];
        n++;
        expect(nor.getX(v.i) * nx + nor.getZ(v.i) * nz, `${cave.id} (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`).toBeGreaterThan(0.3);
      }
      expect(n, cave.id).toBeGreaterThan(100);
    }
  }, T);

  it('keeps each room under 5,000 triangles', () => {
    for (const cave of GORGE_CAVES) expect(trisOf(roomOf(cave.id).geometry), cave.id).toBeLessThanOrEqual(5000);
  }, T);

  it('is one hidden, shadowless mesh inside each cave\'s interior group (Review Focus 5)', () => {
    const scene = new THREE.Scene();
    gorge.build(scene);
    for (const cave of GORGE_CAVES) {
      const m = scene.getObjectByName(`caveRoom:${cave.id}`);
      expect(m?.isMesh, cave.id).toBe(true);
      let g = m.parent;
      while (g && !g.name.startsWith('caveInterior:')) g = g.parent;
      expect(g?.name, cave.id).toBe(`caveInterior:${cave.id}`);
      expect(g.visible, cave.id).toBe(false);
      expect(m.castShadow, cave.id).toBe(false);
      expect(m.userData.noCast, cave.id).toBe(true);
      expect(m.material.vertexColors, cave.id).toBe(true);
    }
  }, T);
});
