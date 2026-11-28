// THE STORY CARDS' WORDS: every line of every "story so far" card, in ONE table (STORY_TEXT) so the owner can edit them in one place.
// A lazy file (loaded with ui/storycard.js when a walk in a place with a story starts), never in the start-up download.
// Each place has a title and chapters; a chapter is two to four short lines. {n} {total} {songs} {rub} are filled in by storycard.js
// from the save (shells brought, cells in, jobs done...). The card names only what the child can do NEXT (plus the plain goal): no spoilers
// beyond the next step. The lines say what the code does (checked by test/storycards.test.js against the mission files' names).
// Both word sets read the same lines; the Clan set may differ per line: CLAN_LINES below holds only the lines that do (a line there takes
// the place of the same chapter's). No series word is in the everyday set: the everyday lines are the plain base.
import { seriesMode, SERIES_ON } from '../wordset.js';

export const STORY_TEXT = Object.freeze({
  moon: {
    title: 'Pip on the Moon',
    ch: {
      asleep: ['A little robot named Pip is asleep by the lander.', 'Wake him, then find two power cells and take them to the dome.', 'When the base wakes up, you can send a postcard to Earth!'],
      power: ['Pip is awake, but the base has no power yet.', 'Find two power cells ({n} of 2 are in): one on the tall rocks, one at the far beacon.', 'Take each one to the Core in the dome.'],
      bothin: ['Both power cells are in!', 'Go to the dome and watch the base wake up.'],
      awake: ['The base is awake! Now let us find Earth.', 'Climb Star Hill and use the telescope. Join the stars: the Mouse, then the Cat.', 'Then the big dish turns to Earth.'],
      earth: ['Earth is found!', 'Write a postcard at the Message Desk in the dome.', 'Then post it in the rocket.'],
      loaded: ['Your postcard is in the rocket.', 'Press the big red button at the launch desk to send it!'],
      sent: ['Your postcard is on its way to Earth!', 'Wait on Earthrise Rock. Earth will answer.'],
      done: ['Earth answered your postcard! The story is done.', 'Pip has an errand for you each walk.'],
      cave: ['A glowing cell waits deep in the cave. The dome can use it.'],
      relay: ['Faint beeps come from the relay station. Can you fix it?'],
    },
  },
  reef: {
    title: 'Marlo and the Reef',
    ch: {
      unmet: ['A shy little crab named Marlo needs a new shell.', 'Say hello to him on the sand by the ladder.'],
      shells: ['Marlo’s old shell is cracked. He needs a new one!', 'Find three shells for him ({n} of 3 so far): in the Kelp Garden, up on the coral ledge, and in a little cave.', 'Hold the kick button to float up high.'],
      tryon: ['Marlo has his last shell and is trying it on.', 'Wait a moment and watch!'],
      lanterns: ['It fits! Marlo has a new shell.', 'Now light up the coral: touch the three lantern corals, one after another.'],
      party: ['The coral is all lit up!', 'Start the housewarming with Marlo and watch the parade go by.'],
      done: ['Marlo’s housewarming was a hit!', 'He has an errand for you each walk.'],
      lab: ['Climb down the ring by the Sunken Boat to Tidewell Station. It needs fuses.'],
      wreck: ['An old sunken ship waits, with a treasure chest to find.'],
    },
  },
  crystal: {
    title: 'Lumi’s Glow',
    ch: {
      unmet: ['A baby glow-worm named Lumi has lost her glow.', 'Say hello to her near the entrance.'],
      stones: ['Lumi needs three spark stones: rose, sky blue and gold.', 'Carry each one to its great crystal ({n} of 3 are lit).', 'The rose one is in the Rose hall, the sky one is across the Blue Pool, the gold one is in the Gold Gallery.'],
      heart: ['All three crystals are lit and the passages glow!', 'Last, wake the Heart Crystal, far to the north-east, and watch the lights dance.'],
      done: ['Lumi has her glow back! The whole cave sparkles.', 'She has an errand for you each walk.'],
      forge: ['At the forge you can make a Crystal Circlet.'],
      songs: ['The singing stones will teach you three songs ({songs} of 3).'],
      deeplocked: ['A second story waits in the Echo Deep.', 'To open it, learn all three songs ({songs} of 3) and help Lumi with two errands ({rub} of 2).'],
      deepwall: ['The Echo Deep is open! A wall there hums a tiny tune.', 'Hum it back by stepping on the glowing stones in the same order.'],
      deepprism: ['The wall has slid open.', 'Turn each prism to match its gem, and a glowing door will open.'],
      deepfind: ['The glowing door is open! A little fluttering creature named Tink sleeps in a nest beyond it.', 'Find Tink and say hello.'],
      deephome: ['Tink is awake and follows you.', 'Walk him home to his hanging crystals above the Rose hall.'],
      deepdone: ['Tink is home and singing his little chimes!', 'He has errands for you each walk.'],
    },
  },
  jungle: {
    title: 'The Rain Supper',
    ch: {
      unmet: ['Mossy, an old tortoise, keeps the jungle lodge.', 'Say hello to her on the veranda.'],
      fruit: ['Mossy is planning a Rain Supper and needs three kinds of fruit.', 'Carry each one to the kitchen table on the veranda ({n} of 3 are there).', 'The mango grows in the grove, the bananas are across the log bridge, the cacao pod is on a low branch.'],
      set: ['All three fruits are on the table!', 'Go to the kitchen table and set it for supper.'],
      supper: ['The table is set and the lights are on.', 'Begin the Rain Supper at the table and enjoy the show!'],
      done: ['The Rain Supper was lovely! Mossy gave you a Rain Lily Charm.', 'She has an errand for you each walk, and you can share the supper again.'],
    },
  },
  snowville: {
    title: 'Lantern Night',
    ch: {
      unmet: ['A little snow hare named Tilly wants the village lanterns lit before Lantern Night.', 'Say hello to her.'],
      candles: ['Tilly wants three lanterns lit before Lantern Night.', 'Find a glint of candle, carry it to a lantern and light it ({n} of 3 are lit).', 'The lanterns are by the big fir, by the skating pond and at the foot of the sled hill.'],
      warm: ['All three lanterns are lit!', 'Now warm up by the village hearth, and the little lights along the lane come on.'],
      glow: ['The lights along the lane are twinkling.', 'Begin Lantern Night and watch the whole village glow!'],
      done: ['Lantern Night was beautiful! Tilly gave you a Snowflake Clasp.', 'She has an errand for you each walk, and you can watch the night again.'],
    },
  },
  treehouse: {
    title: 'Nutmeg’s Letters',
    ch: {
      unmet: ['Nutmeg, a red squirrel, is the postmistress of the treehouse village.', 'Say hello to her by the post box at the roots.'],
      letters: ['Nutmeg has three letters to deliver, and her basket is too heavy.', 'Carry each one up the tree ({n} of 3 are delivered).', 'They go to the Bakery, the Bookshop across the rope bridge and the Bell Tower at the top.'],
      bell: ['All three letters are delivered!', 'Climb to the Bell Tower and ring the bell.'],
      supper: ['Every window in the tree is glowing.', 'Begin the firefly supper and watch the lanterns light up.'],
      done: ['The firefly supper was magical! Nutmeg gave you an Acorn Locket.', 'She has an errand for you each walk, and you can light the supper again.'],
    },
  },
  greenhouse: {
    title: 'The Gardener’s Jobs',
    intro: ['A warm, quiet garden under glass. The gardener could use a helping paw.', 'Two jobs wait at the potting bench: find the seed packets, and water the pots with a little cloud over them.'],
    next: 'Next: {job}',
    count: '{n} of {total} jobs done.',
    jobs: {
      seeds: 'Five seed packets blew away. Find them, then sow them in the seed tray by the potting bench.',
      water: 'Some of the pots look thirsty. Take the watering can from by the potting bench and water every plant.',
    },
    all: ['Both of the gardener’s jobs are done!', 'Look around: butterflies, a pond and rooms to explore.'],
  },
  lighthouse: {
    title: 'Lighthouse Point',
    intro: ['A lighthouse by the sea, with a cottage at its foot. Two jobs are waiting.'],
    next: 'Next: {job}',
    count: '{n} of {total} jobs done.',
    jobs: {
      kitten: 'The cat at the cottage door is missing her little kitten. Follow the mews and bring it home.',
      lamp: 'The great lamp at the top of the tower is dark. Find the lever and light it for the ships.',
    },
    all: ['The kitten is home and the lamp is lit!', 'Look around: the shore, the pool and the tower are full of little finds.'],
  },
  farm: {
    title: 'Appletree Farm',
    intro: ['A busy farm with four small jobs. Nothing is ever caught or hurt.'],
    next: 'Next: {job}',
    count: '{n} of {total} jobs done.',
    jobs: {
      chicks: 'The hen has lost her four chicks. Find them all.',
      cow: 'Walk ahead of the cow and she will follow you to the milking shed.',
      goat: 'The goat has the farmer’s straw hat! Catch up with it.',
      mice: 'Five mice are after the grain. Walk up to each one and it will run home.',
    },
    all: ['All four farm jobs are done!', 'Look around: there are more things to find on the farm.'],
  },
  market: {
    title: 'Market Square',
    intro: ['A lively market with six little errands. There is no hurry.'],
    next: 'Next: {job}',
    count: '{n} of {total} errands done.',
    jobs: {
      mouse: 'A mouse is playing behind the cheese stall. Go near it and watch it dart about.',
      glove: 'Someone dropped a glove by the east bench. Carry it to the flower seller.',
      pigeons: 'Pigeons are sitting on the cafe tables. Send them up.',
      bell: 'When the bicycle bell rings, run to the three awnings as fast as you can.',
      stray: 'A thin cat sits behind the fish stall. Bring him the fish head.',
      fiddle: 'The fiddler plays a whole song for a cat who sits still nearby.',
    },
    all: ['All six errands are done!', 'The market is yours to explore.'],
  },
});

// The Clan set's own lines: a chapter here takes the place of the same chapter above. Only where the Clan set reads differently.
export const CLAN_LINES = Object.freeze({
  moon: { done: ['Earth answered your postcard, and Silverpelt shines beside it! The story is done.', 'Pip has an errand for you each walk.'] },
});

export const BUTTONS = Object.freeze({ ok: 'OK', openLabel: 'Story so far', footerKeys: 'Press E or Esc to close', footerPad: 'Press a button to close' });

// The lines of one chapter in the set in use. Read WHEN SHOWN (never kept), so a change of words shows at once.
export function chapterLines(place, key) {
  const own = seriesMode() === SERIES_ON ? CLAN_LINES[place]?.ch?.[key] ?? CLAN_LINES[place]?.[key] : null;
  return own ?? STORY_TEXT[place]?.ch?.[key] ?? [];
}
