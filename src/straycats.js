import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { makeNameTag, setNameTagMood, NAME_TAG_RANGE } from './nametag.js';
import { friendRungs } from './skills.js';
import { mulberry32, seedFromCode } from './rng.js';

const BREEDS = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon'];
const WANDER_SPEED = 1.4;
const SCURRY_SPEED = 2.6;
const GOLDEN = 0.6180339887498949; // spreads personality rolls evenly across strays even with a seeded/constant rng

// How far a meow reaches. MEOW_RADIUS is the shipped "look up and answer"
// range; FAR_CALL_RADIUS is the outer band v18's Far Call adds, where strays
// hear the call and come over. STANDOFF is how far short of the caller they
// stop, and WALK_TIME is the wander budget they get to make the trip (the
// same "give up on unreachable targets eventually" role the 12s in the idle→
// wander branch below plays).
const MEOW_RADIUS = 8;
const FAR_CALL_RADIUS = 22;
const FAR_CALL_STANDOFF = 1.6;
const FAR_CALL_WALK_TIME = 12;

// How long a freshly-ruptured cat holds the recoil before its ordinary wander
// FSM takes over again. It stays cross the whole time — this is only the pose
// hold, the same job the 3s in greet() does.
const CROSS_HOLD = 1.5;
// ...and how far it backs off, in metres. One body length: enough to read as
// "get away from me", small enough that it cannot shove a cat through a wall
// (the position is clamped to the area bounds exactly as the wander targets
// and the shy scurry are).
const RECOIL_STEP = 0.9;

// ---------------------------------------------------------------------------
// The per-stray wander stream
//
// Spawn (position, facing, name, personality, first timer) is drawn from the
// injected `rng` — walkRng on a room walk — so two co-walkers on one roomSeed
// see the same cats appear in the same places. The wander FSM in update() used
// bare Math.random() for everything AFTER that: scurry bearing, wander target,
// idle pose and every timer. The cats therefore spawned together and drifted
// apart within a couple of seconds — the same "same world, different fields"
// family as CF-7 (game/walk.js:507) and the firefly desync (walk.js:429), just
// arriving a moment later than the eye expects.
//
// The fix is deliberately NOT "thread walkRng into update()". walkRng is a
// single order-sensitive shared stream, and walk.js:266-287 spells out why it
// may have at most one lazy post-startWalk consumer: two clients drawing from
// it at different frame counts shift every downstream draw for the rest of the
// walk. A PER-FRAME consumer is the worst possible version of that bug.
//
// So each stray carries its own mulberry32, seeded once at spawn and used only
// for its own draws. That is order-INDEPENDENT across cats, which buys more
// than tidiness: the wander FSM is also poked by purely local events (you greet
// a cat, a shy cat scurries from YOUR approach — your co-walker's player is
// somewhere else entirely). With one shared stream, one local greet would shift
// every other cat's draws for the rest of the walk. With a stream per cat, a
// local event can only ever desync the one cat it touched.
//
// The per-cat offset comes from seedFromCode (FNV-1a), NOT game/util.js's
// hashName. hashName is a sum of char codes and collides on any permutation of
// the same letters — over the 48 shipped CAT_NAMES it yields only 43 distinct
// values. In catreplies a collision means two cats saying the same line, which
// is fine; here it would mean two cats walking identical paths in lockstep for
// a whole walk, which is glaringly visible. src/enemies.js's hostileSeed made
// exactly this substitution for exactly this reason.
//
// WANDER_SALT keeps this derivation distinct from every other per-cat seed
// built from the same name (enemies.js's hostileSeed, catreplies' per-cat
// offset), so a cat's wander cannot be correlated with whether it is cross.
const WANDER_SALT = 0xa11ec475; // "alleycats"

// strayWanderRng(base, name) → a fresh mulberry32 for one cat's wander draws.
// `base` is the walk-wide seed (roomSeed, or a random fallback — see
// createStrayCats); String() coercion because seedFromCode calls .toUpperCase()
// and a nameless cat must wander, not throw.
function strayWanderRng(base, name) {
  return mulberry32(((base + seedFromCode(String(name ?? ''))) ^ WANDER_SALT) >>> 0);
}

