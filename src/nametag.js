import * as THREE from 'three';

// Shared name-tag sprite builder for stray cats, ghost visitors and remote
// (co-walk) pets.
//
// v20 "Ruffled Fur" adds a second mood: a stray that bears a grudge wears a
// dusky-red tag instead of the neutral one. Everything about that is opt-in —
// `makeNameTag(name)` with no opts paints exactly the pixels it painted
// before this wave, because remote pets and the named family pets must be
// entirely unaffected (the strays-only rule).

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
// reaches a height inside the tag sprite's band at the neutral TAG_Y (the
// sprite is 0.35 tall, centred on it; the figures here were measured on the
// shorter cat, see the re-measure below). The tail drew straight through the label,
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
// ghost visitors look, which the strays-only rule says this wave must not
// touch.
//
// The tag does shift when a cat turns cross and settles back when forgiven.
// That is deliberate: it happens on the same frame as the colour repaint, so
// it reads as one change of mood rather than as a glitch.
//
// The taller cat (Task 9 of the body reshape) moved both up by the amount the
// tabby's highest point rose, rounded up to 1 cm, so the margins are kept:
// TAG_Y = 1.05 + 0.13: tabby 'follow' max 0.9684 vs 0.8467 before (+0.1217).
// CROSS_TAG_Y = 1.32 + 0.06: tabby 'cross' max 1.0382 vs 0.9848 (+0.0534).
// Camp declutter: at a camp only the CAMP_TAG_MAX tags nearest her cat show
// (the buddy's always one of them), and a shown tag fades over the last
// TAG_FADE_M metres of its reveal range. Pure; render-only callers.
export const CAMP_TAG_MAX = 2;
export const TAG_FADE_M = 1;
// entries: [{ d, range, keep }] -> Map<entry, opacity>. Entries absent from the
// map are hidden. In range only; `keep` first, then nearest (ties by list
// order); at most `max`. The nearest shown entry is always fully opaque.
// `out`: a Map to fill (cleared first), so a per-frame caller allocates
// nothing; a fresh one when left out.
const picked = []; // scratch: the indices chosen so far (no per-call allocation)
// Whether entry i (e) goes before entry j (f): keep first, then nearer, then earlier.
const before = (e, i, f, j) => (e.keep !== f.keep ? !!e.keep : e.d !== f.d ? e.d < f.d : i < j);
export function tagBudget(entries, max = CAMP_TAG_MAX, out = new Map()) {
  out.clear();
  if (!entries || !(max > 0)) return out;
  // max is small (2): pick the best unpicked in-range entry max times, a
  // stable partial selection sort with no arrays or wrappers built
  picked.length = 0;
  let nearest = null;
  for (let k = 0; k < max; k++) {
    let bi = -1;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e || !(e.d < e.range) || picked.includes(i)) continue;
      if (bi < 0 || before(e, i, entries[bi], bi)) bi = i;
    }
    if (bi < 0) break;
    picked.push(bi);
    const e = entries[bi];
    if (!nearest || e.d < nearest.d) nearest = e;
  }
  for (const i of picked) {
    const e = entries[i];
    const f = (e.range - e.d) / TAG_FADE_M;
    out.set(e, e === nearest ? 1 : Math.min(1, Math.max(0, f)));
  }
  picked.length = 0;
  return out;
}

export const TAG_Y = 1.18;
export const CROSS_TAG_Y = 1.38;

