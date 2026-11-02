import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createWaterState, stepWaterState, shakeProgress,
  WADE_SPEED, SHAKE_TIME, SHAKE_PACE, SHAKE_AFTER_WADE, SHAKE_AFTER_SWIM, DEEP_HYST, DRY_HYST,
} from '../src/waterstate.js';

// ---------------------------------------------------------------------------
// The water state machine: dry, wading or swimming, read from position alone,
// with hysteresis at the band line, the waterline and every deck edge so a
// cat on a line never flickers between looks.
// ---------------------------------------------------------------------------

// Same headless stub as test/water.test.js, for building the Seaside.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build: buildSeaside } = await import('../src/world/seaside.js');
const SEASIDE = buildSeaside(new THREE.Scene());

const P = { id: 'p', kind: 'circle', x: 0, z: 0, r: 5, shallow: 1.2 };
const WATERS = [P];
const DT = 1 / 60;

// Steps `st` at (x, z) for `seconds`, returning the steps on which shook was set.
function hold(st, waters, x, z, seconds) {
  let shook = 0;
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    stepWaterState(st, waters, x, z, DT);
    if (st.shook) shook++;
  }
  return shook;
}

describe('the constants', () => {
  it('are the plan\'s numbers', () => {
    expect(WADE_SPEED).toBe(0.8);
    expect(SHAKE_TIME).toBe(0.8);
    expect(SHAKE_PACE).toBe(0.6);
    expect(SHAKE_AFTER_WADE).toBe(3);
    expect(SHAKE_AFTER_SWIM).toBe(1.0); // Polish 2: was 0.5
    expect(DEEP_HYST).toBe(0.1);
    expect(DRY_HYST).toBe(0.1);
  });

  it('starts dry', () => {
    expect(createWaterState()).toEqual({
      mode: 'dry', wetTime: 0, swam: false, shake: 0, entered: false, shook: false,
      sink: 0, fxClock: 0, ringClock: 0, entryPending: false, placed: true,
    });
  });
});

