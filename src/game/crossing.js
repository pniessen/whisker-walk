// The crossing card: a border post's or a gate's "Head to ...?" question.
// Opens over the pause overlay (the walk is paused like ⏸), and either walks
// her straight on (walk.js walkOn) or puts the pause card back. Pure wiring;
// the words live in bordercross.js and gatecross.js. In a room with a member
// on an older build a crossing still ends the walk: the host tells the room
// before it ends, and a guest follows the host's event (onRemote).
//
// World map step 3: a gate's card (askGate) and, since Task 10, a post's
// (ask) ask the same question, and one yes path serves both. A
// gate to a place she can open but has not yet asks first through the usual
// "Get it?" card (askGateBuy, buyYes): never spent by accident, and its yes
// opens the place and puts the gate's card up. The words live in gatecross.js.
// s.crossing is this module's: it sets it, and clears it on every answer,
// including a walk-on that walk.js refused or could not load.
//
// Task 9, a room walks on together, and both devices have the place before
// anyone moves. The host's yes shows the "Off to ..." moment, asks the room
// (walk-on-ask, sent twice) and fetches the place itself; each guest fetches
// it and answers (walk-on-have, sent twice). Once the host has the place and
// every friend still in the room has said yes, it sends walk-on (twice, the
// room's next seed) and walks on; the guests follow it (onRemoteWalkOn), so
// every device builds the same next walk. A no, its own failure, or no full
// answer within WALK_ON_WAIT_MS puts its pause card back with a line, and
// nobody moves. A room with a member on an older build (no walkOn in its
// room profile) crosses as at a border post: the walk ends, the room closes.

import { CATALOG } from '../progression.js';
import { carryLabel } from '../carry.js';
import { crossCardHtml, crossExtras, decideBorderCross, targetName, lower } from '../bordercross.js';
import {
  gateStatus, gateCardHtml, gateBuyHtml, gateMomentHtml, nextRoomSeed, roomWalksOn,
  decideWalkOn, decideWalkOnAsk, decideWalkOnHave, decideGateCross, decideHostThere,
} from '../gatecross.js';
import { safeRemoteName } from '../net.js';
import { AREA_LOAD_TIMEOUT_MS } from './areaload.js';
import { endById } from '../gateways.js';
import { deliberateTap } from '../ui/confirmcard.js';
import { phrase } from '../clanphrases.js';
import { pauseCardFor } from './walk.js';

export const CROSS_RESEND_MS = 150;
export const CROSS_END_MS = 400;
export const LED_DELAY_MS = 1500;
// How long a room's host waits for every friend to have the place: a little
// longer than one place load may take.
export const WALK_ON_WAIT_MS = AREA_LOAD_TIMEOUT_MS + 1000;
// How long a guest who said yes watches for the host's state from the new
// place (ruling R15): the host sends none until it plays there, and it may
// sit on that walk's Ready? card a while.
export const WALK_ON_FOLLOW_MS = 60000;
// A guest takes an ask heard again this soon for the host's resend.
const ASK_SAME_MS = 1000;
// The most answers the host keeps for one ask (each friend sends two).
const MAX_HAVES = 32;

// swallowsCanvasClick(session) -> true while a room host's confirmed crossing
// is on its way out (the CROSS_END_MS "Off we go!" pause), and while a walk-on
// waits for its place (walk.js session.walkingOn: the "Off to ..." moment over
// a live, paused walk). main.js stops a game-canvas click then, so it cannot
// re-lock the pointer for a walk that is about to end.
export function swallowsCanvasClick(s) {
  return !!s?.crossing?.going || !!s?.walkingOn;
}

