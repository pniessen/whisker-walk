// Co-walk room lobby + the public profile push, lifted out of main.js's
// init() closure.
//
// `pendingRoom` deliberately lives OUTSIDE the walk session (a room is formed
// on the home base screen, before anyone has clicked Start), so this module
// owns it and hands the walk lifecycle two narrow accessors: getPendingRoom()
// to read it at Start, and clearPendingRoom() for endWalk's "rooms are
// per-walk" teardown — which is exactly the `pendingRoom = null;
// notifyRoomChange();` pair endWalk always ran.
//
// startWalk is injected as a thunk because the walk lifecycle is built after
// this module (it needs getPendingRoom from here); nothing calls into it
// before init() has finished wiring both.

import { rankFor, CATALOG } from '../progression.js';
import { createNet, createSupabaseTransport, generateRoomCode } from '../net.js';
import { seedFromCode } from '../rng.js';
import { decideLobbyEvent } from './lobby.js';

// v21 Stream 2, Task 12 — pair walks. The two siblings' room is 'P' + their
// colony id: 16 random hex characters the server mints and never publishes,
// so it can't be guessed, and nobody has to type it. A typed code is always
// TYPED_CODE (4 characters), so it can never name a pair room.
const COLONY_ROOM_ID = /^[0-9a-f]{16}$/;
const TYPED_CODE = /^[A-Z0-9]{4}$/;
// How long a member's Start waits for the host's walk-config before saying so.
export const WALK_REQUEST_WAIT_MS = 6000;

