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
//                 climb within the area; needs an explicit `arrive`)
//   lane          optional [x1, z1, x2, z2] path joining the end to the area's walks
//   arrive        where a cat coming in through this end lands: { x, z, yaw }.
//                 Without one she lands ARRIVE_IN m inside the end, facing in.
//
// A door or a climb (the Old House's front door, the Rooftops' fire escape) is
// a row with placement 'inside', an explicit `arrive` and usually look 'none'
// (the area draws its own door). A row appears as a live gate only once its
// place has a catalog row (liveEndsFor), so a place not built yet has no gate.
// Rooftops step 4 adds the pair town-roofs / roofs-town and House step 4 the
// pair town-house / house-town; each adds those two rows and nothing else.

export const GATE_REACH = 1.6; // m, cat centre to gate centre
export const GATE_HALF = 1.4; // m, centre to each gate post along the edge
export const GATE_POST_R = 0.15;
export const ARRIVE_IN = GATE_REACH + 2;
export const GATE_LOOKS = Object.freeze(['signpost', 'fairgate', 'farmgate', 'promenade', 'none']);
export const PLACEMENTS = Object.freeze(['edge', 'inside']);
// The cat's rotation.y facing into the area (rotation 0 faces -z).
export const INWARD_YAW = Object.freeze({ north: Math.PI, south: 0, east: Math.PI / 2, west: -Math.PI / 2 });

// Copied from borderposts.js to keep this file import-free.
const FACINGS = ['north', 'south', 'east', 'west'];
// Unit step through the gate, per facing, as [dx, dz].
const THROUGH = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

export function gatewayEnd({ id, gateway, x, z, faces, to, twin, look, placement = 'edge', lane = null, arrive = null }) {
  if (!FACINGS.includes(faces)) throw new Error(`gateway end ${id}: faces "${faces}" is not one of ${FACINGS.join(', ')}`);
  if (!GATE_LOOKS.includes(look)) throw new Error(`gateway end ${id}: look "${look}" is not one of ${GATE_LOOKS.join(', ')}`);
  if (!PLACEMENTS.includes(placement)) throw new Error(`gateway end ${id}: placement "${placement}" is not one of ${PLACEMENTS.join(', ')}`);
  if (placement === 'inside' && !arrive) throw new Error(`gateway end ${id}: placement "inside" needs an arrive { x, z, yaw }`);
  return Object.freeze({
    id, gateway, x, z, faces, to, twin, look, placement,
    lane: lane ? Object.freeze([...lane]) : null,
    arrive: arrive ? Object.freeze({ ...arrive }) : null,
  });
}
const end = gatewayEnd;

export const GATEWAY_ENDS = Object.freeze({
  neighborhood: Object.freeze([
    end({ id: 'town-park', gateway: 'town-park', x: 52, z: 0, faces: 'east', to: 'park', twin: 'park-town', look: 'signpost' }),
    end({ id: 'town-docks', gateway: 'town-docks', x: 0, z: 52, faces: 'south', to: 'docks', twin: 'docks-town', look: 'signpost' }),
  ]),
  park: Object.freeze([
    end({ id: 'park-town', gateway: 'town-park', x: 0, z: 49, faces: 'south', to: 'neighborhood', twin: 'town-park', look: 'signpost' }),
    end({ id: 'park-fair', gateway: 'park-fair', x: 0, z: -47, faces: 'north', to: 'fair', twin: 'fair-park', look: 'fairgate', lane: [4, -25.2, 0, -47] }),
    end({ id: 'park-farm', gateway: 'park-farm', x: 42, z: 10, faces: 'east', to: 'farm', twin: 'farm-park', look: 'farmgate', lane: [16, 10, 42, 10] }),
  ]),
  fair: Object.freeze([
    end({ id: 'fair-park', gateway: 'park-fair', x: 8, z: 47, faces: 'south', to: 'park', twin: 'park-fair', look: 'signpost' }),
  ]),
  farm: Object.freeze([
    end({ id: 'farm-park', gateway: 'park-farm', x: -8, z: 47, faces: 'south', to: 'park', twin: 'park-farm', look: 'farmgate' }),
  ]),
  docks: Object.freeze([
    end({ id: 'docks-town', gateway: 'town-docks', x: -10, z: -37, faces: 'north', to: 'neighborhood', twin: 'town-docks', look: 'signpost' }),
    end({ id: 'docks-seaside', gateway: 'docks-seaside', x: 35, z: -20, faces: 'east', to: 'seaside', twin: 'seaside-docks', look: 'promenade' }),
  ]),
  seaside: Object.freeze([
    end({ id: 'seaside-docks', gateway: 'docks-seaside', x: 10, z: 45, faces: 'south', to: 'docks', twin: 'docks-seaside', look: 'promenade' }),
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
  const [dx, dz] = THROUGH[twin.faces];
  return { areaId, x: twin.x - dx * ARRIVE_IN, z: twin.z - dz * ARRIVE_IN, yaw: INWARD_YAW[twin.faces] };
}
