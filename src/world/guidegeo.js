// =============================================================================
// THE GUIDES' SHARED GEOMETRY (pure: no THREE, no DOM, no clock). The edge arrow's maths, read through a camera's own position, turn and field of view; the Moon's written guide
// (world/moonguide.js) and the Reef's (world/reefguide.js) both stand on it. Moved here unchanged from moonguide.js, which re-exports it.
// =============================================================================

export const ARRIVED = 8; // m: the arrow is not shown when the goal is nearer than this (or on screen)
export const SCREEN_EDGE = 0.88; // a goal inside this share of the view (from the middle to the edge) counts as on screen
export const round5 = (m) => (Number.isFinite(m) && m > 0 ? Math.round(m / 5) * 5 : 0);

// ---- the edge arrow's geometry ----------------------------------------------------------------------------------------------------------------
// A camera is read through its own position, turn (quaternion) and field of view (degrees, vertical) and aspect, so a test can hand a plain object and the live game its real camera.
// Nothing here allocates once `view` and `out` are made.
export const makeView = () => ({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, tanV: 0.5, tanH: 0.9 });
export function viewOf(cam, view = makeView()) {
  const p = cam.position;
  const { x, y, z, w } = cam.quaternion;
  view.x = p.x; view.y = p.y; view.z = p.z;
  view.fx = -2 * (x * z + w * y); view.fy = -2 * (y * z - w * x); view.fz = -(1 - 2 * (x * x + y * y)); // (0, 0, -1) turned by the camera
  view.rx = 1 - 2 * (y * y + z * z); view.ry = 2 * (x * y + w * z); view.rz = 2 * (x * z - w * y); // (1, 0, 0)
  view.ux = 2 * (x * y - w * z); view.uy = 1 - 2 * (x * x + z * z); view.uz = 2 * (y * z + w * x); // (0, 1, 0)
  view.tanV = Math.tan(((cam.fov ?? 50) * Math.PI) / 360);
  view.tanH = view.tanV * (cam.aspect || 1.6);
  return view;
}
export const makeArrow = () => ({ show: false, rel: 0, dist: 0, onScreen: false });
// arrowFor(view, from, goal, out): `from` is where HER paws are (the distance is hers, not the camera's: the camera hangs behind her), `goal` { x, y, z }.
// out.rel is the turn from where the camera looks to where the goal lies, in radians along the ground, 0 ahead and positive toward her right.
// out.show is false when the goal is on screen or nearer than `near` metres.
export function arrowFor(view, from, goal, out = makeArrow(), near = ARRIVED) {
  const dxc = goal.x - view.x; const dyc = goal.y - view.y; const dzc = goal.z - view.z;
  const depth = dxc * view.fx + dyc * view.fy + dzc * view.fz;
  const sx = dxc * view.rx + dyc * view.ry + dzc * view.rz;
  const sy = dxc * view.ux + dyc * view.uy + dzc * view.uz;
  out.onScreen = depth > 0.3 && Math.abs(sx) < depth * view.tanH * SCREEN_EDGE && Math.abs(sy) < depth * view.tanV * SCREEN_EDGE;
  const hf = Math.hypot(view.fx, view.fz) || 1;
  const fx = view.fx / hf; const fz = view.fz / hf;
  const dx = goal.x - view.x; const dz = goal.z - view.z;
  out.rel = Math.atan2(-dx * fz + dz * fx, dx * fx + dz * fz);
  out.dist = Math.hypot(goal.x - from.x, goal.z - from.z);
  out.show = !out.onScreen && out.dist > near;
  return out;
}
// Where on a rectangle { l, t, r, b } the arrow sits for a turn `rel`: from its middle toward that way until it meets the edge. A goal behind her slides to the bottom corner on its side (the further it is
// behind, the nearer the corner), so the arrow is never on the bottom middle (the prompt and the toasts) or over the cat.
export function edgePoint(rel, rect, out = { x: 0, y: 0 }) {
  const cx = (rect.l + rect.r) / 2; const cy = (rect.t + rect.b) / 2;
  const hw = Math.max(1, (rect.r - rect.l) / 2); const hh = Math.max(1, (rect.b - rect.t) / 2);
  const dx = Math.sin(rel); const dy = -Math.cos(rel);
  const k = Math.min(hw / Math.max(Math.abs(dx), 1e-6), hh / Math.max(Math.abs(dy), 1e-6));
  out.x = cx + dx * k;
  out.y = cy + dy * k;
  if (dy > 0.5) {
    const w = (dy - 0.5) / 0.5;
    const cornerX = cx + (dx < 0 ? -hw : hw);
    out.x += (cornerX - out.x) * w;
    out.y += (rect.b - out.y) * w;
  }
  return out;
}
// A point's place on the screen (pixels) for a view of W x H: ok false when it is behind the camera.
export function projectPoint(view, x, y, z, W, H, out = { ok: false, x: 0, y: 0, depth: 0 }) {
  const dx = x - view.x; const dy = y - view.y; const dz = z - view.z;
  const depth = dx * view.fx + dy * view.fy + dz * view.fz;
  out.depth = depth;
  out.ok = depth > 0.2;
  if (!out.ok) return out;
  out.x = (0.5 + (0.5 * (dx * view.rx + dy * view.ry + dz * view.rz)) / (depth * view.tanH)) * W;
  out.y = (0.5 - (0.5 * (dx * view.ux + dy * view.uy + dz * view.uz)) / (depth * view.tanV)) * H;
  return out;
}
