// The Colony tab's pure HTML renderer. No DOM, no THREE: it takes plain data
// and returns a string, so it is unit-tested (test/colonypanel.test.js).
// homebase.js reaches for document at module scope and so cannot be imported
// by the suite — the same reason hometabs.js owns the Skills renderer.
//
// The binding rule from the playtests: ONE progress bar per cat. A head start
// from earlier greets is a differently shaded segment INSIDE that bar, never a
// second track. Who fed what is shown in words ("you fed 3 · Robin fed 1"),
// never as points: nothing in this tab is a score.
//
// Every interpolated value goes through escapeHtml. The partner's pet name and
// the colony's cats ultimately come from a cloud payload; colony.js sanitizes
// them, and this renderer escapes them again rather than trusting that.
import { tamingProgress, COLONY_MAX, colonyCap } from '../colony.js';
import { strayBreed } from '../straynames.js';
import { clanNameOf, clanRankFor } from '../clannames.js';
import { RANK_WORDS, RANK_KEYS } from '../clanwords.js';
import { roleFor } from '../clanroles.js';
import { STARTER_ACCESSORIES } from '../progression.js';

// Duplicated from hometabs.js rather than imported (a copy beats a shared
// helper module for six lines).
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const own = (obj, key) => !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);

// The header line for each sync mode. 'unpaired' and 'needs-name' still work
// locally, so they read like 'local' until Task 9's pairing area says more.
function modeLine(mode, partnerName) {
  switch (mode) {
    case 'paired': return `Shared with ${partnerName} 🐾`;
    case 'not-set-up': return "Colony sharing isn't switched on yet";
    case 'offline': return "Can't reach the colony right now — your cats are safe on this device";
    default: return 'Just you for now';
  }
}

function dressSelect(cat, owned, catalog) {
  const accessories = catalog && catalog.accessories;
  const ids = [];
  for (const id of Array.isArray(owned) ? owned : []) {
    if (typeof id === 'string' && own(accessories, id) && !ids.includes(id)) ids.push(id);
  }
  // A cat can be wearing something no longer in the list; keep it selectable
  // so the select never silently shows "nothing" for a dressed cat.
  if (typeof cat.wear === 'string' && own(accessories, cat.wear) && !ids.includes(cat.wear)) ids.push(cat.wear);
  const opts = ids.map((id) =>
    `<option value="${escapeHtml(id)}"${cat.wear === id ? ' selected' : ''}>${escapeHtml(accessories[id].name)}</option>`);
  return `<label class="colony-dress">Dress ${escapeHtml(cat.name)}
      <select data-colony-dress="${escapeHtml(cat.name)}" aria-label="Dress ${escapeHtml(cat.name)}">
        <option value=""${cat.wear ? '' : ' selected'}>nothing</option>${opts.join('')}
      </select></label>`;
}

// Who already knew this cat? The head start is the largest `head` on any feed
// for it, so name whoever's feeds carry that value: me, the partner, or both.
function knewLine(catName, p, { me, partner, partnerName, feeds }) {
  let mine = false;
  let theirs = false;
  for (const f of feeds) {
    if (f.cat !== catName || f.head !== p.headStart) continue;
    if (f.by === me) mine = true;
    else if (partner && f.by === partner.playerId) theirs = true;
  }
  if (mine && theirs) return `You both already knew ${catName} ♥`;
  if (theirs) return `${partnerName} already knew ${catName} ♥`;
  return `You already knew ${catName} ♥`;
}

// The words under a cat's clan name. A TAMED cat shows its den role in place of
// the plain warrior word: the stored verdicts it holds (both, when one cat is
// both), else its derived elder/queen role, else warrior (roleFor's default).
// An UNTAMED cat keeps its rank word (kit/apprentice), because it has no den
// yet. Every word is taken by reference from RANK_WORDS; this is a label,
// never a score or a permission. `verdicts` holds only strings or nulls (see
// verdictsOf), and a verdict naming a cat that isn't on this card simply never
// matches, so a stale or hostile one changes nothing.
function descriptorFor(cat, p, verdicts) {
  if (!p.tamed) return RANK_WORDS[clanRankFor(p)];
  const held = [];
  if (verdicts.medicine === cat.name) held.push(RANK_WORDS[RANK_KEYS.medicine]);
  if (verdicts.deputy === cat.name) held.push(RANK_WORDS[RANK_KEYS.deputy]);
  return held.length ? held.join(' · ') : RANK_WORDS[roleFor(cat.name)];
}

