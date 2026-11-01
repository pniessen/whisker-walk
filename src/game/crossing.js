// The crossing card: a border post's "Head to ...?" question. Opens over the
// pause overlay (the walk is paused like ⏸), and either ends the walk with the
// crossing or puts the pause card back. Pure wiring; the words live in
// bordercross.js. Room walks (host send, guest receive) are filled in later.

import { CATALOG } from '../progression.js';
import { carryLabel } from '../carry.js';
import { crossCardHtml, crossExtras } from '../bordercross.js';
import { pauseCardHtml } from './walk.js';

export function createCrossing({
  getSession, overlay, hud, releaseControl, resumeWalk, endWalk, getIsTouch,
  catalog = CATALOG, setTimeout = globalThis.setTimeout,
}) {
  void hud; void catalog; void setTimeout; // used by the room branches

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
        together: [],
      }),
    });
    releaseControl();
  }

  function confirm() {
    const s = getSession();
    if (!s || !s.crossing) return;
    // Room walks: Task 8 replaces this with the host's send-then-end.
    endWalk({ crossTo: s.crossing.to });
  }

  function cancel() {
    const s = getSession();
    if (!s || !s.crossing) return;
    restoreCard(s);
    resumeWalk();
  }

  function onLockChange(locked) {
    const s = getSession();
    if (locked && s && s.crossing) restoreCard(s);
  }

  function onRemote() {}

  return { ask, confirm, cancel, onLockChange, onRemote };
}
