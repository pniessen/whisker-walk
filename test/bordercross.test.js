import { describe, it, expect, vi } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { PLACE_WORDS } from '../src/clanwords.js';
import { BORDER_POSTS } from '../src/borderposts.js';
import {
  targetName, lower, postStatus, headTo, promptFor, crossCardHtml, joinNames, crossExtras,
  crossingOutcome, decideBorderCross,
} from '../src/bordercross.js';

const post = (id) => Object.values(BORDER_POSTS).flat().find((p) => p.id === id);
const save = (walks, areas = ['neighborhood', 'woods'], points = 0) => ({ walks, unlocked: { areas }, points });

describe('postStatus', () => {
  it('this walk counts toward the gate', () => {
    const p = post('woods-river-long');
    expect(postStatus(p, save({ woods: 1 }), CATALOG, 'woods').kind).toBe('go');
    const s = postStatus(p, save({ woods: 0 }), CATALOG, 'woods');
    expect(s.kind).toBe('locked');
    expect(s.line).toBe('🔒 The River and Marshes opens after 2 walks in The Woods · 1/2 so far');
    expect(postStatus(p, save(undefined), CATALOG, 'woods').kind).toBe('locked');
    expect(postStatus(p, { unlocked: { areas: [] } }, CATALOG, 'woods').line).toMatch(/· 1\/2 so far$/);
  });
  it('an owned target is go; the Gorge is unexplored', () => {
    expect(postStatus(post('woods-river-long'), save({}, ['river']), CATALOG, 'woods').kind).toBe('go');
    const g = postStatus(post('moor-gorge'), save({}), CATALOG, 'moor');
    expect(g).toMatchObject({ kind: 'unexplored', name: 'The Gorge' });
    expect(promptFor(g, {}).text).toBe('The Gorge: not explored yet');
    expect(promptFor(g, {}).kind).toBe('border-info');
  });
  it('first Neighborhood walk is still locked for the Woods', () => {
    const s = postStatus(post('town-woods'), { walks: {}, unlocked: { areas: ['neighborhood'] }, points: 0 }, CATALOG, 'neighborhood');
    expect(s.kind).toBe('locked');
    expect(s.line.endsWith('· 1/2 so far')).toBe(true);
  });
  it('a price shortfall locks', () => {
    const cat = { areas: { x: { name: 'The X', price: 5 } } };
    expect(postStatus({ to: 'x' }, save({}, []), cat, 'a').line).toBe('🔒 The X needs 5 🐾');
  });
  it('is total over garbage', () => {
    expect(postStatus(null, null, null, null).kind).toBe('unexplored');
    expect(postStatus({ to: '__proto__' }, {}, CATALOG, 'x').kind).toBe('unexplored');
  });
});

