// The per-cat prompt arbiter (src/world/promptarbiter.js): one `used` slot per cat, forCats routing, one-argument calls exactly as before.
import { describe, it, expect } from 'vitest';
import { createPromptArbiter } from '../src/world/promptarbitercat.js';
import { createPromptArbiter as oneCat } from '../src/world/promptarbiter.js';

const src = (line, extra = {}) => { const s = { hits: 0, args: [], promptAt(...a) { s.args.push(a); return typeof line === 'function' ? line(...a) : line; }, interact(...a) { s.hits++; s.iargs = a; return 'did'; }, ...extra }; return s; };

describe('one argument is cat one, exactly as before', () => {
  it('asks every source in order with just the position, the first line wins, the press goes to it', () => {
    const a = src(null), b = src('B'), c = src('C');
    const arb = createPromptArbiter([a, b, c]);
    expect(arb.promptAt({ x: 1 })).toBe('B');
    expect(a.args).toEqual([[{ x: 1 }]]);
    expect(c.args).toEqual([]);
    expect(arb.interact()).toBe('did');
    expect(b.hits).toBe(1);
    expect(arb.interact()).toBeNull(); // used once
  });
  it('the one-cat arbiter (the places\' own) and the per-cat one make the same calls for cat one', () => {
    const run = (make) => { const a = src(null), b = src('B'); const arb = make([a, b]); const line = arb.promptAt({ x: 1 }); arb.interact(); return [line, a.args, b.args, b.hits]; };
    expect(run(createPromptArbiter)).toEqual(run(oneCat));
  });
  it('a source with no forCats is never offered to cat two (it reads cat one only)', () => {
    const one = src('E - one');
    const arb = createPromptArbiter([one]);
    expect(arb.promptAt({}, 1)).toBeNull();
    expect(arb.interact(1)).toBeNull();
    expect(one.hits).toBe(0);
  });
});

describe('two cats', () => {
  it('independent used slots: each press reaches the source that made that cat\'s line', () => {
    const shared = src('E - hop in');
    const two = src('E - hop out', { forCats: 'two' });
    const arb = createPromptArbiter([two, shared]);
    expect(arb.promptAt({}, 0)).toBe('E - hop in');
    expect(arb.promptAt({}, 1)).toBe('E - hop out');
    expect(arb.interact(1)).toBe('did');
    expect(two.hits).toBe(1);
    expect(shared.hits).toBe(0);
    expect(arb.interact(0)).toBe('did');
    expect(shared.hits).toBe(1);
  });
  it('a new query for one cat does not clear the other cat\'s offer', () => {
    const both = src((p, id) => (id === 1 ? 'two' : 'one'), { forCats: 'both' });
    const arb = createPromptArbiter([both]);
    expect(arb.promptAt({}, 0)).toBe('one');
    expect(arb.promptAt({}, 1)).toBe('two');
    expect(arb.promptAt({}, 0)).toBe('one');
    arb.interact(1);
    expect(both.iargs).toEqual([1]);
    arb.interact(0);
    expect(both.iargs).toEqual([0]);
  });
  it('a two-only source is not offered to cat one; a both source gets (pos, catId); every other source only (pos)', () => {
    const only = src('x', { forCats: 'two' }), both = src('y', { forCats: 'both' });
    const arb = createPromptArbiter([only, both]);
    expect(arb.promptAt({ k: 1 })).toBe('y');
    expect(only.args).toEqual([]);
    expect(both.args[0]).toEqual([{ k: 1 }, 0]);
    arb.promptAt({ k: 2 }, 1);
    expect(both.args[1]).toBeUndefined(); // 'x' won for cat two, so the later source was not asked
    expect(only.args[0]).toEqual([{ k: 2 }]);
    const arb2 = createPromptArbiter([both]);
    arb2.promptAt({ k: 3 }, 1);
    expect(both.args[1]).toEqual([{ k: 3 }, 1]);
  });
  it('cat two\'s offer does not stop cat one from pressing and vice versa; no offer, no press', () => {
    const arb = createPromptArbiter([src('a')]);
    arb.promptAt({}, 0);
    expect(arb.interact(1)).toBeNull();
    expect(arb.interact(0)).toBe('did');
  });
});
