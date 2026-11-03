// v15 Collector's Journal — static catalog + Album-tab renderer for the 12
// JOURNAL_TYPES ids tracked in progression.js's state.journal.

// All content here is a fixed, static catalog (ids/emoji/names/hints are
// never user- or network-supplied), so none of it needs HTML-escaping.
// The neighbour as a dressed Twoleg (matches the in-game villager: trouser
// legs, shoes, a coat flaring at the hips, a scarf, a round head, a bobble
// hat, one arm waving). Static, no ids/text/links; the silhouette filter
// darkens it like an emoji.
const TWOLEG_ART = '<svg viewBox="0 0 24 32" width="0.9em" height="1.2em" aria-hidden="true">'
  + '<rect x="7.5" y="24" width="3.6" height="6" fill="#4a5468"/>'
  + '<rect x="12.9" y="24" width="3.6" height="6" fill="#4a5468"/>'
  + '<ellipse cx="8.4" cy="30.2" rx="3" ry="1.5" fill="#3a3330"/>'
  + '<ellipse cx="15.6" cy="30.2" rx="3" ry="1.5" fill="#3a3330"/>'
  + '<polygon points="8,14.5 16,14.5 18,25.5 6,25.5" fill="#6a8ac0"/>'
  + '<polygon points="8.2,15 5.2,16 4.4,23 6.6,23.4 7.6,18" fill="#6a8ac0"/>'
  + '<polygon points="15.8,15 17.6,16.4 20.6,8.2 18.4,7.2 16.4,13" fill="#6a8ac0"/>'
  + '<circle cx="19.6" cy="6.4" r="1.7" fill="#e8c8a8"/>'
  + '<rect x="8" y="13.2" width="8" height="2.4" rx="1.1" fill="#d8a640"/>'
  + '<rect x="9.2" y="14.6" width="2.2" height="5" rx="0.8" fill="#d8a640"/>'
  + '<circle cx="12" cy="9.6" r="3.7" fill="#e8c8a8"/>'
  + '<path d="M7.9 8.8 Q8.2 3.8 12 3.8 Q15.8 3.8 16.1 8.8 Z" fill="#d8503a"/>'
  + '<rect x="7.4" y="7.8" width="9.2" height="1.6" rx="0.8" fill="#d8503a"/>'
  + '<circle cx="12" cy="2.9" r="1.7" fill="#f4f0e8"/>'
  + '</svg>';

export const CRITTER_INFO = [
  { id: 'bird', emoji: '🐦', name: 'Chirpy Bird', hint: 'Move slowly and stay downwind to get close.' },
  { id: 'squirrel', emoji: '🐿️', name: 'Bushy Squirrel', hint: 'Chase it toward a tree trunk!' },
  { id: 'butterfly', emoji: '🦋', name: 'Fluttering Butterfly', hint: 'Time a mid-air pounce to catch one.' },
  { id: 'duck', emoji: '🦆', name: 'Paddling Duck', hint: 'Look for it near ponds and puddles.' },
  { id: 'seagull', emoji: '🕊️', name: 'Squawking Seagull', hint: 'Follow the shoreline at the seaside.' },
  { id: 'crab', emoji: '🦀', name: 'Sideways Crab', hint: 'Check the sand near the tide line.' },
  { id: 'dog', emoji: '🐕', name: 'Friendly Dog', hint: 'Spot it from outside its lawn — it chases cats off the grass!' },
  { id: 'villager', emoji: '🧑', name: 'Neighborhood Villager', hint: 'Wave hello as you walk past.', art: TWOLEG_ART },
  { id: 'firefly', emoji: '✨', name: 'Glowing Firefly', hint: 'Comes out after dusk — watch for the twinkle.' },
  { id: 'mouse', emoji: '🐭', name: 'Quick Mouse', hint: 'Stalk quietly, then pounce!' },
  // v18 Task 2.6 — the eleventh page, and The Old Docks' own critter. Hint
  // style matches the ten above: one short sentence naming WHERE to look,
  // never a mechanic the player hasn't met yet.
  { id: 'rat', emoji: '🐀', name: 'Dockside Rat', hint: 'Nose around the crates down at the old docks.' },
  { id: 'rabbit', emoji: '🐇', name: 'Moor Rabbit', hint: 'Watch it bolt for its burrow!' },
  { id: 'frog', emoji: '🐸', name: 'Bog Frog', hint: 'Creep up softly, or it plops into the bog!' },
  { id: 'goat', emoji: '🐐', name: 'Mountain Goat', hint: 'It never lets you close — watch it leap along the rim!' },
];

// renderJournalHtml(journal, goldenFound, goldenTotal) → HTML string.
// `journal` may be an untrusted/hostile object (e.g. loaded from a cloud
// payload before progression's sanitizeJournal runs, or passed straight
// through in a context that skips it) — every count is coerced through
// Number.isFinite so a non-numeric or malicious value (e.g. '<script>')
// simply falls back to 0 (unspotted) rather than reaching the DOM.
// chasedOff (Clan Life Part 2): the lifetime intruders-chased-off tally
// (state.feats.intruder). The line shows only when it is passed (homebase does
// so in Clan Edition); anything but a finite non-negative number reads 0.
export function renderJournalHtml(journal, goldenFound, goldenTotal, { chasedOff } = {}) {
  const j = journal && typeof journal === 'object' ? journal : {};
  const found = Number.isFinite(goldenFound) ? goldenFound : 0;
  const total = Number.isFinite(goldenTotal) ? goldenTotal : 0;
  const cards = CRITTER_INFO.map((c) => {
    const raw = j[c.id];
    const count = Number.isFinite(raw) ? raw : 0;
    if (count > 0) {
      return `<div class="journal-card spotted">
        <span class="journal-emoji">${c.art || c.emoji}</span>
        <span class="journal-name">${c.name}</span>
        <span class="journal-count">×${count}</span>
      </div>`;
    }
    // Not found yet: the critter's own emoji drawn as a dark shape (CSS
    // .silhouette), its name kept back. The shape is decorative; the card's
    // label says what it means.
    return `<div class="journal-card unspotted" role="group" aria-label="Not found yet">
      <span class="journal-emoji silhouette" aria-hidden="true">${c.art || c.emoji}</span>
      <span class="journal-hint">${c.hint}</span>
    </div>`;
  }).join('');
  const chased = chasedOff === undefined ? ''
    : `<div class="journal-footer">🛡️ Intruders chased off: ${Number.isFinite(chasedOff) && chasedOff > 0 ? Math.floor(chasedOff) : 0}</div>`;
  return `<div class="journal-grid">${cards}</div>
    <div class="journal-footer">🥇 Golden mice: ${found}/${total}</div>${chased}`;
}
