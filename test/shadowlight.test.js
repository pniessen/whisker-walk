import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// The same headless canvas stub every world test uses — see the note in
// test/neighborhood.test.js for why a blanket Proxy is not enough.
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

const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const {
  assignShadowCasters, assignShadowCastersFor, trimShadowCasters, createSun, TRIM_REL,
} = await import('../src/render/rig.js');
const { createShadowFit, createNoShadows, SHADOW_INTENSITY } = await import('../src/render/shadowfit.js');
const { buildCat, CAT_LOOK_Y } = await import('../src/cat/model.js');
const { cameraOffset } = await import('../src/catcam.js');
const { LADDER } = await import('../src/render/quality.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildDocks } = await import('../src/world/docks.js');

// The two rungs below LOW (quality.js SHADOW_LIGHT and LITE): what the
// shadow-light rung's caster trim keeps and drops, how much of the shadow
// pass it removes, and the rig the lite rung is built with.

const MIN = LADDER[4].shadowMinPart;
const casters = (root) => {
  let n = 0;
  root.traverse((o) => { if (o.isMesh && o.castShadow) n++; });
  return n;
};
function sceneWith(...things) {
  const scene = new THREE.Scene();
  for (const t of things) scene.add(t);
  scene.updateMatrixWorld(true);
  assignShadowCasters(scene);
  return scene;
}

describe('trimShadowCasters — which parts of a thing are worth a shadow draw', () => {
  it('her cat: 31 shadow draws become 10, and both ears are among them', () => {
    const cat = buildCat('tabby');
    const scene = sceneWith(cat);
    expect(casters(cat)).toBe(31);
    const r = trimShadowCasters(scene, MIN);
    expect(casters(cat)).toBe(10);
    expect(r).toEqual({ trimmed: 21, casters: 10 });
    let head = null;
    cat.traverse((o) => { if (o.userData.earL) head = o; });
    expect(head.userData.earL.castShadow).toBe(true);
    expect(head.userData.earR.castShadow).toBe(true);
  });

  it('a stray (a simple build at 0.85) keeps the same ten', () => {
    const stray = buildCat('tabby', undefined, { simple: true });
    stray.scale.multiplyScalar(0.85);
    const scene = sceneWith(stray);
    expect(casters(stray)).toBe(25);
    trimShadowCasters(scene, MIN);
    expect(casters(stray)).toBe(10);
  });

  it('every part that still casts is big, or an ear', () => {
    const cat = buildCat('siamese');
    const scene = sceneWith(cat);
    trimShadowCasters(scene, MIN);
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    let small = 0;
    cat.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).getSize(size);
      if (Math.max(size.x, size.y, size.z) < MIN) small++;
    });
    expect(small).toBe(2); // the ears
  });

  it('a small animal keeps its legs: the line is a fifth of the animal when that is lower', () => {
    expect(TRIM_REL).toBe(0.2);
    const kitten = buildCat('tabby', undefined, { simple: true });
    // 0.65 is about the smallest cat the sweep lets cast at all (its rule
    // wants a metre of span); its legs are 25-28 cm, under the 30 cm line.
    kitten.scale.multiplyScalar(0.65);
    const scene = sceneWith(kitten);
    expect(casters(kitten)).toBe(25);
    trimShadowCasters(scene, MIN);
    // body, belly, head, four legs, tail, two ears: the same ten as a grown cat.
    expect(casters(kitten)).toBe(10);
  });

  it('a window stops casting however big it is; the wall behind it goes on', () => {
    const house = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.2), new THREE.MeshStandardMaterial());
    wall.position.y = 1.5;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.05), new THREE.MeshStandardMaterial());
    pane.position.set(0, 1.6, 0.12);
    pane.userData.window = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshStandardMaterial());
    knob.position.set(2, 1, 0.14);
    house.add(wall, pane, knob);
    const scene = sceneWith(house);
    expect(casters(house)).toBe(3);
    trimShadowCasters(scene, MIN);
    expect(wall.castShadow).toBe(true);
    expect(pane.castShadow).toBe(false);
    expect(knob.castShadow).toBe(false);
  });

  it('leaves an InstancedMesh alone: its geometry is one instance, not the thing drawn', () => {
    const copse = new THREE.Group();
    const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1), new THREE.MeshStandardMaterial(), 4);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), new THREE.MeshStandardMaterial());
    trunk.position.y = 2;
    copse.add(trunk, leaves);
    const scene = sceneWith(copse);
    trimShadowCasters(scene, MIN);
    expect(leaves.castShadow).toBe(true);
    expect(trunk.castShadow).toBe(true);
  });

  it('only ever turns casting off: what the sweep left dark stays dark, and twice is once', () => {
    const cat = buildCat('tabby');
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7), new THREE.MeshStandardMaterial());
    bollard.position.y = 0.35;
    const scene = sceneWith(cat, bollard);
    expect(bollard.castShadow).toBe(false); // the sweep's own rule
    trimShadowCasters(scene, MIN);
    const once = casters(scene);
    expect(bollard.castShadow).toBe(false);
    expect(trimShadowCasters(scene, MIN)).toEqual({ trimmed: 0, casters: once });
    expect(casters(scene)).toBe(once);
  });

  it('no line, no trim: rungs 0 to 3 pass 0 and nothing changes', () => {
    const cat = buildCat('tabby');
    const scene = sceneWith(cat);
    for (const tier of LADDER.slice(0, 4)) {
      expect(trimShadowCasters(scene, tier.shadowMinPart)).toEqual({ trimmed: 0, casters: 0 });
    }
    expect(casters(cat)).toBe(31);
    expect(trimShadowCasters(null, MIN)).toEqual({ trimmed: 0, casters: 0 });
  });

  it('something that joins later gets the full sweep, as before', () => {
    const scene = sceneWith(buildCat('tabby'));
    trimShadowCasters(scene, MIN);
    const ghost = buildCat('tabby', undefined, { simple: true });
    scene.add(ghost);
    assignShadowCastersFor(ghost);
    expect(casters(ghost)).toBe(25);
  });
});

