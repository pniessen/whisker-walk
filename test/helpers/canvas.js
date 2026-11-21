import { vi } from 'vitest';

// The headless document the world tests share. The only DOM the builders touch
// is document.createElement('canvas'), for billboard and surface-tile textures.
//
// A blanket no-op Proxy is enough for most of a canvas context, but two calls
// need a real answer rather than undefined:
//   * createLinear/RadialGradient: the painters add colour stops to whatever
//     comes back;
//   * getImageData: every tile ends with a getImageData/putImageData readback
//     (clampToFloor, the pass that guarantees no texel falls below the
//     luminance floor). clampToFloor guards the headless path by asking
//     whether getImageData is a function, which a blanket Proxy always
//     answers yes to.
// A zeroed buffer is the truthful answer: nothing was ever rasterised into
// this canvas.
//
// Options:
//   measureText: a number makes measureText() return { width: <number> };
//     left out, it is a plain no-op like every other method.
//   pointerLock: true adds addEventListener, pointerLockElement (null) and
//     exitPointerLock, for the files that load the camera or controls.
export function canvasDocument({ measureText, pointerLock } = {}) {
  const context = () => new Proxy({}, {
    get: (_target, key) => {
      if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      if (key === 'measureText' && measureText !== undefined) return () => ({ width: measureText });
      return () => {};
    },
    set: () => true,
  });
  const doc = { createElement: () => ({ width: 0, height: 0, getContext: context }) };
  if (pointerLock) {
    doc.addEventListener = () => {};
    doc.pointerLockElement = null;
    doc.exitPointerLock = () => {};
  }
  return doc;
}

export function stubCanvasDocument(opts) {
  const doc = canvasDocument(opts);
  vi.stubGlobal('document', doc);
  return doc;
}
