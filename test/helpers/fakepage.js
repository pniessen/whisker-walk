// A small stand-in document for chunk code that makes a canvas or an overlay
// headless (no jsdom in this project): elements keep their style, children and
// parent, and a canvas's 2D context records what is painted on it.
export function fakeContext(log = []) {
  const ctx = {};
  return new Proxy(ctx, {
    get: (t, key) => {
      if (key in t) return t[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return (...args) => {
          const stops = [];
          log.push({ call: key, args, stops });
          return { addColorStop: (o, c) => stops.push([o, c]) };
        };
      }
      return (...args) => { log.push({ call: key, args, fillStyle: t.fillStyle, strokeStyle: t.strokeStyle }); };
    },
    set: (t, key, v) => { t[key] = v; log.push({ set: key, value: v }); return true; },
  });
}

export function fakePage() {
  const painted = [];
  function element(tag) {
    const el = {
      tagName: tag.toUpperCase(), style: {}, children: [], parentNode: null,
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      insertBefore(c, ref) {
        c.parentNode = el;
        const i = ref ? el.children.indexOf(ref) : -1;
        if (i < 0) el.children.push(c);
        else el.children.splice(i, 0, c);
        return c;
      },
      removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; return c; },
      remove() { el.parentNode?.removeChild(el); },
      setAttribute(k, v) { el[`attr:${k}`] = String(v); },
      get nextSibling() {
        const kids = el.parentNode?.children ?? [];
        return kids[kids.indexOf(el) + 1] ?? null;
      },
    };
    if (tag === 'canvas') {
      el.width = 300;
      el.height = 150;
      el.getContext = (kind) => (kind === '2d' ? fakeContext(painted) : null);
    }
    return el;
  }
  const body = element('body');
  return { body, painted, createElement: element, getElementById: () => null };
}
