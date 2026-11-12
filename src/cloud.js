// Cloud RPC client for Whisker Walk's "always online" save sync, pet
// profiles, and cross-walk friendships.
//
// The client/server contract is FIXED and already live — see
// docs/supabase-setup.sql for the `saves`/`profiles`/`friendships` tables
// and the `upsert_save`/`load_save`/`upsert_profile`/`record_friend_greet`
// RPCs. The colony RPCs (colony_invite_*, colony_sync, colony_feed,
// colony_dress, colony_trade_*) are defined in docs/supabase-colony.sql.
// Every RPC arg name below (the `p_`-prefixed keys) must match its SQL
// exactly: docs/supabase-setup.sql for the save/profile/friend RPCs and
// docs/supabase-colony.sql for the colony ones. The v8 read RPCs
// (profiles_by_ids, find_by_friend_code, friendships_of) and the v8 checks
// on the write RPCs are in docs/supabase-v8-hardening.sql, and the two
// delete RPCs (delete_save, delete_player) in docs/supabase-v9-delete.sql.
//
// createCloud({rpc, select}) takes injectable adapters so unit tests can
// exercise the arg-mapping/result-passthrough logic with fakes, with no
// network and no @supabase/supabase-js import. createLiveCloud(url, key)
// wires up the real adapters against the shared Supabase client from
// net.js (see getSupabaseClient there).

import { getSupabaseClient } from './net.js';
import { note } from './diagnostics.js';

// 256-word safe list for save codes: short (4-6 letter), friendly
// nouns/animals/colors. No offensive or ambiguous words. ~30.6 bits of
// entropy across 3 words + a 2-digit suffix (256^3 * 100 ≈ 2^30.6), drawn
// from crypto.getRandomValues (see generateSaveCode).
const WORDLIST = [
  'OTTER', 'PANDA', 'ZEBRA', 'TIGER', 'EAGLE', 'ROBIN', 'HERON', 'RAVEN',
  'GOOSE', 'SWAN', 'CRANE', 'FINCH', 'QUAIL', 'OWLET', 'LLAMA', 'ALPACA',
  'BADGER', 'WEASEL', 'FERRET', 'RABBIT', 'BEAVER', 'MARTEN', 'JACKAL', 'COYOTE',
  'MOOSE', 'BISON', 'CIVET', 'LEMUR', 'KOALA', 'PONY', 'DEER', 'FAWN',
  'COLT', 'CALF', 'LAMB', 'GOAT', 'MULE', 'HARE', 'MOLE', 'VOLE',
  'NEWT', 'TOAD', 'FROG', 'CRAB', 'SEAL', 'ORCA', 'WHALE', 'SHARK',
  'TROUT', 'SALMON', 'GUPPY', 'TETRA', 'EGRET', 'STORK', 'IBIS', 'TERN',
  'LARK', 'WREN', 'DOVE', 'HAWK', 'CROW', 'MAGPIE', 'PIGEON', 'PARROT',
  'TOUCAN', 'PUFFIN', 'FALCON', 'CONDOR', 'OSPREY', 'GROUSE', 'TURKEY', 'CHICK',
  'PLUM', 'TEAL', 'GOLD', 'NAVY', 'RUBY', 'JADE', 'ROSE', 'CORAL',
  'AMBER', 'IVORY', 'OLIVE', 'SLATE', 'UMBER', 'SEPIA', 'OCHRE', 'CREAM',
  'BEIGE', 'MAUVE', 'LILAC', 'INDIGO', 'VIOLET', 'MAROON', 'TAUPE', 'BRONZE',
  'COPPER', 'SILVER', 'GOLDEN', 'EMBER', 'FLAME', 'BLUSH', 'PEARL', 'OPAL',
  'ONYX', 'FERN', 'MOSS', 'LEAF', 'REED', 'VINE', 'BLOOM', 'PETAL',
  'THORN', 'ACORN', 'MAPLE', 'BIRCH', 'CEDAR', 'ALDER', 'WILLOW', 'ASPEN',
  'PINE', 'POPPY', 'TULIP', 'DAISY', 'LOTUS', 'CLOVER', 'MEADOW', 'GARDEN',
  'VALLEY', 'RIVER', 'BROOK', 'CREEK', 'STONE', 'CLOUD', 'STORM', 'BREEZE',
  'FROST', 'SNOW', 'RAIN', 'MIST', 'MITTEN', 'SCARF', 'BOOTS', 'CANDY',
  'COOKIE', 'MUFFIN', 'BERRY', 'PEACH', 'MANGO', 'LEMON', 'APPLE', 'GRAPE',
  'CHERRY', 'HONEY', 'SUGAR', 'TOFFEE', 'WAFFLE', 'NOODLE', 'PICKLE', 'PEPPER',
  'GINGER', 'NUTMEG', 'CLOVE', 'BASIL', 'MINT', 'SAGE', 'THYME', 'PUPPY',
  'KITTEN', 'BUNNY', 'PIGLET', 'GERBIL', 'CANARY', 'WALRUS', 'OCELOT', 'LYNX',
  'PUMA', 'COUGAR', 'JAGUAR', 'HIPPO', 'RHINO', 'POSSUM', 'SKUNK', 'MINK',
  'VIPER', 'GECKO', 'IGUANA', 'TURTLE', 'LIZARD', 'SNAIL', 'AZURE', 'CYAN',
  'RUST', 'SAND', 'PEWTER', 'GRAY', 'FOREST', 'JUNGLE', 'OCEAN', 'AQUA',
  'COBALT', 'TOPAZ', 'GARNET', 'QUARTZ', 'MOCHA', 'CACAO', 'BAGEL', 'SCONE',
  'FUDGE', 'MOCHI', 'SORBET', 'GELATO', 'NECTAR', 'MELON', 'GUAVA', 'PAPAYA',
  'KIWI', 'RAISIN', 'ALMOND', 'WALNUT', 'PECAN', 'HAZEL', 'CASHEW', 'SUNSET',
  'DAWN', 'DUSK', 'COMET', 'NOVA', 'LUNAR', 'SOLAR', 'AURORA', 'TUNDRA',
  'DESERT', 'OASIS', 'HARBOR', 'ISLAND', 'LAGOON', 'COAST', 'SHORE', 'DUNE',
  'CLIFF', 'CANYON', 'RIDGE', 'PEAK', 'SUMMIT', 'PILLOW', 'CANDLE', 'HEARTH',
  'CABIN', 'PORCH', 'QUILT', 'YARN', 'BUTTON', 'RIBBON', 'TASSEL', 'VELVET',
];

