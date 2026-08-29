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
import * as docks from '../world/docks.js';
import { clearSpot } from '../world/spots.js';
import { puddle as puddleProp } from '../world/builder.js';
import { skyBackground } from '../render/sky.js';
import { buildCat } from '../cat/model.js';
import { PERSONALITIES } from '../cat/brain.js';
import { cameraOffset } from '../catcam.js';
import { createCritters } from '../critters.js';
import { createStrayCats } from '../straycats.js';
import { createRemoteCats } from '../remotecats.js';
import { rollGhosts, createGhosts } from '../ghosts.js';
import { createGifts, pickFoundGift, NO_GIFTS } from '../gifts.js';
import { createTippables } from '../tippables.js';
import { createScent } from '../scent.js';
import { createToy } from '../toy.js';
import { createQuest } from '../quests.js';
import { createGoals } from '../goals.js';
import { rankFor } from '../progression.js';
import { zoomTuning, canSwim } from '../player.js';
import { createFx } from '../fx.js';
import { createSkyLife } from '../skylife.js';
import { rollWeather, createWeather } from '../weather.js';
import { rollSecrets, createSecrets } from '../secrets.js';
import { GOLD_MICE, createGoldMice } from '../goldmice.js';
import { createEnemyWalkLog } from '../enemies.js';
import { kittenPlan, createKittenEncounter } from '../kitten.js';
import { raceCourse, createRace } from '../race.js';
import { createChatBubbles } from '../chatbubble.js';
import { createChatWheel } from '../ui/chatwheel.js';
import { phraseById, createChatRateLimiter, shouldShowIncomingChat } from '../chat.js';
import { replyFor, countsAsGreet } from '../catreplies.js';
import { litMaterial } from '../render/materials.js';
import { setTextureTier } from '../render/textures.js';
import { waterRig } from '../render/water.js';
import { createWind } from '../render/wind.js';
import { createShadowFit } from '../render/shadowfit.js';
import { createContactShadows } from '../render/contactshadows.js';
import { resolveQuality } from '../render/quality.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { SKILLS, hasSkill, unlockedSkills } from '../skills.js';
import { bus } from '../events.js';
import { createUnlockCelebration } from './celebrate.js';
import { nowSec, escapeHtml, hashName } from './util.js';

// Every walkable area the game can build. Registering here is the last of
// the three steps that make an area real: the builder module, the
// CATALOG.areas entry + state.walks key in progression.js (which give it a
// home-base card, a price and an unlock gate), and this map, which is what
// startWalk indexes with state.area. An area missing from here is a fully
// built world nothing can ever call.
const AREAS = { neighborhood, park, seaside, den, docks };
// default session.ghosts before (or absent) an async spawn resolves — lets
// the render loop/updateInteractions/endWalk call the ghosts API
// unconditionally instead of null-checking it everywhere.
const NO_GHOSTS = { list: [], nearest: () => null, update() {}, dispose() {} };
// Same idea for an area with no golden mice (the den today, a future area
// before its three are placed): every goldMice method the walk calls, inert.
// nearestUnfound is here because v18's Whisker Sense asks for it every frame.
const NO_GOLD_MICE = {
  list: [], update() {}, checkFind: () => null, nearestUnfound: () => null,
  remove() {}, dispose() {},
};
const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

