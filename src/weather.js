import * as THREE from 'three';
import { skyBackground } from './render/sky.js';

export function rollWeather(rng) {
  const r = rng();
  if (r < 0.5) return 'clear';
  if (r < 0.8) return 'rain';
  return 'sunset';
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

// reducedMotion (settings.reducedMotion): skips creating the rain particle
// system and its per-frame position updates below — the background/fog/sun
// mood change and the rainbow payoff still happen, only the falling-particle
// motion (the part actually implicated in motion discomfort) is dropped.
export function createWeather(scene, sun, condition, rng, reducedMotion = false) {
  const api = { condition, rainbowVisible: false, rainbowPos: null, update() {} };
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
  // Same gradient treatment as sunset, horizon stop matching the fog color
  // set two lines below.
  scene.background = skyBackground(0x7a8a98, 0x8a9aa8);
  scene.fog = new THREE.Fog(0x8a9aa8, 20, 90);
  sun.intensity = 1.1;

  const COUNT = 600;
  let rain = null;
  let geo = null;
  if (!reducedMotion) {
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = Math.random() * 25;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaac8e0, size: 0.08, transparent: true, opacity: 0.7 }));
    rain.frustumCulled = false;
    scene.add(rain);
  }

  const schedule = createRainSchedule(rng);
  let elapsed = 0;
  let rainbow = null;

  api.update = (dt, cameraPos) => {
    elapsed += dt;
    const phase = schedule.phase(elapsed);
    if (phase === 'rain') {
      if (rain) {
        rain.position.x = cameraPos.x;
        rain.position.z = cameraPos.z;
        const arr = geo.attributes.position.array;
        for (let i = 0; i < COUNT; i++) {
          arr[i * 3 + 1] -= 18 * dt;
          if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 25;
        }
        geo.attributes.position.needsUpdate = true;
      }
    } else if (phase === 'rainbow') {
      if (!rainbow) {
        if (rain) rain.visible = false;
        scene.background = prevBackground;
        scene.fog = new THREE.Fog(prevFog.color, prevFog.near, prevFog.far);
        sun.intensity = 2.2;
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
