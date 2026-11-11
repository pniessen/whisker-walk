// Saved outfits: accessory combinations she can put back on with one tap.
//
// An outfit is what the cat wears in each slot, nothing else: not which cat,
// not the place. It lives in the save (state.outfits), so it comes back in a
// later session and travels with a cloud save.
//
//   { id: 'o1'..'o5', wear: { [slot]: accessoryId } }   empty slots left out
//
// Pure helpers only; progression.js owns the save and the three verbs
// (saveOutfit / wearOutfit / deleteOutfit).

export const OUTFIT_MAX = 5;
export const OUTFIT_IDS = Array.from({ length: OUTFIT_MAX }, (_, i) => `o${i + 1}`);
// Every slot a cat wears something in, in the dressing room's order.
export const OUTFIT_SLOTS = ['collar', 'head', 'face', 'neck', 'body', 'back', 'feet'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);

// One outfit's wear map: only real accessories sitting in their own slot.
function sanitizeWear(raw, catalog) {
  const wear = {};
  if (!isObj(raw)) return wear;
  for (const slot of OUTFIT_SLOTS) {
    const id = own(raw, slot);
    if (typeof id === 'string' && Object.hasOwn(catalog.accessories, id) && catalog.accessories[id].slot === slot) wear[slot] = id;
  }
  return wear;
}

// What the cat has on now, as a wear map.
export function wornNow(equipped, catalog) {
  return sanitizeWear(equipped, catalog);
}

export function sameWear(a, b) {
  return OUTFIT_SLOTS.every((slot) => (a?.[slot] ?? null) === (b?.[slot] ?? null));
}

// A save read from disk or the cloud is outside data: at most OUTFIT_MAX
// outfits, known ids once each, real accessories only, no empty outfit and no
// two the same. Owning an item is not checked here (it is at wear time): an
// item traded away and bought back should find its outfit waiting.
export function sanitizeOutfits(raw, catalog) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  const n = Math.min(raw.length, 32);
  for (let i = 0; i < n && out.length < OUTFIT_MAX; i++) {
    const o = raw[i];
    if (!isObj(o)) continue;
    const id = own(o, 'id');
    if (typeof id !== 'string' || !OUTFIT_IDS.includes(id) || seen.has(id)) continue;
    const wear = sanitizeWear(own(o, 'wear'), catalog);
    if (Object.keys(wear).length === 0 || out.some((x) => sameWear(x.wear, wear))) continue;
    seen.add(id);
    out.push({ id, wear });
  }
  return out;
}

// Why (or whether) the look she has on can be saved:
// 'ok' | 'empty' (nothing on) | 'saved' (already one of hers) | 'full'.
export function canSaveOutfit(outfits, wear) {
  if (Object.keys(wear).length === 0) return 'empty';
  if (outfits.some((o) => sameWear(o.wear, wear))) return 'saved';
  if (outfits.length >= OUTFIT_MAX) return 'full';
  return 'ok';
}

// The first id not in use, or null when all are.
export function nextOutfitId(outfits) {
  return OUTFIT_IDS.find((id) => !outfits.some((o) => o.id === id)) ?? null;
}
