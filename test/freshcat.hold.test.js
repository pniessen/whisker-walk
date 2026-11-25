// The hold-to-confirm button: a fake clock for the rule, and fake elements for touch, mouse, keyboard and pad.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHold, makeHoldButton, ringFill, HOLD_MS } from '../src/ui/freshcat.js';
import { fakeEl, fakeNav } from './helpers/fakecard.js';

describe('the hold rule (fake clock)', () => {
  const make = () => {
    let t = 1000;
    const log = { done: 0, early: 0, p: [] };
    const hold = createHold({ now: () => t, onProgress: (p) => log.p.push(p), onDone: () => { log.done += 1; }, onEarly: () => { log.early += 1; } });
    return { hold, log, at: (ms) => { t = 1000 + ms; hold.tick(); } };
  };
  it('is two seconds', () => expect(HOLD_MS).toBe(2000));
  it('holding the whole time completes, once', () => {
    const { hold, log, at } = make();
    hold.start('pointer');
    at(500); at(1999);
    expect(log.done).toBe(0);
    at(2000); at(2500);
    expect(log.done).toBe(1);
    expect(hold.done).toBe(true);
  });
  it('letting go early cancels and starts over from nothing', () => {
    const { hold, log, at } = make();
    hold.start('pointer'); at(1500);
    hold.release('pointer');
    expect(log.early).toBe(1);
    expect(log.p.at(-1)).toBe(0);
    at(5000); // nothing is held: time passing does nothing
    expect(log.done).toBe(0);
    hold.start('pointer');
    at(5000 + 1999); // the clock of the first try does not count
    expect(log.done).toBe(0);
  });
  it('two inputs may hold at once: the hold ends only when both let go', () => {
    const { hold, log, at } = make();
    hold.start('key'); at(500);
    hold.start('pad');
    hold.release('key');
    expect(log.early).toBe(0);
    at(2000);
    expect(log.done).toBe(1);
  });
  it('a release of something that was not held changes nothing', () => {
    const { hold, log } = make();
    hold.release('key');
    expect(log.early).toBe(0);
  });
  it('the ring fills smoothly, or in quarters for reduced motion', () => {
    expect(ringFill(0.37, false)).toBe(0.37);
    expect(ringFill(0.37, true)).toBe(0.25);
    expect(ringFill(0.99, true)).toBe(0.75);
    expect(ringFill(1, true)).toBe(1);
    expect(ringFill(-1, false)).toBe(0);
    expect(ringFill(5, false)).toBe(1);
  });
});

