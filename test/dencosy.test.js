import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { DEN_SPOTS, DEN_CAMERA_WEDGE } from '../src/den.js';

// The headless canvas stub every world test uses — see test/den.test.js for
// why a blanket Proxy is not enough. Installed before the world imports.
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

const { cosyShell, RAG_RUG, BEAM_Z, LAMP, DEN_DOOR } = await import('../src/world/dencosy.js');
const { build } = await import('../src/world/den.js');

const NAMES = ['denWallpaper', 'denWoodwork', 'denRagRug', 'denLampGlow'];

function meshes(group) {
  group.updateMatrixWorld(true);
  const out = [];
  group.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

// Every vertex of a mesh, in world space.
function worldVerts(mesh) {
  const p = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    out.push([v.x, v.y, v.z]);
  }
  return out;
}

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// build()'s gameplay fields, recorded from main BEFORE the shell was added.
// The shell is looks only: not one collider, perch, spawn, bound or tippable
// may move.
const BEFORE = {"colliders":[{"x":-8.45,"z":-3.85,"r":0.62},{"x":-8.45,"z":-2.9499999999999997,"r":0.62},{"x":7.4,"z":3,"r":0.4},{"x":-7.6,"z":7.4,"r":0.35}],"perches":[{"x":0,"z":-7.95,"y":1,"kind":"roof","label":"sunny windowsill","vantage":true},{"x":-7.85,"z":-5,"y":1.1,"kind":"roof"},{"x":-7.95,"z":-3.4,"y":1.9,"kind":"furniture","label":"top of the bookcase","vantage":true},{"x":-6,"z":7.95,"y":1.52,"kind":"roof","requires":"sure-claws"}],"spawn":{"x":0,"z":4},"bounds":{"minX":-8,"maxX":8,"minZ":-8,"maxZ":8},"tippables":[{"x":-2,"z":-7.4,"kind":"bin"},{"x":-7.3,"z":2.4,"kind":"pot"},{"x":6.6,"z":3.8,"kind":"can"}]};

