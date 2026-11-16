// The bubble and the ring (src/ui/guidebubble.js; design section 3).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGuideBubble, ringBox, RING_TARGETS } from '../src/ui/guidebubble.js';

// A small recording DOM: only what the bubble touches.
class El {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.cls = new Set(); this.attrs = {}; this.dataset = {}; this.style = {}; this.text = ''; this.html = null; this.rect = null;
    this.classList = { add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), contains: (c) => this.cls.has(c), toggle: (c, on) => (on ? this.cls.add(c) : this.cls.delete(c)) }; }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = v; }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { this.children.push(c); return c; }
  insertBefore(c) { this.children.unshift(c); return c; }
  getBoundingClientRect() { return this.rect ?? { left: 0, top: 0, width: 0, height: 0 }; }
}
function page({ touch = true, reduced = false, targets = {} } = {}) {
  const hint = new El(); const text = new El('span'); const root = new El();
  root.querySelector = (sel) => (sel === '#hud-hint' ? hint : sel === '#hud-hint-text' ? text : null);
  const controls = {};
  for (const [name, rect] of Object.entries(targets)) { const el = new El(); el.rect = rect; controls[RING_TARGETS[name]] = el; }
  const doc = { createElement: (tag) => new El(tag), querySelector: (sel) => controls[sel] ?? null, documentElement: { clientWidth: 390, clientHeight: 844 } };
  const hints = [];
  const hud = { setHint: (t, pic) => hints.push([t, pic]) };
  const flags = { touch, reduced };
  const bubble = createGuideBubble({ hud, root, doc, getIsTouch: () => flags.touch, getReduced: () => flags.reduced });
  const ring = root.children.at(-1);
  const keys = hint.children.find((c) => c.cls.has('hud-hint-keys'));
  const more = hint.children.find((c) => c.cls.has('hud-hint-more'));
  return { bubble, hints, hint, root, ring, keys, more, controls, flags };
}