// The stored verdicts, read defensively: a missing, non-object or malformed
// clanRoles renders as no verdicts and never throws. Own-property reads, so an
// inherited value cannot appear either.
function verdictsOf(clanRoles) {
  const read = (key) => (own(clanRoles, key) && typeof clanRoles[key] === 'string' ? clanRoles[key] : null);
  return { medicine: read(RANK_KEYS.medicine), deputy: read(RANK_KEYS.deputy) };
}

function catCard(cat, p, ctx) {
  const { me, partner, partnerName, catalog, owned } = ctx;
  const name = escapeHtml(cat.name);
  // The clan name is a pure display layer over the STORED name, which never
  // changes. clanNameOf passes an unknown non-empty name through verbatim, so a
  // hostile stored name reaches this template by this path too: escape it.
  // The rank is a word, never a level; its text comes by reference from
  // RANK_WORDS so no borrowed vocabulary is typed outside clanwords.js.
  const headline = escapeHtml(clanNameOf(cat.name, p));
  const rank = escapeHtml(descriptorFor(cat, p, ctx.verdicts));
  const mine = p.byPlayer.find((b) => b.by === me)?.n ?? 0;
  const theirs = partner ? (p.byPlayer.find((b) => b.by === partner.playerId)?.n ?? 0) : 0;
  const fed = partner ? `you fed ${mine} · ${partnerName} fed ${theirs}` : `you fed ${mine}`;

  // Waiting on whoever hasn't fed it yet: usually the partner, but if only
  // the partner has fed it, it is waiting for me.
  const waitingFor = p.byPlayer.some((b) => b.by === me) ? partnerName : 'you';
  const area = own(catalog && catalog.areas, cat.area) ? catalog.areas[cat.area].name : cat.area;
  let where;
  if (p.tamed) where = 'lives in your den 🏠';
  else if (p.needsSecondFeeder) where = `shy — waiting for ${waitingFor} 🐾`;
  else where = `in ${area}`;

  const found = cat.finder === me ? 'found by you' : `found by ${partnerName}`;

  // Segments are widths of the one bar: the head start first, then the feeds.
  const need = Math.max(1, p.need);
  const headPct = Math.round((p.headStart / need) * 100);
  const fedPct = Math.round(((p.have - p.headStart) / need) * 100);
  const head = p.headStart > 0 ? `<span class="colony-head" style="width:${headPct}%"></span>` : '';

  const knew = p.headStart > 0 ? `<div class="colony-knew">${escapeHtml(knewLine(cat.name, p, ctx))}</div>` : '';
  // The stored name stays on the card (a cat stays findable by the name it was
  // found under) with the breed beside it. Breed hashes the STORED name: hashing
  // the clan name would change a known cat's coat colour. When the clan name is
  // just the stored name (unknown name passes through), don't print it twice.
  const stored = headline === name ? '' : `${name} `;
  const breed = escapeHtml(typeof cat.name === 'string' ? strayBreed(cat.name) : '');
  const titleLine = `<div class="colony-title">${stored}<span class="colony-breed">${breed}</span></div>`;
  const dress = cat.finder === me ? dressSelect(cat, owned, catalog) : '';

  return `<div class="card colony-card ${p.tamed ? 'selected' : ''}" data-cat="${name}">
    <div class="card-name">${headline} <span class="colony-rank">${rank}</span></div>
    ${titleLine}
    <div class="colony-bar" role="progressbar" aria-label="${headline}'s trust"
      aria-valuemin="0" aria-valuemax="${p.need}" aria-valuenow="${p.have}">${head}<span class="colony-fed" style="width:${fedPct}%"></span></div>
    <div class="colony-count">${p.have} of ${p.need} feeds${p.tamed ? ' · tamed ✅' : ''}</div>
    ${knew}
    <div class="colony-fedby">${escapeHtml(fed)}</div>
    <div class="colony-where">${escapeHtml(where)}</div>
    <div class="colony-found">${escapeHtml(found)}</div>
    ${dress}
  </div>`;
}

