import { describe, it, expect } from 'vitest';
import { pbkdf2Sync } from 'node:crypto';
import { normalizeCode, hashCode, REDEEM_SALT, REDEEM_ITERATIONS, redeemMessage, renderRedeemHtml } from '../src/redeem.js';

describe('normalizeCode', () => {
  it('uppercases, strips separators and folds look-alikes', () => {
    expect(normalizeCode('tuna-moon 7k3q')).toBe('TUNAM00N7K3Q');
    expect(normalizeCode('  T.u_n-a  ')).toBe('TUNA');
    expect(normalizeCode('il1IL')).toBe('11111');
    expect(normalizeCode('oO0')).toBe('000');
    expect(normalizeCode('🐾cat🐾')).toBe('CAT');
  });
  it('gives an empty string for non-strings', () => {
    expect(normalizeCode(null)).toBe('');
    expect(normalizeCode(42)).toBe('');
    expect(normalizeCode({})).toBe('');
    expect(normalizeCode(undefined)).toBe('');
  });
});

describe('hashCode', () => {
  it('returns 64 lowercase hex, deterministic, and distinct per input', async () => {
    const a = await hashCode('A');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashCode('A')).toBe(a);
    expect(await hashCode('B')).not.toBe(a);
  });
  it('matches an independent PBKDF2 vector', async () => {
    expect(REDEEM_SALT).toBe('whisker-walk-redeem-v1');
    expect(REDEEM_ITERATIONS).toBe(100000);
    const want = pbkdf2Sync('THROWAWAY123', 'whisker-walk-redeem-v1', 100000, 32, 'sha256').toString('hex');
    expect(await hashCode('THROWAWAY123')).toBe(want);
  });
  it('rejects kindly when crypto.subtle is missing', async () => {
    await expect(hashCode('X', null)).rejects.toThrow(/crypto/);
    await expect(hashCode('X', null)).rejects.toBeInstanceOf(Error);
  });
});

// ---- createRedeemer -------------------------------------------------------
import { vi } from 'vitest';
import { createRedeemer, REST_KEY, FREE_MISSES, FIRST_REST_MS, MAX_REST_MS, FORGIVE_MS } from '../src/redeem.js';
import { createProgression, CATALOG } from '../src/progression.js';

function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}
// Fast fake hash: deterministic 64-hex from the normalised code.
const fakeHash = async (s) => Buffer.from(s).toString('hex').padEnd(64, '0').slice(0, 64);
const GOOD = 'ZEBRA9';
const accId = Object.keys(CATALOG.accessories)[0];

async function setup(over = {}) {
  const clock = { t: 1_000_000 };
  const hashSpy = vi.fn(over.hash ?? fakeHash);
  const progression = createProgression(memStorage());
  const codes = { [await fakeHash(normalizeCode(GOOD))]: { label: 't', points: 7, cats: [], accessories: [accId] } };
  const storage = over.storage ?? memStorage();
  const r = createRedeemer({ progression, codes, hash: hashSpy, now: () => clock.t, storage });
  return { r, clock, hashSpy, progression, storage };
}
const miss = (r, n = 1) => Array.from({ length: n }, (_, i) => `wrong${i}`).reduce((p, c) => p.then(() => r.redeem(c)), Promise.resolve());

