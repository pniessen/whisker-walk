// "Log in to my cat", milestone 2: the three-way merge of two saves of one cat.
//
// A cat played on two devices comes back together here. Inputs are this
// device's save (local), the cloud's (cloud) and the last state both agreed on
// (base, a trimmed copy kept by the device; null when there is none). The rule
// is generous, never strict: nothing a child earned or owns is lost. Counters
// that only ever grow become base + both gains (and never less than either
// side); sets are unions; fields that are a choice (what she wears, which map
// way up) follow the side that changed them, or the side saved later when both
// did. Every field of a fresh save has a rule (MERGE_RULES), and a test fails
// when a new field is added without one.
//
// Pure and DOM-free. It is a lazy chunk: nothing at start-up imports it.
// The result goes through sanitizeSave, so the caps of every field hold.

// What the merge needs from the rest of the game (the item catalogue, the save
// cleaner, the colony, usage, marks, outfits and custom-cat helpers) is handed
// in by the caller (cloudsync.js), not imported: this file is a lazy chunk, and
// a lazy chunk that imports several start-up modules makes the bundler split
// the start-up code into more files (about 1 kB gzipped more to download).
let T = null;
export function useSaveTools(t) { T = t; }
const CATALOG = new Proxy({}, { get: (_t, k) => T.CATALOG[k] });
const sanitizeSave = (v) => T.sanitizeSave(v);
const sameWear = (a, b) => T.sameWear(a, b);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Equal as sets: a list of plain values is compared in sorted order (a union's order is not a change).
const sortLists = (_k, v) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? [...v].sort() : v);
const sameSet = (a, b) => JSON.stringify(a, sortLists) === JSON.stringify(b, sortLists);
const union = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
const own = (o, k) => (isObj(o) && Object.hasOwn(o, k) ? o[k] : undefined);
const SLEEPING_MAX = 8;
const content = (c) => JSON.stringify([c.name, c.personality, c.look]);

// A counter that only grows: base + what each side gained, never less than
// either side. With no base, the larger of the two (so history is not counted twice).
function counter(l, c, b) {
  const x = num(l); const y = num(c);
  return typeof b === 'number' && Number.isFinite(b) ? Math.max(x, y, x + y - b) : Math.max(x, y);
}

// The side that changed it; both changed (or no base): the side saved later,
// this device on a tie.
function newer(l, c, b, ctx) {
  if (b !== undefined) {
    if (same(l, b)) return c;
    if (same(c, b)) return l;
  }
  return ctx.cloudNewer ? c : l;
}

const perKey = (l, c, f) => {
  const out = {};
  for (const k of union(Object.keys(isObj(l) ? l : {}), Object.keys(isObj(c) ? c : {}))) {
    out[k] = f(own(l, k), own(c, k), k);
  }
  return out;
};

// Paws: base + both changes (spending is a negative change), the price of an
// item both devices bought since base given back once, never below zero.
function balance(L, C, B) {
  if (!B || typeof B.points !== 'number') return Math.max(num(L.points), num(C.points));
  let p = num(L.points) + num(C.points) - num(B.points);
  for (const [list, table] of [['accessories', CATALOG.accessories], ['cats', CATALOG.cats], ['areas', CATALOG.areas]]) {
    const had = new Set(own(B.unlocked, list) ?? []);
    for (const id of L.unlocked[list]) {
      if (had.has(id) || !C.unlocked[list].includes(id) || !Object.hasOwn(table, id)) continue;
      const price = table[id].price;
      if (typeof price === 'number' && price > 0) p += price;
    }
  }
  return Math.max(0, p);
}

// ---- her own cats and saved outfits: slot by slot ---------------------------

