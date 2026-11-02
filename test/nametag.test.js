import { describe, it, expect } from 'vitest';
import { buildCat } from '../src/cat/model.js';
import { readFileSync } from 'node:fs';
import { poseMeasure } from './helpers/catfingerprint.js';
const BASELINE = JSON.parse(readFileSync(new URL('./fixtures/catpose-baseline.json', import.meta.url), 'utf8'));
import {
  makeNameTag,
  tagBudget,
  CAMP_TAG_MAX,
  TAG_FADE_M,
  setNameTagMood,
  NAME_TAG_RANGE,
  CROSS_NAME_TAG_RANGE,
  TAG_Y,
  CROSS_TAG_Y,
} from '../src/nametag.js';

// nametag.js runs in a plain node test environment (no jsdom), so its
// `document` guard normally makes it a no-op here. This recording fake stands
// in for a real canvas + 2D context so the actual paint calls can be
// inspected — same trick remotecats.test.js already uses, extended to log
// every draw op in order.
function fakeCtx() {
  const ctx = {
    ops: [],
    font: '',
    textAlign: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    clearRect: (...a) => ctx.ops.push(['clearRect', ...a]),
    beginPath: () => ctx.ops.push(['beginPath']),
    roundRect: (...a) => ctx.ops.push(['roundRect', ...a]),
    rect: (...a) => ctx.ops.push(['rect', ...a]),
    fill: () => ctx.ops.push(['fill', ctx.fillStyle]),
    stroke: () => ctx.ops.push(['stroke', ctx.strokeStyle, ctx.lineWidth]),
    fillText: (...a) => ctx.ops.push(['fillText', ctx.font, ctx.fillStyle, ...a]),
    moveTo: (...a) => ctx.ops.push(['moveTo', ...a]),
    lineTo: (...a) => ctx.ops.push(['lineTo', ...a]),
    closePath: () => ctx.ops.push(['closePath']),
    // ~0.55em per character is close enough to a bold sans face for the
    // shrink-to-fit path; the emoji is wider than a letter, as it is in
    // every real font.
    measureText: (s) => ({
      width: [...String(s)].reduce((w, ch) => w + (ch.codePointAt(0) > 0x2000 ? 1.2 : 0.55), 0)
        * (parseInt(ctx.font.replace(/^bold /, ''), 10) || 34),
    }),
  };
  return ctx;
}

function withFakeDocument(fn) {
  const canvases = [];
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const canvas = { width: 0, height: 0, ctx: fakeCtx() };
      canvas.getContext = () => canvas.ctx;
      canvases.push(canvas);
      return canvas;
    },
  };
  try {
    return fn(canvases);
  } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

const opsOf = (tag) => tag.userData.tagCtx.ops;
const fillsIn = (ops) => ops.filter((o) => o[0] === 'fill').map((o) => o[1]);
const labelIn = (ops) => ops.find((o) => o[0] === 'fillText')[3];
const labelFontOf = (ops) => ops.find((o) => o[0] === 'fillText')[1];

describe('makeNameTag defaults', () => {
  // The strays-only rule: remote co-walk pets, ghost visitors and the named family pets share
  // this builder and must be entirely unaffected by the v20 grudge mood.
  it('paints the pre-v20 neutral tag when no opts are passed', () => {
    withFakeDocument((canvases) => {
      const tag = makeNameTag('Marmalade');
      expect(canvases).toHaveLength(1);
      expect(canvases[0].width).toBe(256);
      expect(canvases[0].height).toBe(64);
      const ops = opsOf(tag);
      expect(fillsIn(ops)).toEqual(['rgba(20,26,38,0.7)']);
      expect(ops.some((o) => o[0] === 'stroke')).toBe(false);
      expect(ops.find((o) => o[0] === 'roundRect')).toEqual(['roundRect', 28, 8, 200, 48, 22]);
      const text = ops.find((o) => o[0] === 'fillText');
      expect(text).toEqual(['fillText', 'bold 34px Avenir, sans-serif', '#fff', 'Marmalade', 128, 42]);
      expect(tag.visible).toBe(false);
      expect(tag.scale.x).toBeCloseTo(1.4);
      expect(tag.position.y).toBeCloseTo(TAG_Y);
      expect(tag.userData.cross).toBe(false);
      expect(tag.userData.revealRange).toBe(NAME_TAG_RANGE);
    });
  });

  it('is a no-op without a document, as callers rely on', () => {
    expect(makeNameTag('Marmalade')).toBe(null);
  });
});

