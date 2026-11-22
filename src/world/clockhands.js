// The Rooftops clock tower's hands at the real local time (pure helpers, no
// three.js). The hands are rods merged into the kit's paint mesh; once a
// minute, while the tower is in view, their vertices are rewritten in place
// (same triangles, same buffer), so nothing is added to the scene.

const TAU = Math.PI * 2;

// Minutes since local midnight (any number; wraps at 24 h) -> the hands' angles
// in radians clockwise from 12: the hour hand creeps with the minutes.
export function handAngles(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return { hour: ((m % 720) / 720) * TAU, minute: ((m % 60) / 60) * TAU };
}

// A Date (or anything with getHours/getMinutes) -> whole minutes since midnight.
export const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

// A once-a-minute ticker. `now()` gives a Date; `visible()` says whether the
// faces are on screen; `apply(minutes)` redraws the hands. update(dt) looks at
// the clock and the view at most once a second, and redraws only when the minute has moved
// since the last redraw and the faces are in view (so off-screen it costs one
// date read a second and no drawing; it catches up the moment they are seen).
export function createClockTicker({ now, visible, apply, every = 1 }) {
  let drawn = -1;
  let wait = 0;
  return {
    update(dt) {
      wait -= dt;
      if (wait > 0) return false;
      wait = every;
      const minutes = minutesOf(now());
      if (minutes === drawn || !visible()) return false;
      drawn = minutes;
      apply(minutes);
      return true;
    },
  };
}
