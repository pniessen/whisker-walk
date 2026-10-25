import { describe, it, expect } from 'vitest';
import { renderColonyHtml } from '../src/ui/colonypanel.js';
import { emptyColony, TAME_FEEDS, COLONY_MAX } from '../src/colony.js';
import { CAT_NAMES, strayBreed } from '../src/straynames.js';
import { CATALOG } from '../src/progression.js';

const ME = 'me-player-0001';
const PARTNER = 'robin-player-02';
const [A, B, C, D] = CAT_NAMES;

const cat = (name, extra = {}) => ({
  name, finder: ME, area: 'park', x: 1, z: 2, wear: null, tamedBy: null, tamedWalk: null, ...extra,
});
const feed = (c, by, n, head = 0) => Array.from({ length: n }, (_, i) => ({ cat: c, by, walk: `walk-${by.length}${i}${c.length}`, head }));

function colonyOf({ cats = [], feeds = [], partner = null } = {}) {
  return { ...emptyColony(), id: partner ? 'col-1' : null, partner, cats, feeds };
}
const PAIR = { playerId: PARTNER, petName: 'Robin', wardrobe: [] };

function render(colony, over = {}) {
  return renderColonyHtml({
    colony, me: ME, members: colony.partner ? 2 : 1,
    status: { mode: colony.partner ? 'paired' : 'local' },
    owned: ['bell', 'bandana', 'tophat'], catalog: CATALOG, ...over,
  });
}
const count = (s, re) => (s.match(re) || []).length;

