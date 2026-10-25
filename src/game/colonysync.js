// Colony sync — the orchestrator between the save (progression.js) and the
// colony RPCs (cloud.js, docs/supabase-colony.sql).
//
// The rule everything here serves: SOLO PLAY NEVER DEPENDS ON THE NETWORK.
// Feeding, taming and dressing always happen in the local save first; this
// module only catches the server up and folds the partner's side back in.
// Without Supabase keys (MP off), offline, or before the owner has run the
// colony SQL, every call resolves quietly and the colony keeps working as a
// local single-player colony. There is no outbox: each pull re-pushes any of
// my feeds the server lacks (colony.unsyncedFeeds), so an offline feed is
// never lost.
//
// Same discipline as cloudsync.js: the cloud handle and the secret are reached
// only through getCloud()/getPsecret(), and never at all when !MP, so a solo
// deploy never creates a client or persists a secret. Nothing here throws into
// a caller, toasts, or touches the DOM/HUD: results come back as return
// values, and `onChange` tells the home base to re-render.
//
// Trades: an accepted trade is applied by the pull (progression.
// applyColonyTrades, once per trade id, ever), and that pull reports it to the
// optional `onTradesApplied(trades)` hook — the one place a swap can be
// announced exactly once, whoever called pull() (the home base, a room join,
// a poll, the end of a walk, or an action's own closing pull). The hook is
// the caller's to turn into a toast; nothing here touches the HUD.
//
// Merging always goes through progression.mergeColonySnapshot (it carries the
// known-accessory list and refuses a snapshot without a valid colony id), and
// the inbound snapshot always goes through colony.sanitizeSnapshot first.
import { sanitizeSnapshot, unsyncedFeeds, COLONY_MAX } from '../colony.js';
import { CATALOG, STARTER_ACCESSORIES } from '../progression.js';
import { validPetName } from '../net.js';
import { clanTitleFor } from '../clannames.js';

// A kept pending join (see trouble()) has no expiry of its own; give it the
// invite's window so an offline player isn't polled at forever.
export const JOIN_KEEP_MS = 20 * 60 * 1000;
export const FEED_PUSH_MAX = 40;     // most catch-up feeds pushed by one pull
const WARDROBE_MAX = 40;             // colony_sync stores at most 40 items
const KNOWN_ITEMS = new Set(Object.keys(CATALOG.accessories));
// The invite alphabet (no 0/O, 1/I/L), as colony_invite_open mints it.
const INVITE_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
// Every status word the colony RPCs return is lower-case letters and dashes.
const STATUS_WORD = /^[a-z-]{1,24}$/;
const NO_RESULT = () => ({ appliedTrades: [], rewards: [], settled: [] });

// A thrown RPC error -> the mode it means. PGRST202 is PostgREST's "function
// not in the schema cache" and 42883 is Postgres's "function does not exist":
// both mean the owner hasn't run docs/supabase-colony.sql yet. Anything else
// (a failed fetch, a timeout, a 5xx) reads as offline.
function errorMode(err) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  const msg = err && typeof err === 'object' && typeof err.message === 'string' ? err.message : '';
  if (code === 'PGRST202' || code === '42883') return 'not-set-up';
  if (/could not find the function|function\s+\S+\s+does not exist/i.test(msg)) return 'not-set-up';
  return 'offline';
}

// An RPC result -> its status word: text RPCs return the word itself, jsonb
// ones { status, ... }. Anything else (or a hostile string) is 'bad'.
function statusWord(r) {
  const s = typeof r === 'string' ? r : r && typeof r === 'object' ? r.status : undefined;
  return typeof s === 'string' && STATUS_WORD.test(s) ? s : 'bad';
}

const isTradeId = (v) => Number.isSafeInteger(v) && v > 0;
const isTradeable = (v) => typeof v === 'string' && KNOWN_ITEMS.has(v) && !STARTER_ACCESSORIES.includes(v);

