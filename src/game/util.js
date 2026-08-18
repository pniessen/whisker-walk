// Small pure helpers that used to sit at src/main.js module scope. They are
// shared by more than one of the extracted game modules, so they live here
// rather than travelling with any single one of them.

// wall-clock seconds, used to keep remote-pet interpolation/despawn timing
// consistent between the async net callbacks and the render loop
export const nowSec = () => performance.now() / 1000;

// petNames arrive over the network from other players' clients, which may
// not have enforced validPetName themselves — escape before interpolating
// into innerHTML (the summary card's "walked with" line).
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// volume factor for a remote meow/cluck event: full volume within earshot
// (<=8 units), fading linearly down to a quiet 0.2 floor by 40 units.
export function meowVolumeForDistance(dist) {
  if (dist <= 8) return 1;
  if (dist >= 40) return 0.2;
  return 1 - ((dist - 8) / (40 - 8)) * 0.8;
}

// Deterministic per-cat offset for seeded reply selection (catreplies.js's
// countsAsGreet/replyFor pool picks) — sum of char codes, no Math.random.
export function hashName(name) {
  let h = 0;
  for (const ch of String(name ?? '')) h += ch.charCodeAt(0);
  return h;
}
