import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PAW } from '../src/ui/pawicon.js';

// The home base's WebGL pieces can't run in node: stub the thumbnails, the hero
// stage and the dressing-room controller so createHomeBase can be driven.
vi.mock('../src/thumbnails.js', () => ({ menuThumbnails: () => ({ cats: {}, accessories: { partycrown: 'crown.png' } }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
// The last dressing room made: its options (onChange, onOpenSheet) and its ui,
// so a test can open the builder or a sheet the way the real controller does.
const dressingMock = vi.hoisted(() => ({ opts: null, ui: { builder: null } }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    dressingMock.opts = opts;
    dressingMock.ui = { builder: null };
    return {
      html: ({ headerHtml }) => `<header>${headerHtml}</header>`,
      afterRender() {}, handleClick() { return false; }, clearPreview() {},
      handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
      get ui() { return dressingMock.ui; },
    };
  },
}));

const { createHomeBase, visitBadgeHtml } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');
const { welcomeLine } = await import('../src/visits.js');

const KEY = 'whisker-walk-save';
function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// No jsdom here: a tiny element stand-in, enough for the home base's cards.
function fakeEl(doc) {
  const el = {
    ownerDocument: doc, className: '', innerHTML: '', textContent: '', id: '', type: '',
    children: [], listeners: {}, attrs: {}, style: {}, removed: false,
    classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); c.parent = el; },
    append(...cs) { for (const c of cs) el.appendChild(c); },
    addEventListener(t, f) { el.listeners[t] = f; },
    remove() { el.removed = true; if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el); },
    querySelector() { return null; },
    focus() {},
    after(c) { doc.body.appendChild(c); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 200, bottom: 200 }; },
  };
  el.classList = {
    add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c),
  };
  return el;
}
function fakeDocument() {
  const doc = { defaultView: { innerWidth: 375, innerHeight: 812 } };
  doc.createElement = () => fakeEl(doc);
  // Document-level listeners, with the options they were added with.
  doc.docListeners = [];
  doc.addEventListener = (t, f, o) => { doc.docListeners.push({ t, f, o }); };
  doc.removeEventListener = (t, f) => { doc.docListeners = doc.docListeners.filter((l) => !(l.t === t && l.f === f)); };
  doc.dispatchEvent = (e) => { for (const l of [...doc.docListeners]) if (l.t === e.type) l.f(e); };
  doc.body = fakeEl(doc);
  doc.root = fakeEl(doc);
  doc.root.classList.add('hidden');
  doc.getElementById = (id) => (id === 'homebase' ? doc.root : null);
  return doc;
}

let doc;
beforeEach(() => {
  vi.useFakeTimers();
  doc = fakeDocument();
  globalThis.document = doc;
});
afterEach(() => {
  vi.useRealTimers();
  delete globalThis.document;
});

function setup({ storage = memStorage(), onCelebrate, sync = null } = {}) {
  const progression = createProgression(storage);
  const album = { photos: [] };
  const settings = { get: () => null, set() {}, all: () => ({}) };
  const hb = createHomeBase({ progression, album, onStartWalk: () => {}, rooms: null, sync, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {}, onCelebrate });
  return { progression, hb };
}
const celebration = () => doc.body.children.find((c) => String(c.className).startsWith('visit-cel'));
const tap = (el, vc) => el.listeners.click({ target: { closest: () => ({ dataset: { vc } }) } });

describe('visitBadgeHtml', () => {
  it('shows the visit number with a paw, or confetti on a milestone', () => {
    expect(visitBadgeHtml(23)).toContain(`${PAW} Visit 23`);
    expect(visitBadgeHtml(23)).toContain('class="hb-pill dr-visit"');
    expect(visitBadgeHtml(30)).toContain('🎉 Visit 30');
    expect(visitBadgeHtml(1)).toContain('🎉 Visit 1');
  });
  it('shows nothing before the first visit or for junk', () => {
    expect(visitBadgeHtml(0)).toBe('');
    expect(visitBadgeHtml(undefined)).toBe('');
    expect(visitBadgeHtml('<b>')).toBe('');
  });
});

