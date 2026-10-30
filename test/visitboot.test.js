import { describe, it, expect, vi } from 'vitest';
import { whenSplashGone, startVisitGreeting } from '../src/visitboot.js';

function fakeWin() {
  const listeners = {};
  return {
    listeners,
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
    fire(t) { for (const f of [...(listeners[t] || [])]) f(); },
    setTimeout: () => 0,
  };
}
const docWith = (splash) => ({ getElementById: (id) => (id === 'splash' && splash ? {} : null) });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('whenSplashGone', () => {
  it('resolves at once with no splash, or when it is already done', async () => {
    await expect(whenSplashGone({ win: fakeWin(), doc: docWith(false) })).resolves.toBeUndefined();
    const win = fakeWin(); win.__splashDone = true;
    await expect(whenSplashGone({ win, doc: docWith(true) })).resolves.toBeUndefined();
    await expect(whenSplashGone({ win: undefined, doc: undefined })).resolves.toBeUndefined();
  });
  it('waits for splash-hidden while the splash is up', async () => {
    const win = fakeWin();
    let done = false;
    whenSplashGone({ win, doc: docWith(true) }).then(() => { done = true; });
    await flush();
    expect(done).toBe(false);
    win.fire('splash-hidden');
    await flush();
    expect(done).toBe(true);
    expect(win.listeners['splash-hidden']).toEqual([]);
  });
  it('falls back to a timer', async () => {
    const win = fakeWin();
    let fallback = null;
    win.setTimeout = (f) => { fallback = f; return 1; };
    let done = false;
    whenSplashGone({ win, doc: docWith(true) }).then(() => { done = true; });
    fallback();
    await flush();
    expect(done).toBe(true);
  });
});

function harness({ milestone, shows = !!milestone, walking = false }) {
  const log = [];
  let release;
  const splashGone = new Promise((r) => { release = r; });
  let onClosed = null;
  const homebase = {
    showVisit: vi.fn((v, opts) => { log.push('greeting'); onClosed = opts.onClosed; return shows; }),
  };
  const g = startVisitGreeting({
    visit: { visits: milestone ? 5 : 3, milestone: milestone ? { visit: 5 } : null },
    homebase,
    showFarewell: () => log.push('farewell'),
    showNews: () => log.push('news'),
    splashGone,
    walkActive: () => walking,
  });
  return { log, g, homebase, release: async () => { release(); await g.ready; }, close: (r) => onClosed(r) };
}

describe('startVisitGreeting', () => {
  it('a plain visit: the farewell now, the greeting after the splash, no news from here', async () => {
    const h = harness({ milestone: false });
    expect(h.log).toEqual(['farewell']);
    expect(h.g.holding()).toBe(false);
    await flush();
    expect(h.homebase.showVisit).not.toHaveBeenCalled();
    await h.release();
    expect(h.log).toEqual(['farewell', 'greeting']);
  });

  it('a milestone: nothing until the splash goes, then farewell and news after it closes', async () => {
    const h = harness({ milestone: true });
    expect(h.log).toEqual([]);
    expect(h.g.holding()).toBe(true);
    await h.release();
    expect(h.log).toEqual(['greeting']);
    expect(h.g.holding()).toBe(true);
    h.close('done');
    expect(h.log).toEqual(['greeting', 'farewell', 'news']);
    expect(h.g.holding()).toBe(false);
  });

  it('a milestone closed by a walk shows nothing more', async () => {
    const h = harness({ milestone: true });
    await h.release();
    h.close('walk');
    expect(h.log).toEqual(['greeting']);
    expect(h.g.holding()).toBe(false);
  });

  it('a milestone that could not show still runs the cards, unless a walk began', async () => {
    const h = harness({ milestone: true, shows: false });
    await h.release();
    expect(h.log).toEqual(['greeting', 'farewell', 'news']);
    const w = harness({ milestone: true, shows: false, walking: true });
    await w.release();
    expect(w.log).toEqual(['greeting']);
    expect(w.g.holding()).toBe(false);
  });
});

describe('startVisitGreeting when showVisit throws', () => {
  it('lets go of the hold, still shows the farewell and news, and ready resolves', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = [];
    const g = startVisitGreeting({
      visit: { visits: 5, milestone: { visit: 5 } },
      homebase: { showVisit: () => { throw new Error('boom'); } },
      showFarewell: () => log.push('farewell'),
      showNews: () => log.push('news'),
      splashGone: Promise.resolve(),
    });
    expect(g.holding()).toBe(true);
    await expect(g.ready).resolves.toBeUndefined();
    expect(g.holding()).toBe(false);
    expect(log).toEqual(['farewell', 'news']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a plain visit: the farewell already went up, nothing doubles', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = [];
    const g = startVisitGreeting({
      visit: { visits: 3, milestone: null },
      homebase: { showVisit: () => { throw new Error('boom'); } },
      showFarewell: () => log.push('farewell'),
      showNews: () => log.push('news'),
      splashGone: Promise.resolve(),
    });
    await expect(g.ready).resolves.toBeUndefined();
    expect(g.holding()).toBe(false);
    expect(log).toEqual(['farewell']);
    warn.mockRestore();
  });
});
