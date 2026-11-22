// The walk's key strip is for the first minute of a walk: after that the child knows
// the buttons and the strip is clutter (owner photos, 2026-11-22). A walk starts when
// the HUD is shown (hud.show()); a minute later body gets .tv-strip-off, which
// tv.css fades out. A new walk brings the strip back.

export const STRIP_FADE_MS = 60000;

/** Watches #hud; returns { stop() } that puts everything back. */
export function watchStrip(doc, win, ms = STRIP_FADE_MS) {
  const hud = doc.getElementById?.('hud');
  const body = doc.body;
  if (!hud || !body || typeof win.MutationObserver !== 'function') return { stop() {} };
  let timer = null;
  let shown = !hud.classList.contains('hidden');
  const arm = () => {
    if (timer != null) win.clearTimeout(timer);
    body.classList.remove('tv-strip-off');
    timer = shown ? win.setTimeout(() => { timer = null; body.classList.add('tv-strip-off'); }, ms) : null;
  };
  const obs = new win.MutationObserver(() => {
    const now = !hud.classList.contains('hidden');
    if (now === shown) return;
    shown = now;
    arm();
  });
  obs.observe(hud, { attributes: true, attributeFilter: ['class'] });
  arm();
  return {
    stop() {
      obs.disconnect();
      if (timer != null) win.clearTimeout(timer);
      body.classList.remove('tv-strip-off');
    },
  };
}
