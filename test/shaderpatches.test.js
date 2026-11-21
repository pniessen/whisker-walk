import { describe, it, expect, vi, afterAll } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// A guard over every shader patch the game makes. The game rewrites three.js
// shaders with `material.onBeforeCompile = (shader) => { shader.x = shader.x
// .replace('#include <chunk>', ...) }`. If a three.js upgrade renames or drops a
// chunk, `String#replace` finds nothing and the patch silently does nothing:
// no error, just a look that quietly disappears. This test fails instead.
//
// It works from behaviour. Every assignment to `onBeforeCompile` anywhere in
// the game is captured, the game's own builders and per-walk systems are run
// so the patches get assigned, and each captured patch is then run against the
// real three.js shader source for its material type while `String#replace`
// and `replaceAll` are watched for a shader-sized string coming back unchanged.
//
// Some patches cut a line out of one of three.js's own chunks first, at import
// or at build time (`THREE.ShaderChunk.x.replace(...)`), and inline the result
// over the `#include`. Inlining any chunk changes the shader, so the per-patch
// check cannot see that cut matching nothing. So the same watch runs over the
// whole exercise below, imports included, for a replace on a chunk's own text,
// and the chunks themselves must come out of it as three.js shipped them.

vi.stubGlobal('document', canvasStub);

// Raise these when a patch or a chunk edit is added. A drop means one is no
// longer exercised here (or was removed), which is worth a look either way.
const PATCH_SITE_FLOOR = 24;
const CHUNK_EDIT_FLOOR = 2;

const original = Object.getOwnPropertyDescriptor(THREE.Material.prototype, 'onBeforeCompile');
const noop = original.value;
const captured = []; // { material, fn, site }
const seenFns = new Set();

// The first stack frame that is neither this file nor three.js (or any other
// package): file and line of the assignment or the call.
function siteOfAssignment() {
  const lines = new Error().stack.split('\n').slice(1);
  for (const line of lines) {
    if (line.includes('node_modules') || line.includes('shaderpatches.test')) continue;
    const m = /(?:\(|\s)((?:file:\/\/)?[^()\s]+?):(\d+):\d+\)?\s*$/.exec(line);
    if (m) return `${m[1].replace(/^file:\/\//, '').replace(/^.*\/(src\/)/, '$1')}:${m[2]}`;
  }
  return 'unknown';
}

const previousStackLimit = Error.stackTraceLimit;
Error.stackTraceLimit = 40;
Object.defineProperty(THREE.Material.prototype, 'onBeforeCompile', {
  configurable: true,
  get() { return this._guardPatch ?? noop; },
  set(fn) {
    this._guardPatch = fn;
    // Copying an already-captured function onto a clone, or putting three's
    // own no-op back, adds no new patch.
    if (typeof fn !== 'function' || fn === noop || seenFns.has(fn)) return;
    seenFns.add(fn);
    captured.push({ material: this, fn, site: siteOfAssignment() });
  },
});

// What three.js passes to onBeforeCompile for each material type.
const LIB_OF = {
  MeshStandardMaterial: 'standard',
  MeshPhysicalMaterial: 'physical',
  MeshLambertMaterial: 'lambert',
  MeshBasicMaterial: 'basic',
  MeshPhongMaterial: 'phong',
  MeshToonMaterial: 'toon',
  MeshMatcapMaterial: 'matcap',
  PointsMaterial: 'points',
  SpriteMaterial: 'sprite',
  ShadowMaterial: 'shadow',
  MeshDepthMaterial: 'depth',
  MeshDistanceMaterial: 'distance',
  LineBasicMaterial: 'basic',
};

function shaderFor(material, site) {
  const key = LIB_OF[material.type];
  if (!key) throw new Error(`${site}: no ShaderLib entry for material type ${material.type}`);
  const lib = THREE.ShaderLib[key];
  return {
    uniforms: THREE.UniformsUtils.clone(lib.uniforms),
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
    defines: {},
  };
}

