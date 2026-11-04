import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Same headless stub every world test uses (see test/water.test.js): the
// surface tiles ask for a canvas, and getImageData / gradients need answers.
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

const {
  trailSegments, endKinds, trailField, trailGeometry, trailMaterial, addTrails, quadRadius, TRAIL_LOOK,
  OWNER_BAND,
  EDGE_EXTEND,
  TRAIL_RENDER_ORDER,
  trailWobble,
  wrapLattice,
  HASH_PERIOD,
} = await import('../src/world/pathribbon.js');
const { path } = await import('../src/world/builder.js');
const { WOODS_PATHS } = await import('../src/world/woods.js');
const { PINES_PATHS, PINES_TRAIL, TRAIL_W: PINES_TRAIL_W } = await import('../src/world/pines.js');

// The two coverage maps: Woods (one width) and Pines (3 m paths meeting the
// 2 m trail).
const COVERAGE = {
  woods: () => trailSegments([{ segs: WOODS_PATHS, w: 3 }]),
  pines: () => trailSegments([{ segs: PINES_PATHS, w: 3 }, { segs: PINES_TRAIL, w: PINES_TRAIL_W }]),
};
// Segment i's wobbled edge distance, as the shader's ownership uses it.
function edgeDist(s, x, z) {
  const dx = s.x2 - s.x1;
  const dz = s.z2 - s.z1;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / l2)) : 0;
  return Math.hypot(x - s.x1 - dx * t, z - s.z1 - dz * t) - s.h * (1 + trailWobble(x, z));
}
const SLOPE = 2 * 1.5 / (TRAIL_LOOK.featherOut - TRAIL_LOOK.featherIn);
// Worst alpha change between grid neighbours `step` apart in a square of
// side `size` centred on (cx, cz).
function worstJumpAt(segs, cx, cz, step, size) {
  const n = Math.round(size / step);
  let prev = null;
  let worst = 0;
  for (let i = 0; i <= n; i++) {
    const row = new Float64Array(n + 1);
    for (let j = 0; j <= n; j++) {
      row[j] = trailField(segs, cx - size / 2 + i * step, cz - size / 2 + j * step).alpha;
      if (j > 0) worst = Math.max(worst, Math.abs(row[j] - row[j - 1]));
      if (prev) worst = Math.max(worst, Math.abs(row[j] - prev[j]));
    }
    prev = row;
  }
  return worst;
}
const { tileMetres } = await import('../src/render/materials.js');
const { mulberry32 } = await import('../src/rng.js');

const segLen = (s) => Math.hypot(s.x2 - s.x1, s.z2 - s.z1);

function drawsOf(fn) {
  const real = Math.random;
  const seeded = mulberry32(777);
  let draws = 0;
  Math.random = () => { draws++; return seeded(); };
  try {
    fn();
  } finally {
    Math.random = real;
  }
  return draws;
}

// Is (x, z) inside the quad of segment i (as trailGeometry builds it)?
function inQuad(s, x, z) {
  const R = quadRadius(s.h);
  const len = segLen(s);
  const ux = (s.x2 - s.x1) / len;
  const uz = (s.z2 - s.z1) / len;
  const along = (x - s.x1) * ux + (z - s.z1) * uz;
  const across = -(x - s.x1) * uz + (z - s.z1) * ux;
  return along >= -R - 1e-6 && along <= len + R + 1e-6 && Math.abs(across) <= R + 1e-6;
}