// randomIndex(n, nextUint32) -> an integer in [0, n), with no modulo bias.
// A plain `x % n` over 2^32 values favours the low results whenever n does
// not divide 2^32 (it doesn't for the 100 two-digit suffixes), so draws at or
// above the largest multiple of n are thrown away and redrawn. For n = 256
// nothing is ever rejected; for n = 100 the chance is 96 in 2^32. The try cap
// only matters for a broken source that never returns a usable value.
export function randomIndex(n, nextUint32) {
  const limit = Math.floor(2 ** 32 / n) * n;
  let x = nextUint32();
  for (let tries = 1; x >= limit && tries < 64; tries++) x = nextUint32();
  return x % n;
}

// nextUint32 source for save codes: the platform CSPRNG. getRandomValues has
// been in every browser since 2013 (WKWebView included, and unlike
// randomUUID it doesn't need a secure context) and in Node since 15/19, so
// the Math.random fallback only runs where `crypto` is missing entirely.
function uint32Source(cryptoLike) {
  if (cryptoLike && typeof cryptoLike.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    return () => { cryptoLike.getRandomValues(buf); return buf[0]; };
  }
  return () => Math.floor(Math.random() * 2 ** 32);
}

/**
 * generateSaveCode(cryptoLike?) -> "PLUM-OTTER-CROW-42" style: 3 wordlist
 * picks + 2 digits. cryptoLike is anything with getRandomValues (the global
 * `crypto` by default; a fake in tests). The format is unchanged, so codes
 * made before the switch from Math.random keep working.
 */
export function generateSaveCode(cryptoLike = globalThis.crypto) {
  const next = uint32Source(cryptoLike);
  const pick = () => WORDLIST[randomIndex(WORDLIST.length, next)];
  const w1 = pick(); const w2 = pick(); const w3 = pick();
  const digits = randomIndex(100, next).toString().padStart(2, '0');
  return `${w1}-${w2}-${w3}-${digits}`;
}

