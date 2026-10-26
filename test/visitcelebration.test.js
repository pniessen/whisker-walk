import { describe, it, expect, vi } from 'vitest';
import { celebrationHtml, createVisitCelebration, ordinal, article } from '../src/ui/visitcelebration.js';
import { confettiCount } from '../src/visits.js';

// No jsdom in this project: a tiny element stand-in, like celebrate.test.js.
function fakeMount() {
  const doc = {
    createElement() {
      const el = {
        className: '', innerHTML: '', children: [], listeners: {}, removed: false, attrs: {},
        classes: new Set(),
        classList: { add: (c) => el.classes.add(c), contains: (c) => el.classes.has(c) },
        style: {},
        setAttribute(k, v) { el.attrs[k] = v; },
        appendChild(c) { el.children.push(c); },
        addEventListener(t, f) { el.listeners[t] = f; },
        remove() { el.removed = true; mount.children = mount.children.filter((c) => c !== el); },
      };
      return el;
    },
  };
  const mount = { ownerDocument: doc, children: [], appendChild(el) { mount.children.push(el); } };
  return mount;
}
const html = (el) => el.innerHTML + el.children.map(html).join('');
const click = (el, vc) => el.listeners.click({ target: { closest: () => ({ dataset: { vc } }) } });
const count = (s, re) => (s.match(re) || []).length;

function fakeTimers() {
  let id = 0; const pending = new Map();
  return {
    setTimer: (fn, ms) => { pending.set(++id, { fn, ms }); return id; },
    delays: () => [...pending.values()].map((x) => x.ms),
    clearTimer: (i) => pending.delete(i),
    get size() { return pending.size; },
    runOnce() { const [k, t] = [...pending][0]; pending.delete(k); t.fn(); },
    runAll() { while (pending.size) { const [k, t] = [...pending][0]; pending.delete(k); t.fn(); } },
  };
}

const ms = (visit, style, isNew = true, name = 'Party Hat') =>
  ({ visit, index: 0, style, prize: { id: 'partyhat', name, slot: 'head', isNew } });

function setup(opts = {}) {
  const mount = fakeMount(); const t = fakeTimers();
  const cb = { onOpen: vi.fn(), onWear: vi.fn(), onClose: vi.fn() };
  const cel = createVisitCelebration(mount, { ...cb, setTimer: t.setTimer, clearTimer: t.clearTimer, ...opts });
  return { mount, t, cb, cel, root: () => mount.children[0] };
}

describe('ordinal / article', () => {
  it('handles the teens and the 21st/101st families', () => {
    const want = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 10: '10th', 11: '11th', 12: '12th', 13: '13th', 21: '21st', 22: '22nd', 23: '23rd', 101: '101st', 111: '111th', 112: '112th', 113: '113th', 121: '121st' };
    for (const [n, s] of Object.entries(want)) expect(ordinal(Number(n))).toBe(s);
  });
  it('gives plural names no article', () => {
    expect(article('Star Sunglasses')).toBe('');
    expect(article('Golden Paw Booties')).toBe('');
    expect(article('Princess Crown')).toBe('a');
  });
  it('picks a/an by first letter', () => {
    expect(article('Party Hat')).toBe('a');
    expect(article('Orange Scarf')).toBe('an');
  });
});

describe('celebrationHtml', () => {
  it('escapes the pet name and shows the visit number', () => {
    for (const style of ['A', 'B', 'C']) {
      const out = celebrationHtml(ms(10, style), { petName: '<b>x</b>' });
      expect(out).not.toContain('<b>');
      expect(out).toContain('10');
    }
    expect(celebrationHtml(ms(10, 'B'), { petName: '<b>x</b>' })).toContain('&lt;b&gt;');
  });
  it('escapes the prize name', () => {
    expect(celebrationHtml(ms(5, 'A', false, '<i>hat</i>'), {})).not.toContain('<i>hat');
  });
  it('cycle-backs say Remember this / Remember your', () => {
    expect(celebrationHtml(ms(5, 'A', false), {})).toContain('Remember this');
    expect(celebrationHtml(ms(5, 'B', false), {})).toContain('Remember your Party Hat');
    expect(celebrationHtml(ms(5, 'C', false), {})).toContain('Remember this');
  });
  it('uses the brief copy', () => {
    expect(celebrationHtml(ms(5, 'A'), {})).toContain("You've come back 5 times!");
    expect(celebrationHtml(ms(5, 'B'), { petName: 'Mo' })).toContain("Mo got a Party Hat. It's already on!");
    expect(celebrationHtml(ms(5, 'B'), {})).toContain('Your cat got a Party Hat');
    expect(celebrationHtml(ms(10, 'C'), {})).toContain('You came back! This is our 10th visit. I found something for you');
    expect(celebrationHtml(ms(1, 'C'), {})).toContain('Hi! This is our first visit together');
    expect(celebrationHtml(ms(11, 'C'), {})).toContain('11th');
    expect(celebrationHtml(ms(5, 'A'), { stage: 'revealed' })).toContain("It's a Party Hat!");
    expect(celebrationHtml(ms(5, 'C'), { stage: 'revealed' })).toContain("It's a Party Hat!");
    expect(celebrationHtml(ms(5, 'A', true, 'Orange Scarf'), { stage: 'revealed' })).toContain("It's an Orange Scarf!");
  });
});

