import { describe, it, expect, vi } from 'vitest';
import { createCrossing } from '../src/game/crossing.js';
import { pauseCardHtml } from '../src/game/walk.js';
import { CATALOG } from '../src/progression.js';
import { postStatus } from '../src/bordercross.js';
import { postsFor } from '../src/borderposts.js';

function setup({ session = {}, touch = false } = {}) {
  const overlay = { innerHTML: '' };
  const s = { welcome: 'Welcome home!', race: null, quest: null, carry: { mouth: { held: null } }, ...session };
  const calls = { release: 0, resume: 0, endWalk: [] };
  const crossing = createCrossing({
    getSession: () => s,
    overlay,
    hud: { toast() {} },
    releaseControl: () => { calls.release += 1; },
    resumeWalk: () => { calls.resume += 1; },
    endWalk: (o) => calls.endWalk.push(o),
    getIsTouch: () => touch,
    catalog: CATALOG,
    setTimeout: (fn) => { fn(); return 0; },
  });
  return { crossing, overlay, s, calls };
}
const goData = () => {
  const post = postsFor('woods').find((p) => p.to === 'moor');
  const state = { edition: 'canon', unlocked: { areas: ['moor'] } };
  return { post, status: postStatus(post, state, CATALOG, 'woods') };
};

describe('the crossing card', () => {
  it('ask then yes ends the walk with the crossing', () => {
    const { crossing, overlay, s, calls } = setup();
    crossing.ask(s, goData());
    expect(s.crossing).toEqual({ to: 'moor', name: 'The Moor' });
    expect(overlay.innerHTML).toContain('Head to the Moor?');
    expect(calls.release).toBe(1);
    crossing.confirm();
    expect(calls.endWalk).toEqual([{ crossTo: 'moor' }]);
  });

  it('keep exploring restores the pause card and leaves the race running', () => {
    const { crossing, overlay, s, calls } = setup({ session: { race: { state: 'running' } } });
    crossing.ask(s, goData());
    expect(overlay.innerHTML).toContain('Your race stops here.');
    crossing.cancel();
    expect(overlay.innerHTML).toBe(pauseCardHtml({ welcome: 'Welcome home!', touch: false }));
    expect(calls.resume).toBe(1);
    expect(calls.endWalk).toEqual([]);
    expect(s.race.state).toBe('running');
    expect(s.crossing).toBe(null);
  });

  it('re-engaging without answering drops the card', () => {
    const { crossing, overlay, s, calls } = setup({ touch: true });
    crossing.ask(s, goData());
    crossing.onLockChange(true);
    expect(overlay.innerHTML).toBe(pauseCardHtml({ welcome: 'Welcome home!', touch: true }));
    expect(s.crossing).toBe(null);
    expect(calls.resume).toBe(0);
    crossing.confirm();
    expect(calls.endWalk).toEqual([]);
  });

  it('lists a carried thing and a quest', () => {
    const { crossing, overlay, s } = setup({ session: { quest: { state: 'active' }, carry: { mouth: { held: { kind: 'sock' } } } } });
    crossing.ask(s, goData());
    expect(overlay.innerHTML).toContain('Your quest stops here.');
    expect(overlay.innerHTML).toContain('The sock comes home to your den.');
  });

  it('does nothing for a locked status, a fight, or an open card', () => {
    const a = setup();
    const d = goData();
    a.crossing.ask(a.s, { ...d, status: { ...d.status, kind: 'locked' } });
    expect(a.s.crossing).toBeUndefined();
    expect(a.overlay.innerHTML).toBe('');
    const b = setup({ session: { fight: {} } });
    b.crossing.ask(b.s, d);
    expect(b.s.crossing).toBeUndefined();
    const c = setup({ session: { clanFight: { uiShowing: true } } });
    c.crossing.ask(c.s, d);
    expect(c.s.crossing).toBeUndefined();
    const e = setup();
    e.crossing.ask(e.s, d);
    e.overlay.innerHTML = 'x';
    e.crossing.ask(e.s, d);
    expect(e.overlay.innerHTML).toBe('x');
  });

  it('a room guest never opens the card; a host may', () => {
    const g = setup({ session: { net: { isHost: () => false } } });
    g.crossing.ask(g.s, goData());
    expect(g.s.crossing).toBeUndefined();
    const h = setup({ session: { net: { isHost: () => true } } });
    h.crossing.ask(h.s, goData());
    expect(h.s.crossing).toBeTruthy();
    expect(h.crossing.onRemote(h.s, {})).toBeUndefined();
  });
});
