// Intruders (Clan Life Part 2): now and then a warrior of a neighbouring clan
// walks across a territory, in from the edge that faces its own land and out
// by another edge. This file is the pure half: when a visit happens, who comes
// and where they are at any moment.
//
// WHY THE CLOCK. Who comes and where they are is a pure function of the area
// and the wall clock, nothing else: no walkRng, no strays' stream, no stored
// state, nothing on the wire. So both kids' devices on a co-walk see the same
// cat at the same spot at the same moment without sending a word about it, and
// a walk's own rng draws stay exactly as they were.
//
// The schedule: the clock is cut into INTRUDER_PERIOD slots. Slot k's hash
// h = seedFromCode(`${areaId}|intruder|${k}`) leaves 1 slot in 4 empty
// (h % 4 === 0); otherwise the visitor's clan is picked from the territory's
// neighbours (only those with a cast and a route here) and the visitor is one
// of that clan's warriors (RAIDER_SLOTS). It comes in ENTER_AT seconds into the
// slot and walks its route at INTRUDER_SPEED; every route is short enough
// that it has left before the next slot begins, so there is never more than
// one at a time.
//
// Only the four clan territories get intruders. The old areas (Neighborhood,
// Park, Seaside, Docks), the den and the island never do: the island is truce
// ground walked inside the Pines, and no route ever touches it.
//
// The THREE half (Task 2), createIntruders below, puts that cat in the walk:
// one mesh at a time, built when a visit comes on the map and freed when it
// goes. It can be held (a fight, or a co-walker's fight: holds are counted by
// holder), released (it catches up with its clock at no more than
// CATCH_UP_SPEED, so both devices agree again) and sent fleeing along its own
// route to the nearer end, which Task 1 proved is clan ground all the way.
//
// No progress lives here: this file imports nothing that stores anything.
import * as THREE from 'three';
import { buildCat, catDims } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { setCatScars } from './cat/scarmesh.js';
import { makeNameTag, NAME_TAG_RANGE } from './nametag.js';
import { seedFromCode } from './rng.js';
import { HOMES, isClanId } from './clanhomes.js';
import { castFor, clanCast, RAIDER_SLOTS, tagSubFor } from './clancast.js';

export const INTRUDER_PERIOD = 120; // s of wall clock per visit slot
export const ENTER_AT = 10; // s into its slot that a visitor comes on the map
export const INTRUDER_SPEED = 0.9; // m/s, an unhurried walk
export const ROUTE_MAX = 90; // m; ENTER_AT + 90 / 0.9 = 110 s < INTRUDER_PERIOD
export const FLEE_SPEED = 4.5; // m/s, off to the nearer end of its route
export const CATCH_UP_SPEED = 2.5; // m/s at most, back to its clock position
export const NOTICE_RANGE = 6; // m: it puffs up and hisses
export const CHALLENGE_RANGE = 3.5; // m: the Fight / Back off pill shows
export const CHALLENGE_KEEP = 10; // m: the pill stays up this far
export const RECHALLENGE_DELAY = 20; // s after a lost fight
export const HOLD_MAX = 40; // s a remote holder may hold with no word back

const pt = (x, z) => Object.freeze({ x, z });
const route = (...pts) => Object.freeze(pts.map(([x, z]) => pt(x, z)));

