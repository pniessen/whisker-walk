// The phrases the game writes with, or beside, the words in clanwords.js: one
// lookup, keyed by a stable id.
//
// clanwords.js holds the WORDS (rank words, name halves, the group suffix).
// This file holds the LINES built from them or written in their flavour: a
// fight's toasts, the border and scent-mark prompts, the pick-your-group card,
// the patrol goodbyes, a few landmark labels, the fight moves' names. Before
// 2026-11-16 they were spelled out in about twenty files; a later change of
// vocabulary needs them in one table.
//
// HOW IT IS READ. phrase(id, ...args) is a plain synchronous lookup. An entry
// is a string, or a function of the caller's values that returns one. The
// caller passes finished text (a cat's shown name, a group's name), never an
// id to resolve, so this file imports only wordset.js and can be imported
// from anywhere without a cycle and without THREE. A caller that builds HTML
// escapes exactly as it did before: either the values it hands in, or the
// phrase it gets back.
//
// EDITIONS. Clan Edition ('canon') and Legacy Edition differ in a handful of
// phrases. Those have one entry per edition, with the edition id as the last
// part of the id ('edition.title.canon', 'edition.title.legacy'), and the
// caller that already knows the edition picks one (edition.js does, as it did
// before). Nothing here reads a save.
//
// RULES
//   - An id never changes once it is used: ids are what a second table of
//     words will be keyed by. Ids are our own words: none spells a word from
//     clanwords.js (the scan in test/clanwords.test.js reads this file too).
//   - No borrowed word is typed here either. A phrase that needs one takes it
//     from the word set in use (wordset.js), at the moment it is read.
//   - Every entry is recorded, with its output, in the series-words snapshot
//     (test/serieswords.test.js, "phrases"). Changing an entry's text changes
//     the family's game: see that file's header first.
//   - A function entry reads the word set when it is CALLED, never when this
//     module loads, so nothing here is fixed at start-up.
//   - A word set may carry its own PHRASES, keyed by these ids (wordset.js).
//     phrase() uses the set's entry where it has one and this table's
//     otherwise. The 'on' set has none, so today every line is this table's.
import { words } from './wordset.js';

const suffix = () => words().CLAN_SUFFIX;
const groupWord = () => suffix().toLowerCase();

