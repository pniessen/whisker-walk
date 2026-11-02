// The walk summary's small pieces: a warm cheer line, the stat tiles, the
// numbers that count up, and confetti for a new best walk. Looks only — the
// numbers come in already worked out, and nothing here touches the save.
// No Math.random: the confetti draws from a seeded mulberry32.

import { escapeHtml } from '../game/util.js';
import { confettiHtml } from './visitcelebration.js';
import { mulberry32, seedFromCode } from '../rng.js';

const CHEERS = ['What a walk!', 'Great exploring!', 'Happy paws!', 'You did it!', 'Lovely walk!'];

// Same walk, same cheer: a fixed pick, never a random one.
export function summaryCheer(earned, discoveries) {
  const n = Math.abs(Math.trunc((Number(earned) || 0) + (Number(discoveries) || 0)));
  return CHEERS[n % CHEERS.length];
}

// The in-game setting OR the OS setting. Tests (and old browsers) have no
// matchMedia; then the setting alone decides.
export function prefersReducedMotion(settings) {
  if (settings?.get?.('reducedMotion')) return true;
  const mm = globalThis.matchMedia;
  if (typeof mm !== 'function') return false;
  try { return !!mm('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// Every [data-count] inside root counts 0 → N with an ease-out. The markup
// already holds the final text, so nothing is written until the first frame
// and a frame that never comes leaves the right number. Reduced motion: the
// final text at once, no frames.
export function countUp(root, {
  reduced = false,
  raf = globalThis.requestAnimationFrame,
  now = () => performance.now(),
  ms = 900,
} = {}) {
  const items = [...(root?.querySelectorAll?.('[data-count]') ?? [])].map((el) => ({
    el, n: Number(el.dataset.count) || 0, suffix: el.dataset.suffix ?? '',
  }));
  const write = (k) => {
    for (const { el, n, suffix } of items) el.textContent = `${Math.round(n * k)}${suffix}`;
  };
  if (!items.length) return;
  if (reduced || typeof raf !== 'function') { write(1); return; }
  const start = now();
  const frame = () => {
    const t = Math.min(1, Math.max(0, (now() - start) / ms));
    write(1 - (1 - t) ** 3);
    if (t < 1) raf(frame);
  };
  raf(frame);
}

// A new best walk gets a shower of confetti, the same every time for the
// same score. None under reduced motion.
export function bestWalkConfetti(earned, { reduced = false } = {}) {
  if (reduced) return '';
  return confettiHtml(0, mulberry32(seedFromCode(`best-walk-${earned}`)), 40);
}

function tile(emoji, value, label, suffix = '') {
  const v = Number(value) || 0;
  const suf = suffix ? ` data-suffix="${escapeHtml(suffix)}"` : '';
  return `<div class="stat"><span class="stat-emoji" aria-hidden="true">${emoji}</span>`
    + `<span class="stat-value" data-count="${v}"${suf}>${v}${escapeHtml(suffix)}</span>`
    + `<span class="stat-label">${label}</span></div>`;
}

// The stat tiles. A walk with no goals (the den) has no goals tile at all,
// rather than a "0/3".
export function summaryStatsHtml({ earned, discoveries, friendsGreeted, goalsDone, hasGoals }) {
  return `<div class="summary-stats">${tile('🐾', earned, 'whisker points')}`
    + `${tile('🔍', discoveries, 'discoveries')}`
    + `${tile('😺', friendsGreeted, 'cats greeted')}`
    + `${hasGoals ? tile('⭐', goalsDone, 'goals done', '/3') : ''}</div>`;
}

// One Settings toggle row. The whole row is a <label>, so tapping the words
// flips it; the real checkbox stays underneath (role="switch", keyboard,
// focus) and the drawn track + knob after it is only a picture of it.
export function settingsSwitchHtml(id, checked, text) {
  return `<label class="settings-row settings-switch"><span class="settings-label">${escapeHtml(text)}</span>`
    + `<input type="checkbox" role="switch" id="${escapeHtml(id)}" ${checked ? 'checked ' : ''}/><span class="switch" aria-hidden="true"></span></label>`;
}
