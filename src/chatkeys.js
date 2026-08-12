import { PHRASES } from './chat.js';
// Number row → phrase id. Digit1..Digit9 = first nine 'phrase'-kind entries,
// Digit0 = the tenth. Emotes are reachable only via the tray, not the row.
export function phraseIdForDigit(code, phrases = PHRASES) {
  const m = /^Digit([0-9])$/.exec(code || '');
  if (!m) return null;
  const list = phrases.filter((p) => p.kind === 'phrase');
  const n = m[1] === '0' ? 10 : Number(m[1]);
  return list[n - 1]?.id ?? null;
}
