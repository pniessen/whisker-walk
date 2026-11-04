import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/budget.test.js).
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

const {
  hashCell, snapCentre, chunkCellsFor, layoutRadius, capacityFor, flatFootprints,
  buildGrassMask, grassAllowed, tuftAt, layoutTufts, createGrass, GRASS_AREAS,
  TUFT_MIN_H, TUFT_MAX_H, TRIANGLES_PER_TUFT, GRASS_STYLES, duneDensity, woodsDensity, marshDensity, moorDensity, pineFloorDensity, gorgeFloorDensity, groundFinds,
  GROUND_TINTS, tintSampler,
} = await import('../src/render/grass.js');
const { gorgeGround } = await import('../src/world/gorgeshape.js');
const { inWater } = await import('../src/world/builder.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildSeaside, SPAWN: SEASIDE_SPAWN } = await import('../src/world/seaside.js');
const { build: buildRiver } = await import('../src/world/river.js');
const { build: buildMoor } = await import('../src/world/moor.js');
const { riverGroundTint } = await import('../src/world/riverdress.js');
const { moorGroundTint } = await import('../src/world/moordress.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { assignShadowCasters } = await import('../src/render/rig.js');
const { LADDER } = await import('../src/render/quality.js');

const BUILDS = {
  park: buildPark, neighborhood: buildNeighborhood, seaside: buildSeaside, river: buildRiver, moor: buildMoor,
};

// walk.js's order: build, contact shadows, merge, casters, THEN grass.
function walkScene(areaId, tier = LADDER[0]) {
  const scene = new THREE.Scene();
  const areaData = BUILDS[areaId](scene);
  createContactShadows(scene);
  mergeStaticProps(scene);
  assignShadowCasters(scene);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 300);
  return { scene, areaData, camera, tier };
}

function aimAt(camera, x, z) {
  camera.position.set(x, 2.2, z + 4.5);
  camera.lookAt(x, 0.6, z);
  camera.updateMatrixWorld();
}

describe('grass pure helpers', () => {
  it('hashCell is deterministic, in [0,1), and varies by cell and salt', () => {
    expect(hashCell(3, -7, 2)).toBe(hashCell(3, -7, 2));
    const seen = new Set();
    for (let i = -20; i < 20; i++) {
      for (let j = -20; j < 20; j++) {
        const h = hashCell(i, j, 1);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
        seen.add(h);
      }
    }
    expect(seen.size).toBeGreaterThan(1500);
    expect(hashCell(1, 1, 1)).not.toBe(hashCell(1, 1, 2));
  });

  it('snapCentre holds still inside a chunk and steps by whole chunks', () => {
    const k = chunkCellsFor(0.3);
    const a = snapCentre(1.0, 1.0, 0.3, k);
    const b = snapCentre(1.0 + 0.2, 1.0 - 0.2, 0.3, k);
    expect(b).toEqual(a);
    const far = snapCentre(1.0 + k * 0.3, 1.0, 0.3, k);
    expect(far.cx - a.cx).toBe(k);
    expect(far.cz).toBe(a.cz);
    // Negative coordinates floor, not truncate.
    expect(snapCentre(-0.01, 0, 0.3, k).cx).toBe(-k + (k >> 1));
  });

  it('tuftAt is a pure function of its world cell, within the size limits', () => {
    let present = 0;
    for (let i = 0; i < 400; i++) {
      const t = tuftAt(i, -i * 3, 0.3);
      expect(tuftAt(i, -i * 3, 0.3)).toEqual(t);
      if (!t) continue;
      present++;
      expect(t.h).toBeGreaterThanOrEqual(TUFT_MIN_H);
      expect(t.h).toBeLessThanOrEqual(TUFT_MAX_H);
      // The jitter keeps the tuft inside its own lattice cell.
      expect(Math.floor(t.x / 0.3)).toBe(i);
      expect(Math.floor(t.z / 0.3) === -i * 3).toBe(true);
    }
    expect(present / 400).toBeGreaterThan(0.75);
    expect(present / 400).toBeLessThan(0.97);
  });

  it('the same spot grows the same tuft whichever centre lays it out', () => {
    const mask = { at: () => 1 };
    const opts = { radius: 4, spacing: 0.3 };
    const byKey = (cx, cz) => {
      const m = new Map();
      layoutTufts(cx, cz, opts, mask, (t) => m.set(`${t.x},${t.z}`, t));
      return m;
    };
    const a = byKey(0, 0);
    const b = byKey(7, 7);
    let shared = 0;
    for (const [key, t] of b) {
      if (!a.has(key)) continue;
      shared++;
      expect(a.get(key)).toEqual(t);
    }
    expect(shared).toBeGreaterThan(100);
  });

  it('capacityFor bounds every layout', () => {
    for (const tier of LADDER) {
      const n = layoutTufts(12, -5, { radius: tier.grassRadius, spacing: tier.grassSpacing }, { at: () => 1 }, () => {});
      expect(n).toBeLessThanOrEqual(capacityFor(tier.grassRadius, tier.grassSpacing));
    }
  });
});

describe('grass mask', () => {
  for (const areaId of GRASS_AREAS) {
    it(`${areaId}: no grass on paths, in water, in colliders, on boxes, or outside bounds`, () => {
      const scene = new THREE.Scene();
      const area = BUILDS[areaId](scene);
      const fps = flatFootprints(scene);
      // Every path() the area built is found (they are tagged 'path').
      const paths = scene.children.filter((c) => c.name === 'path');
      expect(paths.length).toBeGreaterThan(0);
      expect(fps.filter((f) => f.kind === 'strip').length).toBeGreaterThanOrEqual(paths.length);
      const mask = buildGrassMask(area, fps);
      for (const p of paths) {
        expect(mask.at(p.position.x, p.position.z)).toBe(0);
      }
      for (const c of area.colliders) expect(mask.at(c.x, c.z)).toBe(0);
      for (const bx of area.boxes ?? []) expect(mask.at(bx.x, bx.z)).toBe(0);
      for (const w of area.waters ?? []) {
        const x = w.kind === 'circle' ? w.x : (w.minX + w.maxX) / 2;
        const z = w.kind === 'circle' ? w.z : (w.minZ + w.maxZ) / 2;
        expect(mask.at(x, z)).toBe(0);
      }
      const b = area.bounds;
      expect(mask.at(b.minX - 1, 0)).toBe(0);
      expect(mask.at(0, b.maxZ + 1)).toBe(0);
      // And most of the lawn is still lawn.
      const open = mask.data.reduce((s, v) => s + v, 0) / mask.data.length;
      expect(open).toBeGreaterThan(0.6);
    });
  }

  it('an oriented strip masks its own diagonal, not its bounding box', () => {
    // The park's (0,20)->(-4,4) walk: a point on the line is masked, the
    // bounding box's far corner is not.
    const scene = new THREE.Scene();
    const area = buildPark(scene);
    const fps = flatFootprints(scene);
    expect(grassAllowed(area, fps, -2, 12)).toBe(false);
    expect(grassAllowed(area, fps, -9, 9.5)).toBe(true);
  });
});

describe('grass rig — the budget', () => {
  for (const areaId of GRASS_AREAS) {
    it(`${areaId}: one mesh, no shadow casting, nothing on paths/water/colliders`, () => {
      const { scene, areaData, camera, tier } = walkScene(areaId);
      const before = scene.children.length;
      // Stand the view over the busiest stretch of each area: the park's
      // fountain/path junction beside the pond, the neighbourhood crossroads.
      const [fx, fz] = areaId === 'park' ? [-6, 10] : [0, 0];
      aimAt(camera, fx, fz);
      const grass = createGrass(scene, { areaId, areaData, tier, camera });
      grass.update(1, 1);
      expect(scene.children.length).toBe(before + 1);
      const grassMeshes = [];
      scene.traverse((o) => { if (o.userData.grass) grassMeshes.push(o); });
      expect(grassMeshes).toHaveLength(1);
      const mesh = grassMeshes[0];
      expect(mesh.isInstancedMesh).toBe(true);
      expect(Array.isArray(mesh.material)).toBe(false); // one material, one draw
      expect(mesh.castShadow).toBe(false);
      expect(mesh.count).toBeGreaterThan(500);
      expect(mesh.count).toBeLessThanOrEqual(grass.capacity);

      // A later caster sweep (denlive.js's per-object sweep, or a re-run)
      // still cannot turn it on.
      assignShadowCasters(scene);
      expect(mesh.castShadow).toBe(false);

      // Every written instance is somewhere grass may grow.
      const fps = flatFootprints(scene);
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        const bad = inWater(areaData.waters ?? [], p.x, p.z)
          || areaData.colliders.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r)
          || fps.some((f) => f.kind === 'strip'
            && Math.abs((p.x - f.x) * f.ux + (p.z - f.z) * f.uz) < f.halfL
            && Math.abs(-(p.x - f.x) * f.uz + (p.z - f.z) * f.ux) < f.halfW)
          || fps.some((f) => f.kind === 'disc' && Math.hypot(p.x - f.x, p.z - f.z) < f.r);
        expect(bad).toBe(false);
      }
      grass.dispose();
      expect(scene.children.length).toBe(before);
    });
  }

  it('re-lays only when the view crosses a chunk', () => {
    const { scene, areaData, camera, tier } = walkScene('neighborhood');
    aimAt(camera, 20, 20);
    const grass = createGrass(scene, { areaId: 'neighborhood', areaData, tier, camera });
    const v0 = grass.mesh.instanceMatrix.version;
    aimAt(camera, 20.05, 20.05);
    grass.update(2, 1);
    expect(grass.mesh.instanceMatrix.version).toBe(v0);
    aimAt(camera, 26, 20);
    grass.update(3, 1);
    expect(grass.mesh.instanceMatrix.version).toBeGreaterThan(v0);
    grass.dispose();
  });

  it('keepOut clears a spot with no collider (the doormat a cat naps on)', () => {
    // neighborhood-nap-1, the brick house's doormat: no collider and no decal,
    // so only keepOut keeps tufts from poking through a 2cm mat.
    const [mx, mz] = [7.9, 30];
    const near = (grass) => {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      let n = 0;
      for (let i = 0; i < grass.mesh.count; i++) {
        grass.mesh.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        if (Math.hypot(p.x - mx, p.z - mz) < 0.6) n++;
      }
      return n;
    };
    const open = walkScene('neighborhood');
    aimAt(open.camera, mx, mz);
    const bare = createGrass(open.scene, { areaId: 'neighborhood', ...open });
    bare.update(1, 1);
    expect(near(bare)).toBeGreaterThan(0); // the spot really is lawn
    bare.dispose();

    const kept = walkScene('neighborhood');
    aimAt(kept.camera, mx, mz);
    const grass = createGrass(kept.scene, {
      areaId: 'neighborhood', ...kept, keepOut: [{ x: mx, z: mz, r: 0.6 }],
    });
    grass.update(1, 1);
    expect(near(grass)).toBe(0);
    grass.dispose();
  });

  it('stays out of the Docks and the den', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    for (const areaId of ['docks', 'den']) {
      const g = createGrass(scene, { areaId, areaData: { bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 } }, tier: LADDER[0], camera });
      expect(g.mesh).toBe(null);
      g.update(1, 1);
      g.dispose();
    }
    expect(scene.children).toHaveLength(0);
  });

  it('per-tier counts: low is sparser and smaller than high', () => {
    const high = LADDER[0];
    const low = LADDER[3];
    expect(low.grassRadius).toBeLessThan(high.grassRadius);
    expect(low.grassSpacing).toBeGreaterThan(high.grassSpacing);
    const tris = (t) => capacityFor(t.grassRadius, t.grassSpacing) * TRIANGLES_PER_TUFT;
    // "Triangles are nearly free", but keep the ceiling explicit.
    expect(tris(high)).toBeLessThan(60000);
    expect(tris(low)).toBeLessThan(tris(high) / 2);
    expect(layoutRadius(high.grassRadius, high.grassSpacing)).toBeGreaterThan(high.grassRadius);
  });
});

