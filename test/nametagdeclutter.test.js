import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import {
  declutterTags, TAG_GAP_PX, SUB_DROP_KEEP, LIFT_MAX_TAGS,
  makeNameTag, setNameTagMood, fitTagToView,
} from '../src/nametag.js';

// Name tags step aside for each other and for the HUD: the farther of two
// overlapping tags drops its rank line, then nudges up, then hides; a tag on
// a HUD box hides. Decided from last frame's natural rects (see nametag.js).

const W = 1280, H = 720;
const ent = (rect, depth, sub = false) => ({ rect, depth, sub });
const NONE = { hide: false, dropSub: false, lift: 0 };

describe('declutterTags', () => {
  it('exports its tuning', () => {
    expect(TAG_GAP_PX).toBe(4);
    expect(SUB_DROP_KEEP).toBeCloseTo(2 / 3, 12);
    expect(LIFT_MAX_TAGS).toBe(1.5);
  });

  it('two apart tags are untouched', () => {
    const a = ent({ l: 100, t: 100, r: 300, b: 160 }, 4);
    const b = ent({ l: 100, t: 260, r: 300, b: 320 }, 6);
    const out = declutterTags([a, b]);
    expect(out.get(a)).toEqual(NONE);
    expect(out.get(b)).toEqual(NONE);
  });

  it('the farther two-line tag drops its subtitle first', () => {
    const near = ent({ l: 100, t: 100, r: 300, b: 160 }, 4);
    const far = ent({ l: 120, t: 150, r: 320, b: 240 }, 6, true);
    // list order far-first: depth decides, not order
    const out = declutterTags([far, near]);
    expect(out.get(near)).toEqual(NONE);
    expect(out.get(far)).toEqual({ hide: false, dropSub: true, lift: 0 });
  });

  it('then it is nudged up', () => {
    // (The brief's far rect t:140/b:200 needs a 104 px lift, over the
    // 1.5 x 60 = 90 px cap; this one sits 20 px higher so the lift fits.)
    const near = ent({ l: 100, t: 100, r: 300, b: 160 }, 4);
    const far = ent({ l: 120, t: 120, r: 320, b: 180 }, 6);
    const out = declutterTags([near, far]);
    const d = out.get(far);
    expect(d.hide).toBe(false);
    expect(d.dropSub).toBe(false);
    expect(d.lift).toBe(180 - 100 + TAG_GAP_PX);
    expect(d.lift).toBeLessThanOrEqual(LIFT_MAX_TAGS * 60);
    expect(out.get(near)).toEqual(NONE);
  });

  it('a lift past the cap hides the tag', () => {
    const near = ent({ l: 100, t: 100, r: 300, b: 160 }, 4);
    const far = ent({ l: 120, t: 140, r: 320, b: 200 }, 6); // needs 104 > 90
    expect(declutterTags([near, far]).get(far).hide).toBe(true);
  });

  it("a tag that can't clear is hidden", () => {
    // exactly on top of the near one, near the top of the screen: the lift
    // would push it off the top
    const near = ent({ l: 100, t: 30, r: 300, b: 90 }, 4);
    const far = ent({ l: 100, t: 30, r: 300, b: 90 }, 6);
    const out = declutterTags([near, far]);
    expect(out.get(far).hide).toBe(true);
    expect(out.get(near)).toEqual(NONE);
  });

  it('equal depths: list order decides who stays', () => {
    const a = ent({ l: 100, t: 30, r: 300, b: 90 }, 5);
    const b = ent({ l: 100, t: 30, r: 300, b: 90 }, 5);
    const out = declutterTags([a, b]);
    expect(out.get(a).hide).toBe(false);
    expect(out.get(b).hide).toBe(true);
  });

  it('a tag on a HUD box is hidden; the nearest too', () => {
    const hud = [{ l: 0, t: 680, r: 1280, b: 705 }];
    const only = ent({ l: 500, t: 660, r: 700, b: 700 }, 3);
    expect(declutterTags([only], hud).get(only).hide).toBe(true);
    const clear = ent({ l: 500, t: 600, r: 700, b: 660 }, 5);
    const out = declutterTags([only, clear], hud);
    expect(out.get(only).hide).toBe(true);
    expect(out.get(clear)).toEqual(NONE); // a hidden tag takes no room
  });

  it('decisions are stable when applied', () => {
    const list = [
      ent({ l: 100, t: 100, r: 300, b: 160 }, 4),
      ent({ l: 120, t: 150, r: 320, b: 240 }, 6, true),
      ent({ l: 120, t: 120, r: 320, b: 180 }, 7),
      ent({ l: 100, t: 100, r: 300, b: 160 }, 9),
    ];
    const hud = [{ l: 0, t: 680, r: 1280, b: 705 }];
    const a = declutterTags(list, hud);
    const snap = new Map([...a].map(([k, v]) => [k, { ...v }]));
    const b = declutterTags(list, hud, a); // reusing the out map too
    expect(b).toBe(a);
    expect(new Map([...b].map(([k, v]) => [k, { ...v }]))).toEqual(snap);
    expect(declutterTags(list, hud)).toEqual(snap);
  });
});

