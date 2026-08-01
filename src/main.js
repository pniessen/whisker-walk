import * as THREE from 'three';
import { createPlayer } from './player.js';
import { bus } from './events.js';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { createLeash, MAX_LEN } from './leash.js';
import { createBrain, PERSONALITIES } from './cat/brain.js';
import * as neighborhood from './world/neighborhood.js';
import { createCritters } from './critters.js';
import { createProgression } from './progression.js';
import { createDiscoveryLog } from './discoveries.js';
import { createHud } from './ui/hud.js';

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

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);

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

  const area = neighborhood.build(scene);
  camera.position.set(area.spawn.x, 1.6, area.spawn.z);

  const progression = createProgression(window.localStorage);
  const log = createDiscoveryLog(progression);
  const hud = createHud();
  hud.show();
  hud.setArea(area.name);
  hud.setPoints(progression.state.points);
  log.startWalk();
  bus.on('discovery', () => hud.setPoints(progression.state.points));

  const collectibleMeshes = new Map();
  for (const c of area.collectibles) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xf25c8a, emissive: 0x5a1a30 })
    );
    m.position.set(c.x, 0.2, c.z);
    scene.add(m);
    collectibleMeshes.set(c.id, m);
  }

  const critters = createCritters(scene, area.critterSpawns, {});

  let cat = buildCat('tabby');
  cat.position.set(area.spawn.x + 1, 0, area.spawn.z - 2);
  scene.add(cat);

  let brain = createBrain(cat.userData.breed);
  const leash = createLeash(scene);
  const catVelocity = new THREE.Vector3();

  bus.on('critter:scare', () => {
    if (brain.scare()) hud.toast('Woof! Your cat got spooked!');
  });

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

    const nearCritter = critters.nearest(cat.position, 8);
    const nearPoi = area.pois.some((poi) => Math.hypot(poi.x - cat.position.x, poi.z - cat.position.z) < p.sniffRange);
    brain.update(dt, { leashTension: tension, critterNearby: !!nearCritter, poiNearby: nearPoi });

    // pick a target by state
    let target = null;
    const state = brain.state;
    if (state === 'follow' || state === 'scared') {
      target = camera.position.clone().add(player.forward().multiplyScalar(2)).add(
        player.forward().clone().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(0.8)
      );
    } else if (state === 'distracted' && nearCritter) {
      target = nearCritter.group.position.clone();
    } else if (state === 'distracted') {
      brain.set('follow', 2); // critter got away
    }
    // sniff/nap/requestPet: stay put

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

    if (state === 'distracted') {
      const caught = critters.catchAt(cat.position.clone().setY(0.8));
      if (caught && p.special === 'pouncer') bus.emit('cat:pounce', { critter: caught });
    }

    animateCat(cat, state, t, speed);

    // leash drags the player when the cat pulls
    const leashTension = leash.update(handPosition(), cat.position.clone().add(new THREE.Vector3(0, 0.4, 0)));
    player.speedFactor = leashTension > 0.9 ? Math.max(0.35, 1 - (leashTension - 0.9) * (p.pull / 4)) : 1;
  }

  const walk = { carried: 0, carryCap: 2 }; // backpack raises cap in Task 14
  let currentPrompt = null;

  function updateInteractions() {
    // 1. critter spotting: within 6, roughly in front of the player
    for (const c of critters.list) {
      if (!c.spottable || c.fleeing) continue;
      const to = c.group.position.clone().sub(camera.position).setY(0);
      if (to.length() < 6 && to.normalize().dot(player.forward()) > 0.5) {
        log.awardOnce('critter', `spot-${c.id}`, labelFor(c.type));
      }
    }
    // 2. nearest collectible
    currentPrompt = null;
    for (const c of area.collectibles) {
      if (!collectibleMeshes.has(c.id)) continue;
      if (Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 1.6) {
        currentPrompt = { kind: 'collect', data: c };
        hud.setPrompt(walk.carried >= walk.carryCap ? 'Paws full! (carry limit reached)' : `E — pick up ${c.label}`);
      }
    }
    // 3. petting
    if (!currentPrompt && (brain.state === 'requestPet' || brain.state === 'nap') &&
        cat.position.distanceTo(camera.position) < 2.8) {
      currentPrompt = { kind: 'pet' };
      hud.setPrompt(brain.state === 'nap' ? 'E — pet the sleepy cat' : 'E — your cat wants pets!');
    }
    if (!currentPrompt) hud.setPrompt(null);

    // 4. scenic spots
    for (const s of area.scenics) {
      if (Math.hypot(s.x - camera.position.x, s.z - camera.position.z) < 4) {
        log.awardOnce('scenic', `scenic-${s.id}`, s.label);
      }
    }
  }

  function labelFor(type) {
    return { bird: 'a songbird', squirrel: 'a busy squirrel', butterfly: 'a butterfly',
      duck: 'a paddling duck', seagull: 'a seagull', crab: 'a sideways crab',
      dog: 'the neighbor’s dog', villager: 'a friendly neighbor' }[type] ?? 'something interesting';
  }

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || !currentPrompt) return;
    if (currentPrompt.kind === 'collect' && walk.carried < walk.carryCap) {
      const c = currentPrompt.data;
      scene.remove(collectibleMeshes.get(c.id));
      collectibleMeshes.delete(c.id);
      walk.carried += 1;
      log.awardOnce('collectible', `col-${c.id}`, c.label);
    } else if (currentPrompt.kind === 'pet' && brain.pet()) {
      log.award('pet', 'pet', 'a rumbling purr');
    }
  });

  let momentTimer = 40;
  let activeMoment = null;

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
    player.update(dt, area.colliders, area.bounds);
    critters.update(dt, clock.elapsedTime, camera.position, cat.position);
    updateCat(dt, clock.elapsedTime);

    momentTimer -= dt;
    if (momentTimer <= 0 && area.moments.length) {
      momentTimer = 45 + Math.random() * 30;
      const m = area.moments[Math.floor(Math.random() * area.moments.length)];
      critters.playMoment(m);
      activeMoment = { m, timeLeft: 6 };
    }
    if (activeMoment) {
      activeMoment.timeLeft -= dt;
      const { m } = activeMoment;
      const to = new THREE.Vector3(m.x, 0, m.z).sub(camera.position).setY(0);
      if (to.length() < 15 && to.normalize().dot(player.forward()) > 0.4) {
        log.awardOnce('moment', `moment-${m.id}`, m.label);
      }
      if (activeMoment.timeLeft <= 0) activeMoment = null;
    }

    updateInteractions();
    renderer.render(scene, camera);
  });
}
