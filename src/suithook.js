// The suit seam (suit kit M0): the one pure function that says what a cat is
// DRAWN with in a place that has a suit look, and the slot the lazy suit kit
// (src/cat/suitkit.js, imported only by a suit place's chunk) plugs into.
// Nothing here is saved, sold or sent: a suit id is never a catalog id.
export const SUIT_LOOKS = Object.freeze(['space', 'dive']);
const PIECE_RE = /^suit-(helmet|body|pack|boots)-(space|dive)$/;
// The suit look of each place (src/placephysics.js rows arrive with the Reef and the Moon).
const LOOK_OF_PLACE = Object.freeze({ moon: 'space' }); // the walk reads the lazy kit's own copy of this table (src/cat/suitkit.js dress); a test keeps the two equal
const SLOT = Object.freeze({ helmet: 'head', body: 'body', pack: 'back', boots: 'feet' });

// 'suit-helmet-dive' -> { piece: 'helmet', look: 'dive' }, anything else null.
export function suitPiece(id) {
  const m = typeof id === 'string' ? PIECE_RE.exec(id) : null;
  return m ? { piece: m[1], look: m[2] } : null;
}
export const isSuitId = (id) => suitPiece(id) !== null;

// The wear map a cat is drawn with. No look: her own wear, as is. A look: the
// four pieces replace head, body, back and feet and the neck is hidden; Hagrid
// (hen) takes the helmet alone. Her saved wear is never changed.
export function effectiveWear(equipped, place, suitLook, { hen = false } = {}) {
  const look = suitLook ?? LOOK_OF_PLACE[place] ?? null;
  if (!SUIT_LOOKS.includes(look)) return equipped;
  if (hen) return { ...equipped, head: `suit-helmet-${look}` };
  const out = { ...equipped, neck: null };
  for (const [piece, slot] of Object.entries(SLOT)) out[slot] = `suit-${piece}-${look}`;
  return out;
}

// The lazy kit registers its builders here; a suit id with no kit draws nothing.
let kit = null;
export const registerSuitKit = (k) => { kit = k; };
export const suitKit = () => kit;
