import { describe, it, expect } from 'vitest';
import {
  renderColonyHtml, renderPairingHtml, sanitizeInviteCode, shouldPollPairing, pairingPending, pairingErrorLine,
  renderTradesHtml, tradeErrorLine, confirmClickAllowed, CONFIRM_DELAY_MS,
  renderStartButtonHtml, renderPartnerWalkHtml, renderRoomTitleHtml,
} from '../src/ui/colonypanel.js';
import { emptyColony, TAME_FEEDS, COLONY_MAX, SOLO_MAX } from '../src/colony.js';
import { CAT_NAMES, KIT_NAMES, strayBreed } from '../src/straynames.js';
import { CATALOG } from '../src/progression.js';
import { clanNameOf } from '../src/clannames.js';
import { RANK_WORDS, RANK_KEYS } from '../src/clanwords.js';
import { roleFor } from '../src/clanroles.js';

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
  it('leads each card with the clan name and names the rank in words', () => {
    const colony = colonyOf({
      cats: [cat(A), cat(C, { tamedBy: ME, tamedWalk: 'walk-1' })],
      feeds: [...feed(A, ME, 2), ...feed(C, ME, TAME_FEEDS)],
    });
    const html = render(colony);
    expect(html).toContain(clanNameOf(A, { have: 2, tamed: false }));
    expect(html).toContain(clanNameOf(C, { have: TAME_FEEDS, tamed: true }));
    expect(html).toContain(RANK_WORDS.apprentice);
    expect(html).toContain(RANK_WORDS.warrior);
  });

  it('still reads the breed off the stored name', () => {
    const colony = colonyOf({ cats: [cat(A, { tamedBy: ME, tamedWalk: 'walk-1' })] });
    expect(render(colony)).toContain(strayBreed(A));
  });

  it('still shows the stored name, so a cat stays findable by it', () => {
    const colony = colonyOf({ cats: [cat(A, { tamedBy: ME, tamedWalk: 'walk-1' })] });
    // Match the visible title line, not the whole html: data-cat always holds A.
    const title = render(colony).match(/class="colony-title">([^]*?)<\/div>/)[1];
    expect(title.replace(/<[^>]*>/g, '')).toContain(A);
  });

  it('still renders exactly one progress bar per cat', () => {
    const colony = colonyOf({ cats: [cat(A), cat(B), cat(C)] });
    expect(count(render(colony), /role="progressbar"/g)).toBe(3);
  });

  it('escapes a hostile stored name rather than trusting the sanitizer', () => {
    const colony = colonyOf({ cats: [cat('<img src=x>')] });
    const html = render(colony);
    expect(html).not.toContain('<img');
  });

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
    // the partner fed some other cat yesterday, so they still count as playing
    const NOW = Date.UTC(2026, 9, 25);
    const playing = { cat: 'Mochi', by: PARTNER, walk: `walk-${NOW - 24 * 60 * 60 * 1000}`, head: 0 };
    const waits = (n, feeds, now = NOW) => render(colonyOf({ partner: PAIR, cats: [cat(n), cat('Mochi')], feeds: [...feeds, playing] }), { now });
    const shy = CAT_NAMES.find((n) => waits(n, feed(n, ME, TAME_FEEDS)).includes('shy — waiting for Robin 🐾'));
    expect(shy).toBeTruthy();
    // ...and once the partner has fed it too, it is no longer waiting
    const done = render(colonyOf({
      partner: PAIR, cats: [cat(shy, { tamedBy: ME, tamedWalk: 'walk-1' })],
      feeds: [...feed(shy, ME, 5), ...feed(shy, PARTNER, 1)],
    }));
    expect(done).not.toContain('shy — waiting');
    expect(done).toContain('lives in your den 🏠');
    // if only the partner has fed it, it is waiting for me (while I still play too)
    const mine = { ...playing, by: ME };
    expect(waits(shy, [...feed(shy, PARTNER, TAME_FEEDS), mine])).toContain('shy — waiting for you 🐾');
    // a partner who hasn't fed anything for over two weeks no longer holds it
    expect(waits(shy, feed(shy, ME, TAME_FEEDS), NOW + 15 * 24 * 60 * 60 * 1000)).not.toContain('shy — waiting');
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
    const full = render(colonyOf({ partner: PAIR, cats: names.map((n) => cat(n)), feeds: names.flatMap((n) => feed(n, ME, 1)) }));
    expect(full).toContain(`The colony is full — ${COLONY_MAX} cats call it home`);
    expect(count(full, /class="colony-bar"/g)).toBe(COLONY_MAX);
    // alone, it is full at SOLO_MAX, and says pairing makes room
    const solo = CAT_NAMES.slice(0, SOLO_MAX);
    const soloFull = render(colonyOf({ cats: solo.map((n) => cat(n)), feeds: solo.flatMap((n) => feed(n, ME, 1)) }));
    expect(soloFull).toContain(`The colony is full — ${SOLO_MAX} cats call it home`);
    expect(soloFull).toContain(`${COLONY_MAX}`);
    const notYet = render(colonyOf({ cats: solo.slice(1).map((n) => cat(n)), feeds: [] }));
    expect(notYet).not.toContain('is full');
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

