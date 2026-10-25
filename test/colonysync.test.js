// Colony sync (src/game/colonysync.js): the orchestrator between the save
// (progression.js) and the colony RPCs. Every test uses a fake cloud whose
// methods record their calls and return scripted values, plus a REAL
// progression over an in-memory storage, so the add-only merge, the trade
// bookkeeping and the rewards are the shipping ones.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createColonySync, FEED_PUSH_MAX } from '../src/game/colonysync.js';
import { createProgression } from '../src/progression.js';
import { isShy, TAME_FEEDS, COLONY_MAX, SOLO_MAX } from '../src/colony.js';
import { CAT_NAMES } from '../src/straynames.js';
import { clanTitleFor } from '../src/clannames.js';

const ME = 'aaaaaaaa-1111', SIB = 'bbbbbbbb-2222';
const COLONY = 'c0ffee00c0ffee00';
const SECRET = 'psecret-1';
// Bold (non-shy) names, so a paired colony's two-feeder rule never gets in
// the way of a test that isn't about it.
const BOLD = CAT_NAMES.filter((n) => !isShy(n));
const CAT = BOLD[0];
const NO_RESULT = { appliedTrades: [], rewards: [], settled: [] };

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

const CLOUD_METHODS = ['colonySync', 'colonyFeed', 'colonyDress', 'colonyInviteOpen', 'colonyInviteJoin',
  'colonyInviteAnswer', 'colonyTradeOffer', 'colonyTradeAnswer', 'colonyTradeCancel'];

// script[method] is a value (resolved), or a function (called with the args;
// a throw becomes a rejection, like a failed supabase-js rpc).
function fakeCloud(script = {}) {
  const cloud = {};
  for (const m of CLOUD_METHODS) {
    cloud[m] = vi.fn(async (...args) => {
      const s = script[m];
      return typeof s === 'function' ? s(...args) : s;
    });
  }
  return cloud;
}
const totalCalls = (cloud) => CLOUD_METHODS.reduce((n, m) => n + cloud[m].mock.calls.length, 0);

function setup({ MP = true, petName = 'Mittens', script = {} } = {}) {
  const progression = createProgression(fakeStorage());
  if (petName !== null) progression.setPetName(petName);
  const cloud = fakeCloud(script);
  const getCloud = vi.fn(() => (MP ? cloud : null));
  const getPsecret = vi.fn(() => (MP ? SECRET : null));
  const pushProfileNow = vi.fn(() => Promise.resolve());
  const onChange = vi.fn();
  const onTradesApplied = vi.fn();
  const cs = createColonySync({ MP, pid: ME, getCloud, getPsecret, pushProfileNow, progression, onChange, onTradesApplied });
  return { cs, cloud, getCloud, getPsecret, progression, pushProfileNow, onChange, onTradesApplied, script };
}

// Server-shaped (snake_case) colony_sync results, as docs/supabase-colony.sql returns them.
const serverCat = (name, extra = {}) => ({ name, finder_id: ME, area: 'park', x: 1, z: 2, wear: null, tamed_by: null, tamed_walk: null, ...extra });
const serverFeed = (cat, walk, extra = {}) => ({ cat, by_id: ME, walk, head: 0, ...extra });
const pairedSnap = ({ cats = [], feeds = [], trades = [], members } = {}) => ({
  status: 'paired', colony_id: COLONY,
  members: members ?? [{ player_id: ME, pet_name: 'Mittens', wardrobe: [] }, { player_id: SIB, pet_name: 'Robin', wardrobe: ['crown'] }],
  cats, feeds, trades,
});
const unpairedSnap = (extra = {}) => ({ status: 'unpaired', invite: null, joining: null, ...extra });

const feedLocal = (p, name = CAT, walk = 'walk-1', by = ME) => p.feedColonyCat({ name, by, walk, area: 'park', x: 1, z: 2 });

afterEach(() => vi.restoreAllMocks());

describe('createColonySync — solo and degraded modes', () => {
  it('is local-only and makes no call when MP is off', async () => {
    const { cs, cloud, getCloud, getPsecret, pushProfileNow, progression } = setup({ MP: false });
    expect(cs.available).toBe(false);
    feedLocal(progression);
    await expect(cs.pull()).resolves.toEqual(NO_RESULT);
    expect(cs.status()).toEqual({ mode: 'local', invite: null, joining: null, lastError: null });
    // never even creates a cloud handle or a secret
    expect(getCloud).not.toHaveBeenCalled();
    expect(getPsecret).not.toHaveBeenCalled();
    expect(pushProfileNow).not.toHaveBeenCalled();
    expect(totalCalls(cloud)).toBe(0);
    // every action is refused locally, without touching the cloud either
    expect(await cs.pairing.open()).toEqual({ ok: false, status: 'local' });
    expect(await cs.pairing.join('K7P2QM')).toEqual({ ok: false, status: 'local' });
    expect(await cs.pairing.answer(true)).toEqual({ ok: false, status: 'local' });
    expect(await cs.trade.offer('tophat', 'crown')).toEqual({ ok: false, status: 'local' });
    cs.pushFeed({ cat: CAT, walk: 'walk-1' });
    expect(getCloud).not.toHaveBeenCalled();
    expect(totalCalls(cloud)).toBe(0);
    // the local feed is untouched
    expect(progression.state.colony.feeds).toHaveLength(1);
  });

  it('asks for a pet name before touching the cloud', async () => {
    const { cs, cloud, pushProfileNow } = setup({ petName: null });
    expect(cs.available).toBe(true);
    await expect(cs.pull()).resolves.toEqual(NO_RESULT);
    expect(cs.status().mode).toBe('needs-name');
    expect(pushProfileNow).not.toHaveBeenCalled();
    expect(totalCalls(cloud)).toBe(0);
    expect(await cs.pairing.open()).toEqual({ ok: false, status: 'needs-name' });
    expect(totalCalls(cloud)).toBe(0);
  });

  it('treats an invalid pet name as no name, and needs-name only applies when MP is on', async () => {
    const bad = setup({ petName: '<b>hi</b>' });
    await bad.cs.pull();
    expect(bad.cs.status().mode).toBe('needs-name');
    expect(totalCalls(bad.cloud)).toBe(0);
    const solo = setup({ MP: false, petName: null });
    await solo.cs.pull();
    expect(solo.cs.status().mode).toBe('local');
  });

  // Review Focus 1
  it('degrades to not-set-up when the SQL has not been run, and keeps the local colony', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cs, cloud, progression } = setup({ script: { colonySync: () => { throw { code: 'PGRST202', message: 'nope' }; } } });
    expect(feedLocal(progression).result).toBe('ok');
    const before = JSON.parse(JSON.stringify(progression.state.colony));
    await expect(cs.pull()).resolves.toEqual(NO_RESULT);
    expect(cs.status().mode).toBe('not-set-up');
    expect(cs.status().lastError).toBe('not-set-up');
    expect(cloud.colonySync).toHaveBeenCalledTimes(1);
    expect(progression.state.colony).toEqual(before);
    expect(progression.state.colony.feeds).toEqual([{ cat: CAT, by: ME, walk: 'walk-1', head: 0 }]);
    // feeding keeps working locally while not set up
    expect(feedLocal(progression, CAT, 'walk-2').result).toBe('ok');
    expect(progression.state.colony.feeds).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reads a missing-function message as not-set-up too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const err of [
      new Error('Could not find the function public.colony_sync(p_player_id, p_secret, p_wardrobe) in the schema cache'),
      Object.assign(new Error('function public.colony_sync(text, text, jsonb) does not exist'), { code: '42883' }),
    ]) {
      const { cs } = setup({ script: { colonySync: () => { throw err; } } });
      await cs.pull();
      expect(cs.status().mode, err.message).toBe('not-set-up');
    }
  });

  it('degrades to offline on a network error and never rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cs, cloud } = setup({ script: { colonySync: () => { throw new TypeError('Failed to fetch'); } } });
    await expect(cs.pull()).resolves.toEqual(NO_RESULT);
    expect(cs.status().mode).toBe('offline');
    expect(cs.status().lastError).toBe('offline');
    await expect(cs.pull()).resolves.toEqual(NO_RESULT);
    await expect(cs.pull()).resolves.toEqual(NO_RESULT);
    expect(cloud.colonySync).toHaveBeenCalledTimes(3);
    // logged once per mode change, not per call
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('logs again only when the mode changes, and a good pull clears the error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let next = () => { throw new TypeError('Failed to fetch'); };
    const { cs } = setup({ script: { colonySync: () => next() } });
    await cs.pull();
    await cs.pull();
    expect(warn).toHaveBeenCalledTimes(1);
    next = () => { throw { code: 'PGRST202' }; };
    await cs.pull();
    expect(cs.status().mode).toBe('not-set-up');
    expect(warn).toHaveBeenCalledTimes(2);
    next = () => unpairedSnap();
    await cs.pull();
    expect(cs.status()).toEqual({ mode: 'unpaired', invite: null, joining: null, lastError: null });
    next = () => { throw new TypeError('Failed to fetch'); };
    await cs.pull();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('a getCloud that yields nothing reads as offline, never a throw', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const progression = createProgression(fakeStorage());
    progression.setPetName('Mittens');
    const cs = createColonySync({ MP: true, pid: ME, getCloud: () => null, getPsecret: () => SECRET,
      pushProfileNow: () => Promise.resolve(), progression, onChange: () => {} });
    await expect(cs.pull()).resolves.toEqual(NO_RESULT);
    expect(cs.status().mode).toBe('offline');
    expect(await cs.pairing.open()).toEqual({ ok: false, status: 'error' });
  });
});

