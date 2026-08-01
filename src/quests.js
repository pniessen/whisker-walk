export const QUEST_TYPES = ['kitten', 'letter', 'glasses'];

const TEXTS = {
  kitten: {
    offer: '"My kitten ran off again! Could you find her for me?"',
    objective: 'Find the lost kitten 🐾',
    prompt: 'E — scoop up the kitten',
    done: 'You found the kitten! She purrs and scampers home.',
  },
  letter: {
    offer: '"Could you deliver this letter to the sparkly drop-off for me?"',
    objective: 'Deliver the letter 📨 (look for the sparkle)',
    prompt: 'E — deliver the letter',
    done: 'Letter delivered! The neighbor will be thrilled.',
  },
  glasses: {
    offer: '"I lost my glasses on my walk… I can barely see you!"',
    objective: 'Find the lost glasses 👓',
    prompt: 'E — pick up the glasses',
    done: 'Found them! Barely a scratch.',
  },
};

export function createQuest(rng, targetSpots) {
  const type = QUEST_TYPES[Math.floor(rng() * QUEST_TYPES.length)];
  const target = targetSpots[Math.floor(rng() * targetSpots.length)];
  let state = 'offered';

  return {
    type,
    target,
    texts: TEXTS[type],
    get state() {
      return state;
    },
    accept() {
      if (state === 'offered') state = 'active';
    },
    tryComplete(pos, radius = 2) {
      if (state !== 'active') return false;
      if (Math.hypot(pos.x - target.x, pos.z - target.z) > radius) return false;
      state = 'complete';
      return true;
    },
  };
}
