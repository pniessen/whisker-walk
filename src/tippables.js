import * as THREE from 'three';
import { litMaterial } from './render/materials.js';
import { hasSkill } from './skills.js';

// v18 "Big Swat" (skills.js id 'big-swat', unlocked by tipping 40 things).
//
// Two effects, both gated on hasSkill(state, 'big-swat') and both LOCAL: the
// spec's non-goals forbid a new broadcast kind, so a cascade is spectacle on
// the swatting player's own screen and is never mirrored to peers (see
// tipById below). Without the skill every number here is inert and the module
// behaves exactly as it did pre-v18.
const BIG_SWAT_ID = 'big-swat';
// "Knock-over radius doubles" means the CASCADE radius — how far a falling
// prop reaches to take its neighbours down — and NOT the reach to the prop
// you swat. nearest() therefore honours the caller's maxDist in every skill
// state (v18 final review).
//
// It was originally a x2 multiplier inside nearest(), which broke a system
// two modules away: game/interactions.js uses that same nearest() call for
// the PROMPT, and the tip branch sits second in the prompt chain, so a 2.6m
// tip reach outranked stray greet (2.5), quest-accept (2.5), scratch (2.2),
// boop (1.5), dig (1.2), race and kitten. At the Docks — authored as both
// the densest tippable field and the largest stray population — a Big Swat
// player standing near a crate got "E — paw it over" and could not greet the
// cat in front of them without walking away. That is the CF-2 failure again:
// an ability earned by tipping 40 things making non-tipping play worse.
//
// Fixing it here rather than by reordering the prompt chain keeps shipped
// prompt priorities untouched, and the ability keeps its real payload (a
// bigger chain reaction).
//
// How far a toppling prop reaches to take its neighbours down with it. Fixed
// in world units rather than derived from nearest()'s maxDist, because tip()
// is also reachable without a preceding nearest() call. 2.6 is the doubled
// form of the 1.3m reach interactions.js prompts at, so the cascade covers
// exactly the neighbourhood a Big Swat player could already have swatted.
const CASCADE_RADIUS = 2.6;
// Hop budget for the chain. Two mechanisms bound the cascade and both are
// load-bearing:
//
//  1. tipEntry() refuses an already-tipped entry, so nothing is ever enqueued
//     twice — that alone terminates the walk (it is a BFS over a finite list
//     with each node consumed at most once) even when two props sit inside
//     each other's radius and would otherwise topple each other forever.
//  2. This cap, which is a DESIGN bound rather than a safety one: without it
//     a dense row of bins would flatten a whole street from one tap, which
//     overshoots "cascades into neighbouring tippables".
//
// The walk is iterative, so a long chain costs queue entries, not stack.
const CASCADE_MAX_HOPS = 2;

const mat = (color) => litMaterial(color);
let nextId = 1;

function buildTippable(kind) {
  const g = new THREE.Group();
  if (kind === 'pot') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.24, 8), mat(0xc06a48));
    pot.position.y = 0.12;
    g.add(pot);
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), mat(0x4e9440));
    plant.position.y = 0.32;
    g.add(plant);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(0xf2a0c0));
    bloom.position.y = 0.44;
    g.add(bloom);
  } else if (kind === 'can') {
    const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 8), mat(0x6a9ab8));
    canBody.position.y = 0.11;
    g.add(canBody);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.2, 6), mat(0x6a9ab8));
    spout.rotation.z = 0.9;
    spout.position.set(0.14, 0.16, 0);
    g.add(spout);
  } else {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.4, 8), mat(0x8a8a92));
    bin.position.y = 0.2;
    g.add(bin);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 8), mat(0x74747c));
    lid.position.y = 0.42;
    g.add(lid);
  }
  return g;
}

// shared mutation for tipping an entry, used by both tip(e) (caller already
// has the entry, e.g. from nearest()) and tipById(id) (remote events only
// carry the id over the wire)
function tipEntry(e) {
  if (e.tipped) return false;
  e.tipped = true;
  e.anim = 0.5;
  return true;
}

