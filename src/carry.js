// =============================================================================
// The mouth — carry rules (v21 Stream 3b). Pure: no THREE, no DOM, no storage.
//
// A cat holds ONE thing at a time. Carrying is the stream's one required verb,
// and it pays nothing and records no feat: it only leaves traces. At the end of
// a walk, whatever is still held goes to the den as a keepsake, and anything the
// cat set down somewhere new (at least MOVED_MIN from where it started) leaves a
// private 'drop' mark in the area. The caller turns the result into marks via
// progression.js; this module only says which marks.
//
// Rain: carrying in falling rain loosens the grip. After RAIN_GRIP seconds of
// it the item slips (tickRain returns true once; the caller drops it). Dry
// spells do not reset the grip, so a cat dashing between shelters still loses
// the item eventually. Funny, recoverable, never a penalty.
// =============================================================================

export const RAIN_GRIP = 6; // seconds of carrying in falling rain before the item slips
export const MOVED_MIN = 1.5; // metres an item must move from its home to count as left somewhere

export function createMouth() {
  return { held: null, grip: 0, dropped: new Map() };
}

// pick(mouth, item) → true when the item is now held. Refuses (false) when the
// mouth is already full. Picking an item up again cancels its pending drop.
export function pick(mouth, item) {
  if (mouth.held) return false;
  if (!item || typeof item.id !== 'string') return false;
  mouth.held = { id: item.id, kind: item.kind };
  mouth.grip = 0;
  mouth.dropped.delete(item.id);
  return true;
}

// drop(mouth, x, z, home) → the {id, kind} that was released, or null when
// nothing was held. `home` is {x, z}, where the item started; without one the
// item counts as unmoved.
export function drop(mouth, x, z, home) {
  const item = mouth.held;
  if (!item) return null;
  const homeX = Number.isFinite(home?.x) ? home.x : x;
  const homeZ = Number.isFinite(home?.z) ? home.z : z;
  mouth.dropped.set(item.id, { kind: item.kind, x, z, homeX, homeZ });
  mouth.held = null;
  mouth.grip = 0;
  return { id: item.id, kind: item.kind };
}

// tickRain(mouth, dt, raining) → true exactly once, on the tick the grip
// reaches RAIN_GRIP. Only a held item in falling rain loosens it.
export function tickRain(mouth, dt, raining) {
  if (!mouth.held || !raining) return false;
  if (!(dt > 0)) return false;
  const before = mouth.grip;
  mouth.grip = Math.min(RAIN_GRIP, before + dt);
  return before < RAIN_GRIP && mouth.grip >= RAIN_GRIP;
}

// walkEndMarks(mouth, area, now) → [{ area, mark }]. A held item becomes a
// 'den' mark (target area 'den', at the den's origin); each dropped item that
// moved at least MOVED_MIN from its home becomes a 'drop' mark in `area`.
export function walkEndMarks(mouth, area, now) {
  const out = [];
  if (mouth.held) {
    out.push({
      area: 'den',
      mark: { kind: 'den', id: mouth.held.id, x: 0, z: 0, at: now, contested: false, item: mouth.held.kind },
    });
  }
  for (const [id, d] of mouth.dropped) {
    if (Math.hypot(d.x - d.homeX, d.z - d.homeZ) < MOVED_MIN) continue;
    out.push({
      area,
      mark: { kind: 'drop', id, x: d.x, z: d.z, at: now, contested: false, item: d.kind },
    });
  }
  return out;
}