describe('renderColonyHtml banner', () => {
  it('shows the escaped name in a colony-banner heading, and nothing without one', () => {
    const html = renderColonyHtml({ colony: emptyColony(), me: 'aaaaaaaa-1111', now: 0, clanName: '<b>x' });
    expect(html).toContain('<h3 class="colony-banner">&lt;b&gt;x</h3>');
    expect(renderColonyHtml({ colony: emptyColony(), me: 'aaaaaaaa-1111', now: 0 })).not.toContain('colony-banner');
  });
});

describe('renderPairingHtml', () => {
  const st = (mode, over = {}) => ({ mode, invite: null, joining: null, lastError: null, ...over });
  const INVITE = { code: 'K7P2QM', expiresAt: '2026-10-24T12:00:00Z', joinerPetName: null };

  it('renders nothing without multiplayer, when paired, or when offline', () => {
    for (const mode of ['local', 'not-set-up', 'offline', 'paired']) {
      expect(renderPairingHtml(st(mode))).toBe('');
    }
    expect(renderPairingHtml(undefined)).toBe('');
  });

  it('needs-name says to name the pet in Social first and offers no controls', () => {
    const html = renderPairingHtml(st('needs-name'), { hasPetName: false });
    expect(html).toContain('Give your pet a name in Social first, then you can share your colony.');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
  });

  it('unpaired with no invite offers a code button and a Got-a-code box', () => {
    const html = renderPairingHtml(st('unpaired'), { hasPetName: true });
    expect(html).toContain('🐈 Share your colony with your brother or sister');
    expect(html).toContain('Get a sharing code');
    expect(html).toContain('Got a code?');
    expect(html).toContain('id="colony-pair-code"');
    expect(html).toContain('maxlength="6"');
    expect(html).toContain('id="colony-pair-join"');
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });

  it('disables the buttons without a pet name, and while busy', () => {
    const noName = renderPairingHtml(st('unpaired'), { hasPetName: false });
    expect(noName).toMatch(/id="colony-pair-join"[^>]*disabled/);
    expect(noName).toMatch(/id="colony-pair-open"[^>]*disabled/);
    const busy = renderPairingHtml(st('unpaired'), { hasPetName: true, busy: true });
    expect(busy).toMatch(/id="colony-pair-join"[^>]*disabled/);
  });

  it('keeps a half-typed code, cleaned, in the box', () => {
    expect(renderPairingHtml(st('unpaired'), { code: 'k7p' })).toContain('value="K7P"');
    expect(renderPairingHtml(st('unpaired'), { code: '"><script>' })).not.toContain('<script>');
  });

  it('inviting shows the code and the 20-minute note while waiting', () => {
    const html = renderPairingHtml(st('unpaired', { invite: INVITE }));
    expect(html).toContain('K7P2QM');
    expect(html).toContain('read it out to them. It works for 20 minutes.');
    expect(html).toContain('Waiting for them to type it…');
    expect(html).not.toContain('colony-pair-yes');
  });

  it('inviting with a joiner asks Is that them? with Yes and No', () => {
    const html = renderPairingHtml(st('unpaired', { invite: { ...INVITE, joinerPetName: 'Robin' } }));
    expect(html).toContain('wants to share your colony. Is that them?');
    expect(html).toContain('Robin');
    expect(html).toContain('id="colony-pair-yes"');
    expect(html).toContain('Yes, share!');
    expect(html).toContain('id="colony-pair-no"');
    expect(html).not.toContain('Waiting for them to type it');
  });

  it('joining says who it is waiting for', () => {
    const html = renderPairingHtml(st('unpaired', { joining: { inviterPetName: 'Robin' } }));
    expect(html).toContain('Waiting for <strong>Robin</strong> to say yes…');
    expect(html).not.toContain('<button');
  });

  it('escapes the joiner, the inviter, the code and the error', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const a = renderPairingHtml(st('unpaired', { invite: { ...INVITE, joinerPetName: evil } }));
    const b = renderPairingHtml(st('unpaired', { joining: { inviterPetName: evil } }));
    const c = renderPairingHtml(st('unpaired', { invite: { ...INVITE, code: evil } }));
    const d = renderPairingHtml(st('unpaired'), { error: evil });
    for (const html of [a, b, c, d]) {
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    }
  });

  it('shows an error line and still shows the controls', () => {
    const html = renderPairingHtml(st('unpaired'), { error: "That code didn't work — check it and try again." });
    expect(html).toContain('role="alert"');
    expect(html).toContain('check it and try again');
    expect(html).toContain('id="colony-pair-join"');
  });

  it('renderColonyHtml puts the pairing area in the #colony-pairing placeholder', () => {
    const html = renderColonyHtml({
      colony: emptyColony(), me: ME, status: st('unpaired'), catalog: CATALOG, owned: [], pairing: { hasPetName: true },
    });
    expect(html).toMatch(/<div id="colony-pairing">[\s\S]*Get a sharing code[\s\S]*<\/div>/);
    expect(count(html, /id="colony-pairing"/g)).toBe(1);
  });
});