// ---- Pairing (Task 9) -------------------------------------------------------
// Pure too: the home base owns the state (busy, error, the half-typed code)
// and the timer; everything it decides or prints comes from here so it can be
// tested without a DOM.

// The characters an invite code can contain (no 0/O, 1/I/L), as the SQL mints.
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 6;
export const PAIRING_POLL_MS = 3000;

// What the code box holds: uppercase, only invite characters, at most 6.
// Spaces and look-alike characters (0, O, 1, I, L) are dropped as typed.
export function sanitizeInviteCode(raw) {
  let out = '';
  for (const ch of String(raw ?? '').toUpperCase()) {
    if (INVITE_ALPHABET.includes(ch)) out += ch;
    if (out.length >= INVITE_CODE_LENGTH) break;
  }
  return out;
}

// Is a pairing waiting on the other person: I have an open code, or I typed
// theirs and await their yes? Only an 'unpaired' status can be pending.
export function pairingPending(status) {
  return !!status && status.mode === 'unpaired' && !!(status.invite || status.joining);
}

// The poll runs only while a pairing is pending, the Colony tab is showing, the
// home base is on screen and no walk is under way. (Visible already implies no
// walk; the flag is the belt to that braces.)
export function shouldPollPairing(status, { tab, visible, inWalk = false } = {}) {
  return pairingPending(status) && tab === 'colony' && visible === true && inWalk !== true;
}

// A plain line for each way a pairing step can fail; null when it did not.
export function pairingErrorLine(word) {
  switch (word) {
    case 'ok': case 'pending': case 'paired': case 'declined': return null;
    case 'bad-code': return "That code didn't work — check it and try again.";
    case 'already-paired': return 'This player is already sharing a colony.';
    case 'taken': return 'Someone else is already using that code.';
    case 'self': return "That's your own code! Give it to them to type in.";
    case 'no-joiner': return 'Nobody is waiting for a yes right now.';
    default: return 'Something went wrong — try again.';
  }
}

// Shown once when a join we typed is gone on a successful sync while we are
// still unpaired: the inviter said No (or the invite was removed).
export const PAIR_DECLINED_LINE = 'They said no — ask them for a new code.';

// theySaidNo(prev, next): did my pending join just vanish without a yes? Both
// are colonySync.status() results. A failed sync (lastError) proves nothing,
// and a 'paired' next is a yes, so only a clean, still-unpaired status with no
// join left counts.
export function theySaidNo(prev, next) {
  return !!prev && !!next
    && prev.mode === 'unpaired' && !!prev.joining
    && next.mode === 'unpaired' && !next.joining && !next.lastError;
}

