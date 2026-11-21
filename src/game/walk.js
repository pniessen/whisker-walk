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
// Every place is its own download (F6): world/areas.js lists them,
// game/areaload.js fetches and keeps them, and startWalk builds from the
// loaded pack. No area module is imported here.
import { createAreaLoader } from './areaload.js';
import { roofsOn } from '../roofsflag.js';
import { houseOn } from '../houseflag.js';
import { isIndoor } from '../indoor.js';
import { birthdayDue, BDAY_AREA, BDAY_START, BRIDGE_ISLAND_END, speakerFor, birthdayCatName, noteCandlesBlown, bdayCountsWalk, saveBirthdayPhoto, BDAY_PHOTO_KEY } from '../birthday.js';
import { hideToastFor } from './labels.js';
import { clearSpot } from '../world/spots.js';
import { puddle as puddleProp, onAnyDeck } from '../world/builder.js';
import { applyDusk, duskEnv, addCollarGlow, tintDuskLawn, createLampPools } from '../render/dusk.js';
import { buildCat, CAT_LOOK_Y, catDims, coatColor } from '../cat/model.js';
import { setCatScars } from '../cat/scarmesh.js';
import { disposeHenRig } from '../cat/henfight.js';
import { setCatRimLight } from '../cat/rimlight.js';
import { activeCat, scarKey } from '../customcats.js';
import { herCatPortrait } from '../thumbnails.js';
import { summaryCheer, summaryStatsHtml, bestWalkConfetti, countUp, prefersReducedMotion, settingsSwitchHtml } from '../ui/screencards.js';
import { PAW } from '../ui/pawicon.js';
import { attachOwnTag } from './owntag.js';
import { PERSONALITIES } from '../cat/brain.js';
import { cameraOffset } from '../catcam.js';
import { createCritters, goatForDay } from '../critters.js';
import { createStrayCats, strayStream } from '../straycats.js';
import { createClanCats } from '../clancats.js';
import { castFor, CLAN_COLOURS, clanCountFor, clanHomeFor, lonersFor, roamHomes, borderWarriorFor } from '../clancast.js';
import { campLayout, campDiscs } from '../world/camplayout.js';
import { clanWalkableFor } from '../world/clanground.js';
import { DISCS, isTrespassing } from '../rivalclans.js';
import { createRemoteCats } from '../remotecats.js';
import { takeHeldItemsWithRemotes } from './netevents.js';
import { rollGhosts, createGhosts } from '../ghosts.js';
import { createGifts, pickFoundGift, NO_GIFTS } from '../gifts.js';
import { createTippables } from '../tippables.js';
import { createCarryables } from '../carryables.js';
import { createKnockables } from '../knockables.js';
import { createPushThroughs } from '../pushthrough.js';
import { createRests } from '../rests.js';
import { createPlayerMarks } from '../render/playermarks.js';
import { borderMarkId } from '../marks.js';
import { createMarkContest } from '../markcontest.js';
import { createMouth, walkEndMarks, carryLabel } from '../carry.js';
import { propsFor, yarnSpotFor } from '../propsets.js';
import { createScent } from '../scent.js';
import { createToy, buildYarnBall } from '../toy.js';
import { createQuest } from '../quests.js';
import { QUEST_TRAIL_COLOR } from '../questscent.js';
import { createGoals, GOAL_POOL } from '../goals.js';
import { line as tutorialLine } from '../tutorialwords.js';
import { rankFor, CATALOG } from '../progression.js';
import { catsInArea, colonyWear, denResidents, denMoment } from '../colony.js';
import { createDenCats } from '../dencats.js';
import { placedKits } from '../clanroles.js';
import { strayBreed } from '../straynames.js';
import { legendaryFor, legendaryRoll } from '../legendary.js';
import { collarFor, walkWanderer, territoryCastExcludes, wanderStart, wanderSpotFor, wanderArrivalLine, wanderStrayCount } from '../housecats.js';
import { rosterIsPartnerOnly } from './lobby.js';
import { zoomTuning, canSwim, isWalkableAt } from '../player.js';
import { clampZoomStep, maxZoomStep, zoomView } from '../camzoom.js';
import { createRivalPatrol, chaseAllowed } from '../rivalcats.js';
import { createYardDog } from '../yarddog.js';
import { NO_FARM } from '../farmnone.js';
import { handleFarmEvent, addFarmHat, restoreFarmJobs } from './farmplay.js';
import { NO_FAIR } from '../fairnone.js';
import { handleFairEvent, addBalloonRibbon, restoreFairGames } from './fairplay.js';
import { createTraversalLive, NO_TRAVERSAL, traversalEventEffects } from '../traversallive.js';
import { moveAbilities } from '../traversal.js';
import { groundOf } from '../ground.js';
import { isFearless } from '../dogs.js';
import { createBorderMarks } from '../render/bordermarks.js';
import { addBorderDressing } from '../world/borderpost.js';
import { addGatewayDressing, NO_GATES } from '../world/gateway.js';
import { liveEndsFor, endById } from '../gateways.js';
import { postsFor, postById, postArrival } from '../borderposts.js';
import { createFx } from '../fx.js';
import { createSkyLife } from '../skylife.js';
import { rollWeather, createWeather, rainPuddleSpots } from '../weather.js';
import { rollSecrets, createSecrets } from '../secrets.js';
import { GOLD_MICE, createGoldMice } from '../goldmice.js';
import { planFind, pickFindItem, findsAgreed, roomFindRoster } from '../foundwear/rules.js';
import { createFind, NO_FIND } from '../foundwear/live.js';
import { restoreFind } from '../foundwear/play.js';
import { foundWearIn } from '../foundwear/index.js';
import { crossingOutcome } from '../bordercross.js';
import { pickOnCrossing, gateStatus, viaPlan, walkOnMove, GATE_MOMENT_MS, gateMomentHtml, nextRoomSeed, stateIsHere } from '../gatecross.js';
import { rivalForWalk, placeName, effectiveArea, isClanEdition } from '../edition.js';
import { picksOf, homeWelcome } from '../clanhomes.js';
import { phrase } from '../clanphrases.js';
import { newWalkSeed, newClearSeed, restoreGoals, restoreTallies, resumeWelcome } from './walkresume.js';
import { lessonFor, buildFirstLesson, placeCampGuide, headingToward, lessonOpen } from './guidewalk.js';
import { findPath } from '../pathfind.js';
import { createEnemyWalkLog } from '../enemies.js';
import { kittenPlan, createKittenEncounter } from '../kitten.js';
import { raceCourse, createRace } from '../race.js';
import { buildMapLayer, createMinimap } from '../ui/minimap.js';
import { createChatBubbles } from '../chatbubble.js';
import { createChatWheel } from '../ui/chatwheel.js';
import { phraseById, createChatRateLimiter, shouldShowIncomingChat } from '../chat.js';
import { replyFor, countsAsGreet } from '../catreplies.js';
import { litMaterial } from '../render/materials.js';
import { setTextureTier } from '../render/textures.js';
import { waterRig, eveningWater } from '../render/water.js';
import { createWind } from '../render/wind.js';
import { createSun, createFill, SUN_BIAS, assignShadowCasters, assignShadowCastersFor, trimShadowCasters } from '../render/rig.js';
import { createIntruders, isHostile, NO_INTRUDERS, INTRUDER_DECAL_RADIUS } from '../intruders.js';
import { createClanFight, NO_CLAN_FIGHT } from './clanfight.js';
import { createBorderFight } from './borderfight.js';
import { createAwayFoes, createAwayFight, joinFights } from './awayfight.js';
import { awayAllowed, createAwayLedger } from '../awayfights.js';
import { createFightRecord } from './fightrecord.js';
import { unlockToast } from '../fightmoves.js';
import { createFightCam, findOccluders } from '../fightcam.js';
import { createTreeFade, findFadeOccluders } from '../treefade.js';
import { createRustle } from '../render/rustle.js';
import { createFightUi } from '../ui/fightui.js';
import { createShadowFit, createNoShadows } from '../render/shadowfit.js';
import { createContactShadows } from '../render/contactshadows.js';
import { mergeStaticProps } from '../render/mergeprops.js';
import { createStripTiles } from '../render/striptiles.js';
import { createGrass, groundFinds } from '../render/grass.js';
import { createPawPrints } from '../render/pawprints.js';
import { createPartyBalloons } from '../render/partyballoons.js';
import { birthdayPartyOn } from '../ui/party.js';
import { createSplash } from '../render/splash.js';
import { createClouds } from '../render/clouds.js';
import { createAmbient } from '../render/ambient.js';
import { createWaterDressing } from '../render/waterdress.js';
import { createFishJumps } from '../render/fishjump.js';
import { note, noteMemory } from '../diagnostics.js';
// Grass keep-out radii (plus grass.js's own 0.15 collider margin): a doormat
// is 0.8 x 0.5m (half-diagonal 0.47), so 0.6 + 0.15 clears it; a carryable is a
// 6-10cm toy, so 0.3 leaves it a small bare patch to sit on.
const GRASS_REST_CLEAR = 0.6;
const GRASS_ITEM_CLEAR = 0.3;
// Fish, golden mice and scenic spots sit on the ground and are what the kids
// hunt for; Seaside's dune grass reaches 0.3m, so each keeps a bare patch.
const GRASS_FIND_CLEAR = 0.5;
import { mulberry32, seedFromCode } from '../rng.js';

// Review S2 (2026-11-19): the moving systems' own streams. Each is seeded from
// the walk's seed (roomSeed, or the solo walk's soloSeed) XOR its own salt, and
// none is walkRng: these systems draw lazily and per device (a phase for every
// critter that spawns, a wander roll whenever a ghost's timer runs out, a push
// whenever the ball is batted), the exact kind of consumer walkRng's warning
// in startWalk forbids. They used to be bare Math.random(). Nothing they shape
// rides the wire or has to agree between co-walkers: a room walk's partners
// now start their critters on the same phases where they spawn in the same
// order, and otherwise differ as they always did. Ghosts and gold mice are
// personal; the ball is this device's own.
const CRITTER_MOTION_SALT = 0xc417e125;
const GOLD_PHASE_SALT = 0x901d3c3e;
const TOY_BAT_SALT = 0x7a4ba775;
const GHOST_WANDER_SALT = 0x6405757a;
const ownStream = (seed, salt) => mulberry32(((seed >>> 0) ^ salt) >>> 0);
import { SKILLS, hasSkill, unlockedSkills } from '../skills.js';
import { bus } from '../events.js';
import { createUnlockCelebration } from './celebrate.js';
import { nowSec, escapeHtml, hashName } from './util.js';
import { metOnly, deviceMetPlayers } from '../metplayers.js';
import { createSession } from './session.js';
import { walkDusk } from './session.js'; // its own line: test/session.test.js pins the one above

// The recipe for a new area (builder, AREA_LOADERS line, catalog row) is in src/world/areas.js.
// A walk builds from its place's pack (areas.loaded(id): { id, world, life }),
// which startWalkWhenReady fetches first. The Rooftops (`roofs`) is a pack like
// any other, with its own row in CATALOG.areas (Rooftops step 4).
//
// startWalkWhenReady's two numbers (F6): how long a wait goes before the
// Explore button says "Getting ready…" (a quicker load never shows it), and
// how many failed loads, online, before the next Explore starts the
// page again fresh (a deploy that swapped the files underneath).
export const GETTING_READY_DELAY_MS = 150;
export const RELOAD_AFTER_FAILURES = 1;
// default session.ghosts before (or absent) an async spawn resolves — lets
// the render loop/updateInteractions/endWalk call the ghosts API
// unconditionally instead of null-checking it everywhere.
const NO_GHOSTS = { list: [], nearest: () => null, update() {}, dispose() {} };
// Same idea for the den's tamed cats (v21 Stream 2): off the den walk the
// render loop, the prompt scan and endWalk still call them unconditionally.
const NO_DEN_CATS = { list: [], littles: [], nearest: () => null, pet() {}, update() {}, dispose() {} };
// Clan Life Part 1: an area with no camp (the old areas, the den, the island)
// has no clan; the render loop, the prompt scan and endWalk call it anyway.
const NO_CLAN_CATS = { list: [], nearest: () => null, greet() {}, boop() {}, update() {}, dispose() {} };
// Same idea for an area with no golden mice (the den today, a future area
// before its three are placed): every goldMice method the walk calls, inert.
// nearestUnfound is here because v18's Whisker Sense asks for it every frame.
const NO_GOLD_MICE = {
  list: [], update() {}, checkFind: () => null, nearestUnfound: () => null,
  remove() {}, dispose() {},
};
// The den has no rival border: every call the render loop makes is inert, and
// there is no patrol to scent over a mark and no decal to scent over (Task 12).
const NO_RIVAL = { update() {}, dispose() {}, patrolPos: () => null, borderMarks: null };
// An area's own per-walk life (areaData.life, the Gorge's shade, birds and
// ambience mix); every area without one gets this, so nothing changes there.
const NO_AREA_LIFE = { update() {}, dispose() {} };
const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

// The key light, the fill, the shadow bias and the shadow-caster rule are one
// calibrated rig, shared with the verify harnesses: see render/rig.js.

// The pause / Ready? card, rebuilt on demand (the crossing card puts it back).
// It sits on a panel like the home screen's, her cat on top when there is a
// portrait (session.portrait; none without WebGL). The buttons hold plain
// text only: main.js routes overlay clicks by e.target.id and rewrites
// #btn-resume's text on the first touch.
//
// One card, three moments (`mode`), so the card says what state the walk is in:
//   'ready'   before the walk has begun: "Ready?" (desktop always, where the
//             first click is what takes the mouse; touch starts walking at once)
//   'back'    a walk picked up again, before it goes on: "Welcome back!"
//   'paused'  any time after the walk has begun: "Paused"
const CARD_TITLE = { ready: 'Ready?', back: 'Welcome back!', paused: 'Paused' };
export function resumeLabel(mode, touch) {
  if (mode === 'ready') return touch ? 'Tap to explore' : 'Start exploring (click)';
  return touch ? 'Keep exploring' : 'Keep exploring (click)';
}
// Which moment a session is in. `started` is set by main.js on the first
// engage; `resumed` by startWalk for a walk picked up again.
export function cardMode(s) {
  return s?.started ? 'paused' : s?.resumed ? 'back' : 'ready';
}
// The card for a session as it stands. Once the walk has begun the welcome
// line has been read (or toasted) and is left off.
// A lesson on the walk (game/guidewalk.js) adds two things: while it can
// still be skipped, a third, quiet button, "Skip the lesson"; and on the
// guided first walk's Ready? card (a keyboard, before the walk has begun) one
// line of controls in place of the list, which the pause card keeps.
// `sound` ({ sound, music }: each on or off, from settings; pauseSoundOf
// below) adds the Sound and Music switches under the resume button, so a
// child on a touch screen can turn the sound down without ending the walk.
// Not on the Ready? card: nothing has been heard yet.
// With them (controls review, 2026-11-19) the camera's four View steps, as
// chips: the + and − buttons left the walk screen (pinch and the wheel stay),
// and this is where the view is picked now. The den stops at Middle
// (camzoom.js), so Far and Farther are greyed there. In a walk together the
// key list adds the chat keys.
// `note`: one line why she is back on the card (a walk-on that could not
// go). A toast would sit under the card, so the card carries it; it is drawn
// only when passed, so the next time the card is drawn it is gone.
export function pauseCardFor(s, touch, sound = null, note = null) {
  const mode = cardMode(s);
  const L = s.lesson;
  const max = maxZoomStep(s.areaId === 'den');
  const view = sound && Number.isInteger(sound.zoom) ? { step: clampZoomStep(sound.zoom, max), max } : null;
  return pauseCardHtml({
    welcome: mode === 'paused' ? null : s.welcome, touch, portrait: s.portrait, mode,
    skip: !!L && !L.finished && !L.skipped,
    oneLine: mode === 'ready' && !touch && L?.kind === 'first' && !L.skipped,
    sound, view, room: !!s.net, note,
  });
}
// The switches' state from settings: Sound is "Mute all sound" turned round,
// Music is on while the music volume is above 0; `zoom` is the camera's step.
// null (no switches) without a settings store.
export function pauseSoundOf(settings) {
  if (typeof settings?.get !== 'function') return null;
  return { sound: !settings.get('muted'), music: settings.get('musicVolume') > 0, zoom: settings.get('cameraZoom') };
}
export const PAUSE_SOUND_ID = 'pause-sound';
export const PAUSE_MUSIC_ID = 'pause-music';
// The View chips: one button a step, close to far (camzoom.js ZOOM_STEPS).
export const VIEW_WORDS = Object.freeze(['Close', 'Middle', 'Far', 'Farther']);
export const PAUSE_VIEW_CLASS = 'pause-view-chip';
function pauseSoundHtml(sound, view) {
  return `
      <div class="pause-sound">${settingsSwitchHtml(PAUSE_SOUND_ID, !!sound.sound, '🔊 Sound')}${settingsSwitchHtml(PAUSE_MUSIC_ID, !!sound.music, '🎵 Music')}</div>${view ? pauseViewHtml(view) : ''}`;
}
function pauseViewHtml({ step, max }) {
  const chips = VIEW_WORDS.map((w, i) => `<button type="button" class="${PAUSE_VIEW_CLASS}" data-view-step="${i}" aria-pressed="${i === step}"${i > max ? ' disabled' : ''}>${w}</button>`).join('');
  return `
      <div class="pause-view" role="group" aria-label="View"><span class="pause-view-label">👀 View</span><div class="pause-view-chips">${chips}</div></div>`;
}
export function pauseCardHtml({ welcome, touch, portrait = null, mode = 'ready', skip = false, oneLine = false, sound = null, view = null, room = false, note = null }) {
  return `<div class="pause-card"><div class="screen-panel">
    ${portrait ? `<img class="screen-cat" src="${escapeHtml(portrait)}" alt="">` : ''}
    <div class="screen-body"><h1>${CARD_TITLE[mode] ?? CARD_TITLE.ready}</h1>
    ${welcome ? `<p class="home-welcome">${escapeHtml(welcome)}</p>` : ''}${note ? `
    <p class="pause-note" role="status">${escapeHtml(note)}</p>` : ''}
    <div class="screen-actions">
      <button id="btn-resume" class="primary">${resumeLabel(mode, touch)}</button>${sound && mode !== 'ready' ? pauseSoundHtml(sound, view) : ''}
      <button id="btn-end" class="secondary">Head home</button>${skip ? `
      <button id="${SKIP_LESSON_ID}" class="quiet">${escapeHtml(tutorialLine('guide.skip'))}</button>` : ''}
    </div>
    <p class="controls-hint">${hintHtml(oneLine ? [tutorialLine('ready.keys')] : touch ? TOUCH_HINT : room ? [...KEYS_HINT, ...ROOM_KEYS_HINT] : KEYS_HINT)}</p></div></div></div>`;
}
export const SKIP_LESSON_ID = 'btn-skip-lesson';