// --- The two-line tag (Clan Life Part 1) ------------------------------
// A clan cat's tag says who it is in the clan: its name on top and a smaller
// line under it ("warrior of StormClan"), which is what teaches the ranks
// (an elder's name and a warrior's look alike). Opt-in through opts.sub:
// every other tag keeps the one-line canvas and sprite above, untouched.
//
// The canvas is taller by half (256x96) and the sprite's y scale grows by the
// same ratio (0.35 -> 0.525), so the letters are exactly as big as on a
// one-line tag. The sprite is lifted by half the added height (SUB_LIFT), so
// its lower edge sits where a one-line tag's does and clears the tail by the
// same margin (see TAG_Y below).
const SUB_TAG_H = 96;
const TAG_SCALE_X = 1.4;
const TAG_SCALE_Y = 0.35; // makeNameTag's one-line sprite height (1.4 x 0.35)
const SUB_TAG_SCALE_Y = TAG_SCALE_Y * (SUB_TAG_H / TAG_H);
const SUB_LIFT = (SUB_TAG_SCALE_Y - TAG_SCALE_Y) / 2;
// Polish 2: the second line was 20 px (14 at the shrink floor) on a 256-wide
// canvas, which at the TAG_PX_MAX cap came out 10-11 CSS px on screen, too
// small to read. It is 24 px now (18 at the floor), and the two-line canvas
// is half as wide again (384, the sprite 2.1 wide, so the letters are the
// same size as before) so "medicine cat of StormClan" fits at that size. The
// pill is drawn only as wide as its longer line needs, so a short line does
// not sit in a long empty bar. The last few px come from the fitter, which
// lets a two-line tag's cap rise until the line is SUB_PX_AT_CAP CSS px.
const SUB_TAG_W = 384;
const SUB_TAG_SCALE_X = TAG_SCALE_X * (SUB_TAG_W / TAG_W);
const PILL_SUB = { x: 4, y: 6, w: 376, h: 84, r: 24 };
const PILL_SUB_MIN_W = 248; // the old pill's width: never narrower than that
const SUB_NAME_BASELINE = 44;
const SUB_LINE_BASELINE = 78;
const SUB_FONT_PX = 24;
const SUB_MIN_FONT_PX = 18;
const SUB_LINE_COLOR = 'rgba(255,255,255,0.85)';
// The rank line's on-screen letter size at the cap, CSS px (test/nametagsub).
export const SUB_PX_AT_CAP = 13;

// --- On-screen size and the screen's edges ----------------------------
// A tag is a world-space sprite, so it grows as its cat comes toward the
// camera: a cat at your nose wore a tag half the screen wide, and on a phone
// it ran off the edge. So every tag fits itself to the view at render time
// (fitTagToView, hung on onBeforeRender by makeNameTag):
//   * its letters are held between TAG_PX_MIN and TAG_PX_MAX CSS px tall (a
//     one-line tag's height; a two-line tag is sized by the same letters).
//     At an ordinary walking distance (the cat 4-8 m from the camera) a tag
//     is 26-34 px, inside the band, so it looks exactly as it always has;
//   * shrunk or grown, its lower edge stays put, so it never sinks into the
//     cat or lifts away from it;
//   * a tag that would cross a side or the top of the screen slides back
//     inside it, TAG_EDGE_PX in; a tag whose cat is off the side (or above
//     the top) of the screen is hidden for the frame.
// Only tag.matrixWorld is written, rebuilt from the parent's matrixWorld and
// the tag's own local matrix first, so the tag's position and scale (what
// the game reads) never change, and a second render in the same frame (any
// other camera) starts from the natural matrix again. No allocation per call.
export const TAG_PX_MIN = 18;
export const TAG_PX_MAX = 34;
export const TAG_EDGE_PX = 6;

const _pos = new THREE.Vector3();
const _size = new THREE.Vector2();

