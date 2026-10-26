import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The home base's WebGL pieces can't run in node: stub the thumbnails, the hero
// stage and the dressing-room controller so createHomeBase can be driven.
vi.mock('../src/thumbnails.js', () => ({ menuThumbnails: () => ({ cats: {}, accessories: { partycrown: 'crown.png' } }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: () => ({
    html: ({ headerHtml }) => `<header>${headerHtml}</header>`,
    afterRender() {}, handleClick() { return false; }, clearPreview() {},
  }),
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

function setup({ storage = memStorage(), onCelebrate } = {}) {
  const progression = createProgression(storage);
  const album = { photos: [] };
  const settings = { get: () => null, set() {}, all: () => ({}) };
  const hb = createHomeBase(progression, album, () => {}, null, null, null, settings, () => {}, () => {}, null, 'me', () => {}, onCelebrate);
  return { progression, hb };
}
const celebration = () => doc.body.children.find((c) => String(c.className).startsWith('visit-cel'));
const tap = (el, vc) => el.listeners.click({ target: { closest: () => ({ dataset: { vc } }) } });

describe('visitBadgeHtml', () => {
  it('shows the visit number with a paw, or confetti on a milestone', () => {
    expect(visitBadgeHtml(23)).toContain('🐾 Visit 23');
    expect(visitBadgeHtml(23)).toContain('class="dr-chip visit"');
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
  it('puts the badge right after the title, before the points chip', () => {
    const { progression, hb } = setup();
    progression.recordVisit();
    hb.show();
    const h = doc.root.innerHTML;
    expect(h).toMatch(/<\/h1><div class="dr-chip visit milestone">🎉 Visit 1<\/div><div class="dr-chip gold">/);
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
  it('is a filled pink badge that pops once on a milestone, still under reduced motion', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const rule = css.match(/\.dr-chip\.visit \{[^}]*\}/)[0];
    expect(rule).toContain('#ff8fb1');
    expect(rule).toContain('#3b0f22');
    expect(css).toMatch(/\.dr-chip\.visit\.milestone\.pop \{[^}]*animation/);
    expect(css).toMatch(/prefers-reduced-motion[^{]*\{[^}]*\.dr-chip\.visit\.milestone\.pop \{ animation: none/);
  });
  it('pops the live badge when the celebration shows', () => {
    const { progression, hb } = setup();
    const visit = progression.recordVisit();
    hb.show();
    const badge = fakeEl(doc);
    doc.root.querySelector = (sel) => (sel === '.dr-chip.visit' ? badge : null);
    hb.showVisit(visit, { onClosed: () => {} });
    expect(badge.classList.contains('pop')).toBe(true);
  });
  it('marks a milestone badge', () => {
    expect(visitBadgeHtml(30)).toContain('class="dr-chip visit milestone"');
    expect(visitBadgeHtml(23)).toContain('class="dr-chip visit"');
  });
});
