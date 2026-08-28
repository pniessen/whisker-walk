// Player interactions and prompts, lifted out of main.js's init() closure.
//
// Two related layers live here:
//   * the action helpers (doMeow/doYarn/doPounceOrClimb/doCameraToggle) plus
//     the touch dispatch that shares them with the keydown handler, and
//   * the per-frame prompt scan (updateInteractions/setPrompt) and the E-press
//     handler it feeds (handleInteract), together with the one shared stray
//     greet-award body (awardStrayGreet).
//
// The prompt/interact functions already took the live session `s` as their
// first argument. The action helpers instead read main.js's live `session`
// binding, which is now reached through the injected getSession() accessor —
// each takes a synchronous snapshot at entry so its body is unchanged, and
// doMeow's reply timeout still re-reads getSession() so an ended walk stays
// silent exactly as before.

import { PERSONALITIES } from '../cat/brain.js';
import { bestPerch, canReach, climbBudget, fenceRunning } from '../climbing.js';
import { hasSkill } from '../skills.js';
import { pounceArc } from '../player.js';
import { GIFT_LEAVE_RANGE } from '../gifts.js';
import { friendRungCrossed, isGrudgeableStray } from '../straycats.js';
import { shouldTurnHostile, SCUFFLE_COST, SCUFFLE_FREEZE } from '../enemies.js';
import { labelFor } from './labels.js';
import { nowSec } from './util.js';

// ---------------------------------------------------------------------------
// v20 "Ruffled Fur" — the constants this module owns.
//
// STRAY_PROMPT_RANGE is the shipped 2.5m greet reach, named rather than
// retyped because v20 gives the same slot a second prompt (the reconciliation)
// and the two must not drift apart — a treat you can only offer from closer
// than you can greet would be a bug nobody would find.
//
// SCUFFLE_RANGE is where a cross cat swats. Deliberately well inside
// STRAY_PROMPT_RANGE: the swat is the price of CROWDING a cross cat, so the
// reconciliation prompt has to be reachable from outside it — otherwise the
// only way to offer the treat would be to get swatted first, which inverts the
// whole beat. (Pressing E while frozen does work — main.js's KeyE handler has
// no freeze guard, unlike Space — so a player who gets it wrong is not locked
// out either.) The cost and the freeze are enemies.js's, not ours.
//
// TREAT_COST is the reconciliation price, and it is a decision, not a
// derivation: the user resolved the spec's open question by making the "gift"
// a TREAT BOUGHT WITH WHISKER POINTS at 10 points, deliberately the same 10
// AWARDS.gift pays for a gift found — you hand back exactly what a gift is
// worth. It is written as its own constant rather than read off AWARDS
// because AWARDS.gift is what a discovery PAYS and this is what a treat
// COSTS; test/interactions.test.js asserts the two are equal so the
// deliberate match cannot silently become a mismatch.
// ---------------------------------------------------------------------------
const STRAY_PROMPT_RANGE = 2.5;
const SCUFFLE_RANGE = 1.4;
export const TREAT_COST = 10;

