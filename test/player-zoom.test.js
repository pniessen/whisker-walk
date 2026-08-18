import { describe, it, expect } from 'vitest';
import {
  zoomState,
  zoomTuning,
  BASE_ZOOM_TUNING,
  ZOOM_CHARGE_TIME,
  ZOOM_HOLD_TIME,
  LONG_ZOOM_CHARGE_TIME,
  LONG_ZOOM_HOLD_TIME,
} from '../src/player.js';

const RUN = { active: true, stalking: false, speedRatio: 1 };
describe('zoomState', () => {
  it('charges to zooming after 1.5s of full-speed running', () => {
    let s = { charging: false, zooming: false, time: 0 };
    s = zoomState(s, 1.0, RUN);
    expect(s.zooming).toBe(false);
    s = zoomState(s, 0.6, RUN);
    expect(s.zooming).toBe(true);
  });
  it('resets on stalking or stopping', () => {
    let s = zoomState({ charging: true, zooming: true, time: 2 }, 0.1, { ...RUN, stalking: true });
    expect(s.zooming).toBe(false);
    expect(s.time).toBe(0);
    s = zoomState({ charging: true, zooming: true, time: 2 }, 0.1, { ...RUN, active: false });
    expect(s.zooming).toBe(false);
  });
  it('resets instantly when frozen (speedFactor 0), even with residual speedRatio', () => {
    // Regression: a freeze site (e.g. puddle balk) that sets freezeTime
    // without calling player.halt() leaves residual velocity, which can
    // spike speedRatio past 0.85 via the pace*speedFactor||1 fallback.
    // speedFactor must gate zoomState directly so this can't read as
    // "still running".
    const s = zoomState(
      { charging: true, zooming: true, time: 2 },
      0.1,
      { active: true, stalking: false, speedRatio: 2, speedFactor: 0 }
    );
    expect(s.zooming).toBe(false);
    expect(s.time).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// v18 "Cat Skills" — Long Zoomies
// ---------------------------------------------------------------------------

describe('zoomState tuning parameters', () => {
  it('baselines at exactly the shipped 1.5s charge / instant reset', () => {
    expect(ZOOM_CHARGE_TIME).toBe(1.5);
    expect(ZOOM_HOLD_TIME).toBe(0);
    expect(BASE_ZOOM_TUNING).toEqual({ chargeTime: 1.5, holdTime: 0 });
  });

  it('an untuned call is identical to a call passing the baseline explicitly', () => {
    const seq = [0.5, 0.5, 0.6, 0.2];
    let a = { charging: false, zooming: false, time: 0 };
    let b = { charging: false, zooming: false, time: 0 };
    for (const dt of seq) {
      a = zoomState(a, dt, RUN);
      b = zoomState(b, dt, { ...RUN, ...BASE_ZOOM_TUNING });
      expect(a.zooming).toBe(b.zooming);
      expect(a.time).toBe(b.time);
    }
    expect(a.zooming).toBe(true);
  });

  it('with holdTime 0, the first non-running frame still wipes the charge', () => {
    // The old unconditional reset, preserved exactly — a jittery input must
    // not be able to bank partial charge on the no-skills path.
    const held = zoomState({ charging: true, zooming: true, time: 5, idle: 0 }, 0.016, { ...RUN, active: false });
    expect(held).toEqual({ charging: false, zooming: false, time: 0, idle: 0, banked: false });
  });

  it('reaches zooming sooner at the Long Zoomies charge time', () => {
    const long = { ...RUN, chargeTime: LONG_ZOOM_CHARGE_TIME, holdTime: LONG_ZOOM_HOLD_TIME };
    let s = zoomState({ charging: false, zooming: false, time: 0 }, 1.0, long);
    expect(s.zooming).toBe(true); // 1.0 >= 0.9, where the baseline needs 1.5
    s = zoomState({ charging: false, zooming: false, time: 0 }, 1.0, RUN);
    expect(s.zooming).toBe(false);
  });

  it('banks the charge through a 2.5s interruption, then wipes it', () => {
    const long = { chargeTime: LONG_ZOOM_CHARGE_TIME, holdTime: LONG_ZOOM_HOLD_TIME };
    const zooming = { charging: false, zooming: true, time: 3, idle: 0 };
    // 2.0s of not running: the zoom itself is OFF (main.js drives the 77° FOV
    // and the sparkle trail off player.zooming — a stopped cat must not keep
    // wearing them), but the charge is banked.
    let s = zoomState(zooming, 2.0, { ...RUN, active: false, ...long });
    expect(s.zooming).toBe(false);
    expect(s.banked).toBe(true);
    expect(s.time).toBe(3);
    expect(s.idle).toBe(2.0);
    // Resuming inside the window snaps straight back to zooming — no
    // re-charge — and clears the idle window rather than leaving it banked.
    const resumed = zoomState(s, 0.1, { ...RUN, ...long });
    expect(resumed.zooming).toBe(true);
    expect(resumed.idle).toBe(0);
    expect(resumed.banked).toBe(false);
    // Past 2.5s of not running it goes for good.
    s = zoomState(s, 0.6, { ...RUN, active: false, ...long });
    expect(s).toEqual({ charging: false, zooming: false, time: 0, idle: 0, banked: false });
    // ...and after that a resume has to charge from scratch.
    expect(zoomState(s, 0.1, { ...RUN, ...long }).zooming).toBe(false);
  });

  it('banks through a freeze and a stalk, not just through letting go', () => {
    const long = { chargeTime: LONG_ZOOM_CHARGE_TIME, holdTime: LONG_ZOOM_HOLD_TIME };
    const zooming = { charging: false, zooming: true, time: 3, idle: 0 };
    for (const interruption of [{ stalking: true }, { speedFactor: 0 }, { speedRatio: 0.1 }]) {
      const s = zoomState(zooming, 0.5, { ...RUN, ...long, ...interruption });
      expect(s.zooming).toBe(false);
      expect(s.banked).toBe(true);
      expect(s.idle).toBe(0.5);
      expect(zoomState(s, 0.1, { ...RUN, ...long }).zooming).toBe(true);
    }
  });

  it('never banks a charge on the no-skills path, however brief the stop', () => {
    let s = { charging: false, zooming: false, time: 0 };
    for (const dt of [1.0, 0.6]) s = zoomState(s, dt, RUN);
    expect(s.zooming).toBe(true);
    s = zoomState(s, 0.001, { ...RUN, active: false }); // the briefest possible stop
    expect(s.banked).toBe(false);
    expect(zoomState(s, 1.0, RUN).zooming).toBe(false); // must re-charge in full
  });

  it('degrades a NaN or negative tuning to the baseline instead of deleting the zoomies', () => {
    // `time >= NaN` is false forever, which would silently make zoomies
    // unreachable; a negative holdTime would reset every frame.
    for (const bad of [NaN, -1, undefined, null, '1.5', Infinity]) {
      let s = { charging: false, zooming: false, time: 0 };
      s = zoomState(s, 1.0, { ...RUN, chargeTime: bad, holdTime: bad });
      expect(s.zooming).toBe(false);
      s = zoomState(s, 0.6, { ...RUN, chargeTime: bad, holdTime: bad });
      expect(s.zooming).toBe(true); // 1.6 >= the baseline 1.5
    }
  });
});

describe('zoomTuning', () => {
  it('is the baseline for a save without Long Zoomies', () => {
    expect(zoomTuning({})).toBe(BASE_ZOOM_TUNING);
    // Its feat is 3 daily-race finishes (feats.race).
    expect(zoomTuning({ feats: { race: 2 } })).toBe(BASE_ZOOM_TUNING);
  });

  it('never throws on a hostile or absent save', () => {
    for (const s of [undefined, null, 0, 'x', [], { skills: 'long-zoomies' }, { feats: { race: '9e99' } }]) {
      expect(zoomTuning(s)).toBe(BASE_ZOOM_TUNING);
    }
  });

  it('lifts both knobs once the skill is earned, by predicate or by persisted id', () => {
    for (const s of [{ feats: { race: 3 } }, { skills: ['long-zoomies'] }]) {
      expect(zoomTuning(s)).toEqual({ chargeTime: LONG_ZOOM_CHARGE_TIME, holdTime: LONG_ZOOM_HOLD_TIME });
      expect(zoomTuning(s).chargeTime).toBeLessThan(ZOOM_CHARGE_TIME); // "recharges faster"
      expect(zoomTuning(s).holdTime).toBe(2.5);                        // "runs 2.5s"
    }
  });
});
