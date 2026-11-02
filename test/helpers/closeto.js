// Deep compare that forgives last-digit float rounding. Macs (arm64) and
// GitHub's Linux runners (x64) can round the last bit of a double differently,
// so a trace recorded on one shows 1.2618273425350666 and the other
// 1.2618273425350663. Numbers, and strings that are numbers, match within
// tol (relative, never below tol absolute); whole numbers (counts, fingerprint
// hashes) and everything else must be equal.
// Returns the paths that differ (empty when they match).
export function closeDiffs(a, b, tol = 1e-9, path = '$', out = []) {
  if (out.length >= 20) return out;
  const num = (v) => (typeof v === 'number' ? v
    : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
  const na = num(a), nb = num(b);
  if (na !== null && nb !== null) {
    const whole = Number.isInteger(na) && Number.isInteger(nb); // counts and fingerprints: exact
    if (na !== nb && (whole || !(Math.abs(na - nb) <= tol * Math.max(1, Math.abs(na), Math.abs(nb))))) {
      out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }
    return out;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (a !== b) out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return out;
  }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(`${path}: array vs object`); return out; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!(k in a) || !(k in b)) { out.push(`${path}.${k}: missing on one side`); continue; }
    closeDiffs(a[k], b[k], tol, `${path}.${k}`, out);
  }
  return out;
}
