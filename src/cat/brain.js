export const PERSONALITIES = {
  tabby:     { speed: 2.0, pull: 5, weights: { sniff: 3, distracted: 2, nap: 0.5, requestPet: 1 }, sniffRange: 8, special: 'keenNose' },
  siamese:   { speed: 2.8, pull: 9, weights: { sniff: 1, distracted: 5, nap: 0.2, requestPet: 0.7 }, sniffRange: 5, special: 'chaser' },
  persian:   { speed: 1.2, pull: 3, weights: { sniff: 1, distracted: 0.5, nap: 4, requestPet: 2 }, sniffRange: 4, special: 'napper' },
  black:     { speed: 2.0, pull: 5, weights: { sniff: 2, distracted: 1.5, nap: 1, requestPet: 1 }, sniffRange: 6, special: 'fearless' },
  calico:    { speed: 2.3, pull: 6, weights: { sniff: 2, distracted: 4, nap: 0.7, requestPet: 1 }, sniffRange: 6, special: 'pouncer' },
  mainecoon: { speed: 1.8, pull: 3, weights: { sniff: 2, distracted: 1, nap: 1, requestPet: 1.5 }, sniffRange: 6, special: 'steady' },
};

export function weightedChoice(weights, roll) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let acc = 0;
  for (const [key, w] of entries) {
    acc += w / total;
    if (roll < acc) return key;
  }
  return entries[entries.length - 1][0];
}

export function createBrain(breed, rng = Math.random) {
  const p = PERSONALITIES[breed];
  let state = 'follow';
  let timer = 2 + rng() * 3;

  const api = {
    breed,
    personality: p,
    get state() {
      return state;
    },
    set(next, duration) {
      state = next;
      timer = duration;
    },
    pet() {
      if (state === 'requestPet' || state === 'nap') {
        api.set('follow', 3 + rng() * 3);
        return true;
      }
      return false;
    },
    scare() {
      if (p.special === 'fearless' || p.special === 'steady') return false;
      api.set('scared', 2.5);
      return true;
    },
    update(dt, ctx) {
      if (ctx.leashTension > 1 && state !== 'follow' && state !== 'scared') {
        api.set('follow', 2);
      }
      timer -= dt;
      if (timer > 0) return state;

      if (state === 'follow') {
        const weights = { follow: 4, ...p.weights };
        if (!ctx.critterNearby) weights.distracted = 0;
        if (!ctx.poiNearby) weights.sniff = 0;
        const next = weightedChoice(weights, rng());
        const durations = {
          follow: 2 + rng() * 3,
          sniff: 2 + rng() * 2,
          distracted: 4 + rng() * 3,
          nap: 6 + rng() * 6,
          requestPet: 5,
        };
        api.set(next, durations[next]);
      } else {
        api.set('follow', 2 + rng() * 4);
      }
      return state;
    },
  };
  return api;
}
