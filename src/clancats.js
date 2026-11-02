// The territory's clan, living in the walk (Clan Life Part 1, Task 3): the
// leader on the rock, the deputy beside it, elders napping by the den, kits
// hopping in front of it, and warriors and apprentices about the land.
//
// DERIVED, NEVER STORED. Who the cats are comes from clancast.js (the clan id
// and slot); where they sit comes from the camp layout and the roaming homes,
// both pure over the built map. Nothing here reads or writes the save, and
// nothing draws from walkRng or the strays' stream. Each cat has its own
// wander stream, mulberry32(((roomSeed ?? one Math.random base) +
// seedFromCode(id)) ^ CLAN_WANDER_SALT), exactly the strays' strayWanderRng
// pattern with its own salt: two co-walkers on one roomSeed see the same cats
// do the same things, and a local greet can only ever shift the one cat it
// touched.
//
// A clan cat is never in strayCats.strays, and its name is never a stray name,
// so no feed, grudge, tame or colony path can reach it: those all start from
// the strays' list. The imports below are leaves only (a structural test pins
// them): nothing from progression, colony, discoveries, enemies or net.
//
// PATROL TOGETHER (Task 6). A warrior or apprentice can walk beside a target
// (my cat, or a co-walker's remote cat) for up to BUDDY_TIME seconds:
// startBuddy / endBuddy / markBeside below, and buddyEnded, checked in update.
// Where it may walk: only where `isWalkable` (clan ground: no water, no wade
// band, no keep-out, no truce path) allows, exactly as it wanders. A step the
// clan's ground rejects is tried along each axis alone (so it slides along a
// bank) and otherwise not taken: the buddy stalls at the water's edge, and if
// the player swims or wades on, she leaves it behind and the patrol ends once
// she is BUDDY_GIVE_UP metres away: as 'terrain' when the ground stopped it
// in the last BUDDY_BLOCK_MEMORY seconds (told with the friendly goodbye),
// as 'far' when she simply outran it. It goes home along its own
// trail (every point of which it stood on) and then straight to its home spot.
// A patrol is world state only: what it pays is interactions.js's business,
// told through onBuddyEnd, and only for a buddy that follows MY cat (a remote
// one, started from the wire, ends without a word).
import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { makeNameTag, NAME_TAG_RANGE } from './nametag.js';
import { mulberry32, seedFromCode } from './rng.js';
import { RANK_SCALE, ROAM_SLOTS, CAST_RANKS, tagSubFor } from './clancast.js';
import { RANK_KEYS } from './clanwords.js';
import { isTrespassing } from './rivalclans.js';

// Keeps this derivation apart from the strays' WANDER_SALT and every other
// per-cat seed built from the same room seed.
export const CLAN_WANDER_SALT = 0xc1a9ca75;

const K = RANK_KEYS;
const ROAM_SPEED = 1.2;
const ROAM_MIN = 2;
const ROAM_MAX = 6;          // clancast.js ROAM_RADIUS: a leg's target is never further from home
const LEG_GIVE_UP = 8;       // seconds: an unreachable target ends the leg
const KIT_HOP_TIME = 0.5;    // seconds for one hop between kit seats
const KIT_HOP_HEIGHT = 0.12;
const KIT_HOP_BOW = 0.3;     // sideways bow of a hop, metres
const DEPUTY_LOOK = 0.6;     // radians either side of the camp's centre
const DEPUTY_LOOK_RATE = 0.25;
const GREET_HOLD = 3;
const BOOP_HOLD = 1.5;

const CAMP_RANKS = new Set([K.leader, K.deputy, K.elder, K.kit]);
// Who may patrol: the camp's own (leader, deputy, elders, kits) keep the camp.
const PATROL_RANKS = new Set([K.warrior, K.apprentice]);

