// Split screen, spike S0 (?split=1): two cameras drawn side by side into one canvas.
// Loaded only by main.js's import() behind the flag; nothing here runs in normal play.
//
// The maths (splitPlan) is pure and headless-testable. It works in DEVICE pixels first
// (so the two halves tile the buffer exactly, whatever the pixel ratio or an odd width)
// and hands three.js the CSS-pixel rectangles (three multiplies by the pixel ratio and
// rounds), which round-trip back to the same device pixels.
import { coop } from '../coopseam.js';

export const splitWanted = (search) => /[?&]split=1\b/.test(search);

/** The two halves of a w x h (CSS px) canvas at pixel ratio `dpr`. */
export function splitPlan(w, h, dpr = 1) {
  const bw = Math.max(2, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  const lw = Math.floor(bw / 2);
  const dev = [{ x: 0, y: 0, w: lw, h: bh }, { x: lw, y: 0, w: bw - lw, h: bh }];
  const css = dev.map((r) => ({ x: r.x / dpr, y: 0, w: r.w / dpr, h: bh / dpr }));
  return { dev, css, aspects: dev.map((r) => r.w / r.h) };
}

/**
 * createSplit({ renderer, camera, now }) -> { draw(session), hud, dispose() }.
 * draw returns true when it drew the frame (two cats out), false to let the normal path draw.
 */
export function createSplit({ renderer, camera, doc = typeof document !== 'undefined' ? document : null, now = () => performance.now() }) {
  const size = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };
  let el = null;
  let last = 0; let ema = 0; let shown = 0;
  let calls = 0; let tris = 0; let ms = 0;
  if (doc) {
    el = doc.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:9;font:11px monospace;color:#fff;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:4px;pointer-events:none';
    doc.body.appendChild(el);
  }

  function draw(session) {
    const cam2 = coop.second?.();
    if (!cam2 || !session?.scene) return false;
    const t0 = now();
    renderer.getSize(size);
    const dpr = renderer.getPixelRatio();
    const plan = splitPlan(size.x, size.y, dpr);
    // a perch climb is drawn as a jump on cat one (as composer.js renderFrame does)
    const o = session.drawOff;
    const pos = o && (o.x || o.y || o.z) ? session.cat?.position : null;
    if (pos) pos.set(pos.x + o.x, pos.y + o.y, pos.z + o.z);
    const mainAspect = camera.aspect;
    const info = renderer.info;
    const wasAuto = info.autoReset;
    info.autoReset = false; info.reset();
    cam2.fov = camera.fov; cam2.near = camera.near; cam2.far = camera.far;
    const cams = [camera, cam2];
    try {
      renderer.setScissorTest(true);
      for (let i = 0; i < 2; i++) {
        const r = plan.css[i];
        renderer.setViewport(r.x, r.y, r.w, r.h);
        renderer.setScissor(r.x, r.y, r.w, r.h);
        cams[i].aspect = plan.aspects[i];
        cams[i].updateProjectionMatrix();
        cams[i].updateMatrixWorld(true);
        renderer.render(session.scene, cams[i]);
      }
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.x, size.y);
      renderer.setScissor(0, 0, size.x, size.y);
      camera.aspect = mainAspect; camera.updateProjectionMatrix(); // the leash and the HUD read the full-screen aspect
      info.autoReset = wasAuto;
      if (pos) pos.set(pos.x - o.x, pos.y - o.y, pos.z - o.z);
    }
    calls = info.render.calls; tris = info.render.triangles;
    const t1 = now();
    ms = t1 - t0;
    if (last) ema = ema ? ema + (t1 - last - ema) * 0.1 : t1 - last;
    last = t1;
    if (el && t1 - shown > 500) {
      shown = t1;
      el.textContent = `split · frame ${ema.toFixed(1)} ms · cpu draw ${ms.toFixed(1)} ms · ${calls} draws · ${tris.toLocaleString('en-US')} tris (both views)`;
    }
    return true;
  }
  return { draw, stats: () => ({ frameMs: ema, drawMs: ms, calls, tris }), dispose() { el?.remove(); } };
}
