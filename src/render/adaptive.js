// Adaptive Auto quality: a frame-time governor and a per-device rung memory.
// No DOM and no three import — a leaf module unit-tested headless, like
// perfstats.js. A runtime adapter feeds it performance.now() once per frame
// and keeps the memory in localStorage under MEMORY_KEY.
//
// The numbers: 20 ms sits above the iPhone 18's worst HIGH frame (18 ms), so
// the target phone never trips; "over half the frames in 4 s" is a median
// test with a running count, and single hitches can't reach it; 5 s of
// warm-up skips shader compiles. Reasons in full, and the retry rule, in
// docs/superpowers/plans/2026-10-25-whisker-walk-v21-stream4-adaptive.md.

import { CAP_RUNG } from './quality.js';

export const ADAPT = Object.freeze({
  warmupMs: 5000,  // walk start compiles shaders and uploads textures
  windowMs: 4000,  // long enough that one-off hitches stay under half
  slowMs: 20,      // above the target phone's worst frame
  maxGapMs: 250,   // longer gaps are a background tab or throttled rAF
  minSamples: 30,  // at least 7.5 fps of kept frames before deciding
  settleMs: 1000,  // after a step-down, skip the buffer reallocation
  // Live steps that leave the mean frame time within 10% of where the walk
  // first tripped are a frame-rate cap (Low Power Mode, a 30 Hz display),
  // not a slow GPU, so the floor is not taken and nothing is remembered.
  minGain: 0.1,
});

// The last resort, after the floor rung: a steady 30 frames a second.
//
// A device that cannot hold 60 on the lite rung does not show a steady
// anything. The browser presents on display refreshes, so a frame that takes
// 15 ms is shown for 16.7 ms and one that takes 18 ms for 33.3 ms, and a
// walk hovering around the line alternates between the two at random: 35 to
// 50 frames a second, and it looks like stutter. Drawing (and updating) only
// when a 30th of a second has passed gives every frame the same 33.3 ms on
// screen. Fewer frames, but even ones, which is what the eye minds.
//
//   frameMs    the interval being held: 1/30 s.
//   slackMs    how early a display refresh may be and still count as due. A
//              60 Hz display's refreshes land at 16.7, 33.3, 50 ms: the one
//              at 33.3 must pass and the one at 16.7 must not, so anything
//              from a few ms up to 16 works; 4 ms is a quarter of a refresh
//              of callback jitter.
//   fastMs     a frame shorter than this made a 60 Hz refresh (16.7 ms)
//              with margin, and cannot have come from a display or a power
//              mode that is itself held at 30 (33.3 ms).
//   unevenMin  the share of such fast frames a slow window must hold for
//              the cap to be worth anything. Under it, the frames are
//              ALREADY steady at 30 or slower: a display capped by Low
//              Power Mode, a 30 Hz screen, or a device missing every
//              refresh. Capping those would change nothing on screen and
//              would be remembered for weeks, so the cap is not taken.
export const CAP30 = Object.freeze({
  frameMs: 1000 / 30,
  slackMs: 4,
  fastMs: 25,
  unevenMin: 0.1,
});

// due(now) once per display refresh; true means "draw this one". Kept to a
// schedule (the last DUE time plus the interval) rather than to the last
// callback's own time, so one late callback does not push every later frame
// late. On a display that only refreshes 30 times a second every refresh is
// due, so a device already held at 30 is never halved to 15.
export function createFramePacer({ frameMs = CAP30.frameMs, slackMs = CAP30.slackMs } = {}) {
  let dueAt = -Infinity;
  return {
    reset() { dueAt = -Infinity; },
    due(nowMs) {
      if (nowMs < dueAt - slackMs) return false;
      // More than a whole interval late (a hitch, a pause, the first call):
      // start the schedule again from here instead of racing to catch up.
      dueAt = (nowMs - dueAt > frameMs ? nowMs : dueAt) + frameMs;
      return true;
    },
  };
}