// One route per neighbouring clan, hand-probed on each built map (ruling R1):
// every 0.5 m along every segment is clan ground (clanWalkableFor: walkable,
// clear of every collider and every water and wade band, out of the keep-out,
// off the Pines' truce ground), and never on a deck either, so the intruder
// always walks on the ground. Each keeps 3 m beyond its camp's edge, starts and
// ends within 1.5 m of the map's edge, and is at most ROUTE_MAX long. The
// first point is on the edge that faces the visitor's own clan, as each map's
// "WHERE ITS EDGES FACE" note has it (x east, z south, so north is -z).
export const INTRUDER_ROUTES = Object.freeze({
  woods: Object.freeze({
    // The Moor is north. In from the Moor side on the river's east bank (the
    // glade west of it holds the camp), down the open wood east of the river,
    // and out the east edge towards Twolegplace. 77.4 m.
    moor: route([40, -49.5], [33, -25], [30, -5], [49.5, 20]),
    // The River is west. In from the River side just south of the pond,
    // east across the wood, then south and out by the south edge. 78.6 m.
    river: route([-49.5, 5], [-25, 6], [-5, 25], [5, 49.5]),
  }),
  river: Object.freeze({
    // The Pines is north. In from the Pines side onto the north strip, east
    // along it between the river and the north edge, through the dry gap
    // between river-north's reach and the lake's west shore, and out the east
    // edge along the lakeshore towards the Woods. The north strip's only links
    // south are the log bridge and the stepping stones, both decks, so the
    // route stays on the strip and the lakeshore rather than cross one. 77.4 m.
    pines: route([-20, -49.5], [0, -41], [20, -37], [23, -33], [32, -25], [49.5, -20]),
    // The Woods is east. In from the Woods side north of the long path, west
    // across the open ground well south of the camp, and out the south edge.
    // 75.0 m.
    woods: route([49.5, 12], [25, 20], [10, 25], [-5, 35], [-10, 49.5]),
  }),
  moor: Object.freeze({
    // The Woods is south. In from the Woods side east of the river, north up
    // the open moor near the spawn, and out the east edge towards the Gorge.
    // 75.7 m.
    woods: route([35, 49.5], [38, 20], [35, -5], [49.5, -20]),
    // The Pines is west. In from the Pines side north of the water, east over
    // the heath, then north-west and out the north edge, wide of the camp.
    // 78.1 m.
    pines: route([-49.5, -14], [-30, -10], [-12, -14], [-20, -30], [-30, -49.5]),
  }),
  pines: Object.freeze({
    // The River is south. In from the River side west of the camp (east of the
    // camp the south edge is the truce path and the lake's pocket), north up
    // the swamp's west side, round the bog and out the west edge. Never near
    // the truce path, the bridge or the island. 78.2 m.
    river: route([-46, 49.5], [-48.5, 30], [-48.5, 24], [-35, 24], [-28, 12], [-49.5, -1]),
    // The Moor is east. In from the Moor side north of the lake, west through
    // the pines, then north and out the north edge. 71.9 m.
    moor: route([49.5, -20], [25, -15], [8, -24], [0, -38], [0, -49.5]),
  }),
});

const routesOf = (areaId) => (
  typeof areaId === 'string' && Object.hasOwn(INTRUDER_ROUTES, areaId) ? INTRUDER_ROUTES[areaId] : null
);

export function routeLength(r) {
  let len = 0;
  for (let i = 0; i + 1 < r.length; i++) len += Math.hypot(r[i + 1].x - r[i].x, r[i + 1].z - r[i].z);
  return len;
}

// The point s metres along the route (clamped to its two ends) and the unit
// heading of the segment it is on.
export function routePoint(r, s) {
  let left = Math.max(0, s);
  for (let i = 0; i + 1 < r.length; i++) {
    const p = r[i], q = r[i + 1];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (len === 0) continue;
    const last = i + 2 === r.length;
    if (left <= len || last) {
      const f = Math.min(left, len) / len;
      return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f, dx: (q.x - p.x) / len, dz: (q.z - p.z) / len };
    }
    left -= len;
  }
  const p = r[r.length - 1];
  return { x: p.x, z: p.z, dx: 0, dz: 1 };
}