// renderPairingHtml(status, { busy, error, hasPetName, code }) -> HTML string.
// Every name is escaped once, here. `error` is plain text (see pairingErrorLine).
export function renderPairingHtml(status, { busy = false, error = null, hasPetName = true, code = '' } = {}) {
  if (!status) return '';
  const mode = status.mode;
  const err = error ? `<p class="colony-pair-error" role="alert">${escapeHtml(error)}</p>` : '';
  const off = busy ? ' disabled' : '';

  if (mode === 'needs-name') {
    return `<div class="colony-pair" data-pair="needs-name">
      <p class="colony-pair-text">Give your pet a name in Social first, then you can share your colony.</p>
    </div>`;
  }
  if (mode !== 'unpaired') return ''; // local, not-set-up, offline, paired

  const invite = status.invite && typeof status.invite === 'object' ? status.invite : null;
  const joining = status.joining && typeof status.joining === 'object' ? status.joining : null;

  if (invite && invite.joinerPetName) {
    const who = escapeHtml(invite.joinerPetName);
    return `<div class="colony-pair" data-pair="confirm">
      <p class="colony-pair-text"><strong>${who}</strong> wants to share your colony. Is that them?</p>
      <div class="colony-pair-row">
        <button type="button" id="colony-pair-yes" class="colony-pair-btn"${off}>Yes, share!</button>
        <button type="button" id="colony-pair-no" class="colony-pair-btn secondary"${off}>No</button>
      </div>${err}
    </div>`;
  }
  if (invite) {
    return `<div class="colony-pair" data-pair="inviting">
      <p class="colony-pair-text">Your code: <strong class="colony-pair-code">${escapeHtml(invite.code)}</strong> — read it out to them. It works for 20 minutes.</p>
      <p class="colony-pair-wait">Waiting for them to type it…</p>${err}
    </div>`;
  }
  if (joining) {
    return `<div class="colony-pair" data-pair="joining">
      <p class="colony-pair-wait">Waiting for <strong>${escapeHtml(joining.inviterPetName)}</strong> to say yes…</p>${err}
    </div>`;
  }
  const dis = busy || !hasPetName ? ' disabled' : '';
  return `<div class="colony-pair" data-pair="offer">
    <p class="colony-pair-text">🐈 Share your colony with your brother or sister</p>
    <div class="colony-pair-row">
      <button type="button" id="colony-pair-open" class="colony-pair-btn"${dis}>Get a sharing code</button>
    </div>
    <div class="colony-pair-row">
      <label class="colony-pair-label" for="colony-pair-code">Got a code?</label>
      <input type="text" id="colony-pair-code" class="colony-pair-input" maxlength="${INVITE_CODE_LENGTH}"
        autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false"
        placeholder="CODE" value="${escapeHtml(sanitizeInviteCode(code))}" />
      <button type="button" id="colony-pair-join" class="colony-pair-btn"${dis}>Join</button>
    </div>${err}
  </div>`;
}

// renderColonyHtml({ colony, me, members, now, status, owned, catalog }) -> HTML
// string for the Colony panel body. Safe to call with anything; never throws.
// `now` (epoch ms, the caller's Date.now()) is the clock for the shy rule,
// which only waits on a partner who is still playing (colony.tamingProgress).
// `clanRoles` (progression.state.clanRoles) names the medicine cat and the
// deputy; it is optional and read defensively.
// `trades` ({ give, want, confirmId, busy, error }) feeds renderTradesHtml.
// `pairing` ({ busy, error, hasPetName, code }) feeds renderPairingHtml; the
// pairing area sits right under the header so it is never buried under a long
// list of cats. With nothing to show it is still the same empty placeholder.
export function renderColonyHtml({ colony, me, members = 1, now, status, owned, catalog, pairing, trades, clanRoles, clanName } = {}) {
  const cats = Array.isArray(colony && colony.cats) ? colony.cats : [];
  const safeColony = { ...(colony || {}), cats, feeds: Array.isArray(colony && colony.feeds) ? colony.feeds : [] };
  const partner = colony && colony.partner && typeof colony.partner === 'object' ? colony.partner : null;
  // Kept RAW: every line that names the partner is escaped once, when it is
  // placed into the HTML, so nothing is ever escaped twice or not at all.
  const partnerName = partner && partner.petName ? String(partner.petName) : 'your partner';

  const ctx = { me, partner, partnerName, catalog, owned, feeds: safeColony.feeds, verdicts: verdictsOf(clanRoles) };
  const rows = cats.map((cat) => ({ cat, p: tamingProgress(safeColony, cat.name, { members, now }) }));
  rows.sort((a, b) =>
    (b.p.tamed - a.p.tamed) || (b.p.have - a.p.have) || (a.cat.name < b.cat.name ? -1 : a.cat.name > b.cat.name ? 1 : 0));

  const mode = status && status.mode;
  const header = `<p class="colony-mode" data-mode="${escapeHtml(mode)}">${escapeHtml(modeLine(mode, partnerName))}</p>`;
  const list = rows.length
    ? `<div class="cards colony-cards">${rows.map((r) => catCard(r.cat, r.p, ctx)).join('')}</div>`
    : `<p class="colony-empty">No colony cats yet — touch noses with a stray, then feed it 🐟</p>`;
  // Full at the same cap canFeed uses: 12 alone, 24 as a pair.
  const cap = colonyCap(members);
  const roomTogether = cap < COLONY_MAX ? ` Share it with your brother or sister to make room for ${COLONY_MAX}.` : '';
  const full = cats.length >= cap
    ? `<p class="colony-full">The colony is full — ${cap} cats call it home 🏠${roomTogether}</p>` : '';

  const pair = renderPairingHtml(status, pairing || {});
  // Trading is only for a live pair: the offer RPCs need the partner on the server.
  const trading = mode === 'paired'
    ? `<div id="colony-trading">${renderTradesHtml({ colony: safeColony, me, owned, catalog, state: trades })}</div>` : '';
  const title = typeof clanName === 'string' && clanName ? escapeHtml(clanName) : '';
  const heading = title ? `<h3 class="colony-title">${title}</h3>` : '';
  return `${heading}${header}<div id="colony-pairing">${pair}</div>${trading}${list}${full}`;
}

