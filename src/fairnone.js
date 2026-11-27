// What a walk away from the Fairground has: no imports, a leaf (fairlive.js re-exports it).
// What a walk that is not at the Fairground has.
export const NO_FAIR = Object.freeze({
  sim: null,
  env: null,
  riding: null,
  wobble: 0,
  groundSpot() { return null; },
  update() {},
  late() {},
  jump() { return false; },
  canBoard() { return false; },
  pawKind() { return null; },
  seatById() { return null; },
  friendSeat() {},
  // step 3 (src/fairshow.js): no games, no finds, no visitors anywhere else
  games: null,
  show: null,
  actionFor() { return null; },
  act() { return false; },
  meow() { return 0; },
  dispose() {},
});
