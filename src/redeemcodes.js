// Redeem code table (v21 §10.4). Keys are hashes (64 lowercase hex) of
// normalised codes, made with the script; plain codes never live in a file.
//
// export const REDEEM_CODES = {
//   // label is the owner's private note; it ships, so never put the code in it.
//   '<64 hex>': { label: 'Halloween 2026', points: 50, accessories: ['wizard'], cats: [] },
//   // areas (optional) unlocks an area outright, skipping its walk and price gates:
//   '<64 hex>': { label: 'Open the Docks', points: 0, accessories: [], cats: [], areas: ['docks'] },
// };

export const REDEEM_CODES = {
  '77cba3f680fe2e4fffed131671d9b7f36f9bd7b2d6334f692eb0407f2f79b59f': { label: "Welcome gift", points: 25, accessories: ["beanie"], cats: [] },
  'f3d416fa7f98d49ac9bcb4704017862e94277f1230687da3e4c0b84f05479482': { label: "Owner: unlock the Docks for the perf test", points: 350, accessories: [], cats: [] },
  '22d09640ad774eaadef9f8f8902b593387e9e0cb287e9be076d049444cc1b4f4': { label: "Owner: open the Docks directly", points: 0, accessories: [], cats: [], areas: ["docks"] },
};