describe('trail end classing', () => {
  it('an L of two segments sharing a point: the shared ends are joined', () => {
    const groups = [{ segs: [[0, 0, 10, 0], [10, 0, 10, 10]], w: 2 }];
    const k = endKinds(groups);
    expect(k[0][1]).toBe('joined');
    expect(k[1][0]).toBe('joined');
    const segs = trailSegments(groups);
    expect(segs[0]).toMatchObject({ x2: 10, z2: 0, h: 1 });
    expect(segs[1]).toMatchObject({ x1: 10, z1: 0, h: 1 });
  });

  it('a T whose stem ends 1 m off the bar centreline (h = 1.5) is joined', () => {
    const groups = [{ segs: [[-10, 0, 10, 0], [0, 10, 0, 1]], w: 3 }];
    expect(endKinds(groups)[1][1]).toBe('joined');
    expect(trailSegments(groups)[1]).toMatchObject({ x2: 0, z2: 1 });
  });

  it('a dead end is pulled back by h; a map-edge end runs EDGE_EXTEND further out', () => {
    const groups = [{ segs: [[50, 0, 20, 0]], w: 3 }];
    expect(endKinds(groups)[0]).toEqual(['edge', 'free']);
    const [s] = trailSegments(groups);
    expect(s.x1).toBeCloseTo(50 + EDGE_EXTEND, 9);
    expect(s.x2).toBeCloseTo(21.5, 9);
    expect(s.z1).toBe(0);
    expect(s.z2).toBe(0);
  });

  it('a pull-back never shortens a segment below 0.1 m', () => {
    const [s] = trailSegments([{ segs: [[0, 0, 2, 0]], w: 3 }]);
    expect(segLen(s)).toBeCloseTo(0.1, 9);
    expect((s.x1 + s.x2) / 2).toBeCloseTo(1, 9);
  });

  it('on the real WOODS_PATHS (PATH_W = 3)', () => {
    const groups = [{ segs: WOODS_PATHS, w: 3 }];
    const k = endKinds(groups);
    const kindAt = (x, z) => {
      for (let i = 0; i < WOODS_PATHS.length; i++) {
        const s = WOODS_PATHS[i];
        if (s[0] === x && s[1] === z) return k[i][0];
        if (s[2] === x && s[3] === z) return k[i][1];
      }
      throw new Error(`no end at ${x},${z}`);
    };
    expect(kindAt(46, 12)).toBe('joined');
    expect(kindAt(26, 6)).toBe('joined');
    expect(kindAt(-18, -24)).toBe('free');
    expect(kindAt(-4.5, -6)).toBe('free');
    expect(kindAt(-4.5, -17)).toBe('free');
    expect(kindAt(50, 12)).toBe('edge');
    expect(kindAt(46, -50)).toBe('edge');
    expect(kindAt(-50, 40)).toBe('edge');
    const segs = trailSegments(groups);
    expect(segs.length).toBe(WOODS_PATHS.length);
    // (50,12)->(26,6): the edge end ran EDGE_EXTEND out along the segment.
    const u = [-24 / Math.hypot(24, 6), -6 / Math.hypot(24, 6)];
    expect(segs[0].x1).toBeCloseTo(50 - EDGE_EXTEND * u[0], 9);
    expect(segs[0].z1).toBeCloseTo(12 - EDGE_EXTEND * u[1], 9);
    // (-4.5,-17)->(-18,-24) is free at both ends: shorter by 2h = 3.
    expect(segLen(segs[6])).toBeCloseTo(Math.hypot(13.5, 7) - 3, 9);
  });
});

