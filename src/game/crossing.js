// The crossing card: a border post's "Head to ...?" question. Opens over the
// pause overlay (the walk is paused like ⏸), and either ends the walk with the
// crossing or puts the pause card back. Pure wiring; the words live in
// bordercross.js. In a room walk the host tells the room before it ends, and a
// guest follows the host's event (onRemote).

import { CATALOG } from '../progression.js';
import { carryLabel } from '../carry.js';
import { crossCardHtml, crossExtras, decideBorderCross, targetName, lower } from '../bordercross.js';
import { pauseCardHtml } from './walk.js';

export const CROSS_RESEND_MS = 150;
export const CROSS_END_MS = 400;
export const LED_DELAY_MS = 1500;

// swallowsCanvasClick(session) -> true while a room host's confirmed crossing
// is on its way out (the CROSS_END_MS "Off we go!" pause). main.js stops a
// game-canvas click then, so it cannot re-lock the pointer for a walk that is
// about to end.
export function swallowsCanvasClick(s) {
  return !!s?.crossing?.going;
}

export function createCrossing({
  getSession, overlay, hud, releaseControl, resumeWalk, endWalk, getIsTouch, getEdition,
  catalog = CATALOG, setTimeout = globalThis.setTimeout,
}) {
  function restoreCard(s) {
    overlay.innerHTML = pauseCardHtml({ welcome: s.welcome, touch: getIsTouch() });
    s.crossing = null;
  }

  function ask(s, data) {
    if (!s || !data || !data.status || data.status.kind !== 'go') return;
    if (s.crossing || s.fight || s.clanFight?.uiShowing) return;
    if (s.net && !s.net.isHost?.()) return; // only a room's host crosses
    const { to, name } = data.status;
    s.crossing = { to, name };
    const held = s.carry?.mouth?.held;
    overlay.innerHTML = crossCardHtml({
      name,
      extras: crossExtras({
        raceRunning: s.race?.state === 'running',
        questActive: s.quest?.state === 'active',
        carried: held ? carryLabel(held.kind) : null,
        buddyName: s.clanBuddy?.name ?? null,
        together: s.net ? (s.remotes?.list ?? []).map((r) => r.petName) : [],
      }),
    });
    releaseControl();
  }

  function confirm() {
    const s = getSession();
    if (!s || !s.crossing) return;
    if (s.crossing.going) return; // a second click changes nothing
    const to = s.crossing.to;
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

  function cancel() {
    const s = getSession();
    if (!s || !s.crossing || s.crossing.going) return;
    restoreCard(s);
    resumeWalk();
  }

  function onLockChange(locked) {
    const s = getSession();
    if (locked && s && s.crossing && !s.crossing.going) restoreCard(s);
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
    s.crossLed = true;
    const together = remotes.map((r) => r.petName);
    const name = remotes.find((r) => r.playerId === ev.id)?.petName ?? 'A friend';
    hud.toast(`${name} is leading the way to ${lower(targetName(d.to, getEdition(), catalog))}! 🧭`);
    setTimeout(() => { if (getSession() === s) endWalk({ crossTo: d.to, ledBy: name, together }); }, LED_DELAY_MS);
  }

  return { ask, confirm, cancel, onLockChange, onRemote };
}
