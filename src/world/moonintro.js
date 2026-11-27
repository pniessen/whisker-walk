// The Moon's arrival card: three lines at the start of a walk while Pip still sleeps (the story's step 0); closes when he wakes (world/arrivalcard.js).
import { phrase } from '../clanphrases.js';
import { createArrivalCard } from './arrivalcard.js';
import * as M from './moonmission.js';

export const introWords = () => [phrase('moon.intro1'), phrase('moon.intro2'), phrase('moon.intro3')];

export function createMoonIntro({ doc, win, progression }) {
  const step = () => M.normalize(progression?.state?.moon).step;
  return createArrivalCard({ doc: step() === 0 ? doc : null, win, lines: introWords(), accent: '#ffd45a', ink: 'rgba(20,26,38,.88)', closeWhen: () => step() > 0 });
}