// v21 3b, ruling R41: a legendary cat's tag carries a DRAWN gold star (a ✨
// glyph came out as a tiny white "+" on phones) and a gold-edged, wider pill.
describe('the legend tag', () => {
  const starOps = (ops) => ops.filter((o) => o[0] === 'moveTo' || o[0] === 'lineTo');

  it('draws a gold five-pointed star before the plain name, in a gold-edged pill', () => {
    withFakeDocument(() => {
      const tag = makeNameTag('Duchess', { legend: true });
      const ops = opsOf(tag);
      expect(tag.userData.legend).toBe(true);
      expect(tag.userData.tagName).toBe('Duchess');
      expect(labelIn(ops)).toBe('Duchess');                  // no emoji in the text at all
      expect(starOps(ops)).toHaveLength(10);                  // 5 points, 5 notches
      expect(fillsIn(ops)).toEqual(['rgba(20,26,38,0.7)', '#ffc93c']);   // pill, then the gold star
      expect(ops.find((o) => o[0] === 'roundRect')).toEqual(['roundRect', 4, 8, 248, 48, 22]);
      expect(ops.filter((o) => o[0] === 'stroke').map((o) => o[1])).toContain('#ffc93c');  // gold edge
      // The star sits left of the name, inside the canvas, and the name is white.
      const text = ops.find((o) => o[0] === 'fillText');
      expect(text[2]).toBe('#fff');
      const xs = starOps(ops).map((o) => o[1]);
      expect(Math.max(...xs)).toBeLessThan(text[4]);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      const ys = starOps(ops).map((o) => o[2]);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(8);      // inside the pill's band
      expect(Math.max(...ys)).toBeLessThanOrEqual(56);
    });
  });

  it('never shrinks a legendary name below the phone floor', () => {
    withFakeDocument(() => {
      for (const name of ['Duchess', 'Professor Whiskers', 'Captain Barnacle', 'Lord Lantern']) {
        const px = parseInt(labelFontOf(opsOf(makeNameTag(name, { legend: true }))).replace(/^bold /, ''), 10);
        expect(px).toBeGreaterThanOrEqual(24);
      }
    });
  });

  // M3: at 375 px the longest legendary name touched the gold edge. With a
  // measureText that matches Avenir Heavy (what "bold Avenir" resolves to:
  // 'Professor Whiskers' is 213.7 px at 24 px), the star and the name, as one
  // centred run at the 24 px floor, clear the pill's edge by a few px a side.
  it('the longest legendary name clears the gold edge at the phone floor', () => {
    const prev = globalThis.document;
    let ctx;
    globalThis.document = {
      createElement: () => {
        ctx = fakeCtx();
        ctx.measureText = (str) => ({
          width: (String(str) === 'Professor Whiskers' ? 213.7 / 24 : 0.55 * String(str).length)
            * (parseInt(ctx.font.replace(/^bold /, ''), 10) || 34),
        });
        return { width: 0, height: 0, getContext: () => ctx };
      },
    };
    try {
      const ops = opsOf(makeNameTag('Professor Whiskers', { legend: true }));
      const pill = ops.find((o) => o[0] === 'roundRect');
      const [x0, x1] = [pill[1], pill[1] + pill[3]];
      const text = ops.find((o) => o[0] === 'fillText');
      expect(text[1]).toBe('bold 24px Avenir, sans-serif');
      const starLeft = Math.min(...starOps(ops).map((o) => o[1]));
      const textRight = text[4] + 213.7;
      expect(starLeft - x0).toBeGreaterThanOrEqual(5);
      expect(x1 - textRight).toBeGreaterThanOrEqual(5);
    } finally {
      if (prev === undefined) delete globalThis.document;
      else globalThis.document = prev;
    }
  });

  it('leaves every other tag exactly as it was', () => {
    withFakeDocument(() => {
      const plain = opsOf(makeNameTag('Marmalade'));
      expect(opsOf(makeNameTag('Marmalade', { legend: false }))).toEqual(plain);
      expect(starOps(plain)).toHaveLength(0);
      expect(makeNameTag('Marmalade').userData.legend).toBe(false);
    });
  });

  it('keeps its star through a grudge and the making-up', () => {
    withFakeDocument(() => {
      const fresh = opsOf(makeNameTag('Duchess', { legend: true })).slice();
      const tag = makeNameTag('Duchess', { legend: true, cross: true });
      expect(starOps(opsOf(tag))).toHaveLength(10);
      tag.userData.tagCtx.ops.length = 0;
      setNameTagMood(tag, { cross: false });
      expect(opsOf(tag)).toEqual(fresh);
    });
  });
});

