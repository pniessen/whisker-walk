// Split screen S2: the camera-following systems take a second view (docs/split-screen-s2.md).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { createGrass } = await import('../src/render/grass.js');
const { GRASS_HOOKS } = await import('../src/world/neighborhood.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { assignShadowCasters } = await import('../src/render/rig.js');
const { LADDER } = await import('../src/render/quality.js');
const { createClouds } = await import('../src/render/clouds.js');
const { createAmbient } = await import('../src/render/ambient.js');
const { createTreeFade } = await import('../src/treefade.js');
const { findOccluders } = await import('../src/fightcam.js');
const { tree } = await import('../src/world/builder.js');
const { cutTiles, createStreamer } = await import('../src/world/strips.js');
const { createWeather } = await import('../src/weather.js');

function walkScene() {
  const scene = new THREE.Scene();
  const areaData = buildNeighborhood(scene);
  createContactShadows(scene);
  mergeStaticProps(scene);
  assignShadowCasters(scene);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 300);
  return { scene, areaData, camera };
}
const aimAt = (camera, x, z) => { camera.position.set(x, 2.2, z + 4.5); camera.lookAt(x, 0.6, z); camera.updateMatrixWorld(); };

describe('grass: two patches', () => {
  it('lays a patch round each view once, and re-lays neither while both stay in their cell', () => {
    const { scene, areaData, camera } = walkScene();
    const cam2 = camera.clone();
    aimAt(camera, 0, 30); aimAt(cam2, 30, -20);
    const grass = createGrass(scene, { areaId: 'neighborhood', areaData, tier: LADDER[0], camera, hooks: GRASS_HOOKS });
    grass.update(1, 1);
    const m0 = grass.mesh.instanceMatrix;
    const n0 = grass.mesh.count;
    const centreOf = (m, n) => { let x = 0; let z = 0; for (let i = 0; i < n; i++) { x += m.array[i * 16 + 12]; z += m.array[i * 16 + 14]; } return [x / n, z / n]; };
    grass.view(1, cam2);
    const m1 = grass.mesh.instanceMatrix;
    expect(m1).not.toBe(m0); // its own buffers
    const [x1, z1] = centreOf(m1, grass.mesh.count);
    expect(Math.hypot(x1 - 30, z1 + 20 - 4.5 * 0)).toBeLessThan(25); // laid round view two, not view one
    const v1 = m1.version;
    grass.view(0, camera);
    expect(grass.mesh.instanceMatrix).toBe(m0);
    expect(grass.mesh.count).toBe(n0);
    const v0 = m0.version;
    for (let k = 0; k < 3; k++) { grass.view(1, cam2); grass.view(0, camera); } // a frame each way: no re-lay
    expect(m1.version).toBe(v1);
    expect(m0.version).toBe(v0);
    // update() always puts patch one back
    grass.view(1, cam2); grass.update(2, 1);
    expect(grass.mesh.instanceMatrix).toBe(m0);
    grass.dispose();
  });
});

describe('clouds: the sky slides onto the view', () => {
  it('view(cam) offsets the mesh by the camera difference and update() puts it back', () => {
    const { scene, areaData, camera } = walkScene();
    camera.position.set(0, 2, 0);
    const cam2 = camera.clone(); cam2.position.set(50, 2, -30);
    const clouds = createClouds(scene, { areaId: 'neighborhood', tier: LADDER[0], camera, centre: { x: 0, z: 0 } });
    expect(clouds.mesh).toBeTruthy();
    clouds.view(cam2);
    expect(clouds.mesh.position.toArray()).toEqual([50, 0, -30]);
    clouds.update(1);
    expect(clouds.mesh.position.toArray()).toEqual([0, 0, 0]);
    void areaData;
  });
});

