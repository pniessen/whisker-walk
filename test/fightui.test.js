import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { FIGHT_MOVES, teachFor } from '../src/fightmoves.js';
import { renderChallengeHtml, renderFightHtml, createFightUi, FIGHT_TEACH } from '../src/ui/fightui.js';
import { CLUES, BUTTONS } from '../src/fight.js';
import { clanName } from '../src/clanhomes.js';
import { RANK_WORDS, OUTSIDE_WORDS, PLACE_WORDS, CLAN_SUFFIX } from '../src/clanwords.js';

// The project has no DOM: a small recording fake, enough for createFightUi.
class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.cls = new Set();
    this.listeners = {};
    this.innerHTMLWrites = 0;
    this._html = '';
    this.classList = {
      add: (c) => this.cls.add(c),
      remove: (c) => this.cls.delete(c),
      toggle: (c, on) => (on ? this.cls.add(c) : this.cls.delete(c)),
      contains: (c) => this.cls.has(c),
    };
  }
  get className() { return [...this.cls].join(' '); }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.innerHTMLWrites += 1; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  // A click on the button carrying this attribute inside the element.
  clickOn(attr, value) {
    const target = {
      closest: (sel) => (sel.includes(`[${attr}]`) || sel.includes(attr)
        ? { getAttribute: (a) => (a === attr ? value : null) } : null),
    };
    for (const fn of this.listeners.click ?? []) fn({ target, preventDefault() {} });
  }
}

function withDoc(fn) {
  const prev = globalThis.document;
  globalThis.document = { createElement: (t) => new FakeEl(t), body: new FakeEl('body') };
  try { return fn(); } finally {
    if (prev === undefined) delete globalThis.document; else globalThis.document = prev;
  }
}

const BORROWED = [...Object.values(OUTSIDE_WORDS), ...Object.values(RANK_WORDS), ...Object.values(PLACE_WORDS), CLAN_SUFFIX];
const borrowed = (text) => BORROWED.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
const movesOf = (html) => [...html.matchAll(/data-move="([a-z]+)"/g)].map((m) => m[1]);
const PHASES = [
  { phase: 'squareOff', clue: null, round: 0, wins: 0, losses: 0, line: null },
  { phase: 'clue', clue: CLUES.pounce, round: 1, wins: 0, losses: 0, line: null },
  { phase: 'clue', clue: CLUES.charge, round: 2, wins: 1, losses: 0, line: 'Steady… look again 👀' },
  { phase: 'tumble', clue: null, round: 2, wins: 1, losses: 1, line: 'It got that one!' },
  { phase: 'beat', clue: null, round: 2, wins: 2, losses: 1, line: 'Nice one! 🐾' },
];

