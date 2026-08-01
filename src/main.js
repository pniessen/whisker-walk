import * as THREE from 'three';
import { bus } from './events.js';
import { createPlayer } from './player.js';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { createBrain, PERSONALITIES } from './cat/brain.js';
import { createLeash, MAX_LEN } from './leash.js';
import * as neighborhood from './world/neighborhood.js';
import * as park from './world/park.js';
import { createCritters } from './critters.js';
import { createProgression } from './progression.js';
import { createDiscoveryLog } from './discoveries.js';
import { createHud } from './ui/hud.js';
import { createHomeBase } from './ui/homebase.js';

const AREAS = { neighborhood, park }; // seaside (Task 13) registers here

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  renderer = null;
}

if (!renderer) {
  overlay.classList.remove('hidden');
  overlay.innerHTML =
    '<div class="pause-card"><p>Sorry — your browser could not start WebGL, which Whisker Walk needs. Try updating your browser or enabling hardware acceleration.</p></div>';
} else {
  init();
}

function init() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
  const player = createPlayer(camera, canvas);
  const progression = createProgression(window.localStorage);
  const log = createDiscoveryLog(progression);
  const hud = createHud();
  const clock = new THREE.Clock();

  let session = null;

  const homebase = createHomeBase(progression, startWalk);
  homebase.show();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  bus.on('discovery', () => hud.setPoints(progression.state.points));
  bus.on('player:lockchange', ({ locked }) => {
    if (session) overlay.classList.toggle('hidden', locked);
  });
  bus.on('critter:scare', () => {
    if (session && session.brain.scare()) hud.toast('Woof! Your cat got spooked!');
  });
  overlay.addEventListener('click', (e) => {
    if (e.target.id === 'btn-resume') canvas.requestPointerLock();
    if (e.target.id === 'btn-end') endWalk();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && session) handleInteract(session);
  });

  function startWalk({ duskMode = false } = {}) {
    const state = progression.state;
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(30, 50, 20);
    scene.add(sun, new THREE.AmbientLight(0xbfd8ff, 0.9));

    const areaData = AREAS[state.area].build(scene);
    camera.position.set(areaData.spawn.x, 1.6, areaData.spawn.z);

    const cat = buildCat(state.equipped.cat, {
      collar: state.equipped.collar,
      outfit: state.equipped.outfit,
    });
    cat.position.set(areaData.spawn.x + 1, 0, areaData.spawn.z - 2);
    scene.add(cat);

    const critters = createCritters(scene, areaData.critterSpawns, {});

    const collectibleMeshes = new Map();
    for (const c of areaData.collectibles) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xf25c8a, emissive: 0x5a1a30 })
      );
      m.position.set(c.x, 0.2, c.z);
      scene.add(m);
      collectibleMeshes.set(c.id, m);
    }

    session = {
      scene, areaData, cat, critters, collectibleMeshes, duskMode,
      brain: createBrain(state.equipped.cat),
      leash: createLeash(scene),
      catVelocity: new THREE.Vector3(),
      walk: { carried: 0, carryCap: 2 },
      momentTimer: 40,
      activeMoment: null,
      prompt: null,
    };

    log.startWalk();
    hud.show();
    hud.setArea(areaData.name);
    hud.setPoints(state.points);
    homebase.hide();
    overlay.innerHTML = `<div class="pause-card"><h1>Ready?</h1>
      <button id="btn-resume">Start walking (click)</button>
      <button id="btn-end">End walk &amp; head home</button></div>`;
    overlay.classList.remove('hidden');
    player.enable();
  }

  function endWalk() {
    if (!session) return;
    progression.completeWalk();
    session.critters.dispose();
    session = null;
    player.disable();
    hud.hide();
    hud.setPrompt(null);
    overlay.classList.add('hidden');
    homebase.show();
  }

  function handPosition() {
    const hand = player.forward().multiplyScalar(0.3);
    hand.add(camera.position).add(new THREE.Vector3(0, -0.5, 0));
    return hand;
  }

  function updateCat(s, dt, t) {
    const { cat, brain } = s;
    const p = PERSONALITIES[cat.userData.breed];
    const toPlayer = camera.position.clone().sub(cat.position).setY(0);
    const tension = toPlayer.length() / MAX_LEN;

    const nearCritter = s.critters.nearest(cat.position, 8);
    const nearPoi = s.areaData.pois.some(
      (poi) => Math.hypot(poi.x - cat.position.x, poi.z - cat.position.z) < p.sniffRange
    );
    brain.update(dt, { leashTension: tension, critterNearby: !!nearCritter, poiNearby: nearPoi });

    let target = null;
    const state = brain.state;
    if (state === 'follow' || state === 'scared') {
      target = camera.position.clone()
        .add(player.forward().multiplyScalar(2))
        .add(player.forward().clone().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(0.8));
    } else if (state === 'distracted') {
      if (nearCritter) target = nearCritter.group.position.clone();
      else brain.set('follow', 2);
    }

    const desired = new THREE.Vector3();
    if (target) {
      desired.copy(target).sub(cat.position).setY(0);
      if (desired.length() > 0.4) desired.normalize().multiplyScalar(p.speed * (state === 'scared' ? 1.8 : 1));
      else desired.set(0, 0, 0);
    }
    if (tension > 1) desired.add(toPlayer.normalize().multiplyScalar((tension - 1) * 20));

    s.catVelocity.lerp(desired, 1 - Math.pow(0.001, dt));
    cat.position.addScaledVector(s.catVelocity, dt);
    cat.position.y = 0;
    const speed = s.catVelocity.length();
    if (speed > 0.15) cat.rotation.y = Math.atan2(s.catVelocity.x, s.catVelocity.z) + Math.PI;
    animateCat(cat, state, t, speed);

    if (state === 'distracted') {
      const caught = s.critters.catchAt(cat.position.clone().setY(0.8));
      if (caught && p.special === 'pouncer') bus.emit('cat:pounce', { critter: caught });
    }

    const leashTension = s.leash.update(
      handPosition(),
      cat.position.clone().add(new THREE.Vector3(0, 0.4, 0))
    );
    player.speedFactor = leashTension > 0.9 ? Math.max(0.35, 1 - (leashTension - 0.9) * (p.pull / 4)) : 1;
  }

  function updateInteractions(s) {
    for (const c of s.critters.list) {
      if (!c.spottable || c.fleeing) continue;
      const to = c.group.position.clone().sub(camera.position).setY(0);
      if (to.length() < 6 && to.normalize().dot(player.forward()) > 0.5) {
        log.awardOnce('critter', `spot-${c.id}`, labelFor(c.type));
      }
    }
    s.prompt = null;
    for (const c of s.areaData.collectibles) {
      if (!s.collectibleMeshes.has(c.id)) continue;
      if (Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 1.6) {
        s.prompt = { kind: 'collect', data: c };
        hud.setPrompt(s.walk.carried >= s.walk.carryCap
          ? 'Paws full! (carry limit reached)'
          : `E — pick up ${c.label}`);
      }
    }
    if (!s.prompt && (s.brain.state === 'requestPet' || s.brain.state === 'nap') &&
        s.cat.position.distanceTo(camera.position) < 2.8) {
      s.prompt = { kind: 'pet' };
      hud.setPrompt(s.brain.state === 'nap' ? 'E — pet the sleepy cat' : 'E — your cat wants pets!');
    }
    if (!s.prompt) hud.setPrompt(null);

    for (const sc of s.areaData.scenics) {
      if (Math.hypot(sc.x - camera.position.x, sc.z - camera.position.z) < 4) {
        log.awardOnce('scenic', `scenic-${sc.id}`, sc.label);
      }
    }
  }

  function handleInteract(s) {
    if (!s.prompt) return;
    if (s.prompt.kind === 'collect' && s.walk.carried < s.walk.carryCap) {
      const c = s.prompt.data;
      s.scene.remove(s.collectibleMeshes.get(c.id));
      s.collectibleMeshes.delete(c.id);
      s.walk.carried += 1;
      log.awardOnce('collectible', `col-${c.id}`, c.label);
    } else if (s.prompt.kind === 'pet' && s.brain.pet()) {
      log.award('pet', 'pet', 'a rumbling purr');
    }
  }

  function updateMoments(s, dt) {
    s.momentTimer -= dt;
    if (s.momentTimer <= 0 && s.areaData.moments.length) {
      s.momentTimer = 45 + Math.random() * 30;
      const m = s.areaData.moments[Math.floor(Math.random() * s.areaData.moments.length)];
      s.critters.playMoment(m);
      s.activeMoment = { m, timeLeft: 6 };
    }
    if (s.activeMoment) {
      s.activeMoment.timeLeft -= dt;
      const { m } = s.activeMoment;
      const to = new THREE.Vector3(m.x, 0, m.z).sub(camera.position).setY(0);
      if (to.length() < 15 && to.normalize().dot(player.forward()) > 0.4) {
        log.awardOnce('moment', `moment-${m.id}`, m.label);
      }
      if (s.activeMoment.timeLeft <= 0) s.activeMoment = null;
    }
  }

  function labelFor(type) {
    return {
      bird: 'a songbird', squirrel: 'a busy squirrel', butterfly: 'a butterfly',
      duck: 'a paddling duck', seagull: 'a seagull', crab: 'a sideways crab',
      dog: 'the neighbor’s dog', villager: 'a friendly neighbor',
      firefly: 'a glowing firefly',
    }[type] ?? 'something interesting';
  }

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!session) return;
    player.update(dt, session.areaData.colliders, session.areaData.bounds);
    session.critters.update(dt, t, camera.position, session.cat.position);
    updateCat(session, dt, t);
    updateInteractions(session);
    updateMoments(session, dt);
    renderer.render(session.scene, camera);
  });
}
