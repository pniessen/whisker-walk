// The home base's pure HTML renderers for the Skills sheet and the star-name
// picker. Pure — no DOM — so they're unit-tested. (The tab set that used to
// live here went away with the tab bar in v21 Stream 5: the home screen is
// now the dressing room plus sheets, see dressingroom.js's HOME_SHEETS.)
//
// The Skills renderer lives HERE rather than in homebase.js because
// homebase.js reaches for document.getElementById at module scope and so
// cannot be imported by the suite at all — the same reason journal.js owns
// renderJournalHtml. Its only import is src/skills.js, which is itself
// import-free, so this module stays DOM-free and cheap to test.
import { SKILL_FAMILIES, SKILLS, hasSkill, skillProgress } from '../skills.js';

// ---------------------------------------------------------------------------
// Skills panel
//
// A read-only view over existing save state: it awards nothing, writes
// nothing, and mutates no field. Everything it shows comes from
// skills.js's hasSkill/skillProgress, so the tab can never disagree with the
// gate an ability actually checks.
// ---------------------------------------------------------------------------

// Duplicated from homebase.js rather than imported, for the same reason the
// renderer lives here at all: importing homebase.js would pull in the DOM.
// Small enough that a copy beats a third module.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Feat counts reach this function already coerced by skills.js's own
// hostile-state helpers, but this is an innerHTML display path fed
// (ultimately) by a cloud payload, so they are coerced AGAIN here rather
// than trusted — the same escape-at-render defence-in-depth homebase.js
// applies to streakCount and raceBestMs, which are likewise pre-sanitized
// upstream. A hostile or absent value reads as 0, never NaN.
function safeCount(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

// One ability as a `.card`, deliberately reusing the shop's card/card-name/
// card-sub/tag classes so the Skills tab reads as the same game as the
// accessory shop rather than a second design system.
//
// LOCKED CARDS SHOW THE FEAT IN FULL. The challenge text is the content of
// this wave — a card that hid "Tip over 25 things" behind a "???" would
// leave the player with nothing to aim at.
function skillCard(state, skill) {
  const earned = hasSkill(state, skill.id);
  // skillProgress returns null only for an unknown id, and we're iterating
  // the catalog — but a missing entry must still not throw on a render path.
  const { have: rawHave, need: rawNeed } = skillProgress(state, skill.id) ?? {};
  const need = safeCount(rawNeed);
  // `have` is returned RAW by the catalog and may exceed `need`. Today that
  // can't reach a locked card (have >= need is exactly what makes hasSkill
  // true, and only locked cards print the fraction), but the clamp stays as
  // a guard: it costs nothing and it is what stops a future predicate change
  // from putting "27/25" under a half-full bar.
  const have = Math.min(safeCount(rawHave), need);
  // need === 0 would be a catalog authoring mistake, not a live case; guard
  // anyway so it renders as a full bar instead of a NaN width.
  const pct = need > 0 ? Math.round((have / need) * 100) : 100;

  // The fraction is only shown while the ability is still locked, because
  // "how far to go" is the only thing it answers. An earned card that also
  // printed a count could contradict itself — state.skills is authoritative
  // once written (the spec forbids revoking an earned ability), so a card
  // can legitimately be earned while its counter reads lower than the
  // threshold: a later threshold RAISE, or a save whose skills list
  // outlived a feats reset. "Reach 10 vantage perches — 0/10 · Earned ✅" is
  // the shape that bug takes, and dropping the fraction removes it outright
  // rather than papering over it with a clamp that would print a number the
  // save does not actually hold.
  const status = earned
    ? `<div class="skill-feat">${escapeHtml(skill.feat)}</div>
       <div class="tag on">Earned ✅</div>`
    : `<div class="skill-feat">${escapeHtml(skill.feat)} — ${have}/${need}</div>
       <div class="skill-bar" role="progressbar" aria-valuemin="0"
        aria-valuemax="${need}" aria-valuenow="${have}"><span style="width:${pct}%"></span></div>`;

  return `<div class="card skill-card ${earned ? 'selected' : 'locked'}" data-skill="${escapeHtml(skill.id)}">
    <div class="card-name">${escapeHtml(skill.name)}</div>
    <div class="card-sub">${escapeHtml(skill.effect)}</div>
    ${status}
  </div>`;
}

// renderSkillsHtml(state) → HTML string for the Skills panel body.
//
// `state` may be anything at all — a brand-new save with no `skills`/`feats`
// keys, or a hostile cloud payload — because every read goes through
// skills.js, which never throws and coerces a missing counter to 0. A new
// save therefore renders every ability in the catalog locked at 0 (eleven as
// v18 shipped, twelve since Sea Legs came back in v20), which is the
// correct first-run screen, not an error case.
export function renderSkillsHtml(state) {
  const earnedCount = SKILLS.filter((s) => hasSkill(state, s.id)).length;
  const sections = SKILL_FAMILIES.map((fam) => {
    const members = SKILLS.filter((s) => s.family === fam.id);
    // A family with no members can only happen mid-edit of the catalog;
    // emit nothing rather than a stray empty heading.
    if (!members.length) return '';
    return `<div class="skill-family">
      <h3>${escapeHtml(fam.emoji)} ${escapeHtml(fam.name)}</h3>
      <div class="cards">${members.map((s) => skillCard(state, s)).join('')}</div>
    </div>`;
  }).join('');
  return `${sections}
    <div class="skills-footer">🐾 Abilities earned: ${earnedCount}/${SKILLS.length}</div>`;
}

// ---------------------------------------------------------------------------
// Golden mice tally (home base header)
//
// `known` is passed IN (homebase.js hands over goldmice.js's KNOWN_GOLD)
// rather than imported, because goldmice.js imports THREE and this module
// has to stay headless. Counting only known ids means a shape-valid fake id
// in a hostile save can never push the tally past the total.
// ---------------------------------------------------------------------------

export function goldenFound(golden, known) {
  if (!Array.isArray(golden) || !known || typeof known.has !== 'function') return 0;
  const seen = new Set();
  for (const id of golden) if (typeof id === 'string' && known.has(id)) seen.add(id);
  return seen.size;
}

export function renderGoldenTallyHtml(found, total) {
  const t = safeCount(total);
  const f = Math.min(safeCount(found), t);
  const phrase = `${f} of ${t} golden mice`;
  // The words "golden mice" are visually hidden by CSS on a phone (one line
  // only), clipped rather than display:none so a screen reader still reads
  // them; the title keeps the whole phrase for a hover.
  return `<span class="hb-gold" title="${phrase}" aria-label="${phrase}">🥇 ${f} of ${t}<span class="hb-gold-word"> golden mice</span></span>`;
}

// ---------------------------------------------------------------------------
// Star-name picker (Social tab, beside the free-text pet-name field)
//
// Offers a few closed-pool names from clannames.js's candidateStarNames. The
// chosen name IS state.petName (set through the existing setPetName path), so
// there is no new save field, wire change or schema change (spec §6.1). The
// free-text field is untouched; a legacy name like "Noodle" is shown as-is.
// Rank is a label: picking one of these gates nothing.
// Every interpolated value is escaped; junk input renders nothing, never throws.
// ---------------------------------------------------------------------------
export function renderStarNamePicker(candidates, current) {
  const options = Array.isArray(candidates)
    ? candidates.filter((c) => typeof c === 'string' && c !== '')
    : [];
  if (options.length === 0) return '';
  const chosen = typeof current === 'string' ? current : '';
  const buttons = options.map((c) =>
    `<button type="button" class="star-name-pick${c === chosen ? ' chosen' : ''}" data-star-name="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join('');
  return `<div class="star-name-picker">
    <div class="tag">Or pick a star name${chosen ? ` (now: ${escapeHtml(chosen)})` : ''}</div>
    ${buttons}
  </div>`;
}
