// =============================================================================
// THE MOON'S STORY FLOW: THE PURE PART (story-flow pass). No THREE, no DOM, no clock, no random number, no save. A child who has just done a step
// should always hear four things, in this order: (1) CONFIRM what just happened, (2) NEXT and where, (3) WHY it matters in the story, and then
// (4) a clear PROMPT at the thing to use. The steps already have their own first words (Pip's beep, "Clunk!", the postcard toast); this file is the
// table that connects them, and the small machines the live part (world/moonflowlive.js) runs:
//
//   FLOW        one row per step transition: where the CONFIRM line comes from (`by`: the life that already says it), the lines this pass adds after it
//               (the NEXT, the WHY), and the PROMPT at the target (a phrase id the action button reads there).
//   nextLine(kind)   the "Next:" line for the goal the gold light points at (kind = base.goal().g.kind): it names the same thing as the guide's goal line,
//                    because it is chosen from the same goal.
//   diff(prev, now)  which transitions happened between two looks (the highest one wins when a step is skipped).
//   createQueue()    the toasts, one at a time, with a gap, so a later line never buries an earlier one; a line that went stale (the step moved on) is dropped.
//   ctaFor / createCta   the call-to-action pill by the rocket slot and the big red button: when it shows, how long, and when it comes back.
// Every line is a literal phrase('...') so the phrase table's scan reads it; the words are in world/moonwords.js (moon.flow.*).
// =============================================================================

import { phrase } from '../clanphrases.js';
import * as M from './moonmission.js';

export const GAP = 3.2; // s: the least time between two of this pass's toasts (the HUD shows two at a time for 2.5 s each)
export const CTA = Object.freeze({ near: 5, show: 6, hide: 4 }); // m from the target; seconds the pill shows, then rests (a 10 s round)
export const QUEUE_MAX = 6;
export const WAIT_EVERY = 12; // s: "Earth is still reading..." while she waits on the rock
export const WAIT_MAX = 2; // how many of those
export const RESEND = 25; // s after lift-off: a nudge toward the rock if she is not there yet

// The "Next:" line for the goals a transition leads to. '' for any other (the step's own toast says it) and for 'done' (nothing is left to go to).
export function nextLine(kind) {
  switch (kind) {
    case 'scope': return phrase('moon.flow.n.scope');
    case 'desk': return phrase('moon.flow.n.desk');
    case 'reply': return phrase('moon.flow.n.reply');
    case 'cave': return phrase('moon.flow.n.cave');
    case 'job': return phrase('moon.flow.n.job');
    default: return '';
  }
}
export const GOAL_KINDS = Object.freeze(['scope', 'desk', 'reply', 'cave', 'job']); // the goals a transition leads to (a step whose next goal is one of the others says it in its own toast)

// "What now?" after the story is told: the same goal, in the words of the end of the story.
export const whatNow = (kind) => (kind === 'cave' ? phrase('moon.flow.what.cave') : kind === 'job' ? phrase('moon.flow.what.job') : '');

