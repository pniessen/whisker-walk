import * as THREE from 'three';

// Shared name-tag sprite builder for stray cats, ghost visitors and remote
// (co-walk) pets.
//
// v20 "Ruffled Fur" adds a second mood: a stray that bears a grudge wears a
// dusky-red tag instead of the neutral one. Everything about that is opt-in —
// `makeNameTag(name)` with no opts paints exactly the pixels it painted
// before this wave, because remote pets and the named family pets must be
// entirely unaffected (spec D2).

// --- Canvas geometry --------------------------------------------------
// Unchanged from the original single-mood tag: a 256x64 canvas with one
// rounded pill inset in it, sprite-scaled to 1.4 x 0.35 world units. The
// cross mood repaints INSIDE these same bounds — it never resizes the canvas
// or the sprite, so a tag that changes mood mid-walk does not jump in size.
const TAG_W = 256;
const TAG_H = 64;
const PILL = { x: 28, y: 8, w: 200, h: 48, r: 22 };
// v21 3b: a legendary cat's pill runs nearly the canvas's full width (same
// canvas, same sprite, so nothing resizes), leaving room for the drawn star
// beside names as long as 'Professor Whiskers' without shrinking them further.
const PILL_LEGEND = { x: 4, y: 8, w: 248, h: 48, r: 22 };
// The label is centred on the canvas and baselined at 42px — a 34px bold cap
// height sits visually centred in a pill spanning y 8..56 at that baseline.
// Kept as constants rather than folded into the shrink loop so the default
// mood's draw calls stay byte-for-byte what they always were.
const LABEL_X = TAG_W / 2;
const LABEL_BASELINE = 42;
const BASE_FONT_PX = 34;
// A cross label is the name PLUS an emoji, so it can overflow a pill sized
// for the name alone. Shrink to fit, but never below MIN_FONT_PX — this game
// is played on phones and an unreadable tag is worse than a clipped one.
const MIN_FONT_PX = 24;
const FONT_STEP_PX = 2;
const LABEL_PAD_PX = 10; // breathing room inside the pill, each side

const font = (px) => `bold ${px}px Avenir, sans-serif`;

// --- Colours ----------------------------------------------------------
const PILL_NEUTRAL = 'rgba(20,26,38,0.7)';
// Dusky red, not fire-engine red: this is a sulking cat in a cosy game, not
// a warning label. Slightly MORE opaque than the neutral pill (0.82 vs 0.7)
// because a cross tag has to read from roughly three times the distance (see
// CROSS_NAME_TAG_RANGE) and a translucent pill loses its hue against a bright
// pavement long before the text becomes illegible.
const PILL_CROSS = 'rgba(96,26,32,0.82)';
// The hostile outline. This exists for the emoji-degradation case below and
// is drawn with pure canvas geometry, so no font can take it away.
const PILL_CROSS_EDGE = 'rgba(232,126,116,0.95)';
const PILL_CROSS_EDGE_PX = 3;
const LABEL_COLOR = '#fff';

// The cross marker. Canvas emoji rendering is entirely font-dependent — a
// device whose font stack has no colour-emoji face for U+1F63E draws tofu
// (□) or nothing at all, and we cannot feature-detect that from script.
//
// So the emoji is deliberately the LEAST load-bearing of three cues, and the
// other two are font-independent:
//   1. the dusky-red pill fill, and
//   2. the lighter red stroked outline around it.
// Colour alone carries "this cat is cross with you" — as it must, since it
// is also the only cue that survives at the distance the tag first appears
// at, long before any glyph is legible. Where the glyph does render it adds
// the specific reading ("cross", not merely "flagged"). A tofu box in its
// place still sits inside a red-outlined red pill and still reads hostile;
// the pill is sized by measuring the real label, so tofu (which is narrower
// than the emoji) can only ever leave the label roomier, never clipped.
const CROSS_MARK = '\u{1F63E}'; // 😾 pouting cat face