describe('the cross (grudge) tag', () => {
  it('paints a dusky-red pill, a hostile outline and a cross-cat marker', () => {
    withFakeDocument(() => {
      const tag = makeNameTag('Marmalade', { cross: true });
      const ops = opsOf(tag);
      expect(fillsIn(ops)).toEqual(['rgba(96,26,32,0.82)']);
      expect(labelIn(ops)).toContain('\u{1F63E}');
      expect(tag.userData.cross).toBe(true);
    });
  });

  it('carries the hostile read in colour alone, so a missing emoji glyph still lands', () => {
    // Canvas emoji rendering is font-dependent and undetectable from script.
    // The pill fill and its stroked outline are pure geometry: whatever the
    // font does with U+1F63E, both survive.
    withFakeDocument(() => {
      const ops = opsOf(makeNameTag('Marmalade', { cross: true }));
      const stroke = ops.find((o) => o[0] === 'stroke');
      expect(stroke).toBeTruthy();
      expect(stroke[1]).toBe('rgba(232,126,116,0.95)');
      expect(stroke[2]).toBeGreaterThan(0);
      // ...and the stroke traces the same pill path that was just filled, so
      // it cannot end up somewhere else on the canvas.
      const order = ops.map((o) => o[0]);
      expect(order.indexOf('roundRect')).toBeLessThan(order.indexOf('stroke'));
      expect(order.indexOf('fill')).toBeLessThan(order.indexOf('stroke'));
    });
  });

  it('shrinks an over-long cross label to fit the pill, but not below the floor', () => {
    withFakeDocument(() => {
      const shortOps = opsOf(makeNameTag('Bo', { cross: true }));
      const longOps = opsOf(makeNameTag('Bartholomewwww', { cross: true }));
      const px = (ops) => parseInt(labelFontOf(ops).replace(/^bold /, ''), 10);
      expect(px(shortOps)).toBe(34);
      expect(px(longOps)).toBeLessThan(34);
      expect(px(longOps)).toBeGreaterThanOrEqual(24);
    });
  });

  it('shows from much further out than a neutral tag', () => {
    // Two jobs pulling the same way: steer clear of a cat that will swat you,
    // and FIND the cat you want to make up with.
    expect(CROSS_NAME_TAG_RANGE).toBeGreaterThan(NAME_TAG_RANGE * 2);
    withFakeDocument(() => {
      expect(makeNameTag('Marmalade', { cross: true }).userData.revealRange)
        .toBe(CROSS_NAME_TAG_RANGE);
    });
  });

  it('leaves the reveal decision itself to the caller', () => {
    withFakeDocument(() => {
      // Still ships hidden like every other tag — straycats.js's update loop
      // owns `visible`, this module only owns the distance it should use.
      expect(makeNameTag('Marmalade', { cross: true }).visible).toBe(false);
    });
  });
});

