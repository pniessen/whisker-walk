// Per-frame avatar state, lifted out of main.js's init() closure.
//
// updateAvatar owns everything that reads the player's motion and turns it
// into cat state for this frame: perch release, freeze/pounce/land timers, the
// idle charm pose ladder, footsteps and the bell, puddles and boxes, yarn
// batting, mid-air catches — plus the two co-walk verbs that are detected
// locally from already-synced state (pounce-tag landings and mutual grooming).
// updateMoments runs the timed area "moments" alongside it.
//
// Both already took the live session `s` as their first argument, so this is a
// straight lift; the factory only makes the surrounding systems explicit.

import * as THREE from 'three';
import { PERSONALITIES } from '../cat/brain.js';
import { animateCat } from '../cat/animator.js';
import { aimHead } from '../cat/headaim.js';
import { henFightState } from '../cat/henfight.js';
import { waterPose, applyWaterLook } from '../cat/waterlook.js';
import { shakeProgress } from '../waterstate.js';
import { tagState, groomTimer } from '../verbs.js';
import { critterLabel } from './labels.js';
import { nowSec } from './util.js';
import { wirePose } from '../fightactions.js';
import { uprightTag } from '../nametag.js';
import { tickRest, NAP_PURR_LEN } from '../rests.js';
import { validPetName } from '../net.js';
import { groundTilt, easeTilt } from '../ground.js';
import { bus } from '../events.js';
import { isWalkableAt } from '../player.js';
import { stickTakesOff } from '../climbing.js';

// The y the local cat is drawn at, before the water look: the ground under
// it (Gorge part 1, R4), then perchY + hopY (where player.js drew it), a
// fight's lift and the Market's shoo hop (s.hopLift, marketlive.js; 0 or
// unset everywhere else). On flat ground it is exactly the old sum, with no
// ground term.
export function avatarBaseY(ground, cat, player, s) {
  const rel = player.perchY + player.hopY + (player.floatY || 0) + (s.fight ? (s.fightLift ?? 0) : 0) + (s.hopLift || 0);
  if (!ground || ground.flat) return rel;
  return ground.y(cat.position.x, cat.position.z) + rel;
}

// Her cat's lean into the slope under it (Gorge part 1, R7), eased at
// TILT_RATE, for applyWaterLook. Null on flat ground, so applyWaterLook runs
// today's lines. On a perch she stands on the perch, not the slope, so it
// eases back to level. The eased { pitch, roll } lives on the session, made
// once per walk at the slope's own tilt, so a spawn on a slope starts leaning.
const slopeTarget = { pitch: 0, roll: 0 };
export function avatarSlopeTilt(ground, cat, player, s, dt) {
  if (!ground || ground.flat) return null;
  if (player.perchY > 0) {
    slopeTarget.pitch = 0;
    slopeTarget.roll = 0;
  } else {
    groundTilt(ground, cat.position.x, cat.position.z, cat.rotation.y, slopeTarget);
  }
  if (!s.slopeTilt) {
    s.slopeTilt = { pitch: slopeTarget.pitch, roll: slopeTarget.roll };
    return s.slopeTilt;
  }
  return easeTilt(s.slopeTilt, slopeTarget, dt);
}

// The Reef's float: above this many metres she paddles (the swim pose, tail streaming); below it she walks the sand.
export const FLOAT_PADDLE = 0.3;
const FLOAT_STATE = Object.freeze({ mode: 'swim', shake: 0, sink: 0 }); // only waterPose reads it: the cat's own water state (dry, no waters) still sinks nothing

// Gait pace while a rival's chase scampers the cat (m/s-equivalent).
export const CHASE_GAIT_SPEED = 6;

// The perk line for a mid-air catch: every ready-made pouncer keeps the
// Calico line; a custom pouncer uses its own name.
export function pounceCatchLine(cat) {
  const u = cat.userData;
  if (!u.custom) return 'a Calico masterclass';
  return validPetName(u.customName) ? `${u.customName}'s masterclass` : "a pouncer's masterclass";
}

