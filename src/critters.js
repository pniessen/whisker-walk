import * as THREE from 'three';
import { bus } from './events.js';
import { litMaterial } from './render/materials.js';

const mat = (color) => litMaterial(color);
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

const CHASEABLE = new Set(['bird', 'squirrel', 'butterfly', 'seagull', 'crab', 'duck', 'firefly']);
// grounded skittish critters that participate in stalk-and-pounce tag
// (bird included per spec even though it flies once fleeing — see markStalked/pounceCatch)
// v18 Task 2.6: 'rat' joins them. It is deliberately STALKABLE but NOT
// CHASEABLE, exactly like 'mouse' — a rat's answer to a cat is to bolt, so it
// has no business in the chase prompt or (via CURIOUS, which is derived from
// CHASEABLE) in the set of critters a Far Call draws toward the caller.
const STALKABLE = new Set(['squirrel', 'bird', 'mouse', 'rat']);
// v18 Far Call ('far-call') — critters curious enough to come and look when a
// meow carries. Derived from CHASEABLE rather than listed fresh: everything a
// cat can chase, MINUS the two types whose existing meow reaction is to bolt
// (bird and seagull, see reactToMeow). Drawing a critter that the same meow
// scatters would be the game contradicting itself in one frame. Villagers are
// excluded because they are not chaseable, and already answer a meow with a
// wave. (The dog is no critter at all since v21 3b Task 16: it lives in its
// yard, src/yarddog.js, and never comes when called.)
const CURIOUS = new Set([...CHASEABLE].filter((t) => t !== 'bird' && t !== 'seagull'));
// The outer band Far Call reaches, the same 22m straycats.js uses so one meow
// draws one consistent neighbourhood. STANDOFF is how far short of the caller
// a critter settles, and DRAW_TIME is the budget it gets to make the trip —
// the "give up on an unreachable target eventually" role.
const FAR_CALL_RADIUS = 22;
const FAR_CALL_STANDOFF = 2.2;
const FAR_CALL_DRAW_TIME = 12;
// How fast a called critter's IDLE ANCHOR glides (see spawn/update). Slow on
// purpose: the anchor carries the critter's whole patrol pattern with it, so
// this is the speed the pattern drifts over, not a dash.
const ANCHOR_SPEED = 2.2;
// v21 3b Task 13 — prey that evades. The three grounded runners notice a cat
// that comes close and bolt for cover: the nearest of the area's hides
// (propsets.js) within HIDE_SEARCH, at their own dash speed. A trotting cat is
// noticed at PREY_NOTICE; a stalking one gets to PREY_NOTICE_STALKED, which is
// the whole point of stalking. Once within HIDE_REACH of its cover the critter
// is hidden for the rest of the walk: invisible, unspottable, and skipped by
// every way the cat can reach a critter. With no cover in reach it dashes away
// and comes back, exactly as a pounce-tag sends it. Positions only — nothing
// here rolls, so it never touches the injected rng or Math.random.
const PREY = new Set(['mouse', 'rat', 'squirrel']);
export const PREY_NOTICE = 3.5;
export const PREY_NOTICE_STALKED = 1.2;
export const HIDE_REACH = 0.4;
const HIDE_SEARCH = 15;
// Ruling R27 — stalking pays off. A critter that notices a STALKING (or still,
// R29) cat freezes for PREY_STARTLE seconds before it bolts, the way a real
// mouse does; a trotting cat gets no startle. A fixed time, never a roll.
// Tuned against the real lunge (player.js) — see task-13-report.md, Fix round 1.
export const PREY_STARTLE = 0.5;
// Ruling R29 — a still cat is not a threat. A cat moving slower than this
// (horizontal m/s, measured off the positions update() is handed) is noticed
// at PREY_NOTICE_STALKED, like a stalking one, so a touch player who stops with
// the thumb off does not scare a mouse 3.5m away. A creeping cat moves at
// 1.4-2.0 m/s, a trot at 3.2-4.4, so 0.25 means "stopped": player.js's
// velocity lerp brings a released cat under it in about 0.4s.
export const STILL_SPEED = 0.25;
// Above the fastest the cat really moves (the 9 m/s pounce lunge; zoomies top
// out near 6.9), so anything faster is a snap, not movement (see update).
export const CAT_SPEED_CAP = 12;

