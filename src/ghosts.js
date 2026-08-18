import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { makeNameTag } from './nametag.js';
import { PERSONALITIES } from './cat/brain.js';
import { validPetName } from './net.js';

const WANDER_SPEED = 1.1; // ghosts amble slower than strays — they're just visiting

/**
 * rollGhosts(rng, friends) -> chosen
 *
 * Pure selection logic for which cross-walk friends show up as translucent
 * "ghost" visitors on a solo walk. `friends` is [{playerId, greets, profile}]
 * (profile is whatever createGhosts needs downstream — this function never
 * looks at it). Every friend with at least one greet gets a single 1-in-3
 * roll, consumed in list order; the walk shows at most 4 ghosts, so once 4
 * have been chosen no further rolls happen (remaining friends are simply
 * never visited that walk, not "rolled and rejected").
 */
export function rollGhosts(rng, friends) {
  const chosen = [];
  for (const friend of friends) {
    if (!friend || !(friend.greets >= 1)) continue;
    if (rng() < 1 / 3) {
      chosen.push(friend);
      if (chosen.length >= 4) break;
    }
  }
  return chosen;
}

// Ghost profiles arrive from OTHER players' `pushProfile` rows via the
// public `profiles` select — untrusted, and unlike a co-walk roster there's
// no server-side format constraint on pet_name/breed beyond NOT NULL (see
// docs/supabase-setup.sql). Mirrors remotecats.js's sanitizeProfile: an
// unrecognized breed falls back to 'tabby' rather than handing buildCat a
// key it doesn't know (which throws), and petName is whitelisted the same
// way net.js's outgoing validPetName does for co-walk names.
function sanitizeGhostProfile(raw) {
  const breed = Object.prototype.hasOwnProperty.call(PERSONALITIES, raw?.breed) ? raw.breed : 'tabby';
  const petName = validPetName(raw?.petName) ? raw.petName : 'Mystery Cat';
  const accessories = raw?.accessories && typeof raw.accessories === 'object' ? raw.accessories : {};
  const greets = Number.isFinite(raw?.greets) ? raw.greets : 0;
  return { playerId: raw?.playerId, petName, breed, accessories, greets };
}

/**
 * createGhosts(scene, area, profiles, rng) -> ghosts
 *
 * Spawns translucent "ghost" visits from cross-walk friends chosen by
 * rollGhosts, into a SOLO walk's scene only. Each ghost wanders its own
 * small home patch like a stray cat (see the update() loop below, a
 * deliberately-smaller reimplementation of createStrayCats' wander FSM —
 * ghosts don't react to the player's toy/speed/stalking the way strays do,
 * they're atmosphere until you walk up and greet them).
 */
