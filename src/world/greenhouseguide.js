// =============================================================================
// THE GREENHOUSE'S WRITTEN GUIDE (the Moon's and the Reef's way, world/moonguide.js): THE PURE PART. No THREE, no DOM, no clock, no random number, no save.
// A child who has walked in from the court can still ask "what am I meant to do?": this file picks WHAT is next and says it in words, and holds the edge arrow's
// geometry (the minimal copy of the Moon's), so the ring on the ground, the arrow and the goal line are all read from the one goal goalOf() returns.
//
//   goalOf(info)     the next target, from the life's own state: the potting bench first, then (once she has been to it) the next seed packet of the seed job, the seed tray with five,
//                    the watering can, the next thirsty pot of the watering job; null when both jobs are done. The seed job comes first, but a can already in her mouth (or a pot
//                    already watered) keeps her on the watering job.
//   goalWords(goal)  the goal line for it (every line a literal phrase('greenhouse.guide.*'); the words are below, the same in both word sets).
//   round5, ARRIVED, SCREEN_EDGE, makeView, viewOf, makeArrow, arrowFor, edgePoint   the arrow's geometry
// =============================================================================

import { phrase } from '../clanphrases.js';
import './greenhousewords.js'; // (the guide's lines are greenhouse.guide.* there)
import * as P from './greenhouseplan.js';
import { nowWords } from '../reefpages.js';
export { nowWords };

export const SEEDS = 5; // the same numbers as greenhouselife.js (kept here so the pure file stays light)
export const THIRSTY = 4;
export const ARRIVED = 8; // m: the arrow is not shown when the goal is nearer than this (or on screen)
export const SCREEN_EDGE = 0.88;
export const OFFER_R = 10; // m: the bench's seed offer speaks inside this; the guide counts her as having been to the bench there

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearest = (list, cat) => list.reduce((best, p) => (!best || dist(cat, p) < dist(cat, best) ? p : best), null);

// info: { state (the life's), packets: [{ x, z, visible }], pots: [{ x, z, visible }] (a thirsty pot's cloud shows until it is watered), cat: { x, z }, arrived (she has been within OFFER_R of the bench) }
// -> { kind: 'bench'|'packet'|'tray'|'can'|'pot', x, z, n, total } or null
export function goalOf(info) {
  const st = info?.state;
  if (!st) return null;
  const cat = info.cat ?? { x: P.POTTING.x, z: P.POTTING.z };
  const bench = { kind: 'bench', x: P.POTTING.x, z: P.POTTING.z, n: 0, total: 0 };
  const started = st.seeds > 0 || st.seedState === 'sown' || st.held || st.watered > 0;
  if (!info.arrived && !started) return bench;
  const waterOn = !st.allWatered && (st.held || st.watered > 0 || st.seedState === 'sown');
  if (waterOn) {
    if (!st.held) return { kind: 'can', x: P.POTTING.canHome.x, z: P.POTTING.canHome.z, n: st.watered, total: THIRSTY };
    const p = nearest((info.pots ?? []).filter((q) => q.visible), cat);
    return p ? { kind: 'pot', x: p.x, z: p.z, n: st.watered, total: THIRSTY } : null;
  }
  if (st.seedState === 'looking') {
    if (st.seeds >= SEEDS) return { kind: 'tray', x: P.POTTING.tray.x, z: P.POTTING.tray.z, n: SEEDS, total: SEEDS };
    const p = nearest((info.packets ?? []).filter((q) => q.visible), cat);
    return p ? { kind: 'packet', x: p.x, z: p.z, n: st.seeds, total: SEEDS } : null;
  }
  return null;
}

const fill = (text, g) => text.replace('{n}', String(g.n)).replace('{total}', String(g.total));
// `from` { cat: { x, z }, fx, fz } (where she stands and which way she faces) adds where the goal is, from there: "Find the seed packets (2 of 5), about 10 m ahead". Without it the line is just what to do.
const where = (t, g, from) => (from?.cat ? `${t.replace(/\.$/, '')}, ${nowWords(g.x, g.z, from.cat, from.fx ?? 0, from.fz ?? -1)}.` : t);
export function goalWords(g, from = null) {
  switch (g?.kind) {
    case 'bench': return where(phrase('greenhouse.guide.bench'), g, from);
    case 'packet': return where(fill(phrase('greenhouse.guide.seeds'), g), g, from);
    case 'tray': return where(phrase('greenhouse.guide.tray'), g, from);
    case 'can': return where(phrase('greenhouse.guide.can'), g, from);
    case 'pot': return where(fill(phrase('greenhouse.guide.water'), g), g, from);
    default: return '';
  }
}

export const round5 = (m) => (Number.isFinite(m) && m > 0 ? Math.round(m / 5) * 5 : 0);

// ---- the edge arrow's geometry (the Moon's, world/moonguide.js, copied without the compass and the picture) -------------------------------------------
export const makeView = () => ({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, tanV: 0.5, tanH: 0.9 });
export function viewOf(cam, view = makeView()) {
  const p = cam.position;
  const { x, y, z, w } = cam.quaternion;
  view.x = p.x; view.y = p.y; view.z = p.z;
  view.fx = -2 * (x * z + w * y); view.fy = -2 * (y * z - w * x); view.fz = -(1 - 2 * (x * x + y * y));
  view.rx = 1 - 2 * (y * y + z * z); view.ry = 2 * (x * y + w * z); view.rz = 2 * (x * z - w * y);
  view.ux = 2 * (x * y - w * z); view.uy = 1 - 2 * (x * x + z * z); view.uz = 2 * (y * z + w * x);
  view.tanV = Math.tan(((cam.fov ?? 50) * Math.PI) / 360);
  view.tanH = view.tanV * (cam.aspect || 1.6);
  return view;
}
export const makeArrow = () => ({ show: false, rel: 0, dist: 0, onScreen: false });
// `from` is where HER paws are (the distance is hers, not the camera's); rel is the turn from where the camera looks to the goal, 0 ahead, positive to her right.
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
// Where on a rectangle { l, t, r, b } the arrow sits for a turn `rel`; a goal behind her slides to the bottom corner on its side.
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