describe('sanitizeInviteCode', () => {
  it('uppercases, trims, caps at 6 and drops characters outside the invite alphabet', () => {
    expect(sanitizeInviteCode('  k7p2qm  ')).toBe('K7P2QM');
    expect(sanitizeInviteCode('k7p2qmzz')).toBe('K7P2QM');
    expect(sanitizeInviteCode('o0i1l-!')).toBe('');
    expect(sanitizeInviteCode('K 7-P2Q')).toBe('K7P2Q');
    expect(sanitizeInviteCode(null)).toBe('');
    expect(sanitizeInviteCode(12345)).toBe('2345');
  });
});

describe('pairing poll decision', () => {
  const inviting = { mode: 'unpaired', invite: { code: 'K7P2QM', expiresAt: 'x', joinerPetName: null }, joining: null };
  const joining = { mode: 'unpaired', invite: null, joining: { inviterPetName: 'Robin' } };
  const idle = { mode: 'unpaired', invite: null, joining: null };
  const on = { tab: 'colony', visible: true, inWalk: false };

  it('polls only while pending, on the Colony tab, visible and not in a walk', () => {
    expect(shouldPollPairing(inviting, on)).toBe(true);
    expect(shouldPollPairing(joining, on)).toBe(true);
    expect(shouldPollPairing(idle, on)).toBe(false);
    expect(shouldPollPairing({ ...inviting, mode: 'paired' }, on)).toBe(false);
    expect(shouldPollPairing({ ...inviting, mode: 'offline' }, on)).toBe(false);
    expect(shouldPollPairing(inviting, { ...on, tab: 'cats' })).toBe(false);
    expect(shouldPollPairing(inviting, { ...on, visible: false })).toBe(false);
    expect(shouldPollPairing(inviting, { ...on, inWalk: true })).toBe(false);
    expect(shouldPollPairing(undefined, on)).toBe(false);
    expect(shouldPollPairing(inviting)).toBe(false);
  });

  it('pairingPending is true for an open code or a typed one, nothing else', () => {
    expect(pairingPending(inviting)).toBe(true);
    expect(pairingPending(joining)).toBe(true);
    expect(pairingPending(idle)).toBe(false);
  });
});

describe('pairingErrorLine', () => {
  it('maps the failures to plain lines and the successes to none', () => {
    expect(pairingErrorLine('bad-code')).toBe("That code didn't work — check it and try again.");
    expect(pairingErrorLine('already-paired')).toBe('This player is already sharing a colony.');
    expect(pairingErrorLine('taken')).toBe('Someone else is already using that code.');
    expect(pairingErrorLine('error')).toBe('Something went wrong — try again.');
    expect(pairingErrorLine('denied')).toBe('Something went wrong — try again.');
    for (const ok of ['ok', 'pending', 'paired', 'declined']) expect(pairingErrorLine(ok)).toBeNull();
  });
});

// v21 Stream 2, Task 10: the "While you were out" card, and the "they said no" line.
import { renderNewsHtml, theySaidNo, PAIR_DECLINED_LINE } from '../src/ui/colonypanel.js';

describe('renderNewsHtml', () => {
  it('is a titled card with the lines and a Let\'s go! button', () => {
    const html = renderNewsHtml({ lines: ['Robin fed Pickles 🐟', 'Pickles came home to the den! 🏠'], any: true }, 'Robin');
    expect(html).toContain('While you were out 🐾');
    expect(html).toContain("Let's go!");
    expect(html).toContain('id="colony-news-ok"');
    expect(count(html, /<li/g)).toBe(2);
    expect(html).toContain('Robin fed Pickles 🐟');
  });

  it('escapes every line', () => {
    const evil = '<img src=x onerror=alert(1)> & "q" \'s\'';
    const html = renderNewsHtml({ lines: [evil, '<script>1</script>'], any: true }, '<b>Robin</b>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot; &#39;s&#39;');
    expect(html).toContain('&lt;script&gt;1&lt;/script&gt;');
  });

  it('renders nothing when there is nothing to say, and survives bad input', () => {
    expect(renderNewsHtml({ lines: [], any: false }, 'Robin')).toBe('');
    expect(renderNewsHtml(null, 'Robin')).toBe('');
    expect(renderNewsHtml({ lines: 'x' }, 'Robin')).toBe('');
    expect(renderNewsHtml({ lines: [7, null, 'ok'], any: true })).toContain('<li>ok</li>');
  });
});

