// Asks the browser, once per page load, to keep this site's storage (the
// save) when the device runs short of space. Optional hardening: it never
// rejects, never logs and never raises a failure note, because a browser that
// says no or does not know the call leaves the game exactly as it was.
//
// Resolves true (kept), false (declined), or null (not asked, or not
// possible). No DOM and no THREE here; the navigator comes in as a parameter.

let asked = null;

async function ask(nav) {
  const storage = nav?.storage;
  if (!storage || typeof storage.persist !== 'function') return null;
  if (typeof storage.persisted === 'function' && (await storage.persisted()) === true) return true;
  // Firefox answers persist() with a permission prompt, which a child should
  // not meet out of nowhere; Chrome decides silently either way. Safari does
  // not know the permission name and throws, so it goes straight to persist().
  if (typeof nav.permissions?.query === 'function') {
    let state = null;
    try {
      state = (await nav.permissions.query({ name: 'persistent-storage' }))?.state ?? null;
    } catch {
      state = null;
    }
    if (state === 'prompt' || state === 'denied') return null;
  }
  const kept = await storage.persist();
  return typeof kept === 'boolean' ? kept : null;
}

export function askToKeepSaves(nav = globalThis.navigator) {
  if (!asked) asked = ask(nav).catch(() => null);
  return asked;
}
