import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// render/contactshadows.js paints its gradient onto a canvas at first use, the
// same way render/textures.js and render/sky.js do, so this file needs the
// headless canvas stub the world tests use (see test/den.test.js for the long
// version of why the Proxy has to answer createRadialGradient with something
// that has addColorStop). Installed before the module is imported, because the
// texture is memoised and the first call is the one that matters.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'createRadialGradient' || key === 'createLinearGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const {
  MIN_HEIGHT, MAX_BASE_Y, MIN_SPAN, MAX_SPAN, MIN_HALF,
  FOOTPRINT_SHRINK, FOOTPRINT_SPREAD,
  qualifies, footprintFor, halfExtent, scanFootprints,
  contactShadowTexture, createContactShadows,
} = await import('../src/render/contactshadows.js');

// A world-space box from a centre, a footprint and a height, which is how
// every case below is easier to read than four raw corner vectors.
const boxAt = (x, z, spanX, spanZ, baseY, height) => new THREE.Box3(
  new THREE.Vector3(x - spanX / 2, baseY, z - spanZ / 2),
  new THREE.Vector3(x + spanX / 2, baseY + height, z + spanZ / 2),
);

// The real measurements out of the shipped areas, taken by walking each area's
// built scene graph. Named so a failure says WHICH prop changed its mind, not
// just that a number moved.
const REAL_PROPS = {
  // qualify
  tree:            { box: boxAt(6, 40, 4.0, 4.0, 0, 4.1), want: true },
  bush:            { box: boxAt(0, 0, 1.66, 1.71, -0.08, 1.15), want: true },
  bench:           { box: boxAt(0, 0, 1.51, 1.51, 0, 1.10), want: true },
  lampPost:        { box: boxAt(0, 0, 0.44, 0.44, 0, 3.52), want: true },
  bollard:         { box: boxAt(0, 0, 0.57, 0.60, 0, 0.75), want: true },
  mailbox:         { box: boxAt(0, 0, 0.30, 0.50, 0, 1.23), want: true },
  shippingCrate:   { box: boxAt(0, 0, 2.51, 1.98, 0, 1.36), want: true },
  marketStall:     { box: boxAt(0, 0, 6.05, 2.56, 0, 2.65), want: true },
  flowerPatch:     { box: boxAt(0, 0, 1.03, 1.13, -0.01, 0.33), want: true },
  denCatToys:      { box: boxAt(0, 0, 0.90, 0.60, 0, 0.12), want: true },

  // already flat on the ground — a decal under a decal
  groundPlane:     { box: boxAt(0, 0, 120, 120, 0, 0), want: false },
  path:            { box: boxAt(0, 0, 5, 100, 0.01, 0), want: false },
  sidewalk:        { box: boxAt(0, 0, 1.2, 100, 0.01, 0), want: false },
  puddle:          { box: boxAt(0, 0, 1.8, 1.8, 0.02, 0), want: false },
  waterPond:       { box: boxAt(0, 0, 14, 14, 0.02, 0), want: false },
  leafLitter:      { box: boxAt(0, 0, 1.54, 1.40, 0.01, 0), want: false },
  denRug:          { box: boxAt(0, 0, 3.70, 2.30, 0.01, 0.03), want: false },
  denFloorSeams:   { box: boxAt(0, 0, 17.45, 18, 0, 0.01), want: false },

  // not on the ground — the decal would land metres below the object
  roofTank:        { box: boxAt(0, 0, 1.70, 1.78, 5.00, 1.24), want: false },
  crateOnPier:     { box: boxAt(0, 0, 0.90, 0.90, 1.15, 1.25), want: false },
  denPicture:      { box: boxAt(0, 0, 0.60, 0.13, 1.38, 1.50), want: false },
  denWallClock:    { box: boxAt(0, 0, 0.08, 0.54, 1.93, 0.54), want: false },
  denWallShelf:    { box: boxAt(0, 0, 4.80, 1.15, 0.90, 0.10), want: false },
  denShelfBooks:   { box: boxAt(0, 0, 0.34, 0.35, 1.00, 0.51), want: false },

  // building-scale — the shadow map already handles these, and a blob this
  // big would be a dark halo across the pavement
  house:           { box: boxAt(0, 0, 11.03, 11.03, 0, 5.0), want: false },
  warehouse:       { box: boxAt(0, 0, 12.12, 9.21, 0, 4.5), want: false },
  fenceRun:        { box: boxAt(0, 0, 8.10, 0.10, 0, 1.0), want: false },
  pier:            { box: boxAt(0, 0, 5.00, 13.10, 0.07, 0.76), want: false },
  barge:           { box: boxAt(0, 0, 9.10, 3.30, -0.05, 2.80), want: false },
  seasideCliff:    { box: boxAt(0, 0, 60, 18, 0, 8.0), want: false },
};

