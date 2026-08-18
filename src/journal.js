// v15 Collector's Journal — static catalog + Album-tab renderer for the 11
// JOURNAL_TYPES ids tracked in progression.js's state.journal.

// All content here is a fixed, static catalog (ids/emoji/names/hints are
// never user- or network-supplied), so none of it needs HTML-escaping.
export const CRITTER_INFO = [
  { id: 'bird', emoji: '🐦', name: 'Chirpy Bird', hint: 'Move slowly and stay downwind to get close.' },
  { id: 'squirrel', emoji: '🐿️', name: 'Bushy Squirrel', hint: 'Chase it toward a tree trunk!' },
  { id: 'butterfly', emoji: '🦋', name: 'Fluttering Butterfly', hint: 'Time a mid-air pounce to catch one.' },
  { id: 'duck', emoji: '🦆', name: 'Paddling Duck', hint: 'Look for it near ponds and puddles.' },
  { id: 'seagull', emoji: '🕊️', name: 'Squawking Seagull', hint: 'Follow the shoreline at the seaside.' },
  { id: 'crab', emoji: '🦀', name: 'Sideways Crab', hint: 'Check the sand near the tide line.' },
  { id: 'dog', emoji: '🐕', name: 'Friendly Dog', hint: 'Walk up calmly for a sniff hello.' },
  { id: 'villager', emoji: '🧑', name: 'Neighborhood Villager', hint: 'Wave hello as you walk past.' },
  { id: 'firefly', emoji: '✨', name: 'Glowing Firefly', hint: 'Comes out after dusk — watch for the twinkle.' },
  { id: 'mouse', emoji: '🐭', name: 'Quick Mouse', hint: 'Stalk quietly, then pounce!' },
  // v18 Task 2.6 — the eleventh page, and The Old Docks' own critter. Hint
  // style matches the ten above: one short sentence naming WHERE to look,
  // never a mechanic the player hasn't met yet.
  { id: 'rat', emoji: '🐀', name: 'Dockside Rat', hint: 'Nose around the crates down at the old docks.' },
];

// renderJournalHtml(journal, goldenFound, goldenTotal) → HTML string.
// `journal` may be an untrusted/hostile object (e.g. loaded from a cloud
// payload before progression's sanitizeJournal runs, or passed straight
// through in a context that skips it) — every count is coerced through
// Number.isFinite so a non-numeric or malicious value (e.g. '<script>')
// simply falls back to 0 (unspotted) rather than reaching the DOM.
export function renderJournalHtml(journal, goldenFound, goldenTotal) {
  const j = journal && typeof journal === 'object' ? journal : {};
  const found = Number.isFinite(goldenFound) ? goldenFound : 0;
  const total = Number.isFinite(goldenTotal) ? goldenTotal : 0;
  const cards = CRITTER_INFO.map((c) => {
    const raw = j[c.id];
    const count = Number.isFinite(raw) ? raw : 0;
    if (count > 0) {
      return `<div class="journal-card spotted">
        <span class="journal-emoji">${c.emoji}</span>
        <span class="journal-name">${c.name}</span>
        <span class="journal-count">×${count}</span>
      </div>`;
    }
    return `<div class="journal-card unspotted">
      <span class="journal-emoji">❓</span>
      <span class="journal-hint">${c.hint}</span>
    </div>`;
  }).join('');
  return `<div class="journal-grid">${cards}</div>
    <div class="journal-footer">🥇 Golden mice: ${found}/${total}</div>`;
}
