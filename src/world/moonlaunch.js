// =============================================================================
// THE MOON'S ROCKET LAUNCH: THE PURE FLIGHT PLAN (milestone 6). No THREE, no canvas, no clock, no random number. The whole launch is a
// pure function of ONE number, the seconds since T0 (the moment the button was pressed, or the room's launch time): every device that
// agrees on T0 draws the same rocket at the same height, with no per-frame messages (the Fairground's rule: world/fairsim.js).
//
//   normal      T-5 s: a countdown, a number a second, the gantry's arm swings back over the last second; ignition at 5 s; the rocket
//               rises on a = 2.4 m/s2 for 5 s (30 m, 12 m/s), then holds 12 m/s; it leaves the picture at 20 s and the plume's last
//               glow is a fading dot until 30 s; a fresh rocket is rolled out on the pad at 38 s and the desk is "Ready" again at 40 s.
//   reduced     (the child's reduced-motion setting) a 3 s countdown, no shake, no smoke, no camera tilt, the rocket rises smoothly and is
//               gone by 12 s: the pad is ready again at once.
//
// THE FLASH RULE (photosensitivity): nothing here changes faster than 3 times a second. The plume's glow eases in over 0.6 s and fades
// over many seconds; its shimmer is a 2 Hz ripple of 4 percent. test/moonlaunch.test.js samples the curve at 60 Hz and counts.
// =============================================================================

export const COUNT = Object.freeze({ normal: 5, reduced: 3 });
export const TOTAL = Object.freeze({ normal: 40, reduced: 12 }); // seconds until the pad is Ready again
export const ACCEL = 2.4; // m/s2
export const BURN_SECS = 5; // the rise on constant acceleration
export const CRUISE = ACCEL * BURN_SECS; // 12 m/s afterwards
export const GONE_Y = 150; // m: above this the rocket is out of the picture (a fading dot is all that is left)
export const FADE_END = 30; // s: the dot's last light
export const ROLLOUT = Object.freeze({ at: 38, secs: 2 });
export const REDUCED_RISE = Object.freeze({ secs: 9, to: 150 });
export const PLUME = Object.freeze({ ease: 0.6, hold: 12, fade: 12, peak: 0.85, ripple: 0.04, rippleHz: 2 });
export const TILT = Object.freeze({ up: 2, hold: 6, down: 8, max: 0.3 }); // seconds after ignition; radians at most
export const REPLY_AFTER = 40; // s after T0: Earth's answer is ready (at once when the rocket was launched on an earlier walk)
export const DEMO_EVERY = 300; // s of the room's clock: the pad launches by itself
export const DEMO_SIREN = 10; // s of siren before a demo's countdown begins
export const SMOKE = Object.freeze({ high: 150, low: 40, lite: 0, span: 9, life: 6, reach: 3.4 });
export const GANTRY_SWING = Object.freeze({ at: 4, secs: 1 }); // seconds after T0 (the last second of the countdown)

const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const mode = (reduced) => (reduced ? 'reduced' : 'normal');
export const countOf = (reduced = false) => COUNT[mode(reduced)];
export const totalOf = (reduced = false) => TOTAL[mode(reduced)];

// The rocket's height over the pad `t5` seconds after ignition (t5 >= 0).
export function riseY(t5, reduced = false) {
  if (t5 <= 0) return 0;
  if (reduced) {
    const k = Math.min(1, t5 / REDUCED_RISE.secs);
    return REDUCED_RISE.to * k * k;
  }
  if (t5 <= BURN_SECS) return 0.5 * ACCEL * t5 * t5;
  return 0.5 * ACCEL * BURN_SECS * BURN_SECS + CRUISE * (t5 - BURN_SECS);
}

