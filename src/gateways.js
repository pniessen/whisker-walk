// Gateways: where each place's gate ends stand, and nothing else. Pure data and
// lookups (no THREE, no DOM, no imports), so the world code that draws a gate,
// the walk that asks at it and the tests that prove it all read one table.
//
// A map road (GATEWAYS in worldmap.js) has two ends, one in each place. Each
// end is a row of GATEWAY_ENDS:
//   id, gateway   this end's name, and the map road it belongs to
//   x, z, faces   where it stands, and the way the cat walks through it
//   to, twin      the place beyond, and the id of the end that place has
//   look          how it is drawn (GATE_LOOKS); 'none' when the area draws it
//   placement     'edge' (a gate on the area's edge) or 'inside' (a door or a
//                 climb within the area; needs an explicit `arrive`). A place
//                 fenced short of its bounds (the Fair's and the Farm's white
//                 front fences, 5 m in) has its edge at that fence: an 'edge'
//                 gate there is set into the fence (cutForGates below).
//   lane          optional [x1, z1, x2, z2] path joining the end to the area's walks
//   laneLook      how the lane is drawn (LANE_LOOKS): 'gravel' (default; the
//                 Park's lanes) or 'paving' (the town's path to the Market's
//                 signpost: the pavement's own slabs, carried round the
//                 corner from the street, world/gateway.js)
//   arrive        where a cat coming in through this end lands: { x, z, yaw }.
//                 Without one she lands ARRIVE_IN m inside the end, facing in.
//   wings         optional [hinge side, latch side]: metres of railing running
//                 on along the edge line from each post, so the gate stands
//                 in something (world/gateway.js draws them, solid to her cat).
//                 A 'promenade' look only: it is that look's railing, run on.
//   sign          optional, default false: true hangs a painted board with
//                 the place's name and an arrow on the latch post, facing
//                 back into the area (world/gateway.js; the words come from
//                 the phrase 'gate.sign'). Only town-roofs and town-market
//                 ask for one.
//
// A door or a climb (the Old House's front door, the Rooftops' fire escape) is
// a row with placement 'inside', an explicit `arrive` and usually look 'none'
// (the area draws its own door). The Rooftops' back-alley door is the
// exception: the 'alleydoor' look draws it, a door in a brick frame. A row
// appears as a live gate only once its place has a catalog row (liveEndsFor),
// so a place not built yet has no gate. The town and the Rooftops are joined
// by the pair town-roofs (a signpost at the town's north street end) and
// roofs-town (that door, in the alley's wall; Rooftops step 4). The town and
// the Market Square are joined by the pair town-market (a signpost at the
// town's south-east street end) and market-town (a signpost in the gap the
// square's south row of shop fronts leaves behind its spawn, market.js
// GATEWAY_GAP; 'inside', as an edge end there would stand on the spawn; Market
// step 4). The town and the Old House are joined by the pair town-house (the
// shut door of the old house's front against the town's west hedge, which the
// town draws for it, world/oldhousefront.js) and house-town (just inside the
// hall's front door, whose leaves swing open as she comes, houselife.js); both
// 'inside' and look 'none' (Old House step 4).

export const GATE_REACH = 1.6; // m, cat centre to gate centre
// m: nearer than this to a gate she can go through or open, the place beyond
// starts downloading (once per gate per walk), so a yes rarely waits for it.
export const GATE_PREFETCH_REACH = 12;
export const GATE_HALF = 1.4; // m, centre to each gate post along the edge
export const GATE_POST_R = 0.15;
export const ARRIVE_IN = GATE_REACH + 2;
// 'stonering', 'archway', 'hollow' and 'cleft' are the teleport gates' looks (src/teleport.js, src/world/telegate.js).
export const GATE_LOOKS = Object.freeze(['signpost', 'fairgate', 'farmgate', 'promenade', 'alleydoor', 'none', 'stonering', 'archway', 'hollow', 'cleft']);
export const PLACEMENTS = Object.freeze(['edge', 'inside']);
export const LANE_LOOKS = Object.freeze(['gravel', 'paving']);
// The cat's rotation.y facing into the area (rotation 0 faces -z).
export const INWARD_YAW = Object.freeze({ north: Math.PI, south: 0, east: Math.PI / 2, west: -Math.PI / 2 });