describe('the home base on a visit', () => {
  it('puts the visit pill in the top bar after the points and rank pills, before the Menu door', () => {
    const { progression, hb } = setup();
    progression.recordVisit();
    hb.show();
    const h = doc.root.innerHTML;
    expect(h).toMatch(/<\/h1><div class="hb-pill hb-points"[^>]*>[\s\S]*?<\/div><div class="hb-pill hb-rank">[\s\S]*?<\/div><div class="hb-pill dr-visit milestone">🎉 Visit 1<\/div><button class="hb-menu-btn"/);
  });

  it('a plain visit shows the welcome line and no celebration', () => {
    const storage = memStorage({ [KEY]: JSON.stringify({ version: 4, visits: 1, visitPrizesSeen: 1 }) });
    const { progression, hb } = setup({ storage });
    const visit = progression.recordVisit();
    expect(visit.milestone).toBe(null);
    hb.show();
    const onClosed = vi.fn();
    expect(hb.showVisit(visit, { onClosed })).toBe(false);
    expect(hb.visitOpen()).toBe(false);
    const line = doc.body.children.find((c) => c.className === 'visit-welcome');
    expect(line.textContent).toBe(welcomeLine(2));
    expect(celebration()).toBe(undefined);
    vi.advanceTimersByTime(6000);
    expect(line.removed).toBe(true);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('the welcome bubble closes when the page scrolls', () => {
    const storage = memStorage({ [KEY]: JSON.stringify({ version: 4, visits: 1, visitPrizesSeen: 1 }) });
    const { progression, hb } = setup({ storage });
    const visit = progression.recordVisit();
    hb.show();
    hb.showVisit(visit);
    const line = () => doc.body.children.find((c) => c.className === 'visit-welcome');
    expect(line()).toBeTruthy();
    const scrolls = doc.docListeners.filter((l) => l.t === 'scroll');
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0].o).toMatchObject({ capture: true, passive: true });
    // The scroll from the bubble's own appearance (within 60 ms) does not close it.
    doc.dispatchEvent({ type: 'scroll' });
    expect(line()).toBeTruthy();
    vi.advanceTimersByTime(100);
    doc.dispatchEvent({ type: 'scroll' });
    expect(line()).toBeUndefined();
    expect(doc.docListeners.filter((l) => l.t === 'scroll')).toHaveLength(0);
    expect(() => doc.dispatchEvent({ type: 'scroll' })).not.toThrow();
  });

  it('showing the welcome again does not leak scroll listeners', () => {
    const { hb } = setup();
    hb.show();
    const v = { milestone: null, visits: 2 };
    hb.showVisit(v);
    hb.showVisit(v);
    expect(doc.docListeners.filter((l) => l.t === 'scroll')).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    expect(doc.docListeners.filter((l) => l.t === 'scroll')).toHaveLength(0);
  });

  it('visit 1: news and notices yield, the present is worn, then onClosed runs', () => {
    const onCelebrate = vi.fn();
    const { progression, hb } = setup({ onCelebrate });
    const visit = progression.recordVisit();
    expect(visit.milestone.style).toBe('C');
    hb.show();
    const onClosed = vi.fn();
    expect(hb.showVisit(visit, { onClosed })).toBe(true);
    expect(hb.visitOpen()).toBe(true);
    expect(hb.showNews('<div>news</div>', null)).toBe(false);
    expect(hb.showNotice('Bye Rosa')).toBe(false);
    expect(progression.state.equipped.head).not.toBe('partycrown');
    tap(celebration(), 'open');
    expect(onCelebrate).toHaveBeenCalledTimes(1);
    expect(progression.state.equipped.head).toBe('partycrown');
    expect(progression.state.visitPrizePending).toBe(null);
    vi.advanceTimersByTime(10000);
    expect(hb.visitOpen()).toBe(false);
    expect(onClosed).toHaveBeenCalledWith('done');
    expect(hb.showNews('<div>news</div>', null)).toBe(true);
  });

  it('a walk starting mid-celebration closes it with walk and still wears the prize', () => {
    const { progression, hb } = setup();
    const visit = progression.recordVisit();
    hb.show();
    const onClosed = vi.fn();
    hb.showVisit(visit, { onClosed });
    hb.hide();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith('walk');
    expect(hb.visitOpen()).toBe(false);
    expect(progression.state.equipped.head).toBe('partycrown');
  });

  it('a cycle-back never changes the outfit unless Wear it is tapped', () => {
    // Visit 110: every prize is owned, so the milestone shows one again.
    const storage = memStorage({ [KEY]: JSON.stringify({ version: 4, visits: 109, visitPrizesSeen: 100 }) });
    const { progression, hb } = setup({ storage });
    const visit = progression.recordVisit();
    expect(visit.milestone.prize.isNew).toBe(false);
    hb.show();
    const before = JSON.stringify(progression.state.equipped);
    hb.showVisit(visit, { onClosed: () => {} });
    expect(JSON.stringify(progression.state.equipped)).toBe(before);
    const cel = celebration();
    tap(cel, 'wear');
    const { id, slot } = visit.milestone.prize;
    expect(progression.state.equipped[slot]).toBe(id);
  });

  it('a cycle-back closed without Wear it leaves the outfit alone', () => {
    const storage = memStorage({ [KEY]: JSON.stringify({ version: 4, visits: 109, visitPrizesSeen: 100 }) });
    const { progression, hb } = setup({ storage });
    const visit = progression.recordVisit();
    hb.show();
    const before = JSON.stringify(progression.state.equipped);
    const onClosed = vi.fn();
    hb.showVisit(visit, { onClosed });
    hb.hide();
    expect(onClosed).toHaveBeenCalledWith('walk');
    expect(JSON.stringify(progression.state.equipped)).toBe(before);
  });
});

