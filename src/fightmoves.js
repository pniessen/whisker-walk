// The special fight moves: a kid earns them by winning fights (or buys two).
// A special answers a clue like a button, is worth two round wins and is
// usable once per fight. The rules live in fight.js; this is the catalogue.
import { CLUES } from './fight.js';
import { phrase } from './clanphrases.js';

// `name` and `short` are read from the phrase table each time (getters), so the
// words are never fixed when this module loads.
export const FIGHT_MOVES = Object.freeze([
  Object.freeze({ id: 'rearUpSwat', get name() { return phrase('move.rearUpSwat.name'); }, get short() { return phrase('move.rearUpSwat.short'); }, answers: 'swipe', action: 'rearUp', earnAt: 3, price: 300, hint: 'Paw up', when: 'they raise a paw' }),
  Object.freeze({ id: 'leapScratch', get name() { return phrase('move.leapScratch.name'); }, get short() { return phrase('move.leapScratch.short'); }, answers: 'charge', action: 'leap', earnAt: 6, price: 600, hint: 'Backs up', when: 'they back up' }),
  Object.freeze({ id: 'pin', get name() { return phrase('move.pin.name'); }, get short() { return phrase('move.pin.short'); }, answers: 'pounce', action: 'pin', earnAt: 10, price: null, hint: 'Crouch', when: 'they crouch' }),
  Object.freeze({ id: 'rollingTumble', get name() { return phrase('move.rollingTumble.name'); }, get short() { return phrase('move.rollingTumble.short'); }, answers: 'any', action: 'roll', earnAt: 20, price: null, hint: 'Any move', when: null }),
]);

export const FIGHT_MOVE_IDS = Object.freeze(FIGHT_MOVES.map((m) => m.id));

export function moveById(id) {
  if (typeof id !== 'string') return null;
  return FIGHT_MOVES.find((m) => m.id === id) || null;
}

export function earnedMoves(fightsWon) {
  if (typeof fightsWon !== 'number' || !Number.isFinite(fightsWon)) return [];
  return FIGHT_MOVES.filter((m) => m.earnAt <= fightsWon).map((m) => m.id);
}

export function unlockToast(id) {
  const m = moveById(id);
  if (!m) return '';
  return `New move: ${m.name}! Use it ${m.when === null ? 'on any move' : `when ${m.when}`}.`;
}

// R18's toasts wait on the session (walk.js sets session.moveLines) until the
// walk starts: under the Ready? card a toast would never be seen. main.js
// takes them on the first engage, like housecats.js's takeArrivalLine.
export function takeMoveLines(session) {
  const lines = session?.moveLines;
  if (session) session.moveLines = null;
  return Array.isArray(lines) ? lines.filter((l) => typeof l === 'string' && l) : [];
}

export function teachFor(ids) {
  if (!Array.isArray(ids)) return '';
  let out = '';
  for (const m of FIGHT_MOVES) {
    if (!ids.includes(m.id)) continue;
    const icon = m.answers === 'any' ? 'any' : (CLUES[m.answers] ? CLUES[m.answers].icon : m.answers);
    out += ` · ${icon} → ${m.short}`;
  }
  return out;
}
