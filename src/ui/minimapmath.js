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

// Pull a point that is past the rim back onto it, keeping its bearing, so
// off-map targets can still show as an edge arrow.
export function pinToRim(p, radiusPx, inset) {
  const limit = radiusPx - inset;
  const d = Math.hypot(p.u, p.v);
  if (d <= limit) return { u: p.u, v: p.v };
  const k = limit / d;
  return { u: p.u * k, v: p.v * k };
}

// Which things get a marker. Reads only the keys listed here, so anything
// hidden (golden mice, secrets, gifts, collectibles, strays) cannot leak onto
// the map even if the caller's frame carries it. The cat itself is not a
// marker; the painter always draws it at the centre.
export function mapMarkers(frame) {
  const out = [];
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