// Who visits this territory in the slot that holds t, or null.
export function visitAt(areaId, t) {
  const routes = routesOf(areaId);
  if (!routes || typeof t !== 'number' || !Number.isFinite(t)) return null;
  if (castFor(areaId).length === 0) return null;
  const k = Math.floor(t / INTRUDER_PERIOD);
  const h = seedFromCode(`${areaId}|intruder|${k}`);
  if (h % 4 === 0) return null;
  // A neighbour needs a cast and a route here; it needs no camp of its own.
  const neighbours = HOMES[areaId].neighbours.filter((n) => (
    isClanId(n) && clanCast(n).length > 0 && Object.hasOwn(routes, n)
  ));
  if (neighbours.length === 0) return null;
  const clan = neighbours[(h >>> 2) % neighbours.length];
  const member = clanCast(clan)[RAIDER_SLOTS[(h >>> 4) % RAIDER_SLOTS.length]];
  if (!member) return null;
  return { visit: k, clan, member };
}

// Where this slot's visitor is at t: on the map only while 0 <= s <= length.
export function intruderAt(areaId, t) {
  const v = visitAt(areaId, t);
  if (!v) return null;
  const r = INTRUDER_ROUTES[areaId][v.clan];
  const s = (t - v.visit * INTRUDER_PERIOD - ENTER_AT) * INTRUDER_SPEED;
  if (!(s >= 0 && s <= routeLength(r))) return null;
  const p = routePoint(r, s);
  return { visit: v.visit, clan: v.clan, member: v.member, x: p.x, z: p.z, dx: p.dx, dz: p.dz, s };
}

// ---------------------------------------------------------------------------
// The THREE half (Task 2).
// ---------------------------------------------------------------------------

const INTRUDER_SCALE = 0.85;
const PUFF_TIME = 0.6; // s: the reduced-motion flee's dust puff
const PUFF_COLOR = 0xd9ccb4;
// The contact-shadow radius walk.js gives the anchor (below), in metres. What
// contactshadows.follow measures for itself on a clan warrior's coat at scale
// 0.85 is 0.67-0.77 m, by breed and the yaw it happens to stand at; this is
// that range's middle, fixed so it never depends on which visit came first.
export const INTRUDER_DECAL_RADIUS = 0.7;

// The rival scamper's easing (rivalcats.js), inlined (ruling R6): this file's
// imports stay on their allow-list.
const smooth = (u) => u * u * (3 - 2 * u);

// The yaw that turns a cat (nose at -z) to look from (x, z) toward (tx, tz).
const yawToward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z) + Math.PI;

// An intruder is hostile only on land where you are at home, and never when
// it is of either kid's clan: never sibling against sibling.
export function isHostile(intruder, { clanHome, picks } = {}) {
  return clanHome === true && !!intruder && typeof intruder.clan === 'string'
    && Array.isArray(picks) && !picks.includes(intruder.clan);
}

// The inert stand-in for a walk with no intruders (the den, the old areas).
export const NO_INTRUDERS = Object.freeze({
  anchor: null,
  update() {},
  current: () => null,
  hold() {},
  release() {},
  dropHolder() {},
  holders: () => [],
  stage() {},
  setScars() {},
  measure() { return null; },
  flee() {},
  isFled: () => false,
  dispose() {},
});

function freeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
      if (m.map && !m.map.name?.startsWith('surface:')) m.map.dispose();
      m.dispose();
    }
  });
}