describe('qualifies — the rule, against every prop the game actually ships', () => {
  for (const [name, { box, want }] of Object.entries(REAL_PROPS)) {
    it(`${want ? 'gives' : 'refuses'} ${name} a decal`, () => {
      expect(qualifies(box)).toBe(want);
    });
  }

  it('refuses an empty box (a light, a group with no geometry)', () => {
    expect(qualifies(new THREE.Box3())).toBe(false);
    expect(qualifies(null)).toBe(false);
  });

  it('refuses a sub-pixel footprint', () => {
    expect(qualifies(boxAt(0, 0, MIN_SPAN - 0.01, MIN_SPAN - 0.01, 0, 1))).toBe(false);
    expect(qualifies(boxAt(0, 0, MIN_SPAN + 0.01, MIN_SPAN - 0.01, 0, 1))).toBe(true);
  });

  it('is a MAX of the two spans, not a diagonal or an area', () => {
    // A long thin run is excluded on its long axis alone. This is the
    // difference between "no decal under an 8m fence" and "one absurd needle".
    expect(qualifies(boxAt(0, 0, MAX_SPAN + 0.1, 0.1, 0, 1))).toBe(false);
    expect(qualifies(boxAt(0, 0, 0.1 + MIN_SPAN, MAX_SPAN - 0.1, 0, 1))).toBe(true);
  });

  it('draws its ground line at MAX_BASE_Y, inclusive', () => {
    expect(qualifies(boxAt(0, 0, 1, 1, MAX_BASE_Y, 1))).toBe(true);
    expect(qualifies(boxAt(0, 0, 1, 1, MAX_BASE_Y + 0.01, 1))).toBe(false);
  });

  it('draws its flatness line at MIN_HEIGHT, inclusive', () => {
    expect(qualifies(boxAt(0, 0, 1, 1, 0, MIN_HEIGHT))).toBe(true);
    expect(qualifies(boxAt(0, 0, 1, 1, 0, MIN_HEIGHT - 0.01))).toBe(false);
  });

  it('accepts a prop sunk slightly into the ground', () => {
    // Rocks bottom out at -0.28 by authorship; nothing about a negative base
    // should read as "off the ground".
    expect(qualifies(boxAt(0, 0, 0.93, 0.93, -0.28, 1.36))).toBe(true);
  });
});

