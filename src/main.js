import * as THREE from 'three';
import { createPlayer } from './player.js';
import { bus } from './events.js';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { createLeash, MAX_LEN } from './leash.js';
import { createBrain, PERSONALITIES } from './cat/brain.js';

const canvas = document.getElementById('game');

export function createRenderer() {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    return null;
  }
}

const renderer = createRenderer();
if (!renderer) {
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('overlay').innerHTML =
    '<div style="display:grid;place-items:center;height:100%"><p>Sorry — your browser could not start WebGL, which Whisker Walk needs. Try updating your browser or enabling hardware acceleration.</p></div>';
} else {
  init(renderer);
}

function init(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd4e8); // placeholder sky, area builders replace it
  scene.fog = new THREE.Fog(0x9fd4e8, 40, 120);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 1.6, 5);

  const player = createPlayer(camera, canvas);
  player.enable(); // temporary — Task 11's home base takes over enabling

  // temporary pause overlay behavior:
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = '<div class="pause-card"><h1>Paused</h1><p>Click the game to resume</p></div>';
  overlay.classList.remove('hidden');
  bus.on('player:lockchange', ({ locked }) => {
    overlay.classList.toggle('hidden', locked);
  });

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(30, 50, 20);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd8ff, 0.9));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshLambertMaterial({ color: 0x7cb860 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  let cat = buildCat('tabby');
  cat.position.set(0, 0, 2);
  scene.add(cat);

  let brain = createBrain(cat.userData.breed);
  const leash = createLeash(scene);
  const catVelocity = new THREE.Vector3();

  function handPosition() {
    // just below and right of the camera
    const hand = player.forward().multiplyScalar(0.3);
    hand.add(camera.position).add(new THREE.Vector3(0, -0.5, 0));
    return hand;
  }

  function updateCat(dt, t) {
    const p = PERSONALITIES[cat.userData.breed];
    const toPlayer = camera.position.clone().sub(cat.position);
    toPlayer.y = 0;
    const distToPlayer = toPlayer.length();
    const tension = distToPlayer / MAX_LEN;

    brain.update(dt, { leashTension: tension, critterNearby: false, poiNearby: false });

    // pick a target by state
    let target = null;
    const state = brain.state;
    if (state === 'follow' || state === 'scared') {
      target = camera.position.clone().add(player.forward().multiplyScalar(2)).add(
        player.forward().clone().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(0.8)
      );
    }
    // sniff/nap/requestPet: stay put; distracted gets a real target in Task 9

    const desired = new THREE.Vector3();
    if (target) {
      desired.copy(target).sub(cat.position);
      desired.y = 0;
      if (desired.length() > 0.4) desired.normalize().multiplyScalar(p.speed * (state === 'scared' ? 1.8 : 1));
      else desired.set(0, 0, 0);
    }
    // taut leash drags the cat toward the player regardless of state
    if (tension > 1) desired.add(toPlayer.normalize().multiplyScalar((tension - 1) * 20));

    catVelocity.lerp(desired, 1 - Math.pow(0.001, dt));
    cat.position.addScaledVector(catVelocity, dt);
    cat.position.y = 0;
    const speed = catVelocity.length();
    if (speed > 0.15) {
      const heading = Math.atan2(catVelocity.x, catVelocity.z) + Math.PI;
      cat.rotation.y = heading;
    }
    animateCat(cat, state, t, speed);

    // leash drags the player when the cat pulls
    const leashTension = leash.update(handPosition(), cat.position.clone().add(new THREE.Vector3(0, 0.4, 0)));
    player.speedFactor = leashTension > 0.9 ? Math.max(0.35, 1 - (leashTension - 0.9) * (p.pull / 4)) : 1;
  }

  // debug breed switcher — REMOVED in Task 11
  const breeds = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon'];
  document.addEventListener('keydown', (e) => {
    if (e.code.startsWith('Digit') && breeds[+e.code.slice(5) - 1]) {
      scene.remove(cat);
      const newBreed = breeds[+e.code.slice(5) - 1];
      cat = buildCat(newBreed, { collar: 'bell', outfit: 'bandana' });
      cat.position.set(0, 0, 2);
      scene.add(cat);
      brain = createBrain(newBreed);
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    player.update(dt, [], { minX: -90, maxX: 90, minZ: -90, maxZ: 90 });
    updateCat(dt, clock.elapsedTime);
    renderer.render(scene, camera);
  });
}