// The glow of the plume at `t` seconds after T0, 0..1: eased in over 0.6 s from ignition, held, faded away, with a gentle 2 Hz ripple.
export function plumeOpacity(t, reduced = false) {
  const c = countOf(reduced);
  const t5 = t - c;
  if (t5 <= 0) return 0;
  const hold = reduced ? 6 : PLUME.hold;
  const fade = reduced ? 3 : PLUME.fade;
  const env = smooth(t5 / PLUME.ease) * (1 - smooth((t5 - hold) / fade));
  const ripple = reduced ? 0 : PLUME.ripple * Math.sin(2 * Math.PI * PLUME.rippleHz * t5);
  return Math.max(0, Math.min(1, PLUME.peak * env * (1 + ripple)));
}

// How far the camera tilts up (radians) `t` seconds after T0: up over 2 s from ignition, held, back down by 8 s. None in reduced motion.
export function cameraTilt(t, reduced = false) {
  if (reduced) return 0;
  const t5 = t - COUNT.normal;
  if (t5 <= 0 || t5 >= TILT.down) return 0;
  return TILT.max * smooth(t5 / TILT.up) * (1 - smooth((t5 - TILT.hold) / (TILT.down - TILT.hold)));
}

// launchPose(t, reduced) -> the whole picture at `t` seconds after T0 (a negative t is "not yet": the pad is Ready).
// { phase: 'ready' | 'count' | 'burn' | 'climb' | 'fade' | 'reset', count (the number shown: 5..1, else 0), tick (which second of the count), rocketY,
//   rocketOn, rocketScale, gantry (0 closed .. 1 swung away), plume, plumeY (the glow's height), smoke (is it puffing), tilt, dot (0..1), over }
export function launchPose(t, reduced = false) {
  const c = countOf(reduced);
  const total = totalOf(reduced);
  const pose = { phase: 'ready', count: 0, tick: -1, rocketY: 0, rocketOn: true, rocketScale: 1, gantry: 0, plume: 0, plumeY: 0, smoke: false, tilt: 0, dot: 0, over: false };
  if (!(t >= 0)) return pose;
  if (t >= total) { pose.over = true; return pose; }
  const t5 = t - c;
  if (t < c) {
    pose.phase = 'count';
    pose.tick = Math.floor(t);
    pose.count = c - pose.tick;
    pose.gantry = smooth((t - (c - GANTRY_SWING.secs)) / GANTRY_SWING.secs);
    return pose;
  }
  pose.gantry = 1;
  const y = riseY(t5, reduced);
  pose.rocketY = y;
  pose.plume = plumeOpacity(t, reduced);
  pose.plumeY = y;
  pose.tilt = cameraTilt(t, reduced);
  pose.smoke = !reduced && t5 < SMOKE.span + SMOKE.life;
  if (reduced) {
    pose.phase = y >= GONE_Y ? 'reset' : 'climb';
    pose.rocketOn = y < GONE_Y;
    return pose;
  }
  pose.phase = t5 < BURN_SECS ? 'burn' : y < GONE_Y ? 'climb' : 'fade';
  pose.rocketOn = y < GONE_Y;
  if (!pose.rocketOn) { const gone = c + BURN_SECS + (GONE_Y - 0.5 * ACCEL * BURN_SECS * BURN_SECS) / CRUISE; pose.dot = 1 - smooth((t - gone) / (FADE_END - gone)); }
  if (t >= ROLLOUT.at) {
    // a fresh rocket rolls out onto the pad
    pose.phase = 'reset';
    pose.rocketOn = true;
    pose.rocketY = 0;
    pose.rocketScale = smooth((t - ROLLOUT.at) / ROLLOUT.secs);
    pose.plume = 0;
    pose.dot = 0;
  }
  return pose;
}

// ---- the countdown: a number a second, each fired ONCE ---------------------------------------------------------------------