export function createInteractions({
  // getIsTouch, not a captured boolean: a hybrid device upgrades into touch
  // mode mid-session (onFirstTouch), and setPrompt must see that upgrade.
  MP, pid, getCloud, getPsecret, getSession, getIsTouch,
  player, progression, log, hud, audio, catVoice, snapPhoto,
  petNameFor, completeBoop,
}) {
  // Bodies extracted out of the keydown handlers below (pure move — same
  // logic, no behavior change) so both the keyboard path and the touch
  // action-button path can invoke them. Callers are responsible for the
  // session/engagement/mode guards, exactly as the keydown handler always was.
  function doMeow() {
    const session = getSession();
    catVoice();
    // v18 Far Call ('far-call'): the same meow, carried farther — strays AND
    // curious critters in the outer band come over to see who shouted
    // (movement only; see straycats.reactToMeow and critters.reactToMeow).
    // The critter half is CF-5, added once critters.js came into scope.
    //
    // The skill is read locally and the broadcast below is unchanged with or
    // without it — no new event kind, no new field — so a co-walker who has
    // not earned it sees exactly today's meow. The remote path
    // (game/netevents.js) deliberately keeps calling reactToMeow with `far`
    // off, because the wire event carries no skill information and inventing
    // one would be the protocol change the spec's non-goals rule out.
    const farCall = hasSkill(progression.state, 'far-call');
    session.critters.reactToMeow(session.cat.position, { far: farCall });
    if (session.strayCats.reactToMeow(session.cat.position, { far: farCall }) > 0) {
      setTimeout(() => { if (getSession()) audio.meow(); }, 350); // a reply from a friend
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
    const session = getSession();
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
    const session = getSession();
    // Look for a NEW perch reachable from wherever the cat is right now —
    // canReach uses player.perchY, which still holds the current perch's
    // height while perched (it's only zeroed by the hop-down branch below),
    // so a chain of perches within the climb budget can be walked upward with
    // repeated presses of this same key, never dropping to the ground in
    // between. That budget is 1.6m a hop for an unskilled cat and rises with
    // Spring Paws / Sure Claws (climbing.js's climbBudget composes the two by
    // max). bestPerch prefers the HIGHEST reachable candidate (drops are
    // always "reachable" per canReach, so a naive first-match pick could
    // shadow a higher chain-mate with a lower one) — climbs beat drops
    // whenever both are in reach. Hopping down (or off a perch with nothing
    // else in reach) is the fallback.
    //
    // v18 CF-10a: this call passed four arguments, so bestPerch fell back to
    // its no-skills default and Spring Paws and Sure Claws did nothing in the
    // running game. The budget is computed HERE, per press, off the live save
    // rather than captured at walk start, so a skill earned mid-walk raises
    // the cat's reach on the very next hop.
    //
    // v18 Task 3.1 Fence Runner: the second reachability path, handed in as
    // an option rather than folded into the budget (see climbing.js's header
    // on why a horizontal rule cannot be a climb budget). It only does
    // anything when the cat is ALREADY perched — bestPerch checks that
    // itself off `session.perched` — so an unskilled hop and a grounded hop
    // both behave exactly as they do today. Read live off the save, same as
    // the budget above, so the 25th vantage perch enables the wall-run on
    // the very next press.
    const budget = climbBudget(progression.state);
    const next = bestPerch(
      session.areaData.perches ?? [], session.cat.position, player.perchY, session.perched,
      budget,
      // v18 CF-9b: `state` is what makes the 49 gated `requires: 'sure-claws'`
      // perches visible — the scenery props (tree forks, fence tops, market
      // awnings, benches) that Sure Claws opens. Without it bestPerch filters
      // every one of them out and that half of the ability ships DEAD, which
      // is precisely the CF-10 failure this wave exists to finish cleaning up.
      // Read live off the save, same as the budget and the fence-run flag
      // above, so the 25th tip-over opens the trees on the very next press.
      { fenceRun: fenceRunning(progression.state), state: progression.state },
    );
    if (next) {
      // Did the wall-run pay for this hop? Asked exactly — "the ordinary
      // climb rule would have refused this one" — rather than by guessing
      // from the height difference, so a short level hop that was always
      // legal is not mislabelled. Computed BEFORE the position is moved.
      const ranTheFence = !canReach(next, session.cat.position, player.perchY, budget);
      session.perched = next;
      player.perchY = next.y;
      player.halt();
      const from = session.cat.position.clone();
      session.cat.position.set(next.x, next.y, next.z);
      catVoice();
      // A puff of dust at the take-off point, so a wall-run reads as an
      // ability firing rather than as the cat merely not falling off.
      if (ranTheFence) session.fx?.burst(from, 0xd8cdb8, 6);
      if (next.vantage) {
        // v18 Task 1.4: a SECOND, dedicated tally recorded alongside the
        // award — deliberately not a retyping of it. The 'scenic' award type
        // is load-bearing elsewhere: GOAL_POOL's 'scenic-spots' goal
        // ("Visit 2 scenic spots") counts 'scenic' discoveries, so giving
        // perches their own award type would quietly make that goal harder
        // to complete. The award, its point value, the goal it advances and
        // the discovery-log line are all byte-identical to before; this call
        // only adds a lifetime perch count.
        //
        // It exists because feats.scenic conflates climbing to a perch with
        // visiting a viewpoint, and Spring Paws / Fence Runner are climbing
        // abilities: without this, ten scenic spots would hand out a
        // climbing ability to a player who never climbed anything.
        //
        // GATED ON THE AWARD ACTUALLY PAYING (v18 final review). awardOnce
        // returns 0 when the key was already seen this walk and the points
        // otherwise, so `paid > 0` is exactly "this perch is new this walk".
        // Tallying unconditionally made feats.perch farmable: climbing onto
        // one perch and hopping straight back down re-enters this branch
        // every time, so 100 taps of Space on the same walk-up-reachable
        // perch bought both Spring Paws (10) and Fence Runner (25) while the
        // deduped 'scenic' award paid only once. Riding the return value
        // inherits discoveries.js's per-walk per-key cap rather than
        // inventing a second bookkeeping scheme that could drift from it.
        //
        // Optional-called for the same reason discoveries.js's pay() does
        // it — a stand-in progression in a test need not implement it.
        const paid = log.awardOnce('scenic', `perch-${next.label}`, next.label);
        if (paid > 0) progression.recordFeat?.('perch');
      }
    } else if (session.perched) {
      session.perched = null;                    // hop down
      player.perchY = 0;
      session.fx.burst(session.cat.position, 0xcbb8a0, 8);
    } else if (session.pounceCooldown <= 0) {
      // v18 CF-9a: Spring Paws' OTHER half — "your pounce jump goes markedly
      // higher". Until now that clause described nothing: pounce() was a
      // purely horizontal lunge and the cat's Y was pinned to perchY, so
      // only the climb-budget half of the ability existed. player.pounceArc
      // supplies the hop height; player.js owns the arc itself (and the
      // argument for why it is a render offset rather than a perch height).
      //
      // Read HERE, per press, off the live save — the same discipline as
      // `budget` above rather than a value captured at walk start, so Spring
      // Paws earned mid-walk lifts the very next pounce.
      //
      // session.reducedMotion is walk.js's once-per-walk snapshot of
      // settings.reducedMotion; main.js's zoomies sparkle trail reads the
      // same field. Going through the session (rather than injecting
      // `settings` into this module) keeps the setting read off the 60Hz
      // path and out of this factory's dependency list, and a stand-in
      // session without the field simply reads as "motion allowed".
      player.pounce(pounceArc(progression.state, { reducedMotion: session.reducedMotion }));
      audio.pounceWhoosh();
      // 0.3s is also the hop's duration (POUNCE_HOP_TIME) — the arc is tied
      // to this pose window on purpose, so the paws touch down on the frame
      // game/avatar.js plays the landing thump. Changing one means changing
      // the other.
      session.pounceTime = 0.3;
      session.pounceCooldown = 1.2;
    }
  }

  function doCameraToggle() {
    const session = getSession();
    session.cameraMode = !session.cameraMode;
    hud.setCamera(session.cameraMode);
  }

  // Touch action-cluster/pause/prompt-pill dispatch — mirrors the same
  // session/engaged/mode guards the keydown handler below applies per key.
  function handleTouchAction(name) {
    const session = getSession();
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

  // touch has no E key — the prompt pill becomes tappable there (hud.js
  // strips the "E — " prefix and wires the tap to hud.onPromptTap above).
  function setPrompt(text) {
    hud.setPrompt(text, getIsTouch());
  }

  // ---------------------------------------------------------------------
  // v18 Task 2.3 — Twitchy Nose and Whisker Sense.
  //
  // Both are always-on PERCEPTION abilities, so neither hangs off a keypress:
  // they run from updateSenses below, called once a frame out of
  // updateInteractions. Both are throttled on wall-clock seconds rather than
  // a dt accumulator because updateInteractions is not handed a dt — the
  // per-walk timestamps live on the session, so they reset with the walk.
  //
  // Neither sends anything over the wire, and neither reads anything a
  // co-walker sent: a skilled and an unskilled player in the same room walk
  // see different trails and hear different pings, and the protocol is
  // unchanged. That is the spec's "abilities are local", intact.
  // ---------------------------------------------------------------------

  // How far the nose reaches. Deliberately wider than updateInteractions'
  // 7m/14m collectible REVEAL radius: the point of the ability is to be
  // pulled toward something you cannot see yet.
  const NOSE_RANGE = 22;
  // ...but the trail itself is short. See scent.trailTo — a full-length trail
  // to a 20m target reads as a paved road, not a scent.
  const NOSE_TRAIL_DIST = 6;
  const NOSE_REFRESH = 3.5;   // seconds between relays; decals live 4s
  const NOSE_RETRY = 1;       // cheaper re-check when nothing is in range

  const WHISKER_RANGE = 12;   // spec: "within ~12m of an unfound golden mouse"
  const WHISKER_MIN_GAP = 0.6;  // ping interval right on top of a mouse
  const WHISKER_MAX_GAP = 2.6;  // ...and at the very edge of range

  // The nearest collectible still on the ground, within `range`. A collected
  // one has had its mesh pulled from s.collectibleMeshes (handleInteract's
  // 'collect' branch, and netevents' remote-collect path), so that Map is the
  // authority on "not picked up yet" — including a collectible a co-walker
  // grabbed, which correctly stops drawing a trail to nothing.
  function nearestUncollected(s, catP, range) {
    let best = null;
    let bestD = range;
    for (const c of s.areaData.collectibles) {
      if (!s.collectibleMeshes.has(c.id)) continue;
      const d = Math.hypot(c.x - catP.x, c.z - catP.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function updateSenses(s, catP) {
    const state = progression.state;
    const now = nowSec();

    // --- Twitchy Nose -------------------------------------------------
    if (hasSkill(state, 'twitchy-nose') && s.scent) {
      if (now >= (s.noseNextAt ?? 0)) {
        const target = nearestUncollected(s, catP, NOSE_RANGE);
        // Relaid from wherever the cat is NOW, so the trail keeps turning to
        // follow the player rather than pointing along a stale heading.
        const laid = target ? s.scent.trailTo(catP, target, { maxDist: NOSE_TRAIL_DIST }) : null;
        s.noseNextAt = now + (laid ? NOSE_REFRESH : NOSE_RETRY);
      }
    }

    // --- Whisker Sense ------------------------------------------------
    if (hasSkill(state, 'whisker-sense') && s.goldMice) {
      if (now >= (s.whiskerNextAt ?? 0)) {
        // The LIVE found list, re-read per ping. state.golden is the player's
        // own record of which mice they have caught, so a mouse already found
        // — this walk, a previous walk, or a save restored mid-session —
        // cannot ping. (goldMice.list is unfound-only by construction too;
        // this is the belt to that pair of braces. See goldmice.js.)
        const found = new Set(Array.isArray(state.golden) ? state.golden : []);
        const near = s.goldMice.nearestUnfound(catP, WHISKER_RANGE, found);
        if (near) {
          const closeness = 1 - near.dist / WHISKER_RANGE;    // 0 at the edge, 1 on top
          s.whiskerNextAt = now + WHISKER_MAX_GAP - (WHISKER_MAX_GAP - WHISKER_MIN_GAP) * closeness;
          // A sparkle a step out from the cat's nose, ON the bearing to the
          // mouse: the ping says "something is near", the shimmer says which
          // way. Never at the mouse itself — that would hand the player the
          // location outright and make the hunt a walk.
          const dx = near.mouse.x - catP.x;
          const dz = near.mouse.z - catP.z;
          const len = Math.hypot(dx, dz) || 1;
          const at = catP.clone();
          at.x += (dx / len) * 1.1;
          at.z += (dz / len) * 1.1;
          at.y += 0.45;
          s.fx?.shimmer(at, 0xf2c14e, 10);
          audio.whiskerPing(closeness);
        } else {
          s.whiskerNextAt = now + 0.5;
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // v18 Task 3.2 — Gift Paws.
  //
  // Two halves, both here because this module owns the prompt scan and the
  // proximity grants: leaving a gift at a scenic spot (the E prompt below)
  // and a visitor turning up with one they found (claimFoundGift).
  //
  // Neither half sends or reads a network event. Real-time discovery by a
  // LIVE co-walker is deliberately NOT built — it would need a new broadcast
  // kind, which the wave's non-goals forbid. See src/gifts.js's header for
  // the full ruling.
  // -------------------------------------------------------------------

  // The nearest scenic spot the cat could stash something at: in range, and
  // not already holding one of this player's gifts. s.gifts.list is the
  // authority on "already holding one" — it is built from the save at walk
  // start and gains anything left during this walk, so the prompt can never
  // offer a spot twice.
  function openScenicNear(s, catP) {
    const taken = new Set(s.gifts.list.map((g) => g.spot));
    let best = null;
    let bestD = GIFT_LEAVE_RANGE;
    for (const sc of s.areaData.scenics ?? []) {
      if (taken.has(sc.id)) continue;
      const d = Math.hypot(sc.x - catP.x, sc.z - catP.z);
      if (d < bestD) {
        bestD = d;
        best = sc;
      }
    }
    return best;
  }

  // A visitor (stray or ghost) hands over a gift this player stashed on an
  // earlier walk. `holder` is whichever object carries it, `who` is the
  // display name already decorated by the caller.
  //
  // progression.claimGift is the SINGLE gate: it removes the gift from the
  // save and returns false if it was not there, so a second frame inside the
  // 3m radius, a stray and a ghost both somehow holding it, or a save
  // reloaded mid-walk can none of them pay twice.
  function claimFoundGift(s, holder, who) {
    const gift = holder.foundGift;
    holder.foundGift = null;
    if (!gift || !progression.claimGift?.(gift.area, gift.spot)) return;
    log.awardOnce('gift', `gift-found-${gift.area}-${gift.spot}`,
      `${who} found the gift you left at ${gift.label}! 🎁`);
    const entry = s.gifts?.list?.find((g) => g.spot === gift.spot);
    if (entry) s.gifts.remove(entry);
    s.fx?.burst(holder.group.position, 0xe05a7a, 14);
  }

  // -------------------------------------------------------------------
  // v20 Ruffled Fur — the scuffle. Crowd a cross cat and it swats you.
  //
  // D6: built from the ONE hostile mechanic the game already has, the dog
  // scare (critters.js's 'critter:scare' → main.js:407-414) — freezeTime =
  // 1.5, player.halt(), the `scared` pose and a toast. Note the pose is not
  // played here: avatar.js derives it from s.freezeTime (`if (s.freezeTime >
  // 0) pose = 'scared'`), so setting the timer IS playing the pose, exactly
  // as it is for the dog. There are no hit points, no health bar and no way
  // to lose a walk. Everything genuinely new is the point cost (D3) and the
  // rate limit, both of which are enemies.js's.
  //
  // Called once per stray per frame out of updateInteractions' existing
  // stray loop, so it adds no second pass over 22 cats.
  // -------------------------------------------------------------------
  function maybeScuffle(s, stray, catP) {
    if (!stray.cross) return;
    // GUARD ONE, which enemies.js explicitly leaves to the call site because
    // it is a session read that module has no handle on: never fire while
    // the player is already frozen. Without it, a cross cat you happen to be
    // standing next to would swat again the instant each 1.5s freeze expired
    // — a freeze-lock, and a drain on a player who is merely walking past.
    if (s.freezeTime > 0) return;
    if (stray.group.position.distanceTo(catP) >= SCUFFLE_RANGE) return;
    // GUARD TWO, and the ONLY thing permitted to authorise a deduction:
    // at most once per cat and at most SCUFFLE_MAX_PER_WALK (3) times per
    // walk. allowScuffle mutates on success — enemies.js models it on
    // walk.js's sendGate.allow for exactly this reason — so the rate limit
    // cannot be forgotten by a later edit at this site. A session with no
    // enemy log (a stand-in in a test) never scuffles at all.
    if (!s.enemies?.allowScuffle(stray.name)) return;

    audio.hiss();
    s.fx?.burst(stray.group.position, 0xd8cdb8, 10);   // a dust-puff scuffle
    // D3, and the one place this wave is allowed to subtract. deductPoints
    // touches state.points ONLY and floors at zero — state.lifetimePoints,
    // the sole input to the rank ladder, is never touched, so a bad walk can
    // never demote a hard-won title. It returns what was ACTUALLY taken, so
    // a player already at zero gets the hiss and the freeze but no phantom
    // "-5", and the HUD counter is refreshed off the live save (main.js only
    // repaints it on a 'discovery' event, and a deduction is not one).
    const lost = progression.deductPoints?.(SCUFFLE_COST) ?? 0;
    if (lost > 0) hud.setPoints?.(progression.state.points);
    // The dog scare's breed rule, verbatim: 'fearless' and 'steady' cats are
    // not cowed, so they skip the freeze/halt/toast block. What sits OUTSIDE
    // that block is deliberately the same shape too — the bark plays for
    // everyone, and so do the hiss, the dust and the cost. The special
    // governs the player's NERVE, which is precisely what the freeze models;
    // it is not a discount on the swat, and letting two breeds walk through
    // the feature for free would delete the sting D3 exists to deliver.
    const special = PERSONALITIES[s.cat.userData.breed]?.special;
    const paid = lost > 0 ? ` −${lost} 🐾` : '';
    if (special !== 'fearless' && special !== 'steady') {
      s.freezeTime = SCUFFLE_FREEZE;
      player.halt();                 // frozen means frozen — no sliding
      hud.toast(`${stray.name} swats you! You freeze.${paid} 🙀`);
    } else {
      hud.toast(`${stray.name} takes a swipe — you hold your ground.${paid}`);
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
        if (log.awardOnce('critter', `spot-${c.id}`, labelFor(c.type)) > 0) progression.recordSighting(c.type);
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
      // v18 Gift Paws: ...and the other direction — a stray who found the
      // gift YOU left at a scenic spot on an earlier walk. Same proximity
      // grant, opposite gesture, deliberately a separate field (see
      // ghosts.js's note on foundGift vs hasGift).
      if (stray.foundGift && stray.group.position.distanceTo(catP) < 3) {
        claimFoundGift(s, stray, stray.name);
      }
      // v20 Ruffled Fur — last in the body on purpose: a cross cat can still
      // be spotted and can still hand over a gift; the swat is what it does
      // once you crowd it, after everything friendly has had its turn.
      maybeScuffle(s, stray, catP);
    }
    // best-friend ghosts (greets >= 6) may be carrying a gift, rolled once
    // at spawn by createGhosts — same "close enough" proximity grant as the
    // stray gift check just above.
    for (const ghost of s.ghosts.list) {
      if (ghost.hasGift && ghost.group.position.distanceTo(catP) < 3) {
        log.awardOnce('gift', 'gift-ghost-' + ghost.playerId, `${ghost.petName} 👻 brought you a gift!`);
        ghost.hasGift = false;
      }
      // v18 Gift Paws — the ghost visitor found the gift you stashed here.
      // This is the discovery half of the ability as the spec describes it;
      // the stray path above is the offline stand-in for a player with no
      // cross-walk friends.
      if (ghost.foundGift && ghost.group.position.distanceTo(catP) < 3) {
        claimFoundGift(s, ghost, `${ghost.petName} 👻`);
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
      if (Math.hypot(c.x - catP.x, c.z - catP.z) < 1.6 &&
          Math.abs((s.perched?.y ?? 0) - (c.y ?? 0)) < 0.9) {
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
      // v20 Ruffled Fur. ONE branch, in the exact slot the greet prompt has
      // always occupied, offering one of two mutually exclusive things to the
      // same cat: an ungreeted stray gets the greet, a cross one gets the
      // chance to make up. `promptable` is a single scan returning the
      // NEAREST cat with either offer (see straycats.nearest), so a cross cat
      // can never shadow a friendly one standing closer, nor the reverse —
      // which is what a second branch elsewhere in the chain would have done.
      //
      // The placement is the point. A cross cat offers no greet, so for a
      // save with no grudges this branch is byte-identical to today's, and
      // for one with grudges the reconciliation inherits the greet's own
      // position in the ladder rather than claiming a new one:
      //
      //   * everything ABOVE it (collect / tip / dig / quest) still wins, so
      //     nothing the player walked over to do is shadowed;
      //   * everything BELOW it (ghost, kitten, race, scratch, boop and —
      //     critically — 'gift-leave', which is deliberately last) still
      //     loses. That last one is load-bearing: a cross cat sitting on a
      //     scenic spot must not have "leave a gift here" shadow the one
      //     prompt that can un-cross it, which is the payoff beat of the
      //     entire feature.
      //
      // The affordability message lives in the PROMPT, not only in the press,
      // mirroring the 'collect' branch's "Paws full!" — the player finds out
      // before committing. handleInteract re-checks it regardless.
      const stray = s.strayCats.nearest(catP, STRAY_PROMPT_RANGE, { promptable: true });
      if (stray && stray.cross) {
        s.prompt = { kind: 'stray-gift', data: stray };
        setPrompt(spendablePoints() >= TREAT_COST
          ? `E — offer ${stray.name} a treat (${TREAT_COST} 🐾)`
          : `${stray.name} is cross — a treat costs ${TREAT_COST} 🐾`);
      } else if (stray) {
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
    if (!s.prompt && s.kittenEnc) {
      const kp = s.kittenEnc.promptAt(catP);
      if (kp) {
        s.prompt = { kind: 'kitten' };
        setPrompt(kp);
      }
    }
    if (!s.prompt) {
      const rp = s.race.promptAt(catP);
      if (rp) {
        s.prompt = { kind: 'race' };
        setPrompt(rp);
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
    // v18 Gift Paws. LAST in the chain on purpose: every prompt above it is
    // something the player came over to do, and a scenic spot is a big
    // 3m-wide target that would otherwise shadow a stray standing on it. A
    // cat without the skill never reaches this branch at all, so the prompt
    // ladder is byte-identical to today's for a no-skills save.
    if (!s.prompt && s.gifts && hasSkill(progression.state, 'gift-paws')) {
      const spot = openScenicNear(s, catP);
      if (spot) {
        s.prompt = { kind: 'gift-leave', data: spot };
        setPrompt(`E — leave a gift at ${spot.label}`);
      }
    }
    if (!s.prompt) setPrompt(null);

    // v18 Task 2.3 — the two passive senses abilities. updateInteractions is
    // the one per-frame hook this module owns (main.js's render loop calls it
    // every frame with the live session), which is what makes them reachable
    // in a running walk rather than merely implemented.
    updateSenses(s, catP);

    for (const sc of s.areaData.scenics) {
      if (Math.hypot(sc.x - catP.x, sc.z - catP.z) < 4) {
        log.awardOnce('scenic', `scenic-${sc.id}`, sc.label);
      }
    }

    // Approach-trill: a short "brrrup?" the moment a stray first comes
    // within greeting range, distinct from the "meow" played on the actual
    // E-to-greet (awardStrayGreet). Only fires on the transition INTO
    // 'stray' from some other (or no) prompt kind, not on every frame the
    // prompt stays 'stray'.
    const promptKind = s.prompt ? s.prompt.kind : null;
    if (promptKind === 'stray' && s.lastPromptKind !== 'stray') {
      audio.trill(0.6);
    }
    s.lastPromptKind = promptKind;
  }

  // One cat's lifetime greet count off the live save. recordGreet's return
  // value names only the BASE 1/3/6 rungs, so Charmer — which moves the
  // rungs and never the count — has to read the raw number to know which rung
  // a greet just crossed. Coerced rather than trusted: state.friends round
  // trips through a cloud payload the server stores as opaque jsonb.
  function greetsFor(name) {
    const g = progression.state?.friends?.[name]?.greets;
    return typeof g === 'number' && Number.isFinite(g) && g >= 0 ? g : 0;
  }

  // The save's SPENDABLE balance (state.points, the currency buy() already
  // deducts) — never state.lifetimePoints, which is monotonic and drives the
  // rank ladder. Coerced rather than trusted for the same reason greetsFor
  // above is: the save round-trips through a cloud payload the server stores
  // as opaque jsonb.
  function spendablePoints() {
    const p = progression.state?.points;
    return typeof p === 'number' && Number.isFinite(p) && p >= 0 ? p : 0;
  }

  // Shared greet-award body for a stray cat: friend-points award, progression
  // ladder toast, and marking the stray greeted (so nearest(...,
  // {ungreetedOnly:true}) stops surfacing it). Used by BOTH the E-to-boop
  // interact prompt (below) and chat greetings (sendPhrase in startWalk) so
  // there is exactly one path that can ever pay out a stray friendship
  // award — talking never awards more than booping.
  function awardStrayGreet(s, stray) {
    // -------------------------------------------------------------------
    // v20 Ruffled Fur — D2 IS ENFORCED HERE, not in enemies.js.
    //
    // enemies.js is pure rules over (save, name, walkStamp) and says plainly
    // that it cannot tell a stray from a family pet or a ghost visitor. This
    // is the guard. It is structural in two independent ways — see
    // straycats.isGrudgeableStray: the cat must be an object out of THIS
    // walk's stray array (no ghost, no co-walker's remote pet and no player
    // avatar ever is), AND its name must come from CAT_NAMES, which contains
    // none of the four family pets. Asked once, up front, and consulted by
    // every enemy branch below, so there is no path into the enemy system
    // that skips it.
    // -------------------------------------------------------------------
    const grudgeable = isGrudgeableStray(s.strayCats, stray);

    // THE GRUDGE. A cross cat is not greetable by ANY path. The prompt scan
    // already refuses to offer one (see updateInteractions), so this covers
    // the OTHER door into this function: greet-by-chat (walk.js's sendPhrase
    // → greetStrayByChat), which finds its target with a plain nearest() and
    // would otherwise pay a friendship award to a cat that has been cross
    // since a previous walk. This function is the single path that can ever
    // pay out a stray friendship award, so it is the right place to say no.
    if (grudgeable && progression.hasGrudge?.(stray.name)) return;

    // THE RUPTURE. shouldTurnHostile owns every rule (D5's friend immunity,
    // the Charmer modifier, the derived per-(walk, cat) seed); nothing about
    // the roll is re-decided here. `forgivenThisWalk` is what stops a cat you
    // just made up with from rolling hostile again on the very next greet —
    // the roll is a pure function of (walkStamp, name), so without it the
    // reconciliation would eat itself.
    //
    // recordGrudge is inside the condition, not after it, so the whole beat
    // is GATED ON THE SAVE WRITE ACTUALLY LANDING (the v18 feats.perch
    // lesson). It returns false for an unusable name, a cat already cross, or
    // a full grudge table — and in that last case the `&&` short-circuits
    // into the ordinary greet below, so a player who has somehow fallen out
    // with all 48 cats gets a normal greet rather than a silent dead end
    // that pays nothing and remembers nothing.
    if (grudgeable
        && shouldTurnHostile(progression.state, stray.name, s.walkStamp, {
          forgivenThisWalk: s.enemies?.wasForgiven(stray.name) ?? false,
        })
        && progression.recordGrudge?.(stray.name)) {
      // turnHostile sets stray.greeted itself, so the prompt stops re-offering
      // the cat and the player moves on rather than mashing E at it.
      s.strayCats.turnHostile(stray, s.cat.position);
      audio.hiss();
      s.fx?.burst(stray.group.position, 0x8a3a4a, 10);
      hud.toast(`${stray.name} hisses and backs away… 😾`);
      // No friendship award and NO recordGreet: it did not go well. That is
      // also why the greet count — and therefore the ♡/♥/💕 ladder and D5's
      // immunity — cannot be advanced by a greet that ruptured.
      return;
    }

    s.strayCats.greet(stray, s.cat.position);
    log.awardOnce('friend', `friend-${stray.name}`, 'a new cat friend');
    s.catsGreeted += 1;
    // Still exactly one recordGreet call per greet, with the same arguments
    // as ever — the walkStamp is what its once-per-cat-per-walk dedup guard
    // keys on, and that guard is the whole reason talking to a cat can never
    // out-farm booping it. v18 Charmer ('charmer') reads the count that call
    // produced and decides which RUNG it lands on; it cannot make the count
    // move faster. If the guard rejected this greet, `after` equals `before`
    // and friendRungCrossed returns null — the same silence recordGreet's
    // null return has always produced here.
    const before = greetsFor(stray.name);
    progression.recordGreet(stray.name, stray.breed, s.walkStamp);
    const after = greetsFor(stray.name);
    const level = friendRungCrossed(before, after, {
      charmer: hasSkill(progression.state, 'charmer'),
    });
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
      s.fx.burst(s.cat.position, 0xf2c14e, 12);
      if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'collect', collectibleId: c.id });
    } else if (s.prompt.kind === 'tip') {
      const target = s.prompt.data;
      // v18 CF-2. Big Swat's cascade takes neighbouring props down with the
      // one you swatted, and EVERY prop that actually goes over pays its own
      // awardOnce('mischief', `tip-<id>`).
      //
      // This is not a rebalance: one tipped prop has always paid exactly one
      // mischief award. Before this, only the directly-swatted prop paid, so
      // flattening three in one cascade scored 1 point and moved the "Tip 3
      // things over" goal by 1 where three separate taps scored 3 and moved
      // it by 3 — an ability earned by tipping 40 things made tipping goals
      // slower. An earned ability must never be a downgrade.
      //
      // Which props went over is read back off tippables.list rather than
      // returned by tip(), so nothing about the tippables contract changes —
      // and neither does the wire event, which still names only the swatted
      // prop (a cascade is deliberately local spectacle; the spec's non-goals
      // forbid a new broadcast kind).
      //
      // Farming stays bounded exactly as before: awardOnce is keyed per prop
      // id per walk, and a prop that is down cannot be tipped again this
      // walk, so no prop can pay twice and the per-walk ceiling is still the
      // number of props the area has.
      const standing = s.tippables.list.filter((e) => !e.tipped && e !== target);
      if (s.tippables.tip(target)) {
        log.awardOnce('mischief', `tip-${target.id}`, 'a gravity check 🐾');
        for (const e of standing) {
          if (e.tipped) log.awardOnce('mischief', `tip-${e.id}`, 'a gravity check 🐾');
        }
        s.critters.dismayNear(target.group.position, 8);
        if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'tip', tipId: target.id });
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
    } else if (s.prompt.kind === 'stray-gift') {
      // -----------------------------------------------------------------
      // v20 Ruffled Fur — THE RECONCILIATION. Resolved by the user, so the
      // spec's open question ("what is a gift here?") is answered rather
      // than re-opened:
      //
      //   * it is a TREAT BOUGHT WITH WHISKER POINTS, 10 of them. state.gifts
      //     is a list of world locations already stashed, not an inventory,
      //     and s.walk.carried is a count of collectibles in paw capped at
      //     2 — the game has no carried-gift concept, and inventing one is
      //     what the spec told us not to do. Whisker points are the one
      //     inventory the game actually has, and buy()/deductPoints are the
      //     one spending verb it already understands.
      //   * it is DETERMINISTIC. There is no roll. The grudge has already
      //     cost the player a friendship award and up to three scuffles; an
      //     offer that could fail and still eat the price is a slot machine.
      //
      // Ordered so nothing is consumed unless everything can succeed:
      //   1. is this really a stray (D2) with a grudge left to clear;
      //   2. can it be paid for — checked BEFORE deducting, because
      //      deductPoints floors at zero and would otherwise happily take a
      //      player's last 4 points for a 10-point treat and hand back
      //      nothing. This is the "if they cannot afford it, nothing is
      //      consumed and no grudge is cleared" clause, and it is why the
      //      check is not simply `deductPoints(TREAT_COST) > 0`;
      //   3. only then deduct, and only then forgive.
      // -----------------------------------------------------------------
      const stray = s.prompt.data;
      if (!isGrudgeableStray(s.strayCats, stray) || !progression.hasGrudge?.(stray.name)) return;
      if (spendablePoints() < TREAT_COST) {
        hud.toast(`A treat costs ${TREAT_COST} 🐾 — go and find a few first`);
        return;
      }
      if ((progression.deductPoints?.(TREAT_COST) ?? 0) <= 0) return;
      hud.setPoints?.(progression.state.points);
      // forgiveGrudge is the SINGLE gate on everything below, exactly as
      // leaveGift/claimGift are for Gift Paws: it returns false when there
      // was nothing to forgive, so a second E-press cannot repaint the tag,
      // re-toast, or hand out a second re-greet. The hasGrudge check above
      // means it cannot fail here — but riding the return value rather than
      // assuming it is what stops the two from ever drifting apart.
      if (!progression.forgiveGrudge?.(stray.name)) return;
      // LOAD-BEARING, and called only now that the forgive actually paid.
      // The hostility roll is a pure function of (walkStamp, name), so the
      // cat just forgiven would roll hostile again on the very next greet and
      // the reconciliation would eat itself. This exemption is what lets the
      // spec's "the greet then proceeds normally" actually be normal. Gating
      // it on the return value is what stops a no-op forgive from quietly
      // granting a free re-roll exemption.
      s.enemies?.markForgiven(stray.name);
      // The payoff beat, on the spot: the name tag repaints in place (the
      // entire reason nametag.setNameTagMood exists) and the cat turns to
      // you in the greeting pose. forgive() also clears stray.greeted, so the
      // greet prompt is back on the very next frame — capped as ever by
      // recordGreet's per-walk dedup and awardOnce's per-walk `friend-<name>`
      // key, so the round trip costs 10 and pays 6 at most once. Nothing to
      // farm: it is a net loss by design.
      s.strayCats.forgive(stray, s.cat.position);
      s.fx?.burst(stray.group.position, 0xe05a7a, 14);
      hud.toast(`${stray.name} takes the treat… and forgives you ♡`);
      catVoice();
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
    } else if (s.prompt.kind === 'kitten') {
      s.kittenEnc.interact();
      // Dispatches on the walk's fixed plan kind (set once in startWalk),
      // never the live progression.state.kitten.stage — see the comment on
      // session.kittenPlanKind above for why.
      if (s.kittenPlanKind === 'trail') {
        progression.setKittenStage(1);
        hud.toast('A tiny mew… but nothing here. Maybe next walk. 🐾');
        log.award('quest', 'kitten-trail', 'you followed the tiny paw prints');
      } else if (s.kittenPlanKind === 'meet') {
        progression.setKittenStage(2);
        hud.toast('The kitten trusts you! She follows close. 🐱');
        log.award('quest', 'kitten-meet', 'a lost kitten befriended');
      } else {
        log.awardOnce('pet', 'kitten-nuzzle', 'a nuzzle from Mochi');
      }
    } else if (s.prompt.kind === 'gift-leave') {
      // v18 Gift Paws. progression.leaveGift is the gate: it refuses an
      // unknown area, a spot that already holds one, and the save's cap, and
      // returns false without writing — so the award, the prop and the toast
      // all hang off "a gift was actually stashed" rather than off "E was
      // pressed near a viewpoint".
      const sc = s.prompt.data;
      if (progression.leaveGift?.(s.areaId, sc.id)) {
        s.gifts.add(s.areaId, sc);
        // The existing 'gift' award type at its existing value — the same
        // one the receiving paths pay. Nothing is rebalanced: this is a new
        // discovery, not a new price. It is also what makes the ability's
        // own feat ("Give or receive 3 gifts") count giving, which until now
        // nothing in the game could do. Bounded: one per scenic spot, and
        // the save holds at most 8 outstanding gifts.
        log.awardOnce('gift', `gift-left-${s.areaId}-${sc.id}`, `a gift tucked away at ${sc.label}`);
        s.fx.burst(s.cat.position, 0xe05a7a, 12);
        hud.toast(`Gift hidden at ${sc.label} 🎁 someone will find it`);
        catVoice();
      } else {
        hud.toast('You are out of gifts to leave for now 🎁');
      }
    } else if (s.prompt.kind === 'race') {
      s.race.begin();
    } else if (s.prompt.kind === 'dig') {
      const treat = s.scent.digAt(s.cat.position);
      if (treat) {
        log.awardOnce('treasure', treat.id, 'a buried treasure!');
        s.fx.burst(s.cat.position, 0xf2c14e, 12);
        if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'dig', treatId: treat.id });
      }
    } else if (s.prompt.kind === 'scratch') {
      s.prompt.data.scratched = true;
      log.award('pet', 'pet', 'blissful head scratches');
      audio.purr(2.5);
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

  return {
    doMeow, doYarn, doPounceOrClimb, doCameraToggle, handleTouchAction,
    setPrompt, updateInteractions, awardStrayGreet, handleInteract,
    // Exported for test/interactions.test.js. updateInteractions calls it
    // itself — main.js does not need to, and must not start, or the senses
    // would run twice a frame.
    updateSenses,
  };
}
