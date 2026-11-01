import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeNameTag, fitTagToView, TAG_PX_MIN, TAG_PX_MAX, TAG_EDGE_PX } from '../src/nametag.js';

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
        expect(onScreen(tag, cam).lineH).toBeCloseTo(TAG_PX_MAX, 3);
      }
    } finally {
      if (prev === undefined) delete globalThis.document;
      else globalThis.document = prev;
    }
  });
});
