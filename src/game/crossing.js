// The crossing card: a border post's "Head to ...?" question. Opens over the
// pause overlay (the walk is paused like ⏸), and either ends the walk with the
// crossing or puts the pause card back. Pure wiring; the words live in
// bordercross.js. In a room walk the host tells the room before it ends, and a
// guest follows the host's event (onRemote).
//
// World map step 3: a gate's card (askGate) asks the same question, and its
// yes walks her straight on (walk.js walkOn) instead of ending the walk. A
// gate to a place she can open but has not yet asks first through the usual
// "Get it?" card (askGateBuy, buyYes): never spent by accident, and its yes
// opens the place and puts the gate's card up. The words live in gatecross.js.
// s.crossing is this module's: it sets it, and clears it on every answer,
// including a walk-on that walk.js refused or could not load.

import { CATALOG } from '../progression.js';
import { carryLabel } from '../carry.js';
import { crossCardHtml, crossExtras, decideBorderCross, targetName, lower } from '../bordercross.js';
import { gateStatus, gateCardHtml, gateBuyHtml } from '../gatecross.js';
import { endById } from '../gateways.js';
import { CONFIRM_DELAY_MS } from '../ui/colonypanel.js';
import { phrase } from '../clanphrases.js';
import { pauseCardFor } from './walk.js';

export const CROSS_RESEND_MS = 150;
export const CROSS_END_MS = 400;
export const LED_DELAY_MS = 1500;

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

  function ask(s, data) {
    if (!s || !data || !data.status || data.status.kind !== 'go') return;
    if (!mayAsk(s)) return; // only a room's host crosses
    const { to, name } = data.status;
    s.crossing = { to, name };
    overlay.innerHTML = crossCardHtml({ name, extras: extrasFor(s) });
    releaseControl();
  }

  // A gate she can go through now: the crossing card, whose yes walks on.
  function askGate(s, data) {
    if (!s || !data || !data.end || data.status?.kind !== 'go') return;
    if (!mayAsk(s)) return;
    const { to, name } = data.status;
    prefetchArea(to);
    s.crossing = { to, name, via: data.end.id, kind: 'gate' };
    overlay.innerHTML = gateCardHtml({ name, extras: extrasFor(s) });
    releaseControl();
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
    if (typeof e?.detail === 'number' && e.detail > 1) return;
    if (!(now() - c.shownAt >= CONFIRM_DELAY_MS)) return;
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

  // A gate's yes: walk on. walk.js shows the moment and, when the place
  // cannot come, puts the pause card back with its line; this module clears
  // the card's state whatever the answer, so s.crossing has one writer.
  function confirmGate(s) {
    const c = s.crossing;
    if (c.asking) return; // the "Get it?" card answers through buyYes
    // A room's host: Task 9 walks the whole room on together. Until then a
    // gate's yes in a room does nothing (a border post's room crossing below
    // is unchanged).
    if (s.net) return;
    prefetchArea(c.to);
    c.going = true;
    walkOn({ via: c.via }).then((answer) => {
      if (getSession() !== s || s.crossing !== c) return;
      if (answer === 'failed') s.crossing = null; // walk.js put the pause card back
      else if (answer === 'refused' && !s.walkingOn) restoreCard(s);
    });
  }

  function confirm() {
    const s = getSession();
    if (!s || !s.crossing) return;
    if (s.crossing.going) return; // a second click changes nothing
    if (s.crossing.kind === 'gate') { confirmGate(s); return; }
    const to = s.crossing.to;
    prefetchArea(to);
    if (!s.net) {
      endWalk({ crossTo: to });
      return;
    }
    // A room's host: tell the room (twice, in case one is lost), then end once
    // the broadcast has left, since endWalk closes the room.
    s.crossing.going = true;
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
  // the same way, once. Who to walk on with is read now, because the host's
  // leaving empties the remotes list before the timer fires.
  function onRemote(s, ev) {
    if (!s || !ev || s.crossLed) return;
    const remotes = Array.isArray(s.remotes?.list) ? s.remotes.list : [];
    const d = decideBorderCross(ev, {
      areaId: s.areaId, selfId: s.playerId, remoteIds: remotes.map((r) => r.playerId), catalog,
    });
    if (!d) return;
    prefetchArea(d.to);
    s.crossLed = true;
    const together = remotes.map((r) => r.petName);
    const name = remotes.find((r) => r.playerId === ev.id)?.petName ?? 'A friend';
    hud.toast(phrase('cross.leading', name, lower(targetName(d.to, getEdition(), catalog))));
    setTimeout(() => { if (getSession() === s) endWalk({ crossTo: d.to, ledBy: name, together }); }, LED_DELAY_MS);
  }

  return { ask, askGate, askGateBuy, buyYes, confirm, cancel, onLockChange, onRemote };
}