// The cloud keeps a slot both sides filled with different cats; this device's
// cat moves to a free slot, or sleeps. Returns this device's save with its cats
// re-slotted (scars and the worn custom cat follow), and the cats to merge.
function relocateCustom(L, C, B) {
  const cloudBy = new Map(C.customCats.map((x) => [x.id, x]));
  const baseBy = new Map((Array.isArray(B?.customCats) ? B.customCats : []).map((x) => [x.id, x]));
  const slots = T.CUSTOM_IDS.slice(0, L.moreCatSlots || C.moreCatSlots ? T.CUSTOM_MAX : T.CUSTOM_BASE);
  const taken = new Map(); // slot -> cat
  for (const cc of C.customCats) taken.set(cc.id, cc);
  const movers = [];
  for (const lc of L.customCats) {
    const cc = cloudBy.get(lc.id);
    const bc = baseBy.get(lc.id);
    if (!cc) taken.set(lc.id, lc);
    else if (same(cc, lc)) continue;
    else if (bc && same(bc, lc)) continue; // this device never changed it: the cloud's edit is the cat
    else if (bc && same(bc, cc)) taken.set(lc.id, lc); // only this device changed it
    else if (C.customCats.some((x) => content(x) === content(lc))) continue; // the cloud has her already, in another slot
    else movers.push(lc);
  }
  const rename = {};
  const sleepers = [];
  for (const m of movers) {
    const free = slots.find((id) => !taken.has(id));
    if (free) { taken.set(free, { ...m, id: free }); rename[m.id] = free; } else { sleepers.push(m); rename[m.id] = null; }
  }
  const scars = {};
  for (const [k, v] of Object.entries(L.scars)) {
    const to = Object.hasOwn(rename, k) ? rename[k] : k;
    if (to) scars[to] = v;
  }
  const custom = L.equipped.custom;
  const equipped = { ...L.equipped, custom: custom && Object.hasOwn(rename, custom) ? rename[custom] : custom };
  return { L: { ...L, scars, equipped }, taken, sleepers };
}

function mergeOutfits(L, C) {
  const out = [...C.outfits];
  for (const o of L.outfits) {
    if (out.some((x) => sameWear(x.wear, o.wear))) continue;
    const id = out.some((x) => x.id === o.id) ? T.OUTFIT_IDS.find((i) => !out.some((x) => x.id === i)) : o.id;
    if (id) out.push({ ...o, id });
  }
  return out.sort((a, b) => T.OUTFIT_IDS.indexOf(a.id) - T.OUTFIT_IDS.indexOf(b.id));
}

// ---- the rules ---------------------------------------------------------------
// One rule per top-level key of a fresh save. `r` is the merge's working set:
// L, C (cleaned saves, L re-slotted), B (base or null), ctx.
const settled = (a, b, f) => (a === null || a === undefined ? b : b === null || b === undefined ? a : f(a, b));
const FIRST_RANK = ['done', 'old', 'skipped', 'part'];
const laterDate = (a, b) => (a >= b ? a : b);