// createCountdown(reduced) -> { advance(t) -> events, reset(), fired }: `t` is seconds after T0; an event is { kind: 'tick', n } (n = 5..1, once as
// the second begins) or { kind: 'go' } (ignition). A frame that jumps several seconds fires each one it passed, in order; the same second is never
// fired twice, whatever the frame rate, a repeated time, or a time that goes backwards.
export function createCountdown(reduced = false) {
  const c = countOf(reduced);
  const fired = new Set();
  return {
    get fired() { return [...fired]; },
    reset() { fired.clear(); },
    advance(t) {
      const out = [];
      if (!(t >= 0)) return out;
      for (let i = 0; i < c; i++) if (t >= i && !fired.has(`t${i}`)) { fired.add(`t${i}`); out.push({ kind: 'tick', n: c - i }); }
      if (t >= c && !fired.has('go')) { fired.add('go'); out.push({ kind: 'go' }); }
      return out;
    },
  };
}

// ---- the clock-launched demo: every 5 minutes of room time the pad launches by itself ----------------------------------------------------

// demoState(clock) -> { cycle, into, siren, elapsed }: `clock` is the room's time in seconds. A cycle is 300 s; in its first 10 s the siren sounds
// (elapsed < 0), then the demo's T0 comes (elapsed 0) and the flight runs on `elapsed` like any other launch. Pure.
export function demoState(clock) {
  const c = Number.isFinite(clock) && clock >= 0 ? clock : 0;
  const cycle = Math.floor(c / DEMO_EVERY);
  const into = c - cycle * DEMO_EVERY;
  return { cycle, into, siren: into < DEMO_SIREN, elapsed: into - DEMO_SIREN };
}

// replyReady(sinceLaunch): Earth's answer is ready when 40 s have passed since this walk's launch, or at once when the rocket was launched on an earlier walk (null).
export const replyReady = (sinceLaunch) => sinceLaunch === null || sinceLaunch === undefined || sinceLaunch >= REPLY_AFTER;

// ---- the smoke pool: a deterministic function of the puff's number and the time -----------------------------------------------------------

// smokeCount(lite, low, reduced): how many puffs the pool holds on this tier.
export const smokeCount = ({ lite = false, low = false, reduced = false } = {}) => (reduced || lite ? SMOKE.lite : low ? SMOKE.low : SMOKE.high);

// smokePuff(i, n, t) -> { alive, x, y, z, size, alpha } relative to the pad's middle, for puff i of n, `t` seconds after T0. Puffs are born one after
// another over SMOKE.span seconds from ignition, spread out along the ground (a golden angle apart) and rise slowly; each lives SMOKE.life seconds.
export function smokePuff(i, n, t, reduced = false) {
  const none = { alive: false, x: 0, y: 0, z: 0, size: 0, alpha: 0 };
  if (reduced || !(n > 0) || i < 0 || i >= n) return none;
  const born = COUNT.normal + (i / n) * SMOKE.span;
  const age = t - born;
  if (!(age >= 0) || age >= SMOKE.life) return none;
  const k = age / SMOKE.life;
  const a = i * 2.399963 + 0.4;
  const r = 0.8 + SMOKE.reach * Math.sqrt(k) * (0.7 + 0.3 * Math.abs(Math.sin(i * 1.7)));
  return {
    alive: true,
    x: Math.cos(a) * r,
    z: Math.sin(a) * r,
    y: 0.4 + 1.6 * k * (0.6 + 0.4 * Math.abs(Math.cos(i * 2.9))),
    size: 0.9 + 2.4 * k,
    alpha: 0.5 * smooth(k / 0.12) * (1 - smooth((k - 0.4) / 0.6)),
  };
}

// demoT0(clock) -> the room-clock second of the current cycle's T0 (the demo's countdown counts down to it).
export const demoT0 = (clock) => clock - demoState(clock).elapsed;

// elapsedFor(clockNow, clockAtT0): the seconds since T0 from two readings of the SAME clock (the room's, or the walk's): what launchPose takes.
export const elapsedFor = (clockNow, clockAtT0) => clockNow - clockAtT0;