// A touch walk starts without the Ready? card, so its first few walks say
// how to move in one toast (takeStartLines, given by main.js on the engage).
export const TOUCH_HINT_WALKS = 3;
// The words are in tutorialwords.js. They never say left or right: the move
// side swaps in left-handed mode (guided-first-walk design, 2026-11-15).
export const TOUCH_START_HINT = tutorialLine('start.touch', { touch: true });
export function takeStartLines(session) {
  const lines = Array.isArray(session?.startLines) ? session.startLines : [];
  if (session) session.startLines = null;
  return lines;
}

// The controls hint, one unbreakable piece per control: a line wraps only
// between the dots, never inside "E interact/sniff".
// The full key list (controls review, 2026-11-19); the walk's own strip
// (hud.js KEY_STRIP) has only six. Yarn has no key: the balls lie around.
const TOUCH_HINT = ['Joystick to move', 'drag to look', 'buttons to pounce/meow/photo', 'pinch to zoom', 'tap the prompt to interact'];
const KEYS_HINT = ['Arrows/WASD move', 'Shift creep', 'Space jump/climb/pounce', 'E do it/sniff', 'V meow', 'C photo', '+/− or wheel zoom', 'M sound', 'Esc pause'];
const ROOM_KEYS_HINT = ['Enter chat', '1–9 say a line'];
// The walk's chat hint. Phones have no number keys, so they're pointed at
// the 💬 button (in the zoom row) instead.
export function chatHintLine(touch) {
  return touch ? 'Tap 💬 to chat' : 'Press 1–9 to chat · Enter for phrases';
}

// The summary's own lines for what a walk banked (bankWalk's numbers): the
// one source of their words. Plain text by default, which a walk-on toasts
// (walkOn's onWalkedOn); endWalk's summary card asks for its HTML pieces
// (`html`: the item's name escaped, the light paw, a non-breaking space as
// an entity) and wraps each line in its own tag. Every other character is a
// literal or a number, so nothing else needs escaping. null where a line
// does not apply.
export function bankedLines({ isRecord, streak, mochiArrived, broughtHome }, { html = false } = {}) {
  const name = html ? escapeHtml(carryLabel(broughtHome)) : carryLabel(broughtHome);
  const paw = html ? PAW : '🐾';
  const nbsp = html ? '&nbsp;' : '\u00a0';
  return {
    best: isRecord ? 'NEW BEST! 🏆' : null,
    streak: streak.bonus > 0 ? `🔥 day ${streak.count} streak — +${streak.bonus} bonus ${paw}` : null,
    mochi: mochiArrived ? 'Mochi the kitten followed you home! 🐱' : null,
    brought: broughtHome ? `You brought the ${name} home. It's in the den now.${nbsp}🏠` : null,
  };
}

function hintHtml(segs) {
  return segs.map((t) => `<span class="hint-seg">${escapeHtml(t)}</span>`).join(' · ');
}

