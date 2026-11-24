// A minimal page for the Moon's telescope overlay (the tests run in node): elements that remember their children and listeners, a canvas whose
// 2D context swallows every call, a window that dispatches events to what was added (capture or not, in the order added).
export function fakePage({ width = 960, height = 540 } = {}) {
  const ctx = new Proxy({}, {
    get: (t, k) => {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k in t) return t[k];
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const make = (tag) => {
    const el = {
      tag, style: {}, children: [], listeners: {}, attrs: {}, parent: null, removed: false, textContent: '', width: 0, height: 0,
      appendChild(c) { this.children.push(c); c.parent = this; return c; },
      remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(type, f, cap) { (this.listeners[type] ||= []).push({ f, cap: !!cap }); },
      removeEventListener(type, f) { this.listeners[type] = (this.listeners[type] ?? []).filter((x) => x.f !== f); },
      getContext() { return ctx; },
      setPointerCapture() {},
      fire(type, ev = {}) { const e = { type, stopped: false, prevented: false, stopImmediatePropagation() { this.stopped = true; }, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; }, ...ev }; for (const l of [...(this.listeners[type] ?? [])]) { l.f(e); if (e.stopped) break; } return e; },
      count() { return Object.values(this.listeners).reduce((n, a) => n + a.length, 0); },
    };
    return el;
  };
  const body = make('body');
  const doc = { body, createElement: make, pointerLockElement: null };
  const win = Object.assign(make('window'), { innerWidth: width, innerHeight: height, devicePixelRatio: 1 });
  return { doc, win, ctx, make };
}
