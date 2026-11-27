// The Crystal Cave's arrival card: three lines at the start of a walk while Lumi is not met (the story's step 0); closes when she says hello (world/arrivalcard.js).
import { phrase } from '../clanphrases.js';
import { createArrivalCard } from './arrivalcard.js';
import * as C from '../crystalmission.js';

export const introWords = () => [phrase('crystal.intro1'), phrase('crystal.intro2'), phrase('crystal.intro3')];

export function createCrystalIntro({ doc = globalThis.document, win = globalThis.window, progression }) {
  const step = () => C.normalize(progression?.state?.crystal).step;
  return createArrivalCard({ doc: step() === 0 ? doc : null, win, lines: introWords(), accent: '#f4a6d0', closeWhen: () => step() > 0 });
}