export function createColonySync({ MP, pid, getCloud, getPsecret, pushProfileNow, progression, onChange, onTradesApplied }) {
  // What the last pull found: 'unpaired' | 'paired' | 'offline' | 'not-set-up',
  // or null before the first one (status() then reads the local link).
  let netMode = null;
  let invite = null;
  let joining = null;
  let joiningSince = null; // when a sync first reported the current pending join
  let lastError = null;
  let warned = null;      // the trouble last logged, so each change logs once
  let inflight = null;    // the single in-flight pull
  // The pet name the profile was last pushed for this session, or null when
  // a push is due. colony_authed needs the profile row, but pushing it on
  // every pull would upsert every 3 s under the pairing poll and log a
  // pushProfile failure per pull while offline. So: once per session, again
  // after a rename, and again after the server says 'denied'.
  let profileFor = null;
  // Cats the server answered 'full' to this session (it had no room for a new
  // cat). Their feeds are not offered again until a reload, so a refused cat
  // isn't re-sent on every pull. The cat itself stays in the save: 'full' is
  // never a reason to drop anything locally.
  const refusedFull = new Set();

  const hasName = () => validPetName(progression.state.petName);

  function status() {
    let mode;
    if (!MP) mode = 'local';
    else if (!hasName()) mode = 'needs-name';
    else mode = netMode ?? (progression.colonyMembers() === 2 ? 'paired' : 'unpaired');
    return { mode, invite, joining, lastError };
  }

  function warnOnce(key, detail) {
    if (warned === key) return;
    warned = key;
    console.warn(`Whisker Walk: colony sync — ${key}`, detail);
  }
  // A pull that couldn't sync. The local colony (and its link) is left alone.
  // One failed poll tick must not wipe the sibling's on-screen code and stop
  // the poll, so a pairing that can still be live is KEPT: an invite whose
  // expiresAt parses to a future time, and a pending join (it has no expiry,
  // so it stays until a successful sync says otherwise). The mode then stays
  // 'unpaired' so the pairing UI keeps showing and keeps polling; lastError
  // still says the sync failed. An expired (or undated) invite is dropped.
  function trouble(mode, reason, detail) {
    const expires = invite && typeof invite.expiresAt === 'string' ? Date.parse(invite.expiresAt) : NaN;
    if (!(Number.isFinite(expires) && expires > Date.now())) invite = null;
    // A join has no expiry: keep it for the invite's window, counted from when
    // a successful sync first saw it, then drop it so an offline player does
    // not poll every 3 s forever.
    if (joining && !(joiningSince !== null && Date.now() - joiningSince < JOIN_KEEP_MS)) {
      joining = null;
      joiningSince = null;
    }
    netMode = netMode === 'unpaired' && (invite || joining) ? 'unpaired' : mode;
    lastError = reason;
    warnOnce(reason, detail);
  }

  // -> true when it pushed. pushProfileNow resolves even when it fails.
  async function ensureProfile() {
    const name = progression.state.petName;
    if (profileFor === name) return false;
    profileFor = name;
    await pushProfileNow?.();
    return true;
  }

  // Everything the home base renders from, so onChange fires only on a real
  // change: the pairing UI polls pull() every 3 s and must not be re-rendered
  // (losing a half-typed code) when nothing happened. Compared with what the
  // LAST onChange (or creation) saw, not with the start of a pull, so a change
  // made just before one (a local dress) or between pulls (a walk's feeds)
  // still notifies.
  function signature() {
    try {
      return JSON.stringify([status(), progression.state.colony, progression.state.unlocked.accessories]);
    } catch {
      return null;
    }
  }
  let notifiedSig = signature();
  function notifyIfChanged() {
    const now = signature();
    if (now !== null && now === notifiedSig) return;
    notifiedSig = now;
    try {
      onChange?.();
    } catch (err) {
      console.warn('Whisker Walk: colony onChange failed', err);
    }
  }

  // The tradeable wardrobe colony_sync publishes: owned, known, no starters.
  function wardrobe() {
    return [...new Set(progression.state.unlocked.accessories)].filter(isTradeable).slice(0, WARDROBE_MAX);
  }

  // colony_feed's arguments for one of MY saved feeds, read from the save (the
  // cat's area and fixed spot, the feed's head start). `tamed` is set on the
  // feed that filled the bar. null when the save doesn't hold that feed.
  function feedArgs(feed) {
    if (!feed || typeof feed !== 'object' || (feed.by !== undefined && feed.by !== pid)) return null;
    const c = progression.state.colony;
    const f = c.feeds.find((x) => x.cat === feed.cat && x.by === pid && x.walk === feed.walk);
    const cat = f && c.cats.find((k) => k.name === f.cat);
    if (!cat) return null;
    return {
      cat: f.cat, walk: f.walk, area: cat.area, x: cat.x, z: cat.z, head: f.head,
      tamed: cat.tamedBy === pid && cat.tamedWalk === f.walk,
    };
  }

  // Step 6a: re-push my feeds the server lacks, oldest first, at most
  // FEED_PUSH_MAX per pull. A throw stops this pull's catch-up (the next pull
  // retries); a refusal ('unpaired'/'denied') stops it too. A cat the server
  // doesn't have yet is skipped while the server is full: when its snapshot
  // already holds COLONY_MAX cats, or when it answered 'full' for that cat
  // earlier this session (refusedFull). Returns the names of cats whose
  // taming went up with its feed.
  async function pushUnsynced(cloud, secret, remote) {
    const tamedSent = new Set();
    const onServer = new Set(remote.cats.map((c) => c.name));
    const serverFull = remote.cats.length >= COLONY_MAX;
    let n = 0;
    for (const f of unsyncedFeeds(progression.state.colony, remote, pid)) {
      if (n >= FEED_PUSH_MAX) break;
      if (!onServer.has(f.cat) && (serverFull || refusedFull.has(f.cat))) continue;
      const args = feedArgs(f);
      if (!args) continue;
      n++;
      let r;
      try {
        r = statusWord(await cloud.colonyFeed(pid, secret, args));
      } catch (err) {
        warnOnce('feed push failed', err);
        return null;
      }
      if (r === 'unpaired' || r === 'denied') return null;
      if (r === 'full') refusedFull.add(args.cat);
      if (args.tamed && r === 'ok') tamedSent.add(args.cat);
    }
    return tamedSent;
  }

  // Cats I tamed (by a feed, or by settleColonyTaming) that the server still
  // shows untamed: re-send my taming feed with tamed: true. colony_feed's
  // insert is a no-op for a feed it has, and it sets tamed_by only where it is
  // still null, so this is safe to repeat and can't overwrite the partner.
  // Falls back to my latest feed when the taming feed itself is gone (the
  // cap-trimmed extra feed, see colony.canFeed).
  async function pushTamed(cloud, secret, remote, skip) {
    const remoteUntamed = new Set(remote.cats.filter((c) => c.tamedBy === null).map((c) => c.name));
    const c = progression.state.colony;
    for (const cat of c.cats) {
      if (cat.tamedBy !== pid || !remoteUntamed.has(cat.name) || skip.has(cat.name)) continue;
      let f = c.feeds.find((x) => x.cat === cat.name && x.by === pid && x.walk === cat.tamedWalk);
      if (!f) {
        for (const x of c.feeds) {
          if (x.cat === cat.name && x.by === pid && (!f || Number(x.walk.slice(5)) > Number(f.walk.slice(5)))) f = x;
        }
      }
      const args = f && feedArgs(f);
      if (!args) continue;
      try {
        const r = statusWord(await cloud.colonyFeed(pid, secret, { ...args, tamed: true }));
        if (r === 'unpaired' || r === 'denied') return;
      } catch (err) {
        warnOnce('feed push failed', err);
        return;
      }
    }
  }

  // Step 6b: the finder is the only one who can dress a cat, so for MY finds
  // the local wear is the truth: re-push it where the server differs (dressed
  // offline). Returns the remote with my wear patched in when the push went
  // through, or could not get through at all, so the merge (where the remote's
  // wear wins) doesn't undo it. A push the server answers and refuses is not.
  async function repushWear(cloud, secret, remote) {
    const mine = new Map(progression.state.colony.cats.filter((c) => c.finder === pid).map((c) => [c.name, c.wear]));
    const cats = [];
    for (const rc of remote.cats) {
      const wear = mine.get(rc.name);
      if (rc.finder === pid && mine.has(rc.name) && wear !== rc.wear) {
        try {
          if (statusWord(await cloud.colonyDress(pid, secret, rc.name, wear)) === 'ok') {
            cats.push({ ...rc, wear });
            continue;
          }
          // The server answered and refused: its value stands.
        } catch (err) {
          warnOnce('dress push failed', err);
          // The push never got through (offline, a 5xx): my local wear is
          // still the truth for my finds, so keep it for this merge. Otherwise
          // the server's stale value would win it back, e.g. putting a
          // traded-away item back on the cat. The next pull retries.
          cats.push({ ...rc, wear });
          continue;
        }
      }
      cats.push(rc);
    }
    return { ...remote, cats };
  }

  // -> the cat names settleColonyTaming tamed during this sync.
  async function syncWithCloud() {
    const cloud = getCloud();
    if (!cloud) throw new Error('cloud unavailable');
    // colony_authed checks the profile row's secret, so the row must exist.
    const pushed = await ensureProfile();
    const secret = getPsecret();
    const fetchSnap = async () => sanitizeSnapshot(await cloud.colonySync(pid, secret, wardrobe()),
      { me: pid, knownItems: KNOWN_ITEMS });
    let snap = await fetchSnap();
    if (snap.status === 'denied') {
      // Most likely the profile row isn't there (an earlier push failed).
      // Push it now and retry once, unless this pull already pushed it.
      profileFor = null;
      if (!pushed) {
        await ensureProfile();
        snap = await fetchSnap();
        if (snap.status === 'denied') profileFor = null;
      }
    }

    if (snap.status === 'denied' || snap.status === 'bad') {
      // Never unlink on these: only an explicit 'unpaired' does that.
      trouble('offline', snap.status, snap.status);
      return [];
    }
    lastError = null;
    warned = null;

    if (snap.status === 'unpaired') {
      // The owner removed a member (or we were never paired). Drop the link,
      // keep every cat and feed: they come back when a partner is accepted.
      const c = progression.state.colony;
      if (c.id !== null || c.partner !== null) progression.setColonyLink({ id: null, partner: null });
      netMode = 'unpaired';
      invite = snap.invite;
      joining = snap.joining;
      // Remember (in the save) that this device is the joiner; only a
      // successful pull gets here, a failed one never touches the flag.
      progression.setClanJoining(!!snap.joining);
      if (!joining) joiningSince = null;
      else if (joiningSince === null) joiningSince = Date.now();
      return [];
    }

    netMode = 'paired';
    invite = null;
    joining = null;
    joiningSince = null;
    const { remote } = snap;
    progression.setColonyLink({ id: remote.id, partner: remote.partner });
    // The inviter keeps the name it minted; the joiner takes the inviter's.
    progression.ensureClanName(pid);
    if (progression.state.clanJoining) {
      if (remote.partner) progression.adoptClanName(clanTitleFor(remote.partner.playerId));
      progression.setClanJoining(false);
    }
    const tamedSent = await pushUnsynced(cloud, secret, remote);
    progression.mergeColonySnapshot(await repushWear(cloud, secret, remote));
    // The merge can join feeds that fill a bar neither side filled alone.
    const settled = progression.settleColonyTaming(pid);
    if (tamedSent) await pushTamed(cloud, secret, remote, tamedSent);
    return settled;
  }

  // Take `names` (cats of mine whose accessory just left the wardrobe) off on
  // the server. Only when this session is paired; any failure is left to the
  // wear catch-up (repushWear) on a later pull.
  async function pushUndressed(names) {
    if (names.length === 0 || netMode !== 'paired') return;
    const cloud = getCloud();
    if (!cloud) return;
    const secret = getPsecret();
    for (const name of names) {
      try {
        await cloud.colonyDress(pid, secret, name, null);
      } catch (err) {
        warnOnce('dress push failed', err);
        return;
      }
    }
  }

  async function doPull() {
    let settled = [];
    if (MP && hasName()) {
      try {
        settled = await syncWithCloud();
      } catch (err) {
        const mode = errorMode(err);
        trouble(mode, mode, err);
      }
    }
    // Step 7's bookkeeping runs in every mode: trades only ever arrive from a
    // server snapshot and apply once, the milestone rewards are earned by a
    // solo colony just the same, and settling is local (a bar left full by
    // the owner's unpair is tamed here; the next paired pull tells the
    // server, through pushTamed). Settling goes first so rewards count it.
    let appliedTrades = [];
    let rewards = [];
    try {
      settled = [...settled, ...progression.settleColonyTaming(pid)];
      const wearBefore = new Map(progression.state.colony.cats.filter((c) => c.finder === pid && c.wear).map((c) => [c.name, c.wear]));
      appliedTrades = progression.applyColonyTrades(pid);
      rewards = progression.grantColonyRewards();
      if (appliedTrades.length > 0) {
        // A swap can take an item off a cat of mine: tell the server now, so my
        // partner doesn't see it wearing what I no longer own. (If this push
        // fails, the next paired pull's wear catch-up sends it.)
        const undressed = progression.state.colony.cats
          .filter((c) => wearBefore.has(c.name) && c.wear === null).map((c) => c.name);
        await pushUndressed(undressed);
      }
    } catch (err) {
      console.warn('Whisker Walk: colony bookkeeping failed', err);
    }
    if (appliedTrades.length > 0) {
      try {
        onTradesApplied?.(appliedTrades.map((t) => ({ ...t })));
      } catch (err) {
        console.warn('Whisker Walk: colony onTradesApplied failed', err);
      }
    }
    notifyIfChanged();
    return { appliedTrades, rewards, settled };
  }

  // Single-flight: a call while one is running gets the same promise.
  function pull() {
    if (!inflight) {
      inflight = doPull()
        .catch(() => NO_RESULT())
        .finally(() => { inflight = null; });
    }
    return inflight;
  }

  // A refusal before any network, or null to go ahead.
  function gate() {
    if (!MP) return { ok: false, status: 'local' };
    if (!hasName()) return { ok: false, status: 'needs-name' };
    return null;
  }

  // One action RPC: `run(cloud, secret)` -> its raw result, `ok(status)` says
  // whether that status is success. Any throw — offline, the SQL missing, a
  // deadlock between two mutual invites (40P01) — is { ok: false, status:
  // 'error' }, i.e. "try again". It then pulls (after any pull already in
  // flight, which started before the action) so status() and the colony
  // reflect it.
  async function action(run, ok, { profile = false } = {}) {
    const refused = gate();
    if (refused) return refused;
    let st;
    try {
      const cloud = getCloud();
      if (!cloud) throw new Error('cloud unavailable');
      if (profile) await ensureProfile();
      st = statusWord(await run(cloud, getPsecret()));
      if (st === 'denied') profileFor = null;
    } catch (err) {
      console.warn('Whisker Walk: colony action failed', err);
      st = 'error';
    }
    if (inflight) await inflight;
    await pull();
    return { ok: ok(st), status: st };
  }

  return {
    available: MP,
    status,
    pull,

    // Fire-and-forget, right after a successful local feed. Only when paired;
    // otherwise (and on any failure) the next pull's catch-up sends it.
    pushFeed(feed) {
      try {
        if (status().mode !== 'paired') return;
        const args = feedArgs(feed);
        if (!args) return;
        const cloud = getCloud();
        if (!cloud) return;
        Promise.resolve(cloud.colonyFeed(pid, getPsecret(), args)).catch((err) => warnOnce('feed push failed', err));
      } catch (err) {
        warnOnce('feed push failed', err);
      }
    },

    pairing: {
      // The profile row must exist before colony_authed can pass.
      open() {
        return action((cloud, s) => cloud.colonyInviteOpen(pid, s), (st) => st === 'ok', { profile: true });
      },
      // The code is uppercased and trimmed; one that can't be an invite code
      // never reaches the server.
      join(code) {
        const refused = gate();
        if (refused) return Promise.resolve(refused);
        const c = typeof code === 'string' ? code.trim().toUpperCase() : '';
        if (!INVITE_CODE.test(c)) return Promise.resolve({ ok: false, status: 'bad-code' });
        return action((cloud, s) => cloud.colonyInviteJoin(pid, s, c), (st) => st === 'pending', { profile: true });
      },
      answer(accept) {
        const yes = accept === true;
        return action((cloud, s) => cloud.colonyInviteAnswer(pid, s, yes), (st) => st === (yes ? 'paired' : 'declined'),
          { profile: true });
      },
    },

    // Dressing happens in the save first (only the finder, only an owned
    // item; null takes it off), so it works solo. When paired it is sent at
    // once; if that fails the cat stays dressed locally and the next pull's
    // wear catch-up sends it.
    async dress(name, item) {
      if (!progression.dressColonyCat(name, item, pid)) return { ok: false, status: 'bad' };
      // Re-render now: the local dress is done whatever the network does.
      notifyIfChanged();
      if (status().mode !== 'paired') {
        await pull();
        return { ok: true, status: 'ok' };
      }
      return action((cloud, s) => cloud.colonyDress(pid, s, name, item), (st) => st === 'ok');
    },

    trade: {
      // Known, non-starter, different items only; the server re-checks
      // ownership on both sides.
      offer(give, want) {
        const refused = gate();
        if (refused) return Promise.resolve(refused);
        if (!isTradeable(give) || !isTradeable(want) || give === want) return Promise.resolve({ ok: false, status: 'bad' });
        return action((cloud, s) => cloud.colonyTradeOffer(pid, s, give, want), (st) => st === 'ok');
      },
      answer(id, accept) {
        const refused = gate();
        if (refused) return Promise.resolve(refused);
        if (!isTradeId(id)) return Promise.resolve({ ok: false, status: 'bad' });
        const yes = accept === true;
        return action((cloud, s) => cloud.colonyTradeAnswer(pid, s, id, yes), (st) => st === (yes ? 'accepted' : 'declined'));
      },
      cancel(id) {
        const refused = gate();
        if (refused) return Promise.resolve(refused);
        if (!isTradeId(id)) return Promise.resolve({ ok: false, status: 'bad' });
        return action((cloud, s) => cloud.colonyTradeCancel(pid, s, id), (st) => st === 'cancelled');
      },
    },
  };
}