describe('names and prompts', () => {
  it('words', () => {
    expect(targetName('neighborhood', 'canon', CATALOG)).toBe(PLACE_WORDS.town);
    expect(targetName('gorge', 'canon', CATALOG)).toBe('The Gorge');
    expect(targetName('nope', 'canon', CATALOG)).toBe('');
    expect(lower('The Moor')).toBe('the Moor');
    expect(headTo('The Moor')).toBe('Head to the Moor?');
    expect(headTo(PLACE_WORDS.town)).toBe(`Head to ${PLACE_WORDS.town}?`);
  });
  it('promptFor', () => {
    const go = { kind: 'go', to: 'moor', name: 'The Moor', line: '' };
    expect(promptFor(go, { inRoom: false })).toEqual({ text: 'E — Head to the Moor?', kind: 'border' });
    expect(promptFor(go, { inRoom: true, isHost: true })).toEqual({ text: 'E — Head to the Moor?', kind: 'border' });
    expect(promptFor(go, { inRoom: true, isHost: false })).toEqual({ text: 'The Moor is this way 🧭', kind: 'border-info' });
    expect(promptFor({ kind: 'locked', name: 'X', line: 'L' }, {})).toEqual({ text: 'L', kind: 'border-info' });
  });
  it('card escapes and has the buttons', () => {
    const h = crossCardHtml({ name: '<b>Hi</b>', extras: ['a<i>'] });
    expect(h).not.toContain('<b>');
    expect(h).not.toContain('<i>');
    expect(h).toContain('id="btn-cross-yes"');
    expect(h).toContain('id="btn-cross-no"');
    expect(h).toContain('pause-card cross-card');
    expect(h).toContain("Yes, let's go!");
    expect(h).toContain('Keep exploring');
  });
  it('extras and joinNames', () => {
    expect(joinNames(['Pip'])).toBe('Pip');
    expect(joinNames(['Pip', 'Max'])).toBe('Pip and Max');
    expect(joinNames(['Pip', 'Max', 'Tig'])).toBe('Pip, Max and Tig');
    expect(crossExtras({ raceRunning: 1, questActive: 1, carried: 'sock', buddyName: 'Bramble', together: ['Pip'] })).toEqual([
      'Your race stops here.', 'Your quest stops here.', 'The sock comes home to your den.', 'Bramble walks home.', 'Pip comes too.',
    ]);
    expect(crossExtras({ together: ['Pip', 'Max'] })).toEqual(['Pip and Max come too.']);
    expect(crossExtras({})).toEqual([]);
    expect(crossExtras({ carried: 'pine cone' })).toEqual(['The pine cone comes home to your den.']);
  });
});

describe('crossingOutcome', () => {
  const base = { crossTo: 'moor', catalog: CATALOG, edition: 'canon', together: [] };
  it('solo', () => {
    const r = crossingOutcome({ ...base, clan: true, pickPlace: () => 'bought' });
    expect(r).toEqual({ picked: true, lines: ['Next stop: the Moor! 🧭', "It's picked on your map."] });
  });
  it('host with a friend', () => {
    const r = crossingOutcome({ ...base, clan: true, together: ['Pip'], pickPlace: () => 'set' });
    expect(r.lines[2]).toBe('Walk together again from the home screen to head there with Pip.');
  });
  it('guest who could not pick', () => {
    const r = crossingOutcome({ ...base, clan: true, ledBy: 'Pip', together: ['Pip'], pickPlace: () => false });
    expect(r).toEqual({ picked: false, lines: ['Pip led the way to the Moor! 🧭', 'Ask Pip to press Start on the home screen to head there together.'] });
  });
  it('legacy never picks', () => {
    const pickPlace = vi.fn();
    const r = crossingOutcome({ ...base, clan: false, together: ['Pip'], pickPlace, edition: 'legacy' });
    expect(pickPlace).not.toHaveBeenCalled();
    expect(r.lines).toHaveLength(1);
    expect(r.picked).toBe(false);
  });
});

describe('decideBorderCross', () => {
  const ctx = { areaId: 'woods', selfId: 'b', remoteIds: ['a'], catalog: CATALOG };
  const ev = { v: 1, id: 'a', type: 'border-cross', from: 'woods', to: 'moor' };
  it('refuses what it should', () => {
    expect(decideBorderCross({ ...ev, id: 'c' }, ctx)).toBe(null);
    expect(decideBorderCross(ev, { ...ctx, selfId: 'A0', remoteIds: ['a', 'B'] })).toBe(null);
    expect(decideBorderCross(ev, { ...ctx, selfId: 'a', remoteIds: ['b'] })).toBe(null);
    expect(decideBorderCross({ ...ev, from: 'moor' }, ctx)).toBe(null);
    for (const to of ['gorge', '__proto__', 'pines', 7, undefined]) expect(decideBorderCross({ ...ev, to }, ctx)).toBe(null);
    expect(decideBorderCross({ ...ev, type: 'x' }, ctx)).toBe(null);
    expect(decideBorderCross(null, ctx)).toBe(null);
  });
  it('accepts the host', () => {
    expect(decideBorderCross(ev, ctx)).toEqual({ to: 'moor' });
    expect(decideBorderCross({ ...ev, to: 'river' }, ctx)).toEqual({ to: 'river' });
  });
});
