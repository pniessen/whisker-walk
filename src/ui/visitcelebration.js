// Visit celebrations: the little moment that greets a player on a milestone
// visit (1, 5, 10, 20, ...). Three styles, all with confetti and a prize:
//   A  a dimmed full card with a present to open ("Open it!" -> "Yay!")
//   B  a small banner that fades by itself and never blocks Start
//   C  the cat "speaks" in a bubble, hands over a present, then lets go
//
// Like src/game/celebrate.js this is DOM plumbing around a pure, exported,
// escaped string function (celebrationHtml). The mount and the timers are
// injected so a test can drive it. It never touches progression or the save:
// wearing / granting is the caller's job via onOpen / onWear / onClose.

import { escapeHtml } from '../game/util.js';
import { confettiCount } from '../visits.js';

const B_HOLD_MS = 5000;
const FADE_MS = 700;
const C_REVEAL_HOLD_MS = 3000;
const C_CYCLE_HOLD_MS = 6000; // long enough to read and tap "Wear it"

const CONFETTI_COLORS = ['#ff8fb1', '#f2c14e', '#7ee2a0', '#7fc4ff', '#c79bff', '#ffffff'];

// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st, 101st, 111th.
export function ordinal(n) {
  const v = Math.abs(Math.trunc(Number(n) || 0));
  const last2 = v % 100;
  let suffix = 'th';
  if (last2 < 11 || last2 > 13) {
    const last = v % 10;
    if (last === 1) suffix = 'st';
    else if (last === 2) suffix = 'nd';
    else if (last === 3) suffix = 'rd';
  }
  return `${v}${suffix}`;
}

// "a" or "an" by the first letter, so "an Admiral Hat" works if one is added.
export function article(name) {
  return /^[aeiou]/i.test(String(name ?? '').trim()) ? 'an' : 'a';
}

function aName(name) {
  const n = String(name ?? 'surprise');
  return `${article(n)} ${n}`;
}

export function confettiHtml(visit, rng = Math.random) {
  const count = confettiCount(visit);
  let out = '<div class="visit-confetti" aria-hidden="true">';
  for (let i = 0; i < count; i++) {
    const left = (rng() * 100).toFixed(1);
    const delay = (rng() * 1.6).toFixed(2);
    const dur = (2.6 + rng() * 2).toFixed(2);
    const color = CONFETTI_COLORS[Math.floor(rng() * CONFETTI_COLORS.length) % CONFETTI_COLORS.length];
    out += `<i style="left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s;background:${color}"></i>`;
  }
  return `${out}</div>`;
}

// The inner markup of the card for one stage: 'start' (what shows first) or
// 'revealed' (after the present is opened). Cycle-backs have no present, so
// they only ever use 'start'. Pure and escaped.
export function celebrationHtml(milestone, { petName, stage = 'start' } = {}) {
  const m = milestone || {};
  const n = Number(m.visit) || 0;
  const prize = m.prize || {};
  const isNew = prize.isNew !== false;
  const name = escapeHtml(prize.name ?? 'surprise');
  const cat = escapeHtml(petName || 'your cat');
  const style = m.style || 'A';
  const wear = '<button class="visit-cel-btn secondary" data-vc="wear">Wear it</button>';
  const yay = '<button class="visit-cel-btn" data-vc="done">Yay!</button>';

  if (style === 'B') {
    if (isNew) {
      return `<div class="visit-cel-card"><div class="visit-cel-title">Visit ${n}!</div>
        <div class="visit-cel-line">${cat} got ${escapeHtml(aName(prize.name))}. It's already on!</div></div>`;
    }
    return `<div class="visit-cel-card"><div class="visit-cel-title">Visit ${n}!</div>
      <div class="visit-cel-line">Remember your ${name}? You looked great in it!</div>${wear}</div>`;
  }

  if (style === 'C') {
    let bubble;
    if (!isNew) bubble = `You came back! Visit ${n}! Remember this? You looked great in it!`;
    else if (stage === 'revealed') bubble = `It's ${escapeHtml(aName(prize.name))}!`;
    else if (n === 1) bubble = 'Hi! This is our first visit together. I found something for you…';
    else bubble = `You came back! This is our ${ordinal(n)} visit. I found something for you…`;
    let body = `<div class="visit-cel-bubble">${bubble}</div>`;
    if (!isNew) body += `<div class="visit-cel-prize">${name}</div>${wear}${yay}`;
    else if (stage === 'revealed') body += `<div class="visit-cel-prize">${name}</div>`;
    else body += '<button class="visit-cel-gift" data-vc="open" aria-label="Open the present">🎁</button>';
    return `<div class="visit-cel-card">${body}</div>`;
  }

  // Style A
  if (!isNew) {
    return `<div class="visit-cel-card"><div class="visit-cel-title">Visit #${n}!</div>
      <div class="visit-cel-line">Remember this? You looked great in it!</div>
      <div class="visit-cel-prize">${name}</div>${wear}${yay}</div>`;
  }
  if (stage === 'revealed') {
    return `<div class="visit-cel-card"><div class="visit-cel-title">Visit #${n}!</div>
      <div class="visit-cel-line">It's ${escapeHtml(aName(prize.name))}!</div>
      <div class="visit-cel-prize">${name}</div>${yay}</div>`;
  }
  return `<div class="visit-cel-card"><div class="visit-cel-title">Visit #${n}!</div>
    <div class="visit-cel-line">You've come back ${n} times!</div>
    <button class="visit-cel-btn gift" data-vc="open">🎁 Open it!</button></div>`;
}

