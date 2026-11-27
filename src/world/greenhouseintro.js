// The Greenhouse's arrival card: three lines on a first visit (walks 0 or 1) while neither gardener's job is done; closes when a seed is found or a pot watered (world/arrivalcard.js).
import { phrase } from '../clanphrases.js';
import { createArrivalCard } from './arrivalcard.js';

export const introWords = () => [phrase('greenhouse.intro1'), phrase('greenhouse.intro2'), phrase('greenhouse.intro3')];

export function createGreenhouseIntro({ doc = globalThis.document, win = globalThis.window, progression, visits = 0, state }) {
  const j = progression?.state?.journal;
  const jobsDone = (j?.ghjobseeds ?? 0) > 0 || (j?.ghjobwater ?? 0) > 0;
  const first = visits <= 1 && !jobsDone;
  return createArrivalCard({ doc: first ? doc : null, win, lines: introWords(), accent: '#8fd88a', ink: 'rgba(16,40,28,.88)', closeWhen: () => { const s = state?.(); return !!s && (s.seeds > 0 || s.watered > 0); } });
}
