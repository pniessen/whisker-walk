// =============================================================================
// The curated prop set — the SINGLE HOME of every v21 Stream 3b prop id.
//
// v21 spec, "The id cost": the props builder.js and the area files make are
// anonymous geometry, and persisting "this specific thing" needs an identity.
// Only a curated set gets one, and this is it: the things a cat can carry,
// knock off a ledge, scratch, push through, drink / eat / nap at, the cover
// prey bolts for, the dog's yard, and the den's keep slots. Nothing else in
// the game mints a 3b id.
//
// AN ID MUST NEVER BE RENAMED OR REUSED ONCE SHIPPED. Saved marks key on it
// (state.marks, marks.js): a renamed id leaves every mark made on the old one
// pointing at nothing. Move a prop by changing its numbers under the same id;
// retire one by deleting its entry and never handing its id to anything else;
// add one with the next number for its kind. Ids are `<area>-<kind>-<n>`.
//
// ZERO IMPORTS, on purpose. This is data plus a few small functions, so every
// consumer (the save sanitizer included) can read it without pulling in THREE
// or a world builder. Nothing here checks placement: test/propsets.test.js
// does, against the REAL built areas and src/rivalclans.js — walkable ground,
// collider and water clearance, a real perch under every knockable, a clear
// opening in every flap, nothing crowding a POI or sitting on a rival's land.
//
// What each list means, for the tasks that read it:
//   carryables  on the ground, picked up in the mouth (Tasks 5-9).
//   knockables  standing at (x, y, z) on an existing, ungated perch: y is the
//               ledge's real top face, (x, z) at least 0.35 m off the perch
//               point the cat snaps to. A knock lands it at fallTo on the
//               ground and it stays there (Task 10); fallTo.y is the height
//               of the deck or kerb it lands on, when that is not 0.
//   markables   (x, z) is the face of the post, trunk or bollard the claws
//               reach (Task 11). A colliderless post or bollard is walked
//               right up to. A tree's (x, z) sits on its trunk, inside its
//               collider, and the cat comes at it from the side it faces:
//               outward from the trunk's centre through (x, z). `mesh: false`
//               means the thing being scratched is already in the world;
//               `mesh: true` means nothing stands there yet and the walk must
//               put up a post (the contest-band posts — no area but the docks
//               has anything standing on its rival's border). `nearBorder` is
//               the one per area inside Task 12's contest band.
//   flaps       a gate with a cat flap (`flap`) or a hedge with a gap (`gap`),
//               built by Task 14. rotY is the panel's yaw exactly as THREE's
//               rotation.y, so the frame runs along the panel's local x, i.e.
//               world (cos rotY, -sin rotY). `width` is the opening.
//   rests       drink / eat / nap spots (Task 15); `mesh: false` reuses what
//               the room already has (the den's bowls and hearth).
//   hides       the cover a fleeing mouse, rat or squirrel dives under — all
//               of them under something already there (Task 13).
//   dogYard     the dog's lawn and its kennel (Task 16).
//   keepSlots   where the den lays out what you carried home (Task 7),
//               newest first into slot 0.
// =============================================================================

export const PROP_ID = Object.freeze(/^[a-z]{2,12}-[a-z]{2,12}-\d{1,2}$/);

export function isPropId(v) {
  return typeof v === 'string' && PROP_ID.test(v);
}

export const CARRY_KINDS = Object.freeze(['sock', 'toymouse', 'leaf', 'stick', 'pinecone', 'acorn', 'shell', 'driftwood', 'cap', 'rope', 'glove', 'ribbon']);
export const KNOCK_KINDS = Object.freeze(['cup', 'flowerpot', 'can', 'book', 'bucket']);
// The word a child would use for each knockable: the knock's award label is
// `the <noun> go over the edge 😼`, which the HUD shows after "You spotted ".
const KNOCK_NOUNS = Object.freeze({ cup: 'cup', flowerpot: 'flowerpot', can: 'can', book: 'book', bucket: 'bucket' });

