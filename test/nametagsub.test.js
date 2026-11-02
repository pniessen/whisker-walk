import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeNameTag, fitTagToView, TAG_PX_MAX, SUB_PX_AT_CAP } from '../src/nametag.js';

// Polish 2, item 3: at the size cap a clan cat's second line ("elder of
// StormClan") came out about 10-11 CSS px, too small to read. It now stays at
// least SUB_PX_AT_CAP (13) CSS px tall at the cap, on a phone and a desktop,
// and a one-line tag is no bigger than it was.

// A canvas whose measureText is Avenir-Heavy-ish (0.6 em a letter, a little
// wider than the 0.55 the older tests use, so the long lines really shrink).
function withDoc(fn) {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const ctx = new Proxy({ font: '' }, {
        get: (t, k) => {
          if (k in t) return t[k];
          if (k === 'measureText') return (s) => ({ width: 0.6 * String(s).length * (parseInt(t.font.replace(/^bold /, ''), 10) || 34) });
          return () => {};
        },
        set: (t, k, v) => { t[k] = v; return true; },
      });
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
  try { return fn(); } finally {
    if (prev === undefined) delete globalThis.document; else globalThis.document = prev;
  }
}

function camAt(pos, at, w, h) {
  const cam = new THREE.PerspectiveCamera(70, w / h, 0.1, 300);
  cam.position.set(...pos);
  cam.lookAt(...at);
  cam.updateMatrixWorld(true);
  return cam;
}

// Close in front of the camera, so the tag hits the cap.
function fitted(tag, w, h) {
  const cat = new THREE.Group();
  cat.scale.setScalar(0.85);
  cat.add(tag);
  const scene = new THREE.Scene();
  scene.add(cat);
  scene.updateMatrixWorld(true);
  const cam = camAt([0, 1.3, 1.6], [0, 1.2, 0], w, h);
  fitTagToView(tag, cam, w, h);
  const e = tag.matrixWorld.elements;
  const sy = Math.hypot(e[4], e[5], e[6]);
  const p = new THREE.Vector3().setFromMatrixPosition(tag.matrixWorld);
  const depth = -p.applyMatrix4(cam.matrixWorldInverse).z;
  const k = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * depth);
  const canvasH = tag.userData.tagCanvas.height;
  return { cssPerCanvasPx: (sy * k) / canvasH, h: sy * k, w: Math.hypot(e[0], e[1], e[2]) * k };
}

const SUBS = ['elder of StormClan', 'medicine cat of StormClan', 'apprentice of DuskClan', 'kit of GaleClan'];

describe('the rank line at the size cap', () => {
  for (const [w, h, where] of [[375, 812, 'phone'], [1280, 720, 'desktop']]) {
    for (const sub of SUBS) {
      it(`"${sub}" is at least ${13} CSS px on a ${where}`, () => withDoc(() => {
        const tag = makeNameTag('Thornfur', { sub });
        const f = fitted(tag, w, h);
        expect(tag.userData.subPx * f.cssPerCanvasPx).toBeGreaterThanOrEqual(SUB_PX_AT_CAP - 1e-6);
        // and the whole tag still fits across the screen
        expect(f.w).toBeLessThanOrEqual(w);
      }));
    }
    it(`a one-line tag is still capped at TAG_PX_MAX on a ${where}`, () => withDoc(() => {
      const tag = makeNameTag('Thornfur');
      const f = fitted(tag, w, h);
      expect(f.h).toBeCloseTo(TAG_PX_MAX, 3);
    }));
  }

  it('the rank line fits inside its pill at the size it is painted', () => withDoc(() => {
    for (const sub of SUBS) {
      const tag = makeNameTag('Thornfur', { sub });
      const width = 0.6 * sub.length * tag.userData.subPx;
      expect(width).toBeLessThanOrEqual(tag.userData.tagCanvas.width - 2 * 14);
    }
  }));
});
