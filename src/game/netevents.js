// Co-walk network event handling, lifted out of main.js's init() closure.
//
// Every function here already took the live session `s` as its first
// argument before the extraction, so the move is a straight lift: the
// factory only makes the surrounding dependencies (log/hud/audio/samples,
// the lazy cloud handles, catVoice, applyGoalResult) explicit instead of
// closed-over.

import * as THREE from 'three';
import { tagState } from '../verbs.js';
import { voiceFor } from '../catvoice.js';
import { nowSec, meowVolumeForDistance } from './util.js';
import { isStrayName } from '../straynames.js';

// v21 3b Task 8 — a co-walker who disappears takes what she was carrying with
// her. takeHeldItemsWithRemotes(remotes, items, localCat) wraps the walk's
// remote cats (remotecats.js) so that after anything that can remove one — a
// roster drop (remove), a silent despawn (update, after DESPAWN_AFTER), a
// rejoin with a different pet (upsert, which removes the old mesh) — every
// item held by a cat that is neither mine nor a remote still in the walk is
// taken: off the ground, held by nobody, hidden for the rest of the walk. So
// carryables.update never follows a disposed group. The local cat's item is
// never touched. Call once per walk, right after both exist.
export function takeHeldItemsWithRemotes(remotes, items, localCat) {
  function release() {
    let live = null;
    for (const it of items.list) {
      const h = it.holder;
      if (!h || h === localCat) continue;
      live ??= new Set(remotes.list.map((r) => r.group));
      if (!live.has(h)) items.take(it.id);
    }
  }
  for (const name of ['upsert', 'remove', 'update']) {
    const inner = remotes[name];
    remotes[name] = (...args) => {
      const out = inner(...args);
      release();
      return out;
    };
  }
}

// An item a departed co-walker took with her: off the ground and held by
// nobody (carryables' take). Nothing a later event says brings it back.
function wentAway(item) {
  return !item.onGround && !item.holder;
}

// getPartner() → my colony partner ({ playerId, petName, wardrobe }) or null
// (v21 Stream 2). Optional: without it no colony-feed is ever shown.
export function createNetEvents({ MP, getCloud, getPsecret, log, hud, audio, samples, catVoice, applyGoalResult, getPartner }) {
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

  // Pounce-tag chain convergence point (Task 6.2). Reachable from two
  // places: our own landing-detection in updateAvatar, when tagState
  // reports the chain we just touched completed locally; and a remote
  // 'tag-back' confirm addressed to us. awardOnce dedupes per pair per
  // walk exactly like completeBoop, and the outbound 'tag-back' it sends
  // is gated on points > 0 so the redundant paths stay harmless.
  function completeTag(s, otherId) {
    const points = log.awardOnce('tag', `tag-${otherId}`, `tag with ${petNameFor(s, otherId)}! 🏃`);
    if (points > 0) {
      hud.toast(`tag with ${petNameFor(s, otherId)}! 🏃`);
      s.fx.burst(s.cat.position, 0xffd166, 10);
      if (s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'tag-back', toId: otherId });
    }
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
      if (samples.has(ev.breed)) {
        samples.play(ev.breed, { rate: 0.95 + Math.random() * 0.1, volume: vol });
      } else if (ev.breed === 'hagrid') audio.cluck(vol); else audio.meow(vol, 1, voiceFor(ev.breed));
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
    } else if (ev.type === 'pounce-tag') {
      if (ev.toId !== s.playerId) return;
      s.tagChain = tagState(s.tagChain, { type: 'pounce-tag', fromId: ev.id }, nowSec());
      if (s.tagChain.completed) completeTag(s, ev.id);
    } else if (ev.type === 'tag-back') {
      if (ev.toId === s.playerId) completeTag(s, ev.id);
    } else if (ev.type === 'goal-progress') {
      if (s.goals) applyGoalResult(s, s.goals.noteDuoRemote(ev.goalId));
    } else if (ev.type === 'colony-feed') {
      showPartnerFeed(s, ev);
    } else if (ev.type === 'carry-pick' || ev.type === 'carry-drop') {
      applyRemoteCarry(s, ev);
    }
  }

  // v21 3b Task 8 — a co-walker picked something up ('carry-pick') or put it
  // down ('carry-drop', from her E or from rain). Sent by game/interactions.js's
  // pickUpCarryable and putDownCarried. WORLD STATE ONLY: no toast, no points,
  // no feat, no mark, no save — and her drop never becomes a mark of mine
  // (my mouth's bookkeeping is never touched).
  //
  // The item must be one of this walk's carryables (found with list.find, so a
  // '__proto__' id is just an unknown id) and the sender a remote in this walk.
  // If I am holding it, nothing changes for me: a simultaneous grab has no
  // loser between two sisters — both cats hold one. A thing that left with a
  // departed co-walker (takeHeldItemsWithRemotes) stays gone. A drop's pos must
  // be two finite numbers inside this area's bounds (inclusive: the sender
  // clamps to them), or it is ignored and the item stays in her mouth.
  function applyRemoteCarry(s, ev) {
    const items = s.carry?.items;
    if (!items || typeof ev.itemId !== 'string') return;
    const remote = s.remotes?.list.find((r) => r.playerId === ev.id);
    if (!remote) return;
    const item = items.list.find((it) => it.id === ev.itemId);
    if (!item || s.carry.mouth?.held?.id === item.id || wentAway(item)) return;
    if (ev.type === 'carry-pick') {
      items.hold(item.id, remote.group);
      return;
    }
    const b = s.areaData?.bounds;
    if (!b || !Array.isArray(ev.pos) || ev.pos.length !== 2) return;
    const [x, z] = ev.pos;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return;
    items.placeAt(item.id, x, z);
  }

  // v21 Stream 2 — my partner fed a colony cat on this walk (sent by
  // game/interactions.js's feedStray). DISPLAY ONLY: a toast and a burst at
  // that stray. It never writes the save — the durable feed reaches me
  // through colonysync's next pull, sanitized there like every cloud value.
  // Only on a colony walk (everyone else is my partner), only from my
  // partner's id, and only for a known cat name (isStrayName: CAT_NAMES or
  // KIT_NAMES, since a fed kit is fed on a walk too), so nothing else can put
  // words on my screen. The toast is textContent (hud.toast), so the
  // partner's pet name is never markup.
  function showPartnerFeed(s, ev) {
    if (!s.colonyWalk) return;
    const partner = getPartner?.();
    if (!partner || typeof partner.playerId !== 'string' || ev.id !== partner.playerId) return;
    if (!isStrayName(ev.cat)) return;
    const who = partner.petName ? String(partner.petName) : 'Your partner';
    hud.toast(`${who} fed ${ev.cat} 🐟`);
    const stray = s.strayCats?.strays?.find((c) => c.name === ev.cat);
    if (stray) s.fx?.burst(stray.group.position, 0xf2c14e, 12);
  }

  return { petNameFor, turnToFace, completeBoop, completeTag, noteBat, maybeSnipeToast, applyRemoteEvent };
}