describe('trail field', () => {
  const L = [{ segs: [[0, 0, 10, 0], [10, 0, 10, 10]], w: 3 }];
  const segs = trailSegments(L);

  // Worst alpha change between grid neighbours `step` apart around the joint.
  function worstJump(step, size) {
    const n = Math.round(size / step);
    const grid = [];
    for (let i = 0; i <= n; i++) {
      const row = [];
      for (let j = 0; j <= n; j++) {
        const f = trailField(segs, 10 - size / 2 + i * step, -size / 2 + j * step);
        expect(f.owner === 0 || f.owner === 1).toBe(true);
        row.push(f.alpha);
      }
      grid.push(row);
    }
    let worst = 0;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        if (i < n) worst = Math.max(worst, Math.abs(grid[i][j] - grid[i + 1][j]));
        if (j < n) worst = Math.max(worst, Math.abs(grid[i][j] - grid[i][j + 1]));
      }
    }
    return worst;
  }

  it('is a continuous union over an L joint, one owner per sample', () => {
    // A smoothstep over the feather peaks at slope 1.5/width, and the ragged
    // wobble can steepen that up to ~2x; a seam would be a jump that does NOT
    // shrink with the step. So: bounded by that slope, and ~5x smaller at 1 cm.
    const slope = 2 * 1.5 / (TRAIL_LOOK.featherOut - TRAIL_LOOK.featherIn);
    const w5 = worstJump(0.05, 7);
    const w1 = worstJump(0.01, 4);
    expect(w5).toBeLessThan(0.05 * slope);
    expect(w1).toBeLessThan(0.01 * slope);
    expect(w1).toBeLessThan(w5 / 3);
  });

  it('owner is the lowest index on a tie', () => {
    // Two identical capsules tie everywhere.
    const twin = [{ x1: 0, z1: 0, x2: 10, z2: 0, h: 1 }, { x1: 0, z1: 0, x2: 10, z2: 0, h: 1 }];
    for (const [x, z] of [[5, 0], [3, 0.7], [-0.5, 0.2], [10.4, -0.9]]) {
      expect(trailField(twin, x, z).owner).toBe(0);
    }
  });

  it('alpha is ~1 on the centreline and 0 beyond h + 0.6', () => {
    // The free ends (0,0) and (10,10) were pulled back by h = 1.5.
    for (let x = 1.5; x <= 10; x += 0.25) expect(trailField(segs, x, 0).alpha).toBeGreaterThan(0.999);
    for (let z = 0; z <= 8.5; z += 0.25) expect(trailField(segs, 10, z).alpha).toBeGreaterThan(0.999);
    // ...and past the authored dead end, the rounded cap is gone too.
    expect(trailField(segs, -0.6, 0).alpha).toBe(0);
    for (let x = 0; x <= 10; x += 0.25) {
      expect(trailField(segs, x, -(1.5 + 0.6)).alpha).toBe(0);
    }
    for (let z = 0; z <= 10; z += 0.25) expect(trailField(segs, 10 + 1.5 + 0.6, z).alpha).toBe(0);
  });

  for (const [map, segsOf] of Object.entries(COVERAGE)) it(`every sample with alpha > 0.002 lies inside its owner's quad (${map})`, () => {
    const ws = segsOf();
    const rnd = mulberry32(4242);
    let hits = 0;
    for (let k = 0; k < 40000; k++) {
      const x = -55 + rnd() * 110;
      const z = -55 + rnd() * 110;
      const f = trailField(ws, x, z);
      if (f.alpha > 0.002) {
        hits++;
        expect(inQuad(ws[f.owner], x, z)).toBe(true);
      }
    }
    expect(hits).toBeGreaterThan(500);
    // And near the edges specifically, where the feather lives.
    for (let k = 0; k < 20000; k++) {
      const i = Math.floor(rnd() * ws.length);
      const s = ws[i];
      const t = rnd();
      const off = (rnd() * 2 - 1) * (quadRadius(s.h) + 0.3);
      const len = segLen(s);
      const x = s.x1 + (s.x2 - s.x1) * t - (s.z2 - s.z1) / len * off;
      const z = s.z1 + (s.z2 - s.z1) * t + (s.x2 - s.x1) / len * off;
      const f = trailField(ws, x, z);
      if (f.alpha > 0.002) expect(inQuad(ws[f.owner], x, z)).toBe(true);
    }
  }, 120_000);

  for (const [map, segsOf] of Object.entries(COVERAGE)) it(`every quad that shares a pixel in the soft hand-over strip covers it (${map})`, () => {
    // The shader lets quad i draw wherever its (wobbled) capsule edge is
    // within OWNER_BAND of its nearest rival, not only where it is the argmin.
    // The strip is ~1 cm wide and only exists where two capsules meet, so
    // sample around every joined end (and a few random points map-wide).
    const ws = segsOf();
    const kinds = endKinds(map === 'woods'
      ? [{ segs: WOODS_PATHS, w: 3 }]
      : [{ segs: PINES_PATHS, w: 3 }, { segs: PINES_TRAIL, w: PINES_TRAIL_W }]);
    const joins = [];
    ws.forEach((s, i) => {
      if (kinds[i][0] === 'joined') joins.push([s.x1, s.z1, s.h]);
      if (kinds[i][1] === 'joined') joins.push([s.x2, s.z2, s.h]);
    });
    expect(joins.length).toBeGreaterThan(4);
    const rnd = mulberry32(99);
    const pts = [];
    for (const [jx, jz, h] of joins) {
      const r = h + 1;
      for (let k = 0; k < 3000; k++) pts.push([jx + (rnd() * 2 - 1) * r, jz + (rnd() * 2 - 1) * r]);
    }
    for (let k = 0; k < 10000; k++) pts.push([-55 + rnd() * 110, -55 + rnd() * 110]);
    let shared = 0;
    for (const [x, z] of pts) {
      const f = trailField(ws, x, z);
      if (f.alpha <= 0.002) continue;
      const es = ws.map((s) => edgeDist(s, x, z));
      const min = Math.min(...es);
      expect(min).toBeCloseTo(f.sd, 9);
      es.forEach((ei, i) => {
        if (ei < min + 2 * OWNER_BAND) {
          if (i !== f.owner) shared++;
          expect(inQuad(ws[i], x, z)).toBe(true);
        }
      });
    }
    expect(shared).toBeGreaterThan(20);
  }, 120_000);
});