// The yarn ball's roll home (tickYarnHome).
const YARN_HOME_S = 25;
const YARN_CHECK_S = 0.5;
const YARN_REACH = 0.45; // a cat this close bats it (the bat's own reach is 0.5)
// Can a cat stand within batting reach of a ball at (x, z)?
function reachable(area, x, z) {
  if (isWalkableAt(area, x, z)) return true;
  for (let k = 0; k < 8; k++) {
    const t = (k * Math.PI) / 4;
    if (isWalkableAt(area, x + Math.cos(t) * YARN_REACH, z + Math.sin(t) * YARN_REACH)) return true;
  }
  return false;
}

export function createAvatarUpdater({
  player, progression, settings, log, hud, audio,
  petNameFor, completeTag, noteBat,
}) {
  const fightTilt = { pitch: 0, roll: 0 }; // reused each frame: no allocation mid-fight
  function updateAvatar(s, dt, t) {
    const { cat } = s;
    s.drawOff = player.climbOffset; // the climb jump's draw-only offset (game/composer.js applies it around the render)
    const p = PERSONALITIES[cat.userData.breed];

    // v18 CF-9a — where the PAWS are, as opposed to where the cat is drawn.
    //
    // The pounce now arcs: player.js renders the cat at perchY + a hop offset
    // that peaks 0.35m up for an unskilled cat and 0.9m up with Spring Paws
    // (see player.js's pounceArc header). That offset is deliberately a
    // render offset — it never reaches player.perchY, so the climb rule, the
    // collider push and goldMice.checkFind are all untouched by it.
    //
    // But several proximity checks in this function measure in 3D against
    // cat.position, and those WOULD read the lift as distance: the pounce
    // hunt catch has a 0.9 radius, pounce-tag 1.3, the yarn bat 0.5. Left
    // alone, a Spring Paws cat at the top of its arc is 0.9m from a squirrel
    // standing right under it and the hunt simply fails — an earned ability
    // making its own signature action harder, the same "an ability must never
    // be a downgrade" failure CF-2 fixed for Big Swat. The yarn bat is worse
    // still: its radius is 0.5 and the ball rolls at y 0.2, so a Spring Paws
    // apex is out of range on the vertical term ALONE, before the ball is
    // even offset horizontally — a cat could not bat a ball it was pouncing
    // directly onto. (The 0.35 baseline arc is harmless there by luck rather
    // than by design: it happens to land nearer the ball's own height than
    // the ground does. Relying on that would make the numbers above load-
    // bearing for a system that has nothing to do with them.)
    //
    // So those checks measure from the paws' ground plane instead. This is
    // exactly the trick the mid-air critter catch below already uses with its
    // fixed .setY(0.8), and it is a NO-OP whenever the cat is not mid-hop:
    // outside the 0.3s window player.js sets cat.position.y to precisely
    // player.perchY, so `paws` is then the same point cat.position is.
    // Computed BEFORE the perch release just below, so it describes the frame
    // that has already been rendered (player.update ran first, off the perchY
    // this line reads) rather than the one about to be.
    // Gorge part 1 (R4): perchY is relative, so the paws' plane is the ground
    // under the cat plus perchY (just perchY on flat ground).
    const groundUnder = s.ground && !s.ground.flat ? s.ground.y(cat.position.x, cat.position.z) : null;
    const paws = cat.position.clone().setY(groundUnder === null ? player.perchY : groundUnder + player.perchY);

    // A push takes her off a perch, but not the one she jumped onto with the
    // stick still held, until it is let go (climbing.js stickTakesOff).
    if (stickTakesOff(s, player.inputActive)) {
      s.perched = null;
      player.perchY = 0;
    }
    s.critters.setFleeModifier((s.perched || player.stalking ? 0.5 : 1) * (p.special === 'bird' ? 0.15 : 1));
    s.critters.markStalked(cat.position, player.stalking);

    if (s.freezeTime > 0) s.freezeTime -= dt;
    // Clan Life Part 2: a fight holds the cat still (game/clanfight.js moves it).
    player.speedFactor = (s.freezeTime > 0 || s.perched || s.fight) ? 0 : (player.stalking ? 0.45 : 1) * (s.areaLife?.pace ?? 1); // a place may slow her (the Old House's crinkly tunnel)
    // a perch climb drawn as a jump (s.climbT, game/interactions.js) shares this pose window and the one landing thump
    const wasPouncing = s.pounceTime > 0 || s.climbT > 0;
    if (s.pounceTime > 0) s.pounceTime -= dt;
    if (s.climbT > 0) s.climbT -= dt;
    if (wasPouncing && !(s.pounceTime > 0) && !(s.climbT > 0)) {
      if (player.inWater) {
        audio.waterSplash('wade'); // landed in water: a splash, no sandy poof or thump
      } else {
        s.fx.burst(cat.position, 0xcbb8a0, 8); // dust poof on landing
        audio.landThump();
      }
      // For the light tap of a landing (src/haptics.js, wired in main.js).
      bus.emit('pounce:land', { water: !!player.inWater });
      s.landTime = 0.12;
      // pounce-tag (Task 6.2, room walks only): landing within 1.3 of a
      // remote counts as a tag touch. Feed it through tagState — this is
      // the same reducer applyRemoteEvent's 'pounce-tag' handler uses for
      // an incoming touch, so whichever side lands second (within 30s, on
      // the same partner) completes the chain right here, locally, without
      // waiting on the network. completeTag also fires a 'tag-back' so the
      // FIRST toucher (who can't complete locally — they're still waiting)
      // converges too, mirroring completeBoop's convergence pattern.
      if (s.net) {
        let nearest = null;
        let nearestDist = 1.3;
        for (const r of s.remotes.list) {
          if (r.group.visible === false) continue; // not drawn yet (remotecats.js): nobody to tag
          const d = r.group.position.distanceTo(paws);
          if (d < nearestDist) { nearestDist = d; nearest = r; }
        }
        if (nearest) {
          const now = nowSec();
          s.tagChain = tagState(s.tagChain, { type: 'pounce-tag', fromId: nearest.playerId }, now);
          s.net.sendEvent({ v: 1, id: s.playerId, type: 'pounce-tag', toId: nearest.playerId });
          if (s.tagChain.completed) {
            completeTag(s, nearest.playerId);
          } else {
            hud.toast('Tag! Pounce them back! 🐾');
          }
        }
      }
    }
    if (s.pounceCooldown > 0) s.pounceCooldown -= dt;
    if (s.landTime > 0) s.landTime -= dt;

    // A rival's chase moves the cat itself (player.halt() zeroes player.speed),
    // so feed the gait the scamper's pace and never let a long sit go to sleep.
    // A fight's walk-over runs at the fight's own gait (s.fightGait).
    // On a crossing or in a hop (traversallive.js) she is held (player.speed
    // is 0) and the moves say her pace.
    const speed = s.chasing ? CHASE_GAIT_SPEED : s.fight ? (s.fightGait ?? 0) : s.traversal?.busy ? s.traversal.speed : player.speed;
    // Swimming: no groom, sit or nap in the water, so the idle clock holds.
    // Nor in a fight.
    if (speed > 0.3 || player.inWater || s.fight) s.idleTime = 0;
    else s.idleTime += dt;

    // soft footsteps: a near-subliminal tick each time the gait phase
    // wraps, while actually moving at a brisk pace. In the water the gate is
    // lower (wading and swimming are slow) and the tick becomes a splash.
    s.stepPhase += speed * dt * 2.2;
    if (s.stepPhase > 1 && speed > (player.inWater ? 0.3 : 1.5)) {
      s.stepPhase = 0;
      if (player.wading) audio.waterSplash('wade');
      else if (player.swimming) audio.waterSplash('paddle');
      else audio.step();
    }
    // Climbing out shakes dry. `shook` is never set on the perch path, so
    // hopping straight up onto a perch from the water is silent.
    if (player.waterState.shook) audio.waterSplash('shake');

    // idle charm: stand still and you groom, then sit, then curl up
    const napper = p.special === 'napper';
    const groomAt = napper ? 3 : 6;
    const sitAt = napper ? 5 : 10;
    const napAt = napper ? 8 : 16;

    if (s.stretchTime > 0) s.stretchTime -= dt;
    if (s.sniffTime > 0) s.sniffTime -= dt;
    // v21 3b Task 15 — a drink, a nibble or a nap (game/interactions.js starts
    // it). Anything that moves the cat ends it, so a nap can never trap one:
    // the arrow keys or the joystick (inputActive), a pounce, a climb, a scare
    // or a chase. A nap keeps purring until then, and not a moment after —
    // no session, no tick, no purr. Pays nothing.
    if (s.rest) {
      const stirred = player.inputActive || s.pounceTime > 0 || !!s.perched || s.freezeTime > 0 || !!s.chasing;
      const napping = s.rest.kind === 'nap';
      const next = tickRest(s.rest, dt, { stirred });
      s.rest = next.rest;
      // The haptic purr follows the sound piece by piece, and stops the
      // moment the nap does rather than when the last piece fades.
      if (next.purr) { audio.purr(NAP_PURR_LEN); bus.emit('purr', { seconds: NAP_PURR_LEN }); }
      if (napping && !s.rest) bus.emit('purr:end');
    }
    // Under the sea (the Reef): a rest, a nap or a perch puts her back on the sand; while she floats she is never idle, and above 0.3 m she paddles.
    let floating = player.floatY > FLOAT_PADDLE;
    floating ||= !!s.perched?.swim; // a mount in the Reef swims her (nothing else sets perched.swim)
    if (player.floatY > 0) {
      if (s.rest || s.perched) player.clearFloat();
      else s.idleTime = 0;
    }
    const wasNapping = s.pose === 'nap';
    let pose = 'follow';
    if (s.freezeTime > 0) pose = 'scared';
    // The moves (traversallive.js) say their own: stalk on a crossing and in
    // a hop's crouch, pounce in the air, land, follow while she looks across.
    else if (s.traversal?.pose) pose = s.traversal.pose;
    else if (s.pounceTime > 0 || s.climbT > 0) pose = 'pounce';
    else if (s.landTime > 0) pose = 'land';
    // On a cow's back (farmanimals.js) she sits, and lying still as long as an
    // idle nap takes she curls up and naps there as the cow ambles on.
    // A seat of the Fairground's rides (fairsim.js) may say its own pose: she
    // stands on the merry-go-round's platform.
    else if (s.perched?.pose) pose = s.perched.pose;
    else if (s.perched) pose = s.perched.ride && s.idleTime > napAt ? 'nap' : 'perch';
    else if (s.boxTime > 1) pose = 'requestPet';
    else if (s.stretchTime > 0) pose = 'stretch';
    else if (s.sniffTime > 0) pose = 'sniff';
    else if (s.rest) pose = s.rest.kind === 'nap' ? 'nap' : 'sniff'; // head down to drink or eat
    else if (speed > 0.3 && (player.stalking ?? false)) pose = 'stalk';
    else if (s.idleTime > napAt) pose = 'nap';
    else if (s.idleTime > sitAt) pose = 'requestPet';
    else if (s.idleTime > groomAt) pose = 'groom';
    if (wasNapping && pose !== 'nap' && s.stretchTime <= 0) {
      s.stretchTime = 1; // wake-up stretch
      pose = 'stretch';
    }
    if (s.chasing) { pose = 'follow'; s.stretchTime = 0; }
    // Clan Life Part 2: the fight sets the pose (game/clanfight.js).
    if (s.fight && s.fightPose) { pose = s.fightPose; s.stretchTime = 0; }
    // s.pose stays the LAND pose: it is what goes on the wire, and every
    // remote works out its own water look from where this cat is. The new
    // fight states go out as states every build knows (R8); the drawn pose
    // below stays `pose`.
    s.pose = wirePose(pose);
    const reducedMotion = settings.get('reducedMotion');
    const ws = player.waterState;
    const amount = Math.sin(Math.PI * shakeProgress(ws));
    // The Reef's swim pose (cat/reefswim.js): only where the place has a float, so nothing anywhere else moves a byte.
    // Loaded the first time a place has a float, so the start-up bundle never carries it.
    if (player.canFloat && s.swimMod === undefined) { s.swimMod = null; import('../cat/reefswim.js').then((m) => { s.swimMod = m; }); }
    const sm = s.swimMod;
    const swim = sm ? (s.swim ??= sm.newSwim()) : null;
    if (swim) {
      sm.swimStep(swim, floating, player.floatY, dt, reducedMotion);
      cat.userData.swimDo ??= (c, tt) => sm.swimDo(c, swim, tt);
    }
    const drawn = waterPose(pose, floating ? FLOAT_STATE : ws, { hagrid: cat.userData.breed === 'hagrid', reducedMotion });
    // Hagrid draws a fight's states as his hen ones (cat/henfight.js); the wire
    // pose above is untouched, so every other build sees the usual fight states.
    animateCat(cat, s.fight && cat.userData.breed === 'hagrid' ? henFightState(drawn) : drawn, t, speed, reducedMotion, amount);
    // Her head turned to look (the Market's coo sets s.lookAt): opt-in, nothing without a target (cat/headaim.js).
    aimHead(cat, s.lookAt, dt, drawn, speed);
    // Sets y outright: ground + perchY + hopY (where player.js drew it) − sink + bob.
    // A fight (game/clanfight.js) lifts, pitches and rolls the cat through
    // s.fightLift / s.fightPitch / s.fightRoll; applyWaterLook sets them. The
    // slope's lean (Gorge part 1, R7) keeps easing underneath; a fight's tilt wins.
    if (s.fight) { fightTilt.pitch = s.fightPitch ?? 0; fightTilt.roll = s.fightRoll ?? 0; }
    applyWaterLook(cat, ws, t, dt, reducedMotion, avatarBaseY(s.ground, cat, player, s), amount,
      s.fight ? fightTilt : null, avatarSlopeTilt(s.ground, cat, player, s, dt));
    if (swim) sm.swimGroup(cat, swim, t);
    // Her own name tag (a custom cat's) rides the group: through a fight's
    // pitch and roll it stays straight above her torso, and is put back after.
    // On raised ground it stays straight through the slope's lean too.
    const ownTag = cat.userData.ownTag;
    const lean = !s.fight && s.ground && !s.ground.flat ? s.slopeTilt : null;
    if (ownTag && (s.fight || lean || ownTag.userData.restY !== undefined)) {
      uprightTag(ownTag, s.fight ? cat.rotation.x : lean ? lean.pitch : 0, s.fight ? cat.rotation.z : lean ? lean.roll : 0,
        cat.userData.parts?.body?.position.y ?? 0);
    }

    // nap pile: napping near another napping remote pet is worth a shared award;
    // toast text scales with the pile size (n nearby nappers + you)
    //
    // v21 3b Task 15: only once the cat has lain still as long as an idle nap
    // takes. A nap on a cushion pays nothing (ruling P1), so it must not be a
    // quicker way to the pile than lying still is; it takes nothing away either.
    if (pose === 'nap' && (!s.rest || s.idleTime > napAt)) {
      const n = s.remotes.list.filter(
        (r) => r.pose === 'nap' && r.group.position.distanceTo(cat.position) < 1.2
      ).length;
      if (n >= 1) {
        const text = `nap pile of ${n + 1}! 😴`;
        const points = log.awardOnce('nappile', 'nappile', text);
        if (points > 0) hud.toast(text);
      }
    }

    // mutual grooming (Task 6.2, room walks only): local-only detection —
    // poses already sync via the normal remote-state broadcast, so unlike
    // pounce-tag this needs no dedicated event, just each side watching the
    // OTHER'S synced pose. Per-remote continuous-hold timers (keyed by
    // playerId, since more than one remote could be nearby at once) live in
    // s.groomTimers; awardOnce dedupes the pair-per-walk award identically
    // on both sides once each independently reaches 2s.
    if (s.net) {
      for (const r of s.remotes.list) {
        const bothGrooming = pose === 'groom' && r.pose === 'groom';
        const close = r.group.position.distanceTo(cat.position) < 1.2;
        const prev = s.groomTimers.get(r.playerId) ?? null;
        const next = groomTimer(prev, dt, { bothGrooming, close });
        s.groomTimers.set(r.playerId, next);
        if (next.done) {
          const points = log.awardOnce('groom', `groom-${r.playerId}`, `mutual grooming with ${petNameFor(s, r.playerId)} 🫧`);
          if (points > 0) {
            hud.toast(`mutual grooming with ${petNameFor(s, r.playerId)} 🫧`);
            s.fx.burst(cat.position, 0xd8b4e2, 8);
          }
        }
      }
    }

    if (progression.state.equipped.collar === 'bell' && speed > 1 && Math.random() < dt * 1.6) {
      audio.bell();
    }

    for (const pd of s.areaData.puddles) {
      const inPuddle = Math.hypot(pd.x - cat.position.x, pd.z - cat.position.z) < pd.r + 0.2;
      if (!inPuddle) continue;
      // A puddle on a ledge or the clifftop is not underfoot for a cat on
      // the floor below it (or above it). Always true on flat ground.
      if (s.ground && !s.ground.sameLevel(cat.position.x, cat.position.z, pd.x, pd.z)) continue;
      const key = `puddle-${pd.x}-${pd.z}`;
      if (progression.state.equipped.feet === 'booties') {
        log.awardOnce('perk', key, 'a joyful puddle splash');
      } else if (p.special !== 'steady' && !s.balkedPuddles.has(key)) {
        s.balkedPuddles.add(key);
        s.freezeTime = Math.max(s.freezeTime, 0.8); // don't shorten a scuffle freeze
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

    // yarn play: run into the ball to bat it, resting or rolling, even with
    // something in the mouth; four bats in a walk (they count for the whole
    // walk) are a good play session. Not a ball in this cat's own mouth.
    if (s.toy.active && !s.toy.held) {
      const dist = paws.distanceTo(s.toy.mesh.position);
      if (dist < 0.5 && s.batReady) {
        s.toy.bat(cat.position);
        s.batCount += 1;
        s.batReady = false;
        bus.emit('tip:did', { id: 'yarn' });
        if (s.batCount === 4) log.awardOnce('play', 'play', 'a very good play session');
      } else if (dist > 1.1) {
        s.batReady = true;
      }
      tickYarnHome(s, dt);
    } else if (s.toyGhost.visible) {
      // yarn rally: batting a REMOTE-owned ghost ball requests authority
      // over it — the actual handoff happens once the owner's client
      // receives our 'bat' event (see applyRemoteEvent).
      const dist = paws.distanceTo(s.toyGhost.position);
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
      const caught = s.critters.catchAt(cat.position.clone().setY(groundUnder === null ? 0.8 : groundUnder + 0.8));
      if (caught) {
        log.award('perk', 'catch', 'a mid-air catch!');
        if (p.special === 'pouncer') log.award('perk', 'pouncer-catch', pounceCatchLine(cat));
        progression.recordSighting(caught.type);
      }
      // From the paws, not the drawn body: this runs on every frame of the
      // 0.3s hop, and its radius (0.9) is the same size as the Spring Paws
      // arc, so measuring from the lifted body would make the taller jump
      // miss the very critter it is jumping at.
      const hunted = s.critters.pounceCatch(paws);
      if (hunted) {
        const bonus = hunted.wasStalked ? ' — a perfect sneak!' : '';
        log.award('hunt', `hunt-${hunted.type}`, `you pounce-tagged ${critterLabel(hunted)}!${bonus}`);
        progression.recordSighting(hunted.type);
        if (hunted.wasStalked) { s.slowmoTime = 0.8; audio.fanfare(); }
      }
    }
  }

  // The yarn ball is never lost (controls review, 2026-11-19): left anywhere,
  // it stays there; only after YARN_HOME_S seconds somewhere no cat can get
  // within batting reach of it (past a fence, in a footprint, off walkable
  // ground) does it roll back to its spot. Checked twice a second. It stays
  // this device's if it was (a co-walker keeps seeing it as the ghost ball).
  function tickYarnHome(s, dt) {
    const toy = s.toy;
    if (!toy.spot || !s.areaData) return;
    s.yarnCheck = (s.yarnCheck ?? 0) + dt;
    if (s.yarnCheck < YARN_CHECK_S) return;
    const step = s.yarnCheck;
    s.yarnCheck = 0;
    const p = toy.mesh.position;
    s.yarnStuck = reachable(s.areaData, p.x, p.z) ? 0 : (s.yarnStuck ?? 0) + step;
    if (s.yarnStuck < YARN_HOME_S) return;
    s.yarnStuck = 0;
    const wasMine = toy.claimed;
    toy.placeAt(toy.spot);
    toy.claimed = wasMine;
    const where = s.yarnSpot?.where;
    hud.toast(where ? `The yarn ball rolled back ${where} 🧶` : 'The yarn ball rolled back 🧶');
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

  return { updateAvatar, updateMoments };
}
