// Pure drag-to-spin math for the dressing-room hero cat. No DOM, no clock:
// the caller passes pointer x (px) and a timestamp (ms) in, and steps the coast
// with dt (seconds). Dragging turns the cat radPerPx per pixel; releasing a
// flick hands the last ~80 ms of drag speed to an exponential coast.

const WINDOW_MS = 80;
const MAX_SPEED = 20; // rad/s, so a wild flick can't whirl the cat forever
const STOP_SPEED = 0.01; // rad/s

export function createSpin({ radPerPx = 0.012, friction = 4, rest = -0.45 } = {}) {
  let angle = rest;
  let lastX = 0;
  let holding = false;
  let velocity = 0; // rad/s while coasting
  let samples = []; // { t, a } angle history during a drag

  function trim(t) {
    while (samples.length > 1 && t - samples[0].t > WINDOW_MS) samples.shift();
  }

  return {
    get angle() { return angle; },
    grab(x, t) {
      holding = true;
      velocity = 0;
      lastX = x;
      samples = [{ t, a: angle }];
    },
    move(x, t) {
      if (!holding) return;
      angle += (x - lastX) * radPerPx;
      lastX = x;
      samples.push({ t, a: angle });
      trim(t);
    },
    release(t) {
      if (!holding) return;
      holding = false;
      trim(t);
      // only drag samples from the last WINDOW_MS count; a pause means no coast
      const recent = samples.filter((s) => t - s.t <= WINDOW_MS);
      velocity = 0;
      if (recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt > 0) velocity = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (last.a - first.a) / dt));
      }
      samples = [];
    },
    step(dt) {
      if (holding || Math.abs(velocity) < STOP_SPEED) {
        if (!holding) velocity = 0;
        return { angle, moving: false };
      }
      angle += velocity * dt;
      velocity *= Math.exp(-friction * dt);
      return { angle, moving: Math.abs(velocity) >= STOP_SPEED };
    },
  };
}