describe('trail field where two widths meet', () => {
  // Ownership and sd both use e_i = d_i - h_i (1 + W). Owning by the
  // unwobbled d_i - h_i while wobbling by the owner's h made alpha jump by up
  // to ~0.5 between 2 cm neighbours where a 3 m path meets a 2 m trail.
  it('a 3 m path meeting a 2 m trail end-on and as a T: no step at 2 cm', () => {
    const cases = [
      // end-on, straight through
      [[{ segs: [[-20, 0, 0, 0]], w: 3 }, { segs: [[0, 0, 20, 0]], w: 2 }], [0, 0]],
      // an L
      [[{ segs: [[-20, 5, 0, 5]], w: 3 }, { segs: [[0, 5, 0, 25]], w: 2 }], [0, 5]],
      // a T: the 2 m trail's end on the 3 m path's centreline
      [[{ segs: [[-20, -10, 20, -10]], w: 3 }, { segs: [[0, 10, 0, -10]], w: 2 }], [0, -10]],
    ];
    for (const [groups, [cx, cz]] of cases) {
      const segs = trailSegments(groups);
      const w = worstJumpAt(segs, cx, cz, 0.02, 6);
      expect(w).toBeLessThan(0.02 * SLOPE);
    }
  });

  it('on the real PINES_PATHS + PINES_TRAIL joins: no step at 2 cm', () => {
    const groups = [{ segs: PINES_PATHS, w: 3 }, { segs: PINES_TRAIL, w: PINES_TRAIL_W }];
    const segs = trailSegments(groups);
    const kinds = endKinds(groups);
    // Every end of a 2 m segment that joins a 3 m one (or vice versa).
    const seams = [];
    segs.forEach((s, i) => {
      for (const [e, x, z] of [[0, s.x1, s.z1], [1, s.x2, s.z2]]) {
        if (kinds[i][e] !== 'joined') continue;
        const other = segs.some((t, j) => j !== i && t.h !== s.h
          && edgeDist({ ...t, h: 0 }, x, z) <= t.h + 0.05);
        if (other) seams.push([x, z]);
      }
    });
    expect(seams.length).toBeGreaterThan(0);
    for (const [x, z] of seams) {
      expect(worstJumpAt(segs, x, z, 0.02, 5)).toBeLessThan(0.02 * SLOPE);
    }
  }, 180_000);
});

describe('trail hash wrap', () => {
  it('is the identity in [-144, 144] and periodic outside it', () => {
    for (let i = -144; i <= 144; i++) expect(wrapLattice(i)).toBe(i);
    for (const i of [145, 300, -145, -400, 1e5, -1e5]) {
      const w = wrapLattice(i);
      expect(Math.abs(w)).toBeLessThanOrEqual(144);
      expect(Math.abs((i - w) % HASH_PERIOD)).toBe(0);
    }
  });

  it('the shader wraps the same way before its sin', () => {
    const s = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    trailMaterial(0x9c7c58, 'sand', trailSegments([{ segs: WOODS_PATHS, w: 3 }])).onBeforeCompile(s);
    expect(s.fragmentShader).toContain('i = i - 289.0 * floor((i + 144.0) / 289.0);');
  });
});