// `minBottomY` (world y, optional): the sprite's lower edge is kept at or
// above it. The chat bubble passes its own tag's fitted top, so a far tag
// grown to TAG_PX_MIN never pushes up under the bubble (fitBubbleOnRender).
// A sprite other than a name tag says how tall one of its "lines" is with
// userData.fitLines (its height over a one-line tag's for the same letters).
// `rectOut` (optional): filled with the fitted, natural (pre-declutter) rect
// {l,t,r,b} in CSS px (y down), its `depth` and `k` (CSS px per world unit at
// that depth); left untouched when the tag is off screen or behind the camera.
export function fitTagToView(tag, camera, viewW, viewH, minBottomY = -Infinity, rectOut = null) {
  if (!camera || !camera.isPerspectiveCamera || !(viewH > 0) || !(viewW > 0)) return;
  const mw = tag.matrixWorld;
  if (tag.parent) mw.multiplyMatrices(tag.parent.matrixWorld, tag.matrix);
  else mw.copy(tag.matrix);
  const e = mw.elements;
  const sx = Math.hypot(e[0], e[1], e[2]);
  const sy = Math.hypot(e[4], e[5], e[6]);
  if (!(sy > 0)) return;
  _pos.set(e[12], e[13], e[14]).applyMatrix4(camera.matrixWorldInverse);
  const depth = -_pos.z;
  if (!(depth > camera.near)) return;
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360) / (camera.zoom || 1);
  const halfH = depth * tanHalf;
  // The camera's own shape, not the canvas's: the same today, and right for
  // any render target of another shape.
  const halfW = halfH * (camera.aspect > 0 ? camera.aspect : viewW / viewH);
  const k = viewH / (2 * halfH); // CSS px per world unit at this depth
  const lines = tag.userData?.fitLines ?? (tag.userData?.sub ? SUB_TAG_SCALE_Y / TAG_SCALE_Y : 1);
  const lineH = (sy / lines) * k;
  // A two-line tag's cap rises as far as its rank line needs to stay readable
  // (a one-line tag's is TAG_PX_MAX, as it always was).
  const subPx = tag.userData?.sub ? tag.userData.subPx : 0;
  const max = subPx > 0 ? Math.max(TAG_PX_MAX, (SUB_PX_AT_CAP * TAG_H) / subPx) : TAG_PX_MAX;
  const target = lineH < TAG_PX_MIN ? TAG_PX_MIN : lineH > max ? max : lineH;
  const f = target / lineH;
  const nsx = sx * f;
  const nsy = sy * f;
  // Off the side or above the top: nothing to show.
  if (Math.abs(_pos.x) > halfW || _pos.y - sy / 2 > halfH) {
    mw.makeScale(0, 0, 0);
    return;
  }
  let moved = f !== 1;
  _pos.y += (nsy - sy) / 2;
  const m = TAG_EDGE_PX / k;
  const maxX = halfW - nsx / 2 - m;
  const x = maxX <= 0 ? 0 : _pos.x > maxX ? maxX : _pos.x < -maxX ? -maxX : _pos.x;
  if (x !== _pos.x) { _pos.x = x; moved = true; }
  const maxY = halfH - nsy / 2 - m;
  if (_pos.y > maxY) { _pos.y = maxY; moved = true; }
  if (rectOut) {
    const kx = viewW / (2 * halfW);
    const cx = viewW / 2 + _pos.x * kx;
    const cy = viewH / 2 - _pos.y * k;
    rectOut.l = cx - (nsx / 2) * kx;
    rectOut.r = cx + (nsx / 2) * kx;
    rectOut.t = cy - (nsy / 2) * k;
    rectOut.b = cy + (nsy / 2) * k;
    rectOut.depth = depth;
    rectOut.k = k;
  }
  // Untouched: keep the natural matrix exactly as three built it.
  if (!moved && !(e[13] - sy / 2 < minBottomY)) return;
  _pos.applyMatrix4(camera.matrixWorld);
  if (_pos.y - nsy / 2 < minBottomY) _pos.y = minBottomY + nsy / 2;
  mw.makeScale(nsx, nsy, 1);
  mw.setPosition(_pos);
}

