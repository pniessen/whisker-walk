// Room-walk decisions for the shared colony (v21 Stream 2). Pure: no imports,
// no THREE, no DOM, so the rules can be pinned in test/lobby.test.js without
// a room, a network or a renderer.
//
// rosterIsPartnerOnly is the one question game/walk.js asks at walk start;
// decideLobbyEvent is what game/rooms.js does with a lobby event (Task 12).

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

// decideLobbyEvent(ev, { roster, selfId, inWalk, knownAreas, unlockedAreas })
//   → null
//   | { kind: 'start', area, dusk, seed, override }   start this walk now
//   | { kind: 'config', area, dusk }                  I'm host: start everyone
//
// What a room member does with a lobby event, while sitting on the home base
// (decisions.md, "Host problem"). Either sibling can press Start:
//
//   * 'walk-config' from the host (roster[0], since createNet sorts the
//     roster) starts my walk with the host's area, dusk and seed. `override`
//     is true when I haven't unlocked that area: the walk renders it without
//     changing my save. Anyone else's config is spoofed or stale.
//   * 'walk-request' from another member, when I am the host, is answered
//     with a config for THEIR area (the room then starts exactly as if I had
//     pressed Start myself). A non-host never answers, so two configs with
//     different seeds can't race.
//   * Never mid-walk: a stray or replayed event can't re-enter startWalk.
//   * Only a known area id: 'den', '__proto__' and the like are refused.
//     A config's seed must be a finite number, because startWalk reads a
//     missing roomSeed as a SOLO walk (colony cats, ghosts) inside a room.
//   * Total over garbage: anything malformed is null rather than a throw.
export function decideLobbyEvent(ev, { roster, selfId, inWalk, knownAreas, unlockedAreas } = {}) {
  if (!ev || typeof ev !== 'object' || inWalk) return null;
  if (typeof ev.id !== 'string' || ev.id === '' || ev.id === selfId) return null;
  if (!Array.isArray(roster) || !Array.isArray(knownAreas)) return null;
  if (typeof ev.area !== 'string' || !knownAreas.includes(ev.area)) return null;
  const hostId = roster[0]?.playerId;
  if (typeof hostId !== 'string') return null;
  const dusk = !!ev.dusk;

  if (ev.type === 'walk-config') {
    if (ev.id !== hostId || !Number.isFinite(ev.seed)) return null;
    const unlocked = Array.isArray(unlockedAreas) && unlockedAreas.includes(ev.area);
    return { kind: 'start', area: ev.area, dusk, seed: ev.seed, override: !unlocked };
  }
  if (ev.type === 'walk-request') {
    if (selfId !== hostId) return null;
    if (!roster.some((p) => p?.playerId === ev.id)) return null;
    return { kind: 'config', area: ev.area, dusk };
  }
  return null;
}