describe('den cosy shell (polish-cosy)', () => {
  it('is exactly four named meshes; all but the woodwork are noCast', () => {
    const group = cosyShell();
    expect(group.name).toBe('denCosy');
    const ms = meshes(group);
    expect(ms.map((m) => m.name)).toEqual(NAMES);
    const by = Object.fromEntries(ms.map((m) => [m.name, m]));
    expect(by.denWallpaper.userData.noCast).toBe(true);
    expect(by.denRagRug.userData.noCast).toBe(true);
    expect(by.denLampGlow.userData.noCast).toBe(true);
    expect(by.denWoodwork.userData.noCast).toBeFalsy();
    // Four distinct draws: none of them may be welded together by the merge.
    for (const m of ms) expect(m.userData.noMerge).toBe(true);
  });

  it('costs between 1,500 and 8,000 triangles', () => {
    const total = meshes(cosyShell()).reduce((n, m) => n + tris(m.geometry), 0);
    expect(total).toBeGreaterThanOrEqual(1500);
    expect(total).toBeLessThanOrEqual(8000);
  });

  it('keeps the camera wedge in front of the open south wall clear', () => {
    for (const m of meshes(cosyShell())) {
      for (const [x, y, z] of worldVerts(m)) {
        if (z >= DEN_CAMERA_WEDGE.minZ && y > DEN_CAMERA_WEDGE.maxH) {
          expect(Math.abs(x), m.name).toBeGreaterThan(DEN_CAMERA_WEDGE.halfWidth);
        }
        // and the woodwork hangs nothing over the camera side at all
        if (m.name === 'denWoodwork' && z > 2.5 && y > 0.5) expect(Math.abs(x)).toBeGreaterThan(3);
      }
    }
  });

  it('hangs nothing into the camera band except the lamp and the pelmet', () => {
    expect(BEAM_Z.every((z) => z <= 2.5)).toBe(true);
    for (const m of meshes(cosyShell())) {
      if (m.name === 'denRagRug') continue;
      for (const [, y, z] of worldVerts(m)) {
        if (y <= 2.9 || y >= 3.2 - 1e-6) continue;
        const lamp = Math.abs(z - LAMP.z) < 0.5;
        const pelmet = z < -8.3;
        expect(lamp || pelmet, `${m.name} vertex at y ${y} z ${z}`).toBe(true);
      }
    }
    // the beams sit ON the wall tops
    const wood = meshes(cosyShell()).find((m) => m.name === 'denWoodwork');
    const beamVerts = worldVerts(wood).filter(([x, y, z]) => Math.hypot(x - LAMP.x, z - LAMP.z) > 0.35 && BEAM_Z.some((bz) => Math.abs(z - bz) <= 0.1 + 1e-6) && y > 3);
    expect(beamVerts.length).toBeGreaterThan(0);
    for (const [, y] of beamVerts) expect(y).toBeGreaterThanOrEqual(3.2 - 1e-6);
  });

  it('hangs the lamp shade at z <= -5.5 with its bottom at or above 2.75', () => {
    expect(LAMP.z).toBeLessThanOrEqual(-5.5);
    expect(LAMP.shadeBottom).toBeGreaterThanOrEqual(2.75);
    const ms = meshes(cosyShell());
    const wood = ms.find((m) => m.name === 'denWoodwork');
    const near = worldVerts(wood).filter(([x, , z]) => Math.hypot(x - LAMP.x, z - LAMP.z) < 0.4);
    expect(near.length).toBeGreaterThan(0);
    for (const [, y] of near) expect(y).toBeGreaterThanOrEqual(LAMP.shadeBottom - 1e-6);
    const glow = ms.find((m) => m.name === 'denLampGlow');
    for (const [, y] of worldVerts(glow)) expect(y).toBeGreaterThanOrEqual(LAMP.shadeBottom - 1e-6);
  });

  // The chase camera's height is relative to the perch, so a cat up on the
  // bookcase or the wall ledge has it 2.2–2.9 m above her, 4.5 m south. No
  // beam may cross that sightline, and the spawn camera still sees the lamp.
  it('keeps the beams out of the sightlines to the high perches and to the lamp', () => {
    const group = cosyShell();
    group.updateMatrixWorld(true);
    const wood = meshes(group).find((m) => m.name === 'denWoodwork');
    const clear = (from, to, label, skip = () => false) => {
      const dir = to.clone().sub(from);
      const ray = new THREE.Raycaster(from, dir.clone().normalize(), 0, dir.length());
      const hits = ray.intersectObject(wood, false).filter((h) => !skip(h));
      expect(hits.length, `${label}: ${hits.map((h) => h.point.toArray().map((v) => v.toFixed(2)).join(','))}`).toBe(0);
    };
    const high = BEFORE.perches.filter((p) => p.y >= 1.1 && p.x < -7);
    expect(high).toHaveLength(2); // the wall ledge and the bookcase top
    for (const p of high) {
      const cat = new THREE.Vector3(p.x, p.y + 0.3, p.z);
      for (let up = 2.2; up <= 2.9 + 1e-9; up += 0.1) {
        clear(new THREE.Vector3(p.x, p.y + up, p.z + 4.5), cat, `perch (${p.x}, ${p.z}) camera +${up.toFixed(1)}`);
      }
    }
    // the spawn camera to just under the shade (the lamp's own woodwork aside)
    const shade = new THREE.Vector3(LAMP.x, LAMP.shadeBottom - 0.02, LAMP.z);
    clear(new THREE.Vector3(0, 2.9, 8.4), shade, 'spawn camera to the lamp',
      (h) => Math.hypot(h.point.x - LAMP.x, h.point.z - LAMP.z) < 0.4);
  });

  it('keeps the door clear of the north wall pictures', () => {
    // pictures at x ±5.6, 0.85 wide (+ frame); architrave edges inside -7.85..-6.75
    const wood = meshes(cosyShell()).find((m) => m.name === 'denWoodwork');
    const door = worldVerts(wood).filter(([x, y, z]) => z < -8.6 && y < 2.25 && x < -6 && x > -8.5);
    const xs = door.map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-7.85);
    expect(Math.max(...xs)).toBeLessThanOrEqual(-6.75);
    expect(DEN_DOOR.x).toBe(-7.3);
  });

  it('lays the rag rug flat under any placed rug, far from every anchor spot', () => {
    const rug = meshes(cosyShell()).find((m) => m.name === 'denRagRug');
    for (const [, y] of worldVerts(rug)) expect(y).toBeLessThan(0.02);
    for (const spot of DEN_SPOTS) {
      expect(Math.hypot(spot.x - RAG_RUG.x, spot.z - RAG_RUG.z), spot.id).toBeGreaterThanOrEqual(1.8);
    }
  });

  it('moves nothing the cat can touch', () => {
    const d = build(new THREE.Scene());
    const now = JSON.parse(JSON.stringify({
      colliders: d.colliders, perches: d.perches, spawn: d.spawn, bounds: d.bounds, tippables: d.tippables,
    }));
    expect(now).toEqual(BEFORE);
  });

  it('adds the shell to the den scene once', () => {
    const scene = new THREE.Scene();
    build(scene);
    expect(scene.children.filter((c) => c.name === 'denCosy')).toHaveLength(1);
  });

  it('is deterministic — two builds are byte-identical', () => {
    const a = meshes(cosyShell());
    const b = meshes(cosyShell());
    for (let i = 0; i < a.length; i++) {
      expect(Array.from(a[i].geometry.attributes.position.array)).toEqual(Array.from(b[i].geometry.attributes.position.array));
      expect(Array.from(a[i].geometry.attributes.color?.array ?? [])).toEqual(Array.from(b[i].geometry.attributes.color?.array ?? []));
    }
  });
});