// v21 3b — the legend mood (ruling R41): a legendary stray's tag carries a
// gold five-pointed star before its name. DRAWN with canvas paths, not typed:
// a ✨ glyph at tag size came out as a tiny white "+" on phones, and like the
// cross emoji above it is at the font stack's mercy. A path is the same on
// every device. Gold fill with a dark edge so it reads on the dark pill.
// Off by default: every other tag paints exactly what it always did.
const STAR_FILL = '#ffc93c';
const STAR_EDGE = 'rgba(90,56,0,0.9)';
const STAR_EDGE_PX = 2;
// Trimmed from 0.95 / 0.22 after the 375 px eye-check: at the 24 px floor the
// longest legendary name, 'Professor Whiskers' (~214 px in Avenir Heavy), plus
// the star ran to within ~3 px of the pill's edge and touched its gold stroke.
// At 0.8 / 0.15 the run is ~236 px and clears the edge by ~6 px a side.
const STAR_SIZE_EM = 0.8;    // the star's width, in units of the font size
const STAR_GAP_EM = 0.15;    // space between star and name
const STAR_INNER = 0.45;     // inner radius as a fraction of the outer

function drawStar(ctx, cx, cy, r) {
  if (typeof ctx.moveTo !== 'function' || typeof ctx.lineTo !== 'function') return;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const rad = k % 2 === 0 ? r : r * STAR_INNER;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  if (ctx.closePath) ctx.closePath();
  ctx.fillStyle = STAR_FILL;
  ctx.fill();
  if (ctx.stroke) {
    ctx.strokeStyle = STAR_EDGE;
    ctx.lineWidth = STAR_EDGE_PX;
    ctx.stroke();
  }
}

// --- Reveal ranges ----------------------------------------------------
// Distance in world units at which a stray's tag switches on. The reveal
// itself lives in the caller (straycats.js's update loop); what lives here
// is the number, because it is a property of the tag's mood.
//
// Callers should read `tag.userData.revealRange` rather than branching on
// the mood themselves — setNameTagMood keeps it in step, so the reveal
// widens and narrows automatically as a grudge is taken and cleared.
export const NAME_TAG_RANGE = 4; // unchanged: the pre-v20 proximity reveal
// Roughly three times as far. A grudge tag has two jobs that pull the same
// way (spec §4a): letting the player give a swatting cat a wide berth, and
// letting them FIND the cat they want to make up with. The second is the
// whole point of the feature, so this has to be a "spot it across the park"
// distance, not a "notice it as you arrive" one. Not larger than this,
// though: with ~1 cross cat per walk among 22 strays the map should still
// take some crossing, and a tag legible from anywhere would flatten the
// search into a glance.
export const CROSS_NAME_TAG_RANGE = 12;

// --- Tag height -------------------------------------------------------
// How high above the cat the tag floats, in the cat group's local units.
//
// TAG_Y is the shipped value and is what every neutral tag keeps.
//
// CROSS_TAG_Y exists because of a collision found by looking at the thing
// rather than by testing it: the 'cross' pose (animator.js) raises the tail
// straight up into a bottlebrush, and at the stray's 0.85 scale the tail tip
// reaches world y ~0.83 — squarely inside the tag sprite's band, which at
// TAG_Y spans roughly 0.72 to 1.07. The tail drew straight through the label,
// and did so from BEHIND the cat, which is the angle a player chasing one
// spends nearly all their time at.
//
// That is the worst possible thing to obscure: the whole reason a cross tag
// reveals at CROSS_NAME_TAG_RANGE is so it can be read from across the park.
// 1.32 puts the sprite's lower edge above the raised tail with room left for
// the lash, and was measured against the real rig, not estimated.
//
// Raising the tail instead was rejected: the raised tail IS the pose. Raising
// EVERY tag was rejected too — it would change how remote co-walk pets and
// ghost visitors look, which spec D2 says this wave must not touch.
//
// The tag does shift when a cat turns cross and settles back when forgiven.
// That is deliberate: it happens on the same frame as the colour repaint, so
// it reads as one change of mood rather than as a glitch.
export const TAG_Y = 1.05;
export const CROSS_TAG_Y = 1.32;

