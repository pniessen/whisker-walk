// Pure helpers for slow machines: which timeout applies, window size, a bounded log of
// console lines, and a readable form of Performance.getMetrics.
export const BOOT_EVAL_TIMEOUT_MS = 120e3;
const BOOT_PHASES = new Set(['boot', 'loading', 'home']);

// A page that is still starting (or loading a place) gets the long wait.
export function evalTimeoutFor(phase, evalTimeoutMs) {
  return phase === undefined || BOOT_PHASES.has(phase) ? Math.max(BOOT_EVAL_TIMEOUT_MS, evalTimeoutMs) : evalTimeoutMs;
}

export function parseSize(text) {
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(String(text));
  if (!m) throw new Error(`--size is WxH, such as 1280x720, not "${text}"`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

// The last `max` lines, oldest first.
export function createRing(max = 30) {
  const items = [];
  return { push(x) { items.push(x); if (items.length > max) items.shift(); }, list: () => items.slice() };
}

export function consoleLine(p) {
  return `${p.type}: ${(p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300);
}
export function logLine(entry) {
  return `${entry.level}: ${entry.text}${entry.url ? ` (${String(entry.url).split('/').pop()}:${entry.lineNumber ?? 0})` : ''}`.slice(0, 300);
}

// Performance.getMetrics gives [{name, value}]; keep the few that say where the time went.
const KEEP = ['Timestamp', 'JSHeapUsedSize', 'JSHeapTotalSize', 'TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'Nodes', 'Documents', 'LayoutCount'];
export function formatMetrics(list) {
  const out = {};
  for (const m of list ?? []) if (KEEP.includes(m.name)) out[m.name] = Math.round(m.value * 1000) / 1000;
  return out;
}

// SwiftShader / llvmpipe / software means no real GPU.
export function isSoftwareGl(renderer) {
  return /swiftshader|llvmpipe|software|softpipe/i.test(String(renderer ?? ''));
}