describe('renderColonyHtml', () => {
  it('renders exactly one progress bar per cat', () => {
    const colony = colonyOf({
      cats: [cat(A), cat(B), cat(C, { tamedBy: ME, tamedWalk: 'walk-1' })],
      feeds: [...feed(A, ME, 2), ...feed(B, ME, 3, 2), ...feed(C, ME, TAME_FEEDS)],
    });
    const html = render(colony);
    expect(count(html, /class="colony-bar"/g)).toBe(3);
    expect(count(html, /role="progressbar"/g)).toBe(3);
    expect(html).toContain(`aria-valuemax="${TAME_FEEDS}"`);
    expect(html).toContain('aria-valuenow="2"');
  });

  it('shows the head start inside the bar and says why', () => {
    const colony = colonyOf({ cats: [cat(A)], feeds: feed(A, ME, 1, 3) });
    const html = render(colony);
    expect(count(html, /class="colony-bar"/g)).toBe(1);
    // the head-start segment lives between the bar's open and close tags
    const bar = html.match(/<div class="colony-bar"[\s\S]*?<\/div>/)[0];
    expect(bar).toContain('colony-head');
    expect(bar).toContain('colony-fed');
    expect(bar).toContain('aria-valuenow="4"');
    expect(html).toContain(`You already knew ${A} ♥`);
    // no second track
    expect(count(html, /colony-bar/g)).toBe(1);
  });

  it('names whoever actually knew the cat', () => {
    const both = (head) => (n, by) => feed(n, by, 1, head);
    const mineOnly = render(colonyOf({ partner: PAIR, cats: [cat(A)],
      feeds: [...both(3)(A, ME), ...both(0)(A, PARTNER)] }));
    expect(mineOnly).toContain(`You already knew ${A} ♥`);
    const theirsOnly = render(colonyOf({ partner: PAIR, cats: [cat(A)],
      feeds: [...both(0)(A, ME), ...both(3)(A, PARTNER)] }));
    expect(theirsOnly).toContain(`Robin already knew ${A} ♥`);
    expect(theirsOnly).not.toContain('You already knew');
    expect(theirsOnly).not.toContain('You both');
    const bothKnew = render(colonyOf({ partner: PAIR, cats: [cat(A)],
      feeds: [...both(3)(A, ME), ...both(3)(A, PARTNER)] }));
    expect(bothKnew).toContain(`You both already knew ${A} ♥`);
    // a smaller head start than the max doesn't count as "knowing" it
    const lesser = render(colonyOf({ partner: PAIR, cats: [cat(A)],
      feeds: [...both(1)(A, ME), ...both(3)(A, PARTNER)] }));
    expect(lesser).toContain(`Robin already knew ${A} ♥`);
  });

  it('escapes the partner name in the head-start line', () => {
    const html = render(colonyOf({
      partner: { playerId: PARTNER, petName: '<b>x</b>', wardrobe: [] }, cats: [cat(A)],
      feeds: [...feed(A, PARTNER, 1, 3)],
    }));
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; already knew');
    expect(html).not.toContain('<b>');
  });

  it('does not throw on a cat with a non-string name', () => {
    expect(() => render(colonyOf({ cats: [cat(42), cat(null)] }))).not.toThrow();
  });

  it('says nothing about a head start when there is none', () => {
    const html = render(colonyOf({ cats: [cat(A)], feeds: feed(A, ME, 2) }));
    expect(html).not.toContain('You already knew');
    expect(html).not.toContain('colony-head');
  });

  it('shows name and breed', () => {
    const html = render(colonyOf({ cats: [cat(A)], feeds: feed(A, ME, 1) }));
    expect(html).toContain(A);
    expect(html).toContain(strayBreed(A));
  });

  it('attributes feeds per player and names the partner', () => {
    const colony = colonyOf({
      partner: PAIR, cats: [cat(A)],
      feeds: [...feed(A, ME, 2), ...feed(A, PARTNER, 1)],
    });
    const html = render(colony);
    expect(html).toContain('you fed 2 · Robin fed 1');
  });

  it('says only "you fed n" when solo, and never mentions points', () => {
    const html = render(colonyOf({ cats: [cat(A)], feeds: feed(A, ME, 2) }));
    expect(html).toContain('you fed 2');
    expect(html).not.toContain(' fed 0');
    expect(html).not.toContain('·');
    expect(html).not.toMatch(/points|🐾 \d|\+\d/i);
  });

  it('says who found the cat, and where it is', () => {
    const colony = colonyOf({
      partner: PAIR,
      cats: [cat(A), cat(B, { finder: PARTNER, area: 'seaside' }), cat(C, { tamedBy: ME, tamedWalk: 'walk-1' })],
      feeds: [...feed(A, ME, 1), ...feed(B, PARTNER, 1), ...feed(C, ME, TAME_FEEDS)],
    });
    const html = render(colony);
    expect(html).toContain('found by you');
    expect(html).toContain('found by Robin');
    expect(html).toContain(`in ${CATALOG.areas.park.name}`);
    expect(html).toContain(`in ${CATALOG.areas.seaside.name}`);
    expect(html).toContain('lives in your den 🏠');
  });

  it('shows a shy cat waiting for the partner', () => {
    // only shy names wait; find one by what the renderer says
    const waits = (n, feeds) => render(colonyOf({ partner: PAIR, cats: [cat(n)], feeds }));
    const shy = CAT_NAMES.find((n) => waits(n, feed(n, ME, TAME_FEEDS)).includes('shy — waiting for Robin 🐾'));
    expect(shy).toBeTruthy();
    // ...and once the partner has fed it too, it is no longer waiting
    const done = render(colonyOf({
      partner: PAIR, cats: [cat(shy, { tamedBy: ME, tamedWalk: 'walk-1' })],
      feeds: [...feed(shy, ME, 5), ...feed(shy, PARTNER, 1)],
    }));
    expect(done).not.toContain('shy — waiting');
    expect(done).toContain('lives in your den 🏠');
    // if only the partner has fed it, it is waiting for me
    expect(waits(shy, feed(shy, PARTNER, TAME_FEEDS))).toContain('shy — waiting for you 🐾');
  });

  it('puts tamed cats first, then the furthest along', () => {
    const colony = colonyOf({
      cats: [cat(A), cat(B), cat(C, { tamedBy: ME, tamedWalk: 'walk-1' })],
      feeds: [...feed(A, ME, 1), ...feed(B, ME, 4), ...feed(C, ME, TAME_FEEDS)],
    });
    const html = render(colony);
    const at = (n) => html.indexOf(`data-cat="${n}"`);
    expect(at(C)).toBeLessThan(at(B));
    expect(at(B)).toBeLessThan(at(A));
  });

  it('escapes every name and status string', () => {
    const colony = colonyOf({
      partner: { playerId: PARTNER, petName: '<b>x</b>', wardrobe: [] },
      cats: [cat('<i>Evil</i>', { finder: PARTNER, area: '<u>', wear: '<s>' }), cat(A, { finder: PARTNER })],
      feeds: [...feed('<i>Evil</i>', PARTNER, 1), ...feed(A, ME, 1), ...feed(A, PARTNER, 1)],
    });
    const html = render(colony, {
      status: { mode: 'paired', invite: '<em>', lastError: '<script>' },
      owned: ['<img src=x onerror=1>', 'tophat'],
      catalog: { areas: { '<u>': { name: '<u>area</u>' } }, accessories: { tophat: { name: '<b>Hat</b>', slot: 'head' } } },
    });
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html).not.toContain('<u>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('offers dressing only on cats I found', () => {
    const colony = colonyOf({
      partner: PAIR,
      cats: [cat(A, { wear: 'tophat' }), cat(B, { finder: PARTNER })],
      feeds: [...feed(A, ME, 1), ...feed(B, PARTNER, 1)],
    });
    const html = render(colony);
    expect(html).toContain(`data-colony-dress="${A}"`);
    expect(html).not.toContain(`data-colony-dress="${B}"`);
    expect(count(html, /data-colony-dress=/g)).toBe(1);
    // the options: nothing + owned names; current wear selected
    const sel = html.match(/<select data-colony-dress[\s\S]*?<\/select>/)[0];
    expect(sel).toContain('<option value="">nothing</option>');
    expect(sel).toContain(CATALOG.accessories.bell.name);
    expect(sel).toContain(CATALOG.accessories.tophat.name);
    expect(sel).not.toContain(CATALOG.accessories.crown.name);
    expect(sel).toMatch(/<option value="tophat" selected>/);
  });

  it('selects "nothing" when the cat wears nothing', () => {
    const html = render(colonyOf({ cats: [cat(A)], feeds: feed(A, ME, 1) }));
    expect(html).toContain('<option value="" selected>nothing</option>');
  });

  it('renders the empty state, the full line and a pairing placeholder', () => {
    const empty = render(colonyOf());
    expect(empty).toContain('No colony cats yet — touch noses with a stray, then feed it 🐟');
    expect(empty).not.toContain('colony-bar');
    expect(empty).toContain('<div id="colony-pairing"></div>');
    expect(empty).not.toContain('is full');

    const names = CAT_NAMES.slice(0, COLONY_MAX);
    const full = render(colonyOf({ cats: names.map((n) => cat(n)), feeds: names.flatMap((n) => feed(n, ME, 1)) }));
    expect(full).toContain('The colony is full');
    expect(count(full, /class="colony-bar"/g)).toBe(COLONY_MAX);
  });

  it('renders each mode header line', () => {
    const colony = colonyOf();
    expect(render(colony, { status: { mode: 'local' } })).toContain('Just you for now');
    expect(render(colony, { status: { mode: 'unpaired' } })).toContain('Just you for now');
    expect(render(colony, { status: { mode: 'not-set-up' } })).toContain("Colony sharing isn&#39;t switched on yet");
    expect(render(colony, { status: { mode: 'offline' } }))
      .toContain('Can&#39;t reach the colony right now — your cats are safe on this device');
    const paired = colonyOf({ partner: PAIR });
    expect(render(paired, { status: { mode: 'paired' } })).toContain('Shared with Robin 🐾');
  });

  it('survives garbage input without throwing', () => {
    expect(() => renderColonyHtml({})).not.toThrow();
    expect(() => renderColonyHtml({ colony: null, me: null, status: null, owned: null, catalog: null })).not.toThrow();
  });
});