// Patrol together (Task 6).
export const BUDDY_TIME = 60;     // seconds: the longest walk-along
export const PATROL_MIN = 30;     // seconds together before a patrol pays
export const BUDDY_GIVE_UP = 12;  // metres: left this far behind, it gives up
export const BUDDY_EDGE = 4;      // metres from the map's bounds: the border
const BUDDY_SIDE = 1.2;           // metres to the target's right
const BUDDY_MAX_SPEED = 4;        // m/s: it matches the target's pace up to this
const BUDDY_SETTLE = 0.05;        // metres: close enough to its spot to stand
const BUDDY_BLOCK_MEMORY = 1;    // seconds: a 'far' end this soon after the ground stopped it is 'terrain'
const BYE_HOLD = 1.5;             // seconds of goodbye (requestPet, facing the target)
const MARK_TIME = 1;              // seconds of stretch beside a mark
const HOME_SPEED = 2;             // m/s back along its trail
const TRAIL_STEP = 1;             // metres between trail points
const TRAIL_MAX = 600;
const SKIRT_TURN = Math.PI / 12;  // 15 degrees per try when skirting an obstacle
const SKIRT_STEPS = 12;           // up to straight back along the way it came
const HOME_SKIRT_MAX = 20;        // seconds of skirting before it gives up for now
const HOME_RETRIES = 3;           // tries for home, each after a leg of wandering

const nearEdge = (p, b) => !!b
  && (p.x - b.minX < BUDDY_EDGE || b.maxX - p.x < BUDDY_EDGE || p.z - b.minZ < BUDDY_EDGE || b.maxZ - p.z < BUDDY_EDGE);

// Why a walk-along ends now, or null. 'time' after BUDDY_TIME; 'camp' when the
// target is inside the camp disc; 'edge' within BUDDY_EDGE of the bounds;
// 'far' when the target is more than BUDDY_GIVE_UP away (flat distance).
// 'camp' and 'edge' are armed only once the target has been outside them
// (buddy.armed, set in update), so a patrol started at the camp or by the
// border does not end the instant it begins.
export function buddyEnded(cat, { areaId, bounds } = {}) {
  const b = cat?.buddy;
  if (!b) return null;
  if (b.seconds >= BUDDY_TIME) return 'time';
  const tp = b.target.position;
  if (b.armed?.camp && isTrespassing(areaId, tp.x, tp.z)) return 'camp';
  if (b.armed?.edge && nearEdge(tp, bounds)) return 'edge';
  const p = cat.group.position;
  if (Math.hypot(tp.x - p.x, tp.z - p.z) > BUDDY_GIVE_UP) return 'far';
  return null;
}

// The how-manyth cat of its rank this slot is (0 for the first elder, 1 for
// the second): the seat order in campLayout follows slot order.
const rankIndex = (slot, rank) => CAST_RANKS.slice(0, slot).filter((r) => r === rank).length;

// Where a member sits, or null if there is nowhere for it (no camp, or fewer
// roaming homes than roamers; a cat with no seat is left out of the walk on
// every device alike, since the layout and the homes are the same everywhere).
function seatFor(member, layout, homes) {
  const { rank, slot } = member;
  if (CAMP_RANKS.has(rank)) {
    if (!layout) return null;
    const S = layout.seats;
    if (rank === K.leader) return { x: S.leader.x, y: S.leader.y, z: S.leader.z };
    if (rank === K.deputy) return { x: S.deputy.x, y: 0, z: S.deputy.z };
    const list = rank === K.elder ? S.elders : S.kits;
    const p = list[rankIndex(slot, rank)];
    return p ? { x: p.x, y: 0, z: p.z } : null;
  }
  const i = ROAM_SLOTS.indexOf(slot);
  const h = i >= 0 && Array.isArray(homes) ? homes[i] : null;
  return h && Number.isFinite(h.x) && Number.isFinite(h.z) ? { x: h.x, y: 0, z: h.z } : null;
}

// The yaw that turns a cat (nose at -z) to look from (x, z) toward (tx, tz).
const yawToward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z) + Math.PI;