describe('the welcome line beside the head', () => {
  // A plain visit (visit 2) with the home base up and the line showing.
  function plainVisit() {
    const storage = memStorage({ [KEY]: JSON.stringify({ version: 4, visits: 1, visitPrizesSeen: 1 }) });
    const { progression, hb } = setup({ storage });
    const visit = progression.recordVisit();
    hb.show();
    // The hero stage the line anchors to.
    const stageEl = fakeEl(doc);
    stageEl.getBoundingClientRect = () => ({ left: 0, top: 100, width: 390, height: 400, right: 390, bottom: 500 });
    doc.root.querySelector = (sel) => (sel === '#dr-stage' ? stageEl : null);
    hb.showVisit(visit, { onClosed: () => {} });
    const line = doc.body.children.find((c) => c.className === 'visit-welcome');
    expect(line).toBeTruthy();
    return { hb, line };
  }

  it('sits in the stage corner, clear of the cat\'s face', () => {
    const { line } = plainVisit();
    expect(line.attrs['data-side']).toBe('corner');
    expect(parseFloat(line.style.top)).toBeLessThan(100 + 400 * 0.1);
    expect(parseFloat(line.style.left) + parseFloat(line.style.maxWidth)).toBeLessThanOrEqual(390 - 100);
  });

  it('never goes up over an open sheet or the cat builder', () => {
    const storage = memStorage({ [KEY]: JSON.stringify({ version: 4, visits: 1, visitPrizesSeen: 1 }) });
    const { progression, hb } = setup({ storage });
    const visit = progression.recordVisit();
    hb.show();
    dressingMock.opts.onOpenSheet('settings');
    hb.showVisit(visit, { onClosed: () => {} });
    expect(doc.body.children.find((c) => c.className === 'visit-welcome')).toBe(undefined);
    dressingMock.opts.onOpenSheet(null);
    dressingMock.ui = { builder: { breed: 'tabby' } };
    hb.showVisit(visit, { onClosed: () => {} });
    expect(doc.body.children.find((c) => c.className === 'visit-welcome')).toBe(undefined);
  });

  it('goes at once when the cat builder opens', () => {
    const { line } = plainVisit();
    dressingMock.ui = { builder: { breed: 'tabby' } };
    dressingMock.opts.onChange();
    expect(line.removed).toBe(true);
    expect(doc.body.children.find((c) => c.className === 'visit-welcome')).toBe(undefined);
  });

  it('goes at once when a sheet opens', () => {
    const { line } = plainVisit();
    dressingMock.opts.onOpenSheet('settings');
    expect(line.removed).toBe(true);
  });

  it('goes at once when a walk starts', () => {
    const { hb, line } = plainVisit();
    hb.hide();
    expect(line.removed).toBe(true);
  });

  it('is a speech bubble with a tail, no centring translate, a smaller font', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const rule = css.match(/\.visit-welcome \{[^}]*\}/)[0];
    expect(rule).toContain('transform: none');
    expect(rule).toContain('0.9rem');
    expect(css).toMatch(/\.visit-welcome::before \{/);
    expect(css).toMatch(/\.visit-welcome\[data-side="left"\]::before \{/);
    expect(css).not.toMatch(/@keyframes visit-welcome \{[^@]*-50%/);
  });
});

describe('the cloud-load farewell', () => {
  // A cloud save with Rosa equipped queues her farewell while it loads.
  function withFarewell(progression) {
    let queued = null;
    progression.takeFarewell = vi.fn(() => { const l = queued; queued = null; return l; });
    return { queue: (l) => { queued = l; }, peek: () => queued };
  }
  const confirmLoad = () => doc.root.listeners.click({ target: { id: 'sync-confirm-load', dataset: {}, closest: () => null } });
  const notice = () => doc.body.children.find((c) => c.id === 'home-notice');

  it('stays queued while a celebration is up, and shows once it closes', async () => {
    const sync = { confirmLoad: vi.fn(async () => ({ ok: true })) };
    const { progression, hb } = setup({ sync });
    const fw = withFarewell(progression);
    const visit = progression.recordVisit();
    hb.show();
    // main's afterCards: the farewell goes up when the celebration closes.
    hb.showVisit(visit, { onClosed: () => { const l = progression.takeFarewell(); if (l) hb.showNotice(l); } });
    expect(hb.visitOpen()).toBe(true);
    fw.queue('Bye Rosa');
    await confirmLoad();
    expect(fw.peek()).toBe('Bye Rosa'); // not taken, so not lost
    tap(celebration(), 'open');
    vi.advanceTimersByTime(10000);
    expect(hb.visitOpen()).toBe(false);
    expect(fw.peek()).toBe(null);
    expect(notice()).toBeTruthy();
  });

  it('shows at once when nothing is in the way', async () => {
    const sync = { confirmLoad: vi.fn(async () => ({ ok: true })) };
    const { progression, hb } = setup({ sync });
    const fw = withFarewell(progression);
    hb.show();
    fw.queue('Bye Rosa');
    await confirmLoad();
    expect(fw.peek()).toBe(null);
    expect(notice()).toBeTruthy();
  });
});

describe('showVisit while the home base is hidden', () => {
  it('shows nothing over a walk, and wears the pending prize', () => {
    const { progression, hb } = setup();
    const visit = progression.recordVisit();
    hb.show();
    hb.hide(); // a room partner pressed Start during the splash
    const onClosed = vi.fn();
    expect(hb.showVisit(visit, { onClosed })).toBe(false);
    expect(hb.visitOpen()).toBe(false);
    expect(celebration()).toBe(undefined);
    expect(doc.body.children.find((c) => c.className === 'visit-welcome')).toBe(undefined);
    expect(onClosed).not.toHaveBeenCalled();
    expect(progression.state.equipped.head).toBe('partycrown');
  });
});

describe('the visit badge style', () => {
  it('is a quiet HUD pill, not pink, that still pops once on a milestone, and not at all under reduced motion', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const rule = css.match(/\.hb-pill\.dr-visit \{[^}]*\}/)[0];
    expect(rule).not.toContain('#ff8fb1');
    expect(rule).not.toMatch(/pink|#ff[0-9a-f]{4}/i);
    expect(rule).toMatch(/opacity: \.\d+/); // quiet
    expect(css).not.toMatch(/\.dr-chip\.visit/);
    expect(css).toMatch(/\.hb-pill\.dr-visit\.milestone \{[^}]*opacity: 1/);
    expect(css).toMatch(/\.hb-pill\.dr-visit\.milestone\.pop \{[^}]*animation/);
    expect(css).toMatch(/prefers-reduced-motion[^{]*\{[^}]*\.hb-pill\.dr-visit\.milestone\.pop \{ animation: none/);
  });
  it('pops the live badge when the celebration shows', () => {
    const { progression, hb } = setup();
    const visit = progression.recordVisit();
    hb.show();
    const badge = fakeEl(doc);
    doc.root.querySelector = (sel) => (sel === '.dr-visit' ? badge : null);
    hb.showVisit(visit, { onClosed: () => {} });
    expect(badge.classList.contains('pop')).toBe(true);
  });
  it('marks a milestone badge', () => {
    expect(visitBadgeHtml(30)).toContain('class="hb-pill dr-visit milestone"');
    expect(visitBadgeHtml(23)).toContain('class="hb-pill dr-visit"');
  });
});

describe('Settings keeps keyboard focus across its re-render', () => {
  // The focused control is in the sheet until the re-render replaces it.
  function focusOn(id) {
    const old = { id };
    doc.activeElement = old;
    const st = { fresh: null, rebuilt: false };
    let html = doc.root.innerHTML;
    Object.defineProperty(doc.root, 'innerHTML', {
      get: () => html, set: (v) => { html = v; st.rebuilt = true; }, configurable: true,
    });
    doc.root.contains = (el) => (el === old && !st.rebuilt) || (st.fresh != null && el === st.fresh);
    doc.root.querySelector = (sel) => {
      if (sel !== `#${id}`) return null;
      st.fresh = { id, focus: vi.fn(() => { doc.activeElement = st.fresh; }) };
      return st.fresh;
    };
    return st;
  }
  it('a switch keeps focus after it is toggled', () => {
    const { hb } = setup();
    hb.show();
    dressingMock.opts.onOpenSheet('settings');
    const st = focusOn('set-muted');
    doc.root.listeners.click({ target: { id: 'set-muted', checked: true, dataset: {}, closest: () => null } });
    expect(st.rebuilt).toBe(true);
    expect(doc.activeElement).toBe(st.fresh);
    expect(doc.activeElement.id).toBe('set-muted');
    expect(st.fresh.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('a select keeps focus after it changes', () => {
    const { hb } = setup();
    hb.show();
    dressingMock.opts.onOpenSheet('settings');
    const st = focusOn('set-quality');
    doc.root.listeners.change({ target: { id: 'set-quality', value: 'low', dataset: {}, closest: () => null } });
    expect(st.rebuilt).toBe(true);
    expect(doc.activeElement).toBe(st.fresh);
  });

  it('nothing focused in the sheet, nothing is focused after', () => {
    const { hb } = setup();
    hb.show();
    dressingMock.opts.onOpenSheet('settings');
    const st = focusOn('set-muted');
    doc.activeElement = doc.body; // focus is elsewhere
    doc.root.listeners.click({ target: { id: 'set-muted', checked: true, dataset: {}, closest: () => null } });
    expect(st.fresh).toBe(null);
    expect(doc.activeElement).toBe(doc.body);
  });
});
