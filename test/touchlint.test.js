import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// A1 (engineering review 3): nothing held touch targets at 44 px except the chat toggle.
// This reads the CSS (no browser) and lists every interactive selector whose declared
// size in touch mode (phone profile) is under 44 px, unless an invisible ::before/::after
// hit area covers it. Interactive = a button, select, summary, [role=button], .tui-btn,
// a label that wraps an input, or any class whose rule says cursor: pointer.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const MIN = 44;

// Reasons are required. Keys are the normalised selector (see subjectOf).
const ALLOWLIST = {
  // (none yet: every small one found was fixed or is in KNOWN)
};
// Found by the lint and not fixed; each is a to-do, not a decision. Remove a line when fixed.
const KNOWN = {
  '.settings-section input[type="range"]': 'height 22 (slider; the thumb is 22 px, the row around it is taller; needs a thumb redesign to grow)',
  '.hud-badge': 'height 24-28 (skill badge row, 3 px apart: a 44 px hit area would overlap its neighbours; fold into the +n pill)',
};
// Seen by eye, not by the lint: .dr-outfit-pic (30 px) sits inside the 48 px .dr-outfit-wear button and
// .dr-dusk-badge (32 px) is status with pointer-events: none, so neither is a target of its own.

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Flat list of { sel, body, media } with @media nesting resolved to its prelude text.
export function parseRules(css) {
  const out = [];
  const src = strip(css);
  let i = 0;
  function block(media) {
    while (i < src.length) {
      const open = src.indexOf('{', i);
      const close = src.indexOf('}', i);
      if (close !== -1 && (open === -1 || close < open)) { i = close + 1; return; }
      if (open === -1) { i = src.length; return; }
      const prelude = src.slice(i, open).trim();
      i = open + 1;
      if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
        block(prelude.startsWith('@media') ? `${media} ${prelude}`.trim() : media);
      } else if (prelude.startsWith('@')) { // @keyframes, @font-face: skip the block (one nested level)
        let depth = 1;
        while (i < src.length && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
      } else {
        const end = src.indexOf('}', i);
        out.push({ sel: prelude, body: src.slice(i, end), media });
        i = end + 1;
      }
    }
  }
  block('');
  return out;
}

const decls = (body) => Object.fromEntries(body.split(';').map((d) => {
  const k = d.indexOf(':');
  return k < 0 ? null : [d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim()];
}).filter(Boolean));

const px = (v) => { const m = /^(\d*\.?\d+)px$/.exec(v ?? ''); return m ? Number(m[1]) : null; };

const INTERACTIVE_TAG = /(^|[\s>+~])(button|select|summary)(?![\w-])|\[role=["']?button["']?\]|\.tui-btn(?![\w-])/;
// profiles this lint does not look at: TV (own sizes), mouse-only, non-touch, hover-only
const SKIP_SEL = /html\.tv|:not\(\.touch-mode\)|\.no-touch/;
const SKIP_MEDIA = /pointer:\s*fine|hover:\s*hover|min-width:\s*(9\d\d|[1-9]\d{3})px|print/;
// phone-profile classes that are NOT on: tablet or laptop only
const SKIP_PROFILE = /html\.(tablet|laptop|desktop)\b/;

// Strip the profile prefixes so html.phone .x and .x group together (later rule wins).
export function subjectOf(sel) {
  return sel.replace(/\s+/g, ' ').replace(/html\.phone\s*/g, '').replace(/body\.touch-mode(\.[\w-]+)*\s*/g, '').replace(/^\s+/, '').trim();
}

function isButtonLike(sel, d, wrapped) {
  return INTERACTIVE_TAG.test(sel) || /cursor:\s*pointer/.test(d) || wrapped.has(sel);
}

export function findSmall(cssTexts) {
  const rules = cssTexts.flatMap(parseRules);
  const hit = new Set(); // subjects with an invisible oversize ::before/::after
  const wrapped = new Set();
  for (const r of rules) {
    const d = decls(r.body);
    for (const one of r.sel.split(',')) {
      const m = /^(.*?)::?(before|after)\s*$/.exec(one.trim());
      if (m && d.position === 'absolute' && /inset|top|left/.test(r.body) && /-\d+px/.test(r.body)) hit.add(subjectOf(m[1]).replace(/:not\([^)]*\)/g, ''));
    }
  }
  // a subject is interactive if any rule for it says so (a later media rule may only set sizes)
  const interactive = new Set();
  for (const r of rules) for (const raw of r.sel.split(',').map((x) => x.trim())) {
    if (raw && !/::?(before|after)/.test(raw) && isButtonLike(raw, r.body, wrapped)) interactive.add(subjectOf(raw));
  }
  const last = new Map(); // subject -> { h, w, sel }
  for (const r of rules) {
    if (SKIP_MEDIA.test(r.media)) continue;
    const d = decls(r.body);
    if (d.display === 'none') continue;
    for (const raw of r.sel.split(',').map((s) => s.trim())) {
      if (!raw || SKIP_SEL.test(raw) || SKIP_PROFILE.test(raw) || /::?(before|after)/.test(raw)) continue;
      const key = subjectOf(raw);
      if (!interactive.has(key)) continue;
      const cur = last.get(key) ?? { h: null, w: null };
      const h = px(d['min-height'] ?? d.height), w = px(d['min-width'] ?? d.width);
      if (h != null) cur.h = h;
      if (w != null) cur.w = w;
      last.set(key, cur);
    }
  }
  const small = {};
  for (const [key, { h, w }] of last) {
    const base = key.replace(/:not\([^)]*\)/g, '');
    if (hit.has(base) || hit.has(key)) continue;
    const bad = [h != null && h < MIN && `height ${h}`, w != null && w < MIN && `width ${w}`].filter(Boolean);
    if (bad.length) small[key] = bad.join(', ');
  }
  return small;
}

describe('touch targets are at least 44 px in touch mode', () => {
  const small = findSmall([read('../src/style.css'), read('../src/tv/tv.css')]);

  it('the lint parses the real CSS (guard against it silently seeing nothing)', () => {
    expect(parseRules(read('../src/style.css')).length).toBeGreaterThan(1000);
  });

  it('flags a small button and passes one with a hit-area ::before (self-test)', () => {
    const t = '.a button{min-height:30px} .b{cursor:pointer;height:20px} .b::before{content:"";position:absolute;inset:-12px} select{min-height:44px}';
    expect(findSmall([t])).toEqual({ '.a button': 'height 30' });
  });

  it('no interactive selector is under 44 px unless allowed with a reason or listed as known', () => {
    for (const [k, why] of Object.entries(ALLOWLIST)) expect(why.length, k).toBeGreaterThan(8);
    const fresh = Object.keys(small).filter((k) => !(k in ALLOWLIST) && !(k in KNOWN));
    expect(fresh.map((k) => `${k}: ${small[k]}`)).toEqual([]);
  });

  it('allow-list and known entries are still needed (a fixed one must be removed)', () => {
    const stale = [...Object.keys(ALLOWLIST), ...Object.keys(KNOWN)].filter((k) => !(k in small));
    expect(stale).toEqual([]);
  });
});