describe('footprint sizing', () => {
  it('is shrink * bbox + spread, so a decal always spills past its prop', () => {
    // Big enough that the small-prop spread clamp cannot be in play.
    expect(halfExtent(2)).toBeCloseTo(2 * FOOTPRINT_SHRINK + FOOTPRINT_SPREAD, 6);
  });

  it('never lets the spill exceed the prop itself', () => {
    // A 10cm half-width prop gets at most 9cm of spill, not 28 — otherwise a
    // den cat toy ends up under a dinner-plate smudge.
    expect(halfExtent(0.1)).toBeLessThan(0.1 * FOOTPRINT_SHRINK + FOOTPRINT_SPREAD);
    expect(halfExtent(0.1)).toBeGreaterThanOrEqual(MIN_HALF);
  });

  it('floors at MIN_HALF', () => {
    expect(halfExtent(0)).toBe(MIN_HALF);
  });

  it('is monotonic in the bounding box', () => {
    let last = -Infinity;
    for (let h = 0; h <= 3; h += 0.05) {
      const v = halfExtent(h);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('centres the decal on the box and keeps the two axes independent', () => {
    const f = footprintFor(boxAt(4, -9, 2, 0.5, 0, 1));
    expect(f.x).toBeCloseTo(4, 6);
    expect(f.z).toBeCloseTo(-9, 6);
    expect(f.halfX).toBeGreaterThan(f.halfZ);
  });

  it('stays inside 8% of the un-jittered size', () => {
    for (const x of [0, 3.5, -12.25, 41]) {
      const base = halfExtent(1);
      const f = footprintFor(boxAt(x, x * 0.7, 2, 2, 0, 1));
      expect(f.halfX).toBeGreaterThan(base * 0.919);
      expect(f.halfX).toBeLessThan(base * 1.081);
    }
  });

  // The determinism contract. wind.js's windPhase and builder.js's hash01 have
  // the same one and for the same reason: two co-walkers on the same room seed
  // build the same world and must agree about it without drawing from the
  // shared, order-sensitive walkRng stream.
  it('is a pure function of position — same box, same answer, every time', () => {
    const a = footprintFor(boxAt(7.25, -3.5, 2, 2, 0, 1));
    const b = footprintFor(boxAt(7.25, -3.5, 2, 2, 0, 1));
    expect(b).toEqual(a);
  });

  it('gives two props at different positions different sizes', () => {
    const a = footprintFor(boxAt(7.25, -3.5, 2, 2, 0, 1));
    const b = footprintFor(boxAt(7.35, -3.5, 2, 2, 0, 1));
    expect(b.halfX).not.toBeCloseTo(a.halfX, 4);
  });
});

describe('the gradient texture', () => {
  it('is painted once and memoised for the app lifetime', () => {
    expect(contactShadowTexture()).toBe(contactShadowTexture());
  });

  it('is tagged so endWalk cannot dispose it with the per-walk maps', () => {
    expect(contactShadowTexture().name.startsWith('surface:')).toBe(true);
  });

  it('is data, not colour — no sRGB decode on an alpha ramp', () => {
    expect(contactShadowTexture().colorSpace).toBe(THREE.NoColorSpace);
  });
});

// A scene shaped like a built area: a ground plane, a path, one prop on the
// ground, one prop on a rooftop, one building, and a light.
function fakeArea() {
  const scene = new THREE.Scene();
  const flat = (w, d, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  };
  const boxProp = (x, z, w, h, d, y = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
    m.position.set(x, y + h / 2, z);
    return m;
  };
  scene.add(flat(120, 120, 0));            // ground
  scene.add(flat(5, 100, 0.01));           // path
  scene.add(boxProp(3, -4, 1, 1.2, 1));    // a crate, on the ground
  scene.add(boxProp(-6, 2, 1, 1, 1, 4));   // a crate on a rooftop
  scene.add(boxProp(10, 10, 9, 4, 9));     // a building
  scene.add(new THREE.DirectionalLight());
  return scene;
}

describe('scanFootprints', () => {
  it('picks the ground-standing prop and nothing else', () => {
    const found = scanFootprints(fakeArea());
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(3, 6);
    expect(found[0].z).toBeCloseTo(-4, 6);
  });

  it('reads WORLD boxes, so a group transform is respected', () => {
    const scene = new THREE.Scene();
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    m.position.y = 0.5;
    g.add(m);
    g.position.set(12, 0, -7);
    scene.add(g);
    const [f] = scanFootprints(scene);
    expect(f.x).toBeCloseTo(12, 6);
    expect(f.z).toBeCloseTo(-7, 6);
  });

  it('does not recurse — a group of walls is one decal, not five', () => {
    const scene = new THREE.Scene();
    const house = new THREE.Group();
    for (const dx of [-1, 0, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 0.5));
      wall.position.set(dx, 1, 0);
      house.add(wall);
    }
    scene.add(house);
    expect(scanFootprints(scene)).toHaveLength(1);
  });
});

describe('createContactShadows', () => {
  it('adds exactly two meshes — one static, one mover', () => {
    const scene = fakeArea();
    const before = scene.children.length;
    const rig = createContactShadows(scene);
    expect(scene.children.length - before).toBe(2);
    expect(rig.staticMesh.isInstancedMesh).toBe(true);
    expect(rig.moverMesh.isInstancedMesh).toBe(true);
    expect(rig.staticCount).toBe(1);
    rig.dispose();
  });

  it('opts out of walk.js\'s cast/receive traversal, and is never culled', () => {
    const rig = createContactShadows(fakeArea());
    for (const mesh of [rig.staticMesh, rig.moverMesh]) {
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.userData.contactDecal).toBe(true);
      expect(mesh.frustumCulled).toBe(false);
      expect(mesh.renderOrder).toBeLessThan(0);
    }
    rig.dispose();
  });

  it('layers the decals above the ground and its paths but under the water', () => {
    const rig = createContactShadows(fakeArea());
    const m = new THREE.Matrix4();
    rig.staticMesh.getMatrixAt(0, m);
    const y = m.elements[13];
    expect(y).toBeGreaterThan(0.01);   // clears the ground plane and the paths
    expect(y).toBeLessThan(0.02);      // stays under puddles (0.02) and water
    rig.dispose();
  });

  it('does not write depth, and biases itself toward the camera', () => {
    const rig = createContactShadows(fakeArea());
    const mat = rig.staticMesh.material;
    expect(mat.depthWrite).toBe(false);
    expect(mat.depthTest).toBe(true);           // a wall must still occlude it
    expect(mat.polygonOffset).toBe(true);
    expect(mat.polygonOffsetFactor).toBeLessThan(0);
    rig.dispose();
  });

  it('shares one memoised texture across walks rather than one per walk', () => {
    const a = createContactShadows(fakeArea());
    const b = createContactShadows(fakeArea());
    expect(a.staticMesh.material.alphaMap).toBe(b.staticMesh.material.alphaMap);
    a.dispose();
    b.dispose();
  });

  it('survives an area with nothing that qualifies', () => {
    const scene = new THREE.Scene();
    const rig = createContactShadows(scene);
    expect(rig.staticMesh).toBe(null);
    expect(rig.staticCount).toBe(0);
    expect(() => rig.update()).not.toThrow();
    expect(() => rig.dispose()).not.toThrow();
  });
});

describe('movers', () => {
  const walker = (scene, x = 0, z = 0) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1));
    m.position.y = 0.25;
    g.add(m);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  };
  const instance = (mesh, i) => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(i, m);
    return { x: m.elements[12], y: m.elements[13], z: m.elements[14], sx: m.elements[0], sz: m.elements[10] };
  };

  it('starts every instance collapsed, so an unregistered slot draws nothing', () => {
    const rig = createContactShadows(fakeArea());
    expect(instance(rig.moverMesh, 0).sx).toBe(0);
    rig.dispose();
  });

  it('tracks the object it follows', () => {
    const scene = fakeArea();
    const rig = createContactShadows(scene);
    const cat = walker(scene, 2, 5);
    rig.follow(cat);
    rig.update();
    expect(instance(rig.moverMesh, 0).x).toBeCloseTo(2, 6);
    expect(instance(rig.moverMesh, 0).z).toBeCloseTo(5, 6);
    cat.position.set(-8, 0, 1);
    rig.update();
    expect(instance(rig.moverMesh, 0).x).toBeCloseTo(-8, 6);
    expect(instance(rig.moverMesh, 0).z).toBeCloseTo(1, 6);
    rig.dispose();
  });

  it('keeps the decal on the ground however high its object goes', () => {
    const scene = fakeArea();
    const rig = createContactShadows(scene);
    const cat = walker(scene);
    rig.follow(cat);
    cat.position.y = 0.4;
    rig.update();
    expect(instance(rig.moverMesh, 0).y).toBeLessThan(0.02);
    rig.dispose();
  });

  it('shrinks the decal as its object leaves the ground, and clears it by 0.9m', () => {
    const scene = fakeArea();
    const rig = createContactShadows(scene);
    const cat = walker(scene);
    rig.follow(cat);
    rig.update();
    const grounded = instance(rig.moverMesh, 0).sx;
    expect(grounded).toBeGreaterThan(0);

    cat.position.y = 0.4;             // mid-pounce
    rig.update();
    const midair = instance(rig.moverMesh, 0).sx;
    expect(midair).toBeGreaterThan(0);
    expect(midair).toBeLessThan(grounded);

    cat.position.y = 1.0;             // perched on a wall, or a butterfly
    rig.update();
    expect(instance(rig.moverMesh, 0).sx).toBe(0);
    rig.dispose();
  });

  it('collapses the decal of an object that left the scene or was hidden', () => {
    const scene = fakeArea();
    const rig = createContactShadows(scene);
    const critter = walker(scene, 4, 4);
    rig.follow(critter);
    rig.update();
    expect(instance(rig.moverMesh, 0).sx).toBeGreaterThan(0);

    critter.visible = false;
    rig.update();
    expect(instance(rig.moverMesh, 0).sx).toBe(0);

    critter.visible = true;
    critter.removeFromParent();
    rig.update();
    expect(instance(rig.moverMesh, 0).sx).toBe(0);
    rig.dispose();
  });

  it('ignores registrations past capacity rather than throwing mid-spawn', () => {
    const scene = fakeArea();
    const rig = createContactShadows(scene, { moverCapacity: 2 });
    rig.follow(walker(scene));
    rig.follow(walker(scene));
    expect(() => rig.follow(walker(scene))).not.toThrow();
    expect(rig.moverCount).toBe(2);
    rig.dispose();
  });

  it('ignores a null object', () => {
    const rig = createContactShadows(fakeArea());
    rig.follow(null);
    expect(rig.moverCount).toBe(0);
    rig.dispose();
  });
});