export function createClanCats(scene, area, cast, {
  campLayout = null, roamHomes = [], isWalkable = () => true, roomSeed, showNames = false,
  reducedMotion = false, onBuddyEnd = () => {}, areaId = area?.id ?? null,
  // Fight moves and scars: a cast member's scars (scars.js render entries),
  // applied at build. A member without any is built exactly as before.
  scarsFor = () => [],
} = {}) {
  const bounds = area?.bounds ?? null;
  const wanderBase = (roomSeed ?? (Math.random() * 2 ** 31)) >>> 0;
  const ok = (x, z) => isWalkable(x, z) === true;
  const cx = campLayout?.cx ?? 0;
  const cz = campLayout?.cz ?? 0;
  const kitSeats = campLayout?.seats?.kits ?? [];
  const list = [];
  let clock = 0;

  for (const member of Array.isArray(cast) ? cast : []) {
    const seat = seatFor(member, campLayout, roamHomes);
    if (!seat) continue;
    const camp = CAMP_RANKS.has(member.rank);
    const scale = RANK_SCALE[member.rank] ?? 1;
    const scars = scarsFor(member.id);
    const group = buildCat(member.breed, undefined, { simple: true, style: member.style, scars: Array.isArray(scars) ? scars : [] });
    group.scale.multiplyScalar(scale);
    group.position.set(seat.x, seat.y, seat.z);
    const face = camp
      ? yawToward(seat.x, seat.z, cx, cz)
      : (seedFromCode(member.id) / 2 ** 32) * Math.PI * 2;
    group.rotation.y = face;
    // Lever 1 of the draw budget: camp-seated cats cast no shadow-map shadow.
    // Set on every mesh before walk.js's assignShadowCasters sweep, which
    // skips a noCast mesh. The tag (a sprite) is added after, and is no mesh.
    // They still RECEIVE shadows (a receiver costs no shadow-pass draw);
    // rig.js skips a noCast mesh entirely, so receiveShadow is set here.
    if (camp) {
      group.traverse((o) => {
        if (o.isMesh) { o.userData.noCast = true; o.castShadow = false; o.receiveShadow = true; }
      });
    }
    let tag = null;
    if (showNames) {
      tag = makeNameTag(member.name, { sub: tagSubFor(member) });
      if (tag) {
        // Counter-scaled, so a kit's tag reads as big as a warrior's.
        tag.scale.x /= scale;
        tag.scale.y /= scale;
        group.add(tag);
      }
    }
    scene.add(group);
    const wanderRng = mulberry32(((wanderBase + seedFromCode(member.id)) ^ CLAN_WANDER_SALT) >>> 0);
    const isKit = member.rank === K.kit;
    const kitSeat = isKit ? rankIndex(member.slot, member.rank) : -1;
    list.push({
      id: member.id,
      name: member.name,
      rank: member.rank,
      clan: member.clan,
      slot: member.slot,
      group,
      tag,
      home: new THREE.Vector3(seat.x, seat.y, seat.z),
      state: camp ? 'post' : 'idle',
      greeted: false,
      booped: false,
      patrolled: false,
      buddy: null,
      // Private to this module.
      camp,
      face,
      wanderRng,
      timer: camp ? (isKit ? 2 + wanderRng() * 2 : 0) : 1 + wanderRng() * 3,
      pose: 'follow',
      target: null,
      hold: 0,
      resume: null,
      kitSeat,          // the seat this kit belongs to
      hopFrom: null,
      hopTo: null,
      hopT: 0,
      at: kitSeat,      // the kit seat this kit sits on, or is hopping to
      trail: null,      // a buddy's way back home (points it stood on)
      skirt: null,      // { side, t } while skirting an obstacle on the way home
      lost: false,      // its last try for home gave up; it tries again after a leg
      lostLeg: false,
      homeTries: 0,
    });
  }

  // The neighbouring kit seat: 0<->1 and 2<->3, so a LOW camp (kits 0 and 1)
  // hops between the same two seats a HIGH one does.
  const neighbourSeat = (i) => kitSeats[i ^ 1] ?? kitSeats[i];

  function face(cat, fromPos) {
    const p = cat.group.position;
    cat.group.rotation.y = yawToward(p.x, p.z, fromPos.x, fromPos.z);
  }

  function hold(cat, secs, fromPos) {
    // A kit caught mid-hop lands where it is first, with the draw a hop's end
    // makes anyway, so the hold never leaves it hanging in the air.
    if (cat.state === 'hop') {
      cat.group.position.y = 0;
      cat.state = 'post';
      cat.timer = 2 + cat.wanderRng() * 2;
    }
    if (cat.state !== 'greet') cat.resume = cat.state;
    cat.state = 'greet';
    cat.hold = secs;
    if (fromPos) face(cat, fromPos);
  }

  function postPose(cat) {
    if (cat.rank === K.leader) return 'requestPet';
    if (cat.rank === K.elder) return 'nap';
    if (cat.rank === K.kit) return reducedMotion ? 'requestPet' : 'pounce';
    return 'follow'; // the deputy, standing, looking out
  }

  function updateKit(c, dt, t) {
    if (reducedMotion) {
      animateCat(c.group, 'requestPet', t, 0);
      return;
    }
    const p = c.group.position;
    if (c.state === 'hop') {
      c.hopT = Math.min(1, c.hopT + dt / KIT_HOP_TIME);
      // A sideways bow of the path, so two kits swapping seats pass on
      // opposite sides instead of through each other.
      const dx = c.hopTo.x - c.hopFrom.x;
      const dz = c.hopTo.z - c.hopFrom.z;
      const dl = Math.hypot(dx, dz) || 1;
      const bow = Math.sin(Math.PI * c.hopT) * KIT_HOP_BOW;
      p.x = c.hopFrom.x + dx * c.hopT - (dz / dl) * bow;
      p.z = c.hopFrom.z + dz * c.hopT + (dx / dl) * bow;
      p.y = Math.sin(Math.PI * c.hopT) * KIT_HOP_HEIGHT;
      animateCat(c.group, 'pounce', t, ROAM_SPEED);
      if (c.hopT >= 1) {
        p.set(c.hopTo.x, 0, c.hopTo.z);
        c.state = 'post';
        c.timer = 2 + c.wanderRng() * 2;
      }
      return;
    }
    c.timer -= dt;
    if (c.timer <= 0) {
      // Kits trade places with their pair partner (0<->1, 2<->3). A seat is
      // never shared: if the partner sits on the target seat the two swap,
      // hopping past each other on opposite sides; if the partner is still
      // hopping, wait a beat. No random draw here, so streams are untouched.
      const ti = c.at ^ 1;
      const partner = list.find((o) => o !== c && o.kitSeat >= 0 && o.kitSeat === (c.kitSeat ^ 1));
      if (!kitSeats[ti]) { c.timer = 2; return animateCat(c.group, 'pounce', t, 0); }
      if (partner && partner.at === ti && partner.state !== 'post') {
        c.timer = 0.5;
        return animateCat(c.group, 'pounce', t, 0);
      }
      const swap = partner && partner.at === ti;
      const startHop = (k, to) => {
        const kp = k.group.position;
        k.hopFrom = { x: kp.x, z: kp.z };
        k.hopTo = { x: to.x, z: to.z };
        k.hopT = 0;
        k.state = 'hop';
        k.group.rotation.y = yawToward(kp.x, kp.z, to.x, to.z);
      };
      const fromAt = c.at;
      startHop(c, kitSeats[ti]);
      c.at = ti;
      if (swap) { startHop(partner, kitSeats[fromAt]); partner.at = fromAt; }
    }
    animateCat(c.group, 'pounce', t, 0);
  }

  function updateRoamer(c, dt, t) {
    const p = c.group.position;
    c.timer -= dt;
    if (c.state === 'wander' && c.target) {
      const dx = c.target.x - p.x;
      const dz = c.target.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = ROAM_SPEED * dt;
      if (d < 0.3 || c.timer <= 0) {
        endLeg(c);
      } else {
        const nx = p.x + (dx / d) * Math.min(step, d);
        const nz = p.z + (dz / d) * Math.min(step, d);
        if (!ok(nx, nz)) {
          endLeg(c);
        } else {
          p.x = nx;
          p.z = nz;
          c.group.rotation.y = Math.atan2(dx, dz) + Math.PI;
          animateCat(c.group, 'follow', t, ROAM_SPEED);
          return;
        }
      }
    } else if (c.timer <= 0 && c.lost && c.lostLeg) {
      // Its last try for home gave up, and it has wandered a leg since (which
      // may have taken it round the obstacle): it tries for home again.
      c.lost = false;
      c.lostLeg = false;
      c.state = 'home';
      c.trail = [];
    } else if (c.timer <= 0) {
      // A new leg: a target 2-6 m from home, from this cat's own stream. One
      // the clan's ground rejects ends the leg before it starts.
      const a = c.wanderRng() * Math.PI * 2;
      const r = ROAM_MIN + c.wanderRng() * (ROAM_MAX - ROAM_MIN);
      const tx = c.home.x + Math.sin(a) * r;
      const tz = c.home.z + Math.cos(a) * r;
      if (ok(tx, tz)) {
        // a lost cat retries home only after a leg it actually walked
        if (c.lost) c.lostLeg = true;
        c.state = 'wander';
        c.target = { x: tx, z: tz };
        c.timer = LEG_GIVE_UP;
      } else {
        endLeg(c);
      }
    }
    animateCat(c.group, c.pose, t, 0);
  }

  // A buddy beside its target: BUDDY_SIDE to the target's right (the target's
  // nose is at its local -z, as every cat's is), closing at up to
  // BUDDY_MAX_SPEED, on clan ground only (see the header).
  function updateBuddy(c, dt, t) {
    const b = c.buddy;
    if (Number.isFinite(dt) && dt > 0) b.seconds += dt;
    const tp = b.target.position;
    if (!b.armed.camp && !isTrespassing(areaId, tp.x, tp.z)) b.armed.camp = true;
    if (!b.armed.edge && !nearEdge(tp, bounds)) b.armed.edge = true;
    const p = c.group.position;
    if (b.attached && !b.target.parent) {
      // Her cat left the walk (remotecats removes its group from the scene):
      // let go, as at the end of her patrol, with nothing to report.
      endBuddy(c);
      return;
    }
    if (b.mark > 0) {
      b.mark -= dt;
      animateCat(c.group, 'stretch', t, 0);
    } else {
      const yaw = b.target.rotation?.y ?? 0;
      const gx = tp.x + Math.cos(yaw) * BUDDY_SIDE;
      const gz = tp.z - Math.sin(yaw) * BUDDY_SIDE;
      const dx = gx - p.x;
      const dz = gz - p.z;
      const d = Math.hypot(dx, dz);
      let speed = 0;
      if (d > BUDDY_SETTLE && dt > 0) {
        const step = Math.min(d, BUDDY_MAX_SPEED * dt);
        const nx = p.x + (dx / d) * step;
        const nz = p.z + (dz / d) * step;
        let to = null;
        if (ok(nx, nz)) to = [nx, nz];
        else {
          // The ground turned the straight step away: remembered, so a 'far'
          // end soon after is told as the water or the path's doing.
          b.blockedAt = b.seconds;
          if (ok(nx, p.z)) to = [nx, p.z];
          else if (ok(p.x, nz)) to = [p.x, nz];
        }
        if (to) {
          const moved = Math.hypot(to[0] - p.x, to[1] - p.z);
          if (moved > 1e-6) c.group.rotation.y = yawToward(p.x, p.z, to[0], to[1]);
          p.x = to[0];
          p.z = to[1];
          speed = moved / dt;
        }
      }
      if (speed < 0.3) c.group.rotation.y = yaw; // standing beside: looking where she looks
      const last = c.trail[c.trail.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= TRAIL_STEP) {
        if (c.trail.length < TRAIL_MAX) c.trail.push({ x: p.x, z: p.z });
      }
      animateCat(c.group, 'follow', t, speed);
    }
    let reason = buddyEnded(c, { areaId, bounds });
    if (reason === 'far' && b.blockedAt != null && b.seconds - b.blockedAt <= BUDDY_BLOCK_MEMORY) reason = 'terrain';
    if (reason) {
      const remote = b.remote;
      const { seconds } = endBuddy(c);
      if (!remote) onBuddyEnd(c, reason, seconds);
    }
  }

  // Back along the trail, newest point first, then to its home spot. Trail
  // points are places it stood (1 m apart), so retracing them needs no check.
  // The last leg, from where its first patrol began to home, was never walked
  // as such, so it is stepped on clan ground like the buddy (each axis alone
  // if the straight step is rejected; only a step that gets closer counts, so
  // it can never slide back and forth). When no step gets closer it skirts
  // the obstacle (skirtStep below) for up to HOME_SKIRT_MAX seconds; if that
  // fails too it goes back to wandering where it stands and tries for home
  // again after its next leg, HOME_RETRIES tries in all. Never a jump, and
  // never a draw beyond the legs' own.
  function updateHomeward(c, dt, t) {
    const p = c.group.position;
    const trail = c.trail ?? [];
    const last = !trail.length;
    const to = last ? c.home : trail[trail.length - 1];
    const dx = to.x - p.x;
    const dz = to.z - p.z;
    const d = Math.hypot(dx, dz);
    const step = HOME_SPEED * dt;
    if (d <= Math.max(step, 0.05) && (!last || ok(to.x, to.z))) {
      p.x = to.x;
      p.z = to.z;
      if (!last) trail.pop();
      else {
        c.trail = null;
        c.skirt = null;
        c.lost = false;
        c.homeTries = 0;
        endLeg(c);
      }
    } else if (d > 0) {
      const s1 = Math.min(step, d);
      const nx = p.x + (dx / d) * s1;
      const nz = p.z + (dz / d) * s1;
      let next = [nx, nz];
      if (last) {
        // Only a step that is on clan ground AND brings it closer to home.
        const closer = ([x, z]) => ok(x, z) && Math.hypot(to.x - x, to.z - z) < d - 1e-4;
        next = c.skirt ? null : [[nx, nz], [nx, p.z], [p.x, nz]].find(closer) ?? null;
        if (!next) next = skirtStep(c, dx / d, dz / d, s1, dt);
      }
      if (!next) {
        c.trail = null;
        c.skirt = null;
        endLeg(c);
        c.homeTries = (c.homeTries ?? 0) + 1;
        c.lost = c.homeTries < HOME_RETRIES;
      } else {
        c.group.rotation.y = yawToward(p.x, p.z, next[0], next[1]);
        p.x = next[0];
        p.z = next[1];
      }
    }
    animateCat(c.group, 'follow', t, HOME_SPEED);
  }

  // A step round whatever stands between a homeward cat and home: the goal
  // direction (ux, uz) turned by the smallest multiple of SKIRT_TURN that
  // clan ground (and the bounds) allows, always turning to the same side once
  // a side is chosen, so it hugs a bank or a path's edge until the way home
  // opens. Null when nothing is open or after HOME_SKIRT_MAX seconds.
  function skirtStep(c, ux, uz, len, dt) {
    const p = c.group.position;
    const open = (a) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = p.x + (ux * ca - uz * sa) * len;
      const z = p.z + (ux * sa + uz * ca) * len;
      const inside = !bounds || (x > bounds.minX + 0.5 && x < bounds.maxX - 0.5 && z > bounds.minZ + 0.5 && z < bounds.maxZ - 0.5);
      return inside && ok(x, z) ? [x, z] : null;
    };
    if (!c.skirt) {
      for (let k = 1; k <= SKIRT_STEPS && !c.skirt; k++) {
        if (open(k * SKIRT_TURN)) c.skirt = { side: 1, t: 0 };
        else if (open(-k * SKIRT_TURN)) c.skirt = { side: -1, t: 0 };
      }
      if (!c.skirt) return null;
    }
    c.skirt.t += Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (c.skirt.t > HOME_SKIRT_MAX) return null;
    for (let k = 0; k <= SKIRT_STEPS; k++) {
      const q = open(c.skirt.side * k * SKIRT_TURN);
      if (q) return q;
    }
    return null;
  }

  // Ends a walk-along: a goodbye facing the target, then home. Returns how
  // long it lasted ({ seconds: 0 } for a cat with no buddy: a no-op).
  function endBuddy(cat) {
    const b = cat?.buddy;
    if (!b) return { seconds: 0 };
    cat.buddy = null;
    cat.target = null;
    cat.state = 'home';
    hold(cat, BYE_HOLD, b.target.position);
    return { seconds: b.seconds };
  }

  function endLeg(c) {
    c.state = 'idle';
    c.target = null;
    c.pose = c.wanderRng() < 0.4 ? 'sniff' : 'follow';
    c.timer = 2 + c.wanderRng() * 4;
  }

  return {
    list,
    // nearest(pos, maxDist, { where }) -> the closest clan cat in range, or
    // null. `where` is asked last, only of a cat nearer than the best so far,
    // as straycats.nearest's is.
    nearest(pos, maxDist, { where = null } = {}) {
      let best = null;
      let bestD = maxDist;
      for (const c of list) {
        const d = c.group.position.distanceTo(pos);
        if (d < bestD && (!where || where(c))) {
          bestD = d;
          best = c;
        }
      }
      return best;
    },
    greet(cat, fromPos) {
      hold(cat, GREET_HOLD, fromPos);
      cat.greeted = true;
    },
    boop(cat, fromPos) {
      hold(cat, BOOP_HOLD, fromPos);
      cat.booped = true;
    },
    // Task 6 (patrol together) reports the end of a walk-along through this.
    onBuddyEnd,
    // startBuddy(cat, target, { remote }) -> true when it starts: a warrior
    // or apprentice of this walk with no buddy already. `remote` marks one
    // started from the wire (a co-walker's patrol): its end calls no
    // onBuddyEnd here.
    startBuddy(cat, target, { remote = false } = {}) {
      if (!cat || !list.includes(cat) || cat.buddy || !PATROL_RANKS.has(cat.rank)) return false;
      const tp = target?.position;
      if (!tp || !Number.isFinite(tp.x) || !Number.isFinite(tp.z)) return false;
      cat.buddy = {
        target,
        seconds: 0,
        remote: remote === true,
        mark: 0,
        // A target in a scene (a remote cat) that later leaves it ends the buddy.
        attached: !!target.parent,
        armed: { camp: !isTrespassing(areaId, tp.x, tp.z), edge: !nearEdge(tp, bounds) },
      };
      cat.state = 'buddy';
      cat.target = null;
      cat.resume = null;
      cat.hold = 0;
      // A cat still on its way home from an earlier patrol keeps that trail and
      // adds to it, so its walk home retraces both (never one long unchecked
      // line from here to home).
      const p = cat.group.position;
      cat.trail = cat.trail ?? [];
      cat.trail.push({ x: p.x, z: p.z });
      cat.skirt = null;
      cat.lost = false;
      cat.lostLeg = false;
      cat.homeTries = 0;
      return true;
    },
    endBuddy,
    // The paw-on-the-post look: a second's stretch where it stands. Display only.
    markBeside(cat) {
      if (cat?.buddy) cat.buddy.mark = MARK_TIME;
    },
    update(dt, t, catPos) {
      if (Number.isFinite(dt) && dt > 0) clock += dt;
      for (const c of list) {
        if (c.tag) {
          const range = c.tag.userData?.revealRange ?? NAME_TAG_RANGE;
          c.tag.visible = catPos ? c.group.position.distanceTo(catPos) < range : false;
        }
        if (c.buddy) {
          updateBuddy(c, dt, t);
          continue;
        }
        if (c.state === 'greet') {
          c.hold -= dt;
          animateCat(c.group, 'requestPet', t, 0);
          if (c.hold <= 0) {
            c.state = c.resume ?? (c.camp ? 'post' : 'idle');
            c.resume = null;
            if (c.camp && c.state !== 'hop') c.group.rotation.y = c.face;
          }
          continue;
        }
        if (c.rank === K.kit) {
          updateKit(c, dt, t);
          continue;
        }
        if (c.camp) {
          if (c.rank === K.deputy && !reducedMotion) {
            // Looking out over the camp: a slow turn either side of its centre,
            // on the walk's own clock, so both devices turn it alike.
            const phase = (seedFromCode(c.id) % 1000) / 1000 * Math.PI * 2;
            c.group.rotation.y = c.face + Math.sin(clock * DEPUTY_LOOK_RATE + phase) * DEPUTY_LOOK;
          }
          animateCat(c.group, postPose(c), t, 0);
          continue;
        }
        if (c.state === 'home') {
          updateHomeward(c, dt, t);
          continue;
        }
        updateRoamer(c, dt, t);
      }
    },
    dispose() {
      for (const c of list) scene.remove(c.group);
    },
  };
}