describe('setNameTagMood', () => {
  it('is a safe no-op on a null tag', () => {
    expect(() => setNameTagMood(null, { cross: true })).not.toThrow();
    expect(setNameTagMood(null, { cross: true })).toBe(null);
    expect(setNameTagMood(undefined)).toBe(null);
  });

  it('is a safe no-op on a sprite that did not come from makeNameTag', () => {
    const stranger = { userData: {} };
    expect(setNameTagMood(stranger, { cross: true })).toBe(stranger);
    expect(stranger.userData.cross).toBeUndefined();
  });

  it('repaints IN PLACE: same sprite, same material, same texture, same canvas', () => {
    withFakeDocument((canvases) => {
      const tag = makeNameTag('Marmalade');
      const material = tag.material;
      const map = tag.material.map;
      const canvas = tag.userData.tagCanvas;
      const before = map.version;

      const returned = setNameTagMood(tag, { cross: true });

      expect(returned).toBe(tag);
      expect(tag.material).toBe(material);
      expect(tag.material.map).toBe(map);
      expect(tag.userData.tagCanvas).toBe(canvas);
      expect(canvases).toHaveLength(1); // nothing rebuilt
      expect(map.version).toBeGreaterThan(before); // needsUpdate was flipped
      expect(tag.userData.cross).toBe(true);
      expect(tag.userData.revealRange).toBe(CROSS_NAME_TAG_RANGE);
    });
  });

  it('clears the canvas first, so the old label cannot bleed through the new pill', () => {
    // Both pill fills are translucent — without a clear, the neutral label
    // would still be readable under the red one.
    withFakeDocument(() => {
      const tag = makeNameTag('Marmalade');
      tag.userData.tagCtx.ops.length = 0;
      setNameTagMood(tag, { cross: true });
      const ops = opsOf(tag);
      expect(ops[0]).toEqual(['clearRect', 0, 0, 256, 64]);
      expect(fillsIn(ops)).toEqual(['rgba(96,26,32,0.82)']);
      expect(labelIn(ops)).toContain('\u{1F63E}');
    });
  });

  it('softening back is the payoff beat: a forgiven cat is pixel-identical to one never cross', () => {
    withFakeDocument(() => {
      const never = makeNameTag('Marmalade');
      const forgiven = makeNameTag('Marmalade');
      setNameTagMood(forgiven, { cross: true });
      forgiven.userData.tagCtx.ops.length = 0;
      const map = forgiven.material.map;
      const before = map.version;

      setNameTagMood(forgiven, { cross: false });

      // Same draw calls as a freshly built neutral tag, modulo the leading
      // clear (a fresh canvas has nothing to clear off).
      const fresh = opsOf(never).filter((o) => o[0] !== 'clearRect');
      const repainted = opsOf(forgiven).filter((o) => o[0] !== 'clearRect');
      expect(repainted).toEqual(fresh);
      expect(map.version).toBeGreaterThan(before);
      expect(forgiven.userData.cross).toBe(false);
      expect(forgiven.userData.revealRange).toBe(NAME_TAG_RANGE);
    });
  });

  // Found by a visual pass, not by these tests: shrink-to-fit originally ran
  // on the cross path ONLY, on the reasoning that just the emoji prefix could
  // overflow a pill. The neutral tag had in fact always overflowed for long
  // names — the pre-v20 builder never measured either — and every test above
  // used 'Marmalade', which fits at 34px and so could never show it.
  //
  // 'Baron von Fluff' is the longest of the 48 shipped CAT_NAMES, and this
  // builder is also shared with remote co-walk pets whose names players type
  // themselves and which no list bounds.
  it('shrinks a long name to fit on BOTH moods, not only the cross one', () => {
    withFakeDocument(() => {
      const long = makeNameTag('Baron von Fluff');
      const short = makeNameTag('Fig');

      // Asserted as "it shrank", not as an absolute pixel budget: this fake
      // context estimates ~0.55em per character, which is wider than a real
      // bold sans face (it makes this name ~280px where the browser measures
      // 242px), so against the real font it lands inside the pill while here
      // it bottoms out on the deliberate MIN_FONT_PX floor. The floor is the
      // design — an unreadable tag is worse than a slightly clipped one — so
      // pinning a width would pin the fake font's error, not the behaviour.
      const px = (tag) => parseInt(labelFontOf(opsOf(tag)).replace(/^bold /, ''), 10);
      expect(px(long)).toBeLessThan(34);

      // A name that already fits is untouched, so no shipped tag that was
      // never broken changes.
      expect(labelFontOf(opsOf(short))).toBe('bold 34px Avenir, sans-serif');
    });
  });

  it('a longest kid-typed name stays a one-line tag and never drops below the floor', () => {
    withFakeDocument((canvases) => {
      const tag = makeNameTag('Abcdefghijklmnop');
      expect(tag.userData.sub).toBeUndefined();
      expect(canvases[0].height).toBe(64);
      const px = parseInt(labelFontOf(opsOf(tag)).replace(/^bold /, ''), 10);
      expect(px).toBeGreaterThanOrEqual(24);
    });
  });

  it('repaints a LONG name back to a tag identical to one that was never cross', () => {
    withFakeDocument(() => {
      // The same round-trip the test above does for 'Marmalade', but with the
      // name that actually exercises the shrink. When only the cross path
      // measured, this reconciled at a shrunk size and then repainted neutral
      // at an unmeasured 34px — bursting the pill at the exact moment the
      // game means to say everything is fine again.
      const never = makeNameTag('Baron von Fluff');
      const forgiven = makeNameTag('Baron von Fluff');
      setNameTagMood(forgiven, { cross: true });
      forgiven.userData.tagCtx.ops.length = 0;
      setNameTagMood(forgiven, { cross: false });

      const fresh = opsOf(never).filter((o) => o[0] !== 'clearRect');
      const repainted = opsOf(forgiven).filter((o) => o[0] !== 'clearRect');
      expect(repainted).toEqual(fresh);
    });
  });

  // Also found by looking rather than by testing: the cross pose raises the
  // tail straight through the tag sprite, from behind the cat — the angle a
  // player chasing one spends nearly all their time at, and the tag whose
  // entire job is being readable from across the park.
  it('lifts a cross tag clear of the raised tail, and lowers it again when forgiven', () => {
    withFakeDocument(() => {
      expect(makeNameTag('Pickles').position.y).toBe(TAG_Y);
      expect(makeNameTag('Pickles', { cross: true }).position.y).toBe(CROSS_TAG_Y);
      expect(CROSS_TAG_Y).toBeGreaterThan(TAG_Y);

      const tag = makeNameTag('Pickles');
      setNameTagMood(tag, { cross: true });
      expect(tag.position.y).toBe(CROSS_TAG_Y);
      setNameTagMood(tag, { cross: false });
      expect(tag.position.y).toBe(TAG_Y); // settles back, not stuck up high
    });
  });

  it('does not repaint when the mood is unchanged, so it is safe to call every frame', () => {
    withFakeDocument(() => {
      const tag = makeNameTag('Marmalade', { cross: true });
      tag.userData.tagCtx.ops.length = 0;
      const before = tag.material.map.version;
      setNameTagMood(tag, { cross: true });
      setNameTagMood(tag, { cross: true });
      expect(opsOf(tag)).toHaveLength(0);
      expect(tag.material.map.version).toBe(before);
    });
  });

  it('defaults to the neutral mood when called with no opts', () => {
    withFakeDocument(() => {
      const tag = makeNameTag('Marmalade', { cross: true });
      setNameTagMood(tag);
      expect(tag.userData.cross).toBe(false);
    });
  });

  it('never touches visibility — reveal stays the caller\'s decision', () => {
    withFakeDocument(() => {
      const tag = makeNameTag('Marmalade');
      tag.visible = true;
      setNameTagMood(tag, { cross: true });
      expect(tag.visible).toBe(true);
      setNameTagMood(tag, { cross: false });
      expect(tag.visible).toBe(true);
    });
  });
});

