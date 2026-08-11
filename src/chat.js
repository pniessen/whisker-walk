// Live co-walk chat: a curated catalog of phrases/emotes. Players broadcast a
// phrase ID (an enum), never free text — peers map the id to display text from
// this same catalog, so the chat channel can never carry arbitrary strings.

export const PHRASES = [
  { id: 'hi', text: 'Hi! 👋', kind: 'phrase' },
  { id: 'follow', text: 'Follow me!', kind: 'phrase' },
  { id: 'nice_cat', text: 'Nice cat! 😻', kind: 'phrase' },
  { id: 'play', text: 'Wanna play?', kind: 'phrase' },
  { id: 'here', text: 'Over here!', kind: 'phrase' },
  { id: 'good_walk', text: 'Good walk!', kind: 'phrase' },
  { id: 'brb', text: 'Brb 🐟', kind: 'phrase' },
  { id: 'boop', text: 'Boop? 👉👈', kind: 'phrase' },
  { id: 'zoomies', text: 'Zoomies!!', kind: 'phrase' },
  { id: 'bye', text: 'Bye! 👋', kind: 'phrase' },
  { id: 'love', text: '❤️', kind: 'emote' },
  { id: 'happy_cat', text: '😻', kind: 'emote' },
  { id: 'paw', text: '🐾', kind: 'emote' },
  { id: 'sparkle', text: '✨', kind: 'emote' },
  { id: 'fish', text: '🐟', kind: 'emote' },
  { id: 'laugh', text: '😹', kind: 'emote' },
];

const BY_ID = new Map(PHRASES.map((p) => [p.id, p]));

export function phraseById(id) {
  return (typeof id === 'string' && BY_ID.get(id)) || null;
}

export function isValidChatMsg(msg) {
  return (
    !!msg &&
    typeof msg === 'object' &&
    msg.v === 1 &&
    typeof msg.id === 'string' &&
    msg.id.length > 0 &&
    msg.id.length <= 64 && // playerIds are UUID-length (~36 chars); bounds the rate-limiter Map key
    typeof msg.phraseId === 'string' &&
    BY_ID.has(msg.phraseId)
  );
}

// Per-sender minimum interval. `allow(id)` returns false (and does NOT reset the
// clock) when called again inside perMs of that sender's last allowed call.
export function createChatRateLimiter({ perMs = 1200, now = () => Date.now() } = {}) {
  const last = new Map();
  return {
    allow(senderId) {
      const t = now();
      const prev = last.get(senderId);
      if (prev !== undefined && t - prev < perMs) return false;
      last.set(senderId, t);
      return true;
    },
  };
}

// Pure visibility filter (no side effects). Rate limiting is applied separately
// by the caller so this stays deterministic and re-checkable.
export function shouldShowIncomingChat(
  senderId,
  { hideChat = false, isMuted = () => false, isBlocked = () => false } = {},
) {
  if (hideChat) return false;
  if (isBlocked(senderId)) return false;
  if (isMuted(senderId)) return false;
  return true;
}
