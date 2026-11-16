// The home base's view of the online side (Player pets list, friend codes,
// the hide list), lifted out of main.js's init() on 2026-11-16 so the
// offline-first test (test/offlinefirst.test.js) drives the real thing.
//
// A thin adapter over the lazy cloud instance: homebase fetches friendships +
// profiles for its own async render without knowing about MP/getCloud.
// getCloud is cloudsync.js's GATED handle, and onlineAllowed its gate.

export function createHomebaseCloud({ MP, pid, getCloud, getPsecret, onlineAllowed, pushProfileNow, blockList }) {
  return {
    available: MP,
    myId: pid,
    fetchFriendships(id) {
      // Not put online yet (2026-11-16): a device with no profile has no
      // friend links, so the list is empty without asking the database.
      if (!onlineAllowed()) return Promise.resolve([]);
      const cloud = getCloud();
      return cloud ? cloud.fetchFriendships(id) : Promise.reject(new Error('cloud unavailable'));
    },
    fetchProfiles(ids) {
      const cloud = getCloud();
      return cloud ? cloud.fetchProfiles(ids) : Promise.reject(new Error('cloud unavailable'));
    },
    // Friend codes (Task 4): homebase never sees psecret directly — it
    // passes back only the raw prefix (findByFriendCode) or the resolved
    // other-player id (addFriendByCode), same "thin adapter" boundary Task
    // 3 established for fetchFriendships/fetchProfiles above.
    findByFriendCode(prefix) {
      const cloud = getCloud();
      return cloud ? cloud.findByFriendCode(prefix) : Promise.reject(new Error('cloud unavailable'));
    },
    addFriendByCode(otherId) {
      const cloud = getCloud();
      if (!cloud) return Promise.reject(new Error('cloud unavailable'));
      // record_friend_greet (called inside cloud.addFriendByCode) validates
      // the CALLER's own profile row/secret — a player who only just typed
      // their pet name (never hosted/joined a room or finished a walk) has
      // no profile row on the server yet, which would otherwise make every
      // friend-code add fail with a denied (-1). Push it first — awaited,
      // not fire-and-forget, so the row genuinely exists before the RPC
      // that needs it — and let cloud.addFriendByCode's own 'failed' status
      // (see below) surface anything that still goes wrong.
      return Promise.resolve(pushProfileNow()).then(() => cloud.addFriendByCode(pid, getPsecret(), otherId));
    },
    // Unilateral-friendship mitigation (final fix wave, Task 3): record_friend_greet
    // doesn't validate p_other_id, so any client can drive greets against a
    // victim who never agreed to anything — those surface as ghosts
    // (spawnGhosts) and Player pets roster rows. This is a client-side,
    // per-device "stop showing me this visitor" list, not a server-side fix
    // (see docs/superpowers/specs/2026-08-01-whisker-walk-v7-online.md's
    // "Known limitation" note) — homebase's roster Hide button and spawnGhosts
    // both consult it.
    isBlocked(otherId) {
      return blockList.has(otherId);
    },
    blockPlayer(otherId) {
      blockList.add(otherId);
    },
    // Player pets' "Show again": hiding is never for good.
    unblockPlayer(otherId) {
      blockList.remove(otherId);
    },
    blockedPlayers() {
      return blockList.all();
    },
  };
}
