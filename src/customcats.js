// Custom cats: the palette, the sanitisers and the bridge to the preset rows.
// DOM-free and THREE-free. Everything read from a save or the wire is repaired
// here, so the rest of the game can trust a Look.

import { validPetName } from './net.js';
import { PERSONALITIES } from './cat/brain.js';

export const CUSTOM_IDS = Object.freeze(['mine1', 'mine2', 'mine3']);
export const CUSTOM_MAX = 3;
export const FALLBACK_NAME = 'My Cat';
export const DEFAULT_PERSONALITY = 'keenNose';

const table = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.freeze(v)])));

export const COATS = table({
  ginger: { hex: 0xc8743a, belly: 0xeac39a, label: 'Ginger' },
  black: { hex: 0x2a2a30, belly: 0x3a3a42, label: 'Black' },
  cream: { hex: 0xf0ead8, belly: 0xf8f4e8, label: 'Cream' },
  brown: { hex: 0x9c7a4f, belly: 0xd8c39a, label: 'Brown tabby' },
  silver: { hex: 0xcfcfd4, belly: 0xe8e8ec, label: 'Silver' },
  seal: { hex: 0xe8dcc8, belly: 0xf2ead9, label: 'Seal cream' },
  bluegrey: { hex: 0x6b6f7a, belly: 0xa9adb6, label: 'Blue-grey' },
  apricot: { hex: 0xe3a86b, belly: 0xf4d4ac, label: 'Apricot' },
});
export const MARKS = table({
  chocolate: { hex: 0x7a3f1c, label: 'Chocolate' },
  black: { hex: 0x1c1c22, label: 'Black' },
  white: { hex: 0xf8f4e8, label: 'White' },
  seal: { hex: 0x4a3b32, label: 'Seal' },
  orange: { hex: 0xd88030, label: 'Orange' },
  grey: { hex: 0x8a8f9a, label: 'Grey' },
});
export const EYES = table({
  green: { hex: 0x4e9440, label: 'Green' },
  gold: { hex: 0xd8b830, label: 'Gold' },
  blue: { hex: 0x68a8d8, label: 'Blue' },
  copper: { hex: 0xc97a2a, label: 'Copper' },
});

const pairs = (a) => Object.freeze(a.map((p) => Object.freeze(p)));
export const PATTERNS = pairs([['solid', 'Solid'], ['stripes', 'Tabby stripes'], ['points', 'Pointed'], ['patches', 'Patches'], ['socks', 'White socks']]);
export const FURS = pairs([['short', 'Short'], ['fluffy', 'Fluffy'], ['long', 'Long-haired']]);
export const PERSONALITY_CHOICES = pairs([['keenNose', 'Keen nose'], ['chaser', 'Chaser'], ['pouncer', 'Pouncer'], ['napper', 'Napper'], ['fearless', 'Fearless'], ['steady', 'Steady']]);
export const CUSTOM_PERSONALITIES = Object.freeze({
  keenNose: 'tabby', chaser: 'siamese', napper: 'persian', fearless: 'black', pouncer: 'calico', steady: 'mainecoon',
});
export const SIZE = Object.freeze({ MIN: 0.85, MAX: 1.15, STEP: 0.05 });
export const TAIL_FLUFF = 1.3;
export const DEFAULT_LOOK = Object.freeze({ coat: 'ginger', marks: 'chocolate', pattern: 'stripes', fur: 'short', eyes: 'green', size: 1 });

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const own = (o, k) => isObj(o) && Object.hasOwn(o, k) ? o[k] : undefined;
const pick = (v, has, fallback) => (typeof v === 'string' && has(v) ? v : fallback);

export function sanitizeLook(raw) {
  const coat = pick(own(raw, 'coat'), (v) => Object.hasOwn(COATS, v), DEFAULT_LOOK.coat);
  const marks = pick(own(raw, 'marks'), (v) => Object.hasOwn(MARKS, v), DEFAULT_LOOK.marks);
  const eyes = pick(own(raw, 'eyes'), (v) => Object.hasOwn(EYES, v), DEFAULT_LOOK.eyes);
  const pattern = pick(own(raw, 'pattern'), (v) => PATTERNS.some((p) => p[0] === v), DEFAULT_LOOK.pattern);
  const fur = pick(own(raw, 'fur'), (v) => FURS.some((p) => p[0] === v), DEFAULT_LOOK.fur);
  const s = own(raw, 'size');
  const size = typeof s === 'number' && Number.isFinite(s)
    ? Math.round(Math.min(SIZE.MAX, Math.max(SIZE.MIN, s)) * 20) / 20
    : DEFAULT_LOOK.size;
  return { coat, marks, pattern, fur, eyes, size };
}

