import { describe, it, expect, beforeEach } from 'vitest';
import { createSplitHud, CSS } from '../src/coop/splithud.js';
import { chipHook, createCoopHud } from '../src/coop/hud.js';

// Split screen S3: the per-half HUD. No jsdom in this project, so a small element stand-in carries the parts
// splithud.js touches (children, classList, dataset, innerHTML as a string, getElementById, style custom properties).
class List {
  constructor(e) { this.e = e; }
  _a() { return this.e.className.split(/\s+/).filter(Boolean); }
  contains(c) { return this._a().includes(c); }
  add(...c) { this.e.className = [...new Set([...this._a(), ...c])].join(' '); }
  remove(...c) { this.e.className = this._a().filter((x) => !c.includes(x)).join(' '); }
  toggle(c, on) { const has = this.contains(c); const want = on ?? !has; if (want) this.add(c); else this.remove(c); return want; }
}
class El {
  constructor(tag = 'div') { this.tag = tag; this.className = ''; this.children = []; this.parentNode = null; this.dataset = {}; this.hidden = false; this.textContent = ''; this.innerHTML = ''; this.id = ''; this.vars = {}; this.attrs = {};
    this.classList = new List(this); this.style = { setProperty: (k, v) => { this.vars[k] = v; }, removeProperty: (k) => { delete this.vars[k]; } }; }
  appendChild(c) { c.parentNode?.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  insertBefore(c, ref) { c.parentNode?.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  setAttribute(k, v) { this.attrs[k] = v; }
  contains(x) { return this === x || this.children.some((c) => c.contains?.(x)); }
}
const find = (e, id) => (e.id === id ? e : e.children.map((c) => find(c, id)).find(Boolean) ?? null);
function makeDoc() {
  const body = new El('body'); const head = new El('head'); const html = new El('html');
  const doc = { body, head, documentElement: html, createElement: (t) => new El(t), getElementById: (id) => find(body, id) };
  const mk = (cls, id) => { const e = new El(); e.className = cls; if (id) e.id = id; body.appendChild(e); return e; };
  const hud = mk('', 'hud');
  const parts = {
    hud, obj: new El(), goals: new El(), badges: new El(), area: new El(), toasts: new El(),
  };
  parts.obj.id = 'hud-objective'; parts.obj.className = 'hud-objective hidden';
  parts.goals.id = 'hud-goals'; parts.goals.className = 'hud-goals hidden';
  parts.badges.id = 'hud-badges'; parts.badges.className = 'hud-badges hidden';
  parts.area.id = 'hud-area'; parts.toasts.id = 'hud-toasts'; parts.toasts.className = 'hud-toasts';
  hud.append(parts.obj, parts.goals, parts.badges, parts.area, parts.toasts);
  return { doc, body, html, ...parts };
}
const slotEl = (d, side) => { const e = d.doc.createElement('div'); e.className = `coop-slot ${side}`; d.body.appendChild(e); return e; };
const chipEl = (d) => { const e = d.doc.createElement('div'); e.className = 'coop-chip'; d.body.appendChild(e); return e; };
const toast = (d, text) => { const e = d.doc.createElement('div'); e.className = 'toast'; e.textContent = text; d.toasts.appendChild(e); return e; };
const halves = (d) => d.body.children.filter((c) => /\bsp-hud\b/.test(c.className));
const stubDeps = () => {
  const made = [];
  return { made, createMinimap: (host, o) => { const m = { host, o, updates: [], update(v) { m.updates.push({ ...v }); }, dispose() { m.gone = true; } }; made.push(m); return m; }, buildMapLayer: () => ({ stub: true }) };
};
const sess = { areaData: { scenics: [] }, scene: {}, areaId: 'street', cat: { position: { x: 3, y: 0, z: 4 } } };
const cam = (e8, e10) => ({ matrixWorld: { elements: Object.assign(new Array(16).fill(0), { 8: e8, 10: e10 }) } });
const split = (t = 1) => ({ active: true, t, mode: 'split' });
const shared = { active: false, t: 0, mode: 'shared' };
let d; let h; let deps;
beforeEach(() => { d = makeDoc(); deps = stubDeps(); h = createSplitHud({ doc: d.doc, deps, now: () => 1000 }); });

describe('html classes follow the rule', () => {
  it('shared: nothing is added, no container exists', () => {
    h.update(shared, { session: sess });
    expect(d.html.className).toBe('');
    expect(halves(d)).toHaveLength(0);
    expect(h.fade()).toEqual({ halves: 0, shared: 1, phase: 'shared' });
  });
  it('split: coop-split + coop-split-full, two containers, --sp-t = 1', () => {
    h.update(split(1), { session: sess });
    expect(d.html.classList.contains('coop-split')).toBe(true);
    expect(d.html.classList.contains('coop-split-full')).toBe(true);
    expect(d.html.classList.contains('coop-split-slide')).toBe(false);
    expect(halves(d).map((e) => e.id)).toEqual(['sp-hud-0', 'sp-hud-1']);
    expect(d.html.vars['--sp-t']).toBe('1');
  });
  it('going back to shared removes the classes, the variable and both containers', () => {
    h.update(split(1), { session: sess });
    h.update(shared, { session: sess });
    expect(d.html.className).toBe('');
    expect(d.html.vars['--sp-t']).toBeUndefined();
    expect(halves(d)).toHaveLength(0);
  });
  it('the containers and the stylesheet stay inside the safe margins and scale by --tv-s', () => {
    expect(CSS).toMatch(/\.sp-hud\{[^}]*top:var\(--tv-safe-y,5vh\)/);
    expect(CSS).toMatch(/\.sp-hud\.sp0\{left:var\(--tv-safe-x,5vw\)\}/);
    expect(CSS).toMatch(/\.sp-hud\.sp1\{right:var\(--tv-safe-x,5vw\)/);
    expect(CSS).toMatch(/:root\.tv\{--sp-s:var\(--tv-s,1\)\}/);
    expect(CSS).toMatch(/z-index:9/); // under #overlay (10): pause, Ready, story, tally cards and the world map stay on top, centred
  });
});

describe('transition crossfade bookkeeping', () => {
  it('mid-slide both halves and the walk HUD are partly visible: halves = t, walk = 1 - t', () => {
    h.update(split(0.25), { session: sess });
    expect(d.html.classList.contains('coop-split-slide')).toBe(true);
    expect(d.html.classList.contains('coop-split-full')).toBe(false);
    expect(d.html.vars['--sp-t']).toBe('0.25');
    expect(h.fade()).toEqual({ halves: 0.25, shared: 0.75, phase: 'slide' });
    h.update(split(0.8), { session: sess });
    expect(h.fade().halves + h.fade().shared).toBeCloseTo(1, 12);
    h.update(split(1), { session: sess });
    expect(h.fade()).toEqual({ halves: 1, shared: 0, phase: 'split' });
  });
  it('the slide back keeps the pieces until t reaches 0', () => {
    h.update(split(1), { session: sess });
    h.update({ active: true, t: 0.4, mode: 'shared' }, { session: sess });
    expect(halves(d)).toHaveLength(2);
    expect(d.html.classList.contains('coop-split-full')).toBe(false);
    h.update({ active: false, t: 0, mode: 'shared' }, { session: sess });
    expect(halves(d)).toHaveLength(0);
  });
  it('the css fades the walk pieces by (1 - t) while sliding and hides them at full', () => {
    expect(CSS).toMatch(/coop-split-slide \.hud-objective[^{]*\{opacity:calc\(1 - var\(--sp-t,0\)\)\}/);
    expect(CSS).toMatch(/coop-split-full \.hud-objective[^{]*\{display:none !important\}/);
    expect(CSS).toMatch(/\.sp-hud\{[^}]*opacity:var\(--sp-t,1\)/);
  });
});

describe('the walk HUD is copied to both halves', () => {
  it('goal line, next goal, badges and the area name appear in each half', () => {
    d.obj.className = 'hud-objective'; d.obj.innerHTML = 'Find the lost kitten<span class="hud-objective-dist">24 m</span>';
    d.goals.className = 'hud-goals'; d.goals.innerHTML = '<div class="goal done">✓ a</div><div class="goal next">○ Sniff a daisy</div>';
    d.badges.className = 'hud-badges'; d.badges.children.push(new El());
    d.area.textContent = 'Cozy Neighborhood';
    h.update(split(1), { session: sess });
    for (const half of halves(d)) {
      const head = half.children[0];
      const info = head.children[1];
      expect(info.children[0].innerHTML).toContain('Find the lost kitten');
      expect(info.children[0].classList.contains('hidden')).toBe(false);
      expect(info.children[1].innerHTML).toContain('Sniff a daisy');
      expect(info.children[1].classList.contains('hidden')).toBe(false);
      expect(head.children[0].children[0].textContent).toBe('Cozy Neighborhood');
    }
    d.obj.className = 'hud-objective hidden';
    h.update(split(1), { session: sess });
    expect(halves(d).every((hf) => hf.children[0].children[1].children[0].classList.contains('hidden'))).toBe(true);
  });
  it('a goals column with nothing left to do stays hidden in the halves', () => {
    d.goals.className = 'hud-goals'; d.goals.innerHTML = '<div class="goal done">✓ a</div>';
    h.update(split(1), { session: sess });
    expect(halves(d)[0].children[0].children[1].children[1].classList.contains('hidden')).toBe(true);
  });
});

describe('slot routing', () => {
  it('prompt slots move into their own half and come back', () => {
    const l = slotEl(d, 'left'); const r = slotEl(d, 'right');
    h.update(split(1), { session: sess });
    const [h0, h1] = halves(d);
    expect(h0.children[1].children).toContain(l);
    expect(h1.children[1].children).toContain(r);
    expect(h1.children[1].children).not.toContain(l);
    h.update(shared, { session: sess });
    expect(l.parentNode).toBe(d.body);
    expect(r.parentNode).toBe(d.body);
  });
  it('a real coop HUD: prompt(slot) still fills the right slot after the move', () => {
    const real = createCoopHud({ doc: d.doc });
    h.update(split(1), { session: sess });
    real.prompt(1, 'E — sniff', 'E — sniff');
    const [, h1] = halves(d);
    const slot = h1.children[1].children.find((c) => c.className.includes('coop-slot'));
    expect(slot.className).toContain('right');
    expect(slot.hidden).toBe(false);
    expect(slot.innerHTML).toBe('E — sniff');
    real.dispose();
  });
  it('a toast with an owner goes to that half; an unowned toast stays centred', () => {
    h.update(split(1), { session: sess });
    chipHook.fn([1], 'Rosa found a daisy');
    const mine = toast(d, 'Rosa found a daisy');
    const global = toast(d, 'RANK UP');
    h.update(split(1), { session: sess });
    const [h0, h1] = halves(d);
    expect(mine.parentNode).toBe(h1.children[1].children[0]);
    expect(h0.children[1].children[0].children).toHaveLength(0);
    expect(global.parentNode).toBe(d.toasts);
    expect(global.dataset.sp).toBe('g');
  });
  it('both-found and unmatched toasts stay centred (no single owner)', () => {
    h.update(split(1), { session: sess });
    chipHook.fn([0, 1], 'You both found a daisy');
    const both = toast(d, 'You both found a daisy');
    h.update(split(1), { session: sess });
    expect(both.parentNode).toBe(d.toasts);
  });
  it('the finder chip joins the finder\'s half, above its prompt; both-found leaves it centred', () => {
    const l = slotEl(d, 'left'); slotEl(d, 'right'); const chip = chipEl(d);
    h.update(split(1), { session: sess });
    chipHook.fn([0], 'x');
    h.update(split(1), { session: sess });
    const [h0] = halves(d);
    expect(chip.parentNode).toBe(h0.children[1]);
    expect(h0.children[1].children.indexOf(chip)).toBeLessThan(h0.children[1].children.indexOf(l));
    chipHook.fn([0, 1], 'y');
    h.update(split(1), { session: sess });
    expect(chip.parentNode).toBe(d.body);
  });
  it('toasts return to the walk\'s own column when the split ends', () => {
    h.update(split(1), { session: sess });
    chipHook.fn([0], 'Mia found a stick');
    const t = toast(d, 'Mia found a stick');
    h.update(split(1), { session: sess });
    expect(t.parentNode).not.toBe(d.toasts);
    h.update(shared, { session: sess });
    expect(t.parentNode).toBe(d.toasts);
    expect(t.dataset.sp).toBeUndefined();
  });
  it('the coop HUD tells the hook who a chip belongs to (chipShow passes the text)', () => {
    const real = createCoopHud({ doc: d.doc });
    let seen = null; chipHook.fn = (s, t) => { seen = [s, t]; };
    real.chipShow([1], ['A', 'B'], 1000, 'B found it');
    expect(seen).toEqual([[1], 'B found it']);
    real.dispose();
  });
});

describe('global overlays are untouched', () => {
  it('splithud never creates, moves or restyles #overlay, and its z-index stays below it', () => {
    const overlay = new El(); overlay.id = 'overlay'; overlay.className = 'pause-card'; d.body.appendChild(overlay);
    const before = JSON.stringify([overlay.className, overlay.parentNode === d.body, overlay.children.length]);
    h.update(split(1), { session: sess });
    h.update(split(0.5), { session: sess });
    h.update(shared, { session: sess });
    expect(JSON.stringify([overlay.className, overlay.parentNode === d.body, overlay.children.length])).toBe(before);
    expect(CSS).not.toMatch(/#overlay|pause|world-map|\.wm-|story|tally/i);
    expect(Number(/\.sp-hud\{[^}]*z-index:(\d+)/.exec(CSS)[1])).toBeLessThan(10);
  });
});

describe('maps', () => {
  it('each half gets its own minimap, centred on its own cat, with the other cat as a dot', async () => {
    h.update(split(1), { session: sess, camera: cam(0, 1), cam2: cam(1, 0), pos2: { x: -5, z: 9 } });
    await new Promise((r) => setTimeout(r, 0));
    h.update(split(1), { session: sess, camera: cam(0, 1), cam2: cam(1, 0), pos2: { x: -5, z: 9 } });
    expect(deps.made).toHaveLength(2);
    const [m0, m1] = deps.made;
    expect(m0.host).toBe(halves(d)[0].children[0].children[0]);
    expect(m1.host).toBe(halves(d)[1].children[0].children[0]);
    expect(m0.updates.at(-1)).toMatchObject({ cx: 3, cz: 4 });
    expect(m1.updates.at(-1)).toMatchObject({ cx: -5, cz: 9 });
    expect(m1.updates.at(-1).heading).toBeCloseTo(Math.atan2(1, 0), 12);
    h.update(shared, {});
    expect(m0.gone && m1.gone).toBe(true);
  });
});
