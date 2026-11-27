// Which levels of the Old House are drawn in full. Her level and every level a stair joins to it get
// their furniture; the rest show one plain stand-in. Always on (not behind ?grow=1). No THREE here:
// it only reads scene.children / userData and writes `visible`.

export const LEVEL_SWITCH = 0.3;

// The level whose floor is nearest her paws, changing only 0.3 m past a stair's midpoint (both ways).
export function nextLevel(curId, pawsY, levels) {
  let cur = null;
  for (const l of levels) if (l.id === curId) cur = l;
  if (!cur) cur = levels[0];
  const curD = Math.abs(pawsY - cur.y);
  let best = cur;
  let bestD = curD;
  for (const l of levels) {
    if (l === cur) continue;
    const d = Math.abs(pawsY - l.y);
    if (d + LEVEL_SWITCH < curD && d < bestD) {
      best = l;
      bestD = d;
    }
  }
  return best.id;
}

// The level and every level a stair joins it to.
export function fullLevels(id, links) {
  const set = new Set([id]);
  for (const [a, b] of links) {
    if (a === id) set.add(b);
    else if (b === id) set.add(a);
  }
  return set;
}

const EMPTY = new Set();
const SWITCH = 1; // m: a nearer join takes over from the one on only when it is this much nearer

// Metres from (x, z) to the rectangle centred (jx, jz), half-extents hx, hz (0 inside it).
function distToJoin(j, x, z) {
  const dx = Math.max(Math.abs(x - j.x) - j.hx, 0);
  const dz = Math.max(Math.abs(z - j.z) - j.hz, 0);
  return Math.hypot(dx, dz);
}