// What three's shadow pass would draw: the casting meshes inside the sun's
// shadow box (WebGLShadowMap culls each caster against the shadow camera).
function shadowDraws(scene, sun) {
  const cam = sun.shadow.camera;
  cam.position.copy(sun.position);
  cam.lookAt(sun.target.position);
  cam.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  let n = 0;
  scene.traverse((o) => {
    if (o.isMesh && o.castShadow && (!o.frustumCulled || frustum.intersectsObject(o))) n++;
  });
  return n;
}

// A walk as startWalk builds it, as far as the shadow pass can tell: the
// area, merged; her cat at the spawn and six strays around her (what a
// street corner holds); the chase camera; the caster sweep; the tier's rig.
function walkAt(build, tier, yaw = 0) {
  const scene = new THREE.Scene();
  const area = build(scene, { water: { quality: tier, reducedMotion: false } });
  mergeStaticProps(scene);
  const cat = buildCat('tabby');
  cat.position.set(area.spawn.x, 0, area.spawn.z);
  scene.add(cat);
  for (let i = 0; i < 6; i++) {
    const stray = buildCat('tabby', undefined, { simple: true });
    stray.scale.multiplyScalar(0.85);
    const a = (i / 6) * Math.PI * 2;
    stray.position.set(area.spawn.x + Math.cos(a) * (3 + i), 0, area.spawn.z + Math.sin(a) * (3 + i));
    scene.add(stray);
  }
  const camera = new THREE.PerspectiveCamera(70, 4 / 3, 0.1, 300);
  camera.position.copy(cat.position).add(cameraOffset(yaw, 0.18));
  camera.lookAt(cat.position.x, CAT_LOOK_Y, cat.position.z);
  camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  const sun = createSun();
  createShadowFit(sun, camera, { radius: tier.shadowFitRadius, mapSize: tier.shadowMapSize });
  assignShadowCasters(scene);
  if (tier.shadowMinPart > 0) trimShadowCasters(scene, tier.shadowMinPart);
  return shadowDraws(scene, sun);
}

