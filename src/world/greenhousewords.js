// The Greenhouse's words (milestone 1). A lazy file: they join the phrase table (src/clanphrases.js, addPhrases) when
// the place's chunk arrives, so the start-up download does not carry them (the Lighthouse's way). Every line reads the
// same in both word sets: no series word is in any of them. test/greenhousewords.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { GREENHOUSE_HINTS } from '../greenhousepages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// The Clan set's light flavour: a line that takes it reads the set in use WHEN IT IS SAID, so the everyday set is the plain base.
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

// The journal's hints by page id (the unspotted cards read them through src/greenhousepages.js; milestone G2).
export const HINTS = Object.freeze({
  ghpalm: 'It is cool and drippy under the big leaves.',
  ghkoi: 'Sit very still by the pond. Who is down there?',
  ghcatnip: 'Something in the garden smells wonderful.',
  ghorchid: 'One orchid is shy. Wait beside it.',
  ghcactus: 'Prickly plants have a soft secret.',
  ghbutterfly: 'Butterflies like a cat who holds still.',
  ghjobseeds: 'The gardener’s seed packets blew away.',
  ghjobwater: 'Some of the pots look thirsty.',
});

export const LINES = Object.freeze({
  // the seed job: the gardener's lost packets, the count, the end, the seed tray's prompt and the sprouts
  'greenhouse.seed.offer': 'The gardener’s seed packets blew away! Five of them are lying about. 🌱',
  'greenhouse.seed.found': (n) => `A seed packet! ${n} of 5. 🌱`,
  'greenhouse.seed.all': 'That is all five! Take them to the seed tray by the potting bench. 🌱',
  'greenhouse.seed.prompt': 'E — sow the seeds',
  'greenhouse.seed.sown': 'The seeds are sown, and little green shoots pop up! 🌿',
  // the watering job: the can, the thirsty pots, the end
  'greenhouse.can.offer': 'Some of the pots look thirsty. The watering can hangs by the potting bench. 💧',
  'greenhouse.can.prompt': 'E — pick up the watering can',
  'greenhouse.water.prompt': 'E — water the plant',
  'greenhouse.water.done': 'Ahh! The plant perks right up. 💧',
  'greenhouse.water.all': 'Every pot is watered! The can goes back to its hook. 🌼',
  // the moments' labels (the corner card says what just happened) and the catnip bed's purr
  'greenhouse.moment.frog': 'a frog plopping into the pond',
  'greenhouse.moment.sparrow': 'a sparrow splashing in the fountain',
  'greenhouse.catnip.purr': clan('Purrrr… so happy. 🌿', 'Purrrr… the catmint makes everything soft. 🌿'),
  // the six finds' lines (milestone G2 reserves them; the rules that say them come with the finds)
  'greenhouse.find.palm': 'A cool drop of mist lands on your nose. 💧',
  'greenhouse.find.koi': 'A fat orange fish blows you a bubble. 🐟',
  'greenhouse.find.catnip': clan('Catnip! Mmmm, it smells so good. 🌿', 'Catmint! It smells like a medicine cat’s den. Mmmm. 🌿'),
  'greenhouse.find.orchid': 'The orchid opens up, just for you. 🌸',
  'greenhouse.find.cactus': 'A little pink flower pops open on the cactus. 🌵',
  'greenhouse.find.butterfly': 'A butterfly lands on your nose. Hold still! 🦋',
});

addPhrases(LINES);
Object.assign(GREENHOUSE_HINTS, HINTS);