// The east wing's zones (Old House wing, houseplan.js wingZoneAt, WING_JOINS). `wing` is
// { zoneAt(x, z): the wing zone she stands in or null, isWing(id), joins: [{ id, a, b, x, z, hx, hz }],
// near, leave } and is optional: without it (or without a position) the drawing is the old one,
// by her paws' height alone, byte for byte.
//   - a wing zone she is in is drawn in full, and so is a zone joined to it while she is within
//     `near` of the way in (it stays on until `leave`, so the line never flickers); the camera counts
//     as her here, so a room the camera hangs in (the cut-away, Farther) is drawn, never a tray under it;
//   - from an old level the only join is the parlour's east doorway: the wing zone beyond it is
//     drawn while she is near it, and then only her own level (not the levels its stairs join),
//     so the old house's worst spot never grows;
//   - an old level drawn only because the wing is near (the parlour at the new door) keeps just the
//     rooms the join names (`keep`: the parlour; none, out on the lawn) in full: its other rooms' furniture
//     (details with a houseRoom) is hidden and a stand-in stands for them (the level's far one, houseFar,
//     for the rest of the house with the parlour kept, its ordinary one for all);
//   - out on the lawn (no room, no stair) a wing room within OUT_NEAR of her is drawn in full too;
//   - a join marked `secret` (the wonder room's stair) counts only while `joinOpen(join)` says its door stands open;
//   - everything else is its stand-in.
export function createLevelDrawing(scene, { levels, links, start, wing = null, joinOpen = null }) {
  const details = [];
  const simples = [];
  const fars = [];
  const walk = (o) => {
    const u = o.userData;
    if (u && u.houseDetail) details.push(o);
    else if (u && u.houseSimple) simples.push(o);
    else if (u && u.houseFar) fars.push(o);
    const kids = o.children;
    if (kids) for (let i = 0; i < kids.length; i++) walk(kids[i]);
  };
  for (const c of scene.children) walk(c);

  let current = null;
  let full = null;
  let nearKey = '';
  const on = new Set(); // join ids that are near, with hysteresis
  const partial = new Map(); // old level id -> the rooms kept in full (the join's keep), while a wing join is near
  let extraId = null; // couch play's second cat: the zone it stands in is drawn too
  const apply = (id) => {
    current = id;
    full = wing && wing.isWing(id) ? new Set([id]) : fullLevels(id, links);
    if (wing && on.size) {
      if (!wing.isWing(id)) full = new Set([id]); // near the wing from an old level: her level alone
      for (const j of wing.joins) {
        if (!on.has(j.id)) continue;
        if (j.a === id) full.add(j.b);
        else if (j.b === id) full.add(j.a);
      }
    }
    if (extraId && !full.has(extraId)) full = new Set([id, extraId]); // the two cats' own zones, no neighbours: two plain cats' worst pair is 69,648 (ground and the wonder room), never the 70,022 of all four levels
    nearKey = [...on].join(',');
    // a level drawn only for the wing at its door keeps just the rooms the join names
    partial.clear();
    if (wing) {
      for (const j of wing.joins) {
        if (!on.has(j.id) || !j.keep || !full.has(j.a)) continue;
        partial.set(j.a, [...(partial.get(j.a) ?? []), ...j.keep]);
      }
    }
    for (const o of details) {
      const u = o.userData;
      const keep = partial.get(u.houseLevel);
      const room = u.houseRoom ?? u.houseRoomOf;
      o.visible = full.has(u.houseLevel) && !(keep && room && !keep.includes(room));
    }
    // a level kept in full for no room at all (out on the lawn by the wing) shows its ordinary stand-in
    for (const o of simples) o.visible = !full.has(o.userData.houseSimple) || partial.get(o.userData.houseSimple)?.length === 0;
    for (const o of fars) o.visible = (partial.get(o.userData.houseFar)?.length ?? 0) > 0;
  };
  // The one join of zone `id` that is near: the nearest within `near` (or, for the one already on, within
  // `leave`), and the one already on keeps it until another is SWITCH nearer. At most one zone beside hers
  // is drawn (the budget: her room, the nearest room, the old parlour at most). Returns whether it changed.
  function nearJoins(id, x, z, cx, cz) {
    const out = wing.outdoors ? wing.outdoors(x, z) : false;
    let best = null;
    let bestD = Infinity;
    let cur = null;
    let curD = Infinity;
    for (const j of wing.joins) {
      // an outside join counts only while she is out on the lawn
      if ((j.a !== id && j.b !== id) || (j.outside && !out)) continue;
      if (j.secret && !(joinOpen && joinOpen(j))) continue; // the secret stair is no way in until its wardrobe stands open
      const d = hasCam(cx, cz) ? Math.min(distToJoin(j, x, z), distToJoin(j, cx, cz)) : distToJoin(j, x, z);
      const was = on.has(j.id);
      if (d > (was ? (j.leave ?? wing.leave) : (j.near ?? wing.near))) continue;
      if (was && d < curD) { cur = j; curD = d; }
      if (d < bestD) { best = j; bestD = d; }
    }
    const pick = cur && (!best || curD <= bestD + SWITCH) ? cur : best;
    const was = on.size ? [...on][0] : null;
    const now = pick ? pick.id : null;
    if (was === now && on.size <= 1) return false;
    on.clear();
    if (now) on.add(now);
    return true;
  }
  const nearest = (pawsY) => {
    let best = levels[0];
    for (const l of levels) if (Math.abs(pawsY - l.y) < Math.abs(pawsY - best.y)) best = l;
    return best.id;
  };
  const hasPos = (x, z) => wing && typeof x === 'number' && typeof z === 'number';
  const hasCam = (cx, cz) => typeof cx === 'number' && typeof cz === 'number';
  // The second cat's level (couch play): { y: its floor, x, z } or null. True when the set it adds changed.
  function other(two) {
    const id = two ? (hasPos(two.x, two.z) ? wing.zoneAt(two.x, two.z) : null) ?? nearest(two.y) : null;
    if (id === extraId) return false;
    extraId = id;
    return true;
  }
  apply(start);

  return {
    update(pawsY, x, z, cx, cz, two = null) {
      const moved = other(two);
      if (!hasPos(x, z)) {
        const id = nextLevel(current, pawsY, levels);
        if (id !== current || moved) apply(id);
        return;
      }
      const wz = wing.zoneAt(x, z);
      // out of the wing she is on the level her paws are on (they are at a floor's height)
      const id = wz ?? (wing.isWing(current) ? nearest(pawsY) : nextLevel(current, pawsY, levels));
      const changed = nearJoins(id, x, z, cx, cz);
      if (id !== current || changed || moved) apply(id);
    },
    // The start of a walk (final fix F1): the level whose floor is nearest her paws, at once,
    // with no 0.3 m hold, so a walk picked up in the attic opens on the attic drawn in full.
    settle(pawsY, x, z, cx, cz, two = null) {
      const moved = other(two);
      const wz = hasPos(x, z) ? wing.zoneAt(x, z) : null;
      const id = wz ?? nearest(pawsY);
      const changed = hasPos(x, z) ? nearJoins(id, x, z, cx, cz) : false;
      if (id !== current || changed || moved) apply(id);
    },
    get current() { return current; },
    get full() { return full; },
    get near() { return on.size ? new Set(on) : EMPTY; },
  };
}
