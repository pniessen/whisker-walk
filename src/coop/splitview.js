// Split screen, spike S0 (?split=1): two cameras drawn side by side into one canvas.
// Loaded only by main.js's import() behind the flag; nothing here runs in normal play.
//
// The maths (splitPlan) is pure and headless-testable. It works in DEVICE pixels first
// (so the two halves tile the buffer exactly, whatever the pixel ratio or an odd width)
// and hands three.js the CSS-pixel rectangles (three multiplies by the pixel ratio and
// rounds), which round-trip back to the same device pixels.
import { coop } from '../coopseam.js';
import { createSplitRule, viewRects } from './splitrule.js';

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
 * draw returns true when it drew the frame (two cats out and the dynamic rule, src/coop/splitrule.js,
 * says split or mid-slide), false to let the normal path draw (one cat, or the cats share one picture).
 * active() is what coop.frame asks (via ctx.split): true while each cat must keep its own camera.
 * The divider is a thin DOM strip (a 2 px dark line with soft edges, pointer-events none) rather than a
 * clear-colour gap: the two views tile the buffer exactly, nothing is lost, and it costs no draw.
 */
export function createSplit({ renderer, camera, doc = typeof document !== 'undefined' ? document : null, now = () => performance.now() }) {
  const size = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };
  let el = null;
  let last = 0; let ema = 0; let shown = 0;
  let calls = 0; let tris = 0; let ms = 0;
  const rule = createSplitRule();
  let res = { mode: 'shared', t: 0, dividerX: 1, reason: 'start', active: false };
  let lastRule = -1;
  let divider = null;
  if (doc) {
    divider = doc.createElement('div');
    divider.style.cssText = 'position:fixed;top:0;bottom:0;width:6px;margin-left:-3px;z-index:8;pointer-events:none;display:none;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.75) 35%,rgba(0,0,0,.75) 65%,rgba(0,0,0,0))';
    doc.body.appendChild(divider);
    el = doc.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:9;font:11px monospace;color:#fff;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:4px;pointer-events:none';
    doc.body.appendChild(el);
  }

  // S3: the HUD for each half (src/coop/splithud.js), a lazy chunk fetched the first time the split picture is up.
  let sh = null; let shLoad = false;
  function hudStep(session, cam2) {
    if (!sh) {
      if (res.active && !shLoad && doc) { shLoad = true; import('./splithud.js').then((m) => { sh = m.createSplitHud({ doc }); }).catch(() => {}); }
      return;
    }
    sh.update(res, { session, cam2, camera, pos2: coop.secondPos?.() });
  }

  function readout(t1) {
    if (el && t1 - shown > 500) {
      shown = t1;
      const g = coop.splitInfo;
      el.textContent = `split ${res.mode} · gap ${g ? g.gap.toFixed(1) : '-'} m · t ${res.t.toFixed(2)} · ${res.reason} · frame ${ema.toFixed(1)} ms · cpu draw ${ms.toFixed(1)} ms · ${calls} draws · ${tris.toLocaleString('en-US')} tris`;
    }
  }

  function draw(session) {
    const cam2 = coop.second?.();
    const info0 = coop.splitInfo;
    if (!cam2 || !info0 || !session?.scene) {
      if (res.active) { rule.reset(); res = { mode: 'shared', t: 0, dividerX: 1, reason: 'start', active: false }; }
      sh?.update(res);
      if (divider) divider.style.display = 'none';
      return false;
    }
    const t0 = now();
    const dtRule = lastRule >= 0 ? Math.min(0.25, (t0 - lastRule) / 1000) : 0;
    lastRule = t0;
    res = rule.step({ ...info0, reducedMotion: !!session.reducedMotion, dt: dtRule, nowMs: t0 });
    hudStep(session, cam2);
    if (!res.active) { if (divider) divider.style.display = 'none'; readout(t0); return false; }
    renderer.getSize(size);
    const dpr = renderer.getPixelRatio();
    const plan = res.t >= 1 ? splitPlan(size.x, size.y, dpr) : viewRects(size.x, size.y, dpr, res.dividerX);
    if (divider) {
      divider.style.display = plan.css[1] ? 'block' : 'none';
      if (plan.css[1]) divider.style.left = `${plan.css[1].x}px`;
    }
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
      for (let i = 0; i < plan.css.length; i++) {
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
    readout(t1);
    return true;
  }
  return { draw, active: () => res.active, state: () => res, stats: () => ({ frameMs: ema, drawMs: ms, calls, tris }), dispose() { sh?.dispose(); el?.remove(); divider?.remove(); } };
}