describe('theySaidNo', () => {
  const waiting = { mode: 'unpaired', invite: null, joining: { inviterPetName: 'Robin' }, lastError: null };
  const idle = { mode: 'unpaired', invite: null, joining: null, lastError: null };
  it('fires when a pending join vanishes on a good sync', () => {
    expect(theySaidNo(waiting, idle)).toBe(true);
    expect(PAIR_DECLINED_LINE).toBe('They said no — ask them for a new code.');
  });
  it('does not fire for yes, trouble, a still-pending join or no earlier join', () => {
    expect(theySaidNo(waiting, { ...idle, mode: 'paired' })).toBe(false);
    expect(theySaidNo(waiting, { ...idle, mode: 'offline', lastError: 'offline' })).toBe(false);
    expect(theySaidNo(waiting, { ...idle, lastError: 'offline' })).toBe(false);
    expect(theySaidNo(waiting, waiting)).toBe(false);
    expect(theySaidNo(idle, idle)).toBe(false);
    expect(theySaidNo({ ...idle, invite: { code: 'K7P2QM' } }, idle)).toBe(false);
    expect(theySaidNo(null, idle)).toBe(false);
    expect(theySaidNo(waiting, undefined)).toBe(false);
  });
});

// ---- Trading (Task 11) -------------------------------------------------------
describe('renderTradesHtml', () => {
  const pairedColony = (over = {}) => ({
    ...emptyColony(), id: 'col-1',
    partner: { playerId: PARTNER, petName: 'Robin', wardrobe: ['crown', 'wizard', 'bell', 'tophat'] },
    ...over,
  });
  const trades = (colony, extra = {}, state = {}) =>
    renderTradesHtml({ colony, me: ME, owned: ['bell', 'bandana', 'tophat', 'glow'], catalog: CATALOG, ...extra, state });
  const options = (html, attr) => {
    const m = html.match(new RegExp(`<select[^>]*${attr}[^>]*>([\\s\\S]*?)</select>`));
    return m ? [...m[1].matchAll(/<option value="([^"]*)"/g)].map((x) => x[1]) : null;
  };
  const trade = (extra = {}) => ({ id: 5, from: ME, to: PARTNER, give: 'tophat', want: 'crown', status: 'offered', ...extra });

  it('renders nothing unless the colony is paired', () => {
    expect(trades({ ...emptyColony() })).toBe('');
    expect(trades(pairedColony({ partner: null }))).toBe('');
    expect(renderTradesHtml({})).toBe('');
    expect(renderTradesHtml()).toBe('');
  });

  it('offers my tradeable items, never the starters', () => {
    const html = trades(pairedColony());
    expect(options(html, 'data-trade-give')).toEqual(['tophat', 'glow']);
  });

  it('wants only partner items I do not own, and never starters', () => {
    const html = trades(pairedColony());
    // partner has crown, wizard, bell, tophat; I own bell and tophat
    expect(options(html, 'data-trade-want')).toEqual(['crown', 'wizard']);
  });

  it('never offers a visit prize to give, nor lists one the partner has', () => {
    const colony = pairedColony({ partner: { playerId: PARTNER, petName: 'Robin', wardrobe: ['crown', 'starshades'] } });
    const html = trades(colony, { owned: ['bell', 'tophat', 'glow', 'partycrown'] });
    expect(options(html, 'data-trade-give')).toEqual(['tophat', 'glow']);
    expect(options(html, 'data-trade-want')).toEqual(['crown']);
  });

  it('shows the offer button and the plain no-take-backs line', () => {
    const html = trades(pairedColony());
    expect(html).toContain('data-trade-action="offer"');
    expect(html).toContain('Swaps are forever — no take-backs!');
  });

  it('explains an empty list instead of showing a dead form', () => {
    const none = trades(pairedColony(), { owned: ['bell', 'bandana'] });
    expect(none).toContain('Unlock some accessories to trade');
    expect(none).not.toContain('data-trade-action="offer"');
    const same = trades(pairedColony({ partner: { playerId: PARTNER, petName: 'Robin', wardrobe: ['bell', 'tophat'] } }));
    expect(same).toContain('Robin has nothing you don\'t already have');
    expect(same).not.toContain('data-trade-action="offer"');
  });

  it('keeps the selected give/want when they are still valid, else the first', () => {
    const html = trades(pairedColony(), {}, { give: 'glow', want: 'wizard' });
    expect(html).toMatch(/<option value="glow" selected>/);
    expect(html).toMatch(/<option value="wizard" selected>/);
    const stale = trades(pairedColony(), {}, { give: 'bell', want: 'nope' });
    expect(stale).toMatch(/<option value="tophat" selected>/);
    expect(stale).toMatch(/<option value="crown" selected>/);
  });

  it('shows my open offer with a Cancel, and no new-offer form', () => {
    const html = trades(pairedColony({ trades: [trade()] }));
    expect(html).toContain('You offered Top Hat for Flower Crown');
    expect(html).toMatch(/data-trade-action="cancel"[^>]*data-trade-id="5"|data-trade-id="5"[^>]*data-trade-action="cancel"/);
    expect(html).not.toContain('data-trade-give');
  });

  it('shows an offer to me with Swap! and No thanks, and Swap! does NOT answer, it asks first', () => {
    const t = trade({ from: PARTNER, to: ME, give: 'crown', want: 'tophat' });
    const html = trades(pairedColony({ trades: [t] }));
    expect(html).toContain('Robin offers Flower Crown for your Top Hat');
    expect(html).toMatch(/data-trade-action="accept"/);
    expect(html).toMatch(/data-trade-action="decline"/);
    expect(html).not.toMatch(/data-trade-action="confirm"/);
    expect(html).not.toContain('Yes — swap forever');
  });

  it('after the first click it says plainly the swap is final and needs a second, explicit click', () => {
    const t = trade({ from: PARTNER, to: ME, give: 'crown', want: 'tophat' });
    const html = trades(pairedColony({ trades: [t] }), {}, { confirmId: 5 });
    expect(html).toContain('Yes — swap forever');
    expect(html).toMatch(/data-trade-action="confirm"[^>]*data-trade-id="5"|data-trade-id="5"[^>]*data-trade-action="confirm"/);
    expect(html).toMatch(/data-trade-action="back"/);
    expect(html).toMatch(/forever/i);
    expect(html).toMatch(/can.t be undone|no take-backs/i);
    expect(html).not.toMatch(/data-trade-action="accept"/);
    // a confirm for some other trade shows the normal first step
    expect(trades(pairedColony({ trades: [t] }), {}, { confirmId: 99 })).not.toContain('Yes — swap forever');
  });

  it('cannot swap for an item I no longer own: only No thanks', () => {
    const t = trade({ from: PARTNER, to: ME, give: 'crown', want: 'wizard' });
    const html = trades(pairedColony({ trades: [t] }));
    expect(html).not.toMatch(/data-trade-action="accept"/);
    expect(html).toMatch(/data-trade-action="decline"/);
  });

  it('ignores finished trades and offers between other players', () => {
    const done = [trade({ id: 1, status: 'accepted' }), trade({ id: 2, status: 'declined' }),
      trade({ id: 3, status: 'cancelled' }), trade({ id: 4, from: 'zzzz-other-9999', to: 'yyyy-other-9999' })];
    const html = trades(pairedColony({ trades: done }));
    expect(html).not.toContain('You offered');
    expect(html).not.toContain('offers');
    expect(html).toContain('data-trade-give');
  });

  it('disables every button while busy, and shows an error as an alert', () => {
    const t = trade({ from: PARTNER, to: ME, give: 'crown', want: 'tophat' });
    const html = trades(pairedColony({ trades: [t] }), {}, { busy: true, error: 'Oops <b>' });
    expect(html).toMatch(/data-trade-action="accept"[^>]*disabled/);
    expect(html).toMatch(/role="alert"/);
    expect(html).toContain('Oops &lt;b&gt;');
    const form = trades(pairedColony(), {}, { busy: true });
    expect(form).toMatch(/data-trade-action="offer"[^>]*disabled/);
  });

  it('escapes the partner name, ids and catalog names everywhere', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const catalog = { accessories: {
      tophat: { name: '<b>Hat</b>' }, glow: { name: 'Glow' }, crown: { name: 'Cr"own' }, wizard: { name: 'Wiz' },
    } };
    const colony = pairedColony({
      partner: { playerId: PARTNER, petName: evil, wardrobe: ['crown', 'wizard'] },
      trades: [trade({ from: PARTNER, to: ME, give: 'crown', want: 'tophat' })],
    });
    for (const state of [{}, { confirmId: 5 }]) {
      const html = renderTradesHtml({ colony, me: ME, owned: ['bell', 'tophat', 'glow'], catalog, state });
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<b>Hat');
      expect(html).toContain('&lt;img');
      expect(html).toContain('Cr&quot;own');
    }
    const form = renderTradesHtml({ colony: { ...colony, trades: [] }, me: ME, owned: ['bell', 'tophat', 'glow'], catalog });
    expect(form).not.toContain('<img');
    expect(form).toContain('&lt;b&gt;Hat&lt;/b&gt;');
    const empty = renderTradesHtml({ colony: { ...colony, trades: [] }, me: ME, owned: ['bell'], catalog });
    expect(empty).not.toContain('<img');
  });

  it('skips items the catalog does not know (hostile wardrobe entries)', () => {
    const colony = pairedColony({ partner: { playerId: PARTNER, petName: 'Robin', wardrobe: ['crown', '<script>', 'constructor', '__proto__'] } });
    const html = trades(colony, { owned: ['bell', 'tophat', '<x>'] });
    expect(options(html, 'data-trade-want')).toEqual(['crown']);
    expect(options(html, 'data-trade-give')).toEqual(['tophat']);
  });

  it('is part of the Colony panel only when paired', () => {
    const colony = pairedColony();
    const on = renderColonyHtml({ colony, me: ME, members: 2, status: { mode: 'paired' }, owned: ['bell', 'tophat'], catalog: CATALOG });
    expect(on).toContain('id="colony-trading"');
    expect(on).toContain('data-trade-give');
    for (const mode of ['local', 'unpaired', 'offline', 'not-set-up', 'needs-name']) {
      const off = renderColonyHtml({ colony, me: ME, members: 2, status: { mode }, owned: ['bell', 'tophat'], catalog: CATALOG });
      expect(off).not.toContain('colony-trading');
    }
  });
});