describe('tag heights follow the taller cat', () => {
  it('tags clear the taller cat by the same margins as before', () => {
    expect(TAG_Y - poseMeasure(buildCat('tabby'), 'follow').max).toBeGreaterThanOrEqual(1.05 - BASELINE.tabby.follow.max - 1e-9);
    expect(CROSS_TAG_Y - poseMeasure(buildCat('tabby'), 'cross').max).toBeGreaterThanOrEqual(1.32 - BASELINE.tabby.cross.max - 1e-9);
    expect(CROSS_TAG_Y).toBeGreaterThan(TAG_Y);
  });
});

// Clan Life Part 1, Task 3: a clan cat's tag has a second, smaller line,
// "warrior of StormClan". Every other tag is untouched.
describe('the two-line tag (opts.sub)', () => {
  const texts = (ops) => ops.filter((o) => o[0] === 'fillText');
  const px = (op) => parseInt(op[1].replace(/^bold /, ''), 10);

  it('a tag with no sub paints exactly what it always did', () => {
    withFakeDocument((canvases) => {
      const tag = makeNameTag('Thornfur');
      expect([canvases[0].width, canvases[0].height]).toEqual([256, 64]);
      expect(opsOf(tag)).toEqual([
        ['clearRect', 0, 0, 256, 64],
        ['beginPath'],
        ['roundRect', 28, 8, 200, 48, 22],
        ['fill', 'rgba(20,26,38,0.7)'],
        ['fillText', 'bold 34px Avenir, sans-serif', '#fff', 'Thornfur', 128, 42],
      ]);
      expect(tag.scale.y).toBeCloseTo(0.35);
      expect(tag.userData.sub).toBeUndefined();
    });
  });

  it('paints the name on top and the sub smaller below, on a taller canvas and sprite', () => {
    withFakeDocument((canvases) => {
      const tag = makeNameTag('Thornfur', { sub: 'x of Y' });
      // Polish 2: half as wide again, so the rank line fits at a readable size.
      expect([canvases[0].width, canvases[0].height]).toEqual([384, 96]);
      const t = texts(opsOf(tag));
      expect(t).toHaveLength(2);
      expect(t[0][3]).toBe('Thornfur');
      expect(t[1][3]).toBe('x of Y');
      expect(t[1][5]).toBeGreaterThan(t[0][5]); // below
      expect(px(t[1])).toBeLessThan(px(t[0]));
      expect(px(t[1])).toBeCloseTo(px(t[0]) * 0.7, -1);
      expect(tag.scale.x).toBeCloseTo(2.1); // 1.4 x 384/256: same letter size
      expect(tag.userData.subPx).toBe(px(t[1]));
      expect(tag.scale.y).toBeCloseTo(0.525);
      expect(tag.userData.sub).toBe('x of Y');
    });
  });

  it('shrinks a long sub to fit inside the pill', () => {
    withFakeDocument(() => {
      const tag = makeNameTag('Thornfur', { sub: 'apprentice of StormClan' });
      const ops = opsOf(tag);
      const pill = ops.find((o) => o[0] === 'roundRect');
      const sub = texts(ops)[1];
      const w = [...sub[3]].length * 0.55 * px(sub);
      expect(w).toBeLessThanOrEqual(pill[3]);
    });
  });

  it('setNameTagMood repaints both lines', () => {
    withFakeDocument(() => {
      const tag = makeNameTag('Thornfur', { sub: 'x of Y' });
      const ops = opsOf(tag);
      ops.length = 0;
      setNameTagMood(tag, { cross: true });
      expect(texts(ops)).toHaveLength(2);
      expect(texts(ops)[1][3]).toBe('x of Y');
      expect(tag.scale.y).toBeCloseTo(0.525);
      ops.length = 0;
      setNameTagMood(tag, { cross: false });
      expect(texts(ops).map((o) => o[3])).toEqual(['Thornfur', 'x of Y']);
    });
  });

  it('an empty sub is no sub', () => {
    withFakeDocument((canvases) => {
      makeNameTag('Thornfur', { sub: '' });
      expect(canvases[0].height).toBe(64);
    });
  });
});