export function createVisitCelebration(mount, {
  onOpen = () => {}, onWear = () => {}, onClose = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout, rng = Math.random,
} = {}) {
  let root = null;
  let card = null;
  let current = null;
  let timers = [];

  function clearTimers() {
    for (const t of timers) clearTimer(t);
    timers = [];
  }

  function teardown() {
    clearTimers();
    if (root) root.remove();
    root = null;
    card = null;
    current = null;
  }

  function finish(reason) {
    if (!root) return;
    teardown();
    onClose(reason);
  }

  function fadeThenClose(holdMs) {
    timers.push(setTimer(() => {
      if (root) root.classList.add('fade');
      timers.push(setTimer(() => finish('done'), FADE_MS));
    }, holdMs));
  }

  function setCard(stage) {
    card.innerHTML = celebrationHtml(current.milestone, { petName: current.petName, stage });
  }

  function handleClick(ev) {
    if (!root || !current) return;
    const btn = ev?.target?.closest ? ev.target.closest('[data-vc]') : null;
    const action = btn?.dataset?.vc;
    const { milestone } = current;
    if (action === 'open' && !current.opened) {
      current.opened = true;
      onOpen(milestone);
      setCard('revealed');
      root.classList.add('revealed');
      if (milestone.style === 'C') fadeThenClose(C_REVEAL_HOLD_MS);
    } else if (action === 'wear') {
      onWear(milestone.prize.id);
    } else if (action === 'done') {
      finish('done');
    }
  }

  return {
    show(milestone, { petName } = {}) {
      if (root || !milestone) return false;
      const style = ['A', 'B', 'C'].includes(milestone.style) ? milestone.style : 'A';
      const m = { ...milestone, style };
      const isNew = m.prize?.isNew !== false;
      const doc = mount.ownerDocument;
      current = { milestone: m, petName, opened: false };
      root = doc.createElement('div');
      root.className = `visit-cel style-${style.toLowerCase()}${isNew ? '' : ' cycle'}`;
      root.setAttribute?.('role', 'dialog');
      root.innerHTML = (style === 'B' ? '' : '<div class="visit-cel-dim"></div>') + confettiHtml(m.visit, rng);
      card = doc.createElement('div');
      card.className = 'visit-cel-wrap';
      root.appendChild(card);
      root.addEventListener('click', handleClick);
      setCard('start');
      mount.appendChild(root);

      if (style === 'B') {
        onOpen(m);
        fadeThenClose(B_HOLD_MS);
      } else if (!isNew) {
        // A cycle-back has no present to open: the card itself is the reveal.
        // The player is the one who chooses to wear it, so onOpen is just the
        // "something nice happened" signal; main must not wear anything.
        current.opened = true;
        onOpen(m);
        if (style === 'C') fadeThenClose(C_CYCLE_HOLD_MS);
      }
      return true;
    },
    close(reason = 'done') {
      finish(reason === 'walk' ? 'walk' : 'done');
    },
    isOpen() { return !!root; },
  };
}
