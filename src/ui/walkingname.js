// The two names a child meets, and the words for the public one.
//
//   her cat's name   a cat she made in the builder has its own name
//                    (state.customCats[i].name). It shows on Home and on her
//                    own walk tag. Never sent anywhere.
//   her walking name state.petName: the one name friends see online, whichever
//                    cat she walks. Saving it is what switches on the profile
//                    push and the colony sync, so it is only ever saved by a
//                    tap of hers (Save, a star name, or the offer below).
//
// Every screen that asks for the public name uses these words, so it is
// called one thing everywhere. DOM-free.

import { activeCat, FALLBACK_NAME } from '../customcats.js';
import { validPetName, goodNewPetName } from '../net.js';

export const WALKING_NAME = 'Your walking name';
export const WALKING_NAME_HELP = 'Friends see this name when you play together.';
export const WALKING_NAME_SAFETY = 'Pick a cat name, not your real name.';
export const PICK_WALKING_NAME = 'Pick your walking name';
export const WALKING_NAME_RULE = 'A walking name is 2–16 letters, spaces, or hyphens.';

// Above the name box while none is saved. `why` is what she was trying to do
// when she was sent here ('walk', 'colony'), or falsy when she just opened it.
export function walkingNameIntro(why) {
  if (why === 'colony') return 'You need a walking name before you can share your colony. Type one here and tap Save:';
  if (why) return 'You need a walking name before you can join a walk. Type one here and tap Save:';
  return 'First, pick your walking name:';
}

// The name to offer as her walking name: her own cat's, when she walks a cat
// she made, has no walking name yet, and that name is one she could type in
// herself. null otherwise. An offer only: nothing here saves anything.
export function offeredWalkingName(state) {
  if (validPetName(state?.petName ?? '')) return null;
  const cat = activeCat(state);
  if (!cat.custom || typeof cat.name !== 'string') return null;
  if (cat.name === FALLBACK_NAME || !goodNewPetName(cat.name)) return null;
  return cat.name;
}
