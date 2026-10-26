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
// Plural names ("Star Sunglasses", "Golden Paw Booties") take no article: ''.
export function article(name) {
  const n = String(name ?? '').trim();
  if (/s$/i.test(n) && !/ss$/i.test(n)) return '';
  return /^[aeiou]/i.test(n) ? 'an' : 'a';
}

function aName(name) {
  const n = String(name ?? 'surprise');
  const a = article(n);
  return a ? `${a} ${n}` : n;
}

export function confettiHtml(visit, rng = Math.random, countOverride) {
  const count = countOverride ?? confettiCount(visit);
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
export function celebrationHtml(milestone, { petName, stage = 'start', thumb } = {}) {
  const m = milestone || {};
  const n = Number(m.visit) || 0;
  const prize = m.prize || {};
  const isNew = prize.isNew !== false;
  const name = escapeHtml(prize.name ?? 'surprise');
  const cat = escapeHtml(petName || 'Your cat');
  const style = m.style || 'A';
  const prizeShow = thumb
    ? `<img class="visit-cel-thumb" src="${escapeHtml(thumb)}" alt="${name}">`
    : `<div class="visit-cel-prize">${name}</div>`;
  const itsLine = `It's ${escapeHtml(aName(prize.name))}!`;
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
    else if (stage === 'revealed') bubble = `${itsLine}`;
    else if (n === 1) bubble = 'Hi! This is our first visit together. I found something for you…';
    else bubble = `You came back! This is our ${ordinal(n)} visit. I found something for you…`;
    // The hero cat wears the prize itself, so C never shows a thumbnail.
    let body = `<div class="visit-cel-bubble">${bubble}</div>`;
    if (!isNew) body += `<div class="visit-cel-side"><div class="visit-cel-prize">${name}</div>${wear}${yay}</div>`;
    else if (stage !== 'revealed') body += '<button class="visit-cel-gift" data-vc="open" aria-label="Open the present">🎁</button>';
    return `<div class="visit-cel-card">${body}</div>`;
  }

  // Style A
  if (!isNew) {
    return `<div class="visit-cel-card"><div class="visit-cel-title">Visit #${n}!</div>
      <div class="visit-cel-line">Remember this? You looked great in it!</div>
      ${prizeShow}${wear}${yay}</div>`;
  }
  if (stage === 'revealed') {
    return `<div class="visit-cel-card"><div class="visit-cel-title">Visit #${n}!</div>
      <div class="visit-cel-line">${itsLine}</div>
      ${prizeShow}${yay}</div>`;
  }
  return `<div class="visit-cel-card"><div class="visit-cel-title">Visit #${n}!</div>
    <div class="visit-cel-line">You've come back ${n} times!</div>
    <button class="visit-cel-btn gift" data-vc="open">🎁 Open it!</button></div>`;
}

const REVEAL_LOCK_MS = 500;
const GIFT_SIZE = 56; // px, matches .visit-cel-gift

