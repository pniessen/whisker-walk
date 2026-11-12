import { BUILD_STAMP } from '../buildstamp.js';
import { escapeHtml } from '../game/util.js';
import { CATALOG, rankFor, asFiniteNonNeg } from '../progression.js';
import { menuThumbnails } from '../thumbnails.js';
import { validPetName, goodNewPetName, safeRemoteName, safeRemoteBreed } from '../net.js';
import { metOnly, deviceMetPlayers } from '../metplayers.js';
import { activeCat } from '../customcats.js';
import { renderFightMovesHtml, renderSkillsHtml, renderStarNamePicker, goldenFound, renderGoldenTallyHtml } from './hometabs.js';
import { HOME_SHEETS, MENU_TILES, GROWNUP_SHEETS, SHEET_ICON, SHEET_NAME, resolveSheet, PLACE_PICTURE, placeWhyLine } from './dressingroom.js';
import { createDressingRoom } from './dressingroomview.js';
import { createCatStage } from './catstage.js';
import { buildCat } from '../cat/model.js';
import { candidateStarNames } from '../clannames.js';
import { ownClanTitle, alliesName } from '../clanhomes.js';
import { CLAN_SUFFIX } from '../clanwords.js';
import {
  PICK_ATTR, MOMENT_ATTR, MOMENT_SEEN_KEY, clanPickerModel, clanMomentDue, renderClanMomentHtml, clanLineHtml, woodsOpen,
} from './clanpicker.js';
import { SKILLS, hasSkill } from '../skills.js';
import { editionTitle, gameTitle, isClanEdition, placeName, effectiveArea } from '../edition.js';
import {
  renderColonyHtml, sanitizeInviteCode, shouldPollPairing, pairingPending, pairingErrorLine, PAIRING_POLL_MS,
  theySaidNo, PAIR_DECLINED_LINE, tradeErrorLine, confirmClickAllowed,
  renderStartButtonHtml, renderPartnerWalkHtml, renderRoomTitleHtml,
} from './colonypanel.js';
import { renderJournalHtml } from '../journal.js';
import { goldForEdition } from '../goldmice.js';
import { createRedeemer, renderRedeemHtml } from '../redeem.js';
import { usageHtml } from '../usage.js';
import { isMilestone, welcomeLine } from '../visits.js';
import { createVisitCelebration } from './visitcelebration.js';
import { settingsSwitchHtml } from './screencards.js';
import { emptyStateHtml } from './emptystates.js';
import { PAW } from './pawicon.js';
import { createConfirmCard } from './confirmcard.js';
import { note } from '../diagnostics.js';

const LEVEL_ICON = { best: '💕', friend: '♥', met: '♡' };

// The top bar's visit pill: "🐾 Visit 23", or "🎉 Visit 30" on a milestone
// visit; nothing before the first visit. A quiet HUD pill (Launch A: pink is
// Start's alone). visits comes from the save, so it is coerced to a whole
// number before it reaches innerHTML.
export function visitBadgeHtml(visits) {
  const n = Math.floor(asFiniteNonNeg(visits, 0));
  if (n < 1) return '';
  return isMilestone(n)
    ? `<div class="hb-pill dr-visit milestone">🎉 Visit ${n}</div>`
    : `<div class="hb-pill dr-visit">${PAW} Visit ${n}</div>`;
}

// How long the welcome line stays before it is removed (its CSS fade ends
// just before this).
const WELCOME_MS = 4600;

// last_seen (profiles) / a fetch timestamp rendered as a short relative
// string ("2h ago"). Anything not a valid date collapses to '' rather than
// "NaNh ago".
function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// same 1/3/6 ladder as LEVEL_ICON above, applied to a friendships row's
// greets count instead of a local friend's.
function heartFor(greets) {
  if (greets >= 6) return '💕';
  if (greets >= 3) return '♥';
  return '♡';
}

// Friend codes (Task 4): a code is just "CAT-" + the first 8 hex chars of
// a playerId (the first hyphen-free chunk of the underlying UUID) —
// normalizing strips a leading "CAT-" (any case), trims, and lowercases so
// it matches the lowercase hex `player_id` column that findByFriendCode's
// `like`-prefix query runs against (Postgres `like` is case-sensitive).
function normalizeFriendCode(input) {
  return String(input ?? '').trim().replace(/^cat-/i, '').toLowerCase();
}
const FRIEND_CODE_RE = /^[0-9a-f]{6,32}$/;

// settings: the createSettings(storage) handle (src/settings.js) — this
// module reads/writes it directly (settings.get/set/all), same "thin
// adapter, no local copy of the data" pattern sync/cloud already use here.
// onSettingsChange: called after every settings.set() from this screen so
// main.js can push the new value into audio/player/touchUI immediately —
// settings apply live, no walk restart or reload required.
// onVisitDen: the den button's own start callback (Task 7.2) — kept
// separate from onStartWalk (beginWalkFromHomebase) because the den never
// joins a room walk; main.js wires it straight to `startWalk({ areaOverride:
// 'den' })`, bypassing the host/joiner room branch onStartWalk goes through.
// colonySync (v21 Stream 2, game/colonysync.js) is optional: the Colony tab
// (Tasks 8-11) reads its status() and calls its actions.
// myId is the player id (main.js `pid`), passed explicitly because the cloud
// adapter above can be absent when multiplayer is off, and the Colony tab
// must still tell "my" finds and feeds from my partner's.
// toast(text) is optional: main.js's cloud toast, used for "You're sharing a
// colony with …". It is called with plain text and never with markup.
// onCelebrate() is optional: called when a visit celebration opens its present
// (or a style-B / cycle-back card shows) — main.js plays the unlock fanfare.
// The page title and the boot splash name the save's edition. index.html
// ships both neutral ("Whisker Walk 2"), because the splash is up before the
// save is read; every home-screen render fills them in, so the first render
// names the loaded save's edition and each flip after it follows.
export function showEditionTitle(doc, edition) {
  if (!doc) return;
  doc.title = gameTitle(edition);
  const word = doc.querySelector?.('#splash .splash-edition');
  if (word) word.textContent = editionTitle(edition);
  doc.getElementById?.('splash')?.setAttribute('aria-label', gameTitle(edition));
}

