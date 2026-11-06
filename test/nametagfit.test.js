import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  makeNameTag, fitTagToView, fitBubbleOnRender, TAG_PX_MIN, TAG_PX_MAX, TAG_EDGE_PX, SUB_PX_AT_CAP,
  TAG_PULL_M, TAG_PULL_SHARE,
} from '../src/nametag.js';

// A name tag keeps a readable, capped size on screen whatever its distance,
// and stays inside the screen's edges (or hides, when its cat is off screen).
// fitTagToView works on the tag's matrixWorld only, at render time, so the
// tag's own position and scale (what the game and its tests read) never move.

const W = 1280, H = 720;
const renderer = { getSize: (v) => v.set(W, H) };

function camAt(pos, at, { w = W, h = H } = {}) {
  const cam = new THREE.PerspectiveCamera(70, w / h, 0.1, 300);
  cam.position.set(...pos);
  cam.lookAt(...at);
  cam.updateMatrixWorld(true);
  return cam;
}

// A cat group holding a one-line tag (1.4 x 0.35) at y 1.18, or a two-line
// one (1.4 x 0.525), the way makeNameTag builds them, scaled 0.85 like a stray.
function catWithTag(x, z, { twoLine = false } = {}) {
  const cat = new THREE.Group();
  cat.position.set(x, 0, z);
  cat.scale.setScalar(0.85);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial());
  tag.scale.set(1.4, twoLine ? 0.525 : 0.35, 1);
  tag.position.y = 1.18;
  if (twoLine) tag.userData.sub = 'elder of StormClan';
  cat.add(tag);
  const scene = new THREE.Scene();
  scene.add(cat);
  scene.updateMatrixWorld(true);
  return tag;
}

// The rendered tag, in CSS px: its centre and its one-line height.
function onScreen(tag, cam, { w = W, h = H } = {}) {
  const e = tag.matrixWorld.elements;
  const sy = Math.hypot(e[4], e[5], e[6]);
  const sx = Math.hypot(e[0], e[1], e[2]);
  const p = new THREE.Vector3().setFromMatrixPosition(tag.matrixWorld);
  const depth = -p.clone().applyMatrix4(cam.matrixWorldInverse).z;
  const k = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * depth);
  const ndc = p.clone().project(cam);
  const lines = tag.userData.sub ? 1.5 : 1;
  return {
    x: (ndc.x + 1) / 2 * w, y: (1 - ndc.y) / 2 * h,
    lineH: (sy / lines) * k, h: sy * k, w: sx * k,
  };
}