describe('createRedeemer', () => {
  it('exports the documented constants', () => {
    expect([REST_KEY, FREE_MISSES, FIRST_REST_MS, MAX_REST_MS, FORGIVE_MS]).toEqual(['whisker-walk-redeem-rest', 3, 30000, 300000, 600000]);
  });

  it('empty input is empty and not a miss', async () => {
    const { r } = await setup();
    for (let i = 0; i < 5; i++) expect(await r.redeem('  -- ')).toEqual({ kind: 'empty' });
    expect(r.cooldownLeft()).toBe(0);
    expect((await r.redeem('nope')).kind).toBe('unknown');
  });

  it('third miss starts a 30 s rest; resting skips the hash', async () => {
    const { r, hashSpy, clock } = await setup();
    await miss(r, 2);
    expect(r.cooldownLeft()).toBe(0);
    expect((await r.redeem('x3')).kind).toBe('unknown');
    expect(r.cooldownLeft()).toBe(30);
    const calls = hashSpy.mock.calls.length;
    expect(await r.redeem('x4')).toEqual({ kind: 'resting', seconds: 30 });
    expect(await r.redeem('')).toEqual({ kind: 'resting', seconds: 30 });
    expect(hashSpy.mock.calls.length).toBe(calls);
    clock.t += 1;
    expect(r.cooldownLeft()).toBe(30); // 29.999 s rounds up
    clock.t += 30000;
    expect(r.cooldownLeft()).toBe(0);
  });

  it('rests double per further miss up to the cap', async () => {
    const { r, clock } = await setup();
    await miss(r, 3);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      clock.t += r.cooldownLeft() * 1000;
      await r.redeem('again' + i);
      seen.push(r.cooldownLeft());
    }
    expect(seen).toEqual([60, 120, 240, 300, 300]);
  });

  it('a hit clears the miss count', async () => {
    const { r } = await setup();
    await miss(r, 2);
    expect((await r.redeem(GOOD)).kind).toBe('gift');
    await miss(r, 2);
    expect(r.cooldownLeft()).toBe(0);
  });

  it('ten quiet minutes clear the miss count', async () => {
    const { r, clock } = await setup();
    await miss(r, 2);
    clock.t += FORGIVE_MS;
    await miss(r, 2);
    expect(r.cooldownLeft()).toBe(0);
    await miss(r, 1);
    expect(r.cooldownLeft()).toBe(30);
  });

  it('a correct code while resting is still resting', async () => {
    const { r, progression } = await setup();
    await miss(r, 3);
    expect((await r.redeem(GOOD)).kind).toBe('resting');
    expect(progression.state.redeemed).toEqual([]);
  });

  it('hit gives a gift, repeat is used and not a miss', async () => {
    const { r, progression } = await setup();
    const g = await r.redeem(' zebra-9 ');
    expect(g.kind).toBe('gift');
    expect(g.points).toBeGreaterThanOrEqual(7);
    expect(g.items.map((i) => i.id)).toContain(accId);
    for (let i = 0; i < 6; i++) expect(await r.redeem(GOOD)).toEqual({ kind: 'used' });
    expect(r.cooldownLeft()).toBe(0);
    expect(progression.state.redeemed).toHaveLength(1);
  });

  it('concurrent calls pay once and both resolve', async () => {
    const { r, progression } = await setup();
    const before = progression.state.points;
    const p1 = r.redeem(GOOD);
    expect(r.busy()).toBe(true);
    const p2 = r.redeem(GOOD);
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.kind).toBe('gift');
    expect(['gift', 'used']).toContain(b.kind);
    expect(progression.state.points - before).toBe(a.points);
    expect(r.busy()).toBe(false);
  });

  it('junk or future-dated rest state is not resting', async () => {
    const now = 1_000_000;
    for (const junk of ['{', '{"until":"x"}', 'null', '[]', JSON.stringify({ misses: 9, until: now + 365 * 864e5, last: now })]) {
      const { r } = await setup({ storage: memStorage({ [REST_KEY]: junk }) });
      expect(r.cooldownLeft()).toBe(0);
      expect((await r.redeem(GOOD)).kind).toBe('gift');
    }
  });

  it('a storage that throws still works', async () => {
    const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    const { r } = await setup({ storage: bad });
    await miss(r, 2);
    expect((await r.redeem(GOOD)).kind).toBe('gift');
    // Default storage: a blocked globalThis.localStorage getter throws.
    Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('blocked'); }, configurable: true });
    try {
      const r2 = createRedeemer({ progression: createProgression(memStorage()), codes: {}, hash: fakeHash, now: () => 1 });
      expect((await r2.redeem('abc')).kind).toBe('unknown');
      expect(r2.cooldownLeft()).toBe(0);
    } finally {
      delete globalThis.localStorage;
    }
  });

  it('a rejecting hash is unsupported and not a miss', async () => {
    const { r } = await setup({ hash: async () => { throw new Error('crypto.subtle is not available here'); } });
    for (let i = 0; i < 5; i++) expect(await r.redeem('abc')).toEqual({ kind: 'unsupported' });
    expect(r.cooldownLeft()).toBe(0);
  });

  it('works with the real hash', async () => {
    const progression = createProgression(memStorage());
    const codes = { [await hashCode(normalizeCode('Real-Throwaway-1'))]: { label: 't', points: 3 } };
    const r = createRedeemer({ progression, codes, now: () => 5, storage: memStorage() });
    expect((await r.redeem('real throwaway 1')).kind).toBe('gift');
    expect((await r.redeem('other')).kind).toBe('unknown');
  });
});

