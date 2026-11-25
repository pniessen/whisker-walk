import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';
stubCanvasDocument();
const { walkHarness, areas, fakeEl } = await import('./helpers/walkharness.js');
const { teleKit } = await import('./helpers/tele.js');
const { GATE_MOMENT_MS } = await import('../src/gatecross.js');
const { setTele } = await import('../src/teleflag.js');
const { teleLoad } = await import('../src/telehook.js');
const { registerSuitKit } = await import('../src/suithook.js');
const { setMoon } = await import('../src/moonflag.js');
const { createHud } = await import('../src/ui/hud.js');
const { takeStartLines } = await import('../src/game/walk.js');
const { phrase } = await import('../src/clanphrases.js');
const { withOffWords } = await import('./helpers/offwords.js');
const THREE = await import('three');
const { build } = await import('../src/world/moon.js');
const { createProgression } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { bus } = await import('../src/events.js');
const { mem } = await import('./helpers/lighthouselife.js');
const { fakePage } = await import('./helpers/moonpage.js');
const { mulberry32 } = await import('../src/rng.js');
await teleKit();

class FakeEl {
  constructor() { this.children = []; this.own = ''; this.cls = new Set(); this.style = {}; this.attrs = {};
    this.classList = { toggle: (c, on) => { if (on) this.cls.add(c); else this.cls.delete(c); }, add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), contains: (c) => this.cls.has(c) }; }
  get textContent() { return this.own + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.own = String(v); this.children = []; }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  addEventListener() {}
  removeEventListener() {}
  insertBefore(c) { return this.appendChild(c); }
  contains() { return false; }
  querySelector() { return new FakeEl(); }
  querySelectorAll() { return []; }
  remove() { if (!this.parent) return; const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; }
  getContext() { return fakeEl().getContext(); }
}
const timeline = [];
function pageDoc() {
  const byId = new Map();
  const root = new FakeEl();
  Object.defineProperty(root, 'innerHTML', { set(html) { byId.clear(); for (const m of html.matchAll(/<div class="([^"]*)" id="([^"]+)"/g)) { const e = new FakeEl(); e.className = m[1]; byId.set(m[2], e); } for (const m of html.matchAll(/<span id="([^"]+)"/g)) byId.set(m[1], new FakeEl()); } });
  root.querySelector = (sel) => byId.get(sel.slice(1)) ?? null;
  return { byId, root, doc: { body: Object.assign(new FakeEl(), { querySelector: () => null }), getElementById: () => root, createElement: () => new FakeEl(), querySelector: () => null, addEventListener() {}, removeEventListener() {} } };
}

function save(p, moon) {
  p.setTutorialFirst('done');
  p.state.unlocked.areas.push('park');
  p.state.walks.park = 2;
  p.setArea('park');
  p.state.unlocked.accessories.push('raincoat');
  p.state.equipped.body = 'raincoat';
  p.addPoints(100);
  if (moon) p.state.moon = { ...p.state.moon, ...moon };
}
beforeAll(async () => { setTele(true); await teleLoad(); await areas.ensureAll(['park', 'moon']); });

async function arrive({ touch = true, moon = null, direct = false, bonus = false } = {}) {
  setTele(true); registerSuitKit(null);
  const pg = pageDoc();
  globalThis.document = pg.doc;
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-11-24T15:01:07Z') });
  const stream = mulberry32(20261124);
  vi.spyOn(Math, 'random').mockImplementation(() => stream());
  const hud = createHud();
  const h = walkHarness({ save: (p) => save(p, moon), isTouch: touch, onWalkedOn: (l) => { for (const x of l) if (!bonus && /streak|BEST/.test(x)) continue; else hud.toast(x); } });
  if (direct) { setMoon(true); setTele(false); h.w.startWalk({ areaOverride: 'moon' }); }
  else { h.w.startWalk({}); await h.w.walkOn({ via: 'park-moon' }); vi.advanceTimersByTime(GATE_MOMENT_MS); }
  const s = h.getSession();
  if (s.started !== false || touch) for (const l of takeStartLines(s)) if (bonus || !/streak|BEST/.test(l)) hud.toast(l); // the engage
  return { h, s, hud, pg };
}
const shown = (pg) => (pg.byId.get('hud-toasts')?.children ?? []).map((c) => c.textContent);


// The owner's bug (2026-11-25): arriving on the Moon through the Park's gate (?gates=1) gave no prompt to help Pip. Two causes. (1) The written guide
// (goal line, edge arrow, Pip's words) never mounted in the real game: walk.js's life context carries no page, and moonlife.js handed the guide
// `doc` as undefined (every test injected one). (2) The hint toast waited 3.6 s behind the greeting and, on a phone's one toast slot, behind the
// gate's two lines: 12 s. These walk the real gate hand-off, the real Moon life and the real HUD toast queue.
const { startProfile, stopProfile } = await import('../src/profile.js');
const cam = new THREE.PerspectiveCamera();
const GOAL = () => phrase('moon.guide.pip');
const HINT = () => phrase('moon.pip.hint');

async function film(opts, secs = 20) {
  const win = { location: { search: `?profile=${opts.profile}` }, matchMedia: () => ({ matches: false }), navigator: {}, innerWidth: 1000, innerHeight: 700, addEventListener() {}, removeEventListener() {} };
  startProfile(win, { body: { classList: { add() {} } }, documentElement: { classList: { toggle() {} } } });
  const { s, pg } = await arrive(opts);
  const g = s.areaLife.guide.state;
  const at = {}; // second -> what was up
  const hintAt = [];
  for (let i = 0; i <= secs * 30; i++) {
    s.areaLife.update(1 / 30, i / 30, s.cat.position, cam, s);
    const toasts = shown(pg);
    if (toasts.includes(HINT()) && !hintAt.length) hintAt.push(i / 30);
    if (i % 15 === 0) at[i / 30] = { toasts, goal: g.lineOn ? g.text : '', arrow: g.arrowOn ? g.metres : 0 };
    vi.advanceTimersByTime(1000 / 30);
  }
  return { at, hintAt: hintAt[0] ?? null, s };
}

describe('arriving on the Moon through the gate, first time (Pip asleep)', () => {
  afterEach(() => { stopProfile(); delete globalThis.document; vi.restoreAllMocks(); vi.useRealTimers(); registerSuitKit(null); setMoon(null); setTele(null); });
  for (const [name, o] of [['iPad', { touch: true, profile: 'tablet' }], ['phone', { touch: true, profile: 'phone' }], ['laptop', { touch: false, profile: 'laptop' }]]) {
    it(`${name}: the goal line and the arrow are up at once, the hint to wake Pip within about 5 s`, async () => {
      const f = await film(o);
      expect(f.at[0.5].goal).toBe(GOAL());
      expect(f.at[0.5].arrow).toBeGreaterThanOrEqual(10); // about 13 m from where he sleeps, the edge arrow points at him
      expect(f.at[0.5].arrow).toBeLessThanOrEqual(20);
      expect(f.hintAt).not.toBeNull();
      expect(f.hintAt).toBeLessThanOrEqual(o.profile === 'phone' ? 6 : 5); // a phone has ONE toast slot: the suit, the way home, then the hint
      expect(f.at[0.5].goal).toBe(f.at[4].goal); // and stays
    });
  }
  it('?moon=1 direct gives the same cues', async () => {
    const f = await film({ touch: false, profile: 'laptop', direct: true });
    expect(f.at[0.5].goal).toBe(GOAL());
    expect(f.hintAt).toBeLessThanOrEqual(2);
  });
  it('an iPad whose Park walk also banked a best and a streak still gets the hint by 6 s', async () => {
    const f = await film({ touch: true, profile: 'tablet', bonus: true });
    expect(f.at[0.5].goal).toBe(GOAL());
    expect(f.hintAt).toBeLessThanOrEqual(6);
  });
  it('the everyday word set says the same things in its own words', async () => {
    await withOffWords(async () => {
      const f = await film({ touch: true, profile: 'tablet' });
      expect(f.at[0.5].goal).toBe(phrase('moon.guide.pip'));
      expect(f.at[0.5].goal.length).toBeGreaterThan(10);
      expect(f.hintAt).toBeLessThanOrEqual(5);
    });
  });
});

describe('arriving through the gate with the story already begun', () => {
  afterEach(() => { stopProfile(); delete globalThis.document; vi.restoreAllMocks(); vi.useRealTimers(); registerSuitKit(null); setMoon(null); setTele(null); });
  it('Pip awake (saved on another device): the goal line names the NEXT goal, no wake-Pip hint', async () => {
    const f = await film({ touch: true, profile: 'tablet', moon: { step: 4, cells: 3 } });
    expect(f.at[0.5].goal).not.toBe('');
    expect(f.at[0.5].goal).not.toBe(GOAL());
    expect(f.at[0.5].arrow).toBeGreaterThan(0);
    expect(f.hintAt).toBeNull();
    expect(Object.values(f.at).flatMap((x) => x.toasts)).toContain(phrase('moon.arrive'));
  });
  it('a first power cell carried over (step 1): the goal line points on, no wake-Pip hint', async () => {
    const f = await film({ touch: false, profile: 'laptop', moon: { step: 1 } });
    expect(f.at[0.5].goal).not.toBe(GOAL());
    expect(f.at[0.5].goal).not.toBe('');
    expect(f.hintAt).toBeNull();
  });
});

// The owner, on the iPad: after "The base has power!" the board said "climb Star Hill"; asked for the next step to show without opening it. The line is said once
// the wake-up has played; the goal line (always on) moves to the same goal on its own.
describe('the base wakes: the next step in words', () => {
  beforeEach(() => { globalThis.document = pageDoc().doc; });
  afterEach(() => { delete globalThis.document; });
  const wake = () => {
    const progression = createProgression(mem());
    progression.state.moon = { ...progression.state.moon, step: 2, cells: 1 };
    const scene = new THREE.Scene();
    const area = build(scene);
    const log = createDiscoveryLog(progression); log.startWalk();
    const page = fakePage();
    const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion: false, tier: { name: 'high' }, doc: page.doc, win: page.win, clock: () => 250, visits: 0 });
    const cat = new THREE.Object3D(); const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 600);
    const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat, idleTime: 0, collectibleMeshes: new Map() };
    const said = []; const off = bus.on('discovery', (e) => said.push([t, e.label]));
    let t = 0;
    const where = { x: 0, y: 0, z: 47 };
    const run = (secs) => { for (let i = 0; i < secs * 30; i++) { t += 1 / 30; life.update(1 / 30, t, where, camera, session); } };
    run(1);
    life.credit({ kind: 'plug', cell: 1 });
    run(8);
    const g = life.guide.state;
    off();
    return { said, goal: g.text, lineOn: g.lineOn };
  };
  const both = (r) => {
    const labels = r.said.map((x) => x[1]);
    const i = labels.indexOf(phrase('moon.core.on'));
    const j = labels.indexOf(phrase('moon.next.scope'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(j).toBeGreaterThan(i);
    expect(labels.filter((l) => l === phrase('moon.next.scope'))).toHaveLength(1);
    expect(r.lineOn).toBe(true);
    expect(r.goal).toContain(phrase('moon.guide.hill').slice(0, 14)); // the goal line moves on by itself
  };
  it('clan words', () => both(wake()));
  it('everyday words', () => withOffWords(() => both(wake())));
});
