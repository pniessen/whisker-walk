import { describe, it, expect } from 'vitest';
import { HOME_TABS, resolveTab, renderSkillsHtml } from '../src/ui/hometabs.js';
import { SKILLS, SKILL_FAMILIES, SKILL_IDS } from '../src/skills.js';

describe('home base tabs', () => {
  it('lists the six tabs in order, cats first', () => {
    expect(HOME_TABS).toEqual(['cats', 'accessories', 'skills', 'social', 'album', 'settings']);
  });
  it('resolveTab keeps a known id', () => {
    for (const t of HOME_TABS) expect(resolveTab(t)).toBe(t);
  });
  it('resolveTab falls back to cats for unknown/empty/non-string', () => {
    expect(resolveTab('nope')).toBe('cats');
    expect(resolveTab('')).toBe('cats');
    expect(resolveTab(undefined)).toBe('cats');
    expect(resolveTab(null)).toBe('cats');
    expect(resolveTab(42)).toBe('cats');
  });
  it("resolveTab clamps the pre-rename 'play' id to cats", () => {
    expect(resolveTab('play')).toBe('cats');
  });
  it('resolves the v18 skills tab, which did not exist in older saves', () => {
    expect(resolveTab('skills')).toBe('skills');
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

  it('clamps an over-target count rather than printing "27/25"', () => {
    const html = renderSkillsHtml({ feats: { mischief: 27 } });
    expect(html).toContain('Tip over 25 things — 25/25');
    expect(html).not.toContain('27/25');
    expect(html).not.toContain('width:108%');
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
