import * as THREE from 'three';
import { bus } from './events.js';
import { createPlayer } from './player.js';
import { coatColor, CAT_LOOK_Y } from './cat/model.js';
import { PERSONALITIES } from './cat/brain.js';
import { createProgression, rankFor, CATALOG } from './progression.js';
import { colonyNews, tradeEffect } from './colony.js';
import { renderNewsHtml } from './ui/colonypanel.js';
import { buildEnvMap } from './render/materials.js';
import { createDiscoveryLog } from './discoveries.js';
import { createHud } from './ui/hud.js';
import { createPerfHud } from './ui/perfhud.js';
import { createHomeBase } from './ui/homebase.js';
import { whenSplashGone, startVisitGreeting } from './visitboot.js';
import { detectTouch, createTouchUI, onFirstTouch } from './ui/touchui.js';
import { createZoomControl, createWheelStepper, keyZoomDir, zoomActionDir } from './camzoom.js';
import { createAudio } from './audio.js';
import { createMusic } from './music.js';
import { createSamples } from './samples.js';
import { voiceFor } from './catvoice.js';
import { createAlbum } from './album.js';
import { createSettings } from './settings.js';
import { createBlockList } from './blocklist.js';
import { phraseIdForDigit } from './chatkeys.js';
import { createCloudToast, createCloudSync } from './game/cloudsync.js';
import { createColonySync } from './game/colonysync.js';
import { createNetEvents } from './game/netevents.js';
import { createPhotoMode } from './game/photo.js';
import { createInteractions } from './game/interactions.js';
import { createAvatarUpdater } from './game/avatar.js';
import { createRooms } from './game/rooms.js';
import { createComposerRig } from './game/composer.js';
import { createQualityAdapter } from './game/adaptquality.js';
import { parseForcedRung } from './render/quality.js';
import { readDeviceProfile, DEVICE_EVENT } from './render/deviceprofile.js';
import { releaseThumbnails } from './thumbnails.js';
import { createWalkLifecycle, chatHintLine, pauseCardFor, takeStartLines, resumeLabel, cardMode } from './game/walk.js';
import { createDenShopView } from './ui/denshopview.js';
import { nowSec } from './game/util.js';
import { setTextureAnisotropy } from './render/textures.js';
import { waterClearance, nearestDry } from './world/builder.js';
import { takeArrivalLine } from './housecats.js';
import { takeMoveLines } from './fightmoves.js';
import { createCrossing, swallowsCanvasClick } from './game/crossing.js';
import { readResume, writeResume, clearResume, markTried, snapshotWalk, settleAbandoned } from './game/walkresume.js';
import { sheetTopFrom } from './fightcam.js';

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

// multiplayer is entirely env-gated: absent keys hide the 👫 Play together
// button and sheet, and nothing else about solo play changes.
const MP = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// per-device "hide this visitor" list — see src/blocklist.js. Module-scope
// like pid above (not gated on MP): harmless to create even in a solo
// deploy, and both spawnGhosts and homebaseCloud need the same instance.
const blockList = createBlockList(window.localStorage);