// --- Tags step aside: for each other and for the HUD ------------------
// At a camp, clan cats' two-line tags stacked on top of each other, and a tag
// could sit under the fight card, a toast, the controls bar or the touch
// buttons. So each frame, nearest first, a tag that would overlap one already
// placed (TAG_GAP_PX apart) first drops its rank line (keeping its lower
// edge: the name stays by the cat), then is nudged up just clear of what it
// met (by at most LIFT_MAX_TAGS of its own heights, never off the top), and
// failing both is hidden for the frame. A tag on a HUD box is hidden, nearest
// or not: a tag can be read again a step later, a covered button can't.
//
// Why one frame of lag: tags are transparent sprites and three draws those
// back to front, one onBeforeRender at a time, so no tag can see all the
// others before it is drawn. The first tag of a frame decides for everyone
// from the rects every tag had LAST frame, and each tag then applies its own
// decision. At 60 fps a frame-old rect is a few px off at most.
//
// Why natural rects: each tag records its rect as fitted but BEFORE its
// decision was applied. Deciding from nudged rects would feed a decision
// back into itself (a lifted tag no longer overlaps, so it drops back, so it
// overlaps again: a tag that flickers every other frame). From natural rects
// the same scene gives the same decisions, frame after frame.
//
// Off without renderer.info.render.frame (headless tests, a bare renderer):
// a tag then fits exactly as it always has. No per-frame allocation: pooled
// entries, rects and decisions; the HUD's boxes are read from the DOM at most
// every HUD_EVERY_MS, and only by the first tag of a frame.
export const TAG_GAP_PX = 4;
export const SUB_DROP_KEEP = 2 / 3; // share of a two-line rect left without its rank line
export const LIFT_MAX_TAGS = 1.5; // the furthest a tag is nudged, in its own rect heights

const _order = []; // scratch: entry indices, nearest first
const _reuse = []; // scratch: the decision objects `out` held for each entry
const _placed = []; // pooled rects; the first _placedN are placed this call
let _placedN = 0;
const _work = { l: 0, t: 0, r: 0, b: 0 };

// Positive-area overlap with a placed rect grown by TAG_GAP_PX.
const meetsGrown = (a, p) => a.l < p.r + TAG_GAP_PX && a.r > p.l - TAG_GAP_PX
  && a.t < p.b + TAG_GAP_PX && a.b > p.t - TAG_GAP_PX;
function meetsPlaced(a) {
  for (let i = 0; i < _placedN; i++) if (meetsGrown(a, _placed[i])) return true;
  return false;
}

// entries: [{ rect: {l,t,r,b} (CSS px, y down), depth, sub }], hud: [{l,t,r,b}]
// -> Map<entry, { hide, dropSub, lift }>. Pure. `out` is cleared and refilled;
// the decision objects it held for these same entries are reused.
export function declutterTags(entries, hud = [], out = new Map()) {
  const n = entries ? entries.length : 0;
  _reuse.length = 0;
  for (let i = 0; i < n; i++) _reuse.push(out.get(entries[i]) || null);
  out.clear();
  // nearest first, ties by list order (a stable insertion sort: few tags)
  _order.length = 0;
  for (let i = 0; i < n; i++) {
    let j = _order.length;
    _order.push(i);
    while (j > 0 && entries[_order[j - 1]].depth > entries[i].depth) { _order[j] = _order[j - 1]; j--; }
    _order[j] = i;
  }
  _placedN = 0;
  for (let o = 0; o < n; o++) {
    const i = _order[o];
    const e = entries[i];
    const d = _reuse[i] || { hide: false, dropSub: false, lift: 0 };
    d.hide = false; d.dropSub = false; d.lift = 0;
    const w = _work;
    w.l = e.rect.l; w.t = e.rect.t; w.r = e.rect.r; w.b = e.rect.b;
    if (e.sub && meetsPlaced(w)) {
      d.dropSub = true;
      w.t = w.b - (w.b - w.t) * SUB_DROP_KEEP;
    }
    if (meetsPlaced(w)) {
      let lift = 0;
      for (let p = 0; p < _placedN; p++) {
        const q = _placed[p];
        if (meetsGrown(w, q) && w.b - q.t + TAG_GAP_PX > lift) lift = w.b - q.t + TAG_GAP_PX;
      }
      d.lift = lift;
      w.t -= lift; w.b -= lift;
      if (lift > LIFT_MAX_TAGS * (w.b - w.t) || meetsPlaced(w) || w.t < 0) d.hide = true;
    }
    if (!d.hide && hud) {
      for (let h = 0; h < hud.length; h++) {
        const q = hud[h];
        if (w.l < q.r && w.r > q.l && w.t < q.b && w.b > q.t) { d.hide = true; break; }
      }
    }
    if (!d.hide) {
      const p = _placed[_placedN] || (_placed[_placedN] = { l: 0, t: 0, r: 0, b: 0 });
      p.l = w.l; p.t = w.t; p.r = w.r; p.b = w.b;
      _placedN++;
    }
    out.set(e, d);
  }
  _reuse.length = 0;
  return out;
}