// knockNoun(kind) → that word; anything else (an unknown kind, '__proto__',
// a number) is 'thing'. Own keys only.
export function knockNoun(kind) {
  return typeof kind === 'string' && Object.hasOwn(KNOCK_NOUNS, kind) ? KNOCK_NOUNS[kind] : 'thing';
}
export const REST_KINDS = Object.freeze(['drink', 'eat', 'nap']);

const QUARTER = Math.PI / 2;

const SETS = {
  neighborhood: {
    carryables: [
      { id: 'neighborhood-sock-1', kind: 'sock', x: -7.9, z: 29.3 },          // on the mint house's front step
      { id: 'neighborhood-sock-2', kind: 'sock', x: 16.2, z: 12.5 },          // dropped in the lilac house's side yard
      { id: 'neighborhood-toymouse-1', kind: 'toymouse', x: -21, z: 12 },     // left out on a back lawn
      { id: 'neighborhood-toymouse-2', kind: 'toymouse', x: 30.5, z: 21.8 },  // by the playground benches
    ],
    knockables: [
      // A coffee cup somebody left on the blue car's roof (the cabin's top,
      // y 1.425); it lands on the pavement, 1 cm up.
      { id: 'neighborhood-cup-1', kind: 'cup', x: -3.42, z: 20, y: 1.425, fallTo: { x: -1.84, z: 20.2, y: 0.01 } },
      // A potted geranium on the lean-to porch roof.
      { id: 'neighborhood-flowerpot-1', kind: 'flowerpot', x: -8.6, z: 17.7, y: 1.3, fallTo: { x: -7.4, z: 18.3 } },
      // A library book forgotten at one end of the playground bench (seat top
      // y 0.54), clear of the middle where a perched cat sits; it falls off
      // the front of the seat.
      { id: 'neighborhood-book-1', kind: 'book', x: 32.37, z: 23.67, y: 0.54, fallTo: { x: 33.2, z: 24.14 } },
    ],
    markables: [
      { id: 'neighborhood-post-1', kind: 'post', x: 26, z: -28, nearBorder: false, mesh: false },   // the dog yard's corner post
      { id: 'neighborhood-tree-1', kind: 'tree', x: -19.65, z: 22, nearBorder: false, mesh: false }, // the squirrels' oak, street side
      { id: 'neighborhood-post-2', kind: 'post', x: 29.6, z: -34.1, nearBorder: true, mesh: true },  // on the rival border
    ],
    flaps: [
      // A garden gate carrying the west front fence (x -9, z 13..17) on south.
      { id: 'neighborhood-flap-1', kind: 'flap', x: -9, z: 11, rotY: QUARTER, width: 1.0 },
      // The hedge between the two east back gardens.
      { id: 'neighborhood-gap-1', kind: 'gap', x: 17, z: 22.5, rotY: 0, width: 1.2 },
    ],
    rests: [
      { id: 'neighborhood-drink-1', kind: 'drink', x: -18.5, z: -26, mesh: true }, // a birdbath in a back garden
      { id: 'neighborhood-eat-1', kind: 'eat', x: 7.9, z: -30.5, mesh: true },     // a dish on the peach house's step
      { id: 'neighborhood-nap-1', kind: 'nap', x: 7.9, z: 30, mesh: true },        // the brick house's warm doormat
    ],
    // Under the bushes beside both mouse runs, and the one a squirrel passes.
    hides: [{ x: -4, z: -12 }, { x: 9, z: 22 }, { x: 18, z: 4 }],
    // The shipped dog-yard fence, x 18..26, z -28..-20.
    dogYard: { x: 22, z: -24, r: 4, kennel: { x: 20.3, z: -26.3 } },
    keepSlots: [],
  },

  park: {
    carryables: [
      { id: 'park-stick-1', kind: 'stick', x: -6, z: 32.4 },         // under the north lawn tree
      { id: 'park-stick-2', kind: 'stick', x: 7.2, z: -6.8 },        // under the tree by the pond path
      { id: 'park-pinecone-1', kind: 'pinecone', x: 22.6, z: 22.8 }, // under the east tree
      { id: 'park-acorn-1', kind: 'acorn', x: 16.2, z: -4.4 },       // under the oak past the bend
    ],
    // A picnic left on the bench by the fountain path. It is the only perch in
    // the park every cat can climb that is not already a POI, a gold mouse's
    // or the fountain scenic's — so all three share it, along the seat (top
    // y 0.54). The middle stays clear for the perched cat: the cup at one end,
    // the book and the can at the other. The cup and the book fall off the
    // front of the seat, never back through the backrest; the can off the end.
    knockables: [
      { id: 'park-cup-1', kind: 'cup', x: -4.38, z: 14.32, y: 0.54, fallTo: { x: -3.96, z: 15.21 } },
      { id: 'park-book-1', kind: 'book', x: -3.75, z: 13.68, y: 0.54, fallTo: { x: -3.3, z: 14.6 } },
      { id: 'park-can-1', kind: 'can', x: -3.5, z: 13.68, y: 0.54, fallTo: { x: -2.9, z: 12.8, y: 0.01 } },
    ],
    markables: [
      { id: 'park-tree-1', kind: 'tree', x: -25.65, z: -14, nearBorder: false, mesh: false }, // west oak, east face
      { id: 'park-tree-2', kind: 'tree', x: 8, z: -37.65, nearBorder: false, mesh: false },   // south oak, north face
      { id: 'park-post-1', kind: 'post', x: -33.7, z: 31.4, nearBorder: true, mesh: true },   // on the rival border
    ],
    flaps: [
      // The park's south gate, across the path in from the street.
      { id: 'park-flap-1', kind: 'flap', x: 0, z: 41, rotY: 0, width: 1.0 },
      // The hedge along the quiet meadow's east side.
      { id: 'park-gap-1', kind: 'gap', x: 19, z: -30, rotY: QUARTER, width: 1.2 },
    ],
    rests: [
      { id: 'park-drink-1', kind: 'drink', x: 21, z: 14, mesh: true }, // a birdbath by the east flowerbed
      { id: 'park-eat-1', kind: 'eat', x: 9.5, z: 14, mesh: true },    // picnic leftovers on the lawn
      { id: 'park-nap-1', kind: 'nap', x: 16, z: -36, mesh: true },    // a sunny cushion in the meadow
    ],
    // The bushes on both mouse runs, and the one the west squirrel passes.
    hides: [{ x: -10, z: 26 }, { x: 4, z: -24 }, { x: -20, z: -6 }],
    // The park keeper's dog, on the open east lawn.
    dogYard: { x: 33, z: -18, r: 4, kennel: { x: 35, z: -20 } },
    keepSlots: [],
  },

  seaside: {
    carryables: [
      { id: 'seaside-shell-1', kind: 'shell', x: 23.2, z: 6 },             // at the sand line
      { id: 'seaside-shell-2', kind: 'shell', x: 22.8, z: -3 },            // at the sand line, south
      { id: 'seaside-driftwood-1', kind: 'driftwood', x: 23, z: 26 },      // washed up past the shoreline
      { id: 'seaside-driftwood-2', kind: 'driftwood', x: 23.5, z: -22 },   // washed up on the south beach
    ],
    // A beach picnic left on the north boardwalk bench, along its seat. The
    // bench is the one climbable seaside perch that is not a POI's, a gold
    // mouse's, or behind Sure Claws; staying near x 18 keeps all three 2 m off
    // the POI at (20, 14). The seat's top is y 0.54 and its backrest runs along
    // x 17.75, so they all fall forward, off the seat's front (+x), onto the
    // boardwalk (y 0.03). The middle
    // stays clear for the perched cat: the bucket at one end, the cup and the
    // book at the other.
    knockables: [
      { id: 'seaside-bucket-1', kind: 'bucket', x: 17.95, z: 13.5, y: 0.54, fallTo: { x: 18.95, z: 13.4, y: 0.03 } },
      { id: 'seaside-cup-1', kind: 'cup', x: 17.92, z: 14.4, y: 0.54, fallTo: { x: 18.9, z: 14.3, y: 0.03 } },
      { id: 'seaside-book-1', kind: 'book', x: 18.05, z: 14.59, y: 0.54, fallTo: { x: 18.95, z: 14.85, y: 0.03 } },
    ],
    markables: [
      { id: 'seaside-post-1', kind: 'post', x: 20, z: 30, nearBorder: false, mesh: false },    // the north boardwalk lamp post
      { id: 'seaside-post-2', kind: 'post', x: 23.6, z: -14.5, nearBorder: false, mesh: true }, // an old mooring post at the sand line
      { id: 'seaside-post-3', kind: 'post', x: -28.6, z: 30.3, nearBorder: true, mesh: true },  // on the rival border
    ],
    flaps: [
      // The pier gate, across the deck over the water: the cat flap is the way
      // onto the pier (the sea either side seals it; Sea Legs swims round).
      { id: 'seaside-flap-1', kind: 'flap', x: 26.5, z: -10, rotY: QUARTER, width: 1.0 },
      // A hedge of beach grass on the north dunes.
      { id: 'seaside-gap-1', kind: 'gap', x: -18, z: 26, rotY: Math.PI / 4, width: 1.2 },
    ],
    rests: [
      { id: 'seaside-drink-1', kind: 'drink', x: 17.5, z: 8, mesh: true }, // a water bowl by the boardwalk
      { id: 'seaside-eat-1', kind: 'eat', x: 29, z: -10, mesh: true },     // a fish crate on the pier, past the gate
      { id: 'seaside-nap-1', kind: 'nap', x: 8, z: 34, mesh: true },       // a deckchair cushion on the sand
    ],
    // The grass tufts beside both mouse runs, and the one in the middle.
    hides: [{ x: 12, z: 20 }, { x: -14, z: 30 }, { x: 8, z: 2 }],
    // A beach-hut dog, on the south sand short of the cliff.
    dogYard: { x: -8, z: -25, r: 4, kennel: { x: -10, z: -27 } },
    keepSlots: [],
  },

  docks: {
    carryables: [
      { id: 'docks-rope-1', kind: 'rope', x: -21, z: 6 },     // a coil on the north quay
      { id: 'docks-rope-2', kind: 'rope', x: 25, z: -6.2 },   // a coil on the south quay
      { id: 'docks-cap-1', kind: 'cap', x: -12.5, z: -17.5 }, // a sailor's cap by the crane
      { id: 'docks-glove-1', kind: 'glove', x: 14.5, z: 9.8 }, // a work glove by the warehouse crates
    ],
    knockables: [
      // Somebody's tea, on the crate by the fish market, beside the fish
      // bucket. (It used to sit on a quayside bollard, but a bollard's top is
      // only 0.38 m across, so a perched cat stood right on it.)
      { id: 'docks-cup-1', kind: 'cup', x: 4.3, z: -19.9, y: 1.1, fallTo: { x: 4.9, z: -19.2 } },
      // A fish bucket on the same crate.
      { id: 'docks-bucket-1', kind: 'bucket', x: 3.7, z: -19.9, y: 1.1, fallTo: { x: 3, z: -19 } },
      // A paint can on the crate at the foot of the crane.
      { id: 'docks-can-1', kind: 'can', x: -19.6, z: -17, y: 1.3, fallTo: { x: -19.8, z: -18.3 } },
    ],
    markables: [
      { id: 'docks-bollard-1', kind: 'bollard', x: -30, z: -4.2, nearBorder: true, mesh: false }, // the south quay's west bollard, on the rival border
      { id: 'docks-bollard-2', kind: 'bollard', x: 30, z: 4.2, nearBorder: false, mesh: false },
      { id: 'docks-bollard-3', kind: 'bollard', x: -6, z: 4.2, nearBorder: false, mesh: false },
    ],
    flaps: [
      // A gate halfway over the plank bridge. The main bridge stays open, so
      // the flap is a shortcut and never the only way across.
      { id: 'docks-flap-1', kind: 'flap', x: -24, z: 1.5, rotY: 0, width: 1.0 },
      // Scrub grown up in the yard's north-east corner.
      { id: 'docks-gap-1', kind: 'gap', x: 31, z: 31, rotY: Math.PI / 4, width: 1.2 },
    ],
    rests: [
      { id: 'docks-drink-1', kind: 'drink', x: -6, z: 14.8, mesh: true }, // a water bowl by the grey warehouse
      { id: 'docks-eat-1', kind: 'eat', x: 8.5, z: -27.5, mesh: true },   // a fish crate behind the fish market
      { id: 'docks-nap-1', kind: 'nap', x: 12, z: 26.8, mesh: true },     // the north warehouse's doormat
    ],
    // In the cardboard box on the north quay (in reach of the alley rat and
    // the west mouse alike), among the market barrels, and among the barrels
    // past the west stall.
    hides: [{ x: -19, z: 6.8 }, { x: 11.5, z: -6.2 }, { x: -27.2, z: -20.5 }],
    // The critter dog's old spot, past the big warehouse.
    dogYard: { x: 30, z: 20, r: 4, kennel: { x: 32.5, z: 22 } },
    keepSlots: [],
  },

  den: {
    carryables: [],
    knockables: [],
    markables: [],
    flaps: [],
    // The bowls already on the floor (builder.petBowls at (4.6, 6.6): food on
    // the left, water on the right) and the hearth rug in front of the fire.
    rests: [
      { id: 'den-drink-1', kind: 'drink', x: 4.82, z: 6.6, mesh: false },
      { id: 'den-eat-1', kind: 'eat', x: 4.38, z: 6.6, mesh: false },
      { id: 'den-nap-1', kind: 'nap', x: -5.6, z: 6.4, mesh: false },
    ],
    hides: [],
    dogYard: null,
    // Laid out in front of the fire: four on the hearthstone (its top is
    // y 0.035), centre outwards, then four on the boards just east of it.
    keepSlots: [
      { x: -6.3, z: 7.45, y: 0.035 }, { x: -5.7, z: 7.45, y: 0.035 },
      { x: -6.9, z: 7.45, y: 0.035 }, { x: -5.1, z: 7.45, y: 0.035 },
      { x: -4.3, z: 7.6, y: 0 }, { x: -4.3, z: 6.95, y: 0 },
      { x: -3.7, z: 7.6, y: 0 }, { x: -3.7, z: 6.95, y: 0 },
    ],
  },
};