// Cat builder: her own cat's tag carries a typed name of up to 16 letters.
describe('makeNameTag fit (her own cat)', () => {
  const pxOf = (ops) => parseInt(labelFontOf(ops).replace(/^bold /, ''), 10);
  const pillOf = (ops) => ops.find((o) => o[0] === 'roundRect');

  it('a 16-letter name shrinks, stays at least 24 px and fits its pill', () => {
    withFakeDocument(() => {
      const tag = makeNameTag('Moonwhisker-Fern', { fit: true });
      const ops = opsOf(tag);
      const px = pxOf(ops);
      expect(px).toBeLessThan(34);
      expect(px).toBeGreaterThanOrEqual(24);
      const pill = pillOf(ops);
      expect(16 * 0.55 * px).toBeLessThanOrEqual(pill[3] - 20);
      expect(tag.userData.fit).toBe(true);
    });
  });

  it('the same name without fit overflows the plain pill at the floor (why fit exists)', () => {
    withFakeDocument(() => {
      const ops = opsOf(makeNameTag('Moonwhisker-Fern'));
      expect(pxOf(ops)).toBe(24);
      expect(16 * 0.55 * 24).toBeGreaterThan(pillOf(ops)[3] - 20);
    });
  });

  it('no opts paints exactly what fit:false paints, and keeps no fit flag', () => {
    withFakeDocument(() => {
      const a = makeNameTag('Moonwhisker-Fern');
      const b = makeNameTag('Moonwhisker-Fern', { fit: false });
      expect(opsOf(a)).toEqual(opsOf(b));
      expect(a.userData.fit).toBeUndefined();
      expect(a.scale.x).toBe(1.4);
    });
  });

  it('a mood repaint keeps the wide pill', () => {
    withFakeDocument(() => {
      const tag = makeNameTag('Moonwhisker-Fern', { fit: true });
      const before = [...opsOf(tag)];
      opsOf(tag).length = 0;
      setNameTagMood(tag, { cross: true });
      setNameTagMood(tag, { cross: false });
      const after = opsOf(tag).slice(opsOf(tag).findLastIndex((o) => o[0] === 'clearRect'));
      expect(after).toEqual(before);
    });
  });
});

