// The read-the-move fight: best of three, pure rules, no imports.
//
// Three promises:
//  1. The clue is honest. The pose a cat shows is always the move that follows.
//  2. Speed never matters. Any tap after the first moment of the window scores
//     the same, and no time value ever reaches the outcome.
//  3. Losing is only `won: false`. Nothing here knows about progress at all.
//
// `rng` is local to one fight: it is drawn once per clue and nowhere else.

export const MOVES = ['pounce', 'swipe', 'charge'];
export const BUTTONS = ['pounce', 'swipe', 'dodge'];
export const COUNTER = { pounce: 'dodge', swipe: 'pounce', charge: 'swipe' };

export const CLUES = {
  pounce: { pose: 'stalk', icon: '⬇️', text: 'It crouches low…' },
  swipe: { pose: 'swipe', icon: '🐾', text: 'It raises a paw…' },
  charge: { pose: 'backUp', icon: '↩️', text: 'It backs up…' },
};
export const NEUTRAL_POSE = 'follow';

export const TIMING = { squareOff: 1.2, answer: 4.0, ignoreFirst: 0.25, tumble: 1.4, tumbleReduced: 0.6, beat: 0.8 };
export const LONGER_LOOK = 1.0;

export const EDGE_BY_SPECIAL = {
  fearless: 'longerLook', keenNose: 'longerLook', chaser: 'longerLook',
  steady: 'secondLook', pouncer: 'secondLook', napper: 'secondLook', bird: 'secondLook',
};

export function edgeFor(special) {
  if (typeof special !== 'string') return null;
  return Object.hasOwn(EDGE_BY_SPECIAL, special) ? EDGE_BY_SPECIAL[special] : null;
}

export function createFight({
  rng, edge = null, reducedMotion = false, specials = [], actionTime = null, beatTime = TIMING.beat,
}) {
  let clock = 0;
  let secondLookUsed = false;

  const f = { phase: 'squareOff', round: 0, wins: 0, losses: 0, move: null, won: null, used: [] };
  const owned = new Map();
  for (const s of Array.isArray(specials) ? specials : []) {
    if (s && typeof s.id === 'string' && typeof s.answers === 'string' && !owned.has(s.id)) owned.set(s.id, s.answers);
  }
  let actionLen = null;

  const startClue = (events) => {
    f.round += 1;
    f.move = MOVES[Math.floor(rng() * 3)];
    f.phase = 'clue';
    clock = 0;
    events.push({ type: 'clue', round: f.round, move: f.move });
  };

  const endRound = (events, button, special = false) => {
    let won;
    if (special) {
      const answers = owned.get(button);
      won = answers === 'any' || answers === f.move;
      if (won) f.wins += 2; else f.losses += 1;
      f.used.push(button);
    } else {
      won = button !== null && COUNTER[f.move] === button;
      if (won) f.wins += 1; else f.losses += 1;
    }
    const ev = { type: 'round', round: f.round, move: f.move, answer: button, won };
    if (special) ev.special = true;
    events.push(ev);
    actionLen = typeof actionTime === 'function' ? actionTime(ev) : null;
    f.phase = 'tumble';
    clock = 0;
  };

  const windowLength = () => TIMING.answer + (edge === 'longerLook' ? LONGER_LOOK : 0);
  const tumbleLength = () => (actionLen > 0 ? actionLen : (reducedMotion ? TIMING.tumbleReduced : TIMING.tumble));

  f.step = (dt) => {
    const events = [];
    if (!(dt > 0)) return events;
    let left = dt;
    while (f.phase !== 'over') {
      const len = f.phase === 'squareOff' ? TIMING.squareOff
        : f.phase === 'clue' ? windowLength()
        : f.phase === 'tumble' ? tumbleLength()
        : beatTime;
      if (clock + left < len) { clock += left; break; }
      left -= len - clock;
      clock = 0;
      if (f.phase === 'squareOff') startClue(events);
      else if (f.phase === 'clue') {
        if (edge === 'secondLook' && !secondLookUsed) {
          secondLookUsed = true;
          events.push({ type: 'secondLook', round: f.round });
        } else endRound(events, null);
      } else if (f.phase === 'tumble') {
        if (f.wins >= 2 || f.losses >= 2) {
          f.phase = 'over';
          f.won = f.wins >= 2;
          events.push({ type: 'over', won: f.won });
        } else f.phase = 'beat';
      } else startClue(events);
    }
    return events;
  };

  f.answer = (button) => {
    const events = [];
    if (f.phase !== 'clue' || clock < TIMING.ignoreFirst) return events;
    if (typeof button !== 'string') return events;
    if (BUTTONS.includes(button)) endRound(events, button);
    else if (owned.has(button) && !f.used.includes(button)) endRound(events, button, true);
    return events;
  };

  return f;
}
