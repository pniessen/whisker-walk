import * as THREE from 'three';
import { bus } from './events.js';
import { createPlayer } from './player.js';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { createBrain, PERSONALITIES } from './cat/brain.js';
import { createLeash, MAX_LEN } from './leash.js';
import * as neighborhood from './world/neighborhood.js';
import * as park from './world/park.js';
import * as seaside from './world/seaside.js';
import { createCritters } from './critters.js';
import { createStrayCats } from './straycats.js';
import { createToy } from './toy.js';
import { createQuest } from './quests.js';
import { createProgression } from './progression.js';
import { createDiscoveryLog } from './discoveries.js';
import { createHud } from './ui/hud.js';
import { createHomeBase } from './ui/homebase.js';
import { createAudio } from './audio.js';
import { createAlbum } from './album.js';
import { rollWeather, createWeather } from './weather.js';
import { rollSecrets, createSecrets } from './secrets.js';
import { puddle as puddleProp } from './world/builder.js';

const AREAS = { neighborhood, park, seaside };

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
  const album = createAlbum(window.localStorage);
  const log = createDiscoveryLog(progression);
  const hud = createHud();
  const audio = createAudio();
  const clock = new THREE.Clock();

  let session = null;

  const homebase = createHomeBase(progression, album, startWalk);
  homebase.show();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  bus.on('discovery', () => {
    hud.setPoints(progression.state.points);
    audio.chime();
  });
  bus.on('player:lockchange', ({ locked }) => {
    if (session) overlay.classList.toggle('hidden', locked);
    if (session && !locked) { session.cameraMode = false; hud.setCamera(false); }
  });
  bus.on('critter:scare', () => {
    if (session && session.brain.scare()) hud.toast('Woof! Your cat got spooked!');
    if (session) audio.bark();
  });
  bus.on('villager:wave', ({ id }) => {
    if (session && progression.state.equipped.outfit === 'bandana') {
      log.award('perk', `wave-${id}`, 'a friendly wave back');
    }
  });
  bus.on('cat:pounce', () => {
    if (session) log.award('perk', 'pounce', 'a perfect pounce!');
  });
  overlay.addEventListener('click', (e) => {
    if (e.target.id === 'btn-resume') canvas.requestPointerLock();
    if (e.target.id === 'btn-end') endWalk();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && session && player.locked) handleInteract(session);
    if (e.code === 'KeyM') hud.toast(audio.toggleMute() ? 'Sound off 🔇' : 'Sound on 🔊');
    if (e.code === 'KeyT' && session && player.locked && !session.toy.active) {
      session.toy.throwFrom(handPosition(), player.forward());
      session.toyPlay = { bats: 0, returning: false };
      session.brain.set('fetch', 14);
    }
    if (e.code === 'KeyC' && session && player.locked) {
      session.cameraMode = !session.cameraMode;
      hud.setCamera(session.cameraMode);
    }
  });
  document.addEventListener('mousedown', () => {
    if (session && player.locked && session.cameraMode) snapPhoto(session);
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

    const equipped = state.equipped;
    const duskActive = duskMode && equipped.collar === 'glow';

    if (duskActive) {
      const { top, horizon } = areaData.skyDusk;
      scene.background = new THREE.Color(top);
      scene.fog = new THREE.Fog(horizon, 30, 110);
      sun.intensity = 0.7;
    }

    let weather = { condition: 'clear', rainbowVisible: false, rainbowPos: null, update() {} };
    if (!duskActive) {
      weather = createWeather(scene, sun, rollWeather(Math.random), Math.random);
      if (weather.condition === 'rain') {
        // extra puddles
        const extra = [];
        for (let i = 0; i < 3; i++) {
          const px = areaData.bounds.minX / 2 + Math.random() * (areaData.bounds.maxX - areaData.bounds.minX) / 2;
          const pz = areaData.bounds.minZ / 2 + Math.random() * (areaData.bounds.maxZ - areaData.bounds.minZ) / 2;
          extra.push({ x: px, z: pz, r: 0.8 });
          scene.add(puddleProp(px, pz, 0.8));
        }
        areaData.puddles = [...areaData.puddles, ...extra];
        // birds shelter from rain: halve bird-type spawns
        let keep = false;
        areaData.critterSpawns = areaData.critterSpawns.filter((c) => {
          if (c.type !== 'bird' && c.type !== 'seagull') return true;
          keep = !keep;
          return keep;
        });
      }
    }

    const secretRolls = rollSecrets(Math.random, { eveningLight: duskActive || weather.condition === 'sunset' });
    const secrets = createSecrets(scene, areaData, secretRolls, Math.random);

    const critters = createCritters(scene, areaData.critterSpawns, {
      fleeScale: equipped.collar === 'bell' ? 0.5 : 1,        // bell: birds tolerate you closer
      spawnFireflies: duskActive,                              // glow: dusk fireflies
      trailButterflies: equipped.outfit === 'crown',           // crown: butterflies trail the cat
    });

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

    let questGiver = null;
    let quest = null;
    let questObject = null;
    const giver = critters.list.find((c) => c.type === 'villager');
    if (giver) {
      questGiver = giver;
      quest = createQuest(Math.random, areaData.pois);
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.4, 6),
        new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x6a5010 })
      );
      marker.rotation.x = Math.PI;
      marker.position.y = 2.1;
      giver.group.add(marker);
      questGiver.marker = marker;
      // quest object at the target, revealed on accept
      const t = quest.target;
      if (quest.type === 'kitten') {
        questObject = buildCat(['tabby', 'calico', 'black'][Math.floor(Math.random() * 3)]);
        questObject.scale.multiplyScalar(0.5);
      } else if (quest.type === 'letter') {
        questObject = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.25, 0),
          new THREE.MeshLambertMaterial({ color: 0xf2e04e, emissive: 0x8a7a20 })
        );
        questObject.position.y = 1;
      } else {
        questObject = new THREE.Group();
        for (const side of [-0.12, 0.12]) {
          const lens = new THREE.Mesh(
            new THREE.TorusGeometry(0.09, 0.02, 6, 12),
            new THREE.MeshLambertMaterial({ color: 0x4a4a52 })
          );
          lens.position.x = side;
          questObject.add(lens);
        }
        questObject.position.y = 0.15;
      }
      questObject.position.x = t.x;
      questObject.position.z = t.z;
      questObject.visible = false;
      scene.add(questObject);
    }

    const strayCats = createStrayCats(scene, areaData, 3);
    const toy = createToy(scene);

    session = {
      scene, areaData, cat, critters, strayCats, collectibleMeshes, duskMode,
      weather,
      secrets, lastPlayerPos: new THREE.Vector3().copy(camera.position),
      quest, questGiver, questObject,
      brain: createBrain(state.equipped.cat),
      leash: createLeash(scene),
      catVelocity: new THREE.Vector3(),
      walk: { carried: 0, carryCap: equipped.outfit === 'backpack' ? 3 : 2 },
      momentTimer: 40,
      activeMoment: null,
      prompt: null,
      balkedPuddles: new Set(),
      toy, toyPlay: { bats: 0, returning: false },
      cameraMode: false,
    };

    log.startWalk();
    hud.show();
    hud.setArea(areaData.name);
    hud.setPoints(state.points);
    homebase.hide();
    overlay.innerHTML = `<div class="pause-card"><h1>Ready?</h1>
      <button id="btn-resume">Start walking (click)</button>
      <button id="btn-end">End walk &amp; head home</button>
      <p class="controls-hint">Arrows move · mouse looks · E interact · T toy · C camera · M mute</p></div>`;
    overlay.classList.remove('hidden');
    player.enable();

    audio.meow();
    audio.startAmbient(state.area);
  }

  function endWalk() {
    if (!session) return;
    progression.completeWalk();
    session.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) m.dispose();
      }
    });
    session.critters.dispose();
    session.strayCats.dispose();
    session = null;
    player.disable();
    hud.hide();
    hud.setPrompt(null);
    hud.setObjective(null);
    hud.setCamera(false);
    overlay.classList.add('hidden');
    homebase.show();
    audio.stopAmbient();
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
    ) || !!s.strayCats.nearest(cat.position, p.sniffRange);
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
    } else if (state === 'fetch') {
      if (!s.toy.active) {
        brain.set('follow', 2);
      } else {
        target = s.toy.mesh.position.clone();
        if (cat.position.distanceTo(s.toy.mesh.position) < 0.6) {
          if (s.toyPlay.bats < 2) {
            s.toyPlay.bats += 1;
            s.toy.bat(cat.position);
          } else if (p.special === 'pouncer' || p.special === 'chaser') {
            s.toyPlay.returning = true;
            s.toy.nudgeToward(camera.position, dt);
          } else {
            brain.set('follow', 3); // lost interest — ball stays put
          }
        }
        if (s.toyPlay.returning && s.toy.mesh.position.distanceTo(camera.position) < 2) {
          log.award('play', 'fetch', 'a perfect fetch!');
          audio.purr();
          s.toy.retrieve();
          brain.set('follow', 3);
        }
      }
    }

    const desired = new THREE.Vector3();
    if (target) {
      desired.copy(target).sub(cat.position).setY(0);
      if (desired.length() > 0.4) desired.normalize().multiplyScalar(p.speed * (state === 'scared' ? 1.8 : 1));
      else desired.set(0, 0, 0);
    }
    if (tension > 1 && state !== 'fetch') desired.add(toPlayer.normalize().multiplyScalar((tension - 1) * 20));

    s.catVelocity.lerp(desired, 1 - Math.pow(0.001, dt));
    cat.position.addScaledVector(s.catVelocity, dt);
    cat.position.y = 0;
    const speed = s.catVelocity.length();
    if (speed > 0.15) cat.rotation.y = Math.atan2(s.catVelocity.x, s.catVelocity.z) + Math.PI;
    animateCat(cat, state, t, speed);
    if (progression.state.equipped.collar === 'bell' && speed > 1 && Math.random() < dt * 1.6) {
      audio.bell();
    }

    for (const pd of s.areaData.puddles) {
      const inPuddle = Math.hypot(pd.x - cat.position.x, pd.z - cat.position.z) < pd.r + 0.2;
      if (!inPuddle) continue;
      const key = `puddle-${pd.x}-${pd.z}`;
      if (progression.state.equipped.outfit === 'booties') {
        log.awardOnce('perk', key, 'a joyful puddle splash');
      } else if (p.special !== 'steady' && !s.balkedPuddles.has(key)) {
        s.balkedPuddles.add(key);
        brain.set('follow', 2);
        hud.toast('Your cat balks at the puddle! 💦');
      }
    }

    if (state === 'distracted') {
      const caught = s.critters.catchAt(cat.position.clone().setY(0.8));
      if (caught && p.special === 'pouncer') bus.emit('cat:pounce', { critter: caught });
    }

    const leashTension = s.leash.update(
      handPosition(),
      cat.position.clone().add(new THREE.Vector3(0, 0.4, 0))
    );
    player.speedFactor = leashTension > 0.9 ? Math.max(0.35, 1 - (leashTension - 0.9) * (p.pull / 4)) : 1;
    if (state === 'fetch') player.speedFactor = 1; // no drag while playing fetch
  }

  function updateInteractions(s) {
    if (s.quest?.state === 'active' && s.quest.type === 'glasses' && s.questObject) {
      s.questObject.visible = Math.hypot(
        s.quest.target.x - camera.position.x, s.quest.target.z - camera.position.z
      ) < 10;
    }
    const reveal = PERSONALITIES[s.cat.userData.breed].special === 'keenNose' ? 14 : 7;
    for (const [id, m] of s.collectibleMeshes) {
      const c = s.areaData.collectibles.find((x) => x.id === id);
      m.visible = Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < reveal;
    }
    for (const c of s.critters.list) {
      if (!c.spottable || c.fleeing) continue;
      const to = c.group.position.clone().sub(camera.position).setY(0);
      if (to.length() < 6 && to.normalize().dot(player.forward()) > 0.5) {
        log.awardOnce('critter', `spot-${c.id}`, labelFor(c.type));
      }
    }
    for (const stray of s.strayCats.strays) {
      const to = stray.group.position.clone().sub(camera.position).setY(0);
      if (to.length() < 6 && to.normalize().dot(player.forward()) > 0.5) {
        log.awardOnce('critter', `spot-${stray.id}`, 'a wandering stray cat');
      }
    }
    for (const sec of s.secrets.list) {
      if (!sec.group.visible) continue;
      const to = sec.group.position.clone().sub(camera.position).setY(0);
      if (to.length() < sec.spotRange && to.normalize().dot(player.forward()) > 0.5) {
        log.awardOnce(sec.award, sec.key, sec.label);
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
    if (!s.prompt && s.quest && s.questGiver) {
      if (s.quest.state === 'offered' &&
          s.questGiver.group.position.distanceTo(camera.position) < 2.5) {
        s.prompt = { kind: 'quest-accept' };
        hud.setPrompt('E — talk to the neighbor');
      } else if (s.quest.state === 'active' &&
          Math.hypot(s.quest.target.x - camera.position.x, s.quest.target.z - camera.position.z) < 2) {
        s.prompt = { kind: 'quest-complete' };
        hud.setPrompt(s.quest.texts.prompt);
      }
    }
    if (!s.prompt) {
      const stray = s.strayCats.nearest(camera.position, 2.5, { ungreetedOnly: true });
      if (stray) {
        s.prompt = { kind: 'stray', data: stray };
        hud.setPrompt('E — greet the stray cat');
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
    } else if (s.prompt.kind === 'quest-accept') {
      s.quest.accept();
      hud.toast(s.quest.texts.offer);
      hud.setObjective(s.quest.texts.objective);
      if (s.questObject) s.questObject.visible = true;
      if (s.questGiver.marker) s.questGiver.marker.visible = false;
    } else if (s.prompt.kind === 'quest-complete') {
      if (s.quest.tryComplete(camera.position)) {
        log.award('quest', 'quest', s.quest.texts.done);
        hud.setObjective(null);
        if (s.questObject) s.questObject.visible = false;
      }
    } else if (s.prompt.kind === 'stray') {
      const stray = s.prompt.data;
      s.strayCats.greet(stray, camera.position);
      log.awardOnce('friend', `friend-${stray.id}`, 'a new cat friend');
      audio.meow();
    } else if (s.prompt.kind === 'pet') {
      const wasNapping = s.brain.state === 'nap';
      if (s.brain.pet()) {
        log.award('pet', 'pet', 'a rumbling purr');
        audio.purr();
        if (wasNapping && PERSONALITIES[s.cat.userData.breed].special === 'napper') {
          log.award('perk', 'nap-pet', 'a deep sleepy purr');
        }
      }
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

  function findPhotoSubject(s) {
    const candidates = [];
    for (const c of s.critters.list) {
      if (c.spottable && !c.fleeing) candidates.push({ key: `critter-${c.type}`, label: labelFor(c.type), pos: c.group.position });
    }
    for (const st of s.strayCats.strays) candidates.push({ key: 'stray', label: 'a stray cat', pos: st.group.position });
    for (const sec of s.secrets?.list ?? []) {
      if (sec.group.visible) candidates.push({ key: sec.key, label: sec.label, pos: sec.group.position });
    }
    if (s.activeMoment) {
      candidates.push({ key: `moment-${s.activeMoment.m.id}`, label: s.activeMoment.m.label, pos: new THREE.Vector3(s.activeMoment.m.x, 0, s.activeMoment.m.z) });
    }
    for (const sc of s.areaData.scenics) candidates.push({ key: `scenic-${sc.id}`, label: sc.label, pos: new THREE.Vector3(sc.x, 0, sc.z) });
    let best = null;
    let bestDot = 0.75;
    for (const c of candidates) {
      const to = c.pos.clone().sub(camera.position).setY(0);
      if (to.length() > 12) continue;
      const dot = to.normalize().dot(player.forward());
      if (dot > bestDot) { bestDot = dot; best = c; }
    }
    return best;
  }

  function snapPhoto(s) {
    audio.shutter();
    const subject = findPhotoSubject(s);
    if (!subject) {
      hud.toast('Just scenery… get closer to something!');
      return;
    }
    renderer.render(s.scene, camera);
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 160;
    thumbCanvas.height = 120;
    thumbCanvas.getContext('2d').drawImage(renderer.domElement, 0, 0, 160, 120);
    const first = album.add({
      key: subject.key, label: subject.label, area: s.areaData.name,
      thumb: thumbCanvas.toDataURL('image/jpeg', 0.6),
    });
    hud.toast(`📸 ${subject.label}`);
    if (first) log.awardOnce('photo', `photo-${subject.key}`, `your first photo of ${subject.label}`);
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
    if (player.locked) {
      player.update(dt, session.areaData.colliders, session.areaData.bounds);
      session.critters.update(dt, t, camera.position, session.cat.position);
      session.strayCats.update(dt, t);
      session.toy.update(dt, session.areaData.bounds);
      session.weather.update(dt, camera.position);
      const playerSpeed = camera.position.distanceTo(session.lastPlayerPos) / Math.max(dt, 0.001);
      session.lastPlayerPos.copy(camera.position);
      session.secrets.update(dt, t, camera.position, playerSpeed);
      if (session.weather.rainbowVisible) {
        const to = new THREE.Vector3(session.weather.rainbowPos.x, 0, session.weather.rainbowPos.z).sub(camera.position).setY(0);
        if (to.normalize().dot(player.forward()) > 0.6) {
          log.awardOnce('rainbow', 'rainbow', 'a rainbow after the rain! 🌈');
        }
      }
      if (session.toy.active &&
          (session.toy.idleTime > 15 ||
           (session.toy.idleTime > 0.5 && session.toy.mesh.position.distanceTo(camera.position) < 1.2))) {
        session.toy.retrieve(); // walked over it, or everyone lost interest
      }
      updateCat(session, dt, t);
      updateInteractions(session);
      updateMoments(session, dt);
      if (session.questGiver?.marker?.visible) {
        session.questGiver.marker.position.y = 2.1 + Math.sin(t * 3) * 0.12;
      }
    }
    renderer.render(session.scene, camera);
  });
}
