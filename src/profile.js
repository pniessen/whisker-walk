// The layout profile: phone | tablet | laptop | tv. Not the hardware tier (render/deviceprofile.js).
// One writer for html.<profile> (html.tv stays the TV class) and body.touch-mode. No imports.
export const PROFILES = ['phone', 'tablet', 'laptop', 'tv'];
const has = (v) => PROFILES.includes(v);

// First match wins. tv = ?tv=1 or saved tvMode, noTv = ?tv=0, tvOn = the tv chunk is running.
export function profileFor({ query, tv, noTv, tvOn, override, coarse, points, side }) {
  if (has(query)) return query;
  if (tvOn || (tv && !noTv)) return 'tv';
  if (has(override) && !(noTv && override === 'tv')) return override;
  if (coarse || points > 0) return side < 600 ? (coarse ? 'phone' : 'laptop') : 'tablet';
  return 'laptop';
}

let cur = 'laptop', env = null, tvOn = false, touched = false, timer = 0;
const ls = new Set();
export const getProfile = () => cur;
export const onProfile = (fn) => (ls.add(fn), () => ls.delete(fn));

function decide() {
  const { win, getOverride } = env;
  const q = new URLSearchParams(win.location?.search || '');
  const coarse = touched || !!win.matchMedia?.('(pointer: coarse)').matches;
  return profileFor({
    query: q.get('profile'), noTv: q.get('tv') === '0', tvOn, override: getOverride?.(), coarse,
    points: win.navigator?.maxTouchPoints || 0, side: Math.min(win.innerWidth, win.innerHeight),
  });
}

function apply(p) {
  if (p === cur && env.done) return;
  env.done = true;
  cur = p;
  const c = env.doc.documentElement?.classList;
  if (c) for (const n of PROFILES) c.toggle(n, n === p);
  ls.forEach((f) => { try { f(p); } catch { /* one listener must not stop the rest */ } });
}

function onResize() {
  if (timer || decide() === cur) return;
  timer = setTimeout(() => { timer = 0; apply(decide()); }, 300); // a keyboard opening or a turn is not a change
}

export function startProfile(win, doc, getOverride) {
  stopProfile();
  env = { win, doc, getOverride };
  if (win.matchMedia?.('(pointer: coarse)').matches) doc.body?.classList.add('touch-mode');
  apply(decide());
  win.addEventListener('resize', onResize);
  win.addEventListener('orientationchange', onResize);
}

export function stopProfile() {
  if (!env) return;
  env.win.removeEventListener('resize', onResize);
  env.win.removeEventListener('orientationchange', onResize);
  clearTimeout(timer);
  timer = 0; env = null; tvOn = false; touched = false; cur = 'laptop'; ls.clear();
}

export function refreshProfile() { if (env) apply(decide()); }

/** The tv chunk starts and stops here. Before the profile starts it only toggles html.tv on `doc`. */
export function forceTv(on, doc) {
  tvOn = on;
  if (env) refreshProfile(); else doc?.documentElement.classList[on ? 'add' : 'remove']('tv');
}

/** A real touch was seen: touch-mode on, and coarse stays sticky. */
export function markTouch() {
  touched = true;
  env?.doc.body?.classList.add('touch-mode');
  refreshProfile();
}
