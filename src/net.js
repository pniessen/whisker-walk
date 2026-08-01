// Net transport for Whisker Walk co-walks.
//
// createNet(transport) holds ALL shared logic: message validation, roster
// sorting, host election (smallest playerId), echo suppression, and
// malformed/oversized-message dropping. Transports are intentionally dumb —
// they only need to implement `{ join(code, profile, handlers), send(kind,
// payload), leave() }`. This keeps createSupabaseTransport thin enough that
// it doesn't need its own unit tests (it's exercised against a live project
// in Task 6); all the logic that *can* be unit tested lives in createNet and
// is tested here against createFakeHub.

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/O/0/1
const MAX_MESSAGE_BYTES = 2048;

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
 * transport is a `{ join(code, profile, handlers), send(kind, payload), leave() }`
 * implementation — either createSupabaseTransport(url, key) or a
 * createFakeHub().transport() endpoint.
 *
 * `handlers` passed into transport.join() is `{ onRoster(list), onBroadcast(kind, payload) }`.
 * Transports are expected to include the local player in the roster they
 * report and are free to loop broadcasts back to their own sender — createNet
 * de-dupes/filters everything itself so a transport doesn't need to be smart.
 */
export function createNet(transport) {
  let selfId = null;
  let roster = [];
  const stateHandlers = [];
  const eventHandlers = [];
  const rosterHandlers = [];

  function setRoster(list) {
    roster = sortRoster(Array.isArray(list) ? list : []);
    for (const fn of rosterHandlers) fn(roster);
  }

  function handleBroadcast(kind, payload) {
    if (kind === 'state') {
      if (!isValidStateMsg(payload)) return;
      if (payload.id === selfId) return; // echo suppression
      for (const fn of stateHandlers) fn(payload);
    } else if (kind === 'event') {
      if (!isValidEventMsg(payload)) return;
      if (payload.id === selfId) return; // echo suppression
      for (const fn of eventHandlers) fn(payload);
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

  function sendState(state) {
    if (!isValidStateMsg(state)) return;
    transport.send('state', state);
  }

  function sendEvent(event) {
    if (!isValidEventMsg(event)) return;
    transport.send('event', event);
  }

  function onState(fn) {
    stateHandlers.push(fn);
  }

  function onEvent(fn) {
    eventHandlers.push(fn);
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

  return { join, leave, sendState, sendEvent, onState, onEvent, onRoster, isHost };
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

/**
 * createSupabaseTransport(url, key) — real transport backed by a Supabase
 * Realtime channel: presence for the roster, broadcast for state/event
 * messages. @supabase/supabase-js is dynamically imported inside join() so
 * solo (no-multiplayer) bundles never pay for it.
 *
 * This path is intentionally thin — no validation, no host logic, no roster
 * sorting — all of that lives in createNet. It's exercised against a live
 * Supabase project in Task 6, not by unit tests here.
 */
export function createSupabaseTransport(url, key) {
  let client = null;
  let channel = null;

  return {
    async join(code, profile, handlers) {
      const { createClient } = await import('@supabase/supabase-js');
      client = createClient(url, key);
      channel = client.channel('room:' + code, {
        config: {
          broadcast: { self: false },
          presence: { key: profile.playerId },
        },
      });

      channel.on('broadcast', { event: 'state' }, ({ payload }) => handlers.onBroadcast('state', payload));
      channel.on('broadcast', { event: 'event' }, ({ payload }) => handlers.onBroadcast('event', payload));
      channel.on('presence', { event: 'sync' }, () => {
        handlers.onRoster(flattenPresenceState(channel.presenceState()));
      });

      return new Promise((resolve, reject) => {
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track(profile);
            resolve({ ok: true, roster: flattenPresenceState(channel.presenceState()) });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // don't leak a subscribed-but-unusable channel — a caller who
            // gets this rejection has no other way to clean it up, since
            // leave() is only reachable after a successful join()
            const failedChannel = channel;
            channel = null;
            client.removeChannel(failedChannel);
            reject(new Error('supabase channel ' + status));
          }
        });
      });
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