// -----------------------------------------------------------------------------
// THE KEY LIGHT AND THE FILL, as one calibrated pair (docs/VISUAL-PASS.md 1.2
// and 1.3). They are written down together because they were TUNED together:
// either number read against the other's old value is meaningless, which is why
// the two plan items were done as one change.
//
// SUN_POSITION — was (30, 50, 20), an elevation of 54 degrees, i.e. near noon
// and the single flattest angle a directional light has. A 3m tree cast a 2.2m
// shadow that never escaped its own canopy. This is 19.1 degrees, where the
// same tree casts 8.7m.
//
// AZIMUTH: the sun is on the OTHER END of the axis it used to be on, and this
// is the one number in the pair that was never tuned. Wave 1.3 set (36, 15,
// 24) — bearing 56.3 degrees, measured from +z toward +x — and its comment
// claimed the sun "was already coming over the player's shoulder at spawn,
// which is the flattering direction for a chase camera". Both halves of that
// were wrong. Over the shoulder is where the sun was, and over the shoulder is
// the WORST place for it: every shadow then falls away from the viewer and
// hides behind the object casting it. Wave 1's own audit recorded the symptom
// without naming the cause — shadow contribution ranging 0% to 44% across the
// 24-view panel — and left it as the pass's largest open item.
//
// (-36, 15, -24) is the exact antipode: same 43.27m ground radius, same y, so
// the same 19.1 degrees of elevation BY CONSTRUCTION rather than by rounding,
// and bearing 236.3. The sun keeps the compass AXIS Wave 1.3 gave it and
// changes only which end of it it sits on, so shadows travel toward the camera
// and across the frame instead of away from it. Elevation and intensity are
// untouched and must stay untouched — they were tuned together and re-reading
// either against the other's old value is meaningless (see below).
//
// MEASURED, on the 24-view panel (six positions x four yaws through the real
// chase camera) run in all four outdoor areas — 96 views, in
// verify-lighting.html after that harness was brought in step with Wave 3.3's
// caster rule, which it had never carried:
//
//                        before (56.3)      after (236.3)
//   views under 2%       39 of 96           21 of 96
//   1st quartile          1.29%              2.39%
//   median                3.23%              5.09%
//   maximum              58.39%             41.41%
//   std deviation        12.38              9.36
//   mean                  8.92%              8.12%
//
// The MEAN GOES DOWN, and that is the result, not a cost. A mean of 10% made
// of a 0% view and a 44% view is a worse image than a uniform 9%: the average
// was never the thing that was broken, the spread was. Every one of the four
// areas moves the same way — minimum up, maximum down, spread down — and the
// per-yaw means flatten in all four (the neighborhood's four yaws go from
// 7.3/11.1/13.0/10.6 to 9.4/7.5/8.0/7.1, the park's to 3.7/3.7/3.4/4.0).
//
// WHY ONE GLOBAL NUMBER RATHER THAN ONE PER AREA. A per-area sun was the
// obvious shape for this — `groundBounce` right below is threaded exactly that
// way — and it was measured before being rejected. Sweeping the bearing in 15
// degree steps through all four areas, the aggregate "views under 2%" curve
// has a single broad plateau at 214-238 degrees with no cliff anywhere in it,
// and each area's own optimum either sits inside that plateau or is flat
// enough not to care: the neighborhood is best over 180-238, the park over
// 232-256, the seaside over 195-225, and the Docks is dense enough to be
// nearly insensitive (1 view under 2% at almost every bearing). Fitting four
// separate numbers recovers 4 more views out of 96 than this one does.
//
// That is not worth a knob, and the reason it is so small is the interesting
// part: THE WIN IS A PROPERTY OF THE CAMERA, NOT OF THE WORLD. What was wrong
// was the sun's angle to the chase camera, and the chase camera is identical
// in every area — so the fix generalises, and the residue that a per-area
// number would chase is just which props happen to stand near which sample
// point today. The plan's premise that each area has its own dominant
// sightline to align to did not survive contact with the areas either: the
// neighborhood is a CROSSROADS (two sightlines at right angles, so there is no
// single axis), the park is deliberately open, the Docks' canal and its
// warehouse row both run east-west, and only the seaside has one shore line —
// and the seaside's own optimum lands inside the global plateau anyway.
//
// Two things that stay true across the move, both checked rather than assumed:
// the shadow-fit basis is exactly as well conditioned as before (its
// conditioning depends only on the angle to world-up, which is unchanged —
// see lightBasis in render/shadowfit.js), and the sun is still never in shot,
// because the chase camera's top of frame is 7.2 degrees above horizontal and
// the sun sits at 19.1. There is no sun disc in the sky gradient either
// (render/sky.js is a function of elevation only), so nothing in the
// background has to move with this.
//
// The plan (docs/VISUAL-PASS.md 1.3) proposed (36, 20, 24) — 25 degrees — as an
// estimate, and y is the one number that came back different from measurement.
// 25 degrees turns out to be almost exactly the angle at which the
// neighbourhood's shadows still fail to reach past the props casting them, so
// the plan's own acceptance gate misses at the plan's own number. Measured in
// verify-lighting.html at its audit camera, the shadow pass moves 1.5% of
// screen pixels at 25 degrees (i.e. no better than the ~1.5% it replaced) and
// 10.3% at 19 — a cliff rather than a slope, because 19 is where the corner
// house's shadow first reaches across the street into frame.
//
// A cliff is a bad thing to tune against, so the choice was made on the
// harness's 24-view panel (six positions x four yaws through the real chase
// camera) instead, where the same sweep is smooth and monotonic: 9.56% at 25
// degrees, 10.42% at 19, flattening after. 19 degrees is where that curve
// stops paying and the single-camera gate is comfortably mid-band rather than
// balanced on its edge. Hence 15 and not 20.
//
// SUN_INTENSITY — RAISED from 2.2, which is the opposite of what the plan
// braced for, and the geometry says why. A grazing sun is brighter on walls
// (cos(19 deg) = 0.95 against the old cos(54 deg) = 0.59) but much DIMMER on
// the ground, which is most of the screen under a camera pitched 28 degrees
// down: sin(19 deg) = 0.33 against the old sin(54 deg) = 0.81, well under half.
// Left at 2.2 the world goes flat-dim and the shadows lose the contrast that is
// the entire point of casting them. 3.0 restores the ground and is still
// nowhere near a blow-out — measured across the audit's views, not one pixel
// reaches 252 in any channel even at 3.4, because ACES rolls the highlights off
// long before they clip. Lit facades do get brighter, and that is the intended
// read: a sunlit wall beside its own shaded return is the form this pass exists
// to put back.
//
// One knock-on worth knowing about before Wave 5.2 re-calibrates the surface
// table: the Docks' 'wetStone' preset is glossy enough that a grazing sun puts
// a real specular sheet on the quay. Measured, it peaks at 248/255 and covers
// 1.5% of that frame — a hot highlight, not a clipped one, and arguably the
// most flattering thing that has ever happened to wet cobbles — but it is the
// first place to look if that table gets re-judged.
//
// Exposure is deliberately NOT the dial used here — the key light was the thing
// that was wrong. renderer.toneMappingExposure is owned by game/composer.js and
// multiplied by Night Eyes; moving it would have dragged the sky, the fog and
// the bloom threshold along with the sun.
//
// Dusk overrides this to 0.7 a few hundred lines down and is unaffected by the
// number here, but the fill below is NOT overridden, so the dusk walk was
// re-checked against the pair rather than assumed.
const SUN_POSITION = [-36, 15, -24];
const SUN_INTENSITY = 3.0;

// The fill. AmbientLight(0xbfd8ff, 0.9) added a constant to every surface
// regardless of its normal — by construction, the thing that removes form
// (VISUAL-PASS.md section 1, "Flat", cause 1). A HemisphereLight costs exactly
// the same (no shadow map, no extra pass, not a draw call) but ramps from sky
// on up-facing normals to ground-bounce on down-facing ones, so every mesh in
// the game gains vertical form for nothing.
//
// HEMI_SKY is the old ambient colour unchanged: it was already a cool daylight
// blue, and it was already the right colour for the up-facing half. What it was
// wrong about was applying to the DOWN-facing half too.
//
// HEMI_INTENSITY is half the old 0.9 because 0.9 was compensation. With a
// near-noon sun and no form in the fill, the fill had to be strong enough to
// keep shadowed sides from going dead — and that is precisely what flattened
// them. With the sun down at 19 degrees the shaded side of a wall reads as
// shaded on its own, so the fill's job shrinks back to "keep it from being
// black".
//
// 0.45 against a 3.0 sun was picked by measurement, holding two things at once:
// the deepest shadow in the audit frame goes from 82/765 of RGB to 154 (nearly
// twice the contrast the old rig could produce), while mean frame luminance
// lands within 3.5% of the pre-change image (208.3 -> 201.1 of 255). That
// second half is what makes the first half honest — a "more contrast" claim you
// get by dimming everything is just an exposure change wearing a lighting
// change's clothes.
const HEMI_SKY = 0xbfd8ff;
const HEMI_INTENSITY = 0.45;
// The bounce colour an area gets if it has not been threaded (see each area's
// `groundBounce`). A desaturated warm grey rather than any one area's palette:
// it is what an un-threaded area's fill degrades TO, so it must not smuggle a
// green cast into a stone courtyard or a sand cast into a lawn.
const DEFAULT_GROUND_BOUNCE = 0x9a9086;

