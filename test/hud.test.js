import { describe, it, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHud, MAX_TOASTS } from '../src/ui/hud.js';
import { bus } from '../src/events.js';

// The project has no DOM environment (no jsdom/happy-dom); like den.test.js and
// nametag.test.js this installs a small recording fake `document`. It models
// only what createHud touches: an innerHTML that yields id'd elements, and
// elements whose textContent setter drops children (as in a real DOM) while
// counting every write so "did not touch the DOM" is assertable.
class FakeEl {
  constructor() {
    this.children = [];
    this.own = '';
    this.cls = new Set();
    this.writes = 0; // textContent sets + appendChild calls
    this.classList = {
      toggle: (c, on) => { if (on) this.cls.add(c); else this.cls.delete(c); },
      add: (c) => this.cls.add(c),
      remove: (c) => this.cls.delete(c),
      contains: (c) => this.cls.has(c),
    };
  }
  get textContent() { return this.own + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.writes += 1; this.own = String(v); this.children = []; }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  appendChild(c) { this.writes += 1; this.children.push(c); c.parent = this; return c; }
  addEventListener() {}
  // Detaches from its parent, so "how many toasts are on screen" is countable.
  remove() {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }
}

let byId;
let prevDoc;

beforeEach(() => {
  prevDoc = globalThis.document;
  byId = new Map();
  const root = new FakeEl();
  Object.defineProperty(root, 'innerHTML', {
    set(html) {
      byId.clear();
      for (const m of html.matchAll(/<div class="([^"]*)" id="([^"]+)"/g)) {
        const el = new FakeEl();
        el.className = m[1];
        byId.set(m[2], el);
      }
      for (const m of html.matchAll(/<span id="([^"]+)"/g)) byId.set(m[1], new FakeEl());
    },
  });
  root.querySelector = (sel) => byId.get(sel.slice(1)) ?? null;
  globalThis.document = {
    getElementById: () => root,
    createElement: () => new FakeEl(),
  };
});

afterEach(() => {
  if (prevDoc === undefined) delete globalThis.document;
  else globalThis.document = prevDoc;
});

const objEl = () => byId.get('hud-objective');
const distEl = () => objEl().children[0];

describe('hud.setObjective', () => {
  it('prints the objective alone when no distance is given', () => {
    const hud = createHud();
    hud.setObjective('Find the lost glasses 👓');
    expect(objEl().classList.contains('hidden')).toBe(false);
    expect(objEl().textContent).toContain('Find the lost glasses');
    expect(objEl().textContent).not.toMatch(/\bm\b/);
    expect(objEl().children).toHaveLength(0);
  });

  it('appends a whole-metre distance as a separate styled child', () => {
    const hud = createHud();
    hud.setObjective('Find the lost glasses 👓', 23.4);
    expect(objEl().textContent).toContain('23 m');
    expect(distEl().cls.has('hud-objective-dist')).toBe(true);
    expect(distEl().textContent).toBe('23 m');
  });

  it('never prints NaN for a hostile distance', () => {
    const hud = createHud();
    for (const bad of [NaN, Infinity, -1]) {
      hud.setObjective('Find it', bad);
      expect(objEl().textContent).not.toMatch(/NaN|Infinity|-1/);
      expect(objEl().children).toHaveLength(0);
    }
  });

  it('clears entirely when the objective is cleared', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23);
    hud.setObjective(null);
    expect(objEl().classList.contains('hidden')).toBe(true);
  });

  it('can show the objective again after clearing it', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23);
    hud.setObjective(null);
    hud.setObjective('Find it', 23);
    expect(objEl().classList.contains('hidden')).toBe(false);
    expect(objEl().textContent).toContain('23 m');
  });

  // Called every frame: the cache key is text + the RENDERED distance string.
  it('does not touch the DOM when the rendered text is unchanged', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23.2);
    const node = distEl();
    const writes = objEl().writes;
    const childWrites = node.writes;
    hud.setObjective('Find it', 23.4); // still "23 m"
    expect(distEl()).toBe(node);
    expect(objEl().writes).toBe(writes);
    expect(node.writes).toBe(childWrites);
  });

  it('updates the number when the rendered distance changes', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23.2);
    hud.setObjective('Find it', 30);
    expect(distEl().textContent).toBe('30 m');
  });

  it('updates when the text changes at the same distance', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23);
    hud.setObjective('Find the kitten', 23);
    expect(objEl().textContent).toContain('Find the kitten');
    expect(objEl().textContent).toContain('23 m');
  });

  it('shows "here" when the cat is on top of the target', () => {
    const hud = createHud();
    hud.setObjective('Find it', 1);
    expect(distEl().textContent).toBe('here');
  });

  // Regression guards: these pass against the original implementation.
  it('removes the distance child when the distance is dropped', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23);
    hud.setObjective('Find it');
    expect(objEl().textContent).not.toContain('23 m');
    expect(objEl().children).toHaveLength(0);
    expect(objEl().textContent).toContain('Find it');
  });

  it('renders "here" for a distance of exactly zero', () => {
    const hud = createHud();
    hud.setObjective('Find it', 0);
    expect(distEl().textContent).toBe('here');
  });
});