const deepFreeze = (v) => {
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) deepFreeze(v[k]);
    Object.freeze(v);
  }
  return v;
};
deepFreeze(SETS);

const EMPTY = deepFreeze({
  carryables: [], knockables: [], markables: [], flaps: [], rests: [], hides: [], dogYard: null, keepSlots: [],
});

// propsFor(areaId) -> that area's set, as a fresh deep copy every call (a
// caller may mutate it freely). Own keys only: '__proto__', 'constructor', a
// number or null get the empty set, never a throw.
export function propsFor(areaId) {
  const set = typeof areaId === 'string' && Object.hasOwn(SETS, areaId) ? SETS[areaId] : EMPTY;
  return structuredClone(set);
}

export function allPropIds() {
  const ids = new Set();
  for (const set of Object.values(SETS)) {
    for (const list of [set.carryables, set.knockables, set.markables, set.flaps, set.rests]) {
      for (const p of list) ids.add(p.id);
    }
  }
  return ids;
}

// The frame either side of a flap's opening, as collider circles: r 0.3,
// every 0.45 m from the opening's edge out to the frame's end (total length
// width + 2.4, i.e. 1.2 m of frame a side), so no circle reaches into the
// middle `width`. Six circles for any width. [] for anything that is not a
// flap with a finite position, yaw and width.
const FRAME_R = 0.3;
const FRAME_STEP = 0.45;
const FRAME_SIDE = 1.2;

export function frameColliders(flap) {
  const { x, z, rotY, width } = flap ?? {};
  if (![x, z, rotY, width].every(Number.isFinite) || width < 0) return [];
  const ax = Math.cos(rotY);
  const az = -Math.sin(rotY);
  const half = width / 2;
  const out = [];
  for (let k = 0; FRAME_R + k * FRAME_STEP <= FRAME_SIDE + 1e-9; k++) {
    const s = half + FRAME_R + k * FRAME_STEP;
    out.push({ x: x - ax * s, z: z - az * s, r: FRAME_R }, { x: x + ax * s, z: z + az * s, r: FRAME_R });
  }
  return out;
}