function buildCritter(type) {
  const g = new THREE.Group();
  if (type === 'bird' || type === 'seagull') {
    const s = type === 'seagull' ? 1.6 : 1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 6, 6), mat(type === 'seagull' ? 0xf0f0f0 : 0x8a5a3a));
    body.position.y = 0.09 * s;
    g.add(body);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.08 * s, 4), mat(0xf2a04e));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.1 * s, -0.1 * s);
    g.add(beak);
  } else if (type === 'squirrel' || type === 'mouse' || type === 'rat') {
    // Three sizes off one body: squirrel (1), rat (0.75), mouse (0.5).
    const s = type === 'mouse' ? 0.5 : type === 'rat' ? 0.75 : 1;
    const furColor = type === 'mouse' ? 0x8a8a92 : type === 'rat' ? 0x5a5450 : 0xa06a3a;
    const tailColor = type === 'mouse' ? 0x8a8a92 : type === 'rat' ? 0xb08a86 : 0xb87a4a;
    const body = box(0.12 * s, 0.12 * s, 0.22 * s, furColor);
    body.position.y = 0.1 * s;
    g.add(body);
    if (type === 'rat') {
      // The rat reads as a rat rather than a big mouse from its long bare
      // tail and pointed snout, not from its silhouette — a bushy tail sphere
      // (the squirrel/mouse tail below) would make it look like either.
      const tail = box(0.03, 0.03, 0.34, tailColor);
      tail.position.set(0, 0.06, 0.26);
      g.add(tail);
      const snout = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 5), mat(furColor));
      snout.rotation.x = -Math.PI / 2;
      snout.position.set(0, 0.08, -0.14);
      g.add(snout);
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.CircleGeometry(0.045, 6), mat(tailColor));
        ear.position.set(side * 0.05, 0.14, -0.06);
        g.add(ear);
      }
    } else {
      const tailS = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 5, 5), mat(tailColor));
      tailS.position.set(0, 0.2 * s, 0.16 * s);
      g.add(tailS);
    }
  } else if (type === 'butterfly' || type === 'firefly') {
    const color = type === 'firefly' ? 0xf2e04e : 0xe070b0;
    for (const side of [-1, 1]) {
      const wing = box(0.08, 0.01, 0.06, color);
      wing.position.x = side * 0.05;
      g.add(wing);
    }
    if (type === 'firefly') {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 5),
        litMaterial(0xf2e04e, { emissive: 0xb8a820 }));
      g.add(glow);
    }
  } else if (type === 'duck') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), mat(0x6a9a4a));
    body.position.y = 0.1;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), mat(0x3a7a3a));
    head.position.set(0, 0.28, -0.1);
    g.add(head);
  } else if (type === 'crab') {
    const body = box(0.2, 0.08, 0.14, 0xe06848);
    body.position.y = 0.06;
    g.add(body);
    for (const side of [-1, 1]) {
      const claw = box(0.06, 0.05, 0.08, 0xe06848);
      claw.position.set(side * 0.14, 0.08, -0.06);
      g.add(claw);
    }
  } else if (type === 'villager') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 8), mat(0x6a8ac0));
    body.position.y = 0.55;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat(0xe8c8a8));
    head.position.y = 1.3;
    g.add(head);
    const arm = box(0.08, 0.5, 0.08, 0x6a8ac0);
    arm.geometry.translate(0, 0.25, 0);
    arm.position.set(0.3, 0.9, 0);
    arm.rotation.z = 0.4;
    g.add(arm);
    g.userData.arm = arm;
  }
  return g;
}

let nextId = 1;

