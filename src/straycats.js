import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { makeNameTag } from './nametag.js';

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
// Base rungs are progression.friendLevel's 1/3/6. Charmer shortens the two
// upper rungs — a charming cat is called a friend on its second nose-touch
// and a best friend on its fourth — but 'met' stays at the first greet,
// because there is no shorter first greet than one.
// ---------------------------------------------------------------------------
const FRIEND_RUNGS = { met: 1, friend: 3, best: 6 };
const CHARMER_RUNGS = { met: 1, friend: 2, best: 4 };

export function friendRungs(charmer = false) {
  return charmer ? CHARMER_RUNGS : FRIEND_RUNGS;
}

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

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createStrayCats(scene, area, count = 3, rng = Math.random) {
  const strays = [];
  const b = area.bounds;
  const names = shuffled(CAT_NAMES, rng);

  for (let i = 0; i < count; i++) {
    const name = names[i % names.length];
    // breed is derived from the name, not rolled, so a given cat (e.g. "Pickles")
    // is always the same breed across walks
    const breed = BREEDS[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % BREEDS.length];
    const group = buildCat(breed, undefined, { simple: true });
    group.scale.multiplyScalar(0.85); // strays read as slightly smaller than your cat
    const x = THREE.MathUtils.lerp(b.minX * 0.7, b.maxX * 0.7, Math.random());
    const z = THREE.MathUtils.lerp(b.minZ * 0.7, b.maxZ * 0.7, Math.random());
    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI * 2;

    const roll = (rng() + i * GOLDEN) % 1;
    const personality = roll < 0.25 ? 'shy' : roll < 0.55 ? 'playful' : 'bold';

    const tag = makeNameTag(name);
    if (tag) group.add(tag);

    scene.add(group);
    strays.push({
      id: `stray-${i}`,
      breed,
      name,
      personality,
      group,
      tag,
      home: new THREE.Vector3(x, 0, z),
      target: null,
      state: 'idle', // idle | wander | greet
      pose: 'follow',
      timer: 1 + Math.random() * 3,
      greeted: false,
      scurry: 0,
      scurryDir: null,
      batCooldown: 0,
    });
  }

  return {
    strays,
    nearest(pos, maxDist, { ungreetedOnly = false } = {}) {
      let best = null;
      let bestD = maxDist;
      for (const s of strays) {
        if (ungreetedOnly && s.greeted) continue;
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
      stray.group.rotation.y =
        Math.atan2(fromPos.x - stray.group.position.x, fromPos.z - stray.group.position.z) + Math.PI;
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
        if (s.tag) s.tag.visible = catPos ? s.group.position.distanceTo(catPos) < 4 : false;
        if (s.batCooldown > 0) s.batCooldown -= dt;

        // shy strays scurry away from a fast, non-stalking approach — this overrides wander entirely
        if (s.personality === 'shy' && s.state !== 'greet') {
          if (s.scurry <= 0 && catPos &&
              s.group.position.distanceTo(catPos) < 4 &&
              (opts.catSpeed ?? 0) > 2.5 && !opts.stalking) {
            s.scurry = 2.5;
            s.scurryDir = s.group.position.clone().sub(catPos).setY(0);
            if (s.scurryDir.lengthSq() < 0.0001) s.scurryDir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
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
            s.timer = 2 + Math.random() * 3;
          }
          continue;
        }

        if (s.timer <= 0) {
          if (s.state === 'idle') {
            s.state = 'wander';
            const a = Math.random() * Math.PI * 2;
            const r = 4 + Math.random() * 8;
            s.target = s.home.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
            s.target.x = THREE.MathUtils.clamp(s.target.x, b.minX + 2, b.maxX - 2);
            s.target.z = THREE.MathUtils.clamp(s.target.z, b.minZ + 2, b.maxZ - 2);
            s.timer = 12; // give up on unreachable targets eventually
          } else {
            s.state = 'idle';
            s.pose = Math.random() < 0.4 ? 'sniff' : 'follow';
            s.timer = 2 + Math.random() * 4;
          }
        }

        let speed = 0;
        if (s.state === 'wander' && s.target) {
          const dir = s.target.clone().sub(s.group.position).setY(0);
          if (dir.length() < 0.4) {
            s.state = 'idle';
            s.pose = Math.random() < 0.4 ? 'sniff' : 'follow';
            s.timer = 2 + Math.random() * 4;
          } else {
            dir.normalize().multiplyScalar(WANDER_SPEED);
            s.group.position.addScaledVector(dir, dt);
            s.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
            speed = WANDER_SPEED;
          }
        }
        animateCat(s.group, s.state === 'idle' ? s.pose : 'follow', t, speed);
      }
    },
  };
}
