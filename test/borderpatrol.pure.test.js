import { describe, it, expect } from 'vitest';
import { borderWarriorFor, clanCast, RAIDER_SLOTS } from '../src/clancast.js';
import { AWARDS } from '../src/discoveries.js';
import { discoveryText } from '../src/ui/hud.js';
import { renderChallengeHtml } from '../src/ui/fightui.js';

// Border patrol fight (2026-11-04), Task 1: the pure pieces.
describe('borderWarriorFor', () => {
  it('is a warrior of RAIDER_SLOTS of that clan, the same for the same key', () => {
    for (const clan of ['woods', 'river', 'moor', 'pines', 'gorge']) {
      for (const key of [0, 1, 12345, 4294967295]) {
        const m = borderWarriorFor(clan, key);
        expect(m.clan).toBe(clan);
        expect(RAIDER_SLOTS).toContain(m.slot);
        expect(clanCast(clan)[m.slot]).toBe(m);
        expect(borderWarriorFor(clan, key)).toBe(m);
      }
    }
  });
  it('varies with the key', () => {
    const slots = new Set();
    for (let k = 0; k < 40; k++) slots.add(borderWarriorFor('moor', k).slot);
    expect(slots.size).toBe(RAIDER_SLOTS.length);
  });
  it('is null for anything that is not a clan with a cast', () => {
    for (const c of ['neighborhood', 'island', '__proto__', null, 3]) expect(borderWarriorFor(c, 1)).toBeNull();
  });
});

describe('the border award', () => {
  it('pays 12 and its label is a whole sentence', () => {
    expect(AWARDS.border).toBe(12);
    expect(discoveryText({ type: 'border', label: 'You faced down Mistfur! 🛡️' })).toBe('You faced down Mistfur! 🛡️');
  });
});

describe('renderChallengeHtml words', () => {
  it("defaults to today's exact pill", () => {
    expect(renderChallengeHtml({ name: 'Mossjaw', clan: 'moor' })).toBe(
      '<span class="fight-ask-text">Mossjaw of GaleClan is on your land!</span>'
      + '<span class="fight-ask-buttons">'
      + '<button type="button" class="hud-prompt-btn fight-ask-go" data-fight="go">Fight! '
      + renderChallengeHtml({ name: 'Mossjaw', clan: 'moor' }).split('data-fight="go">Fight! ')[1].split('<span class="fight-key">E</span>')[0]
      + '<span class="fight-key">E</span></button>'
      + '<button type="button" class="hud-prompt-btn fight-ask-off" data-fight="off">Back off<span class="fight-key">Q</span></button>'
      + '</span>');
  });
  it('takes its own ask and off-button words, escaped', () => {
    const html = renderChallengeHtml({ name: 'Mistfur', clan: 'moor', ask: 'blocks your path!', off: 'Run' });
    expect(html).toContain('Mistfur of GaleClan blocks your path!');
    expect(html).toContain('data-fight="off">Run<span class="fight-key">Q</span>');
    expect(renderChallengeHtml({ name: 'A', clan: 'moor', ask: '<b>', off: '<i>' })).not.toMatch(/<b>|<i>/);
  });
});