describe('fitTagToView', () => {
  it('caps a tag right in front of the camera at TAG_PX_MAX', () => {
    const tag = catWithTag(0, 0);
    const cam = camAt([0, 1.2, 1.4], [0, 1, 0]);
    fitTagToView(tag, cam, W, H);
    expect(onScreen(tag, cam).lineH).toBeCloseTo(TAG_PX_MAX, 3);
  });

  it('grows a far tag up to TAG_PX_MIN', () => {
    const tag = catWithTag(0, -20);
    const cam = camAt([0, 2, 0], [0, 1, -20]);
    fitTagToView(tag, cam, W, H);
    expect(onScreen(tag, cam).lineH).toBeCloseTo(TAG_PX_MIN, 3);
  });

  it('leaves a tag at an ordinary walking distance its natural size and place', () => {
    const tag = catWithTag(0, -5);
    const cam = camAt([0, 2.2, 0.5], [0, 0.5, -5]);
    const natural = tag.matrixWorld.clone();
    fitTagToView(tag, cam, W, H);
    const px = onScreen(tag, cam).lineH;
    expect(px).toBeGreaterThan(TAG_PX_MIN);
    expect(px).toBeLessThan(TAG_PX_MAX);
    expect(tag.matrixWorld.elements.map((v) => +v.toFixed(9))).toEqual(natural.elements.map((v) => +v.toFixed(9)));
  });

  it('sizes a two-line tag by its letters, so its name matches a one-line tag', () => {
    const one = catWithTag(0, 0);
    const two = catWithTag(0, 0, { twoLine: true });
    const cam = camAt([0, 1.2, 1.4], [0, 1, 0]);
    fitTagToView(one, cam, W, H);
    fitTagToView(two, cam, W, H);
    expect(onScreen(two, cam).lineH).toBeCloseTo(onScreen(one, cam).lineH, 3);
  });

  it('keeps its lower edge where it was when it is shrunk or grown', () => {
    const tag = catWithTag(0, 0);
    const cam = camAt([0, 1.2, 1.4], [0, 1, 0]);
    const e = tag.matrixWorld.elements;
    const bottomBefore = e[13] - Math.hypot(e[4], e[5], e[6]) / 2;
    fitTagToView(tag, cam, W, H);
    const bottomAfter = e[13] - Math.hypot(e[4], e[5], e[6]) / 2;
    expect(bottomAfter).toBeCloseTo(bottomBefore, 2);
  });

  it('slides a tag that would cross the right edge back inside it', () => {
    const tag = catWithTag(0, 0);
    // the cat a little in from the right edge, close up, on a phone
    const cam = camAt([0, 1.3, 2.2], [-0.6, 1.1, 0], { w: 375, h: 812 });
    const anchor = new THREE.Vector3().setFromMatrixPosition(tag.matrixWorld).project(cam);
    expect(Math.abs(anchor.x)).toBeLessThan(1); // the cat itself is on screen
    fitTagToView(tag, cam, 375, 812);
    const s = onScreen(tag, cam, { w: 375, h: 812 });
    expect(s.x + s.w / 2).toBeLessThanOrEqual(375 - TAG_EDGE_PX + 1e-6);
    expect(s.x - s.w / 2).toBeGreaterThanOrEqual(TAG_EDGE_PX - 1e-6);
  });

  it('pulls a tag down under the top edge', () => {
    const tag = catWithTag(0, 0);
    const cam = camAt([0, 0.6, 1.6], [0, 0.4, 0]); // looking low: the tag would be above the top
    fitTagToView(tag, cam, W, H);
    const s = onScreen(tag, cam);
    expect(s.y - s.h / 2).toBeGreaterThanOrEqual(TAG_EDGE_PX - 1e-6);
  });

  it('hides (zero scale) a tag whose cat is off the side of the screen', () => {
    const tag = catWithTag(0, 0);
    const cam = camAt([0, 1.3, 2], [6, 1.3, 0]);
    fitTagToView(tag, cam, W, H);
    const e = tag.matrixWorld.elements;
    expect(Math.hypot(e[0], e[1], e[2])).toBe(0);
  });

  it('is idempotent: fitting twice in a frame (a second camera) starts from the natural matrix', () => {
    const tag = catWithTag(0, 0);
    const cam = camAt([0, 1.2, 1.4], [0, 1, 0]);
    fitTagToView(tag, cam, W, H);
    const once = tag.matrixWorld.clone();
    fitTagToView(tag, cam, W, H);
    expect(tag.matrixWorld.equals(once)).toBe(true);
    expect(tag.scale.x).toBeCloseTo(1.4); // local scale never touched
  });

  it('leaves non-perspective cameras alone', () => {
    const tag = catWithTag(0, 0);
    const before = tag.matrixWorld.clone();
    fitTagToView(tag, new THREE.OrthographicCamera(), W, H);
    expect(tag.matrixWorld.equals(before)).toBe(true);
  });
});

describe('makeNameTag wires the fit in', () => {
  it('every tag fits itself at render time through onBeforeRender', () => {
    const prev = globalThis.document;
    globalThis.document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => ({ width: 10 }) }) }),
    };
    try {
      for (const opts of [{}, { cross: true }, { legend: true }, { sub: 'warrior of StormClan' }]) {
        const tag = makeNameTag('Pickles', opts);
        const cat = new THREE.Group();
        cat.add(tag);
        cat.updateMatrixWorld(true);
        const cam = camAt([0, 1.2, 1.4], [0, 1, 0]);
        tag.onBeforeRender(renderer, null, cam);
        // A two-line tag's cap rises until its rank line is readable (Polish 2).
        const cap = opts.sub ? Math.max(TAG_PX_MAX, (SUB_PX_AT_CAP * 64) / tag.userData.subPx) : TAG_PX_MAX;
        expect(onScreen(tag, cam).lineH).toBeCloseTo(cap, 3);
      }
    } finally {
      if (prev === undefined) delete globalThis.document;
      else globalThis.document = prev;
    }
  });
});

