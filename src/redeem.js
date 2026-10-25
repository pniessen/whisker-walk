// Redeem codes: pure normalise + hash helpers (v21 §10.4).
// DOM-free; its only import is the plain-data code table. Only hashes of codes
// are ever stored or compared.
import { REDEEM_CODES } from './redeemcodes.js';

export const REDEEM_SALT = 'whisker-walk-redeem-v1';
export const REDEEM_ITERATIONS = 100000;

// Forgiving typing: case, spaces, dashes and other punctuation do not matter,
// and look-alike letters fold to digits (O->0, I->1, L->1).
export function normalizeCode(input) {
  if (typeof input !== 'string') return '';
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

// PBKDF2-SHA256 of the normalised code -> 64 lowercase hex chars.
// Pass null to simulate a page with no crypto.subtle.
export async function hashCode(normalized, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('crypto.subtle is not available here');
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(String(normalized)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(REDEEM_SALT), iterations: REDEEM_ITERATIONS },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// The redeemer: normalise -> hash -> look up -> redeemCode, with a gentle
// guessing rate limit. DOM-free. The rest state lives in its own localStorage
// key (never in the save, so it never syncs).
// ---------------------------------------------------------------------------
export const REST_KEY = 'whisker-walk-redeem-rest';
export const FREE_MISSES = 3;
export const FIRST_REST_MS = 30000;
export const MAX_REST_MS = 300000;
export const FORGIVE_MS = 600000;

export function createRedeemer({ progression, codes = REDEEM_CODES, hash = hashCode, now = Date.now, storage } = {}) {
  const store = () => {
    try {
      return storage === undefined ? globalThis.localStorage : storage;
    } catch {
      return null;
    }
  };

  const readRest = () => {
    const fresh = { misses: 0, until: 0, last: 0 };
    try {
      const raw = store()?.getItem(REST_KEY);
      if (!raw) return fresh;
      const v = JSON.parse(raw);
      if (!v || typeof v !== 'object') return fresh;
      const num = (x) => (Number.isFinite(x) && x >= 0 ? x : 0);
      let until = num(v.until);
      if (until > now() + MAX_REST_MS) until = 0; // future-dated by years: junk
      return { misses: Math.min(Math.floor(num(v.misses)), 1000), until, last: num(v.last) };
    } catch {
      return fresh;
    }
  };
  const writeRest = (s) => {
    try {
      store()?.setItem(REST_KEY, JSON.stringify(s));
    } catch {
      /* private mode etc.: the limit just does not persist */
    }
  };

  const cooldownLeft = () => {
    const ms = readRest().until - now();
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  };

  const countMiss = () => {
    const t = now();
    const s = readRest();
    if (s.last && t - s.last >= FORGIVE_MS) s.misses = 0;
    s.misses += 1;
    s.last = t;
    if (s.misses >= FREE_MISSES) {
      s.until = t + Math.min(MAX_REST_MS, FIRST_REST_MS * 2 ** (s.misses - FREE_MISSES));
    }
    writeRest(s);
  };

  const run = async (input) => {
    const left = cooldownLeft();
    if (left > 0) return { kind: 'resting', seconds: left };
    const normalized = normalizeCode(input);
    if (!normalized) return { kind: 'empty' };
    let h;
    try {
      h = await hash(normalized);
    } catch {
      return { kind: 'unsupported' };
    }
    if (typeof h !== 'string' || !Object.hasOwn(codes, h)) {
      countMiss();
      return { kind: 'unknown' };
    }
    const res = progression.redeemCode(h, codes[h]);
    if (res.ok) {
      writeRest({ misses: 0, until: 0, last: 0 });
      return { kind: 'gift', items: res.items, points: res.points };
    }
    return res.reason === 'used' ? { kind: 'used' } : { kind: 'unknown' };
  };

  let pending = null;
  const redeem = (input) => {
    if (pending) return pending;
    pending = run(input).finally(() => {
      pending = null;
    });
    return pending;
  };

  return { redeem, cooldownLeft, busy: () => pending !== null };
}

// ---------------------------------------------------------------------------
// Kid-facing copy and markup. Pure and DOM-free (unit-tested); homebase.js
// only wires it. escapeHtml is duplicated, not imported, for the same reason
// as in ui/hometabs.js: importing homebase.js would pull in the DOM.
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function joinNice(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

// Breed cats are things ("the Black Cat"); named cats are people (Hagrid).
const BREED_IDS = new Set(['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon']);

export function redeemMessage(result, catalog) {
  if (!result || typeof result !== 'object') return '';
  switch (result.kind) {
    case 'gift': {
      const items = Array.isArray(result.items) ? result.items : [];
      const nameOf = (it) => {
        const name = catalog?.[it.kind]?.[it.id]?.name ?? it.name ?? it.id;
        // Named cats and areas ("The Old Docks", "City Park") read as names.
        if (it.kind === 'areas' || (it.kind === 'cats' && !BREED_IDS.has(it.id))) return String(name);
        return `the ${name}`;
      };
      const fresh = items.filter((it) => !it.owned).map(nameOf);
      const owned = items.filter((it) => it.owned);
      const refunds = owned.reduce((n, it) => n + (Number(it.refund) || 0), 0);
      const giftPoints = Math.max(0, (Number(result.points) || 0) - refunds);
      const parts = [];
      if (giftPoints > 0) parts.push(`${giftPoints} 🐾`);
      parts.push(...fresh);
      for (const it of owned) {
        const back = Number(it.refund) || 0;
        parts.push(back > 0 ? `${back} 🐾 for ${nameOf(it)} you already had` : `${nameOf(it)} you already had`);
      }
      if (!parts.length) return '🎉 You opened it! There was nothing new inside this time — but thanks for trying it! 💛';
      return `🎉 Surprise! You got ${joinNice(parts)}!`;
    }
    case 'used': return 'You already opened this one — it’s safe in your collection. 💛';
    case 'unknown': return 'Hmm, that code isn’t one we know. Check the letters and try again! 🐾';
    case 'empty': return 'Type your code in the box first. 😺';
    case 'resting': {
      const n = Math.max(1, Math.ceil(Number(result.seconds) || 1));
      return `The code box is taking a little catnap. Try again in ${n} ${n === 1 ? 'second' : 'seconds'}. 😴`;
    }
    case 'unsupported': return 'Codes can’t be opened on this page. Ask a grown-up to open the game the usual way. 🐾';
    default: return '';
  }
}

export function renderRedeemHtml({ text, busy, result, catalog }) {
  const msg = redeemMessage(result, catalog);
  const dis = busy ? ' disabled' : '';
  return `
    <section class="redeem-section"><h2>🎁 Got a secret code?</h2>
      <form class="redeem-form">
        <input id="redeem-input" class="redeem-input" type="text" value="${escapeHtml(text)}" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" aria-label="Secret code"${dis}>
        <button type="submit" class="redeem-btn"${dis}>${busy ? 'Opening…' : 'Open it!'}</button>
      </form>
      <p class="redeem-msg" aria-live="polite">${escapeHtml(msg)}</p>
    </section>`;
}
