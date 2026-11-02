// Pure geometry for the corner map. No DOM and no THREE, so it tests in node.

// World radius (metres) the map shows by default.
export const MAP_RADIUS_M = 35;

// Per-area overrides; areas not listed use the default.
const AREA_RADIUS_M = {};

export function mapRadiusFor(areaId) {
  return AREA_RADIUS_M[areaId] ?? MAP_RADIUS_M;
}

// World (x, z) to pixels from the disc centre, v positive downward.
// heading is the camera yaw, Math.atan2(-f.x, -f.z) from player.forward().
export function toMap(x, z, view) {
  const dx = x - view.cx;
  const dz = z - view.cz;
  const s = view.radiusPx / view.radiusM;
  let u;
  let v;
  if (view.mode === 'turn') {
    // forward = (-sin h, -cos h), right = (cos h, -sin h): forward is up.
    const sin = Math.sin(view.heading);
    const cos = Math.cos(view.heading);
    u = (dx * cos - dz * sin) * s;
    v = (dx * sin + dz * cos) * s;
  } else {
    // North mode: world -z is up.
    u = dx * s;
    v = dz * s;
  }
  return { u, v, inside: Math.hypot(dx, dz) <= view.radiusM };
}

// World direction of each compass facing, in x/z (north is -z).
const FACE_DIR = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

// Canvas angle (radians, 0 = right, positive clockwise on screen) of a compass
// facing on the map. Turns the world vector by the same rotation toMap applies
// to positions, since a position alone carries no direction.
export function faceAngle(faces, view) {
  const [dx, dz] = FACE_DIR[faces] ?? FACE_DIR.north;
  if (view.mode !== 'turn') return Math.atan2(dz, dx);
  const sin = Math.sin(view.heading);
  const cos = Math.cos(view.heading);
  return Math.atan2(dx * sin + dz * cos, dx * cos - dz * sin);
}

// Pull a point that is past the rim back onto it, keeping its bearing, so
// off-map targets can still show as an edge arrow.
export function pinToRim(p, radiusPx, inset) {
  const limit = radiusPx - inset;
  const d = Math.hypot(p.u, p.v);
  if (d <= limit) return { u: p.u, v: p.v };
  const k = limit / d;
  return { u: p.u * k, v: p.v * k };
}

// The N badge rides the rim at north's bearing, BADGE_INSET px in from the
// rim, BADGE_R px across; MARK_R is about the reach of a marker round its
// point (a post's arrow is 9 px long).
export const BADGE_R = 8;
export const BADGE_INSET = 9;
export const MARK_R = 5;

// Where the badge's centre is, in pixels from the disc centre: straight up in
// north mode, at north's bearing in turn mode.
export function badgeAt(view) {
  const nu = view.mode === 'turn' ? Math.sin(view.heading) : 0;
  const nv = view.mode === 'turn' ? -Math.cos(view.heading) : -1;
  const r = view.radiusPx - BADGE_INSET;
  return { u: nu * r, v: nv * r };
}

// A marker point under the badge (closer than `clear` to its centre) is
// turned about the disc centre, keeping its distance from it, just far
// enough to clear the badge, on the side it already leans to (east when it
// is dead on). Any other point comes back as it was.
export function clearOfBadge(p, badge, clear) {
  const d = Math.hypot(p.u - badge.u, p.v - badge.v);
  if (d >= clear) return p;
  const r = Math.hypot(p.u, p.v);
  const rb = Math.hypot(badge.u, badge.v);
  if (r === 0 || rb === 0) return p;
  const aB = Math.atan2(badge.v, badge.u);
  let lean = Math.atan2(p.v, p.u) - aB;
  lean = Math.atan2(Math.sin(lean), Math.cos(lean));
  // The angle about the centre at which the two are exactly `clear` apart.
  const cos = (r * r + rb * rb - clear * clear) / (2 * r * rb);
  const turn = Math.acos(Math.max(-1, Math.min(1, cos)));
  const a = aB + (lean < 0 ? -turn : turn);
  return { u: Math.cos(a) * r, v: Math.sin(a) * r };
}

// Which things get a marker. Reads only the keys listed here, so anything
// hidden (golden mice, secrets, gifts, collectibles, strays) cannot leak onto
// the map even if the caller's frame carries it. The cat itself is not a
// marker; the painter always draws it at the centre.
export function mapMarkers(frame) {
  const out = [];
  // The clan's camp goes first so every other marker draws over it.
  if (frame.camp) out.push({ kind: 'camp', x: frame.camp.x, z: frame.camp.z, color: frame.camp.color });
  // Border posts (Clan Edition only; the frame carries null elsewhere).
  for (const p of frame.posts ?? []) out.push({ kind: 'post', x: p.x, z: p.z, faces: p.faces });
  const race = frame.race;
  if (race && race.state === 'running') {
    // currentRing is 1-based: bright for the next ring, dim for the one after.
    const next = race.rings[race.currentRing - 1];
    const after = race.rings[race.currentRing];
    if (next) out.push({ kind: 'ring', n: race.currentRing, dim: false, x: next.x, z: next.z });
    if (next && after) out.push({ kind: 'ring', n: race.currentRing + 1, dim: true, x: after.x, z: after.z });
  } else if (race && race.state === 'idle' && race.pad) {
    out.push({ kind: 'pad', x: race.pad.x, z: race.pad.z });
  }
  if (frame.quest && frame.quest.state === 'active') {
    out.push({ kind: 'quest', x: frame.quest.target.x, z: frame.quest.target.z });
  }
  for (const s of frame.scenics) {
    out.push({ kind: 'scenic', x: s.x, z: s.z, filled: frame.visitedScenics.has(s.id) });
  }
  for (const r of frame.remotes) {
    out.push({ kind: 'remote', x: r.x, z: r.z, color: r.color });
  }
  return out;
}
