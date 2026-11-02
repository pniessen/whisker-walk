import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCrossing, swallowsCanvasClick, CROSS_END_MS } from '../src/game/crossing.js';
import { CATALOG } from '../src/progression.js';
import { postStatus } from '../src/bordercross.js';
import { postsFor } from '../src/borderposts.js';

// During the CROSS_END_MS "Off we go!" pause after a room's host confirms a
// crossing, a click on the game canvas must not re-lock the pointer: the walk
// is about to end (once), and a fresh lock would hide the summary's cursor.

function roomSetup() {
  const overlay = { innerHTML: '' };
  const timers = [];
  const s = {
    welcome: 'Welcome home!', race: null, quest: null, carry: { mouth: { held: null } },
    areaId: 'woods', playerId: 'a', remotes: { list: [] },
    net: { isHost: () => true, sendEvent() {} },
  };
  const ended = [];
  const crossing = createCrossing({
    getSession: () => s, overlay, hud: { toast() {} },
    releaseControl() {}, resumeWalk() {}, endWalk: (o) => ended.push(o),
    getIsTouch: () => false, getEdition: () => 'canon', catalog: CATALOG,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  });
  const post = postsFor('woods').find((p) => p.to === 'moor');
  const status = postStatus(post, { edition: 'canon', unlocked: { areas: ['moor'] } }, CATALOG, 'woods');
  return { crossing, s, timers, ended, status };
}

describe('canvas clicks during "Off we go"', () => {
  it('are swallowed only while a confirmed crossing is on its way out', () => {
    const { crossing, s, timers, ended, status } = roomSetup();
    expect(swallowsCanvasClick(s)).toBe(false);
    crossing.ask(s, { status });
    expect(swallowsCanvasClick(s)).toBe(false); // the card is up: a click on it is the card's
    crossing.confirm();
    expect(swallowsCanvasClick(s)).toBe(true);
    const end = timers.find((t) => t.ms === CROSS_END_MS);
    end.fn();
    expect(ended).toHaveLength(1);
    crossing.confirm();
    expect(ended).toHaveLength(1);
  });

  it('is total over nothing', () => {
    for (const s of [null, undefined, {}, { crossing: null }, { crossing: { to: 'moor' } }]) expect(swallowsCanvasClick(s)).toBe(false);
  });

  it('main.js stops such a click in the capture phase, before the player asks for the lock', () => {
    const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(src).toMatch(/document\.addEventListener\('click', \(e\) => \{\s*if \(e\.target === canvas && swallowsCanvasClick\(session\)\) \{\s*e\.stopPropagation\(\);\s*e\.preventDefault\(\);\s*\}\s*\}, true\);/);
    expect(src).toMatch(/import \{ createCrossing, swallowsCanvasClick \} from '\.\/game\/crossing\.js';/);
  });
});
