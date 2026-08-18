// v18 Task 2.7 — the in-walk skill-unlock card.
//
// The spec calls this "the emotional payoff of the whole wave", and is
// explicit that it must NOT be a line in the end-of-walk summary. So it is a
// real card, drawn over the live walk the moment the feat completes, while
// the player is still standing where they earned it.
//
// It lives in its own module rather than inside walk.js for one reason:
// walk.js imports THREE and all four world builders, so nothing in it can be
// unit-tested. The card is pure DOM and pure string work, and the one thing
// that could actually hurt someone — interpolating a name into innerHTML —
// is exactly the thing that deserves a test. cardHtml is therefore exported
// separately from the DOM plumbing.

import { escapeHtml } from './util.js';

// How long a card stays up, and how long its fade-out transition runs. The
// fade is CSS (.skill-unlock.fade); these two numbers only have to be at
// least as long as it.
const HOLD_MS = 3600;
const FADE_MS = 700;

// The card's markup for one ability.
//
// The catalog in src/skills.js is static and author-controlled, so nothing
// here is untrusted TODAY. It is escaped anyway: this function takes a plain
// { name, effect } object, and the entire point of a display-string field is
// that someone will eventually want to put a player-supplied word in one
// (a pet name in the effect line, a co-walker's name in a shared unlock).
// Escaping at the render site is what makes that a safe change rather than
// an XSS, and matches how walk.js's summary card already treats petNames.
export function cardHtml(skill) {
  const name = escapeHtml(skill?.name ?? 'New ability');
  const effect = escapeHtml(skill?.effect ?? '');
  const feat = escapeHtml(skill?.feat ?? '');
  return `<div class="skill-unlock-inner">
      <div class="skill-unlock-kicker">NEW ABILITY UNLOCKED</div>
      <div class="skill-unlock-name">🐾 ${name}</div>
      <div class="skill-unlock-effect">${effect}</div>
      ${feat ? `<div class="skill-unlock-feat">${feat} ✓</div>` : ''}
    </div>`;
}

// createUnlockCelebration(mount) — owns the card element's whole lifetime.
//
// `mount` is normally document.body (walk.js passes it, the same way it
// mounts the chat wheel). Injected rather than reached for so a test can hand
// in a detached node.
//
// Two abilities can complete on the same award (Sure Claws at 25 tip-overs
// and Big Swat at 40 cannot, but Spring Paws at 10 vantage perches and a
// future 10-something can), so show() QUEUES rather than clobbering: cards
// play one after another instead of the second replacing the first mid-read.
export function createUnlockCelebration(mount, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const queue = [];
  let el = null;
  let timers = [];
  let showing = false;

  function clearTimers() {
    for (const t of timers) clearTimer(t);
    timers = [];
  }

  function teardown() {
    clearTimers();
    if (el) {
      el.remove();
      el = null;
    }
    showing = false;
  }

  function next() {
    if (showing) return;
    const skill = queue.shift();
    if (!skill) return;
    showing = true;
    el = mount.ownerDocument.createElement('div');
    el.className = 'skill-unlock';
    el.innerHTML = cardHtml(skill);
    mount.appendChild(el);
    timers.push(setTimer(() => el && el.classList.add('fade'), HOLD_MS));
    timers.push(setTimer(() => {
      if (el) el.remove();
      el = null;
      showing = false;
      next();
    }, HOLD_MS + FADE_MS));
  }

  return {
    show(skill) {
      if (!skill) return;
      queue.push(skill);
      next();
    },
    // Not called by the walk lifecycle: an ability unlocked at endWalk is
    // celebrated ON endWalk, so tearing the queue down there would cancel the
    // very card that was just queued. The celebration owner is app-lifetime.
    // dispose() exists so a test (or a future teardown) can stop the timers.
    dispose() {
      queue.length = 0;
      teardown();
    },
    // test seams
    get pending() { return queue.length + (showing ? 1 : 0); },
    get element() { return el; },
  };
}
