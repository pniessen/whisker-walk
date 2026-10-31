import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/grass.test.js).
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
  createAmbient, ambientKind, ambientCapacity, findTrees, findLamps, KEEP_CLEAR, AMBIENT_KINDS,
} = await import('../src/render/ambient.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { build: buildDen } = await import('../src/world/den.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { assignShadowCasters } = await import('../src/render/rig.js');
const { LADDER } = await import('../src/render/quality.js');

const BUILDS = {
  park: buildPark, neighborhood: buildNeighborhood, seaside: buildSeaside, docks: buildDocks, den: buildDen,
};

// walk.js's order: build, contact shadows, merge, casters, THEN ambient.
function walkScene(areaId) {
  const scene = new THREE.Scene();
  const areaData = BUILDS[areaId](scene);
  createContactShadows(scene);
  mergeStaticProps(scene);
  assignShadowCasters(scene);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 300);
  return { scene, areaData, camera };
}

// A cat-height game camera 4.5m behind a point, looking at it.
function aimAt(camera, x, z) {
  camera.position.set(x, 2.2, z + 4.5);
  camera.lookAt(x, 0.6, z);
  camera.updateMatrixWorld();
}

// Where each area's effect is worth looking at.
const VIEW = {
  park: [-14, 24], // among the big trees
  neighborhood: [0, 30],
  seaside: [20, 20], // beside the shoreline scenic
  docks: [-12, 10], // beside the north-quay lamps
  den: [0, 0],
};

function make(areaId, opts = {}) {
  const w = walkScene(areaId);
  aimAt(w.camera, ...VIEW[areaId]);
  const ambient = createAmbient(w.scene, {
    areaId, areaData: w.areaData, tier: LADDER[0], camera: w.camera, seed: 7, ...opts,
  });
  return { ...w, ambient };
}

function run(ambient, seconds, t0 = 0) {
  let t = t0;
  for (let s = 0; s < seconds; s += 1 / 30) {
    t += 1 / 30;
    ambient.update(t, 1);
  }
  return t;
}

const meshesNamed = (scene, name) => {
  const out = [];
  scene.traverse((o) => { if (o.name === name) out.push(o); });
  return out;
};

describe('ambient kinds', () => {
  it('gives each outdoor area its effect and the den none', () => {
    expect(ambientKind('park')).toBe('leaves');
    expect(ambientKind('seaside')).toBe('spray');
    expect(ambientKind('docks')).toBe('motes');
    expect(ambientKind('docks', { dusk: true })).toBe('moths');
    expect(ambientKind('neighborhood')).toBe('fluff');
    expect(ambientKind('den')).toBeNull();
  });

  it('builds one Points mesh per outdoor area, with no shadow draws', () => {
    for (const areaId of ['park', 'neighborhood', 'seaside', 'docks']) {
      const { scene, ambient } = make(areaId);
      const found = meshesNamed(scene, 'ambient');
      expect(found, areaId).toHaveLength(1);
      expect(found[0]).toBe(ambient.mesh);
      expect(ambient.mesh.isPoints).toBe(true);
      expect(ambient.mesh.castShadow).toBe(false);
      expect(ambient.mesh.receiveShadow).toBe(false);
      expect(ambient.mesh.material.depthWrite).toBe(false);
      expect(ambient.mesh.material.transparent).toBe(true);
      expect(ambient.mesh.userData.ambient).toBe(ambientKind(areaId));
    }
  });

  it('adds nothing to the den', () => {
    const { scene, ambient } = make('den');
    expect(ambient.mesh).toBeNull();
    expect(meshesNamed(scene, 'ambient')).toHaveLength(0);
    ambient.update(1, 1);
    ambient.dispose();
  });
});

describe('ambient budget and tiers', () => {
  it('scales the capacity down on the low rung and never past the base count', () => {
    for (const kind of AMBIENT_KINDS) {
      const high = ambientCapacity(kind, LADDER[0]);
      const low = ambientCapacity(kind, LADDER[3]);
      expect(high).toBeGreaterThan(0);
      expect(low).toBeGreaterThan(0);
      expect(low).toBeLessThan(high);
      expect(ambientCapacity(kind, { ...LADDER[0], ambientScale: 5 })).toBe(high);
      expect(ambientCapacity(kind, { ...LADDER[0], ambientScale: 0 })).toBe(0);
    }
    expect(ambientCapacity('leaves', LADDER[0])).toBeLessThanOrEqual(40); // sparse: never a blizzard
  });

  it('allocates its buffers once, sized to the tier, and keeps them', () => {
    const w = walkScene('park');
    aimAt(w.camera, ...VIEW.park);
    for (const rung of [0, 3]) {
      const a = createAmbient(w.scene, { areaId: 'park', areaData: w.areaData, tier: LADDER[rung], camera: w.camera, seed: 1 });
      const cap = ambientCapacity('leaves', LADDER[rung]);
      expect(a.capacity).toBe(cap);
      const attrs = a.mesh.geometry.attributes;
      const before = attrs.position.array;
      expect(attrs.position.count).toBe(cap);
      expect(attrs.color.itemSize).toBe(4);
      expect(attrs.aSize.count).toBe(cap);
      run(a, 3);
      aimAt(w.camera, 20, -10);
      run(a, 3, 3);
      expect(attrs.position.array).toBe(before); // same buffer, no reallocation
      expect(attrs.position.count).toBe(cap);
      a.dispose();
    }
  });

  it('is off (no mesh) on a tier with ambientScale 0', () => {
    const w = walkScene('park');
    const a = createAmbient(w.scene, { areaId: 'park', areaData: w.areaData, tier: { ...LADDER[0], ambientScale: 0 }, camera: w.camera });
    expect(a.mesh).toBeNull();
  });
});

