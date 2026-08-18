// The walk lifecycle, lifted out of main.js's init() closure: everything that
// builds a walk (startWalk), the two entry points that reach it from the home
// base (beginWalkFromHomebase / beginDenWalk), the async ghost spawn, and the
// teardown + summary card (endWalk).
//
// main.js still owns the `session` binding — the render loop, the keydown
// handlers and the discovery bus all read it — so this module reaches it
// through getSession()/setSession() rather than owning it. startWalk takes a
// local snapshot right after publishing the new session, because its
// straight-line body is synchronous and nothing it calls can re-enter
// start/endWalk; every callback that OUTLIVES that body (the chat reply
// timeouts, the presence/state/event/chat handlers, the ghost spawn's
// post-await re-checks) still goes through getSession(), so a callback that
// lands after endWalk sees the torn-down session exactly as it always did.

import * as THREE from 'three';
import * as neighborhood from '../world/neighborhood.js';
import * as park from '../world/park.js';
import * as seaside from '../world/seaside.js';
import * as den from '../world/den.js';
import { clearSpot } from '../world/spots.js';
import { puddle as puddleProp } from '../world/builder.js';
import { buildCat } from '../cat/model.js';
import { PERSONALITIES } from '../cat/brain.js';
import { cameraOffset } from '../catcam.js';
import { createCritters } from '../critters.js';
import { createStrayCats } from '../straycats.js';
import { createRemoteCats } from '../remotecats.js';
import { rollGhosts, createGhosts } from '../ghosts.js';
import { createTippables } from '../tippables.js';
import { createScent } from '../scent.js';
import { createToy } from '../toy.js';
import { createQuest } from '../quests.js';
import { createGoals } from '../goals.js';
import { rankFor } from '../progression.js';
import { createFx } from '../fx.js';
import { createSkyLife } from '../skylife.js';
import { rollWeather, createWeather } from '../weather.js';
import { rollSecrets, createSecrets } from '../secrets.js';
import { GOLD_MICE, createGoldMice } from '../goldmice.js';
import { kittenPlan, createKittenEncounter } from '../kitten.js';
import { raceCourse, createRace } from '../race.js';
import { createChatBubbles } from '../chatbubble.js';
import { createChatWheel } from '../ui/chatwheel.js';
import { phraseById, createChatRateLimiter, shouldShowIncomingChat } from '../chat.js';
import { replyFor, countsAsGreet } from '../catreplies.js';
import { litMaterial } from '../render/materials.js';
import { resolveQuality } from '../render/quality.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { unlockedSkills } from '../skills.js';
import { nowSec, escapeHtml, hashName } from './util.js';

const AREAS = { neighborhood, park, seaside, den };
// default session.ghosts before (or absent) an async spawn resolves — lets
// the render loop/updateInteractions/endWalk call the ghosts API
// unconditionally instead of null-checking it everywhere.
const NO_GHOSTS = { list: [], nearest: () => null, update() {}, dispose() {} };