describe('createColonySync — pull', () => {
  it('pushes the profile first, then syncs with my tradeable wardrobe (no starters)', async () => {
    const order = [];
    const { cs, cloud, progression, pushProfileNow } = setup({ script: { colonySync: () => { order.push('sync'); return unpairedSnap(); } } });
    pushProfileNow.mockImplementation(() => { order.push('profile'); return Promise.resolve(); });
    progression.addPoints(200);
    expect(progression.buy('accessories', 'tophat')).toBe(true);
    expect(progression.buy('accessories', 'crown')).toBe(true);
    await cs.pull();
    expect(order).toEqual(['profile', 'sync']);
    expect(cloud.colonySync).toHaveBeenCalledWith(ME, SECRET, ['tophat', 'crown']);
  });

  it('pushes feeds made while offline on the next successful pull', async () => {
    const { cs, cloud, progression, script } = setup();
    feedLocal(progression, CAT, 'walk-1');
    script.colonySync = () => pairedSnap();
    script.colonyFeed = 'ok';
    await cs.pull();
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(1);
    expect(cloud.colonyFeed).toHaveBeenCalledWith(ME, SECRET,
      { cat: CAT, walk: 'walk-1', area: 'park', x: 1, z: 2, head: 0, tamed: false });
    expect(cs.status().mode).toBe('paired');
    // the merge kept the feed the server doesn't have yet, and linked us
    expect(progression.state.colony.id).toBe(COLONY);
    expect(progression.state.colony.partner).toMatchObject({ playerId: SIB, petName: 'Robin', wardrobe: ['crown'] });
    expect(progression.state.colony.feeds).toEqual([{ cat: CAT, by: ME, walk: 'walk-1', head: 0 }]);
    // the server now echoes it: nothing more to push
    script.colonySync = () => pairedSnap({ cats: [serverCat(CAT)], feeds: [serverFeed(CAT, 'walk-1')] });
    await cs.pull();
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(1);
    expect(progression.state.colony.feeds).toEqual([{ cat: CAT, by: ME, walk: 'walk-1', head: 0 }]);
  });

  it('marks only the taming feed as tamed', async () => {
    const { cs, cloud, progression, script } = setup();
    let last;
    for (let i = 0; i < TAME_FEEDS; i++) last = feedLocal(progression, CAT, `walk-${10 + i}`);
    expect(last.tamedNow).toBe(true);
    script.colonySync = () => pairedSnap();
    script.colonyFeed = 'ok';
    await cs.pull();
    const calls = cloud.colonyFeed.mock.calls.map((c) => c[2]);
    expect(calls).toHaveLength(TAME_FEEDS);
    expect(calls.filter((a) => a.tamed).map((a) => a.walk)).toEqual([`walk-${10 + TAME_FEEDS - 1}`]);
  });

  it(`pushes at most ${FEED_PUSH_MAX} feeds per pull, and the rest next time`, async () => {
    expect(FEED_PUSH_MAX).toBe(40);
    const { cs, cloud, progression, script } = setup();
    for (const name of BOLD.slice(0, 8)) for (let i = 0; i < TAME_FEEDS; i++) feedLocal(progression, name, `walk-${100 + i}`);
    expect(progression.state.colony.feeds).toHaveLength(48);
    const pushed = [];
    script.colonyFeed = (id, secret, a) => { pushed.push(a); return 'ok'; };
    // a server that records what it was sent, tamed flag included
    script.colonySync = () => pairedSnap({
      cats: [...new Set(pushed.map((a) => a.cat))].map((n) => {
        const t = pushed.find((a) => a.cat === n && a.tamed);
        return serverCat(n, t ? { tamed_by: ME, tamed_walk: t.walk } : {});
      }),
      feeds: pushed.map((a) => serverFeed(a.cat, a.walk)),
    });
    await cs.pull();
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(40);
    await cs.pull();
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(48);
    expect(new Set(pushed.map((a) => `${a.cat}|${a.walk}`)).size).toBe(48);
    await cs.pull();
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(48);
  });

  // Final review C1 / Task 5 deferred: the server's 'full' is not retried
  // every pull, and is never a reason to drop the cat here.
  it('a cat the server refuses as full is asked about once, then left alone, and kept locally', async () => {
    const { cs, cloud, progression, script } = setup();
    const extra = BOLD[0];
    for (let i = 0; i < TAME_FEEDS; i++) feedLocal(progression, extra, `walk-${10 + i}`);
    expect(progression.state.colony.cats[0].tamedBy).toBe(ME);
    // a server with a smaller cap than ours (an old copy of the SQL, say)
    script.colonySync = () => pairedSnap({ cats: BOLD.slice(1, 13).map((n) => serverCat(n, { finder_id: SIB })) });
    script.colonyFeed = (id, secret, a) => (a.cat === extra ? 'full' : 'ok');
    await cs.pull();
    // one try for that cat, not one per feed
    expect(cloud.colonyFeed.mock.calls.map((c) => c[2].cat)).toEqual([extra]);
    await cs.pull();
    await cs.pull();
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(1);
    const mine = progression.state.colony.cats.find((c) => c.name === extra);
    expect(mine).toMatchObject({ tamedBy: ME, tamedWalk: `walk-${10 + TAME_FEEDS - 1}` });
    expect(progression.state.colony.feeds.filter((f) => f.cat === extra)).toHaveLength(TAME_FEEDS);
  });
  it('sends no new cat at all to a server that already holds COLONY_MAX cats', async () => {
    const { cs, cloud, progression, script } = setup();
    const names = CAT_NAMES.filter((n) => n !== BOLD[0]).slice(0, COLONY_MAX);
    for (let i = 0; i < TAME_FEEDS; i++) feedLocal(progression, BOLD[0], `walk-${10 + i}`);
    feedLocal(progression, names[0], 'walk-50'); // a cat the server has: still pushed
    script.colonySync = () => pairedSnap({ cats: names.map((n) => serverCat(n, { finder_id: SIB })) });
    script.colonyFeed = 'ok';
    await cs.pull();
    expect(cloud.colonyFeed.mock.calls.map((c) => c[2].cat)).toEqual([names[0]]);
    // the tamed local-only cat stays, at the cost of the last untamed server cat
    const c = progression.state.colony;
    expect(c.cats.find((k) => k.name === BOLD[0])).toMatchObject({ tamedBy: ME });
    expect(c.cats).toHaveLength(COLONY_MAX);
  });

  // Re-review N1: 12 alone each, so the second sibling's solo colony always
  // fits on a server already holding the first one's 12.
  it('a solo colony filled until full is accepted whole by a server holding the partner\'s 12', async () => {
    const { cs, cloud, progression, script } = setup();
    const mine = [];
    for (const n of CAT_NAMES.slice(24)) {
      if (feedLocal(progression, n, 'walk-1').result === 'full') break;
      mine.push(n);
    }
    expect(mine).toHaveLength(SOLO_MAX);
    const theirs = CAT_NAMES.slice(0, SOLO_MAX).map((n) => serverCat(n, { finder_id: SIB }));
    const server = new Set(theirs.map((c) => c.name));
    script.colonyFeed = (id, secret, a) => {
      if (!server.has(a.cat) && server.size >= COLONY_MAX) return 'full';
      server.add(a.cat);
      return 'ok';
    };
    script.colonySync = () => pairedSnap({ cats: theirs });
    await cs.pull();
    expect(cloud.colonyFeed.mock.calls.map((c) => c[2].cat)).toEqual(mine);
    expect(server.size).toBe(COLONY_MAX);
    expect(progression.state.colony.cats).toHaveLength(COLONY_MAX);
  });

  it('a feed push that throws stops this pull\'s catch-up but still merges', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cs, cloud, progression, script } = setup();
    feedLocal(progression, BOLD[0], 'walk-1');
    feedLocal(progression, BOLD[1], 'walk-1');
    script.colonyFeed = () => { throw new TypeError('Failed to fetch'); };
    script.colonySync = () => pairedSnap({ cats: [serverCat(BOLD[2], { finder_id: SIB })], feeds: [serverFeed(BOLD[2], 'walk-9', { by_id: SIB })] });
    await expect(cs.pull()).resolves.toEqual(NO_RESULT);
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(1);
    expect(progression.state.colony.cats.map((c) => c.name).sort()).toEqual([BOLD[0], BOLD[1], BOLD[2]].sort());
    expect(progression.state.colony.feeds).toHaveLength(3);
  });

  it('concurrent pulls share one request', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const { cs, cloud } = setup({ script: { colonySync: async () => { await gate; return unpairedSnap(); } } });
    const a = cs.pull();
    const b = cs.pull();
    expect(b).toBe(a);
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(NO_RESULT);
    expect(rb).toBe(ra);
    expect(cloud.colonySync).toHaveBeenCalledTimes(1);
    // once settled, the next pull is a fresh request
    await cs.pull();
    expect(cloud.colonySync).toHaveBeenCalledTimes(2);
  });

  it('applies an accepted trade once even across two pulls', async () => {
    const { cs, progression } = setup({ script: { colonySync: () => pairedSnap({
      members: [{ player_id: ME, pet_name: 'Mittens', wardrobe: ['heart'] }, { player_id: SIB, pet_name: 'Robin', wardrobe: ['heart'] }],
      trades: [{ id: 7, from_id: SIB, to_id: ME, give: 'crown', want: 'heart', status: 'accepted' }] }) } });
    progression.addPoints(100);
    expect(progression.buy('accessories', 'heart')).toBe(true);
    const first = await cs.pull();
    expect(first.appliedTrades).toHaveLength(1);
    expect(first.appliedTrades[0]).toMatchObject({ id: 7, give: 'crown', want: 'heart', status: 'accepted' });
    expect(progression.state.unlocked.accessories).toContain('crown');
    expect(progression.state.unlocked.accessories).not.toContain('heart');
    const second = await cs.pull();
    expect(second.appliedTrades).toHaveLength(0);
    expect(progression.state.colony.tradesApplied).toEqual([7]);
  });

  // Task 11: colonysync never toasts. It reports each applied trade, once, to
  // an optional onTradesApplied hook; main.js turns that into the toast.
  it('reports each applied trade to onTradesApplied exactly once, whichever caller pulled', async () => {
    const { cs, onTradesApplied, progression } = setup({ script: { colonySync: () => pairedSnap({
      members: [{ player_id: ME, pet_name: 'Mittens', wardrobe: ['heart'] }, { player_id: SIB, pet_name: 'Robin', wardrobe: ['heart'] }],
      trades: [{ id: 7, from_id: SIB, to_id: ME, give: 'crown', want: 'heart', status: 'accepted' }] }) } });
    progression.addPoints(100);
    progression.buy('accessories', 'heart');
    // two callers sharing one in-flight pull: one report
    await Promise.all([cs.pull(), cs.pull()]);
    expect(onTradesApplied).toHaveBeenCalledTimes(1);
    expect(onTradesApplied.mock.calls[0][0]).toHaveLength(1);
    expect(onTradesApplied.mock.calls[0][0][0]).toMatchObject({ id: 7, give: 'crown', want: 'heart' });
    await cs.pull();
    expect(onTradesApplied).toHaveBeenCalledTimes(1);
  });

  it('a throwing onTradesApplied never breaks the pull', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cs, onTradesApplied, progression } = setup({ script: { colonySync: () => pairedSnap({
      trades: [{ id: 7, from_id: SIB, to_id: ME, give: 'crown', want: 'heart', status: 'accepted' }] }) } });
    onTradesApplied.mockImplementation(() => { throw new Error('toast broke'); });
    progression.addPoints(100);
    progression.buy('accessories', 'heart');
    const r = await cs.pull();
    expect(r.appliedTrades).toHaveLength(1);
  });

  it('a trade that takes an item off my dressed cat un-dresses it on the server in the same pull', async () => {
    let serverWear = 'tophat';
    const { cs, cloud, progression, script } = setup({ script: {
      colonyFeed: 'ok', colonyDress: (id, secret, cat, item) => { serverWear = item; return 'ok'; } } });
    progression.addPoints(100);
    progression.buy('accessories', 'tophat');
    feedLocal(progression, CAT, 'walk-1');
    expect(progression.dressColonyCat(CAT, 'tophat', ME)).toBe(true);
    const trades = [];
    script.colonySync = () => pairedSnap({
      cats: [serverCat(CAT, { wear: serverWear })], feeds: [serverFeed(CAT, 'walk-1')], trades });
    await cs.pull();
    expect(cloud.colonyDress).not.toHaveBeenCalled();
    trades.push({ id: 9, from_id: ME, to_id: SIB, give: 'tophat', want: 'crown', status: 'accepted' });
    const r = await cs.pull();
    expect(r.appliedTrades).toHaveLength(1);
    expect(progression.state.colony.cats[0].wear).toBe(null);
    expect(cloud.colonyDress).toHaveBeenCalledWith(ME, SECRET, CAT, null);
    expect(serverWear).toBe(null);
    // nothing further to push on the next pull
    const calls = cloud.colonyDress.mock.calls.length;
    await cs.pull();
    expect(cloud.colonyDress.mock.calls.length).toBe(calls);
  });

  // Fix round 1 (Task 11): the un-dress push is best-effort and paired-only.
  describe('the un-dress push after a trade', () => {
    const dressedSetup = (script) => {
      const t = setup({ script });
      t.progression.addPoints(100);
      t.progression.buy('accessories', 'tophat');
      feedLocal(t.progression, CAT, 'walk-1');
      expect(t.progression.dressColonyCat(CAT, 'tophat', ME)).toBe(true);
      return t;
    };
    const accepted = { id: 9, from_id: ME, to_id: SIB, give: 'tophat', want: 'crown', status: 'accepted' };

    it('(a) is skipped when not paired: local wear is cleared, no colonyDress call', async () => {
      // never paired: the server says unpaired, but a trade is already in the save
      const { cs, cloud, progression } = dressedSetup({ colonySync: unpairedSnap() });
      progression.mergeColonySnapshot({ id: 'col-1', partner: { playerId: SIB, petName: 'Robin', wardrobe: [] }, cats: [], feeds: [],
        trades: [{ id: 9, from: ME, to: SIB, give: 'tophat', want: 'crown', status: 'accepted' }] });
      const r = await cs.pull();
      expect(r.appliedTrades).toHaveLength(1);
      expect(progression.state.colony.cats[0].wear).toBe(null);
      expect(cloud.colonyDress).not.toHaveBeenCalled();
    });

    it('(b) a rejecting colonyDress never breaks the pull: it warns once and wear stays cleared', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { cs, cloud, progression, onTradesApplied } = dressedSetup({
        colonyFeed: 'ok',
        colonyDress: () => { throw new TypeError('Failed to fetch'); },
        colonySync: () => pairedSnap({ cats: [serverCat(CAT, { wear: 'tophat' })], feeds: [serverFeed(CAT, 'walk-1')], trades: [accepted] }),
      });
      const r = await cs.pull();
      expect(r.appliedTrades).toHaveLength(1);
      expect(onTradesApplied).toHaveBeenCalledTimes(1);
      expect(progression.state.colony.cats[0].wear).toBe(null);
      expect(cloud.colonyDress).toHaveBeenCalled();
      const tradeWarns = warn.mock.calls.filter((c) => /dress push failed/.test(String(c[0])));
      expect(tradeWarns).toHaveLength(1);
      // the server still shows the old wear; the next pull's catch-up retries and the stale value does not win the merge
      await cs.pull();
      expect(progression.state.colony.cats[0].wear).toBe(null);
    });
  });

  it('grants colony rewards from the pull, once', async () => {
    const { cs, progression } = setup({ script: { colonySync: () => pairedSnap({
      cats: [serverCat(CAT, { finder_id: SIB, tamed_by: SIB, tamed_walk: 'walk-5' })] }) } });
    const first = await cs.pull();
    expect(first.rewards).toEqual(['heart']);
    expect(progression.state.unlocked.accessories).toContain('heart');
    expect((await cs.pull()).rewards).toEqual([]);
  });

  it('re-pushes the wear of my own finds when it differs, and keeps it through the merge', async () => {
    const { cs, cloud, progression, script } = setup();
    progression.addPoints(100);
    expect(progression.buy('accessories', 'crown')).toBe(true);
    feedLocal(progression, BOLD[0], 'walk-1');
    expect(progression.dressColonyCat(BOLD[0], 'crown', ME)).toBe(true);
    script.colonyDress = 'ok';
    script.colonySync = () => pairedSnap({
      cats: [serverCat(BOLD[0]), serverCat(BOLD[1], { finder_id: SIB, wear: 'heart' })],
      feeds: [serverFeed(BOLD[0], 'walk-1'), serverFeed(BOLD[1], 'walk-2', { by_id: SIB })],
    });
    await cs.pull();
    expect(cloud.colonyDress).toHaveBeenCalledTimes(1);
    expect(cloud.colonyDress).toHaveBeenCalledWith(ME, SECRET, BOLD[0], 'crown');
    const wear = Object.fromEntries(progression.state.colony.cats.map((c) => [c.name, c.wear]));
    expect(wear).toEqual({ [BOLD[0]]: 'crown', [BOLD[1]]: 'heart' });
    // once the server echoes it, nothing is re-pushed
    script.colonySync = () => pairedSnap({ cats: [serverCat(BOLD[0], { wear: 'crown' })], feeds: [serverFeed(BOLD[0], 'walk-1')] });
    await cs.pull();
    expect(cloud.colonyDress).toHaveBeenCalledTimes(1);
  });

  it('a wear re-push the server refuses leaves the server\'s value', async () => {
    const { cs, progression, script } = setup();
    progression.addPoints(100);
    progression.buy('accessories', 'crown');
    feedLocal(progression, BOLD[0], 'walk-1');
    progression.dressColonyCat(BOLD[0], 'crown', ME);
    script.colonyDress = 'not-finder';
    script.colonySync = () => pairedSnap({ cats: [serverCat(BOLD[0])], feeds: [serverFeed(BOLD[0], 'walk-1')] });
    await cs.pull();
    expect(progression.state.colony.cats[0].wear).toBe(null);
  });

  // Controller ruling 4
  it('unlinks, keeping every cat and feed, when the server says unpaired', async () => {
    const { cs, progression, script } = setup();
    feedLocal(progression, CAT, 'walk-1');
    script.colonyFeed = 'ok';
    script.colonySync = () => pairedSnap({ cats: [serverCat(BOLD[1], { finder_id: SIB })], feeds: [serverFeed(BOLD[1], 'walk-3', { by_id: SIB })] });
    await cs.pull();
    expect(progression.colonyMembers()).toBe(2);
    const { cats, feeds } = progression.state.colony;
    expect(cats).toHaveLength(2);
    script.colonySync = () => unpairedSnap({ invite: { code: 'K7P2QM', expires_at: '2026-10-24T10:00:00Z', joiner_pet_name: null } });
    await cs.pull();
    expect(progression.state.colony.id).toBe(null);
    expect(progression.state.colony.partner).toBe(null);
    expect(progression.colonyMembers()).toBe(1);
    expect(progression.state.colony.cats).toEqual(cats);
    expect(progression.state.colony.feeds).toEqual(feeds);
    expect(cs.status()).toEqual({ mode: 'unpaired', invite: { code: 'K7P2QM', expiresAt: '2026-10-24T10:00:00Z', joinerPetName: null }, joining: null, lastError: null });
  });

  it('never unlinks on denied, garbage or an error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cs, progression, script } = setup({ script: { colonySync: () => pairedSnap() } });
    await cs.pull();
    expect(progression.state.colony.id).toBe(COLONY);
    const link = { id: progression.state.colony.id, partner: progression.state.colony.partner };
    const responses = [
      () => ({ status: 'denied' }),
      () => 'garbage',
      () => null,
      () => ({ status: 'paired', colony_id: '<img>' }),
      () => pairedSnap({ members: [{ player_id: ME, pet_name: 'Mittens' }] }),
      () => { throw new TypeError('Failed to fetch'); },
      () => { throw { code: 'PGRST202' }; },
    ];
    for (const r of responses) {
      script.colonySync = r;
      await expect(cs.pull()).resolves.toEqual(NO_RESULT);
      expect({ id: progression.state.colony.id, partner: progression.state.colony.partner }).toEqual(link);
    }
  });

  it('a denied or bad snapshot reads as offline with the reason in lastError', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cs, script } = setup({ script: { colonySync: { status: 'denied' } } });
    await cs.pull();
    expect(cs.status()).toMatchObject({ mode: 'offline', lastError: 'denied' });
    script.colonySync = { status: 'weird' };
    await cs.pull();
    expect(cs.status()).toMatchObject({ mode: 'offline', lastError: 'bad' });
  });

  it('surfaces the invite and the joining state from an unpaired snapshot', async () => {
    const { cs } = setup({ script: { colonySync: unpairedSnap({ joining: { inviter_pet_name: '<b>' } }) } });
    await cs.pull();
    expect(cs.status()).toEqual({ mode: 'unpaired', invite: null, joining: { inviterPetName: 'your partner' }, lastError: null });
  });

  it('calls onChange after a status or colony change, and not when nothing changed', async () => {
    const { cs, onChange, script } = setup({ script: { colonySync: unpairedSnap({ invite: { code: 'K7P2QM', expires_at: null } }) } });
    await cs.pull();
    expect(onChange).toHaveBeenCalledTimes(1);
    await cs.pull();
    expect(onChange).toHaveBeenCalledTimes(1);
    script.colonySync = pairedSnap({ cats: [serverCat(CAT, { finder_id: SIB })] });
    await cs.pull();
    expect(onChange).toHaveBeenCalledTimes(2);
    await cs.pull();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('a throwing onChange never breaks a pull', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cs, onChange } = setup({ script: { colonySync: unpairedSnap({ invite: { code: 'K7P2QM', expires_at: null } }) } });
    onChange.mockImplementation(() => { throw new Error('render blew up'); });
    await expect(cs.pull()).resolves.toEqual(NO_RESULT);
  });
});