describe('tradeErrorLine', () => {
  it('is quiet on success and plain on every failure', () => {
    for (const w of ['ok', 'accepted', 'declined', 'cancelled']) expect(tradeErrorLine(w)).toBe(null);
    expect(tradeErrorLine('not-owned')).toMatch(/don.t have/);
    expect(tradeErrorLine('gone')).toMatch(/not there|isn.t there/);
    expect(tradeErrorLine('error')).toMatch(/try again/);
    expect(tradeErrorLine('whatever')).toMatch(/try again/);
    expect(tradeErrorLine(undefined)).toMatch(/try again/);
  });
});

describe('confirmClickAllowed', () => {
  const ok = { confirmId: 5, id: 5, shownAt: 10_000, now: 10_000 + CONFIRM_DELAY_MS, detail: 1 };
  it('allows a deliberate second click on the confirm button that was shown', () => {
    expect(CONFIRM_DELAY_MS).toBeGreaterThanOrEqual(600);
    expect(confirmClickAllowed(ok)).toBe(true);
    expect(confirmClickAllowed({ ...ok, now: ok.now + 5000, detail: 0 })).toBe(true); // keyboard activation
  });
  it('ignores a click that lands too soon after the confirm step appeared (a double-tap)', () => {
    expect(confirmClickAllowed({ ...ok, now: ok.shownAt + 50 })).toBe(false);
    expect(confirmClickAllowed({ ...ok, now: ok.shownAt + CONFIRM_DELAY_MS - 1 })).toBe(false);
  });
  it('ignores the second half of a double-click, whatever the timing', () => {
    expect(confirmClickAllowed({ ...ok, detail: 2 })).toBe(false);
    expect(confirmClickAllowed({ ...ok, detail: 3 })).toBe(false);
  });
  it('needs the confirm step to be for this very offer', () => {
    expect(confirmClickAllowed({ ...ok, confirmId: null })).toBe(false);
    expect(confirmClickAllowed({ ...ok, confirmId: 4 })).toBe(false);
    expect(confirmClickAllowed({ ...ok, id: 4 })).toBe(false);
  });
  it('fails closed on junk', () => {
    expect(confirmClickAllowed()).toBe(false);
    expect(confirmClickAllowed({ ...ok, shownAt: null })).toBe(false);
    expect(confirmClickAllowed({ ...ok, shownAt: NaN })).toBe(false);
    expect(confirmClickAllowed({ ...ok, now: undefined })).toBe(false);
    expect(confirmClickAllowed({ ...ok, now: ok.shownAt - 5000 })).toBe(false); // clock went backwards
  });
});