// Paints one mood into an existing 2D context. Used both by makeNameTag (on
// a fresh canvas) and by setNameTagMood (over a painted one) — one painter,
// so a repainted tag is pixel-identical to a freshly built one of the same
// mood. That matters for reconciliation: a forgiven cat must look exactly
// like a cat that was never cross, not merely similar.
function paintTag(ctx, name, cross, legend = false) {
  // Mandatory on the repaint path and harmless on the build path: both pill
  // fills are translucent, so without clearing, the OLD label bleeds through
  // the new pill.
  if (ctx.clearRect) ctx.clearRect(0, 0, TAG_W, TAG_H);

  const label = cross ? `${CROSS_MARK} ${name}` : `${name}`;
  // The legend star's share of the width, at font size `p` (0 off the mood).
  const starRoom = (p) => (legend ? p * (STAR_SIZE_EM + STAR_GAP_EM) : 0);
  let px = BASE_FONT_PX;
  ctx.font = font(px);
  // Shrink to fit, on BOTH moods.
  //
  // This originally measured only the cross label, on the reasoning that only
  // the emoji prefix could push a label past the pill. A visual check proved
  // otherwise: the neutral tag has ALWAYS overflowed for long names, because
  // the pre-v20 builder never measured either. Three of the 48 shipped
  // CAT_NAMES spill out of the pill at 34px — 'Baron von Fluff' by 34%
  // (242px against a 180px budget), 'Butterscotch' and 'Clementine' by less.
  //
  // The overflow is worse than those three, because this builder is shared
  // with remote co-walk pets, whose names players type in themselves and are
  // not bounded by any list.
  //
  // Measuring both moods also restores a property setNameTagMood's whole
  // design depends on: a forgiven cat's tag being pixel-identical to one that
  // was never cross. With only the cross path measuring, a long-named cat
  // reconciled at 24px and then repainted neutral at an unmeasured 34px,
  // visibly bursting its pill at the exact moment the game means to say
  // "everything is fine again".
  //
  // A label that already fits is untouched at BASE_FONT_PX, so the shipped
  // look of every name that was never broken is unchanged.
  //
  // measureText is guarded because the tag is built against fake 2D contexts
  // in headless tests.
  // A legend tag uses the wider pill, so the star costs the name nothing.
  const pill = legend ? PILL_LEGEND : PILL;
  if (typeof ctx.measureText === 'function') {
    const maxW = pill.w - LABEL_PAD_PX * 2;
    while (px > MIN_FONT_PX && (ctx.measureText(label).width || 0) + starRoom(px) > maxW) {
      px -= FONT_STEP_PX;
      ctx.font = font(px);
    }
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = cross ? PILL_CROSS : PILL_NEUTRAL;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(pill.x, pill.y, pill.w, pill.h, pill.r);
  else ctx.rect(pill.x, pill.y, pill.w, pill.h);
  ctx.fill();
  if (cross && ctx.stroke) {
    // Same path, stroked — the font-independent half of the hostile read.
    ctx.strokeStyle = PILL_CROSS_EDGE;
    ctx.lineWidth = PILL_CROSS_EDGE_PX;
    ctx.stroke();
  } else if (legend && ctx.stroke) {
    // The legend's own edge: gold, and like the star, pure geometry.
    ctx.strokeStyle = STAR_FILL;
    ctx.lineWidth = PILL_CROSS_EDGE_PX;
    ctx.stroke();
  }
  if (!legend) {
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(label, LABEL_X, LABEL_BASELINE);
    return;
  }
  // The legend mood: star then name, centred together as one run.
  const textW = typeof ctx.measureText === 'function'
    ? (ctx.measureText(label).width || 0)
    : label.length * px * 0.55;
  const starW = px * STAR_SIZE_EM;
  const left = LABEL_X - (textW + starRoom(px)) / 2;
  drawStar(ctx, left + starW / 2, LABEL_BASELINE - px * 0.36, starW / 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = LABEL_COLOR;
  ctx.fillText(label, left + starRoom(px), LABEL_BASELINE);
}

// Guards on `document` so it's a safe no-op in non-DOM test/SSR contexts —
// callers should treat a null return as "no tag" and skip adding it.
//
// opts.cross paints the grudge mood at build time (for a stray that was
// already cross when this walk started). It defaults to false, so every
// existing call site is unchanged. opts.legend (v21 3b) adds the drawn gold
// star of a legendary cat; it also defaults to false, and survives every
// mood repaint (setNameTagMood reads it back off the tag).
export function makeNameTag(name, { cross = false, legend = false } = {}) {
  if (typeof document === 'undefined') return null;
  const tagCanvas = document.createElement('canvas');
  tagCanvas.width = TAG_W;
  tagCanvas.height = TAG_H;
  const tctx = tagCanvas.getContext('2d');
  const isCross = !!cross;
  const isLegend = !!legend;
  paintTag(tctx, name, isCross, isLegend);
  const tagTex = new THREE.CanvasTexture(tagCanvas);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true }));
  tag.scale.set(1.4, 0.35, 1);
  tag.position.y = isCross ? CROSS_TAG_Y : TAG_Y;
  tag.visible = false;
  // The canvas and its context are kept ON the sprite so the texture can be
  // repainted later without rebuilding anything — see setNameTagMood.
  tag.userData.tagCanvas = tagCanvas;
  tag.userData.tagCtx = tctx;
  tag.userData.tagName = name;
  tag.userData.cross = isCross;
  tag.userData.legend = isLegend;
  tag.userData.revealRange = isCross ? CROSS_NAME_TAG_RANGE : NAME_TAG_RANGE;
  return tag;
}