// Copied from borderposts.js to keep this file import-free.
const FACINGS = ['north', 'south', 'east', 'west'];
// Unit step through the gate, per facing, as [dx, dz].
const THROUGH = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

// Any other key a row names is kept as given: a teleport gate's own fields (kind, suit, wake, edition, needWalks:
// src/teleport.js teleRow, which defaults and checks them), so no map row gained a key.
export function gatewayEnd({ id, gateway, x, z, faces, to, twin, look, placement = 'edge', lane = null, laneLook = 'gravel', arrive = null, wings = null, sign = false, ...more }) {
  if (!FACINGS.includes(faces)) throw new Error(`gateway end ${id}: faces "${faces}" is not one of ${FACINGS.join(', ')}`);
  if (!GATE_LOOKS.includes(look)) throw new Error(`gateway end ${id}: look "${look}" is not one of ${GATE_LOOKS.join(', ')}`);
  if (!PLACEMENTS.includes(placement)) throw new Error(`gateway end ${id}: placement "${placement}" is not one of ${PLACEMENTS.join(', ')}`);
  if (!LANE_LOOKS.includes(laneLook)) throw new Error(`gateway end ${id}: laneLook "${laneLook}" is not one of ${LANE_LOOKS.join(', ')}`);
  if (placement === 'inside' && !arrive) throw new Error(`gateway end ${id}: placement "inside" needs an arrive { x, z, yaw }`);
  if (wings && (look !== 'promenade' || wings.length !== 2 || !wings.every((w) => Number.isFinite(w) && w >= 0))) {
    throw new Error(`gateway end ${id}: wings must be [hinge side, latch side] metres on a 'promenade' look`);
  }
  return Object.freeze({
    id, gateway, x, z, faces, to, twin, look, placement,
    lane: lane ? Object.freeze([...lane]) : null,
    laneLook,
    arrive: arrive ? Object.freeze({ ...arrive }) : null,
    wings: wings ? Object.freeze([...wings]) : null,
    sign: sign === true,
    ...more,
  });
}
const end = gatewayEnd;

