import * as THREE from 'three';
import { skyBackground } from './render/sky.js';
import { FLAT_GROUND, groundOf } from './ground.js';
import { standSpot } from './keepout.js';
import { mulberry32, seedFromCode } from './rng.js';

export function rollWeather(rng) {
  const r = rng();
  if (r < 0.5) return 'clear';
  if (r < 0.8) return 'rain';
  return 'sunset';
}

// The rain's three extra puddles (walk.js): two draws each off the walk's
// stream, anywhere within the middle half of the bounds, then (Gorge part 2,
// G7) moved onto ground a cat can stand on (keepout.js's standSpot), after
// the draws, so no draw moves. Untouched on every map without onlyOn.
// Each spot carries `y`, the ground under it (0 on every flat map), so the
// puddle is drawn on the clifftop or a ledge when it lands there.
export function rainPuddleSpots(area, rng, count = 3) {
  const b = area.bounds;
  const ground = groundOf(area);
  const spots = [];
  for (let i = 0; i < count; i++) {
    const px = b.minX / 2 + rng() * (b.maxX - b.minX) / 2;
    const pz = b.minZ / 2 + rng() * (b.maxZ - b.minZ) / 2;
    const { x, z } = standSpot(area, px, pz);
    spots.push({ x, z, r: 0.8, y: ground.y(x, z) });
  }
  return spots;
}

export function createRainSchedule(rng) {
  const stopAt = 60 + rng() * 60;
  const rainbowUntil = stopAt + 30;
  return {
    stopAt,
    rainbowUntil,
    phase(t) {
      return t < stopAt ? 'rain' : t < rainbowUntil ? 'rainbow' : 'after';
    },
  };
}

const RAINBOW_COLORS = [0xe05050, 0xe09a40, 0xe8d84e, 0x58b858, 0x5878d8, 0x8858c8];

// How rain looks, in one place. Cosy rain, not a storm: thin pale streaks that
// crowd near the camera (where they read) and thin out toward the edge, a grey
// but still gentle sky, and a ground that darkens a little rather than going
// black. Frozen so a test (and the next person) can read the numbers.
export const RAIN_LOOK = Object.freeze({
  radius: 22,          // column radius around the camera, metres
  height: 14,          // column height; drops wrap from the bottom to the top
  bias: 1.6,           // r = radius * u^bias: more than half sit inside 40% of it
  lenMin: 0.35, lenMax: 0.6,
  widthMin: 0.012, widthMax: 0.02,
  slant: 0.12,         // sideways lean per metre of length: a breath of wind
  speedMin: 14, speedMax: 18,
  dropColor: 0xb8c8d8, dropOpacity: 0.45,
  skyTop: 0x7d868f, skyHorizon: 0x969ea5,
  // Rain ADJUSTS whatever sky and light it finds (the day, a dusk Gorge...),
  // so these are factors on the entry state, not absolute numbers. On a
  // standard day (fog 40/130, sun 2.2) they reproduce the old look: 14/75, 0.9.
  fogMix: 0.8,         // entry fog colour -> the rain grey (skyHorizon)
  fogNearK: 0.35, fogFarK: 0.5769,
  sunK: 0.9 / 2.2,
  topDarken: 0.85,     // sky top when the background is a texture: fog, a bit deeper
  topMix: 0.7,         // base sky top -> the rain top grey (skyTop)
  fillScale: 0.8,
  // Wet is told by colour, not gloss: dropping roughness made the lawn pick up
  // a pale sky sheen from the environment light, so roughness stays put.
  wetColor: 0.6, wetRough: 1, wetRoughFloor: 0.35,
  // Blades: darker and a touch cooler, tinted in place (grass.js's material is
  // patched with onBeforeCompile and must not be cloned) and put back exactly.
  grassTint: [0.5, 0.62, 0.72],
  ringGrow: 0.9, ringMin: 0.05, ringMax: 0.45, ringY: 0.03,
  ringPale: 0xdfe9f2, ringFade: 0x6f8798,
  // A streak is a world-space quad, so one passing the lens became a white
  // plank across the screen. Inside nearFadeStart..End it fades out, and its
  // half-width never exceeds dist * maxHalfAngle (about 3 px on a phone).
  nearFadeStart: 1.2, nearFadeEnd: 2.4, maxHalfAngle: 0.0025,
  dropsHigh: 900, dropsMedium: 650, dropsLow: 400,
});

