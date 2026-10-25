// Make a redeem code for Whisker Walk (v21 §10.4). Run by the owner, not shipped.
//
// Usage:
//   node scripts/make-code.mjs --points 50 --acc wizard --acc crown --cat hagrid --label "Halloween"
//   node scripts/make-code.mjs --code "pumpkin pie 2026" --points 20
//
// Options:
//   --points N     points the code gives (optional; 0 if left out)
//   --acc ID       an accessory id from CATALOG (repeatable)
//   --cat ID       a cat id from CATALOG (repeatable)
//   --label TEXT   your private note about the code (optional; it ships in the
//                  table, so never put the code in it)
//   --code TEXT    use your own code instead of an invented WORD-WORD-XXXX one
//
// The reward must give something. Prints the code for the girls and one line to
// paste into src/redeemcodes.js. Only the hash of the code is ever stored.
import { pathToFileURL } from 'node:url';
import { normalizeCode, hashCode } from '../src/redeem.js';
import { CATALOG } from '../src/progression.js';
import { REDEEM_CODES } from '../src/redeemcodes.js';

export const WORDS = [
  'TUNA', 'MOON', 'WHISKER', 'PAW', 'MITTEN', 'KITTEN', 'PURR', 'MEOW',
  'CLAW', 'FUR', 'TAIL', 'NAP', 'YARN', 'BELL', 'MOUSE', 'FISH',
  'MILK', 'CREAM', 'COZY', 'SUNNY', 'STAR', 'COMET', 'RIVER', 'MEADOW',
  'FOREST', 'LEAF', 'ACORN', 'BERRY', 'CLOVER', 'FERN', 'MOSS', 'PEBBLE',
  'BROOK', 'POND', 'REED', 'WILLOW', 'MAPLE', 'BIRCH', 'ASPEN', 'CEDAR',
  'HAZEL', 'THISTLE', 'HEATHER', 'BRAMBLE', 'SPARROW', 'ROBIN', 'FINCH', 'WREN',
  'OWL', 'HAWK', 'RAVEN', 'DOVE', 'MINNOW', 'TROUT', 'SALMON', 'SHADOW',
  'SWIFT', 'BRAVE', 'QUICK', 'GENTLE', 'SILVER', 'AMBER', 'GOLDEN', 'COPPER',
  'GINGER', 'PEPPER', 'SPOTTY', 'STRIPE', 'TABBY', 'CALICO', 'TORTIE', 'BENGAL',
  'FLUFFY', 'SOFT', 'SNOWY', 'FROST', 'MISTY', 'STORM', 'BREEZE', 'CLOUD',
  'RAIN', 'SUNBEAM', 'DAWN', 'DUSK', 'GLOW', 'EMBER', 'SPARK', 'FLAME',
  'PUMPKIN', 'APPLE', 'HONEY', 'BISCUIT', 'MUFFIN', 'COOKIE', 'PEACH', 'LEMON',
  'MINT', 'SAGE', 'THYME', 'POPPY', 'DAISY', 'ROSE', 'TULIP', 'PANSY',
  'PIP', 'BUTTON', 'BUBBLES', 'SPRINT', 'POUNCE', 'LEAP', 'CLIMB', 'PROWL',
  'STALK', 'SNEAK', 'CHASE', 'PLAY', 'DREAM', 'WISH', 'LUCKY', 'HAPPY',
  'SNUG', 'CURL', 'BOOP', 'KNEAD', 'BASK', 'MARBLE', 'VELVET', 'JINGLE',
];

// No O, 0, I, 1 or L, so the last four characters can be read aloud safely.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function defaultRng() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

export function inventCode(rng = defaultRng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  let tail = '';
  for (let i = 0; i < 4; i++) tail += pick(ALPHABET);
  return `${pick(WORDS)}-${pick(WORDS)}-${tail}`;
}

const MIN_CODE_LENGTH = 8;
const MIN_HARD_LENGTH = 4;
const MAX_LABEL_LENGTH = 60;

export function parseArgs(argv) {
  const out = { points: 0, accessories: [], cats: [], label: '' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!['--points', '--acc', '--cat', '--label', '--code'].includes(flag)) {
      throw new Error(`Unknown option "${flag}". Try --points, --acc, --cat, --label or --code.`);
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    if (flag === '--points') {
      if (!/^\d+$/.test(value)) throw new Error(`--points needs a whole number, not "${value}".`);
      out.points = Number(value);
    } else if (flag === '--acc') out.accessories.push(value);
    else if (flag === '--cat') out.cats.push(value);
    else if (flag === '--label') out.label = value;
    else out.code = value;
  }
  return out;
}

// Returns messages. Entries starting with "Warning:" are only advice; anything
// else is an error and stops the script.
export function validateReward(reward) {
  const messages = [];
  const accessories = reward.accessories ?? [];
  const cats = reward.cats ?? [];
  const points = reward.points ?? 0;
  for (const id of accessories) {
    if (!Object.hasOwn(CATALOG.accessories, id)) {
      messages.push(`Unknown accessory "${id}". Known: ${Object.keys(CATALOG.accessories).join(', ')}`);
    }
  }
  for (const id of cats) {
    if (!Object.hasOwn(CATALOG.cats, id)) {
      messages.push(`Unknown cat "${id}". Known: ${Object.keys(CATALOG.cats).join(', ')}`);
    }
  }
  if (!(points > 0 || accessories.length || cats.length)) {
    messages.push('This code gives nothing. Add --points, --acc or --cat.');
  }
  if ((reward.label ?? '').length > MAX_LABEL_LENGTH) {
    messages.push(`The label is too long (max ${MAX_LABEL_LENGTH} characters).`);
  }
  const codeLength = reward.code !== undefined ? normalizeCode(reward.code).length : null;
  if (codeLength !== null && codeLength < MIN_HARD_LENGTH) {
    messages.push(`That code is too short: it needs at least ${MIN_HARD_LENGTH} letters or digits (spaces, dashes and emoji don't count).`);
  } else if (codeLength !== null && codeLength < MIN_CODE_LENGTH) {
    messages.push(`Warning: that code is short (under ${MIN_CODE_LENGTH} letters and digits), so it is easier to guess.`);
  }
  return messages;
}

// Advice only: pasting the same hash twice would silently replace the old entry.
export function duplicateWarning(hash, table = REDEEM_CODES) {
  return Object.hasOwn(table, hash)
    ? 'Warning: This code is already in src/redeemcodes.js — pasting it again would replace the old one.'
    : null;
}

export function entryLine(hash, reward) {
  const list = (ids) => `[${ids.map((id) => JSON.stringify(id)).join(', ')}]`;
  return `  '${hash}': { label: ${JSON.stringify(reward.label ?? '')}, points: ${reward.points ?? 0}, `
    + `accessories: ${list(reward.accessories ?? [])}, cats: ${list(reward.cats ?? [])} },`;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const messages = validateReward(args);
  for (const m of messages.filter((x) => x.startsWith('Warning:'))) console.error(m);
  const errors = messages.filter((x) => !x.startsWith('Warning:'));
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  const code = args.code ?? inventCode();
  const hash = await hashCode(normalizeCode(code));
  const dup = duplicateWarning(hash);
  if (dup) console.error(dup);
  console.log(`Code for the girls:   ${code}`);
  console.log('Paste into src/redeemcodes.js:');
  console.log(entryLine(hash, args));
  console.log('');
  console.log("Keep the code secret — don't put it in the label.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
