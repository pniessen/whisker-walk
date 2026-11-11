// Net transport for Whisker Walk co-walks.
//
// createNet(transport) holds ALL shared logic: message validation, roster
// sorting, host election (smallest playerId), echo suppression, and
// malformed/oversized-message dropping. Transports are intentionally dumb —
// they only need to implement `{ join(code, profile, handlers), updateProfile(profile),
// send(kind, payload), leave() }` (updateProfile is optional). This keeps createSupabaseTransport thin enough that
// it doesn't need its own unit tests (it's exercised against a live project
// in Task 6); all the logic that *can* be unit tested lives in createNet and
// is tested here against createFakeHub.

import { isValidChatMsg } from './chat.js';
import { PERSONALITIES } from './cat/brain.js';
import { CODE_ALPHABET } from './codealphabet.js';

const ROOM_CODE_ALPHABET = CODE_ALPHABET; // no I/O/0/1
const MAX_MESSAGE_BYTES = 2048;

// A co-walk is for up to 4 cats (the v5 multiplayer spec). Presence beyond
// that is ignored, so a flood of fake joiners cannot build unlimited cat
// meshes or name tags on a child's screen.
export const MAX_ROOM_CATS = 4;

// Per-sender token buckets for incoming room messages: { burst, perSec }.
// Sized well above what the game itself sends, so ordinary play never loses a
// message to them (a dropped world event could leave two co-walkers' worlds
// different); only a flood is cut. Legitimate rates, from the senders:
//   state  8 Hz exactly (main.js's netSendAccum), so 16/s is double that;
//          the burst covers ~3 s of states queued behind a stalled socket.
//   meow   one per V press or Meow tap (no key repeat); a child mashing
//          manages ~6/s for a moment, a stranger's script 100s.
//   event  every other event is one per deliberate action (E, a pounce, a
//          pick-up, a dig) or a fixed pair (border-cross resend); a few a
//          second at the very most.
//   chat   the sender's own 1.5 s cooldown (walk.js sendGate): under 1/s.
export const RATE_LIMITS = {
  state: { burst: 24, perSec: 16 },
  meow: { burst: 12, perSec: 6 },
  event: { burst: 40, perSec: 20 },
  chat: { burst: 6, perSec: 2 },
};

// Minimal, lowercase-substring-matched blocklist. Intentionally short —
// this is a basic profanity gate, not a moderation system.
const NAME_BLOCKLIST = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'nigger',
  'faggot',
  'cunt',
  'whore',
  'slut',
  'nazi',
];

export function generateRoomCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function validPetName(name) {
  if (typeof name !== 'string') return false;
  if (!/^[A-Za-z][A-Za-z -]{1,15}$/.test(name)) return false;
  const lower = name.toLowerCase();
  return !NAME_BLOCKLIST.some((bad) => lower.includes(bad));
}

// More words a NEW name may not contain, and that a remote name is not shown
// with. Kept out of validPetName on purpose: a cat already named with one of
// them keeps working online (Host, Join, nearby, pairing all check
// validPetName), so no child is locked out by this list; only her friends see
// "Mystery Cat". Substring-matched like NAME_BLOCKLIST, so every word here was
// checked against ordinary names: left out are words hiding inside real ones
// (Thorny, Booboo, Swanky, Grape, Torpedo, Essex, Peacock, Dickens).
// test/namesafety.test.js runs every built-in name through it.
const NEW_NAME_BLOCKLIST = [
  'piss',
  'penis',
  'vagina',
  'porn',
  'dildo',
  'jizz',
  'bollock',
  'twat',
  'retard',
  'hitler',
  'kkk',
  // a way to reach someone, spelled out in letters (a URL or a handle cannot
  // get past validPetName's letters-only rule, but these words can)
  'http',
  'www',
  'snapchat',
  'discord',
  'instagram',
  'whatsapp',
  'tiktok',
];

// A name a child may pick for her own cat now: validPetName and none of the
// words above.
export function goodNewPetName(name) {
  if (!validPetName(name)) return false;
  const lower = name.toLowerCase();
  return !NEW_NAME_BLOCKLIST.some((bad) => lower.includes(bad));
}

// The name shown for a cat whose name came from somewhere else.
export const REMOTE_NAME_FALLBACK = 'Mystery Cat';

// The one thing to call before a name that arrived from another device (room
// presence, a profiles row, a friend code, an event) reaches the screen: a
// toast, a chip, a name tag, an aria-label. The server does not check these,
// so anything that is not a good pet name (markup, a URL, a phone number,
// emoji, an RTL override, 500 characters, a rude word) is shown as the
// fallback. Letters, spaces and hyphens only, so it is also safe as text.
export function safeRemoteName(raw, fallback = REMOTE_NAME_FALLBACK) {
  return goodNewPetName(raw) ? raw : fallback;
}