describe('the hold button on the card', () => {
  let yes; let status; let ring; let enabled; let pad; let button; let clicks;
  const api = (extra = {}) => ({ phrase: (id) => id, escapeHtml: (s) => s, tvState: { input: 'keys' }, reduced: () => false, ...extra });
  const build = (a = api()) => {
    yes = fakeEl('confirm-card-yes');
    yes.setAttribute('data-confirm', 'yes');
    status = fakeEl();
    ring = fakeEl();
    yes.children['.fill'] = ring;
    clicks = 0;
    yes.click = () => { clicks += 1; yes.fire('click', { detail: 0 }); };
    pad = fakeNav();
    enabled = true;
    button = makeHoldButton(yes, { status: () => status, ring: () => ring, enabled: () => enabled }, { a, nav: pad.nav, now: () => Date.now() });
    button.set('Hold to start fresh');
  };
  beforeEach(() => { vi.useFakeTimers(); build(); });
  afterEach(() => { button.stop(); vi.useRealTimers(); });

  it('takes the Yes answer off the button until the hold is complete', () => {
    expect(yes.getAttribute('data-confirm')).toBe(null);
    expect(yes.innerHTML).toContain('fresh-ring');
    expect(yes.getAttribute('aria-label')).toBe('fresh.hold.label');
  });

  it('a mouse or finger held for two seconds answers Yes; the ring fills on the way', () => {
    yes.fire('pointerdown', { button: 0 });
    vi.advanceTimersByTime(1000);
    const half = Number(ring.style.strokeDashoffset);
    expect(half).toBeGreaterThan(40);
    expect(half).toBeLessThan(60);
    expect(yes.getAttribute('data-confirm')).toBe(null);
    vi.advanceTimersByTime(1100);
    expect(yes.getAttribute('data-confirm')).toBe('yes');
    expect(clicks).toBe(1);
  });

  it('letting go early answers nothing and says so; the ring empties', () => {
    yes.fire('pointerdown', { button: 0 });
    vi.advanceTimersByTime(1500);
    yes.fire('pointerup');
    expect(status.textContent).toBe('fresh.hold.early');
    expect(Number(ring.style.strokeDashoffset)).toBeCloseTo(100.53, 1);
    vi.advanceTimersByTime(5000);
    expect(yes.getAttribute('data-confirm')).toBe(null);
    expect(clicks).toBe(0);
  });

  it('sliding off the button, or the touch being cancelled, is a release', () => {
    for (const t of ['pointerleave', 'pointercancel']) {
      yes.fire('pointerdown', { button: 0 });
      vi.advanceTimersByTime(1000);
      yes.fire(t);
      vi.advanceTimersByTime(3000);
      expect(clicks).toBe(0);
    }
  });

  it('a right click does not hold, and a long-press menu is stopped', () => {
    yes.fire('pointerdown', { button: 2 });
    vi.advanceTimersByTime(3000);
    expect(clicks).toBe(0);
    expect(yes.fire('contextmenu').prevented).toBe(true);
  });

  it('holding Enter or Space completes; repeats do not restart it; keyup early cancels', () => {
    for (const key of ['Enter', ' ']) {
      build();
      const down = yes.fire('keydown', { key });
      expect(down.prevented).toBe(true);
      vi.advanceTimersByTime(800);
      yes.fire('keydown', { key, repeat: true }); // the key repeating
      vi.advanceTimersByTime(1300);
      expect(clicks, key).toBe(1);
    }
    build();
    yes.fire('keydown', { key: 'Enter' });
    vi.advanceTimersByTime(1000);
    expect(yes.fire('keyup', { key: 'Enter' }).prevented).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(clicks).toBe(0);
    yes.fire('keydown', { key: 'a' });
    vi.advanceTimersByTime(3000);
    expect(clicks).toBe(0);
  });

  it('holding X on a pad completes; A (a click) only says how', () => {
    pad.hold(2);
    vi.advanceTimersByTime(1000);
    pad.hold(2, false);
    vi.advanceTimersByTime(200);
    expect(clicks).toBe(0); // let go early
    pad.hold(2);
    vi.advanceTimersByTime(2300);
    expect(clicks).toBe(1);
    build();
    pad.hold(0); // A is another button: the pad's own press makes a click, which holds nothing
    vi.advanceTimersByTime(3000);
    expect(clicks).toBe(0);
    yes.fire('click', {});
    expect(status.textContent).toBe('fresh.hold.tap');
    expect(yes.getAttribute('data-confirm')).toBe(null);
  });

  it('a plain tap or a screen reader activation answers nothing', () => {
    const ev = yes.fire('click', { detail: 1 });
    expect(ev.prevented).toBe(true);
    expect(yes.getAttribute('data-confirm')).toBe(null);
    expect(clicks).toBe(0);
  });

  it('does nothing while it is not enabled (the cloud is still being asked)', () => {
    enabled = false;
    yes.fire('pointerdown', { button: 0 });
    pad.hold(2);
    vi.advanceTimersByTime(4000);
    expect(clicks).toBe(0);
  });

  it('reduced motion: the ring moves in quarters and has no transition class off', () => {
    build(api({ reduced: () => true }));
    expect(yes.classes.has('reduced')).toBe(true);
    yes.fire('pointerdown', { button: 0 });
    vi.advanceTimersByTime(700);
    const off = Number(ring.style.strokeDashoffset);
    expect([100.53, 75.3975, 50.265, 25.1325, 0].some((v) => Math.abs(v - off) < 0.01)).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(clicks).toBe(1);
  });

  it('on a TV with the pad as the input, the button shows the pad button picture', () => {
    build(api({ tvState: { input: 'pad', html: (t) => `<i>${t}</i>` } }));
    expect(yes.innerHTML).toContain('<i>⟦interact⟧</i>');
    build(api({ tvState: { input: 'keys', html: (t) => `<i>${t}</i>` } }));
    expect(yes.innerHTML).not.toContain('⟦');
  });

  it('stops its timers when the card goes away', () => {
    pad.hold(2);
    yes.isConnected = false;
    vi.advanceTimersByTime(500);
    expect(vi.getTimerCount()).toBe(0);
    expect(clicks).toBe(0);
  });
});