// PWA install: only register in production builds (dev's unbundled module
// graph isn't something a SW should try to cache) and only for a matching
// path — import.meta.env.BASE_URL is '/' in dev and '/whisker-walk/' on
// Pages, so deriving the SW URL and scope from it (rather than a hardcoded
// '/') keeps registration correct under either base. The iOS app build
// never registers one.
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.MODE !== 'ios') {
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
  // coarse-pointer devices (phones/tablets) get a lower pixel-ratio cap here,
  // for the home base only. Walks no longer key off the pointer: each walk's
  // pixel ratio, shadows and stray count come from its quality rung, which
  // game/adaptquality.js picks (and sets the pixel ratio for) at walk start.
  const coarse = matchMedia('(pointer: coarse)').matches;
  // ?perf forces the readout on for this page load only; it is never saved.
  const perfFlag = new URLSearchParams(location.search).has('perf');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // three 0.185 deprecates the soft variant and swaps in PCFShadowMap with a console warning; same filter.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  // Grazing-angle sharpness for the tiled surface maps. Set once from the
  // renderer's real cap, because textures.js has no renderer and the tiles are
  // shared app-wide — a world file setting map.anisotropy would mutate every
  // other area's tiles too. Capped at 4: the cost is per-sample and the only
  // surfaces that need it are large ground planes (the Docks' 120m cobbles at
  // 100x100 tiles, seen from a 2.2m camera, are almost all grazing angle),
  // where 4 removes the crawl and 8 or 16 buys nothing visible for the extra
  // bandwidth on a phone.
  setTextureAnisotropy(Math.min(4, renderer.capabilities.getMaxAnisotropy()));
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
  // Adaptive Auto quality: every device starts a walk on the high rung and
  // steps down live if its frames stay slow; the step is remembered per
  // device in localStorage['whisker-walk-adapt'] (never the save).
  // ?rung=N holds Auto on rung N for this page load (testing; never saved).
  const qualityAdapter = createQualityAdapter({
    renderer, composerRig, storage: window.localStorage,
    forcedRung: parseForcedRung(location.search),
    // What the iPhone and iPad app says it is running on; null in a browser.
    device: readDeviceProfile(window),
  });
  // The app's news about the device while the game is open: running hot, Low
  // Power Mode, memory short. Never fired in a browser. A memory warning also
  // lets go of the menu pictures (thumbnails.js), which are remade on demand.
  window.addEventListener(DEVICE_EVENT, (e) => {
    qualityAdapter.deviceChanged(e.detail);
    if (e.detail?.memoryWarning === true) releaseThumbnails();
  });
  const perfHud = createPerfHud({ renderer, settings, coarse, adapter: qualityAdapter });
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
  // Camera zoom (src/camzoom.js): keys, wheel, the touch +/− pair and pinch
  // all land in zoomControl.step(dir). Only during an engaged walk, so the
  // wheel and +/− keys do nothing on the home base or the pause card.
  const zoomControl = createZoomControl({
    settings,
    player,
    isDen: () => session?.areaId === 'den',
    onCapped: () => hud.toast('The den is cosy — no room to zoom out further 🏠'),
  });
  const zoomBy = (dir) => {
    if (session && player.engaged) zoomControl.step(dir);
  };
  const touchUI = createTouchUI(document.getElementById('hud'), {
    onMove: (v) => player.setTouchMove(v),
    onOrbit: (dx, dy) => player.addOrbit(dx, dy),
    onAction: (name) => {
      const zoomDir = zoomActionDir(name);
      if (zoomDir) zoomBy(zoomDir);
      else handleTouchAction(name);
    },
    onZoom: zoomBy,
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
    // With ?perf the readout stays on even if the Settings box is unchecked, by design.
    perfHud.setEnabled(settings.get('perfReadout') || perfFlag);
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
    if (resumeBtn) resumeBtn.textContent = resumeLabel(cardMode(session), true);
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

  // The border-post crossing card (src/game/crossing.js), made after the walk
  // lifecycle below; declared here so the interactions' post slot (and the
  // co-walk border event) can close over it.
  let crossing = null;

  // Co-walk network event handling (src/game/netevents.js). Created here,
  // above every caller: applyGoalResult below is a hoisted function
  // declaration, and catVoice/log/hud/audio/samples are already bound, so
  // nothing in the factory's dependency list is in its temporal dead zone.
  const {
    petNameFor, completeBoop, completeTag, noteBat, applyRemoteEvent,
  } = createNetEvents({
    MP, getCloud, getPsecret, log, hud, audio, samples, catVoice,
    applyGoalResult: (s, res) => applyGoalResult(s, res),
    // v21 Stream 2: who may show a live 'colony-feed' (display only).
    getPartner: () => progression.state.colony?.partner ?? null,
    onBorderCross: (s, ev) => crossing?.onRemote(s, ev),
  });

  // Photo mode (src/game/photo.js). renderFrame/noteGoal are hoisted
  // function declarations, so passing them straight through is safe here.
  const { snapPhoto } = createPhotoMode({
    renderer, camera, player, album, hud, log, audio,
    renderFrame: () => renderFrame(),
    noteGoal: (type) => noteGoal(type),
  });

  // The shared colony's sync (src/game/colonysync.js). Created here, ABOVE
  // createInteractions and createRooms, because both take it — while it in
  // turn needs pushProfileNow from createRooms. So it gets pushProfileNow and
  // onChange as thunks: neither is called before init() returns (the first
  // pull is the boot pull after homebase.show() below), so the later `const`
  // bindings are initialised by then. It never creates a cloud when !MP and
  // never rejects, so solo play is unaffected.
  // A solo player has a clan name too: minted from their own id (spec 6.6).
  progression.ensureClanName(pid);
  const colonySync = createColonySync({
    MP, pid, getCloud, getPsecret, progression,
    pushProfileNow: () => pushProfileNow(),
    onChange: () => homebase.refresh(),
    // Each applied swap is announced here, once (colonysync reports it once,
    // whichever pull applied it). A toast, not a news line: the news card is
    // for what happened while you were away, and a swap is something you did.
    onTradesApplied: (trades) => {
      for (const t of trades) {
        const item = tradeEffect(t, pid)?.add;
        const name = typeof item === 'string' && Object.hasOwn(CATALOG.accessories, item) ? CATALOG.accessories[item].name : null;
        if (name) cloudToast(`Swapped! You got ${name} 🎁`);
      }
    },
  });

  // Interactions/prompts + the shared action helpers (src/game/interactions.js).
  const {
    doMeow, doYarn, doPounceOrClimb, doCameraToggle, handleTouchAction,
    updateInteractions, awardStrayGreet, handleInteract, tickCarryRain, endClanPatrol,
  } = createInteractions({
    MP, pid, getCloud, getPsecret,
    getSession: () => session,
    getIsTouch: () => isTouch,
    player, progression, log, hud, audio, catVoice, snapPhoto,
    petNameFor, completeBoop, colonySync,
    askCrossing: (s, d) => crossing?.ask(s, d),
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
    rooms, pushProfileNow, getPendingRoom, clearPendingRoom, startRoomTogether,
  } = createRooms({
    MP, pid,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    progression, getCloud, getPsecret, colonySync,
    getSession: () => session,
    startWalk: (opts) => startWalk(opts),
    toast: cloudToast,
  });

  // The den shop, inside the den (src/ui/denshopview.js): pauses like ⏸ and
  // walks on like the pause card's explore button.
  const denShop = createDenShopView({
    hud, progression, sync, player,
    getSession: () => session,
    pause: () => handleTouchAction('pause'),
    resume: () => resumeWalk(),
  });

  // The walk lifecycle (src/game/walk.js). main.js keeps the `session`
  // binding — the render loop, keydown handlers and discovery bus all read
  // it — and hands the module accessors for it. getHomebase is a thunk
  // because homebase is created below (it takes beginWalkFromHomebase as its
  // Start handler), and nothing calls back into it before init() returns.
  const {
    beginWalkFromHomebase, beginDenWalk, startWalk, endWalk, takeCrossing,
  } = createWalkLifecycle({
    MP, pid, coarse, envMap, overlay, blockList,
    renderer, camera, composerRig,
    player, progression, settings, hud, audio, music, log, touchUI, catVoice,
    getCloud,
    getSession: () => session,
    setSession: (next) => { session = next; },
    getIsTouch: () => isTouch,
    getHomebase: () => homebase,
    getPendingRoom, clearPendingRoom, pushProfileNow, startRoomTogether,
    awardStrayGreet, applyRemoteEvent, colonySync, qualityAdapter, denShop,
    endClanPatrol,
    // Fight moves and scars: her cat's scars changed; her brother and the
    // cloud profile see it.
    onScarsChanged: () => { rooms.retrackProfile(); pushProfileNow(); },
    // Mid-walk resume: an ended walk leaves nothing to pick up.
    onWalkEnded: () => clearResume(window.localStorage),
  });
  // resumeWalk is a hoisted function declaration, so it is safe to pass here.
  crossing = createCrossing({
    getSession: () => session,
    overlay, hud,
    releaseControl: () => handleTouchAction('pause'),
    resumeWalk, endWalk,
    getIsTouch: () => isTouch,
    getEdition: () => progression.state.edition,
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
  const homebase = createHomeBase(progression, album, beginWalkFromHomebase, rooms, sync, homebaseCloud, settings, applySettings, beginDenWalk, colonySync, pid, cloudToast, () => audio.unlockFanfare(), () => showColonyNews([]));
  // Visit milestones: count this open before show(), so the header badge has
  // the number. A milestone's celebration comes before every other card; the
  // farewell and the news follow once it closes. A plain visit shows the
  // welcome line, the farewell goes up straight away and the news on the pull.
  // Mid-walk resume (src/game/walkresume.js): the note of a walk the game was
  // closed in the middle of. Read once, here. A walk left too long is settled
  // now, before the home screen draws its numbers; one still fresh is picked
  // up at the end of init (see "Mid-walk resume" above the render loop).
  const leftWalk = readResume(window.localStorage, { now: Date.now(), areaIds: Object.keys(progression.state.walks) });
  if (leftWalk?.kind === 'stale') {
    clearResume(window.localStorage);
    settleAbandoned(progression, leftWalk.data);
  }
  const visit = progression.recordVisit();
  homebase.show();
  // Rosa's one-time farewell goes up before the news (showNews yields while it is up).
  const showFarewell = () => {
    const farewell = progression.takeFarewell();
    if (farewell) homebase.showNotice(farewell);
  };
  let visitHolding = () => false; // true while a milestone greeting is pending or up

  // "While you were out" (Task 10): the first thing a kid sees on open is what
  // their sibling did. Runs after the boot pull and after each walk's
  // summary-continue pull. Never over a walk in progress (`session`): the pull
  // is async and a walk can start before it lands. Nothing is lost then, since
  // the news is derived from the save and stays unread until dismissed, and the
  // rewards that pull granted wait in pendingRewards for the next card.
  let pendingRewards = new Set(); // a Set: two callers can share one in-flight pull and both hand over its rewards
  function showColonyNews(rewards) {
    for (const r of rewards || []) pendingRewards.add(r);
    if (session || visitHolding()) return; // the celebration's close shows it
    const colony = progression.state.colony;
    const news = colonyNews(colony, {
      me: pid, ymd: new Date().toISOString().slice(0, 10),
      rewards: [...pendingRewards], accessories: CATALOG.accessories,
    });
    if (!news.any) { pendingRewards.clear(); return; }
    const partner = colony.partner && colony.partner.petName ? colony.partner.petName : '';
    if (homebase.showNews(renderNewsHtml(news, partner), news.seen)) pendingRewards.clear();
  }
  const pullThenNews = () => colonySync.pull().then((r) => showColonyNews(r && r.rewards), () => {});
  pullThenNews(); // fire-and-forget; never rejects, and makes no network call when solo
  // The greeting waits for the boot splash (src/visitboot.js). A plain visit
  // puts the farewell up now and leaves the news to the pull, as before. A
  // milestone holds the farewell and the news until its celebration closes
  // ('done'); if the pull lands first, pendingRewards keeps its rewards. Closed
  // by a walk, the walk's own summary pull shows the news later.
  const greeting = startVisitGreeting({
    visit, homebase, showFarewell,
    showNews: () => showColonyNews([]), // whatever the boot pull left in pendingRewards
    splashGone: whenSplashGone(),
    walkActive: () => !!session,
  });
  visitHolding = greeting.holding;

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
    // Critters fold into one floater, as they do into one toast ("You
    // spotted 4 critters +20" over a "+20 🐾"); the rest stack (fx.js).
    if (session?.fx && points > 0) {
      session.fx.popup(session.cat.position, `+${points} 🐾`, type === 'critter'
        ? { merge: 'critter', value: points, mergeText: (total) => `+${total} 🐾` }
        : { value: points });
    }
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
    // The first engage is the walk beginning: from here on the card behind
    // the walk is the "Paused" one (walk.js pauseCardFor), and a touch walk
    // that began without its Ready? card gets that card's lines as toasts.
    if (session && locked && !session.started) {
      session.started = true;
      overlay.innerHTML = pauseCardFor(session, isTouch);
      for (const line of takeStartLines(session)) hud.toast(line);
    }
    crossing?.onLockChange(locked);
    if (session && !locked) { session.cameraMode = false; hud.setCamera(false); }
    // Kittypets: a wanderer's arrival line, kept by walk.js until the walk
    // starts (the Ready? card covers the toasts). Pointer lock and the touch
    // engage both land here; the line is given once, then cleared.
    if (session && locked) {
      // The chat hint goes first: if a big unlock overfills the toast queue,
      // the oldest line (this hint) is the one dropped. isTouch is read here,
      // not at walk start: a hybrid device's engage tap reveals it as touch.
      if (session.chatHintPending) { session.chatHintPending = false; hud.toast(chatHintLine(isTouch)); }
      const line = takeArrivalLine(session);
      if (line) hud.toast(line);
      for (const moveLine of takeMoveLines(session)) hud.toast(moveLine);
    }
  });
  bus.on('villager:wave', ({ id }) => {
    if (session && progression.state.equipped.neck === 'bandana') {
      log.award('perk', `wave-${id}`, 'a friendly wave back');
    }
  });
  function resumeWalk() {
    if (isTouch) player.setTouchEngaged(true);
    else Promise.resolve(canvas.requestPointerLock()).catch(() => {}); // refused without a click: the pause card stays
  }
  // During a room crossing's "Off we go!" pause a click on the game canvas
  // would re-lock the pointer (player.js's click handler): stopped here, in
  // the capture phase, before it reaches the canvas.
  document.addEventListener('click', (e) => {
    if (e.target === canvas && swallowsCanvasClick(session)) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  overlay.addEventListener('click', (e) => {
    if (e.target.id === 'btn-resume') resumeWalk();
    if (e.target.id === 'btn-end') endWalk();
    if (e.target.id === 'btn-cross-yes') crossing.confirm();
    if (e.target.id === 'btn-cross-no') crossing.cancel();
    if (e.target.id === 'btn-summary-continue') {
      overlay.classList.add('hidden');
      const c = takeCrossing();
      homebase.show(c && c.clan ? { sheet: 'places' } : undefined);
      sync.autoSync(); // fire-and-forget; no-op when unlinked/offline
      pullThenNews(); // fire-and-forget; catches up feeds made on this walk, then the news card
    }
  });
  document.addEventListener('keydown', (e) => {
    // Clan Life Part 2: while the fight sheet is up, every key is the fight's
    // (1 / 2 / 3 answer): no E interact, no chat phrases, no Space pounce.
    // Only while the walk is being played: from the pause card the keys are
    // the browser's (Enter / Space on a focused button, F5), and a Cmd / Ctrl /
    // Alt combo (Cmd-R, say) is left to the browser untouched. A held key's
    // repeats answer nothing, so a held "1" never answers the next round.
    if (session?.clanFight?.uiShowing === 'fight') {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (player.engaged) {
        e.preventDefault();
        if (!e.repeat) session.clanFight.key(e.key);
      }
      return;
    }
    // Typing in a home-base box (code, pet name, friend code) must never fire
    // hotkeys like M, which would also rebuild the panel and steal focus.
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    // While only the challenge pill is up, E is Fight! and Q is Back off;
    // every other key behaves as normal.
    if (session?.clanFight?.uiShowing === 'challenge' && (e.code === 'KeyE' || e.code === 'KeyQ')
        && player.engaged && !e.repeat && !typing) {
      session.clanFight.key(e.code === 'KeyE' ? 'e' : 'q');
      return;
    }
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
    if (e.code === 'KeyM' && !typing) {
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
    // + / = zoom in, - zooms out, by character first (non-US layouts) then
    // by key position. A held key does not auto-repeat through the steps.
    const zoomDir = keyZoomDir(e.key, e.code);
    if (zoomDir && !typing && session && player.engaged) {
      e.preventDefault(); // ctrl/cmd +/- would otherwise also zoom the page
      if (!e.repeat) zoomBy(zoomDir);
    }
    // chat keys — only during an active engaged walk, never while typing
    // (guards home-base pet-name/friend-code/room-code inputs).
    if (session && player.engaged && !typing) {
      const digitPhrase = phraseIdForDigit(e.code);
      if (digitPhrase) { session.sendPhrase(digitPhrase); return; }
      if (e.code === 'Enter') { session.chatWheel?.openFromKeyboard?.(); return; }
      if (e.code === 'Escape') { session.chatWheel?.closeFromKeyboard?.(); return; }
    }
  });
  // Clan Life Part 2: a fight never waits in a hidden tab. Hiding the page
  // ends it the way the walk's end does: the intruder walks on, nothing paid.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) session?.clanFight?.abort();
  });
  // Mid-walk resume: the note of the walk in progress. Written every few
  // seconds by the render loop, and here the moment the game is hidden, which
  // on an iPad is the last thing that happens before it can be closed.
  // snapshotWalk gives null for a walk that cannot be picked up (a walk
  // together, the den) and writeResume ignores null.
  const noteWalk = () => {
    if (session) writeResume(window.localStorage, snapshotWalk(session, { yaw: player.viewYaw(), now: Date.now() }));
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) noteWalk(); });
  window.addEventListener('pagehide', noteWalk);
  let walkNoteAccum = 0;
  // Mouse wheel / trackpad zoom. Only cancelled (and only acted on) during an
  // engaged walk, so the browser's own ctrl+wheel zoom still works everywhere
  // else; a Mac trackpad pinch inside the game arrives here as ctrl+wheel and
  // zooms the camera instead of the page.
  const wheelStep = createWheelStepper();
  document.addEventListener('wheel', (e) => {
    if (!session || !player.engaged) return;
    e.preventDefault();
    const dir = wheelStep(e.deltaY, e.deltaMode, performance.now());
    if (dir) zoomBy(dir);
  }, { passive: false });
  document.addEventListener('mousedown', () => {
    if (isTouch) return; // touch snapping goes through tapWorld — a synthesized
    // mousedown from a button tap must not double-snap.
    if (session && player.engaged && session.cameraMode) snapPhoto(session);
  });

  // The cats that push the flaps and gaps this frame (refilled every frame,
  // never reallocated).
  const pushMovers = [];
  // The cat's paws for paws.update, mutated every frame rather than rebuilt
  // (pawprints.js reads the fields and keeps no reference).
  const pawState = { x: 0, z: 0, grounded: false };
  // The corner map's inputs, mutated every frame rather than rebuilt. The
  // remote dots come from a pool that only grows when a new co-walker joins.
  const mapView = { cx: 0, cz: 0, heading: 0 };
  const mapRemotes = [];
  const mapRemotePool = [];
  // The tree fade's look point (the cat at CAT_LOOK_Y), mutated every frame.
  const treeFadeLook = { x: 0, y: 0, z: 0 };
  // The fight camera frames the pair just above the fight sheet (Task 5b):
  // the sheet's height is fightui's --fight-sheet-h on #hud, an inline style
  // read (no layout), only while a fight is on.
  const hudEl = document.getElementById('hud');
  const mapFrame = { race: null, quest: null, scenics: null, visitedScenics: null, remotes: mapRemotes, camp: null, posts: null };
  // Mid-walk resume: pick up the walk the game was closed in. Last in init,
  // when everything a walk touches exists; the boot splash is still up, and
  // startWalk hides the home screen behind it (a visit celebration closes as
  // it does for any walk). The try is counted BEFORE the build: a walk that
  // cannot be rebuilt is settled on a later launch (RESUME_MAX_TRIES) rather
  // than tried forever.
  if (leftWalk?.kind === 'resume') {
    const note = markTried(window.localStorage, leftWalk.data);
    try {
      startWalk({ duskMode: note.dusk, areaOverride: note.areaId, resume: note });
    } catch (err) {
      console.warn('Whisker Walk: could not pick the walk up', err);
      clearResume(window.localStorage);
      if (!session) settleAbandoned(progression, note);
    }
  }
  renderer.setAnimationLoop(() => {
    // The 30 fps cap (game/adaptquality.js): a skipped refresh does nothing
    // at all, not even read the clock, so the next frame's dt covers both.
    if (session && !qualityAdapter.shouldRender(performance.now())) return;
    perfHud.frameStart(performance.now(), session);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!session) { perfHud.frameEnd(null, performance.now()); return; }
    // The corner map shows only while the walk is being played: not behind
    // the Ready? and pause cards, which are exactly the times the player is
    // not engaged. (The viewfinder hides it in hud.setCamera; the summary
    // comes after endWalk has disposed it.)
    if (session.minimap && session.minimapShown !== player.engaged) {
      session.minimapShown = player.engaged;
      if (player.engaged) session.minimap.show();
      else session.minimap.hide();
    }
    if (player.engaged) {
      // `waters` is v20's fourth argument: the area's water footprints, which
      // player.update blocks the cat out of unless Sea Legs is on. The den has
      // none and passes undefined, which the default handles.
      player.update(dt, session.areaData.colliders, session.areaData.bounds, session.areaData.waters);

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
      // skyLife (birds only; clouds live in render/clouds.js now) also stays on real dt
      // below. In a co-walk its rng is seeded from roomSeed, so partners draw the same
      // sequence of flock headings and gaps — but its timer counts down on each client's
      // own frame time from each client's own walk start, so flocks are only roughly in
      // step across clients, never identical. Slow-mo would just push this client's
      // flocks further out of step for no reason; nothing in the game reads a bird.
      if (session.slowmoTime > 0) session.slowmoTime -= dt;
      const wdt = session.slowmoTime > 0 ? dt * 0.35 : dt;
      session.critters.update(wdt, t, session.cat.position, session.cat.position);
      session.strayCats.update(wdt, t, session.cat.position, {
        stalking: player.stalking,
        catSpeed: player.speed,
        toy: session.toy,
      });
      session.clanCats.update(wdt, t, session.cat.position);
      session.intruders.update(dt, session.cat.position);
      session.toy.update(dt, session.areaData.bounds);
      // THE YARN BALL FLOATS — v20.
      //
      // The toy is bounds-only (deliberately: it is not the player, and giving
      // it a collider pass would change how it bounces off everything). Once
      // water blocks, a ball thrown into the pond is unreachable to a cat that
      // cannot swim, and unreachable here is a soft-lock rather than a
      // nuisance: interactions.js's doYarn refuses to throw a second ball
      // while one is active ("Go grab your yarn ball first!"), so the player
      // has no yarn at all until avatar.js's 25-second idle auto-retrieve
      // fires. Clamping the throw out of the water instead would break the
      // thing that makes the Docks fun, which is hurling the ball over the
      // canal. So the ball floats ashore.
      //
      // Only while it is ON the surface: toy.js rests it at its own 0.13
      // radius, so anything above 0.2 is still in flight and a ball sailing
      // over the canal is untouched. It drifts at 2.2 m/s — a slow current,
      // slower than a cat and slower than a rolling ball, so a ball skipping
      // across the water still goes where it was thrown and only the settled
      // one gets carried in. It aims at the same nearestDry the cat is pushed
      // out by, which beaches it exactly where the cat can reach it, and puts
      // it on the pier or a bridge deck when that is nearer than the shore.
      //
      // 0.5 is where the drift stops, measured the same way the cat's own
      // stand-off is: the cat is held 0.35 back from the waterline and bats
      // its ball from 0.5 (game/avatar.js), so a ball beached at 0.5 is
      // playable rather than parked in the surf just out of reach. Stopping at
      // the waterline itself would leave it half in the water and exactly on
      // the edge of the bat range.
      const toyPos = session.toy.mesh.position;
      // Gorge part 1: "on the surface" is measured from the ground under it.
      if (session.toy.active && toyPos.y - session.ground.y(toyPos.x, toyPos.z) <= 0.2 &&
          waterClearance(session.areaData.waters, toyPos.x, toyPos.z) < 0.5) {
        const dry = nearestDry(session.areaData.waters, toyPos.x, toyPos.z, 0.5);
        const dx = dry.x - toyPos.x;
        const dz = dry.z - toyPos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-4) {
          const step = Math.min(d, 2.2 * dt);
          toyPos.x += (dx / d) * step;
          toyPos.z += (dz / d) * step;
        }
      }
      session.weather.update(dt, camera.position, camera);
      // After the weather: a rainbow's sun write becomes the base the Gorge shades.
      session.areaLife.update(dt, t, session.cat.position, camera);
      session.secrets.update(dt, t, session.cat.position, player.speed);
      session.goldMice.update(t);
      // After player.update: a chase scamper overrides the cat's position.
      session.rival.update(dt, t, session.cat.position, session.cat);
      // v21 3b Task 16: the yard dog, after the rival (they share
      // session.chasing, so only one of them ever moves the cat at a time).
      session.dog.update(dt, session.cat.position, session.cat, { stalking: player.stalking });
      // Clan Life Part 2: the clan fight, after everything that can move the
      // cat (player.update, a chase): it writes the fighting cat's spot.
      session.clanFight.update(dt, session);
      // The fight camera, over the follow camera player.update placed: while a
      // fight is on, no tree hides either cat (src/fightcam.js).
      session.fightCam?.update(dt, {
        subject: session.clanFight.cameraSubject, cameraMode: session.cameraMode, camera, cat: session.cat.position,
        sheetTop: session.clanFight.cameraSubject ? sheetTopFrom(parseFloat(hudEl?.style.getPropertyValue('--fight-sheet-h')), window.innerHeight) : null,
      });
      // The tree fade, over the camera's final place this frame: a tree between
      // it and the cat (at CAT_LOOK_Y, the fight camera's look) turns
      // see-through. Materials only; the den's list is empty.
      treeFadeLook.x = session.cat.position.x;
      treeFadeLook.y = session.cat.position.y + CAT_LOOK_Y;
      treeFadeLook.z = session.cat.position.z;
      session.treeFade?.update(dt, camera, treeFadeLook);
      session.rustle?.update(dt, session.cat.position);
      // Gorge part 1: the paws' world height, the ground under the cat plus perchY.
      const pawsY = session.ground.flat ? player.perchY
        : session.ground.y(session.cat.position.x, session.cat.position.z) + player.perchY;
      const gm = session.goldMice.checkFind(session.cat.position, pawsY);
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
      session.race.update(dt, session.cat.position, camera);
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
        // v18 Task 1.4: a SECOND, dedicated tally alongside the unchanged
        // award — same reasoning as the perch tally in
        // game/interactions.js, never a retyping. 'goal' is shared with the
        // three ordinary per-walk goal completions, so feats.goal reaches 3
        // in a single normal walk and could never mean "finished the race 3
        // times"; retyping this award would instead change what the walk
        // summary and the goals system see. Points and the discovery-log
        // line are untouched.
        //
        // GATED ON THE AWARD ACTUALLY PAYING (v18 final review). race.js's
        // state machine is idle→running→done with no path back, so this
        // branch cannot re-fire within a walk today and the gate is a no-op
        // in practice. It is here because the ungated shape is what made
        // feats.perch farmable: any future edit that lets a walk re-enter
        // 'running' would otherwise reopen the same hole silently. The
        // awardOnce return (0 when already seen this walk, points otherwise)
        // is the same per-walk dedup the perch tally now rides.
        const racePaid = log.awardOnce('goal', 'race-done', session.race.finishLabel);
        if (racePaid > 0) progression.recordFeat?.('race');
        session.fx.burst(session.cat.position, 0xffe27a, 14);
      }
      session.tippables.update(dt);
      session.knockables.update(dt); // v21 3b: a knocked thing's fall off its ledge
      session.carry.items.update(dt); // v21 3b: a held thing follows its holder's mouth
      tickCarryRain(session, dt); // v21 3b: falling rain loosens the grip; the item slips
      session.scent.update(dt);
      session.fx.update(dt, camera);
      session.skyLife.update(dt);
      // Water and wind both stay on REAL dt/t, never the slow-mo `wdt` above.
      // The slow-mo beat exists to slow CRITTERS for a pounce; dragging the
      // canal and the foliage down with them reads as the whole world
      // lurching, which is the same reason skyLife and weather sit here.
      session.water.update(dt);
      session.waterDress.update(dt);
      // Re-fits the sun's shadow frustum around the view. It reads where the
      // camera ended up this frame, which is why it
      // has to sit AFTER player.update above (which is what moves the camera)
      // and before renderFrame() below. It is inside the `player.engaged`
      // block for the same reason: when the player is not engaged the camera
      // is not moving, so there is nothing to re-fit. Gorge part 1: it also
      // takes the ground under her cat (0 on every shipped map), which it
      // eases over dt.
      session.shadows.update(session.ground.y(player.position.x, player.position.z), dt);
      // Wind takes ABSOLUTE elapsed time (the same `t` goldMice.update gets),
      // not a delta: every rotation is recomputed as a pure function of `t`,
      // so there is no running total to drift. Intensity is the only place
      // weather touches it — the module never imports weather.js itself, it
      // just takes the hint. 1.7 is "noticeably windier" and well under the
      // module's storm ceiling of 2.
      session.wind.update(t, session.weather.condition === 'rain' ? 1.7 : 1);
      // The lawn tufts take the same t and intensity as wind, and read the
      // camera, so this sits after player.update like shadows.update above.
      session.grass.update(t, session.weather.condition === 'rain' ? 1.7 : 1);
      // Paw prints, after player.update so they follow this frame's paws. Only
      // a cat with its paws on the ground prints: not perched, not mid-pounce
      // (hopY), not swimming. The trail itself ignores a cat that isn't moving.
      pawState.x = session.cat.position.x;
      pawState.z = session.cat.position.z;
      pawState.grounded = !session.perched && player.perchY === 0 && !(player.hopY > 0) && !player.inWater;
      session.paws.update(dt, pawState);
      // Clouds take the same absolute t and follow the camera, so after player.update too.
      session.clouds.update(t);
      session.ambient.update(t, session.weather.condition === 'rain' ? 1.7 : 1);
      session.remotes.update(dt, nowSec(), session.areaData.waters);
      // Splashes, ripples and the wake for my cat, then each placed co-walker.
      session.splash.track(player.waterState, session.cat.position.x, session.cat.position.z, session.cat.rotation.y, player.speed, session.cat.scale.y, dt, player.hopY);
      for (const r of session.remotes.list) {
        if (r.water.placed) session.splash.track(r.water, r.group.position.x, r.group.position.z, r.group.rotation.y, r.speed, r.group.scale.y, dt);
      }
      session.fish.update(dt);
      session.splash.update(dt);
      // v21 3b Task 14: every cat on my screen pushes the flaps and gaps — mine
      // first, then my co-walkers' as remotecats.js has just placed them — so
      // a partner's push swings them here with no wire event. Only my own push
      // makes a sound: a flap's soft thunk, a hedge's rustle.
      pushMovers.length = 0;
      pushMovers.push(session.cat.position);
      for (const r of session.remotes.list) pushMovers.push(r.group.position);
      for (const push of session.pushThroughs.update(dt, pushMovers)) {
        if (push.by === 0) (push.kind === 'gap' ? audio.zoomWind() : audio.landThump());
      }
      // The corner map, after remotes.update so co-walker dots sit where
      // their cats are this frame. It throttles and skips repaints itself.
      if (session.minimap) {
        const f = player.forward();
        mapView.cx = session.cat.position.x;
        mapView.cz = session.cat.position.z;
        mapView.heading = Math.atan2(-f.x, -f.z);
        mapFrame.race = session.race;
        mapFrame.quest = session.quest;
        mapFrame.scenics = session.areaData.scenics;
        mapFrame.visitedScenics = session.scenicsVisited;
        mapFrame.camp = session.campMarker;
        mapFrame.posts = session.postMarkers;
        mapRemotes.length = 0;
        for (const r of session.remotes.list) {
          let dot = mapRemotePool[mapRemotes.length];
          if (!dot) { dot = { x: 0, z: 0, color: 0 }; mapRemotePool.push(dot); }
          dot.x = r.group.position.x;
          dot.z = r.group.position.z;
          dot.color = coatColor(r.breed, r.look);
          mapRemotes.push(dot);
        }
        session.minimap.update(mapView, mapFrame);
      }
      session.chatBubbles?.update();
      session.ghosts.update(dt, t);
      session.denCats.update(dt, t, session.cat.position);
      // Wave 2.1's contact decals. Takes no dt — like session.shadows.update()
      // it is a pure function of where things ENDED UP this frame, so its only
      // requirement is ordering: it must run after everything that owns a
      // decal has already moved. That is player.update (the cat), the
      // critters/strays updates near the top of this block, and ghosts.update
      // immediately above — hence its position here at the end of the movers
      // rather than beside session.shadows.update(). Only the mover mesh is
      // touched; the static props' matrices were written once at build.
      session.decals.update();
      // ghost ball is only shown (and batable) while I don't already have my
      // own active toy out, and its last report is fresh — a remote who went
      // quiet (despawned, dropped) shouldn't leave a phantom ball behind.
      if (session.remoteToy && !session.toy.active && nowSec() - session.remoteToy.at < 1) {
        session.toyGhost.visible = true;
        const [rx, rz] = session.remoteToy.pos;
        session.toyGhost.position.set(rx, session.ground.y(rx, rz) + 0.13, rz);
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
    // Before the draw, never after: a pixel-ratio change reassigns
    // canvas.width, which clears the buffer, so doing it after renderFrame()
    // would present a blank frame (a visible flash at a step-down).
    qualityAdapter.frame(session, performance.now());
    renderFrame();
    perfHud.frameEnd(session, performance.now());
    // Mid-walk resume: note the walk every 5 s. After the draw on purpose: a
    // walk picked up again that cannot get through a frame never reaches
    // this, so its count of failed tries stands and the next launch but one
    // opens at home.
    if (session) {
      walkNoteAccum += dt;
      if (walkNoteAccum >= 5) {
        walkNoteAccum = 0;
        session.resumeTries = 0;
        noteWalk();
      }
    }
  });
}