export const MERGE_RULES = Object.freeze({
  version: (r) => Math.max(num(r.L.version), num(r.C.version)),
  points: (r) => balance(r.L, r.C, r.B),
  walks: (r) => perKey(r.L.walks, r.C.walks, (l, c, k) => counter(l, c, own(r.B?.walks, k))),
  unlocked: (r) => ({
    cats: union(r.L.unlocked.cats, r.C.unlocked.cats),
    accessories: union(r.L.unlocked.accessories, r.C.unlocked.accessories),
    areas: union(r.L.unlocked.areas, r.C.unlocked.areas),
  }),
  equipped: (r) => newer(r.L.equipped, r.C.equipped, r.B?.equipped, r.ctx),
  customCats: (r) => T.CUSTOM_IDS.filter((id) => r.cats.has(id)).map((id) => r.cats.get(id)),
  moreCatSlots: (r) => r.L.moreCatSlots || r.C.moreCatSlots,
  outfits: (r) => mergeOutfits(r.L, r.C),
  usage: (r) => T.mergeUsage(r.L.usage, r.C.usage),
  area: (r) => newer(r.L.area, r.C.area, r.B?.area, r.ctx),
  lifetimePoints: (r) => counter(r.L.lifetimePoints, r.C.lifetimePoints, r.B?.lifetimePoints),
  bestWalk: (r) => Math.max(num(r.L.bestWalk), num(r.C.bestWalk)),
  friends: (r) => perKey(r.L.friends, r.C.friends, (l, c) => settled(l, c, (x, y) => {
    const win = y.greets > x.greets ? y : x;
    return { breed: win.breed, greets: Math.max(x.greets, y.greets), lastWalk: settled(x.lastWalk, y.lastWalk, laterDate) };
  })),
  petName: (r) => settled(r.L.petName, r.C.petName, (l, c) => (l === c ? l : newer(l, c, r.B?.petName, r.ctx))),
  journal: (r) => perKey(r.L.journal, r.C.journal, (l, c) => Math.max(num(l), num(c))),
  golden: (r) => union(r.L.golden, r.C.golden),
  streak: (r) => {
    const l = r.L.streak; const c = r.C.streak;
    if (l.last !== c.last) return (l.last ?? '') > (c.last ?? '') ? l : c;
    return l.count >= c.count ? l : c;
  },
  kitten: (r) => ({ stage: Math.max(num(r.L.kitten.stage), num(r.C.kitten.stage)) }),
  race: (r) => {
    const l = r.L.race; const c = r.C.race;
    if (l.date !== c.date) return (l.date ?? '') > (c.date ?? '') ? l : c;
    if (l.bestMs === null || c.bestMs === null) return l.bestMs === null ? c : l;
    return l.bestMs <= c.bestMs ? l : c;
  },
  // The Moon: the story only moves on (step max), cells and star pictures are unions of bits, the stamp is the side that
  // changed it (a set one beats none), each cat's best jump is the longer one.
  moon: (r) => {
    const l = r.L.moon; const c = r.C.moon;
    return {
      step: Math.max(l.step, c.step), cells: l.cells | c.cells, scope: l.scope | c.scope,
      stamp: l.stamp < 0 || l.stamp === c.stamp ? c.stamp : c.stamp < 0 ? l.stamp : newer(l.stamp, c.stamp, r.B?.moon?.stamp, r.ctx),
      jump: perKey(l.jump, c.jump, (x, y) => Math.max(num(x), num(y))), relay: l.relay | c.relay, // (the sanitiser fills the bits the station's rules imply)
    };
  },
  // The Reef: the story only moves on (step max), shells and album postcards are unions of bits (the sanitiser then makes the shells
  // at least what the step implies).
  // The Sealab and galleon bitmasks (lab, wreck) are OR-ed too; the sanitiser then fills the bits their rules imply.
  reef: (r) => ({
    step: Math.max(r.L.reef.step, r.C.reef.step), shells: r.L.reef.shells | r.C.reef.shells, album: r.L.reef.album | r.C.reef.album,
    lab: r.L.reef.lab | r.C.reef.lab, wreck: r.L.reef.wreck | r.C.reef.wreck,
  }),
  // The Crystal Cave: the story only moves on (step max), spark stones, rubbings, forge ingredients and tunes are unions of bits (the sanitiser fills the bits the circlet implies).
  crystal: (r) => ({
    step: Math.max(r.L.crystal.step, r.C.crystal.step), sparks: r.L.crystal.sparks | r.C.crystal.sparks, album: r.L.crystal.album | r.C.crystal.album,
    forge: r.L.crystal.forge | r.C.crystal.forge, songs: r.L.crystal.songs | r.C.crystal.songs,
  }),
  // Snowville: the story only moves on (step max), the candles and the album are unions of bits (the sanitiser fills the candles the step implies).
  snowville: (r) => ({ step: Math.max(r.L.snowville.step, r.C.snowville.step), candles: r.L.snowville.candles | r.C.snowville.candles, album: r.L.snowville.album | r.C.snowville.album }),
  // The Treehouse: the story only moves on (step max), the letters and the album are unions of bits (the sanitiser fills the letters the step implies).
  treehouse: (r) => ({ step: Math.max(r.L.treehouse.step, r.C.treehouse.step), letters: r.L.treehouse.letters | r.C.treehouse.letters, album: r.L.treehouse.album | r.C.treehouse.album }),
  // The Jungle: the story only moves on (step max), the fruit and the album are unions of bits (the sanitiser fills the fruit the step implies).
  jungle: (r) => ({ step: Math.max(r.L.jungle.step, r.C.jungle.step), fruit: r.L.jungle.fruit | r.C.jungle.fruit, album: r.L.jungle.album | r.C.jungle.album }),
  den: (r) => ({
    owned: union(r.L.den.owned, r.C.den.owned),
    placed: newer(r.L.den.placed, r.C.den.placed, r.B?.den?.placed, r.ctx),
  }),
  skills: (r) => union(r.L.skills, r.C.skills),
  feats: (r) => perKey(r.L.feats, r.C.feats, (l, c) => Math.max(num(l), num(c))),
  duskWalks: (r) => counter(r.L.duskWalks, r.C.duskWalks, r.B?.duskWalks),
  gifts: (r) => {
    const out = [...r.L.gifts];
    for (const g of r.C.gifts) if (!out.some((x) => x.area === g.area && x.spot === g.spot)) out.push(g);
    return out;
  },
  grudges: (r) => union(r.L.grudges, r.C.grudges),
  colony: (r) => {
    const known = new Set(Object.keys(CATALOG.accessories));
    const m = T.mergeColony(r.L.colony, r.C.colony, { knownItems: known });
    return {
      ...m,
      id: r.L.colony.id ?? m.id,
      partner: r.L.colony.partner ?? m.partner,
      tradesApplied: union(r.L.colony.tradesApplied, r.C.colony.tradesApplied),
      rewarded: union(r.L.colony.rewarded, r.C.colony.rewarded),
    };
  },
  // A role moves only to a strictly earlier pick: applyMerged settles them
  // against the merged colony. Here a set verdict is kept, this device's first.
  clanRoles: (r) => perKey(r.L.clanRoles, r.C.clanRoles, (l, c) => l ?? c ?? null),
  clan: (r) => {
    const l = r.L.clan; const c = r.C.clan;
    const pick = l.name === null ? c : c.name === null || l.name === c.name ? l : newer(l, c, r.B?.clan, r.ctx);
    return { ...pick, adopted: pick.name !== null && (l.adopted || c.adopted) && (l.name === c.name || pick.adopted) };
  },
  marks: (r) => {
    const out = {};
    for (const a of T.MARK_AREAS) out[a] = [...(r.C.marks[a] ?? []), ...(r.L.marks[a] ?? [])];
    return T.sanitizeMarks(out);
  },
  retired: (r) => union(r.L.retired, r.C.retired),
  redeemed: (r) => union(r.L.redeemed, r.C.redeemed), // a union, so a gift code cannot be used twice
  visits: (r) => counter(r.L.visits, r.C.visits, r.B?.visits),
  visitPrizesSeen: (r) => counter(r.L.visitPrizesSeen, r.C.visitPrizesSeen, r.B?.visitPrizesSeen),
  visitPrizePending: (r) => settled(r.L.visitPrizePending, r.C.visitPrizePending, (l, c) => (l === c ? l : newer(l, c, r.B?.visitPrizePending, r.ctx))),
  mapMode: (r) => newer(r.L.mapMode, r.C.mapMode, r.B?.mapMode, r.ctx),
  edition: (r) => newer(r.L.edition, r.C.edition, r.B?.edition, r.ctx),
  clanPick: (r) => {
    const l = r.L.clanPick; const c = r.C.clanPick;
    const pair = l.partnerId && c.partnerId && l.partnerId !== c.partnerId ? newer(l, c, r.B?.clanPick, r.ctx) : (l.partnerId ? l : c.partnerId ? c : l);
    return {
      mine: settled(l.mine, c.mine, (x, y) => (x === y ? x : newer(x, y, r.B?.clanPick?.mine, r.ctx))),
      partner: pair.partner, partnerId: pair.partnerId,
    };
  },
  keptOffers: (r) => union(r.L.keptOffers, r.C.keptOffers),
  tutorial: (r) => {
    const l = r.L.tutorial; const c = r.C.tutorial;
    const rank = (v) => (v === null || v === undefined ? 99 : FIRST_RANK.indexOf(v));
    const out = {
      first: rank(l.first) <= rank(c.first) ? l.first : c.first,
      camp: l.camp || c.camp,
      hints: perKey(l.hints, c.hints, (x, y) => Math.max(num(x), num(y))),
      told: num(l.told.visits) >= num(c.told.visits) ? l.told : c.told,
    };
    const guide = l.guide ?? c.guide;
    if (guide) out.guide = guide;
    if (l.gift || c.gift) out.gift = true;
    return out;
  },
  fightsWon: (r) => counter(r.L.fightsWon, r.C.fightsWon, r.B?.fightsWon),
  fightMoves: (r) => union(r.L.fightMoves, r.C.fightMoves),
  scars: (r) => perKey(r.L.scars, r.C.scars, (l, c) => {
    const x = l ?? []; const y = c ?? [];
    const sum = (a) => a.reduce((n, s) => n + s.left, 0);
    return x.length !== y.length ? (x.length > y.length ? x : y) : (sum(x) >= sum(y) ? x : y);
  }),
  scarredIntruders: (r) => union(r.L.scarredIntruders, r.C.scarredIntruders),
  foundWear: (r) => union(r.L.foundWear, r.C.foundWear),
  events: (r) => union(r.L.events, r.C.events),
  sleepingCats: (r) => r.sleeping,
});

