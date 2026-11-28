// What the public files may never say. The public build holds the everyday
// words only; the family's set is sealed (src/seriesvault.js). This is the
// list every pipeline checks what it publishes against: the build (buildjson),
// the deploy, the app refresh (ios/refresh.mjs) and the smoke check.
//
//   node scripts/bundlewords.mjs dist     exit 1 and list every offence
//
// The list is read from the family's own set (src/clanwords.js), so a word
// added there is on the list the same day. It imports nothing from npm, and
// only scripts/ and tests may import the family's set.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as family from '../src/clanwords.js';

// Ordinary English words (and a plain name) that are also on the family's deny
// list of book characters. They are not a series word on their own.
export const ORDINARY_DENIED = Object.freeze(['Barley', 'Boulder', 'Midnight', 'Princess', 'Smudge', 'Sol']);

const TEXT_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt']);

const valuesOf = (v) => (v && typeof v === 'object' ? Object.values(v) : []);

// The deny list for a family set: [what, a RegExp tested on the whole text, or a Set of whole tokens].
export function bundleDenyList(on) {
  const firstHalves = new Set([
    ...on.PREFIXES, ...valuesOf(on.CAT_PREFIXES), ...valuesOf(on.RIVAL_PREFIXES),
    ...valuesOf(on.HOMAGE_PREFIXES), ...valuesOf(on.HOMAGE_CHOICES).flat(), ...valuesOf(on.CLAN_CAT_PREFIXES).flat(),
  ]);
  const endings = new Set([...on.WARRIOR_SUFFIXES, ...valuesOf(on.RANK_SUFFIX), on.CLAN_SUFFIX]);
  const names = new Set();
  for (const first of firstHalves) for (const end of endings) names.add(first + end);
  for (const n of on.DENIED_NAMES) if (!ORDINARY_DENIED.includes(n)) names.add(n);

  const phrases = valuesOf(on.PHRASES).filter((p) => typeof p === 'string' && p !== '');
  const emblems = valuesOf(on.EMBLEMS).filter((p) => typeof p === 'string' && p !== '');
  return [
    ['a name of the family set', names],
    ['the series\' word for the other people', /twoleg/i],
    ['the series\' word for house cats', /kittypet/i],
    ['a star name', /\bstar ?names?\b/i],
    ['the sick-carer\'s title', /medicine cat/i],
    ['the series\' word for loose cats', /\brogues?\b/i],
    ['the series\' name', /warrior (cats|code|names?)/i],
    ['the series\' author', /erin hunter/i],
    ['a place of the books', /starclan|highrock|highstones|fourtrees|thunderpath|moonpool/i],
    ['the books\' word for prey', /fresh-?kill/i],
    ['a landmark label of the family set', /great oak|sun-warmed|meeting (ring|stone)/i],
    ['the group word', /\bGathering\b|\bClans?\b/],
    ['a fight move of the family set', /Rear-up Swat|Leap and Scratch|Rolling Tumble/],
    ['a line only the family set says', new Set(phrases)],
    ['an emblem of the family set', new Set(emblems)],
  ];
}

// Every offence in a text, as "what: the words found". `deny` defaults to the family's list.
export function scanText(text, deny) {
  const list = deny ?? defaultList();
  const out = [];
  let tokens = null;
  for (const [what, test] of list) {
    if (test instanceof RegExp) {
      const m = text.match(test);
      if (m) out.push(`${what}: ${m[0]}`);
    } else if ([...test].some((x) => /[^A-Za-z]/.test(x))) {
      // whole strings (a line, an emblem): found anywhere in the text
      for (const s of test) if (text.includes(s)) out.push(`${what}: ${s.slice(0, 60)}`);
    } else {
      tokens ??= new Set(text.match(/[A-Za-z]+/g) ?? []);
      for (const t of tokens) if (test.has(t)) out.push(`${what}: ${t}`);
    }
  }
  return out;
}

let cached = null;
const defaultList = () => (cached ??= bundleDenyList(family));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Every offence in every text file under `dir`, and every .map file (a source map names the sources).
export function scanDir(dir, deny) {
  const list = deny ?? defaultList();
  const out = [];
  for (const file of walk(dir)) {
    if (file.endsWith('.map')) {
      out.push(`${file}: a source map`);
      continue;
    }
    if (!TEXT_EXTENSIONS.has(extname(file))) continue;
    for (const o of scanText(readFileSync(file, 'utf8'), list)) out.push(`${file}: ${o}`);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/bundlewords.mjs <dir>');
    process.exit(1);
  }
  const offences = scanDir(dir);
  for (const o of offences) console.error(o);
  if (offences.length) {
    console.error(`${offences.length} offence(s): the public files say something only the family's set may say`);
    process.exit(1);
  }
  console.log(`bundle words: ${dir} is clean`);
}
