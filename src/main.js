import * as THREE from 'three';
import { bus } from './events.js';
import { createPlayer } from './player.js';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { PERSONALITIES } from './cat/brain.js';
import * as neighborhood from './world/neighborhood.js';
import * as park from './world/park.js';
import * as seaside from './world/seaside.js';
import { createCritters } from './critters.js';
import { createStrayCats } from './straycats.js';
import { createTippables } from './tippables.js';
import { createScent } from './scent.js';
import { createToy } from './toy.js';
import { createQuest } from './quests.js';
import { createProgression, rankFor } from './progression.js';
import { createGoals } from './goals.js';
import { createDiscoveryLog } from './discoveries.js';
import { createHud } from './ui/hud.js';
import { createHomeBase } from './ui/homebase.js';
import { createAudio } from './audio.js';
import { createAlbum } from './album.js';
import { rollWeather, createWeather } from './weather.js';
import { rollSecrets, createSecrets } from './secrets.js';
import { puddle as puddleProp } from './world/builder.js';
import { cameraOffset } from './catcam.js';
import { mulberry32 } from './rng.js';

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
  const player = createPlayer(camera, canvas);
  const progression = createProgression(window.localStorage);
  const album = createAlbum(window.localStorage);
  const log = createDiscoveryLog(progression);
  const hud = createHud();
  const audio = createAudio();
  // Hagrid is a chicken; chickens cluck
  const catVoice = () => (session && session.cat.userData.breed === 'hagrid' ? audio.cluck() : audio.meow());
  const clock = new THREE.Clock();

  let session = null;

  const homebase = createHomeBase(progression, album, startWalk);
  homebase.show();

  function noteGoal(type) {
    if (!session?.goals) return;
    const res = session.goals.note(type);
    hud.setGoals(session.goals.goals);
    if (res.completed) log.award('goal', `goal-${res.completed.id}`, `goal complete: ${res.completed.text}`);
    if (res.jackpot) log.award('jackpot', 'jackpot', 'ALL GOALS COMPLETE! 🎯');
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  bus.on('discovery', ({ type }) => {
    hud.setPoints(progression.state.points);
    audio.chime();
    if (session && type !== 'goal' && type !== 'jackpot') session.discoveryCount += 1;
    noteGoal(type);
    if (session) {
      const r = rankFor(progression.state.lifetimePoints).title;
      if (r !== session.rankTitle) {
        session.rankTitle = r;
        hud.setRank(r);
        hud.toast(`RANK UP — ${r}! 🏆`);
      }
    }
  });
  bus.on('player:lockchange', ({ locked }) => {
    if (session) overlay.classList.toggle('hidden', locked);
    if (session && !locked) { session.cameraMode = false; hud.setCamera(false); }
  });
  bus.on('critter:scare', () => {
    if (!session) return;
    audio.bark();
    const special = PERSONALITIES[session.cat.userData.breed].special;
    if (special !== 'fearless' && special !== 'steady') {
      session.freezeTime = 1.5;
      player.halt(); // frozen means frozen — no sliding
      hud.toast('Woof! You froze on the spot! 🙀');
    }
  });
  bus.on('villager:wave', ({ id }) => {
    if (session && progression.state.equipped.outfit === 'bandana') {
      log.award('perk', `wave-${id}`, 'a friendly wave back');
    }
  });
  overlay.addEventListener('click', (e) => {
    if (e.target.id === 'btn-resume') canvas.requestPointerLock();
    if (e.target.id === 'btn-end') endWalk();
    if (e.target.id === 'btn-summary-continue') {
      overlay.classList.add('hidden');
      homebase.show();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && session && player.locked && !e.repeat) {
      if (session.prompt) handleInteract(session);
      else {
        session.sniffTime = 1;
        const range = PERSONALITIES[session.cat.userData.breed].special === 'keenNose' ? 30 : 18;
        const found = session.scent.sniff(session.cat.position, range);
        hud.toast(found ? 'You smell something… follow the paw prints! 👃' : 'Nothing on the breeze.');
      }
    }
    if (e.code === 'KeyV' && session && player.locked && !e.repeat) {
      catVoice();
      session.critters.reactToMeow(session.cat.position);
      if (session.strayCats.reactToMeow(session.cat.position) > 0) {
        setTimeout(() => { if (session) audio.meow(); }, 350); // a reply from a friend
      }
    }
    if (e.code === 'KeyM') hud.toast(audio.toggleMute() ? 'Sound off 🔇' : 'Sound on 🔊');
    if (e.code === 'KeyT' && session && player.locked) {
      if (!session.toy.active) {
        // drop the yarn ball just ahead and give it a little kick to chase
        const drop = session.cat.position.clone()
          .add(player.forward().multiplyScalar(0.8))
          .setY(0.8);
        session.toy.throwFrom(drop, player.forward(), 2.5);
        session.batCount = 0;
        session.batReady = true;
      } else if (session.toy.mesh.position.distanceTo(session.cat.position) < 1.4) {
        session.toy.retrieve();
        hud.toast('Yarn ball pocketed 🧶');
      } else {
        hud.toast('Go grab your yarn ball first!');
      }
    }
    if (e.code === 'Space' && session && player.locked && !e.repeat &&
        !session.cameraMode && session.freezeTime <= 0) {
      if (session.perched) {
        session.perched = null;                    // hop down
        player.perchY = 0;
      } else {
        const perch = (session.areaData.perches ?? []).find((pp) => {
          // high perches (car roofs etc.) sit at a collider's own center, so the
          // cat is always held out to collider.r + 0.35 — give those a longer
          // reach so climbing them is actually possible from outside the footprint.
          const reach = pp.y > 1 ? 2.6 : 1.2;
          return Math.hypot(pp.x - session.cat.position.x, pp.z - session.cat.position.z) < reach;
        });
        if (perch) {
          session.perched = perch;
          player.perchY = perch.y;
          player.halt();
          session.cat.position.set(perch.x, perch.y, perch.z);
          catVoice();
          if (perch.vantage) log.awardOnce('scenic', `perch-${perch.label}`, perch.label);
        } else if (session.pounceCooldown <= 0) {
          player.pounce();
          session.pounceTime = 0.3;
          session.pounceCooldown = 1.2;
        }
      }
    }
    if (e.code === 'KeyC' && session && player.locked) {
      session.cameraMode = !session.cameraMode;
      hud.setCamera(session.cameraMode);
    }
  });
  document.addEventListener('mousedown', () => {
    if (session && player.locked && session.cameraMode) snapPhoto(session);
  });

  function startWalk({ duskMode = false, roomSeed } = {}) {
    const walkRng = roomSeed !== undefined ? mulberry32(roomSeed) : Math.random;
    const state = progression.state;
    const walkStamp = 'walk-' + Date.now();
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(30, 50, 20);
    scene.add(sun, new THREE.AmbientLight(0xbfd8ff, 0.9));

    const areaData = AREAS[state.area].build(scene);

    const cat = buildCat(state.equipped.cat, {
      collar: state.equipped.collar,
      outfit: state.equipped.outfit,
    });
    cat.position.set(areaData.spawn.x, 0, areaData.spawn.z);
    cat.rotation.y = 0; // rotation 0 faces -z, into the area
    scene.add(cat);
    // your pace IS the world's pace: breed speed sets how fast anything scrolls
    const pace = 2.2 + PERSONALITIES[state.equipped.cat].speed * 0.8;
    player.setAvatar(cat, pace);
    camera.position.copy(cat.position).add(cameraOffset(0, 0.18));
    camera.lookAt(cat.position.x, 0.6, cat.position.z);

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
      weather = createWeather(scene, sun, rollWeather(walkRng), walkRng);
      if (weather.condition === 'rain') {
        // extra puddles
        const extra = [];
        for (let i = 0; i < 3; i++) {
          const px = areaData.bounds.minX / 2 + walkRng() * (areaData.bounds.maxX - areaData.bounds.minX) / 2;
          const pz = areaData.bounds.minZ / 2 + walkRng() * (areaData.bounds.maxZ - areaData.bounds.minZ) / 2;
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

    const secretRolls = rollSecrets(walkRng, { eveningLight: duskActive || weather.condition === 'sunset' });
    const secrets = createSecrets(scene, areaData, secretRolls, walkRng);

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
      quest = createQuest(walkRng, areaData.pois);
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

    const strayCats = createStrayCats(scene, areaData, 22, walkRng);
    if (roomSeed === undefined) {
      for (const stray of strayCats.strays) {
        if (progression.friendLevel(stray.name) === 'best' && Math.random() < 0.3) stray.hasGift = true;
      }
    }
    const toy = createToy(scene);
    const tippables = createTippables(scene, areaData.tippables ?? []);
    const scent = createScent(scene, areaData, walkRng);

    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.far = 160;
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const goals = createGoals(walkRng);

    session = {
      scene, areaData, cat, critters, strayCats, collectibleMeshes, duskMode,
      walkStamp,
      goals,
      startPoints: state.points,
      discoveryCount: 0,
      catsGreeted: 0,
      rankTitle: rankFor(state.lifetimePoints).title,
      weather,
      secrets,
      tippables,
      scent,
      quest, questGiver, questObject,
      walk: { carried: 0, carryCap: equipped.outfit === 'backpack' ? 3 : 2 },
      momentTimer: 40,
      activeMoment: null,
      prompt: null,
      balkedPuddles: new Set(),
      toy, batCount: 0, batReady: true,
      cameraMode: false,
      idleTime: 0,
      freezeTime: 0,
      boxTime: 0,
      perched: null,
      pounceTime: 0,
      pounceCooldown: 0,
      pose: 'follow',
      stretchTime: 0,
      sniffTime: 0,
    };

    log.startWalk();
    hud.show();
    hud.setArea(areaData.name);
    hud.setPoints(state.points);
    hud.setRank(session.rankTitle);
    hud.setGoals(goals.goals);
    homebase.hide();
    overlay.innerHTML = `<div class="pause-card"><h1>Ready?</h1>
      <button id="btn-resume">Start exploring (click)</button>
      <button id="btn-end">End walk &amp; head home</button>
      <p class="controls-hint">Arrows move · Shift stalk · Space pounce/climb · E interact/sniff · V meow · T yarn · C camera</p></div>`;
    overlay.classList.remove('hidden');
    player.enable();

    catVoice();
    audio.startAmbient(state.area);
  }

  function endWalk() {
    if (!session) return;
    progression.completeWalk();

    // compute summary numbers while the session is still live
    const earned = progression.state.points - session.startPoints;
    const goalsDone = session.goals.goals.filter((g) => g.done).length;
    const isRecord = progression.recordWalkScore(earned);
    const discoveries = session.discoveryCount;
    const friendsGreeted = session.catsGreeted;
    const summaryHtml = `<div class="summary-card">
      <h1>Walk complete!</h1>
      ${isRecord
        ? '<div class="record-banner">NEW BEST WALK! 🏆</div>'
        : `<div class="best-line">best walk: ${progression.state.bestWalk} 🐾</div>`}
      <div class="summary-stats">
        <div class="stat"><span class="stat-value">${earned}</span><span class="stat-label">whisker points</span></div>
        <div class="stat"><span class="stat-value">${discoveries}</span><span class="stat-label">discoveries</span></div>
        <div class="stat"><span class="stat-value">${friendsGreeted}</span><span class="stat-label">cats greeted</span></div>
        <div class="stat"><span class="stat-value">${goalsDone}/3</span><span class="stat-label">goals complete</span></div>
      </div>
      <button id="btn-summary-continue" class="primary">Continue</button>
    </div>`;

    session.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
          if (m.map) m.map.dispose(); // Material.dispose() doesn't cascade to textures
          m.dispose();
        }
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
    hud.setGoals(null);

    overlay.innerHTML = summaryHtml;
    overlay.classList.remove('hidden');
    audio.stopAmbient();
  }

  function updateAvatar(s, dt, t) {
    const { cat } = s;
    const p = PERSONALITIES[cat.userData.breed];

    if (s.perched && player.inputActive) {
      s.perched = null;
      player.perchY = 0;
    }
    s.critters.setFleeModifier((s.perched || player.stalking ? 0.5 : 1) * (p.special === 'bird' ? 0.15 : 1));

    if (s.freezeTime > 0) s.freezeTime -= dt;
    player.speedFactor = (s.freezeTime > 0 || s.perched) ? 0 : player.stalking ? 0.45 : 1;
    if (s.pounceTime > 0) s.pounceTime -= dt;
    if (s.pounceCooldown > 0) s.pounceCooldown -= dt;

    const speed = player.speed;
    if (speed > 0.3) s.idleTime = 0;
    else s.idleTime += dt;

    // idle charm: stand still and you groom, then sit, then curl up
    const napper = p.special === 'napper';
    const groomAt = napper ? 3 : 6;
    const sitAt = napper ? 5 : 10;
    const napAt = napper ? 8 : 16;

    if (s.stretchTime > 0) s.stretchTime -= dt;
    if (s.sniffTime > 0) s.sniffTime -= dt;
    const wasNapping = s.pose === 'nap';
    let pose = 'follow';
    if (s.freezeTime > 0) pose = 'scared';
    else if (s.pounceTime > 0) pose = 'pounce';
    else if (s.perched) pose = 'perch';
    else if (s.boxTime > 1) pose = 'requestPet';
    else if (s.stretchTime > 0) pose = 'stretch';
    else if (s.sniffTime > 0) pose = 'sniff';
    else if (speed > 0.3 && (player.stalking ?? false)) pose = 'stalk';
    else if (s.idleTime > napAt) pose = 'nap';
    else if (s.idleTime > sitAt) pose = 'requestPet';
    else if (s.idleTime > groomAt) pose = 'groom';
    if (wasNapping && pose !== 'nap' && s.stretchTime <= 0) {
      s.stretchTime = 1; // wake-up stretch
      pose = 'stretch';
    }
    s.pose = pose;
    animateCat(cat, pose, t, speed);

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
        s.freezeTime = Math.max(s.freezeTime, 0.8); // don't shorten a dog-scare freeze
        hud.toast('Brrr — cold paws! 💦');
      }
    }

    // if I fits, I sits
    const inBox = (s.areaData.boxes ?? []).findIndex(
      (bx) => Math.hypot(bx.x - cat.position.x, bx.z - cat.position.z) < 0.35
    );
    if (inBox >= 0 && speed < 0.3 && !s.perched) {
      s.boxTime += dt;
      if (s.boxTime > 1) log.awardOnce('sits', `box-${inBox}`, 'a perfect box fit 📦');
    } else {
      s.boxTime = 0;
    }

    // yarn play: run into your ball to bat it; a good play session earns points
    if (s.toy.active) {
      const dist = cat.position.distanceTo(s.toy.mesh.position);
      if (dist < 0.5 && s.batReady) {
        s.toy.bat(cat.position);
        s.batCount += 1;
        s.batReady = false;
        if (s.batCount === 4) log.awardOnce('play', 'play', 'a very good play session');
      } else if (dist > 1.1) {
        s.batReady = true;
      }
      if (s.toy.idleTime > 25) {
        s.toy.retrieve();
        hud.toast('Your yarn ball rolled back to your pocket 🧶');
      }
    }

    // pouncing mid-dash catches butterflies and fireflies
    if (s.pounceTime > 0) {
      const caught = s.critters.catchAt(cat.position.clone().setY(0.8));
      if (caught) {
        log.award('perk', 'catch', 'a mid-air catch!');
        if (p.special === 'pouncer') log.award('perk', 'pouncer-catch', 'a Calico masterclass');
      }
    }
  }

  function updateInteractions(s) {
    const catP = s.cat.position;
    if (s.quest?.state === 'active' && s.quest.type === 'glasses' && s.questObject) {
      s.questObject.visible = Math.hypot(
        s.quest.target.x - catP.x, s.quest.target.z - catP.z
      ) < 10;
    }
    const reveal = PERSONALITIES[s.cat.userData.breed].special === 'keenNose' ? 14 : 7;
    for (const [id, m] of s.collectibleMeshes) {
      const c = s.areaData.collectibles.find((x) => x.id === id);
      m.visible = Math.hypot(c.x - catP.x, c.z - catP.z) < reveal;
    }
    for (const c of s.critters.list) {
      if (!c.spottable || c.fleeing) continue;
      const to = c.group.position.clone().sub(catP).setY(0);
      if (to.length() < 6 && to.normalize().dot(player.forward()) > 0.5) {
        log.awardOnce('critter', `spot-${c.id}`, labelFor(c.type));
      }
    }
    for (const stray of s.strayCats.strays) {
      const to = stray.group.position.clone().sub(catP).setY(0);
      if (to.length() < 6 && to.normalize().dot(player.forward()) > 0.5) {
        log.awardOnce('critter', `spot-${stray.id}`, 'a wandering stray cat');
      }
      if (stray.hasGift && stray.group.position.distanceTo(catP) < 3) {
        log.awardOnce('gift', 'gift-' + stray.name, stray.name + ' brought you a gift! 🎁');
        stray.hasGift = false;
      }
    }
    for (const sec of s.secrets.list) {
      if (!sec.group.visible) continue;
      const to = sec.group.position.clone().sub(catP).setY(0);
      if (to.length() < sec.spotRange && to.normalize().dot(player.forward()) > 0.5) {
        log.awardOnce(sec.award, sec.key, sec.label);
      }
    }
    s.prompt = null;
    for (const c of s.areaData.collectibles) {
      if (!s.collectibleMeshes.has(c.id)) continue;
      if (Math.hypot(c.x - catP.x, c.z - catP.z) < 1.6) {
        s.prompt = { kind: 'collect', data: c };
        hud.setPrompt(s.walk.carried >= s.walk.carryCap
          ? 'Paws full! (carry limit reached)'
          : `E — pick up ${c.label}`);
      }
    }
    if (!s.prompt) {
      const tippable = s.tippables.nearest(catP, 1.3);
      const gnome = s.secrets.list.find((e) => e.key === 'gnome');
      if (tippable) {
        s.prompt = { kind: 'tip', data: tippable };
        hud.setPrompt('E — paw it over');
      } else if (gnome && !gnome.group.userData.tipped &&
          gnome.group.position.distanceTo(catP) < 1.3) {
        s.prompt = { kind: 'tip-gnome', data: gnome };
        hud.setPrompt('E — paw over the gnome');
      }
    }
    if (!s.prompt) {
      const mound = s.scent.nearestMound(catP, 1.2);
      if (mound && mound.revealed) {
        s.prompt = { kind: 'dig' };
        hud.setPrompt('E — dig it up');
      }
    }
    if (!s.prompt && s.quest && s.questGiver) {
      if (s.quest.state === 'offered' &&
          s.questGiver.group.position.distanceTo(catP) < 2.5) {
        s.prompt = { kind: 'quest-accept' };
        hud.setPrompt('E — meow at the neighbor');
      } else if (s.quest.state === 'active' &&
          Math.hypot(s.quest.target.x - catP.x, s.quest.target.z - catP.z) < 2) {
        s.prompt = { kind: 'quest-complete' };
        hud.setPrompt(s.quest.texts.prompt);
      }
    }
    if (!s.prompt) {
      const stray = s.strayCats.nearest(catP, 2.5, { ungreetedOnly: true });
      if (stray) {
        s.prompt = { kind: 'stray', data: stray };
        hud.setPrompt(`E — touch noses with ${stray.name}`);
      }
    }
    if (!s.prompt) {
      for (const c of s.critters.list) {
        if (c.type !== 'villager' || c.scratched) continue;
        if (c.group.position.distanceTo(catP) < 2.2) {
          s.prompt = { kind: 'scratch', data: c };
          hud.setPrompt('E — get head scratches');
          break;
        }
      }
    }
    for (const c of s.critters.list) {
      if (c.type === 'villager' && c.scratched && c.group.position.distanceTo(catP) > 4) c.scratched = false;
    }
    if (!s.prompt) hud.setPrompt(null);

    for (const sc of s.areaData.scenics) {
      if (Math.hypot(sc.x - catP.x, sc.z - catP.z) < 4) {
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
    } else if (s.prompt.kind === 'tip') {
      if (s.tippables.tip(s.prompt.data)) {
        log.awardOnce('mischief', `tip-${s.prompt.data.id}`, 'a gravity check 🐾');
        s.critters.dismayNear(s.prompt.data.group.position, 8);
      }
    } else if (s.prompt.kind === 'tip-gnome') {
      const gnome = s.prompt.data;
      gnome.group.rotation.z = -1.4;
      gnome.group.userData.tipped = true;
      log.awardOnce('mischief', 'tip-gnome', 'a gnome bowled over 🧙');
    } else if (s.prompt.kind === 'quest-accept') {
      s.quest.accept();
      hud.toast(s.quest.texts.offer);
      hud.setObjective(s.quest.texts.objective);
      if (s.questObject) s.questObject.visible = true;
      if (s.questGiver.marker) s.questGiver.marker.visible = false;
    } else if (s.prompt.kind === 'quest-complete') {
      if (s.quest.tryComplete(s.cat.position)) {
        log.award('quest', 'quest', s.quest.texts.done);
        hud.setObjective(null);
        if (s.questObject) s.questObject.visible = false;
      }
    } else if (s.prompt.kind === 'stray') {
      const stray = s.prompt.data;
      s.strayCats.greet(stray, s.cat.position);
      log.awardOnce('friend', `friend-${stray.name}`, 'a new cat friend');
      s.catsGreeted += 1;
      const level = progression.recordGreet(stray.name, stray.breed, s.walkStamp);
      if (level === 'met') hud.toast(`You met ${stray.name}! ♡`);
      else if (level === 'friend') hud.toast(`${stray.name} is now your friend! ♥`);
      else if (level === 'best') hud.toast(`${stray.name} is your BEST friend! 💕`);
      catVoice();
    } else if (s.prompt.kind === 'dig') {
      const treat = s.scent.digAt(s.cat.position);
      if (treat) log.awardOnce('treasure', treat.id, 'a buried treasure!');
    } else if (s.prompt.kind === 'scratch') {
      s.prompt.data.scratched = true;
      log.award('pet', 'pet', 'blissful head scratches');
      audio.purr();
      if (PERSONALITIES[s.cat.userData.breed].special === 'napper') {
        log.award('perk', 'nap-pet', 'a deep contented purr'); // Persians LIVE for this
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
      const to = new THREE.Vector3(m.x, 0, m.z).sub(s.cat.position).setY(0);
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
    else noteGoal('photo');
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
      session.critters.update(dt, t, session.cat.position, session.cat.position);
      session.strayCats.update(dt, t, session.cat.position, {
        stalking: player.stalking,
        catSpeed: player.speed,
        toy: session.toy,
      });
      session.toy.update(dt, session.areaData.bounds);
      session.weather.update(dt, camera.position);
      session.secrets.update(dt, t, session.cat.position, player.speed);
      session.tippables.update(dt);
      session.scent.update(dt);
      if (session.weather.rainbowVisible) {
        const to = new THREE.Vector3(session.weather.rainbowPos.x, 0, session.weather.rainbowPos.z).sub(camera.position).setY(0);
        if (to.normalize().dot(player.forward()) > 0.6) {
          log.awardOnce('rainbow', 'rainbow', 'a rainbow after the rain! 🌈');
        }
      }
      updateAvatar(session, dt, t);
      updateInteractions(session);
      updateMoments(session, dt);
      if (session.questGiver?.marker?.visible) {
        session.questGiver.marker.position.y = 2.1 + Math.sin(t * 3) * 0.12;
      }
    }
    renderer.render(session.scene, camera);
  });
}