describe('redeemMessage', () => {
  const catalog = {
    cats: { hagrid: { name: 'Hagrid' } },
    accessories: { wizard: { name: 'Wizard Hat' }, crown: { name: 'Crown' }, tophat: { name: 'Top Hat' } },
  };
  const acc = (id, name, owned = false, refund = 0) => ({ kind: 'accessories', id, name, owned, refund });
  it('words a points-and-hat gift', () => {
    expect(redeemMessage({ kind: 'gift', points: 50, items: [acc('wizard', 'Wizard Hat')] }, catalog))
      .toBe('🎉 Surprise! You got 50 🐾 and the Wizard Hat!');
  });
  it('words several items with an owned one', () => {
    const items = [acc('crown', 'Crown'), acc('tophat', 'Top Hat', true, 25)];
    expect(redeemMessage({ kind: 'gift', points: 25, items }, catalog))
      .toBe('🎉 Surprise! You got the Crown and 25 🐾 for the Top Hat you already had!');
    const three = [acc('wizard', 'Wizard Hat'), acc('crown', 'Crown'), acc('tophat', 'Top Hat', true, 25)];
    expect(redeemMessage({ kind: 'gift', points: 25, items: three }, catalog))
      .toBe('🎉 Surprise! You got the Wizard Hat, the Crown and 25 🐾 for the Top Hat you already had!');
  });
  it('breed cats take "the", named cats do not', () => {
    const cat = (id, name) => ({ kind: 'cats', id, name, owned: false, refund: 0 });
    expect(redeemMessage({ kind: 'gift', points: 0, items: [cat('black', 'Black Cat')] }, { cats: {} }))
      .toBe('🎉 Surprise! You got the Black Cat!');
    expect(redeemMessage({ kind: 'gift', points: 5, items: [cat('mainecoon', 'Maine Coon')] }, { cats: {} }))
      .toBe('🎉 Surprise! You got 5 🐾 and the Maine Coon!');
  });
  it('named cats take no "the"', () => {
    expect(redeemMessage({ kind: 'gift', points: 10, items: [{ kind: 'cats', id: 'hagrid', name: 'Hagrid', owned: false, refund: 0 }] }, catalog))
      .toBe('🎉 Surprise! You got 10 🐾 and Hagrid!');
  });
  it('an owned free item does not print 0 points', () => {
    const items = [{ kind: 'cats', id: 'hagrid', name: 'Hagrid', owned: true, refund: 0 }];
    expect(redeemMessage({ kind: 'gift', points: 10, items }, catalog))
      .toBe('🎉 Surprise! You got 10 🐾 and Hagrid you already had!');
  });
  it('words a gift with nothing', () => {
    expect(redeemMessage({ kind: 'gift', points: 0, items: [] }, catalog))
      .toBe('🎉 You opened it! There was nothing new inside this time — but thanks for trying it! 💛');
  });
  it('words the other kinds', () => {
    expect(redeemMessage({ kind: 'used' }, catalog)).toBe('You already opened this one — it’s safe in your collection. 💛');
    expect(redeemMessage({ kind: 'unknown' }, catalog)).toBe('Hmm, that code isn’t one we know. Check the letters and try again! 🐾');
    expect(redeemMessage({ kind: 'empty' }, catalog)).toBe('Type your code in the box first. 😺');
    expect(redeemMessage({ kind: 'resting', seconds: 45 }, catalog)).toBe('The code box is taking a little catnap. Try again in 45 seconds. 😴');
    expect(redeemMessage({ kind: 'resting', seconds: 1 }, catalog)).toBe('The code box is taking a little catnap. Try again in 1 second. 😴');
    expect(redeemMessage({ kind: 'unsupported' }, catalog)).toBe('Codes can’t be opened on this page. Ask a grown-up to open the game the usual way. 🐾');
    expect(redeemMessage(null, catalog)).toBe('');
  });
});

describe('renderRedeemHtml', () => {
  const catalog = { cats: {}, accessories: {} };
  it('renders the form', () => {
    const h = renderRedeemHtml({ text: '', busy: false, result: null, catalog });
    expect(h).toContain('🎁 Got a secret code?');
    expect(h).toContain('<form class="redeem-form"');
    expect(h).toContain('id="redeem-input"');
    for (const a of ['autocomplete="off"', 'autocapitalize="characters"', 'spellcheck="false"', 'maxlength="40"']) expect(h).toContain(a);
    expect(h).toContain('Open it!');
    expect(h).not.toContain('disabled');
    expect(h).toContain('aria-live="polite"');
  });
  it('disables while busy', () => {
    const h = renderRedeemHtml({ text: 'x', busy: true, result: null, catalog });
    expect(h).toContain('Opening…');
    expect(h).not.toContain('Open it!');
    expect((h.match(/disabled/g) || []).length).toBe(2);
  });
  it('escapes the text and shows the message', () => {
    const h = renderRedeemHtml({ text: '"><script>', busy: false, result: { kind: 'empty' }, catalog });
    expect(h).not.toContain('<script>');
    expect(h).toContain('value="&quot;&gt;&lt;script&gt;"');
    expect(h).toContain('Type your code in the box first.');
    const g = renderRedeemHtml({ text: '', busy: false, catalog, result: { kind: 'gift', points: 0, items: [{ kind: 'cats', id: 'z', name: '<b>', owned: false, refund: 0 }] } });
    expect(g).not.toContain('<b>');
  });
});
