import { describe, it, expect } from 'vitest';
import { zoomState } from '../src/player.js';

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
