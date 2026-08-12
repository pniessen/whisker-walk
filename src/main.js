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
import { createRemoteCats } from './remotecats.js';
import { rollGhosts, createGhosts } from './ghosts.js';
import { createTippables } from './tippables.js';
import { createScent } from './scent.js';
import { createToy } from './toy.js';
import { createQuest } from './quests.js';
import { createProgression, rankFor, summarizeSaveForPreview } from './progression.js';
import { createGoals } from './goals.js';
import { createDiscoveryLog } from './discoveries.js';
import { createHud } from './ui/hud.js';
import { createHomeBase } from './ui/homebase.js';
import { detectTouch, createTouchUI, onFirstTouch } from './ui/touchui.js';
import { createAudio } from './audio.js';
import { createAlbum } from './album.js';
import { createSettings } from './settings.js';
import { rollWeather, createWeather } from './weather.js';
import { rollSecrets, createSecrets } from './secrets.js';
import { puddle as puddleProp } from './world/builder.js';
import { cameraOffset } from './catcam.js';
import { mulberry32, seedFromCode } from './rng.js';
import { createNet, createSupabaseTransport, generateRoomCode, validPetName } from './net.js';
import { createLiveCloud, generateSaveCode, normalizeSaveCode, getOrCreateSecret } from './cloud.js';
import { createBlockList } from './blocklist.js';
import { createChatBubbles } from './chatbubble.js';
import { createChatWheel } from './ui/chatwheel.js';
import { phraseById, createChatRateLimiter, shouldShowIncomingChat } from './chat.js';
import { replyFor, countsAsGreet, intentFor } from './catreplies.js';
import { phraseIdForDigit } from './chatkeys.js';

const AREAS = { neighborhood, park, seaside };
// default session.ghosts before (or absent) an async spawn resolves — lets
// the render loop/updateInteractions/endWalk call the ghosts API
// unconditionally instead of null-checking it everywhere.
const NO_GHOSTS = { list: [], nearest: () => null, update() {}, dispose() {} };
// wall-clock seconds, used to keep remote-pet interpolation/despawn timing
// consistent between the async net callbacks and the render loop
const nowSec = () => performance.now() / 1000;

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

// the capability secret that authorizes profile/friendship writes (and, for
// a freshly-created save row, doubles as that row's initial secret) —
// memoized lazily via getPsecret() below, on first actual use, rather than
// at module scope: every call site that needs it is already downstream of
// an MP check (getCloud() returns null when !MP), so an unconfigured (solo)
// deploy should never generate-and-persist a secret it will never use.
let psecretCache = null;
function getPsecret() {
  if (!MP) return null;
  if (!psecretCache) psecretCache = getOrCreateSecret(window.localStorage);
  return psecretCache;
}

// cloud RPC client — created lazily (only once actually needed, and only
// when MP) rather than at module scope, so an unconfigured deploy never
// even attempts the dynamic supabase-js import.
let cloudInstance = null;
function getCloud() {
  if (!MP) return null;
  if (!cloudInstance) {
    cloudInstance = createLiveCloud(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
  }
  return cloudInstance;
}

// a toast surface that stays visible on the home base screen (unlike
// #hud, which is display:none whenever no walk is in progress) — cloud
// sync results (stale/denied) need to reach the player there too.
const cloudToastsEl = document.getElementById('cloud-toasts');
function cloudToast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  cloudToastsEl.appendChild(el);
  setTimeout(() => el.classList.add('fade'), 2600);
  setTimeout(() => el.remove(), 3400);
}

// petNames arrive over the network from other players' clients, which may
// not have enforced validPetName themselves — escape before interpolating
// into innerHTML (the summary card's "walked with" line).
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// volume factor for a remote meow/cluck event: full volume within earshot
// (<=8 units), fading linearly down to a quiet 0.2 floor by 40 units.
function meowVolumeForDistance(dist) {
  if (dist <= 8) return 1;
  if (dist >= 40) return 0.2;
  return 1 - ((dist - 8) / (40 - 8)) * 0.8;
}

