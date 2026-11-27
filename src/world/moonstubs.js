// =============================================================================
// THE MOON'S STAND-INS (background loading). Until a late stage arrives, the life holds an inert stand-in where that stage's lives will be: it answers every
// question the rest of the life asks with "nothing there yet" (no prompt, no flight, not riding, no errand), so the guide, the flow and the idle ring read it
// without a special case. When the stage arrives the real life takes its place (moonlife.js slot()).
// =============================================================================
const noop = () => {};
const none = () => null;
const inert = (o) => ({ promptAt: none, interact: none, credit: noop, update: noop, frame: noop, dispose: noop, ...o });

export const createStubs = () => ({
  star: () => inert({ setGuest: noop, state: { open: false } }),
  launch: () => inert({ setSecond: noop, state: { carryingCard: -1 }, carryingCard: -1, second: null, tilt: () => 0 }),
  jump: () => inert({ last: null, count: () => 0 }),
  bound: () => inert({ active: false, lift: 0, boundY: 0 }),
  rover: () => inert({ riding: false, state: { riding: false, x: 0, z: 0 } }),
  robots: (spottable) => inert({ spottable }),
  job: () => inert({ state: {}, plan: null, goal: none, onHop: noop }),
});
