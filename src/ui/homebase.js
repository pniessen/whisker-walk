import { CATALOG, rankFor } from '../progression.js';
import { menuThumbnails } from '../thumbnails.js';
import { validPetName } from '../net.js';

const LEVEL_ICON = { best: '💕', friend: '♥', met: '♡' };

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

export function createHomeBase(progression, album, onStartWalk, rooms, sync, cloud) {
  const root = document.getElementById('homebase');
  let petNameError = null;
  let joinError = null;

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
    const canHost = validPetName(name);
    return `
      <div class="wt-petname">
        <input type="text" id="wt-petname-input" maxlength="16" placeholder="Pet's name" value="${escapeHtml(name)}" />
        <button id="wt-petname-save">Save</button>
        ${petNameError ? `<div class="tag error">${escapeHtml(petNameError)}</div>` : ''}
      </div>
      <div class="wt-actions">
        <button id="wt-host" ${canHost ? '' : 'disabled'}>Host a walk</button>
        <div class="wt-join-row">
          <input type="text" id="wt-join-code" maxlength="4" placeholder="CODE" class="wt-code-input" />
          <button id="wt-join">Join</button>
        </div>
        ${joinError ? `<div class="tag error">${escapeHtml(joinError)}</div>` : ''}
      </div>`;
  }

  function renderSync() {
    if (!sync || !sync.available) return '';
    let body;
    if (cloudPreview) {
      const fmt = (s) => `${s.rank} · ${s.points} 🐾 (lifetime ${s.lifetimePoints}) · best walk ${s.bestWalk}`;
      body = `
        <div class="sync-preview">
          <div class="sync-compare">
            <div class="sync-col"><h3>This device</h3><div>${fmt(cloudPreview.local)}</div></div>
            <div class="sync-col"><h3>Cloud save ${escapeHtml(cloudPreview.code)}</h3><div>${fmt(cloudPreview.cloud)}</div></div>
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

  function renderFriendCode() {
    const code = `CAT-${cloud.myId.slice(0, 8).toUpperCase()}`;
    return `
      <div class="friend-code-block">
        <div class="tag">Your friend code: <strong>${escapeHtml(code)}</strong></div>
        <div class="wt-join-row">
          <input type="text" id="friend-code-input" maxlength="20" placeholder="CAT-XXXXXXXX" class="wt-code-input sync-code-input" />
          <button id="friend-code-add" ${friendCodeBusy ? 'disabled' : ''}>Add a friend by code</button>
        </div>
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
        <h3>Player pets 🐾🐾</h3>
        <div id="player-pets-roster" class="tag">loading…</div>
        ${renderFriendCode()}
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
      // escapeHtml every one of them before interpolating.
      const rowsHtml = rows
        .map((r) => {
          const otherId = r.a_id === cloud.myId ? r.b_id : r.a_id;
          const p = profileById.get(otherId);
          if (!p) return '';
          return `<div class="friend-row">
            <span class="friend-icon">${heartFor(r.greets)}</span>
            <span class="friend-name">${escapeHtml(p.pet_name)}</span> — ${escapeHtml(p.breed)}, ${escapeHtml(relativeTime(p.last_seen))}
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

  function render() {
    const s = progression.state;
    const glowReady = s.equipped.collar === 'glow';
    const rank = rankFor(s.lifetimePoints);
    const nextLine = rank.next
      ? `next: ${Math.max(0, rank.next.at - s.lifetimePoints)} 🐾 to ${rank.next.title}`
      : 'top rank!';
    const roomState = rooms && rooms.available ? rooms.getState() : null;
    const waitingForHost = !!(roomState && !roomState.isHost);
    root.innerHTML = `
      <div class="homebase-scroll">
        <header class="hb-header">
          <h1>🐈 Whisker Walk</h1>
          <div class="hb-header-right">
            <div class="hb-points">🐾 ${s.points} whisker points</div>
            <div class="hb-substats">
              <span>🏆 ${rank.title} — ${nextLine}</span>
              <span>best walk: ${s.bestWalk} 🐾</span>
            </div>
          </div>
        </header>
        <section><h2>Your cat</h2><div class="cards">
          ${Object.entries(CATALOG.cats).map(([id, c]) => card('cats', id, c, 'walking today')).join('')}
        </div></section>
        <section><h2>Accessories</h2><div class="cards">
          ${Object.entries(CATALOG.accessories).map(([id, a]) => card('accessories', id, a, `on (${a.slot})`)).join('')}
        </div></section>
        <section><h2>Where to?</h2><div class="cards">
          ${Object.entries(CATALOG.areas).map(([id, a]) => card('areas', id, a, 'today’s walk')).join('')}
        </div></section>
        <section><h2>Photo album 📸</h2><div class="photos">
          ${album.photos.length
            ? album.photos.map((p) => `<figure><img src="${escapeHtml(p.thumb)}" alt="${escapeHtml(p.label)}"><figcaption>${escapeHtml(p.label)} — ${escapeHtml(p.area)}</figcaption></figure>`).join('')
            : '<div class="tag">No photos yet — press C on a walk to raise the camera!</div>'}
        </div></section>
        <section><h2>Cat friends 🐾</h2><div class="friends-list">
          ${Object.entries(s.friends).length
            ? Object.entries(s.friends)
                .sort(([, a], [, b]) => b.greets - a.greets)
                .map(([name, f]) => `<div class="friend-row">
                  <span class="friend-icon">${LEVEL_ICON[progression.friendLevel(name)] ?? '♡'}</span>
                  <span class="friend-name">${escapeHtml(name)}</span> — ${escapeHtml(f.breed)}, ${f.greets} greets
                </div>`).join('')
            : '<div class="tag">No cat friends yet — go touch noses!</div>'}
        </div>
        ${renderPlayerPets()}
        </section>
        <section class="walk-together"><h2>Walk together 🐾🐾</h2>
          ${renderWalkTogether()}
        </section>
        ${sync && sync.available ? `<section class="walk-together sync-cloud"><h2>Sync ☁️</h2>${renderSync()}</section>` : ''}
        <footer class="hb-footer">
          ${glowReady ? `<label class="dusk"><input type="checkbox" id="dusk-toggle" /> Dusk walk ✨</label>` : ''}
          ${waitingForHost
            ? `<button id="btn-start" class="primary" disabled>Waiting for host…</button>`
            : `<button id="btn-start" class="primary">Start the walk 🐾</button>`}
          <button id="btn-reset" class="danger">Start over</button>
        </footer>
      </div>`;
    if (cloud && cloud.available) loadPlayerPets();
  }

  root.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-start') {
      const dusk = root.querySelector('#dusk-toggle');
      onStartWalk({ duskMode: !!(dusk && dusk.checked) });
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
        await cloud.addFriendByCode(friendCodeCandidate.playerId);
        friendCodeSuccess = `Added ${friendCodeCandidate.petName} as a friend!`;
        friendCodeCandidate = null;
        friendCodeError = null;
      } catch (err) {
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
    const cardEl = e.target.closest('.card');
    const action = e.target.dataset.action;
    if (!cardEl || !action) return;
    const { kind, id } = cardEl.dataset;
    if (action === 'buy') {
      if (progression.buy(kind, id)) sync?.autoSync?.();
    }
    else if (action === 'unequip') progression.unequip(CATALOG.accessories[id].slot);
    else if (action === 'equip') {
      if (kind === 'cats') progression.equipCat(id);
      else if (kind === 'accessories') progression.equipAccessory(id);
      else if (kind === 'areas') progression.setArea(id);
    }
    render();
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
  };
}