describe('stepWaterState', () => {
  it('dry → wade → swim → wade → dry, from position alone', () => {
    const st = createWaterState();
    const seq = [];
    const at = [];
    const step = (x) => {
      stepWaterState(st, WATERS, x, 0, DT);
      if (seq[seq.length - 1] !== st.mode) { seq.push(st.mode); at.push(x); }
    };
    for (let i = 0; i <= 140; i++) step(7 - i * 0.05);
    for (let i = 0; i <= 140; i++) step(i * 0.05);
    expect(seq).toEqual(['dry', 'wade', 'swim', 'wade', 'dry']);
    expect(at[1]).toBeLessThan(5);
    // swim past the band line (~3.79: the chord midpoint 4.994 less 1.2)
    expect(at[2]).toBeLessThan(3.8);
    expect(at[3]).toBeGreaterThan(3.8);
    expect(at[4]).toBeGreaterThanOrEqual(5.1 - 1e-6);
  });

  it('no flicker at the band line', () => {
    const st = createWaterState();
    stepWaterState(st, WATERS, 3.85, 0, DT);
    const first = st.mode;
    expect(first).not.toBe('dry');
    for (let i = 0; i < 600; i++) {
      stepWaterState(st, WATERS, i % 2 ? 3.85 : 3.75, 0, DT);
      expect(st.mode).toBe(first);
    }
  });

  it('no flicker at the waterline', () => {
    const st = createWaterState();
    let entries = 0;
    for (let i = 0; i < 600; i++) {
      stepWaterState(st, WATERS, i % 2 ? 4.95 : 5.05, 0, DT);
      if (st.entered) entries++;
      if (i > 0) expect(st.mode).not.toBe('dry');
    }
    expect(entries).toBe(1);
  });

  it('no flicker at a deck edge', () => {
    const waters = SEASIDE.waters;
    const st = createWaterState();
    hold(st, waters, 30, -6, 1); // swimming off the pier's north edge
    expect(st.mode).toBe('swim');
    let changes = 0;
    let prev = st.mode;
    for (let t = 0; t < 3; t += DT) {
      const i = Math.round(t / DT);
      stepWaterState(st, waters, 30, i % 2 ? -8.45 : -8.55, DT);
      if (st.mode !== prev) { changes++; prev = st.mode; }
      expect(st.shook).toBe(false);
    }
    expect(changes).toBeLessThanOrEqual(1);
  });

  it('a pier-edge hop never shakes', () => {
    const waters = SEASIDE.waters;
    const st = createWaterState();
    for (let t = 0; t < 3; t += DT) {
      const i = Math.round(t / DT);
      stepWaterState(st, waters, 30, i % 2 ? -8.3 : -8.7, DT);
      expect(st.shook).toBe(false);
    }
  });

  it('shakes after a swim, once', () => {
    const st = createWaterState();
    hold(st, WATERS, 0, 0, 1.5); // past SHAKE_AFTER_SWIM (1 s)
    expect(st.mode).toBe('swim');
    stepWaterState(st, WATERS, 6, 0, DT);
    expect(st.mode).toBe('dry');
    expect(st.shook).toBe(true);
    expect(st.shake).toBeCloseTo(SHAKE_TIME, 9);
    expect(shakeProgress(st)).toBeCloseTo(0, 9);
    let shookAgain = 0;
    for (let i = 0; i < 47; i++) {
      stepWaterState(st, WATERS, 6, 0, DT);
      if (st.shook) shookAgain++;
      expect(st.shake).toBeGreaterThan(0);
      expect(shakeProgress(st)).toBeGreaterThan(0);
    }
    stepWaterState(st, WATERS, 6, 0, DT); // 48 frames: 0.8 s
    expect(st.shake).toBeCloseTo(0, 9);
    hold(st, WATERS, 6, 0, 1);
    expect(st.shake).toBe(0);
    expect(shakeProgress(st)).toBe(0);
    expect(shookAgain).toBe(0);
  });

  // Polish 2: a dip of under a second off a pier or a bank no longer ends in
  // a shake; a real swim, a second or more, always does.
  it('a dip of under SHAKE_AFTER_SWIM in deep water never shakes', () => {
    const st = createWaterState();
    hold(st, WATERS, 0, 0, 0.9);
    expect(st.mode).toBe('swim');
    expect(hold(st, WATERS, 6, 0, 0.5)).toBe(0);
  });

  it('every swim of SHAKE_AFTER_SWIM or longer shakes on the way out', () => {
    for (const secs of [SHAKE_AFTER_SWIM + 2 * DT, 1.5, 4, 20]) {
      const st = createWaterState();
      hold(st, WATERS, 0, 0, secs);
      expect(st.mode).toBe('swim');
      expect(hold(st, WATERS, 6, 0, 0.5)).toBe(1);
    }
  });

  it('no shake after a quick paddle in the surf', () => {
    const st = createWaterState();
    let shook = 0;
    shook += hold(st, WATERS, 4.4, 0, 2.9);
    expect(st.mode).toBe('wade');
    shook += hold(st, WATERS, 6, 0, 0.5);
    expect(st.mode).toBe('dry');
    shook += hold(st, WATERS, 4.4, 0, 2.9);
    shook += hold(st, WATERS, 6, 0, 0.5);
    expect(shook).toBe(0);
  });

  it('shakes after 3 s of wading', () => {
    const st = createWaterState();
    hold(st, WATERS, 4.4, 0, 3.1);
    expect(st.mode).toBe('wade');
    expect(hold(st, WATERS, 6, 0, 0.5)).toBe(1);
  });

  it('climbing a perch straight from the water never shakes', () => {
    const st = createWaterState();
    hold(st, WATERS, 0, 0, 5);
    expect(st.mode).toBe('swim');
    stepWaterState(st, null, 0, 0, DT);
    expect(st.mode).toBe('dry');
    expect(st.shook).toBe(false);
    expect(st.shake).toBe(0);
    stepWaterState(st, [], 0, 0, DT);
    expect(st.mode).toBe('dry');
    expect(st.shake).toBe(0);
  });
});
