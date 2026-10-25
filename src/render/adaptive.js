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

import { FLOOR_RUNG } from './quality.js';

export const ADAPT = Object.freeze({
  warmupMs: 5000,  // walk start compiles shaders and uploads textures
  windowMs: 4000,  // long enough that one-off hitches stay under half
  slowMs: 20,      // above the target phone's worst frame
  maxGapMs: 250,   // longer gaps are a background tab or throttled rAF
  minSamples: 30,  // at least 7.5 fps of kept frames before deciding
  settleMs: 1000,  // after a step-down, skip the buffer reallocation
});

const CAPACITY = 1024;

// sample(now) once per frame; true means "step down one rung". The caller
// then calls restart(now, ADAPT.settleMs). Nothing in sample allocates.
export function createFrameGovernor(opts = ADAPT) {
  const { windowMs, slowMs, maxGapMs, minSamples } = opts;
  const stamps = new Float64Array(CAPACITY);
  const slow = new Uint8Array(CAPACITY);
  let head = 0;         // oldest kept sample
  let count = 0;
  let slowCount = 0;
  let last = 0;         // previous nowMs
  let hasLast = false;  // false right after restart: the next call only records
  let armedAt = 0;
  let firstKeptAt = -1; // -1: nothing kept since the last restart or clear
  let lastFraction = 0;

  function clear() {
    head = 0;
    count = 0;
    slowCount = 0;
    firstKeptAt = -1;
  }

  function restart(nowMs, delayMs) {
    clear();
    hasLast = false;
    armedAt = nowMs + delayMs;
  }

  function evictOldest() {
    slowCount -= slow[head];
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
    stamps[i] = nowMs;
    slow[i] = isSlow;
    count++;
    slowCount += isSlow;

    if (nowMs - firstKeptAt >= windowMs && count >= minSamples && slowCount * 2 > count) {
      lastFraction = slowCount / count;
      clear();
      return true;
    }
    return false;
  }

  return {
    restart,
    sample,
    lastSlowFraction() { return lastFraction; },
  };
}

// Per-device memory: the rung this device settled on and the retry clock.
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
    rung: isNum(raw.rung) ? clamp(Math.trunc(raw.rung), 0, FLOOR_RUNG) : d.rung,
    steppedAt: isNum(raw.steppedAt) ? Math.max(0, raw.steppedAt) : d.steppedAt,
    walks: isNum(raw.walks) ? Math.max(0, Math.trunc(raw.walks)) : d.walks,
    waitDays: isNum(raw.waitDays) ? clamp(raw.waitDays, MIN_WAIT_DAYS, MAX_WAIT_DAYS) : d.waitDays,
    retrying: raw.retrying === true,
  };
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
  // Still retrying at the next walk start: the last walk held the higher rung.
  if (next.retrying) {
    next.waitDays = MIN_WAIT_DAYS;
    next.retrying = false;
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

export function noteStepDown(mem, newRung, nowMs) {
  const next = { ...mem, rung: newRung, steppedAt: nowMs, walks: 0 };
  if (mem.retrying) {
    next.waitDays = Math.min(mem.waitDays * 2, MAX_WAIT_DAYS);
    next.retrying = false;
  }
  return next;
}
