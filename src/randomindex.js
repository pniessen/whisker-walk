// The one unbiased "pick a number below n" and its random source, shared by the old code
// maker (savecode.js) and the cat code maker (catcodes.js). Both are lazy chunks; this is
// the little file they have in common.

// randomIndex(n, nextUint32) -> an integer in [0, n), with no modulo bias.
// A plain `x % n` over 2^32 values favours the low results whenever n does
// not divide 2^32 (it doesn't for the 100 two-digit suffixes), so draws at or
// above the largest multiple of n are thrown away and redrawn. For n = 256 or
// 1,024 nothing is ever rejected; for n = 100 the chance is 96 in 2^32. The try cap
// only matters for a broken source that never returns a usable value.
export function randomIndex(n, nextUint32) {
  const limit = Math.floor(2 ** 32 / n) * n;
  let x = nextUint32();
  for (let tries = 1; x >= limit && tries < 64; tries++) x = nextUint32();
  return x % n;
}

// nextUint32 source for codes: the platform CSPRNG. getRandomValues has
// been in every browser since 2013 (WKWebView included, and unlike
// randomUUID it doesn't need a secure context) and in Node since 15/19, so
// the Math.random fallback only runs where `crypto` is missing entirely.
export function uint32Source(cryptoLike) {
  if (cryptoLike && typeof cryptoLike.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    return () => { cryptoLike.getRandomValues(buf); return buf[0]; };
  }
  return () => Math.floor(Math.random() * 2 ** 32);
}
