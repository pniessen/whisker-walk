// The words of "Start a fresh cat" (Settings). A lazy file: they join the phrase table
// (src/clanphrases.js, addPhrases) when the chunk (src/ui/freshcat.js) arrives, so the start-up
// download does not carry them. They name no clan, place or series word, so they are the same in
// every word set (test/freshcat.words.test.js reads them under both). One line per sentence, each
// no longer than 90 characters, so a child reads them one at a time.
export const LINES = Object.freeze({
  // the question
  'fresh.title': 'Start a fresh cat?',
  'fresh.what': 'This device gets a brand new cat. Paws, outfits and walks start again from zero.',
  'fresh.settings': 'Sound, screen and other device settings stay just as they are.',
  // the cat is in the cloud
  'fresh.cloud.safe': 'Your old cat is saved in the cloud. Its cat code is:',
  'fresh.cloud.back': 'To get it back, tap Load cat and type those four words.',
  'fresh.cloud.kept': 'Nothing in the cloud is deleted. A copy also stays on this device.',
  // the cat is only here, or the cloud could not be reached
  'fresh.local.only': 'This cat is only on this device.',
  'fresh.local.gone': 'We keep a copy here. If you start another fresh cat later, that copy is gone for good.',
  'fresh.local.save': 'To keep it safe, tap Save this cat first.',
  'fresh.cloud.failed': 'We could not reach the cloud, so your newest walks may not be saved there.',
  'fresh.cloud.last': 'Your cat code (from the last save) is:',
  'fresh.checking': 'Saving your cat to the cloud first…',
  // the buttons
  'fresh.no': 'Cancel',
  'fresh.save': 'Save this cat first',
  'fresh.saving': 'Saving…',
  'fresh.hold': 'Hold to start fresh',
  'fresh.hold.anyway': 'Hold to start fresh anyway',
  'fresh.hold.label': 'Hold to start a fresh cat. Press and hold the button for two seconds.',
  // while holding
  'fresh.hold.on': 'Keep holding…',
  'fresh.hold.early': 'You let go too early. Hold the button for two seconds.',
  'fresh.hold.tap': 'Press and hold the button until the ring is full.',
  // when it cannot go ahead
  'fresh.room': 'Leave the room first, then you can start a fresh cat.',
  'fresh.err.save': 'That did not work. Your cat was not changed.',
  'fresh.err.nocopy': 'This device could not keep a safe copy, so nothing was changed.',
  'fresh.err.failed': 'Starting fresh did not work, so nothing was changed.',
  // bringing the old cat back
  'fresh.back.title': 'Bring back your old cat?',
  'fresh.back.what': 'This device will have your old cat again, with its paws, outfits and walks.',
  'fresh.back.swap': 'The cat you have now is kept here, so you can switch back.',
  'fresh.back.code': 'Its cat code is:',
  'fresh.back.yes': 'Yes, bring it back',
  'fresh.back.no': 'Cancel',
  'fresh.back.err': 'That did not work, so nothing was changed.',
  'fresh.back.none': 'There is no old cat on this device to bring back.',
});