// Runs a patch while String#replace / replaceAll are watched. Returns the
// shader-sized replaces that changed nothing, and whether a stage changed.
function runPatch(material, fn, site) {
  const shader = shaderFor(material, site);
  const before = { vertex: shader.vertexShader, fragment: shader.fragmentShader };
  const noops = [];
  const realReplace = String.prototype.replace;
  const realReplaceAll = String.prototype.replaceAll;
  const watch = (real, name) => function watched(search, replacement) {
    const input = String(this);
    const out = real.call(this, search, replacement);
    if (input.includes('void main') && out === input) noops.push(`${name}(${String(search).slice(0, 80)})`);
    return out;
  };
  String.prototype.replace = watch(realReplace, 'replace');
  String.prototype.replaceAll = watch(realReplaceAll, 'replaceAll');
  try {
    fn.call(material, shader, FAKE_RENDERER);
  } finally {
    String.prototype.replace = realReplace;
    String.prototype.replaceAll = realReplaceAll;
  }
  const changed = shader.vertexShader !== before.vertex || shader.fragmentShader !== before.fragment;
  return { noops, changed };
}

// Every replace / replaceAll whose receiver is one of three.js's chunks, while
// watched: where it was made, what it searched for, whether it changed the text.
const CHUNK_TEXTS = new Set(Object.values(THREE.ShaderChunk));
function watchChunkEdits(sink) {
  const realReplace = String.prototype.replace;
  const realReplaceAll = String.prototype.replaceAll;
  const watch = (real, name) => function watched(search, replacement) {
    const out = real.call(this, search, replacement);
    const input = String(this);
    if (CHUNK_TEXTS.has(input)) {
      sink.push({ site: siteOfAssignment(), call: `${name}(${String(search).slice(0, 80)})`, changed: out !== input });
    }
    return out;
  };
  String.prototype.replace = watch(realReplace, 'replace');
  String.prototype.replaceAll = watch(realReplaceAll, 'replaceAll');
  return () => {
    String.prototype.replace = realReplace;
    String.prototype.replaceAll = realReplaceAll;
  };
}

// Three.js's chunks and library shaders as shipped, to check nothing wrote over them.
const shippedShaders = () => ({
  chunks: { ...THREE.ShaderChunk },
  lib: Object.fromEntries(Object.entries(THREE.ShaderLib).map(([k, v]) => [k, [v.vertexShader, v.fragmentShader]])),
});
const SHIPPED = shippedShaders();

const FAKE_RENDERER = {
  capabilities: { isWebGL2: true },
  extensions: { has: () => true, get: () => null },
};

// Patches whose function the game made once per material share a site; check
// one per site and material type.
function sitesOf(list) {
  const bySite = new Map();
  for (const c of list) {
    if (!bySite.has(c.site)) bySite.set(c.site, new Map());
    const perType = bySite.get(c.site);
    if (!perType.has(c.material.type)) perType.set(c.material.type, c);
  }
  return bySite;
}

describe('the capture and the no-op detector', () => {
  it('reports a patch that replaces a chunk that does not exist', () => {
    const m = new THREE.MeshStandardMaterial();
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <no_such_chunk>', '// never lands');
    };
    const entry = captured[captured.length - 1];
    expect(entry.material).toBe(m);
    expect(entry.site).toMatch(/^unknown$|:\d+$/);
    const { noops, changed } = runPatch(m, m.onBeforeCompile, entry.site);
    expect(noops).toEqual(['replace(#include <no_such_chunk>)']);
    expect(changed).toBe(false);
    captured.pop();
  });

  it('passes a patch that replaces a chunk three.js has', () => {
    const m = new THREE.MeshStandardMaterial();
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n// ok');
    };
    const { noops, changed } = runPatch(m, m.onBeforeCompile, 'test');
    expect(noops).toEqual([]);
    expect(changed).toBe(true);
    captured.pop();
  });

  it('leaves an unpatched material on three.js\'s own no-op', () => {
    expect(new THREE.MeshStandardMaterial().onBeforeCompile).toBe(noop);
  });

  it('reports a chunk edit made at import that cuts text the chunk does not have', async () => {
    const sink = [];
    const stop = watchChunkEdits(sink);
    try {
      await import('./helpers/chunknoop.js');
    } finally {
      stop();
    }
    expect(sink).toEqual([{
      site: expect.stringMatching(/chunknoop\.js:\d+$/),
      call: 'replace(no such line in the chunk;)',
      changed: false,
    }]);
  });

  it('passes a chunk edit that cuts a line the chunk has', () => {
    const sink = [];
    const stop = watchChunkEdits(sink);
    try {
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
    } finally {
      stop();
    }
    expect(sink).toEqual([expect.objectContaining({ call: 'replace(normal *= faceDirection;)', changed: true })]);
  });
});