export function createWalkLifecycle({
  MP, pid, coarse, envMap, overlay, blockList,
  renderer, camera, composerRig,
  player, progression, settings, hud, audio, music, log, touchUI, catVoice,
  // the photo Album (album.js): her birthday photo goes in it. Optional.
  album = null,
  getCloud, getSession, setSession, getIsTouch, getHomebase,
  getPendingRoom, clearPendingRoom, pushProfileNow,
  // game/rooms.js: the home base's Start in a room (v21 Play together).
  startRoomTogether,
  awardStrayGreet, applyRemoteEvent,
  // v21 Stream 2: game/colonysync.js. Optional; later colony tasks use it.
  colonySync,
  // game/adaptquality.js: picks each walk's tier (adaptive Auto) and sets the
  // renderer + composer pixel ratio for it.
  qualityAdapter,
  // v21 Stream 5: the den shop overlay (ui/denshopview.js), on den walks only.
  denShop,
  // Clan Life Task 6: game/interactions.js's end of a patrol together.
  endClanPatrol = () => {},
  // Fight moves and scars: her cat's rendered scars changed (a lost fight, a
  // walk's fade). main.js re-tracks the room profile and re-pushes the cloud one.
  onScarsChanged = () => {},
  // Mid-walk resume: a walk that ends has nothing left to pick up (main.js
  // forgets walkresume.js's note).
  onWalkEnded = () => {},
  // ui/buttonwords.js: which touch buttons still show their small word.
  buttonUses = null,
  // F6: the area loader (game/areaload.js) every walk builds its place from;
  // the home screen's gentle line (a place that did not come); a fresh start
  // of the page; and whether the device is online (it picks the line).
  areas = createAreaLoader(),
  homeToast = () => {},
  reloadPage = () => window.location.reload(),
  isOnline = () => navigator.onLine !== false,
  // World map step 3: a walk walked on through a gate has started in the next
  // place; `lines` are the walk just left's own lines (a new best, a streak
  // bonus, the kitten, what she brought home) for main.js to toast now. A
  // walk not yet begun (a desktop's Ready? card) keeps them in its
  // startLines for the first engage instead, and `lines` is empty. And the
  // walk's pause (main.js: the ⏸ action), for a walk-on that waits for its place.
  onWalkedOn = () => {},
  releaseControl = () => {},
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
      const allIds = [];
      for (const r of rows) {
        const otherId = r.a_id === pid ? r.b_id : r.a_id;
        allIds.push(otherId);
        greetsById.set(otherId, r.greets);
      }
      // Only players this device booped or added by code (src/metplayers.js):
      // anyone can write a friendships row naming this child.
      const otherIds = metOnly(deviceMetPlayers(), allIds);
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
        {
          gift: handover,
          ground: mySession.ground,
          // Review S2: the wander rolls on a stream of the ghosts' own. Ghosts
          // visit solo walks only, so soloSeed is set; Math.random otherwise.
          wanderRng: mySession.soloSeed !== undefined
            ? ownStream(mySession.soloSeed, GHOST_WANDER_SALT)
            : Math.random,
        }
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
      note('room', err);
    }
  }

  // homebase's Start button always calls this. Solo (no room) it starts the
  // walk. In a room, anyone's Start starts everyone (game/rooms.js's
  // startRoomTogether, v21 Play together): it proposes a walk in MY area,
  // every device gathers proposals for a moment and all start the same one,
  // so nobody walks a different world from the room they are in. The home
  // base shows "Starting…" meanwhile; a second press does nothing.
  //
  // The walk goes where effectiveArea says: a Legacy kid whose place is the
  // Woods walks the Neighborhood. That is an override, never a setArea, so
  // state.area keeps the Woods for when they flip back.
  //
  // ?roofs=1: a solo Rooftops walk, never in a room (ruling R1). Its drawing
  // is its own download like every place's (fetched at boot with the switch
  // on, main.js), so it starts through startWalkWhenReady like any solo walk:
  // home stays up while it comes, and a load that fails keeps her home with
  // the same gentle line as any place.
  //
  // ?house=1: a solo Old House walk, in Clan Edition only (Legacy Edition does
  // not get it) and never in a room (ruling H7); its drawing is its own
  // download too, so it starts the same way. With both switches on, the
  // Rooftops wins.
  //
  // A solo start returns startWalkWhenReady's promise (it settles once the
  // walk has started, or not); a room start returns nothing.
  function beginWalkFromHomebase({ duskMode }) {
    if (roofsOn() && !getPendingRoom()) return startWalkWhenReady({ duskMode, areaOverride: 'roofs' });
    if (houseOn() && isClanEdition(progression.state) && !getPendingRoom()) return startWalkWhenReady({ duskMode, areaOverride: 'house' });
    // Her birthday (src/birthday.js): while the Gathering waits, a solo
    // Explore starts in the Pines at the foot of the island bridge. An
    // override only, never a setArea, and nothing is unlocked: the Pines stay
    // as they were (and a walk there counts only if they are already hers).
    if (!getPendingRoom() && birthdayDue(progression)) {
      return startWalkWhenReady({ duskMode, areaOverride: progression.state.area === BDAY_AREA ? undefined : BDAY_AREA, birthday: true });
    }
    const area = effectiveArea(progression.state, CATALOG);
    if (!getPendingRoom()) {
      return startWalkWhenReady(area === progression.state.area ? { duskMode } : { duskMode, areaOverride: area });
    }
    startRoomTogether({ area, dusk: !!duskMode });
    return undefined;
  }

  // The den button's variant (Task 7.2): the den never joins a room walk
  // (homebase hides the button while a room is pending — see
  // the Visit your den button's `roomState` check), so this bypasses
  // beginWalkFromHomebase's host/joiner room branch entirely and starts
  // straight away (once the den has loaded) with areaOverride: 'den' — same
  // mechanism a room joiner's areaOverride uses to walk somewhere without
  // persisting it as state.area (see startWalk's areaId comment).
  function beginDenWalk() {
    return startWalkWhenReady({ areaOverride: 'den' });
  }

  // F6: the one door every walk start goes through (Explore, the den, a room
  // start, a walk picked up again). A place already loaded starts in the same
  // tick, exactly as startWalk always did, and a throw from the build comes
  // straight out. Otherwise the place is fetched first and home stays up:
  //   - the sound context is made now, inside the tap (iOS lets it start only
  //     there), not after the wait;
  //   - a wait longer than GETTING_READY_DELAY_MS says "Getting ready…" on
  //     the Explore button (a quicker one never shows it);
  //   - a second start while one waits is ignored ('busy'): one load, one walk;
  //   - the place came: the walk starts, unless one has started some other
  //     way meanwhile, the room it belonged to has changed (a room start whose
  //     room went, or another took its place; a solo, den or Rooftops start
  //     made before she joined one: startWalk would put her solo world on the
  //     room's line), or her place changed while it came (Change place, a
  //     room's start) ('dropped');
  //   - it did not: she stays home with one gentle line ('failed'). Online,
  //     the first failure (RELOAD_AFTER_FAILURES; any walk that starts clears
  //     the count) makes the line say the game will start fresh, and the next
  //     Explore reloads the page: the browser remembers a failed import, so
  //     trying again cannot help while the page lives. A failure offline
  //     says the place needs the internet, never counts and never reloads;
  //     back online, one tap tries (and fails fast) before the line appears.
  //     Only her own tap for a place not
  //     here reloads: a place already here just starts, and a room start
  //     (heard from the room, no tap of hers) never reloads, never counts and
  //     never offers it: it stays home with the plain line. A place this build
  //     does not have at all (AreaLoadError 'unknown') never counts: a reload
  //     cannot bring it.
  // Nothing here draws a random number, so a walk that waited is the same
  // walk, draw for draw, as one whose place was already here.
  // Resolves to 'started' | 'busy' | 'failed' | 'dropped'; a build throw on the
  // waiting path rejects it.
  let waiting = null; // the token of the start now waiting, else null
  // Every startWalk counts itself, so a walk-on's moment can tell whether a
  // walk began some other way while it showed.
  let walksStarted = 0;
  let waitTokens = 0;
  let failures = 0;
  function startWalkWhenReady(opts = {}) {
    const areaId = opts.areaOverride ?? progression.state.area;
    const inRoom = opts.roomSeed !== undefined;
    // Every start belongs to the room it was made in, or to none: a room left
    // (and perhaps another joined), or one joined, during the wait drops it.
    const roomAtCall = getPendingRoom();
    if (waiting !== null) return Promise.resolve('busy');
    if (areas.loaded(areaId)) {
      startWalk(opts);
      failures = 0;
      return Promise.resolve('started');
    }
    if (!inRoom && failures >= RELOAD_AFTER_FAILURES && isOnline()) {
      reloadPage();
      return Promise.resolve('failed');
    }
    audio?.getContext?.();
    const token = ++waitTokens;
    waiting = token;
    const timer = setTimeout(() => {
      if (waiting === token) getHomebase()?.setGettingReady?.(true);
    }, GETTING_READY_DELAY_MS);
    const done = () => {
      clearTimeout(timer);
      if (waiting === token) waiting = null;
      getHomebase()?.setGettingReady?.(false);
    };
    return areas.ensure(areaId).then(
      () => {
        const stale = waiting !== token;
        done();
        if (stale || getSession() || getPendingRoom() !== roomAtCall || (inRoom && !roomAtCall)) return 'dropped';
        // startWalk reads her place again when there is no override: a place
        // changed during the wait would build somewhere other than what came.
        if ((opts.areaOverride ?? progression.state.area) !== areaId) return 'dropped';
        startWalk(opts);
        failures = 0;
        return 'started';
      },
      (err) => {
        done();
        note('area', err);
        const online = isOnline();
        const counts = !inRoom && err?.kind !== 'unknown' && online;
        if (counts) failures += 1;
        const reload = counts && failures >= RELOAD_AFTER_FAILURES;
        homeToast(reload ? phrase('start.notReadyReload') : !online ? phrase('start.notReadyOffline') : phrase('start.notReady'));
        return 'failed';
      },
    );
  }


  // `resume` is a walk picked up again (walkresume.js's note, main.js's boot):
  // the same seed and stamp build the same walk, then the cat, the treasures,
  // the goals and the tallies are put back. Solo only; never with a roomSeed.
  // `arrive` ({ x, z, yaw }) is where a walk walked on through a gate or a
  // border post begins (walkOn below): the cat starts there, facing in,
  // instead of at the spawn. Only the first camp walk's way and heading start
  // there too (from where she stands, as from a resumed spot; its heading
  // wins over the arrival's yaw); the spawn still seeds the race pad, the
  // kitten, the wanderer and the guided walk, and no stream is drawn from
  // differently.
  function startWalk({ duskMode = false, roomSeed, areaOverride, resume = null, arrive = null, birthday = false } = {}) {
    walksStarted += 1;
    // The place's pack (F6), before anything touches the save: a start whose
    // place has not come is a mistake in the caller (every start goes
    // through startWalkWhenReady), and it must leave nothing half-done.
    const pack = areas.loaded(areaOverride ?? progression.state.area);
    if (!pack) throw new Error(`Whisker Walk: area "${areaOverride ?? progression.state.area}" is not loaded; start walks with startWalkWhenReady`);
    // The Farm's animals and the Fair's rides and games come with their place.
    const { createFarmAnimals, createFairLive, createFairShow } = pack.life;
    // A visit prize held for the tap (styles A and C) goes on FIRST, before
    // anything below reads state.equipped (the avatar, the collar/crown
    // perks). Style C never dims and A lets go after its reveal, so Start,
    // the den button, or a room partner's start can all land while the
    // present is still up. Every walk comes through here (beginWalkFromHomebase
    // solo, beginDenWalk, and rooms.js's startWalk thunk for room starts),
    // which is why it lives here and not in each caller. A no-op when nothing
    // is pending, so a cycle-back's outfit is never touched; the card itself
    // still closes with 'walk' in getHomebase().hide() below.
    // (Not on a walk picked up again: that launch is not a new visit, and a
    // prize put on now could change the walk being rebuilt, dusk included.)
    if (!resume) progression.wearPendingVisitPrize();
    // Read ONCE per walk, here, and passed down from this one place. Every
    // system below that cares (fx, skyLife, weather, and now the water and the
    // wind) wants the same answer, and the two new ones are on the 60Hz path —
    // re-querying a setting per frame is exactly what this snapshot exists to
    // prevent.
    const reducedMotion = settings.get('reducedMotion');
    const tier = qualityAdapter.beginWalk({
      reducedMotion,
      override: settings.get('quality'),
      nowMs: performance.now(),
    });
    // BEFORE ANY WORLD GEOMETRY EXISTS. render/textures.js builds its tiles
    // lazily at first use and memoises them for the app's lifetime, so the
    // tier that is set when the first textured prop is built is the tier that
    // walk gets and every later walk inherits. Setting it after the build
    // would give the first walk of a session the wrong one, permanently.
    setTextureTier(tier);
    // The shared per-walk stream. In a room walk every client seeds it from
    // the same roomSeed, so co-walkers agree about the world only as long as
    // they take the SAME DRAWS IN THE SAME ORDER. Solo it is Math.random and
    // draw order does not matter at all, which is exactly why an ordering
    // mistake here is invisible until two people walk together.
    //
    // WARNING — do not give this stream a lazy or conditional consumer.
    // Everything below draws from it during startWalk, unconditionally and in
    // a fixed order. One system does draw AFTER the walk has begun: the scent
    // module (createScent's rng). It has TWO callers, both per-frame and both
    // behaviour-dependent: v18's Twitchy Nose trail (scent.js's trailTo, via
    // game/interactions.js's updateSenses; only when the skill is unlocked and
    // the player moves) and v21's quest trail (questscent.js's questTrailStep,
    // same updateSenses; every 1.2-4 s of an active quest, skill or no skill).
    // Their draws only jitter local decals, nothing that must agree between
    // co-walkers. That is safe TODAY for one reason and one reason only — the
    // scent module is the sole post-startWalk consumer of walkRng, so its
    // draws, however irregular, can never fall between two other systems'
    // draws and shift them. It is NOT safe because the draws are rare.
    //
    // The moment a second SYSTEM draws from walkRng after startWalk returns,
    // co-walkers with different draw histories (a Twitchy Nose player vs one
    // without, a quester vs a bystander) would pull different values for it
    // and the two worlds would silently diverge. If you need mid-walk
    // randomness, give the new system its own seeded stream (sky life already
    // does this — see the note further down) rather than adding a second lazy
    // consumer here.
    //
    // Solo, the stream is seeded as well (mid-walk resume): the seed is noted
    // while the walk is on, and a walk picked up again draws the same weather,
    // secrets, quest and goals from it. So draw order now matters solo too:
    // a solo draw that depends on the save must not sit on this stream (see
    // soloGiftRng). soloSeed is undefined in a room walk.
    //
    // The guided first walk and the first camp walk (game/guidewalk.js): which
    // lesson this walk has, from the save and the walk's own facts. A guided
    // first walk is plain daylight: never dusk, and its seed is one whose
    // weather roll (the stream's first draw, below) says clear, so the walk
    // is an ordinary walk in every draw and a walk picked up again from the
    // same seed is clear again.
    const lessonArea = areaOverride ?? progression.state.area;
    const lessonPlan = lessonFor(progression.state, {
      areaId: lessonArea, room: roomSeed !== undefined, resume,
      clanEdition: isClanEdition(progression.state), hasCamp: !!campLayout(lessonArea),
    });
    if (lessonPlan?.kind === 'first') duskMode = false;
    const soloSeed = roomSeed === undefined
      ? (resume?.seed ?? (lessonPlan?.kind === 'first' ? newClearSeed((seed) => rollWeather(mulberry32(seed)) === 'clear') : newWalkSeed()))
      : undefined;
    const walkRng = mulberry32(roomSeed ?? soloSeed);
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
    // Indoors (indoor.js: the den and the Old House): no weather, secrets,
    // strays, legend or sky birds. Daily goals and the corner map are the den's
    // own guards: the den has neither, the house has both (Old House D11, D12).
    // Every other guard below stays the den's own (its zoom cap, its
    // furniture, its cats, its shop).
    const indoor = isIndoor(areaId);
    // A walk picked up again keeps its stamp: the same border warrior, the same song.
    const walkStamp = resume?.stamp ?? 'walk-' + Date.now();
    const scene = new THREE.Scene();
    scene.environment = envMap;
    // scene.environmentIntensity is set a little further down, by
    // composerRig.applyLighting — it depends on eveningLook (walkDusk), which
    // is not resolved until after the dusk block below.
    if (tier.postFx) {
      composerRig.ensure(tier.msaaSamples);
      composerRig.attachScene(scene); // point the composer's RenderPass at this walk's scene
    }
    // The key light's colour, position and intensity live in render/rig.js,
    // with the reasoning that tuned them.
    const sun = createSun();
    scene.add(sun);
    // The hemisphere light that replaces the old AmbientLight is added AFTER
    // the world build, a few dozen lines down — it needs the area's own ground
    // colour, which only areaData carries. Nothing between here and there
    // reads the scene's fill light, so the gap is safe; see the comment at the
    // createFill call itself.

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
    // The gates this walk draws (world map step 3: Clan Edition only, see
    // `gates` below). The Fair and the Farm cut their front fences for exactly
    // these, so a Legacy walk (none) keeps its fence whole, as it always was.
    const gateEnds = !isDen && isClanEdition(state) ? liveEndsFor(areaId, CATALOG) : [];
    const areaData = isDen
      ? pack.world.build(scene, { placed: progression.state.den.placed, wind })
      : pack.world.build(scene, { water: { quality: tier, reducedMotion }, wind, gateEnds });
    // Gorge part 1: the area's walkable height, FLAT_GROUND on every map today.
    const ground = groundOf(areaData);
    // Gorge G9: the goat comes on about half the days. On a no-goat day it and
    // its leap are dropped here, by the UTC date alone (the race's day), so
    // walkRng and strayStream draw exactly as on a goat day.
    if (areaId === 'gorge') Object.assign(areaData, goatForDay(areaData, new Date().toISOString().slice(0, 10)));
    // Clan Edition only, and local to this screen (border crossings R13): the
    // waymark posts and the town's footpath. Added before the fill light, contact
    // shadows and the static-prop merge so they get all three; their colliders
    // join the live list below, beside the scratch posts'.
    const dressing = !isDen && isClanEdition(state) ? addBorderDressing(scene, areaId, { ground }) : null;
    // The gateways (world map step 3), on the same terms and for the same
    // reasons as the posts: Clan Edition only, local to this screen, drawn here
    // so they get the fill light, contact shadows and the merge. Each lane is a
    // top-level mesh named 'path' (R12), added before the dusk and wet lists
    // below collect the paths, so a lane darkens in rain and tints at dusk like
    // every path. A gate is open where she can go now (gateStatus 'go'). Its
    // colliders join the live list below, beside the posts'.
    const gates = !isDen && isClanEdition(state)
      ? addGatewayDressing(scene, areaId, { ground, ends: gateEnds, isOpen: (e) => gateStatus(e, state, CATALOG).kind === 'go',
        nameFor: (e) => placeName(e.to, state.edition, CATALOG) }) // a gate's name board (Rooftops step 4)
      : NO_GATES;
    // The fill light, added here rather than beside the sun because its ground
    // term is the AREA'S OWN dominant ground colour and only areaData knows it:
    // a green bounce under the park's lawn, sand at Seaside, wet grey stone at
    // the Docks, warm floorboards in the den. That is the difference between a
    // hemisphere light and a tinted ambient — the down-facing half of every
    // object picks up the colour of what it is standing on, which is most of
    // why the technique reads as "grounded" rather than just "less flat".
    //
    // `groundBounce` is threaded back the same way `spawn`, `pois`, `colliders`,
    // `bounds` and `waters` already are. createFill (src/render/rig.js) falls
    // back to DEFAULT_GROUND_BOUNCE, so an area that has not been threaded (or
    // a test's bare build(scene)) still lights correctly rather than throwing.
    // Held, not added inline: the area's life (the Gorge's shade) scales it.
    const fill = createFill(areaData.groundBounce);
    scene.add(fill);
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
    const decals = createContactShadows(scene, { ground });
    // Wave 3.1 — merge each top-level prop's own leaves down to one mesh per
    // material. See render/mergeprops.js for why it never crosses a top-level
    // child, which is what makes it safe next to everything above and below it.
    //
    // AFTER createContactShadows AND NOT BEFORE, and that ordering is the one
    // subtle thing about this call. Merging bakes each leaf's matrix into
    // vertices, which is exact in real arithmetic and carries ~1e-6m of float
    // noise in practice. A micrometre of bounding box is nothing to the caster
    // rule (its thresholds are 0.12, 1.3 and 1.0), but contactshadows.js's per-prop
    // size jitter is a sin() hash of the footprint CENTRE, and a sin hash is
    // chaotic by construction — 1e-6 of drift in x re-rolls the jitter and
    // resizes that decal by up to 8%. Measured: 61 decals before and 61 after
    // either way, but scanning first makes every footprint BYTE-IDENTICAL
    // instead of merely correct. The scan's own requirement — that the scene
    // holds the area's props and nothing else — is unaffected, because merging
    // adds and removes nothing the scan would have looked at.
    mergeStaticProps(scene);
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

    const active = activeCat(state);
    // Fight moves and scars: the key her cat's scars are filed under (null for
    // Hagrid, who never scars); she walks wearing them.
    const myScarKey = scarKey(state);
    const cat = buildCat(active.breed, {
      collar: state.equipped.collar,
      head: state.equipped.head,
      face: state.equipped.face,
      neck: state.equipped.neck,
      body: state.equipped.body,
      back: state.equipped.back,
      feet: state.equipped.feet,
    }, { look: active.look, scars: progression.catScars(myScarKey) });
    // her own custom cat wears its name on her own screen, like a co-walker
    attachOwnTag(cat, state);
    cat.position.set(areaData.spawn.x, ground.y(areaData.spawn.x, areaData.spawn.z), areaData.spawn.z);
    cat.rotation.y = 0; // rotation 0 faces -z, into the area
    scene.add(cat);
    // your pace IS the world's pace: breed speed sets how fast anything scrolls
    const pace = 2.2 + PERSONALITIES[active.breed].speed * 0.8;
    player.setAvatar(cat, pace);
    player.setGround(ground);
    player.setCameraGround(areaData.cameraGround); // the house's floors without the furniture tops; elsewhere none
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
    // Camera zoom: the step this device last chose (settings.cameraZoom),
    // capped in the den, applied instantly so a walk never opens with the
    // camera gliding out. reducedMotion is set first so later zoom presses
    // this walk are instant too.
    player.setReducedMotion(reducedMotion);
    const zoomStep = clampZoomStep(settings.get('cameraZoom'), maxZoomStep(isDen));
    player.setCameraZoom(zoomStep, { instant: true });
    const startView = zoomView(zoomStep);
    camera.position.copy(cat.position).add(cameraOffset(0, 0.18, startView.dist, startView.height));
    camera.lookAt(cat.position.x, cat.position.y + CAT_LOOK_Y, cat.position.z);

    const equipped = state.equipped;
    // In a room walk (roomSeed set), duskMode was already gated on the
    // HOST's own glow-collar equip check before being broadcast as
    // walk-config — re-gating it here on the LOCAL (joiner's) collar would
    // make joiners without a glow collar branch differently than the host
    // on the weather/secrets rolls just below, desyncing the shared walkRng
    // stream for the rest of the walk. Solo walks have no host to trust, so
    // they keep the local collar check.
    // Rooftops step 2: an area that is always evening (areaData.evening) has
    // the dusk look on every walk (eveningLook), and counts as a dusk walk
    // only with the Glow Collar on (countsDusk). duskActive keeps the rest:
    // the secrets' roll, the fireflies, room configs, session.duskActive.
    // session.js's walkDusk holds all three rules.
    const { duskActive, eveningLook, countsDusk } = walkDusk({ duskMode, room: roomSeed !== undefined, collar: equipped.collar, evening: areaData.evening });

    // Warm low sun, cool sky fill, window glow: render/dusk.js.
    const duskLookNow = eveningLook ? applyDusk({ scene, sun, fill, areaData }) : null;
    setCatRimLight({ dusk: !!duskLookNow }); // polish-catlight: dusk rim weaker, cooler
    // The Fairground's bulbs (world/fair.js): every one shares one material,
    // lit in a dusk walk and plain coloured glass by day. No real lights.
    if (areaId === 'fair') pack.world.setFairGlow(areaData, duskLookNow ? 1 : 0);

    // v18 Night Eyes ('night-eyes', Task 2.3): dusk walks brighten. This has
    // to run AFTER walkDusk above (a solo dusk walk only counts as dusk with
    // the glow collar on; its eveningLook is what lights it) and after the
    // dusk block has finished recolouring the sky, because it is the frame's
    // EXPOSURE that changes, not the scene.
    //
    // Called unconditionally on every walk, skill or no skill:
    // renderer.toneMappingExposure is global renderer state, so a walk that
    // does not want a boost must actively be handed the base value back —
    // otherwise a Night Eyes dusk walk would leave the next daytime walk
    // over-exposed. composerRig.applyLighting therefore also subsumes the
    // `scene.environmentIntensity = tier.envIntensity` assignment that used
    // to sit up beside scene.environment.
    composerRig.applyLighting(scene, {
      dusk: eveningLook,
      nightEyes: hasSkill(progression.state, 'night-eyes'),
      envIntensity: tier.envIntensity,
    });
    if (duskLookNow) {
      // Image light dimmed for dusk; Night Eyes' boost stays multiplied in.
      scene.environmentIntensity = duskEnv(scene.environmentIntensity, duskLookNow);
      // Only the LOCAL glow collar lights the cat (a joiner without it gets none).
      if (equipped.collar === 'glow') addCollarGlow(cat, duskLookNow);
    }

    // Dusk lawns: the same ground list rain darkens, taken before anything else is added.
    // The far band (lawn, hills, skylines; builder.js horizonBand) joins the ground here, or
    // the tinted near lawn ends in a bright neon strip at the fog line. A top-level mesh tagged
    // userData.duskTint (the camps' soft clearing floor) and the ford's stepping stones join it too,
    // or they glow pale in a dark scene.
    const duskGround = duskLookNow ? scene.children.filter((c) => c.isMesh && (c.userData.ground || c.userData.duskTint || c.name === 'path' || c.name === 'horizonBand' || c.name === 'steppingStones')) : [];
    let weather = { condition: 'clear', rainbowVisible: false, rainbowPos: null, update() {}, setSheltered() {}, tintWet() {}, dispose() {} };
    // No weather in an area that is always evening (no rain on the roofs).
    if (!duskActive && !indoor && areaData.evening !== true) {
      // The ground and paths in the scene right now (the area's own, before
      // anything else is added) are what the rain darkens; the fill is dimmed.
      const wet = scene.children.filter((c) => c.isMesh && (c.userData.ground || c.name === 'path'));
      weather = createWeather(scene, sun, rollWeather(walkRng), walkRng, reducedMotion, ground, { tier, fill, wet });
      // polish-daylight: a graded clear day also takes a touch less exposure.
      if (weather.exposureScale) composerRig.applyDayGrade(weather.exposureScale);
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
        // Their spots: weather.js's rainPuddleSpots, on ground a cat can
        // stand on (G7), each drawn on the ground under it (p.y).
        const extra = rainPuddleSpots(areaData, walkRng);
        for (const p of extra) scene.add(puddleProp(p.x, p.z, p.r, p.y));
        areaData.puddles = [...areaData.puddles, ...extra];
        weather.addPuddles(areaData.puddles);
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
    const secrets = indoor
      ? { list: [], update() {} }
      : createSecrets(scene, areaData, rollSecrets(walkRng, { eveningLight: duskActive || weather.condition === 'sunset' }), walkRng);

    const critters = createCritters(scene, areaData.critterSpawns, {
      fleeScale: equipped.collar === 'bell' ? 0.5 : 1,        // bell: birds tolerate you closer
      spawnFireflies: duskActive && !indoor,                   // glow: dusk fireflies, never in a room
      trailButterflies: equipped.head === 'crown',              // crown: butterflies trail the cat
      // v18 Task 1.4: the dusk fireflies are PLACED, so they belong on the
      // shared determinism stream like secrets/strays/scent above — they
      // used a bare Math.random(), which put two co-walkers on the same
      // room seed in visibly different firefly fields.
      rng: walkRng,
      // Review S2: each critter's idle phase, from the critters' own stream
      // (never walkRng: see CRITTER_MOTION_SALT at the top of this file).
      motionRng: ownStream(roomSeed ?? soloSeed, CRITTER_MOTION_SALT),
      // v21 3b Task 13: a mouse, rat or squirrel that notices the cat bolts
      // for this cover and stays hidden for the walk (the den has none). Local
      // to this device like every critter position; nothing rides the wire.
      hides: areaData.hides ?? propsFor(areaId).hides,
      onHide: (c) => hud.toast(hideToastFor(c.type)),
      ground,
      // G7: the dusk fireflies' spots stand where a cat can (standSpot).
      area: areaData,
    });

    const collectibleMeshes = new Map();
    // A walk picked up again: what was already picked up stays picked up.
    // No mesh in the map is all "collected" means (interactions.js).
    const alreadyCollected = new Set(resume?.collected ?? []);
    for (const c of areaData.collectibles) {
      if (alreadyCollected.has(c.id)) continue;
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        litMaterial(0xf25c8a, { emissive: 0x5a1a30 })
      );
      m.position.set(c.x, ground.y(c.x, c.z) + (c.y ?? 0) + 0.2, c.z);
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
      // createQuest draws one target from the list, so a quest never takes
      // more than one island POI (group 'island'); it needs no group rule.
      quest = createQuest(walkRng, walkPois);
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.4, 6),
        litMaterial(0xf2c14e, { emissive: 0x6a5010 })
      );
      marker.rotation.x = Math.PI;
      marker.position.y = 2.1;
      (giver.figure ?? giver.group).add(marker);
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
      // Gorge part 1: the y offsets above are metres above the ground at the
      // target. The beacon below is placed from that RELATIVE y, so the column
      // spans 1.6 m to 10 m over the target's own ground, never inside rock;
      // the ground is added to the object after it.
      // Objective beacon: a glowing column so the target reads from across the
      // area, not just once you are on top of it. The top is 10m world height —
      // the tallest props here (house gables, tree crowns) top out near 5.5m,
      // so the tip clears them from anywhere in the area. 0.35m radius and 0.75
      // opacity because a thinner, fainter column vanished against the pale
      // sky at 50m; fog:false because the day fog (40-130m) would otherwise
      // fade it toward sky colour at exactly the distances it exists for.
      // The BASE is lifted to 1.6m: every target sits inside the 0.35m radius,
      // and a column that reaches the ground draws near-solid colour over it,
      // so a kid at completion range (< 2m) saw a pillar, not the glasses or
      // kitten they were hunting. Lifted, the target stands in clear air under
      // the column (the tallest, the letter, tops out ~1.25m) and the column
      // still reads from afar.
      // It is a CHILD of questObject so accept/complete visibility
      // (interactions.js) covers it, which also means it inherits the parent's
      // scale and y offset (kitten 0.5x, letter at y=1, glasses at y=0.15).
      // Both are undone below so the column spans the same 1.6m-10m world
      // range for every quest type.
      // Translucent on purpose: the shadow-caster sweep below skips transparent
      // meshes, so the column does not throw a stripe across the lawn.
      // (The target object itself now casts a small shadow, because the beacon
      // makes its group tall enough for that sweep — accepted and intended.
      // The group's box still runs from the target mesh at the ground up to
      // 10m, so every quest type clears the sweep's 1.3m height gate.)
      const BEACON_BASE = 1.6;
      const BEACON_TOP = 10;
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, BEACON_TOP - BEACON_BASE, 8, 1, true),
        litMaterial(QUEST_TRAIL_COLOR, {
          emissive: QUEST_TRAIL_COLOR, transparent: true, opacity: 0.75, depthWrite: false, fog: false,
        })
      );
      const parentScale = questObject.scale.y;
      beacon.scale.setScalar(1 / parentScale);
      beacon.position.y = ((BEACON_BASE + BEACON_TOP) / 2 - questObject.position.y) / parentScale;
      questObject.add(beacon);
      questObject.userData.beacon = beacon;
      questObject.position.y += ground.y(t.x, t.z);
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
    // The strays spawn from their own room-seeded stream, strayStream(roomSeed),
    // not walkRng, so how many a device spawns (tier.strays: 22, or 14 on the
    // low rung) costs walkRng nothing and treats and goals land the same
    // everywhere.
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
    //
    // v21 Stream 2 — the colony's cats, at their fixed spots. colonyWalk is
    // "every other member of this walk is my colony partner": always true
    // solo, and in a room walk only when the roster (read off the pending
    // room, as it stands right now at startWalk) holds nobody but me and my
    // partner. Off a colony walk the colony list is EMPTY, so a room with a
    // non-partner gets exactly the strays it got before the colony existed,
    // and both co-walkers see the same cats (decisions.md, "Live co-walk").
    // A room walk whose pending room has gone missing reads as NOT a colony
    // walk: no roster, no proof that everyone is my partner.
    //
    // Neither of these touches walkRng. colonyWalk is pure over the roster
    // and the save, and the colony cats consume exactly the draws the strays
    // they replace would have, from the strays' own stream (see the
    // createStrayCats header) — so a colony difference never shifts that
    // stream, and this is not a walkRng consumer of any kind, lazy or eager. The den gets no strays at all, so
    // it gets no colony cats either (its tamed cats are Task 7's).
    const roomAtStart = roomSeed !== undefined ? getPendingRoom() : null;
    const colonyWalk = roomSeed === undefined || (!!roomAtStart && rosterIsPartnerOnly(
      (Array.isArray(roomAtStart.roster) ? roomAtStart.roster : []).map((p) => p?.playerId),
      pid, state.colony?.partner?.playerId,
    ));
    //
    // On a colony walk EVERY colony name is also kept out of the ordinary
    // strays (excludeNames): a tamed cat is waiting in the den, and a cat
    // found in another area lives at its spot THERE — neither may wander in
    // here at a random spot. Off a colony walk the list is empty, so the cast
    // is byte-for-byte what a non-partner co-walker computes. Excluding names
    // filters the already-drawn shuffle, so it costs no draws from any stream either.
    const colonyCats = colonyWalk && !isDen && state.colony
      ? catsInArea(state.colony, areaId).map((c) => ({
        name: c.name, x: c.x, z: c.z, wear: colonyWear(c.wear, CATALOG.accessories),
      }))
      : [];
    // Kittypets: a territory's ordinary cast never holds a kittypet, on every
    // walk (the list is the area id's alone, so every co-walker agrees).
    const excludeNames = [...(colonyWalk && !isDen && state.colony ? state.colony.cats.map((c) => c.name) : []), ...territoryCastExcludes(areaId)];
    // v21 3b — this area's legendary cat, on a colony walk only (ruling P6):
    // solo or partner-only, never with a non-partner (whose walk must be
    // exactly today's) and never in the den. legendary.js decides from the
    // save and one roll; the roll is legendaryRoll's own stream (Math.random
    // solo, a salted mulberry32 off the room seed for partners, so both roll
    // the same number) and the extra's spot is its own mulberry32 over its
    // name and the room seed, so partners see it in the same place. Neither
    // is walkRng: createStrayCats draws the extra after the ordinary cast and
    // only from its own rng, and nothing here is computed off a colony walk.
    // On a partner walk (ruling R40) the decision is `shared`: it reads only
    // the shared roll and the shared colony, never my own greets, so both
    // sisters' screens give the same answer.
    // Solo the roll comes off the walk's own seed, so a walk picked up again
    // rolls the same visitor (its spot too: the extras' rng below).
    const soloLegendRoll = roomSeed === undefined ? mulberry32((soloSeed ^ 0x1e6e2d) >>> 0)() : 0;
    const legend = colonyWalk && !indoor ? legendaryFor(state, areaId, roomSeed === undefined ? soloLegendRoll : legendaryRoll(roomSeed), { shared: roomSeed !== undefined }) : null;
    // Kittypets — now and then a kittypet wanders into the Woods, the River or
    // the Moor. housecats.js decides from the UTC day and the area (plus the
    // shared colony on a colony walk), so it draws nothing from walkRng or the
    // strays' stream and nothing goes on the wire. The roll and the spot are
    // the same in every edition: a Legacy co-walker sees the same cat in the
    // same place, only without the word, the collar or the toast. Its spot is
    // clan ground near the spawn and away from the camp (wanderSpotFor), off
    // the map as built; no spot means no wanderer this walk. It takes an
    // ordinary loner's slot, never a fed colony cat's (wanderStrayCount), and
    // the legend wins: at most one visitor a walk.
    const wanderToday = new Date().toISOString().slice(0, 10);   // UTC, the race's and the streak's day
    // An area record with strays: false (the Rooftops) has no strays and no wanderer.
    const noStrays = areaData.strays === false;
    const wanderName = noStrays ? null : walkWanderer(state, areaId, { ymd: wanderToday, colonyWalk, isDen });
    const wanderSpot = wanderName && !legend ? wanderSpotFor(clearSpot(wanderStart(areaData.spawn), areaData.colliders ?? [], areaData.bounds, areaData.waters ?? []), clanWalkableFor(areaData, areaId), DISCS[areaId]) : null;
    const extras = legend ? [{
      name: legend,
      rng: mulberry32((seedFromCode(legend) ^ (roomSeed ?? soloSeed)) >>> 0),
    }] : wanderSpot ? [{
      name: wanderName, wanderer: true, spot: wanderSpot,
      rng: mulberry32((seedFromCode(wanderName) ^ (roomSeed ?? soloSeed)) >>> 0),
    }] : [];
    // Clan Life Part 1 — in a territory with a camp, the clan's cats replace
    // strays one for one: lonersFor gives tier.strays − the clan shown − the
    // intruder slot (Part 2), and tier.strays itself everywhere else, so the
    // old areas and the den spawn exactly what they always did. Fewer strays
    // from the same stream are a PREFIX of the longer cast (createStrayCats
    // draws each cat's x, z, facing, personality and timer in turn, after one
    // name shuffle that does not depend on the count), so no cat that is
    // spawned moves, and no draw shifts on any stream. fedHere is the colony
    // cats already read for this area: empty off a colony walk, so a
    // non-partner co-walk gets 0 on both devices and the two agree.
    const fedHere = colonyCats.length;
    const loners = indoor ? 0 : lonersFor(areaId, tier.strays, fedHere);
    // The wanderer takes an ordinary loner's slot, never a colony cat's.
    // The lite rung's count is small enough to fall below her colony here
    // (createStrayCats counts fed cats inside the number and drops the ones
    // that do not fit), and a cat she has fed is never what a slow device
    // gives up: tier.keepFedCats raises the count to the colony's size. It
    // is a longer prefix of the same cast on the strays' own stream, like
    // every other count, so no draw shifts anywhere.
    const strayCount = wanderStrayCount(tier.keepFedCats ? Math.max(loners, fedHere) : loners, fedHere, !!wanderSpot);
    const strayCats = createStrayCats(scene, areaData, strayCount, strayStream(roomSeed ?? soloSeed), {
      grudges: progression.grudgeNames?.() ?? [],
      collarFor: (name) => collarFor(progression.state, name),
      roomSeed,
      colonyCats,
      colonyAvoid: campDiscs(areaId),
      excludeNames,
      extras,
      reducedMotion,
      ground,
      // Gorge part 3 (C8): the Snug Cave's cat. No homes off the Gorge.
      homes: areaData.strayHomes ?? [],
    });
    // The clan walks on the map AS BUILT, frozen here, before anything is
    // added to it: the live areaData.colliders later gains this device's own
    // scratch posts and gate frames, which differ between devices, and the
    // clan must not see them or co-walkers' cats would wander apart. Its
    // ground is clan ground (world/clanground.js, ruling P2): never water or a
    // wade band, never the island's keep-out or the Pines' truce path.
    const clanArea = { ...areaData, colliders: Object.freeze(areaData.colliders.map((c) => ({ ...c }))) };
    const clanWalkable = clanWalkableFor(clanArea, areaId);
    // The prefix of the cast this tier shows (clancast.js): the core nine on
    // every device, sixteen on HIGH less any slots fed colony cats took back.
    // Derived, never stored, the same on every device; Legacy spawns the same
    // cats in the same places, only without names.
    // The border patrol fight (2026-11-04, rulings B1, B2): in another clan's
    // territory its border patrol is one of its warriors, picked from the room
    // seed on a co-walk (both screens agree) or else this walk. That warrior is
    // out on patrol, so it is left out of the roaming cats below. Only where
    // this device has a patrol: Clan Edition, a territory's camp, not at home.
    const borderPicks = picksOf(progression.state);
    const borderClan = !isDen && !clanHomeFor(areaId, progression.state.edition, borderPicks)
      ? rivalForWalk(areaId, progression.state.edition, borderPicks)?.clan ?? null : null;
    const borderFoe = borderClan ? borderWarriorFor(borderClan, roomSeed ?? seedFromCode(walkStamp)) : null;
    const borderScars = borderFoe ? progression.intruderScars(borderFoe.id) : [];
    // Her birthday Gathering (world/birthdaygathering.js, the Pines' own
    // download): a solo Pines walk while the event is on and today's candles
    // are lit. Its cats come from every clan; the Pines' own who go are not
    // in their camp on this walk. Nothing here draws from any stream.
    const bdayLife = pack.life.planGathering ? pack.life : null;
    const bdayOn = !!bdayLife && roomSeed === undefined && !isDen && areaId === BDAY_AREA && birthdayDue(progression);
    const bdaySpeaker = bdayOn ? speakerFor(state) : null;
    const bdayPerClan = tier.strays >= 20 ? 3 : 2;
    const bdayAway = bdayOn ? new Set([bdaySpeaker?.id, ...bdayLife.gatheringCast(bdaySpeaker, bdayPerClan).map((m) => m.id)]) : null;
    const clanCast = (isDen ? [] : castFor(areaId).slice(0, clanCountFor(tier.strays, fedHere)))
      .filter((m) => m !== borderFoe && !bdayAway?.has(m.id));
    // Task 6 (patrol together): set to interactions.js's endClanPatrol once
    // `session` exists below. The clan cats only call it from update, which
    // first runs after the session is built.
    let onClanBuddyEnd = () => {};
    const clanCats = clanCast.length ? createClanCats(scene, areaData, clanCast, {
      campLayout: campLayout(areaId),
      roamHomes: roamHomes(areaId, clanArea, clanWalkable),
      isWalkable: clanWalkable,
      roomSeed,
      showNames: isClanEdition(state),
      reducedMotion,
      onBuddyEnd: (cat, reason, secs) => onClanBuddyEnd(cat, reason, secs),
      // A patrol ends at this territory's camp disc (rivalclans.isTrespassing).
      areaId,
      ground,
      // A camp cat she beat wears her scar (applied at build).
      scarsFor: (id) => progression.intruderScars(id),
    }) : NO_CLAN_CATS;
    // The camp on the corner map (Clan Edition only; Legacy shows no clan layer).
    const campAt = clanCast.length ? campLayout(areaId) : null;
    // This walk's lesson, now that its cats exist. The guided first walk
    // moves ONE of the strays above to wait ahead of the start; the first
    // camp walk moves one of the group's roaming cats onto the way to the
    // camp (solo only). Neither draws from any stream: the cast, and every
    // other cat's spot, are exactly what they were. No stray (or no camp)
    // means no lesson, and an ordinary walk.
    let lesson = null;
    if (lessonPlan?.kind === 'first') {
      lesson = buildFirstLesson(lessonPlan, { strayCats, areaData, goals: null, resume, pace });
    } else if (lessonPlan?.kind === 'camp' && campAt && !birthday) {
      const camp = { x: campAt.cx, z: campAt.cz, r: DISCS[areaId]?.r ?? 6 };
      // From where she starts: a walk picked up again, a walk walked on into
      // (Task 10: a border post's arrival), else the spawn.
      const start = resume ?? arrive;
      const from = start ? { x: start.x, z: start.z } : areaData.spawn;
      const canStep = ground.flat ? null : (ax, az, bx, bz) => ground.canStep(ax, az, bx, bz);
      const way = roomSeed === undefined ? findPath(clanWalkable, areaData.bounds, from, camp, { canStep }) : null;
      lesson = {
        kind: 'camp', camp, pace, open: false, room: roomSeed !== undefined, walkable: clanWalkable,
        cat: way ? placeCampGuide(clanCats, way, from) : null,
        heading: headingToward(from, camp),
        heldGoals: null, finished: false, skipped: false,
      };
    }
    const campMarker = !isDen && campAt && isClanEdition(state)
      ? { x: campAt.cx, z: campAt.cz, color: CLAN_COLOURS[areaId] }
      : null;
    const remotes = createRemoteCats(scene, { reducedMotion, ground });

    // v18 Task 3.2 Gift Paws — the gifts this player has stashed at scenic
    // spots on earlier walks, rendered where they were left. Read off the
    // save, joined onto THIS area's scenics by gifts.js (a spot id that no
    // longer exists is skipped, never defaulted to the origin). The den has
    // no scenics, so it gets the inert stub.
    const gifts = isDen ? NO_GIFTS : createGifts(scene, areaData.scenics ?? [], progression.giftsIn(areaId), { ground });

    // v21 Stream 2: the colony's tamed cats live in the den, each at its fixed
    // home spot (taming order -> DEN_HOMES index), and each UTC day gets into
    // something different. Built from the save, draws nothing from walkRng.
    // denResidents leaves out a tamed cat past the last home (tamed cats are
    // never trimmed, so there can be more of them than COLONY_MAX).
    const denCats = isDen && state.colony
      ? createDenCats(scene, denResidents(state.colony).map(({ cat: c, home }) => ({
        name: c.name,
        breed: strayBreed(c.name),
        wear: colonyWear(c.wear, CATALOG.accessories),
        home: { x: home.x, z: home.z },
        moment: denMoment(c.name, new Date().toISOString().slice(0, 10)),
      })), {
        reducedMotion,
        // A queen's little ones sit beside her: derived from the same residents
        // and the colony's cats (a fed one is a colony cat, so it drops out),
        // nothing stored and no den slot of their own.
        kits: placedKits(denResidents(state.colony), state.colony.cats),
        // Keep cats off the den's fixed props and the furniture the player
        // placed: areaData.colliders already holds both (fixtures plus
        // placed pieces); boxes are the cardboard box, the paper bag and any
        // placed box, which have no collider.
        obstacles: [
          ...areaData.colliders.map((c) => ({ x: c.x, z: c.z, r: c.r })),
          ...(areaData.boxes ?? []).map((bx) => ({ x: bx.x, z: bx.z, r: 0.5 })),
        ],
      })
      : NO_DEN_CATS;

    if (roomSeed === undefined) {
      const soloGiftRng = mulberry32((soloSeed ^ 0x61f75a3) >>> 0);
      for (const stray of strayCats.strays) {
        // CF-7: was a bare Math.random(). Harmless as written — this whole
        // block is already solo-only, where walkRng IS Math.random — but the
        // guard and the roll were two separate facts a future edit could
        // separate, so the roll now names the walk's stream explicitly.
        //
        // Mid-walk resume: these draws (and the found gift's below) depend on
        // the save, which changes during a walk: a new best friend or a first
        // stashed gift would shift every walkRng draw after them on a walk
        // picked up again. So solo they have a stream of their own, and the
        // scent and the goals behind them draw the same either way.
        if (progression.friendLevel(stray.name) === 'best' && soloGiftRng() < 0.3) stray.hasGift = true;
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
      const found = pickFoundGift(soloGiftRng, gifts.list);
      if (found && strayCats.strays.length) {
        const finder = strayCats.strays[Math.floor(soloGiftRng() * strayCats.strays.length)];
        if (finder) finder.foundGift = found;
      }
    }
    const toy = createToy(scene, { ground, rng: ownStream(roomSeed ?? soloSeed, TOY_BAT_SALT) });
    // The yarn ball lies at one of the area's two spots (controls review,
    // 2026-11-19): picked by the day on a walk alone, by the room's seed on a
    // walk together, so both players find it in the same place. A hash, never
    // walkRng. It is nobody's until someone touches it (toy.js `claimed`).
    const yarnSpot = yarnSpotFor(areaId, roomSeed ?? new Date().toISOString().slice(0, 10), areaData.yarnSpots);
    if (yarnSpot) {
      toy.spot = { x: yarnSpot.x, z: yarnSpot.z };
      toy.placeAt(yarnSpot);
    }
    // yarn-rally ghost ball: a single shared marker rendered wherever a
    // REMOTE player's state message currently reports an active toy
    // position (session.remoteToy, kept in sync by net.onState below) — it's
    // not a real toy.js instance, just a visual + hit-test target for
    // "bat the ghost to request authority". The same yarn ball to look at.
    const toyGhost = buildYarnBall();
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
      ground,
    });
    // v21 3b — the things a cat can pick up in its mouth, and the mouth that
    // holds one. Created long after mergeStaticProps, so nothing here is
    // merged. The den has nothing to carry: an empty list keeps the per-frame
    // update and endWalk's marks unconditional. `onDeck` is the builder's deck
    // test over this area's waters (the seaside pier, the Docks bridges):
    // interactions.js holds the drop and the rain slip there (ruling R42),
    // since a thing put down lands at ground height, under the boards, and
    // netevents.js ignores a co-walker's drop onto one.
    const carry = {
      mouth: createMouth(),
      items: createCarryables(scene, isDen ? [] : propsFor(areaId).carryables, { ground }),
      onDeck: (x, z) => onAnyDeck(areaData.waters, x, z),
    };
    // Task 8 — in a co-walk, a remote cat that leaves or goes quiet takes what
    // she was holding with her (netevents.js). Harmless solo: no remote ever
    // holds anything there.
    // Found outfits: a partner rebuilt for a new look keeps her clan escort.
    takeHeldItemsWithRemotes(remotes, carry.items, cat, { getClanCats: () => clanCats });
    // v21 3b Task 10 — the cups, pots and books a perched cat can knock off a
    // ledge. A knocked one stays down for the rest of this walk and nothing is
    // saved. Created after mergeStaticProps, so nothing here is merged; the
    // den's list is empty. Deliberately NOT registered with the mover decals
    // below: a mover decal sits on the ground under its object, so a cup on a
    // car roof (or in mid-fall) would trail a shadow blob along the road.
    // knockables.js lays its own fixed decal under each one once it lands.
    const knockables = createKnockables(scene, areaData.knockables ?? propsFor(areaId).knockables, { ground });
    // v21 3b — the things this player has left behind. In the den that is what
    // they carried home, laid out in front of the hearth; outdoors, the posts
    // they scratched, the holes they dug, the things they set down somewhere
    // new, and (Task 12) the paws they left on a rival's border — plus a post
    // at each markable that has nothing standing there. The colliders, the
    // walkable test and the spawn tell a scratch which side of its post to
    // face. Created after mergeStaticProps, so nothing here is merged. Nothing
    // here animates (no render-loop update). Private: never on any wire.
    const playerMarks = createPlayerMarks(scene, areaId, progression.marksIn(areaId), {
      keepSlots: propsFor(areaId).keepSlots,
      colliders: areaData.colliders,
      isWalkable: (x, z) => isWalkableAt(areaData, x, z),
      spawn: areaData.spawn,
      ground,
    });
    const scent = createScent(scene, areaData, walkRng);
    // The posts playerMarks put up are solid: the cat stops at them, as at any
    // other post. Added to this walk's own collider list (a fresh array per
    // area build) before the first frame — main.js hands that list to
    // player.update every frame. Added AFTER the scent is laid, so the buried
    // treats land exactly where they always did.
    for (const p of playerMarks.posts) areaData.colliders.push({ ...p.collider });
    // The border posts' colliders (R13): live list only, after clearSpot, the clan's
    // frozen copy and the scent, so shared systems never see them.
    for (const c of dressing?.colliders ?? []) areaData.colliders.push({ ...c });
    // The gates' posts beside them, and (R11) the leaf circles of every gate
    // shut now: attach() keeps the list, so a gate opened mid-walk takes its
    // circles off it again.
    for (const c of gates.colliders) areaData.colliders.push({ ...c });
    gates.attach(areaData.colliders);
    // v21 3b Task 14 — the cat flaps in garden gates and the gaps in hedges. A
    // cat that walks through one swings it the way it went, and it keeps a
    // gentle sway for the rest of the walk. Its frame is solid and its opening
    // is not: the frame circles join this walk's collider list here, AFTER
    // clearSpot moved the POIs (so no race ring or quest spot shifts for them)
    // and before the player's first update. Created after mergeStaticProps,
    // so nothing here is merged; the den has none. Pays nothing, saves
    // nothing, and sends nothing: main.js hands it every cat on my screen, so
    // a partner's push swings it here too.
    const pushThroughs = createPushThroughs(scene, propsFor(areaId).flaps, { reducedMotion, ground });
    for (const c of pushThroughs.colliders) areaData.colliders.push({ ...c });
    // v21 3b Task 15 — somewhere to drink, eat and nap: a bowl or a birdbath,
    // a dish or a fish crate, a cushion or a doormat. The den's are the bowls
    // and the hearth rug it already has, so it gets no new mesh. Only the
    // birdbaths are solid: their colliders join the list here, after clearSpot
    // (as the flaps' do). Nothing animates, created after mergeStaticProps
    // (nothing merged). Pays nothing, saves nothing, sends nothing;
    // session.rest is the one in progress.
    const rests = createRests(scene, propsFor(areaId).rests, { ground });
    // Bigger areas: a strip's own rest spots (areaData.rests) join the area's.
    rests.add(areaData.rests);
    for (const c of rests.colliders) areaData.colliders.push({ ...c });
    // The birthday cake is solid: its collider joins the list once every
    // prop's is in it, so its spot keeps clear of them all.
    const bdayPlan = bdayOn ? bdayLife.planGathering(areaData, { speaker: bdaySpeaker, perClan: bdayPerClan }) : null;
    if (bdayPlan) areaData.colliders.push({ x: bdayPlan.cake.x, z: bdayPlan.cake.z, r: bdayPlan.cake.r });

    // Appletree Farm's animals (farmanimals.js): cows, goats, hens and chicks,
    // the sheepdog and the ducklings. Built here, after every prop's collider
    // is in the list (they keep clear of them) and before the caster sweep
    // (their small parts are flagged not to cast). Each cow's back is a perch
    // that moves, so it joins the area's perches: the ordinary jump gets the
    // cat onto her. Per device, like the critters: nothing rides the wire, and
    // their dice are their own, never walkRng. Pays nothing and saves nothing
    // itself; meeting one is spotted in updateInteractions.
    let farmToasted = null;
    const farm = areaId !== 'farm' ? NO_FARM : createFarmAnimals(scene, areaData, {
      reducedMotion,
      ground,
      isFree: (x, z) => isWalkableAt(areaData, x, z),
      ducks: () => critters.list.filter((c) => c.type === 'duck').map((c) => c.group.position),
      // What each event pays, says and sounds like is game/farmplay.js (the
      // lines themselves are in the phrase table, by way of src/farmwords.js).
      onEvent: (e) => {
        farmToasted ??= new Set();
        const once = (key, text) => { if (!farmToasted.has(key)) { farmToasted.add(key); hud.toast(text); } };
        handleFarmEvent(e, { hud, audio, log, progression, session, once });
      },
    });
    for (const p of farm.perches) areaData.perches.push(p);
    // The farmer's straw hat (the goat job): a thing to carry, out of sight
    // until the goat drops it.
    if (farm.jobs) addFarmHat(carry, areaData);

    // The Fairground's rides (fairlive.js): the models world/fair.js built,
    // moved by a clock, and the cat's ride on them. Nothing is added to the
    // scene and nothing rides the wire: the rides are a pure function of the
    // time of day, so every device in the walk sees them alike. A ride's seat
    // is a perch that moves, but it is NOT in the area's perches: the jump
    // button asks the rides first (game/interactions.js). What each event says
    // and sounds like is game/fairplay.js.
    const fairLive = areaId !== 'fair' ? NO_FAIR : createFairLive(scene, areaData, {
      camera,
      reducedMotion,
      ground,
      onEvent: (e) => handleFairEvent(e, { hud, audio, log, progression, session, once: fairOnce }),
    });
    // Step 3: its three games, its six things to find and its visitors
    // (fairshow.js), run by the rides once a frame. Per device and seeded with
    // dice of their own, like the Farm's animals: never walkRng, and nothing
    // rides the wire. How many visitors stroll about is the quality tier's
    // (tier.strays: 8 on the high tier, 5, 3). The people get a villager's
    // contact shadow and cast no other. The runaway balloon's ribbon is a
    // thing to carry, out of sight until she catches the balloon.
    let fairToasted = null;
    function fairOnce(key, text) {
      fairToasted ??= new Set();
      if (!fairToasted.has(key)) { fairToasted.add(key); hud.toast(text); }
    }
    const fairShow = areaId !== 'fair' ? null : createFairShow(scene, areaData, {
      swept: fairLive.sim.swept,
      strays: tier.strays,
      camera,
      reducedMotion,
      ground,
      coat: coatColor(active.breed, active.look),
      portrait: () => herCatPortrait(progression.state),
      onEvent: (e) => handleFairEvent(e, { hud, audio, log, progression, session, once: fairOnce }),
    });
    if (fairShow) {
      fairLive.attach(fairShow);
      addBalloonRibbon(carry, areaData);
    }
    // The balance walk, leaps, drops and climb-ups (traversallive.js) of an
    // area that returns `traversal`; NO_TRAVERSAL everywhere else (today,
    // every shipped area). Nothing is added to the scene and nothing rides the
    // wire: every motion is a function of the data, the stick and dt. Built
    // per walk and disposed in endWalk, so a held stick never outlives it.
    // The abilities are read live off the save at each use, like the climb
    // budget. `session.fx` is read when an event fires, after `session` exists.
    const traversalLive = areaData.traversal ? createTraversalLive(areaData.traversal, { ground, reducedMotion, abilities: () => moveAbilities(progression.state), onEvent: (e) => traversalEventEffects(e, { audio, fx: session.fx, cat, bus }) }) : NO_TRAVERSAL;

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
    for (const c of clanCats.list) decals.follow(c.group);
    for (const critter of critters.list) decals.follow(critter.figure ?? critter.group);
    for (const g of farm.groups) decals.follow(g);
    if (fairShow) for (const g of fairShow.groups) decals.follow(g);
    for (const dc of denCats.list) decals.follow(dc.group);

    // The shadow camera used to be nailed to the world origin at +/-70 so it
    // could cover the whole 110m area at once, which bought 6.8cm texels on the
    // high tier and 13.7cm on the low — too coarse for anything smaller than a
    // parked car, the cat included. createShadowFit follows the view instead
    // and tightens to tier.shadowFitRadius, and does the texel snapping that
    // makes a moving shadow camera viable at all. It owns mapSize, the frustum,
    // normalBias and sun.position from here on; see render/shadowfit.js.
    // The lite rung (quality.js LITE) has no shadow pass: the same rig shape,
    // empty, and a sun that casts nothing.
    const shadows = tier.shadows === false ? createNoShadows(sun) : createShadowFit(sun, camera, {
      radius: tier.shadowFitRadius,
      mapSize: tier.shadowMapSize,
    });
    // The bias and the caster rule live in render/rig.js, with the reasoning
    // behind every number in them.
    sun.shadow.bias = SUN_BIAS;
    assignShadowCasters(scene);
    // The shadow-light rung: small parts (a cat's eyes, paws, whiskers) stop
    // casting. Only ever turns casting off, and reads no random stream.
    if (tier.shadowMinPart > 0) trimShadowCasters(scene, tier.shadowMinPart);
    // Stream 4 round two — lawn tufts (render/grass.js). HERE, after the caster
    // sweep, the contact-shadow scan and the prop merge have all run, so none
    // of them ever sees it: one draw call in the main pass, none in the shadow
    // pass. Its mask reads the area's paths off the scene, which is complete
    // by now. Seaside grows dune grass on its back beach; the den and the Docks
    // get the module's no-op stub.
    // keepOut: rest spots, carryable spots and ground-level finds have no
    // collider, so the mask would otherwise grow tufts through the doormat,
    // around the acorn, or over a fish.
    const grassProps = isDen ? null : propsFor(areaId);
    const grassKeepOut = grassProps ? [
      ...[...(grassProps.rests ?? []), ...(areaData.rests ?? [])].map((r) => ({ x: r.x, z: r.z, r: GRASS_REST_CLEAR })),
      ...(grassProps.carryables ?? []).flatMap((c) => [
        { x: c.x, z: c.z, r: GRASS_ITEM_CLEAR },
        ...(c.fallTo ? [{ x: c.fallTo.x, z: c.fallTo.z, r: GRASS_ITEM_CLEAR }] : []),
      ]),
      ...groundFinds(areaData, GOLD_MICE[areaId]).map((p) => ({ x: p.x, z: p.z, r: GRASS_FIND_CLEAR })),
      // the yarn ball's spot: it should be seen from a little way off
      ...(yarnSpot ? [{ x: yarnSpot.x, z: yarnSpot.z, r: GRASS_FIND_CLEAR }] : []),
    ] : [];
    const grass = createGrass(scene, { areaId, areaData, tier, camera, reducedMotion, keepOut: grassKeepOut, hooks: pack.world.GRASS_HOOKS });
    // The blades dominate a lawn's look, so a rainy walk darkens them too.
    if (grass.mesh) weather.tintWet?.(grass.mesh.material);
    const duskLawn = duskLookNow
      ? tintDuskLawn({ ground: duskGround, grass: grass.mesh?.material ?? null, look: duskLookNow })
      : { dispose() {} };
    // Stream 4 round four — paw prints (render/pawprints.js). After the same
    // scans as the grass, for the same reason (1 main-pass draw, 0 shadow).
    // Purely local: no wire event, and never walkRng. The den gets the stub.
    // The birthday (ui/party.js): while this save's party is on, the prints
    // glitter and two balloons follow her (render/partyballoons.js: 2 draws,
    // 0 shadow). This device only: nothing goes on the wire.
    const partyWalk = birthdayPartyOn(progression);
    const paws = createPawPrints(scene, { areaId, areaData, tier, glitter: partyWalk, reducedMotion });
    const balloons = createPartyBalloons(scene, { on: partyWalk, areaId, areaData, ground, reducedMotion, dusk: !!duskLookNow });
    // Swimming's splashes, ripples, wake and shake spray (render/splash.js):
    // two pooled draws, 0 while no cat is in water; the den gets NO_SPLASH.
    const splash = createSplash(scene, { areaData, tier, reducedMotion });
    // Polish-water — the water's edge (render/waterdress.js): a soft wet-earth
    // band and foam line along the real shore, a few half-sunk stones. Here
    // for the grass's reason: after the caster sweep, the contact-shadow scan
    // and the prop merge, so it is neither decaled nor merged and casts
    // nothing (at most 3 main-pass draws, 0 shadow). Areas without dressed
    // water (the den, the park, the docks, the gorge) get the no-op stub.
    // Polish-waterlife — the water warms at sunset and darkens at dusk, and
    // the foam goes quiet at dusk (water.js eveningWater; waterdress `evening`).
    const evening = duskLookNow ? 'dusk' : weather.condition === 'sunset' ? 'sunset' : null;
    eveningWater(areaData.waterFx ?? [], evening);
    splash.setEvening(evening);
    const waterDress = createWaterDressing(scene, { areaId, areaData, tier, reducedMotion, keepOut: grassKeepOut, evening });
    // Polish-waterlife — now and then a little silver fish leaps from a lake
    // (render/fishjump.js): 1 draw only while one is in the air, 0 shadow.
    const fish = createFishJumps(scene, { areaId, areaData, tier, reducedMotion, splash, cat, camera });
    // Polish-light — warm pools of lamp light on the ground at dusk
    // (render/dusk.js). Here for the grass's reason: after the contact-shadow
    // scan, the caster sweep and the prop merge (+1 main-pass draw, 0 shadow).
    // endWalk's scene traversal disposes it.
    if (duskLookNow && !isDen) createLampPools(scene);
    // Stream 4 round four — ambient life (render/ambient.js): one Points mesh,
    // one draw, no shadow draws; created here for the same reason as grass.
    // Purely local and off its own random stream, never walkRng. The den and
    // reduced motion get the module's no-op stub. keepOut: the grass's own
    // keep-out circles, so a resting leaf never covers a toy or a golden
    // mouse. weather: read live, so a shower's leaves dim and its fluff hides
    // until the rain stops.
    const ambient = createAmbient(scene, {
      areaId, areaData, tier, camera, dusk: eveningLook, reducedMotion, cat,
      keepOut: grassKeepOut, weather,
    });

    // No goals in the den (Task 7.2; the Old House has its own, D11) — session.goals stays null and every
    // consumer below (noteGoal's `!session?.goals` guard, hud.setGoals,
    // endWalk's goalsDone/summary) treats a null goals as "this walk has no
    // goal HUD" rather than crashing on it.
    const goals = isDen ? null : createGoals(walkRng, areaData);
    if (resume) restoreGoals(goals, resume.goals, GOAL_POOL);
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
    // The yarn goal's how-line says where today's ball lies (its {place}).
    for (const g of goals?.goals ?? []) {
      if (g.id === 'yarn-play' && yarnSpot) g.howSlots = { place: yarnSpot.where };
    }
    // A lesson holds the goals aside (one instruction at a time): they are
    // rolled as always, above, and shown when the lesson is over or skipped.
    // Never in a room, where the goal the two share must stay live.
    const holdGoals = !!lesson && !lesson.finished && roomSeed === undefined && !!goals;
    if (holdGoals) lesson.heldGoals = goals;

    // The area's own life on this walk (the Gorge: shade by height, wheeling
    // birds, the ambience mix; the caves' dark, warm glow and rain shelter,
    // which is why it takes the weather). Long after weather and dusk have set the sun,
    // so their values are the base it shades; built here, beside the session
    // that holds it, so little can throw between its birds joining the scene
    // and endWalk being able to dispose them. Its birds are noCast and cast no
    // shadow of their own (built after the caster sweep); the cave glow is a
    // PointLight with castShadow false, added here so shaders compile with it
    // once. Draws on no rng. The Rooftops' life also takes the walk's critters,
    // to move its birds, and how many walks she has had there.
    const areaLife = areaData.life?.({ scene, sun, fill, ground, reducedMotion, audio, weather, dusk: eveningLook, critters, visits: state.walks[areaId] ?? 0, log, hud, toy }) ?? NO_AREA_LIFE;
    const session = createSession({
      scene, areaData, ground, cat, critters, strayCats, remotes, collectibleMeshes, duskMode,
      farm,
      fair: fairLive,
      traversal: traversalLive,
      // Clan Life Part 1: the territory's clan, a list apart from the strays.
      clanCats,
      campMarker,
      // Border posts for the corner map: null in the den and in Legacy.
      postMarkers: dressing ? postsFor(areaId).map(({ x, z, faces }) => ({ x, z, faces })) : null,
      // World map step 3: the gates (or NO_GATES), the gate she came in by
      // (walkOn sets it), and no walk-on under way yet.
      gates,
      arrivedVia: null,
      walkingOn: false,
      // The room walk's seed (undefined solo), which a walk-on derives the
      // next room walk's from, and the removers of this walk's net handlers.
      roomSeed,
      netOffs: [],
      // Per-walk pay caps for the clan verbs (interactions.js CLAN_PAY_CAP).
      clanPaid: { friend: 0, boop: 0, patrol: 0 },
      // Task 6: the clanmate on patrol with me, or null (interactions.js).
      clanBuddy: null,
      // v18 Task 1.4: the walk was ACTUALLY dusk (duskMode gated on the glow
      // collar for solo walks — see where walkDusk is called above).
      // countsDusk is what endWalk credits to the duskWalks tally that Night
      // Eyes reads (on the Rooftops, always evening, only with the Glow
      // Collar on); duskMode alone would credit a dusk walk the player never
      // got.
      duskActive,
      countsDusk,
      useComposer: tier.postFx,
      tier,
      ghosts: NO_GHOSTS,
      denCats,
      walkStamp,
      // Mid-walk resume (walkresume.js): the solo walk's seed, and how many
      // times picking this walk up has failed (main.js clears it once it runs).
      soloSeed,
      resumeTries: 0,
      // v21 Stream 2: solo, or a room whose every other member is my colony
      // partner (computed beside createStrayCats). Gates the live
      // 'colony-feed' event in game/interactions.js's feedStray.
      colonyWalk,
      netSendAccum: 0,
      // read once per walk (not per frame) so the zoomies trail's reducedMotion
      // gate doesn't re-query settings 60x/sec in the render loop.
      reducedMotion,
      zoomTrailAccum: 0,
      wasZooming: false,
      goals: holdGoals ? null : goals,
      lesson,
      startPoints: state.points,
      discoveryCount: 0,
      catsGreeted: 0,
      rankTitle: rankFor(state.lifetimePoints).title,
      weather,
      areaLife,
      fx: createFx(scene, { reducedMotion }),
      // The area's water surfaces, bundled into the one { update, dispose }
      // shape the session already uses. Safe on an area with no water at all
      // (the neighborhood, the den), which is why the render loop and endWalk
      // can each call it unconditionally.
      water: waterRig(areaData.waterFx),
      waterDress,
      // Built above, before the world, so the area could register into it.
      wind,
      // Lawn tufts, same shape again; updated beside wind in the render loop.
      grass,
      duskLawn,
      paws,
      balloons,
      splash,
      fish,
      // Stream 4 round four — drifting sky clouds (render/clouds.js), same
      // shape again: one InstancedMesh, built here after the caster sweep and
      // the prop merge so neither sees it. Laid out from a per-area seed, never
      // walkRng; the den gets the no-op stub. Tints itself from scene.fog,
      // in the sunset palette on a sunset-weather walk.
      clouds: createClouds(scene, {
        areaId, tier, camera, reducedMotion, dusk: eveningLook,
        sunset: weather.condition === 'sunset',
        centre: { x: (areaData.bounds.minX + areaData.bounds.maxX) / 2, z: (areaData.bounds.minZ + areaData.bounds.maxZ) / 2 },
      }),
      ambient,
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
      // gives co-walk clients the same flock headings and gaps without
      // touching walkRng (only roughly in time: each client's timer runs on
      // its own frame dt — see main.js's slow-mo note).
      // Indoor den: no sky to animate — a no-op stub keeps the render loop's
      // unconditional session.skyLife.update()/dispose() calls safe.
      skyLife: indoor ? { update() {}, dispose() {} } : createSkyLife(scene, {
        rng: mulberry32(((roomSeed ?? (Math.random() * 2 ** 31)) >>> 0) ^ 0x5eaf00d),
        reducedMotion,
        // the flock's height: the area's own (the Gorge flies it over its
        // rims), else skylife's default 14
        birdY: areaData.skyBirdY,
      }),
      secrets,
      tippables,
      knockables,
      pushThroughs,
      rests,
      rest: null,
      carry,
      playerMarks,
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
      enemies: createEnemyWalkLog(resume?.enemies),
      scent,
      quest, questGiver, questObject,
      walk: { carried: 0, carryCap: equipped.back === 'backpack' ? 3 : 2 },
      momentTimer: 40,
      activeMoment: null,
      prompt: null,
      lastPromptKind: null,
      balkedPuddles: new Set(),
      toy, batCount: 0, batReady: true, yarnSpot,
      // seconds the yarn ball has been somewhere no cat can reach (avatar.js)
      yarnStuck: 0,
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
      perchHold: null,
      pounceTime: 0,
      pounceCooldown: 0,
      landTime: 0,
      stepPhase: 0,
      slowmoTime: 0,
      pose: 'follow',
      stretchTime: 0,
      sniffTime: 0,
    });
    setSession(session);
    // The birthday Gathering, now that the walk's fx and HUD are here. A
    // birthday visit to a Pines she has not opened is not counted as a Pines
    // walk (endWalk), so her progress stays as it was.
    session.birthday = bdayPlan ? bdayLife.createBirthdayGathering(scene, bdayPlan, {
      name: birthdayCatName(state),
      showNames: isClanEdition(state),
      reducedMotion,
      ground,
      burst: (p, colour, n, o) => session.fx?.burst?.(p, colour, n, o),
      toast: (text) => hud.toast(text),
      onBlown: () => noteCandlesBlown(),
      boom: () => audio?.firework?.(),
      onPhoto: () => takeBirthdayPhoto(session),
      pixelRatio: renderer?.getPixelRatio?.() ?? 1,
    }) : null;
    session.birthdayVisit = (!!birthday || bdayOn) && !bdayCountsWalk(state, areaId);

    // golden mice: personal, position-static, award-local — no wire events,
    // so this is co-walk safe without touching walkRng or session.net at
    // all. areas without an entry in GOLD_MICE (none currently, but future
    // areas like the den) get an inert stub instead of a lookup throw. The
    // Old House hands its own (areaData.goldMice, outside GOLD_MICE).
    session.goldMice = (areaId in GOLD_MICE || areaData.goldMice)
      ? createGoldMice(scene, areaId, new Set(progression.state.golden), {
        ground, rng: ownStream(roomSeed ?? soloSeed, GOLD_PHASE_SALT), list: areaData.goldMice,
      })
      : NO_GOLD_MICE;

    // Found outfits: this walk's one find (foundwear/), planned off its own
    // salted stream from the walk's seed, never walkRng: the room seed on a
    // co-walk, so both devices put it on the same spot in the same place
    // (areaId is the room's, a Legacy child's areaOverride into the Woods
    // included), against the room as it is now with her own key in it. None
    // in the den, on the guided first walk, in a place with no spots, or in a
    // room whose members do not all carry the same key. Built after the
    // shadow sweep, so it is never a caster. The chime plays from onNear.
    const findPlan = planFind({
      areaId, isDen, lessonKind: lessonPlan?.kind ?? null, seed: roomSeed ?? soloSeed,
      roster: roomSeed !== undefined ? roomFindRoster(roomAtStart?.roster ?? [], pid) : null,
    });
    session.find = findPlan
      ? createFind(scene, {
        plan: findPlan,
        item: pickFindItem(foundWearIn(areaId), progression.state.unlocked.accessories, findPlan.roll),
        ground, reducedMotion, onNear: () => audio.findChime?.(),
      })
      : NO_FIND;

    // v21 3b Task 12 — the rival border marks I scented over on earlier walks,
    // by saved id (`<area>-border-<ring>`), read here, BEFORE the rival slice
    // below: that slice stays free of the save (its 3a test scans it), and
    // only ever sees this set of ids.
    const myBorderIds = new Set(progression.marksIn(areaId).filter((m) => m.kind === 'border').map((m) => m.id));

    const picks = picksOf(progression.state);
    const clanHome = clanHomeFor(areaId, progression.state.edition, picks);
    session.clanHome = clanHome;
    session.clanEdition = isClanEdition(progression.state);
    // Intruders (Clan Life Part 2): a neighbouring clan's warrior crossing this
    // territory, from the wall clock alone. Built after the shadow sweep, so
    // each visit's cat is swept on its own; its contact shadow follows the
    // intruders' one anchor, registered once per walk.
    session.intruders = castFor(areaId).length && !isDen ? createIntruders(scene, areaId, {
      reducedMotion,
      showNames: isClanEdition(state),
      hostile: (clan) => isHostile({ clan }, { clanHome, picks }),
      onNotice: () => audio.hiss(),
      onBuild: (g) => { assignShadowCastersFor(g); },
      ground,
      scarsFor: (id) => progression.intruderScars(id),
    }) : NO_INTRUDERS;
    if (session.intruders.anchor) decals.follow(session.intruders.anchor, INTRUDER_DECAL_RADIUS);
    // Fight moves and scars: the fight's record (game/fightrecord.js) is the
    // only fight code holding progression; the fight gets its two callbacks
    // and a reader of the moves she owns, both built here, outside its slice.
    const fightRecord = createFightRecord({
      progression, hud, scarKey: myScarKey,
      setMyScars: (scars) => setCatScars(cat, scars),
      setIntruderScars: (visit, scars) => session.intruders.setScars(visit, scars),
      onScarsChanged,
    });
    const ownedMovesNow = () => progression.ownedMoves();
    // The clan fight (Part 2, Task 4): only at home, over these intruders. It
    // is given no progression; it stands only on the clan cats' own ground
    // (ruling R3). The sheet's buttons and keys call back into it.
    session.clanFight = session.clanHome && session.intruders !== NO_INTRUDERS ? createClanFight({
      intruders: session.intruders,
      ui: createFightUi(document.getElementById('hud'), {
        onFight: () => session.clanFight.startFight(),
        onBackOff: () => session.clanFight.backOff(),
        onMove: (m) => session.clanFight.answer(m),
      }),
      audio, fx: session.fx, hud, log, areaId, walkStamp, playerId: pid,
      playerSpecial: PERSONALITIES[cat.userData.breed]?.special,
      reducedMotion, isGround: clanWalkable, player, runSpeed: pace, clanHome, picks,
      sendEvent: (ev) => session.net?.sendEvent(ev),
      terrain: ground,
      // Everyone fights in actions (Hagrid as a hen); Hagrid is never scarred (R6).
      actions: true, scars: active.breed !== 'hagrid', ownedMoves: ownedMovesNow, ...fightRecord,
      measureCat: catDims,
    }) : NO_CLAN_FIGHT;
    // The trees' shapes (src/fightcam.js), read once per walk from their tags
    // and shared by the fight camera and the tree fade. The den has none.
    const occluders = isDen ? [] : findOccluders(scene);
    // The tree fade (src/treefade.js): a tree, lamp post or building between
    // the walk camera and the cat, or round the camera, turns see-through. The
    // fight camera keeps `occluders` alone. Materials only, never `visible`.
    // The den: an empty list, so the render loop's unconditional calls are
    // no-ops.
    session.treeFade = createTreeFade(isDen ? [] : [...occluders, ...findFadeOccluders(scene)], { reducedMotion });
    // Compile the faded trees' shaders now, not at the first fade mid-walk.
    if (typeof renderer?.compile === 'function') session.treeFade.prewarm(() => renderer.compile(scene, camera));
    // Bigger areas: an area's strips (areaData.strips, only with the switch on),
    // and its core's scatter, are drawn tile by tile near the cat
    // (render/striptiles.js, world/streamcore.js). Here, after
    // the caster sweep, the contact-shadow scan, the prop merge and the tree
    // fade, each of which a streamed tree joins on its own when it is built.
    // No strips: the no-op of the same shape.
    session.stripTiles = createStripTiles(scene, {
      strips: isDen ? [] : areaData.strips ?? [],
      wind, decals, occluders, reducedMotion,
      treeFade: () => session.treeFade,
      tier: () => session.tier,
      now: () => performance.now(),
      compile: typeof renderer?.compile === 'function' ? () => renderer.compile(scene, camera) : null,
    });
    // Step 2 ("the 65 m approach"): the core's scatter is streamed too, so the
    // walk starts with what is round the cat already drawn, not growing in.
    session.stripTiles.settle(cat.position.x, cat.position.z);
    // Plants that lean away from the cat as it walks through (render/rustle.js):
    // the Moor's heather. Visual only; none in most areas.
    session.rustle = createRustle(scene, { reducedMotion });
    onClanBuddyEnd = (cat, reason, secs) => endClanPatrol(session, cat, reason, secs);

    // The rival's border and its patrol (v21 Stream 3a). Built per walk, like
    // goldMice above; the den has no rival, so everything is a no-op there.
    // Only the LOCAL cat is ever chased: session.cat is passed to update, a
    // partner's remote cat never is, and the patrol's position comes from the
    // shared wall clock (rivalcats.patrolAt), so nothing goes over the network.
    //
    // THE CHASE TAKES NOTHING. This branch calls no progression, colony,
    // discoveries or points function: it moves the cat, shows one toast, and
    // that is all (spec section 10.1; rivalcats.js is pinned the same way).
    // The picks only choose the clan's name.
    // No patrol in Legacy: no border decals, border-mark prompt or mark
    // contest, so a Legacy walk writes no clan field.
    // At home, your clan's camp has no hostile patrol: intruders take its
    // place (owner's decision 2026-10-31, superseding pick-your-clan's D7 for
    // the clan-life era). Everywhere else today's patrol rules stand.
    // The border patrol fight: the patrol asks this before it chases (set to
    // the border fight's pill below, once that exists).
    let borderIntercept = () => false;
    // Away fights (2026-11-19): while one of the camp's roaming cats is
    // squaring up to her or chasing her off, the patrol neither chases nor
    // squares up (set below, with the away fight).
    let awayBusy = () => false;
    if (isDen || clanHome || !rivalForWalk(areaId, progression.state.edition, picks)) {
      session.rival = NO_RIVAL;
    } else {
      // maxMarks is an upper bound: the ring stays even, so 12 marks become 6.
      const marks = createBorderMarks(scene, areaId, tier.name === 'low' ? { maxMarks: 8, ground } : { ground });
      // My saved paws (Task 12) turn their decals pale from the first frame.
      // A saved id names the RING index; the low tier draws only every other
      // ring point, so each drawn decal is matched by its own `ring` and
      // contested by its list index (a ring point this tier does not draw has
      // no decal to turn).
      marks.list.forEach((m, i) => {
        if (myBorderIds.has(borderMarkId(areaId, m.ring))) marks.setContested(i);
      });
      // Walkable = player.js's own predicate (bounds, colliders, water).
      const isWalkable = (x, z) => isWalkableAt(areaData, x, z);
      const patrol = createRivalPatrol(scene, areaId, {
        picks,
        reducedMotion,
        isWalkable,
        ground,
        canChase: () => chaseAllowed(player, session) && !awayBusy(),
        onChase: (who) => {
          player.halt();
          session.chasing = true; // avatar.js plays the run gait; interactions.js ignores climb/pounce
          hud.toast(phrase('border.chasedBack', who));
          bus.emit('tip', { id: 'rival' });
        },
        onSettled: () => { player.halt(); session.chasing = false; },
        // The border patrol fight (B1): the warrior on patrol, chosen above.
        foe: borderFoe ? { member: borderFoe, scars: borderScars, showNames: isClanEdition(state) } : null,
        intercept: () => borderIntercept(),
      });
      session.rival = {
        // `t` (the render clock) is for the marks' pulse only; the patrol
        // reads the shared wall clock itself.
        update(dt, t, catPos, avatar) {
          marks.update(t);
          patrol.update(dt, catPos, avatar);
        },
        dispose() { marks.dispose(); patrol.dispose(); },
        // Task 12: where the patrol cat is (the contest below reads it), and
        // the decals (interactions.js's 'border-mark' prompt reads them).
        patrolPos: () => patrol.pos,
        borderMarks: marks,
        // The border patrol fight: the fight's interface (null without a
        // warrior) and today's chase on demand.
        foe: patrol.foe,
        chaseNow: () => patrol.chaseNow(),
      };
    }

    // v21 3b Task 12 — the rival clan scents over my marks near its border.
    // Its own block, after the rival slice above, which never touches the
    // save. A few times a second (markcontest.js) it reads where the patrol
    // cat is and flags each scratch, dig or drop of mine it has reached as
    // contested: never deleted, nothing paid or taken, no randomness, nothing
    // on any wire. Its one toast waits while a chase is on (session.chasing,
    // set and cleared by the patrol's onChase / onSettled above), so it never
    // lands on top of the chase toast. Driven from session.rival.update, the
    // call the render loop already makes every frame; the den has none.
    if (session.rival.borderMarks) {
      const contest = createMarkContest({
        picks,
        areaId, progression, playerMarks,
        patrolPos: session.rival.patrolPos,
        isChasing: () => session.chasing === true,
        toast: (text) => hud.toast(text),
      });
      const rivalUpdate = session.rival.update;
      session.rival.update = (dt, t, catPos, avatar) => {
        rivalUpdate(dt, t, catPos, avatar);
        contest.tick(dt);
      };
    }
    // The border patrol fight (2026-11-04): away from home, the camp's border
    // patrol warrior can be fought (game/borderfight.js). Home and away never
    // both have a fight, so there is only ever one pill. Built here, after the
    // rival slice above (which holds no progression): its record is its own,
    // and a win scars the patrol warrior, a loss my cat, as at home.
    if (session.rival.foe && session.clanFight === NO_CLAN_FIGHT) {
      const borderRecord = createFightRecord({
        progression, hud, scarKey: myScarKey,
        setMyScars: (scars) => setCatScars(cat, scars),
        setIntruderScars: (visit, scars) => session.rival.foe.setScars(visit, scars),
        onScarsChanged,
      });
      // Away fights (2026-11-19, game/awayfight.js): a cat with a clan, in
      // another clan's territory (never her co-walker's: `picks`), can be
      // challenged by that clan's roaming cats too. The walk's book of them
      // (who decided what, her wins, the waits) is on the session for the
      // resume note; it holds no progression.
      const awayOn = clanCats !== NO_CLAN_CATS && awayAllowed({
        areaId, mine: picks[0] === state.clanPick?.mine ? picks[0] : null, picks, edition: progression.state.edition,
      });
      const awayLedger = awayOn ? createAwayLedger({ seed: roomSeed ?? soloSeed, restore: resume?.away }) : null;
      session.awayFights = awayLedger;
      // One pill and one sheet for both fights: only one is ever up.
      const fightUi = createFightUi(document.getElementById('hud'), {
        onFight: () => session.clanFight.startFight(),
        onBackOff: () => session.clanFight.backOff(),
        onMove: (m) => session.clanFight.answer(m),
      });
      const fightOpts = {
        ui: fightUi,
        audio, fx: session.fx, hud, log, areaId, walkStamp, playerId: pid,
        playerSpecial: PERSONALITIES[cat.userData.breed]?.special,
        reducedMotion, isGround: clanWalkable, player, runSpeed: pace, picks,
        terrain: ground,
        actions: true, scars: active.breed !== 'hagrid', ownedMoves: ownedMovesNow,
        measureCat: catDims,
      };
      const borderFight = createBorderFight({
        ...fightOpts,
        patrol: session.rival,
        sendEvent: (ev) => session.net?.sendEvent(ev),
        ...borderRecord,
        // A win over the patrol counts toward the roaming cats' reluctance.
        onWon: (r) => { borderRecord.onWon(r); awayLedger?.addWin(); },
      });
      session.clanFight = borderFight;
      borderIntercept = () => borderFight.uiShowing !== null || (!awayBusy() && borderFight.wouldChallenge(session));
      if (awayLedger) {
        let awayFight = NO_CLAN_FIGHT;
        const foes = createAwayFoes({
          clanCats, ledger: awayLedger, terrain: ground, reducedMotion,
          // A cat notices or challenges her only on the clan's own ground
          // outside the camp ring (the ring is the patrol's), with nothing
          // else going on: everything the patrol's chase waits for, and no
          // patrol offer up.
          canStart: (s) => chaseAllowed(player, s) && !player.inWater && !s.perched && !s.crossing
            && borderFight.uiShowing === null
            && !isTrespassing(areaId, s.cat.position.x, s.cat.position.z)
            && clanWalkable(s.cat.position.x, s.cat.position.z) === true,
          canChase: (s) => chaseAllowed(player, s),
          engaged: () => awayFight.uiShowing !== null,
          // The chase-off sets her down only where she could have walked:
          // every half metre of the way is walkable, outside the camp ring,
          // and (raised ground) no rim is crossed.
          landingOk: (from, x, z) => {
            if (isTrespassing(areaId, x, z)) return false;
            const n = Math.max(1, Math.ceil(Math.hypot(x - from.x, z - from.z) / 0.5));
            for (let i = 1; i <= n; i++) {
              if (!isWalkableAt(areaData, from.x + ((x - from.x) * i) / n, from.z + ((z - from.z) * i) / n)) return false;
            }
            return ground.flat || ground.canStep(from.x, from.z, x, z);
          },
          onDecide: (c, decision, wins) => {
            if (decision === 'pass') hud.toast(phrase(wins > 0 ? 'away.wary' : 'away.pass', c.name));
          },
          onChase: (who) => {
            player.halt();
            session.chasing = true;
            hud.toast(phrase('away.chasedOff', who));
          },
          onSettled: () => { player.halt(); session.chasing = false; },
          // The challenger's fight dims, read as my own cat's are (catDims
          // measures in the cat's own frame, wherever it stands).
          measure: (g) => catDims(g),
          setScars: (g, scars) => setCatScars(g, scars),
        });
        const awayRecord = createFightRecord({
          progression, hud, scarKey: myScarKey,
          setMyScars: (scars) => setCatScars(cat, scars),
          setIntruderScars: (visit, scars) => foes.foe.setScars(visit, scars),
          onScarsChanged,
        });
        awayFight = createAwayFight({ ...fightOpts, foes, ...awayRecord });
        awayBusy = () => foes.busy;
        session.clanFight = joinFights(borderFight, awayFight, foes);
      }
    }
    // The fight camera (src/fightcam.js): no tree hides either cat in a fight.
    // Null where no fight can happen (built after the border fight, so it is
    // there too).
    session.fightCam = session.clanFight !== NO_CLAN_FIGHT ? createFightCam({ occluders, colliders: areaData.colliders, bounds: areaData.bounds, reducedMotion, lookY: CAT_LOOK_Y, ground }) : null;
    // A walk picked up again (never the den) says so instead.
    const welcome = resume
      ? resumeWelcome(placeName(areaId, progression.state.edition, CATALOG) || areaData.name)
      : isDen ? null : homeWelcome(areaId, progression.state);

    // v21 3b Task 16 — The dog in its yard. One per outdoor area (propsets.js's
    // dogYard; the den has none, so this is the inert NO_DOG there). Trot onto
    // its lawn and it barks and chases you off, the rival patrol's scamper
    // over again; stalk in and you get halfway to its kennel first. A fearless
    // or steady cat is only barked at, as the shipped bark-freeze spared them.
    // The same gate as the rival (chaseAllowed): never a perched cat, never in
    // photo mode, and never while the rival's chase owns the cat — the two
    // share session.chasing, so they never both write its position.
    //
    // THE DOG TAKES NOTHING. Like the rival's branch, this calls no progress,
    // colony, discoveries or points function: no freeze, no drop (whatever is
    // in your mouth stays there), no marks, no taming. It moves the cat and
    // says one line. Local to this device (nothing on any wire), no
    // randomness. Its kennel is solid; its meshes are freed in endWalk before
    // the scene traversal. Spotting it is updateInteractions' (s.dog.spotPos).
    const fearlessCat = isFearless(PERSONALITIES[cat.userData.breed]?.special);
    // A fearless cat hears the bark every time, and is told so once a walk.
    let shrugged = false;
    const dog = createYardDog(scene, propsFor(areaId).dogYard, {
      reducedMotion,
      isWalkable: (x, z) => isWalkableAt(areaData, x, z),
      ground,
      canChase: () => chaseAllowed(player, session),
      fearless: fearlessCat,
      onBark: () => {
        audio.bark();
        bus.emit('tip', { id: 'dog' });
        if (fearlessCat && !shrugged) {
          shrugged = true;
          hud.toast("The dog barks. You don't even flinch. 😼");
        }
      },
      onChase: () => {
        player.halt();
        session.chasing = true; // avatar.js plays the run gait and ends a rest; interactions.js ignores climb/pounce
        hud.toast('Woof! The dog chased you off its lawn! 🐕');
      },
      onSettled: () => { player.halt(); session.chasing = false; },
    });
    for (const c of dog.colliders) areaData.colliders.push({ ...c });
    if (dog.group) decals.follow(dog.group);
    session.dog = dog;

    // lost-kitten quest chain: solo walks only (roomSeed === undefined) — a
    // co-walk kitten would desync the shared canon since it's driven by
    // this device's own progression.state.kitten.stage. A no-op stub (same
    // shape as goldMice's above) covers every other case: co-walks, and
    // solo walks where kittenPlan has nothing to offer this stage/area.
    // At home she circles the area's kitten spot (areaData.kittenHome: the
    // Old House's hall, clear of its shut front door), else its spawn.
    const kittenPlanResult = roomSeed === undefined
      ? kittenPlan(progression.state.kitten.stage, areaId)
      : null;
    session.kittenEnc = kittenPlanResult
      ? createKittenEncounter(scene, kittenPlanResult, areaData.kittenHome ?? areaData.spawn, { onMew: () => { if (!lessonOpen(session)) audio.trill(0.7, 1.5); }, ground })
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
    // The Gorge ships a fixed, ordered climb course (areaData.raceCourse): the
    // random daily course would send kids up and down the path. It is fixed
    // data, so both co-walkers agree, and it draws nothing from walkRng (the
    // daily course never did either: it has its own date-seeded stream).
    session.race = areaData.raceCourse
      ? createRace(scene, areaData.raceCourse, areaData.spawn, { ground, kind: 'climb', dusk: !!duskLookNow })
      : walkPois.length >= 5
      ? createRace(scene, raceCourse(walkPois, seedFromCode(today + '-' + areaId)), areaData.spawn, { ground, dusk: !!duskLookNow })
      : { state: 'idle', timeMs: 0, currentRing: 0, rings: [], pad: null, update() {}, promptAt: () => null, begin() {}, dispose() {} };
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
      bus.emit('tip:did', { id: 'chat' });                     // she knows how to say something
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
    // Only in a walk together (controls review, 2026-11-19): alone there is
    // nobody to talk to, and the button was one more thing on a small screen.
    chatWheel.setVisible(!!session.net);
    // The chat hint, once per walk (startWalk runs once per walk). It waits
    // on the session like the arrival line: under the Ready? card a toast is
    // never seen. main.js toasts chatHintLine on the first engage. Only on a
    // player's first TOUCH_HINT_WALKS walks (the touch controls hint's rule);
    // the touch buttons' word labels follow the same rule.
    const earlyWalk = Object.values(state.walks).reduce((n, w) => n + w, 0) < TOUCH_HINT_WALKS;
    // Only in a room: alone there is nobody to chat to (guided-first-walk
    // design, section 4). roomSeed is what makes this walk a room's.
    session.chatHintPending = earlyWalk && roomSeed !== undefined;
    // Each touch button keeps its small word until it has been used twice
    // (ui/buttonwords.js, counted by main.js), not for a fixed three walks.
    touchUI.setLabels?.(buttonUses ? buttonUses.words() : earlyWalk);
    // R18: moves the save granted on load (fights she won before moves
    // existed) are toasted once, at the next Clan Edition walk. The lines wait
    // on the session (the Ready? card covers toasts); main.js toasts them on
    // the first engage (takeMoveLines).
    session.moveLines = isClanEdition(state) ? progression.takeNewMoves().map(unlockToast) : null;

    if (session.net) {
      const net = session.net;
      // A hidden visitor ("Hide this visitor", src/blocklist.js) is never
      // drawn or named, and netevents.js shows nothing she sends.
      session.isBlocked = (id) => blockList.has(id);
      // Who was here when the walk began; anyone after that is toasted, so a
      // child always knows who has come into her walk.
      let rosterSeen = null;
      // The roster as last heard (net.onRoster replays it at once), for a
      // co-walker drawn again by its state below.
      let rosterNow = [];
      // Every handler's remover is kept (session.netOffs): freeWalk takes them
      // all off, so a room kept for a walk-on hands nothing to this walk.
      const keep = (off) => { if (typeof off === 'function') session.netOffs.push(off); };
      keep(net.onRoster((roster) => {
        const session = getSession();
        if (!session) return; // presence sync can land after endWalk tore the session down
        rosterNow = Array.isArray(roster) ? roster : [];
        const liveIds = new Set(roster.filter((p) => !blockList.has(p.playerId)).map((p) => p.playerId));
        for (const r of remotes.list) {
          if (!liveIds.has(r.playerId)) { remotes.remove(r.playerId); session.intruders.dropHolder(r.playerId); }
          if (!liveIds.has(r.playerId)) session.rival.foe?.dropHolder(r.playerId);
        }
        // Found outfits: a member who does not carry this build's key (an
        // older build joining mid-walk) ends the find for the rest of the
        // walk: finds never show for one child only.
        if (!session.find.taken && !findsAgreed(roomFindRoster(roster, session.playerId))) {
          session.find.dispose();
          session.find = NO_FIND;
        }
        const firstSync = rosterSeen === null;
        rosterSeen ??= new Set();
        for (const p of roster) {
          if (p.playerId === session.playerId) continue; // don't render yourself as a remote pet
          if (!liveIds.has(p.playerId)) continue;
          const entry = remotes.upsert(p, nowSec());
          if (!rosterSeen.has(p.playerId)) {
            rosterSeen.add(p.playerId);
            if (!firstSync) hud.toast(`${entry.petName} joined in 🐾`); // sanitized by remotecats
          }
        }
        hud.setRoster(remotes.list.map((r) => r.petName));
        session.chatWheel?.refresh();
      }));
      keep(net.onState((state) => {
        const session = getSession();
        if (!session) return; // a state can land after endWalk tore the session down
        if (state.id === session.playerId) return; // explicit self-filter; applyState is a no-op for us anyway
        // World map step 3: a co-walker in another place (a walk-on a moment
        // ahead or behind) is not drawn here. An older build sends no area.
        if (!stateIsHere(state, session.areaId)) return;
        // F6: a co-walker whose device was still loading its place sent no
        // state, so its cat went after remotecats' DESPAWN_AFTER, and its
        // presence never changed, so no roster sync brings it back. Its first
        // state draws it again from the roster, where it is. State for anyone
        // not in the roster, or hidden, is still dropped (applyState ignores
        // an id it has no cat for).
        if (!remotes.list.some((r) => r.playerId === state.id) && !blockList.has(state.id)) {
          const p = rosterNow.find((m) => m?.playerId === state.id);
          if (p) {
            remotes.upsert(p, nowSec());
            hud.setRoster(remotes.list.map((r) => r.petName));
            session.chatWheel?.refresh();
          }
        }
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
      }));
      keep(net.onEvent((ev) => applyRemoteEvent(getSession(), ev)));
      keep(net.onChat((msg) => {
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
      }));
    }

    // Ghost visits (Task 4): cross-walk friends occasionally show up as a
    // translucent visitor on a SOLO walk only — a room co-walk already has
    // live remote pets rendered via `remotes`, and ghosts/rooms don't mix
    // (see the plan's "ghosts solo-only" note). Fetching friendships +
    // profiles is unavoidably async, so ghosts pop in a moment after the
    // walk starts; that's fine. Not in an area with no strays (the
    // Rooftops, R8): ghosts.js stands a ghost anywhere over the area's middle
    // at ground level, and there that is inside a pitched roof, the street
    // below or a yard wall.
    if (roomSeed === undefined && MP && areaData.strays !== false) spawnGhosts(session);

    // The corner map, everywhere but the den: the den is one small room and
    // has no map, so session.minimap is null there and every use guards for
    // it. The Old House has one, its floor plan (D12).
    // scenicsVisited is filled by interactions.js's 4 m scenic check and
    // greys out the spots already visited this walk. A tap on the map flips
    // north-up / turning and remembers the choice in the save.
    session.scenicsVisited = isDen ? null : new Set();
    // A walk picked up again: the tallies carry on, and the cat goes back to
    // its spot, looking the way it looked. The spot is cleared like any other
    // (it may have been a roof or mid-river): out of walls and water, onto
    // the ground. Everything that follows the cat catches up on its first frame.
    if (resume) {
      restoreTallies(session, resume, { points: state.points });
      const spot = clearSpot({ x: resume.x, z: resume.z }, areaData.colliders ?? [], areaData.bounds, areaData.waters ?? [], 0.6);
      cat.position.set(spot.x, ground.y(spot.x, spot.z), spot.z);
      player.setViewYaw(resume.yaw);
    } else if (arrive) {
      // Walked on through a gate or a post: she starts just inside the twin,
      // facing in, the spot cleared the same way (the live list holds the
      // gates now). On the first camp walk she faces the camp instead.
      const spot = clearSpot({ x: arrive.x, z: arrive.z }, areaData.colliders ?? [], areaData.bounds, areaData.waters ?? [], 0.6);
      const yaw = lesson?.kind === 'camp' ? lesson.heading : arrive.yaw;
      cat.position.set(spot.x, ground.y(spot.x, spot.z), spot.z);
      cat.rotation.y = yaw;
      player.setViewYaw(yaw);
      camera.position.copy(cat.position).add(cameraOffset(yaw, 0.18, startView.dist, startView.height));
      camera.lookAt(cat.position.x, cat.position.y + CAT_LOOK_Y, cat.position.z);
    } else if (birthday && areaId === BDAY_AREA) {
      // The birthday walk: at the foot of the island bridge, facing along it.
      const spot = clearSpot({ ...BDAY_START }, areaData.colliders ?? [], areaData.bounds, areaData.waters ?? [], 0.6);
      const yaw = headingToward(spot, BRIDGE_ISLAND_END);
      cat.position.set(spot.x, ground.y(spot.x, spot.z), spot.z);
      cat.rotation.y = yaw;
      player.setViewYaw(yaw);
      camera.position.copy(cat.position).add(cameraOffset(yaw, 0.18, startView.dist, startView.height));
      camera.lookAt(cat.position.x, cat.position.y + CAT_LOOK_Y, cat.position.z);
    } else if (lesson?.kind === 'camp') {
      // The first walk on home land: the cat and the camera start facing the camp.
      cat.rotation.y = lesson.heading;
      player.setViewYaw(lesson.heading);
      camera.position.copy(cat.position).add(cameraOffset(lesson.heading, 0.18, startView.dist, startView.height));
      camera.lookAt(cat.position.x, cat.position.y + CAT_LOOK_Y, cat.position.z);
    }
    // A place whose life keeps the view clear (the Old House: its walls sink and
    // its levels are drawn for hers) settles it on this start view at once, so
    // the Ready and "Welcome back!" cards, which run no area life, show her and
    // not a wall. A walk picked up again gets its camera behind her first (the
    // one above is still on the spawn), and she faces the way the note looked,
    // as the arrive branch turns her, so the card shows her from behind and not
    // side-on. No other place's life has a settle.
    if (session.areaLife.settle) {
      if (resume) {
        cat.rotation.y = resume.yaw;
        camera.position.copy(cat.position).add(cameraOffset(resume.yaw, 0.18, startView.dist, startView.height));
        camera.lookAt(cat.position.x, cat.position.y + CAT_LOOK_Y, cat.position.z);
      }
      session.areaLife.settle(cat.position, camera);
    }
    session.minimap = isDen ? null : createMinimap(hud.mapHost, {
      areaId,
      layer: buildMapLayer(areaData, scene),
      mode: progression.state.mapMode,
      getIsTouch,
      onToggle: () => {
        const m = session.minimap.mode === 'north' ? 'turn' : 'north';
        progression.setMapMode(m);
        session.minimap.setMode(m);
      },
    });
    // Whether the map is showing; the render loop hides it while paused.
    session.minimapShown = null;

    log.startWalk();
    // A walk picked up again has already paid for what it paid for.
    if (resume) log.restore(resume.paid);
    // ...and a Farm job it had finished is finished (its hat is at the door).
    if (resume) restoreFarmJobs(farm, { log, carry, area: areaData });
    // ...and a runaway balloon it had caught is not there to catch again.
    if (resume) restoreFairGames(fairLive, { log });
    // ...and the find it had found is not on the ground.
    if (resume) restoreFind(session.find, { log });
    hud.show();
    hud.setArea(placeName(areaId, progression.state.edition, CATALOG) || areaData.name);
    // Kittypets: the arrival line waits for the walk to start (the Ready? card
    // covers the toasts); main.js toasts it on the first engage.
    session.arrivalLine = strayCats.strays.some((s) => s.wanderer) && isClanEdition(progression.state) && !state.colony?.cats?.some((c) => c.name === wanderName) ? wanderArrivalLine(wanderName) : null;
    hud.setPoints(state.points);
    hud.setRank(session.rankTitle);
    hud.setGoals(session.goals ? session.goals.goals : null);
    hud.setLesson?.(lesson?.kind === 'first' && !lesson.finished);
    denShop?.setActive(isDen && roomSeed === undefined); // never in a room walk
    getHomebase().hide();
    session.welcome = welcome;
    // Her cat's picture for the Ready card (and the summary), snapped after
    // the area is built so its throwaway build can't move any draw count.
    session.portrait = herCatPortrait(progression.state);
    // A walk picked up again opens on its "Welcome back!" card, paused.
    session.resumed = !!resume;
    session.started = false;
    overlay.innerHTML = pauseCardFor(session, getIsTouch(), pauseSoundOf(settings));
    overlay.classList.remove('hidden');
    player.enable();
    touchUI.setVisible(getIsTouch());

    catVoice();
    audio.startAmbient(areaId, { dusk: eveningLook, rain: weather.condition === 'rain' });
    // roomSeed (when present) is shared by every player in the room, so a
    // co-walk hears the identical generated song; solo/den walks fall back
    // to a seed derived from this walk's own stamp. Mood mirrors the same
    // dusk/rain/sunset/day branching already used for ambience/lighting
    // above. music.setVolume(0) (pushed by applySettings) makes start() a
    // cheap no-op, so no separate "is music enabled" check is needed here —
    // being muted does NOT skip start(): the scheduler still runs, silenced
    // via music.setMuted()'s gain-zeroing, so unmuting mid-walk resumes
    // instantly instead of waiting for the next walk.
    const musicMood = eveningLook ? 'dusk' : weather.condition === 'rain' ? 'rain' : weather.condition === 'sunset' ? 'sunset' : 'day';
    music.start(roomSeed ?? seedFromCode(walkStamp), musicMood);
    // On touch a new walk starts walking at once: no "Ready?" tap between
    // Start and the cat (a desktop keeps its card, since the first click is
    // what takes the mouse; a walk picked up again keeps its card too). The
    // card's welcome line is toasted instead, and the first few walks get the
    // controls in a line. Last in startWalk: engaging tells main.js the walk
    // has begun, and everything it touches exists by now.
    if (getIsTouch() && !resume) {
      const walked = Object.values(state.walks).reduce((n, w) => n + w, 0);
      // (Not on the guided first walk: its bubble says how to walk.)
      session.startLines = [welcome, walked < TOUCH_HINT_WALKS && lesson?.kind !== 'first' ? TOUCH_START_HINT : null].filter(Boolean);
      player.setTouchEngaged(true);
    }
  }

  // A crossing the last endWalk made, handed to main.js once (takeCrossing).
  let lastCrossing = null;
  function takeCrossing() {
    const c = lastCrossing;
    lastCrossing = null;
    return c;
  }

  // The walk's end, in two halves (world map step 3): bankWalk keeps what the
  // walk earned, freeWalk takes the walk down. endWalk is the two with the
  // summary card between; walkOn below is the two with the gate's moment.
  //
  // bankWalk(session, { together, crossTo, ledBy }) -> what the summary shows.
  // Everything a walk's end does before the teardown, in this order: the walk
  // counted, scars, a crossing's pick, skills, the streak, the profile push,
  // the record, the kitten, what the cat carried home. The session is still
  // live throughout.
  function bankWalk(session, { together = null, crossTo = null, ledBy = null } = {}) {
    // Who was here, read before the teardown below drops the room.
    const walkedWithNames = session.net ? session.remotes.list.map((r) => r.petName) : [];
    // session.areaId is the area actually walked (set in startWalk from
    // areaOverride ?? state.area) — pass it explicitly so a den walk (which
    // never persists state.area) increments walks.den, not whatever other
    // area state.area still points at.
    // Fight moves and scars: a walk fades her scars (R1); when what her cat
    // shows changed, her brother's screen and the cloud profile follow.
    const scarsBefore = JSON.stringify(progression.catScars(scarKey(progression.state)));
    // A new child whose very first walk was with someone else had a person to
    // show them: no guided walk starts by itself after it (the menu's "Play
    // the first walk again" still does).
    if (session.net && progression.state.tutorial?.first === null) progression.setTutorialFirst('skipped');
    progression.completeWalk(session.areaId, { dusk: session.countsDusk, countArea: !session.birthdayVisit });
    if (JSON.stringify(progression.catScars(scarKey(progression.state))) !== scarsBefore) onScarsChanged();
    // A crossing: this walk counted toward the gate above; now pick the place.
    let crossLines = [];
    lastCrossing = null;
    if (crossTo) {
      const clan = isClanEdition(progression.state);
      const out = crossingOutcome({ crossTo, ledBy, together: together ?? walkedWithNames, clan, pick: (id) => pickOnCrossing(progression, CATALOG, id, { guest: !!ledBy }), catalog: CATALOG, edition: progression.state.edition, touch: !!getIsTouch() });
      crossLines = out.lines;
      lastCrossing = { to: crossTo, picked: out.picked, clan };
    }
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
    const walkedWith = together ?? walkedWithNames;
    // kitten stage 2 is transient — set at the end of the "meet" walk (see
    // handleInteract's 'kitten' branch) and promoted to 3 right here, at
    // that same walk's summary, so "Mochi followed you home" lands on the
    // walk where she actually started following.
    const mochiArrived = progression.state.kitten.stage === 2;
    if (mochiArrived) progression.setKittenStage(3);
    // v21 3b — What the cat carried home. Whatever is still in the mouth goes
    // to the den as a keepsake; anything set down somewhere new leaves a
    // private mark here. Marks only: no points, no feat, no wire.
    let broughtHome = null;
    for (const { area, mark } of walkEndMarks(session.carry.mouth, session.areaId, Date.now())) {
      if (progression.addMark(area, mark) && mark.kind === 'den') broughtHome = mark.item;
    }
    // (end of what the cat carried home)
    // The guided first walk's own lines, in place of the goals tile: the walk
    // had a lesson, not goals. The guide's name goes in as text.
    const firstLesson = session.lesson?.kind === 'first' && !session.lesson.skipped ? session.lesson : null;
    const guideName = firstLesson?.stray?.name ?? '';
    const guideLines = firstLesson ? [
      tutorialLine('guide.summary-first'),
      firstLesson.tutorial.did.hello ? tutorialLine('guide.summary-friend', { name: guideName }) : null,
      firstLesson.gift > 0 ? tutorialLine('guide.summary-gift', { name: guideName }) : null,
    ].filter(Boolean) : [];
    return { earned, isRecord, streak, goalsDone, discoveries, friendsGreeted, walkedWith, mochiArrived, broughtHome, guideLines, firstLesson, crossLines };
  }

  // freeWalk(session, { keepRoom }): the whole teardown, in this order. Every
  // way a walk ends comes through here. Without keepRoom the room is left too;
  // a walk-on in a room keeps it for the next walk.
  function freeWalk(session, { keepRoom = false } = {}) {
    // co-walk rooms are per-walk: leaving here means the footer's "Host a
    // walk"/"Join" flow is available again next time everyone's back on the
    // home base screen. Fire-and-forget: endWalk must finish tearing down
    // the scene synchronously regardless of how the network leave resolves.
    // Patrol together: a walk-along still going at walk end just stops and pays
    // nothing (it never reached its end); the co-walker's screen lets the cat go.
    if (session.clanBuddy && session.net) {
      session.net.sendEvent({ v: 1, id: session.playerId, type: 'clan-buddy', catId: session.clanBuddy.id, on: false });
    }
    session.clanBuddy = null;
    // A fight still on ends here, while the room is still joined, so its
    // intruder-done reaches the co-walker (whose intruder would otherwise
    // stand held). Idempotent; solo it sends nothing.
    session.clanFight.abort();
    session.fightCam?.dispose();
    // Puts every tree's own material back before the traversal below frees them.
    // Before the tree fade goes: a strip tree leaving takes its fade entry out.
    session.stripTiles?.dispose();
    session.treeFade?.dispose();

    // This walk's net handlers come off (session.netOffs). A walk-on in a room
    // keeps the room (keepRoom) for the next walk, which wires its own.
    for (const off of session.netOffs ?? []) off();
    session.netOffs = [];
    if (session.net && !keepRoom) {
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
    // A rainy walk ending mid-rain: the ground and the fill go back as found.
    session.weather.dispose?.();
    session.duskLawn.dispose();
    // Hands the sun and fill back and takes the area's birds out, before the
    // traversal below. Every way a walk ends comes through here.
    session.areaLife.dispose();
    // Water frees the normal and roughness maps the traversal below cannot
    // reach (it only looks at `m.map`); wind puts every swayed object back on
    // the rotation — and under the parent — it had before it was registered.
    // Both are idempotent, and the water material would free its own textures
    // off the traversal's dispose() anyway; wiring them explicitly means
    // neither depends on a subtlety of that sweep.
    session.water.dispose();
    session.waterDress.dispose();
    session.wind.dispose();
    // Before the traversal: it takes its mesh out of the scene and frees its
    // geometry and material once.
    session.grass.dispose();
    session.paws.dispose();
    session.balloons.dispose();
    session.splash.dispose();
    session.fish.dispose();
    session.clouds.dispose();
    session.ambient.dispose();
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
    // Before the traversal too: it takes its meshes out of the scene and frees
    // each geometry and material exactly once.
    session.carry.items.dispose();
    session.knockables.dispose();
    session.pushThroughs.dispose();
    session.rests.dispose();
    session.rest = null; // and a nap ends with the walk: no tick, no purr
    session.dog.dispose();
    session.playerMarks?.dispose();
    disposeHenRig(session.cat); // Hagrid's spare body geometry, if he fought
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
    session.farm?.dispose();
    session.fair?.dispose();
    session.traversal?.dispose();
    session.goldMice.dispose();
    session.find.dispose();
    session.rival.dispose();
    session.chasing = false;
    session.kittenEnc.dispose();
    session.race.dispose();
    session.strayCats.dispose();
    session.clanCats.dispose();
    session.birthday?.dispose();
    session.birthday = null;
    session.intruders.dispose();
    session.remotes.dispose();
    session.ghosts.dispose();
    session.denCats.dispose();
    session.gifts.dispose();
    session.chatBubbles?.clear();
    session.chatWheel?.destroy();
    session.minimap?.dispose();
    setSession(null);
    player.disable();
    denShop?.setActive(false);
    hud.hide();
    touchUI.setVisible(false);
    hud.setPrompt(null);
    hud.setObjective(null);
    hud.setCamera(false);
    hud.setGoals(null);
    hud.setLesson?.(false);
    hud.setRoster(null);

    audio.stopAmbient();
    music.stop();
    // Last, after the teardown: what the GPU still holds once the walk is
    // gone, so the perf readout shows a count that creeps up between walks.
    if (renderer) noteMemory(renderer.info);
  }

  // (An Event passed by a stray onclick destructures to all-null: harmless.)
  // Her birthday photo (once per save, birthday.js saveBirthdayPhoto): one
  // frame drawn from a spot looking over the cake at the Watch Rock, so her
  // cat, the cake, the leader and the ring are in it, set in a cream frame
  // and put in her Album. The camera is put back at once; the walk's own
  // frame follows. Skipped headless, with no Album, or once she has it.
  function takeBirthdayPhoto(s) {
    if (!album || album.has?.(BDAY_PHOTO_KEY) || !s?.birthday || !renderer?.domElement || typeof document === 'undefined') return;
    const keepPos = camera.position.clone();
    const keepRot = camera.quaternion.clone();
    try {
      const v = s.birthday.photoView(s.cat.position);
      camera.position.set(v.from.x, v.from.y, v.from.z);
      camera.lookAt(v.at.x, v.at.y, v.at.z);
      camera.updateMatrixWorld();
      composerRig?.renderFrame?.(s);
      const W = 320, H = 240, PAD = 10, FOOT = 30;
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      const ctx = out.getContext('2d');
      const src = renderer.domElement;
      const iw = W - PAD * 2, ih = H - PAD - FOOT;
      // the middle of the view, at the frame's shape
      const sw = Math.min(src.width, src.height * (iw / ih));
      const sh = sw * (ih / iw);
      ctx.fillStyle = '#fff6e6';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, PAD, PAD, iw, ih);
      ctx.fillStyle = '#7a4b2a';
      ctx.font = 'bold 17px Avenir, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${phrase('bday.photo')} 🎂`, W / 2, H - FOOT / 2 - 1);
      if (saveBirthdayPhoto(album, { thumb: out.toDataURL('image/jpeg', 0.72), area: s.areaData?.name ?? '' })) {
        hud.toast(phrase('bday.photoSaved'));
      }
    } catch (err) {
      console.warn('Whisker Walk: the birthday photo failed', err);
      note('ui', err);
    } finally {
      camera.position.copy(keepPos);
      camera.quaternion.copy(keepRot);
      camera.updateMatrixWorld();
    }
  }

  function endWalk({ crossTo = null, ledBy = null, together = null } = {}) {
    const session = getSession();
    if (!session) return;
    onWalkEnded();
    const banked = bankWalk(session, { together, crossTo, ledBy });
    const { earned, isRecord, goalsDone, discoveries, friendsGreeted, walkedWith, guideLines, firstLesson, crossLines } = banked;
    const lines = bankedLines(banked, { html: true });
    const crossHtml = crossLines.map((l) => `<div class="best-line">${escapeHtml(l)}</div>`).join('');
    const guideHtml = guideLines.map((l) => `<div class="best-line guide-line">${escapeHtml(l)}</div>`).join('');
    // Read before the teardown below, like the numbers above.
    const portrait = session.portrait;
    const reduced = prefersReducedMotion(settings);
    const summaryHtml = `<div class="summary-card">
      ${isRecord ? bestWalkConfetti(earned, { reduced }) : ''}
      <div class="screen-panel summary-panel">
      ${portrait ? `<img class="screen-cat" src="${escapeHtml(portrait)}" alt="">` : ''}
      <h1>Home again!</h1>
      <div class="summary-cheer">${escapeHtml(summaryCheer(earned, discoveries))}</div>
      ${lines.best
        ? `<div class="record-banner">${lines.best}</div>`
        : `<div class="best-line">your best: ${progression.state.bestWalk} ${PAW}</div>`}
      ${summaryStatsHtml({ earned, discoveries, friendsGreeted, goalsDone, hasGoals: !!session.goals && !firstLesson })}
      ${guideHtml}
      ${walkedWith.length ? `<div class="best-line">explored with: ${walkedWith.map(escapeHtml).join(', ')}</div>` : ''}
      ${lines.streak ? `<div class="best-line">${lines.streak}</div>` : ''}
      ${lines.mochi ? `<div class="best-line">${lines.mochi}</div>` : ''}
      ${lines.brought ? `<div class="best-line">${lines.brought}</div>` : ''}
      ${crossHtml}
      <button id="btn-summary-continue" class="primary">Continue</button>
      </div>
    </div>`;

    freeWalk(session);

    overlay.innerHTML = summaryHtml;
    countUp(overlay, { reduced });
    overlay.classList.remove('hidden');
  }

  // The summary's own lines for what a walk walked on from banked, for
  // main.js to toast (onWalkedOn): a new best, a streak bonus, the kitten,
  // what she brought home (bankedLines, the summary card's words).
  function arrivalLines(banked) {
    const { best, streak, mochi, brought } = bankedLines(banked);
    return [best, streak, mochi, brought].filter(Boolean);
  }

  // The next walk of a walk-on could not be built (a throw in startWalk at
  // the moment's end): "Off to ..." must not stay up with no way on. As a
  // start whose place did not come, she goes home with the gentle line (the
  // walk just left is already banked, so the save still goes up); a walk
  // left half-built starts the page fresh, as a walk picked up again does
  // (walkresume.js pickUpWalk).
  function cannotStart(err) {
    note('walk', err);
    console.warn('Whisker Walk: the walk-on could not start the next walk', err);
    if (getSession()) { reloadPage(); return; }
    overlay.innerHTML = '';
    overlay.classList.add('hidden');
    try { getHomebase()?.show?.(); } catch (homeErr) { note('walk', homeErr); }
    homeToast(phrase(isOnline() ? 'start.notReady' : 'start.notReadyOffline'));
    onWalkedOn([]);
  }

  // walkOn({ via, ledBy, guest }) -> Promise of 'walked' | 'refused' |
  // 'failed' | 'dropped'. THE one way through a gate (world map step 3) or a
  // border post (Task 10): the walk is banked quietly (no summary), a short
  // "Off to the Farm!" moment shows, and the next walk starts by itself just
  // inside the twin gate or post, or at the spawn for a post with no twin.
  //   - 'refused': no walk, a gate or post this walk does not have (`via`
  //     names a gate end or a post of this walk's place; her own post in
  //     Clan Edition only, a guest's in either), or a walk-on already under way.
  //   - The next place already here (the usual case: it is prefetched as she
  //     nears the gate): banked, freed and the moment up before this returns,
  //     so there is no session right after the call; 'walked'.
  //   - Not here: the walk stays live and paused, the moment shows over it,
  //     and session.walkingOn turns a second walkOn away while the place
  //     comes. When it comes (and the walk is still this one) the walk is
  //     banked and freed, 'walked'; the moment's GATE_MOMENT_MS count from
  //     when it first showed. When it does not, the pause card comes back
  //     with one line (hud.toast: she is still in her walk), nothing is banked
  //     and the page never reloads mid-walk, 'failed'; an online failure for a
  //     place this build has counts toward startWalkWhenReady's fresh start,
  //     on her own solo walk-on only (R14).
  //     A walk that ended (or changed) while it came: 'dropped'.
  // The moment's end starts the next walk with startWalk itself (its place is
  // here), only if no walk has started meanwhile, in the room's next seed
  // when it was a room walk (nextRoomSeed: the same on every device, drawing
  // nothing). A place she owns becomes her place, a free open one is taken
  // (price 0, solo only), and anything else is walked this once
  // (gatecross.js walkOnMove: a walk-on never buys).
  function walkOn({ via, ledBy = null, guest = false } = {}) {
    const s = getSession();
    const plan = typeof via === 'string' ? viaPlan(via) : null;
    if (!s || s.walkingOn || !plan || plan.from !== s.areaId) return Promise.resolve('refused');
    // Border posts stand in Clan Edition only (Task 10): Legacy has none of
    // its own. A guest is never turned away for her edition: a Legacy guest
    // in a Clan host's room follows the host through its post, or the room
    // would split (she already said she has the place).
    const post = postById(via);
    if (post && !guest && !isClanEdition(progression.state)) return Promise.resolve('refused');
    const { to, arrive } = plan;
    const twin = post ? postArrival(via) : (endById(via)?.end.twin ?? null);
    const keepRoom = !!s.net;
    const roomSeed = keepRoom ? nextRoomSeed(s.roomSeed, via) : undefined;
    const duskMode = s.duskMode;
    const momentHtml = gateMomentHtml({ name: placeName(to, progression.state.edition, CATALOG), ledBy });
    const shownAt = Date.now();
    const showMoment = () => {
      overlay.innerHTML = momentHtml;
      overlay.classList.remove('hidden');
    };
    const go = () => {
      onWalkEnded();
      const lines = arrivalLines(bankWalk(s));
      const move = walkOnMove(progression.state, CATALOG, to, { guest });
      if (move === 'set') progression.setArea(to);
      else if (move === 'take' && progression.buy('areas', to)) progression.setArea(to);
      freeWalk(s, { keepRoom });
      showMoment();
      const startsAtMoment = walksStarted;
      setTimeout(() => {
        if (getSession() || walksStarted !== startsAtMoment) return;
        try {
          startWalk({ duskMode, roomSeed, areaOverride: progression.state.area === to ? undefined : to, arrive });
        } catch (err) {
          cannotStart(err);
          return;
        }
        failures = 0;
        const next = getSession();
        if (next) next.arrivedVia = twin;
        // A touch walk has begun at once (its engage toasted its start
        // lines): the lines are toasted now. A desktop walk waits on its
        // Ready? card, which covers toasts, so they wait with its start
        // lines for the first engage (main.js takeStartLines).
        if (next && !next.started && lines.length) {
          next.startLines = [...(Array.isArray(next.startLines) ? next.startLines : []), ...lines];
          onWalkedOn([]);
        } else onWalkedOn(lines);
      }, Math.max(0, GATE_MOMENT_MS - (Date.now() - shownAt)));
    };
    if (areas.loaded(to)) {
      go();
      return Promise.resolve('walked');
    }
    s.walkingOn = true;
    showMoment();
    releaseControl();
    return areas.ensure(to).then(
      () => {
        if (getSession() !== s || !s.walkingOn) return 'dropped';
        s.walkingOn = false;
        go();
        return 'walked';
      },
      (err) => {
        note('area', err);
        if (getSession() !== s || !s.walkingOn) return 'dropped';
        s.walkingOn = false;
        const online = isOnline();
        // Ruling R14: only her own solo walk-on counts toward a fresh start
        // (as F6: a start heard from the room never counts), never a guest's
        // and never in a room.
        if (online && err?.kind !== 'unknown' && !guest && !s.net) failures += 1;
        // Back in her walk: the pause card. The crossing card's state is
        // crossing.js's own, cleared there on this answer.
        const line = phrase(online ? 'start.notReady' : 'start.notReadyOffline');
        overlay.innerHTML = pauseCardFor(s, getIsTouch(), pauseSoundOf(settings), line);
        overlay.classList.remove('hidden');
        hud.toast(line);
        return 'failed';
      },
    );
  }

  return { beginWalkFromHomebase, beginDenWalk, startWalk, startWalkWhenReady, endWalk, walkOn, takeCrossing };
}