describe('createVisitCelebration', () => {
  it('A: dimmed; open reveals the prize; Yay closes once', () => {
    const { cel, root, cb, mount, t } = setup();
    expect(cel.show(ms(5, 'A'), { petName: 'Mo' })).toBe(true);
    expect(root().className).toContain('style-a');
    expect(html(root())).toContain('visit-cel-dim');
    expect(cel.isOpen()).toBe(true);
    click(root(), 'open');
    click(root(), 'open');
    expect(cb.onOpen).toHaveBeenCalledTimes(1);
    expect(cb.onOpen).toHaveBeenCalledWith(expect.objectContaining({ visit: 5 }));
    expect(html(root())).toContain("It's a Party Hat!");
    t.runAll(); // the 500ms double-tap guard
    click(root(), 'done');
    expect(mount.children).toHaveLength(0);
    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledWith('done');
    expect(cel.isOpen()).toBe(false);
  });

  it('B: onOpen at once, no dimmer, auto-fades and closes', () => {
    const { cel, root, cb, t, mount } = setup();
    cel.show(ms(5, 'B'), {});
    expect(cb.onOpen).toHaveBeenCalledTimes(1);
    expect(html(root())).not.toContain('visit-cel-dim');
    expect(cb.onClose).not.toHaveBeenCalled();
    t.runAll();
    expect(mount.children).toHaveLength(0);
    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledWith('done');
  });

  it('C: the present calls onOpen, then closes by itself', () => {
    const { cel, root, cb, t } = setup();
    cel.show(ms(10, 'C'), {});
    expect(cb.onOpen).not.toHaveBeenCalled();
    click(root(), 'open');
    expect(cb.onOpen).toHaveBeenCalledTimes(1);
    expect(html(root())).toContain("It's a Party Hat!");
    t.runAll();
    expect(cb.onClose).toHaveBeenCalledWith('done');
    expect(cb.onClose).toHaveBeenCalledTimes(1);
  });

  it('a cycle-back Wear it calls onWear and changes nothing else', () => {
    for (const style of ['A', 'B', 'C']) {
      const { cel, root, cb, mount } = setup();
      cel.show(ms(5, style, false), {});
      const before = html(root());
      const opens = cb.onOpen.mock.calls.length;
      click(root(), 'wear');
      expect(cb.onWear).toHaveBeenCalledWith('partyhat');
      expect(html(root())).toBe(before);
      expect(cb.onOpen.mock.calls.length).toBe(opens);
      expect(cb.onClose).not.toHaveBeenCalled();
      expect(mount.children).toHaveLength(1);
    }
  });

  it('close(walk) before the tap removes the card, reports walk, and leaves no late timers', () => {
    for (const style of ['A', 'B', 'C']) {
      const { cel, cb, t, mount } = setup();
      cel.show(ms(5, style), {});
      cel.close('walk');
      expect(mount.children).toHaveLength(0);
      expect(cb.onClose).toHaveBeenCalledTimes(1);
      expect(cb.onClose).toHaveBeenCalledWith('walk');
      expect(t.size).toBe(0);
      t.runAll();
      expect(cb.onClose).toHaveBeenCalledTimes(1);
      cel.close('walk');
      expect(cb.onClose).toHaveBeenCalledTimes(1);
    }
    const { cel, cb } = setup();
    cel.show(ms(5, 'A'), {});
    cel.close('walk');
    expect(cb.onOpen).not.toHaveBeenCalled();
  });

  it('has exactly confettiCount(visit) pieces', () => {
    for (const [visit, style] of [[1, 'C'], [5, 'A'], [10, 'B'], [50, 'A'], [100, 'C']]) {
      const { cel, root } = setup();
      cel.show(ms(visit, style), {});
      expect(count(html(root()), /<i style=/g)).toBe(confettiCount(visit));
    }
  });

  it('a second show while open returns false and mounts nothing more', () => {
    const { cel, mount } = setup();
    expect(cel.show(ms(5, 'A'), {})).toBe(true);
    expect(cel.show(ms(10, 'B'), {})).toBe(false);
    expect(mount.children).toHaveLength(1);
  });

  it('can be shown again after it closes', () => {
    const { cel } = setup();
    cel.show(ms(5, 'B'), {});
    cel.close('done');
    expect(cel.show(ms(10, 'B'), {})).toBe(true);
  });

  it('B plural name reads naturally; A/C reveal too', () => {
    expect(celebrationHtml(ms(5, 'B'), { petName: 'Mittens' })).toContain('Mittens got a Party Hat.');
    const sg = ms(5, 'B', true, 'Star Sunglasses');
    expect(celebrationHtml(sg, { petName: 'Mittens' })).toContain('Mittens got Star Sunglasses.');
    expect(celebrationHtml({ ...sg, style: 'A' }, { stage: 'revealed' })).toContain("It's Star Sunglasses!");
    expect(celebrationHtml({ ...sg, style: 'C' }, { stage: 'revealed' })).toContain("It's Star Sunglasses!");
  });

  it('the markup carries the real hooks', () => {
    expect(celebrationHtml(ms(5, 'A'), {})).toContain('data-vc="open"');
    expect(celebrationHtml(ms(5, 'A'), { stage: 'revealed' })).toContain('data-vc="done"');
    expect(celebrationHtml(ms(5, 'A', false), {})).toMatch(/data-vc="wear"[\s\S]*data-vc="done"/);
    expect(celebrationHtml(ms(5, 'B', false), {})).toContain('data-vc="wear"');
    expect(celebrationHtml(ms(5, 'C'), {})).toContain('data-vc="open"');
    expect(celebrationHtml(ms(5, 'C', false), {})).toContain('data-vc="wear"');
    expect(celebrationHtml(ms(5, 'C', false), {})).toContain('data-vc="done"');
  });

  it('a thumb replaces the prize text on the reveal', () => {
    const out = celebrationHtml(ms(5, 'A'), { stage: 'revealed', thumb: 'x.png' });
    expect(out).toContain('<img class="visit-cel-thumb" src="x.png"');
    expect(out).not.toContain('visit-cel-prize');
  });

  it('A: a double-tap on Open does not skip the reveal', () => {
    const { cel, root, cb, t } = setup();
    cel.show(ms(5, 'A'), {});
    click(root(), 'open');
    click(root(), 'done');
    expect(cel.isOpen()).toBe(true);
    expect(cb.onClose).not.toHaveBeenCalled();
    expect(t.delays()).toEqual([500]);
    t.runAll();
    click(root(), 'done');
    expect(cb.onClose).toHaveBeenCalledWith('done');
  });

  it('timers: A has none before the tap; B 5s+fade; C 3s after reveal; cycle C 6s', () => {
    let x = setup(); x.cel.show(ms(5, 'A'), {});
    expect(x.t.size).toBe(0);
    x = setup(); x.cel.show(ms(5, 'B'), {});
    expect(x.t.delays()).toEqual([5000]);
    x.t.runAll();
    x = setup(); x.cel.show(ms(10, 'C'), {});
    expect(x.t.size).toBe(0);
    click(x.root(), 'open');
    expect(x.t.delays()).toContain(3000);
    x = setup(); x.cel.show(ms(10, 'C', false), {});
    expect(x.t.delays()).toEqual([6000]);
  });

  it('B: the hold timer adds fade and queues the fade-out timer', () => {
    const { cel, t, root, cb } = setup();
    cel.show(ms(5, 'B'), {});
    expect(t.size).toBe(1);
    // run only the hold timer
    t.runOnce();
    expect(root().classList.contains('fade')).toBe(true);
    expect(t.delays()).toEqual([700]);
    expect(cb.onClose).not.toHaveBeenCalled();
  });

  it('close(walk) after a C reveal clears the pending timer', () => {
    const { cel, t, cb, root } = setup();
    cel.show(ms(10, 'C'), {});
    click(root(), 'open');
    expect(t.size).toBeGreaterThan(0);
    cel.close('walk');
    expect(t.size).toBe(0);
    t.runAll();
    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledWith('walk');
  });

  it('C has no dimmer; only A dims', () => {
    const c = setup(); c.cel.show(ms(10, 'C'), {});
    expect(html(c.root())).not.toContain('visit-cel-dim');
    const a = setup(); a.cel.show(ms(10, 'A'), {});
    expect(html(a.root())).toContain('visit-cel-dim');
  });

  it('C is placed from the anchor, clamped, with an upper-third fallback', () => {
    const rectOf = (r) => ({ left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height, width: r.width, height: r.height });
    let x = setup(); x.cel.show(ms(10, 'C'), { anchor: () => rectOf({ left: 40, top: 300, width: 200, height: 220 }) });
    const card = x.root().children[0];
    expect(card.style.cssText).toContain('top:160px');
    x = setup(); x.cel.show(ms(10, 'C'), { anchor: () => rectOf({ left: 300, top: 60, width: 120, height: 200 }) });
    const m = x.root().children[0].style.cssText.match(/left:(-?\d+)px;top:(\d+)px;width:(\d+)px/);
    expect(Number(m[1])).toBeGreaterThanOrEqual(12);
    expect(Number(m[1]) + Number(m[3])).toBeLessThanOrEqual(375 - 12);
    x = setup(); x.cel.show(ms(10, 'C'), {});
    expect(x.root().children[0].style.cssText).toContain('top:97px');
  });

  it('a throwing onOpen does not strand B', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cel, t, cb, mount } = setup({ onOpen: () => { throw new Error('boom'); } });
    cel.show(ms(5, 'B'), {});
    expect(cel.isOpen()).toBe(true);
    t.runAll();
    expect(cel.isOpen()).toBe(false);
    expect(mount.children).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
