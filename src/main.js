import * as THREE from 'three';
import { bus } from './events.js';
import { createPlayer } from './player.js';
import { coatColor, CAT_LOOK_Y } from './cat/model.js';
import { resumableAreaIds, roofsOn } from './roofsflag.js';
import { marketOn, marketResumable } from './marketflag.js';
import { housePrefetch, resumableHouseIds } from './houseflag.js';
import { lighthouseOn } from './lighthouseflag.js';
import { greenhouseOn } from './greenhouseflag.js';
import { teleLoad } from './telehook.js';
import { moonOn } from './moonflag.js';
import { reefOn } from './reefflag.js';
import { crystalOn } from './crystalflag.js';
import { PERSONALITIES } from './cat/brain.js';
import { createProgression, rankFor, CATALOG } from './progression.js';
import { colonyNews, tradeEffect } from './colony.js';
import { renderNewsHtml } from './ui/colonypanel.js';
import { buildEnvMap } from './render/materials.js';
import { createDiscoveryLog } from './discoveries.js';
import { createHud } from './ui/hud.js';
import { createPerfHud } from './ui/perfhud.js';
import { BUILD_STAMP } from './buildstamp.js';
import { createHomeBase } from './ui/homebase.js';
import { whenSplashGone, startVisitGreeting } from './visitboot.js';
import { detectTouch, createTouchUI, onFirstTouch } from './ui/touchui.js';
import { attachBackStack, walkBackAction, padBackAction } from './ui/backstack.js';
import { createGamepad } from './gamepad.js';
import { yOpensDen } from './gamepadinput.js';
import { answerChallenge } from './ui/fightui.js';
import { createNav } from './gamepadnav.js';
import { createZoomControl, createWheelStepper, keyZoomDir, zoomActionDir, clampZoomStep, maxZoomStep } from './camzoom.js';
import { createAudio } from './audio.js';
import { createMusic } from './music.js';
import { birthdayTune } from './birthdaysong.js';
import { createSamples } from './samples.js';
import { voiceFor } from './catvoice.js';
import { createAlbum } from './album.js';
import { askToKeepSaves } from './savekeep.js';
import { createSettings } from './settings.js';
import { startProfile, markTouch } from './profile.js';
import { createTvLoader, tvWanted, tvHooks, watchForTv } from './tvseam.js';
import { coop, coopMode } from './coopseam.js';
import { createConfirmCard } from './ui/confirmcard.js';
import { createBlockList } from './blocklist.js';
import { readCatKey } from './catkey.js';
import { deviceMetPlayers } from './metplayers.js';
import { phraseIdForDigit } from './chatkeys.js';
import { createCloudToast, createCloudSync } from './game/cloudsync.js';
import { createColonySync } from './game/colonysync.js';
import { createOnlineDelete } from './game/onlinedelete.js';
import { createNetEvents } from './game/netevents.js';
import { createPhotoMode } from './game/photo.js';
import { createInteractions } from './game/interactions.js';
import { createAvatarUpdater } from './game/avatar.js';
import { createRooms } from './game/rooms.js';
import { createNearby, pickBridge, NEARBY_EVENT } from './game/nearby.js';
import { createHomebaseCloud } from './game/homebasecloud.js';
import { createComposerRig } from './game/composer.js';
import { createQualityAdapter } from './game/adaptquality.js';
import { parseForcedRung } from './render/quality.js';
import { readDeviceProfile, DEVICE_EVENT } from './render/deviceprofile.js';
import { releaseThumbnails } from './thumbnails.js';
import { createHaptics, hapticForDiscovery } from './haptics.js';
import { createTips, climbBadge } from './game/tips.js';
import { createGuideWalk } from './game/guidewalk.js';
import { createGuideBubble } from './ui/guidebubble.js';
import { createButtonUses } from './ui/buttonwords.js';
import { tickAutoSniff } from './game/autosniff.js';
import { createAreaLoader } from './game/areaload.js';
import { effectiveArea } from './edition.js';
import { createWalkLifecycle, chatHintLine, pauseCardFor, takeStartLines, resumeLabel, cardMode, SKIP_LESSON_ID, PAUSE_SOUND_ID, PAUSE_MUSIC_ID, PAUSE_VIEW_CLASS, pauseSoundOf } from './game/walk.js';
import { applyDenSpot } from './game/denlive.js';
import { createLazyDenShop } from './ui/denshoplazy.js';
import { nowSec } from './game/util.js';
import { shareYarn, toyForState } from './game/yarnshare.js';
import { liftForState } from './remotecats.js';
import { placeInMouth } from './carryables.js';
import { hintMax } from './hints.js';
import { line as tutorialLine } from './tutorialwords.js';
import { setTextureAnisotropy } from './render/textures.js';
import { waterClearance, nearestDry } from './world/builder.js';
import { takeArrivalLine } from './housecats.js';
import { takeMoveLines } from './fightmoves.js';
import { createCrossing, swallowsCanvasClick } from './game/crossing.js';
import { createFindCard, shadowMinPartNow } from './game/findcard.js';
import { findBusy, handleFindArrival } from './foundwear/play.js';
import { tickFindNose } from './foundwear/live.js';
import { readResume, writeResume, clearResume, snapshotWalk, settleAbandoned, pickUpWalk } from './game/walkresume.js';
import { sheetTopFrom } from './fightcam.js';
import { diagnostics, note, crumb, listenForErrors } from './diagnostics.js';
import { createFrameGuard, claimAutoReload, stuckNoticeHtml, WALK_ENDED_LINE, RELOAD_BUTTON_ID } from './game/recovery.js';

// Uncaught errors and rejections anywhere in the page go into the small
// diagnostics record (src/diagnostics.js) the perf readout shows a grown-up.
// Recorded, not swallowed: the console still gets them. First, so a failure
// during boot is caught too.
listenForErrors(window);