describe('createColonySync — pushFeed', () => {
  it('pushes only when paired, from the saved feed, and never throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cs, cloud, progression, script } = setup({ script: { colonySync: unpairedSnap(), colonyFeed: 'ok' } });
    await cs.pull();
    feedLocal(progression, CAT, 'walk-1');
    cs.pushFeed({ cat: CAT, walk: 'walk-1' });
    expect(cloud.colonyFeed).not.toHaveBeenCalled();

    script.colonySync = pairedSnap({ cats: [serverCat(CAT)], feeds: [serverFeed(CAT, 'walk-1')] });
    await cs.pull();
    expect(cs.status().mode).toBe('paired');
    feedLocal(progression, CAT, 'walk-2');
    expect(cs.pushFeed({ cat: CAT, walk: 'walk-2' })).toBe(undefined);
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(1);
    expect(cloud.colonyFeed).toHaveBeenLastCalledWith(ME, SECRET,
      { cat: CAT, walk: 'walk-2', area: 'park', x: 1, z: 2, head: 0, tamed: false });
    // a feed that isn't in the save, or isn't mine, or is garbage: nothing sent
    for (const bad of [{ cat: CAT, walk: 'walk-77' }, { cat: CAT, walk: 'walk-2', by: SIB }, null, 'x', {}]) cs.pushFeed(bad);
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(1);
    // a rejected push is swallowed
    script.colonyFeed = () => { throw new TypeError('Failed to fetch'); };
    feedLocal(progression, CAT, 'walk-3');
    expect(() => cs.pushFeed({ cat: CAT, walk: 'walk-3' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(2);
  });
});

describe('createColonySync — pairing', () => {
  it('pairing.join reports bad-code without throwing', async () => {
    const { cs, cloud } = setup({ script: { colonyInviteJoin: { status: 'bad-code' }, colonySync: unpairedSnap() } });
    await expect(cs.pairing.join('K7P2QM')).resolves.toEqual({ ok: false, status: 'bad-code' });
    expect(cloud.colonyInviteJoin).toHaveBeenCalledWith(ME, SECRET, 'K7P2QM');
    // a malformed code never reaches the server
    for (const code of ['k7p2q', 'K7P2Q0', '<script>', '', null, 7, 'K7P2QMX']) {
      expect(await cs.pairing.join(code)).toEqual({ ok: false, status: 'bad-code' });
    }
    expect(cloud.colonyInviteJoin).toHaveBeenCalledTimes(1);
  });

  it('pairing.join normalizes the code, pushes the profile first and ends in a pull', async () => {
    const order = [];
    const { cs, cloud, pushProfileNow } = setup({ script: {
      colonyInviteJoin: () => { order.push('join'); return { status: 'pending', inviter_pet_name: 'Robin' }; },
      colonySync: () => { order.push('sync'); return unpairedSnap({ joining: { inviter_pet_name: 'Robin' } }); },
    } });
    pushProfileNow.mockImplementation(() => { order.push('profile'); return Promise.resolve(); });
    expect(await cs.pairing.join('  k7p2qm ')).toEqual({ ok: true, status: 'pending' });
    expect(cloud.colonyInviteJoin).toHaveBeenCalledWith(ME, SECRET, 'K7P2QM');
    // the profile is pushed once, not again by the pull that follows
    expect(order).toEqual(['profile', 'join', 'sync']);
    expect(cs.status().joining).toEqual({ inviterPetName: 'Robin' });
  });

  it('pairing.open and pairing.answer report the server status', async () => {
    const { cs, cloud, progression, script } = setup({ script: {
      colonyInviteOpen: { status: 'ok', code: 'K7P2QM', expires_at: '2026-10-24T10:00:00Z' },
      colonySync: unpairedSnap({ invite: { code: 'K7P2QM', expires_at: '2026-10-24T10:00:00Z', joiner_pet_name: 'Robin' } }),
    } });
    expect(await cs.pairing.open()).toEqual({ ok: true, status: 'ok' });
    expect(cs.status().invite).toEqual({ code: 'K7P2QM', expiresAt: '2026-10-24T10:00:00Z', joinerPetName: 'Robin' });
    script.colonyInviteAnswer = { status: 'paired', colony_id: COLONY };
    script.colonySync = pairedSnap();
    expect(await cs.pairing.answer(true)).toEqual({ ok: true, status: 'paired' });
    expect(cloud.colonyInviteAnswer).toHaveBeenLastCalledWith(ME, SECRET, true);
    expect(cs.status().mode).toBe('paired');
    expect(progression.state.colony.id).toBe(COLONY);
    script.colonyInviteAnswer = { status: 'declined' };
    expect(await cs.pairing.answer(false)).toEqual({ ok: true, status: 'declined' });
    expect(cloud.colonyInviteAnswer).toHaveBeenLastCalledWith(ME, SECRET, false);
    script.colonyInviteAnswer = { status: 'no-joiner' };
    expect(await cs.pairing.answer(true)).toEqual({ ok: false, status: 'no-joiner' });
    script.colonyInviteOpen = { status: 'already-paired' };
    expect(await cs.pairing.open()).toEqual({ ok: false, status: 'already-paired' });
  });

  // Controller ruling 5: e.g. the mutual-invite deadlock (40P01)
  it('a pairing RPC that throws reports error ("try again") and never rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const boom = () => { throw Object.assign(new Error('deadlock detected'), { code: '40P01' }); };
    const { cs } = setup({ script: { colonyInviteOpen: boom, colonyInviteJoin: boom, colonyInviteAnswer: boom, colonySync: unpairedSnap() } });
    await expect(cs.pairing.open()).resolves.toEqual({ ok: false, status: 'error' });
    await expect(cs.pairing.join('K7P2QM')).resolves.toEqual({ ok: false, status: 'error' });
    await expect(cs.pairing.answer(true)).resolves.toEqual({ ok: false, status: 'error' });
  });

  it('a malformed server status reads as bad', async () => {
    const { cs } = setup({ script: { colonyInviteOpen: { status: '<img src=x>' }, colonySync: unpairedSnap() } });
    expect(await cs.pairing.open()).toEqual({ ok: false, status: 'bad' });
  });
});

describe('createColonySync — dress and trade', () => {
  it('dress dresses locally, sends it when paired and ends in a pull', async () => {
    const { cs, cloud, progression, script } = setup({ script: { colonySync: unpairedSnap() } });
    progression.addPoints(100);
    progression.buy('accessories', 'crown');
    feedLocal(progression, CAT, 'walk-1');
    // unpaired: local only
    expect(await cs.dress(CAT, 'crown')).toEqual({ ok: true, status: 'ok' });
    expect(progression.state.colony.cats[0].wear).toBe('crown');
    expect(cloud.colonyDress).not.toHaveBeenCalled();
    // paired: the RPC, then a pull
    let serverWear = 'crown';
    script.colonyFeed = 'ok';
    script.colonyDress = (id, secret, cat, item) => { serverWear = item; return 'ok'; };
    script.colonySync = () => pairedSnap({ cats: [serverCat(CAT, { wear: serverWear })], feeds: [serverFeed(CAT, 'walk-1')] });
    await cs.pull();
    expect(cloud.colonyDress).not.toHaveBeenCalled();
    const syncs = cloud.colonySync.mock.calls.length;
    expect(await cs.dress(CAT, null)).toEqual({ ok: true, status: 'ok' });
    expect(cloud.colonyDress).toHaveBeenLastCalledWith(ME, SECRET, CAT, null);
    expect(cloud.colonySync.mock.calls.length).toBe(syncs + 1);
    // a dress the save refuses (not owned, not my find) never reaches the server
    expect(await cs.dress(CAT, 'wizard')).toEqual({ ok: false, status: 'bad' });
    expect(await cs.dress('Nobody', 'crown')).toEqual({ ok: false, status: 'bad' });
    expect(cloud.colonyDress).toHaveBeenCalledTimes(1);
  });

  it('trade offer/answer/cancel validate locally, report status and end in a pull', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cs, cloud, script } = setup({ script: { colonySync: pairedSnap(),
      colonyTradeOffer: { status: 'ok', id: 3 }, colonyTradeAnswer: 'accepted', colonyTradeCancel: 'cancelled' } });
    await cs.pull();
    let syncs = cloud.colonySync.mock.calls.length;
    expect(await cs.trade.offer('tophat', 'crown')).toEqual({ ok: true, status: 'ok' });
    expect(cloud.colonyTradeOffer).toHaveBeenCalledWith(ME, SECRET, 'tophat', 'crown');
    expect(cloud.colonySync.mock.calls.length).toBe(++syncs);
    for (const [give, want] of [['bell', 'crown'], ['tophat', 'bandana'], ['crown', 'crown'], ['laser', 'crown'], [null, 'crown']]) {
      expect(await cs.trade.offer(give, want)).toEqual({ ok: false, status: 'bad' });
    }
    expect(cloud.colonyTradeOffer).toHaveBeenCalledTimes(1);

    expect(await cs.trade.answer(3, true)).toEqual({ ok: true, status: 'accepted' });
    expect(cloud.colonyTradeAnswer).toHaveBeenCalledWith(ME, SECRET, 3, true);
    script.colonyTradeAnswer = 'gone';
    expect(await cs.trade.answer(3, false)).toEqual({ ok: false, status: 'gone' });
    expect(await cs.trade.cancel(3)).toEqual({ ok: true, status: 'cancelled' });
    expect(cloud.colonyTradeCancel).toHaveBeenCalledWith(ME, SECRET, 3);
    for (const id of [0, -1, 1.5, '3', null, NaN]) {
      expect(await cs.trade.answer(id, true)).toEqual({ ok: false, status: 'bad' });
      expect(await cs.trade.cancel(id)).toEqual({ ok: false, status: 'bad' });
    }
    expect(cloud.colonyTradeAnswer).toHaveBeenCalledTimes(2);
    expect(cloud.colonyTradeCancel).toHaveBeenCalledTimes(1);

    script.colonyTradeOffer = () => { throw new TypeError('Failed to fetch'); };
    await expect(cs.trade.offer('tophat', 'crown')).resolves.toEqual({ ok: false, status: 'error' });
  });
});

