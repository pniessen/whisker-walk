import { describe, it, expect } from 'vitest';
import {
  makeNameTag,
  setNameTagMood,
  NAME_TAG_RANGE,
  CROSS_NAME_TAG_RANGE,
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
  // D2: remote co-walk pets, ghost visitors and the named family pets share
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
      expect(tag.position.y).toBeCloseTo(1.05);
      expect(tag.userData.cross).toBe(false);
      expect(tag.userData.revealRange).toBe(NAME_TAG_RANGE);
    });
  });

  it('is a no-op without a document, as callers rely on', () => {
    expect(makeNameTag('Marmalade')).toBe(null);
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
