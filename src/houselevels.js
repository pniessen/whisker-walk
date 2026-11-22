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
//     `near` of the way in (it stays on until `leave`, so the line never flickers);
//   - from an old level the only join is the parlour's east doorway: the wing zone beyond it is
//     drawn while she is near it, and then only her own level (not the levels its stairs join),
//     so the old house's worst spot never grows;
//   - an old level drawn only because the wing is near (the parlour at the new door) keeps just the
//     rooms the join names (`keep`: the parlour; none, out on the lawn) in full: its other rooms' furniture
//     (details with a houseRoom) is hidden and a stand-in stands for them (the level's far one, houseFar,
//     for the rest of the house with the parlour kept, its ordinary one for all);
//   - out on the lawn (no room, no stair) a wing room within OUT_NEAR of her is drawn in full too;
//   - everything else is its stand-in.
export function createLevelDrawing(scene, { levels, links, start, wing = null }) {
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
  // which joins of zone `id` are near (a on-state stays until `leave`)
  function nearJoins(id, x, z) {
    let changed = false;
    const out = wing.outdoors ? wing.outdoors(x, z) : false;
    for (const j of wing.joins) {
      // an outside join counts only while she is out on the lawn
      if ((j.a !== id && j.b !== id) || (j.outside && !out)) { if (on.delete(j.id)) changed = true; continue; }
      const d = distToJoin(j, x, z);
      if (on.has(j.id) ? d > (j.leave ?? wing.leave) : d <= (j.near ?? wing.near)) {
        if (on.has(j.id)) on.delete(j.id); else on.add(j.id);
        changed = true;
      }
    }
    return changed;
  }
  const nearest = (pawsY) => {
    let best = levels[0];
    for (const l of levels) if (Math.abs(pawsY - l.y) < Math.abs(pawsY - best.y)) best = l;
    return best.id;
  };
  const hasPos = (x, z) => wing && typeof x === 'number' && typeof z === 'number';
  apply(start);

  return {
    update(pawsY, x, z) {
      if (!hasPos(x, z)) {
        const id = nextLevel(current, pawsY, levels);
        if (id !== current) apply(id);
        return;
      }
      const wz = wing.zoneAt(x, z);
      // out of the wing she is on the level her paws are on (they are at a floor's height)
      const id = wz ?? (wing.isWing(current) ? nearest(pawsY) : nextLevel(current, pawsY, levels));
      const changed = nearJoins(id, x, z);
      if (id !== current || changed) apply(id);
    },
    // The start of a walk (final fix F1): the level whose floor is nearest her paws, at once,
    // with no 0.3 m hold, so a walk picked up in the attic opens on the attic drawn in full.
    settle(pawsY, x, z) {
      const wz = hasPos(x, z) ? wing.zoneAt(x, z) : null;
      const id = wz ?? nearest(pawsY);
      const changed = hasPos(x, z) ? nearJoins(id, x, z) : false;
      if (id !== current || changed) apply(id);
    },
    get current() { return current; },
    get full() { return full; },
    get near() { return on.size ? new Set(on) : EMPTY; },
  };
}