// The HUD boxes a tag must not sit on (CSS px, relative to the canvas).
const HUD_SELECTOR = '#hud-prompt:not(.hidden), .hud-fight-ask, #hud-toasts .toast, #hud-controls, '
  + '.hud-fight, .tui-actions, .tui-zoom, .tui-pause';
const HUD_EVERY_MS = 250;
function hudRects(st, renderer) {
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
  if (now - st.hudAt < HUD_EVERY_MS) return st.hud;
  st.hudAt = now;
  st.hud.length = 0;
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return st.hud;
  let ox = 0, oy = 0;
  const canvas = renderer.domElement;
  if (canvas && typeof canvas.getBoundingClientRect === 'function') {
    const c = canvas.getBoundingClientRect();
    ox = c.left; oy = c.top;
  }
  const els = document.querySelectorAll(HUD_SELECTOR);
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (typeof el.getBoundingClientRect !== 'function') continue;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;
    if (typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    }
    const n = st.hud.length;
    const q = st.hudPool[n] || (st.hudPool[n] = { l: 0, t: 0, r: 0, b: 0 });
    q.l = r.left - ox; q.t = r.top - oy; q.r = r.right - ox; q.b = r.bottom - oy;
    st.hud.push(q);
  }
  return st.hud;
}

// Per renderer: this frame's and last frame's entries (two pools, swapped
// each frame, each with its own decision map so its decision objects are
// reused), and which decision each tag drew from last frame.
const _glue = new WeakMap();
function glueFor(renderer) {
  let st = _glue.get(renderer);
  if (!st) {
    st = {
      frame: undefined,
      cur: [], last: [], curPool: [], lastPool: [], curDec: new Map(), lastDec: new Map(),
      byTag: new WeakMap(), hud: [], hudPool: [], hudAt: -Infinity,
    };
    _glue.set(renderer, st);
  }
  return st;
}

function newFrame(st, renderer, frame) {
  st.frame = frame;
  const arr = st.last; st.last = st.cur; st.cur = arr;
  for (let i = 0; i < arr.length; i++) arr[i].tag = null; // recycled: let go of old tags
  arr.length = 0;
  const pool = st.lastPool; st.lastPool = st.curPool; st.curPool = pool;
  const dec = st.lastDec; st.lastDec = st.curDec; st.curDec = dec;
  // st.lastDec is the map these entries' pool filled two frames ago
  declutterTags(st.last, hudRects(st, renderer), st.lastDec);
  for (let i = 0; i < st.last.length; i++) {
    const e = st.last[i];
    const d = st.lastDec.get(e);
    d.frame = frame; d.tag = e.tag; // whose decision, for which frame
    st.byTag.set(e.tag, d);
  }
}

// The one-line stand-in for a two-line tag that dropped its rank line: the
// name alone, on the wide pill, in the tag's mood. Built on first use.
function paintShort(tag) {
  const ud = tag.userData;
  if (!ud.shortCtx) {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = TAG_W;
    c.height = TAG_H;
    ud.shortCanvas = c;
    ud.shortCtx = c.getContext('2d');
    ud.shortMap = new THREE.CanvasTexture(c);
    // the scene's disposal frees material.map only, which is one of the two
    if (tag.material && typeof tag.material.addEventListener === 'function') {
      tag.material.addEventListener('dispose', () => {
        if (ud.shortMap) ud.shortMap.dispose();
        if (ud.fullMap) ud.fullMap.dispose();
      });
    }
  }
  paintTag(ud.shortCtx, ud.tagName, ud.cross === true, ud.legend === true, true);
  ud.shortCross = ud.cross === true;
  ud.shortMap.needsUpdate = true;
}

const DROP_FX = TAG_SCALE_X / SUB_TAG_SCALE_X;
const DROP_FY = TAG_SCALE_Y / SUB_TAG_SCALE_Y;

