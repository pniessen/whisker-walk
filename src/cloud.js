// Cloud RPC client for Whisker Walk's "always online" save sync, pet
// profiles, and cross-walk friendships.
//
// The client/server contract is FIXED and already live — see
// docs/supabase-setup.sql for the `saves`/`profiles`/`friendships` tables
// and the `upsert_save`/`load_save`/`upsert_profile`/`record_friend_greet`
// RPCs. Every RPC arg name below (the `p_`-prefixed keys) must match that
// SQL exactly.
//
// createCloud({rpc, select}) takes injectable adapters so unit tests can
// exercise the arg-mapping/result-passthrough logic with fakes, with no
// network and no @supabase/supabase-js import. createLiveCloud(url, key)
// wires up the real adapters against the shared Supabase client from
// net.js (see getSupabaseClient there).

import { getSupabaseClient } from './net.js';

// 256-word safe list for save codes: short (4-6 letter), friendly
// nouns/animals/colors. No offensive or ambiguous words. ~30.6 bits of
// entropy across 3 words + a 2-digit suffix (256^3 * 100 ≈ 2^30.6).
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

/** generateSaveCode(rng?) -> "PLUM-OTTER-CROW-42" style: 3 wordlist picks + 2 digits. */
export function generateSaveCode(rng = Math.random) {
  const pick = () => WORDLIST[Math.floor(rng() * WORDLIST.length)];
  const digits = Math.floor(rng() * 100).toString().padStart(2, '0');
  return `${pick()}-${pick()}-${pick()}-${digits}`;
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

/**
 * createCloud({rpc, select}) -> cloud
 *
 * `rpc(name, args) -> Promise<data>` and `select(table, filterType, ...args)
 * -> Promise<rows>` are injectable: fakes in tests, real adapters (below)
 * wrapping the Supabase client in production. Both are expected to already
 * unwrap `{data, error}` and throw on error — createCloud itself does no
 * error handling, just arg mapping and result passthrough.
 */
export function createCloud({ rpc, select }) {
  async function saveToCloud(code, secret, payload, lifetime) {
    return rpc('upsert_save', { p_code: code, p_secret: secret, p_payload: payload, p_lifetime: lifetime });
  }

  // load_save's p_secret param is accepted but not verified server-side —
  // the SQL comment is explicit that the code alone grants read access on a
  // new device, so there is nothing meaningful to pass here.
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
    return select('profiles', 'in', 'player_id', playerIds);
  }

  async function findByFriendCode(prefix) {
    return select('profiles', 'like', 'player_id', prefix + '%');
  }

  async function fetchFriendships(myId) {
    return select('friendships', 'or', `a_id.eq.${myId},b_id.eq.${myId}`);
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

  return {
    saveToCloud, loadFromCloud, pushProfile, recordGreet, fetchProfiles, findByFriendCode, fetchFriendships,
    addFriendByCode,
  };
}

async function realRpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

// The anon grant on profiles is column-scoped (docs/supabase-setup.sql
// revokes all then grants back this exact column list — `secret` is
// deliberately excluded); select('*') gets a permission-denied error. The
// friendships grant is table-wide, so '*' is fine there.
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
 * createLiveCloud(url, key) — real createCloud() wired to the shared
 * Supabase client (getSupabaseClient in net.js), so the RPC client and the
 * realtime co-walk transport reuse one connection instead of each creating
 * their own.
 */
export function createLiveCloud(url, key) {
  return createCloud({
    rpc: async (name, args) => realRpc(await getSupabaseClient(url, key), name, args),
    select: async (table, filterType, ...args) => realSelect(await getSupabaseClient(url, key), table, filterType, ...args),
  });
}
