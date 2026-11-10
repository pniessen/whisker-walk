import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { IOS_MODE } from '../vite.config.js';

// Builds the real bundles in memory (write: false) and reads what ships.
// The iOS app serves the game from its own bundle through a custom URL
// scheme, where a service worker can only fail and the game is offline
// already, so the app build must not register sw.js; the website build must
// keep doing so. The check is written inline in src/main.js rather than in a
// helper so the website bundle stays byte-for-byte what it was.
const root = fileURLToPath(new URL('..', import.meta.url));

// Vitest runs with NODE_ENV=test, which would make Vite build a non-PROD
// bundle (and drop the PROD-only service worker code from both builds, so
// nothing would be tested). npm run build runs with production; so must this.
async function shippedCode(mode) {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const out = await build({ root, mode, logLevel: 'silent', build: { write: false } });
    const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output);
    return outputs.filter((o) => o.type === 'chunk').map((o) => o.code).join('\n');
  } finally {
    process.env.NODE_ENV = saved;
  }
}

describe('service worker in the shipped bundles', () => {
  it('the website build registers sw.js', async () => {
    expect(await shippedCode('production')).toMatch(/serviceWorker\.register/);
  });

  it('the app build never registers a service worker', async () => {
    expect(await shippedCode(IOS_MODE)).not.toMatch(/serviceWorker\.register/);
  });
});