function safe(fn, ...args) {
  try { fn(...args); } catch (err) { console.warn('visit celebration callback failed', err); }
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
    safe(onClose, reason);
  }

  function fadeThenClose(holdMs) {
    timers.push(setTimer(() => {
      if (root) root.classList.add('fade');
      timers.push(setTimer(() => finish('done'), FADE_MS));
    }, holdMs));
  }

  function focusButton(sel) {
    try { card?.querySelector?.(sel)?.focus?.(); } catch { /* focus is a nicety */ }
  }

  function setCard(stage) {
    const thumb = current.milestone.style === 'C' ? undefined : current.thumb;
    card.innerHTML = celebrationHtml(current.milestone, { petName: current.petName, stage, thumb });
  }

  // Style C hangs next to the cat. anchor is an Element or a () => DOMRect.
  function place(anchor) {
    const view = mount.ownerDocument?.defaultView;
    const vw = view?.innerWidth || 375;
    const vh = view?.innerHeight || 812;
    let rect = null;
    try {
      rect = typeof anchor === 'function' ? anchor() : anchor?.getBoundingClientRect?.();
    } catch { rect = null; }
    // The wrap covers the anchor (the cat's stage); CSS lays the bubble out
    // along its top-right and the present/actions down its right edge.
    let left; let top; let width; let height;
    if (rect && rect.width > 0) {
      left = rect.left; top = rect.top; width = rect.width; height = rect.height || rect.bottom - rect.top;
    } else {
      left = 12; top = vh * 0.12; width = vw - 24; height = 220; // upper third
    }
    left = Math.max(0, Math.min(left, vw - 1));
    width = Math.max(1, Math.min(width, vw - left));
    top = Math.max(0, top);
    const bubbleW = Math.min(width, Math.max(180, Math.floor(width * 0.58)));
    const giftX = Math.max(0, Math.round(width - 12 - GIFT_SIZE));
    card.classList.add('anchored');
    if (card.style) {
      card.style.cssText = `left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(width)}px;height:${Math.round(height)}px;--vc-bubble-w:${bubbleW}px;--vc-gift-x:${giftX}px`;
    }
  }

  function handleClick(ev) {
    if (!root || !current) return;
    const btn = ev?.target?.closest ? ev.target.closest('[data-vc]') : null;
    const action = btn?.dataset?.vc;
    const { milestone } = current;
    if (action === 'open' && !current.opened) {
      current.opened = true;
      // "Yay!" lands under the finger after the re-render; swallow the second
      // tap of a double-tap.
      current.locked = true;
      timers.push(setTimer(() => { if (current) current.locked = false; }, REVEAL_LOCK_MS));
      if (milestone.style === 'C') fadeThenClose(C_REVEAL_HOLD_MS);
      safe(onOpen, milestone);
      if (!root) return; // onOpen may have closed us
      setCard('revealed');
      root.classList.add('revealed');
      if (current.thumb && milestone.style !== 'C') {
        const burst = mount.ownerDocument.createElement('div');
        burst.innerHTML = confettiHtml(milestone.visit, rng, 30);
        root.appendChild(burst);
      }
      focusButton('[data-vc="done"]');
    } else if (action === 'wear') {
      safe(onWear, milestone.prize.id);
    } else if (action === 'done') {
      if (current.locked) return;
      finish('done');
    }
  }

  return {
    show(milestone, { petName, anchor, thumb } = {}) {
      if (root || !milestone) return false;
      const style = ['A', 'B', 'C'].includes(milestone.style) ? milestone.style : 'A';
      const m = { ...milestone, style };
      const isNew = m.prize?.isNew !== false;
      const doc = mount.ownerDocument;
      current = { milestone: m, petName, thumb, opened: false, locked: false };
      root = doc.createElement('div');
      root.className = `visit-cel style-${style.toLowerCase()}${isNew ? '' : ' cycle'}`;
      if (style === 'A') {
        root.setAttribute?.('role', 'dialog');
        root.setAttribute?.('aria-modal', 'true');
        root.setAttribute?.('aria-label', `Visit ${m.visit}`);
      } else {
        root.setAttribute?.('role', 'status');
      }
      root.innerHTML = (style === 'A' ? '<div class="visit-cel-dim"></div>' : '') + confettiHtml(m.visit, rng);
      card = doc.createElement('div');
      card.className = 'visit-cel-wrap';
      root.appendChild(card);
      root.addEventListener('click', handleClick);
      setCard('start');
      if (style === 'C') place(anchor);
      mount.appendChild(root);

      // Timers are armed before any callback runs, so a throwing callback
      // can never leave a card that never goes away.
      if (style === 'B') fadeThenClose(B_HOLD_MS);
      else if (!isNew && style === 'C') fadeThenClose(C_CYCLE_HOLD_MS);
      if (style === 'B' || !isNew) {
        current.opened = true;
        // A cycle-back has no present: the card itself is the reveal. main
        // must not wear anything when prize.isNew is false.
        safe(onOpen, m);
      } else {
        focusButton('[data-vc="open"]');
      }
      return true;
    },
    close(reason = 'done') {
      finish(reason === 'walk' ? 'walk' : 'done');
    },
    isOpen() { return !!root; },
  };
}