describe('renderTradesHtml — offers I should not accept', () => {
  const colonyWith = (t) => ({
    ...emptyColony(), id: 'col-1',
    partner: { playerId: PARTNER, petName: 'Robin', wardrobe: ['crown', 'wizard'] },
    trades: [{ id: 5, from: PARTNER, to: ME, give: 'crown', want: 'tophat', status: 'offered', ...t }],
  });
  const view = (t, owned = ['bell', 'bandana', 'tophat', 'glow']) =>
    renderTradesHtml({ colony: colonyWith(t), me: ME, owned, catalog: CATALOG, state: { confirmId: 5 } });

  it('no Swap! (and no confirm) when I already own what they give', () => {
    const html = view({}, ['bell', 'tophat', 'crown']);
    expect(html).toContain('You already have Flower Crown');
    expect(html).not.toMatch(/data-trade-action="(accept|confirm)"/);
    expect(html).not.toContain('Yes — swap forever');
    expect(html).toMatch(/data-trade-action="decline"/);
  });
  it('no Swap! when what they give is a starter', () => {
    const html = view({ give: 'bell' }, ['bandana', 'tophat']);
    expect(html).toMatch(/Bell Collar can.t be swapped/);
    expect(html).not.toMatch(/data-trade-action="(accept|confirm)"/);
    expect(html).toMatch(/data-trade-action="decline"/);
  });
  it('no Swap! when what they want is a starter', () => {
    const html = view({ want: 'bandana' });
    expect(html).toMatch(/Bandana can.t be swapped/);
    expect(html).not.toMatch(/data-trade-action="(accept|confirm)"/);
    expect(html).toMatch(/data-trade-action="decline"/);
  });
  it('no Swap! when what they give or want is a visit prize', () => {
    let html = view({ give: 'starshades' });
    expect(html).toMatch(/Star Shades can.t be swapped|can.t be swapped/);
    expect(html).not.toMatch(/data-trade-action="(accept|confirm)"/);
    html = view({ want: 'partycrown' }, ['bell', 'partycrown']);
    expect(html).toMatch(/can.t be swapped/);
    expect(html).not.toMatch(/data-trade-action="(accept|confirm)"/);
    expect(html).toMatch(/data-trade-action="decline"/);
  });
  it('still offers Swap! for a good offer', () => {
    expect(renderTradesHtml({ colony: colonyWith({}), me: ME, owned: ['bell', 'tophat'], catalog: CATALOG, state: {} }))
      .toMatch(/data-trade-action="accept"/);
  });
});