describe('tagBudget (camp declutter)', () => {
  const mk = (d, keep = false, range = 4) => ({ d, range, keep });
  it('constants', () => { expect([CAMP_TAG_MAX, TAG_FADE_M]).toEqual([2, 1]); });
  it('shows only the two nearest of eight; the nearest is opaque', () => {
    const es = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 3.9].map((d) => mk(d)).reverse();
    const m = tagBudget(es);
    expect(m.size).toBe(2);
    expect([...m.keys()].map((e) => e.d).sort((a, b) => a - b)).toEqual([0.5, 1]);
    expect(m.get(es.find((e) => e.d === 0.5))).toBe(1);
  });
  it('a keep entry far out is shown alongside the nearest', () => {
    const es = [mk(0.5), mk(1), mk(1.5), mk(3.5, true)];
    const m = tagBudget(es);
    expect(m.size).toBe(2);
    expect(m.has(es[3])).toBe(true);
    expect(m.has(es[0])).toBe(true);
    expect(m.get(es[0])).toBe(1);
    expect(m.get(es[3])).toBeCloseTo(0.5, 9);
  });
  it('out of range is never shown; empty gives empty', () => {
    expect(tagBudget([mk(4), mk(5)]).size).toBe(0);
    expect(tagBudget([]).size).toBe(0);
    const far = mk(3.5);
    const m = tagBudget([mk(1), far]);
    expect(m.get(far)).toBeCloseTo(0.5, 9);
  });
  it('a lone tag near the range edge is still fully shown', () => {
    const e = mk(3.9);
    expect(tagBudget([e]).get(e)).toBe(1);
  });
});