// ---- exercise every patch site the game has --------------------------------

const BUILDS = {};
let sitesFromGame;
const chunkEdits = [];

// Top-level await: the sites must be known when the per-site tests are listed.
// The chunk watch is on from before the first game module is imported, since
// a module may cut its chunk at import (world/dressing.js does).
const stopChunkWatch = watchChunkEdits(chunkEdits);
try { await (async () => {
  const mods = {
    neighborhood: await import('../src/world/neighborhood.js'),
    park: await import('../src/world/park.js'),
    seaside: await import('../src/world/seaside.js'),
    docks: await import('../src/world/docks.js'),
    woods: await import('../src/world/woods.js'),
    river: await import('../src/world/river.js'),
    moor: await import('../src/world/moor.js'),
    pines: await import('../src/world/pines.js'),
    gorge: await import('../src/world/gorge.js'),
    den: await import('../src/world/den.js'),
    farm: await import('../src/world/farm.js'),
    fair: await import('../src/world/fair.js'),
  };
  for (const [id, mod] of Object.entries(mods)) BUILDS[id] = mod.build;
  const { LADDER } = await import('../src/render/quality.js');
  const tier = LADDER[0];
  const { mergeStaticProps } = await import('../src/render/mergeprops.js');
  const { assignShadowCasters } = await import('../src/render/rig.js');
  const { createContactShadows } = await import('../src/render/contactshadows.js');
  const { createGrass } = await import('../src/render/grass.js');
  const { createPawPrints } = await import('../src/render/pawprints.js');
  const { createSplash } = await import('../src/render/splash.js');
  const { createClouds } = await import('../src/render/clouds.js');
  const { createAmbient } = await import('../src/render/ambient.js');
  const { createWaterDressing } = await import('../src/render/waterdress.js');
  const { tintDuskLawn, duskLook, createLampPools } = await import('../src/render/dusk.js');
  const { createRustle } = await import('../src/render/rustle.js');
  const { createWeather } = await import('../src/weather.js');
  const { createRace, raceCourse } = await import('../src/race.js');
  const { createTreeFade, findFadeOccluders } = await import('../src/treefade.js');
  const { buildCat } = await import('../src/cat/model.js');

  for (const [areaId, build] of Object.entries(BUILDS)) {
    const scene = new THREE.Scene();
    const areaData = build(scene);
    createContactShadows(scene);
    mergeStaticProps(scene);
    assignShadowCasters(scene);
    const b = areaData.bounds;
    const centre = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 300);
    camera.position.set(centre.x, 2, centre.z);
    camera.updateMatrixWorld();

    // The same per-walk systems walk.js builds, once with the evening look
    // (dusk lawn tint, lamp pools) and rain on the first area that has them.
    const look = duskLook(areaData);
    const grass = createGrass(scene, { areaId, areaData, tier, camera, reducedMotion: false, keepOut: [], hooks: mods[areaId].GRASS_HOOKS });
    if (grass.mesh?.material) tintDuskLawn({ ground: [], grass: grass.mesh.material, look });
    createPawPrints(scene, { areaId, areaData, tier });
    createSplash(scene, { areaData, tier, reducedMotion: false });
    createWaterDressing(scene, { areaId, areaData, tier, reducedMotion: false, keepOut: [], evening: null });
    createClouds(scene, { areaId, tier, camera, centre });
    createAmbient(scene, { areaId, areaData, tier, camera, dusk: false, reducedMotion: false, keepOut: [] });
    createRustle(scene, { reducedMotion: false });
    if (areaId !== 'den') createTreeFade(findFadeOccluders(scene), { reducedMotion: false });
    if (areaId === 'park' || areaId === 'docks') createLampPools(scene);
    if (areaId === 'neighborhood') {
      const sun = { color: new THREE.Color(), intensity: 1, position: new THREE.Vector3(), target: new THREE.Object3D() };
      const hemi = new THREE.HemisphereLight();
      for (const condition of ['rain', 'clear', 'sunset']) {
        createWeather(scene, sun, condition, () => 0.5, false, undefined, { tier, fill: hemi, wet: null });
      }
    }
    if (areaData.raceCourse || areaData.pois) {
      const course = areaData.raceCourse ?? raceCourse(areaData.pois, 42);
      const fakeScene = { add() {}, remove() {} };
      createRace(fakeScene, course, areaData.spawn, { kind: 'daily', dusk: false });
      createRace(fakeScene, course, areaData.spawn, { kind: 'daily', dusk: true });
    }
  }

  // The cats: fur rim light on every breed, lens glow on the dark faces.
  for (const breed of ['tabby', 'black', 'siamese', 'zeetoo', 'hagrid']) buildCat(breed);

  sitesFromGame = sitesOf(captured);
})(); } finally {
  stopChunkWatch();
}
const chunkSites = new Map();
for (const e of chunkEdits) {
  if (!chunkSites.has(e.site)) chunkSites.set(e.site, []);
  chunkSites.get(e.site).push(e);
}