describe('dispose', () => {
  it('removes both meshes from the scene and frees their GPU resources', () => {
    const scene = fakeArea();
    const before = scene.children.length;
    const rig = createContactShadows(scene);
    const meshes = [rig.staticMesh, rig.moverMesh];
    const spies = meshes.flatMap((m) => [
      vi.spyOn(m.geometry, 'dispose'),
      vi.spyOn(m.material, 'dispose'),
      vi.spyOn(m, 'dispose'),
    ]);
    rig.dispose();
    expect(scene.children.length).toBe(before);
    for (const mesh of meshes) expect(mesh.parent).toBe(null);
    for (const spy of spies) expect(spy).toHaveBeenCalled();
  });

  it('keeps the shared gradient texture — it outlives every walk', () => {
    const rig = createContactShadows(fakeArea());
    const tex = rig.staticMesh.material.alphaMap;
    const spy = vi.spyOn(tex, 'dispose');
    rig.dispose();
    expect(spy).not.toHaveBeenCalled();
    expect(contactShadowTexture()).toBe(tex);
    spy.mockRestore();
  });

  it('drops the follower registry, so a disposed rig cannot update', () => {
    const scene = fakeArea();
    const rig = createContactShadows(scene);
    const cat = new THREE.Group();
    scene.add(cat);
    rig.follow(cat);
    rig.dispose();
    expect(rig.moverCount).toBe(0);
    expect(() => rig.update()).not.toThrow();
  });
});

// The rig is only correct if the three call sites outside it stay wired. These
// are source assertions in the same spirit as test/shadowfit.test.js's — they
// pin the contract, not the implementation.
describe('wiring', () => {
  const walkSrc = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

  it('walk.js excludes the decals from the cast/receive traversal', () => {
    expect(walkSrc).toMatch(/obj\.isMesh\s*&&\s*!obj\.userData\.contactDecal/);
  });

  it('walk.js builds the rig before the cat is added to the scene', () => {
    const built = walkSrc.indexOf('createContactShadows(scene)');
    const catAdded = walkSrc.indexOf('scene.add(cat)');
    expect(built).toBeGreaterThan(-1);
    expect(catAdded).toBeGreaterThan(built);
  });

  it('walk.js hangs it on the session and disposes it in endWalk', () => {
    expect(walkSrc).toMatch(/^\s*decals,\s*$/m);
    expect(walkSrc).toContain('session.decals.dispose()');
  });

  it('main.js updates it once per frame', () => {
    expect(mainSrc).toContain('session.decals.update()');
  });
});