const TABLE = Object.freeze({
  // ---- the pieces a group's name and a cat's tag are built from -------------
  // prefix -> the group's name (Moss -> MossClan)
  'group.name': (prefix) => prefix + suffix(),
  // the second line of a tag: "<rank word> of <group>"
  'tag.rankOfGroup': (rankWord, group) => `${rankWord} of ${group}`,
  // what follows a cat's name when it is not in the colony: " the <word>"
  'outside.the': (word) => ` the ${word}`,
  // a friendly cat that has just turned cross
  'outside.crossNow': (word) => ` a ${word} now!`,

  // ---- editions --------------------------------------------------------------
  'edition.title.canon': () => `${suffix()} Edition`,
  'edition.title.legacy': 'Legacy Edition',
  'edition.game': (editionTitle) => `Whisker Walk 2: ${editionTitle}`,
  'edition.note': () => `Switching renames the places and shows or hides the ${groupWord()} territories. Nothing is lost.`,
  'prize.warpaint.canon': () => `${suffix()} War Paint`,
  'prize.warpaint.legacy': 'War Paint',

  // ---- picking a home group --------------------------------------------------
  'pick.heading': () => `Pick your ${groupWord()}`,
  'pick.headingMine': (group) => `Your ${groupWord()}: ${group}`,
  'pick.campSoon': 'camp coming soon',
  'pick.territorySoon': 'territory coming soon',
  'pick.both': (group) => `You're both ${group}!`,
  'pick.lineBoth': (group) => ` — you’re both ${group}!`,
  'pick.momentTitle': () => `The ${groupWord()}s have noticed you!`,
  'pick.momentAsk': () => `Which ${groupWord()} will you join?`,
  'pick.changeTitle': () => `Change your ${groupWord()}?`,
  'pick.changeAsk': () => `Tap a ${groupWord()} to join it.`,
  'pick.keep': () => `Keep my ${groupWord()}`,
  'pick.choose': () => `Choose your ${groupWord()} ›`,
  'home.welcome': (group) => `Home to ${group}'s land 🏡`,
  'colony.allies': 'allies',
  'map.camp': (group) => `${group} camp`,
  // the line under today's place when it is a group's territory
  'place.groupLand': (group) => `${group} land`,

  // ---- the star name ---------------------------------------------------------
  'star.pick': 'Or pick a star name',

  // ---- a group cat on a walk -------------------------------------------------
  'patrol.prompt': (name) => `E — patrol with ${name}`,
  'patrol.start': (name) => `${name} walks the border with you 🐾`,
  'patrol.endGood': (name) => `${name} heads back to camp. Good patrol!`,
  'patrol.endShort': (name) => `${name} heads back to camp. A longer patrol next time!`,
  'patrol.award': (name) => `a patrol with ${name}`,

  // ---- a town cat that wanders in --------------------------------------------
  'house.arrival': (name, houseWord, town) => `${name} the ${houseWord} has wandered in from ${town} 🔔`,
  'house.joined': (name, town) => `${name} left ${town} to join you! She'll be waiting in the den 🏠`,

  // ---- borders and scent marks -----------------------------------------------
  'border.chasedBack': (who) => `${who} chased you back over their border! 🐾`,
  'cross.leading': (name, place) => `${name} is leading the way to ${place}! 🧭`,
  'mark.promptScratch': 'E — scratch your mark into it',
  'mark.promptScent': 'E — scent over their mark',
  'mark.buddyToo': (name) => `${name} marks it too 🐾`,
  'mark.scentedOver': (group) => `${group} scented over your mark! 🐾`,
  'mark.scentedOverRetake': (group) => `${group} scented over your mark! Scratch it again to take it back. 🐾`,

  // ---- fights ----------------------------------------------------------------
  // the pill: "<name> of <group> <ask>", then the two buttons
  'fight.challenge': (name, group, ask) => `${name} of ${group} ${ask}`,
  'fight.homeAsk': 'is on your land!',
  'fight.homeOff': 'Back off',
  'fight.borderAsk': 'blocks your path!',
  'fight.borderOff': 'Run',
  // at home, against an intruder
  'fight.homeAward': (name) => `You chased off ${name}! 🛡️`,
  'fight.homeWon': (name, group) => `${name} ran back to ${group}'s land! 🏃`,
  'fight.homeLostScar': (name) => `${name} shook it off and walked on. That scratch will heal soon!`,
  'fight.homeLost': (name) => `${name} shook it off and walked on. Try again soon!`,
  'fight.homeTogether': (petName, name) => `You and ${petName} chased ${name} off together! 🏃`,
  // at another group's border, against its patrol
  'fight.borderAward': (name) => `You faced down ${name}! 🛡️`,
  'fight.borderWon': (name) => `${name} lets you pass. 🐾`,
  'fight.borderLostScar': (name) => `${name} won this time. That scratch will heal soon!`,
  'fight.borderLost': (name) => `${name} won this time. Try again soon!`,
  // a co-walker got there first
  'fight.alreadyFacing': (petName, name) => `${petName} is already facing ${name}!`,
  'journal.chasedOff': 'Intruders chased off',

  // ---- the special fight moves: the name, and the short name on a button -----
  'move.rearUpSwat.name': 'Rear-up Swat',
  'move.rearUpSwat.short': 'Swat',
  'move.leapScratch.name': 'Leap and Scratch',
  'move.leapScratch.short': 'Leap',
  'move.pin.name': 'Pin',
  'move.pin.short': 'Pin',
  'move.rollingTumble.name': 'Rolling Tumble',
  'move.rollingTumble.short': 'Tumble',

  // ---- landmark labels -------------------------------------------------------
  'landmark.woods.oak': 'the great oak',
  'landmark.woods.oakLookout': 'great oak lookout',
  'landmark.woods.oakSquirrels': 'two squirrels racing up the great oak',
  'landmark.river.warmRocks': 'sun-warmed rocks',
  'landmark.river.warmPebble': 'a sun-warmed pebble on the low rock',
  'landmark.island.ring': 'the meeting ring under the old ash',
  'landmark.island.stoneFind': 'a bright beetle wing on a meeting stone',

  // ---- her birthday (2026-11-21): the Gathering on the island ----------------
  // the home screen's line above Explore while the event is on
  'bday.home': () => `The ${groupWord()}s are gathering for your birthday! 🎂`,
  // the leader on the rock; `name` is the name of the cat she is playing as
  'bday.announce': (name) => `Cats of all the ${groupWord()}s, gather! Today is ${name}'s birthday!`,
  // the cats' short cheers
  'bday.cheer.one': 'Happy birthday!',
  'bday.cheer.two': 'Hooray! 🎉',
  'bday.cheer.three': 'Happy birthday! 🎂',
  // the action prompt beside the cake, and the toast once the candles are out
  'bday.prompt': 'E — Blow out the candles 🎂',
  'bday.wish': 'Make a wish! 🎂',
  // the photo the game takes for her Album after the candles, and its toast
  'bday.photo': 'My birthday 2026',
  'bday.photoSaved': '📸 Saved to your Album!',
});