const CAPACITY = 1024;

// sample(now) once per frame; true means "step down one rung". The caller
// then calls restart(now, ADAPT.settleMs). Nothing in sample allocates.
// Known to be on a display held at 30 frames a second (the app says Low Power
// Mode is on, and WebKit then calls requestAnimationFrame 30 times a second):
// every healthy frame is 33 ms, so "over 20 ms" would call them all slow. The
// same test one refresh rate down: more than half the frames missing the
// 30 Hz refresh as well.
export const ADAPT_CAPPED = Object.freeze({ ...ADAPT, slowMs: 40 });

export function createFrameGovernor(opts = ADAPT) {
  const { windowMs, slowMs, maxGapMs, minSamples, fastMs = CAP30.fastMs } = opts;
  const stamps = new Float64Array(CAPACITY);
  const slow = new Uint8Array(CAPACITY);
  const fast = new Uint8Array(CAPACITY);
  const dts = new Float64Array(CAPACITY);
  let head = 0;         // oldest kept sample
  let count = 0;
  let slowCount = 0;
  let fastCount = 0;    // kept frames under fastMs (see CAP30.unevenMin)
  let dtSum = 0;        // sum of the kept dts, for the window mean
  let last = 0;         // previous nowMs
  let hasLast = false;  // false right after restart: the next call only records
  let armedAt = 0;
  let firstKeptAt = -1; // -1: nothing kept since the last restart or clear
  let lastFraction = 0;
  let lastFast = 0;
  let lastMean = 0;
  let wasJudged = false; // a full window was evaluated since the last restart

  function clear() {
    head = 0;
    count = 0;
    slowCount = 0;
    fastCount = 0;
    dtSum = 0;
    firstKeptAt = -1;
  }

  function restart(nowMs, delayMs) {
    clear();
    hasLast = false;
    wasJudged = false;
    armedAt = nowMs + delayMs;
  }

  function evictOldest() {
    slowCount -= slow[head];
    fastCount -= fast[head];
    dtSum -= dts[head];
    head = (head + 1) % CAPACITY;
    count--;
  }

  function sample(nowMs) {
    const prev = last;
    const had = hasLast;
    last = nowMs;
    hasLast = true;
    if (!had || nowMs < armedAt) return false;
    const dt = nowMs - prev;
    if (dt <= 0 || dt > maxGapMs) return false;

    const from = nowMs - windowMs;
    while (count > 0 && stamps[head] < from) evictOldest();
    if (count === CAPACITY) evictOldest();
    // An emptied ring starts a fresh window, so a decision always sees a
    // full windowMs of frames.
    if (count === 0) firstKeptAt = nowMs;

    const i = (head + count) % CAPACITY;
    const isSlow = dt > slowMs ? 1 : 0;
    const isFast = dt < fastMs ? 1 : 0;
    stamps[i] = nowMs;
    slow[i] = isSlow;
    fast[i] = isFast;
    dts[i] = dt;
    count++;
    slowCount += isSlow;
    fastCount += isFast;
    dtSum += dt;

    if (nowMs - firstKeptAt >= windowMs && count >= minSamples) {
      wasJudged = true;
      if (slowCount * 2 > count) {
        lastFraction = slowCount / count;
        lastFast = fastCount / count;
        lastMean = dtSum / count;
        clear();
        return true;
      }
    }
    return false;
  }

  return {
    restart,
    sample,
    lastSlowFraction() { return lastFraction; },
    // The share of frames under fastMs in the window that last triggered.
    lastFastFraction() { return lastFast; },
    // The window's mean frame time at the most recent trigger.
    lastMeanMs() { return lastMean; },
    // True once a full window has been evaluated since the last restart,
    // whether or not it triggered.
    judged() { return wasJudged; },
  };
}