describe('reduced motion', () => {
  it('draws nothing at all', () => {
    for (const areaId of ['park', 'seaside', 'docks', 'neighborhood']) {
      const { scene, ambient } = make(areaId, { reducedMotion: true });
      expect(ambient.mesh).toBeNull();
      expect(meshesNamed(scene, 'ambient')).toHaveLength(0);
      ambient.update(2, 1);
    }
  });
});

describe('keep-clear', () => {
  it('never shows a particle inside the camera sphere or on the cat', () => {
    for (const areaId of ['park', 'seaside', 'docks', 'neighborhood']) {
      for (const dusk of [false, true]) {
        const w = walkScene(areaId);
        const [x, z] = VIEW[areaId];
        const cat = new THREE.Object3D();
        cat.position.set(x, 0, z);
        aimAt(w.camera, x, z);
        const a = createAmbient(w.scene, {
          areaId, areaData: w.areaData, tier: LADDER[0], camera: w.camera, cat, dusk, seed: 3,
        });
        const { position, color, aSize } = a.mesh.geometry.attributes;
        let t = 0;
        let shown = 0;
        // Walk the camera through the effect so particles do come close.
        for (let step = 0; step < 240; step++) {
          t += 1 / 30;
          cat.position.x = x + Math.sin(step / 40) * 3;
          aimAt(w.camera, cat.position.x, z);
          a.update(t, 1);
          for (let i = 0; i < a.capacity; i++) {
            if (aSize.array[i] === 0) continue;
            shown++;
            const p = new THREE.Vector3().fromBufferAttribute(position, i);
            expect(p.distanceTo(w.camera.position), `${areaId} ${i}`).toBeGreaterThanOrEqual(KEEP_CLEAR);
            expect(p.distanceTo(new THREE.Vector3(cat.position.x, 0.25, z))).toBeGreaterThan(0.5);
            expect(color.array[i * 4 + 3]).toBeGreaterThan(0);
          }
        }
        expect(shown, `${areaId} dusk=${dusk}`).toBeGreaterThan(0);
      }
    }
  });

  it('hides a particle the camera is standing on', () => {
    const { camera, ambient } = make('seaside', { prewarm: false });
    run(ambient, 4);
    const { position, aSize } = ambient.mesh.geometry.attributes;
    let idx = -1;
    for (let i = 0; i < ambient.capacity; i++) if (aSize.array[i] > 0) { idx = i; break; }
    expect(idx).toBeGreaterThanOrEqual(0);
    // Put the lens right on that puff.
    camera.position.fromBufferAttribute(position, idx);
    camera.updateMatrixWorld();
    ambient.update(4.01, 1);
    const p = new THREE.Vector3().fromBufferAttribute(position, idx);
    expect(p.distanceTo(camera.position)).toBeLessThan(KEEP_CLEAR);
    expect(aSize.array[idx]).toBe(0);
  });
});

