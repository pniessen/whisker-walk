import { vi } from 'vitest';

// `load` is the caller's own `() => import('../src/x.js')` (a relative path resolves against the caller).
// Loads a module as the private family build sees it: __PRIVATE_FAMILY__ true while the module
// graph is imported, then put back to false. Modules read the flag when they are evaluated (a
// constant such as SAVE_KEY) or when called, so the import is fresh (resetModules) and the flag
// stays true for `during`, which runs the test body that needs the family build.
export async function importAsFamily(load, during = async () => {}) {
  vi.resetModules();
  vi.stubGlobal('__PRIVATE_FAMILY__', true);
  try {
    const mod = await load();
    await during(mod);
    return mod;
  } finally {
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}
