import { CATALOG, rankFor, asFiniteNonNeg } from '../progression.js';
import { menuThumbnails } from '../thumbnails.js';
import { validPetName } from '../net.js';
import { renderSkillsHtml, renderStarNamePicker, goldenFound, renderGoldenTallyHtml } from './hometabs.js';
import { HOME_SHEETS, resolveSheet, PLACE_PICTURE } from './dressingroom.js';
import { createDressingRoom } from './dressingroomview.js';
import { createCatStage } from './catstage.js';
import { buildCat } from '../cat/model.js';
import { candidateStarNames } from '../clannames.js';
import { CLAN_SUFFIX } from '../clanwords.js';
import {
  renderColonyHtml, sanitizeInviteCode, shouldPollPairing, pairingPending, pairingErrorLine, PAIRING_POLL_MS,
  theySaidNo, PAIR_DECLINED_LINE, tradeErrorLine, confirmClickAllowed,
  renderStartButtonHtml, renderPartnerWalkHtml, renderRoomTitleHtml,
} from './colonypanel.js';
import { renderJournalHtml } from '../journal.js';
import { GOLD_TOTAL, KNOWN_GOLD } from '../goldmice.js';
import { createRedeemer, renderRedeemHtml } from '../redeem.js';

const LEVEL_ICON = { best: '💕', friend: '♥', met: '♡' };

