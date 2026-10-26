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
import { decideLobbyEvent, pickRoomStart, walkersIn, START_GATHER_MS, MEMBER_GATHER_MS } from './lobby.js';

// v21 Stream 2, Task 12 — pair walks. The two siblings' room is 'P' + their
// colony id: 16 random hex characters the server mints and never publishes,
// so it can't be guessed, and nobody has to type it. A typed code is always
// TYPED_CODE (4 characters), so it can never name a pair room.
const COLONY_ROOM_ID = /^[0-9a-f]{16}$/;
const TYPED_CODE = /^[A-Z0-9]{4}$/;

// toast(text) is optional: main.js's cloud toast (textContent, never markup),
// used when a Start is refused because someone in the room is already walking.
// createTransport is optional and defaults to the Supabase transport; tests
// hand it net.js's createFakeHub endpoints.
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
  // A start being gathered (v21 Play together): { room, proposals, timer } or
  // null. Opened by my own Start or by the first proposal I hear; for
  // START_GATHER_MS every proposal is collected, then pickRoomStart's winner
  // starts. Dropped when any walk starts and whenever the room goes away
  // (leave, or endWalk's clear).
  let gathering = null;
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

  function clearGathering() {
    if (!gathering) return false;
    clearTimeout(gathering.timer);
    gathering = null;
    return true;
  }

  // Start this member's half of a room walk. An area I haven't unlocked is
  // rendered for this one walk via the override instead of being forced onto
  // my save; an unlocked one becomes my area, as it always has.
  function startRoomWalk({ area, dusk, seed }) {
    clearGathering();
    if (progression.isUnlocked('areas', area)) {
      progression.setArea(area);
      startWalk({ duskMode: dusk, roomSeed: seed });
    } else {
      startWalk({ duskMode: dusk, roomSeed: seed, areaOverride: area });
    }
  }

  // Collect `proposal`, opening the gather window if none is open. When the
  // window closes, every device in the room starts the same proposal.
  function gather(proposal) {
    if (gathering) {
      gathering.proposals.push(proposal);
      return;
    }
    const room = pendingRoom;
    const ms = room.net.isHost() ? START_GATHER_MS : MEMBER_GATHER_MS;
    gathering = {
      room,
      proposals: [proposal],
      timer: setTimeout(() => {
        const g = gathering;
        gathering = null;
        if (!g || getSession() || pendingRoom !== g.room) return;
        const winner = pickRoomStart(g.proposals);
        if (winner) startRoomWalk(winner);
        else notifyRoomChange();
      }, ms),
    };
    notifyRoomChange(); // "Starting…"
  }

  // The home base's Start in a room, from anyone in it (v21 Play together):
  // propose a walk in MY area with a fresh seed, and gather. A host whose phone
  // is asleep no longer strands the room. False (and nothing sent) when there
  // is no room, a walk is running, or a start is already being gathered: a
  // second press, or a press after someone else's Start was heard.
  function startRoomTogether({ area, dusk }) {
    if (!pendingRoom || gathering || getSession()) return false;
    const room = pendingRoom;
    // Someone in the room is already out walking: starting now would put us
    // in two different worlds in one room. Say so instead.
    const walkers = walkersIn(room.lastStateAt, room.roster.map((p) => p?.playerId), pid, Date.now());
    if (walkers.length) {
      const who = room.roster.find((p) => p?.playerId === walkers[0]);
      const name = who && typeof who.petName === 'string' && who.petName ? who.petName : 'Your friend';
      try { toast?.(`${name} is already on a walk! Wait till they come home, then press Start.`); } catch { /* a toast is never worth a crash */ }
      return false;
    }
    // The player id is mixed in so two presses in the same millisecond still
    // propose different seeds (only the winner's is ever used).
    const seed = (seedFromCode(room.code) ^ seedFromCode(pid) ^ Date.now()) >>> 0;
    const proposal = { from: pid, area, dusk: !!dusk, seed };
    // Gathering opens BEFORE the send: the fake hub delivers synchronously, and
    // a reply proposal must land in this window, not open a second one.
    gather(proposal);
    room.net.sendEvent({ v: 1, id: pid, type: 'walk-config', area, dusk: !!dusk, seed });
    // A host still running the previous version ignores a member's walk-config
    // but answers a walk-request with its own walk-config, which this member
    // then gathers (the host's id wins), so both share the host's world. A
    // current host is already gathering and ignores the request.
    if (!room.net.isHost()) room.net.sendEvent({ v: 1, id: pid, type: 'walk-request', area, dusk: !!dusk });
    return true;
  }

  // Every member is idle on the home base screen with this handler wired up
  // via setupRoomNet, so hearing someone's Start is what actually launches
  // their walk — there's no separate "join the walk" click. The rules (whose
  // proposal counts, and when) are lobby.js's decideLobbyEvent.
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
    if (d.kind === 'propose') gather({ from: d.from, area: d.area, dusk: d.dusk, seed: d.seed });
    // A previous-version member asks the host instead of proposing.
    else if (d.kind === 'config') startRoomTogether(d);
  }

  function setupRoomNet(net, code, pair = false) {
    // lastStateAt: playerId → when I last heard their walk state (they're out walking).
    pendingRoom = { net, code, roster: [], pair, lastStateAt: Object.create(null) };
    const room = pendingRoom;
    net.onState((st) => {
      if (pendingRoom === room && st && typeof st.id === 'string') room.lastStateAt[st.id] = Date.now();
    });
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
        pair: pendingRoom.pair, starting: !!gathering,
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
      clearGathering();
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
    // anyone's Start starts everyone.
    startRoomTogether,
    // endWalk's teardown: drop the room without awaiting the leave (the
    // caller still owns net.leave()), then tell the home base to re-render.
    clearPendingRoom() {
      pendingRoom = null;
      clearGathering();
      notifyRoomChange();
    },
  };
}
