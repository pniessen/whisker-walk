import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCrossing } from '../src/game/crossing.js';
import { pauseCardHtml } from '../src/game/walk.js';
import { CATALOG } from '../src/progression.js';
import { postStatus } from '../src/bordercross.js';
import { placeName } from '../src/edition.js';
import { PLACE_WORDS } from '../src/clanwords.js';
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
    getIsTouch: () => touch, getEdition: () => 'canon',
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

describe('crossing together', () => {
  function room({ host = true, remotes = [{ playerId: 'b', petName: 'Pip' }], selfId = 'a', hostId = 'a', edition = 'canon' } = {}) {
    vi.useFakeTimers();
    const toasts = [];
    const sent = [];
    const overlay = { innerHTML: '' };
    const s = {
      welcome: 'x', race: null, quest: null, carry: { mouth: { held: null } },
      areaId: 'woods', playerId: selfId, remotes: { list: [...remotes] },
      net: { isHost: () => host, sendEvent: (e) => sent.push(e) },
    };
    const endWalk = vi.fn();
    let current = s;
    const crossing = createCrossing({
      getSession: () => current, overlay, hud: { toast: (t) => toasts.push(t) },
      releaseControl() {}, resumeWalk() {}, endWalk, getIsTouch: () => false, getEdition: () => edition,
      catalog: CATALOG, setTimeout: globalThis.setTimeout,
    });
    return { crossing, s, sent, toasts, endWalk, overlay, replace: (o) => { current = o; } };
  }
  const ev = (o = {}) => ({ v: 1, id: 'b', type: 'border-cross', from: 'woods', to: 'moor', ...o });
  const goData2 = () => goData();
  afterEachRestore();

  it("the host's yes tells the room, then ends", () => {
    const { crossing, s, sent, endWalk, overlay } = room();
    crossing.ask(s, goData2());
    expect(overlay.innerHTML).toContain('Pip comes too.');
    crossing.confirm();
    expect(sent).toEqual([{ v: 1, id: 'a', type: 'border-cross', from: 'woods', to: 'moor' }]);
    expect(overlay.innerHTML).toContain('<h1>Off we go! 🧭</h1>');
    vi.advanceTimersByTime(150);
    expect(sent).toHaveLength(2);
    vi.advanceTimersByTime(249);
    expect(endWalk).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(endWalk.mock.calls).toEqual([[{ crossTo: 'moor' }]]);
  });

  it('a second yes does not send or end twice', () => {
    const { crossing, s, sent, endWalk } = room();
    crossing.ask(s, goData2());
    crossing.confirm();
    crossing.confirm();
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(2);
    expect(endWalk).toHaveBeenCalledTimes(1);
  });

  it("a guest's post never crosses", () => {
    const { crossing, s, overlay } = room({ host: false });
    crossing.ask(s, goData2());
    expect(s.crossing).toBeUndefined();
    expect(overlay.innerHTML).toBe('');
  });

  it('the guest follows the host', () => {
    const { crossing, s, toasts, endWalk } = room({ selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }] });
    crossing.onRemote(s, ev({ id: 'a' }));
    expect(toasts).toEqual(['Pip is leading the way to the Moor! 🧭']);
    vi.advanceTimersByTime(1499);
    expect(endWalk).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(endWalk.mock.calls).toEqual([[{ crossTo: 'moor', ledBy: 'Pip', together: ['Pip'] }]]);
  });

  it('the guest keeps who it walked with', () => {
    const { crossing, s, endWalk } = room({ selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }] });
    crossing.onRemote(s, ev({ id: 'a' }));
    s.remotes.list.length = 0;
    vi.advanceTimersByTime(1500);
    expect(endWalk.mock.calls[0][0].together).toEqual(['Pip']);
  });

  it('a duplicate or late border-cross ends the walk once', () => {
    const a = room({ selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }] });
    a.crossing.onRemote(a.s, ev({ id: 'a' }));
    a.crossing.onRemote(a.s, ev({ id: 'a' }));
    vi.advanceTimersByTime(5000);
    expect(a.endWalk).toHaveBeenCalledTimes(1);
    const b = room({ selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }] });
    b.crossing.onRemote(b.s, ev({ id: 'a' }));
    b.replace({});
    vi.advanceTimersByTime(5000);
    expect(b.endWalk).not.toHaveBeenCalled();
  });

  it('a Legacy guest is never told the Clan town word', () => {
    const { crossing, s, toasts } = room({ selfId: 'c', edition: 'legacy', remotes: [{ playerId: 'a', petName: 'Pip' }] });
    s.areaId = 'woods';
    crossing.onRemote(s, ev({ id: 'a', to: 'neighborhood' }));
    const name = placeName('neighborhood', 'legacy', CATALOG).replace(/^The /, 'the ');
    expect(toasts[0]).toContain(name);
    expect(toasts[0]).not.toContain(PLACE_WORDS.town);
  });

  it('cancel and a lock change after the host said yes leave Off we go, and it ends once', () => {
    const { crossing, s, overlay, endWalk } = room();
    crossing.ask(s, goData2());
    crossing.confirm();
    crossing.cancel();
    crossing.onLockChange(true);
    expect(overlay.innerHTML).toContain('Off we go!');
    vi.advanceTimersByTime(1000);
    expect(endWalk).toHaveBeenCalledTimes(1);
  });

  it('a forged or stale event is ignored', () => {
    const { crossing, s, toasts, endWalk } = room({ selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }] });
    crossing.onRemote(s, ev({ id: 'zzz' }));
    crossing.onRemote(s, ev({ id: 'a', from: 'river' }));
    crossing.onRemote(s, ev({ id: 'a', to: 'nowhere' }));
    vi.advanceTimersByTime(5000);
    expect(toasts).toEqual([]);
    expect(endWalk).not.toHaveBeenCalled();
    expect(s.crossLed).toBeUndefined();
  });
});
function afterEachRestore() { afterEach(() => vi.useRealTimers()); }
