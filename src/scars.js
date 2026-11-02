// Scar rules: pure, no THREE, no DOM, no save. A scar is a scratch a cat took
// in a lost fight; it fades over five walks (SCAR_WALKS) and is then gone.
// A list is [{ site, left }], at most two per cat. Imports are leaves only.
import { seedFromCode } from './rng.js';
import { clanCast } from './clancast.js';

export const SCAR_SITES = Object.freeze(['face', 'shoulder', 'back', 'side', 'hind']);
export const SCAR_WALKS = 5;
export const SCARS_MAX = 2;
export const SCARRED_INTRUDERS_MAX = 24;
const STAGES = Object.freeze(['full', 'half', 'faint']);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// R1: full while left >= 3, half at 2..1, faint at 0.
export function stageFor(left) {
  return left >= 3 ? 'full' : left >= 1 ? 'half' : 'faint';
}

// R15: a stable side from the cat's id, so two devices draw the scar alike.
export function scarSide(id) {
  return seedFromCode(typeof id === 'string' ? id : '') & 1 ? 'l' : 'r';
}

export function addScar(list, site) {
  const out = (Array.isArray(list) ? list : []).map((s) => ({ site: s.site, left: s.left }));
  const same = out.findIndex((s) => s.site === site);
  if (same >= 0) {
    out[same].left = SCAR_WALKS;
    return out;
  }
  out.push({ site, left: SCAR_WALKS });
  while (out.length > SCARS_MAX) {
    let drop = 0;
    for (let i = 1; i < out.length; i++) if (out[i].left < out[drop].left) drop = i;
    out.splice(drop, 1);
  }
  return out;
}

export function fadeScars(list) {
  return (Array.isArray(list) ? list : [])
    .map((s) => ({ site: s.site, left: s.left - 1 }))
    .filter((s) => s.left >= 0);
}

export function sanitizeScarList(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.length >= SCARS_MAX) break;
    if (!isObj(e) || typeof e.site !== 'string' || !SCAR_SITES.includes(e.site)) continue;
    if (out.some((s) => s.site === e.site)) continue;
    const n = e.left;
    if (typeof n !== 'number' || !Number.isFinite(n)) continue;
    out.push({ site: e.site, left: Math.min(SCAR_WALKS, Math.max(0, Math.floor(n))) });
  }
  return out;
}

export function isCastId(id) {
  if (typeof id !== 'string') return false;
  const dash = id.lastIndexOf('-');
  if (dash <= 0) return false;
  return clanCast(id.slice(0, dash)).some((m) => m.id === id);
}

export function sanitizeScarredIntruders(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (!isObj(e) || !isCastId(e.id)) continue;
    const scars = sanitizeScarList(e.scars);
    if (scars.length === 0) continue;
    const at = out.findIndex((x) => x.id === e.id);
    if (at >= 0) out.splice(at, 1);
    out.push({ id: e.id, scars });
  }
  return out.slice(-SCARRED_INTRUDERS_MAX);
}

export function renderScars(list, id) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const side = scarSide(id);
  return list.map((s) => ({ site: s.site, stage: stageFor(s.left), side }));
}

// A remote cat's accessories.scars, repaired: at most two, known site and
// stage, side 'l' or 'r', distinct sites. Anything else gives [].
export function wireScars(accessories) {
  try {
    if (!isObj(accessories) || !Object.hasOwn(accessories, 'scars')) return [];
    const raw = accessories.scars;
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const e of raw) {
      if (out.length >= SCARS_MAX) break;
      if (!isObj(e)) continue;
      if (!SCAR_SITES.includes(e.site) || !STAGES.includes(e.stage) || (e.side !== 'l' && e.side !== 'r')) continue;
      if (out.some((s) => s.site === e.site)) continue;
      out.push({ site: e.site, stage: e.stage, side: e.side });
    }
    return out;
  } catch {
    return [];
  }
}
