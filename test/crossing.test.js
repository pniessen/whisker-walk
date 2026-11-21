import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCrossing, swallowsCanvasClick } from '../src/game/crossing.js';
import { pauseCardHtml } from '../src/game/walk.js';
import { CATALOG } from '../src/progression.js';
import { postStatus } from '../src/bordercross.js';
import { placeName } from '../src/edition.js';
import { PLACE_WORDS } from '../src/clanwords.js';
import { postsFor } from '../src/borderposts.js';
import { createClanFight } from '../src/game/clanfight.js';
import { gateStatus } from '../src/gatecross.js';
import { endById } from '../src/gateways.js';
import { CONFIRM_DELAY_MS } from '../src/ui/colonypanel.js';

// World map step 3 (Task 8): a gate's walk-on (walkOn answers `walkOnSays`),
// the save a gate buys from (`state`; `buyOk` false refuses the buy), and the
// clock the buy card's delay reads.
function setup({ session = {}, touch = false, walkOnSays = 'walked', buyOk = true, state = null } = {}) {
  const overlay = { innerHTML: '' };
  const calls = { release: 0, resume: 0, endWalk: [], prefetch: [], walkOn: [], buy: [], setOpen: [] };
  const s = {
    welcome: 'Welcome home!', race: null, quest: null, carry: { mouth: { held: null } },
    gates: { setOpen: (id, open) => calls.setOpen.push([id, open]) },
    ...session,
  };
  const clock = { t: 1000 };
  const save = state ?? { edition: 'canon', points: 100, walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park'] }, area: 'park' };
  const progression = {
    state: save,
    buy: (kind, id) => {
      calls.buy.push([kind, id]);
      if (!buyOk) return false;
      save.unlocked.areas.push(id);
      save.points -= CATALOG.areas[id].price;
      return true;
    },
  };
  const crossing = createCrossing({
    walkOn: (o) => { calls.walkOn.push(o); return Promise.resolve(walkOnSays); },
    progression,
    now: () => clock.t,
    prefetchArea: (id) => calls.prefetch.push(id),
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
  return { crossing, overlay, s, calls, clock, progression };
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

  // F6: the place over the border is its own download. A yes starts fetching
  // it at once, so it is likely here by the time the summary's Continue asks.
  it('a yes starts fetching the place over the border; asking alone, cancelling or a second yes does not', () => {
    const { crossing, s, calls } = setup();
    crossing.ask(s, goData());
    crossing.cancel();
    expect(calls.prefetch).toEqual([]);
    crossing.confirm(); // no card up: nothing
    expect(calls.prefetch).toEqual([]);
    crossing.ask(s, goData());
    crossing.confirm();
    expect(calls.prefetch).toEqual(['moor']);
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

  it('the pause card it puts back keeps the Sound and Music switches', () => {
    const overlay = { innerHTML: '' };
    const s = { welcome: null, started: true, race: null, quest: null, carry: { mouth: { held: null } } };
    const sound = { sound: false, music: true };
    const crossing = createCrossing({
      getSession: () => s, overlay, hud: { toast() {} }, releaseControl() {}, resumeWalk() {}, endWalk() {},
      getIsTouch: () => true, getEdition: () => 'canon', getSound: () => sound, catalog: CATALOG, setTimeout: (fn) => { fn(); return 0; },
    });
    crossing.ask(s, goData());
    crossing.cancel();
    expect(overlay.innerHTML).toBe(pauseCardHtml({ welcome: null, touch: true, mode: 'paused', sound }));
    expect(overlay.innerHTML).toContain('id="pause-sound"');
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

  it('names whatever is carried, not always a sock', () => {
    const { crossing, overlay, s } = setup({ session: { carry: { mouth: { held: { kind: 'pinecone' } } } } });
    crossing.ask(s, goData());
    expect(overlay.innerHTML).toContain('The pine cone comes home to your den.');
    expect(overlay.innerHTML).not.toContain('The sock comes home');
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

  it('refuses while the real clan fight has its pill up or is fighting', () => {
    const noop = () => {};
    const cur = { visit: 2, clan: 'moor', member: { name: 'Mossjaw' }, pos: { x: 1, z: 0 }, state: 'walking' };
    const { crossing, overlay, s, calls } = setup({
      session: { cat: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } }, fight: null, perched: null, chasing: false, cameraMode: false },
    });
    const cf = createClanFight({
      intruders: {
        current: () => ({ ...cur, pos: { ...cur.pos } }),
        hold: () => { cur.state = 'held'; }, release: () => { cur.state = 'walking'; }, flee: noop, stage: noop,
      },
      ui: { showChallenge: noop, showFight: noop, hide: noop, key: () => false },
      audio: { hiss: noop, pounceWhoosh: noop, landThump: noop }, fx: { burst: noop }, hud: { toast: noop },
      log: { awardOnce: noop }, areaId: 'woods', walkStamp: 'w', playerId: 'me', playerSpecial: null,
      clanHome: true, picks: ['woods'],
    });
    s.clanFight = cf;
    cf.update(1 / 30, s);
    expect(cf.uiShowing).toBe('challenge');
    crossing.ask(s, goData());
    expect(s.crossing).toBeUndefined();
    cf.startFight();
    expect(s.fight).toBeTruthy();
    crossing.ask(s, goData());
    expect(s.crossing).toBeUndefined();
    expect(overlay.innerHTML).toBe('');
    expect(calls.release).toBe(0);
    cf.abort();
    crossing.ask(s, goData());
    expect(s.crossing).toEqual({ to: 'moor', name: 'The Moor' });
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
    const prefetched = [];
    let current = s;
    const crossing = createCrossing({
      prefetchArea: (id) => prefetched.push(id),
      getSession: () => current, overlay, hud: { toast: (t) => toasts.push(t) },
      releaseControl() {}, resumeWalk() {}, endWalk, getIsTouch: () => false, getEdition: () => edition,
      catalog: CATALOG, setTimeout: globalThis.setTimeout,
    });
    return { crossing, s, sent, toasts, endWalk, overlay, prefetched, replace: (o) => { current = o; } };
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

  it("the host's yes fetches the place over the border, once", () => {
    const { crossing, s, prefetched } = room();
    crossing.ask(s, goData2());
    crossing.confirm();
    crossing.confirm();
    expect(prefetched).toEqual(['moor']);
    vi.advanceTimersByTime(1000);
    expect(prefetched).toEqual(['moor']);
  });

  it('a guest led over the border fetches that place as soon as it hears, and a forged event fetches nothing', () => {
    const { crossing, s, prefetched } = room({ selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }] });
    crossing.onRemote(s, ev({ id: 'zzz' }));
    crossing.onRemote(s, ev({ id: 'a', to: 'nowhere' }));
    expect(prefetched).toEqual([]);
    crossing.onRemote(s, ev({ id: 'a' }));
    expect(prefetched).toEqual(['moor']);
    crossing.onRemote(s, ev({ id: 'a' })); // a duplicate
    expect(prefetched).toEqual(['moor']);
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

describe('the prompt pill under the crossing card (Polish 3)', () => {
  it('style.css hides the prompt pill while a crossing card is up', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/body:has\(#overlay:not\(\.hidden\) \.cross-card\) #hud-prompt\s*\{[^}]*display: none/);
  });
});

// After a crossing, Continue lands on home when the new place was picked
// (Today's walk shows it); only a place it could not pick opens Change place.
describe('Continue after a crossing (main.js source pin)', () => {
  it('calls takeCrossing and opens Change place only when the place was not picked', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const at = src.indexOf("e.target.id === 'btn-summary-continue'");
    const body = src.slice(at, src.indexOf('pullThenNews();', at));
    expect(body).toContain('const c = takeCrossing();');
    expect(body).toContain("homebase.show(c && c.clan && !c.picked ? { sheet: 'places' } : undefined);");
  });
});

// World map step 3, Task 8: at a gate. The crossing card walks her straight
// on (walkOn), and a shut place opens first through the usual "Get it?" card,
// which never spends paws by accident.
const FARM = () => endById('park-farm').end;
const farmGo = () => {
  const state = { edition: 'canon', points: 0, walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park', 'farm'] } };
  return { end: FARM(), status: gateStatus(FARM(), state, CATALOG) };
};
const farmBuy = () => {
  const state = { edition: 'canon', points: 100, walks: { park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } };
  return { end: FARM(), status: gateStatus(FARM(), state, CATALOG) };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('at a gate', () => {
  it('the statuses the tests use are the real ones', () => {
    expect(farmGo().status.kind).toBe('go');
    expect(farmBuy().status).toMatchObject({ kind: 'buy', price: 75, name: 'Appletree Farm' });
  });

  it('a gate: ask then yes walks on, never ends the walk', () => {
    const { crossing, overlay, s, calls } = setup();
    crossing.askGate(s, farmGo());
    expect(s.crossing).toEqual({ to: 'farm', name: 'Appletree Farm', via: 'park-farm', kind: 'gate' });
    expect(overlay.innerHTML).toContain('Head to Appletree Farm?');
    expect(overlay.innerHTML).toContain('You keep everything you found.');
    expect(calls.release).toBe(1);
    crossing.confirm();
    expect(calls.walkOn).toEqual([{ via: 'park-farm' }]);
    expect(calls.endWalk).toEqual([]);
  });

  it('the gate card lists what changes, as the post card does', () => {
    const { crossing, overlay, s } = setup({ session: { quest: { state: 'active' }, carry: { mouth: { held: { kind: 'sock' } } } } });
    crossing.askGate(s, farmGo());
    expect(overlay.innerHTML).toContain('Your quest stops here.');
    expect(overlay.innerHTML).toContain('The sock comes home to your den.');
  });

  it('asking, buying and a yes fetch the place beyond', () => {
    const a = setup();
    a.crossing.askGate(a.s, farmGo());
    expect(a.calls.prefetch).toEqual(['farm']);
    a.crossing.confirm();
    expect(a.calls.prefetch).toEqual(['farm', 'farm']);
    const b = setup();
    b.crossing.askGateBuy(b.s, farmBuy());
    expect(b.calls.prefetch).toEqual(['farm']);
  });

  it('a second yes walks on once', () => {
    const { crossing, s, calls } = setup();
    crossing.askGate(s, farmGo());
    crossing.confirm();
    crossing.confirm();
    expect(calls.walkOn).toHaveLength(1);
  });

  it('a walk-on that fails leaves walk.js its pause card and clears the crossing', async () => {
    const { crossing, overlay, s, calls } = setup({ walkOnSays: 'failed' });
    crossing.askGate(s, farmGo());
    crossing.confirm();
    overlay.innerHTML = 'the pause card walk.js put back';
    await flush();
    expect(s.crossing).toBe(null);
    expect(overlay.innerHTML).toBe('the pause card walk.js put back');
    expect(calls.resume).toBe(0);
    crossing.askGate(s, farmGo()); // she can ask again
    expect(s.crossing).toMatchObject({ kind: 'gate', via: 'park-farm' });
  });

  it('a refused walk-on puts the pause card back', async () => {
    const { crossing, overlay, s } = setup({ walkOnSays: 'refused' });
    crossing.askGate(s, farmGo());
    crossing.confirm();
    await flush();
    expect(s.crossing).toBe(null);
    expect(overlay.innerHTML).toBe(pauseCardHtml({ welcome: 'Welcome home!', touch: false }));
  });

  it('a walk-on that walked or was dropped leaves everything to walk.js', async () => {
    for (const says of ['walked', 'dropped']) {
      const { crossing, overlay, s } = setup({ walkOnSays: says });
      crossing.askGate(s, farmGo());
      crossing.confirm();
      overlay.innerHTML = 'the moment';
      await flush();
      expect(overlay.innerHTML).toBe('the moment');
    }
  });

  it('only a gate that is open now gets the crossing card', () => {
    const { crossing, overlay, s } = setup();
    crossing.askGate(s, farmBuy());
    expect(s.crossing).toBeUndefined();
    expect(overlay.innerHTML).toBe('');
    crossing.askGateBuy(s, farmGo());
    expect(s.crossing).toBeUndefined();
  });

  it('buying at the gate asks first, then the crossing card follows', () => {
    const { crossing, overlay, s, calls, clock } = setup();
    crossing.askGateBuy(s, farmBuy());
    expect(overlay.innerHTML).toContain('Open Appletree Farm for 75 🐾?');
    expect(overlay.innerHTML).toContain('You’ll have 25 🐾 left.');
    expect(s.crossing).toEqual({ to: 'farm', name: 'Appletree Farm', via: 'park-farm', kind: 'gate', asking: 'buy', shownAt: 1000 });
    expect(calls.release).toBe(1);
    crossing.confirm(); // the crossing card's yes is not the buy card's
    expect(calls.walkOn).toEqual([]);
    crossing.buyYes({ detail: 1 }); // too soon
    clock.t += CONFIRM_DELAY_MS;
    crossing.buyYes({ detail: 2 }); // a double tap
    expect(calls.buy).toEqual([]);
    crossing.buyYes({ detail: 1 });
    expect(calls.buy).toEqual([['areas', 'farm']]);
    expect(calls.setOpen).toEqual([['park-farm', true]]);
    expect(overlay.innerHTML).toContain('Head to Appletree Farm?');
    expect(s.crossing).toEqual({ to: 'farm', name: 'Appletree Farm', via: 'park-farm', kind: 'gate' });
    crossing.buyYes({ detail: 1 }); // the crossing card is up: nothing more is bought
    expect(calls.buy).toHaveLength(1);
    crossing.cancel(); // Keep exploring: still bought, still open
    expect(calls.resume).toBe(1);
    expect(calls.walkOn).toEqual([]);
    expect(s.crossing).toBe(null);
  });

  it('Not now (or Back) buys nothing; a refused buy puts the pause card back', () => {
    const a = setup();
    a.crossing.askGateBuy(a.s, farmBuy());
    a.clock.t += CONFIRM_DELAY_MS;
    a.crossing.cancel();
    expect(a.calls.buy).toEqual([]);
    expect(a.overlay.innerHTML).toBe(pauseCardHtml({ welcome: 'Welcome home!', touch: false }));
    expect(a.calls.resume).toBe(1);
    expect(a.s.crossing).toBe(null);
    a.crossing.buyYes({ detail: 1 }); // the card is gone
    expect(a.calls.buy).toEqual([]);
    const b = setup({ buyOk: false });
    b.crossing.askGateBuy(b.s, farmBuy());
    b.clock.t += CONFIRM_DELAY_MS;
    b.crossing.buyYes({ detail: 1 });
    expect(b.calls.buy).toEqual([['areas', 'farm']]);
    expect(b.calls.setOpen).toEqual([]);
    expect(b.overlay.innerHTML).toBe(pauseCardHtml({ welcome: 'Welcome home!', touch: false }));
    expect(b.calls.resume).toBe(1);
    expect(b.s.crossing).toBe(null);
  });

  it('a lock change drops the buy card without buying', () => {
    const { crossing, overlay, s, calls, clock } = setup();
    crossing.askGateBuy(s, farmBuy());
    clock.t += CONFIRM_DELAY_MS;
    crossing.onLockChange(true);
    expect(overlay.innerHTML).toBe(pauseCardHtml({ welcome: 'Welcome home!', touch: false }));
    crossing.buyYes({ detail: 1 });
    expect(calls.buy).toEqual([]);
  });

  it('a guest cannot open a gate card or buy', () => {
    const { crossing, overlay, s, calls, clock } = setup({ session: { net: { isHost: () => false } } });
    crossing.askGate(s, farmGo());
    crossing.askGateBuy(s, farmBuy());
    expect(s.crossing).toBeUndefined();
    expect(overlay.innerHTML).toBe('');
    clock.t += CONFIRM_DELAY_MS;
    crossing.buyYes({ detail: 1 });
    crossing.confirm();
    expect(calls.buy).toEqual([]);
    expect(calls.walkOn).toEqual([]);
    expect(calls.release).toBe(0);
  });

  it("a room host's gate yes does nothing new yet (Task 9 walks the room on)", () => {
    const sent = [];
    const { crossing, s, calls } = setup({ session: { net: { isHost: () => true, sendEvent: (e) => sent.push(e) }, remotes: { list: [] } } });
    crossing.askGate(s, farmGo());
    expect(s.crossing).toMatchObject({ kind: 'gate' });
    crossing.confirm();
    expect(calls.walkOn).toEqual([]);
    expect(calls.endWalk).toEqual([]);
    expect(sent).toEqual([]);
  });

  describe('while a slow walk-on waits for its place', () => {
    const waiting = () => {
      const h = setup();
      h.crossing.askGate(h.s, farmGo());
      h.crossing.confirm();
      h.s.walkingOn = true; // walk.js: the moment is up over the paused walk
      h.overlay.innerHTML = 'Off to Appletree Farm!';
      return h;
    };

    it('a canvas click is swallowed', () => {
      const { s } = waiting();
      expect(swallowsCanvasClick(s)).toBe(true);
      expect(swallowsCanvasClick({ walkingOn: true })).toBe(true); // a guest led on has no card
      expect(swallowsCanvasClick({ walkingOn: false })).toBe(false);
    });

    it('a re-lock, Keep exploring or Back leave the moment up and the walk paused', () => {
      const { crossing, overlay, s, calls } = waiting();
      crossing.onLockChange(true);
      crossing.cancel();
      expect(overlay.innerHTML).toBe('Off to Appletree Farm!');
      expect(calls.resume).toBe(0);
      expect(s.crossing).toMatchObject({ kind: 'gate', going: true });
      const g = setup();
      g.s.walkingOn = true;
      g.s.crossing = { to: 'farm', name: 'Appletree Farm', via: 'park-farm', kind: 'gate' };
      g.overlay.innerHTML = 'Off to Appletree Farm!';
      g.crossing.onLockChange(true);
      g.crossing.cancel();
      expect(g.overlay.innerHTML).toBe('Off to Appletree Farm!');
      expect(g.calls.resume).toBe(0);
    });

    it('no second gate card goes up over it', () => {
      const { crossing, overlay, s } = waiting();
      s.crossing = null;
      crossing.askGate(s, farmGo());
      crossing.askGateBuy(s, farmBuy());
      expect(overlay.innerHTML).toBe('Off to Appletree Farm!');
      expect(s.crossing).toBe(null);
    });
  });
});
