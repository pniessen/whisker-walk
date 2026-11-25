// =============================================================================
// THE MOON'S WRITTEN GUIDE (guide cues): THE PURE PART. No THREE, no DOM, no clock, no random number, no save. A child who looks at Pip's picture
// and the gold ring can still ask "what am I meant to do?": this file says it in words, and says where, from the same goal the ring and the light
// column stand on (world/moonbaselive.js goalPoint(), read through base.goal()), so the words, the arrow and the beacon can never disagree.
//
//   goalWords(info)      the goal line: WHAT and WHERE, one or two short sentences ("Find a power cell (0 of 2): on the tall rocks, north of the lander.")
//   chipWords(goal, job) the few words beside Pip's picture ("Pip needs a power cell")
//   atWords(x, z)        a place by the lander: compass word from the plan's own coordinates (+x is east, -z is north)
//   round5(m)            the arrow's metres, to the nearest 5
//   viewOf / arrowFor / edgePoint / projectPoint   the edge arrow's geometry from a camera's own position, turn and field of view
// Every line is a literal phrase('...') so the phrase table's scan reads it; the Clan set's light flavour is in world/moonwords.js (two lines).
// The look of it all (the DOM) is world/moonguidelive.js.
// =============================================================================

import { phrase } from '../clanphrases.js';
import * as P from './moonplan.js';
import * as M from './moonmission.js';

export const LANDER_AT = Object.freeze({ x: P.LANDER.x, z: P.LANDER.z });
export const NEAR_LANDER = 14; // m: a goal this close to the lander is "close to the lander", not a compass word
export const ARRIVED = 8; // m: the arrow is not shown when the goal is nearer than this (or on screen)
export const SCREEN_EDGE = 0.88; // a goal inside this share of the view (from the middle to the edge) counts as on screen

// ---- where: a compass word from the plan's own coordinates -------------------------------------------------------------------------------------
// +x is east and -z is north (the camera at the spawn looks north from behind the lander, so "ahead" is -z). The eight points are 45-degree sectors.
const POINTS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export function compassKey(dx, dz) {
  const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI; // 0 north, 90 east, 180 south, -90 west
  return POINTS[(((Math.round(bearing / 45) % 8) + 8) % 8)];
}
// "north of the lander" for a place on the plan; "close to the lander" within NEAR_LANDER metres of it.
export function atWords(x, z) {
  const dx = x - LANDER_AT.x;
  const dz = z - LANDER_AT.z;
  if (Math.hypot(dx, dz) < NEAR_LANDER) return phrase('moon.guide.at.near');
  return phrase('moon.guide.at.of').replace('{d}', phrase('moon.guide.at.dirs').split('|')[POINTS.indexOf(compassKey(dx, dz))]);
}
const fill = (text, n, at) => text.replace('{n}', String(n)).replace('{at}', at);
export const round5 = (m) => (Number.isFinite(m) && m > 0 ? Math.round(m / 5) * 5 : 0);

const onHill = (g) => g.x === P.STAR_HILL.x && g.z === P.STAR_HILL.z; // the goal is the telescope itself (she is on the ramp or the top)
const inCave = (g) => g.x === P.DEEP_CELL.x && g.z === P.DEEP_CELL.z; // the goal is the cell itself (she is at the mouth or in the tunnel)
const bits = (n) => (n & 1) + ((n >> 1) & 1);