export function sanitizeCustomCats(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  const n = Math.min(raw.length, 32);
  for (let i = 0; i < n && out.length < CUSTOM_MAX; i++) {
    const c = raw[i];
    if (!isObj(c)) continue;
    const id = own(c, 'id');
    if (typeof id !== 'string' || !CUSTOM_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    const name = own(c, 'name');
    const personality = own(c, 'personality');
    out.push({
      id,
      name: validPetName(name) ? name : FALLBACK_NAME,
      personality: typeof personality === 'string' && Object.hasOwn(CUSTOM_PERSONALITIES, personality) ? personality : DEFAULT_PERSONALITY,
      look: sanitizeLook(own(c, 'look')),
    });
  }
  return out;
}

export function presetFor(personality) {
  return typeof personality === 'string' && Object.hasOwn(CUSTOM_PERSONALITIES, personality) ? CUSTOM_PERSONALITIES[personality] : 'tabby';
}

export function lookToStyle(look) {
  const l = sanitizeLook(look);
  const accent = MARKS[l.marks].hex;
  const s = { base: COATS[l.coat].hex, belly: COATS[l.coat].belly, accent, scale: l.size, eyeColor: EYES[l.eyes].hex };
  // A striped cat wears the tabby's letter M on her forehead (model.js, polish-faces).
  if (l.pattern === 'stripes') { s.stripes = true; s.headStripes = 'M'; }
  else if (l.pattern === 'points') s.points = true;
  else if (l.pattern === 'patches') { s.patches = true; s.patch2 = accent; s.headPatch = accent; }
  else if (l.pattern === 'socks') { s.socks = true; s.chin = true; s.bib = true; }
  if (l.fur === 'fluffy') s.fluffy = true;
  else if (l.fur === 'long') { s.fluffy = true; s.tufts = true; s.tailFluff = TAIL_FLUFF; }
  return Object.freeze(s);
}

export function lookKey(look) {
  const l = sanitizeLook(look);
  return JSON.stringify({ coat: l.coat, marks: l.marks, pattern: l.pattern, fur: l.fur, eyes: l.eyes, size: l.size });
}

export function activeCat(state) {
  const eq = state?.equipped;
  const cat = eq?.cat;
  const customId = eq?.custom;
  if (typeof customId === 'string') {
    const c = sanitizeCustomCats(state?.customCats).find((x) => x.id === customId);
    if (c) return { breed: presetFor(c.personality), look: c.look, name: c.name, custom: c.id };
  }
  const breed = typeof cat === 'string' && Object.hasOwn(PERSONALITIES, cat) ? cat : 'tabby';
  return { breed, look: null, name: state?.petName ?? '', custom: null };
}

// The name on her own walk tag: null for a ready-made cat (no tag), else the
// custom cat's name re-checked and clamped.
export function ownTagName(state) {
  const a = activeCat(state);
  if (!a.custom) return null;
  return (validPetName(a.name) ? a.name : FALLBACK_NAME).slice(0, 16);
}

export function wireLook(accessories) {
  const l = own(accessories, 'look');
  return isObj(l) ? sanitizeLook(l) : null;
}

// The key her cat's scars are filed under: the active custom cat's id, else the
// preset breed. Hagrid never scars, so he has no key.
export function scarKey(state) {
  const a = activeCat(state);
  if (a.custom) return a.custom;
  return a.breed === 'hagrid' ? null : a.breed;
}

// `scars` are render entries [{ site, stage, side }]; they ride the wire only
// when there is one, so an unscarred profile is byte-identical to before.
export function catProfileFields(state, scars = []) {
  const a = activeCat(state);
  const eq = state?.equipped ?? {};
  const accessories = {
    collar: eq.collar ?? null, head: eq.head ?? null, face: eq.face ?? null, neck: eq.neck ?? null,
    body: eq.body ?? null, back: eq.back ?? null, feet: eq.feet ?? null,
  };
  if (a.look) accessories.look = a.look;
  if (Array.isArray(scars) && scars.length > 0) accessories.scars = scars;
  return { breed: a.breed, accessories };
}