// A remote breed is shown only when it is one of the game's own breed keys.
export function safeRemoteBreed(raw, fallback = 'cat') {
  return typeof raw === 'string' && Object.hasOwn(PERSONALITIES, raw) ? raw : fallback;
}

// createTokenBucket({ burst, perSec }, now) -> { take(key) → boolean }
// One bucket per key (a sender's id): it starts full and refills at perSec.
// take() spends a token, false when empty. forget(key) drops a key's bucket.
export function createTokenBucket({ burst, perSec }, now = defaultClock) {
  const buckets = new Map(); // key -> { tokens, at }
  return {
    take(key) {
      const t = now();
      let b = buckets.get(key);
      if (!b) {
        b = { tokens: burst, at: t };
        buckets.set(key, b);
      } else {
        b.tokens = Math.min(burst, b.tokens + Math.max(0, t - b.at) * perSec);
        b.at = t;
      }
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    },
    forget(key) {
      buckets.delete(key);
    },
  };
}

function defaultClock() {
  return (globalThis.performance?.now?.() ?? Date.now()) / 1000;
}

// capRoster(list, selfId) -> the roster every client agrees on.
// Sorted by playerId and cut to the MAX_ROOM_CATS smallest ids, so any two
// devices that see the same presence keep the same cats, in whatever order
// presence arrived (the smallest id is also the host). Entries without a
// string id and repeat ids are dropped. If I am not among them I am still
// listed for myself (my own cat is never hidden from me), but nobody else's
// device counts me.
export function capRoster(list, selfId) {
  const seen = new Set();
  const clean = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || typeof p !== 'object' || typeof p.playerId !== 'string' || p.playerId === '') continue;
    if (seen.has(p.playerId)) continue;
    seen.add(p.playerId);
    clean.push(p);
  }
  const sorted = sortRoster(clean);
  const kept = sorted.slice(0, MAX_ROOM_CATS);
  if (selfId != null && !kept.some((p) => p.playerId === selfId)) {
    const me = sorted.find((p) => p.playerId === selfId);
    if (me) kept.push(me);
  }
  return kept;
}

function messageSizeOk(msg) {
  try {
    return JSON.stringify(msg).length <= MAX_MESSAGE_BYTES;
  } catch {
    return false;
  }
}

function isValidStateMsg(msg) {
  return (
    !!msg &&
    typeof msg === 'object' &&
    msg.v === 1 &&
    typeof msg.id === 'string' &&
    Array.isArray(msg.pos) &&
    msg.pos.length === 2 &&
    Number.isFinite(msg.pos[0]) &&
    Number.isFinite(msg.pos[1]) &&
    Number.isFinite(msg.yaw) &&
    typeof msg.pose === 'string' &&
    Number.isFinite(msg.speed) &&
    messageSizeOk(msg)
  );
}

function isValidEventMsg(msg) {
  return (
    !!msg &&
    typeof msg === 'object' &&
    msg.v === 1 &&
    typeof msg.id === 'string' &&
    typeof msg.type === 'string' &&
    messageSizeOk(msg)
  );
}