function applyDecision(tag, d, k, camera) {
  const ud = tag.userData;
  const mat = tag.material;
  let drop = !!(d && d.dropSub && !d.hide && ud.sub && mat);
  if (drop) {
    if (!ud.shortMap || ud.shortCross !== (ud.cross === true)) paintShort(tag);
    if (!ud.shortMap) drop = false;
    else if (mat.map !== ud.shortMap) {
      if (!ud.fullMap) ud.fullMap = mat.map;
      mat.map = ud.shortMap;
    }
  }
  if (!drop && ud.fullMap && mat && mat.map !== ud.fullMap) mat.map = ud.fullMap;
  if (!d) return;
  const mw = tag.matrixWorld;
  if (d.hide) { mw.makeScale(0, 0, 0); return; }
  if (!drop && !(d.lift > 0)) return;
  const me = mw.elements;
  let up = d.lift > 0 && k > 0 ? d.lift / k : 0;
  if (drop) {
    const sy = Math.hypot(me[4], me[5], me[6]);
    for (let i = 0; i < 3; i++) { me[i] *= DROP_FX; me[4 + i] *= DROP_FY; }
    up -= (sy * (1 - DROP_FY)) / 2; // lower edge kept
  }
  // up the screen: the camera's own up axis (a sprite's height runs along it)
  const ce = camera.matrixWorld.elements;
  const len = Math.hypot(ce[4], ce[5], ce[6]) || 1;
  const s = up / len;
  me[12] += ce[4] * s; me[13] += ce[5] * s; me[14] += ce[6] * s;
}

function fitOnRender(renderer, _scene, camera) {
  if (!renderer || typeof renderer.getSize !== 'function') return;
  renderer.getSize(_size);
  const frame = renderer.info && renderer.info.render ? renderer.info.render.frame : undefined;
  if (typeof frame !== 'number') {
    fitTagToView(this, camera, _size.x, _size.y);
    return;
  }
  const st = glueFor(renderer);
  if (frame !== st.frame) newFrame(st, renderer, frame);
  const n = st.cur.length;
  const e = st.curPool[n] || (st.curPool[n] = { rect: { l: 0, t: 0, r: 0, b: 0, depth: 0, k: 0 }, depth: 0, sub: false, tag: null });
  e.rect.depth = NaN;
  fitTagToView(this, camera, _size.x, _size.y, -Infinity, e.rect);
  let d = st.byTag.get(this);
  if (d && (d.frame !== frame || d.tag !== this)) d = undefined;
  if (!(e.rect.depth > 0)) { applyDecision(this, undefined, 0, camera); return; } // off screen
  // A tag faded all the way out takes no room.
  if (!(this.material && this.material.opacity <= 0)) {
    e.depth = e.rect.depth;
    e.sub = !!this.userData.sub;
    e.tag = this;
    st.cur.push(e);
  }
  applyDecision(this, d, e.rect.k, camera);
}

// For a chat bubble (chatbubble.js): fit it like a tag, and keep it above
// its cat's name tag as that tag was fitted this frame. The bubble draws after
// the tag (renderOrder 10), so the tag's matrixWorld is already this frame's.
// No allocation: a plain loop over the cat's children.
const BUBBLE_GAP = 0.03;
export function fitBubbleOnRender(renderer, _scene, camera) {
  if (!renderer || typeof renderer.getSize !== 'function') return;
  renderer.getSize(_size);
  let minBottom = -Infinity;
  const kids = this.parent ? this.parent.children : null;
  if (kids) {
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (c === this || !c.visible || !c.userData || !c.userData.tagCtx) continue;
      const te = c.matrixWorld.elements;
      const top = te[13] + Math.hypot(te[4], te[5], te[6]) / 2;
      if (top + BUBBLE_GAP > minBottom) minBottom = top + BUBBLE_GAP;
    }
  }
  fitTagToView(this, camera, _size.x, _size.y, minBottom);
}

// Shrinks `ctx.font` from `px` until `label` fits `maxW`, never below `min`.
function fitFont(ctx, label, px, min, maxW) {
  ctx.font = font(px);
  if (typeof ctx.measureText !== 'function') return px;
  while (px > min && (ctx.measureText(label).width || 0) > maxW) {
    px -= FONT_STEP_PX;
    ctx.font = font(px);
  }
  return px;
}

