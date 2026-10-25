// Room-walk decisions for the shared colony (v21 Stream 2). Pure: no imports,
// no THREE, no DOM, so the rules can be pinned in test/lobby.test.js without
// a room, a network or a renderer.
//
// Task 12 adds decideLobbyEvent here; for now it holds the one question
// game/walk.js asks at walk start.

// rosterIsPartnerOnly(rosterIds, selfId, partnerId) → boolean.
//
// Is everybody else in this room my colony partner? Colony cats replace
// ordinary strays at fixed spots, so they may only spawn in a room walk where
// nobody would see a different world from mine because of them
// (decisions.md, "Live co-walk"). A room with anyone who is not my partner
// gets the ordinary strays, exactly as before the colony existed.
//
//   * Every id other than `selfId` must equal `partnerId`.
//   * Nobody else in the room (an empty other-roster) is true: there is no
//     one to disagree with.
//   * With somebody else present, a missing or empty partnerId is false: I
//     have no partner, so whoever it is, they are not it.
//   * Total over garbage: a non-array roster or a non-string id reads as
//     "not partner-only" rather than throwing.
export function rosterIsPartnerOnly(rosterIds, selfId, partnerId) {
  if (!Array.isArray(rosterIds)) return false;
  const others = rosterIds.filter((id) => id !== selfId);
  if (others.length === 0) return true;
  if (typeof partnerId !== 'string' || partnerId === '') return false;
  return others.every((id) => id === partnerId);
}