// toast(text) is optional: main.js's cloud toast (textContent, never markup),
// used for "… didn't answer". createTransport is optional too and defaults
// to the Supabase transport; tests hand it net.js's createFakeHub endpoints.
export function createRooms({
  MP, pid, supabaseUrl, supabaseAnonKey,
  progression, getCloud, getPsecret, getSession, startWalk,
  // v21 Stream 2: game/colonysync.js. Optional; walkWithPartner fires
  // colonySync.pull() on join and reads its status().
  colonySync,
  toast,
  createTransport = () => createSupabaseTransport(supabaseUrl, supabaseAnonKey),
}) {
  // Room state lives OUTSIDE the walk session — a room can be formed on the
  // home base screen (host/join) before anyone has clicked Start, and
  // survives across walks only until endWalk explicitly leaves it.
  let pendingRoom = null; // { net, code, roster, pair }
  // A member's Start that is waiting for the host's answer (Task 12):
  // { timer, room } or null. At most one at a time; dropped when any walk
  // starts and whenever the room goes away (leave, or endWalk's clear).
  let walkRequest = null;
  // host()/join() both check `pendingRoom` before doing anything async, but
  // pendingRoom itself is only set AFTER the await — a double-click (or
  // host+join fired back to back) would pass that guard twice and open two
  // concurrent room connections, with the loser's net silently orphaned.
  // This flag closes that window: it's set synchronously before the first
  // await, so a concurrent call sees it immediately, not just eventually.
  let roomOpInFlight = false;
  const roomChangeHandlers = [];
  function notifyRoomChange() {
    for (const fn of roomChangeHandlers) fn();
  }

  function roomProfile() {
    const st = progression.state;
    return {
      playerId: pid,
      petName: st.petName,
      breed: st.equipped.cat,
      accessories: {
        collar: st.equipped.collar,
        head: st.equipped.head,
        face: st.equipped.face,
        neck: st.equipped.neck,
        body: st.equipped.body,
        back: st.equipped.back,
        feet: st.equipped.feet,
      },
    };
  }

  // Cloud profile push (Task 3): publishes what's currently equipped under
  // this device's playerId/secret. Guarded on MP and on having a pet name —
  // an unnamed pet was never walk-together-visible either, so there's
  // nothing meaningful to publish yet. Fire-and-forget with a console-only
  // catch, same pattern as sync.autoSync: profile visibility lagging by one
  // push is fine, but it must never block or throw into a caller.
  // Returns the push's promise (resolved even on failure, since the catch
  // below handles it) rather than nothing — most callers still fire-and-forget
  // it, but homebaseCloud.addFriendByCode below awaits it so a just-named
  // pet's profile row exists before the friend-code flow's recordGreet call.
  function pushProfileNow() {
    if (!MP) return Promise.resolve();
    const st = progression.state;
    if (!st.petName) return Promise.resolve();
    const cloud = getCloud();
    if (!cloud) return Promise.resolve();
    return cloud.pushProfile({
      playerId: pid,
      secret: getPsecret(),
      petName: st.petName,
      breed: st.equipped.cat,
      accessories: {
        collar: st.equipped.collar,
        head: st.equipped.head,
        face: st.equipped.face,
        neck: st.equipped.neck,
        body: st.equipped.body,
        back: st.equipped.back,
        feet: st.equipped.feet,
      },
      rankTitle: rankFor(st.lifetimePoints).title,
    }).catch((err) => console.warn('Whisker Walk: pushProfile failed', err));
  }

  function clearWalkRequest() {
    if (!walkRequest) return false;
    clearTimeout(walkRequest.timer);
    walkRequest = null;
    return true;
  }

  // Start this member's half of a room walk. An area I haven't unlocked is
  // rendered for this one walk via the override instead of being forced onto
  // my save; an unlocked one becomes my area, as it always has.
  function startRoomWalk({ area, dusk, seed }) {
    clearWalkRequest();
    if (progression.isUnlocked('areas', area)) {
      progression.setArea(area);
      startWalk({ duskMode: dusk, roomSeed: seed });
    } else {
      startWalk({ duskMode: dusk, roomSeed: seed, areaOverride: area });
    }
  }

  // The host's Start, whether pressed here or asked for by a member's
  // walk-request: one fresh seed, carried to everyone (the host included) by
  // a single walk-config, so every member's world is the same.
  function hostRoomWalk({ area, dusk }) {
    if (!pendingRoom || getSession() || !pendingRoom.net.isHost()) return false;
    const seed = (seedFromCode(pendingRoom.code) ^ Date.now()) >>> 0;
    pendingRoom.net.sendEvent({ v: 1, id: pid, type: 'walk-config', area, dusk: !!dusk, seed });
    startRoomWalk({ area, dusk: !!dusk, seed });
    return true;
  }

  // A member's Start (decisions.md, "Host problem"): ask the host for a walk
  // in MY area. Never starts anything locally — a member walking alone would
  // see a different world from the room it's still in. The home base shows
  // "Starting…" (getState().starting) until the host's walk-config arrives,
  // or for WALK_REQUEST_WAIT_MS, after which it says plainly that nobody
  // answered. A second press while waiting is a no-op (false).
  function requestRoomWalk({ area, dusk }) {
    if (!pendingRoom || walkRequest || getSession() || pendingRoom.net.isHost()) return false;
    const room = pendingRoom;
    // Armed BEFORE the send: an answer can arrive inside sendEvent (the fake
    // hub delivers synchronously), and the walk it starts must find this to
    // clear, not be followed by a stale "Starting…".
    walkRequest = {
      room,
      timer: setTimeout(() => {
        walkRequest = null;
        if (getSession() || pendingRoom !== room) return;
        const partner = room.pair ? progression.state.colony?.partner : null;
        const who = partner && partner.petName ? String(partner.petName) : 'They';
        try { toast?.(`${who} didn't answer — are they on the home screen?`); } catch { /* a toast is never worth a crash */ }
        notifyRoomChange();
      }, WALK_REQUEST_WAIT_MS),
    };
    room.net.sendEvent({ v: 1, id: pid, type: 'walk-request', area, dusk: !!dusk });
    notifyRoomChange();
    return true;
  }

  // Every member is idle on the home base screen with this handler wired up
  // via setupRoomNet, so receiving the host's walk-config is what actually
  // launches their walk — there's no separate "join the walk" click. The
  // rules (who may start whom, and when) are lobby.js's decideLobbyEvent.
  function handleLobbyEvent(ev) {
    if (!pendingRoom) return;
    const d = decideLobbyEvent(ev, {
      roster: pendingRoom.roster,
      selfId: pid,
      inWalk: !!getSession(),
      knownAreas: Object.keys(CATALOG.areas),
      unlockedAreas: progression.state.unlocked.areas,
    });
    if (!d) return;
    if (d.kind === 'start') startRoomWalk(d);
    else if (d.kind === 'config') hostRoomWalk(d);
  }

  function setupRoomNet(net, code, pair = false) {
    pendingRoom = { net, code, roster: [], pair };
    net.onRoster((roster) => {
      if (!pendingRoom) return; // left/torn down between the send and this callback
      pendingRoom.roster = roster;
      notifyRoomChange();
    });
    net.onEvent(handleLobbyEvent);
  }

  // host() mints a code; join(code) and walkWithPartner() join a known one.
  // Both of those end here.
  async function joinRoom(code, pair) {
    roomOpInFlight = true;
    const net = createNet(createTransport());
    try {
      await net.join(code, roomProfile());
    } catch (err) {
      console.warn('Whisker Walk: failed to join room', err);
      roomOpInFlight = false;
      return { ok: false };
    }
    // defensive: shouldn't be reachable given the flag above, but if some
    // other path claimed pendingRoom while we awaited, don't clobber it —
    // leave the room we just joined instead of leaking it.
    if (pendingRoom) {
      roomOpInFlight = false;
      await net.leave().catch(() => {});
      return { ok: false };
    }
    setupRoomNet(net, code, pair);
    roomOpInFlight = false;
    notifyRoomChange();
    pushProfileNow(); // fire-and-forget — the room roster already carries petName/breed live
    return { ok: true, code };
  }

  const rooms = {
    available: MP,
    getState() {
      if (!pendingRoom) return null;
      return {
        code: pendingRoom.code, roster: pendingRoom.roster, isHost: pendingRoom.net.isHost(),
        pair: pendingRoom.pair, starting: !!walkRequest,
      };
    },
    async host() {
      if (!MP || pendingRoom || roomOpInFlight) return { ok: false };
      roomOpInFlight = true;
      const code = generateRoomCode();
      const net = createNet(createTransport());
      try {
        await net.join(code, roomProfile());
      } catch (err) {
        console.warn('Whisker Walk: failed to host a room', err);
        roomOpInFlight = false;
        return { ok: false };
      }
      // defensive: see joinRoom.
      if (pendingRoom) {
        roomOpInFlight = false;
        await net.leave().catch(() => {});
        return { ok: false };
      }
      setupRoomNet(net, code);
      roomOpInFlight = false;
      notifyRoomChange();
      pushProfileNow(); // fire-and-forget — the room roster already carries petName/breed live
      return { ok: true, code };
    },
    // A typed code. Only the 4-character shape a code room has is accepted,
    // so nothing typed can ever reach a pair room ('P' + 16 hex).
    async join(code) {
      if (!MP || pendingRoom || roomOpInFlight) return { ok: false };
      if (typeof code !== 'string' || !TYPED_CODE.test(code)) return { ok: false };
      return joinRoom(code, false);
    },
    // The siblings' own room: no code, nothing typed. Only while paired, and
    // only with a colony id of the shape the server mints. The colony is read
    // at join (fire-and-forget: colonySync.pull never rejects, and a slow
    // pull must never hold up the room).
    async walkWithPartner() {
      if (!MP || pendingRoom || roomOpInFlight) return { ok: false };
      if (colonySync?.status().mode !== 'paired') return { ok: false };
      const id = progression.state.colony?.id;
      if (typeof id !== 'string' || !COLONY_ROOM_ID.test(id)) return { ok: false };
      const res = await joinRoom('P' + id, true);
      if (res.ok) colonySync.pull();
      return { ok: res.ok };
    },
    async leave() {
      if (!pendingRoom) return;
      const net = pendingRoom.net;
      pendingRoom = null;
      clearWalkRequest();
      notifyRoomChange();
      await net.leave();
    },
    onChange(fn) {
      roomChangeHandlers.push(fn);
    },
  };

  return {
    rooms, roomProfile, pushProfileNow, notifyRoomChange,
    getPendingRoom: () => pendingRoom,
    // The home base's Start in a room (game/walk.js's beginWalkFromHomebase):
    // the host starts everyone, a member asks the host.
    hostRoomWalk, requestRoomWalk,
    // endWalk's teardown: drop the room without awaiting the leave (the
    // caller still owns net.leave()), then tell the home base to re-render.
    clearPendingRoom() {
      pendingRoom = null;
      clearWalkRequest();
      notifyRoomChange();
    },
  };
}
