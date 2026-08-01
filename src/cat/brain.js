// Breed personality data. Since the third-person "you are the cat" pivot,
// the player drives the cat directly — the old autonomous FSM is gone.
// speed feeds the movement pace and special drives breed perks; the other
// fields are kept for flavor/reference.

export const PERSONALITIES = {
  tabby:     { speed: 2.0, pull: 5, weights: { sniff: 3, distracted: 2, nap: 0.5, requestPet: 1 }, sniffRange: 8, special: 'keenNose' },
  siamese:   { speed: 2.8, pull: 9, weights: { sniff: 1, distracted: 5, nap: 0.2, requestPet: 0.7 }, sniffRange: 5, special: 'chaser' },
  persian:   { speed: 1.2, pull: 3, weights: { sniff: 1, distracted: 0.5, nap: 4, requestPet: 2 }, sniffRange: 4, special: 'napper' },
  black:     { speed: 2.0, pull: 5, weights: { sniff: 2, distracted: 1.5, nap: 1, requestPet: 1 }, sniffRange: 6, special: 'fearless' },
  calico:    { speed: 2.3, pull: 6, weights: { sniff: 2, distracted: 4, nap: 0.7, requestPet: 1 }, sniffRange: 6, special: 'pouncer' },
  mainecoon: { speed: 1.8, pull: 3, weights: { sniff: 2, distracted: 1, nap: 1, requestPet: 1.5 }, sniffRange: 6, special: 'steady' },
  // the family pets
  zeetoo:    { speed: 2.1, pull: 5, weights: { sniff: 3, distracted: 2, nap: 0.5, requestPet: 1 }, sniffRange: 9, special: 'keenNose' },
  rosa:      { speed: 2.2, pull: 5, weights: { sniff: 2, distracted: 1.5, nap: 1, requestPet: 1.2 }, sniffRange: 6, special: 'fearless' },
  robbie:    { speed: 2.4, pull: 6, weights: { sniff: 2, distracted: 4, nap: 0.6, requestPet: 1 }, sniffRange: 6, special: 'pouncer' },
  hagrid:    { speed: 2.0, pull: 4, weights: { sniff: 3, distracted: 2, nap: 1, requestPet: 0.8 }, sniffRange: 7, special: 'bird' },
};