// Paints the two-line tag. Same moods as paintTag (the cross pill, outline and
// marker; a legend's gold edge) so setNameTagMood works on it unchanged.
// Returns the rank line's font px (the fitter reads it back off the tag).
function paintTwoLine(ctx, name, cross, legend, sub) {
  if (ctx.clearRect) ctx.clearRect(0, 0, SUB_TAG_W, SUB_TAG_H);
  const label = cross ? `${CROSS_MARK} ${name}` : `${name}`;
  const maxW = PILL_SUB.w - LABEL_PAD_PX * 2;
  const cx = SUB_TAG_W / 2;
  // Sizes first, so the pill can be drawn to the longer line.
  const namePx = fitFont(ctx, label, BASE_FONT_PX, MIN_FONT_PX, maxW);
  const nameW = typeof ctx.measureText === 'function' ? (ctx.measureText(label).width || 0) : maxW;
  const subPx = fitFont(ctx, sub, SUB_FONT_PX, SUB_MIN_FONT_PX, maxW);
  const subW = typeof ctx.measureText === 'function' ? (ctx.measureText(sub).width || 0) : maxW;
  const want = Math.max(nameW, subW) + LABEL_PAD_PX * 2 + 2 * PILL_SUB.r;
  const pw = Math.round(Math.min(PILL_SUB.w, Math.max(PILL_SUB_MIN_W, want)));
  const px0 = (SUB_TAG_W - pw) / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = cross ? PILL_CROSS : PILL_NEUTRAL;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(px0, PILL_SUB.y, pw, PILL_SUB.h, PILL_SUB.r);
  else ctx.rect(px0, PILL_SUB.y, pw, PILL_SUB.h);
  ctx.fill();
  if ((cross || legend) && ctx.stroke) {
    ctx.strokeStyle = cross ? PILL_CROSS_EDGE : STAR_FILL;
    ctx.lineWidth = PILL_CROSS_EDGE_PX;
    ctx.stroke();
  }
  ctx.font = font(namePx);
  ctx.fillStyle = LABEL_COLOR;
  ctx.fillText(label, cx, SUB_NAME_BASELINE);
  ctx.font = font(subPx);
  ctx.fillStyle = SUB_LINE_COLOR;
  ctx.fillText(sub, cx, SUB_LINE_BASELINE);
  return subPx;
}