// petNames in a room roster arrive over the network (another player's
// client, not necessarily one that enforced validPetName) — escape before
// interpolating into innerHTML.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

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
export function createHomeBase(progression, album, onStartWalk, rooms, sync, cloud, settings, onSettingsChange, onVisitDen, colonySync, myId, toast) {
  const root = document.getElementById('homebase');
  let petNameError = null;
  let joinError = null;
  // v21 Stream 5: the home screen is the dressing room (openSheet null) or
  // one sheet from HOME_SHEETS.
  let openSheet = null;
  // The dusk toggle's tick, remembered across renders (a pill switch
  // re-renders); never saved, and cleared on show() as it always was.
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
              ? st.roster.map((p) => `<span class="wt-roster-chip">🟢 ${escapeHtml(p.petName)}</span>`).join('')
              : '<span class="tag">waiting for friends…</span>'}
          </div>
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
    return `
      ${hasValidPetName ? '' : '<p class="wt-first">First, give your cat a name your friends will see:</p>'}
      ${pairWalk && hasValidPetName ? `<div class="wt-pair">${pairWalk}</div>` : ''}
      <div class="wt-petname">
        <input type="text" id="wt-petname-input" maxlength="16" placeholder="Pet's name" value="${escapeHtml(name)}" />
        <button id="wt-petname-save">Save</button>
        ${petNameError ? `<div class="tag error">${escapeHtml(petNameError)}</div>` : ''}
      </div>
      ${renderStarNamePicker(candidateStarNames(myId), name)}
      <div class="wt-actions">
        <button id="wt-host" ${hasValidPetName ? '' : 'disabled'}>Host a walk</button>
        <div class="wt-join-row">
          <input type="text" id="wt-join-code" maxlength="4" placeholder="CODE" class="wt-code-input" />
          <button id="wt-join" ${hasValidPetName ? '' : 'disabled'}>Join</button>
        </div>
        ${joinError ? `<div class="tag error">${escapeHtml(joinError)}</div>` : ''}
      </div>`;
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
          <div class="tag error">Loading will overwrite everything on this device — this can't be undone.</div>
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
    return body;
  }

  // Settings ⚙️ (Task 6): volume/mute/invert-Y/left-handed/reduced-motion,
  // plus Start-over (moved here from the footer). Every control applies
  // live via onSettingsChange — no reload, no walk restart. The volume
  // slider is wired separately (an 'input' listener below, not this
  // delegated click handler) so dragging it doesn't fight a render() every
  // tick; the checkboxes and Start-over button DO go through the normal
  // click-then-render() path since a discrete toggle has no drag to disrupt.
  function renderSettings() {
    if (!settings) return '';
    const s = settings.all();
    const pct = Math.round(s.volume * 100);
    const musicPct = Math.round(s.musicVolume * 100);
    return `
      <section class="settings-section"><h2>Settings ⚙️</h2>
        <div class="settings-grid">
          <label class="settings-row settings-volume">
            <span>Volume</span>
            <input type="range" id="set-volume" min="0" max="100" step="1" value="${pct}" />
            <span id="set-volume-value" class="settings-volume-value">${pct}%</span>
          </label>
          <label class="settings-row settings-volume">
            <span>Music 🎵</span>
            <input type="range" id="set-music-volume" min="0" max="100" step="5" value="${musicPct}" />
            <span id="set-music-volume-value" class="settings-volume-value">${musicPct}%</span>
          </label>
          <label class="settings-row"><input type="checkbox" id="set-muted" ${s.muted ? 'checked' : ''} /> Mute all sound</label>
          <label class="settings-row"><input type="checkbox" id="set-invert-y" ${s.invertY ? 'checked' : ''} /> Invert look (Y axis)</label>
          <label class="settings-row"><input type="checkbox" id="set-left-handed" ${s.leftHanded ? 'checked' : ''} /> Left-handed touch controls</label>
          <label class="settings-row"><input type="checkbox" id="set-reduced-motion" ${s.reducedMotion ? 'checked' : ''} /> Reduced motion</label>
          <label class="settings-row"><input type="checkbox" id="set-hide-chat" ${s.hideChat ? 'checked' : ''} /> Hide chat bubbles</label>
          <label class="settings-row"><input type="checkbox" id="set-perf-readout" ${s.perfReadout ? 'checked' : ''} /> Performance readout (fps counter)</label>
          <label class="settings-row settings-quality">
            <span>Graphics quality (applies next walk)</span>
            <select id="set-quality">
              <option value="auto" ${s.quality === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="high" ${s.quality === 'high' ? 'selected' : ''}>High detail</option>
              <option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low detail</option>
            </select>
          </label>
        </div>
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
        ${!hasValidPetName ? '<div class="tag">Give your cat a name in 👫 Play together to add friends by code.</div>' : ''}
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
          : '<div class="tag">No cat friends yet — go touch noses!</div>'}
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
      const otherIds = [...new Set(rows.map((r) => (r.a_id === cloud.myId ? r.b_id : r.a_id)))];
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
          if (cloud.isBlocked?.(otherId)) return '';
          const p = profileById.get(otherId);
          if (!p) return '';
          return `<div class="friend-row" data-player-id="${escapeHtml(otherId)}">
            <span class="friend-icon">${heartFor(r.greets)}</span>
            <span class="friend-name">${escapeHtml(p.pet_name)}</span> — ${escapeHtml(p.breed)}, ${escapeHtml(relativeTime(p.last_seen))}
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
    } catch {
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
    } catch {
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
      try { progression.markColonySeen(utcToday(), seen || undefined); } catch (err) { console.warn('Whisker Walk: could not mark news seen', err); }
    }
  }

  // showNews(html, seen): put the card over the home base. html is renderNewsHtml's
  // output (already escaped); '' or a card already up shows nothing. `seen` is
  // colonyNews's snapshot of what the card shows, marked read on dismiss. Returns
  // whether it was shown.
  function showNews(html, seen) {
    if (typeof html !== 'string' || !html || newsEl || noticeEl || !homeVisible()) return false;
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
  }

  function showNotice(text) {
    if (typeof text !== 'string' || !text || noticeEl || !homeVisible()) return false;
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
    ok.focus();
    return true;
  }

  // The dressing room's hero cat: ONE stage (one WebGL canvas) and ONE
  // controller per home base, made on the first render that needs them. The
  // canvas is re-mounted into the fresh #dr-stage after every render
  // (afterRender), so a colony poll or a roster change mid-drag keeps the cat.
  let stage = null;
  let dressing = null;
  function ensureDressing() {
    if (dressing) return dressing;
    const thumbs = menuThumbnails();
    stage = createCatStage({ buildCat, thumbs });
    dressing = createDressingRoom({
      progression, catalog: CATALOG, stage, sync, thumbs,
      onChange: render,
      onOpenSheet: (id) => setSheet(id),
    });
    return dressing;
  }

  // The sheets on offer: Sync only when cloud saves are set up, Play together
  // only when multiplayer is. (The den shop lives inside the den now —
  // ui/denshopview.js.)
  function availableSheets() {
    return HOME_SHEETS.filter((id) => {
      if (id === 'sync') return !!(sync && sync.available);
      if (id === 'together') return !!(rooms && rooms.available);
      return true;
    });
  }

  // The 👫 button beside Start, on the dressing room and on every sheet but
  // its own: one tap to the party screen. In a room it says how many are in.
  function playTogetherHtml(roomState) {
    if (!rooms || !rooms.available || openSheet === 'together') return '';
    const n = roomState && Array.isArray(roomState.roster) ? roomState.roster.length : 0;
    const label = roomState ? `👫 ${n} together` : '👫 Play together';
    return `<button id="btn-play-together" class="dr-together" type="button">${escapeHtml(label)}</button>`;
  }

  // Start, with Play together beside it when multiplayer is on.
  function startRowHtml(roomState) {
    return `<div class="dr-start-row">${playTogetherHtml(roomState)}${renderStartButtonHtml(roomState)}</div>`;
  }

  // null (or anything not on offer) = back to the dressing room.
  function setSheet(id) {
    const want = resolveSheet(id);
    openSheet = want && availableSheets().includes(want) ? want : null;
    render();
    root.scrollTop = 0; // a sheet (or the room) opens at its top
  }

  // One sheet's content: the same sections the old tabs held.
  function renderSheetBody(id, s, colonyStatus) {
    switch (id) {
      case 'skills': return `
        <section class="skills-section"><h2>Cat Skills 🐾</h2>
          <p class="skills-intro">Abilities aren’t bought — they’re earned. Pull off the feat and the
            ability is yours forever.</p>
          ${renderSkillsHtml(s)}
        </section>`;
      case 'colony': return `
        <section class="colony-section"><h2>Your colony 🐈</h2>
          ${renderColonyHtml({
            colony: s.colony, me: myId, members: progression.colonyMembers(), now: Date.now(),
            status: colonyStatus, clanRoles: s.clanRoles, clanName: s.clan.name,
            owned: s.unlocked.accessories, catalog: CATALOG,
            pairing: {
              busy: pairBusy, error: pairError, code: pairCode,
              hasPetName: validPetName(s.petName ?? ''),
            },
            trades: { give: tradeGive, want: tradeWant, confirmId: tradeConfirmId, busy: tradeBusy, error: tradeError },
          })}
        </section>`;
      case 'together': return `
        <section class="walk-together"><h2>Play together 👫</h2>
          ${renderWalkTogether()}
        </section>`;
      case 'social': return `
        <section class="friends-section"><h2>Friends 🐾</h2>
          ${renderPlayerPets()}
          ${renderStrayFriends()}
          ${cloud && cloud.available ? renderFriendCode() : ''}
        </section>`;
      case 'journal': return `
        <section class="journal-section"><h2>Critter Journal 📖</h2>
          ${renderJournalHtml(s.journal ?? {}, goldenFound(s.golden, KNOWN_GOLD), GOLD_TOTAL)}
        </section>`;
      case 'album': return `
        <section><h2>Photo album 📸</h2><div class="photos">
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
            : '<div class="tag">No photos yet — press C on a walk to raise the camera!</div>'}
        </div></section>`;
      case 'sync': return `<section class="walk-together sync-cloud"><h2>Sync ☁️</h2>${renderSync()}</section>`;
      case 'settings': return renderSettings();
      case 'code': return renderRedeemHtml({ text: redeemText, busy: redeemBusy, result: redeemResult, catalog: CATALOG });
      default: return '';
    }
  }

  function render() {
    const s = progression.state;
    const colonyStatus = colonySync ? colonySync.status() : { mode: 'local' };
    noteColonyPairing(colonyStatus);
    if (openSheet && !availableSheets().includes(openSheet)) openSheet = null;
    const glowReady = s.equipped.collar === 'glow';
    const roomState = rooms && rooms.available ? rooms.getState() : null;
    // The dusk toggle renders once: in the room's extras, or in a sheet's dock.
    const duskHtml = glowReady ? `<label class="dusk"><input type="checkbox" id="dusk-toggle" ${duskWanted ? 'checked' : ''} /> Dusk walk ✨</label>` : '';
    if (openSheet) {
      // Ruling 10: every sheet keeps Start pinned at the bottom (the host-a-
      // room flow presses "Start the walk together" from 👫 Play together). The room
      // isn't rendered here, so this is still the only #btn-start.
      const areaId = Object.prototype.hasOwnProperty.call(CATALOG.areas, s.area) ? s.area : Object.keys(CATALOG.areas)[0];
      root.innerHTML = `
      <div class="homebase-scroll hb-sheet" data-sheet="${escapeHtml(openSheet)}">
        <button id="hb-back" class="hb-back">← Back to my cat</button>
        ${renderSheetBody(openSheet, s, colonyStatus)}
        <footer class="hb-sheet-dock">
          <div class="where"><img src="${escapeHtml(PLACE_PICTURE(areaId))}" alt="" onerror="this.remove()">Walking in <b>${escapeHtml(CATALOG.areas[areaId].name)}</b></div>
          ${duskHtml}
          ${startRowHtml(roomState)}
        </footer>
      </div>`;
      if (stage) stage.setVisible(false); // no frames for a cat nobody can see
      syncPairingPoll();
      if (cloud && cloud.available && openSheet === 'social') loadPlayerPets();
      return;
    }
    const rank = rankFor(s.lifetimePoints);
    const nextLine = rank.next
      ? `next: ${Math.max(0, rank.next.at - s.lifetimePoints)} 🐾 to ${rank.next.title}`
      : 'top rank!';
    // s.streak comes through progression.js's sanitizeStreak on every
    // load/replaceFromPayload, but this is a display path (interpolated
    // straight into innerHTML) — coerce again here rather than trust that
    // upstream guarantee to hold forever.
    const streakCount = asFiniteNonNeg(s.streak?.count, 0);
    // Same defensive-coercion rationale as streakCount above: s.race comes
    // through progression.js's sanitizeRace on every load/replaceFromPayload
    // (so bestMs is already either null or a genuine finite positive
    // number), but this is still an innerHTML display path, so bestMs is
    // coerced again through asFiniteNonNeg rather than trusted wholesale.
    const today = new Date().toISOString().slice(0, 10);
    const raceBestMs = s.race?.date === today ? asFiniteNonNeg(s.race?.bestMs, null) : null;
    // The header's pieces stay inline, not in one wrapper: on a phone
    // .dr-header is display: contents, so the stats can move into More.
    const headerHtml = `<h1 class="dr-title">🐾 Whisker Walk 2: <span class="dr-edition">${CLAN_SUFFIX} Edition</span></h1>`
      + `<div class="dr-chip gold">🐾 ${asFiniteNonNeg(s.points, 0)} whisker points</div>`
      + `<div class="dr-chip">🏆 ${escapeHtml(rank.title)} — ${escapeHtml(nextLine)}</div>`;
    // The old header's substats lines, one block (other branches add a line
    // here). style.css chips each <span>.
    const statsHtml = `
                  ${streakCount >= 2 ? `<span>🔥 ${streakCount}-day streak</span>` : ''}
                  <span>best walk: ${s.bestWalk} 🐾</span>
                  ${renderGoldenTallyHtml(goldenFound(s.golden, KNOWN_GOLD), GOLD_TOTAL)}
                  ${raceBestMs != null ? `<span>Today’s race best: ${(raceBestMs / 1000).toFixed(1)}s 🏁</span>` : ''}
                  ${s.kitten.stage === 3 ? '<span>🐱 Mochi lives with you now</span>' : ''}
    `;
    const extrasHtml = `
      ${duskHtml}
      ${roomState ? '' : `<button id="btn-visit-den">Visit your den 🏠</button>`}`.trim();
    const room = ensureDressing();
    root.innerHTML = room.html({
      headerHtml, statsHtml, startHtml: startRowHtml(roomState), extrasHtml, sheets: availableSheets(),
    });
    room.afterRender(root);
    stage.setVisible(shown);
    syncPairingPoll();
  }

  root.addEventListener('click', async (e) => {
    // The dressing room's own controls (portraits, slots, picker, places,
    // pills, sheet buttons) go to its controller first.
    if (dressing && dressing.handleClick(e)) return;
    if (e.target.id === 'hb-back') {
      setSheet(null);
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
      const dusk = root.querySelector('#dusk-toggle');
      // A previewed cat or a tried-on accessory is never walked: the walk
      // reads the save's equipped cat and accessories (Review Focus 1).
      const duskMode = !!(dusk && dusk.checked);
      dressing?.clearPreview();
      // Redraw without the preview, so "(trying)" can't linger if this start
      // doesn't leave home (a room start that fails).
      render();
      onStartWalk({ duskMode });
      return;
    }
    if (e.target.id === 'btn-play-together') {
      setSheet('together');
      return;
    }
    if (e.target.id === 'btn-visit-den') {
      onVisitDen?.();
      return;
    }
    if (e.target.id === 'btn-reset') {
      if (window.confirm('Erase all progress and start over?')) {
        progression.reset();
        album.clear();
        dressing?.clearPreview(); // a preview of the old save means nothing now
        openSheet = null; // back to the (fresh) cat
        render();
        root.scrollTop = 0;
      }
      return;
    }
    // A picked star name goes through the same validated path as the text
    // field: the chosen name IS state.petName (no new field, spec §6.1).
    const starPick = e.target.dataset?.starName;
    if (starPick !== undefined) {
      if (validPetName(starPick)) {
        progression.setPetName(starPick);
        petNameError = null;
      } else {
        petNameError = 'Pet names are 2–16 letters, spaces, or hyphens.';
      }
      render();
      return;
    }
    if (e.target.id === 'wt-petname-save') {
      const input = root.querySelector('#wt-petname-input');
      const name = (input?.value ?? '').trim();
      if (validPetName(name)) {
        progression.setPetName(name);
        petNameError = null;
      } else {
        petNameError = 'Pet names are 2–16 letters, spaces, or hyphens.';
      }
      render();
      return;
    }
    if (e.target.id === 'wt-host') {
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
          friendCodeCandidate = { playerId: match.player_id, petName: match.pet_name, breed: match.breed };
        } else {
          friendCodeError = self ? "That's your own code!" : 'No player found with that code.';
        }
      } catch (err) {
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
        if (result?.status === 'already') {
          friendCodeSuccess = `You're already friends with ${friendCodeCandidate.petName}!`;
          friendCodeError = null;
        } else if (result?.status === 'added') {
          friendCodeSuccess = `Added ${friendCodeCandidate.petName} as a friend!`;
          friendCodeError = null;
        } else if (result?.status === 'failed') {
          friendCodeSuccess = null;
          friendCodeError = "Couldn't add friend — set your pet's name first";
        } else {
          friendCodeSuccess = null;
          friendCodeError = null;
        }
        friendCodeCandidate = null;
      } catch (err) {
        friendCodeSuccess = null;
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
    if (e.target.id === 'sync-load') {
      const input = root.querySelector('#sync-load-code');
      cloudBusy = true; cloudError = null; render();
      const res = await sync.previewLoad(input?.value ?? '');
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
      if (!res.ok) cloudError = res.error;
      render();
      // A pre-update cloud save with Rosa equipped queued her farewell while
      // loading; say it now, over the freshly drawn home base.
      if (res.ok) {
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
    if (e.target.id === 'sync-unlink') {
      sync.unlink();
      cloudStatus = null;
      cloudError = null;
      cloudJustLinked = false;
      render();
      return;
    }
    if (e.target.id === 'set-muted') {
      settings.set('muted', e.target.checked);
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

  // room state (roster arrivals, host migration) can change while sitting on
  // this screen waiting for friends — re-render to keep the roster/host
  // status live, but only while home base is actually visible.
  if (rooms) {
    rooms.onChange(() => {
      if (!root.classList.contains('hidden')) render();
    });
  }

  return {
    show() {
      redeemResult = null; // a stale "Surprise!" or catnap line must not outlive a walk
      duskWanted = false; // as before: every visit starts with the dusk box clear
      shown = true;
      render(); // also turns the hero stage back on
      root.classList.remove('hidden');
      syncPairingPoll(); // render() ran while still hidden
    },
    showNews,
    showNotice,
    hide() {
      closeNews(false); // a walk is starting: leave the news unread for next time
      closeNotice();
      shown = false;
      // A walk is starting: stop the hero's frames and drop any preview.
      if (stage) stage.setVisible(false);
      dressing?.clearPreview();
      root.classList.add('hidden');
      syncPairingPoll(); // clears the poll: nothing pulls every 3 s during a walk
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
