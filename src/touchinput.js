// Pure math for touch controls: joystick vector, stalk-magnitude test, and
// tap/drag classification. No DOM access here — callers own the events.

export function joystickVector(originX, originY, x, y, maxR = 60, dead = 0.15) {
  let dx = (x - originX) / maxR;
  let dy = (y - originY) / maxR;
  let mag = Math.hypot(dx, dy);
  if (mag < dead) return { x: 0, z: 0, mag: 0 };
  if (mag > 1) {
    dx /= mag;
    dy /= mag;
    mag = 1;
  }
  // z = dy: screen-down (thumb pulled toward the player) reads as +z, toward the camera.
  return { x: dx, z: dy, mag };
}

export function isStalkMag(mag, threshold = 0.45) {
  return mag > 0 && mag < threshold;
}

export function classifyTouch(startT, endT, startX, startY, endX, endY) {
  const dt = endT - startT;
  const dist = Math.hypot(endX - startX, endY - startY);
  return dt < 300 && dist < 10 ? 'tap' : 'drag';
}
