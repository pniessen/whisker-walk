// Redeem code table (v21 §10.4). Keys are hashes (64 lowercase hex) of
// normalised codes, made with the script; plain codes never live in a file.
//
// export const REDEEM_CODES = {
//   // label is the owner's private note; it ships, so never put the code in it.
//   '<64 hex>': { label: 'Halloween 2026', points: 50, accessories: ['wizard'], cats: [] },
//   // areas (optional) unlocks an area outright, skipping its walk and price gates:
//   '<64 hex>': { label: 'Open the Docks', points: 0, accessories: [], cats: [], areas: ['docks'] },
//   // events (optional) switch on a gift event (src/giftevents.js); confetti
//   // (optional) is a one-time burst on home when it is opened:
//   '<64 hex>': { label: 'Birthday', points: 50, accessories: ['partyhat'], cats: [], events: ['bday-2026-11-21'] },
// };

export const REDEEM_CODES = {
  '77cba3f680fe2e4fffed131671d9b7f36f9bd7b2d6334f692eb0407f2f79b59f': { label: "Welcome gift", points: 25, accessories: ["beanie"], cats: [] },
  'f3d416fa7f98d49ac9bcb4704017862e94277f1230687da3e4c0b84f05479482': { label: "Owner: unlock the Docks for the perf test", points: 350, accessories: [], cats: [] },
  '22d09640ad774eaadef9f8f8902b593387e9e0cb287e9be076d049444cc1b4f4': { label: "Owner: open the Docks directly", points: 0, accessories: [], cats: [], areas: ["docks"] },
  // The birthday (2026-11-21): hers switches on the party (src/giftevents.js);
  // his gives the party hat and one confetti burst.
  '3be6a645c28d0ee8920718c5175950d6284937d7d9154f700a149b3928571ca0': { label: "Birthday 2026-11 (her)", points: 50, accessories: ["partyhat", "bdayrosette", "bdayballoon", "cakecharm"], cats: [], events: ["bday-2026-11-21"] },
  'bf57573848f85c67e300e7ef12f13208c96721e512b7d1fe98d5ff65655202e4': { label: "Birthday 2026-11 (brother)", points: 0, accessories: ["partyhat"], cats: [], confetti: true },
  // A spare for her, in case the first won't open: the same reward exactly.
  '75e4683e398e00d2e9e9c0d93fae4d8f5ea230be400cafe1a584f5353748d243': { label: "Birthday 2026-11 (her, spare)", points: 50, accessories: ["partyhat", "bdayrosette", "bdayballoon", "cakecharm"], cats: [], events: ["bday-2026-11-21"] },
};
