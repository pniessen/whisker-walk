import * as THREE from 'three';
import { bus } from './events.js';
import { cameraOffset, moveDirection, viewForward } from './catcam.js';
import { isStalkMag } from './touchinput.js';
import { hasSkill } from './skills.js';
import { inWater, waterClearance, nearestDry } from './world/builder.js';

// You ARE the cat: arrows move the cat avatar at its breed's pace, the camera
// follows behind/above with mouse-orbit, and the cat stays centered on screen.

const CAT_RADIUS = 0.35;
const UP = new THREE.Vector3(0, 1, 0);

// Screen-space touch vector {x, z, mag} -> camera-relative world direction,
// rotated by yaw exactly like moveDirection does for keys. Because
// joystickVector already clamps magnitude into x/z, the rotated vector's
// length stays equal to mag, so target speed scales with it for free.
function touchDirection(vec, yaw) {
  return new THREE.Vector3(vec.x, 0, vec.z).applyAxisAngle(UP, yaw);
}

// Zoomies tuning. Two knobs, both baselined at exactly today's behaviour:
//
//  - chargeTime — seconds of accumulated full-speed running before `zooming`
//    engages. 1.5s is the shipped number.
//  - holdTime  — seconds of NOT-running that the charge survives before it is
//    wiped. 0 is the shipped number, i.e. any stop, stalk or freeze resets
//    instantly (see the reset branch below: with holdTime 0 the very first
//    non-running frame resets, exactly as the old unconditional reset did).
export const ZOOM_CHARGE_TIME = 1.5;
export const ZOOM_HOLD_TIME = 0;

// v18 "Cat Skills" — Long Zoomies.
//
// SPEC DISCREPANCY, recorded rather than papered over. The spec's traversal
// table says "Zoomies charge runs 2.5s (from 1.5s)", which reads the 1.5
// constant as the DURATION of the zoomies burst. It is not: 1.5 is the
// charge-UP threshold, and a burst, once engaged, runs for as long as the
// player keeps running — there is no duration to lengthen. Taken literally,
// 1.5 → 2.5 would make the charge-up 67% slower, i.e. a straight nerf, which
// contradicts both the ability's own catalog text ("Your zoomies charge runs
// much longer and recharges faster", src/skills.js) and the spec's locked
// design decision that "abilities make things easier and faster".
//
// So the two halves of the ability are mapped onto the two knobs that
// actually exist, keeping the spec's 2.5 and making both halves a buff:
//
//  - "runs much longer" → the charge now survives 2.5s of not-running, so a
//    corner, a stumble into a collider, or a brief scare no longer throws the
//    whole run away; the zoom picks straight back up.
//  - "recharges faster"  → the charge-up threshold drops 1.5s → 0.9s.
export const LONG_ZOOM_CHARGE_TIME = 0.9;
export const LONG_ZOOM_HOLD_TIME = 2.5;

export const BASE_ZOOM_TUNING = Object.freeze({ chargeTime: ZOOM_CHARGE_TIME, holdTime: ZOOM_HOLD_TIME });
const LONG_ZOOM_TUNING = Object.freeze({ chargeTime: LONG_ZOOM_CHARGE_TIME, holdTime: LONG_ZOOM_HOLD_TIME });

// zoomTuning(state) → the tuning for one save. `state` is the raw save
// object and every read goes through hasSkill, which is total over any input
// (see src/skills.js's hostile-state preamble), so a null/garbage state
// yields the baseline tuning rather than throwing.
export function zoomTuning(state) {
  return hasSkill(state, 'long-zoomies') ? LONG_ZOOM_TUNING : BASE_ZOOM_TUNING;
}