describe('the shadow-light rung removes most of the shadow pass', () => {
  // Counted 2026-11-10, LOW -> shadow-light, facing -z, -x, +z, +x:
  //   neighborhood  253 -> 125   205 -> 88   204 -> 87   247 -> 120
  //   docks         219 -> 102   277 -> 158  296 -> 171  223 -> 106
  // The Docks keeps more because more of its pass is big static shapes
  // (warehouses, cranes, crates), which is the part worth keeping.
  for (const [name, build, keeps] of [['neighborhood', buildNeighborhood, 0.5], ['docks', buildDocks, 0.6]]) {
    it(`${name}: seven cats at the spawn, every way the camera can face`, () => {
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const low = walkAt(build, LADDER[3], yaw);
        const light = walkAt(build, LADDER[4], yaw);
        // The seven cats alone are 31 + 6 x 25 = 181 draws on LOW and 70 here.
        expect(low).toBeGreaterThan(181);
        expect(light).toBeLessThan(low * keeps);
        expect(light).toBeGreaterThanOrEqual(70);
      }
    });
  }
});

describe('the shadow rig can fade out and stop, for the live step to the lite rung', () => {
  const rig = () => {
    const sun = createSun();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 300);
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return { sun, camera, shadows: createShadowFit(sun, camera, { radius: 20, mapSize: 1024 }) };
  };

  it('setStrength scales how dark the shadows are and touches nothing else', () => {
    const { sun, shadows } = rig();
    expect(sun.shadow.intensity).toBe(SHADOW_INTENSITY);
    shadows.setStrength(0.5);
    expect(sun.shadow.intensity).toBeCloseTo(SHADOW_INTENSITY * 0.5, 10);
    shadows.setStrength(7);
    expect(sun.shadow.intensity).toBe(SHADOW_INTENSITY);
    shadows.setStrength(-1);
    expect(sun.shadow.intensity).toBe(0);
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.autoUpdate).toBe(true);
  });

  it('stop ends the pass without taking the light away, and stays stopped', () => {
    const { sun, camera, shadows } = rig();
    shadows.stop();
    expect(sun.shadow.intensity).toBe(0);
    expect(sun.shadow.autoUpdate).toBe(false);
    expect(sun.shadow.needsUpdate).toBe(false);
    // Still a shadow-casting light: taking it away would recompile every
    // material mid-walk (see the note on stop() in shadowfit.js).
    expect(sun.castShadow).toBe(true);
    shadows.setStrength(1);
    expect(sun.shadow.intensity).toBe(0);
    const at = sun.position.clone();
    camera.position.set(30, 3, 30);
    shadows.update(0, 0.016);
    expect(sun.position.equals(at)).toBe(true);
    expect(() => shadows.dispose()).not.toThrow();
  });

  it('the lite rung’s rig casts nothing, moves nothing, and has the same shape', () => {
    const sun = createSun();
    const at = sun.position.clone();
    const shadows = createNoShadows(sun);
    expect(sun.castShadow).toBe(false);
    for (const key of ['update', 'setStrength', 'stop', 'dispose']) expect(typeof shadows[key]).toBe('function');
    expect(shadows.groundY).toBe(0);
    shadows.update(2, 0.016);
    shadows.setStrength(0.3);
    shadows.stop();
    shadows.dispose();
    expect(sun.position.equals(at)).toBe(true);
    expect(sun.castShadow).toBe(false);
  });
});

describe('walk.js builds the walk from the two new knobs', () => {
  const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');

  it('trims the casters right after the sweep, only on a rung that asks', () => {
    const sweep = src.indexOf('assignShadowCasters(scene);');
    const trim = src.indexOf('if (tier.shadowMinPart > 0) trimShadowCasters(scene, tier.shadowMinPart);');
    expect(sweep).toBeGreaterThan(-1);
    expect(trim).toBeGreaterThan(sweep);
    expect(src.slice(sweep, trim)).not.toContain('create');
  });

  it('gives the lite rung the empty shadow rig', () => {
    expect(src).toContain('const shadows = tier.shadows === false ? createNoShadows(sun) : createShadowFit(sun, camera, {');
  });

  it('keeps the contact decals on every rung: no tier reaches createContactShadows', () => {
    expect(src).toContain('const decals = createContactShadows(scene, { ground });');
  });

  it('keeps paw prints on every rung', () => {
    for (const tier of LADDER) expect(tier.pawPrints).toBeGreaterThan(0);
  });
});
