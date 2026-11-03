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
const caveroom = await import('../src/world/caveroom.js');
const { COVE_FROM, LINER_IN, CORNER_R, STALACTITE_MIN_Y } = caveroom;
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
    // polish-gorgeway Task 3: the lumpy moss grows each room by at most 300
    // against what it was before it (echo 2300, snug 2296, glitter 1916)
    const before = { echo: 2300, snug: 2296, glitter: 1916 };
    for (const cave of GORGE_CAVES) expect(trisOf(roomOf(cave.id).geometry), cave.id).toBeLessThanOrEqual(before[cave.id] + 300);
  }, T);

  // --- lumpy moss (polish-gorgeway Task 3) ----------------------------------------

  it('moss is lumpy: each floor mound rises 0.05-0.15 m and its outline is uneven', () => {
    for (const cave of GORGE_CAVES) {
      const room = roomOf(cave.id);
      expect(room.mossBlobs.length, cave.id).toBeGreaterThan(0);
      for (const b of room.mossBlobs) {
        const where = `${cave.id} (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`;
        expect(b.top - cave.y, where).toBeGreaterThanOrEqual(0.05);
        expect(b.top - cave.y, where).toBeLessThanOrEqual(0.15);
        // the outer ring, as appended: low on the floor, within 1.25 rad, uneven
        expect(b.rim.length, where).toBe(9);
        const radii = b.rim.map((p) => Math.hypot(p.x - b.x, p.z - b.z));
        for (const p of b.rim) expect(p.y, where).toBeLessThan(cave.y + 0.02);
        for (const d of radii) expect(d, where).toBeLessThanOrEqual(1.25 * b.rad);
        expect(Math.max(...radii) / Math.min(...radii), where).toBeGreaterThanOrEqual(1.15);
      }
    }
  }, T);

  it('wall moss stands off the liner', () => {
    let n = 0;
    for (const cave of GORGE_CAVES) {
      const room = roomOf(cave.id);
      for (const w of room.wallMoss) {
        n++;
        const front = (w.top.x - w.x) * w.nx + (w.top.z - w.z) * w.nz;
        const liner = room.linerDepth(w.x, w.top.y, w.z, w.nx, w.nz);
        expect(front - liner, `${cave.id} (${w.x.toFixed(2)}, ${w.y.toFixed(2)}, ${w.z.toFixed(2)})`).toBeGreaterThanOrEqual(0.04);
      }
    }
    expect(n).toBeGreaterThan(0);
  }, T);

  it('exports the mound builder: 45 triangles of moss facing along the normal', () => {
    const m = caveroom.mesher();
    const top = caveroom.mossLump(m, { x: 1, y: 2, z: 3, nx: 1, ny: 0, nz: 0, rad: 0.2, color: new THREE.Color(0x4f6b3a), salt: 5 });
    expect(m.parts.moss).toBe(45);
    expect(m.idx.length).toBe(135);
    expect(top.x - 1).toBeGreaterThanOrEqual(0.03);
    expect(top.y).toBeCloseTo(2, 6);
    expect(top.z).toBeCloseTo(3, 6);
    const v = (i) => new THREE.Vector3(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
    for (let t = 0; t < m.idx.length; t += 3) {
      const [a, b, c] = [v(m.idx[t]), v(m.idx[t + 1]), v(m.idx[t + 2])];
      const n = b.sub(a).cross(c.sub(a));
      expect(n.x, `tri ${t / 3}`).toBeGreaterThan(0);
    }
  });

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

  // --- Task 5's leftovers (polish-gorgesky Task 6) ---------------------------------

  it('hangs only stubby, blunt stalactites (cosy, not fangs), none by the mouth', () => {
    for (const cave of GORGE_CAVES) {
      const room = roomOf(cave.id);
      const verts = vertsOf(room.geometry);
      // where the walking line comes into the chamber
      const r = chamberOf(cave);
      const entry = cave.path.find(([x, z]) => inside(r, x, z) >= -1e-9);
      for (const t of room.stalactiteTips) {
        const where = `${cave.id} (${t.x.toFixed(2)}, ${t.z.toFixed(2)})`;
        expect(t.root - t.y, where).toBeLessThanOrEqual(caveroom.STALACTITE_MAX_LEN + 1e-6);
        expect(t.y, where).toBeGreaterThanOrEqual(cave.y + STALACTITE_MIN_Y);
        expect(Math.hypot(t.x - entry[0], t.z - entry[1]), where).toBeGreaterThanOrEqual(1.5);
        // blunt: just above the point, a ring still at least 3.5 cm out
        const ring = verts.filter((v) => v.y > t.y + 1e-4 && v.y <= t.y + 0.04 && Math.hypot(v.x - t.x, v.z - t.z) < 0.2);
        expect(ring.length, where).toBeGreaterThanOrEqual(5);
        for (const v of ring) expect(Math.hypot(v.x - t.x, v.z - t.z), where).toBeGreaterThanOrEqual(0.035);
      }
    }
    expect(caveroom.STALACTITE_MAX_LEN).toBe(0.6);
  }, T);

  // --- crystal clusters (Task 6) ------------------------------------------------------

  it('exports the cluster spread and the cluster builder', () => {
    expect(caveroom.CLUSTER_SPREAD).toBe(0.32);
    expect(typeof caveroom.crystalClusters).toBe('function');
    expect(gorge.CRYSTAL_SIZE).toEqual({ glitter: 1.3, echo: 1.0, snug: 0.85 });
  });

  it('keeps at least 5 crystal spots in each cave (the Glitter Cave at least 7, and the most)', () => {
    const n = Object.fromEntries(GORGE_CAVES.map((c) => [c.id, gorge.caveCrystalSpots(c).length]));
    for (const cave of GORGE_CAVES) expect(n[cave.id], cave.id).toBeGreaterThanOrEqual(cave.id === 'glitter' ? 7 : 5);
    expect(n.glitter).toBeGreaterThan(n.echo);
    expect(n.glitter).toBeGreaterThan(n.snug);
  });

  it('stands every cluster in front of the liner, not buried in it', () => {
    for (const cave of GORGE_CAVES) {
      const room = roomOf(cave.id);
      for (const bse of gorge.crystalBases(cave, room)) {
        const front = (bse.x - bse.wx) * bse.nx + (bse.z - bse.wz) * bse.nz;
        let liner = 0;
        for (let h = 0.02; h <= 1.0; h += 0.07) liner = Math.max(liner, room.linerDepth(bse.wx, cave.y + h, bse.wz, bse.nx, bse.nz));
        expect(front - liner, `${cave.id} (${bse.x.toFixed(2)}, ${bse.z.toFixed(2)})`).toBeGreaterThanOrEqual(0.03);
      }
    }
  }, T);

  it('tints the liner near a cluster toward the cave\'s colour, and not 3 m away', () => {
    for (const cave of GORGE_CAVES) {
      const lit = roomOf(cave.id);
      const plain = gorge.caveRoomFor(cave.id, { glow: false });
      const pa = plain.geometry.attributes.position.array;
      expect(Array.from(lit.geometry.attributes.position.array)).toEqual(Array.from(pa));
      const c0 = plain.geometry.attributes.color, c1 = lit.geometry.attributes.color;
      const glow = new THREE.Color(gorge.CAVE_COLORS[cave.id]);
      const spots = gorge.caveCrystalSpots(cave);
      let near = 0, far = 0;
      for (const v of vertsOf(plain.geometry)) {
        if (v.y < cave.y + 0.2) continue; // the liner and its moss (not floor moss or the nest)
        const d = Math.min(...spots.map((s) => Math.hypot(v.x - s.x, v.y - cave.y, v.z - s.z)));
        const delta = [c1.getX(v.i) - c0.getX(v.i), c1.getY(v.i) - c0.getY(v.i), c1.getZ(v.i) - c0.getZ(v.i)];
        const toward = [glow.r - c0.getX(v.i), glow.g - c0.getY(v.i), glow.b - c0.getZ(v.i)];
        const where = `${cave.id} (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
        if (d <= 1.0) {
          near++;
          expect(delta[0] * toward[0] + delta[1] * toward[1] + delta[2] * toward[2], where).toBeGreaterThan(0);
          expect(delta[0] * glow.r + delta[1] * glow.g + delta[2] * glow.b, where).toBeGreaterThan(0);
        } else if (d >= 3) {
          far++;
          expect(delta, where).toEqual([0, 0, 0]);
        }
      }
      expect(near, cave.id).toBeGreaterThan(10);
      expect(far, cave.id).toBeGreaterThan(10);
    }
  }, T);

  it('builds the same clusters every time for one seed', () => {
    const cave = GORGE_CAVES[0];
    const spots = gorge.crystalBases(cave, roomOf(cave.id));
    const a = caveroom.crystalClusters(spots, 7, { color: 0x9fc7d8, size: 1, id: 'echo' });
    const b2 = caveroom.crystalClusters(spots, 7, { color: 0x9fc7d8, size: 1, id: 'echo' });
    expect(Array.from(b2.geometry.attributes.position.array)).toEqual(Array.from(a.geometry.attributes.position.array));
    expect(a.name).toBe('caveCrystals:echo');
  }, T);

  it('grows glowing clusters in each cave, tall, clear of the path and finds at every vertex, hidden and shadowless', () => {
    const scene = new THREE.Scene();
    gorge.build(scene);
    scene.updateMatrixWorld(true);
    for (const cave of GORGE_CAVES) {
      const m = scene.getObjectByName(`caveCrystals:${cave.id}`);
      expect(m?.isMesh, cave.id).toBe(true);
      let g = m.parent;
      while (g && !g.name.startsWith('caveInterior:')) g = g.parent;
      expect(g?.name, cave.id).toBe(`caveInterior:${cave.id}`);
      expect(g.visible, cave.id).toBe(false);
      expect(m.castShadow, cave.id).toBe(false);
      expect(m.userData.noCast, cave.id).toBe(true);
      expect(m.material.emissive.getHex(), cave.id).toBe(gorge.CAVE_COLORS[cave.id]);
      expect(m.material.emissiveIntensity, cave.id).toBe(0.9);
      const finds = gorge.caveFinds(cave);
      const r = chamberOf(cave);
      let top = 0;
      const v3 = new THREE.Vector3();
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = v3.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        const where = `${cave.id} (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
        top = Math.max(top, v.y - cave.y);
        expect(pathDist(cave, v.x, v.z), where).toBeGreaterThanOrEqual(gorge.CAVE_PATH_CLEAR);
        for (const f of finds) expect(Math.hypot(v.x - f.x, v.z - f.z), `${where} by ${f.id}`).toBeGreaterThanOrEqual(gorge.CAVE_FIND_CLEAR);
        expect(inside(r, v.x, v.z), where).toBeGreaterThan(0);
        expect(v.y, where).toBeGreaterThanOrEqual(cave.y - 1e-6);
      }
      expect(top, cave.id).toBeGreaterThanOrEqual(0.5);
      expect(top, cave.id).toBeLessThanOrEqual(0.75 * gorge.CRYSTAL_SIZE[cave.id] + 1e-3);
    }
  }, T);
});
