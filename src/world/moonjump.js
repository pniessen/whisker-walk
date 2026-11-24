// =============================================================================
// THE MOON: JUMPING, THE SAFE HALF (milestone 7a). Pure rules, no THREE, no clock, no random number. The Moon's hop is the plain Tier 1 hop
// (the arc is only drawn; the stick moves her as on the ground), so what the hop board measures is how far one hop CARRIES HER over level
// ground: from the start line to where she lands. The rules are small and honest:
//   * she takes off on the ground (never from a perch) inside the lane, at most `back` m behind the line and at most `over` m past it;
//   * she lands inside the lane (a hand's `slack` wider than it is drawn), past the line, on ground within `level` of where she took off;
//   * anything else is simply not measured (no foul, no message, nothing lost).
// The best of each cat is kept in state.moon.jump[catId] in whole centimetres, at most JUMP_RECORD_MAX, at most six cats (the save's own
// sanitiser, src/progression.js, keeps the same limits on load; catmerge.js keeps the longer of two). The course lamps light as she stands on a perch.
// =============================================================================

import { JUMP_LANE, JUMP_RECORD_MAX } from './moonplan.js';

export const JUMP_ID_PATTERN = /^[a-z][a-z0-9]{1,15}$/; // the save's cat id shape (src/progression.js, sanitizeMoon)
export const JUMP_KEYS_MAX = 6;

// where (x, z) is along the lane (metres past the line) and across it (metres from its middle)
export const laneAt = (x, z, lane = JUMP_LANE) => ({ along: x - lane.x0, across: z - lane.z });

// Is this a take-off the board counts? `perched` is the walk's session.perched (anything truthy: she is on a perch).
export function takeoffOk(x, z, perched, lane = JUMP_LANE) {
  if (perched) return false;
  const { along, across } = laneAt(x, z, lane);
  return along >= -lane.back && along <= lane.over && Math.abs(across) <= lane.half;
}

// measureHop(from, to, { perched, groundFrom, groundTo }) -> whole centimetres from the line to the landing, or null when the hop is not measured.
export function measureHop(from, to, { perched = false, groundFrom = 0, groundTo = 0, lane = JUMP_LANE } = {}) {
  if (!from || !to) return null;
  if (![from.x, from.z, to.x, to.z, groundFrom, groundTo].every(Number.isFinite)) return null;
  if (!takeoffOk(from.x, from.z, perched, lane)) return null;
  if (Math.abs(groundTo - groundFrom) > lane.level) return null;
  const { along, across } = laneAt(to.x, to.z, lane);
  if (!(along > 0) || Math.abs(across) > lane.half + lane.slack) return null;
  return Math.min(JUMP_RECORD_MAX, Math.round(along * 100));
}

// A cat's id as the save keeps it (the custom cat's if she wears one, else the equipped cat), or null when it is not a shape the save would keep.
export function jumpCatId(state) {
  const e = state?.equipped;
  const id = typeof e?.custom === 'string' ? e.custom : e?.cat;
  return typeof id === 'string' && JUMP_ID_PATTERN.test(id) ? id : null;
}

// This cat's best in centimetres (0 for none), whatever a hostile record holds.
export function bestOf(moon, id) {
  const jump = moon?.jump;
  if (!id || !jump || typeof jump !== 'object' || !Object.hasOwn(jump, id)) return 0;
  const v = jump[id];
  return Number.isFinite(v) && v > 0 ? Math.min(JUMP_RECORD_MAX, Math.floor(v)) : 0;
}

// The record as the save would keep it: plain ids only, whole centimetres 1 to the ceiling, six cats at most (the same rules as src/progression.js's sanitizeMoon).
export function cleanJump(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const id of Object.keys(raw)) {
    if (Object.keys(out).length >= JUMP_KEYS_MAX) break;
    const cm = bestOf({ jump: raw }, id);
    if (JUMP_ID_PATTERN.test(id) && cm > 0) out[id] = cm;
  }
  return out;
}

// improve(moon, id, cm) -> { moon, record, first, kept }. `record` is true when cm beats this cat's best (the board says "New record!"); `first` when it is her first.
// The save is only changed for a better hop of a cat the save can hold (a valid id, room for a seventh cat is never made); `moon` is a copy.
export function improve(moon, id, cm) {
  const had = bestOf(moon, id);
  const ok = Number.isFinite(cm) && cm > 0;
  const next = ok ? Math.min(JUMP_RECORD_MAX, Math.floor(cm)) : 0;
  const jump = cleanJump(moon?.jump); // only what the save would keep: a hostile record in memory is never copied on
  const room = Object.hasOwn(jump, id) || Object.keys(jump).length < JUMP_KEYS_MAX;
  if (!ok || !id || !JUMP_ID_PATTERN.test(id) || next <= had || !room) return { moon, record: false, first: false, kept: false };
  jump[id] = next;
  return { moon: { ...moon, jump }, record: true, first: had === 0, kept: true };
}

// "6.4" for 640 cm
export const metres = (cm) => (Math.max(0, cm) / 100).toFixed(1);

// The lamps: which perch (of the course lamps) is she on? Perches match by their own spot (the walk puts her at a perch's middle).
export function lampUnder(perched, lamps, tol = 0.05) {
  if (!perched) return -1;
  return lamps.findIndex((l) => Math.abs(l.x - perched.x) < tol && Math.abs(l.z - perched.z) < tol && Math.abs(l.y - perched.y) < tol);
}
