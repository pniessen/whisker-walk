// =============================================================================
// THE FORGE JOB: THE PURE RULES (milestone C3). No THREE, no clock, no random number, no save write: it takes the `state.crystal` record (its `step` and `forge` keys) and an event and answers
// the next record; world/crystalforgejoblive.js carries it out on a walk and writes it back. Modelled on src/crystalmission.js and src/reefmission.js.
//
// WHAT IS SAVED (state.crystal.forge, 4 bits): bits 0-2 are the three ingredients (glow-cap, falls water, rose shard), in ANY order; bit 3 is "the circlet is made" and implies all three.
// The job is open once Lumi's story is told (step 7 or more). A thing she is CARRYING is never saved, and never in the walk's mouth: it is back at its own spot on the next walk, whatever
// ends a walk. A step done by ANYONE in the room is credited the same way (credit()). normalize() repairs whatever a merge or a hostile save leaves. Nothing here can fail her.
// =============================================================================
import { normalize as storyNormalize } from '../crystalmission.js';
import { OPEN_STEP } from './crystalforgejobplan.js';

export const COUNT = 3;
export const MADE = 8;
const int = (v) => (Number.isInteger(v) && v > 0 ? Math.min(15, v) : 0);

// the forge bits, repaired: the circlet implies the three (progression.js reefLab's rule)
export const forgeBits = (rec) => { const b = int(rec && typeof rec === 'object' ? rec.forge : 0); return b & MADE ? 15 : b & 7; };
export const isOpen = (rec) => storyNormalize(rec).step >= OPEN_STEP;
export const hasItem = (rec, i) => (forgeBits(rec) & (1 << i)) !== 0;
export const made = (rec) => (forgeBits(rec) & MADE) !== 0;
export const ready = (rec) => forgeBits(rec) === 7; // all three are in and the circlet is not made yet
export const itemsIn = (rec) => [0, 1, 2].filter((i) => hasItem(rec, i)).length;
const isItem = (i) => i === 0 || i === 1 || i === 2;

// events: { kind: 'bring', item: 0 | 1 | 2 } (an ingredient put in the forge), { kind: 'make' } (all three are in: the circlet is made).
// effect: 'bring' | 'circlet' | null. `rec` itself is never touched and the record's other keys come back as they were.
export function apply(rec, ev) {
  const base = rec && typeof rec === 'object' ? rec : {};
  const bits = forgeBits(rec);
  const none = { crystal: { ...base, forge: bits }, changed: false, effect: null };
  if (!isOpen(rec) || !ev || typeof ev !== 'object') return none;
  if (ev.kind === 'bring' && isItem(ev.item)) return bits & (1 << ev.item) ? none : { crystal: { ...base, forge: bits | (1 << ev.item) }, changed: true, effect: 'bring' };
  if (ev.kind === 'make' && bits === 7) return { crystal: { ...base, forge: 15 }, changed: true, effect: 'circlet' };
  return none;
}

// A step done by someone else in the room: an ingredient not yet in is taken; "made" takes every ingredient before it.
export function credit(rec, ev) {
  const first = apply(rec, ev);
  if (first.changed || !ev || typeof ev !== 'object' || ev.kind !== 'make' || !isOpen(rec)) return first;
  let cur = rec;
  for (let i = 0; i < COUNT; i++) { const r = apply(cur, { kind: 'bring', item: i }); if (r.changed) cur = r.crystal; }
  const r = apply(cur, { kind: 'make' });
  return r.changed ? r : first;
}

// The wire form of a step (the one place that reads a partner's event): { kind: 'wc-forge', item } or { kind: 'wc-forge', made: true }; anything else is nothing.
export const toStep = (ev) => (ev && typeof ev === 'object' && ev.kind === 'wc-forge' ? (ev.made === true ? { kind: 'make' } : isItem(ev.item) ? { kind: 'bring', item: ev.item } : null) : null);
export const wire = (step) => (step.kind === 'make' ? { kind: 'wc-forge', made: true } : { kind: 'wc-forge', item: step.item });

// The one thing to do next, for the guide: { kind: 'find' | 'give' | 'make' | 'rest', item? }. `carrying`: the item in her mouth (0, 1, 2) or null. The nearest unfound item is the lowest id.
export function nextGoal(rec, carrying = null) {
  if (!isOpen(rec) || made(rec)) return { kind: 'rest' };
  if (ready(rec)) return { kind: 'make' };
  if (carrying !== null && !hasItem(rec, carrying)) return { kind: 'give', item: carrying };
  const item = [0, 1, 2].find((i) => !hasItem(rec, i));
  return { kind: 'find', item };
}

// An ingredient may be picked up when the job is open, it is not in the forge yet and her mouth is empty (no fail, no stuck state).
export const canPick = (rec, item, carrying = null) => carrying === null && isItem(item) && isOpen(rec) && !hasItem(rec, item) && !made(rec);