// ---- "While you were out" (Task 10) -----------------------------------------
// renderNewsHtml(news, partnerName) -> HTML for the card that overlays the home
// base on open. `news` is colony.colonyNews's { lines, any }: plain text, escaped
// here, one list item each. '' when there is nothing to say. The button id
// (colony-news-ok) is what homebase.js listens for.
export function renderNewsHtml(news, partnerName) {
  const lines = news && Array.isArray(news.lines) ? news.lines.filter((l) => typeof l === 'string' && l) : [];
  if (lines.length === 0) return '';
  const sub = partnerName ? `What's new with you and ${escapeHtml(partnerName)}` : "What's new in your colony";
  return `<div class="colony-news-card" role="dialog" aria-modal="true" aria-labelledby="colony-news-title">
    <h2 id="colony-news-title">While you were out 🐾</h2>
    <p class="colony-news-sub">${sub}</p>
    <ul class="colony-news-list">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
    <button type="button" id="colony-news-ok" class="colony-news-btn">Let's go!</button>
  </div>`;
}

// ---- Trading (Task 11) -------------------------------------------------------
// A one-for-one accessory swap between the two siblings. The binding rule: a
// completed swap is FINAL — neither side can take it back — so the UI says so
// plainly and the accepting side must click twice: "Swap!" only reveals a
// "Yes — swap forever" button; nothing is answered until that second click.
// homebase.js owns the state (the chosen items, which offer awaits its second
// click, busy, error) and the delegated click handler; every button here
// carries data-trade-action (offer | cancel | accept | decline | confirm |
// back) and, for a specific offer, data-trade-id.

// A plain line for each way a trade step can fail; null when it did not.
export function tradeErrorLine(word) {
  switch (word) {
    case 'ok': case 'accepted': case 'declined': case 'cancelled': return null;
    case 'not-owned': return "You don't have that one any more.";
    case 'gone': return "That swap isn't there any more.";
    default: return 'Something went wrong — try again.';
  }
}

// The second click of a swap must be a deliberate one. render() is synchronous,
// so the "Yes — swap forever" button can appear right under the pointer of a
// double-tap on "Swap!": a confirm click is honoured only for the offer whose
// confirm step is showing, not as part of a multi-click (`detail` > 1), and not
// within CONFIRM_DELAY_MS of the step appearing. Fails closed on anything odd.
export const CONFIRM_DELAY_MS = 600;
export function confirmClickAllowed({ confirmId, id, shownAt, now, detail = 1 } = {}) {
  if (!Number.isSafeInteger(id) || confirmId !== id) return false;
  if (typeof shownAt !== 'number' || typeof now !== 'number' || !Number.isFinite(shownAt) || !Number.isFinite(now)) return false;
  if (typeof detail === 'number' && detail > 1) return false;
  return now - shownAt >= CONFIRM_DELAY_MS;
}