// Per-field coercion with a baseline fallback, so a partially-built tuning
// object (or a NaN out of some future UI slider) degrades to today's number
// instead of poisoning every comparison — `time >= NaN` is false forever,
// which would silently delete the zoomies.
function tuningField(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

// Pure zoomies state machine. `active && !stalking && speedRatio > 0.85 &&
// speedFactor > 0` (full-speed running, not stalking, not frozen) charges
// for `chargeTime` of accumulated time, then flips to `zooming`. A stop,
// stalk or freeze starts draining a hold window; once `holdTime` of
// not-running has accumulated the charge is wiped, so no charge carries over
// and a jittery input can't "bank" partial charge beyond the window.
//
// With the baseline holdTime of 0 the first non-running frame resets — the
// behaviour this function shipped with — and callers that pass no tuning at
// all get exactly that.
//
// Two extra state fields, both absent from the plain
// `{ charging: false, zooming: false, time: 0 }` literals in createPlayer's
// reset paths (hence the ?? defaults below):
//
//  - `idle`   — seconds of not-running accumulated so far in the hold window.
//  - `banked` — "was zooming when the hold window opened". `zooming` itself
//    goes FALSE the instant the cat stops, even inside the hold window,
//    because main.js drives the 77° FOV widening and the sparkle trail
//    straight off player.zooming: leaving it true would leave a stationary
//    cat wearing a wide-angle lens and dribbling sparkles for 2.5s. `banked`
//    is what actually survives the pause, and it snaps the zoom back on the
//    first running frame instead of making the player re-charge.
//
// speedFactor gates the running condition directly (rather than leaving
// freeze-detection to speedRatio alone) because speedRatio's denominator is
// `pace * speedFactor || 1` — when speedFactor is 0 that denominator falls
// back to 1, so residual velocity from before a freeze can push speedRatio
// past 0.85 and falsely read as "still running". Requiring speedFactor > 0
// here makes the reset correct regardless of whether a given freeze call
// site (e.g. a puddle balk) remembers to also call player.halt().
export function zoomState(prev, dt, { active, stalking, speedRatio, speedFactor = 1, chargeTime, holdTime } = {}) {
  const charge = tuningField(chargeTime, ZOOM_CHARGE_TIME);
  const hold = tuningField(holdTime, ZOOM_HOLD_TIME);
  const running = active && !stalking && speedRatio > 0.85 && speedFactor > 0;
  if (!running) {
    const idle = (prev.idle ?? 0) + Math.max(dt, 0);
    if (idle >= hold) return { charging: false, zooming: false, time: 0, idle: 0, banked: false };
    return {
      charging: false,
      zooming: false,
      time: prev.time,
      idle,
      banked: !!(prev.zooming || prev.banked),
    };
  }
  const time = prev.time + dt;
  const zooming = prev.zooming || !!prev.banked || time >= charge;
  return { charging: !zooming, zooming, time, idle: 0, banked: false };
}

// ---------------------------------------------------------------------------
// v18 CF-9a — the pounce hop arc, and Spring Paws' half of it.
//
// WHAT WAS MISSING. Spring Paws ships as two promises: "your pounce jump goes
// markedly higher" and "you can reach perches a longer hop away". Only the
// second one existed — climbing.js's SPRING_PAWS_CLIMB (1.6 -> 2.2) is the
// perch budget and it works. The first one had nothing behind it at all:
// pounce() below was a purely horizontal velocity lunge (dir.setY(0)), and
// avatar.position.y was pinned to api.perchY every single frame, so the game
// had no vertical movement of any kind for an ability to make "higher".
//
// WHY THIS IS FEEL AND NOT RULE. The hop is a RENDER offset added on top of
// api.perchY; it never writes perchY and nothing reads it back. That is not
// tidiness, it is the only safe shape:
//
//   * player.js's collider push is skipped whenever perchY !== 0 (a perched
//     cat stands on the very collider that would shove it off). A hop stored
//     in perchY would switch the push off for its whole duration and let a
//     pouncing cat sail through buildings.
//   * main.js feeds perchY to goldMice.checkFind, which matches within 0.9
//     vertically — a 0.9m hop stored in perchY would silently change which
//     golden mice a pounce can find.
//   * game/interactions.js reads perchY as "the height I am climbing FROM"
//     for the entire perch-chain rule (bestPerch/canReach).
//
// So a hop can never acquire a perch, can never find a mouse, and can never
// unlock a chain step. The arc is what a pounce LOOKS like; climbBudget stays
// the sole authority on what a cat can get on top of.
//
// THE TWO NUMBERS.
//
// POUNCE_HOP_TIME = 0.3 is not a new timeline: it is exactly the pounce pose
// window that already exists (game/interactions.js sets session.pounceTime =
// 0.3 on the same press, and game/avatar.js fires the landing dust-poof,
// audio.landThump() and the 0.12s 'land' pose on the frame that timer
// expires). Both are driven off the same dt stream from the same press, so
// the paws touch down on the frame the thump plays. A hop that outlived the
// pose would land the cat after its own landing sound.
//
// BASE_POUNCE_HOP = 0.35 is CAT_RADIUS — the cat lifts by its own body's
// half-width. It is deliberately small because there is no jump today, so
// ANY baseline arc is a new feel for every existing player, and it is bounded
// by content rather than by taste: the lowest perch that ships anywhere in
// the game is the seaside overlook boulder at y 0.72, so a no-skill pounce
// visually tops nothing at all. The drama belongs to the earned ability.
//
// SPRING_PAWS_HOP = 0.9 is 2.6x the baseline, which is what makes "markedly
// higher" legible without a side-by-side comparison. Its ceiling comes from
// the same content argument, run the other way: 0.9 clears the only two
// ground-tier perches in the game (the 0.72 overlook boulder and the 0.75
// low perch) and stops well short of the next tier at 1.35. Those two are
// reachable from the ground under EVERY budget including the unskilled 1.6,
// so the taller arc never shows the cat sailing over something it is not
// allowed to stand on — and 0.9 is itself under 1.6, so even a baseline
// cat's climb rule out-promises the skilled cat's arc. The arc can never
// look like it should have landed on something canReach refused.
export const POUNCE_HOP_TIME = 0.3;
export const BASE_POUNCE_HOP = CAT_RADIUS; // 0.35 — the cat's own half-width
export const SPRING_PAWS_HOP = 0.9;

export const BASE_POUNCE_ARC = Object.freeze({ height: BASE_POUNCE_HOP, time: POUNCE_HOP_TIME });
const SPRING_POUNCE_ARC = Object.freeze({ height: SPRING_PAWS_HOP, time: POUNCE_HOP_TIME });
// A flat arc — reducedMotion, and the explicit "no hop" any caller can ask
// for. Kept as a real arc object rather than null so every path through
// pounce() takes the same shape.
export const FLAT_POUNCE_ARC = Object.freeze({ height: 0, time: POUNCE_HOP_TIME });

// pounceArc(state, { reducedMotion }) → the arc for one press.
//
// `state` is the raw save object and the only read goes through hasSkill,
// which is total over any input (see src/skills.js's hostile-state preamble),
// so a null/garbage state yields the baseline arc rather than throwing —
// exactly like zoomTuning above and climbBudget in climbing.js.
//
// reducedMotion flattens the arc entirely rather than shrinking it, which is
// the same treatment the setting already gets elsewhere: animator.js drops
// the walk body-bob outright and fx.js's burst returns without emitting. The
// hop is decoration on top of a pounce that is otherwise byte-identical —
// same lunge, same speed, same cooldown, same landing thump, same mid-air
// catch window — so removing it costs the player nothing but the bounce.
export function pounceArc(state, { reducedMotion = false } = {}) {
  if (reducedMotion) return FLAT_POUNCE_ARC;
  return hasSkill(state, 'spring-paws') ? SPRING_POUNCE_ARC : BASE_POUNCE_ARC;
}

// hopOffset(elapsed, arc) → metres to add to the rendered Y at `elapsed`
// seconds into the hop. Pure, so the whole arc is testable without a scene.
//
// The shape is the ballistic parabola 4u(1-u) rather than sin(pi*u): both
// peak at exactly `height` halfway through, but the parabola leaves and
// meets the ground at full vertical speed, which reads as a cat launching
// and landing. The sine eases out at both ends and reads as floating.
//
// It returns EXACTLY 0 (not an epsilon) at and past the end of the window,
// which is what lets update() below put the cat back on api.perchY with no
// drift — a hop always ends at the height it started.
export function hopOffset(elapsed, arc) {
  const height = tuningField(arc?.height, 0);
  const time = tuningField(arc?.time, POUNCE_HOP_TIME);
  if (height <= 0 || time <= 0) return 0;
  const u = elapsed / time;
  if (u <= 0 || u >= 1) return 0;
  return height * 4 * u * (1 - u);
}

// =============================================================================
// WATER IS SOLID — v20.
//
// Water in this game never carried a collider: the park pond, the seaside sea
// and the Docks canal were walk-over surfaces, which is why v18's CF-12 ruling
// descoped Sea Legs ("water becomes traversable at reduced speed" described
// traversal the player already had, minus speed — an ability that is a
// downgrade). v19 made the flip safe: every water body is declared as data in
// its area's `waters`, the content that sat in the drink was relocated, and
// test/water.test.js pins that nothing the player must reach is wet and that
// the dry land is one connected piece. This is the pass that makes CF-12's
// premise false.
//
// WHY ITS OWN PASS, NOT AN ENTRY IN `colliders`. That array is circles only
// ({x, z, r}) and is consumed by this loop and by world/spots.js. The seaside
// sea is an 80x140 rect; approximating it with circles would be dozens of
// them, wrong at the corners, and would drag world/spots.js along with it.
// Water also has semantics a collider does not: a swim capability makes it
// passable-but-slow, and `decks` (the seaside pier, the Docks' two bridges)
// punch dry holes straight through it. So it gets its own pass, reading the
// same footprint helpers scent.js already reads — waterGap/onDeck/inWater/
// nearestDry in world/builder.js. There is exactly one copy of that geometry.
//
// ONLY THE PLAYER CONSULTS THIS. Critters, stray cats, ghosts, remote co-walk
// pets and the thrown toy are bounds-only and stay that way: the park and
// Docks ducks paddle INSIDE the footprints deliberately and the seaside gulls
// spawn over the sea. Water going solid must not touch them. (main.js floats a
// SETTLED yarn ball ashore, which is a fetchability fix — the ball still has
// no collision and still flies over the canal — see the note at that call.)
// =============================================================================

// How far clear of the waterline a blocked cat is held. CAT_RADIUS is the same
// number the collider push uses (it stops the cat at c.r + CAT_RADIUS), so the
// cat's body stops at the water's edge rather than half in it, and the rule
// reads identically at a wall and at a shoreline. It is also what makes the
// push invisible in normal play: a cat walks ~5cm per frame, so the correction
// on the frame it reaches the edge is smaller than that.
const WATER_MARGIN = CAT_RADIUS;

// Fraction of the cat's pace it keeps while swimming.
//
// The binding constraint is CF-12's own principle: an ability must never be a
// downgrade, so swimming must always beat the dry detour it replaces. The
// worst detour in the game sets the ceiling — the Docks canal is 7m wide and
// spans the whole map, and from the east end of a bank the nearest bridge is
// 38m away, i.e. up to 76m of walking against 7m of water. At 0.55 that
// crossing costs the equivalent of 12.7 walked metres, so even the cheapest
// swim in the game wins by a factor of six; the number is therefore set by
// FEEL rather than by arithmetic. 0.55 is slow enough that water reads as
// water (the park pond's 14m takes ~8s at a mid breed's pace) and fast enough
// that no crossing outlasts a child's patience.
export const SWIM_SPEED = 0.55;

// canSwim(state) → may this save cross water?
//
// WIRED LIVE, NOT STUBBED. 'sea-legs' is not in src/skills.js's catalog yet —
// a second agent reinstates it — and hasSkill is total over any input, so an
// unknown id returns false and every save today is a non-swimmer. Reading it
// through hasSkill anyway is the CF-10 lesson: this project has twice shipped
// an ability fully built and inert because an activating argument was never
// passed. The moment the catalog gains the entry, this lights up with no edit
// here.
export function canSwim(state) {
  return hasSkill(state, 'sea-legs');
}

// Push `pos` (a THREE.Vector3, mutated in place) out to WATER_MARGIN clear of
// every water; returns whether it had to.
//
// The test is the MARGIN, not the waterline — clearance < 0.35, not < 0 —
// which is the same continuous stand-off the collider push maintains (it fires
// at d < c.r + CAT_RADIUS, not on overlap). Ejecting only on penetration would
// make the shoreline buzz: a cat walking into the pond steps 5cm in, is thrown
// 35cm out, walks back in, four times a second. Holding it 0.35 clear instead
// means it arrives at the edge once and stops there, dead still.
//
// Module-level and mutating so the per-frame path allocates nothing:
// waterClearance is pure arithmetic over the footprints, and nearestDry —
// which does allocate its handful of escape candidates — runs ONLY on a frame
// where the cat is at the water's edge or in it.
function pushOutOfWater(pos, waters) {
  if (waterClearance(waters, pos.x, pos.z) >= WATER_MARGIN) return false;
  const dry = nearestDry(waters, pos.x, pos.z, WATER_MARGIN);
  pos.x = dry.x;
  pos.z = dry.z;
  return true;
}

export function createPlayer(camera, canvas) {
  let yaw = 0;
  let pitch = 0.18;
  let enabled = false;
  let avatar = null;
  let pace = 3.5;
  const keys = new Set();
  const velocity = new THREE.Vector3();
  let touchMove = null; // {x, z, mag} | null — overrides keys when set
  let touchEngaged = false;
  let touchMode = false; // set by main when a touch UI is active — gates click-to-lock
  let invertY = false; // settings.invertY — negates the pitch delta in both orbit paths below
  let zoom = { charging: false, zooming: false, time: 0 };
  // Long Zoomies tuning. Baseline until a walk-start call site hands us the
  // save (see setZoomTuning); NOT reset by setAvatar/disable, because the
  // ability is permanent and always-on — only the charge STATE resets.
  let zoomTune = BASE_ZOOM_TUNING;
  // v18 CF-9a hop state. `hopArc` non-null means "airborne"; `hopTime` is
  // seconds into that arc. Deliberately NOT folded into api.perchY — see the
  // pounceArc header. Unlike zoomTune (a permanent ability's tuning) this is
  // per-press STATE, so it resets everywhere the other per-walk state does:
  // setAvatar, disable and halt.
  let hopArc = null;
  let hopTime = 0;
  // Sea Legs. Like zoomTune this is a PERMANENT ability's capability, not
  // per-walk state, so setAvatar and disable deliberately leave it alone —
  // walk.js sets it once per walk from the save.
  let swim = false;

  const api = {
    locked: false,
    speedFactor: 1, // 0 while frozen by a scare; 1 normally
    perchY: 0,
    // True on the frames the cat is actually swimming (in water, with Sea
    // Legs). Written by update, read by nothing in the game today — it exists
    // so a test can watch the state without a scene, and so the HUD/pose work
    // the Sea Legs agent may want has an honest flag to hang off instead of
    // re-deriving one from the area's footprints.
    swimming: false,
    setAvatar(cat, catPace) {
      avatar = cat;
      pace = catPace;
      yaw = 0;
      pitch = 0.18;
      velocity.set(0, 0, 0);
      api.perchY = 0;
      touchMove = null;
      touchEngaged = false;
      zoom = { charging: false, zooming: false, time: 0 };
      hopArc = null;
      hopTime = 0;
    },
    forward() {
      return viewForward(yaw);
    },
    get position() {
      return avatar ? avatar.position : camera.position;
    },
    get speed() {
      return velocity.length();
    },
    get inputActive() {
      return keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight') ||
        (!!touchMove && touchMove.mag > 0);
    },
    get stalking() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight') ||
        (!!touchMove && isStalkMag(touchMove.mag));
    },
    get engaged() {
      return api.locked || touchEngaged;
    },
    get zooming() {
      return zoom.zooming;
    },
    setTouchMove(vec) {
      touchMove = vec || null;
    },
    // v18 Long Zoomies. Call with the raw save state at walk start:
    //   player.setZoomTuning(zoomTuning(progression.state))
    // Passing nothing (or anything unusable) restores the baseline tuning, so
    // a caller that has not been threaded yet — and a save without the skill
    // — both get exactly today's 1.5s-charge / instant-reset zoomies.
    setZoomTuning(tuning) {
      zoomTune = tuning && typeof tuning === 'object' ? tuning : BASE_ZOOM_TUNING;
    },
    // v20 Sea Legs. Call with the raw save state at walk start:
    //   player.setSwim(canSwim(progression.state))
    // Passing nothing leaves the cat unable to swim, which is the shipped
    // behaviour for every save today — an un-threaded call site gets solid
    // water, never accidental swimming.
    setSwim(v) {
      swim = !!v;
    },
    addOrbit(dx, dy) {
      yaw -= dx * 0.0045;
      pitch += (invertY ? -dy : dy) * 0.004;
      pitch = THREE.MathUtils.clamp(pitch, -0.25, 0.85);
    },
    setInvertY(v) {
      invertY = !!v;
    },
    setTouchEngaged(engaged) {
      const next = !!engaged;
      if (touchEngaged === next) return;
      touchEngaged = next;
      bus.emit('player:lockchange', { locked: api.engaged });
    },
    setTouchMode(mode) {
      touchMode = !!mode;
    },
    // Metres the cat is currently rendered ABOVE api.perchY. 0 whenever the
    // paws are down. Read-only, and read by nothing in the game — it exists
    // so a test can watch the arc without a scene, and so a future camera or
    // shadow effect has an honest number to hang off instead of re-deriving
    // one from the pose timers.
    get hopY() {
      return hopOffset(hopTime, hopArc);
    },
    halt() {
      velocity.set(0, 0, 0);
      // "Stop" means stop in all three axes. This is what guarantees no
      // stuck-in-air state: every call site that yanks the cat somewhere
      // else mid-pounce already calls halt() — game/interactions.js's perch
      // branch (which teleports the cat onto a perch and sets perchY) and
      // main.js's scare freeze — so neither can leave a live arc lifting the
      // cat off the perch it just landed on.
      hopArc = null;
      hopTime = 0;
    },
    // arc defaults to the no-skill hop rather than to a flat lunge: an
    // un-threaded call site should get the shipped FEEL and merely miss the
    // ability, never silently lose the feature the way CF-10a's four-argument
    // bestPerch call silently lost Spring Paws. Pass FLAT_POUNCE_ARC to opt
    // out on purpose.
    pounce(arc = BASE_POUNCE_ARC) {
      const dir = velocity.length() > 0.5 ? velocity.clone().setY(0).normalize() : viewForward(yaw);
      velocity.copy(dir.multiplyScalar(9));
      hopArc = arc && typeof arc === 'object' ? arc : BASE_POUNCE_ARC;
      hopTime = 0;
    },
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
      keys.clear();
      touchMove = null;
      api.setTouchEngaged(false);
      zoom = { charging: false, zooming: false, time: 0 };
      hopArc = null;
      hopTime = 0;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    update(dt, colliders = [], bounds = null, waters = []) {
      if (!enabled || !avatar) return;
      // Water rules only apply to a cat with its paws on the ground, and only
      // in an area that has water — every other area takes the `wet` read as
      // one length check and is byte-identical to before this existed.
      //
      // PERCHED CATS ARE EXEMPT, for exactly the reason they skip the collider
      // push below: a perched cat is standing ON something, snapped to that
      // object's own centre, and a push is what would shove it back off. The
      // exemption is safe because no perch in the game stands in water —
      // test/water.test.js asserts it for every area, alongside the
      // collectibles and the spawn — so this can never leave a cat marooned
      // over the drink. A cat that hops down INTO water lands with perchY back
      // at 0 and is pushed out on that same frame.
      const watered = api.perchY === 0 && (waters?.length ?? 0) > 0;
      // Two different questions, deliberately asked with two different tests.
      //
      // BLOCKED is the CAPABILITY, not the position: a cat with Sea Legs is
      // never pushed, anywhere, or the stand-off below would hold it 0.35
      // clear of the shore and it could never get IN. A cat without it is
      // pushed whether or not it is currently wet, because the push is what
      // keeps it dry.
      //
      // SWIMMING is the position: the speed penalty applies only while the cat
      // is actually in the drink, read from where it stands at the top of the
      // frame so the penalty and this frame's movement agree.
      const blocked = watered && !swim;
      const swimming = watered && swim && inWater(waters, avatar.position.x, avatar.position.z);
      api.swimming = swimming;
      const dir = touchMove ? touchDirection(touchMove, yaw) : moveDirection(keys, yaw);
      // speedRatio must be read from velocity BEFORE the lerp below moves it
      // toward this frame's target — it reflects how close last frame's
      // actual speed already is to full pace, which is what "full-speed
      // running" (the zoomies charge condition) means.
      const targetSpeedDenom = pace * api.speedFactor || 1; // clamp away from 0 (speedFactor can be 0 while frozen)
      const speedRatio = velocity.length() / Math.max(Math.abs(targetSpeedDenom), 0.0001);
      zoom = zoomState(zoom, dt, {
        active: api.inputActive,
        stalking: api.stalking,
        speedRatio,
        speedFactor: api.speedFactor,
        chargeTime: zoomTune.chargeTime,
        holdTime: zoomTune.holdTime,
      });
      // Swimming scales the TARGET speed, not speedFactor, so it composes with
      // the scare freeze (speedFactor 0) instead of fighting it. Note what it
      // does to the zoomies for free: speedRatio is measured against the dry
      // pace, so a swimming cat tops out at 0.55 and never crosses the 0.85
      // "full-speed running" line — no zoomies charge in the water, which is
      // the right answer and needed no extra rule.
      const zoomPace = (zoom.zooming ? pace * 1.55 : pace) * (swimming ? SWIM_SPEED : 1);
      const lerpFactor = zoom.zooming ? 1 - Math.pow(0.03, dt) : 1 - Math.pow(0.001, dt);
      velocity.lerp(dir.multiplyScalar(zoomPace * api.speedFactor), lerpFactor);
      // v18 CF-9a. Advance the hop BEFORE the Y write, so the offset applied
      // this frame is this frame's. hopOffset returns exactly 0 once the
      // window has passed, and clearing the arc on that same frame is what
      // makes the landing exact: the cat's rendered Y goes back to
      // api.perchY + 0, never to perchY + epsilon, and never accumulates
      // drift across repeated pounces.
      //
      // The Y write is the ONLY thing the hop touches. api.perchY is
      // untouched above and below, so the collider push, goldMice.checkFind
      // and the whole perch-chain rule all see exactly the height they saw
      // before this existed.
      let lift = 0;
      if (hopArc) {
        hopTime += Math.max(dt, 0);
        lift = hopOffset(hopTime, hopArc);
        // Clear on the WINDOW expiring — not on the offset reaching 0.
        // hopOffset is legitimately 0 at BOTH ends of the arc (it returns 0
        // for u <= 0 as well as u >= 1), so testing the offset cancels the
        // hop on any frame where hopTime is still 0 — which is exactly what
        // a dt of 0 leaves behind on the frame the hop began. dt comes from
        // THREE.Clock.getDelta(), and browsers clamp timer resolution for
        // Spectre mitigation (Firefox to 1ms by default), so two renders
        // inside one clock tick genuinely yield 0 and would have silently
        // eaten the pounce's bounce. Reading the duration through
        // tuningField keeps a garbage arc.time on the same fallback
        // hopOffset itself uses, so the two can never disagree about when
        // the window ends.
        if (hopTime >= tuningField(hopArc.time, POUNCE_HOP_TIME)) {
          hopArc = null;
          hopTime = 0;
          lift = 0;
        }
      }
      avatar.position.addScaledVector(velocity, dt);
      avatar.position.y = api.perchY + lift;

      // Skip collider push while perched (perchY > 0): a perched cat is
      // standing ON the object (car roof, crate, rooftop…), often snapped to
      // that very collider's own center, so this push is exactly what would
      // fight the perch and shove the cat back off it. Grounded cats
      // (perchY === 0) still get pushed out of every collider as before —
      // INCLUDING mid-hop, because the hop is a render offset and never
      // reaches perchY. A pouncing cat cannot pass through a wall.
      if (api.perchY === 0) {
        for (const c of colliders) {
          const dx = avatar.position.x - c.x;
          const dz = avatar.position.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + CAT_RADIUS;
          if (d < min && d > 0.0001) {
            avatar.position.x = c.x + (dx / d) * min;
            avatar.position.z = c.z + (dz / d) * min;
          }
        }
      }
      // The water pass. AFTER the collider push, so a cat shoved off a crate
      // into the pond by a collider is pulled straight back out on the same
      // frame rather than a frame later; BEFORE the bounds clamp, because
      // leaving the cat outside the map is worse than leaving it wet.
      //
      // Blocked by default, skipped entirely for a cat that can swim.
      // nearestDry does the work, which is what makes the stuck cases fall out:
      // it is a fixed point on dry ground, so a cat that is ALREADY in the
      // water when a walk starts, that lands there from a perch hop-down, or
      // that is pushed there by a collider, is out again on its first grounded
      // frame — no input required and no way to hold it under. A cat frozen in
      // a pond is worse than water that does not block.
      //
      // A POUNCING cat is grounded as far as this is concerned, because the
      // hop is a render offset that never touches perchY — the same rule the
      // collider push states one block up ("a pouncing cat cannot pass through
      // a wall"), and the right one here too: a lunge covers ~2.7m against a
      // 7m canal, so it could never clear water anyway. All an exemption would
      // buy is the cat landing in the middle of it.
      if (blocked) pushOutOfWater(avatar.position, waters);
      if (bounds) {
        avatar.position.x = THREE.MathUtils.clamp(avatar.position.x, bounds.minX, bounds.maxX);
        avatar.position.z = THREE.MathUtils.clamp(avatar.position.z, bounds.minZ, bounds.maxZ);
        // The clamp can itself put the cat back in the water where a footprint
        // overlaps the map edge — the seaside sea covers the whole eastern 11m
        // of the walkable bounds — so re-run the pass and re-clamp. Both
        // guards are cheap arithmetic and the allocating half only runs on a
        // frame that was BOTH clamped and wet, which no shipped area produces
        // (test/water.test.js sweeps every cell of all three maps). It is here
        // so a future area that puts water against its own edge cannot
        // reintroduce a trap.
        if (blocked && pushOutOfWater(avatar.position, waters)) {
          avatar.position.x = THREE.MathUtils.clamp(avatar.position.x, bounds.minX, bounds.maxX);
          avatar.position.z = THREE.MathUtils.clamp(avatar.position.z, bounds.minZ, bounds.maxZ);
        }
      }
      if (velocity.length() > 0.15) {
        avatar.rotation.y = Math.atan2(velocity.x, velocity.z) + Math.PI;
      }

      camera.position.copy(avatar.position).add(cameraOffset(yaw, pitch));
      camera.lookAt(avatar.position.x, avatar.position.y + 0.6, avatar.position.z);
    },
  };

  canvas.addEventListener('click', () => {
    if (touchMode) return; // a touch UI handles engagement itself — don't fight it for pointer lock
    if (enabled && !api.locked) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    api.locked = document.pointerLockElement === canvas;
    if (!api.locked) keys.clear();
    // emit engaged (locked || touchEngaged), not raw locked: on desktop
    // touchEngaged is always false so this is identical, but it prevents a
    // stray pointer-lock event on a hybrid/touch device from contradicting
    // touch engagement (e.g. a lock loss while touch controls are active).
    bus.emit('player:lockchange', { locked: api.engaged });
  });
  document.addEventListener('mousemove', (e) => {
    if (!api.locked || !enabled) return;
    yaw -= e.movementX * 0.0024;
    pitch += (invertY ? -e.movementY : e.movementY) * 0.002;
    pitch = THREE.MathUtils.clamp(pitch, -0.25, 0.85);
  });
  document.addEventListener('keydown', (e) => {
    if (!enabled) return;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    keys.add(e.code);
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));

  return api;
}
