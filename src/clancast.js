// The clan cast: who lives in each territory's camp. Pure data, DERIVED and
// never stored; it draws from no shared stream (walkRng, the strays' stream),
// only from its own seeds, `${clanId}|cast|${slot}` for the name and
// `${clanId}|coat|${slot}` for the coat, so every device computes the same cast.
//
// The slot order is fixed: slots 0-8 are the core clan (the LOW cast), 9-15 make
// the camp busier on HIGH, so a device shows a prefix and two devices on
// different tiers agree on every cat both show. Part 2's raiders are slots 4-6
// of a neighbour clan (RAIDER_SLOTS), present on every tier. Do not reorder.
//
// Imports are leaves only (structural test): nothing from progression, colony,
// discoveries, enemies or net, so a clan cat can never be fed, tamed or grudged.
import { isClanId, clanName, TRUCE_AREAS } from './clanhomes.js';
import { DISCS } from './rivalclans.js';
import { CLAN_CAT_PREFIXES, WARRIOR_SUFFIXES, RANK_SUFFIX, RANK_KEYS, RANK_WORDS, DENIED_NAMES } from './clanwords.js';
import { seedFromCode } from './rng.js';

const K = RANK_KEYS;
export const CAST_RANKS = Object.freeze([
  K.leader, K.elder, K.kit, K.kit, K.warrior, K.warrior, K.warrior, K.apprentice, K.apprentice,
  K.deputy, K.elder, K.kit, K.kit, K.warrior, K.warrior, K.apprentice,
]);
export const CAST_CORE = 9;
export const CAST_HIGH = 16;
export const INTRUDER_SLOTS = 1;
export const MIN_LONERS_HIGH = 5;
export const RAIDER_SLOTS = Object.freeze([4, 5, 6]);

export const RANK_SCALE = Object.freeze({
  [K.leader]: 0.95, [K.deputy]: 0.9, [K.elder]: 0.85, [K.warrior]: 0.85, [K.apprentice]: 0.72, [K.kit]: 0.5,
});

// Camp-marker colours, one per clan, readable on the map's land colours.
export const CLAN_COLOURS = Object.freeze({
  woods: '#3f7d3a', moor: '#9a6aa8', river: '#2f7fa8', pines: '#35584a',
});

// A STYLE row plus `eyes`, the preset breed whose eye colour it borrows.
const coat = (eyes, base, belly, accent, extra = {}) => Object.freeze({ eyes, base, belly, accent, scale: 1, ...extra });
const rows = (...r) => Object.freeze(r);
export const CLAN_COATS = Object.freeze({
  // StormClan: browns and tabbies.
  woods: rows(
    coat('tabby', 0x8a6a45, 0xd2b98e, 0x5a4129, { stripes: true, headStripes: true }),
    coat('tabby', 0x6b4f33, 0xb99a72, 0x3e2c1c, { stripes: true }),
    coat('tabby', 0xa0703f, 0xe0c49a, 0x6d4622, { stripes: true, headStripes: true }),
    coat('tabby', 0x7a5b3a, 0xf2efe8, 0x4a3522, { stripes: true, whiteLegs: true }),
    coat('tabby', 0x7b4a2a, 0xc79a70, 0x55311b, { chin: true }),
  ),
  // GaleClan: light greys and creams.
  moor: rows(
    coat('tabby', 0xc8c4bc, 0xeeeceb, 0x9a968e),
    coat('tabby', 0xe6d6b4, 0xf6efdc, 0xc8b58e),
    coat('tabby', 0xc4bcac, 0xebe6dc, 0x8a8274, { stripes: true }),
    coat('tabby', 0xdcc49a, 0xf4ead2, 0xb39468, { stripes: true }),
    coat('tabby', 0xbcb6aa, 0xf5f5f2, 0x8e887c, { whiteLegs: true, chin: true }),
  ),
  // BrookClan: grey-blues and silvers.
  river: rows(
    coat('siamese', 0x6f7d8c, 0xb7c0ca, 0x4e5966),
    coat('siamese', 0x7c94b8, 0xd6e0ec, 0x4a5c78, { stripes: true, headStripes: true }),
    coat('siamese', 0x5b6878, 0x9aa6b4, 0x3d4652),
    coat('siamese', 0x7a8ca4, 0xf2f4f6, 0x55667c, { socks: true, chin: true }),
    coat('siamese', 0x8ca6c8, 0xdbe5f0, 0x647c9c, { fluffy: true }),
  ),
  // DuskClan: blacks and dark tortoiseshells.
  pines: rows(
    coat('black', 0x26262c, 0x34343c, 0x18181c),
    coat('black', 0x2e2622, 0x4a3a30, 0x9c5a2c, { patch2: 0x1a1410, patches: true }),
    coat('black', 0x33333a, 0x4a4a52, 0x202026, { fluffy: true }),
    coat('black', 0x3a2c24, 0x54443a, 0xb0682e, { patch2: 0x241a14, patches: true }),
    coat('black', 0x222228, 0x3a3a42, 0x141418, { socks: true }),
  ),
});

