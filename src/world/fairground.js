// =============================================================================
// THE FAIRGROUND: BEAUTY ROUND (2026-11-27), the ground round the rides read close up. A worn earth footing under every bunting pole, and scuffs of bare trodden earth where the queues stand. Flat soft pieces only (no collider, no
// word, no motion), pushed onto the fair's EXISTING non-casting list (the fence's: 'fairFence', drawn on both faces): no mesh, no draw and no caster of its own (+240 triangles net). Its own seeded stream (mulberry32); no clock, no Math.random, no text.
// =============================================================================

import { mulberry32 } from '../rng.js';
import { lid } from './fairedge.js';

const EARTH = Object.freeze([0x9a8a52, 0x8a7a48, 0xa8955a]); // trodden earth, a shade either way
const FOOT = 0x7a6640;
const Y = 0.04; // a hair over the lawn: nothing under it can show through

/**
 * The plan: pure and seeded. `ctx` = { poles: [[x, z]], ok(x, z, margin) -> bool for open, trodden ground }.
 * Returns { feet, scuffs }. (tests read it without a renderer)
 */
export function groundPlan(ctx) {
  const rng = mulberry32(0x66677264); // 'fgrd'
  const scuffs = []; // bare patches where the queues stand
  for (let tries = 0; scuffs.length < 30 && tries++ < 9000;) {
    const x = -52 + rng() * 72; const z = -52 + rng() * 104;
    if (ctx.ok(x, z, 0.5)) scuffs.push({ x, z, r: 0.35 + rng() * 0.45, yaw: rng() * 6, hex: EARTH[scuffs.length % 3] });
  }
  return { feet: ctx.poles, scuffs };
}

/** Draws the plan onto `P` (a list of the fair's non-casting pieces). */
export function drawGround(P, plan) {
  plan.feet.forEach(([x, z], i) => lid(P, 0.3, Y, FOOT, 6, x, z, i)); // a flat six-sided pad (4 triangles)
  for (const s of plan.scuffs) lid(P, s.r, Y, s.hex, 6, s.x, s.z, s.yaw);
}
