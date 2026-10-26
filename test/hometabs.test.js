import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as hometabs from '../src/ui/hometabs.js';
import { HOME_SHEETS, resolveSheet } from '../src/ui/dressingroom.js';

const { renderSkillsHtml, renderStarNamePicker, goldenFound, renderGoldenTallyHtml } = hometabs;
import { candidateStarNames } from '../src/clannames.js';
import { SKILLS, SKILL_FAMILIES, SKILL_IDS } from '../src/skills.js';

// v21 Stream 5: the tab bar is gone. The home screen is the dressing room
// (null) or one sheet from HOME_SHEETS; a stale tab id from an older build
// ('cats', 'accessories', the pre-rename 'play') resolves to the room.
describe('home base sheets', () => {
  it('the tab set is gone from hometabs', () => {
    expect(hometabs.HOME_TABS).toBeUndefined();
    expect(hometabs.resolveTab).toBeUndefined();
  });
  it('HOME_SHEETS holds every sheet the old tabs led to', () => {
    for (const id of ['skills', 'colony', 'social', 'journal', 'album', 'sync', 'settings', 'code']) {
      expect(HOME_SHEETS).toContain(id);
    }
    expect(HOME_SHEETS).not.toContain('cats');
    expect(HOME_SHEETS).not.toContain('accessories');
  });
  it('resolveSheet keeps a known sheet', () => {
    for (const id of HOME_SHEETS) expect(resolveSheet(id)).toBe(id);
  });
  it('resolveSheet sends a stale tab id back to the dressing room (null)', () => {
    for (const id of ['cats', 'accessories', 'play', '']) expect(resolveSheet(id)).toBeNull();
    expect(resolveSheet(undefined)).toBeNull();
    expect(resolveSheet(null)).toBeNull();
    expect(resolveSheet(42)).toBeNull();
  });
});

// A brand-new save: the fields v18 adds are simply absent, which is what
// every pre-v18 payload looks like on first load too.
const EMPTY_STATE = {};

// Every ability persisted as earned. Uses the real catalog ids so a renamed
// id can't leave this test silently asserting against nothing.
const UNLOCKED_STATE = { skills: [...SKILL_IDS] };