export function createIntruders(scene, areaId, {
  now = () => Date.now() / 1000,
  reducedMotion = false,
  showNames = false,
  hostile = () => false,
  onNotice = () => {},
  onBuild = () => {},
  // Fight moves and scars: the scars (scars.js render entries) a cast member
  // wears, by its cast id, applied when its mesh is built.
  scarsFor = () => [],
} = {}) {
  let cur = null;     // this visit's cat, or null
  let done = null;    // a visit that walked off its route: not built again
  let animT = 0;
  const puffs = [];
  // One empty group for the whole walk, standing where the visible intruder
  // stands and hidden when there is none (ruling R10). walk.js gives IT the
  // contact shadow, once: the decals have a fixed number of follower slots
  // and no way to let one go, so following each visit's cat would use one up
  // per visit.
  const anchor = new THREE.Group();
  anchor.name = 'intruder-anchor';
  anchor.visible = false;
  scene.add(anchor);

  function syncAnchor() {
    const showing = !!cur && cur.inScene;
    anchor.visible = showing;
    if (showing) anchor.position.copy(cur.group.position);
  }

  function build(at) {
    const { member } = at;
    const scars = scarsFor(member.id);
    const group = buildCat(member.breed, undefined, { simple: true, style: member.style, scars: Array.isArray(scars) ? scars : [] });
    group.scale.multiplyScalar(INTRUDER_SCALE);
    group.userData.intruder = true;
    const isHostileHere = hostile(at.clan) === true;
    let tag = null;
    if (showNames) {
      tag = makeNameTag(member.name, { cross: isHostileHere, sub: tagSubFor(member) });
      if (tag) {
        tag.scale.x /= INTRUDER_SCALE;
        tag.scale.y /= INTRUDER_SCALE;
        group.add(tag);
      }
    }
    const route = INTRUDER_ROUTES[areaId][at.clan];
    cur = {
      visit: at.visit,
      clan: at.clan,
      member,
      route,
      len: routeLength(route),
      start: at.visit * INTRUDER_PERIOD + ENTER_AT,
      s: at.s,
      state: 'walking', // 'walking' | 'catching' | 'held' | 'fleeing' | 'gone'
      holders: new Map(),
      face: null,
      // My own fight's staging (Task 4): a pose and a spot for the held mesh,
      // or null. Only ever set while a local holder holds it.
      stage: null,
      hostile: isHostileHere,
      noticed: false,
      fled: false,
      run: null,
      group,
      tag,
      inScene: true,
    };
    place();
    scene.add(group);
    onBuild(group);
  }

  function removeMesh() {
    if (!cur || !cur.inScene) return;
    scene.remove(cur.group);
    freeObject(cur.group);
    cur.inScene = false;
  }

  function end() {
    removeMesh();
    cur = null;
    syncAnchor();
  }

  function addPuff(x, z) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshBasicMaterial({ color: PUFF_COLOR, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    mesh.position.set(x, 0.3, z);
    scene.add(mesh);
    puffs.push({ mesh, age: 0 });
  }

  function tickPuffs(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age += dt;
      const u = Math.min(1, p.age / PUFF_TIME);
      p.mesh.scale.setScalar(1 + u);
      p.mesh.material.opacity = 0.7 * (1 - u);
      if (u >= 1) {
        scene.remove(p.mesh);
        freeObject(p.mesh);
        puffs.splice(i, 1);
      }
    }
  }

  // The mesh at cur.s, facing its way (or its holder when held). A held one
  // my fight has staged stands where the stage puts it instead, pitched and
  // rolled as staged (yaw outermost); anything else stands level. This is the
  // only place the group's rotation.x and rotation.z are written.
  function place() {
    const p = routePoint(cur.route, cur.s);
    const g = cur.group;
    const st = cur.state === 'held' ? cur.stage : null;
    if (st) g.position.set(st.x, st.y, st.z);
    else g.position.set(p.x, 0, p.z);
    g.rotation.order = 'YXZ';
    g.rotation.x = st ? st.pitch : 0;
    g.rotation.z = st ? st.roll : 0;
    if (cur.state === 'held' && cur.face) {
      g.rotation.y = yawToward(g.position.x, g.position.z, cur.face.x, cur.face.z);
    } else if (cur.state === 'fleeing' && cur.run && cur.run.to < cur.run.from) {
      g.rotation.y = Math.atan2(-p.dx, -p.dz) + Math.PI;
    } else {
      g.rotation.y = Math.atan2(p.dx, p.dz) + Math.PI;
    }
  }

  function snapshot() {
    if (!cur) return null;
    const p = routePoint(cur.route, cur.s);
    return {
      visit: cur.visit,
      clan: cur.clan,
      member: cur.member,
      pos: { x: p.x, z: p.z },
      state: cur.state === 'catching' ? 'walking' : cur.state,
    };
  }

  const isCurrent = (visit) => !!cur && cur.visit === visit;
  const heldByMe = () => [...cur.holders.values()].some((h) => h.local);

  function letGo() {
    if (!heldByMe()) cur.stage = null;
    if (cur.state === 'held' && cur.holders.size === 0) cur.state = 'catching';
  }

  return {
    update(dt, catPos) {
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      animT += step;
      tickPuffs(step);
      const t = now();
      if (typeof t !== 'number' || !Number.isFinite(t)) return;
      const slot = Math.floor(t / INTRUDER_PERIOD);
      // Ruling R9: a visit outlives its slot while it is held, fleeing, or
      // catching up after a release (walking on to its route's end). Only a
      // walking or gone one ends with its slot; the next visit is built only
      // once this one is over, so there is one mesh at a time.
      if (cur && cur.visit !== slot && (cur.state === 'walking' || cur.state === 'gone')) end();
      if (!cur) {
        if (done === slot) return;
        const at = intruderAt(areaId, t);
        if (!at) return;
        build(at);
      }
      const clockS = (t - cur.start) * INTRUDER_SPEED;
      // A remote holder that has said nothing for HOLD_MAX lets go; mine never.
      for (const [id, h] of cur.holders) {
        if (!h.local && t - h.since >= HOLD_MAX) cur.holders.delete(id);
      }
      letGo();
      let speed = 0;
      if (cur.state === 'walking') {
        cur.s = clockS;
        speed = INTRUDER_SPEED;
      } else if (cur.state === 'catching') {
        cur.s = Math.min(clockS, cur.s + CATCH_UP_SPEED * step);
        speed = CATCH_UP_SPEED;
        if (cur.s >= clockS) cur.state = 'walking';
      } else if (cur.state === 'fleeing') {
        const r = cur.run;
        r.el += step;
        const u = r.dur > 0 ? Math.min(1, r.el / r.dur) : 1;
        cur.s = r.from + (r.to - r.from) * smooth(u);
        speed = FLEE_SPEED;
        if (u >= 1) {
          cur.s = r.to;
          cur.state = 'gone';
          removeMesh();
        }
      }
      if ((cur.state === 'walking' || cur.state === 'catching') && cur.s > cur.len) {
        // Walked off the far end of its route: this visit is over.
        done = cur.visit;
        end();
        return;
      }
      if (!cur.inScene) { syncAnchor(); return; }
      place();
      syncAnchor();
      const g = cur.group;
      let pose = 'follow';
      if (cur.state === 'held') {
        pose = cur.stage ? cur.stage.pose : 'cross';
        speed = 0;
      } else if (cur.state !== 'fleeing' && cur.hostile && catPos
        && Math.hypot(catPos.x - g.position.x, catPos.z - g.position.z) < NOTICE_RANGE) {
        pose = 'cross';
        if (!cur.noticed) {
          cur.noticed = true;
          onNotice(snapshot());
        }
      }
      animateCat(g, pose, animT, speed, reducedMotion);
      if (cur.tag) {
        const range = cur.tag.userData?.revealRange ?? NAME_TAG_RANGE;
        cur.tag.visible = catPos ? Math.hypot(catPos.x - g.position.x, catPos.z - g.position.z) < range : false;
      }
    },
    // The walk's one contact-shadow follower (see above).
    anchor,
    current: snapshot,
    hold(visit, holderId, facePos, { local = false } = {}) {
      if (!isCurrent(visit) || cur.fled || cur.state === 'gone') return;
      // Ruling R11: while my own fight holds it, it keeps facing me; a
      // co-walker's hold never turns it away. With no local holder, the
      // newest holder's face is used.
      const mineHeld = heldByMe();
      cur.holders.set(String(holderId), { since: now(), local: local === true });
      const faces = local === true || !mineHeld;
      if (faces && facePos && Number.isFinite(facePos.x) && Number.isFinite(facePos.z)) cur.face = { x: facePos.x, z: facePos.z };
      cur.state = 'held';
      if (cur.inScene) place();
    },
    release(visit, holderId) {
      if (!isCurrent(visit) || cur.fled) return;
      cur.holders.delete(String(holderId));
      letGo();
    },
    holders(visit) {
      return isCurrent(visit) ? [...cur.holders.keys()] : [];
    },
    // A co-walker who left the room lets go of whatever it held (a crash or a
    // dropped connection would otherwise hold it up to HOLD_MAX).
    dropHolder(holderId) {
      if (!cur || cur.fled || !cur.holders.has(String(holderId))) return;
      cur.holders.delete(String(holderId));
      letGo();
    },
    // My fight's staging (Task 4): { pose, x, z, y, face?, pitch?, roll? }
    // puts the held mesh at that spot in that pose, facing `face` (my cat) or
    // else its holder, pitched and rolled (fight moves and scars, R20; junk
    // is 0); null puts it back on its route, level.
    // Ignored unless I hold it; dropped when my hold ends or it flees. The
    // shared snapshot (current().pos) stays on the route.
    stage(visit, st) {
      if (!isCurrent(visit) || cur.state !== 'held' || !heldByMe()) return;
      if (st === null) cur.stage = null;
      else if (st && typeof st.pose === 'string' && Number.isFinite(st.x) && Number.isFinite(st.z)) {
        const fin = (v) => (Number.isFinite(v) ? v : 0);
        cur.stage = { pose: st.pose, x: st.x, z: st.z, y: fin(st.y), pitch: fin(st.pitch), roll: fin(st.roll) };
        if (st.face && Number.isFinite(st.face.x) && Number.isFinite(st.face.z)) cur.face = { x: st.face.x, z: st.face.z };
      } else return;
      if (cur.inScene) { place(); syncAnchor(); }
    },
    // Fight moves and scars: the visitor's scars changed (a fight it lost).
    setScars(visit, scars) {
      if (!isCurrent(visit) || !cur.inScene) return;
      setCatScars(cur.group, Array.isArray(scars) ? scars : []);
    },
    // The visitor's fight dims (src/cat/model.js catDims: top, backY,
    // pinnedBackY, hindZ, pivotY), for the fight's actions; null for any
    // other visit. It poses the mesh to measure and puts it back where it
    // stood, as it stood (the next update poses it again).
    measure(visit) {
      if (!isCurrent(visit) || !cur.inScene) return null;
      const g = cur.group;
      const pos = g.position.clone();
      const rot = g.rotation.clone();
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      const d = catDims(g);
      g.position.copy(pos);
      g.rotation.copy(rot);
      return d;
    },
    flee(visit) {
      if (!isCurrent(visit) || cur.fled || cur.state === 'gone') return;
      cur.holders.clear();
      cur.stage = null;
      cur.fled = true;
      const from = Math.min(Math.max(cur.s, 0), cur.len);
      const to = from < cur.len - from ? 0 : cur.len;
      if (reducedMotion) {
        const p = routePoint(cur.route, from);
        addPuff(p.x, p.z);
        cur.s = to;
        cur.state = 'gone';
        removeMesh();
        syncAnchor();
        return;
      }
      cur.s = from;
      cur.run = { from, to, dur: Math.abs(to - from) / FLEE_SPEED, el: 0 };
      cur.state = 'fleeing';
    },
    isFled(visit) {
      return isCurrent(visit) && cur.fled;
    },
    dispose() {
      end();
      scene.remove(anchor);
      for (const p of puffs) {
        scene.remove(p.mesh);
        freeObject(p.mesh);
      }
      puffs.length = 0;
    },
  };
}
