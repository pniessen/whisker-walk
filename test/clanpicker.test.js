import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  clanPickerModel, renderClanPickerHtml, PICK_ATTR, CLAN_EMBLEMS,
  MOMENT_SEEN_KEY, MOMENT_ATTR, woodsOpen, clanMomentDue, renderClanMomentHtml, clanLineHtml,
} from '../src/ui/clanpicker.js';
import { CATALOG } from '../src/progression.js';
import { TERRITORIES } from '../src/territories.js';
import { clanName, pickableClans, HOMES } from '../src/clanhomes.js';
import { CLAN_SUFFIX, HOME_LINES } from '../src/clanwords.js';

const PARTNER = 'robin-player-02';
const word = CLAN_SUFFIX.toLowerCase();

const save = (over = {}) => ({
  edition: 'canon',
  clanPick: { mine: null, partner: null, partnerId: null },
  colony: { partner: { playerId: PARTNER, petName: 'Robin' } },
  ...over,
});
const cardOf = (m, id) => m.cards.find((c) => c.id === id);

describe('clanPickerModel', () => {
  it('an unpicked save gets five cards, all of them pickable', () => {
    const m = clanPickerModel(save());
    expect(m.mine).toBeNull();
    expect(m.cards).toHaveLength(5);
    expect(m.cards.map((c) => c.id)).toEqual(pickableClans());
    expect(m.cards.every((c) => c.pickable)).toBe(true);
    expect(renderClanPickerHtml(m, 'Robin')).toContain(`Pick your ${word}`);
  });

  it("CliffClan's card can be picked, with its own line", () => {
    const m = clanPickerModel(save());
    expect(cardOf(m, 'gorge')).toMatchObject({
      id: 'gorge', name: clanName('gorge'), place: 'The Gorge', pickable: true, soon: false, line: HOME_LINES.gorge,
      mine: false, partner: false,
    });
    expect(HOME_LINES.gorge).toBe('rocks, cliff dens and tall pines');
    const html = renderClanPickerHtml(m, 'Robin');
    const card = html.split('<button').find((b) => b.includes(`>${clanName('gorge')}<`));
    expect(card).toContain(`${PICK_ATTR}="gorge"`);
    expect(card).not.toContain('aria-disabled');
    expect(card).toContain('<small>rocks, cliff dens and tall pines</small>');
    expect(html.match(new RegExp(PICK_ATTR, 'g'))).toHaveLength(5);
  });

  it('a clan that is not pickable shows greyed with camp coming soon', () => {
    const homes = { ...HOMES, gorge: { neighbours: ['moor'], pickable: false } };
    const m = clanPickerModel(save(), TERRITORIES, homes);
    expect(cardOf(m, 'gorge')).toMatchObject({
      id: 'gorge', name: clanName('gorge'), place: 'The Gorge', pickable: false, soon: true, line: 'camp coming soon',
      mine: false, partner: false,
    });
    const html = renderClanPickerHtml(m, 'Robin');
    const card = html.split('<button').find((b) => b.includes(`>${clanName('gorge')}<`));
    expect(card).toContain('aria-disabled="true"');
    expect(card).not.toContain(PICK_ATTR);
    expect(card).not.toContain('aria-pressed');
    expect(card).toContain('<small>camp coming soon</small>');
    expect(card).not.toContain('territory coming soon');
    expect(html.match(new RegExp(PICK_ATTR, 'g'))).toHaveLength(4);
  });

  it('the four pickable cards are unchanged', () => {
    const m = clanPickerModel(save({ clanPick: { mine: 'river', partner: 'moor', partnerId: PARTNER } }));
    const html = renderClanPickerHtml(m, 'Robin');
    for (const id of pickableClans()) {
      const t = TERRITORIES.find((x) => x.id === id);
      const mine = id === 'river';
      expect(cardOf(m, id)).toEqual({
        id, name: clanName(id), line: HOME_LINES[id], place: t.name, soon: false, pickable: true, mine, partner: id === 'moor',
      });
      expect(html).toContain(`<button class="dr-home ${mine ? 'sel' : ''} dr-home-${id}" ${PICK_ATTR}="${id}" aria-pressed="${mine}">`
        + `<span class="dr-home-name"><span class="dr-home-emblem">${CLAN_EMBLEMS[id]}</span>${clanName(id)}</span><small>of ${t.name}</small><small>${HOME_LINES[id]}</small>`
        + (mine ? '<small class="dr-home-tag">✓ yours</small>' : '')
        + (id === 'moor' ? "<small class=\"dr-home-tag\">🤝 Robin's</small>" : '')
        + '</button>');
    }
  });

  it('every clan has its own emblem and colour class; the off card has neither', () => {
    const html = renderClanPickerHtml(clanPickerModel(save()), 'Robin');
    for (const id of pickableClans()) {
      expect(CLAN_EMBLEMS[id].startsWith('<svg')).toBe(true);
      expect(CLAN_EMBLEMS[id]).toContain('aria-hidden="true"');
      expect(html).toContain(`dr-home-${id}`);
    }
    expect(new Set(pickableClans().map((id) => CLAN_EMBLEMS[id])).size).toBe(5);
    expect(Object.isFrozen(CLAN_EMBLEMS)).toBe(true);
    const homes = { ...HOMES, gorge: { neighbours: ['moor'], pickable: false } };
    const off = renderClanPickerHtml(clanPickerModel(save(), TERRITORIES, homes), 'Robin')
      .split('<button').find((b) => b.includes(`>${clanName('gorge')}<`));
    expect(off).not.toContain('dr-home-gorge');
    expect(off).not.toContain('dr-home-emblem');
    const css = readFileSync('src/style.css', 'utf8');
    for (const id of pickableClans()) expect(css).toContain(`.dr-home-${id}`);
  });

  it('a pick marks exactly one card mine', () => {
    const m = clanPickerModel(save({ clanPick: { mine: 'moor', partner: null, partnerId: null } }));
    expect(m.cards.filter((c) => c.mine).map((c) => c.id)).toEqual(['moor']);
    expect(renderClanPickerHtml(m, 'Robin')).toContain(`Your ${word}: ${clanName('moor')}`);
  });

  it("the partner's current pick marks partner; a stale partnerId marks none", () => {
    const s = save({ clanPick: { mine: 'woods', partner: 'river', partnerId: PARTNER } });
    expect(clanPickerModel(s).cards.filter((c) => c.partner).map((c) => c.id)).toEqual(['river']);
    s.colony.partner = { playerId: 'someone-else-03', petName: 'Sam' };
    expect(clanPickerModel(s).cards.some((c) => c.partner)).toBe(false);
  });

  it('the same pick for both gives both and the "You\'re both" line', () => {
    const m = clanPickerModel(save({ clanPick: { mine: 'woods', partner: 'woods', partnerId: PARTNER } }));
    expect(m.both).toBe(true);
    expect(renderClanPickerHtml(m, 'Robin')).toContain(`You're both ${clanName('woods')}!`);
    const other = clanPickerModel(save({ clanPick: { mine: 'woods', partner: 'river', partnerId: PARTNER } }));
    expect(other.both).toBe(false);
    expect(renderClanPickerHtml(other, 'Robin')).not.toContain("You're both");
  });

  it('a hostile partner pet name is escaped', () => {
    const m = clanPickerModel(save({ clanPick: { mine: 'woods', partner: 'river', partnerId: PARTNER } }));
    const html = renderClanPickerHtml(m, '<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('every card is a data-clan-pick button with aria-pressed, place and line', () => {
    const m = clanPickerModel(save({ clanPick: { mine: 'river', partner: null, partnerId: null } }));
    const html = renderClanPickerHtml(m, 'Robin');
    for (const id of pickableClans()) expect(html).toMatch(new RegExp(`<button class="dr-home[^"]*" data-clan-pick="${id}" aria-pressed="(true|false)"`));
    expect(html).toContain('data-clan-pick="river" aria-pressed="true"');
    expect(html).toContain('✓ yours');
    expect(html).toContain('of The Woods');
  });

  it('the moor and pines are built now, so no card is soon', () => {
    const m = clanPickerModel(save());
    for (const id of ['moor', 'pines', 'woods', 'river', 'gorge']) expect(cardOf(m, id).soon).toBe(false);
    expect(renderClanPickerHtml(m, 'Robin')).not.toContain('territory coming soon');
  });

  it('a territory not built yet is soon, still pickable, and says so', () => {
    const later = TERRITORIES.map((t) => (t.id === 'moor' ? { ...t, status: 'later' } : t));
    const m = clanPickerModel(save(), later);
    expect(cardOf(m, 'moor').soon).toBe(true);
    for (const id of ['woods', 'river', 'pines']) expect(cardOf(m, id).soon).toBe(false);
    const html = renderClanPickerHtml(m, 'Robin');
    expect(html).toContain('territory coming soon');
    expect(html.match(/territory coming soon/g)).toHaveLength(1);
    expect(html).toContain('data-clan-pick="moor"');
  });
});

// Final review M2: the greyed card's text was about 3:1. With no opacity on
// the card, white text, the .92 small line and the .8 "coming soon" all reach
// 4.5:1 over both of the gradient's stops.
describe('the greyed clan card (style.css)', () => {
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  it('reads at 4.5:1 or better', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const rule = css.match(/(?<![\w-])\.dr-home\.dr-home-off \{([^}]*)\}/)[1];
    expect(rule).not.toMatch(/opacity/);
    const stops = rule.match(/#[0-9a-f]{6}/gi);
    expect(stops).toHaveLength(2);
    for (const stop of stops) {
      const bg = rgb(stop);
      for (const a of [1, 0.92, 0.8]) {
        const fg = bg.map((c) => a + c * (1 - a));
        expect(ratio(fg, bg), `${stop} at ${a}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('the pickable clan cards (style.css, final fix wave)', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  it('small text on a coloured card is full strength, the soon line included', () => {
    const m = css.match(/(?<![\w.-])\.dr-home:not\(\.dr-home-off\) small[^{]*\{([^}]*)\}/);
    expect(m, 'a rule for small text on pickable cards').not.toBeNull();
    expect(m[0]).toContain('.dr-home-soon');
    expect(m[1]).toMatch(/opacity: 1;/);
  });
  it('an unknown pickable id gets no empty emblem circle', () => {
    const model = { mine: null, both: false, cards: [{ id: 'nowhere', name: 'Nowhere', line: 'x', place: 'Nowhere', soon: false, pickable: true, mine: false, partner: false }] };
    const html = renderClanPickerHtml(model, 'Robin');
    expect(html).not.toContain('dr-home-emblem');
    expect(html).toContain('<span class="dr-home-name">Nowhere</span>');
  });
  it('the emblems are single shapes: the gorge is one cliff, the woods bolt has an outline', () => {
    expect(CLAN_EMBLEMS.gorge.match(/<path/g)).toHaveLength(1);
    expect(CLAN_EMBLEMS.woods).toContain('stroke="#2f5a33"');
  });
});

describe('disabled buttons (style.css)', () => {
  it('no khaki #6a6250 is left; the dimmed pink is one shared pair of variables', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).not.toContain('#6a6250');
    expect(css).toContain('--btn-off-bg: rgba(231,169,160,.30)');
    expect(css.match(/var\(--btn-off-bg\)/g).length).toBeGreaterThanOrEqual(4);
  });
});

describe('woodsOpen', () => {
  const st = (walks, areas = ['neighborhood']) => ({ walks: { neighborhood: walks }, unlocked: { areas } });
  it('opens at the Woods gate (two Twolegplace walks) or once the Woods is owned', () => {
    const req = CATALOG.areas.woods.requires;
    expect(req).toMatchObject({ area: 'neighborhood', walks: 2 });
    expect(woodsOpen(st(0), CATALOG)).toBe(false);
    expect(woodsOpen(st(1), CATALOG)).toBe(false);
    expect(woodsOpen(st(2), CATALOG)).toBe(true);
    expect(woodsOpen(st(9), CATALOG)).toBe(true);
    expect(woodsOpen(st(0, ['neighborhood', 'woods']), CATALOG)).toBe(true);
  });
  it('is false without a Woods in the catalog and never throws on a hostile save', () => {
    expect(woodsOpen(st(5), { areas: {} })).toBe(false);
    expect(woodsOpen(st(5), null)).toBe(false);
    expect(() => woodsOpen(null, CATALOG)).not.toThrow();
    expect(woodsOpen({ walks: 'x', unlocked: 7 }, CATALOG)).toBe(false);
    expect(woodsOpen({ walks: { neighborhood: NaN } }, CATALOG)).toBe(false);
  });
  it('a Woods with no gate is open', () => {
    expect(woodsOpen({}, { areas: { woods: {} } })).toBe(true);
  });
});

describe('clanMomentDue', () => {
  const s = (over = {}) => ({
    edition: 'canon', walks: { neighborhood: 2 }, unlocked: { areas: ['neighborhood'] },
    clanPick: { mine: null, partner: null, partnerId: null }, ...over,
  });
  it('is due in Clan Edition with no pick and two neighborhood walks', () => {
    expect(clanMomentDue(s(), CATALOG)).toBe(true);
  });
  it('is not due in Legacy', () => {
    expect(clanMomentDue(s({ edition: 'legacy' }), CATALOG)).toBe(false);
  });
  it('is not due once she has picked her own clan', () => {
    for (const id of pickableClans()) expect(clanMomentDue(s({ clanPick: { mine: id, partner: null, partnerId: null } }), CATALOG)).toBe(false);
  });
  it('a partner\'s pick alone does not stop it (the pick is hers to make)', () => {
    expect(clanMomentDue(s({ clanPick: { mine: null, partner: 'river', partnerId: PARTNER } }), CATALOG)).toBe(true);
  });
  it('is not due after one walk, and is due with the Woods owned and no walks', () => {
    expect(clanMomentDue(s({ walks: { neighborhood: 1 } }), CATALOG)).toBe(false);
    expect(clanMomentDue(s({ walks: {}, unlocked: { areas: ['neighborhood', 'woods'] } }), CATALOG)).toBe(true);
  });
  it('an unknown pick id counts as no pick', () => {
    expect(clanMomentDue(s({ clanPick: { mine: 'nowhere' } }), CATALOG)).toBe(true);
  });
  it('the seen key and attribute are composed, device-local names', () => {
    expect(MOMENT_SEEN_KEY).toBe(`whisker-walk-${word}-moment-seen`);
    expect(MOMENT_ATTR).toBe(`data-${word}-moment-open`);
  });
});

describe('renderClanMomentHtml', () => {
  const html = renderClanMomentHtml(clanPickerModel(save()), 'Robin');
  it('is a labelled modal dialog', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    const id = html.match(/aria-labelledby="([^"]+)"/)[1];
    expect(html).toContain(`id="${id}"`);
    expect(html.match(new RegExp(`<h2 id="${id}">([^<]+)</h2>`))[1]).toContain(`${word}s have noticed you`);
  });
  it('shows the five clan cards, each with the pick attribute', () => {
    expect(html.match(new RegExp(PICK_ATTR, 'g'))).toHaveLength(5);
    for (const id of pickableClans()) expect(html).toContain(`${PICK_ATTR}="${id}"`);
  });
  it('has a Not yet button and says the pick can change later in Settings', () => {
    expect(html).toMatch(new RegExp(`<button type="button" class="join-moment-later" data-${word}-later>Not yet</button>`));
    expect(html).toContain('change it later in Settings');
  });
  it('escapes the partner name', () => {
    const model = clanPickerModel(save({ clanPick: { mine: 'woods', partner: 'river', partnerId: PARTNER } }));
    const out = renderClanMomentHtml(model, '<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img src=x');
  });
});

describe('clanLineHtml', () => {
  const line = (over, name = 'Robin', opts) => clanLineHtml(clanPickerModel(save(over)), name, opts);
  it('a pick says who she is, with the emblem and no button', () => {
    const h = line({ clanPick: { mine: 'moor', partner: null, partnerId: null } });
    expect(h).toContain('class="hb-pick-line"');
    expect(h).toContain(`You’re <b>${clanName('moor')}</b>`);
    expect(h).toContain(CLAN_EMBLEMS.moor);
    expect(h).not.toContain('<button');
    expect(h).not.toContain('Robin');
  });
  it('the same clan for both says you are both', () => {
    const h = line({ clanPick: { mine: 'woods', partner: 'woods', partnerId: PARTNER } });
    expect(h).toContain(`you’re both ${clanName('woods')}!`);
  });
  it('a different clan for the partner names them, escaped', () => {
    const h = line({ clanPick: { mine: 'woods', partner: 'river', partnerId: PARTNER } }, '<b>Rob</b>');
    expect(h).toContain(`is ${clanName('river')}`);
    expect(h).toContain('&lt;b&gt;Rob&lt;/b&gt;');
    expect(h).not.toContain('<b>Rob</b>');
  });
  it('no pick: nothing unless she can choose, then a button that reopens the moment', () => {
    expect(line({})).toBe('');
    expect(line({}, 'Robin', { canChoose: false })).toBe('');
    const h = line({}, 'Robin', { canChoose: true });
    expect(h).toContain('class="hb-pick-choose"');
    expect(h).toContain(MOMENT_ATTR);
    expect(h).toContain(`Choose your ${word}`);
  });
  it('a pick ignores canChoose (no choose button once she has chosen)', () => {
    const h = line({ clanPick: { mine: 'pines', partner: null, partnerId: null } }, 'Robin', { canChoose: true });
    expect(h).not.toContain(MOMENT_ATTR);
  });
});
