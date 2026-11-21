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

export function createLevelDrawing(scene, { levels, links, start }) {
  const details = [];
  const simples = [];
  const walk = (o) => {
    const u = o.userData;
    if (u && u.houseDetail) details.push(o);
    else if (u && u.houseSimple) simples.push(o);
    const kids = o.children;
    if (kids) for (let i = 0; i < kids.length; i++) walk(kids[i]);
  };
  for (const c of scene.children) walk(c);

  let current = null;
  let full = null;
  const apply = (id) => {
    current = id;
    full = fullLevels(id, links);
    for (const o of details) o.visible = full.has(o.userData.houseLevel);
    for (const o of simples) o.visible = !full.has(o.userData.houseSimple);
  };
  apply(start);

  return {
    update(pawsY) {
      const id = nextLevel(current, pawsY, levels);
      if (id !== current) apply(id);
    },
    // The start of a walk (final fix F1): the level whose floor is nearest her paws, at once,
    // with no 0.3 m hold, so a walk picked up in the attic opens on the attic drawn in full.
    settle(pawsY) {
      let best = levels[0];
      for (const l of levels) if (Math.abs(pawsY - l.y) < Math.abs(pawsY - best.y)) best = l;
      if (best.id !== current) apply(best.id);
    },
    get current() { return current; },
    get full() { return full; },
  };
}