const NO_TAKE_BACKS = 'Swaps are forever — no take-backs!';

// An item's display name, or null when the catalog doesn't know it (a hostile
// or newer-version id): such items are never offered or shown.
function itemName(catalog, id) {
  const acc = catalog && catalog.accessories;
  return typeof id === 'string' && own(acc, id) && acc[id] && typeof acc[id].name === 'string' ? acc[id].name : null;
}

function itemSelect(attr, label, ids, catalog, chosen, off) {
  const picked = ids.includes(chosen) ? chosen : ids[0];
  const opts = ids.map((id) =>
    `<option value="${escapeHtml(id)}"${id === picked ? ' selected' : ''}>${escapeHtml(itemName(catalog, id))}</option>`);
  return `<label class="colony-trade-label">${escapeHtml(label)}
      <select ${attr} aria-label="${escapeHtml(label)}"${off}>${opts.join('')}</select></label>`;
}

// renderTradesHtml({ colony, me, owned, catalog, state }) -> HTML string, or ''
// unless the colony is paired. `state` = { give, want, confirmId, busy, error }.
export function renderTradesHtml({ colony, me, owned, catalog, state } = {}) {
  const partner = colony && colony.partner && typeof colony.partner === 'object' ? colony.partner : null;
  if (!partner || !colony.id) return '';
  const st = state && typeof state === 'object' ? state : {};
  const off = st.busy ? ' disabled' : '';
  const pname = escapeHtml(partner.petName ? String(partner.petName) : 'your partner');
  const mine = new Set(Array.isArray(owned) ? owned : []);
  const err = st.error ? `<p class="colony-trade-error" role="alert">${escapeHtml(st.error)}</p>` : '';
  const open = (Array.isArray(colony.trades) ? colony.trades : []).filter((t) => t && t.status === 'offered'
    && itemName(catalog, t.give) !== null && itemName(catalog, t.want) !== null);
  const sent = open.find((t) => t.from === me && t.to === partner.playerId);
  const got = open.find((t) => t.to === me && t.from === partner.playerId);

  let body = '';

  if (got) {
    const give = escapeHtml(itemName(catalog, got.give));
    const want = escapeHtml(itemName(catalog, got.want));
    const id = escapeHtml(got.id);
    // Swap! is offered only for a swap that makes sense: I still own what they
    // want, I don't already own what they give, and neither is a starter (which
    // can never be traded). Otherwise the child sees why, and can only say no.
    const gname = escapeHtml(itemName(catalog, got.give));
    let block = null;
    if (STARTER_ACCESSORIES.includes(got.give)) block = `${give} can't be swapped`;
    else if (STARTER_ACCESSORIES.includes(got.want)) block = `${want} can't be swapped`;
    else if (mine.has(got.give)) block = `You already have ${gname}`;
    else if (!mine.has(got.want)) block = `You don't have your ${want} any more, so you can't swap.`;
    const have = block === null;
    if (st.confirmId === got.id && have) {
      body += `<div class="colony-trade-offer" data-trade="confirm">
        <p class="colony-trade-text">Swap your <strong>${want}</strong> for ${pname}'s <strong>${give}</strong>?
          <strong>This is forever</strong> — it can't be undone, not by you and not by ${pname}.</p>
        <div class="colony-trade-row">
          <button type="button" class="colony-trade-btn" data-trade-action="confirm" data-trade-id="${id}"${off}>Yes — swap forever</button>
          <button type="button" class="colony-trade-btn secondary" data-trade-action="back"${off}>Not yet</button>
        </div></div>`;
    } else {
      body += `<div class="colony-trade-offer" data-trade="incoming">
        <p class="colony-trade-text">${pname} offers ${give} for your ${want}</p>
        ${have ? '' : `<p class="colony-trade-note">${block}</p>`}
        <div class="colony-trade-row">
          ${have ? `<button type="button" class="colony-trade-btn" data-trade-action="accept" data-trade-id="${id}"${off}>Swap!</button>` : ''}
          <button type="button" class="colony-trade-btn secondary" data-trade-action="decline" data-trade-id="${id}"${off}>No thanks</button>
        </div></div>`;
    }
  }

  if (sent) {
    body += `<div class="colony-trade-offer" data-trade="outgoing">
      <p class="colony-trade-text">You offered ${escapeHtml(itemName(catalog, sent.give))} for ${escapeHtml(itemName(catalog, sent.want))}</p>
      <div class="colony-trade-row">
        <button type="button" class="colony-trade-btn secondary" data-trade-action="cancel" data-trade-id="${escapeHtml(sent.id)}"${off}>Cancel</button>
      </div></div>`;
  } else if (!(got && st.confirmId === got.id)) {
    // Make a swap: my tradeable items for the partner's I don't own. Starters
    // are never offered, and an id the catalog doesn't know is never listed.
    const ok = (id) => itemName(catalog, id) !== null && !STARTER_ACCESSORIES.includes(id);
    const giveIds = [...new Set(Array.isArray(owned) ? owned : [])].filter(ok);
    const wanted = Array.isArray(partner.wardrobe) ? partner.wardrobe : [];
    const wantIds = [...new Set(wanted)].filter((id) => ok(id) && !mine.has(id));
    let form;
    if (giveIds.length === 0) form = '<p class="colony-trade-note">Unlock some accessories to trade 🎩</p>';
    else if (wantIds.length === 0) form = `<p class="colony-trade-note">${pname} has nothing you don't already have</p>`;
    else {
      form = `<div class="colony-trade-row">
        ${itemSelect('data-trade-give', 'You give', giveIds, catalog, st.give, off)}
        ${itemSelect('data-trade-want', `${partner.petName ? String(partner.petName) : 'Your partner'} gives`, wantIds, catalog, st.want, off)}
        <button type="button" class="colony-trade-btn" data-trade-action="offer"${off}>Offer swap</button>
      </div>`;
    }
    body += `<div class="colony-trade-make" data-trade="make"><h4>Make a swap</h4>${form}</div>`;
  }

  return `<section class="colony-trades" data-trades>
    <h3>Swap accessories 🔄</h3>${body}
    <p class="colony-trade-forever">${NO_TAKE_BACKS}</p>${err}
  </section>`;
}

