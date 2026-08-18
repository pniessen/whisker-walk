import * as THREE from 'three';
import { bus } from './events.js';
import { createPlayer } from './player.js';
import { PERSONALITIES } from './cat/brain.js';
import { createProgression, rankFor } from './progression.js';
import { buildEnvMap } from './render/materials.js';
import { createDiscoveryLog } from './discoveries.js';
import { createHud } from './ui/hud.js';
import { createHomeBase } from './ui/homebase.js';
import { detectTouch, createTouchUI, onFirstTouch } from './ui/touchui.js';
import { createAudio } from './audio.js';
import { createMusic } from './music.js';
import { createSamples } from './samples.js';
import { voiceFor } from './catvoice.js';
import { createAlbum } from './album.js';
import { createSettings } from './settings.js';
import { createBlockList } from './blocklist.js';
import { phraseIdForDigit } from './chatkeys.js';
import { createCloudToast, createCloudSync } from './game/cloudsync.js';
import { createNetEvents } from './game/netevents.js';
import { createPhotoMode } from './game/photo.js';
import { createInteractions } from './game/interactions.js';
import { createAvatarUpdater } from './game/avatar.js';
import { createRooms } from './game/rooms.js';
import { createComposerRig } from './game/composer.js';
import { createWalkLifecycle } from './game/walk.js';
import { nowSec } from './game/util.js';

// stable per-browser identity for co-walk rooms — generated once and cached,
// survives reloads so a mid-walk refresh doesn't orphan a room membership.
let pid;
try {
  pid = window.localStorage.getItem('whisker-walk-player');
  if (!pid) {
    pid = crypto.randomUUID();
    window.localStorage.setItem('whisker-walk-player', pid);
  }
} catch {
  pid = crypto.randomUUID(); // storage unavailable (private mode, quota) — still usable this session
}

// multiplayer is entirely env-gated: absent keys means "Walk together" shows
// a friendly not-configured state and nothing else about solo play changes.
const MP = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// per-device "hide this visitor" list — see src/blocklist.js. Module-scope
// like pid above (not gated on MP): harmless to create even in a solo
// deploy, and both spawnGhosts and homebaseCloud need the same instance.
const blockList = createBlockList(window.localStorage);

// PWA install: only register in production builds (dev's unbundled module
// graph isn't something a SW should try to cache) and only for a matching
// path — import.meta.env.BASE_URL is '/' in dev and '/whisker-walk/' on
// Pages, so deriving the SW URL and scope from it (rather than a hardcoded
// '/') keeps registration correct under either base.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
  });
}