// Per-device memory: the rung this device settled on and the retry clock.
// `rung` runs 0 to CAP_RUNG: the six tiers, then the lite rung with the 30 fps
// cap on. A value written before the lower rungs existed (0 to 3) reads as
// it always did.
export const MEMORY_KEY = 'whisker-walk-adapt';
export const DEFAULT_MEMORY = Object.freeze({
  rung: 0, steppedAt: 0, walks: 0, waitDays: 7, retrying: false,
});

const DAY_MS = 86_400_000;
const RETRY_WALKS = 5;
const MIN_WAIT_DAYS = 7;
const MAX_WAIT_DAYS = 56;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_MEMORY };
  const d = DEFAULT_MEMORY;
  return {
    rung: isNum(raw.rung) ? clamp(Math.trunc(raw.rung), 0, CAP_RUNG) : d.rung,
    steppedAt: isNum(raw.steppedAt) ? Math.max(0, raw.steppedAt) : d.steppedAt,
    walks: isNum(raw.walks) ? Math.max(0, Math.trunc(raw.walks)) : d.walks,
    waitDays: isNum(raw.waitDays) ? clamp(raw.waitDays, MIN_WAIT_DAYS, MAX_WAIT_DAYS) : d.waitDays,
    retrying: raw.retrying === true,
  };
}

// True when this device has an adapt memory at all (whatever it says). False
// on the very first Auto walk, which is the one walk the device profile's
// starting-rung table is consulted for (render/deviceprofile.js): from then
// on what the frames said is remembered here and wins. Storage that throws
// has no memory, so every walk starts from the table's answer.
export function hasMemory(storage) {
  try {
    return storage.getItem(MEMORY_KEY) != null;
  } catch {
    return false;
  }
}

// Safari private mode and blocked storage throw; a hand-edited value can be
// anything. Either way the device starts fresh at the top.
export function readMemory(storage) {
  try {
    const text = storage.getItem(MEMORY_KEY);
    if (text == null) return { ...DEFAULT_MEMORY };
    return sanitize(JSON.parse(text));
  } catch {
    return { ...DEFAULT_MEMORY };
  }
}

export function writeMemory(storage, mem) {
  try {
    storage.setItem(MEMORY_KEY, JSON.stringify(mem));
  } catch {
    // Not remembering is fine: the next walk starts at the top again.
  }
}

// Which rung this walk starts on, and the memory to write back.
export function planWalkStart(mem, nowMs) {
  const next = { ...mem };
  // A clock that went backwards (or a hand-edited value) must not stretch the
  // wait: the wait starts now.
  if (next.steppedAt > nowMs) next.steppedAt = nowMs;
  // Still retrying at the next walk start: the retry walk ended before a full
  // window judged it (a held retry is cleared by noteRetryHeld mid-walk). Try
  // the same rung again rather than call it a success.
  if (next.retrying) {
    next.walks += 1;
    return { rung: next.rung, reason: 'retry', mem: next };
  }
  let reason = next.rung === 0 ? 'top' : 'remembered';
  if (
    next.rung > 0 &&
    next.walks >= RETRY_WALKS &&
    nowMs - next.steppedAt >= next.waitDays * DAY_MS
  ) {
    // One rung higher. The clock restarts here too, so a retry that holds
    // waits another 5 walks and waitDays before climbing again.
    next.rung -= 1;
    next.retrying = true;
    next.steppedAt = nowMs;
    next.walks = 0;
    reason = 'retry';
  }
  next.walks += 1;
  return { rung: next.rung, reason, mem: next };
}

// A retry walk ran a full judged window without stepping down: it held.
export function noteRetryHeld(mem) {
  return { ...mem, retrying: false, waitDays: MIN_WAIT_DAYS };
}

export function noteStepDown(mem, newRung, nowMs) {
  const next = { ...mem, rung: newRung, steppedAt: nowMs, walks: 0 };
  if (mem.retrying) {
    next.waitDays = Math.min(mem.waitDays * 2, MAX_WAIT_DAYS);
    next.retrying = false;
  }
  return next;
}