// stable per-browser identity for co-walk rooms — generated once and cached,
// survives reloads so a mid-walk refresh doesn't orphan a room membership.
// Read through readCatKey (src/catkey.js): a cat loaded from the cloud brings its
// own id, and the page reloads once so everything below sees that id. Storage
// that is unavailable (private mode, quota) still gives an id for this session.
const pid = readCatKey(window.localStorage).id;

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
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((err) => note('sw', err));
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
} catch (err) {
  renderer = null;
  note('gl', err);
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
  const progression = createProgression(window.localStorage);
  // Fire and forget: asks the browser not to clear the save under storage pressure.
  askToKeepSaves();
  const album = createAlbum(window.localStorage);
  const settings = createSettings(window.localStorage);
  // The layout profile writes html.<profile> and body.touch-mode (the one writer, src/profile.js).
  startProfile(window, document, () => settings.get('profileOverride'));
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
  const perfHud = createPerfHud({ renderer, settings, coarse, adapter: qualityAdapter, diagnostics, build: BUILD_STAMP });
  // Haptics (src/haptics.js): the app's bridge on an iPhone (an iPad in the
  // app says it has no Taptic Engine, so stays still), navigator.vibrate on a
  // touch device that has it (desktop Chrome has the function but no motor,
  // hence `coarse`), else nothing. The game's moments reach it through the
  // bus below, never from game code directly.
  const haptics = createHaptics({
    bridge: window.webkit?.messageHandlers?.haptic ?? null,
    deviceHaptics: readDeviceProfile(window)?.haptics === true,
    vibrate: coarse && typeof navigator.vibrate === 'function' ? (pattern) => navigator.vibrate(pattern) : null,
    now: () => performance.now(),
    enabled: settings.get('haptics'),
  });
  const log = createDiscoveryLog(progression);

  // Cloud save wiring (lazy capability handles + the home base's Sync ☁️
  // panel) lives in src/game/cloudsync.js — created here, alongside the other
  // system factories, so every later call site sees it already built.
  // getCloud is null until a walking name is saved (togetherAllowed);
  // onlineAllowed is the wider "a name or a linked cloud save", which the
  // nearby search waits for; openCloud, for Delete my online data only.
  const { getPsecret, getCloud, openCloud, onlineAllowed, togetherAllowed, sync } = createCloudSync({
    MP,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    storage: window.localStorage,
    progression,
    album,
    cloudToast,
    pid,
    met: deviceMetPlayers(),
    blocked: blockList,
    // cat login, milestone 2: a catch-up changes the save only on the home screen
    // (never in a walk), and tells the Cloud save sheet when it has something to say
    atHome: () => !session,
    onCatStatus: () => { try { homebase.refreshSync(); } catch { /* the home screen is not built yet */ } },
    onApplied: () => { try { homebase.refresh(); } catch { /* the home screen is not built yet */ } },
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
  audio.setVoiceHook?.(() => music.duck());
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
    area: () => session?.areaId,
    onCapped: () => hud.toast(session?.areaId === 'crystal' ? 'The cave can’t zoom out any more 💎' : session?.areaId === 'treehouse' ? 'The leaves are in the way of zooming out any more 🌳' : 'The den can’t zoom out any more 🏠'),
  });
  const zoomBy = (dir) => {
    if (session && player.engaged) zoomControl.step(dir);
  };
  // Each touch button keeps its small word until it has been used twice
  // (ui/buttonwords.js): counted here, when a button does its thing in a walk.
  const buttonUses = createButtonUses(window.localStorage);
  const touchUI = createTouchUI(document.getElementById('hud'), {
    onMove: (v) => player.setTouchMove(v),
    onOrbit: (dx, dy) => player.addOrbit(dx, dy),
    onKick: (v) => player.setKick(v), // the touch kick button held (the Reef; the button is the pounce slot)
    onAction: (name) => {
      // The challenge pill (Fight! / Back off) is E and Q on a keyboard: Square and Circle on a pad.
      if (answerChallenge(session?.clanFight, name)) return;
      const zoomDir = zoomActionDir(name);
      if (zoomDir) zoomBy(zoomDir);
      else {
        handleTouchAction(name);
        if (session && player.engaged && buttonUses.use(name)) touchUI.setLabels(buttonUses.words());
      }
    },
    onZoom: zoomBy,
  }, { leftHanded: settings.get('leftHanded') });
  // Game controller (walk only, gamepad.js): feeds the same paths as touch —
  // setTouchMove / addOrbit / handleTouchAction / zoomBy. Polled from walkFrame.
  const gamepad = createGamepad({
    getEngaged: () => !!session && player.engaged,
    getCameraMode: () => !!session?.cameraMode,
    isFighting: () => session?.clanFight?.uiShowing === 'fight',
    isWalkingOn: () => !!session?.walkingOn,
    // Menus: the pad moves focus through whatever layer is on top; B is Back
    // (padBack, below), never a fake Escape. A walk keeps the pad otherwise.
    menuNavFactory: () => createNav({ doc: document }),
    padBack: () => padBack(),
    canResume: () => !!session && !session.walkingOn && !!overlay.querySelector('#btn-resume'),
    onMove: (v) => player.setTouchMove(v),
    onOrbit: (dx, dy) => player.addOrbit(dx, dy),
    onKick: (v) => player.setKick(v), // A held: the Reef's kick (nothing floats elsewhere)
    onAction: (name) => {
      // Square and Circle answer the challenge pill, same as the touch buttons (they used to fall through to a plain interact / meow).
      if (answerChallenge(session?.clanFight, name)) return;
      // Y / Triangle opens the den panel on a den walk (photo mode stays on its touch and key buttons there).
      if (yOpensDen(name, denShop.isActive, session?.cameraMode)) { denShop.open(); return; }
      const zoomDir = zoomActionDir(name);
      if (zoomDir) zoomBy(zoomDir);
      else handleTouchAction(name);
    },
    // No mouse to click for pointer lock, so a pad resumes the way touch does.
    onResume: () => player.setTouchEngaged(true),
    toast: (m) => hud.toast(m),
    onPadUse: (i) => { if (tvHooks.padUse) tvHooks.padUse(i); else padHintsOn(i); tvOffer(); },
    onPadConnect: (i) => tvHooks.padConnect?.(i),
    onPadDisconnect: (i) => tvHooks.padDisconnect?.(i),
    onMenuButton: (i) => denShop.padButton(i) || (tvHooks.button?.(i) ?? false),
    onLook: (rad) => homebase.spinHero(rad),
  });
  // Pushes every live-tunable setting into the systems that read it — audio
  // volume/mute, camera invert-Y, touch-UI handedness — so a change applies
  // immediately with no reload or walk restart. Called once at boot (with
  // whatever was persisted) and again after every homebase settings change
  // and the M-key mute toggle below. (settings.reducedMotion isn't pushed
  // here — weather/animateCat read it directly at the point of use, since
  // those only apply per-walk/per-frame rather than to a live object.)
  let loadCouch; // couch play's chunk: loads once, when it is wanted (set below; null after)
  function applySettings() {
    audio.setVolume(settings.get('volume'));
    audio.setMuted(settings.get('muted'));
    music.setVolume(settings.get('musicVolume'));
    music.setMuted(settings.get('muted'));
    player.setInvertY(settings.get('invertY'));
    touchUI.setLeftHanded(settings.get('leftHanded'));
    touchUI.setZoomButtons(settings.get('zoomButtons'));
    // With ?perf the readout stays on even if the Settings box is unchecked, by design.
    perfHud.setEnabled(settings.get('perfReadout') || perfFlag);
    haptics.setEnabled(settings.get('haptics'));
    loadCouch?.(); // switched on in Settings: no reload
  }
  applySettings();
  // TV mode: its own lazy chunk (src/tv/), loaded only when the switch is on.
  // Nothing else in start-up may import src/tv/ (the build checks).
  // Bare home screen: no walk, no summary, no sheet or card, the visit celebration not up.
  const homeClear = () => !session && !summaryUp() && homebase.depth() === 0 && !homebase.visitOpen() && !document.getElementById('homebase').classList.contains('hidden');
  const tvContext = () => ({ doc: document, win: window, settings, toast: (m) => hud.toast(m), padInfo: () => gamepad.padInfo(), homeClear, createConfirmCard, enable: () => { tvLoader.apply(true); homebase.refresh(); } });
  // A pad used full-screen on a big display, at home: offer TV mode, once per page load.
  // A pad without TV mode: its first use loads the small hint translator (keys -> buttons), then says so again.
  let padHintsLoading = false;
  const padHintsOn = (i) => {
    if (padHintsLoading) return;
    padHintsLoading = true;
    import('./tv/index.js').then((m) => { m.startLite(tvContext()); tvHooks.padUse?.(i); }).catch((err) => { padHintsLoading = false; note('tv', err); });
  };
  const tvOffer = watchForTv({ win: window, settings, homeClear, onOffer: () => import('./tv/index.js').then((m) => m.offer(tvContext())).catch((err) => note('tv', err)) });
  const tvLoader = createTvLoader({
    load: () => import('./tv/index.js'),
    ctx: tvContext,
    settings,
    onFail: (err) => {
      note('tv', err);
      hud.toast(tutorialLine('pad.settings.tv-failed'));
      homebase.refresh();
    },
  });
  // Couch play (src/coop/): the Settings switch "Two-player couch mode" (per device), or ?coop=1 for this page load; ?coop=0 turns it off for this load.
  const couchOn = () => coopMode(location.search, settings.get('couchMode'));
  // The crash log (src/crashlog.js, its own small chunk): a sanitised copy of the last failures on this device, and,
  // only if "Send crash reports" is switched on in Settings, one upload per new failure. Never blocks start-up.
  import('./crashlog.js').then((m) => m.startCrashLog({
    diag: diagnostics,
    storage: window.localStorage,
    settings,
    context: () => ({
      place: session?.areaId ?? 'home',
      build: BUILD_STAMP,
      tier: `${['phone', 'tablet', 'laptop', 'tv'].find((c) => document.documentElement.classList.contains(c)) ?? 'desktop'}/${session?.tier?.name ?? 'none'}`,
      couch: couchOn(),
      room: !!session?.net,
    }),
    send: m.liveSender({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY }),
  })).catch(() => {});
  loadCouch = () => {
    if (!couchOn()) return;
    loadCouch = null;
    import('./coop/index.js').then((m) => m.start({ nav: navigator, enabled: couchOn, getSession: () => session, player, camera, getState: () => progression.state, catalog: CATALOG, progression, log, audio, act: (n) => handleTouchAction(n), couch: qualityAdapter.couch, voice: (p) => catVoice(p), toast: (m, p, o) => hud.toast(m, p, o), resume: () => player.setTouchEngaged(true), canResume: () => !!session && !session.walkingOn && !!overlay.querySelector('#btn-resume') })).catch((err) => note('coop', err));
  };
  loadCouch();
  // ?tv=1 / ?tv=0 force it for this page load only, never saved (like ?perf).
  tvLoader.apply(tvWanted(location.search, settings.get('tvMode')), /[?&]tv=[01]\b/.test(location.search));
  // The pause card's Sound and Music switches (walk.js pauseCardFor) change
  // the same settings as the Sound & controls sheet: Sound is "Mute all
  // sound" turned round, Music is the music volume at 0 or not. Music back on
  // returns the volume it had before it was turned off.
  const MUSIC_BACK_ON = 0.5;
  let musicBefore = settings.get('musicVolume') > 0 ? settings.get('musicVolume') : MUSIC_BACK_ON;
  const pauseSound = () => pauseSoundOf(settings);
  function setPauseMusic(on) {
    const now = settings.get('musicVolume');
    if (!on && now > 0) musicBefore = now;
    settings.set('musicVolume', on ? (musicBefore > 0 ? musicBefore : MUSIC_BACK_ON) : 0);
  }
  // The hints on a walk (src/game/tips.js): one line the first time something
  // comes up. Begun on the walk's first engage, ended with the walk.
  // The guided first walk and the first camp walk (src/game/guidewalk.js) use
  // the same bubble, with a ring round the real control (ui/guidebubble.js);
  // the hints begin, update and end them (their `coach`).
  const bubble = createGuideBubble({ hud, getIsTouch: () => isTouch, getReduced: () => settings.get('reducedMotion') === true });
  const guideWalk = createGuideWalk({
    player, progression, settings, hud, audio, bubble, touchUI,
    getIsTouch: () => isTouch,
    // canFeedStray is interactions.js's, made further down; only called on a walk.
    canFeedStray: (s, stray) => canFeedStray(s, stray),
    // A lesson that ends or is skipped changes the pause card under it.
    onLessonChange: (s) => { if (s === session && overlay.querySelector('#btn-resume')) overlay.innerHTML = pauseCardFor(s, isTouch, pauseSound()); },
  });
  const tips = createTips({ player, progression, settings, hud, getIsTouch: () => isTouch, bubble, coach: guideWalk });
  // routed through handleTouchAction('interact') rather than calling
  // handleInteract directly so the prompt-pill tap shares the exact same
  // session/engaged guard as every other touch action.
  hud.onPromptTap(() => handleTouchAction('interact'));
  onFirstTouch(() => {
    if (isTouch) return;
    isTouch = true;
    player.setTouchMode(true);
    markTouch();
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
  // Development server only (import.meta.env.DEV is false in every build, so
  // this line is not in one): a handle for checking a walk by script from the
  // browser's console. Nothing in the game reads it.
  if (import.meta.env.DEV) window.__ww = { get session() { return session; }, player, progression };

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
    // World map step 3: a room walks on together (src/game/crossing.js).
    onWalkOn: (s, ev) => crossing?.onRemoteWalkOn(s, ev),
    onWalkOnAsk: (s, ev) => crossing?.onWalkOnAsk(s, ev),
    onWalkOnHave: (s, ev) => crossing?.onWalkOnHave(s, ev),
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
    doMeow, doPounceOrClimb, doCameraToggle, handleTouchAction,
    updateInteractions, awardStrayGreet, handleInteract, tickCarryRain, endClanPatrol, canFeedStray,
  } = createInteractions({
    MP, pid, getCloud, getPsecret,
    getSession: () => session,
    getIsTouch: () => isTouch,
    player, progression, log, hud, audio, catVoice, snapPhoto,
    petNameFor, completeBoop, colonySync,
    askCrossing: (s, d) => crossing?.ask(s, d),
    // World map step 3: a gate's cards, and the place beyond fetched as she
    // nears a gate she can go through or open.
    askGate: (s, d) => crossing?.askGate(s, d),
    askGateBuy: (s, d) => crossing?.askGateBuy(s, d),
    prefetchArea: (id) => areas.prefetch(id),
  });

  // Per-frame avatar/moment updates (src/game/avatar.js).
  const { updateAvatar, updateMoments } = createAvatarUpdater({
    player, progression, settings, log, hud, audio,
    petNameFor, completeTag, noteBat,
  });

  // F6: the place loader (game/areaload.js). Made before the rooms, which
  // start fetching a gathered start's place (prefetchArea), and the walk
  // lifecycle below, which waits for it.
  const areas = createAreaLoader();
  // Co-walk room lobby + profile push (src/game/rooms.js). It owns
  // pendingRoom; the walk lifecycle reads it back through getPendingRoom /
  // clearPendingRoom below. Its startWalk is the walk's startWalkWhenReady
  // (a room start waits for its place like any start), passed as a thunk
  // because it is declared further down — nothing can reach it before init()
  // returns.
  const {
    rooms, pushProfileNow, getPendingRoom, clearPendingRoom, startRoomTogether,
  } = createRooms({
    MP, pid,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    progression, getCloud, getPsecret, colonySync, onlineAllowed: togetherAllowed,
    getIsTouch: () => isTouch,
    getSession: () => session,
    startWalk: (opts) => startWalkWhenReady(opts),
    prefetchArea: (id) => areas.prefetch(id),
    toast: cloudToast,
  });
  // Nearby one-tap joining (src/game/nearby.js): in the app, the shell finds
  // rooms hosted on the same local network and the home base offers a Join
  // with no code to type. Made after the rooms, whose changes it follows, and
  // before the home base, which tells it what is showing. In a browser there
  // is no bridge: the event never fires and nothing is drawn.
  const nearby = createNearby({
    bridge: pickBridge(window), storage: window.localStorage, rooms,
    getName: () => progression.state.petName,
    onlineAllowed,
  });
  window.addEventListener(NEARBY_EVENT, (e) => nearby.receive(e.detail));
  // Put away (another app, the screen locked): nothing is looked for and
  // nothing is findable until the game is back in front.
  const nearbySeen = () => nearby.setVisible(!document.hidden);
  nearbySeen();
  document.addEventListener('visibilitychange', nearbySeen);

  // The den shop, inside the den (src/ui/denshopview.js): pauses like ⏸ and
  // walks on like the pause card's explore button.
  const denShop = createLazyDenShop({
    hud, progression, sync, player, applyDenSpot, bus,
    getSession: () => session,
    pause: () => handleTouchAction('pause'),
    resume: () => resumeWalk(),
    onHomeClosed: () => homebase.refresh(), // points and the Menu tile's count may have changed
    onUnavailable: () => cloudToast('The den needs a moment. Try again!'),
  });

  // The walk lifecycle (src/game/walk.js). main.js keeps the `session`
  // binding — the render loop, keydown handlers and discovery bus all read
  // it — and hands the module accessors for it. getHomebase is a thunk
  // because homebase is created below (it takes beginWalkFromHomebase as its
  // Start handler), and nothing calls back into it before init() returns.
  //
  // F6: every place is its own download. `areas` (game/areaload.js, made
  // above the rooms) fetches and keeps them; every walk start goes through
  // startWalkWhenReady, which waits for its place with home up, and a place
  // that does not come is one gentle line on the home screen (cloudToast).
  const {
    beginWalkFromHomebase, beginDenWalk, startWalkWhenReady, endWalk, takeCrossing, walkOn,
  } = createWalkLifecycle({
    MP, pid, coarse, envMap, overlay, blockList,
    renderer, camera, composerRig,
    player, progression, settings, hud, audio, music, log, touchUI, catVoice,
    album,
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
    // Mid-walk resume: an ended walk leaves nothing to pick up. Nor does a
    // purr outlive the walk it was in.
    onWalkEnded: () => { clearResume(window.localStorage); haptics.stopPurr(); tips.end(); },
    buttonUses,
    areas,
    homeToast: cloudToast,
    // World map step 3: a walk-on banks the walk without a summary, so what
    // the summary would have said is toasted in the next walk, and the save
    // goes up as the summary's Continue would send it. A walk-on that waits
    // for its place pauses the walk as ⏸ does.
    onWalkedOn: (lines) => { for (const l of lines) hud.toast(l); sync.autoSync(); },
    releaseControl: () => handleTouchAction('pause'),
  });
  // resumeWalk is a hoisted function declaration, so it is safe to pass here.
  crossing = createCrossing({
    getSession: () => session,
    overlay, hud,
    releaseControl: () => handleTouchAction('pause'),
    resumeWalk, endWalk,
    getIsTouch: () => isTouch,
    getEdition: () => progression.state.edition,
    getSound: pauseSound,
    prefetchArea: (id) => areas.prefetch(id),
    walkOn, progression,
    // A room walks on together: who is in it (every member's room profile),
    // its net, and the place load every device waits for before anyone moves.
    getRoster: () => getPendingRoom()?.roster ?? [],
    getRoomNet: () => getPendingRoom()?.net ?? null,
    ensureArea: (id) => areas.ensure(id),
  });
  // Found outfits: the find card (src/game/findcard.js), Wear it / Later in
  // the pause overlay. Wear it dresses her cat in place, at the shadow trim
  // the walk is on now, and shows her new look to the room and the cloud.
  const findCard = createFindCard({
    getSession: () => session,
    overlay,
    releaseControl: () => handleTouchAction('pause'),
    resumeWalk,
    progression,
    getIsTouch: () => isTouch,
    onLookChanged: () => { rooms.retrackProfile(); pushProfileNow(); },
    shadowMinPart: (s) => shadowMinPartNow(s.tier, qualityAdapter.status.rung),
    getSound: pauseSound,
  });

  // Player pets 🐾🐾 roster, friend codes and the hide list: the home base's
  // adapter over the gated cloud handle (src/game/homebasecloud.js).
  const homebaseCloud = createHomebaseCloud({ MP, pid, getCloud, getPsecret, onlineAllowed: togetherAllowed, pushProfileNow, blockList });
  // "Delete my online data" on the Cloud save sheet (src/game/onlinedelete.js).
  const onlineDelete = createOnlineDelete({ MP, pid, getCloud: openCloud, getPsecret, sync, progression });
  const homebase = createHomeBase({ progression, album, onStartWalk: beginWalkFromHomebase, rooms, sync, onlineDelete, cloud: homebaseCloud, settings, onSettingsChange: applySettings, onTvChange: (on) => tvLoader.apply(on), onVisitDen: beginDenWalk, onOpenDen: (o) => denShop.openHome(o), colonySync, myId: pid, toast: cloudToast, onCelebrate: () => audio.unlockFanfare(), onBirthdaySong: () => audio.playTune(birthdayTune(), settings.get('musicVolume')), onAudioWake: () => { const c = audio.getContext(); if (c.state === 'suspended') c.resume?.()?.catch?.(() => {}); }, onCardsClosed: () => showColonyNews([]), haptics: haptics.available, nearby, getIsTouch: () => isTouch });
  // Visit milestones: count this open before show(), so the header badge has
  // the number. A milestone's celebration comes before every other card; the
  // farewell and the news follow once it closes. A plain visit shows the
  // welcome line, the farewell goes up straight away and the news on the pull.
  // Mid-walk resume (src/game/walkresume.js): the note of a walk the game was
  // closed in the middle of. Read once, here. A walk left too long is settled
  // now, before the home screen draws its numbers; one still fresh is picked
  // up at the end of init (see "Mid-walk resume" above the render loop).
  const leftWalk = readResume(window.localStorage, { now: Date.now(), areaIds: resumableHouseIds(marketResumable(resumableAreaIds(progression.state.walks)), progression.state) });
  if (leftWalk?.kind === 'stale') {
    clearResume(window.localStorage);
    settleAbandoned(progression, leftWalk.data);
  }
  // A launch that picks a walk up again is not a new visit: nothing is
  // counted, so a milestone celebration (and Rosa's farewell, below) is not
  // used up behind a walk and waits for a launch that opens at home.
  const resuming = leftWalk?.kind === 'resume';
  const visit = resuming ? { visits: progression.state.visits, milestone: null } : progression.recordVisit();
  homebase.show();
  // A linked device asks the cloud once, now that the home screen is up, whether
  // another device saved (src/game/catsync.js). Nothing for a device that never
  // linked, and never over a walk picked up again.
  if (!resuming) sync.catchUp().catch(() => {});
  // F6: fetch her own place and the den now, so Explore and the den button
  // usually find them already here. ?roofs=1 fetches the Rooftops too (her
  // Explore goes there), and ?house=1 the Old House (in Clan Edition only,
  // housePrefetch); otherwise a Rooftops
  // choice or the gate prefetch does. A failure here is quiet: the start
  // itself tries again, and says so if it cannot.
  areas.prefetch(effectiveArea(progression.state, CATALOG));
  areas.prefetch('den');
  if (roofsOn()) areas.prefetch('roofs');
  if (marketOn()) areas.prefetch('market');
  if (lighthouseOn()) areas.prefetch('lighthouse');
  if (greenhouseOn()) areas.prefetch('greenhouse');
  teleLoad(effectiveArea(progression.state, CATALOG)); // ?gates=1 only: the teleport gates' pieces (src/telehook.js)
  if (moonOn()) areas.prefetch('moon');
  if (reefOn()) areas.prefetch('reef');
  if (crystalOn()) areas.prefetch('crystal');
  if (housePrefetch(progression.state)) areas.prefetch('house');
  // Rosa's one-time farewell goes up before the news (showNews yields while it is up).
  const showFarewell = () => {
    if (resuming) return; // kept for a launch that opens at home
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
    haptics.play(hapticForDiscovery(type));
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
        haptics.play('success');
      }
    }
  });
  // The haptic moments that are not awards: a pounce landing (avatar.js), a
  // blow in a clan fight, landed or taken (clanfight.js), and the purr of
  // head scratches and naps (interactions.js, avatar.js).
  bus.on('pounce:land', () => haptics.play('tap'));
  bus.on('fight:hit', () => haptics.play('hit'));
  bus.on('purr', ({ seconds }) => haptics.purr(seconds));
  bus.on('purr:end', () => haptics.stopPurr());
  bus.on('player:lockchange', ({ locked }) => {
    if (!locked) haptics.stopPurr(); // paused: the purr stops with the walk
    // A walk-on waiting for its place: the "Off to ..." moment stays up over
    // the paused walk, and a re-lock gives control straight back.
    if (locked && session?.walkingOn) {
      handleTouchAction('pause');
      return;
    }
    if (session) crumb(locked ? 'resume' : 'pause');
    if (session) overlay.classList.toggle('hidden', locked);
    // The first engage is the walk beginning: from here on the card behind
    // the walk is the "Paused" one (walk.js pauseCardFor), and a touch walk
    // that began without its Ready? card gets that card's lines as toasts.
    if (session && locked && !session.started) {
      session.started = true;
      tips.begin(session);
      overlay.innerHTML = pauseCardFor(session, isTouch, pauseSound());
      for (const line of takeStartLines(session)) hud.toast(line);
    }
    // Paused again: the card is drawn afresh, so its switches and View chips
    // show what a pinch, the wheel or M changed during the walk. Only the
    // pause card itself (a crossing card keeps its place).
    if (session && !locked && session.started && overlay.querySelector('#btn-resume')) {
      overlay.innerHTML = pauseCardFor(session, isTouch, pauseSound());
    }
    crossing?.onLockChange(locked);
    // Re-locking with the find card up is Later: the card closes, and the
    // lock itself is the walk going on (as the crossing card).
    findCard?.onLockChange(locked);
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
    if (session?.walkingOn) return; // the "Off to ..." moment: the place is on its way
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
    if (e.target.id === 'btn-story') { session?.storyCard?.open(); resumeWalk(); }
    if (e.target.id === 'btn-end') {
      // She found the way home by herself: that hint is never needed.
      if (session) progression.knowHint('home');
      endWalk();
    }
    // Sound and Music on the pause card: the switch has already flipped.
    if (e.target.id === PAUSE_SOUND_ID) {
      settings.set('muted', !e.target.checked);
      applySettings();
      homebase.refresh();
    }
    if (e.target.id === PAUSE_MUSIC_ID) {
      setPauseMusic(e.target.checked);
      applySettings();
      homebase.refresh();
    }
    // The View chips on the pause card (controls review, 2026-11-19): the
    // camera's step, remembered like a pinch or the wheel would (settings).
    // The card is drawn again so the chosen chip shows.
    const viewChip = e.target.closest?.(`.${PAUSE_VIEW_CLASS}`);
    if (viewChip && session && !viewChip.disabled) {
      const step = Number(viewChip.dataset.viewStep);
      if (Number.isInteger(step)) {
        const next = clampZoomStep(step, maxZoomStep(session.areaId));
        settings.set('cameraZoom', next);
        player.setCameraZoom(next);
        overlay.innerHTML = pauseCardFor(session, isTouch, pauseSound());
        overlay.querySelector(`.${PAUSE_VIEW_CLASS}[data-view-step="${next}"]`)?.focus();
      }
    }
    // "Skip the lesson": one tap, nothing asked; the card is redrawn without it.
    if (e.target.id === SKIP_LESSON_ID && session) guideWalk.skip(session);
    if (e.target.id === 'btn-back') crossing.back();
    if (e.target.id === 'btn-cross-yes') crossing.confirm();
    if (e.target.id === 'btn-cross-no') crossing.cancel();
    // A gate's "Get it?" card (gatecross.js gateBuyHtml): Yes only from a
    // deliberate tap (crossing.buyYes reads the click), Not now buys nothing.
    if (e.target.id === 'confirm-card-yes') crossing.buyYes(e);
    if (e.target.id === 'confirm-card-no') crossing.cancel();
    if (e.target.id === 'btn-find-wear') findCard.wear();
    if (e.target.id === 'btn-find-later') findCard.later();
    if (e.target.id === RELOAD_BUTTON_ID) window.location.reload();
    if (e.target.id === 'btn-summary-continue') {
      overlay.classList.add('hidden');
      // takeCrossing() also clears the crossing. A crossing that picked the new
      // place lands on home, whose Today's walk card already shows it; one
      // that could not pick it (not open yet, or not enough 🐾) opens Change
      // place, where that place says what is missing.
      const c = takeCrossing();
      homebase.show(c && c.clan && !c.picked ? { sheet: 'places' } : undefined);
      sync.autoSync(); // fire-and-forget; no-op when unlinked/offline
      pullThenNews(); // fire-and-forget; catches up feeds made on this walk, then the news card
    }
  });
  // The browser's Back (an iPad's edge-swipe) goes one level up inside the
  // game instead of leaving the page, and Escape closes the home screen's top
  // layer (ui/backstack.js). During a walk Back pauses; the walk's own Escape
  // is not touched (homebase.back() does nothing while home is hidden).
  const summaryUp = () => !session && !overlay.classList.contains('hidden') && !!overlay.querySelector('#btn-summary-continue');
  // The den sheet opened from the home screen: Esc (and Back, and the pad's B) close it one step at a time.
  function homeDenBack() {
    if (!denShop.isHome) return false;
    walkBack();
    return true;
  }
  function walkBack() {
    const action = walkBackAction({
      summary: summaryUp(),
      walking: !!session,
      home: denShop.isHome,
      walkingOn: !!session?.walkingOn,
      shopAsk: denShop.isAsking,
      placing: denShop.isPlacing,
      shop: denShop.isOpen,
      findCard: !!session?.findCard,
      crossing: !!session?.crossing,
      engaged: player.engaged,
      photo: !!session?.cameraMode,
      started: !!session?.started,
      touch: isTouch,
    });
    if (action === 'continue') overlay.querySelector('#btn-summary-continue')?.click();
    else if (action === 'shop-not-now') denShop.notNow();
    else if (action === 'shop-later') denShop.stopPlacing();
    else if (action === 'shop-done') denShop.close();
    else if (action === 'find-later') findCard.later();
    else if (action === 'cross-no') crossing?.cancel();
    else if (action === 'photo-off') doCameraToggle();
    else if (action === 'pause') handleTouchAction('pause');
    else if (action === 'resume') resumeWalk();
  }
  const backStack = attachBackStack({
    win: window,
    depth: () => homebase.depth() + (session || summaryUp() || denShop.isHome ? 1 : 0),
    closeTop: () => { if (denShop.isHome || !homebase.back()) walkBack(); },
    escape: () => (denShop.isHome ? homeDenBack() : homebase.back()),
  });
  // The pad's B in a menu: the same one level up as the browser's Back.
  function padBack() {
    if (tvHooks.back?.()) return; // a TV card (the offer, the letter picker) is the top layer
    if (!denShop.isHome && homebase.back()) { backStack?.sync?.(); return; }
    const act = padBackAction({
      fight: session?.clanFight?.uiShowing === 'fight', summary: summaryUp(), walking: !!session, walkingOn: !!session?.walkingOn,
      cardUp: !!overlay.querySelector('#btn-resume'), shopAsk: denShop.isAsking, placing: denShop.isPlacing, shop: denShop.isOpen, findCard: !!session?.findCard, crossing: !!session?.crossing,
    });
    if (act === 'none') return;
    if (act === 'resume') { player.setTouchEngaged(true); return; }
    walkBack();
    backStack?.sync?.();
  }
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
      const sw = overlay.querySelector(`#${PAUSE_SOUND_ID}`);
      if (sw) sw.checked = !next; // the pause card's Sound switch, if it is up
      hud.toast(next ? 'Sound off 🔇' : 'Sound on 🔊');
    }
    // T threw the yarn ball until the controls review (2026-11-19); yarn balls
    // lie around to find now. For her first few walks after, T says so,
    // kindly, once a walk (counted on the save like a hint, 'tkey').
    if (e.code === 'KeyT' && session && player.engaged && !e.repeat && !typing && !session.tKeyTold) {
      session.tKeyTold = true;
      if ((progression.state.tutorial.hints.tkey ?? 0) < hintMax('tkey')) {
        progression.countHint('tkey');
        hud.toast(tutorialLine('hint.tkey'));
      }
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
      // A walk together only: alone there is no chat (controls review).
      if (digitPhrase && session.net) { session.sendPhrase(digitPhrase); return; }
      if (e.code === 'Enter' && session.net) { session.chatWheel?.openFromKeyboard?.(); return; }
      if (e.code === 'Escape') { session.chatWheel?.closeFromKeyboard?.(); return; }
    }
  });
  // Clan Life Part 2: a fight never waits in a hidden tab. Hiding the page
  // ends it the way the walk's end does: the intruder walks on, nothing paid.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) session?.clanFight?.abort();
  });
  // Put away (the home screen, another app, the screen locked): the purr
  // stops now, not when the page next gets time to run.
  document.addEventListener('visibilitychange', () => { if (document.hidden) haptics.stopPurr(); });
  // Mid-walk resume: the note of the walk in progress. Written every few
  // seconds by the render loop, and here the moment the game is hidden, which
  // on an iPad is the last thing that happens before it can be closed.
  // snapshotWalk gives null for a walk that cannot be picked up (a walk
  // together, the den) and writeResume ignores null.
  const noteWalk = () => {
    if (session) writeResume(window.localStorage, snapshotWalk(session, { yaw: player.viewYaw(), now: Date.now(), paid: log.entries() }));
  };
  // Put away while the walk is running well (it has drawn frames for a
  // while): that is the ordinary way a walk is left, so the count of failed
  // tries starts over. Only here: a walk the page is killed in mid-play never
  // gets this far, and uses its tries up (walkresume.js markTried).
  const noteWalkOnHide = () => {
    if (session?.healthy) session.resumeTries = 0;
    noteWalk();
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) noteWalkOnHide(); });
  window.addEventListener('pagehide', noteWalkOnHide);
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
  // ...and her pose for the birthday balloons (render/partyballoons.js).
  const balloonPose = { x: 0, y: 0, z: 0, yaw: 0, hidden: false };
  // The find's inputs (foundwear/live.js update), mutated every frame rather
  // than rebuilt.
  const findFrame = { x: 0, z: 0, pawsY: 0, camera, remotes: null, busy: false };
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
  // it does for any walk). walkresume.js's pickUpWalk counts the try before
  // the build, waits for the place like any start (home is up meanwhile; a
  // place that does not come leaves the note for a later launch), and settles
  // a build that throws, starting the page again if a session got half-built.
  if (resuming) {
    pickUpWalk({
      storage: window.localStorage, data: leftWalk.data, progression,
      startWalkWhenReady, getSession: () => session,
      reload: () => window.location.reload(), note,
    });
  }
  // The frame guard (src/game/recovery.js holds the policy and its numbers).
  // A throw used to repeat on every frame with the game frozen. Now one is
  // noted and that frame skipped; frames that keep throwing end the walk
  // through endWalk, the same door the pause card's End walk button uses: it
  // tears everything down, pays the walk like any other (the points and finds
  // were saved as they were earned), forgets the resume note (onWalkEnded),
  // so a broken walk is never offered again, and leaves a co-walk room the
  // ordinary way. The child gets the summary with one gentle line on it.
  const frameGuard = createFrameGuard();
  let loopStopped = false;
  // The last resort: this page cannot carry on (the home screen's own frame
  // keeps throwing, a walk could not even be torn down, or the graphics are
  // lost and the page has reloaded itself once already this minute). The
  // loop stops, so nothing throws again, and a reload is offered.
  function stopLoop(kind) {
    if (loopStopped) return;
    loopStopped = true;
    renderer.setAnimationLoop(null);
    if (kind === 'error' && session) {
      // A walk that could not be torn down is not noted again on the way out
      // (pagehide) and is not picked up after the reload: it is dropped here.
      clearResume(window.localStorage);
      session = null;
    }
    try { player.disable(); } catch { /* the notice matters more */ }
    overlay.innerHTML = stuckNoticeHtml(kind, { touch: isTouch });
    overlay.classList.remove('hidden');
    perfHud.showDiagnostics();
  }
  function onFrameError(err) {
    const verdict = frameGuard.fail(performance.now());
    note('frame', err);
    if (frameGuard.streak === 1) console.warn('Whisker Walk: a frame failed', err);
    if (verdict !== 'trip') return;
    frameGuard.reset();
    if (!session) { stopLoop('error'); return; }
    try {
      endWalk();
    } catch (endErr) {
      note('frame', endErr);
      console.warn('Whisker Walk: could not end the walk cleanly', endErr);
      stopLoop('error');
      return;
    }
    // The one gentle line stands where the summary's cheer would ("What a
    // walk!" reads oddly after a walk that broke).
    const cheer = overlay.querySelector('.summary-cheer');
    if (cheer) cheer.textContent = WALK_ENDED_LINE;
    else overlay.querySelector('.summary-panel h1')?.insertAdjacentHTML('afterend', `<div class="summary-cheer">${WALK_ENDED_LINE}</div>`);
  }

  // The main canvas losing its graphics context (a GPU reset, memory pressure
  // on an iPad). three.js stops drawing until a restore, but what a walk
  // built on the GPU (the env map, the composer's targets, every texture) is
  // not rebuilt by it, so the game never carries on a restored context: the
  // page reloads once, and a walk picks up from its note on "Welcome back".
  // At most one automatic reload a minute (recovery.js claimAutoReload);
  // after that the plain notice. catstage.js handles its own small canvas.
  let glReloadPending = false;
  function reloadAfterContextLoss() {
    glReloadPending = false;
    let delay = 0;
    if (session?.net) {
      // A walk together cannot be picked up: it ends the ordinary way, so
      // the room is left and a fight's intruder let go on the partner's
      // screen, and a reload waits a moment for that to be sent.
      try { endWalk(); } catch (err) { note('gl', err); }
      delay = 300;
    }
    let tabStorage = null;
    try { tabStorage = window.sessionStorage; } catch { /* blocked: no automatic reload */ }
    if (!claimAutoReload(tabStorage, Date.now())) { stopLoop('gl'); return; }
    // Not "running well" on the way out, so the pagehide note keeps its
    // count of tries: a walk that loses the context every time it is picked
    // up is settled after RESUME_MAX_TRIES like any walk that cannot run.
    if (session) session.healthy = false;
    noteWalk();
    setTimeout(() => window.location.reload(), delay);
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // three.js does too; it is what allows a restore at all
    note('gl', 'graphics context lost');
    if (session) session.healthy = false;
    noteWalk();
    // A hidden page (put away on an iPad) reloads when it is back in front.
    if (document.hidden) glReloadPending = true;
    else reloadAfterContextLoss();
  });
  canvas.addEventListener('webglcontextrestored', () => note('gl', 'graphics context restored'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && glReloadPending) reloadAfterContextLoss();
  });

  // The moves' context (traversallive.js), made once: walkFrame fills in
  // its cat and session before each call (and empties them after late), so
  // an engaged frame allocates nothing for it.
  const moveCtx = { cat: null, player, session: null };

  // One try/catch around the whole frame: nothing allocated, nothing extra
  // read on a good frame, and the frame's own order is untouched. A refresh
  // the 30 fps cap skips (walkFrame gives false) ran nothing, so it does not
  // count as a good frame between two that threw.
  renderer.setAnimationLoop(() => {
    try {
      if (walkFrame() !== false) frameGuard.ok();
    } catch (err) {
      onFrameError(err);
    }
  });
  function walkFrame() {
    // The 30 fps cap (game/adaptquality.js): a skipped refresh does nothing
    // at all, not even read the clock, so the next frame's dt covers both.
    if (session && !qualityAdapter.shouldRender(performance.now())) return false;
    perfHud.frameStart(performance.now(), session);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    coop.poll?.(dt);
    gamepad.poll(dt, coop.pad);
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
      // The moves (traversallive.js) first: on a crossing or in a hop they
      // place her and hold the player, so player.update leaves her there and
      // puts the camera on this frame's spot. NO_TRAVERSAL does nothing.
      moveCtx.cat = session.cat;
      moveCtx.session = session;
      session.traversal.update(dt, t, moveCtx);
      // `waters` is v20's fourth argument: the area's water footprints, which
      // player.update blocks the cat out of unless Sea Legs is on. The den has
      // none and passes undefined, which the default handles. The fifth is
      // the people's soft bumps: the Fairground show's visitors there, else
      // the villagers'.
      player.update(dt, session.areaData.colliders, session.areaData.bounds, session.areaData.waters, session.fair?.show?.bumps ?? session.critters?.bumps);
      coop.frame?.(dt);

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
      session.critters.update(wdt, t, session.cat.position, session.cat.position, session.cat);
      session.strayCats.update(wdt, t, session.cat.position, {
        stalking: player.stalking,
        catSpeed: player.speed,
        toy: session.toy,
      });
      session.clanCats.update(wdt, t, session.cat.position);
      session.birthday?.update(wdt, t, session.cat.position);
      session.intruders.update(dt, session.cat.position);
      session.toy.update(dt, session.areaData.bounds);
      // THE YARN BALL FLOATS — v20.
      //
      // The toy is bounds-only (deliberately: it is not the player, and giving
      // it a collider pass would change how it bounces off everything). Once
      // water blocks, a ball batted or kicked into the pond is unreachable to
      // a cat that cannot swim: there is one ball a walk (it lies around to
      // find since the controls review, 2026-11-19), and the roll home
      // (avatar.js) waits 25 s. Clamping it out of the water instead would
      // break the thing that makes the Docks fun, which is sending the ball
      // over the canal. So the ball floats ashore.
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
      session.areaLife.update(dt, t, session.cat.position, camera, session);
      session.secrets.update(dt, t, session.cat.position, player.speed);
      session.goldMice.update(t);
      // After player.update: a chase scamper overrides the cat's position.
      session.rival.update(dt, t, session.cat.position, session.cat);
      // v21 3b Task 16: the yard dog, after the rival (they share
      // session.chasing, so only one of them ever moves the cat at a time).
      session.dog.update(dt, session.cat.position, session.cat, { stalking: player.stalking });
      // Appletree Farm's animals, after player.update: a cat on a cow's back is
      // carried by her from here (farmanimals.js).
      session.farm.update(dt, t, { cat: session.cat, player, session });
      // The Fairground's rides, likewise: they turn, and a cat on a seat is
      // carried by it from here (fairlive.js). They also place the camera.
      session.fair.update(dt, t, { cat: session.cat, player, session });
      // The Market Square's stallholders and its treats (marketlive.js): the
      // rhythm, the coo and the shoo read where she is now; the hop is added
      // to her own walk (NO_MARKET elsewhere).
      session.market?.update(dt, t, { cat: session.cat, player, session });
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
      // Bigger areas: build and drop strip tiles round the cat, before the
      // fade so a tree built this frame is already known to it.
      session.stripTiles?.update(dt, session.cat.position.x, session.cat.position.z);
      session.treeFade?.update(dt, camera, treeFadeLook);
      session.rustle?.update(dt, session.cat.position);
      // Gorge part 1: the paws' world height, the ground under the cat plus perchY.
      // Under the sea (the Reef) her paws are the float height higher: the two golden mice that hang in bubble columns are reached by floating
      const floatLift = +player.floatY || 0; // a number always (the Reef's float height, 0 everywhere else)
      const pawsY = session.ground.flat ? player.perchY + floatLift
        : session.ground.y(session.cat.position.x, session.cat.position.z) + player.perchY + floatLift;
      const gm = session.goldMice.checkFind(session.cat.position, pawsY);
      if (gm && progression.recordGolden(gm.id)) {
        log.awardOnce('legend', gm.id, 'a GOLDEN MOUSE! 🥇');
        session.fx.burst(session.cat.position, 0xf2c14e, 18);
        audio.fanfare();
        session.goldMice.remove(gm.id);
      }
      // Found outfits: the walk's find, at the golden mouse's reach. Hers
      // waits while she is busy (findBusy); a partner's never does.
      findFrame.x = session.cat.position.x;
      findFrame.z = session.cat.position.z;
      findFrame.pawsY = pawsY;
      findFrame.remotes = session.remotes.list;
      findFrame.busy = findBusy(session);
      const arrival = session.find.update(dt, t, findFrame);
      // A find taken is written into the walk's note at once (not at the next
      // few-second note): a walk picked up after the page is closed knows it
      // is taken and never gives a second one (restoreFind).
      if (arrival && handleFindArrival(session, arrival, { progression, log, hud, audio, card: findCard })) noteWalk();
      // The holiday errand's finds (a lazy chunk; none outside a window): the same frame, its own arrivals.
      session.storyCard?.update(dt);
      const holidayArrival = session.holidayFinds?.update(dt, t, findFrame);
      if (holidayArrival && session.holidayFinds.handle(holidayArrival, { progression, log, hud, audio, fx: session.fx, cat: session.cat })) noteWalk();
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
      if (session.toy.held) placeInMouth(session.toy.mesh, session.cat); // ...and so does the yarn ball
      tickCarryRain(session, dt); // v21 3b: falling rain loosens the grip; the item slips
      session.scent.update(dt);
      // The stand-still sniff, then the hints (both this device's own).
      tickAutoSniff(session, dt);
      // ...and with the Twitchy Nose, the trail to the find (after the
      // treasure sniff, which advances walkTime).
      tickFindNose(session, dt, progression.state);
      tips.update(session, dt);
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
      // The birthday balloons: away while she swims or rides.
      balloonPose.x = pawState.x;
      balloonPose.y = session.cat.position.y;
      balloonPose.z = pawState.z;
      balloonPose.yaw = session.cat.rotation.y;
      balloonPose.hidden = player.inWater || !!session.fair?.riding;
      session.balloons.update(dt, t, balloonPose);
      // Clouds take the same absolute t and follow the camera, so after player.update too.
      session.clouds.update(t);
      session.ambient.update(t, session.weather.condition === 'rain' ? 1.7 : 1);
      session.remotes.update(dt, nowSec(), session.areaData.waters, session.fair);
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
      // (only cats drawn yet: one still waiting for its first state pushes nothing)
      for (const r of session.remotes.placed) pushMovers.push(r.group.position);
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
        mapFrame.ladder = session.areaId === 'reef';
        mapRemotes.length = 0;
        // a co-walker's dot from its first state, as its cat is drawn (remotecats.js)
        for (const r of session.remotes.placed) {
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
      // ghost ball is only shown (and batable) while I don't have the ball
      // here, and its last report is fresh — a remote who went quiet
      // (despawned, dropped) shouldn't leave a phantom ball behind; the ball
      // comes back to this screen where she last had it (game/yarnshare.js).
      if (session.net && shareYarn(session, nowSec(), dt)) {
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
            toy: toyForState(session.toy),
            // her height on a perch or seat, and the seat (remotecats.js liftForState)
            ...liftForState(player.perchY, session.fair.riding, player.floatY),
            // the place she is in: a co-walker elsewhere does not draw her
            area: session.areaId,
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
      // After the cat is posed: a cat that has just left a ride's seat starts
      // her hop down in this same frame (fairlive.js).
      session.fair.late(dt, t, { cat: session.cat, player, session });
      // And the moves' touches on the pose: the tail out on a crossing, the
      // rump wiggle, the leap's lean, the landing bounce (traversallive.js).
      moveCtx.cat = session.cat;
      moveCtx.session = session;
      session.traversal.late(dt, t, moveCtx);
      moveCtx.cat = null; // so an ended walk's session is not held past its frame
      moveCtx.session = null;
      updateInteractions(session);
      coop.late?.(dt);
      // The paw's climb badge (touch only; the keyboard has no paw), a few
      // times a second from the same facts the hints use.
      session.climbAccum = (session.climbAccum ?? 0) + dt;
      if (session.climbAccum >= 0.25) {
        session.climbAccum = 0;
        touchUI.setClimb(isTouch ? climbBadge(session, player, progression.state) : null);
        touchUI.setKick(isTouch && player.canFloat); // the Reef: the pounce slot is the held kick button
        hud.setFloat(player.canFloat); // and the key strip says hold Space to float
      }
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
    // this, so it is never marked healthy, its count of failed tries stands
    // and the next launch but one opens at home.
    if (session) {
      walkNoteAccum += dt;
      if (walkNoteAccum >= 5) {
        walkNoteAccum = 0;
        session.healthy = true;
        noteWalk();
      }
    }
  }
}