export function createWalkLifecycle({
  MP, pid, coarse, envMap, overlay, blockList,
  renderer, camera, composerRig,
  player, progression, settings, hud, audio, music, log, touchUI, catVoice,
  getCloud, getSession, setSession, getIsTouch, getHomebase,
  getPendingRoom, clearPendingRoom, pushProfileNow,
  awardStrayGreet, applyRemoteEvent, cloudToast,
}) {
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
      if (getSession() !== mySession) return;
      const greetsById = new Map();
      const otherIds = [];
      for (const r of rows) {
        const otherId = r.a_id === pid ? r.b_id : r.a_id;
        otherIds.push(otherId);
        greetsById.set(otherId, r.greets);
      }
      if (!otherIds.length) return;
      const profiles = await cloud.fetchProfiles(otherIds);
      if (getSession() !== mySession) return;
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

  // homebase's Start button always calls this; solo play (no room, or a
  // joiner who — thanks to the disabled "Waiting for host…" button — never
  // gets a click through) is unaffected. Only the host actually reaches the
  // room branch, and it's the host who owns the shared seed: it's computed
  // once here and carried to everyone (including the host) via walk-config.
  function beginWalkFromHomebase({ duskMode }) {
    const pendingRoom = getPendingRoom();
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
        getHomebase().refresh();
      }
    } else {
      startWalk({ duskMode });
    }
  }

  // The den button's variant (Task 7.2): the den never joins a room walk
  // (homebase hides the button while a room is pending — see
  // renderDenSection's `rooms.getState()` check), so this bypasses
  // beginWalkFromHomebase's host/joiner room branch entirely and calls
  // startWalk directly with areaOverride: 'den' — same mechanism a room
  // joiner's areaOverride uses to walk somewhere without persisting it as
  // state.area (main.js:974-ish, see startWalk's areaId comment).
  function beginDenWalk() {
    startWalk({ areaOverride: 'den' });
  }


  function startWalk({ duskMode = false, roomSeed, areaOverride } = {}) {
    const tier = resolveQuality({
      coarse,
      reducedMotion: settings.get('reducedMotion'),
      override: settings.get('quality'),
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatioCap));
    const walkRng = roomSeed !== undefined ? mulberry32(roomSeed) : Math.random;
    const state = progression.state;
    // areaOverride: a joiner who hasn't unlocked the host's area still walks
    // there for this one co-walk, without progression.setArea persisting an
    // area they haven't actually earned.
    const areaId = areaOverride ?? state.area;
    // The den (Task 7.2): a small indoor area with its own build signature
    // (den.build(scene, { placed })) and a stack of walk-system guards below
    // — no weather/secrets/quest/strays/goals/race/goldMice/sky-life indoors,
    // but ghosts still visit and the kitten's home-stage still shows up.
    const isDen = areaId === 'den';
    const walkStamp = 'walk-' + Date.now();
    const scene = new THREE.Scene();
    scene.environment = envMap;
    scene.environmentIntensity = tier.envIntensity;
    if (tier.postFx) {
      composerRig.ensure();
      composerRig.attachScene(scene); // point the composer's RenderPass at this walk's scene
    }
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(30, 50, 20);
    scene.add(sun, new THREE.AmbientLight(0xbfd8ff, 0.9));

    const areaData = isDen
      ? AREAS.den.build(scene, { placed: progression.state.den.placed })
      : AREAS[areaId].build(scene);
    // POIs are authored as "interesting spots" and several sit dead-center
    // on scenery (the park fountain, the parked car) — fine as vibes, but
    // race rings and quest objects placed there are unreachable: player
    // collision stops the cat outside collider.r + 0.35, while the ring
    // cross check needs < 1.2 and quest completion < 2. clearSpot is
    // deterministic, so the shared-seed race course stays identical across
    // devices (it derives from static area data only).
    const walkPois = areaData.pois.map((p) => clearSpot(p, areaData.colliders, areaData.bounds));

    const cat = buildCat(state.equipped.cat, {
      collar: state.equipped.collar,
      head: state.equipped.head,
      face: state.equipped.face,
      neck: state.equipped.neck,
      body: state.equipped.body,
      back: state.equipped.back,
      feet: state.equipped.feet,
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
      // dusk: house windows glow warm (bloom-friendly on the high tier; endWalk's
      // scene traversal disposes the swapped material like any other)
      scene.traverse((o) => {
        if (o.userData?.window) {
          const old = o.material;
          o.material = litMaterial(0xffe0a0, { emissive: 0x8a6a20 });
          old.dispose();
        }
      });
    }

    let weather = { condition: 'clear', rainbowVisible: false, rainbowPos: null, update() {} };
    if (!duskActive && !isDen) {
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

    // Secrets (unicorn/UFO) are outdoor-only sight gags — skip them indoors
    // rather than have one spawn inside the den's 16x16 room.
    const secrets = isDen
      ? { list: [], update() {} }
      : createSecrets(scene, areaData, rollSecrets(walkRng, { eveningLight: duskActive || weather.condition === 'sunset' }), walkRng);

    const critters = createCritters(scene, areaData.critterSpawns, {
      fleeScale: equipped.collar === 'bell' ? 0.5 : 1,        // bell: birds tolerate you closer
      spawnFireflies: duskActive,                              // glow: dusk fireflies
      trailButterflies: equipped.head === 'crown',              // crown: butterflies trail the cat
      // v18 Task 1.4: the dusk fireflies are PLACED, so they belong on the
      // shared determinism stream like secrets/strays/scent above — they
      // used a bare Math.random(), which put two co-walkers on the same
      // room seed in visibly different firefly fields.
      rng: walkRng,
    });

    const collectibleMeshes = new Map();
    for (const c of areaData.collectibles) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        litMaterial(0xf25c8a, { emissive: 0x5a1a30 })
      );
      m.position.set(c.x, (c.y ?? 0) + 0.2, c.z);
      scene.add(m);
      collectibleMeshes.set(c.id, m);
    }

    let questGiver = null;
    let quest = null;
    let questObject = null;
    // No quest givers indoors — den critterSpawns is already empty so this
    // is naturally null, but isDen keeps it explicit against a future den
    // critter addition accidentally growing a quest chain in the den.
    const giver = isDen ? null : critters.list.find((c) => c.type === 'villager');
    if (giver) {
      questGiver = giver;
      quest = createQuest(walkRng, walkPois);
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.4, 6),
        litMaterial(0xf2c14e, { emissive: 0x6a5010 })
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
          litMaterial(0xf2e04e, { emissive: 0x8a7a20 })
        );
        questObject.position.y = 1;
      } else {
        questObject = new THREE.Group();
        for (const side of [-0.12, 0.12]) {
          const lens = new THREE.Mesh(
            new THREE.TorusGeometry(0.09, 0.02, 6, 12),
            litMaterial(0x4a4a52)
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

    const strayCats = createStrayCats(scene, areaData, isDen ? 0 : (coarse ? 14 : 22), walkRng);
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
      litMaterial(0xf25c9a)
    );
    toyGhost.visible = false;
    scene.add(toyGhost);
    const tippables = createTippables(scene, areaData.tippables ?? []);
    const scent = createScent(scene, areaData, walkRng);

    sun.castShadow = true;
    sun.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
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

    // No goals in the den (Task 7.2) — session.goals stays null and every
    // consumer below (noteGoal's `!session?.goals` guard, hud.setGoals,
    // endWalk's goalsDone/summary) treats a null goals as "this walk has no
    // goal HUD" rather than crashing on it.
    const goals = isDen ? null : createGoals(walkRng);
    // Co-walk duo goal (Task 6.2): both clients derive this from the SAME
    // seeded goal pool + walkRng draw, then deterministically overwrite
    // slot 0 with an identical shared goal — no extra wire event needed to
    // agree on what the duo goal even is, only on its progress (see
    // 'goal-progress' in applyRemoteEvent). Den never carries a roomSeed
    // (it never joins room walks), so the `goals &&` guard here is belt-
    // and-suspenders rather than a path that actually gets hit.
    if (goals && roomSeed !== undefined) {
      goals.goals[0] = {
        id: 'duo-greet', text: 'Together: greet 5 cats', type: 'friend',
        target: 5, duo: true, progress: 0, done: false,
      };
    }

    const session = {
      scene, areaData, cat, critters, strayCats, remotes, collectibleMeshes, duskMode,
      // v18 Task 1.4: the walk was ACTUALLY dusk (duskMode gated on the glow
      // collar for solo walks — see where duskActive is computed above).
      // endWalk needs it for the duskWalks tally that Night Eyes reads;
      // duskMode alone would credit a dusk walk the player never got.
      duskActive,
      useComposer: tier.postFx,
      ghosts: NO_GHOSTS,
      walkStamp,
      netSendAccum: 0,
      // read once per walk (not per frame) so the zoomies trail's reducedMotion
      // gate doesn't re-query settings 60x/sec in the render loop.
      reducedMotion: settings.get('reducedMotion'),
      zoomTrailAccum: 0,
      wasZooming: false,
      goals,
      startPoints: state.points,
      discoveryCount: 0,
      catsGreeted: 0,
      rankTitle: rankFor(state.lifetimePoints).title,
      weather,
      fx: createFx(scene, { reducedMotion: settings.get('reducedMotion') }),
      // dedicated rng stream (never walkRng): sky life must not perturb the
      // shared determinism stream that co-walk clients rely on staying in
      // sync — see Global Constraints. Seeding off roomSeed (when present)
      // keeps co-walk clients' clouds identical without touching walkRng.
      // Indoor den: no sky to animate — a no-op stub keeps the render loop's
      // unconditional session.skyLife.update()/dispose() calls safe.
      skyLife: isDen ? { update() {}, dispose() {} } : createSkyLife(scene, {
        rng: mulberry32(((roomSeed ?? (Math.random() * 2 ** 31)) >>> 0) ^ 0x5eaf00d),
        reducedMotion: settings.get('reducedMotion'),
      }),
      secrets,
      tippables,
      scent,
      quest, questGiver, questObject,
      walk: { carried: 0, carryCap: equipped.back === 'backpack' ? 3 : 2 },
      momentTimer: 40,
      activeMoment: null,
      prompt: null,
      lastPromptKind: null,
      balkedPuddles: new Set(),
      toy, batCount: 0, batReady: true,
      toyGhost, remoteToy: null,
      pendingBoop: null, incomingBoop: null,
      tagChain: null, groomTimers: new Map(),
      duetWindow: null,
      rally: null,
      cameraMode: false,
      idleTime: 0,
      freezeTime: 0,
      boxTime: 0,
      perched: null,
      pounceTime: 0,
      pounceCooldown: 0,
      landTime: 0,
      stepPhase: 0,
      slowmoTime: 0,
      pose: 'follow',
      stretchTime: 0,
      sniffTime: 0,
    };
    setSession(session);

    // golden mice: personal, position-static, award-local — no wire events,
    // so this is co-walk safe without touching walkRng or session.net at
    // all. areas without an entry in GOLD_MICE (none currently, but future
    // areas like the den) get an inert stub instead of a lookup throw.
    session.goldMice = areaId in GOLD_MICE
      ? createGoldMice(scene, areaId, new Set(progression.state.golden))
      : { list: [], update() {}, checkFind: () => null, remove() {}, dispose() {} };

    // lost-kitten quest chain: solo walks only (roomSeed === undefined) — a
    // co-walk kitten would desync the shared canon since it's driven by
    // this device's own progression.state.kitten.stage. A no-op stub (same
    // shape as goldMice's above) covers every other case: co-walks, and
    // solo walks where kittenPlan has nothing to offer this stage/area.
    const kittenPlanResult = roomSeed === undefined
      ? kittenPlan(progression.state.kitten.stage, areaId)
      : null;
    session.kittenEnc = kittenPlanResult
      ? createKittenEncounter(scene, kittenPlanResult, areaData.spawn, { onMew: () => audio.trill(0.7, 1.5) })
      : { group: null, update() {}, promptAt: () => null, interact: () => null, dispose() {} };
    // Fixed at walk start, from the SAME kittenPlanResult that built the
    // encounter above — handleInteract's 'kitten' branch dispatches on this,
    // not the live progression.state.kitten.stage. Reading the live stage
    // there let three E-presses in one walk race through all three award
    // branches (trail's promptAt had no post-interact gate, so a stray extra
    // press re-entered handleInteract, saw the stage the FIRST press just
    // advanced to, and paid the next branch's award — collapsing the whole
    // 3-walk arc into one walk). setKittenStage is monotonic, so branching on
    // this stale-by-design kind can never regress the stage either way.
    session.kittenPlanKind = kittenPlanResult?.kind ?? null;

    // Daily zoomies race (Task 6.3): a 5-checkpoint course seeded from
    // TODAY's date + this area — NOT walkRng (that stream is reserved for
    // the shared co-walk world-gen sequence both clients step through in
    // lockstep; the race seed must stay identical every time either sibling
    // opens this area today, including a re-walk, so it can't be perturbed
    // by weather/secrets rolls upstream of it) and no wire event ever
    // carries the course itself — a solo player AND every device in a room
    // independently derive the exact same 5 waypoints from (today, areaId),
    // so siblings racing together are automatically on the same course.
    // areaData.pois always has >= 8 entries for every real area (see
    // src/world/*.js), but the guard below keeps this inert instead of
    // throwing if a future area (e.g. the den) ever ships with fewer than 5.
    const today = new Date().toISOString().slice(0, 10);
    session.race = walkPois.length >= 5
      ? createRace(scene, raceCourse(walkPois, seedFromCode(today + '-' + areaId)), areaData.spawn)
      : { state: 'idle', timeMs: 0, currentRing: 0, update() {}, promptAt: () => null, begin() {}, dispose() {} };
    session.areaId = areaId;
    session.raceDate = today;
    // last "ring N/5" value written to the HUD objective (or null when the
    // race isn't the one currently occupying it) — lets the per-frame loop
    // below update the objective only on an actual ring change instead of
    // every frame, and tells the 'done' transition whether it's safe to
    // clear the objective (only if OUR text is still the one showing).
    session.raceRingShown = null;

    // co-walks: a room formed on the home base screen (host/join) carries
    // its net/playerId/petName into the session here; solo walks never set
    // pendingRoom at all, so session.net stays undefined and every co-walk
    // branch below is a no-op.
    const pendingRoom = getPendingRoom();
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
      awardStrayGreet(getSession(), stray);
    }

    function sendPhrase(phraseId) {
      const session = getSession();
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
          const live = getSession();
          if (live && live.strayCats.strays.includes(target)) chatBubbles.show(target.group, line);
        }, 600);
        // Friendship: a greeting counts once, only if this cat is still ungreeted this walk.
        if (countsAsGreet(phraseId)) greetStrayByChat(target);
      } else {
        // No stray in range — try the nearest ghost (befriended cross-walk
        // pet visiting this solo walk). Reply-only: no greetStrayByChat/
        // awardStrayGreet call here — ghost greets are earned exclusively
        // via the E-boop 'ghost' interact branch above, so chatting near a
        // ghost never double-awards friendship.
        const ghost = session.ghosts.nearest(catP, 5);
        if (ghost) {
          // ghost.petName is server-derived (untrusted) — it is ONLY hashed
          // below, never rendered; `line` comes from the static catreplies
          // catalog keyed on ghost.breed, so nothing untrusted reaches the
          // bubble text.
          const seed = (seedFromCode(session.walkStamp ?? '') + hashName(ghost.petName)) >>> 0;
          const line = replyFor(ghost.breed, phraseId, seed);
          setTimeout(() => {
            const live = getSession();
            if (live && live.ghosts.list.includes(ghost)) chatBubbles.show(ghost.group, line);
          }, 600);
        }
      }
    }
    session.sendPhrase = sendPhrase; // exposed for Task 3's keyboard-driven send

    const chatWheel = createChatWheel(document.body, {
      onPick: sendPhrase,
      getPlayers: () => {
        const live = getSession();
        return live.net ? live.remotes.list.map((r) => ({ id: r.playerId, name: r.petName })) : [];
      },
      isMuted: (id) => mutedIds.has(id),
      toggleMute: (id) => { if (mutedIds.has(id)) mutedIds.delete(id); else mutedIds.add(id); },
    });
    session.chatWheel = chatWheel;
    chatWheel.setVisible(true);
    hud.toast('Press 1–9 to chat · Enter for phrases'); // once per walk (startWalk runs once per walk)

    if (session.net) {
      const net = session.net;
      net.onRoster((roster) => {
        const session = getSession();
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
        const session = getSession();
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
      net.onEvent((ev) => applyRemoteEvent(getSession(), ev));
      net.onChat((msg) => {
        if (!shouldShowIncomingChat(msg.id, {
          hideChat: settings.get('hideChat'),
          isMuted: (id) => mutedIds.has(id),
          isBlocked: (id) => blockList.has(id),
        })) return;
        if (!chatRate.allow(msg.id)) return;
        const p = phraseById(msg.phraseId);
        if (!p) return;
        const entry = getSession().remotes.list.find((r) => r.playerId === msg.id);
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
    hud.setGoals(goals ? goals.goals : null);
    getHomebase().hide();
    overlay.innerHTML = `<div class="pause-card"><h1>Ready?</h1>
      <button id="btn-resume">${getIsTouch() ? 'Tap to explore' : 'Start exploring (click)'}</button>
      <button id="btn-end">End walk &amp; head home</button>
      <p class="controls-hint">${getIsTouch()
        ? 'Joystick to move · drag to look · buttons to pounce/meow/yarn/camera · tap the prompt to interact'
        : 'Arrows move · Shift stalk · Space pounce/climb · E interact/sniff · V meow · T yarn · C camera'}</p></div>`;
    overlay.classList.remove('hidden');
    player.enable();
    touchUI.setVisible(getIsTouch());

    catVoice();
    audio.startAmbient(areaId, { dusk: duskActive, rain: weather.condition === 'rain' });
    // roomSeed (when present) is shared by every player in the room, so a
    // co-walk hears the identical generated song; solo/den walks fall back
    // to a seed derived from this walk's own stamp. Mood mirrors the same
    // dusk/rain/sunset/day branching already used for ambience/lighting
    // above. music.setVolume(0) (pushed by applySettings) makes start() a
    // cheap no-op, so no separate "is music enabled" check is needed here —
    // being muted does NOT skip start(): the scheduler still runs, silenced
    // via music.setMuted()'s gain-zeroing, so unmuting mid-walk resumes
    // instantly instead of waiting for the next walk.
    const musicMood = duskActive ? 'dusk' : weather.condition === 'rain' ? 'rain' : weather.condition === 'sunset' ? 'sunset' : 'day';
    music.start(roomSeed ?? seedFromCode(walkStamp), musicMood);
  }

  function endWalk() {
    const session = getSession();
    if (!session) return;
    // session.areaId is the area actually walked (set in startWalk from
    // areaOverride ?? state.area) — pass it explicitly so a den walk (which
    // never persists state.area) increments walks.den, not whatever other
    // area state.area still points at.
    progression.completeWalk(session.areaId, { dusk: session.duskActive });
    // v18 Task 1.4: persist whatever this walk earned. Ordered AFTER
    // completeWalk on purpose — completeWalk is what bumps duskWalks, so the
    // fifth dusk walk unlocks Night Eyes at the end of that same walk rather
    // than the next one. recordSkillUnlocks returns only the ids added just
    // now, which is what Task 2.7's in-walk unlock celebration will consume;
    // until then the return value is intentionally unused and this call
    // exists so an earned ability is stored and can never be revoked by a
    // later threshold change.
    progression.recordSkillUnlocks(unlockedSkills(progression.state));
    // Daily streak: recorded (and any bonus added) BEFORE `earned` below is
    // computed, so the streak bonus is folded into this walk's own "whisker
    // points" total rather than silently landing in the next walk's earned
    // count.
    const today = new Date().toISOString().slice(0, 10);
    const streak = progression.recordStreakWalk(today);
    if (streak.bonus > 0) progression.addPoints(streak.bonus);
    pushProfileNow(); // refresh the public profile (rank/equip may have changed) while a petName exists

    // compute summary numbers while the session is still live
    const earned = progression.state.points - session.startPoints;
    // Den walks carry no goals (session.goals is null there) — the summary
    // below hides the goals stat entirely rather than show "0/3".
    const goalsDone = session.goals ? session.goals.goals.filter((g) => g.done).length : 0;
    const isRecord = progression.recordWalkScore(earned);
    const discoveries = session.discoveryCount;
    const friendsGreeted = session.catsGreeted;
    const walkedWith = session.net ? session.remotes.list.map((r) => r.petName) : [];
    // kitten stage 2 is transient — set at the end of the "meet" walk (see
    // handleInteract's 'kitten' branch) and promoted to 3 right here, at
    // that same walk's summary, so "Mochi followed you home" lands on the
    // walk where she actually started following.
    const mochiArrived = progression.state.kitten.stage === 2;
    if (mochiArrived) progression.setKittenStage(3);
    const summaryHtml = `<div class="summary-card">
      <h1>Walk complete!</h1>
      ${isRecord
        ? '<div class="record-banner">NEW BEST WALK! 🏆</div>'
        : `<div class="best-line">best walk: ${progression.state.bestWalk} 🐾</div>`}
      <div class="summary-stats">
        <div class="stat"><span class="stat-value">${earned}</span><span class="stat-label">whisker points</span></div>
        <div class="stat"><span class="stat-value">${discoveries}</span><span class="stat-label">discoveries</span></div>
        <div class="stat"><span class="stat-value">${friendsGreeted}</span><span class="stat-label">cats greeted</span></div>
        ${session.goals ? `<div class="stat"><span class="stat-value">${goalsDone}/3</span><span class="stat-label">goals complete</span></div>` : ''}
      </div>
      ${walkedWith.length ? `<div class="best-line">walked with: ${walkedWith.map(escapeHtml).join(', ')}</div>` : ''}
      ${streak.bonus > 0 ? `<div class="best-line">🔥 day ${streak.count} streak — +${streak.bonus} bonus 🐾</div>` : ''}
      ${mochiArrived ? '<div class="best-line">Mochi the kitten followed you home! 🐱</div>' : ''}
      <button id="btn-summary-continue" class="primary">Continue</button>
    </div>`;

    // co-walk rooms are per-walk: leaving here means the footer's "Host a
    // walk"/"Join" flow is available again next time everyone's back on the
    // home base screen. Fire-and-forget: endWalk must finish tearing down
    // the scene synchronously regardless of how the network leave resolves.
    if (session.net) {
      const net = session.net;
      clearPendingRoom();
      Promise.resolve(net.leave()).catch(() => {});
    }

    session.fx.dispose();
    session.skyLife.dispose();
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
    session.goldMice.dispose();
    session.kittenEnc.dispose();
    session.race.dispose();
    session.strayCats.dispose();
    session.remotes.dispose();
    session.ghosts.dispose();
    session.chatBubbles?.clear();
    session.chatWheel?.destroy();
    setSession(null);
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
    music.stop();
  }

  return { beginWalkFromHomebase, beginDenWalk, startWalk, endWalk };
}