afterAll(() => {
  Object.defineProperty(THREE.Material.prototype, 'onBeforeCompile', original);
  Error.stackTraceLimit = previousStackLimit;
});

describe('every shader patch in the game', () => {
  it.each([...sitesFromGame.keys()].sort())('%s patches the shaders it is given', (site) => {
    for (const c of sitesFromGame.get(site).values()) {
      const { noops, changed } = runPatch(c.material, c.fn, site);
      expect(noops, `${site} (${c.material.type}): a replace matched nothing in three.js's shader: ${noops.join(', ')}`).toEqual([]);
      expect(changed, `${site} (${c.material.type}): the patch left both shaders unchanged`).toBe(true);
    }
  });

  it('exercises at least as many patch sites as it did when written', () => {
    expect(sitesFromGame.size).toBeGreaterThanOrEqual(PATCH_SITE_FLOOR);
  });
});

describe('every edit the game makes to a three.js chunk', () => {
  it.each([...chunkSites.keys()].sort())('%s finds the text it cuts in three.js\'s chunk', (site) => {
    const missed = chunkSites.get(site).filter((e) => !e.changed).map((e) => e.call);
    expect(missed, `${site}: a replace matched nothing in three.js's chunk: ${missed.join(', ')}`).toEqual([]);
  });

  it('exercises at least as many chunk edits as it did when written', () => {
    expect(chunkSites.size).toBeGreaterThanOrEqual(CHUNK_EDIT_FLOOR);
  });

  it('leaves three.js\'s chunks and library shaders as shipped', () => {
    const now = shippedShaders();
    const changed = [
      ...Object.keys({ ...SHIPPED.chunks, ...now.chunks }).filter((k) => SHIPPED.chunks[k] !== now.chunks[k]),
      ...Object.keys({ ...SHIPPED.lib, ...now.lib }).filter((k) => String(SHIPPED.lib[k]) !== String(now.lib[k])).map((k) => `ShaderLib.${k}`),
    ];
    expect(changed).toEqual([]);
  });
});