export function createGhosts(scene, area, profiles, rng = Math.random, opts = {}) {
  const b = area.bounds;
  const ghosts = [];
  // v18 Task 3.2 Gift Paws: a gift this player stashed at a scenic spot on
  // an earlier walk, which a ghost visitor is here to have found. Handed to
  // the FIRST ghost only — at most one gift is found per walk (see
  // gifts.js's pickFoundGift) — and that ghost is spawned AT the spot with
  // its wander home there, so the payoff scene is the friend standing next
  // to your present rather than a toast from across the map.
  //
  // Note this is `foundGift`, not the pre-existing `hasGift`: the two are
  // opposite directions of the same gesture (hasGift is a best friend
  // bringing YOU something) and conflating them would have made one award
  // path fire for both.
  const gift = opts?.gift && Number.isFinite(opts.gift.x) && Number.isFinite(opts.gift.z)
    ? opts.gift
    : null;

  for (const raw of profiles) {
    const profile = sanitizeGhostProfile(raw);
    const group = buildCat(profile.breed, profile.accessories, { simple: true });

    // Half-opacity "ghost" look. buildCat's `mat()` helper constructs a
    // fresh MeshLambertMaterial per mesh — never shared/cached across calls
    // — so mutating every material found by traverse() here is safe and
    // can't bleed transparency into any other cat (local/stray/remote)
    // built from the same breed elsewhere in the scene.
    group.traverse((obj) => {
      if (!obj.material) return;
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        m.transparent = true;
        m.opacity = 0.5;
      }
    });

    // Both draws happen either way, so which ghost carries the gift can
    // never change how the remaining ghosts are placed.
    const rx = THREE.MathUtils.lerp(b.minX * 0.7, b.maxX * 0.7, rng());
    const rz = THREE.MathUtils.lerp(b.minZ * 0.7, b.maxZ * 0.7, rng());
    const carriesGift = gift && ghosts.length === 0;
    const x = carriesGift ? gift.x : rx;
    const z = carriesGift ? gift.z : rz;
    group.position.set(x, 0, z);
    group.rotation.y = rng() * Math.PI * 2;

    const tag = makeNameTag(`${profile.petName} 👻`);
    if (tag) {
      tag.visible = true; // ghosts are always labeled, like remote co-walk pets
      group.add(tag);
    }
    scene.add(group);

    ghosts.push({
      playerId: profile.playerId,
      petName: profile.petName,
      breed: profile.breed,
      group,
      tag,
      home: new THREE.Vector3(x, 0, z),
      target: null,
      state: 'idle', // idle | wander | greet
      pose: 'follow',
      timer: 1 + rng() * 3,
      greeted: false,
      // Best-friend (greets >= 6) ghosts have a 30% chance of carrying a
      // gift, rolled once at spawn — mirrors the identical stray mechanic
      // in main.js's startWalk (`stray.hasGift = Math.random() < 0.3` for
      // friendLevel 'best'), just keyed off the cross-walk greets count
      // instead of the local friend ladder.
      hasGift: profile.greets >= 6 && rng() < 0.3,
      // v18 Gift Paws — the gift THIS player left, which this ghost found.
      // Cleared by game/interactions.js the moment it is handed over.
      foundGift: carriesGift ? gift : null,
    });
  }

  return {
    get list() {
      return ghosts;
    },
    nearest(pos, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const g of ghosts) {
        if (g.greeted) continue;
        const d = g.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      return best;
    },
    greet(ghost, fromPos) {
      ghost.state = 'greet';
      ghost.timer = 3;
      ghost.greeted = true;
      ghost.group.rotation.y =
        Math.atan2(fromPos.x - ghost.group.position.x, fromPos.z - ghost.group.position.z) + Math.PI;
    },
    dispose() {
      for (const g of ghosts) scene.remove(g.group);
    },
    update(dt, t) {
      for (const g of ghosts) {
        if (g.state === 'greet') {
          animateCat(g.group, 'requestPet', t, 0); // tail up, head raised toward you
          g.timer -= dt;
          if (g.timer <= 0) {
            g.state = 'idle';
            g.pose = 'follow';
            g.timer = 2 + Math.random() * 3;
          }
          continue;
        }

        g.timer -= dt;
        if (g.timer <= 0) {
          if (g.state === 'idle') {
            g.state = 'wander';
            const a = Math.random() * Math.PI * 2;
            const r = 4 + Math.random() * 8;
            g.target = g.home.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
            g.target.x = THREE.MathUtils.clamp(g.target.x, b.minX + 2, b.maxX - 2);
            g.target.z = THREE.MathUtils.clamp(g.target.z, b.minZ + 2, b.maxZ - 2);
            g.timer = 12; // give up on unreachable targets eventually
          } else {
            g.state = 'idle';
            g.pose = Math.random() < 0.4 ? 'sniff' : 'follow';
            g.timer = 2 + Math.random() * 4;
          }
        }

        let speed = 0;
        if (g.state === 'wander' && g.target) {
          const dir = g.target.clone().sub(g.group.position).setY(0);
          if (dir.length() < 0.4) {
            g.state = 'idle';
            g.pose = Math.random() < 0.4 ? 'sniff' : 'follow';
            g.timer = 2 + Math.random() * 4;
          } else {
            dir.normalize().multiplyScalar(WANDER_SPEED);
            g.group.position.addScaledVector(dir, dt);
            g.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
            speed = WANDER_SPEED;
          }
        }
        animateCat(g.group, g.state === 'idle' ? g.pose : 'follow', t, speed);
      }
    },
  };
}