describe('renderSkillsHtml', () => {
  it('renders a section per family and a card per ability from an empty state', () => {
    const html = renderSkillsHtml(EMPTY_STATE);
    for (const fam of SKILL_FAMILIES) expect(html).toContain(`${fam.emoji} ${fam.name}`);
    for (const s of SKILLS) expect(html).toContain(`data-skill="${s.id}"`);
    expect(html.match(/class="card skill-card/g)).toHaveLength(SKILLS.length);
  });

  it('shows every ability locked at zero for a brand-new save, with no NaN', () => {
    const html = renderSkillsHtml(EMPTY_STATE);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('Earned ✅');
    expect(html.match(/skill-card locked/g)).toHaveLength(SKILLS.length);
    // Every bar sits at 0%, and every count reads "0/need".
    expect(html.match(/width:0%/g)).toHaveLength(SKILLS.length);
    for (const s of SKILLS) expect(html).toContain(`${s.feat} — 0/${s.progress(EMPTY_STATE).need}`);
    expect(html).toContain(`Abilities earned: 0/${SKILLS.length}`);
  });

  it('shows every ability earned when the save lists them all', () => {
    const html = renderSkillsHtml(UNLOCKED_STATE);
    expect(html.match(/Earned ✅/g)).toHaveLength(SKILLS.length);
    expect(html.match(/skill-card selected/g)).toHaveLength(SKILLS.length);
    expect(html).not.toContain('skill-card locked');
    expect(html).toContain(`Abilities earned: ${SKILLS.length}/${SKILLS.length}`);
    // The feat stays visible on an earned card — it's what the player did.
    for (const s of SKILLS) expect(html).toContain(s.feat);
  });

  it('drops the fraction on an earned card so it cannot contradict itself', () => {
    // state.skills is authoritative (an earned ability is never revoked), so
    // an earned card can outrun its counter. It must not then read
    // "Reach 10 vantage perches — 0/10 · Earned ✅".
    const html = renderSkillsHtml({ skills: ['spring-paws'] });
    expect(html).toContain('Reach 10 vantage perches');
    expect(html).not.toContain('Reach 10 vantage perches — 0/10');
    // ...and the still-locked ability on the same counter keeps its bar.
    expect(html).toContain('Reach 25 vantage perches — 0/25');
    expect(html.match(/skill-bar/g)).toHaveLength(SKILLS.length - 1);
  });

  it('shows the feat in full on locked cards — the challenge is the content', () => {
    const html = renderSkillsHtml(EMPTY_STATE);
    for (const s of SKILLS) {
      expect(html).toContain(s.feat);
      expect(html).toContain(s.effect.replace(/&/g, '&amp;'));
    }
  });

  it('renders partial progress as a clamped percentage', () => {
    // Sure Claws needs 25 mischief tips; 18 of them is the spec's own
    // worked example ("Tip over 25 things — 18/25").
    const html = renderSkillsHtml({ feats: { mischief: 18 } });
    expect(html).toContain('Tip over 25 things — 18/25');
    expect(html).toContain('width:72%');
    // Big Swat rides the same counter at need 40 and stays locked.
    expect(html).toContain('Tip over 40 things — 18/40');
  });

  it('never prints an over-target fraction like "27/25"', () => {
    // 27 tips clears Sure Claws (25) but not Big Swat (40), and both ride
    // the one mischief counter — so the same number has to read as earned on
    // one card and as honest partial progress on the other.
    const html = renderSkillsHtml({ feats: { mischief: 27 } });
    expect(html).not.toContain('27/25');
    expect(html).not.toContain('width:108%');
    expect(html).toContain('Tip over 40 things — 27/40');
    expect(html.match(/Earned ✅/g)).toHaveLength(1);
    // Denominator is SKILLS.length in the renderer, not a literal — the
    // literal here is the point of the assertion, so it moves with the
    // catalog: eleven from the CF-12 descope, twelve since the v20 Sea Legs
    // reinstatement put the spec's full set back.
    expect(html).toContain('Abilities earned: 1/12');
  });

  it('survives a hostile payload without leaking markup or NaN', () => {
    const hostile = {
      skills: '<script>alert(1)</script>',
      feats: { mischief: '<img src=x onerror=alert(1)>', collectible: -5, gift: Infinity },
      golden: 'aaa',
      walks: null,
      friends: 'nope',
      duskWalks: NaN,
    };
    const html = renderSkillsHtml(hostile);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror=');
    // A string `golden` must not count as three golden mice found.
    expect(html).toContain('Find 3 golden mice — 0/3');
    expect(html.match(/skill-card locked/g)).toHaveLength(SKILLS.length);
  });

  it('does not mutate the state it renders', () => {
    const state = { feats: { mischief: 3 }, skills: [] };
    const before = JSON.stringify(state);
    renderSkillsHtml(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});

// A legacy free-text pet name, and no pet name at all, must both render.
describe('star name picker', () => {
  it.each(['Noodle', null])('shows a legacy pet name unchanged: %p', (cur) => {
    const html = renderStarNamePicker(candidateStarNames('player-abc12345'), cur);
    expect(typeof html).toBe('string');
    if (cur) expect(html).toContain(cur);
  });
  it('escapes a hostile current name', () => {
    const html = renderStarNamePicker(candidateStarNames('seed'), '<img src=x>');
    expect(html).not.toContain('<img');
  });
  it('escapes hostile candidates and never throws on junk', () => {
    expect(renderStarNamePicker(['<b>x</b>'], null)).not.toContain('<b>');
    expect(() => renderStarNamePicker(null, undefined)).not.toThrow();
  });
  it('offers one button per candidate', () => {
    const c = candidateStarNames('player-abc12345');
    const html = renderStarNamePicker(c, null);
    for (const n of c) expect(html).toContain(`data-star-name="${n}"`);
  });
});

describe('golden mice tally', () => {
  it('goldenFound counts distinct known ids only', () => {
    const known = new Set(['gm-park-1', 'gm-park-2']);
    expect(goldenFound(['gm-park-1', 'gm-park-1', 'gm-fake-9', 3], known)).toBe(1);
    expect(goldenFound(null, known)).toBe(0);
    expect(goldenFound({ 0: 'gm-park-1', length: 1 }, known)).toBe(0);
    expect(goldenFound(['gm-park-1'], null)).toBe(0);
  });
  it('the tally reads "x of 12" and never more than the total', () => {
    const text = (h) => h.replace(/<[^>]*>/g, '');
    expect(text(renderGoldenTallyHtml(3, 12))).toBe('🥇 3 of 12 golden mice');
    expect(renderGoldenTallyHtml(3, 12)).toContain('3 of 12 golden mice');
    expect(text(renderGoldenTallyHtml(99, 12))).toContain('12 of 12');
    expect(text(renderGoldenTallyHtml(NaN, 12))).toContain('0 of 12');
    expect(text(renderGoldenTallyHtml(-4, 12))).toContain('0 of 12');
  });
  it('keeps the tally on one line and the full phrase available on a phone', () => {
    const html = renderGoldenTallyHtml(3, 12);
    expect(html).toContain('class="hb-gold"');
    expect(html).toContain('<span class="hb-gold-word"> golden mice</span>');
    expect(html).toContain('title="3 of 12 golden mice"');
    expect(html).toContain('aria-label="3 of 12 golden mice"');
    expect(renderGoldenTallyHtml(99, 12)).toContain('title="12 of 12 golden mice"');
  });
  it('on a phone the words are clipped out of sight, not display:none, so a screen reader still reads them', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const rules = [...css.matchAll(/\.hb-gold-word\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r).not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden/);
    const phone = css.slice(css.indexOf('@media (max-width: 480px)', css.indexOf('.hb-gold {')));
    const rule = phone.match(/\.hb-gold-word\s*\{([^}]*)\}/)[1];
    expect(rule).toMatch(/position\s*:\s*absolute/);
    expect(rule).toMatch(/clip-path\s*:\s*inset\(50%\)/);
    expect(rule).toMatch(/overflow\s*:\s*hidden/);
  });
});