describe('hud corner map slot', () => {
  it('mapHost is the #hud-map element, which holds the area caption', () => {
    const hud = createHud();
    expect(hud.mapHost).toBe(byId.get('hud-map'));
    expect(byId.get('hud-map').cls.has('hud-map')).toBe(true);
  });

  it('setArea writes the caption under the map', () => {
    const hud = createHud();
    hud.setArea('The Park');
    expect(byId.get('hud-area').textContent).toBe('The Park');
  });

  it('setCamera hides the map while the viewfinder is up and brings it back', () => {
    const hud = createHud();
    hud.setCamera(true);
    expect(byId.get('hud-map').classList.contains('hidden')).toBe(true);
    expect(byId.get('hud-viewfinder').classList.contains('hidden')).toBe(false);
    hud.setCamera(false);
    expect(byId.get('hud-map').classList.contains('hidden')).toBe(false);
    expect(byId.get('hud-viewfinder').classList.contains('hidden')).toBe(true);
  });
});

describe('the discovery toast', () => {
  it('leads with "You spotted" / "Again —", but a chased-off intruder reads as its own sentence', () => {
    vi.useFakeTimers();
    try {
      const hud = createHud();
      const toast = vi.spyOn(hud, 'toast');
      bus.emit('discovery', { type: 'flower', key: 'f', label: 'a daisy 🌼', points: 2, repeat: false });
      expect(toast).toHaveBeenLastCalledWith('You spotted a daisy 🌼', 2);
      bus.emit('discovery', { type: 'flower', key: 'f', label: 'a daisy 🌼', points: 1, repeat: true });
      expect(toast).toHaveBeenLastCalledWith('Again — a daisy 🌼', 1);
      bus.emit('discovery', { type: 'intruder', key: 'intruder-7', label: 'You chased off Mossjaw! 🛡️', points: 12, repeat: false });
      expect(toast).toHaveBeenLastCalledWith('You chased off Mossjaw! 🛡️', 12);
    } finally {
      vi.runAllTimers();
      vi.useRealTimers();
    }
  });
});