// ---------------------------------------------------------------------------
// The ♡→♥→💕 friendship ladder
//
// progression.recordGreet owns the greet COUNT — and, load-bearingly, the
// once-per-cat-per-walk dedup guard that is the only reason greets cannot be
// farmed (they persist to a live backend whose record_friend_greet validates
// the caller's identity and nothing else, so the client-side cap is what
// holds). This owns only the separate question "which rung does greet number
// N land on".
//
// They are split on purpose. v18's Charmer ('charmer') moves the RUNGS and
// must never be able to move the count, so the skill is wired to the table
// below and has no reach into recordGreet at all.
//
// The rung TABLE itself is not here. v18 CF-4: this module used to own its
// own copy of the base 1/3/6 and the Charmer 1/2/4 rungs while
// progression.friendLevel owned a hardcoded second copy, and the two drifted
// — a Charmer player was toasted "BEST friend 💕" at four greets for a cat
// the home-base roster still drew as ♥. The single table now lives in
// skills.js (pure, zero-import, already imported by progression.js, so no
// cycle) and is re-exported here so this module's existing callers —
// game/interactions.js and test/straycats.test.js — keep their import path.
// ---------------------------------------------------------------------------
export { friendRungs };

// friendRungCrossed(before, after, { charmer }) → 'met' | 'friend' | 'best' |
// null. `before`/`after` are one cat's lifetime greet count either side of a
// single call to recordGreet.
//
// Returns the HIGHEST rung the step crossed, so a Charmer player whose cat
// was already mid-ladder when the skill unlocked gets one toast for the step,
// never a burst of backdated ones. Returns null when the count did not move,
// which is exactly what a greet rejected by the per-walk dedup guard looks
// like from out here (before === after) — the same "say nothing" recordGreet's
// null return has always meant at the call site.
//
// With charmer=false this reproduces recordGreet's 1/3/6 return values
// exactly, one greet at a time; test/straycats.test.js pins that.
export function friendRungCrossed(before, after, { charmer = false } = {}) {
  if (!(after > before)) return null;
  const rungs = friendRungs(charmer);
  for (const level of ['best', 'friend', 'met']) {
    if (before < rungs[level] && after >= rungs[level]) return level;
  }
  return null;
}

export const CAT_NAMES = [
  'Pickles', 'Marmalade', 'Baron von Fluff', 'Mochi', 'Biscuit', 'Clementine',
  'Noodle', 'Pumpkin', 'Sardine', 'Waffles', 'Miso', 'Turnip', 'Gadget',
  'Petunia', 'Sir Pounce', 'Dumpling', 'Olive', 'Paprika', 'Crumpet', 'Zucchini',
  'Maple', 'Tofu', 'Wasabi', 'Pretzel', 'Nimbus', 'Pepper', 'Butterscotch',
  'Fig', 'Tangerine', 'Cocoa', 'Sprout', 'Juniper', 'Meatball', 'Parsnip',
  'Ziggy', 'Bean', 'Churro', 'Anchovy', 'Popcorn', 'Gnocchi', 'Beignet',
  'Truffle', 'Ramen', 'Custard', 'Peaches', 'Static', 'Doppler', 'Comet',
];

// ---------------------------------------------------------------------------
// v20 "Ruffled Fur", D2 — "strays only, never the named family pets (Zeetoo,
// Rosa, Robbie, Hagrid) and never ghost visitors."
//
// src/enemies.js owns the RULES and says plainly that it cannot enforce this:
// it sees a save, a name and a walk stamp, and has no way to tell one cat
// object from another. So the guard lives here, in the module that owns stray
// identity, and it is deliberately made of TWO independent halves:
//
//   * the IDENTITY half — the cat must be an object out of THIS walk's stray
//     array. A ghost visitor (ghosts.js), a co-walker's remote pet
//     (remotecats.js) and the player's own avatar are all different objects in
//     different lists and can never be in it, whatever they are called;
//   * the VOCABULARY half — the name must come from CAT_NAMES. The four
//     family pets are CATALOG.cats entries (progression.js:178-181), i.e.
//     PLAYER AVATARS, and none of the 48 stray names is one of them.
//     test/straycats.test.js pins that disjointness against the real CATALOG,
//     so the guard cannot rot if either list is edited.
//
// Either half alone would be sufficient today. Both together means a future
// edit has to break two unrelated things before a child's own cat can scratch
// them, which is what "structural, not incidental" has to mean for a rule
// nobody will remember to re-check.
// ---------------------------------------------------------------------------
const STRAY_NAMES = new Set(CAT_NAMES);