// The server refuses a save bigger than 2 MiB of jsonb text (upsert_save in
// docs/supabase-v8-hardening.sql, which has the arithmetic). The client
// stops a little earlier, at 1.75 MiB of JSON, because Postgres's text form
// adds a space after every ':' and ',' — and so a too-big save is caught
// here even before the owner has run the v8 SQL.
export const CLOUD_SAVE_MAX_BYTES = 2 * 1024 * 1024;
export const CLOUD_SAVE_SEND_MAX_BYTES = 1.75 * 1024 * 1024;

/** payloadBytes(payload) -> the UTF-8 size of its JSON, or Infinity if it can't be serialised. */
export function payloadBytes(payload) {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch (err) {
    note('cloud', err);
    return Infinity;
  }
}

/** normalizeSaveCode(input) -> trimmed/uppercased/hyphen-normalized code, or '' for junk input. */
export function normalizeSaveCode(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-') // spaces/underscores -> hyphen
    .replace(/-+/g, '-') // collapse repeated hyphens
    .replace(/^-|-$/g, ''); // strip leading/trailing hyphens
}

const SECRET_KEY = 'whisker-walk-secret';

/**
 * getOrCreateSecret(storage) — the capability secret that authorizes
 * profile/friendship writes (`playerSecret` in the plan). Generated once
 * (two concatenated crypto.randomUUID()s) and persisted beside the
 * player id; storage-guarded like main.js's pid generation so private
 * mode/quota errors degrade to a session-only secret instead of throwing.
 */
export function getOrCreateSecret(storage) {
  try {
    const existing = storage.getItem(SECRET_KEY);
    if (existing) return existing;
    const secret = crypto.randomUUID() + crypto.randomUUID();
    storage.setItem(SECRET_KEY, secret);
    return secret;
  } catch {
    return crypto.randomUUID() + crypto.randomUUID();
  }
}

// True when an RPC error means "this function isn't on the server yet"
// (PostgREST's PGRST202, or Postgres's undefined_function), i.e. the owner
// hasn't run docs/supabase-v8-hardening.sql. Anything else — offline, a
// timeout, a permission error — is a real failure and is not papered over.
export function isMissingRpc(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.code === 'PGRST202' || err.code === '42883') return true;
  return typeof err.message === 'string' && /could not find the function/i.test(err.message);
}

// What delete_save / delete_player can answer (docs/supabase-v9-delete.sql).
const DELETE_ANSWERS = new Set(['ok', 'none', 'denied', 'busy']);

// profiles_by_ids takes at most this many ids per call (the SQL's cap).
const PROFILE_IDS_PER_CALL = 100;

/**
 * createCloud({rpc, select, getSecret?}) -> cloud
 *
 * `rpc(name, args) -> Promise<data>` and `select(table, filterType, ...args)
 * -> Promise<rows>` are injectable: fakes in tests, real adapters (below)
 * wrapping the Supabase client in production. Both are expected to already
 * unwrap `{data, error}` and throw on error — createCloud itself does no
 * error handling beyond the v8 fallback below, just arg mapping and result
 * passthrough. `getSecret()` (optional) returns this player's secret, which
 * the v8 friendships_of RPC needs; without it friendships are read the old way.
 *
 * Profile and friendship READS try the v8 RPCs first and fall back to the
 * old public table select when the server doesn't have them yet, so this
 * client works against the database both before and after the owner runs
 * docs/supabase-v8-hardening.sql. Once a function is known to be missing it
 * isn't asked for again this session (one wasted round trip, not one per read).
 */