// polish-hud2 (R2, R3): at most two toasts on screen, the oldest retired at
// once with a short fade; a burst of critters folds into one counting toast.
describe('toast cap and merge', () => {
  const box = () => byId.get('hud-toasts');
  const texts = () => box().children.map((c) => c.textContent);
  const critter = (label, points = 5, repeat = false) =>
    bus.emit('discovery', { type: 'critter', key: label, label, points, repeat });
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

  it('keeps at most two on screen, retiring the oldest first', () => {
    const hud = createHud();
    expect(MAX_TOASTS).toBe(2);
    hud.toast('one', 1);
    hud.toast('two', 2);
    const first = box().children[0];
    hud.toast('three', 3);
    expect(first.cls.has('fade')).toBe(true); // at once
    expect(box().children[1].cls.has('fade')).toBe(false);
    expect(box().children[2].cls.has('fade')).toBe(false);
    vi.advanceTimersByTime(350);
    expect(texts()).toEqual(['two  +2 🐾', 'three  +3 🐾']);
    hud.toast('four');
    vi.advanceTimersByTime(350);
    expect(texts()).toEqual(['three  +3 🐾', 'four']);
  });

  it('lives 2.6 s, then fades and leaves', () => {
    const hud = createHud();
    hud.toast('hello', 2);
    const el = box().children[0];
    vi.advanceTimersByTime(2599);
    expect(el.cls.has('fade')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(el.cls.has('fade')).toBe(true);
    expect(box().children).toHaveLength(1);
    vi.advanceTimersByTime(350);
    expect(box().children).toHaveLength(0);
  });

  it('a retired toast is not touched again by its old timers', () => {
    const hud = createHud();
    hud.toast('one');
    vi.advanceTimersByTime(1000);
    hud.toast('two');
    hud.toast('three'); // retires "one"
    vi.advanceTimersByTime(350);
    expect(texts()).toEqual(['two', 'three']);
    vi.advanceTimersByTime(1250); // "one"'s old 2.6 s mark
    expect(texts()).toEqual(['two', 'three']);
    expect(box().children.every((c) => !c.cls.has('fade'))).toBe(true);
  });

  it('critters spotted back to back fold into one toast that counts them', () => {
    createHud();
    critter('a songbird');
    expect(texts()).toEqual(['You spotted a songbird  +5 🐾']);
    critter('a squirrel');
    critter('a songbird', 5, true);
    expect(texts()).toEqual(['You spotted 3 critters  +15 🐾']);
  });

  it('a single repeat critter keeps its own words', () => {
    createHud();
    critter('a songbird', 2, true);
    expect(texts()).toEqual(['Again — a songbird  +2 🐾']);
  });

  it('a treasure after critters does not merge', () => {
    createHud();
    critter('a songbird');
    critter('a squirrel');
    bus.emit('discovery', { type: 'treasure', key: 't', label: 'a lost marble', points: 8, repeat: false });
    expect(texts()).toEqual(['You spotted 2 critters  +10 🐾', 'You spotted a lost marble  +8 🐾']);
  });

  it('a critter after a non-critter toast starts a new toast', () => {
    createHud();
    critter('a songbird');
    bus.emit('discovery', { type: 'flower', key: 'f', label: 'a daisy 🌼', points: 2, repeat: false });
    critter('a squirrel');
    vi.advanceTimersByTime(350);
    expect(texts()).toEqual(['You spotted a daisy 🌼  +2 🐾', 'You spotted a squirrel  +5 🐾']);
  });

  it('merging restarts the clock', () => {
    createHud();
    critter('a songbird');
    vi.advanceTimersByTime(1500);
    critter('a squirrel');
    vi.advanceTimersByTime(1100); // 2.6 s after the first
    expect(texts()).toEqual(['You spotted 2 critters  +10 🐾']);
    expect(box().children[0].cls.has('fade')).toBe(false);
    vi.advanceTimersByTime(1500); // 2.6 s after the merge
    expect(box().children[0].cls.has('fade')).toBe(true);
    vi.advanceTimersByTime(350);
    expect(box().children).toHaveLength(0);
  });

  it('a fading critter toast is not merged into', () => {
    createHud();
    critter('a songbird');
    vi.advanceTimersByTime(2700); // fading
    critter('a squirrel');
    expect(texts()).toEqual(['You spotted a songbird  +5 🐾', 'You spotted a squirrel  +5 🐾']);
  });
});

// Polish pass 1a, Task 5 (2026-11-02): the "white dot on the cat's nape" in the
// walk was the HUD's centre crosshair (a "·" at 50%/50%), which the walk camera
// always lands on the back of the cat's head. It only helps line up a photo,
// so it shows with the viewfinder and nowhere else.
describe('hud crosshair', () => {
  it('is hidden on the walk and shows only while the camera viewfinder is up', () => {
    const hud = createHud();
    const cross = byId.get('hud-crosshair');
    expect(cross).toBeTruthy();
    expect(cross.classList.contains('hidden')).toBe(true);
    hud.setCamera(true);
    expect(cross.classList.contains('hidden')).toBe(false);
    hud.setCamera(false);
    expect(cross.classList.contains('hidden')).toBe(true);
  });
});

describe('HUD layout (style.css)', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };
  const landscape = () => {
    const at = css.indexOf('@media (max-height: 500px) {\n  body.touch-mode');
    return at < 0 ? '' : css.slice(at, css.indexOf('\n}\n', at));
  };

  describe('walk summary', () => {
    test('Continue is a pink pill, not a browser button', () => {
      const r = rule('.summary-card .primary');
      expect(r).toContain('background: #e7a9a0');
      expect(r).toContain('border-radius: 999px');
      expect(r).toMatch(/min-height: (4[89]|5\d)px/);
    });
    test('on a phone the summary scrim runs edge to edge', () => {
      const at = css.indexOf('@media (max-width: 480px) {\n  .homebase-scroll');
      const block = css.slice(at, css.indexOf('\n}\n', at));
      const card = block.slice(block.indexOf('.summary-card {'), block.indexOf('}', block.indexOf('.summary-card {')));
      expect(card).not.toMatch(/max-width/);
      expect(card).toMatch(/padding: 16px 4vw/);
    });
  });

  describe('touch HUD', () => {
    test('touch pause sits in the top row; the top row steps right for it', () => {
      expect(rule('.tui-pause')).toMatch(/top: max\(16px, env\(safe-area-inset-top\)\)/);
      expect(css).toMatch(/body\.touch-mode:not\(\.left-handed\) \.hud-top\s*\{[^}]*left: calc\(max\(16px, env\(safe-area-inset-left\)\) \+ 54px\)/);
      // Fix wave M6: the band under the top row follows the top row's safe-area
      // inset (a standalone PWA), 48px below it: 64px with no inset, as before.
      const band = 'top: calc(max(16px, env(safe-area-inset-top)) + 48px)';
      expect(rule('.hud-goals')).toContain(band);
      expect(rule('.hud-objective')).toContain(band);
      expect(rule('.hud-map:not(:has(.hud-map-disc)) ~ .hud-roster')).toContain(band);
      expect(css).not.toMatch(/(^|[;{\s])top: 64px/);
    });
    test('touch prompt rises above the action cluster; toasts above the prompt', () => {
      expect(css).toMatch(/body\.touch-mode \.hud-prompt\s*\{[^}]*bottom: calc\(222px/);
      expect(css).toMatch(/body\.touch-mode \.hud-toasts\s*\{[^}]*bottom: calc\(292px/);
      expect(css).toMatch(/body\.touch-mode #hud\.fight-asking \.hud-toasts\s*\{[^}]*bottom: calc\(360px/);
      // the coarse-pointer twins stay in step
      expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.hud-prompt\s*\{[^}]*bottom: calc\(222px/);
      // (anchored inside the coarse-pointer block: the body.touch-mode rule above matches too)
      const at = css.indexOf('@media (pointer: coarse) {\n  .hud-prompt');
      const coarse = at < 0 ? '' : css.slice(at, css.indexOf('\n}\n', at));
      expect(coarse).toMatch(/\n\s*#hud\.fight-asking \.hud-toasts\s*\{[^}]*bottom: calc\(360px/);
    });
    test('landscape touch keeps the prompt at 96px and toasts at 165px', () => {
      const block = landscape();
      expect(block).toMatch(/\.hud-prompt\s*\{[^}]*bottom: calc\(96px/);
      expect(block).toMatch(/\.hud-toasts\s*\{[^}]*bottom: calc\(165px/);
    });
    test('landscape touch with a fight pill up puts toasts at 210px', () => {
      expect(landscape()).toMatch(/#hud\.fight-asking \.hud-toasts\s*\{[^}]*bottom: calc\(210px \+ env\(safe-area-inset-bottom\)\)/);
    });
    test('left-handed keeps its own pause spot and top-row inset', () => {
      expect(rule('body.left-handed .tui-pause')).toContain('right: calc(');
      expect(rule('body.left-handed .hud-top')).toContain('+ 64px');
    });
  });

  describe('toast fade and phone placement (polish-hud2)', () => {
    test('a toast fades in 0.35 s with a small rise, and no rise under reduced motion', () => {
      expect(rule('.toast')).toContain('transition: opacity 0.35s, transform 0.35s');
      expect(rule('.toast.fade')).toMatch(/opacity: 0;\s*transform: translateY\(-6px\)/);
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.toast\.fade \{ transform: none; \}/);
    });
    const top = 'top: calc(max(16px, env(safe-area-inset-top)) + var(--map-size) + 78px); bottom: auto;';
    const block = (head) => {
      const at = css.indexOf(head);
      return at < 0 ? '' : css.slice(at, css.indexOf('\n}\n', at));
    };
    test('on a phone held upright the walk toasts move under the map (coarse pointer)', () => {
      const b = block('@media (pointer: coarse) and (max-width: 480px) and (min-height: 501px) {\n  #hud-toasts');
      expect(b).toContain(top);
      expect(b).toContain('#hud.fight-asking #hud-toasts');
      expect(b).not.toContain('.hud-toasts'); // #cloud-toasts keeps its place
    });
    test('…and the touch-mode twin matches', () => {
      const b = block('@media (max-width: 480px) and (min-height: 501px) {\n  body.touch-mode #hud-toasts');
      expect(b).toContain(top);
      expect(b).toContain('body.touch-mode #hud.fight-asking #hud-toasts');
      expect(b).not.toContain('.hud-toasts');
    });
    test('the phone rules come after the touch and landscape toast rules', () => {
      const phone = css.indexOf('@media (pointer: coarse) and (max-width: 480px) and (min-height: 501px)');
      expect(phone).toBeGreaterThan(css.indexOf('body.touch-mode .hud-toasts {'));
      expect(phone).toBeGreaterThan(css.indexOf('body.touch-mode #hud.fight-asking .hud-toasts { bottom: calc(210px'));
    });
  });

  describe('chat button and rank on phones (polish-hud2)', () => {
    const block = (head) => {
      const at = css.indexOf(head);
      return at < 0 ? '' : css.slice(at, css.indexOf('\n}\n', at));
    };
    const right = 'right: max(136px, calc(120px + env(safe-area-inset-right)))';
    const bottom = 'bottom: max(24px, calc(24px + env(safe-area-inset-bottom)))';
    const left = 'left: max(136px, calc(120px + env(safe-area-inset-left)))';
    test('desktop keeps the chat button where it was', () => {
      const r = rule('.chat-wheel');
      expect(r).toContain('right: 16px');
      expect(r).toContain('bottom: 96px');
      expect(r).toContain('z-index: 5');
    });
    test('on touch the chat button joins the zoom row, off the camera button', () => {
      // the zoom row it lines up with
      expect(rule('.tui-zoom')).toContain(bottom);
      expect(rule('body.touch-mode .chat-wheel')).toContain(right);
      expect(rule('body.touch-mode .chat-wheel')).toContain(bottom);
      const coarse = block('@media (pointer: coarse) {\n  .chat-wheel');
      expect(coarse).toMatch(new RegExp(`\\.chat-wheel \\{[^}]*${right.replace(/[()+.]/g, '\\$&')}`));
      expect(coarse).toContain(bottom);
      expect(rule('body.touch-mode .chat-toggle')).toMatch(/width: 44px; height: 44px/);
      expect(coarse).toMatch(/\.chat-toggle \{[^}]*width: 44px; height: 44px/);
    });
    test('left-handed touch mirrors it, out-ranking the desktop left-handed rule', () => {
      const lh = rule('body.left-handed.touch-mode .chat-wheel');
      expect(lh).toContain('right: auto');
      expect(lh).toContain(left);
      const coarse = block('@media (pointer: coarse) {\n  .chat-wheel');
      expect(coarse).toMatch(/body\.left-handed \.chat-wheel \{[^}]*right: auto;[^}]*left: max\(136px/);
      expect(css.indexOf('body.left-handed.touch-mode .chat-wheel {'))
        .toBeGreaterThan(css.indexOf('body.left-handed .chat-wheel {'));
      expect(rule('body.left-handed.touch-mode .chat-tray')).toContain('left: max(16px, env(safe-area-inset-left))');
    });
    test('on touch the tray is fixed to the screen, width-capped and scrollable', () => {
      for (const r of [rule('body.touch-mode .chat-tray'), block('@media (pointer: coarse) {\n  .chat-wheel')]) {
        expect(r).toContain('position: fixed');
        expect(r).toContain('width: min(280px, calc(100vw - 32px))');
        expect(r).toContain('max-height: calc(100vh - 140px); overflow-y: auto');
      }
    });
    test('on a phone the rank goes under the points and the goals step down', () => {
      const phone = block('@media (max-width: 480px) {\n  .homebase-scroll');
      expect(phone).toMatch(/\.hud-top \{[^}]*flex-direction: column/);
      expect(phone).toMatch(/\.hud-rank \{[^}]*margin: 0;[^}]*max-width: 100%/);
      expect(phone).toMatch(/\.hud-goals \{ top: calc\(max\(16px, env\(safe-area-inset-top\)\) \+ 76px\); \}/);
    });
  });

  describe('desktop toasts', () => {
    test('toasts sit above the prompt pill, and above the fight pill when it is up', () => {
      expect(rule('.hud-toasts')).toContain('bottom: 146px');
      expect(css).toMatch(/\n#hud\.fight-asking \.hud-toasts\s*\{[^}]*bottom: 210px/);
    });
  });
});