// isGrudgeableStray(strayCats, cat) → bool. The single D2 gate; every enemy
// path in game/interactions.js asks it before consulting enemies.js at all.
// Total over garbage: a null strayCats, a nameless object or a plain
// `{ name }` literal all read as "not a stray" rather than throwing.
export function isGrudgeableStray(strayCats, cat) {
  if (!cat || typeof cat.name !== 'string' || !STRAY_NAMES.has(cat.name)) return false;
  const list = strayCats?.strays;
  return Array.isArray(list) && list.includes(cat);
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// createStrayCats(scene, area, count, rng, { grudges, roomSeed })
//
// `roomSeed` (optional) is the co-walk room seed, the same value game/walk.js
// seeds walkRng from. It is used for ONE thing: seeding each stray's private
// wander stream (see strayWanderRng above), so two co-walkers' cats keep
// wandering in step instead of only spawning in step. It draws nothing from
// `rng`, so passing it cannot shift the shared stream by a single value.
//
// Omitted — solo walks, and every existing caller and test — the base falls
// back to a fresh random number the way sky life's stream does
// (game/walk.js:638), so an unseeded walk still wanders differently every
// time. That fallback is the only Math.random() left in this module besides
// the `rng` default parameter, and it is drawn once per walk at spawn, never
// per frame.
//
// `grudges` (v20 Ruffled Fur, D1) is the list of names this save is cross
// with, read out of progression.grudgeNames() by game/walk.js at walk start.
// A grudge is keyed on the NAME because that is the only identity a stray has
// across walks, so it re-attaches to whichever of this walk's 22-of-48 strays
// happens to carry that name.
//
// It is applied HERE, at spawn, rather than by a second pass afterwards, so a
// cross cat is born with a cross name tag: makeNameTag paints its canvas once,
// and the mid-walk repaint (setNameTagMood) is then needed only for
// the two live transitions — the rupture and the reconciliation — which is
// exactly what it exists for.
//
// It draws nothing from `rng`, so a co-walk's shared stream is untouched:
// hostility is a private per-device fact (D4) and two co-walkers may disagree
// about which cats are cross without their worlds diverging by so much as one
// draw.
export function createStrayCats(scene, area, count = 3, rng = Math.random, { grudges = [], roomSeed } = {}) {
  const strays = [];
  const b = area.bounds;
  const names = shuffled(CAT_NAMES, rng);
  const crossNames = new Set(Array.isArray(grudges) ? grudges : []);
  const wanderBase = (roomSeed ?? (Math.random() * 2 ** 31)) >>> 0;

  for (let i = 0; i < count; i++) {
    const name = names[i % names.length];
    // breed is derived from the name, not rolled, so a given cat (e.g. "Pickles")
    // is always the same breed across walks
    const breed = BREEDS[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % BREEDS.length];
    const group = buildCat(breed, undefined, { simple: true });
    group.scale.multiplyScalar(0.85); // strays read as slightly smaller than your cat
    // Position, facing and the personality roll below are drawn from `rng` in
    // this fixed order — x, then z, then facing, then personality — for every
    // stray before moving to the next one. On a room walk `rng` is walkRng,
    // shared and order-sensitive (see game/walk.js:266-287): these four draws
    // used to be bare Math.random() calls, so two co-walkers on the same
    // roomSeed agreed on which cats existed (the name shuffle and personality
    // roll were already seeded) but each saw them standing and facing
    // differently. Same failure family as CF-7 (walk.js:507) and the firefly
    // desync (walk.js:429) — a placed/derived value quietly left off the
    // shared stream.
    const x = THREE.MathUtils.lerp(b.minX * 0.7, b.maxX * 0.7, rng());
    const z = THREE.MathUtils.lerp(b.minZ * 0.7, b.maxZ * 0.7, rng());
    group.position.set(x, 0, z);
    group.rotation.y = rng() * Math.PI * 2;

    const roll = (rng() + i * GOLDEN) % 1;
    const personality = roll < 0.25 ? 'shy' : roll < 0.55 ? 'playful' : 'bold';

    const cross = crossNames.has(name);
    const tag = makeNameTag(name, { cross });
    if (tag) group.add(tag);

    scene.add(group);
    strays.push({
      id: `stray-${i}`,
      breed,
      name,
      personality,
      group,
      tag,
      // v20 Ruffled Fur: does this cat bear a grudge? The render/interaction
      // truth for the whole walk, kept in sync with the save at exactly three
      // points — here (walk start, from state.grudges), turnHostile (the
      // rupture) and forgive (the reconciliation). Read per frame by update()
      // and by the prompt scan, so neither has to touch the save 22 times a
      // frame to ask a question that changes twice a walk at most.
      cross,
      // This cat's own wander stream. Derived from (wanderBase, name) — never
      // drawn from `rng` — so it costs the shared walk stream nothing, and no
      // cat's draws can shift another's. update() below uses it for every
      // roll it makes; there is no bare Math.random() left in the FSM.
      wanderRng: strayWanderRng(wanderBase, name),
      home: new THREE.Vector3(x, 0, z),
      target: null,
      state: 'idle', // idle | wander | greet
      pose: 'follow',
      timer: 1 + rng() * 3, // 5th draw this iteration — same shared-stream order as above
      greeted: false,
      scurry: 0,
      scurryDir: null,
      batCooldown: 0,
    });
  }

  // Turn a stray to face whoever is at `fromPos`. Lifted out of greet() so
  // the two v20 transitions below face the player exactly the way a greet
  // does, rather than each carrying its own copy of the atan2.
  function faceToward(stray, fromPos) {
    stray.group.rotation.y =
      Math.atan2(fromPos.x - stray.group.position.x, fromPos.z - stray.group.position.z) + Math.PI;
  }

  return {
    strays,
    // nearest(pos, maxDist, opts) → the closest stray in range, or null.
    //
    // The filters are independent and compose; all default off, so an
    // unfiltered call behaves exactly as it always has.
    //
    //   * ungreetedOnly — the per-walk greet guard: skip a cat that has
    //     already paid out its one friendship award this walk.
    //   * crossOnly / excludeCross — v20: only, or never, cats bearing a
    //     grudge.
    //   * promptable — v20, and the one the prompt scan actually uses: "this
    //     cat still has something to offer you this walk", which is either a
    //     greet (ungreeted, not cross) or a chance to make up (cross). It is
    //     one filter rather than two calls on purpose — the two offers are
    //     mutually exclusive per cat, and a single scan returns the NEAREST
    //     cat with either, so a cross cat can never shadow a friendly one
    //     standing closer, nor the reverse.
    nearest(pos, maxDist, { ungreetedOnly = false, crossOnly = false, excludeCross = false, promptable = false } = {}) {
      let best = null;
      let bestD = maxDist;
      for (const s of strays) {
        if (ungreetedOnly && s.greeted) continue;
        if (crossOnly && !s.cross) continue;
        if (excludeCross && s.cross) continue;
        if (promptable && !s.cross && s.greeted) continue;
        const d = s.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best;
    },
    greet(stray, fromPos) {
      stray.state = 'greet';
      stray.timer = 3;
      stray.greeted = true;
      faceToward(stray, fromPos);
    },
    // -----------------------------------------------------------------
    // v20 Ruffled Fur — the two live grudge transitions.
    //
    // Both are pure world-state: they set the flag, repose the cat and
    // repaint the tag, and neither writes to the save. progression.js owns
    // every persisted mutation (recordGrudge / forgiveGrudge), and the call
    // site in game/interactions.js gates these on that write having actually
    // landed — the same discipline leaveGift/claimGift established for Gift
    // Paws, and the reason a double E-press cannot double-fire either beat.
    // -----------------------------------------------------------------

    // The rupture: the greet went badly. The cat squares up at you and backs
    // off a body length. `greeted` is set even though nothing was awarded and
    // no greet was recorded, so the prompt stops re-offering the cat and the
    // player moves on rather than mashing E at it.
    turnHostile(stray, fromPos) {
      stray.cross = true;
      stray.greeted = true;
      stray.state = 'cross';
      stray.timer = CROSS_HOLD;
      faceToward(stray, fromPos);
      const away = stray.group.position.clone().sub(fromPos).setY(0);
      if (away.lengthSq() < 0.0001) away.set(0, 0, 1);   // standing exactly on you: pick a bearing
      stray.group.position.addScaledVector(away.normalize(), RECOIL_STEP);
      stray.group.position.x = THREE.MathUtils.clamp(stray.group.position.x, b.minX + 0.5, b.maxX - 0.5);
      stray.group.position.z = THREE.MathUtils.clamp(stray.group.position.z, b.minZ + 0.5, b.maxZ - 0.5);
      setNameTagMood(stray.tag, { cross: true });
    },

    // The reconciliation: the treat landed. The cat softens ON THE SPOT —
    // the tag repaints in place (spec §4a's hard requirement, and the reason
    // setNameTagMood exists at all) and the cat turns to you in the greeting
    // pose. `greeted` is cleared so the greet prompt comes straight back;
    // that cannot be farmed, because recordGreet's once-per-cat-per-walk
    // dedup and awardOnce's per-walk `friend-<name>` key both still stand, so
    // the round trip costs a 10-point treat and pays a 6-point friendship at
    // most once.
    forgive(stray, fromPos) {
      stray.cross = false;
      stray.greeted = false;
      stray.state = 'greet';
      stray.timer = 3;
      if (fromPos) faceToward(stray, fromPos);
      setNameTagMood(stray.tag, { cross: false });
    },
    dispose() {
      for (const s of strays) scene.remove(s.group);
    },
    // reactToMeow(pos, { far }) — someone meowed at `pos`. Strays inside
    // MEOW_RADIUS look up and hold a greeting pose, exactly as they always
    // have; `far` is off unless the caller has v18's Far Call, so the
    // no-skill path is byte-for-byte the old loop.
    //
    // Far Call extends the reach to FAR_CALL_RADIUS and has the strays in
    // that outer band walk over to see who shouted. That draw is MOVEMENT
    // ONLY: it writes state/target/timer and nothing else. In particular it
    // must never set s.greeted — `greeted` is the per-walk guard that stops
    // nearest(..., {ungreetedOnly:true}) re-offering a cat that has already
    // paid out its one friendship award, and a meow that could set it would
    // turn Far Call into a greet vector that out-farms walking up to the cat.
    // Nothing here awards, greets, or increments anything.
    reactToMeow(pos, { far = false } = {}) {
      const reach = far ? FAR_CALL_RADIUS : MEOW_RADIUS;
      let count = 0;
      for (const s of strays) {
        // v20: a cross cat does not come when you call, and does not look up
        // and hold a greeting pose either. Skipped before the count, so it
        // also cannot trigger doMeow's "a reply from a friend" answering
        // meow — a cat that is cross with you is not a friend this walk.
        if (s.cross) continue;
        const d = s.group.position.distanceTo(pos);
        if (d >= reach) continue;
        if (d < MEOW_RADIUS) {
          s.state = 'greet';
          s.timer = 1.5;
          s.group.rotation.y = Math.atan2(pos.x - s.group.position.x, pos.z - s.group.position.z) + Math.PI;
        } else {
          // Approach along the stray's own bearing and stop a body length
          // short, so a called-in group fans out around the caller instead of
          // stacking on one point. Derived from positions, never rolled —
          // no bare Math.random() in here.
          const away = s.group.position.clone().sub(pos).setY(0);
          if (away.lengthSq() < 0.0001) away.set(0, 0, 1);
          const target = pos.clone().setY(0).addScaledVector(away.normalize(), FAR_CALL_STANDOFF);
          target.x = THREE.MathUtils.clamp(target.x, b.minX + 2, b.maxX - 2);
          target.z = THREE.MathUtils.clamp(target.z, b.minZ + 2, b.maxZ - 2);
          s.state = 'wander';
          s.target = target;
          s.timer = Math.max(s.timer, FAR_CALL_WALK_TIME);
        }
        count += 1;
      }
      return count;
    },
    update(dt, t, catPos, opts = {}) {
      for (const s of strays) {
        // v20: the reveal distance is a property of the TAG's mood, not of
        // this loop — a cross cat's tag carries roughly three times as far
        // (CROSS_NAME_TAG_RANGE), so the player can both give it a wide berth
        // and, the point of the whole feature, go and find the cat they want
        // to make up with. Read off the tag rather than branched on `s.cross`
        // here on purpose: setNameTagMood updates revealRange as part of the
        // repaint, so the reveal widens on the rupture and narrows again on
        // the reconciliation with nothing to keep in step at this call site.
        // The ?? covers a tag built before this field existed and the
        // headless case where makeNameTag returns null.
        if (s.tag) {
          const range = s.tag.userData?.revealRange ?? NAME_TAG_RANGE;
          s.tag.visible = catPos ? s.group.position.distanceTo(catPos) < range : false;
        }
        if (s.batCooldown > 0) s.batCooldown -= dt;

        // shy strays scurry away from a fast, non-stalking approach — this overrides wander entirely
        if (s.personality === 'shy' && s.state !== 'greet' && s.state !== 'cross') {
          if (s.scurry <= 0 && catPos &&
              s.group.position.distanceTo(catPos) < 4 &&
              (opts.catSpeed ?? 0) > 2.5 && !opts.stalking) {
            s.scurry = 2.5;
            s.scurryDir = s.group.position.clone().sub(catPos).setY(0);
            // Degenerate case only: the cat is standing exactly on you, so
            // there is no bearing to flee along and one has to be picked.
            // Drawn from the cat's own stream like every other roll below.
            if (s.scurryDir.lengthSq() < 0.0001) s.scurryDir.set(s.wanderRng() - 0.5, 0, s.wanderRng() - 0.5);
            s.scurryDir.normalize();
          }
          if (s.scurry > 0) {
            s.scurry -= dt;
            s.group.position.addScaledVector(s.scurryDir, SCURRY_SPEED * dt);
            s.group.position.x = THREE.MathUtils.clamp(s.group.position.x, b.minX + 0.5, b.maxX - 0.5);
            s.group.position.z = THREE.MathUtils.clamp(s.group.position.z, b.minZ + 0.5, b.maxZ - 0.5);
            s.group.rotation.y = Math.atan2(s.scurryDir.x, s.scurryDir.z) + Math.PI;
            animateCat(s.group, 'follow', t, SCURRY_SPEED);
            s.timer -= dt;
            continue;
          }
        }

        // playful strays run to bat an active toy within range
        if (s.personality === 'playful' && opts.toy?.active) {
          const dToy = s.group.position.distanceTo(opts.toy.mesh.position);
          if (dToy < 8) {
            s.state = 'wander';
            s.target = opts.toy.mesh.position.clone();
            s.timer = Math.max(s.timer, 1.5);
            if (dToy < 0.5 && s.batCooldown <= 0) {
              opts.toy.bat(s.group.position);
              s.batCooldown = 0.8;
            }
          }
        }

        s.timer -= dt;

        if (s.state === 'greet') {
          animateCat(s.group, 'requestPet', t, 0); // tail up, head raised toward you
          if (s.timer <= 0) {
            s.state = 'idle';
            s.pose = 'follow';
            s.timer = 2 + s.wanderRng() * 3;
          }
          continue;
        }

        // v20 Ruffled Fur — the recoil hold, the same shape as the greet hold
        // just above. When it expires the cat drops into the ordinary wander
        // FSM (its timer is already <= 0, so the idle branch below picks it up
        // on the very next frame and draws its own wander target from the same
        // pre-existing rolls); it stays CROSS the whole time, which is what
        // the resting-pose override further down reads.
        if (s.state === 'cross') {
          animateCat(s.group, 'cross', t, 0);
          if (s.timer <= 0) s.state = 'idle';
          continue;
        }

        if (s.timer <= 0) {
          if (s.state === 'idle') {
            s.state = 'wander';
            const a = s.wanderRng() * Math.PI * 2;
            const r = 4 + s.wanderRng() * 8;
            s.target = s.home.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
            s.target.x = THREE.MathUtils.clamp(s.target.x, b.minX + 2, b.maxX - 2);
            s.target.z = THREE.MathUtils.clamp(s.target.z, b.minZ + 2, b.maxZ - 2);
            s.timer = 12; // give up on unreachable targets eventually
          } else {
            s.state = 'idle';
            s.pose = s.wanderRng() < 0.4 ? 'sniff' : 'follow';
            s.timer = 2 + s.wanderRng() * 4;
          }
        }

        let speed = 0;
        if (s.state === 'wander' && s.target) {
          const dir = s.target.clone().sub(s.group.position).setY(0);
          if (dir.length() < 0.4) {
            s.state = 'idle';
            s.pose = s.wanderRng() < 0.4 ? 'sniff' : 'follow';
            s.timer = 2 + s.wanderRng() * 4;
          } else {
            dir.normalize().multiplyScalar(WANDER_SPEED);
            s.group.position.addScaledVector(dir, dt);
            s.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
            speed = WANDER_SPEED;
          }
        }
        // v20: a cross cat's RESTING pose is 'cross' — flattened ears, tail
        // up — whatever sniff/follow the wander FSM last picked for it, so it
        // reads as cross from further away than its tag is legible (spec
        // §4a.3). Walking is left alone: a cat crossing the map still walks.
        // Note strays are built { simple: true }, which skips whiskers, so
        // ears and tail are the whole vocabulary available here.
        const restPose = s.cross ? 'cross' : s.pose;
        animateCat(s.group, s.state === 'idle' ? restPose : 'follow', t, speed);
      }
    },
  };
}