describe('the challenge pill', () => {
  test('names the cat and its clan, with the two buttons', () => {
    const html = renderChallengeHtml({ name: 'Mossjaw', clan: 'moor' });
    expect(html).toContain(`Mossjaw of ${clanName('moor')} is on your land!`);
    expect(html).toMatch(/data-fight="go"[^>]*>Fight! 🐾</);
    expect(html).toMatch(/data-fight="off"[^>]*>Back off</);
  });

  test('escapes a hostile name', () => {
    const html = renderChallengeHtml({ name: '<img src=x onerror=alert(1)>', clan: 'moor' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('only the composed clan name is a borrowed word', () => {
    const html = renderChallengeHtml({ name: 'Mossjaw', clan: 'moor' });
    expect(borrowed(html.replace(clanName('moor'), ''))).toEqual([]);
  });

  test('its root is a hud-prompt, so touch lets taps through, and E / Q answer it', () => withDoc(() => {
    const root = new FakeEl();
    const onFight = vi.fn(), onBackOff = vi.fn(), onMove = vi.fn();
    const ui = createFightUi(root, { onFight, onBackOff, onMove });
    expect(ui.showing).toBeNull();
    expect(ui.key('e')).toBe(false); // nothing up: not mine
    expect(onFight).not.toHaveBeenCalled();
    ui.showChallenge({ name: 'Mossjaw', clan: 'moor' });
    expect(ui.showing).toBe('challenge');
    const pill = root.children.find((c) => c.cls.has('hud-fight-ask'));
    expect(pill.cls.has('hud-prompt')).toBe(true);
    pill.clickOn('data-fight', 'go');
    expect(onFight).toHaveBeenCalledTimes(1);
    pill.clickOn('data-fight', 'off');
    expect(onBackOff).toHaveBeenCalledTimes(1);
    expect(ui.key('E')).toBe(true);
    expect(ui.key('q')).toBe(true);
    expect(onFight).toHaveBeenCalledTimes(2);
    expect(onBackOff).toHaveBeenCalledTimes(2);
    expect(ui.key('1')).toBe(false); // move keys are the sheet's only
    expect(onMove).not.toHaveBeenCalled();
    ui.hide();
    expect(ui.showing).toBeNull();
    expect(root.children).toHaveLength(0);
  }));

  test('the chat wheel steps aside for the pill: body.fight-asking, never #hud.fighting', () => withDoc(() => {
    const root = new FakeEl();
    const ui = createFightUi(root, {});
    ui.showChallenge({ name: 'Mossjaw', clan: 'moor' });
    expect(document.body.cls.has('fight-asking')).toBe(true);
    expect(root.cls.has('fighting')).toBe(false);          // the action buttons and zoom stay
    expect(document.body.cls.has('fighting')).toBe(false);
    ui.hide();
    expect(document.body.cls.has('fight-asking')).toBe(false);
    ui.showChallenge({ name: 'Mossjaw', clan: 'moor' });
    ui.showFight(PHASES[0]);
    expect(document.body.cls.has('fight-asking')).toBe(false);
    expect(document.body.cls.has('fighting')).toBe(true);
    ui.hide();
  }));
});

describe('the fight sheet', () => {
  test('always has the three moves, in order Pounce, Swipe, Dodge', () => {
    for (const m of PHASES) {
      const html = renderFightHtml(m);
      expect(movesOf(html)).toEqual(['pounce', 'swipe', 'dodge']);
      expect(movesOf(html)).toEqual(BUTTONS);
      expect(html).toMatch(/>Pounce</);
      expect(html).toMatch(/>Swipe</);
      expect(html).toMatch(/>Dodge</);
    }
  });

  test('the teach line is there in every phase', () => {
    expect(FIGHT_TEACH).toBe('Crouch → Dodge · Paw up → Pounce · Backs up → Swipe');
    for (const m of PHASES) expect(renderFightHtml(m)).toContain(FIGHT_TEACH);
  });

  test('the square-off says read its move; the clue shows its icon and text', () => {
    expect(renderFightHtml(PHASES[0])).toContain('Read its move!');
    for (const c of Object.values(CLUES)) {
      const html = renderFightHtml({ phase: 'clue', clue: c, round: 1, wins: 0, losses: 0, line: null });
      expect(html).toContain(c.icon);
      expect(html).toContain(c.text);
    }
  });

  test('round lines and paw pips', () => {
    expect(renderFightHtml(PHASES[2])).toContain('Steady… look again 👀');
    expect(renderFightHtml(PHASES[3])).toContain('It got that one!');
    expect(renderFightHtml(PHASES[4])).toContain('Nice one! 🐾');
    const html = renderFightHtml({ phase: 'beat', clue: null, round: 2, wins: 1, losses: 1, line: null });
    expect((html.match(/class="pip on"/g) ?? []).length).toBe(2);
    expect((html.match(/class="pip"/g) ?? []).length).toBe(2);
    const fresh = renderFightHtml(PHASES[0]);
    expect((fresh.match(/class="pip on"/g) ?? []).length).toBe(0);
    expect((fresh.match(/class="pip"/g) ?? []).length).toBe(4);
  });

  test('score pips are bright SVG paws: filled gold when won, outlined when empty', () => {
    const html = renderFightHtml({ phase: 'beat', clue: null, wins: 1, losses: 0, line: null });
    const sides = html.match(/<span class="fight-side"[^>]*>[\s\S]*?<\/span><\/span>/g);
    expect(sides).toHaveLength(2);
    const [you, it] = sides;
    expect((you.match(/class="pip on"/g) ?? []).length).toBe(1);
    expect((it.match(/class="pip on"/g) ?? []).length).toBe(0);
    const pipHtml = html.match(/<span class="pip(?: on)?">[\s\S]*?<\/svg><\/span>/g);
    expect(pipHtml).toHaveLength(4);
    for (const p of pipHtml) expect(p).toContain('<svg');
    const on = html.match(/<span class="pip on">[\s\S]*?<\/svg>/)[0];
    expect(on).toContain('fill="#ffc93c"');
    expect(on).toContain('#5a3800');
    const empty = html.match(/<span class="pip">[\s\S]*?<\/svg>/)[0];
    expect(empty).toContain('fill="none"');
    expect(empty).toContain('#ffd45a');
    expect(html).not.toMatch(/class="pip[^"]*">🐾/);
    expect(you).toContain('aria-label="You: 1 of 2"');
    expect(it).toContain('aria-label="It: 0 of 2"');
    // a plain span's aria-label is not read out; as an image it is
    expect(you).toMatch(/^<span class="fight-side" role="img" aria-label=/);
    expect(it).toMatch(/^<span class="fight-side" role="img" aria-label=/);
    expect(you).toContain('You');
  });

  test('nothing in it spells a borrowed word', () => {
    for (const m of PHASES) expect(borrowed(renderFightHtml(m))).toEqual([]);
  });

  test('the sheet: moves by tap and by 1 / 2 / 3, #hud marked fighting, redrawn only when it changes', () => withDoc(() => {
    const root = new FakeEl();
    const onMove = vi.fn(), onFight = vi.fn();
    const ui = createFightUi(root, { onFight, onBackOff() {}, onMove });
    ui.showChallenge({ name: 'Mossjaw', clan: 'moor' });
    ui.showFight(PHASES[1]);
    expect(ui.showing).toBe('fight');
    expect(root.children.filter((c) => c.cls.has('hud-fight-ask'))).toHaveLength(0);
    const sheet = root.children.find((c) => c.cls.has('hud-fight'));
    expect(sheet).toBeTruthy();
    expect(root.cls.has('fighting')).toBe(true);
    expect(document.body.cls.has('fighting')).toBe(true);   // the chat wheel steps aside
    ui.showFight(PHASES[1]);
    expect(sheet.innerHTMLWrites).toBe(1);
    sheet.clickOn('data-move', 'swipe');
    expect(onMove).toHaveBeenLastCalledWith('swipe');
    ui.key('1'); ui.key('2'); ui.key('3');
    expect(onMove.mock.calls.slice(1).map((c) => c[0])).toEqual(['pounce', 'swipe', 'dodge']);
    ui.key('e');
    expect(onFight).not.toHaveBeenCalled();
    ui.hide();
    expect(root.cls.has('fighting')).toBe(false);
    expect(document.body.cls.has('fighting')).toBe(false);
    expect(root.children).toHaveLength(0);
    expect(ui.showing).toBeNull();
  }));
});

describe('the sheet on a phone (style.css)', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  test('the sheet takes taps, sits over the touch layer, and hides the action buttons', () => {
    expect(rule('.hud-fight')).toContain('pointer-events: auto');
    // over the chat wheel (5), under the pause card (#overlay, 10)
    expect(rule('.hud-fight')).toMatch(/z-index: [6-9];/);
    expect(css).toMatch(/body\.fighting \.chat-wheel\s*\{[^}]*display: none/);
    expect(rule('.chat-wheel')).toContain('z-index: 5');
    expect(css).toMatch(/body\.fight-asking \.chat-wheel\s*\{[^}]*display: none/);
    expect(css).not.toMatch(/#hud\.fight-asking \.tui-(actions|zoom)/);
    expect(css).toMatch(/#hud\.fighting \.tui-actions[^{]*#hud\.fighting \.tui-zoom[^{]*\{[^}]*display: none/);
    expect(css).toMatch(/#hud\.fighting \.hud-toasts\s*\{[^}]*bottom:/);
  });

  test('the three buttons: one row, at least 88 px tall and 30% wide, above the safe area', () => {
    const btn = rule('.fight-move');
    expect(btn).toMatch(/min-height: (8[89]|9\d|1\d\d)px/);
    expect(btn).toMatch(/min-width: 30%/);
    expect(rule('.hud-fight')).toContain('env(safe-area-inset-bottom)');
    expect(rule('.fight-clue-icon')).toMatch(/font-size: (6[4-9]|[7-9]\d)px/);
  });

  test('short screens and landscape: a low sheet, the three moves in one row, the cats in view', () => {
    const at = css.indexOf('@media (max-height: 500px) {\n  .hud-fight');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('\n}', at));
    const sub = (sel) => {
      const i = block.indexOf(`${sel} {`);
      return i < 0 ? '' : block.slice(i, block.indexOf('}', i));
    };
    // the sheet: at most ~40% of the height, safe area on every side
    expect(sub('.hud-fight')).toMatch(/max-height: (3\d|40)vh/);
    for (const side of ['left', 'right', 'bottom']) expect(sub('.hud-fight')).toContain(`env(safe-area-inset-${side})`);
    // one row of moves, never a column
    expect(sub('.hud-fight .fight-moves')).toContain('flex-direction: row');
    expect(block).not.toMatch(/fight-moves[^}]*flex-direction: column/);
    expect(sub('.hud-fight .fight-move')).toContain('min-height: clamp(64px, 22vh, 88px)');
    // the teach line folds into the clue column, small, and still shows
    expect(sub('.hud-fight .fight-teach')).toContain('grid-area: teach');
    expect(sub('.hud-fight .fight-teach')).not.toContain('display: none');
    expect(sub('.hud-fight')).toContain('"teach moves"');
    // toasts above the sheet's top edge, centred
    expect(sub('#hud.fighting .hud-toasts')).toMatch(/bottom: calc\(40vh/);
    expect(sub('#hud.fighting .hud-toasts')).not.toContain('left: 32%');
  });

  test('the sheet keeps clear of the side safe areas everywhere', () => {
    expect(rule('.hud-fight')).toContain('env(safe-area-inset-left)');
    expect(rule('.hud-fight')).toContain('env(safe-area-inset-right)');
  });
});

describe('the specials row', () => {
  const clue = { phase: 'clue', clue: CLUES.pounce, round: 1, wins: 0, losses: 0, line: null };
  const SP = [
    { id: 'pin', name: 'Pin', hint: 'x', used: false },
    { id: 'rearUpSwat', name: 'Rear-up Swat', hint: 'x', used: true },
    { id: 'leapScratch', name: 'Leap and Scratch', hint: 'x', used: false },
  ];
  const specialIds = (html) => [...html.matchAll(/class="fight-special[^"]*" data-move="([A-Za-z]+)"/g)].map((m) => m[1]);

  test('with no specials the HTML is byte-identical to today\'s', () => {
    for (const m of PHASES) {
      expect(renderFightHtml({ ...m, specials: [] })).toBe(renderFightHtml(m));
      expect(renderFightHtml({ ...m, specials: undefined })).toBe(renderFightHtml(m));
      expect(renderFightHtml(m)).not.toContain('fight-special');
    }
  });

  test('a row before the three buttons, keys 4 and up, a spent one disabled', () => {
    const html = renderFightHtml({ ...clue, specials: SP });
    expect(html.indexOf('fight-specials')).toBeGreaterThan(html.indexOf('fight-top'));
    expect(html.indexOf('fight-specials')).toBeLessThan(html.indexOf('class="fight-moves'));
    expect(specialIds(html)).toEqual(['pin', 'rearUpSwat', 'leapScratch']);
    expect(html).toMatch(/data-move="pin"><span class="fight-special-icon">⬇️<\/span> <span class="fight-special-name">Pin<\/span><span class="fight-special-short">Pin<\/span><span class="fight-key">4<\/span>/);
    expect(html).toMatch(/data-move="leapScratch"><span class="fight-special-icon">↩️<\/span> <span class="fight-special-name">Leap and Scratch<\/span><span class="fight-special-short">Leap<\/span><span class="fight-key">6<\/span>/);
    expect(html).toMatch(/class="fight-special used" data-move="rearUpSwat" disabled>/);
    expect((html.match(/ disabled/g) ?? []).length).toBe(1);
    expect(movesOf(html).slice(-3)).toEqual(BUTTONS);
  });

  // Final review 7: in landscape (667x375) the full names wrapped to three
  // lines; each button carries its short name too, shown on short screens.
  test('each special carries its full and short name; an unknown id shows its name in both', () => {
    const html = renderFightHtml({ ...clue, specials: FIGHT_MOVES.map((m) => ({ id: m.id, name: m.name, used: false })) });
    for (const m of FIGHT_MOVES) {
      expect(html).toContain(`<span class="fight-special-name">${m.name}</span><span class="fight-special-short">${m.short}</span>`);
    }
    const odd = renderFightHtml({ ...clue, specials: [{ id: 'oddMove', name: 'Odd <b>', used: false }] });
    expect(odd).toContain('<span class="fight-special-name">Odd &lt;b&gt;</span><span class="fight-special-short">Odd &lt;b&gt;</span>');
  });

  test('the teach line lists the owned specials, short', () => {
    const html = renderFightHtml({ ...clue, specials: SP });
    const teach = html.slice(html.indexOf('fight-teach'));
    expect(teach).toContain(FIGHT_TEACH);
    expect(teach).toContain('⬇️ → Pin');
    expect(teach).toContain('→ Swat');
    expect(teach).toContain('→ Leap');
  });

  test('the full teach line stays within 110 characters', () => {
    expect((FIGHT_TEACH + teachFor(FIGHT_MOVES.map((m) => m.id))).length).toBeLessThanOrEqual(110);
  });

  test('each special button carries its clue icon', () => {
    const html = renderFightHtml({ ...clue, specials: FIGHT_MOVES.map((m) => ({ id: m.id, name: m.name, used: false })) });
    const btn = (id) => html.match(new RegExp(`<button[^>]*data-move="${id}"[^>]*>(.*?)</button>`))[1];
    expect(btn('rearUpSwat')).toContain(CLUES.swipe.icon);
    expect(btn('leapScratch')).toContain(CLUES.charge.icon);
    expect(btn('pin')).toContain(CLUES.pounce.icon);
    expect(btn('rollingTumble')).toContain('✨');
  });

  test('--fight-sheet-h is re-measured on every show', () => withDoc(() => {
    const props = {};
    const root = new FakeEl();
    root.style = { setProperty: (k, v) => { props[k] = v; }, removeProperty() {} };
    const ui = createFightUi(root, {});
    ui.showFight(clue);
    root.children[0].offsetHeight = 250;
    ui.showFight(clue);
    expect(props['--fight-sheet-h']).toBe('250px');
    root.children[0].offsetHeight = 260;
    ui.showFight(clue);
    expect(props['--fight-sheet-h']).toBe('260px');
  }));

  test('labels are escaped; at most four are drawn', () => {
    const html = renderFightHtml({ ...clue, specials: [{ id: 'pin', name: '<img src=x>', used: false }] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    const many = ['pin', 'leapScratch', 'rearUpSwat', 'rollingTumble', 'pin'].map((id) => ({ id, name: id, used: false }));
    expect(specialIds(renderFightHtml({ ...clue, specials: many })).length).toBe(4);
  });

  test('hostile ids never reach the markup', () => {
    const html = renderFightHtml({ ...clue, specials: [{ id: '"><b>', name: 'x', used: false }, { id: 'pin', name: 'Pin' }] });
    expect(html).not.toContain('<b>');
    expect(specialIds(html)).toEqual(['pin']);
  });

  test('taps and keys 4-7 reach the shown specials only; a spent one does nothing', () => withDoc(() => {
    const root = new FakeEl();
    const onMove = vi.fn();
    const ui = createFightUi(root, { onMove });
    ui.showFight({ ...clue, specials: SP });
    ui.key('4'); ui.key('5'); ui.key('6'); ui.key('7');
    expect(onMove.mock.calls.map((c) => c[0])).toEqual(['pin', 'leapScratch']);
    onMove.mockClear();
    const sheet = root.children[0];
    sheet.clickOn('data-move', 'pin');
    sheet.clickOn('data-move', 'rearUpSwat');
    sheet.clickOn('data-move', 'rollingTumble');   // not shown
    sheet.clickOn('data-move', 'toString');
    expect(onMove.mock.calls.map((c) => c[0])).toEqual(['pin']);
    expect(ui.key('7')).toBe(true);
  }));

  test('a special from an earlier sheet is forgotten when the next has none', () => withDoc(() => {
    const root = new FakeEl();
    const onMove = vi.fn();
    const ui = createFightUi(root, { onMove });
    ui.showFight({ ...clue, specials: SP });
    ui.showFight(clue);
    ui.key('4');
    root.children[0].clickOn('data-move', 'pin');
    expect(onMove).not.toHaveBeenCalled();
    expect(root.children[0].cls.has('has-specials')).toBe(false);
  }));

  test('--fight-sheet-h follows the measured sheet and goes on hide', () => withDoc(() => {
    const props = {};
    const root = new FakeEl();
    root.style = { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } };
    const ui = createFightUi(root, {});
    ui.showFight({ ...clue, specials: SP });
    root.children[0].offsetHeight = 301;
    ui.showFight({ ...clue, specials: SP, line: 'again' });
    expect(props['--fight-sheet-h']).toBe('301px');
    expect(root.children[0].cls.has('has-specials')).toBe(true);
    ui.hide();
    expect(props['--fight-sheet-h']).toBeUndefined();
  }));
});

describe('the specials row on a phone (style.css)', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };
  test('portrait: a row of at least 48 px; the basic buttons keep 88', () => {
    expect(rule('.fight-special')).toMatch(/min-height: (4[89]|5\d)px/);
    expect(rule('.fight-move')).toMatch(/min-height: (8[89]|9\d)px/);
    expect(rule('.fight-specials')).toContain('display: flex');
  });
  test('landscape: a specials grid area under the clue, at least 44 px, Part 2 clamp kept', () => {
    const at = css.indexOf('@media (max-height: 500px) {\n  .hud-fight');
    const block = css.slice(at, css.indexOf('\n}\n', at));
    expect(block).toContain('.hud-fight.has-specials');
    expect(block).toMatch(/"top moves" "specials moves" "teach moves"/);
    expect(block).toMatch(/\.fight-special \{[^}]*min-height: 44px/);
    expect(block).toMatch(/\.fight-special \{[^}]*grid-area|\.fight-specials \{[^}]*grid-area: specials/);
    expect(block).toContain('min-height: clamp(64px, 22vh, 88px)');
    expect(block).toMatch(/has-specials[^{]*\{[^}]*max-height: 46vh/);
  });
  test('portrait shows the full special names; short screens the short ones (final review 7)', () => {
    expect(css).toMatch(/\.fight-special-short \{[^}]*display: none/);
    const at = css.indexOf('@media (max-height: 500px) {\n  .hud-fight');
    const block = css.slice(at, css.indexOf('\n}\n', at));
    expect(block).toMatch(/\.hud-fight \.fight-special-name \{[^}]*display: none/);
    expect(block).toMatch(/\.hud-fight \.fight-special-short \{[^}]*display: inline/);
  });
  test('the teach line ends in an ellipsis, not a silent cut', () => {
    expect(css).toMatch(/\.hud-fight\.has-specials \.fight-teach \{[^}]*-webkit-line-clamp: 2[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/has-specials \.fight-teach \{[^}]*-webkit-line-clamp: 1[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/bottom: calc\(var\(--fight-sheet-h, 46vh\) \+ 8px\)/);
  });
  // Live check (Task 10): with line-height 'normal' the emoji in the specials'
  // clues made each line taller than 1.3em, so the 2.6em cap cut the second
  // line in half (390x844 and 375x667). A set line-height that two lines fit.
  test('the portrait teach line\'s two lines fit its height cap', () => {
    const rule = css.match(/\.hud-fight\.has-specials \.fight-teach \{([^}]*)\}/)[1];
    const lh = rule.match(/line-height: ([\d.]+);/);
    expect(lh).not.toBeNull();
    const cap = Number(rule.match(/max-height: ([\d.]+)em/)[1]);
    expect(cap).toBeGreaterThanOrEqual(2 * Number(lh[1]) - 1e-9);
  });
  test('toasts follow the measured sheet', () => {
    expect(css).toMatch(/#hud\.fighting \.hud-toasts\s*\{[^}]*var\(--fight-sheet-h/);
  });
});