export function createCloud({ rpc, select, getSecret }) {
  const missing = new Set();
  async function viaRpc(name, args, fallback) {
    if (!missing.has(name)) {
      try {
        const rows = await rpc(name, args);
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        if (!isMissingRpc(err)) throw err;
        missing.add(name);
      }
    }
    return fallback();
  }

  // 'too-big' without a round trip: the same answer the v8 server gives, so
  // the caller has one path for it whichever side noticed.
  async function saveToCloud(code, secret, payload, lifetime) {
    if (payloadBytes(payload) > CLOUD_SAVE_SEND_MAX_BYTES) return 'too-big';
    return rpc('upsert_save', { p_code: code, p_secret: secret, p_payload: payload, p_lifetime: lifetime });
  }

  // load_save's p_secret param is accepted but not verified server-side —
  // the SQL comment is explicit that the code alone grants read access on a
  // new device, so there is nothing meaningful to pass here. (v8 makes a
  // flood of wrong codes answer "no save" for everyone for a few minutes;
  // that looks the same as a miss here.)
  async function loadFromCloud(code) {
    const data = await rpc('load_save', { p_code: code, p_secret: '' });
    return data ?? null;
  }

  async function pushProfile(profile) {
    return rpc('upsert_profile', {
      p_player_id: profile.playerId,
      p_secret: profile.secret,
      p_pet_name: profile.petName,
      p_breed: profile.breed,
      p_accessories: profile.accessories ?? {},
      p_rank_title: profile.rankTitle,
    });
  }

  async function recordGreet(myId, mySecret, otherId, walkStamp) {
    return rpc('record_friend_greet', { p_my_id: myId, p_my_secret: mySecret, p_other_id: otherId, p_walk: walkStamp });
  }

  async function fetchProfiles(playerIds) {
    const out = [];
    for (let i = 0; i < playerIds.length; i += PROFILE_IDS_PER_CALL) {
      const ids = playerIds.slice(i, i + PROFILE_IDS_PER_CALL);
      out.push(...await viaRpc('profiles_by_ids', { p_ids: ids }, () => select('profiles', 'in', 'player_id', ids)));
    }
    return out;
  }

  // v8 matches the whole 8-character friend code exactly (no prefix search,
  // so the public key can't list every player); the old server's `like`
  // prefix query is the fallback.
  async function findByFriendCode(prefix) {
    return viaRpc('find_by_friend_code', { p_code: prefix }, () => select('profiles', 'like', 'player_id', prefix + '%'));
  }

  async function fetchFriendships(myId) {
    const secret = getSecret?.();
    const old = () => select('friendships', 'or', `a_id.eq.${myId},b_id.eq.${myId}`);
    if (!secret) return old();
    return viaRpc('friendships_of', { p_player_id: myId, p_secret: secret }, old);
  }

  // addFriendByCode(myId, mySecret, otherId) -> {status: 'self'|'already'|'added'|'failed'}
  //
  // The friend-code flow (Task 4) must be idempotent per pair, not per
  // click: home base's "confirm" button can legitimately fire more than
  // once (a double-tap, or a search→cancel→search→confirm sequence on the
  // same code), and record_friend_greet's dedupe key is the WALK STAMP the
  // caller supplies — so a naive `'friendcode-' + Date.now()` stamp on
  // every call defeats that dedupe entirely and lets repeated clicks farm
  // greets 0→6, unlocking best-friend/gift status without any real
  // interaction. Fixed here by (a) checking the already-fetched-for-the-
  // roster friendships list before ever calling recordGreet — any existing
  // row for this pair (any greets > 0) means "already met", so the call is
  // skipped entirely rather than re-sent — and (b) using a single STABLE
  // per-pair stamp ('friendcode', not a timestamp) for the one legitimate
  // first-ever call, so even a genuine race between two rapid first-adds
  // can only ever register once server-side. Net effect: a friend code can
  // raise a pair from nothing to 'met' exactly once, ever; deepening the
  // friendship past that still requires real co-walk/ghost greets.
  //
  // recordGreet returning -1 means record_friend_greet denied the call —
  // in this flow that's almost always because the CALLER (myId/mySecret)
  // has no profile row yet (e.g. they just typed a pet name but never
  // pushed a profile), not that anything about `otherId` was wrong. Before
  // this fix that -1 was silently discarded and swallowed into a false
  // 'added', so a caller with no profile could believe the friend was
  // added when nothing was ever recorded server-side.
  async function addFriendByCode(myId, mySecret, otherId) {
    if (otherId === myId) return { status: 'self' }; // belt-and-suspenders — callers should already exclude self
    const rows = await fetchFriendships(myId);
    const already = rows.some((r) => r.a_id === otherId || r.b_id === otherId);
    if (already) return { status: 'already' };
    const greets = await recordGreet(myId, mySecret, otherId, 'friendcode');
    if (greets === -1) return { status: 'failed' };
    return { status: 'added' };
  }

  // Colony RPCs (docs/supabase-colony.sql). Pure arg mapping, results passed
  // through unchanged: colonySync's snapshot is untrusted and goes through
  // colony.js's sanitizeSnapshot before the game looks at it.
  async function colonyInviteOpen(id, secret) {
    return rpc('colony_invite_open', { p_player_id: id, p_secret: secret });
  }
  async function colonyInviteJoin(id, secret, code) {
    return rpc('colony_invite_join', { p_player_id: id, p_secret: secret, p_code: code });
  }
  async function colonyInviteAnswer(id, secret, accept) {
    return rpc('colony_invite_answer', { p_player_id: id, p_secret: secret, p_accept: accept });
  }
  async function colonySync(id, secret, wardrobe) {
    return rpc('colony_sync', { p_player_id: id, p_secret: secret, p_wardrobe: wardrobe });
  }
  async function colonyFeed(id, secret, { cat, walk, area, x, z, head, tamed }) {
    return rpc('colony_feed', {
      p_player_id: id, p_secret: secret, p_cat: cat, p_walk: walk, p_area: area, p_x: x, p_z: z, p_head: head, p_tamed: tamed,
    });
  }
  async function colonyDress(id, secret, cat, item) {
    return rpc('colony_dress', { p_player_id: id, p_secret: secret, p_cat: cat, p_item: item });
  }
  async function colonyTradeOffer(id, secret, give, want) {
    return rpc('colony_trade_offer', { p_player_id: id, p_secret: secret, p_give: give, p_want: want });
  }
  async function colonyTradeAnswer(id, secret, tradeId, accept) {
    return rpc('colony_trade_answer', { p_player_id: id, p_secret: secret, p_trade_id: tradeId, p_accept: accept });
  }
  async function colonyTradeCancel(id, secret, tradeId) {
    return rpc('colony_trade_cancel', { p_player_id: id, p_secret: secret, p_trade_id: tradeId });
  }

  // "Delete my online data" (docs/supabase-v9-delete.sql). Unlike the calls
  // above these never throw: the answer is one word, so the caller can never
  // mistake a failure for a delete. 'ok' | 'none' (nothing there: done too) |
  // 'denied' | 'busy' are the server's; 'unavailable' means the functions
  // aren't on the server yet (the owner hasn't run the file), 'offline' that
  // the call didn't get an answer, and 'bad' an answer that isn't one of these.
  async function deleteCall(name, args) {
    try {
      const r = await rpc(name, args);
      return DELETE_ANSWERS.has(r) ? r : 'bad';
    } catch (err) {
      if (isMissingRpc(err)) return 'unavailable';
      note('cloud', err);
      return 'offline';
    }
  }
  async function deleteSave(code, secret) {
    return deleteCall('delete_save', { p_code: code, p_secret: secret });
  }
  async function deletePlayer(id, secret) {
    return deleteCall('delete_player', { p_player_id: id, p_secret: secret });
  }

  return {
    saveToCloud, loadFromCloud, pushProfile, recordGreet, fetchProfiles, findByFriendCode, fetchFriendships,
    addFriendByCode,
    colonyInviteOpen, colonyInviteJoin, colonyInviteAnswer, colonySync, colonyFeed, colonyDress,
    colonyTradeOffer, colonyTradeAnswer, colonyTradeCancel,
    deleteSave, deletePlayer,
  };
}