describe('the bubble', () => {
  it('one line with its picture goes to the HUD\'s polite line, as text', () => {
    const p = page();
    p.bubble.guide({ text: 'Walk to <b>Biscuit</b>.', pic: '🐾' });
    expect(p.hints.at(-1)).toEqual(['Walk to <b>Biscuit</b>.', '🐾']); // hud.setHint writes textContent
    expect(p.hint.html).toBe(null); // and nothing here writes markup
    expect(p.root.html).toBe(null);
    const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
    expect(hud).toContain('<div class="hud-hint hidden" id="hud-hint" role="status" aria-live="polite">');
    const src = readFileSync(new URL('../src/ui/guidebubble.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/innerHTML|insertAdjacentHTML/);
    expect(src).not.toMatch(/createElement\('button'\)/); // not a button, no ✕
  });

  it('a keyboard gets key shapes in the picture\'s place, and a second line goes under the first', () => {
    const p = page({ touch: false });
    p.bubble.guide({ text: 'Press the arrow keys to walk.', pic: '🐾', keys: ['←', '↑', '↓', '→'], more: 'The arrow keys are next to the letters.' });
    expect(p.hints.at(-1)).toEqual(['Press the arrow keys to walk.', '']);
    expect(p.keys.children.map((k) => [k.tag, k.text])).toEqual([['kbd', '←'], ['kbd', '↑'], ['kbd', '↓'], ['kbd', '→']]);
    expect(p.keys.cls.has('turns')).toBe(true); // they light up in turn
    expect(p.keys.attrs['aria-hidden']).toBe('true');
    expect(p.more.text).toBe('The arrow keys are next to the letters.');
    p.bubble.guide({ text: 'Press E to say hello.', keys: ['E'] });
    expect(p.keys.cls.has('turns')).toBe(false);
    expect(p.more.text).toBe('');
  });

  it('a hint takes the bubble while it is up, and the guide\'s line comes back after it', () => {
    const p = page();
    p.bubble.guide({ text: 'Tap ⏸ when you want to go home.', pic: '🏠', chip: 'line' });
    expect(p.hint.cls.has('chip')).toBe(true);
    expect(p.root.cls.has('hint-chip')).toBe(true);
    p.bubble.hint('You can swim! Walk to the bank to climb out.', '💧');
    expect(p.hints.at(-1)[0]).toBe('You can swim! Walk to the bank to climb out.');
    expect(p.hint.cls.has('chip')).toBe(false);
    p.bubble.hint(null);
    expect(p.hints.at(-1)[0]).toBe('Tap ⏸ when you want to go home.');
    expect(p.hint.cls.has('chip')).toBe(true);
    p.bubble.clear();
    expect(p.hints.at(-1)[0]).toBe(null);
  });
});

describe('the ring', () => {
  const pounce = { left: 250, top: 632, width: 56, height: 56 };

  it('goes round the real control, outside it, with an arrow', () => {
    const p = page({ targets: { pounce } });
    p.bubble.guide({ text: 'Tap the paw to pounce!', ring: 'pounce' });
    expect(p.ring.cls.has('hidden')).toBe(false);
    expect(p.ring.dataset.ring).toBe('pounce');
    const left = parseFloat(p.ring.style.left); const top = parseFloat(p.ring.style.top);
    const w = parseFloat(p.ring.style.width); const h = parseFloat(p.ring.style.height);
    expect(left).toBeLessThan(pounce.left); expect(top).toBeLessThan(pounce.top);
    expect(left + w).toBeGreaterThan(pounce.left + pounce.width); expect(top + h).toBeGreaterThan(pounce.top + pounce.height);
    expect(p.ring.attrs['aria-hidden']).toBe('true');
    expect(p.ring.children.some((c) => c.cls.has('guide-ring-arrow'))).toBe(true);
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const rule = css.match(/\n\.guide-ring \{[^}]*\}/)[0];
    expect(rule).toContain('pointer-events: none'); // never takes the control's taps
    expect(rule).not.toMatch(/background/);         // an outline, never a cover
  });

  it('follows the control to the other side in left-handed mode (it reads where the control is)', () => {
    const p = page({ targets: { move: { left: 40, top: 668, width: 120, height: 120 } } });
    p.bubble.guide({ text: 'Push the circle to walk.', ring: 'move' });
    const before = parseFloat(p.ring.style.left);
    p.controls[RING_TARGETS.move].rect = { left: 230, top: 668, width: 120, height: 120 }; // the layout swapped
    p.bubble.update();
    expect(parseFloat(p.ring.style.left)).toBe(before + 190);
  });

  it('reduced motion gets the still form', () => {
    const p = page({ reduced: true, targets: { pounce } });
    p.bubble.guide({ text: 'Tap the paw to pounce!', ring: 'pounce' });
    expect(p.ring.cls.has('still')).toBe(true);
    p.flags.reduced = false;
    p.bubble.update();
    expect(p.ring.cls.has('still')).toBe(false);
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.guide-ring\.still \{ animation: none; border-style: dashed;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.guide-ring \{ animation: none; border-style: dashed;/);
  });

  it('no ring without its control: a hidden button, a keyboard, a chip', () => {
    const p = page({ targets: { pounce } });
    p.controls[RING_TARGETS.pounce].cls.add('hidden');
    p.bubble.guide({ text: 'Tap the paw to pounce!', ring: 'pounce' });
    expect(p.ring.cls.has('hidden')).toBe(true);
    const kb = page({ touch: false, targets: { pounce, prompt: { left: 500, top: 660, width: 250, height: 40 } } });
    kb.bubble.guide({ text: 'Press Space to pounce!', ring: 'pounce' });
    expect(kb.ring.cls.has('hidden')).toBe(true); // Space is a key: its shape is in the bubble
    kb.bubble.guide({ text: 'Press E to say hello.', ring: 'prompt' });
    expect(kb.ring.cls.has('hidden')).toBe(false); // the yellow button is on her screen
    const chip = page({ targets: { pause: { left: 16, top: 16, width: 44, height: 44 } } });
    chip.bubble.guide({ text: 'Tap ⏸ when you want to go home.', ring: 'pause', chip: 'line' });
    expect(chip.ring.cls.has('hidden')).toBe(true);
  });

  it('ringBox: the arrow sits above the control, or below it at the top of the screen', () => {
    expect(ringBox({ left: 100, top: 300, width: 56, height: 56 }, { width: 390, height: 844 }).arrow).toBe('top');
    expect(ringBox({ left: 16, top: 16, width: 44, height: 44 }, { width: 390, height: 844 }).arrow).toBe('bottom');
    const b = ringBox({ left: 100, top: 300, width: 200, height: 40 }, null, 7);
    expect(b).toMatchObject({ left: 93, top: 293, width: 214, height: 54, radius: 27 });
  });
});
