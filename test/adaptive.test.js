import { describe, it, expect } from 'vitest';
import {
  ADAPT, createFrameGovernor,
  DEFAULT_MEMORY, MEMORY_KEY, readMemory, writeMemory, planWalkStart, noteStepDown, noteRetryHeld,
} from '../src/render/adaptive.js';

const DAY = 86_400_000;

// Feed frames from startMs for durationMs. step is a fixed frame time in ms,
// or a function (t, i) → the next frame time. Returns the first nowMs where
// sample() returned true, or -1.
function feed(gov, startMs, step, durationMs) {
  const next = typeof step === 'function' ? step : () => step;
  let t = startMs;
  for (let i = 0; t < startMs + durationMs; i++) {
    if (gov.sample(t)) return t;
    t += next(t, i);
  }
  return -1;
}

describe('frame governor', () => {
  it('ADAPT holds the agreed numbers and is frozen', () => {
    expect(ADAPT).toEqual({
      warmupMs: 5000, windowMs: 4000, slowMs: 20, maxGapMs: 250, minSamples: 30, settleMs: 1000,
      minGain: 0.1,
    });
    expect(Object.isFrozen(ADAPT)).toBe(true);
  });

  it('steady 16 ms for 60 s never steps down', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    expect(feed(gov, 0, 16, 60_000)).toBe(-1);
  });

  it('steady 30 ms steps down once a full window after warm-up, then again after settling', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    const first = feed(gov, 0, 30, 60_000);
    expect(first).toBeGreaterThanOrEqual(9000);
    expect(first).toBeLessThanOrEqual(9100);
    expect(gov.lastSlowFraction()).toBe(1);

    gov.restart(first, ADAPT.settleMs);
    const second = feed(gov, first + 30, 30, 60_000);
    expect(second - first).toBeGreaterThanOrEqual(5000);
    expect(second - first).toBeLessThanOrEqual(5100);
  });

  it('one-off hitches (120 ms every 2 s, one 240 ms) never step down', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    let lastHitch = 0;
    let bigDone = false;
    const step = (t) => {
      if (!bigDone && t >= 20_000) { bigDone = true; return 240; }
      if (t - lastHitch >= 2000) { lastHitch = t; return 120; }
      return 16;
    };
    expect(feed(gov, 0, step, 60_000)).toBe(-1);
  });

  it('slow only during warm-up (30 ms for 5 s, then 16 ms) never steps down', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    expect(feed(gov, 0, (t) => (t < 5000 ? 30 : 16), 60_000)).toBe(-1);
  });

  it('a short slow burst after warm-up (30 ms for 2 s, then 16 ms) never steps down', () => {
    // Over half the frames of a 4 s window needs a 30 ms burst longer than
    // about 2.6 s (s/30 > (4000 - s)/16), so 2 s recovers in time.
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    expect(feed(gov, 0, (t) => (t >= 5000 && t < 7000 ? 30 : 16), 60_000)).toBe(-1);
  });

  it('a 3 s slow burst is already over half a window, so it does step down', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    expect(feed(gov, 0, (t) => (t >= 5000 && t < 8000 ? 30 : 16), 60_000)).toBeGreaterThan(0);
  });

  it('300 ms gaps (throttled rAF) for 60 s never step down', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    expect(feed(gov, 0, 300, 60_000)).toBe(-1);
  });

  it('exactly half slow (alternating 16/30) never steps down', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    expect(feed(gov, 0, (t, i) => (i % 2 ? 30 : 16), 60_000)).toBe(-1);
  });

  it('10 fps (100 ms frames) steps down', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    expect(feed(gov, 0, 100, 60_000)).toBeGreaterThan(0);
    expect(gov.lastSlowFraction()).toBe(1);
  });

  it('lastMeanMs is the window mean dt at the most recent trigger', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    expect(feed(gov, 0, 30, 60_000)).toBeGreaterThan(0);
    expect(gov.lastMeanMs()).toBeCloseTo(30, 6);
    gov.restart(10_000, ADAPT.settleMs);
    expect(feed(gov, 10_000, 40, 60_000)).toBeGreaterThan(0);
    expect(gov.lastMeanMs()).toBeCloseTo(40, 6);
  });

  it('judged() turns true after a full window without a trigger, and restart clears it', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    expect(gov.judged()).toBe(false);
    feed(gov, 0, 16, 8000); // warm-up plus 3 s: not a full window yet
    expect(gov.judged()).toBe(false);
    feed(gov, 8000, 16, 2000);
    expect(gov.judged()).toBe(true);
    gov.restart(10_000, ADAPT.settleMs);
    expect(gov.judged()).toBe(false);
  });

  it('judged() is also true on the sample that triggers', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    expect(feed(gov, 0, 30, 60_000)).toBeGreaterThan(0);
    expect(gov.judged()).toBe(true);
  });

  it('non-positive gaps are ignored', () => {
    const gov = createFrameGovernor();
    gov.restart(0, ADAPT.warmupMs);
    let t = 0;
    for (let i = 0; i < 3000; i++) {
      expect(gov.sample(t)).toBe(false);
      expect(gov.sample(t)).toBe(false); // same stamp twice: dt 0
      t += 16;
    }
  });
});

function mapStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

describe('device memory', () => {
  it('DEFAULT_MEMORY and MEMORY_KEY', () => {
    expect(DEFAULT_MEMORY).toEqual({ rung: 0, steppedAt: 0, walks: 0, waitDays: 7, retrying: false });
    expect(Object.isFrozen(DEFAULT_MEMORY)).toBe(true);
    expect(MEMORY_KEY).toBe('whisker-walk-adapt');
  });

  it('a throwing getItem gives the defaults', () => {
    const storage = { getItem() { throw new Error('private mode'); }, setItem() {} };
    expect(readMemory(storage)).toEqual(DEFAULT_MEMORY);
  });

  it('garbage gives the defaults as a fresh copy', () => {
    const s = mapStorage();
    s.setItem(MEMORY_KEY, '{bad');
    const mem = readMemory(s);
    expect(mem).toEqual(DEFAULT_MEMORY);
    expect(mem).not.toBe(DEFAULT_MEMORY);
    expect(Object.isFrozen(mem)).toBe(false);
    expect(readMemory(mapStorage())).toEqual(DEFAULT_MEMORY);
    s.setItem(MEMORY_KEY, '42');
    expect(readMemory(s)).toEqual(DEFAULT_MEMORY);
    expect(readMemory(null)).toEqual(DEFAULT_MEMORY);
  });

  it('out-of-range fields are sanitized', () => {
    const s = mapStorage();
    s.setItem(MEMORY_KEY, '{"rung":9,"walks":-3,"waitDays":1000,"retrying":"yes"}');
    expect(readMemory(s)).toEqual({ rung: 3, steppedAt: 0, walks: 0, waitDays: 56, retrying: false });
    s.setItem(MEMORY_KEY, '{"rung":-1.5,"steppedAt":-5,"walks":2.7,"waitDays":1}');
    expect(readMemory(s)).toEqual({ rung: 0, steppedAt: 0, walks: 2, waitDays: 7, retrying: false });
    s.setItem(MEMORY_KEY, '{"rung":"2","steppedAt":null,"walks":"x","waitDays":null}');
    expect(readMemory(s)).toEqual(DEFAULT_MEMORY);
  });

  it('a throwing setItem does not throw', () => {
    const storage = { getItem: () => null, setItem() { throw new Error('quota'); } };
    expect(() => writeMemory(storage, { ...DEFAULT_MEMORY })).not.toThrow();
    expect(() => writeMemory(null, { ...DEFAULT_MEMORY })).not.toThrow();
  });

  it('round-trips through storage', () => {
    const s = mapStorage();
    const mem = { rung: 2, steppedAt: 1_700_000_000_000, walks: 4, waitDays: 14, retrying: true };
    writeMemory(s, mem);
    expect(readMemory(s)).toEqual(mem);
  });
});

