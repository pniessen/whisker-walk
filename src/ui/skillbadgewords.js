// The words and pictures of the walking screen's skill badges. A lazy file: they join the phrase
// table (src/clanphrases.js, addPhrases) when the badge strip's chunk arrives, so the start-up
// download does not carry them. The lines are the same in every word set (a skill's name is its
// own word, src/skills.js); a set that needs different wording puts the id in its PHRASES and that
// wins. Both sets are checked by test/skillbadges.test.js.

// One picture per skill id, in catalog order. test/skillbadges.test.js fails if a skill has none.
export const ICONS = Object.freeze({
  'spring-paws': '🦘',
  'long-zoomies': '💨',
  'fence-runner': '🚧',
  'sea-legs': '🌊',
  'tightrope-tail': '🎪',
  'long-leap': '🏹',
  'twitchy-nose': '👃',
  'night-eyes': '🌙',
  'whisker-sense': '🐱',
  charmer: '💕',
  'far-call': '📣',
  'gift-paws': '🎁',
  'sure-claws': '🧗',
  'big-swat': '💥',
});

export const LINES = Object.freeze({
  'skillbadge.row': 'Skills earned',
  'skillbadge.named': (name) => `Skill: ${name}`,
  'skillbadge.aria': (name) => `${name}, a skill you earned`,
  'skillbadge.more': (n) => `${n} more ${n === 1 ? 'skill' : 'skills'}. See them in Menu → Skills.`,
  'skillbadge.moreAria': (n) => `${n} more earned ${n === 1 ? 'skill' : 'skills'}`,
});