describe('tree fade: either cat', () => {
  it('fades a tree that is in the way of cat two only, and brings it back when that lapses', () => {
    const scene = new THREE.Scene();
    const t = tree(0, 0); scene.add(t);
    const occ = findOccluders(scene);
    const fade = createTreeFade(occ);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    camera.position.set(40, 2, 40); // cat one, nowhere near the tree
    const look1 = { x: 40, y: 0.35, z: 43 };
    const cam2 = camera.clone(); cam2.position.set(0, 2, -3); // cat two's camera behind the tree
    const look2 = { x: 0, y: 0.35, z: 3 };
    fade.update(1, camera, look1);
    expect(fade.faded().has(t)).toBe(false);
    fade.setSecond(cam2, look2);
    fade.update(1, camera, look1);
    expect(fade.faded().has(t)).toBe(true);
    for (let i = 0; i < 6; i++) fade.update(1, camera, look1); // the second view lapses after 3 updates
    expect(fade.faded().has(t)).toBe(false);
  });
});

describe('strip streaming: both cats', () => {
  it('builds tiles near cat two and keeps them while only the second focus is near', () => {
    const tiles = cutTiles({ minX: -90, maxX: -50, minZ: -50, maxZ: 50 });
    const built = new Set();
    const s = createStreamer({
      tiles,
      layers: [{ id: 'small', show: 45, hide: 58 }],
      begin: (tile) => ({ cost: () => 1, step: () => { built.add(tile.index); return true; }, cancel() {} }),
      drop: (tile) => built.delete(tile.index),
    });
    const nearest = (x, z) => tiles.reduce((a, b) => (Math.hypot(Math.max(0, a.minX - x, x - a.maxX), Math.max(0, a.minZ - z, z - a.maxZ)) <= Math.hypot(Math.max(0, b.minX - x, x - b.maxX), Math.max(0, b.minZ - z, z - b.maxZ)) ? a : b));
    s.setSecond(-70, 45); // cat two at the far south of the strip
    s.update(0, -400, 1); // cat one is far away
    const south = nearest(-70, 45).index;
    expect(built.has(south)).toBe(true);
    const north = nearest(-70, -45).index;
    expect(built.has(north)).toBe(false);
    // second focus lapses: the tiles near cat two go (cat one is still far away)
    for (let i = 0; i < 4; i++) s.update(0, -400, 1);
    expect(built.size).toBe(0);
  });
});

describe('ambient: half the particles per view', () => {
  it('gathers particles round both foci while split, all round one when not', () => {
    const scene = new THREE.Scene();
    const areaData = buildPark(scene);
    createContactShadows(scene); mergeStaticProps(scene); assignShadowCasters(scene);
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 300);
    const cam2 = camera.clone();
    aimAt(camera, -14, 24); aimAt(cam2, 30, -20);
    const ambient = createAmbient(scene, { areaId: 'park', areaData, tier: LADDER[0], camera, seed: 3 });
    expect(ambient.mesh).toBeTruthy();
    const pos = ambient.mesh.geometry.attributes.position.array;
    const near = (cx, cz) => { let n = 0; for (let i = 0; i < pos.length; i += 3) if (Math.hypot(pos[i] - cx, pos[i + 2] - cz) < 22 && pos[i + 1] > -5) n++; return n; };
    for (let t = 0; t < 60; t += 0.1) ambient.update(t, 1);
    const alone = near(30, -20);
    for (let t = 60; t < 120; t += 0.1) { ambient.setSecond(cam2, { x: 30, y: 0, z: -20 }); ambient.update(t, 1); }
    expect(near(30, -20)).toBeGreaterThan(alone);
  });
});

describe('weather: rain follows the view', () => {
  it('view(cam) poses the column round that camera', () => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(); const fill = new THREE.HemisphereLight();
    scene.fog = new THREE.Fog(0x888888, 40, 130); scene.background = new THREE.Color(0x888888);
    const w = createWeather(scene, sun, 'rain', () => 0.5, false, { y: () => 0, flat: true }, { tier: LADDER[0], fill });
    const rain = scene.children.find((c) => c.name === 'rain-drops');
    expect(rain).toBeTruthy();
    const c = new THREE.PerspectiveCamera(); c.position.set(12, 2, -8); c.updateMatrixWorld();
    w.update(0.1, c.position, c);
    const c2 = new THREE.PerspectiveCamera(); c2.position.set(-30, 2, 20); c2.updateMatrixWorld();
    w.view(c2);
    expect(rain.position.x).toBe(-30);
    expect(rain.position.z).toBe(20);
    w.view(c);
    expect(rain.position.x).toBe(12);
  });
});