describe('planWalkStart', () => {
  const now = 1_800_000_000_000;

  it('rung 0 starts at the top and counts the walk', () => {
    const out = planWalkStart({ ...DEFAULT_MEMORY }, now);
    expect(out.rung).toBe(0);
    expect(out.reason).toBe('top');
    expect(out.mem.walks).toBe(1);
  });

  it('too few walks keeps the remembered rung', () => {
    const mem = { ...DEFAULT_MEMORY, rung: 2, walks: 4, steppedAt: now - 30 * DAY };
    const out = planWalkStart(mem, now);
    expect(out.rung).toBe(2);
    expect(out.reason).toBe('remembered');
    expect(out.mem.walks).toBe(5);
    expect(mem.walks).toBe(4); // pure
  });

  it('enough walks and days retries one rung higher', () => {
    const mem = { ...DEFAULT_MEMORY, rung: 2, walks: 5, steppedAt: now - 8 * DAY };
    const out = planWalkStart(mem, now);
    expect(out.rung).toBe(1);
    expect(out.reason).toBe('retry');
    expect(out.mem.rung).toBe(1);
    expect(out.mem.retrying).toBe(true);
    expect(mem.rung).toBe(2); // pure
  });

  it('not enough days keeps the remembered rung', () => {
    const mem = { ...DEFAULT_MEMORY, rung: 2, walks: 5, steppedAt: now - 3 * DAY };
    const out = planWalkStart(mem, now);
    expect(out.rung).toBe(2);
    expect(out.reason).toBe('remembered');
  });

  it('waitDays sets how long to wait', () => {
    const mem = { ...DEFAULT_MEMORY, rung: 2, walks: 9, steppedAt: now - 10 * DAY, waitDays: 14 };
    expect(planWalkStart(mem, now).rung).toBe(2);
    expect(planWalkStart({ ...mem, steppedAt: now - 14 * DAY }, now).rung).toBe(1);
  });

  it('retrying on entry means the retry was never judged: retry the same rung again', () => {
    const mem = { rung: 1, steppedAt: now - DAY, walks: 1, waitDays: 28, retrying: true };
    const out = planWalkStart(mem, now);
    expect(out.rung).toBe(1);
    expect(out.reason).toBe('retry');
    expect(out.mem).toEqual({ rung: 1, steppedAt: now - DAY, walks: 2, waitDays: 28, retrying: true });
    expect(mem.walks).toBe(1); // pure
  });

  it('an unjudged retry walk does not climb a second rung either', () => {
    const mem = { rung: 2, steppedAt: now - 30 * DAY, walks: 9, waitDays: 7, retrying: true };
    const out = planWalkStart(mem, now);
    expect(out.rung).toBe(2);
    expect(out.reason).toBe('retry');
  });

  it('a held retry does not climb again straight away', () => {
    let mem = { ...DEFAULT_MEMORY, rung: 3, walks: 5, steppedAt: now - 8 * DAY };
    let out = planWalkStart(mem, now);
    expect(out.rung).toBe(2);
    out = planWalkStart(noteRetryHeld(out.mem), now + DAY);
    expect(out.rung).toBe(2);
    expect(out.reason).toBe('remembered');
  });

  it('a steppedAt in the future is clamped to now, so the wait starts now', () => {
    const mem = { ...DEFAULT_MEMORY, rung: 2, walks: 5, steppedAt: now + 30 * DAY };
    const out = planWalkStart(mem, now);
    expect(out.rung).toBe(2);
    expect(out.reason).toBe('remembered');
    expect(out.mem.steppedAt).toBe(now);
    expect(mem.steppedAt).toBe(now + 30 * DAY); // pure
  });
});

describe('noteRetryHeld', () => {
  it('ends the retry and resets waitDays to 7', () => {
    const mem = { rung: 1, steppedAt: 5, walks: 1, waitDays: 28, retrying: true };
    expect(noteRetryHeld(mem)).toEqual({ rung: 1, steppedAt: 5, walks: 1, waitDays: 7, retrying: false });
    expect(mem.retrying).toBe(true); // pure
  });
});

describe('noteStepDown', () => {
  const now = 1_800_000_000_000;

  it('records the new rung and restarts the clock', () => {
    const mem = { rung: 0, steppedAt: 0, walks: 9, waitDays: 14, retrying: false };
    const out = noteStepDown(mem, 1, now);
    expect(out).toEqual({ rung: 1, steppedAt: now, walks: 0, waitDays: 14, retrying: false });
    expect(mem.rung).toBe(0); // pure
  });

  it('during a retry doubles waitDays, capped at 56', () => {
    const a = noteStepDown({ rung: 1, steppedAt: 0, walks: 1, waitDays: 7, retrying: true }, 2, now);
    expect(a.waitDays).toBe(14);
    expect(a.retrying).toBe(false);
    const b = noteStepDown({ rung: 1, steppedAt: 0, walks: 1, waitDays: 40, retrying: true }, 2, now);
    expect(b.waitDays).toBe(56);
  });
});