// Deterministic per-cat offset for seeded reply selection (catreplies.js's
// countsAsGreet/replyFor pool picks) — sum of char codes, no Math.random.
function hashName(name) {
  let h = 0;
  for (const ch of String(name ?? '')) h += ch.charCodeAt(0);
  return h;
}

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

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
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
  const hud = createHud();
  const audio = createAudio();
  const touchUI = createTouchUI(document.getElementById('hud'), {
    onMove: (v) => player.setTouchMove(v),
    onOrbit: (dx, dy) => player.addOrbit(dx, dy),
    onAction: handleTouchAction,
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
  const catVoice = (pitch = 1) =>
    (session && session.cat.userData.breed === 'hagrid' ? audio.cluck(1, pitch) : audio.meow(1, pitch));
  const clock = new THREE.Clock();

  let session = null;

  // Room state lives OUTSIDE the walk session — a room can be formed on the
  // home base screen (host/join) before anyone has clicked Start, and
  // survives across walks only until endWalk explicitly leaves it.
  let pendingRoom = null; // { net, code, roster }
  // host()/join() both check `pendingRoom` before doing anything async, but
  // pendingRoom itself is only set AFTER the await — a double-click (or
  // host+join fired back to back) would pass that guard twice and open two
  // concurrent room connections, with the loser's net silently orphaned.
  // This flag closes that window: it's set synchronously before the first
  // await, so a concurrent call sees it immediately, not just eventually.
  let roomOpInFlight = false;
  const roomChangeHandlers = [];
  function notifyRoomChange() {
    for (const fn of roomChangeHandlers) fn();
  }

  function roomProfile() {
    const st = progression.state;
    return {
      playerId: pid,
      petName: st.petName,
      breed: st.equipped.cat,
      accessories: { collar: st.equipped.collar, outfit: st.equipped.outfit },
    };
  }

  // Cloud profile push (Task 3): publishes what's currently equipped under
  // this device's playerId/secret. Guarded on MP and on having a pet name —
  // an unnamed pet was never walk-together-visible either, so there's
  // nothing meaningful to publish yet. Fire-and-forget with a console-only
  // catch, same pattern as sync.autoSync: profile visibility lagging by one
  // push is fine, but it must never block or throw into a caller.
  // Returns the push's promise (resolved even on failure, since the catch
  // below handles it) rather than nothing — most callers still fire-and-forget
  // it, but homebaseCloud.addFriendByCode below awaits it so a just-named
  // pet's profile row exists before the friend-code flow's recordGreet call.
  function pushProfileNow() {
    if (!MP) return Promise.resolve();
    const st = progression.state;
    if (!st.petName) return Promise.resolve();
    const cloud = getCloud();
    if (!cloud) return Promise.resolve();
    return cloud.pushProfile({
      playerId: pid,
      secret: getPsecret(),
      petName: st.petName,
      breed: st.equipped.cat,
      accessories: { collar: st.equipped.collar, outfit: st.equipped.outfit },
      rankTitle: rankFor(st.lifetimePoints).title,
    }).catch((err) => console.warn('Whisker Walk: pushProfile failed', err));
  }

  // Ghost visits (Task 4): fetch this player's cross-walk friendships +
  // their public profiles, roll which (if any) show up via rollGhosts, and
  // spawn them into `mySession`'s scene. Called fire-and-forget from
  // startWalk right after the session is built — `mySession` is captured
  // up front (rather than reading the outer `session` variable at resolve
  // time) so a slow response can't attach ghosts to a scene that's since
  // been torn down (endWalk) or replaced by a different walk; every await
  // re-checks `session === mySession` before touching anything.
  async function spawnGhosts(mySession) {
    const cloud = getCloud();
    if (!cloud) return;
    try {
      const rows = await cloud.fetchFriendships(pid);
      if (session !== mySession) return;
      const greetsById = new Map();
      const otherIds = [];
      for (const r of rows) {
        const otherId = r.a_id === pid ? r.b_id : r.a_id;
        otherIds.push(otherId);
        greetsById.set(otherId, r.greets);
      }
      if (!otherIds.length) return;
      const profiles = await cloud.fetchProfiles(otherIds);
      if (session !== mySession) return;
      const profileById = new Map(profiles.map((p) => [p.player_id, p]));
      const friends = otherIds
        .map((id) => ({ playerId: id, greets: greetsById.get(id) ?? 0, profile: profileById.get(id) }))
        // a friendship row with no matching profile (deleted/unpublished) can't be
        // visited; a blocked playerId (Task 3 — see src/blocklist.js) never spawns
        // as a ghost either, regardless of how many greets are on record.
        .filter((f) => f.profile && !blockList.has(f.playerId));
      const chosen = rollGhosts(Math.random, friends);
      if (!chosen.length) return;
      mySession.ghosts = createGhosts(
        mySession.scene,
        mySession.areaData,
        chosen.map((f) => ({
          playerId: f.playerId,
          petName: f.profile.pet_name,
          breed: f.profile.breed,
          accessories: f.profile.accessories,
          greets: f.greets,
        })),
        Math.random
      );
    } catch (err) {
      console.warn('Whisker Walk: ghost spawn failed', err);
    }
  }

  // The host broadcasts walk-config once (on Start); every other member of
  // the room is idle on the home base screen with this handler wired up via
  // setupRoomNet, so receiving it is what actually launches their walk —
  // there's no separate "join the walk" click.
  function handleLobbyEvent(ev) {
    if (!pendingRoom || ev.type !== 'walk-config') return;
    if (session) return; // already mid-walk — a stray/duplicate/replayed walk-config can't re-enter startWalk
    // only the host may launch the room's walk — roster is sorted by
    // createNet, so the smallest playerId (roster[0]) is always the host;
    // anyone else's walk-config is either spoofed or stale and must be
    // ignored rather than hijacking every member's walk.
    if (ev.id !== pendingRoom.roster[0]?.playerId) return;
    if (progression.isUnlocked('areas', ev.area)) {
      progression.setArea(ev.area);
      startWalk({ duskMode: ev.dusk, roomSeed: ev.seed });
    } else {
      // don't force an unlocked-area change onto their save — just render
      // the host's area for this one walk via the override.
      startWalk({ duskMode: ev.dusk, roomSeed: ev.seed, areaOverride: ev.area });
    }
  }

  function setupRoomNet(net, code) {
    pendingRoom = { net, code, roster: [] };
    net.onRoster((roster) => {
      if (!pendingRoom) return; // left/torn down between the send and this callback
      pendingRoom.roster = roster;
      notifyRoomChange();
    });
    net.onEvent(handleLobbyEvent);
  }

  const rooms = {
    available: MP,
    getState() {
      if (!pendingRoom) return null;
      return { code: pendingRoom.code, roster: pendingRoom.roster, isHost: pendingRoom.net.isHost() };
    },
    async host() {
      if (!MP || pendingRoom || roomOpInFlight) return { ok: false };
      roomOpInFlight = true;
      const code = generateRoomCode();
      const net = createNet(createSupabaseTransport(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      ));
      try {
        await net.join(code, roomProfile());
      } catch (err) {
        console.warn('Whisker Walk: failed to host a room', err);
        roomOpInFlight = false;
        return { ok: false };
      }
      // defensive: shouldn't be reachable given the flag above, but if some
      // other path claimed pendingRoom while we awaited, don't clobber it —
      // leave the room we just joined instead of leaking it.
      if (pendingRoom) {
        roomOpInFlight = false;
        await net.leave().catch(() => {});
        return { ok: false };
      }
      setupRoomNet(net, code);
      roomOpInFlight = false;
      notifyRoomChange();
      pushProfileNow(); // fire-and-forget — the room roster already carries petName/breed live
      return { ok: true, code };
    },
    async join(code) {
      if (!MP || pendingRoom || roomOpInFlight) return { ok: false };
      roomOpInFlight = true;
      const net = createNet(createSupabaseTransport(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      ));
      try {
        await net.join(code, roomProfile());
      } catch (err) {
        console.warn('Whisker Walk: failed to join room', err);
        roomOpInFlight = false;
        return { ok: false };
      }
      if (pendingRoom) {
        roomOpInFlight = false;
        await net.leave().catch(() => {});
        return { ok: false };
      }
      setupRoomNet(net, code);
      roomOpInFlight = false;
      notifyRoomChange();
      pushProfileNow(); // fire-and-forget — same as host() above
      return { ok: true, code };
    },
    async leave() {
      if (!pendingRoom) return;
      const net = pendingRoom.net;
      pendingRoom = null;
      notifyRoomChange();
      await net.leave();
    },
    onChange(fn) {
      roomChangeHandlers.push(fn);
    },
  };

  // ── Cloud save sync ────────────────────────────────────────────────
  // A linked device stores its save-code + that ROW's secret locally.
  // The row secret is NOT the player secret (psecret): psecret only ever
  // authorizes profile/friendship writes (Task 3) and, once, seeds a
  // freshly-created row's secret — after that the row's own returned
  // secret (from create or a later load) is what future writes must use.
  const CLOUD_CODE_KEY = 'whisker-walk-cloudcode';
  const CLOUD_SECRET_KEY = 'whisker-walk-cloudsecret';

  function readCloudLink() {
    try {
      const code = window.localStorage.getItem(CLOUD_CODE_KEY);
      const secret = window.localStorage.getItem(CLOUD_SECRET_KEY);
      return code && secret ? { code, secret } : null;
    } catch {
      return null;
    }
  }
  function writeCloudLink(code, secret) {
    try {
      window.localStorage.setItem(CLOUD_CODE_KEY, code);
      window.localStorage.setItem(CLOUD_SECRET_KEY, secret);
    } catch (err) {
      console.warn('Whisker Walk: could not persist cloud link', err);
    }
  }
  function clearCloudLink() {
    try {
      window.localStorage.removeItem(CLOUD_CODE_KEY);
      window.localStorage.removeItem(CLOUD_SECRET_KEY);
    } catch (err) {
      console.warn('Whisker Walk: could not clear cloud link', err);
    }
  }
  // deep-cloned snapshot: composed once per RPC call so an in-flight
  // fire-and-forget send can't pick up a further mutation mid-flight.
  function composeCloudPayload() {
    return JSON.parse(JSON.stringify({ save: progression.state, album: album.serialize() }));
  }
  // 'denied' means this code/secret pair no longer authorizes writes
  // (e.g. re-linked elsewhere) — surfaced once per link, not on every
  // subsequent auto-sync, so it doesn't spam a toast after every walk.
  let deniedNotified = false;

  async function runSync() {
    const link = readCloudLink();
    if (!link) return { ok: false, message: 'Not linked to a cloud save.' };
    const cloud = getCloud();
    if (!cloud) return { ok: false, message: 'Cloud sync is not available.' };
    try {
      const payload = composeCloudPayload();
      const result = await cloud.saveToCloud(link.code, link.secret, payload, payload.save.lifetimePoints ?? 0);
      if (result === 'created' || result === 'updated') {
        deniedNotified = false;
        return { ok: true, message: 'Synced ✓' };
      }
      if (result === 'stale') {
        cloudToast('Cloud has newer progress — open Sync at home base');
        return { ok: false, message: 'Cloud has newer progress than this device — use Load from cloud to pull it down.' };
      }
      if (result === 'denied') {
        if (!deniedNotified) {
          cloudToast('Cloud sync denied — unlink and save a new code at home base');
          deniedNotified = true;
        }
        return { ok: false, message: 'Sync denied — this code may be linked elsewhere. Unlink and save a new code.' };
      }
      return { ok: false, message: 'Unexpected sync result.' };
    } catch (err) {
      console.warn('Whisker Walk: cloud sync failed', err);
      return { ok: false, message: 'Could not reach the cloud — check your connection and try again.' };
    }
  }

  const sync = {
    available: MP,
    getCode() {
      return readCloudLink()?.code ?? null;
    },
    // unlinked "Save to cloud": generate a fresh code, upload under it,
    // and — since this is a brand-new row — seed its secret with the
    // player's own psecret (the row's secret then becomes the thing
    // future writes must present, not psecret itself).
    async saveToCloud() {
      const cloud = getCloud();
      if (!cloud) return { ok: false, error: 'Cloud sync is not available.' };
      const code = generateSaveCode();
      try {
        const payload = composeCloudPayload();
        const secret = getPsecret();
        const result = await cloud.saveToCloud(code, secret, payload, payload.save.lifetimePoints ?? 0);
        if (result !== 'created') {
          return { ok: false, error: 'That code was already taken — please try again.' };
        }
        writeCloudLink(code, secret);
        deniedNotified = false;
        return { ok: true, code };
      } catch (err) {
        console.warn('Whisker Walk: saveToCloud failed', err);
        return { ok: false, error: 'Could not reach the cloud — check your connection and try again.' };
      }
    },
    // "Load from cloud" step 1: fetch + build a local-vs-cloud comparison
    // for the confirm-overwrite card. Nothing is written yet.
    async previewLoad(rawCode) {
      const cloud = getCloud();
      if (!cloud) return { ok: false, error: 'Cloud sync is not available.' };
      const code = normalizeSaveCode(rawCode);
      if (!code) return { ok: false, error: 'Enter a save code first.' };
      try {
        const data = await cloud.loadFromCloud(code);
        if (!data || !data.payload || !data.payload.save) {
          return { ok: false, error: 'No save found for that code.' };
        }
        const localSave = progression.state;
        const cloudSave = data.payload.save;
        // cloudSave is untrusted (read straight back from the `saves` table
        // with no server-side shape check) — summarizeSaveForPreview coerces
        // every numeric field before it ever reaches the preview card.
        return {
          ok: true,
          preview: {
            code, secret: data.secret, payload: data.payload,
            local: summarizeSaveForPreview(localSave), cloud: summarizeSaveForPreview(cloudSave),
          },
        };
      } catch (err) {
        console.warn('Whisker Walk: loadFromCloud failed', err);
        return { ok: false, error: 'Could not reach the cloud — check your connection and try again.' };
      }
    },
    // "Load from cloud" step 2 (after user confirms the overwrite): the
    // returned row secret — NOT psecret — is what future saveToCloud
    // calls from this device must use.
    async confirmLoad(preview) {
      if (!preview) return { ok: false, error: 'Nothing to load.' };
      progression.replaceFromPayload(preview.payload.save);
      album.replaceFromPayload(preview.payload.album ?? { version: 1, photos: [] });
      writeCloudLink(preview.code, preview.secret);
      deniedNotified = false;
      return { ok: true };
    },
    async syncNow() {
      return runSync();
    },
    unlink() {
      clearCloudLink();
      deniedNotified = false;
    },
    // fire-and-forget auto-sync (after the walk summary and after shop
    // buys) — never awaited by callers, never throws.
    autoSync() {
      if (!MP || !readCloudLink()) return;
      runSync().catch(() => {});
    },
  };

  // homebase's Start button always calls this; solo play (no room, or a
  // joiner who — thanks to the disabled "Waiting for host…" button — never
  // gets a click through) is unaffected. Only the host actually reaches the
  // room branch, and it's the host who owns the shared seed: it's computed
  // once here and carried to everyone (including the host) via walk-config.
  function beginWalkFromHomebase({ duskMode }) {
    if (pendingRoom) {
      if (pendingRoom.net.isHost()) {
        const seed = (seedFromCode(pendingRoom.code) ^ Date.now()) >>> 0;
        pendingRoom.net.sendEvent({
          v: 1, id: pid, type: 'walk-config',
          area: progression.state.area, dusk: duskMode, seed,
        });
        startWalk({ duskMode, roomSeed: seed });
      } else {
        // Host-flip race: the Start button only renders enabled when
        // rooms.getState().isHost was true as of the LAST render — a
        // roster change (the host leaving, or a smaller playerId joining)
        // can flip isHost() false in the window between that render and
        // this click. Falling through to a solo walk here would spawn
        // ghosts (see spawnGhosts) into what should still be a room
        // member's walk, and would leave pendingRoom dangling (never
        // left) — so stay on the home base screen and let them rejoin
        // instead of silently downgrading to solo.
        cloudToast('Host changed — rejoin the room to start.');
        homebase.refresh();
      }
    } else {
      startWalk({ duskMode });
    }
  }

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
  const homebase = createHomeBase(progression, album, beginWalkFromHomebase, rooms, sync, homebaseCloud, settings, applySettings);
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
  // Bodies extracted out of the keydown handlers below (pure move — same
  // logic, no behavior change) so both the keyboard path and the touch
  // action-button path can invoke them. Callers are responsible for the
  // session/engagement/mode guards, exactly as the keydown handler always was.
  function doMeow() {
    catVoice();
    session.critters.reactToMeow(session.cat.position);
    if (session.strayCats.reactToMeow(session.cat.position) > 0) {
      setTimeout(() => { if (session) audio.meow(); }, 350); // a reply from a friend
    }
    if (session.net) {
      session.net.sendEvent({
        v: 1,
        id: session.playerId,
        type: 'meow',
        breed: session.cat.userData.breed,
        pos: [session.cat.position.x, session.cat.position.z],
      });
    }
    // duet: replying while a nearby remote meow's 3s window is open
    if (session.duetWindow && nowSec() <= session.duetWindow.until) {
      const withId = session.duetWindow.withId;
      session.duetWindow = null;
      log.awardOnce('duet', `duet-${withId}`, `a harmonized duet with ${petNameFor(session, withId)} 🎶`);
      catVoice(1.26); // layered on top of the normal-pitch meow just played above
      if (session.net) session.net.sendEvent({ v: 1, id: session.playerId, type: 'duet', withId });
    }
  }

  function doYarn() {
    if (!session.toy.active) {
      // one shared yarn ball per co-walk: don't spawn a second one while a
      // remote player's ball is in play (fresh within the same 1s
      // staleness window the ghost render/bat logic uses)
      if (session.remoteToy && nowSec() - session.remoteToy.at < 1) {
        hud.toast('A yarn ball is already in play! 🧶');
        return;
      }
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

  function doPounceOrClimb() {
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

  function doCameraToggle() {
    session.cameraMode = !session.cameraMode;
    hud.setCamera(session.cameraMode);
  }

  // Touch action-cluster/pause/prompt-pill dispatch — mirrors the same
  // session/engaged/mode guards the keydown handler below applies per key.
  function handleTouchAction(name) {
    if (name === 'pause') {
      player.setTouchEngaged(false);
      // A hybrid device can upgrade into touch mode mid-walk while still
      // pointer-locked from before the upgrade — without this, ⏸ would
      // disengage touch but the mouse would stay captured and the pause
      // overlay's buttons would be unreachable.
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    if (!session || !player.engaged) return;
    if (name === 'pounce') {
      if (!session.cameraMode && session.freezeTime <= 0) doPounceOrClimb();
    } else if (name === 'meow') {
      doMeow();
    } else if (name === 'yarn') {
      doYarn();
    } else if (name === 'camera') {
      doCameraToggle();
    } else if (name === 'interact') {
      handleInteract(session);
    } else if (name === 'tapWorld') {
      if (session.cameraMode) snapPhoto(session);
    }
  }

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

  function startWalk({ duskMode = false, roomSeed, areaOverride } = {}) {
    const walkRng = roomSeed !== undefined ? mulberry32(roomSeed) : Math.random;
    const state = progression.state;
    // areaOverride: a joiner who hasn't unlocked the host's area still walks
    // there for this one co-walk, without progression.setArea persisting an
    // area they haven't actually earned.
    const areaId = areaOverride ?? state.area;
    const walkStamp = 'walk-' + Date.now();
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(30, 50, 20);
    scene.add(sun, new THREE.AmbientLight(0xbfd8ff, 0.9));

    const areaData = AREAS[areaId].build(scene);

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
    // In a room walk (roomSeed set), duskMode was already gated on the
    // HOST's own glow-collar equip check before being broadcast as
    // walk-config — re-gating it here on the LOCAL (joiner's) collar would
    // make joiners without a glow collar branch differently than the host
    // on the weather/secrets rolls just below, desyncing the shared walkRng
    // stream for the rest of the walk. Solo walks have no host to trust, so
    // they keep the local collar check.
    const duskActive = roomSeed !== undefined ? duskMode : duskMode && equipped.collar === 'glow';

    if (duskActive) {
      const { top, horizon } = areaData.skyDusk;
      scene.background = new THREE.Color(top);
      scene.fog = new THREE.Fog(horizon, 30, 110);
      sun.intensity = 0.7;
    }

    let weather = { condition: 'clear', rainbowVisible: false, rainbowPos: null, update() {} };
    if (!duskActive) {
      weather = createWeather(scene, sun, rollWeather(walkRng), walkRng, settings.get('reducedMotion'));
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
        questObject = buildCat(['tabby', 'calico', 'black'][Math.floor(walkRng() * 3)]);
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

    const strayCats = createStrayCats(scene, areaData, coarse ? 14 : 22, walkRng);
    const remotes = createRemoteCats(scene);
    if (roomSeed === undefined) {
      for (const stray of strayCats.strays) {
        if (progression.friendLevel(stray.name) === 'best' && Math.random() < 0.3) stray.hasGift = true;
      }
    }
    const toy = createToy(scene);
    // yarn-rally ghost ball: a single shared marker rendered wherever a
    // REMOTE player's state message currently reports an active toy
    // position (session.remoteToy, kept in sync by net.onState below) — it's
    // not a real toy.js instance, just a visual + hit-test target for
    // "bat the ghost to request authority".
    const toyGhost = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xf25c9a })
    );
    toyGhost.visible = false;
    scene.add(toyGhost);
    const tippables = createTippables(scene, areaData.tippables ?? []);
    const scent = createScent(scene, areaData, walkRng);

    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.far = 160;
    sun.shadow.bias = -0.0004;        // kill shadow acne on the low-poly spheres
    sun.shadow.normalBias = 0.02;     // kill peter-panning at contact points
    sun.shadow.camera.near = 1;
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const goals = createGoals(walkRng);

    session = {
      scene, areaData, cat, critters, strayCats, remotes, collectibleMeshes, duskMode,
      ghosts: NO_GHOSTS,
      walkStamp,
      netSendAccum: 0,
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
      toyGhost, remoteToy: null,
      pendingBoop: null, incomingBoop: null,
      duetWindow: null,
      rally: null,
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

    // co-walks: a room formed on the home base screen (host/join) carries
    // its net/playerId/petName into the session here; solo walks never set
    // pendingRoom at all, so session.net stays undefined and every co-walk
    // branch below is a no-op.
    if (pendingRoom) {
      session.net = pendingRoom.net;
      session.playerId = pid;
      session.petName = progression.state.petName;
    }

    // In-game chat (Task 6/10): the wheel is created every walk and is now
    // visible in every walk (solo included, Task 10) — the receive handler
    // below (net.onChat) is still only ever wired inside the `if
    // (session.net)` block below, so solo walks never touch the v8
    // player-to-player receive path; they only ever show local + AI-cat
    // reply bubbles via sendPhrase.
    // session.cat is already set via the `cat` shorthand in the session
    // object literal above; chatBubbles anchors on that same Object3D.
    const chatBubbles = createChatBubbles(scene);
    const chatRate = createChatRateLimiter({ perMs: 1200 });   // receive-side, per remote sender
    const sendGate = createChatRateLimiter({ perMs: 1500 });   // local self-send cooldown
    const mutedIds = new Set();                                // per-walk, ephemeral
    session.chatBubbles = chatBubbles;

    // Greet-by-chat: reuses awardStrayGreet — the SAME body the E-to-boop
    // interact prompt uses (see above) — so friendship is truly capped:
    // talking to an already-greeted cat (booped OR previously chat-greeted)
    // still gets a reply, but never a second award.
    function greetStrayByChat(stray) {
      if (stray.greeted) return;
      awardStrayGreet(session, stray);
    }

    function sendPhrase(phraseId) {
      const p = phraseById(phraseId);
      if (!p) return;
      if (!sendGate.allow(session.playerId)) return;          // reuse existing 1500ms self-cooldown
      chatBubbles.show(session.cat, p.text);                   // local bubble
      if (session.net) session.net.sendChat({ v: 1, id: session.playerId, phraseId }); // players (v8)
      // Aim at the nearest AI cat and let it answer.
      const catP = session.cat.position;
      const target = session.strayCats.nearest(catP, 5);       // no ungreetedOnly — talk to any nearby cat
      if (target) {
        const breed = target.breed ?? target.group?.userData?.breed;
        const seed = (seedFromCode(session.walkStamp ?? '') + hashName(target.name)) >>> 0;
        const line = replyFor(breed, phraseId, seed);
        setTimeout(() => {
          if (session && session.strayCats.strays.includes(target)) chatBubbles.show(target.group, line);
        }, 600);
        // Friendship: a greeting counts once, only if this cat is still ungreeted this walk.
        if (countsAsGreet(phraseId)) greetStrayByChat(target);
      }
    }
    session.sendPhrase = sendPhrase; // exposed for Task 3's keyboard-driven send

    const chatWheel = createChatWheel(document.body, {
      onPick: sendPhrase,
      getPlayers: () => (session.net ? session.remotes.list.map((r) => ({ id: r.playerId, name: r.petName })) : []),
      isMuted: (id) => mutedIds.has(id),
      toggleMute: (id) => { if (mutedIds.has(id)) mutedIds.delete(id); else mutedIds.add(id); },
    });
    session.chatWheel = chatWheel;
    chatWheel.setVisible(true);
    hud.toast('Press 1–9 to chat · Enter for phrases'); // once per walk (startWalk runs once per walk)

    if (session.net) {
      const net = session.net;
      net.onRoster((roster) => {
        if (!session) return; // presence sync can land after endWalk tore the session down
        const liveIds = new Set(roster.map((p) => p.playerId));
        for (const r of remotes.list) {
          if (!liveIds.has(r.playerId)) remotes.remove(r.playerId);
        }
        for (const p of roster) {
          if (p.playerId === session.playerId) continue; // don't render yourself as a remote pet
          remotes.upsert(p, nowSec());
        }
        hud.setRoster(remotes.list.map((r) => r.petName));
        session.chatWheel?.refresh();
      });
      net.onState((state) => {
        if (state.id === session.playerId) return; // explicit self-filter; applyState is a no-op for us anyway
        remotes.applyState(state, nowSec());
        // yarn-rally ghost tracking: remember the latest reported position of
        // whichever remote is currently broadcasting an active toy. Only the
        // owner clears it (toy: null in their own state) — a different
        // remote's null toy shouldn't clear someone else's ghost.
        if (Array.isArray(state.toy) && state.toy.length === 2 &&
            Number.isFinite(state.toy[0]) && Number.isFinite(state.toy[1])) {
          session.remoteToy = { ownerId: state.id, pos: state.toy, at: nowSec() };
        } else if (session.remoteToy && session.remoteToy.ownerId === state.id) {
          session.remoteToy = null;
        }
      });
      net.onEvent((ev) => applyRemoteEvent(session, ev));
      net.onChat((msg) => {
        if (!shouldShowIncomingChat(msg.id, {
          hideChat: settings.get('hideChat'),
          isMuted: (id) => mutedIds.has(id),
          isBlocked: (id) => blockList.has(id),
        })) return;
        if (!chatRate.allow(msg.id)) return;
        const p = phraseById(msg.phraseId);
        if (!p) return;
        const entry = session.remotes.list.find((r) => r.playerId === msg.id);
        if (entry) chatBubbles.show(entry.group, p.text);
      });
    }

    // Ghost visits (Task 4): cross-walk friends occasionally show up as a
    // translucent visitor on a SOLO walk only — a room co-walk already has
    // live remote pets rendered via `remotes`, and ghosts/rooms don't mix
    // (see the plan's "ghosts solo-only" note). Fetching friendships +
    // profiles is unavoidably async, so ghosts pop in a moment after the
    // walk starts; that's fine.
    if (roomSeed === undefined && MP) spawnGhosts(session);

    log.startWalk();
    hud.show();
    hud.setArea(areaData.name);
    hud.setPoints(state.points);
    hud.setRank(session.rankTitle);
    hud.setGoals(goals.goals);
    homebase.hide();
    overlay.innerHTML = `<div class="pause-card"><h1>Ready?</h1>
      <button id="btn-resume">${isTouch ? 'Tap to explore' : 'Start exploring (click)'}</button>
      <button id="btn-end">End walk &amp; head home</button>
      <p class="controls-hint">${isTouch
        ? 'Joystick to move · drag to look · buttons to pounce/meow/yarn/camera · tap the prompt to interact'
        : 'Arrows move · Shift stalk · Space pounce/climb · E interact/sniff · V meow · T yarn · C camera'}</p></div>`;
    overlay.classList.remove('hidden');
    player.enable();
    touchUI.setVisible(isTouch);

    catVoice();
    audio.startAmbient(areaId);
  }

  function endWalk() {
    if (!session) return;
    progression.completeWalk();
    pushProfileNow(); // refresh the public profile (rank/equip may have changed) while a petName exists

    // compute summary numbers while the session is still live
    const earned = progression.state.points - session.startPoints;
    const goalsDone = session.goals.goals.filter((g) => g.done).length;
    const isRecord = progression.recordWalkScore(earned);
    const discoveries = session.discoveryCount;
    const friendsGreeted = session.catsGreeted;
    const walkedWith = session.net ? session.remotes.list.map((r) => r.petName) : [];
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
      ${walkedWith.length ? `<div class="best-line">walked with: ${walkedWith.map(escapeHtml).join(', ')}</div>` : ''}
      <button id="btn-summary-continue" class="primary">Continue</button>
    </div>`;

    // co-walk rooms are per-walk: leaving here means the footer's "Host a
    // walk"/"Join" flow is available again next time everyone's back on the
    // home base screen. Fire-and-forget: endWalk must finish tearing down
    // the scene synchronously regardless of how the network leave resolves.
    if (session.net) {
      const net = session.net;
      pendingRoom = null;
      notifyRoomChange();
      Promise.resolve(net.leave()).catch(() => {});
    }

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
    session.remotes.dispose();
    session.ghosts.dispose();
    session.chatBubbles?.clear();
    session.chatWheel?.destroy();
    session = null;
    player.disable();
    hud.hide();
    touchUI.setVisible(false);
    hud.setPrompt(null);
    hud.setObjective(null);
    hud.setCamera(false);
    hud.setGoals(null);
    hud.setRoster(null);

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
    animateCat(cat, pose, t, speed, settings.get('reducedMotion'));

    // nap pile: napping near another napping remote pet is worth a shared award;
    // toast text scales with the pile size (n nearby nappers + you)
    if (pose === 'nap') {
      const n = s.remotes.list.filter(
        (r) => r.pose === 'nap' && r.group.position.distanceTo(cat.position) < 1.2
      ).length;
      if (n >= 1) {
        const text = `nap pile of ${n + 1}! 😴`;
        const points = log.awardOnce('nappile', 'nappile', text);
        if (points > 0) hud.toast(text);
      }
    }

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
    } else if (s.toyGhost.visible) {
      // yarn rally: batting a REMOTE-owned ghost ball requests authority
      // over it — the actual handoff happens once the owner's client
      // receives our 'bat' event (see applyRemoteEvent).
      const dist = cat.position.distanceTo(s.toyGhost.position);
      if (dist < 0.5 && s.batReady) {
        s.batReady = false;
        noteBat(s, s.playerId); // "in or out" — our own outgoing bat counts toward the rally too
        if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'bat' });
      } else if (dist > 1.1) {
        s.batReady = true;
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

  // touch has no E key — the prompt pill becomes tappable there (hud.js
  // strips the "E — " prefix and wires the tap to hud.onPromptTap above).
  function setPrompt(text) {
    hud.setPrompt(text, isTouch);
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
    // best-friend ghosts (greets >= 6) may be carrying a gift, rolled once
    // at spawn by createGhosts — same "close enough" proximity grant as the
    // stray gift check just above.
    for (const ghost of s.ghosts.list) {
      if (ghost.hasGift && ghost.group.position.distanceTo(catP) < 3) {
        log.awardOnce('gift', 'gift-ghost-' + ghost.playerId, `${ghost.petName} 👻 brought you a gift!`);
        ghost.hasGift = false;
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
        setPrompt(s.walk.carried >= s.walk.carryCap
          ? 'Paws full! (carry limit reached)'
          : `E — pick up ${c.label}`);
      }
    }
    if (!s.prompt) {
      const tippable = s.tippables.nearest(catP, 1.3);
      const gnome = s.secrets.list.find((e) => e.key === 'gnome');
      if (tippable) {
        s.prompt = { kind: 'tip', data: tippable };
        setPrompt('E — paw it over');
      } else if (gnome && !gnome.group.userData.tipped &&
          gnome.group.position.distanceTo(catP) < 1.3) {
        s.prompt = { kind: 'tip-gnome', data: gnome };
        setPrompt('E — paw over the gnome');
      }
    }
    if (!s.prompt) {
      const mound = s.scent.nearestMound(catP, 1.2);
      if (mound && mound.revealed) {
        s.prompt = { kind: 'dig' };
        setPrompt('E — dig it up');
      }
    }
    if (!s.prompt && s.quest && s.questGiver) {
      if (s.quest.state === 'offered' &&
          s.questGiver.group.position.distanceTo(catP) < 2.5) {
        s.prompt = { kind: 'quest-accept' };
        setPrompt('E — meow at the neighbor');
      } else if (s.quest.state === 'active' &&
          Math.hypot(s.quest.target.x - catP.x, s.quest.target.z - catP.z) < 2) {
        s.prompt = { kind: 'quest-complete' };
        setPrompt(s.quest.texts.prompt);
      }
    }
    if (!s.prompt) {
      const stray = s.strayCats.nearest(catP, 2.5, { ungreetedOnly: true });
      if (stray) {
        s.prompt = { kind: 'stray', data: stray };
        setPrompt(`E — touch noses with ${stray.name}`);
      }
    }
    if (!s.prompt) {
      const ghost = s.ghosts.nearest(catP, 2.5);
      if (ghost) {
        s.prompt = { kind: 'ghost', data: ghost };
        setPrompt(`E — touch noses with ${ghost.petName} 👻`);
      }
    }
    if (!s.prompt) {
      for (const c of s.critters.list) {
        if (c.type !== 'villager' || c.scratched) continue;
        if (c.group.position.distanceTo(catP) < 2.2) {
          s.prompt = { kind: 'scratch', data: c };
          setPrompt('E — get head scratches');
          break;
        }
      }
    }
    for (const c of s.critters.list) {
      if (c.type === 'villager' && c.scratched && c.group.position.distanceTo(catP) > 4) c.scratched = false;
    }
    if (!s.prompt) {
      const remote = s.remotes.nearest(catP, 1.5);
      if (remote) {
        s.prompt = { kind: 'boop', data: remote };
        setPrompt(`E — touch noses with ${remote.petName}`);
      }
    }
    if (!s.prompt) setPrompt(null);

    for (const sc of s.areaData.scenics) {
      if (Math.hypot(sc.x - catP.x, sc.z - catP.z) < 4) {
        log.awardOnce('scenic', `scenic-${sc.id}`, sc.label);
      }
    }
  }

  // Shared greet-award body for a stray cat: friend-points award, progression
  // ladder toast, and marking the stray greeted (so nearest(...,
  // {ungreetedOnly:true}) stops surfacing it). Used by BOTH the E-to-boop
  // interact prompt (below) and chat greetings (sendPhrase in startWalk) so
  // there is exactly one path that can ever pay out a stray friendship
  // award — talking never awards more than booping.
  function awardStrayGreet(s, stray) {
    s.strayCats.greet(stray, s.cat.position);
    log.awardOnce('friend', `friend-${stray.name}`, 'a new cat friend');
    s.catsGreeted += 1;
    const level = progression.recordGreet(stray.name, stray.breed, s.walkStamp);
    if (level === 'met') hud.toast(`You met ${stray.name}! ♡`);
    else if (level === 'friend') hud.toast(`${stray.name} is now your friend! ♥`);
    else if (level === 'best') hud.toast(`${stray.name} is your BEST friend! 💕`);
    catVoice();
  }

  function handleInteract(s) {
    if (!s.prompt) return;
    if (s.prompt.kind === 'collect' && s.walk.carried < s.walk.carryCap) {
      const c = s.prompt.data;
      s.scene.remove(s.collectibleMeshes.get(c.id));
      s.collectibleMeshes.delete(c.id);
      s.walk.carried += 1;
      log.awardOnce('collectible', `col-${c.id}`, c.label);
      if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'collect', collectibleId: c.id });
    } else if (s.prompt.kind === 'tip') {
      if (s.tippables.tip(s.prompt.data)) {
        log.awardOnce('mischief', `tip-${s.prompt.data.id}`, 'a gravity check 🐾');
        s.critters.dismayNear(s.prompt.data.group.position, 8);
        if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'tip', tipId: s.prompt.data.id });
      }
    } else if (s.prompt.kind === 'tip-gnome') {
      const gnome = s.prompt.data;
      gnome.group.rotation.z = -1.4;
      gnome.group.userData.tipped = true;
      log.awardOnce('mischief', 'tip-gnome', 'a gnome bowled over 🧙');
      if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'tip-gnome' });
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
      awardStrayGreet(s, s.prompt.data);
    } else if (s.prompt.kind === 'ghost') {
      const ghost = s.prompt.data;
      s.ghosts.greet(ghost, s.cat.position);
      s.catsGreeted += 1;
      catVoice();
      // local one-time award, same shape as the stray 'friend' award above —
      // only fires cloud.recordGreet on the walk this ghost is first
      // greeted (points > 0 means awardOnce actually paid out this time).
      const points = log.awardOnce('friend', `friend-ghost-${ghost.playerId}`, `${ghost.petName} 👻 visited`);
      if (points > 0 && MP) {
        const cloud = getCloud();
        if (cloud) {
          const name = ghost.petName;
          cloud.recordGreet(pid, getPsecret(), ghost.playerId, s.walkStamp)
            .then((greets) => {
              // same 1/3/6 ladder wording as Task 3's completeBoop toasts
              if (greets === 1) hud.toast(`You met ${name} across walks! ♡`);
              else if (greets === 3) hud.toast(`${name} is now your friend across walks! ♥`);
              else if (greets === 6) hud.toast(`${name} is now your BEST friend across walks! 💕`);
            })
            .catch((err) => console.warn('Whisker Walk: ghost recordGreet failed', err));
        }
      }
    } else if (s.prompt.kind === 'dig') {
      const treat = s.scent.digAt(s.cat.position);
      if (treat) {
        log.awardOnce('treasure', treat.id, 'a buried treasure!');
        if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'dig', treatId: treat.id });
      }
    } else if (s.prompt.kind === 'scratch') {
      s.prompt.data.scratched = true;
      log.award('pet', 'pet', 'blissful head scratches');
      audio.purr();
      if (PERSONALITIES[s.cat.userData.breed].special === 'napper') {
        log.award('perk', 'nap-pet', 'a deep contented purr'); // Persians LIVE for this
      }
    } else if (s.prompt.kind === 'boop') {
      const remote = s.prompt.data;
      // if they already sent us a request within the last 4s, this E press
      // IS the counter-request — complete the boop immediately instead of
      // starting a fresh wait.
      if (s.incomingBoop && s.incomingBoop.fromId === remote.playerId && nowSec() <= s.incomingBoop.until) {
        completeBoop(s, remote.playerId);
      } else {
        s.pendingBoop = { withId: remote.playerId, until: nowSec() + 4 };
        if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'boop-request', toId: remote.playerId });
        hud.toast('waiting for a boop back… 💕');
      }
    }
  }

  function petNameFor(s, playerId) {
    return s.remotes.list.find((r) => r.playerId === playerId)?.petName ?? 'A friend';
  }

  // turn the local cat to face a remote pet — reuses the same
  // "atan2(target - self) + PI" formula strayCats.greet/reactToMeow use to
  // turn a stray toward the player, just applied to our own cat instead.
  function turnToFace(s, otherId) {
    const remote = s.remotes.list.find((r) => r.playerId === otherId);
    if (!remote) return;
    const p = remote.group.position;
    s.cat.rotation.y = Math.atan2(p.x - s.cat.position.x, p.z - s.cat.position.z) + Math.PI;
  }

  // Boop handshake convergence point. Reachable from three places: a local E
  // press that matches an incoming request, a remote 'boop-request' that
  // matches our own outstanding pendingBoop, or a remote 'boop-confirm'
  // addressed to us. awardOnce naturally dedupes per pair-per-walk, and its
  // return value (0 once already paid) gates the outbound boop-confirm send
  // — so however many of the three paths fire, on however many clients, this
  // converges to exactly one award and one (redundant-but-harmless) confirm
  // per side without an infinite reply loop.
  function completeBoop(s, otherId) {
    const points = log.awardOnce('boop', `boop-${otherId}`, `a nose boop with ${petNameFor(s, otherId)} 💕`);
    if (points > 0) {
      audio.purr();
      turnToFace(s, otherId);
      hud.toast(`💕 boop with ${petNameFor(s, otherId)}!`);
      if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'boop-confirm', withId: otherId });
      // cross-walk friendship persistence (Task 3): fire-and-forget,
      // gated on the same `points > 0` branch as the local award so a
      // redundant completeBoop reached via more than one of the three
      // convergence paths never sends a second greet for this walk — the
      // server also dedupes per pair-per-walk via walkStamp, this just
      // avoids a wasted round trip on the obviously-redundant paths.
      if (MP) {
        const cloud = getCloud();
        if (cloud) {
          const name = petNameFor(s, otherId);
          cloud.recordGreet(s.playerId, getPsecret(), otherId, s.walkStamp)
            .then((greets) => {
              if (greets === 1) hud.toast(`You met ${name} across walks! ♡`);
              else if (greets === 3) hud.toast(`${name} is now your friend across walks! ♥`);
              else if (greets === 6) hud.toast(`${name} is now your BEST friend across walks! 💕`);
            })
            .catch((err) => console.warn('Whisker Walk: recordGreet failed', err));
        }
      }
    }
    // only clear state that belongs to THIS pair — an unrelated player's
    // boop-confirm shouldn't wipe an in-flight request to a third player
    if (s.pendingBoop?.withId === otherId) s.pendingBoop = null;
    if (s.incomingBoop?.fromId === otherId) s.incomingBoop = null;
  }

  // Yarn-rally counter: every 'bat' event we observe — our own outgoing
  // request AND every incoming one — either extends the rally (a different
  // batter than last time, within the 10s window) or starts a fresh one
  // (same batter twice in a row, or the rally went stale). Deliberately
  // tolerant of out-of-order network delivery: a wrong-order event just
  // resets the count rather than corrupting it.
  function noteBat(s, batterId) {
    const now = nowSec();
    if (!s.rally || now - s.rally.at > 10 || s.rally.lastId === batterId) {
      s.rally = { count: 1, lastId: batterId, at: now };
    } else {
      s.rally = { count: s.rally.count + 1, lastId: batterId, at: now };
    }
    if (s.rally.count === 3 || s.rally.count === 6 || s.rally.count === 10) {
      const points = log.awardOnce('rally', `rally-${s.rally.count}`, `yarn rally x${s.rally.count}! 🧶`);
      if (points > 0) hud.toast(`yarn rally x${s.rally.count}! 🧶`);
    }
  }

  // canon world objects (tippables/treats/collectibles) are first-come: a
  // remote player's tip/dig/collect event may consume something we were
  // headed for ourselves — if it happened within our own prompt range, let
  // the player know why their prompt just vanished.
  function maybeSnipeToast(s, ev, pos) {
    if (pos && s.cat.position.distanceTo(pos) <= 6) {
      hud.toast(`${petNameFor(s, ev.id)} got there first!`);
    }
  }

  // Applies a remote player's canon-event broadcast locally, WITHOUT
  // awarding any points — points are earned only by the player who actually
  // performed the action; this just mirrors the resulting world state
  // (topple/mound-open/mesh-removal/sound) so both clients see the same walk.
  function applyRemoteEvent(s, ev) {
    if (!s || !ev || typeof ev.type !== 'string') return;
    if (ev.type === 'tip') {
      const e = s.tippables.list.find((x) => x.id === ev.tipId);
      if (e && s.tippables.tipById(ev.tipId)) maybeSnipeToast(s, ev, e.group.position);
    } else if (ev.type === 'tip-gnome') {
      const gnome = s.secrets.list.find((x) => x.key === 'gnome');
      if (gnome && !gnome.group.userData.tipped) {
        gnome.group.rotation.z = -1.4;
        gnome.group.userData.tipped = true;
        maybeSnipeToast(s, ev, gnome.group.position);
      }
    } else if (ev.type === 'dig') {
      const treat = s.scent.digById(ev.treatId);
      if (treat) maybeSnipeToast(s, ev, new THREE.Vector3(treat.x, 0, treat.z));
    } else if (ev.type === 'collect') {
      if (s.collectibleMeshes.has(ev.collectibleId)) {
        const c = s.areaData.collectibles.find((x) => x.id === ev.collectibleId);
        s.scene.remove(s.collectibleMeshes.get(ev.collectibleId));
        s.collectibleMeshes.delete(ev.collectibleId);
        if (c) maybeSnipeToast(s, ev, new THREE.Vector3(c.x, 0, c.z));
      }
    } else if (ev.type === 'meow') {
      const pos = Array.isArray(ev.pos) && ev.pos.length === 2
        ? new THREE.Vector3(ev.pos[0], 0, ev.pos[1])
        : s.cat.position;
      const dist = s.cat.position.distanceTo(pos);
      const vol = meowVolumeForDistance(dist);
      if (ev.breed === 'hagrid') audio.cluck(vol); else audio.meow(vol);
      s.critters.reactToMeow(pos);
      // duet: a reply meow (V) within the next 3s, from us, harmonizes with this one
      if (dist <= 8) s.duetWindow = { withId: ev.id, until: nowSec() + 3 };
    } else if (ev.type === 'boop-request') {
      if (ev.toId !== s.playerId) return;
      const now = nowSec();
      if (s.pendingBoop && s.pendingBoop.withId === ev.id && now <= s.pendingBoop.until) {
        // we'd already sent our own request to them — request + counter-request = mutual
        completeBoop(s, ev.id);
      } else {
        s.incomingBoop = { fromId: ev.id, until: now + 4 };
      }
    } else if (ev.type === 'boop-confirm') {
      if (ev.withId === s.playerId) completeBoop(s, ev.id);
    } else if (ev.type === 'duet') {
      if (ev.withId === s.playerId) {
        log.awardOnce('duet', `duet-${ev.id}`, `a harmonized duet with ${petNameFor(s, ev.id)} 🎶`);
        catVoice(1.26);
      }
    } else if (ev.type === 'bat') {
      noteBat(s, ev.id);
      if (s.toy.active) {
        // we currently own the yarn ball — hand authority to whoever just batted our ghost
        if (s.net) {
          s.net.sendEvent({
            v: 1,
            id: s.playerId,
            type: 'yarn-authority',
            toId: ev.id,
            pos: [s.toy.mesh.position.x, s.toy.mesh.position.z],
          });
        }
        s.toy.retrieve(); // silently — this isn't the player's own T-key retrieve
      }
    } else if (ev.type === 'yarn-authority') {
      if (ev.toId === s.playerId && Array.isArray(ev.pos) && ev.pos.length === 2) {
        s.toy.setPosition(new THREE.Vector3(ev.pos[0], 0.13, ev.pos[1]));
        s.batReady = true; // freshly acquired — ready to bat right away
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
    for (const r of s.remotes.list) candidates.push({ key: 'friend-pet', label: r.petName, pos: r.group.position });
    for (const g of s.ghosts.list) candidates.push({ key: 'friend-pet', label: g.petName, pos: g.group.position });
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
    if (player.engaged) {
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
    renderer.render(session.scene, camera);
  });
}