export const GATEWAY_ENDS = Object.freeze({
  neighborhood: Object.freeze([
    end({ id: 'town-park', gateway: 'town-park', x: 52, z: 0, faces: 'east', to: 'park', twin: 'park-town', look: 'signpost' }),
    end({ id: 'town-docks', gateway: 'town-docks', x: 0, z: 52, faces: 'south', to: 'docks', twin: 'docks-town', look: 'signpost' }),
    end({ id: 'town-roofs', gateway: 'town-roofs', x: 0, z: -52, faces: 'north', to: 'roofs', twin: 'roofs-town', look: 'signpost', sign: true }),
    // Its path (the owner, 2026-11-21: so a child sees where to go): the
    // east pavement's slabs carried on round the corner where the street
    // runs out, from the pavement's end (x 2.6 to 3.8 at z 50) east along the
    // lawn to just past the signpost. 1.8 m wide (six of the pavement's 30 cm
    // slabs), so it runs from z 50, butting the pavement's end, to z 51.8,
    // stopping short of the gate posts on z 52.
    end({ id: 'town-market', gateway: 'town-market', x: 30, z: 52, faces: 'south', to: 'market', twin: 'market-town', look: 'signpost', sign: true,
      lane: [2.6, 50.9, 31.7, 50.9], laneLook: 'paving' }),
    // 0.45 m in front of the old house's door (oldhousefront.js OLD_HOUSE_FRONT.door);
    // she lands 3.65 m out on the lawn, facing east, the house behind her.
    end({ id: 'town-house', gateway: 'town-house', x: -43.55, z: 31, faces: 'west', to: 'house', twin: 'house-town', look: 'none', placement: 'inside', arrive: { x: -39.9, z: 31, yaw: -Math.PI / 2 } }),
  ]),
  park: Object.freeze([
    end({ id: 'park-town', gateway: 'town-park', x: 0, z: 49, faces: 'south', to: 'neighborhood', twin: 'town-park', look: 'signpost' }),
    end({ id: 'park-fair', gateway: 'park-fair', x: 0, z: -47, faces: 'north', to: 'fair', twin: 'fair-park', look: 'fairgate', lane: [4, -25.2, 0, -47] }),
    end({ id: 'park-farm', gateway: 'park-farm', x: 42, z: 10, faces: 'east', to: 'farm', twin: 'farm-park', look: 'farmgate', lane: [16, 10, 42, 10] }),
  ]),
  fair: Object.freeze([
    // Set into the front picket fence (z 45, fair.js cuts it with cutForGates).
    end({ id: 'fair-park', gateway: 'park-fair', x: 8, z: 45, faces: 'south', to: 'park', twin: 'park-fair', look: 'signpost' }),
  ]),
  farm: Object.freeze([
    // Set into the front picket fence (z 45, farm.js cuts it with cutForGates).
    end({ id: 'farm-park', gateway: 'park-farm', x: -8, z: 45, faces: 'south', to: 'park', twin: 'park-farm', look: 'farmgate' }),
  ]),
  docks: Object.freeze([
    end({ id: 'docks-town', gateway: 'town-docks', x: -10, z: -37, faces: 'north', to: 'neighborhood', twin: 'town-docks', look: 'signpost' }),
    // Its railing runs on from the hinge post (z -21.4) to the bounds (z -40),
    // and from the latch post (z -18.6) across the south quay to the canal
    // (z -3.5) and on over the band every cat wades in (1.2 m, to z -2.3) to
    // a last post in the water at z -1.9 (ruling R20): nobody walks or wades
    // round it, so the gate is the way through.
    end({ id: 'docks-seaside', gateway: 'docks-seaside', x: 35, z: -20, faces: 'east', to: 'seaside', twin: 'seaside-docks', look: 'promenade', wings: [18.6, 16.7] }),
  ]),
  seaside: Object.freeze([
    end({ id: 'seaside-docks', gateway: 'docks-seaside', x: 10, z: 45, faces: 'south', to: 'docks', twin: 'docks-seaside', look: 'promenade' }),
    // On the open north-east sand, 2.5 m inside the north bounds (z -34) and clear of the lamp at
    // (20, -30): the bluff's colliders stand at z -37. A signpost with its painted name board.
    end({ id: 'seaside-lighthouse', gateway: 'seaside-lighthouse', x: 12, z: -31.5, faces: 'north', to: 'lighthouse', twin: 'lighthouse-seaside', look: 'signpost', sign: true }),
  ]),
  lighthouse: Object.freeze([
    // On the cove's south edge (bounds z 44), facing south; she lands 3.65 m in at (14, 37.4), facing north,
    // the tower ahead of her as at the spawn (14, 36).
    end({ id: 'lighthouse-seaside', gateway: 'seaside-lighthouse', x: 14, z: 41, faces: 'south', to: 'seaside', twin: 'seaside-lighthouse', look: 'signpost' }),
  ]),
  roofs: Object.freeze([
    // A green door in the back alley's brick wall (roofs.js draws it at
    // ROOFS_BOUNDS.maxZ, z 46): its dark doorway's back meets the wall face,
    // so the wall needs no hole. She lands in the alley facing north, 3.65 m
    // in front of it (GATE_REACH + 2 clear of it, as every arrival is).
    end({ id: 'roofs-town', gateway: 'town-roofs', x: 14, z: 45.55, faces: 'south', to: 'neighborhood', twin: 'town-roofs', look: 'alleydoor', placement: 'inside', arrive: { x: 14, z: 41.9, yaw: 1.0 } }),
  ]),
  market: Object.freeze([
    // In the 3.2 m gap of the south row of shop fronts (market.js GATEWAY_GAP,
    // z 23.8), just past the cobbles' edge (z 23): its posts at x +/-1.4 stand
    // inside the gap. She lands on the cobbles facing north into the square,
    // 3.7 m in front of it (the spawn's view, with the gate behind her).
    end({ id: 'market-town', gateway: 'town-market', x: 0, z: 23.6, faces: 'south', to: 'neighborhood', twin: 'town-market', look: 'signpost', placement: 'inside', arrive: { x: 0, z: 19.9, yaw: 0 } }),
  ]),
  house: Object.freeze([
    // Just inside the hall's front door (houseplan.js HOUSE_FRONT_DOOR, z 12); she
    // lands 3.65 m in, facing north into the hall.
    end({ id: 'house-town', gateway: 'town-house', x: 0, z: 11.6, faces: 'south', to: 'neighborhood', twin: 'town-house', look: 'none', placement: 'inside', arrive: { x: 0, z: 7.95, yaw: 0 } }),
  ]),
});

