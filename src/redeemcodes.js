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
  'c815946dbad011c1e6dbe2390159acaa6fdecd8bb655f6caea6b1798bdb59599': { label: "2.0 surprise: the 5th grader", points: 150, accessories: ["glow"], cats: [] },
  '0b867d9aa94a7c9f13b4735b5fb1cabfa138abdea26690111567e1dd615479a8': { label: "2.0 surprise: the 3rd grader", points: 150, accessories: ["cape"], cats: [] },
};
