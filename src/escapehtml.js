// The one HTML escaper. Dependency-free and DOM-free so pure modules (and
// node-environment tests) can import it; game/util.js re-exports it.
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
