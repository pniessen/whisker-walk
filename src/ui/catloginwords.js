// The words of the My cat sheet (cat login M3). A lazy file: they join the phrase table
// (src/clanphrases.js, addPhrases) when the sheet's chunk arrives, so the start-up download does not
// carry them. They are the same in every word set; a set that needs its own wording puts the id in
// its PHRASES (src/offclanwords.js) and that wins. Both sets are checked by
// test/homebase.catlogin.test.js.
export const LINES = Object.freeze({
  'catlogin.title': 'My cat, on any device',
  'catlogin.intro': 'Your cat can visit your other devices. Pick one.',
  'catlogin.keep': 'Keep my cat safe',
  'catlogin.keeping': 'Saving…',
  'catlogin.bring': 'Bring my cat here',
  'catlogin.bring.label': 'Cat code from my other device',
  'catlogin.bring.placeholder': 'WORD · WORD · WORD · WORD',
  'catlogin.bring.hint': 'Type the four words. Spaces or dashes are fine.',
  'catlogin.chip.snap': (word) => `Did you mean ${word}?`,
  // the new code, shown once
  'catlogin.new.title': 'This is your cat code.',
  'catlogin.new.titlenew': 'This is your new cat code.',
  'catlogin.new.note': 'Write it on paper. Show a grown-up. Keep it safe.',
  'catlogin.new.warn': 'Anyone who knows it can play your cat. If you lose it and every device, we cannot find your cat.',
  'catlogin.new.notkept': 'This device could not keep the new code. Write it down now.',
  'catlogin.new.check': 'To check, type the last word:',
  'catlogin.new.ok': 'I wrote it down',
  'catlogin.new.skip': 'Skip, I’ll do it later',
  // the sheet once the cat is saved
  'catlogin.linked.tag': 'saved to the cloud after every trip',
  'catlogin.show': 'Show my cat code',
  'catlogin.show.hint': 'Press and hold for two seconds.',
  'catlogin.show.notv': 'Your cat code is not shown on a TV or with a game pad.',
  'catlogin.hide': 'Hide',
  'catlogin.change': 'Change my cat code',
  'catlogin.change.ask': 'Change your cat code?',
  'catlogin.change.note': 'Other devices will need the new code.',
  'catlogin.change.no': 'Keep it',
  'catlogin.change.yes': 'Yes, change it',
  'catlogin.unlink.note': (words) => `Your cat code is ${words}. Write it down. It’s the only way to get this cat back.`,
  'catlogin.preview.cloud': 'In the cloud',
});