function sortRoster(list) {
  return [...list].sort((a, b) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
}

/**
 * createNet(transport) -> net
 *
 * transport is a `{ join(code, profile, handlers), updateProfile?(profile), send(kind, payload), leave() }`
 * implementation — either createSupabaseTransport(url, key) or a
 * createFakeHub().transport() endpoint.
 *
 * `handlers` passed into transport.join() is `{ onRoster(list), onBroadcast(kind, payload) }`.
 * Transports are expected to include the local player in the roster they
 * report and are free to loop broadcasts back to their own sender — createNet
 * de-dupes/filters everything itself so a transport doesn't need to be smart.
 */
//
// Who sent a message. A Supabase broadcast carries no sender identity: the
// `id` inside it is whatever the sender wrote, and presence keys are chosen by
// the client too (presence: { key: profile.playerId }). So the true sender is
// NOT knowable here; anyone holding the public key and the room code can
// claim any id. What can be checked, and is: a message is believed only if
// its id is in the capped roster (a cat this device is showing), and each id
// gets its own rate limit. Both are computed from shared presence, so every
// device drops the same messages.
export function createNet(transport, { now = defaultClock } = {}) {
  let selfId = null;
  let roster = [];
  let members = new Set(); // ids in the capped roster
  const stateHandlers = [];
  const eventHandlers = [];
  const chatHandlers = [];
  const rosterHandlers = [];
  const limits = {
    state: createTokenBucket(RATE_LIMITS.state, now),
    meow: createTokenBucket(RATE_LIMITS.meow, now),
    event: createTokenBucket(RATE_LIMITS.event, now),
    chat: createTokenBucket(RATE_LIMITS.chat, now),
  };

  function setRoster(list) {
    roster = capRoster(list, selfId);
    const next = new Set(roster.map((p) => p.playerId));
    for (const id of members) {
      if (!next.has(id)) for (const b of Object.values(limits)) b.forget(id);
    }
    members = next;
    for (const fn of rosterHandlers) fn(roster);
  }

  // A message from someone this device is not showing, or past its sender's
  // rate, is dropped silently.
  function admit(bucket, id) {
    return members.has(id) && limits[bucket].take(id);
  }

  function handleBroadcast(kind, payload) {
    if (kind === 'state') {
      if (!isValidStateMsg(payload)) return;
      if (payload.id === selfId) return; // echo suppression
      if (!admit('state', payload.id)) return;
      for (const fn of stateHandlers) fn(payload);
    } else if (kind === 'event') {
      if (!isValidEventMsg(payload)) return;
      if (payload.id === selfId) return; // echo suppression
      if (!admit(payload.type === 'meow' ? 'meow' : 'event', payload.id)) return;
      for (const fn of eventHandlers) fn(payload);
    } else if (kind === 'chat') {
      if (!isValidChatMsg(payload)) return;
      if (payload.id === selfId) return; // echo suppression
      if (!admit('chat', payload.id)) return;
      for (const fn of chatHandlers) fn(payload);
    }
  }

  async function join(roomCode, profile) {
    selfId = profile.playerId;
    const result = await transport.join(roomCode, profile, {
      onRoster: setRoster,
      onBroadcast: handleBroadcast,
    });
    if (result && Array.isArray(result.roster)) setRoster(result.roster);
    return { ok: true, roster };
  }

  async function leave() {
    await transport.leave();
    selfId = null;
    setRoster([]);
  }

  // Re-publish this player's profile to the room (a cat or outfit changed).
  async function updateProfile(profile) {
    if (selfId == null) return;
    await transport.updateProfile?.(profile);
  }

  function sendState(state) {
    if (!isValidStateMsg(state)) return;
    transport.send('state', state);
  }

  function sendEvent(event) {
    if (!isValidEventMsg(event)) return;
    transport.send('event', event);
  }

  function sendChat(msg) {
    if (!isValidChatMsg(msg)) return;
    transport.send('chat', msg);
  }

  function onState(fn) {
    stateHandlers.push(fn);
  }

  function onEvent(fn) {
    eventHandlers.push(fn);
  }

  function onChat(fn) {
    chatHandlers.push(fn);
  }

  // Replay-to-late-subscriber: a caller that wires up onRoster() after the
  // roster has already settled (e.g. main.js's walk-scoped subscription,
  // registered after the lobby's host()/join() already resolved) would
  // otherwise never see the current membership — Supabase presence 'sync'
  // only fires on a *change*, so there may be no future notification coming
  // at all. Firing immediately with the current roster (when non-empty)
  // makes onRoster safe to call at any time, not just before the roster
  // first populates.
  function onRoster(fn) {
    rosterHandlers.push(fn);
    if (roster.length > 0) fn(roster);
  }

  function isHost() {
    return roster.length > 0 && selfId != null && roster[0].playerId === selfId;
  }

  return { join, leave, updateProfile, sendState, sendEvent, sendChat, onState, onEvent, onChat, onRoster, isHost };
}

/**
 * createFakeHub() — in-memory rooms shared by transport endpoints, for tests
 * and local dev without a network. hub.transport() mints a new endpoint
 * implementing the transport interface createNet expects.
 *
 * The fake hub deliberately does NOT suppress echoes or validate messages —
 * that's createNet's job, and testing through the fake hub is what proves
 * createNet does it without relying on transport cooperation.
 */
export function createFakeHub() {
  const rooms = new Map(); // code -> Map(playerId -> { profile, handlers })

  function rosterFor(room) {
    return Array.from(room.values()).map((entry) => entry.profile);
  }

  function broadcastRoster(room) {
    const roster = rosterFor(room);
    for (const entry of room.values()) entry.handlers.onRoster(roster);
  }

  function transport() {
    let code = null;
    let playerId = null;
    let joined = false;

    return {
      async join(roomCode, profile, handlers) {
        code = roomCode;
        playerId = profile.playerId;
        if (!rooms.has(code)) rooms.set(code, new Map());
        const room = rooms.get(code);
        room.set(playerId, { profile, handlers });
        joined = true;
        broadcastRoster(room);
        return { ok: true, roster: rosterFor(room) };
      },

      async updateProfile(profile) {
        if (!joined) return;
        const room = rooms.get(code);
        const entry = room?.get(playerId);
        if (!entry) return;
        entry.profile = profile;
        broadcastRoster(room);
      },

      send(kind, payload) {
        if (!joined) return;
        const room = rooms.get(code);
        if (!room) return;
        for (const entry of room.values()) entry.handlers.onBroadcast(kind, payload);
      },

      async leave() {
        if (!joined) return;
        const room = rooms.get(code);
        if (room) {
          room.delete(playerId);
          broadcastRoster(room);
        }
        joined = false;
      },
    };
  }

  return { transport };
}

function flattenPresenceState(state) {
  const roster = [];
  for (const key in state) {
    const presences = state[key];
    if (presences && presences.length > 0) {
      // eslint-disable-next-line no-unused-vars
      const { presence_ref, ...profile } = presences[0];
      roster.push(profile);
    }
  }
  return roster;
}

// getSupabaseClient(url, key) — the single shared Supabase client factory.
// @supabase/supabase-js is dynamically imported here (and only here) so
// solo (no-multiplayer) bundles never pay for it. The client is memoized per
// url+key pair so the realtime transport and the cloud RPC client (src/cloud.js)
// share one underlying connection instead of each creating their own.
const clientCache = new Map();

export async function getSupabaseClient(url, key) {
  const cacheKey = url + '|' + key;
  if (!clientCache.has(cacheKey)) {
    const { createClient } = await import('@supabase/supabase-js');
    clientCache.set(cacheKey, createClient(url, key));
  }
  return clientCache.get(cacheKey);
}

/**
 * createSupabaseTransport(url, key) — real transport backed by a Supabase
 * Realtime channel: presence for the roster, broadcast for state/event
 * messages. Uses the shared getSupabaseClient() so solo (no-multiplayer)
 * bundles never pay for @supabase/supabase-js until it's actually needed.
 *
 * This path is intentionally thin — no validation, no host logic, no roster
 * sorting — all of that lives in createNet. It's exercised against a live
 * Supabase project in Task 6, not by unit tests here.
 */
export function createSupabaseTransport(url, key) {
  let client = null;
  let channel = null;
  let current = null; // the profile to (re)track: join's, then any updateProfile

  return {
    async join(code, profile, handlers) {
      current = profile;
      client = await getSupabaseClient(url, key);
      channel = client.channel('room:' + code, {
        config: {
          broadcast: { self: false },
          presence: { key: profile.playerId },
        },
      });

      // This subscription list MUST include every broadcast kind createNet's
      // handleBroadcast() handles (state/event/chat) — a kind missing here is
      // silently never delivered to peers, even though createNet is fully
      // wired to route it. Add a new `channel.on('broadcast', ...)` line
      // whenever a new kind is added to handleBroadcast.
      channel.on('broadcast', { event: 'state' }, ({ payload }) => handlers.onBroadcast('state', payload));
      channel.on('broadcast', { event: 'event' }, ({ payload }) => handlers.onBroadcast('event', payload));
      channel.on('broadcast', { event: 'chat' }, ({ payload }) => handlers.onBroadcast('chat', payload));
      channel.on('presence', { event: 'sync' }, () => {
        handlers.onRoster(flattenPresenceState(channel.presenceState()));
      });

      return new Promise((resolve, reject) => {
        // This status callback persists for the channel's whole lifetime,
        // not just for the initial subscribe attempt — a normal leave()
        // (untrack + removeChannel) itself drives the channel through
        // 'CLOSED', and a transient CHANNEL_ERROR can also land mid-walk
        // long after we've already resolved. `settled` distinguishes "this
        // status change is the outcome of the join() call we're inside of"
        // from "this is a later lifecycle event on an already-joined
        // channel" — only the former should reject the join promise or
        // tear down the channel; leave() owns teardown from that point on.
        let settled = false;
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            settled = true;
            await channel.track(current); // the latest profile, so a reconnect keeps a retrack
            resolve({ ok: true, roster: flattenPresenceState(channel.presenceState()) });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (!settled) {
              // the join itself failed — don't leak a subscribed-but-
              // unusable channel, since the caller has no `net` to call
              // leave() on (join() rejected before returning one).
              settled = true;
              const failedChannel = channel;
              channel = null;
              client.removeChannel(failedChannel);
              reject(new Error('supabase channel ' + status));
            }
            // else: a post-join status change (e.g. our own leave()
            // closing the channel, or a transient error) — not our call to
            // tear down or null the channel here.
          }
        });
      });
    },

    async updateProfile(profile) {
      current = profile;
      if (channel) await channel.track(current);
    },

    send(kind, payload) {
      if (!channel) return;
      channel.send({ type: 'broadcast', event: kind, payload });
    },

    async leave() {
      if (channel) {
        await channel.untrack();
        await client.removeChannel(channel);
        channel = null;
        client = null;
      }
    },
  };
}