// v21 Stream 2, Task 12 — pair walks: no code to type, and either sibling's
// Start works. homebase.js renders these into the hero and Social's Walk
// together section.
describe('walk together with your partner (Task 12)', () => {
  const paired = { mode: 'paired' };
  const room = (o = {}) => ({ code: 'ABCD', roster: [], isHost: false, pair: false, starting: false, ...o });
  const HOSTILE = { playerId: PARTNER, petName: '<img src=x onerror=alert(1)>', wardrobe: [] };

  it('every room member gets the same Start; nobody waits for the host', () => {
    for (const isHost of [true, false]) {
      const html = renderStartButtonHtml(room({ isHost }));
      expect(html).toContain('Start the walk together 🐾');
      expect(html).not.toContain('disabled');
      expect(html).not.toMatch(/Waiting for host/);
    }
    expect(renderStartButtonHtml(null)).toContain('Start the walk 🐾');
    expect(renderStartButtonHtml(null)).not.toContain('together');
    expect(renderStartButtonHtml(null)).toMatch(/id="btn-start"/);
  });

  it('a Start that is waiting for the host reads "Starting…" and cannot be pressed again', () => {
    const html = renderStartButtonHtml(room({ starting: true }));
    expect(html).toContain('Starting…');
    expect(html).toContain('disabled');
    expect(html).toMatch(/id="btn-start"/);
  });

  it('paired: one button, the partner named, nothing to type', () => {
    const html = renderPartnerWalkHtml({ status: paired, colony: colonyOf({ partner: PAIR }), room: null });
    expect(html).toContain('🐾 Walk with Robin');
    expect(html).toMatch(/<button[^>]*id="wt-pair-walk"/);
    expect(html).not.toMatch(/<input/);
  });

  it('no button unless paired, and none while already in a room', () => {
    for (const mode of ['local', 'unpaired', 'needs-name', 'offline', 'not-set-up']) {
      expect(renderPartnerWalkHtml({ status: { mode }, colony: colonyOf({ partner: PAIR }), room: null })).toBe('');
    }
    expect(renderPartnerWalkHtml({ status: paired, colony: colonyOf({ partner: PAIR }), room: room() })).toBe('');
    expect(renderPartnerWalkHtml({ status: paired, colony: colonyOf(), room: null })).toBe('');
    expect(renderPartnerWalkHtml({ status: null, colony: null, room: null })).toBe('');
  });

  it("a pair room reads 'Walking with …' instead of a code to share", () => {
    const html = renderRoomTitleHtml(room({ pair: true, code: 'P0123456789abcdef' }), colonyOf({ partner: PAIR }));
    expect(html).toBe('Walking with Robin');
    expect(html).not.toContain('0123456789abcdef');
    expect(renderRoomTitleHtml(room({ code: 'ABCD' }), colonyOf({ partner: PAIR }))).toBe('Room ABCD — share this code!');
    expect(renderRoomTitleHtml(room({ pair: true }), colonyOf())).toBe('Walking with your partner');
  });

  it("escapes the partner's name everywhere it appears", () => {
    const colony = colonyOf({ partner: HOSTILE });
    const btn = renderPartnerWalkHtml({ status: paired, colony, room: null });
    const title = renderRoomTitleHtml(room({ pair: true }), colony);
    const code = renderRoomTitleHtml(room({ code: '<b>' }), colony);
    for (const html of [btn, title, code]) expect(html).not.toMatch(/<img|<b>/);
    expect(btn).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(title).toContain('&lt;img');
  });
});