export function createWalkLifecycle({
  MP, pid, coarse, envMap, overlay, blockList,
  renderer, camera, composerRig,
  player, progression, settings, hud, audio, music, log, touchUI, catVoice,
  getCloud, getSession, setSession, getIsTouch, getHomebase,
  getPendingRoom, clearPendingRoom, pushProfileNow,
  awardStrayGreet, applyRemoteEvent, cloudToast,
}) {
  // ------------------------------------------------------------------
  // v18 Task 2.7 — the in-walk skill-unlock celebration.
  //
  // ONE card owner for the whole app: createWalkLifecycle runs once from
  // main.js's init(), so this and the bus subscription below are created
  // once, not per walk.
  // ------------------------------------------------------------------
  const celebration = createUnlockCelebration(document.body);

  // celebrateNewSkills() → the ids celebrated just now.
  //
  // SINGLE-FIRE, and the mechanism is progression.recordSkillUnlocks itself
  // rather than any bookkeeping here: it is the only writer of state.skills,
  // and it returns *what it added*, so the second call with the same ids
  // returns []. That one property gives all three guarantees at once —
  //
  //   * celebrates once: the ability is in state.skills by the time any
  //     later call asks, so it can never be "added" twice;
  //   * persists once: the same call that celebrates is the call that
  //     stores, and save() only runs when something actually changed;
  //   * never celebrates again next walk: state.skills is persisted, and
  //     hasSkill's union means a restored save reports it as already earned.
  //
  // — which is also why endWalk now routes its (previously discarded)
  // recordSkillUnlocks call through here instead of calling it directly.
  // Doing both is safe by construction, and it is what catches the two
  // TWO abilities that CANNOT complete mid-walk, both unlocked by a tally
  // completeWalk itself owns and which does not exist until the walk is over:
  // Night Eyes (duskWalks) and — as of the v19 collider wave — Sea Legs
  // (walks.seaside). Sea Legs was descoped in v18 and reinstated once water
  // became solid, so it is now genuinely the second case this guards, not the
  // hypothetical one the comment used to describe. completeWalk runs BEFORE
  // celebrateNewSkills in endWalk, which is what makes the fifth seaside walk
  // celebrate on the walk that earns it rather than the one after.
  function celebrateNewSkills() {
    const added = progression.recordSkillUnlocks(unlockedSkills(progression.state));
    if (!added.length) return added;
    const session = getSession();
    // The burst is scene FX and needs a live walk; the card and the fanfare
    // do not, so an ability that only completes as the walk ends still gets
    // its moment.
    if (session?.fx) session.fx.burst(session.cat.position, 0xf2c14e, 26);
    audio.unlockFanfare();
    for (const id of added) celebration.show(SKILL_BY_ID.get(id));
    return added;
  }

  // The hook Stage 1 built for this: discoveries.js's pay() bumps the feat
  // tally and THEN emits 'discovery', so a listener here sees the fresh count.
  //
  // The check is deferred to a microtask, which is the difference between
  // catching most unlocks and catching all of them. Several feats are fed by
  // a tally recorded *alongside* the award rather than by the award itself
  // (feats.perch in game/interactions.js, feats.race in main.js,
  // progression.recordGreet for the two social feats), and at those sites the
  // award — and therefore this event — fires first. A microtask runs once the
  // whole synchronous award handler has unwound, by which point every one of
  // those siblings has landed too. It still resolves long before the next
  // frame, so the card is on screen in the same beat as the action.
  //
  // Coalesced: one cascade (Big Swat flattening three bins) emits three
  // discoveries and schedules exactly one check.
  let unlockCheckQueued = false;
  bus.on('discovery', () => {
    if (unlockCheckQueued) return;
    unlockCheckQueued = true;
    queueMicrotask(() => {
      unlockCheckQueued = false;
      celebrateNewSkills();
    });
  });

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
      // v18 Gift Paws: if a stray was tapped at walk start to find one of
      // this player's stashed gifts, a ghost gets it instead — a friend
      // finding your present is the version of this the spec is actually
      // describing, and a stray is only the offline stand-in. The hand-over
      // clears the stray so exactly one holder exists; even if it did not,
      // progression.claimGift is the single gate on the payout.
      const handover = mySession.strayCats.strays.find((s) => s.foundGift)?.foundGift ?? null;
      if (handover) {
        for (const s of mySession.strayCats.strays) s.foundGift = null;
      }
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
        Math.random,
        { gift: handover }
      );
      // Ghosts are the one mover class that arrives asynchronously, so they
      // cannot be registered in the startWalk pass with the cat, the strays
      // and the critters — they do it here, the frame they exist. The rig
      // reserves capacity for them (see MOVER_CAPACITY) and a follow() past
      // that ceiling is a silent no-op, so this cannot fail a walk. The
      // getSession() guard above is what keeps a slow fetch from registering
      // into a rig endWalk has already disposed.
      for (const ghost of mySession.ghosts.list) mySession.decals.follow(ghost.group);
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
    // Read ONCE per walk, here, and passed down from this one place. Every
    // system below that cares (fx, skyLife, weather, and now the water and the
    // wind) wants the same answer, and the two new ones are on the 60Hz path —
    // re-querying a setting per frame is exactly what this snapshot exists to
    // prevent.
    const reducedMotion = settings.get('reducedMotion');
    const tier = resolveQuality({
      coarse,
      reducedMotion,
      override: settings.get('quality'),
    });
    // BEFORE ANY WORLD GEOMETRY EXISTS. render/textures.js builds its tiles
    // lazily at first use and memoises them for the app's lifetime, so the
    // tier that is set when the first textured prop is built is the tier that
    // walk gets and every later walk inherits. Setting it after the build
    // would give the first walk of a session the wrong one, permanently.
    setTextureTier(tier);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatioCap));
    // The shared per-walk stream. In a room walk every client seeds it from
    // the same roomSeed, so co-walkers agree about the world only as long as
    // they take the SAME DRAWS IN THE SAME ORDER. Solo it is Math.random and
    // draw order does not matter at all, which is exactly why an ordering
    // mistake here is invisible until two people walk together.
    //
    // WARNING — do not give this stream a lazy or conditional consumer.
    // Everything below draws from it during startWalk, unconditionally and in
    // a fixed order. One system does draw AFTER the walk has begun: v18's
    // Twitchy Nose lays scent trails through createScent's rng (see
    // scent.js's trailTo, called from game/interactions.js's updateSenses),
    // and it draws only when that skill is unlocked and only when the player
    // moves. That is safe TODAY for one reason and one reason only — the
    // scent module is the sole post-startWalk consumer of walkRng, so its
    // draws can never fall between two other systems' draws and shift them.
    //
    // The moment a second per-walk system draws from walkRng after startWalk
    // returns, a Twitchy Nose player and a co-walker without the skill would
    // pull different values for it and the two worlds would silently
    // diverge. If you need mid-walk randomness, give the new system its own
    // seeded stream (sky life already does this — see the note further down)
    // rather than adding a second lazy consumer here.
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
    // scene.environmentIntensity is set a little further down, by
    // composerRig.applyLighting — it depends on duskActive, which is not
    // resolved until after the dusk block below.
    if (tier.postFx) {
      composerRig.ensure(tier.msaaSamples);
      composerRig.attachScene(scene); // point the composer's RenderPass at this walk's scene
    }
    const sun = new THREE.DirectionalLight(0xfff2d8, SUN_INTENSITY);
    sun.position.set(...SUN_POSITION);
    scene.add(sun);
    // The hemisphere light that replaces the old AmbientLight is added AFTER
    // the world build, a few dozen lines down — it needs the area's own ground
    // colour, which only areaData carries. Nothing between here and there
    // reads the scene's fill light, so the gap is safe; see the comment at the
    // scene.add(hemi) call itself.

    // The sway registry for this walk's foliage. Created BEFORE the build so
    // an area can register its trees and bushes as it plants them; areas that
    // have not been through the surface wave simply never call add(), and an
    // empty rig's update()/dispose() are no-ops. reducedMotion kills the sway
    // outright inside the module — same rule as the body-bob and the
    // particles, and independent of the quality tier.
    const wind = createWind({ reducedMotion });
    // Widened the way den.build(scene, { placed }) already was, rather than
    // inventing a second convention. Both keys default inside each area, so an
    // area that has not been threaded yet still builds from a bare
    // build(scene) — which is what every world test does.
    // The den gets `wind` too, and not as a formality: its build draws a strip
    // of OUTDOORS through the window — two trees, two bushes, a lawn and a
    // fence run at z ~ -18 — and that garden is the one thing in the room a
    // breeze should reach. It gets no `water` because it has none. Passing an
    // extra key is inert until den.js asks for it.
    const areaData = isDen
      ? AREAS.den.build(scene, { placed: progression.state.den.placed, wind })
      : AREAS[areaId].build(scene, { water: { quality: tier, reducedMotion }, wind });
    // The fill light, added here rather than beside the sun because its ground
    // term is the AREA'S OWN dominant ground colour and only areaData knows it:
    // a green bounce under the park's lawn, sand at Seaside, wet grey stone at
    // the Docks, warm floorboards in the den. That is the difference between a
    // hemisphere light and a tinted ambient — the down-facing half of every
    // object picks up the colour of what it is standing on, which is most of
    // why the technique reads as "grounded" rather than just "less flat".
    //
    // `groundBounce` is threaded back the same way `spawn`, `pois`, `colliders`,
    // `bounds` and `waters` already are, and defaulted here so an area that has
    // not been threaded (or a test's bare build(scene)) still lights correctly
    // rather than throwing.
    scene.add(new THREE.HemisphereLight(
      HEMI_SKY,
      areaData.groundBounce ?? DEFAULT_GROUND_BOUNCE,
      HEMI_INTENSITY,
    ));
    // Wave 2.1 — contact shadows. HERE, and nowhere later, because the rig
    // scans scene.children for its static footprints and this is the exact
    // moment the scene contains the area's props and NOTHING ELSE: the cat,
    // the critters, the strays, the toy, the collectibles, the quest object,
    // the rain puddles and the secrets are all added below. Scanning after any
    // of them would stamp a permanent decal on the ground where that object
    // happened to be standing at build time. Movers get live decals instead,
    // registered a few dozen lines down once they exist.
    //
    // No quality-tier knob, deliberately. It is two draw calls on a 407-call
    // budget, and the LOW tier needs it MORE than the high tier does — its
    // shadow map is 1024 against 2048, so its contact shadows are the half as
    // sharp ones. A grounding pass that switches off on the hardware least
    // able to ground things by other means would be exactly backwards.
    const decals = createContactShadows(scene);
    // POIs are authored as "interesting spots" and several sit dead-center
    // on scenery (the park fountain, the parked car) — fine as vibes, but
    // race rings and quest objects placed there are unreachable: player
    // collision stops the cat outside collider.r + 0.35, while the ring
    // cross check needs < 1.2 and quest completion < 2. clearSpot is
    // deterministic, so the shared-seed race course stays identical across
    // devices (it derives from static area data only).
    //
    // `waters` joins that list in v20, now that water blocks: a ring in the
    // pond is exactly as uncrossable as a ring inside the fountain, and race.js
    // checks ONLY the current ring with no skip and no timeout, so either
    // stalls the whole daily race. No shipped POI moves because of it (v19
    // relocated the one that would have) — it is the guard rail, not a fix.
    const walkPois = areaData.pois.map((p) => clearSpot(p, areaData.colliders, areaData.bounds, areaData.waters));

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
    // v18 CF-10b: without this, Long Zoomies did nothing in the running game —
    // player.js shipped the tuning and the state machine, but nothing ever
    // handed the player the save. Set AFTER setAvatar, which resets the charge
    // state (it deliberately leaves the tuning alone, since the ability is
    // permanent). Read once per walk rather than per frame because that is the
    // granularity player.js exposes; a Long Zoomies earned mid-walk therefore
    // takes effect on the next walk, which is the same "next walk" boundary
    // the ability's own feat (finishing the daily race) already sits behind.
    player.setZoomTuning(zoomTuning(progression.state));
    // v20 Sea Legs, wired the same way and for the same reason. 'sea-legs' is
    // not in the skills catalog yet — hasSkill returns false for an unknown
    // id, so every save today is a non-swimmer and water is simply solid — but
    // the call is live rather than a stubbed constant, so the wave that adds
    // the catalog entry activates swimming here with no edit. Read once per
    // walk, the same granularity (and the same "next walk" boundary) as the
    // zoom tuning above.
    player.setSwim(canSwim(progression.state));
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
      // Same gradient helper applySky/weather.js use — see render/sky.js.
      // Dusk keeps its own tighter fog range (30-110 vs the day's 40-130);
      // only the background swap moves onto the shared helper.
      scene.background = skyBackground(top, horizon);
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

    // v18 Night Eyes ('night-eyes', Task 2.3): dusk walks brighten. This has
    // to run AFTER duskActive is resolved above (a solo dusk walk only counts
    // as dusk with the glow collar on) and after the dusk block has finished
    // recolouring the sky, because it is the frame's EXPOSURE that changes,
    // not the scene.
    //
    // Called unconditionally on every walk, skill or no skill:
    // renderer.toneMappingExposure is global renderer state, so a walk that
    // does not want a boost must actively be handed the base value back —
    // otherwise a Night Eyes dusk walk would leave the next daytime walk
    // over-exposed. composerRig.applyLighting therefore also subsumes the
    // `scene.environmentIntensity = tier.envIntensity` assignment that used
    // to sit up beside scene.environment.
    composerRig.applyLighting(scene, {
      dusk: duskActive,
      nightEyes: hasSkill(progression.state, 'night-eyes'),
      envIntensity: tier.envIntensity,
    });

    let weather = { condition: 'clear', rainbowVisible: false, rainbowPos: null, update() {} };
    if (!duskActive && !isDen) {
      weather = createWeather(scene, sun, rollWeather(walkRng), walkRng, reducedMotion);
      if (weather.condition === 'rain') {
        // Extra puddles. These are the only props in the game that EVERY area
        // gets whether it authored them or not, which is why their surface is
        // not decided here: world/builder.js's puddle() now carries the
        // 'water' preset itself (roughness 0.12, no map — materials.js's table
        // names puddles in that preset's own docstring), so an area's authored
        // puddles and these rain ones cannot end up looking like two different
        // materials. Deliberately NOT render/water.js's createWater: that rig
        // is an animated normal map, a depth ramp and a foam band, all of them
        // for a body of water with a shoreline. A 0.8m disc has no shoreline,
        // and three of them per rainy walk would be three more animated
        // materials on the per-frame update list for no visible gain.
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

    // v20 Ruffled Fur (D1): the grudges this save is carrying, handed to the
    // strays at spawn so a cat that took against you on an earlier walk is
    // born cross — cross tag, cross pose, no greet prompt — rather than
    // popping into a grudge a frame later. Keyed on the NAME, which is the
    // only identity a stray has across walks, so it re-attaches to whichever
    // of this walk's 22-of-48 names it matches.
    //
    // Read off the save, never off the wire: hostility is a private per-device
    // relationship fact (D4), so this is the same shape as state.friends and
    // adds no broadcast kind. Two co-walkers may disagree about which cats are
    // cross — accepted, and already true of every friendship fact in the game.
    // It draws nothing from walkRng, so the shared stream is untouched.
    //
    // roomSeed is handed over as well, and is NOT a second walkRng consumer:
    // straycats uses it only to seed one private mulberry32 per cat for that
    // cat's own wander draws, so co-walkers' strays keep wandering in step
    // rather than only spawning in step. It draws nothing from walkRng, and
    // the per-cat streams are order-independent — which is precisely why the
    // wander FSM must not be given walkRng itself (see the warning at the
    // top of startWalk: a per-frame consumer of the shared stream is the
    // worst case of the lazy-consumer bug). Solo, roomSeed is undefined and
    // straycats falls back to a random base, exactly as sky life does below.
    const strayCats = createStrayCats(scene, areaData, isDen ? 0 : (coarse ? 14 : 22), walkRng, {
      grudges: progression.grudgeNames?.() ?? [],
      roomSeed,
    });
    const remotes = createRemoteCats(scene);

    // v18 Task 3.2 Gift Paws — the gifts this player has stashed at scenic
    // spots on earlier walks, rendered where they were left. Read off the
    // save, joined onto THIS area's scenics by gifts.js (a spot id that no
    // longer exists is skipped, never defaulted to the origin). The den has
    // no scenics, so it gets the inert stub.
    const gifts = isDen ? NO_GIFTS : createGifts(scene, areaData.scenics ?? [], progression.giftsIn(areaId));

    if (roomSeed === undefined) {
      for (const stray of strayCats.strays) {
        // CF-7: was a bare Math.random(). Harmless as written — this whole
        // block is already solo-only, where walkRng IS Math.random — but the
        // guard and the roll were two separate facts a future edit could
        // separate, so the roll now names the walk's stream explicitly.
        if (progression.friendLevel(stray.name) === 'best' && walkRng() < 0.3) stray.hasGift = true;
      }
      // ...and at most ONE stashed gift may be found this walk. Solo-only,
      // exactly like the best-friend roll above: the draw is conditional on
      // a list only this client can see, so taking it off a room walk's
      // shared walkRng would desync every downstream draw for the co-walker
      // who has no gifts of their own.
      //
      // The finder is a wandering stray by default and is handed over to a
      // ghost visitor if one turns up (see spawnGhosts) — ghosts arrive
      // asynchronously and may never arrive at all, so assigning the stray
      // first is what keeps the ability from being dead for an offline
      // player. claimGift() is the single point of truth for the payout, so
      // the hand-over can never award twice.
      const found = pickFoundGift(walkRng, gifts.list);
      if (found && strayCats.strays.length) {
        const finder = strayCats.strays[Math.floor(walkRng() * strayCats.strays.length)];
        if (finder) finder.foundGift = found;
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
    // v18 CF-1: without this getter Big Swat never activated in the running
    // game — tippables.js accepted opts.getState from the day it shipped, but
    // this call still passed two arguments, so hasSkill saw a null save and
    // every path stayed on its pre-v18 behaviour.
    //
    // A live GETTER, not a snapshot of progression.state: the walk session is
    // built before the ability is ever queried, and hasSkill reads the feat
    // tally off the save, so a player who crosses 40 tip-overs mid-walk gets
    // Big Swat on the very next swat instead of after a reload.
    const tippables = createTippables(scene, areaData.tippables ?? [], {
      getState: () => progression.state,
    });
    const scent = createScent(scene, areaData, walkRng);

    // Live contact decals for everything that moves, registered now that the
    // movers exist. The cat first and by name: it is on screen 100% of the
    // time and VISUAL-PASS.md's Wave 6 note says out loud that a lot of what
    // reads as "flat cat" today is really "cat with no shadow contact". Its
    // decal is the single most valuable instance in this whole rig.
    //
    // No radius is passed for any of them — the rig measures each object's own
    // footprint once, here, and then only ever moves it. Strays and critters
    // are fixed lists for the life of the walk (both modules spawn everything
    // up front), so one registration pass covers them; ghosts arrive from an
    // async cloud fetch and register themselves in spawnGhosts.
    //
    // Remote co-walkers are deliberately NOT registered: remotecats.js builds
    // and drops cats as presence changes, so they would need a subscribe/
    // unsubscribe channel the rig does not have, and they are the one mover
    // class that only exists in a room walk. A later wave can add them.
    decals.follow(cat);
    for (const stray of strayCats.strays) decals.follow(stray.group);
    for (const critter of critters.list) decals.follow(critter.group);

    // The shadow camera used to be nailed to the world origin at +/-70 so it
    // could cover the whole 110m area at once, which bought 6.8cm texels on the
    // high tier and 13.7cm on the low — too coarse for anything smaller than a
    // parked car, the cat included. createShadowFit follows the view instead
    // and tightens to tier.shadowFitRadius, and does the texel snapping that
    // makes a moving shadow camera viable at all. It owns mapSize, the frustum,
    // normalBias and sun.position from here on; see render/shadowfit.js.
    const shadows = createShadowFit(sun, camera, {
      radius: tier.shadowFitRadius,
      mapSize: tier.shadowMapSize,
    });
    // Constant depth bias, and smaller than the -0.0004 it replaces. Bias is
    // applied in normalised depth and shadowfit.js deliberately keeps the same
    // 1..160 near/far span the fixed camera had, so this number means the same
    // world-space offset it always did — 0.0004 * 159 = 6.4cm. That was sized
    // against 6.8cm texels; against the new 2.0cm ones it is three whole texels
    // of slide, which is exactly the peter-panning that would keep the cat from
    // visibly touching the ground after all this work. Acne is what the bias is
    // guarding against and acne scales with texel size, so shrinking the texels
    // by 3.4x is licence to shrink this too: 0.00015 * 159 = 2.4cm, about one
    // texel, verified acne-free on both tiers in verify-lighting.html.
    // (normalBias is set inside the rig, where it can be derived from the texel
    // size directly.)
    sun.shadow.bias = -0.00015;
    // Wave 3.3 (docs/VISUAL-PASS.md): every mesh casting is why 415 meshes cost
    // 553 draw calls — each caster is a second draw, into the shadow map, on
    // top of the one it already gets in the main pass. RECEIVING stays
    // unconditional (a mesh with no shadow of its own can still sit under
    // someone else's, and receiving costs nothing extra in the shadow pass —
    // only casters do); this sweep only trims CASTING.
    //
    // The opt-out has to be inferred from scene content, not authored in
    // world/*.js (another agent owns those files this pass), so it runs off
    // two independent, purely geometric reads:
    //
    // GRANULARITY: per TOP-LEVEL scene child (exactly contactshadows.js's
    // scanFootprints granularity), not per individual mesh. The cat is ~30
    // meshes — ears, whiskers, a torus tail — several of them a few
    // centimetres across; judged mesh-by-mesh, the cat would lose most of its
    // own shadow. Judged as the one group the builders actually author (a
    // house, a tree, a bollard, the whole cat), the composite reads as what it
    // visually is. MEASURED (measure-tmp.mjs against the live builders):
    // tabby cat 0.56 x 0.85 x 1.67 (nose-to-tail, tail out, easily the widest
    // axis), bollard 0.62 x 0.73 x 0.59, barrel 0.57 x 0.75 x 0.60, lamp post
    // ~0.44 wide by ~3.52 tall, mailbox ~0.5 wide by ~1.23 tall.
    //
    // THE RULE, not contactshadows.qualifies() — the docstring above the
    // opt-out flag warns against reusing that predicate, and the numbers show
    // why: a tree and a bollard both qualify for a decal, but only the tree
    // should still cast, and a lamp post is TALLER than a mailbox despite
    // being much thinner than it end-on. So height and footprint span are
    // checked independently rather than folded into one "size" number:
    //
    //   - CAST_FLAT_HEIGHT: shorter than this and the object has no vertical
    //     face to catch the sun on — the ground plane, paths, sidewalks,
    //     puddles, water, leaf litter, den rugs. All of these are ~0.05 or
    //     under; 0.12 is comfortably above the tallest of them and below
    //     every standing prop measured.
    //   - CAST_TALL_HEIGHT: tall enough to throw a real shadow regardless of
    //     how thin it is — a lamp post (3.52) or a villager (1.46) draws a
    //     long raking line at this sun's 19 degrees even though neither is
    //     wide. Set to 1.3, just above the mailbox's 1.23 (a small roadside
    //     prop, meant to fall on the "too small" side) and comfortably below
    //     the next thing up.
    //
    //     RE-JUDGED after the sun's azimuth moved (see SUN_POSITION), because
    //     the whole reason to re-open it was that a better azimuth ought to
    //     make small-prop shadows more visible and therefore more worth
    //     paying for. MEASURED, IT DID THE OPPOSITE.
    //
    //     First, what the constant actually decides. Enumerated across all
    //     four outdoor areas, the props that fail this test but clear
    //     CAST_FLAT_HEIGHT are: eight neighborhood mailboxes at 1.23m, one
    //     Docks prop at 1.25m — and then NOTHING until 0.93m. The threshold is
    //     not balanced on a slope, it is parked in a 30cm-wide empty band, so
    //     any value in [1.26, 1.30] is the same rule and the only question it
    //     answers is "do the mailboxes cast". The park and the seaside have
    //     nothing in the band at all: moving it is a no-op in two of the five
    //     areas.
    //
    //     Second, the trade, measured at 1.2 against 1.3 on the 24-view panel
    //     with the decals present, in the neighborhood where the mailboxes
    //     are:
    //
    //                                    old azimuth   new azimuth
    //       pixels moved, standing        0.442%        0.197%
    //         beside the mailboxes
    //       deepest single-pixel delta     182/765       98/765
    //       pixels moved, ordinary panel   --            0.024%
    //       extra draw calls               +7.9          +7.9  (+2.6%)
    //
    //     Restoring mailbox casting is worth LESS than half what it was worth
    //     before the sun moved, and the reason is that the frame it lands in
    //     changed: at the new azimuth the lamp posts, trees and house gables
    //     are already raking long shadows across the same ground, so a
    //     mailbox's 3.5m line now mostly falls inside one of them. In the
    //     strongest of the 24 views the two frames are indistinguishable by
    //     eye. Meanwhile the cost is unchanged and is paid in the shadow pass,
    //     on the low tier as much as the high one.
    //
    //     So it stays at 1.3, and the trade is stated plainly: eight mailboxes
    //     and one Docks bollard-sized prop keep a symmetric contact blob
    //     instead of a raking line, and the frame keeps ~8 draw calls. That is
    //     Wave 2.1's bargain working exactly as designed — the decal is what
    //     makes the trim affordable, and it is doing its job here.
    //   - CAST_WIDE_SPAN: wide enough to throw a real shadow regardless of
    //     height — a car, a bench, a market stall, a fence run, and (this is
    //     the one that matters most) the cat itself, whose 1.67m nose-to-tail
    //     span clears it easily even though its 0.85m height does not clear
    //     CAST_TALL_HEIGHT. Strays and ghosts are the same buildCat geometry
    //     (0.85x scale for strays) so they clear it the same way, with no
    //     special-casing needed. Set to 1.0, above the bollard/barrel's ~0.6
    //     and below the cat's 1.67.
    //
    //   A child is eligible if it clears CAST_FLAT_HEIGHT AND (clears
    //   CAST_TALL_HEIGHT OR clears CAST_WIDE_SPAN). A bollard and a barrel
    //   clear neither extra test and stop casting — the contact decal under
    //   them (render/contactshadows.js) is already carrying their grounding.
    //   Small critters (birds, mice, butterflies) and small static dressing
    //   (flowerbeds' individual stems, den knick-knacks) fail the same way.
    //
    // TRANSPARENCY is checked separately, per MESH rather than per group,
    // because it is a leaf property that varies within one group — a car's
    // glass cabin is opaque (materials.js's 'glass' preset is glossy, not
    // see-through) but a fountain's water is not, and a rainy-day rainbow arc
    // (weather.js, MeshBasicMaterial transparent) is exactly the kind of
    // large-but-see-through mesh that would otherwise slip past the span test
    // and paint a shadow of a rainbow. three's shadow map has no idea about
    // alpha, so a transparent mesh casts its full opaque silhouette — always
    // wrong for glass, water and glow, which is why the traversal used to
    // catch these (they cost a draw and taught nothing).
    const CAST_FLAT_HEIGHT = 0.12;
    const CAST_TALL_HEIGHT = 1.3;
    const CAST_WIDE_SPAN = 1.0;
    const isTransparentMat = (material) => (Array.isArray(material)
      ? material.some(isTransparentMat)
      : !!material?.transparent);
    const casterBox = new THREE.Box3();
    for (const child of scene.children) {
      casterBox.setFromObject(child);
      let eligible = false;
      if (!casterBox.isEmpty()) {
        const height = casterBox.max.y - casterBox.min.y;
        const span = Math.max(
          casterBox.max.x - casterBox.min.x,
          casterBox.max.z - casterBox.min.z,
        );
        eligible = height >= CAST_FLAT_HEIGHT
          && (height >= CAST_TALL_HEIGHT || span >= CAST_WIDE_SPAN);
      }
      child.traverse((obj) => {
        // userData.contactDecal is render/contactshadows.js's two
        // InstancedMeshes opting out. They are already shadows: casting from
        // them would draw a hard black quad into the shadow map under every
        // prop, and receiving would band them with the very shadows they
        // exist to reinforce. The module sets castShadow/receiveShadow false
        // itself; without the opt-out here this sweep would overwrite it
        // moments later.
        if (obj.isMesh && !obj.userData.contactDecal) {
          obj.receiveShadow = true;
          obj.castShadow = eligible && !isTransparentMat(obj.material);
        }
      });
    }

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
      reducedMotion,
      zoomTrailAccum: 0,
      wasZooming: false,
      goals,
      startPoints: state.points,
      discoveryCount: 0,
      catsGreeted: 0,
      rankTitle: rankFor(state.lifetimePoints).title,
      weather,
      fx: createFx(scene, { reducedMotion }),
      // The area's water surfaces, bundled into the one { update, dispose }
      // shape the session already uses. Safe on an area with no water at all
      // (the neighborhood, the den), which is why the render loop and endWalk
      // can each call it unconditionally.
      water: waterRig(areaData.waterFx),
      // Built above, before the world, so the area could register into it.
      wind,
      // The sun's view-following shadow camera, in the same shape. Built above
      // (it has to be, so the very first frame of the walk is already fitted
      // rather than centred on the world origin) and re-fitted once per frame
      // from the render loop, AFTER player.update has moved the camera — the
      // rig reads the camera, so a stale camera would fit the shadow box to
      // where the player was last frame.
      shadows,
      // Wave 2.1's contact decals, same shape again. Built well above (before
      // anything that moves entered the scene — see the comment at the
      // createContactShadows call) and updated once per frame from the render
      // loop, after everything that owns a decal has moved.
      decals,
      // dedicated rng stream (never walkRng): sky life must not perturb the
      // shared determinism stream that co-walk clients rely on staying in
      // sync — see Global Constraints. Seeding off roomSeed (when present)
      // keeps co-walk clients' clouds identical without touching walkRng.
      // Indoor den: no sky to animate — a no-op stub keeps the render loop's
      // unconditional session.skyLife.update()/dispose() calls safe.
      skyLife: isDen ? { update() {}, dispose() {} } : createSkyLife(scene, {
        rng: mulberry32(((roomSeed ?? (Math.random() * 2 ** 31)) >>> 0) ^ 0x5eaf00d),
        reducedMotion,
      }),
      secrets,
      tippables,
      gifts,
      // v20 Ruffled Fur — the enemy system's per-walk, in-memory scratch
      // state: which cross cats have already had their one swat (and the
      // three-per-walk ceiling), and which have been forgiven this walk. A
      // factory per walk, for the same reason goals and the discovery log are
      // — two sessions must never share one, and a walk that ends simply
      // drops it. Nothing here is persisted; both facts are true only for the
      // walk in progress. game/interactions.js reads it as s.enemies, and
      // optional-calls it so a stand-in session in a test simply never
      // scuffles rather than crashing.
      enemies: createEnemyWalkLog(),
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
      : NO_GOLD_MICE;

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
    // than the next one.
    //
    // v18 Task 2.7: the return value is no longer discarded. This is the same
    // recordSkillUnlocks(unlockedSkills(state)) call it always was, now routed
    // through celebrateNewSkills so anything that completed here — Night Eyes
    // can ONLY complete here, since its duskWalks tally is completeWalk's —
    // gets the card and the fanfare rather than being stored
    // in silence. Placed before the teardown below, while session.fx and
    // session.cat are still live, so the burst has somewhere to land.
    //
    // It cannot double-fire against a mid-walk celebration: an ability
    // already celebrated is already in state.skills, so recordSkillUnlocks
    // returns [] for it here.
    celebrateNewSkills();
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

    // v18 Night Eyes: hand the renderer its calibrated base exposure back.
    // startWalk sets it every walk anyway, so this is belt-and-braces against
    // anything that renders between walks inheriting a dusk boost.
    composerRig.resetLighting();
    session.fx.dispose();
    session.skyLife.dispose();
    // Water frees the normal and roughness maps the traversal below cannot
    // reach (it only looks at `m.map`); wind puts every swayed object back on
    // the rotation — and under the parent — it had before it was registered.
    // Both are idempotent, and the water material would free its own textures
    // off the traversal's dispose() anyway; wiring them explicitly means
    // neither depends on a subtlety of that sweep.
    session.water.dispose();
    session.wind.dispose();
    // A no-op today (the rig holds no GPU resource of its own — the shadow map
    // belongs to the light and goes with the scene), called anyway so the rig
    // is torn down through the same door as every other session rig rather
    // than being the one exception someone has to remember.
    session.shadows.dispose();
    // Unlike the shadow-fit rig, this one DOES own GPU resources — two
    // InstancedMeshes' geometry, materials and instance-matrix buffers — so
    // this call is load-bearing rather than ceremonial. It runs BEFORE the
    // traversal below because it removes both meshes from the scene, which is
    // what keeps the traversal from disposing them a second time. The shared
    // gradient texture is deliberately kept (app-lifetime, memoised).
    session.decals.dispose();
    session.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
          // Material.dispose() doesn't cascade to textures, so per-walk maps
          // (nametags, the billboard canvas, a water ramp) are freed here.
          // The surface tiles from render/textures.js are NOT: they are
          // memoised for the app's lifetime and shared by every walk after
          // this one, and that module's header is explicit that this
          // traversal must leave them alone. They are named 'surface:<name>'
          // by the painter, and THREE.Texture.copy carries that name onto the
          // per-density clones, so the one check covers both.
          if (m.map && !m.map.name?.startsWith('surface:')) m.map.dispose();
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
    session.gifts.dispose();
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
