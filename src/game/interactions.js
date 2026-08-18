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
import { bestPerch } from '../climbing.js';
import { labelFor } from './labels.js';
import { nowSec } from './util.js';

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
    session.critters.reactToMeow(session.cat.position);
    if (session.strayCats.reactToMeow(session.cat.position) > 0) {
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
    // so a chain of perches within canReach's ≤1.6-per-hop climb budget can
    // be walked upward with repeated presses of this same key, never
    // dropping to the ground in between. bestPerch prefers the HIGHEST
    // reachable candidate (drops are always "reachable" per canReach, so a
    // naive first-match pick could shadow a higher chain-mate with a lower
    // one) — climbs beat drops whenever both are in reach. Hopping down (or
    // off a perch with nothing else in reach) is the fallback.
    const next = bestPerch(session.areaData.perches ?? [], session.cat.position, player.perchY, session.perched);
    if (next) {
      session.perched = next;
      player.perchY = next.y;
      player.halt();
      session.cat.position.set(next.x, next.y, next.z);
      catVoice();
      if (next.vantage) log.awardOnce('scenic', `perch-${next.label}`, next.label);
    } else if (session.perched) {
      session.perched = null;                    // hop down
      player.perchY = 0;
      session.fx.burst(session.cat.position, 0xcbb8a0, 8);
    } else if (session.pounceCooldown <= 0) {
      player.pounce();
      audio.pounceWhoosh();
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
    if (!s.prompt) setPrompt(null);

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
      s.fx.burst(s.cat.position, 0xf2c14e, 12);
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
  };
}
