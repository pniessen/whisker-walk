// The small rules of couch play, as pure functions and tiny state machines
// with no page, no cat and no real clock (every one is handed its dt): so each
// can be tested with a fake clock. src/coop/index.js wires them to the cats.

// ---- the rubber band: a cat moving apart slows near the leash ----
export const BAND_LEN = 3; // metres before the leash over which the slowing runs
export const BAND_MIN = 0.35; // the share of its speed a cat keeps at the leash

/** The share of a step AWAY from the friend that is kept, `apart` metres from the friend, leash `limit`. Moving closer is never slowed (the caller only asks for the away part). */
export function bandFactor(apart, limit) {
  const start = limit - BAND_LEN;
  if (!(apart > start)) return 1;
  const k = Math.min(1, (apart - start) / BAND_LEN);
  return 1 - (1 - BAND_MIN) * k;
}

// ---- follow when idle: a cat whose stick has rested trots to its friend ----
export const FOLLOW_IDLE_S = 3; // seconds with no stick before it starts
export const FOLLOW_FAR = 8; // metres apart before it starts
export const FOLLOW_STOP = 3; // metres from the friend where it stops

/** One per cat. step(dt, { stick, apart, on, far, stop }) -> true while the cat should trot toward its friend (from `far` apart to `stop`; a tight place, where the leash holds the pair as close as they stand, gives short ones). Any stick at all ends it at once. */
export function createFollow() {
  let idle = 0, going = false;
  return {
    get going() { return going; },
    step(dt, { stick = 0, apart = 0, on = true, far = FOLLOW_FAR, stop = FOLLOW_STOP } = {}) {
      if (!on || stick > 0) { idle = 0; going = false; return false; }
      idle += Math.max(dt, 0);
      if (going) { if (apart <= stop) going = false; }
      else if (idle >= FOLLOW_IDLE_S && apart > far) going = true;
      return going;
    },
    reset() { idle = 0; going = false; },
  };
}

// ---- hold D-pad Down: hop to my friend ----
export const HOLD_S = 0.8;
export const TAP_MAX_S = 0.3; // a press this short is a tap
export const TAP_GAP_S = 0.45; // two taps this close are the "tap twice" way
export const DPAD_DOWN = 13;
export const DPAD_LEFT = 14; // the groom button

/** One per pad. step(dt, down) -> { progress 0..1, fired }: fired once per hold (after HOLD_S) or on the second of two quick taps. */
export function createHold() {
  let t = 0, clock = 0, held = false, spent = false, lastTapEnd = -Infinity;
  return {
    step(dt, down) {
      clock += Math.max(dt, 0);
      let fired = false;
      if (down) {
        if (!held) { held = true; t = 0; spent = false; }
        t += Math.max(dt, 0);
        if (!spent && t >= HOLD_S) { spent = true; fired = true; }
      } else if (held) {
        held = false;
        if (!spent && t <= TAP_MAX_S) {
          if (clock - lastTapEnd <= TAP_GAP_S) { fired = true; lastTapEnd = -Infinity; } else lastTapEnd = clock;
        }
        t = 0;
      }
      return { progress: held && !spent ? Math.min(1, t / HOLD_S) : 0, fired };
    },
    reset() { t = 0; held = false; spent = false; lastTapEnd = -Infinity; },
  };
}

// ---- edge markers: where an out-of-sight cat's arrow sits ----
export const EDGE_PX = 48; // the least size of a marker, in CSS pixels
export const EDGE_MARGIN = 0.05; // of the width and height: the TV's safe margin

/**
 * `ndc` is the cat's place in the picture ({ x, y, z } from Vector3.project, y up). Returns
 * { show, x, y, angle }: pixel centre of the marker (inside the safe margins) and the arrow's
 * turn in radians (0 = right, counter-clockwise on screen is negative as CSS turns clockwise).
 */
export function edgeMarker(ndc, w, h, px = EDGE_PX, force = false) {
  const behind = !(ndc.z <= 1);
  const out = force || behind || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1;
  if (!out) return { show: false, x: 0, y: 0, angle: 0 };
  let dx = ndc.x * (behind ? -1 : 1), dy = ndc.y * (behind ? -1 : 1);
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dy = -1;
  const mx = EDGE_MARGIN * w + px / 2, my = EDGE_MARGIN * h + px / 2;
  const hx = w / 2 - mx, hy = h / 2 - my;
  const sx = dx !== 0 ? hx / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hy / Math.abs(dy) : Infinity;
  const k = Math.min(sx, sy);
  return { show: true, x: w / 2 + dx * k, y: h / 2 - dy * k, angle: Math.atan2(-dy * h, dx * w) };
}

// ---- the toast queue: one line at a time, merged when two cats find the same thing ----
export const MERGE_S = 1.5;
export const KEEP = 4; // lines waiting: the latest
export const STALE_S = 10; // a found line this old is never shown late

/**
 * `emit(item)` shows a line (item: { text, slots, key, merge }); merge: true means "fold into
 * the line on screen" (the page's own toast merge). `life(text)` is how long a line stays, ms.
 * push({ key, slot, one, both }): `one` is the line for a single finder, `both` for two.
 * tick(dt) moves the clock and lets the next waiting line out when the screen line is done.
 */
export function createToastQueue({ emit, life = () => 3000 }) {
  let clock = 0, freeAt = 0, shown = null; // shown: { key, slot, at, both }
  const wait = [];
  const out = (item) => { freeAt = clock + life(item.text) / 1000; emit(item); };
  return {
    get waiting() { return wait.length; },
    push({ key, slot, one, both, found = true }) {
      if (shown && key && shown.key === key && shown.slot !== slot && !shown.merged && clock - shown.at <= MERGE_S && clock < freeAt) {
        shown.merged = true;
        emit({ text: both, slots: [0, 1], key, merge: true });
        return;
      }
      const q = key ? wait.find((w) => w.key === key && w.slot !== slot && !w.merged && clock - w.at <= MERGE_S) : null;
      if (q) { q.merged = true; q.text = both; q.slots = [0, 1]; return; }
      wait.push({ key, slot, at: clock, text: one, both, slots: [slot], found });
      while (wait.length > KEEP) wait.shift();
    },
    tick(dt) {
      clock += Math.max(dt, 0);
      for (let i = wait.length - 1; i >= 0; i--) if (wait[i].found && clock - wait[i].at > STALE_S) wait.splice(i, 1);
      if (wait.length && clock >= freeAt) {
        const w = wait.shift();
        shown = w;
        shown.at = clock;
        out({ text: w.text, both: w.both, slots: w.slots, key: w.key, merge: false });
      }
    },
    clear() { wait.length = 0; shown = null; freeAt = 0; },
  };
}