describe('chat bubbles fit and stack above the fitted tag', () => {
  it('a bubble right in front of the camera is capped like a tag, and sits above the tag', async () => {
    const { fitBubbleOnRender } = await import('../src/nametag.js');
    const tag = catWithTag(0, 0);
    const cat = tag.parent;
    tag.userData.tagCtx = {}; // what makeNameTag hangs on a real tag
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial());
    bubble.scale.set(1.9, 0.57, 1);
    bubble.position.y = 1.18 + 0.5;
    bubble.userData.fitLines = (34 / 64) / (40 / 96);
    cat.add(bubble);
    cat.updateMatrixWorld(true);
    const cam = camAt([0, 1.2, 1.4], [0, 1, 0]);
    fitTagToView(tag, cam, W, H);
    fitBubbleOnRender.call(bubble, renderer, null, cam);
    const be = bubble.matrixWorld.elements;
    const bsy = Math.hypot(be[4], be[5], be[6]);
    const p = new THREE.Vector3().setFromMatrixPosition(bubble.matrixWorld);
    const depth = -p.clone().applyMatrix4(cam.matrixWorldInverse).z;
    const k = H / (2 * Math.tan(THREE.MathUtils.degToRad(35)) * depth);
    expect((bsy / bubble.userData.fitLines) * k).toBeCloseTo(TAG_PX_MAX, 3);
    const te = tag.matrixWorld.elements;
    expect(be[13] - bsy / 2).toBeGreaterThanOrEqual(te[13] + Math.hypot(te[4], te[5], te[6]) / 2);
  });

  it('a far tag grown to TAG_PX_MIN pushes its bubble up, never under it', async () => {
    const { fitBubbleOnRender } = await import('../src/nametag.js');
    const tag = catWithTag(0, -30);
    const cat = tag.parent;
    tag.userData.tagCtx = {};
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial());
    bubble.scale.set(1.9, 0.57, 1);
    bubble.position.y = 1.68;
    bubble.userData.fitLines = (34 / 64) / (40 / 96);
    cat.add(bubble);
    cat.updateMatrixWorld(true);
    const cam = camAt([0, 2, 0], [0, 1.5, -30]);
    fitTagToView(tag, cam, W, H);
    fitBubbleOnRender.call(bubble, renderer, null, cam);
    const be = bubble.matrixWorld.elements;
    const te = tag.matrixWorld.elements;
    expect(be[13] - Math.hypot(be[4], be[5], be[6]) / 2)
      .toBeGreaterThanOrEqual(te[13] + Math.hypot(te[4], te[5], te[6]) / 2);
  });
});