// Fewer streaks on the weaker tier; an unknown/absent tier gets the full set
// (older callers and tests pass none).
export function rainDropCount(tier) {
  if (tier?.name === 'low') return RAIN_LOOK.dropsLow;
  if (tier?.name === 'medium') return RAIN_LOOK.dropsMedium;
  return RAIN_LOOK.dropsHigh;
}

// JS mirror of the rain shader's near-camera treatment (same RAIN_LOOK numbers),
// so the look can be tested without a GPU.
export function streakShape(dist, halfWidth) {
  const L = RAIN_LOOK;
  const t = Math.min(1, Math.max(0, (dist - L.nearFadeStart) / (L.nearFadeEnd - L.nearFadeStart)));
  return { alpha: t * t * (3 - 2 * t), halfWidth: Math.min(halfWidth, dist * L.maxHalfAngle) };
}

// One merged mesh of thin vertical quads (four verts a drop), seeded so two
// walks of the same weather draw the same sky and nothing here ever touches
// Math.random. Returns the mesh plus the per-drop state the fall loop needs.
function buildDrops(count) {
  const L = RAIN_LOOK;
  const rnd = mulberry32(seedFromCode('rain-drops'));
  const positions = new Float32Array(count * 12);
  const indices = new Uint32Array(count * 6);
  const drop = new Float32Array(count * 4); // [x, z, halfWidth, ... ] see below
  const len = new Float32Array(count);
  const speed = new Float32Array(count);
  const bottom = new Float32Array(count);
  const lean = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = L.radius * Math.pow(rnd(), L.bias);
    const a = rnd() * Math.PI * 2;
    drop[i * 4] = Math.cos(a) * r;
    drop[i * 4 + 1] = Math.sin(a) * r;
    drop[i * 4 + 2] = (L.widthMin + rnd() * (L.widthMax - L.widthMin)) / 2;
    len[i] = L.lenMin + rnd() * (L.lenMax - L.lenMin);
    speed[i] = L.speedMin + rnd() * (L.speedMax - L.speedMin);
    bottom[i] = rnd() * L.height;
    lean[i] = len[i] * L.slant;
    const v = i * 4;
    indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
  }
  // Static per-vertex data for the near-camera shader: which edge of the quad
  // a vertex is on, and the drop's half-width.
  const side = new Float32Array(count * 4);
  const half = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 4; k++) {
      side[i * 4 + k] = k % 2 === 0 ? -1 : 1;
      half[i * 4 + k] = drop[i * 4 + 2];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aHalf', new THREE.BufferAttribute(half, 1));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  const writeDrop = (i) => {
    const x = drop[i * 4];
    const z = drop[i * 4 + 1];
    const hw = drop[i * 4 + 2];
    const yb = bottom[i];
    const yt = yb + len[i];
    const o = i * 12;
    positions[o] = x - hw; positions[o + 1] = yb; positions[o + 2] = z;
    positions[o + 3] = x + hw; positions[o + 4] = yb; positions[o + 5] = z;
    positions[o + 6] = x - hw + lean[i]; positions[o + 7] = yt; positions[o + 8] = z;
    positions[o + 9] = x + hw + lean[i]; positions[o + 10] = yt; positions[o + 11] = z;
  };
  for (let i = 0; i < count; i++) writeDrop(i);
  const mat = new THREE.MeshBasicMaterial({
    color: L.dropColor, transparent: true, opacity: L.dropOpacity,
    // FrontSide: the quads are wound to face +z and the column is yawed to
    // look back at the camera, so they are always front-on; DoubleSide would
    // make three draw this transparent mesh in two passes.
    depthWrite: false, fog: true, side: THREE.FrontSide,
  });
  // Fade and width-cap near the lens (see RAIN_LOOK.nearFade*). Distance is the
  // view-space length to the edge pair's centre line (vertex minus its side
  // offset), so both edges of a quad scale together and the top verts' lean
  // stays in the position rather than the width.
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNear0 = { value: L.nearFadeStart };
    shader.uniforms.uNear1 = { value: L.nearFadeEnd };
    shader.uniforms.uMaxHalf = { value: L.maxHalfAngle };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aSide;
