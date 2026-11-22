// UI scale and safe margins for TV mode. The CSS (tv.css, fonts.css) does the
// drawing; this sets the three variables it reads and hides the mouse cursor
// once it has been still for a moment (a stray pointer on a TV is just noise).

/** 1 up to a 1920 px window, 2 at 3840 and beyond; a laptop is never shrunk below 1. */
export function uiScale(innerWidth) {
  const n = Number(innerWidth);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(2, Math.max(1, n / 1920));
}

export const IDLE_CURSOR_MS = 2000;

/** Sets --tv-s, --tv-safe-x and --tv-safe-y on <html> and keeps --tv-s current; returns { destroy }. */
export function applyScale(doc, win) {
  const root = doc.documentElement;
  const set = () => {
    root.style.setProperty('--tv-s', String(Math.round(uiScale(win.innerWidth) * 1000) / 1000));
    root.style.setProperty('--tv-safe-x', '5vw');
    root.style.setProperty('--tv-safe-y', '5vh');
  };
  set();
  let queued = false;
  const onResize = () => {
    if (queued) return;
    queued = true;
    const run = () => { queued = false; set(); };
    if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(run); else run();
  };
  win.addEventListener('resize', onResize);

  // The cursor goes after 2 s without a move and comes back with the next one.
  const body = doc.body;
  let timer = null;
  const hide = () => { timer = null; body?.classList?.add('tv-idle'); };
  const onMove = () => {
    body?.classList?.remove('tv-idle');
    if (timer != null) win.clearTimeout(timer);
    timer = win.setTimeout(hide, IDLE_CURSOR_MS);
  };
  win.addEventListener('pointermove', onMove);
  timer = win.setTimeout(hide, IDLE_CURSOR_MS);

  return {
    destroy() {
      win.removeEventListener('resize', onResize);
      win.removeEventListener('pointermove', onMove);
      if (timer != null) win.clearTimeout(timer);
      for (const k of ['--tv-s', '--tv-safe-x', '--tv-safe-y']) root.style.removeProperty(k);
      body?.classList?.remove('tv-idle');
    },
  };
}