// What the goal line says. `info`: { goal: { g: { kind, cell? }, x, z } (base.goal()), record: { step, cells } (moonmission.normalize), scope (bits), job: { kind, taken, next, glove, stage }, riding }.
// '' when there is nothing to say (the story is told, the Deep Cell is in and today's errand is done or not offered).
export function goalWords(info) {
  const gp = info?.goal;
  if (!gp || !gp.g) return '';
  const g = gp.g;
  const rec = info.record ?? { step: 0, cells: 0 };
  const at = atWords(gp.x, gp.z);
  const scopeTail = () => {
    const have = (info.scope ?? 0) & M.STORY_SCOPE;
    return (have === 1 ? phrase('moon.guide.t.cat') : have === 2 ? phrase('moon.guide.t.mouse') : phrase('moon.guide.t.both'));
  };
  switch (g.kind) {
    case 'pip': return phrase('moon.guide.pip');
    case 'cell': return fill((g.cell === 0 ? phrase('moon.guide.cell0') : phrase('moon.guide.cell1')), bits(rec.cells & M.CELL_BITS), at);
    case 'core': return fill((g.cell === M.DEEP ? phrase('moon.guide.deep') : phrase('moon.guide.core')), 0, at);
    case 'scope': return onHill(gp) ? `${phrase('moon.guide.top')} ${scopeTail()}` : `${fill(phrase('moon.guide.hill'), 0, at)} ${scopeTail()}`;
    case 'desk': return fill(phrase('moon.guide.desk'), 0, at);
    case 'rocket': return fill(phrase('moon.guide.rocket'), 0, at);
    case 'button': return fill(phrase('moon.guide.button'), 0, at);
    case 'reply': return fill(phrase('moon.guide.reply'), 0, at);
    case 'cave': return inCave(gp) ? phrase('moon.guide.tunnel') : fill(phrase('moon.guide.cave'), 0, at);
    case 'job': return jobWords(info, gp, at);
    case 'done': return rec.step >= M.STEP.replied ? phrase('moon.guide.done') : fill(phrase('moon.guide.both'), 0, at);
    default: return '';
  }
}

function jobWords(info, gp, at) {
  const j = info.job ?? {};
  switch (j.kind) {
    case 'pebbles': return j.taken >= 3 ? fill(phrase('moon.guide.tray'), 0, at) : fill(phrase('moon.guide.pebbles'), Math.max(0, j.taken | 0), at);
    case 'rounds': return !info.riding && !j.next ? fill(phrase('moon.guide.dot'), 0, at) : fill(phrase('moon.guide.rounds'), Math.min(5, Math.max(0, j.next | 0)), at);
    case 'guest': return onHill(gp) ? `${phrase('moon.guide.top')} ${phrase('moon.guide.t.guest')}` : `${fill(phrase('moon.guide.hill'), 0, at)} ${phrase('moon.guide.t.guest')}`;
    case 'bound': return fill(phrase('moon.guide.bound'), 0, at);
    case 'rocket': return fill((j.stage === 1 ? phrase('moon.guide.card2') : j.stage === 2 ? phrase('moon.guide.button') : phrase('moon.guide.card1')), 0, at);
    case 'glove': return j.glove === 'carried' ? phrase('moon.guide.glove2') : fill(phrase('moon.guide.glove'), 0, at);
    default: return '';
  }
}

// The few words beside Pip's picture, from the goal he is showing (base.bubble.g) and today's errand kind: an index into the five short lists of moonwords.js (moon.chip.a to e, said in this order).
const CHIPS = Object.freeze({ pip: [0, 0], cell: [0, 1], core: [0, 2], done: [4, 3], scope: [1, 0], desk: [1, 1], rocket: [1, 2], button: [2, 0], reply: [2, 1], cave: [2, 2] });
const JOB_CHIPS = Object.freeze({ pebbles: [3, 0], rounds: [3, 1], guest: [3, 2], bound: [4, 0], rocket: [4, 1], glove: [4, 2] });
const list = (i) => (i === 0 ? phrase('moon.chip.a') : i === 1 ? phrase('moon.chip.b') : i === 2 ? phrase('moon.chip.c') : i === 3 ? phrase('moon.chip.d') : phrase('moon.chip.e'));
export function chipWords(g, jobKind) {
  if (!g) return '';
  const at = g.kind === 'job' ? JOB_CHIPS[jobKind] : CHIPS[g.kind];
  return at ? list(at[0]).split('|')[at[1]] : '';
}