export function createCritters(scene, spawns, opts = {}) {
  const fleeScale = opts.fleeScale ?? 1;
  // Injected seeded RNG for anything this builder PLACES in the world. Dusk
  // firefly positions used a bare Math.random(), which meant two co-walkers
  // on the same room seed saw the eight fireflies in different spots — the
  // exact determinism regression the spec calls out. Falls back to
  // Math.random so a caller that passes no rng (and a solo walk, whose
  // walkRng *is* Math.random) behaves precisely as before.
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  // Task 13: the area's cover, and who to tell when a critter gets away.
  const hides = (Array.isArray(opts.hides) ? opts.hides : [])
    .filter((h) => h && Number.isFinite(h.x) && Number.isFinite(h.z))
    .map((h) => new THREE.Vector3(h.x, 0, h.z));
  const onHide = typeof opts.onHide === 'function' ? opts.onHide : null;
  // markStalked's latest isStalking. update() runs before it in the frame
  // (main.js, then game/avatar.js), so it reads last frame's — one frame late,
  // and the cat has been stalking for many frames by the time it is close.
  let catStalking = false;
  // R29: where the cat was on the last update, and whether it has stopped.
  // Unknown (first frame) counts as moving.
  let lastCat = null;
  let lastT = 0;
  let catStill = false;
  let fleeModifier = 1;
  let clock = 0; // tracks critters.update's own `t` so pounceCatch can time the 20s catch cooldown without a caller-supplied clock
  const list = [];

  function spawn(def) {
    const group = buildCritter(def.type);
    group.position.set(def.x, def.type === 'butterfly' || def.type === 'firefly' ? 1 : 0, def.z);
    scene.add(group);
    const c = {
      id: `${def.type}-${nextId++}`,
      type: def.type,
      def,
      group,
      spottable: true,
      fleeing: false,
      phase: Math.random() * Math.PI * 2,
      cooldown: 0,
      waved: false,
      meowWaveT: 0,
      // v18 Far Call. Every idle pattern below (the squirrel's patrol line,
      // the duck's circle, the crab's shuffle, the butterfly's hover) is an
      // absolute function of a CENTRE POINT, which used to be def.x/def.z
      // directly. It is now this anchor, which starts on the spawn definition
      // and — with no far call in play — never moves, so every no-skill path
      // is the same motion as before, to the last decimal.
      //
      // A far call retargets the anchor at the caller and update() eases it
      // there and, once the call lapses, home again. Moving the ANCHOR rather
      // than the critter is what keeps this from teleporting: the pattern
      // glides over and glides back, and there is no frame where the idle
      // formula snaps the critter to a position it was never at.
      anchor: new THREE.Vector3(def.x, 0, def.z),
      anchorHome: new THREE.Vector3(def.x, 0, def.z),
      anchorTo: null, // far-call destination while a call is live
      drawT: 0,       // seconds of call left
      // The squirrel/mouse patrol runs from the anchor to anchor+span, so the
      // patrol keeps its own length and heading wherever the anchor goes.
      patrolSpan: new THREE.Vector3((def.x2 ?? def.x + 6) - def.x, 0, (def.z2 ?? def.z) - def.z),
    };
    list.push(c);
    return c;
  }

  for (const def of spawns) spawn(def);
  if (opts.spawnFireflies) {
    for (let i = 0; i < 8; i++) {
      spawn({ type: 'firefly', x: (rng() - 0.5) * 60, z: (rng() - 0.5) * 60 });
    }
  }
  if (opts.trailButterflies) {
    for (let i = 0; i < 2; i++) {
      const c = spawn({ type: 'butterfly', x: 0, z: 0 });
      c.trail = true; // butterfly wander centers on the cat (see update)
    }
  }

  function remove(c) {
    scene.remove(c.group);
    list.splice(list.indexOf(c), 1);
  }

  // The nearest cover within HIDE_SEARCH of `p`, or null.
  function nearestHide(p) {
    let best = null;
    let bestD = Infinity;
    for (const h of hides) {
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d <= HIDE_SEARCH && d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  // Into cover, for good. A caught critter was already paid for, so only one
  // that got away untouched tells the walk.
  function hide(c) {
    c.hidden = true;
    c.fleeing = false;
    c.hideAt = null;
    c.spottable = false;
    c.stalkClose = false;
    c.group.visible = false; // contactshadows.js collapses a hidden mover's decal
    if (!c.tagged && onHide) onHide(c);
  }

  const api = {
    list,
    nearest(pos, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const c of list) {
        if (!CHASEABLE.has(c.type) || c.fleeing || c.hidden) continue;
        const d = c.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    },
    catchAt(pos) {
      for (const c of list) {
        if (!c.hidden && (c.type === 'butterfly' || c.type === 'firefly') &&
            c.group.position.distanceTo(pos) < 0.8) {
          remove(c);
          return c;
        }
      }
      return null;
    },
    // playMoment(moment) — the scripted "look at that!" dash. The runner used
    // to be hardcoded to a squirrel, which is right for the three original
    // areas and wrong for The Old Docks, where the two moments are both rats
    // and there is not a squirrel in the district. `moment.type` is optional
    // and defaults to 'squirrel', so every existing moment is unchanged.
    playMoment(moment) {
      const runner = spawn({ type: moment.type ?? 'squirrel', x: moment.from.x, z: moment.from.z });
      runner.moment = { target: new THREE.Vector3(moment.x, 0, moment.z), t: 0 };
    },
    dismayNear(pos, range) {
      for (const c of list) {
        if (!c.hidden && c.type === 'villager' && c.group.position.distanceTo(pos) < range) c.meowWaveT = 1.5;
      }
    },
    // reactToMeow(pos, { far }) — someone meowed at `pos`. The villager wave
    // and the bird/seagull startle are unchanged and unconditional, so with
    // `far` off (every caller that has not earned Far Call, plus every remote
    // meow arriving over the wire, which carries no skill information and must
    // not) this loop is byte-for-byte the old one.
    //
    // v18 CF-5: the spec says the call draws "strays and critters" and only
    // the stray half shipped. `far` adds the critter half — curious critters
    // out to FAR_CALL_RADIUS come over to see who shouted, mirroring
    // straycats.reactToMeow's outer band.
    //
    // MOVEMENT ONLY. It retargets an idle anchor and nothing else: no
    // spottable flag, no journal sighting, no award, no catch cooldown. That
    // matters — critters.nearest feeds the chase prompt and catchAt/pounceCatch
    // pay out, so a meow that could mark a critter would turn Far Call into a
    // scoring vector that out-farms walking over to one.
    //
    // Every number is derived from POSITIONS (the bearing from caller to
    // critter, its own distance). Nothing here rolls: critters.js takes an
    // injected opts.rng precisely so two co-walkers on one room seed agree,
    // and a bare Math.random() in the draw would reintroduce that divergence.
    // Returns how many critters heard the call.
    reactToMeow(pos, { far = false } = {}) {
      let count = 0;
      for (const c of list) {
        if (c.hidden) continue; // in cover for the walk: it hears nothing
        const d = c.group.position.distanceTo(pos);
        if (c.type === 'villager' && d < 6) c.meowWaveT = 1.5;
        if ((c.type === 'bird' || c.type === 'seagull') && !c.fleeing && d < 5) {
          c.fleeing = true;
          c.cooldown = 18;
        }
        if (!far || !CURIOUS.has(c.type) || d >= FAR_CALL_RADIUS) continue;
        // A fleeing critter is busy getting away, a scripted `moment` runner
        // is on rails, and a trail butterfly already orbits the cat — none of
        // the three has an idle anchor worth retargeting.
        if (c.fleeing || c.moment || c.trail) continue;
        // Approach along the critter's own bearing and stop a body length
        // short, so a called-in group fans out around the caller instead of
        // stacking on one point (the same shape straycats.js uses).
        const away = c.group.position.clone().sub(pos).setY(0);
        if (away.lengthSq() < 0.0001) away.set(0, 0, 1);
        c.anchorTo = pos.clone().setY(0).addScaledVector(away.normalize(), FAR_CALL_STANDOFF);
        c.drawT = FAR_CALL_DRAW_TIME;
        count += 1;
      }
      return count;
    },
    dispose() {
      for (const c of [...list]) remove(c);
    },
    setFleeModifier(m) {
      fleeModifier = m;
    },
    markStalked(catPos, isStalking) {
      catStalking = !!isStalking;
      for (const c of list) {
        if (!STALKABLE.has(c.type) || c.hidden) continue;
        const d = c.group.position.distanceTo(catPos);
        if (isStalking && d < 3) c.stalkClose = true;
        else if (!isStalking && d > 6) c.stalkClose = false;
      }
    },
    // tag, not hunting-hunting: no critter is ever removed here — the catch just
    // marks it caught (uncatchable for 20s) and sends it fleeing fast. Task 13:
    // a mouse, rat or squirrel with cover in reach flees to it and hides — the
    // catch still returns exactly what it did, and the caller still pays.
    pounceCatch(pos) {
      let best = null;
      let bestD = 0.9;
      for (const c of list) {
        if (!STALKABLE.has(c.type) || c.hidden) continue;
        if (c.caughtUntil && c.caughtUntil > clock) continue;
        const d = c.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (!best) return null;
      const wasStalked = !!best.stalkClose;
      best.caughtUntil = clock + 20;
      best.fleeing = true;
      best.cooldown = best.type === 'bird' ? 18 : 3;
      best.stalkClose = false;
      // A scripted moment runner is on rails and despawns on its own.
      if (PREY.has(best.type) && !best.moment) {
        best.tagged = true;
        best.startleT = 0; // caught mid-startle: it is off at once
        best.hideAt = best.hideAt ?? nearestHide(best.group.position);
      }
      return { type: best.type, wasStalked };
    },
    update(dt, t, playerPos, catPos) {
      clock = t;
      // R29: the cat's ground speed from its last two positions. Timed off
      // `t` (real time, like the cat's own movement) rather than `dt`, which
      // the slow-mo after a perfect sneak shrinks; `dt` only if `t` stalls.
      // A step faster than CAT_SPEED_CAP is not the cat running — it is a
      // perch snap (interactions.js moves the cat onto a perch in one frame)
      // or a respawn — so it keeps the last reading rather than scaring a
      // mouse beside a still touch player who tapped climb.
      if (lastCat) {
        const span = t > lastT ? t - lastT : dt;
        if (span > 0) {
          const speed = Math.hypot(catPos.x - lastCat.x, catPos.z - lastCat.z) / span;
          if (speed <= CAT_SPEED_CAP) catStill = speed < STILL_SPEED;
        }
        lastCat.copy(catPos);
      } else {
        lastCat = catPos.clone();
      }
      lastT = t;
      for (const c of [...list]) {
        if (c.hidden) continue; // Task 13: in cover for the rest of the walk
        const p = c.group.position;
        const dPlayer = p.distanceTo(playerPos);
        const dCat = p.distanceTo(catPos);
        const threat = Math.min(dPlayer, dCat);

        // v18 Far Call: ease the idle anchor toward wherever it is currently
        // aimed — the caller while a call is live, home once it lapses. With
        // no call in play anchorTo is null and the anchor is already home, so
        // this is a single Vector3 equality check and nothing moves.
        if (c.drawT > 0) {
          c.drawT -= dt;
          if (c.drawT <= 0) {
            c.anchorTo = null;
            c.calm = true; // R32: it came because it was called — see the prey branch
          }
        }
        const anchorGoal = c.anchorTo ?? c.anchorHome;
        if (!c.anchor.equals(anchorGoal)) {
          const step = ANCHOR_SPEED * dt;
          const toGoal = anchorGoal.clone().sub(c.anchor);
          if (toGoal.length() <= step) c.anchor.copy(anchorGoal);
          else c.anchor.addScaledVector(toGoal.normalize(), step);
        }

        if (c.moment) {
          // scripted dash: out 3s, back 3s, then despawn
          c.moment.t += dt;
          const target = c.moment.t < 3 ? c.moment.target
            : c.anchor.clone();
          const dir = target.clone().sub(p).setY(0);
          if (dir.length() > 0.2) p.addScaledVector(dir.normalize(), dt * 5);
          if (c.moment.t > 6) remove(c);
          continue;
        }

        if (c.type === 'bird' || c.type === 'seagull') {
          if (c.fleeing) {
            p.y += dt * 6;
            p.x += Math.sin(c.phase) * dt * 4;
            p.z += Math.cos(c.phase) * dt * 4;
            c.cooldown -= dt;
            if (c.cooldown <= 0) {
              p.set(c.anchor.x, 0, c.anchor.z);
              c.fleeing = false;
            }
          } else {
            p.y = Math.abs(Math.sin(t * 3 + c.phase)) * 0.08; // hop
            if (threat < 2.5 * fleeScale * fleeModifier * (c.type === 'seagull' ? 1.4 : 1)) {
              c.fleeing = true;
              c.cooldown = 18;
            }
          }
        } else if (c.type === 'squirrel' || c.type === 'mouse' || c.type === 'rat') {
          const fleeSpeed = c.type === 'mouse' ? 6.5 : c.type === 'rat' ? 5.5 : 4.5;
          // Task 13: noticing the cat. Off cover, it is the pounce-tag's dash.
          // A stalking or still cat is noticed late and startles it first
          // (R27, R29); a critter answering a Far Call came because it was
          // called, and notices nothing while the call lasts (R28) — nor after
          // it (R32), until the cat has once been out past PREY_NOTICE or the
          // critter is back at its home anchor, whichever comes first.
          if (c.calm && (dCat > PREY_NOTICE || c.anchor.equals(c.anchorHome))) c.calm = false;
          const sneaky = catStalking || catStill;
          if (!c.fleeing && !(c.drawT > 0) && !c.calm && dCat < (sneaky ? PREY_NOTICE_STALKED : PREY_NOTICE)) {
            c.fleeing = true;
            c.cooldown = 3;
            c.hideAt = nearestHide(p);
            // No freezing on top of its own cover: it is simply in.
            const atCover = c.hideAt && p.distanceTo(c.hideAt) <= HIDE_REACH;
            c.startleT = sneaky && !atCover ? PREY_STARTLE : 0;
          }
          if (c.startleT > 0) {
            c.startleT -= dt; // frozen to the spot
          } else if (c.fleeing && c.hideAt) {
            // running for cover: straight there, at the dash speed, until it is in
            const to = c.hideAt.clone().sub(p).setY(0);
            const d = to.length();
            if (d > HIDE_REACH) p.addScaledVector(to.normalize(), Math.min(dt * fleeSpeed, d));
            if (p.distanceTo(c.hideAt) <= HIDE_REACH) hide(c);
          } else if (c.fleeing) {
            // pounce-tagged: dash away from the cat for a few seconds, then resume patrol
            const away = p.clone().sub(catPos).setY(0);
            if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
            away.normalize();
            p.addScaledVector(away, dt * fleeSpeed);
            c.cooldown -= dt;
            if (c.cooldown <= 0) {
              c.fleeing = false;
              // The catch is over: if it later gets away to cover untouched,
              // that is an escape like any other, and the walk hears of it.
              c.tagged = false;
            }
          } else {
            const a = c.anchor;
            const bPt = a.clone().add(c.patrolSpan);
            const k = (Math.sin(t * 0.6 + c.phase) + 1) / 2;
            p.lerpVectors(a, bPt, k);
          }
        } else if (c.type === 'butterfly' || c.type === 'firefly') {
          const cx = c.trail ? catPos.x : c.anchor.x;
          const cz = c.trail ? catPos.z : c.anchor.z;
          p.x = cx + Math.sin(t * 0.8 + c.phase) * 1.5;
          p.z = cz + Math.cos(t * 0.6 + c.phase) * 1.5;
          p.y = 0.8 + Math.sin(t * 2 + c.phase) * 0.3;
        } else if (c.type === 'duck') {
          const r = 2;
          p.x = c.anchor.x + Math.cos(t * 0.3 + c.phase) * r;
          p.z = c.anchor.z + Math.sin(t * 0.3 + c.phase) * r;
          c.group.rotation.y = -(t * 0.3 + c.phase);
        } else if (c.type === 'crab') {
          p.x = c.anchor.x + Math.sin(t * 1.5 + c.phase) * 1.2;
        } else if (c.type === 'villager') {
          const arm = c.group.userData.arm;
          if (c.meowWaveT > 0) c.meowWaveT -= dt;
          if (dPlayer < 5 || c.meowWaveT > 0) {
            arm.rotation.z = 2.6 + Math.sin(t * 6) * 0.3; // wave
            if (!c.waved && dPlayer < 5) {
              c.waved = true;
              bus.emit('villager:wave', { id: c.id });
            }
          } else {
            arm.rotation.z = 0.4;
            if (dPlayer > 8) c.waved = false;
          }
        }
      }
    },
  };
  return api;
}
