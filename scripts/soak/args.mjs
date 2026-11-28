// Arguments for scripts/soak.mjs, and the replay command a crash report prints.
import { isKnownCat, isKnownPlace } from './save.mjs';

export const USAGE = 'usage: soak.mjs --seed N --place reef|moon|<id> --cat <preset|custom> [--tv 0|1] [--throttle K] [--minutes M] [--couch 0|1] [--out dir] [--chrome path] [--headed] [--hidden-tab 0|1] [--touch 0|1] [--self-test]';

export const DEFAULTS = Object.freeze({
  seed: 1, place: 'reef', cat: 'tabby', tv: 0, throttle: 1, minutes: 5, couch: 0, out: 'soak-out', chrome: null, headed: false, selfTest: false, hiddenTab: 0, touch: 0, dist: 'dist',
});

const int = (v, name, min, max) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max}, not "${v}"`);
  return n;
};
const flag = (v, name) => int(v, name, 0, 1);

export function parseSoakArgs(argv) {
  const o = { ...DEFAULTS };
  const val = (i, name) => {
    if (argv[i] === undefined) throw new Error(`${name} needs a value\n${USAGE}`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') o.seed = int(val(++i, a), a, 0, 4294967295);
    else if (a === '--place') o.place = val(++i, a);
    else if (a === '--cat') o.cat = val(++i, a);
    else if (a === '--tv') o.tv = flag(val(++i, a), a);
    else if (a === '--couch') o.couch = flag(val(++i, a), a);
    else if (a === '--touch') o.touch = flag(val(++i, a), a);
    else if (a === '--hidden-tab') o.hiddenTab = flag(val(++i, a), a);
    else if (a === '--throttle') o.throttle = int(val(++i, a), a, 1, 20);
    else if (a === '--minutes') {
      const m = Number(val(++i, a));
      if (!(m > 0 && m <= 600)) throw new Error(`--minutes must be above 0 and at most 600, not "${argv[i]}"`);
      o.minutes = m;
    } else if (a === '--out') o.out = val(++i, a);
    else if (a === '--dist') o.dist = val(++i, a);
    else if (a === '--chrome') o.chrome = val(++i, a);
    else if (a === '--headed') o.headed = true;
    else if (a === '--self-test') o.selfTest = true;
    else throw new Error(`unexpected argument: ${a}\n${USAGE}`);
  }
  if (!isKnownPlace(o.place)) throw new Error(`unknown place "${o.place}"`);
  if (!isKnownCat(o.cat)) throw new Error(`unknown cat "${o.cat}"`);
  return o;
}

// The exact command that repeats a run (same seed, same flags).
export function replayCommand(o) {
  const parts = ['node', 'scripts/soak.mjs', '--seed', o.seed, '--place', o.place, '--cat', o.cat, '--tv', o.tv, '--throttle', o.throttle,
    '--minutes', o.minutes, '--couch', o.couch, '--hidden-tab', o.hiddenTab, '--touch', o.touch];
  if (o.headed) parts.push('--headed');
  return parts.join(' ');
}

// A run's folder name: sorts by time, says what it was.
export function runName(o, stamp) {
  return `${stamp}-${o.place}-${o.cat}-s${o.seed}-tv${o.tv}-t${o.throttle}-c${o.couch}`;
}
