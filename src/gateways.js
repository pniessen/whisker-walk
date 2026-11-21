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
//   arrive        where a cat coming in through this end lands: { x, z, yaw }.
//                 Without one she lands ARRIVE_IN m inside the end, facing in.
//   wings         optional [hinge side, latch side]: metres of railing running
//                 on along the edge line from each post, so the gate stands
//                 in something (world/gateway.js draws them, solid to her cat).
//                 A 'promenade' look only: it is that look's railing, run on.
//
// A door or a climb (the Old House's front door, the Rooftops' fire escape) is
// a row with placement 'inside', an explicit `arrive` and usually look 'none'
// (the area draws its own door). The Rooftops' back-alley door is the
// exception: the 'alleydoor' look draws it, a door in a brick frame. A row
// appears as a live gate only once its place has a catalog row (liveEndsFor),
// so a place not built yet has no gate. The town and the Rooftops are joined
// by the pair town-roofs (a signpost at the town's north street end) and
// roofs-town (that door, in the alley's wall; Rooftops step 4). House step 4
// adds the pair town-house / house-town: those two rows and nothing else.

export const GATE_REACH = 1.6; // m, cat centre to gate centre
// m: nearer than this to a gate she can go through or open, the place beyond
// starts downloading (once per gate per walk), so a yes rarely waits for it.
export const GATE_PREFETCH_REACH = 12;
export const GATE_HALF = 1.4; // m, centre to each gate post along the edge
export const GATE_POST_R = 0.15;
export const ARRIVE_IN = GATE_REACH + 2;
export const GATE_LOOKS = Object.freeze(['signpost', 'fairgate', 'farmgate', 'promenade', 'alleydoor', 'none']);
export const PLACEMENTS = Object.freeze(['edge', 'inside']);
// The cat's rotation.y facing into the area (rotation 0 faces -z).
export const INWARD_YAW = Object.freeze({ north: Math.PI, south: 0, east: Math.PI / 2, west: -Math.PI / 2 });

// Copied from borderposts.js to keep this file import-free.
const FACINGS = ['north', 'south', 'east', 'west'];
// Unit step through the gate, per facing, as [dx, dz].
const THROUGH = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

export function gatewayEnd({ id, gateway, x, z, faces, to, twin, look, placement = 'edge', lane = null, arrive = null, wings = null }) {
  if (!FACINGS.includes(faces)) throw new Error(`gateway end ${id}: faces "${faces}" is not one of ${FACINGS.join(', ')}`);
  if (!GATE_LOOKS.includes(look)) throw new Error(`gateway end ${id}: look "${look}" is not one of ${GATE_LOOKS.join(', ')}`);
  if (!PLACEMENTS.includes(placement)) throw new Error(`gateway end ${id}: placement "${placement}" is not one of ${PLACEMENTS.join(', ')}`);
  if (placement === 'inside' && !arrive) throw new Error(`gateway end ${id}: placement "inside" needs an arrive { x, z, yaw }`);
  if (wings && (look !== 'promenade' || wings.length !== 2 || !wings.every((w) => Number.isFinite(w) && w >= 0))) {
    throw new Error(`gateway end ${id}: wings must be [hinge side, latch side] metres on a 'promenade' look`);
  }
  return Object.freeze({
    id, gateway, x, z, faces, to, twin, look, placement,
    lane: lane ? Object.freeze([...lane]) : null,
    arrive: arrive ? Object.freeze({ ...arrive }) : null,
    wings: wings ? Object.freeze([...wings]) : null,
  });
}
const end = gatewayEnd;

export const GATEWAY_ENDS = Object.freeze({
  neighborhood: Object.freeze([
    end({ id: 'town-park', gateway: 'town-park', x: 52, z: 0, faces: 'east', to: 'park', twin: 'park-town', look: 'signpost' }),
    end({ id: 'town-docks', gateway: 'town-docks', x: 0, z: 52, faces: 'south', to: 'docks', twin: 'docks-town', look: 'signpost' }),
    end({ id: 'town-roofs', gateway: 'town-roofs', x: 0, z: -52, faces: 'north', to: 'roofs', twin: 'roofs-town', look: 'signpost' }),
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
  ]),
  roofs: Object.freeze([
    // A green door in the back alley's brick wall (roofs.js draws it at
    // ROOFS_BOUNDS.maxZ, z 46): its dark doorway's back meets the wall face,
    // so the wall needs no hole. She lands in the alley facing north, 3.65 m
    // in front of it (GATE_REACH + 2 clear of it, as every arrival is).
    end({ id: 'roofs-town', gateway: 'town-roofs', x: 14, z: 45.55, faces: 'south', to: 'neighborhood', twin: 'town-roofs', look: 'alleydoor', placement: 'inside', arrive: { x: 14, z: 41.9, yaw: 1.0 } }),
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

