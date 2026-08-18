// The home base tab set, a resolver that clamps any unknown/stale tab id
// back to the default, and the Skills panel's pure HTML renderer. Pure — no
// DOM — so it's unit-tested; homebase.js imports it for the tab bar, for
// persisting the active tab across render() rebuilds, and for the body of
// the Skills panel. A stale persisted 'play' id (the tab's pre-rename name)
// clamps to 'cats' via the same unknown-id fallback.
//
// The Skills renderer lives HERE rather than in homebase.js because
// homebase.js reaches for document.getElementById at module scope and so
// cannot be imported by the suite at all — the same reason journal.js owns
// renderJournalHtml. Its only import is src/skills.js, which is itself
// import-free, so this module stays DOM-free and cheap to test.
import { SKILL_FAMILIES, SKILLS, hasSkill, skillProgress } from '../skills.js';

// v18 adds 'skills' as the sixth tab. It sits third, next to the cat and
// dress-up tabs, because those three are all "look at what this cat has
// become" — Social/Album/Settings are a different mode of use. Order is
// pinned in test/hometabs.test.js: it's the tab bar's left-to-right order,
// not just a membership list.
export const HOME_TABS = ['cats', 'accessories', 'skills', 'social', 'album', 'settings'];

export function resolveTab(id) {
  return HOME_TABS.includes(id) ? id : 'cats';
}

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
// save therefore renders all twelve abilities locked at 0, which is the
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
