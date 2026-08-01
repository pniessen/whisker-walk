import * as THREE from 'three';

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

export function createWeather(scene, sun, condition, rng) {
  const api = { condition, rainbowVisible: false, rainbowPos: null, update() {} };
  if (condition === 'clear') return api;

  if (condition === 'sunset') {
    scene.background = new THREE.Color(0xf0a060);
    scene.fog = new THREE.Fog(0xf8c890, 40, 130);
    sun.color.set(0xffb060);
    sun.intensity = 1.5;
    return api;
  }

  // rain
  const prevBackground = scene.background.clone();
  const prevFog = { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far };
  scene.background = new THREE.Color(0x7a8a98);
  scene.fog = new THREE.Fog(0x8a9aa8, 20, 90);
  sun.intensity = 1.1;

  const COUNT = 600;
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = Math.random() * 25;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaac8e0, size: 0.08, transparent: true, opacity: 0.7 }));
  rain.frustumCulled = false;
  scene.add(rain);

  const schedule = createRainSchedule(rng);
  let elapsed = 0;
  let rainbow = null;

  api.update = (dt, cameraPos) => {
    elapsed += dt;
    const phase = schedule.phase(elapsed);
    if (phase === 'rain') {
      rain.position.x = cameraPos.x;
      rain.position.z = cameraPos.z;
      const arr = geo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        arr[i * 3 + 1] -= 18 * dt;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 25;
      }
      geo.attributes.position.needsUpdate = true;
    } else if (phase === 'rainbow') {
      if (!rainbow) {
        rain.visible = false;
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
        rainbow.position.set(cameraPos.x, 0, cameraPos.z - 70);
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