// Repaints an EXISTING tag in place for a new mood, and returns it.
//
// This is the load-bearing half of the grudge indicator. A grudge clears the
// instant a gift is accepted, and the cat has to visibly soften ON THE SPOT
// — that beat is the entire reason the feature exists, and without an
// in-place repaint it happens invisibly.
//
// In place, specifically: the same sprite, the same material, the same
// CanvasTexture, the same canvas. Rebuilding the sprite instead would strand
// the old texture (endWalk's scene traversal already carries a known
// shared-geometry disposal wart; this must not add to it) and would drop
// whatever the caller had parented or positioned.
//
// Safe no-ops, all of which callers rely on:
//   * a null tag — makeNameTag returns null with no `document`, and every
//     call site treats that as "no tag";
//   * a sprite that did not come from makeNameTag (no painter context);
//   * a mood that is already set, so this may be called every frame from the
//     update loop without repainting a canvas 60 times a second.
//
// It deliberately does NOT touch `tag.visible`. Reveal is the caller's
// decision; what this updates is `userData.revealRange`, the distance that
// decision should be made at.
export function setNameTagMood(tag, { cross = false } = {}) {
  if (!tag || !tag.userData || !tag.userData.tagCtx) return tag ?? null;
  const next = !!cross;
  if (tag.userData.cross === next) return tag;
  paintTag(tag.userData.tagCtx, tag.userData.tagName, next, tag.userData.legend === true);
  tag.userData.cross = next;
  tag.userData.revealRange = next ? CROSS_NAME_TAG_RANGE : NAME_TAG_RANGE;
  // Height moves with the mood for the same reason the paint does — see
  // CROSS_TAG_Y. Without this the forgiven cat keeps the raised tag forever,
  // floating above a tail that has just come back down.
  tag.position.y = next ? CROSS_TAG_Y : TAG_Y;
  // The one line that actually gets the new pixels onto the GPU.
  if (tag.material && tag.material.map) tag.material.map.needsUpdate = true;
  return tag;
}
