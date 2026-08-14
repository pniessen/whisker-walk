import { CATALOG, rankFor, asFiniteNonNeg } from '../progression.js';
import { menuThumbnails } from '../thumbnails.js';
import { validPetName } from '../net.js';
import { HOME_TABS, resolveTab } from './hometabs.js';
import { renderJournalHtml } from '../journal.js';
import { GOLD_TOTAL } from '../goldmice.js';
import { DEN_ITEMS, DEN_SPOTS } from '../den.js';

const LEVEL_ICON = { best: '💕', friend: '♥', met: '♡' };

// Cat Couture (Task 3): the Accessories section is grouped by slot, in this
// fixed display order — independent of CATALOG.accessories' insertion order,
// so adding a new item to the catalog can't silently reorder the headings.
const ACCESSORY_SLOTS = ['collar', 'head', 'face', 'neck', 'body', 'back', 'feet'];
const SLOT_LABEL = { collar: 'Collar', head: 'Head', face: 'Face', neck: 'Neck', body: 'Body', back: 'Back', feet: 'Feet' };

const TAB_LABEL = { cats: '🐱 Cats', accessories: '🎩 Accessories', social: '🐾 Social', album: '📸 Album', settings: '⚙️ Settings' };

const CAT_BLURBS = {
  tabby: 'Curious — sniffs out hidden treasures',
  siamese: 'Hyper — fast, loud, chases everything',
  persian: 'Lazy — naps often, loves pets',
  black: 'Brave — nothing spooks this cat',
  calico: 'Playful — pounces butterflies for points',
  mainecoon: 'Steady — big, calm, unbothered',
  zeetoo: 'Legendary tabby — smells treasure from a block away',
  rosa: 'Tuxedo — always formal, never afraid',
  robbie: 'Cow cat — maximum chaos, champion pouncer',
  hagrid: 'A chicken?! Birds trust Hagrid completely',
};
const ACC_BLURBS = {
  bell: 'Birds come closer',
  glow: 'Unlocks dusk walks with fireflies',
  bandana: 'Neighbors wave back (+points)',
  booties: 'Puddles become splash discoveries',
  backpack: 'Carry one extra collectible',
  crown: 'Butterflies trail your cat',
};

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
export function createHomeBase(progression, album, onStartWalk, rooms, sync, cloud, settings, onSettingsChange, onVisitDen) {
  const root = document.getElementById('homebase');
  let petNameError = null;
  let joinError = null;
  let activeTab = 'cats';

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

  function card(kind, id, item, ownedLabel) {
    const s = progression.state;
    const owned = progression.isUnlocked(kind, id);
    const selected =
      (kind === 'cats' && s.equipped.cat === id) ||
      (kind === 'accessories' && s.equipped[item.slot] === id) ||
      (kind === 'areas' && s.area === id);
    const blurb = kind === 'cats' ? CAT_BLURBS[id] : kind === 'accessories' ? ACC_BLURBS[id] : '';
    const thumbs = menuThumbnails();
    const thumb = kind === 'cats' ? thumbs.cats[id] : kind === 'accessories' ? thumbs.accessories[id] : null;
    let action;
    if (owned) {
      action = selected
        ? `<div class="tag on">${ownedLabel}</div>` +
          (kind === 'accessories' ? `<button data-action="unequip">Take off</button>` : '')
        : `<button data-action="equip">${kind === 'areas' ? 'Walk here' : 'Choose'}</button>`;
    } else if (progression.canBuy(kind, id)) {
      action = `<button data-action="buy">Unlock — ${item.price} 🐾</button>`;
    } else {
      let need = `${item.price} 🐾`;
      if (item.requires) {
        const req = item.requires;
        need += ` · ${s.walks[req.area]}/${req.walks} walks in ${CATALOG.areas[req.area].name}`;
      }
      action = `<div class="tag">${need}</div>`;
    }
    return `<div class="card ${selected ? 'selected' : ''} ${owned ? '' : 'locked'}"
      data-kind="${kind}" data-id="${id}">
      ${thumb ? `<img class="card-thumb" src="${thumb}" alt="${item.name}">` : ''}
      <div class="card-name">${item.name}</div>
      ${blurb ? `<div class="card-sub">${blurb}</div>` : ''}
      ${action}
    </div>`;
  }

  // Den furniture card (Task 7.2) — same `.card` markup idiom as card()
  // above (price tag / Buy button / owned tag) but against DEN_ITEMS +
  // state.den.owned instead of CATALOG + state.unlocked: den items have no
  // "equip" concept of their own (placement happens via the per-spot
  // <select>s in renderDenSection below), just owned-or-not-yet.
  function denItemCard(id, item) {
    const s = progression.state;
    const owned = s.den.owned.includes(id);
    let action;
    if (owned) {
      action = `<div class="tag on">owned</div>`;
    } else if (s.points >= item.price) {
      action = `<button data-action="buy-den" data-id="${id}">Unlock — ${item.price} 🐾</button>`;
    } else {
      action = `<div class="tag">${item.price} 🐾</div>`;
    }
    return `<div class="card ${owned ? 'selected' : 'locked'}" data-kind="den" data-id="${id}">
      <div class="card-name">${item.name}</div>
      ${action}
    </div>`;
  }

  // "Your Den" Play-tab section (Task 7.2): the DEN_ITEMS catalog as cards
  // (Buy -> buyDenItem) plus one <select> per DEN_SPOTS anchor point (options
  // = "empty" + every owned item) that calls placeDenItem on change. All
  // labels here are the static catalog strings (item.name / spot.id) — no
  // user-authored text ever reaches this section's innerHTML.
  function renderDenSection() {
    const s = progression.state;
    return `
      <section class="den-section"><h2>Your Den 🏠</h2>
        <div class="cards">
          ${Object.entries(DEN_ITEMS).map(([id, item]) => denItemCard(id, item)).join('')}
        </div>
        <div class="den-spots">
          ${DEN_SPOTS.map((spot) => {
            const current = s.den.placed[spot.id] ?? '';
            const options = s.den.owned.map((ownedId) =>
              `<option value="${ownedId}" ${ownedId === current ? 'selected' : ''}>${DEN_ITEMS[ownedId].name}</option>`
            ).join('');
            return `<label class="den-spot-row">
              <span class="den-spot-id">${spot.id}</span>
              <select data-den-spot="${spot.id}">
                <option value="" ${current === '' ? 'selected' : ''}>— empty —</option>
                ${options}
              </select>
            </label>`;
          }).join('')}
        </div>
      </section>`;
  }

  function renderWalkTogether() {
    if (!rooms || !rooms.available) {
      return `<div class="tag">multiplayer not configured</div>`;
    }
    const st = rooms.getState();
    if (st) {
      return `
        <div class="wt-room">
          <div class="wt-room-code">Room ${escapeHtml(st.code)} — share this code!</div>
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
    return `
      <div class="wt-petname">
        <input type="text" id="wt-petname-input" maxlength="16" placeholder="Pet's name" value="${escapeHtml(name)}" />
        <button id="wt-petname-save">Save</button>
        ${petNameError ? `<div class="tag error">${escapeHtml(petNameError)}</div>` : ''}
      </div>
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
        ${!hasValidPetName ? '<div class="tag">Set your pet’s name below (Walk together) to add friends by code.</div>' : ''}
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

  function applyActiveTab() {
    for (const btn of root.querySelectorAll('.hb-tab')) {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
      btn.setAttribute('aria-selected', btn.dataset.tab === activeTab ? 'true' : 'false');
    }
    for (const panel of root.querySelectorAll('.hb-panel')) {
      panel.classList.toggle('active', panel.dataset.panel === activeTab);
    }
  }

  function render() {
    const s = progression.state;
    const glowReady = s.equipped.collar === 'glow';
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
    const roomState = rooms && rooms.available ? rooms.getState() : null;
    const waitingForHost = !!(roomState && !roomState.isHost);
    root.innerHTML = `
      <div class="homebase-scroll">
        <div class="hb-topbar">
          <div class="hb-hero">
            <header class="hb-header">
              <h1 class="hb-wordmark" aria-label="Whisker Walk"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 240" role="img" aria-hidden="true"><rect x="6" y="6" width="628" height="228" rx="34" fill="#1c2431"/><g stroke="#f1e0c2" stroke-width="3" stroke-linecap="round" opacity="0.75"><line x1="95" y1="128" x2="45" y2="116"/><line x1="92" y1="140" x2="40" y2="140"/><line x1="95" y1="152" x2="45" y2="164"/><line x1="545" y1="128" x2="595" y2="116"/><line x1="548" y1="140" x2="600" y2="140"/><line x1="545" y1="152" x2="595" y2="164"/></g><path d="M108 190 Q 320 230 528 190" stroke="#c99a72" stroke-width="10" stroke-linecap="round" fill="none"/><path d="M528 190 q 15 -19 -4 -29" stroke="#c99a72" stroke-width="10" stroke-linecap="round" fill="none"/><text x="320" y="150" text-anchor="middle" font-family="Avenir, 'Nunito', 'Trebuchet MS', sans-serif" font-size="72" font-weight="700" fill="#f1e0c2">Whisker Walk</text><polygon points="296,46 306,17 319,44" fill="#f1e0c2"/><polygon points="344,46 334,17 321,44" fill="#f1e0c2"/><polygon points="300,42 306,27 314,42" fill="#e7a9a0"/><polygon points="340,42 334,27 326,42" fill="#e7a9a0"/><circle cx="320" cy="60" r="27" fill="#f1e0c2"/><path d="M308 38 q4 8 1 15" stroke="#d8bd8f" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M320 35 q0 9 0 16" stroke="#d8bd8f" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M332 38 q-4 8 -1 15" stroke="#d8bd8f" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M304 57 q7 -7 14 0" stroke="#1c2431" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M322 57 q7 -7 14 0" stroke="#1c2431" stroke-width="3" stroke-linecap="round" fill="none"/><polygon points="316,66 324,66 320,72" fill="#e7a9a0"/><g stroke="#f1e0c2" stroke-width="2.2" stroke-linecap="round" opacity="0.9"><line x1="280" y1="63" x2="297" y2="61"/><line x1="280" y1="70" x2="297" y2="68"/><line x1="343" y1="61" x2="360" y2="63"/><line x1="343" y1="68" x2="360" y2="70"/></g></svg></h1>
              <div class="hb-header-right">
                <div class="hb-points">🐾 ${s.points} whisker points</div>
                <div class="hb-substats">
                  <span>🏆 ${rank.title} — ${nextLine}</span>
                  ${streakCount >= 2 ? `<span>🔥 ${streakCount}-day streak</span>` : ''}
                  <span>best walk: ${s.bestWalk} 🐾</span>
                  ${raceBestMs != null ? `<span>Today’s race best: ${(raceBestMs / 1000).toFixed(1)}s 🏁</span>` : ''}
                  ${s.kitten.stage === 3 ? '<span>🐱 Mochi lives with you now</span>' : ''}
                </div>
              </div>
            </header>
            <div class="hb-hero-start">
              ${glowReady ? `<label class="dusk"><input type="checkbox" id="dusk-toggle" /> Dusk walk ✨</label>` : ''}
              ${waitingForHost
                ? `<button id="btn-start" class="primary" disabled>Waiting for host…</button>`
                : `<button id="btn-start" class="primary">Start the walk 🐾</button>`}
              ${roomState ? '' : `<button id="btn-visit-den">Visit your den 🏠</button>`}
            </div>
          </div>
          <nav class="hb-tabs" role="tablist">
            ${HOME_TABS.map((id) => `<button class="hb-tab" data-tab="${id}" role="tab">${TAB_LABEL[id]}</button>`).join('')}
          </nav>
        </div>
        <div class="hb-panels">
          <div class="hb-panel" data-panel="cats">
            <section><h2>Your cat</h2><div class="cards">
              ${Object.entries(CATALOG.cats).map(([id, c]) => card('cats', id, c, 'walking today')).join('')}
            </div></section>
            <section><h2>Where to?</h2><div class="cards">
              ${Object.entries(CATALOG.areas).map(([id, a]) => card('areas', id, a, 'today’s walk')).join('')}
            </div></section>
            ${renderDenSection()}
          </div>
          <div class="hb-panel" data-panel="accessories">
            <section><h2>Dress up your cat</h2>
              ${ACCESSORY_SLOTS.map((slot) => {
                const items = Object.entries(CATALOG.accessories).filter(([, a]) => a.slot === slot);
                if (!items.length) return '';
                return `<div class="accessory-slot">
                  <h3>${SLOT_LABEL[slot]}</h3>
                  <div class="cards">
                    ${items.map(([id, a]) => card('accessories', id, a, 'on')).join('')}
                  </div>
                </div>`;
              }).join('')}
            </section>
          </div>
          <div class="hb-panel" data-panel="social">
            <section class="walk-together"><h2>Walk together 🐾🐾</h2>
              ${renderWalkTogether()}
            </section>
            <section class="friends-section"><h2>Friends 🐾</h2>
              ${renderPlayerPets()}
              ${renderStrayFriends()}
              ${cloud && cloud.available ? renderFriendCode() : ''}
            </section>
          </div>
          <div class="hb-panel" data-panel="album">
            <section class="journal-section"><h2>Critter Journal 📖</h2>
              ${renderJournalHtml(s.journal ?? {}, (s.golden ?? []).length, GOLD_TOTAL)}
            </section>
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
            </div></section>
          </div>
          <div class="hb-panel" data-panel="settings">
            ${sync && sync.available ? `<section class="walk-together sync-cloud"><h2>Sync ☁️</h2>${renderSync()}</section>` : ''}
            ${renderSettings()}
          </div>
        </div>
      </div>`;
    activeTab = resolveTab(activeTab);
    applyActiveTab();
    if (cloud && cloud.available) loadPlayerPets();
  }

  root.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('.hb-tab');
    if (tabBtn) {
      activeTab = resolveTab(tabBtn.dataset.tab);
      applyActiveTab();
      return;
    }
    if (e.target.id === 'btn-start') {
      const dusk = root.querySelector('#dusk-toggle');
      onStartWalk({ duskMode: !!(dusk && dusk.checked) });
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
        render();
      }
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
    const cardEl = e.target.closest('.card');
    const action = e.target.dataset.action;
    if (!cardEl || !action) return;
    const { kind, id } = cardEl.dataset;
    if (action === 'buy') {
      if (progression.buy(kind, id)) sync?.autoSync?.();
    }
    else if (action === 'buy-den') {
      if (progression.buyDenItem(id)) sync?.autoSync?.();
    }
    else if (action === 'unequip') progression.unequip(CATALOG.accessories[id].slot);
    else if (action === 'equip') {
      if (kind === 'cats') progression.equipCat(id);
      else if (kind === 'accessories') progression.equipAccessory(id);
      else if (kind === 'areas') progression.setArea(id);
    }
    render();
  });

  // Volume slider: a dedicated 'input' listener (fires continuously while
  // dragging) rather than the delegated click handler above — applying live
  // + patching just the % label keeps the drag smooth. A full render() here
  // would tear down and recreate the <input type="range"> element on every
  // tick, which fights native drag handling.
  root.addEventListener('input', (e) => {
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
    if (e.target.id === 'set-quality' && settings) {
      settings.set('quality', e.target.value);
      onSettingsChange?.();
      render();
      return;
    }
    // Den placement (Task 7.2): each DEN_SPOTS anchor has its own <select>;
    // picking an owned item there calls placeDenItem, picking "— empty —"
    // (value "") clears the spot. placeDenItem itself already handles the
    // "this item is already at a different spot" move.
    const spotId = e.target.dataset.denSpot;
    if (spotId) {
      progression.placeDenItem(spotId, e.target.value || null);
      render();
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
      render();
      root.classList.remove('hidden');
    },
    hide() {
      root.classList.add('hidden');
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