const hasCast = (id) => isClanId(id) && Object.hasOwn(CLAN_CAT_PREFIXES, id) && Object.hasOwn(CLAN_COATS, id);

// A warrior-rung name: the suffix is hashed, then stepped past a doubled letter
// at the join (Peat + tail) or a book name (Mint + fur).
function warriorName(prefix, clanId, slot) {
  const n = WARRIOR_SUFFIXES.length;
  let i = seedFromCode(`${clanId}|cast|${slot}`) % n;
  for (let tries = 0; tries < n; tries++, i = (i + 1) % n) {
    const suffix = WARRIOR_SUFFIXES[i];
    if (prefix.at(-1).toLowerCase() === suffix[0]) continue;
    if (DENIED_NAMES.has(prefix + suffix)) continue;
    return prefix + suffix;
  }
  return prefix + WARRIOR_SUFFIXES[0]; // unreachable with the shipped words (a test pins it)
}

function nameFor(clanId, slot, rank) {
  const prefix = CLAN_CAT_PREFIXES[clanId][slot];
  if (rank === K.kit) return prefix + RANK_SUFFIX.kit;
  if (rank === K.apprentice) return prefix + RANK_SUFFIX.apprentice;
  if (rank === K.leader) return prefix + RANK_SUFFIX.leader;
  return warriorName(prefix, clanId, slot);
}

const CAST_CACHE = new Map();
const NONE = Object.freeze([]);

export function clanCast(clanId) {
  if (!hasCast(clanId)) return NONE;
  let cast = CAST_CACHE.get(clanId);
  if (!cast) {
    const palette = CLAN_COATS[clanId];
    cast = Object.freeze(CAST_RANKS.map((rank, slot) => {
      const style = palette[seedFromCode(`${clanId}|coat|${slot}`) % palette.length];
      const name = nameFor(clanId, slot, rank); // never a stray's name (a test pins it)
      return Object.freeze({ id: `${clanId}-${slot}`, clan: clanId, slot, rank, name, breed: style.eyes, style });
    }));
    CAST_CACHE.set(clanId, cast);
  }
  return cast;
}

// The cast of the camp in this territory: all sixteen, or none (old areas, the
// island, a clan with no camp disc yet). The walk shows a prefix (clanCountFor).
export function castFor(areaId) {
  if (!isClanId(areaId) || TRUCE_AREAS.includes(areaId) || !Object.hasOwn(DISCS, areaId)) return NONE;
  return clanCast(areaId);
}

// How many of the cast the walk shows: the core nine on LOW; sixteen on HIGH,
// giving the extra slots back one for one to fed colony cats beyond five.
export function clanCountFor(tierStrays, fedHere = 0) {
  if (!(tierStrays >= CAST_HIGH + INTRUDER_SLOTS + MIN_LONERS_HIGH)) return CAST_CORE;
  const fed = Number.isFinite(fedHere) ? fedHere : 0;
  return Math.min(CAST_HIGH, Math.max(CAST_CORE, CAST_HIGH - Math.max(0, fed - MIN_LONERS_HIGH)));
}

// Ordinary strays left after the clan and the intruder slot: tierStrays itself
// where the area has no camp, so the old areas and the den are unchanged.
export function lonersFor(areaId, tierStrays, fedHere = 0) {
  if (castFor(areaId).length === 0) return tierStrays;
  return Math.max(0, tierStrays - clanCountFor(tierStrays, fedHere) - INTRUDER_SLOTS);
}

// At home: Clan Edition, and the territory's clan is your pick or your sibling's.
export function clanHomeFor(areaId, edition, picks) {
  return edition !== 'legacy' && castFor(areaId).length > 0 && Array.isArray(picks) && picks.includes(areaId);
}

export function tagSubFor(member) {
  return `${RANK_WORDS[member.rank]} of ${clanName(member.clan)}`;
}