// ---- the table ---------------------------------------------------------------------------------------------------------------------------------
// FLOW is what the walk runs: the step a row belongs to and the lines this pass adds after it, in order: { at (s after the transition), k: 'why' | 'next' | 'what' | 'more' | 'confirm',
// text(kind): the line from the goal kind now, story: only the story's own rocket }. FLOW_DOC says the rest of each row and is read by tests and by whoever merges the lines (so the walk never
// carries it): by = who says the CONFIRM line ('base' | 'star' | 'launch' | 'deep' | 'job' | 'flow' (this pass)); confirm(): that line; goal: the goal kind the gold light has after it;
// prompt(): the action button's words at the target ('' when the step has none of its own).
const L = (at, k, text, extra = {}) => Object.freeze({ at, k, text, ...extra });
const goal = (kind) => nextLine(kind);
const R = (step, lines) => Object.freeze({ step, lines });
export const FLOW = Object.freeze({
  wake: R(M.STEP.pip, [L(3.2, 'why', () => phrase('moon.flow.ch1'))]),
  awake: R(M.STEP.awake, [L(1.2, 'why', () => phrase('moon.flow.ch2')), L(4.4, 'next', goal)]),
  aimed: R(M.STEP.aimed, [L(1.2, 'why', () => phrase('moon.flow.ch3')), L(4.4, 'next', goal)]),
  posted: R(M.STEP.loaded, [L(3.4, 'why', () => phrase('moon.flow.posted'), { story: true })]),
  count: R(M.STEP.loaded, [L(0, 'confirm', () => phrase('moon.flow.sky')), L(2.8, 'more', () => phrase('moon.flow.mound'))]),
  liftoff: R(M.STEP.sent, [L(8.4, 'next', goal)]), // (the launch life says "Lift-off!" at ignition and "on its way" 5 s later)
  replied: R(M.STEP.replied, [L(10.5, 'what', (kind) => whatNow(kind)), L(14, 'more', (kind) => (kind === 'cave' || kind === 'job' ? phrase('moon.flow.what.more') : ''))]),
  errandDone: R(M.STEP.replied, [L(2.6, 'next', (kind) => (kind === 'done' ? phrase('moon.flow.rest') : goal(kind)))]),
  deep: R(M.STEP.awake, [L(5.6, 'why', () => phrase('moon.flow.deep')), L(9, 'next', (kind) => (kind === 'done' ? phrase('moon.flow.all') : goal(kind)))]),
});
const D = (step, by, confirm, goalKind, prompt) => Object.freeze({ step, by, confirm, goal: goalKind, prompt });
export const FLOW_DOC = Object.freeze({
  wake: D(M.STEP.pip, 'base', () => phrase('moon.pip.wake'), 'cell', () => phrase('moon.cell.prompt')),
  plug1: D(M.STEP.one, 'base', () => phrase('moon.core.plug1'), 'cell', () => phrase('moon.core.prompt')),
  awake: D(M.STEP.awake, 'base', () => phrase('moon.core.on'), 'scope', () => phrase('moon.scope.prompt')),
  aimed: D(M.STEP.aimed, 'star', () => phrase('moon.scope.found'), 'desk', () => phrase('moon.desk.prompt')),
  stamp: D(M.STEP.aimed, 'launch', () => phrase('moon.card.got'), 'rocket', () => phrase('moon.rocket.prompt')),
  posted: D(M.STEP.loaded, 'launch', () => phrase('moon.rocket.loaded'), 'button', () => phrase('moon.launch.prompt')),
  count: D(M.STEP.loaded, 'flow', () => phrase('moon.flow.sky'), 'button', () => phrase('moon.launch.prompt')),
  liftoff: D(M.STEP.sent, 'launch', () => phrase('moon.launch.sent'), 'reply', () => phrase('moon.binoc.prompt')),
  waiting: D(M.STEP.sent, 'launch', () => phrase('moon.reply.wait'), 'reply', () => phrase('moon.binoc.prompt')),
  replied: D(M.STEP.replied, 'launch', () => phrase('moon.reply'), 'cave', () => phrase('moon.binoc.prompt')),
  errandDone: D(M.STEP.replied, 'job', () => phrase('moon.job.pay'), 'cave', () => ''),
  deep: D(M.STEP.awake, 'deep', () => phrase('moon.deep.bloom'), 'done', () => phrase('moon.core.prompt')),
});
export const FLOW_KEYS = Object.freeze(Object.keys(FLOW_DOC)); // every transition of the story (FLOW holds the ones that add lines)
// A key listed here is not said by this pass (the coordinator's switch when another builder's line says the same thing).
export const MUTED = new Set();

// The lines of a transition (the second rocket leaves out the story's own), in order: [{ at, k, text(kind) }].
export const rowLines = (key, { second = false } = {}) => (MUTED.has(key) ? [] : (FLOW[key]?.lines ?? []).filter((l) => !(second && l.story)));
// ...and said for the goal kind now: [{ at, k, text }] (an empty line is left out).
export const linesFor = (key, kind, opts) => rowLines(key, opts).map((l) => ({ at: l.at, k: l.k, text: l.text(kind) })).filter((l) => l.text);