// Paints one mood into an existing 2D context. Used both by makeNameTag (on
// a fresh canvas) and by setNameTagMood (over a painted one) — one painter,
// so a repainted tag is pixel-identical to a freshly built one of the same
// mood. That matters for reconciliation: a forgiven cat must look exactly
// like a cat that was never cross, not merely similar.
function paintTag(ctx, name, cross, legend = false, wide = false) {
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
  // opts.fit (her own cat's tag) borrows the legend's wide pill: a 16-letter
  // name overflows the plain one even at the MIN_FONT_PX floor.
  const pill = legend || wide ? PILL_LEGEND : PILL;
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

// A tag that rides a cat group which a fight pitches (rotation.x) and rolls
// (rotation.z), order 'YXZ': its local offset is set so it stays straight
// above the cat's torso centre (local height `anchorY`), as high above it as
// when the cat stands level: local = (0, a, 0) + (Rx·Rz)⁻¹·(0, h − a, 0).
// Level, it is back exactly where it was built. No allocation.
export function uprightTag(tag, pitch, roll, anchorY = 0) {
  if (!tag) return;
  if (tag.userData.restY === undefined) tag.userData.restY = tag.position.y;
  const h = tag.userData.restY;
  if (pitch === 0 && roll === 0) { tag.position.set(0, h, 0); return; }
  const a = Number.isFinite(anchorY) ? anchorY : 0;
  const k = h - a;
  tag.position.set(k * Math.cos(pitch) * Math.sin(roll), a + k * Math.cos(pitch) * Math.cos(roll), -k * Math.sin(pitch));
}

// Guards on `document` so it's a safe no-op in non-DOM test/SSR contexts —
// callers should treat a null return as "no tag" and skip adding it.
//
// opts.cross paints the grudge mood at build time (for a stray that was
// already cross when this walk started). It defaults to false, so every
// existing call site is unchanged. opts.legend (v21 3b) adds the drawn gold
// star of a legendary cat; it also defaults to false, and survives every
// mood repaint (setNameTagMood reads it back off the tag).
//
// opts.sub (Clan Life Part 1): a non-empty string paints the two-line tag (see
// paintTwoLine). It is kept on userData.sub, so a mood repaint keeps it. With
// no sub (or an empty one) the tag is pixel-identical to before.
//
// opts.fit: the wide pill, so a long typed name (16 letters) fits at the
// shrink-to-fit floor. Off by default; kept on userData.fit for repaints.
export function makeNameTag(name, { cross = false, legend = false, sub = '', fit = false } = {}) {
  if (typeof document === 'undefined') return null;
  const twoLine = typeof sub === 'string' && sub.length > 0;
  const tagCanvas = document.createElement('canvas');
  tagCanvas.width = twoLine ? SUB_TAG_W : TAG_W;
  tagCanvas.height = twoLine ? SUB_TAG_H : TAG_H;
  const tctx = tagCanvas.getContext('2d');
  const isCross = !!cross;
  const isLegend = !!legend;
  const subPx = twoLine ? paintTwoLine(tctx, name, isCross, isLegend, sub) : 0;
  if (!twoLine) paintTag(tctx, name, isCross, isLegend, !!fit);
  const tagTex = new THREE.CanvasTexture(tagCanvas);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true }));
  tag.scale.set(1.4, 0.35, 1); // TAG_SCALE_X, TAG_SCALE_Y (test/chatbubble reads this line)
  if (twoLine) tag.scale.set(SUB_TAG_SCALE_X, SUB_TAG_SCALE_Y, 1);
  tag.position.y = (isCross ? CROSS_TAG_Y : TAG_Y) + (twoLine ? SUB_LIFT : 0);
  if (twoLine) { tag.userData.sub = sub; tag.userData.subPx = subPx; }
  if (fit) tag.userData.fit = true;
  tag.visible = false;
  // The canvas and its context are kept ON the sprite so the texture can be
  // repainted later without rebuilding anything — see setNameTagMood.
  tag.userData.tagCanvas = tagCanvas;
  tag.userData.tagCtx = tctx;
  tag.userData.tagName = name;
  tag.userData.cross = isCross;
  tag.userData.legend = isLegend;
  tag.userData.revealRange = isCross ? CROSS_NAME_TAG_RANGE : NAME_TAG_RANGE;
  tag.onBeforeRender = fitOnRender;
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
  const sub = tag.userData.sub;
  if (sub) tag.userData.subPx = paintTwoLine(tag.userData.tagCtx, tag.userData.tagName, next, tag.userData.legend === true, sub);
  else paintTag(tag.userData.tagCtx, tag.userData.tagName, next, tag.userData.legend === true, tag.userData.fit === true);
  tag.userData.cross = next;
  tag.userData.revealRange = next ? CROSS_NAME_TAG_RANGE : NAME_TAG_RANGE;
  // Height moves with the mood for the same reason the paint does — see
  // CROSS_TAG_Y. Without this the forgiven cat keeps the raised tag forever,
  // floating above a tail that has just come back down.
  tag.position.y = (next ? CROSS_TAG_Y : TAG_Y) + (sub ? SUB_LIFT : 0);
  if (tag.userData.restY !== undefined) tag.userData.restY = tag.position.y; // uprightTag's height
  // The one line that actually gets the new pixels onto the GPU. (On the full
  // texture: while a decluttered tag wears its one-line stand-in, that is not
  // the material's map.)
  const full = tag.userData.fullMap || (tag.material && tag.material.map);
  if (full) full.needsUpdate = true;
  // The stand-in follows the mood too, so a swap never shows a stale colour.
  if (tag.userData.shortMap) paintShort(tag);
  return tag;
}