// ---- lines added on 2026-11-18, for a set that says them differently ---------
// With the family's words each of these says exactly what its caller wrote
// before (or nothing at all), so nothing moved on screen. They are a table of
// their own because PHRASE_IDS is the list the first snapshot recorded
// (series-words-on.json, "phrases") and that fixture is not re-recorded;
// these are recorded in series-words-on-later.json instead
// (test/serieswords.off.test.js). Same rules as above.
const LATER = Object.freeze({
  // what follows a cat's name on its Colony card: the rank words as they are
  'colony.rankAfterName': (rankWords) => rankWords,
  // a pick card's line for the group's badge, for a set that has badge words
  'pick.badge': (badgeWord) => `badge: ${badgeWord}`,
  // the small line under the Neighborhood's name for her first visits
  'place.townNote': 'the town',

  // ---- cat login, milestone 1 (2026-11-22): the same in every set ----
  // shown while a loaded cat's key is adopted and the page reloads once
  'catlogin.bringing': (name) => (name ? `Bringing ${name} here…` : 'Bringing your cat here…'),
  // ---- cat login, milestone 2: how a linked cat's catch-up reads on the sheet ----
  'catlogin.saved': (name) => `${name || 'Your cat'} is safe`,
  'catlogin.offline': (name) => `No internet. ${name || 'Your cat'} is safe on this device. It will catch up later.`,
  'catlogin.catching': 'Catching up…',
  // the one line that differs by set: where the things come to
  'catlogin.caughtup': (name) => `${name || 'Your cat'} caught up. Paws, finds and outfits from both devices are in camp.`,
  'catlogin.signedout': (name) => `This cat moved to a new cat code. Type the new one to bring ${name || 'your cat'} back.`,

  // ---- cat login, milestone 3: the My cat sheet and changing the code (the same in every set) ----
  'catlogin.err.changed': 'That didn’t work, so nothing was changed. Your old cat code is still the one to use.',
  'catlogin.err.busy': 'The cloud is busy right now. Try again in a little while.',
  'catlogin.err.notready': 'Changing the cat code is not ready yet. Your cat is still safe.',
  'catlogin.err.offline': 'Connect to the internet and try again.',
  'catlogin.err.nocode': 'That cat code didn’t work. Check the words and try again.',

  // ---- world map step 3 (2026-11-21): what a gate says, the same in every set ----
  'gate.shut': (walks, place, toGo) => `Opens after ${walks} ${walks === 1 ? 'walk' : 'walks'} in ${place}. ${toGo} to go!`,
  'gate.short': (need) => `You need ${need} more 🐾. Keep exploring!`,
  'gate.buyPrompt': (name, price) => `E — Open ${name} for ${price} 🐾?`,
  'gate.keep': 'You keep everything you found.',
  'gate.off': (place) => `Off to ${place}!`,
  // a room guest's prompt at a gate her host may open (she reads, never chooses)
  'gate.thisWay': (name) => `${name} is this way 🧭`,
  // a room's host whose friend's game could not get the place ready (Task 9)
  'gate.friendNotReady': (name) => `${name}'s game isn't ready for that place yet. Try again in a moment! 🐾`,

  // ---- Appletree Farm (2026-11-18): its own words, the same in every set -----
  // The animals' one-time lines (they were spelled in game/walk.js).
  'farm.toast.ride': 'You are riding a cow! 🐄',
  'farm.toast.goatPlay': 'The goat wants to play! 🐐',
  'farm.toast.goatCopy': 'The goat jumps when you jump! 🐐',
  'farm.toast.dogWalk': 'The sheepdog wants to walk with you 🐶',
  'farm.toast.chicksFollow': 'The chicks follow you when you walk 🐤',
  'farm.toast.ducklingsFollow': 'The ducklings swim after you! 🐥',
  // Job 1: round up the chicks.
  'farm.chicks.prompt': 'E — help the hen find her chicks',
  'farm.chicks.start': 'Cluck! The hen has lost her four chicks. Can you find them? 🐤',
  'farm.chicks.found': 'Peep! A chick is following you. Walk it back to the hen coop. 🐤',
  'farm.chicks.home': (n, total) => `A chick hops into the coop! ${n} of ${total} 🐤`,
  'farm.chicks.goal': (n, total) => `Walk the chicks home: ${n} of ${total} 🐤`,
  'farm.chicks.done': 'All four chicks are home. The hen is so happy! 🐔',
  // Job 2: bring the cow in.
  'farm.cow.prompt': 'E — bring the cow in for milking',
  'farm.cow.start': 'Moo! Walk ahead of the cow and she will follow you to the milking shed. 🐄',
  'farm.cow.goal': 'Lead the cow to the milking shed 🐄',
  'farm.cow.milk': 'The cow is at the milking shed. There is a saucer of milk for you! 🥛',
  'farm.cow.milkGoal': 'Lap up your saucer of milk 🥛',
  'farm.cow.milkPrompt': 'E — lap up the milk',
  'farm.cow.done': 'You brought the cow in. Fresh milk, yum! 🥛',
  // Job 3: catch the goat.
  'farm.goat.prompt': 'E — get the farmer’s hat back from the goat',
  'farm.goat.start': 'The goat has the farmer’s straw hat! Catch up with it. 🐐',
  'farm.goat.goal': 'Catch the goat with the hat 🐐',
  'farm.goat.skip': 'Maa! The goat skips away. It gets slower every time. 🐐',
  'farm.goat.drop': 'Maa! The goat drops the hat. Pick it up! 👒',
  'farm.goat.pickGoal': 'Pick up the straw hat 👒',
  'farm.goat.carryGoal': 'Carry the hat to the farmhouse door 👒',
  'farm.goat.pickPrompt': 'E — pick up the straw hat',
  'farm.goat.putPrompt': 'E — put the straw hat down',
  'farm.goat.doorPrompt': 'E — leave the hat at the farmhouse door',
  'farm.goat.done': 'The farmer has the straw hat back. Good catch! 👒',
  'farm.hat.name': 'straw hat',
  // Job 4: barn mouser.
  'farm.mice.prompt': 'E — chase the mice out of the grain store',
  'farm.mice.start': 'Squeak! Five mice are after the grain. Walk up to each one and it will run home. 🐭',
  'farm.mice.goal': (n, total) => `Send the mice home: ${n} of ${total} 🐭`,
  'farm.mice.done': 'All the mice ran home through their hole. The grain is safe! 🌾',
  // The six things to find: the first time ever, and every time after.
  'farm.find.loftcats.first': 'You found a barn cat and her kittens in the hayloft! 🐱',
  'farm.find.loftcats.again': 'The barn cat purrs. Her kittens look up at you. 🐱',
  'farm.find.eggs.first': 'You found a nest of eggs behind the tractor! 🥚',
  'farm.find.eggs.again': 'The eggs are safe and warm in their nest. 🥚',
  'farm.find.owl.first': 'You found an owl asleep on the barn beam! 🦉',
  'farm.find.owl.again': 'The owl is fast asleep on its beam. 🦉',
  'farm.find.owl.peek': 'The owl opens one eye… and goes back to sleep. 🦉',
  'farm.find.scarecrow.first': 'You found a hat to try on: the scarecrow’s! 👒',
  'farm.find.scarecrow.prompt': 'E — try on the scarecrow’s hat',
  'farm.find.scarecrow.on': 'You are wearing the scarecrow’s hat! You can keep it on until you go home. 👒',
  'farm.find.scarecrow.backPrompt': 'E — give the scarecrow his hat back',
  'farm.find.scarecrow.off': 'The scarecrow has his hat back. 👒',
  'farm.find.apples.first': 'You found out how to make apples drop: climb the tree! 🍎',
  'farm.find.apples.again': 'Thud! An apple drops. Walk into it to bat it along. 🍎',
  'farm.find.ducklings.first': 'You found ducklings that swim along behind you! 🐥',
  // The journal's pages for the jobs and the finds: the name, and the hint
  // shown until the page is filled.
  'farm.page.chicks.name': 'Chicks Rounded Up',
  'farm.page.chicks.hint': 'A hen at the farm needs help.',
  'farm.page.cow.name': 'Cow Brought In',
  'farm.page.cow.hint': 'Visit the cows’ gate at the farm.',
  'farm.page.goat.name': 'Hat Won Back',
  'farm.page.goat.hint': 'A goat at the farm has taken something.',
  'farm.page.mice.name': 'Grain Kept Safe',
  'farm.page.mice.hint': 'Sniff around the grain store at the farm.',
  'farm.page.loftcats.name': 'Barn Cat Family',
  'farm.page.loftcats.hint': 'Who is purring up in the big red barn?',
  'farm.page.eggs.name': 'Hidden Eggs',
  'farm.page.eggs.hint': 'Something is hidden near the tractor.',
  'farm.page.owl.name': 'Sleepy Owl',
  'farm.page.owl.hint': 'Who sleeps under the barn roof all day?',
  'farm.page.scarecrow.name': 'Scarecrow’s Hat',
  'farm.page.scarecrow.hint': 'Visit the scarecrow in the wheat field.',
  'farm.page.apples.name': 'Falling Apples',
  'farm.page.apples.hint': 'What happens up an apple tree?',
  'farm.page.ducklings.name': 'Duckling Parade',
  'farm.page.ducklings.hint': 'Go for a swim in the farm pond.',

  // ---- away fights with a group's roaming cats (2026-11-19) -------------------
  // The same in every set. The offer, the win and the loss say the border
  // patrol's lines ('fight.border...').
  'away.pass': (name) => `${name} looks at you, then lets you walk on. 🐾`,
  'away.wary': (name) => `${name} backs away from you. 🐾`,
  'away.chasedOff': (who) => `${who} chased you off! 🐾`,
  // ---- The Fairground (2026-11-18): its own words, the same in every set -----
  // The first time ever on each ride (game/fairplay.js).
  'fair.toast.mgr': 'You are on the merry-go-round! Jump again to hop up onto a horse. 🎠',
  'fair.toast.wheel': 'Up you go on the big wheel! 🎡',
  'fair.toast.cups': 'Whee! You are spinning in a teacup! ☕',
  'fair.toast.slide': 'Wheee! Down the helter-skelter you go! 🌀',
  'fair.toast.coaster': 'All aboard the caterpillar coaster! 🐛',
  // The journal's pages for the five rides.
  'fair.page.mgr.name': 'Merry-Go-Round Rider',
  'fair.page.mgr.hint': 'Hop onto the merry-go-round at the fair.',
  'fair.page.wheel.name': 'Big Wheel Rider',
  'fair.page.wheel.hint': 'Hop into a seat on the big wheel at the fair.',
  'fair.page.cups.name': 'Teacup Spinner',
  'fair.page.cups.hint': 'Hop into a teacup at the fair.',
  'fair.page.slide.name': 'Helter-Skelter Slider',
  'fair.page.slide.hint': 'Climb the stripy tower at the fair, then jump!',
  'fair.page.coaster.name': 'Coaster Rider',
  'fair.page.coaster.hint': 'Hop into the caterpillar train at the fair.',
  // The three midway games (src/fairgames.js; game/fairplay.js). No game can
  // be lost: a miss only ever says how to do better.
  'fair.cans.prompt': 'E — play Tin Can Alley',
  'fair.cans.again': 'E — play Tin Can Alley again',
  'fair.cans.start': 'Hop up onto the counter, then bat the tins down! 🥫',
  'fair.cans.batPrompt': 'E — bat the tins',
  'fair.cans.hit': (n) => (n === 1 ? 'Clatter! One tin to go 🥫' : `Clatter! ${n} tins to go 🥫`),
  'fair.cans.first': 'All six tins down! You won a Paper Crown to wear! 👑',
  'fair.cans.won': 'All six tins down! You win! 🥫',
  'fair.ducks.prompt': 'E — play Hook a Duck',
  'fair.ducks.again': 'E — play Hook a Duck again',
  'fair.ducks.start': 'Wade in, pick up a duck and carry it out of the pool. Is there a star underneath? 🦆',
  'fair.ducks.pickPrompt': 'E — pick up the duck',
  'fair.ducks.plain': 'No star under this one. Back it swims. Try another duck! 🦆',
  'fair.ducks.first': 'A star under the duck! You won a Prize Rosette to wear! ⭐',
  'fair.ducks.won': 'A star under the duck! You win! ⭐',
  'fair.bell.prompt': 'E — play Ring the Bell',
  'fair.bell.again': 'E — play Ring the Bell again',
  'fair.bell.start': 'Take a run-up, then pounce on the red pad! 🔔',
  'fair.bell.low': 'Not quite to the top. Take a longer run-up and pounce again! 🔔',
  'fair.bell.close': 'So close! A little more run-up and pounce again! 🔔',
  'fair.bell.first': 'DING! You rang the bell and won a Tail Balloon to wear! 🎈',
  'fair.bell.won': 'DING! You rang the bell! You win! 🔔',
  'fair.game.again': 'You won again! 🎉',
  'fair.prize.wear': 'Your prize is waiting in the dress-up at home. 🎁',
  'fair.prize.locked': 'A prize to win at the Fairground',
  // The six things to find: the first time ever, and on any later walk.
  'fair.find.fortune.first': 'The crystal ball shows... you! 🔮',
  'fair.find.fortune.again': 'There you are in the crystal ball again. 🔮',
  'fair.find.musicbox.first': 'You found the music box that plays the merry-go-round’s tune! 🎶',
  'fair.find.musicbox.again': 'The music box is still turning. 🎶',
  'fair.find.candyfloss.first': 'A wisp of candyfloss is stuck to your whiskers! 🍭',
  'fair.find.candyfloss.again': 'Candyfloss on your whiskers again! 🍭',
  'fair.find.juggler.first': 'Oops! The juggler dropped a ball. Bat it about! 🤹',
  'fair.find.juggler.again': 'Oops! The juggler dropped a ball again. 🤹',
  'fair.find.balloon.first': 'You caught the runaway balloon! Pff... it left you its ribbon. 🎈',
  'fair.find.balloon.again': 'You caught the runaway balloon again! 🎈',
  'fair.find.lookout.first': 'You found the lookout at the top of the big wheel! You can see the whole fair. 🎡',
  'fair.find.lookout.again': 'Back up on the lookout! 🎡',
  'fair.visitor.hello': 'A visitor says hello to you! 👋',
  // The journal's pages for the three games and the six finds.
  'fair.page.cans.name': 'Tin Can Champion',
  'fair.page.cans.hint': 'Play Tin Can Alley on the midway at the fair.',
  'fair.page.ducks.name': 'Lucky Duck',
  'fair.page.ducks.hint': 'Wade into the duck pool at the fair.',
  'fair.page.bell.name': 'Bell Ringer',
  'fair.page.bell.hint': 'Pounce on the red pad by the tall board at the fair.',
  'fair.page.fortune.name': 'Crystal Ball',
  'fair.page.fortune.hint': 'Look in the starry tent at the fair.',
  'fair.page.musicbox.name': 'Music Box',
  'fair.page.musicbox.hint': 'Go round the back of the merry-go-round.',
  'fair.page.candyfloss.name': 'Candyfloss Whiskers',
  'fair.page.candyfloss.hint': 'Sniff around the pink stall at the fair.',
  'fair.page.juggler.name': 'The Juggler',
  'fair.page.juggler.hint': 'Someone practises behind the tents at the fair.',
  'fair.page.balloon.name': 'Runaway Balloon',
  'fair.page.balloon.hint': 'Something bobs about in the open field at the fair.',
  'fair.page.lookout.name': 'Top of the Big Wheel',
  'fair.page.lookout.hint': 'Ride the big wheel to the very top, then jump.',
  // ---- the River's west strip (bigger areas, 2026-11-19; only seen with the
  // ?grow=1 switch on): its own words, the same in every set ------------------
  'river.west.lookout': 'fallen willow lookout',
  'river.west.scenic': 'the fallen willow by the still pool',
  'river.west.feather': 'a grey heron feather on the fallen willow',
  'river.west.snail': 'a snail shell in the tall reeds',
  'river.west.wing': 'a blue dragonfly wing by the river',
  'river.west.pebble': 'a round white pebble at the far bank',
  // ---- the River's south strip (bigger areas, 2026-11-19; only seen with the
  // ?grow=1 switch on): its own words, the same in every set ------------------
  'river.south.lookout': 'sand bank lookout',
  'river.south.scenic': 'the sandy bank where the martins nest',
  'river.south.eggshell': 'a tiny white eggshell on the sand bank',
  'river.south.feather': 'a soft owl feather in the far corner',
  'river.south.clock': 'a fluffy dandelion clock in the meadow',
  'river.south.pebble': 'a striped pebble on the sandy shore',
  // ---- the Woods' south strip (bigger areas, 2026-11-19; only seen with the
  // ?grow=1 switch on). The everyday set says the hollow its own way
  // (offclanwords.js, its Woods south block); the rest is the same in every set
  'woods.south.lookout': 'old stump lookout',
  'woods.south.scenic': 'the training hollow',
  'woods.south.seed': 'a sycamore seed with paper wings',
  'woods.south.pebble': 'a speckled pebble from the spring',
  'woods.south.fur': 'a soft tuft of rabbit fur in the bluebells',
  'woods.south.nut': 'a hazelnut a squirrel forgot',
  // ---- the Pines' north and west strips (bigger areas, 2026-11-19; only seen
  // with the ?grow=1 switch on): their own words, the same in every set -------
  'pines.north.lookout': 'great pine roots',
  'pines.north.scenic': 'the great pine, oldest in the forest',
  'pines.north.jay': "a blue jay feather in the great pine's roots",
  'pines.north.nuts': "a squirrel's hidden pile of pine nuts",
  'pines.north.woodpecker': "a woodpecker's red-tipped feather",
  'pines.north.stone': 'a smooth black stone from the mire',
  'pines.west.stump': 'old mossy stump',
  'pines.west.scenic': 'the toadstool ring by the bog pool',
  'pines.west.snail': 'a tiny snail shell inside the toadstool ring',
  'pines.west.myrtle': 'a sprig of sweet-smelling bog myrtle',
  'pines.west.pebble': 'a frog-green pebble by the far bog',
  'pines.west.wren': 'a soft brown wren feather',
  // ---- the Moor's north strip (bigger areas, 2026-11-19; only seen with the
  // ?grow=1 switch on): its own words, the same in every set ------------------
  'moor.north.lookout': 'stone table lookout',
  'moor.north.scenic': 'the standing stones on the moor top',
  'moor.north.wool': 'a tuft of sheep\'s wool on the stone table',
  'moor.north.beetle': 'a shiny green beetle by the tarn',
  'moor.north.bilberry': 'a sprig of bilberries by the far wall',
  'moor.north.feather': 'a speckled grouse feather in the heather',
  // ---- found outfits (2026-11-19) ----
  // One find-only outfit hidden on every walk (src/foundwear/): each one's
  // name, the card when one is found, a partner's share, the coin pouch when
  // it is already owned, and its line in the dress-up and the Journal.
  'wear.acorncap.name': 'Acorn Cap',
  'wear.paperboycap.name': 'Paperboy Cap',
  'wear.buckethat.name': 'Bucket Hat',
  'wear.sailorcap.name': 'Sailor Cap',
  'wear.strawhat.name': 'Straw Hat',
  'wear.stripedboater.name': 'Striped Boater',
  'wear.starfishclip.name': 'Starfish Clip',
  'wear.featherplume.name': 'Feather Plume',
  'wear.heartglasses.name': 'Heart-shaped Glasses',
  'wear.daisychain.name': 'Daisy Chain',
  'wear.gardenglovescarf.name': 'Garden Glove Scarf',
  'wear.shellnecklace.name': 'Sailor’s Shell Necklace',
  'wear.neckerchief.name': 'Gingham Neckerchief',
  'wear.ticketgarland.name': 'Ticket-stub Garland',
  'wear.bottletopcollar.name': 'Bottle-top Collar',
  'wear.ropecollar.name': 'Rope Collar',
  'wear.anchorcharm.name': 'Anchor Charm',
  'wear.doormatcape.name': 'Doormat Cape',
  'wear.beachtowelcape.name': 'Beach-towel Cape',
  'wear.fishermansjumper.name': 'Fisherman’s Jumper',
  'wear.kitetailribbon.name': 'Kite-tail Ribbon',
  'wear.haybalepack.name': 'Hay-bale Backpack',
  'wear.candyflosspuff.name': 'Candyfloss Puff',
  'wear.puddlewellies.name': 'Puddle Wellies',
  // ---- the birthday (2026-11-21): the gift outfits and the home party ----
  // The four outfits only a gift code gives (src/foundwear/gifts.js).
  'wear.partyhat.name': 'Party Hat',
  'wear.bdayrosette.name': 'Birthday Rosette',
  'wear.bdayballoon.name': 'Birthday Balloon',
  'wear.cakecharm.name': 'Cake Charm',
  'wear.birthdayhat.name': 'Birthday Hat',
  // the birthday kitten the present holds: "Ribbon" and the kit word of the set in use
  'cat.ribbonkit.name': () => `Ribbon${words().RANK_SUFFIX.kit}`,
  // the line when the present is opened
  'present.label': 'A present for you! Tap to open it',
  'present.opened': (name) => `${name} is yours! 🎀`,
  // the home screen's banner while the birthday is on; the name is her cat's
  'party.banner': (catName) => `Happy birthday, ${catName}! 🎂`,
  // the line with the brother's code's confetti
  'party.time': 'Party time! 🎉',
  'wear.card.title': 'You found something to wear! ✨',
  'wear.card.kept': 'It’s in the dress-up at home now, for good.',
  'wear.card.wear': 'Wear it',
  'wear.card.later': 'Later',
  'wear.card.henNo': (catName) => `${catName} can’t wear this one, but your other cats can.`,
  'wear.partner.found': (partnerName, thing) => `${partnerName} found it, and there was one for you too: ${thing}! It’s in the dress-up at home. 🎁`,
  'wear.pouch.found': 'You found a little pouch of 🐾!',
  'wear.pouch.partner': (partnerName) => `${partnerName} found it, and there was a little pouch of 🐾 for you too!`,
  'wear.foundIn': (place) => `Found in ${place}`,
  'wear.notYet': 'Not found yet',
  // Dress up's "Remove all accessories", and the cat builder's slots 4 and 5.
  'wear.removeAll': 'Remove all accessories',
  'slots.buy': (price) => `2 more cat slots — ${price}`,
  'slots.buyLabel': (price) => `Unlock 2 more cat slots for ${price} paw points`,
  'slots.save': (price) => `Save up ${price}`,
  'slots.saveEnd': 'to unlock them',
  'slots.name': '2 more cat slots',
  'slots.full': (n) => `${n} of ${n} — change one of yours for a new look`,
  'wear.journal.title': 'Things to wear',

  // ---- Menu review #7 (2026-11-20) ----------------------------------------------
  // the Menu's tile and the sheet's heading for the player's own group of cats
  'menu.myCats': () => `My ${groupWord()}`,
  // the Menu's tile for the cat login sheet (save / load my cat on any device)
  'menu.myCat': 'My cat',
  // the Journal's quiet line where the stray friends used to be; reads the tile's phrase when called
  'journal.friendsMoved': () => `Your cat friends are in ${phrase('menu.myCats')} now ›`,

  // ---- the My cats sheet, in plain words for the everyday game (follow-up 2026-11-20) ----
  // Each line's family text is exactly what the sheet always said.
  'mycats.empty': 'No colony cats yet — touch noses with a stray, then feed it 🐟',
  'mycats.notSetUp': "Colony sharing isn't switched on yet",
  'mycats.offline': "Can't reach the colony right now — your cats are safe on this device",
  'mycats.alreadyPaired': 'This player is already sharing a colony.',
  'mycats.needsName': 'To share your colony, you need a friend name first.',
  // follows the friend's name, which the sheet puts in bold before it
  'mycats.wantsToShare': 'wants to share your colony. Is that them?',
  'mycats.offer': '🐈 Share your colony with your brother or sister',
  // the toast when a pairing completes, and the news card's line when there is no partner name
  'mycats.nowSharing': (name) => `You're sharing a colony with ${name}! 🐾`,
  'mycats.newsSub': "What's new in your colony",
  'mycats.full': (cap) => `The colony is full — ${cap} cats call it home 🏠`,
  'mycats.fullRoom': (max) => ` Share it with your brother or sister to make room for ${max}.`,
  // the change card's ask on a desktop; a touch screen keeps 'pick.changeAsk'
  'pick.changeAskClick': () => `Click a ${groupWord()} to join it.`,
  // above the friend-name box when My cats sent her there; save is
  // "tap Save" or "click Save" (walkingname.js picks it by the touch flag)
  'mycats.nameIntro': (save) => `You need a friend name before you can share your colony. Type one here and ${save}:`,

  // ---- getting a place ready (2026-11-20): a place's code loads the first time, the same in every set ----
  'start.gettingReady': 'Getting ready…',
  'start.notReady': 'That place isn’t quite ready yet. Try again in a moment! 🐾',
  'start.notReadyOffline': 'That place needs the internet the first time. Try again when you’re online! 🐾',
  'start.notReadyReload': 'Still not ready. Tap Explore once more and the game starts fresh. Everything you found is saved. 🐾',
  // ---- Rooftops step 4 (2026-11-21) ----
  'critter.pigeon': 'a cooing pigeon',
  // the name painted on a gate's board (world/gateway.js, an end with `sign`):
  // the place's shown name without a leading "The ", so 'The Rooftops' -> 'Rooftops'
  'gate.sign': (place) => String(place ?? '').replace(/^the\s+/i, ''),
  // ---- the Old House step 2 (2026-11-21): its special places and where the yarn ball lies ----
  'house.scenic.clock': 'the grandfather clock',
  'house.scenic.fireside': 'the fireside',
  'house.scenic.attic-window': 'the round attic window',
  'house.yarn.hall': 'on the hall runner',
  'house.yarn.kitchen': 'by the kitchen table',
  // ---- the Old House step 2 (2026-11-21): its six discoveries, each paid once a walk ----
  'house.find.clock': (n) => `The old clock bongs ${n} ${n === 1 ? 'time' : 'times'}! 🕰️`,
  'house.find.piano': 'You played a tune on the old piano! 🎵',
  'house.find.window': 'What a view over the rooftops from the round window!',
  'house.find.bookcase': 'The bookcase swings open… a secret stair! 🗝️',
  'house.find.cushion': 'A cat-shaped dent in the cushion… someone else naps here too 💤',
  'house.find.toys': 'A box of old toys! A wooden mouse rolls out 🧸',
  // ---- Rooftops step 5 (2026-11-21) ----
  'roofs.page.garden.name': 'Rooftop Garden',
  'roofs.page.garden.hint': 'High up, someone grows tomatoes.',
  'roofs.page.loft.name': 'Pigeon Loft',
  'roofs.page.loft.hint': 'Where do the pigeons go home at night?',
  'roofs.page.vane.name': 'Top of the Clock Tower',
  'roofs.page.vane.hint': 'Climb as high as a cat can go.',
  'roofs.page.skylight.name': 'The Attic Window',
  'roofs.page.skylight.hint': 'One roof has a warm, glowing window in it.',
  'roofs.page.telescope.name': 'The Telescope',
  'roofs.page.telescope.hint': 'Someone looks at the sky from a roof.',
  'roofs.page.chimney.name': 'Warm Chimney',
  'roofs.page.chimney.hint': 'Find a warm spot up high and sit a while.',
  'roofs.find.garden': 'A garden on the roof! Tomatoes and twinkly lights. 🍅',
  'roofs.find.loft': 'The pigeon loft! Coo, coo. One pigeon wants to come with you. 🕊️',
  'roofs.find.vane': 'The very top! You can see the whole town. 🌇',
  'roofs.find.skylight': 'A peek in the attic window. Someone is reading a bedtime story. 📖',
  'roofs.find.telescope': 'You look through the telescope. Hello, moon! 🌕',
  'roofs.find.chimney': 'A warm chimney! Puff, a smoke ring. What a cosy spot. 💨',

  // ---- the Market Square (2026-11-20): its own words, the same in every set ----
  'market.treat.fishhead': 'a fish head',
  'market.treat.sausageroll': 'a sausage roll',
  'market.treat.cheddar': 'a nibble of cheddar',
  'market.treat.cream': 'a saucer of cream',
  'market.treat.crumbs': 'some crumbs',
  'market.treat.wool': 'a ball of wool',
  'market.treat.sausages': 'a string of sausages',
  'market.treat.catnip': 'a sprig of catnip',
  'market.treat.sardines': 'a tin of sardines',
  'market.grab.fishhead': 'E — grab the fish head',
  'market.grab.sausageroll': 'E — grab the sausage roll',
  'market.grab.cheddar': 'E — grab the cheddar',
  'market.grab.cream': 'E — lap up the cream',
  'market.grab.crumbs': 'E — grab the crumbs',
  'market.grab.wool': 'E — grab the wool',
  'market.grab.sausages': 'E — grab the sausages',
  'market.grab.catnip': 'E — nibble the catnip',
  'market.grab.sardines': 'E — snaffle the sardines',
  'market.eat.first': (treat) => `Yum! You grabbed ${treat}! 😋`,
  'market.eat.again': (treat) => `Yum, ${treat} again! 😋`,
  'market.shoo': 'Oi, you rascal! 🧹',
  'market.laugh': 'Ha! You cheeky thing! 😄',
  'market.coo': 'Aww, look at you! 💕',
  'market.team.eater': (partner) => `Teamwork! ${partner} kept them busy 🐾`,
  'market.team.distracter': (partner) => `Teamwork! You kept them busy while ${partner} grabbed a treat 🐾`,
  'market.summary.treats': 'treats',

  // ---- the Market Square, steps 3 and 4 (2026-11-21) ----
  'market.page.fountain.name': 'The Market Fountain',
  'market.page.fountain.hint': 'Where can a thirsty cat get a drink in the square?',
  'market.page.pigeons.name': 'Pigeon Scatter',
  'market.page.pigeons.hint': 'Some birds in the square peck at crumbs.',
  'market.page.sacks.name': 'Warm Flour Sacks',
  'market.page.sacks.hint': "The baker's sacks look soft and warm.",
  'market.page.musician.name': 'The Street Musician',
  'market.page.musician.hint': 'Somebody in the square plays a happy tune.',
  'market.page.basket.name': 'Bicycle Basket',
  'market.page.basket.hint': 'A bicycle is parked by the shops. Is there room for a cat?',
  'market.page.apples.name': 'Rolling Apples',
  'market.page.apples.hint': 'What happens if a cat paws the apple crate?',
  'market.find.fountain': 'A cool drink from the fountain. Splish! 💧',
  'market.find.pigeons': 'Whoosh! The pigeons flap off in a flurry. 🕊️',
  'market.find.sacks': 'A nap on warm flour sacks. Soft and toasty. 😴',
  'market.find.musician': (people) => `Music! One of the ${people} plays a fiddle just for you. 🎻`,
  'market.find.basket': 'A bicycle basket! It rocks, and the bell goes ding ding! 🚲',
  'market.find.apples': 'Oops! Apples everywhere, rolling over the cobbles. 🍎',
  // the four treat stalls' awnings, lookouts she perches on (world/marketplan.js)
  'market.perch.fish': 'the fish stall’s awning',
  'market.perch.baker': 'the baker’s awning',
  'market.perch.cheese': 'the cheese stall’s awning',
  'market.perch.milk': 'the milk cart’s awning',
  'market.perch.toys': 'the toy stall’s awning',
  'market.perch.plants': 'the plant stall’s awning',
  'market.perch.bric': 'the trinket stall’s awning',
  'market.perch.butcher': 'the butcher’s awning',
  // the four found outfits hidden in the square (src/foundwear/): placeholder
  // names the owner and his daughter will rename, the same in every set
  'wear.tradercap.name': 'Market Trader’s Cap',
  'wear.stringbagscarf.name': 'Shopping-Bag Scarf',
  'wear.applecharm.name': 'Apple Charm',
  'wear.flowerbasket.name': 'Flower Basket',
  // Lighthouse Point's found outfit (a placeholder name the owner and his daughter will pick, the same in every set)
  'wear.keepercap.name': 'Keeper’s Cap',
  // The Greenhouse's found outfit (a placeholder name the owner and his daughter will pick, the same in every set)
  'wear.gardenerhat.name': 'Gardener’s Hat',
  // The Moon's found cape (the Clan words' Silverpelt Cape is a milestone-later flavour: this name is the same in every set)
  'wear.starlightcape.name': 'Starlight Cape',
  // The Reef's found collar (a placeholder name the owner and his daughter will pick, the same in every set)
  'wear.pearlcollar.name': 'Pearl Collar',
  // Lighthouse Point's journal pages (src/lighthousepages.js): drawn before the place is ever walked, so they are
  // here; its other lines are in the place's lazy file (src/world/lighthousewords.js)
  'lighthouse.page.lamproom.name': 'The Lamp Room',
  'lighthouse.page.lamproom.hint': 'The top of the tower glows when you get there.',
  'lighthouse.page.pool.name': 'Rock Pool Peek',
  'lighthouse.page.pool.hint': 'Sit very still at a rock pool. Who lives there?',
  'lighthouse.page.gull.name': 'A Gull Friend',
  'lighthouse.page.gull.hint': 'Gulls like a quiet cat on a high place.',
  'lighthouse.page.echo.name': 'The Echo Cave',
  'lighthouse.page.echo.hint': 'What happens if you call into the cave?',
  'lighthouse.page.bell.name': 'The Fog Bell',
  'lighthouse.page.bell.hint': 'The old bell by the cottage has a long rope.',
  'lighthouse.page.window.name': 'The Lit Window',
  'lighthouse.page.window.hint': 'Someone left a light on in the cottage.',
  'lighthouse.page.kitten.name': 'The Lost Kitten',
  'lighthouse.page.kitten.hint': 'The cat at the cottage door is missing her little one.',
  'lighthouse.page.lamp.name': 'The Great Lamp',
  'lighthouse.page.lamp.hint': 'The lamp at the top of the tower is dark.',
});