// The saved keys the merge needs a base for: counters and choices.
// (Object keys, not strings: the word tests read string literals, and `clan` is a key here.)
const BASE_WANTED = {
  points: 1, walks: 1, unlocked: 1, equipped: 1, customCats: 1, area: 1, lifetimePoints: 1, petName: 1, den: 1,
  duskWalks: 1, moon: 1, reef: 1, crystal: 1, snowville: 1, treehouse: 1, jungle: 1, clan: 1, visits: 1, visitPrizesSeen: 1, visitPrizePending: 1, mapMode: 1, edition: 1, clanPick: 1, fightsWon: 1,
};
export const BASE_KEYS = Object.freeze(Object.keys(BASE_WANTED));

/** trimBase(save) -> the small copy a device keeps of the save at its last sync. */
export function trimBase(save) {
  const out = {};
  const s = isObj(save) ? save : {};
  for (const k of BASE_KEYS) if (Object.hasOwn(s, k)) out[k] = JSON.parse(JSON.stringify(s[k]));
  return out;
}

/**
 * mergeSaves({ local, cloud, base, now, localAt, cloudAt }) -> { save, changed }
 *   changed.local  the merged save differs from this device's
 *   changed.cloud  the merged save differs from the cloud's (it must be pushed)
 * `localAt` / `cloudAt` (ms) say which side was saved later, for choices both
 * sides changed; `localAt` defaults to `now` and `cloudAt` to 0, so this device
 * wins a tie.
 */