describe('woodland undergrowth (the Woods)', () => {
  it('the Woods grows undergrowth', () => {
    expect(GRASS_STYLES.woods.density).toBe(woodsDensity);
    let lo = Infinity; let hi = -Infinity; let bare = 0; let thick = 0;
    for (let x = -60; x <= 60; x++) {
      for (let z = -60; z <= 60; z++) {
        const d = woodsDensity(x, z);
        lo = Math.min(lo, d); hi = Math.max(hi, d);
        if (d === 0) bare++;
        if (d > 0.5) thick++;
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(0.85);
    expect(bare).toBeGreaterThan(0);
    expect(thick).toBeGreaterThan(0);
  });
});

describe('dune grass (Seaside, Stream 4 round three)', () => {
  const dune = GRASS_STYLES.seaside;

  it('grows only on the back beach and the cliff foot', () => {
    // Front beach, boardwalk, wet sand and spawn: bare, the whole length of
    // the beach (bounds z -34..48), including past the cliff foot.
    for (let z = -34; z <= 48; z += 0.5) {
      for (const x of [14, 16, 18, 20, 22, 23, 24, 25]) expect(duneDensity(x, z)).toBe(0);
      if (z > -24) for (const x of [6, 12]) expect(duneDensity(x, z)).toBe(0);
    }
    expect(duneDensity(SEASIDE_SPAWN.x, SEASIDE_SPAWN.z)).toBe(0);
    // The back beach has clumps AND bare sand between them.
    let grown = 0;
    let bare = 0;
    for (let x = -46; x <= -12; x += 0.5) {
      for (let z = -30; z <= 46; z += 0.5) (duneDensity(x, z) > 0.3 ? grown++ : bare++);
    }
    expect(grown / (grown + bare)).toBeGreaterThan(0.15);
    expect(bare / (grown + bare)).toBeGreaterThan(0.3);
  });

  it('tufts are taller than lawn but never as tall as the cat', () => {
    let n = 0;
    for (let i = -160; i < -40; i++) {
      for (let j = -100; j < 100; j++) {
        const t = tuftAt(i, j, 0.3, dune);
        if (!t) continue;
        n++;
        expect(t.h).toBeGreaterThanOrEqual(dune.hMin);
        expect(t.h).toBeLessThanOrEqual(0.3);
      }
    }
    expect(n).toBeGreaterThan(1000);
    expect(dune.hMax).toBeGreaterThan(TUFT_MAX_H);
  });

  it('lawn tufts are unchanged by the style refactor', () => {
    // Golden values captured from the pre-style grass.js on main (Stream 4
    // round two): the default style must reproduce them exactly.
    const GOLD = [[0,0,{"x":0.1736434184387326,"z":0.09074121499434114,"h":0.09237821347174668,"s":0.9440568940791991,"rot":4.4145308368031495,"tint":[1.1703621288834765,1.0717154515720904,0.9730687742607042]}],[7,-3,{"x":2.1901849627867342,"z":-0.6909551570937037,"h":0.0795965326308756,"s":0.8975483133953063,"rot":2.5891740061071977,"tint":[1.1305235349230236,1.0363120191916824,0.942100503460341]}],[-12,40,{"x":-3.518841334618628,"z":12.147163804918527,"h":0.0906101243904757,"s":0.9219364539122423,"rot":5.236757313310521,"tint":[1.027287373971078,1.0124685842590406,0.9976497945470033]}],[101,5,{"x":30.437912731524555,"z":1.5758719412237405,"h":0.11519275292594076,"s":0.9982766116601441,"rot":4.624480565274916,"tint":[1.1332379906216372,1.072020187494345,1.0108023843670526]}],[-55,-66,{"x":-16.331090749371796,"z":-19.571300490908325,"h":0.08054081870782487,"s":0.8753474137235983,"rot":5.859810309442972,"tint":[1.112365198516662,1.0291068128636107,0.9458484272105594]}],[3,9,{"x":1.0070090587064624,"z":2.9580968719907106,"h":0.12510545919179844,"s":1.0732476695763031,"rot":4.028933675247906,"tint":[0.9771537669158975,0.9320598967233673,0.8869660265308371]}]];
    for (const [i, j, t] of GOLD) expect(tuftAt(i, j, 0.3)).toEqual(t);
    for (let i = 0; i < 50; i++) {
      const a = tuftAt(i, 3 * i, 0.3);
      const b = tuftAt(i, 3 * i, 0.3, GRASS_STYLES.park);
      expect(a).toEqual(b);
      if (a) {
        expect(a.h).toBeGreaterThanOrEqual(TUFT_MIN_H);
        expect(a.h).toBeLessThanOrEqual(TUFT_MAX_H);
      }
    }
  });

  for (const tier of [LADDER[0], LADDER[3]]) {
    it(`seaside rig (${tier.name}): one mesh, no shadows, tufts only where allowed`, () => {
      const { scene, areaData, camera } = walkScene('seaside', tier);
      const before = scene.children.length;
      aimAt(camera, -24, 6);
      const grass = createGrass(scene, { areaId: 'seaside', areaData, tier, camera });
      grass.update(1, 1);
      expect(scene.children.length).toBe(before + 1);
      expect(grass.mesh.castShadow).toBe(false);
      expect(grass.mesh.count).toBeGreaterThan(100);
      expect(grass.mesh.count).toBeLessThanOrEqual(grass.capacity);
      expect(grass.capacity * TRIANGLES_PER_TUFT).toBeLessThan(120000);
      const fps = flatFootprints(scene);
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      for (let i = 0; i < grass.mesh.count; i++) {
        grass.mesh.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        expect(duneDensity(p.x, p.z)).toBeGreaterThan(0);
        expect(areaData.colliders.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r)).toBe(false);
        expect(fps.some((f) => f.kind === 'strip'
          && Math.abs((p.x - f.x) * f.ux + (p.z - f.z) * f.uz) < f.halfL
          && Math.abs(-(p.x - f.x) * f.uz + (p.z - f.z) * f.ux) < f.halfW)).toBe(false);
      }
      // Fish, golden mice and scenics keep a bare patch (walk.js's keepOut).
      const finds = groundFinds(areaData, GOLD_MICE.seaside);
      expect(finds.length).toBeGreaterThan(5);
      const withKeepOut = createGrass(scene, {
        areaId: 'seaside', areaData, tier, camera,
        keepOut: finds.map((f) => ({ ...f, r: 0.5 })),
      });
      for (const f of finds) {
        aimAt(camera, f.x, f.z);
        withKeepOut.update(3, 1);
        for (let i = 0; i < withKeepOut.mesh.count; i++) {
          withKeepOut.mesh.getMatrixAt(i, m);
          p.setFromMatrixPosition(m);
          expect(Math.hypot(p.x - f.x, p.z - f.z)).toBeGreaterThan(0.5);
        }
      }
      withKeepOut.dispose();
      // Nothing on the wet sand by the south end either.
      aimAt(camera, 23, -30);
      grass.update(4, 1);
      for (let i = 0; i < grass.mesh.count; i++) {
        grass.mesh.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        expect(p.x).toBeLessThan(14);
      }
      // At the spawn, looking along the boardwalk: nothing at all.
      aimAt(camera, SEASIDE_SPAWN.x, SEASIDE_SPAWN.z - 4);
      grass.update(2, 1);
      expect(grass.mesh.count).toBe(0);
      grass.dispose();
      expect(scene.children.length).toBe(before);
    });
  }
});

describe('groundFinds', () => {
  it('lists ground-level collectibles and mice and every scenic, not raised ones', () => {
    const area = {
      collectibles: [{ x: 1, z: 2 }, { x: 3, z: 4, y: 1.9 }, { x: 5, z: 6, y: 0 }],
      scenics: [{ id: 's', x: 7, z: 8 }],
    };
    const mice = [{ x: 9, z: 10 }, { x: 11, z: 12, y: 0.72 }];
    expect(groundFinds(area, mice)).toEqual([
      { x: 1, z: 2 }, { x: 5, z: 6 }, { x: 9, z: 10 }, { x: 7, z: 8 },
    ]);
    expect(groundFinds(undefined, undefined)).toEqual([]);
  });
});

describe('marsh grass (the River)', () => {
  it('the River grows marsh grass', () => {
    expect(GRASS_STYLES.river.density).toBe(marshDensity);
    let lo = Infinity; let hi = -Infinity; let bare = 0; let thick = 0;
    for (let x = -50; x <= 50; x++) {
      for (let z = -50; z <= 50; z++) {
        const d = marshDensity(x, z);
        lo = Math.min(lo, d); hi = Math.max(hi, d);
        if (d === 0) bare++;
        if (d > 0.5) thick++;
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(0.9);
    expect(bare).toBeGreaterThan(0);
    expect(thick).toBeGreaterThan(0);
  });
});

describe('moor grass (the Moor)', () => {
  it('the Moor grows moor grass', () => {
    expect(GRASS_STYLES.moor.density).toBe(moorDensity);
    let lo = Infinity; let hi = -Infinity; let bare = 0; let thick = 0;
    for (let x = -50; x <= 50; x++) {
      for (let z = -50; z <= 50; z++) {
        const d = moorDensity(x, z);
        lo = Math.min(lo, d); hi = Math.max(hi, d);
        if (d === 0) bare++;
        if (d > 0.5) thick++;
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(0.95);
    expect(bare).toBeGreaterThan(0);
    expect(thick).toBeGreaterThan(0);
  });
});

describe('pine-floor grass (the Pines)', () => {
  it('the Pines grows a thin pine-floor grass', () => {
    expect(GRASS_STYLES.pines.density).toBe(pineFloorDensity);
    let lo = Infinity; let hi = -Infinity; let bare = 0; let some = 0;
    for (let x = -50; x <= 50; x++) {
      for (let z = -50; z <= 50; z++) {
        const d = pineFloorDensity(x, z);
        lo = Math.min(lo, d); hi = Math.max(hi, d);
        if (d === 0) bare++;
        if (d > 0.4) some++;
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(0.7);
    expect(bare).toBeGreaterThan(0);
    expect(some).toBeGreaterThan(0);
  });
});

describe('floor grass (the Gorge)', () => {
  it('the Gorge grows a little floor grass', () => {
    expect(GRASS_STYLES.gorge).toEqual({
      color: 0x6f7448, hMin: 0.05, hMax: 0.16, width: 0.8, warm: 0.05, sway: 0.25, reach: 1.2, density: gorgeFloorDensity, ground: 0,
    });
    let hi = -Infinity; let bare = 0; let some = 0;
    for (let x = -50; x <= 50; x++) {
      for (let z = -50; z <= 50; z++) {
        const d = gorgeFloorDensity(x, z);
        expect(d).toBeGreaterThanOrEqual(0);
        hi = Math.max(hi, d);
        if (d === 0) bare++;
        if (d > 0.3) some++;
      }
    }
    expect(hi).toBeLessThanOrEqual(0.45);
    expect(bare).toBeGreaterThan(0);
    expect(some).toBeGreaterThan(0);
  });

  // Tufts don't tilt (ruling F5), so they grow only on the flat base floor,
  // and never right up against the rock.
  it('grass grows only on the floor', () => {
    const ground = gorgeGround();
    // a wall within 1 m: any spot that close whose ground is not the floor's
    const wallNear = (x, z) => {
      for (let r = 0.1; r <= 1 + 1e-9; r += 0.1) {
        for (let a = 0; a < 64; a++) {
          const t = (a / 64) * Math.PI * 2;
          if (ground.y(x + r * Math.cos(t), z + r * Math.sin(t)) !== 0) return true;
        }
      }
      return false;
    };
    const wrong = [];
    let grows = 0;
    for (let x = -50; x <= 50; x++) {
      for (let z = -50; z <= 50; z++) {
        if (!(gorgeFloorDensity(x, z) > 0)) continue;
        grows++;
        if (ground.y(x, z) !== 0 || ground.ceil(x, z) !== Infinity || wallNear(x, z)) wrong.push(`(${x}, ${z})`);
      }
    }
    expect(wrong.slice(0, 8)).toEqual([]);
    expect(grows).toBeGreaterThan(100);
    // nothing on the west top, the clifftop or the ledges
    for (const [x, z] of [[-30, -30], [-30, 20], [20, -30], [7, 10], [10, 40], [4, -5]]) expect(gorgeFloorDensity(x, z)).toBe(0);
  });
});

describe('ground tint under tufts', () => {
  const B50 = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

  it('tintSampler matches the function at grid corners and between them', () => {
    const s = tintSampler((x, z) => [1 + x / 100, 1, 1 - z / 100], B50);
    const out = [0, 0, 0];
    expect(s.at(10, -20, out)).toBe(out);
    expect(out[0]).toBeCloseTo(1.1, 6);
    expect(out[1]).toBeCloseTo(1, 6);
    expect(out[2]).toBeCloseTo(1.2, 6);
    s.at(10.5, -20.5, out);
    expect(out[0]).toBeCloseTo(1.105, 6);
    expect(out[1]).toBeCloseTo(1, 6);
    expect(out[2]).toBeCloseTo(1.205, 6);
  });

  it('tintSampler clamps outside its bounds', () => {
    const s = tintSampler((x, z) => [1 + x / 100, 1, 1 - z / 100], B50);
    const a = s.at(80, 0, [0, 0, 0]);
    const b = s.at(50, 0, [0, 0, 0]);
    expect(a).toEqual(b);
    for (const [x, z] of [[-49.9, 49.9], [49.9, -49.9], [-500, 500], [500, -500], [50, 50]]) {
      for (const v of s.at(x, z, [0, 0, 0])) expect(Number.isFinite(v)).toBe(true);
    }
    expect(s.at(-500, 0, [0, 0, 0])[0]).toBeCloseTo(0.5, 6);
  });

  it('tintSampler only samples new cells', () => {
    const s = tintSampler((x, z) => [1 + x / 100, 1, 1 - z / 100], B50);
    const out = [0, 0, 0];
    const block = () => {
      for (let i = 0; i < 34; i++) for (let j = 0; j < 34; j++) s.at(i * 0.3, j * 0.3, out);
    };
    block();
    expect(s.samples).toBeGreaterThan(0);
    expect(s.samples).toBeLessThanOrEqual(11 * 11 + 4);
    const n = s.samples;
    block();
    expect(s.samples).toBe(n);
  });

  it('the River and the Moor carry a ground tint, nothing else does', () => {
    expect(GROUND_TINTS.river).toBe(riverGroundTint);
    expect(GROUND_TINTS.moor).toBe(moorGroundTint);
    expect(GRASS_STYLES.river.ground).toBe(0.9);
    expect(GRASS_STYLES.moor.ground).toBe(0.9);
    for (const id of ['park', 'neighborhood', 'seaside', 'woods', 'pines', 'gorge']) {
      expect(GRASS_STYLES[id].ground).toBe(0);
    }
  });

  // Every laid tuft's colour is its own tint times the ground tint under it,
  // pulled 90% of the way. Two checks: exact wiring against the same 1 m
  // bilinear grid (a fresh sampler, unit-tested above), and closeness to the
  // tint function itself. The ground mesh carries the tint at its own ~1.9 m
  // vertices (120 m / 64 segments), so the 1 m grid is finer than the ground
  // the eye compares with; near a steep feature (a shore, the reedbed edge)
  // it can still miss the exact function by more, hence a percentile.
  function checkFollows(grass, fn, ground, style, bounds) {
    const ref = tintSampler(fn, bounds);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    const g = [0, 0, 0];
    const spacing = LADDER[0].grassSpacing;
    let wired = 0;
    const off = [];
    for (let i = 0; i < grass.mesh.count; i++) {
      grass.mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      const t = tuftAt(Math.floor(p.x / spacing), Math.floor(p.z / spacing), spacing, style);
      grass.mesh.getColorAt(i, c);
      const got = [c.r, c.g, c.b];
      ref.at(p.x, p.z, g);
      const e = fn(p.x, p.z);
      let worst = 0;
      for (let k = 0; k < 3; k++) {
        wired = Math.max(wired, Math.abs(got[k] - t.tint[k] * (1 + (g[k] - 1) * ground)));
        worst = Math.max(worst, Math.abs(got[k] - t.tint[k] * (1 + (e[k] - 1) * ground)));
      }
      off.push(worst);
    }
    off.sort((a, b) => a - b);
    return { wired, p95: off[Math.floor(0.95 * (off.length - 1))], max: off[off.length - 1] };
  }
  function expectFollows(r) {
    expect(r.wired).toBeLessThan(1e-4);
    expect(r.p95).toBeLessThan(0.04);
    expect(r.max).toBeLessThan(0.25);
  }
  function meanRG(grass) {
    const c = new THREE.Color();
    let sum = 0;
    for (let i = 0; i < grass.mesh.count; i++) {
      grass.mesh.getColorAt(i, c);
      sum += c.r / c.g;
    }
    return sum / grass.mesh.count;
  }

  it('Moor tufts follow the ground tint, and a hollow reads apart from a crest', () => {
    const { scene, areaData, camera, tier } = walkScene('moor');
    aimAt(camera, -12, -10);
    const grass = createGrass(scene, { areaId: 'moor', areaData, tier, camera });
    expect(grass.tint).not.toBeNull();
    expect(grass.mesh.count).toBeGreaterThan(200);
    expectFollows(checkFollows(grass, moorGroundTint, 0.9, GRASS_STYLES.moor, areaData.bounds));
    const hollow = meanRG(grass);
    // One chunk over: the lazy grid samples only the new strip of cells.
    const before = grass.tint.samples;
    aimAt(camera, -12 + 2.1, -10);
    grass.update(1, 1);
    expect(grass.tint.samples - before).toBeLessThan(grass.mesh.count / 4);
    aimAt(camera, 8, 24);
    grass.update(2, 1);
    expect(grass.mesh.count).toBeGreaterThan(200);
    expectFollows(checkFollows(grass, moorGroundTint, 0.9, GRASS_STYLES.moor, areaData.bounds));
    const crest = meanRG(grass);
    expect(Math.abs(hollow - crest)).toBeGreaterThan(0.05);
    grass.dispose();
  }, 120_000);

  it('River tufts follow the ground tint', () => {
    const { scene, areaData, camera, tier } = walkScene('river');
    const grass = createGrass(scene, { areaId: 'river', areaData, tier, camera });
    expect(grass.tint).not.toBeNull();
    let checked = 0;
    for (const [x, z] of [[0, 0], [-20, 10], [20, -20], [10, 30]]) {
      aimAt(camera, x, z);
      grass.update(1, 1);
      checked += grass.mesh.count;
      expectFollows(checkFollows(grass, riverGroundTint, 0.9, GRASS_STYLES.river, areaData.bounds));
    }
    expect(checked).toBeGreaterThan(200);
    grass.dispose();
  }, 120_000);

  it('lawn tufts ignore ground tint', () => {
    const { scene, areaData, camera, tier } = walkScene('park');
    aimAt(camera, 0, 0);
    const grass = createGrass(scene, { areaId: 'park', areaData, tier, camera });
    expect(grass.tint).toBeNull();
    grass.dispose();
  }, 120_000);
});