describe('trail geometry', () => {
  const segs = trailSegments([{ segs: WOODS_PATHS, w: 3 }]);
  const g = trailGeometry(segs, { surface: 'sand' });

  it('two upward-facing triangles per segment, tagged with the segment index', () => {
    const pos = g.getAttribute('position');
    expect(g.index).toBeNull();
    expect(pos.count / 3).toBe(2 * segs.length);
    const id = g.getAttribute('trailSeg');
    for (let v = 0; v < pos.count; v++) {
      expect(id.getX(v)).toBe(Math.floor(v / 6));
      expect(pos.getY(v)).toBeCloseTo(0.01, 6);
      expect(g.getAttribute('normal').getY(v)).toBe(1);
    }
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let t = 0; t < pos.count / 3; t++) {
      a.fromBufferAttribute(pos, t * 3);
      b.fromBufferAttribute(pos, t * 3 + 1);
      c.fromBufferAttribute(pos, t * 3 + 2);
      const nrm = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      expect(nrm.y).toBeGreaterThan(0);
    }
  });

  it('uv is world (x, z) over the surface tile', () => {
    const tile = tileMetres('sand') ?? 1;
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let v = 0; v < pos.count; v++) {
      expect(uv.getX(v)).toBeCloseTo(pos.getX(v) / tile, 4);
      expect(uv.getY(v)).toBeCloseTo(pos.getZ(v) / tile, 4);
    }
  });
});