export function mergeSaves({ local, cloud, base = null, now = Date.now(), localAt = now, cloudAt = 0 } = {}) {
  const L0 = sanitizeSave(local);
  const C = sanitizeSave(cloud);
  const B = isObj(base) ? base : null;
  const { L, taken, sleepers } = relocateCustom(L0, C, B);
  const cats = taken;
  // sleeping cats: both sides', plus any that found no slot; one wakes into a free slot
  const slots = T.CUSTOM_IDS.slice(0, L.moreCatSlots || C.moreCatSlots ? T.CUSTOM_MAX : T.CUSTOM_BASE);
  const sleeping = [];
  for (const s of [...L.sleepingCats, ...C.sleepingCats, ...sleepers]) {
    if ([...cats.values()].some((c) => content(c) === content(s)) || sleeping.some((x) => content(x) === content(s))) continue;
    const free = slots.find((id) => !cats.has(id));
    if (free) cats.set(free, { ...s, id: free }); else sleeping.push(s);
  }
  const r = { L, C, B, ctx: { cloudNewer: cloudAt > localAt }, cats, sleeping: sleeping.slice(0, SLEEPING_MAX) };
  const out = {};
  for (const key of Object.keys(MERGE_RULES)) out[key] = MERGE_RULES[key](r);
  const save = sanitizeSave(out);
  return { save, changed: { local: !sameSet(save, L0), cloud: !sameSet(save, C) } };
}
