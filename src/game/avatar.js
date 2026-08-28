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
import { tagState, groomTimer } from '../verbs.js';
import { labelFor } from './labels.js';
import { nowSec } from './util.js';

export function createAvatarUpdater({
  player, progression, settings, log, hud, audio,
  petNameFor, completeTag, noteBat,
}) {
  function updateAvatar(s, dt, t) {
    const { cat } = s;
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
    const paws = cat.position.clone().setY(player.perchY);

    if (s.perched && player.inputActive) {
      s.perched = null;
      player.perchY = 0;
    }
    s.critters.setFleeModifier((s.perched || player.stalking ? 0.5 : 1) * (p.special === 'bird' ? 0.15 : 1));
    s.critters.markStalked(cat.position, player.stalking);

    if (s.freezeTime > 0) s.freezeTime -= dt;
    player.speedFactor = (s.freezeTime > 0 || s.perched) ? 0 : player.stalking ? 0.45 : 1;
    const wasPouncing = s.pounceTime > 0;
    if (s.pounceTime > 0) s.pounceTime -= dt;
    if (wasPouncing && s.pounceTime <= 0) {
      s.fx.burst(cat.position, 0xcbb8a0, 8); // dust poof on landing
      audio.landThump();
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

    const speed = player.speed;
    if (speed > 0.3) s.idleTime = 0;
    else s.idleTime += dt;

    // soft footsteps: a near-subliminal tick each time the gait phase
    // wraps, while actually moving at a brisk pace
    s.stepPhase += speed * dt * 2.2;
    if (s.stepPhase > 1 && speed > 1.5) {
      s.stepPhase = 0;
      audio.step();
    }

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
    else if (s.landTime > 0) pose = 'land';
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
      const key = `puddle-${pd.x}-${pd.z}`;
      if (progression.state.equipped.feet === 'booties') {
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
      const dist = paws.distanceTo(s.toy.mesh.position);
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
      const caught = s.critters.catchAt(cat.position.clone().setY(0.8));
      if (caught) {
        log.award('perk', 'catch', 'a mid-air catch!');
        if (p.special === 'pouncer') log.award('perk', 'pouncer-catch', 'a Calico masterclass');
        progression.recordSighting(caught.type);
      }
      // From the paws, not the drawn body: this runs on every frame of the
      // 0.3s hop, and its radius (0.9) is the same size as the Spring Paws
      // arc, so measuring from the lifted body would make the taller jump
      // miss the very critter it is jumping at.
      const hunted = s.critters.pounceCatch(paws);
      if (hunted) {
        const bonus = hunted.wasStalked ? ' — a perfect sneak!' : '';
        log.award('hunt', `hunt-${hunted.type}`, `you pounce-tagged ${labelFor(hunted.type)}!${bonus}`);
        progression.recordSighting(hunted.type);
        if (hunted.wasStalked) { s.slowmoTime = 0.8; audio.fanfare(); }
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

  return { updateAvatar, updateMoments };
}
