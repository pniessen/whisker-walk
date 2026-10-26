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
//   | { kind: 'propose', from, area, dusk, seed, override }   someone pressed Start
//   | { kind: 'config', area, dusk }                         an old client asks me, the host, to start
//
// What a room member does with a lobby event, while sitting on the home base.
// Anyone's Start starts everyone (v21 Play together; this replaces Stream 2's
// host-answers rule, decisions.md "Host problem", so a host whose phone is
// asleep no longer strands the room):
//
//   * 'walk-config' from anyone else in the room is a start proposal with
//     their area, dusk and seed. rooms.js gathers proposals for
//     START_GATHER_MS (host) or MEMBER_GATHER_MS (member) and starts
//     pickRoomStart's winner, so two kids pressing
//     Start at once still land in the same world. `override` is true when I
//     haven't unlocked that area: the walk renders it without changing my save.
//     A config from someone not in the roster is spoofed or stale.
//   * 'walk-request' is what a member running the previous version sends. If I
//     am the host I still answer it, by proposing a start in THEIR area.
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
    if (!Number.isFinite(ev.seed)) return null;
    if (!roster.some((p) => p?.playerId === ev.id)) return null;
    const unlocked = Array.isArray(unlockedAreas) && unlockedAreas.includes(ev.area);
    return { kind: 'propose', from: ev.id, area: ev.area, dusk, seed: ev.seed, override: !unlocked };
  }
  if (ev.type === 'walk-request') {
    if (selfId !== hostId) return null;
    if (!roster.some((p) => p?.playerId === ev.id)) return null;
    return { kind: 'config', area: ev.area, dusk };
  }
  return null;
}

// How long a device waits after the first Start it sees before starting,
// collecting any other Start pressed at the same moment. The host's own
// proposal always wins on the host, so the host needs only enough time to hear
// a member's; a member waits longer, so a near-simultaneous host press that
// crosses a slow link (cellular, a phone waking a throttled socket) still
// arrives in time and both start the host's walk. Members used to wait up to
// 6 s for the host to answer, so 1.5 s is still quick.
export const START_GATHER_MS = 700;
export const MEMBER_GATHER_MS = 1500;

// A room member whose walk state I heard this recently is out on a walk.
// Walking devices broadcast state many times a second; home screens never do.
export const WALKING_FRESH_MS = 3000;

// walkersIn(lastStateAt, rosterIds, selfId, now) → ids of the others in the
// room heard walking within WALKING_FRESH_MS, in roster order. A Start beside
// a sister who is already walking would put us in two different worlds in one
// room, so rooms.js refuses it and says why. Total over garbage.
export function walkersIn(lastStateAt, rosterIds, selfId, now) {
  if (!lastStateAt || typeof lastStateAt !== 'object' || !Array.isArray(rosterIds)) return [];
  return rosterIds.filter((id) => {
    if (typeof id !== 'string' || id === selfId || !Object.hasOwn(lastStateAt, id)) return false;
    const t = lastStateAt[id];
    return Number.isFinite(t) && Number.isFinite(now) && now - t < WALKING_FRESH_MS;
  });
}

// pickRoomStart(proposals) → the proposal every device starts, or null.
//
// The one from the smallest player id wins. Every device in the room
// collects the same proposals during its gather window and so picks the same
// one. The smallest id is also the room's host (createNet sorts the roster),
// so when the host is one of the people pressing Start, it is still the
// host's walk. Entries without a non-empty string `from` are skipped.
export function pickRoomStart(proposals) {
  if (!Array.isArray(proposals)) return null;
  let best = null;
  for (const p of proposals) {
    if (!p || typeof p !== 'object' || typeof p.from !== 'string' || p.from === '') continue;
    if (best === null || p.from < best.from) best = p;
  }
  return best;
}
