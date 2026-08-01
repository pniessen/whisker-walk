// Edge-of-screen indicator math for pointing at an off-screen target.
// local: target position in camera space (z < 0 means in front, y up).
// ndc: the target projected to normalized device coordinates.
// Returns null when the target is comfortably on screen, else
// { leftPct, topPct, rotDeg } for a CSS-positioned arrow badge
// (rotDeg is CSS rotation: 0 points right, positive clockwise).

export function screenIndicator(local, ndc, margin = 0.95) {
  const inFront = local.z < 0;
  if (inFront && Math.abs(ndc.x) < margin && Math.abs(ndc.y) < margin) return null;

  let dx = local.x;
  let dy = local.y;
  if (!inFront) {
    dx = -dx;
    dy = -dy;
  }
  const len = Math.hypot(dx, dy);
  if (len < 0.001) {
    dx = 0;
    dy = -1; // directly behind → point down
  } else {
    dx /= len;
    dy /= len;
  }
  return {
    leftPct: 50 + dx * 44,
    topPct: 50 - dy * 44,
    rotDeg: -Math.atan2(dy, dx) * (180 / Math.PI),
  };
}