describe('createColonySync — fix round 1', () => {
  // Fix 1: the local dress happens before the pull, so the pull's own diff
  // can't see it.
  it('dress fires onChange, solo and paired', async () => {
    const solo = setup({ MP: false });
    solo.progression.addPoints(100);
    solo.progression.buy('accessories', 'crown');
    feedLocal(solo.progression, CAT, 'walk-1');
    await solo.cs.pull();
    solo.onChange.mockClear();
    expect(await solo.cs.dress(CAT, 'crown')).toEqual({ ok: true, status: 'ok' });
    expect(solo.progression.state.colony.cats[0].wear).toBe('crown');
    expect(solo.onChange).toHaveBeenCalledTimes(1);

    let serverWear = null;
    const paired = setup({ script: { colonyFeed: 'ok',
      colonyDress: (id, s, cat, item) => { serverWear = item; return 'ok'; },
      colonySync: () => pairedSnap({ cats: [serverCat(CAT, { wear: serverWear })], feeds: [serverFeed(CAT, 'walk-1')] }) } });
    paired.progression.addPoints(100);
    paired.progression.buy('accessories', 'crown');
    feedLocal(paired.progression, CAT, 'walk-1');
    await paired.cs.pull();
    paired.onChange.mockClear();
    expect(await paired.cs.dress(CAT, 'crown')).toEqual({ ok: true, status: 'ok' });
    expect(paired.onChange).toHaveBeenCalled();
    expect(paired.progression.state.colony.cats[0].wear).toBe('crown');
    // a refused dress changes nothing and fires nothing
    paired.onChange.mockClear();
    expect(await paired.cs.dress(CAT, 'wizard')).toEqual({ ok: false, status: 'bad' });
    expect(paired.onChange).not.toHaveBeenCalled();
  });

  // Fix 2
  it('pushes the profile once per session, not on every pull', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cs, pushProfileNow } = setup({ script: { colonySync: () => { throw new TypeError('Failed to fetch'); } } });
    await cs.pull();
    await cs.pull();
    await cs.pull();
    expect(pushProfileNow).toHaveBeenCalledTimes(1);
  });

  it('pushes the profile again after a rename, and after a denied sync (retrying that sync once)', async () => {
    const { cs, cloud, progression, pushProfileNow, script } = setup({ script: { colonySync: unpairedSnap() } });
    await cs.pull();
    await cs.pull();
    expect(pushProfileNow).toHaveBeenCalledTimes(1);
    progression.setPetName('Biscuit');
    await cs.pull();
    expect(pushProfileNow).toHaveBeenCalledTimes(2);
    // denied (e.g. the profile row never got written): push, then retry once
    const answers = [{ status: 'denied' }, unpairedSnap()];
    script.colonySync = () => answers.shift();
    const syncs = cloud.colonySync.mock.calls.length;
    await cs.pull();
    expect(pushProfileNow).toHaveBeenCalledTimes(3);
    expect(cloud.colonySync.mock.calls.length).toBe(syncs + 2);
    expect(cs.status()).toMatchObject({ mode: 'unpaired', lastError: null });
    // still denied after the retry: reported, and the next pull pushes again
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    script.colonySync = { status: 'denied' };
    await cs.pull();
    expect(pushProfileNow).toHaveBeenCalledTimes(4);
    expect(cs.status()).toMatchObject({ mode: 'offline', lastError: 'denied' });
    await cs.pull();
    expect(pushProfileNow).toHaveBeenCalledTimes(5);
  });

  it('a pairing action pushes the profile only when needed', async () => {
    const { cs, pushProfileNow } = setup({ script: { colonySync: unpairedSnap(), colonyInviteOpen: { status: 'ok', code: 'K7P2QM' } } });
    await cs.pull();
    expect(pushProfileNow).toHaveBeenCalledTimes(1);
    await cs.pairing.open();
    expect(pushProfileNow).toHaveBeenCalledTimes(1);
  });

  // Fix 3 (Review Focus 3): the owner's unpair must not soft-lock a shy cat.
  it('settles a full shy bar after an unpair, reports it, and tells the server on re-pair', async () => {
    const shy = CAT_NAMES.find(isShy);
    const walks = Array.from({ length: TAME_FEEDS }, (_, i) => `walk-${20 + i}`);
    // the partner still plays: they fed another cat yesterday (final review I1)
    const sibWalk = `walk-${Date.now() - 24 * 60 * 60 * 1000}`;
    const echo = () => ({ cats: [serverCat(shy), serverCat(CAT, { finder_id: SIB })],
      feeds: [...walks.map((w) => serverFeed(shy, w)), serverFeed(CAT, sibWalk, { by_id: SIB })] });
    const { cs, cloud, progression, script } = setup({ script: { colonyFeed: 'ok', colonySync: () => pairedSnap(echo()) } });
    await cs.pull();
    expect(progression.colonyMembers()).toBe(2);
    for (const w of walks) feedLocal(progression, shy, w);
    const shyCat = () => progression.state.colony.cats.find((c) => c.name === shy);
    expect(shyCat().tamedBy).toBe(null);
    // the server already has them all: a paired pull settles nothing
    expect((await cs.pull()).settled).toEqual([]);
    expect(cloud.colonyFeed).not.toHaveBeenCalled();

    script.colonySync = unpairedSnap();
    const r = await cs.pull();
    expect(r.settled).toEqual([shy]);
    expect(r.rewards).toEqual(['heart']); // settling counts toward the milestone
    expect(shyCat()).toMatchObject({ tamedBy: ME, tamedWalk: walks.at(-1) });
    expect((await cs.pull()).settled).toEqual([]);

    // re-paired: the server still shows it untamed, so the taming is pushed
    script.colonySync = () => pairedSnap(echo());
    expect((await cs.pull()).settled).toEqual([]);
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(1);
    expect(cloud.colonyFeed).toHaveBeenCalledWith(ME, SECRET,
      { cat: shy, walk: walks.at(-1), area: 'park', x: 1, z: 2, head: 0, tamed: true });
    expect(shyCat().tamedBy).toBe(ME);
    // once the server shows it tamed, nothing more is sent
    script.colonySync = () => pairedSnap({ ...echo(), cats: [serverCat(shy, { tamed_by: ME, tamed_walk: walks.at(-1) }), serverCat(CAT, { finder_id: SIB })] });
    await cs.pull();
    expect(cloud.colonyFeed).toHaveBeenCalledTimes(1);
  });

  it('a paired pull settles a shy bar whose partner stopped playing, and tells the server', async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const shy = CAT_NAMES.find(isShy);
    const walks = Array.from({ length: TAME_FEEDS }, (_, i) => `walk-${Date.now() - (20 - i) * DAY}`);
    const echo = (sibAgo) => ({ cats: [serverCat(shy), serverCat(CAT, { finder_id: SIB })],
      feeds: [...walks.map((w) => serverFeed(shy, w)), serverFeed(CAT, `walk-${Date.now() - sibAgo * DAY}`, { by_id: SIB })] });
    // the partner fed CAT 25 days ago, before my shy feeds: it waited for them then
    const { cs, cloud, progression } = setup({ script: { colonyFeed: 'ok', colonySync: () => pairedSnap(echo(25)) } });
    const r = await cs.pull();
    expect(progression.colonyMembers()).toBe(2);
    expect(r.settled).toEqual([shy]);
    expect(progression.state.colony.cats.find((c) => c.name === shy)).toMatchObject({ tamedBy: ME, tamedWalk: walks.at(-1) });
    expect(cloud.colonyFeed).toHaveBeenCalledWith(ME, SECRET,
      { cat: shy, walk: walks.at(-1), area: 'park', x: 1, z: 2, head: 0, tamed: true });
    // a partner who fed yesterday would have kept it waiting
    const fresh = setup({ script: { colonyFeed: 'ok', colonySync: () => pairedSnap(echo(1)) } });
    expect((await fresh.cs.pull()).settled).toEqual([]);
    expect(fresh.progression.state.colony.cats.find((c) => c.name === shy).tamedBy).toBe(null);
  });

  it('settles a bar both siblings filled offline once the merge joins them, and pushes it', async () => {
    const { cs, cloud, progression, script } = setup({ script: { colonyFeed: 'ok', colonySync: () => pairedSnap() } });
    await cs.pull();
    for (let i = 0; i < 3; i++) feedLocal(progression, CAT, `walk-${30 + i}`);
    script.colonySync = () => pairedSnap({
      cats: [serverCat(CAT, { finder_id: SIB })],
      feeds: [0, 1, 2].map((i) => serverFeed(CAT, `walk-${40 + i}`, { by_id: SIB })),
    });
    const r = await cs.pull();
    expect(r.settled).toEqual([CAT]);
    expect(progression.state.colony.cats[0]).toMatchObject({ tamedBy: ME, tamedWalk: 'walk-32' });
    // my three feeds went up first (untamed), then the settled taming
    const sent = cloud.colonyFeed.mock.calls.map((c) => [c[2].walk, c[2].tamed]);
    expect(sent).toEqual([['walk-30', false], ['walk-31', false], ['walk-32', false], ['walk-32', true]]);
  });

  // Task 10 (controller ruling B): one failed tick must not wipe the sibling's on-screen code.
  describe('trouble keeps a pairing that can still be live', () => {
    const FAILS = [() => { throw new TypeError('Failed to fetch'); }, () => { throw { code: 'PGRST202' }; }, { status: 'weird' }];
    const future = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const past = () => new Date(Date.now() - 60 * 1000).toISOString();

    it('keeps an unexpired invite (and its unpaired mode, so the UI and poll carry on)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const exp = future();
      const { cs, script } = setup({ script: { colonySync: unpairedSnap({ invite: { code: 'K7P2QM', expires_at: exp } }) } });
      await cs.pull();
      for (const fail of [FAILS[0], FAILS[2]]) {
        script.colonySync = fail;
        await cs.pull();
        expect(cs.status()).toMatchObject({ mode: 'unpaired', invite: { code: 'K7P2QM', expiresAt: exp }, joining: null, lastError: expect.any(String) });
        script.colonySync = unpairedSnap({ invite: { code: 'K7P2QM', expires_at: exp } });
        await cs.pull();
        expect(cs.status().lastError).toBe(null);
      }
    });

    it('clears an expired invite, and one with no parseable expiry', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      for (const expires_at of [past(), null, 'soon']) {
        const { cs, script } = setup({ script: { colonySync: unpairedSnap({ invite: { code: 'K7P2QM', expires_at } }) } });
        await cs.pull();
        expect(cs.status().invite).not.toBe(null);
        for (const fail of FAILS) {
          script.colonySync = fail;
          await cs.pull();
          expect(cs.status().invite).toBe(null);
          expect(cs.status().mode).not.toBe('unpaired');
          script.colonySync = unpairedSnap({ invite: { code: 'K7P2QM', expires_at } });
          await cs.pull();
        }
      }
    });

    it('keeps a pending join until a successful sync says otherwise', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { cs, script } = setup({ script: { colonySync: unpairedSnap({ joining: { inviter_pet_name: 'Robin' } }) } });
      await cs.pull();
      for (const fail of FAILS) {
        script.colonySync = fail;
        await cs.pull();
        expect(cs.status()).toMatchObject({ mode: 'unpaired', joining: { inviterPetName: 'Robin' }, invite: null });
      }
      script.colonySync = unpairedSnap();
      await cs.pull();
      expect(cs.status()).toEqual({ mode: 'unpaired', invite: null, joining: null, lastError: null });
    });

    it('a kept join is dropped about 20 minutes after it was first seen', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
        const { cs, script } = setup({ script: { colonySync: unpairedSnap({ joining: { inviter_pet_name: 'Robin' } }) } });
        await cs.pull();
        // still pending on a later good sync: the clock does not restart
        vi.setSystemTime(new Date('2026-10-24T10:10:00Z'));
        await cs.pull();
        script.colonySync = FAILS[0];
        vi.setSystemTime(new Date('2026-10-24T10:19:00Z'));
        await cs.pull();
        expect(cs.status()).toMatchObject({ mode: 'unpaired', joining: { inviterPetName: 'Robin' } });
        vi.setSystemTime(new Date('2026-10-24T10:21:00Z'));
        await cs.pull();
        expect(cs.status()).toMatchObject({ mode: 'offline', joining: null, invite: null });
        // a later successful sync can still show a join again, freshly timed
        script.colonySync = unpairedSnap({ joining: { inviter_pet_name: 'Robin' } });
        await cs.pull();
        expect(cs.status().joining).not.toBe(null);
        script.colonySync = FAILS[0];
        vi.setSystemTime(new Date('2026-10-24T10:30:00Z'));
        await cs.pull();
        expect(cs.status().joining).not.toBe(null);
      } finally {
        vi.useRealTimers();
      }
    });

    it('an expired invite goes but a kept join stays', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { cs, script } = setup({ script: { colonySync: unpairedSnap({
        invite: { code: 'K7P2QM', expires_at: past() }, joining: { inviter_pet_name: 'Robin' } }) } });
      await cs.pull();
      script.colonySync = FAILS[0];
      await cs.pull();
      expect(cs.status()).toMatchObject({ mode: 'unpaired', invite: null, joining: { inviterPetName: 'Robin' } });
    });

    it('nothing pending: trouble still reads offline / not-set-up', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { cs, script } = setup({ script: { colonySync: FAILS[0] } });
      await cs.pull();
      expect(cs.status().mode).toBe('offline');
      script.colonySync = FAILS[1];
      await cs.pull();
      expect(cs.status().mode).toBe('not-set-up');
    });
  });
});

