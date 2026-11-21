import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCrossing, swallowsCanvasClick, CROSS_RESEND_MS, CROSS_END_MS, WALK_ON_WAIT_MS, WALK_ON_FOLLOW_MS } from '../src/game/crossing.js';
import { AREA_LOAD_TIMEOUT_MS, AreaLoadError } from '../src/game/areaload.js';
import { phrase } from '../src/clanphrases.js';
import { pauseCardHtml, pauseCardFor } from '../src/game/walk.js';
import { CATALOG } from '../src/progression.js';
import { postStatus } from '../src/bordercross.js';
import { placeName } from '../src/edition.js';
import { PLACE_WORDS } from '../src/clanwords.js';
import { postsFor } from '../src/borderposts.js';
import { createClanFight } from '../src/game/clanfight.js';
import { gateStatus, nextRoomSeed } from '../src/gatecross.js';
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
  // Task 10: a post walks straight on, as a gate does.
  it('ask then yes walks on through the post, never ends the walk', () => {
    const { crossing, overlay, s, calls } = setup();
    crossing.ask(s, goData());
    expect(s.crossing).toEqual({ to: 'moor', name: 'The Moor', via: 'woods-moor-path', kind: 'post', endsHere: false });
    expect(overlay.innerHTML).toContain('Head to the Moor?');
    expect(overlay.innerHTML).toContain('You keep everything you found.');
    expect(overlay.innerHTML).not.toContain('Your trip ends here');
    expect(calls.release).toBe(1);
    crossing.confirm();
    expect(calls.walkOn).toEqual([{ via: 'woods-moor-path' }]);
    expect(calls.endWalk).toEqual([]);
    crossing.confirm(); // a second yes
    expect(calls.walkOn).toHaveLength(1);
  });

  it("a post's walk-on that failed or was refused leaves the card's state cleared", async () => {
    const failed = setup({ walkOnSays: 'failed' });
    failed.crossing.ask(failed.s, goData());
    failed.crossing.confirm();
    await flush();
    expect(failed.s.crossing).toBeNull();
    const refused = setup({ walkOnSays: 'refused' });
    refused.crossing.ask(refused.s, goData());
    refused.crossing.confirm();
    await flush();
    expect(refused.s.crossing).toBeNull();
    expect(refused.overlay.innerHTML).toBe(pauseCardHtml({ welcome: 'Welcome home!', touch: false }));
  });

  // F6: the place over the border is its own download. Asking and the yes
  // start fetching it (ruling R2, as at a gate), so the walk-on rarely waits.
  it('asking and a yes fetch the place over the border; cancelling, no card or a second yes do not', () => {
    const { crossing, s, calls } = setup();
    crossing.ask(s, goData());
    expect(calls.prefetch).toEqual(['moor']);
    crossing.cancel();
    crossing.confirm(); // no card up: nothing
    expect(calls.prefetch).toEqual(['moor']);
    crossing.ask(s, goData());
    crossing.confirm();
    crossing.confirm(); // a second yes
    expect(calls.prefetch).toEqual(['moor', 'moor', 'moor']);
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
    expect(s.crossing).toMatchObject({ to: 'moor', name: 'The Moor', kind: 'post' });
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

// A room with a member on an older build (no walkOn in its room profile):
// a post's crossing is today's, the walk ends and the room closes. Who is in
// the room is the roster's (live presence), never the drawn cats'.
describe('crossing together in a room with an older build', () => {
  function room({
    host = true, remotes = [{ playerId: 'b', petName: 'Pip' }], selfId = 'a', hostId = 'a', edition = 'canon',
    roster = [{ playerId: selfId }, ...remotes.map((r) => ({ playerId: r.playerId, petName: r.petName }))],
  } = {}) {
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
      catalog: CATALOG, setTimeout: globalThis.setTimeout, getRoster: () => roster,
      walkOn: () => { throw new Error('a room with an older build never walks on'); },
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
    // the card says so: this trip ends here
    expect(overlay.innerHTML).toContain('Your trip ends here, and you keep everything you found.');
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

  it("the host's card and its yes fetch the place over the border, once each", () => {
    const { crossing, s, prefetched } = room();
    crossing.ask(s, goData2());
    crossing.confirm();
    crossing.confirm();
    expect(prefetched).toEqual(['moor', 'moor']);
    vi.advanceTimersByTime(1000);
    expect(prefetched).toEqual(['moor', 'moor']);
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

  // The border post's room is the roster's too: a host reading the card
  // sends no state, and the guest's drawn-cat cache drops it after 5 s.
  it("the host's cat dropped from the guest's screen: the guest still follows the post's crossing", () => {
    const { crossing, s, toasts, endWalk } = room({ selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }] });
    s.remotes.list.length = 0;
    crossing.onRemote(s, ev({ id: 'a' }));
    expect(toasts).toEqual(['Pip is leading the way to the Moor! 🧭']); // named from the roster
    vi.advanceTimersByTime(1500);
    expect(endWalk.mock.calls).toEqual([[{ crossTo: 'moor', ledBy: 'Pip', together: ['Pip'] }]]); // who she walked with: the roster
  });

  it("a cat still drawn but gone from the room is not the post's host", () => {
    const { crossing, s, toasts, endWalk } = room({ selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }], roster: [{ playerId: 'c' }] });
    crossing.onRemote(s, ev({ id: 'a' }));
    vi.advanceTimersByTime(5000);
    expect(toasts).toEqual([]);
    expect(endWalk).not.toHaveBeenCalled();
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
    expect(s.crossing).toEqual({ to: 'farm', name: 'Appletree Farm', via: 'park-farm', kind: 'gate', endsHere: false });
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
    expect(s.crossing).toEqual({ to: 'farm', name: 'Appletree Farm', via: 'park-farm', kind: 'gate', endsHere: false });
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

// World map step 3, Task 9: a room walks on together. The host's yes asks the
// room first (walk-on-ask); each friend fetches the place and answers
// (walk-on-have); only when the host has the place too and every friend still
// in the room said yes does it send walk-on and walk on itself. Anything else
// and nobody moves.
describe('walking on together', () => {
  afterEachRestore();
  // A deferred place load: the test says when (and whether) it comes.
  function deferredLoads() {
    const asked = [];
    const pending = new Map();
    const ensureArea = (id) => {
      asked.push(id);
      if (!pending.has(id)) {
        let resolve; let reject;
        const p = new Promise((res, rej) => { resolve = res; reject = rej; });
        pending.set(id, { p, resolve, reject });
      }
      return pending.get(id).p;
    };
    const come = (id) => { pending.get(id).resolve({}); pending.delete(id); };
    const fail = (id, kind = 'failed') => { pending.get(id).reject(new AreaLoadError(id, kind)); pending.delete(id); };
    return { asked, ensureArea, come, fail };
  }
  // The room's roster is who is in the room (every member's room profile,
  // her own included); by default it is her and the cats she is drawing.
  function together({
    host = true, selfId = 'a', remotes = [{ playerId: 'b', petName: 'Pip' }],
    roster = [{ playerId: selfId, walkOn: 1 }, ...remotes.map((r) => ({ playerId: r.playerId, petName: r.petName, walkOn: 1 }))],
    online = true, walkOnSays = 'walked', areaId = 'park',
  } = {}) {
    vi.useFakeTimers();
    const sent = [];
    const toasts = [];
    const overlay = { innerHTML: '' };
    // A net whose roster and state handlers the test can drive (net.js:
    // onRoster replays the roster at once; each on* returns its remover).
    const rosterFns = new Set();
    const stateFns = new Set();
    const net = {
      isHost: () => host, sendEvent: (e) => sent.push(e),
      onRoster: (fn) => { rosterFns.add(fn); fn(roster); return () => rosterFns.delete(fn); },
      onState: (fn) => { stateFns.add(fn); return () => stateFns.delete(fn); },
    };
    const s = {
      welcome: 'Welcome home!', race: null, quest: null, carry: { mouth: { held: null } },
      areaId, playerId: selfId, roomSeed: 7, remotes: { list: [...remotes] }, net, netOffs: [],
    };
    const loads = deferredLoads();
    const walkOn = vi.fn(() => Promise.resolve(walkOnSays));
    const endWalk = vi.fn();
    const resume = vi.fn();
    let current = s;
    let roomNet = net;
    const crossing = createCrossing({
      getSession: () => current, overlay, hud: { toast: (t) => toasts.push(t) },
      releaseControl() {}, resumeWalk: resume, endWalk, getIsTouch: () => false, getEdition: () => 'canon',
      catalog: CATALOG, setTimeout: globalThis.setTimeout, prefetchArea() {},
      walkOn, getRoster: () => roster, getRoomNet: () => roomNet, ensureArea: loads.ensureArea,
      isOnline: () => online,
    });
    const yes = () => { crossing.askGate(s, farmGo()); crossing.confirm(); };
    const postYes = () => { crossing.ask(s, goData()); crossing.confirm(); };
    const have = (o = {}) => ({ v: 1, id: 'b', type: 'walk-on-have', via: 'park-farm', ok: true, ...o });
    const ask = (o = {}) => ({ v: 1, id: 'a', type: 'walk-on-ask', from: 'park', via: 'park-farm', ...o });
    const ofType = (t) => sent.filter((e) => e.type === t);
    return {
      crossing, s, sent, toasts, overlay, walkOn, endWalk, resume, loads, yes, postYes, have, ask, ofType,
      replace: (o) => { current = o; }, leaveRoom: () => { roomNet = null; },
      // the room's presence changes (a member left or came)
      setRoster: (list) => { roster = list; for (const fn of [...rosterFns]) fn(list); },
      // a state reaches this device
      hear: (st) => { for (const fn of [...stateFns]) fn(st); },
      handlers: () => rosterFns.size + stateFns.size,
    };
  }
  const SEED = nextRoomSeed(7, 'park-farm');
  const WALK_ON = { v: 1, id: 'a', type: 'walk-on', from: 'park', via: 'park-farm', seed: SEED };
  // The pause card of a room walk (the chat keys are on it).
  const pause = (s) => pauseCardFor(s, false, null);

  it("the host's yes shows the moment, asks the room twice and fetches its own place", () => {
    const h = together();
    h.yes();
    expect(h.overlay.innerHTML).toContain('Off to Appletree Farm!');
    expect(h.s.crossing).toMatchObject({ kind: 'gate', going: true });
    expect(swallowsCanvasClick(h.s)).toBe(true);
    expect(h.loads.asked).toEqual(['farm']);
    expect(h.sent).toEqual([{ v: 1, id: 'a', type: 'walk-on-ask', from: 'park', via: 'park-farm' }]);
    vi.advanceTimersByTime(CROSS_RESEND_MS);
    expect(h.ofType('walk-on-ask')).toHaveLength(2);
    expect(h.ofType('walk-on')).toEqual([]);
    expect(h.walkOn).not.toHaveBeenCalled();
    expect(h.endWalk).not.toHaveBeenCalled();
  });

  it('with its place here and the friend\'s yes, it sends walk-on twice with the derived seed and walks on once', async () => {
    const h = together();
    h.yes();
    h.crossing.onWalkOnHave(h.s, h.have());
    expect(h.ofType('walk-on')).toEqual([]); // its own place is not here yet
    h.loads.come('farm');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.ofType('walk-on')).toEqual([WALK_ON]);
    expect(h.walkOn.mock.calls).toEqual([[{ via: 'park-farm' }]]);
    h.replace(null); // walk.js freed the walk: the moment is up, no session
    await vi.advanceTimersByTimeAsync(CROSS_RESEND_MS);
    expect(h.ofType('walk-on')).toEqual([WALK_ON, WALK_ON]);
    h.replace(h.s);
    h.crossing.confirm(); // a second yes
    h.crossing.onWalkOnHave(h.s, h.have()); // a late duplicate answer
    await vi.advanceTimersByTimeAsync(WALK_ON_WAIT_MS * 2);
    expect(h.ofType('walk-on')).toHaveLength(2);
    expect(h.ofType('walk-on-ask')).toHaveLength(1); // answered before its resend was due
    expect(h.walkOn).toHaveBeenCalledTimes(1);
  });

  it('the friend may answer after the host has its place; the walk-on resend stays in the room it was made in', async () => {
    const h = together();
    h.yes();
    h.loads.come('farm');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.walkOn).not.toHaveBeenCalled();
    h.crossing.onWalkOnHave(h.s, h.have());
    expect(h.walkOn.mock.calls).toEqual([[{ via: 'park-farm' }]]);
    h.leaveRoom();
    await vi.advanceTimersByTimeAsync(CROSS_RESEND_MS);
    expect(h.ofType('walk-on')).toEqual([WALK_ON]);
  });

  it("a friend whose game cannot have the place: the pause card, the friend's line, nobody moves", async () => {
    const h = together();
    h.yes();
    h.crossing.onWalkOnHave(h.s, h.have({ ok: false }));
    expect(h.overlay.innerHTML).toBe(pause(h.s));
    expect(h.overlay.innerHTML).toContain('btn-resume');
    expect(h.s.crossing).toBe(null);
    expect(h.toasts).toEqual(["Pip's game isn't ready for that place yet. Try again in a moment! 🐾"]);
    expect(h.toasts[0]).toBe(phrase('gate.friendNotReady', 'Pip'));
    h.loads.come('farm');
    h.crossing.onWalkOnHave(h.s, h.have()); // a late yes changes nothing
    await vi.advanceTimersByTimeAsync(WALK_ON_WAIT_MS * 2);
    expect(h.ofType('walk-on')).toEqual([]);
    expect(h.walkOn).not.toHaveBeenCalled();
    expect(h.endWalk).not.toHaveBeenCalled();
    expect(h.resume).not.toHaveBeenCalled();
    expect(h.toasts).toHaveLength(1);
    // she can ask again
    h.crossing.askGate(h.s, farmGo());
    expect(h.s.crossing).toMatchObject({ kind: 'gate', via: 'park-farm' });
  });

  it("the host's own place does not come: the pause card, its own line, nobody moves", async () => {
    for (const [online, line] of [[true, 'start.notReady'], [false, 'start.notReadyOffline']]) {
      const h = together({ online });
      h.yes();
      h.crossing.onWalkOnHave(h.s, h.have());
      h.loads.fail('farm');
      await vi.advanceTimersByTimeAsync(0);
      expect(h.overlay.innerHTML).toBe(pause(h.s));
      expect(h.overlay.innerHTML).toContain('btn-resume');
      expect(h.s.crossing).toBe(null);
      expect(h.toasts).toEqual([phrase(line)]);
      await vi.advanceTimersByTimeAsync(WALK_ON_WAIT_MS * 2);
      expect(h.ofType('walk-on')).toEqual([]);
      expect(h.walkOn).not.toHaveBeenCalled();
      expect(h.endWalk).not.toHaveBeenCalled();
      vi.useRealTimers();
    }
  });

  it('no full answer in time: the pause card, the friend\'s line, nobody moves', async () => {
    expect(WALK_ON_WAIT_MS).toBe(AREA_LOAD_TIMEOUT_MS + 1000);
    const h = together({ remotes: [{ playerId: 'b', petName: 'Pip' }, { playerId: 'c', petName: 'Moss' }] });
    h.yes();
    h.loads.come('farm');
    h.crossing.onWalkOnHave(h.s, h.have());
    await vi.advanceTimersByTimeAsync(WALK_ON_WAIT_MS - 1);
    expect(h.overlay.innerHTML).toContain('Off to Appletree Farm!');
    expect(h.toasts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.overlay.innerHTML).toBe(pause(h.s));
    expect(h.overlay.innerHTML).toContain('btn-resume');
    expect(h.s.crossing).toBe(null);
    expect(h.toasts).toEqual([phrase('gate.friendNotReady', 'Moss')]);
    h.crossing.onWalkOnHave(h.s, h.have({ id: 'c' })); // too late
    await vi.advanceTimersByTimeAsync(WALK_ON_WAIT_MS);
    expect(h.ofType('walk-on')).toEqual([]);
    expect(h.walkOn).not.toHaveBeenCalled();
  });

  it('its own place still loading at the wait\'s end: its own line', async () => {
    const h = together();
    h.yes();
    h.crossing.onWalkOnHave(h.s, h.have());
    await vi.advanceTimersByTimeAsync(WALK_ON_WAIT_MS);
    expect(h.overlay.innerHTML).toBe(pause(h.s));
    expect(h.overlay.innerHTML).toContain('btn-resume');
    expect(h.toasts).toEqual([phrase('start.notReady')]);
    expect(h.walkOn).not.toHaveBeenCalled();
  });

  // Fix round 1: who is in the room is the roster, never the drawn cats
  // (remotecats.js drops a quiet one after 5 s; a paused device is quiet).
  it('a friend who left the room during the wait is not waited for: the host goes at once', async () => {
    const h = together();
    h.yes();
    h.loads.come('farm');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.walkOn).not.toHaveBeenCalled();
    h.setRoster([{ playerId: 'a', walkOn: 1 }]); // Pip went home
    expect(h.ofType('walk-on')).toEqual([WALK_ON]);
    expect(h.walkOn).toHaveBeenCalledTimes(1);
    expect(h.handlers()).toBe(0); // its roster handler came off
  });

  it("a friend whose cat is no longer drawn (quiet for 5 s) is still in the room: the host waits for her", async () => {
    const h = together();
    h.s.remotes.list.length = 0; // the host's cache dropped the paused guest
    h.yes();
    h.loads.come('farm');
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.walkOn).not.toHaveBeenCalled();
    h.crossing.onWalkOnHave(h.s, h.have());
    expect(h.walkOn).toHaveBeenCalledTimes(1);
    // and with no answer at all, nobody moves; the line names her from the roster
    const q = together();
    q.s.remotes.list.length = 0;
    q.yes();
    q.loads.come('farm');
    await vi.advanceTimersByTimeAsync(WALK_ON_WAIT_MS);
    expect(q.walkOn).not.toHaveBeenCalled();
    expect(q.toasts).toEqual([phrase('gate.friendNotReady', 'Pip')]);
  });

  // Ruling R17: a hidden visitor ("Hide this visitor") is never named. She is
  // in the room (the roster) but not drawn, and her answer still counts.
  describe('with a hidden member in the room', () => {
    const hidden = () => {
      const h = together({ remotes: [], roster: [{ playerId: 'a', walkOn: 1 }, { playerId: 'b', petName: 'Pip', walkOn: 1 }] });
      h.s.isBlocked = (id) => id === 'b';
      return h;
    };
    it('her yes walks the room on', async () => {
      const h = hidden();
      h.yes();
      h.loads.come('farm');
      h.crossing.onWalkOnHave(h.s, h.have());
      await vi.advanceTimersByTimeAsync(0);
      expect(h.walkOn).toHaveBeenCalledTimes(1);
      expect(h.toasts).toEqual([]);
    });
    it('her no, or no answer from her, is told without her name', async () => {
      const no = hidden();
      no.yes();
      no.crossing.onWalkOnHave(no.s, no.have({ ok: false }));
      expect(no.toasts).toEqual([phrase('gate.friendNotReady', 'A friend')]);
      const quiet = hidden();
      quiet.yes();
      quiet.loads.come('farm');
      await vi.advanceTimersByTimeAsync(WALK_ON_WAIT_MS);
      expect(quiet.toasts).toEqual([phrase('gate.friendNotReady', 'A friend')]);
      expect([...no.toasts, ...quiet.toasts].join(' ')).not.toContain('Pip');
    });
    it('a guest led over the border by the host does not list her among who came', () => {
      const h = together({
        host: false, selfId: 'c', remotes: [{ playerId: 'a', petName: 'Ann' }],
        roster: [{ playerId: 'a', petName: 'Ann', walkOn: 1 }, { playerId: 'c', walkOn: 1 }, { playerId: 'd', petName: 'Pip', walkOn: 1 }],
      });
      h.s.isBlocked = (id) => id === 'd';
      h.crossing.onRemote(h.s, { v: 1, id: 'a', type: 'border-cross', from: 'park', to: 'farm' });
      vi.advanceTimersByTime(1500);
      expect(h.endWalk.mock.calls).toEqual([[{ crossTo: 'farm', ledBy: 'Ann', together: ['Ann'] }]]);
      expect(h.toasts.join(' ')).not.toContain('Pip');
    });
    it('a hidden host is never named either', () => {
      const h = together({ host: false, selfId: 'c', remotes: [], roster: [{ playerId: 'a', petName: 'Pip', walkOn: 1 }, { playerId: 'c', walkOn: 1 }] });
      h.s.isBlocked = (id) => id === 'a';
      h.crossing.onRemote(h.s, { v: 1, id: 'a', type: 'border-cross', from: 'park', to: 'farm' });
      vi.advanceTimersByTime(1500);
      expect(h.toasts).toEqual(['A friend is leading the way to Appletree Farm! 🧭']);
      expect(h.endWalk.mock.calls).toEqual([[{ crossTo: 'farm', ledBy: 'A friend', together: [] }]]);
    });
  });

  it('the roster handler comes off when the host stays, and freeWalk could take it off too', async () => {
    const h = together();
    h.yes();
    expect(h.handlers()).toBe(1);
    expect(h.s.netOffs).toHaveLength(1);
    h.crossing.onWalkOnHave(h.s, h.have({ ok: false }));
    expect(h.handlers()).toBe(0);
  });

  it('a walk that ended during the wait is left alone', async () => {
    const h = together();
    h.yes();
    h.replace(null);
    h.loads.come('farm');
    h.crossing.onWalkOnHave(h.s, h.have());
    await vi.advanceTimersByTimeAsync(WALK_ON_WAIT_MS * 2);
    expect(h.ofType('walk-on')).toEqual([]);
    expect(h.ofType('walk-on-ask')).toHaveLength(1);
    expect(h.walkOn).not.toHaveBeenCalled();
    expect(h.toasts).toEqual([]);
  });

  it('an answer with no ask waiting, from a stranger or for another gate, changes nothing', async () => {
    const h = together();
    h.crossing.onWalkOnHave(h.s, h.have()); // no ask
    h.crossing.onWalkOnHave(null, h.have());
    h.yes();
    h.loads.come('farm');
    h.crossing.onWalkOnHave(h.s, h.have({ id: 'z' }));
    h.crossing.onWalkOnHave(h.s, h.have({ via: 'park-fair' }));
    h.crossing.onWalkOnHave(h.s, h.have({ id: 'z', ok: false }));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.walkOn).not.toHaveBeenCalled();
    expect(h.toasts).toEqual([]);
    h.crossing.onWalkOnHave(h.s, h.have());
    expect(h.walkOn).toHaveBeenCalledTimes(1);
  });

  it('cancel, Back and a lock change leave the moment up while the room is asked', () => {
    const h = together();
    h.yes();
    h.crossing.cancel();
    h.crossing.onLockChange(true);
    expect(h.overlay.innerHTML).toContain('Off to Appletree Farm!');
    expect(h.resume).not.toHaveBeenCalled();
  });

  // A room with a member on an older build (no walkOn in its profile): the
  // crossing is today's, the walk ends and the room closes.
  it('a room with an older build crosses as a border post does: the walk ends, no walk-on', () => {
    const h = together({ roster: [{ playerId: 'a', walkOn: 1 }, { playerId: 'b' }] });
    // Ruling R16: the gate's card says so
    h.crossing.askGate(h.s, farmGo());
    expect(h.s.crossing.endsHere).toBe(true);
    expect(h.overlay.innerHTML).toContain('Your trip ends here, and you keep everything you found.');
    expect(h.overlay.innerHTML).toContain('Head to Appletree Farm?');
    h.crossing.confirm();
    expect(h.overlay.innerHTML).toContain('<h1>Off we go! 🧭</h1>');
    expect(h.sent).toEqual([{ v: 1, id: 'a', type: 'border-cross', from: 'park', to: 'farm' }]);
    vi.advanceTimersByTime(CROSS_RESEND_MS);
    expect(h.sent).toHaveLength(2);
    vi.advanceTimersByTime(CROSS_END_MS - CROSS_RESEND_MS);
    expect(h.endWalk.mock.calls).toEqual([[{ crossTo: 'farm' }]]);
    expect(h.ofType('walk-on')).toEqual([]);
    expect(h.ofType('walk-on-ask')).toEqual([]);
    expect(h.walkOn).not.toHaveBeenCalled();
    expect(h.loads.asked).toEqual([]);
  });

  // Fix 3: an older build does not follow a gate's crossing (its own check
  // wants a post), so the gate's card lists only the friends who come: this
  // build's, by the roster, and never a hidden one. A post's card lists every
  // drawn friend, as the older build follows a post.
  it("a gate's trip-ends-here card lists only the friends whose build follows a gate", () => {
    const remotes = [{ playerId: 'b', petName: 'Pip' }, { playerId: 'c', petName: 'Moss' }, { playerId: 'd', petName: 'Fern' }];
    const roster = [{ playerId: 'a', walkOn: 1 }, { playerId: 'b', petName: 'Pip' }, { playerId: 'c', petName: 'Moss', walkOn: 1 }, { playerId: 'd', petName: 'Fern', walkOn: 1 }, { playerId: 'e', petName: 'Sky', walkOn: 1 }];
    const h = together({ remotes, roster });
    h.s.isBlocked = (id) => id === 'e';
    h.crossing.askGate(h.s, farmGo());
    expect(h.s.crossing.endsHere).toBe(true);
    expect(h.overlay.innerHTML).toContain('Moss and Fern come too.');
    expect(h.overlay.innerHTML).not.toContain('Pip');
    expect(h.overlay.innerHTML).not.toContain('Sky');
    // only this build's, so nobody: no line at all
    const old = together({ roster: [{ playerId: 'a', walkOn: 1 }, { playerId: 'b', petName: 'Pip' }] });
    old.crossing.askGate(old.s, farmGo());
    expect(old.overlay.innerHTML).toContain('Your trip ends here');
    expect(old.overlay.innerHTML).not.toContain('too.');
    // a post: the older build follows it, so it is listed
    const post = together({ areaId: 'woods', roster: [{ playerId: 'a', walkOn: 1 }, { playerId: 'b', petName: 'Pip' }] });
    post.crossing.ask(post.s, goData());
    expect(post.overlay.innerHTML).toContain('Pip comes too.');
  });

  // Ruling R16: the ending is decided once, when the card goes up, so what
  // happens is what the card said even if the room changes under it.
  it('a card that said she walks on still walks the room on when an older build joins before the yes', () => {
    for (const ask of [(h) => h.crossing.askGate(h.s, farmGo()), (h) => { h.s.areaId = 'woods'; h.crossing.ask(h.s, goData()); }]) {
      const h = together();
      ask(h);
      expect(h.s.crossing.endsHere).toBe(false);
      expect(h.overlay.innerHTML).toContain('You keep everything you found.');
      expect(h.overlay.innerHTML).not.toContain('Your trip ends here');
      h.setRoster([{ playerId: 'a', walkOn: 1 }, { playerId: 'b', petName: 'Pip', walkOn: 1 }, { playerId: 'd' }]);
      h.crossing.confirm();
      expect(h.ofType('walk-on-ask')).toHaveLength(1);
      expect(h.ofType('border-cross')).toEqual([]);
      expect(h.endWalk).not.toHaveBeenCalled();
    }
  });

  it('a card that said the trip ends here still ends it when the older build leaves before the yes', () => {
    for (const [ask, to] of [[(h) => h.crossing.askGate(h.s, farmGo()), 'farm'], [(h) => { h.s.areaId = 'woods'; h.crossing.ask(h.s, goData()); }, 'moor']]) {
      const h = together({ roster: [{ playerId: 'a', walkOn: 1 }, { playerId: 'b', petName: 'Pip' }] });
      ask(h);
      expect(h.s.crossing.endsHere).toBe(true);
      expect(h.overlay.innerHTML).toContain('Your trip ends here');
      h.setRoster([{ playerId: 'a', walkOn: 1 }]);
      h.crossing.confirm();
      expect(h.ofType('border-cross')).toHaveLength(1);
      expect(h.ofType('walk-on-ask')).toEqual([]);
      vi.advanceTimersByTime(CROSS_END_MS);
      expect(h.endWalk.mock.calls).toEqual([[{ crossTo: to }]]);
      expect(h.walkOn).not.toHaveBeenCalled();
    }
  });

  it("the host's cat dropped from the guest's screen (5 s on the card): the guest still follows the gate's crossing", () => {
    const h = together({ host: false, selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }] });
    h.s.remotes.list.length = 0;
    h.crossing.onRemote(h.s, { v: 1, id: 'a', type: 'border-cross', from: 'park', to: 'farm' });
    expect(h.toasts).toEqual(['Pip is leading the way to Appletree Farm! 🧭']); // named from the roster
    vi.advanceTimersByTime(1500);
    expect(h.endWalk.mock.calls).toEqual([[{ crossTo: 'farm', ledBy: 'Pip', together: ['Pip'] }]]); // who she walked with: the roster
  });

  it('a guest on this build follows that crossing through the gate: its walk ends too', () => {
    const h = together({ host: false, selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }] });
    h.crossing.onRemote(h.s, { v: 1, id: 'a', type: 'border-cross', from: 'park', to: 'farm' });
    expect(h.toasts).toEqual(['Pip is leading the way to Appletree Farm! 🧭']);
    vi.advanceTimersByTime(1500);
    expect(h.endWalk.mock.calls).toEqual([[{ crossTo: 'farm', ledBy: 'Pip', together: ['Pip'] }]]);
    expect(h.walkOn).not.toHaveBeenCalled();
  });

  // Task 10: a post's yes in a room takes the gate's path exactly.
  describe('through a border post', () => {
    const POST_SEED = nextRoomSeed(7, 'woods-moor-path');
    const POST_WALK_ON = { v: 1, id: 'a', type: 'walk-on', from: 'woods', via: 'woods-moor-path', seed: POST_SEED };

    it("the host's yes asks the room, and once everyone has the Moor, walks the room on", async () => {
      const h = together({ areaId: 'woods' });
      h.postYes();
      expect(h.overlay.innerHTML).toContain('Off to the Moor!');
      expect(h.s.crossing).toMatchObject({ kind: 'post', via: 'woods-moor-path', going: true });
      expect(h.sent).toEqual([{ v: 1, id: 'a', type: 'walk-on-ask', from: 'woods', via: 'woods-moor-path' }]);
      expect(h.loads.asked).toEqual(['moor']);
      h.crossing.onWalkOnHave(h.s, h.have({ via: 'woods-moor-path' }));
      h.loads.come('moor');
      await vi.advanceTimersByTimeAsync(0);
      expect(h.ofType('walk-on')).toEqual([POST_WALK_ON]);
      expect(h.walkOn.mock.calls).toEqual([[{ via: 'woods-moor-path' }]]);
      expect(h.endWalk).not.toHaveBeenCalled();
      expect(h.ofType('border-cross')).toEqual([]);
    });

    it("a friend who cannot have the Moor: the pause card, the friend's line, nobody moves", async () => {
      const h = together({ areaId: 'woods' });
      h.postYes();
      h.loads.come('moor');
      h.crossing.onWalkOnHave(h.s, h.have({ via: 'woods-moor-path', ok: false }));
      await vi.advanceTimersByTimeAsync(0);
      expect(h.toasts).toEqual([phrase('gate.friendNotReady', 'Pip')]);
      expect(h.overlay.innerHTML).toBe(pause(h.s));
      expect(h.s.crossing).toBeNull();
      expect(h.walkOn).not.toHaveBeenCalled();
      expect(h.ofType('walk-on')).toEqual([]);
    });

    it('a room with an older build: the old card, then the walk ends with the crossing', () => {
      const h = together({ areaId: 'woods', roster: [{ playerId: 'a', walkOn: 1 }, { playerId: 'b' }] });
      h.crossing.ask(h.s, goData());
      expect(h.overlay.innerHTML).toContain('Your trip ends here, and you keep everything you found.');
      h.crossing.confirm();
      expect(h.overlay.innerHTML).toContain('<h1>Off we go! 🧭</h1>');
      expect(h.sent).toEqual([{ v: 1, id: 'a', type: 'border-cross', from: 'woods', to: 'moor' }]);
      vi.advanceTimersByTime(CROSS_END_MS);
      expect(h.endWalk.mock.calls).toEqual([[{ crossTo: 'moor' }]]);
      expect(h.walkOn).not.toHaveBeenCalled();
      expect(h.ofType('walk-on-ask')).toEqual([]);
    });

    it("a guest answers the host's ask about the post and follows its walk-on, as a guest", async () => {
      const h = together({ areaId: 'woods', host: false, selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }] });
      h.crossing.onWalkOnAsk(h.s, h.ask({ from: 'woods', via: 'woods-moor-path' }));
      expect(h.loads.asked).toEqual(['moor']);
      h.loads.come('moor');
      await vi.advanceTimersByTimeAsync(0);
      expect(h.sent).toEqual([{ v: 1, id: 'c', type: 'walk-on-have', via: 'woods-moor-path', ok: true }]);
      h.crossing.onRemoteWalkOn(h.s, POST_WALK_ON);
      expect(h.walkOn.mock.calls).toEqual([[{ via: 'woods-moor-path', ledBy: 'Pip', guest: true }]]);
      expect(h.toasts).toEqual(['Pip is leading the way to the Moor! 🧭']);
      expect(h.endWalk).not.toHaveBeenCalled();
    });
  });

  describe('a guest', () => {
    const guest = (o = {}) => together({ host: false, selfId: 'c', remotes: [{ playerId: 'a', petName: 'Pip' }], ...o });
    const asGuest = (o = {}) => ({ v: 1, id: 'c', type: 'walk-on-have', via: 'park-farm', ok: true, ...o });

    it("fetches the place the host asks about and says so twice", async () => {
      const h = guest();
      h.crossing.onWalkOnAsk(h.s, h.ask());
      expect(h.loads.asked).toEqual(['farm']);
      expect(h.sent).toEqual([]);
      h.crossing.onWalkOnAsk(h.s, h.ask()); // the host's resend: folded into this answer
      h.loads.come('farm');
      await vi.advanceTimersByTimeAsync(0);
      expect(h.sent).toEqual([asGuest()]);
      await vi.advanceTimersByTimeAsync(CROSS_RESEND_MS);
      expect(h.sent).toEqual([asGuest(), asGuest()]);
      expect(h.loads.asked).toEqual(['farm']);
      expect(h.toasts).toEqual([]);
      expect(h.walkOn).not.toHaveBeenCalled();
      expect(h.s.crossLed).toBeUndefined();
    });

    it('a place that does not come: it says no twice and sees its own line', async () => {
      const h = guest({ online: false });
      h.crossing.onWalkOnAsk(h.s, h.ask());
      h.loads.fail('farm');
      await vi.advanceTimersByTimeAsync(CROSS_RESEND_MS);
      expect(h.sent).toEqual([asGuest({ ok: false }), asGuest({ ok: false })]);
      expect(h.toasts).toEqual([phrase('start.notReadyOffline')]);
    });

    it("the host's next ask, after its first was answered, is answered again", async () => {
      const h = guest();
      h.crossing.onWalkOnAsk(h.s, h.ask());
      h.loads.fail('farm');
      await vi.advanceTimersByTimeAsync(5000);
      h.crossing.onWalkOnAsk(h.s, h.ask());
      h.loads.come('farm');
      await vi.advanceTimersByTimeAsync(CROSS_RESEND_MS);
      expect(h.sent).toEqual([asGuest({ ok: false }), asGuest({ ok: false }), asGuest(), asGuest()]);
      expect(h.loads.asked).toEqual(['farm', 'farm']);
    });

    it('a forged or stale ask is not answered', async () => {
      const h = guest();
      for (const bad of [{ id: 'zzz' }, { from: 'fair' }, { via: 'fair-park' }, { via: 'nope' }, { type: 'walk-on' }]) {
        h.crossing.onWalkOnAsk(h.s, h.ask(bad));
      }
      h.crossing.onWalkOnAsk(null, h.ask());
      const solo = guest();
      delete solo.s.net;
      solo.crossing.onWalkOnAsk(solo.s, solo.ask());
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.loads.asked).toEqual([]);
      expect(solo.loads.asked).toEqual([]);
      expect(h.sent).toEqual([]);
    });

    it('a guest whose own walk-on is under way does not answer', async () => {
      const h = guest();
      h.s.walkingOn = true;
      h.crossing.onWalkOnAsk(h.s, h.ask());
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.loads.asked).toEqual([]);
      expect(h.sent).toEqual([]);
    });

    it('an answer whose walk ended is not sent', async () => {
      const h = guest();
      h.crossing.onWalkOnAsk(h.s, h.ask());
      h.replace(null);
      h.loads.come('farm');
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.sent).toEqual([]);
    });

    it("the host's cat no longer drawn (it read the card for 5 s): it still answers and still follows", async () => {
      const h = guest();
      h.s.remotes.list.length = 0; // the guest's cache dropped the quiet host
      h.crossing.onWalkOnAsk(h.s, h.ask());
      h.loads.come('farm');
      await vi.advanceTimersByTimeAsync(0);
      expect(h.sent).toEqual([asGuest()]);
      h.crossing.onRemoteWalkOn(h.s, WALK_ON);
      expect(h.walkOn.mock.calls).toEqual([[{ via: 'park-farm', ledBy: 'Pip', guest: true }]]);
      expect(h.toasts).toEqual(['Pip is leading the way to Appletree Farm! 🧭']); // named from the roster
    });

    it('a cat drawn but no longer in the room is not its host', () => {
      const h = guest({ remotes: [{ playerId: 'a', petName: 'Pip' }], roster: [{ playerId: 'c', walkOn: 1 }] });
      h.crossing.onWalkOnAsk(h.s, h.ask());
      h.crossing.onRemoteWalkOn(h.s, WALK_ON);
      expect(h.loads.asked).toEqual([]);
      expect(h.walkOn).not.toHaveBeenCalled();
    });

    // Ruling R15: both walk-on copies lost, the host's own state shows it there.
    it('having said yes, it follows a state from the host tagged with the place, once', async () => {
      const h = guest();
      h.crossing.onWalkOnAsk(h.s, h.ask());
      h.loads.come('farm');
      await vi.advanceTimersByTimeAsync(0);
      const st = (o = {}) => ({ v: 1, id: 'a', pos: [0, 0], yaw: 0, pose: 'idle', speed: 0, area: 'farm', ...o });
      h.hear(st({ area: 'park' })); // still in the Park
      h.hear(st({ area: undefined })); // an older build's state
      h.hear(st({ id: 'zzz' })); // not the host
      expect(h.walkOn).not.toHaveBeenCalled();
      h.hear(st());
      expect(h.walkOn.mock.calls).toEqual([[{ via: 'park-farm', ledBy: 'Pip', guest: true }]]);
      expect(h.toasts).toEqual(['Pip is leading the way to Appletree Farm! 🧭']);
      h.hear(st());
      h.crossing.onRemoteWalkOn(h.s, WALK_ON); // a late copy
      expect(h.walkOn).toHaveBeenCalledTimes(1);
      expect(h.handlers()).toBe(0);
    });

    it('R15 only after a yes, only from the host, only within WALK_ON_FOLLOW_MS', async () => {
      const st = { v: 1, id: 'a', pos: [0, 0], yaw: 0, pose: 'idle', speed: 0, area: 'farm' };
      const no = guest();
      no.crossing.onWalkOnAsk(no.s, no.ask());
      no.loads.fail('farm');
      await vi.advanceTimersByTimeAsync(0);
      no.hear(st);
      expect(no.walkOn).not.toHaveBeenCalled();
      expect(no.handlers()).toBe(0);
      expect(WALK_ON_FOLLOW_MS).toBe(60000);
      // the host may sit on its Ready? card in the Farm: still followed after the room's wait
      const slow = guest();
      slow.crossing.onWalkOnAsk(slow.s, slow.ask());
      slow.loads.come('farm');
      await vi.advanceTimersByTimeAsync(WALK_ON_FOLLOW_MS - 1);
      expect(slow.handlers()).toBe(1);
      slow.hear(st);
      expect(slow.walkOn).toHaveBeenCalledTimes(1);
      expect(slow.handlers()).toBe(0);
      const late = guest();
      late.crossing.onWalkOnAsk(late.s, late.ask());
      late.loads.come('farm');
      await vi.advanceTimersByTimeAsync(WALK_ON_FOLLOW_MS + 1);
      expect(late.handlers()).toBe(0);
      late.hear(st);
      expect(late.walkOn).not.toHaveBeenCalled();
      // her walk ended: the watch is taken off with it (netOffs) and never follows
      const gone = guest();
      gone.crossing.onWalkOnAsk(gone.s, gone.ask());
      gone.loads.come('farm');
      await vi.advanceTimersByTimeAsync(0);
      expect(gone.s.netOffs).toHaveLength(1);
      gone.replace(null);
      gone.hear(st);
      expect(gone.handlers()).toBe(0);
      expect(gone.walkOn).not.toHaveBeenCalled();
      // a host that is no longer the host (someone lower joined) is not followed
      const moved = guest();
      moved.crossing.onWalkOnAsk(moved.s, moved.ask());
      moved.loads.come('farm');
      await vi.advanceTimersByTimeAsync(0);
      moved.setRoster([{ playerId: '0' }, { playerId: 'a' }, { playerId: 'c' }]);
      moved.hear(st);
      expect(moved.walkOn).not.toHaveBeenCalled();
    });

    it('follows the host on, once: the toast, and a walk-on as a guest', () => {
      const h = guest();
      h.crossing.onRemoteWalkOn(h.s, WALK_ON);
      expect(h.toasts).toEqual(['Pip is leading the way to Appletree Farm! 🧭']);
      expect(h.walkOn.mock.calls).toEqual([[{ via: 'park-farm', ledBy: 'Pip', guest: true }]]);
      h.crossing.onRemoteWalkOn(h.s, WALK_ON); // the resend
      expect(h.walkOn).toHaveBeenCalledTimes(1);
      expect(h.toasts).toHaveLength(1);
      expect(h.endWalk).not.toHaveBeenCalled();
    });

    it('a walk-on from someone who is not the host, or with the wrong seed, changes nothing', () => {
      const h = guest({ remotes: [{ playerId: 'a', petName: 'Pip' }, { playerId: 'd', petName: 'Moss' }] });
      h.crossing.onRemoteWalkOn(h.s, { ...WALK_ON, id: 'd' });
      h.crossing.onRemoteWalkOn(h.s, { ...WALK_ON, seed: SEED + 1 });
      h.crossing.onRemoteWalkOn(h.s, { ...WALK_ON, id: 'zzz' });
      h.crossing.onRemoteWalkOn(h.s, { ...WALK_ON, from: 'fair' });
      h.crossing.onRemoteWalkOn(null, WALK_ON);
      expect(h.walkOn).not.toHaveBeenCalled();
      expect(h.toasts).toEqual([]);
      expect(h.s.crossLed).toBeUndefined();
    });

    it('a walk-on that could not load its place may be followed again', async () => {
      const h = guest({ walkOnSays: 'failed' });
      h.crossing.onRemoteWalkOn(h.s, WALK_ON);
      await vi.advanceTimersByTimeAsync(0);
      h.crossing.onRemoteWalkOn(h.s, WALK_ON);
      expect(h.walkOn).toHaveBeenCalledTimes(2);
    });
  });
});
