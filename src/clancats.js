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
import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { makeNameTag, NAME_TAG_RANGE } from './nametag.js';
import { mulberry32, seedFromCode } from './rng.js';
import { RANK_SCALE, ROAM_SLOTS, CAST_RANKS, tagSubFor } from './clancast.js';
import { RANK_KEYS } from './clanwords.js';

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
const DEPUTY_LOOK = 0.6;     // radians either side of the camp's centre
const DEPUTY_LOOK_RATE = 0.25;
const GREET_HOLD = 3;
const BOOP_HOLD = 1.5;

const CAMP_RANKS = new Set([K.leader, K.deputy, K.elder, K.kit]);

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
  reducedMotion = false, onBuddyEnd = () => {},
} = {}) {
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
    const group = buildCat(member.breed, undefined, { simple: true, style: member.style });
    group.scale.multiplyScalar(scale);
    group.position.set(seat.x, seat.y, seat.z);
    const face = camp
      ? yawToward(seat.x, seat.z, cx, cz)
      : (seedFromCode(member.id) / 2 ** 32) * Math.PI * 2;
    group.rotation.y = face;
    // Lever 1 of the draw budget: camp-seated cats cast no shadow-map shadow.
    // Set on every mesh before walk.js's assignShadowCasters sweep, which
    // skips a noCast mesh. The tag (a sprite) is added after, and is no mesh.
    if (camp) group.traverse((o) => { if (o.isMesh) o.userData.noCast = true; });
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
      away: false,      // a kit sitting on its neighbour's seat
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
      p.x = c.hopFrom.x + (c.hopTo.x - c.hopFrom.x) * c.hopT;
      p.z = c.hopFrom.z + (c.hopTo.z - c.hopFrom.z) * c.hopT;
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
      const mine = kitSeats[c.kitSeat];
      const to = c.away ? mine : neighbourSeat(c.kitSeat);
      c.away = !c.away;
      c.hopFrom = { x: p.x, z: p.z };
      c.hopTo = { x: to.x, z: to.z };
      c.hopT = 0;
      c.state = 'hop';
      c.group.rotation.y = yawToward(p.x, p.z, to.x, to.z);
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
    } else if (c.timer <= 0) {
      // A new leg: a target 2-6 m from home, from this cat's own stream. One
      // the clan's ground rejects ends the leg before it starts.
      const a = c.wanderRng() * Math.PI * 2;
      const r = ROAM_MIN + c.wanderRng() * (ROAM_MAX - ROAM_MIN);
      const tx = c.home.x + Math.sin(a) * r;
      const tz = c.home.z + Math.cos(a) * r;
      if (ok(tx, tz)) {
        c.state = 'wander';
        c.target = { x: tx, z: tz };
        c.timer = LEG_GIVE_UP;
      } else {
        endLeg(c);
      }
    }
    animateCat(c.group, c.pose, t, 0);
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
    update(dt, t, catPos) {
      if (Number.isFinite(dt) && dt > 0) clock += dt;
      for (const c of list) {
        if (c.tag) {
          const range = c.tag.userData?.revealRange ?? NAME_TAG_RANGE;
          c.tag.visible = catPos ? c.group.position.distanceTo(catPos) < range : false;
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
        updateRoamer(c, dt, t);
      }
    },
    dispose() {
      for (const c of list) scene.remove(c.group);
    },
  };
}
