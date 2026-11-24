// The Greenhouse's words (milestone 1). A lazy file: they join the phrase table (src/clanphrases.js, addPhrases) when
// the place's chunk arrives, so the start-up download does not carry them (the Lighthouse's way). Every line reads the
// same in both word sets: no series word is in any of them. test/greenhousewords.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';

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
});

addPhrases(LINES);