describe('trail material', () => {
  const segs = trailSegments([{ segs: WOODS_PATHS, w: 3 }]);
  const fakeShader = () => ({
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  });

  it('is transparent, writes no depth, and keeps all of that through clone()', () => {
    const m = trailMaterial(0x9c7c58, 'sand', segs);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    const c = m.clone();
    c.color.multiplyScalar(0.5);
    expect(typeof c.onBeforeCompile).toBe('function');
    expect(c.customProgramCacheKey()).toBe(m.customProgramCacheKey());
    expect(c.customProgramCacheKey()).toBe('trail' + segs.length);
    expect(c.transparent).toBe(true);
    expect(c.depthWrite).toBe(false);
    // A clone of a clone too (dusk after rain).
    const cc = c.clone();
    expect(cc.customProgramCacheKey()).toBe('trail' + segs.length);
    // Shared segment uniforms.
    const s1 = fakeShader();
    const s2 = fakeShader();
    m.onBeforeCompile(s1);
    cc.onBeforeCompile(s2);
    expect(s2.uniforms.trailSegs).toBe(s1.uniforms.trailSegs);
    expect(m.color.getHex()).not.toBe(c.color.getHex());
  });

  it('injects its code at anchors that exist in three\'s standard shader', () => {
    const std = THREE.ShaderLib.standard;
    expect(std.vertexShader).toContain('#include <begin_vertex>');
    expect(std.vertexShader).toContain('#include <common>');
    expect(std.fragmentShader).toContain('#include <color_fragment>');
    expect(std.fragmentShader).toContain('#include <common>');
    const s = fakeShader();
    trailMaterial(0x9c7c58, 'sand', segs).onBeforeCompile(s);
    expect(s.vertexShader).toContain('attribute float trailSeg;');
    expect(s.vertexShader).toMatch(/#include <begin_vertex>\s*vTrailXZ = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xz;/);
    expect(s.fragmentShader).toContain(`#define TRAIL_N ${segs.length}`);
    expect(s.fragmentShader).toContain('uniform vec4 trailSegs[TRAIL_N];');
    expect(s.fragmentShader).toMatch(/#include <color_fragment>\s*\{\s*vec2 tp = vTrailXZ;/);
    expect(s.fragmentShader).toContain('diffuseColor.a *= tW >= 1.0 ? tAlpha');
    expect(s.uniforms.trailSegs.value.length).toBe(segs.length);
    expect(s.uniforms.trailHalf.value).toEqual(segs.map((x) => x.h));
    // The look numbers are baked from TRAIL_LOOK.
    expect(s.fragmentShader).toContain(String(TRAIL_LOOK.featherOut));
  });
});

describe('footprint path strips', () => {
  const args = [50, 12, 26, 6, 3, { surface: 'sand', color: 0x9c7c58 }];

  it('match the visible strip in everything readers use, hidden and 1x1', () => {
    const a = path(...args);
    const b = path(...args.slice(0, 5), { ...args[5], footprint: true });
    expect(b.geometry.parameters.width).toBe(a.geometry.parameters.width);
    expect(b.geometry.parameters.height).toBe(a.geometry.parameters.height);
    expect(b.position.toArray()).toEqual(a.position.toArray());
    expect(b.rotation.toArray()).toEqual(a.rotation.toArray());
    expect(b.name).toBe('path');
    expect(b.userData).toEqual(a.userData);
    expect(b.material.color.getHex()).toBe(a.material.color.getHex());
    expect(b.material.roughness).toBe(a.material.roughness);
    expect(b.material.map).toBe(a.material.map);
    expect(a.visible).toBe(true);
    expect(b.visible).toBe(false);
    expect(b.geometry.index.count / 3).toBe(2);
  });

  it('draw the same Math.random count as the visible strip; the trail mesh draws none', () => {
    // Cold caches first: a strip's surface texture is cached per repeat, so
    // the first strip of a size draws its texture's uuid too. Footprint and
    // visible strips make the same objects either way: a cold footprint strip
    // draws what a cold visible strip of another fresh size draws, and each
    // draws more than its own warm repeat.
    const style = { surface: 'sand', color: 0x9c7c58 };
    const coldFp = drawsOf(() => path(3, -7, 11, 13, 2.5, { ...style, footprint: true }));
    const coldVis = drawsOf(() => path(3, -7, 11, 17, 2.7, style));
    expect(coldFp).toBe(coldVis);
    expect(drawsOf(() => path(3, -7, 11, 13, 2.5, { ...style, footprint: true }))).toBeLessThan(coldFp);
    expect(drawsOf(() => path(3, -7, 11, 17, 2.7, style))).toBeLessThan(coldVis);
    path(...args);
    const one = drawsOf(() => path(...args));
    const fp = drawsOf(() => path(...args.slice(0, 5), { ...args[5], footprint: true }));
    expect(fp).toBe(one);
    expect(one).toBeGreaterThan(0);
    // Warm every Woods strip's caches, then: addTrails = the same N path()
    // calls, and the trail mesh itself draws nothing from Math.random.
    const loop = () => { for (const s of WOODS_PATHS) path(...s, 3, args[5]); };
    loop();
    const visible = drawsOf(loop);
    expect(visible).toBe(WOODS_PATHS.length * one);
    const scene = new THREE.Scene();
    const all = drawsOf(() => addTrails(scene, [{ segs: WOODS_PATHS, w: 3 }], args[5], 'woods'));
    expect(all).toBe(visible);
    const trail = scene.children.filter((c) => c.name === 'pathTrail');
    const strips = scene.children.filter((c) => c.name === 'path');
    expect(trail.length).toBe(1);
    expect(strips.length).toBe(WOODS_PATHS.length);
    expect(strips.every((s) => s.visible === false)).toBe(true);
    const [t] = trail;
    expect(t.userData.ground).toBe(true);
    expect(t.userData.noCast).toBeUndefined();
    expect(t.renderOrder).toBe(-4);
    expect(TRAIL_RENDER_ORDER).toBe(-4);
    expect(t.castShadow).toBe(false);
    expect(t.receiveShadow).toBe(true);
    expect(t.userData.trail.length).toBe(WOODS_PATHS.length);
  });

  it('builds the trail mesh with the same uuids every time (local stream)', () => {
    const a = addTrails(new THREE.Scene(), [{ segs: WOODS_PATHS, w: 3 }], args[5], 'woods');
    const b = addTrails(new THREE.Scene(), [{ segs: WOODS_PATHS, w: 3 }], args[5], 'woods');
    expect(a.mesh.uuid).toBe(b.mesh.uuid);
  });
});
