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

import { rankFor } from '../progression.js';
import { createNet, createSupabaseTransport, generateRoomCode } from '../net.js';

export function createRooms({
  MP, pid, supabaseUrl, supabaseAnonKey,
  progression, getCloud, getPsecret, getSession, startWalk,
}) {
  // Room state lives OUTSIDE the walk session — a room can be formed on the
  // home base screen (host/join) before anyone has clicked Start, and
  // survives across walks only until endWalk explicitly leaves it.
  let pendingRoom = null; // { net, code, roster }
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

  // The host broadcasts walk-config once (on Start); every other member of
  // the room is idle on the home base screen with this handler wired up via
  // setupRoomNet, so receiving it is what actually launches their walk —
  // there's no separate "join the walk" click.
  function handleLobbyEvent(ev) {
    if (!pendingRoom || ev.type !== 'walk-config') return;
    if (getSession()) return; // already mid-walk — a stray/duplicate/replayed walk-config can't re-enter startWalk
    // only the host may launch the room's walk — roster is sorted by
    // createNet, so the smallest playerId (roster[0]) is always the host;
    // anyone else's walk-config is either spoofed or stale and must be
    // ignored rather than hijacking every member's walk.
    if (ev.id !== pendingRoom.roster[0]?.playerId) return;
    if (progression.isUnlocked('areas', ev.area)) {
      progression.setArea(ev.area);
      startWalk({ duskMode: ev.dusk, roomSeed: ev.seed });
    } else {
      // don't force an unlocked-area change onto their save — just render
      // the host's area for this one walk via the override.
      startWalk({ duskMode: ev.dusk, roomSeed: ev.seed, areaOverride: ev.area });
    }
  }

  function setupRoomNet(net, code) {
    pendingRoom = { net, code, roster: [] };
    net.onRoster((roster) => {
      if (!pendingRoom) return; // left/torn down between the send and this callback
      pendingRoom.roster = roster;
      notifyRoomChange();
    });
    net.onEvent(handleLobbyEvent);
  }

  const rooms = {
    available: MP,
    getState() {
      if (!pendingRoom) return null;
      return { code: pendingRoom.code, roster: pendingRoom.roster, isHost: pendingRoom.net.isHost() };
    },
    async host() {
      if (!MP || pendingRoom || roomOpInFlight) return { ok: false };
      roomOpInFlight = true;
      const code = generateRoomCode();
      const net = createNet(createSupabaseTransport(
        supabaseUrl,
        supabaseAnonKey
      ));
      try {
        await net.join(code, roomProfile());
      } catch (err) {
        console.warn('Whisker Walk: failed to host a room', err);
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
      setupRoomNet(net, code);
      roomOpInFlight = false;
      notifyRoomChange();
      pushProfileNow(); // fire-and-forget — the room roster already carries petName/breed live
      return { ok: true, code };
    },
    async join(code) {
      if (!MP || pendingRoom || roomOpInFlight) return { ok: false };
      roomOpInFlight = true;
      const net = createNet(createSupabaseTransport(
        supabaseUrl,
        supabaseAnonKey
      ));
      try {
        await net.join(code, roomProfile());
      } catch (err) {
        console.warn('Whisker Walk: failed to join room', err);
        roomOpInFlight = false;
        return { ok: false };
      }
      if (pendingRoom) {
        roomOpInFlight = false;
        await net.leave().catch(() => {});
        return { ok: false };
      }
      setupRoomNet(net, code);
      roomOpInFlight = false;
      notifyRoomChange();
      pushProfileNow(); // fire-and-forget — same as host() above
      return { ok: true, code };
    },
    async leave() {
      if (!pendingRoom) return;
      const net = pendingRoom.net;
      pendingRoom = null;
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
    // endWalk's teardown: drop the room without awaiting the leave (the
    // caller still owns net.leave()), then tell the home base to re-render.
    clearPendingRoom() {
      pendingRoom = null;
      notifyRoomChange();
    },
  };
}