// createHomeBase takes one options object:
//   progression, album: the saved game and the photo album
//   onStartWalk: called to begin a walk; rooms, sync, cloud, colonySync: the
//     online pieces (each may be null)
//   onlineDelete (optional): game/onlinedelete.js, the Cloud save sheet's
//     "Delete my online data"; absent, the button isn't drawn
//   settings, onSettingsChange: the settings store and its change hook
//   onVisitDen: called to walk into a family den
//   myId: this player's id; toast: shows a short message
//   onCelebrate (optional): called when a milestone celebration starts
//   onCardsClosed (optional): called when she dismisses the clan moment, so
//     main.js can show the news card that waited for it
//   haptics: whether this device can buzz at all (src/haptics.js); the
//     Vibration switch is only drawn where it can
//   nearby: game/nearby.js, the rooms the app found on the local network.
//     Absent, or not available (Safari, desktop), nothing of it is drawn
//   metPlayers: src/metplayers.js (the device's own list when absent)
export function createHomeBase({ progression, album, onStartWalk, rooms, sync, onlineDelete = null, cloud, settings, onSettingsChange, onVisitDen, colonySync, myId, toast, onCelebrate, onCardsClosed, haptics: canBuzz = false, nearby = null, metPlayers = null }) {
  const met = () => metPlayers ?? deviceMetPlayers();
  const root = document.getElementById('homebase');
  let petNameError = null;
  let joinError = null;
  // A nearby Join was tapped with no cat name: Play together says so above
  // the name box until she has one.
  let nameNeeded = false;
  // v21 Stream 5: the home screen is the dressing room (openSheet null) or
  // one sheet from HOME_SHEETS.
  let openSheet = null;
  // Day or dusk, chosen in Change place: remembered across renders and walks
  // for this session (home shows a moon while it stands), never saved. It
  // only counts while the Glow Collar is on.
  let duskWanted = false;
  let shown = false; // between show() and hide()

  // Secret-code box (its own sheet). Typed text, the last result and the busy flag
  // live here because render() rebuilds the panel.
  const redeemer = createRedeemer({ progression });
  let redeemText = '';
  let redeemResult = null;
  let redeemBusy = false;

  // Colony pairing (Task 9). The draft code lives here, not in the DOM, because
  // render() rebuilds the panel (a roster change or a poll that found news
  // would otherwise wipe a half-typed code).
  let pairBusy = false;
  let pairError = null;
  let pairCode = '';
  let pairingWasPending = false; // a pairing was waiting when we last looked
  let lastPairStatus = null;     // the status noteColonyPairing last saw (for "they said no")
  let pairTimer = null;          // THE single poll handle; null when not polling

  // Colony trading (Task 11). Kept here for the same reason as the draft code:
  // render() rebuilds the panel, which would reset the two selects and, worse,
  // forget that "Swap!" was clicked once and is waiting for its second click.
  let tradeBusy = false;
  let tradeError = null;
  let tradeGive = null;          // the selected items, remembered across renders
  let tradeWant = null;
  let tradeConfirmId = null;     // the incoming offer whose first click was made
  let tradeConfirmShownAt = 0;   // when its confirm step appeared (ms): a double-tap must not reach "Yes"

  // Player pets 🐾🐾 (Task 3) — render() is synchronous and re-runs its
  // entire innerHTML on nearly every interaction (buy/equip/room changes),
  // so this section can't hold fetched data as component state the way
  // cloudPreview etc. do above: render() always emits a fresh "loading…"
  // placeholder with a stable id, and a separate async function fills it
  // in afterward. `playerPetsToken` guards re-entrancy — if render() (and
  // therefore loadPlayerPets()) runs again before an in-flight fetch
  // resolves, the stale fetch's token no longer matches and it no-ops
  // instead of writing fetched-for-the-old-DOM data into the new one.
  let playerPetsToken = 0;

  // Friend codes (Task 4) section state — mirrors the wt-*/joinError
  // pattern above: busy flag, an error string, and (once a code resolves
  // to a real, non-self profile) a pending confirm-card candidate.
  let friendCodeBusy = false;
  let friendCodeError = null;
  let friendCodeCandidate = null; // { playerId, petName, breed } | null
  let friendCodeSuccess = null; // short "Added X!" line shown once after confirm

  // Sync ☁️ section state — mirrors the wt-*/joinError pattern above.
  let cloudBusy = false;
  let cloudError = null;
  let cloudStatus = null; // inline result text after a manual "Sync now"
  let cloudJustLinked = false; // show the big "write this down" code once, right after linking
  let cloudPreview = null; // pending { code, secret, payload, local, cloud } from previewLoad
  let backupMsg = null; // the result line after putting a kept copy back
  let deleteMsg = null; // the result line after "Delete my online data"
  let deleting = false; // that delete is on its way (cloudBusy is set too)

  // The cats in the room this child can see: a hidden visitor (src/blocklist.js)
  // is not listed or named.
  const roomCats = (roster) => roster.filter((p) => !cloud?.isBlocked?.(p?.playerId));

  // "<Name> joined" for each cat that comes into the room after this child,
  // so she always knows who is there. Whoever was already in it when she
  // arrived is in the list she sees, so is not toasted.
  let arrivalsRoom = null; // { code, ids }
  function noteRoomArrivals() {
    const st = rooms.getState();
    if (!st) { arrivalsRoom = null; return; }
    const cats = roomCats(st.roster).filter((p) => p?.playerId !== myId);
    if (!arrivalsRoom || arrivalsRoom.code !== st.code) {
      arrivalsRoom = { code: st.code, ids: new Set(cats.map((p) => p.playerId)) };
      return;
    }
    for (const p of cats) {
      if (arrivalsRoom.ids.has(p.playerId)) continue;
      arrivalsRoom.ids.add(p.playerId);
      if (!homeVisible()) continue; // in a walk, game/walk.js says it
      try { toast?.(`${safeRemoteName(p.petName)} joined 🐾`); } catch { /* a toast is never worth a crash */ }
    }
  }

  function renderWalkTogether() {
    if (!rooms || !rooms.available) {
      return `<div class="tag">multiplayer not configured</div>`;
    }
    const st = rooms.getState();
    const colony = progression.state.colony;
    if (st) {
      return `
        <div class="wt-room">
          <div class="wt-room-code">${renderRoomTitleHtml(st, colony)}</div>
          <div class="wt-roster">
            ${st.roster.length
              ? roomCats(st.roster).map((p) => `<span class="wt-roster-chip">🟢 ${escapeHtml(safeRemoteName(p.petName))}</span>`).join('')
              : '<span class="tag">waiting for friends…</span>'}
          </div>
          ${nearby?.available && nearby.advertising() ? '<div class="tag wt-nearby-on">Nearby cats can join with one tap</div>' : ''}
          <button id="wt-leave">Leave room</button>
        </div>`;
    }
    const name = progression.state.petName ?? '';
    // a joiner with no valid pet name can never build a profile row (their
    // own recordGreet calls are denied server-side), so their greets would
    // silently fail — Join is gated the same as Host, not just Host.
    const hasValidPetName = validPetName(name);
    // Paired siblings get their own room with nothing to type (Task 12).
    const pairWalk = renderPartnerWalkHtml({ status: colonySync ? colonySync.status() : null, colony, room: st });
    // In order: the name (it unlocks everything under it), the walk with her
    // sibling, then a room of her own to start or join.
    return `
      ${hasValidPetName ? '' : nameNeeded
    ? '<p class="wt-first wt-name-needed">Your cat needs a name before it can join a walk. Type one here and tap Save:</p>'
    : '<p class="wt-first">First, give your cat a name your friends will see:</p>'}
      <div class="wt-petname">
        <input type="text" id="wt-petname-input" maxlength="16" placeholder="Your cat's name" value="${escapeHtml(name)}" />
        <button id="wt-petname-save">Save</button>
        <div class="tag wt-name-hint">Pick a cat name, not your real name. Other players can see it.</div>
        ${petNameError ? `<div class="tag error">${escapeHtml(petNameError)}</div>` : ''}
      </div>
      ${isClanEdition(progression.state) ? renderStarNamePicker(candidateStarNames(myId), name) : ''}
      ${pairWalk && hasValidPetName ? `<div class="wt-pair">${pairWalk}</div>` : ''}
      ${nearby?.available ? `<div id="wt-nearby" class="wt-nearby">${nearbyRowsHtml()}</div>` : ''}
      <div class="wt-actions">
        <button id="wt-host" ${hasValidPetName ? '' : 'disabled'}>Host a walk</button>
        <div class="wt-join-row">
          <input type="text" id="wt-join-code" maxlength="4" placeholder="CODE" class="wt-code-input" />
          <button id="wt-join" ${hasValidPetName ? '' : 'disabled'}>Join</button>
        </div>
        ${joinError ? `<div class="tag error">${escapeHtml(joinError)}</div>` : ''}
      </div>`;
  }

  // One row per room the app found nearby, each with its own Join. No row
  // when there is none: nothing says "searching", because most of the time
  // nobody is hosting and that is not a fault. The Join is never disabled:
  // with no cat name yet it leads to the name box instead (joinNearby).
  // Anyone near enough can put any cat's name on the air, so each row and
  // the card show the room code too, to check against the host's screen.
  const nearbyCodeLine = (code) => `Room ${code}: check it's the code on their screen`;
  function nearbyRowsHtml() {
    return nearby.rooms().map((r) => `<div class="wt-nearby-row">`
      + `<span class="wt-nearby-who">${PAW} <b>${escapeHtml(safeRemoteName(r.name))}</b> is starting a walk nearby</span>`
      + `<span class="wt-nearby-code">${escapeHtml(nearbyCodeLine(r.code))}</span>`
      + `<button class="primary wt-nearby-join" data-nearby-code="${escapeHtml(r.code)}">Join</button></div>`).join('');
  }

  function renderSync() {
    if (!sync || !sync.available) return '';
    let body;
    if (cloudPreview) {
      const fmt = (s) => `${s.rank} · ${s.points} 🐾 (lifetime ${s.lifetimePoints}) · best walk ${s.bestWalk}`;
      // Defense in depth: main.js's summarizeSaveForPreview already coerces
      // every numeric field of a cloud-loaded (untrusted) save, so `s.rank`
      // is always one of RANKS' own titles and the numbers are always plain
      // finite numbers — but this fires BEFORE the user confirms anything,
      // so escape the rendered text here too rather than trust that upstream
      // sanitation never regresses.
      body = `
        <div class="sync-preview">
          <div class="sync-compare">
            <div class="sync-col"><h3>This device</h3><div>${escapeHtml(fmt(cloudPreview.local))}</div></div>
            <div class="sync-col"><h3>Cloud save ${escapeHtml(cloudPreview.code)}</h3><div>${escapeHtml(fmt(cloudPreview.cloud))}</div></div>
          </div>
          <div class="tag error">Loading will overwrite everything on this device. You can undo it here afterwards, but photos won’t come back.</div>
          <div class="sync-actions">
            <button id="sync-confirm-load" class="primary" ${cloudBusy ? 'disabled' : ''}>Confirm — overwrite this device</button>
            <button id="sync-cancel-load" ${cloudBusy ? 'disabled' : ''}>Cancel</button>
          </div>
        </div>`;
    } else if (sync.getCode()) {
      const code = sync.getCode();
      if (cloudJustLinked) {
        body = `
          <div class="sync-code-big">
            <div class="sync-code-value">${escapeHtml(code)}</div>
            <div class="tag error">Write this down! It's the only way to find this save again.</div>
            <button id="sync-got-it" class="primary">Got it</button>
          </div>`;
      } else {
        body = `
          <div class="sync-linked">
            <div class="tag on">☁️ synced as ${escapeHtml(code)} · after every walk</div>
            ${cloudStatus ? `<div class="tag">${escapeHtml(cloudStatus)}</div>` : ''}
            <div class="sync-actions">
              <button id="sync-now" ${cloudBusy ? 'disabled' : ''}>${cloudBusy ? 'Syncing…' : 'Sync now'}</button>
              <button id="sync-load-linked" ${cloudBusy ? 'disabled' : ''}>Load from cloud</button>
            </div>
            ${cloudError ? `<div class="tag error">${escapeHtml(cloudError)}</div>` : ''}
            <div class="sync-unlink-row">
              <button id="sync-unlink" class="danger" ${cloudBusy ? 'disabled' : ''}>Unlink</button>
            </div>
          </div>`;
      }
    } else {
      body = `
        <div class="sync-unlinked">
          <button id="sync-save" ${cloudBusy ? 'disabled' : ''}>${cloudBusy ? 'Saving…' : 'Save to cloud'}</button>
          <div class="sync-load-row">
            <input type="text" id="sync-load-code" maxlength="24" placeholder="WORD-WORD-WORD-00" class="wt-code-input sync-code-input" />
            <button id="sync-load" ${cloudBusy ? 'disabled' : ''}>Load from cloud</button>
          </div>
          ${cloudError ? `<div class="tag error">${escapeHtml(cloudError)}</div>` : ''}
        </div>`;
    }
    return cloudPreview || (cloudJustLinked && sync.getCode()) ? body : body + renderBackups() + renderOnlineDelete();
  }

  // "Delete my online data": drawn whether or not this device is linked (a
  // device can have a cat profile and colony sharing online with no cloud
  // save). Not while a room is open or the colony is mid-pairing: the room
  // and the pairing poll would put the cat name straight back, so the button
  // waits, and says why, until she has left the room or the pairing is over.
  function onlineDeleteBlocked() {
    if (rooms?.getState?.()) return 'Leave the walk room first, then you can delete.';
    const st = colonySync ? colonySync.status() : null;
    const expires = st?.invite && typeof st.invite.expiresAt === 'string' ? Date.parse(st.invite.expiresAt) : NaN;
    if (pairBusy || st?.joining || (Number.isFinite(expires) && expires > Date.now())) {
      return 'Colony sharing is in the middle of pairing. Try again once that’s finished.';
    }
    return null;
  }
  function renderOnlineDelete() {
    if (!onlineDelete?.available) return '';
    const blocked = onlineDeleteBlocked();
    return `
      <div class="sync-delete">
        <button id="sync-delete-online" class="danger" ${cloudBusy || blocked ? 'disabled' : ''}>${deleting ? 'Deleting…' : 'Delete my online data'}</button>
        ${blocked ? `<div class="tag">${escapeHtml(blocked)}</div>` : ''}
        ${deleteMsg ? `<div class="tag">${escapeHtml(deleteMsg)}</div>` : ''}
      </div>`;
  }

  // The kept copies of the save (progression's backups), under the cloud
  // controls: each only while it exists. The copy a restore itself keeps
  // ('restore') has no button; a mistaken undo is put right by loading
  // from the cloud again.
  function renderBackups() {
    let info = [];
    try { info = progression.backupInfo?.() ?? []; } catch { info = []; }
    const find = (kind) => info.find((b) => b.kind === kind);
    const pts = (b) => (b.points === null ? '' : ` <small class="sync-backup-pts">(${escapeHtml(b.points)} 🐾)</small>`);
    const rows = [];
    const cloudCopy = find('cloud');
    if (cloudCopy?.restorable) rows.push(`<button data-backup-restore="cloud">Undo the last cloud load${pts(cloudCopy)}</button>`);
    const resetCopy = find('reset');
    if (resetCopy?.restorable) rows.push(`<button data-backup-restore="reset">Bring back the save from before Start over${pts(resetCopy)}</button>`);
    const bad = find('unreadable');
    if (bad?.restorable) {
      rows.push('<p class="sync-backup-line">This device found a save it couldn’t open, and kept a copy.</p>'
        + `<button data-backup-restore="unreadable">Try to restore${pts(bad)}</button>`);
    } else if (bad?.newer) {
      rows.push('<p class="sync-backup-line">This device has a save from a newer version of the game. It’s kept safe: update the game to get it back.</p>');
    } else if (bad) {
      rows.push('<p class="sync-backup-line">This device found a save it couldn’t open, and kept a copy in case it can be fixed.</p>');
    }
    if (!rows.length && !backupMsg) return '';
    return `<div class="sync-backups">${rows.join('')}${backupMsg ? `<div class="tag">${escapeHtml(backupMsg)}</div>` : ''}</div>`;
  }

  // "Delete my online data": the confirm card, and the line for each answer.
  const KEEPS = 'The game on this device stays as it is, except that its cat name for playing together is cleared. This can’t be undone.';
  function onlineDeleteAsk(code) {
    return {
      text: 'Delete this device’s online data?',
      note: code
        ? `Deletes the cloud save and photo album under the code ${code}, and this device’s cat profile, friends and colony sharing. ${KEEPS} Another device linked to the same save code will upload the save again, unless you unlink it or delete there too.`
        : `Deletes this device’s cat profile, friends and colony sharing. ${KEEPS}`,
      yes: 'Yes, delete it',
      danger: true,
    };
  }
  const NOTHING = 'Nothing was deleted.';
  function onlineDeleteMessage({ outcome, player, save }) {
    if (outcome === 'done') return 'Done. Your online data is deleted. To play together again, give your cat a name in Play together.';
    if (outcome === 'unavailable') return `Deleting isn’t switched on yet. ${NOTHING}`;
    if (outcome === 'denied') return `The cloud wouldn’t let this device delete it. ${NOTHING}`;
    if (outcome === 'busy') return `The cloud is busy right now — try again later. ${NOTHING}`;
    if (outcome === 'partial') {
      const playerGone = player === 'ok' || player === 'none';
      return playerGone
        ? 'The cat profile, friends and colony sharing are deleted, but the cloud save isn’t yet. Tap Delete my online data again to finish.'
        : 'The cloud save is deleted and this device is unlinked, but the cat profile, friends and colony sharing aren’t yet. Tap Delete my online data again to finish.';
    }
    return `Could not reach the cloud — check your connection and try again. ${NOTHING}`;
  }

  // What each kept copy's confirm says.
  const BACKUP_ASK = {
    cloud: { text: 'Undo the last cloud load?', note: 'This device goes back to what it had before. Photos don’t come back.', yes: 'Yes, undo it' },
    reset: { text: 'Bring back the save from before Start over?', note: 'It replaces what’s on this device now.', yes: 'Yes, bring it back' },
    unreadable: { text: 'Try to restore the save this device kept?', note: 'It replaces what’s on this device now.', yes: 'Yes, try it' },
  };

  // Settings ⚙️ (Task 6), in two halves since the navigation review: Sound &
  // controls (the children's: volume, music, mute, the touch and look
  // controls, the map, reduced motion, chat) and Game settings (the
  // grown-ups': the edition, graphics, the fps readout and Start over, last
  // with nothing under it). Only where each control is drawn changed: every
  // id and its wiring below is as it was. Every control applies live via
  // onSettingsChange — no reload, no walk restart. The volume slider is wired
  // separately (an 'input' listener below, not this delegated click handler)
  // so dragging it doesn't fight a render() every tick; the checkboxes and
  // Start-over button DO go through the normal click-then-render() path since
  // a discrete toggle has no drag to disrupt.
  function renderControls() {
    if (!settings) return '';
    const s = settings.all();
    const pct = Math.round(s.volume * 100);
    const musicPct = Math.round(s.musicVolume * 100);
    // The corner map's mode is kept on the save, not in settings, because
    // tapping the map during a walk flips the same value.
    const mapMode = progression.state.mapMode;
    return `
      <section class="settings-section"><h2>Sound &amp; controls 🔊</h2>
        <div class="settings-grid">
          <label class="settings-row settings-volume">
            <span class="settings-label">Volume</span>
            <input type="range" class="settings-range" id="set-volume" style="--fill:${pct}%" min="0" max="100" step="1" value="${pct}" />
            <span id="set-volume-value" class="settings-volume-value">${pct}%</span>
          </label>
          <label class="settings-row settings-volume">
            <span class="settings-label">Music 🎵</span>
            <input type="range" class="settings-range" id="set-music-volume" style="--fill:${musicPct}%" min="0" max="100" step="5" value="${musicPct}" />
            <span id="set-music-volume-value" class="settings-volume-value">${musicPct}%</span>
          </label>
          ${settingsSwitchHtml('set-muted', !!s.muted, 'Mute all sound')}
          ${canBuzz ? settingsSwitchHtml('set-haptics', s.haptics !== false, 'Vibration') : ''}
          ${settingsSwitchHtml('set-left-handed', !!s.leftHanded, 'Left-handed touch controls')}
          ${settingsSwitchHtml('set-invert-y', !!s.invertY, 'Invert look (Y axis)')}
          <label class="settings-row settings-quality">
            <span class="settings-label">Map</span>
            <select id="set-map-mode">
              <option value="north" ${mapMode === 'north' ? 'selected' : ''}>North up</option>
              <option value="turn" ${mapMode === 'turn' ? 'selected' : ''}>Turns with me</option>
            </select>
          </label>
          ${settingsSwitchHtml('set-reduced-motion', !!s.reducedMotion, 'Reduced motion')}
          ${settingsSwitchHtml('set-hide-chat', !!s.hideChat, 'Hide chat bubbles')}
        </div>
      </section>`;
  }

  // The edition is not a look: say what switching does, so a grown-up does
  // not flip it like a colour (the save keeps everything either way).
  const EDITION_NOTE = `Switching renames the places and shows or hides the ${CLAN_SUFFIX.toLowerCase()} territories. Nothing is lost.`;
  function renderSettings() {
    if (!settings) return '';
    const s = settings.all();
    const edition = progression.state.edition;
    return `
      <section class="settings-section"><h2>Game settings ⚙️</h2>
        <div class="settings-grid">
          <label class="settings-row settings-quality">
            <span class="settings-label">Game edition</span>
            <select id="set-edition">
              <option value="canon" ${edition === 'canon' ? 'selected' : ''}>${editionTitle('canon')}</option>
              <option value="legacy" ${edition === 'legacy' ? 'selected' : ''}>Legacy Edition</option>
            </select>
          </label>
          <p class="settings-note" id="set-edition-note">${EDITION_NOTE}</p>
        </div>
        <h3 class="settings-group">Advanced</h3>
        <div class="settings-grid settings-advanced">
          ${settingsSwitchHtml('set-perf-readout', !!s.perfReadout, 'Performance readout (fps counter)')}
          <label class="settings-row settings-quality">
            <span class="settings-label">Graphics quality (applies next walk)</span>
            <select id="set-quality">
              <option value="auto" ${s.quality === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="high" ${s.quality === 'high' ? 'selected' : ''}>High detail</option>
              <option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low detail</option>
            </select>
          </label>
        </div>${usageHtml(progression.state.usage, { visits: progression.state.visits, walks: Object.values(progression.state.walks ?? {}).reduce((a, b) => a + asFiniteNonNeg(b, 0), 0) })}
        <p class="settings-note" id="hb-build">Build ${escapeHtml(BUILD_STAMP)}</p>
        <button id="btn-reset" class="danger">Start over</button>
      </section>`;
  }

  function renderFriendCode() {
    const code = `CAT-${cloud.myId.slice(0, 8).toUpperCase()}`;
    // Gated the same as Host/Join above: addFriendByCode's recordGreet call
    // validates the CALLER's own profile row, which only exists once a
    // valid pet name has been set — without one, "Add a friend by code"
    // would always fail server-side, so disable it up front rather than
    // let the player hit that error blind.
    const hasValidPetName = validPetName(progression.state.petName ?? '');
    return `
      <div class="friend-code-block">
        <div class="tag">Your friend code: <strong>${escapeHtml(code)}</strong></div>
        <div class="wt-join-row">
          <input type="text" id="friend-code-input" maxlength="20" placeholder="CAT-XXXXXXXX" class="wt-code-input sync-code-input" ${hasValidPetName ? '' : 'disabled'} />
          <button id="friend-code-add" ${friendCodeBusy || !hasValidPetName ? 'disabled' : ''}>Add a friend by code</button>
        </div>
        ${!hasValidPetName ? '<div class="tag">Give your cat a name at the top to add friends by code.</div>' : ''}
        ${friendCodeError ? `<div class="tag error">${escapeHtml(friendCodeError)}</div>` : ''}
        ${friendCodeSuccess ? `<div class="tag on">${escapeHtml(friendCodeSuccess)}</div>` : ''}
        ${friendCodeCandidate ? `
          <div class="friend-code-confirm">
            <div class="tag">Add <strong>${escapeHtml(friendCodeCandidate.petName)}</strong>
              (${escapeHtml(friendCodeCandidate.breed)}) as a friend?</div>
            <div class="sync-actions">
              <button id="friend-code-confirm" class="primary" ${friendCodeBusy ? 'disabled' : ''}>Add friend</button>
              <button id="friend-code-cancel" ${friendCodeBusy ? 'disabled' : ''}>Cancel</button>
            </div>
          </div>` : ''}
      </div>`;
  }

  function renderPlayerPets() {
    if (!cloud || !cloud.available) return '';
    return `
      <div id="player-pets-section" class="player-pets">
        <h3>Player pets</h3>
        <div id="player-pets-roster" class="tag">loading…</div>
      </div>`;
  }

  function renderStrayFriends() {
    const s = progression.state;
    const entries = Object.entries(s.friends);
    return `<h3>Stray cats</h3>
      <div class="friends-list">
        ${entries.length
          ? entries
              .sort(([, a], [, b]) => b.greets - a.greets)
              .map(([name, f]) => `<div class="friend-row">
                <span class="friend-icon">${LEVEL_ICON[progression.friendLevel(name)] ?? '♡'}</span>
                <span class="friend-name">${escapeHtml(name)}</span> — ${escapeHtml(f.breed)}, ${f.greets} greets
              </div>`).join('')
          : emptyStateHtml('friends')}
      </div>`;
  }

  // Fetches this device's cross-walk friendships + the other players'
  // public profiles, then fills the "#player-pets-roster" placeholder that
  // render() just emitted. Must be called AFTER root.innerHTML is set (the
  // placeholder has to already exist in the DOM). Errors omit the whole
  // subsection quietly rather than leaving a stuck "loading…" — profiles
  // of players you've walked with are a nice-to-have, not core UI.
  async function loadPlayerPets() {
    const token = ++playerPetsToken;
    try {
      const rows = await cloud.fetchFriendships(cloud.myId);
      // Only players this device booped or added by code (src/metplayers.js):
      // anyone can write a friendships row naming this child.
      const shown = new Set(metOnly(met(), [...new Set(rows.map((r) => (r.a_id === cloud.myId ? r.b_id : r.a_id)))]));
      const otherIds = [...shown];
      const profiles = otherIds.length ? await cloud.fetchProfiles(otherIds) : [];
      if (token !== playerPetsToken) return; // a newer render()/loadPlayerPets() superseded this fetch
      const el = root.querySelector('#player-pets-roster');
      if (!el) return; // section isn't in the current DOM (re-rendered away, e.g. cloud went unavailable)
      const profileById = new Map(profiles.map((p) => [p.player_id, p]));
      // petName/breed/last_seen all arrive from OTHER players' pushProfile
      // calls — untrusted, same class as walk-together roster names —
      // escapeHtml every one of them before interpolating. A blocked
      // playerId (Task 3 — unilateral-friendship mitigation, see
      // src/blocklist.js) is dropped from the roster entirely: greets can
      // still land on this pair server-side, but the player no longer has
      // to look at them here.
      const rowsHtml = rows
        .map((r) => {
          const otherId = r.a_id === cloud.myId ? r.b_id : r.a_id;
          if (!shown.has(otherId) || cloud.isBlocked?.(otherId)) return '';
          const p = profileById.get(otherId);
          if (!p) return '';
          return `<div class="friend-row" data-player-id="${escapeHtml(otherId)}">
            <span class="friend-icon">${heartFor(r.greets)}</span>
            <span class="friend-name">${escapeHtml(safeRemoteName(p.pet_name))}</span> — ${escapeHtml(safeRemoteBreed(p.breed))}, ${escapeHtml(relativeTime(p.last_seen))}
            <button class="friend-hide" data-action="hide-player" data-player-id="${escapeHtml(otherId)}"
              title="Hide this visitor" aria-label="Hide this visitor">✕</button>
          </div>`;
        })
        .filter(Boolean)
        .join('');
      el.outerHTML = rowsHtml
        ? `<div id="player-pets-roster" class="friends-list">${rowsHtml}</div>`
        : `<div id="player-pets-roster" class="tag">No player pets yet — walk together and touch noses!</div>`;
    } catch (err) {
      note('cloud', err);
      if (token !== playerPetsToken) return;
      root.querySelector('#player-pets-section')?.remove();
    }
  }

  // ---- Colony pairing ------------------------------------------------------
  const homeVisible = () => !root.classList.contains('hidden');

  // Exactly one interval: started only when shouldPollPairing says so and none
  // is running, cleared the moment it no longer holds. Called after every
  // render, tab change, show and hide, so the timer can never outlive its
  // reasons (and never doubles).
  function syncPairingPoll() {
    const status = colonySync ? colonySync.status() : null;
    const want = shouldPollPairing(status, { tab: openSheet, visible: homeVisible() });
    if (want && pairTimer === null) {
      pairTimer = setInterval(() => {
        // Re-check on every tick: a tick must never run on stale reasons.
        if (!shouldPollPairing(colonySync.status(), { tab: openSheet, visible: homeVisible() })) {
          syncPairingPoll();
          return;
        }
        colonySync.pull(); // single-flight, never rejects; onChange re-renders on news
      }, PAIRING_POLL_MS);
    } else if (!want && pairTimer !== null) {
      clearInterval(pairTimer);
      pairTimer = null;
    }
  }

  // Toast once when a pending pairing turns into a shared colony, whichever
  // way it got there: my accept, or my join answered on a poll. The flag is
  // cleared the moment it fires, so a second render cannot repeat it.
  function noteColonyPairing(status) {
    if (!colonySync) return;
    // My typed code's join vanished on a good sync and I'm still unpaired: the
    // inviter said No. Set once, here, on the transition; the next pairing
    // step clears it (runPairing).
    if (theySaidNo(lastPairStatus, status)) pairError = PAIR_DECLINED_LINE;
    lastPairStatus = status;
    if (status.mode === 'paired' && pairingWasPending) {
      pairingWasPending = false;
      const partner = progression.state.colony && progression.state.colony.partner;
      const name = partner && partner.petName ? String(partner.petName) : 'your partner';
      try { toast?.(`You're sharing a colony with ${name}! 🐾`); } catch { /* a toast is never worth a crash */ }
      // Deferred one tick: this runs inside render(), which runs inside the
      // in-flight pull's onChange, so a pull() right now is single-flight and
      // would just return the running promise. After the tick the inviter
      // really fetches the joiner's cats. It cannot loop: onChange re-renders
      // only on a real change.
      setTimeout(() => colonySync.pull(), 0); // uploads both players' earlier local cats (Task 5's catch-up)
    } else {
      pairingWasPending = pairingPending(status);
    }
  }

  // One pairing step: show busy, run it, show the plain-English outcome.
  async function runPairing(step, afterOk) {
    if (!colonySync || pairBusy) return;
    pairBusy = true;
    pairError = null;
    render();
    let res;
    try {
      res = await step();
    } catch (err) {
      note('cloud', err);
      res = { ok: false, status: 'error' };
    }
    pairBusy = false;
    pairError = pairingErrorLine(res && res.ok ? 'ok' : res && res.status);
    if (res && res.ok) afterOk?.(res);
    render();
  }

  // One trade step: show busy, run it, show the plain-English outcome. The
  // "Swapped! You got …" toast is NOT raised here: colonySync reports each
  // applied trade once (onTradesApplied, wired in main.js), whichever pull
  // applied it.
  async function runTrade(step) {
    if (!colonySync || tradeBusy) return;
    tradeBusy = true;
    tradeError = null;
    render();
    let res;
    try {
      res = await step();
    } catch (err) {
      note('cloud', err);
      res = { ok: false, status: 'error' };
    }
    tradeBusy = false;
    tradeConfirmId = null; // whatever happened, the next accept starts from its first click
    tradeError = tradeErrorLine(res && res.ok ? 'ok' : res && res.status);
    render();
  }

  // ---- "While you were out" (Task 10) ---------------------------------------
  // The card lives OUTSIDE #homebase: render() rebuilds root.innerHTML on every
  // roster change and sync, which would wipe a card mounted inside it.
  const utcToday = () => new Date().toISOString().slice(0, 10);
  let newsEl = null;
  let newsShown = null; // what the card displayed, for markColonySeen on dismiss

  function closeNews(markSeen) {
    if (!newsEl) return;
    newsEl.remove();
    newsEl = null;
    const seen = newsShown;
    newsShown = null;
    // Dismissing is what marks it read; closing because a walk began is not.
    // Only what the card showed is marked, not what merged while it was up.
    if (markSeen) {
      try { progression.markColonySeen(utcToday(), seen || undefined); } catch (err) { console.warn('Whisker Walk: could not mark news seen', err); note('save', err); }
      showClanMoment(); // it waited for this card
    }
    syncNearbyCard();
  }

  // showNews(html, seen): put the card over the home base. html is renderNewsHtml's
  // output (already escaped); '' or a card already up shows nothing. `seen` is
  // colonyNews's snapshot of what the card shows, marked read on dismiss. Returns
  // whether it was shown.
  function showNews(html, seen) {
    if (typeof html !== 'string' || !html || newsEl || noticeEl || momentEl || visitOpen() || confirmCard.isOpen() || !homeVisible()) return false;
    newsShown = seen && typeof seen === 'object' ? seen : null;
    newsEl = document.createElement('div');
    newsEl.id = 'colony-news';
    newsEl.className = 'colony-news';
    newsEl.innerHTML = html;
    newsEl.addEventListener('click', (e) => {
      if (e.target.id === 'colony-news-ok') closeNews(true);
    });
    newsEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeNews(true);
    });
    root.after(newsEl);
    syncNearbyCard(); // the nearby card steps aside
    newsEl.querySelector('#colony-news-ok')?.focus();
    return true;
  }

  // showNotice(text): a one-line card (the Rosa farewell) over the home base,
  // with its own element and handlers. It is not the news, so dismissing it
  // never marks anything read; showNews yields to it and the news stays unread.
  let noticeEl = null;

  function closeNotice() {
    if (!noticeEl) return;
    noticeEl.remove();
    noticeEl = null;
    showClanMoment(); // it waited for this card
    syncNearbyCard();
  }

  function showNotice(text) {
    if (typeof text !== 'string' || !text || noticeEl || momentEl || visitOpen() || confirmCard.isOpen() || !homeVisible()) return false;
    noticeEl = document.createElement('div');
    noticeEl.id = 'home-notice';
    noticeEl.className = 'colony-news';
    const card = document.createElement('div');
    card.className = 'colony-news-card';
    const line = document.createElement('p');
    line.className = 'colony-notice-line';
    line.textContent = text;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'colony-news-btn';
    ok.textContent = 'OK';
    ok.addEventListener('click', closeNotice);
    noticeEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeNotice();
    });
    card.append(line, ok);
    noticeEl.append(card);
    root.after(noticeEl);
    syncNearbyCard(); // the nearby card steps aside
    ok.focus();
    return true;
  }

  // "Are you sure?" (confirmcard.js), for Start over and putting a kept copy
  // back. It goes up only when no other card is, and they wait for it.
  const confirmCard = createConfirmCard({
    mount: (el) => {
      root.after(el);
      syncNearbyCard(); // the nearby card steps aside
    },
    blocked: () => !homeVisible() || !!(newsEl || noticeEl || momentEl || visitOpen()),
    onClosed: () => {
      // the cards that waited behind this one may go up now
      if (!showClanMoment()) { try { onCardsClosed?.(); } catch (err) { console.warn('Whisker Walk: cards-closed hook failed', err); note('ui', err); } }
      syncNearbyCard();
    },
  });

  // ---- The nearby card ------------------------------------------------------
  // "<Name> is starting a walk nearby. Join?" over the cat's screen, when the
  // app has found a room on the local network (game/nearby.js). It is the
  // lowest card there is: it goes up only when no other card, sheet, room or
  // walk is, and when any other card goes up it steps aside without being
  // dismissed, to come back after. Each card's show and close, and every
  // render, ends in syncNearbyCard, which is the one place that decides.
  let nearbyEl = null;
  let nearbyShown = null; // the room the card is for
  let nearbyBusy = false; // a Join from the card is on its way

  function removeNearbyCard() {
    if (!nearbyEl) return;
    nearbyEl.remove();
    nearbyEl = null;
    nearbyShown = null;
  }

  function nearbyCardDue() {
    if (!nearby?.available || nearbyBusy || !shown || !greeted || !homeVisible()) return null;
    if (openSheet || dressing?.ui?.builder || newsEl || noticeEl || momentEl || visitOpen() || confirmCard.isOpen()) return null;
    return nearby.cardRoom(); // null while a room is pending
  }

  function syncNearbyCard() {
    if (!nearby?.available) return;
    const due = nearbyCardDue();
    if (nearbyEl && (!due || due.code !== nearbyShown.code)) removeNearbyCard();
    if (!due || nearbyEl) return;
    nearbyShown = due;
    nearbyEl = document.createElement('div');
    nearbyEl.id = 'nearby-card';
    nearbyEl.className = 'colony-news nearby-card';
    const card = document.createElement('div');
    card.className = 'colony-news-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'A walk nearby');
    card.setAttribute('tabindex', '-1');
    const line = document.createElement('p');
    line.className = 'colony-notice-line';
    line.textContent = `${safeRemoteName(due.name)} is starting a walk nearby. Join?`; // text, never markup
    const codeLine = document.createElement('p');
    codeLine.className = 'nearby-card-code';
    codeLine.textContent = nearbyCodeLine(due.code);
    const btns = document.createElement('div');
    btns.className = 'nearby-card-btns';
    const join = document.createElement('button');
    join.type = 'button';
    join.className = 'colony-news-btn';
    join.textContent = 'Join';
    join.addEventListener('click', () => joinNearby(due.code, null));
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'nearby-card-later';
    later.textContent = 'Not now';
    const notNow = () => {
      nearby.dismiss(due.code); // its change comes back here and takes the card down
      removeNearbyCard();
      // the cards that waited behind this one may go up now
      if (!showClanMoment()) { try { onCardsClosed?.(); } catch (err) { console.warn('Whisker Walk: cards-closed hook failed', err); note('ui', err); } }
    };
    later.addEventListener('click', notNow);
    nearbyEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') notNow();
    });
    btns.append(join, later);
    card.append(line, codeLine, btns);
    nearbyEl.append(card);
    root.after(nearbyEl);
    // The card takes focus, not Join: it arrives by itself, and an Enter
    // already on its way to Start must never join a room.
    try { card.focus?.({ preventScroll: true }); } catch { /* a nicety */ }
  }

  // Join a room found nearby, from a row's button (btn) or from the card
  // (btn null). The join itself is the typed code's: rooms.join(code), which
  // checks the code's shape again. Without a cat name there is nobody to
  // join as, so she is taken to the name box and told why.
  async function joinNearby(code, btn) {
    if (nearbyBusy) return;
    const fromCard = !btn;
    if (!validPetName(progression.state.petName ?? '')) {
      nameNeeded = true;
      removeNearbyCard();
      if (openSheet === 'together') render(); else setSheet('together');
      try { root.querySelector('#wt-petname-input')?.focus?.({ preventScroll: true }); } catch { /* a nicety */ }
      return;
    }
    joinError = null;
    if (btn) btn.disabled = true;
    nearbyBusy = true;
    removeNearbyCard();
    let res;
    try { res = await rooms.join(code); } catch { res = { ok: false }; } finally { nearbyBusy = false; }
    if (!res || !res.ok) {
      joinError = 'Could not join that walk — try again, or type the room code.';
      if (fromCard) nearby.dismiss(code); // the card does not ask again; the row stays
    }
    if (!homeVisible()) return; // a walk began meanwhile
    // From the card she lands in the room: who is in it, and Start.
    if (fromCard && openSheet !== 'together') setSheet('together'); else render();
  }

  // Tells game/nearby.js what is showing (it decides what the app may do on
  // the local network from that), and counts opening Play together as the
  // first use. Called wherever the pairing poll is synced: after every
  // render, and on show and hide.
  function syncNearby() {
    if (!nearby?.available) return;
    const visible = homeVisible();
    if (visible && openSheet === 'together') nearby.noteOptIn();
    nearby.setScreen(!visible ? 'hidden' : !openSheet ? 'home' : openSheet === 'together' ? 'together' : 'other');
    syncNearbyCard();
  }

  // ---- The clan moment (Launch A) -------------------------------------------
  // "The clans have noticed you!": the five clan cards, once, when the Woods
  // opens for a Clan Edition kid with no pick (clanpicker.clanMomentDue). Like
  // the news card it lives outside #homebase, so render() can't wipe it. It
  // never stacks: it waits for the visit celebration, the Rosa notice and the
  // news card (each one's close tries it again), and they wait for it. This
  // device remembers it was dismissed (localStorage); the pick itself is the
  // save's clanPick, as before.
  let momentEl = null;
  let greeted = false; // the boot greeting has run: show() may now bring the moment up
  const momentStore = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
  let momentDismissed = false; // this session's memory, for a device with no storage
  function momentSeen() {
    if (momentDismissed) return true;
    try { return momentStore()?.getItem?.(MOMENT_SEEN_KEY) === '1'; } catch { return false; }
  }
  function markMomentSeen() {
    momentDismissed = true;
    try { momentStore()?.setItem?.(MOMENT_SEEN_KEY, '1'); } catch { /* private window: this session only */ }
  }
  function closeClanMoment(seen) {
    if (!momentEl) return;
    momentEl.remove();
    momentEl = null;
    if (!seen) return; // a walk is starting: nothing more goes up now
    markMomentSeen();
    try { root.querySelector('#btn-start')?.focus?.({ preventScroll: true }); } catch { /* a nicety */ }
    // the news card gave way to the moment: it may show now
    try { onCardsClosed?.(); } catch (err) { console.warn('Whisker Walk: cards-closed hook failed', err); note('ui', err); }
    syncNearbyCard();
  }
  // force: Change place's clan line (shown even after "Not yet", and with a
  // clan already picked, to change it: that line is the only way to).
  function showClanMoment({ force = false } = {}) {
    if (!shown || momentEl || newsEl || noticeEl || visitOpen() || confirmCard.isOpen() || !homeVisible() || dressing?.ui?.builder) return false;
    // home, or Change place (a border crossing lands there); never over another sheet
    if (!force && openSheet && openSheet !== 'places') return false;
    const s = progression.state;
    const due = clanMomentDue(s, CATALOG) || (force && isClanEdition(s) && !!clanPickerModel(s).mine);
    if (!due || (!force && momentSeen())) return false;
    closeWelcome();
    const partner = s.colony?.partner?.petName;
    momentEl = document.createElement('div');
    momentEl.id = 'clan-moment';
    momentEl.className = 'colony-news join-moment';
    momentEl.innerHTML = renderClanMomentHtml(clanPickerModel(s), typeof partner === 'string' && partner ? partner : 'your partner');
    momentEl.addEventListener('click', (e) => {
      const card = e.target.closest?.(`[${PICK_ATTR}]`);
      if (card) {
        pickClan(card.getAttribute(PICK_ATTR)); // renders home under the card first,
        closeClanMoment(true); // so focus lands on the new Start
        return;
      }
      if (e.target.closest?.('.join-moment-later')) closeClanMoment(true);
    });
    momentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeClanMoment(true); return; }
      // aria-modal: Tab stays inside the card
      if (e.key !== 'Tab') return;
      const btns = [...(momentEl.querySelectorAll?.('button:not([aria-disabled="true"])') ?? [])];
      if (!btns.length) return;
      const i = btns.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? btns.length - 1 : i - 1) : (i === -1 || i === btns.length - 1 ? 0 : i + 1);
      e.preventDefault();
      btns[next].focus?.();
    });
    root.after(momentEl);
    syncNearbyCard(); // the nearby card steps aside
    // The card itself takes focus, not a clan: an Enter still held from the
    // button that brought her here must never pick one.
    momentEl.querySelector('.join-moment-card')?.focus?.({ preventScroll: true });
    return true;
  }

  // ---- Visit milestones ----------------------------------------------------
  // The celebration is mounted on document.body, outside #homebase, like the
  // news card, so render() can't wipe it. It never touches the save itself:
  // wearing happens here, and only through wearPendingVisitPrize() (a no-op
  // when nothing is pending, so a cycle-back's outfit is never changed) or the
  // explicit "Wear it" button. Every wear re-renders, so the hero cat shows the
  // prize (that is style C's reveal).
  let visitClosed = null; // the caller's onClosed for the celebration that is up
  const celebration = createVisitCelebration(document.body, {
    onOpen: () => {
      confirmCard.close(); // never under the celebration: the question goes unanswered
      try { onCelebrate?.(); } catch (err) { console.warn('Whisker Walk: celebration sound failed', err); note('audio', err); }
      progression.wearPendingVisitPrize();
      render();
    },
    onWear: (id) => {
      progression.equipAccessory(id);
      render();
    },
    onClose: (reason) => {
      progression.wearPendingVisitPrize(); // a mid-celebration Start still wears it
      render();
      const cb = visitClosed;
      visitClosed = null;
      cb?.(reason);
      if (reason !== 'walk') showClanMoment(); // after the farewell and news, which go first
    },
  });
  function visitOpen() { return celebration.isOpen(); }
  const heroStage = () => root.querySelector('#dr-stage');

  // The welcome line: a small line over the hero stage that fades by itself
  // and never takes a click (pointer-events: none in style.css).
  let welcomeEl = null;
  let welcomeTimer = null;
  let welcomeArmTimer = null;
  let welcomeArmed = false;
  // The bubble is position: fixed beside the cat's head; if the page scrolls
  // (a tap on "Where to" does) it would float over other buttons, so any
  // scroll closes it. Scrolls in the first moments (the render that put the
  // bubble up) are ignored.
  function onWelcomeScroll() { if (welcomeArmed) closeWelcome(); }
  function closeWelcome() {
    if (welcomeTimer !== null) clearTimeout(welcomeTimer);
    if (welcomeArmTimer !== null) clearTimeout(welcomeArmTimer);
    welcomeTimer = null;
    welcomeArmTimer = null;
    welcomeArmed = false;
    document.removeEventListener?.('scroll', onWelcomeScroll, { capture: true });
    welcomeEl?.remove();
    welcomeEl = null;
  }
  function showWelcome(text) {
    closeWelcome();
    if (!text || !homeVisible() || openSheet || dressing?.ui?.builder) return;
    welcomeEl = document.createElement('div');
    welcomeEl.className = 'visit-welcome';
    welcomeEl.setAttribute('role', 'status');
    welcomeEl.textContent = text;
    let rect = null;
    try { rect = heroStage()?.getBoundingClientRect?.() ?? null; } catch { rect = null; }
    // A speech bubble that stays off the cat's face: in the stage's top-left
    // corner (the cat rests at a three-quarter turn, so that corner is empty);
    // on a narrow stage it runs along the top edge instead, above the head.
    welcomeEl.setAttribute('data-side', 'corner');
    if (rect && rect.width > 0) {
      const narrow = rect.width < 480;
      if (narrow) welcomeEl.style.fontSize = '0.8rem';
      welcomeEl.style.top = `${Math.round(rect.top + 10)}px`;
      welcomeEl.style.left = `${Math.round(rect.left + 12)}px`;
      welcomeEl.style.maxWidth = `${Math.round(narrow ? rect.width - 120 : Math.min(190, rect.width * 0.3))}px`;
    }
    document.body.appendChild(welcomeEl);
    document.addEventListener?.('scroll', onWelcomeScroll, { capture: true, passive: true });
    welcomeArmTimer = setTimeout(() => { welcomeArmTimer = null; welcomeArmed = true; }, 60);
    welcomeTimer = setTimeout(closeWelcome, WELCOME_MS);
  }

  // showVisit(result, { onClosed }): result is progression.recordVisit()'s.
  // A milestone shows the celebration and returns true; onClosed(reason) runs
  // once when it closes ('done', or 'walk' when a walk started over it).
  // Otherwise the welcome line shows, it returns false, and onClosed is not called.
  function showVisit(result, { onClosed } = {}) {
    greeted = true;
    // Hidden: a walk already started (a room partner pressed Start during the
    // splash). Nothing goes up over the walk, but the prize is still worn.
    if (!homeVisible()) {
      progression.wearPendingVisitPrize();
      return false;
    }
    const milestone = result && result.milestone;
    if (milestone && !visitOpen()) {
      visitClosed = typeof onClosed === 'function' ? onClosed : null;
      const shownOk = celebration.show(milestone, {
        petName: activeCat(progression.state).name || '',
        anchor: () => heroStage()?.getBoundingClientRect?.(),
        thumb: thumbs?.accessories?.[milestone.prize?.id],
      });
      if (shownOk) {
        // The badge pops once now that the greeting is in view (not on the
        // first render, which the splash covers).
        try { root.querySelector('.dr-visit')?.classList.add('pop'); } catch { /* a nicety */ }
        syncNearbyCard(); // the nearby card steps aside
        return true;
      }
      visitClosed = null;
    }
    const n = Math.floor(asFiniteNonNeg(result && result.visits, 0));
    if (n >= 1) showWelcome(welcomeLine(n));
    showClanMoment();
    syncNearbyCard(); // the greeting has run: a room found meanwhile may ask now
    return false;
  }

  // The dressing room's hero cat: ONE stage (one WebGL canvas) and ONE
  // controller per home base, made on the first render that needs them. The
  // canvas is re-mounted into the fresh #dr-stage after every render
  // (afterRender), so a colony poll or a roster change mid-drag keeps the cat.
  let stage = null;
  let dressing = null;
  let nudgePlace = null; // a place she could not open: wobbles once, on the next render
  let thumbs = null; // menuThumbnails(), made once with the dressing room
  function ensureDressing() {
    if (dressing) return dressing;
    thumbs = menuThumbnails();
    stage = createCatStage({ buildCat, thumbs });
    dressing = createDressingRoom({
      progression, catalog: CATALOG, stage, sync, thumbs,
      onChange: render,
      onOpenSheet: (id) => setSheet(id),
      onProfileChange: () => rooms?.retrackProfile?.(),
      onCatSaved: () => rooms?.pushProfileNow?.(),
      // Change place: a place she can walk is picked and she is back home with
      // its card; a locked or unaffordable one stays, but answers the tap: it
      // wobbles (the render this tap causes) and one line says what is missing.
      onPlaced: (id, outcome) => {
        if (outcome) {
          if (openSheet === 'places') { openSheet = null; backTo = null; }
          return;
        }
        const why = placeWhyLine(progression.state, CATALOG, id);
        if (!why) return;
        nudgePlace = id;
        try { toast?.(why); } catch { /* a toast is never worth a crash */ }
      },
    });
    return dressing;
  }

  // The sheets on offer: Sync only when cloud saves are set up, Play together
  // only when multiplayer is. Menu and Change place always. (The den shop
  // lives inside the den now — ui/denshopview.js.)
  function availableSheets() {
    return HOME_SHEETS.filter((id) => {
      if (id === 'sync') return !!(sync && sync.available);
      if (id === 'together') return !!(rooms && rooms.available);
      return true;
    });
  }

  // The 👫 button beside Start, on the dressing room and on every sheet but
  // its own: one tap to the party screen. In a room it says how many are in.
  // (A phone shows it round, the 👫 only; the words stay its name.)
  function playTogetherHtml(roomState) {
    if (!rooms || !rooms.available || openSheet === 'together') return '';
    const n = roomState && Array.isArray(roomState.roster) ? roomState.roster.length : 0;
    const words = roomState ? `${n} together` : 'Play together';
    return `<button id="btn-play-together" class="dr-together" type="button" aria-label="${escapeHtml(words)}">`
      + `<span aria-hidden="true">👫</span><span class="dr-together-words" aria-hidden="true">${escapeHtml(words)}</span></button>`;
  }

  // Start, with Play together beside it when multiplayer is on.
  function startRowHtml(roomState) {
    return `<div class="dr-start-row">${playTogetherHtml(roomState)}${renderStartButtonHtml(roomState)}</div>`;
  }

  // null (or anything not on offer) = back to the dressing room. A sheet opened
  // from the Menu goes back to the Menu; the Menu and Change place go home.
  let backTo = null;
  function setSheet(id) {
    const want = resolveSheet(id);
    const next = want && availableSheets().includes(want) ? want : null;
    const prev = openSheet;
    backTo = openSheet === 'menu' && next && next !== 'menu' && next !== 'places' ? 'menu' : null;
    openSheet = next;
    backupMsg = null; // a restore's result line is for the sheet it happened on
    // Usage counts: a sheet opened from somewhere else, not a re-open of itself.
    // (Back from a sheet to the Menu is not an open of the Menu.)
    if (next && next !== prev && !(next === 'menu' && prev)) { try { progression.noteUse?.(next); } catch { /* a count, never a blocker */ } }
    render();
    root.scrollTop = 0; // a sheet (or the room) opens at its top
    // Keyboard and screen-reader users land on the new screen's first control,
    // or, going back, on the door they came through (the Menu, a tile, the card).
    try {
      const back = (next === null || next === 'menu') && prev ? root.querySelector(`[data-dr-sheet="${prev}"]`) : null;
      (back ?? (next ? root.querySelector('#hb-back') : null))?.focus?.({ preventScroll: true });
    } catch { /* a nicety */ }
  }

  // ---- The Menu sheet (Launch A) -------------------------------------------
  // The old header's stats line, the rank's next step in plain words, six big
  // kid tiles and a quiet grown-ups row.
  function menuStatsHtml(s) {
    const rank = rankFor(s.lifetimePoints);
    const life = asFiniteNonNeg(s.lifetimePoints, 0);
    const nextLine = rank.next
      ? `${Math.max(0, rank.next.at - life)} ${PAW} more to ${escapeHtml(rank.next.title)}`
      : 'Top rank!';
    // s.streak / s.race come through progression's sanitizers on every load,
    // but this is an innerHTML display path: coerce again here.
    const streakCount = asFiniteNonNeg(s.streak?.count, 0);
    const today = new Date().toISOString().slice(0, 10);
    const raceBestMs = s.race?.date === today ? asFiniteNonNeg(s.race?.bestMs, null) : null;
    // Only the mice this edition can reach (Legacy hides four territories).
    const gold = goldForEdition(s.edition, CATALOG);
    return [
      `<span>🏆 ${escapeHtml(rank.title)} · ${nextLine}</span>`,
      streakCount >= 2 ? `<span>🔥 ${streakCount} days in a row</span>` : '',
      `<span>Best walk ${asFiniteNonNeg(s.bestWalk, 0)} ${PAW}</span>`,
      renderGoldenTallyHtml(goldenFound(s.golden, gold), gold.size),
      raceBestMs != null ? `<span>Today’s race best: ${(raceBestMs / 1000).toFixed(1)}s 🏁</span>` : '',
      s.kitten?.stage === 3 ? '<span>🐱 Mochi lives with you now</span>' : '',
    ].filter(Boolean).join('');
  }

  function menuTileSub(id, s, roomState) {
    if (id === 'skills') return `${SKILLS.filter((k) => hasSkill(s, k.id)).length} of ${SKILLS.length} earned`;
    if (id === 'journal') return 'critters + golden mice';
    if (id === 'together' && roomState) {
      const n = Array.isArray(roomState.roster) ? roomState.roster.length : 0;
      return `${n} together now`;
    }
    return '';
  }

  // My den is a tile, not a sheet: a tap goes straight there (onVisitDen), as
  // its old card at the bottom of Change place did. The den never joins a
  // room walk (main.js starts it on its own), so a room hides it, as before.
  function denTileHtml(roomState) {
    if (roomState) return '';
    return '<button class="hb-tile hb-tile-den" id="btn-visit-den" type="button"><span class="hb-tile-icon" aria-hidden="true">🏠</span>'
      + '<span class="hb-tile-name">My den</span><small>Visit</small></button>';
  }

  function renderMenu(s, roomState) {
    const on = availableSheets();
    const tiles = MENU_TILES.filter((id) => on.includes(id)).map((id) => {
      const sub = menuTileSub(id, s, roomState);
      return `<button class="hb-tile" data-dr-sheet="${id}"><span class="hb-tile-icon" aria-hidden="true">${SHEET_ICON[id]}</span>`
        + `<span class="hb-tile-name">${escapeHtml(SHEET_NAME[id])}</span>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</button>`
        // the den sits where Friends was, after Skills
        + (id === 'skills' ? denTileHtml(roomState) : '');
    }).join('');
    const grown = GROWNUP_SHEETS.filter((id) => on.includes(id))
      .map((id) => `<button class="hb-grownup" data-dr-sheet="${id}"><span aria-hidden="true">${SHEET_ICON[id]}</span> ${escapeHtml(SHEET_NAME[id])}</button>`).join('');
    return `<section class="hb-menu" aria-labelledby="hb-menu-title"><h2 id="hb-menu-title">Menu</h2>
      <p class="hb-menu-stats">${menuStatsHtml(s)}</p>
      <div class="hb-tiles">${tiles}</div>
      <div class="hb-grownups"><p class="hb-grownups-label">For grown-ups</p><div class="hb-grownups-row">${grown}</div></div>
    </section>`;
  }

  // ---- The Change place sheet (Launch A) -----------------------------------
  // Her map and places (the dressing room's) and her clan in one line. The den
  // is a Menu tile now: unlike every place here it starts a walk at once.
  // Day / Dusk, at the top of Change place: the one place it is chosen. Dusk
  // needs the Glow Collar, so without it the choice shows greyed and says so
  // (hidden, she could never find out dusk exists). id dusk-toggle is the real
  // control Start reads when it is on screen.
  function duskChoiceHtml(s) {
    const glow = s.equipped.collar === 'glow';
    return `<div class="hb-dusk${glow ? '' : ' off'}">
      <label class="hb-dusk-switch"><input type="checkbox" id="dusk-toggle" role="switch" aria-label="Dusk walk"${glow ? '' : ' aria-describedby="dusk-why" disabled'} ${glow && duskWanted ? 'checked' : ''} /><span class="hb-dusk-day">☀️ Day</span><span class="hb-dusk-night">🌙 Dusk</span></label>
      ${glow ? '' : '<small class="hb-dusk-why" id="dusk-why">wear the Glow Collar</small>'}
    </div>`;
  }

  function renderPlaces(s, roomState) {
    const d = ensureDressing();
    let line = '';
    if (isClanEdition(s)) {
      const partner = s.colony?.partner?.petName;
      line = clanLineHtml(clanPickerModel(s), typeof partner === 'string' && partner ? partner : 'your partner', { canChoose: woodsOpen(s, CATALOG) });
    }
    return `<section class="hb-places" aria-labelledby="hb-places-title"><h2 id="hb-places-title">Change place</h2>
      ${duskChoiceHtml(s)}
      ${d.placesHtml({ clanLineHtml: line })}
    </section>`;
  }

  // One sheet's content: the same sections the old tabs held.
  function renderSheetBody(id, s, colonyStatus, roomState) {
    switch (id) {
      case 'menu': return renderMenu(s, roomState);
      case 'places': return renderPlaces(s, roomState);
      case 'skills': return `
        <section class="skills-section"><h2>Skills ⭐</h2>
          <p class="skills-intro">Abilities aren’t bought — they’re earned. Pull off the feat and the
            ability is yours forever.</p>
          ${renderSkillsHtml(s)}
          ${isClanEdition(progression.state)
    ? renderFightMovesHtml(s, { owned: progression.ownedMoves(), canBuy: (id) => progression.canBuyMove(id) })
    : ''}
        </section>`;
      case 'colony': return `
        <section class="colony-section"><h2>Colony 🐈</h2>
          ${renderColonyHtml({
            colony: s.colony, me: myId, members: progression.colonyMembers(), now: Date.now(),
            status: colonyStatus, clanRoles: s.clanRoles, clanName: ownClanTitle(s), alliesName: alliesName(s), edition: s.edition,
            owned: s.unlocked.accessories, catalog: CATALOG,
            pairing: {
              busy: pairBusy, error: pairError, code: pairCode,
              hasPetName: validPetName(s.petName ?? ''),
            },
            trades: { give: tradeGive, want: tradeWant, confirmId: tradeConfirmId, busy: tradeBusy, error: tradeError },
          })}
        </section>`;
      // Play together holds every code a child meets: the room's, then (from
      // the old Friends sheet) the friends she walked with and her friend code.
      case 'together': return `
        <section class="walk-together"><h2>Play together 👫</h2>
          ${renderWalkTogether()}
        </section>
        ${cloud && cloud.available ? `<section class="friends-section">
          ${renderPlayerPets()}
          ${renderFriendCode()}
        </section>` : ''}`;
      case 'journal': {
        // Only the mice this edition can reach (Legacy hides four territories).
        const gold = goldForEdition(s.edition, CATALOG);
        return `
        <section class="journal-section"><h2>Journal 📖</h2>
          ${renderJournalHtml(s.journal ?? {}, goldenFound(s.golden, gold), gold.size,
    isClanEdition(progression.state) ? { chasedOff: s.feats?.intruder ?? 0 } : {})}
          <div class="friends-section">${renderStrayFriends()}</div>
        </section>`;
      }
      case 'album': return `
        <section><h2>Album 📸</h2><div class="photos">
          ${album.photos.length
            ? album.photos.map((p) => {
              // p.date is sanitize-shaped (YYYY-MM-DD or absent — see
              // album.js's sanitizePhoto/YMD_PATTERN) via the
              // cloud-load path, but a plain local-storage load never
              // routes through that sanitizer — escapeHtml it too, same
              // as label/area, rather than trust the shape to hold.
              const caption = [escapeHtml(p.label), escapeHtml(p.area), ...(p.date ? [escapeHtml(p.date)] : [])].join(' · ');
              return `<figure class="photo-framed"><img src="${escapeHtml(p.thumb)}" alt="${escapeHtml(p.label)}"><figcaption>${caption}</figcaption></figure>`;
            }).join('')
            : emptyStateHtml('album')}
        </div></section>`;
      case 'sync': return `<section class="walk-together sync-cloud"><h2>Cloud save ☁️</h2>${renderSync()}</section>`;
      case 'settings': return renderSettings();
      case 'controls': return renderControls();
      case 'code': return renderRedeemHtml({ text: redeemText, busy: redeemBusy, result: redeemResult, catalog: CATALOG });
      default: return '';
    }
  }

  // A re-render rebuilds the controls, so the one she was on (a Settings
  // switch, a select) would lose keyboard focus: put it back on its twin.
  function focusedId() {
    try {
      const a = document.activeElement;
      return a && a.id && root.contains?.(a) ? a.id : null;
    } catch { return null; }
  }
  function refocus(id) {
    if (!id) return;
    try {
      const a = document.activeElement;
      if (a && a.id === id && root.contains?.(a)) return; // already there (the dressing room put it back)
      const sel = typeof CSS !== 'undefined' && CSS.escape ? `#${CSS.escape(id)}` : (/^[\w-]+$/.test(id) ? `#${id}` : null);
      if (sel) root.querySelector(sel)?.focus?.({ preventScroll: true });
    } catch { /* focus is a nicety */ }
  }

  function render() {
    const fid = focusedId();
    // The welcome line belongs to the cat on the home screen: a sheet or the
    // cat builder sends it away at once.
    if (openSheet || dressing?.ui?.builder) closeWelcome();
    const s = progression.state;
    showEditionTitle(document, s.edition);
    const colonyStatus = colonySync ? colonySync.status() : { mode: 'local' };
    noteColonyPairing(colonyStatus);
    if (openSheet && !availableSheets().includes(openSheet)) openSheet = null;
    const glowReady = s.equipped.collar === 'glow';
    const roomState = rooms && rooms.available ? rooms.getState() : null;
    // Home's Today's walk card says when dusk is chosen: a small moon, status
    // only (the choice itself is in Change place).
    const duskBadge = glowReady && duskWanted ? '<span class="dr-dusk-badge" role="img" aria-label="Dusk walk">🌙</span>' : '';
    if (openSheet) {
      // Ruling 10: every sheet keeps Start pinned at the bottom (the host-a-
      // room flow presses "Start the walk together" from 👫 Play together). The room
      // isn't rendered here, so this is still the only #btn-start.
      const chosen = Object.prototype.hasOwnProperty.call(CATALOG.areas, s.area) ? s.area : Object.keys(CATALOG.areas)[0];
      // Where the walk actually happens: Legacy walks the Neighborhood in place
      // of a Clan-only choice, and must not name it.
      const areaId = effectiveArea({ area: chosen, edition: s.edition }, CATALOG);
      // Menu and Change place are doors, not screens of their own: no dock.
      const door = openSheet === 'menu' || openSheet === 'places';
      // The dock by sheet: none on the doors or the grown-ups' sheets (no
      // "Start the walk" under "Start over"); the whole dock (Start and Play
      // together) on Play together, whose room starts from it; on the other
      // sheets only where and Start. Dusk is chosen in Change place only; a
      // Start from any dock reads that choice (duskWanted).
      const dock = door || GROWNUP_SHEETS.includes(openSheet) ? 'none' : openSheet === 'together' ? 'full' : 'slim';
      const back = backTo === 'menu' ? '← Back to the menu' : '← Back to my cat';
      // From a sheet the Menu opened, home is two Backs: a cat face at the
      // row's right goes straight there.
      const home = backTo === 'menu'
        ? '<button id="hb-home" class="hb-home" type="button" aria-label="Back to my cat"><span aria-hidden="true">🐱</span></button>' : '';
      root.innerHTML = `
      <div class="homebase-scroll hb-sheet${door ? ' hb-door' : ''}" data-sheet="${escapeHtml(openSheet)}">
        <div class="hb-sheet-head"><button id="hb-back" class="hb-back">${back}</button>${home}</div>
        ${renderSheetBody(openSheet, s, colonyStatus, roomState)}
        ${dock === 'none' ? '' : `<footer class="hb-sheet-dock">
          <div class="where"><img src="${escapeHtml(PLACE_PICTURE(areaId))}" alt="" onerror="this.remove()">Walking in <b>${escapeHtml(placeName(areaId, s.edition, CATALOG))}</b></div>
          ${dock === 'full' ? startRowHtml(roomState) : `<div class="dr-start-row">${renderStartButtonHtml(roomState)}</div>`}
        </footer>`}
      </div>`;
      refocus(fid);
      // The wobble: the card (or map region) she tapped, in the fresh DOM.
      // Skipped when she asked for reduced motion (the CSS also skips it for
      // the system setting).
      const nudge = nudgePlace;
      nudgePlace = null;
      if (nudge && !settings?.all?.()?.reducedMotion) {
        try {
          const q = String(nudge).replace(/["\\]/g, '');
          for (const el of root.querySelectorAll?.(`[data-dr-place="${q}"]`) ?? []) el.classList.add('nudge');
        } catch { /* a nicety */ }
      }
      if (stage) stage.setVisible(false); // no frames for a cat nobody can see
      syncPairingPoll();
      syncNearby();
      if (cloud && cloud.available && openSheet === 'together') loadPlayerPets();
      return;
    }
    const rank = rankFor(s.lifetimePoints);
    const points = asFiniteNonNeg(s.points, 0);
    // The top bar copies the walk HUD: the title as plain words (Launch A: the
    // edition switch lives in Settings only), the points and rank pills, the
    // quiet visit pill and the Menu door.
    const headerHtml = `<h1 class="dr-title">${PAW} Whisker Walk 2 · <span class="dr-edition">${escapeHtml(editionTitle(s.edition))}</span></h1>`
      + `<div class="hb-pill hb-points" role="img" aria-label="${points} whisker points">${PAW} ${points}</div>`
      + `<div class="hb-pill hb-rank">🏆 ${escapeHtml(rank.title)}</div>`
      + visitBadgeHtml(s.visits)
      + '<button class="hb-menu-btn" data-dr-sheet="menu" aria-label="Menu"><span aria-hidden="true">☰</span><span class="hb-menu-word"> Menu</span></button>';
    const room = ensureDressing();
    if (room.deferRender?.(root)) return; // she is typing her cat's name: runs on blur
    const f = room.captureFocus(root);
    root.innerHTML = room.html({
      headerHtml, startHtml: startRowHtml(roomState), extrasHtml: duskBadge, rankTitle: rank.title,
    });
    room.afterRender(root);
    room.restoreFocus(root, f);
    refocus(fid);
    stage.setVisible(shown);
    syncPairingPoll();
    syncNearby();
  }

  // A clan card: save the pick, then tell the sibling's
  // device (fire-and-forget; a refusal changes nothing and sends nothing).
  // Re-picking the clan already picked sends nothing once that pick has been
  // pushed; after a failed push a re-tap is the way to try again.
  let pushedPick;
  function pickClan(id) {
    const before = progression.state.clanPick?.mine ?? null;
    if (progression.setClanPick(id) && (progression.state.clanPick?.mine !== before || pushedPick !== id)) {
      pushedPick = id;
      Promise.resolve(colonySync?.noteOwnPick())
        .then((ok) => { if (ok === false && pushedPick === id) pushedPick = undefined; })
        .catch(() => { if (pushedPick === id) pushedPick = undefined; });
    }
    render();
  }

  root.addEventListener('click', async (e) => {
    // The dressing room's own controls (portraits, slots, picker, places,
    // the wardrobe, the sheet doors and tiles) go to its controller first.
    if (dressing && dressing.handleClick(e)) return;
    if (e.target.closest?.('#hb-back')) {
      setSheet(backTo);
      return;
    }
    if (e.target.closest?.('#hb-home')) {
      setSheet(null);
      return;
    }
    // Change place's clan line (Choose, or Change once picked): the cards again.
    if (e.target.closest?.(`[${MOMENT_ATTR}]`)) {
      showClanMoment({ force: true });
      return;
    }
    const buyMoveBtn = e.target.closest?.('[data-buy-move]');
    if (buyMoveBtn) {
      progression.buyMove(buyMoveBtn.dataset.buyMove);
      render();
      return;
    }
    const clanCard = e.target.closest?.(`[${PICK_ATTR}]`);
    if (clanCard) {
      pickClan(clanCard.dataset.clanPick);
      return;
    }
    if (e.target.id === 'colony-pair-open') {
      await runPairing(() => colonySync.pairing.open());
      return;
    }
    if (e.target.id === 'colony-pair-join') {
      const input = root.querySelector('#colony-pair-code');
      pairCode = sanitizeInviteCode(input ? input.value : pairCode);
      await runPairing(() => colonySync.pairing.join(pairCode), () => { pairCode = ''; });
      return;
    }
    if (e.target.id === 'colony-pair-yes' || e.target.id === 'colony-pair-no') {
      const accept = e.target.id === 'colony-pair-yes';
      await runPairing(() => colonySync.pairing.answer(accept));
      return;
    }
    // Trading. Every button carries data-trade-action. "accept" (the Swap!
    // button) only asks "are you sure?": it must NOT answer. The swap is final,
    // so the answer goes out only from "confirm" (Yes — swap forever).
    const tradeBtn = e.target.closest('[data-trade-action]');
    if (tradeBtn && colonySync) {
      const action = tradeBtn.dataset.tradeAction;
      const id = Number(tradeBtn.dataset.tradeId);
      const hasId = Number.isSafeInteger(id) && id > 0;
      if (tradeBusy) return;
      if (action === 'offer') {
        const give = root.querySelector('[data-trade-give]');
        const want = root.querySelector('[data-trade-want]');
        if (!give || !want) return;
        tradeGive = give.value;
        tradeWant = want.value;
        await runTrade(() => colonySync.trade.offer(tradeGive, tradeWant));
      } else if (action === 'cancel' && hasId) {
        await runTrade(() => colonySync.trade.cancel(id));
      } else if (action === 'decline' && hasId) {
        await runTrade(() => colonySync.trade.answer(id, false));
      } else if (action === 'accept' && hasId) {
        tradeConfirmId = id;
        tradeConfirmShownAt = Date.now();
        tradeError = null;
        render();
      } else if (action === 'back') {
        tradeConfirmId = null;
        render();
      } else if (action === 'confirm' && hasId) {
        // The swap is final: only a deliberate second click counts, never the
        // tail of a double-tap on Swap! (see confirmClickAllowed).
        if (!confirmClickAllowed({ confirmId: tradeConfirmId, id, shownAt: tradeConfirmShownAt, now: Date.now(), detail: e.detail })) return;
        await runTrade(() => colonySync.trade.answer(id, true));
      }
      return;
    }
    if (e.target.id === 'btn-start') {
      if (dressing && !dressing.startAllowed({ detail: e.detail })) return; // the tail of a double-tap on Done
      const dusk = root.querySelector('#dusk-toggle');
      // A previewed cat or a tried-on accessory is never walked: the walk
      // reads the save's equipped cat and accessories (Review Focus 1).
      // Start is never beside the dusk switch now (it is in Change place, which
      // has no dock), so the choice made there stands (while the Glow Collar
      // that allows it is still on).
      const duskMode = dusk ? !!dusk.checked : !!(duskWanted && progression.state.equipped.collar === 'glow');
      dressing?.clearPreview();
      // Redraw without the preview, so "(trying)" can't linger if this start
      // doesn't leave home (a room start that fails).
      render();
      onStartWalk({ duskMode });
      return;
    }
    if (e.target.closest?.('#btn-play-together')) {
      setSheet('together');
      return;
    }
    if (e.target.closest?.('#btn-visit-den')) {
      onVisitDen?.();
      return;
    }
    // Start over asks first, in the page (window.confirm is a silent "no" in
    // the iOS app). Progression keeps a copy of what it erases, which Cloud
    // save can bring back; the album's photos are not kept.
    if (e.target.id === 'btn-reset') {
      confirmCard.ask({
        text: 'Erase all progress and start over?',
        note: sync && sync.available ? 'A copy is kept, so Cloud save ☁️ can bring it back. Photos are not kept.' : '',
        yes: 'Yes, start over',
        danger: true,
        returnFocus: () => root.querySelector('#btn-reset')?.focus?.({ preventScroll: true }),
        onYes: () => {
          progression.reset();
          album.clear();
          backupMsg = null;
          dressing?.clearPreview(); // a preview of the old save means nothing now
          openSheet = null; // back to the (fresh) cat
          render();
          root.scrollTop = 0;
        },
      });
      return;
    }
    // Cloud save's kept copies: put one back, after asking.
    const restoreBtn = e.target.closest?.('[data-backup-restore]');
    if (restoreBtn) {
      const kind = restoreBtn.getAttribute('data-backup-restore');
      if (!Object.hasOwn(BACKUP_ASK, kind)) return;
      confirmCard.ask({
        ...BACKUP_ASK[kind],
        returnFocus: () => root.querySelector(`[data-backup-restore="${kind}"]`)?.focus?.({ preventScroll: true }),
        onYes: () => {
          let ok = false;
          try { ok = progression.restoreBackup(kind); } catch (err) { console.warn('Whisker Walk: restore failed', err); note('save', err); }
          if (ok) dressing?.clearPreview();
          backupMsg = ok ? 'Done! Your earlier progress is back.' : 'That didn’t work, so nothing was changed.';
          render();
          // a copy from before Rosa's retirement says her farewell, as a cloud load does
          if (ok) {
            const farewell = progression.takeFarewell();
            if (farewell) showNotice(farewell);
          }
        },
      });
      return;
    }
    // A picked star name goes through the same validated path as the text
    // field: the chosen name IS state.petName (no new field, spec §6.1).
    const starPick = e.target.dataset?.starName;
    if (starPick !== undefined) {
      if (goodNewPetName(starPick)) {
        progression.setPetName(starPick);
        petNameError = null;
      } else {
        petNameError = 'Cat names are 2–16 letters, spaces, or hyphens.';
      }
      render();
      return;
    }
    if (e.target.id === 'wt-petname-save') {
      const input = root.querySelector('#wt-petname-input');
      const name = (input?.value ?? '').trim();
      if (goodNewPetName(name)) {
        progression.setPetName(name);
        petNameError = null;
      } else {
        petNameError = validPetName(name) ? 'Please pick a different name.' : 'Cat names are 2–16 letters, spaces, or hyphens.';
      }
      render();
      return;
    }
    if (e.target.id === 'wt-host') {
      nearby?.noteOptIn(); // hosting is what makes this device findable nearby
      joinError = null;
      e.target.disabled = true;
      const res = await rooms.host();
      if (!res.ok) joinError = 'Could not host a room — try again.';
      render();
      return;
    }
    if (e.target.id === 'wt-join') {
      const input = root.querySelector('#wt-join-code');
      const code = (input?.value ?? '').trim().toUpperCase();
      if (code.length !== 4) {
        joinError = 'Enter the 4-character room code.';
        render();
        return;
      }
      e.target.disabled = true;
      const res = await rooms.join(code);
      if (!res.ok) joinError = 'Could not join that room — check the code and try again.';
      else joinError = null;
      render();
      return;
    }
    // A room found nearby: its row's Join.
    const nearbyCode = e.target.dataset?.nearbyCode;
    if (nearbyCode !== undefined && nearby?.available) {
      await joinNearby(nearbyCode, e.target);
      return;
    }
    if (e.target.id === 'wt-pair-walk') {
      joinError = null;
      e.target.disabled = true;
      const res = await rooms.walkWithPartner();
      if (!res.ok) joinError = 'Could not start your walk together — try again.';
      render();
      return;
    }
    if (e.target.id === 'wt-leave') {
      await rooms.leave();
      render();
      return;
    }
    if (e.target.dataset.action === 'hide-player') {
      // Unilateral-friendship mitigation (Task 3, final fix wave): stop
      // showing this visitor in the roster (and, on future walks, as a
      // ghost) on THIS device — see src/blocklist.js for why this can't be
      // a server-side fix. Re-fetches + re-filters the roster rather than
      // just removing the DOM row, so the "No player pets yet…" empty
      // state appears correctly if this was the last one.
      cloud.blockPlayer?.(e.target.dataset.playerId);
      loadPlayerPets();
      return;
    }
    if (e.target.id === 'friend-code-add') {
      const input = root.querySelector('#friend-code-input');
      const prefix = normalizeFriendCode(input?.value ?? '');
      friendCodeError = null;
      friendCodeCandidate = null;
      friendCodeSuccess = null;
      if (!FRIEND_CODE_RE.test(prefix)) {
        friendCodeError = 'Enter a valid friend code, e.g. CAT-3FA85F64.';
        render();
        return;
      }
      friendCodeBusy = true;
      render();
      try {
        const rows = await cloud.findByFriendCode(prefix);
        const self = rows.some((r) => r.player_id === cloud.myId);
        const match = rows.find((r) => r.player_id !== cloud.myId);
        if (match) {
          friendCodeCandidate = { playerId: match.player_id, petName: safeRemoteName(match.pet_name), breed: safeRemoteBreed(match.breed) };
        } else {
          friendCodeError = self ? "That's your own code!" : 'No player found with that code.';
        }
      } catch (err) {
        note('cloud', err);
        friendCodeError = 'Could not look up that code — try again.';
      }
      friendCodeBusy = false;
      render();
      return;
    }
    if (e.target.id === 'friend-code-confirm') {
      friendCodeBusy = true;
      render();
      try {
        const result = await cloud.addFriendByCode(friendCodeCandidate.playerId);
        // 'already': a friendship row for this pair already exists (any
        // greets > 0) — addFriendByCode deliberately skipped recordGreet
        // rather than re-sending it, so repeated add clicks on the same
        // code can't farm greets. 'failed': recordGreet was denied (-1) —
        // almost always because the CALLER's own profile row doesn't exist
        // yet, even though the UI gates this section on a valid pet name
        // (the push could still have failed, e.g. offline). 'self'/anything
        // else: no-op, shouldn't be reachable since the UI already excludes
        // your own code above.
        // A friend added by code is one this child chose: she shows in Player pets.
        if (result?.status === 'already' || result?.status === 'added') met().add(friendCodeCandidate.playerId);
        if (result?.status === 'already') {
          friendCodeSuccess = `You're already friends with ${friendCodeCandidate.petName}!`;
          friendCodeError = null;
        } else if (result?.status === 'added') {
          friendCodeSuccess = `Added ${friendCodeCandidate.petName} as a friend!`;
          friendCodeError = null;
        } else if (result?.status === 'failed') {
          friendCodeSuccess = null;
          friendCodeError = "Couldn't add friend — give your cat a name first";
        } else {
          friendCodeSuccess = null;
          friendCodeError = null;
        }
        friendCodeCandidate = null;
      } catch (err) {
        friendCodeSuccess = null;
        note('cloud', err);
        friendCodeError = 'Could not add that friend — try again.';
      }
      friendCodeBusy = false;
      render();
      return;
    }
    if (e.target.id === 'friend-code-cancel') {
      friendCodeCandidate = null;
      render();
      return;
    }
    if (e.target.id === 'sync-save') {
      cloudBusy = true; cloudError = null; render();
      const res = await sync.saveToCloud();
      cloudBusy = false;
      if (res.ok) cloudJustLinked = true;
      else cloudError = res.error;
      render();
      return;
    }
    // Load from cloud: the typed code, or (linked) this device's own code.
    // Either way it is the same preview, which compares before it overwrites.
    if (e.target.id === 'sync-load' || e.target.id === 'sync-load-linked') {
      const code = e.target.id === 'sync-load' ? (root.querySelector('#sync-load-code')?.value ?? '') : (sync.getCode() ?? '');
      cloudBusy = true; cloudError = null; render();
      const res = await sync.previewLoad(code);
      cloudBusy = false;
      if (res.ok) cloudPreview = res.preview;
      else cloudError = res.error;
      render();
      return;
    }
    if (e.target.id === 'sync-confirm-load') {
      cloudBusy = true; render();
      const res = await sync.confirmLoad(cloudPreview);
      cloudBusy = false;
      cloudPreview = null;
      backupMsg = null;
      if (!res.ok) cloudError = res.error;
      render();
      // A pre-update cloud save with Rosa equipped queued her farewell while
      // loading; say it now, over the freshly drawn home base. While a visit
      // celebration is up the notice would be refused, so leave it queued:
      // the celebration's close (visitboot's afterCards) shows it.
      if (res.ok && !visitOpen()) {
        const farewell = progression.takeFarewell();
        if (farewell) showNotice(farewell);
      }
      return;
    }
    if (e.target.id === 'sync-cancel-load') {
      cloudPreview = null;
      render();
      return;
    }
    if (e.target.id === 'sync-got-it') {
      cloudJustLinked = false;
      render();
      return;
    }
    if (e.target.id === 'sync-now') {
      cloudBusy = true; cloudStatus = null; render();
      const res = await sync.syncNow();
      cloudBusy = false;
      cloudStatus = res.message;
      render();
      return;
    }
    if (e.target.id === 'sync-delete-online') {
      if (!onlineDelete?.available || cloudBusy || onlineDeleteBlocked()) return;
      confirmCard.ask({
        ...onlineDeleteAsk(sync?.getCode?.() ?? null),
        returnFocus: () => root.querySelector('#sync-delete-online')?.focus?.({ preventScroll: true }),
        onYes: async () => {
          if (cloudBusy) return;
          cloudBusy = true; deleting = true; deleteMsg = null; cloudStatus = null; cloudError = null; render();
          let res;
          try {
            res = await onlineDelete.run();
          } catch (err) {
            note('cloud', err);
            res = { outcome: 'offline' };
          }
          cloudBusy = false; deleting = false;
          if (res.outcome === 'done' || res.save === 'ok' || res.save === 'none') cloudJustLinked = false;
          deleteMsg = onlineDeleteMessage(res);
          render();
        },
      });
      return;
    }
    // Unlink asks first: afterwards this device no longer shows the code.
    if (e.target.id === 'sync-unlink') {
      const code = sync.getCode();
      if (cloudBusy || !code) return;
      confirmCard.ask({
        text: 'Stop saving to the cloud?',
        note: `Your save code is ${code}. Write it down. It’s the only way to get this save back.`,
        no: 'Keep saving',
        yes: 'Yes, stop',
        danger: true,
        returnFocus: () => root.querySelector('#sync-unlink')?.focus?.({ preventScroll: true }),
        onYes: () => {
          sync.unlink();
          cloudStatus = null;
          cloudError = null;
          cloudJustLinked = false;
          render();
        },
      });
      return;
    }
    if (e.target.id === 'set-muted') {
      settings.set('muted', e.target.checked);
      onSettingsChange?.();
      render();
      return;
    }
    if (e.target.id === 'set-haptics') {
      settings.set('haptics', e.target.checked);
      onSettingsChange?.();
      render();
      return;
    }
    if (e.target.id === 'set-invert-y') {
      settings.set('invertY', e.target.checked);
      onSettingsChange?.();
      render();
      return;
    }
    if (e.target.id === 'set-left-handed') {
      settings.set('leftHanded', e.target.checked);
      onSettingsChange?.();
      render();
      return;
    }
    if (e.target.id === 'set-reduced-motion') {
      settings.set('reducedMotion', e.target.checked);
      onSettingsChange?.();
      render();
      return;
    }
    if (e.target.id === 'set-hide-chat') {
      settings.set('hideChat', e.target.checked);
      onSettingsChange?.();
      render();
      return;
    }
    if (e.target.id === 'set-perf-readout') {
      settings.set('perfReadout', e.target.checked);
      onSettingsChange?.();
      render();
      return;
    }
  });

  // The secret-code form (delegated: render() rebuilds it). While hashing the
  // box and button are disabled, so a second submit cannot return the first
  // result. A thrown error reads as the kind 'unsupported' line.
  root.addEventListener('submit', async (e) => {
    if (!e.target.classList || !e.target.classList.contains('redeem-form')) return;
    e.preventDefault();
    if (redeemBusy) return;
    const field = root.querySelector('#redeem-input');
    if (field) redeemText = field.value;
    redeemBusy = true;
    redeemResult = null;
    render();
    let res;
    try {
      res = await redeemer.redeem(redeemText);
    } catch {
      res = { kind: 'unsupported' };
    }
    redeemBusy = false;
    redeemResult = res;
    if (res.kind === 'gift' || res.kind === 'used') redeemText = '';
    if (res.kind === 'gift') sync?.autoSync?.();
    render();
    if (res.kind !== 'gift') root.querySelector('#redeem-input')?.focus();
  });

  // Volume slider: a dedicated 'input' listener (fires continuously while
  // dragging) rather than the delegated click handler above — applying live
  // + patching just the % label keeps the drag smooth. A full render() here
  // would tear down and recreate the <input type="range"> element on every
  // tick, which fights native drag handling.
  root.addEventListener('input', (e) => {
    if (dressing?.handleInput(e)) return;
    if (e.target.id === 'redeem-input') {
      redeemText = e.target.value;
      return;
    }
    // The pairing code box: uppercase, invite characters only, 6 at most. The
    // draft is kept so a re-render does not lose it; the box is only written
    // to when cleaning changed something, to leave the cursor alone otherwise.
    if (e.target.id === 'colony-pair-code') {
      pairCode = sanitizeInviteCode(e.target.value);
      if (e.target.value !== pairCode) e.target.value = pairCode;
      return;
    }
    if (!settings) return;
    // Looks only: the pink fill under a Settings slider follows the thumb.
    if (e.target.classList?.contains('settings-range')) e.target.style.setProperty('--fill', `${e.target.value}%`);
    if (e.target.id === 'set-volume') {
      const vol = Number(e.target.value) / 100;
      settings.set('volume', vol);
      onSettingsChange?.();
      const label = root.querySelector('#set-volume-value');
      if (label) label.textContent = `${e.target.value}%`;
      return;
    }
    // Music slider: same dedicated-'input'-listener pattern as the volume
    // slider above (live updates + label patch, no full render() mid-drag).
    if (e.target.id === 'set-music-volume') {
      const vol = Number(e.target.value) / 100;
      settings.set('musicVolume', vol);
      onSettingsChange?.();
      const label = root.querySelector('#set-music-volume-value');
      if (label) label.textContent = `${e.target.value}%`;
    }
  });

  // Quality select: a dedicated 'change' listener (not the delegated click
  // handler above) since choosing a <select> option doesn't reliably fire a
  // click on the <select> itself in every browser. The tier is resolved from
  // this setting at walk start (Task 5), so this never applies live — just
  // persist it and re-render to reflect the chosen value.
  root.addEventListener('change', (e) => {
    if (e.target.id === 'dusk-toggle') { duskWanted = e.target.checked; return; }
    if (e.target.id === 'set-quality' && settings) {
      settings.set('quality', e.target.value);
      onSettingsChange?.();
      render();
      return;
    }
    if (e.target.id === 'set-map-mode') {
      progression.setMapMode(e.target.value);
      render();
      return;
    }
    if (e.target.id === 'set-edition') {
      progression.setEdition(e.target.value);
      render();
      return;
    }
    // Trade pickers: remember the choice so a re-render (a poll, a sync) keeps it.
    if (e.target.matches && e.target.matches('[data-trade-give]')) { tradeGive = e.target.value; return; }
    if (e.target.matches && e.target.matches('[data-trade-want]')) { tradeWant = e.target.value; return; }
    // Colony dressing: a finder gives one of their cats an accessory they own
    // ("" = nothing). colonySync.dress does the save and, when paired, the
    // push; its onChange re-renders the home base (main.js wires that to
    // refresh()), and a bad item is refused there, not here.
    const dressCat = e.target.dataset.colonyDress;
    if (dressCat) {
      Promise.resolve(colonySync?.dress(dressCat, e.target.value || null))
        .then((r) => { if (r && !r.ok) render(); }, () => render()); // a refusal puts the select back
    }
  });

  root.addEventListener('focusout', (e) => { dressing?.onFocusOut?.(e, render); });

  // Enter starts the walk from home (Launch A), when nothing else would take
  // it: no sheet, no card over home, not the builder, and no control has
  // focus (a focused button's own Enter is its own, a field's is typing).
  function enterStarts(e) {
    if (e.key !== 'Enter' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (!shown || !greeted || !homeVisible() || openSheet || dressing?.ui?.builder) return;
    if (momentEl || newsEl || noticeEl || nearbyEl || visitOpen() || confirmCard.isOpen()) return;
    const a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement && a !== root) return;
    const start = root.querySelector('#btn-start');
    if (!start || start.disabled) return;
    e.preventDefault();
    start.click();
  }
  document.addEventListener?.('keydown', enterStarts);

  // room state (roster arrivals, host migration) can change while sitting on
  // this screen waiting for friends — re-render to keep the roster/host
  // status live, but only while home base is actually visible.
  if (rooms) {
    rooms.onChange(() => {
      noteRoomArrivals();
      if (!root.classList.contains('hidden')) render();
    });
  }

  // A room found nearby came or went (or "Not now"): only the rows are
  // redrawn, not the sheet, so a half-typed code or name is never wiped; and
  // the card over home follows.
  if (nearby?.available) {
    nearby.onChange(() => {
      if (homeVisible() && openSheet === 'together') {
        const slot = root.querySelector('#wt-nearby');
        if (slot) slot.innerHTML = nearbyRowsHtml();
      }
      syncNearbyCard();
    });
  }

  return {
    // show({ sheet }): a border crossing that could not pick its place opens
    // Change place ('places'); one that picked it lands on the cat, like
    // every other walk.
    show(opts) {
      const sheet = resolveSheet(opts?.sheet);
      redeemResult = null; // a stale "Surprise!" or catnap line must not outlive a walk
      // duskWanted stands across walks this session: home's moon shows it.
      shown = true;
      // Coming home always lands on the cat, whatever sheet the walk was
      // started from (the Journal's dock, say), unless a sheet is asked for.
      openSheet = null;
      backTo = null;
      if (sheet && availableSheets().includes(sheet)) openSheet = sheet;
      render(); // also turns the hero stage back on
      root.classList.remove('hidden');
      syncPairingPoll(); // render() ran while still hidden
      syncNearby();
      // Back from a walk: the walk that opened the Woods brings the clan
      // moment up now. (The boot's first show() waits for the greeting.)
      if (greeted) showClanMoment();
    },
    showNews,
    showNotice,
    showVisit,
    visitOpen,
    hide() {
      // A walk is starting: the celebration closes with 'walk' (its onClose
      // wears a pending prize), before anything else is torn down. (shown goes
      // false first, so no card's close brings the clan moment up now.)
      shown = false;
      celebration.close('walk');
      closeWelcome();
      closeNews(false); // a walk is starting: leave the news unread for next time
      closeNotice();
      closeClanMoment(false); // a walk is starting: it comes back next time
      confirmCard.close(); // a walk is starting: unanswered, nothing happens
      removeNearbyCard(); // a walk is starting: not dismissed, it may ask again at home
      shown = false;
      // A walk is starting: stop the hero's frames and drop any preview.
      if (stage) stage.setVisible(false);
      dressing?.clearPreview();
      dressing?.closeWardrobe?.(); // home again is the cat, not the wardrobe
      root.classList.add('hidden');
      syncPairingPoll(); // clears the poll: nothing pulls every 3 s during a walk
      syncNearby(); // and nothing is looked for or findable during a walk
    },
    // Re-renders only if currently visible — used by main.js's M-key mute
    // handler so a mute toggled from the keyboard while sitting on this
    // screen keeps the "Mute all sound" checkbox in sync (settings.muted is
    // the single source of truth; this just reflects it into the DOM).
    refresh() {
      if (!root.classList.contains('hidden')) render();
    },
  };
}