// a toast surface that stays visible on the home base screen (unlike
// #hud, which is display:none whenever no walk is in progress) — cloud
// sync results (stale/denied) need to reach the player there too.
const cloudToast = createCloudToast(document.getElementById('cloud-toasts'));

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
  // coarse-pointer devices (phones/tablets) get a lower pixel-ratio cap —
  // matches the shadow/stray-count tuning in startWalk below, all in service
  // of keeping frame time down on weaker mobile GPUs.
  const coarse = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  // Baked once from a procedural RoomEnvironment (no network/HDRI fetch) and
  // reused across every walk — never disposed per-walk.
  const envMap = buildEnvMap(renderer);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);

  // Post-processing rig + per-frame draw (src/game/composer.js).
  const composerRig = createComposerRig(renderer, camera);
  const renderFrame = () => composerRig.renderFrame(session);

  const player = createPlayer(camera, canvas);
  // isTouch gates which control surface is active; a hybrid device that only
  // reveals itself via a real touch event upgrades mid-session (onFirstTouch
  // below), never downgrades.
  let isTouch = detectTouch();
  player.setTouchMode(isTouch);
  // body.touch-mode is the JS-driven counterpart to the `@media (pointer:
  // coarse)` CSS rule: the media query never matches on a hybrid device that
  // only reveals itself via a real touch event, so without this the desktop
  // .hud-controls bar would keep showing alongside the touch UI after an
  // onFirstTouch upgrade.
  if (isTouch) document.body.classList.add('touch-mode');
  const progression = createProgression(window.localStorage);
  const album = createAlbum(window.localStorage);
  const settings = createSettings(window.localStorage);
  const log = createDiscoveryLog(progression);

  // Cloud save wiring (lazy capability handles + the home base's Sync ☁️
  // panel) lives in src/game/cloudsync.js — created here, alongside the other
  // system factories, so every later call site sees it already built.
  const { getPsecret, getCloud, sync } = createCloudSync({
    MP,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    storage: window.localStorage,
    progression,
    album,
    cloudToast,
  });

  const hud = createHud();
  const audio = createAudio();
  // Generative lofi music (Task 7.3): its own gain node, connected to the
  // shared master bus via audio.getMaster() — that bus covers volume
  // scaling for free (audio.setVolume() writes master.gain.value), but NOT
  // mute (audio.setMuted() only gates its own tone()/vocal() calls, it never
  // touches master.gain) — so applySettings() below also pushes
  // music.setMuted() to silence the generative music. See music.js's
  // file-header comment for the full story.
  const music = createMusic(() => audio.getContext(), () => audio.getMaster());
  // Sampled pet voices: created AFTER audio so its decode hook can reach
  // audio.getContext(). Loads public/sounds/manifest.json and lazily
  // decodes every listed file; decodeAudioData works without a user gesture
  // in modern browsers (only starting playback needs one), so kicking this
  // off immediately at boot — while the AudioContext may still be
  // suspended — is safe. Until a family recording decodes successfully,
  // samples.has() stays false and catVoice/applyRemoteEvent fall through to
  // the synth voice, so an empty manifest is behavior-identical to no
  // samples module at all.
  const samples = createSamples(import.meta.env.BASE_URL, {
    decode: (arrayBuf) => audio.getContext().decodeAudioData(arrayBuf),
    playBuffer: (buf, opts) => audio.playBuffer(buf, opts),
  });
  const touchUI = createTouchUI(document.getElementById('hud'), {
    onMove: (v) => player.setTouchMove(v),
    onOrbit: (dx, dy) => player.addOrbit(dx, dy),
    onAction: (name) => handleTouchAction(name),
  }, { leftHanded: settings.get('leftHanded') });
  // Pushes every live-tunable setting into the systems that read it — audio
  // volume/mute, camera invert-Y, touch-UI handedness — so a change applies
  // immediately with no reload or walk restart. Called once at boot (with
  // whatever was persisted) and again after every homebase settings change
  // and the M-key mute toggle below. (settings.reducedMotion isn't pushed
  // here — weather/animateCat read it directly at the point of use, since
  // those only apply per-walk/per-frame rather than to a live object.)
  function applySettings() {
    audio.setVolume(settings.get('volume'));
    audio.setMuted(settings.get('muted'));
    music.setVolume(settings.get('musicVolume'));
    music.setMuted(settings.get('muted'));
    player.setInvertY(settings.get('invertY'));
    touchUI.setLeftHanded(settings.get('leftHanded'));
  }
  applySettings();
  // routed through handleTouchAction('interact') rather than calling
  // handleInteract directly so the prompt-pill tap shares the exact same
  // session/engaged guard as every other touch action.
  hud.onPromptTap(() => handleTouchAction('interact'));
  onFirstTouch(() => {
    if (isTouch) return;
    isTouch = true;
    player.setTouchMode(true);
    document.body.classList.add('touch-mode');
    if (session) touchUI.setVisible(true);
    // the pause overlay may already be showing stale desktop copy from
    // before this upgrade — refresh the resume label so it isn't stale.
    const resumeBtn = document.getElementById('btn-resume');
    if (resumeBtn) resumeBtn.textContent = 'Tap to explore';
  });
  // Hagrid is a chicken; chickens cluck. pitch defaults to 1 (normal voice);
  // co-walk duets pass 1.26 (+4 semitones) to layer a harmonized second voice.
  // Breed-aware: every breed gets its own formant voice via voiceFor().
  const catVoice = (pitch = 1) => {
    if (!session) return;
    const breed = session.cat.userData.breed;
    // A recorded family voice, once decoded, takes priority over every
    // synth branch below (hagrid's cluck included) — if the family records
    // Hagrid, he gets his real cluck too. See src/samples.js's has()
    // contract: true only once that breed's file has actually decoded.
    if (samples.has(breed)) {
      samples.play(breed, { rate: 0.95 + Math.random() * 0.1 });
      return;
    }
    const v = voiceFor(breed);
    if (breed === 'hagrid') audio.cluck(1, pitch * v.pitch);
    else audio.meow(1, pitch, v);
  };
  const clock = new THREE.Clock();

  let session = null;

  // Co-walk network event handling (src/game/netevents.js). Created here,
  // above every caller: applyGoalResult below is a hoisted function
  // declaration, and catVoice/log/hud/audio/samples are already bound, so
  // nothing in the factory's dependency list is in its temporal dead zone.
  const {
    petNameFor, completeBoop, completeTag, noteBat, applyRemoteEvent,
  } = createNetEvents({
    MP, getCloud, getPsecret, log, hud, audio, samples, catVoice,
    applyGoalResult: (s, res) => applyGoalResult(s, res),
  });

  // Photo mode (src/game/photo.js). renderFrame/noteGoal are hoisted
  // function declarations, so passing them straight through is safe here.
  const { snapPhoto } = createPhotoMode({
    renderer, camera, player, album, hud, log, audio,
    renderFrame: () => renderFrame(),
    noteGoal: (type) => noteGoal(type),
  });

  // Interactions/prompts + the shared action helpers (src/game/interactions.js).
  const {
    doMeow, doYarn, doPounceOrClimb, doCameraToggle, handleTouchAction,
    updateInteractions, awardStrayGreet, handleInteract,
  } = createInteractions({
    MP, pid, getCloud, getPsecret,
    getSession: () => session,
    getIsTouch: () => isTouch,
    player, progression, log, hud, audio, catVoice, snapPhoto,
    petNameFor, completeBoop,
  });

  // Per-frame avatar/moment updates (src/game/avatar.js).
  const { updateAvatar, updateMoments } = createAvatarUpdater({
    player, progression, settings, log, hud, audio,
    petNameFor, completeTag, noteBat,
  });

  // Co-walk room lobby + profile push (src/game/rooms.js). It owns
  // pendingRoom; the walk lifecycle reads it back through getPendingRoom /
  // clearPendingRoom below. startWalk is passed as a thunk because it is
  // declared further down — nothing can reach it before init() returns.
  const {
    rooms, pushProfileNow, getPendingRoom, clearPendingRoom,
  } = createRooms({
    MP, pid,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    progression, getCloud, getPsecret,
    getSession: () => session,
    startWalk: (opts) => startWalk(opts),
  });

  // The walk lifecycle (src/game/walk.js). main.js keeps the `session`
  // binding — the render loop, keydown handlers and discovery bus all read
  // it — and hands the module accessors for it. getHomebase is a thunk
  // because homebase is created below (it takes beginWalkFromHomebase as its
  // Start handler), and nothing calls back into it before init() returns.
  const {
    beginWalkFromHomebase, beginDenWalk, startWalk, endWalk,
  } = createWalkLifecycle({
    MP, pid, coarse, envMap, overlay, blockList,
    renderer, camera, composerRig,
    player, progression, settings, hud, audio, music, log, touchUI, catVoice,
    getCloud,
    getSession: () => session,
    setSession: (next) => { session = next; },
    getIsTouch: () => isTouch,
    getHomebase: () => homebase,
    getPendingRoom, clearPendingRoom, pushProfileNow,
    awardStrayGreet, applyRemoteEvent, cloudToast,
  });

  // Player pets 🐾🐾 roster (Task 3): a thin read-only adapter over the
  // lazy cloud instance, handed to homebase so it can fetch friendships +
  // profiles for its own async render without knowing about MP/getCloud.
  const homebaseCloud = {
    available: MP,
    myId: pid,
    fetchFriendships(id) {
      const cloud = getCloud();
      return cloud ? cloud.fetchFriendships(id) : Promise.reject(new Error('cloud unavailable'));
    },
    fetchProfiles(ids) {
      const cloud = getCloud();
      return cloud ? cloud.fetchProfiles(ids) : Promise.reject(new Error('cloud unavailable'));
    },
    // Friend codes (Task 4): homebase never sees psecret directly — it
    // passes back only the raw prefix (findByFriendCode) or the resolved
    // other-player id (addFriendByCode), same "thin adapter" boundary Task
    // 3 established for fetchFriendships/fetchProfiles above.
    findByFriendCode(prefix) {
      const cloud = getCloud();
      return cloud ? cloud.findByFriendCode(prefix) : Promise.reject(new Error('cloud unavailable'));
    },
    addFriendByCode(otherId) {
      const cloud = getCloud();
      if (!cloud) return Promise.reject(new Error('cloud unavailable'));
      // record_friend_greet (called inside cloud.addFriendByCode) validates
      // the CALLER's own profile row/secret — a player who only just typed
      // their pet name (never hosted/joined a room or finished a walk) has
      // no profile row on the server yet, which would otherwise make every
      // friend-code add fail with a denied (-1). Push it first — awaited,
      // not fire-and-forget, so the row genuinely exists before the RPC
      // that needs it — and let cloud.addFriendByCode's own 'failed' status
      // (see below) surface anything that still goes wrong.
      return Promise.resolve(pushProfileNow()).then(() => cloud.addFriendByCode(pid, getPsecret(), otherId));
    },
    // Unilateral-friendship mitigation (final fix wave, Task 3): record_friend_greet
    // doesn't validate p_other_id, so any client can drive greets against a
    // victim who never agreed to anything — those surface as ghosts
    // (spawnGhosts) and Player pets roster rows. This is a client-side,
    // per-device "stop showing me this visitor" list, not a server-side fix
    // (see docs/superpowers/specs/2026-08-01-whisker-walk-v7-online.md's
    // "Known limitation" note) — homebase's roster ✕ button and spawnGhosts
    // both consult it.
    isBlocked(otherId) {
      return blockList.has(otherId);
    },
    blockPlayer(otherId) {
      blockList.add(otherId);
    },
  };
  const homebase = createHomeBase(progression, album, beginWalkFromHomebase, rooms, sync, homebaseCloud, settings, applySettings, beginDenWalk);
  homebase.show();

  // Shared goal-completion handler: turns a goals.note()/noteDuoRemote()
  // result into awards + HUD refresh + fx, regardless of whether the
  // progress came from our own action (noteGoal) or a partner's synced
  // duo-goal event (applyRemoteEvent's 'goal-progress') — completion pays
  // the normal goal award either way, so a duo goal your partner finishes
  // still pays you too, plus the extra 'duogoal' bonus on a duo completion.
  function applyGoalResult(s, res) {
    hud.setGoals(s.goals.goals);
    if (res.completed) {
      log.award('goal', `goal-${res.completed.id}`, `goal complete: ${res.completed.text}`);
      s.fx?.burst(s.cat.position, 0x8ae08a, 14);
      if (res.completed.duo) {
        log.awardOnce('duogoal', res.completed.id, 'a goal completed TOGETHER! 🤝');
      }
    }
    if (res.jackpot) log.award('jackpot', 'jackpot', 'ALL GOALS COMPLETE! 🎯');
  }

  function noteGoal(type) {
    if (!session?.goals) return;
    // captured BEFORE note() mutates it — the duo goal may transition from
    // not-done to done in this very call, and we still want to broadcast
    // that final increment to the partner (see the send below).
    const duo = session.goals.goals.find((g) => g.duo);
    const duoWasDone = duo?.done ?? true;
    const res = session.goals.note(type);
    applyGoalResult(session, res);
    if (type === 'friend' && duo && !duoWasDone && session.net) {
      session.net.sendEvent({ v: 1, id: session.playerId, type: 'goal-progress', goalId: duo.id });
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composerRig.resize(window.innerWidth, window.innerHeight);
  });

  bus.on('discovery', ({ type, points }) => {
    hud.setPoints(progression.state.points);
    if (type === 'jackpot') {
      audio.fanfare();
    } else if (type === 'collectible' || type === 'treasure') {
      audio.collectArp();
    } else {
      audio.chime();
    }
    if (session?.fx && points > 0) session.fx.popup(session.cat.position, `+${points} 🐾`);
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
    if (session && progression.state.equipped.neck === 'bandana') {
      log.award('perk', `wave-${id}`, 'a friendly wave back');
    }
  });
  overlay.addEventListener('click', (e) => {
    if (e.target.id === 'btn-resume') {
      if (isTouch) player.setTouchEngaged(true);
      else canvas.requestPointerLock();
    }
    if (e.target.id === 'btn-end') endWalk();
    if (e.target.id === 'btn-summary-continue') {
      overlay.classList.add('hidden');
      homebase.show();
      sync.autoSync(); // fire-and-forget; no-op when unlinked/offline
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && session && player.engaged && !e.repeat) {
      if (session.prompt) handleInteract(session);
      else {
        session.sniffTime = 1;
        const range = PERSONALITIES[session.cat.userData.breed].special === 'keenNose' ? 30 : 18;
        const found = session.scent.sniff(session.cat.position, range);
        hud.toast(found ? 'You smell something… follow the paw prints! 👃' : 'Nothing on the breeze.');
      }
    }
    if (e.code === 'KeyV' && session && player.engaged && !e.repeat) {
      doMeow();
    }
    if (e.code === 'KeyM') {
      // settings.muted is the single source of truth (see applySettings) —
      // M just flips it, same as the homebase checkbox does; audio only
      // ever reads it back via applySettings()'s audio.setMuted() call.
      const next = !settings.get('muted');
      settings.set('muted', next);
      applySettings();
      homebase.refresh();
      hud.toast(next ? 'Sound off 🔇' : 'Sound on 🔊');
    }
    if (e.code === 'KeyT' && session && player.engaged) {
      doYarn();
    }
    if (e.code === 'Space' && session && player.engaged && !e.repeat &&
        !session.cameraMode && session.freezeTime <= 0) {
      doPounceOrClimb();
    }
    if (e.code === 'KeyC' && session && player.engaged) {
      doCameraToggle();
    }
    // chat keys — only during an active engaged walk, never while typing
    // (guards home-base pet-name/friend-code/room-code inputs).
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (session && player.engaged && !typing) {
      const digitPhrase = phraseIdForDigit(e.code);
      if (digitPhrase) { session.sendPhrase(digitPhrase); return; }
      if (e.code === 'Enter') { session.chatWheel?.openFromKeyboard?.(); return; }
      if (e.code === 'Escape') { session.chatWheel?.closeFromKeyboard?.(); return; }
    }
  });
  document.addEventListener('mousedown', () => {
    if (isTouch) return; // touch snapping goes through tapWorld — a synthesized
    // mousedown from a button tap must not double-snap.
    if (session && player.engaged && session.cameraMode) snapPhoto(session);
  });

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!session) return;
    if (player.engaged) {
      player.update(dt, session.areaData.colliders, session.areaData.bounds);

      // Zoomies FOV kick: ease toward a wider field of view while sprinting,
      // back to normal otherwise. updateProjectionMatrix is comparatively
      // expensive, so it's skipped on frames where the eased value barely
      // moved (a settled camera.fov near its target, e.g. mid-hold or
      // mid-cooldown) rather than called unconditionally every frame.
      const fovTarget = player.zooming ? 77 : 70;
      const fovDelta = (fovTarget - camera.fov) * Math.min(1, dt * 4);
      if (Math.abs(fovDelta) > 0.01) {
        camera.fov += fovDelta;
        camera.updateProjectionMatrix();
      }

      // Sparkle trail while zooming — throttled to every 0.12s so it reads as
      // a trail of bursts rather than a solid particle firehose. Generic
      // (breed/gear-agnostic): the v11 "Superhero Cape" item spec calls for
      // the cape to own its own zoomie sparkle trail, but no cape-specific
      // trail effect exists yet, so this shared trail covers everyone who
      // zooms — decision: generic trail for all, cape differentiation
      // dropped for now (simpler, and kid-fairer than a paywalled trail).
      if (player.zooming && !session.reducedMotion) {
        session.zoomTrailAccum += dt;
        if (session.zoomTrailAccum >= 0.12) {
          session.zoomTrailAccum = 0;
          session.fx.burst(session.cat.position, 0xfff2c0, 4);
        }
      } else {
        session.zoomTrailAccum = 0;
      }

      // Wind whoosh fires once on the transition INTO zooming, not every
      // frame while zooming continues.
      if (player.zooming && !session.wasZooming) audio.zoomWind();
      session.wasZooming = player.zooming;

      // Slow-mo on a perfect stalk-and-pounce catch: critters/strays slow down for
      // a beat while player/camera/remotes keep real-time motion (remotes MUST stay
      // real dt — slowing their interpolation would desync them from the network clock).
      // skyLife also stays on real dt below: its rng timers are seeded from roomSeed so
      // co-walk clouds/birds stay identical across clients, and a local-only slow-mo
      // would desync that shared stream permanently.
      if (session.slowmoTime > 0) session.slowmoTime -= dt;
      const wdt = session.slowmoTime > 0 ? dt * 0.35 : dt;
      session.critters.update(wdt, t, session.cat.position, session.cat.position);
      session.strayCats.update(wdt, t, session.cat.position, {
        stalking: player.stalking,
        catSpeed: player.speed,
        toy: session.toy,
      });
      session.toy.update(dt, session.areaData.bounds);
      session.weather.update(dt, camera.position);
      session.secrets.update(dt, t, session.cat.position, player.speed);
      session.goldMice.update(t);
      const gm = session.goldMice.checkFind(session.cat.position, player.perchY);
      if (gm && progression.recordGolden(gm.id)) {
        log.awardOnce('legend', gm.id, 'a GOLDEN MOUSE! 🥇');
        session.fx.burst(session.cat.position, 0xf2c14e, 18);
        audio.fanfare();
        session.goldMice.remove(gm.id);
      }
      session.kittenEnc.update(dt, session.cat.position);
      // Daily zoomies race: advance the ring timer/crossing checks, then
      // reflect it in the HUD objective (throttled to actual ring changes)
      // and, on the run→done transition, pay out the local best-time record.
      // Conflict resolution with a quest's own objective: the lost-kitten/
      // letter/glasses quest objective always wins — while s.quest?.state
      // === 'active', the race simply doesn't touch hud.setObjective at all
      // (neither writing its own ring text nor clearing the quest's), so a
      // race running alongside an active quest never clobbers what the
      // player is actually supposed to be doing.
      const wasRacing = session.race.state === 'running';
      session.race.update(dt, session.cat.position);
      const questActive = session.quest?.state === 'active';
      if (session.race.state === 'running') {
        if (questActive) {
          // The quest objective owns the HUD right now — reset raceRingShown
          // to null (rather than leaving it at the last ring shown) so that
          // the moment questActive flips back to false (quest accepted-then-
          // completed mid-race, or abandoned), the != currentRing check
          // below fires on the very next frame and re-writes "Race: ring
          // N/5" immediately, instead of waiting for the next ring crossing.
          session.raceRingShown = null;
        } else if (session.raceRingShown !== session.race.currentRing) {
          session.raceRingShown = session.race.currentRing;
          hud.setObjective(`Race: ring ${session.race.currentRing}/5`);
        }
      } else if (wasRacing && session.race.state === 'done') {
        if (session.raceRingShown != null && !questActive) hud.setObjective(null);
        session.raceRingShown = null;
        const r = progression.recordRace(session.raceDate, session.areaId, session.race.timeMs);
        const secs = (session.race.timeMs / 1000).toFixed(1);
        hud.toast(r.isBest ? `🏁 ${secs}s — today’s best!` : `🏁 ${secs}s`);
        log.awardOnce('goal', 'race-done', 'the daily zoomies race');
        session.fx.burst(session.cat.position, 0xffe27a, 14);
      }
      session.tippables.update(dt);
      session.scent.update(dt);
      session.fx.update(dt);
      session.skyLife.update(dt);
      session.remotes.update(dt, nowSec());
      session.chatBubbles?.update();
      session.ghosts.update(dt, t);
      // ghost ball is only shown (and batable) while I don't already have my
      // own active toy out, and its last report is fresh — a remote who went
      // quiet (despawned, dropped) shouldn't leave a phantom ball behind.
      if (session.remoteToy && !session.toy.active && nowSec() - session.remoteToy.at < 1) {
        session.toyGhost.visible = true;
        session.toyGhost.position.set(session.remoteToy.pos[0], 0.13, session.remoteToy.pos[1]);
      } else {
        session.toyGhost.visible = false;
      }
      if (session.net) {
        session.netSendAccum += dt;
        if (session.netSendAccum >= 0.125) { // 8Hz
          session.netSendAccum = 0;
          session.net.sendState({
            v: 1,
            id: session.playerId,
            pos: [session.cat.position.x, session.cat.position.z],
            yaw: session.cat.rotation.y,
            pose: session.pose,
            speed: player.speed,
            toy: session.toy.active ? [session.toy.mesh.position.x, session.toy.mesh.position.z] : null,
          });
        }
      }
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
    renderFrame();
  });
}