describe('den roles on the card', () => {
  const tamed = (name) => cat(name, { tamedBy: ME, tamedWalk: 'walk-1' });
  const withRole = (key) => CAT_NAMES.find((n) => roleFor(n) === key);
  const plain = withRole(RANK_KEYS.warrior);
  const elder = withRole(RANK_KEYS.elder);
  const queen = withRole(RANK_KEYS.queen);
  // The descriptor span of the card for `name`.
  const descriptor = (html, name) => {
    const card = html.split('<div class="card ').find((c) => c.includes(`data-cat="${name}"`));
    return card.match(/<span class="colony-rank">([^<]*)<\/span>/)[1];
  };
  const roles = (medicine, deputy) => ({ medicine, deputy });

  it('shows a tamed medicine cat as the medicine cat', () => {
    const html = render(colonyOf({ cats: [tamed(plain)] }), { clanRoles: roles(plain, null) });
    expect(descriptor(html, plain)).toBe(RANK_WORDS.medicine);
  });

  it('shows a tamed deputy as the deputy', () => {
    const html = render(colonyOf({ cats: [tamed(plain)] }), { clanRoles: roles(null, plain) });
    expect(descriptor(html, plain)).toBe(RANK_WORDS.deputy);
  });

  it('shows both words when one cat holds both', () => {
    const html = render(colonyOf({ cats: [tamed(plain)] }), { clanRoles: roles(plain, plain) });
    expect(descriptor(html, plain)).toBe(`${RANK_WORDS.medicine} · ${RANK_WORDS.deputy}`);
  });

  it('shows a tamed elder and a tamed queen by their derived role', () => {
    const html = render(colonyOf({ cats: [tamed(elder), tamed(queen)] }), { clanRoles: roles(null, null) });
    expect(descriptor(html, elder)).toBe(RANK_WORDS.elder);
    expect(descriptor(html, queen)).toBe(RANK_WORDS.queen);
  });

  it('shows a plain tamed cat as a warrior', () => {
    const html = render(colonyOf({ cats: [tamed(plain)] }), { clanRoles: roles(null, null) });
    expect(descriptor(html, plain)).toBe(RANK_WORDS.warrior);
  });

  it('keeps an untamed cat on its rank word, even when a verdict names it', () => {
    const colony = colonyOf({ cats: [cat(plain)], feeds: feed(plain, ME, 1) });
    const html = render(colony, { clanRoles: roles(plain, plain) });
    expect(descriptor(html, plain)).toBe(RANK_WORDS.kit);
  });

  // Spec §6.5: a kit that is fed becomes an apprentice. A KIT_NAMES cat is in
  // colony.cats only because it was fed, so its rank floors at apprentice.
  it('shows a once-fed kit-named colony cat as an apprentice, not a kit', () => {
    const kit = KIT_NAMES[0];
    const html = render(colonyOf({ cats: [cat(kit)], feeds: feed(kit, ME, 1) }), { clanRoles: roles(null, null) });
    expect(descriptor(html, kit)).toBe(RANK_WORDS.apprentice);
    expect(html).toContain(clanNameOf(kit, { have: 2, tamed: false }));
    expect(html).not.toContain(clanNameOf(kit, { have: 1, tamed: false }));
  });

  it('a kit-named cat still rises past apprentice when tamed', () => {
    const kit = KIT_NAMES[0];
    const html = render(colonyOf({ cats: [tamed(kit)] }), { clanRoles: roles(null, null) });
    expect(html).toContain(clanNameOf(kit, { have: TAME_FEEDS, tamed: true }));
  });

  it('lets a verdict take the place of the derived role', () => {
    const html = render(colonyOf({ cats: [tamed(queen)] }), { clanRoles: roles(queen, null) });
    expect(descriptor(html, queen)).toBe(RANK_WORDS.medicine);
  });

  it.each([undefined, null, 42, 'x', [], { medicine: 42, deputy: {} }, Object.create({ medicine: plain })])(
    'renders a malformed clanRoles (%p) as no verdicts and never throws', (bad) => {
      const html = render(colonyOf({ cats: [tamed(plain)] }), { clanRoles: bad });
      expect(descriptor(html, plain)).toBe(RANK_WORDS.warrior);
    });

  it('ignores a verdict naming a cat that is not in the colony', () => {
    const html = render(colonyOf({ cats: [tamed(plain)] }), { clanRoles: roles(...CAT_NAMES.filter((n) => n !== plain)) });
    expect(descriptor(html, plain)).toBe(RANK_WORDS.warrior);
    expect(html).not.toContain(RANK_WORDS.medicine);
  });

  it('escapes the descriptor', () => {
    const html = render(colonyOf({ cats: [tamed('<b>x</b>')] }), { clanRoles: roles('<b>x</b>', null) });
    expect(html).not.toContain('<b>x');
  });
});