describe('createColonySync — the clan name at pairing', () => {
  const run = (script) => setup({ script: { colonySync: script } });

  it('a joiner who saw joining adopts the partner-derived name when paired', async () => {
    const queue = [unpairedSnap({ joining: { inviter_pet_name: 'Robin' } }), pairedSnap()];
    const { cs, progression } = run(() => queue.shift());
    await cs.pull();
    expect(progression.state.clanJoining).toBe(true);
    await cs.pull();
    expect(progression.state.clan).toEqual({ name: clanTitleFor(SIB), adopted: true });
    expect(progression.state.clanJoining).toBe(false);
  });
  it('a cold start with clanJoining already saved adopts on the first paired snapshot', async () => {
    const { cs, progression } = run(() => pairedSnap());
    progression.setClanJoining(true);
    await cs.pull();
    expect(progression.state.clan).toEqual({ name: clanTitleFor(SIB), adopted: true });
  });
  it('an inviter keeps the name minted from its own id', async () => {
    const queue = [unpairedSnap(), pairedSnap()];
    const { cs, progression } = run(() => queue.shift());
    await cs.pull();
    await cs.pull();
    expect(progression.state.clan).toEqual({ name: clanTitleFor(ME), adopted: false });
  });
  it('a second paired pull changes nothing', async () => {
    const { cs, progression } = run(() => pairedSnap());
    progression.setClanJoining(true);
    await cs.pull();
    const after = JSON.stringify(progression.state.clan);
    await cs.pull();
    expect(JSON.stringify(progression.state.clan)).toBe(after);
    expect(progression.state.clanJoining).toBe(false);
  });
  it('a failed pull does not clear the joining flag', async () => {
    const { cs, progression } = run(() => ({ status: 'denied' }));
    progression.setClanJoining(true);
    await cs.pull();
    expect(progression.state.clanJoining).toBe(true);
  });
});
