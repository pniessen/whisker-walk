// Border posts: where each map's wooden post stands, and nothing else. Pure
// data and two lookups (no THREE, no DOM, no imports), so the world code that
// draws a post, the walk that prompts at it and the tests that prove it all
// read the same table.
//
// Where a post goes (every value below was probed on the built maps and is
// re-proved by test/borderposts.test.js):
//  R1. One post wherever a path or river leaves the map through an edge that
//      faces a named place; it names the place directly over that edge. The
//      two exceptions are the footpath's pair (R2), which name the far end of
//      the long path through the bottom of the Woods.
//  R2. The town gets three posts: its roads' west and north ends, and the new
//      footpath's west end.
//  R3. The Moor has a post on its east edge for the Gorge, which is not built.
//  R4. The Pines-Moor trail has a post on each side.
//  R5. A post stands 2.5-3.5 m inside the nearest bounds edge; 2 m or more off
//      every path, trail and footpath centreline (3 m off the town's 5 m
//      roads); 1.2 m or more from every other collider; 2 m or more outside
//      every water footprint; 3 m or more from every point of interest,
//      collectible, scenic and golden mouse and 2 m from every perch; beyond
//      its camp disc by 3 m; POST_REACH + 2 m from the spawn; and reachable on
//      foot from the spawn without wading.
//  R6. Where both sides are built territories sharing a frame, a post and its
//      twin are 5 m apart across the border and within 1 m along it.
//  Clear of the intruders' walking routes by 0.8 m or more.

export const POST_R = 0.2;
export const POST_REACH = 1.6; // m, cat centre to post centre

// The town's footpath west to the river map: [x1, z1, x2, z2], 2 m wide. It
// starts on the main road's west kerb and ends on the west bound.
export const TOWN_FOOTPATH = [[-2.5, 42, -55, 42]];
export const FOOTPATH_W = 2;

const post = (id, x, z, faces, to) => ({ id, x, z, faces, to });

export const BORDER_POSTS = {
  neighborhood: [
    post('town-woods', -52, 3.6, 'west', 'woods'),
    post('town-moor', 3.6, -52, 'north', 'moor'),
    post('town-river', -52, 44.6, 'west', 'river'),
  ],
  woods: [
    post('woods-town-short', 47.5, 14.5, 'east', 'neighborhood'),
    post('woods-town-long', 47.5, 37.6, 'east', 'neighborhood'),
    // Off the plan's measured spot (z 37.6 -> 42.6, south of the path) to clear the River's race start pad by 3 m; its twin river-woods-long moves with it.
    post('woods-river-long', -47.5, 42.6, 'west', 'river'),
    // Off the plan's measured spot (z 5.5 -> 7) to clear the intruders' routes by >= 0.8 m; its twin river-woods-pond moves with it.
    post('woods-river-pond', -47.5, 7, 'west', 'river'),
    post('woods-moor-path', 43.4, -47.5, 'north', 'moor'),
    post('woods-moor-river', 25.5, -47.5, 'north', 'moor'),
  ],
  river: [
    // Twin of woods-river-long: off the plan's measured spot (z 37.6 -> 42.6, south of the path) to clear the race start pad by 3 m or more.
    post('river-woods-long', 47.5, 42.6, 'east', 'woods'),
    // Moved south (z 42.6 -> 44.8) to make room for river-woods-long; it has no twin.
    post('river-town-long', 47.5, 44.8, 'east', 'neighborhood'),
    // Twin of woods-river-pond: off the plan's measured spot to clear the intruders' routes by >= 0.8 m.
    post('river-woods-pond', 47.5, 7, 'east', 'woods'),
    post('river-pines-path', -23, -47.5, 'north', 'pines'),
  ],
  moor: [
    post('moor-woods-path', 43.4, 47.5, 'south', 'woods'),
    post('moor-woods-river', 25.5, 47.5, 'south', 'woods'),
    post('moor-gorge', 47.5, -14, 'east', 'gorge'),
    // Off the plan's measured spot (z -14.5 -> -15.5) to clear the intruders' routes by >= 0.8 m; its twin pines-moor-trail moves with it.
    post('moor-pines-trail', -47.5, -15.5, 'west', 'pines'),
  ],
  pines: [
    post('pines-river-path', -23, 47.5, 'south', 'river'),
    // Twin of moor-pines-trail: off the plan's measured spot to clear the intruders' routes by >= 0.8 m.
    post('pines-moor-trail', 47.5, -15.5, 'east', 'moor'),
  ],
};

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
}
deepFreeze(BORDER_POSTS);
deepFreeze(TOWN_FOOTPATH);

const NONE = Object.freeze([]);

// The area's posts (own keys only), or [] for any other id.
export function postsFor(areaId) {
  return typeof areaId === 'string' && Object.hasOwn(BORDER_POSTS, areaId) ? BORDER_POSTS[areaId] : NONE;
}

// The nearest post within `reach` of (x, z), or null.
export function postNear(areaId, x, z, reach = POST_REACH) {
  if (![x, z, reach].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of postsFor(areaId)) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d <= reach && d < bestD) { best = p; bestD = d; }
  }
  return best;
}