attribute float aHalf;
uniform float uNear0;
uniform float uNear1;
uniform float uMaxHalf;
varying float vRainNear;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 rainCentre = transformed - vec3(aSide * aHalf, 0.0, 0.0);
float rainDist = length((modelViewMatrix * vec4(rainCentre, 1.0)).xyz);
transformed.x = rainCentre.x + aSide * min(aHalf, rainDist * uMaxHalf);
vRainNear = smoothstep(uNear0, uNear1, rainDist);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vRainNear;`)
      .replace('#include <opaque_fragment>', `diffuseColor.a *= vRainNear;
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'whisker-rain';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'rain-drops';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const fall = (dt) => {
    for (let i = 0; i < count; i++) {
      bottom[i] -= speed[i] * dt;
      if (bottom[i] + len[i] < 0) bottom[i] += L.height + len[i];
      writeDrop(i);
    }
    geo.attributes.position.needsUpdate = true;
  };
  return { mesh, fall };
}

// Rings on the puddles: one InstancedMesh, each instance a thin ring that
// grows and fades on its own seeded phase. Low tier gets one ring a puddle.
function buildRings(puddles, tier) {
  const L = RAIN_LOOK;
  const per = tier?.name === 'low' ? 1 : 3;
  const rnd = mulberry32(seedFromCode('rain-rings'));
  const items = [];
  for (const p of puddles) {
    for (let k = 0; k < per; k++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * (p.r ?? 0.8) * 0.6;
      items.push({
        x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, y: (p.y ?? 0) + L.ringY,
        phase: rnd(),
      });
    }
  }
  if (!items.length) return null;
  const geo = new THREE.RingGeometry(0.85, 1, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  mesh.name = 'rain-rings';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const pale = new THREE.Color(L.ringPale);
  const fade = new THREE.Color(L.ringFade);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const pose = (elapsed) => {
    items.forEach((it, i) => {
      const t = (elapsed / L.ringGrow + it.phase) % 1;
      const s = L.ringMin + (L.ringMax - L.ringMin) * t;
      m4.makeScale(s, 1, s).setPosition(it.x, it.y, it.z);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.copy(pale).lerp(fade, t * t));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  pose(0);
  return { mesh, pose };
}

// reducedMotion (settings.reducedMotion): skips creating the rain particle
// system and its per-frame position updates below — the background/fog/sun
// mood change and the rainbow payoff still happen, only the falling-particle
// motion (the part actually implicated in motion discomfort) is dropped.
// Gorge part 1 (R14): `ground` lifts the rain column to the ground under the
// camera (FLAT_GROUND: it stays at 0).
// opts (all optional): { tier, fill, wet: Mesh[], puddles: {x,z,r,y}[] }.
// `wet` meshes darken while it rains, through a per-walk clone of their
// material (the original is never written, and goes back on the mesh at the
// rainbow or dispose()); `fill` is dimmed and put back; puddle rings arrive
// via opts.puddles or addPuddles(), since walk.js adds the rain's own puddles
// after this is built. update(dt, cameraPos, camera?) — the camera, when
// given, turns the streaks to face it.
export function createWeather(scene, sun, condition, rng, reducedMotion = false, ground = FLAT_GROUND, opts = {}) {
  // isRaining(): true only while a rainy walk is still in its rain phase (not
  // the rainbow, not after). Reads the schedule's clock; draws nothing from
  // any rng. v21 3b: falling rain loosens the grip on whatever the cat carries.
  // setSheltered(on) (Gorge part 3, C6): the camera is under a ceiling, so
  // the rain column hides; a no-op on every walk without one. The rain's
  // sound is unchanged: you hear rain from a cave mouth.
  const api = { condition, rainbowVisible: false, rainbowPos: null, update() {}, isRaining: () => false, setSheltered() {}, addPuddles() {}, tintWet() {}, dispose() {} };
  if (condition === 'clear') return api;

  if (condition === 'sunset') {
    // Gradient rather than a flat fill, same helper applySky uses, and the
    // horizon stop (0xf8c890) is the same value the fog line below fades
    // into — see render/sky.js for why those two must always agree. Sunset
    // never restores its background (it lasts the rest of the walk), so
    // there is no round-trip to get right here the way there is for rain.
    scene.background = skyBackground(0xf0a060, 0xf8c890);
    scene.fog = new THREE.Fog(0xf8c890, 40, 130);
    sun.color.set(0xffb060);
    sun.intensity = 1.5;
    return api;
  }

  // rain
  //
  // scene.background can now be either a THREE.Color (the flat fallback) or
  // a CanvasTexture (the gradient from applySky/skyBackground), and the two
  // do NOT want the same save strategy:
  //   - Color.clone() is correct and cheap: it's a copied value.
  //   - Texture.clone() is also correct (it deep-copies mapping, colorSpace,
  //     wrapping etc. via Texture.copy — verified against the bundled three),
  //     but it allocates a NEW Texture object bound to the SAME source canvas.
  //     Three uploads each distinct Texture object to the GPU once, so every
  //     rain->rainbow round trip would leak one more GPU upload of a canvas
  //     that never changes. Over a long session with repeated rain that is a
  //     slow leak for zero benefit — nothing here ever mutates a sky texture
  //     in place, so there is nothing a clone protects against.
  // The sky textures this module hands back are memoised and immutable by
  // contract (render/sky.js), so the safe and correct move is to keep the
  // reference for a Texture and only clone the mutable Color case.
  const prevBackground =
    scene.background && scene.background.isTexture ? scene.background : scene.background.clone();
  const prevFog = { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far };
  const prevSun = sun.intensity;
  const L = RAIN_LOOK;
  // The fog greys toward the rain colour from wherever it stood; the sky's
  // horizon stop IS that fog colour (render/sky.js contract) and its top is
  // the base top greyed the same way. sky.js hands out no stops, so a texture
  // background's top is taken as the entry fog a little deeper.
  const fogColor = prevFog.color.clone().lerp(new THREE.Color(L.skyHorizon), L.fogMix);
  const baseTop = prevBackground.isColor
    ? prevBackground.clone()
    : prevFog.color.clone().multiplyScalar(L.topDarken);
  const rainTop = baseTop.lerp(new THREE.Color(L.skyTop), L.topMix);
  scene.background = skyBackground(rainTop.getHex(), fogColor.getHex());
  scene.fog = new THREE.Fog(fogColor, prevFog.near * L.fogNearK, prevFog.far * L.fogFarK);
  sun.intensity = prevSun * L.sunK;
  // True while the rain look is on the scene; cleared when the rainbow gives
  // the entry look back, so dispose() never undoes what someone else changed since.
  let lookApplied = true;
  const fill = opts.fill ?? null;
  const fillBase = fill ? fill.intensity : 0;
  let fillDimmed = false;
  if (fill) { fill.intensity = fillBase * L.fillScale; fillDimmed = true; }

  // Wet ground: each wet mesh gets its own darker, glossier clone for the
  // rain; the original material goes straight back on afterwards, never edited.
  const wetSwaps = [];
  for (const mesh of opts.wet ?? []) {
    const orig = mesh.material;
    if (!orig || Array.isArray(orig) || !orig.color) continue;
    const wet = orig.clone();
    wet.color.multiplyScalar(L.wetColor);
    if (typeof wet.roughness === 'number') {
      wet.roughness = Math.min(orig.roughness, Math.max(L.wetRoughFloor, orig.roughness * L.wetRough));
    }
    mesh.material = wet;
    wetSwaps.push({ mesh, orig, wet });
  }
  // Materials tinted in place (the grass blades): original colour kept to the bit.
  const tints = [];
  api.tintWet = (material) => {
    if (disposed || !material?.color || tints.some((t) => t.material === material)) return;
    if (schedule.phase(elapsed) !== 'rain') return;
    tints.push({ material, color: material.color.clone() });
    material.color.multiply(new THREE.Color(...L.grassTint));
  };
  const dry = () => {
    for (const t of tints) t.material.color.copy(t.color);
    tints.length = 0;
    for (const w of wetSwaps) {
      if (w.mesh.material === w.wet) w.mesh.material = w.orig;
      w.wet.dispose();
    }
    wetSwaps.length = 0;
    if (fill && fillDimmed) fill.intensity = fillBase;
    fillDimmed = false;
  };

  const schedule = createRainSchedule(rng);
  let elapsed = 0;
  let rainbow = null;
  let sheltered = false;

  let rain = null;
  let fall = null;
  if (!reducedMotion) {
    const built = buildDrops(rainDropCount(opts.tier));
    rain = built.mesh;
    fall = built.fall;
    scene.add(rain);
  }
  let rings = null;
  let ringsPose = null;
  const addPuddles = (list) => {
    if (reducedMotion || !list || !list.length || rings || disposed || schedule.phase(elapsed) !== 'rain') return;
    const built = buildRings(list, opts.tier);
    if (!built) return;
    rings = built.mesh;
    ringsPose = built.pose;
    rings.visible = !sheltered;
    scene.add(rings);
  };
  let disposed = false;
  api.addPuddles = addPuddles;
  addPuddles(opts.puddles);
  // The walk is ending (rain or not): ground, fill and meshes back as found.
  api.dispose = () => {
    if (disposed) return;
    disposed = true;
    dry();
    // Dispose in the middle of the rain: the sky and light go back as found
    // (after the rainbow they already have, and are not touched again).
    if (lookApplied) {
      lookApplied = false;
      scene.background = prevBackground;
      scene.fog = new THREE.Fog(prevFog.color, prevFog.near, prevFog.far);
      sun.intensity = prevSun;
    }
    for (const m of [rain, rings]) {
      if (!m) continue;
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    if (rings) rings.dispose?.();
    rain = null;
    rings = null;
  };

  const viewDir = new THREE.Vector3();
  api.isRaining = () => schedule.phase(elapsed) === 'rain';
  // Only the rain phase ever shows the column again; the rainbow hid it for good.
  api.setSheltered = (on) => {
    sheltered = on;
    if (api.isRaining()) {
      if (rain) rain.visible = !sheltered;
      if (rings) rings.visible = !sheltered;
    }
  };
  api.update = (dt, cameraPos, camera) => {
    elapsed += dt;
    const phase = schedule.phase(elapsed);
    if (phase === 'rain') {
      if (rain) {
        rain.position.x = cameraPos.x;
        rain.position.z = cameraPos.z;
        if (!ground.flat) rain.position.y = ground.y(cameraPos.x, cameraPos.z);
        if (camera) {
          // Quads are drawn facing +z; turn them to look back at the viewer.
          camera.getWorldDirection(viewDir);
          if (Math.hypot(viewDir.x, viewDir.z) > 1e-3) rain.rotation.y = Math.atan2(-viewDir.x, -viewDir.z);
        }
        fall(dt);
      }
      if (rings) ringsPose(elapsed);
    } else if (phase === 'rainbow') {
      if (!rainbow) {
        if (rain) rain.visible = false;
        if (rings) rings.visible = false;
        dry();
        lookApplied = false;
        scene.background = prevBackground;
        scene.fog = new THREE.Fog(prevFog.color, prevFog.near, prevFog.far);
        sun.intensity = prevSun;
        rainbow = new THREE.Group();
        RAINBOW_COLORS.forEach((color, i) => {
          const arc = new THREE.Mesh(
            new THREE.TorusGeometry(24 - i * 0.7, 0.3, 6, 40, Math.PI),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
          );
          rainbow.add(arc);
        });
        // A rainbow is ANTI-SOLAR: its centre is the point directly opposite
        // the sun from the viewer, which is why you always have the sun behind
        // you when you see one. This used to be a fixed `cameraPos.z - 70`,
        // which was never derived from anything — it was 56 degrees off the
        // anti-solar point under the old sun and merely happened to land in
        // roughly the right half of the sky.
        //
        // The azimuth pass moved the sun to its antipode (walk.js SUN_POSITION,
        // 56.3 -> 236.3 degrees) and that luck ran out: a fixed due-north arc
        // then sat on the SAME side of the sky as the sun, which cannot happen
        // in nature. Deriving the direction from `sun` — the light this module
        // is already handed — is what stops it drifting again the next time
        // someone moves the sun.
        //
        // `rainbowPos` below feeds main.js's look-at-the-rainbow award, so this
        // is not only decorative: the arc and the thing the game checks you are
        // facing have to be the same place.
        const ax = -sun.position.x;
        const az = -sun.position.z;
        const alen = Math.hypot(ax, az) || 1;
        const dx = ax / alen;
        const dz = az / alen;
        rainbow.position.set(cameraPos.x + dx * 70, 0, cameraPos.z + dz * 70);
        // A half-torus is built in the XY plane with its face normal along +z,
        // so the group is yawed until that normal points back down the
        // anti-solar axis at the viewer. Rotating +z by rotation.y gives
        // (sin y, 0, cos y), so y = atan2(-dx, -dz). That evaluates to exactly
        // 0 for the old due-north placement, which is why the original needed
        // no rotation and why this is a strict generalisation of it rather
        // than a different behaviour.
        rainbow.rotation.y = Math.atan2(-dx, -dz);
        scene.add(rainbow);
        api.rainbowVisible = true;
        api.rainbowPos = { x: rainbow.position.x, z: rainbow.position.z };
      }
    } else if (rainbow && api.rainbowVisible) {
      rainbow.visible = false;
      api.rainbowVisible = false;
    }
  };
  return api;
}
