import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The Fairground's stalls and small structures (P4 of the polish pass, world/fairparts.js):
// stall backs, sides and counters painted, rounder goods at fewer triangles, balloons
// on the cheap lump, the glow list's new members for dusk (stall sign boards, wagon
// windows, the crystal ball's lamps), the off-white fence with its end posts, and the
// gate's smooth arch.

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build, STALLS, FAIR_BOUNDS, GATE_AT, GATE_HALF, FORTUNE_AT } = await import('../src/world/fair.js');
const parts = await import('../src/world/fairparts.js');
const { STALL, FORTUNE, GATE, FAIR_PAINT } = parts;

const scene = new THREE.Scene();
const area = build(scene);
scene.updateMatrixWorld(true);

const tris = (m) => m.geometry.attributes.position.count / 3;
const named = (n) => scene.getObjectByName(n);
// every world-space vertex of a mesh
function verts(m) {
  const p = m.geometry.attributes.position;
  m.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < p.count; i++) out.push(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).clone());
  return out;
}
const near = (vs, x, y, z, r) => vs.some((v) => Math.hypot(v.x - x, v.y - y, v.z - z) <= r);
// a point in a stall's own frame (front +z), in the world
const inStall = (s, lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw).add(new THREE.Vector3(s.x, 0, s.z));

describe('The Fairground stalls: painted backs, sides and counters', () => {
  const props = named('fairProps');
  const pv = verts(props);

  it('paints a name-board panel on every stall’s back, and a panel on each side', () => {
    for (const s of STALLS) {
      const back = inStall(s, 0, 1.36, -STALL.d / 2 - 0.014);
      expect(near(pv, back.x, back.y, back.z, 0.02), `${s.id} back panel`).toBe(true);
      for (const sx of [-1, 1]) {
        const side = inStall(s, sx * (STALL.w / 2 + 0.014), 0.92, -0.43);
        expect(near(pv, side.x, side.y, side.z, 0.02), `${s.id} side ${sx}`).toBe(true);
      }
    }
  });

  it('keeps every painted sheet within a hand of the wood it lies on (no floating paint)', () => {
    for (const s of STALLS) {
      for (const lz of [-STALL.d / 2 - 0.02, STALL.d / 2 - 0.85 + 0.25 + 0.012]) {
        const base = inStall(s, 0, 0.2, lz);
        expect(near(pv, base.x, base.y, base.z, 1.7), `${s.id} z=${lz}`).toBe(true);
      }
    }
  });
});

describe('The Fairground’s dusk: what joins the glow list', () => {
  const glowing = [];
  scene.traverse((o) => { if (o.isMesh && o.userData.fairGlow) glowing.push(o); });
  const bulbs = named('fairBulbs');
  const bv = verts(bulbs);

  it('puts every stall’s sign board on the one glow material', () => {
    expect(bulbs.material).toBe(area.glow.material);
    for (const s of STALLS) {
      const y = s.top === 'flat' ? STALL.roofY + 0.25 : parts.STALL_SIGN.tent.y - 0.2;
      const lz = s.top === 'flat' ? STALL.d / 2 + 0.2 : parts.STALL_SIGN.tent.z - 0.036;
      const c = inStall(s, 0, y, lz);
      expect(near(bv, c.x, c.y, c.z, 1.0), `${s.id} board`).toBe(true);
    }
  });

  it('lights the showmen’s wagons’ windows', () => {
    // both wagons stand in the field south of the plaza (z about -12..-19)
    const win = bv.filter((v) => v.z < -10 && v.z > -22 && v.x > 10 && v.x < 21 && v.y > 1.3 && v.y < 2.0);
    expect(win.length).toBeGreaterThanOrEqual(2 * 2 * 36);
  });

  it('rings the crystal ball’s stand with lamps in the fortune tent’s glow mesh', () => {
    const lamps = verts(named('fortuneBulbs')).filter((v) => Math.hypot(v.x - FORTUNE_AT.x, v.z - FORTUNE_AT.z) < 1.4 && v.y > FORTUNE.tableY && v.y < FORTUNE.tableY + 0.2);
    expect(lamps.length).toBeGreaterThanOrEqual(10 * 6);
    for (const g of glowing) expect(g.material).toBe(area.glow.material);
  });
});

describe('The Fairground’s goods and balloons: rounder, fewer triangles', () => {
  it('draws every balloon as one octahedron cut once (32 triangles), stretched tall', () => {
    const b = named('fairBalloons');
    expect(tris(b) % 32).toBe(0);
    expect(tris(b) / 32).toBeGreaterThanOrEqual(20);
    expect(b.userData.noCast).toBe(true);
    b.geometry.computeBoundingBox();
    // each balloon is taller than wide
    const pos = b.geometry.attributes.position;
    const per = 32 * 3;
    for (let k = 0; k < pos.count / per; k += 5) {
      const bb = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = k * per; i < (k + 1) * per; i++) bb.expandByPoint(v.fromBufferAttribute(pos, i));
      expect(bb.max.y - bb.min.y, `balloon ${k}`).toBeGreaterThan((bb.max.x - bb.min.x) * 1.1);
    }
  });

  it('is cheaper than before: the whole place is well under the old 69,792', () => {
    let total = 0;
    scene.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) total += o.geometry.attributes.position.count / 3; });
    expect(total).toBeLessThan(69792 - 600);
    expect(total).toBeLessThanOrEqual(70000);
  });
});

describe('The Fairground’s fence and gate', () => {
  const fenceMesh = named('fairFence');
  it('is whitewash gone soft, never paper white', () => {
    const white = new THREE.Color(FAIR_PAINT.white);
    const col = fenceMesh.geometry.attributes.color;
    let pale = 0;
    for (let i = 0; i < col.count; i++) {
      const d = Math.abs(col.getX(i) - white.r) + Math.abs(col.getY(i) - white.g) + Math.abs(col.getZ(i) - white.b);
      expect(d).toBeGreaterThan(0.01);
      if (col.getX(i) > 0.7) pale++;
    }
    expect(pale).toBeGreaterThan(col.count / 4); // still a light fence
  });

  it('finishes each run with a tall striped post and a gold knob', () => {
    const fv = verts(fenceMesh);
    for (const [x, z] of [[-44, GATE_AT.z], [-GATE_HALF - 0.5, GATE_AT.z], [GATE_HALF + 0.5, GATE_AT.z], [44, GATE_AT.z]]) {
      expect(near(fv, x, 1.14, z, 0.12), `post top at ${x}`).toBe(true);
      expect(near(fv, x, 1.28, z, 0.1), `knob at ${x}`).toBe(true);
    }
    expect(FAIR_BOUNDS.maxX).toBe(44);
  });

  it('bends one smooth arch over the gate: it climbs to the apex and the ends meet the posts', () => {
    const frame = named('fairGateFrame');
    const v = verts(frame);
    const arch = v.filter((p) => p.y > GATE.postH - 0.1 && Math.abs(p.z - GATE_AT.z) < 0.12);
    const top = Math.max(...arch.map((p) => p.y));
    expect(top).toBeGreaterThan(GATE.archY - 0.1);
    expect(top).toBeLessThan(GATE.archY + 0.6);
    // the band is continuous: some vertex in every half-metre slice across the span
    for (let x = -GATE_HALF + 0.3; x < GATE_HALF - 0.3; x += 0.5) {
      expect(arch.some((p) => Math.abs(p.x - GATE_AT.x - x) < 0.3 && p.y > GATE.postH + 0.1), `arch at x=${x}`).toBe(true);
    }
  });
});
