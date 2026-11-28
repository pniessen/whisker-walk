// A panel that scrolls on a TV gives no hint that more is below (owner photos, 2026-11-27:
// the Dress up grid was cut mid-row). This puts .tv-more on each .dr-wearing that has
// rows below the fold; tv.css draws a fade and an arrow for it. It watches scrolls and
// changes to the page, and checks once per frame at most.

const SEL = '.dr-wearing';

/** Returns { stop() } that removes the listeners and every .tv-more it set. */
export function watchScrollCue(doc, win) {
  if (!doc?.body || typeof win?.requestAnimationFrame !== 'function') return { stop() {} };
  let queued = false;
  const check = () => {
    queued = false;
    for (const el of doc.querySelectorAll(SEL)) {
      const more = el.scrollHeight - el.scrollTop - el.clientHeight > 24;
      if (el.classList.contains('tv-more') !== more) el.classList.toggle('tv-more', more);
    }
  };
  const soon = () => { if (!queued) { queued = true; win.requestAnimationFrame(check); } };
  doc.addEventListener('scroll', soon, true);
  win.addEventListener('resize', soon);
  const obs = typeof win.MutationObserver === 'function' ? new win.MutationObserver(soon) : null;
  obs?.observe(doc.body, { childList: true, subtree: true });
  soon();
  return {
    stop() {
      doc.removeEventListener('scroll', soon, true);
      win.removeEventListener('resize', soon);
      obs?.disconnect();
      for (const el of doc.querySelectorAll(SEL)) el.classList.remove('tv-more');
    },
  };
}