// Tags are depth-tested sprites, so a cat body or the Highrock just in front
// of a tag hid part of it (the deputy's, behind the leader on the rock). In
// the frame path each fitted tag is pulled toward the camera along its view
// ray, shrunk by the same ratio: the same screen rect, drawn nearer.
describe('the pull toward the camera', () => {
  const fakeDoc = {
    createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => ({ width: 10 }) }) }),
  };
  let prev;
  const withDoc = (fn) => {
    prev = globalThis.document;
    globalThis.document = fakeDoc;
    try { return fn(); } finally {
      if (prev === undefined) delete globalThis.document;
      else globalThis.document = prev;
    }
  };

  // The sprite's screen rect (CSS px, y down), from its corners in view space.
  function rectOf(tag, cam) {
    const e = tag.matrixWorld.elements;
    const sx = Math.hypot(e[0], e[1], e[2]);
    const sy = Math.hypot(e[4], e[5], e[6]);
    const c = new THREE.Vector3(e[12], e[13], e[14]).applyMatrix4(cam.matrixWorldInverse);
    const px = (dx, dy) => {
      const v = new THREE.Vector3(c.x + dx, c.y + dy, c.z).applyMatrix4(cam.projectionMatrix);
      return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H };
    };
    const a = px(-sx / 2, sy / 2), b = px(sx / 2, -sy / 2);
    return { l: a.x, t: a.y, r: b.x, b: b.y, depth: -c.z };
  }

  function frameTag(catPos, opts = { sub: 'leader of BrookClan' }) {
    return withDoc(() => {
      const cat = new THREE.Group();
      cat.position.set(...catPos);
      const tag = makeNameTag('Minnowstar', opts);
      tag.visible = true;
      cat.add(tag);
      cat.updateMatrixWorld(true);
      return tag;
    });
  }
  let frameNo = 1000;
  const frameRenderer = () => ({ getSize: (v) => v.set(W, H), info: { render: { frame: ++frameNo } } });

  it('exports its tuning', () => {
    expect(TAG_PULL_M).toBe(1.5);
    expect(TAG_PULL_SHARE).toBe(0.4);
  });

  for (const [label, catPos, camPos, at] of [
    ['off to the side, far enough for the full pull', [1.6, 0, -5], [0, 1.8, 0.6], [0, 0.8, -5]],
    ['close, so 40 % of its depth', [0.3, 0, -1], [0, 1.6, 0.6], [0, 1, -1]],
  ]) {
    it(`a pulled tag keeps its screen rect and sits p m nearer (${label})`, () => {
      const tag = frameTag(catPos);
      const cam = camAt(camPos, at);
      fitTagToView(tag, cam, W, H);
      const r0 = rectOf(tag, cam);
      const p0 = new THREE.Vector3().setFromMatrixPosition(tag.matrixWorld);
      const e0 = tag.matrixWorld.elements;
      const top0 = e0[13] + Math.hypot(e0[4], e0[5], e0[6]) / 2;
      tag.onBeforeRender(frameRenderer(), null, cam);
      const r1 = rectOf(tag, cam);
      for (const k of ['l', 't', 'r', 'b']) expect(Math.abs(r1[k] - r0[k])).toBeLessThan(0.5);
      const pull = Math.min(TAG_PULL_M, TAG_PULL_SHARE * r0.depth);
      expect(pull).toBeGreaterThan(0);
      const p1 = new THREE.Vector3().setFromMatrixPosition(tag.matrixWorld);
      const d0 = p0.distanceTo(cam.position), d1 = p1.distanceTo(cam.position);
      expect(d0 - d1).toBeCloseTo(pull, 6);
      // along the ray: the camera, the old and the new centre in one line
      const u0 = p0.clone().sub(cam.position).normalize();
      const u1 = p1.clone().sub(cam.position).normalize();
      expect(u0.distanceTo(u1)).toBeLessThan(1e-9);
      expect(r1.depth).toBeGreaterThan(cam.near);
      expect(tag.userData.fitTop).toBeCloseTo(top0, 9);
    });
  }

  it('a tag under 1 m deep is not pulled', () => {
    const tag = frameTag([0, 0, 0], {});
    const cam = camAt([0, 1.18, 0.8], [0, 1.18, 0]);
    fitTagToView(tag, cam, W, H);
    const fitted = tag.matrixWorld.clone();
    tag.onBeforeRender(frameRenderer(), null, cam);
    expect(tag.matrixWorld.equals(fitted)).toBe(true);
    expect(Number.isFinite(tag.userData.fitTop)).toBe(false);
  });

  it('the chat bubble still sits above the pulled tag, in the world and on screen', () => {
    const tag = frameTag([0.8, 0, -4]);
    const cat = tag.parent;
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial());
    bubble.scale.set(1.9, 0.57, 1);
    bubble.position.y = tag.position.y + 0.5;
    bubble.userData.fitLines = (34 / 64) / (40 / 96);
    cat.add(bubble);
    cat.updateMatrixWorld(true);
    const cam = camAt([0, 1.4, 1], [0, 1.1, -4]);
    fitTagToView(tag, cam, W, H);
    const r0 = rectOf(tag, cam);
    const fr = frameRenderer(); // one frame: the tag, then its bubble
    tag.onBeforeRender(fr, null, cam);
    fitBubbleOnRender.call(bubble, fr, null, cam);
    const be = bubble.matrixWorld.elements;
    expect(be[13] - Math.hypot(be[4], be[5], be[6]) / 2).toBeGreaterThanOrEqual(tag.userData.fitTop);
    const rb = rectOf(bubble, cam), rt = rectOf(tag, cam);
    expect(rb.b).toBeLessThanOrEqual(rt.t);
    expect(rb.b).toBeLessThanOrEqual(r0.t);
  });

  it('a bubble fitted on a later frame than its tag was pulled ignores the stale fitTop', () => {
    // frame N: the tag is fitted and pulled; frame N + 1: the tag is
    // frustum-culled (no onBeforeRender) but its bubble still draws
    const tag = frameTag([0.8, 0, -4]);
    const cat = tag.parent;
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial());
    bubble.scale.set(1.9, 0.57, 1);
    bubble.position.y = tag.position.y + 0.5;
    bubble.userData.fitLines = (34 / 64) / (40 / 96);
    cat.add(bubble);
    cat.updateMatrixWorld(true);
    const cam = camAt([0, 1.4, 1], [0, 1.1, -4]);
    fitTagToView(tag, cam, W, H);
    const frN = frameRenderer();
    tag.onBeforeRender(frN, null, cam);
    expect(Number.isFinite(tag.userData.fitTop)).toBe(true);
    // stand in for a stale fitTop (the cat has since moved) with one far
    // above: read, it would push the bubble sky-high
    tag.userData.fitTop = 50;
    const frN1 = { getSize: (v) => v.set(W, H), info: { render: { frame: frN.info.render.frame + 1 } } };
    fitBubbleOnRender.call(bubble, frN1, null, cam);
    const be = bubble.matrixWorld.elements;
    const te = tag.matrixWorld.elements;
    const live = te[13] + Math.hypot(te[4], te[5], te[6]) / 2;
    const bottom = be[13] - Math.hypot(be[4], be[5], be[6]) / 2;
    expect(bottom).toBeGreaterThanOrEqual(live);
    expect(bottom).toBeLessThan(10);
  });

  it('a tag fitted on a bare renderer clears fitTop', () => {
    const tag = frameTag([0.8, 0, -4]);
    const cam = camAt([0, 1.4, 1], [0, 1.1, -4]);
    fitTagToView(tag, cam, W, H);
    tag.onBeforeRender(frameRenderer(), null, cam);
    expect(Number.isFinite(tag.userData.fitTop)).toBe(true);
    tag.onBeforeRender(renderer, null, cam);
    expect(Number.isFinite(tag.userData.fitTop)).toBe(false);
  });
});
