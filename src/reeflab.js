// =============================================================================
// THE REEF'S SEALAB STORY: THE PURE STEP MACHINE (milestone R14: the three fuses). No THREE, no clock, no random number, no save write: it takes the
// `state.reef` record and an event and answers the next record (the same shape as src/reefmission.js, which this is copied from); world/reeflabstory.js
// carries it out on a walk and writes it back.
//
// WHAT IS SAVED (state.reef.lab, 4 bits; src/progression.js's reefLab sanitiser and src/catmerge.js's OR agree):
//   bits 0 to 2  fuse 0, 1, 2 is in the panel (any order: a bunk-room fuse, an aquarium-hall fuse and one on the sand outside)
//   bit 3        the dome show has been seen (R15; it implies all three fuses)
// A fuse she is CARRYING is never saved: it is back at its own spot on the next walk, however a walk ends. A fuse found in the station never goes out of the
// hatch with her (it is set down at its spot, nothing lost), and a fuse in her mouth is put back when anything else is picked up (carryAfter()).
// A fuse put in by ANYONE in the room is credited the same way (credit()); the order never matters, so two partners can not leave a gap.
// All three in pays AWARDS.reeflab once (world/reeflabstory.js asks log.awardOnce). Nothing here can fail her.
// =============================================================================

export const FUSE_COUNT = 3;
export const FUSES_ALL = 7;
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo ? Math.min(hi, v) : lo);

// A well-formed { lab } from any input. Pure; idempotent. The show bit implies the three fuses.
export const normLab = (v) => { const b = int(v, 0, 15); return b & 8 ? 15 : b & 7; };
export const normalize = (reef) => ({ lab: normLab(reef && typeof reef === 'object' ? reef.lab : 0) });

export const fuseIn = (reef, i) => (normalize(reef).lab & (1 << i)) !== 0;
export const fusesIn = (reef) => { const b = normalize(reef).lab & 7; return (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1); };
export const powered = (reef) => (normalize(reef).lab & 7) === 7;
export const showSeen = (reef) => (normalize(reef).lab & 8) !== 0;

// The next record after an event; `reef` itself is never touched and its other keys come back as they were.
// events: { kind: 'fuse', fuse: 0 | 1 | 2 } (a fuse was put in the panel). Anything else, a fuse already in, nonsense: no change.
// effect: 'fuse' (one more in) | 'power' (the third: the station has power) | null.
export function apply(reef, ev) {
  const cur = normalize(reef);
  const base = reef && typeof reef === 'object' ? reef : {};
  const none = { reef: { ...base, lab: cur.lab }, changed: false, effect: null };
  if (!ev || typeof ev !== 'object' || ev.kind !== 'fuse' || !(ev.fuse === 0 || ev.fuse === 1 || ev.fuse === 2)) return none;
  const bit = 1 << ev.fuse;
  if (cur.lab & bit) return none;
  const lab = cur.lab | bit;
  return { reef: { ...base, lab }, changed: true, effect: (lab & 7) === 7 ? 'power' : 'fuse' };
}
// Someone else's fuse: the same (no order to keep, so there is no ladder to walk).
export const credit = (reef, ev) => apply(reef, ev);

// The one thing to do next. { kind, fuse?, icon }:
//   'fuse' (find fuse `fuse`: the first not in, in `order`), 'deliver' (carry the fuse to the panel), 'rest' (all three are in).
// `carrying`: the fuse in her mouth (0, 1, 2) or null. `order`: the fuses nearest first (the walk knows where she is); default 0, 1, 2.
export const ICON = Object.freeze({ fuse: 'question', deliver: 'heart', rest: 'heart' });
export function nextGoal(reef, carrying = null, order = [0, 1, 2]) {
  if (powered(reef)) return { kind: 'rest', icon: ICON.rest };
  if (carrying !== null && (carrying === 0 || carrying === 1 || carrying === 2) && !fuseIn(reef, carrying)) return { kind: 'deliver', fuse: carrying, icon: ICON.deliver };
  const list = Array.isArray(order) ? order : [0, 1, 2];
  const want = list.find((i) => (i === 0 || i === 1 || i === 2) && !fuseIn(reef, i));
  const fuse = want ?? [0, 1, 2].find((i) => !fuseIn(reef, i));
  return { kind: 'fuse', fuse, icon: ICON.fuse };
}

// A fuse may be picked up when it is not in the panel yet and her mouth is empty: no fail, no stuck state.
export const canPick = (reef, fuse, carrying = null) => carrying === null && (fuse === 0 || fuse === 1 || fuse === 2) && !fuseIn(reef, fuse);

// What is in her mouth after something happens. `home`: whether the carried fuse's own spot is inside the station.
//   'walkend'  a walk ends (leaving, a lift, a reset): nothing is kept, the next walk finds it at its spot
//   'hatchup'  she climbs the ladder: a fuse of the station is set down at its spot (never carried out); one from the sand is hers to keep
//   'busy'     something else was picked up: the fuse goes back to its spot
//   'in'       it was put in the panel
// Returns the fuse still carried (a number) or null.
export function carryAfter(carrying, event, home = false) {
  if (carrying === null || carrying === undefined) return null;
  if (event === 'hatchup') return home ? null : carrying;
  return null; // 'walkend', 'busy', 'in' and anything unknown: the safe answer is "put it back"
}