// ---- which transition happened between two looks -------------------------------------------------------------------------------------------
// A look: { step, deep (the Deep Cell is in), stage (the second rocket's stage, -1 none), flight (a flight she can see: 0 none, 1 a demo, 2 any other), done (today's errand done) }.
// Only the transitions that add lines are found (the cell, the stamp and the wait say theirs through the step's own toast). Several can come at once; a skipped step says only the highest it reaches.
export function diff(prev, now) {
  if (!prev || !now) return [];
  const out = [];
  const n = now.step;
  if (n > prev.step) out.push(n >= M.STEP.replied ? 'replied' : n >= M.STEP.sent ? 'liftoff' : n >= M.STEP.loaded ? 'posted' : n >= M.STEP.aimed ? 'aimed' : n >= M.STEP.awake ? 'awake' : prev.step < M.STEP.pip && n === M.STEP.pip ? 'wake' : '');
  else if (n >= M.STEP.replied && now.stage === 2 && prev.stage < 2) out.push('posted'); // the second rocket's postcard
  if (now.flight === 2 && prev.flight === 0) out.push('count');
  if (now.deep && !prev.deep) out.push('deep');
  if (now.done && !prev.done) out.push('errandDone');
  return out.filter(Boolean);
}

// ---- the queue: one at a time, with a gap --------------------------------------------------------------------------------------------------
// push({ at (s from now), text (a string or a function of nothing that gives one now), valid (a function; the line is dropped when it says no), k }); update(dt, paused) -> the line to say now, or ''.
export function createQueue() {
  let clock = 0;
  let last = -1e9;
  let seq = 0;
  const items = [];
  return {
    get length() { return items.length; },
    get items() { return items.map((i) => ({ at: i.at, k: i.k, seq: i.seq })); },
    push(item) {
      items.push({ at: clock + Math.max(0, item.at ?? 0), text: item.text, valid: item.valid ?? (() => true), k: item.k ?? 'next', seq: seq++ });
      items.sort((a, b) => a.at - b.at || a.seq - b.seq);
      // a long backlog drops the oldest "why" first (a "next" is what she needs)
      while (items.length > QUEUE_MAX) { const i = items.findIndex((x) => x.k === 'why' || x.k === 'more'); items.splice(i >= 0 ? i : 0, 1); }
    },
    clear() { items.length = 0; },
    update(dt, paused = false) {
      clock += dt > 0 ? dt : 0;
      while (items.length && items[0].at <= clock) {
        const it = items[0];
        let text = '';
        try { text = it.valid() ? (typeof it.text === 'function' ? it.text() : it.text) : ''; } catch { text = ''; }
        if (!text) { items.shift(); continue; } // stale or empty: gone, and it costs no gap
        if (paused || clock - last < GAP) return '';
        items.shift();
        last = clock;
        return text;
      }
      return '';
    },
  };
}

// ---- the call-to-action pill ---------------------------------------------------------------------------------------------------------------
// ctaFor(info) -> 'button' | 'rocket' | '': info { step, card (postcard in her mouth), stage (the second rocket's stage, -1 none), flight (bool), open (a page is up), near: { rocket, button } (within CTA.near of each) }.
// Never once the launch happened (step 7 or more) unless the second rocket's own button is what is left, never during a flight or a page.
export function ctaFor(info) {
  if (!info || info.flight || info.open) return '';
  const second = info.step >= M.STEP.replied;
  if (info.near?.rocket && info.card && (info.step === M.STEP.aimed || (second && info.stage === 1))) return 'rocket';
  if (info.near?.button && (info.step === M.STEP.loaded || (second && info.stage === 2))) return 'button';
  return '';
}
// createCta() -> { update(dt, want: '' | kind) -> the kind to show now ('' hidden) }: shows `show` s, rests `hide` s, comes back while `want` stays; gone the moment want is empty; shows again at once when she comes back.
export function createCta() {
  let kind = '';
  let age = 0;
  return {
    update(dt, want) {
      if (!want) { kind = ''; age = 0; return ''; }
      if (want !== kind) { kind = want; age = 0; }
      age += dt > 0 ? dt : 0;
      const round = CTA.show + CTA.hide;
      return age % round < CTA.show ? kind : '';
    },
  };
}