describe('fitTagToView rectOut', () => {
  it('fills the natural rect in CSS px, and leaves it alone off screen', () => {
    const cat = new THREE.Group();
    cat.position.set(0, 0, -7); // 7 m: inside the size band, so the natural size
    const tag = new THREE.Sprite(new THREE.SpriteMaterial());
    tag.scale.set(1.4, 0.35, 1);
    tag.position.y = 1.18;
    cat.add(tag);
    cat.updateMatrixWorld(true);
    const cam = new THREE.PerspectiveCamera(70, W / H, 0.1, 300);
    cam.position.set(0, 1.2, 0);
    cam.lookAt(0, 1.2, -7);
    cam.updateMatrixWorld(true);
    const r = {};
    fitTagToView(tag, cam, W, H, -Infinity, r);
    const p = new THREE.Vector3().setFromMatrixPosition(tag.matrixWorld).project(cam);
    const cx = (p.x + 1) / 2 * W, cy = (1 - p.y) / 2 * H;
    expect((r.l + r.r) / 2).toBeCloseTo(cx, 6);
    expect((r.t + r.b) / 2).toBeCloseTo(cy, 6);
    const k = H / (2 * Math.tan(THREE.MathUtils.degToRad(35)) * 7);
    expect(r.b - r.t).toBeCloseTo(0.35 * k, 6);
    expect(r.r - r.l).toBeCloseTo(1.4 * k, 6);
    expect(r.depth).toBeCloseTo(7, 9);
    // off the side: untouched
    cat.position.set(40, 0, -7);
    cat.updateMatrixWorld(true);
    const off = { l: 1 };
    fitTagToView(tag, cam, W, H, -Infinity, off);
    expect(off).toEqual({ l: 1 });
  });
});

describe('the render-time glue', () => {
  let prev;
  beforeAll(() => {
    prev = globalThis.document;
    globalThis.document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => ({ width: 10 }) }) }),
    };
  });
  afterAll(() => {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  });

  const cam = new THREE.PerspectiveCamera(70, W / H, 0.1, 300);
  cam.position.set(0, 1.4, 0);
  cam.lookAt(0, 1.4, -6);
  cam.updateMatrixWorld(true);

  // y: the far cat stands lower, so on screen its tag overlaps only the
  // nearer tag's lower part, and dropping its rank line is enough to clear.
  function catTag(x, z, opts, y = 0) {
    const cat = new THREE.Group();
    cat.position.set(x, y, z);
    const tag = makeNameTag('Cragstar', opts);
    tag.visible = true;
    cat.add(tag);
    cat.updateMatrixWorld(true);
    return { cat, tag };
  }

  it('fitOnRender with a bare renderer', () => {
    const { tag } = catTag(0, -5, { sub: 'leader of CliffClan' });
    const bare = { getSize: (v) => v.set(W, H) };
    expect(() => {
      tag.onBeforeRender(bare, null, cam);
      tag.onBeforeRender(bare, null, cam);
    }).not.toThrow();
    // exactly what fitTagToView alone gives
    const solo = tag.matrixWorld.clone();
    fitTagToView(tag, cam, W, H);
    expect(tag.matrixWorld.equals(solo)).toBe(true);
  });

  it('a dropped subtitle swaps to a one-line texture and back', () => {
    const near = catTag(0, -5, { sub: 'leader of CliffClan' });
    const far = catTag(0.1, -5.6, { sub: 'warrior of CliffClan' }, -0.52);
    const info = { render: { frame: 1 } };
    const r = { getSize: (v) => v.set(W, H), info };
    const frame = (n) => {
      info.render.frame = n;
      near.tag.onBeforeRender(r, null, cam);
      far.tag.onBeforeRender(r, null, cam);
    };
    frame(1);
    const sy0 = Math.hypot(...far.tag.matrixWorld.elements.slice(4, 7));
    const map0 = far.tag.material.map;
    const nearMap0 = near.tag.material.map;
    frame(2);
    expect(far.tag.userData.fullMap).toBe(map0);
    expect(far.tag.material.map).not.toBe(far.tag.userData.fullMap);
    expect(far.tag.material.map).toBe(far.tag.userData.shortMap);
    const sy2 = Math.hypot(...far.tag.matrixWorld.elements.slice(4, 7));
    expect(sy2 / sy0).toBeCloseTo(0.35 / 0.525, 9);
    expect(near.tag.material.map).toBe(nearMap0); // the nearer tag keeps its two lines
    // apart: two frames later it is whole again
    far.cat.position.set(4, -0.52, -5.6);
    far.cat.updateMatrixWorld(true);
    frame(3);
    frame(4);
    expect(far.tag.material.map).toBe(far.tag.userData.fullMap);
    expect(Math.hypot(...far.tag.matrixWorld.elements.slice(4, 7))).toBeCloseTo(sy0, 6);
  });

  it('setNameTagMood refreshes the short texture', () => {
    const near = catTag(0, -5, { sub: 'leader of CliffClan' });
    const far = catTag(0.1, -5.6, { sub: 'warrior of CliffClan' }, -0.52);
    const info = { render: { frame: 100 } };
    const r = { getSize: (v) => v.set(W, H), info };
    for (let n = 100; n < 102; n++) {
      info.render.frame = n;
      near.tag.onBeforeRender(r, null, cam);
      far.tag.onBeforeRender(r, null, cam);
    }
    const short = far.tag.userData.shortMap;
    expect(short).toBeTruthy();
    expect(far.tag.userData.shortCross).toBe(false);
    const v0 = short.version;
    const vf = far.tag.userData.fullMap.version;
    setNameTagMood(far.tag, { cross: true });
    expect(short.version).toBeGreaterThan(v0);
    expect(far.tag.userData.fullMap.version).toBeGreaterThan(vf);
    expect(far.tag.userData.shortCross).toBe(true);
  });
});