// Every id of the first table, in table order.
export const PHRASE_IDS = Object.freeze(Object.keys(TABLE));
// Every id added later, in table order.
// Lines a lazy chunk brings with it (the My cat sheet, src/ui/catloginwords.js): added when that
// chunk arrives, so their words are not in the start-up download. They go through phrase() like
// the rest, so a set's own PHRASES still overrides them.
const ADDED = {};
export function addPhrases(table) { Object.assign(ADDED, table); }

export const LATER_PHRASE_IDS = Object.freeze(Object.keys(LATER));

export function hasPhrase(id) {
  return typeof id === 'string' && (Object.hasOwn(TABLE, id) || Object.hasOwn(LATER, id) || Object.hasOwn(ADDED, id));
}

// phrase(id, ...args) → the text. An unknown id throws: every id is a literal
// in src/, and test/clanphrases.test.js checks each one against the table, so
// this is a typo caught by the tests, never something a walk can reach.
export function phrase(id, ...args) {
  if (!hasPhrase(id)) throw new Error(`Whisker Walk: no phrase "${id}"`);
  const own = words().PHRASES;
  const entry = own && Object.hasOwn(own, id) ? own[id] : Object.hasOwn(TABLE, id) ? TABLE[id] : Object.hasOwn(LATER, id) ? LATER[id] : ADDED[id];
  return typeof entry === 'function' ? entry(...args) : entry;
}
