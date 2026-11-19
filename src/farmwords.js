// The lines of Appletree Farm's jobs and discoveries, by job and by find.
//
// Every line is in the phrase table (src/clanphrases.js, the later table), so
// a set of words can say one differently. This file only gives each its place:
// the table's test wants every phrase() call to name its id in full, so the
// ids are spelled out here, once, and the game asks by job or find id.
import { phrase } from './clanphrases.js';

// The animals' one-time lines (step 2), by the event that shows one.
export const ANIMAL_TOASTS = Object.freeze({
  ride: () => phrase('farm.toast.ride'),
  'goat-butt': () => phrase('farm.toast.goatPlay'),
  'goat-copy': () => phrase('farm.toast.goatCopy'),
  'dog-hello': () => phrase('farm.toast.dogWalk'),
  'chick-follow': () => phrase('farm.toast.chicksFollow'),
});

// A job's lines: `prompt` beside its giver, `start` when it is taken on,
// `done` when it is finished (the award's line).
export const JOB_WORDS = Object.freeze({
  chicks: Object.freeze({
    prompt: () => phrase('farm.chicks.prompt'),
    start: () => phrase('farm.chicks.start'),
    done: () => phrase('farm.chicks.done'),
    found: () => phrase('farm.chicks.found'),
    home: (n, total) => phrase('farm.chicks.home', n, total),
  }),
  cow: Object.freeze({
    prompt: () => phrase('farm.cow.prompt'),
    start: () => phrase('farm.cow.start'),
    done: () => phrase('farm.cow.done'),
    milk: () => phrase('farm.cow.milk'),
    milkPrompt: () => phrase('farm.cow.milkPrompt'),
  }),
  goat: Object.freeze({
    prompt: () => phrase('farm.goat.prompt'),
    start: () => phrase('farm.goat.start'),
    done: () => phrase('farm.goat.done'),
    skip: () => phrase('farm.goat.skip'),
    drop: () => phrase('farm.goat.drop'),
    pickPrompt: () => phrase('farm.goat.pickPrompt'),
    putPrompt: () => phrase('farm.goat.putPrompt'),
    doorPrompt: () => phrase('farm.goat.doorPrompt'),
    hat: () => phrase('farm.hat.name'),
  }),
  mice: Object.freeze({
    prompt: () => phrase('farm.mice.prompt'),
    start: () => phrase('farm.mice.start'),
    done: () => phrase('farm.mice.done'),
  }),
});

// The HUD's one line for a job under way (farmjobs.js objective()).
export function jobGoalLine(o) {
  if (!o) return null;
  if (o.job === 'chicks') return phrase('farm.chicks.goal', o.n, o.total);
  if (o.job === 'cow') return o.step === 'milk' ? phrase('farm.cow.milkGoal') : phrase('farm.cow.goal');
  if (o.job === 'goat') return o.step === 'carry' ? phrase('farm.goat.carryGoal') : o.step === 'pickup' ? phrase('farm.goat.pickGoal') : phrase('farm.goat.goal');
  if (o.job === 'mice') return phrase('farm.mice.goal', o.n, o.total);
  return null;
}

// A find's lines: `first` the first time ever (the award's line), `again` on
// any later walk.
export const FIND_WORDS = Object.freeze({
  loftcats: Object.freeze({ first: () => phrase('farm.find.loftcats.first'), again: () => phrase('farm.find.loftcats.again') }),
  eggs: Object.freeze({ first: () => phrase('farm.find.eggs.first'), again: () => phrase('farm.find.eggs.again') }),
  owl: Object.freeze({ first: () => phrase('farm.find.owl.first'), again: () => phrase('farm.find.owl.again'), peek: () => phrase('farm.find.owl.peek') }),
  scarecrow: Object.freeze({
    first: () => phrase('farm.find.scarecrow.first'),
    on: () => phrase('farm.find.scarecrow.on'),
    off: () => phrase('farm.find.scarecrow.off'),
    prompt: () => phrase('farm.find.scarecrow.prompt'),
    backPrompt: () => phrase('farm.find.scarecrow.backPrompt'),
  }),
  apples: Object.freeze({ first: () => phrase('farm.find.apples.first'), again: () => phrase('farm.find.apples.again') }),
  ducklings: Object.freeze({ first: () => phrase('farm.find.ducklings.first'), again: () => phrase('farm.toast.ducklingsFollow') }),
});

// The journal's pages (src/journal.js), by journal id.
export const PAGE_WORDS = Object.freeze({
  jobchicks: Object.freeze({ name: () => phrase('farm.page.chicks.name'), hint: () => phrase('farm.page.chicks.hint') }),
  jobcow: Object.freeze({ name: () => phrase('farm.page.cow.name'), hint: () => phrase('farm.page.cow.hint') }),
  jobgoat: Object.freeze({ name: () => phrase('farm.page.goat.name'), hint: () => phrase('farm.page.goat.hint') }),
  jobmice: Object.freeze({ name: () => phrase('farm.page.mice.name'), hint: () => phrase('farm.page.mice.hint') }),
  findloftcats: Object.freeze({ name: () => phrase('farm.page.loftcats.name'), hint: () => phrase('farm.page.loftcats.hint') }),
  findeggs: Object.freeze({ name: () => phrase('farm.page.eggs.name'), hint: () => phrase('farm.page.eggs.hint') }),
  findowl: Object.freeze({ name: () => phrase('farm.page.owl.name'), hint: () => phrase('farm.page.owl.hint') }),
  findscarecrow: Object.freeze({ name: () => phrase('farm.page.scarecrow.name'), hint: () => phrase('farm.page.scarecrow.hint') }),
  findapples: Object.freeze({ name: () => phrase('farm.page.apples.name'), hint: () => phrase('farm.page.apples.hint') }),
  findducklings: Object.freeze({ name: () => phrase('farm.page.ducklings.name'), hint: () => phrase('farm.page.ducklings.hint') }),
});