// opts.getState is a GETTER, not a state snapshot, for two reasons: the walk
// session is built before the ability is ever queried, and hasSkill reads the
// live feat tally, so a player who crosses 40 tip-overs mid-walk gets Big Swat
// on the very next swat instead of after a reload. Omitting it (the current
// walk.js call, which another v18 task owns) leaves state null, hasSkill false
// and every path below on its exact pre-v18 behaviour.
export function createTippables(scene, spots, opts = {}) {
  const getState = typeof opts.getState === 'function' ? opts.getState : () => null;
  const bigSwat = () => hasSkill(getState(), BIG_SWAT_ID);
  const list = [];
  for (const spot of spots) {
    const group = buildTippable(spot.kind);
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = (spot.x * 7 + spot.z * 13) % 6; // stable pseudo-random facing
    scene.add(group);
    list.push({ id: `tip-${nextId++}`, kind: spot.kind, group, tipped: false, anim: 0 });
  }

  // Breadth-first topple outward from an already-tipped entry, bounded by
  // CASCADE_MAX_HOPS (see the constant for why the two bounds differ). Each
  // frontier is fully resolved before the next, so an entry reachable from
  // two directions is tipped once, at its shortest hop distance, and the
  // `tipEntry` guard drops the duplicate rather than re-animating it. Two
  // props sitting inside each other's CASCADE_RADIUS therefore settle instead
  // of bouncing the chain back and forth — the failure mode this shape exists
  // to prevent.
  function cascadeFrom(origin) {
    let frontier = [origin];
    for (let hop = 0; hop < CASCADE_MAX_HOPS && frontier.length; hop++) {
      const next = [];
      for (const from of frontier) {
        for (const e of list) {
          if (e.tipped) continue; // already down (or already queued this hop)
          if (e.group.position.distanceTo(from.group.position) > CASCADE_RADIUS) continue;
          if (tipEntry(e)) next.push(e);
        }
      }
      frontier = next;
    }
  }

  return {
    list,
    // Skill-INDEPENDENT by design: the caller's maxDist is honoured exactly,
    // with or without Big Swat. game/interactions.js drives the prompt off
    // this call, so widening it here silently re-prioritises the whole prompt
    // chain (see the CASCADE_RADIUS note above). Big Swat's reach lives in
    // cascadeFrom, where it cannot shadow another interaction.
    nearest(pos, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const e of list) {
        if (e.tipped) continue;
        const d = e.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    },
    // Returns whether THIS entry went over, unchanged from pre-v18 and from
    // the caller's point of view still "did my swat land". Anything the
    // cascade knocks down gets no net event and no second return value: the
    // wire event names one prop id, and a cascade is deliberately local
    // spectacle (see tipById).
    //
    // It does NOT go unawarded, though (v18 CF-2): game/interactions.js
    // diffs `list` across this call and pays the usual one mischief award per
    // prop that actually went over, cascaded ones included, because an
    // ability earned by tipping 40 things must not make tipping score less.
    // The diff lives at the call site rather than in a richer return value so
    // this contract stays the boolean every other caller already expects.
    tip(e) {
      if (!tipEntry(e)) return false;
      if (bigSwat()) cascadeFrom(e);
      return true;
    },
    // Remote tips deliberately do NOT cascade, even when the local player has
    // Big Swat: the wire event says "this one id went over" and nothing else,
    // so cascading here would knock down props the sender still sees standing
    // and can still swat. Whether the SENDER had the ability is unknowable
    // without a protocol change, which the spec's non-goals rule out.
    tipById(id) {
      const e = list.find((x) => x.id === id);
      return e ? tipEntry(e) : false;
    },
    update(dt) {
      for (const e of list) {
        if (!e.tipped || e.anim <= 0) continue;
        e.anim -= dt;
        const k = 1 - Math.max(0, e.anim) / 0.5; // 0 → 1
        e.group.rotation.z = -1.75 * k;
        e.group.position.y = Math.sin(k * Math.PI) * 0.12; // little hop
      }
    },
  };
}
