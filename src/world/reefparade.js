// =============================================================================
// THE REEF'S HOUSEWARMING PARADE: A PURE FUNCTION OF ONE START TIME (milestone R5, mission step 7). 20 seconds: the manta glides past high over the new
// home, Sela the turtle swims the other way low and slow, and a shoal of small fish weaves between them while the coral glows. No THREE, no clock, no random
// number: paradeAt(k) takes the seconds since the start (the walk's own clock minus T0) and answers where everyone is, so two cats in a room who start
// from the same T0 see the same parade whatever their frame rates, and a late joiner just starts at the right second (world/reefhouse.js carries it out).
// The pay moment is `payAt`: the manta is over the stage. North is -z; heights are metres over the seabed.
// =============================================================================

import { STAGE } from './reefwing.js';

export const PARADE = Object.freeze({ secs: 20, payAt: 10.5, fish: 18, mantaY: 3.6, turtleY: 1.1, shoalY: 2.0 });

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const smooth = (t) => { const k = clamp01(t); return k * k * (3 - 2 * k); };
const lerp = (a, b, t) => a + (b - a) * t;

// the three lines: each runs from a start to an end across the stage, at the time its creature is over the stage's middle
const MANTA = Object.freeze({ from: Object.freeze({ x: STAGE.x - 28, z: STAGE.z - 8 }), to: Object.freeze({ x: STAGE.x + 26, z: STAGE.z + 2 }), t0: 0.8, t1: 19.2 });
const TURTLE = Object.freeze({ from: Object.freeze({ x: STAGE.x + 22, z: STAGE.z + 7 }), to: Object.freeze({ x: STAGE.x - 24, z: STAGE.z + 5 }), t0: 1.5, t1: 19 });
const SHOAL = Object.freeze({ from: Object.freeze({ x: STAGE.x - 26, z: STAGE.z + 9 }), to: Object.freeze({ x: STAGE.x + 26, z: STAGE.z - 7 }), t0: 4, t1: 19.6 });

function along(line, k) {
  const t = clamp01((k - line.t0) / (line.t1 - line.t0));
  // a steady glide (no easing: a creature does not speed up to be seen)
  return { x: lerp(line.from.x, line.to.x, t), z: lerp(line.from.z, line.to.z, t), t, yaw: Math.atan2(line.to.x - line.from.x, line.to.z - line.from.z) };
}
const FADE = 1.6; // seconds a creature takes to fade in and out at the edges (the fog hides the rest)
const present = (line, k) => smooth((k - line.t0 + 0.6) / FADE) * smooth((line.t1 + 0.6 - k) / FADE);

// parade(k) -> { active, k, glow, pay, manta: {x,y,z,yaw,flap,show}, turtle: {x,y,z,yaw,paddle,show}, shoal: [{x,y,z,yaw,show}] }
// `active` is false before the start and after PARADE.secs. Everything is finite for any input (a NaN or a negative k is "not started").
export function paradeAt(kRaw) {
  const k = Number.isFinite(kRaw) ? kRaw : -1;
  const active = k >= 0 && k <= PARADE.secs;
  if (!active) return { active: false, k: Math.min(Math.max(k, -1), PARADE.secs + 1), glow: k > PARADE.secs ? 1 : 0, pay: k >= PARADE.payAt, manta: null, turtle: null, shoal: [] };
  const m = along(MANTA, k);
  const manta = {
    x: m.x, z: m.z, y: PARADE.mantaY + 0.35 * Math.sin(k * 0.9), yaw: m.yaw, flap: Math.sin(k * 2.2) * 0.35, show: present(MANTA, k),
  };
  const tu = along(TURTLE, k);
  const turtle = {
    x: tu.x, z: tu.z + 0.5 * Math.sin(k * 0.7), y: PARADE.turtleY + 0.15 * Math.sin(k * 1.1), yaw: tu.yaw, paddle: Math.sin(k * 2.6) * 0.5, show: present(TURTLE, k),
  };
  const lead = along(SHOAL, k);
  const show = present(SHOAL, k);
  const shoal = [];
  for (let i = 0; i < PARADE.fish; i++) {
    const ph = i * 2.399963; // the golden angle: a loose cloud, the same every time
    const ring = 0.8 + 2.1 * ((i * 0.618) % 1);
    const wob = k * 1.3 + ph;
    shoal.push({
      x: lead.x + Math.cos(ph) * ring * 1.4 + Math.sin(wob) * 0.5,
      z: lead.z + Math.sin(ph) * ring + Math.cos(wob * 0.8) * 0.4,
      y: PARADE.shoalY + Math.sin(ph * 1.7) * 0.7 + 0.25 * Math.sin(wob),
      yaw: lead.yaw + 0.25 * Math.sin(wob),
      show,
    });
  }
  return { active: true, k, glow: smooth(k / 3), pay: k >= PARADE.payAt, manta, turtle, shoal };
}

// where the manta is when it is over the stage (the pay moment's picture): a number for the tests and the camera-free checks
export const mantaOverStageAt = () => {
  let best = 0;
  let bd = Infinity;
  for (let k = 0; k <= PARADE.secs; k += 0.05) {
    const m = paradeAt(k).manta;
    const d = Math.hypot(m.x - STAGE.x, m.z - STAGE.z);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
};