export function createCrossing({
  getSession, overlay, hud, releaseControl, resumeWalk, endWalk, getIsTouch, getEdition,
  getSound = () => null, catalog = CATALOG, setTimeout = globalThis.setTimeout,
  // F6: the place over the border is its own download. A yes (or the host's
  // lead) starts fetching it at once, so it is likely here by the time the
  // summary's Continue starts the walk there. main.js passes the area
  // loader's prefetch, which never throws.
  prefetchArea = () => {},
  // World map step 3: the one way through a gate (walk.js walkOn, a Promise of
  // 'walked' | 'refused' | 'failed' | 'dropped'), the save a gate opens a
  // place on, and the clock the "Get it?" card's delay reads.
  walkOn = () => Promise.resolve('refused'),
  progression = null,
  now = () => Date.now(),
  // Task 9: the pending room's roster (every member's room profile, her own
  // included) and its net, the one place load a room's walk-on waits for
  // (main.js passes the area loader's ensure), and whether the device is
  // online (which line a failed load says).
  getRoster = () => [],
  getRoomNet = () => null,
  ensureArea = () => Promise.resolve(),
  isOnline = () => globalThis.navigator?.onLine !== false,
}) {
  function restoreCard(s) {
    overlay.innerHTML = pauseCardFor(s, getIsTouch(), getSound());
    s.crossing = null;
  }

  // Who may open a card now: no card up, no fight, no walk-on waiting for its
  // place, and solo or a room's host (a guest reads the sign only).
  function mayAsk(s) {
    if (s.crossing || s.fight || s.clanFight?.uiShowing || s.walkingOn) return false;
    return !(s.net && !s.net.isHost?.());
  }

  function extrasFor(s) {
    const held = s.carry?.mouth?.held;
    return crossExtras({
      raceRunning: s.race?.state === 'running',
      questActive: s.quest?.state === 'active',
      carried: held ? carryLabel(held.kind) : null,
      buddyName: s.clanBuddy?.name ?? null,
      together: s.net ? (s.remotes?.list ?? []).map((r) => r.petName) : [],
    });
  }

  // Ruling R16: the card says what its yes will do, decided once, when it
  // goes up. In a room with a member on an older build (the roster cannot
  // walk on) the crossing ends the walk, as posts always did, and the card
  // says so ("Your trip ends here"); anywhere else she walks on. confirmGate
  // reads s.crossing.endsHere, never the roster again, so the card and what
  // happens always agree.
  function showCrossing(s, { to, name, via, kind }) {
    const endsHere = !!s.net && !roomWalksOn(getRoster());
    s.crossing = { to, name, via, kind, endsHere };
    overlay.innerHTML = (endsHere ? crossCardHtml : gateCardHtml)({ name, extras: extrasFor(s) });
    releaseControl();
  }

  // A border post she can go through now (Task 10): the gate's card and the
  // gate's yes. Asking starts fetching the place beyond, as at a gate.
  function ask(s, data) {
    if (!s || !data || !data.post || !data.status || data.status.kind !== 'go') return;
    if (!mayAsk(s)) return; // only a room's host crosses
    const { to, name } = data.status;
    prefetchArea(to);
    showCrossing(s, { to, name, via: data.post.id, kind: 'post' });
  }

  // A gate she can go through now: the crossing card, whose yes walks on.
  function askGate(s, data) {
    if (!s || !data || !data.end || data.status?.kind !== 'go') return;
    if (!mayAsk(s)) return;
    const { to, name } = data.status;
    prefetchArea(to);
    showCrossing(s, { to, name, via: data.end.id, kind: 'gate' });
  }

  // A gate to a place she can open now: the usual "Get it?" card first.
  function askGateBuy(s, data) {
    if (!s || !data || !data.end || data.status?.kind !== 'buy') return;
    if (!mayAsk(s)) return;
    const { to, name, price } = data.status;
    prefetchArea(to);
    s.crossing = { to, name, via: data.end.id, kind: 'gate', asking: 'buy', shownAt: now() };
    overlay.innerHTML = gateBuyHtml({ name, price, points: progression?.state?.points ?? 0 });
    // The safe answer takes focus, so an Enter reaches "Not now".
    try { overlay.querySelector?.('#confirm-card-no')?.focus?.({ preventScroll: true }); } catch { /* a nicety */ }
    releaseControl();
  }

  // The "Get it?" card's yes: only a deliberate tap (never the tail of a
  // double-tap, never within CONFIRM_DELAY_MS of the card going up), only
  // while that card is up. Bought: the gate swings open and its crossing card
  // follows. Refused: the pause card comes back and the walk goes on.
  function buyYes(e) {
    const s = getSession();
    const c = s?.crossing;
    if (!c || c.kind !== 'gate' || c.asking !== 'buy' || c.going) return;
    if (s.net && !s.net.isHost?.()) return;
    if (!deliberateTap({ detail: e?.detail, shownAt: c.shownAt, now: now() })) return;
    const end = endById(c.via)?.end ?? null;
    if (!end || !progression?.buy('areas', c.to)) {
      restoreCard(s);
      resumeWalk();
      return;
    }
    s.gates?.setOpen?.(c.via, true);
    s.crossing = null;
    askGate(s, { end, status: gateStatus(end, progression.state, catalog) });
    if (!s.crossing) { restoreCard(s); resumeWalk(); }
  }

  // A gate's yes, and a post's: walk on. walk.js shows the moment and, when
  // the place cannot come, puts the pause card back with its line; this
  // module clears the card's state whatever the answer, so s.crossing has
  // one writer.
  function confirmGate(s) {
    const c = s.crossing;
    if (c.asking) return; // the "Get it?" card answers through buyYes
    prefetchArea(c.to);
    c.going = true;
    if (!s.net) { goOn(s, c); return; }
    // A room with a member on an older build, as the card said: the walk ends.
    if (c.endsHere) { crossRoom(s, c.to); return; }
    askRoom(s, c);
  }

  function goOn(s, c) {
    walkOn({ via: c.via }).then((answer) => {
      if (getSession() !== s || s.crossing !== c) return;
      if (answer === 'failed') s.crossing = null; // walk.js put the pause card back
      else if (answer === 'refused' && !s.walkingOn) restoreCard(s);
    });
  }

  // Who is in the room, and so who its host is, comes from the room's
  // roster (live presence), never from the walk's drawn cats: remotecats.js
  // drops a cat after 5 s without a state, and a paused device, or one
  // reading a card, sends none. Names may come from either.
  const rosterOf = () => { const r = getRoster(); return Array.isArray(r) ? r : []; };
  const roomIdsOf = (s) => rosterOf().map((m) => m?.playerId).filter((id) => id !== s.playerId);
  const remotesOf = (s) => (Array.isArray(s.remotes?.list) ? s.remotes.list : []);
  const petNameOf = (s, id) => remotesOf(s).find((r) => r.playerId === id)?.petName
    ?? safeRemoteName(rosterOf().find((m) => m?.playerId === id)?.petName, 'A friend');
  // A net handler this walk-on path adds: freeWalk takes it off with the
  // walk's own (session.netOffs); the caller may take it off sooner.
  function keepOff(s, off) {
    if (typeof off !== 'function') return () => {};
    if (Array.isArray(s.netOffs)) s.netOffs.push(off);
    return off;
  }
  // The place's load, started now; a loader that throws is a failed load.
  function ensure(id) {
    try { return Promise.resolve(ensureArea(id)); } catch (err) { return Promise.reject(err); }
  }
  const notReadyLine = () => phrase(isOnline() ? 'start.notReady' : 'start.notReadyOffline');

  // The host's yes in a room that walks on: the moment, the ask (twice), and
  // its own place; settle decides as the answers come in.
  function askRoom(s, c) {
    const room = { haves: [], ready: false, failed: false, done: false, off: () => {} };
    c.room = room;
    overlay.innerHTML = gateMomentHtml({ name: c.name });
    // A friend who leaves the room mid-wait is not waited for: the roster
    // changing decides again at once (net.onRoster also replays it now).
    room.off = keepOff(s, s.net.onRoster?.(() => settle(s, c)));
    const ask = { v: 1, id: s.playerId, type: 'walk-on-ask', from: s.areaId, via: c.via };
    s.net.sendEvent(ask);
    setTimeout(() => {
      if (getSession() === s && s.crossing === c && !room.done) s.net.sendEvent(ask);
    }, CROSS_RESEND_MS);
    setTimeout(() => settle(s, c, { timedOut: true }), WALK_ON_WAIT_MS);
    ensure(c.to)
      .then(() => { room.ready = true; }, () => { room.failed = true; })
      .then(() => settle(s, c));
  }

  function settle(s, c, { timedOut = false } = {}) {
    const room = c.room;
    if (!room) return;
    if (room.done || getSession() !== s || s.crossing !== c) { room.off(); return; }
    if (room.failed) { stayHere(s, room, notReadyLine()); return; }
    const d = decideWalkOnHave(room.haves, {
      areaId: s.areaId, via: c.via, selfId: s.playerId, remoteIds: roomIdsOf(s), catalog, ready: room.ready,
    });
    if (d.kind === 'no') { stayHere(s, room, phrase('gate.friendNotReady', petNameOf(s, d.id))); return; }
    if (d.kind === 'wait') {
      if (!timedOut) return;
      stayHere(s, room, room.ready ? phrase('gate.friendNotReady', petNameOf(s, d.waiting[0])) : notReadyLine());
      return;
    }
    // Every device has the place: tell the room (twice), then walk on at
    // once; the room is kept, so there is nothing to wait for. The resend
    // goes only into the room it was made in.
    room.done = true;
    room.off();
    const net = s.net;
    const ev = { v: 1, id: s.playerId, type: 'walk-on', from: s.areaId, via: c.via, seed: nextRoomSeed(s.roomSeed, c.via) };
    net.sendEvent(ev);
    setTimeout(() => { if (getRoomNet() === net) net.sendEvent(ev); }, CROSS_RESEND_MS);
    goOn(s, c);
  }

  // Nobody moves: the pause card comes back with one line.
  function stayHere(s, room, line) {
    room.done = true;
    room.off();
    restoreCard(s);
    hud.toast(line);
  }

  // A friend's answer reached the host.
  function onWalkOnHave(s, ev) {
    const c = s?.crossing;
    if (!c || !c.room || c.room.done || c.room.haves.length >= MAX_HAVES) return;
    c.room.haves.push(ev);
    settle(s, c);
  }

  // The host's ask reached a guest: fetch the place and answer, twice. The
  // host's resend, heard while the answer is on its way (or just after), is
  // the same ask; a later one (she tried again) is answered afresh. Her own
  // load failing gives her its own line too.
  function onWalkOnAsk(s, ev) {
    // A walk-on of her own under way would refuse the host's: no answer.
    if (!s || !s.net || s.walkingOn) return;
    const d = decideWalkOnAsk(ev, { areaId: s.areaId, selfId: s.playerId, remoteIds: roomIdsOf(s), catalog });
    if (!d) return;
    const last = s.walkOnAnswer;
    if (last && last.via === d.via && (last.pending || now() - last.at < ASK_SAME_MS)) return;
    const answer = { via: d.via, at: now(), pending: true };
    s.walkOnAnswer = answer;
    const net = s.net;
    ensure(d.to)
      .then(() => true, () => false)
      .then((ok) => {
        answer.pending = false;
        if (getSession() !== s) return;
        if (!ok) hud.toast(notReadyLine());
        const have = { v: 1, id: s.playerId, type: 'walk-on-have', via: d.via, ok };
        net.sendEvent(have);
        setTimeout(() => { if (getSession() === s) net.sendEvent(have); }, CROSS_RESEND_MS);
        if (ok) watchHost(s, net, { via: d.via, to: d.to, hostId: ev.id });
      });
  }

  // Ruling R15: having said yes, a guest also follows the host when, within
  // WALK_ON_FOLLOW_MS, a state from the host (by the roster) shows it in the
  // place, so both walk-on copies lost do not split the room.
  function watchHost(s, net, { via, to, hostId }) {
    const since = now();
    let off = () => {};
    off = keepOff(s, net.onState?.((state) => {
      if (getSession() !== s || s.crossLed || now() - since > WALK_ON_FOLLOW_MS) { off(); return; }
      if (!decideHostThere(state, { hostId, to, selfId: s.playerId, remoteIds: roomIdsOf(s) })) return;
      off();
      follow(s, { via, to, hostId });
    }));
    setTimeout(() => off(), WALK_ON_FOLLOW_MS);
  }

  // A guest walks on behind the host: once a walk, as a guest (nothing is
  // ever spent for her), into the same next room seed (walk.js derives it).
  function follow(s, { via, to, hostId }) {
    if (s.crossLed) return;
    s.crossLed = true;
    const name = petNameOf(s, hostId);
    hud.toast(phrase('cross.leading', name, lower(targetName(to, getEdition(), catalog))));
    walkOn({ via, ledBy: name, guest: true }).then((answer) => {
      // Her place could not come: she is still in this walk, and the host's
      // resend may lead her on.
      if (answer === 'failed' && getSession() === s) s.crossLed = false;
    });
  }

  // The host's walk-on reached a guest: follow it.
  function onRemoteWalkOn(s, ev) {
    if (!s || !ev || s.crossLed) return;
    const d = decideWalkOn(ev, {
      areaId: s.areaId, selfId: s.playerId, remoteIds: roomIdsOf(s), catalog, roomSeed: s.roomSeed,
    });
    if (!d) return;
    follow(s, { via: d.via, to: d.to, hostId: ev.id });
  }

  // A gate's or a post's yes takes one path: solo, she walks on; a room's
  // host asks the room and walks it on, or, in a room with an older build,
  // crosses as posts always did (the walk ends).
  function confirm() {
    const s = getSession();
    if (!s || !s.crossing) return;
    if (s.crossing.going) return; // a second click changes nothing
    confirmGate(s);
  }

  // A room's host crossing that ends the walk (a room with a member on an
  // older build): tell the room (twice, in case one is lost), then end once
  // the broadcast has left, since endWalk closes the room.
  function crossRoom(s, to) {
    const ev = { v: 1, id: s.playerId, type: 'border-cross', from: s.areaId, to };
    s.net.sendEvent(ev);
    setTimeout(() => { if (getSession() === s) s.net.sendEvent(ev); }, CROSS_RESEND_MS);
    overlay.innerHTML = '<div class="pause-card cross-card"><h1>Off we go! 🧭</h1></div>';
    setTimeout(() => { if (getSession() === s) endWalk({ crossTo: to }); }, CROSS_END_MS);
  }

  // Keep exploring, Not now and Back: the card closes (a "Get it?" card buys
  // nothing) and the walk goes on. Never over a yes on its way or a walk-on
  // waiting for its place.
  function cancel() {
    const s = getSession();
    if (!s || !s.crossing || s.crossing.going || s.walkingOn) return;
    restoreCard(s);
    resumeWalk();
  }

  function onLockChange(locked) {
    const s = getSession();
    if (locked && s && s.crossing && !s.crossing.going && !s.walkingOn) restoreCard(s);
  }

  // The host's event reached a guest: validate it, say so, and end this walk
  // the same way, once. Who she walked with is read now, from the roster, as
  // the host's leaving empties the room before the timer fires.
  function onRemote(s, ev) {
    if (!s || !ev || s.crossLed) return;
    // A post's or a gate's crossing in a room with an older build. Its room
    // and host are the roster's, as every room decision here is: a host
    // reading its card sends no state, and the drawn cats drop it after 5 s.
    const ctx = { areaId: s.areaId, selfId: s.playerId, catalog, remoteIds: roomIdsOf(s) };
    const d = decideBorderCross(ev, ctx) ?? decideGateCross(ev, ctx);
    if (!d) return;
    prefetchArea(d.to);
    s.crossLed = true;
    const together = roomIdsOf(s).map((id) => petNameOf(s, id));
    const name = petNameOf(s, ev.id);
    hud.toast(phrase('cross.leading', name, lower(targetName(d.to, getEdition(), catalog))));
    setTimeout(() => { if (getSession() === s) endWalk({ crossTo: d.to, ledBy: name, together }); }, LED_DELAY_MS);
  }

  return { ask, askGate, askGateBuy, buyYes, confirm, cancel, onLockChange, onRemote, onRemoteWalkOn, onWalkOnAsk, onWalkOnHave };
}