// ── Walk together with your partner (Task 12) ──────────────────────────
// `room` is rooms.getState(): null outside a room, else { code, roster,
// isHost, pair, starting }. These three go into homebase.js's hero and its
// Social › Walk together section.

function partnerOf(colony) {
  const p = colony && colony.partner;
  return p && typeof p === 'object' ? p : null;
}
const partnerNameOf = (partner) => (partner && partner.petName ? String(partner.petName) : 'your partner');

// The home base's Start. In a room every member gets the same button: the
// host's starts everyone, anyone else's asks the host (game/rooms.js), so
// nobody is told to wait. While that ask is out it reads "Starting…" and is
// disabled, so a second press can't send a second ask.
export function renderStartButtonHtml(room) {
  if (!room) return '<button id="btn-start" class="primary">Start the walk 🐾</button>';
  if (room.starting) return '<button id="btn-start" class="primary" disabled>Starting…</button>';
  return '<button id="btn-start" class="primary">Start the walk together 🐾</button>';
}

// One button, no code to type: only while paired (status.mode is 'local'
// whenever multiplayer is off) and not already in a room.
export function renderPartnerWalkHtml({ status, colony, room } = {}) {
  const partner = partnerOf(colony);
  if (!status || status.mode !== 'paired' || !partner || room) return '';
  return `<button id="wt-pair-walk" class="primary">🐾 Walk with ${escapeHtml(partnerNameOf(partner))}</button>`;
}

// The room panel's heading. A pair room's code is the colony id, which is
// never shown: it reads as who you're walking with instead.
export function renderRoomTitleHtml(room, colony) {
  if (room && room.pair) return `Walking with ${escapeHtml(partnerNameOf(partnerOf(colony)))}`;
  return `Room ${escapeHtml(room && room.code)} — share this code!`;
}
