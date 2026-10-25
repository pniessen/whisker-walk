// Colony sync (src/game/colonysync.js): the orchestrator between the save
// (progression.js) and the colony RPCs. Every test uses a fake cloud whose
// methods record their calls and return scripted values, plus a REAL
// progression over an in-memory storage, so the add-only merge, the trade
// bookkeeping and the rewards are the shipping ones.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createColonySync, FEED_PUSH_MAX } from '../src/game/colonysync.js';
import { createProgression } from '../src/progression.js';
import { isShy, TAME_FEEDS } from '../src/colony.js';
import { CAT_NAMES } from '../src/straynames.js';

const ME = 'aaaaaaaa-1111', SIB = 'bbbbbbbb-2222';
const COLONY = 'c0ffee00c0ffee00';
const SECRET = 'psecret-1';
// Bold (non-shy) names, so a paired colony's two-feeder rule never gets in
// the way of a test that isn't about it.
const BOLD = CAT_NAMES.filter((n) => !isShy(n));
const CAT = BOLD[0];
const NO_RESULT = { appliedTrades: [], rewards: [] };

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
  const cs = createColonySync({ MP, pid: ME, getCloud, getPsecret, pushProfileNow, progression, onChange });
  return { cs, cloud, getCloud, getPsecret, progression, pushProfileNow, onChange, script };
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
    script.colonySync = () => pairedSnap({
      cats: [...new Set(pushed.map((a) => a.cat))].map((n) => serverCat(n)),
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
    expect(order.slice(0, 3)).toEqual(['profile', 'join', 'profile']);
    expect(order[3]).toBe('sync');
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