async function realRpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

// The old (pre-v8) read path. The anon grant on profiles was column-scoped
// (the v7 setup revoked all then granted back this exact column list —
// `secret` deliberately excluded); select('*') got a permission-denied
// error. The friendships grant was table-wide, so '*' was fine there. Step B
// of docs/supabase-v8-hardening.sql removes both grants; by then every
// client reads through the RPCs above.
const PUBLIC_SELECT_COLUMNS = {
  profiles: 'player_id, pet_name, breed, accessories, rank_title, last_seen',
};

async function realSelect(client, table, filterType, ...args) {
  let query = client.from(table).select(PUBLIC_SELECT_COLUMNS[table] ?? '*');
  if (filterType === 'in') query = query.in(args[0], args[1]);
  else if (filterType === 'like') query = query.like(args[0], args[1]);
  else if (filterType === 'or') query = query.or(args[0]);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * createLiveCloud(url, key, {getSecret}?) — real createCloud() wired to the
 * shared Supabase client (getSupabaseClient in net.js), so the RPC client and
 * the realtime co-walk transport reuse one connection instead of each
 * creating their own.
 */
export function createLiveCloud(url, key, { getSecret } = {}) {
  return createCloud({
    rpc: async (name, args) => realRpc(await getSupabaseClient(url, key), name, args),
    select: async (table, filterType, ...args) => realSelect(await getSupabaseClient(url, key), table, filterType, ...args),
    getSecret,
  });
}