// ---- the edge arrow's geometry ----------------------------------------------------------------------------------------------------------------
// A camera is read through its own position, turn (quaternion) and field of view (degrees, vertical) and aspect, so a test can hand a plain object and the live game its real camera.
// Nothing here allocates once `view` and `out` are made.
export const makeView = () => ({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, tanV: 0.5, tanH: 0.9 });
export function viewOf(cam, view = makeView()) {
  const p = cam.position;
  const { x, y, z, w } = cam.quaternion;
  view.x = p.x; view.y = p.y; view.z = p.z;
  view.fx = -2 * (x * z + w * y); view.fy = -2 * (y * z - w * x); view.fz = -(1 - 2 * (x * x + y * y)); // (0, 0, -1) turned by the camera
  view.rx = 1 - 2 * (y * y + z * z); view.ry = 2 * (x * y + w * z); view.rz = 2 * (x * z - w * y); // (1, 0, 0)
  view.ux = 2 * (x * y - w * z); view.uy = 1 - 2 * (x * x + z * z); view.uz = 2 * (y * z + w * x); // (0, 1, 0)
  view.tanV = Math.tan(((cam.fov ?? 50) * Math.PI) / 360);
  view.tanH = view.tanV * (cam.aspect || 1.6);
  return view;
}
export const makeArrow = () => ({ show: false, rel: 0, dist: 0, onScreen: false });
// arrowFor(view, from, goal, out): `from` is where HER paws are (the distance is hers, not the camera's: the camera hangs behind her), `goal` { x, y, z }.
// out.rel is the turn from where the camera looks to where the goal lies, in radians along the ground, 0 ahead and positive toward her right.
// out.show is false when the goal is on screen or nearer than `near` metres.
export function arrowFor(view, from, goal, out = makeArrow(), near = ARRIVED) {
  const dxc = goal.x - view.x; const dyc = goal.y - view.y; const dzc = goal.z - view.z;
  const depth = dxc * view.fx + dyc * view.fy + dzc * view.fz;
  const sx = dxc * view.rx + dyc * view.ry + dzc * view.rz;
  const sy = dxc * view.ux + dyc * view.uy + dzc * view.uz;
  out.onScreen = depth > 0.3 && Math.abs(sx) < depth * view.tanH * SCREEN_EDGE && Math.abs(sy) < depth * view.tanV * SCREEN_EDGE;
  const hf = Math.hypot(view.fx, view.fz) || 1;
  const fx = view.fx / hf; const fz = view.fz / hf;
  const dx = goal.x - view.x; const dz = goal.z - view.z;
  out.rel = Math.atan2(-dx * fz + dz * fx, dx * fx + dz * fz);
  out.dist = Math.hypot(goal.x - from.x, goal.z - from.z);
  out.show = !out.onScreen && out.dist > near;
  return out;
}
// Where on a rectangle { l, t, r, b } the arrow sits for a turn `rel`: from its middle toward that way until it meets the edge. A goal behind her slides to the bottom corner on its side (the further it is
// behind, the nearer the corner), so the arrow is never on the bottom middle (the prompt and the toasts) or over the cat.
export function edgePoint(rel, rect, out = { x: 0, y: 0 }) {
  const cx = (rect.l + rect.r) / 2; const cy = (rect.t + rect.b) / 2;
  const hw = Math.max(1, (rect.r - rect.l) / 2); const hh = Math.max(1, (rect.b - rect.t) / 2);
  const dx = Math.sin(rel); const dy = -Math.cos(rel);
  const k = Math.min(hw / Math.max(Math.abs(dx), 1e-6), hh / Math.max(Math.abs(dy), 1e-6));
  out.x = cx + dx * k;
  out.y = cy + dy * k;
  if (dy > 0.5) {
    const w = (dy - 0.5) / 0.5;
    const cornerX = cx + (dx < 0 ? -hw : hw);
    out.x += (cornerX - out.x) * w;
    out.y += (rect.b - out.y) * w;
  }
  return out;
}
// A point's place on the screen (pixels) for a view of W x H: ok false when it is behind the camera.
export function projectPoint(view, x, y, z, W, H, out = { ok: false, x: 0, y: 0, depth: 0 }) {
  const dx = x - view.x; const dy = y - view.y; const dz = z - view.z;
  const depth = dx * view.fx + dy * view.fy + dz * view.fz;
  out.depth = depth;
  out.ok = depth > 0.2;
  if (!out.ok) return out;
  out.x = (0.5 + (0.5 * (dx * view.rx + dy * view.ry + dz * view.rz)) / (depth * view.tanH)) * W;
  out.y = (0.5 - (0.5 * (dx * view.ux + dy * view.uy + dz * view.uz)) / (depth * view.tanV)) * H;
  return out;
}