export function endsFor(areaId, table = GATEWAY_ENDS) {
  return typeof areaId === 'string' && own(table, areaId) ? table[areaId] : [];
}

export function endById(id, table = GATEWAY_ENDS) {
  for (const areaId of Object.keys(table)) {
    for (const e of table[areaId]) if (e.id === id) return { areaId, end: e };
  }
  return null;
}

export function liveEndsFor(areaId, catalog, table = GATEWAY_ENDS) {
  const areas = catalog && catalog.areas;
  return endsFor(areaId, table).filter((e) => own(areas, e.to));
}

export function gatewayNear(areaId, x, z, catalog, { reach = GATE_REACH, table = GATEWAY_ENDS } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best = null;
  let bestD = Infinity;
  for (const e of liveEndsFor(areaId, catalog, table)) {
    const d = Math.hypot(e.x - x, e.z - z);
    if (d <= reach && d < bestD) { best = e; bestD = d; }
  }
  return best;
}

export function arrivalFor(viaId, table = GATEWAY_ENDS) {
  const via = endById(viaId, table);
  if (!via) return null;
  const hit = endById(via.end.twin, table);
  if (!hit) return null;
  const { areaId, end: twin } = hit;
  if (twin.arrive) return { areaId, x: twin.arrive.x, z: twin.arrive.z, yaw: twin.arrive.yaw };
  return { areaId, ...inwardOf(twin) };
}

// { x, z, yaw }: ARRIVE_IN m inside something standing at (x, z) on an edge
// it faces out of, facing in. A gate end, and a border post (Task 10).
export function inwardOf({ x, z, faces }) {
  const [dx, dz] = THROUGH[faces];
  return { x: x - dx * ARRIVE_IN, z: z - dz * ARRIVE_IN, yaw: INWARD_YAW[faces] };
}

// m, centre to centre: how far the fence's last post stands beyond a gate's
// post when a gate is set into a fence (the two posts all but touch).
export const GATE_FENCE_GAP = 0.25;

// A place's fence runs with its gates cut out. A run is { a: [x, z], b: [x, z],
// ...anything else } straight along x or along z; an end standing on its line
// with its edge along it (and its centre between the run's ends) takes
// GATE_HALF + GATE_FENCE_GAP either side of its centre out of the run, so the
// fence's last post stands just beside each gate post and nothing of the fence
// is left in the opening. Every other run, and every other key, comes back as
// it was. Pure: the Fair's and the Farm's builders call it with the `gateEnds`
// walk.js hands them, the very ends it then draws (Clan Edition only), so a
// gate set into a fence and the gap in that fence can never drift apart, and a
// Legacy walk keeps its fence whole.
export function cutForGates(runs, ends) {
  const out = [];
  const cut = GATE_HALF + GATE_FENCE_GAP;
  for (const run of runs) {
    const [ax, az] = run.a;
    const [bx, bz] = run.b;
    const alongX = az === bz;
    if (!alongX && ax !== bx) { out.push(run); continue; }
    const line = alongX ? az : ax;
    const u0 = alongX ? ax : az;
    const u1 = alongX ? bx : bz;
    const lo = Math.min(u0, u1);
    const hi = Math.max(u0, u1);
    const holes = ends
      .filter((e) => (alongX ? e.faces === 'north' || e.faces === 'south' : e.faces === 'east' || e.faces === 'west'))
      .filter((e) => Math.abs((alongX ? e.z : e.x) - line) < 0.01)
      .map((e) => (alongX ? e.x : e.z))
      .filter((c) => c > lo && c < hi)
      .map((c) => [c - cut, c + cut])
      .sort((p, q) => p[0] - q[0]);
    if (!holes.length) { out.push(run); continue; }
    // The pieces left, in the run's own direction.
    const pieces = [];
    let from = lo;
    for (const [h0, h1] of holes) {
      if (h0 - from > 0.05) pieces.push([from, h0]);
      from = Math.max(from, h1);
    }
    if (hi - from > 0.05) pieces.push([from, hi]);
    if (u0 > u1) { pieces.reverse(); for (const pc of pieces) pc.reverse(); }
    for (const [p0, p1] of pieces) {
      out.push({ ...run, a: alongX ? [p0, line] : [line, p0], b: alongX ? [p1, line] : [line, p1] });
    }
  }
  return out;
}

