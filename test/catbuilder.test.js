import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { newBuilder, editBuilder, reduceBuilder, isDirty, buildBuilderModel, renderBuilderHtml } from '../src/ui/catbuilder.js';
import { DEFAULT_LOOK } from '../src/customcats.js';
import { RANK_WORDS, OUTSIDE_WORDS, PLACE_WORDS, CLAN_SUFFIX } from '../src/clanwords.js';

const html = (b) => renderBuilderHtml(buildBuilderModel(b));

describe('the builder', () => {
  it('starts as a ginger tabby, green eyes, size 1, Keen nose, no name, Done greyed', () => {
    const m = buildBuilderModel(newBuilder());
    expect(m.look).toEqual(DEFAULT_LOOK);
    expect(m.breed).toBe('tabby');
    expect(m.canDone).toBe(false);
    expect(html(newBuilder())).toContain('<button class="cb-done cb-done-wait" data-cb-done>');
    expect(html(newBuilder())).not.toMatch(/data-cb-done[^>]*disabled/); // dimmed, never dead
  });
  it('a valid name is all it takes', () => {
    const b = reduceBuilder(newBuilder(), { type: 'name', value: 'Ember' });
    expect(buildBuilderModel(b).canDone).toBe(true);
    expect(html(b)).toContain('<button class="cb-done" data-cb-done>');
  });
  it('rows come in the sketch order', () => {
    const order = ['Coat colour', 'Markings colour', 'Pattern', 'Fur', 'Eyes', 'Size', 'Personality', 'Name'];
    const h = html(newBuilder());
    expect(order.map((t) => h.indexOf(t))).toEqual([...order.map((t) => h.indexOf(t))].sort((a, b) => a - b));
  });
  it('markings dim for Solid and White socks, and the choice is remembered', () => {
    let b = reduceBuilder(newBuilder(), { type: 'pick', field: 'marks', value: 'grey' });
    b = reduceBuilder(b, { type: 'pick', field: 'pattern', value: 'solid' });
    expect(buildBuilderModel(b)).toMatchObject({ marksDimmed: true, marksNote: 'Solid cats have no markings' });
    expect(buildBuilderModel(reduceBuilder(b, { type: 'pick', field: 'pattern', value: 'socks' })).marksNote).toBe('Socks are always white');
    expect(reduceBuilder(b, { type: 'pick', field: 'pattern', value: 'stripes' }).draft.look.marks).toBe('grey');
  });
  it('the personality shows its ready-made cat\'s blurb, and all six are open', () => {
    const b = reduceBuilder(newBuilder(), { type: 'personality', value: 'fearless' });
    expect(buildBuilderModel(b).blurb).toBe('Brave — nothing spooks this cat');
    expect((html(b).match(/data-cb-personality=/g) || []).length).toBe(6);
    expect(html(b)).not.toMatch(/locked|🔒|🐾/);
  });
  it('ignores junk actions', () => {
    const b = newBuilder();
    for (const a of [{ type: 'pick', field: 'coat', value: 'toString' }, { type: 'pick', field: 'size', value: 'x' }, { type: 'personality', value: 'bird' }, null]) {
      expect(reduceBuilder(b, a)).toBe(b);
    }
  });
  it('every choice is a button with aria-pressed; swatches are labelled', () => {
    const h = html(newBuilder());
    for (const tag of h.match(/<[^>]*data-cb-(pick|personality)=[^>]*>/g)) {
      expect(tag.startsWith('<button')).toBe(true);
      expect(tag).toMatch(/aria-pressed="(true|false)"/);
    }
    for (const tag of h.match(/<[^>]*class="cb-sw[^>]*>/g)) expect(tag).toMatch(/aria-label="[A-Z]/);
  });
  it('escapes the name and keeps it in the field', () => {
    expect(html(reduceBuilder(newBuilder(), { type: 'name', value: '<b>"x' }))).not.toContain('<b>"x');
    expect(html(reduceBuilder(newBuilder(), { type: 'name', value: 'Ember' }))).toMatch(/data-cb-name[^>]*value="Ember"/);
  });
  it('dirty tracking and the leave question', () => {
    const cat = { id: 'mine2', name: 'Ash', personality: 'steady', look: DEFAULT_LOOK };
    const e = editBuilder(cat);
    expect(isDirty(e)).toBe(false);
    expect(buildBuilderModel(e).title).toBe('Change Ash');
    const changed = reduceBuilder(e, { type: 'size', value: 1.1 });
    expect(isDirty(changed)).toBe(true);
    expect(html(reduceBuilder(changed, { type: 'ask-leave' }))).toContain('Leave without saving?');
  });
  it('the leave question puts the safe answer first, and pink; leaving is plain', () => {
    const h = html(reduceBuilder(newBuilder(), { type: 'ask-leave' }));
    expect(h).toContain('<span id="cb-leave-q">Leave without saving?</span> <button data-cb-stay>Keep making my cat</button> <button data-cb-leave>Leave, don’t save</button>');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toContain('.dr .cb-leave [data-cb-stay] { background: var(--pink); color: var(--navy); }');
    expect(css).not.toMatch(/\.cb-leave \[data-cb-leave\] \{[^}]*pink/);
  });
  it('the name box glows once when Done points at it, and not with motion under reduced motion', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toContain('.cb-row.cb-attention input[type="text"] { outline: 3px solid var(--pink); outline-offset: 2px; }');
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.cb-row\.cb-attention \{ animation/);
  });
  it('the leave question is named for screen readers', () => {
    const h = html(reduceBuilder(newBuilder(), { type: 'ask-leave' }));
    const id = h.match(/role="alertdialog" aria-labelledby="([^"]+)"/)[1];
    expect(h).toMatch(new RegExp(`id="${id}">Leave without saving\\?<`));
  });
  it('Not now and Done sit together in one footer band', () => {
    const h = html(newBuilder());
    const foot = h.slice(h.indexOf('<div class="cb-foot">'));
    expect(foot).toMatch(/^<div class="cb-foot"><button data-cb-cancel>[^<]*<\/button><button class="cb-done cb-done-wait" data-cb-done>[^<]*<\/button><\/div>/);
  });
  it('the builder is the same in both editions and has no borrowed word', () => {
    const src = readFileSync('src/ui/catbuilder.js', 'utf8');
    expect(src).not.toMatch(/edition/);
    const h = html(reduceBuilder(newBuilder(), { type: 'ask-leave' })).toLowerCase();
    for (const w of [...Object.values(RANK_WORDS), ...Object.values(OUTSIDE_WORDS), ...Object.values(PLACE_WORDS), CLAN_SUFFIX]) {
      expect(h).not.toMatch(new RegExp(`\\b${w.toLowerCase()}\\b`));
    }
  });

  it('Done asks for a name while there is none (and the hint is short)', () => {
    expect(html(newBuilder())).toContain('data-cb-done>Name your cat first ✏️</button>');
    expect(html(newBuilder())).toContain('<p class="cb-hint">Use 2 to 16 letters.</p>');
    const b = reduceBuilder(newBuilder(), { type: 'name', value: 'Mossy' });
    expect(html(b)).toContain('data-cb-done>Done, now dress it up →</button>');
  });

  it('the waiting Done is dimmed pink, not khaki', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const match = css.match(/\.cb-done\.cb-done-wait \{[^}]*\}/);
    expect(match).not.toBeNull();
    const rule = match[0];
    expect(rule).toContain('rgba(231,169,160,.30)');
    expect(rule).not.toContain('#6a6250');
    expect(css).toContain('.cb-foot::before');
  });
});