describe('park leaves', () => {
  it('finds the park trees on the scene after the merge', () => {
    const { scene } = walkScene('park');
    const trees = findTrees(scene);
    expect(trees.length).toBeGreaterThanOrEqual(12);
    // The oak by the bench (4.5, 27.3), scale 1.1: canopy at 2.8 * 1.1.
    const oak = trees.find((t) => Math.abs(t.x - 4.5) < 1e-6 && Math.abs(t.z - 27.3) < 1e-6);
    expect(oak).toBeTruthy();
    expect(oak.y).toBeCloseTo(2.8 * 1.1, 5);
    expect(oak.r).toBeCloseTo(1.6 * 1.1, 5);
  });

  it('lets each leaf go from under a real canopy', () => {
    const { ambient } = make('park', { prewarm: false });
    const trees = ambient.anchors;
    const { position, aSize } = ambient.mesh.geometry.attributes;
    const seen = new Set();
    let t = 0;
    for (let step = 0; step < 330; step++) {
      t += 1 / 30;
      ambient.update(t, 1);
      for (let i = 0; i < ambient.capacity; i++) {
        if (seen.has(i) || aSize.array[i] === 0) continue;
        seen.add(i);
        // First frame a leaf is shown: near the top of its fall, under a tree.
        const p = new THREE.Vector3().fromBufferAttribute(position, i);
        const near = trees.some((tr) => Math.hypot(p.x - tr.x, p.z - tr.z) <= tr.r * 0.7 + 0.5
          && p.y <= tr.y && p.y >= tr.y - 0.5 * tr.r - 0.5);
        expect(near, `leaf ${i} at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`).toBe(true);
      }
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('settles leaves on the ground and moves them with the shared wind', () => {
    const { ambient } = make('park');
    const { position, aSize } = ambient.mesh.geometry.attributes;
    run(ambient, 2);
    let low = 0;
    for (let i = 0; i < ambient.capacity; i++) {
      if (aSize.array[i] > 0 && position.getY(i) < 0.1) low++;
      expect(position.getY(i)).toBeGreaterThanOrEqual(-10);
    }
    expect(low).toBeGreaterThan(0); // some are resting after the prewarm
  });
});

describe('docks moths', () => {
  it('finds the lamp posts', () => {
    const { scene } = walkScene('docks');
    const lamps = findLamps(scene);
    expect(lamps.length).toBeGreaterThanOrEqual(12);
    expect(lamps.every((l) => Math.abs(l.y - 3.3) < 1e-6)).toBe(true);
  });

  it('circles the lamps at dusk and only at dusk', () => {
    const day = make('docks');
    expect(day.ambient.kind).toBe('motes');
    const dusk = make('docks', { dusk: true });
    expect(dusk.ambient.kind).toBe('moths');
    run(dusk.ambient, 3);
    const { position, aSize } = dusk.ambient.mesh.geometry.attributes;
    let shown = 0;
    for (let i = 0; i < dusk.ambient.capacity; i++) {
      if (aSize.array[i] === 0) continue;
      shown++;
      const p = new THREE.Vector3().fromBufferAttribute(position, i);
      const lamp = dusk.ambient.anchors.find((l) => Math.hypot(p.x - l.x, p.z - l.z) < 0.85);
      expect(lamp, `moth ${i}`).toBeTruthy();
      expect(Math.abs(p.y - lamp.y)).toBeLessThan(0.4);
    }
    expect(shown).toBeGreaterThan(0);
    // No moths in daylight anywhere, and none in the park at dusk either.
    expect(make('park', { dusk: true }).ambient.kind).toBe('leaves');
  });

  it('keeps the day motes over the canal', () => {
    const { ambient, areaData } = make('docks');
    run(ambient, 4);
    const canal = areaData.waters.find((w) => w.kind === 'rect');
    const { position, aSize } = ambient.mesh.geometry.attributes;
    let shown = 0;
    for (let i = 0; i < ambient.capacity; i++) {
      if (aSize.array[i] === 0) continue;
      shown++;
      expect(Math.abs(position.getZ(i))).toBeLessThan(canal.maxZ + 1.5);
    }
    expect(shown).toBeGreaterThan(0);
  });
});

describe('seaside mist', () => {
  it('rises where the surf meets the sand', () => {
    const { ambient } = make('seaside');
    run(ambient, 3);
    const { position, aSize } = ambient.mesh.geometry.attributes;
    let shown = 0;
    for (let i = 0; i < ambient.capacity; i++) {
      if (aSize.array[i] === 0) continue;
      shown++;
      expect(position.getX(i)).toBeGreaterThan(23);
      expect(position.getX(i)).toBeLessThan(29);
      expect(position.getY(i)).toBeLessThan(1.5);
    }
    expect(shown).toBeGreaterThan(0);
  });
});

describe('dispose', () => {
  it('removes the mesh and frees its geometry, material and sprite', () => {
    const { scene, ambient } = make('park');
    const geo = vi.spyOn(ambient.mesh.geometry, 'dispose');
    const mat = vi.spyOn(ambient.mesh.material, 'dispose');
    const tex = vi.spyOn(ambient.mesh.material.map, 'dispose');
    ambient.dispose();
    expect(meshesNamed(scene, 'ambient')).toHaveLength(0);
    expect(geo).toHaveBeenCalled();
    expect(mat).toHaveBeenCalled();
    expect(tex).toHaveBeenCalled();
  });
});

describe('the rest of the pipeline ignores it', () => {
  it('rig.js and mergeprops skip the ambient flag', async () => {
    const { mergeKey } = await import('../src/render/mergeprops.js');
    const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    m.userData.ambient = 'leaves';
    expect(mergeKey(m)).toBeNull();
    const scene = new THREE.Scene();
    const g = new THREE.Group();
    g.add(m);
    scene.add(g);
    m.castShadow = false;
    assignShadowCasters(scene);
    expect(m.castShadow).toBe(false);
  });
});
